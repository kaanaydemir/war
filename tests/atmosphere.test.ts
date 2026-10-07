import { describe, expect, it } from 'vitest';
import { d } from '../src/core/calendar';
import { createCoreState } from '../src/game/newGame';
import { eclipseLevel, isNight, lightLevel, season, windVector, ambientColor, currentWeather } from '../src/features/atmosphere/api';
import {
  ambientFor,
  baseWeather,
  calendarEclipse,
  daylight,
  ECLIPSE_DAY,
  seasonGrade,
  seasonOf,
  skyAtHour,
  SKY_KEYS,
  windAt,
} from '../src/features/atmosphere/sky';
import { FONT_ADV, FONT_CHARS, FONT_INDEX } from '../src/features/atmosphere/art-sky';
import { puffFrame, PUFF_DISSOLVE, PUFF_SMALL_N, PUFF_TONES, PUFF_VARIANTS, debrisFrame } from '../src/features/atmosphere/art-fx';

const siegeDay = d(16, 4, 1453);

function siegeState(frac: number) {
  const s = createCoreState('normal', 1);
  s.time.phase = 'kusatma';
  s.time.siegeStartDay = d(6, 4, 1453);
  s.time.day = siegeDay + frac;
  return s;
}

describe('atmosphere: day/night light level', () => {
  it('keeps full daylight during hazırlık and yürüyüş', () => {
    const s = createCoreState('normal', 1);
    for (const f of [0, 0.3, 0.6, 0.85, 0.99]) {
      s.time.day = d(20, 1, 1453) + f;
      s.time.phase = 'hazirlik';
      expect(lightLevel(s)).toBe(1);
      expect(isNight(s)).toBe(false);
      s.time.phase = 'yuruyus';
      expect(lightLevel(s)).toBe(1);
    }
  });

  it('is bright at noon (t 0.3) and dark at night (t 0.85)', () => {
    expect(lightLevel(siegeState(0.3))).toBeGreaterThan(0.95);
    expect(lightLevel(siegeState(0.85))).toBeLessThan(0.05);
    expect(isNight(siegeState(0.85))).toBe(true);
    expect(isNight(siegeState(0.3))).toBe(false);
    // golden hour is still day
    expect(isNight(siegeState(0.58))).toBe(false);
  });

  it('rises monotonically through dawn', () => {
    // 03:00 → 09:00 clock
    let prev = -1;
    for (let h = 3; h <= 9; h += 0.05) {
      const v = skyAtHour(h).light;
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = v;
    }
    // via the public API across the day boundary (night → dawn)
    let p = -1;
    for (let f = -0.08; f <= 0.15; f += 0.005) {
      const s = siegeState(0);
      s.time.day = siegeDay + f;
      const v = lightLevel(s);
      expect(v).toBeGreaterThanOrEqual(p - 1e-9);
      p = v;
    }
  });

  it('falls monotonically through dusk', () => {
    let prev = 2;
    for (let f = 0.5; f <= 0.75; f += 0.004) {
      const v = lightLevel(siegeState(f));
      expect(v).toBeLessThanOrEqual(prev + 1e-9);
      prev = v;
    }
  });

  it('keyframes are ordered and valid', () => {
    for (let i = 1; i < SKY_KEYS.length; i++) expect(SKY_KEYS[i].h).toBeGreaterThan(SKY_KEYS[i - 1].h);
    for (const k of SKY_KEYS) for (const c of k.amb) expect(c).toBeGreaterThanOrEqual(0);
    expect(SKY_KEYS[0].light).toBe(SKY_KEYS[SKY_KEYS.length - 1].light);
  });

  it('dawn is rose-orange, dusk violet, night deep blue', () => {
    const dawn = skyAtHour(5.8).amb;
    expect(dawn[0]).toBeGreaterThan(dawn[2]); // warm
    const dusk = skyAtHour(20.1).amb;
    expect(dusk[2]).toBeGreaterThan(dusk[1]); // violet: blue > green
    expect(dusk[0]).toBeGreaterThan(dusk[1]); // and red > green
    const night = skyAtHour(1).amb;
    expect(night[2]).toBeGreaterThan(night[0] * 1.5); // deep blue
    const golden = skyAtHour(18.5).amb;
    expect(golden[0]).toBeGreaterThan(golden[2] + 0.2);
  });

  it('daylight() matches lightLevel()', () => {
    const s = siegeState(0.42);
    expect(daylight(s.time.day, s.time.phase)).toBe(lightLevel(s));
  });
});

