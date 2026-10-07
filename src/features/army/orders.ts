import type { Bus } from '../../core/bus';
import type { SimContext } from '../../core/feature';
import type { TilePt } from '../../core/iso';
import { FLAG } from '../../core/flags';
import { addLog, type GameState, type Order, type SectionId, type UnitGroup } from '../../core/state';
import type { WorldApi } from '../../core/world';
import { SECTION_BY_ID, SECTIONS } from '../../data/sections';
import { sectionAt, sectionPoint } from '../fortifications/api';
import { newAssault } from './combat';
import { UNIT_TYPES } from './data';
import { edirneRoadPoint, frontPoint, inwardAt, isLandSection, spreadT } from './geo';
import { sendTo, spreadTargets } from './move';
import { army, extraOf } from './state';

/** Player/AI orders for groups: validation, routing and arrival behaviour. */

export const ORDER_FAIL: Record<string, string> = {
  uzakta: 'Birlik uzakta.',
  dagildi: 'Birlik dağıldı.',
  yol: 'Oraya yol bulunamadı.',
  kusatma: 'Bu emir yalnızca kuşatma sırasında verilebilir.',
  sur: 'Hedef bir kara suru bölümü olmalı.',
  hendek: 'Bu bölümün önünde hendek yok.',
  lagim: 'Lağımı yalnızca lağımcılar kazabilir.',
  mehter: 'Mehter savaşmaz.',
  son: 'Son hücum sürüyor: birlikler dalga düzenine bağlı.',
};

/** Nearest land section to a point (fallback when no section was given). */
export function nearestLandSection(tx: number, ty: number): SectionId {
  let best: SectionId = 'kara-lykos';
  let bd = Infinity;
  for (const s of SECTIONS) {
    if (s.kind !== 'kara') continue;
    const p = sectionPoint(s.id, 0.5);
    const d = Math.hypot(p.tx - tx, p.ty - ty);
    if (d < bd) {
      bd = d;
      best = s.id;
    }
  }
  return best;
}

function resolveSection(order: Order, g: UnitGroup): SectionId {
  if (order.sectionId && SECTION_BY_ID[order.sectionId]) return order.sectionId;
  if (order.target) {
    const s = sectionAt(order.target.tx, order.target.ty, 6);
    if (s && isLandSection(s)) return s;
    return nearestLandSection(order.target.tx, order.target.ty);
  }
  return nearestLandSection(g.tx, g.ty);
}

/**
 * Apply an order to a group. `i`/`n` spread several groups ordered together.
 * Returns null on success or a Turkish reason.
 */
export function applyOrder(state: GameState, world: WorldApi, bus: Bus, g: UnitGroup, order: Order, i = 0, n = 1): string | null {
  if (g.status === 'uzakta') return ORDER_FAIL.uzakta;
  if (g.status === 'dagildi' || g.men <= 0) return ORDER_FAIL.dagildi;
  const e = extraOf(state, g.id);
  const siege = state.time.phase === 'kusatma';
  const t = spreadT(i, n);
  let dest: TilePt | null = null;
  let o: Order = { ...order };
  switch (order.type) {
    case 'bekle':
      g.path = [];
      g.order = { type: 'bekle' };
      g.status = 'bosta';
      e.goal = null;
      bus.emit('group:order', { groupId: g.id });
      return null;
    case 'git':
    case 'konuslan':
    case 'kesif': {
      if (!order.target) return ORDER_FAIL.yol;
      dest = n > 1 ? spreadTargets(world, order.target, n, { tx: order.target.tx - g.tx, ty: order.target.ty - g.ty })[i] : order.target;
      break;
    }
    case 'ikmal-koru':
      dest = order.target ?? edirneRoadPoint(world, 0.55 + i * 0.12);
      break;
    case 'bombardimani-koru': {
      if (!siege) return ORDER_FAIL.kusatma;
      const sid = resolveSection(order, g);
      if (!isLandSection(sid)) return ORDER_FAIL.sur;
      o = { type: order.type, sectionId: sid };
      dest = frontPoint(world, sid, t, 3.4 + (i % 2) * 0.7);
      e.face = inwardAt(sid, t);
      break;
    }
    case 'hendek-doldur': {
      if (!siege) return ORDER_FAIL.kusatma;
      const sid = resolveSection(order, g);
      if (!isLandSection(sid)) return ORDER_FAIL.sur;
      if (!SECTION_BY_ID[sid]?.moat) return ORDER_FAIL.hendek;
      o = { type: order.type, sectionId: sid };
      dest = frontPoint(world, sid, t, 2.7);
      e.face = inwardAt(sid, t);
      break;
    }
    case 'lagim-kaz':
    case 'kuleyi-ilerlet': {
      if (!siege) return ORDER_FAIL.kusatma;
      if (order.type === 'lagim-kaz' && g.type !== 'lagimci') return ORDER_FAIL.lagim;
      const sid = resolveSection(order, g);
      if (!isLandSection(sid)) return ORDER_FAIL.sur;
      o = { type: order.type, sectionId: sid, entityId: order.entityId };
      dest = frontPoint(world, sid, t, order.type === 'lagim-kaz' ? 6.5 : 4.5);
      e.face = inwardAt(sid, t);
      break;
    }
    case 'hucum': {
      if (!siege) return ORDER_FAIL.kusatma;
      if (g.type === 'mehter') return ORDER_FAIL.mehter;
      const sid = resolveSection(order, g);
      if (!isLandSection(sid)) return ORDER_FAIL.sur;
      o = { type: 'hucum', sectionId: sid };
      dest = frontPoint(world, sid, t, 2.6 + (i % 2) * 0.8);
      e.face = inwardAt(sid, t);
      break;
    }
    case 'geri-cekil':
    case 'dinlen': {
      dest = e.home ?? { tx: g.tx, ty: g.ty };
      break;
    }
  }
  if (!dest) return ORDER_FAIL.yol;
  // leaving an assault: the group is no longer storming
  g.order = o;
  const far = Math.hypot(dest.tx - g.tx, dest.ty - g.ty) > 0.6;
  if (far) {
    if (!sendTo(state, world, g, dest)) return ORDER_FAIL.yol;
    g.status = o.type === 'geri-cekil' ? 'cekiliyor' : 'yuruyor';
  } else {
    g.path = [];
    arrive(state, world, bus, g);
  }
  bus.emit('group:order', { groupId: g.id });
  return null;
}

