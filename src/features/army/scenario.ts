import type { ScenarioName } from '../../core/feature';
import { FLAG } from '../../core/flags';
import type { TilePt } from '../../core/iso';
import type { GameState, UnitGroup } from '../../core/state';
import type { WorldApi } from '../../core/world';
import { landmarkTile } from '../../data/landmarks';
import { sectionOutwardNormal, sectionPoint, towerPositions } from '../fortifications/api';
import { newAssault } from './combat';
import { BAL } from './data';
import { campSlot, edirneEntry, frontPoint, inwardAt, spreadT } from './geo';
import { planPath, sendStraight } from './move';
import { army, extraOf, type FinalAssaultState } from './state';

/** QA / showcase scenarios for the army. */

const SIEGE: ScenarioName[] = ['kusatma-gun1', 'bombardiman', 'gece-onarim', 'deniz-savasi', 'gemiler-karadan', 'lagim', 'kule', 'son-hucum', 'zafer', 'yenilgi'];

function bringToCamp(state: GameState, world: WorldApi): void {
  for (const g of state.groups) {
    const e = extraOf(state, g.id);
    if (g.status !== 'uzakta' || e.campaign === 'mora' || e.campaign === 'trakya') continue;
    if (!e.home) e.home = campSlot(world, e.wing, e.slot ?? 0).pos;
    place(g, e.home, 'bosta');
    e.campaign = undefined;
    e.enterDay = undefined;
  }
  army(state).marchPlanned = true;
}

function place(g: UnitGroup, p: TilePt, status: UnitGroup['status']): void {
  g.tx = p.tx;
  g.ty = p.ty;
  g.path = [];
  g.status = status;
  g.order = { type: 'bekle' };
}

function byName(state: GameState, name: string): UnitGroup | undefined {
  return state.groups.find((g) => g.name === name);
}

function weaken(g: UnitGroup | undefined, frac: number, morale: number, fatigue: number): void {
  if (!g) return;
  g.men = Math.max(1, Math.round(g.men * (1 - frac)));
  g.morale = morale;
  g.fatigue = fatigue;
}

function setTask(state: GameState, world: WorldApi, g: UnitGroup | undefined, type: 'bombardimani-koru' | 'hendek-doldur' | 'lagim-kaz' | 'hucum', sid: string, t: number, dist: number): void {
  if (!g) return;
  const p = frontPoint(world, sid, t, dist);
  place(g, p, type === 'hucum' ? 'savasiyor' : 'calisiyor');
  g.order = { type, sectionId: sid };
  extraOf(state, g.id).face = inwardAt(sid, t);
  const f = inwardAt(sid, t);
  g.facing = f.tx - f.ty >= 0 ? 1 : -1;
}

export function applyArmyScenario(name: ScenarioName, state: GameState, world: WorldApi): void {
  const a = army(state);
  if (name === 'yeni-oyun' || name === 'hisar-insaat' || name === 'kis-hazirlik') return;
  if (!SIEGE.includes(name)) return;

  if (name === 'kusatma-gun1') {
    // Day 1: the first columns are in position, the rest still on the Edirne road.
    a.marchPlanned = true;
    const entry = edirneEntry(world);
    for (const g of state.groups) {
      const e = extraOf(state, g.id);
      if (g.status !== 'uzakta' || e.campaign === 'mora' || e.campaign === 'trakya') continue;
      if (!e.home) e.home = campSlot(world, e.wing, e.slot ?? 0).pos;
      e.campaign = undefined;
      const k = e.marchKey ?? 0;
      if (k < 4.5) {
        place(g, e.home, 'bosta');
        continue;
      }
      const path = planPath(world, entry, e.home);
      if (!path || path.length < 2) {
        place(g, e.home, 'bosta');
        continue;
      }
      // spread the late columns along the road, the Sultan's household last
      const frac = Math.max(0.45, Math.min(0.95, 0.96 - (k - 4.5) * 0.2));
      const total = path.reduce((s, p, i) => s + (i ? Math.hypot(p.tx - path[i - 1].tx, p.ty - path[i - 1].ty) : 0), 0);
      let want = total * frac;
      let i = 1;
      let cur = path[0];
      while (i < path.length) {
        const d = Math.hypot(path[i].tx - cur.tx, path[i].ty - cur.ty);
        if (d >= want) {
          cur = { tx: cur.tx + ((path[i].tx - cur.tx) / d) * want, ty: cur.ty + ((path[i].ty - cur.ty) / d) * want };
          break;
        }
        want -= d;
        cur = path[i];
        i++;
      }
      g.tx = cur.tx;
      g.ty = cur.ty;
      g.path = path.slice(i);
      g.status = 'yuruyor';
      g.order = { type: 'git', target: { ...e.home } };
      e.goal = { ...e.home };
      const nx = g.path[0] ?? e.home;
      g.facing = nx.tx - g.tx - (nx.ty - g.ty) >= 0 ? 1 : -1;
    }
    return;
  }

  bringToCamp(state, world);
  const azap = state.groups.filter((g) => g.type === 'azap' && ['karaca', 'merkez'].includes(extraOf(state, g.id).wing));

  switch (name) {
    case 'bombardiman':
    case 'gece-onarim':
    case 'deniz-savasi':
    case 'gemiler-karadan':
    case 'kule':
      setTask(state, world, azap[0], 'bombardimani-koru', 'kara-lykos', 0.4, 3.4);
      setTask(state, world, azap[1], 'bombardimani-koru', 'kara-topkapi', 0.55, 3.4);
      if (name !== 'gece-onarim') setTask(state, world, byName(state, 'Azaplar III'), 'hendek-doldur', 'kara-topkapi', 0.3, 2.7);
      return;
    case 'lagim': {
      const l = state.groups.find((g) => g.type === 'lagimci');
      setTask(state, world, l, 'lagim-kaz', 'kara-egrikapi', 0.5, 6.5);
      setTask(state, world, azap[0], 'bombardimani-koru', 'kara-egrikapi', 0.4, 3.4);
      return;
    }
    case 'son-hucum':
      finalScenario(state, world);
      return;
    case 'zafer':
      zaferScenario(state, world);
      return;
    case 'yenilgi': {
      // the camp breaks up and marches back toward Edirne
      const entry = edirneEntry(world);
      for (const g of state.groups) {
        if (g.status !== 'bosta') continue;
        const path = planPath(world, { tx: g.tx, ty: g.ty }, entry);
        if (!path) continue;
        g.path = path;
        g.status = 'cekiliyor';
        g.order = { type: 'geri-cekil' };
        g.morale = 30;
        a.parade.push(g.id);
      }
      return;
    }
  }
}

