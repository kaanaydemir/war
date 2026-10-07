import Phaser from 'phaser';
import type { RenderContext } from '../../core/feature';
import type { LightHandle } from '../../core/fx';
import { hash2 } from '../../core/rng';
import type { GameState, SectionId } from '../../core/state';
import { landmarkTile } from '../../data/landmarks';
import { windVector } from '../atmosphere/api';
import { rawBreach } from './api';
import { LINES, outwardAt, TOWERS, type TowerSpec } from './geom';
import type { WallsRender } from './renderWalls';
import { cityFallen } from './sim';
import { BANNER_H, BANNER_W, type BannerKind } from './sprites';
import { bandFor, lineWorld, type PieceDef } from './wallArt';

/**
 * Life on the walls: defenders pacing the wall-walks and loosing arrows at
 * Ottoman troops in range, banners on the towers (Palaiologan, Venetian, Genoese
 * — Ottoman once the city falls), torches & braziers at night, stockades of
 * timber, barrels and sacks plugging the breaches, and repair crews at work.
 */

type DefKind = 'mizrak' | 'mizrak2' | 'okcu' | 'okcu2' | 'ceneviz' | 'venedik';

interface Defender {
  spr: Phaser.GameObjects.Sprite;
  piece: PieceDef;
  kind: DefKind;
  t: number;
  t0: number;
  t1: number;
  n: number;
  z: number;
  dir: number;
  /** 0 idle · 1 walking */
  mode: number;
  timer: number;
  shootCd: number;
  faceFlip: boolean;
  onTower: boolean;
}

interface Flag {
  spr: Phaser.GameObjects.Sprite;
  tower: TowerSpec;
  piece: PieceDef | null;
  kind: string;
  x: number;
  y: number;
}

interface Torch {
  spr: Phaser.GameObjects.Sprite;
  x: number;
  y: number;
  light: LightHandle | null;
  brazier: boolean;
  sec: SectionId | null;
}

interface Prop {
  img: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;
  x: number;
  y: number;
}

const ARCHERS: DefKind[] = ['okcu', 'okcu2', 'ceneviz'];

function defKindFor(sec: SectionId, k: number): DefKind {
  const r = hash2(k, sec.length, 41);
  if (sec === 'kara-lykos' || sec === 'kara-topkapi') return r < 0.45 ? 'ceneviz' : r < 0.7 ? 'mizrak' : 'okcu';
  if (sec === 'kara-blahernai') return r < 0.55 ? 'venedik' : r < 0.8 ? 'okcu2' : 'mizrak2';
  return r < 0.35 ? 'okcu' : r < 0.5 ? 'okcu2' : r < 0.78 ? 'mizrak' : 'mizrak2';
}

function bannerFor(tw: TowerSpec, fallen: boolean, k: number): BannerKind {
  if (fallen && tw.line !== 'galata') return (['osmanli', 'osmanli', 'osmanliBeyaz', 'osmanliYesil'] as BannerKind[])[k % 4];
  if (tw.line === 'galata') return 'ceneviz';
  const sec = tw.sectionId;
  if (sec === 'kara-blahernai') return k % 3 === 0 ? 'bizans' : 'venedik';
  if (sec === 'kara-lykos' || sec === 'kara-topkapi') return k % 2 === 0 ? 'ceneviz' : 'bizans';
  return k % 2 === 0 ? 'bizans' : 'bizans2';
}

export class LifeRender {
  private defenders: Defender[] = [];
  private flags: Flag[] = [];
  private torches: Torch[] = [];
  private props: Prop[] = [];
  private workers: Phaser.GameObjects.Sprite[] = [];
  private sig = '';
  private propSig = '';
  private acc = 10;
  private t = 0;
  private fallen = false;
  private lightsOn = 0;

  constructor(
    private rc: RenderContext,
    private walls: WallsRender,
  ) {}

  /** tower top in world px (z above the piece base) */
  private towerTop(tw: TowerSpec): { x: number; y: number; piece: PieceDef | null } {
    const piece = this.walls.pieces.find((p) => p.def.line === tw.line && p.def.towers.includes(tw))?.def ?? null;
    const band = bandFor(tw.line, 'ic', tw.t);
    const base = piece?.base ?? 0;
    let H = band.towerH;
    if (tw.kind === 'buyuk') H += 4;
    if (tw.kind === 'kapi') H += 3;
    if (tw.kind === 'mermer') H = 32;
    const n = tw.line === 'kara' ? -0.06 : tw.line === 'deniz' ? 0.03 : 0;
    const p = lineWorld(LINES[tw.line], tw.t, n, base + H);
    return { x: p.x, y: p.y, piece };
  }

