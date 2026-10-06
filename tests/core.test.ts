import { describe, expect, it } from 'vitest';
import { d, dateToDay, dayToDate, formatDate, segmentOf } from '../src/core/calendar';
import { tileToWorld, worldToTile } from '../src/core/iso';
import { createWorld } from '../src/features/world/terrain';
import { landmarkTile } from '../src/data/landmarks';
import { buildState } from '../src/game/scenarios';
import { FEATURES } from '../src/game/features';

describe('calendar', () => {
  it('round-trips dates', () => {
    for (const [dd, mm, yy] of [[1, 3, 1452], [15, 4, 1452], [31, 8, 1452], [28, 2, 1453], [1, 3, 1453], [6, 4, 1453], [29, 5, 1453]]) {
      const n = d(dd, mm, yy);
      expect(dayToDate(n)).toEqual({ day: dd, month: mm, year: yy });
    }
    expect(formatDate(d(29, 5, 1453))).toBe('29 Mayıs 1453');
    expect(dateToDay({ year: 1453, month: 5, day: 29 }) - dateToDay({ year: 1453, month: 4, day: 6 })).toBe(53);
  });
  it('segments', () => {
    expect(segmentOf(10.01)).toBe('safak');
    expect(segmentOf(10.3)).toBe('gunduz');
    expect(segmentOf(10.62)).toBe('aksam');
    expect(segmentOf(10.9)).toBe('gece');
  });
});

describe('iso', () => {
  it('inverts', () => {
    const w = tileToWorld(37.25, 81.5);
    const t = worldToTile(w.x, w.y);
    expect(t.tx).toBeCloseTo(37.25);
    expect(t.ty).toBeCloseTo(81.5);
  });
});

describe('world', () => {
  const world = createWorld();
  it('has water in the Bosphorus and land at the walls', () => {
    const top = landmarkTile('topkapi');
    expect(world.isWater(top.tx - 2, top.ty)).toBe(false);
    const ayasofya = landmarkTile('ayasofya');
    expect(world.isWater(ayasofya.tx, ayasofya.ty)).toBe(false);
    // middle of the Bosphorus between Rumeli and Anadolu Hisarı
    const r = landmarkTile('rumeliHisari');
    const a = landmarkTile('anadoluHisari');
    expect(world.isWater((r.tx + a.tx) / 2, (r.ty + a.ty) / 2)).toBe(true);
  });
  it('finds a land path from the Ottoman camp to Rumeli Hisarı', () => {
    const p = world.findPath(landmarkTile('otag'), world.nearestPassable(landmarkTile('rumeliHisari'), 'land')!, 'land');
    expect(p).not.toBeNull();
  });
});

describe('scenarios', () => {
  it('builds every scenario without throwing', () => {
    const world = createWorld();
    for (const n of ['yeni-oyun', 'bombardiman', 'son-hucum', 'zafer'] as const) {
      const s = buildState(n, 'normal', 1, world, FEATURES);
      expect(s.time.day).toBeGreaterThanOrEqual(0);
      expect(Object.keys(s.sections).length).toBeGreaterThan(10);
      expect(() => JSON.stringify(s)).not.toThrow();
    }
  });
});
