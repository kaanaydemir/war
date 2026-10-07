import type { BuildingDef, Cost } from '../../core/defs';
import type { TilePt } from '../../core/iso';
import { nextId, RESOURCE_ADI, RESOURCE_IDS, type Building, type GameState, type Side } from '../../core/state';
import type { WorldApi } from '../../core/world';
import { UNIT_TYPES } from '../army/data';
import { sectionAt } from '../fortifications/api';
import {
  BUILDING_BY_ID,
  DOKUMHANE_MAX_LEVEL,
  EDIRNE_ACTIONS,
  HISAR,
  HISAR_TOTAL_WORK,
  HISAR_TOWERS,
  HOUSING,
  KAPIKULU,
  PRICES,
  ROAD_PROJECT,
  SUPPLY,
  UPKEEP,
  VIRTUAL_BUILDINGS,
  hisarPartWork,
  type EdirneActionId,
  type HisarPartId,
  type HisarTowerId,
} from './data';
import { econ } from './econState';
import { hisarTileOffsets } from './hisarLayout';

/** PUBLIC API of economy (owner: economy agent). Signatures are a contract. */
export function canAfford(state: GameState, cost: Cost): boolean {
  return RESOURCE_IDS.every((r) => (cost[r] ?? 0) <= state.resources[r]);
}

/** Deduct cost; returns false (and deducts nothing) if unaffordable. */
export function spend(state: GameState, cost: Cost): boolean {
  if (!canAfford(state, cost)) return false;
  for (const r of RESOURCE_IDS) state.resources[r] -= cost[r] ?? 0;
  return true;
}

export function gain(state: GameState, cost: Cost): void {
  for (const r of RESOURCE_IDS) state.resources[r] += cost[r] ?? 0;
}

/** Place a building directly (scenarios, scripted camps). Does not check cost. */
export function placeBuilding(
  state: GameState,
  type: string,
  tx: number,
  ty: number,
  opts: { built?: boolean; owner?: Side; data?: Building['data'] } = {},
): Building {
  const b: Building = {
    id: nextId(state),
    type,
    tx,
    ty,
    progress: opts.built === false ? 0 : 1,
    built: opts.built !== false,
    workers: 0,
    hp: 100,
    owner: opts.owner ?? 'osmanli',
    data: opts.data ?? {},
  };
  state.buildings.push(b);
  return b;
}

/** Days of provisions left at current consumption. */
export function erzakDays(state: GameState): number {
  const per = dailyErzakConsumption(state);
  return per > 0 ? state.resources.erzak / per : Infinity;
}

// ───────────────────────────── Definitions & queries ─────────────────────────────

export function buildingDef(type: string): BuildingDef | undefined {
  return BUILDING_BY_ID[type];
}

/** Buildings of a type (optionally only finished ones). */
export function buildingsOf(state: GameState, type: string, opts: { built?: boolean } = {}): Building[] {
  return state.buildings.filter((b) => b.type === type && (opts.built === undefined || b.built === opts.built));
}

export function hasBuilt(state: GameState, type: string): boolean {
  return state.buildings.some((b) => b.type === type && b.built);
}

/** Finished cannon emplacements (artillery places guns on these). */
export function emplacements(state: GameState): Building[] {
  return buildingsOf(state, 'top-mevzii', { built: true });
}

export function isVirtual(type: string): boolean {
  return VIRTUAL_BUILDINGS.has(type);
}

/** Tiles covered by a building whose footprint origin is (tx,ty). Rumeli Hisarı uses its wall polygon. */
export function footprintTiles(type: string, tx: number, ty: number): TilePt[] {
  const def = BUILDING_BY_ID[type];
  if (!def || VIRTUAL_BUILDINGS.has(type)) return [];
  if (type === 'rumeli-hisari') {
    const c = { tx: tx + (def.size[0] - 1) / 2, ty: ty + (def.size[1] - 1) / 2 };
    const ax = Math.floor(c.tx);
    const ay = Math.floor(c.ty);
    return hisarTileOffsets().map((o) => ({ tx: ax + o.du, ty: ay + o.dv }));
  }
  const out: TilePt[] = [];
  for (let j = 0; j < def.size[1]; j++) for (let i = 0; i < def.size[0]; i++) out.push({ tx: tx + i, ty: ty + j });
  return out;
}

