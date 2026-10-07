import { P, rgb } from '../../art/palette';
import { PixelCanvas, bayer } from '../../art/pixel';

/**
 * A tiny pure software renderer for isometric architecture (no Phaser).
 *
 * Structures are analytic primitives over the tile plane, each giving the height
 * (absolute, in art pixels) of its top surface at a tile point. Rendering walks
 * every screen column front-to-back (pixel exact, no gaps), so arbitrary-angle
 * walls, round towers, cones and domes come out crisp and correctly lit:
 *
 *   world/screen:  X = px0 + (tx − ty)·16,  Y = py0 + (tx + ty)·8 − z
 *
 * Light comes from the upper-left (screen), i.e. from the west and above: left
 * (+ty) faces are lit, right (+tx) faces shaded, tops brightest; cast shadows fall
 * to the right/lower-right. Prims are owned by "pieces" — rendering a piece draws
 * only its own prims but every prim occludes, so pieces tile seamlessly.
 */

// light (toward the light) in (tx, ty, z) with z in "tile-equivalent" units
export const LX = -0.617;
export const LY = 0.072;
export const LZ = 0.78;
const VX = 0.45;
const VY = 0.45;
const VZ = 0.77;
/** Horizontal direction shadows fall toward (unit, tile space). */
export const SHX = 0.993;
export const SHY = -0.116;
/** Tiles of shadow per pixel of height. */
export const SHADOW_K = 0.04;
/** Pixels per tile used to convert horizontal slopes for normals. */
export const HPX = 20;

export const AMB = 0.3;
export const DIF = 0.62;
export const FILL = 0.16;

/** Light intensity 0..~1 for a unit normal; sh = 1 lit, 0 in cast shadow. */
export function lightI(nx: number, ny: number, nz: number, sh: number): number {
  const d = nx * LX + ny * LY + nz * LZ;
  const f = nx * VX + ny * VY + nz * VZ;
  return AMB + (d > 0 ? d * DIF * sh : 0) + (f > 0 ? f * FILL : 0);
}

// ───────────────────────────── palette helpers ─────────────────────────────

const rampCache = new Map<readonly string[], number[]>();
/** Palette ramp as packed 0xRRGGBB numbers (cached). */
export function R(ramp: readonly string[]): number[] {
  let r = rampCache.get(ramp);
  if (!r) {
    r = ramp.map((c) => {
      const [a, b, d] = rgb(c);
      return (a << 16) | (b << 8) | d;
    });
    rampCache.set(ramp, r);
  }
  return r;
}

/** Pick a ramp color for a float index with ordered dithering in the middle of each step. */
export function pick(ramp: number[], idx: number, x: number, y: number, dither = 0.5): number {
  const n = ramp.length - 1;
  if (idx <= 0) return ramp[0];
  if (idx >= n) return ramp[n];
  const i = Math.floor(idx);
  const f = idx - i;
  const lo = 0.5 - dither / 2;
  const hi = 0.5 + dither / 2;
  if (f < lo) return ramp[i];
  if (f > hi) return ramp[i + 1];
  return bayer(x & 1023, y & 1023) < (f - lo) / (hi - lo || 1) ? ramp[i + 1] : ramp[i];
}

/** Blend two packed colors (t = 0 → a). */
export function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const r = ar + (((b >> 16) & 255) - ar) * t;
  const g = ag + (((b >> 8) & 255) - ag) * t;
  const bb = ab + ((b & 255) - ab) * t;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bb);
}

export const OUTLINE = R(P.outline);
export const NIGHT = R(P.night);

// ───────────────────────────── primitives ─────────────────────────────

export interface ShadeIn {
  tx: number;
  ty: number;
  /** absolute z of the 3D point under this pixel */
  z: number;
  /** top height of the sample */
  H: number;
  /** ground z at the sample */
  g: number;
  /** first pixel of the sample (top surface) */
  top: boolean;
  /** 1 lit … 0 in cast shadow */
  sh: number;
  x: number;
  y: number;
}

export interface Prim {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** max absolute z */
  zTop: number;
  /** owner id (piece) */
  owner: number;
  /** Absolute top z at (tx,ty) or NONE. */
  h(tx: number, ty: number): number;
  /** Packed color for the pixel, or −1 to leave it transparent. */
  shade(p: ShadeIn): number;
  /** Optional see-through holes (arches): true = no material at this 3D point. */
  cut?(tx: number, ty: number, z: number): boolean;
  /** Does not cast shadows (ground-level decals, smoke…) */
  noShadow?: boolean;
}

