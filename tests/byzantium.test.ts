import { describe, expect, it } from 'vitest';
import { Bus, type EventName } from '../src/core/bus';
import { d, segmentOf } from '../src/core/calendar';
import { SEC_PER_DAY_KUSATMA, SIM_STEP } from '../src/core/constants';
import type { SimContext } from '../src/core/feature';
import { FLAG } from '../src/core/flags';
import { Rng } from '../src/core/rng';
import type { Difficulty, GameState } from '../src/core/state';
import type { WorldApi } from '../src/core/world';
import { createCoreState } from '../src/game/newGame';
import { createWorld } from '../src/features/world/terrain';
import { damageSection, rawBreach, sectionApproach } from '../src/features/fortifications/api';
import { initWalls, simTick as fortTick } from '../src/features/fortifications/sim';
import { spawnGroup } from '../src/features/army/api';
import { applyDefenderLosses, counterMineSkill, sectionDefense } from '../src/features/byzantium/api';
import { AI, RELIEF_WINDOW } from '../src/features/byzantium/data';
import { applyScenario, initState, simTick, updateRelief } from '../src/features/byzantium/sim';
import { byzPriv } from '../src/features/byzantium/state';

const world: WorldApi = createWorld();
const SIEGE = d(6, 4, 1453);

interface H {
  state: GameState;
  bus: Bus;
  events: { name: EventName; payload: unknown }[];
  tick: (n?: number) => void;
  runDays: (days: number, onTick?: () => void) => void;
}

function siegeState(difficulty: Difficulty = 'normal', seed = 1453): GameState {
  const s = createCoreState(difficulty, seed);
  initState(s);
  initWalls(s);
  s.time.phase = 'kusatma';
  s.time.siegeStartDay = SIEGE;
  s.time.day = SIEGE + 0.1;
  s.flags[FLAG.kusatmaBasladi] = true;
  byzPriv(s).lastDay = Math.floor(s.time.day);
  return s;
}

function harness(state: GameState, seed = 7): H {
  const bus = new Bus();
  const rng = new Rng(seed);
  const events: H['events'] = [];
  for (const n of ['sortie', 'greekfire', 'notify', 'wall:repaired', 'log'] as EventName[]) bus.on(n, (p) => events.push({ name: n, payload: p }));
  const ctx = (): SimContext => ({ dtSec: SIM_STEP, dtDays: SIM_STEP / SEC_PER_DAY_KUSATMA, rng, bus, world });
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      const c = ctx();
      state.time.day += c.dtDays;
      simTick(state, c);
      fortTick(state, c);
    }
  };
  const perDay = Math.round(SEC_PER_DAY_KUSATMA / SIM_STEP);
  const runDays = (days: number, onTick?: () => void) => {
    for (let i = 0; i < Math.round(days * perDay); i++) {
      tick();
      onTick?.();
      if (state.outcome) break;
    }
  };
  return { state, bus, events, tick, runDays };
}

/** Bombard a section with `perDay` HP spread over the daylight segment. */
function bombard(h: H, id: string, perDay: number): () => void {
  const ticksPerDaylight = (7 / 12 - 1 / 12) * (SEC_PER_DAY_KUSATMA / SIM_STEP);
  const per = perDay / ticksPerDaylight;
  let acc = 0;
  return () => {
    if (segmentOf(h.state.time.day) !== 'gunduz') return;
    acc += per;
    if (acc >= 20) {
      damageSection(h.state, h.bus, id, acc);
      acc = 0;
    }
  };
}

function totalMen(s: GameState): number {
  return Object.values(s.sections).reduce((a, x) => a + x.defenders, 0) + s.byz.reserves;
}

// ───────────────────────────── relief clock ─────────────────────────────