/** Arrival behaviour for the group's current order. */
export function arrive(state: GameState, world: WorldApi, bus: Bus, g: UnitGroup): void {
  const e = extraOf(state, g.id);
  e.goal = null;
  switch (g.order.type) {
    case 'konuslan':
      e.home = { tx: g.tx, ty: g.ty };
      g.status = 'bosta';
      break;
    case 'bombardimani-koru':
    case 'hendek-doldur':
    case 'lagim-kaz':
    case 'kuleyi-ilerlet':
    case 'kesif':
    case 'ikmal-koru':
      g.status = 'calisiyor';
      break;
    case 'hucum':
      g.status = 'savasiyor';
      joinAssault(state, bus, g);
      break;
    case 'geri-cekil':
      g.status = 'bosta';
      g.order = { type: 'bekle' };
      break;
    case 'dinlen':
      g.status = 'bosta';
      break;
    default:
      g.status = 'bosta';
      if (g.order.type === 'git') g.order = { type: 'bekle', target: g.order.target };
  }
  bus.emit('group:arrived', { groupId: g.id });
}

/** Put a storming group into the assault of its section (creating it). */
export function joinAssault(state: GameState, bus: Bus, g: UnitGroup): void {
  const sid = g.order.sectionId;
  if (!sid) return;
  const a = army(state);
  const f = a.final;
  let as = a.assaults[sid];
  if (!as) {
    const wave = f && (f.main === sid || f.side.includes(sid)) && (f.phase === 'dalga' || f.phase === 'toplanma' || f.phase === 'ara') ? Math.max(1, f.wave) : 0;
    as = newAssault(state, sid, wave);
    a.assaults[sid] = as;
    state.stats.assaults++;
    as.groupIds = [g.id];
    as.committed = g.men;
    bus.emit('assault:start', { sectionId: sid, groupIds: [g.id], wave });
    if (wave === 0) addLog(state, 'olay', `${state.sections[sid]?.name ?? sid} bölümüne hücum başladı.`);
  } else if (!as.groupIds.includes(g.id)) {
    as.groupIds.push(g.id);
    as.committed += g.men;
  }
}

/** Can this unit type take this order (UI hint; null = yes). */
export function orderAllowed(state: GameState, g: UnitGroup, type: Order['type']): string | null {
  if (g.status === 'uzakta') return ORDER_FAIL.uzakta;
  if (g.status === 'dagildi') return ORDER_FAIL.dagildi;
  const siege = state.time.phase === 'kusatma';
  if (['hucum', 'bombardimani-koru', 'hendek-doldur', 'lagim-kaz', 'kuleyi-ilerlet'].includes(type) && !siege) return ORDER_FAIL.kusatma;
  if (type === 'lagim-kaz' && g.type !== 'lagimci') return ORDER_FAIL.lagim;
  if (type === 'hucum' && g.type === 'mehter') return ORDER_FAIL.mehter;
  if (state.flags[FLAG.sehirDustu]) return 'Şehir alındı.';
  return null;
}

/** Display helper: section the group is working on. */
export function orderSectionName(state: GameState, g: UnitGroup): string | null {
  const sid = g.order.sectionId;
  return sid ? state.sections[sid]?.name ?? null : null;
}

export function unitName(g: UnitGroup): string {
  return UNIT_TYPES[g.type]?.name ?? g.type;
}