export const NONE = -1e9;

export class Scene {
  prims: Prim[] = [];
  private cells: Prim[][] = [];
  private cx0 = 0;
  private cy0 = 0;
  private cw = 0;
  private ch = 0;
  private built = false;
  // shadow-height cache
  private shRes = 8;
  private shX0 = 0;
  private shY0 = 0;
  private shW = 0;
  private shH = 0;
  private shCache: Float32Array | null = null;
  /** max z of all prims */
  zMax = 0;

  add(p: Prim): Prim {
    this.prims.push(p);
    this.built = false;
    return p;
  }

  ensureBuilt(): void {
    if (!this.built) this.build();
  }

  build(): void {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    this.zMax = 0;
    for (const p of this.prims) {
      x0 = Math.min(x0, p.x0);
      y0 = Math.min(y0, p.y0);
      x1 = Math.max(x1, p.x1);
      y1 = Math.max(y1, p.y1);
      this.zMax = Math.max(this.zMax, p.zTop);
    }
    if (!isFinite(x0)) {
      x0 = y0 = 0;
      x1 = y1 = 1;
    }
    this.cx0 = Math.floor(x0) - 1;
    this.cy0 = Math.floor(y0) - 1;
    this.cw = Math.ceil(x1) - this.cx0 + 2;
    this.ch = Math.ceil(y1) - this.cy0 + 2;
    this.cells = new Array(this.cw * this.ch);
    for (let i = 0; i < this.cells.length; i++) this.cells[i] = [];
    for (const p of this.prims) {
      for (let y = Math.floor(p.y0); y <= Math.floor(p.y1); y++)
        for (let x = Math.floor(p.x0); x <= Math.floor(p.x1); x++) {
          const i = (y - this.cy0) * this.cw + (x - this.cx0);
          if (i >= 0 && i < this.cells.length) this.cells[i].push(p);
        }
    }
    // shadow cache covers the scene bbox + shadow reach
    const reach = this.zMax * SHADOW_K + 1;
    this.shX0 = this.cx0 - 1;
    this.shY0 = this.cy0 - Math.ceil(reach) - 1;
    this.shW = (this.cw + Math.ceil(reach) + 3) * this.shRes;
    this.shH = (this.ch + Math.ceil(reach) * 2 + 3) * this.shRes;
    this.shCache = null;
    this.built = true;
  }

  /** Field lookup: highest prim at (tx,ty). */
  field(tx: number, ty: number, out: { h: number; p: Prim | null }, castersOnly = false): void {
    out.h = NONE;
    out.p = null;
    const x = Math.floor(tx) - this.cx0;
    const y = Math.floor(ty) - this.cy0;
    if (x < 0 || y < 0 || x >= this.cw || y >= this.ch) return;
    const list = this.cells[y * this.cw + x];
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (castersOnly && p.noShadow) continue;
      if (tx < p.x0 || tx > p.x1 || ty < p.y0 || ty > p.y1) continue;
      const h = p.h(tx, ty);
      if (h > out.h) {
        out.h = h;
        out.p = p;
      }
    }
  }

  private tmp = { h: 0, p: null as Prim | null };

  /** Height of the "shadow ceiling" above (tx,ty): points below it are in cast shadow. */
  shadowCeil(tx: number, ty: number): number {
    if (!this.built) this.build();
    const res = this.shRes;
    const ix = Math.floor((tx - this.shX0) * res);
    const iy = Math.floor((ty - this.shY0) * res);
    if (ix < 0 || iy < 0 || ix >= this.shW || iy >= this.shH) return this.computeCeil(tx, ty);
    if (!this.shCache) {
      this.shCache = new Float32Array(this.shW * this.shH);
      this.shCache.fill(NaN);
    }
    const k = iy * this.shW + ix;
    let v = this.shCache[k];
    if (v !== v) {
      v = this.computeCeil(this.shX0 + (ix + 0.5) / res, this.shY0 + (iy + 0.5) / res);
      this.shCache[k] = v;
    }
    return v;
  }

  private computeCeil(tx: number, ty: number): number {
    const step = 1 / 8;
    const dz = step / SHADOW_K;
    const n = Math.ceil((this.zMax * SHADOW_K) / step) + 1;
    let best = NONE;
    const t = this.tmp;
    for (let k = 1; k <= n; k++) {
      this.field(tx - SHX * step * k, ty - SHY * step * k, t, true);
      if (t.p) {
        const c = t.h - k * dz;
        if (c > best) best = c;
      }
    }
    return best;
  }
}

