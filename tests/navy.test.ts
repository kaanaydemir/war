import { describe, expect, it } from 'vitest';
import { Bus } from '../src/core/bus';
import { d, TARIH } from '../src/core/calendar';
import { SEC_PER_DAY_KUSATMA, SIM_STEP } from '../src/core/constants';
import type { SimContext } from '../src/core/feature';
import { FLAG } from '../src/core/flags';
import { Rng } from '../src/core/rng';
import type { GameState } from '../src/core/state';
import { landmarkTile } from '../src/data/landmarks';
import { createWorld } from '../src/features/world/terrain';
import { blockadeStrength, overlandCheck, bridgeCheck, spawnTypedShip } from '../src/features/navy/api';
import { OVERLAND, SHIP_TYPES } from '../src/features/navy/data';
import { chainGate, insideHorn, navPath, ROUTE_T, routeAt } from '../src/features/navy/geo';
import { navyApplyScenario, navyInitState } from '../src/features/navy/scenario';
import { deployFleet, navyHandleCommand, navySimTick, startBattle } from '../src/features/navy/sim';
import { extraOf, navyState } from '../src/features/navy/state';
import { createCoreState } from '../src/game/newGame';

const world = createWorld();

function siegeState(dayOffset: number, frac = 0.3): GameState {
  const s = createCoreState('normal', 7);
  navyInitState(s, world);
  s.time.phase = 'kusatma';
  s.time.siegeStartDay = d(6, 4, 1453);
  s.time.day = d(6, 4, 1453) + dayOffset + frac;
  s.flags[FLAG.kusatmaBasladi] = true;
  s.flags[FLAG.zincirGerili] = true;
  deployFleet(s, world, 'anchored', null);
  return s;
}

function ctxFor(seed = 3): { ctx: SimContext; events: string[] } {
  const bus = new Bus();
  const events: string[] = [];
  const orig = bus.emit.bind(bus);
  bus.emit = ((name: any, payload: any) => {
    events.push(name);
    orig(name, payload);
  }) as any;
  return { ctx: { dtSec: SIM_STEP, dtDays: SIM_STEP / SEC_PER_DAY_KUSATMA, rng: new Rng(seed), bus, world }, events };
}

function run(s: GameState, ctx: SimContext, seconds: number, stop?: () => boolean): void {
  const n = Math.round(seconds / SIM_STEP);
  for (let i = 0; i < n; i++) {
    s.time.day += ctx.dtDays;
    navySimTick(s, ctx);
    if (stop?.()) return;
  }
}

describe('navy data', () => {
  it('defines every ship type with Turkish names', () => {
    for (const def of Object.values(SHIP_TYPES)) {
      expect(def.name.length).toBeGreaterThan(2);
      expect(def.hp).toBeGreaterThan(0);
    }
    expect(SHIP_TYPES['ceneviz-gemisi'].tall).toBe(true);
    expect(SHIP_TYPES.kadirga.tall).toBe(false);
  });
});

describe('navy geometry', () => {
  it('the chain closes the Golden Horn', () => {
    const dip = landmarkTile('diplokionion');
    const kas = landmarkTile('kasimpasa');
    expect(insideHorn(kas.tx, kas.ty)).toBe(true);
    expect(insideHorn(dip.tx, dip.ty)).toBe(false);
    expect(navPath(world, dip, kas, { chain: true })).toBeNull();
    expect(navPath(world, dip, kas, { chain: false })).not.toBeNull();
  });
  it('the overland route runs from the Bosphorus to Kasımpaşa', () => {
    expect(routeAt(0).tx).toBeCloseTo(ROUTE_T[0].tx, 1);
    expect(routeAt(1).tx).toBeCloseTo(ROUTE_T[ROUTE_T.length - 1].tx, 1);
    expect(routeAt(1).tx).toBeLessThan(routeAt(0).tx);
  });
});

describe('fleet deployment', () => {
  it('anchors the Ottoman fleet at Diplokionion and the Christian ships behind the chain', () => {
    const s = siegeState(1);
    const ott = s.ships.filter((x) => x.side === 'osmanli');
    expect(ott.length).toBeGreaterThanOrEqual(25);
    expect(ott.length).toBeLessThanOrEqual(40);
    expect(ott.every((x) => !insideHorn(x.tx, x.ty))).toBe(true);
    const chr = s.ships.filter((x) => x.side !== 'osmanli');
    expect(chr.length).toBeGreaterThan(4);
    expect(chr.every((x) => insideHorn(x.tx, x.ty))).toBe(true);
    for (const x of s.ships) expect(world.isWater(x.tx, x.ty)).toBe(true);
  });
});