describe('atmosphere: seasons', () => {
  it('classifies months', () => {
    expect(seasonOf(d(20, 1, 1453))).toBe('kis');
    expect(seasonOf(d(6, 4, 1453))).toBe('ilkbahar');
    expect(seasonOf(d(15, 7, 1452))).toBe('yaz');
    expect(seasonOf(d(10, 10, 1452))).toBe('sonbahar');
    const s = createCoreState('normal', 1);
    s.time.day = d(31, 8, 1452);
    expect(season(s)).toBe('yaz');
  });

  it('winter grading is cooler and desaturated, summer warm', () => {
    const w = seasonGrade(d(20, 1, 1453));
    expect(w.tint[2]).toBeGreaterThan(w.tint[0]);
    expect(w.sat).toBeLessThan(-0.15);
    const su = seasonGrade(d(15, 7, 1452));
    expect(su.tint[0]).toBeGreaterThan(su.tint[2]);
    expect(su.sat).toBeGreaterThan(0);
  });

  it('season tint varies during hazırlık while staying daylight', () => {
    const s = createCoreState('normal', 1);
    s.time.phase = 'hazirlik';
    s.time.day = d(20, 1, 1453) + 0.85;
    const winter = ambientColor(s);
    s.time.day = d(15, 7, 1452) + 0.85;
    const summer = ambientColor(s);
    expect(winter[2]).toBeGreaterThan(winter[0]);
    expect(summer[0]).toBeGreaterThan(summer[2]);
    // daylight, not night blue
    expect(Math.min(...summer)).toBeGreaterThan(0.75);
  });
});

describe('atmosphere: wind & weather', () => {
  it('wind is deterministic and bounded', () => {
    const s = siegeState(0.4);
    const a = windVector(s);
    const b = windVector(s);
    expect(a).toEqual(b);
    for (let i = 0; i < 200; i++) {
      const w = windAt(d(1, 4, 1453) + i * 0.37, 'kusatma');
      expect(Math.hypot(w.x, w.y)).toBeLessThan(25);
    }
  });

  it('wind drops on the afternoon of 20 Nisan 1453', () => {
    const calm = windAt(d(20, 4, 1453) + 0.45, 'kusatma');
    const normal = windAt(d(21, 4, 1453) + 0.45, 'kusatma');
    expect(Math.hypot(calm.x, calm.y)).toBeLessThan(Math.hypot(normal.x, normal.y));
    expect(Math.hypot(calm.x, calm.y)).toBeLessThan(3);
  });

  it('historical hail on 24 Mayıs and fog on 25 Mayıs 1453', () => {
    // 24 May 14:00 → dayFrac (14-5)/24
    expect(baseWeather(d(24, 5, 1453) + 9 / 24, 'kusatma').kind).toBe('dolu');
    expect(baseWeather(d(25, 5, 1453) + 2 / 24, 'kusatma').kind).toBe('sis');
  });

  it('winter brings snow on some days, siege days are mostly clear', () => {
    let snow = 0;
    for (let i = 0; i < 60; i++) if (baseWeather(d(1, 1, 1453) + i, 'kusatma').kind === 'kar') snow++;
    expect(snow).toBeGreaterThan(5);
    let clear = 0;
    for (let i = 0; i < 50; i++) if (baseWeather(d(6, 4, 1453) + i + 0.4, 'kusatma').kind === 'acik') clear++;
    expect(clear).toBeGreaterThan(35);
  });

  it('hazırlık weather is stable within a week', () => {
    const a = baseWeather(d(7, 1, 1453), 'hazirlik');
    for (let k = 1; k < 7; k++) {
      const day = Math.floor(d(7, 1, 1453) / 7) * 7 + k + 0.5;
      expect(baseWeather(day, 'hazirlik').kind).toBe(baseWeather(Math.floor(d(7, 1, 1453) / 7) * 7, 'hazirlik').kind);
    }
    expect(a.kind).toBeDefined();
  });

  it('current weather falls back to the calendar before rendering', () => {
    const s = siegeState(0);
    s.time.day = d(24, 5, 1453) + 9 / 24;
    expect(currentWeather(s).kind).toBe('dolu');
  });

  it('rain darkens the ambient', () => {
    const clear = ambientFor(siegeDay + 0.3, 'kusatma', { kind: 'acik', intensity: 0 }, 0);
    const rain = ambientFor(siegeDay + 0.3, 'kusatma', { kind: 'yagmur', intensity: 1 }, 0);
    expect(rain.amb[0] + rain.amb[1] + rain.amb[2]).toBeLessThan(clear.amb[0] + clear.amb[1] + clear.amb[2]);
    expect(rain.sat).toBeLessThan(clear.sat);
  });
});

