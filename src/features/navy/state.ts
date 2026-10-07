import { featureState, type GameState, type Ship } from '../../core/state';
import type { NavyCommanderId } from './data';

/** Private navy state (state.features.navy). JSON-serializable. */

export type ShipRole =
  | 'filo' // Ottoman main fleet (Diplokionion)
  | 'devriye' // Ottoman patrol outside the chain
  | 'hisar' // hazırlık: ferrying materials to Rumeli Hisarı
  | 'halic' // Ottoman ships inside the Golden Horn (after the haul)
  | 'karadan' // queued for / being hauled overland
  | 'liman' // Christian ships at anchor inside the Horn
  | 'yardim' // K5 relief ships
  | 'baskin' // K8 Venetian fire raid
  | 'hacli'; // final Venetian/papal relief fleet

export interface ShipExtra {
  role: ShipRole;
  name?: string;
  flagship?: boolean;
  /** Home anchorage slot. */
  anchor?: { tx: number; ty: number };
  /** Engagement target ship id. */
  targetId?: number;
  /** Swarm slot angle around the target (radians). */
  slot?: number;
  /** Weapon cooldown (sim seconds). */
  cd: number;
  /** Remaining burn time (sim seconds), 0 = not burning. */
  burn: number;
  /** Seconds since sunk (−1 = afloat). */
  sinkT: number;
  /** Overland: 0..1 along the route while status 'karada'. */
  haulT?: number;
  /** Re-path timer (sim seconds). */
  repathT: number;
  /** Patrol waypoint index. */
  wp?: number;
  /** Idle timer for ambient behaviour. */
  idleT?: number;
  /** Manual order: battle AI leaves the ship alone for this many seconds. */
  manualT?: number;
  /** Relief ship has passed the chain. */
  passed?: boolean;
  /** Boarding attempt cooldown. */
  boardCd?: number;
  /** Within fighting range of its target. */
  engaged?: boolean;
  /** Order in the swarm around the target (0..5 alongside, 6+ second line). */
  rank?: number;
}

export type BattleStage = 'yok' | 'yaklasma' | 'savas' | 'bitti';

export interface NavyState {
  /** Siege fleet has been placed / summoned. */
  deployed: boolean;
  commander: NavyCommanderId;
  /** Wind: strength 0..1 and direction (tile-space radians the wind blows TOWARD). */
  wind: { s: number; dir: number; target: number; t: number };
  battle: {
    stage: BattleStage;
    /** Sim seconds since the battle began. */
    t: number;
    /** Calm (becalmed) phase: seconds remaining; −1 = not yet; −2 = over. */
    calm: number;
    reached: number;
    sunkRelief: number;
    sunkOttoman: number;
    reliefIds: number[];
    centroid: { tx: number; ty: number } | null;
    /** Where the Sultan rides into the shallows (land→water). */
    sultan: { tx: number; ty: number; wx: number; wy: number } | null;
    sultanT: number;
    retargetT: number;
  };
  /** Chain lowered for friendly ships: seconds remaining. */
  chainOpen: number;
  overland: {
    stage: 'yok' | 'kizak' | 'cekiliyor' | 'tamam';
    /** Slipway completion 0..1. */
    slipway: number;
    hauled: number;
    total: number;
    queue: number[];
    launchCd: number;
    lastEmit: number;
    workers: number;
    doneDay: number | null;
  };
  bridge: { stage: 'yok' | 'insa' | 'tamam'; progress: number; workers: number };
  raid: { stage: 'yok' | 'yolda' | 'donus' | 'bitti'; warned: boolean; t: number; leadId: number | null; batteryFired: boolean; burned: number };
  reliefFleet: boolean;
  extra: Record<string, ShipExtra>;
}

export function initNavyState(): NavyState {
  return {
    deployed: false,
    commander: 'baltaoglu',
    wind: { s: 0.45, dir: -Math.PI / 2, target: 0.45, t: 0 },
    battle: {
      stage: 'yok',
      t: 0,
      calm: -1,
      reached: 0,
      sunkRelief: 0,
      sunkOttoman: 0,
      reliefIds: [],
      centroid: null,
      sultan: null,
      sultanT: 0,
      retargetT: 0,
    },
    chainOpen: 0,
    overland: { stage: 'yok', slipway: 0, hauled: 0, total: 0, queue: [], launchCd: 0, lastEmit: -1, workers: 0, doneDay: null },
    bridge: { stage: 'yok', progress: 0, workers: 0 },
    raid: { stage: 'yok', warned: false, t: 0, leadId: null, batteryFired: false, burned: 0 },
    reliefFleet: false,
    extra: {},
  };
}

export function navyState(state: GameState): NavyState {
  return featureState(state, 'navy', initNavyState);
}

export function extraOf(state: GameState, ship: Ship): ShipExtra {
  const n = navyState(state);
  let e = n.extra[ship.id];
  if (!e) {
    e = { role: defaultRole(ship), cd: 0, burn: 0, sinkT: ship.status === 'batik' ? 0 : -1, repathT: 0 };
    n.extra[ship.id] = e;
  }
  return e;
}

function defaultRole(ship: Ship): ShipRole {
  if (ship.side === 'osmanli') return 'filo';
  return 'liman';
}