/** Center of a building's footprint in (fractional) tiles. */
export function buildingCenterTile(b: Pick<Building, 'type' | 'tx' | 'ty'>): TilePt {
  const def = BUILDING_BY_ID[b.type];
  const sz = def?.size ?? [1, 1];
  return { tx: b.tx + (sz[0] - 1) / 2, ty: b.ty + (sz[1] - 1) / 2 };
}

const PHASE_ADI: Record<string, string> = { hazirlik: 'hazırlık', yuruyus: 'yürüyüş', kusatma: 'kuşatma', bitti: 'oyun sonu' };

export interface PlacementCheck {
  ok: boolean;
  /** Turkish reason when not ok. */
  reason?: string;
}

/**
 * Full placement validation for the 'insa' command and the placement ghost:
 * phase, unlock flags, uniqueness, bounds, terrain, region, overlap, nearby
 * terrain, distance to the walls and cost.
 */
export function isPlacementValid(
  state: GameState,
  world: WorldApi,
  type: string,
  tx: number,
  ty: number,
  opts: { ignorePhase?: boolean; ignoreCost?: boolean; ignoreNear?: boolean } = {},
): PlacementCheck {
  const def = BUILDING_BY_ID[type];
  if (!def) return { ok: false, reason: 'Bilinmeyen yapı.' };
  if (VIRTUAL_BUILDINGS.has(type) || (def.phases.length === 0 && !opts.ignorePhase)) return { ok: false, reason: 'Bu yapı haritaya kurulamaz.' };
  if (!opts.ignorePhase && !def.phases.includes(state.time.phase))
    return { ok: false, reason: `Bu yapı ${PHASE_ADI[state.time.phase] ?? state.time.phase} döneminde kurulamaz.` };
  for (const f of def.requires ?? []) if (!state.flags[f]) return { ok: false, reason: 'Henüz kilidi açılmadı.' };
  if (def.unique && state.buildings.some((b) => b.type === type)) return { ok: false, reason: 'Bu yapıdan yalnızca bir tane olabilir.' };

  const tiles = footprintTiles(type, tx, ty);
  const occupied = occupiedTiles(state);
  let hMin = Infinity;
  let hMax = -Infinity;
  for (const t of tiles) {
    if (!world.inBounds(t.tx, t.ty)) return { ok: false, reason: 'Harita dışında.' };
    if (world.isWater(t.tx, t.ty)) return { ok: false, reason: 'Su üzerine kurulamaz.' };
    const ter = world.terrainAt(t.tx, t.ty);
    if (ter === 'sur' || ter === 'hendek') return { ok: false, reason: 'Surların ve hendeğin üzerine kurulamaz.' };
    const reg = world.regionAt(t.tx, t.ty);
    if (ter === 'sehir' || reg === 'sur-ici') return { ok: false, reason: 'Şehrin içine kurulamaz.' };
    if (reg === 'galata') return { ok: false, reason: 'Galata Cenevizlilerindir; oraya kurulamaz.' };
    if (def.regions && !def.regions.includes(reg)) return { ok: false, reason: 'Bu yapı bu bölgeye kurulamaz.' };
    if (occupied.has(t.ty * 4096 + t.tx)) return { ok: false, reason: 'Başka bir yapının üstüne kurulamaz.' };
    const h = world.heightAt(t.tx, t.ty);
    hMin = Math.min(hMin, h);
    hMax = Math.max(hMax, h);
  }
  if (hMax - hMin > 2) return { ok: false, reason: 'Arazi çok engebeli.' };

  if (def.near && !opts.ignoreNear && !nearTerrain(world, tiles, def.near, 2))
    return { ok: false, reason: def.near === 'kaya' ? 'Yakınında kayalık arazi olmalı.' : def.near === 'orman' ? 'Orman kenarına kurulmalı.' : 'Gerekli arazinin yanına kurulmalı.' };

  const c = { tx: tx + (def.size[0] - 1) / 2, ty: ty + (def.size[1] - 1) / 2 };
  if (type === 'siper') {
    const s = sectionAt(c.tx, c.ty, 10);
    if (!s || state.sections[s]?.kind !== 'kara') return { ok: false, reason: 'Siper kara surlarının önüne kurulur.' };
    if (sectionAt(c.tx, c.ty, 2.5)) return { ok: false, reason: 'Surlara çok yakın.' };
  } else if (type === 'top-mevzii') {
    if (!sectionAt(c.tx, c.ty, 26)) return { ok: false, reason: 'Top mevzii surlara menzil içinde olmalı.' };
    if (sectionAt(c.tx, c.ty, 4)) return { ok: false, reason: 'Surlara çok yakın.' };
  } else if (state.time.phase !== 'hazirlik' && sectionAt(c.tx, c.ty, 5)) {
    return { ok: false, reason: 'Surlara çok yakın.' };
  }

  if (!opts.ignoreCost && !canAfford(state, def.cost)) return { ok: false, reason: `Yetersiz kaynak: ${missingText(state, def.cost)}.` };
  return { ok: true };
}