  private rebuildFlagsTorches(state: GameState): void {
    for (const f of this.flags) f.spr.destroy();
    for (const t of this.torches) {
      t.spr.destroy();
      t.light?.destroy();
    }
    this.flags = [];
    this.torches = [];
    const scene = this.rc.scene;
    const fallen = cityFallen(state);
    const sancak = !!state.flags['sancakDikildi'];
    const top = landmarkTile('topkapi');
    let nearestTop: TowerSpec | null = null;
    let nd = Infinity;
    let k = 0;
    for (const tw of TOWERS) {
      if (tw.kind === 'dis') continue;
      const p0 = LINES[tw.line];
      void p0;
      k++;
      const collapsed = tw.sectionId ? this.walls.collapsed(tw.sectionId).has(tw) : false;
      if (collapsed) continue;
      const tt = this.towerTop(tw);
      if (tw.line === 'kara') {
        const q = lineWorld(LINES.kara, tw.t, 0, 0);
        const tp = this.rc.world.toWorld(top.tx, top.ty);
        const d = Math.hypot(q.x - tp.x, q.y - tp.y);
        if (d < nd) {
          nd = d;
          nearestTop = tw;
        }
      }
      const every = tw.line === 'kara' ? 3 : 4;
      const gateTower = tw.kind === 'kapi' || tw.kind === 'mermer' || tw.kind === 'buyuk';
      if (gateTower || k % every === 0) {
        const kind = bannerFor(tw, fallen, k);
        const big = gateTower;
        const key = `fort/sancak-${kind}${big ? '-buyuk' : ''}`;
        const spr = scene.add
          .sprite(Math.round(tt.x), Math.round(tt.y) + 1, key, 0)
          .setOrigin(2.5 / BANNER_W, 1 - 1 / BANNER_H)
          .setDepth((tt.piece?.depth ?? tt.y) + 0.6);
        spr.play({ key: key + ':dalga', startFrame: k % 6 });
        this.flags.push({ spr, tower: tw, piece: tt.piece, kind, x: tt.x, y: tt.y });
      }
      // torch on every other tower (lit at night)
      if (k % 2 === 1) {
        const spr = scene.add
          .sprite(Math.round(tt.x) + 4, Math.round(tt.y) + 1, 'fort/mesale', 0)
          .setOrigin(0.5, 1)
          .setDepth((tt.piece?.depth ?? tt.y) + 0.55)
          .setVisible(false);
        this.torches.push({ spr, x: tt.x + 4, y: tt.y - 7, light: null, brazier: false, sec: tw.sectionId });
      }
    }
    // Ulubatlı Hasan's banner over Topkapı
    if (sancak && nearestTop) {
      const tt = this.towerTop(nearestTop);
      const key = 'fort/sancak-osmanli-buyuk';
      const spr = scene.add.sprite(Math.round(tt.x) - 3, Math.round(tt.y), key, 0).setOrigin(2.5 / BANNER_W, 1 - 1 / BANNER_H).setDepth((tt.piece?.depth ?? tt.y) + 0.7);
      spr.play({ key: key + ':dalga', startFrame: 2 });
      this.flags.push({ spr, tower: nearestTop, piece: tt.piece, kind: 'osmanli', x: tt.x, y: tt.y });
    }
    // braziers on the wall-walks at the gates
    for (const p of this.walls.pieces) {
      const d = p.def;
      if (d.layer !== 'ic' || !d.gates.some((g) => g.kind !== 'deniz' && g.t >= d.t0 && g.t < d.t1)) continue;
      const pos = lineWorld(LINES[d.line], (d.t0 + d.t1) / 2, d.walkN, d.walkZ);
      const spr = this.rc.scene.add.sprite(Math.round(pos.x), Math.round(pos.y) + 1, 'fort/mangal', 0).setOrigin(0.5, 1).setDepth(d.depth + 0.5);
      spr.play({ key: 'fort/mangal:yan', startFrame: Math.floor(Math.random() * 6) });
      this.torches.push({ spr, x: pos.x, y: pos.y - 8, light: null, brazier: true, sec: d.sec });
    }
    this.fallen = fallen;
  }