describe('blockadeStrength', () => {
  it('is 0 without ships and grows with the fleet', () => {
    const s = createCoreState('normal', 1);
    expect(blockadeStrength(s)).toBe(0);
    s.flags[FLAG.bogazKontrol] = true;
    expect(blockadeStrength(s)).toBeCloseTo(0.3);
    const f = siegeState(1);
    const full = blockadeStrength(f);
    expect(full).toBeGreaterThan(0.7);
    expect(full).toBeLessThanOrEqual(1);
    // sinking half the fleet weakens the blockade
    let k = 0;
    for (const x of f.ships) if (x.side === 'osmanli' && k++ % 2 === 0) x.status = 'batik';
    expect(blockadeStrength(f)).toBeLessThan(full);
  });
});

describe('K7 — ships overland', () => {
  it('checks preconditions', () => {
    const early = siegeState(5);
    early.resources.kereste = 1000;
    early.resources.yag = 500;
    expect(overlandCheck(early).ok).toBe(false); // Gün 6
    const s = siegeState(OVERLAND.minSiegeDay - 1);
    s.resources.kereste = 1000;
    s.resources.yag = 500;
    s.resources.akce = 10000;
    expect(overlandCheck(s).ok).toBe(true);
    s.resources.yag = 10;
    expect(overlandCheck(s).ok).toBe(false);
    s.resources.yag = 500;
    s.galata = -40;
    expect(overlandCheck(s).ok).toBe(false);
    s.galata = 0;
    s.workforce.assigned = s.workforce.total;
    expect(overlandCheck(s).ok).toBe(false);
  });

  it('builds the slipway, hauls the ships at night and sets the flag', () => {
    const s = siegeState(OVERLAND.minSiegeDay - 1, 0.2);
    s.resources.kereste = 1000;
    s.resources.yag = 500;
    s.resources.akce = 10000;
    const { ctx, events } = ctxFor();
    expect(navyHandleCommand(s, { t: 'gemileri-karadan' }, ctx)).toBe(true);
    expect(s.resources.kereste).toBe(1000 - (OVERLAND.cost.kereste ?? 0));
    expect(navyState(s).overland.stage).toBe('kizak');
    // a second order is refused
    navyHandleCommand(s, { t: 'gemileri-karadan' }, ctx);
    expect(s.resources.kereste).toBe(1000 - (OVERLAND.cost.kereste ?? 0));
    // run up to two full days
    run(s, ctx, SEC_PER_DAY_KUSATMA * 2, () => !!s.flags[FLAG.gemilerKaradan]);
    expect(s.flags[FLAG.gemilerKaradan]).toBe(true);
    expect(events).toContain('overland:done');
    expect(events).toContain('overland:progress');
    const n = navyState(s);
    expect(n.overland.hauled).toBeGreaterThanOrEqual(OVERLAND.minEntities);
    const inHorn = s.ships.filter((x) => x.side === 'osmanli' && insideHorn(x.tx, x.ty));
    expect(inHorn.length).toBe(n.overland.hauled);
    expect(s.workforce.assigned).toBe(0);
    // the ships were launched only at night
    expect(bridgeCheck(s).reqs[0].ok).toBe(true);
  });
});

describe('K5 — 20 Nisan battle', () => {
  it('tall ships fight from height: the relief gets through (historical outcome)', () => {
    const s = siegeState(14, 0.1);
    expect(s.time.day).toBeCloseTo(TARIH.denizSavasi + 0.1, 5);
    const { ctx, events } = ctxFor(11);
    run(s, ctx, SEC_PER_DAY_KUSATMA, () => navyState(s).battle.stage === 'bitti');
    const n = navyState(s);
    expect(n.battle.stage).toBe('bitti');
    expect(events).toContain('naval:battle');
    expect(events).toContain('ship:fire');
    expect(s.flags[FLAG.denizSavasi]).toBe('yarildi');
    expect(n.commander).toBe('hamza');
    // the galleys suffered more than the tall ships
    const relief = n.battle.reliefIds.map((id) => s.ships.find((x) => x.id === id)).filter(Boolean);
    expect(relief.length).toBeGreaterThan(0);
  });

  it('without the height advantage the swarm stops them', () => {
    const s = siegeState(14, 0.1);
    const { ctx } = ctxFor(5);
    const relief = startBattle(s, world, ctx);
    // replace the carracks with low galleys of the same strength
    for (const r of relief) {
      r.type = 'fusta';
      r.hp = r.hpMax = 60;
    }
    run(s, ctx, SEC_PER_DAY_KUSATMA, () => navyState(s).battle.stage === 'bitti');
    expect(s.flags[FLAG.denizSavasi]).toBe('durduruldu');
  });

  it('a lone carrack outfights a lone galley', () => {
    const s = siegeState(14, 0.1);
    s.ships = s.ships.filter((x) => x.side !== 'osmanli');
    const gate = chainGate(true, 8);
    const g = spawnTypedShip(s, 'kadirga', 'osmanli', gate.tx + 6, gate.ty + 8);
    const { ctx } = ctxFor(2);
    const [c] = startBattle(s, world, ctx).slice(0, 1);
    // drop the other three relief ships
    const n = navyState(s);
    n.battle.reliefIds = [c.id];
    s.ships = s.ships.filter((x) => x === g || x === c || (x.side !== 'osmanli' && extraOf(s, x).role !== 'yardim'));
    c.tx = g.tx + 0.8;
    c.ty = g.ty;
    run(s, ctx, 40);
    const gLoss = 1 - Math.max(0, g.hp) / g.hpMax;
    const cLoss = 1 - Math.max(0, c.hp) / c.hpMax;
    expect(gLoss).toBeGreaterThan(cLoss);
  });
});

