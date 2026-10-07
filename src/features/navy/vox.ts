import { bayer, PixelCanvas } from '../../art/pixel';

/**
 * Tiny voxel pre-renderer for the navy's pixel art (pure; no Phaser).
 *
 * Models are built in LOCAL voxel space: +x = bow (forward), +y = starboard,
 * +z = up, z = 0 = waterline. They are rotated by a heading (TILE-space
 * radians, 0 = +tx) and projected with the game's 2:1 isometric projection
 * (1 voxel along tx → (+1, +0.5) px, along ty → (−1, +0.5) px, z → −1 px),
 * z-buffered, lit from the upper-left (left faces lit, right faces shaded,
 * tops brightest), ramp-quantized with ordered dithering, and finished with
 * rim highlights, depth contours and a selective outline. The result is
 * consistent pixel art for every heading — no runtime rotation or scaling.
 */

export interface Mat {
  ramp: readonly string[];
  /** Ramp index range used for shading. */
  lo: number;
  hi: number;
  /** Fixed color (no shading), e.g. lanterns. */
  emissive?: boolean;
  /** No outer outline around this material (thin lines, sails' inner edges). */
  noOutline?: boolean;
  /** Skip the top rim highlight. */
  noRim?: boolean;
  /** Ordered-dither strength 0..1 (default 0.4: dither only near band edges; 0 = clean bands). */
  dither?: number;
}

export interface Voxel {
  x: number;
  y: number;
  z: number;
  m: number;
  nx: number;
  ny: number;
  nz: number;
  /** Two-sided thin surface (normal flips toward the viewer). */
  ts?: boolean;
}

export interface Line3 {
  a: [number, number, number];
  b: [number, number, number];
  m: number;
  /** Fixed shade 0..1 (default 0.45). */
  shade?: number;
}

export interface RenderOpts {
  heading: number;
  /** Roll about the ship's length axis (radians, + = starboard down). */
  roll?: number;
  /** Pitch (radians, + = bow up). */
  pitch?: number;
  /** Lower the model by this many voxels (sinking). */
  sink?: number;
  /** Clip everything below this z after transforms (waterline). null = no clip. */
  clipZ?: number | null;
  /** Projection scale (1 = one voxel per tile-pixel unit). */
  scale?: number;
  /** Darken near-waterline voxels (wet hull). */
  wetLine?: boolean;
  /** Outline color override (default: darkest ramp entry of the neighbor material). */
  outline?: string | null;
}

/** Direction TOWARD the light in tile space (tx, ty, z): upper-left of the screen. */
const L = (() => {
  const v = [-0.62, 0.48, 1.0];
  const m = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / m, v[1] / m, v[2] / m];
})();

// ───────────────────────────── builder ─────────────────────────────

const MAT_SMOOTH_SAME = false;

export class VoxBuilder {
  private map = new Map<number, number>();
  /** Voxels with explicit normals (thin surfaces like sails and flags). */
  private explicit: Voxel[] = [];

  private static key(x: number, y: number, z: number): number {
    return ((x + 512) << 20) | ((y + 512) << 10) | (z + 512);
  }

  set(x: number, y: number, z: number, m: number): void {
    this.map.set(VoxBuilder.key(Math.round(x), Math.round(y), Math.round(z)), m);
  }

  del(x: number, y: number, z: number): void {
    this.map.delete(VoxBuilder.key(Math.round(x), Math.round(y), Math.round(z)));
  }

