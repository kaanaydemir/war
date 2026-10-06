/**
 * GameState — the single serializable source of truth for the simulation.
 *
 * CONTRACT: Shared entities that several features touch live here. Each feature
 * may keep PRIVATE state under `state.features[featureId]` (its own interface,
 * accessed via a typed getter inside the feature). Rendering never mutates state;
 * the UI mutates it only by dispatching Commands.
 *
 * Everything must stay JSON-serializable (no class instances, no Phaser objects).
 */

export type Difficulty = 'kolay' | 'normal' | 'zor';

/** hazirlik: 1452 preparation · yuruyus: march from Edirne · kusatma: siege · bitti: game over */
export type Phase = 'hazirlik' | 'yuruyus' | 'kusatma' | 'bitti';

export interface TimeState {
  /** Absolute day index (fractional). 0 = 1 Mart 1452; fraction 0 = start of dawn. */
  day: number;
  phase: Phase;
  /** 0 = paused. */
  speed: 0 | 1 | 2 | 3;
  /** Extra multiplier for QA / debug (1 in normal play). */
  debugSpeed: number;
  marchStartDay: number | null;
  siegeStartDay: number | null;
  autoPauseAtDawn: boolean;
}

export type ResourceId =
  | 'akce' // money
  | 'tas' // stone
  | 'kereste' // timber
  | 'maden' // copper + tin ore
  | 'tunc' // bronze (from foundry)
  | 'barut' // gunpowder
  | 'gulle' // carved stone cannonballs
  | 'erzak' // provisions (person-days)
  | 'yag'; // grease/tallow (ship slipways)

export type Resources = Record<ResourceId, number>;

export const RESOURCE_IDS: ResourceId[] = ['akce', 'tas', 'kereste', 'maden', 'tunc', 'barut', 'gulle', 'erzak', 'yag'];

export const RESOURCE_ADI: Record<ResourceId, string> = {
  akce: 'Akçe',
  tas: 'Taş',
  kereste: 'Kereste',
  maden: 'Maden',
  tunc: 'Tunç',
  barut: 'Barut',
  gulle: 'Gülle',
  erzak: 'Erzak',
  yag: 'Yağ',
};

export interface Workforce {
  /** Total civilian workers (amele, taşçı, marangoz…). */
  total: number;
  /** Workers currently assigned to buildings/projects. */
  assigned: number;
}

export type Side = 'osmanli' | 'bizans' | 'ceneviz' | 'venedik';

// ───────────────────────────── Walls ─────────────────────────────

export type SectionId = string;
export type SectionKind = 'kara' | 'halic' | 'marmara';

export interface WallSection {
  id: SectionId;
  name: string;
  kind: SectionKind;
  /** Outer wall (land walls only; sea walls use only `inner`). */
  outer: number;
  outerMax: number;
  /** Inner (main) wall. */
  inner: number;
  innerMax: number;
  /** Moat filled fraction 0..1 (land walls only). */
  moatFill: number;
  /** Temporary night stockade/barricade strength 0..1 plugging breaches. */
  barricade: number;
  /** Derived openness 0..1 (0 = intact, 1 = wide breach). Recomputed by fortifications. */
  breach: number;
  /** Byzantine defenders currently assigned to this section. */
  defenders: number;
  /** Byzantine AI threat estimate 0..100. */
  threat: number;
  /** Visual: number of destroyed towers in this section. */
  towersDown: number;
}

// ───────────────────────────── Military ─────────────────────────────

export type UnitTypeId =
  | 'yeniceri'
  | 'azap'
  | 'sipahi'
  | 'basibozuk'
  | 'akinci'
  | 'topcu'
  | 'lagimci'
  | 'mehter';

export type OrderType =
  | 'bekle'
  | 'git'
  | 'konuslan'
  | 'bombardimani-koru'
  | 'hendek-doldur'
  | 'kuleyi-ilerlet'
  | 'lagim-kaz'
  | 'hucum'
  | 'geri-cekil'
  | 'kesif'
  | 'ikmal-koru'
  | 'dinlen';

export interface Order {
  type: OrderType;
  target?: { tx: number; ty: number };
  sectionId?: SectionId;
  entityId?: number;
}

export type GroupStatus = 'bosta' | 'yuruyor' | 'calisiyor' | 'savasiyor' | 'cekiliyor' | 'dagildi' | 'uzakta';

export interface UnitGroup {
  id: number;
  type: UnitTypeId;
  /** Display name, e.g. "Rumeli Sipahileri I". */
  name: string;
  commanderId: string | null;
  men: number;
  maxMen: number;
  /** 0..100 */
  morale: number;
  /** 0..100 (100 = exhausted) */
  fatigue: number;
  /** 0..100 */
  xp: number;
  /** Fractional tile position. */
  tx: number;
  ty: number;
  path: { tx: number; ty: number }[];
  order: Order;
  status: GroupStatus;
  /** 1 = facing screen-right, -1 = screen-left. */
  facing: 1 | -1;
}

export type CannonType = 'sahi' | 'buyuk' | 'orta' | 'kucuk' | 'havan';
export type CannonStatus = 'dokuluyor' | 'yolda' | 'mevzileniyor' | 'hazir' | 'soguyor' | 'kirik';

export interface Cannon {
  id: number;
  type: CannonType;
  name: string;
  tx: number;
  ty: number;
  status: CannonStatus;
  targetSection: SectionId | null;
  /** Seconds (sim) until it can fire again. */
  cooldown: number;
  shotsToday: number;
  /** 0..1 progress of the current multi-step job (casting, transport, emplacing). */
  progress: number;
  /** Barrel heat 0..1 (Şahi must cool between shots). */
  heat: number;
  /** Transport path while 'yolda'. */
  path: { tx: number; ty: number }[];
}

