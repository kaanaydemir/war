import type { Bus } from '../../core/bus';
import type { GameState, SectionId } from '../../core/state';

/** PUBLIC API of siegeworks (owner: siegeworks agent). Signatures are a contract. */

/** Multiplier ≥ 1 for assaults on this section (siege tower, filled moat, ladders…). */
export function assaultBonus(state: GameState, sectionId: SectionId): number {
  return 1;
}

/** Byzantine sortie burns the siege tower at this section (if any). */
export function burnTower(state: GameState, bus: Bus, sectionId: SectionId): boolean {
  return false;
}
