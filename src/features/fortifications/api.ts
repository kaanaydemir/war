import type { Bus } from '../../core/bus';
import type { TilePt } from '../../core/iso';
import { featureState, type GameState, type SectionId, type WallSection } from '../../core/state';
import type { WorldApi } from '../../core/world';
import { SECTIONS, SECTION_BY_ID } from '../../data/sections';
import {
  GATES,
  LINES,
  SPANS,
  nearestOnLine,
  offsetAt,
  outwardAt,
  pointAt,
  sectionTowers,
  subPath,
  towerCollapseOrder,
  type TowerKind,
} from './geom';

/**
 * PUBLIC API of fortifications (owner: fortifications agent). Other features
 * call these to damage/repair walls and to locate sections. Signatures are a
 * contract; implementations may be refined.
 *
 * Geometry: land sections follow data/geography LAND_WALLS; sea sections follow
 * the WATER coastline between their end points, set back a little inland (the
 * line the sea wall stands on). All positions are TILE coordinates.
 */

const pathCache = new Map<SectionId, TilePt[]>();

/** Tile-space polyline of a section (north→south / along the coast). */
export function sectionPath(id: SectionId): TilePt[] {
  let p = pathCache.get(id);
  if (!p) {
    const span = SPANS[id];
    if (span) p = subPath(LINES[span.line], span.t0, span.t1);
    else p = [];
    pathCache.set(id, p);
  }
  return p;
}

/** Length of the section's wall line in tiles. */
export function sectionLength(id: SectionId): number {
  const s = SPANS[id];
  return s ? s.t1 - s.t0 : 0;
}

/** Midpoint of the section in tile space (half way along the wall line). */
export function sectionCenter(id: SectionId): TilePt {
  return sectionPoint(id, 0.5);
}

/** Unit normal pointing OUTSIDE (attacker side) at fraction t of the section. */
export function sectionOutwardNormal(id: SectionId, t = 0.5): TilePt {
  const span = SPANS[id];
  if (!span) return { tx: -1, ty: 0 };
  const o = outwardAt(LINES[span.line], span.t0 + (span.t1 - span.t0) * Math.max(0, Math.min(1, t)));
  return { tx: o.nx, ty: o.ny };
}

/**
 * A tile just OUTSIDE the wall (attacker side) facing the section center.
 * Land sections: on land beyond the moat. Sea sections: on the water.
 * With a `world`, the result is snapped to the nearest passable tile for that mode.
 */
export function sectionApproach(id: SectionId, distance = 4, world?: WorldApi): TilePt {
  const span = SPANS[id];
  if (!span) return { tx: 0, ty: 0 };
  const line = LINES[span.line];
  const t = (span.t0 + span.t1) / 2;
  const p = offsetAt(line, t, Math.max(0.5, distance));
  if (world) {
    const mode = span.line === 'kara' ? 'land' : 'sea';
    const ok = (q: TilePt) => isFinite(world.moveCost(Math.round(q.tx), Math.round(q.ty), mode));
    if (!ok(p)) {
      // walk further out along the normal first (moat/beach), then fall back to a search
      for (let k = 1; k <= 6; k++) {
        const q = offsetAt(line, t, Math.max(0.5, distance) + k * 0.75);
        if (ok(q)) return q;
      }
      const q = world.nearestPassable({ tx: Math.round(p.tx), ty: Math.round(p.ty) }, mode, 6);
      if (q) return q;
    }
  }
  return p;
}

/** Section whose wall line is nearest to (tx,ty) within maxDist tiles, or null. */
export function sectionAt(tx: number, ty: number, maxDist = 2.5): SectionId | null {
  let best: SectionId | null = null;
  let bd = maxDist;
  const qk = nearestOnLine(LINES.kara, tx, ty);
  const qd = nearestOnLine(LINES.deniz, tx, ty);
  if (Math.min(qk.dist, qd.dist) > maxDist + 1) return null;
  for (const s of SECTIONS) {
    const span = SPANS[s.id];
    if (!span) continue;
    const line = LINES[span.line];
    const q = span.line === 'kara' ? qk : qd;
    // distance to this section's portion of the line
    let d: number;
    if (q.t >= span.t0 && q.t <= span.t1) d = q.dist;
    else {
      const e = pointAt(line, q.t < span.t0 ? span.t0 : span.t1);
      d = Math.hypot(tx - e.tx, ty - e.ty);
    }
    if (d < bd) {
      bd = d;
      best = s.id;
    }
  }
  return best;
}

// ───────────────────────────── damage model ─────────────────────────────

/** True for land sections that have the outer wall + moat (Theodosian double wall). */
export function hasOuterWall(s: WallSection): boolean {
  return s.kind === 'kara' && s.outerMax > 0;
}

