import { clockHours, d, dayToDate } from '../../core/calendar';
import { hash2 } from '../../core/rng';
import type { Phase } from '../../core/state';

/**
 * PURE sky model (no Phaser): time-of-day lighting keyframes, season grading,
 * wind, calendar weather and the 22 Mayıs 1453 lunar eclipse.
 * Everything here is deterministic from the calendar so tests can pin it down.
 */

export type RGB = [number, number, number];

export interface SkyKey {
  /** Clock hour 0..24. */
  h: number;
  /** Ambient multiply color (lightmap fill), 0..1 per channel. */
  amb: RGB;
  /** Daylight level 0..1 (drives lightLevel/isNight, glow strength, birds…). */
  light: number;
  /** Sun-glint color on water / motes. */
  glint: RGB;
}

/**
 * Time-of-day keyframes (clock hours; dawn = 05:00 = dayFrac 0).
 * Dawn rose-orange → neutral warm midday → golden hour → violet dusk → deep blue night.
 * Light values are monotonic between the night plateau and noon so tests can assert it.
 */
export const SKY_KEYS: SkyKey[] = [
  { h: 0.0, amb: [0.32, 0.38, 0.65], light: 0.0, glint: [0.62, 0.74, 1.0] },
  { h: 4.4, amb: [0.32, 0.38, 0.65], light: 0.0, glint: [0.62, 0.74, 1.0] },
  { h: 5.0, amb: [0.42, 0.42, 0.66], light: 0.14, glint: [0.8, 0.72, 0.95] },
  { h: 5.5, amb: [0.8, 0.6, 0.64], light: 0.4, glint: [1.0, 0.72, 0.7] },
  { h: 6.1, amb: [1.0, 0.76, 0.6], light: 0.62, glint: [1.0, 0.8, 0.55] },
  { h: 7.0, amb: [1.0, 0.9, 0.78], light: 0.84, glint: [1.0, 0.92, 0.75] },
  { h: 8.4, amb: [1.0, 0.97, 0.92], light: 0.96, glint: [1.0, 0.98, 0.9] },
  { h: 12.5, amb: [1.0, 1.0, 0.98], light: 1.0, glint: [1.0, 1.0, 1.0] },
  { h: 16.6, amb: [1.0, 0.96, 0.87], light: 0.97, glint: [1.0, 0.95, 0.82] },
  { h: 18.2, amb: [1.0, 0.84, 0.63], light: 0.88, glint: [1.0, 0.82, 0.45] },
  { h: 19.0, amb: [0.98, 0.72, 0.55], light: 0.7, glint: [1.0, 0.66, 0.36] },
  { h: 19.6, amb: [0.88, 0.62, 0.62], light: 0.5, glint: [1.0, 0.56, 0.42] },
  { h: 20.1, amb: [0.7, 0.56, 0.78], light: 0.32, glint: [0.86, 0.6, 0.86] },
  { h: 20.8, amb: [0.46, 0.46, 0.74], light: 0.14, glint: [0.7, 0.7, 1.0] },
  { h: 21.6, amb: [0.34, 0.4, 0.67], light: 0.02, glint: [0.62, 0.74, 1.0] },
  { h: 24.0, amb: [0.32, 0.38, 0.65], light: 0.0, glint: [0.62, 0.74, 1.0] },
];