  get(x: number, y: number, z: number): number | undefined {
    return this.map.get(VoxBuilder.key(Math.round(x), Math.round(y), Math.round(z)));
  }

  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, m: number): void {
    for (let x = Math.round(x0); x <= Math.round(x1); x++)
      for (let y = Math.round(y0); y <= Math.round(y1); y++) for (let z = Math.round(z0); z <= Math.round(z1); z++) this.set(x, y, z, m);
  }

  /** A thin surface voxel with a given normal (not part of the occupancy grid). */
  surf(x: number, y: number, z: number, m: number, nx: number, ny: number, nz: number): void {
    const l = Math.hypot(nx, ny, nz) || 1;
    this.explicit.push({ x, y, z, m, nx: nx / l, ny: ny / l, nz: nz / l, ts: true });
  }

  /** Cylinder along an axis from p0 to p1 with radius r. */
  cylinder(p0: [number, number, number], p1: [number, number, number], r: number, m: number, capM = m): void {
    const dx = p1[0] - p0[0];
    const dy = p1[1] - p0[1];
    const dz = p1[2] - p0[2];
    const len = Math.hypot(dx, dy, dz) || 1;
    const steps = Math.ceil(len * 2);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const cx = p0[0] + dx * t;
      const cy = p0[1] + dy * t;
      const cz = p0[2] + dz * t;
      const ri = Math.ceil(r);
      for (let a = -ri; a <= ri; a++)
        for (let b = -ri; b <= ri; b++)
          for (let c = -ri; c <= ri; c++) {
            if (a * a + b * b + c * c > r * r + 0.3) continue;
            // only spread perpendicular to the axis
            const dot = (a * dx + b * dy + c * dz) / len;
            if (Math.abs(dot) > 0.6) continue;
            this.set(cx + a, cy + b, cz + c, i === 0 || i === steps ? capM : m);
          }
    }
  }

  /** Bake into a voxel list with occupancy-gradient normals (surface voxels only). */
  build(): Voxel[] {
    const out: Voxel[] = [];
    const has = (x: number, y: number, z: number) => this.map.has(VoxBuilder.key(x, y, z));
    for (const [k, m] of this.map) {
      const x = ((k >> 20) & 1023) - 512;
      const y = ((k >> 10) & 1023) - 512;
      const z = (k & 1023) - 512;
      let exposed = false;
      let nx = 0;
      let ny = 0;
      let nz = 0;
      for (let a = -1; a <= 1; a++)
        for (let b = -1; b <= 1; b++)
          for (let c = -1; c <= 1; c++) {
            if (!a && !b && !c) continue;
            if (has(x + a, y + b, z + c)) continue;
            const w = Math.abs(a) + Math.abs(b) + Math.abs(c) === 1 ? 1 : Math.abs(a) + Math.abs(b) + Math.abs(c) === 2 ? 0.55 : 0.35;
            if (Math.abs(a) + Math.abs(b) + Math.abs(c) === 1) exposed = true;
            nx += a * w;
            ny += b * w;
            nz += c * w;
          }
      if (!exposed) continue;
      const l = Math.hypot(nx, ny, nz) || 1;
      out.push({ x, y, z, m, nx: nx / l, ny: ny / l, nz: nz / l });
    }
    // smooth normals over neighbouring surface voxels (less speckle on curved hulls)
    const idx = new Map<number, number>();
    out.forEach((v, i) => idx.set(VoxBuilder.key(v.x, v.y, v.z), i));
    const sm = out.map((v) => {
      let sx = v.nx * 2;
      let sy = v.ny * 2;
      let sz = v.nz * 2;
      for (let a = -1; a <= 1; a++)
        for (let b = -1; b <= 1; b++)
          for (let c = -1; c <= 1; c++) {
            if (!a && !b && !c) continue;
            const j = idx.get(VoxBuilder.key(v.x + a, v.y + b, v.z + c));
            if (j === undefined) continue;
            const w = out[j];
            if (w.m !== v.m && MAT_SMOOTH_SAME) continue;
            sx += w.nx;
            sy += w.ny;
            sz += w.nz;
          }
      const l = Math.hypot(sx, sy, sz) || 1;
      return { ...v, nx: sx / l, ny: sy / l, nz: sz / l };
    });
    return sm.concat(this.explicit);
  }
}

// ───────────────────────────── renderer ─────────────────────────────