/** Openness of the outer wall 0..1 (0 if the section has no outer wall). */
export function outerOpen(s: WallSection): number {
  return s.outerMax > 0 ? Math.max(0, Math.min(1, 1 - s.outer / s.outerMax)) : 0;
}

/** Openness of the inner (main) wall 0..1. */
export function innerOpen(s: WallSection): number {
  return s.innerMax > 0 ? Math.max(0, Math.min(1, 1 - s.inner / s.innerMax)) : 1;
}

const smoothstep = (e0: number, e1: number, x: number) => {
  const k = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return k * k * (3 - 2 * k);
};

/**
 * Breach openness from wall damage alone (ignores barricades).
 * Double wall: the outer wall can open the line up to ~0.6 on its own (the stockade line
 * of 1453 stood in the ruins of the outer wall); a broken inner wall opens it fully.
 * Single wall (Blachernae, sea walls): breach follows the wall directly.
 */
export function rawBreach(s: WallSection): number {
  const io = innerOpen(s);
  if (!hasOuterWall(s)) return Math.max(0, Math.min(1, smoothstep(0.08, 0.92, io)));
  const oo = outerOpen(s);
  const outerPart = 0.62 * smoothstep(0.1, 0.95, oo);
  const innerPart = smoothstep(0.1, 0.95, io);
  return Math.max(0, Math.min(1, 1 - (1 - outerPart) * (1 - innerPart)));
}

/** Recompute the derived breach value of a section. */
export function recomputeBreach(s: WallSection): void {
  const raw = rawBreach(s);
  const b = Math.max(0, Math.min(1, s.barricade));
  s.breach = Math.max(0, Math.min(1, raw * (1 - b * 0.72)));
}

/**
 * How open the section is to an ASSAULT (0..1): breach, but an unfilled moat in
 * front of a double wall slows the storming parties down. (Moats matter little to
 * cannon — see damageSection — but a lot to men with ladders.)
 */
export function assaultOpenness(s: WallSection): number {
  const moat = SECTION_BY_ID[s.id]?.moat ?? false;
  const m = moat ? 0.55 + 0.45 * Math.max(0, Math.min(1, s.moatFill)) : 1;
  return Math.max(0, Math.min(1, s.breach * m + (moat ? 0 : 0.03)));
}

/**
 * Visual damage stage 0..4:
 * 0 intact · 1 chipped battlements · 2 cracked & scorched · 3 heavy damage / collapsed towers · 4 breached.
 */
export function sectionDamageStage(s: WallSection): 0 | 1 | 2 | 3 | 4 {
  const raw = rawBreach(s);
  if (raw >= 0.5) return 4;
  const d = hasOuterWall(s) ? 0.55 * outerOpen(s) + 0.45 * innerOpen(s) : innerOpen(s);
  const dd = Math.max(d, s.towersDown > 0 ? 0.46 : 0);
  if (dd < 0.06) return 0;
  if (dd < 0.22) return 1;
  if (dd < 0.45) return 2;
  return 3;
}

export interface TowerInfo {
  /** Index within the section (wall order). */
  index: number;
  tx: number;
  ty: number;
  /** 0..1 position along the section. */
  t: number;
  kind: TowerKind;
}

/** Positions of the section's main (inner-wall) towers, in wall order. */
export function towerPositions(id: SectionId): TowerInfo[] {
  const span = SPANS[id];
  if (!span) return [];
  const line = LINES[span.line];
  const len = Math.max(1e-6, span.t1 - span.t0);
  return sectionTowers(id).map((tw) => {
    const p = offsetAt(line, tw.t, span.line === 'kara' ? -0.05 : 0);
    return { index: tw.index, tx: p.tx, ty: p.ty, t: Math.max(0, Math.min(1, (tw.t - span.t0) / len)), kind: tw.kind };
  });
}

/** Indices (into towerPositions) of collapsed towers: the first `towersDown` of the collapse order. */
export function collapsedTowers(s: WallSection): number[] {
  return towerCollapseOrder(s.id).slice(0, Math.max(0, s.towersDown));
}

/** Towers that should have collapsed for the current damage. */
export function targetTowersDown(s: WallSection): number {
  const n = sectionTowers(s.id).length;
  if (n === 0) return 0;
  const io = innerOpen(s);
  const oo = outerOpen(s);
  // bombardment brings towers down once the main wall is seriously damaged
  const d = hasOuterWall(s) ? io * 0.8 + oo * 0.25 : io;
  const k = smoothstep(0.28, 1.0, d);
  return Math.min(n, Math.floor(k * n * 0.85 + 1e-6));
}

