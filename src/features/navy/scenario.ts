import { TARIH } from '../../core/calendar';
import type { ScenarioName } from '../../core/feature';
import { FLAG } from '../../core/flags';
import { Rng } from '../../core/rng';
import type { GameState } from '../../core/state';
import type { WorldApi } from '../../core/world';
import { landmarkTile } from '../../data/landmarks';
import { haulCandidates, shipActive, spawnTypedShip } from './api';
import { NAVY_COMMANDERS, OVERLAND, RELIEF_SHIPS, SHIP_RADIUS } from './data';
import { chainGate, insideHorn, navPath, nearestWater, passable, routeAt, shoreDist, sultanBeach } from './geo';
import {
  deployFleet,
  gatherSlots,
  hornSlots,
  kasimpasaSlots,
  spawnHisarShips,
  spawnHornFleet,
  spawnReliefFleet,
  startBattle,
} from './sim';
import { extraOf, navyState } from './state';

/** New game: Christian ships moored in the Golden Horn, a few Ottoman ships at Rumeli Hisarı. */
export function navyInitState(state: GameState, world: WorldApi): void {
  navyState(state);
  spawnHornFleet(state, world);
  spawnHisarShips(state, world);
}

const SIEGE_SCENARIOS: ScenarioName[] = ['kusatma-gun1', 'bombardiman', 'gece-onarim', 'deniz-savasi', 'gemiler-karadan', 'lagim', 'kule', 'son-hucum', 'zafer', 'yenilgi'];

export function navyApplyScenario(name: ScenarioName, state: GameState, world: WorldApi): void {
  const n = navyState(state);
  const rng = new Rng((state.seed ^ 0x51a7) >>> 0);
  if (name === 'hisar-insaat') {
    setupHisar(state, world, rng);
    return;
  }
  if (!SIEGE_SCENARIOS.includes(name)) return;
  // Historical results of the events that lie before the scenario date.
  const day = state.time.day;
  if (day > TARIH.denizSavasi + 0.9 && state.flags[FLAG.denizSavasi] === undefined) state.flags[FLAG.denizSavasi] = 'yarildi';
  if (state.flags[FLAG.denizSavasi] === 'yarildi') n.commander = 'hamza';
  if (day > TARIH.gemilerKaradan + 0.9 && state.flags[FLAG.gemilerKaradan] === undefined) state.flags[FLAG.gemilerKaradan] = true;
  if (day > TARIH.yakmaBaskini + 0.9 && state.flags[FLAG.gemilerKaradan]) {
    state.flags[FLAG.yakmaBaskini] ??= 'onlendi';
    n.raid.stage = 'bitti';
  }
  if (state.flags[FLAG.zincirGerili] === undefined) state.flags[FLAG.zincirGerili] = true;
  // hazırlık ships join the fleet
  for (const s of state.ships) if (extraOf(state, s).role === 'hisar') extraOf(state, s).role = 'filo';
  deployFleet(state, world, 'anchored', null);
  state.flags[FLAG.donanmaKomutani] = n.commander;
  for (const e of Object.values(n.extra)) if (e.flagship && e.role === 'filo') e.name = `${NAVY_COMMANDERS[n.commander].name} — sancak kadırgası`;
  ambientPose(state, world, rng);

  if (state.flags[FLAG.denizSavasi] === 'yarildi' && name !== 'deniz-savasi') placeReliefInHorn(state, world);
  n.battle.stage = state.flags[FLAG.denizSavasi] ? 'bitti' : 'yok';

  if (state.flags[FLAG.gemilerKaradan] && name !== 'gemiler-karadan') {
    const cands = haulCandidates(state);
    const slots = kasimpasaSlots(world, cands.length + 2);
    cands.forEach((s, i) => {
      const p = slots[i];
      if (!p) return;
      s.tx = p.tx;
      s.ty = p.ty;
      s.heading = Math.PI * (0.6 + rng.range(-0.2, 0.2));
      const ex = extraOf(state, s);
      ex.role = 'halic';
      ex.anchor = { ...p };
    });
    n.overland.stage = 'tamam';
    n.overland.hauled = n.overland.total = cands.length;
    n.overland.doneDay = TARIH.gemilerKaradan;
  }
  if (state.flags[FLAG.halicKoprusu]) {
    n.bridge.stage = 'tamam';
    n.bridge.progress = 1;
  }

  if (name === 'deniz-savasi') setupBattle(state, world, rng);
  if (name === 'gemiler-karadan') setupOverland(state, world, rng);
  if (name === 'yenilgi') {
    spawnReliefFleet(state, world, null, 0.04);
    for (const s of state.ships) if (extraOf(state, s).role === 'hacli') s.status = 'seyir';
  }
}

