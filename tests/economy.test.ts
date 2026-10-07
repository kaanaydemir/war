import { describe, expect, it } from 'vitest';
import { Bus, type GameEvents } from '../src/core/bus';
import { d } from '../src/core/calendar';
import { SEC_PER_DAY_HAZIRLIK, SEC_PER_DAY_KUSATMA, SIM_STEP } from '../src/core/constants';
import type { SimContext } from '../src/core/feature';
import { FLAG } from '../src/core/flags';
import { tileToWorld, worldToTile } from '../src/core/iso';
import { Rng } from '../src/core/rng';
import type { GameState } from '../src/core/state';
import type { RegionId, Terrain, WorldApi } from '../src/core/world';
import { createCoreState } from '../src/game/newGame';
import { createWorld } from '../src/features/world/terrain';
import { spawnGroup } from '../src/features/army/api';
import {
  buildingsOf,
  dailyErzakConsumption,
  erzakDays,
  hisarStatus,
  isPlacementValid,
  placeBuilding,
  productionPerDay,
  supplyCoverage,
  upkeepPerDay,
} from '../src/features/economy/api';
import { BUILDING_BY_ID, BUILDINGS, HISAR } from '../src/features/economy/data';
import { econ } from '../src/features/economy/econState';
import { economyFeature } from '../src/features/economy';
import { assignWorkers, economyTick, handleEconomyCommand, initEconomy, syncBlocked } from '../src/features/economy/sim';

// ───────────────────────── helpers ─────────────────────────

function ctxFor(state: GameState, world: WorldApi, bus = new Bus()): SimContext & { rng: Rng } {
  const secPerDay = state.time.phase === 'hazirlik' ? SEC_PER_DAY_HAZIRLIK : SEC_PER_DAY_KUSATMA;
  return { dtSec: SIM_STEP, dtDays: SIM_STEP / secPerDay, rng: new Rng(state.rngState), bus, world };
}

/** Advance `days` of game time running only the economy tick. */
function runDays(state: GameState, world: WorldApi, days: number, bus = new Bus(), until?: (s: GameState) => boolean): void {
  const ctx = ctxFor(state, world, bus);
  const end = state.time.day + days;
  while (state.time.day < end) {
    ctx.dtDays = SIM_STEP / (state.time.phase === 'hazirlik' ? SEC_PER_DAY_HAZIRLIK : SEC_PER_DAY_KUSATMA);
    state.time.day += ctx.dtDays;
    economyTick(state, ctx);
    if (until?.(state)) return;
  }
}

function newGame(world: WorldApi, seed = 7): GameState {
  const s = createCoreState('normal', seed);
  initEconomy(s, world);
  return s;
}

/** Synthetic 256×200 world with known terrain for placement tests. */
function mockWorld(): WorldApi {
  const W = 256;
  const H = 200;
  const blocked = new Uint8Array(W * H);
  const terrainAt = (tx: number, ty: number): Terrain => {
    const x = Math.floor(tx);
    const y = Math.floor(ty);
    if (x < 0 || y < 0 || x >= W || y >= H) return 'derin-su';
    if (x >= 240) return 'su';
    if (x >= 100 && x <= 101 && y >= 20 && y <= 21) return 'kaya';
    if (x >= 130 && x <= 133 && y >= 20 && y <= 23) return 'orman';
    if (x >= 200 && x < 240 && y >= 150) return 'sehir';
    return 'cimen';
  };
  const api: WorldApi = {
    width: W,
    height: H,
    inBounds: (tx, ty) => tx >= 0 && ty >= 0 && tx < W && ty < H,
    terrainAt,
    heightAt: (tx, ty) => (tx >= 150 && tx < 160 && ty >= 20 && ty < 30 ? (Math.floor(tx) - 150) * 2 : 0),
    isWater: (tx, ty) => ['su', 'derin-su', 'sig-su'].includes(terrainAt(tx, ty)),
    regionAt: (tx, ty): RegionId => (terrainAt(tx, ty) === 'sehir' ? 'sur-ici' : terrainAt(tx, ty) === 'su' ? 'bogaz' : 'bogaz-avrupa'),
    moveCost: (tx, ty) => (api.isWater(tx, ty) || blocked[Math.floor(ty) * W + Math.floor(tx)] ? Infinity : 1),
    findPath: (a, b) => [a, b],
    nearestPassable: (t) => ({ tx: Math.round(t.tx), ty: Math.round(t.ty) }),
    toWorld: (tx, ty) => tileToWorld(tx, ty),
    toTile: (wx, wy) => worldToTile(wx, wy),
    setBlocked: (tx, ty, b) => {
      blocked[Math.floor(ty) * W + Math.floor(tx)] = b ? 1 : 0;
    },
  };
  return api;
}

