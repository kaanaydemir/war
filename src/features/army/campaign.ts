import type { Bus } from '../../core/bus';
import type { Cost } from '../../core/defs';
import type { SimContext } from '../../core/feature';
import { FLAG } from '../../core/flags';
import { addLog, type GameState, type UnitGroup, type UnitTypeId } from '../../core/state';
import type { WorldApi } from '../../core/world';
import { canAfford, spend } from '../economy/api';
import { spawnGroup } from './api-core';
import { clamp } from './combat';
import { ARMY_PLAN, BAL, HISAR_GUARD, RECRUIT, UNIT_TYPES, type PlannedGroup, type WingId } from './data';
import { campSlot, edirneEntry } from './geo';
import { sendTo } from './move';
import { army, extraOf } from './state';

/** Hazırlık, the march from Edirne, recruitment, side campaigns (Trakya, Mora), the Sultan's visit. */

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];

export interface Check {
  ok: boolean;
  reason?: string;
}

/** Next free camp slot index of a wing. */
export function nextSlot(state: GameState, wing: WingId): number {
  const a = army(state);
  let max = -1;
  for (const e of Object.values(a.extra)) if (e.wing === wing && e.slot != null) max = Math.max(max, e.slot);
  return max + 1;
}

export function spawnPlanned(state: GameState, world: WorldApi | null, p: PlannedGroup, onMap: boolean): UnitGroup {
  const slot = nextSlot(state, p.wing);
  const cs = campSlot(world, p.wing, slot);
  const entry = edirneEntry(world);
  const pos = onMap ? cs.pos : entry;
  const g = spawnGroup(state, p.type, p.men, pos.tx, pos.ty, {
    name: p.name,
    commanderId: p.commanderId ?? null,
    status: onMap ? 'bosta' : 'uzakta',
  });
  const e = extraOf(state, g.id);
  e.wing = p.wing;
  e.banner = p.banner ?? 'kirmizi';
  e.home = { ...cs.pos };
  e.face = cs.face;
  e.slot = slot;
  e.marchKey = p.march;
  if (p.hero) e.hero = p.hero;
  if (!onMap) e.campaign = 'edirne';
  g.facing = cs.face.tx - cs.face.ty >= 0 ? 1 : -1;
  return g;
}

/** New game: guards at the Rumeli Hisarı site, the main army gathering at Edirne. */
export function initArmy(state: GameState, world: WorldApi | null): void {
  const a = army(state);
  for (const p of HISAR_GUARD) spawnPlanned(state, world, p, true);
  for (const p of ARMY_PLAN) spawnPlanned(state, world, p, false);
  a.lastDay = Math.floor(state.time.day);
}

/** 'yola-cik' (H10): schedule the columns over the 13-day march. */
export function planMarch(state: GameState, world: WorldApi): void {
  const a = army(state);
  if (a.marchPlanned) return;
  a.marchPlanned = true;
  const start = state.time.marchStartDay ?? state.time.day;
  for (const g of state.groups) {
    const e = extraOf(state, g.id);
    if (g.status !== 'uzakta' || e.campaign !== 'edirne') continue;
    e.campaign = 'yolda';
    e.enterDay = start + 0.3 + (e.marchKey ?? 3) * 0.7;
  }
  // the escort at Rumeli Hisarı rides to Zağanos Paşa's camp
  for (const g of state.groups) {
    const e = extraOf(state, g.id);
    if (e.wing === 'hisar' && g.type === 'sipahi' && g.status !== 'uzakta' && g.status !== 'dagildi') {
      e.wing = 'zaganos';
      const slot = nextSlot(state, 'zaganos');
      e.slot = slot;
      e.home = campSlot(world, 'zaganos', slot).pos;
      g.order = { type: 'git', target: { ...e.home } };
      if (sendTo(state, world, g, e.home)) g.status = 'yuruyor';
    }
  }
}

