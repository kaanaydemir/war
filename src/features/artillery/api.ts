import type { TilePt } from '../../core/iso';
import { FLAG } from '../../core/flags';
import { segmentOf } from '../../core/calendar';
import { nextId, RESOURCE_ADI, RESOURCE_IDS, type Cannon, type CannonStatus, type CannonType, type GameState, type SectionId } from '../../core/state';
import type { WorldApi } from '../../core/world';
import { canAfford } from '../economy/api';
import { sectionPath, sectionPoint } from '../fortifications/api';
import { SECTIONS } from '../../data/sections';
import { CANNON_EXTRA, CANNON_TYPES, FOUNDRY_SLOTS, ORBAN_COST, STATUS_ADI } from './data';
import { arty } from './state';

/** PUBLIC API of artillery (owner: artillery agent). Signatures are a contract. */
export function spawnCannon(state: GameState, type: CannonType, tx: number, ty: number, status: CannonStatus = 'hazir', name?: string): Cannon {
  const c: Cannon = {
    id: nextId(state),
    type,
    name: name ?? nextCannonName(state, type),
    tx,
    ty,
    status,
    targetSection: null,
    cooldown: 0,
    shotsToday: 0,
    progress: status === 'hazir' ? 1 : 0,
    heat: 0,
    path: [],
  };
  state.cannons.push(c);
  return c;
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];

/** Next display name for a new gun of this type ("Büyük Bombarda III", "Şahi"). */
export function nextCannonName(state: GameState, type: CannonType): string {
  const p = arty(state);
  const n = (p.serial[type] ?? 0) + 1;
  p.serial[type] = n;
  const stem = CANNON_EXTRA[type].stem;
  if (type === 'sahi') return n === 1 ? 'Şahi' : `Şahi ${ROMAN[n - 1] ?? n}`;
  return `${stem} ${ROMAN[n - 1] ?? n}`;
}

export interface Check {
  ok: boolean;
  reason?: string;
}

/** Can the player hire Orban now? */
export function canHireOrban(state: GameState): Check {
  if (state.flags[FLAG.orbanGeldi]) return { ok: false, reason: 'Orban zaten hizmetimizde.' };
  if (state.time.phase === 'bitti') return { ok: false, reason: 'Oyun bitti.' };
  if (!canAfford(state, ORBAN_COST)) return { ok: false, reason: `Orban yüksek ücret istiyor: ${ORBAN_COST.akce} akçe gerekli.` };
  return { ok: true };
}

/** Guns currently being cast in the Edirne foundry. */
export function castingNow(state: GameState): Cannon[] {
  return state.cannons.filter((c) => c.status === 'dokuluyor');
}

/** Can a gun of this type be cast now? Returns a Turkish reason when not. */
export function canCast(state: GameState, type: CannonType): Check {
  const def = CANNON_TYPES[type];
  if (!def) return { ok: false, reason: 'Bilinmeyen top türü.' };
  if (state.time.phase === 'bitti') return { ok: false, reason: 'Oyun bitti.' };
  if ((type === 'sahi' || type === 'buyuk') && !state.flags[FLAG.orbanGeldi])
    return { ok: false, reason: 'Bu büyüklükte top dökmek için usta dökümcü Orban gerekli.' };
  if (type === 'sahi' && state.cannons.some((c) => c.type === 'sahi'))
    return { ok: false, reason: 'Şahi tektir; Orban onu bir kez döker.' };
  if (castingNow(state).length >= FOUNDRY_SLOTS) return { ok: false, reason: 'Dökümhane dolu: önce dökülen toplar bitsin.' };
  for (const r of RESOURCE_IDS) {
    const need = def.castCost[r] ?? 0;
    if (need > state.resources[r]) return { ok: false, reason: `Yetersiz ${RESOURCE_ADI[r].toLocaleLowerCase('tr')}: ${need} gerekli.` };
  }
  return { ok: true };
}

/** Is this gun waiting in Edirne (cast, not yet sent)? */
export function isAtEdirne(state: GameState, id: number): boolean {
  return arty(state).atEdirne.includes(id);
}

/** Is the gun physically on the map (rendered, pickable)? */
export function isOnMap(state: GameState, c: Cannon): boolean {
  if (c.status === 'dokuluyor') return false;
  if (isAtEdirne(state, c.id)) return false;
  return c.tx >= 0;
}

