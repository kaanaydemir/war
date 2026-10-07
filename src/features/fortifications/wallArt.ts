import { WORLD_ORIGIN_X, WORLD_ORIGIN_Y } from '../../core/constants';
import { hash2 } from '../../core/rng';
import type { SectionId } from '../../core/state';
import { SECTION_BY_ID } from '../../data/sections';
import { GATES, LINES, TOWERS, WATER_T, pointInPoly, nearestOnLine, offsetAt, outwardAt, pointAt, sectionOnLine, tangentAt, type GateSpec, type Line, type LineId, type TowerSpec } from './geom';
import { Box, Cyl, Mound, Poly, RAMP, Slab, WallRun, type MatId, type Wear } from './prims';
import { pick, projBounds, renderScene, Scene, SHADOW_K, SHX, SHY, type Prim, type RenderOut } from './raster';

/**
 * WALL SYSTEM (pure): cuts every wall line into y-sortable pieces (towers kept
 * whole), turns the per-piece damage level into geometry and renders pieces.
 *
 * Wall cross-section (tiles, n + = outside):
 *   land double wall:  inner wall n −0.30…−0.10 (20 px) · towers to +0.15 (30–34 px)
 *                      peribolos −0.10…0.34 · outer wall 0.34…0.44 (12 px) · outer towers 0.36…0.64
 *                      moat 0.8…2.4 (carved by the world terrain)
 *   Blachernae:        single thick wall −0.32…−0.08 (23 px), heavy towers (36 px)
 *   sea walls:         single wall −0.14…0.04 (15 px), towers (24 px)
 *   Galata:            Genoese wall (14 px), towers (21 px)
 */

export type Layer = 'ic' | 'dis';

export interface PieceDef {
  idx: number;
  key: string;
  line: LineId;
  layer: Layer;
  t0: number;
  t1: number;
  sec: SectionId | null;
  towers: TowerSpec[];
  gates: GateSpec[];
  /** absolute ground z (px) of the piece base */
  base: number;
  /** wall top z (absolute px) — defenders stand here */
  walkZ: number;
  /** n of the wall-walk centre */
  walkN: number;
  /** texture rect in world px */
  ox: number;
  oy: number;
  w: number;
  h: number;
  depth: number;
  /** world px of the piece centre at the wall base */
  wx: number;
  wy: number;
  single: boolean;
}

export interface PieceDamage {
  level: number;
  /** collapsed towers (by TowerSpec reference) */
  collapsed: Set<TowerSpec>;
}

export interface DecalDef {
  idx: number;
  key: string;
  piece: PieceDef;
  ox: number;
  oy: number;
  w: number;
  h: number;
}

const OX = WORLD_ORIGIN_X;
const OY = WORLD_ORIGIN_Y + 8;

export interface Band {
  n0: number;
  n1: number;
  H: number;
  mat: MatId;
  towerH: number;
}

export function isDouble(line: LineId, t: number): boolean {
  if (line !== 'kara') return false;
  const sec = sectionOnLine('kara', t);
  return !!(sec && SECTION_BY_ID[sec]?.moat);
}

export function bandFor(line: LineId, layer: Layer, t: number): Band {
  if (line === 'kara') {
    if (layer === 'dis') return { n0: 0.34, n1: 0.44, H: 12, mat: 'sur', towerH: 18 };
    if (isDouble(line, t)) return { n0: -0.3, n1: -0.1, H: 20, mat: 'sur', towerH: 34 };
    return { n0: -0.32, n1: -0.08, H: 23, mat: 'blaherna', towerH: 37 };
  }
  if (line === 'deniz') return { n0: -0.14, n1: 0.04, H: 15, mat: 'deniz', towerH: 26 };
  return { n0: -0.1, n1: 0.06, H: 14, mat: 'galata', towerH: 22 };
}

