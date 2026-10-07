import { featureState, type GameState, type SectionId } from '../../core/state';
import type { MineFate, TowerStatus } from './data';

/** Siegeworks private serializable state (state.features.siegeworks). Pure — no Phaser. */

export interface TowerState {
  id: number;
  sectionId: SectionId;
  /** Fraction along the section where the tower stands. */
  t: number;
  /** Distance from the wall line (tiles, outward). */
  dist: number;
  status: TowerStatus;
  /** Construction progress 0..1. */
  progress: number;
  /** Ordered to advance (keeps rolling until the wall / the moat edge). */
  moving: boolean;
  /** Burn progress 0..1 while 'yaniyor'. */
  burn: number;
  /** Absolute day of the last status change. */
  since: number;
}

export interface MineExtra {
  /** Fraction along the section the tunnel heads for. */
  t: number;
  /** Tunnel length (tiles) from the shaft to the wall line. */
  length: number;
  /** Absolute day the tunnel was started. */
  startDay: number;
  /** Byzantine counter-tunnel progress 0..1 (−1 = none yet). */
  counter: number;
  /** Days the counter-tunnel needs. */
  counterDays: number;
  /** How the mine ended (null while alive). */
  fate: MineFate | null;
  /** Absolute day of the fate / of the last status change. */
  fateDay: number;
  /** Absolute day the tunnel reached the wall ('hazir'). */
  readyDay: number;
  /** Absolute day the props were set on fire ('atesl'). */
  fireDay: number;
  /** Fractional casualty accumulator. */
  cas: number;
}

export interface MoatSite {
  /** Effective workers this tick (soldiers + amele), for render/UI. */
  men: number;
  /** Civilian amele lent from the workforce. */
  amele: number;
  /** Fraction along the section where the crews work. */
  t: number;
  /** Fill contributed by the Ottomans so far (visual dumps). */
  dumped: number;
  /** Arrow-volley timer (sim seconds). */
  volley: number;
  /** Fractional amele casualty accumulator. */
  ameleCas: number;
}

export interface SiegeworksState {
  towers: TowerState[];
  mineX: Record<number, MineExtra>;
  moat: Record<SectionId, MoatSite>;
  /** Fractional casualty accumulators per group id. */
  cas: Record<number, number>;
  /** One-shot warnings: key → day shown. */
  warned: Record<string, number>;
  /** Day of the last successful mine per section (assault bonus). */
  mineHit: Record<SectionId, number>;
}

export function initSiegeworksState(): SiegeworksState {
  return { towers: [], mineX: {}, moat: {}, cas: {}, warned: {}, mineHit: {} };
}

export function sw(state: GameState): SiegeworksState {
  return featureState(state, 'siegeworks', initSiegeworksState);
}

export function moatSite(state: GameState, sectionId: SectionId): MoatSite {
  const s = sw(state);
  let m = s.moat[sectionId];
  if (!m) {
    m = { men: 0, amele: 0, t: 0.5, dumped: 0, volley: 0, ameleCas: 0 };
    s.moat[sectionId] = m;
  }
  return m;
}