  private rebuildDefenders(state: GameState): void {
    for (const d of this.defenders) d.spr.destroy();
    this.defenders = [];
    if (cityFallen(state)) return;
    const scene = this.rc.scene;
    for (const [id, s] of Object.entries(state.sections)) {
      const pieces = this.walls.pieces.filter((p) => p.def.sec === id && this.walls.levelOf(p.def) < 4);
      if (!pieces.length) continue;
      const n = Math.min(18, Math.round(s.defenders / 55));
      for (let k = 0; k < n; k++) {
        const kind = defKindFor(id, k);
        // the defenders of 1453 manned the OUTER wall (and the stockades) in the threatened sectors
        const outer = pieces.filter((p) => p.def.layer === 'dis');
        const useOuter = outer.length > 0 && hash2(k, 3, id.length) < 0.55;
        const list = useOuter ? outer : pieces.filter((p) => p.def.layer === 'ic');
        if (!list.length) continue;
        const pc = list[Math.floor(hash2(k, 7, id.length + 3) * list.length)];
        const d = pc.def;
        const onTower = d.towers.length > 0 && !useOuter && hash2(k, 9, 1) < 0.6 && !this.walls.collapsed(d.sec).has(d.towers[0]);
        let z = d.walkZ;
        let t = d.t0 + (d.t1 - d.t0) * (0.2 + hash2(k, 11, 5) * 0.6);
        let nn = d.walkN;
        if (onTower) {
          const tw = d.towers[0];
          const band = bandFor(d.line, 'ic', tw.t);
          z = d.base + band.towerH + (tw.kind === 'buyuk' ? 4 : tw.kind === 'kapi' ? 3 : 0);
          t = tw.t + (hash2(k, 13, 3) - 0.5) * 0.16;
          nn = d.line === 'kara' ? -0.04 : 0.03;
        }
        const key = `fort/asker-${kind}`;
        const spr = scene.add.sprite(0, 0, key, 0).setOrigin(0.5, 18 / 20).setDepth(d.depth + 0.5);
        spr.play({ key: key + ':idle', startFrame: k % 4 });
        const o = outwardAt(LINES[d.line], t);
        const faceFlip = (o.nx - o.ny) * 16 > 0; // sprites face left; flip when the outside is to the right
        this.defenders.push({
          spr,
          piece: d,
          kind,
          t,
          t0: onTower ? t : Math.max(d.t0 + 0.05, t - 0.35),
          t1: onTower ? t : Math.min(d.t1 - 0.05, t + 0.35),
          n: nn,
          z,
          dir: hash2(k, 17, 2) < 0.5 ? -1 : 1,
          mode: 0,
          timer: 1 + hash2(k, 19, 2) * 4,
          shootCd: 1 + Math.random() * 3,
          faceFlip,
          onTower,
        });
      }
    }
  }

  private rebuildProps(state: GameState): void {
    for (const p of this.props) p.img.destroy();
    this.props = [];
    const scene = this.rc.scene;
    for (const [id, s] of Object.entries(state.sections)) {
      if (s.barricade <= 0.02) continue;
      const gaps = this.walls.gaps(id);
      // stockades also run along a battered outer wall even without a full gap
      for (const g of gaps) {
        const d = g.piece;
        const line = LINES[d.line];
        const band = bandFor(d.line, d.layer, g.t);
        const nMid = (band.n0 + band.n1) / 2 + (d.layer === 'ic' ? 0.05 : 0);
        const span = g.w * 1.7 * Math.min(1, 0.3 + s.barricade);
        const steps = Math.max(2, Math.round(span / 0.12));
        for (let k = 0; k <= steps; k++) {
          const t = g.t - span / 2 + (span * k) / steps;
          const pos = lineWorld(line, t, nMid, d.base + 2);
          const img = scene.add.image(Math.round(pos.x), Math.round(pos.y) + 2, 'fort/barikat', k % 2).setOrigin(0.5, 1).setDepth(d.depth + 0.3);
          this.props.push({ img, x: pos.x, y: pos.y });
        }
        // barrels of earth, sacks, beams heaped behind the palisade
        const extra = Math.round(1 + s.barricade * 3);
        for (let k = 0; k < extra; k++) {
          const t = g.t + (hash2(k, 3, d.idx) - 0.5) * span;
          const nn = nMid - 0.12 - hash2(k, 5, d.idx) * 0.25;
          const pos = lineWorld(line, t, nn, d.base + 1);
          const fr = 2 + Math.floor(hash2(k, 7, d.idx) * 5);
          const img = scene.add.image(Math.round(pos.x), Math.round(pos.y) + 2, 'fort/barikat', fr).setOrigin(0.5, 1).setDepth(d.depth + 0.35).setFlipX(hash2(k, 9, 1) < 0.5);
          this.props.push({ img, x: pos.x, y: pos.y });
        }
      }
    }
  }

