import type Phaser from 'phaser';
import { PixelCanvas } from '../../art/pixel';
import { PhaserTextureGen } from '../../art/texture';
import { P } from '../../art/palette';
import type { RenderContext } from '../../core/feature';
import type { LoopHandle } from '../../core/fx';
import type { Building, GameState } from '../../core/state';
import { genHisarLayer } from './art';
import { outlineOnly } from './artKit';
import { drawHisarLayer, hisarPoint, hisarVisualKey, HISAR_CANVAS, quantHisar, towerBasePoint, towerHeight, towerTopPoint, TOWER, wallHeight, type HisarVisual } from './artHisar';
import { HISAR, HISAR_TOWERS, type HisarTowerId } from './data';
import { GATES, WALL_NODES } from './hisarLayout';
import { playDesync, rectInView, type ViewRect } from './renderUtil';

const BACK_DY = -86;
const FRONT_DY = -9;

interface Walker {
  s: Phaser.GameObjects.Sprite;
  path: [number, number][];
  /** Position along the path in px (ping-pong). */
  d: number;
  dir: 1 | -1;
  speed: number;
  len: number;
  /** Carries a stone when walking toward the end. */
  carry: boolean;
  keyCarry: string;
  keyEmpty: string;
  depthBand: 'inside' | 'outside' | 'wall';
  seed: number;
}

/** Courtyard & beach paths (ground px relative to the anchor). */
const PATHS: { pts: [number, number][]; band: 'inside' | 'outside' }[] = [
  { pts: [[-48, -20], [-28, -16], [-8, -14]], band: 'inside' },
  { pts: [[-12, -42], [18, -38], [46, -32]], band: 'inside' },
  { pts: [[24, -28], [-20, -24], [-62, -20]], band: 'inside' },
  { pts: [[-58, -36], [-40, -46], [-18, -56]], band: 'inside' },
  { pts: [[38, -46], [20, -52], [2, -60]], band: 'inside' },
  { pts: [[-150, 12], [-110, 8], [-70, 5], [-46, 4]], band: 'outside' },
  { pts: [[-140, -8], [-112, -22], [-94, -34]], band: 'outside' },
];

function pathLen(pts: [number, number][]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], (pts[i][1] - pts[i - 1][1]) * 2);
  return l;
}

function along(pts: [number, number][], d: number): [number, number, number] {
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const l = Math.hypot(x1 - x0, (y1 - y0) * 2);
    if (d <= l || i === pts.length - 1) {
      const t = l > 0 ? Math.max(0, Math.min(1, d / l)) : 0;
      return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, x1 - x0];
    }
    d -= l;
  }
  const last = pts[pts.length - 1];
  return [last[0], last[1], 1];
}

export class HisarView {
  back: Phaser.GameObjects.Image;
  front: Phaser.GameObjects.Image;
  selBack: Phaser.GameObjects.Image;
  selFront: Phaser.GameObjects.Image;
  ax = 0;
  ay = 0;
  private keyBack = '';
  private keyFront = '';
  private vis: HisarVisual | null = null;
  private cranes: Phaser.GameObjects.Sprite[] = [];
  private masons: Phaser.GameObjects.Sprite[] = [];
  private mixers: Phaser.GameObjects.Sprite[] = [];
  private flags: Phaser.GameObjects.Sprite[] = [];
  private guards: Phaser.GameObjects.Sprite[] = [];
  private walkers: Walker[] = [];
  private smoke: LoopHandle | null = null;
  private dustT = 0;
  visible = true;
  private gen: PhaserTextureGen;
  private scene: Phaser.Scene;

  constructor(
    private rc: RenderContext,
    public id: number,
  ) {
    this.scene = rc.scene;
    this.gen = new PhaserTextureGen(rc.scene);
    this.back = rc.scene.add.image(0, 0, '__DEFAULT').setOrigin(HISAR_CANVAS.ax / HISAR_CANVAS.w, HISAR_CANVAS.ay / HISAR_CANVAS.h);
    this.front = rc.scene.add.image(0, 0, '__DEFAULT').setOrigin(HISAR_CANVAS.ax / HISAR_CANVAS.w, HISAR_CANVAS.ay / HISAR_CANVAS.h);
    this.selBack = rc.scene.add.image(0, 0, '__DEFAULT').setOrigin(HISAR_CANVAS.ax / HISAR_CANVAS.w, HISAR_CANVAS.ay / HISAR_CANVAS.h).setVisible(false);
    this.selFront = rc.scene.add.image(0, 0, '__DEFAULT').setOrigin(HISAR_CANVAS.ax / HISAR_CANVAS.w, HISAR_CANVAS.ay / HISAR_CANVAS.h).setVisible(false);
  }

