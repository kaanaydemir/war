import type { TilePt } from '../../core/iso';
import { hash2 } from '../../core/rng';
import type { SectionId } from '../../core/state';
import { GALATA_WALLS, LAND_WALLS, WATER, geoPolyToTiles, geoToTile, type LatLon } from '../../data/geography';
import { SECTIONS, SECTION_BY_ID } from '../../data/sections';

/**
 * Pure wall-line geometry (no Phaser). Every wall of the game is described in
 * "wall coordinates" along a polyline: t = arc length (tiles) from the line start,
 * n = signed perpendicular offset (tiles, + = OUTSIDE / attacker side).
 *
 *  - LINE 'kara'   : the Theodosian + Blachernae land walls (data/geography LAND_WALLS), N → S.
 *  - LINE 'deniz'  : the sea walls, Ayvansaray → Golden Horn → Sarayburnu → Marmara → Mermer Kule,
 *                    following the WATER coastline, set back a little inland.
 *  - LINE 'galata' : the Genoese walls of Galata (closed ring).
 */

export type LineId = 'kara' | 'deniz' | 'galata';

export interface Line {
  id: LineId;
  pts: TilePt[];
  /** Cumulative arc length at each vertex. */
  cum: number[];
  len: number;
  /** Multiply the LEFT normal (dy,−dx) by `side` to get the outward normal. */
  side: 1 | -1;
  closed: boolean;
}

export interface LinePos {
  t: number;
  /** Signed offset, + = outside. */
  n: number;
  dist: number;
  seg: number;
}

/** How far the sea-wall line is set back inland from the WATER polygon edge (tiles). */
export const SEA_INSET = 0.62;

function makeLine(id: LineId, pts: TilePt[], side: 1 | -1, closed = false): Line {
  const p = closed ? [...pts, pts[0]] : pts.slice();
  const cum = [0];
  for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i].tx - p[i - 1].tx, p[i].ty - p[i - 1].ty));
  return { id, pts: p, cum, len: cum[cum.length - 1], side, closed };
}

/** Nearest point on the line. `segFrom/segTo` restrict the search (inclusive segment indices). */
export function nearestOnLine(line: Line, tx: number, ty: number, segFrom = 0, segTo = line.pts.length - 2): LinePos {
  return nearestInto(line, tx, ty, segFrom, segTo, { t: 0, n: 0, dist: 0, seg: 0 });
}

/** Allocation-free variant writing into `out`. */
export function nearestInto(line: Line, tx: number, ty: number, segFrom: number, segTo: number, out: LinePos): LinePos {
  let best = Infinity;
  let bt = 0;
  let bn = 0;
  let bs = 0;
  const p = line.pts;
  for (let i = Math.max(0, segFrom); i <= Math.min(p.length - 2, segTo); i++) {
    const a = p[i];
    const b = p[i + 1];
    const dx = b.tx - a.tx;
    const dy = b.ty - a.ty;
    const l2 = dx * dx + dy * dy || 1e-9;
    let f = ((tx - a.tx) * dx + (ty - a.ty) * dy) / l2;
    f = f < 0 ? 0 : f > 1 ? 1 : f;
    const qx = a.tx + dx * f;
    const qy = a.ty + dy * f;
    const d = Math.hypot(tx - qx, ty - qy);
    if (d < best) {
      best = d;
      const l = Math.sqrt(l2);
      bt = line.cum[i] + f * l;
      // left normal (dy, -dx)/l ; signed distance
      const sn = ((tx - qx) * dy - (ty - qy) * dx) / l;
      bn = sn * line.side;
      bs = i;
    }
  }
  out.t = bt;
  out.n = bn;
  out.dist = best;
  out.seg = bs;
  return out;
}

/** Segment index containing arc length t. */
export function segAt(line: Line, t: number): number {
  const c = line.cum;
  if (t <= 0) return 0;
  if (t >= line.len) return c.length - 2;
  let lo = 0;
  let hi = c.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (c[m] <= t) lo = m;
    else hi = m;
  }
  return Math.min(lo, c.length - 2);
}

export function pointAt(line: Line, t: number): TilePt {
  const i = segAt(line, t);
  const a = line.pts[i];
  const b = line.pts[i + 1];
  const l = line.cum[i + 1] - line.cum[i] || 1e-9;
  const f = Math.max(0, Math.min(1, (t - line.cum[i]) / l));
  return { tx: a.tx + (b.tx - a.tx) * f, ty: a.ty + (b.ty - a.ty) * f };
}

