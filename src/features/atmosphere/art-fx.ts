import { hex, P } from '../../art/palette';
import { bayer, type PixelCanvas } from '../../art/pixel';
import type { TextureGen } from '../../art/texture';
import { hash2 } from '../../core/rng';

/**
 * Procedural pixel-art FX textures (keys 'fx/…'). Phaser-free: only PixelCanvas.
 * Light comes from the upper-left: puffs/debris/balls are lit top-left, shaded bottom-right.
 */

const c = (s: string) => hex(s);

// ───────────────────────────── Puffs (smoke / dust / mist) ─────────────────────────────

/** Puff radii: indices 0..6 live in 'fx/puff-s' (20×20), 7..13 in 'fx/puff-l' (48×48). */
export const PUFF_R = [2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 18, 20, 22];
export const PUFF_SMALL_N = 7;
export const PUFF_TONES = 7;
export const PUFF_VARIANTS = 2;
export const PUFF_DISSOLVE = 4;
/** Tone ids. */
export const TONE = { light: 0, gray: 1, soot: 2, sand: 3, dirt: 4, stone: 5, mist: 6 } as const;

const PUFF_RAMPS: number[][] = [
  [P.smoke[4], P.smoke[5], P.smoke[6], P.cloth[5]].map(c),
  [P.smoke[3], P.smoke[4], P.smoke[5], P.smoke[6]].map(c),
  [P.smoke[1], P.smoke[2], P.smoke[3], P.smoke[4]].map(c),
  [P.sand[1], P.sand[2], P.sand[3], P.sand[4]].map(c),
  [P.dirt[2], P.dirt[3], P.dirt[4], P.dirt[5]].map(c),
  [P.limestone[1], P.limestone[2], P.limestone[3], P.limestone[4]].map(c),
  [P.water[5], P.water[6], P.water[7], P.water[8]].map(c),
];

/** Frame index inside a puff sheet. */
export function puffFrame(tone: number, variant: number, dissolve: number, rLocal: number): number {
  return ((tone * PUFF_VARIANTS + variant) * PUFF_DISSOLVE + dissolve) * PUFF_SMALL_N + rLocal;
}

const LOBES: [number, number, number, number][][] = [
  // [dx, dy, radius, elevation] in units of r
  [
    [0, 0.05, 0.8, 0.2],
    [-0.42, -0.22, 0.6, 0.15],
    [0.38, -0.32, 0.55, 0.1],
    [0.15, 0.32, 0.58, 0],
  ],
  [
    [0.02, 0, 0.78, 0.2],
    [-0.36, 0.22, 0.6, 0.05],
    [0.32, -0.28, 0.64, 0.12],
    [-0.18, -0.46, 0.48, 0.1],
  ],
];

const LX = -0.5;
const LY = -0.62;
const LZ = 0.6;
const LN = Math.hypot(LX, LY, LZ);

function drawPuff(p: PixelCanvas, size: number, r: number, tone: number, variant: number, dis: number): void {
  const cx = size / 2;
  const cy = size / 2;
  const lobes = LOBES[variant];
  const ramp = PUFF_RAMPS[tone];
  const small = r <= 3;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const px = x + 0.5 - cx;
      const py = y + 0.5 - cy;
      let bestZ = -1e9;
      let nx = 0;
      let ny = 0;
      let nz = 1;
      let rim = 0;
      for (const [lx, ly, lr, le] of lobes) {
        const rr = lr * r + (small ? 0.6 : 0);
        const dx = px - lx * r;
        const dy = py - ly * r;
        const d2 = dx * dx + dy * dy;
        if (d2 > rr * rr) continue;
        const h = Math.sqrt(rr * rr - d2);
        const z = h + le * r;
        rim = Math.max(rim, 1 - Math.sqrt(d2) / rr);
        if (z > bestZ) {
          bestZ = z;
          nx = dx / rr;
          ny = dy / rr;
          nz = h / rr;
        }
      }
      if (bestZ < -1e8) continue;
      const bx = bayer(x, y);
      // dithered soft edge
      if (rim < 0.14 && bx > rim / 0.14) continue;
      // dissolve into wisps (clumpy holes)
      if (dis > 0) {
        const n = hash2(x >> 1, y >> 1, variant * 7 + r) * 0.65 + bx * 0.35;
        if (n < dis * 0.23 + (1 - rim) * dis * 0.08) continue;
      }
      const diffuse = (nx * LX + ny * LY + nz * LZ) / LN;
      // smoke scatters light: soft shading, darkest band only on the far lower-right rim
      let s = 0.6 + 0.45 * diffuse;
      if (small) s = 0.62 + 0.38 * diffuse;
      let lvl = Math.floor(s * 4 + (bx - 0.5) * 0.85);
      // crisp rim light on the upper-left silhouette
      if (rim < 0.22 && nx + ny < -0.55) lvl = 3;
      lvl = Math.max(0, Math.min(3, lvl));
      p.set(x, y, ramp[lvl]);
    }
}