function nearTerrain(world: WorldApi, tiles: TilePt[], terrain: string, r: number): boolean {
  for (const t of tiles)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) if (world.terrainAt(t.tx + dx, t.ty + dy) === terrain) return true;
  return false;
}

/** Set of occupied tiles (key = ty*4096+tx) by every on-map building. */
export function occupiedTiles(state: GameState): Set<number> {
  const set = new Set<number>();
  for (const b of state.buildings) for (const t of footprintTiles(b.type, b.tx, b.ty)) set.add(t.ty * 4096 + t.tx);
  return set;
}

/** "120 taş, 40 kereste" for the missing part of a cost. */
export function missingText(state: GameState, cost: Cost): string {
  return RESOURCE_IDS.filter((r) => (cost[r] ?? 0) > state.resources[r])
    .map((r) => `${Math.ceil((cost[r] ?? 0) - state.resources[r])} ${RESOURCE_ADI[r].toLocaleLowerCase('tr')}`)
    .join(', ');
}

export function costText(cost: Cost): string {
  return RESOURCE_IDS.filter((r) => (cost[r] ?? 0) > 0)
    .map((r) => `${Math.round(cost[r] ?? 0)} ${RESOURCE_ADI[r].toLocaleLowerCase('tr')}`)
    .join(', ');
}

// ───────────────────────────── Upkeep & production ─────────────────────────────

/** Men in groups who eat from the camp's stores (not away on campaign). */
export function soldiersPresent(state: GameState): number {
  let n = 0;
  for (const g of state.groups) if (g.status !== 'uzakta' && g.status !== 'dagildi') n += g.men;
  return n;
}

/** Erzak eaten per day by soldiers present + every worker. */
export function dailyErzakConsumption(state: GameState): number {
  let n = 0;
  for (const g of state.groups) {
    if (g.status === 'uzakta' || g.status === 'dagildi') continue;
    const up = UNIT_TYPES[g.type]?.upkeep;
    n += g.men * (typeof up === 'number' ? up : UPKEEP.soldierErzak);
  }
  return n + state.workforce.total * UPKEEP.workerErzak;
}

/** Daily wages: workers + salaried kapıkulu troops (light), in akçe. */
export function dailyAkceUpkeep(state: GameState): number {
  let a = state.workforce.total * UPKEEP.workerAkce;
  for (const g of state.groups) {
    if (g.status === 'dagildi') continue;
    a += g.men * (KAPIKULU.has(g.type) ? UPKEEP.kapikuluAkce : UPKEEP.otherAkce);
  }
  return a;
}

/** Fixed daily upkeep (erzak + akçe), excluding production inputs. */
export function upkeepPerDay(state: GameState): Cost {
  return { erzak: dailyErzakConsumption(state), akce: dailyAkceUpkeep(state) };
}

/** Housing capacity for workers. */
export function housingCapacity(state: GameState): number {
  return HOUSING.base + buildingsOf(state, 'ordugah-cadirlari', { built: true }).length * HOUSING.perTents;
}

