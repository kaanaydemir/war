import type { Bus } from '../../core/bus';
import type { CommanderDef, Cost, UnitTypeDef } from '../../core/defs';
import { FLAG } from '../../core/flags';
import type { GameState, Order, OrderType, SectionId, UnitGroup, UnitTypeId } from '../../core/state';
import type { WorldApi } from '../../core/world';
import { canRecruit, countOf, recruitCost, trakyaCheck, TRAKYA_COST, TRAKYA_DAYS, visitCheck } from './campaign';
import { assaultBalance, assaultMembers, coverOf, NO_MODS } from './combat';
import { COMMANDER_BY_ID, RECRUIT, UNIT_ORDER, UNIT_TYPES, WING_ADI, type WingId } from './data';
import { bestBreach, canDeclareFinal } from './final';
import { applyOrder, orderAllowed } from './orders';
import { army, extraOf } from './state';

/** PUBLIC API of army (owner: army agent). Signatures are a contract. */

export { spawnGroup, damageGroup, groupsNear } from './api-core';

// ───────────────────────────── groups & definitions ─────────────────────────────

export function unitTypeDef(type: UnitTypeId): UnitTypeDef {
  return UNIT_TYPES[type];
}

export function commanderOf(g: UnitGroup): CommanderDef | null {
  return g.commanderId ? COMMANDER_BY_ID[g.commanderId] ?? null : null;
}

/** Groups on the map (not away, not disbanded). */
export function groupsOnMap(state: GameState): UnitGroup[] {
  return state.groups.filter((g) => g.status !== 'uzakta' && g.status !== 'dagildi' && g.men > 0);
}

/** Wing (camp position) of a group, with a Turkish label. */
export function groupWing(state: GameState, groupId: number): { id: WingId; name: string } {
  const w = extraOf(state, groupId).wing;
  return { id: w, name: WING_ADI[w] };
}

/** Where an 'uzakta' group is (Turkish), or null if on the map. */
export function awayReason(state: GameState, g: UnitGroup): string | null {
  if (g.status !== 'uzakta') return null;
  const e = extraOf(state, g.id);
  switch (e.campaign) {
    case 'edirne':
      return 'Edirne’de toplanıyor';
    case 'yolda':
      return 'Edirne yolunda';
    case 'takviye':
      return e.enterDay != null ? `Yolda — ${Math.max(0, Math.ceil(e.enterDay - state.time.day))} gün` : 'Yolda';
    case 'trakya':
      return e.returnDay != null ? `Trakya seferinde — ${Math.max(0, Math.ceil(e.returnDay - state.time.day))} gün` : 'Trakya seferinde';
    case 'mora':
      return 'Turahan Bey ile Mora seferinde';
    default:
      return 'Uzakta';
  }
}

/** Overall army numbers for the HUD. */
export function armySummary(state: GameState): { present: number; away: number; byType: Record<UnitTypeId, { groups: number; men: number }> } {
  const byType = Object.fromEntries(UNIT_ORDER.map((t) => [t, { groups: 0, men: 0 }])) as Record<UnitTypeId, { groups: number; men: number }>;
  let present = 0;
  let away = 0;
  for (const g of state.groups) {
    if (g.status === 'dagildi') continue;
    byType[g.type].groups++;
    byType[g.type].men += g.men;
    if (g.status === 'uzakta') away += g.men;
    else present += g.men;
  }
  return { present, away, byType };
}

/** Effective storming power of a group (UI comparisons). */
export function groupStrength(state: GameState, g: UnitGroup): number {
  const d = UNIT_TYPES[g.type];
  return Math.round(g.men * d.attack * (0.4 + 0.8 * (g.morale / 100)) * (1 - 0.5 * (g.fatigue / 100)));
}

// ───────────────────────────── orders ─────────────────────────────

/**
 * Give an order directly (events / scripted use). The UI should dispatch
 * {t:'emir', groupIds, order} instead. Returns the first failure reason or null.
 */
export function orderGroups(state: GameState, world: WorldApi, bus: Bus, groupIds: number[], order: Order): string | null {
  const gs = groupIds.map((id) => state.groups.find((g) => g.id === id)).filter((g): g is UnitGroup => !!g);
  let err: string | null = null;
  gs.forEach((g, i) => {
    const r = applyOrder(state, world, bus, g, order, i, gs.length);
    if (r && !err) err = r;
  });
  return err;
}

/** Can the group take this order now? null = yes, otherwise a Turkish reason. */
export function canOrder(state: GameState, g: UnitGroup, type: OrderType): string | null {
  return orderAllowed(state, g, type);
}

// ───────────────────────────── assaults ─────────────────────────────

export interface AssaultView {
  sectionId: SectionId;
  sectionName: string;
  wave: number;
  groupIds: number[];
  attackers: number;
  defenders: number;
  /** 0..1 progress of the storming parties. */
  foothold: number;
  /** Attack/defense ratio (>1 = gaining). */
  ratio: number;
  /** Ottoman losses so far. */
  lost: number;
  defLost: number;
  /** Seconds of fighting so far. */
  t: number;
}

export function activeAssaults(state: GameState): AssaultView[] {
  const a = army(state);
  return Object.values(a.assaults).map((as) => {
    const members = assaultMembers(state, as.sectionId);
    return {
      sectionId: as.sectionId,
      sectionName: state.sections[as.sectionId]?.name ?? as.sectionId,
      wave: as.wave,
      groupIds: members.map((g) => g.id),
      attackers: members.reduce((s, g) => s + g.men, 0),
      defenders: state.sections[as.sectionId]?.defenders ?? 0,
      foothold: as.foothold,
      ratio: as.ratio,
      lost: as.lost,
      defLost: as.defLost,
      t: as.t,
    };
  });
}

