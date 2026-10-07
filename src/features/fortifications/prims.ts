import { P } from '../../art/palette';
import { bayer } from '../../art/pixel';
import { hash2 } from '../../core/rng';
import { nearestInto, type Line, type LinePos } from './geom';
import { HPX, NONE, OUTLINE, R, lightI, mix, pick, type Prim, type ShadeIn } from './raster';

/**
 * Primitives (boxes, prisms, cylinders with cone/dome tops, wall runs along a
 * polyline, rubble mounds) and their MATERIALS: limestone ashlar with red brick
 * bands, Byzantine cloisonné brickwork, marble, plaster & timber, terracotta
 * tiles, lead domes, rubble, earth. All colors come from art/palette ramps.
 */

export const RAMP = {
  lime: R(P.limestone),
  stone: R(P.stone),
  brick: R(P.brick),
  roof: R(P.roof),
  wood: R(P.wood),
  steel: R(P.steel),
  sand: R(P.sand),
  dirt: R(P.dirt),
  cloth: R(P.cloth),
  smoke: R(P.smoke),
  grass: R(P.grass),
  dryGrass: R(P.dryGrass),
  foliage: R(P.foliage),
  gold: R(P.gold),
  red: R(P.red),
  green: R(P.green),
  water: R(P.water),
  outline: OUTLINE,
};

export type MatId =
  | 'sur' // Theodosian: limestone + red brick bands
  | 'blaherna' // Komnenian wall: heavier brick banding
  | 'deniz' // sea walls: weathered limestone, damp base
  | 'galata' // Genoese rubble masonry
  | 'hisar' // Ottoman rubble stone with timber lacing
  | 'mermer' // marble
  | 'tugla' // church brickwork (cloisonné)
  | 'siva' // plaster
  | 'siva-pembe' // rose plaster (Galata)
  | 'siva-sari' // ochre plaster
  | 'siva-beyaz' // whitewash
  | 'ahsap' // timber framing
  | 'moloz'; // rubble

const frac = (v: number) => v - Math.floor(v);

/**
 * Night-window glow mode: while on, prims paint lit windows warm and everything
 * else black (the caller keeps only the warm pixels as an additive overlay).
 */
export const GLOW = { on: false };
export const GLOW_LIT = 0xffc35a;
export const GLOW_DIM = 0xd97a2a;
function glowWin(a: number, b: number, seed: number): number {
  const r = h3(a, b, seed + 131);
  return r < 0.38 ? GLOW_LIT : r < 0.55 ? GLOW_DIM : 0;
}
const h3 = (a: number, b: number, s: number) => hash2(a | 0, b | 0, s | 0);

/** Damage overlay parameters for a structure surface. */
export interface Wear {
  /** 0..4 */
  level: number;
  seed: number;
  /** soot/scorch amount 0..1 */
  soot?: number;
}

/** Pits, cracks and soot on a face: returns an index delta and a flag for crack pixels. */
const WEAR_OUT = { d: 0, crack: false, soot: 0 };
function wearAt(w: Wear | undefined, u: number, zr: number, top: number): { d: number; crack: boolean; soot: number } {
  const res = WEAR_OUT;
  res.d = 0;
  res.crack = false;
  res.soot = 0;
  if (!w || w.level <= 0) return res;
  let d = 0;
  let crack = false;
  // impact pits
  const nPits = w.level >= 4 ? 6 : w.level * 2;
  const cell = 9;
  const cu = Math.floor(u / cell);
  for (let k = -1; k <= 1; k++) {
    const ci = cu + k;
    if (h3(ci, 1, w.seed) * 4 > nPits * 0.55) continue;
    const pu = (ci + 0.2 + h3(ci, 2, w.seed) * 0.6) * cell;
    const pz = 3 + h3(ci, 3, w.seed) * Math.max(2, top - 6);
    const rr = 1.2 + h3(ci, 4, w.seed) * (w.level >= 3 ? 2.4 : 1.4);
    const du = u - pu;
    const dz = zr - pz;
    const dd = Math.sqrt(du * du + dz * dz);
    if (dd < rr) d -= 1.7 - dd * 0.35;
    else if (dd < rr + 1 && du < 0 && dz > 0) d += 0.7; // upper-left lit rim
  }
  // cracks: zig-zag from the top down
  if (w.level >= 2) {
    const cc = Math.floor(u / 14);
    for (let k = -1; k <= 1; k++) {
      const ci = cc + k;
      if (h3(ci, 7, w.seed) > 0.25 + w.level * 0.17) continue;
      const len = (0.35 + h3(ci, 8, w.seed) * 0.5) * top * (w.level >= 3 ? 1.2 : 0.8);
      const fromTop = top - zr;
      if (fromTop < 0 || fromTop > len) continue;
      const base = (ci + 0.5) * 14 + (h3(ci, 9, w.seed) - 0.5) * 6;
      const cu2 = base + Math.round(Math.sin(fromTop * 0.9 + ci) * 1.2 + (fromTop * (h3(ci, 10, w.seed) - 0.5)) * 0.5);
      if (Math.abs(u - cu2) < 0.5) crack = true;
    }
  }
  const soot = (w.soot ?? Math.min(1, w.level * 0.22)) * Math.max(0, Math.sin(u * 0.21 + w.seed) * 0.6 + Math.sin(zr * 0.33 + u * 0.07) * 0.5);
  res.d = d;
  res.crack = crack;
  res.soot = soot;
  return res;
}

/**
 * Masonry face color. u = along-face px, zr = px above the wall base, I = light,
 * top = wall height (for weathering), m = material.
 */