export function lerpRGB(a: RGB, b: RGB, t: number, out: RGB = [0, 0, 0]): RGB {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
  return out;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Interpolated sky keyframe at clock hour h. */
export function skyAtHour(h: number): { amb: RGB; light: number; glint: RGB } {
  const hh = ((h % 24) + 24) % 24;
  let i = 0;
  while (i < SKY_KEYS.length - 2 && SKY_KEYS[i + 1].h <= hh) i++;
  const a = SKY_KEYS[i];
  const b = SKY_KEYS[i + 1];
  const t = smooth(Math.max(0, Math.min(1, (hh - a.h) / (b.h - a.h || 1))));
  return { amb: lerpRGB(a.amb, b.amb, t), light: a.light + (b.light - a.light) * t, glint: lerpRGB(a.glint, b.glint, t) };
}

/** Phases where the day/night cycle is suspended (time runs in weeks): keep daylight. */
export function isDaylightPhase(phase: Phase): boolean {
  return phase === 'hazirlik' || phase === 'yuruyus';
}

/** Fixed clock hour used while the day/night cycle is suspended (late morning). */
export const HAZIRLIK_HOUR = 11;

export function effectiveHour(day: number, phase: Phase): number {
  return isDaylightPhase(phase) ? HAZIRLIK_HOUR : clockHours(day);
}

/** Daylight level 0..1 for an absolute day index and phase. */
export function daylight(day: number, phase: Phase): number {
  if (isDaylightPhase(phase)) return 1;
  return skyAtHour(clockHours(day)).light;
}

// ───────────────────────────── Seasons ─────────────────────────────

export type Season = 'kis' | 'ilkbahar' | 'yaz' | 'sonbahar';

export const SEASON_ADI: Record<Season, string> = {
  kis: 'Kış',
  ilkbahar: 'İlkbahar',
  yaz: 'Yaz',
  sonbahar: 'Sonbahar',
};

export interface SeasonGrade {
  /** Multiply tint applied on top of the time-of-day ambient. */
  tint: RGB;
  /** Saturation offset for the camera color matrix (−1..1). */
  sat: number;
  /** Small brightness multiplier. */
  bright: number;
}

const GRADES: Record<Season, SeasonGrade> = {
  kis: { tint: [0.86, 0.92, 1.0], sat: -0.32, bright: 1.02 },
  ilkbahar: { tint: [1.0, 1.0, 0.97], sat: 0.06, bright: 1.0 },
  yaz: { tint: [1.0, 0.95, 0.85], sat: 0.1, bright: 1.02 },
  sonbahar: { tint: [1.0, 0.89, 0.76], sat: -0.04, bright: 0.99 },
};

/** Fractional month (1.0 = 1 Ocak … 12.97 = 31 Aralık). */
export function monthFloat(day: number): number {
  const c = dayToDate(day);
  return c.month + (c.day - 1) / 31;
}

/** Season by meteorological months: Ara–Şub kış, Mar–May ilkbahar, Haz–Ağu yaz, Eyl–Kas sonbahar. */
export function seasonOf(day: number): Season {
  const m = dayToDate(day).month;
  if (m === 12 || m <= 2) return 'kis';
  if (m <= 5) return 'ilkbahar';
  if (m <= 8) return 'yaz';
  return 'sonbahar';
}

/** Season grade, blended smoothly across the month boundaries (±10 days). */
export function seasonGrade(day: number): SeasonGrade {
  const mf = monthFloat(day);
  // season centers (month float): kış 1.5, ilkbahar 4.5, yaz 7.5, sonbahar 10.5
  const order: Season[] = ['kis', 'ilkbahar', 'yaz', 'sonbahar'];
  const centers = [1.5, 4.5, 7.5, 10.5];
  // weight by triangular distance on the 12-month circle with a plateau
  let wsum = 0;
  const tint: RGB = [0, 0, 0];
  let sat = 0;
  let bright = 0;
  for (let i = 0; i < 4; i++) {
    let dm = Math.abs(mf - centers[i]);
    dm = Math.min(dm, 12 - dm);
    // full weight within 1.2 months of the center, fading to 0 at 1.8
    const w = Math.max(0, Math.min(1, (1.8 - dm) / 0.6));
    if (w <= 0) continue;
    const g = GRADES[order[i]];
    tint[0] += g.tint[0] * w;
    tint[1] += g.tint[1] * w;
    tint[2] += g.tint[2] * w;
    sat += g.sat * w;
    bright += g.bright * w;
    wsum += w;
  }
  if (wsum <= 0) return GRADES[seasonOf(day)];
  return { tint: [tint[0] / wsum, tint[1] / wsum, tint[2] / wsum], sat: sat / wsum, bright: bright / wsum };
}

// ───────────────────────────── Weather ─────────────────────────────

export type WeatherKind = 'acik' | 'yagmur' | 'dolu' | 'sis' | 'kar';

export interface Weather {
  kind: WeatherKind;
  intensity: number;
}

/** Historical weather fixed by the sources (Barbaro, Kritovoulos; Ottoman chronicles agree on the storm). */
const HIST_WEATHER: { day: number; from: number; to: number; w: Weather }[] = [
  // 24 Mayıs 1453: icon procession — thunderstorm with hail and torrential rain.
  { day: d(24, 5, 1453), from: 11, to: 16.5, w: { kind: 'dolu', intensity: 0.85 } },
  { day: d(24, 5, 1453), from: 16.5, to: 19, w: { kind: 'yagmur', intensity: 0.6 } },
  // 25 Mayıs 1453: thick fog covering the city all morning.
  { day: d(25, 5, 1453), from: 4.5, to: 13, w: { kind: 'sis', intensity: 0.9 } },
];

/**
 * Calendar ("climate") weather for a day — used when no event overrides it.
 * Deterministic: hashed per day (per week during hazırlık so it does not flicker).
 */
export function baseWeather(day: number, phase: Phase): Weather {
  const h = clockHours(day);
  const dayInt = Math.floor(day);
  for (const hw of HIST_WEATHER) {
    if (dayInt === hw.day && h >= hw.from && h < hw.to) return hw.w;
  }
  const key = isDaylightPhase(phase) ? Math.floor(day / 7) * 7 : dayInt;
  const r = hash2(key, 17, 1453);
  const r2 = hash2(key, 91, 29);
  const s = seasonOf(key);
  if (s === 'kis') {
    // the map shows snow cover Dec–Feb (world/season): precipitation falls as snow
    if (r < 0.45) return { kind: 'kar', intensity: 0.35 + r2 * 0.6 };
    if (r < 0.53) return { kind: 'sis', intensity: 0.4 + r2 * 0.4 };
    return { kind: 'acik', intensity: 0 };
  }
  // during the siege, rain only on the hashed days and only for part of the day
  const rainP = s === 'yaz' ? 0.06 : s === 'ilkbahar' ? 0.12 : 0.2;
  if (r < rainP) {
    if (isDaylightPhase(phase)) return { kind: 'yagmur', intensity: 0.3 + r2 * 0.5 };
    const start = 7 + r2 * 9;
    if (h >= start && h < start + 3 + r2 * 4) return { kind: 'yagmur', intensity: 0.3 + r2 * 0.5 };
  }
  return { kind: 'acik', intensity: 0 };
}

/** How much a weather state darkens/desaturates the scene. */
export function weatherGrade(w: Weather): { dim: number; sat: number; cool: number } {
  const i = Math.max(0, Math.min(1, w.intensity));
  switch (w.kind) {
    case 'yagmur':
      return { dim: 1 - 0.22 * i, sat: -0.28 * i, cool: 0.08 * i };
    case 'dolu':
      return { dim: 1 - 0.32 * i, sat: -0.35 * i, cool: 0.1 * i };
    case 'sis':
      return { dim: 1 - 0.05 * i, sat: -0.4 * i, cool: 0.04 * i };
    case 'kar':
      return { dim: 1 - 0.1 * i, sat: -0.2 * i, cool: 0.1 * i };
    default:
      return { dim: 1, sat: 0, cool: 0 };
  }
}

// ───────────────────────────── Wind ─────────────────────────────

/**
 * Wind in WORLD PIXELS per real second (screen space). Istanbul's prevailing
 * spring wind is the poyraz (from the NE, i.e. from screen up-right — it pushes
 * smoke toward screen-left); some days the lodos (SW) blows the other way.
 * 20 Nisan 1453: the wind dropped around midday (the Genoese ships were becalmed).
 */
export function windAt(day: number, phase: Phase): { x: number; y: number } {
  const key = isDaylightPhase(phase) ? Math.floor(day / 7) * 7 : Math.floor(day);
  const r = hash2(key, 5, 77);
  const lodos = r < 0.3;
  // base angle (radians, screen space): poyraz → toward screen-left & slightly down
  let ang = lodos ? 0.12 : Math.PI - 0.18;
  ang += (hash2(key, 9, 3) - 0.5) * 0.6;
  let strength = 5 + hash2(key, 11, 8) * 9;
  // slow gusts within the day (pure function of time)
  const f = day * 24;
  strength *= 0.75 + 0.25 * Math.sin(f * 1.3) + 0.12 * Math.sin(f * 3.7 + 1);
  ang += 0.15 * Math.sin(f * 0.7);
  if (Math.floor(day) === d(20, 4, 1453)) {
    const h = clockHours(day);
    if (h > 12 && h < 17) strength *= 0.12;
  }
  return { x: Math.cos(ang) * strength, y: Math.sin(ang) * strength * 0.5 };
}

// ───────────────────────────── Eclipse ─────────────────────────────

/** Day index of the lunar eclipse (22 Mayıs 1453). */
export const ECLIPSE_DAY = d(22, 5, 1453);

/**
 * Calendar eclipse level 0..1. The moon rose already eclipsed on the evening of
 * 22 Mayıs 1453 (Barbaro; Kritovoulos) — modeled 20:15 → 23:45.
 */
export function calendarEclipse(day: number): number {
  if (Math.floor(day) !== ECLIPSE_DAY) return 0;
  const h = clockHours(day);
  if (h < 20.25 || h > 23.75) return 0;
  if (h < 21) return smooth((h - 20.25) / 0.75);
  if (h < 22.75) return 1;
  return smooth(1 - (h - 22.75) / 1.0);
}

/** Night ambient tinted toward blood red by the eclipse level. */
export const ECLIPSE_AMB: RGB = [0.46, 0.2, 0.22];

// ───────────────────────────── Combined ambient ─────────────────────────────

export interface AmbientOut {
  amb: RGB;
  light: number;
  glint: RGB;
  sat: number;
  /** 0..1 how much point lights / glow should show (1 at night). */
  lightsVisible: number;
}

/**
 * Final ambient (lightmap fill) for a time, phase, weather and eclipse level.
 * Pure — used by the renderer every frame and by tests.
 */
export function ambientFor(day: number, phase: Phase, weather: Weather, eclipse: number): AmbientOut {
  const sky = skyAtHour(effectiveHour(day, phase));
  const g = seasonGrade(day);
  const wg = weatherGrade(weather);
  const night = 1 - sky.light;
  const amb: RGB = [sky.amb[0], sky.amb[1], sky.amb[2]];
  if (eclipse > 0) {
    const e = Math.min(1, eclipse) * Math.min(1, night * 1.4);
    lerpRGB(amb, ECLIPSE_AMB, e * 0.85, amb);
  }
  // season tint is felt most in daylight
  const st = 0.35 + 0.65 * sky.light;
  for (let i = 0; i < 3; i++) {
    const tinted = amb[i] * (1 + (g.tint[i] - 1) * st) * g.bright;
    amb[i] = tinted * wg.dim;
  }
  amb[2] = amb[2] * (1 + wg.cool);
  amb[0] = amb[0] * (1 - wg.cool * 0.5);
  for (let i = 0; i < 3; i++) amb[i] = Math.max(0, Math.min(1, amb[i]));
  const lightsVisible = Math.max(0, Math.min(1, (0.8 - sky.light) / 0.6 + (1 - wg.dim) * 0.6));
  return { amb, light: sky.light, glint: sky.glint, sat: g.sat + wg.sat, lightsVisible };
}