// ───────────────────────────── Flames ─────────────────────────────

export const FLAME_FRAMES = 8;
export const FLAME_SIZES: { key: string; w: number; h: number }[] = [
  { key: 'fx/flame-s', w: 8, h: 12 },
  { key: 'fx/flame-m', w: 12, h: 18 },
  { key: 'fx/flame-l', w: 18, h: 28 },
];

function valueNoise(x: number, y: number, period: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const w = (a: number, b: number) => hash2(a, ((b % period) + period) % period, seed);
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = w(xi, yi) + (w(xi + 1, yi) - w(xi, yi)) * sx;
  const b = w(xi, yi + 1) + (w(xi + 1, yi + 1) - w(xi, yi + 1)) * sx;
  return a + (b - a) * sy;
}

const FIRE = P.fire.map(c);

function drawFlame(p: PixelCanvas, w: number, h: number, frame: number, seed: number): void {
  const ph = (frame / FLAME_FRAMES) * Math.PI * 2;
  const cell = Math.max(2, Math.round(h / 6));
  const period = Math.round(h / cell);
  const scroll = (frame / FLAME_FRAMES) * period;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = 1 - (y + 0.5) / h; // 0 bottom … 1 top
      const u = (x + 0.5 - w / 2) / (w / 2);
      const sway = 0.2 * Math.sin(ph + v * 3.2) * v + 0.08 * Math.sin(ph * 2 + v * 7) * v;
      const uu = u - sway;
      const base = Math.min(1, v / 0.14);
      const prof = Math.pow(Math.max(0, 1 - v), 0.62) * (0.55 + 0.45 * Math.sqrt(base));
      const n = valueNoise(x / cell, y / cell + scroll, period, seed);
      const n2 = valueNoise(x / (cell * 0.5) + 3, y / (cell * 0.5) + scroll * 2, period * 2, seed + 9);
      let I = prof - Math.abs(uu) * 0.95 + (n - 0.5) * 0.55 * (0.3 + v) + (n2 - 0.5) * 0.2;
      I += (1 - v) * 0.18 * Math.max(0, 1 - Math.abs(uu) * 2);
      I += (bayer(x, y) - 0.5) * 0.1;
      let col = -1;
      if (I > 0.66) col = 6;
      else if (I > 0.52) col = 5;
      else if (I > 0.39) col = 4;
      else if (I > 0.27) col = 3;
      else if (I > 0.17) col = 2;
      if (col >= 0) p.set(x, y, FIRE[col]);
    }
}

// ───────────────────────────── Debris ─────────────────────────────

export const DEBRIS_MATS = ['tas', 'tugla', 'tahta'] as const;
export function debrisFrame(mat: number, shape: number, spin: number): number {
  return (mat * 4 + shape) * 4 + spin;
}

const DEBRIS_RAMP: number[][] = [
  [P.limestone[0], P.limestone[1], P.limestone[2], P.limestone[3], P.limestone[4]].map(c),
  [P.brick[0], P.brick[1], P.brick[2], P.brick[3], P.brick[5]].map(c),
  [P.wood[1], P.wood[2], P.wood[3], P.wood[5], P.wood[6]].map(c),
];

