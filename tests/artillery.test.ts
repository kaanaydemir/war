import { describe, expect, it } from 'vitest';
import { Bus, type EventName, type GameEvents } from '../src/core/bus';
import { d } from '../src/core/calendar';
import { SEC_PER_DAY_HAZIRLIK, SEC_PER_DAY_KUSATMA, SIM_STEP } from '../src/core/constants';
import type { ScenarioName, SimContext } from '../src/core/feature';
import { FLAG } from '../src/core/flags';
import { Rng } from '../src/core/rng';
import type { GameState } from '../src/core/state';
import type { WorldApi } from '../src/core/world';
import { createCoreState } from '../src/game/newGame';
import { SCENARIOS } from '../src/game/scenarios';
import { createWorld } from '../src/features/world/terrain';
import { canCast, canHireOrban, cannonsTargeting, inRange, isAtEdirne, isOnMap, transportDays } from '../src/features/artillery/api';
import { CANNON_TYPES } from '../src/features/artillery/data';
import { applyArtilleryScenario, handleArtilleryCommand, initArtillery, tickArtillery } from '../src/features/artillery/sim';
import { arty } from '../src/features/artillery/state';

const world: WorldApi = createWorld();

interface Harness {
  state: GameState;
  ctx: (dtSec: number) => SimContext;
  bus: Bus;
  events: { name: EventName; payload: unknown }[];
  tick: (n?: number) => void;
  runDays: (days: number) => void;
}

function harness(state: GameState, seed = 7): Harness {
  const bus = new Bus();
  const rng = new Rng(seed);
  const events: Harness['events'] = [];
  for (const n of ['cannon:fire', 'cannon:impact', 'cannon:arrived', 'cannon:cracked', 'wall:damaged', 'notify'] as EventName[])
    bus.on(n, (p: GameEvents[typeof n]) => events.push({ name: n, payload: p }));
  const secPerDay = () => (state.time.phase === 'hazirlik' ? SEC_PER_DAY_HAZIRLIK : state.time.phase === 'yuruyus' ? 6 : SEC_PER_DAY_KUSATMA);
  const ctx = (dtSec: number): SimContext => ({ dtSec, dtDays: dtSec / secPerDay(), rng, bus, world });
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      const c = ctx(SIM_STEP);
      state.time.day += c.dtDays;
      tickArtillery(state, c);
    }
  };
  const runDays = (days: number) => tick(Math.ceil((days * secPerDay()) / SIM_STEP));
  return { state, ctx, bus, events, tick, runDays };
}

function newGame(): GameState {
  const s = createCoreState('normal', 1453);
  initArtillery(s);
  return s;
}

function scenario(name: ScenarioName): GameState {
  const s = createCoreState('normal', 1453);
  initArtillery(s);
  const setup = SCENARIOS[name];
  s.time.day = setup.day;
  s.time.phase = setup.phase;
  s.time.siegeStartDay = setup.siegeStart ?? null;
  Object.assign(s.flags, setup.flags ?? {});
  applyArtilleryScenario(name, s, world);
  return s;
}

describe('artillery data', () => {
  it('defines every cannon type with Turkish names and sane numbers', () => {
    for (const t of ['sahi', 'buyuk', 'orta', 'kucuk', 'havan'] as const) {
      const def = CANNON_TYPES[t];
      expect(def.id).toBe(t);
      expect(def.name.length).toBeGreaterThan(2);
      expect(def.reloadSec).toBeGreaterThan(0);
      expect(def.icon.startsWith('topcu/')).toBe(true);
    }
    expect(CANNON_TYPES.sahi.shotsPerDay).toBe(7);
    expect(CANNON_TYPES.sahi.damage).toBeGreaterThan(CANNON_TYPES.buyuk.damage);
    expect(CANNON_TYPES.kucuk.reloadSec).toBeLessThan(CANNON_TYPES.orta.reloadSec);
  });
});