export function faceColor(m: MatId, I: number, u: number, zr: number, x: number, y: number, top: number, wear?: Wear): number {
  const zi = Math.floor(zr);
  const ui = Math.floor(u);
  let col: number;
  const w = wearAt(wear, u, zr, top);
  if (w.crack) return pick(OUTLINE, 1.6, x, y);
  // damp, darker foot
  const damp = zr < 2.5 ? -0.55 : zr < 4 ? -0.2 : 0;
  // vertical rain streaks from the top
  const streak = h3(Math.floor(u / 2), 5, 3) < 0.12 && zr > top - 7 ? -0.3 : 0;
  switch (m) {
    case 'sur':
    case 'blaherna':
    case 'deniz': {
      const period = m === 'blaherna' ? 6 : 7;
      const brickRows = m === 'blaherna' ? 3 : 2;
      const mm = ((zi % period) + period) % period;
      if (mm >= period - brickRows) {
        // brick band
        const row = Math.floor(zi / 1);
        const bj = (ui + (row & 1) * 2) % 4 === 0;
        let idx = 0.55 + I * 5.0 + damp * 0.6 + w.d * 0.8 + streak;
        if (bj) idx -= 0.9;
        idx += (h3(Math.floor((ui + (row & 1) * 2) / 4), row, 17) - 0.5) * 0.6;
        col = pick(RAMP.brick, idx, x, y);
      } else {
        const course = mm < 2 ? 0 : 1;
        const joint = mm === 2 && period === 7;
        const blockLen = m === 'deniz' ? 7 : 6;
        const off = course === 1 ? blockLen / 2 : 0;
        const bu = Math.floor((u + off + Math.floor(zi / period) * 2) / blockLen);
        const vj = frac((u + off + Math.floor(zi / period) * 2) / blockLen) < 1 / blockLen;
        let idx = 0.35 + I * 5.0 + damp + w.d + streak;
        idx += (h3(bu, Math.floor(zi / 3), 23) - 0.5) * 0.7;
        if (joint || vj) idx -= 0.85;
        if (m === 'deniz' && zr < 3 && h3(ui, zi, 31) < 0.35) {
          col = pick(RAMP.foliage, 2.2 + I * 2, x, y); // sea moss
          break;
        }
        col = pick(RAMP.lime, idx, x, y);
      }
      break;
    }
    case 'galata': {
      // coursed rubble with occasional brick
      const bu = Math.floor((u + (Math.floor(zr / 3) & 1) * 2) / 4);
      const bz = Math.floor(zr / 3);
      const r = h3(bu, bz, 41);
      const joint = frac(zr / 3) < 0.34 || frac((u + (Math.floor(zr / 3) & 1) * 2) / 4) < 0.25;
      let idx = 0.4 + I * 4.6 + damp + w.d + (r - 0.5) * 0.9;
      if (joint) idx -= 0.7;
      col = r < 0.1 ? pick(RAMP.brick, 1 + I * 4.6, x, y) : pick(RAMP.sand, idx * 0.95, x, y);
      col = mix(col, RAMP.lime[Math.max(0, Math.min(5, Math.round(idx)))], 0.45);
      break;
    }
    case 'hisar': {
      // Ottoman rubble masonry, timber lacing every ~8 px
      const lace = ((zi % 8) + 8) % 8 === 7;
      if (lace) {
        col = pick(RAMP.wood, 1.2 + I * 4, x, y);
        break;
      }
      const bu = Math.floor((u + (Math.floor(zr / 2.5) & 1) * 1.5) / 3.2);
      const bz = Math.floor(zr / 2.5);
      const r = h3(bu, bz, 43);
      const joint = frac(zr / 2.5) < 0.38 || frac((u + (Math.floor(zr / 2.5) & 1) * 1.5) / 3.2) < 0.3;
      let idx = 0.2 + I * 5.6 + damp + w.d + (r - 0.5) * 1.0;
      if (joint) idx -= 0.8;
      col = pick(RAMP.stone, idx, x, y);
      break;
    }
    case 'mermer': {
      const bz = Math.floor(zr / 5);
      const joint = frac(zr / 5) < 0.2 || frac((u + (bz & 1) * 4) / 8) < 0.12;
      let idx = 1.3 + I * 4.4 + w.d * 0.8 + damp * 0.5;
      if (joint) idx -= 0.5;
      // faint veins
      if (Math.abs(Math.sin(u * 0.35 + zr * 0.9 + bz)) < 0.06) idx -= 0.6;
      col = pick(RAMP.lime, idx, x, y, 0.3);
      break;
    }
    case 'tugla': {
      // cloisonné: stone blocks framed by bricks, 3 brick courses between stone courses
      const mm = ((zi % 7) + 7) % 7;
      const stoneRow = mm >= 4;
      if (stoneRow) {
        const bu = Math.floor(u / 5);
        const edge = frac(u / 5) < 0.2;
        if (edge) col = pick(RAMP.brick, 0.8 + I * 5, x, y);
        else col = pick(RAMP.lime, 0.2 + I * 4.8 + (h3(bu, zi >> 3, 51) - 0.5) * 0.6 + w.d, x, y);
      } else {
        const bj = (ui + mm * 2) % 4 === 0;
        col = pick(RAMP.brick, 0.6 + I * 5.2 - (bj ? 0.9 : 0) + w.d + damp * 0.5, x, y);
      }
      break;
    }
    case 'siva':
    case 'siva-pembe':
    case 'siva-sari':
    case 'siva-beyaz': {
      let idx = 0.9 + I * 3.8 + damp * 0.6 + w.d;
      idx += (h3(Math.floor(u / 3), Math.floor(zr / 3), 61) - 0.5) * 0.35;
      // flaking plaster shows the brick beneath
      if (h3(Math.floor(u / 2), Math.floor(zr / 2), 63) < 0.05) {
        col = pick(RAMP.brick, 1 + I * 4.5, x, y);
        break;
      }
      if (m === 'siva-pembe') col = mix(pick(RAMP.sand, idx, x, y), pick(RAMP.roof, idx + 1.2, x, y), 0.35);
      else if (m === 'siva-sari') col = pick(RAMP.gold, 1.2 + I * 3.6 + (h3(Math.floor(u / 3), Math.floor(zr / 3), 62) - 0.5) * 0.3, x, y, 0.3);
      else if (m === 'siva-beyaz') col = pick(RAMP.cloth, 0.8 + I * 4.4, x, y);
      else col = pick(RAMP.sand, idx, x, y);
      if (m === 'siva-sari') col = mix(col, RAMP.sand[Math.max(0, Math.min(5, Math.round(idx)))], 0.45);
      break;
    }
    case 'ahsap': {
      let idx = 1.0 + I * 4.8 + w.d;
      if (frac(zr / 2) < 0.5) idx -= 0.4;
      col = pick(RAMP.wood, idx, x, y);
      break;
    }
    case 'moloz':
    default: {
      col = rubbleColor(I, u, zr, x, y);
      break;
    }
  }
  if (w.soot > 0.25) col = mix(col, RAMP.smoke[1], Math.min(0.55, (w.soot - 0.25) * 0.9));
  return col;
}

/** Wall-walk / platform top surface. */
export function topColor(m: MatId, I: number, tx: number, ty: number, x: number, y: number, wear?: Wear): number {
  const slab = frac(tx * 5) < 0.18 || frac(ty * 5 + (Math.floor(tx * 5) & 1) * 0.5) < 0.18;
  let idx = 0.2 + I * 4.6 - (slab ? 0.55 : 0);
  if (wear && wear.level >= 2 && h3(Math.floor(tx * 10), Math.floor(ty * 10), wear.seed) < wear.level * 0.08) idx -= 1.2;
  if (m === 'mermer') return pick(RAMP.lime, idx + 0.9, x, y, 0.3);
  if (m === 'hisar') return pick(RAMP.stone, idx + 0.9, x, y);
  if (m === 'galata') return mix(pick(RAMP.sand, idx, x, y), pick(RAMP.lime, idx, x, y), 0.5);
  // weeds on neglected wall-walks
  if (h3(Math.floor(tx * 16), Math.floor(ty * 16), 77) < 0.05) return pick(RAMP.grass, 2.5 + I * 3, x, y);
  return pick(RAMP.stone, idx + 1.2, x, y);
}

