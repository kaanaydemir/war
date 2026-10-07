import { describe, expect, it } from 'vitest';
import { d } from '../src/core/calendar';
import { FLAG } from '../src/core/flags';
import type { GameState, UnitGroup } from '../src/core/state';
import { createCoreState } from '../src/game/newGame';
import { BUILDINGS } from '../src/features/economy/data';
import {
  approach,
  clamp01,
  defenderRange,
  divanLabel,
  erzakLevel,
  fmtCompact,
  fmtDateRange,
  fmtDays,
  fmtDelta,
  fmtInt,
  fmtPct,
  fmtShortDate,
  galataLabel,
  moraleLabel,
  reliefTension,
  splitSuffix,
  uiScale,
} from '../src/ui/hud/format';
import {
  breachColor,
  buildMenuItems,
  checklistOk,
  logToToastKind,
  pickGroupFor,
  readinessChecklist,
  safe,
  sonHucumChecklist,
  ToastQueue,
  totalMen,
  unitTypeName,
  viewQuad,
} from '../src/ui/hud/logic';
import { drawEdirne, drawFrame, drawNight, drawPaper, drawSacak, EDIRNE_H, EDIRNE_W, FRAME_SLICE, ICONS, LEGEND, renderIcon } from '../src/ui/hud/art';
import { tileToWorld } from '../src/core/iso';

function state(): GameState {
  return createCoreState('normal', 1453);
}

function group(s: GameState, type: UnitGroup['type'], id: number, extra: Partial<UnitGroup> = {}): UnitGroup {
  const g: UnitGroup = {
    id,
    type,
    name: `${type} ${id}`,
    commanderId: null,
    men: 500,
    maxMen: 500,
    morale: 70,
    fatigue: 0,
    xp: 0,
    tx: 10,
    ty: 10,
    path: [],
    order: { type: 'bekle' },
    status: 'bosta',
    facing: 1,
    ...extra,
  };
  s.groups.push(g);
  return g;
}

