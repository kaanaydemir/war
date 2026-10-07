import { P } from '../../art/palette';
import { bayer, PixelCanvas, type Color } from '../../art/pixel';
import type { TextureGen } from '../../art/texture';
import { hash2 } from '../../core/rng';
import type { CannonType } from '../../core/state';

/**
 * ARTILLERY ART — procedural pixel art for guns, crews, ox teams, batteries, FX
 * sprites and UI icons. Texture keys use the prefix 'topcu/'.
 * Pure drawing on PixelCanvas (no Phaser import) — light from the upper-left.
 */

/**
 * Gun facings on screen: 1 = 'e' (down-right, along +tx), -1 = 'w' (down-left, along +ty),
 * 0 = 's' (straight down, the tile SE diagonal — foreshortened toward the viewer).
 * Transport columns only use ±1.
 */
export type Dir = 1 | 0 | -1;
export const DIRS: Dir[] = [1, 0, -1];
export const dirKey = (d: Dir): string => (d === 1 ? 'e' : d === -1 ? 'w' : 's');

/** Ground metric: screen px per local unit along the facing axis (u) and across it (v). */
const S_AX = 0.632;
const S_SIDE = 1.265;

// ───────────────────────────── geometry shared with render ─────────────────────────────

export interface GunGeom {
  /** Canvas size and pivot (ground point under the barrel centre). */
  w: number;
  h: number;
  px: number;
  py: number;
  /** Barrel length & radius (px). */
  L: number;
  R: number;
  /** Height of the barrel axis above the ground at the pivot (px). */
  elev: number;
  /** Recoil distance in 2-px iso steps. */
  recoil: number;
  /** Size class of FX sprites (0 = big … 3 = tiny). */
  fx: number;
  /** Ball sprite index (0 big, 1 medium, 2 small). */
  ball: number;
}

export const GUN: Record<CannonType, GunGeom> = {
  sahi: { w: 76, h: 50, px: 38, py: 36, L: 36, R: 5, elev: 10, recoil: 3, fx: 0, ball: 0 },
  buyuk: { w: 60, h: 40, px: 30, py: 28, L: 27, R: 3.8, elev: 8, recoil: 2, fx: 1, ball: 1 },
  orta: { w: 46, h: 32, px: 23, py: 22, L: 20, R: 2.6, elev: 6, recoil: 2, fx: 2, ball: 1 },
  kucuk: { w: 38, h: 28, px: 19, py: 19, L: 14, R: 1.9, elev: 5, recoil: 1, fx: 3, ball: 2 },
  havan: { w: 36, h: 36, px: 18, py: 27, L: 12, R: 3.4, elev: 7, recoil: 1, fx: 2, ball: 1 },
};

/** Screen offset per local unit u along a ground-lying barrel (not unit length for 's'). */
export function axisOf(dir: Dir): { ax: number; ay: number } {
  if (dir === 0) return { ax: 0, ay: S_AX };
  return { ax: dir * 0.894, ay: 0.447 };
}

/** Screen offset per local unit v across the barrel (toward the near/right side). */
export function sideOf(dir: Dir): { sx: number; sy: number } {
  if (dir === 0) return { sx: S_SIDE, sy: 0 };
  return { sx: -dir * 0.894, sy: 0.447 };
}

/** Unit screen axis + visible length for drawing a barrel of true length L. */
export function barrelAxis(dir: Dir, L: number): { ax: number; ay: number; len: number } {
  if (dir === 0) return { ax: 0, ay: 1, len: L * S_AX };
  return { ax: dir * 0.894, ay: 0.447, len: L };
}

/** Local (u,v) for a screen offset — inverse of axisOf/sideOf. */
export function uvFromScreen(dir: Dir, dx: number, dy: number): [number, number] {
  if (dir === 0) return [dy / S_AX, dx / S_SIDE];
  const a = (dir * dx) / 0.894;
  const b = dy / 0.447;
  return [(a + b) / 2, (b - a) / 2];
}

/** Havan axis (steeply raised). */
export function havanAxis(dir: Dir): { ax: number; ay: number } {
  return { ax: dir * 0.5, ay: -0.866 };
}

/** Offset (px, relative to pivot) of the muzzle mouth. */
export function muzzleOffset(type: CannonType, dir: Dir): { x: number; y: number } {
  const g = GUN[type];
  const { ax, ay } = type === 'havan' ? havanAxis(dir) : axisOf(dir);
  const cy = type === 'havan' ? -g.elev : -g.elev;
  return { x: Math.round((ax * g.L) / 2 + ax * 1.5), y: Math.round(cy + (ay * g.L) / 2 + ay * 1.5) };
}

/** Offset (px, relative to pivot) of the touch-hole (top of the breech). */
export function touchOffset(type: CannonType, dir: Dir): { x: number; y: number } {
  const g = GUN[type];
  const { ax, ay } = type === 'havan' ? havanAxis(dir) : axisOf(dir);
  return { x: Math.round((-ax * g.L) / 2 * 0.62), y: Math.round(-g.elev - g.R * 0.9 + (-ay * g.L) / 2 * 0.62) };
}

// ───────────────────────────── shading helpers ─────────────────────────────

const LX = -0.52;
const LY = -0.64;
const LZ = 0.56;

function lightI(nx: number, ny: number, nz: number): number {
  return nx * LX + ny * LY + nz * LZ;
}

type Ramp = readonly string[];

/** Map light intensity to a ramp index in [lo, hi] (hi reserved for speculars). */
function rampIdx(I: number, lo: number, hi: number, spec = 0.93): number {
  if (I > spec) return hi;
  const v = Math.max(0, Math.min(1, (I + 0.32) / 1.22));
  return Math.min(hi - 1, lo + Math.floor(v * (hi - lo)));
}

interface LatheOpts {
  /** Ramp index range used for the body. */
  lo?: number;
  hi?: number;
  /** Bands of rings: centre f, width f, extra radius, tone shift. */
  bands?: { f: number; w: number; dr: number }[];
  /** Muzzle cap with bore (fraction of the end radius) — 0 = none. */
  bore?: number;
  /** Elliptic cap squash (axis half-length = r × capK). */
  capK?: number;
  /** Cap ramp. */
  capRamp?: Ramp;
  /** Gold inscription band [f0,f1]. */
  gold?: [number, number];
  /** Rope lashings (f positions) — dark wraps. */
  lashes?: number[];
  seed?: number;
  dither?: boolean;
  /** Contrast curve for the light → ramp mapping (higher = more shadow). */
  gamma?: number;
}

/**
 * Cylinder of revolution lying along screen axis (ax,ay) centred at (cx,cy),
 * length L, radius profile prof(f) with f = 0 at the breech, 1 at the muzzle.
 */
function lathe(p: PixelCanvas, cx: number, cy: number, ax: number, ay: number, L: number, prof: (f: number) => number, ramp: Ramp, o: LatheOpts = {}): void {
  const lo = o.lo ?? 1;
  const hi = o.hi ?? ramp.length - 1;
  const px = -ay;
  const py = ax;
  const maxR = 8 + L;
  const x0 = Math.floor(cx - maxR);
  const x1 = Math.ceil(cx + maxR);
  const y0 = Math.floor(cy - maxR);
  const y1 = Math.ceil(cy + maxR);
  const radius = (f: number): number => {
    let r = prof(f);
    if (o.bands) for (const b of o.bands) if (Math.abs(f - b.f) <= b.w / 2) r += b.dr;
    return r;
  };
  // normalise the light range over the cross-section so every barrel uses the full ramp
  let iMin = Infinity;
  let iMax = -Infinity;
  for (let k = -20; k <= 20; k++) {
    const s = k / 20;
    const I = lightI(px * s, py * s, Math.sqrt(1 - s * s));
    iMin = Math.min(iMin, I);
    iMax = Math.max(iMax, I);
  }
  const span = iMax - iMin || 1;
  const toIdx = (I: number): number => {
    const v = (I - iMin) / span;
    if (v > 0.93) return hi;
    return Math.min(hi - 1, lo + Math.floor(Math.pow(v, o.gamma ?? 1.8) * (hi - lo)));
  };
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const rx = x + 0.5 - cx;
      const ry = y + 0.5 - cy;
      const u = rx * ax + ry * ay;
      const f = u / L + 0.5;
      if (f < 0 || f > 1) continue;
      const w = rx * px + ry * py;
      const r = radius(f);
      if (r <= 0 || Math.abs(w) > r) continue;
      const s = w / r;
      const nz = Math.sqrt(Math.max(0, 1 - s * s));
      const I = lightI(px * s, py * s, nz);
      let idx = toIdx(I);
      if (o.bands) {
        for (const b of o.bands) {
          const df = f - b.f;
          if (Math.abs(df) <= b.w / 2) {
            if (df < -b.w / 2 + 1.2 / L) idx = Math.max(lo - 1, idx - 1);
            else if (idx < hi - 1) idx += 1;
          }
        }
      }
      let col: string = ramp[Math.max(0, Math.min(ramp.length - 1, idx))];
      // engraved inscription band: a dotted line of gold script along the lit flank
      if (o.gold && f >= o.gold[0] && f <= o.gold[1]) {
        const row = Math.round(s * r);
        const step = Math.round(u);
        if (row === -Math.round(r * 0.45) && (step & 1) === 0 && hash2(step, 1, o.seed ?? 3) < 0.8) col = P.gold[6];
        else if (row === -Math.round(r * 0.45) + 1 && hash2(step, 2, o.seed ?? 3) < 0.35) col = P.gold[4];
        else if (Math.abs(f - o.gold[0]) * L < 0.6 || Math.abs(f - o.gold[1]) * L < 0.6) col = idx > lo + 2 ? P.gold[5] : P.gold[3];
      }
      if (o.lashes) for (const lf of o.lashes) if (Math.abs(f - lf) * L < 0.8) col = I > 0.4 ? P.wood[5] : P.wood[3];
      p.set(x, y, col);
    }
  // muzzle cap
  if (o.bore) {
    const rm = radius(1);
    const k = o.capK ?? 0.5;
    const mx = cx + (ax * L) / 2;
    const my = cy + (ay * L) / 2;
    const capRamp = o.capRamp ?? ramp;
    for (let y = Math.floor(my - rm - 2); y <= my + rm + 2; y++)
      for (let x = Math.floor(mx - rm - 2); x <= mx + rm + 2; x++) {
        const rx = x + 0.5 - mx;
        const ry = y + 0.5 - my;
        const u = rx * ax + ry * ay;
        const w = rx * px + ry * py;
        const e = (w / rm) ** 2 + (u / (rm * k)) ** 2;
        if (e > 1) continue;
        if (e < o.bore * o.bore) {
          // bore: dark, faint warm inner glint on the lower-right lip
          const inner = (w / rm) * 0.7 + (u / (rm * k)) * 0.3;
          p.set(x, y, inner > o.bore * 0.55 ? P.outline[2] : P.outline[0]);
        } else {
          // rim: lit on the upper-left lip, dark lower-right
          const lit = -(rx * 0.7 + ry * 0.7) / rm;
          const idx = lit > 0.35 ? hi : lit > -0.1 ? hi - 2 : lit > -0.5 ? lo + 2 : lo + 1;
          p.set(x, y, capRamp[idx]);
        }
      }
  }
}

/** Shaded sphere (stone ball, cask ends…). */
function sphere(p: PixelCanvas, cx: number, cy: number, r: number, ramp: Ramp, lo = 1, hi = ramp.length - 1): void {
  for (let y = Math.floor(cy - r); y <= cy + r; y++)
    for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const dx = (x + 0.5 - cx) / r;
      const dy = (y + 0.5 - cy) / r;
      const d2 = dx * dx + dy * dy;
      if (d2 > 1) continue;
      const nz = Math.sqrt(1 - d2);
      p.set(x, y, ramp[rampIdx(lightI(dx, dy, nz), lo, hi, 0.9)]);
    }
}

