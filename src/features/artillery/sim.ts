import type { Command } from '../../core/commands';
import { d, dayFrac, segmentOf } from '../../core/calendar';
import type { ScenarioName, SimContext } from '../../core/feature';
import { FLAG } from '../../core/flags';
import type { TilePt } from '../../core/iso';
import { hash2 } from '../../core/rng';
import { addLog, type Cannon, type CannonType, type GameState, type SectionId } from '../../core/state';
import type { WorldApi } from '../../core/world';
import { SECTIONS } from '../../data/sections';
import { canAfford, spend } from '../economy/api';
import { applyDefenderLosses } from '../byzantium/api';
import { damageSection, sectionPoint } from '../fortifications/api';
import {
  canCast,
  canHireOrban,
  emplacementFor,
  havanTarget,
  inRange,
  isAtEdirne,
  reloadRate,
  sectionDistance,
  sectionOutward,
  spawnCannon,
  transportDays,
} from './api';
import {
  CANNON_EXTRA,
  CANNON_TYPES,
  EDIRNE_TILE,
  HAVAN_TILE,
  HISTORIC_BATTERIES,
  ORBAN_COST,
  PARK_TILE,
  REPAIR_COST,
  REPAIR_DAYS,
  roadPath,
  TARGET_WEIGHT,
} from './data';
import { arty, type ArtilleryState } from './state';

/**
 * ARTILLERY SIMULATION (pure, deterministic — ctx.rng only, no Phaser).
 * Foundry → Edirne → road transport → park → battery site → bombardment.
 */

/** Guns cast before this day wait in Edirne; on this day they set off (Şahi left in February 1453). */
export const SEFER_HAZIRLIGI_DAY = d(1, 2, 1453);

type Bus = SimContext['bus'];

function notify(bus: Bus, text: string, kind: 'bilgi' | 'uyari' | 'basari' | 'tehlike' = 'bilgi'): void {
  bus.emit('notify', { text, kind });
}

// ───────────────────────────── initial state ─────────────────────────────

export function initArtillery(state: GameState): void {
  const p = arty(state);
  // The Ottoman army already had a park of smaller guns before Orban.
  for (const type of ['orta', 'orta', 'orta', 'kucuk', 'kucuk', 'kucuk', 'kucuk'] as CannonType[]) {
    const c = spawnCannon(state, type, EDIRNE_TILE.tx, EDIRNE_TILE.ty, 'hazir');
    p.atEdirne.push(c.id);
  }
}

// ───────────────────────────── transport ─────────────────────────────

function parkSlotTile(i: number, world?: WorldApi): TilePt {
  const col = i % 4;
  const row = Math.floor(i / 4);
  let t = { tx: PARK_TILE.tx + col * 1.9 - row * 0.7, ty: PARK_TILE.ty + row * 1.9 + col * 0.6 };
  if (world && !isFinite(world.moveCost(Math.floor(t.tx), Math.floor(t.ty), 'land'))) {
    const q = world.nearestPassable(t, 'land', 5);
    if (q) t = { tx: q.tx + 0.5, ty: q.ty + 0.5 };
  }
  return t;
}

function freeParkSlot(p: ArtilleryState): number {
  const used = new Set(Object.values(p.park));
  let i = 0;
  while (used.has(i)) i++;
  return i;
}

/** Put a gun on the road from Edirne toward the camp. */
export function startTransport(state: GameState, c: Cannon, world?: WorldApi): void {
  const p = arty(state);
  p.atEdirne = p.atEdirne.filter((id) => id !== c.id);
  const slot = freeParkSlot(p);
  p.park[c.id] = slot;
  c.path = [...roadPath(), parkSlotTile(slot, world)];
  c.status = 'yolda';
  c.progress = 0;
  c.tx = EDIRNE_TILE.tx;
  c.ty = EDIRNE_TILE.ty;
}

/** Fraction of the transport spent off-map (Edirne → map edge). */
export function offMapFraction(state: GameState, c: Cannon): number {
  const total = transportDays(state, c.type);
  return Math.max(0, 1 - CANNON_EXTRA[c.type].onMapDays / total);
}

/** Position along a polyline at fraction f (by length). */
export function alongPath(path: TilePt[], f: number): { pt: TilePt; seg: number } {
  if (path.length === 0) return { pt: { tx: 0, ty: 0 }, seg: 0 };
  if (path.length === 1) return { pt: { ...path[0] }, seg: 0 };
  let total = 0;
  for (let i = 0; i + 1 < path.length; i++) total += Math.hypot(path[i + 1].tx - path[i].tx, path[i + 1].ty - path[i].ty);
  let dd = Math.max(0, Math.min(1, f)) * total;
  for (let i = 0; i + 1 < path.length; i++) {
    const l = Math.hypot(path[i + 1].tx - path[i].tx, path[i + 1].ty - path[i].ty);
    if (dd <= l || i === path.length - 2) {
      const k = l ? Math.min(1, dd / l) : 0;
      return { pt: { tx: path[i].tx + (path[i + 1].tx - path[i].tx) * k, ty: path[i].ty + (path[i + 1].ty - path[i].ty) * k }, seg: i };
    }
    dd -= l;
  }
  return { pt: { ...path[path.length - 1] }, seg: path.length - 2 };
}

