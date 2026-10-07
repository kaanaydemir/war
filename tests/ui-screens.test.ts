import { describe, expect, it } from 'vitest';
import { d } from '../src/core/calendar';
import { FLAG } from '../src/core/flags';
import type { GameState } from '../src/core/state';
import { SOURCES } from '../src/data/sources';
import { SCENARIOS } from '../src/game/scenarios';
import {
  drawBannerFrame,
  drawButton,
  drawDividerCenter,
  drawFrameGece,
  drawFrameKagit,
  drawIcon,
  drawPageCorner,
  drawPaper,
  drawSeal,
  drawSkyline,
  drawSparkleStrip,
  drawTug,
  FRAME_SIZE,
  ICON_ROWS,
} from '../src/ui/screens/art';
import { DIFFICULTY_INFO, LOAD_FACTS, SCENARIO_INFO, YENILGI_TEXT, ZAFER_CLOSING, ZAFER_LINES } from '../src/ui/screens/content';
import {
  compareSiege,
  difficultyDetail,
  firstEnabled,
  fitScale,
  fmtInt,
  fmtPct,
  groupSources,
  lessonsFor,
  navStep,
  parseSettings,
  siegeDaysOf,
  splitDogrulanacak,
  statRows,
  tickValue,
  uiPx,
  weekdayName,
} from '../src/ui/screens/logic';
import { canRender, drawLogo, drawLogoGlint, textMask } from '../src/ui/screens/logo';

const CORE = { musicVolume: 0.6, sfxVolume: 0.8, autoPauseAtDawn: true, showTutorial: true };

function fakeState(over: Partial<GameState> = {}): GameState {
  return {
    flags: {},
    stats: { ottomanLosses: 0, byzantineLosses: 0, shotsFired: 0, breaches: 0, assaults: 0, shipsLost: 0 },
    morale: 60,
    divan: 0,
    time: { day: d(1, 6, 1453), siegeStartDay: d(6, 4, 1453) } as GameState['time'],
    outcome: null,
    ...over,
  } as GameState;
}

describe('navStep', () => {
  it('wraps and skips disabled items', () => {
    expect(navStep(0, 1, 4)).toBe(1);
    expect(navStep(3, 1, 4)).toBe(0);
    expect(navStep(0, -1, 4)).toBe(3);
    expect(navStep(0, 1, 4, (k) => k === 1)).toBe(2);
    expect(navStep(2, -1, 4, (k) => k === 1)).toBe(0);
  });
  it('keeps the index when everything is disabled or empty', () => {
    expect(navStep(2, 1, 4, () => true)).toBe(2);
    expect(navStep(0, 1, 0)).toBe(0);
  });
  it('firstEnabled', () => {
    expect(firstEnabled(3, (k) => k < 2)).toBe(2);
    expect(firstEnabled(3, () => true)).toBe(0);
  });
});

describe('formatting', () => {
  it('Turkish numbers and percentages', () => {
    expect(fmtInt(1234567)).toBe('1.234.567');
    expect(fmtInt(12)).toBe('12');
    expect(fmtPct(0.42)).toBe('%42');
    expect(fmtPct(2)).toBe('%100');
  });
  it('ticking counters ease to the target', () => {
    expect(tickValue(100, 0)).toBe(0);
    expect(tickValue(100, 1)).toBe(100);
    expect(tickValue(100, 0.5)).toBeGreaterThan(50);
  });
  it('fitScale picks the largest integer that fits', () => {
    expect(fitScale(219, 1200, 6)).toBe(5);
    expect(fitScale(219, 100, 6)).toBe(1);
  });
  it('uiPx follows the HUD thresholds unless forced', () => {
    expect(uiPx(1280, 720)).toBe(2);
    expect(uiPx(1920, 1080)).toBe(3);
    expect(uiPx(1280, 720, 3)).toBe(3);
  });
});