/** Soft cast shadow (dithered ellipse) toward the lower-right. */
function shadow(p: PixelCanvas, cx: number, cy: number, rx: number, ry: number, alpha = 0.38): void {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const e = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
      if (e > 1) continue;
      if (e > 0.6 && bayer(x, y) < (e - 0.6) / 0.4) continue;
      if (p.alphaAt(x, y) === 0) p.set(x, y, P.outline[1], alpha);
    }
}

/** Iso box with footprint centred on (cx,cy) at base elevation z. len along the dir axis, wid across. */
function box(p: PixelCanvas, cx: number, cy: number, dir: Dir, len: number, wid: number, hgt: number, z: number, ramp: Ramp = P.wood, base = 2): void {
  if (dir === 0) {
    // axis toward the viewer: top face is a screen rectangle, only the front face shows
    const W = Math.max(1, Math.round(wid * S_SIDE));
    const H = Math.max(1, Math.round(len * S_AX));
    const x0 = Math.round(cx - W / 2);
    const y0 = Math.round(cy - z - hgt - H / 2);
    p.rect(x0, y0, W, H, ramp[base + 3]);
    p.rect(x0, y0, 1, H, ramp[base + 4] ?? ramp[base + 3]);
    p.rect(x0, y0, W, 1, ramp[base + 4] ?? ramp[base + 3]);
    p.rect(x0 + W - 1, y0, 1, H, ramp[base + 2]);
    p.rect(x0, y0 + H, W, hgt, ramp[base + 1]);
    p.rect(x0, y0 + H, 1, hgt, ramp[base + 2]);
    p.rect(x0 + W - 1, y0 + H, 1, hgt, ramp[base]);
    return;
  }
  const a = dir === 1 ? len : wid;
  const b = dir === 1 ? wid : len;
  const ox = cx - (a - b) / 2;
  const oy = cy - (a + b) / 4 - z;
  p.isoBox(Math.round(ox), Math.round(oy), a, b, hgt, { top: ramp[base + 3], left: ramp[base + 2], right: ramp[base], edge: ramp[base + 4] ?? ramp[base + 3] }, 2, 1);
}

/** Vertical wicker gabion (basket of earth). (x, yb) = bottom centre. */
function gabion(p: PixelCanvas, x: number, yb: number, r: number, h: number, seed: number): void {
  for (let y = yb - h; y <= yb; y++)
    for (let dx = -r; dx <= r; dx++) {
      const s = (dx + 0.5) / (r + 0.5);
      if (Math.abs(s) > 1) continue;
      const I = lightI(s, 0, Math.sqrt(1 - Math.min(1, s * s)));
      const weave = ((y + (dx & 1) * 1 + seed) & 1) === 0;
      const ramp = weave ? P.wood : P.dryGrass;
      const idx = weave ? rampIdx(I, 2, 6) : rampIdx(I, 0, 4);
      p.set(x + dx, y, ramp[idx]);
    }
  // band ties
  for (let dx = -r; dx <= r; dx++) {
    p.set(x + dx, yb - 1, P.wood[2]);
    p.set(x + dx, yb - h + 1, P.wood[dx < 0 ? 4 : 2]);
  }
  // earth fill on top (ellipse)
  for (let dx = -r; dx <= r; dx++) {
    p.set(x + dx, yb - h - 1, dx < 0 ? P.dirt[4] : P.dirt[3]);
    if (Math.abs(dx) < r) p.set(x + dx, yb - h - 2, P.dirt[dx < 0 ? 5 : 4]);
  }
}

/** Upright post. */
function post(p: PixelCanvas, x: number, yb: number, h: number, w = 2): void {
  for (let y = yb - h; y <= yb; y++) {
    p.set(x, y, P.wood[5]);
    if (w > 1) p.set(x + 1, y, P.wood[3]);
    if (w > 2) p.set(x + 2, y, P.wood[2]);
  }
  p.set(x, yb - h, P.wood[6]);
}

function dline(p: PixelCanvas, x0: number, y0: number, x1: number, y1: number, c: Color): void {
  p.line(Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1), c);
}

// ───────────────────────────── barrels ─────────────────────────────

function barrelProfile(type: CannonType, R: number): { prof: (f: number) => number; bands: { f: number; w: number; dr: number }[]; bore: number } {
  const knob = (f: number, r: number, k = 0.07): number => (f < k ? r * Math.sqrt(Math.max(0, 1 - ((k - f) / k) ** 2)) : r);
  switch (type) {
    case 'sahi':
      return {
        prof: (f) => knob(f, f < 0.36 ? R * 0.74 : f > 0.93 ? R * 1.14 : R, 0.06),
        bands: [
          { f: 0.37, w: 0.06, dr: 1.1 }, // screw joint of the two-piece barrel
          { f: 0.2, w: 0.03, dr: 0.6 },
          { f: 0.52, w: 0.03, dr: 0.6 },
          { f: 0.78, w: 0.03, dr: 0.6 },
        ],
        bore: 0.72,
      };
    case 'buyuk':
      return {
        prof: (f) => knob(f, f < 0.32 ? R * 0.76 : f > 0.92 ? R * 1.12 : R),
        bands: [
          { f: 0.33, w: 0.05, dr: 0.8 },
          { f: 0.6, w: 0.04, dr: 0.5 },
        ],
        bore: 0.66,
      };
    case 'orta':
      return { prof: (f) => knob(f, R * (0.86 + 0.14 * f) * (f > 0.9 ? 1.1 : 1)), bands: [{ f: 0.3, w: 0.06, dr: 0.6 }, { f: 0.66, w: 0.05, dr: 0.5 }], bore: 0.58 };
    case 'kucuk':
      return { prof: (f) => knob(f, R * (0.8 + 0.2 * f) * (f > 0.88 ? 1.15 : 1), 0.1), bands: [{ f: 0.45, w: 0.08, dr: 0.5 }], bore: 0.55 };
    case 'havan':
      return { prof: (f) => knob(f, R * (0.75 + 0.3 * f), 0.12), bands: [{ f: 0.45, w: 0.09, dr: 0.6 }], bore: 0.74 };
  }
}

function drawBarrel(p: PixelCanvas, type: CannonType, dir: Dir, cx: number, cy: number, extra: Partial<LatheOpts> = {}): void {
  const g = GUN[type];
  const ba = type === 'havan' ? { ...havanAxis(dir), len: g.L } : barrelAxis(dir, g.L);
  const pr = barrelProfile(type, g.R);
  lathe(p, cx, cy, ba.ax, ba.ay, ba.len, pr.prof, P.bronze, {
    lo: 0,
    bands: pr.bands,
    bore: pr.bore,
    capK: type === 'havan' ? 0.55 : dir === 0 ? 0.78 : 0.5,
    gold: type === 'sahi' ? [0.55, 0.74] : undefined,
    seed: 7,
    ...extra,
  });
  // touch-hole + vent ring at the breech top
  const t = touchOffset(type, dir);
  const tx = cx + t.x;
  const ty = cy + g.elev + t.y;
  p.set(tx, ty, P.outline[0]);
  p.set(tx - 1, ty, P.bronze[5]);
}

/** Gun on its bed (the recoiling part). Pivot = (g.px, g.py). */
function drawGun(p: PixelCanvas, type: CannonType, dir: Dir): void {
  const g = GUN[type];
  const { ax, ay } = axisOf(dir);
  const { sx: ux, sy: uy } = sideOf(dir);
  const cx = g.px;
  const cy = g.py;
  // bed shadow
  if (dir === 0) shadow(p, cx + 3, cy + 2, g.R * 2 + 5, g.L * S_AX * 0.55 + 2, 0.32);
  else shadow(p, cx + 3, cy + 2, g.L * 0.62, g.L * 0.26 + 2, 0.32);
  if (dir === 0 && type !== 'havan') {
    // toward the viewer: a broad plank sledge shows on both sides of the barrel
    box(p, cx, cy, 0, g.L * 1.02, (g.R * 2 + 7) / S_SIDE, 2, 0, P.wood, 1);
    for (const k of [-0.35, 0.05, 0.4]) box(p, cx, cy + g.L * k * S_AX, 0, 2.5, (g.R * 2 + 9) / S_SIDE, 2, 2, P.wood, 2);
  }
  switch (type) {
    case 'sahi': {
      // massive cradle of squared oak: two longitudinal sills + cross ties + quoin
      const sx = ux * 2.2;
      const sy = uy * 2.2;
      box(p, cx - sx, cy - sy, dir, 38, 4, 4, 0, P.wood, 1);
      box(p, cx + sx, cy + sy, dir, 38, 4, 4, 0, P.wood, 2);
      for (const k of [-13, -4, 6, 14]) box(p, cx + ax * k, cy + ay * k, dir, 3, 13, 2, 3, P.wood, 1);
      // wedge (quoin) under the breech
      box(p, cx - ax * 13, cy - ay * 13, dir, 6, 6, 3, 4, P.wood, 2);
      break;
    }
    case 'buyuk': {
      const sx = ux * 1.6;
      const sy = uy * 1.6;
      box(p, cx - sx, cy - sy, dir, 28, 3, 3, 0, P.wood, 1);
      box(p, cx + sx, cy + sy, dir, 28, 3, 3, 0, P.wood, 2);
      for (const k of [-9, 0, 9]) box(p, cx + ax * k, cy + ay * k, dir, 2, 9, 2, 2, P.wood, 1);
      box(p, cx - ax * 10, cy - ay * 10, dir, 4, 4, 2, 3, P.wood, 2);
      break;
    }
    case 'orta': {
      box(p, cx, cy, dir, 20, 5, 3, 0, P.wood, 1);
      box(p, cx - ax * 7, cy - ay * 7, dir, 3, 4, 2, 3, P.wood, 2);
      break;
    }
    case 'kucuk': {
      // light timber trestle with a forked rest under the muzzle
      box(p, cx, cy, dir, 14, 4, 2, 0, P.wood, 1);
      box(p, cx + ax * 4, cy + ay * 4, dir, 2, 3, 3, 2, P.wood, 2);
      box(p, cx - ax * 5, cy - ay * 5, dir, 2, 3, 3, 2, P.wood, 2);
      break;
    }
    case 'havan':
      break;
  }
  if (type === 'havan') {
    // heavy timber block with a notched cradle; mortar raised steeply
    box(p, cx, cy, dir, 12, 11, 5, 0, P.wood, 1);
    box(p, cx, cy, dir, 8, 7, 2, 5, P.wood, 2);
    const { ax: hx, ay: hy } = havanAxis(dir);
    drawBarrel(p, 'havan', dir, cx + hx * 2, cy - g.elev + hy * 2);
    p.outline(P.outline[1]);
    return;
  }
  drawBarrel(p, type, dir, cx, cy - g.elev);
  p.outline(P.outline[1]);
}

// ───────────────────────────── battery works ─────────────────────────────