  /** World position of an anchor-relative ground point lifted by h. */
  private wp(gx: number, gy: number, h = 0): [number, number] {
    const p = hisarPoint(gx, gy, h);
    return [this.ax + p.x, this.ay + p.y];
  }

  private placedAt = '';

  private place(b: Building): void {
    const key = `${b.tx},${b.ty}`;
    if (key === this.placedAt) return;
    this.placedAt = key;
    const def = { tx: b.tx + 2.5, ty: b.ty + 2.5 };
    const w = this.rc.world.toWorld(Math.floor(def.tx), Math.floor(def.ty));
    this.ax = Math.round(w.x);
    this.ay = Math.round(w.y);
    for (const img of [this.back, this.selBack]) img.setPosition(this.ax, this.ay).setDepth(this.ay + BACK_DY);
    for (const img of [this.front, this.selFront]) img.setPosition(this.ax, this.ay).setDepth(this.ay + FRONT_DY);
    this.selBack.setDepth(this.ay + BACK_DY + 0.2);
    this.selFront.setDepth(this.ay + FRONT_DY + 0.2);
  }

  update(state: GameState, b: Building, dt: number, view: ViewRect, opts: { snow: boolean; running: boolean; night: boolean; selected: boolean; time: number }): void {
    this.place(b);
    const vis = rectInView(view, this.ax - 130, this.ay - 160, this.ax + 130, this.ay + 40);
    if (vis !== this.visible) {
      this.visible = vis;
      this.setAllVisible(vis);
    }
    if (!vis) return;
    const started = state.time.day >= HISAR.startDay;
    const v = quantHisar(b.data, b.built, started, opts.snow);
    const kb = hisarVisualKey(v, 'back');
    if (kb !== this.keyBack) {
      const oldB = this.keyBack;
      const oldF = this.keyFront;
      this.keyBack = genHisarLayer(this.gen, v, 'back');
      this.keyFront = genHisarLayer(this.gen, v, 'front');
      this.back.setTexture(this.keyBack);
      this.front.setTexture(this.keyFront);
      this.vis = v;
      this.rebuildActors(v, b);
      // free superseded construction textures (keep the pre-generated ones)
      for (const k of [oldB, oldF]) if (k && !k.includes('T') && !k.endsWith('-00000') && this.scene.textures.exists(k)) this.scene.textures.remove(k);
      this.selBack.setVisible(false);
      this.selFront.setVisible(false);
    }
    this.updateSelection(opts.selected, opts.time);
    this.animate(state, b, dt, opts);
  }

  private setAllVisible(v: boolean): void {
    for (const o of [this.back, this.front]) o.setVisible(v);
    if (!v) {
      this.selBack.setVisible(false);
      this.selFront.setVisible(false);
    }
    for (const s of [...this.cranes, ...this.masons, ...this.mixers, ...this.flags, ...this.guards]) s.setVisible(v);
    for (const w of this.walkers) w.s.setVisible(v);
    if (!v && this.smoke) {
      this.smoke.destroy();
      this.smoke = null;
    }
  }

  private updateSelection(selected: boolean, time: number): void {
    if (!selected) {
      if (this.selBack.visible) {
        this.selBack.setVisible(false);
        this.selFront.setVisible(false);
      }
      return;
    }
    for (const [img, key] of [
      [this.selBack, this.keyBack],
      [this.selFront, this.keyFront],
    ] as const) {
      const sk = `${key}#sel`;
      if (!this.scene.textures.exists(sk)) {
        const v = this.vis!;
        this.gen.canvas(sk, HISAR_CANVAS.w, HISAR_CANVAS.h, (p) => {
          const src = new PixelCanvas(HISAR_CANVAS.w, HISAR_CANVAS.h);
          drawHisarLayer(src, v, key.includes('-back-') ? 'back' : 'front');
          outlineOnly(src, p, P.gold[6]);
        });
      }
      if (img.texture.key !== sk) img.setTexture(sk);
      img.setVisible(true).setAlpha(0.65 + 0.35 * Math.sin(time * 5));
    }
  }