/** Cannons aimed at a wall section (any status). */
export function cannonsTargeting(state: GameState, sectionId: SectionId): Cannon[] {
  return state.cannons.filter((c) => c.targetSection === sectionId);
}

/** Total transport days at the current road preparation. */
export function transportDays(state: GameState, type: CannonType): number {
  const yol = Math.max(0, Math.min(1, Number(state.flags[FLAG.yolHazirligi] ?? 0)));
  return CANNON_EXTRA[type].transportDays * (1.35 - 0.6 * yol);
}

/** Remaining days until a casting finishes (0 if not casting). */
export function castEta(state: GameState, c: Cannon): number {
  if (c.status !== 'dokuluyor') return 0;
  return Math.max(0, (1 - c.progress) * CANNON_TYPES[c.type].castDays);
}

/** Remaining days of road transport (0 if not on the road). */
export function transportEta(state: GameState, c: Cannon): number {
  if (c.status !== 'yolda') return 0;
  return Math.max(0, (1 - c.progress) * transportDays(state, c.type));
}

/** Nearest distance (tiles) from (tx,ty) to the section's wall line, and the param t of that point. */
export function sectionDistance(sectionId: SectionId, tx: number, ty: number): { dist: number; t: number } {
  const p = sectionPath(sectionId);
  if (p.length < 2) return { dist: Infinity, t: 0.5 };
  let total = 0;
  const lens: number[] = [];
  for (let i = 0; i + 1 < p.length; i++) {
    const l = Math.hypot(p[i + 1].tx - p[i].tx, p[i + 1].ty - p[i].ty);
    lens.push(l);
    total += l;
  }
  let best = Infinity;
  let bestT = 0.5;
  let acc = 0;
  for (let i = 0; i + 1 < p.length; i++) {
    const a = p[i];
    const b = p[i + 1];
    const dx = b.tx - a.tx;
    const dy = b.ty - a.ty;
    const l2 = dx * dx + dy * dy || 1;
    const f = Math.max(0, Math.min(1, ((tx - a.tx) * dx + (ty - a.ty) * dy) / l2));
    const d = Math.hypot(tx - (a.tx + f * dx), ty - (a.ty + f * dy));
    if (d < best) {
      best = d;
      bestT = total > 0 ? (acc + f * lens[i]) / total : 0.5;
    }
    acc += lens[i];
  }
  return { dist: best, t: bestT };
}

/** Is the section within this gun's range from its current position? */
export function inRange(c: Cannon, sectionId: SectionId): boolean {
  return sectionDistance(sectionId, c.tx, c.ty).dist <= CANNON_TYPES[c.type].range;
}

/** Unit normal of a section at param t, pointing to the attacker (outside) side. */
export function sectionOutward(sectionId: SectionId, t: number): TilePt {
  const a = sectionPoint(sectionId, Math.max(0, t - 0.05));
  const b = sectionPoint(sectionId, Math.min(1, t + 0.05));
  let dx = b.tx - a.tx;
  let dy = b.ty - a.ty;
  const l = Math.hypot(dx, dy) || 1;
  dx /= l;
  dy /= l;
  // two normals: (dy, -dx) and (-dy, dx)
  let nx = dy;
  let ny = -dx;
  const kind = SECTIONS.find((s) => s.id === sectionId)?.kind ?? 'kara';
  if (kind === 'kara') {
    if (nx > 0) (nx = -nx), (ny = -ny); // outside of the land walls = west
  } else if (kind === 'halic') {
    if (ny > 0) (nx = -nx), (ny = -ny); // across the Horn = north
  } else if (ny < 0) (nx = -nx), (ny = -ny); // Marmara = south (sea)
  return { tx: nx, ty: ny };
}

/** Battery position for a gun type aiming at param t of a section. */
export function emplacementFor(sectionId: SectionId, type: CannonType, t: number, world?: WorldApi): TilePt {
  const p = sectionPoint(sectionId, t);
  const n = sectionOutward(sectionId, t);
  const d = CANNON_EXTRA[type].standoff;
  // Land batteries are sited obliquely, mostly due west of their aim point: the ball
  // still strikes the wall face, and the guns lie along the east-firing iso axis.
  let ox = n.tx;
  let oy = n.ty;
  const kind = SECTIONS.find((s) => s.id === sectionId)?.kind;
  if (kind === 'kara') {
    ox = -0.7 + n.tx * 0.3;
    oy = n.ty * 0.3;
    const l = Math.hypot(ox, oy) || 1;
    ox /= l;
    oy /= l;
  }
  let pos = { tx: p.tx + ox * d, ty: p.ty + oy * d };
  if (world && !isFinite(world.moveCost(Math.floor(pos.tx), Math.floor(pos.ty), 'land'))) {
    const q = world.nearestPassable(pos, 'land', 4);
    if (q) pos = { tx: q.tx + 0.5, ty: q.ty + 0.5 };
  }
  return pos;
}