/** Ground decal: trampled earthen platform with a low berm rim and planking. */
function drawZemin(p: PixelCanvas, type: CannonType, dir: Dir): void {
  const cx = p.w / 2;
  const cy = p.h / 2;
  const rx = p.w / 2 - 2;
  const ry = p.h / 2 - 2;
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      // rounded iso diamond
      const e = Math.pow(Math.pow(Math.abs(dx), 1.6) + Math.pow(Math.abs(dy), 1.6), 1 / 1.6);
      const n = hash2(x >> 1, y >> 1, 11);
      if (e > 1) continue;
      let c: string;
      let al = 0.95;
      if (e > 0.86) {
        // berm rim of thrown-up earth: lit on the upper-left, shaded lower-right
        c = dx + dy * 1.6 < 0 ? P.dirt[5] : P.dirt[3];
        if (e > 0.95) (c = P.dirt[2]), (al = bayer(x, y) < 0.6 ? 0.85 : 0);
      } else if (e > 0.8) c = P.dirt[2];
      else {
        c = n < 0.25 ? P.dirt[3] : P.dirt[4];
        // powder scorch fan in front of the muzzle
        const fx = dx - dir * 0.42;
        const fy = dy - 0.3;
        if (fx * fx + fy * fy * 1.5 < 0.06) c = bayer(x, y) < 0.55 ? P.dirt[1] : P.smoke[2];
        if (n > 0.9) c = P.dirt[5];
      }
      if (al > 0) p.set(x, y, c, al);
    }
  // straw and spilled stones
  for (let k = 0; k < 14; k++) {
    const x = Math.round(cx + (hash2(k, 1, 13) - 0.5) * rx * 1.3);
    const y = Math.round(cy + (hash2(k, 2, 13) - 0.5) * ry * 1.1);
    p.set(x, y, k % 3 ? P.dryGrass[4] : P.stone[4]);
    if (k % 3) p.set(x + 1, y, P.dryGrass[3]);
  }
  // plank floor for the heavier guns
  if (type === 'sahi' || type === 'buyuk' || type === 'orta') {
    const len = type === 'sahi' ? 34 : type === 'buyuk' ? 26 : 18;
    const wid = type === 'sahi' ? 14 : type === 'buyuk' ? 10 : 7;
    const { ax, ay } = axisOf(dir);
    const bx = cx - ax * 3;
    const by = cy - ay * 3;
    for (let i = -wid / 2; i <= wid / 2; i += 1) {
      const sx = sideOf(dir).sx * i;
      const sy = sideOf(dir).sy * i;
      const plank = Math.floor(i + wid / 2);
      for (let k = -len / 2; k <= len / 2; k++) {
        const x = Math.round(bx + sx + ax * k);
        const y = Math.round(by + sy + ay * k);
        const seam = plank % 3 === 0;
        p.set(x, y, seam ? P.wood[2] : plank % 3 === 1 ? P.wood[4] : P.wood[3]);
      }
    }
  }
}

/** Behind the breech: earth bank with driven stakes, ball pile, powder casks. Pivot = canvas (px,py). */
export const ARKA_GEOM = { w: 64, h: 40, px: 32, py: 26 };
function drawArka(p: PixelCanvas, type: CannonType, dir: Dir): void {
  const g = GUN[type];
  const { ax, ay } = axisOf(dir);
  const cx = ARKA_GEOM.px;
  const cy = ARKA_GEOM.py;
  const back = g.L / 2 + 5;
  const bx = cx - ax * back;
  const by = cy - ay * back;
  const { sx, sy } = sideOf(dir);
  const half = Math.round(g.L * 0.28) + 3;
  // earth bank
  for (let i = -half; i <= half; i++) {
    const x = Math.round(bx + sx * i);
    const y = Math.round(by + sy * i);
    const hh = 3 + (Math.abs(i) < half - 2 ? 1 : 0);
    for (let k = 0; k < hh; k++) p.set(x, y - k, k === hh - 1 ? P.dirt[5] : k > 0 ? P.dirt[3] : P.dirt[2]);
    p.set(x + 1, y - hh + 1, P.dirt[4]);
  }
  // stakes (recoil block)
  if (type === 'sahi' || type === 'buyuk') {
    const n = type === 'sahi' ? 7 : 4;
    for (let k = 0; k < n; k++) {
      const i = -half + 2 + (k * (2 * half - 4)) / (n - 1);
      const x = Math.round(bx + sx * i + ax * 1.5);
      const y = Math.round(by + sy * i + ay * 1.5);
      post(p, x, y, type === 'sahi' ? 8 : 6, 2);
    }
    // cross beam on stakes
    for (let i = -half + 1; i <= half - 1; i++) {
      const x = Math.round(bx + sx * i + ax * 1.5);
      const y = Math.round(by + sy * i + ay * 1.5) - (type === 'sahi' ? 6 : 4);
      p.set(x, y, P.wood[4]);
      p.set(x, y + 1, P.wood[2]);
    }
  }
  // ball pile (pyramid) on the far (upper) side, behind
  const br = type === 'sahi' ? 3.2 : type === 'buyuk' ? 2.2 : 1.6;
  const pileU = -g.L * 0.18;
  const pileV = -(g.R + 6 + br * 2);
  const pxx = cx + ax * pileU + sx * pileV;
  const pyy = cy + ay * pileU + sy * pileV;
  const balls: [number, number][] = [
    [-1.05, 0],
    [1.05, 0],
    [0, 0.9],
    [0, -0.95],
  ];
  shadow(p, pxx + 2, pyy + 1, br * 2.6, br * 1.3, 0.3);
  for (const [i, j] of balls) sphere(p, pxx + i * br * 2 * 0.9, pyy - br + j * br * 0.8, br, P.limestone, 0, 5);
  sphere(p, pxx, pyy - br * 2.6, br, P.limestone, 0, 5);
  // powder casks
  const cu = -g.L * 0.5 - 2;
  const cv = -(g.R + 4);
  for (let k = 0; k < (type === 'sahi' ? 3 : 2); k++) {
    const x = Math.round(cx + ax * (cu + k * 3) + sx * (cv - k * 2));
    const y = Math.round(cy + ay * (cu + k * 3) + sy * (cv - k * 2));
    cask(p, x, y);
  }
  p.outline(P.outline[2]);
}

function cask(p: PixelCanvas, x: number, yb: number): void {
  for (let y = yb - 5; y <= yb; y++)
    for (let dx = -2; dx <= 2; dx++) {
      const bulge = y === yb - 5 || y === yb ? 1 : 0;
      if (Math.abs(dx) > 2 - bulge) continue;
      const s = dx / 2.5;
      const I = lightI(s, 0, Math.sqrt(1 - s * s));
      const hoop = y === yb - 1 || y === yb - 4;
      p.set(x + dx, y, hoop ? P.steel[I > 0.3 ? 3 : 1] : P.wood[rampIdx(I, 2, 6)]);
    }
  p.set(x - 1, yb - 6, P.wood[5]);
  p.set(x, yb - 6, P.wood[4]);
  p.set(x + 1, yb - 6, P.wood[4]);
}

/** Front works: gabions flanking the muzzle; stage 1 = half, 2 = full. Pivot = canvas (px,py). */
export const ON_GEOM = { w: 100, h: 66, px: 50, py: 30 };
function drawOn(p: PixelCanvas, type: CannonType, dir: Dir, stage: number): void {
  const g = GUN[type];
  const { ax, ay } = axisOf(dir);
  const cx = ON_GEOM.px;
  const cy = ON_GEOM.py;
  const { sx, sy } = sideOf(dir);
  const front = g.L / 2 + (type === 'sahi' ? 9 : 7);
  const gap = g.R + (type === 'sahi' ? 4 : 3);
  const gr = type === 'sahi' ? 3 : 2;
  const gh = type === 'sahi' ? 8 : type === 'buyuk' ? 7 : 6;
  const per = type === 'sahi' ? 3 : type === 'buyuk' ? 3 : 2;
  const items: { x: number; y: number; seed: number }[] = [];
  for (const side of [-1, 1]) {
    for (let k = 0; k < per; k++) {
      const v = side * (gap + k * (gr * 2 + 0.6));
      const u = front - k * 1.2;
      items.push({ x: Math.round(cx + ax * u + sx * v), y: Math.round(cy + ay * u + sy * v), seed: k + side });
    }
  }
  items.sort((a, b) => a.y - b.y);
  const show = stage >= 2 ? items.length : Math.ceil(items.length / 2);
  // earth spill under them
  for (const it of items.slice(0, show)) for (let dx = -gr - 1; dx <= gr + 1; dx++) p.set(it.x + dx, it.y + 1, P.dirt[2], 0.7);
  for (const it of items.slice(0, show)) gabion(p, it.x, it.y, gr, gh, it.seed);
  // mantlet posts at the opening
  if (stage >= 2) {
    for (const side of [-1, 1]) {
      const v = side * (gap - 1.5);
      post(p, Math.round(cx + ax * (front + 1) + sx * v), Math.round(cy + ay * (front + 1) + sy * v), gh + 3, 1);
    }
  }
  p.outline(P.outline[2]);
}

/** Wooden mantlet (screen) across the embrasure: frame 0 lowered … 2 raised. */
export const PERDE_GEOM = { w: 40, h: 32, px: 20, py: 22 };
function drawPerde(p: PixelCanvas, type: CannonType, dir: Dir, frame: number): void {
  const g = GUN[type];
  const { ax, ay } = axisOf(dir);
  const cx = PERDE_GEOM.px;
  const cy = PERDE_GEOM.py;
  const { sx, sy } = sideOf(dir);
  const gap = g.R + (type === 'sahi' ? 4 : 3) - 1.5;
  const gh = (type === 'sahi' ? 8 : type === 'buyuk' ? 7 : 6) + 3;
  const H = gh - 1;
  // hinge line along the top of the posts
  const hx0 = cx - sx * gap;
  const hy0 = cy - sy * gap - gh;
  const hx1 = cx + sx * gap;
  const hy1 = cy + sy * gap - gh;
  // swing the screen out and up toward the front (hinged at the top)
  const a = [0, 0.95, 1.75][frame];
  const vx = ax * Math.sin(a) * H;
  const vy = ay * Math.sin(a) * H + Math.cos(a) * H;
  const quad: [number, number][] = [
    [hx0, hy0],
    [hx1, hy1],
    [hx1 + vx, hy1 + vy],
    [hx0 + vx, hy0 + vy],
  ];
  p.poly(quad, frame === 0 ? P.wood[4] : P.wood[5]);
  const n = Math.max(3, Math.round(gap));
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const x0 = hx0 + (hx1 - hx0) * t;
    const y0 = hy0 + (hy1 - hy0) * t;
    dline(p, x0, y0, x0 + vx, y0 + vy, P.wood[2]);
  }
  for (const t of [0.25, 0.75]) dline(p, hx0 + vx * t, hy0 + vy * t, hx1 + vx * t, hy1 + vy * t, P.steel[2]);
  p.outline(P.outline[1]);
}

/** Şahi sheer-legs crane with pulley. Pivot = canvas (px,py) = ground point under the pulley. */
export const VINC_GEOM = { w: 30, h: 34, px: 15, py: 31, top: 25 };
function drawVinc(p: PixelCanvas, dir: Dir): void {
  const cx = VINC_GEOM.px;
  const cy = VINC_GEOM.py;
  const top = cy - VINC_GEOM.top;
  const { sx, sy } = sideOf(dir);
  // two legs spread across, one rear prop
  const feet: [number, number][] = [
    [cx + sx * -7, cy + sy * -7],
    [cx + sx * 7, cy + sy * 7],
    [cx - dir * 5, cy - 4],
  ];
  for (const [i, [fx, fy]] of feet.entries()) {
    dline(p, fx, fy, cx, top, i === 1 ? P.wood[5] : P.wood[3]);
    dline(p, fx + 1, fy, cx + 1, top, i === 1 ? P.wood[3] : P.wood[2]);
  }
  // lashing + pulley block
  p.rect(cx - 1, top - 1, 3, 3, P.wood[2]);
  p.set(cx - 1, top - 1, P.wood[5]);
  p.set(cx, top + 2, P.steel[3]);
  p.set(cx, top + 3, P.steel[2]);
  // winch drum on the near leg
  const wx = Math.round(cx + sx * 4);
  const wy = Math.round(cy + sy * 4 - 6);
  p.rect(wx - 1, wy, 3, 2, P.wood[4]);
  p.set(wx - 2, wy, P.wood[2]);
  p.outline(P.outline[1]);
}