describe('ui-hud format', () => {
  it('formats integers the Turkish way', () => {
    expect(fmtInt(0)).toBe('0');
    expect(fmtInt(999)).toBe('999');
    expect(fmtInt(38000)).toBe('38.000');
    expect(fmtInt(1600000)).toBe('1.600.000');
    expect(fmtInt(-2500)).toBe('−2.500');
    expect(fmtInt(Infinity)).toBe('∞');
  });
  it('compacts large amounts to ≤ 5 glyphs', () => {
    expect(fmtCompact(9850)).toBe('9.850');
    expect(fmtCompact(38000)).toBe('38B');
    expect(fmtCompact(38500)).toBe('38,5B');
    expect(fmtCompact(385000)).toBe('385B');
    expect(fmtCompact(1600000)).toBe('1,6Mn');
    expect(fmtCompact(-12000)).toBe('−12B');
    for (const n of [0, 7, 9999, 10000, 99999, 123456, 999999, 1e6, 5.5e7]) expect(fmtCompact(n).length).toBeLessThanOrEqual(6);
  });
  it('formats deltas, days and percents', () => {
    expect(fmtDelta(12)).toBe('+12');
    expect(fmtDelta(-5)).toBe('−5');
    expect(fmtDelta(0.2)).toBe('0');
    expect(fmtDays(Infinity)).toBe('∞');
    expect(fmtDays(4.54)).toBe('4,5');
    expect(fmtDays(4)).toBe('4');
    expect(fmtDays(27.9)).toBe('27');
    expect(fmtDays(-3)).toBe('0');
    expect(fmtPct(0.284)).toBe('%28');
    expect(fmtPct(NaN)).toBe('%0');
  });
  it('formats short dates and windows', () => {
    expect(fmtShortDate(d(29, 5, 1453))).toBe('29 May');
    expect(fmtShortDate(d(6, 4, 1453) + 0.7)).toBe('6 Nis');
    expect(fmtDateRange(d(22, 6, 1453), d(28, 5, 1453))).toBe('28 May – 22 Haz');
    expect(fmtDateRange(d(1, 6, 1453), d(1, 6, 1453) + 0.5)).toBe('1 Haz');
  });
  it('relief tension rises as the window approaches', () => {
    const min = d(28, 5, 1453);
    const max = d(20, 6, 1453);
    expect(reliefTension(min - 40, min, max, false).level).toBe(0);
    expect(reliefTension(min - 15, min, max, false).level).toBe(1);
    expect(reliefTension(min - 3, min, max, false).level).toBe(2);
    expect(reliefTension(min + 1, min, max, false).level).toBe(3);
    expect(reliefTension(min + 1, min, max, true).level).toBe(4);
  });
  it('gauge labels and ranges', () => {
    expect(moraleLabel(90)).toBe('Coşkulu');
    expect(moraleLabel(10)).toBe('Çökmek üzere');
    expect(divanLabel(-80)).toContain('Barış');
    expect(divanLabel(0)).toBe('Divan kararsız');
    expect(divanLabel(80)).toContain('Savaş');
    expect(galataLabel(0)).toBe('Tarafsız');
    expect(galataLabel(-70)).toBe('Düşmanca');
    const [lo, hi] = defenderRange(7000, 0);
    expect(lo).toBeLessThan(7000);
    expect(hi).toBeGreaterThan(7000);
    const [lo2, hi2] = defenderRange(7000, 100);
    expect(hi2 - lo2).toBeLessThan(hi - lo);
    expect(erzakLevel(Infinity)).toBe(0);
    expect(erzakLevel(20)).toBe(0);
    expect(erzakLevel(10)).toBe(1);
    expect(erzakLevel(3)).toBe(2);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(NaN)).toBe(0);
  });
  it('counters approach their target and snap', () => {
    let v = 0;
    for (let i = 0; i < 120; i++) v = approach(v, 1000, 1 / 60);
    expect(v).toBe(1000);
    expect(approach(5, 5.3, 0.016)).toBe(5.3);
  });
  it('splits compact unit suffixes', () => {
    expect(splitSuffix('38,5B')).toEqual(['38,5', 'B']);
    expect(splitSuffix('1,6Mn')).toEqual(['1,6', 'Mn']);
    expect(splitSuffix('9.850')).toEqual(['9.850', '']);
    expect(splitSuffix('−12B')).toEqual(['−12', 'B']);
  });
  it('chooses the UI pixel scale', () => {
    expect(uiScale(1280, 720)).toBe(2);
    expect(uiScale(1920, 1080)).toBe(3);
    expect(uiScale(2560, 1440)).toBe(3);
    expect(uiScale(1920, 900)).toBe(2);
  });
});