/** Ground height cache (abs px) over the whole map, 4 samples per tile, bilinear. */
export class GroundCache {
  private res = 4;
  private data: Float32Array;
  private W: number;
  private H: number;
  constructor(
    private heightAt: (tx: number, ty: number) => number,
    w: number,
    h: number,
  ) {
    this.W = w * this.res + 2;
    this.H = h * this.res + 2;
    this.data = new Float32Array(this.W * this.H);
    this.data.fill(NaN);
  }
  private at(ix: number, iy: number): number {
    if (ix < 0) ix = 0;
    if (iy < 0) iy = 0;
    if (ix >= this.W) ix = this.W - 1;
    if (iy >= this.H) iy = this.H - 1;
    const k = iy * this.W + ix;
    let v = this.data[k];
    if (v !== v) {
      v = this.heightAt(ix / this.res, iy / this.res) * 4;
      this.data[k] = v;
    }
    return v;
  }
  get(tx: number, ty: number): number {
    const fx = tx * this.res;
    const fy = ty * this.res;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const ax = fx - ix;
    const ay = fy - iy;
    const a = this.at(ix, iy) + (this.at(ix + 1, iy) - this.at(ix, iy)) * ax;
    const b = this.at(ix, iy + 1) + (this.at(ix + 1, iy + 1) - this.at(ix, iy + 1)) * ax;
    return a + (b - a) * ay;
  }
}

function towerHalf(tw: TowerSpec): number {
  switch (tw.kind) {
    case 'kapi':
      return 0.28;
    case 'buyuk':
      return 0.32;
    case 'mermer':
      return 0.36;
    case 'cokgen':
      return 0.29;
    case 'dis':
      return 0.16;
    default:
      return tw.line === 'deniz' ? 0.22 : tw.line === 'galata' ? 0.17 : 0.26;
  }
}

/** Cut lines into pieces. */
export function layoutPieces(ground: (tx: number, ty: number) => number): PieceDef[] {
  const out: PieceDef[] = [];
  for (const lineId of ['kara', 'deniz', 'galata'] as LineId[]) {
    const line = LINES[lineId];
    for (const layer of (lineId === 'kara' ? ['ic', 'dis'] : ['ic']) as Layer[]) {
      const towers = TOWERS.filter((t) => t.line === lineId && (layer === 'dis' ? t.kind === 'dis' : t.kind !== 'dis'));
      // breakpoints: tower extents, section boundaries
      const cuts: number[] = [0, line.len];
      for (const tw of towers) {
        const hw = towerHalf(tw) + 0.03;
        cuts.push(tw.t - hw, tw.t + hw);
      }
      if (lineId !== 'galata') {
        for (let t = 0.5; t < line.len; t += 0.5) {
          const a = sectionOnLine(lineId, t - 0.25);
          const b = sectionOnLine(lineId, t + 0.25);
          if (a !== b) {
            // refine the boundary
            let lo = t - 0.25;
            let hi = t + 0.25;
            for (let k = 0; k < 20; k++) {
              const m = (lo + hi) / 2;
              if (sectionOnLine(lineId, m) === a) lo = m;
              else hi = m;
            }
            cuts.push((lo + hi) / 2);
          }
        }
      }
      cuts.sort((a, b) => a - b);
      const uniq: number[] = [];
      for (const c of cuts) if (c >= 0 && c <= line.len && (uniq.length === 0 || c - uniq[uniq.length - 1] > 0.02)) uniq.push(c);
      for (let i = 0; i + 1 < uniq.length; i++) {
        const a = uniq[i];
        const b = uniq[i + 1];
        const inTower = towers.find((tw) => tw.t > a && tw.t < b && b - a < towerHalf(tw) * 2 + 0.1);
        const n = inTower ? 1 : Math.max(1, Math.ceil((b - a) / 1.05));
        for (let k = 0; k < n; k++) {
          const t0 = a + ((b - a) * k) / n;
          const t1 = a + ((b - a) * (k + 1)) / n;
          if (layer === 'dis' && !isDouble(lineId, (t0 + t1) / 2)) continue;
          // Galata's polygon is approximate: no wall stretches standing in the water
          if (lineId === 'galata') {
            const mp = offsetAt(line, (t0 + t1) / 2, 0);
            if (pointInPoly(mp.tx, mp.ty, WATER_T)) continue;
          }
          const tm = (t0 + t1) / 2;
          const band = bandFor(lineId, layer, tm);
          const nm = (band.n0 + band.n1) / 2;
          const c = offsetAt(line, tm, nm);
          const base = Math.round(ground(c.tx, c.ty));
          const sec = lineId === 'galata' ? null : sectionOnLine(lineId, tm);
          out.push({
            idx: out.length,
            key: `fort/p/${lineId}-${layer}-${out.length}`,
            line: lineId,
            layer,
            t0,
            t1,
            sec,
            towers: towers.filter((tw) => tw.t >= t0 && tw.t < t1),
            gates: GATES.filter((g) => g.line === lineId && g.t > t0 - 0.6 && g.t < t1 + 0.6),
            base,
            walkZ: base + band.H,
            walkN: nm,
            ox: 0,
            oy: 0,
            w: 1,
            h: 1,
            depth: 0,
            wx: OX + (c.tx - c.ty) * 16,
            wy: OY + (c.tx + c.ty) * 8 - base,
            single: lineId !== 'kara' || !isDouble(lineId, tm),
          });
        }
      }
    }
  }
  // depth: wall-base centre (inner pieces sort by the wall face nearest to the viewer)
  for (const p of out) {
    const line = LINES[p.line];
    const tm = (p.t0 + p.t1) / 2;
    const band = bandFor(p.line, p.layer, tm);
    let best = -Infinity;
    for (const n of [band.n0, band.n1]) {
      const q = offsetAt(line, tm, n);
      best = Math.max(best, OY + (q.tx + q.ty) * 8 - p.base);
    }
    p.depth = best;
  }
  return out;
}