export interface Projector {
  /** Local voxel point → frame pixel (float) and depth. */
  project(x: number, y: number, z: number): { px: number; py: number; d: number; z: number };
}

export function makeProjector(ox: number, oy: number, o: RenderOpts): Projector {
  const ch = Math.cos(o.heading);
  const sh = Math.sin(o.heading);
  const cr = Math.cos(o.roll ?? 0);
  const sr = Math.sin(o.roll ?? 0);
  const cp = Math.cos(o.pitch ?? 0);
  const sp = Math.sin(o.pitch ?? 0);
  const sink = o.sink ?? 0;
  const k = o.scale ?? 1;
  return {
    project(x: number, y: number, z: number) {
      // roll about x
      const y1 = y * cr - z * sr;
      const z1 = y * sr + z * cr;
      // pitch about y (bow up for +pitch)
      const x2 = x * cp - z1 * sp;
      const z2 = x * sp + z1 * cp - sink;
      const tx = x2 * ch - y1 * sh;
      const ty = x2 * sh + y1 * ch;
      return { px: ox + (tx - ty) * k, py: oy + (tx + ty) * 0.5 * k - z2 * k, d: tx + ty + z2, z: z2 };
    },
  };
}

function rotN(nx: number, ny: number, nz: number, o: RenderOpts): [number, number, number] {
  const cr = Math.cos(o.roll ?? 0);
  const sr = Math.sin(o.roll ?? 0);
  const cp = Math.cos(o.pitch ?? 0);
  const sp = Math.sin(o.pitch ?? 0);
  const ny1 = ny * cr - nz * sr;
  const nz1 = ny * sr + nz * cr;
  const nx2 = nx * cp - nz1 * sp;
  const nz2 = nx * sp + nz1 * cp;
  const ch = Math.cos(o.heading);
  const sh = Math.sin(o.heading);
  return [nx2 * ch - ny1 * sh, nx2 * sh + ny1 * ch, nz2];
}

/** Projected pixel bounds of a model (for frame sizing). */
export function projectBounds(vox: Voxel[], lines: Line3[], o: RenderOpts): { x0: number; y0: number; x1: number; y1: number } {
  const pr = makeProjector(0, 0, o);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const clip = o.clipZ;
  const add = (x: number, y: number, z: number) => {
    const p = pr.project(x, y, z);
    if (clip != null && p.z < clip) return;
    x0 = Math.min(x0, p.px);
    y0 = Math.min(y0, p.py);
    x1 = Math.max(x1, p.px + 1);
    y1 = Math.max(y1, p.py + 1);
  };
  for (const v of vox) add(v.x, v.y, v.z);
  for (const l of lines) {
    add(l.a[0], l.a[1], l.a[2]);
    add(l.b[0], l.b[1], l.b[2]);
  }
  return { x0, y0, x1, y1 };
}

/**
 * Render voxels + lines into `canvas` with the model origin (0,0,0) at (ox, oy).
 */
