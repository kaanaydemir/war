import type { TilePt } from '../../core/iso';
import { featureState, type CannonType, type GameState, type SectionId } from '../../core/state';

/** Artillery-private serializable state (state.features.artillery). Pure — no Phaser. */

/** A stone ball in flight (sim-side; render mirrors it from the bus events). */
export interface Flight {
  cannonId: number;
  type: CannonType;
  from: TilePt;
  to: TilePt;
  /** Sim seconds until impact. */
  t: number;
  /** Total flight time (for render interpolation). */
  total: number;
  sectionId: SectionId | null;
  damage: number;
  hitWall: boolean;
  shipId: number | null;
}

export interface EmplaceJob {
  /** Destination tile of the battery. */
  tx: number;
  ty: number;
  /** 'tasima' = being hauled to the site, 'kazi' = digging in / raising gabions. */
  phase: 'tasima' | 'kazi';
}

export interface ArtilleryState {
  inFlight: Flight[];
  /** Ids of finished guns still waiting in Edirne. */
  atEdirne: number[];
  /** Battery-site jobs keyed by cannon id. */
  emplace: Record<number, EmplaceJob>;
  /** Aim point along the target section (0..1) keyed by cannon id. */
  aim: Record<number, number>;
  /** Remaining iron-hoop repair days keyed by cannon id. */
  repair: Record<number, number>;
  /** Park slot index keyed by cannon id (guns waiting near the camp). */
  park: Record<number, number>;
  /** Integer day index of the last daily reset. */
  lastDay: number;
  /** Already warned the player that powder/balls ran out (reset when restocked). */
  ammoWarned: boolean;
  /** Siege-start auto deployment done. */
  deployed: boolean;
  /** Serial counters for naming new guns. */
  serial: Partial<Record<CannonType, number>>;
}

export function initArtilleryState(): ArtilleryState {
  return {
    inFlight: [],
    atEdirne: [],
    emplace: {},
    aim: {},
    repair: {},
    park: {},
    lastDay: -1,
    ammoWarned: false,
    deployed: false,
    serial: {},
  };
}

export function arty(state: GameState): ArtilleryState {
  return featureState(state, 'artillery', initArtilleryState);
}