/** Rubble: blocks, brick chunks, dust. */
export function rubbleColor(I: number, a: number, b: number, x: number, y: number): number {
  const cu = Math.floor(a / 2.2);
  const cv = Math.floor(b / 1.8);
  const r = h3(cu, cv, 91);
  const edge = frac(a / 2.2) < 0.3 || frac(b / 1.8) < 0.3;
  let idx = 0.3 + I * 3.7 + (r - 0.5) * 1.1 - (edge ? 0.8 : 0);
  if (r < 0.16) return pick(RAMP.brick, idx + 0.3, x, y);
  if (r > 0.8) return pick(RAMP.dirt, idx + 0.9, x, y);
  return pick(RAMP.stone, idx + 0.8, x, y);
}

// ───────────────────────────── shared lighting helpers ─────────────────────────────

function nrm(x: number, y: number, z: number): [number, number, number] {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}

// ───────────────────────────── WallRun ─────────────────────────────

export interface WallRunOpts {
  line: Line;
  t0: number;
  t1: number;
  /** inner/outer offset band (tiles, + = outside) */
  n0: number;
  n1: number;
  base: number;
  height: number;
  mat: MatId;
  owner: number;
  /** merlons on the outside edge ('out'), inside edge, both or none */
  parapet: 'out' | 'in' | 'both' | 'none';
  merlonH?: number;
  wear?: Wear;
  /** remaining height fraction 0..1 along the run (damage profile); default 1 */
  profile?: (t: number) => number;
  /** merlon drop-out probability 0..1 */
  merlonLoss?: number;
  /** painted openings: gates (t, half width px, height px) */
  gates?: { t: number; hw: number; hh: number; marble?: boolean; triple?: boolean }[];
}

export class WallRun implements Prim {
  x0 = 0;
  y0 = 0;
  x1 = 0;
  y1 = 0;
  zTop: number;
  owner: number;
  private sf: number;
  private st: number;
  constructor(public o: WallRunOpts) {
    this.owner = o.owner;
    const line = o.line;
    // segment range covering [t0,t1]
    let sf = 0;
    while (sf < line.pts.length - 2 && line.cum[sf + 1] < o.t0) sf++;
    let st = sf;
    while (st < line.pts.length - 2 && line.cum[st + 1] < o.t1) st++;
    this.sf = sf;
    this.st = st;
    const pad = Math.max(Math.abs(o.n0), Math.abs(o.n1)) + 0.2;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let k = 0; k <= 8; k++) {
      const t = o.t0 + ((o.t1 - o.t0) * k) / 8;
      const i = Math.min(line.pts.length - 2, Math.max(0, sfAt(line, t)));
      const a = line.pts[i];
      const b = line.pts[i + 1];
      const l = line.cum[i + 1] - line.cum[i] || 1;
      const f = (t - line.cum[i]) / l;
      const px = a.tx + (b.tx - a.tx) * f;
      const py = a.ty + (b.ty - a.ty) * f;
      x0 = Math.min(x0, px);
      y0 = Math.min(y0, py);
      x1 = Math.max(x1, px);
      y1 = Math.max(y1, py);
    }
    this.x0 = x0 - pad;
    this.y0 = y0 - pad;
    this.x1 = x1 + pad;
    this.y1 = y1 + pad;
    this.zTop = o.base + o.height + (o.merlonH ?? 3) + 1;
  }

  private qq: LinePos = { t: 0, n: 0, dist: 0, seg: 0 };
  private q(tx: number, ty: number): LinePos {
    return nearestInto(this.o.line, tx, ty, this.sf, this.st, this.qq);
  }

  private merlon(t: number): boolean {
    const o = this.o;
    const u = t * HPX;
    const k = Math.floor(u / 5);
    if (frac(u / 5) >= 0.6) return false;
    if (o.merlonLoss && h3(k, 3, o.wear?.seed ?? 1) < o.merlonLoss) return false;
    return true;
  }

  private topAt(t: number, n: number): number {
    const o = this.o;
    const prof = o.profile ? o.profile(t) : 1;
    let z = o.height * prof;
    if (prof > 0.97) {
      const pw = Math.min(0.075, (o.n1 - o.n0) * 0.35);
      const mh = o.merlonH ?? 3;
      const outEdge = n > o.n1 - pw;
      const inEdge = n < o.n0 + pw;
      if ((outEdge && (o.parapet === 'out' || o.parapet === 'both')) || (inEdge && (o.parapet === 'in' || o.parapet === 'both'))) {
        z += this.merlon(t) ? mh : 1;
      }
    } else if (prof < 0.97) {
      // broken top: ragged blocks
      z += Math.round((h3(Math.floor((t * HPX) / 3), Math.floor(n * 12), o.wear?.seed ?? 3) - 0.6) * 3);
    }
    return z;
  }

  h(tx: number, ty: number): number {
    const o = this.o;
    const q = this.q(tx, ty);
    if (q.t < o.t0 || q.t >= o.t1 || q.n < o.n0 || q.n > o.n1) return NONE;
    return o.base + Math.max(0.5, this.topAt(q.t, q.n));
  }

  shade(p: ShadeIn): number {
    const o = this.o;
    const q = this.q(p.tx, p.ty);
    const zr = p.z - o.base;
    const isTop = p.top || p.z >= p.H - 0.6;
    const prof = o.profile ? o.profile(q.t) : 1;
    // gates (painted openings on the faces)
    if (o.gates && !isTop) {
      for (const g of o.gates) {
        const du = (q.t - g.t) * HPX;
        if (Math.abs(du) > g.hw + 2) continue;
        const inA = (dd: number, r: number) => {
          if (g.triple) {
            // Golden Gate: tall middle arch, two lower side arches
            const side = Math.abs(dd) > g.hw * 0.42;
            const c = side ? Math.sign(dd) * g.hw * 0.72 : 0;
            const hw = side ? g.hw * 0.22 + r : g.hw * 0.32 + r;
            const hh = side ? g.hh * 0.62 : g.hh;
            const d2 = dd - c;
            if (Math.abs(d2) > hw) return false;
            return zr < hh - hw + Math.sqrt(Math.max(0, hw * hw - d2 * d2));
          }
          const hw = g.hw + r;
          if (Math.abs(dd) > hw) return false;
          return zr < g.hh - hw + Math.sqrt(Math.max(0, hw * hw - dd * dd));
        };
        if (inA(du, 0)) {
          // dark passage with a hint of a closed timber door deep inside
          const door = zr < g.hh * 0.75 && Math.abs(du) < g.hw - 1;
          return door ? pick(RAMP.wood, 0.8 + (frac(du / 2) < 0.5 ? 0.3 : 0), p.x, p.y) : pick(OUTLINE, 1.2 + zr * 0.04, p.x, p.y);
        }
        if (inA(du, 1.2)) return pick(RAMP.lime, g.marble ? 5 : 4.2, p.x, p.y);
      }
    }
    // normal
    const line = o.line;
    const seg = q.seg;
    const a = line.pts[seg];
    const b = line.pts[seg + 1];
    const l = line.cum[seg + 1] - line.cum[seg] || 1;
    const dx = (b.tx - a.tx) / l;
    const dy = (b.ty - a.ty) / l;
    const onx = dy * line.side;
    const ony = -dx * line.side;
    if (isTop) {
      if (prof < 0.97) return rubbleColor(lightI(0, 0, 1, p.sh) - 0.05, q.t * HPX, q.n * 30, p.x, p.y);
      const I = lightI(0, 0, 1, p.sh);
      if (zr > o.height + 0.5) return faceColor(o.mat, I * 0.96, q.t * HPX, zr, p.x, p.y, o.height + 3, o.wear);
      return topColor(o.mat, I, p.tx, p.ty, p.x, p.y, o.wear);
    }
    let nx: number;
    let ny: number;
    const dIn = q.n - o.n0;
    const dOut = o.n1 - q.n;
    // gap edges face along the wall
    const step = 0.04;
    const pa = o.profile ? o.profile(q.t - step) : 1;
    const pb = o.profile ? o.profile(q.t + step) : 1;
    if (o.profile && zr > o.height * Math.min(pa, pb) + 1 && Math.abs(pa - pb) > 0.2) {
      const sgn = pa < pb ? -1 : 1;
      nx = dx * sgn;
      ny = dy * sgn;
    } else if (dIn < dOut) {
      nx = -onx;
      ny = -ony;
    } else {
      nx = onx;
      ny = ony;
    }
    const I = lightI(nx, ny, 0, p.sh);
    return faceColor(o.mat, I, q.t * HPX, zr, p.x, p.y, o.height * prof, o.wear);
  }
}