describe('foundry & Orban', () => {
  it('requires Orban for the Şahi and charges his salary', () => {
    const s = newGame();
    const h = harness(s);
    s.resources.tunc = 500;
    s.resources.akce = 20000;
    const chk = canCast(s, 'sahi');
    expect(chk.ok).toBe(false);
    expect(chk.reason).toContain('Orban');
    expect(canHireOrban(s).ok).toBe(true);
    const akce = s.resources.akce;
    handleArtilleryCommand(s, { t: 'ozel', feature: 'artillery', action: 'orban-tut' }, h.ctx(0));
    expect(s.flags[FLAG.orbanGeldi]).toBe(true);
    expect(s.resources.akce).toBeLessThan(akce - 1000);
    expect(canCast(s, 'sahi').ok).toBe(true);
  });

  it('casts the Şahi over castDays and sets sahiDokuldu', () => {
    const s = newGame();
    const h = harness(s);
    s.flags[FLAG.orbanGeldi] = true;
    s.resources.tunc = 500;
    s.resources.akce = 20000;
    s.time.day = d(1, 9, 1452);
    const tunc = s.resources.tunc;
    expect(handleArtilleryCommand(s, { t: 'top-dok', type: 'sahi' }, h.ctx(0))).toBe(true);
    expect(s.resources.tunc).toBe(tunc - CANNON_TYPES.sahi.castCost.tunc!);
    const sahi = s.cannons.find((c) => c.type === 'sahi')!;
    expect(sahi.status).toBe('dokuluyor');
    expect(isOnMap(s, sahi)).toBe(false);
    h.runDays(CANNON_TYPES.sahi.castDays * 0.9);
    expect(sahi.status).toBe('dokuluyor');
    expect(s.flags[FLAG.sahiDokuldu]).toBeFalsy();
    h.runDays(CANNON_TYPES.sahi.castDays * 0.15);
    expect(sahi.status).toBe('hazir');
    expect(s.flags[FLAG.sahiDokuldu]).toBe(true);
    expect(isAtEdirne(s, sahi.id)).toBe(true);
    // only one Şahi
    expect(canCast(s, 'sahi').ok).toBe(false);
  });

  it('limits concurrent castings and refuses when bronze is short', () => {
    const s = newGame();
    const h = harness(s);
    s.resources.tunc = 30;
    s.resources.akce = 5000;
    handleArtilleryCommand(s, { t: 'top-dok', type: 'orta' }, h.ctx(0));
    handleArtilleryCommand(s, { t: 'top-dok', type: 'kucuk' }, h.ctx(0));
    const r = canCast(s, 'kucuk');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('Dökümhane');
    s.resources.tunc = 0;
    h.runDays(20);
    expect(canCast(s, 'orta').reason).toContain('tunç');
  });
});

describe('transport', () => {
  it('is faster on a prepared road and delivers the Şahi to the camp', () => {
    const s = newGame();
    expect(transportDays(s, 'sahi')).toBeGreaterThan(55);
    s.flags[FLAG.yolHazirligi] = 1;
    const fast = transportDays(s, 'sahi');
    expect(fast).toBeLessThan(40);
    expect(fast).toBeGreaterThan(25);

    const h = harness(s);
    s.flags[FLAG.orbanGeldi] = true;
    s.time.day = d(10, 1, 1453);
    s.resources.tunc = 500;
    s.resources.akce = 9000;
    handleArtilleryCommand(s, { t: 'top-dok', type: 'sahi' }, h.ctx(0));
    const sahi = s.cannons.find((c) => c.type === 'sahi')!;
    sahi.progress = 0.99999; // finishing now
    h.tick(2);
    expect(isAtEdirne(s, sahi.id)).toBe(true);
    handleArtilleryCommand(s, { t: 'ozel', feature: 'artillery', action: 'yola-gonder', payload: { cannonIds: [sahi.id] } }, h.ctx(0));
    expect(sahi.status).toBe('yolda');
    const start = s.time.day;
    // invisible while off-map, then on the Edirne road
    h.runDays(fast * 0.5);
    expect(isOnMap(s, sahi)).toBe(false);
    h.runDays(fast * 0.42);
    expect(isOnMap(s, sahi)).toBe(true);
    expect(sahi.tx).toBeGreaterThan(0);
    h.runDays(fast * 0.1);
    expect(sahi.status).toBe('hazir');
    const arrived = h.events.find((e) => e.name === 'cannon:arrived');
    expect(arrived).toBeTruthy();
    expect(s.time.day - start).toBeGreaterThan(fast * 0.95);
    expect(world.isWater(sahi.tx, sahi.ty)).toBe(false);
  });

  it('sends Edirne guns automatically in February 1453 and deploys them at the siege', () => {
    const s = newGame();
    const h = harness(s);
    s.time.day = d(28, 1, 1453);
    h.runDays(5);
    expect(arty(s).atEdirne.length).toBe(0);
    expect(s.cannons.every((c) => c.status === 'yolda' || c.status === 'hazir')).toBe(true);
    h.runDays(30);
    // all arrived and parked
    expect(s.cannons.every((c) => c.status === 'hazir' && c.tx > 0)).toBe(true);
    s.time.phase = 'kusatma';
    s.time.siegeStartDay = Math.floor(s.time.day);
    h.runDays(0.6);
    for (const c of s.cannons) {
      expect(c.targetSection).toBeTruthy();
      expect(['hazir', 'mevzileniyor']).toContain(c.status);
    }
    h.runDays(1.5);
    for (const c of s.cannons) {
      expect(c.status === 'hazir' || c.status === 'soguyor').toBe(true);
      expect(inRange(c, c.targetSection!)).toBe(true);
    }
  });
});