const realWorld = createWorld();

// ───────────────────────── data ─────────────────────────

describe('economy data', () => {
  it('defines every required building with Turkish text and econ icons', () => {
    for (const id of [
      'rumeli-hisari', 'tas-ocagi', 'kereste-kampi', 'tasci-atolyesi', 'baruthane', 'erzak-ambari', 'yag-kazani',
      'ordugah-cadirlari', 'otag', 'top-mevzii', 'siper', 'kervansaray', 'edirne-dokumhane',
    ]) {
      const b = BUILDING_BY_ID[id];
      expect(b, id).toBeDefined();
      expect(b.icon.startsWith('econ/icon-')).toBe(true);
      expect(b.name.length).toBeGreaterThan(2);
      expect(b.desc.length).toBeGreaterThan(20);
    }
    expect(BUILDING_BY_ID['edirne-dokumhane'].category).toBe('ozel');
    expect(new Set(BUILDINGS.map((b) => b.id)).size).toBe(BUILDINGS.length);
  });
  it('exports the feature object', () => {
    expect(economyFeature.id).toBe('economy');
    expect(economyFeature.simTick).toBeTypeOf('function');
  });
});

// ───────────────────────── new game ─────────────────────────

describe('new game', () => {
  it('places the Rumeli Hisarı site, a quarry, a lumber camp and the virtual foundry', () => {
    const s = newGame(realWorld);
    const h = hisarStatus(s)!;
    expect(h).not.toBeNull();
    expect(h.done).toBe(false);
    expect(h.stage).toBe('bekliyor');
    expect(buildingsOf(s, 'tas-ocagi', { built: true }).length).toBe(1);
    expect(buildingsOf(s, 'kereste-kampi', { built: true }).length).toBe(1);
    expect(buildingsOf(s, 'edirne-dokumhane').length).toBe(1);
    expect(econ(s).caravans.length).toBe(1);
    expect(() => JSON.stringify(s)).not.toThrow();
  });
});

// ───────────────────────── production & consumption ─────────────────────────

describe('production & consumption math', () => {
  it('quarry/lumber camp produce their daily rate at full staffing (before the hisar starts)', () => {
    const s = newGame(realWorld);
    assignWorkers(s);
    const q = buildingsOf(s, 'tas-ocagi')[0];
    expect(q.workers).toBe(BUILDING_BY_ID['tas-ocagi'].workersMax);
    const per = productionPerDay(s);
    expect(per.tas).toBeCloseTo(45, 5);
    expect(per.kereste).toBeCloseTo(35, 5);
    const tas0 = s.resources.tas;
    const ker0 = s.resources.kereste;
    runDays(s, realWorld, 4);
    expect(s.resources.tas - tas0).toBeGreaterThan(45 * 4 * 0.97);
    expect(s.resources.tas - tas0).toBeLessThan(45 * 4 * 1.03);
    expect(s.resources.kereste - ker0).toBeGreaterThan(35 * 4 * 0.97);
  });

  it('erzak: every worker and every soldier present eats; away groups do not', () => {
    const s = newGame(realWorld);
    expect(dailyErzakConsumption(s)).toBe(s.workforce.total);
    spawnGroup(s, 'azap', 1000, 50, 140);
    spawnGroup(s, 'akinci', 500, 50, 140, { status: 'uzakta' });
    expect(dailyErzakConsumption(s)).toBe(s.workforce.total + 1000);
    expect(upkeepPerDay(s).erzak).toBe(dailyErzakConsumption(s));
    expect(upkeepPerDay(s).akce).toBeGreaterThan(0);
    const days = erzakDays(s);
    expect(days).toBeCloseTo(s.resources.erzak / (s.workforce.total + 1000), 6);
  });

  it('stonemason workshop turns stone into cannonballs', () => {
    const w = mockWorld();
    const s = createCoreState('normal', 3);
    s.buildings = [];
    const b = placeBuilding(s, 'tasci-atolyesi', 60, 60, { built: true });
    s.workforce.total = 25;
    s.resources.tas = 1000;
    assignWorkers(s);
    expect(b.workers).toBe(25);
    runDays(s, w, 3);
    expect(s.resources.gulle).toBeGreaterThan(10 * 3 * 0.95);
    expect(s.resources.gulle).toBeLessThan(10 * 3 * 1.05);
    expect(1000 - s.resources.tas).toBeGreaterThan(30 * 3 * 0.95);
  });

  it('production stalls without inputs', () => {
    const w = mockWorld();
    const s = createCoreState('normal', 3);
    placeBuilding(s, 'tasci-atolyesi', 60, 60, { built: true });
    s.workforce.total = 25;
    s.resources.tas = 0;
    runDays(s, w, 2);
    expect(s.resources.gulle).toBe(0);
  });
});