/** Nearest hostile ship within the mortar's range, or null. */
export function havanTarget(state: GameState, c: Cannon): number | null {
  const range = CANNON_TYPES.havan.range;
  let best: number | null = null;
  let bd = range;
  for (const s of state.ships) {
    if (s.side === 'osmanli' || s.status === 'batik' || s.status === 'karada') continue;
    const dd = Math.hypot(s.tx - c.tx, s.ty - c.ty);
    if (dd < bd) {
      bd = dd;
      best = s.id;
    }
  }
  return best;
}

/** Why a ready gun is not firing right now (Turkish), or null if it can fire. */
export function blockedReason(state: GameState, c: Cannon): string | null {
  const def = CANNON_TYPES[c.type];
  if (c.status === 'kirik') return 'Namlu çatlak — demir çemberle onarılmalı.';
  if (c.status === 'soguyor') return 'Namlu soğutuluyor.';
  if (c.status !== 'hazir') return STATUS_ADI[c.status] ?? c.status;
  if (state.time.phase !== 'kusatma') return 'Kuşatma başlamadı.';
  if (c.type === 'havan') {
    if (havanTarget(state, c) == null && !(c.targetSection && inRange(c, c.targetSection))) return 'Menzilde düşman gemisi yok.';
  } else {
    if (!c.targetSection) return 'Hedef seçilmedi.';
    if (!inRange(c, c.targetSection)) return 'Hedef menzil dışında.';
  }
  if (c.shotsToday >= def.shotsPerDay) return 'Bugünkü atışlar tamamlandı.';
  if (state.resources.barut < def.barutPerShot) return 'Barut tükendi.';
  if (state.resources.gulle < def.gullePerShot) return 'Gülle tükendi.';
  return null;
}

/** Turkish one-line status for UI ("Yolda — 12 gün", "Hazır — Topkapı'yı dövüyor"). */
export function cannonStatusText(state: GameState, c: Cannon): string {
  if (isAtEdirne(state, c.id)) return STATUS_ADI.edirne;
  switch (c.status) {
    case 'dokuluyor':
      return `Dökülüyor — ${Math.ceil(castEta(state, c))} gün`;
    case 'yolda':
      return `Yolda — ${Math.ceil(transportEta(state, c))} gün`;
    case 'mevzileniyor': {
      const job = arty(state).emplace[c.id];
      return job?.phase === 'tasima' ? 'Mevziye çekiliyor' : `Mevzileniyor — %${Math.round(c.progress * 100)}`;
    }
    case 'kirik': {
      const r = arty(state).repair[c.id];
      return r != null ? `Onarılıyor — ${Math.ceil(r)} gün` : 'Çatlak';
    }
    case 'soguyor':
      return 'Soğuyor';
    default: {
      const sec = c.targetSection ? state.sections[c.targetSection]?.name : null;
      const why = blockedReason(state, c);
      if (!why && sec) return `${sec} dövülüyor`;
      return why ?? 'Hazır';
    }
  }
}

/** Expected powder & ball use per siege day of all emplaced guns (HUD hint). */
export function dailyAmmoUse(state: GameState): { barut: number; gulle: number } {
  let barut = 0;
  let gulle = 0;
  for (const c of state.cannons) {
    if (c.status !== 'hazir' && c.status !== 'soguyor') continue;
    if (!c.targetSection && c.type !== 'havan') continue;
    const d = CANNON_TYPES[c.type];
    barut += d.shotsPerDay * d.barutPerShot;
    gulle += d.shotsPerDay * d.gullePerShot;
  }
  return { barut, gulle };
}

/** Rate multiplier for reloading by time of day (guns mostly fire by daylight). */
export function reloadRate(day: number): number {
  switch (segmentOf(day)) {
    case 'gunduz':
      return 1;
    case 'safak':
    case 'aksam':
      return 0.7;
    default:
      return 0.3;
  }
}