describe('atmosphere: 22 Mayıs 1453 lunar eclipse', () => {
  it('is active only that evening', () => {
    expect(calendarEclipse(ECLIPSE_DAY + (21.5 - 5) / 24)).toBe(1);
    expect(calendarEclipse(ECLIPSE_DAY + (14 - 5) / 24)).toBe(0);
    expect(calendarEclipse(ECLIPSE_DAY - 1 + (21.5 - 5) / 24)).toBe(0);
    const s = siegeState(0);
    s.time.day = ECLIPSE_DAY + (21.5 - 5) / 24;
    expect(eclipseLevel(s)).toBe(1);
  });

  it('turns the night ambient blood-red', () => {
    const t = ECLIPSE_DAY + (22 - 5) / 24;
    const normal = ambientFor(t, 'kusatma', { kind: 'acik', intensity: 0 }, 0).amb;
    const red = ambientFor(t, 'kusatma', { kind: 'acik', intensity: 0 }, 1).amb;
    expect(red[0]).toBeGreaterThan(normal[0]);
    expect(red[0]).toBeGreaterThan(red[2]);
    expect(normal[2]).toBeGreaterThan(normal[0]);
  });
});

describe('atmosphere: texture indexing', () => {
  it('puff frames are unique and in range', () => {
    const seen = new Set<number>();
    const total = PUFF_TONES * PUFF_VARIANTS * PUFF_DISSOLVE * PUFF_SMALL_N;
    for (let t = 0; t < PUFF_TONES; t++)
      for (let v = 0; v < PUFF_VARIANTS; v++)
        for (let ds = 0; ds < PUFF_DISSOLVE; ds++)
          for (let r = 0; r < PUFF_SMALL_N; r++) {
            const f = puffFrame(t, v, ds, r);
            expect(f).toBeGreaterThanOrEqual(0);
            expect(f).toBeLessThan(total);
            seen.add(f);
          }
    expect(seen.size).toBe(total);
    expect(debrisFrame(2, 3, 3)).toBe(47);
  });

  it('font covers digits, signs and Turkish capitals', () => {
    for (const ch of '0123456789+-%!.ÇĞİÖŞÜ') expect(FONT_INDEX[ch]).toBeDefined();
    for (const ch of 'GEDİK AÇILDI!'.split('')) expect(FONT_CHARS.includes(ch)).toBe(true);
    expect(FONT_ADV['M']).toBe(5);
    // lower-case Turkish text maps through tr-TR upper-casing
    expect('gedik açıldı'.toLocaleUpperCase('tr-TR')).toBe('GEDİK AÇILDI');
  });
});