/** 29 Mayıs before dawn: wave 3 at the Mesoteichion, Karaca at Eğrikapı. */
function finalScenario(state: GameState, world: WorldApi): void {
  const a = army(state);
  const main = 'kara-lykos';
  const side = 'kara-egrikapi';
  const jan = state.groups.filter((g) => g.type === 'yeniceri' && extraOf(state, g.id).wing === 'merkez');
  // wave 3 storms the Mesoteichion toward the Sulukule end (the lowest part of the valley)
  jan.forEach((g, i) => {
    setTask(state, world, g, 'hucum', main, 0.5 + (0.46 * i) / Math.max(1, jan.length - 1), 2.5 + (i % 2) * 0.9);
    g.morale = 92;
    g.fatigue = 15;
  });
  // waves 1 is spent and back behind the lines; İshak's Anadolu troops still press at Topkapı
  const bb = state.groups.filter((g) => g.type === 'basibozuk');
  bb.forEach((g, i) => {
    weaken(g, 0.28, 30, 70);
    place(g, frontPoint(world, main, spreadT(i, bb.length) * 0.6 + 0.05, 13), 'bosta');
  });
  const anad = state.groups.filter((g) => extraOf(state, g.id).wing === 'ishak');
  anad.forEach((g, i) => {
    weaken(g, 0.16, 48, 62);
    if (i < 2) setTask(state, world, g, 'hucum', 'kara-topkapi', 0.08 + i * 0.22, 2.6);
    else place(g, frontPoint(world, 'kara-topkapi', spreadT(i, anad.length), 10), 'bosta');
  });
  const kar = state.groups.filter((g) => extraOf(state, g.id).wing === 'karaca' && g.type === 'azap');
  kar.forEach((g, i) => setTask(state, world, g, 'hucum', side, spreadT(i, kar.length), 2.4));
  const cov = state.groups.filter((g) => g.type === 'azap' && extraOf(state, g.id).wing !== 'karaca').slice(0, 2);
  cov.forEach((g, i) => setTask(state, world, g, 'bombardimani-koru', main, 0.3 + i * 0.4, 3.6));
  const meh = state.groups.find((g) => g.type === 'mehter');
  if (meh) place(meh, frontPoint(world, main, 0.5, 11.5), 'bosta');

  const as = newAssault(state, main, 3);
  as.groupIds = jan.map((g) => g.id);
  as.committed = jan.reduce((s, g) => s + g.men, 0);
  as.foothold = 0.38;
  as.exhaustion = 0.5;
  as.intensity = 1;
  as.ratio = 2;
  a.assaults[main] = as;
  const as2 = newAssault(state, side, 3);
  as2.groupIds = kar.map((g) => g.id);
  as2.intensity = 0.6;
  a.assaults[side] = as2;
  const as3 = newAssault(state, 'kara-topkapi', 3);
  as3.groupIds = anad.slice(0, 2).map((g) => g.id);
  as3.intensity = 0.7;
  as3.foothold = 0.2;
  a.assaults['kara-topkapi'] = as3;
  const f: FinalAssaultState = {
    phase: 'dalga',
    declaredDay: state.time.day - 1.5,
    startDay: state.time.day - 0.06,
    wave: 3,
    t: 6,
    main,
    side: [side, 'kara-topkapi'],
    waves: [[], bb.map((g) => g.id), anad.map((g) => g.id), jan.map((g) => g.id)],
    diversion: kar.map((g) => g.id),
    cover: cov.map((g) => g.id),
    foothold: 0.38,
    exhaustion: 0.5,
    hasan: false,
    kerkoporta: false,
    sultanAtMoat: true,
    bannerAt: null,
    kerkoAt: null,
  };
  a.final = f;
  a.mehter = true;
  state.flags[FLAG.sonHucumIlan] = true;
  state.flags[FLAG.sonHucum] = true;
  state.flags[FLAG.hucumDalgasi] = 3;
  state.morale = 78;
}

