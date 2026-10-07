import type Phaser from 'phaser';
import { P, hex } from '../../art/palette';
import { dayToDate } from '../../core/calendar';
import type { OrderInput, PickResult, RenderContext } from '../../core/feature';
import type { LightHandle, LoopHandle } from '../../core/fx';
import type { TilePt } from '../../core/iso';
import { DEPTH } from '../../core/layers';
import type { Cannon, CannonType, GameState } from '../../core/state';
import { lightLevel } from '../atmosphere/api';
import { sectionAt, sectionPoint } from '../fortifications/api';
import { blockedReason, isOnMap } from './api';
import {
  ARKA_GEOM,
  axisOf,
  dirKey,
  sideOf,
  uvFromScreen,
  FLASH_GEOM,
  flashOrigin,
  GUN,
  gunKey,
  headingIndex,
  headingOf,
  MAN_FRAMES,
  muzzleOffset,
  ON_GEOM,
  OX_PX,
  OX_PY,
  OX_W,
  OX_H,
  PERDE_GEOM,
  POSE,
  touchOffset,
  VARIANT,
  VINC_GEOM,
  WAGON,
  type Dir,
  type PoseName,
} from './art';
import { CANNON_EXTRA, CANNON_TYPES } from './data';
import { arty } from './state';

/**
 * ARTILLERY RENDER — batteries with looping crew drills, ox-drawn transport
 * columns, muzzle blasts, balls, impacts, selection rings and bars.
 * Rebuilt on every createRender; never mutates GameState.
 */

type Img = Phaser.GameObjects.Image;
type Spr = Phaser.GameObjects.Sprite;

const CULL_MARGIN = 140;
/** Spacing of the ox pairs along the road (tiles). */
const OX_GAP = 1.85;
const FIRE_POWER: Record<CannonType, number> = { sahi: 3, buyuk: 2, orta: 1.2, kucuk: 0.7, havan: 1.5 };
const IMPACT_POWER: Record<CannonType, number> = { sahi: 2.6, buyuk: 1.7, orta: 1, kucuk: 0.6, havan: 1.2 };
const RING_IDX: Record<CannonType, number> = { sahi: 2, buyuk: 1, orta: 0, kucuk: 0, havan: 0 };

// ───────────────────────────── crew choreography ─────────────────────────────

type Role = 'sungerci' | 'barutcu' | 'gulleci' | 'topcu' | 'cekici' | 'manivela' | 'vinc' | 'usta' | 'orban' | 'yardimci';

interface CrewDef {
  role: Role;
  variant: number;
  /** Rest station (u along barrel, v across; px). */
  rest: [number, number];
  /** Optional per-role extra (e.g. side). */
  k?: number;
}

function crewFor(type: CannonType, dir: Dir): CrewDef[] {
  const defs = crewBase(type);
  // the 's' facing squeezes u on screen: spread the stations so the crew stays readable
  if (dir === 0) for (const d of defs) d.rest = [d.rest[0] * 1.45, d.rest[1] * 1.25];
  return defs;
}

function crewBase(type: CannonType): CrewDef[] {
  const g = GUN[type];
  const L = g.L;
  const R = g.R;
  const V = VARIANT;
  const base: CrewDef[] = [
    { role: 'sungerci', variant: V.kirmizi, rest: [L / 2 + 1, R + 8] },
    { role: 'topcu', variant: V.topcubasi, rest: [-L * 0.31, R + 6] },
  ];
  switch (type) {
    case 'sahi':
      return [
        ...base,
        { role: 'barutcu', variant: V.yesil, rest: [-L / 2 - 4, -(R + 6)] },
        { role: 'gulleci', variant: V.isci, rest: [-L * 0.05, -(R + 10)], k: 0 },
        { role: 'gulleci', variant: V.amele, rest: [L * 0.05, -(R + 12)], k: 1 },
        { role: 'vinc', variant: V.amele, rest: [L / 2 + 6, R + 4], k: 0 },
        { role: 'vinc', variant: V.isci, rest: [L / 2 + 9, R + 6], k: 1 },
        { role: 'cekici', variant: V.mavi, rest: [-L / 2 - 2, -(R + 2)] },
        { role: 'manivela', variant: V.yesil, rest: [-L / 2 - 5, R + 1], k: 1 },
        { role: 'manivela', variant: V.mavi, rest: [-L / 2 - 5, -(R + 1)], k: -1 },
        { role: 'orban', variant: V.orban, rest: [-L / 2 - 8, R + 9] },
        { role: 'usta', variant: V.kirmizi, rest: [-L * 0.1, R + 11] },
      ];
    case 'buyuk':
      return [
        ...base,
        { role: 'barutcu', variant: V.yesil, rest: [-L / 2 - 3, -(R + 5)] },
        { role: 'gulleci', variant: V.isci, rest: [-L * 0.1, -(R + 9)], k: 0 },
        { role: 'cekici', variant: V.mavi, rest: [-L / 2 - 1, -(R + 2)] },
        { role: 'manivela', variant: V.amele, rest: [-L / 2 - 4, R + 1], k: 1 },
        { role: 'usta', variant: V.kirmizi, rest: [-L * 0.05, R + 8] },
      ];
    case 'orta':
      return [...base, { role: 'gulleci', variant: V.isci, rest: [-L * 0.1, -(R + 8)], k: 0 }, { role: 'manivela', variant: V.mavi, rest: [-L / 2 - 4, R + 1], k: 1 }];
    case 'kucuk':
      return [...base, { role: 'gulleci', variant: V.yesil, rest: [-L * 0.1, -(R + 7)], k: 0 }];
    case 'havan':
      return [
        { role: 'sungerci', variant: V.kirmizi, rest: [9, 2] },
        { role: 'topcu', variant: V.topcubasi, rest: [-10, 7] },
        { role: 'gulleci', variant: V.isci, rest: [-6, -11], k: 0 },
        { role: 'barutcu', variant: V.yesil, rest: [-13, -4] },
      ];
  }
}

interface CrewState {
  u: number;
  v: number;
  pose: PoseName;
  /** Screen facing (+1 = looking right). */
  face: 1 | -1;
  frameRate: number;
}

type UV = [number, number];

/** Work stations of a gun for one facing, derived from the real muzzle/touch-hole positions. */
interface Stations {
  dir: Dir;
  mouth: UV;
  mouthFace: 1 | -1;
  touch: UV;
  touchFace: 1 | -1;
  aim: UV;
  wedge: UV;
  /** Screen x offset of a local point (for facing decisions). */
  sx(uv: UV): number;
}