function sfAt(line: Line, t: number): number {
  let i = 0;
  while (i < line.pts.length - 2 && line.cum[i + 1] < t) i++;
  return i;
}

// ───────────────────────────── Box (oriented) ─────────────────────────────

export type RoofKind = 'flat' | 'merlon' | 'gable' | 'hip' | 'pyramid' | 'shed' | 'ruin';

export interface BoxOpts {
  cx: number;
  cy: number;
  /** axis direction (unit) — local a axis */
  ax: number;
  ay: number;
  ha: number;
  hb: number;
  base: number;
  height: number;
  roof: RoofKind;
  rise?: number;
  mat: MatId;
  /** material of the upper storey above `upperZ` (e.g. timber on a stone ground floor) */
  upper?: MatId;
  upperZ?: number;
  roofMat?: 'kiremit' | 'kursun' | 'ahsap' | 'tas';
  owner: number;
  wear?: Wear;
  /** windows/doors painting */
  windows?: 'ev' | 'kule' | 'kilise' | 'saray' | 'none';
  /** collapsed tower: ragged top at this fraction of the height */
  ruin?: number;
  seed?: number;
  merlonH?: number;
}

export class Box implements Prim {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  zTop: number;
  owner: number;
  constructor(public o: BoxOpts) {
    this.owner = o.owner;
    const ex = Math.abs(o.ax) * o.ha + Math.abs(o.ay) * o.hb;
    const ey = Math.abs(o.ay) * o.ha + Math.abs(o.ax) * o.hb;
    this.x0 = o.cx - ex;
    this.x1 = o.cx + ex;
    this.y0 = o.cy - ey;
    this.y1 = o.cy + ey;
    this.zTop = o.base + o.height + Math.max(o.rise ?? 0, o.merlonH ?? 3) + 2;
  }

  private local(tx: number, ty: number): [number, number] {
    const dx = tx - this.o.cx;
    const dy = ty - this.o.cy;
    return [dx * this.o.ax + dy * this.o.ay, -dx * this.o.ay + dy * this.o.ax];
  }

  private roofZ(a: number, b: number): number {
    const o = this.o;
    const rise = o.rise ?? 0;
    switch (o.roof) {
      case 'gable':
        return rise * (1 - Math.abs(b) / o.hb);
      case 'hip':
        return rise * Math.max(0, Math.min(1 - Math.abs(b) / o.hb, (o.ha - Math.abs(a)) / o.hb));
      case 'pyramid':
        return rise * Math.min(1 - Math.abs(a) / o.ha, 1 - Math.abs(b) / o.hb);
      case 'shed':
        return rise * (0.5 - b / (2 * o.hb));
      case 'merlon': {
        const mw = 0.06;
        const edge = o.ha - Math.abs(a) < mw || o.hb - Math.abs(b) < mw;
        if (!edge) return 0;
        const u = (o.ha - Math.abs(a) < mw ? b : a) * HPX;
        if (o.wear && o.wear.level >= 1 && h3(Math.floor(u / 4), Math.round(a * 3 + b * 7), o.wear.seed) < o.wear.level * 0.15) return 1;
        return frac(u / 4) < 0.55 ? (o.merlonH ?? 3) : 1;
      }
      case 'ruin':
        return 0;
      default:
        return 0;
    }
  }

  h(tx: number, ty: number): number {
    const o = this.o;
    const [a, b] = this.local(tx, ty);
    if (Math.abs(a) > o.ha || Math.abs(b) > o.hb) return NONE;
    if (o.ruin != null) {
      const n = h3(Math.floor(a * 9), Math.floor(b * 9), o.seed ?? 5);
      const edge = Math.min(o.ha - Math.abs(a), o.hb - Math.abs(b));
      return o.base + o.height * o.ruin + (n - 0.5) * 5 + (edge < 0.08 ? 2 + n * 4 : 0);
    }
    return o.base + o.height + this.roofZ(a, b);
  }