function drawDebris(p: PixelCanvas, mat: number, shape: number, spin: number): void {
  const big = shape >= 2;
  const cx = 5;
  const cy = 5;
  const pts: [number, number][] = [];
  const ang0 = spin * (Math.PI / 4) + shape * 0.7;
  if (mat === 0) {
    const n = 5 + (shape % 2);
    const rr = big ? 3.2 : 1.9;
    for (let i = 0; i < n; i++) {
      const a = ang0 + (i / n) * Math.PI * 2;
      const r = rr * (0.7 + 0.5 * hash2(i, shape, 31));
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.85]);
    }
  } else {
    const L = mat === 1 ? (big ? 3.2 : 2) : big ? 4 : 2.6;
    const W = mat === 1 ? (big ? 1.6 : 1.1) : big ? 0.9 : 0.6;
    const ca = Math.cos(ang0);
    const sa = Math.sin(ang0);
    for (const [a, b] of [
      [-L, -W],
      [L, -W],
      [L, W],
      [-L, W],
    ])
      pts.push([cx + a * ca - b * sa, cy + a * sa + b * ca]);
  }
  const ramp = DEBRIS_RAMP[mat];
  p.poly(pts, ramp[2]);
  // shade: lit from upper-left
  const out: [number, number, number][] = [];
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      if (!p.alphaAt(x, y)) continue;
      const ul = !p.alphaAt(x - 1, y) || !p.alphaAt(x, y - 1);
      const dr = !p.alphaAt(x + 1, y) || !p.alphaAt(x, y + 1);
      if (ul && !dr) out.push([x, y, ramp[4]]);
      else if (dr && !ul) out.push([x, y, ramp[1]]);
      else if (ul && dr) out.push([x, y, ramp[3]]);
    }
  for (const [x, y, col] of out) p.set(x, y, col);
  if (mat === 1 && big) {
    // mortar speck
    p.set(cx, cy, c(P.limestone[3]));
  }
  // dark contact pixels in the lower-right concave corners (readability on bright ground)
  const o: [number, number][] = [];
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++)
      if (!p.alphaAt(x, y) && p.alphaAt(x - 1, y) > 0 && p.alphaAt(x, y - 1) > 0) o.push([x, y]);
  for (const [x, y] of o) p.set(x, y, ramp[0]);
}

// ───────────────────────────── Muzzle flash ─────────────────────────────

export const MUZZLE_DIRS = 16;
export const MUZZLE_FRAMES = 4;

function drawMuzzle(p: PixelCanvas, size: number, dir: number, frame: number, scale: number): void {
  const ang = (dir / MUZZLE_DIRS) * Math.PI * 2;
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  const cx = size / 2;
  const cy = size / 2;
  const Ls = [13, 17, 14, 9][frame] * scale;
  const shift = [0.12, 0.02, -0.12, -0.26][frame];
  const reach = [0, 2, 4, 6][frame] * scale;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const px = x + 0.5 - cx;
      const along = px * ca + (y + 0.5 - cy) * sa;
      const perp = -px * sa + (y + 0.5 - cy) * ca;
      const dist = Math.hypot(px, y + 0.5 - cy);
      const core = 1 - dist / (3.8 * scale);
      let cone = -1;
      if (along > -1) {
        const t = (along - reach * 0.3) / Ls;
        const wdt = (1.6 + along * 0.42) * scale * 0.7;
        cone = (1 - Math.max(0, t)) * 0.95 - Math.abs(perp) / (wdt + 0.001) * 0.6;
        if (t > 1) cone = -1;
      }
      // side petals (±70°)
      let pet = -1;
      for (const s of [-1, 1]) {
        const pa = ang + s * 1.2;
        const pal = px * Math.cos(pa) + (y + 0.5 - cy) * Math.sin(pa);
        const pp = -px * Math.sin(pa) + (y + 0.5 - cy) * Math.cos(pa);
        if (pal > 0) pet = Math.max(pet, (1 - pal / (Ls * 0.38)) * 0.7 - Math.abs(pp) / (1.2 * scale) * 0.5);
      }
      const n = (hash2(x, y, dir * 13 + frame) - 0.5) * 0.22;
      const F = Math.max(core, cone, pet) + shift + n + (bayer(x, y) - 0.5) * 0.08;
      let col = -1;
      if (F > 0.66) col = 7;
      else if (F > 0.5) col = 6;
      else if (F > 0.36) col = 5;
      else if (F > 0.24) col = 4;
      else if (F > 0.13) col = 3;
      if (frame === 3 && col > 5) col = 5;
      if (col >= 0) p.set(x, y, FIRE[col]);
    }
}

// ───────────────────────────── Rings / splashes / small bits ─────────────────────────────

function drawRing(p: PixelCanvas, w: number, h: number, i: number, n: number): void {
  const rx = 3 + (i / (n - 1)) * (w / 2 - 4);
  const ry = rx / 2;
  const cx = w / 2;
  const cy = h / 2;
  const th = 1.2 / rx + 0.02;
  const col = i < n * 0.35 ? c(P.cloth[5]) : c(P.limestone[4]);
  const col2 = c(P.cloth[3]);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      const e = Math.sqrt(dx * dx + dy * dy);
      if (Math.abs(e - 1) > th * 1.6) continue;
      if (bayer(x, y) < (i / n) * 0.65) continue;
      // brighter on the upper-left arc (light), dimmer bottom-right
      p.set(x, y, dx + dy < 0 ? col : col2);
    }
}

