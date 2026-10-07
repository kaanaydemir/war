import { describe, expect, it } from 'vitest';
import { Bus, type EventName, type GameEvents } from '../src/core/bus';
import { d } from '../src/core/calendar';
import { SEC_PER_DAY_KUSATMA, SIM_STEP } from '../src/core/constants';
import type { ScenarioName, SimContext } from '../src/core/feature';
import { FLAG } from '../src/core/flags';
import { Rng } from '../src/core/rng';
import type { GameState, UnitGroup, UnitTypeId } from '../src/core/state';
import type { WorldApi } from '../src/core/world';
import { createCoreState } from '../src/game/newGame';
import { SCENARIOS } from '../src/game/scenarios';
import { createWorld } from '../src/features/world/terrain';
import { spawnGroup } from '../src/features/army/api-core';
import { assaultBonus, burnTower, canBuildTower, mineView, moatWork, siegeTowers, towerView } from '../src/features/siegeworks/api';
import { MINE_DAYS, TOWER_COST } from '../src/features/siegeworks/data';
import { frontPos } from '../src/features/siegeworks/geo';
import { applySiegeworksScenario, handleSiegeworksCommand, initSiegeworks, mineX, startMine, tickSiegeworks } from '../src/features/siegeworks/sim';
import { sw } from '../src/features/siegeworks/state';

const world: WorldApi = createWorld();

interface Harness {
  state: GameState;
  bus: Bus;
  events: { name: EventName; payload: unknown }[];
  ctx: () => SimContext;
  tick: (n?: number) => void;
  runDays: (days: number) => void;
  cmd: (c: Parameters<typeof handleSiegeworksCommand>[1]) => boolean;
}

const WATCH: EventName[] = ['mine:started', 'mine:detected', 'mine:collapsed', 'mine:success', 'tower:built', 'tower:burned', 'notify', 'arrows:volley', 'group:casualties', 'wall:damaged', 'wall:breach'];

function harness(state: GameState, seed = 7, rng?: Rng): Harness {
  const bus = new Bus();
  const r = rng ?? new Rng(seed);
  const events: Harness['events'] = [];
  for (const n of WATCH) bus.on(n, (p: GameEvents[typeof n]) => events.push({ name: n, payload: p }));
  const ctx = (): SimContext => ({ dtSec: SIM_STEP, dtDays: SIM_STEP / SEC_PER_DAY_KUSATMA, rng: r, bus, world });
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      const c = ctx();
      state.time.day += c.dtDays;
      tickSiegeworks(state, c);
    }
  };
  const runDays = (days: number) => tick(Math.ceil((days * SEC_PER_DAY_KUSATMA) / SIM_STEP));
  return { state, bus, events, ctx, tick, runDays, cmd: (c) => handleSiegeworksCommand(state, c, { ...ctx(), dtSec: 0, dtDays: 0 }) };
}

/** A siege-day state at noon (day fraction 0.2) with plenty of resources. */
function siegeState(seed = 1453): GameState {
  const s = createCoreState('normal', seed);
  initSiegeworks(s);
  s.time.phase = 'kusatma';
  s.time.siegeStartDay = d(6, 4, 1453);
  s.time.day = d(20, 4, 1453) + 0.2;
  s.flags[FLAG.kusatmaBasladi] = true;
  s.resources.kereste = 5000;
  s.resources.akce = 20000;
  return s;
}

function workGroup(s: GameState, type: UnitTypeId, men: number, order: UnitGroup['order']['type'], sid: string, dist: number, t = 0.5): UnitGroup {
  const p = frontPos(sid, t, dist);
  const g = spawnGroup(s, type, men, p.tx, p.ty, { name: `${type}-${men}` });
  g.order = { type: order, sectionId: sid };
  g.status = 'calisiyor';
  return g;
}

function scenario(name: ScenarioName): GameState {
  const s = createCoreState('normal', 1453);
  initSiegeworks(s);
  const setup = SCENARIOS[name];
  s.time.day = setup.day;
  s.time.phase = setup.phase;
  s.time.siegeStartDay = setup.siegeStart ?? null;
  Object.assign(s.flags, setup.flags ?? {});
  spawnGroup(s, 'lagimci', 300, 70, 110, { name: 'Novaberdolu Lağımcılar' });
  applySiegeworksScenario(name, s, world);
  return s;
}