  private updateWorkers(state: GameState, night: number, view: Phaser.Geom.Rectangle): void {
    // repair crews only at night, at stockaded gaps in view
    const want: { x: number; y: number; d: number; kind: number }[] = [];
    if (night > 0.3 && !cityFallen(state)) {
      for (const [id, s] of Object.entries(state.sections)) {
        if (rawBreach(s) < 0.1 && s.barricade <= 0) continue;
        for (const g of this.walls.gaps(id)) {
          const d = g.piece;
          const band = bandFor(d.line, d.layer, g.t);
          for (let k = 0; k < 4; k++) {
            const pos = lineWorld(LINES[d.line], g.t + (k - 1.5) * 0.12, band.n0 - 0.3 - (k % 2) * 0.12, d.base);
            if (pos.x < view.x || pos.x > view.right || pos.y < view.y || pos.y > view.bottom) continue;
            want.push({ x: pos.x, y: pos.y, d: pos.y + 9, kind: k % 2 });
          }
        }
      }
    }
    while (this.workers.length < Math.min(24, want.length)) {
      this.workers.push(this.rc.scene.add.sprite(0, 0, 'fort/isci', 0).setOrigin(0.5, 18 / 20));
    }
    this.workers.forEach((w, i) => {
      const t = want[i];
      if (!t) {
        if (w.visible) w.setVisible(false).stop();
        return;
      }
      if (!w.visible || w.getData('k') !== t.kind) {
        const key = t.kind ? 'fort/isci-cekic' : 'fort/isci';
        w.setTexture(key, 0).setVisible(true).play({ key: t.kind ? 'fort/isci-cekic:work' : 'fort/isci:walk', startFrame: i % 4 });
        w.setData('k', t.kind);
      }
      // carriers shuttle back and forth
      const off = t.kind ? 0 : Math.sin(this.t * 0.9 + i) * 6;
      w.setFlipX(t.kind ? i % 2 === 0 : Math.cos(this.t * 0.9 + i) > 0);
      w.setPosition(Math.round(t.x + off), Math.round(t.y)).setDepth(t.d);
    });
  }

  update(state: GameState, dt: number, view: Phaser.Geom.Rectangle, night: number): void {
    this.t += dt;
    this.acc += dt;
    if (this.acc > 1) {
      this.acc = 0;
      const lv = this.walls.pieces.map((p) => p.level + p.collapsedSig).join('');
      const fallen = cityFallen(state);
      const sig = `${lv}|${fallen}|${state.flags['sancakDikildi'] ? 1 : 0}|${Object.values(state.sections)
        .map((s) => Math.round(s.defenders / 40))
        .join(',')}`;
      if (sig !== this.sig) {
        const flagSig = `${lv}|${fallen}|${state.flags['sancakDikildi'] ? 1 : 0}`;
        if (!this.sig.startsWith(flagSig)) this.rebuildFlagsTorches(state);
        this.rebuildDefenders(state);
        this.sig = sig;
      }
      const psig = `${lv}|${Object.values(state.sections)
        .map((s) => Math.round(s.barricade * 10))
        .join(',')}`;
      if (psig !== this.propSig) {
        this.propSig = psig;
        this.rebuildProps(state);
      }
    }
    const inV = (x: number, y: number, m = 30) => x > view.x - m && x < view.right + m && y > view.y - m && y < view.bottom + m;
    // banners follow the wind
    const wind = windVector(state);
    const flip = wind.x < -0.05;
    for (const f of this.flags) {
      const v = inV(f.x, f.y, 40);
      if (f.spr.visible !== v) {
        f.spr.setVisible(v);
        if (v) f.spr.anims.resume();
        else f.spr.anims.pause();
      }
      if (v && f.spr.flipX !== flip) {
        f.spr.setFlipX(flip);
        f.spr.setOrigin(flip ? 1 - 2.5 / BANNER_W : 2.5 / BANNER_W, 1 - 1 / BANNER_H);
      }
    }
    // torches & braziers
    const lit = night > 0.15;
    let lights = 0;
    for (const tc of this.torches) {
      const v = inV(tc.x, tc.y, 60);
      const show = v && (lit || tc.brazier);
      if (tc.spr.visible !== show) {
        tc.spr.setVisible(show);
        if (show && !tc.spr.anims.isPlaying) tc.spr.play({ key: tc.brazier ? 'fort/mangal:yan' : 'fort/mesale:yan', startFrame: Math.floor(Math.random() * 6) });
      }
      const needLight = show && lit && lights < 28;
      if (needLight) {
        lights++;
        const fl = 0.85 + Math.sin(this.t * 9 + tc.x) * 0.08 + Math.sin(this.t * 23 + tc.y) * 0.05;
        if (!tc.light) tc.light = this.rc.fx.light(tc.x, tc.y, tc.brazier ? 0xff9a3a : 0xffb14a, tc.brazier ? 34 : 26, 0.9 * night);
        tc.light.setIntensity(fl * Math.min(1, night * 1.3) * (tc.brazier ? 1.05 : 0.9));
      } else if (tc.light) {
        tc.light.destroy();
        tc.light = null;
      }
    }
    this.lightsOn = lights;
    this.updateDefenders(state, dt, view);
    for (const p of this.props) {
      const v = inV(p.x, p.y);
      if (p.img.visible !== v) p.img.setVisible(v);
    }
    this.updateWorkers(state, night, view);
  }