describe('relief (Haçlı) clock', () => {
  it('arrival is hidden, seeded, and inside the difficulty window', () => {
    const means: Record<Difficulty, number> = { kolay: 0, normal: 0, zor: 0 };
    for (const diff of ['kolay', 'normal', 'zor'] as Difficulty[]) {
      const w = RELIEF_WINDOW[diff];
      for (let seed = 1; seed <= 40; seed++) {
        const s = createCoreState(diff, seed * 7919);
        initState(s);
        expect(s.relief.arrival).toBeGreaterThanOrEqual(w.earliest);
        expect(s.relief.arrival).toBeLessThanOrEqual(w.latest + 1);
        expect(s.relief.knownMin).toBeLessThanOrEqual(s.relief.arrival);
        expect(s.relief.knownMax).toBeGreaterThanOrEqual(s.relief.arrival);
        means[diff] += s.relief.arrival / 40;
      }
    }
    // Normal: earliest ≈ 60 days after 6 Nisan (early June) — the historical pace (53 days) is safe.
    expect(RELIEF_WINDOW.normal.earliest - SIEGE).toBe(60);
    expect(RELIEF_WINDOW.normal.earliest).toBeGreaterThan(d(29, 5, 1453) + 5);
    expect(means.kolay).toBeGreaterThan(means.normal + 5);
    expect(means.zor).toBeLessThan(means.normal - 5);
    // same seed → same arrival
    const a = createCoreState('normal', 99);
    const b = createCoreState('normal', 99);
    initState(a);
    initState(b);
    expect(a.relief.arrival).toBe(b.relief.arrival);
  });

  it('diplomatic and naval modifiers shift the arrival dynamically, with Turkish notes', () => {
    const s = createCoreState('normal', 5);
    initState(s);
    const p = byzPriv(s);
    const base = s.relief.arrival;
    s.flags[FLAG.macarAteskes] = true;
    s.flags[FLAG.venedikAntlasma] = true;
    s.flags[FLAG.moraSeferi] = true;
    updateRelief(s, p);
    expect(s.relief.arrival).toBeCloseTo(base + 16, 5);
    expect(s.relief.notes.some((n) => n.includes('Macaristan'))).toBe(true);
    s.flags[FLAG.rizzoKarari] = 'batir';
    updateRelief(s, p);
    expect(s.relief.arrival).toBeCloseTo(base + 10, 5);
    expect(s.relief.notes.some((n) => n.includes('Venedik öfkeli'))).toBe(true);
    // Rumeli Hisarı finished before September 1452 → +3
    s.flags[FLAG.hisarTamam] = true;
    s.flags[FLAG.hisarBitisGunu] = d(20, 8, 1452);
    updateRelief(s, p);
    expect(s.relief.arrival).toBeCloseTo(base + 13, 5);
    // another feature's direct shift (events: Halil Paşa's diplomacy +8) is preserved
    s.relief.arrival += 8;
    s.relief.notes.push('Divan diplomasisi yardımı geciktirdi (+8 gün)');
    updateRelief(s, p);
    expect(s.relief.arrival).toBeCloseTo(base + 21, 5);
    expect(s.relief.notes).toContain('Divan diplomasisi yardımı geciktirdi (+8 gün)');
    // removing a modifier takes it back out
    s.flags[FLAG.moraSeferi] = false;
    updateRelief(s, p);
    expect(s.relief.arrival).toBeCloseTo(base + 16, 5);
    // strong blockade adds days
    p.blockadeEma = 1;
    updateRelief(s, p);
    expect(s.relief.arrival).toBeCloseTo(base + 21, 5);
    expect(s.relief.notes.some((n) => n.includes('donanması'))).toBe(true);
  });

  it('intel narrows the visible window, which always contains the truth', () => {
    const s = createCoreState('normal', 11);
    initState(s);
    const p = byzPriv(s);
    const w0 = s.relief.knownMax - s.relief.knownMin;
    s.byz.intel = 90;
    updateRelief(s, p, true);
    const w1 = s.relief.knownMax - s.relief.knownMin;
    expect(w1).toBeLessThan(w0 - 15);
    expect(s.relief.knownMin).toBeLessThanOrEqual(s.relief.arrival);
    expect(s.relief.knownMax).toBeGreaterThanOrEqual(s.relief.arrival);
  });

  it('relief arriving ends the game with yenilgi-hacli', () => {
    const s = siegeState();
    const h = harness(s);
    s.relief.arrival = s.time.day + 0.2;
    h.runDays(0.5);
    expect(s.relief.arrived).toBe(true);
    expect(s.outcome?.result).toBe('yenilgi-hacli');
    expect(h.events.some((e) => e.name === 'notify')).toBe(true);
  });
});

