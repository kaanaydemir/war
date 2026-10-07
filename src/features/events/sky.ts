import { d } from '../../core/calendar';
import type { WeatherKind } from './types';

/**
 * Historical sky & weather (pure functions of the absolute day index).
 *  - 22 Mayıs 1453: partial lunar eclipse, moonrise → late evening.
 *  - 24 Mayıs: hail and a downpour during the icon procession (afternoon).
 *  - 25 Mayıs: thick morning fog over the city.
 */
const ECLIPSE_START = d(22, 5, 1453) + 0.615; // ≈ 19:45
const ECLIPSE_END = d(22, 5, 1453) + 0.79; // ≈ 24:00

export function eclipseAt(day: number): boolean {
  return day >= ECLIPSE_START && day < ECLIPSE_END;
}

/** 0..1 eclipse coverage curve (for renderers that want a smooth ramp). */
export function eclipseCoverage(day: number): number {
  if (!eclipseAt(day)) return 0;
  const t = (day - ECLIPSE_START) / (ECLIPSE_END - ECLIPSE_START);
  // the moon rose already partly eclipsed; maximum early, then slowly clears
  return Math.max(0, Math.min(1, t < 0.25 ? 0.7 + t * 1.2 : 1 - (t - 0.25) / 0.75));
}

interface WeatherSpan {
  from: number;
  to: number;
  kind: WeatherKind;
  intensity: number;
}

const D24 = d(24, 5, 1453);
const D25 = d(25, 5, 1453);

const SPANS: WeatherSpan[] = [
  { from: D24 + 0.27, to: D24 + 0.3, kind: 'yagmur', intensity: 0.35 },
  { from: D24 + 0.3, to: D24 + 0.4, kind: 'dolu', intensity: 0.9 },
  { from: D24 + 0.4, to: D24 + 0.52, kind: 'yagmur', intensity: 0.8 },
  { from: D24 + 0.52, to: D24 + 0.6, kind: 'yagmur', intensity: 0.35 },
  { from: D25 - 0.08, to: D25 + 0.22, kind: 'sis', intensity: 0.9 },
  { from: D25 + 0.22, to: D25 + 0.34, kind: 'sis', intensity: 0.45 },
];

export function weatherAt(day: number): { kind: WeatherKind; intensity: number } {
  for (const s of SPANS) if (day >= s.from && day < s.to) return { kind: s.kind, intensity: s.intensity };
  return { kind: 'acik', intensity: 0 };
}