export interface WorkforceInfo {
  total: number;
  assigned: number;
  idle: number;
  /** Workers away on the Edirne road project. */
  away: number;
  housing: number;
  overcrowded: boolean;
}

export function workforceInfo(state: GameState): WorkforceInfo {
  const e = econ(state);
  const away = e.yol.active ? e.yol.workers : 0;
  const housing = housingCapacity(state);
  return {
    total: state.workforce.total,
    assigned: state.workforce.assigned,
    idle: Math.max(0, state.workforce.total - away - state.workforce.assigned),
    away,
    housing,
    overcrowded: state.workforce.total > housing,
  };
}

/** Work-rate factor shared by all workers (pay, food, housing). */
export function labourFactor(state: GameState): number {
  const e = econ(state);
  let f = 1;
  if (e.unpaid) f *= 0.6;
  if (e.starving) f *= 0.5;
  if (state.workforce.total > housingCapacity(state)) f *= HOUSING.overcrowdedRate;
  return f;
}

/** Staffing → work rate for production buildings (0..1). */
export function staffRate(b: Building): number {
  const def = BUILDING_BY_ID[b.type];
  if (!def) return 0;
  if (def.workersMax <= 0) return 1;
  return Math.max(0, Math.min(1, b.workers / def.workersMax));
}

/** Production multiplier from neighbours and Edirne upgrades. */
export function productionBonus(state: GameState, b: Building): number {
  if (b.type === 'tasci-atolyesi') {
    const c = buildingCenterTile(b);
    const near = state.buildings.some((o) => o.type === 'tas-ocagi' && o.built && Math.hypot(buildingCenterTile(o).tx - c.tx, buildingCenterTile(o).ty - c.ty) <= 10);
    return near ? 1.2 : 1;
  }
  if (b.type === 'edirne-dokumhane') return econ(state).dokumhaneLevel;
  return 1;
}

/** Expected gross production per day at current staffing (UI). */
export function productionPerDay(state: GameState): Cost {
  const out: Cost = {};
  const lf = labourFactor(state);
  for (const b of state.buildings) {
    if (!b.built) continue;
    const def = BUILDING_BY_ID[b.type];
    if (!def?.produces) continue;
    const rate = staffRate(b) * (def.workersMax > 0 ? lf : 1) * productionBonus(state, b);
    for (const r of RESOURCE_IDS) if (def.produces[r]) out[r] = (out[r] ?? 0) + def.produces[r]! * rate;
  }
  return out;
}

// ───────────────────────────── Supply ─────────────────────────────

/** Share of the daily erzak need that regular caravans bring (≈0.8–1.1). */
export function supplyCoverage(state: GameState): number {
  if (state.time.phase === 'hazirlik') return SUPPLY.coverageHazirlik;
  const kerv = Math.min(2, buildingsOf(state, 'kervansaray', { built: true }).length);
  const ambar = Math.min(3, buildingsOf(state, 'erzak-ambari', { built: true }).length);
  let c = SUPPLY.coverageKusatma + kerv * SUPPLY.coveragePerKervansaray + ambar * SUPPLY.coveragePerAmbar;
  if (state.flags['bogazKontrol']) c += SUPPLY.coverageBogaz;
  c += SUPPLY.coverageYol * Number(state.flags['yolHazirligi'] ?? 0);
  return c;
}

/** Days between caravan departures right now (Infinity while marching). */
export function caravanInterval(state: GameState): number {
  if (state.time.phase === 'yuruyus' || state.time.phase === 'bitti') return Infinity;
  const kerv = Math.min(2, buildingsOf(state, 'kervansaray', { built: true }).length);
  const base = state.time.phase === 'hazirlik' ? SUPPLY.intervalHazirlik : SUPPLY.intervalKusatma;
  return base * Math.pow(SUPPLY.kervansarayInterval, kerv);
}

export interface CaravanView {
  id: number;
  kind: string;
  /** 0..1 along the route. */
  progress: number;
  cargo: Cost;
  workers: number;
}

export function caravansEnRoute(state: GameState): CaravanView[] {
  return econ(state).caravans.map((c) => ({ id: c.id, kind: c.kind, progress: c.len > 0 ? c.dist / c.len : 1, cargo: c.cargo, workers: c.workers }));
}

