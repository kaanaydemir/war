import type Phaser from 'phaser';
import { P, hex } from '../../art/palette';
import type { OrderInput, PickResult, RenderContext } from '../../core/feature';
import type { LightHandle, LoopHandle } from '../../core/fx';
import type { Pt, TilePt } from '../../core/iso';
import { DEPTH } from '../../core/layers';
import type { GameState, Mine, SectionId, UnitGroup } from '../../core/state';
import { lightLevel } from '../atmosphere/api';
import { sectionAt, sectionOutwardNormal, sectionPoint } from '../fortifications/api';
import {
  BRIDGE,
  FIG,
  FIG_FOOT,
  FIG_H,
  FIG_W,
  figFrame,
  SHAFT,
  TOWER_ANCHOR,
  TOWER_H,
  TOWER_PTS,
  TOWER_W,
  WHEEL,
  type FigVariant,
} from './art';
import { TOWER_MOAT_STOP, TOWER_WALL } from './data';
import { frontPos, hasMoat, isLand, tunnelPoint } from './geo';
import { sw, type MineExtra, type MoatSite, type TowerState } from './state';

/**
 * SIEGEWORKS RENDER — mine shafts with sappers and windlasses, x-ray tunnels,
 * counter-mine smoke and cave-ins, the great siege tower (pushers, archers,
 * drawbridge, burning), moat-filling crews carrying fascines and earth.
 * Rebuilt on every createRender; never mutates GameState.
 */

type Spr = Phaser.GameObjects.Sprite;
type Img = Phaser.GameObjects.Image;

const CULL = 170;
const MAX_LIGHTS = 14;

const renders = new WeakMap<RenderContext, SiegeRender>();

export function createSiegeworksRender(rc: RenderContext): void {
  renders.set(rc, new SiegeRender(rc));
}

export function updateSiegeworksRender(rc: RenderContext, state: GameState, dt: number): void {
  renders.get(rc)?.update(state, dt);
}

// ───────────────────────────── figures ─────────────────────────────

interface Fig {
  s: Spr;
  v: FigVariant;
  /** Animation clock & state machine. */
  t: number;
  phase: number;
  seed: number;
  /** Current position in tile space. */
  tx: number;
  ty: number;
  leg: number;
  torch: boolean;
  light: LightHandle | null;
}

interface MineView {
  id: number;
  shaft: Spr;
  wreck: Img;
  screen: Img;
  heap: Img;
  logs: Img;
  lantern: Spr;
  light: LightHandle | null;
  miners: Fig[];
  crater: Img;
  gocuk: Img;
  dimples: Img[];
  smokeT: number;
  lastStatus: Mine['status'];
  visible: boolean;
}

interface TowerView {
  id: number;
  body: Img;
  front: Img;
  itici: Spr;
  wheels: Spr[];
  bridge: Spr;
  banner: Spr;
  archers: Fig[];
  pushers: Fig[];
  builders: Fig[];
  lumber: Img;
  wreck: Spr;
  fires: LoopHandle[];
  flames: Spr[];
  smoke: LoopHandle | null;
  light: LightHandle | null;
  roll: number;
  lastDist: number;
  bridgeT: number;
  shotT: number;
  dustT: number;
  smokeT: number;
  status: TowerState['status'];
  visible: boolean;
}

interface SiteView {
  sid: SectionId;
  depot: Img;
  dumps: Img[];
  carriers: Fig[];
  visible: boolean;
}

interface Timed {
  t: number;
  fn: () => void;
}

class SiegeRender {
  private scene: Phaser.Scene;
  private time = 0;
  private mines = new Map<number, MineView>();
  private towers = new Map<number, TowerView>();
  private sites = new Map<SectionId, SiteView>();
  private timers: Timed[] = [];
  private lights = 0;
  private night = 0;
  // selection visuals
  private ring: Spr;
  private ringB: Spr;
  private dots: Spr[] = [];
  private head: Spr;
  private target: Spr;
  private bars: { frame: Img; fill: Img; frame2: Img; fill2: Img };
  /** QA URL parameter ?siege=lagim|kule|patlat|cokme|yak (screenshots only). */
  private qa: string | null = null;
  private qaT = 0;

  constructor(private rc: RenderContext) {
    this.scene = rc.scene;
    const sc = this.scene;
    this.ring = sc.add.sprite(0, 0, 'siege/halka-m', 0).setDepth(DEPTH.GROUND_DECAL + 6).setVisible(false);
    this.ringB = sc.add.sprite(0, 0, 'siege/halka-b', 0).setDepth(DEPTH.GROUND_DECAL + 6).setVisible(false);
    this.head = sc.add.sprite(0, 0, 'siege/xray-uc', 0).setDepth(DEPTH.UI_WORLD - 4).setVisible(false);
    this.target = sc.add.sprite(0, 0, 'siege/xray-hedef', 0).setDepth(DEPTH.UI_WORLD - 5).setVisible(false);
    this.bars = {
      frame: sc.add.image(0, 0, 'siege/bar').setOrigin(0, 0).setDepth(DEPTH.UI_WORLD).setVisible(false),
      fill: sc.add.image(0, 0, 'siege/bar-dolum').setOrigin(0, 0).setDepth(DEPTH.UI_WORLD + 1).setVisible(false),
      frame2: sc.add.image(0, 0, 'siege/bar').setOrigin(0, 0).setDepth(DEPTH.UI_WORLD).setVisible(false),
      fill2: sc.add.image(0, 0, 'siege/bar-kirmizi').setOrigin(0, 0).setDepth(DEPTH.UI_WORLD + 1).setVisible(false),
    };
    const bus = rc.bus;
    bus.on('mine:started', (e) => this.onMineStarted(e.mineId));
    bus.on('mine:detected', (e) => this.onMineDetected(e.mineId));
    bus.on('mine:collapsed', (e) => this.onMineCollapsed(e.mineId, e.at));
    bus.on('mine:success', (e) => this.onMineSuccess(e.mineId, e.sectionId));
    bus.on('tower:built', (e) => this.onTowerBuilt(e.sectionId));
    bus.on('tower:burned', (e) => this.onTowerBurned(e.at));
    rc.addPickable({ pick: (wx, wy, s) => this.pick(wx, wy, s) });
    rc.addOrderHandler((input, s) => this.order(input, s));
    this.scene.events.once('shutdown', () => this.destroyAll());
    try {
      this.qa = new URLSearchParams(window.location.search).get('siege');
      if (this.qa === 'debug') (window as unknown as { __siege?: unknown }).__siege = this;

    } catch {
      this.qa = null;
    }
  }

