import type { TilePt } from '../../core/iso';
import type { GameState, SectionId } from '../../core/state';
import type { WorldApi } from '../../core/world';
import { EDIRNE_ROAD, geoToTile } from '../../data/geography';
import { landmarkTile } from '../../data/landmarks';
import { SECTION_BY_ID } from '../../data/sections';
import { sectionLength, sectionOutwardNormal, sectionPoint } from '../fortifications/api';
import { WING_SECTIONS, type WingId } from './data';

/** Pure geometry helpers for the army (tile space). */

export function snapLand(world: WorldApi, p: TilePt, radius = 5): TilePt {
  if (isFinite(world.moveCost(Math.round(p.tx), Math.round(p.ty), 'land'))) return p;
  const q = world.nearestPassable({ tx: p.tx, ty: p.ty }, 'land', radius);
  return q ? { tx: q.tx, ty: q.ty } : p;
}

/** Point `dist` tiles outside section `id` at fraction t, snapped to passable land. */
export function frontPoint(world: WorldApi | null, id: SectionId, t: number, dist: number): TilePt {
  const p = sectionPoint(id, t);
  const n = sectionOutwardNormal(id, t);
  const q = { tx: p.tx + n.tx * dist, ty: p.ty + n.ty * dist };
  return world ? snapLand(world, q, 4) : q;
}

/** Unit vector pointing from the attacker toward the wall (into the city). */
export function inwardAt(id: SectionId, t = 0.5): TilePt {
  const n = sectionOutwardNormal(id, t);
  return { tx: -n.tx, ty: -n.ty };
}

export function isLandSection(id: SectionId): boolean {
  return SECTION_BY_ID[id]?.kind === 'kara';
}

/** Where columns enter the map from Edirne (west edge, on the Edirne road). */
export function edirneEntry(world: WorldApi | null): TilePt {
  const [la, lo] = EDIRNE_ROAD[0];
  const p = geoToTile(la, lo);
  const q = { tx: Math.max(1.5, p.tx + 1), ty: p.ty };
  return world ? snapLand(world, q, 6) : q;
}

/** A point a few tiles along the Edirne road (for staggering column heads). */
export function edirneRoadPoint(world: WorldApi | null, k: number): TilePt {
  const a = geoToTile(EDIRNE_ROAD[0][0], EDIRNE_ROAD[0][1]);
  const b = geoToTile(EDIRNE_ROAD[1][0], EDIRNE_ROAD[1][1]);
  const f = Math.min(1, k);
  const q = { tx: Math.max(1.5, a.tx + (b.tx - a.tx) * f), ty: a.ty + (b.ty - a.ty) * f };
  return world ? snapLand(world, q, 6) : q;
}

export interface CampSlot {
  pos: TilePt;
  face: TilePt;
}

/**
 * Camp slot k of a wing. Land wings line up in rows in front of their wall
 * sections (behind the batteries); Zağanos on the Pera hills; akıncılar at the rear.
 */
export function campSlot(world: WorldApi | null, wing: WingId, k: number): CampSlot {
  const secs = WING_SECTIONS[wing];
  if (secs && secs.length) {
    // evenly spaced along the wing's whole wall front, rows behind each other
    const lens = secs.map((id) => Math.max(1, sectionLength(id)));
    const total = lens.reduce((x, y) => x + y, 0);
    const perRow = Math.max(2, Math.round(total / 4));
    const row = Math.floor(k / perRow);
    const j = k % perRow;
    let u = ((j + 0.5 + (row % 2) * 0.5) / perRow) * total;
    let si = 0;
    while (si < secs.length - 1 && u > lens[si]) {
      u -= lens[si];
      si++;
    }
    const sid = secs[si];
    const t = Math.max(0.05, Math.min(0.95, u / lens[si]));
    const dist = (wing === 'merkez' ? 10 : 9.5) + row * 3.2;
    const pos = frontPoint(world, sid, t, dist);
    return { pos, face: inwardAt(sid, t) };
  }
  const grid = (cx: number, cy: number, face: TilePt, sx: number, sy: number): CampSlot => {
    const ring = [
      [0, 0], [1, 0], [-1, 0], [0, 1], [1, 1], [-1, 1], [2, 0], [-2, 0], [0, -1], [2, 1], [-2, 1], [1, -1], [-1, -1],
    ];
    const r = ring[k % ring.length];
    const lap = Math.floor(k / ring.length);
    const p = { tx: cx + r[0] * sx + lap * 1.3, ty: cy + r[1] * sy + lap * 1.3 };
    return { pos: world ? snapLand(world, p, 6) : p, face };
  };
  if (wing === 'zaganos') {
    const z = landmarkTile('zaganosKarargah');
    return grid(z.tx - 4, z.ty + 3, { tx: -0.2, ty: 1 }, 3.2, 2.8);
  }
  if (wing === 'akinci') {
    const o = landmarkTile('otag');
    return grid(o.tx - 9, o.ty - 8, { tx: 1, ty: 0 }, 3.4, 3.4);
  }
  // hisar: guards on the landward side of Rumeli Hisarı
  const h = landmarkTile('rumeliHisari');
  const spots: [number, number][] = [
    [-5, 7],
    [-3, -8],
    [-14, 2],
    [-9, 9],
    [-12, -6],
  ];
  const s = spots[k % spots.length];
  const p = { tx: h.tx + s[0], ty: h.ty + s[1] };
  return { pos: world ? snapLand(world, p, 6) : p, face: { tx: 0.9, ty: -0.2 } };
}

/** Fraction t along a section for the i-th of n groups (spread over the middle). */
export function spreadT(i: number, n: number): number {
  if (n <= 1) return 0.5;
  return 0.22 + (0.56 * i) / (n - 1);
}

/** Total men of the given group ids that are able to fight. */
export function menOf(state: GameState, ids: number[]): number {
  let n = 0;
  for (const id of ids) {
    const g = state.groups.find((x) => x.id === id);
    if (g && g.status !== 'dagildi' && g.status !== 'uzakta') n += g.men;
  }
  return n;
}