export function renderVox(canvas: PixelCanvas, ox: number, oy: number, vox: Voxel[], lines: Line3[], mats: Mat[], o: RenderOpts): void {
  const W = canvas.w;
  const H = canvas.h;
  const N = W * H;
  const depth = new Float32Array(N).fill(-Infinity);
  const mat = new Int16Array(N).fill(-1);
  const shade = new Float32Array(N);
  const isLine = new Uint8Array(N);
  const pr = makeProjector(ox, oy, o);
  const clip = o.clipZ === undefined ? 0 : o.clipZ;
  const k = o.scale ?? 1;
  const splat = k >= 0.9 ? 2 : 1;
  for (const v of vox) {
    const p = pr.project(v.x, v.y, v.z);
    if (clip != null && p.z < clip - 0.01) continue;
    const mt = mats[v.m];
    let s = 0;
    if (!mt.emissive) {
      let [nx, ny, nz] = rotN(v.nx, v.ny, v.nz, o);
      if (v.ts && nx + ny + nz < 0) {
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }
      const dl = nx * L[0] + ny * L[1] + nz * L[2];
      s = 0.2 + 0.8 * Math.max(0, dl) + 0.12 * Math.max(0, nz);
      if (o.wetLine && p.z < 0.9) s -= 0.18;
      s = Math.max(0, Math.min(1, s));
    }
    const bx = Math.floor(p.px - (splat - 1) * 0.5);
    const by = Math.floor(p.py - (splat - 1) * 0.5);
    for (let j = 0; j < splat; j++)
      for (let i = 0; i < splat; i++) {
        const x = bx + i;
        const y = by + j;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const idx = y * W + x;
        if (p.d > depth[idx]) {
          depth[idx] = p.d;
          mat[idx] = v.m;
          shade[idx] = s;
          isLine[idx] = 0;
        }
      }
  }
  for (const l of lines) {
    const a = pr.project(l.a[0], l.a[1], l.a[2]);
    const b = pr.project(l.b[0], l.b[1], l.b[2]);
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(b.px - a.px), Math.abs(b.py - a.py)) * 2));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const zz = a.z + (b.z - a.z) * t;
      if (clip != null && zz < clip - 0.01) continue;
      const x = Math.floor(a.px + (b.px - a.px) * t);
      const y = Math.floor(a.py + (b.py - a.py) * t);
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const d = a.d + (b.d - a.d) * t + 0.6;
      const idx = y * W + x;
      if (d > depth[idx]) {
        depth[idx] = d;
        mat[idx] = l.m;
        shade[idx] = l.shade ?? 0.45;
        isLine[idx] = 1;
      }
    }
  }
  // compose
  const colIdx = new Int16Array(N).fill(-1);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const m = mat[i];
      if (m < 0) continue;
      const mt = mats[m];
      if (mt.emissive) {
        colIdx[i] = mt.hi;
        continue;
      }
      const f = mt.lo + shade[i] * (mt.hi - mt.lo);
      let base = Math.floor(f);
      const fr = f - base;
      const dz = (mt.dither ?? 0.4) * 0.5;
      if (fr >= 0.5 + dz) base++;
      else if (fr > 0.5 - dz && bayer(x, y) < (fr - (0.5 - dz)) / (2 * dz)) base++;
      // rim light on top edges (silhouette against empty or much farther pixels)
      if (!mt.noRim && !isLine[i] && y > 0) {
        const up = i - W;
        if (mat[up] < 0 || depth[up] < depth[i] - 3) base++;
      }
      // contour: darken pixels just behind a nearer surface (below/left/right neighbors much nearer)
      if (!isLine[i]) {
        const nb = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1];
        for (const q of nb) {
          if (q < 0 || mat[q] < 0 || isLine[q]) continue;
          if (depth[q] > depth[i] + 3.2) {
            base -= 1;
            break;
          }
        }
      }
      colIdx[i] = Math.max(0, Math.min(mt.ramp.length - 1, base));
    }
  for (let i = 0; i < N; i++) {
    if (colIdx[i] < 0) continue;
    canvas.set(i % W, (i / W) | 0, mats[mat[i]].ramp[colIdx[i]]);
  }
  // selective outline: dark, hue-tinted by the neighbor's material
  if (o.outline !== null) {
    const marks: [number, number, string][] = [];
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (mat[i] >= 0) continue;
        let src = -1;
        // prefer the pixel above (outline under objects is the strongest)
        const cand = [y > 0 ? i - W : -1, x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y < H - 1 ? i + W : -1];
        for (const q of cand) {
          if (q < 0 || mat[q] < 0 || isLine[q] || mats[mat[q]].noOutline) continue;
          src = q;
          break;
        }
        if (src < 0) continue;
        marks.push([x, y, o.outline ?? mats[mat[src]].ramp[0]]);
      }
    for (const [x, y, c] of marks) canvas.set(x, y, c);
  }
}