// ───────────────────────────── damage → geometry ─────────────────────────────

const smooth = (x: number) => x * x * (3 - 2 * x);

/** Height profile of a damaged wall run (1 = intact). */
function profileFor(level: number, t0: number, t1: number, seed: number): ((t: number) => number) | undefined {
  if (level < 3) return undefined;
  const len = t1 - t0;
  if (level === 3) {
    // crumbled stretches of the top
    const c = t0 + len * (0.25 + hash2(seed, 1, 5) * 0.5);
    const w = Math.max(0.12, len * 0.22);
    const depth = 0.18 + hash2(seed, 2, 5) * 0.12;
    return (t) => {
      const d = Math.abs(t - c) / w;
      if (d >= 1) return 1;
      const step = Math.floor(((t - c) * 20) / 2);
      return 1 - depth * smooth(1 - d) * (0.75 + hash2(step, 4, seed) * 0.5);
    };
  }
  // breach gap
  const c = t0 + len * (0.35 + hash2(seed, 3, 5) * 0.3);
  const w = Math.max(0.24, len * 0.36);
  const low = 0.1 + hash2(seed, 4, 5) * 0.12;
  return (t) => {
    const d = Math.abs(t - c);
    if (d > w + 0.14) return 1;
    if (d < w) {
      const step = Math.floor(t * 10);
      return low + hash2(step, 6, seed) * 0.08;
    }
    // jagged broken edge (stepped in 2-px courses)
    const e = (d - w) / 0.14;
    const q = Math.floor(e * 4) / 4;
    return low + (1 - low) * smooth(q) * (0.85 + hash2(Math.floor(t * 40), 7, seed) * 0.15);
  };
}

export function gapCenter(p: PieceDef, level: number): { t: number; w: number } | null {
  if (level < 4) return null;
  const seed = p.idx * 7 + 3;
  const len = p.t1 - p.t0;
  return { t: p.t0 + len * (0.35 + hash2(seed, 3, 5) * 0.3), w: Math.max(0.24, len * 0.36) };
}

const MERLON_LOSS = [0, 0.15, 0.42, 0.75, 0.9];