// ───────────────────────── placement ─────────────────────────

describe('placement validation', () => {
  const w = mockWorld();
  const base = () => {
    const s = createCoreState('normal', 1);
    s.resources.akce = 10000;
    s.resources.tas = 1000;
    s.resources.kereste = 1000;
    return s;
  };
  it('accepts a quarry next to rocks and rejects one far away', () => {
    const s = base();
    expect(isPlacementValid(s, w, 'tas-ocagi', 101, 22).ok).toBe(true);
    const far = isPlacementValid(s, w, 'tas-ocagi', 60, 60);
    expect(far.ok).toBe(false);
    expect(far.reason).toContain('kayalık');
  });
  it('lumber camp must touch the forest', () => {
    const s = base();
    expect(isPlacementValid(s, w, 'kereste-kampi', 134, 21).ok).toBe(true);
    expect(isPlacementValid(s, w, 'kereste-kampi', 60, 60).reason).toContain('Orman');
  });
  it('rejects water, the city, overlap, rough ground and wrong phase', () => {
    const s = base();
    expect(isPlacementValid(s, w, 'erzak-ambari', 239, 40).reason).toContain('Su');
    expect(isPlacementValid(s, w, 'erzak-ambari', 210, 160).reason).toContain('Şehr');
    placeBuilding(s, 'erzak-ambari', 60, 60, { built: true });
    expect(isPlacementValid(s, w, 'erzak-ambari', 61, 60).reason).toContain('Başka');
    expect(isPlacementValid(s, w, 'erzak-ambari', 152, 22).reason).toContain('engebeli');
    expect(isPlacementValid(s, w, 'siper', 50, 140).reason).toContain('döneminde');
    expect(isPlacementValid(s, w, 'otag', 70, 70).ok).toBe(false);
    expect(isPlacementValid(s, w, 'edirne-dokumhane', 70, 70).ok).toBe(false);
  });
  it('checks cost', () => {
    const s = base();
    s.resources.akce = 0;
    const r = isPlacementValid(s, w, 'erzak-ambari', 70, 70);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('Yetersiz');
  });
  it("'insa' spends, creates a site that workers finish, blocks tiles; 'insa-iptal' refunds", () => {
    const s = base();
    s.workforce.total = 100;
    const bus = new Bus();
    const events: string[] = [];
    bus.on('building:complete', (e: GameEvents['building:complete']) => events.push(e.type));
    const ctx = ctxFor(s, w, bus);
    const akce0 = s.resources.akce;
    expect(handleEconomyCommand(s, { t: 'insa', building: 'erzak-ambari', tx: 70, ty: 70 }, ctx)).toBe(true);
    const b = buildingsOf(s, 'erzak-ambari')[0];
    expect(b.built).toBe(false);
    expect(s.resources.akce).toBe(akce0 - 500);
    expect(w.moveCost(70, 70, 'land')).toBe(Infinity);
    runDays(s, w, BUILDING_BY_ID['erzak-ambari'].buildDays + 0.2, bus);
    expect(b.built).toBe(true);
    expect(events).toContain('erzak-ambari');
    // cancel a fresh site → 75% refund
    handleEconomyCommand(s, { t: 'insa', building: 'yag-kazani', tx: 80, ty: 80 }, ctx);
    const y = buildingsOf(s, 'yag-kazani')[0];
    const ak = s.resources.akce;
    handleEconomyCommand(s, { t: 'insa-iptal', buildingId: y.id }, ctx);
    expect(buildingsOf(s, 'yag-kazani').length).toBe(0);
    expect(s.resources.akce - ak).toBeGreaterThanOrEqual(Math.floor(200 * 0.7));
    expect(w.moveCost(80, 80, 'land')).toBe(1);
  });
  it("'isci-ata' overrides auto-assignment", () => {
    const s = base();
    s.workforce.total = 100;
    const b = placeBuilding(s, 'tas-ocagi', 101, 22, { built: true });
    const ctx = ctxFor(s, w);
    assignWorkers(s);
    expect(b.workers).toBe(40);
    handleEconomyCommand(s, { t: 'isci-ata', buildingId: b.id, workers: 10 }, ctx);
    runDays(s, w, 0.5);
    expect(b.workers).toBe(10);
    handleEconomyCommand(s, { t: 'isci-ata', buildingId: b.id, workers: -1 }, ctx);
    expect(b.workers).toBe(40);
  });
});