/** Brazier for the linstock slow-matches (frames: coals flicker). */
function drawMangal(p: PixelCanvas, f: number): void {
  const cx = 5;
  const yb = 11;
  // legs
  p.set(cx - 2, yb, P.steel[2]);
  p.set(cx + 2, yb, P.steel[1]);
  p.set(cx, yb, P.steel[2]);
  p.set(cx - 2, yb - 1, P.steel[3]);
  p.set(cx + 2, yb - 1, P.steel[1]);
  // bowl
  for (let dx = -3; dx <= 3; dx++) {
    p.set(cx + dx, yb - 2, dx < 0 ? P.steel[3] : P.steel[1]);
    if (Math.abs(dx) < 3) p.set(cx + dx, yb - 3, P.steel[dx < 0 ? 4 : 2]);
  }
  // coals + flame
  const fl = [P.fire[3], P.fire[4], P.fire[5], P.fire[6]];
  for (let dx = -2; dx <= 2; dx++) p.set(cx + dx, yb - 4, hash2(dx, f, 5) > 0.5 ? P.fire[2] : P.fire[3]);
  const h = [3, 4, 2, 5][f];
  for (let k = 0; k < h; k++) {
    const x = cx + Math.round(Math.sin(f * 1.7 + k) * 0.8);
    p.set(x, yb - 5 - k, fl[Math.min(3, h - 1 - k)]);
    if (k < h - 2) p.set(x + ((f + k) % 2 ? 1 : -1), yb - 5 - k, fl[0]);
  }
  p.outline(P.outline[1]);
}

// ───────────────────────────── FX sprites ─────────────────────────────

export const FLASH_SIZE = [34, 24, 16, 11];
export const FLASH_GEOM = (size: number) => ({ w: FLASH_SIZE[size] * 2 + 8, h: FLASH_SIZE[size] + 10 });

/** Muzzle flash along the barrel axis; its origin (the mouth) is flashOrigin(). */
function drawFlash(p: PixelCanvas, size: number, dir: Dir, f: number, up: boolean): void {
  const len = FLASH_SIZE[size] * (dir === 0 && !up ? 0.8 : 1);
  const o = flashOrigin(size, dir, up);
  const ox = o.x;
  const oy = o.y;
  const ba = barrelAxis(dir, 1);
  const { ax, ay } = up ? havanAxis(dir) : ba;
  const px = -ay;
  const py = ax;
  const grow = [0.45, 1, 0.9, 0.75, 0.55][f];
  const L = len * grow;
  const fire = P.fire;
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      const rx = x + 0.5 - ox;
      const ry = y + 0.5 - oy;
      const u = rx * ax + ry * ay;
      const w = rx * px + ry * py;
      if (u < -2) continue;
      const t = u / L;
      if (t > 1.05) continue;
      // cone + bulb profile
      const bulb = Math.exp(-((t - 0.55) ** 2) / 0.09);
      const width = (len * 0.16 + len * 0.3 * bulb) * (f >= 3 ? 1.2 : 1) * (0.6 + 0.4 * grow) + (t < 0.1 ? 2 : 0);
      const nz = hash2(x, y, 31 + f) * 0.35;
      const d = Math.abs(w) / width + nz * 0.5 + Math.max(0, t - 0.85) * 3;
      if (d > 1) continue;
      let c: string;
      if (f === 0) c = d < 0.45 ? fire[7] : d < 0.75 ? fire[6] : fire[5];
      else if (f === 1) c = d < 0.3 && t < 0.6 ? fire[7] : d < 0.55 ? fire[6] : d < 0.8 ? fire[5] : fire[4];
      else if (f === 2) c = d < 0.25 && t < 0.5 ? fire[6] : d < 0.55 ? fire[5] : d < 0.8 ? fire[4] : fire[3];
      else if (f === 3) c = d < 0.35 ? fire[4] : d < 0.7 ? fire[3] : P.smoke[3];
      else c = d < 0.4 ? fire[2] : d < 0.7 ? P.smoke[3] : P.smoke[4];
      if (f >= 3 && hash2(x, y, 77) < 0.25) continue;
      p.set(x, y, c);
    }
  // sparks thrown ahead
  if (f <= 2)
    for (let k = 0; k < 6 + size * -1 + 4; k++) {
      const u = L * (0.8 + hash2(k, f, 9) * 0.6);
      const w = (hash2(k, f, 10) - 0.5) * len * 0.6;
      p.set(Math.round(ox + ax * u + px * w), Math.round(oy + ay * u + py * w), k % 2 ? fire[6] : fire[5]);
    }
}

export function flashOrigin(size: number, dir: Dir, up: boolean): { x: number; y: number } {
  const g = FLASH_GEOM(size);
  const len = FLASH_SIZE[size];
  if (up) return { x: g.w / 2, y: g.h + 4 };
  if (dir === 0) return { x: g.w / 2, y: 4 };
  return { x: dir === 1 ? 4 : g.w - 4, y: Math.round(g.h / 2 - len * 0.2) };
}

function drawSpark(p: PixelCanvas, f: number): void {
  const c = 3;
  const pts = [
    [0, 0], [1, -1], [-1, -2], [2, -2], [0, -3], [-2, -1], [1, -3], [3, -1],
  ];
  p.set(c, c + 2, P.fire[7]);
  for (let i = 0; i < pts.length; i++) {
    if ((i + f) % 3 === 0) continue;
    const [dx, dy] = pts[i];
    const k = (f + 1) * 0.6;
    p.set(Math.round(c + dx * k * 0.8), Math.round(c + 2 + dy * k * 0.7), i % 2 ? P.fire[6] : P.fire[5]);
  }
}

// ───────────────────────────── crew (tiny men) ─────────────────────────────

export const MAN_W = 32;
export const MAN_H = 24;
export const MAN_FOOT = 22;

/** Pose frame indices (per facing; facing −1 adds MAN_FRAMES). */
export const POSE = {
  idle: [0, 1],
  walk: [2, 3, 4, 5],
  sack: [6, 7, 8, 9],
  ball: [10, 11, 12, 13],
  pole: [14, 15, 16],
  hammer: [17, 18],
  linstock: [19, 20],
  flinch: [21, 22],
  lever: [23, 24],
  aim: [25],
  shovel: [26, 27],
  sit: [28, 29],
  pour: [30, 31],
  rope: [32, 33, 34, 35],
  goad: [36, 37, 38, 39],
  pick: [40, 41],
  cheer: [42, 43],
} as const;
export type PoseName = keyof typeof POSE;
export const MAN_FRAMES = 44;

interface ManVariant {
  coat: [string, string, string];
  sash: [string, string];
  head: 'turban' | 'cap' | 'fur' | 'bare' | 'bork';
  headCol: [string, string, string];
  legs: string;
  beard?: string;
  apron?: boolean;
}

export const MAN_VARIANTS: ManVariant[] = [
  { coat: [P.red[2], P.red[3], P.red[4]], sash: [P.gold[2], P.gold[4]], head: 'turban', headCol: [P.turban[0], P.turban[1], P.turban[2]], legs: P.wood[1], beard: P.wood[1] },
  { coat: [P.green[1], P.green[2], P.green[3]], sash: [P.red[2], P.red[4]], head: 'turban', headCol: [P.turban[0], P.turban[1], P.turban[3]], legs: P.wood[1] },
  { coat: [P.blue[1], P.blue[2], P.blue[3]], sash: [P.cloth[2], P.cloth[4]], head: 'cap', headCol: [P.red[2], P.red[4], P.red[5]], legs: P.outline[2], beard: P.outline[2] },
  { coat: [P.dirt[2], P.dirt[3], P.dirt[5]], sash: [P.wood[2], P.wood[4]], head: 'bare', headCol: [P.wood[0], P.wood[1], P.wood[2]], legs: P.dirt[1], apron: false },
  { coat: [P.red[1], P.red[2], P.red[3]], sash: [P.gold[3], P.gold[5]], head: 'bork', headCol: [P.cloth[2], P.cloth[4], P.cloth[5]], legs: P.outline[2], beard: P.outline[2] },
  // Orban: Hungarian master founder — fur cap, dark coat, leather apron, grey beard
  { coat: [P.purple[1], P.purple[2], P.purple[3]], sash: [P.wood[2], P.wood[3]], head: 'fur', headCol: [P.wood[1], P.wood[2], P.wood[4]], legs: P.outline[2], beard: P.stone[5], apron: true },
  // worker in a rough tunic with a brown cap
  { coat: [P.dryGrass[0], P.dryGrass[1], P.dryGrass[3]], sash: [P.wood[1], P.wood[3]], head: 'cap', headCol: [P.wood[2], P.wood[3], P.wood[5]], legs: P.dirt[1] },
];
export const VARIANT = { kirmizi: 0, yesil: 1, mavi: 2, isci: 3, topcubasi: 4, orban: 5, amele: 6 } as const;

interface PoseSpec {
  bob: number; // body vertical offset (positive = lower)
  lean: number; // torso top shift toward facing
  legs: 'stand' | 'w0' | 'w1' | 'w2' | 'w3' | 'kneel' | 'sit' | 'crouch';
  front?: [number, number]; // front hand (relative to shoulder) — facing-relative x
  back?: [number, number];
  tool?: (p: PixelCanvas, f: number, hx: number, hy: number, bx: number, by: number) => void;
  /** Extra carried item drawn before arms. */
  carry?: 'sack' | 'ball' | null;
  headDy?: number;
}

function poleTool(len: number, head: 'sponge' | 'ram' | 'match' | 'goad' | 'lever' | 'shovel' | 'pick' | 'jug' | 'hammer' | 'rope') {
  return (p: PixelCanvas, f: number, hx: number, hy: number) => {
    switch (head) {
      case 'sponge':
      case 'ram': {
        for (let k = 0; k < len; k++) {
          p.set(hx + f * k * 2, hy - k, P.wood[5]);
          p.set(hx + f * (k * 2 + 1), hy - k, P.wood[4]);
        }
        const ex = hx + f * len * 2;
        const ey = hy - len;
        p.set(ex, ey, head === 'sponge' ? P.cloth[2] : P.wood[2]);
        p.set(ex + f, ey, head === 'sponge' ? P.cloth[3] : P.wood[3]);
        p.set(ex, ey - 1, head === 'sponge' ? P.cloth[4] : P.wood[3]);
        break;
      }
      case 'match': {
        for (let k = 0; k < len; k++) {
          p.set(hx + f * k * 2, hy - k + 2, P.wood[4]);
          p.set(hx + f * (k * 2 + 1), hy - k + 2, P.wood[3]);
        }
        break;
      }
      case 'goad': {
        for (let k = 0; k < len; k++) p.set(hx + f * k, hy - k * 1.5, P.wood[k % 2 ? 4 : 5]);
        break;
      }
      case 'lever': {
        for (let k = 0; k < len; k++) p.set(hx + f * Math.round(k * 0.7), hy + k, P.wood[k < 2 ? 5 : 3]);
        break;
      }
      case 'shovel': {
        for (let k = 0; k < len; k++) p.set(hx + f * Math.round(k * 0.5), hy + k, P.wood[4]);
        const ex = hx + f * Math.round(len * 0.5);
        const ey = hy + len;
        p.set(ex, ey, P.steel[4]);
        p.set(ex + f, ey, P.steel[3]);
        p.set(ex, ey - 1, P.steel[3]);
        break;
      }
      case 'pick': {
        for (let k = 0; k < len; k++) p.set(hx + f * k, hy - k, P.wood[4]);
        const ex = hx + f * len;
        const ey = hy - len;
        p.set(ex - f, ey - 1, P.steel[4]);
        p.set(ex, ey, P.steel[3]);
        p.set(ex + f, ey + 1, P.steel[2]);
        p.set(ex + f, ey + 2, P.steel[2]);
        break;
      }
      case 'hammer': {
        p.set(hx, hy - 1, P.wood[4]);
        p.set(hx, hy - 2, P.steel[3]);
        p.set(hx + f, hy - 2, P.steel[4]);
        p.set(hx - f, hy - 2, P.steel[2]);
        break;
      }
      case 'jug': {
        p.set(hx + f, hy, P.dirt[4]);
        p.set(hx + f, hy + 1, P.dirt[3]);
        p.set(hx + 2 * f, hy, P.dirt[3]);
        p.set(hx + 2 * f, hy + 1, P.gold[3]);
        p.set(hx + 2 * f, hy + 2, P.gold[4]);
        p.set(hx + 3 * f, hy + 3, P.gold[3]);
        break;
      }
      case 'rope': {
        for (let k = 0; k < len; k++) p.set(hx + f * k, hy + Math.floor(k / 2), k % 3 === 0 ? P.dryGrass[2] : P.dryGrass[3]);
        break;
      }
    }
  };
}

