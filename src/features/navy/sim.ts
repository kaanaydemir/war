import { segmentOf, siegeDayNumber, TARIH } from '../../core/calendar';
import type { Command } from '../../core/commands';
import { MAP_H } from '../../core/constants';
import type { SimContext } from '../../core/feature';
import { FLAG } from '../../core/flags';
import type { TilePt } from '../../core/iso';
import type { Rng } from '../../core/rng';
import { addLog, type GameState, type Ship, type ShipType, type Side } from '../../core/state';
import type { WorldApi } from '../../core/world';
import { landmarkTile } from '../../data/landmarks';
import { spend } from '../economy/api';
import { getEventDef } from '../events/api';
import { bridgeCheck, haulCandidates, overlandCheck, shipActive, spawnTypedShip } from './api';
import { BATTLE_EFFECTS, BRIDGE, HORN_FLEET, NAVY_COMMANDERS, OTTOMAN_FLEET, OVERLAND, RELIEF_SHIPS, SHIP_RADIUS, SHIP_TYPES } from './data';
import {
  anchorSlots,
  angDiff,
  chainGate,
  insideHorn,
  nearestLand,
  nearestWater,
  navPath,
  passable,
  ROUTE_LENGTH,
  ROUTE_T,
  routeAt,
  segmentClear,
  shoreDist,
  sultanBeach,
  type NavOpts,
} from './geo';
import { extraOf, navyState, type NavyState, type ShipExtra } from './state';

/**
 * NAVY simulation: movement, the Golden Horn chain, the 20 Nisan battle (K5),
 * the overland haul (K7), the Venetian fire raid (K8), the pontoon bridge (K9)
 * and the final relief fleet. Pure — no Phaser. Uses ctx.rng only.
 */

const BATTLE_START_FRAC = 0.1;
const ENGAGE_R = 1.9;
/** Galleys alongside a tall ship; the rest form a second line. */
const INNER_LINE = 4;
const REMOVE_SUNK_AFTER = 45;

// ───────────────────────────── helpers ─────────────────────────────

/**
 * The events feature shows the K5/K7/K8 cards (keyed off our flags) and applies
 * their morale / Divan consequences. When such a card exists we only produce
 * the hard results (flags, ships, commander) to avoid double effects.
 */