  private updateDefenders(state: GameState, dt: number, view: Phaser.Geom.Rectangle): void {
    // Ottoman troops on the map (archery targets)
    const all: { tx: number; ty: number }[] = [];
    for (const g of state.groups) {
      if (g.status === 'uzakta' || g.status === 'dagildi' || g.men <= 0) continue;
      all.push({ tx: g.tx, ty: g.ty });
    }
    for (const d of this.defenders) {
      const pos = lineWorld(LINES[d.piece.line], d.t, d.n, d.z);
      const vis = pos.x > view.x - 20 && pos.x < view.right + 20 && pos.y > view.y - 20 && pos.y < view.bottom + 30;
      if (d.spr.visible !== vis) d.spr.setVisible(vis);
      if (!vis) continue;
      d.timer -= dt;
      d.shootCd -= dt;
      const key = `fort/asker-${d.kind}`;
      // archers & crossbowmen shoot at Ottomans within ~7 tiles
      if (ARCHERS.includes(d.kind) && d.shootCd <= 0 && all.length) {
        d.shootCd = 2.2 + Math.random() * 3.5;
        const here = this.rc.world.toTile(pos.x, pos.y + d.z);
        let best: { tx: number; ty: number } | null = null;
        let bd = 7.5;
        for (const g of all) {
          const dist = Math.hypot(g.tx - here.tx, g.ty - here.ty);
          if (dist < bd) {
            bd = dist;
            best = g;
          }
        }
        if (best) {
          const tp = this.rc.world.toWorld(best.tx + (Math.random() - 0.5) * 0.8, best.ty + (Math.random() - 0.5) * 0.8);
          d.mode = 2;
          d.timer = 0.7;
          d.spr.play(key + ':shoot');
          const sx = pos.x + (d.faceFlip ? 3 : -3);
          const sy = pos.y - 9;
          d.spr.setFlipX(tp.x > pos.x);
          this.rc.scene.time.delayedCall(260, () =>
            this.rc.fx.projectile(sx, sy, tp.x, tp.y, { kind: 'ok', arc: 10 + bd * 2, duration: 0.45 + bd * 0.06 }),
          );
          continue;
        }
      }
      if (d.timer <= 0) {
        if (d.mode === 2 || d.onTower || d.t1 - d.t0 < 0.1 || Math.random() < 0.45) {
          d.mode = 0;
          d.timer = 2 + Math.random() * 5;
          d.spr.play({ key: key + ':idle', startFrame: Math.floor(Math.random() * 4) }, true);
          d.spr.setFlipX(d.faceFlip);
        } else {
          d.mode = 1;
          d.timer = 1.5 + Math.random() * 3;
          d.dir = d.t <= d.t0 + 0.02 ? 1 : d.t >= d.t1 - 0.02 ? -1 : Math.random() < 0.5 ? -1 : 1;
          d.spr.play(key + ':walk', true);
        }
      }
      if (d.mode === 1) {
        d.t += d.dir * dt * 0.12;
        if (d.t < d.t0 || d.t > d.t1) {
          d.t = Math.max(d.t0, Math.min(d.t1, d.t));
          d.dir = -d.dir;
        }
        const a = lineWorld(LINES[d.piece.line], d.t + d.dir * 0.05, d.n, d.z);
        d.spr.setFlipX(a.x > pos.x);
      }
      d.spr.setPosition(Math.round(pos.x), Math.round(pos.y));
    }
    void this.fallen;
    void this.lightsOn;
  }

  destroy(): void {
    for (const d of this.defenders) d.spr.destroy();
    for (const f of this.flags) f.spr.destroy();
    for (const t of this.torches) {
      t.spr.destroy();
      t.light?.destroy();
    }
    for (const p of this.props) p.img.destroy();
    for (const w of this.workers) w.destroy();
  }
}