  private clearActors(): void {
    for (const s of [...this.cranes, ...this.masons, ...this.mixers, ...this.flags, ...this.guards]) s.destroy();
    for (const w of this.walkers) w.s.destroy();
    this.cranes = [];
    this.masons = [];
    this.mixers = [];
    this.flags = [];
    this.guards = [];
    this.walkers = [];
  }

  /** (Re)create cranes, masons, banners… for the current visual state. */
  private rebuildActors(v: HisarVisual, b: Building): void {
    this.clearActors();
    const sc = this.scene;
    const building = !v.done;
    const frontTower = (id: HisarTowerId) => id !== 'saruca';
    if (building && v.t >= 4) {
      // treadwheel cranes beside every rising tower
      for (const id of HISAR_TOWERS) {
        const q = v.k[id];
        if (q <= 0 || q >= 6) continue;
        const top = towerTopPoint(id, q);
        for (let k = 0; k < 2; k++) {
          const m = sc.add.sprite(this.ax + top.x - 6 + k * 12, this.ay + top.y + 3 + k, 'econ/amele-cekic', 0).setOrigin(0.5, 1);
          m.setFlipX(k === 1).setDepth(this.ay + (frontTower(id) ? FRONT_DY + 1 : -39));
          playDesync(m, 'econ/amele-cekic:work', k * 0.5 + id.length * 0.1);
          this.masons.push(m);
        }
        if (id !== 'halil') continue; // one great treadwheel crane at the sea tower
        const base = towerBasePoint(id);
        const rx = TOWER[id].r * 22;
        const h = towerHeight(id, q);
        const lift = Math.max(0, h - 36);
        const s = sc.add.sprite(this.ax + base.x - rx - 15, this.ay + base.y + 5 - lift, 'econ/vinc', 0).setOrigin(0.5, 1);
        s.setDepth(this.ay + (frontTower(id) ? FRONT_DY + 1.5 : -40));
        playDesync(s, 'econ/vinc:work', id.length * 0.37);
        this.cranes.push(s);
      }
      // masons along the rising walls
      if (v.s > 0 && v.s < 5) {
        const H = wallHeight(v.s, v.t);
        const spots: [number, number, boolean][] = [
          [-58, -5, true],
          [20, -5, true],
          [-42, -58, false],
          [28, -64, false],
          [-82, -20, false],
          [56, -48, false],
        ];
        spots.forEach(([gx, gy, fr], k) => {
          const [x, y] = this.wp(gx, gy, H);
          const m = sc.add.sprite(x, y + 1, 'econ/amele-cekic', 0).setOrigin(0.5, 1).setFlipX(k % 2 === 0);
          m.setDepth(this.ay + (fr ? FRONT_DY + 1 : BACK_DY + 1));
          playDesync(m, 'econ/amele-cekic:work', k * 0.31);
          this.masons.push(m);
        });
        // a wall crane in the courtyard
        const [cx, cy] = this.wp(-6, -50);
        const c = sc.add.sprite(cx, cy + 4, 'econ/vinc', 0).setOrigin(0.5, 1).setFlipX(true).setDepth(this.ay - 50);
        playDesync(c, 'econ/vinc:work', 0.71);
        this.cranes.push(c);
      }
    }
    if (building && v.t >= 1) {
      // mortar mixers at the lime pits
      for (const [gx, gy] of [[-30, -17], [8, -47]] as const) {
        const [x, y] = this.wp(gx, gy);
        const m = sc.add.sprite(x, y + 2, 'econ/amele-karis', 0).setOrigin(0.5, 1).setDepth(this.ay + gy);
        playDesync(m, 'econ/amele-karis:work', gx * 0.013 + 0.5);
        this.mixers.push(m);
      }
    }
    if (building) {
      // carriers on every path; their number follows staffing (set per frame)
      const keys: [string, string][] = [
        ['econ/amele-tas', 'econ/amele-yuru'],
        ['econ/amele2-cuval', 'econ/amele2-yuru'],
        ['econ/amele-kalas', 'econ/amele-yuru'],
      ];
      let seed = 1;
      for (const path of PATHS) {
        const len = pathLen(path.pts);
        const per = path.band === 'outside' ? 4 : 3;
        for (let k = 0; k < per; k++) {
          const [kc, ke] = keys[(seed + k) % keys.length];
          const s = sc.add.sprite(0, 0, ke, 0).setOrigin(0.5, 1);
          this.walkers.push({ s, path: path.pts, d: (len * (k + 0.5)) / per, dir: k % 2 ? 1 : -1, speed: 7 + ((seed * 7 + k * 3) % 5), len, carry: k % 2 === 1, keyCarry: kc, keyEmpty: ke, depthBand: path.band, seed: seed + k });
        }
        seed += 3;
      }
      // interleave: outside paths first so the beach is always busy, then the courtyard
      this.walkers.sort((a, b2) => (a.depthBand === b2.depthBand ? a.seed - b2.seed : a.depthBand === 'outside' ? -1 : 1));
      const out = this.walkers.filter((w) => w.depthBand === 'outside');
      const ins = this.walkers.filter((w) => w.depthBand !== 'outside');
      this.walkers = [];
      for (let i = 0; i < Math.max(out.length, ins.length); i++) {
        if (ins[i]) this.walkers.push(ins[i]);
        if (out[i]) this.walkers.push(out[i]);
      }
    } else {
      // finished: banners on the three great towers & burçlar, guards at the shore gate, sentries
      const colors: Record<HisarTowerId, string> = { saruca: 'yesil', halil: 'kirmizi', zaganos: 'beyaz' };
      for (const id of HISAR_TOWERS) {
        const top = towerTopPoint(id, 6);
        const f = sc.add.sprite(this.ax + top.x - 1, this.ay + top.y + 6, `econ/sancak-${colors[id]}`, 0).setOrigin(2.5 / 16, 1);
        f.setDepth(this.ay + (id === 'saruca' ? -40 : FRONT_DY + 2));
        playDesync(f, `econ/sancak-${colors[id]}:wave`, id.length * 0.2);
        this.flags.push(f);
      }
      WALL_NODES.forEach((n, i) => {
        if (n.kind !== 'burc' || (i !== 6 && i !== 1)) return;
        const [x, y] = this.wp(n.x, n.y, 31);
        const f = sc.add.sprite(x, y, 'econ/sancak-kirmizi', 0).setOrigin(2.5 / 16, 1);
        f.setDepth(this.ay + (n.y > -30 ? FRONT_DY + 2 : BACK_DY + 2));
        playDesync(f, 'econ/sancak-kirmizi:wave', i * 0.13);
        this.flags.push(f);
      });
      const g = GATES[0];
      const A = WALL_NODES[g.seg];
      const B = WALL_NODES[g.seg + 1];
      const gx = A.x + (B.x - A.x) * g.t;
      const gy = A.y + (B.y - A.y) * g.t;
      for (const dx of [-8, 8]) {
        const [x, y] = this.wp(gx + dx, gy + 7);
        const s = sc.add.sprite(x, y, 'econ/nobetci', 0).setOrigin(0.5, 1).setFlipX(dx > 0).setDepth(this.ay + gy + 7);
        playDesync(s, 'econ/nobetci:idle', dx > 0 ? 0.4 : 0.1);
        this.guards.push(s);
      }
      // sentries patrolling the shore wall and the hill wall
      const H = wallHeight(5, 4);
      const patrols: [[number, number][], boolean][] = [
        [[[-56, -6], [-50, -3]], true],
        [[[22, -5], [30, -6]], true],
        [[[-50, -54], [-36, -61]], false],
      ];
      patrols.forEach(([pts, fr], k) => {
        const s = sc.add.sprite(0, 0, 'econ/yeniceri-yuru', 0).setOrigin(0.5, 1);
        s.setDepth(this.ay + (fr ? FRONT_DY + 1 : BACK_DY + 1));
        const len = pathLen(pts);
        this.walkers.push({ s, path: pts, d: len * 0.3 * k, dir: 1, speed: 4, len, carry: false, keyCarry: 'econ/yeniceri-yuru', keyEmpty: 'econ/yeniceri-yuru', depthBand: 'outside', seed: k + 40, });
        (this.walkers[this.walkers.length - 1] as Walker & { wallH?: number }).wallH = H;
      });
    }
  }