// ───────────────────────── Rumeli Hisarı ─────────────────────────

function runUntilHisar(s: GameState, maxDay: number): number | null {
  runDays(s, realWorld, maxDay - s.time.day, new Bus(), (st) => !!st.flags[FLAG.hisarTamam]);
  return s.flags[FLAG.hisarTamam] ? s.time.day : null;
}

describe('Rumeli Hisarı', () => {
  it('waits for 15 Nisan 1452, then rises in stages', () => {
    const s = newGame(realWorld);
    runDays(s, realWorld, HISAR.startDay - s.time.day - 1);
    expect(hisarStatus(s)!.progress).toBe(0);
    runDays(s, realWorld, 12);
    const st = hisarStatus(s)!;
    expect(st.stage).toBe('temel');
    expect(st.progress).toBeGreaterThan(0);
    expect(Number(s.flags[FLAG.hisarIlerleme])).toBeCloseTo(st.progress, 6);
  });

  it('finishes around August 1452 at default staffing (no player action)', () => {
    const s = newGame(realWorld);
    const done = runUntilHisar(s, d(1, 11, 1452));
    expect(done).not.toBeNull();
    expect(done!).toBeGreaterThan(d(20, 7, 1452));
    expect(done!).toBeLessThan(d(20, 9, 1452));
    expect(s.flags[FLAG.bogazKontrol]).toBe(true);
    expect(Number(s.flags[FLAG.hisarBitisGunu])).toBeCloseTo(done!, 3);
  });

  it('a reasonable player (second quarry) finishes by the end of August', () => {
    const s = newGame(realWorld);
    const q = buildingsOf(s, 'tas-ocagi')[0];
    // a second quarry right next to the first (same rocks)
    const b = placeBuilding(s, 'tas-ocagi', q.tx + 3, q.ty, { built: true });
    syncBlocked(s, realWorld, true);
    expect(b).toBeDefined();
    const done = runUntilHisar(s, d(1, 11, 1452));
    expect(done).not.toBeNull();
    expect(done!).toBeGreaterThan(d(15, 7, 1452));
    expect(done!).toBeLessThanOrEqual(d(31, 8, 1452));
  });

  it('more amele (over-staffing) finishes it earlier', () => {
    const a = newGame(realWorld, 11);
    placeBuilding(a, 'tas-ocagi', buildingsOf(a, 'tas-ocagi')[0].tx + 3, buildingsOf(a, 'tas-ocagi')[0].ty, { built: true });
    const b = JSON.parse(JSON.stringify(a)) as GameState;
    b.workforce.total += 600;
    b.resources.tas += 4000;
    // the new amele need tents (housing)
    const t0 = buildingsOf(b, 'tas-ocagi')[0];
    placeBuilding(b, 'ordugah-cadirlari', t0.tx - 4, t0.ty + 6, { built: true });
    const da = runUntilHisar(a, d(1, 11, 1452))!;
    const db = runUntilHisar(b, d(1, 11, 1452))!;
    expect(db).toBeLessThan(da - 10);
  });
});

// ───────────────────────── caravans & Edirne ─────────────────────────