/** Unit tangent at t (direction of increasing t). Smoothed across vertices within `blend` tiles. */
export function tangentAt(line: Line, t: number, blend = 0.35): { dx: number; dy: number } {
  const a = pointAt(line, Math.max(0, t - blend));
  const b = pointAt(line, Math.min(line.len, t + blend));
  let dx = b.tx - a.tx;
  let dy = b.ty - a.ty;
  const l = Math.hypot(dx, dy) || 1;
  dx /= l;
  dy /= l;
  return { dx, dy };
}

/** Unit outward normal at t. */
export function outwardAt(line: Line, t: number): { nx: number; ny: number } {
  const d = tangentAt(line, t);
  return { nx: d.dy * line.side, ny: -d.dx * line.side };
}

/** Point at arc length t, offset by n (tiles, + outward). */
export function offsetAt(line: Line, t: number, n: number): TilePt {
  const p = pointAt(line, t);
  const o = outwardAt(line, t);
  return { tx: p.tx + o.nx * n, ty: p.ty + o.ny * n };
}

/** Sub-polyline between arc lengths t0 < t1 (includes interior vertices). */
export function subPath(line: Line, t0: number, t1: number): TilePt[] {
  const out: TilePt[] = [pointAt(line, t0)];
  for (let i = 0; i < line.pts.length; i++) {
    if (line.cum[i] > t0 + 1e-6 && line.cum[i] < t1 - 1e-6) out.push({ ...line.pts[i] });
  }
  out.push(pointAt(line, t1));
  return out;
}

function pointInPoly(x: number, y: number, poly: TilePt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.ty > y !== b.ty > y && x < ((b.tx - a.tx) * (y - a.ty)) / (b.ty - a.ty) + a.tx) inside = !inside;
  }
  return inside;
}

/** Offset an open polyline by `d` along its left normal (miter joins, clamped). */
function offsetPolyline(pts: TilePt[], d: number): TilePt[] {
  const out: TilePt[] = [];
  const n = pts.length;
  const segN = (i: number) => {
    const a = pts[i];
    const b = pts[i + 1];
    const l = Math.hypot(b.tx - a.tx, b.ty - a.ty) || 1;
    return { x: (b.ty - a.ty) / l, y: -(b.tx - a.tx) / l };
  };
  for (let i = 0; i < n; i++) {
    let nx: number;
    let ny: number;
    if (i === 0) ({ x: nx, y: ny } = segN(0));
    else if (i === n - 1) ({ x: nx, y: ny } = segN(n - 2));
    else {
      const a = segN(i - 1);
      const b = segN(i);
      nx = a.x + b.x;
      ny = a.y + b.y;
      const l = Math.hypot(nx, ny) || 1;
      nx /= l;
      ny /= l;
      const cos = Math.max(0.5, nx * b.x + ny * b.y);
      nx /= cos;
      ny /= cos;
    }
    out.push({ tx: pts[i].tx + nx * d, ty: pts[i].ty + ny * d });
  }
  return out;
}

/** Chaikin smoothing (keeps the end points). */
function smooth(pts: TilePt[], iters: number): TilePt[] {
  let p = pts;
  for (let k = 0; k < iters; k++) {
    const q: TilePt[] = [p[0]];
    for (let i = 0; i + 1 < p.length; i++) {
      const a = p[i];
      const b = p[i + 1];
      if (i > 0) q.push({ tx: a.tx * 0.75 + b.tx * 0.25, ty: a.ty * 0.75 + b.ty * 0.25 });
      if (i + 2 < p.length) q.push({ tx: a.tx * 0.25 + b.tx * 0.75, ty: a.ty * 0.25 + b.ty * 0.75 });
    }
    q.push(p[p.length - 1]);
    p = q;
  }
  return p;
}

// ───────────────────────────── the three lines ─────────────────────────────

const WATER_T = geoPolyToTiles(WATER);

/** WATER vertex index nearest to a lat/lon. */
function waterIndex(ll: LatLon): number {
  const t = geoToTile(ll[0], ll[1]);
  let bi = 0;
  let bd = Infinity;
  for (let i = 0; i < WATER_T.length; i++) {
    const d = Math.hypot(WATER_T[i].tx - t.tx, WATER_T[i].ty - t.ty);
    if (d < bd) {
      bd = d;
      bi = i;
    }
  }
  return bi;
}

