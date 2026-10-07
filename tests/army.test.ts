import { describe, expect, it } from 'vitest';
import { Bus, type EventName } from '../src/core/bus';
import { d } from '../src/core/calendar';
import { SEC_PER_DAY_HAZIRLIK, SEC_PER_DAY_KUSATMA, SEC_PER_DAY_YURUYUS, SIM_STEP } from '../src/core/constants';
import type { SimContext } from '../src/core/feature';
import { FLAG } from '../src/core/flags';
import { Rng } from '../src/core/rng';
import type { GameState, UnitGroup } from '../src/core/state';
import type { WorldApi } from '../src/core/world';
import { createCoreState } from '../src/game/newGame';
import { createWorld } from '../src/features/world/terrain';
import { recomputeBreach, sectionPoint } from '../src/features/fortifications/api';
import { initWalls } from '../src/features/fortifications/sim';
import { activeAssaults, awayReason, finalAssaultStatus, orderGroups, recruitOptions, sultanVisitStatus, trakyaStatus } from '../src/features/army/api';
import { initArmy, planMarch, TRAKYA_DAYS } from '../src/features/army/campaign';
import { UNIT_TYPES, COMMANDERS } from '../src/features/army/data';
import { applyArmyScenario } from '../src/features/army/scenario';
import { handleArmyCommand, tickArmy } from '../src/features/army/sim';
import { army, extraOf } from '../src/features/army/state';
import { planPath } from '../src/features/army/move';

const world: WorldApi = createWorld();

function harness(state: GameState, seed = 11) {
  const bus = new Bus();
  const rng = new Rng(seed);
  const events: { name: EventName; p: any }[] = [];
  for (const n of ['group:arrived', 'group:routed', 'assault:start', 'assault:end', 'banner:planted', 'mehter:play', 'group:casualties'] as EventName[])
    bus.on(n, (p: any) => events.push({ name: n, p }));
  const spd = () => (state.time.phase === 'hazirlik' ? SEC_PER_DAY_HAZIRLIK : state.time.phase === 'yuruyus' ? SEC_PER_DAY_YURUYUS : SEC_PER_DAY_KUSATMA);
  const ctx = (dt = SIM_STEP): SimContext => ({ dtSec: dt, dtDays: dt / spd(), rng, bus, world });
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      const c = ctx();
      state.time.day += c.dtDays;
      if (state.time.phase === 'yuruyus' && state.time.marchStartDay != null && state.time.day >= state.time.marchStartDay + 13) {
        state.time.phase = 'kusatma';
        state.time.siegeStartDay = Math.floor(state.time.day);
        state.flags[FLAG.kusatmaBasladi] = true;
      }
      tickArmy(state, c);
      if (state.outcome) break;
    }
  };
  const seconds = (s: number) => tick(Math.round(s / SIM_STEP));
  return { bus, events, ctx, tick, seconds };
}

function newGame(): GameState {
  const s = createCoreState('normal', 1453);
  initWalls(s);
  initArmy(s, world);
  return s;
}

function siegeState(): GameState {
  const s = newGame();
  s.time.day = d(20, 4, 1453) + 0.3;
  s.time.phase = 'kusatma';
  s.time.siegeStartDay = d(6, 4, 1453);
  s.flags[FLAG.kusatmaBasladi] = true;
  applyArmyScenario('bombardiman', s, world);
  return s;
}

function setWall(s: GameState, id: string, outer: number, inner: number, moat: number, defenders: number): void {
  const w = s.sections[id];
  w.outer = Math.round(w.outerMax * outer);
  w.inner = Math.round(w.innerMax * inner);
  w.moatFill = moat;
  w.barricade = 0;
  w.defenders = defenders;
  recomputeBreach(w);
}

const jans = (s: GameState) => s.groups.filter((g) => g.type === 'yeniceri' && extraOf(s, g.id).wing === 'merkez');