describe('caravans & Edirne', () => {
  it('Edirne caravans arrive and deliver erzak, akçe and maden', () => {
    const s = newGame(realWorld);
    const bus = new Bus();
    const arrived: string[] = [];
    bus.on('caravan:arrived', (e) => arrived.push(e.what));
    runDays(s, realWorld, 45, bus);
    expect(arrived.length).toBeGreaterThanOrEqual(2);
    // the Edirne foundry turns the delivered copper & tin into bronze
    expect(s.resources.tunc).toBeGreaterThan(60);
    expect(s.log.some((l) => l.text.includes('kervan'))).toBe(true);
  });

  it('yol-hazirla raises FLAG.yolHazirligi to 1 over weeks', () => {
    const s = newGame(realWorld);
    s.workforce.total = 1600;
    const ctx = ctxFor(s, realWorld);
    handleEconomyCommand(s, { t: 'ozel', feature: 'economy', action: 'yol-hazirla' }, ctx);
    expect(econ(s).yol.active).toBe(true);
    runDays(s, realWorld, 20);
    const mid = Number(s.flags[FLAG.yolHazirligi]);
    expect(mid).toBeGreaterThan(0.2);
    expect(mid).toBeLessThan(1);
    runDays(s, realWorld, 40);
    expect(Number(s.flags[FLAG.yolHazirligi])).toBe(1);
    expect(econ(s).yol.active).toBe(false);
  });

  it('amele-topla brings 250 workers with a caravan', () => {
    const s = newGame(realWorld);
    const ctx = ctxFor(s, realWorld);
    const w0 = s.workforce.total;
    handleEconomyCommand(s, { t: 'ozel', feature: 'economy', action: 'amele-topla' }, ctx);
    runDays(s, realWorld, 30);
    expect(s.workforce.total).toBe(w0 + 250);
  });

  it('is deterministic', () => {
    const a = newGame(realWorld, 99);
    const b = newGame(realWorld, 99);
    runDays(a, realWorld, 30);
    runDays(b, realWorld, 30);
    expect(JSON.stringify(a.resources)).toBe(JSON.stringify(b.resources));
  });
});

// ───────────────────────── siege ─────────────────────────

function siegeState(prepared: boolean): GameState {
  const s = newGame(realWorld, 5);
  s.time.day = d(6, 4, 1453);
  s.time.phase = 'kusatma';
  s.time.siegeStartDay = s.time.day;
  s.flags[FLAG.kusatmaBasladi] = true;
  for (let i = 0; i < 120; i++) spawnGroup(s, i < 20 ? 'yeniceri' : 'azap', 500, 40 + (i % 10), 130 + Math.floor(i / 10));
  s.resources.akce = 30000;
  s.resources.erzak = prepared ? 60000 * 25 : 60000 * 2;
  if (prepared) {
    s.flags[FLAG.bogazKontrol] = true;
    s.flags[FLAG.yolHazirligi] = 1;
  }
  return s;
}

describe('siege supply', () => {
  it('pitches the Ottoman camp when the siege begins', () => {
    const s = siegeState(true);
    runDays(s, realWorld, 0.5);
    expect(buildingsOf(s, 'otag').length).toBe(1);
    expect(buildingsOf(s, 'ordugah-cadirlari').length).toBeGreaterThanOrEqual(12);
    expect(s.flags[FLAG.ordugahKuruldu]).toBe(true);
  });

  it('a prepared army keeps eating through a 55-day siege; a negligent one starves', () => {
    const good = siegeState(true);
    const bad = siegeState(false);
    expect(supplyCoverage(good)).toBeGreaterThan(supplyCoverage(bad));
    runDays(good, realWorld, 20);
    runDays(bad, realWorld, 20);
    expect(econ(good).starving).toBe(false);
    expect(erzakDays(good)).toBeGreaterThan(10);
    // without stores the deficit bites within ~3 weeks
    expect(erzakDays(bad)).toBeLessThan(erzakDays(good));
    runDays(bad, realWorld, 25);
    expect(econ(bad).starving || erzakDays(bad) < 5).toBe(true);
    expect(bad.morale).toBeLessThan(good.morale);
  });
});

// ───────────────────────── Edirne actions & hisar options ─────────────────────────