  shade(p: ShadeIn): number {
    const o = this.o;
    const [a, b] = this.local(p.tx, p.ty);
    const zr = p.z - o.base;
    if (GLOW.on && (p.top || zr > o.height + 0.4)) return 0;
    const wallTop = o.ruin != null ? o.height * o.ruin - 3 : o.height;
    const onRoof = zr > wallTop + 0.4 || p.top;
    const sloped = o.roof === 'gable' || o.roof === 'hip' || o.roof === 'pyramid' || o.roof === 'shed';
    if (o.ruin != null && onRoof) return rubbleColor(lightI(0, 0, 1, p.sh), a * HPX, b * HPX, p.x, p.y);
    if (onRoof && sloped && zr > o.height - 0.5) {
      // roof plane normal (local), converted back to world
      const rise = o.rise ?? 0;
      let la = 0;
      let lb = 0;
      if (o.roof === 'gable') lb = Math.sign(b) * (rise / (o.hb * HPX));
      else if (o.roof === 'shed') lb = rise / (2 * o.hb * HPX);
      else if (o.roof === 'pyramid') {
        if (1 - Math.abs(a) / o.ha < 1 - Math.abs(b) / o.hb) la = Math.sign(a) * (rise / (o.ha * HPX));
        else lb = Math.sign(b) * (rise / (o.hb * HPX));
      } else {
        if ((o.ha - Math.abs(a)) / o.hb < 1 - Math.abs(b) / o.hb) la = Math.sign(a) * (rise / (o.hb * HPX));
        else lb = Math.sign(b) * (rise / (o.hb * HPX));
      }
      const wx = la * o.ax - lb * o.ay;
      const wy = la * o.ay + lb * o.ax;
      const [nx, ny, nz] = nrm(wx, wy, 1);
      const I = lightI(nx, ny, nz, p.sh);
      return roofColor(o.roofMat ?? 'kiremit', I, a, b, p.x, p.y, o.seed ?? 0, o.roof === 'gable' && Math.abs(b) < 0.04);
    }
    if (onRoof) {
      const I = lightI(0, 0, 1, p.sh);
      if (zr > o.height + 0.5) return faceColor(o.mat, I * 0.95, (a + b) * HPX, zr, p.x, p.y, o.height + 3, o.wear);
      if (o.roofMat === 'ahsap') return pick(RAMP.wood, 1.5 + I * 4.5 - (frac(a * 8) < 0.2 ? 0.6 : 0), p.x, p.y);
      if (o.roofMat === 'kursun') return pick(RAMP.steel, 0.9 + I * 4.6 - (frac(a * 9) < 0.15 ? 0.5 : 0), p.x, p.y);
      if (o.roofMat === 'kiremit') return roofColor('kiremit', I * 0.95, a, b, p.x, p.y, o.seed ?? 0, false);
      return topColor(o.mat, I, p.tx, p.ty, p.x, p.y, o.wear);
    }
    // side face
    const da = o.ha - Math.abs(a);
    const db = o.hb - Math.abs(b);
    let la: number;
    let lb: number;
    let u: number;
    let fw: number;
    if (da < db) {
      la = Math.sign(a);
      lb = 0;
      u = b * HPX;
      fw = o.hb * HPX;
    } else {
      la = 0;
      lb = Math.sign(b);
      u = a * HPX;
      fw = o.ha * HPX;
    }
    const nx = la * o.ax - lb * o.ay;
    const ny = la * o.ay + lb * o.ax;
    const I = lightI(nx, ny, 0, p.sh);
    const mat = o.upper && zr >= (o.upperZ ?? 99) ? o.upper : o.mat;
    const win = windowAt(o.windows ?? 'none', u, zr, fw, o.height, o.upperZ, o.seed ?? 0, la !== 0);
    if (GLOW.on) return win === 1 ? glowWin(Math.floor((u + fw) / 5) + la * 31 + lb * 17, Math.floor(zr / 4), o.seed ?? 0) : 0;
    if (win === 1) return pick(OUTLINE, 1.4, p.x, p.y);
    if (win === 2) return pick(RAMP.wood, 1.2 + I * 3, p.x, p.y);
    if (win === 3) return pick(RAMP.lime, 1 + I * 4.5, p.x, p.y);
    let col = faceColor(mat, I, u + 40, zr, p.x, p.y, o.height, o.wear);
    if (mat === 'ahsap' || (o.upper === 'ahsap' && zr >= (o.upperZ ?? 99))) {
      // half-timbering: posts, beams, braces on plaster infill
      const post = frac((u + fw) / 5) < 0.22;
      const beam = Math.abs(zr - (o.upperZ ?? 0)) < 0.8 || Math.abs(zr - o.height + 0.5) < 0.6;
      const brace = Math.abs(frac((u + fw) / 5) * 5 - (zr - (o.upperZ ?? 0)) * 0.9) < 0.5;
      if (post || beam || brace) col = pick(RAMP.wood, 0.8 + I * 3.6, p.x, p.y);
      else col = pick(RAMP.sand, 1.4 + I * 3.6, p.x, p.y);
    }
    if (zr < 1.2) col = mix(col, OUTLINE[1], 0.25);
    return col;
  }
}

/** 0 none · 1 dark opening · 2 shutter/door wood · 3 stone frame */
function windowAt(kind: BoxOpts['windows'], u: number, zr: number, fw: number, height: number, upperZ: number | undefined, seed: number, endFace: boolean): number {
  if (kind === 'none' || !kind) return 0;
  const uu = u + fw; // 0..2fw
  switch (kind) {
    case 'ev': {
      // door on the long side at ground, small windows above
      const up = upperZ ?? 5;
      if (!endFace && zr < 3.5 && Math.abs(uu - fw * (0.6 + h3(seed, 1, 2) * 0.4)) < 0.9) return 2;
      if (zr > up + 1.2 && zr < up + 3.2) {
        const c = frac(uu / 5);
        if (c > 0.42 && c < 0.72) return h3(Math.floor(uu / 5), seed, 9) < 0.25 ? 2 : 1;
      }
      return 0;
    }
    case 'kule': {
      // arrow slits & an upper window
      const c = Math.abs(uu - fw);
      if (c < 0.5 && ((zr > height * 0.35 && zr < height * 0.35 + 3) || (zr > height * 0.66 && zr < height * 0.66 + 3))) return 1;
      if (endFace) return 0;
      if (c < 1.1 && zr > height * 0.62 && zr < height * 0.62 + 3.5) return zr > height * 0.62 + 3 ? 3 : 1;
      return 0;
    }
    case 'kilise': {
      // tall arched windows in a row
      const c = frac(uu / 6);
      const cz = height * 0.55;
      if (c > 0.38 && c < 0.62 && zr > cz && zr < cz + 4 - (Math.abs(c - 0.5) > 0.08 ? 0.7 : 0)) return 1;
      if (!endFace && zr < 5 && Math.abs(uu - fw) < 1.3) return 2;
      return 0;
    }
    case 'saray': {
      // rows of arched windows on every storey
      for (const f of [0.28, 0.55, 0.8]) {
        const cz = height * f;
        const c = frac(uu / 5);
        if (c > 0.3 && c < 0.7 && zr > cz && zr < cz + 3.5 - (Math.abs(c - 0.5) > 0.12 ? 0.7 : 0)) return 1;
        if (c > 0.22 && c < 0.78 && zr > cz + 3.5 && zr < cz + 4.3) return 3;
      }
      return 0;
    }
  }
  return 0;
}

export function roofColor(m: 'kiremit' | 'kursun' | 'ahsap' | 'tas', I: number, a: number, b: number, x: number, y: number, seed: number, ridge: boolean): number {
  if (m === 'kursun') {
    let idx = 0.6 + I * 5.2;
    if (frac(a * 7) < 0.14) idx -= 0.6;
    return pick(RAMP.steel, idx, x, y);
  }
  if (m === 'ahsap') return pick(RAMP.wood, 1 + I * 5 - (frac(b * 12) < 0.25 ? 0.6 : 0), x, y);
  if (m === 'tas') return pick(RAMP.stone, 1 + I * 5, x, y);
  // terracotta tiles: courses along the slope, rounded tile columns
  const course = frac(Math.abs(b) * 11) < 0.28;
  const col = frac(a * 14) < 0.3;
  let idx = 0.5 + I * 5.4;
  if (course) idx -= 0.8;
  else if (col) idx += 0.35;
  idx += (h3(Math.floor(a * 14), Math.floor(Math.abs(b) * 11), seed + 7) - 0.5) * 0.7;
  if (ridge) idx += 0.9;
  return pick(RAMP.roof, idx, x, y);
}

// ───────────────────────────── Cylinder (towers, drums, domes, cones) ─────────────────────────────