/** A few ships sailing so the bay is alive even when paused. */
function ambientPose(state: GameState, world: WorldApi, rng: Rng): void {
  for (const s of state.ships) {
    const ex = extraOf(state, s);
    s.heading = ex.role === 'liman' ? Math.PI * 0.72 + rng.range(-0.25, 0.25) : Math.PI * 0.85 + rng.range(-0.3, 0.3);
    if (ex.role === 'devriye') {
      const goal = { tx: s.tx - 6 + rng.range(-2, 2), ty: s.ty + 10 + rng.range(-2, 2) };
      const p = navPath(world, { tx: s.tx, ty: s.ty }, goal, { chain: true });
      if (p) {
        s.path = p;
        s.status = 'seyir';
        s.heading = Math.atan2(p[0].ty - s.ty, p[0].tx - s.tx);
      }
    }
  }
}

function setupHisar(state: GameState, world: WorldApi, rng: Rng): void {
  const ships = state.ships.filter((s) => extraOf(state, s).role === 'hisar');
  if (!ships.length) return;
  const hisar = landmarkTile('rumeliHisari');
  // two transports unloading at the shore, one arriving under sail, the galleys escorting
  ships.forEach((s, i) => {
    const ex = extraOf(state, s);
    ex.idleT = 30 + i * 12;
    if (s.type === 'parandarya' && i < 2) {
      s.status = 'demirli';
      s.heading = Math.PI * 0.5 + (i ? 0.3 : -0.2);
    } else {
      const from = nearestWater(world, { tx: hisar.tx + 4 + i * 0.8, ty: hisar.ty - 2.5 - i * 2.2 }, { chain: false }, 8, 1);
      if (from) {
        s.tx = from.tx;
        s.ty = from.ty;
      }
      const goal = ex.anchor ?? { tx: hisar.tx + 3, ty: hisar.ty + 2 };
      const p = navPath(world, { tx: s.tx, ty: s.ty }, goal, { chain: false });
      if (p) {
        s.path = p;
        s.status = 'seyir';
        s.heading = Math.atan2(p[0].ty - s.ty, p[0].tx - s.tx);
      }
    }
  });
  void rng;
}

/** Relief ships (20 Nisan) moored inside the Horn after they got through. */
function placeReliefInHorn(state: GameState, world: WorldApi): void {
  const n = navyState(state);
  const slots = hornSlots(world, 14).slice(8);
  RELIEF_SHIPS.forEach((r, i) => {
    const p = slots[i] ?? chainGate(false, 4 + i);
    const s = spawnTypedShip(state, r.type, r.side, p.tx, p.ty, Math.PI * 0.7);
    const ex = extraOf(state, s);
    ex.role = 'liman';
    ex.name = r.name;
    ex.passed = true;
    ex.anchor = { ...p };
  });
  void n;
}

/** 20 Nisan, mid-afternoon: the four ships becalmed off Sarayburnu, swarmed by galleys. */
function setupBattle(state: GameState, world: WorldApi, rng: Rng): void {
  const n = navyState(state);
  const relief = startBattle(state, world, null);
  const b = n.battle;
  b.stage = 'savas';
  b.t = 70;
  b.calm = 45;
  n.wind.s = 0.06;
  n.wind.target = 0.05;
  // drifting knot of ships between Sarayburnu and the Galata shore
  const gate = chainGate(true, 2.2);
  const c = nearestWater(world, { tx: 137, ty: 141 }, { chain: true }, 8, 3) ?? gate;
  // four tall ships lashed together into a floating fortress
  const offs = [
    [0, 0],
    [1.7, 0.6],
    [-0.6, 1.8],
    [1.3, -1.7],
  ];
  relief.forEach((s, i) => {
    const p = { tx: c.tx + offs[i][0], ty: c.ty + offs[i][1] };
    const q = passable(world, p.tx, p.ty, { chain: true }) ? p : c;
    s.tx = q.tx;
    s.ty = q.ty;
    s.heading = -Math.PI * 0.62 + rng.range(-0.2, 0.2);
    s.path = [{ tx: gate.tx + (i - 1.5) * 0.4, ty: gate.ty + (i - 1.5) * 1.1 }];
    s.status = 'savas';
    s.hp = Math.round(s.hpMax * rng.range(0.62, 0.85));
  });
  b.centroid = { tx: c.tx + 0.6, ty: c.ty + 0.3 };
  b.sultan = sultanBeach(world, b.centroid);
  // the galleys swarm around them
  const galleys = state.ships.filter((s) => s.side === 'osmanli' && shipActive(s) && s.type !== 'parandarya');
  const per = new Map<number, number>();
  galleys.slice(0, 24).forEach((g, i) => {
    const t = relief[i % relief.length];
    const k = per.get(t.id) ?? 0;
    per.set(t.id, k + 1);
    const ex = extraOf(state, g);
    ex.targetId = t.id;
    const cx = c.tx + 0.6;
    const cy = c.ty + 0.2;
    const out = Math.atan2(t.ty - cy, t.tx - cx);
    ex.slot = out + [0, 0.9, -0.9, 1.8, -1.8][k % 5] + (k >= 4 ? 0.45 : 0);
    ex.rank = k;
    ex.engaged = true;
    ex.cd = rng.range(0, 3);
    ex.boardCd = rng.range(2, 10);
    ex.role = ex.role === 'devriye' ? 'filo' : ex.role;
    const inner = (SHIP_RADIUS[t.type] + SHIP_RADIUS[g.type]) * 0.98;
    const ring = k < 4 ? inner : inner + 2.1;
    let p = { tx: t.tx + Math.cos(ex.slot) * ring, ty: t.ty + Math.sin(ex.slot) * ring };
    for (const da of [0, 0.5, -0.5, 1, -1, 1.6, -1.6, 2.3, -2.3, Math.PI]) {
      const q = { tx: t.tx + Math.cos(ex.slot + da) * ring, ty: t.ty + Math.sin(ex.slot + da) * ring };
      if (shoreDist(world, q.tx, q.ty) >= 2 && passable(world, q.tx, q.ty, { chain: true })) {
        ex.slot += da;
        p = q;
        break;
      }
    }
    const q = passable(world, p.tx, p.ty, { chain: true }) ? p : nearestWater(world, p, { chain: true }, 4) ?? p;
    g.tx = q.tx;
    g.ty = q.ty;
    g.heading = ex.slot + Math.PI / 2 + (k % 2 ? Math.PI : 0);
    g.status = 'savas';
    g.path = [{ tx: p.tx, ty: p.ty }];
    g.hp = Math.round(g.hpMax * rng.range(0.45, 1));
  });
  // one galley burning, one going down
  const burning = galleys[3];
  if (burning) {
    extraOf(state, burning).burn = 20;
    burning.status = 'yaniyor';
  }
  const sinking = galleys[9];
  if (sinking) {
    sinking.status = 'batik';
    sinking.hp = 0;
    const ex = extraOf(state, sinking);
    ex.sinkT = 4;
    ex.targetId = undefined;
    ex.engaged = false;
    state.stats.shipsLost++;
  }
  // the reserve rows out from Diplokionion
  galleys.slice(24).forEach((g) => {
    const p = navPath(world, { tx: g.tx, ty: g.ty }, { tx: c.tx + 3, ty: c.ty - 3 }, { chain: true });
    if (p) {
      g.path = p;
      g.status = 'seyir';
      g.heading = Math.atan2(p[0].ty - g.ty, p[0].tx - g.tx);
    }
  });
  state.flags[FLAG.denizSavasiSuruyor] = true;
}