function buildSeaLine(): Line {
  // Ayvansaray (Golden Horn) → … → Sarayburnu → … → Mermer Kule. WATER is traced the other way.
  const i0 = waterIndex([41.043, 28.944]);
  const i1 = waterIndex([40.9925, 28.9228]);
  const raw: TilePt[] = [];
  for (let i = i0; i >= i1; i--) raw.push({ ...WATER_T[i] });
  // water lies on the LEFT of this travel direction; walls stand inland (right).
  let pts = offsetPolyline(raw, -SEA_INSET);
  pts = smooth(pts, 2);
  // make sure the left really is water (sanity: flip the side if not)
  const mid = Math.floor(pts.length / 2);
  const a = pts[mid];
  const b = pts[mid + 1];
  const l = Math.hypot(b.tx - a.tx, b.ty - a.ty) || 1;
  const probe = { tx: a.tx + ((b.ty - a.ty) / l) * 2.5, ty: a.ty - ((b.tx - a.tx) / l) * 2.5 };
  const side: 1 | -1 = pointInPoly(probe.tx, probe.ty, WATER_T) ? 1 : -1;
  return makeLine('deniz', pts, side);
}

function buildLandLine(): Line {
  const pts = geoPolyToTiles(LAND_WALLS);
  // Outside of the land walls is WEST (−tx). Left normal of a N→S line points east → side −1.
  const a = pts[0];
  const b = pts[pts.length - 1];
  const lnx = b.ty - a.ty; // left normal x (unnormalized)
  return makeLine('kara', pts, lnx > 0 ? -1 : 1);
}

function buildGalataLine(): Line {
  const pts = geoPolyToTiles(GALATA_WALLS);
  // orientation: outward = away from the centroid
  let cx = 0;
  let cy = 0;
  for (const p of pts) {
    cx += p.tx;
    cy += p.ty;
  }
  cx /= pts.length;
  cy /= pts.length;
  const line = makeLine('galata', pts, 1, true);
  const q = nearestOnLine(line, cx, cy);
  if (q.n > 0) line.side = -1;
  return line;
}

export const LINES: Record<LineId, Line> = {
  kara: buildLandLine(),
  deniz: buildSeaLine(),
  galata: buildGalataLine(),
};

// ───────────────────────────── sections on lines ─────────────────────────────

export interface SectionSpan {
  id: SectionId;
  line: LineId;
  t0: number;
  t1: number;
}

function buildSpans(): Record<SectionId, SectionSpan> {
  const out: Record<SectionId, SectionSpan> = {};
  for (const s of SECTIONS) {
    const lineId: LineId = s.kind === 'kara' ? 'kara' : 'deniz';
    const line = LINES[lineId];
    const pa = geoToTile(s.path[0][0], s.path[0][1]);
    const pb = geoToTile(s.path[s.path.length - 1][0], s.path[s.path.length - 1][1]);
    let t0 = nearestOnLine(line, pa.tx, pa.ty).t;
    let t1 = nearestOnLine(line, pb.tx, pb.ty).t;
    if (t1 < t0) [t0, t1] = [t1, t0];
    out[s.id] = { id: s.id, line: lineId, t0, t1 };
  }
  // Snap neighbouring spans on the same line so they share their boundary exactly
  // (sea spans are projected end points and can leave hairline gaps).
  for (const lineId of ['kara', 'deniz'] as LineId[]) {
    const list = Object.values(out)
      .filter((s) => s.line === lineId)
      .sort((a, b) => a.t0 - b.t0);
    for (let i = 0; i + 1 < list.length; i++) {
      if (Math.abs(list[i].t1 - list[i + 1].t0) < 1.5) {
        const m = (list[i].t1 + list[i + 1].t0) / 2;
        list[i].t1 = m;
        list[i + 1].t0 = m;
      }
    }
  }
  return out;
}

export const SPANS: Record<SectionId, SectionSpan> = buildSpans();

/** Section owning arc length t on a line (null if none). */
export function sectionOnLine(lineId: LineId, t: number): SectionId | null {
  let best: SectionId | null = null;
  let bd = Infinity;
  for (const s of Object.values(SPANS)) {
    if (s.line !== lineId) continue;
    if (t >= s.t0 && t <= s.t1) return s.id;
    const d = t < s.t0 ? s.t0 - t : t - s.t1;
    if (d < bd) {
      bd = d;
      best = s.id;
    }
  }
  return bd < 2.5 ? best : null;
}

