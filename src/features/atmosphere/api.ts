import { dayFrac } from '../../core/calendar';
import type { GameState } from '../../core/state';
import {
  ambientFor,
  baseWeather,
  calendarEclipse,
  daylight,
  seasonOf,
  windAt,
  type RGB,
  type Season,
  type Weather,
} from './sky';

/** PUBLIC API of atmosphere (owner: atmosphere agent). Pure helpers + render-shared getters. */

/** Daylight level 0 (deep night) .. 1 (full day). During hazırlık/yürüyüş the map stays in daylight. */
export function lightLevel(state: GameState): number {
  return daylight(state.time.day, state.time.phase);
}

/** True when torches/campfires should be lit (dusk → dawn). */
export function isNight(state: GameState): boolean {
  return lightLevel(state) < 0.35;
}

/**
 * Wind in world pixels per real second (screen space; x>0 = toward screen-right).
 * Use it for smoke, flags, sails, ripples. Pure function of the calendar.
 */
export function windVector(state: GameState): { x: number; y: number } {
  return windAt(state.time.day, state.time.phase);
}

/** Current season (for terrain/foliage variants). */
export function season(state: GameState): Season {
  return seasonOf(state.time.day);
}

/**
 * Shared render-side sky values written by the atmosphere renderer every frame
 * (eclipse smoothing from the 'eclipse' bus event, active weather). Reset on
 * every createRender. Read through the getters below.
 */
export const skyShared = {
  /** Smoothed eclipse level driven by the 'eclipse' bus event. */
  eventEclipse: 0,
  /** Currently displayed weather (after event overrides & smoothing). */
  weather: { kind: 'acik', intensity: 0 } as Weather,
  /** Last ambient color used for the lightmap (0..1 RGB). */
  ambient: [1, 1, 1] as RGB,
};

/**
 * Lunar-eclipse level 0..1 (22 Mayıs 1453 evening): the night turns blood-red.
 * World/water renderers can use it to tint moon reflections. With a state it also
 * includes the calendar-derived eclipse (works before the 'eclipse' event fires).
 */
export function eclipseLevel(state?: GameState): number {
  const cal = state ? calendarEclipse(state.time.day) : 0;
  return Math.max(cal, skyShared.eventEclipse);
}

/** Weather currently shown on the map (render-side; 'acik' before atmosphere renders). */
export function currentWeather(state?: GameState): Weather {
  if (skyShared.weather.kind === 'acik' && state) return baseWeather(state.time.day, state.time.phase);
  return skyShared.weather;
}

/** Ambient light color (0..1 RGB) the lightmap multiplies the world with. Useful for tinting UI-world sprites. */
export function ambientColor(state: GameState): RGB {
  return ambientFor(state.time.day, state.time.phase, currentWeather(state), eclipseLevel(state)).amb;
}

export { dayFrac };
export type { Season, Weather, RGB };