/** Days until the next caravan departs Edirne. */
export function nextCaravanIn(state: GameState): number {
  return Math.max(0, econ(state).nextCaravanDay - state.time.day);
}

/** Resources produced/consumed yesterday (for the UI ledger). */
export function ledger(state: GameState): { produced: Cost; consumed: Cost } {
  return econ(state).yesterday;
}

// ───────────────────────────── Rumeli Hisarı ─────────────────────────────

export interface HisarPartView {
  id: HisarPartId;
  name: string;
  pasha?: string;
  progress: number;
  workers: number;
}

export interface HisarStatus {
  buildingId: number;
  /** 'bekliyor' (before 15 Nisan 1452) | 'temel' | 'surlar-kuleler' | 'tamam'. */
  stage: 'bekliyor' | 'temel' | 'surlar-kuleler' | 'tamam';
  stageName: string;
  progress: number;
  parts: HisarPartView[];
  priority: HisarTowerId | null;
  startDay: number;
  ihsanActive: boolean;
  /** Estimated finish day at the current rate (null if stalled/unknown). */
  done: boolean;
}

export function hisarBuilding(state: GameState): Building | undefined {
  return state.buildings.find((b) => b.type === 'rumeli-hisari');
}

export function hisarPart(b: Building, id: HisarPartId): number {
  return Number(b.data[id] ?? 0);
}

/** Overall Rumeli Hisarı progress 0..1 from its parts. */
export function hisarOverall(b: Building): number {
  let w = 0;
  for (const id of ['temel', 'surlar', ...HISAR_TOWERS] as HisarPartId[]) w += hisarPartWork(id) * Math.min(1, hisarPart(b, id));
  return w / HISAR_TOTAL_WORK;
}

export function hisarStatus(state: GameState): HisarStatus | null {
  const b = hisarBuilding(state);
  if (!b) return null;
  const e = econ(state);
  const temel = hisarPart(b, 'temel');
  const stage: HisarStatus['stage'] = b.built ? 'tamam' : state.time.day < HISAR.startDay && temel <= 0 ? 'bekliyor' : temel < 1 ? 'temel' : 'surlar-kuleler';
  const stageName = { bekliyor: 'Malzeme toplanıyor', temel: 'Temel kazılıyor', 'surlar-kuleler': 'Surlar ve kuleler yükseliyor', tamam: 'Tamamlandı' }[stage];
  const parts: HisarPartView[] = (['temel', 'surlar', ...HISAR_TOWERS] as HisarPartId[]).map((id) => ({
    id,
    name: HISAR.parts[id].name,
    pasha: HISAR.parts[id].pasha,
    progress: Math.min(1, hisarPart(b, id)),
    workers: Number(b.data[`w_${id}`] ?? 0),
  }));
  return {
    buildingId: b.id,
    stage,
    stageName,
    progress: b.built ? 1 : hisarOverall(b),
    parts,
    priority: e.hisarPriority,
    startDay: HISAR.startDay,
    ihsanActive: state.time.day < e.ihsanUntil,
    done: b.built,
  };
}

// ───────────────────────────── Edirne actions ─────────────────────────────

export interface EdirneActionCheck {
  ok: boolean;
  reason?: string;
  cost: Cost;
}

/** Erzak bought by 'erzak-satin-al' (8 days of current consumption, min 30 000). */
export function erzakPurchaseAmount(state: GameState): number {
  return Math.max(30000, Math.round(dailyErzakConsumption(state) * 8));
}