function poseSpec(frame: number): PoseSpec {
  const walkLegs = (i: number) => (['w0', 'w1', 'w2', 'w3'] as const)[i % 4];
  const bobW = (i: number) => (i % 2 === 0 ? -1 : 0);
  if (frame <= 1) return { bob: frame === 1 ? 0 : 0, lean: 0, legs: 'stand', front: [1, 5 + frame * 0], back: [-1, 5], headDy: frame };
  if (frame <= 5) {
    const i = frame - 2;
    return { bob: bobW(i), lean: 0, legs: walkLegs(i), front: [i % 2 ? 0 : (i === 0 ? 1 : -1), 5], back: [i % 2 ? 0 : (i === 0 ? -1 : 1), 5] };
  }
  if (frame <= 9) {
    const i = frame - 6;
    return { bob: bobW(i), lean: 0, legs: walkLegs(i), front: [0, -1], back: [-1, 5], carry: 'sack' };
  }
  if (frame <= 13) {
    const i = frame - 10;
    return { bob: bobW(i), lean: 0, legs: walkLegs(i), front: [2, 3], back: [1, 3], carry: 'ball' };
  }
  if (frame <= 16) {
    const i = frame - 14; // 0 back, 1 mid, 2 thrust
    const reach = [0, 1, 3][i];
    return { bob: 0, lean: i === 2 ? 1 : 0, legs: 'stand', front: [2 + reach, 2], back: [reach, 3], tool: poleTool(6, 'sponge') };
  }
  if (frame <= 18) {
    const i = frame - 17;
    return { bob: 3, lean: 1, legs: 'kneel', front: i === 0 ? [2, -2] : [3, 3], back: [1, 4], tool: poleTool(1, 'hammer') };
  }
  if (frame <= 20) return { bob: 0, lean: 1, legs: 'stand', front: [3, 2], back: [1, 3], tool: poleTool(4, 'match') };
  if (frame <= 22) {
    const i = frame - 21;
    return { bob: 2 + i, lean: -1, legs: 'crouch', front: [0, -2], back: [-1, -2], headDy: 1 };
  }
  if (frame <= 24) {
    const i = frame - 23;
    return { bob: 1, lean: 2, legs: i === 0 ? 'w1' : 'w3', front: [3, 3 + i], back: [2, 4 + i], tool: poleTool(6, 'lever') };
  }
  if (frame === 25) return { bob: 3, lean: 1, legs: 'kneel', front: [2, -1], back: [1, 1] };
  if (frame <= 27) {
    const i = frame - 26;
    return { bob: 1, lean: 1 + i, legs: 'stand', front: i === 0 ? [2, 3] : [1, 0], back: [1, 4], tool: poleTool(i === 0 ? 6 : 4, 'shovel') };
  }
  if (frame <= 29) return { bob: 4, lean: 0, legs: 'sit', front: [1, 3], back: [-1, 3], headDy: frame - 28 };
  if (frame <= 31) {
    const i = frame - 30;
    return { bob: 0, lean: 0, legs: 'stand', front: [2, i ? 0 : 1], back: [1, 1], tool: poleTool(1, 'jug') };
  }
  if (frame <= 35) {
    const i = frame - 32;
    return { bob: bobW(i) + 1, lean: -1, legs: walkLegs(i), front: [3, 3], back: [2, 4], tool: poleTool(9, 'rope') };
  }
  if (frame <= 39) {
    const i = frame - 36;
    return { bob: bobW(i), lean: 0, legs: walkLegs(i), front: [2, 2], back: [-1, 5], tool: poleTool(7, 'goad') };
  }
  if (frame <= 41) {
    const i = frame - 40;
    return { bob: i, lean: i, legs: 'stand', front: i === 0 ? [1, -3] : [3, 3], back: [0, i === 0 ? -2 : 3], tool: poleTool(i === 0 ? 4 : 3, 'pick') };
  }
  const i = frame - 42;
  return { bob: i ? -1 : 0, lean: 0, legs: 'stand', front: [1, -4 - i], back: [-1, -4 - i] };
}

function drawMan(p: PixelCanvas, frame: number, f: 1 | -1, v: ManVariant): void {
  const sp = poseSpec(frame);
  const cx = 16;
  const foot = MAN_FOOT;
  const b = sp.bob;
  // shadow
  shadow(p, cx + 2, foot + 0.5, 4.5, 1.6, 0.35);
  const top = foot - 14 + b; // turban top row
  const shoulderY = foot - 10 + b;
  const lean = sp.lean * f;
  const skin = P.skin;
  const lit = (c: [string, string, string], dx: number) => (dx <= -2 ? c[2] : dx >= 2 ? c[0] : c[1]);

  // legs
  const legRows: [number, number, number][] = []; // x, y0, y1
  const L = cx - 1;
  const R = cx + 1;
  switch (sp.legs) {
    case 'stand':
      legRows.push([L, foot - 3, foot], [R, foot - 3, foot]);
      break;
    case 'w0':
      legRows.push([cx - 1, foot - 3, foot], [cx + 1, foot - 3, foot]);
      break;
    case 'w1':
      legRows.push([cx - 2 * f, foot - 3, foot], [cx + 2 * f, foot - 3, foot - 1]);
      p.set(cx + 2 * f, foot, P.outline[2]);
      break;
    case 'w2':
      legRows.push([cx, foot - 3, foot], [cx + f, foot - 3, foot - 2]);
      break;
    case 'w3':
      legRows.push([cx + 2 * f, foot - 3, foot], [cx - 2 * f, foot - 3, foot - 1]);
      p.set(cx - 2 * f, foot, P.outline[2]);
      break;
    case 'kneel':
      legRows.push([cx - f, foot - 1, foot], [cx + 2 * f, foot - 2, foot]);
      for (let k = 0; k < 3; k++) p.set(cx - f + f * k, foot, v.legs);
      break;
    case 'sit':
      for (let k = 0; k < 4; k++) p.set(cx + f * k, foot, v.legs), p.set(cx + f * k, foot - 1, v.legs);
      p.set(cx + f * 4, foot, P.outline[1]);
      break;
    case 'crouch':
      legRows.push([cx - 2, foot - 2, foot], [cx + 2, foot - 2, foot]);
      break;
  }
  for (const [x, y0, y1] of legRows) {
    for (let y = y0; y <= y1; y++) p.set(x, y, y === y1 ? P.outline[2] : v.legs);
  }

  // back arm (behind body)
  const bsx = cx - 2 * f + lean;
  if (sp.back) {
    const hx = bsx + sp.back[0] * f;
    const hy = shoulderY + sp.back[1];
    dline(p, bsx, shoulderY + 1, hx, hy, v.coat[0]);
    p.set(hx, hy, skin[2]);
  }

  // kaftan skirt + torso
  const skirtTop = foot - 6 + b;
  const skirtBot = sp.legs === 'sit' ? foot - 1 : sp.legs === 'kneel' ? foot - 1 : foot - 3;
  for (let y = skirtTop; y <= skirtBot; y++) {
    const flare = y >= skirtBot - 1 ? 1 : 0;
    for (let dx = -2 - flare; dx <= 2 + flare; dx++) p.set(cx + dx, y, lit(v.coat, dx));
  }
  if (v.apron) for (let y = skirtTop; y <= skirtBot; y++) p.set(cx + f, y, P.wood[3]), p.set(cx, y, P.wood[4]);
  for (let y = shoulderY; y < skirtTop; y++) {
    const sh = y < shoulderY + 2 ? lean : 0;
    for (let dx = -2; dx <= 2; dx++) p.set(cx + dx + sh, y, lit(v.coat, dx));
  }
  // front placket / collar detail
  p.set(cx + f + lean, shoulderY, v.coat[2]);
  p.set(cx + lean, shoulderY + 1, v.coat[0]);
  // sash
  for (let dx = -2; dx <= 2; dx++) p.set(cx + dx, skirtTop - 1, dx < 0 ? v.sash[1] : v.sash[0]);
  p.set(cx - f * 2, skirtTop, v.sash[0]);

  // carried items
  if (sp.carry === 'sack') {
    const sx = cx - f + lean;
    const sy = shoulderY - 2;
    p.rect(sx - 2, sy, 4, 2, P.cloth[3]);
    p.set(sx - 2, sy, P.cloth[4]);
    p.set(sx + 1, sy + 1, P.cloth[2]);
    p.set(sx - 1, sy - 1, P.cloth[4]);
  }

  // head
  const hy = top + 3 + (sp.headDy ? 0 : 0);
  const hx = cx + lean;
  for (let dy = 0; dy < 3; dy++)
    for (let dx = -1; dx <= 1; dx++) p.set(hx + dx, hy + dy, dx === -1 ? skin[4] : dx === 1 ? skin[2] : skin[3]);
  p.set(hx + f, hy + 1, P.outline[0]); // eye
  if (v.beard) {
    p.set(hx, hy + 2, v.beard);
    p.set(hx - f, hy + 2, v.beard);
    p.set(hx, hy + 3, v.beard);
  }
  // headwear
  const H = v.headCol;
  switch (v.head) {
    case 'turban':
      for (let dx = -2; dx <= 2; dx++) p.set(hx + dx, hy - 1, dx < 0 ? H[2] : dx > 0 ? H[0] : H[1]);
      for (let dx = -1; dx <= 1; dx++) p.set(hx + dx, hy - 2, dx < 0 ? H[2] : H[1]);
      p.set(hx - 2, hy - 2, H[1]);
      p.set(hx, hy - 3, H[2]);
      p.set(hx + f * 2, hy, H[0]);
      break;
    case 'bork':
      for (let dx = -1; dx <= 1; dx++) p.set(hx + dx, hy - 1, dx < 0 ? H[2] : H[1]);
      for (let k = 2; k <= 4; k++) p.set(hx - f * Math.floor(k / 2) , hy - k, k % 2 ? H[1] : H[2]);
      p.set(hx - f * 2, hy - 5, H[1]);
      p.set(hx - f * 2, hy - 4, H[0]);
      p.set(hx + f, hy - 1, P.gold[4]);
      break;
    case 'cap':
      for (let dx = -1; dx <= 1; dx++) p.set(hx + dx, hy - 1, dx < 0 ? H[2] : H[1]);
      p.set(hx, hy - 2, H[1]);
      p.set(hx - 1, hy - 2, H[2]);
      break;
    case 'fur':
      for (let dx = -2; dx <= 2; dx++) p.set(hx + dx, hy - 1, (dx + hy) % 2 ? H[1] : H[2]);
      for (let dx = -1; dx <= 1; dx++) p.set(hx + dx, hy - 2, dx < 0 ? H[2] : H[0]);
      p.set(hx - f, hy - 3, P.red[4]);
      p.set(hx, hy - 3, P.red[3]);
      break;
    case 'bare':
      for (let dx = -1; dx <= 1; dx++) p.set(hx + dx, hy - 1, H[1]);
      p.set(hx - f, hy, H[1]);
      break;
  }

  // carried ball in front
  if (sp.carry === 'ball') sphere(p, cx + f * 3 + lean, shoulderY + 4, 1.6, P.limestone, 0, 5);

  // front arm (over the body) + tool
  const fsx = cx + 2 * f + lean;
  if (sp.front) {
    const hx2 = fsx + sp.front[0] * f;
    const hy2 = shoulderY + sp.front[1];
    if (sp.tool) sp.tool(p, f, hx2, hy2, cx - 2 * f, shoulderY);
    dline(p, fsx, shoulderY + 1, hx2, hy2, v.coat[sp.front[1] < 0 ? 1 : 2]);
    p.set(hx2, hy2, skin[4]);
  }
  p.outline(P.outline[1]);
  // glowing slow-match tip (after outline so it reads as light)
  if (frame === 19 || frame === 20) {
    const hx2 = fsx + 3 * f;
    const hy2 = shoulderY + 2;
    const tx = hx2 + f * 8;
    const ty = hy2 - 4 + 2;
    p.set(tx, ty, frame === 19 ? P.fire[6] : P.fire[5]);
    p.set(tx + f, ty, frame === 19 ? P.fire[4] : P.fire[6]);
    p.set(tx, ty - 1, P.fire[frame === 19 ? 3 : 4]);
  }
}