describe('siege comparison', () => {
  it('compares with the historical 53 days', () => {
    const c = compareSiege(47);
    expect(c.main).toContain('47 günde');
    expect(c.main).toContain('53 gün');
    expect(c.delta).toBe(6);
    expect(compareSiege(53).verdict).toBe('Tam tarihteki gibi.');
    expect(compareSiege(60).verdict).toContain('7 gün sonra');
    expect(compareSiege(null).main).toContain('53');
  });
  it('siegeDaysOf prefers outcome.siegeDays, else derives from the calendar', () => {
    expect(siegeDaysOf(fakeState({ outcome: { result: 'zafer', day: 0, siegeDays: 41 } }))).toBe(41);
    const s = fakeState({ outcome: { result: 'zafer', day: d(29, 5, 1453) + 0.3, siegeDays: null } });
    expect(siegeDaysOf(s)).toBe(54);
    expect(siegeDaysOf(null)).toBeNull();
  });
  it('29 Mayıs 1453 was a Tuesday (Salı)', () => {
    const ref = d(29, 5, 1453);
    expect(weekdayName(ref + 0.4, ref)).toBe('Salı');
    expect(weekdayName(ref + 1, ref)).toBe('Çarşamba');
    expect(weekdayName(d(6, 4, 1453), ref)).toBe('Cuma');
  });
  it('stat rows cover every Stats field', () => {
    const rows = statRows(fakeState().stats);
    expect(rows.map((r) => r.id).sort()).toEqual(['assaults', 'breaches', 'byzantineLosses', 'ottomanLosses', 'shipsLost', 'shotsFired']);
    expect(statRows(null).every((r) => r.value === 0)).toBe(true);
  });
});

describe('defeat advice', () => {
  it('relief defeat suggests diplomacy that was skipped', () => {
    const s = fakeState({ outcome: { result: 'yenilgi-hacli', day: 0, siegeDays: 67 } });
    const l = lessonsFor(s, 10);
    expect(l.some((x) => x.includes('Macaristan'))).toBe(true);
    expect(l.some((x) => x.includes('Şahi'))).toBe(true);
  });
  it('does not suggest what was already done and respects the limit', () => {
    const s = fakeState({
      outcome: { result: 'yenilgi-hacli', day: 0, siegeDays: 67 },
      flags: { [FLAG.sahiCephede]: true, [FLAG.gemilerKaradan]: true, [FLAG.macarAteskes]: true },
      stats: { ottomanLosses: 1, byzantineLosses: 1, shotsFired: 10, breaches: 2, assaults: 1, shipsLost: 0 },
    });
    const l = lessonsFor(s, 3);
    expect(l.length).toBeLessThanOrEqual(3);
    expect(l.some((x) => x.includes('Macaristan'))).toBe(false);
    expect(l.some((x) => x.includes('Şahi'))).toBe(false);
  });
  it('divan defeat talks about morale/provisions', () => {
    const s = fakeState({ outcome: { result: 'yenilgi-divan', day: 0, siegeDays: 40 }, morale: 20, divan: -40 });
    const l = lessonsFor(s, 10);
    expect(l.some((x) => x.includes('moral'))).toBe(true);
    expect(lessonsFor(null)).toEqual([]);
  });
});

describe('settings persistence', () => {
  it('falls back to defaults on garbage', () => {
    expect(parseSettings('{oops', CORE).core).toEqual(CORE);
    expect(parseSettings(null, CORE).extra.uiOlcek).toBe('oto');
  });
  it('clamps and validates fields', () => {
    const r = parseSettings(JSON.stringify({ core: { musicVolume: 3, sfxVolume: 'x', showTutorial: false }, extra: { uiOlcek: 3, kenarKaydirma: false } }), CORE);
    expect(r.core.musicVolume).toBe(1);
    expect(r.core.sfxVolume).toBe(0.8);
    expect(r.core.showTutorial).toBe(false);
    expect(r.extra.uiOlcek).toBe(3);
    expect(r.extra.kenarKaydirma).toBe(false);
    expect(parseSettings(JSON.stringify({ extra: { uiOlcek: 7 } }), CORE).extra.uiOlcek).toBe('oto');
  });
});

