import type { Cost } from '../../core/defs';
import { featureState, type GameState } from '../../core/state';
import type { CaravanKind, HisarTowerId } from './data';

/** Private, JSON-serializable economy state (state.features.economy). */
export interface Caravan {
  id: number;
  kind: CaravanKind;
  /** Route in integer tiles (entry from the Edirne road → destination). */
  path: { tx: number; ty: number }[];
  /** Distance travelled along the path, in tiles. */
  dist: number;
  /** Total path length in tiles. */
  len: number;
  cargo: Cost;
  /** Workers travelling with an 'amele' caravan. */
  workers: number;
  /** Number of animals/carts (visual). */
  size: number;
  /** Destination building id (or null = generic depot). */
  destId: number | null;
}

export interface Ledger {
  produced: Cost;
  consumed: Cost;
}

export interface EconState {
  caravans: Caravan[];
  caravanSeq: number;
  nextCaravanDay: number;
  rotation: number;
  campPlaced: boolean;
  seferErzaki: boolean;
  yol: { active: boolean; workers: number };
  dokumhaneLevel: number;
  vergiReadyDay: number;
  ihsanUntil: number;
  ihsanReadyDay: number;
  hisarId: number | null;
  hisarPriority: HisarTowerId | null;
  /** Exponential moving average of erzak consumption per day. */
  erzakPerDay: number;
  starving: boolean;
  unpaid: boolean;
  /** Integer day of the last daily bookkeeping. */
  lastDay: number;
  /** Day → ledger roll-over. */
  today: Ledger;
  yesterday: Ledger;
  /** key → last day a warning was logged (rate-limits log spam). */
  warned: Record<string, number>;
  /** Scenario override for the siege-start provisions (days of consumption). */
  scenarioErzakDays?: number;
}

export function econ(state: GameState): EconState {
  return featureState<EconState>(state, 'economy', () => ({
    caravans: [],
    caravanSeq: 0,
    nextCaravanDay: state.time.day + 1,
    rotation: 0,
    campPlaced: false,
    seferErzaki: false,
    yol: { active: false, workers: 0 },
    dokumhaneLevel: 1,
    vergiReadyDay: 0,
    ihsanUntil: -1,
    ihsanReadyDay: 0,
    hisarId: null,
    hisarPriority: null,
    erzakPerDay: 0,
    starving: false,
    unpaid: false,
    lastDay: Math.floor(state.time.day),
    today: { produced: {}, consumed: {} },
    yesterday: { produced: {}, consumed: {} },
    warned: {},
  }));
}

export function addTo(c: Cost, r: keyof Cost, v: number): void {
  c[r] = (c[r] ?? 0) + v;
}
