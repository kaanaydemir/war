import type { TilePt } from '../../core/iso';
import type { SectionId } from '../../core/state';
import { SECTION_BY_ID } from '../../data/sections';
import { sectionOutwardNormal, sectionPoint } from '../fortifications/api';

/** Pure siegeworks geometry (tile space). */

export function isLand(sectionId: SectionId): boolean {
  return SECTION_BY_ID[sectionId]?.kind === 'kara';
}

export function hasMoat(sectionId: SectionId): boolean {
  return !!SECTION_BY_ID[sectionId]?.moat;
}

/** Point `dist` tiles outside the wall at fraction t of the section. */
export function frontPos(sectionId: SectionId, t: number, dist: number): TilePt {
  const p = sectionPoint(sectionId, t);
  const n = sectionOutwardNormal(sectionId, t);
  return { tx: p.tx + n.tx * dist, ty: p.ty + n.ty * dist };
}

/** Nearest fraction t on the section's wall line to a tile point, and the distance. */
export function nearestT(sectionId: SectionId, tx: number, ty: number): { t: number; dist: number } {
  let bt = 0.5;
  let bd = Infinity;
  const N = 48;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const p = sectionPoint(sectionId, t);
    const d = Math.hypot(p.tx - tx, p.ty - ty);
    if (d < bd) {
      bd = d;
      bt = t;
    }
  }
  // refine
  let step = 1 / N;
  for (let k = 0; k < 6; k++) {
    step /= 2;
    for (const t of [bt - step, bt + step]) {
      if (t < 0 || t > 1) continue;
      const p = sectionPoint(sectionId, t);
      const d = Math.hypot(p.tx - tx, p.ty - ty);
      if (d < bd) {
        bd = d;
        bt = t;
      }
    }
  }
  return { t: Math.max(0.04, Math.min(0.96, bt)), dist: bd };
}

/** Point along a mine tunnel: shaft (0) → wall (1). */
export function tunnelPoint(entrance: TilePt, sectionId: SectionId, t: number, k: number): TilePt {
  const w = sectionPoint(sectionId, t);
  return { tx: entrance.tx + (w.tx - entrance.tx) * k, ty: entrance.ty + (w.ty - entrance.ty) * k };
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
