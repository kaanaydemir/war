import { describe, expect, it } from 'vitest';
import { Bus } from '../src/core/bus';
import { d } from '../src/core/calendar';
import type { SimContext } from '../src/core/feature';
import { FLAG } from '../src/core/flags';
import { Rng } from '../src/core/rng';
import type { GameState } from '../src/core/state';
import type { WorldApi } from '../src/core/world';
import { LANDMARKS } from '../src/data/landmarks';
import { SOURCE_BY_ID, SOURCES } from '../src/data/sources';
import { createCoreState } from '../src/game/newGame';
import {
  activeTips,
  currentObjectives,
  encyclopediaForEvent,
  eventCardView,
  eventHistory,
  EVENT_ENCYCLOPEDIA,
  getDawnReport,
  getEncyclopediaEntry,
  searchEncyclopedia,
} from '../src/features/events/api';
import { ILLUSTRATION_KEYS, paintIllustration } from '../src/features/events/art';
import { EVENT_BY_ID, EVENTS, EVENTS_X } from '../src/features/events/data';
import { ENCYCLOPEDIA } from '../src/features/events/encyclopedia';
import { applyHistoryUntil, eventsFeature } from '../src/features/events/index';
import { priv } from '../src/features/events/effects';
import { AUTO_CLOSE_SEC, eventsCommand, eventsTick } from '../src/features/events/sim';
import { eclipseAt, weatherAt } from '../src/features/events/sky';

const worldStub = { regionAt: () => 'halic' } as unknown as WorldApi;

function mkCtx(bus = new Bus(), dtDays = 0.05, dtSec = 0.1): SimContext {
  return { dtSec, dtDays, rng: new Rng(42), bus, world: worldStub };
}

function freshState(): GameState {
  const s = createCoreState('normal', 7);
  eventsFeature.initState!(s, worldStub);
  return s;
}

function pickHistorical(s: GameState, ctx: SimContext): void {
  const a = s.events.active;
  if (!a) return;
  const def = EVENT_BY_ID[a.eventId];
  if (def.choices?.length) {
    const c = def.choices.find((x) => x.tarihi) ?? def.choices[0];
    eventsCommand(s, { t: 'olay-secim', eventId: a.eventId, choiceId: c.id }, ctx);
  } else {
    eventsCommand(s, { t: 'olay-kapat', eventId: a.eventId }, ctx);
  }
}