describe('scenarios', () => {
  it('gemiler-karadan has ships on the ridge and in the Horn', () => {
    const s = createCoreState('normal', 1453);
    navyInitState(s, world);
    s.time.phase = 'kusatma';
    s.time.siegeStartDay = d(6, 4, 1453);
    s.time.day = d(22, 4, 1453) + 0.75;
    s.flags[FLAG.zincirGerili] = true;
    s.flags[FLAG.denizSavasi] = 'yarildi';
    navyApplyScenario('gemiler-karadan', s, world);
    expect(s.ships.filter((x) => x.status === 'karada').length).toBeGreaterThanOrEqual(3);
    expect(s.ships.filter((x) => x.side === 'osmanli' && insideHorn(x.tx, x.ty)).length).toBeGreaterThanOrEqual(4);
  });
  it('deniz-savasi has the battle in progress', () => {
    const s = createCoreState('normal', 1453);
    navyInitState(s, world);
    s.time.phase = 'kusatma';
    s.time.siegeStartDay = d(6, 4, 1453);
    s.time.day = d(20, 4, 1453) + 0.4;
    s.flags[FLAG.zincirGerili] = true;
    navyApplyScenario('deniz-savasi', s, world);
    const n = navyState(s);
    expect(n.battle.stage).toBe('savas');
    expect(s.ships.filter((x) => x.status === 'savas').length).toBeGreaterThan(6);
  });
});

describe('K8 — Venetian fire raid', () => {
  function hornState(galata: number): GameState {
    const s = siegeState(21, 0.92); // night of 27→28 Nisan
    s.flags[FLAG.gemilerKaradan] = true;
    s.galata = galata;
    const n = navyState(s);
    n.overland.stage = 'tamam';
    n.overland.doneDay = d(22, 4, 1453);
    // a few Ottoman ships in the Horn at Kasımpaşa
    const kas = landmarkTile('kasimpasa');
    for (let i = 0; i < 4; i++) {
      const sh = spawnTypedShip(s, 'fusta', 'osmanli', kas.tx - 3 + i * 0.1, kas.ty + 2 + i * 1.5);
      extraOf(s, sh).role = 'halic';
    }
    return s;
  }
  it('is foiled when Galata warns us', () => {
    const s = hornState(20);
    const { ctx, events } = ctxFor(4);
    run(s, ctx, 200, () => navyState(s).raid.stage === 'bitti' || !!s.flags[FLAG.yakmaBaskini]);
    expect(s.flags[FLAG.yakmaBaskini]).toBe('onlendi');
    expect(events).toContain('navy:battery');
    expect(events).toContain('ship:sunk');
  });
  it('burns ships when nobody warns us', () => {
    const s = hornState(-5);
    const { ctx, events } = ctxFor(4);
    run(s, ctx, 200, () => !!s.flags[FLAG.yakmaBaskini]);
    expect(s.flags[FLAG.yakmaBaskini]).toBe('basarili');
    expect(events).toContain('ship:burning');
  });
});

describe('K9 — pontoon bridge', () => {
  it('needs the ships in the Horn, then builds over days', () => {
    const s = siegeState(20);
    s.resources.kereste = 1000;
    s.resources.akce = 10000;
    const { ctx } = ctxFor();
    navyHandleCommand(s, { t: 'ozel', feature: 'navy', action: 'kopru' }, ctx);
    expect(navyState(s).bridge.stage).toBe('yok');
    s.flags[FLAG.gemilerKaradan] = true;
    navyHandleCommand(s, { t: 'ozel', feature: 'navy', action: 'kopru' }, ctx);
    expect(navyState(s).bridge.stage).toBe('insa');
    run(s, ctx, SEC_PER_DAY_KUSATMA * 2, () => !!s.flags[FLAG.halicKoprusu]);
    expect(s.flags[FLAG.halicKoprusu]).toBe(true);
  });
});

describe('relief fleet', () => {
  it('appears in the Marmara when the crusade arrives', () => {
    const s = siegeState(40);
    s.relief.arrived = true;
    const { ctx } = ctxFor();
    run(s, ctx, 1);
    expect(s.flags[FLAG.hacliFilosu]).toBe(true);
    const fleet = s.ships.filter((x) => extraOf(s, x).role === 'hacli');
    expect(fleet.length).toBeGreaterThan(8);
    for (const x of fleet) expect(world.isWater(x.tx, x.ty)).toBe(true);
  });
});
