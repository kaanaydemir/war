import { P } from '../../art/palette';
import { bayer, type Color, type PixelCanvas } from '../../art/pixel';

/**
 * Drawing toolkit for economy art (pure: PixelCanvas only, no Phaser).
 * Light comes from the upper-left: left-facing iso faces lit, right faces shaded.
 */
export type Ramp = readonly string[];
export type Shader = (x: number, y: number) => Color | null;

/** Dithered pick from a ramp: t in [0,1] (0 = darkest). */
export function rampAt(r: Ramp, t: number, x: number, y: number): string {
  const n = r.length - 1;
  const v = Math.max(0, Math.min(n, t * n));
  const lo = Math.floor(v);
  const f = v - lo;
  return f > 0 && bayer(x, y) < f ? r[Math.min(n, lo + 1)] : r[lo];
}

/** Clamp-indexed ramp color. */
export function ri(r: Ramp, i: number): string {
  return r[Math.max(0, Math.min(r.length - 1, Math.round(i)))];
}

/** Scanline polygon fill with a per-pixel shader. */
export function polyFn(p: PixelCanvas, pts: [number, number][], fn: Shader, alpha = 1): void {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of pts) {
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
    const xs: number[] = [];
    const yc = y + 0.5;
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 1) % pts.length];
      if ((y0 <= yc && y1 > yc) || (y1 <= yc && y0 > yc)) xs.push(x0 + ((yc - y0) / (y1 - y0)) * (x1 - x0));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.ceil(xs[k] - 0.5); x <= Math.floor(xs[k + 1] - 0.5); x++) {
        const c = fn(x, y);
        if (c != null) p.set(x, y, c, alpha);
      }
    }
  }
}

/** Iso offset of a tile-unit vector (u along +tx, v along +ty) in px. */
export function iso(u: number, v: number): [number, number] {
  return [(u - v) * 16, (u + v) * 8];
}

export interface PrismShaders {
  top: Shader;
  left: Shader;
  right: Shader;
}

/**
 * Iso prism. (ox, oy) = screen position of the footprint's NORTH vertex at ground.
 * a = size along +tx (tiles), b = size along +ty (tiles), h = height in px.
 * Returns the four top corners for further decoration.
 */
export function prism(p: PixelCanvas, ox: number, oy: number, a: number, b: number, h: number, s: PrismShaders) {
  const [ax, ay] = iso(a, 0);
  const [bx, by] = iso(0, b);
  const top: [number, number] = [ox, oy - h];
  const right: [number, number] = [ox + ax, oy + ay - h];
  const bottom: [number, number] = [ox + ax + bx, oy + ay + by - h];
  const left: [number, number] = [ox + bx, oy + by - h];
  polyFn(p, [left, bottom, [bottom[0], bottom[1] + h], [left[0], left[1] + h]], s.left);
  polyFn(p, [bottom, right, [right[0], right[1] + h], [bottom[0], bottom[1] + h]], s.right);
  polyFn(p, [top, right, bottom, left], s.top);
  return { top, right, bottom, left };
}

/** Flat shader from a ramp index. */
export const flat =
  (c: Color): Shader =>
  () =>
    c;

/** Vertical gradient shader for a face whose ground line is at y = gy(x). Darker near the ground (AO). */
export function faceShader(r: Ramp, base: number, opts: { gy?: (x: number) => number; h?: number; ao?: number; tex?: 'masonry' | 'plank' | 'plaster' | 'brickband' | 'none'; mortar?: number; seed?: number } = {}): Shader {
  const tex = opts.tex ?? 'none';
  const gy = opts.gy;
  const h = opts.h ?? 12;
  const ao = opts.ao ?? 0.18;
  const seed = opts.seed ?? 0;
  return (x, y) => {
    const t = gy ? Math.max(0, Math.min(1, (gy(x) - y) / Math.max(1, h))) : 0.5;
    let v = base - ao * (1 - t) * (r.length - 1) * 0.35;
    if (tex === 'masonry' && gy) {
      const ty = Math.floor(gy(x) - y);
      const course = Math.floor(ty / 4);
      if (ty % 4 === 0) v -= 1.1;
      else if ((x + course * 3 + seed) % 7 === 0) v -= 0.9;
      else if (((x * 7 + course * 13 + seed) & 15) === 3) v += 0.6;
    } else if (tex === 'brickband' && gy) {
      const ty = Math.floor(gy(x) - y);
      if (ty % 9 >= 6) return ri(P.brick, 3 + (base > 3 ? 1 : 0) - (ty % 9 === 6 ? 1 : 0));
      if (ty % 3 === 0) v -= 1;
    } else if (tex === 'plank') {
      if ((x & 3) === 0) v -= 1;
      else if (((x * 5 + y * 3 + seed) % 23) === 0) v -= 0.7;
    } else if (tex === 'plaster') {
      if (((x * 13 + y * 7 + seed) % 31) === 0) v -= 0.6;
    }
    return rampAt(r, v / (r.length - 1), x, y);
  };
}