const stationCache = new Map<string, Stations>();
function stationsFor(type: CannonType, dir: Dir): Stations {
  const key = `${type}-${dir}`;
  const hit = stationCache.get(key);
  if (hit) return hit;
  const g = GUN[type];
  const { ax } = axisOf(dir);
  const { sx: sideX } = sideOf(dir);
  const m = muzzleOffset(type, dir);
  const t = touchOffset(type, dir);
  // pole tip of the 'pole' pose sits (17,14) up-left/up-right of the man's feet
  const mouthFace: 1 | -1 = dir === -1 ? 1 : -1;
  const mouth = uvFromScreen(dir, m.x - mouthFace * 17, m.y + (type === 'havan' ? 16 : 14));
  // the slow-match glows (14,−10) from the gunner's feet
  const touchFace: 1 | -1 = dir === -1 ? -1 : 1;
  const touch = uvFromScreen(dir, t.x - touchFace * 14, t.y + 10);
  const st: Stations = {
    dir,
    mouth,
    mouthFace,
    touch,
    touchFace,
    aim: [-g.L / 2 - 4, dir === 0 ? -2 : 1],
    wedge: [-g.L / 2 + 2, -(g.R + 2)],
    sx: ([u, v]) => ax * u + sideX * v,
  };
  stationCache.set(key, st);
  return st;
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const seg = (f: number, a: number, b: number) => Math.max(0, Math.min(1, (f - a) / (b - a)));
const lerp2 = (a: UV, b: UV, t: number): UV => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** Where each crewman is and what he does at cycle fraction f (0 = just fired, 1 = about to fire). */
function crewAt(type: CannonType, S: Stations, def: CrewDef, f: number, active: boolean, idleT: number, idx: number): CrewState {
  const g = GUN[type];
  const L = g.L;
  const R = g.R;
  const rest = def.rest;
  const lookGun = (uv: UV): 1 | -1 => (S.sx(uv) > 0 ? -1 : 1);
  const st = (u: number, v: number, pose: PoseName, face: 1 | -1, fr = 6): CrewState => ({ u, v, pose, face, frameRate: fr });
  const walkBetween = (a: UV, b: UV, t0: number, t1: number, carry: PoseName = 'walk'): CrewState | null => {
    if (f < t0 || f > t1) return null;
    const t = smooth(seg(f, t0, t1));
    const [u, v] = lerp2(a, b, t);
    const dx = S.sx(b) - S.sx(a);
    const face: 1 | -1 = Math.abs(dx) < 1 ? lookGun([u, v]) : dx > 0 ? 1 : -1;
    return st(u, v, carry, face, 8);
  };
  const cover: UV = [rest[0] - 4, rest[1] + Math.sign(rest[1] || 1) * 3];
  const aside: UV = [S.mouth[0] + 2, S.mouth[1] + (S.dir === 0 ? 6 : 5)];
  const preFire = f > 0.84;

  if (!active) {
    // idle at rest: some sit, some stand and chat
    const sitters: Role[] = ['gulleci', 'yardimci', 'vinc', 'barutcu'];
    if (sitters.includes(def.role) && idx % 2 === 0) return st(rest[0], rest[1], 'sit', idx % 3 ? 1 : -1, 1);
    if (def.role === 'topcu') return st(rest[0], rest[1], 'linstock', lookGun(rest), 3);
    return st(rest[0], rest[1], 'idle', (idx + Math.floor(idleT / 4)) % 2 ? 1 : -1, 1.5);
  }

  switch (def.role) {
    case 'sungerci': {
      const w1 = walkBetween(rest, S.mouth, 0.08, 0.14);
      if (w1) return w1;
      if (f >= 0.14 && f < 0.3) return st(S.mouth[0], S.mouth[1], 'pole', S.mouthFace, 7); // swab out the bore
      const w2 = walkBetween(S.mouth, aside, 0.3, 0.33);
      if (w2) return w2;
      if (f >= 0.33 && f < 0.56) return st(aside[0], aside[1], 'idle', S.mouthFace, 1.5);
      const w3 = walkBetween(aside, S.mouth, 0.56, 0.6);
      if (w3) return w3;
      if (f >= 0.6 && f < 0.74) return st(S.mouth[0], S.mouth[1], 'pole', S.mouthFace, 5); // ram the ball home
      const w4 = walkBetween(S.mouth, cover, 0.74, 0.84);
      if (w4) return w4;
      if (f >= 0.84) return st(cover[0], cover[1], 'idle', lookGun(cover), 1.5);
      return st(rest[0], rest[1], 'idle', lookGun(rest), 1.5);
    }
    case 'barutcu': {
      const w1 = walkBetween(rest, S.mouth, 0.3, 0.38, 'sack');
      if (w1) return w1;
      if (f >= 0.38 && f < 0.46) return st(S.mouth[0], S.mouth[1], 'pole', S.mouthFace, 6); // ladle the powder
      const w2 = walkBetween(S.mouth, rest, 0.46, 0.56);
      if (w2) return w2;
      return st(rest[0], rest[1], 'idle', lookGun(rest), 1.5);
    }
    case 'gulleci': {
      if (type === 'sahi') {
        // levermen roll the huge ball to the crane: walk beside it with handspikes
        const p = ballPathSahi(f);
        if (p) {
          const at: UV = [p[0] - 3 - (def.k ?? 0) * 2.5, p[1] - 3 + (def.k ?? 0) * 0.5];
          return st(at[0], at[1], 'lever', S.sx(p) - S.sx(at) >= 0 ? 1 : -1, 4);
        }
        if (f > 0.56 && f < 0.66) return st(L / 2 - 2 - (def.k ?? 0) * 3, -(R + 6), 'idle', 1, 1.5);
        return st(rest[0], rest[1], 'idle', lookGun(rest), 1.5);
      }
      const pile: UV = [rest[0] + 2, rest[1] + 1];
      const w1 = walkBetween(pile, S.mouth, 0.46, 0.58, 'ball');
      if (w1) return w1;
      const w2 = walkBetween(S.mouth, rest, 0.58, 0.68);
      if (w2) return w2;
      return st(rest[0], rest[1], 'idle', lookGun(rest), 1.5);
    }
    case 'vinc': {
      // winch crew heave the ball up
      if (f >= 0.52 && f < 0.64) return st(rest[0], rest[1], 'lever', lookGun(rest), 5);
      return st(rest[0], rest[1], 'idle', lookGun(rest), 1.5);
    }
    case 'manivela': {
      // handspikes: heave the recoiled gun back into battery
      if (f >= 0.04 && f < 0.26) return st(rest[0], rest[1], 'lever', lookGun(rest), 4);
      return st(rest[0] - 1, rest[1] + (def.k ?? 1) * 1, 'idle', lookGun(rest), 1.5);
    }
    case 'cekici': {
      // wedge-man: hammer the quoins to lay the gun
      const w1 = walkBetween(rest, S.wedge, 0.62, 0.66);
      if (w1) return w1;
      if (f >= 0.66 && f < 0.8) return st(S.wedge[0], S.wedge[1], 'hammer', lookGun(S.wedge), 5);
      const w2 = walkBetween(S.wedge, cover, 0.8, 0.86);
      if (w2) return w2;
      const at = preFire ? cover : rest;
      return st(at[0], at[1], 'idle', lookGun(at), 1.5);
    }
    case 'topcu': {
      // master gunner: sights along the barrel, then lights the touch-hole
      if (f >= 0.66 && f < 0.78) return st(S.aim[0], S.aim[1], 'aim', S.dir === -1 ? -1 : 1, 1);
      const w1 = walkBetween(S.aim, S.touch, 0.78, 0.82);
      if (w1) return w1;
      if (f >= 0.82) return st(S.touch[0], S.touch[1], 'linstock', S.touchFace, 6);
      return st(rest[0], rest[1], 'linstock', lookGun(rest), 3);
    }
    case 'orban':
    case 'usta': {
      if (f < 0.08 && type === 'sahi') return st(rest[0], rest[1], 'cheer', lookGun(rest), 4);
      if (preFire) return st(rest[0] - 1, rest[1] + 1, 'idle', lookGun(rest), 1.5);
      return st(rest[0], rest[1], def.role === 'orban' && f > 0.66 ? 'aim' : 'idle', lookGun(rest), 1.5);
    }
    default:
      return st(rest[0], rest[1], 'idle', lookGun(rest), 1.5);
  }
}

/** Şahi ball rolling from the pile to the crane foot (local u,v), or null. */
function ballPathSahi(f: number): UV | null {
  const g = GUN.sahi;
  const a: UV = [-g.L * 0.18, -(g.R + 12)];
  const b: UV = [g.L / 2 + 3, -(g.R + 9)];
  const c: UV = [g.L / 2 + 4, -1];
  if (f < 0.4 || f > 0.56) return null;
  const t = seg(f, 0.4, 0.56);
  return t < 0.7 ? lerp2(a, b, smooth(t / 0.7)) : lerp2(b, c, smooth((t - 0.7) / 0.3));
}

// ───────────────────────────── views ─────────────────────────────

interface BatteryView {
  kind: 'battery';
  zemin: Img;
  arka: Img;
  gun: Img;
  on: Img;
  perde: Spr;
  mangal: Spr;
  flash: Spr;
  spark: Spr;
  crew: Spr[];
  defs: CrewDef[];
  workers: Spr[];
  clods: Spr[];
  vinc: Img | null;
  rope: Img | null;
  ball: Img | null;
  light: LightHandle | null;
  smoke: LoopHandle | null;
  flashT: number;
  sparkT: number;
}

interface ColumnView {
  kind: 'column';
  wagon: Spr;
  oxen: Spr[];
  men: Spr[];
  menRole: ('drover' | 'rope' | 'leveler' | 'guard')[];
  lastW: { x: number; y: number } | null;
  moving: number;
  rutAcc: number;
  breathT: number[];
}

interface CannonView {
  id: number;
  type: CannonType;
  dir: Dir;
  mode: 'battery' | 'column';
  b: BatteryView | null;
  c: ColumnView | null;
  /** Seconds since the last shot (render clock). */
  sinceFire: number;
  flinch: number;
  animT: number;
  stage: number;
  winter: boolean;
}

interface Decal {
  img: Img;
  t: number;
  life: number;
}

interface SelView {
  ring: Spr;
  bar: Img;
  fillA: Img;
  fillB: Img;
  barB: Img;
  warn: Img;
  reticle: Spr;
}

const renders = new WeakMap<RenderContext, ArtilleryRender>();

export function createArtilleryRender(rc: RenderContext): void {
  renders.set(rc, new ArtilleryRender(rc));
}

export function updateArtilleryRender(rc: RenderContext, state: GameState, dt: number): void {
  renders.get(rc)?.update(state, dt);
}

class ArtilleryRender {
  private scene: Phaser.Scene;
  private views = new Map<number, CannonView>();
  private decals: Decal[] = [];
  private ruts: Decal[] = [];
  private puffs: { s: Spr; t: number }[] = [];
  private sel = new Map<number, SelView>();
  private time = 0;
  private lights = 0;

  constructor(private rc: RenderContext) {
    this.scene = rc.scene;
    const bus = rc.bus;
    bus.on('cannon:fire', (e) => this.onFire(e.cannonId, e.type, e.from, e.to));
    bus.on('cannon:impact', (e) => this.onImpact(e.type, e.at, e.hitWall));
    bus.on('cannon:cracked', (e) => this.onCracked(e.cannonId));
    bus.on('cannon:arrived', (e) => this.onArrived(e.cannonId, e.type));
    rc.addPickable({ pick: (wx, wy, s) => this.pick(wx, wy, s) });
    rc.addOrderHandler((input, s) => this.order(input, s));
    this.scene.events.once('shutdown', () => this.destroyAll());
  }

  // ───────── helpers ─────────

  private view(): Phaser.Geom.Rectangle {
    return this.scene.cameras.main.worldView;
  }

  private inView(x: number, y: number, m = CULL_MARGIN): boolean {
    const v = this.view();
    return x > v.x - m && x < v.right + m && y > v.y - m && y < v.bottom + m;
  }

  private dirFor(state: GameState, c: Cannon): Dir {
    if (c.type === 'havan') {
      // the mortar faces the Golden Horn (screen down-left)
      return -1;
    }
    let to: TilePt | null = null;
    if (c.targetSection) {
      const t = arty(state).aim[c.id] ?? 0.5;
      to = sectionPoint(c.targetSection, t);
    }
    if (!to) return 1;
    const a = this.rc.world.toWorld(c.tx, c.ty);
    const b = this.rc.world.toWorld(to.tx, to.ty);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (dy <= 0) return dx >= 0 ? 1 : -1;
    const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
    // e axis is 26.6°, s is 90°, w is 153.4° — pick the closest
    return ang < 58 ? 1 : ang > 122 ? -1 : 0;
  }

  private local(px: number, py: number, dir: Dir, u: number, v: number): { x: number; y: number } {
    const { ax, ay } = axisOf(dir);
    const { sx, sy } = sideOf(dir);
    return { x: Math.round(px + ax * u + sx * v), y: Math.round(py + ay * u + sy * v) };
  }

  private img(key: string, ox: number, oy: number, w: number, h: number): Img {
    return this.scene.add.image(0, 0, key).setOrigin(ox / w, oy / h);
  }

  private man(variant: number): Spr {
    return this.scene.add.sprite(0, 0, `topcu/adam-${variant}`, 0).setOrigin(16 / 32, 22 / 24);
  }

  private setMan(s: Spr, pose: PoseName, screenFace: 1 | -1, t: number, rate: number, phase = 0): void {
    const frames = POSE[pose] as readonly number[];
    const fi = frames[Math.floor(t * rate + phase) % frames.length];
    s.setFrame(fi + (screenFace === 1 ? 0 : MAN_FRAMES));
  }

  private winter(state: GameState): boolean {
    const m = dayToDate(state.time.day).month;
    return m === 12 || m === 1 || m === 2;
  }

  // ───────── update ─────────

  update(state: GameState, dt: number): void {
    this.time += dt;
    const seen = new Set<number>();
    const selected = new Set<number>();
    for (const p of this.rc.store.ui.selection) if (p.kind === 'cannon') selected.add(Number(p.id));
    const night = 1 - lightLevel(state);
    this.lights = 0;
    const winter = this.winter(state);
    // gameplay animation follows the game clock (frozen while paused)
    const simDt = state.time.speed === 0 || state.outcome ? 0 : dt * Math.min(3, state.time.speed * state.time.debugSpeed);

    for (const c of state.cannons) {
      if (!isOnMap(state, c)) continue;
      const w = this.rc.world.toWorld(c.tx, c.ty);
      if (!this.inView(w.x, w.y, c.status === 'yolda' ? 420 : CULL_MARGIN)) continue;
      seen.add(c.id);
      const job = arty(state).emplace[c.id];
      const mode: CannonView['mode'] = c.status === 'yolda' || (c.status === 'mevzileniyor' && job?.phase === 'tasima') ? 'column' : 'battery';
      let v = this.views.get(c.id);
      const dir = mode === 'column' ? (v?.dir ?? 1) : this.dirFor(state, c);
      if (v && (v.mode !== mode || (mode === 'battery' && v.dir !== dir) || v.winter !== winter)) {
        this.destroyView(v);
        v = undefined;
      }
      if (!v) {
        v = { id: c.id, type: c.type, dir, mode, b: null, c: null, sinceFire: 99, flinch: 0, animT: (c.id * 1.37) % 10, stage: -1, winter };
        if (mode === 'battery') v.b = this.makeBattery(c.type, dir);
        else v.c = this.makeColumn(c.type, winter);
        this.views.set(c.id, v);
      }
      v.animT += simDt;
      v.sinceFire += simDt;
      v.flinch = Math.max(0, v.flinch - simDt);
      if (v.b) this.updateBattery(state, c, v, w, dt, night);
      if (v.c) this.updateColumn(state, c, v, dt);
      if (selected.has(c.id) || (v.b && c.status === 'hazir' && isAmmoBlock(state, c))) this.updateSel(state, c, v, w, selected.has(c.id));
      else this.hideSel(c.id);
    }
    for (const [id, v] of this.views) {
      if (!seen.has(id)) {
        this.destroyView(v);
        this.views.delete(id);
      }
    }
    for (const [id] of this.sel) if (!seen.has(id)) this.hideSel(id, true);
    this.updateDecals(dt);
  }

  // ───────── battery ─────────

  private makeBattery(type: CannonType, dir: Dir): BatteryView {
    const g = GUN[type];
    const k = dirKey(dir);
    const zt = this.scene.textures.get(`topcu/zemin-${type}-${k}`).getSourceImage() as HTMLCanvasElement;
    const zemin = this.img(`topcu/zemin-${type}-${k}`, Math.floor(zt.width / 2), Math.floor(zt.height / 2), zt.width, zt.height).setDepth(DEPTH.GROUND_DECAL + 1);
    const arka = this.img(`topcu/arka-${type}-${k}`, ARKA_GEOM.px, ARKA_GEOM.py, ARKA_GEOM.w, ARKA_GEOM.h);
    const gun = this.img(gunKey(type, dir), g.px, g.py, g.w, g.h);
    const on = this.img(`topcu/on-${type}-${k}-2`, ON_GEOM.px, ON_GEOM.py, ON_GEOM.w, ON_GEOM.h);
    const perde = this.scene.add.sprite(0, 0, `topcu/perde-${type}-${k}`, 0).setOrigin(PERDE_GEOM.px / PERDE_GEOM.w, PERDE_GEOM.py / PERDE_GEOM.h);
    const mangal = this.scene.add.sprite(0, 0, 'topcu/mangal', 0).setOrigin(5 / 11, 11 / 13);
    mangal.play({ key: 'topcu/mangal:yan', startFrame: Math.floor(Math.random() * 4) });
    const fs = g.fx;
    const fg = FLASH_GEOM(fs);
    const up = type === 'havan';
    const fo = flashOrigin(fs, dir, up);
    const flash = this.scene.add
      .sprite(0, 0, up ? `topcu/alev-havan-${k}` : `topcu/alev-${fs}-${k}`, 0)
      .setOrigin(fo.x / fg.w, fo.y / (fg.h + (up ? 8 : 0)))
      .setVisible(false);
    const spark = this.scene.add.sprite(0, 0, 'topcu/kivilcim', 0).setOrigin(3 / 8, 5 / 8).setVisible(false);
    const defs = crewFor(type, dir);
    const crew = defs.map((d) => this.man(d.variant));
    let vinc: Img | null = null;
    let rope: Img | null = null;
    let ball: Img | null = null;
    if (type === 'sahi' && dir !== 0) {
      vinc = this.img(`topcu/vinc-${k}`, VINC_GEOM.px, VINC_GEOM.py, VINC_GEOM.w, VINC_GEOM.h);
      rope = this.scene.add.image(0, 0, 'topcu/ip').setOrigin(0, 0);
    }
    if (type !== 'kucuk') ball = this.scene.add.image(0, 0, `topcu/gulle-${g.ball}`).setVisible(false);
    return { kind: 'battery', zemin, arka, gun, on, perde, mangal, flash, spark, crew, defs, workers: [], clods: [], vinc, rope, ball, light: null, smoke: null, flashT: 99, sparkT: 99 };
  }

  private updateBattery(state: GameState, c: Cannon, v: CannonView, w: { x: number; y: number }, dt: number, night: number): void {
    const b = v.b!;
    const g = GUN[c.type];
    const dir = v.dir;
    const k = dirKey(dir);
    const px = Math.round(w.x);
    const py = Math.round(w.y);
    const def = CANNON_TYPES[c.type];
    const emplacing = c.status === 'mevzileniyor';
    const prog = emplacing ? c.progress : 1;
    const stage = emplacing ? (prog < 0.35 ? 0 : prog < 0.75 ? 1 : 2) : 2;

    // ground + works
    b.zemin.setPosition(px, py).setAlpha(emplacing ? 0.35 + 0.65 * Math.min(1, prog * 1.6) : 1);
    b.arka.setPosition(px, py).setDepth(py - 4).setVisible(!emplacing || prog > 0.45);
    if (stage !== v.stage) {
      v.stage = stage;
      if (stage > 0) b.on.setTexture(`topcu/on-${c.type}-${k}-${stage}`);
      b.on.setVisible(stage > 0);
      b.perde.setVisible(stage >= 2 && c.type !== 'havan');
    }
    const frontY = Math.round((g.L / 2 + 8) * axisOf(dir).ay);
    b.on.setPosition(px, py).setDepth(py + frontY + 2);
    const perdePos = this.local(px, py, dir, g.L / 2 + (c.type === 'sahi' ? 10 : 8), 0);
    b.perde.setPosition(perdePos.x, perdePos.y).setDepth(py + frontY + 1);
    const mp = this.local(px, py, dir, -g.L / 2 - 6, g.R + 12);
    b.mangal.setPosition(mp.x, mp.y).setDepth(mp.y);

    // gun with recoil
    const active = !emplacing && c.status === 'hazir' && !blockedReason(state, c);
    const reload = def.reloadSec;
    let f = active ? Math.max(0, Math.min(1, 1 - c.cooldown / reload)) : 0;
    if (active && c.cooldown <= 0) f = 1;
    const rec = v.sinceFire < 0.08 ? 1 : Math.max(0, 1 - smooth(seg(f, 0.04, 0.26)));
    const recPx = v.sinceFire < 3 || (active && f < 0.3) ? Math.round(rec * g.recoil) : 0;
    const gp = this.local(px, py, dir, -recPx * 2.24, 0);
    b.gun.setPosition(gp.x, gp.y).setDepth(py);
    b.gun.setTint(c.status === 'kirik' ? 0x8c7f78 : 0xffffff);

    // mantlet: raised just before and during the shot
    const raise = v.sinceFire < 0.6 ? 2 : v.sinceFire < 0.9 ? 1 : active ? (f > 0.88 ? 2 : f > 0.84 ? 1 : 0) : 0;
    b.perde.setFrame(raise);

    // Şahi crane, rope, ball
    if (b.vinc) {
      const cp = this.local(px, py, dir, g.L / 2 + 4, -1);
      b.vinc.setPosition(cp.x, cp.y).setDepth(py + 3).setVisible(stage >= 1);
      const topY = cp.y - VINC_GEOM.top + 3;
      let ballH = 0;
      let ballUV: [number, number] | null = null;
      if (active) {
        const roll = ballPathSahi(f);
        if (roll) ballUV = roll;
        else if (f >= 0.56 && f < 0.64) {
          ballUV = [g.L / 2 + 4, -1];
          ballH = smooth(seg(f, 0.56, 0.63)) * (g.elev - 1);
        } else if (f >= 0.64 && f < 0.68) {
          const t = smooth(seg(f, 0.64, 0.68));
          ballUV = [g.L / 2 + 4 - t * 4, -1];
          ballH = g.elev - 1;
        }
      }
      if (ballUV && b.ball) {
        const bp = this.local(px, py, dir, ballUV[0], ballUV[1]);
        const by = bp.y - 3 - Math.round(ballH);
        b.ball.setPosition(bp.x, by).setDepth(py + (ballH > 0 ? 4 : -2)).setVisible(true);
        const len = Math.max(1, by - 3 - topY);
        const hoisting = ballH > 0;
        b.rope!.setVisible(stage >= 1 && hoisting).setPosition(cp.x, topY).setCrop(0, 0, 1, Math.min(40, len)).setDepth(py + 3.5);
        if (!hoisting) b.rope!.setVisible(stage >= 1).setCrop(0, 0, 1, 6);
      } else {
        b.ball?.setVisible(false);
        b.rope!.setVisible(stage >= 1).setPosition(cp.x, topY).setCrop(0, 0, 1, 6).setDepth(py + 3.5);
      }
    } else if (b.ball) {
      b.ball.setVisible(false);
    }

    // crew
    const working = emplacing;
    if (working) this.ensureWorkers(b, c.type);
    else if (b.workers.length) this.clearWorkers(b);
    const S = stationsFor(c.type, dir);
    for (let i = 0; i < b.crew.length; i++) {
      const s = b.crew[i];
      const d = b.defs[i];
      if (working && i >= 3) {
        s.setVisible(false);
        continue;
      }
      s.setVisible(true);
      let cs = crewAt(c.type, S, d, f, active, v.animT + i, i);
      if (working) cs = { u: d.rest[0] - 2, v: d.rest[1] + 2, pose: i === 0 ? 'lever' : 'idle', face: 1, frameRate: i === 0 ? 4 : 1.5 };
      if (c.status === 'kirik') cs = i < 2 ? { u: -2 + i * 6, v: g.R + 4, pose: 'hammer', face: 1, frameRate: 5 } : { ...cs, pose: i % 2 ? 'sit' : 'idle', frameRate: 1 };
      if (c.status === 'soguyor' && i < 2 && c.type === 'sahi') cs = { u: -g.L * 0.1 + i * 10, v: -(g.R + 3), pose: 'pour', face: 1, frameRate: 2 };
      if (v.flinch > 0 && (d.role !== 'topcu' || v.flinch < 0.3)) cs = { ...cs, pose: d.role === 'orban' || d.role === 'usta' ? 'cheer' : 'flinch', frameRate: 6 };
      const pos = this.local(px, py, dir, cs.u, cs.v);
      this.setMan(s, cs.pose, cs.face, v.animT, cs.frameRate, i * 0.37);
      // long diagonal barrels: sort by side of the barrel; the 's' facing sorts naturally by foot y
      const depth = dir === 0 ? pos.y + (Math.abs(cs.v) < g.R + 1 && cs.u > 0 ? 2 : 0) : py + (cs.v >= 0 ? 1 + cs.v * 0.6 : -1 + cs.v * 0.6) + (cs.u > g.L / 2 ? 1.5 : 0);
      s.setPosition(pos.x, pos.y).setDepth(depth);
    }
    if (working) this.updateWorkers(b, c.type, px, py, dir, v.animT);

    // touch-hole fizz just before the shot
    if (active && f > 0.93) {
      const tp = touchOffset(c.type, dir);
      b.spark.setVisible(true).setPosition(gp.x + tp.x, gp.y + tp.y).setDepth(py + 30).setFrame(Math.floor(v.animT * 14) % 4);
    } else b.spark.setVisible(false);

    // muzzle flash sprite
    if (b.flashT < 0.3) {
      b.flashT += dt;
      const fr = Math.min(4, Math.floor((b.flashT / 0.3) * 5));
      const mo = muzzleOffset(c.type, dir);
      b.flash.setVisible(true).setFrame(fr).setPosition(gp.x + mo.x, gp.y + mo.y).setDepth(py + 60);
    } else b.flash.setVisible(false);

    // night light from the brazier
    if (night > 0.35 && this.lights < 18) {
      this.lights++;
      if (!b.light) b.light = this.rc.fx.light(mp.x, mp.y - 6, hex(P.fire[4]), 72, 0);
      b.light.setPosition(mp.x, mp.y - 6);
      // brazier flicker, flaring while the slow-match is carried to the touch-hole
      const flare = active && f > 0.8 ? 0.25 : 0;
      b.light.setIntensity((0.85 + flare) * night + Math.sin(this.time * 9 + c.id) * 0.08 + Math.sin(this.time * 23 + c.id * 3) * 0.04);
    } else if (b.light) {
      b.light.destroy();
      b.light = null;
    }
    // cracked barrel smoulders
    if (c.status === 'kirik' && !b.smoke) b.smoke = this.rc.fx.smokeColumn(px, py - g.elev - 4, 0.7);
    else if (c.status !== 'kirik' && b.smoke) {
      b.smoke.destroy();
      b.smoke = null;
    }
    // cooling Şahi steams
    if (c.status === 'soguyor' && Math.random() < dt * 1.5) this.rc.fx.smoke(px + (Math.random() - 0.5) * 16, py - g.elev - 4, 0.6, 1);
  }

  private ensureWorkers(b: BatteryView, type: CannonType): void {
    const n = Math.max(3, Math.min(8, Math.round(CANNON_EXTRA[type].crewVisible * 0.6)));
    while (b.workers.length < n) {
      const s = this.man(b.workers.length % 2 ? VARIANT.amele : VARIANT.isci);
      b.workers.push(s);
      const cl = this.scene.add.sprite(0, 0, 'topcu/toprak', 0).setOrigin(0, 1).setVisible(false);
      b.clods.push(cl);
    }
  }

  private clearWorkers(b: BatteryView): void {
    for (const s of b.workers) s.destroy();
    for (const s of b.clods) s.destroy();
    b.workers = [];
    b.clods = [];
  }

  private updateWorkers(b: BatteryView, type: CannonType, px: number, py: number, dir: Dir, t: number): void {
    const g = GUN[type];
    const n = b.workers.length;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.4;
      const u = Math.cos(a) * (g.L / 2 + 8);
      const vv = Math.sin(a) * (g.R + 9);
      const pos = this.local(px, py, dir, u, vv);
      const pose: PoseName = i % 3 === 2 ? 'pick' : 'shovel';
      const face: 1 | -1 = pos.x > px ? -1 : 1;
      this.setMan(b.workers[i], pose, face, t, 3, i * 0.5);
      b.workers[i].setPosition(pos.x, pos.y).setDepth(py + vv * 0.6);
      const cl = b.clods[i];
      const ph = (t * 3 + i * 0.5) % 2;
      if (pose === 'shovel' && ph > 1) {
        cl.setVisible(true).setFrame(Math.min(4, Math.floor((ph - 1) * 5))).setPosition(pos.x + (face === 1 ? 2 : -8), pos.y - 6).setFlipX(face === -1).setDepth(py + vv * 0.6 + 0.5);
      } else cl.setVisible(false);
    }
  }

  // ───────── transport column ─────────

  private makeColumn(type: CannonType, winter: boolean): ColumnView {
    const ex = CANNON_EXTRA[type];
    const wg = WAGON[type];
    const wagon = this.scene.add.sprite(0, 0, `topcu/araba-${type}-h0${winter ? '-kar' : ''}`, 0).setOrigin(wg.px / wg.w, wg.py / wg.h);
    const oxen: Spr[] = [];
    for (let i = 0; i < ex.oxPairs; i++) oxen.push(this.scene.add.sprite(0, 0, `topcu/okuz-h0-${i % 2}${winter ? '-kar' : ''}`, 0).setOrigin(OX_PX / OX_W, OX_PY / OX_H));
    const men: Spr[] = [];
    const menRole: ColumnView['menRole'] = [];
    const drovers = Math.max(1, Math.ceil(ex.oxPairs / 2));
    for (let i = 0; i < drovers; i++) {
      men.push(this.man(i % 3 === 0 ? VARIANT.mavi : VARIANT.amele));
      menRole.push('drover');
    }
    const ropes = type === 'sahi' ? 8 : type === 'buyuk' ? 4 : 0;
    for (let i = 0; i < ropes; i++) {
      men.push(this.man(i % 2 ? VARIANT.isci : VARIANT.amele));
      menRole.push('rope');
    }
    const levelers = type === 'sahi' ? 7 : type === 'buyuk' ? 3 : 0;
    for (let i = 0; i < levelers; i++) {
      men.push(this.man(i % 2 ? VARIANT.isci : VARIANT.amele));
      menRole.push('leveler');
    }
    const guards = type === 'sahi' ? 4 : 1;
    for (let i = 0; i < guards; i++) {
      men.push(this.man(i === 0 && type === 'sahi' ? VARIANT.orban : i % 2 ? VARIANT.kirmizi : VARIANT.yesil));
      menRole.push('guard');
    }
    return { kind: 'column', wagon, oxen, men, menRole, lastW: null, moving: 0, rutAcc: 0, breathT: oxen.map(() => Math.random() * 3) };
  }

  /** Path (tiles) the column follows and the wagon's arc position along it. */
  private columnPath(state: GameState, c: Cannon): { path: TilePt[]; s: number } {
    if (c.status === 'yolda' && c.path.length >= 2) {
      const path = c.path;
      return { path, s: locate(path, { tx: c.tx, ty: c.ty }) };
    }
    const job = arty(state).emplace[c.id];
    const dest = job ? { tx: job.tx, ty: job.ty } : { tx: c.tx + 1, ty: c.ty };
    const next = c.path[0] ?? dest;
    const dx = next.tx - c.tx;
    const dy = next.ty - c.ty;
    const l = Math.hypot(dx, dy) || 1;
    const start = { tx: c.tx - (dx / l) * 6, ty: c.ty - (dy / l) * 6 };
    const prev = c.path.length ? c.path[c.path.length - 1] : { tx: c.tx, ty: c.ty };
    let ldx = dest.tx - prev.tx;
    let ldy = dest.ty - prev.ty;
    const ll = Math.hypot(ldx, ldy) || 1;
    ldx /= ll;
    ldy /= ll;
    // past the battery site the team swings aside (away from the walls) instead of marching on
    const turn = -ldy < ldy ? { tx: -ldy, ty: ldx } : { tx: ldy, ty: -ldx };
    const ext = { tx: dest.tx + turn.tx * 30, ty: dest.ty + turn.ty * 30 };
    const path = [start, { tx: c.tx, ty: c.ty }, ...c.path, { tx: dest.tx, ty: dest.ty }, ext];
    return { path, s: 6 };
  }

  private updateColumn(state: GameState, c: Cannon, v: CannonView, dt: number): void {
    const col = v.c!;
    const ex = CANNON_EXTRA[c.type];
    const world = this.rc.world;
    const { path, s } = this.columnPath(state, c);
    const at = (sArc: number, lat: number): { x: number; y: number; dir: 1 | -1; hi: number } => {
      const p = pointAt(path, sArc);
      const nx = -p.dy;
      const ny = p.dx;
      const w = world.toWorld(p.tx + nx * lat, p.ty + ny * lat);
      const a = world.toWorld(p.tx, p.ty);
      const b = world.toWorld(p.tx + p.dx, p.ty + p.dy);
      const hi = headingIndex(p.dx, p.dy);
      const hd = headingOf(hi);
      return { x: Math.round(w.x), y: Math.round(w.y), dir: Math.abs(b.x - a.x) > 0.5 ? (b.x - a.x >= 0 ? 1 : -1) : hd.f, hi };
    };
    const wp = at(s, 0);
    if (col.lastW) {
      const moved = Math.hypot(wp.x - col.lastW.x, wp.y - col.lastW.y);
      col.moving = moved > 0 ? 0.6 : Math.max(0, col.moving - dt);
      col.rutAcc += moved;
    }
    col.lastW = { x: wp.x, y: wp.y };
    const moving = col.moving > 0;
    const t = v.animT;
    const wk = v.winter ? '-kar' : '';
    // wagon
    const wg = WAGON[c.type];
    col.wagon.setTexture(`topcu/araba-${c.type}-h${wp.hi}${wk}`, moving ? Math.floor(t * 4) % 2 : 0);
    col.wagon.setPosition(wp.x, wp.y).setDepth(wp.y);
    void wg;
    // ruts behind the wagon
    if (col.rutAcc > 7) {
      col.rutAcc = 0;
      this.addRut(wp.x, wp.y, wp.hi, v.winter);
    }
    // oxen ahead, spacing ~1 tile
    const wagonHalf = c.type === 'sahi' ? 2.0 : c.type === 'buyuk' ? 1.5 : 1.1;
    for (let i = 0; i < col.oxen.length; i++) {
      const o = col.oxen[i];
      const p = at(s + wagonHalf + 0.9 + i * OX_GAP, 0);
      o.setTexture(`topcu/okuz-h${p.hi}-${i % 2}${wk}`, moving ? Math.floor(t * 6 + i * 1.3) % 4 : 0);
      o.setPosition(p.x, p.y).setDepth(p.y);
      if (v.winter) {
        col.breathT[i] -= dt;
        if (col.breathT[i] <= 0) {
          col.breathT[i] = 1.6 + Math.random() * 2;
          this.puff(p.x + p.dir * 10, p.y - 8);
        }
      }
    }
    const headS = s + wagonHalf + 0.9 + (col.oxen.length - 1) * OX_GAP;
    let di = 0;
    let ri = 0;
    let li = 0;
    let gi = 0;
    for (let i = 0; i < col.men.length; i++) {
      const m = col.men[i];
      const role = col.menRole[i];
      let p: { x: number; y: number; dir: 1 | -1 };
      let pose: PoseName = 'walk';
      let face: 1 | -1;
      if (role === 'drover') {
        p = at(s + wagonHalf + 0.9 + di * OX_GAP * 2 + 0.5, di % 2 ? -1.0 : 1.0);
        pose = 'goad';
        face = p.dir;
        di++;
      } else if (role === 'rope') {
        const side = ri % 2 ? -1.1 : 1.1;
        p = at(s - wagonHalf * 0.6 + Math.floor(ri / 2) * (wagonHalf * 0.55), side);
        pose = 'rope';
        face = p.dir;
        ri++;
      } else if (role === 'leveler') {
        // they work the road ahead, hopping forward in stages
        const base = Math.floor((headS + 3) / 4) * 4 + 2.5;
        p = at(base + li * 0.7, (li % 3) - 1);
        pose = li % 2 ? 'pick' : 'shovel';
        face = (li % 2 ? -p.dir : p.dir) as 1 | -1;
        li++;
      } else {
        p = at(s - wagonHalf - 1.2 - gi * 0.8, gi % 2 ? 0.7 : -0.7);
        face = p.dir;
        gi++;
      }
      const rate = role === 'leveler' ? 3 : moving ? 7 : 0;
      if (!moving && role !== 'leveler') pose = role === 'rope' ? 'rope' : 'idle';
      this.setMan(m, pose, face, t, rate || 1.2, i * 0.7);
      m.setPosition(p.x, p.y).setDepth(p.y);
    }
    void ex;
  }

  private addRut(x: number, y: number, hi: number, snow: boolean): void {
    const key = `topcu/iz-h${hi}${snow ? '-kar' : ''}`;
    let d: Decal;
    if (this.ruts.length >= 140) {
      d = this.ruts.shift()!;
      d.img.setTexture(key);
    } else d = { img: this.scene.add.image(0, 0, key), t: 0, life: 0 };
    d.t = 0;
    d.life = 120;
    d.img.setPosition(x, y).setDepth(DEPTH.GROUND_DECAL + 2).setAlpha(0.9).setVisible(true);
    this.ruts.push(d);
  }

  private puff(x: number, y: number): void {
    let p = this.puffs.find((q) => q.t >= 0.9);
    if (!p) {
      if (this.puffs.length > 30) return;
      p = { s: this.scene.add.sprite(0, 0, 'topcu/nefes', 0).setOrigin(0.5), t: 0 };
      this.puffs.push(p);
    }
    p.t = 0;
    p.s.setPosition(Math.round(x), Math.round(y)).setVisible(true).setDepth(DEPTH.AIR - 10).setFrame(0);
  }

  private updateDecals(dt: number): void {
    for (const d of this.decals) {
      d.t += dt;
      const a = d.t > d.life * 0.7 ? Math.max(0, 1 - (d.t - d.life * 0.7) / (d.life * 0.3)) : 1;
      d.img.setAlpha(a * 0.95).setVisible(a > 0.02);
    }
    for (const d of this.ruts) {
      d.t += dt;
      const a = Math.max(0, 1 - d.t / d.life);
      d.img.setAlpha(a * 0.9).setVisible(a > 0.02);
    }
    for (const p of this.puffs) {
      if (p.t >= 0.9) continue;
      p.t += dt;
      p.s.setFrame(Math.min(2, Math.floor((p.t / 0.9) * 3)));
      p.s.y -= dt * 6;
      if (p.t >= 0.9) p.s.setVisible(false);
    }
  }

  // ───────── selection overlay ─────────

  private updateSel(state: GameState, c: Cannon, v: CannonView, w: { x: number; y: number }, selected: boolean): void {
    let s = this.sel.get(c.id);
    if (!s) {
      const ri = RING_IDX[c.type];
      s = {
        ring: this.scene.add.sprite(0, 0, `topcu/halka-${ri}`, 0).setDepth(DEPTH.GROUND_DECAL + 5),
        bar: this.scene.add.image(0, 0, 'topcu/bar').setOrigin(0, 0).setDepth(DEPTH.UI_WORLD),
        fillA: this.scene.add.image(0, 0, 'topcu/bar-dolum').setOrigin(0, 0).setDepth(DEPTH.UI_WORLD + 1),
        barB: this.scene.add.image(0, 0, 'topcu/bar').setOrigin(0, 0).setDepth(DEPTH.UI_WORLD),
        fillB: this.scene.add.image(0, 0, 'topcu/bar-isi').setOrigin(0, 0).setDepth(DEPTH.UI_WORLD + 1),
        warn: this.scene.add.image(0, 0, 'topcu/uyari').setOrigin(0.5, 1).setDepth(DEPTH.UI_WORLD + 2),
        reticle: this.scene.add.sprite(0, 0, 'topcu/hedef', 0).setDepth(DEPTH.UI_WORLD - 1),
      };
      this.sel.set(c.id, s);
    }
    const g = GUN[c.type];
    let px = Math.round(w.x);
    let py = Math.round(w.y);
    if (v.c) {
      px = v.c.wagon.x;
      py = v.c.wagon.y;
    }
    s.ring.setVisible(selected).setPosition(px, py).setFrame(Math.floor(this.time * 2.5) % 2);
    const topY = py - g.elev - g.R * 2 - 12;
    const bx = px - 10;
    const def = CANNON_TYPES[c.type];
    let a = 1;
    if (c.status === 'hazir') a = Math.max(0, Math.min(1, 1 - c.cooldown / def.reloadSec));
    else if (c.status === 'mevzileniyor' || c.status === 'yolda') a = c.progress;
    else if (c.status === 'soguyor') a = 0;
    s.bar.setVisible(selected).setPosition(bx, topY);
    s.fillA.setVisible(selected).setPosition(bx + 1, topY + 1).setCrop(0, 0, Math.round(18 * a), 2);
    const showHeat = selected && (c.status === 'hazir' || c.status === 'soguyor' || c.status === 'kirik');
    s.barB.setVisible(showHeat).setPosition(bx, topY + 4);
    s.fillB.setVisible(showHeat).setPosition(bx + 1, topY + 5).setCrop(0, 0, Math.round(18 * c.heat), 2);
    const reason = c.status === 'hazir' && !v.c ? blockedReason(state, c) : null;
    const warn = c.status === 'kirik' || (reason != null && (selected || isAmmoBlock(state, c)) && reason !== 'Bugünkü atışlar tamamlandı.');
    s.warn.setVisible(warn).setPosition(px, topY - 2 + Math.round(Math.sin(this.time * 4) * 1.2));
    if (selected && c.targetSection && (c.status === 'hazir' || c.status === 'soguyor' || c.status === 'mevzileniyor')) {
      const tp = sectionPoint(c.targetSection, arty(state).aim[c.id] ?? 0.5);
      const tw = this.rc.world.toWorld(tp.tx, tp.ty);
      s.reticle.setVisible(true).setPosition(Math.round(tw.x), Math.round(tw.y) - 8).setFrame(Math.floor(this.time * 3) % 2);
    } else s.reticle.setVisible(false);
  }

  private hideSel(id: number, destroy = false): void {
    const s = this.sel.get(id);
    if (!s) return;
    if (destroy) {
      for (const o of [s.ring, s.bar, s.fillA, s.barB, s.fillB, s.warn, s.reticle]) o.destroy();
      this.sel.delete(id);
      return;
    }
    for (const o of [s.ring, s.bar, s.fillA, s.barB, s.fillB, s.warn, s.reticle]) o.setVisible(false);
  }

  // ───────── events ─────────

  private onFire(id: number, type: CannonType, from: TilePt, to: TilePt): void {
    const state = this.rc.getState();
    const fx = this.rc.fx;
    const world = this.rc.world;
    const v = this.views.get(id);
    const a = world.toWorld(from.tx, from.ty);
    const b = world.toWorld(to.tx, to.ty);
    const dir: Dir = v?.dir ?? (b.x - a.x >= 0 ? 1 : -1);
    const g = GUN[type];
    const mo = muzzleOffset(type, dir);
    const mx = Math.round(a.x) + mo.x;
    const my = Math.round(a.y) + mo.y;
    const flight = arty(state).inFlight.find((f) => f.cannonId === id && f.t === f.total);
    const hitWall = flight?.hitWall ?? false;
    const ty = b.y - (hitWall ? 9 : 0);
    const visibleA = this.inView(a.x, a.y, 60);
    const visibleB = this.inView(b.x, b.y, 60);
    if (v) {
      v.sinceFire = 0;
      v.flinch = 0.55;
      if (v.b) v.b.flashT = 0;
    }
    if (!visibleA && !visibleB) return;
    const speed = Math.max(0.25, state.time.speed * state.time.debugSpeed || 1);
    const dur = (flight?.total ?? 1) / speed;
    const kind = type === 'sahi' || type === 'buyuk' ? 'buyuk-gulle' : 'gulle';
    const dist = Math.hypot(b.x - mx, ty - my);
    const arc = type === 'havan' ? Math.max(80, dist * 0.7) : Math.max(6, dist * (type === 'sahi' ? 0.16 : 0.12));
    fx.projectile(mx, my, Math.round(b.x), Math.round(ty), { arc, duration: dur, kind, trail: type === 'sahi' || type === 'buyuk' });
    if (!visibleA) return;
    const ux = (b.x - mx) / (dist || 1);
    const uy = (ty - my) / (dist || 1);
    fx.muzzle(mx, my, ux, uy, FIRE_POWER[type]);
    fx.flash(mx, my, hex(P.fire[5]), type === 'sahi' ? 150 : type === 'buyuk' ? 90 : 55, type === 'sahi' ? 0.45 : 0.25);
    fx.dust(Math.round(a.x), Math.round(a.y) + 2, type === 'sahi' ? 2.2 : type === 'buyuk' ? 1.4 : 0.8);
    const tp = touchOffset(type, dir);
    fx.smoke(Math.round(a.x) + tp.x, Math.round(a.y) + tp.y - 2, 0.5, 1);
    if (type === 'sahi') {
      // thick bank of powder smoke rolling toward the walls
      for (let k = 1; k <= 4; k++) fx.smoke(mx + ux * k * 12, my + uy * k * 12 - k, 2.4 + k * 0.2, 2);
      fx.shake(0.55, 0.5);
    } else if (type === 'buyuk') {
      fx.smoke(mx + ux * 10, my + uy * 10, 1.8, 2);
    }
  }

  private onImpact(type: CannonType, at: TilePt, hitWall: boolean): void {
    const fx = this.rc.fx;
    const world = this.rc.world;
    const w = world.toWorld(at.tx, at.ty);
    const x = Math.round(w.x);
    const y = Math.round(w.y);
    if (!this.inView(x, y, 40)) return;
    const pw = IMPACT_POWER[type];
    if (hitWall) {
      const wy = y - 9;
      fx.impact(x, wy, pw, true);
      fx.debris(x, wy, Math.round(4 + pw * 4), 'tas');
      fx.debris(x, wy, Math.round(2 + pw * 2), 'tugla');
      fx.dust(x, y, 0.8 + pw * 0.6);
      if (type === 'sahi') {
        fx.shake(0.35, 0.35);
        fx.smoke(x, wy - 4, 2.2, 3);
      }
      return;
    }
    if (world.isWater(at.tx, at.ty)) {
      fx.splash(x, y, 0.6 + pw * 0.5);
      return;
    }
    fx.impact(x, y, pw * 0.6, false);
    fx.dust(x, y, 0.6 + pw * 0.5);
    fx.debris(x, y, Math.round(2 + pw * 2), 'tas');
    this.addCrater(x, y, type);
  }

  private addCrater(x: number, y: number, type: CannonType): void {
    const v = type === 'sahi' ? 2 : type === 'buyuk' ? 1 : 0;
    let d: Decal;
    if (this.decals.length >= 80) {
      d = this.decals.shift()!;
      d.img.setTexture(`topcu/krater-${v}`);
    } else d = { img: this.scene.add.image(0, 0, `topcu/krater-${v}`), t: 0, life: 0 };
    d.t = 0;
    d.life = 90;
    d.img.setPosition(x, y).setDepth(DEPTH.GROUND_DECAL + 3).setAlpha(0.95).setVisible(true);
    this.decals.push(d);
  }

  private onCracked(id: number): void {
    const state = this.rc.getState();
    const c = state.cannons.find((x) => x.id === id);
    if (!c) return;
    const w = this.rc.world.toWorld(c.tx, c.ty);
    if (!this.inView(w.x, w.y, 40)) return;
    const g = GUN[c.type];
    const y = Math.round(w.y) - g.elev;
    this.rc.fx.smoke(Math.round(w.x), y, 2.5, 5);
    this.rc.fx.sparks(Math.round(w.x), y, 14);
    this.rc.fx.floatText(Math.round(w.x), y - 14, 'Çatladı!', hex(P.red[5]));
  }

  private onArrived(id: number, type: CannonType): void {
    if (type !== 'sahi') return;
    const state = this.rc.getState();
    const c = state.cannons.find((x) => x.id === id);
    if (!c) return;
    const w = this.rc.world.toWorld(c.tx, c.ty);
    if (!this.inView(w.x, w.y, 20)) return;
    this.rc.fx.floatText(Math.round(w.x), Math.round(w.y) - 24, 'Şahi geldi!', hex(P.gold[5]));
  }

  // ───────── picking & orders ─────────

  private pick(wx: number, wy: number, state: GameState): PickResult | null {
    let best: PickResult | null = null;
    for (const c of state.cannons) {
      if (!isOnMap(state, c)) continue;
      let x: number;
      let y: number;
      const v = this.views.get(c.id);
      if (v?.c) {
        x = v.c.wagon.x;
        y = v.c.wagon.y;
      } else {
        const w = this.rc.world.toWorld(c.tx, c.ty);
        x = w.x;
        y = w.y;
      }
      const g = GUN[c.type];
      const hw = g.L * 0.55 + 4;
      if (wx < x - hw || wx > x + hw || wy < y - g.elev - g.R * 2 - 6 || wy > y + g.L * 0.25 + 4) continue;
      const d = Math.hypot(wx - x, wy - (y - g.elev));
      const score = 2 + d / 40;
      if (!best || score < best.score) best = { kind: 'cannon', id: c.id, score };
    }
    return best;
  }

  private order(input: OrderInput, state: GameState): boolean {
    const ids = input.selection.filter((p) => p.kind === 'cannon').map((p) => Number(p.id));
    if (!ids.length) return false;
    const onlyCannons = ids.length === input.selection.length;
    const store = this.rc.store;
    let sec: string | null = null;
    if (input.target?.kind === 'section') sec = String(input.target.id);
    if (!sec) sec = sectionAt(input.tile.tx, input.tile.ty, 2.2);
    if (sec) store.dispatch({ t: 'top-hedef', cannonIds: ids, sectionId: sec });
    else if (state.time.phase === 'kusatma') store.dispatch({ t: 'ozel', feature: 'artillery', action: 'mevzi', payload: { cannonIds: ids, tx: input.tile.tx, ty: input.tile.ty } });
    else return false;
    this.rc.fx.floatText(Math.round(input.wx), Math.round(input.wy) - 6, sec ? 'Hedef!' : 'Mevzi', hex(P.gold[5]));
    return onlyCannons;
  }

  // ───────── teardown ─────────

  private destroyView(v: CannonView): void {
    if (v.b) {
      const b = v.b;
      for (const o of [b.zemin, b.arka, b.gun, b.on, b.perde, b.mangal, b.flash, b.spark, ...b.crew, ...b.workers, ...b.clods]) o.destroy();
      b.vinc?.destroy();
      b.rope?.destroy();
      b.ball?.destroy();
      b.light?.destroy();
      b.smoke?.destroy();
    }
    if (v.c) {
      for (const o of [v.c.wagon, ...v.c.oxen, ...v.c.men]) o.destroy();
    }
  }

  private destroyAll(): void {
    for (const v of this.views.values()) this.destroyView(v);
    this.views.clear();
    for (const id of [...this.sel.keys()]) this.hideSel(id, true);
  }
}