function updateTransportPos(state: GameState, c: Cannon): void {
  const off = offMapFraction(state, c);
  if (c.progress < off || c.path.length < 2) {
    c.tx = EDIRNE_TILE.tx;
    c.ty = EDIRNE_TILE.ty;
    return;
  }
  const f = off >= 1 ? 1 : (c.progress - off) / (1 - off);
  const { pt } = alongPath(c.path, f);
  c.tx = pt.tx;
  c.ty = pt.ty;
}

function arrive(state: GameState, c: Cannon, ctx: SimContext): void {
  const end = c.path[c.path.length - 1];
  c.tx = end.tx;
  c.ty = end.ty;
  c.path = [];
  c.progress = 1;
  c.status = 'hazir';
  ctx.bus.emit('cannon:arrived', { cannonId: c.id, type: c.type });
  if (c.type === 'sahi') {
    addLog(state, 'basari', 'Şahi, öküz koşumlarıyla ordugâha ulaştı.');
    notify(ctx.bus, 'Şahi ordugâha ulaştı!', 'basari');
  } else addLog(state, 'bilgi', `${c.name} ordugâha ulaştı.`);
  if (state.time.phase === 'kusatma') deploy(state, c, c.targetSection, ctx.world);
}

// ───────────────────────────── emplacement ─────────────────────────────

