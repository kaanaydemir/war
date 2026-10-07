import { featureState, type GameState, type SectionId, type UnitTypeId } from '../../core/state';
import type { BannerColor, WingId } from './data';

/**
 * Private, JSON-serializable army state (state.features.army).
 */

export interface GroupExtra {
  wing: WingId;
  banner: BannerColor;
  /** Camp position (tile). */
  home: { tx: number; ty: number } | null;
  /** Final goal of the current movement (tile), null when stationary. */
  goal: { tx: number; ty: number } | null;
  /** Direction the formation faces when idle (tile-space unit vector). */
  face: { tx: number; ty: number };
  hero?: 'hasan';
  /** Away on a campaign / not yet arrived. */
  campaign?: 'edirne' | 'yolda' | 'trakya' | 'mora' | 'takviye';
  /** Absolute day this group enters the map (march / reinforcements). */
  enterDay?: number;
  /** Absolute day it returns from a campaign. */
  returnDay?: number;
  /** March order (for the 13-day march column). */
  marchKey?: number;
  /** Seconds since last 'arrived' etc. (anti-spam timers). */
  harassAcc?: number;
  /** Fractional casualty accumulator (assault/harass). */
  lossAcc?: number;
  /** Slot index used for spreading at a common destination. */
  slot?: number;
}

export interface AssaultState {
  sectionId: SectionId;
  /** 0 = ordinary assault; 1..3 = final assault wave. */
  wave: number;
  startDay: number;
  t: number;
  groupIds: number[];
  /** 0..1 progress of the storming parties on the wall/breach. */
  foothold: number;
  /** 0..1 defender exhaustion (final assault waves wear them down). */
  exhaustion: number;
  /** Men committed and lost (for morale effects at the end). */
  committed: number;
  lost: number;
  defLost: number;
  defAcc: number;
  /** Render hints (refreshed every tick). */
  intensity: number;
  ratio: number;
  clashAcc: number;
  volleyAcc: number;
  /** Has the foothold ever reached the top (ordinary assault success). */
  success: boolean;
}

export type FinalPhase = 'ilan' | 'toplanma' | 'dalga' | 'ara' | 'dusus' | 'bitti' | 'basarisiz';

export interface FinalAssaultState {
  phase: FinalPhase;
  /** Absolute day of declaration. */
  declaredDay: number;
  /** Absolute day wave 1 begins. */
  startDay: number;
  wave: number;
  /** Sim seconds in the current phase. */
  t: number;
  main: SectionId;
  side: SectionId[];
  waves: number[][];
  diversion: number[];
  cover: number[];
  foothold: number;
  exhaustion: number;
  hasan: boolean;
  kerkoporta: boolean;
  sultanAtMoat: boolean;
  /** Tower tile where the banner was planted. */
  bannerAt: { tx: number; ty: number } | null;
  /** Kerkoporta position (tile). */
  kerkoAt: { tx: number; ty: number } | null;
}

export interface ArmyState {
  assaults: Record<SectionId, AssaultState>;
  final: FinalAssaultState | null;
  /** Day after which another final assault may be declared (after a failure). */
  finalCooldownUntil: number;
  extra: Record<number, GroupExtra>;
  /** Archer suppression per section 0..coverMax (recomputed every tick). */
  cover: Record<SectionId, number>;
  /** Sultan's tour of the camp. */
  visit: { start: number; until: number; readyDay: number } | null;
  trakya: { groupIds: number[]; returnDay: number } | null;
  moraHandled: boolean;
  marchPlanned: boolean;
  /** Raised groups per type (naming). */
  serial: Partial<Record<UnitTypeId, number>>;
  /** Last integer day processed (daily bookkeeping). */
  lastDay: number;
  /** Mehter currently playing (mirrors the last 'mehter:play'). */
  mehter: boolean;
  /** Sim-seconds counter (pacing of events). */
  clock: number;
  /** Fallen city: day the outcome is due. */
  outcomeAt: number | null;
  /** Visual-only: groups parading after the fall (render loops them). */
  parade: number[];
}

export function army(state: GameState): ArmyState {
  return featureState<ArmyState>(state, 'army', () => ({
    assaults: {},
    final: null,
    finalCooldownUntil: 0,
    extra: {},
    cover: {},
    visit: null,
    trakya: null,
    moraHandled: false,
    marchPlanned: false,
    serial: {},
    lastDay: -1,
    mehter: false,
    clock: 0,
    outcomeAt: null,
    parade: [],
  }));
}

export function extraOf(state: GameState, id: number): GroupExtra {
  const a = army(state);
  let e = a.extra[id];
  if (!e) {
    e = { wing: 'merkez', banner: 'kirmizi', home: null, goal: null, face: { tx: 0.7, ty: 0.7 } };
    a.extra[id] = e;
  }
  return e;
}