describe('army data', () => {
  it('defines every unit type and the historical commanders', () => {
    for (const t of ['yeniceri', 'azap', 'sipahi', 'basibozuk', 'akinci', 'topcu', 'lagimci', 'mehter'] as const) {
      expect(UNIT_TYPES[t].id).toBe(t);
      expect(UNIT_TYPES[t].desc.length).toBeGreaterThan(40);
    }
    const ids = COMMANDERS.map((c) => c.id);
    for (const id of ['fatih', 'halil', 'zaganos', 'saruca', 'karaca', 'ishak', 'mahmud', 'baltaoglu', 'hamza', 'turahan', 'aksemseddin', 'ulubatli']) expect(ids).toContain(id);
    expect(COMMANDERS.find((c) => c.id === 'halil')!.party).toBe('baris');
    expect(COMMANDERS.find((c) => c.id === 'zaganos')!.party).toBe('savas');
  });
});

describe('new game & march', () => {
  it('puts guards at Rumeli Hisarı and the army in Edirne', () => {
    const s = newGame();
    const onMap = s.groups.filter((g) => g.status !== 'uzakta');
    const away = s.groups.filter((g) => g.status === 'uzakta');
    expect(onMap.length).toBe(3);
    expect(away.length).toBeGreaterThan(20);
    for (const g of onMap) expect(world.regionAt(g.tx, g.ty)).toBe('bogaz-avrupa');
    expect(recruitOptions(s).length).toBe(8);
  });

  it('marches the columns from Edirne into their historical camps within 13 days', () => {
    const s = newGame();
    s.time.day = d(23, 3, 1453);
    s.time.phase = 'yuruyus';
    s.time.marchStartDay = s.time.day;
    planMarch(s, world);
    const h = harness(s);
    h.tick(Math.round((13.6 * SEC_PER_DAY_YURUYUS) / SIM_STEP));
    const army = s.groups.filter((g) => extraOf(s, g.id).wing !== 'hisar' && extraOf(s, g.id).campaign !== 'mora');
    const arrived = army.filter((g) => g.status === 'bosta');
    expect(arrived.length / army.length).toBeGreaterThan(0.85);
    const sultan = s.groups.find((g) => g.commanderId === 'fatih')!;
    expect(sultan.status).not.toBe('uzakta');
    // Karaca north of the Sultan, İshak south
    const kar = s.groups.find((g) => g.commanderId === 'karaca')!;
    const ish = s.groups.find((g) => g.commanderId === 'ishak')!;
    expect(kar.ty).toBeLessThan(sultan.ty);
    expect(ish.ty).toBeGreaterThan(sultan.ty);
  });
});

describe('movement', () => {
  it('finds smooth land paths and walks there', () => {
    const s = siegeState();
    const g = s.groups.find((x) => x.type === 'sipahi' && x.status === 'bosta' && extraOf(s, x.id).wing === 'ishak')!;
    const target = { tx: g.tx - 10, ty: g.ty + 6 };
    const p = planPath(world, { tx: g.tx, ty: g.ty }, target);
    expect(p).not.toBeNull();
    expect(p!.length).toBeLessThan(12);
    const h = harness(s);
    expect(orderGroups(s, world, h.bus, [g.id], { type: 'git', target })).toBeNull();
    expect(g.status).toBe('yuruyor');
    h.seconds(40);
    expect(g.status).toBe('bosta');
    expect(Math.hypot(g.tx - target.tx, g.ty - target.ty)).toBeLessThan(1.5);
    expect(h.events.some((e) => e.name === 'group:arrived' && e.p.groupId === g.id)).toBe(true);
  });

  it('spreads several groups sent to one point', () => {
    const s = siegeState();
    const gs = s.groups.filter((x) => x.type === 'sipahi' && x.status === 'bosta' && extraOf(s, x.id).wing === 'karaca').slice(0, 4);
    const h = harness(s);
    const target = { tx: gs[0].tx - 8, ty: gs[0].ty };
    orderGroups(s, world, h.bus, gs.map((g) => g.id), { type: 'git', target });
    h.seconds(60);
    for (let i = 0; i < gs.length; i++) for (let j = i + 1; j < gs.length; j++) expect(Math.hypot(gs[i].tx - gs[j].tx, gs[i].ty - gs[j].ty)).toBeGreaterThan(1.5);
  });
});