/** Default land-wall target for a newly deployed gun. */
export function autoSection(state: GameState, type: CannonType): SectionId {
  if (type === 'sahi') return 'kara-topkapi';
  let best: SectionId = 'kara-topkapi';
  let bestScore = Infinity;
  for (const [id, w] of Object.entries(TARGET_WEIGHT)) {
    if (!state.sections[id]) continue;
    const n = state.cannons.filter((c) => c.targetSection === id).length;
    const score = (n + 0.5) / w;
    if (score < bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return best;
}

const AIM_CANDIDATES = [0.5, 0.26, 0.74, 0.38, 0.62, 0.14, 0.86, 0.2, 0.8, 0.32, 0.68, 0.44, 0.56];

/** Aim point along a section that keeps batteries spread out. */
export function pickAimT(state: GameState, sectionId: SectionId, exclude: number): number {
  const p = arty(state);
  const taken = state.cannons.filter((c) => c.id !== exclude && c.targetSection === sectionId && p.aim[c.id] != null).map((c) => p.aim[c.id]);
  if (taken.length === 0) return 0.5;
  let best = 0.5;
  let bestGap = -1;
  for (const t of AIM_CANDIDATES) {
    const gap = Math.min(...taken.map((x) => Math.abs(x - t)));
    if (gap > bestGap + 1e-6) {
      bestGap = gap;
      best = t;
    }
  }
  return best;
}

function sectionKind(id: SectionId): string {
  return SECTIONS.find((s) => s.id === id)?.kind ?? 'kara';
}

const LAND_SECTIONS = SECTIONS.filter((s) => s.kind === 'kara').map((s) => s.id);

/** Haul route between two points outside the land walls (keeps clear of the moat and the city). */
export function routeOutside(from: TilePt, to: TilePt): TilePt[] {
  if (Math.hypot(to.tx - from.tx, to.ty - from.ty) < 10) return [];
  const ways: TilePt[] = [];
  for (const id of LAND_SECTIONS)
    for (const t of [0.25, 0.75]) {
      const p = sectionPoint(id, t);
      const n = sectionOutward(id, t);
      ways.push({ tx: p.tx + n.tx * 10, ty: p.ty + n.ty * 10 });
    }
  const nearest = (q: TilePt) => {
    let bi = 0;
    let bd = Infinity;
    ways.forEach((w, i) => {
      const dd = Math.hypot(w.tx - q.tx, w.ty - q.ty);
      if (dd < bd) (bd = dd), (bi = i);
    });
    return bi;
  };
  const a = nearest(from);
  const b = nearest(to);
  const out: TilePt[] = [];
  const step = a <= b ? 1 : -1;
  for (let i = a; ; i += step) {
    out.push(ways[i]);
    if (i === b) break;
  }
  return out;
}

/** Start emplacing a gun at a battery site. */
export function beginEmplace(state: GameState, c: Cannon, dest: TilePt): void {
  const p = arty(state);
  c.status = 'mevzileniyor';
  c.progress = 0;
  c.path = routeOutside({ tx: c.tx, ty: c.ty }, dest);
  const far = Math.hypot(dest.tx - c.tx, dest.ty - c.ty) > 0.3;
  p.emplace[c.id] = { tx: dest.tx, ty: dest.ty, phase: far ? 'tasima' : 'kazi' };
  delete p.park[c.id];
}

/** Send a gun to a battery facing `sectionId` (or an automatic choice). */
export function deploy(state: GameState, c: Cannon, sectionId: SectionId | null, world?: WorldApi): void {
  const p = arty(state);
  if (c.type === 'havan') {
    // the mortar goes to the hill behind Galata to fire on ships in the Horn
    if (sectionId) c.targetSection = sectionId;
    beginEmplace(state, c, { ...HAVAN_TILE });
    return;
  }
  const sec = sectionId && sectionKind(sectionId) === 'kara' ? sectionId : autoSection(state, c.type);
  c.targetSection = sec;
  const t = pickAimT(state, sec, c.id);
  p.aim[c.id] = t;
  beginEmplace(state, c, emplacementFor(sec, c.type, t, world));
}

function tickEmplace(state: GameState, c: Cannon, ctx: SimContext): void {
  const p = arty(state);
  const job = p.emplace[c.id];
  const ex = CANNON_EXTRA[c.type];
  if (!job) {
    c.status = 'hazir';
    return;
  }
  if (job.phase === 'tasima') {
    const wp = c.path[0];
    if (wp) {
      const wx = wp.tx - c.tx;
      const wy = wp.ty - c.ty;
      const wd = Math.hypot(wx, wy);
      const st = ex.moveSpeed * ctx.dtSec;
      if (wd <= st) {
        c.tx = wp.tx;
        c.ty = wp.ty;
        c.path.shift();
      } else {
        c.tx += (wx / wd) * st;
        c.ty += (wy / wd) * st;
      }
      return;
    }
    const dx = job.tx - c.tx;
    const dy = job.ty - c.ty;
    const dist = Math.hypot(dx, dy);
    const step = ex.moveSpeed * ctx.dtSec;
    if (dist <= step) {
      c.tx = job.tx;
      c.ty = job.ty;
      job.phase = 'kazi';
      c.progress = 0;
    } else {
      c.tx += (dx / dist) * step;
      c.ty += (dy / dist) * step;
    }
    return;
  }
  c.progress += (ctx.dtDays * 24) / ex.emplaceHours;
  if (c.progress >= 1) {
    c.progress = 1;
    c.status = 'hazir';
    c.cooldown = CANNON_TYPES[c.type].reloadSec * 0.5;
    delete p.emplace[c.id];
    if (c.type === 'sahi') {
      if (!state.flags[FLAG.sahiCephede]) {
        addLog(state, 'basari', 'Şahi, Topkapı karşısındaki mevzisine yerleştirildi. Ağır bombardıman başlayabilir.');
        notify(ctx.bus, 'Şahi mevzide — ağır bombardıman başlıyor!', 'basari');
      }
      state.flags[FLAG.sahiCephede] = true;
    }
  }
}

// ───────────────────────────── firing ─────────────────────────────

function cheapestShot(): { barut: number; gulle: number } {
  return { barut: CANNON_TYPES.kucuk.barutPerShot, gulle: CANNON_TYPES.kucuk.gullePerShot };
}

function isNightish(day: number): boolean {
  return segmentOf(day) === 'gece';
}

/** Fire one shot (ammo already checked). */
function fire(state: GameState, c: Cannon, ctx: SimContext, ship: number | null): void {
  const def = CANNON_TYPES[c.type];
  const ex = CANNON_EXTRA[c.type];
  const p = arty(state);
  const rng = ctx.rng;
  state.resources.barut = Math.max(0, state.resources.barut - def.barutPerShot);
  state.resources.gulle = Math.max(0, state.resources.gulle - def.gullePerShot);
  const night = isNightish(state.time.day);
  const from = { tx: c.tx, ty: c.ty };
  let to: TilePt;
  let hit = false;
  let dmg = 0;
  let sectionId: SectionId | null = null;
  let shipId: number | null = null;

  if (ship != null) {
    const s = state.ships.find((x) => x.id === ship)!;
    const dist = Math.hypot(s.tx - c.tx, s.ty - c.ty);
    const ph = ex.hitBase * (1 - 0.4 * (dist / def.range) ** 2) * (night ? 0.7 : 1);
    hit = rng.chance(ph);
    if (hit) {
      to = { tx: s.tx, ty: s.ty };
      dmg = ex.shipDamage * rng.range(0.8, 1.2);
      shipId = s.id;
    } else {
      const a = rng.range(0, Math.PI * 2);
      const r = rng.range(0.8, 2.2);
      to = { tx: s.tx + Math.cos(a) * r, ty: s.ty + Math.sin(a) * r };
    }
  } else {
    sectionId = c.targetSection!;
    const aimT = p.aim[c.id] ?? sectionDistance(sectionId, c.tx, c.ty).t;
    const t = Math.max(0.02, Math.min(0.98, aimT + rng.range(-0.07, 0.07)));
    const aim = sectionPoint(sectionId, t);
    const dist = Math.hypot(aim.tx - c.tx, aim.ty - c.ty);
    const ph = ex.hitBase * (1 - 0.45 * (dist / def.range) ** 2) * (night ? 0.8 : 1);
    hit = rng.chance(ph);
    if (hit) {
      to = aim;
      dmg = def.damage * rng.range(0.8, 1.2);
    } else {
      const ux = (aim.tx - c.tx) / (dist || 1);
      const uy = (aim.ty - c.ty) / (dist || 1);
      const lat = rng.range(-0.9, 0.9);
      if (rng.chance(0.62)) {
        // short: ploughs into the ground / moat in front of the wall
        const k = dist * rng.range(0.78, 0.95);
        to = { tx: c.tx + ux * k - uy * lat, ty: c.ty + uy * k + ux * lat };
      } else {
        // over: sails into the city
        const k = dist + rng.range(1.2, 3.2);
        to = { tx: c.tx + ux * k - uy * lat, ty: c.ty + uy * k + ux * lat };
      }
    }
  }

  const dist = Math.hypot(to.tx - from.tx, to.ty - from.ty);
  const total = ex.flightBase + dist * ex.flightPerTile;
  p.inFlight.push({ cannonId: c.id, type: c.type, from, to, t: total, total, sectionId, damage: dmg, hitWall: hit && shipId == null, shipId });
  ctx.bus.emit('cannon:fire', { cannonId: c.id, type: c.type, from, to, sectionId });
  state.stats.shotsFired++;
  c.shotsToday++;
  c.cooldown = def.reloadSec * rng.range(0.9, 1.15);

  const before = c.heat;
  c.heat = Math.min(1, c.heat + ex.heatPerShot);
  const crack = ex.crackBase + ex.crackHot * Math.max(0, before - 0.55) / 0.45;
  if (crack > 0 && rng.chance(crack)) {
    c.status = 'kirik';
    ctx.bus.emit('cannon:cracked', { cannonId: c.id });
    addLog(state, 'kayip', `${c.name} aşırı ısınıp çatladı!`);
    notify(ctx.bus, `${c.name} çatladı! Demir çemberle onarılması gerek.`, 'tehlike');
    tryRepair(state, c, ctx);
    return;
  }
  if (c.heat >= 0.9) c.status = 'soguyor';
}

function resolveFlight(state: GameState, f: ArtilleryState['inFlight'][number], ctx: SimContext): void {
  if (f.hitWall && f.sectionId && state.sections[f.sectionId]) {
    damageSection(state, ctx.bus, f.sectionId, f.damage);
    const ex = CANNON_EXTRA[f.type];
    if (ctx.rng.chance(ex.killChance)) applyDefenderLosses(state, ctx.bus, f.sectionId, f.type === 'sahi' ? ctx.rng.int(1, 3) : 1);
  }
  if (f.shipId != null) {
    const s = state.ships.find((x) => x.id === f.shipId);
    if (s && s.status !== 'batik') {
      s.hp = Math.max(0, s.hp - f.damage);
      ctx.bus.emit('ship:hit', { shipId: s.id, at: { tx: s.tx, ty: s.ty } });
      if (s.hp <= 0) {
        s.status = 'batik';
        ctx.bus.emit('ship:sunk', { shipId: s.id, type: s.type, at: { tx: s.tx, ty: s.ty } });
        addLog(state, 'basari', 'Havan topunun güllesi bir düşman gemisini batırdı!');
      }
    }
  }
  ctx.bus.emit('cannon:impact', {
    cannonId: f.cannonId,
    type: f.type,
    at: { tx: f.to.tx, ty: f.to.ty },
    sectionId: f.sectionId,
    damage: f.damage,
    hitWall: f.hitWall,
  });
}

// ───────────────────────────── repair ─────────────────────────────

function tryRepair(state: GameState, c: Cannon, ctx: SimContext | null): boolean {
  const p = arty(state);
  if (c.status !== 'kirik' || p.repair[c.id] != null) return false;
  if ((c.type === 'sahi' || c.type === 'buyuk') && !state.flags[FLAG.orbanGeldi]) return false;
  if (!canAfford(state, REPAIR_COST)) return false;
  spend(state, REPAIR_COST);
  p.repair[c.id] = REPAIR_DAYS;
  addLog(state, 'bilgi', `${c.name} demir çemberlerle sarılıyor (${REPAIR_DAYS} gün).`);
  return true;
}

// ───────────────────────────── tick ─────────────────────────────

export function tickArtillery(state: GameState, ctx: SimContext): void {
  const p = arty(state);
  const today = Math.floor(state.time.day);
  if (today !== p.lastDay) {
    p.lastDay = today;
    for (const c of state.cannons) c.shotsToday = 0;
    for (const c of state.cannons) if (c.status === 'kirik') tryRepair(state, c, ctx);
  }

  // Historic default: guns waiting in Edirne set off in February 1453.
  if (state.time.day >= SEFER_HAZIRLIGI_DAY && p.atEdirne.length) {
    const ids = [...p.atEdirne];
    for (const id of ids) {
      const c = state.cannons.find((x) => x.id === id);
      if (c) startTransport(state, c, ctx.world);
    }
    addLog(state, 'olay', 'Topçubaşı, Edirne\'deki topları öküz koşumlarıyla İstanbul yoluna çıkardı.');
  }

  // Siege start: deploy every parked gun to a battery.
  if (state.time.phase === 'kusatma' && !p.deployed) {
    p.deployed = true;
    for (const id of [...p.atEdirne]) {
      const c = state.cannons.find((x) => x.id === id);
      if (c) startTransport(state, c, ctx.world);
    }
    for (const c of state.cannons) {
      if (c.status !== 'hazir' || p.emplace[c.id] || isAtEdirne(state, c.id) || c.tx < 0) continue;
      if (c.targetSection && inRange(c, c.targetSection)) continue;
      if (c.type === 'havan' && Math.hypot(c.tx - HAVAN_TILE.tx, c.ty - HAVAN_TILE.ty) < 1) continue;
      deploy(state, c, c.targetSection, ctx.world);
    }
  }

  const siege = state.time.phase === 'kusatma';
  const rate = reloadRate(state.time.day);
  const night = isNightish(state.time.day);
  let ammoShort = false;

  for (const c of state.cannons) {
    switch (c.status) {
      case 'dokuluyor': {
        c.progress += ctx.dtDays / CANNON_TYPES[c.type].castDays;
        if (c.progress >= 1) {
          c.progress = 1;
          c.status = 'hazir';
          c.tx = EDIRNE_TILE.tx;
          c.ty = EDIRNE_TILE.ty;
          p.atEdirne.push(c.id);
          if (c.type === 'sahi') {
            state.flags[FLAG.sahiDokuldu] = true;
            addLog(state, 'olay', 'Orban, Şahi\'yi döktü. Edirne\'deki deneme atışında gülle bir mil öteye düşüp toprağa gömüldü; gürleyişi çok uzaklardan duyuldu.');
            notify(ctx.bus, 'Şahi döküldü! Deneme atışı Edirne\'yi sarstı.', 'basari');
          } else {
            addLog(state, 'bilgi', `${c.name} Edirne dökümhanesinde döküldü.`);
            notify(ctx.bus, `${c.name} döküldü.`, 'bilgi');
          }
          if (state.time.phase !== 'hazirlik' || state.time.day >= SEFER_HAZIRLIGI_DAY) startTransport(state, c, ctx.world);
        }
        break;
      }
      case 'yolda': {
        c.progress += ctx.dtDays / transportDays(state, c.type);
        if (c.progress >= 1) arrive(state, c, ctx);
        else updateTransportPos(state, c);
        break;
      }
      case 'mevzileniyor':
        tickEmplace(state, c, ctx);
        break;
      case 'kirik': {
        const r = p.repair[c.id];
        if (r != null) {
          p.repair[c.id] = r - ctx.dtDays;
          if (p.repair[c.id] <= 0) {
            delete p.repair[c.id];
            c.status = 'hazir';
            c.heat = 0;
            c.cooldown = CANNON_TYPES[c.type].reloadSec;
            addLog(state, 'basari', `${c.name} onarıldı; yeniden ateşe hazır.`);
          }
        }
        break;
      }
      default:
        break;
    }

    if (c.status !== 'hazir' && c.status !== 'soguyor') continue;
    const ex = CANNON_EXTRA[c.type];
    c.heat = Math.max(0, c.heat - ex.coolPerSec * ctx.dtSec * (night ? 1.4 : 1));
    if (c.status === 'soguyor') {
      if (c.heat <= 0.3) c.status = 'hazir';
      else continue;
    }
    if (!siege || c.tx < 0) continue;
    if (c.cooldown > 0) c.cooldown = Math.max(0, c.cooldown - ctx.dtSec * rate);
    if (c.cooldown > 0) continue;
    const def = CANNON_TYPES[c.type];
    if (c.shotsToday >= def.shotsPerDay) continue;
    let ship: number | null = null;
    if (c.type === 'havan') ship = havanTarget(state, c);
    if (ship == null) {
      if (!c.targetSection || !state.sections[c.targetSection]) continue;
      if (!inRange(c, c.targetSection)) continue;
    }
    if (state.resources.barut < def.barutPerShot || state.resources.gulle < def.gullePerShot) {
      ammoShort = true;
      continue;
    }
    fire(state, c, ctx, ship);
  }

  if (ammoShort && !p.ammoWarned) {
    p.ammoWarned = true;
    const what = state.resources.barut < cheapestShot().barut * 4 ? 'Barut' : 'Gülle';
    addLog(state, 'uyari', `${what} tükendi; toplar sustu.`);
    notify(ctx.bus, `${what} tükendi — toplar susuyor!`, 'uyari');
  } else if (p.ammoWarned && state.resources.barut >= 5 && state.resources.gulle >= 5) {
    p.ammoWarned = false;
  }

  // balls in flight
  if (p.inFlight.length) {
    for (const f of p.inFlight) f.t -= ctx.dtSec;
    const landed = p.inFlight.filter((f) => f.t <= 0);
    if (landed.length) {
      p.inFlight = p.inFlight.filter((f) => f.t > 0);
      for (const f of landed) resolveFlight(state, f, ctx);
    }
  }
}

// ───────────────────────────── commands ─────────────────────────────

function retarget(state: GameState, c: Cannon, sectionId: SectionId, ctx: SimContext): void {
  const p = arty(state);
  if (!state.sections[sectionId]) return;
  c.targetSection = sectionId;
  const onMap = c.tx >= 0 && !isAtEdirne(state, c.id);
  if (!onMap || c.status === 'yolda' || c.status === 'dokuluyor') {
    p.aim[c.id] = pickAimT(state, sectionId, c.id);
    return;
  }
  if (state.time.phase !== 'kusatma' && c.status !== 'mevzileniyor') {
    p.aim[c.id] = pickAimT(state, sectionId, c.id);
    return;
  }
  const kara = sectionKind(sectionId) === 'kara';
  if (c.status === 'mevzileniyor') {
    if (kara) {
      const t = pickAimT(state, sectionId, c.id);
      p.aim[c.id] = t;
      const dest = emplacementFor(sectionId, c.type, t, ctx.world);
      p.emplace[c.id] = { tx: dest.tx, ty: dest.ty, phase: 'tasima' };
      c.path = routeOutside({ tx: c.tx, ty: c.ty }, dest);
      c.progress = 0;
    }
    return;
  }
  if (inRange(c, sectionId)) {
    p.aim[c.id] = sectionDistance(sectionId, c.tx, c.ty).t;
    c.cooldown = Math.max(c.cooldown, 1.5); // re-aim with wedges
    return;
  }
  if (kara && c.status !== 'kirik') {
    const t = pickAimT(state, sectionId, c.id);
    p.aim[c.id] = t;
    beginEmplace(state, c, emplacementFor(sectionId, c.type, t, ctx.world));
    addLog(state, 'bilgi', `${c.name} yeni mevziye çekiliyor.`);
  } else {
    notify(ctx.bus, `${c.name}: hedef menzil dışında.`, 'uyari');
  }
}

function emplaceAt(state: GameState, ids: number[], tx: number, ty: number, ctx: SimContext): void {
  const p = arty(state);
  const guns = ids
    .map((id) => state.cannons.find((c) => c.id === id))
    .filter((c): c is Cannon => !!c && c.tx >= 0 && !isAtEdirne(state, c.id) && (c.status === 'hazir' || c.status === 'soguyor' || c.status === 'mevzileniyor'));
  if (!guns.length) return;
  // nearest section to the clicked point
  let sec: SectionId | null = null;
  let best = Infinity;
  for (const s of SECTIONS) {
    if (s.kind === 'marmara') continue;
    const r = sectionDistance(s.id, tx, ty);
    if (r.dist < best) {
      best = r.dist;
      sec = s.id;
    }
  }
  if (!sec) return;
  guns.forEach((c, i) => {
    const out = sectionOutward(sec!, sectionDistance(sec!, tx, ty).t);
    // spread multiple guns along the wall direction
    const side = (i - (guns.length - 1) / 2) * 1.6;
    let pos = { tx: tx - out.ty * side, ty: ty + out.tx * side };
    const r = sectionDistance(sec!, pos.tx, pos.ty);
    if (r.dist < 3.5) pos = { tx: pos.tx + out.tx * (3.5 - r.dist), ty: pos.ty + out.ty * (3.5 - r.dist) };
    if (!isFinite(ctx.world.moveCost(Math.floor(pos.tx), Math.floor(pos.ty), 'land'))) {
      const q = ctx.world.nearestPassable(pos, 'land', 4);
      if (!q) return;
      pos = { tx: q.tx + 0.5, ty: q.ty + 0.5 };
    }
    c.targetSection = sec;
    p.aim[c.id] = sectionDistance(sec!, pos.tx, pos.ty).t;
    beginEmplace(state, c, pos);
    const range = CANNON_TYPES[c.type].range;
    if (sectionDistance(sec!, pos.tx, pos.ty).dist > range) notify(ctx.bus, `${c.name}: bu mevziden sur menzil dışında kalır.`, 'uyari');
  });
}

export function handleArtilleryCommand(state: GameState, cmd: Command, ctx: SimContext): boolean {
  const p = arty(state);
  switch (cmd.t) {
    case 'top-dok': {
      const chk = canCast(state, cmd.type);
      if (!chk.ok) {
        notify(ctx.bus, chk.reason ?? 'Top dökülemez.', 'uyari');
        return true;
      }
      spend(state, CANNON_TYPES[cmd.type].castCost);
      const c = spawnCannon(state, cmd.type, EDIRNE_TILE.tx, EDIRNE_TILE.ty, 'dokuluyor');
      c.progress = 0;
      addLog(state, 'bilgi', `Edirne dökümhanesinde ${c.name} dökülmeye başlandı (${CANNON_TYPES[cmd.type].castDays} gün).`);
      if (cmd.type === 'sahi') notify(ctx.bus, 'Orban, Şahi\'nin kalıbını hazırlıyor. Döküm aylar sürecek.', 'bilgi');
      return true;
    }
    case 'top-hedef': {
      for (const id of cmd.cannonIds) {
        const c = state.cannons.find((x) => x.id === id);
        if (c) retarget(state, c, cmd.sectionId, ctx);
      }
      return true;
    }
    case 'yola-cik': {
      for (const id of [...p.atEdirne]) {
        const c = state.cannons.find((x) => x.id === id);
        if (c) startTransport(state, c, ctx.world);
      }
      return false;
    }
    case 'ozel': {
      if (cmd.feature !== 'artillery') return false;
      const pl = (cmd.payload ?? {}) as { cannonIds?: number[]; cannonId?: number; tx?: number; ty?: number };
      switch (cmd.action) {
        case 'orban-tut': {
          const chk = canHireOrban(state);
          if (!chk.ok) {
            notify(ctx.bus, chk.reason ?? 'Orban tutulamaz.', 'uyari');
            return true;
          }
          spend(state, ORBAN_COST);
          state.flags[FLAG.orbanGeldi] = true;
          addLog(state, 'olay', 'Macar dökümcü Orban, istediğinin kat kat fazlası ücretle Sultan\'ın hizmetine girdi.');
          notify(ctx.bus, 'Usta dökümcü Orban hizmetimizde! Artık büyük toplar dökülebilir.', 'basari');
          return true;
        }
        case 'yola-gonder': {
          const ids = pl.cannonIds ?? [...p.atEdirne];
          let n = 0;
          for (const id of ids) {
            const c = state.cannons.find((x) => x.id === id);
            if (c && isAtEdirne(state, id)) {
              startTransport(state, c, ctx.world);
              n++;
            }
          }
          if (n) addLog(state, 'bilgi', `${n} top Edirne'den yola çıkarıldı.`);
          return true;
        }
        case 'mevzi': {
          if (pl.cannonIds && pl.tx != null && pl.ty != null && state.time.phase === 'kusatma') emplaceAt(state, pl.cannonIds, pl.tx, pl.ty, ctx);
          return true;
        }
        case 'onar': {
          const c = state.cannons.find((x) => x.id === pl.cannonId);
          if (c && !tryRepair(state, c, ctx) && c.status === 'kirik' && p.repair[c.id] == null)
            notify(ctx.bus, 'Onarım için tunç ve akçe yetmiyor.', 'uyari');
          return true;
        }
        default:
          return false;
      }
    }
    default:
      return false;
  }
}

// ───────────────────────────── scenarios ─────────────────────────────

function resetArtillery(state: GameState): ArtilleryState {
  state.cannons = [];
  delete state.features.artillery;
  return arty(state);
}

/** Place the historic ≈14 batteries; `mode` controls their stage. */
function placeBatteries(state: GameState, world: WorldApi, mode: 'firing' | 'emplacing' | 'quiet'): void {
  const p = arty(state);
  const perSection: Record<string, number> = {};
  for (const b of HISTORIC_BATTERIES) perSection[b.section] = (perSection[b.section] ?? 0) + 1;
  const seen: Record<string, number> = {};
  const frac = dayFrac(state.time.day);
  HISTORIC_BATTERIES.forEach((b, i) => {
    const k = seen[b.section] ?? 0;
    seen[b.section] = k + 1;
    const n = perSection[b.section];
    const t = b.t ?? (n === 1 ? 0.5 : 0.18 + (0.64 * k) / (n - 1));
    const pos = emplacementFor(b.section, b.type, t, world);
    const c = spawnCannon(state, b.type, pos.tx, pos.ty, 'hazir');
    c.targetSection = b.section;
    p.aim[c.id] = t;
    const def = CANNON_TYPES[b.type];
    const h = hash2(i, 7, state.seed);
    if (mode === 'firing') {
      // staggered so that some guns fire within the first seconds (shots always in flight)
      c.cooldown = i % 2 === 0 ? 0.15 + h * 1.6 : def.reloadSec * (0.1 + 0.9 * h);
      c.shotsToday = Math.min(def.shotsPerDay - 3, Math.floor(def.shotsPerDay * Math.min(0.5, frac)));
      c.heat = b.type === 'sahi' ? 0.35 : 0.2 * h;
    } else if (mode === 'emplacing') {
      if (b.type === 'kucuk' && k === 0 && b.section !== 'kara-lykos') {
        c.cooldown = def.reloadSec * h;
        return;
      }
      const park = { tx: PARK_TILE.tx + (i % 4) * 1.6, ty: PARK_TILE.ty + Math.floor(i / 4) * 1.6 };
      c.status = 'mevzileniyor';
      if (b.type !== 'sahi' && h < 0.4) {
        // still being hauled from the park
        const f = 0.35 + h;
        c.tx = park.tx + (pos.tx - park.tx) * f;
        c.ty = park.ty + (pos.ty - park.ty) * f;
        c.progress = 0;
        p.emplace[c.id] = { tx: pos.tx, ty: pos.ty, phase: 'tasima' };
      } else {
        c.progress = b.type === 'sahi' ? 0.45 : 0.15 + 0.7 * h;
        p.emplace[c.id] = { tx: pos.tx, ty: pos.ty, phase: 'kazi' };
      }
    }
  });
  p.deployed = true;
}

function topUpAmmo(state: GameState): void {
  state.resources.barut = Math.max(state.resources.barut, 3000);
  state.resources.gulle = Math.max(state.resources.gulle, 3000);
  state.resources.tunc = Math.max(state.resources.tunc, 60);
}

export function applyArtilleryScenario(name: ScenarioName, state: GameState, world: WorldApi): void {
  if (name === 'yeni-oyun' || name === 'hisar-insaat') return;
  const p = resetArtillery(state);
  p.lastDay = Math.floor(state.time.day);
  if (name === 'kis-hazirlik') {
    state.flags[FLAG.orbanGeldi] = true;
    state.flags[FLAG.sahiDokuldu] = true;
    const sahi = spawnCannon(state, 'sahi', EDIRNE_TILE.tx, EDIRNE_TILE.ty, 'hazir');
    startTransport(state, sahi, world);
    const off = offMapFraction(state, sahi);
    sahi.progress = off + 0.42 * (1 - off);
    updateTransportPos(state, sahi);
    const b = spawnCannon(state, 'buyuk', EDIRNE_TILE.tx, EDIRNE_TILE.ty, 'dokuluyor');
    b.progress = 0.55;
    for (const type of ['orta', 'orta', 'kucuk', 'kucuk', 'kucuk'] as CannonType[]) {
      const c = spawnCannon(state, type, EDIRNE_TILE.tx, EDIRNE_TILE.ty, 'hazir');
      p.atEdirne.push(c.id);
    }
    return;
  }
  state.flags[FLAG.orbanGeldi] = true;
  state.flags[FLAG.sahiDokuldu] = true;
  topUpAmmo(state);
  if (name === 'kusatma-gun1') {
    placeBatteries(state, world, 'emplacing');
    return;
  }
  state.flags[FLAG.sahiCephede] = true;
  placeBatteries(state, world, name === 'zafer' || name === 'yenilgi' ? 'quiet' : 'firing');
  if (name !== 'bombardiman' && name !== 'gece-onarim') {
    const h = spawnCannon(state, 'havan', HAVAN_TILE.tx, HAVAN_TILE.ty, 'hazir');
    h.cooldown = 3;
  }
}