// ───────────────────────────── towers & gates ─────────────────────────────

export type TowerKind = 'kare' | 'cokgen' | 'kapi' | 'buyuk' | 'mermer' | 'dis';

export interface TowerSpec {
  line: LineId;
  t: number;
  kind: TowerKind;
  sectionId: SectionId | null;
  /** index within its section's tower list (or -1) */
  index: number;
}

export interface GateSpec {
  line: LineId;
  t: number;
  name: string;
  /** 'buyuk' main gate with flanking towers · 'kucuk' military gate/postern · 'altin' Golden Gate · 'deniz' sea gate */
  kind: 'buyuk' | 'kucuk' | 'altin' | 'deniz';
}

/** Named land gates at the LAND_WALLS vertices (index → gate). */
const LAND_GATES: Record<number, { name: string; kind: GateSpec['kind'] }> = {
  2: { name: 'Eğrikapı', kind: 'buyuk' },
  4: { name: 'Edirnekapı', kind: 'buyuk' },
  5: { name: 'Sulukule Kapısı', kind: 'kucuk' },
  6: { name: 'Topkapı', kind: 'buyuk' },
  7: { name: 'Mevlevihanekapı', kind: 'buyuk' },
  8: { name: 'Silivrikapı', kind: 'buyuk' },
  9: { name: 'Belgradkapı', kind: 'buyuk' },
  10: { name: 'Altınkapı', kind: 'altin' },
};

/** Sea gates (approximate positions) — Golden Horn and Marmara. */
const SEA_GATES: [string, number, number][] = [
  ['Balat Kapısı', 41.0352, 28.9488],
  ['Fener Kapısı', 41.0298, 28.952],
  ['Cibali Kapısı', 41.0245, 28.9585],
  ['Unkapanı', 41.0205, 28.9635],
  ['Odunkapı', 41.0185, 28.9695],
  ['Bahçekapı', 41.0172, 28.9755],
  ['Ahırkapı', 41.0055, 28.9832],
  ['Çatladıkapı', 41.0046, 28.9745],
  ['Kumkapı', 41.0045, 28.9655],
  ['Yenikapı', 41.002, 28.952],
  ['Davutpaşa Kapısı', 41.0003, 28.944],
  ['Samatya Kapısı', 40.998, 28.936],
  ['Narlıkapı', 40.9958, 28.93],
];

function buildGates(): GateSpec[] {
  const out: GateSpec[] = [];
  const land = LINES.kara;
  for (const [k, g] of Object.entries(LAND_GATES)) {
    const i = Number(k);
    out.push({ line: 'kara', t: land.cum[i], name: g.name, kind: g.kind });
  }
  const sea = LINES.deniz;
  for (const [name, la, lo] of SEA_GATES) {
    const p = geoToTile(la, lo);
    const q = nearestOnLine(sea, p.tx, p.ty);
    out.push({ line: 'deniz', t: q.t, name, kind: 'deniz' });
  }
  return out.sort((a, b) => (a.line === b.line ? a.t - b.t : a.line < b.line ? -1 : 1));
}

export const GATES: GateSpec[] = buildGates();

/** Tower spacing along each line (tiles). */
export const TOWER_SPACING: Record<LineId, number> = { kara: 2.25, deniz: 2.5, galata: 2.6 };