describe('bombardment', () => {
  it('fires, consumes powder and balls, damages the walls', () => {
    const s = scenario('bombardiman');
    expect(s.cannons.length).toBeGreaterThanOrEqual(12);
    const sahi = s.cannons.find((c) => c.type === 'sahi')!;
    expect(sahi.targetSection).toBe('kara-topkapi');
    expect(cannonsTargeting(s, 'kara-topkapi').length).toBeGreaterThanOrEqual(2);
    for (const c of s.cannons) expect(inRange(c, c.targetSection!)).toBe(true);
    const h = harness(s);
    const barut = s.resources.barut;
    const gulle = s.resources.gulle;
    const wall0 = s.sections['kara-topkapi'].outer + s.sections['kara-topkapi'].inner;
    h.tick(600); // one minute of siege
    const fired = h.events.filter((e) => e.name === 'cannon:fire');
    expect(fired.length).toBeGreaterThan(10);
    expect(s.stats.shotsFired).toBe(fired.length);
    expect(s.resources.barut).toBeLessThan(barut);
    expect(s.resources.gulle).toBeLessThan(gulle);
    const impacts = h.events.filter((e) => e.name === 'cannon:impact');
    expect(impacts.length).toBeGreaterThan(5);
    expect(impacts.length).toBeLessThanOrEqual(fired.length);
    expect(impacts.some((e) => (e.payload as GameEvents['cannon:impact']).hitWall)).toBe(true);
    const wall1 = s.sections['kara-topkapi'].outer + s.sections['kara-topkapi'].inner;
    expect(wall1).toBeLessThan(wall0);
  });

  it('stops firing without ammunition and warns once', () => {
    const s = scenario('bombardiman');
    const h = harness(s);
    s.resources.barut = 0;
    h.tick(300);
    expect(h.events.filter((e) => e.name === 'cannon:fire').length).toBe(0);
    const warns = h.events.filter((e) => e.name === 'notify' && (e.payload as { text: string }).text.includes('tükendi'));
    expect(warns.length).toBe(1);
  });

  it('caps the Şahi at seven shots per day', () => {
    const s = scenario('bombardiman');
    s.time.day = Math.floor(s.time.day) + 0.001;
    for (const c of s.cannons) c.shotsToday = 0;
    arty(s).lastDay = Math.floor(s.time.day);
    const sahi = s.cannons.find((c) => c.type === 'sahi')!;
    const h = harness(s);
    h.runDays(0.995);
    const shots = h.events.filter((e) => e.name === 'cannon:fire' && (e.payload as GameEvents['cannon:fire']).cannonId === sahi.id).length;
    expect(shots).toBeLessThanOrEqual(7);
    expect(shots).toBeGreaterThanOrEqual(4);
  });

  it('a full day of bombardment hurts the main sections noticeably but does not flatten them', () => {
    const s = scenario('bombardiman');
    const h = harness(s);
    h.runDays(1);
    const top = s.sections['kara-topkapi'];
    const lost = top.outerMax + top.innerMax - top.outer - top.inner;
    expect(lost).toBeGreaterThan(150);
    expect(lost).toBeLessThan(1200);
  });

  it('is deterministic', () => {
    const a = scenario('bombardiman');
    const b = scenario('bombardiman');
    harness(a, 99).tick(900);
    harness(b, 99).tick(900);
    expect(JSON.stringify(a.sections)).toBe(JSON.stringify(b.sections));
    expect(a.stats.shotsFired).toBe(b.stats.shotsFired);
  });

  it('retargets selected guns and re-emplaces out-of-range ones', () => {
    const s = scenario('bombardiman');
    const h = harness(s);
    const gun = s.cannons.find((c) => c.targetSection === 'kara-blahernai')!;
    handleArtilleryCommand(s, { t: 'top-hedef', cannonIds: [gun.id], sectionId: 'kara-yedikule' }, h.ctx(0));
    expect(gun.targetSection).toBe('kara-yedikule');
    expect(gun.status).toBe('mevzileniyor');
    h.runDays(2.5);
    expect(gun.status === 'hazir' || gun.status === 'soguyor').toBe(true);
    expect(inRange(gun, 'kara-yedikule')).toBe(true);
  });
});