/** Where a man's hands are (frame-local, before facing) — used by render to attach ropes. */
export function manHand(frame: number, f: 1 | -1): { x: number; y: number } {
  const sp = poseSpec(frame);
  const shoulderY = MAN_FOOT - 10 + sp.bob;
  const fsx = 16 + 2 * f + sp.lean * f;
  return { x: fsx + (sp.front?.[0] ?? 0) * f, y: shoulderY + (sp.front?.[1] ?? 0) };
}

// ───────────────────────────── oxen & wagons ─────────────────────────────

/** Ground headings for transport sprites: 16 directions in tile space (0 = +tx, 4 = SE diagonal, 8 = +ty). */
export const HEADINGS = 16;

export interface Heading {
  /** Screen offset per local unit along / across the heading (e-axis metric). */
  A: { x: number; y: number };
  S: { x: number; y: number };
  /** Screen facing for figures (+1 = right). */
  f: 1 | -1;
  /** Moving up the screen (we see the team from behind). */
  back: boolean;
}

export function headingOf(hi: number): Heading {
  const th = ((((hi % HEADINGS) + HEADINGS) % HEADINGS) * Math.PI * 2) / HEADINGS;
  const dx = Math.cos(th);
  const dy = Math.sin(th);
  const K = 17.89;
  const A = { x: ((dx - dy) * 16) / K, y: ((dx + dy) * 8) / K };
  let S = { x: ((-dy - dx) * 16) / K, y: ((-dy + dx) * 8) / K };
  if (S.y < 0 || (Math.abs(S.y) < 1e-6 && S.x < 0)) S = { x: -S.x, y: -S.y };
  return { A, S, f: A.x >= -0.05 ? 1 : -1, back: A.y < -0.05 };
}

/** Heading index (0..15) for a tile-space direction. */
export function headingIndex(dx: number, dy: number): number {
  const a = Math.atan2(dy, dx);
  return ((Math.round((a / (Math.PI * 2)) * HEADINGS) % HEADINGS) + HEADINGS) % HEADINGS;
}

function latheA(p: PixelCanvas, cx: number, cy: number, A: { x: number; y: number }, Lu: number, prof: (f: number) => number, ramp: Ramp, o: LatheOpts = {}): void {
  const l = Math.hypot(A.x, A.y) || 1;
  lathe(p, cx, cy, A.x / l, A.y / l, Lu * l, prof, ramp, o);
}

/** Ground-oriented box along any heading: visible side faces + top. */
function boxA(p: PixelCanvas, cx: number, cy: number, A: { x: number; y: number }, S: { x: number; y: number }, len: number, wid: number, hgt: number, z: number, ramp: Ramp, base: number): void {
  const c: [number, number][] = [
    [cx - A.x * len / 2 - S.x * wid / 2, cy - A.y * len / 2 - S.y * wid / 2 - z],
    [cx + A.x * len / 2 - S.x * wid / 2, cy + A.y * len / 2 - S.y * wid / 2 - z],
    [cx + A.x * len / 2 + S.x * wid / 2, cy + A.y * len / 2 + S.y * wid / 2 - z],
    [cx - A.x * len / 2 + S.x * wid / 2, cy - A.y * len / 2 + S.y * wid / 2 - z],
  ];
  for (let i = 0; i < 4; i++) {
    const a = c[i];
    const b = c[(i + 1) % 4];
    const mx = (a[0] + b[0]) / 2 - cx;
    const my = (a[1] + b[1]) / 2 - (cy - z);
    if (my <= 0.01) continue;
    const lit = mx < 0;
    p.poly([a, b, [b[0], b[1] - hgt], [a[0], a[1] - hgt]], ramp[base + (lit ? 2 : 0)]);
  }
  p.poly(c.map(([x, y]) => [x, y - hgt] as [number, number]), ramp[base + 3]);
}

/** Spoked wheel whose plane contains the heading axis and the vertical. */
function wheelA(p: PixelCanvas, cx: number, cy: number, r: number, A: { x: number; y: number }, frame: number, far: boolean): void {
  const l = Math.hypot(A.x, A.y) || 1;
  const ax = A.x / l;
  const ay = A.y / l;
  const pt = (t: number, rr: number): [number, number] => [cx + Math.cos(t) * rr * ax * l, cy - r + Math.cos(t) * rr * ay * l - Math.sin(t) * rr];
  const rim = far ? P.wood[2] : P.wood[4];
  const rimD = far ? P.wood[1] : P.wood[2];
  for (let k = 0; k < 4; k++) {
    const t = frame * (Math.PI / 8) + (k * Math.PI) / 4;
    const [x, y] = pt(t, r - 0.5);
    const [x2, y2] = pt(t + Math.PI, r - 0.5);
    dline(p, x, y, x2, y2, far ? P.wood[2] : P.wood[3]);
  }
  for (let i = 0; i < 40; i++) {
    const t = (i / 40) * Math.PI * 2;
    const [x, y] = pt(t, r);
    p.set(Math.round(x), Math.round(y), Math.sin(t) > 0.1 ? rim : rimD);
  }
  p.set(Math.round(cx), Math.round(cy - r), P.steel[far ? 2 : 4]);
}

export const OX_W = 40;
export const OX_H = 30;
export const OX_PX = 20;
export const OX_PY = 22;

function drawOxPair(p: PixelCanvas, hi: number, frame: number, variant: number, snow: boolean): void {
  const H = headingOf(hi);
  const { A, S } = H;
  const ramps: Ramp[] = [P.stone, P.limestone, P.dirt];
  // winter teams: darker beasts so they read against the snow
  const pairs = snow ? (variant === 0 ? [0, 2] : [2, 0]) : variant === 0 ? [0, 1] : [2, 0];
  const draw = (side: number, ramp: Ramp) => {
    const cx = OX_PX + S.x * side * 3.4;
    const cy = OX_PY + S.y * side * 3.4;
    const top = ramp.length - 2;
    const bob = frame % 2 === 1 ? -1 : 0;
    const ph = (frame + (side > 0 ? 1 : 0)) % 4;
    const swing = [1, 0, -1, 0][ph];
    const legs: [number, number, number][] = [
      [4.5, -1, swing],
      [4.5, 1, -swing],
      [-3.5, -1, -swing],
      [-3.5, 1, swing],
    ];
    for (const [u, k, sw] of legs) {
      const lx = Math.round(cx + A.x * (u + sw) + S.x * k * 0.8);
      const ly = Math.round(cy + A.y * (u + sw) + S.y * k * 0.8);
      const near = k > 0;
      for (let y = ly - 4; y <= ly; y++) {
        p.set(lx, y, y === ly ? P.outline[1] : ramp[near ? 3 : 1]);
        p.set(lx + 1, y, y === ly ? P.outline[1] : ramp[near ? 2 : 1]);
      }
    }
    const hx = cx + A.x * 8.4;
    const hy = cy - 6 + bob + A.y * 8.4 + 1;
    const head = () => {
      const hl = Math.hypot(A.x, A.y + 0.6) || 1;
      lathe(p, hx, hy, A.x / hl, (A.y + 0.6) / hl, 5, (f) => 2 - f * 0.7, ramp, { lo: 1, hi: top, gamma: 1.2 });
      if (!H.back) {
        p.set(Math.round(hx + A.x * 2.6), Math.round(hy + 2), P.outline[2]); // muzzle
        p.set(Math.round(hx + A.x * 0.6), Math.round(hy - 1), P.outline[0]); // eye
      }
      const bx = Math.round(hx - A.x * 1);
      const by = Math.round(hy - 2);
      p.set(bx - 1, by - 1, P.limestone[5]);
      p.set(bx - 2, by - 2, P.limestone[4]);
      p.set(bx - 2, by - 3, P.outline[2]);
      p.set(bx + 1, by - 1, P.limestone[4]);
      p.set(bx + 2, by - 2, P.limestone[3]);
      p.set(bx + 2, by - 3, P.outline[2]);
    };
    if (H.back) head();
    latheA(p, cx, cy - 7 + bob, A, 13, (f) => (f < 0.1 ? 3.1 * Math.sqrt(f / 0.1) + 0.3 : 3.2 + 0.7 * Math.max(0, f - 0.45) * 2.2), ramp, { lo: 1, hi: top, gamma: 1.3 });
    const hx0 = cx + A.x * 3.5;
    const hy0 = cy - 7 + bob + A.y * 3.5;
    p.set(Math.round(hx0 - 1), Math.round(hy0 - 4), ramp[top]);
    p.set(Math.round(hx0), Math.round(hy0 - 4), ramp[top - 1]);
    if (!H.back) {
      p.set(Math.round(cx + A.x * 6.5), Math.round(cy - 4 + bob + A.y * 6.5), ramp[1]);
      head();
    }
    // tail swishing
    const tx = Math.round(cx - A.x * 6.4);
    const ty = Math.round(cy - 7 + bob - A.y * 6.4);
    const tsw = frame % 2 ? 1 : 0;
    const td = A.x >= 0 ? 1 : -1;
    p.set(tx - td * tsw, ty + 1, ramp[1]);
    p.set(tx - td * tsw, ty + 2, ramp[1]);
    p.set(tx - td * (1 + tsw), ty + 3, P.outline[2]);
    if (snow) {
      p.set(Math.round(cx + A.x * 1), Math.round(cy - 10 + bob + A.y * 1), P.snow[4]);
      p.set(Math.round(cx - A.x * 2), Math.round(cy - 10 + bob - A.y * 2), P.snow[3]);
      p.set(Math.round(cx + A.x * 4), Math.round(cy - 11 + bob + A.y * 4), P.snow[3]);
    }
  };
  shadow(p, OX_PX + 3, OX_PY + 1, 12, 5, 0.3);
  for (let k = 2; k < 12; k++) {
    const x = Math.round(OX_PX - A.x * k);
    const y = Math.round(OX_PY - 3 - A.y * k + (k > 8 ? 1 : 0));
    p.set(x, y, k % 2 ? P.steel[2] : P.steel[4]);
  }
  draw(-1, ramps[pairs[0]]);
  draw(1, ramps[pairs[1]]);
  const yx = OX_PX + A.x * 6.6;
  const yy = OX_PY - 10 + A.y * 6.6;
  dline(p, yx - S.x * 5.5, yy - S.y * 5.5, yx + S.x * 5.5, yy + S.y * 5.5, P.wood[5]);
  dline(p, yx - S.x * 5.5, yy + 1 - S.y * 5.5, yx + S.x * 5.5, yy + 1 + S.y * 5.5, P.wood[2]);
  p.outline(P.outline[1]);
}

/** Transport wagon / sledge with the barrel lashed on. */
export const WAGON: Record<CannonType, { w: number; h: number; px: number; py: number; len: number; wheels: number }> = {
  sahi: { w: 84, h: 56, px: 42, py: 38, len: 46, wheels: 7 },
  buyuk: { w: 64, h: 46, px: 32, py: 31, len: 32, wheels: 4 },
  orta: { w: 50, h: 38, px: 25, py: 26, len: 22, wheels: 2 },
  kucuk: { w: 40, h: 32, px: 20, py: 22, len: 14, wheels: 1 },
  havan: { w: 44, h: 38, px: 22, py: 26, len: 16, wheels: 2 },
};