export interface CylOpts {
  cx: number;
  cy: number;
  r: number;
  base: number;
  height: number;
  top: 'flat' | 'merlon' | 'cone' | 'dome' | 'ruin';
  rise?: number;
  mat: MatId;
  roofMat?: 'kiremit' | 'kursun' | 'ahsap' | 'tas';
  owner: number;
  wear?: Wear;
  /** half-plane clip: keep points with (p−c)·(nx,ny) ≥ 0 (apses) */
  clip?: { nx: number; ny: number };
  windows?: 'drum' | 'kule' | 'none';
  ribs?: number;
  seed?: number;
  ruin?: number;
}

export class Cyl implements Prim {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  zTop: number;
  owner: number;
  constructor(public o: CylOpts) {
    this.owner = o.owner;
    this.x0 = o.cx - o.r;
    this.x1 = o.cx + o.r;
    this.y0 = o.cy - o.r;
    this.y1 = o.cy + o.r;
    this.zTop = o.base + o.height + Math.max(o.rise ?? 0, 4) + 1;
  }

  h(tx: number, ty: number): number {
    const o = this.o;
    const dx = tx - o.cx;
    const dy = ty - o.cy;
    const d2 = dx * dx + dy * dy;
    if (d2 > o.r * o.r) return NONE;
    if (o.clip && dx * o.clip.nx + dy * o.clip.ny < 0) return NONE;
    const d = Math.sqrt(d2) / o.r;
    if (o.ruin != null) {
      const n = h3(Math.floor(tx * 9), Math.floor(ty * 9), o.seed ?? 5);
      return o.base + o.height * o.ruin + (n - 0.5) * 5 + (d > 0.8 ? 3 + n * 3 : 0);
    }
    const rise = o.rise ?? 0;
    switch (o.top) {
      case 'cone':
        return o.base + o.height + rise * (1 - d);
      case 'dome':
        return o.base + o.height + rise * Math.sqrt(Math.max(0, 1 - d * d));
      case 'merlon': {
        if (d < 0.82) return o.base + o.height;
        const ang = Math.atan2(dy, dx);
        const k = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * Math.max(8, Math.round(o.r * 40)));
        return o.base + o.height + (k % 2 === 0 ? 3 : 1);
      }
      default:
        return o.base + o.height;
    }
  }

  shade(p: ShadeIn): number {
    const o = this.o;
    const dx = p.tx - o.cx;
    const dy = p.ty - o.cy;
    const d = Math.hypot(dx, dy);
    const zr = p.z - o.base;
    const ang = Math.atan2(dy, dx);
    const u = ang * o.r * HPX;
    if (GLOW.on && (p.top || zr > o.height + 0.3)) return 0;
    if (o.ruin != null && (p.top || zr > o.height * o.ruin - 3)) return rubbleColor(lightI(0, 0, 1, p.sh), dx * HPX * 2, dy * HPX * 2, p.x, p.y);
    if (zr > o.height + 0.3 && (o.top === 'cone' || o.top === 'dome')) {
      const rise = o.rise ?? 0;
      let nx: number;
      let ny: number;
      let nz: number;
      const rd = d / o.r;
      if (o.top === 'cone') {
        const s = rise / (o.r * HPX);
        [nx, ny, nz] = nrm((dx / (d || 1)) * s, (dy / (d || 1)) * s, 1);
      } else {
        // ellipsoid normal
        const zz = Math.sqrt(Math.max(0.0001, 1 - rd * rd));
        const k = rise / (o.r * HPX);
        [nx, ny, nz] = nrm((dx / o.r) * k, (dy / o.r) * k, zz);
      }
      const I = lightI(nx, ny, nz, p.sh);
      if (o.ribs) {
        const rib = frac(((ang + Math.PI) / (Math.PI * 2)) * o.ribs) < 0.16;
        const col = roofColor(o.roofMat ?? 'kursun', I - (rib ? 0.06 : 0), ang * 2, rd, p.x, p.y, o.seed ?? 0, false);
        return rib ? mix(col, 0xffffff, 0.08) : col;
      }
      if (o.roofMat === 'kiremit') {
        // radial tiles
        return roofColor('kiremit', I, ang * o.r * 3, rd * 1.6, p.x, p.y, o.seed ?? 0, false);
      }
      return roofColor(o.roofMat ?? 'kursun', I, ang * 2, rd, p.x, p.y, o.seed ?? 0, false);
    }
    if (p.top || zr >= p.H - o.base - 0.5) {
      const I = lightI(0, 0, 1, p.sh);
      if (o.top === 'merlon' && d > o.r * 0.82) return faceColor(o.mat, I * 0.95, u, zr, p.x, p.y, o.height + 3, o.wear);
      return topColor(o.mat, I, p.tx, p.ty, p.x, p.y, o.wear);
    }
    const nx = dx / (d || 1);
    const ny = dy / (d || 1);
    const I = lightI(nx, ny, 0, p.sh);
    if (GLOW.on && o.windows !== 'drum' && o.windows !== 'kule') return 0;
    if (o.windows === 'drum') {
      // arched drum windows between buttress piers
      const n = Math.max(6, Math.round(o.r * 30));
      const c = frac(((ang + Math.PI) / (Math.PI * 2)) * n);
      const top = o.height * 0.85 - (Math.abs(c - 0.5) > 0.12 ? 0.8 : 0);
      if (zr > o.height * 0.25 && zr < top && c > 0.3 && c < 0.7) return GLOW.on ? glowWin(Math.floor(((ang + Math.PI) / (Math.PI * 2)) * n), 0, o.seed ?? 0) : pick(OUTLINE, 1.5, p.x, p.y);
    } else if (o.windows === 'kule') {
      const n = 4;
      const c = frac(((ang + Math.PI) / (Math.PI * 2)) * n + 0.125);
      if (c > 0.46 && c < 0.54 && ((zr > o.height * 0.4 && zr < o.height * 0.4 + 3) || (zr > o.height * 0.7 && zr < o.height * 0.7 + 3))) return GLOW.on ? GLOW_LIT : pick(OUTLINE, 1.4, p.x, p.y);
    }
    if (GLOW.on) return 0;
    const col = faceColor(o.mat, I, u, zr, p.x, p.y, o.height, o.wear);
    return zr < 1.2 ? mix(col, OUTLINE[1], 0.25) : col;
  }
}

// ───────────────────────────── Polygonal prism ─────────────────────────────

export interface PolyOpts {
  cx: number;
  cy: number;
  r: number;
  sides: number;
  rot: number;
  base: number;
  height: number;
  top: 'flat' | 'merlon' | 'pyramid' | 'ruin';
  rise?: number;
  mat: MatId;
  owner: number;
  wear?: Wear;
  ruin?: number;
  seed?: number;
  /** keep only the half facing (nx,ny) (half-octagon apses / horseshoe towers) */
  clip?: { nx: number; ny: number; off?: number };
  windows?: 'kule' | 'none';
}