/** Soft cast shadow (dithered) to the lower-right: an iso ellipse. */
export function shadowEllipse(p: PixelCanvas, cx: number, cy: number, rx: number, ry: number, strength = 0.38): void {
  for (let y = -ry; y <= ry; y++)
    for (let x = -rx; x <= rx; x++) {
      const d = (x * x) / (rx * rx + 0.01) + (y * y) / (ry * ry + 0.01);
      if (d > 1) continue;
      const edge = d > 0.6;
      if (edge && bayer(cx + x, cy + y) < 0.5) continue;
      if (p.alphaAt(cx + x, cy + y) > 0) {
        p.set(cx + x, cy + y, P.outline[1], strength * (edge ? 0.7 : 1));
      } else p.set(cx + x, cy + y, P.outline[1], strength * (edge ? 0.7 : 1));
    }
}

/** Iso diamond decal (ground) with a shader. */
export function diamondFn(p: PixelCanvas, cx: number, cy: number, w: number, h: number, fn: Shader, alpha = 1): void {
  const hw = w / 2;
  const hh = h / 2;
  polyFn(p, [[cx, cy - hh], [cx + hw, cy], [cx, cy + hh], [cx - hw, cy]], fn, alpha);
}

/** Irregular ground patch (dirt pad) shaped like an iso blob. */
export function groundPatch(p: PixelCanvas, cx: number, cy: number, rx: number, ry: number, r: Ramp, base: number, seed = 1, alpha = 1): void {
  for (let y = -ry - 1; y <= ry + 1; y++)
    for (let x = -rx - 2; x <= rx + 2; x++) {
      const ang = Math.atan2(y * 2, x);
      const wob = 1 + 0.12 * Math.sin(ang * 3 + seed) + 0.08 * Math.sin(ang * 7 + seed * 2);
      const d = Math.sqrt((x * x) / (rx * rx) + (y * y) / (ry * ry)) / wob;
      if (d > 1) continue;
      if (d > 0.85 && bayer(cx + x, cy + y) < (d - 0.85) / 0.15) continue;
      const n = ((x * 7 + y * 13 + seed * 5) * 2654435761) >>> 0;
      let v = base + (n % 9 === 0 ? 1 : n % 11 === 0 ? -1 : 0);
      if (y < -ry * 0.3 && x < 0) v += 0.4;
      p.set(cx + x, cy + y, rampAt(r, v / (r.length - 1), cx + x, cy + y), alpha);
    }
}

/**
 * Vertical cylinder (tower). (cx, by) = center of the BASE ellipse on screen.
 * rx/ry = ellipse radii, h = height. Light from the left.
 */
export function cylinder(
  p: PixelCanvas,
  cx: number,
  by: number,
  rx: number,
  ry: number,
  h: number,
  r: Ramp,
  opts: { tex?: 'masonry' | 'plank' | 'cloth' | 'none'; base?: number; seed?: number; band?: { y0: number; y1: number; ramp: Ramp; base: number }[] } = {},
): void {
  const base = opts.base ?? r.length * 0.55;
  const n = r.length - 1;
  for (let x = -rx; x <= rx; x++) {
    const u = x / (rx + 0.5);
    const e = Math.sqrt(Math.max(0, 1 - u * u));
    const yb = Math.round(by + ry * e);
    const yt = Math.round(by - h + ry * e);
    // lambert-ish: lit from the left, rim darkening
    const lit = 0.5 - 0.62 * u + 0.12 * e;
    const ang = Math.asin(Math.max(-1, Math.min(1, u)));
    for (let y = yt; y <= yb; y++) {
      const ty = yb - y;
      let v = base + lit * n * 0.55 - (ty < 3 ? 0.6 : 0);
      let ramp = r;
      if (opts.band) {
        for (const b of opts.band)
          if (ty >= b.y0 && ty < b.y1) {
            ramp = b.ramp;
            v = b.base + lit * (b.ramp.length - 1) * 0.5;
          }
      }
      if (opts.tex === 'masonry' && ramp === r) {
        const course = Math.floor(ty / 4);
        const joint = Math.floor(((ang + Math.PI / 2) * rx * 0.55 + course * 1.7 + (opts.seed ?? 0)) % 4.2);
        if (ty % 4 === 0) v -= 1.1;
        else if (joint === 0 && Math.abs(u) < 0.92) v -= 0.8;
      } else if (opts.tex === 'plank' && ramp === r) {
        if (Math.floor((ang + 2) * rx * 0.7) % 3 === 0) v -= 0.8;
      } else if (opts.tex === 'cloth' && ramp === r) {
        if (Math.floor((ang + 2) * rx * 0.45) % 4 === 0) v -= 0.6;
      }
      p.set(cx + x, y, rampAt(ramp, v / (ramp.length - 1), cx + x, y));
    }
  }
}