  /** QA hooks for screenshots: select a mine/tower, or trigger the big moments. */
  private runQa(state: GameState, dt: number): void {
    if (!this.qa) return;
    void dt;
    this.qaT += 1;
    if (this.qaT < 3) return;
    const store = this.rc.store;
    const alive = state.mines.filter((m) => m.status === 'kaziliyor' || m.status === 'hazir');
    const best = alive.find((m) => m.detected) ?? alive[0];
    const tower = sw(state).towers.find((t) => t.status !== 'yikildi');
    switch (this.qa) {
      case 'lagim':
        if (best) store.ui.selection = [{ kind: 'mine', id: best.id, score: 0 }];
        break;
      case 'kule':
        if (tower) store.ui.selection = [{ kind: 'building', id: -tower.id, score: 0 }];
        break;
      case 'patlat': {
        const m = alive.slice().sort((a, b) => b.progress - a.progress)[0];
        if (m) store.dispatch({ t: 'ozel', feature: 'siegeworks', action: 'lagim-bitir', payload: { mineId: m.id } });
        break;
      }
      case 'cokme':
        if (best) this.onMineCollapsed(best.id, tunnelPoint({ tx: best.tx, ty: best.ty }, best.sectionId, sw(state).mineX[best.id]?.t ?? 0.5, best.progress));
        break;
      case 'dayan':
        store.dispatch({ t: 'ozel', feature: 'siegeworks', action: 'kule-durum', payload: { status: 'surda', dist: 1.2 } });
        break;
      case 'insa':
        store.dispatch({ t: 'ozel', feature: 'siegeworks', action: 'kule-durum', payload: { status: 'insa', progress: 0.6, dist: 4 } });
        break;
      case 'yak':
        store.dispatch({ t: 'ozel', feature: 'siegeworks', action: 'kule-yak', payload: { burn: 0.45 } });
        break;
    }
    this.qa = null;
  }

  // ───────── helpers ─────────

  private wp(tx: number, ty: number): Pt {
    return this.rc.world.toWorld(tx, ty);
  }

  private inView(x: number, y: number, m = CULL): boolean {
    const v = this.scene.cameras.main.worldView;
    return x > v.x - m && x < v.right + m && y > v.y - m && y < v.bottom + m;
  }

  private img(key: string, ox: number, oy: number): Img {
    return this.scene.add.image(0, 0, key).setOrigin(ox, oy);
  }

  private fig(v: FigVariant, seed: number): Fig {
    const s = this.scene.add.sprite(0, 0, `siege/adam-${v}`, 0).setOrigin(FIG_W / 2 / FIG_W, FIG_FOOT / FIG_H);
    return { s, v, t: 0, phase: seed * 7.3, seed, tx: 0, ty: 0, leg: 0, torch: false, light: null };
  }

  private killFig(f: Fig): void {
    f.s.destroy();
    if (f.light) {
      f.light.destroy();
      f.light = null;
      this.lights--;
    }
  }

  /** Place a figure at a tile position walking from a to b (sets view/facing/frame). */
  private walkFig(f: Fig, x: number, y: number, dx: number, dy: number, base: 'walk' | 'bundle' | 'basket' | 'torch', step: number): void {
    const front = dy > 0 || (dy === 0 && dx > 0);
    const fdir: 1 | -1 = dx >= 0 ? 1 : -1;
    const b =
      base === 'walk' ? (front ? FIG.walkF : FIG.walkB) : base === 'bundle' ? (front ? FIG.bundleF : FIG.bundleB) : base === 'basket' ? (front ? FIG.basketF : FIG.basketB) : front ? FIG.torchF : FIG.torchB;
    f.s.setFrame(figFrame(b, step % 4, fdir));
    f.s.setPosition(Math.round(x), Math.round(y)).setDepth(Math.round(y));
  }

  private fx() {
    return this.rc.fx;
  }

  private after(t: number, fn: () => void): void {
    this.timers.push({ t, fn });
  }

  // ───────── update ─────────