// ───────────────────────────── assault bonus ─────────────────────────────

describe('assaultBonus', () => {
  it('is ≥ 1 everywhere and grows with the moat fill', () => {
    const s = siegeState();
    for (const id of Object.keys(s.sections)) expect(assaultBonus(s, id)).toBeGreaterThanOrEqual(1);
    const a = assaultBonus(s, 'kara-lykos');
    s.sections['kara-lykos'].moatFill = 0.8;
    const b = assaultBonus(s, 'kara-lykos');
    expect(b).toBeGreaterThan(a);
    // sea walls get nothing from moats and ladders
    expect(assaultBonus(s, 'halic-fener')).toBe(1);
  });

  it('a siege tower at the wall gives a large bonus', () => {
    const s = siegeState();
    s.sections['kara-topkapi'].moatFill = 0.7;
    const before = assaultBonus(s, 'kara-topkapi');
    sw(s).towers.push({ id: 999, sectionId: 'kara-topkapi', t: 0.5, dist: 1.2, status: 'surda', progress: 1, moving: false, burn: 0, since: s.time.day });
    expect(assaultBonus(s, 'kara-topkapi') / before).toBeGreaterThan(1.3);
  });
});

// ───────────────────────────── moat filling ─────────────────────────────

describe('moat filling', () => {
  it('crews fill the moat over days, using kereste, losing men to arrows', () => {
    const s = siegeState();
    const g = workGroup(s, 'azap', 1000, 'hendek-doldur', 'kara-lykos', 2.7);
    const h = harness(s);
    const k0 = s.resources.kereste;
    h.runDays(3);
    const fill = s.sections['kara-lykos'].moatFill;
    expect(fill).toBeGreaterThan(0.12);
    expect(fill).toBeLessThan(0.6);
    expect(s.resources.kereste).toBeLessThan(k0);
    expect(g.men).toBeLessThan(1000);
    expect(h.events.some((e) => e.name === 'arrows:volley')).toBe(true);
    expect(moatWork(s, 'kara-lykos')!.men).toBeGreaterThan(0);
  });

  it('more men fill faster; the night is slower', () => {
    const run = (men: number, startFrac: number, days: number) => {
      const s = siegeState();
      s.time.day = Math.floor(s.time.day) + startFrac;
      workGroup(s, 'azap', men, 'hendek-doldur', 'kara-topkapi', 2.7);
      harness(s).runDays(days);
      return s.sections['kara-topkapi'].moatFill;
    };
    expect(run(2000, 0.1, 1)).toBeGreaterThan(run(400, 0.1, 1) * 1.5);
    // day segment (0.1→0.45) vs night segment (0.67→1.0)
    expect(run(1000, 0.1, 0.33)).toBeGreaterThan(run(1000, 0.67, 0.33));
  });

  it('mantlets (siper) in front of the section reduce casualties', () => {
    const losses = (siper: boolean) => {
      const s = siegeState();
      const g = workGroup(s, 'azap', 1000, 'hendek-doldur', 'kara-lykos', 2.7);
      if (siper)
        for (const t of [0.3, 0.5, 0.7]) {
          const p = frontPos('kara-lykos', t, 4.5);
          s.buildings.push({ id: 900 + t * 10, type: 'siper', tx: Math.round(p.tx), ty: Math.round(p.ty), progress: 1, built: true, workers: 0, hp: 100, owner: 'osmanli', data: {} });
        }
      harness(s).runDays(2);
      return 1000 - g.men;
    };
    expect(losses(true)).toBeLessThan(losses(false));
  });

  it('defenders clear an unattended moat at night', () => {
    const s = siegeState();
    s.sections['kara-lykos'].moatFill = 0.5;
    sw(s).moat['kara-lykos'] = { men: 0, amele: 0, t: 0.5, dumped: 0.5, volley: 0, ameleCas: 0 };
    harness(s).runDays(2);
    expect(s.sections['kara-lykos'].moatFill).toBeLessThan(0.5);
  });

  it('amele can be lent from the workforce and come back', () => {
    const s = siegeState();
    const h = harness(s);
    const total = s.workforce.total;
    h.cmd({ t: 'ozel', feature: 'siegeworks', action: 'amele-hendek', payload: { sectionId: 'kara-lykos', workers: 500 } });
    expect(sw(s).moat['kara-lykos'].amele).toBe(500);
    expect(s.workforce.total).toBe(total - 500);
    h.runDays(1);
    expect(s.sections['kara-lykos'].moatFill).toBeGreaterThan(0.03);
    const left = sw(s).moat['kara-lykos'].amele;
    h.cmd({ t: 'ozel', feature: 'siegeworks', action: 'amele-hendek', payload: { sectionId: 'kara-lykos', workers: 0 } });
    expect(s.workforce.total).toBe(total - 500 + left);
  });

  it('rejects moat work where there is no moat', () => {
    const s = siegeState();
    const h = harness(s);
    const g = workGroup(s, 'azap', 500, 'bekle', 'kara-blahernai', 6);
    expect(h.cmd({ t: 'hendek-doldur', sectionId: 'kara-blahernai', groupId: g.id })).toBe(true);
    expect(h.events.some((e) => e.name === 'notify')).toBe(true);
    // valid → army handles the move (siegeworks passes)
    expect(h.cmd({ t: 'hendek-doldur', sectionId: 'kara-lykos', groupId: g.id })).toBe(false);
  });
});

