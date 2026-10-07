import type { Bus } from '../../core/bus';
import { FLAG } from '../../core/flags';
import type { TilePt } from '../../core/iso';
import type { GameState, Mine, SectionId } from '../../core/state';
import {
  AMELE_MAX,
  BONUS,
  MINE_FATE_ADI,
  MINE_STATUS_ADI,
  TOWER_COST,
  TOWER_MOAT_NEED,
  TOWER_STATUS_ADI,
  TOWER_WALL,
  type MineFate,
  type TowerStatus,
} from './data';
import { hasMoat, isLand, tunnelPoint } from './geo';
import { archerCover, burnTowerAt, mantletCoverOf, mineCheck, mineX, towerCheck, towerPos } from './sim';
import { sw, type TowerState } from './state';

/** PUBLIC API of siegeworks (owner: siegeworks agent). Signatures are a contract. */

/**
 * Multiplier ≥ 1 for assaults on this section: siege tower at/near the wall,
 * filled moat (ladders reach the wall foot), scaling ladders, a recent mine
 * breach and mantlets. (Breach openness itself is fortifications' assaultOpenness.)
 */
export function assaultBonus(state: GameState, sectionId: SectionId): number {
  const sec = state.sections[sectionId];
  if (!sec) return 1;
  let b = 1;
  for (const tw of sw(state).towers) {
    if (tw.sectionId !== sectionId) continue;
    if (tw.status === 'surda') b *= BONUS.towerAtWall;
    else if ((tw.status === 'ilerliyor' || tw.status === 'bekliyor') && tw.dist < 3.6) b *= BONUS.towerNear;
  }
  if (sec.kind === 'kara') {
    const fill = hasMoat(sectionId) ? Math.max(0, Math.min(1, sec.moatFill)) : 1;
    if (hasMoat(sectionId)) b *= 1 + BONUS.moat * fill;
    if (fill >= 0.5) b *= BONUS.ladders;
    if (state.flags[FLAG.sonHucumIlan] || state.flags[FLAG.sonHucum]) b *= BONUS.finalLadders;
    const hit = sw(state).mineHit[sectionId];
    if (hit != null && state.time.day - hit < BONUS.mineRecentDays) b *= BONUS.mineRecent;
    b *= 1 + BONUS.mantlet * (mantletCoverOf(state, sectionId) / 0.5);
  }
  return Math.max(1, b);
}

/** Byzantine sortie burns the siege tower at this section (if any). */
export function burnTower(state: GameState, bus: Bus, sectionId: SectionId): boolean {
  return burnTowerAt(state, bus, sectionId);
}

// ───────────────────────────── read-only views for UI / other features ─────────────────────────────

/** Mantlet cover 0..0.5 in front of a section (siper buildings). Artillery/army may reduce crew losses with it. */
export function mantletCover(state: GameState, sectionId: SectionId): number {
  return mantletCoverOf(state, sectionId);
}

/** Archer suppression read from the army (0..~0.55). */
export function archerSuppression(state: GameState, sectionId: SectionId): number {
  return archerCover(state, sectionId);
}

export interface MoatWorkView {
  sectionId: SectionId;
  fill: number;
  /** Effective workers right now (soldiers + amele). */
  men: number;
  /** Civilian amele lent to this moat. */
  amele: number;
  ameleMax: number;
  /** Fraction along the section where the crews work. */
  t: number;
  hasMoat: boolean;
}

/** Moat filling status of a section (null for sea walls). */
export function moatWork(state: GameState, sectionId: SectionId): MoatWorkView | null {
  const sec = state.sections[sectionId];
  if (!sec || !isLand(sectionId)) return null;
  const site = sw(state).moat[sectionId];
  return {
    sectionId,
    fill: sec.moatFill,
    men: Math.round(site?.men ?? 0),
    amele: site?.amele ?? 0,
    ameleMax: AMELE_MAX,
    t: site?.t ?? 0.5,
    hasMoat: hasMoat(sectionId),
  };
}