  update(state: GameState, dt: number): void {
    this.time += dt;
    const ll = lightLevel(state);
    this.night = Math.max(0, Math.min(1, (0.55 - ll) / 0.35));
    const anim = dt * (state.time.speed > 1 ? state.time.speed * 0.75 : 1);
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const tm = this.timers[i];
      tm.t -= dt;
      if (tm.t <= 0) {
        this.timers.splice(i, 1);
        tm.fn();
      }
    }
    this.runQa(state, dt);
    this.syncMines(state, anim);
    this.syncTowers(state, anim);
    this.syncSites(state, anim);
    this.updateSelection(state);
  }

  // ───────────────────────────── mines ─────────────────────────────

  private mineGeom(state: GameState, m: Mine): { x: MineExtra | undefined; ent: Pt; inX: number; inY: number; side: TilePt } {
    const x = sw(state).mineX[m.id];
    const t = x?.t ?? 0.5;
    const n = sectionOutwardNormal(m.sectionId, t);
    // lateral (along the wall) direction
    const side = { tx: -n.ty, ty: n.tx };
    return { x, ent: this.wp(m.tx, m.ty), inX: -n.tx, inY: -n.ty, side };
  }

  private newMineView(state: GameState, m: Mine): MineView {
    const g = this.mineGeom(state, m);
    const sc = this.scene;
    const shaft = sc.add.sprite(0, 0, 'siege/kuyu', 0).setOrigin(SHAFT.ox / SHAFT.w, SHAFT.oy / SHAFT.h);
    const wreck = this.img('siege/kuyu-cokuk', SHAFT.ox / SHAFT.w, SHAFT.oy / SHAFT.h).setVisible(false);
    const scr = this.img('siege/perde', 0.5, 0.85);
    const heap = this.img('siege/toprak-0', 0.5, 0.8);
    const logs = this.img('siege/kereste', 0.5, 0.75);
    const lantern = sc.add.sprite(0, 0, 'siege/fener', 0).setOrigin(2 / 9, 13 / 14);
    lantern.play({ key: 'siege/fener:yan', startFrame: m.id % 2 });
    // static placements around the shaft
    const at = (dt: number, ds: number) => this.wp(m.tx + g.inX * dt + g.side.tx * ds, m.ty + g.inY * dt + g.side.ty * ds);
    const ps = at(1.15, 0.55);
    scr.setPosition(Math.round(ps.x), Math.round(ps.y)).setDepth(Math.round(ps.y));
    const ph = at(-0.35, 1.25);
    heap.setPosition(Math.round(ph.x), Math.round(ph.y)).setDepth(Math.round(ph.y));
    const pl = at(-0.5, -1.15);
    logs.setPosition(Math.round(pl.x), Math.round(pl.y)).setDepth(Math.round(pl.y));
    shaft.setPosition(Math.round(g.ent.x), Math.round(g.ent.y)).setDepth(Math.round(g.ent.y) - 7);
    wreck.setPosition(Math.round(g.ent.x), Math.round(g.ent.y)).setDepth(DEPTH.GROUND_DECAL + 3);
    lantern.setPosition(Math.round(g.ent.x - 12), Math.round(g.ent.y - 2)).setDepth(Math.round(g.ent.y - 2));
    const miners = [this.fig('lagimci', m.id * 3 + 1), this.fig('lagimci', m.id * 3 + 2), this.fig('lagimci', m.id * 3 + 3)];
    miners.forEach((f, i) => (f.phase = i * 2.6 + (m.id % 5)));
    const crater = this.img('siege/cokuntu', 0.5, 0.5).setDepth(DEPTH.GROUND_DECAL + 3).setVisible(false);
    const gocuk = this.img('siege/gocuk', 0.5, 0.5).setDepth(DEPTH.GROUND_DECAL + 4).setVisible(false);
    return { id: m.id, shaft, wreck, screen: scr, heap, logs, lantern, light: null, miners, crater, gocuk, dimples: [], smokeT: 0, lastStatus: m.status, visible: true };
  }

  private destroyMineView(v: MineView): void {
    for (const o of [v.shaft, v.wreck, v.screen, v.heap, v.logs, v.lantern, v.crater, v.gocuk, ...v.dimples]) o.destroy();
    for (const f of v.miners) this.killFig(f);
    if (v.light) {
      v.light.destroy();
      this.lights--;
    }
  }

  private syncMines(state: GameState, dt: number): void {
    const seen = new Set<number>();
    for (const m of state.mines) {
      seen.add(m.id);
      let v = this.mines.get(m.id);
      if (!v) {
        v = this.newMineView(state, m);
        this.mines.set(m.id, v);
      }
      this.updateMine(state, m, v, dt);
    }
    for (const [id, v] of this.mines)
      if (!seen.has(id)) {
        this.destroyMineView(v);
        this.mines.delete(id);
      }
  }

  private updateMine(state: GameState, m: Mine, v: MineView, dt: number): void {
    const g = this.mineGeom(state, m);
    const vis = this.inView(g.ent.x, g.ent.y, CULL + 60);
    const dead = m.status === 'cokertildi' || m.status === 'basarili';
    const alive = !dead;
    v.visible = vis;
    v.shaft.setVisible(vis && alive);
    v.wreck.setVisible(vis && dead);
    v.screen.setVisible(vis && alive);
    v.heap.setVisible(vis);
    v.logs.setVisible(vis && alive);
    v.lantern.setVisible(vis && alive);
    // spoil heap grows with the tunnel
    const hk = Math.min(3, Math.floor(m.progress * 4.2));
    v.heap.setTexture(`siege/toprak-${hk}`);
    // windlass turns while digging
    const digging = m.status === 'kaziliyor' && this.groupDigging(state, m);
    if (vis && alive) v.shaft.setFrame(digging || m.status === 'atesl' ? Math.floor(this.time * 5 + m.id) % 4 : 0);
    // lantern light at night
    const wantLight = vis && alive && this.night > 0.15;
    if (wantLight && !v.light && this.lights < MAX_LIGHTS) {
      v.light = this.fx().light(v.lantern.x + 3, v.lantern.y - 8, hex(P.fire[4]), 56, 1.6);
      this.lights++;
    } else if (!wantLight && v.light) {
      v.light.destroy();
      v.light = null;
      this.lights--;
    }
    if (v.light) v.light.setIntensity(1.45 + 0.15 * Math.sin(this.time * 9 + m.id) + 0.1 * Math.sin(this.time * 23));
    // miners
    this.updateMiners(state, m, v, g, vis && alive && (digging || m.status === 'hazir'), dt);
    // smoke from the shaft: counter-mine fight (detected, counter tunnel close) or props burning
    const x = g.x;
    v.smokeT -= dt;
    if (vis && v.smokeT <= 0) {
      if (m.status === 'atesl') {
        this.fx().smoke(g.ent.x, g.ent.y - 4, 1.1, 1);
        v.smokeT = 0.35;
      } else if (alive && m.detected && x && x.counter > 0.45) {
        this.fx().smoke(g.ent.x + (Math.random() - 0.5) * 6, g.ent.y - 3, 0.7 + x.counter, 1);
        v.smokeT = 1.6 - x.counter;
      } else if (dead && x && x.fate === 'duman' && state.time.day - x.fateDay < 1.2) {
        this.fx().smoke(g.ent.x, g.ent.y - 3, 0.8, 1);
        v.smokeT = 1.4;
      } else v.smokeT = 0.5;
    }
    // cave-in decals for lost tunnels; huge subsidence for a successful one
    if (dead && x) {
      const head = tunnelPoint({ tx: m.tx, ty: m.ty }, m.sectionId, x.t, Math.max(0.2, m.progress));
      if (x.fate === 'basarili') {
        const w = sectionPoint(m.sectionId, x.t);
        const n = sectionOutwardNormal(m.sectionId, x.t);
        const p = this.wp(w.tx + n.tx * 1.5, w.ty + n.ty * 1.5);
        v.gocuk.setPosition(Math.round(p.x), Math.round(p.y)).setVisible(vis);
      } else {
        const p = this.wp(head.tx, head.ty);
        v.crater.setPosition(Math.round(p.x), Math.round(p.y)).setVisible(vis);
      }
      // dimples along the caved-in tunnel
      if (!v.dimples.length) {
        const n = Math.max(1, Math.floor(m.progress * x.length / 0.9));
        for (let i = 1; i < n; i++) {
          const q = tunnelPoint({ tx: m.tx, ty: m.ty }, m.sectionId, x.t, (i / n) * Math.max(0.2, m.progress));
          const p = this.wp(q.tx, q.ty);
          v.dimples.push(this.img('siege/iz', 0.5, 0.5).setPosition(Math.round(p.x + (Math.random() - 0.5) * 3), Math.round(p.y)).setDepth(DEPTH.GROUND_DECAL + 2).setAlpha(0.85));
        }
      }
      for (const d of v.dimples) d.setVisible(vis);
    }
    v.lastStatus = m.status;
  }

  private groupDigging(state: GameState, m: Mine): boolean {
    if (m.groupId == null) return false;
    const g = state.groups.find((y) => y.id === m.groupId);
    return !!g && g.status === 'calisiyor' && g.order.type === 'lagim-kaz' && g.men > 0;
  }

  private updateMiners(state: GameState, m: Mine, v: MineView, g: { ent: Pt; inX: number; inY: number; side: TilePt }, active: boolean, dt: number): void {
    void state;
    const heapT = { tx: m.tx - g.inX * 0.35 + g.side.tx * 1.25, ty: m.ty - g.inY * 0.35 + g.side.ty * 1.25 };
    const shaftT = { tx: m.tx + g.side.tx * 0.35, ty: m.ty + g.side.ty * 0.35 };
    v.miners.forEach((f, i) => {
      if (!active) {
        f.s.setVisible(false);
        return;
      }
      f.s.setVisible(true);
      if (i === 2) {
        // at the windlass: cranking
        const p = this.wp(m.tx + g.side.tx * -0.55 + g.inX * -0.15, m.ty + g.side.ty * -0.55 + g.inY * -0.15);
        f.s.setFrame(figFrame(FIG.crank, Math.floor(this.time * 3 + f.phase) % 2, 1));
        f.s.setPosition(Math.round(p.x + 9), Math.round(p.y - 3)).setDepth(Math.round(p.y - 3));
        return;
      }
      // basket carriers: climb out → heap → dump → back → down the shaft
      const cyc = 9;
      const t = (this.time * 0.9 + f.phase) % cyc;
      let a: TilePt;
      let b: TilePt;
      let k: number;
      let carry: 'basket' | 'walk';
      if (t < 3.6) {
        a = shaftT;
        b = heapT;
        k = t / 3.6;
        carry = 'basket';
      } else if (t < 4.6) {
        // tipping the basket at the heap
        const p = this.wp(heapT.tx, heapT.ty);
        f.s.setFrame(figFrame(FIG.dump, Math.min(2, Math.floor((t - 3.6) * 3)), g.side.tx - g.side.ty >= 0 ? 1 : -1));
        f.s.setPosition(Math.round(p.x), Math.round(p.y)).setDepth(Math.round(p.y));
        if (Math.random() < dt * 1.2 && this.inView(p.x, p.y, 0)) this.fx().dust(p.x + 3, p.y - 2, 0.4);
        return;
      } else if (t < 8.2) {
        a = heapT;
        b = shaftT;
        k = (t - 4.6) / 3.6;
        carry = 'walk';
      } else {
        f.s.setVisible(false); // down the ladder
        return;
      }
      const tx = a.tx + (b.tx - a.tx) * k;
      const ty = a.ty + (b.ty - a.ty) * k;
      const pa = this.wp(a.tx, a.ty);
      const pb = this.wp(b.tx, b.ty);
      const p = this.wp(tx, ty);
      this.walkFig(f, p.x, p.y, pb.x - pa.x, pb.y - pa.y, carry, Math.floor(t * 5));
    });
  }

  // ───────────────────────────── towers ─────────────────────────────

  private newTowerView(t: TowerState): TowerView {
    const sc = this.scene;
    const ax = TOWER_ANCHOR.x / TOWER_W;
    const ay = TOWER_ANCHOR.y / TOWER_H;
    const body = this.img('siege/kule-0', ax, ay);
    const front = this.img('siege/kule-on', ax, ay).setVisible(false);
    const itici = sc.add.sprite(0, 0, 'siege/kule-itici', 0).setOrigin(ax, ay);
    const wheels = TOWER_PTS.wheels.map(() => sc.add.sprite(0, 0, 'siege/teker', 0).setOrigin(0.5, 8 / WHEEL.h));
    const bridge = sc.add.sprite(0, 0, 'siege/kopru', 0).setOrigin(BRIDGE.hx / BRIDGE.w, BRIDGE.hy / BRIDGE.h);
    const banner = sc.add.sprite(0, 0, 'siege/sancak', 0).setOrigin(1 / 14, 2 / 12);
    banner.play({ key: 'siege/sancak:dalga', startFrame: t.id % 4 });
    const archers = [0, 1, 2].map((i) => this.fig(i === 1 ? 'yeniceri' : 'azap', t.id * 5 + i));
    archers.forEach((f, i) => (f.phase = i * 1.37));
    const pushers = [0, 1, 2, 3].map((i) => this.fig(i % 2 ? 'amele' : 'azap', t.id * 7 + i));
    pushers.forEach((f, i) => (f.phase = i * 0.7));
    const builders = [0, 1, 2, 3, 4].map((i) => this.fig(i === 4 ? 'yeniceri' : 'amele', t.id * 11 + i));
    builders.forEach((f, i) => (f.phase = i * 1.1));
    const lumber = this.img('siege/kereste', 0.5, 0.75);
    const wreck = sc.add.sprite(0, 0, 'siege/enkaz', 0).setOrigin(36 / 72, 30 / 44).setVisible(false);
    wreck.play('siege/enkaz:kor');
    return {
      id: t.id,
      body,
      front,
      itici,
      wheels,
      bridge,
      banner,
      archers,
      pushers,
      builders,
      lumber,
      wreck,
      fires: [],
      flames: [],
      smoke: null,
      light: null,
      roll: 0,
      lastDist: t.dist,
      bridgeT: t.status === 'surda' ? 1 : 0,
      shotT: 1 + Math.random() * 2,
      dustT: 0,
      smokeT: 0,
      status: t.status,
      visible: true,
    };
  }

  private destroyTowerView(v: TowerView): void {
    for (const o of [v.body, v.front, v.itici, v.bridge, v.banner, v.lumber, v.wreck, ...v.wheels]) o.destroy();
    for (const f of [...v.archers, ...v.pushers, ...v.builders]) this.killFig(f);
    for (const f of v.fires) f.destroy();
    for (const f of v.flames) f.destroy();
    v.smoke?.destroy();
    if (v.light) {
      v.light.destroy();
      this.lights--;
    }
  }

  private syncTowers(state: GameState, dt: number): void {
    const s = sw(state);
    const seen = new Set<number>();
    for (const t of s.towers) {
      seen.add(t.id);
      let v = this.towers.get(t.id);
      if (!v) {
        v = this.newTowerView(t);
        this.towers.set(t.id, v);
      }
      this.updateTower(state, t, v, dt);
    }
    for (const [id, v] of this.towers)
      if (!seen.has(id)) {
        this.destroyTowerView(v);
        this.towers.delete(id);
      }
  }

  private towerScreen(t: TowerState): Pt {
    const p = frontPos(t.sectionId, t.t, t.dist);
    return this.wp(p.tx, p.ty);
  }

  private updateTower(state: GameState, t: TowerState, v: TowerView, dt: number): void {
    const c = this.towerScreen(t);
    const x = Math.round(c.x);
    const y = Math.round(c.y);
    const vis = this.inView(x, y - 50, CULL + 40);
    v.visible = vis;
    const burning = t.status === 'yaniyor';
    const wrecked = t.status === 'yikildi';
    const building = t.status === 'insa';
    const stage = building ? Math.min(3, Math.floor(t.progress * 4)) : 4;
    const char = burning ? (t.burn > 0.62 ? 2 : t.burn > 0.22 ? 1 : 0) : 0;
    const depth = y + 12;
    const all: (Img | Spr)[] = [v.body, v.front, v.itici, v.bridge, v.banner, ...v.wheels];
    if (!vis || wrecked) {
      for (const o of all) o.setVisible(false);
      for (const f of [...v.archers, ...v.pushers, ...v.builders]) f.s.setVisible(false);
      v.lumber.setVisible(false);
    }
    // ── wreck ──
    v.wreck.setVisible(vis && wrecked);
    if (wrecked) {
      v.wreck.setPosition(x, y).setDepth(y);
      for (const f of v.fires) f.destroy();
      v.fires = [];
      for (const f of v.flames) f.destroy();
      v.flames = [];
      if (!v.smoke && vis) v.smoke = this.fx().smokeColumn(x, y - 6, 1.6);
      if (v.smoke) v.smoke.setIntensity(Math.max(0, 1 - (state.time.day - t.since) / 2.5));
      if (v.status !== 'yikildi' && vis) {
        // the collapse
        this.fx().debris(x, y - 30, 26, 'tahta');
        this.fx().dust(x, y, 2.6);
        this.fx().smoke(x, y - 20, 3, 6);
        this.fx().shake(0.25, 0.6);
      }
      if (v.light) {
        v.light.destroy();
        v.light = null;
        this.lights--;
      }
      v.status = t.status;
      return;
    }
    v.status = t.status;
    if (!vis) return;

    // ── body ──
    v.body.setTexture(char ? `siege/kule-4-yanik${char}` : `siege/kule-${stage}`);
    // rolling: tiny bob while moving
    const moved = Math.abs(v.lastDist - t.dist);
    v.lastDist = t.dist;
    const moving = t.status === 'ilerliyor';
    v.roll += moved * 40 + (moving ? dt * 1.2 : 0);
    const bob = moving && Math.floor(this.time * 6) % 3 === 0 ? 1 : 0;
    v.body.setPosition(x, y - bob).setDepth(depth).setVisible(true);
    v.front.setTexture(`siege/kule-on${char ? `-yanik${char}` : ''}`).setPosition(x, y - bob).setDepth(depth + 0.4).setVisible(stage === 4);
    v.itici.setPosition(x, y - bob).setDepth(depth + 0.1).setVisible(stage === 4 && !burning);
    if (moving) v.itici.setFrame(Math.floor(v.roll * 0.5) % 4);
    const ox = x - TOWER_ANCHOR.x;
    const oy = y - TOWER_ANCHOR.y - bob;
    v.wheels.forEach((w, i) => {
      const pt = TOWER_PTS.wheels[i];
      w.setTexture(char >= 2 ? 'siege/teker-yanik' : 'siege/teker').setFrame(Math.floor(v.roll) % 4);
      w.setPosition(ox + pt.x, oy + pt.y + bob).setDepth(depth + 0.15).setVisible(stage >= 1);
    });
    // drawbridge drops at the wall
    const wantDown = t.status === 'surda' ? 1 : 0;
    v.bridgeT += Math.sign(wantDown - v.bridgeT) * Math.min(Math.abs(wantDown - v.bridgeT), dt * 0.8);
    const bf = Math.min(3, Math.floor(v.bridgeT * 3.999));
    v.bridge.setFrame(bf).setPosition(ox + TOWER_PTS.bridge.x, oy + TOWER_PTS.bridge.y).setDepth(depth + 0.25).setVisible(stage === 4 && char < 2);
    if (bf === 3 && v.bridgeT >= 0.999 && v.bridgeT - dt * 0.8 < 0.999) {
      this.fx().dust(ox + TOWER_PTS.bridge.x + 18, oy + TOWER_PTS.bridge.y + 8, 1);
      this.fx().debris(ox + TOWER_PTS.bridge.x + 18, oy + TOWER_PTS.bridge.y + 6, 6, 'tas');
    }
    v.banner.setPosition(ox + TOWER_PTS.banner.x, oy + TOWER_PTS.banner.y).setDepth(depth + 0.05).setVisible(stage === 4 && char < 2);

    // ── archers on top ──
    const shooting = stage === 4 && !burning && (t.status === 'ilerliyor' || t.status === 'surda' || t.status === 'bekliyor' || t.status === 'hazir');
    v.shotT -= dt;
    v.archers.forEach((f, i) => {
      if (!shooting) {
        f.s.setVisible(false);
        return;
      }
      const pt = TOWER_PTS.archers[i];
      const cyc = 2.4;
      const ph = (this.time + f.phase) % cyc;
      const k = ph < 0.6 ? 0 : ph < 1.1 ? 1 : ph < 1.9 ? 2 : 3;
      f.s.setFrame(figFrame(FIG.bow, k, 1)).setPosition(ox + pt.x, oy + pt.y).setDepth(depth + 0.2 + i * 0.01).setVisible(true);
      if (k === 3 && ph - dt < 1.9 && t.status !== 'hazir') this.towerArrow(t, ox + pt.x + 4, oy + pt.y - 10);
    });
    // ── pushers behind the left corner ──
    v.pushers.forEach((f, i) => {
      const show = stage === 4 && !burning && (moving || t.status === 'bekliyor' || t.status === 'hazir');
      if (!show) {
        f.s.setVisible(false);
        return;
      }
      const px = ox + 6 - (i % 2) * 5 + Math.floor(i / 2) * 3;
      const py = oy + TOWER_ANCHOR.y - 6 + (i % 2) * 4 + Math.floor(i / 2) * 3;
      const step = moving ? Math.floor(this.time * 4 + f.phase) % 4 : 0;
      f.s.setFrame(moving ? figFrame(FIG.push, step, 1) : figFrame(FIG.idle, Math.floor(this.time + f.phase) % 2, 1));
      f.s.setPosition(px, py).setDepth(py).setVisible(true);
    });
    // wheel dust while rolling
    v.dustT -= dt;
    if (moving && v.dustT <= 0) {
      v.dustT = 0.5 + Math.random() * 0.4;
      const w = TOWER_PTS.wheels[Math.floor(Math.random() * 2)];
      this.fx().dust(ox + w.x, oy + w.y + 7, 0.5);
    }
    // ── builders while under construction ──
    v.lumber.setVisible(building);
    if (building) {
      v.lumber.setPosition(x - 30, y + 6).setDepth(y + 6);
      v.builders.forEach((f, i) => {
        const ang = (i / v.builders.length) * Math.PI * 2 + 0.6;
        const px = Math.round(x + Math.cos(ang) * 30);
        const py = Math.round(y + 4 + Math.sin(ang) * 12);
        const k = Math.floor(this.time * 4 + f.phase) % 4;
        f.s.setFrame(figFrame(i === 4 ? FIG.idle : FIG.dig, i === 4 ? k % 2 : k, px < x ? 1 : -1)).setPosition(px, py).setDepth(py).setVisible(true);
        if (k === 2 && Math.random() < dt * 2) this.fx().dust(px + (px < x ? 6 : -6), py - 1, 0.3);
      });
    } else for (const f of v.builders) f.s.setVisible(false);

    // ── fire: flames climb the hides (own sprites, drawn in front of the tower);
    //    the atmosphere fire at the foot gives light, embers and the smoke column ──
    if (burning) {
      const want = 1 + Math.floor(t.burn * (TOWER_PTS.fires.length - 0.01));
      while (v.flames.length < want) {
        const i = v.flames.length;
        const fl = this.scene.add.sprite(0, 0, 'siege/alev', 0).setOrigin(0.5, 22 / 24);
        fl.play({ key: i % 2 ? 'siege/alev:yan2' : 'siege/alev:yan', startFrame: i % 4 });
        v.flames.push(fl);
      }
      v.flames.forEach((fl, i) => {
        const pt = TOWER_PTS.fires[i];
        fl.setPosition(ox + pt.x, oy + pt.y + 6).setDepth(depth + 0.5 + i * 0.01).setVisible(true);
      });
      if (!v.fires.length) v.fires.push(this.fx().fire(x, y + 2, 2.2));
      v.fires[0].setPosition(x, y + 2);
      v.fires[0].setIntensity(0.85 + 0.15 * Math.sin(this.time * 7));
      v.smokeT -= dt;
      if (v.smokeT <= 0) {
        v.smokeT = 0.25;
        this.fx().smoke(x + (Math.random() - 0.5) * 20, oy + TOWER_PTS.top.y - 4 - t.burn * 10, 1.4 + t.burn, 2);
        if (Math.random() < 0.5) this.fx().sparks(x + (Math.random() - 0.5) * 30, y - 20 - Math.random() * 40, 4);
      }
      if (Math.random() < dt * 1.5) this.fx().debris(x + (Math.random() - 0.5) * 24, y - 30 - Math.random() * 30, 2, 'tahta');
    } else {
      if (v.fires.length) {
        for (const f of v.fires) f.destroy();
        v.fires = [];
      }
      if (v.flames.length) {
        for (const f of v.flames) f.destroy();
        v.flames = [];
      }
    }
    // brazier light on the platform at night (archers' fire pots)
    const wantLight = stage === 4 && !burning && this.night > 0.2;
    if (wantLight && !v.light && this.lights < MAX_LIGHTS) {
      v.light = this.fx().light(ox + TOWER_PTS.top.x, oy + TOWER_PTS.top.y, hex(P.fire[4]), 52, 1.1);
      this.lights++;
    } else if (!wantLight && v.light) {
      v.light.destroy();
      v.light = null;
      this.lights--;
    }
    if (v.light) v.light.setPosition(ox + TOWER_PTS.top.x, oy + TOWER_PTS.top.y);
  }

  private towerArrow(t: TowerState, x: number, y: number): void {
    if (!this.inView(x, y, 40)) return;
    const w = sectionPoint(t.sectionId, Math.max(0, Math.min(1, t.t + (Math.random() - 0.5) * 0.08)));
    const p = this.wp(w.tx, w.ty);
    this.fx().projectile(x, y, p.x + (Math.random() - 0.5) * 10, p.y - 12 - Math.random() * 6, { kind: 'ok', arc: 6, duration: 0.45 });
  }

  // ───────────────────────────── moat crews ─────────────────────────────

  private syncSites(state: GameState, dt: number): void {
    const s = sw(state);
    for (const [sid, site] of Object.entries(s.moat)) {
      if (!hasMoat(sid)) continue;
      let v = this.sites.get(sid);
      const active = site.men > 0.5 || site.amele > 0;
      if (!v && !active && site.dumped <= 0.01) continue;
      if (!v) {
        v = this.newSiteView(sid);
        this.sites.set(sid, v);
      }
      this.updateSite(state, sid, site, v, active, dt);
    }
  }

  private newSiteView(sid: SectionId): SiteView {
    return {
      sid,
      depot: this.img('siege/demet-1', 0.5, 0.8),
      dumps: [0, 1, 2, 3].map(() => this.img('siege/dokuntu-0', 0.5, 0.6).setDepth(DEPTH.GROUND_DECAL + 4)),
      carriers: [],
      visible: true,
    };
  }

  private updateSite(state: GameState, sid: SectionId, site: MoatSite, v: SiteView, active: boolean, dt: number): void {
    const t = site.t;
    const depotT = frontPos(sid, t, 4.7);
    const dp = this.wp(depotT.tx, depotT.ty);
    const vis = this.inView(dp.x, dp.y, CULL + 60);
    v.visible = vis;
    const men = Math.max(site.men, site.amele * 0.8);
    v.depot.setTexture(`siege/demet-${men > 900 ? 2 : men > 300 ? 1 : 0}`);
    v.depot.setPosition(Math.round(dp.x), Math.round(dp.y)).setDepth(Math.round(dp.y)).setVisible(vis && active);
    // dumped material along the moat edge, growing with the fill
    const fill = state.sections[sid]?.moatFill ?? 0;
    const size = fill > 0.55 ? 2 : fill > 0.25 ? 1 : 0;
    v.dumps.forEach((d, i) => {
      const tt = t + (i - 1.5) * 0.035;
      const q = frontPos(sid, Math.max(0.02, Math.min(0.98, tt)), 2.15 + (i % 2) * 0.35);
      const p = this.wp(q.tx, q.ty);
      d.setTexture(`siege/dokuntu-${Math.max(0, size - (i % 2))}`)
        .setPosition(Math.round(p.x), Math.round(p.y))
        .setVisible(vis && (site.dumped > 0.02 || fill > 0.05) && i < 2 + size);
    });
    // carriers
    const want = vis && active ? Math.max(4, Math.min(16, Math.round(men / 60))) : 0;
    while (v.carriers.length < want) {
      const i = v.carriers.length;
      const f = this.fig(i % 3 === 2 ? 'azap' : 'amele', i * 13 + sid.length);
      f.phase = Math.random() * 10;
      f.seed = (i * 0.618) % 1;
      f.torch = i % 3 === 1;
      v.carriers.push(f);
    }
    while (v.carriers.length > want) this.killFig(v.carriers.pop()!);
    const night = this.night > 0.3;
    for (let i = 0; i < v.carriers.length; i++) {
      const f = v.carriers[i];
      const lane = (f.seed - 0.5) * 0.2;
      const tt = Math.max(0.03, Math.min(0.97, t + lane));
      const A = frontPos(sid, tt, 4.35 + (i % 3) * 0.15);
      const B = frontPos(sid, tt, 2.45);
      const pa = this.wp(A.tx, A.ty);
      const pb = this.wp(B.tx, B.ty);
      const speed = 0.5;
      const legT = 1.9 / speed;
      const cyc = legT * 2 + 1.6;
      const ph = (this.time + f.phase) % cyc;
      const torch = night && f.torch;
      const load: 'bundle' | 'basket' = i % 2 ? 'basket' : 'bundle';
      if (ph < legT) {
        const k = ph / legT;
        this.walkFig(f, pa.x + (pb.x - pa.x) * k, pa.y + (pb.y - pa.y) * k, pb.x - pa.x, pb.y - pa.y, torch ? 'torch' : load, Math.floor(ph * 5));
      } else if (ph < legT + 0.9) {
        const k = Math.min(2, Math.floor((ph - legT) * 3.3));
        f.s.setFrame(figFrame(torch ? FIG.idle : FIG.dump, torch ? 0 : k, pb.x - pa.x >= 0 ? 1 : -1)).setPosition(Math.round(pb.x), Math.round(pb.y)).setDepth(Math.round(pb.y));
        if (!torch && k === 2 && Math.random() < dt * 3) this.fx().dust(pb.x + 4, pb.y + 1, 0.45);
      } else if (ph < legT * 2 + 0.9) {
        const k = (ph - legT - 0.9) / legT;
        this.walkFig(f, pb.x + (pa.x - pb.x) * k, pb.y + (pa.y - pb.y) * k, pa.x - pb.x, pa.y - pb.y, torch ? 'torch' : 'walk', Math.floor(ph * 5));
      } else {
        f.s.setFrame(figFrame(FIG.idle, Math.floor(ph * 2) % 2, 1)).setPosition(Math.round(pa.x), Math.round(pa.y)).setDepth(Math.round(pa.y));
      }
      f.s.setVisible(true);
      // torch light
      const wantL = torch && vis;
      if (wantL && !f.light && this.lights < MAX_LIGHTS) {
        f.light = this.fx().light(f.s.x, f.s.y - 16, hex(P.fire[4]), 50, 1.5);
        this.lights++;
      } else if (!wantL && f.light) {
        f.light.destroy();
        f.light = null;
        this.lights--;
      }
      if (f.light) {
        f.light.setPosition(f.s.x + 2, f.s.y - 16);
        f.light.setIntensity(1.4 + 0.15 * Math.sin(this.time * 11 + i));
      }
    }
  }

  // ───────────────────────────── selection ─────────────────────────────

  private updateSelection(state: GameState): void {
    const sel = this.rc.store.ui.selection;
    let mine: Mine | null = null;
    let tower: TowerState | null = null;
    for (const p of sel) {
      if (p.kind === 'mine') mine = state.mines.find((m) => m.id === p.id) ?? null;
      if (p.kind === 'building' && typeof p.id === 'number' && p.id < 0) tower = sw(state).towers.find((t) => t.id === -p.id) ?? null;
    }
    let used = 0;
    const dot = (x: number, y: number, frame: number) => {
      let d = this.dots[used];
      if (!d) {
        d = this.scene.add.sprite(0, 0, 'siege/xray', 0).setDepth(DEPTH.UI_WORLD - 6);
        this.dots.push(d);
      }
      d.setFrame(frame).setPosition(Math.round(x), Math.round(y)).setVisible(true);
      used++;
    };
    const pulse = Math.floor(this.time * 3) % 2;
    this.ring.setVisible(false);
    this.ringB.setVisible(false);
    this.head.setVisible(false);
    this.target.setVisible(false);
    for (const b of Object.values(this.bars)) b.setVisible(false);
    if (mine) {
      const x = sw(state).mineX[mine.id];
      const ent = this.wp(mine.tx, mine.ty);
      this.ring.setFrame(pulse).setPosition(Math.round(ent.x), Math.round(ent.y)).setVisible(true);
      if (x) {
        const len = x.length;
        const n = Math.max(4, Math.round(len / 0.24));
        const alive = mine.status !== 'cokertildi' && mine.status !== 'basarili';
        const dug = Math.max(0, Math.min(1, mine.progress));
        // dashes march toward the wall
        const shift = (this.time * 1.5) % 1;
        for (let i = 0; i <= n; i++) {
          const k = (i + shift) / n;
          if (k > 1) continue;
          if (i % 2 === 1 && k > dug) continue;
          const q = tunnelPoint({ tx: mine.tx, ty: mine.ty }, mine.sectionId, x.t, k);
          const p = this.wp(q.tx, q.ty);
          dot(p.x, p.y + 2, k <= dug ? (alive ? 0 : 3) : 1);
        }
        const hq = tunnelPoint({ tx: mine.tx, ty: mine.ty }, mine.sectionId, x.t, dug);
        const hp = this.wp(hq.tx, hq.ty);
        if (alive) this.head.setFrame(pulse).setPosition(Math.round(hp.x), Math.round(hp.y) - 2).setVisible(true);
        const wq = sectionPoint(mine.sectionId, x.t);
        const wpp = this.wp(wq.tx, wq.ty);
        this.target.setFrame(pulse).setPosition(Math.round(wpp.x), Math.round(wpp.y)).setVisible(true);
        // Byzantine counter-tunnel (red) from inside the wall toward our tunnel face
        if (alive && x.counter >= 0) {
          const n2 = sectionOutwardNormal(mine.sectionId, x.t);
          const from = { tx: wq.tx - n2.tx * 0.8, ty: wq.ty - n2.ty * 0.8 };
          const steps = Math.max(3, Math.round(Math.hypot(hq.tx - from.tx, hq.ty - from.ty) / 0.3));
          for (let i = 0; i <= steps * x.counter; i++) {
            const k = i / steps;
            const p = this.wp(from.tx + (hq.tx - from.tx) * k, from.ty + (hq.ty - from.ty) * k);
            dot(p.x, p.y + 3, 2);
          }
        }
        // bars: tunnel progress + counter-mine
        this.bar(ent.x, ent.y - 22, mine.progress, x.counter >= 0 && alive ? x.counter : -1);
      }
    }
    if (tower && tower.status !== 'yikildi') {
      const c = this.towerScreen(tower);
      this.ringB.setFrame(pulse).setPosition(Math.round(c.x), Math.round(c.y)).setVisible(true);
      // planned path to the wall (stops at the moat edge if it is not filled enough)
      const stop = (state.sections[tower.sectionId]?.moatFill ?? 1) >= 0.6 || !hasMoat(tower.sectionId) ? TOWER_WALL : TOWER_MOAT_STOP;
      for (let d = tower.dist - 0.35; d > TOWER_WALL - 0.01; d -= 0.35) {
        const q = frontPos(tower.sectionId, tower.t, d);
        const p = this.wp(q.tx, q.ty);
        dot(p.x, p.y, d >= stop ? 0 : 2);
      }
      const q = frontPos(tower.sectionId, tower.t, stop);
      const p = this.wp(q.tx, q.ty);
      this.target.setFrame(pulse).setPosition(Math.round(p.x), Math.round(p.y)).setVisible(true);
      if (tower.status === 'insa') this.bar(c.x, c.y - 76, tower.progress, -1);
      else if (tower.status === 'yaniyor') this.bar(c.x, c.y - 76, 1 - tower.burn, -1);
    }
    for (let i = used; i < this.dots.length; i++) this.dots[i].setVisible(false);
  }

  private bar(cx: number, y: number, v: number, v2: number): void {
    const x = Math.round(cx - 11);
    const yy = Math.round(y);
    const b = this.bars;
    b.frame.setPosition(x, yy).setVisible(true);
    b.fill.setPosition(x + 2, yy + 1).setDisplaySize(Math.max(0, Math.round(18 * Math.max(0, Math.min(1, v)))), 2).setVisible(v > 0);
    if (v2 >= 0) {
      b.frame2.setPosition(x, yy + 4).setVisible(true);
      b.fill2.setPosition(x + 2, yy + 5).setDisplaySize(Math.max(0, Math.round(18 * Math.min(1, v2))), 2).setVisible(v2 > 0);
    }
  }

  // ───────────────────────────── picking & orders ─────────────────────────────

  private pick(wx: number, wy: number, state: GameState): PickResult | null {
    let best: PickResult | null = null;
    for (const m of state.mines) {
      const p = this.wp(m.tx, m.ty);
      const dx = (wx - p.x) / 16;
      const dy = (wy - (p.y - 4)) / 11;
      const d = dx * dx + dy * dy;
      if (d <= 1 && (!best || d < best.score)) best = { kind: 'mine', id: m.id, score: d * 0.8 };
    }
    for (const t of sw(state).towers) {
      if (t.status === 'yikildi') continue;
      const c = this.towerScreen(t);
      const left = c.x - 26;
      const right = c.x + 26;
      const top = c.y - (t.status === 'insa' ? 20 + t.progress * 50 : 76);
      const bottom = c.y + 14;
      if (wx >= left && wx <= right && wy >= top && wy <= bottom) {
        const sc = Math.abs(wx - c.x) / 30 + 0.2;
        if (!best || sc < best.score) best = { kind: 'building', id: -t.id, score: sc };
      }
    }
    return best;
  }

  private order(input: OrderInput, state: GameState): boolean {
    const store = this.rc.store;
    const sel = input.selection;
    // siege tower selected → push it toward its wall
    const towerSel = sel.find((p) => p.kind === 'building' && typeof p.id === 'number' && p.id < 0);
    if (towerSel) {
      const t = sw(state).towers.find((x) => x.id === -(towerSel.id as number));
      if (!t) return false;
      store.dispatch({ t: 'kule-ilerlet', sectionId: t.sectionId });
      this.mark(input.wx, input.wy, 'İlerle!');
      return sel.length === 1;
    }
    // mine selected → right-click on it fires a finished tunnel
    const mineSel = sel.find((p) => p.kind === 'mine');
    if (mineSel && input.target?.kind === 'mine' && input.target.id === mineSel.id) {
      const m = state.mines.find((x) => x.id === mineSel.id);
      if (m?.status === 'hazir') {
        store.dispatch({ t: 'ozel', feature: 'siegeworks', action: 'lagim-atesle', payload: { mineId: m.id } });
        this.mark(input.wx, input.wy, 'Ateş!');
        return true;
      }
      return false;
    }
    // sappers only → dig a tunnel under the land wall that was clicked
    const ids = sel.filter((p) => p.kind === 'group').map((p) => Number(p.id));
    if (!ids.length || ids.length !== sel.length) return false;
    const gs = ids.map((id) => state.groups.find((g) => g.id === id)).filter((g): g is UnitGroup => !!g);
    if (!gs.length || !gs.every((g) => g.type === 'lagimci')) return false;
    let sid: SectionId | null = input.target?.kind === 'section' ? String(input.target.id) : null;
    if (!sid) sid = sectionAt(input.tile.tx, input.tile.ty, 2.4);
    if (!sid || !isLand(sid) || state.time.phase !== 'kusatma') return false;
    for (const g of gs) store.dispatch({ t: 'lagim-kaz', sectionId: sid, groupId: g.id });
    this.mark(input.wx, input.wy, 'Lağım kaz!');
    return true;
  }

  private mark(wx: number, wy: number, text: string): void {
    this.fx().floatText(Math.round(wx), Math.round(wy) - 10, text, hex(P.gold[5]));
  }

  // ───────────────────────────── bus reactions ─────────────────────────────

  private mineScreen(id: number): { m: Mine; ent: Pt } | null {
    const s = this.rc.getState();
    const m = s.mines.find((x) => x.id === id);
    if (!m) return null;
    return { m, ent: this.wp(m.tx, m.ty) };
  }

  private onMineStarted(id: number): void {
    const r = this.mineScreen(id);
    if (!r || !this.inView(r.ent.x, r.ent.y)) return;
    this.fx().dust(r.ent.x, r.ent.y, 1.2);
    this.fx().floatText(Math.round(r.ent.x), Math.round(r.ent.y) - 26, 'Lağım!', hex(P.gold[5]));
  }

  private onMineDetected(id: number): void {
    const r = this.mineScreen(id);
    if (!r || !this.inView(r.ent.x, r.ent.y)) return;
    this.fx().floatText(Math.round(r.ent.x), Math.round(r.ent.y) - 28, 'Fark edildi!', hex(P.red[6]));
  }

  private onMineCollapsed(id: number, at: TilePt): void {
    const p = this.wp(at.tx, at.ty);
    const r = this.mineScreen(id);
    const fx = this.fx();
    if (!this.inView(p.x, p.y) && !(r && this.inView(r.ent.x, r.ent.y))) return;
    // the ground sags over the tunnel face; dust bursts from the cave-in and smoke chokes out of the shaft
    fx.shake(0.18, 0.5);
    fx.dust(p.x, p.y, 2.2);
    this.after(0.15, () => fx.dust(p.x - 8, p.y + 2, 1.4));
    this.after(0.3, () => fx.dust(p.x + 9, p.y - 1, 1.4));
    fx.debris(p.x, p.y - 2, 10, 'tas');
    if (r) {
      for (let k = 0; k < 6; k++) this.after(0.2 + k * 0.35, () => fx.smoke(r.ent.x + (Math.random() - 0.5) * 6, r.ent.y - 4, 1.2 + k * 0.1, 2));
      this.after(0.1, () => fx.dust(r.ent.x, r.ent.y - 2, 1.5));
    }
  }

  private onMineSuccess(id: number, sid: SectionId): void {
    const s = this.rc.getState();
    const x = sw(s).mineX[id];
    const t = x?.t ?? 0.5;
    const w = sectionPoint(sid, t);
    const p = this.wp(w.tx, w.ty);
    const fx = this.fx();
    const r = this.mineScreen(id);
    // 1) deep rumble, puffs along the tunnel line
    fx.shake(0.22, 1.1);
    if (r && x) {
      for (let k = 1; k <= 6; k++) {
        const q = tunnelPoint({ tx: r.m.tx, ty: r.m.ty }, sid, t, k / 6);
        const pp = this.wp(q.tx, q.ty);
        this.after(k * 0.09, () => fx.dust(pp.x, pp.y, 0.8));
      }
      this.after(0.1, () => fx.smoke(r.ent.x, r.ent.y - 6, 2.4, 4));
    }
    // 2) the wall drops into the cave-in: flash, blast, debris, an enormous dust plume
    this.after(0.65, () => {
      fx.flash(p.x, p.y - 10, hex(P.fire[5]), 120, 0.5);
      fx.impact(p.x, p.y - 8, 3, true);
      fx.debris(p.x, p.y - 14, 34, 'tas');
      fx.debris(p.x, p.y - 12, 18, 'tugla');
      fx.shake(0.9, 1.4);
      for (let k = -2; k <= 2; k++) fx.dust(p.x + k * 13, p.y - 6 + Math.abs(k) * 2, k === 0 ? 2.8 : 2);
      fx.smoke(p.x, p.y - 20, 2.6, 4);
      fx.floatText(Math.round(p.x), Math.round(p.y) - 46, 'SUR ÇÖKTÜ!', hex(P.gold[6]));
    });
    for (let k = 0; k < 5; k++)
      this.after(1.0 + k * 0.35, () => {
        fx.dust(p.x + (Math.random() - 0.5) * 60, p.y - 4 + (Math.random() - 0.5) * 14, 1.6);
        if (k % 2 === 0) fx.smoke(p.x + (Math.random() - 0.5) * 36, p.y - 18 - k * 3, 2, 2);
      });
  }

  private onTowerBuilt(sid: SectionId): void {
    const t = sw(this.rc.getState()).towers.find((x) => x.sectionId === sid);
    if (!t) return;
    const c = this.towerScreen(t);
    if (!this.inView(c.x, c.y)) return;
    this.fx().dust(c.x - 16, c.y + 4, 1.4);
    this.fx().dust(c.x + 16, c.y + 4, 1.4);
    this.fx().floatText(Math.round(c.x), Math.round(c.y) - 84, 'Kule hazır!', hex(P.gold[6]));
  }

  private onTowerBurned(at: TilePt): void {
    const p = this.wp(at.tx, at.ty);
    if (!this.inView(p.x, p.y)) return;
    const fx = this.fx();
    // powder barrels rolled against the base go off, then the hides catch
    fx.flash(p.x, p.y - 8, hex(P.fire[5]), 90, 0.4);
    fx.impact(p.x - 6, p.y, 1.6, false);
    fx.debris(p.x, p.y - 10, 16, 'tahta');
    fx.shake(0.4, 0.6);
    this.after(0.3, () => fx.smoke(p.x, p.y - 30, 2.4, 5));
  }

  // ───────────────────────────── teardown ─────────────────────────────

  private destroyAll(): void {
    for (const v of this.mines.values()) this.destroyMineView(v);
    for (const v of this.towers.values()) this.destroyTowerView(v);
    for (const v of this.sites.values()) {
      v.depot.destroy();
      for (const d of v.dumps) d.destroy();
      for (const f of v.carriers) this.killFig(f);
    }
    this.mines.clear();
    this.towers.clear();
    this.sites.clear();
    for (const d of this.dots) d.destroy();
    this.dots = [];
    this.timers = [];
  }
}