/** 29 Mayıs: the city has fallen — troops stream through the breach, the Sultan rides to Ayasofya. */
function zaferScenario(state: GameState, world: WorldApi): void {
  const a = army(state);
  const main = 'kara-lykos';
  const towers = towerPositions(main);
  const tw = towers[Math.floor(towers.length / 2)] ?? { tx: sectionPoint(main, 0.5).tx, ty: sectionPoint(main, 0.5).ty };
  const n = sectionOutwardNormal(main, 0.5);
  const breach = sectionPoint(main, 0.5);
  const route: TilePt[] = [
    { tx: breach.tx - n.tx * 3, ty: breach.ty - n.ty * 3 },
    landmarkTile('havariyun'),
    landmarkTile('valens'),
    { tx: 112, ty: 153 },
    { tx: landmarkTile('ayasofya').tx - 4.5, ty: landmarkTile('ayasofya').ty - 1.5 },
  ];
  a.final = {
    phase: 'bitti',
    declaredDay: state.time.day - 2,
    startDay: state.time.day - 0.5,
    wave: 3,
    t: 0,
    main,
    side: ['kara-egrikapi'],
    waves: [[], [], [], []],
    diversion: [],
    cover: [],
    foothold: 1,
    exhaustion: 0.8,
    hasan: true,
    kerkoporta: true,
    sultanAtMoat: true,
    bannerAt: { tx: tw.tx, ty: tw.ty },
    kerkoAt: landmarkTile('kerkoporta'),
  };
  state.flags[FLAG.sonHucumIlan] = true;
  state.flags[FLAG.hucumDalgasi] = 3;
  state.flags[FLAG.sancakDikildi] = true;
  state.flags[FLAG.kerkoporta] = true;
  // Sultan + household near Ayasofya; yeniçeriler along the Mese
  const jan = state.groups.filter((g) => g.type === 'yeniceri' && extraOf(state, g.id).wing === 'merkez');
  const hassa = jan.find((g) => g.commanderId === 'fatih');
  const others = jan.filter((g) => g !== hassa);
  const seg = (k: number): TilePt[] => route.slice(k);
  const aya = landmarkTile('ayasofya');
  if (hassa) {
    hassa.tx = aya.tx - 9;
    hassa.ty = aya.ty - 2.5;
    sendStraight(state, hassa, [{ tx: aya.tx - 3.2, ty: aya.ty - 0.6 }]);
    hassa.status = 'yuruyor';
    a.parade.push(hassa.id);
  }
  // yeniçeri ortas lining the square before Ayasofya, banners raised
  const guard = others.splice(0, 2);
  guard.forEach((g, i) => {
    place(g, { tx: aya.tx - 4.2 + i * 1.2, ty: aya.ty + (i ? 2.6 : -3.4) }, 'bosta');
    extraOf(state, g.id).face = { tx: 0, ty: i ? -1 : 1 };
  });
  others.forEach((g, i) => {
    const k = i % 3;
    const p = seg(k)[0];
    g.tx = p.tx + (i % 2) * 1.2;
    g.ty = p.ty + (i % 2) * 1.2;
    sendStraight(state, g, seg(k + 1));
    g.status = 'yuruyor';
    a.parade.push(g.id);
  });
  // the rest pour in through the breach
  const pour = state.groups.filter((g) => (g.type === 'basibozuk' || extraOf(state, g.id).wing === 'ishak') && g.status === 'bosta').slice(0, 5);
  pour.forEach((g, i) => {
    const t = spreadT(i, pour.length);
    const out = frontPoint(world, main, t, 5);
    const gate = sectionPoint(main, t);
    g.tx = out.tx;
    g.ty = out.ty;
    sendStraight(state, g, [gate, route[0], route[1]]);
    g.status = 'yuruyor';
    a.parade.push(g.id);
  });
  a.mehter = true;
  void BAL;
}