function drawWagon(p: PixelCanvas, type: CannonType, hi: number, frame: number, snow: boolean): void {
  const wg = WAGON[type];
  const { A, S, back } = headingOf(hi);
  const cx = wg.px;
  const cy = wg.py;
  const halfW = type === 'sahi' ? 5 : type === 'buyuk' ? 4 : 3;
  const Al = Math.hypot(A.x, A.y);
  shadow(p, cx + 3, cy + 2, Math.max(8, wg.len * 0.6 * Math.abs(A.x) + halfW * 1.2), wg.len * 0.3 * Math.abs(A.y) + 4, 0.32);
  const wr = type === 'sahi' ? 3 : 3.5;
  const wheelsAt = (side: number, far: boolean) => {
    for (let i = 0; i < wg.wheels; i++) {
      const u = wg.wheels === 1 ? 0 : -wg.len / 2 + 3 + (i * (wg.len - 6)) / (wg.wheels - 1);
      wheelA(p, cx + A.x * u + S.x * halfW * side, cy + A.y * u + S.y * halfW * side, wr, A, frame + i, far);
    }
  };
  wheelsAt(-1, true);
  boxA(p, cx, cy, A, S, wg.len, halfW * 2 + 1, 2, 3, P.wood, 1);
  if (type === 'sahi')
    for (let k = -wg.len / 2 + 6; k < wg.len / 2; k += 6.5)
      dline(p, cx + A.x * k - S.x * halfW, cy + A.y * k - S.y * halfW - 5, cx + A.x * k + S.x * halfW, cy + A.y * k + S.y * halfW - 5, P.wood[2]);
  const g = GUN[type];
  const pr = barrelProfile(type, g.R);
  const bcy = type === 'havan' ? cy - 9 : cy - 5 - g.R - 0.5;
  // seen from behind the muzzle faces away: no bore visible
  const ax = A.x / Al;
  const ay = A.y / Al;
  lathe(p, cx, bcy, ax, ay, g.L * Al, pr.prof, P.bronze, {
    lo: 0,
    bands: pr.bands,
    bore: back ? 0 : pr.bore,
    capK: Al < 0.8 ? 0.78 : 0.5,
    gold: type === 'sahi' ? [0.55, 0.74] : undefined,
    seed: 7,
    lashes: type === 'sahi' ? [0.18, 0.45, 0.7, 0.9] : [0.3, 0.75],
  });
  if (snow)
    for (let k = -g.L / 2 + 3; k < g.L / 2 - 2; k += 1) {
      if (hash2(k | 0, 3, 9) < 0.45) continue;
      p.set(Math.round(cx + A.x * k), Math.round(bcy - g.R + A.y * k), P.snow[3]);
    }
  wheelsAt(1, false);
  p.outline(P.outline[1]);
}

// ───────────────────────────── UI-world sprites ─────────────────────────────

function drawRing(p: PixelCanvas, frame: number): void {
  const cx = p.w / 2;
  const cy = p.h / 2;
  const rx = p.w / 2 - 1;
  const ry = p.h / 2 - 1;
  for (let i = 0; i < 360; i++) {
    const t = (i / 360) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(t) * rx - 0.5);
    const y = Math.round(cy + Math.sin(t) * ry - 0.5);
    const dash = Math.floor(((t / (Math.PI * 2)) * 16 + frame * 0.5) % 2) === 0;
    p.set(x, y, dash ? P.gold[5] : P.gold[3]);
    if (Math.sin(t) > 0) p.set(x, y + 1, P.gold[1], 0.6);
  }
}

function drawReticle(p: PixelCanvas, frame: number): void {
  const cx = 8;
  const cy = 5;
  const c = frame ? P.red[5] : P.red[4];
  p.diamond(cx, cy, 15 - frame * 2, 9 - frame, P.red[2], 0.25);
  for (const [dx, dy] of [[-7, 0], [7, 0], [0, -4], [0, 4]] as const) {
    p.set(cx + dx, cy + dy, c);
    p.set(cx + dx * 0.7, cy + dy * 0.75, c);
  }
  p.set(cx, cy, P.fire[6]);
}

function drawBarFrame(p: PixelCanvas): void {
  p.rect(0, 0, p.w, p.h, P.outline[0]);
  p.rect(1, 1, p.w - 2, p.h - 2, P.outline[2]);
}

function drawBarFill(p: PixelCanvas, ramp: Ramp): void {
  for (let x = 0; x < p.w; x++) {
    const t = x / (p.w - 1);
    const i = Math.min(ramp.length - 1, Math.round(2 + t * (ramp.length - 3)));
    p.set(x, 0, ramp[Math.min(ramp.length - 1, i + 1)]);
    p.set(x, 1, ramp[i]);
  }
}

function drawWarn(p: PixelCanvas): void {
  p.diamond(4.5, 5, 9, 10, P.red[4]);
  p.diamond(4.5, 5, 7, 8, P.red[5]);
  p.rect(4, 2, 1, 4, P.cloth[5]);
  p.set(4, 7, P.cloth[5]);
  p.outline(P.outline[0]);
}

function drawCrater(p: PixelCanvas, v: number): void {
  const cx = p.w / 2;
  const cy = p.h / 2;
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      const dx = (x + 0.5 - cx) / (p.w / 2);
      const dy = (y + 0.5 - cy) / (p.h / 2);
      const e = dx * dx + dy * dy + (hash2(x, y, v + 40) - 0.5) * 0.3;
      if (e > 1) continue;
      if (e > 0.75) p.set(x, y, dx + dy < 0 ? P.dirt[4] : P.dirt[3], 0.9);
      else if (e > 0.35) p.set(x, y, dx + dy < 0 ? P.dirt[1] : P.dirt[2], 0.95);
      else p.set(x, y, P.dirt[0], 0.95);
    }
  // thrown clods
  for (let k = 0; k < 5; k++) {
    const a = hash2(k, v, 3) * Math.PI * 2;
    const r = 0.95 + hash2(k, v, 4) * 0.1;
    p.set(Math.round(cx + Math.cos(a) * (p.w / 2) * r * 0.95), Math.round(cy + Math.sin(a) * (p.h / 2) * r * 0.95), P.dirt[3]);
  }
}

function drawRut(p: PixelCanvas, hi: number, snow: boolean): void {
  const { A, S } = headingOf(hi);
  const cx = p.w / 2;
  const cy = p.h / 2;
  const c1 = snow ? P.snow[0] : P.dirt[2];
  const c2 = snow ? P.night[3] : P.dirt[1];
  for (const side of [-2.4, 2.4])
    for (let k = -3; k <= 3; k++) p.set(Math.round(cx + A.x * k + S.x * side), Math.round(cy + A.y * k + S.y * side), k % 2 ? c1 : c2, 0.8);
  if (snow) for (let k = -2; k <= 2; k += 2) p.set(Math.round(cx + A.x * k), Math.round(cy + A.y * k), P.snow[1], 0.7);
}

function drawBreath(p: PixelCanvas, f: number): void {
  const r = [1, 1.6, 2][f];
  const a = [0.8, 0.55, 0.3][f];
  const cx = 3.5;
  const cy = 3.5 - f * 0.5;
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d <= r && bayer(x, y) < a + 0.2) p.set(x, y, d < r * 0.5 ? P.snow[4] : P.snow[3], a);
    }
}

function drawDirt(p: PixelCanvas, f: number): void {
  // shovelled earth clod arc
  const pts = [
    [1, 4], [2, 3], [3, 2], [4, 2], [5, 3],
  ];
  const [x, y] = pts[Math.min(pts.length - 1, f)];
  p.set(x, y, P.dirt[4]);
  p.set(x + 1, y, P.dirt[3]);
  if (f > 1) p.set(x - 1, y + 1, P.dirt[3]);
}

// ───────────────────────────── icons & portrait ─────────────────────────────

function iconFrame(p: PixelCanvas): void {
  const w = p.w;
  const h = p.h;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const t = (x + y) / (w + h);
      p.set(x, y, bayer(x, y) < t ? '#d8c49a' : '#efe2c2');
    }
  for (let x = 0; x < w; x++) {
    p.set(x, 0, P.gold[3]);
    p.set(x, h - 1, P.gold[2]);
  }
  for (let y = 0; y < h; y++) {
    p.set(0, y, P.gold[3]);
    p.set(w - 1, y, P.gold[2]);
  }
  for (let x = 1; x < w - 1; x++) p.set(x, 1, P.gold[5]);
}

function iconGun(p: PixelCanvas, type: CannonType): void {
  iconFrame(p);
  const q = new PixelCanvas(p.w, p.h);
  const g = GUN[type];
  const dir: Dir = 1;
  if (type === 'havan') {
    box(q, 15, 25, dir, 12, 11, 5, 0, P.wood, 1);
    const { ax, ay } = havanAxis(dir);
    drawBarrel(q, 'havan', dir, 15 + ax * 2, 25 - 7 + ay * 2);
  } else {
    const { ax, ay } = axisOf(dir);
    const L = g.L;
    const k = Math.min(1, 26 / L);
    const cx = 15;
    const cy = 20;
    box(q, cx, cy + 3, dir, Math.round(L * k), 5, 3, 0, P.wood, 1);
    const pr = barrelProfile(type, g.R);
    lathe(q, cx, cy - g.R * 0.6, ax, ay, L * k, (f) => pr.prof(f) * Math.min(1.2, 0.85 + (1 - k)), P.bronze, { bands: pr.bands, bore: pr.bore, capK: 0.5, gold: type === 'sahi' ? [0.55, 0.74] : undefined });
    if (type === 'sahi') sphere(q, 26, 26, 2.6, P.limestone, 0, 5);
  }
  q.outline(P.outline[1]);
  p.blit(q, 0, 0);
}

function iconFoundry(p: PixelCanvas): void {
  iconFrame(p);
  const q = new PixelCanvas(p.w, p.h);
  // furnace (brick) with glowing mouth
  q.isoBox(8, 12, 6, 5, 12, { top: P.brick[4], left: P.brick[3], right: P.brick[1], edge: P.brick[5] }, 2, 1);
  for (let y = 18; y < 23; y++) for (let x = 7; x < 11; x++) q.set(x, y, y < 20 ? P.fire[5] : P.fire[4]);
  // crucible pouring a stream of molten bronze into a mould
  q.rect(16, 9, 6, 4, P.steel[2]);
  q.rect(16, 9, 6, 1, P.steel[4]);
  for (let y = 13; y < 24; y++) q.set(21 + (y > 16 ? 1 : 0), y, y % 2 ? P.fire[6] : P.fire[5]);
  q.ellipse(23, 25, 5, 2, P.dirt[2]);
  q.ellipse(23, 25, 2, 1, P.fire[5]);
  q.outline(P.outline[1]);
  p.blit(q, 0, 0);
  // smoke wisp
  p.set(9, 5, P.smoke[4]);
  p.set(10, 4, P.smoke[5]);
  p.set(11, 3, P.smoke[4]);
}

function iconOx(p: PixelCanvas): void {
  iconFrame(p);
  const q = new PixelCanvas(p.w, p.h);
  // ox head front view with yoke
  q.ellipse(16, 18, 6, 7, P.stone[5]);
  q.ellipse(15, 17, 4, 5, P.stone[6]);
  q.ellipse(16, 23, 4, 3, P.stone[3]);
  q.set(14, 23, P.outline[1]);
  q.set(18, 23, P.outline[1]);
  q.set(13, 16, P.outline[0]);
  q.set(19, 16, P.outline[0]);
  for (let k = 0; k < 6; k++) {
    q.set(10 - k, 12 - Math.floor(k * 0.7), P.limestone[5 - (k >> 2)]);
    q.set(22 + k, 12 - Math.floor(k * 0.7), P.limestone[4 - (k >> 2)]);
  }
  q.rect(5, 26, 22, 2, P.wood[4]);
  q.rect(5, 27, 22, 1, P.wood[2]);
  q.outline(P.outline[1]);
  p.blit(q, 0, 0);
}

function iconGabion(p: PixelCanvas): void {
  iconFrame(p);
  const q = new PixelCanvas(p.w, p.h);
  gabion(q, 9, 26, 4, 12, 0);
  gabion(q, 22, 26, 4, 12, 1);
  gabion(q, 15, 28, 4, 12, 2);
  q.outline(P.outline[1]);
  p.blit(q, 0, 0);
}