// ───────────────────────────── night repairs ─────────────────────────────

describe('night repairs vs bombardment', () => {
  it('repairs outpace weak bombardment', () => {
    const s = siegeState();
    const h = harness(s);
    const id = 'kara-lykos';
    const sec = s.sections[id];
    const max = sec.outerMax + sec.innerMax;
    h.runDays(10, bombard(h, id, 80));
    expect(rawBreach(sec)).toBeLessThan(0.12);
    expect(sec.breach).toBeLessThan(0.1);
    expect((sec.outer + sec.inner) / max).toBeGreaterThan(0.85);
    expect(h.events.some((e) => e.name === 'wall:repaired')).toBe(true);
    expect(byzPriv(s).repairLastNight[id]).toBeGreaterThan(20);
  });

  it('strong bombardment opens a breach despite the night work', () => {
    const s = siegeState();
    const h = harness(s);
    const id = 'kara-lykos';
    h.runDays(9, bombard(h, id, 520));
    expect(rawBreach(s.sections[id])).toBeGreaterThanOrEqual(0.5);
    expect(s.stats.breaches).toBeGreaterThanOrEqual(1);
  });

  it('repairs help: the same bombardment does far less without them', () => {
    const run = (repair: boolean) => {
      const s = siegeState();
      if (!repair) s.byz.repairCrews = 0;
      const h = harness(s);
      if (!repair) for (const sec of Object.values(s.sections)) sec.defenders = 0;
      h.runDays(6, bombard(h, 'kara-topkapi', 200));
      const sec = s.sections['kara-topkapi'];
      return sec.outer + sec.inner + sec.barricade * 400;
    };
    expect(run(true)).toBeGreaterThan(run(false) + 250);
  });

  it('difficulty changes repair speed', () => {
    const night = (diff: Difficulty) => {
      const s = siegeState(diff);
      const h = harness(s);
      damageSection(s, h.bus, 'kara-lykos', 900);
      h.runDays(1.05);
      return byzPriv(s).repairLastNight['kara-lykos'] ?? 0;
    };
    const k = night('kolay');
    const n = night('normal');
    const z = night('zor');
    expect(n).toBeGreaterThan(k);
    expect(z).toBeGreaterThan(n);
  });
});

// ───────────────────────────── defender AI ─────────────────────────────

describe('defender allocation', () => {
  it('shifts men toward a threatened section gradually, conserving the total', () => {
    const s = siegeState();
    const h = harness(s);
    const id = 'kara-edirnekapi';
    const before = s.sections[id].defenders;
    const total0 = totalMen(s);
    // an Ottoman force masses in front of Edirnekapı while the guns batter it
    const a = sectionApproach(id, 3);
    spawnGroup(s, 'azap', 1500, a.tx, a.ty, { status: 'bosta' });
    spawnGroup(s, 'yeniceri', 1000, a.tx - 1, a.ty, { status: 'bosta' });
    damageSection(s, h.bus, id, 700);
    let maxStep = 0;
    let prev = s.sections[id].defenders;
    h.runDays(2, () => {
      const cur = s.sections[id].defenders;
      maxStep = Math.max(maxStep, Math.abs(cur - prev));
      prev = cur;
    });
    const after = s.sections[id].defenders;
    expect(s.sections[id].threat).toBeGreaterThan(30);
    expect(after).toBeGreaterThan(before + 150);
    // never teleports big numbers
    expect(maxStep).toBeLessThanOrEqual(Math.ceil(AI.movePerDay * AI.stepDays * AI.surgeMul) + 1);
    expect(after - before).toBeLessThanOrEqual(AI.movePerDay * 2 + 20);
    expect(totalMen(s)).toBe(total0);
    expect(s.byz.defenders).toBe(total0);
  });

  it('ships in the Golden Horn force men onto the Golden Horn walls', () => {
    const s = siegeState();
    const h = harness(s);
    const horn = () => ['halic-balat', 'halic-fener', 'halic-eminonu'].reduce((a, id) => a + s.sections[id].defenders, 0);
    const land = () => Object.values(s.sections).filter((x) => x.kind === 'kara').reduce((a, x) => a + x.defenders, 0);
    const h0 = horn();
    const l0 = land();
    s.flags[FLAG.gemilerKaradan] = true;
    h.runDays(2);
    expect(horn()).toBeGreaterThan(h0 + 200);
    expect(land()).toBeLessThan(l0);
  });
});