/** Named gates along the walls (tile positions). */
export function gatePositions(): { name: string; tx: number; ty: number; kind: string; sea: boolean }[] {
  return GATES.map((g) => {
    const p = pointAt(LINES[g.line], g.t);
    return { name: g.name, tx: p.tx, ty: p.ty, kind: g.kind, sea: g.line !== 'kara' };
  });
}

interface FortSimState {
  /** Sections currently counted as breached (breach ≥ 0.5) — avoids double events. */
  breached: Record<SectionId, boolean>;
}

/** Private sim state of fortifications. */
export function fortState(state: GameState): FortSimState {
  return featureState<FortSimState>(state, 'fortifications', () => ({ breached: {} }));
}

/** Emit breach / tower-collapse events if the section crossed a threshold. */
export function checkThresholds(state: GameState, bus: Bus, id: SectionId): void {
  const s = state.sections[id];
  if (!s) return;
  const fs = fortState(state);
  const target = targetTowersDown(s);
  if (target > s.towersDown) {
    const towers = towerPositions(id);
    const order = towerCollapseOrder(id);
    while (s.towersDown < target) {
      const ti = order[s.towersDown];
      s.towersDown++;
      const tw = towers.find((t) => t.index === ti) ?? towers[0];
      if (tw) bus.emit('wall:tower-collapse', { sectionId: id, at: { tx: tw.tx, ty: tw.ty } });
    }
  }
  const isB = s.breach >= 0.5;
  if (isB && !fs.breached[id]) {
    fs.breached[id] = true;
    state.stats.breaches++;
    bus.emit('wall:breach', { sectionId: id });
  } else if (!isB && fs.breached[id] && s.breach < 0.35) {
    fs.breached[id] = false;
  }
}

/** Apply cannon/mine damage. Outer wall absorbs first on land sections. */
export function damageSection(state: GameState, bus: Bus, id: SectionId, amount: number): void {
  const s = state.sections[id];
  if (!s || amount <= 0) return;
  // Earth-filled barrels, sacks and timber soak cannonballs remarkably well (Barbaro).
  if (s.barricade > 0) {
    const soak = Math.min(s.barricade, amount / 520);
    s.barricade -= soak;
    amount -= soak * 520 * 0.8;
  }
  if (amount <= 0) {
    recomputeBreach(s);
    return;
  }
  if (hasOuterWall(s) && s.outer > 0) {
    // Low outer wall takes the brunt; high shots still strike the inner wall behind.
    const share = 0.82;
    const d = Math.min(s.outer, amount * share);
    s.outer -= d;
    const rest = amount - d;
    if (d > 0) bus.emit('wall:damaged', { sectionId: id, amount: d, layer: 'outer' });
    if (rest > 0) {
      const di = Math.min(s.inner, rest * 0.85);
      s.inner -= di;
      if (di > 0) bus.emit('wall:damaged', { sectionId: id, amount: di, layer: 'inner' });
    }
  } else {
    const d = Math.min(s.inner, amount);
    s.inner -= d;
    if (d > 0) bus.emit('wall:damaged', { sectionId: id, amount: d, layer: 'inner' });
  }
  recomputeBreach(s);
  checkThresholds(state, bus, id);
}

/** Repair (night work). amount in wall HP; extra goes to barricade. */
export function repairSection(state: GameState, bus: Bus, id: SectionId, amount: number): void {
  const s = state.sections[id];
  if (!s || amount <= 0) return;
  let a = amount;
  const outerNeed = s.outerMax - s.outer;
  const innerNeed = s.innerMax - s.inner;
  // Rebuilding masonry in a night is slow — most effort goes into stockades.
  const stone = Math.min(innerNeed + outerNeed, a * 0.22);
  const toOuter = Math.min(outerNeed, stone * 0.6);
  const toInner = Math.min(innerNeed, stone - toOuter);
  s.outer += toOuter;
  s.inner += toInner;
  a -= toOuter + toInner;
  const needsStockade = rawBreach(s) > 0.04 || outerOpen(s) > 0.15;
  if (needsStockade) s.barricade = Math.min(1, s.barricade + a / 600);
  recomputeBreach(s);
  checkThresholds(state, bus, id);
  bus.emit('wall:repaired', { sectionId: id, amount });
}

/** Point at fraction t (0..1) along the section's polyline (by length). */
export function sectionPoint(id: SectionId, t: number): TilePt {
  const span = SPANS[id];
  if (!span) return { tx: 0, ty: 0 };
  const tt = Math.max(0, Math.min(1, t));
  return pointAt(LINES[span.line], span.t0 + (span.t1 - span.t0) * tt);
}