/** 22 Nisan night: slipway ready, half the ships already across, three on the ridge. */
function setupOverland(state: GameState, world: WorldApi, rng: Rng): void {
  const n = navyState(state);
  const o = n.overland;
  const cands = haulCandidates(state);
  o.stage = 'cekiliyor';
  o.slipway = 1;
  o.total = cands.length;
  o.workers = OVERLAND.workers;
  state.workforce.assigned += o.workers;
  const half = Math.max(1, Math.floor(cands.length / 2) - 1);
  const kslots = kasimpasaSlots(world, cands.length + 2);
  const gslots = gatherSlots(world, cands.length);
  // a procession of ships over the Pera ridge, one every ~5 tiles
  const onRidge = [0.86, 0.72, 0.58, 0.44, 0.3, 0.16];
  cands.forEach((s, i) => {
    const ex = extraOf(state, s);
    ex.targetId = undefined;
    if (i < half) {
      const p = kslots[i] ?? kslots[0];
      if (p) {
        s.tx = p.tx;
        s.ty = p.ty;
        ex.anchor = { ...p };
      }
      s.heading = Math.PI * (0.55 + rng.range(-0.25, 0.25));
      ex.role = 'halic';
      s.status = 'demirli';
      o.hauled++;
    } else if (i - half < onRidge.length) {
      const t = onRidge[i - half];
      const r = routeAt(t);
      s.tx = r.tx;
      s.ty = r.ty;
      s.heading = r.dir;
      s.status = 'karada';
      ex.haulT = t;
      ex.role = 'karadan';
    } else {
      const p = gslots[i] ?? gslots[0];
      if (p) {
        s.tx = p.tx;
        s.ty = p.ty;
        ex.anchor = { ...p };
      }
      s.heading = Math.PI * 0.9;
      ex.role = 'karadan';
      s.status = 'demirli';
      o.queue.push(s.id);
    }
  });
  // the most recently launched ship is still sliding out at Kasımpaşa
  const last = cands[half - 1];
  if (last) {
    const end = nearestWater(world, routeAt(1), { chain: true }, 6);
    if (end && insideHorn(end.tx, end.ty)) {
      const ex = extraOf(state, last);
      last.path = [ex.anchor ?? end];
      last.tx = end.tx;
      last.ty = end.ty;
      last.status = 'seyir';
    }
  }
  o.launchCd = 1.2;
  o.lastEmit = o.slipway * 0.3 + (o.hauled / Math.max(1, o.total)) * 0.7;
  state.flags[FLAG.karadanIlerleme] = o.lastEmit;
}