export interface MineView {
  id: number;
  sectionId: SectionId;
  status: Mine['status'];
  statusText: string;
  progress: number;
  detected: boolean;
  /** Byzantine counter-tunnel progress 0..1 (null if none). */
  counter: number | null;
  fate: MineFate | null;
  fateText: string | null;
  /** Shaft entrance and tunnel head (tile space). */
  entrance: TilePt;
  head: TilePt;
  target: TilePt;
  canFire: boolean;
}

export function mineView(state: GameState, mineId: number): MineView | null {
  const m = state.mines.find((x) => x.id === mineId);
  if (!m) return null;
  const x = mineX(state, m);
  const entrance = { tx: m.tx, ty: m.ty };
  return {
    id: m.id,
    sectionId: m.sectionId,
    status: m.status,
    statusText: x.fate ? MINE_FATE_ADI[x.fate] : MINE_STATUS_ADI[m.status],
    progress: m.progress,
    detected: m.detected,
    counter: x.counter >= 0 ? x.counter : null,
    fate: x.fate,
    fateText: x.fate ? MINE_FATE_ADI[x.fate] : null,
    entrance,
    head: tunnelPoint(entrance, m.sectionId, x.t, m.progress),
    target: tunnelPoint(entrance, m.sectionId, x.t, 1),
    canFire: m.status === 'hazir',
  };
}

/** Why this sapper group can't dig here (Turkish) or null. */
export function canDigMine(state: GameState, sectionId: SectionId, groupId: number): string | null {
  return mineCheck(state, sectionId, state.groups.find((g) => g.id === groupId));
}

export interface TowerView {
  id: number;
  /** Pick id used on the map: { kind: 'building', id: -id }. */
  pickId: number;
  sectionId: SectionId;
  status: TowerStatus;
  statusText: string;
  /** Construction progress 0..1. */
  progress: number;
  /** Approach progress 0..1 (1 = at the wall). */
  approach: number;
  burn: number;
  at: TilePt;
  /** Turkish reason why it cannot advance now, or null. */
  blocked: string | null;
  moatNeed: number;
}

function view(state: GameState, t: TowerState): TowerView {
  const sec = state.sections[t.sectionId];
  let blocked: string | null = null;
  if (t.status === 'insa') blocked = 'Kule henüz bitmedi.';
  else if (t.status === 'bekliyor' && hasMoat(t.sectionId) && (sec?.moatFill ?? 0) < TOWER_MOAT_NEED)
    blocked = `Hendek en az %${Math.round(TOWER_MOAT_NEED * 100)} doldurulmalı (şu an %${Math.round((sec?.moatFill ?? 0) * 100)}).`;
  return {
    id: t.id,
    pickId: -t.id,
    sectionId: t.sectionId,
    status: t.status,
    statusText: TOWER_STATUS_ADI[t.status],
    progress: t.progress,
    approach: Math.max(0, Math.min(1, (6 - t.dist) / (6 - TOWER_WALL))),
    burn: t.burn,
    at: towerPos(t),
    blocked,
    moatNeed: TOWER_MOAT_NEED,
  };
}

/** All siege towers (including burning wrecks). */
export function siegeTowers(state: GameState): TowerView[] {
  return sw(state).towers.map((t) => view(state, t));
}

/** Tower by its entity id OR its (negative) map pick id. */
export function towerView(state: GameState, id: number): TowerView | null {
  const t = sw(state).towers.find((x) => x.id === Math.abs(id));
  return t ? view(state, t) : null;
}

/** Why a siege tower can't be raised before this section (Turkish), or null. */
export function canBuildTower(state: GameState, sectionId: SectionId): string | null {
  return towerCheck(state, sectionId);
}

export { TOWER_COST, AMELE_MAX, MINE_STATUS_ADI, TOWER_STATUS_ADI, MINE_FATE_ADI };