const WATER = P.water.map(c);

function drawSplash(p: PixelCanvas, w: number, h: number, i: number, n: number): void {
  const t = i / (n - 1);
  const hgt = Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5) * (h - 4) * (t < 0.55 ? 1 : 1 - (t - 0.55) * 1.8);
  const cx = w / 2;
  const base = h - 2;
  const wid = (w * 0.18) * (1 + t * 1.3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = (base - y) / Math.max(1, hgt); // 0 base … 1 top
      if (v < 0 || v > 1.12) continue;
      const u = (x + 0.5 - cx) / wid;
      const prof = 1 - v * 0.55 + (v > 0.82 ? (v - 0.82) * 2.2 : 0); // crown flares at top
      if (Math.abs(u) > prof) continue;
      const bx = bayer(x, y);
      if (t > 0.5 && bx < (t - 0.5) * 1.6 + (1 - v) * 0.1) continue;
      if (v > 0.95 && bx < 0.5) continue;
      const lit = u < -0.2 ? 9 : u < 0.3 ? 8 : 7;
      p.set(x, y, WATER[v > 0.85 ? 9 : lit - (t > 0.6 ? 1 : 0)]);
    }
  // spray droplets around the crown
  for (let k = 0; k < 6; k++) {
    const a = hash2(k, i, 5) * Math.PI;
    const rr = (0.3 + t) * w * 0.4;
    const x = cx + Math.cos(a) * rr * (k % 2 ? 1 : -1);
    const y = base - hgt - Math.sin(a) * 3 + t * t * 14;
    if (y > 0 && y < h) p.set(x, y, WATER[9]);
  }
}

function drawBall(p: PixelCanvas, size: number, r: number, frame: number): void {
  const cx = size / 2;
  const cy = size / 2;
  const ramp = [P.stone[1], P.stone[2], P.stone[3], P.stone[4], P.limestone[3], P.limestone[4]].map(c);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > r * r) continue;
      const nz = Math.sqrt(r * r - d2) / r;
      const diff = ((dx / r) * LX + (dy / r) * LY + nz * LZ) / LN;
      let l = Math.floor((0.45 + 0.6 * diff) * 6 + (bayer(x, y) - 0.5) * 0.6);
      l = Math.max(0, Math.min(5, l));
      p.set(x, y, ramp[l]);
    }
  // carved-stone pits rotating with the spin frame
  const a = (frame / 4) * Math.PI * 2;
  for (let k = 0; k < 2; k++) {
    const aa = a + k * Math.PI * 0.9;
    const rr = r * 0.5;
    p.set(cx + Math.cos(aa) * rr - 0.5, cy + Math.sin(aa) * rr * 0.8 - 0.5, ramp[1]);
  }
  p.outline(c(P.outline[0]));
}

export const ARROW_DIRS = 16;

function drawArrow(p: PixelCanvas, size: number, dir: number): void {
  const ang = (dir / ARROW_DIRS) * Math.PI * 2;
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  const cx = size / 2 - 0.5;
  const cy = size / 2 - 0.5;
  const L = 4.2;
  const tx = Math.round(cx - ca * L);
  const ty = Math.round(cy - sa * L);
  const hx = Math.round(cx + ca * L);
  const hy = Math.round(cy + sa * L);
  p.line(tx, ty, hx, hy, c(P.wood[5]));
  // steel head
  p.set(hx, hy, c(P.steel[5]));
  p.set(Math.round(cx + ca * (L - 1)), Math.round(cy + sa * (L - 1)), c(P.steel[3]));
  // fletching (white/red)
  p.set(tx, ty, c(P.cloth[4]));
  p.set(Math.round(cx - ca * (L - 1) - sa), Math.round(cy - sa * (L - 1) + ca), c(P.red[4]));
  p.set(Math.round(cx - ca * (L - 1) + sa), Math.round(cy - sa * (L - 1) - ca), c(P.cloth[3]));
}

