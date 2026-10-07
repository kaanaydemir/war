import { HALF_H, HALF_W } from '../../core/constants';
import type { HisarTowerId } from './data';

/**
 * RUMELİ HİSARI layout, in ground-plane SCREEN pixels relative to the fortress
 * anchor (the world position of the footprint center tile). Pure data shared by
 * the simulation (blocked tiles) and the art (drawing).
 *
 * Orientation: the camera looks from the south-east, i.e. from the Bosphorus —
 * the iconic view. Screen-down = the sea, screen-up = the hill (north-west),
 * screen-right = north (Saruca Paşa), screen-left = south (Zağanos Paşa), front
 * centre on the shore = Halil Paşa's sea tower.
 */
/** Wall ring nodes (closed polygon), front-left → around. Names are for readability. */
export const WALL_NODES: { x: number; y: number; kind: 'kule' | 'burc' | 'kose'; tower?: HisarTowerId }[] = [
  { x: -80, y: -10, kind: 'kule', tower: 'zaganos' }, // 0 Zağanos Paşa (south)
  { x: -40, y: 0, kind: 'burc' }, // 1 shore-wall burç
  { x: 2, y: -2, kind: 'kule', tower: 'halil' }, // 2 Halil Paşa (sea tower)
  { x: 38, y: -8, kind: 'burc' }, // 3
  { x: 68, y: -38, kind: 'kule', tower: 'saruca' }, // 4 Saruca Paşa (north)
  { x: 46, y: -58, kind: 'burc' }, // 5
  { x: 12, y: -70, kind: 'burc' }, // 6 hilltop
  { x: -26, y: -66, kind: 'burc' }, // 7
  { x: -58, y: -50, kind: 'burc' }, // 8
  { x: -84, y: -30, kind: 'burc' }, // 9
];

/** Gates (3): on the shore wall, the north-east wall and the hill wall. */
export const GATES: { seg: number; t: number }[] = [
  { seg: 1, t: 0.25 },
  { seg: 3, t: 0.45 },
  { seg: 7, t: 0.45 },
];

/** Inner cross wall (the hisar has an inner wall between the towers) — node indices. */
export const INNER_WALL: [number, number][] = [[2, 7]];

/** Shore battery (outside, on the beach in front of the sea tower). */
export const BATTERY: { x: number; y: number }[] = [
  { x: -62, y: 1 },
  { x: -22, y: 6 },
  { x: 26, y: 3 },
  { x: 54, y: -12 },
];

/** Closed outer polygon in anchor-relative screen px (ground plane). */
export const HISAR_POLY: [number, number][] = WALL_NODES.map((n) => [n.x, n.y]);

/** Point in polygon (even-odd). */
export function inHisarPoly(x: number, y: number, pad = 0): boolean {
  const poly = HISAR_POLY;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  if (inside || pad <= 0) return inside;
  // within pad px of any edge also counts
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [x0, y0] = poly[j];
    const [x1, y1] = poly[i];
    const dx = x1 - x0;
    const dy = y1 - y0;
    const l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / l2));
    if (Math.hypot(x - (x0 + t * dx), y - (y0 + t * dy)) <= pad) return true;
  }
  return false;
}

/** Convert a tile offset (du, dv) from the anchor tile to anchor-relative screen px. */
export function tileOffsetToScreen(du: number, dv: number): { x: number; y: number } {
  return { x: (du - dv) * HALF_W, y: (du + dv) * HALF_H };
}

/** Tile offsets (relative to the anchor tile) covered by the fortress. */
export function hisarTileOffsets(): { du: number; dv: number }[] {
  const out: { du: number; dv: number }[] = [];
  for (let du = -10; du <= 6; du++)
    for (let dv = -8; dv <= 8; dv++) {
      const p = tileOffsetToScreen(du, dv);
      if (inHisarPoly(p.x, p.y, 4)) out.push({ du, dv });
    }
  return out;
}

/** Ground point along wall segment `seg` at fraction t (lift interpolated). */
export function segPoint(seg: number, t: number): { x: number; y: number } {
  const a = WALL_NODES[seg % WALL_NODES.length];
  const b = WALL_NODES[(seg + 1) % WALL_NODES.length];
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