export class Poly implements Prim {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  zTop: number;
  owner: number;
  private apo: number;
  constructor(public o: PolyOpts) {
    this.owner = o.owner;
    this.x0 = o.cx - o.r;
    this.x1 = o.cx + o.r;
    this.y0 = o.cy - o.r;
    this.y1 = o.cy + o.r;
    this.zTop = o.base + o.height + Math.max(o.rise ?? 0, 4) + 1;
    this.apo = o.r * Math.cos(Math.PI / o.sides);
  }

  /** returns [max normalized face distance, face angle] */
  private face(dx: number, dy: number): [number, number] {
    const o = this.o;
    const ang = Math.atan2(dy, dx) - o.rot;
    const step = (Math.PI * 2) / o.sides;
    const k = Math.round(ang / step);
    const fa = k * step + o.rot;
    const proj = dx * Math.cos(fa) + dy * Math.sin(fa);
    return [proj / this.apo, fa];
  }

  h(tx: number, ty: number): number {
    const o = this.o;
    const dx = tx - o.cx;
    const dy = ty - o.cy;
    if (o.clip && dx * o.clip.nx + dy * o.clip.ny < (o.clip.off ?? 0)) return NONE;
    const [f] = this.face(dx, dy);
    if (f > 1) return NONE;
    if (o.ruin != null) {
      const n = h3(Math.floor(tx * 9), Math.floor(ty * 9), o.seed ?? 5);
      return o.base + o.height * o.ruin + (n - 0.5) * 5 + (f > 0.8 ? 3 + n * 3 : 0);
    }
    if (o.top === 'pyramid') return o.base + o.height + (o.rise ?? 0) * (1 - f);
    if (o.top === 'merlon' && f > 0.84) {
      const ang = Math.atan2(dy, dx);
      const k = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * o.sides * 3);
      if (o.wear && o.wear.level >= 1 && h3(k, 1, o.wear.seed) < o.wear.level * 0.15) return o.base + o.height + 1;
      return o.base + o.height + (k % 2 === 0 ? 3 : 1);
    }
    return o.base + o.height;
  }

  shade(p: ShadeIn): number {
    const o = this.o;
    const dx = p.tx - o.cx;
    const dy = p.ty - o.cy;
    const [f, fa] = this.face(dx, dy);
    const zr = p.z - o.base;
    if (o.ruin != null && (p.top || zr > o.height * o.ruin - 3)) return rubbleColor(lightI(0, 0, 1, p.sh), dx * 40, dy * 40, p.x, p.y);
    if (o.top === 'pyramid' && zr > o.height + 0.3) {
      const s = (o.rise ?? 0) / (this.apo * HPX);
      const [nx, ny, nz] = nrm(Math.cos(fa) * s, Math.sin(fa) * s, 1);
      return roofColor('kiremit', lightI(nx, ny, nz, p.sh), (Math.atan2(dy, dx) * o.r) * 3, f * 1.4, p.x, p.y, o.seed ?? 0, false);
    }
    if (p.top || zr >= p.H - o.base - 0.5) {
      const I = lightI(0, 0, 1, p.sh);
      if (o.top === 'merlon' && f > 0.84) return faceColor(o.mat, I * 0.95, Math.atan2(dy, dx) * o.r * HPX, zr, p.x, p.y, o.height + 3, o.wear);
      return topColor(o.mat, I, p.tx, p.ty, p.x, p.y, o.wear);
    }
    // planar face: along-face coordinate
    const tx = -Math.sin(fa);
    const ty = Math.cos(fa);
    const u = (dx * tx + dy * ty) * HPX;
    if (o.clip) {
      // flat cut face (the side attached to the wall)
      const cd = dx * o.clip.nx + dy * o.clip.ny - (o.clip.off ?? 0);
      if (cd < 0.03 && f < 0.97) {
        const I = lightI(-o.clip.nx, -o.clip.ny, 0, p.sh);
        return faceColor(o.mat, I, (dx * -o.clip.ny + dy * o.clip.nx) * HPX, zr, p.x, p.y, o.height, o.wear);
      }
    }
    const I = lightI(Math.cos(fa), Math.sin(fa), 0, p.sh);
    if (o.windows === 'kule' && Math.abs(u) < 0.5 && ((zr > o.height * 0.4 && zr < o.height * 0.4 + 3) || (zr > o.height * 0.7 && zr < o.height * 0.7 + 3))) {
      return pick(OUTLINE, 1.4, p.x, p.y);
    }
    const col = faceColor(o.mat, I, u + fa * 30, zr, p.x, p.y, o.height, o.wear);
    return zr < 1.2 ? mix(col, OUTLINE[1], 0.25) : col;
  }
}

// ───────────────────────────── Rubble / earth mound ─────────────────────────────

export interface MoundOpts {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  r: number;
  base: number;
  height: number;
  owner: number;
  seed: number;
  kind: 'moloz' | 'toprak' | 'cali';
}

export class Mound implements Prim {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  zTop: number;
  owner: number;
  constructor(public o: MoundOpts) {
    this.owner = o.owner;
    this.x0 = Math.min(o.ax, o.bx) - o.r;
    this.x1 = Math.max(o.ax, o.bx) + o.r;
    this.y0 = Math.min(o.ay, o.by) - o.r;
    this.y1 = Math.max(o.ay, o.by) + o.r;
    this.zTop = o.base + o.height + 3;
  }

  private dist(tx: number, ty: number): number {
    const o = this.o;
    const dx = o.bx - o.ax;
    const dy = o.by - o.ay;
    const l2 = dx * dx + dy * dy || 1e-9;
    const t = Math.max(0, Math.min(1, ((tx - o.ax) * dx + (ty - o.ay) * dy) / l2));
    return Math.hypot(tx - (o.ax + dx * t), ty - (o.ay + dy * t)) / o.r;
  }

  private bump(tx: number, ty: number): number {
    const s = this.o.seed;
    return (h3(Math.floor(tx * 10), Math.floor(ty * 10), s) - 0.5) * 1.3 + (h3(Math.floor(tx * 4), Math.floor(ty * 4), s + 1) - 0.5) * 1.2;
  }

  h(tx: number, ty: number): number {
    const d = this.dist(tx, ty);
    if (d >= 1) return NONE;
    const k = 1 - d * d;
    const z = this.o.height * Math.pow(k, 0.8) + this.bump(tx, ty) * Math.min(1, k * 3);
    if (z < 0.6) return NONE;
    return this.o.base + z;
  }