/** Filled ellipse with shader (top faces). */
export function ellipseFn(p: PixelCanvas, cx: number, cy: number, rx: number, ry: number, fn: Shader): void {
  for (let y = -ry; y <= ry; y++)
    for (let x = -rx; x <= rx; x++)
      if ((x * x) / (rx * rx + 0.3) + (y * y) / (ry * ry + 0.3) <= 1) {
        const c = fn(cx + x, cy + y);
        if (c != null) p.set(cx + x, cy + y, c);
      }
}

/**
 * Cone (conical roof). Apex at (cx, ay); base ellipse center (cx, by), radii rx/ry.
 * Seams (lead sheets / canvas panels) converge toward the apex.
 */
export function cone(
  p: PixelCanvas,
  cx: number,
  ay: number,
  by: number,
  rx: number,
  ry: number,
  r: Ramp,
  opts: { seams?: number; base?: number; stripe?: { ramp: Ramp; every: number; base: number }; bands?: { from: number; to: number; ramp: Ramp; base: number }[] } = {},
): void {
  const n = r.length - 1;
  const base = opts.base ?? n * 0.55;
  const seams = opts.seams ?? 7;
  const H = by - ay;
  for (let y = ay; y <= by + ry; y++) {
    const k = Math.min(1, (y - ay) / Math.max(1, H));
    const hw = rx * k;
    for (let x = Math.floor(-hw - 0.5); x <= Math.ceil(hw + 0.5); x++) {
      let inside: boolean;
      if (y <= by) inside = Math.abs(x) <= hw + 0.25;
      else inside = (x * x) / (rx * rx + 0.3) + ((y - by) * (y - by)) / (ry * ry + 0.3) <= 1;
      if (!inside) continue;
      const u = hw > 0 ? x / (hw + 0.5) : 0;
      const ang = Math.asin(Math.max(-1, Math.min(1, u)));
      let v = base + (0.42 - 0.75 * u) * n * 0.5;
      const seg = Math.floor(((ang + Math.PI / 2) / Math.PI) * seams);
      const segF = ((ang + Math.PI / 2) / Math.PI) * seams - seg;
      let ramp = r;
      if (opts.stripe && seg % opts.stripe.every === 0) {
        ramp = opts.stripe.ramp;
        v = opts.stripe.base + (0.42 - 0.75 * u) * (ramp.length - 1) * 0.45;
      }
      if (opts.bands)
        for (const b of opts.bands)
          if (k >= b.from && k < b.to && y <= by) {
            ramp = b.ramp;
            v = b.base + (0.42 - 0.75 * u) * (ramp.length - 1) * 0.45;
          }
      if (segF < 0.12 && k > 0.2) v -= 0.9;
      if (y > by - 1) v -= 0.5; // eave shadow line
      p.set(cx + x, y, rampAt(ramp, v / (ramp.length - 1), cx + x, y));
    }
  }
}

/** Make an outline-only texture (selection glow) from a canvas. */
export function outlineOnly(src: PixelCanvas, dst: PixelCanvas, color: Color): void {
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++) {
      if (src.alphaAt(x, y) > 250) continue;
      const n =
        src.alphaAt(x - 1, y) > 250 || src.alphaAt(x + 1, y) > 250 || src.alphaAt(x, y - 1) > 250 || src.alphaAt(x, y + 1) > 250;
      if (n) dst.set(x, y, color);
    }
}

