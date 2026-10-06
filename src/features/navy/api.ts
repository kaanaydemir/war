import { nextId, type GameState, type Ship, type ShipType, type Side } from '../../core/state';

/** PUBLIC API of navy (owner: navy agent). Signatures are a contract. */
export function spawnShip(state: GameState, type: ShipType, side: Side, tx: number, ty: number, hp = 100): Ship {
  const s: Ship = { id: nextId(state), type, side, tx, ty, heading: 0, hp, hpMax: hp, status: 'demirli', path: [] };
  state.ships.push(s);
  return s;
}
