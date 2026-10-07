/**
 * Deterministic, allocation-free noise helpers for the world feature (pure, no Phaser).
 * All functions are stable across runs so terrain, decor and baked chunks always agree.
 */

/** Integer hash → [0,1). */
export function ihash(x: number, y: number, seed = 0): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Smooth value noise in [0,1). */
export function vnoise(x: number, y: number, seed = 0): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  const a = ihash(x0, y0, seed);
  const b = ihash(x0 + 1, y0, seed);
  const c = ihash(x0, y0 + 1, seed);
  const d = ihash(x0 + 1, y0 + 1, seed);
  const ab = a + (b - a) * fx;
  const cd = c + (d - c) * fx;
  return ab + (cd - ab) * fy;
}

/** Fractal value noise in [0,1). */
export function fbm(x: number, y: number, octaves = 3, seed = 0): number {
  let amp = 0.5;
  let sum = 0;
  let norm = 0;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += vnoise(x * f, y * f, seed + i * 31) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Distance from point p to segment ab (all in the same 2D space). */
export function distSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + dx * t - px;
  const qy = ay + dy * t - py;
  return Math.sqrt(qx * qx + qy * qy);
}

/** Chaikin corner-cutting for smooth, natural-looking polylines. */
export function chaikin(pts: { tx: number; ty: number }[], iterations = 2): { tx: number; ty: number }[] {
  let p = pts;
  for (let it = 0; it < iterations; it++) {
    if (p.length < 3) return p;
    const out: { tx: number; ty: number }[] = [p[0]];
    for (let i = 0; i + 1 < p.length; i++) {
      const a = p[i];
      const b = p[i + 1];
      out.push({ tx: a.tx * 0.75 + b.tx * 0.25, ty: a.ty * 0.75 + b.ty * 0.25 });
      out.push({ tx: a.tx * 0.25 + b.tx * 0.75, ty: a.ty * 0.25 + b.ty * 0.75 });
    }
    out.push(p[p.length - 1]);
    p = out;
  }
  return p;
}