/** All prims of a piece for its damage. Owner = piece index. */
export function piecePrims(p: PieceDef, dmg: PieceDamage, fallen: boolean): Prim[] {
  const out: Prim[] = [];
  const line = LINES[p.line];
  const tm = (p.t0 + p.t1) / 2;
  const band = bandFor(p.line, p.layer, tm);
  const seed = p.idx * 7 + 3;
  const lvl = dmg.level;
  const wear: Wear = { level: lvl, seed: seed + 11 };
  const gates = p.gates
    .filter((g) => g.kind !== 'kucuk' || p.layer === 'ic')
    .map((g) => ({
      t: g.t,
      hw: g.kind === 'altin' ? 7 : g.kind === 'deniz' ? 2.2 : g.kind === 'kucuk' ? 1.8 : p.layer === 'dis' ? 2.4 : 3,
      hh: g.kind === 'altin' ? 16 : g.kind === 'deniz' ? 6 : g.kind === 'kucuk' ? 5 : p.layer === 'dis' ? 6 : 9,
      marble: g.kind === 'altin',
      triple: g.kind === 'altin',
    }));
  // the Golden Gate is a marble triumphal arch: taller and brighter between its pylons
  const golden = p.gates.find((g) => g.kind === 'altin' && Math.abs(g.t - tm) < 0.5 && p.layer === 'ic');
  out.push(
    new WallRun({
      line,
      t0: p.t0,
      t1: p.t1,
      n0: band.n0,
      n1: band.n1,
      base: p.base,
      height: golden ? 24 : band.H,
      mat: golden ? 'mermer' : band.mat,
      owner: p.idx,
      parapet: p.line === 'deniz' ? 'out' : 'out',
      wear,
      profile: profileFor(lvl, p.t0, p.t1, seed),
      merlonLoss: MERLON_LOSS[Math.min(4, lvl)],
      gates,
    }),
  );
  // towers
  for (const tw of p.towers) {
    const c = offsetAt(line, tw.t, 0);
    const tan = tangentAt(line, tw.t, 0.2);
    const on = outwardAt(line, tw.t);
    const hw = towerHalf(tw);
    let nC: number;
    if (tw.kind === 'dis') nC = 0.5;
    else if (p.line === 'kara') nC = isDouble('kara', tw.t) ? -0.06 : -0.05;
    else nC = p.line === 'deniz' ? 0.03 : 0;
    const cx = c.tx + on.nx * nC;
    const cy = c.ty + on.ny * nC;
    const collapsed = dmg.collapsed.has(tw) || (tw.kind === 'dis' && lvl >= 4 && hash2(p.idx, 9, 9) < 0.7);
    const H = tw.kind === 'dis' ? 18 : tw.kind === 'buyuk' ? band.towerH + 4 : tw.kind === 'mermer' ? 32 : tw.kind === 'kapi' ? band.towerH + 3 : band.towerH;
    const tWear: Wear = { level: Math.min(4, lvl + (collapsed ? 1 : 0)), seed: seed + Math.round(tw.t * 10) };
    const tseed = Math.round(tw.t * 97);
    const ruin = collapsed ? 0.38 + hash2(tseed, 1, 1) * 0.15 : undefined;
    if (tw.kind === 'cokgen') {
      out.push(
        new Poly({
          cx,
          cy,
          r: hw,
          sides: 8,
          rot: Math.atan2(on.ny, on.nx) + Math.PI / 8,
          base: p.base,
          height: H,
          top: ruin != null ? 'ruin' : 'merlon',
          mat: band.mat,
          owner: p.idx,
          wear: tWear,
          ruin,
          seed: tseed,
          windows: 'kule',
        }),
      );
    } else if (p.line === 'galata' && hash2(tseed, 5, 5) < 0.35) {
      out.push(new Cyl({ cx, cy, r: hw, base: p.base, height: H, top: 'merlon', mat: band.mat, owner: p.idx, wear: tWear, windows: 'kule', ruin, seed: tseed }));
    } else {
      out.push(
        new Box({
          cx,
          cy,
          ax: tan.dx,
          ay: tan.dy,
          ha: hw,
          hb: hw * (tw.kind === 'kapi' ? 1.05 : 1),
          base: p.base,
          height: H,
          roof: ruin != null ? 'ruin' : 'merlon',
          mat: tw.kind === 'mermer' ? 'mermer' : band.mat,
          owner: p.idx,
          wear: tWear,
          windows: 'kule',
          ruin,
          seed: tseed,
        }),
      );
    }
    if (collapsed) {
      // rubble cone around the stump, spilling outward
      const ox = on.nx * 0.25;
      const oy = on.ny * 0.25;
      out.push(new Mound({ ax: cx - ox, ay: cy - oy, bx: cx + ox * 2, by: cy + oy * 2, r: hw * 1.5, base: p.base, height: 7, owner: p.idx, seed: tseed + 3, kind: 'moloz' }));
    }
  }
  // rubble at the foot of damaged stretches
  if (lvl >= 3) {
    const gc = gapCenter(p, lvl);
    if (gc) {
      const a = offsetAt(line, gc.t, band.n0 - (p.layer === 'dis' ? 0.25 : 0.45));
      const b = offsetAt(line, gc.t, band.n1 + (p.layer === 'dis' ? 0.4 : 0.3));
      out.push(new Mound({ ax: a.tx, ay: a.ty, bx: b.tx, by: b.ty, r: Math.min(0.5, gc.w * 1.15), base: p.base, height: band.H * 0.3, owner: p.idx, seed: seed + 5, kind: 'moloz' }));
      // a long low bank of fallen masonry along the foot of the breach (joins neighbouring gaps)
      const nm = (band.n0 + band.n1) / 2 + 0.12;
      const c0 = offsetAt(line, Math.max(p.t0, gc.t - gc.w * 1.4), nm);
      const c1 = offsetAt(line, Math.min(p.t1, gc.t + gc.w * 1.4), nm);
      out.push(new Mound({ ax: c0.tx, ay: c0.ty, bx: c1.tx, by: c1.ty, r: 0.34, base: p.base, height: band.H * 0.18, owner: p.idx, seed: seed + 15, kind: 'moloz' }));
    } else {
      const t = p.t0 + (p.t1 - p.t0) * (0.3 + hash2(seed, 8, 2) * 0.4);
      for (const side of [-1, 1]) {
        const n = side < 0 ? band.n0 - 0.1 : band.n1 + 0.1;
        const a = offsetAt(line, t - 0.15, n);
        const b = offsetAt(line, t + 0.15, n);
        out.push(new Mound({ ax: a.tx, ay: a.ty, bx: b.tx, by: b.ty, r: 0.13, base: p.base, height: 3.5, owner: p.idx, seed: seed + 6 + side, kind: 'moloz' }));
      }
    }
  }
  void fallen;
  return out;
}