describe('ui-hud logic', () => {
  it('safe() swallows feature errors', () => {
    expect(
      safe(() => {
        throw new Error('half-written feature');
      }, 7),
    ).toBe(7);
    expect(safe(() => undefined, 3)).toBe(3);
  });
  it('unit names fall back when army data is empty', () => {
    expect(unitTypeName('yeniceri').length).toBeGreaterThan(3);
    expect(unitTypeName('lagimci')).toMatch(/Lağımcı/);
  });
  it('readiness checklist for YOLA ÇIK', () => {
    const s = state();
    let items = readinessChecklist(s);
    expect(items).toHaveLength(4);
    expect(items.every((i) => i.soft)).toBe(true);
    expect(checklistOk(items)).toBe(true);
    s.flags[FLAG.hisarTamam] = true;
    s.flags[FLAG.sahiDokuldu] = true;
    group(s, 'yeniceri', 1, { men: 60000, maxMen: 60000 });
    items = readinessChecklist(s);
    expect(items[0].ok && items[1].ok && items[2].ok).toBe(true);
    expect(totalMen(s)).toBe(60000);
  });
  it('final assault checklist gates on siege phase', () => {
    const s = state();
    expect(checklistOk(sonHucumChecklist(s))).toBe(false);
    s.time.phase = 'kusatma';
    expect(checklistOk(sonHucumChecklist(s))).toBe(true);
    s.flags[FLAG.sonHucumIlan] = true;
    expect(checklistOk(sonHucumChecklist(s))).toBe(false);
  });
  it('build menu is phase-aware with Turkish lock reasons', () => {
    const s = state();
    s.time.phase = 'hazirlik';
    const items = buildMenuItems(s, BUILDINGS);
    expect(items.length).toBeGreaterThan(0);
    expect(items.some((i) => i.def.id === 'rumeli-hisari')).toBe(false); // scripted, not placeable
    const siper = items.find((i) => i.def.id === 'siper');
    if (siper) expect(siper.locked).toMatch(/kuşatma/i);
    const tas = items.find((i) => i.def.id === 'tas-ocagi');
    if (tas) expect(tas.locked).toBeNull();
    s.resources.akce = 0;
    s.resources.kereste = 0;
    const tas2 = buildMenuItems(s, BUILDINGS).find((i) => i.def.id === 'tas-ocagi');
    if (tas2) expect(tas2.affordable).toBe(false);
  });
  it('picks the best group for a job', () => {
    const s = state();
    group(s, 'azap', 1, { status: 'savasiyor', tx: 0, ty: 0 });
    group(s, 'azap', 2, { status: 'bosta', tx: 50, ty: 50 });
    group(s, 'basibozuk', 3, { status: 'bosta', tx: 1, ty: 1 });
    group(s, 'azap', 4, { status: 'dagildi' });
    expect(pickGroupFor(s, ['azap'], { tx: 0, ty: 0 })?.id).toBe(2);
    expect(pickGroupFor(s, ['azap', 'basibozuk'], { tx: 0, ty: 0 })?.id).toBe(3);
    expect(pickGroupFor(s, ['azap'], null, [1])?.id).toBe(1);
    expect(pickGroupFor(s, ['lagimci'], null)).toBeNull();
  });
  it('toast queue merges duplicates, caps and expires', () => {
    const q = new ToastQueue(3, 1000, 500);
    q.push('Gedik açıldı', 'basari', 0);
    q.push('Gedik açıldı', 'basari', 100);
    expect(q.items).toHaveLength(1);
    expect(q.items[0].count).toBe(2);
    q.push('a', 'bilgi', 200);
    q.push('b', 'bilgi', 200);
    q.push('c', 'tehlike', 200);
    expect(q.items).toHaveLength(3);
    expect(q.items.map((t) => t.text)).toEqual(['a', 'b', 'c']);
    expect(q.prune(1250)).toBe(true);
    expect(q.items.map((t) => t.text)).toEqual(['c']); // danger lives longer
    q.remove(q.items[0].id);
    expect(q.items).toHaveLength(0);
  });
  it('log kinds map to toasts', () => {
    expect(logToToastKind('kayip')).toBe('tehlike');
    expect(logToToastKind('bilgi')).toBeNull();
  });
  it('minimap helpers', () => {
    expect(breachColor(0)).not.toBe(breachColor(0.6));
    const a = tileToWorld(10, 20);
    const b = tileToWorld(30, 20);
    const q = viewQuad({ x: a.x, y: a.y - 8, w: 64, h: 32 }, (x, y) => ({ tx: x, ty: y }));
    expect(q).toHaveLength(4);
    expect(b.x).toBeGreaterThan(a.x);
  });
});

describe('ui-hud art', () => {
  it('every string-art icon uses known legend chars and equal row widths', () => {
    for (const [name, def] of Object.entries(ICONS)) {
      const strip = renderIcon(def);
      expect(strip.w, name).toBe(def.w * def.frames);
      expect(strip.h, name).toBe(def.h);
      let opaque = 0;
      for (let i = 3; i < strip.data.length; i += 4) if (strip.data[i]) opaque++;
      expect(opaque, `${name} draws something`).toBeGreaterThan(8);
    }
  });
  it('legend colours are valid hex', () => {
    for (const c of Object.values(LEGEND)) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
  });
  it('frames, textures and panorama have the expected sizes', () => {
    const f = drawFrame('kagit');
    expect(f.w).toBe(FRAME_SLICE * 2 + 4);
    expect(f.alphaAt(0, 0)).toBe(0); // rounded corner
    expect(f.alphaAt(FRAME_SLICE, 0)).toBe(255);
    expect(drawFrame('gece').h).toBe(f.h);
    expect(drawPaper().w).toBe(32);
    expect(drawNight().w).toBe(16);
    expect(drawSacak().w).toBe(8);
    const e = drawEdirne();
    expect([e.w, e.h]).toEqual([EDIRNE_W, EDIRNE_H]);
  });
});