// ───────────────────────────── mines ─────────────────────────────

describe('mines', () => {
  it('a sapper group at work starts a tunnel and sets FLAG.lagimBasladi', () => {
    const s = siegeState();
    workGroup(s, 'lagimci', 300, 'lagim-kaz', 'kara-blahernai', 6.5);
    const h = harness(s);
    h.tick(2);
    expect(s.mines.length).toBe(1);
    expect(s.flags[FLAG.lagimBasladi]).toBe(true);
    expect(h.events.some((e) => e.name === 'mine:started')).toBe(true);
    const v = mineView(s, s.mines[0].id)!;
    expect(v.statusText).toBeTruthy();
    expect(mineX(s, s.mines[0]).length).toBeGreaterThan(4);
  });

  it('only sappers dig, only under land walls', () => {
    const s = siegeState();
    const h = harness(s);
    const az = workGroup(s, 'azap', 500, 'bekle', 'kara-blahernai', 6.5);
    expect(h.cmd({ t: 'lagim-kaz', sectionId: 'kara-blahernai', groupId: az.id })).toBe(true);
    const lg = workGroup(s, 'lagimci', 300, 'bekle', 'kara-blahernai', 6.5);
    expect(h.cmd({ t: 'lagim-kaz', sectionId: 'halic-balat', groupId: lg.id })).toBe(true);
    expect(h.cmd({ t: 'lagim-kaz', sectionId: 'kara-blahernai', groupId: lg.id })).toBe(false);
  });

  it('tunnels progress over several days (slower under a moat)', () => {
    const prog = (sid: string) => {
      const s = siegeState();
      s.byz.morale = 0; // keep detection low for this measurement
      const g = workGroup(s, 'lagimci', 300, 'lagim-kaz', sid, 6.5);
      const h = harness(s, 3, Object.assign(new Rng(3), { chance: () => false }));
      h.runDays(3);
      const m = s.mines.find((x) => x.groupId === g.id)!;
      return m.progress;
    };
    const free = prog('kara-blahernai');
    expect(free).toBeGreaterThan(3 / MINE_DAYS - 0.08);
    expect(free).toBeLessThan(1);
    expect(prog('kara-lykos')).toBeLessThan(free);
  });

  it('most tunnels are found by Grant, but some bring the wall down', () => {
    let detected = 0;
    let success = 0;
    const N = 24;
    for (let seed = 1; seed <= N; seed++) {
      const s = siegeState(seed);
      const g = workGroup(s, 'lagimci', 300, 'lagim-kaz', 'kara-blahernai', 6.5);
      const h = harness(s, seed * 17);
      h.runDays(12);
      const m = s.mines.find((x) => x.groupId === g.id || mineX(s, x).fate != null);
      if (!m) continue;
      if (m.detected) detected++;
      if (m.status === 'basarili') success++;
    }
    expect(detected).toBeGreaterThan(N * 0.45);
    expect(success).toBeGreaterThan(0);
    expect(success).toBeLessThan(N * 0.6);
  });

  it('a successful mine breaches the wall and emits mine:success', () => {
    const s = siegeState();
    s.byz.morale = 0;
    const g = workGroup(s, 'lagimci', 300, 'lagim-kaz', 'kara-egrikapi', 6.5);
    const h = harness(s, 5, Object.assign(new Rng(5), { chance: () => false }));
    h.tick(1);
    const m = s.mines[0];
    m.progress = 0.999;
    const inner0 = s.sections['kara-egrikapi'].inner;
    h.runDays(1.3); // reaches the wall, waits for the auto-fire, props burn
    expect(m.status).toBe('basarili');
    expect(s.sections['kara-egrikapi'].inner).toBeLessThan(inner0);
    expect(s.sections['kara-egrikapi'].breach).toBeGreaterThan(0.5);
    expect(h.events.some((e) => e.name === 'mine:success')).toBe(true);
    expect(assaultBonus(s, 'kara-egrikapi')).toBeGreaterThan(1.1);
    void g;
  });

  it('the player can fire a finished tunnel early', () => {
    const s = siegeState();
    const h = harness(s, 5, Object.assign(new Rng(5), { chance: () => false }));
    const m = startMine(s, h.bus, 'kara-blahernai', 70, 104, null);
    m.progress = 1;
    m.status = 'hazir';
    mineX(s, m).readyDay = s.time.day;
    expect(h.cmd({ t: 'ozel', feature: 'siegeworks', action: 'lagim-atesle', payload: { mineId: m.id } })).toBe(true);
    expect(m.status).toBe('atesl');
    h.runDays(0.1);
    expect(m.status).toBe('basarili');
  });

  it('captured sappers betray every other tunnel', () => {
    const s = siegeState();
    const lg = workGroup(s, 'lagimci', 300, 'lagim-kaz', 'kara-blahernai', 6.5, 0.5);
    const a = startMine(s, null, 'kara-blahernai', lg.tx, lg.ty, lg.id);
    const b = startMine(s, null, 'kara-blahernai', lg.tx + 1, lg.ty + 2, lg.id);
    const c = startMine(s, null, 'kara-egrikapi', lg.tx + 2, lg.ty + 4, lg.id);
    a.detected = true;
    mineX(s, a).counter = 0.999;
    mineX(s, a).counterDays = 0.5;
    // force the 'esir' outcome: no escape, roll in the captured band
    const rng = Object.assign(new Rng(1), { next: () => 0.97, chance: () => false });
    const h = harness(s, 1, rng);
    h.tick(3);
    expect(a.status).toBe('cokertildi');
    expect(mineX(s, a).fate).toBe('esir');
    expect(b.detected && c.detected).toBe(true);
    expect(h.events.filter((e) => e.name === 'mine:detected').length).toBe(2);
    expect(h.events.some((e) => e.name === 'mine:collapsed')).toBe(true);
  });

  it('a mine detected by another feature (K15) is counter-mined', () => {
    const s = siegeState();
    const lg = workGroup(s, 'lagimci', 300, 'lagim-kaz', 'kara-blahernai', 6.5);
    const h = harness(s, 11);
    h.tick(1);
    const m = s.mines[0];
    m.detected = true;
    h.runDays(3);
    expect(['cokertildi', 'kaziliyor', 'hazir', 'basarili', 'atesl']).toContain(m.status);
    expect(mineX(s, m).counter).toBeGreaterThanOrEqual(0);
    void lg;
  });
});