/** Assault render/UI state of one section (or null). */
export function assaultAt(state: GameState, sectionId: SectionId): AssaultView | null {
  return activeAssaults(state).find((v) => v.sectionId === sectionId) ?? null;
}

/**
 * Forecast of an assault by these groups on a section right now (attack/defense
 * ratio; >1.5 promising, <1 hopeless). For UI tooltips.
 */
export function assaultForecast(state: GameState, sectionId: SectionId, groupIds: number[]): { ratio: number; openness: number } {
  const gs = groupIds.map((id) => state.groups.find((g) => g.id === id)).filter((g): g is UnitGroup => !!g && g.men > 0);
  const b = assaultBalance(state, sectionId, gs, 0, NO_MODS);
  return { ratio: b.ratio, openness: b.open };
}

/** Archer suppression of a section 0..~0.55 (byzantium may lower night repairs with it). */
export function coverLevel(state: GameState, sectionId: SectionId): number {
  return coverOf(state, sectionId);
}

/** Groups currently working a section with the given order (e.g. 'hendek-doldur'). */
export function groupsWorking(state: GameState, sectionId: SectionId, type: OrderType): UnitGroup[] {
  return state.groups.filter((g) => g.status === 'calisiyor' && g.order.type === type && g.order.sectionId === sectionId && g.men > 0);
}

/** Supply-road protection 0..1 from sipahi/akıncı on 'ikmal-koru'. */
export function supplyGuard(state: GameState): number {
  let men = 0;
  for (const g of state.groups) if (g.status === 'calisiyor' && g.order.type === 'ikmal-koru') men += g.men * (g.type === 'sipahi' || g.type === 'akinci' ? 1 : 0.5);
  return Math.min(1, men / 4000);
}

// ───────────────────────────── final assault ─────────────────────────────

export interface FinalAssaultStatus {
  /** 'yok' before declaration. */
  phase: 'yok' | 'ilan' | 'toplanma' | 'dalga' | 'ara' | 'dusus' | 'bitti' | 'basarisiz';
  declared: boolean;
  active: boolean;
  wave: number;
  waveName: string | null;
  /** Days until wave 1 (while 'ilan'). */
  startsIn: number | null;
  mainSection: SectionId | null;
  mainSectionName: string | null;
  foothold: number;
  canDeclare: boolean;
  reason?: string;
  /** Narrative beats so far. */
  giustiniani: boolean;
  kerkoporta: boolean;
  sancak: boolean;
  fallen: boolean;
}

const WAVE_ADI = ['', 'Başıbozuklar', 'Anadolu askerleri (İshak Paşa)', 'Yeniçeriler (Sultan önde)'];

export function finalAssaultStatus(state: GameState): FinalAssaultStatus {
  const f = army(state).final;
  const c = canDeclareFinal(state);
  const main = f?.main ?? (state.time.phase === 'kusatma' ? bestBreach(state).id : null);
  return {
    phase: f ? f.phase : 'yok',
    declared: !!state.flags[FLAG.sonHucumIlan],
    active: !!f && (f.phase === 'toplanma' || f.phase === 'dalga' || f.phase === 'ara' || f.phase === 'dusus'),
    wave: f?.wave ?? 0,
    waveName: f && f.wave > 0 ? WAVE_ADI[f.wave] : null,
    startsIn: f && f.phase === 'ilan' ? Math.max(0, f.startDay - state.time.day) : null,
    mainSection: main,
    mainSectionName: main ? state.sections[main]?.name ?? main : null,
    foothold: f?.foothold ?? 0,
    canDeclare: c.ok,
    reason: c.reason,
    giustiniani: !!state.flags[FLAG.giustinianiYarali],
    kerkoporta: !!state.flags[FLAG.kerkoporta],
    sancak: !!state.flags[FLAG.sancakDikildi],
    fallen: !!state.flags[FLAG.sehirDustu],
  };
}

// ───────────────────────────── recruitment & special actions ─────────────────────────────

export interface RecruitOption {
  unit: UnitTypeId;
  label: string;
  desc: string;
  men: number;
  cost: Cost;
  have: number;
  max: number;
  ok: boolean;
  reason?: string;
}

/** Options for the Edirne panel: dispatch {t:'asker-topla', unit, count: 1} (count = groups). */
export function recruitOptions(state: GameState): RecruitOption[] {
  return UNIT_ORDER.map((u) => {
    const c = canRecruit(state, u);
    return {
      unit: u,
      label: RECRUIT[u].label,
      desc: RECRUIT[u].desc,
      men: UNIT_TYPES[u].menPerGroup,
      cost: recruitCost(u),
      have: countOf(state, u),
      max: RECRUIT[u].max,
      ok: c.ok,
      reason: c.reason,
    };
  });
}

/** Sultan's tour of the camp: dispatch {t:'ozel', feature:'army', action:'padisah-ziyareti'}. */
export function sultanVisitStatus(state: GameState): { ok: boolean; reason?: string; readyIn: number } {
  return visitCheck(state);
}

/** H7: dispatch {t:'ozel', feature:'army', action:'trakya'}. */
export function trakyaStatus(state: GameState): { ok: boolean; reason?: string; inProgress: boolean; daysLeft: number; done: boolean; cost: Cost; days: number } {
  const t = army(state).trakya;
  const c = trakyaCheck(state);
  return {
    ok: c.ok,
    reason: c.reason,
    inProgress: !!t,
    daysLeft: t ? Math.max(0, t.returnDay - state.time.day) : 0,
    done: !!state.flags[FLAG.trakyaAlindi],
    cost: TRAKYA_COST,
    days: TRAKYA_DAYS,
  };
}

/** Is the mehter playing right now (sim-side)? */
export function mehterPlaying(state: GameState): boolean {
  return army(state).mehter;
}