  private animate(state: GameState, b: Building, dt: number, opts: { running: boolean; night: boolean; time: number }): void {
    const running = opts.running;
    const fx = this.rc.fx;
    // how many carriers are active follows the workforce on the site
    const crowd = b.built ? this.walkers.length : Math.min(this.walkers.length, 14, Math.round(b.workers / 90) + (state.time.day < HISAR.startDay ? 5 : 0));
    let idx = 0;
    for (const w of this.walkers) {
      const active = idx++ < crowd;
      w.s.setVisible(active);
      if (!active) continue;
      if (running) {
        w.d += w.dir * w.speed * dt * Math.max(1, state.time.speed);
        if (w.d >= w.len) {
          w.d = w.len;
          w.dir = -1;
          w.carry = false;
        } else if (w.d <= 0) {
          w.d = 0;
          w.dir = 1;
          w.carry = true;
        }
      }
      const [gx, gy, dx] = along(w.path, w.d);
      const wallH = (w as Walker & { wallH?: number }).wallH ?? 0;
      const [x, y] = this.wp(gx, gy, wallH);
      const nx = Math.round(x);
      const ny = Math.round(y) + 1;
      if (w.s.x !== nx || w.s.y !== ny) {
        w.s.setPosition(nx, ny);
        if (!wallH) w.s.setDepth(this.ay + gy);
      }
      const key = w.carry ? w.keyCarry : w.keyEmpty;
      if (w.s.texture.key !== key) w.s.setTexture(key, 0);
      w.s.setFlipX(dx * w.dir < 0);
      if (running) playDesync(w.s, `${key}:walk`, w.seed * 0.17);
      else w.s.anims.stop();
    }
    for (const s of [...this.cranes, ...this.masons, ...this.mixers]) {
      if (running && !s.anims.isPlaying) s.anims.resume();
      if (!running && s.anims.isPlaying) s.anims.pause();
    }
    // dust & chips from the works
    if (!b.built && running && b.workers > 0) {
      this.dustT -= dt * Math.max(1, state.time.speed);
      if (this.dustT <= 0) {
        this.dustT = 0.25 + Math.random() * 0.45;
        const pool = this.masons.length ? this.masons : this.mixers;
        if (pool.length) {
          const m = pool[Math.floor(Math.random() * pool.length)];
          if (Math.random() < 0.6) fx.dust(m.x + 4, m.y - 2, 0.5);
          else fx.sparks(m.x + 5, m.y - 6, 3);
        }
      }
    }
    // chimney smoke from the barracks once garrisoned
    if (b.built) {
      if (!this.smoke) {
        const [x, y] = this.wp(-30, -40, 14);
        this.smoke = fx.smokeColumn(x, y, 0.6);
      }
    } else if (this.smoke) {
      this.smoke.destroy();
      this.smoke = null;
    }
  }