// ───────────────────────────── siege tower ─────────────────────────────

describe('siege tower', () => {
  it('is built for kereste + akçe and sets FLAG.kuleYapildi', () => {
    const s = siegeState();
    const h = harness(s);
    const k0 = s.resources.kereste;
    expect(h.cmd({ t: 'kule-insa', sectionId: 'kara-topkapi' })).toBe(true);
    expect(s.resources.kereste).toBe(k0 - (TOWER_COST.kereste ?? 0));
    expect(siegeTowers(s)[0].status).toBe('insa');
    expect(canBuildTower(s, 'kara-lykos')).toBeTruthy(); // only one at a time
    h.runDays(1.3);
    expect(siegeTowers(s)[0].status).toBe('hazir');
    expect(s.flags[FLAG.kuleYapildi]).toBe(true);
    expect(h.events.some((e) => e.name === 'tower:built')).toBe(true);
  });

  it('cannot be built on the sea walls or without timber', () => {
    const s = siegeState();
    expect(canBuildTower(s, 'halic-fener')).toBeTruthy();
    s.resources.kereste = 10;
    expect(canBuildTower(s, 'kara-topkapi')).toBeTruthy();
  });

  it('stops at an unfilled moat and reaches the wall once it is filled', () => {
    const s = siegeState();
    const h = harness(s);
    h.cmd({ t: 'kule-insa', sectionId: 'kara-topkapi' });
    h.runDays(1.3);
    h.cmd({ t: 'kule-ilerlet', sectionId: 'kara-topkapi' });
    h.runDays(1.5);
    let v = siegeTowers(s)[0];
    expect(v.status).toBe('bekliyor');
    expect(v.blocked).toBeTruthy();
    s.sections['kara-topkapi'].moatFill = 0.7;
    h.runDays(1);
    v = siegeTowers(s)[0];
    expect(v.status).toBe('surda');
    expect(assaultBonus(s, 'kara-topkapi')).toBeGreaterThan(1.35);
  });

  it('rolls straight to the wall where there is no moat', () => {
    const s = siegeState();
    const h = harness(s);
    h.cmd({ t: 'kule-insa', sectionId: 'kara-blahernai' });
    h.runDays(1.3);
    h.cmd({ t: 'kule-ilerlet', sectionId: 'kara-blahernai' });
    h.runDays(1.5);
    expect(siegeTowers(s)[0].status).toBe('surda');
  });

  it('can be burned by the Byzantines (burnTower)', () => {
    const s = siegeState();
    const h = harness(s);
    expect(burnTower(s, h.bus, 'kara-topkapi')).toBe(false);
    h.cmd({ t: 'kule-insa', sectionId: 'kara-topkapi' });
    h.runDays(1.3);
    expect(burnTower(s, h.bus, 'kara-lykos')).toBe(false);
    expect(burnTower(s, h.bus, 'kara-topkapi')).toBe(true);
    expect(s.flags[FLAG.kuleYandi]).toBe(true);
    expect(h.events.some((e) => e.name === 'tower:burned')).toBe(true);
    const id = siegeTowers(s)[0].id;
    expect(towerView(s, -id)!.status).toBe('yaniyor');
    h.runDays(0.6);
    expect(towerView(s, id)!.status).toBe('yikildi');
    expect(assaultBonus(s, 'kara-topkapi')).toBeLessThan(1.3);
    h.runDays(5);
    expect(siegeTowers(s).length).toBe(0);
  });
});