/** Ground-level decal prims (peribolos terrace, moat fill, debris) for an outer piece. */
export function decalPrims(p: PieceDef, level: number, moatFill: number, ground: (tx: number, ty: number) => number): Prim[] {
  const out: Prim[] = [];
  const line = LINES[p.line];
  const tm = (p.t0 + p.t1) / 2;
  const tan = tangentAt(line, tm, 0.3);
  const len = p.t1 - p.t0;
  // peribolos terrace between the walls (packed earth, grass, a worn path)
  {
    const c = offsetAt(line, tm, 0.12);
    out.push(
      new Slab({
        cx: c.tx,
        cy: c.ty,
        ax: tan.dx,
        ay: tan.dy,
        ha: len / 2 + 0.02,
        hb: 0.23,
        base: Math.round(ground(c.tx, c.ty)),
        height: 1,
        owner: p.idx,
        noShadow: true,
        color: (I, a, b, x, y, side) => {
          if (side) return pick(RAMP.dirt, 1 + I * 3, x, y);
          const path = Math.abs(b + Math.sin(a * 3 + p.idx) * 0.04) < 0.05;
          const grass = hash2(Math.floor(a * 20 + 400), Math.floor(b * 20 + 400), 3) < 0.4 - level * 0.07;
          if (path) return pick(RAMP.dirt, 3.4 + I * 1.6, x, y);
          if (grass) return pick(RAMP.grass, 2.4 + I * 2.4, x, y);
          return pick(RAMP.dirt, 2.4 + I * 2.2, x, y);
        },
      }),
    );
  }
  // moat fill: patches of earth & fascines in the ditch, more where the bombardment fell
  if (moatFill > 0.02) {
    const n = Math.max(1, Math.round(len * 2));
    for (let k = 0; k < n; k++) {
      const tt = p.t0 + ((k + 0.5) / n) * len;
      const local = moatFill * (1.25 - hash2(p.idx, k, 21) * 0.6);
      if (local < 0.15) continue;
      const span = Math.min(0.75, local) ;
      const nA = 0.95;
      const nB = 0.95 + 1.3 * Math.min(1, local);
      const a = offsetAt(line, tt, nA);
      const b = offsetAt(line, tt, nB);
      const g = Math.min(ground(a.tx, a.ty), ground(b.tx, b.ty), ground((a.tx + b.tx) / 2, (a.ty + b.ty) / 2));
      out.push(
        new Mound({
          ax: a.tx,
          ay: a.ty,
          bx: b.tx,
          by: b.ty,
          r: 0.22 + span * 0.25,
          base: g - 1,
          height: 2 + local * 3.5,
          owner: p.idx,
          seed: p.idx * 13 + k,
          kind: hash2(p.idx, k, 23) < 0.45 ? 'cali' : 'toprak',
        }),
      );
    }
  }
  // stone chips scattered in the peribolos / parateichion below a damaged wall
  if (level >= 2) {
    const nn = level * 3;
    for (let k = 0; k < nn; k++) {
      const tt = p.t0 + hash2(p.idx, k, 31) * len;
      const nb = -0.05 + hash2(p.idx, k, 32) * 0.75;
      const c = offsetAt(line, tt, nb);
      out.push(new Mound({ ax: c.tx, ay: c.ty, bx: c.tx + 0.02, by: c.ty + 0.01, r: 0.05 + hash2(p.idx, k, 33) * 0.05, base: Math.round(ground(c.tx, c.ty)), height: 1.5, owner: p.idx, seed: p.idx * 17 + k, kind: 'moloz' }));
    }
  }
  return out;
}