describe('event definitions', () => {
  it('have unique ids and valid fields', () => {
    const ids = new Set<string>();
    for (const e of EVENTS_X) {
      expect(ids.has(e.id), e.id).toBe(false);
      ids.add(e.id);
      expect(e.code).toMatch(/^(H\d+|K\d+|Y\d+|D\d+)$/);
      expect(['sabit', 'kosullu', 'tepkisel', 'karar']).toContain(e.kind);
      expect(e.title.length, e.id).toBeGreaterThan(3);
      expect(e.dateLabel.length, e.id).toBeGreaterThan(3);
      expect(e.text.length, e.id).toBeGreaterThan(60);
      expect(e.tarihte.length, e.id).toBeGreaterThan(40);
      expect(e.sources.length, e.id).toBeGreaterThan(0);
      for (const src of e.sources) expect(SOURCE_BY_ID[src], `${e.id} → ${src}`).toBeTruthy();
      if (e.image) expect(ILLUSTRATION_KEYS, e.id).toContain(e.image);
      if (e.focus) expect(LANDMARKS[e.focus], e.id).toBeTruthy();
      if (e.earliestDay != null && e.latestDay != null) expect(e.latestDay).toBeGreaterThan(e.earliestDay);
      expect(typeof e.onFire).toBe('function');
      if (e.kind === 'karar') {
        expect(e.choices?.length ?? 0, e.id).toBeGreaterThanOrEqual(2);
        const tarihi = e.choices!.filter((c) => c.tarihi).length;
        // design decisions carry exactly one historical choice; game-only minor ones may have none
        if (!e.minor) expect(tarihi, e.id).toBe(1);
        else expect(tarihi, e.id).toBeLessThanOrEqual(1);
        expect(new Set(e.choices!.map((c) => c.id)).size).toBe(e.choices!.length);
      }
      // Ottoman sources are primary: no card relies only on control sources
      const groups = e.sources.map((x) => SOURCE_BY_ID[x].group);
      expect(groups.some((g) => g !== 'kontrol'), `${e.id} uses only control sources`).toBe(true);
    }
    expect(EVENTS.length).toBe(EVENTS_X.length);
  });

  it('cover every design code H1–H10 and K1–K19 and ≥10 minor events', () => {
    const codes = new Set(EVENTS_X.map((e) => e.code));
    for (let i = 1; i <= 10; i++) expect(codes.has(`H${i}`), `H${i}`).toBe(true);
    for (let i = 1; i <= 19; i++) expect(codes.has(`K${i}`), `K${i}`).toBe(true);
    expect(EVENTS_X.filter((e) => e.minor && e.code.startsWith('Y')).length).toBeGreaterThanOrEqual(10);
  });

  it('use correct Turkish characters (no ASCII stand-ins in key words)', () => {
    const all = EVENTS_X.map((e) => `${e.title} ${e.text} ${e.tarihte}`).join(' ');
    for (const bad of [' Sultan in ', 'Istanbul', ' Halic', 'Bogaz ', 'Zaganos', 'Fatih Sultan Mehmet']) expect(all.includes(bad), bad).toBe(false);
  });

  it('has illustrations for the major cards', () => {
    for (const id of ['h3-hisar-temel', 'h5-orban', 'k1-ordu-surlarda', 'k5-deniz-savasi', 'k7-gemiler-karadan', 'k14-ay-tutulmasi', 'k19-ulubatli-hasan'])
      expect(EVENT_BY_ID[id].image, id).toBeTruthy();
    for (const key of ILLUSTRATION_KEYS) {
      const p = paintIllustration(key, 1)!;
      expect(p.w).toBe(160);
      expect(p.h).toBe(96);
      // the picture area is fully painted (no holes)
      let holes = 0;
      for (let y = 6; y < 90; y++) for (let x = 6; x < 154; x++) if (p.alphaAt(x, y) === 0) holes++;
      expect(holes, key).toBe(0);
    }
  });
});

describe('encyclopedia', () => {
  it('has ≥45 valid entries covering every source', () => {
    expect(ENCYCLOPEDIA.length).toBeGreaterThanOrEqual(45);
    const ids = new Set(ENCYCLOPEDIA.map((e) => e.id));
    expect(ids.size).toBe(ENCYCLOPEDIA.length);
    for (const e of ENCYCLOPEDIA) {
      expect(e.body.length, e.id).toBeGreaterThan(0);
      expect(e.body.join(' ').length, e.id).toBeGreaterThan(80);
      for (const s of e.sources) expect(SOURCE_BY_ID[s], `${e.id} → ${s}`).toBeTruthy();
      for (const r of e.related ?? []) expect(ids.has(r), `${e.id} → ${r}`).toBe(true);
    }
    for (const src of SOURCES) expect(ids.has(`kaynak-${src.id}`), src.id).toBe(true);
    const cats = new Set(ENCYCLOPEDIA.map((e) => e.category));
    for (const c of ['kisi', 'yer', 'olay', 'silah', 'kaynak', 'kavram']) expect(cats.has(c as never), c).toBe(true);
  });

  it('links events to entries and searches with Turkish folding', () => {
    for (const [ev, list] of Object.entries(EVENT_ENCYCLOPEDIA)) {
      expect(EVENT_BY_ID[ev], ev).toBeTruthy();
      for (const id of list) expect(getEncyclopediaEntry(id), `${ev} → ${id}`).toBeTruthy();
    }
    expect(encyclopediaForEvent('k7-gemiler-karadan').length).toBeGreaterThan(1);
    expect(searchEncyclopedia('zaganos')[0].id).toBe('zaganos-pasa');
    expect(searchEncyclopedia('AYASOFYA').some((e) => e.id === 'ayasofya')).toBe(true);
  });
});

