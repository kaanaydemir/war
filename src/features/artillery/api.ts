import { nextId, type Cannon, type CannonStatus, type CannonType, type GameState } from '../../core/state';

/** PUBLIC API of artillery (owner: artillery agent). Signatures are a contract. */
export function spawnCannon(state: GameState, type: CannonType, tx: number, ty: number, status: CannonStatus = 'hazir', name?: string): Cannon {
  const c: Cannon = {
    id: nextId(state),
    type,
    name: name ?? type,
    tx,
    ty,
    status,
    targetSection: null,
    cooldown: 0,
    shotsToday: 0,
    progress: status === 'hazir' ? 1 : 0,
    heat: 0,
    path: [],
  };
  state.cannons.push(c);
  return c;
}