// ───────────────────────────── rendering ─────────────────────────────

/** Texture rect of a piece from its prims + shadow reach + owned ground band. */
export function pieceRect(p: PieceDef, prims: Prim[], groundLo: number): { ox: number; oy: number; w: number; h: number } {
  let l = Infinity;
  let t = Infinity;
  let r = -Infinity;
  let b = -Infinity;
  for (const pr of prims) {
    if (pr.owner !== p.idx) continue;
    const pb = projBounds(pr.x0, pr.y0, pr.x1, pr.y1, groundLo - 6, pr.zTop);
    l = Math.min(l, pb.l);
    t = Math.min(t, pb.t);
    r = Math.max(r, pb.r);
    b = Math.max(b, pb.b);
    // shadow reach (toward the lower-right)
    const reach = (pr.zTop - p.base) * SHADOW_K;
    const sb = projBounds(pr.x0 + SHX * reach, pr.y0 + SHY * reach, pr.x1 + SHX * reach, pr.y1 + SHY * reach, groundLo - 6, groundLo);
    r = Math.max(r, sb.r);
    b = Math.max(b, sb.b);
    t = Math.min(t, sb.t);
    l = Math.min(l, sb.l);
  }
  if (!isFinite(l)) return { ox: 0, oy: 0, w: 1, h: 1 };
  const ox = Math.floor(OX + l) - 2;
  const oy = Math.floor(OY + t) - 2;
  return { ox, oy, w: Math.ceil(OX + r) - ox + 3, h: Math.ceil(OY + b) - oy + 3 };
}

/** Which ground points this piece draws cast shadows on (partition by t and layer band). */
export function groundOwner(p: PieceDef): (tx: number, ty: number) => boolean {
  const line = LINES[p.line];
  let sf = 0;
  while (sf < line.pts.length - 2 && line.cum[sf + 1] < p.t0) sf++;
  let st = sf;
  while (st < line.pts.length - 2 && line.cum[st + 1] < p.t1) st++;
  sf = Math.max(0, sf - 2);
  st = Math.min(line.pts.length - 2, st + 2);
  const split = 0.25;
  return (tx, ty) => {
    const q = nearestOnLine(line, tx, ty, sf, st);
    if (q.t < p.t0 || q.t >= p.t1) {
      // ends of the line belong to the end pieces
      if (!((q.t <= 0.0001 && p.t0 <= 0.0001) || (q.t >= line.len - 0.0001 && p.t1 >= line.len - 0.0001))) return false;
    }
    if (q.dist > 2.2) return false;
    if (p.line === 'kara' && !p.single) return p.layer === 'dis' ? q.n >= split : q.n < split;
    return true;
  };
}

export function renderPiece(scene: Scene, p: PieceDef, ground: (tx: number, ty: number) => number): RenderOut {
  return renderScene(scene, {
    w: p.w,
    h: p.h,
    px0: OX - p.ox,
    py0: OY - p.oy,
    own: (pr) => pr.owner === p.idx,
    ground,
    groundShadow: groundOwner(p),
    shadowAlpha: 0.42,
    skirt: 2,
  });
}

/** Line point → world px (helper shared by render). */
export function lineWorld(line: Line, t: number, n: number, z: number): { x: number; y: number } {
  const q = offsetAt(line, t, n);
  return { x: OX + (q.tx - q.ty) * 16, y: OY + (q.tx + q.ty) * 8 - z };
}

export function tileWorld(tx: number, ty: number, z: number): { x: number; y: number } {
  return { x: OX + (tx - ty) * 16, y: OY + (tx + ty) * 8 - z };
}

export { pointAt, OX as PROJ_OX, OY as PROJ_OY };