/** Groups due to enter the map walk in from the Edirne road. */
function tickArrivals(state: GameState, ctx: SimContext): void {
  const phase = state.time.phase;
  if (phase !== 'yuruyus' && phase !== 'kusatma') return;
  for (const g of state.groups) {
    if (g.status !== 'uzakta') continue;
    const e = extraOf(state, g.id);
    // siege started without a march (loaded/test states): everybody comes now
    if (e.campaign === 'edirne' && phase === 'kusatma') {
      e.campaign = 'yolda';
      e.enterDay = state.time.day;
    }
    if ((e.campaign !== 'yolda' && e.campaign !== 'takviye') || e.enterDay == null || state.time.day < e.enterDay) continue;
    const entry = edirneEntry(ctx.world);
    g.tx = entry.tx;
    g.ty = entry.ty;
    e.campaign = undefined;
    e.enterDay = undefined;
    if (!e.home) {
      const slot = nextSlot(state, e.wing);
      e.slot = slot;
      e.home = campSlot(ctx.world, e.wing, slot).pos;
    }
    g.order = { type: 'git', target: { ...e.home } };
    g.status = 'yuruyor';
    if (!sendTo(state, ctx.world, g, e.home)) {
      g.tx = e.home.tx;
      g.ty = e.home.ty;
      g.status = 'bosta';
    }
    ctx.bus.emit('group:order', { groupId: g.id });
  }
}

// ───────────────────────────── recruitment ─────────────────────────────

export function countOf(state: GameState, type: UnitTypeId): number {
  return state.groups.filter((g) => g.type === type && g.status !== 'dagildi').length;
}

export function recruitCost(type: UnitTypeId): Cost {
  return UNIT_TYPES[type].cost ?? {};
}

export function canRecruit(state: GameState, type: UnitTypeId): Check {
  const r = RECRUIT[type];
  if (!r) return { ok: false, reason: 'Bilinmeyen birlik.' };
  if (state.time.phase === 'bitti') return { ok: false, reason: 'Oyun bitti.' };
  if (state.flags[FLAG.sonHucum]) return { ok: false, reason: 'Son hücum sürüyor.' };
  if (countOf(state, type) >= r.max) return { ok: false, reason: `Bu türden en çok ${r.max} birlik toplanabilir.` };
  if (!canAfford(state, recruitCost(type))) return { ok: false, reason: 'Yetersiz kaynak.' };
  return { ok: true };
}

/** 'asker-topla': count ≤ 10 means groups; larger numbers are men (rounded to groups). */
export function recruit(state: GameState, bus: Bus, type: UnitTypeId, count: number): Check {
  const def = UNIT_TYPES[type];
  if (!def) return { ok: false, reason: 'Bilinmeyen birlik.' };
  const n = count <= 10 ? Math.max(1, Math.round(count)) : Math.max(1, Math.round(count / def.menPerGroup));
  const a = army(state);
  const r = RECRUIT[type];
  let made = 0;
  let last: Check = { ok: true };
  for (let i = 0; i < n; i++) {
    const c = canRecruit(state, type);
    if (!c.ok) {
      last = c;
      break;
    }
    spend(state, recruitCost(type));
    const k = (a.serial[type] ?? countOf(state, type)) + 1;
    a.serial[type] = k;
    const name = `${r.stem} ${ROMAN[k - 1] ?? k}`;
    const g = spawnPlanned(state, null, { type, name, men: def.menPerGroup, wing: r.wing, banner: r.banner, march: 7 }, false);
    const e = extraOf(state, g.id);
    e.home = null; // computed with the world on arrival
    e.slot = undefined;
    if (state.time.phase === 'kusatma') {
      e.campaign = 'takviye';
      e.enterDay = state.time.day + r.arriveDays;
    } else if (state.time.phase === 'yuruyus') {
      e.campaign = 'yolda';
      e.enterDay = state.time.day + 1;
    } else {
      e.campaign = 'edirne';
    }
    made++;
  }
  if (made > 0) {
    const where = state.time.phase === 'kusatma' ? ` ${r.arriveDays} gün içinde ordugâha varacak.` : ' Edirne’de toplanıyor.';
    bus.emit('notify', { text: `${made > 1 ? made + ' birlik ' : ''}${def.plural} toplandı.${where}`, kind: 'basari' });
    addLog(state, 'bilgi', `${made} birlik ${def.plural.toLocaleLowerCase('tr')} toplandı.`);
    return { ok: true };
  }
  if (last.reason) bus.emit('notify', { text: last.reason, kind: 'uyari' });
  return last;
}