// ───────────────────────────── scenarios & determinism ─────────────────────────────

describe('scenarios', () => {
  it('lagim: 2–3 active tunnels near Eğrikapı/Blachernae, one being counter-mined', () => {
    const s = scenario('lagim');
    const active = s.mines.filter((m) => m.status === 'kaziliyor' || m.status === 'hazir');
    expect(active.length).toBeGreaterThanOrEqual(2);
    expect(active.length).toBeLessThanOrEqual(3);
    expect(new Set(active.map((m) => Math.round(m.progress * 10))).size).toBeGreaterThanOrEqual(2);
    expect(active.some((m) => m.detected && mineX(s, m).counter > 0)).toBe(true);
    for (const m of s.mines) expect(['kara-blahernai', 'kara-egrikapi']).toContain(m.sectionId);
  });

  it('kule: a tower is being pushed at the Topkapı moat', () => {
    const s = scenario('kule');
    const t = siegeTowers(s)[0];
    expect(t.sectionId).toBe('kara-topkapi');
    expect(t.status).toBe('ilerliyor');
    expect(s.sections['kara-topkapi'].moatFill).toBeGreaterThanOrEqual(0.6);
  });

  it('bombardiman / gece-onarim: moat crews at Lykos', () => {
    for (const n of ['bombardiman', 'gece-onarim'] as const) {
      const s = scenario(n);
      expect(moatWork(s, 'kara-lykos')!.amele).toBeGreaterThan(0);
    }
  });

  it('is deterministic for a seed', () => {
    const run = () => {
      const s = siegeState(42);
      workGroup(s, 'lagimci', 300, 'lagim-kaz', 'kara-blahernai', 6.5);
      workGroup(s, 'azap', 900, 'hendek-doldur', 'kara-lykos', 2.7);
      harness(s, 99).runDays(6);
      return JSON.stringify({ mines: s.mines, fill: s.sections['kara-lykos'].moatFill, groups: s.groups.map((g) => g.men) });
    };
    expect(run()).toBe(run());
  });
});
