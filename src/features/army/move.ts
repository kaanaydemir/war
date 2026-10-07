import type { SimContext } from '../../core/feature';
import type { TilePt } from '../../core/iso';
import { segmentOf } from '../../core/calendar';
import type { GameState, UnitGroup } from '../../core/state';
import type { WorldApi } from '../../core/world';
import { BAL, UNIT_TYPES } from './data';
import { snapLand } from './geo';
import { extraOf } from './state';

/** A* (world.findPath, land) + line-of-sight smoothing so columns walk straight lines. */
export function planPath(world: WorldApi, from: TilePt, to: TilePt): TilePt[] | null {
  let goal = to;
  if (!isFinite(world.moveCost(Math.round(goal.tx), Math.round(goal.ty), 'land'))) {
    const q = world.nearestPassable(goal, 'land', 6);
    if (!q) return null;
    goal = q;
  }
  let start = from;
  if (!isFinite(world.moveCost(Math.round(start.tx), Math.round(start.ty), 'land'))) {
    const q = world.nearestPassable(start, 'land', 6);
    if (q) start = q;
  }
  const raw = world.findPath(start, goal, 'land');
  if (!raw) return null;
  const pts: TilePt[] = raw.map((p) => ({ tx: p.tx, ty: p.ty }));
  pts[0] = { tx: from.tx, ty: from.ty };
  pts[pts.length - 1] = { tx: goal.tx, ty: goal.ty };
  return smooth(world, pts);
}

function segmentOk(world: WorldApi, a: TilePt, b: TilePt, maxCost: number): boolean {
  const d = Math.hypot(b.tx - a.tx, b.ty - a.ty);
  const n = Math.max(1, Math.ceil(d / 0.35));
  for (let i = 1; i < n; i++) {
    const f = i / n;
    const c = world.moveCost(Math.round(a.tx + (b.tx - a.tx) * f), Math.round(a.ty + (b.ty - a.ty) * f), 'land');
    if (!isFinite(c) || c > maxCost + 1e-6) return false;
  }
  return true;
}

function smooth(world: WorldApi, pts: TilePt[]): TilePt[] {
  if (pts.length <= 2) return pts.slice(1);
  const out: TilePt[] = [];
  let i = 0;
  while (i < pts.length - 1) {
    let best = i + 1;
    let maxC = world.moveCost(Math.round(pts[i + 1].tx), Math.round(pts[i + 1].ty), 'land');
    for (let j = i + 2; j < pts.length && j <= i + 14; j++) {
      maxC = Math.max(maxC, world.moveCost(Math.round(pts[j].tx), Math.round(pts[j].ty), 'land'));
      if (segmentOk(world, pts[i], pts[j], Math.max(1.05, maxC))) best = j;
    }
    out.push(pts[best]);
    i = best;
  }
  return out;
}

/** Destination offsets so several groups sent to one point form a line, not a pile. */
export function spreadTargets(world: WorldApi, center: TilePt, n: number, dir: TilePt): TilePt[] {
  const l = Math.hypot(dir.tx, dir.ty) || 1;
  const f = { tx: dir.tx / l, ty: dir.ty / l };
  const r = { tx: -f.ty, ty: f.tx };
  const out: TilePt[] = [];
  const perRow = 4;
  const s = BAL.formationSpacing;
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / perRow);
    const inRow = Math.min(perRow, n - row * perRow);
    const c = (i % perRow) - (inRow - 1) / 2;
    let q: TilePt = { tx: 0, ty: 0 };
    for (let k = 0; k < 6; k++) {
      const extra = k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2) * s * 0.6;
      const p = { tx: center.tx + r.tx * (c * s + extra) - f.tx * (row * s + (k ? s * 0.3 : 0)), ty: center.ty + r.ty * (c * s + extra) - f.ty * (row * s + (k ? s * 0.3 : 0)) };
      q = snapLand(world, p, 4);
      if (out.every((o) => Math.hypot(o.tx - q.tx, o.ty - q.ty) > s * 0.7)) break;
    }
    out.push(q);
  }
  return out;
}

/** Order the group to walk to `to`. Returns false if no land route exists. */
export function sendTo(state: GameState, world: WorldApi, g: UnitGroup, to: TilePt): boolean {
  const path = planPath(world, { tx: g.tx, ty: g.ty }, to);
  if (!path) return false;
  g.path = path;
  const e = extraOf(state, g.id);
  e.goal = path.length ? { ...path[path.length - 1] } : { tx: g.tx, ty: g.ty };
  return true;
}

/** Walk straight (no pathing) — used inside the fallen city and through the breach. */
export function sendStraight(state: GameState, g: UnitGroup, pts: TilePt[]): void {
  g.path = pts.map((p) => ({ tx: p.tx, ty: p.ty }));
  extraOf(state, g.id).goal = pts.length ? { ...pts[pts.length - 1] } : null;
}

/** Current map speed (tiles per sim-second). */
export function groupSpeed(state: GameState, world: WorldApi, g: UnitGroup): number {
  const def = UNIT_TYPES[g.type];
  let v = def.speed;
  const c = world.moveCost(Math.round(g.tx), Math.round(g.ty), 'land');
  const terr = isFinite(c) ? Math.max(0.45, Math.min(1.35, 1 / c)) : 1;
  v *= terr;
  v *= 1 - 0.35 * (g.fatigue / 100);
  if (state.time.phase === 'yuruyus') v *= BAL.marchSpeedMult;
  else if (state.time.phase === 'kusatma' && segmentOf(state.time.day) === 'gece') v *= BAL.nightSpeedMult;
  if (g.status === 'cekiliyor') v *= 1.15;
  return v;
}

/**
 * Advance a moving group along its path. Returns true on the tick it arrives.
 * Facing follows the screen direction (dx_screen ∝ dtx − dty).
 */
export function stepMove(state: GameState, ctx: SimContext, g: UnitGroup): boolean {
  if (!g.path.length) return false;
  let budget = groupSpeed(state, ctx.world, g) * ctx.dtSec;
  while (budget > 0 && g.path.length) {
    const p = g.path[0];
    const dx = p.tx - g.tx;
    const dy = p.ty - g.ty;
    const d = Math.hypot(dx, dy);
    const sdx = dx - dy;
    if (Math.abs(sdx) > 0.02) g.facing = sdx >= 0 ? 1 : -1;
    if (d <= budget) {
      g.tx = p.tx;
      g.ty = p.ty;
      budget -= d;
      g.path.shift();
    } else {
      g.tx += (dx / d) * budget;
      g.ty += (dy / d) * budget;
      budget = 0;
    }
  }
  const walkFat = state.time.phase === 'yuruyus' ? BAL.fatigueWalk * 0.35 : BAL.fatigueWalk;
  g.fatigue = Math.min(100, g.fatigue + walkFat * ctx.dtSec * (g.type === 'sipahi' || g.type === 'akinci' ? 0.6 : 1));
  return g.path.length === 0;
}