// ───────────────────────────── Trakya (H7) & Mora (H6) ─────────────────────────────

export const TRAKYA_COST: Cost = { erzak: 2500, akce: 600 };
export const TRAKYA_DAYS = 14;

export function trakyaCheck(state: GameState): Check {
  if (state.flags[FLAG.trakyaAlindi]) return { ok: false, reason: 'Trakya kasabaları zaten alındı.' };
  if (army(state).trakya) return { ok: false, reason: 'Birlikler zaten Trakya’da.' };
  if (state.time.phase !== 'hazirlik') return { ok: false, reason: 'Trakya seferi hazırlık döneminde yapılır.' };
  if (!trakyaPick(state).length) return { ok: false, reason: 'Gönderilecek akıncı ya da Rumeli sipahisi yok.' };
  if (!canAfford(state, TRAKYA_COST)) return { ok: false, reason: 'Yetersiz erzak ya da akçe.' };
  return { ok: true };
}

function trakyaPick(state: GameState): UnitGroup[] {
  const free = (g: UnitGroup) => g.status !== 'dagildi' && g.men > 0 && !['trakya', 'mora'].includes(extraOf(state, g.id).campaign ?? '');
  const ak = state.groups.filter((g) => g.type === 'akinci' && free(g)).slice(0, 1);
  const sp = state.groups.filter((g) => g.type === 'sipahi' && extraOf(state, g.id).wing === 'karaca' && free(g)).slice(0, 1);
  return [...ak, ...sp];
}

export function startTrakya(state: GameState, bus: Bus): Check {
  const c = trakyaCheck(state);
  if (!c.ok) {
    bus.emit('notify', { text: c.reason ?? '', kind: 'uyari' });
    return c;
  }
  spend(state, TRAKYA_COST);
  const gs = trakyaPick(state);
  const returnDay = state.time.day + TRAKYA_DAYS;
  for (const g of gs) {
    const e = extraOf(state, g.id);
    e.campaign = 'trakya';
    e.returnDay = returnDay;
    g.status = 'uzakta';
    g.path = [];
  }
  army(state).trakya = { groupIds: gs.map((g) => g.id), returnDay };
  bus.emit('notify', { text: 'Karaca Bey’in askerleri Trakya’daki Bizans kasabalarına yürüdü.', kind: 'bilgi' });
  addLog(state, 'olay', 'Akıncılar ve Rumeli sipahileri Trakya’daki Bizans kasabalarına gönderildi.');
  return { ok: true };
}

function tickTrakya(state: GameState, ctx: SimContext): void {
  const a = army(state);
  const t = a.trakya;
  if (!t || state.time.day < t.returnDay) return;
  a.trakya = null;
  state.flags[FLAG.trakyaAlindi] = true;
  for (const id of t.groupIds) {
    const g = state.groups.find((x) => x.id === id);
    if (!g) continue;
    const e = extraOf(state, g.id);
    const lost = Math.round(g.men * (0.04 + ctx.rng.next() * 0.04));
    g.men = Math.max(1, g.men - lost);
    state.stats.ottomanLosses += lost;
    g.xp = clamp(g.xp + 15, 0, 100);
    g.morale = clamp(g.morale + 8, 0, 100);
    e.returnDay = undefined;
    if (state.time.phase === 'hazirlik') e.campaign = 'edirne';
    else {
      e.campaign = 'takviye';
      e.enterDay = state.time.day;
    }
  }
  ctx.bus.emit('notify', { text: 'Trakya’daki Bizans kasabaları alındı; birlikler ganimetle dönüyor.', kind: 'basari' });
  addLog(state, 'basari', 'Trakya’daki kasabalar teslim alındı (Misivri, Vize ve diğerleri; doğrulanacak).');
}