describe('heat, cracks & the mortar', () => {
  it('forces the Şahi to cool after an overheated shot', () => {
    const s = scenario('bombardiman');
    const sahi = s.cannons.find((c) => c.type === 'sahi')!;
    for (const c of s.cannons) if (c !== sahi) c.cooldown = 1e9;
    sahi.heat = 0.8;
    sahi.cooldown = 0;
    sahi.shotsToday = 0;
    const h = harness(s, 5);
    h.tick(1);
    expect(['soguyor', 'kirik']).toContain(sahi.status);
    if (sahi.status === 'soguyor') {
      h.tick(600);
      expect(sahi.status).toBe('hazir');
      expect(sahi.heat).toBeLessThanOrEqual(0.3);
    }
  });

  it('cracked guns are hooped with iron and return to service', () => {
    const s = scenario('bombardiman');
    const h = harness(s);
    const gun = s.cannons.find((c) => c.type === 'buyuk')!;
    gun.status = 'kirik';
    s.resources.tunc = 100;
    s.resources.akce = 5000;
    handleArtilleryCommand(s, { t: 'ozel', feature: 'artillery', action: 'onar', payload: { cannonId: gun.id } }, h.ctx(0));
    expect(arty(s).repair[gun.id]).toBeGreaterThan(0);
    h.runDays(2.2);
    expect(gun.status === 'hazir' || gun.status === 'soguyor').toBe(true);
  });

  it('the mortar behind Galata fires on hostile ships in the Horn', () => {
    const s = scenario('deniz-savasi');
    const havan = s.cannons.find((c) => c.type === 'havan')!;
    for (const c of s.cannons) if (c !== havan) c.cooldown = 1e9;
    s.ships.push({ id: 9999, type: 'ceneviz-gemisi', side: 'ceneviz', tx: havan.tx - 4, ty: havan.ty + 12, heading: 0, hp: 100, hpMax: 100, status: 'demirli', path: [] });
    const h = harness(s, 11);
    h.runDays(0.4);
    const shots = h.events.filter((e) => e.name === 'cannon:fire' && (e.payload as GameEvents['cannon:fire']).cannonId === havan.id);
    expect(shots.length).toBeGreaterThan(2);
    const ship = s.ships.find((x) => x.id === 9999)!;
    expect(ship.hp).toBeLessThan(100);
  });
});

describe('scenarios', () => {
  it('kis-hazirlik shows the Şahi on the road and kusatma-gun1 batteries being emplaced', () => {
    const k = scenario('kis-hazirlik');
    const sahi = k.cannons.find((c) => c.type === 'sahi')!;
    expect(sahi.status).toBe('yolda');
    expect(isOnMap(k, sahi)).toBe(true);
    const g = scenario('kusatma-gun1');
    expect(g.cannons.filter((c) => c.status === 'mevzileniyor').length).toBeGreaterThan(6);
    const n = scenario('deniz-savasi');
    expect(n.cannons.some((c) => c.type === 'havan')).toBe(true);
    expect(() => JSON.stringify(n)).not.toThrow();
  });
});
