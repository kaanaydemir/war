import type { Cost } from '../../core/defs';
import { nextId, RESOURCE_IDS, type Building, type GameState, type Side } from '../../core/state';

/** PUBLIC API of economy (owner: economy agent). Signatures are a contract. */
export function canAfford(state: GameState, cost: Cost): boolean {
  return RESOURCE_IDS.every((r) => (cost[r] ?? 0) <= state.resources[r]);
}

/** Deduct cost; returns false (and deducts nothing) if unaffordable. */
export function spend(state: GameState, cost: Cost): boolean {
  if (!canAfford(state, cost)) return false;
  for (const r of RESOURCE_IDS) state.resources[r] -= cost[r] ?? 0;
  return true;
}

export function gain(state: GameState, cost: Cost): void {
  for (const r of RESOURCE_IDS) state.resources[r] += cost[r] ?? 0;
}

/** Place a building directly (scenarios, scripted camps). Does not check cost. */
export function placeBuilding(
  state: GameState,
  type: string,
  tx: number,
  ty: number,
  opts: { built?: boolean; owner?: Side; data?: Building['data'] } = {},
): Building {
  const b: Building = {
    id: nextId(state),
    type,
    tx,
    ty,
    progress: opts.built === false ? 0 : 1,
    built: opts.built !== false,
    workers: 0,
    hp: 100,
    owner: opts.owner ?? 'osmanli',
    data: opts.data ?? {},
  };
  state.buildings.push(b);
  return b;
}

/** Days of provisions left at current consumption. */
export function erzakDays(state: GameState): number {
  const men = state.groups.reduce((a, g) => a + (g.status === 'uzakta' ? 0 : g.men), 0) + state.workforce.total;
  return men > 0 ? state.resources.erzak / men : Infinity;
}
