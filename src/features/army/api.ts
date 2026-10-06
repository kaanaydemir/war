import type { Bus } from '../../core/bus';
import { nextId, type GameState, type UnitGroup, type UnitTypeId } from '../../core/state';

/** PUBLIC API of army (owner: army agent). Signatures are a contract. */

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
    morale: 70,
    fatigue: 0,
    xp: 0,
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
  g.men -= lost;
  state.stats.ottomanLosses += lost;
  bus.emit('group:casualties', { groupId, count: lost, at: { tx: g.tx, ty: g.ty } });
}

export function groupsNear(state: GameState, tx: number, ty: number, r: number): UnitGroup[] {
  return state.groups.filter((g) => g.status !== 'uzakta' && Math.hypot(g.tx - tx, g.ty - ty) <= r);
}