function buildTowers(): TowerSpec[] {
  const out: TowerSpec[] = [];
  for (const lineId of ['kara', 'deniz', 'galata'] as LineId[]) {
    const line = LINES[lineId];
    const gates = GATES.filter((g) => g.line === lineId && g.kind !== 'deniz');
    // gate towers
    const blocked: [number, number][] = [];
    for (const g of gates) {
      if (g.kind === 'kucuk') {
        blocked.push([g.t - 0.7, g.t + 0.7]);
        out.push({ line: lineId, t: g.t + 0.42, kind: 'kare', sectionId: null, index: -1 });
        continue;
      }
      const off = g.kind === 'altin' ? 0.62 : 0.5;
      blocked.push([g.t - off - 0.75, g.t + off + 0.75]);
      out.push({ line: lineId, t: g.t - off, kind: g.kind === 'altin' ? 'mermer' : 'kapi', sectionId: null, index: -1 });
      out.push({ line: lineId, t: g.t + off, kind: g.kind === 'altin' ? 'mermer' : 'kapi', sectionId: null, index: -1 });
    }
    // Mermer Kule & Ayvansaray end towers on the land line
    if (lineId === 'kara') {
      out.push({ line: lineId, t: line.len - 0.25, kind: 'buyuk', sectionId: null, index: -1 });
      blocked.push([line.len - 1.3, line.len + 1]);
      out.push({ line: lineId, t: 0.3, kind: 'buyuk', sectionId: null, index: -1 });
      blocked.push([-1, 1.2]);
      // Tekfur Sarayı stands at vertex 3: keep the wall plain there
      blocked.push([line.cum[3] - 0.9, line.cum[3] + 0.9]);
    }
    const sp = TOWER_SPACING[lineId];
    const start = lineId === 'galata' ? 0.6 : 0.9;
    let k = 0;
    for (let t = start; t < line.len - 0.6; t += sp) {
      const tt = t + (hash2(k, 7, lineId.length) - 0.5) * 0.25;
      k++;
      if (blocked.some(([a, b]) => tt > a && tt < b)) continue;
      let kind: TowerKind = 'kare';
      if (lineId === 'kara') {
        const sec = sectionOnLine('kara', tt);
        const def = sec ? SECTION_BY_ID[sec] : null;
        if (def && !def.moat) kind = hash2(k, 3, 11) < 0.5 ? 'buyuk' : 'kare';
        else kind = hash2(k, 5, 13) < 0.38 ? 'cokgen' : 'kare';
      }
      out.push({ line: lineId, t: tt, kind, sectionId: null, index: -1 });
    }
    // outer-wall towers (land, double-wall sections only): between inner towers
    if (lineId === 'kara') {
      const inner = out.filter((o) => o.line === 'kara').sort((a, b) => a.t - b.t);
      for (let i = 0; i + 1 < inner.length; i++) {
        const tm = (inner[i].t + inner[i + 1].t) / 2;
        if (inner[i + 1].t - inner[i].t < 1.6) continue;
        const sec = sectionOnLine('kara', tm);
        if (!sec || !SECTION_BY_ID[sec].moat) continue;
        if (gates.some((g) => Math.abs(g.t - tm) < 1.0)) continue;
        out.push({ line: 'kara', t: tm, kind: 'dis', sectionId: null, index: -1 });
      }
    }
  }
  // assign sections & per-section indices (inner towers only)
  for (const tw of out) {
    tw.sectionId = tw.line === 'galata' ? null : sectionOnLine(tw.line, tw.t);
  }
  const bySec = new Map<SectionId, TowerSpec[]>();
  for (const tw of out) {
    if (!tw.sectionId || tw.kind === 'dis') continue;
    let l = bySec.get(tw.sectionId);
    if (!l) bySec.set(tw.sectionId, (l = []));
    l.push(tw);
  }
  for (const l of bySec.values()) {
    l.sort((a, b) => a.t - b.t);
    l.forEach((tw, i) => (tw.index = i));
  }
  return out.sort((a, b) => (a.line === b.line ? a.t - b.t : a.line < b.line ? -1 : 1));
}

export const TOWERS: TowerSpec[] = buildTowers();

/** Inner (main) towers of a section in wall order. */
export function sectionTowers(id: SectionId): TowerSpec[] {
  return TOWERS.filter((t) => t.sectionId === id && t.kind !== 'dis').sort((a, b) => a.index - b.index);
}

/** Section-tower indices in the order they collapse (middle of the section first, deterministic). */
export function towerCollapseOrder(id: SectionId): number[] {
  const span = SPANS[id];
  const tw = sectionTowers(id);
  if (!span || tw.length === 0) return [];
  const mid = (span.t0 + span.t1) / 2;
  const half = Math.max(0.5, (span.t1 - span.t0) / 2);
  return tw
    .map((t) => ({ i: t.index, k: Math.abs(t.t - mid) / half + hash2(t.index, id.length, 3) * 0.35 }))
    .sort((a, b) => a.k - b.k)
    .map((o) => o.i);
}

export function sectionDef(id: SectionId) {
  return SECTION_BY_ID[id];
}

export { pointInPoly, WATER_T };