function iconTarget(p: PixelCanvas): void {
  iconFrame(p);
  const q = new PixelCanvas(p.w, p.h);
  // wall with a breach and crosshair
  q.isoBox(16, 10, 10, 3, 12, { top: P.limestone[4], left: P.limestone[3], right: P.limestone[1] }, 2, 1);
  for (let x = 5; x < 26; x++) if (x % 5 < 3) q.set(x, 17 + ((x - 5) >> 2) - 4, P.brick[3]);
  q.outline(P.outline[1]);
  p.blit(q, 0, 0);
  for (let k = -6; k <= 6; k++) {
    if (Math.abs(k) < 2) continue;
    p.set(16 + k, 16, P.red[4]);
    p.set(16, 16 + k, P.red[4]);
  }
  for (let i = 0; i < 40; i++) {
    const t = (i / 40) * Math.PI * 2;
    p.set(Math.round(16 + Math.cos(t) * 5), Math.round(16 + Math.sin(t) * 5), P.red[5]);
  }
}

function iconCracked(p: PixelCanvas): void {
  iconGun(p, 'buyuk');
  const crack = [[12, 14], [13, 15], [13, 16], [14, 17], [15, 17], [15, 18], [16, 19]];
  for (const [x, y] of crack) p.set(x, y, P.outline[0]);
  p.set(17, 12, P.fire[5]);
  p.set(18, 11, P.smoke[4]);
}

function iconBalls(p: PixelCanvas): void {
  iconFrame(p);
  const q = new PixelCanvas(p.w, p.h);
  sphere(q, 11, 22, 5, P.limestone, 0, 5);
  sphere(q, 21, 22, 5, P.limestone, 0, 5);
  sphere(q, 16, 14, 5, P.limestone, 0, 5);
  q.outline(P.outline[1]);
  p.blit(q, 0, 0);
}

function iconHeat(p: PixelCanvas): void {
  iconFrame(p);
  const q = new PixelCanvas(p.w, p.h);
  const { ax, ay } = axisOf(1);
  lathe(q, 15, 20, ax, ay, 22, (f) => 3.6, P.bronze, { bore: 0.6 });
  for (let k = 0; k < 4; k++) {
    q.set(9 + k * 4, 11 - (k % 2), P.fire[4]);
    q.set(9 + k * 4, 9 - (k % 2), P.fire[5]);
    q.set(10 + k * 4, 7, P.fire[6]);
  }
  q.outline(P.outline[1]);
  p.blit(q, 0, 0);
}

function portraitOrban(p: PixelCanvas): void {
  const w = p.w;
  const h = p.h;
  // warm foundry-glow background
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(x - w * 0.3, y - h * 0.75) / w;
      const t = Math.min(1, d * 1.4);
      const c = bayer(x, y) < t ? (t > 0.7 ? P.outline[2] : P.fire[1]) : t < 0.35 ? P.fire[3] : P.fire[2];
      p.set(x, y, c);
    }
  const cx = 25;
  // shoulders / coat
  for (let y = 34; y < h; y++)
    for (let x = 6; x < w - 4; x++) {
      const e = ((x - cx) / 20) ** 2 + ((y - 50) / 16) ** 2;
      if (e > 1) continue;
      const s = (x - cx) / 20;
      p.set(x, y, P.purple[rampIdx(lightI(s, -0.3, 0.8), 1, 4)]);
    }
  // leather apron
  for (let y = 40; y < h; y++) for (let x = cx - 5; x <= cx + 5; x++) p.set(x, y, x < cx ? P.wood[4] : P.wood[3]);
  // neck & head
  sphereLike(p, cx, 24, 9, 11, P.skin);
  // beard (grey, full)
  for (let y = 26; y < 40; y++)
    for (let x = cx - 9; x <= cx + 9; x++) {
      const e = ((x - cx) / 9) ** 2 + ((y - 29) / 11) ** 2;
      if (e > 1 || y < 27 + Math.abs(x - cx) * 0.2) continue;
      const n = hash2(x, y, 5);
      p.set(x, y, n < 0.3 ? P.stone[4] : n < 0.7 ? P.stone[5] : P.stone[6]);
    }
  // mouth/moustache
  for (let x = cx - 4; x <= cx + 4; x++) p.set(x, 28, P.stone[3]);
  p.set(cx - 1, 29, P.outline[2]);
  p.set(cx, 29, P.outline[2]);
  // eyes & brows
  for (const ex of [cx - 4, cx + 3]) {
    p.set(ex, 21, P.outline[0]);
    p.set(ex + 1, 21, P.outline[1]);
    p.set(ex - 1, 19, P.stone[3]);
    p.set(ex, 19, P.stone[3]);
    p.set(ex + 1, 19, P.stone[4]);
  }
  p.set(cx, 24, P.skin[2]);
  p.set(cx - 1, 25, P.skin[2]);
  // fur cap (kalpak) with red crown
  for (let y = 6; y < 16; y++)
    for (let x = cx - 11; x <= cx + 11; x++) {
      const e = ((x - cx) / 11) ** 2 + ((y - 12) / 6) ** 2;
      if (e > 1) continue;
      const n = hash2(x, y, 8);
      p.set(x, y, y < 9 ? (x < cx ? P.red[4] : P.red[3]) : n < 0.35 ? P.wood[1] : n < 0.75 ? P.wood[2] : P.wood[3]);
    }
  for (let x = cx - 10; x <= cx + 10; x++) p.set(x, 15, P.wood[(x & 1) ? 1 : 2]);
  p.outline(P.outline[0]);
  // gold frame
  for (let x = 0; x < w; x++) {
    p.set(x, 0, P.gold[4]);
    p.set(x, h - 1, P.gold[2]);
  }
  for (let y = 0; y < h; y++) {
    p.set(0, y, P.gold[4]);
    p.set(w - 1, y, P.gold[2]);
  }
}

function sphereLike(p: PixelCanvas, cx: number, cy: number, rx: number, ry: number, ramp: Ramp): void {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      const d2 = dx * dx + dy * dy;
      if (d2 > 1) continue;
      p.set(x, y, ramp[rampIdx(lightI(dx, dy, Math.sqrt(1 - d2)), 1, ramp.length - 1, 0.95)]);
    }
}

// ───────────────────────────── registration ─────────────────────────────

export const GUN_TYPES: CannonType[] = ['sahi', 'buyuk', 'orta', 'kucuk', 'havan'];

export function gunKey(type: CannonType, dir: Dir): string {
  return `topcu/top-${type}-${dirKey(dir)}`;
}

export function generateArtilleryTextures(gen: TextureGen): void {
  for (const type of GUN_TYPES) {
    const g = GUN[type];
    for (const dir of DIRS) {
      const k = dirKey(dir);
      gen.canvas(gunKey(type, dir), g.w, g.h, (p) => drawGun(p, type, dir));
      const zw = Math.round(g.L * 1.6 + 20);
      gen.canvas(`topcu/zemin-${type}-${k}`, zw, Math.round(zw * 0.55), (p) => drawZemin(p, type, dir));
      gen.canvas(`topcu/arka-${type}-${k}`, ARKA_GEOM.w, ARKA_GEOM.h, (p) => drawArka(p, type, dir));
      for (const st of [1, 2]) gen.canvas(`topcu/on-${type}-${k}-${st}`, ON_GEOM.w, ON_GEOM.h, (p) => drawOn(p, type, dir, st));
      gen.sheet(`topcu/perde-${type}-${k}`, PERDE_GEOM.w, PERDE_GEOM.h, 3, (p, f) => drawPerde(p, type, dir, f));
    }
    const wg = WAGON[type];
    for (let hi = 0; hi < HEADINGS; hi++)
      for (const snow of [false, true]) gen.sheet(`topcu/araba-${type}-h${hi}${snow ? '-kar' : ''}`, wg.w, wg.h, 2, (p, f) => drawWagon(p, type, hi, f, snow));
  }
  for (const dir of DIRS) {
    const k = dirKey(dir);
    gen.canvas(`topcu/vinc-${k}`, VINC_GEOM.w, VINC_GEOM.h, (p) => drawVinc(p, dir));
    for (let s = 0; s < 4; s++) {
      const fg = FLASH_GEOM(s);
      gen.sheet(`topcu/alev-${s}-${k}`, fg.w, fg.h, 5, (p, f) => drawFlash(p, s, dir, f, false));
    }
    const fg = FLASH_GEOM(2);
    gen.sheet(`topcu/alev-havan-${k}`, fg.w, fg.h + 8, 5, (p, f) => drawFlash(p, 2, dir, f, true));
  }
  for (let hi = 0; hi < HEADINGS; hi++) {
    for (const v of [0, 1])
      for (const snow of [false, true]) gen.sheet(`topcu/okuz-h${hi}-${v}${snow ? '-kar' : ''}`, OX_W, OX_H, 4, (p, f) => drawOxPair(p, hi, f, v, snow));
    for (const snow of [false, true]) gen.canvas(`topcu/iz-h${hi}${snow ? '-kar' : ''}`, 14, 9, (p) => drawRut(p, hi, snow));
  }
  // crews
  MAN_VARIANTS.forEach((v, vi) => {
    gen.sheet(`topcu/adam-${vi}`, MAN_W, MAN_H, MAN_FRAMES * 2, (p, fr) => {
      const f: 1 | -1 = fr < MAN_FRAMES ? 1 : -1;
      drawMan(p, fr % MAN_FRAMES, f, v);
    });
  });
  gen.sheet('topcu/mangal', 11, 13, 4, (p, f) => drawMangal(p, f));
  gen.anim('topcu/mangal:yan', 'topcu/mangal', [0, 1, 2, 3, 1, 2], 8);
  gen.sheet('topcu/kivilcim', 8, 8, 4, (p, f) => drawSpark(p, f));
  gen.sheet('topcu/nefes', 7, 7, 3, (p, f) => drawBreath(p, f));
  gen.sheet('topcu/toprak', 8, 6, 5, (p, f) => drawDirt(p, f));
  // balls (sizes 0..2) and their shadow
  const BR = [3.3, 2, 1.4];
  BR.forEach((r, i) => {
    const s = Math.ceil(r * 2) + 2;
    gen.canvas(`topcu/gulle-${i}`, s, s, (p) => {
      sphere(p, s / 2, s / 2, r, P.limestone, 0, 5);
      p.outline(P.outline[1]);
    });
  });
  gen.canvas('topcu/ip', 1, 40, (p) => {
    for (let y = 0; y < 40; y++) p.set(0, y, y % 3 === 0 ? P.dryGrass[1] : P.dryGrass[3]);
  });
  for (let v = 0; v < 3; v++) gen.canvas(`topcu/krater-${v}`, 12 + v * 2, 7 + v, (p) => drawCrater(p, v));
  // UI-world
  const ringSizes = [22, 34, 50];
  ringSizes.forEach((w, i) => gen.sheet(`topcu/halka-${i}`, w, Math.round(w / 2), 2, (p, f) => drawRing(p, f)));
  gen.sheet('topcu/hedef', 17, 11, 2, (p, f) => drawReticle(p, f));
  gen.canvas('topcu/bar', 20, 4, (p) => drawBarFrame(p));
  gen.canvas('topcu/bar-isi', 18, 2, (p) => drawBarFill(p, P.fire));
  gen.canvas('topcu/bar-dolum', 18, 2, (p) => drawBarFill(p, P.gold));
  gen.canvas('topcu/uyari', 9, 11, (p) => drawWarn(p));
  // UI icons
  for (const type of GUN_TYPES) gen.canvas(`topcu/icon-${type}`, 32, 32, (p) => iconGun(p, type));
  gen.canvas('topcu/icon-dokum', 32, 32, iconFoundry);
  gen.canvas('topcu/icon-yolda', 32, 32, iconOx);
  gen.canvas('topcu/icon-mevzi', 32, 32, iconGabion);
  gen.canvas('topcu/icon-hedef', 32, 32, iconTarget);
  gen.canvas('topcu/icon-kirik', 32, 32, iconCracked);
  gen.canvas('topcu/icon-gulle', 32, 32, iconBalls);
  gen.canvas('topcu/icon-isi', 32, 32, iconHeat);
  gen.canvas('topcu/orban', 48, 48, portraitOrban);
}