// ───────────────────────────── API ─────────────────────────────

describe('section defense API', () => {
  it('depends on breach, barricade, morale, night and Giustiniani', () => {
    const s = siegeState();
    s.time.day = SIEGE + 0.3; // noon
    const id = 'kara-lykos';
    const sec = s.sections[id];
    const base = sectionDefense(s, id);
    expect(base).toBeGreaterThan(sec.defenders);
    sec.breach = 0.8;
    const breached = sectionDefense(s, id);
    expect(breached).toBeLessThan(base * 0.6);
    sec.barricade = 0.8;
    expect(sectionDefense(s, id)).toBeGreaterThan(breached);
    sec.breach = 0;
    sec.barricade = 0;
    s.byz.morale = 20;
    expect(sectionDefense(s, id)).toBeLessThan(base);
    s.byz.morale = 65;
    expect(sectionDefense(s, id, { suppression: 1 })).toBeLessThan(base * 0.7);
    s.time.day = SIEGE + 0.8; // night
    expect(sectionDefense(s, id)).toBeLessThan(base);
    s.time.day = SIEGE + 0.3;
    s.byz.giustinianiWounded = true;
    expect(sectionDefense(s, id)).toBeLessThan(base * 0.75);
    // other commanders' sections are unaffected
    expect(sectionDefense(s, 'kara-blahernai')).toBeGreaterThan(0);
  });

  it('counter-mine skill is Johannes Grant-level', () => {
    const s = siegeState();
    for (const m of [0, 40, 65, 100]) {
      s.byz.morale = m;
      const v = counterMineSkill(s);
      expect(v).toBeGreaterThanOrEqual(0.6);
      expect(v).toBeLessThanOrEqual(0.75);
    }
  });

  it('defender losses reduce totals and feed morale at dawn', () => {
    const s = siegeState();
    const h = harness(s);
    const t0 = s.byz.defenders;
    const m0 = s.byz.morale;
    applyDefenderLosses(s, h.bus, 'kara-topkapi', 400);
    expect(s.byz.defenders).toBe(t0 - 400);
    expect(s.stats.byzantineLosses).toBe(400);
    h.runDays(1);
    expect(s.byz.morale).toBeLessThan(m0);
  });
});

// ───────────────────────────── final assault ─────────────────────────────

describe('final assault', () => {
  it('Giustiniani is wounded in the third wave: flag, crash, defense drop', () => {
    const s = siegeState();
    s.time.day = d(29, 5, 1453) + 0.05;
    byzPriv(s).lastDay = Math.floor(s.time.day);
    const h = harness(s);
    const def0 = sectionDefense(s, 'kara-lykos');
    const m0 = s.byz.morale;
    s.flags[FLAG.sonHucum] = true;
    s.flags[FLAG.hucumDalgasi] = 2;
    h.runDays(0.1);
    expect(s.flags[FLAG.giustinianiYarali]).toBeFalsy();
    s.flags[FLAG.hucumDalgasi] = 3;
    h.runDays(0.1);
    expect(s.flags[FLAG.giustinianiYarali]).toBe(true);
    expect(s.byz.giustinianiWounded).toBe(true);
    expect(s.byz.morale).toBeLessThan(m0 - 10);
    expect(sectionDefense(s, 'kara-lykos')).toBeLessThan(def0 * 0.6);
  });

  it('the Emperor falls with the city', () => {
    const s = siegeState();
    const h = harness(s);
    s.flags[FLAG.sehirDustu] = true;
    h.tick(2);
    expect(s.byz.emperorAlive).toBe(false);
  });
});