export interface RenderOpts {
  w: number;
  h: number;
  /** canvas coordinates of the projection origin */
  px0: number;
  py0: number;
  own(p: Prim): boolean;
  /** absolute ground z (px) at a tile point */
  ground(tx: number, ty: number): number;
  /** draw cast shadows on ground points for which this returns true */
  groundShadow?(tx: number, ty: number): boolean;
  shadowAlpha?: number;
  /** extra pixels the faces extend below the local ground */
  skirt?: number;
  /** selective outline / rim light pass */
  edges?: boolean;
}

export interface RenderOut {
  canvas: PixelCanvas;
  /** 1 where an own structure pixel was drawn */
  mask: Uint8Array;
  /** 1 where ANY geometry covers the pixel */
  any: Uint8Array;
}

const SHADOW_COL = 0x1a2348;

export function renderScene(scene: Scene, o: RenderOpts, canvas?: PixelCanvas): RenderOut {
  scene.ensureBuilt();
  const W = o.w;
  const H = o.h;
  const cv = canvas ?? new PixelCanvas(W, H);
  if (canvas) cv.clear();
  const mask = new Uint8Array(W * H);
  const any = new Uint8Array(W * H);
  const filled = new Uint8Array(H);
  const f = { h: 0, p: null as Prim | null };
  const skirt = o.skirt ?? 2;
  // geometry that can reach this canvas (tight z range + per-column s intervals)
  let zTop = 0;
  const cand: Prim[] = [];
  for (const p of scene.prims) {
    const l = (p.x0 - p.y1) * 16 + o.px0;
    const r = (p.x1 - p.y0) * 16 + o.px0;
    if (r < -1 || l > W + 1) continue;
    const t = (p.x0 + p.y0) * 8 + o.py0 - p.zTop;
    const b = (p.x1 + p.y1) * 8 + o.py0 + 24;
    if (b < -1 || t > H + 1) continue;
    if (p.zTop > zTop) zTop = p.zTop;
    cand.push(p);
  }
  const sin: ShadeIn = { tx: 0, ty: 0, z: 0, H: 0, g: 0, top: false, sh: 1, x: 0, y: 0 };
  const data = cv.data;
  for (let c = 0; c < W; c++) {
    const X = c + 0.5;
    const d = (X - o.px0) / 16;
    filled.fill(0);
    let nFilled = 0;
    let sHi = (H - o.py0 + zTop + 8) / 8;
    let sLo = (-o.py0 - 12) / 8;
    // clip to the s-range where any candidate prim crosses this column (tx − ty = d)
    let cMin = Infinity;
    let cMax = -Infinity;
    for (let i = 0; i < cand.length; i++) {
      const p = cand[i];
      if (d < p.x0 - p.y1 || d > p.x1 - p.y0) continue;
      const a = Math.max(2 * p.x0 - d, 2 * p.y0 + d);
      const b = Math.min(2 * p.x1 - d, 2 * p.y1 + d);
      if (a < cMin) cMin = a;
      if (b > cMax) cMax = b;
    }
    if (cMax < cMin) continue;
    if (cMax + 0.25 < sHi) sHi = cMax + 0.25;
    if (cMin - 0.25 > sLo) sLo = cMin - 0.25;
    // align s so that 8s is integral (1 sample per pixel row)
    let s = Math.ceil(sHi * 8) / 8;
    for (; s >= sLo && nFilled < H; s -= 0.125) {
      const tx = (s + d) / 2;
      const ty = (s - d) / 2;
      scene.field(tx, ty, f);
      const p = f.p;
      if (!p) continue;
      const Ht = f.h;
      const yTop = o.py0 + 8 * s - Ht;
      if (yTop >= H) continue;
      const g = o.ground(tx, ty);
      const yBot = o.py0 + 8 * s - g + skirt;
      if (yBot < 0) continue;
      const r0 = Math.max(0, Math.floor(yTop));
      const r1 = Math.min(H - 1, Math.floor(yBot));
      const own = o.own(p);
      for (let r = r0; r <= r1; r++) {
        if (filled[r]) continue;
        let z = o.py0 + 8 * s - (r + 0.5);
        if (z > Ht) z = Ht;
        if (p.cut && p.cut(tx, ty, z)) continue;
        filled[r] = 1;
        nFilled++;
        const k = r * W + c;
        any[k] = 1;
        if (!own) continue;
        sin.tx = tx;
        sin.ty = ty;
        sin.z = z;
        sin.H = Ht;
        sin.g = g;
        sin.top = r === r0 && yTop >= 0;
        const ceil = scene.shadowCeil(tx, ty);
        const dz = ceil - z;
        sin.sh = dz <= 0 ? 1 : dz > 1.5 ? 0 : bayer(c, r) < dz / 1.5 ? 0 : 1;
        sin.x = c;
        sin.y = r;
        const col = p.shade(sin);
        if (col < 0) {
          any[k] = 0;
          filled[r] = 0;
          nFilled--;
          continue;
        }
        const i4 = k * 4;
        data[i4] = (col >> 16) & 255;
        data[i4 + 1] = (col >> 8) & 255;
        data[i4 + 2] = col & 255;
        data[i4 + 3] = 255;
        mask[k] = 1;
      }
    }
  }

  // ground shadows
  if (o.groundShadow) {
    const a = o.shadowAlpha ?? 0.4;
    // typical ground height of this canvas (centre sample)
    const dC = (W / 2 - o.px0) / 16;
    const sC = (H / 2 - o.py0) / 8;
    const gGuess = o.ground((sC + dC) / 2, (sC - dC) / 2);
    for (let r = 0; r < H; r++)
      for (let c = 0; c < W; c++) {
        const k = r * W + c;
        if (any[k]) continue;
        const X = c + 0.5;
        const Y = r + 0.5;
        const d = (X - o.px0) / 16;
        let s = (Y - o.py0 + gGuess) / 8;
        // quick reject: no caster can shade this ground point
        const c0 = scene.shadowCeil((s + d) / 2, (s - d) / 2);
        if (c0 < gGuess - 10) continue;
        let g = 0;
        for (let it = 0; it < 2; it++) {
          g = o.ground((s + d) / 2, (s - d) / 2);
          s = (Y - o.py0 + g) / 8;
        }
        const tx = (s + d) / 2;
        const ty = (s - d) / 2;
        const ceil = scene.shadowCeil(tx, ty);
        const dz = ceil - g;
        if (dz <= 0) continue;
        if (!o.groundShadow(tx, ty)) continue;
        // soft dithered rim on the last pixels of the shadow
        if (dz < 2.2 && bayer(c, r) > dz / 2.2) continue;
        cv.set(c, r, SHADOW_COL, a);
      }
  }

  if (o.edges !== false) edgePass(cv, mask, any, W, H);
  return { canvas: cv, mask, any };
}