describe('engine', () => {
  it('karar cards pause and resume the game', () => {
    const s = freshState();
    const bus = new Bus();
    const fired: string[] = [];
    bus.on('event:fired', (e) => fired.push(e.eventId));
    const ctx = mkCtx(bus);
    s.time.speed = 2;
    s.time.day = d(1, 3, 1452) + 0.3;
    eventsTick(s, ctx);
    expect(fired).toContain('h1-divan');
    expect(s.events.active?.eventId).toBe('h1-divan');
    expect(s.time.speed).toBe(0);
    // closing a decision card without choosing is ignored
    eventsCommand(s, { t: 'olay-kapat', eventId: 'h1-divan' }, ctx);
    expect(s.events.active?.eventId).toBe('h1-divan');
    const divan0 = s.divan;
    const view = eventCardView(s)!;
    expect(view.isDecision).toBe(true);
    expect(view.choices.find((c) => c.tarihi)?.id).toBe('halil-gorevde');
    eventsCommand(s, { t: 'olay-secim', eventId: 'h1-divan', choiceId: 'halil-gorevde' }, ctx);
    expect(s.events.choices['h1-divan']).toBe('halil-gorevde');
    expect(s.divan).toBe(divan0 + 8);
    expect(s.events.active).toBeNull();
    expect(s.time.speed).toBe(2);
  });

  it('blocks unaffordable choices', () => {
    const s = freshState();
    const ctx = mkCtx();
    s.resources.akce = 100;
    s.time.day = d(18, 3, 1452) + 0.2;
    s.events.fired['h1-divan'] = 0;
    s.time.speed = 1;
    eventsTick(s, ctx);
    // the decision is shown before the flavour card that fired with it
    expect(s.events.active?.eventId).toBe('h2-antlasmalar');
    expect(s.events.queue.map((q) => q.eventId)).toContain('y-sehzade-orhan');
    const v = eventCardView(s)!;
    expect(v.choices.find((c) => c.id === 'ikisi')!.disabled).toBe(true);
    eventsCommand(s, { t: 'olay-secim', eventId: 'h2-antlasmalar', choiceId: 'ikisi' }, ctx);
    expect(s.events.active?.eventId).toBe('h2-antlasmalar');
    eventsCommand(s, { t: 'olay-secim', eventId: 'h2-antlasmalar', choiceId: 'hicbiri' }, ctx);
    expect(s.events.active?.eventId).toBe('y-sehzade-orhan');
    expect(s.time.speed).toBe(1);
    expect(s.flags[FLAG.macarAteskes]).toBeUndefined();
  });

  it('informational cards auto-close without pausing', () => {
    const s = freshState();
    const ctx = mkCtx();
    s.time.speed = 3;
    s.time.day = d(6, 3, 1452) + 0.1;
    s.events.fired['h1-divan'] = 0;
    eventsTick(s, ctx);
    expect(s.events.active?.eventId).toBe('y-sehzade-orhan');
    expect(s.time.speed).toBe(3);
    for (let i = 0; i < AUTO_CLOSE_SEC / ctx.dtSec + 2; i++) {
      eventsTick(s, { ...ctx, dtDays: 0 });
    }
    expect(s.events.active).toBeNull();
  });

  it('a simulated preparation fires the H events in historical order', () => {
    const s = freshState();
    const ctx = mkCtx(new Bus(), 0.2);
    s.time.speed = 1;
    const schedule: [number, () => void][] = [
      [d(1, 7, 1452), () => (s.flags[FLAG.hisarIlerleme] = 0.7)],
      [d(15, 7, 1452), () => (s.flags[FLAG.orbanGeldi] = true)],
      [d(31, 8, 1452), () => ((s.flags[FLAG.hisarTamam] = true), (s.flags[FLAG.hisarIlerleme] = 1))],
      [d(15, 1, 1453), () => (s.flags[FLAG.sahiDokuldu] = true)],
      [d(1, 2, 1453), () => (s.flags[FLAG.trakyaAlindi] = true)],
      [d(2, 2, 1453), () => (s.flags[FLAG.yolHazirligi] = 0.6)],
    ];
    const order: { id: string; day: number }[] = [];
    let objectivesSeenHisar = false;
    while (s.time.day < d(24, 3, 1453) && s.time.phase === 'hazirlik') {
      s.time.day += ctx.dtDays;
      for (const [day, fn] of schedule) if (s.time.day >= day && day > s.time.day - ctx.dtDays - 1e-9) fn();
      const before = new Set(Object.keys(s.events.fired));
      eventsTick(s, ctx);
      for (const id of Object.keys(s.events.fired)) if (!before.has(id)) order.push({ id, day: s.events.fired[id] });
      if (!objectivesSeenHisar && s.flags[FLAG.hisarIlerleme] === 0.7) {
        const hisar = currentObjectives(s).find((o) => o.id === 'hisar')!;
        expect(hisar.progress).toBeCloseTo(0.7);
        expect(hisar.done).toBe(false);
        objectivesSeenHisar = true;
      }
      // play the historical choices
      while (s.events.active) {
        const was = s.events.active.eventId;
        if (was === 'h10-hareket') {
          // core applies the queued 'yola-cik' next frame
          eventsCommand(s, { t: 'olay-secim', eventId: was, choiceId: 'yola-cik' }, ctx);
          s.time.phase = 'yuruyus';
          s.flags[FLAG.yolaCikildi] = true;
          break;
        }
        pickHistorical(s, ctx);
        if (s.events.active?.eventId === was) break;
      }
    }
    const hOrder = order.filter((o) => EVENT_BY_ID[o.id].code.startsWith('H'));
    const ids = hOrder.map((o) => o.id);
    for (const id of ['h1-divan', 'h2-antlasmalar', 'h3-hisar-temel', 'h5-orban', 'h3-hisar-tamam', 'h6-mora', 'h4-rizzo', 'h5-deneme-atisi', 'h7-trakya', 'h9-ordu', 'h10-hareket'])
      expect(ids, id).toContain(id);
    // firing follows the historical calendar
    const hist = hOrder.map((o) => EVENT_BY_ID[o.id].historicalDay ?? 0);
    for (let i = 1; i < hist.length; i++) expect(hist[i], `${ids[i - 1]} → ${ids[i]}`).toBeGreaterThanOrEqual(hist[i - 1] - 45);
    expect(ids.indexOf('h1-divan')).toBe(0);
    expect(ids.indexOf('h3-hisar-temel')).toBeLessThan(ids.indexOf('h3-hisar-tamam'));
    expect(ids.indexOf('h5-orban')).toBeLessThan(ids.indexOf('h5-deneme-atisi'));
    expect(ids[ids.length - 1]).toBe('h10-hareket');
    // historical choices set the cross-feature flags
    expect(s.flags[FLAG.macarAteskes]).toBe(true);
    expect(s.flags[FLAG.venedikAntlasma]).toBe(true);
    expect(s.flags[FLAG.rizzoKarari]).toBe('batir');
    expect(s.flags[FLAG.moraSeferi]).toBe(true);
    expect(s.flags[FLAG.bogazKontrol]).toBe(true);
    expect(currentObjectives(s).find((o) => o.id === 'hisar')?.done ?? true).toBe(true);
    expect(eventHistory(s).length).toBeGreaterThan(10);
  });

  it('siege objectives react to breaches', () => {
    const s = freshState();
    s.time.phase = 'kusatma';
    s.time.siegeStartDay = d(6, 4, 1453);
    s.time.day = d(10, 4, 1453) + 0.3;
    s.flags[FLAG.kusatmaBasladi] = true;
    let gedik = currentObjectives(s).find((o) => o.id === 'gedik')!;
    expect(gedik.done).toBe(false);
    s.sections['kara-lykos'].breach = 0.6;
    gedik = currentObjectives(s).find((o) => o.id === 'gedik')!;
    expect(gedik.done).toBe(true);
    expect(gedik.focus).toBeTruthy();
    expect(currentObjectives(s).some((o) => o.id === 'son-hucum')).toBe(true);
    expect(activeTips(s).length).toBeGreaterThan(0);
  });

  it('compiles a dawn report at each siege dawn', () => {
    const s = freshState();
    const ctx = mkCtx(new Bus(), 1 / 1800);
    s.time.phase = 'kusatma';
    s.time.siegeStartDay = d(6, 4, 1453);
    s.flags[FLAG.kusatmaBasladi] = true;
    s.time.day = d(9, 4, 1453) + 0.5;
    applyHistoryUntil(s, s.time.day);
    const first = getDawnReport(s);
    expect(first).toBeTruthy();
    // damage by day, repairs at night, losses
    s.sections['kara-topkapi'].inner -= 300;
    s.sections['kara-topkapi'].breach = 0.55;
    s.stats.ottomanLosses += 120;
    s.stats.shotsFired += 9;
    s.resources.barut -= 30;
    while (s.time.day < d(9, 4, 1453) + 0.75) {
      s.time.day += ctx.dtDays;
      eventsTick(s, ctx);
      while (s.events.active) pickHistorical(s, ctx);
    }
    s.sections['kara-topkapi'].barricade = 0.5;
    s.sections['kara-topkapi'].inner += 40;
    while (s.time.day < d(10, 4, 1453) + 0.02) {
      s.time.day += ctx.dtDays * 10;
      eventsTick(s, ctx);
      while (s.events.active) pickHistorical(s, ctx);
    }
    const r = getDawnReport(s)!;
    expect(Math.floor(r.day)).toBe(d(10, 4, 1453));
    const txt = r.lines.map((l) => l.text).join('\n');
    expect(txt).toMatch(/barikat/);
    expect(txt).toMatch(/120 asker/);
    expect(txt).toMatch(/Haçlı yardımı/);
    expect(txt).toMatch(/Açık gedik/);
  });

  it('scenario fast-forward marks history and keeps the card slot clean', () => {
    const s = freshState();
    s.time.phase = 'kusatma';
    s.time.siegeStartDay = d(6, 4, 1453);
    s.time.day = d(16, 4, 1453) + 0.32;
    s.flags[FLAG.kusatmaBasladi] = true;
    s.flags[FLAG.sahiCephede] = true;
    applyHistoryUntil(s, s.time.day);
    for (const id of ['h1-divan', 'h4-rizzo', 'h10-hareket', 'k1-ordu-surlarda', 'k2-dis-kaleler', 'k3-bombardiman']) expect(s.events.fired[id], id).toBeDefined();
    expect(s.events.fired['k4-gece-hucumu']).toBeUndefined();
    expect(s.events.choices['h2-antlasmalar']).toBe('ikisi');
    expect(s.flags[FLAG.rizzoKarari]).toBe('batir');
    expect(s.events.active).toBeNull();
    expect(s.events.queue.length).toBe(0);
    // ticking on the same day does not resurrect past cards
    const ctx = mkCtx();
    s.time.speed = 1;
    eventsTick(s, ctx);
    expect(s.events.active).toBeNull();
    expect(getDawnReport(s)).toBeTruthy();
  });

  it('emits the eclipse and the weather at the historical times', () => {
    expect(eclipseAt(d(22, 5, 1453) + 0.7)).toBe(true);
    expect(eclipseAt(d(22, 5, 1453) + 0.3)).toBe(false);
    expect(weatherAt(d(24, 5, 1453) + 0.35).kind).toBe('dolu');
    expect(weatherAt(d(25, 5, 1453) + 0.1).kind).toBe('sis');
    expect(weatherAt(d(20, 5, 1453) + 0.35).kind).toBe('acik');
    const s = freshState();
    const bus = new Bus();
    const got: string[] = [];
    bus.on('eclipse', (e) => got.push(`eclipse:${e.active}`));
    bus.on('weather', (e) => got.push(`weather:${e.kind}`));
    s.time.phase = 'kusatma';
    s.time.siegeStartDay = d(6, 4, 1453);
    s.flags[FLAG.kusatmaBasladi] = true;
    applyHistoryUntil(s, d(22, 5, 1453));
    s.time.day = d(22, 5, 1453) + 0.5;
    const ctx = mkCtx(bus, 0.01);
    while (s.time.day < d(25, 5, 1453) + 0.4) {
      s.time.day += ctx.dtDays;
      eventsTick(s, ctx);
      while (s.events.active) pickHistorical(s, ctx);
    }
    expect(got).toContain('eclipse:true');
    expect(got).toContain('eclipse:false');
    expect(got).toContain('weather:dolu');
    expect(got).toContain('weather:sis');
    expect(got[got.length - 1]).toBe('weather:acik');
    expect(s.events.fired['k14-ay-tutulmasi']).toBeDefined();
    expect(s.events.fired['k16-isaretler']).toBeDefined();
  });

  it('reactive cards follow flags set by other features', () => {
    const s = freshState();
    const ctx = mkCtx();
    s.time.phase = 'kusatma';
    s.time.siegeStartDay = d(6, 4, 1453);
    s.flags[FLAG.kusatmaBasladi] = true;
    applyHistoryUntil(s, d(19, 4, 1453));
    s.time.day = d(20, 4, 1453) + 0.4;
    s.time.speed = 1;
    const m0 = s.byz.morale;
    s.flags[FLAG.denizSavasi] = 'yarildi';
    eventsTick(s, ctx);
    expect(s.events.active?.eventId).toBe('k5-deniz-savasi');
    expect(s.byz.morale).toBeGreaterThan(m0);
    pickHistorical(s, ctx);
    s.flags[FLAG.gemilerKaradan] = true;
    eventsTick(s, ctx);
    while (s.events.active && s.events.active.eventId !== 'k7-gemiler-karadan') pickHistorical(s, ctx);
    expect(s.events.fired['k7-gemiler-karadan']).toBeDefined();
    s.flags[FLAG.giustinianiYarali] = true;
    eventsTick(s, ctx);
    expect(s.events.fired['k19-giustiniani']).toBeDefined();
  });

  it('a Divan collapse can end the siege (Yenilgi 2)', () => {
    const s = freshState();
    const ctx = mkCtx();
    s.time.phase = 'kusatma';
    s.time.siegeStartDay = d(6, 4, 1453);
    s.flags[FLAG.kusatmaBasladi] = true;
    applyHistoryUntil(s, d(30, 4, 1453));
    s.time.day = d(1, 5, 1453) + 0.3;
    s.time.speed = 1;
    s.divan = -80;
    s.resources.akce = 0;
    s.morale = 20;
    eventsTick(s, ctx);
    expect(s.events.active?.eventId).toBe('d1-divan-krizi');
    const v = eventCardView(s)!;
    expect(v.choices.find((c) => c.id === 'ihsan')!.disabled).toBe(true);
    expect(v.choices.find((c) => c.id === 'zaganos')!.disabled).toBe(true);
    eventsCommand(s, { t: 'olay-secim', eventId: 'd1-divan-krizi', choiceId: 'kaldir' }, ctx);
    expect(s.outcome?.result).toBe('yenilgi-divan');
  });

  it('tips can be dismissed', () => {
    const s = freshState();
    s.time.day = d(2, 3, 1452);
    const t = activeTips(s);
    expect(t.length).toBeGreaterThan(0);
    eventsCommand(s, { t: 'ozel', feature: 'events', action: 'ipucu-kapat', payload: { id: t[0].id } }, mkCtx());
    expect(activeTips(s).some((x) => x.id === t[0].id)).toBe(false);
    expect(priv(s).dismissedTips).toContain(t[0].id);
    expect(() => JSON.stringify(s)).not.toThrow();
  });
});