/** Single source of truth for Edirne action availability & cost (UI + sim). */
export function edirneActionCheck(state: GameState, id: EdirneActionId, payload?: unknown): EdirneActionCheck {
  const e = econ(state);
  const def = EDIRNE_ACTIONS.find((a) => a.id === id);
  if (!def) return { ok: false, reason: 'Bilinmeyen emir.', cost: {} };
  let cost: Cost = { ...(def.cost ?? {}) };
  const phase = state.time.phase;
  if (phase === 'bitti') return { ok: false, reason: 'Oyun bitti.', cost };
  const fail = (reason: string): EdirneActionCheck => ({ ok: false, reason, cost });
  switch (id) {
    case 'yol-hazirla': {
      if (phase !== 'hazirlik') return fail('Yol yalnızca hazırlık döneminde hazırlanabilir.');
      if (e.yol.active) return fail('Yol çalışması zaten sürüyor.');
      if (Number(state.flags['yolHazirligi'] ?? 0) >= 1) return fail('Yol tamamen hazır.');
      const free = state.workforce.total - state.workforce.assigned;
      if (state.workforce.total < ROAD_PROJECT.workers + 200 && free < ROAD_PROJECT.workers) return fail('Yeterli amele yok.');
      break;
    }
    case 'yol-durdur':
      if (!e.yol.active) return fail('Yolda çalışan amele yok.');
      break;
    case 'amele-topla':
      if (phase === 'yuruyus') return fail('Ordu yoldayken amele toplanamaz.');
      break;
    case 'dokumhane-genislet':
      if (e.dokumhaneLevel >= DOKUMHANE_MAX_LEVEL) return fail('Dökümhane en büyük hâlinde.');
      cost = { akce: 3500 * e.dokumhaneLevel, tas: 120, kereste: 120 };
      break;
    case 'vergi':
      if (state.time.day < e.vergiReadyDay) return fail(`Yeni vergi için ${Math.ceil(e.vergiReadyDay - state.time.day)} gün beklenmeli.`);
      break;
    case 'erzak-satin-al':
      if (phase === 'yuruyus') return fail('Ordu yoldayken satın alınamaz.');
      cost = { akce: Math.round(erzakPurchaseAmount(state) * PRICES.erzak) };
      break;
    case 'maden-satin-al':
      if (phase === 'yuruyus') return fail('Ordu yoldayken satın alınamaz.');
      break;
    case 'hisar-oncelik': {
      const b = hisarBuilding(state);
      if (!b || b.built) return fail('Hisar inşaatı yok.');
      const k = (payload as { kule?: string } | undefined)?.kule;
      if (k != null && !HISAR_TOWERS.includes(k as HisarTowerId)) return fail('Bilinmeyen kule.');
      break;
    }
    case 'hisar-ihsan': {
      const b = hisarBuilding(state);
      if (!b || b.built) return fail('Hisar inşaatı yok.');
      if (hisarPart(b, 'temel') < 1) return fail('Önce temel bitmeli.');
      if (state.time.day < e.ihsanReadyDay) return fail(`Paşalara yeniden ihsan için ${Math.ceil(e.ihsanReadyDay - state.time.day)} gün beklenmeli.`);
      break;
    }
    case 'otomatik-isci':
      break;
  }
  if (!canAfford(state, cost)) return { ok: false, reason: `Yetersiz kaynak: ${missingText(state, cost)}.`, cost };
  return { ok: true, cost };
}

export interface EdirneActionView {
  id: EdirneActionId;
  name: string;
  desc: string;
  cost: Cost;
  ok: boolean;
  reason?: string;
}

/** Actions for the Edirne panel (dispatch {t:'ozel', feature:'economy', action: id}). */
export function edirneActions(state: GameState): EdirneActionView[] {
  return EDIRNE_ACTIONS.filter((a) => a.panel || (a.id === 'yol-durdur' && econ(state).yol.active)).map((a) => {
    const c = edirneActionCheck(state, a.id);
    return { id: a.id, name: a.name, desc: a.desc, cost: c.cost, ok: c.ok, reason: c.reason };
  });
}

/** Edirne summary for the panel. */
export function edirneInfo(state: GameState): {
  dokumhaneLevel: number;
  yolHazirligi: number;
  yolActive: boolean;
  nextCaravanIn: number;
  coverage: number;
  vergiReadyIn: number;
} {
  const e = econ(state);
  return {
    dokumhaneLevel: e.dokumhaneLevel,
    yolHazirligi: Number(state.flags['yolHazirligi'] ?? 0),
    yolActive: e.yol.active,
    nextCaravanIn: nextCaravanIn(state),
    coverage: supplyCoverage(state),
    vergiReadyIn: Math.max(0, e.vergiReadyDay - state.time.day),
  };
}