/** Snow on every upward-facing edge (winter variants). */
export function snowify(p: PixelCanvas, depth = 2): void {
  const mark: number[] = [];
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      if (p.alphaAt(x, y) < 200) continue;
      let k = 0;
      while (k < depth && p.alphaAt(x, y - 1 - k) >= 200) k++;
      if (k < depth) {
        const [r, g, b] = p.get(x, y);
        const lum = r * 0.3 + g * 0.59 + b * 0.11;
        if (lum < 18) continue; // keep outlines
        mark.push(x, y, k);
      }
    }
  for (let i = 0; i < mark.length; i += 3) {
    const x = mark[i];
    const y = mark[i + 1];
    const k = mark[i + 2];
    p.set(x, y, k === 0 ? P.snow[4] : bayer(x, y) < 0.5 ? P.snow[2] : P.snow[3]);
  }
}

/** Little helpers for people & props. */
export function px(p: PixelCanvas, x: number, y: number, c: Color, a = 1): void {
  p.set(x, y, c, a);
}

export function hline(p: PixelCanvas, x0: number, x1: number, y: number, c: Color): void {
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) p.set(x, y, c);
}

export function vline(p: PixelCanvas, x: number, y0: number, y1: number, c: Color): void {
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) p.set(x, y, c);
}

/** Deterministic hash → [0,1). */
export function h01(a: number, b = 0, c = 0): number {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Stone block (small iso cube) for piles. */
export function stoneBlock(p: PixelCanvas, x: number, y: number, s = 3, r: Ramp = P.limestone): void {
  // top
  p.set(x, y, r[5]);
  p.set(x + 1, y, r[4]);
  for (let i = 0; i < s; i++) {
    p.set(x - 1 + i, y + 1, r[4]);
  }
  for (let j = 0; j < s - 1; j++) {
    p.set(x - 1, y + 2 + j, r[3]);
    p.set(x, y + 2 + j, r[3]);
    p.set(x + 1, y + 2 + j, r[2]);
    if (s > 3) p.set(x + 2, y + 2 + j, r[1]);
  }
}

/** Round stone cannonball (gülle), radius 1–3. */
export function ball(p: PixelCanvas, cx: number, cy: number, rad: number): void {
  const r = P.stone;
  for (let y = -rad; y <= rad; y++)
    for (let x = -rad; x <= rad; x++) {
      const d = x * x + y * y;
      if (d > rad * rad + rad * 0.6) continue;
      const lit = (-x - y) / (rad * 1.6 + 0.01);
      const v = 4.3 + lit * 2.2 - (d > rad * rad - rad ? 0.8 : 0);
      p.set(cx + x, cy + y, ri(r, v));
    }
  p.set(cx + rad, cy + rad - 1 >= cy ? cy + rad - 1 : cy, r[1]);
}

/** Wooden barrel (side view upright), w=5 h=6. */
export function barrel(p: PixelCanvas, x: number, y: number, r: Ramp = P.wood): void {
  for (let j = 0; j < 6; j++)
    for (let i = 0; i < 5; i++) {
      const edge = j === 0 || j === 5;
      if (edge && (i === 0 || i === 4)) continue;
      let v = i === 0 ? 5 : i === 1 ? 5 : i === 2 ? 4 : i === 3 ? 3 : 2;
      if (j === 1 || j === 4) v = Math.max(1, v - 3);
      p.set(x + i, y + j, ri(r, v));
    }
  p.set(x + 1, y, r[6]);
  p.set(x + 2, y, r[6]);
  p.set(x + 3, y, r[5]);
}

/** Grain sack (cloth). */
export function sack(p: PixelCanvas, x: number, y: number): void {
  const r = P.sand;
  const rows = [[1, 3], [0, 4], [0, 4], [0, 4], [1, 3]];
  rows.forEach(([a, b], j) => {
    for (let i = a; i <= b; i++) p.set(x + i, y + j, ri(r, i <= 1 ? 4 : i === 2 ? 3 : 2) );
  });
  p.set(x + 2, y - 1, r[2]);
  p.set(x + 1, y + 1, r[5]);
}

/** Log end (round) for timber piles. */
export function logEnd(p: PixelCanvas, x: number, y: number): void {
  const w = P.wood;
  p.set(x, y - 1, w[5]);
  p.set(x - 1, y, w[6]);
  p.set(x, y, w[7]);
  p.set(x + 1, y, w[5]);
  p.set(x, y + 1, w[4]);
  p.set(x - 1, y + 1, w[5]);
  p.set(x + 1, y + 1, w[3]);
  p.set(x, y - 2, w[2]);
}

