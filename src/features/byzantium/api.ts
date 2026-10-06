import type { Bus } from '../../core/bus';
import type { GameState, SectionId } from '../../core/state';

/** PUBLIC API of byzantium (owner: byzantium agent). Signatures are a contract. */

/** Effective defensive strength of a section right now (used by army assault resolution). */
export function sectionDefense(state: GameState, sectionId: SectionId): number {
  const s = state.sections[sectionId];
  if (!s) return 0;
  return s.defenders * (0.5 + state.byz.morale / 100);
}

/** Kill/wound defenders of a section (assaults, arrows, mines). */
export function applyDefenderLosses(state: GameState, bus: Bus, sectionId: SectionId, n: number): void {
  const s = state.sections[sectionId];
  if (!s) return;
  const lost = Math.min(s.defenders, Math.max(0, Math.round(n)));
  s.defenders -= lost;
  state.byz.defenders = Math.max(0, state.byz.defenders - lost);
  state.stats.byzantineLosses += lost;
}

/** Byzantine counter-mining skill 0..1 (Johannes Grant). */
export function counterMineSkill(state: GameState): number {
  return 0.5;
}