function eventCardHandles(id: string): boolean {
  try {
    return !!getEventDef(id);
  } catch {
    return false;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function shipById(state: GameState, id: number | undefined | null): Ship | undefined {
  if (id == null) return undefined;
  return state.ships.find((s) => s.id === id);
}

export function navOptsFor(state: GameState, ship: Ship): NavOpts {
  const n = navyState(state);
  const chainUp = !!state.flags[FLAG.zincirGerili];
  const friendly = ship.side !== 'osmanli';
  return { chain: chainUp && !(friendly && n.chainOpen > 0), bridge: !!state.flags[FLAG.halicKoprusu] };
}

function pos(s: { tx: number; ty: number }): { tx: number; ty: number } {
  return { tx: s.tx, ty: s.ty };
}

function log(state: GameState, ctx: SimContext | null, kind: Parameters<typeof addLog>[1], text: string, notify?: 'bilgi' | 'uyari' | 'basari' | 'tehlike'): void {
  addLog(state, kind, text);
  if (ctx) {
    ctx.bus.emit('log', state.log[state.log.length - 1]);
    if (notify) ctx.bus.emit('notify', { text, kind: notify });
  }
}

/** Send a ship along a sea path to `to` (returns false if unreachable). */
export function sendShip(state: GameState, world: WorldApi, ship: Ship, to: TilePt): boolean {
  const p = navPath(world, pos(ship), to, navOptsFor(state, ship));
  if (!p) return false;
  ship.path = p;
  if (ship.status === 'demirli') ship.status = 'seyir';
  return true;
}

/** Path for a group: one A* for the leader, followers join the shared path. */
function sendGroup(state: GameState, world: WorldApi, ships: Ship[], slots: TilePt[]): number {
  if (!ships.length) return 0;
  let ok = 0;
  const cx = ships.reduce((a, s) => a + s.tx, 0) / ships.length;
  const cy = ships.reduce((a, s) => a + s.ty, 0) / ships.length;
  const lead = ships.reduce((b, s) => (Math.hypot(s.tx - cx, s.ty - cy) < Math.hypot(b.tx - cx, b.ty - cy) ? s : b), ships[0]);
  const goal = slots[0];
  const shared = navPath(world, pos(lead), goal, navOptsFor(state, lead));
  ships.forEach((s, i) => {
    const slot = slots[i % slots.length];
    const o = navOptsFor(state, s);
    let path: TilePt[] | null = null;
    if (segmentClear(world, pos(s), slot, o)) path = [slot];
    else if (shared && shared.length) {
      // join the shared path at the first waypoint visible from this ship
      let k = shared.findIndex((wp) => segmentClear(world, pos(s), wp, o));
      if (k >= 0) {
        path = shared.slice(k, shared.length - 1);
        const last = path.length ? path[path.length - 1] : pos(s);
        if (segmentClear(world, last, slot, o)) path.push(slot);
        else path.push(shared[shared.length - 1]);
      }
    }
    if (!path) path = navPath(world, pos(s), slot, o);
    if (path) {
      s.path = path.map((p) => ({ tx: p.tx, ty: p.ty }));
      if (s.status === 'demirli') s.status = 'seyir';
      ok++;
    }
  });
  return ok;
}

/** Formation slots around a point (hex-ish rings), all on passable water. */
export function formationSlots(world: WorldApi, center: TilePt, count: number, spacing: number, o: NavOpts): TilePt[] {
  const out: TilePt[] = [];
  const c = passable(world, center.tx, center.ty, o) ? center : nearestWater(world, center, o, 6) ?? center;
  out.push({ tx: c.tx, ty: c.ty });
  for (let ring = 1; out.length < count && ring < 8; ring++) {
    const m = ring * 6;
    for (let k = 0; k < m && out.length < count; k++) {
      const a = (k / m) * Math.PI * 2 + ring * 0.4;
      const p = { tx: c.tx + Math.cos(a) * ring * spacing, ty: c.ty + Math.sin(a) * ring * spacing * 0.9 };
      if (passable(world, p.tx, p.ty, o)) out.push(p);
    }
  }
  while (out.length < count) out.push({ tx: c.tx, ty: c.ty });
  return out;
}

function damage(state: GameState, ctx: SimContext, ship: Ship, amount: number, hitEvent: boolean): void {
  if (ship.status === 'batik') return;
  ship.hp -= amount;
  if (hitEvent) ctx.bus.emit('ship:hit', { shipId: ship.id, at: pos(ship) });
  if (ship.hp <= 0) sinkShip(state, ctx, ship);
}

function ignite(state: GameState, ctx: SimContext, ship: Ship, seconds: number): void {
  if (ship.status === 'batik') return;
  const ex = extraOf(state, ship);
  if (ex.burn <= 0) ctx.bus.emit('ship:burning', { shipId: ship.id, at: pos(ship) });
  ex.burn = Math.max(ex.burn, seconds);
}

export function sinkShip(state: GameState, ctx: SimContext | null, ship: Ship): void {
  if (ship.status === 'batik') return;
  const ex = extraOf(state, ship);
  ship.status = 'batik';
  ship.hp = 0;
  ship.path = [];
  ex.sinkT = 0;
  ex.burn = 0;
  ex.targetId = undefined;
  if (ship.side === 'osmanli') state.stats.shipsLost++;
  ctx?.bus.emit('ship:sunk', { shipId: ship.id, type: ship.type, at: pos(ship) });
  const n = navyState(state);
  for (const e of Object.values(n.extra)) if (e.targetId === ship.id) e.targetId = undefined;
}

// ───────────────────────────── fleet setup ─────────────────────────────

export function hornSlots(world: WorldApi, count: number): TilePt[] {
  return anchorSlots(world, chainGate(false, 3), count, 2.3, { chain: true }, (p) => insideHorn(p.tx, p.ty) && p.tx > 108, 2);
}

export function diploSlots(world: WorldApi, count: number): TilePt[] {
  return anchorSlots(world, landmarkTile('diplokionion'), count, 2.25, { chain: true }, (p) => !insideHorn(p.tx, p.ty), 2);
}

export function kasimpasaSlots(world: WorldApi, count: number): TilePt[] {
  return anchorSlots(world, landmarkTile('kasimpasa'), count, 1.85, { chain: true }, (p) => insideHorn(p.tx, p.ty), 2);
}

/** The Christian ships moored inside the Golden Horn. */
export function spawnHornFleet(state: GameState, world: WorldApi): void {
  const slots = hornSlots(world, HORN_FLEET.length);
  HORN_FLEET.forEach((h, i) => {
    const p = slots[i];
    if (!p) return;
    const s = spawnTypedShip(state, h.type, h.side, p.tx, p.ty, Math.PI * 0.75);
    const ex = extraOf(state, s);
    ex.role = 'liman';
    ex.name = h.name;
    ex.anchor = { ...p };
  });
}

/** Hazırlık: a few galleys and transports ferrying materials to Rumeli Hisarı. */
export function spawnHisarShips(state: GameState, world: WorldApi): void {
  const seed = landmarkTile('rumeliHisari');
  const slots = anchorSlots(world, { tx: seed.tx + 3, ty: seed.ty + 1 }, 5, 1.6, { chain: false }, () => true, 1);
  const types: ShipType[] = ['parandarya', 'parandarya', 'kadirga', 'parandarya', 'kadirga'];
  types.forEach((t, i) => {
    const p = slots[i];
    if (!p) return;
    const s = spawnTypedShip(state, t, 'osmanli', p.tx, p.ty, Math.PI / 2);
    const ex = extraOf(state, s);
    ex.role = 'hisar';
    ex.anchor = { ...p };
    ex.idleT = 8 + i * 9;
  });
}

/**
 * The Ottoman siege fleet under Baltaoğlu Süleyman Bey.
 * 'live': sails in from the Marmara (Gelibolu) to Diplokionion; 'anchored': already moored there.
 */
export function deployFleet(state: GameState, world: WorldApi, mode: 'live' | 'anchored', ctx: SimContext | null): void {
  const n = navyState(state);
  if (n.deployed) return;
  n.deployed = true;
  if (state.flags[FLAG.zincirGerili] === undefined) state.flags[FLAG.zincirGerili] = true;
  state.flags[FLAG.donanmaKomutani] = n.commander;
  if (!state.ships.some((s) => s.side !== 'osmanli' && extraOf(state, s).role === 'liman')) spawnHornFleet(state, world);

  const types: ShipType[] = [];
  for (const f of OTTOMAN_FLEET) for (let i = 0; i < f.count; i++) types.push(f.type);
  const existing = state.ships.filter((s) => s.side === 'osmanli' && shipActive(s));
  const slots = diploSlots(world, types.length + 2);
  const fleet: Ship[] = [];
  // reuse the hazırlık ships first
  for (const s of existing) {
    const ex = extraOf(state, s);
    if (ex.role === 'hisar') ex.role = 'filo';
    const k = types.indexOf(s.type);
    if (k >= 0) types.splice(k, 1);
    fleet.push(s);
  }
  let start: TilePt | null = null;
  if (mode === 'live') start = nearestWater(world, { tx: 150, ty: MAP_H - 3 }, { chain: true }, 20);
  types.forEach((t, i) => {
    const slot = slots[(fleet.length) % Math.max(1, slots.length)] ?? landmarkTile('diplokionion');
    let p: TilePt = slot;
    if (mode === 'live' && start) {
      const row = Math.floor(i / 3);
      const col = (i % 3) - 1;
      const q = { tx: start.tx + col * 1.4, ty: start.ty + row * 1.3 };
      p = passable(world, q.tx, q.ty, { chain: true }) ? q : start;
    }
    const s = spawnTypedShip(state, t, 'osmanli', p.tx, p.ty, mode === 'live' ? -Math.PI / 2 : Math.PI * 0.8);
    fleet.push(s);
  });
  // flagship + roles + anchors
  let flagDone = false;
  fleet.forEach((s, i) => {
    const ex = extraOf(state, s);
    ex.anchor = slots[i] ? { ...slots[i] } : pos(s);
    if (!flagDone && s.type === 'kadirga') {
      flagDone = true;
      ex.flagship = true;
      ex.name = `${NAVY_COMMANDERS[n.commander].name} — sancak kadırgası`;
    }
  });
  // three fustae patrol in front of the chain
  fleet.filter((s) => s.type === 'fusta').slice(0, 3).forEach((s, i) => {
    const ex = extraOf(state, s);
    ex.role = 'devriye';
    ex.wp = i;
    ex.idleT = 4 + i * 6;
  });
  if (mode === 'live') {
    const moving = fleet.filter((s) => Math.hypot(s.tx - (extraOf(state, s).anchor?.tx ?? s.tx), s.ty - (extraOf(state, s).anchor?.ty ?? s.ty)) > 1);
    sendGroup(state, world, moving, moving.map((s) => extraOf(state, s).anchor!));
    log(state, ctx, 'olay', 'Baltaoğlu Süleyman Bey komutasındaki donanma Gelibolu\'dan gelip Diplokionion\'a (Beşiktaş) demirledi. Haliç\'in ağzı zincirle kapalı.', 'bilgi');
  } else {
    for (const s of fleet) {
      const a = extraOf(state, s).anchor;
      if (a) {
        s.tx = a.tx;
        s.ty = a.ty;
      }
      s.path = [];
      s.status = 'demirli';
    }
  }
}

// ───────────────────────────── wind ─────────────────────────────

function windTick(n: NavyState, ctx: SimContext): void {
  const w = n.wind;
  const b = n.battle;
  const dt = ctx.dtSec;
  if (b.stage === 'yaklasma' || b.stage === 'savas') {
    // historical script: strong southerly → dead calm off Sarayburnu → evening breeze
    w.target = b.calm > 0 ? 0.05 : b.calm === -2 ? 0.85 : 0.95;
    w.dir = -Math.PI / 2 + Math.sin(b.t * 0.05) * 0.2;
  } else {
    w.t -= dt;
    if (w.t <= 0) {
      w.t = ctx.rng.range(20, 50);
      w.target = clamp(0.4 + ctx.rng.range(-0.3, 0.45), 0.05, 1);
      w.dir += ctx.rng.range(-0.5, 0.5);
    }
  }
  w.s += (w.target - w.s) * Math.min(1, dt * 0.35);
}

// ───────────────────────────── movement ─────────────────────────────

function speedOf(state: GameState, n: NavyState, ship: Ship, ex: ShipExtra): number {
  const def = SHIP_TYPES[ship.type];
  let v = def?.speed ?? 0.5;
  if (def?.tall) v *= 0.1 + 0.9 * n.wind.s;
  else if (n.battle.stage === 'savas' || n.battle.stage === 'yaklasma') v *= ship.side === 'osmanli' && ex.targetId != null ? 1.35 : 1;
  if (ex.role === 'yardim' && n.battle.stage !== 'yok') {
    const k = engagedCount(state, ship.id);
    v /= 1 + 0.05 * k;
  }
  if (ex.role === 'baskin' && ex.flagship) v *= 1.25;
  if (ex.burn > 0) v *= def?.tall ? 0.85 : 0.6;
  if (ship.hp < ship.hpMax * 0.3) v *= 0.7;
  return v;
}

function engagedCount(state: GameState, id: number): number {
  const n = navyState(state);
  let k = 0;
  for (const s of state.ships) {
    if (s.status === 'batik' || s.side !== 'osmanli') continue;
    const e = n.extra[s.id];
    if (e && e.targetId === id) k++;
  }
  return k;
}

function moveShip(state: GameState, ctx: SimContext, n: NavyState, ship: Ship, ex: ShipExtra): void {
  const dt = ctx.dtSec;
  if (!ship.path.length) return;
  const wp = ship.path[0];
  const dx = wp.tx - ship.tx;
  const dy = wp.ty - ship.ty;
  const d = Math.hypot(dx, dy);
  // intermediate waypoints are passed loosely (ships crowd each other)
  if (d < (ship.path.length > 1 ? 1 : 0.2)) {
    ship.path.shift();
    return;
  }
  const desired = Math.atan2(dy, dx);
  const def = SHIP_TYPES[ship.type];
  const turn = (def?.tall ? 0.9 : 1.7) * dt;
  const diff = angDiff(ship.heading, desired);
  ship.heading += clamp(diff, -turn, turn);
  const k = Math.abs(diff) > 1.4 ? 0.3 : 1 - Math.abs(diff) * 0.35;
  const step = Math.min(d, speedOf(state, n, ship, ex) * dt * k);
  const nx = ship.tx + (dx / d) * step;
  const ny = ship.ty + (dy / d) * step;
  if (passable(ctx.world, nx, ny, navOptsFor(state, ship))) {
    ship.tx = nx;
    ship.ty = ny;
  } else {
    ex.repathT += dt;
    if (ex.repathT > 1.5) {
      ex.repathT = 0;
      const goal = ship.path[ship.path.length - 1];
      const p = navPath(ctx.world, pos(ship), goal, navOptsFor(state, ship));
      ship.path = p ?? [];
    }
  }
}

function separation(state: GameState, world: WorldApi): void {
  const ships = state.ships.filter((s) => s.status !== 'batik' && s.status !== 'karada');
  for (let i = 0; i < ships.length; i++) {
    const a = ships[i];
    const ta = SHIP_TYPES[a.type]?.tall;
    const ra = SHIP_RADIUS[a.type] ?? 1;
    for (let j = i + 1; j < ships.length; j++) {
      const b = ships[j];
      const min = (ra + (SHIP_RADIUS[b.type] ?? 1)) * 0.92;
      const dx = b.tx - a.tx;
      const dy = b.ty - a.ty;
      if (Math.abs(dx) > min || Math.abs(dy) > min) continue;
      const d = Math.hypot(dx, dy) || 0.01;
      if (d >= min) continue;
      const push = (min - d) * 0.25;
      const ux = dx / d;
      const uy = dy / d;
      const ao = navOptsFor(state, a);
      const bo = navOptsFor(state, b);
      // heavier ships (tall, anchored) give way less
      const ma = (ta ? 5 : 1) * (a.status === 'demirli' ? 3 : 1);
      const mb = (SHIP_TYPES[b.type]?.tall ? 5 : 1) * (b.status === 'demirli' ? 3 : 1);
      const wa = (2 * mb) / (ma + mb);
      const wb = (2 * ma) / (ma + mb);
      if (passable(world, a.tx - ux * push * wa, a.ty - uy * push * wa, ao)) {
        a.tx -= ux * push * wa;
        a.ty -= uy * push * wa;
      }
      if (passable(world, b.tx + ux * push * wb, b.ty + uy * push * wb, bo)) {
        b.tx += ux * push * wb;
        b.ty += uy * push * wb;
      }
    }
  }
}

function updateStatus(ship: Ship, ex: ShipExtra): void {
  if (ship.status === 'batik' || ship.status === 'karada') return;
  if (ex.burn > 0) ship.status = 'yaniyor';
  else if (ex.targetId != null && ex.engaged) ship.status = 'savas';
  else if (ship.path.length) ship.status = 'seyir';
  else ship.status = 'demirli';
}

// ───────────────────────────── main tick ─────────────────────────────

export function navySimTick(state: GameState, ctx: SimContext): void {
  const n = navyState(state);
  const dt = ctx.dtSec;
  if (state.time.phase === 'bitti') return;
  if (state.time.phase === 'kusatma' && !n.deployed) deployFleet(state, ctx.world, 'live', ctx);
  windTick(n, ctx);
  if (n.chainOpen > 0) {
    n.chainOpen -= dt;
    if (n.chainOpen <= 0) {
      n.chainOpen = 0;
      ctx.bus.emit('navy:chain', { open: false });
    }
  }
  state.flags[FLAG.donanmaKomutani] = n.commander;

  battleTick(state, ctx, n);
  overlandTick(state, ctx, n);
  bridgeTick(state, ctx, n);
  raidTick(state, ctx, n);
  reliefFleetTick(state, ctx, n);
  ambientTick(state, ctx, n);

  // per-ship: sinking, burning, movement
  for (let i = state.ships.length - 1; i >= 0; i--) {
    const s = state.ships[i];
    const ex = extraOf(state, s);
    if (s.status === 'batik') {
      if (ex.sinkT < 0) {
        ex.sinkT = 0;
        ctx.bus.emit('ship:sunk', { shipId: s.id, type: s.type, at: pos(s) });
      }
      ex.sinkT += dt;
      if (ex.sinkT > REMOVE_SUNK_AFTER) {
        state.ships.splice(i, 1);
        delete n.extra[s.id];
      }
      continue;
    }
    if (s.hp <= 0) {
      sinkShip(state, ctx, s);
      continue;
    }
    if (ex.manualT && ex.manualT > 0) ex.manualT -= dt;
    if (ex.burn > 0) {
      ex.burn -= dt;
      const tall = SHIP_TYPES[s.type]?.tall;
      damage(state, ctx, s, (tall ? 1.4 : 1.5) * dt, false);
      if (ex.burn <= 0) ex.burn = 0;
      if ((s.status as string) === 'batik') continue;
    }
    if (s.status === 'karada') continue;
    moveShip(state, ctx, n, s, ex);
    updateStatus(s, ex);
  }
  separation(state, ctx.world);
}

// ───────────────────────────── ambient ─────────────────────────────

function ambientTick(state: GameState, ctx: SimContext, n: NavyState): void {
  const dt = ctx.dtSec;
  const devriyeWps: TilePt[] = [chainGate(true, 5), { tx: 150, ty: 128 }, landmarkTile('diplokionion')];
  for (const s of state.ships) {
    if (!shipActive(s) || s.path.length) continue;
    const ex = extraOf(state, s);
    if (ex.targetId != null || (ex.manualT ?? 0) > 0) continue;
    if (ex.role === 'hisar') {
      ex.idleT = (ex.idleT ?? 0) - dt;
      if (ex.idleT > 0) continue;
      ex.idleT = ctx.rng.range(18, 40);
      // shuttle between the Hisar shore and the north (Black Sea) map edge
      const home = ex.anchor ?? pos(s);
      const atHome = Math.hypot(s.tx - home.tx, s.ty - home.ty) < 2;
      const away = nearestWater(ctx.world, { tx: home.tx + 1 + ctx.rng.range(-1, 1), ty: 3 }, { chain: false }, 8) ?? home;
      sendShip(state, ctx.world, s, atHome ? away : home);
    } else if (ex.role === 'devriye' && state.time.phase === 'kusatma' && n.battle.stage !== 'savas' && n.battle.stage !== 'yaklasma') {
      ex.idleT = (ex.idleT ?? 0) - dt;
      if (ex.idleT > 0) continue;
      ex.idleT = ctx.rng.range(10, 22);
      ex.wp = ((ex.wp ?? 0) + 1) % devriyeWps.length;
      const w = devriyeWps[ex.wp];
      const jitter = { tx: w.tx + ctx.rng.range(-2, 2), ty: w.ty + ctx.rng.range(-2, 2) };
      sendShip(state, ctx.world, s, jitter);
    }
  }
}

// ───────────────────────────── K5: 20 Nisan ─────────────────────────────

function reliefSpawnPoints(world: WorldApi, count: number): TilePt[] {
  const base = nearestWater(world, { tx: 145, ty: MAP_H - 14 }, { chain: true }, 24) ?? { tx: 145, ty: MAP_H - 14 };
  const out: TilePt[] = [];
  for (let i = 0; i < count; i++) {
    const q = { tx: base.tx + (i % 2 ? 1 : -1) * (0.9 + Math.floor(i / 2) * 1.2), ty: base.ty + Math.floor(i / 2) * 1.6 };
    out.push(passable(world, q.tx, q.ty, { chain: true }) ? q : { ...base });
  }
  return out;
}

/** Spawn the four relief ships and start the battle (also used by the scenario). */
export function startBattle(state: GameState, world: WorldApi, ctx: SimContext | null): Ship[] {
  const n = navyState(state);
  const b = n.battle;
  b.stage = 'yaklasma';
  b.t = 0;
  b.calm = -1;
  b.reached = 0;
  b.sunkRelief = 0;
  b.sunkOttoman = 0;
  state.flags[FLAG.denizSavasiSuruyor] = true;
  const pts = reliefSpawnPoints(world, RELIEF_SHIPS.length);
  const ships: Ship[] = RELIEF_SHIPS.map((r, i) => {
    const s = spawnTypedShip(state, r.type, r.side, pts[i].tx, pts[i].ty, -Math.PI / 2);
    const ex = extraOf(state, s);
    ex.role = 'yardim';
    ex.name = r.name;
    ex.slot = i;
    return s;
  });
  b.reliefIds = ships.map((s) => s.id);
  const gate = chainGate(true, 2.2);
  const goals = ships.map((_, i) => ({ tx: gate.tx + (i - 1.5) * 0.4, ty: gate.ty + (i - 1.5) * 1.1 }));
  sendGroup(state, world, ships, goals);
  if (ctx) {
    ctx.bus.emit('naval:battle', { started: true });
    log(state, ctx, 'olay', 'Marmara\'da yelken göründü: üç Ceneviz gemisi ile bir imparatorluk zahire gemisi, kuvvetli lodosla Haliç zincirine doğru geliyor!', 'tehlike');
    log(state, ctx, 'bilgi', `Sultan, ${NAVY_COMMANDERS[n.commander].name}\'e gemileri ya ele geçirmesini ya da batırmasını emretti. Kadırgalar kürek çekerek çıkıyor.`);
    const c = landmarkTile('akropolis');
    ctx.bus.emit('camera:focus', { tx: c.tx, ty: c.ty - 6, zoom: 2, duration: 1.4 });
  }
  return ships;
}

function battleTick(state: GameState, ctx: SimContext, n: NavyState): void {
  const b = n.battle;
  if (b.stage === 'yok') {
    if (
      state.time.phase === 'kusatma' &&
      n.deployed &&
      !state.flags[FLAG.denizSavasi] &&
      state.time.day >= TARIH.denizSavasi + BATTLE_START_FRAC
    )
      startBattle(state, ctx.world, ctx);
    return;
  }
  if (b.stage === 'bitti') return;
  const dt = ctx.dtSec;
  b.t += dt;
  const relief = b.reliefIds.map((id) => shipById(state, id)).filter((s): s is Ship => !!s && s.status !== 'batik');
  const outside = relief.filter((s) => !extraOf(state, s).passed);
  const gate = chainGate(true, 2.2);

  // centroid & calm
  if (outside.length) {
    const cx = outside.reduce((a, s) => a + s.tx, 0) / outside.length;
    const cy = outside.reduce((a, s) => a + s.ty, 0) / outside.length;
    b.centroid = { tx: cx, ty: cy };
    const dGate = Math.hypot(cx - gate.tx, cy - gate.ty);
    if (b.calm === -1 && dGate < 18) {
      b.calm = ctx.rng.range(40, 50);
      b.stage = 'savas';
      log(state, ctx, 'olay', 'Sarayburnu açıklarında rüzgâr birden kesildi. Gemiler akıntıyla sürükleniyor; kadırgalar etraflarını sardı.', 'uyari');
    } else if (b.calm > 0) {
      b.calm -= dt;
      if (b.calm <= 0) {
        b.calm = -2;
        log(state, ctx, 'olay', 'Akşama doğru rüzgâr yeniden esti; büyük gemilerin yelkenleri doldu.', 'uyari');
      }
    }
    if (b.stage === 'yaklasma' && b.t > 40) b.stage = 'savas';
  }

  // the Sultan rides into the shallows near the fight
  b.sultanT -= dt;
  if (b.centroid && b.sultanT <= 0) {
    b.sultanT = 6;
    const beach = sultanBeach(ctx.world, b.centroid);
    if (beach) b.sultan = beach;
  }

  // relief ships: reaching the chain
  for (const s of outside) {
    const ex = extraOf(state, s);
    if (Math.hypot(s.tx - gate.tx, s.ty - gate.ty) < 2.6) {
      ex.passed = true;
      ex.role = 'liman';
      b.reached++;
      if (n.chainOpen <= 0) ctx.bus.emit('navy:chain', { open: true });
      n.chainOpen = 30;
      const slots = hornSlots(ctx.world, 14);
      const slot = slots[8 + (b.reached % 6)] ?? chainGate(false, 4);
      s.path = [chainGate(false, 2.5), slot];
      ex.anchor = { ...slot };
      log(state, ctx, 'kayip', `${ex.name ?? 'Bir yardım gemisi'} zincire ulaştı; zincir indirildi ve gemi Haliç\'e girdi.`);
      for (const e of Object.values(n.extra)) if (e.targetId === s.id) e.targetId = undefined;
    } else if (!s.path.length) {
      // keep pushing toward the gate
      const goal = { tx: gate.tx + ((ex.slot ?? 0) - 1.5) * 0.4, ty: gate.ty + ((ex.slot ?? 0) - 1.5) * 1.1 };
      const p = navPath(ctx.world, pos(s), goal, navOptsFor(state, s));
      s.path = p ?? [goal];
    }
  }

  // galleys: assign targets
  b.retargetT -= dt;
  const live = outside;
  if (b.retargetT <= 0 && live.length) {
    b.retargetT = 1.5;
    const load = new Map<number, number>();
    for (const r of live) load.set(r.id, engagedCount(state, r.id));
    for (const s of state.ships) {
      if (s.side !== 'osmanli' || !shipActive(s) || s.type === 'parandarya') continue;
      const ex = extraOf(state, s);
      if (ex.role === 'karadan' || ex.role === 'halic' || insideHorn(s.tx, s.ty)) continue;
      if ((ex.manualT ?? 0) > 0) continue;
      const cur = shipById(state, ex.targetId);
      if (cur && cur.status !== 'batik' && !extraOf(state, cur).passed) continue;
      if (b.centroid && Math.hypot(s.tx - b.centroid.tx, s.ty - b.centroid.ty) > 70) continue;
      let best: Ship | null = null;
      let bs = Infinity;
      for (const r of live) {
        const sc = Math.hypot(s.tx - r.tx, s.ty - r.ty) + (load.get(r.id) ?? 0) * 3.5;
        if (sc < bs) {
          bs = sc;
          best = r;
        }
      }
      if (best) {
        ex.targetId = best.id;
        const k = load.get(best.id) ?? 0;
        load.set(best.id, k + 1);
        // slots face away from the lashed knot of tall ships, alternating either side
        const out = b.centroid ? Math.atan2(best.ty - b.centroid.ty, best.tx - b.centroid.tx) : 0;
        const spread = [0, 0.9, -0.9, 1.8, -1.8][k % 5] + (k >= INNER_LINE ? 0.45 : 0);
        ex.slot = (Math.hypot(best.tx - (b.centroid?.tx ?? best.tx), best.ty - (b.centroid?.ty ?? best.ty)) < 0.3 ? k * 2.399 : out + spread) % (Math.PI * 2);
        ex.rank = k;
        ex.cd = ctx.rng.range(0.5, 3);
        ex.boardCd = ctx.rng.range(5, 12);
        ex.repathT = 0;
      }
    }
  }

  // galleys: approach / swarm / fight
  for (const s of state.ships) {
    if (s.side !== 'osmanli' || !shipActive(s)) continue;
    const ex = extraOf(state, s);
    const t = shipById(state, ex.targetId);
    if (!t || t.status === 'batik' || extraOf(state, t).passed) {
      ex.targetId = undefined;
      ex.engaged = false;
      continue;
    }
    const inner = ((SHIP_RADIUS[t.type] ?? 1) + (SHIP_RADIUS[s.type] ?? 1)) * 0.98;
    const second = (ex.rank ?? 0) >= INNER_LINE;
    const ring = second ? inner + 2.1 : inner;
    // keep the hull off the beach: swing the slot around the target until it lies in open water
    let want = { tx: t.tx + Math.cos(ex.slot ?? 0) * ring, ty: t.ty + Math.sin(ex.slot ?? 0) * ring };
    if (shoreDist(ctx.world, want.tx, want.ty) < 2) {
      for (const da of [0.5, -0.5, 1, -1, 1.6, -1.6, 2.3, -2.3, Math.PI]) {
        const a = (ex.slot ?? 0) + da;
        const q = { tx: t.tx + Math.cos(a) * ring, ty: t.ty + Math.sin(a) * ring };
        if (shoreDist(ctx.world, q.tx, q.ty) >= 2 && passable(ctx.world, q.tx, q.ty, navOptsFor(state, s))) {
          ex.slot = a;
          want = q;
          break;
        }
      }
    }
    const d = Math.hypot(t.tx - s.tx, t.ty - s.ty);
    const o = navOptsFor(state, s);
    ex.repathT -= dt;
    if (d > ring + 1.4) {
      ex.engaged = false;
      if (ex.repathT <= 0 || !s.path.length) {
        ex.repathT = 3;
        if (segmentClear(ctx.world, pos(s), want, o)) s.path = [want];
        else s.path = navPath(ctx.world, pos(s), want, o) ?? [];
      }
    } else if (d > ring * 1.6 || !ex.engaged) {
      s.path = passable(ctx.world, want.tx, want.ty, o) ? [want] : [];
      ex.engaged = d < ring + ENGAGE_R * 0.4;
    } else {
      // alongside: hold the slot loosely (don't fight the separation every tick)
      s.path = Math.hypot(want.tx - s.tx, want.ty - s.ty) > 0.6 && passable(ctx.world, want.tx, want.ty, o) ? [want] : [];
      ex.engaged = d < ring + ENGAGE_R * 0.4;
    }
    if (!ex.engaged) continue;
    // lie alongside: broadside to broadside, bow toward the target's bow side
    const tang = (ex.slot ?? 0) + Math.PI / 2;
    const cur = Math.abs(angDiff(s.heading, tang)) < Math.abs(angDiff(s.heading, tang + Math.PI)) ? tang : tang + Math.PI;
    s.heading += clamp(angDiff(s.heading, cur), -1.2 * dt, 1.2 * dt);
    // ── combat: galley vs target ──
    const def = SHIP_TYPES[s.type];
    const tdef = SHIP_TYPES[t.type];
    const cmd = n.commander === 'hamza' ? 1.1 : 1;
    const tallMul = tdef?.tall ? 0.34 : 1;
    const line = second ? 0.4 : 1; // the second line only shoots arrows over the first
    damage(state, ctx, t, (def?.power ?? 0.5) * 1.6 * tallMul * cmd * line * dt, false);
    ex.cd -= dt;
    if (ex.cd <= 0) {
      ex.cd = ctx.rng.range(2.2, 3.8);
      ctx.bus.emit('ship:fire', { shipId: s.id, from: pos(s), to: pos(t) });
      if (ctx.rng.chance(0.4)) ctx.bus.emit('ship:hit', { shipId: t.id, at: pos(t) });
      if (ctx.rng.chance(tdef?.tall ? 0.012 : 0.1)) ignite(state, ctx, t, tdef?.tall ? 5 : 12);
    }
    ex.boardCd = (ex.boardCd ?? 8) - dt;
    if (ex.boardCd <= 0 && !second && (t.status as string) !== 'batik') {
      ex.boardCd = ctx.rng.range(7, 13);
      const hpR = t.hp / Math.max(1, t.hpMax);
      const p = 0.12 * (def?.power ?? 0.5) * (tdef?.tall ? 0.35 : 1) * (hpR < 0.4 ? 2.5 : 1) * cmd;
      const ok = ctx.rng.chance(p);
      ctx.bus.emit('ship:board', { shipId: s.id, targetId: t.id, at: pos(t), success: ok });
      if (ok) damage(state, ctx, t, 12 * (def?.power ?? 0.5), true);
      else damage(state, ctx, s, 2.5, true);
    }
  }

  // tall ships rain stones, arrows and fire pots down on the galleys
  for (const r of relief) {
    if (extraOf(state, r).passed) continue;
    const ex = extraOf(state, r);
    const def = SHIP_TYPES[r.type];
    const foes = state.ships.filter((g) => g.status !== 'batik' && g.side === 'osmanli' && extraOf(state, g).targetId === r.id && extraOf(state, g).engaged);
    if (!foes.length) continue;
    ex.cd -= dt;
    // continuous damage spread over the swarm
    const per = ((def?.power ?? 1) * 0.32 * dt) / foes.length;
    for (const g of foes) damage(state, ctx, g, per * (SHIP_TYPES[g.type]?.tall ? 0.5 : 1), false);
    if (ex.cd <= 0) {
      ex.cd = ctx.rng.range(0.9, 1.6);
      const g = foes[Math.floor(ctx.rng.next() * foes.length)];
      ctx.bus.emit('ship:fire', { shipId: r.id, from: pos(r), to: pos(g) });
      if (ctx.rng.chance(0.45)) damage(state, ctx, g, 2, true);
      if (ctx.rng.chance(0.05)) ignite(state, ctx, g, 10);
    }
  }

  // count losses
  b.sunkRelief = b.reliefIds.filter((id) => {
    const s = shipById(state, id);
    return !s || s.status === 'batik';
  }).length;

  // end conditions
  const remainingOutside = relief.filter((s) => !extraOf(state, s).passed).length;
  const night = state.time.day >= TARIH.denizSavasi + 0.86;
  if (remainingOutside === 0 || night || b.t > 900) {
    if (remainingOutside > 0) {
      // darkness: the survivors slip in behind the chain
      for (const s of relief) {
        const ex = extraOf(state, s);
        if (ex.passed) continue;
        ex.passed = true;
        ex.role = 'liman';
        b.reached++;
        n.chainOpen = 30;
        s.path = navPath(ctx.world, pos(s), chainGate(false, 3), { chain: false }) ?? [];
      }
      ctx.bus.emit('navy:chain', { open: true });
    }
    endBattle(state, ctx, n, b.reached > 0 ? 'yarildi' : 'durduruldu');
  }
}

export function endBattle(state: GameState, ctx: SimContext | null, n: NavyState, result: 'yarildi' | 'durduruldu'): void {
  const b = n.battle;
  b.stage = 'bitti';
  b.sultan = null;
  state.flags[FLAG.denizSavasi] = result;
  state.flags[FLAG.denizSavasiSuruyor] = false;
  const card = eventCardHandles('k5-deniz-savasi');
  if (!card) {
    const fx = BATTLE_EFFECTS[result];
    state.morale = clamp(state.morale + fx.morale, 0, 100);
    state.divan = clamp(state.divan + fx.divan, -100, 100);
    state.byz.morale = clamp(state.byz.morale + fx.byzMorale, 0, 100);
    state.byz.food += fx.byzFood;
  }
  // galleys go home
  for (const s of state.ships) {
    if (s.side !== 'osmanli' || !shipActive(s)) continue;
    const ex = extraOf(state, s);
    if (ex.targetId == null && ex.role !== 'filo' && ex.role !== 'devriye') continue;
    ex.targetId = undefined;
    ex.engaged = false;
    if (ctx && ex.anchor && (ex.manualT ?? 0) <= 0) sendShip(state, ctx.world, s, ex.anchor);
  }
  ctx?.bus.emit('naval:battle', { started: false });
  if (result === 'yarildi') {
    log(state, ctx, 'kayip', '20 Nisan: Yardım gemileri kadırgaların çemberini yararak zincirin ardına, Haliç\'e girdi. Şehirde çanlar çalıyor.', 'tehlike');
    log(state, ctx, 'olay', 'Sultan Mehmed atını denize sürüp donanmaya bizzat emirler yağdırdı; fakat yüksek bordalı gemilere çıkılamadı.');
    if (n.commander === 'baltaoglu') {
      n.commander = 'hamza';
      state.flags[FLAG.donanmaKomutani] = 'hamza';
      for (const e of Object.values(n.extra)) if (e.flagship) e.name = `${NAVY_COMMANDERS.hamza.name} — sancak kadırgası`;
      if (!card) log(state, ctx, 'uyari', 'Baltaoğlu Süleyman Bey azledildi; donanmanın başına Hamza Bey getirildi.', 'uyari');
    }
  } else {
    log(state, ctx, 'basari', '20 Nisan: Yardım gemileri Haliç\'e ulaşamadı! Donanma ablukayı korudu; ordugâhta tekbir sesleri yükseliyor.', 'basari');
  }
}

// ───────────────────────────── K7: overland ─────────────────────────────

function routeStartWater(world: WorldApi): TilePt {
  return nearestWater(world, ROUTE_T[0], { chain: true }, 10, 1) ?? ROUTE_T[0];
}

function routeEndWater(world: WorldApi): TilePt {
  return nearestWater(world, ROUTE_T[ROUTE_T.length - 1], { chain: true }, 10) ?? ROUTE_T[ROUTE_T.length - 1];
}

/** Gathering slots near the start of the slipway. */
export function gatherSlots(world: WorldApi, count: number): TilePt[] {
  return anchorSlots(world, routeStartWater(world), count, 1.8, { chain: true }, (p) => !insideHorn(p.tx, p.ty), 1);
}

export function startOverland(state: GameState, world: WorldApi, ctx: SimContext | null, pay = true): boolean {
  const n = navyState(state);
  const o = n.overland;
  const cands = haulCandidates(state);
  if (pay && !spend(state, OVERLAND.cost)) return false;
  o.stage = 'kizak';
  o.slipway = 0;
  o.hauled = 0;
  o.queue = cands.map((s) => s.id);
  o.total = o.queue.length;
  o.workers = OVERLAND.workers;
  o.launchCd = 0;
  state.workforce.assigned += o.workers;
  const slots = gatherSlots(world, o.total);
  cands.forEach((s, i) => {
    const ex = extraOf(state, s);
    ex.role = 'karadan';
    ex.targetId = undefined;
    ex.anchor = slots[i] ? { ...slots[i] } : routeStartWater(world);
  });
  if (ctx) sendGroup(state, world, cands, cands.map((s) => extraOf(state, s).anchor!));
  state.flags[FLAG.karadanIlerleme] = 0;
  log(state, ctx, 'olay', 'Zağanos Paşa\'nın gözetiminde Galata sırtlarında kızak yolu açılıyor: yağlanmış kütükler, kalaslar, öküz koşumları ve yüzlerce işçi.', 'bilgi');
  return true;
}

function overlandTick(state: GameState, ctx: SimContext, n: NavyState): void {
  const o = n.overland;
  if (o.stage === 'yok' || o.stage === 'tamam') return;
  const dt = ctx.dtSec;
  if (o.stage === 'kizak') {
    o.slipway = Math.min(1, o.slipway + ctx.dtDays / OVERLAND.slipwayDays);
    if (o.slipway >= 1) {
      o.stage = 'cekiliyor';
      log(state, ctx, 'bilgi', 'Kızak yolu hazır. Gemiler geceyi bekliyor: karanlık çökünce sırttan aşırılacaklar.', 'bilgi');
    }
  } else {
    const night = segmentOf(state.time.day) === 'gece';
    o.launchCd -= dt;
    const start = routeStartWater(ctx.world);
    if (night && o.launchCd <= 0 && o.queue.length) {
      // drop sunk/missing ships from the queue
      o.queue = o.queue.filter((id) => {
        const s = shipById(state, id);
        return !!s && s.status !== 'batik';
      });
      const hauling = countHauling(state);
      if (o.total > o.hauled + o.queue.length + hauling) o.total = o.hauled + o.queue.length + hauling;
      // the queued ship nearest the slipway goes next
      let bi = -1;
      let bd = Infinity;
      o.queue.forEach((id, i) => {
        const s = shipById(state, id)!;
        const d = Math.hypot(s.tx - start.tx, s.ty - start.ty);
        if (d < bd) {
          bd = d;
          bi = i;
        }
      });
      if (bi >= 0 && bd < 4.5) {
        const id = o.queue.splice(bi, 1)[0];
        const s = shipById(state, id)!;
        const ex = extraOf(state, s);
        s.status = 'karada';
        s.path = [];
        ex.haulT = 0;
        const r = routeAt(0);
        s.tx = r.tx;
        s.ty = r.ty;
        s.heading = r.dir;
        o.launchCd = OVERLAND.launchGap;
        ctx.bus.emit('overland:launch', { shipId: s.id });
        if (o.hauled === 0 && hauling === 0) {
          ctx.bus.emit('mehter:play', { playing: true });
          log(state, ctx, 'olay', 'Gece karanlığında ilk gemi kızağa çekildi. Yelkenler açık, davullar çalıyor; öküzler ve yüzlerce adam halatlara asılıyor.', 'bilgi');
        }
      } else if (bi >= 0) {
        const s = shipById(state, o.queue[bi]);
        if (s && !s.path.length) sendShip(state, ctx.world, s, start);
      }
    }
    // advance ships on the slipway
    for (const s of state.ships) {
      if (s.status !== 'karada') continue;
      const ex = extraOf(state, s);
      ex.haulT = (ex.haulT ?? 0) + (OVERLAND.haulSpeed * dt) / ROUTE_LENGTH;
      if (ex.haulT >= 1) {
        const end = routeEndWater(ctx.world);
        s.tx = end.tx;
        s.ty = end.ty;
        s.status = 'seyir';
        ex.haulT = undefined;
        ex.role = 'halic';
        const slots = kasimpasaSlots(ctx.world, Math.max(o.total, 1) + 4);
        const slot = slots[o.hauled % Math.max(1, slots.length)] ?? end;
        ex.anchor = { ...slot };
        s.path = navPath(ctx.world, pos(s), slot, navOptsFor(state, s)) ?? [];
        o.hauled++;
        ctx.bus.emit('overland:launched', { shipId: s.id, at: pos(s) });
      } else {
        const r = routeAt(ex.haulT);
        s.tx = r.tx;
        s.ty = r.ty;
        s.heading = r.dir;
      }
    }
    if (o.hauled >= o.total && countHauling(state) === 0 && o.total > 0) finishOverland(state, ctx, n);
  }
  const prog = (o.stage as string) === 'tamam' ? 1 : o.slipway * 0.3 + (o.total ? (o.hauled / o.total) * 0.7 : 0);
  state.flags[FLAG.karadanIlerleme] = Math.round(prog * 1000) / 1000;
  if (Math.abs(prog - o.lastEmit) >= 0.01 || (prog >= 1 && o.lastEmit < 1)) {
    o.lastEmit = prog;
    ctx.bus.emit('overland:progress', { progress: prog });
  }
}

function countHauling(state: GameState): number {
  return state.ships.filter((s) => s.status === 'karada').length;
}

export function finishOverland(state: GameState, ctx: SimContext | null, n: NavyState): void {
  const o = n.overland;
  o.stage = 'tamam';
  o.doneDay = state.time.day;
  state.workforce.assigned = Math.max(0, state.workforce.assigned - o.workers);
  o.workers = 0;
  state.flags[FLAG.gemilerKaradan] = true;
  state.flags[FLAG.karadanIlerleme] = 1;
  if (!eventCardHandles('k7-gemiler-karadan')) {
    state.morale = clamp(state.morale + 8, 0, 100);
    state.byz.morale = clamp(state.byz.morale - 10, 0, 100);
    state.divan = clamp(state.divan + 6, -100, 100);
  }
  ctx?.bus.emit('overland:done', {});
  ctx?.bus.emit('mehter:play', { playing: false });
  log(
    state,
    ctx,
    'basari',
    `${OVERLAND.historicalShips} gemi bir gecede Galata sırtlarından karadan aşırılıp Kasımpaşa\'dan Haliç\'e indirildi! Zincirin ardındaki liman artık güvende değil.`,
    'basari',
  );
  log(state, ctx, 'casus', 'Surlardan gelen haber: Rumlar şaşkın; Haliç surlarına asker kaydırmak zorunda kalacaklar.');
}

// ───────────────────────────── K9: bridge ─────────────────────────────

export function startBridge(state: GameState, ctx: SimContext | null, pay = true): boolean {
  const n = navyState(state);
  if (pay && !spend(state, BRIDGE.cost)) return false;
  n.bridge.stage = 'insa';
  n.bridge.progress = 0;
  n.bridge.workers = BRIDGE.workers;
  state.workforce.assigned += BRIDGE.workers;
  log(state, ctx, 'olay', 'Zağanos Paşa\'nın askerleri Haliç\'in üst kısmında birbirine bağlanmış fıçılardan ve kalaslardan bir köprü kurmaya başladı.', 'bilgi');
  return true;
}

function bridgeTick(state: GameState, ctx: SimContext, n: NavyState): void {
  const br = n.bridge;
  if (br.stage !== 'insa') return;
  br.progress = Math.min(1, br.progress + ctx.dtDays / BRIDGE.buildDays);
  if (br.progress >= 1) {
    br.stage = 'tamam';
    state.workforce.assigned = Math.max(0, state.workforce.assigned - br.workers);
    br.workers = 0;
    state.flags[FLAG.halicKoprusu] = true;
    state.morale = clamp(state.morale + 3, 0, 100);
    log(state, ctx, 'basari', 'Haliç köprüsü tamamlandı: fıçılar üzerinde yan yana beş asker geçebiliyor; ortasındaki yüzer platforma toplar yerleştirildi. Haliç\'te ikinci bir cephe açıldı.', 'basari');
  }
}

// ───────────────────────────── K8: fire raid ─────────────────────────────

function raidTick(state: GameState, ctx: SimContext, n: NavyState): void {
  const r = n.raid;
  const dt = ctx.dtSec;
  if (r.stage === 'bitti') return;
  if (r.stage === 'yok') {
    const ready =
      state.time.phase === 'kusatma' &&
      !!state.flags[FLAG.gemilerKaradan] &&
      state.time.day >= TARIH.yakmaBaskini - 0.1 &&
      (n.overland.doneDay == null || state.time.day >= n.overland.doneDay + 1.2) &&
      segmentOf(state.time.day) === 'gece';
    if (ready) startRaid(state, ctx, n);
    return;
  }
  r.t += dt;
  const lead = shipById(state, r.leadId);
  const raiders = state.ships.filter((s) => s.status !== 'batik' && extraOf(state, s).role === 'baskin');
  const targets = state.ships.filter((s) => s.side === 'osmanli' && shipActive(s) && insideHorn(s.tx, s.ty));
  const goal = targets.length
    ? { tx: targets.reduce((a, s) => a + s.tx, 0) / targets.length, ty: targets.reduce((a, s) => a + s.ty, 0) / targets.length }
    : landmarkTile('kasimpasa');
  if (r.stage === 'yolda') {
    if (lead && lead.status !== 'batik') {
      const d = Math.hypot(lead.tx - goal.tx, lead.ty - goal.ty);
      if (r.warned && !r.batteryFired && d < 9) {
        r.batteryFired = true;
        // the guns stood on our (Galata–Kasımpaşa) shore, never inside the city walls
        const battery =
          nearestLand(ctx.world, goal, 12, (x, y) => ctx.world.regionAt(x, y) !== 'sur-ici' && y <= goal.ty + 1) ?? nearestLand(ctx.world, goal, 12) ?? goal;
        ctx.bus.emit('navy:battery', { from: battery, to: pos(lead), hit: true });
        sinkShip(state, ctx, lead);
        log(state, ctx, 'basari', 'Galata\'dan gelen haber sayesinde baskın önceden biliniyordu. Kıyıdaki toplar Giacomo Coco\'nun gemisini tek atışta batırdı; diğer gemiler geri çekildi.', 'basari');
        if (!eventCardHandles('k8-yakma-baskini')) {
          state.morale = clamp(state.morale + 5, 0, 100);
          state.byz.morale = clamp(state.byz.morale - 6, 0, 100);
        }
        state.flags[FLAG.yakmaBaskini] = 'onlendi';
        retreatRaid(state, ctx, n);
        return;
      }
      if (!r.warned && d < 3) {
        // fire pots and burning brands among the anchored ships
        const near = targets.sort((a, b) => Math.hypot(a.tx - lead.tx, a.ty - lead.ty) - Math.hypot(b.tx - lead.tx, b.ty - lead.ty)).slice(0, 3);
        for (const t of near) {
          ctx.bus.emit('ship:fire', { shipId: lead.id, from: pos(lead), to: pos(t) });
          ignite(state, ctx, t, 45);
          r.burned++;
        }
        log(state, ctx, 'kayip', 'Venedik yangın gemileri Haliç\'teki gemilerimize ulaştı! Ateş çömlekleri atıldı, birkaç gemimiz alev alev yanıyor.', 'tehlike');
        if (!eventCardHandles('k8-yakma-baskini')) {
          state.morale = clamp(state.morale - 5, 0, 100);
          state.byz.morale = clamp(state.byz.morale + 5, 0, 100);
        }
        state.flags[FLAG.yakmaBaskini] = 'basarili';
        retreatRaid(state, ctx, n);
        return;
      }
      if (!lead.path.length) sendShip(state, ctx.world, lead, goal);
    } else {
      retreatRaid(state, ctx, n);
      return;
    }
    for (const s of raiders) if (s !== lead && !s.path.length) sendShip(state, ctx.world, s, { tx: goal.tx + 3, ty: goal.ty + 4 });
    if (r.t > 160) retreatRaid(state, ctx, n);
  } else if (r.stage === 'donus') {
    if (r.t > 220 || raiders.every((s) => !s.path.length)) {
      for (const s of raiders) extraOf(state, s).role = 'liman';
      r.stage = 'bitti';
    }
  }
}

function startRaid(state: GameState, ctx: SimContext, n: NavyState): void {
  const r = n.raid;
  r.stage = 'yolda';
  r.t = 0;
  r.warned = state.galata >= 10;
  const slots = hornSlots(ctx.world, 18).slice(-4);
  const types: { type: ShipType; side: Side; name: string }[] = [
    { type: 'venedik-kadirgasi', side: 'venedik', name: 'Giacomo Coco\'nun gemisi' },
    { type: 'venedik-kadirgasi', side: 'venedik', name: 'Gabriele Trevisan\'ın kadırgası' },
    { type: 'ceneviz-gemisi', side: 'venedik', name: 'Yün balyalarıyla korunan büyük gemi' },
    { type: 'venedik-kadirgasi', side: 'venedik', name: 'Zaccaria Grioni\'nin kadırgası' },
  ];
  const base = chainGate(false, 3.5);
  types.forEach((t, i) => {
    const p = slots[i] ?? base;
    const s = spawnTypedShip(state, t.type, t.side, p.tx, p.ty, Math.PI);
    const ex = extraOf(state, s);
    ex.role = 'baskin';
    ex.name = t.name;
    ex.anchor = { ...p };
    if (i === 0) {
      ex.flagship = true;
      r.leadId = s.id;
    }
  });
  if (r.warned) {
    log(state, ctx, 'casus', 'Galata\'daki dostlarımızdan haber: Venedikliler bu gece Haliç\'teki gemilerimizi yakmaya gelecek. Kıyıya toplar kuruldu, nöbetçiler uyanık.', 'uyari');
  } else {
    log(state, ctx, 'uyari', 'Gecenin karanlığında Haliç\'te kürek sesleri…', 'uyari');
  }
}

function retreatRaid(state: GameState, ctx: SimContext, n: NavyState): void {
  const r = n.raid;
  r.stage = 'donus';
  r.t = Math.max(r.t, 0);
  for (const s of state.ships) {
    const ex = extraOf(state, s);
    if (ex.role !== 'baskin' || s.status === 'batik') continue;
    sendShip(state, ctx.world, s, ex.anchor ?? chainGate(false, 4));
  }
}

// ───────────────────────────── the final relief fleet ─────────────────────────────

export function spawnReliefFleet(state: GameState, world: WorldApi, ctx: SimContext | null, progress = 0): Ship[] {
  const n = navyState(state);
  n.reliefFleet = true;
  state.flags[FLAG.hacliFilosu] = true;
  const comp: { type: ShipType; side: Side }[] = [];
  for (let i = 0; i < 9; i++) comp.push({ type: 'venedik-kadirgasi', side: 'venedik' });
  for (let i = 0; i < 4; i++) comp.push({ type: 'ceneviz-gemisi', side: i % 2 ? 'ceneviz' : 'venedik' });
  const start = nearestWater(world, { tx: 150, ty: MAP_H - 4 }, { chain: true }, 24) ?? { tx: 150, ty: MAP_H - 6 };
  const goal = nearestWater(world, { tx: 143, ty: 150 }, { chain: true }, 12, 2) ?? start;
  const ships: Ship[] = [];
  comp.forEach((c, i) => {
    // wedge formation
    const row = Math.floor((Math.sqrt(8 * i + 1) - 1) / 2);
    const col = i - (row * (row + 1)) / 2 - row / 2;
    const fx = goal.tx + (start.tx - goal.tx) * progress;
    const fy = goal.ty + (start.ty - goal.ty) * progress;
    const p = { tx: fx + col * 2.9 + row * 0.6, ty: fy + row * 2.3 - col * 0.5 };
    const q = passable(world, p.tx, p.ty, { chain: true }) ? p : nearestWater(world, p, { chain: true }, 6) ?? start;
    const s = spawnTypedShip(state, c.type, c.side, q.tx, q.ty, -Math.PI / 2);
    const ex = extraOf(state, s);
    ex.role = 'hacli';
    ex.anchor = { tx: goal.tx + col * 2.9 + row * 0.6, ty: goal.ty + row * 2.3 - col * 0.5 - 6 };
    ships.push(s);
  });
  sendGroup(state, world, ships, ships.map((s) => extraOf(state, s).anchor!));
  log(state, ctx, 'olay', 'Marmara\'da ufuk yelkenle doldu: Venedik ve Papalık donanması İstanbul\'a yetişti!', 'tehlike');
  return ships;
}

function reliefFleetTick(state: GameState, ctx: SimContext, n: NavyState): void {
  if (n.reliefFleet || state.time.phase !== 'kusatma') return;
  if (state.relief.arrived || state.time.day >= state.relief.arrival - 0.35) spawnReliefFleet(state, ctx.world, ctx, 1);
}

// ───────────────────────────── commands ─────────────────────────────

export function navyHandleCommand(state: GameState, cmd: Command, ctx: SimContext): boolean {
  if (cmd.t === 'filo-emir') {
    fleetOrder(state, ctx, cmd.shipIds, cmd.target);
    return true;
  }
  if (cmd.t === 'gemileri-karadan') {
    const c = overlandCheck(state);
    if (!c.ok) {
      const miss = c.reqs.find((r) => !r.ok);
      const text =
        c.stage !== 'yok' ? 'Gemiler zaten karadan yürütülüyor.' : miss ? `Gemiler karadan yürütülemez: ${miss.label}.` : 'Gemiler karadan yürütülemez.';
      ctx.bus.emit('notify', { text, kind: 'uyari' });
      return true;
    }
    startOverland(state, ctx.world, ctx, true);
    return true;
  }
  if (cmd.t === 'ozel' && cmd.feature === 'navy') {
    if (cmd.action === 'kopru') {
      const c = bridgeCheck(state);
      if (!c.ok) {
        const miss = c.reqs.find((r) => !r.ok);
        ctx.bus.emit('notify', {
          text: c.stage !== 'yok' ? 'Köprü zaten kuruluyor.' : `Köprü kurulamaz: ${miss?.label ?? 'şartlar sağlanmadı'}.`,
          kind: 'uyari',
        });
        return true;
      }
      startBridge(state, ctx, true);
      return true;
    }
    if (cmd.action === 'demirle') {
      // send selected ships (payload: number[]) back to their anchorage
      const ids = Array.isArray(cmd.payload) ? (cmd.payload as number[]) : [];
      for (const id of ids) {
        const s = shipById(state, id);
        if (!s || s.side !== 'osmanli' || !shipActive(s)) continue;
        const ex = extraOf(state, s);
        if (ex.anchor) sendShip(state, ctx.world, s, ex.anchor);
      }
      return true;
    }
    return false;
  }
  return false;
}

export function fleetOrder(state: GameState, ctx: SimContext, shipIds: number[], target: TilePt): number {
  const ships = shipIds
    .map((id) => shipById(state, id))
    .filter((s): s is Ship => !!s && s.side === 'osmanli' && shipActive(s) && extraOf(state, s).role !== 'karadan');
  if (!ships.length) return 0;
  const o = navOptsFor(state, ships[0]);
  const slots = formationSlots(ctx.world, target, ships.length, 2.1, o);
  const ok = sendGroup(state, ctx.world, ships, slots);
  for (const s of ships) {
    const ex = extraOf(state, s);
    ex.manualT = 45;
    ex.targetId = undefined;
    ex.engaged = false;
    if (ex.role === 'devriye') ex.role = 'filo';
  }
  if (ok === 0) {
    const blocked = !!state.flags[FLAG.zincirGerili] && insideHorn(target.tx, target.ty) !== insideHorn(ships[0].tx, ships[0].ty);
    ctx.bus.emit('notify', {
      text: blocked ? 'Zincir Haliç\'in ağzını kapatıyor; gemiler geçemez.' : 'Gemiler oraya ulaşamaz.',
      kind: 'uyari',
    });
  }
  return ok;
}

export type { Rng };