function isAmmoBlock(state: GameState, c: Cannon): boolean {
  const d = CANNON_TYPES[c.type];
  return state.time.phase === 'kusatma' && (state.resources.barut < d.barutPerShot || state.resources.gulle < d.gullePerShot);
}

// ───────────────────────────── path helpers ─────────────────────────────

function locate(path: TilePt[], pt: TilePt): number {
  let best = Infinity;
  let bestS = 0;
  let acc = 0;
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i];
    const b = path[i + 1];
    const dx = b.tx - a.tx;
    const dy = b.ty - a.ty;
    const l2 = dx * dx + dy * dy || 1;
    const l = Math.sqrt(l2);
    const f = Math.max(0, Math.min(1, ((pt.tx - a.tx) * dx + (pt.ty - a.ty) * dy) / l2));
    const d = Math.hypot(pt.tx - (a.tx + dx * f), pt.ty - (a.ty + dy * f));
    if (d < best - 1e-6) {
      best = d;
      bestS = acc + f * l;
    }
    acc += l;
  }
  return bestS;
}

/** Point at arc length s along a polyline (extrapolates past both ends), with unit tangent. */
function pointAt(path: TilePt[], s: number): { tx: number; ty: number; dx: number; dy: number } {
  if (path.length < 2) return { tx: path[0]?.tx ?? 0, ty: path[0]?.ty ?? 0, dx: 1, dy: 0 };
  let acc = 0;
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i];
    const b = path[i + 1];
    const l = Math.hypot(b.tx - a.tx, b.ty - a.ty) || 1e-6;
    const last = i === path.length - 2;
    if (s <= acc + l || last || (i === 0 && s < 0)) {
      const f = (s - acc) / l;
      const dx = (b.tx - a.tx) / l;
      const dy = (b.ty - a.ty) / l;
      return { tx: a.tx + (b.tx - a.tx) * f, ty: a.ty + (b.ty - a.ty) * f, dx, dy };
    }
    acc += l;
  }
  const a = path[path.length - 1];
  return { tx: a.tx, ty: a.ty, dx: 1, dy: 0 };
}