// ───────────────────────────── Divan defeat ─────────────────────────────

describe('Divan defeat (Yenilgi 2)', () => {
  const setup = (opts: { morale: number; erzak: number; divan: number }) => {
    const s = siegeState();
    // an army in camp that eats
    spawnGroup(s, 'azap', 20000, 40, 90, { status: 'bosta' });
    s.morale = opts.morale;
    s.resources.erzak = opts.erzak;
    s.divan = opts.divan;
    return s;
  };

  it('triggers when morale, provisions and the Divan all collapse for a sustained period', () => {
    const s = setup({ morale: 10, erzak: 0, divan: -60 });
    const h = harness(s);
    h.runDays(0.5);
    expect(s.outcome).toBeNull();
    h.runDays(1.2);
    expect(s.outcome?.result).toBe('yenilgi-divan');
  });

  it('does not trigger if any one condition holds', () => {
    for (const o of [
      { morale: 40, erzak: 0, divan: -60 },
      { morale: 10, erzak: 1e7, divan: -60 },
      { morale: 10, erzak: 0, divan: 20 },
    ]) {
      const s = setup(o);
      const h = harness(s);
      h.runDays(3);
      expect(s.outcome).toBeNull();
    }
  });
});

// ───────────────────────────── long run & determinism ─────────────────────────────

describe('long siege', () => {
  it('a historical-pace siege stays winnable and deterministic', () => {
    const run = () => {
      const s = siegeState('normal', 777);
      const h = harness(s, 3);
      const a = sectionApproach('kara-lykos', 3);
      spawnGroup(s, 'azap', 800, a.tx, a.ty, { status: 'calisiyor' });
      h.runDays(53, bombard(h, 'kara-lykos', 220));
      return s;
    };
    const s1 = run();
    const s2 = run();
    expect(JSON.stringify(s1)).toBe(JSON.stringify(s2));
    // relief has not come yet on Normal at the historical pace
    expect(s1.outcome).toBeNull();
    expect(s1.relief.arrived).toBe(false);
    expect(s1.byz.food).toBeGreaterThan(0);
    expect(s1.byz.morale).toBeGreaterThanOrEqual(0);
    expect(s1.byz.morale).toBeLessThan(65);
    // the defenders hit back at night, and deserters talk
    expect(s1.log.some((l) => l.kind === 'casus')).toBe(true);
    expect(s1.stats.ottomanLosses).toBeGreaterThan(0);
    // estimate converged toward the truth
    expect(Math.abs(s1.byz.estimatedDefenders - s1.byz.defenders) / s1.byz.defenders).toBeLessThan(0.35);
  });

  it('scenarios set plausible defender states', () => {
    const s = createCoreState('normal', 1453);
    initState(s);
    initWalls(s);
    s.time.phase = 'kusatma';
    s.time.siegeStartDay = SIEGE;
    s.time.day = d(29, 5, 1453) + 0.86;
    s.flags[FLAG.sonHucum] = true;
    s.flags[FLAG.hucumDalgasi] = 3;
    applyScenario('son-hucum', s);
    expect(s.sections['kara-lykos'].defenders).toBeGreaterThan(1000);
    expect(s.byz.defenders).toBeLessThan(5200);
    expect(byzPriv(s).woundAt).not.toBeNull();
    expect(s.relief.arrival).toBeGreaterThan(s.time.day);
  });
});