export type ShipType =
  | 'kadirga' // Ottoman galley
  | 'kalyete' // smaller galley
  | 'fusta' // light galley
  | 'parandarya' // transport
  | 'ceneviz-gemisi' // tall Genoese merchant ship (carrack)
  | 'bizans-gemisi' // Byzantine transport
  | 'venedik-kadirgasi'; // Venetian galley

export type ShipStatus = 'demirli' | 'seyir' | 'savas' | 'karada' | 'batik' | 'yaniyor';

export interface Ship {
  id: number;
  type: ShipType;
  side: Side;
  tx: number;
  ty: number;
  /** Heading in radians in TILE space (0 = +tx/east). */
  heading: number;
  hp: number;
  hpMax: number;
  status: ShipStatus;
  path: { tx: number; ty: number }[];
}

export interface Mine {
  id: number;
  sectionId: SectionId;
  /** Entrance tile (Ottoman side). */
  tx: number;
  ty: number;
  progress: number; // 0..1
  detected: boolean;
  status: 'kaziliyor' | 'hazir' | 'cokertildi' | 'atesl' | 'basarili';
  groupId: number | null;
}

// ───────────────────────────── Buildings ─────────────────────────────

export interface Building {
  id: number;
  /** Key into the economy building definitions (e.g. 'tas-ocagi', 'otag'). */
  type: string;
  tx: number;
  ty: number;
  /** Construction progress 0..1. */
  progress: number;
  built: boolean;
  workers: number;
  hp: number;
  owner: Side;
  /** Free-form per-type data (production timers, stage, etc.). */
  data: Record<string, number | string | boolean>;
}

// ───────────────────────────── Byzantium / politics ─────────────────────────────

export interface ByzantineState {
  /** Total fighting defenders (historically ≈ 7,000). */
  defenders: number;
  /** Unassigned reserve. */
  reserves: number;
  /** 0..100 */
  morale: number;
  /** Days of food left in the city. */
  food: number;
  /** Civilian repair labour capacity (people). */
  repairCrews: number;
  /** Player's knowledge of the inside 0..100 (spies, deserters, Galata). */
  intel: number;
  /** Player-visible estimate of total defenders. */
  estimatedDefenders: number;
  giustinianiWounded: boolean;
  emperorAlive: boolean;
}

export interface ReliefState {
  /** Hidden true arrival day (absolute day index). */
  arrival: number;
  /** Player-visible estimate window (absolute day indices). Narrows with intel. */
  knownMin: number;
  knownMax: number;
  arrived: boolean;
  /** Human-readable modifiers applied (for UI tooltip). */
  notes: string[];
}

export interface PendingCard {
  eventId: string;
  firedDay: number;
}

export interface EventsState {
  /** eventId → day it fired. */
  fired: Record<string, number>;
  /** Cards waiting to be shown to the player (FIFO). */
  queue: PendingCard[];
  /** Card currently displayed (game auto-pauses while a 'karar' card is open). */
  active: PendingCard | null;
  /** eventId → chosen choice id. */
  choices: Record<string, string>;
}

export type LogKind = 'bilgi' | 'uyari' | 'basari' | 'kayip' | 'casus' | 'olay';

export interface LogEntry {
  day: number;
  kind: LogKind;
  text: string;
}

export interface Stats {
  ottomanLosses: number;
  byzantineLosses: number;
  shotsFired: number;
  breaches: number;
  assaults: number;
  shipsLost: number;
}

export type OutcomeResult = 'zafer' | 'yenilgi-hacli' | 'yenilgi-divan';

export interface Outcome {
  result: OutcomeResult;
  day: number;
  siegeDays: number | null;
}

export interface GameState {
  version: 1;
  seed: number;
  rngState: number;
  difficulty: Difficulty;
  /** Monotonic id counter for entities (use nextId()). */
  idSeq: number;
  time: TimeState;
  resources: Resources;
  workforce: Workforce;
  /** Ottoman army morale 0..100. */
  morale: number;
  /** Divan balance −100 (peace party, Halil Paşa) .. +100 (war party, Zağanos Paşa). */
  divan: number;
  /** Relation with Genoese Galata −100..100. */
  galata: number;
  relief: ReliefState;
  byz: ByzantineState;
  sections: Record<SectionId, WallSection>;
  buildings: Building[];
  groups: UnitGroup[];
  cannons: Cannon[];
  ships: Ship[];
  mines: Mine[];
  events: EventsState;
  /** Cross-feature progression flags — see core/flags.ts. */
  flags: Record<string, number | boolean | string>;
  log: LogEntry[];
  stats: Stats;
  outcome: Outcome | null;
  /** Private per-feature state (feature id → its own serializable object). */
  features: Record<string, unknown>;
}

export function nextId(state: GameState): number {
  state.idSeq += 1;
  return state.idSeq;
}

export function addLog(state: GameState, kind: LogKind, text: string): void {
  state.log.push({ day: state.time.day, kind, text });
  if (state.log.length > 400) state.log.splice(0, state.log.length - 400);
}

/** Typed accessor for a feature's private state, creating it with `init` if missing. */
export function featureState<T>(state: GameState, id: string, init: () => T): T {
  let s = state.features[id] as T | undefined;
  if (s === undefined) {
    s = init();
    state.features[id] = s;
  }
  return s;
}