describe('Edirne actions', () => {
  it('prioritising a tower makes it finish first', () => {
    const s = newGame(realWorld, 21);
    s.resources.tas += 6000;
    s.resources.kereste += 2000;
    const ctx = ctxFor(s, realWorld);
    handleEconomyCommand(s, { t: 'ozel', feature: 'economy', action: 'hisar-oncelik', payload: { kule: 'zaganos' } }, ctx);
    runDays(s, realWorld, d(20, 6, 1452) - s.time.day);
    const st = hisarStatus(s)!;
    const p = (id: string) => st.parts.find((x) => x.id === id)!.progress;
    expect(p('zaganos')).toBeGreaterThan(p('saruca') + 0.05);
    expect(p('zaganos')).toBeGreaterThan(p('halil') + 0.05);
  });

  it('the Sultan\'s reward (ihsan) speeds the towers, costs akçe and has a cooldown', () => {
    const base = newGame(realWorld, 22);
    base.resources.tas += 6000;
    base.resources.kereste += 2000;
    runDays(base, realWorld, d(20, 5, 1452) - base.time.day);
    const a = JSON.parse(JSON.stringify(base)) as GameState;
    const b = JSON.parse(JSON.stringify(base)) as GameState;
    const ctx = ctxFor(b, realWorld);
    const akce0 = b.resources.akce;
    handleEconomyCommand(b, { t: 'ozel', feature: 'economy', action: 'hisar-ihsan' }, ctx);
    expect(b.resources.akce).toBe(akce0 - 2000);
    // second time is refused (cooldown)
    handleEconomyCommand(b, { t: 'ozel', feature: 'economy', action: 'hisar-ihsan' }, ctx);
    expect(b.resources.akce).toBe(akce0 - 2000);
    runDays(a, realWorld, 15);
    runDays(b, realWorld, 15);
    const tw = (s: GameState) => hisarStatus(s)!.parts.filter((x) => ['saruca', 'halil', 'zaganos'].includes(x.id)).reduce((m, x) => m + x.progress, 0);
    expect(tw(b)).toBeGreaterThan(tw(a) * 1.08);
  });

  it('vergi adds akçe, lowers morale and divan, then cools down', () => {
    const s = newGame(realWorld);
    const ctx = ctxFor(s, realWorld);
    const a0 = s.resources.akce;
    const m0 = s.morale;
    const d0 = s.divan;
    handleEconomyCommand(s, { t: 'ozel', feature: 'economy', action: 'vergi' }, ctx);
    expect(s.resources.akce).toBe(a0 + 7000);
    expect(s.morale).toBeLessThan(m0);
    expect(s.divan).toBeLessThan(d0);
    handleEconomyCommand(s, { t: 'ozel', feature: 'economy', action: 'vergi' }, ctx);
    expect(s.resources.akce).toBe(a0 + 7000);
  });

  it('dökümhane upgrades raise bronze output', () => {
    const a = newGame(realWorld, 30);
    a.resources.maden = 5000;
    const b = JSON.parse(JSON.stringify(a)) as GameState;
    b.resources.akce += 10000;
    handleEconomyCommand(b, { t: 'ozel', feature: 'economy', action: 'dokumhane-genislet' }, ctxFor(b, realWorld));
    expect(econ(b).dokumhaneLevel).toBe(2);
    const ta = a.resources.tunc;
    const tb = b.resources.tunc;
    runDays(a, realWorld, 10);
    runDays(b, realWorld, 10);
    expect(b.resources.tunc - tb).toBeGreaterThan((a.resources.tunc - ta) * 1.8);
  });

  it('unique buildings cannot be demolished; the hisar and otağ are protected', () => {
    const s = newGame(realWorld);
    const h = buildingsOf(s, 'rumeli-hisari')[0];
    handleEconomyCommand(s, { t: 'insa-iptal', buildingId: h.id }, ctxFor(s, realWorld));
    expect(buildingsOf(s, 'rumeli-hisari').length).toBe(1);
  });

  it('every state stays JSON-serializable after a long run', () => {
    const s = newGame(realWorld, 3);
    runDays(s, realWorld, 60);
    const c = JSON.parse(JSON.stringify(s)) as GameState;
    expect(c.features.economy).toBeDefined();
    expect(Number.isFinite(c.resources.erzak)).toBe(true);
    expect(upkeepPerDay(c).erzak).toBeGreaterThan(0);
    expect(dailyErzakConsumption(c)).toBe(c.workforce.total);
  });
});