  /** Per-frame alpha test for picking. */
  hit(wx: number, wy: number): boolean {
    if (!this.visible) return false;
    const lx = Math.floor(wx - this.ax + HISAR_CANVAS.ax);
    const ly = Math.floor(wy - this.ay + HISAR_CANVAS.ay);
    if (lx < 0 || ly < 0 || lx >= HISAR_CANVAS.w || ly >= HISAR_CANVAS.h) return false;
    for (const key of [this.keyFront, this.keyBack]) {
      if (!key) continue;
      const a = this.scene.textures.getPixelAlpha(lx, ly, key);
      if (a != null && a > 200) return true;
    }
    return false;
  }

  /** World position for stage FX (a tower top or the courtyard). */
  stagePoint(stage: string): [number, number] {
    if ((HISAR_TOWERS as string[]).includes(stage)) {
      const id = stage as HisarTowerId;
      const t = towerTopPoint(id, 6);
      return [this.ax + t.x, this.ay + t.y + 20];
    }
    return this.wp(-10, -40, 10);
  }

  topPoint(): [number, number] {
    return [this.ax, this.ay - 120];
  }

  destroy(): void {
    this.clearActors();
    this.smoke?.destroy();
    this.back.destroy();
    this.front.destroy();
    this.selBack.destroy();
    this.selFront.destroy();
  }
}

