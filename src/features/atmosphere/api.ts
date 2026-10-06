import { dayFrac, sunElevation } from '../../core/calendar';
import type { GameState } from '../../core/state';

/** PUBLIC API of atmosphere (owner: atmosphere agent). Pure helpers. */

/** Daylight level 0 (deep night) .. 1 (full day). During hazırlık the map stays in daylight. */
export function lightLevel(state: GameState): number {
  if (state.time.phase === 'hazirlik') return 1;
  const e = sunElevation(state.time.day);
  return Math.max(0, Math.min(1, (e + 0.25) / 0.75));
}

/** True when torches/campfires should be lit. */
export function isNight(state: GameState): boolean {
  return lightLevel(state) < 0.35;
}

export { dayFrac };