describe('assaults', () => {
  function runAssault(breached: boolean | 'yari', nGroups: number): { foothold: number; defLost: number; lost: number } {
    const s = siegeState();
    if (breached === 'yari') setWall(s, 'kara-lykos', 0.35, 0.85, 0.4, 700);
    else if (breached) setWall(s, 'kara-lykos', 0.05, 0.4, 0.9, 700);
    else setWall(s, 'kara-lykos', 1, 1, 0, 700);
    const h = harness(s);
    const gs = jans(s).slice(0, nGroups);
    orderGroups(s, world, h.bus, gs.map((g) => g.id), { type: 'hucum', sectionId: 'kara-lykos' });
    let best = { foothold: 0, defLost: 0, lost: 0 };
    for (let i = 0; i < 1200; i++) {
      h.tick();
      const a = army(s).assaults['kara-lykos'];
      if (a) best = { foothold: Math.max(best.foothold, a.foothold), defLost: a.defLost, lost: a.lost };
    }
    return best;
  }

  it('breach and numbers matter', () => {
    const intact = runAssault(false, 3);
    const breach = runAssault(true, 3);
    const small = runAssault('yari', 1);
    const big = runAssault('yari', 4);
    expect(breach.foothold).toBeGreaterThan(intact.foothold + 0.2);
    expect(breach.defLost).toBeGreaterThan(intact.defLost);
    expect(big.defLost).toBeGreaterThan(small.defLost * 1.5);
    expect(big.foothold).toBeGreaterThanOrEqual(small.foothold);
    expect(intact.lost).toBeGreaterThan(0);
  });

  it('a failed assault lowers morale and pushes the Divan toward peace', () => {
    const s = siegeState();
    setWall(s, 'kara-topkapi', 1, 1, 0, 900);
    const morale0 = s.morale;
    const divan0 = s.divan;
    const h = harness(s);
    const bb = s.groups.filter((g) => g.type === 'basibozuk');
    orderGroups(s, world, h.bus, bb.map((g) => g.id), { type: 'hucum', sectionId: 'kara-topkapi' });
    h.seconds(150);
    expect(h.events.some((e) => e.name === 'assault:start')).toBe(true);
    expect(h.events.some((e) => e.name === 'assault:end' && e.p.success === false)).toBe(true);
    expect(s.morale).toBeLessThan(morale0);
    expect(s.divan).toBeLessThan(divan0);
    expect(s.sections['kara-topkapi'].breach).toBeLessThan(0.1);
    expect(activeAssaults(s).length).toBe(0);
  });
});

describe('final assault', () => {
  function weakened(): GameState {
    const s = siegeState();
    s.time.day = d(28, 5, 1453) + 0.7;
    setWall(s, 'kara-lykos', 0.03, 0.35, 0.85, 450);
    setWall(s, 'kara-topkapi', 0.08, 0.5, 0.7, 500);
    s.byz.morale = 28;
    return s;
  }

  it('cannot be declared without a breach', () => {
    const s = siegeState();
    const h = harness(s);
    handleArmyCommand(s, { t: 'son-hucum' }, h.ctx(0));
    expect(s.flags[FLAG.sonHucumIlan]).toBeFalsy();
    expect(finalAssaultStatus(s).canDeclare).toBe(false);
  });

  it('takes a weakened city in three waves', () => {
    const s = weakened();
    const h = harness(s);
    handleArmyCommand(s, { t: 'son-hucum' }, h.ctx(0));
    expect(s.flags[FLAG.sonHucumIlan]).toBe(true);
    let maxWave = 0;
    for (let i = 0; i < 40000 && !s.outcome; i++) {
      h.tick();
      maxWave = Math.max(maxWave, Number(s.flags[FLAG.hucumDalgasi] ?? 0));
    }
    expect(maxWave).toBe(3);
    expect(s.flags[FLAG.sancakDikildi]).toBe(true);
    expect(s.flags[FLAG.sehirDustu]).toBe(true);
    expect(s.outcome?.result).toBe('zafer');
    expect(s.outcome?.siegeDays).toBeGreaterThan(40);
    expect(h.events.some((e) => e.name === 'banner:planted')).toBe(true);
    expect(h.events.some((e) => e.name === 'mehter:play' && e.p.playing)).toBe(true);
  });

  it('fails against an intact city (scripted declaration) and hurts morale', () => {
    const s = siegeState();
    for (const id of ['kara-lykos', 'kara-topkapi', 'kara-edirnekapi']) setWall(s, id, 1, 1, 0, 900);
    s.flags[FLAG.sonHucumIlan] = true; // e.g. forced by an event
    const morale0 = s.morale;
    const h = harness(s);
    handleArmyCommand(s, { t: 'son-hucum' }, h.ctx(0));
    for (let i = 0; i < 40000 && army(s).final && army(s).final!.phase !== 'basarisiz'; i++) h.tick();
    expect(army(s).final?.phase).toBe('basarisiz');
    expect(s.flags[FLAG.sehirDustu]).toBeFalsy();
    expect(s.outcome).toBeNull();
    expect(s.morale).toBeLessThan(morale0);
    expect(s.flags[FLAG.sonHucum]).toBe(false);
  });

  it('the son-hucum scenario is a live wave-3 assault', () => {
    const s = siegeState();
    s.time.day = d(29, 5, 1453) + 0.86;
    applyArmyScenario('son-hucum', s, world);
    const f = army(s).final!;
    expect(f.wave).toBe(3);
    const fighting = s.groups.filter((g: UnitGroup) => g.status === 'savasiyor');
    expect(fighting.length).toBeGreaterThan(3);
    const p = sectionPoint('kara-lykos', 0.5);
    for (const g of fighting.filter((x) => x.order.sectionId === 'kara-lykos')) expect(Math.hypot(g.tx - p.tx, g.ty - p.ty)).toBeLessThan(10);
  });
});

