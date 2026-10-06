import type { Bus } from '../../core/bus';
import type { TilePt } from '../../core/iso';
import type { GameState, SectionId, WallSection } from '../../core/state';
import { geoPolyToTiles } from '../../data/geography';
import { SECTIONS, SECTION_BY_ID } from '../../data/sections';

/**
 * PUBLIC API of fortifications (owner: fortifications agent). Other features
 * call these to damage/repair walls and to locate sections. Signatures are a
 * contract; implementations may be refined.
 */

const pathCache = new Map<SectionId, TilePt[]>();

/** Tile-space polyline of a section (north→south / along the coast). */
export function sectionPath(id: SectionId): TilePt[] {
  let p = pathCache.get(id);
  if (!p) {
    p = geoPolyToTiles(SECTION_BY_ID[id]?.path ?? []);
    pathCache.set(id, p);
  }
  return p;
}

/** Midpoint of the section in tile space. */
export function sectionCenter(id: SectionId): TilePt {
  const p = sectionPath(id);
  if (p.length === 0) return { tx: 0, ty: 0 };
  const a = p[0];
  const b = p[p.length - 1];
  return { tx: (a.tx + b.tx) / 2, ty: (a.ty + b.ty) / 2 };
}

/** A tile just OUTSIDE the wall (attacker side) facing the section center. */
export function sectionApproach(id: SectionId, distance = 4): TilePt {
  const c = sectionCenter(id);
  const def = SECTION_BY_ID[id];
  // land walls: outside is west (−tx); Golden Horn walls: outside is north-east (water); Marmara: south.
  if (def?.kind === 'kara') return { tx: c.tx - distance, ty: c.ty };
  if (def?.kind === 'halic') return { tx: c.tx + distance * 0.5, ty: c.ty - distance * 0.7 };
  return { tx: c.tx, ty: c.ty + distance };
}

/** Section whose wall line is nearest to (tx,ty) within maxDist tiles, or null. */
export function sectionAt(tx: number, ty: number, maxDist = 2.5): SectionId | null {
  let best: SectionId | null = null;
  let bd = maxDist;
  for (const s of SECTIONS) {
    const p = sectionPath(s.id);
    for (let i = 0; i + 1 < p.length; i++) {
      const d = distToSeg(tx, ty, p[i], p[i + 1]);
      if (d < bd) {
        bd = d;
        best = s.id;
      }
    }
  }
  return best;
}

function distToSeg(x: number, y: number, a: TilePt, b: TilePt): number {
  const dx = b.tx - a.tx;
  const dy = b.ty - a.ty;
  const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((x - a.tx) * dx + (y - a.ty) * dy) / l2));
  return Math.hypot(x - (a.tx + t * dx), y - (a.ty + t * dy));
}

/** Recompute the derived breach value of a section. */
export function recomputeBreach(s: WallSection): void {
  const outerOpen = s.outerMax > 0 ? 1 - s.outer / s.outerMax : 1;
  const innerOpen = 1 - s.inner / s.innerMax;
  const raw = s.kind === 'kara' ? Math.min(1, outerOpen * 0.55 + innerOpen * 0.75) : innerOpen;
  s.breach = Math.max(0, Math.min(1, raw * (1 - s.barricade * 0.7)));
}

/** Apply cannon/mine damage. Outer wall absorbs first on land sections. */
export function damageSection(state: GameState, bus: Bus, id: SectionId, amount: number): void {
  const s = state.sections[id];
  if (!s) return;
  const before = s.breach;
  // barricades soak damage first
  if (s.barricade > 0) {
    const soak = Math.min(s.barricade, amount / 400);
    s.barricade -= soak;
    amount -= soak * 400;
  }
  if (s.kind === 'kara' && s.outer > 0) {
    const d = Math.min(s.outer, amount);
    s.outer -= d;
    amount -= d;
    bus.emit('wall:damaged', { sectionId: id, amount: d, layer: 'outer' });
  }
  if (amount > 0) {
    const d = Math.min(s.inner, amount);
    s.inner -= d;
    bus.emit('wall:damaged', { sectionId: id, amount: d, layer: 'inner' });
  }
  recomputeBreach(s);
  if (before < 0.5 && s.breach >= 0.5) {
    state.stats.breaches++;
    bus.emit('wall:breach', { sectionId: id });
  }
}

/** Repair (night work). amount in wall HP; extra goes to barricade. */
export function repairSection(state: GameState, bus: Bus, id: SectionId, amount: number): void {
  const s = state.sections[id];
  if (!s) return;
  let a = amount;
  const outerNeed = s.outerMax - s.outer;
  const innerNeed = s.innerMax - s.inner;
  // rebuilding stone is slow — most effort goes into stockades (barricades)
  const stone = Math.min(innerNeed + outerNeed, a * 0.25);
  const toInner = Math.min(innerNeed, stone);
  s.inner += toInner;
  s.outer += Math.min(outerNeed, stone - toInner);
  a -= stone;
  if (s.breach > 0.05) s.barricade = Math.min(1, s.barricade + a / 600);
  recomputeBreach(s);
  bus.emit('wall:repaired', { sectionId: id, amount });
}

/** Point at fraction t (0..1) along the section's polyline (by length). */
export function sectionPoint(id: SectionId, t: number): TilePt {
  const p = sectionPath(id);
  if (p.length < 2) return p[0] ?? { tx: 0, ty: 0 };
  const lens: number[] = [];
  let total = 0;
  for (let i = 0; i + 1 < p.length; i++) {
    const l = Math.hypot(p[i + 1].tx - p[i].tx, p[i + 1].ty - p[i].ty);
    lens.push(l);
    total += l;
  }
  let d = Math.max(0, Math.min(1, t)) * total;
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i] || i === lens.length - 1) {
      const f = lens[i] ? d / lens[i] : 0;
      return { tx: p[i].tx + (p[i + 1].tx - p[i].tx) * f, ty: p[i].ty + (p[i + 1].ty - p[i].ty) * f };
    }
    d -= lens[i];
  }
  return p[p.length - 1];
}
