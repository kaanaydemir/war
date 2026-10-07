import type { Bus } from '../../core/bus';
import { nextId, type GameState, type UnitGroup, type UnitTypeId } from '../../core/state';

/**
 * Contract functions of the army API (re-exported by api.ts). Kept in their own
 * module so the sim files can use them without importing api.ts (no cycles).
 */

export function spawnGroup(
  state: GameState,
  type: UnitTypeId,
  men: number,
  tx: number,
  ty: number,
  opts: { name?: string; commanderId?: string | null; status?: UnitGroup['status'] } = {},
): UnitGroup {
  const g: UnitGroup = {
    id: nextId(state),
    type,
    name: opts.name ?? type,
    commanderId: opts.commanderId ?? null,
    men,
    maxMen: men,
    morale: type === 'yeniceri' ? 80 : type === 'basibozuk' ? 62 : 70,
    fatigue: 0,
    xp: type === 'yeniceri' ? 40 : type === 'sipahi' ? 25 : 10,
    tx,
    ty,
    path: [],
    order: { type: 'bekle' },
    status: opts.status ?? 'bosta',
    facing: 1,
  };
  state.groups.push(g);
  return g;
}

/** Remove `men` from a group (sorties, mine collapses, fire…). Emits casualties. */
export function damageGroup(state: GameState, bus: Bus, groupId: number, men: number): void {
  const g = state.groups.find((x) => x.id === groupId);
  if (!g) return;
  const lost = Math.min(g.men, Math.max(0, Math.round(men)));
  if (lost <= 0) return;
  g.men -= lost;
  state.stats.ottomanLosses += lost;
  bus.emit('group:casualties', { groupId, count: lost, at: { tx: g.tx, ty: g.ty } });
  if (g.men <= 0) {
    g.men = 0;
    g.status = 'dagildi';
    g.path = [];
  }
}

export function groupsNear(state: GameState, tx: number, ty: number, r: number): UnitGroup[] {
  return state.groups.filter((g) => g.status !== 'uzakta' && g.status !== 'dagildi' && Math.hypot(g.tx - tx, g.ty - ty) <= r);
}