function drawFirePot(p: PixelCanvas, frame: number): void {
  // clay pot lit from upper-left, with a guttering flame
  p.disc(4, 5, 2, c(P.dirt[3]));
  p.set(3, 4, c(P.dirt[5]));
  p.set(3, 5, c(P.dirt[4]));
  p.set(5, 6, c(P.dirt[2]));
  p.set(4, 7, c(P.dirt[2]));
  const fl = [
    [4, 2, 6],
    [3, 2, 5],
    [4, 1, 6],
    [5, 2, 5],
  ][frame];
  p.set(fl[0], fl[1], FIRE[fl[2]]);
  p.set(4, 3, FIRE[5]);
  p.set(fl[0] + (frame % 2 ? -1 : 1), fl[1] + 1, FIRE[4]);
  p.set(fl[0], fl[1] - 1, FIRE[3]);
  p.outline(c(P.outline[0]));
}

// ───────────────────────────── Lights ─────────────────────────────

export const LIGHT_RADII = [6, 10, 16, 24, 32, 48, 64, 96, 128];

/** Banded, ordered-dithered radial falloff (classic pixel-art lighting). White, alpha = intensity. */
function drawLight(p: PixelCanvas, r: number): void {
  const cx = p.w / 2;
  const cy = p.h / 2;
  const bands = r < 12 ? 4 : 6;
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      // light pools are iso-flattened slightly (ground plane) but kept mostly round
      const dx = (x + 0.5 - cx) / r;
      const dy = (y + 0.5 - cy) / (r * 0.82);
      const dd = Math.sqrt(dx * dx + dy * dy);
      if (dd >= 1) continue;
      const v = Math.pow(1 - dd, 1.35);
      const q = v * bands;
      const b = Math.floor(q);
      const lvl = Math.min(bands, b + (bayer(x, y) < q - b ? 1 : 0));
      if (lvl <= 0) continue;
      p.set(x, y, 0xffffff, lvl / bands);
    }
}

// ───────────────────────────── Registration ─────────────────────────────