  shade(p: ShadeIn): number {
    // numeric normal of the smooth part
    const e = 0.06;
    const hx = (this.h(p.tx + e, p.ty) - this.h(p.tx - e, p.ty)) / (2 * e * HPX);
    const hy = (this.h(p.tx, p.ty + e) - this.h(p.tx, p.ty - e)) / (2 * e * HPX);
    const ok = isFinite(hx) && isFinite(hy) && Math.abs(hx) < 50 && Math.abs(hy) < 50;
    const [nx, ny, nz] = ok ? nrm(-hx, -hy, 1) : [0, 0, 1];
    const I = lightI(nx, ny, nz, p.sh);
    if (this.o.kind === 'toprak') {
      const idx = 1 + I * 4.6 + (h3(Math.floor(p.tx * 14), Math.floor(p.ty * 14), 5) - 0.5) * 0.8;
      return pick(RAMP.dirt, idx, p.x, p.y);
    }
    if (this.o.kind === 'cali') {
      // fascine bundles: brushwood rolls tied with withies
      const roll = frac((p.tx + p.ty) * 5);
      const tie = frac((p.tx - p.ty) * 4) < 0.15;
      const idx = 1.2 + I * 4.5 - (roll < 0.22 ? 1 : 0) - (tie ? 0.8 : 0);
      return pick(RAMP.wood, idx + (h3(Math.floor(p.tx * 20), Math.floor(p.ty * 20), 3) - 0.5) * 0.8, p.x, p.y);
    }
    return rubbleColor(I, p.tx * 30 + p.ty * 7, p.ty * 30 - p.z * 0.5, p.x, p.y);
  }
}

// ───────────────────────────── generic flat slab / basin ─────────────────────────────

export interface SlabOpts {
  cx: number;
  cy: number;
  ax: number;
  ay: number;
  ha: number;
  hb: number;
  base: number;
  height: number;
  owner: number;
  color: (I: number, a: number, b: number, x: number, y: number, side: boolean) => number;
  noShadow?: boolean;
}

export class Slab implements Prim {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  zTop: number;
  owner: number;
  noShadow?: boolean;
  constructor(public o: SlabOpts) {
    this.owner = o.owner;
    const ex = Math.abs(o.ax) * o.ha + Math.abs(o.ay) * o.hb;
    const ey = Math.abs(o.ay) * o.ha + Math.abs(o.ax) * o.hb;
    this.x0 = o.cx - ex;
    this.x1 = o.cx + ex;
    this.y0 = o.cy - ey;
    this.y1 = o.cy + ey;
    this.zTop = o.base + o.height;
    this.noShadow = o.noShadow;
  }
  h(tx: number, ty: number): number {
    const o = this.o;
    const dx = tx - o.cx;
    const dy = ty - o.cy;
    const a = dx * o.ax + dy * o.ay;
    const b = -dx * o.ay + dy * o.ax;
    if (Math.abs(a) > o.ha || Math.abs(b) > o.hb) return NONE;
    return o.base + o.height;
  }
  shade(p: ShadeIn): number {
    const o = this.o;
    const dx = p.tx - o.cx;
    const dy = p.ty - o.cy;
    const a = dx * o.ax + dy * o.ay;
    const b = -dx * o.ay + dy * o.ax;
    const side = !p.top && p.z < p.H - 0.6;
    const I = side ? lightI(o.ay * -Math.sign(b), o.ax * Math.sign(b), 0, p.sh) : lightI(0, 0, 1, p.sh);
    return o.color(I, a, b, p.x, p.y, side);
  }
}

// ───────────────────────────── Arcade (aqueduct) ─────────────────────────────

export interface ArcadeOpts {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  /** param range of this piece (0..1 along A→B) */
  f0: number;
  f1: number;
  half: number;
  base: number;
  height: number;
  owner: number;
  /** total length of the whole aqueduct (tiles) and this run's offset along it, for continuous arch rhythm */
  off: number;
  mat: MatId;
}

/** Two-tier arcade with see-through arches (Valens aqueduct). */
export class Arcade implements Prim {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  zTop: number;
  owner: number;
  private dx: number;
  private dy: number;
  private len: number;
  constructor(public o: ArcadeOpts) {
    this.owner = o.owner;
    const dx = o.bx - o.ax;
    const dy = o.by - o.ay;
    this.len = Math.hypot(dx, dy) || 1;
    this.dx = dx / this.len;
    this.dy = dy / this.len;
    const p0x = o.ax + dx * o.f0;
    const p0y = o.ay + dy * o.f0;
    const p1x = o.ax + dx * o.f1;
    const p1y = o.ay + dy * o.f1;
    this.x0 = Math.min(p0x, p1x) - o.half - 0.05;
    this.x1 = Math.max(p0x, p1x) + o.half + 0.05;
    this.y0 = Math.min(p0y, p1y) - o.half - 0.05;
    this.y1 = Math.max(p0y, p1y) + o.half + 0.05;
    this.zTop = o.base + o.height + 3;
  }
  private local(tx: number, ty: number): [number, number] {
    const rx = tx - this.o.ax;
    const ry = ty - this.o.ay;
    return [(rx * this.dx + ry * this.dy) / this.len, -rx * this.dy + ry * this.dx];
  }
  h(tx: number, ty: number): number {
    const [f, b] = this.local(tx, ty);
    if (f < this.o.f0 || f >= this.o.f1 || Math.abs(b) > this.o.half) return NONE;
    // small coping lip on top
    const u = (f * this.len + this.o.off) * HPX;
    return this.o.base + this.o.height + (frac(u / 6) < 0.18 ? 1 : 0);
  }
  private arch(u: number, zr: number): boolean {
    const H = this.o.height;
    // lower tier: tall arches on piers
    const P1 = 9;
    const c1 = frac(u / P1) * P1 - P1 / 2;
    const w1 = 2.6;
    const h1 = H * 0.5;
    if (Math.abs(c1) < w1 && zr < h1 - w1 + Math.sqrt(Math.max(0, w1 * w1 - c1 * c1)) && zr > 0.5) return true;
    // upper tier: smaller arches
    const c2 = frac((u + P1 / 2) / P1) * P1 - P1 / 2;
    const w2 = 2;
    const z0 = H * 0.6;
    const h2 = H * 0.9;
    if (Math.abs(c2) < w2 && zr > z0 && zr < h2 - w2 + Math.sqrt(Math.max(0, w2 * w2 - c2 * c2))) return true;
    return false;
  }
  cut(tx: number, ty: number, z: number): boolean {
    const [f] = this.local(tx, ty);
    const u = (f * this.len + this.o.off) * HPX;
    return this.arch(u, z - this.o.base);
  }
  shade(p: ShadeIn): number {
    const [f, b] = this.local(p.tx, p.ty);
    const zr = p.z - this.o.base;
    const u = (f * this.len + this.o.off) * HPX;
    if (GLOW.on) return 0;
    if (p.top || zr >= this.o.height - 0.3) {
      const I = lightI(0, 0, 1, p.sh);
      return pick(RAMP.grass, 2 + I * 3 + (h3(Math.floor(u), 3, 3) < 0.5 ? -1 : 0), p.x, p.y);
    }
    const sgn = b < 0 ? -1 : 1;
    const nx = -this.dy * sgn;
    const ny = this.dx * sgn;
    const I = lightI(nx, ny, 0, p.sh);
    // inside of arches seen through the thickness: darker soffit
    const inner = this.arch(u + 0.8, zr) || this.arch(u - 0.8, zr) || this.arch(u, zr + 1);
    const col = faceColor(this.o.mat, I, u, zr, p.x, p.y, this.o.height);
    return inner ? mix(col, OUTLINE[1], 0.35) : col;
  }
}

export { bayer };