describe('campaigns & camp life', () => {
  it('asker-topla raises an away group that later marches into camp', () => {
    const s = siegeState();
    const h = harness(s);
    const akce0 = s.resources.akce;
    const before = s.groups.length;
    handleArmyCommand(s, { t: 'asker-topla', unit: 'sipahi', count: 1 }, h.ctx(0));
    expect(s.groups.length).toBe(before + 1);
    const g = s.groups[s.groups.length - 1];
    expect(g.type).toBe('sipahi');
    expect(g.status).toBe('uzakta');
    expect(s.resources.akce).toBeLessThan(akce0);
    expect(awayReason(s, g)).toMatch(/Yolda/);
    s.time.day = (extraOf(s, g.id).enterDay ?? s.time.day) + 0.01;
    h.tick();
    expect(g.status === 'yuruyor' || g.status === 'bosta').toBe(true);
    expect(awayReason(s, g)).toBeNull();
  });

  it('H7: akıncılar take the Thracian towns after the campaign', () => {
    const s = newGame();
    s.resources.erzak = 50000;
    s.resources.akce = 20000;
    const h = harness(s);
    expect(trakyaStatus(s).ok).toBe(true);
    handleArmyCommand(s, { t: 'ozel', feature: 'army', action: 'trakya' }, h.ctx(0));
    const st = trakyaStatus(s);
    expect(st.inProgress).toBe(true);
    const sent = army(s).trakya!.groupIds.map((id) => s.groups.find((g) => g.id === id)!);
    expect(sent.length).toBeGreaterThan(0);
    for (const g of sent) expect(extraOf(s, g.id).campaign).toBe('trakya');
    h.seconds((TRAKYA_DAYS + 0.5) * SEC_PER_DAY_HAZIRLIK);
    expect(s.flags[FLAG.trakyaAlindi]).toBe(true);
    expect(trakyaStatus(s).done).toBe(true);
    for (const g of sent) expect(extraOf(s, g.id).campaign).toBe('edirne');
  });

  it('H6: the Mora campaign takes groups away under Turahan Bey', () => {
    const s = newGame();
    const h = harness(s);
    s.flags[FLAG.moraSeferi] = true;
    h.tick();
    const mora = s.groups.filter((g) => extraOf(s, g.id).campaign === 'mora');
    expect(mora.length).toBeGreaterThan(0);
    for (const g of mora) {
      expect(g.status).toBe('uzakta');
      expect(g.commanderId).toBe('turahan');
    }
  });

  it('the Sultan’s tour raises morale and has a cooldown', () => {
    const s = siegeState();
    s.morale = 50;
    const h = harness(s);
    expect(sultanVisitStatus(s).ok).toBe(true);
    handleArmyCommand(s, { t: 'ozel', feature: 'army', action: 'padisah-ziyareti' }, h.ctx(0));
    expect(s.morale).toBeGreaterThan(50);
    const m1 = s.morale;
    expect(sultanVisitStatus(s).ok).toBe(false);
    handleArmyCommand(s, { t: 'ozel', feature: 'army', action: 'padisah-ziyareti' }, h.ctx(0));
    expect(s.morale).toBe(m1);
  });
});