export function generateFxTextures(gen: TextureGen): void {
  // puffs
  const nFrames = PUFF_TONES * PUFF_VARIANTS * PUFF_DISSOLVE * PUFF_SMALL_N;
  gen.sheet('fx/puff-s', 20, 20, nFrames, (p, f) => {
    const ri = f % PUFF_SMALL_N;
    const rest = Math.floor(f / PUFF_SMALL_N);
    const dis = rest % PUFF_DISSOLVE;
    const variant = Math.floor(rest / PUFF_DISSOLVE) % PUFF_VARIANTS;
    const tone = Math.floor(rest / (PUFF_DISSOLVE * PUFF_VARIANTS));
    drawPuff(p, 20, PUFF_R[ri], tone, variant, dis);
  });
  gen.sheet('fx/puff-l', 48, 48, nFrames, (p, f) => {
    const ri = f % PUFF_SMALL_N;
    const rest = Math.floor(f / PUFF_SMALL_N);
    const dis = rest % PUFF_DISSOLVE;
    const variant = Math.floor(rest / PUFF_DISSOLVE) % PUFF_VARIANTS;
    const tone = Math.floor(rest / (PUFF_DISSOLVE * PUFF_VARIANTS));
    drawPuff(p, 48, PUFF_R[PUFF_SMALL_N + ri], tone, variant, dis);
  });

  // flames
  FLAME_SIZES.forEach((s, i) => gen.sheet(s.key, s.w, s.h, FLAME_FRAMES, (p, f) => drawFlame(p, s.w, s.h, f, 11 + i * 5)));

  // embers / sparks (frame 0 brightest)
  gen.sheet('fx/ember', 2, 2, 4, (p, f) => {
    // 0: hot streak, then cooling single pixels
    if (f === 0) {
      p.set(0, 0, FIRE[6]);
      p.set(0, 1, FIRE[4]);
    } else p.set(0, 0, FIRE[[0, 5, 4, 3][f]]);
  });
  gen.sheet('fx/spark', 3, 3, 4, (p, f) => {
    if (f === 0) {
      p.set(1, 1, FIRE[7]);
      p.set(0, 1, FIRE[6]);
      p.set(2, 1, FIRE[6]);
      p.set(1, 0, FIRE[6]);
      p.set(1, 2, FIRE[6]);
    } else p.set(1, 1, FIRE[[0, 7, 6, 5][f]]);
  });
  gen.sheet('fx/sparkle', 7, 7, 4, (p, f) => {
    const g = P.gold.map(c);
    const L = [1, 2, 3, 2][f];
    p.set(3, 3, g[6]);
    for (let k = 1; k <= L; k++) {
      const col = k === L ? g[4] : g[5];
      p.set(3 + k, 3, col);
      p.set(3 - k, 3, col);
      p.set(3, 3 + k, col);
      p.set(3, 3 - k, col);
    }
    if (f === 2) {
      p.set(2, 2, g[5]);
      p.set(4, 4, g[5]);
      p.set(2, 4, g[5]);
      p.set(4, 2, g[5]);
    }
  });

  // debris
  gen.sheet('fx/debris', 10, 10, 48, (p, f) => drawDebris(p, Math.floor(f / 16), Math.floor(f / 4) % 4, f % 4));

  // muzzle flashes (16 directions × 4 frames)
  gen.sheet('fx/muzzle', 40, 40, MUZZLE_DIRS * MUZZLE_FRAMES, (p, f) =>
    drawMuzzle(p, 40, Math.floor(f / MUZZLE_FRAMES), f % MUZZLE_FRAMES, 1),
  );
  gen.sheet('fx/muzzle-l', 64, 64, MUZZLE_DIRS * MUZZLE_FRAMES, (p, f) =>
    drawMuzzle(p, 64, Math.floor(f / MUZZLE_FRAMES), f % MUZZLE_FRAMES, 1.75),
  );

  // shockwave rings
  gen.sheet('fx/ring', 64, 32, 8, (p, f) => drawRing(p, 64, 32, f, 8));
  gen.sheet('fx/ring-l', 128, 64, 10, (p, f) => drawRing(p, 128, 64, f, 10));

  // water
  gen.sheet('fx/splash', 16, 32, 8, (p, f) => drawSplash(p, 16, 32, f, 8));
  gen.sheet('fx/splash-l', 26, 52, 9, (p, f) => drawSplash(p, 26, 52, f, 9));
  gen.sheet('fx/drop', 2, 2, 3, (p, f) => {
    if (f === 0) {
      p.set(0, 0, WATER[9]);
      p.set(1, 0, WATER[8]);
      p.set(0, 1, WATER[8]);
      p.set(1, 1, WATER[7]);
    } else p.set(0, 0, WATER[f === 1 ? 8 : 7]);
  });

  // projectiles
  gen.sheet('fx/gulle', 7, 7, 4, (p, f) => drawBall(p, 7, 2.6, f));
  gen.sheet('fx/buyuk-gulle', 13, 13, 4, (p, f) => drawBall(p, 13, 5.2, f));
  gen.sheet('fx/ok', 13, 13, ARROW_DIRS, (p, f) => drawArrow(p, 13, f));
  gen.sheet('fx/ates', 9, 9, 4, (p, f) => drawFirePot(p, f));
  gen.canvas('fx/kursun', 3, 3, (p) => {
    p.set(1, 1, c(P.steel[2]));
    p.set(0, 1, c(P.steel[1]));
    p.set(1, 0, c(P.steel[4]));
  });
  gen.sheet('fx/shadow', 16, 8, 3, (p, f) => {
    const rx = [2, 4, 7][f];
    const ry = Math.max(1, rx / 2);
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 16; x++) {
        const dx = (x + 0.5 - 8) / (rx + 0.5);
        const dy = (y + 0.5 - 4) / (ry + 0.5);
        const e = dx * dx + dy * dy;
        if (e > 1) continue;
        if (e > 0.55 && bayer(x, y) < 0.5) continue;
        p.set(x, y, c(P.outline[0]));
      }
  });
  gen.sheet('fx/scorch', 28, 14, 3, (p, f) => {
    for (let y = 0; y < 14; y++)
      for (let x = 0; x < 28; x++) {
        const dx = (x + 0.5 - 14) / 13;
        const dy = (y + 0.5 - 7) / 6.5;
        const n = valueNoise(x / 3, y / 3, 64, 40 + f);
        const e = Math.sqrt(dx * dx + dy * dy) + (n - 0.5) * 0.5;
        if (e > 1) continue;
        const dens = 1 - e;
        const bx = bayer(x, y);
        if (bx > dens * 1.6) continue;
        p.set(x, y, dens > 0.55 ? c(P.outline[0]) : dens > 0.3 ? c(P.dirt[0]) : c(P.dirt[1]));
      }
  });

  // light falloffs (lightmap + additive glow)
  for (const r of LIGHT_RADII) gen.canvas(`fx/light-${r}`, r * 2 + 2, r * 2 + 2, (p) => drawLight(p, r));
}