/** Rim light on upper/left silhouette edges, darker selective outline on lower/right edges. */
function edgePass(cv: PixelCanvas, mask: Uint8Array, any: Uint8Array, W: number, H: number): void {
  const d = cv.data;
  const em = (x: number, y: number) => x < 0 || y < 0 || x >= W || y >= H || !any[y * W + x];
  const ops: number[] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const k = y * W + x;
      if (!mask[k]) continue;
      const up = em(x, y - 1);
      const left = em(x - 1, y);
      const down = em(x, y + 1);
      const right = em(x + 1, y);
      if (down || right) ops.push(k, 0);
      else if (up || left) ops.push(k, 1);
    }
  for (let i = 0; i < ops.length; i += 2) {
    const k = ops[i] * 4;
    const col = (d[k] << 16) | (d[k + 1] << 8) | d[k + 2];
    const out = ops[i + 1] === 0 ? mix(col, OUTLINE[1], 0.45) : mix(col, 0xfff1d6, 0.22);
    d[k] = (out >> 16) & 255;
    d[k + 1] = (out >> 8) & 255;
    d[k + 2] = out & 255;
  }
}

/** Projected screen bbox (relative to projection origin) of a tile-rect with heights. */
export function projBounds(x0: number, y0: number, x1: number, y1: number, zLo: number, zHi: number): { l: number; t: number; r: number; b: number } {
  const xs = [x0, x1];
  const ys = [y0, y1];
  let l = Infinity;
  let t = Infinity;
  let r = -Infinity;
  let b = -Infinity;
  for (const x of xs)
    for (const y of ys) {
      const X = (x - y) * 16;
      const Y = (x + y) * 8;
      l = Math.min(l, X);
      r = Math.max(r, X);
      t = Math.min(t, Y - zHi);
      b = Math.max(b, Y - zLo);
    }
  return { l, t, r, b };
}