function tickMora(state: GameState, ctx: SimContext): void {
  const a = army(state);
  if (a.moraHandled || !state.flags[FLAG.moraSeferi]) return;
  a.moraHandled = true;
  const free = (g: UnitGroup) => g.status !== 'dagildi' && extraOf(state, g.id).campaign !== 'trakya';
  const ak = state.groups.filter((g) => g.type === 'akinci' && free(g)).slice(-1);
  const sp = state.groups.filter((g) => g.type === 'sipahi' && extraOf(state, g.id).wing === 'karaca' && free(g)).slice(-1);
  for (const g of [...ak, ...sp]) {
    const e = extraOf(state, g.id);
    e.campaign = 'mora';
    g.status = 'uzakta';
    g.path = [];
    g.commanderId = 'turahan';
  }
  ctx.bus.emit('notify', { text: 'Turahan Bey akıncılarla Mora’ya yürüdü; bu askerler kuşatmaya katılmayacak.', kind: 'bilgi' });
  addLog(state, 'olay', 'Turahan Bey Mora seferine çıktı: despotlar Thomas ve Demetrios İstanbul’a yardım gönderemeyecek.');
}

// ───────────────────────────── Sultan's visit ─────────────────────────────

export function visitCheck(state: GameState): Check & { readyIn: number } {
  const v = army(state).visit;
  const readyIn = v ? Math.max(0, v.readyDay - state.time.day) : 0;
  if (state.time.phase !== 'kusatma') return { ok: false, reason: 'Ordugâh henüz kurulmadı.', readyIn };
  if (state.flags[FLAG.sehirDustu]) return { ok: false, reason: 'Şehir alındı.', readyIn };
  if (readyIn > 0) return { ok: false, reason: `Sultan ordugâhı yakın zamanda dolaştı (${Math.ceil(readyIn)} gün sonra yeniden).`, readyIn };
  return { ok: true, readyIn };
}

export function sultanVisit(state: GameState, bus: Bus): Check {
  const c = visitCheck(state);
  if (!c.ok) {
    bus.emit('notify', { text: c.reason ?? '', kind: 'uyari' });
    return c;
  }
  const gain = state.morale > 80 ? BAL.visitMorale / 2 : BAL.visitMorale;
  state.morale = clamp(state.morale + gain, 0, 100);
  state.divan = clamp(state.divan + 2, -100, 100);
  for (const g of state.groups) {
    if (g.status === 'uzakta' || g.status === 'dagildi') continue;
    g.morale = clamp(g.morale + BAL.visitGroupMorale, 0, 100);
    g.fatigue = clamp(g.fatigue - 5, 0, 100);
  }
  army(state).visit = { start: state.time.day, until: state.time.day + 0.13, readyDay: state.time.day + BAL.visitCooldownDays };
  bus.emit('notify', { text: 'Sultan atıyla ordugâhı dolaşıyor; askerlere bahşiş dağıtılıyor. Moral yükseldi.', kind: 'basari' });
  addLog(state, 'olay', 'Sultan Mehmed mevzileri tek tek dolaştı, komutanlarla konuştu ve askerlere bahşiş dağıttı.');
  return { ok: true };
}

export function tickCampaigns(state: GameState, ctx: SimContext): void {
  tickMora(state, ctx);
  tickTrakya(state, ctx);
  tickArrivals(state, ctx);
}