describe('content', () => {
  it('sources are grouped in the documented order', () => {
    const g = groupSources(SOURCES);
    expect(g.map((x) => x.title)).toEqual(['Osmanlı kaynakları', 'Belgeler', 'Modern çalışmalar', 'Kontrol amaçlı']);
    expect(g.reduce((n, x) => n + x.items.length, 0)).toBe(SOURCES.length);
  });
  it('every gallery scenario exists and has an illustration key', () => {
    for (const s of SCENARIO_INFO) {
      expect(SCENARIOS[s.name], s.name).toBeTruthy();
      expect(s.image.startsWith('olay/')).toBe(true);
    }
    expect(new Set(SCENARIO_INFO.map((s) => s.name)).size).toBe(Object.keys(SCENARIOS).length);
  });
  it('difficulty details are derived from the byzantium data', () => {
    const relief = { kolay: { earliest: 80, latest: 100 }, normal: { earliest: 70, latest: 90 }, zor: { earliest: 60, latest: 75 } };
    const repair = { kolay: 0.8, normal: 1, zor: 1.22 };
    expect(difficultyDetail('normal', relief, repair, 10).yardim).toContain('61. gün');
    expect(difficultyDetail('normal', relief, repair, 10).onarim).toContain('tarihteki hızla');
    expect(difficultyDetail('zor', relief, repair, 10).onarim).toContain('1,22 katı');
    expect(difficultyDetail('kolay', relief, repair, 10).onarim).toContain('yavaş');
    expect(DIFFICULTY_INFO.map((x) => x.id)).toEqual(['kolay', 'normal', 'zor']);
  });
  it('texts are present and use Turkish (no placeholder/TODO)', () => {
    const all = [...LOAD_FACTS.map((f) => f.text), ...ZAFER_LINES, ...ZAFER_CLOSING, ...Object.values(YENILGI_TEXT).flatMap((t) => [t.title, ...t.lines, t.tarihte])];
    expect(LOAD_FACTS.length).toBeGreaterThan(10);
    for (const t of all) {
      expect(t.length).toBeGreaterThan(8);
      expect(t).not.toMatch(/TODO|FIXME|[Ll]orem ipsum/);
    }
    // the closing acknowledges the human cost and the emperor's death
    const closing = ZAFER_CLOSING.join(' ');
    expect(closing).toContain('esir');
    expect(closing).toContain('Konstantinos');
  });
  it('splits "(doğrulanacak)" marks for badges', () => {
    const p = splitDogrulanacak('Bir bilgi (doğrulanacak: tarih) ve devamı.');
    expect(p.map((x) => x.mark)).toEqual([false, true, false]);
    expect(p[1].text).toBe('doğrulanacak: tarih');
    expect(splitDogrulanacak('düz metin')).toEqual([{ text: 'düz metin', mark: false }]);
  });
});

describe('pixel art', () => {
  it('the logotype font covers the title and year', () => {
    expect(canRender("İSTANBUL'UN FETHİ")).toBe(true);
    expect(canRender('1453')).toBe(true);
    expect(canRender('Ç')).toBe(false);
    const m = textMask('1453');
    expect(m.bits.some((b) => b === 1)).toBe(true);
    expect(() => textMask('Q')).toThrow();
  });
  it('logo & glint compose with opaque gold pixels', () => {
    const l = drawLogo();
    expect(l.canvas.w).toBeGreaterThan(150);
    expect(l.sparkles.length).toBeGreaterThan(10);
    let opaque = 0;
    for (let i = 3; i < l.canvas.data.length; i += 4) if (l.canvas.data[i] === 255) opaque++;
    expect(opaque).toBeGreaterThan(2000);
    const g = drawLogoGlint(l, 8);
    expect(g.w).toBe(l.canvas.w * 9);
  });
  it('frames, buttons, icons and set pieces draw without unknown palette chars', () => {
    expect(drawFrameKagit().w).toBe(FRAME_SIZE);
    expect(drawFrameGece().h).toBe(FRAME_SIZE);
    for (const st of ['normal', 'hover', 'basili', 'pasif', 'kirmizi'] as const) expect(drawButton(st).w).toBe(18);
    for (const k of Object.keys(ICON_ROWS)) expect(drawIcon(k), k).not.toBeNull();
    expect(drawIcon('yok')).toBeNull();
    for (const n of [1, 2, 3]) expect(drawTug(n).h).toBe(34);
    for (let f = 0; f < 8; f++) expect(drawBannerFrame(f).w).toBe(52);
    expect(drawPaper().w).toBe(64);
    expect(drawSkyline().w).toBe(320);
    expect(drawSparkleStrip().w).toBe(42);
    expect(drawSeal().w).toBe(22);
    expect(drawPageCorner().w).toBe(28);
    expect(drawDividerCenter().h).toBe(7);
  });
  it('9-slice frame corners are opaque (no see-through seams)', () => {
    const f = drawFrameKagit();
    for (const [x, y] of [
      [0, 0],
      [FRAME_SIZE - 1, 0],
      [0, FRAME_SIZE - 1],
      [FRAME_SIZE - 1, FRAME_SIZE - 1],
    ])
      expect(f.get(x, y)[3]).toBe(255);
  });
});
