import type { SimContext } from './feature';
import type { CannonType, GameState, Phase, ResourceId, ShipType, Side, UnitTypeId } from './state';
import type { RegionId } from './world';

/**
 * Definition (static data) types shared between the owning feature and the UI.
 * Owners: BuildingDef → economy, UnitTypeDef/CommanderDef → army,
 * CannonTypeDef → artillery, ShipTypeDef → navy, EventDef/EncyclopediaEntry → events.
 */
export type Cost = Partial<Record<ResourceId, number>>;

export type BuildingCategory = 'uretim' | 'askeri' | 'ordugah' | 'ozel';

export interface BuildingDef {
  id: string;
  name: string;
  desc: string;
  category: BuildingCategory;
  /** Footprint in tiles [along tx, along ty]. */
  size: [number, number];
  cost: Cost;
  /** Max workers that can be assigned. */
  workersMax: number;
  /** Game days to build with full workers. */
  buildDays: number;
  /** Phases in which the player may place it. */
  phases: Phase[];
  /** Production per game day at full staffing. */
  produces?: Cost;
  /** Consumption per game day at full staffing. */
  consumes?: Cost;
  /** Flags that must be truthy to unlock. */
  requires?: string[];
  /** Allowed regions (omit = any land). */
  regions?: RegionId[];
  /** Must be placed next to this terrain (e.g. 'orman', 'kaya', 'su'). */
  near?: string;
  /** Only one allowed. */
  unique?: boolean;
  /** Texture key for the UI icon. */
  icon: string;
}

export interface UnitTypeDef {
  id: UnitTypeId;
  name: string;
  plural: string;
  desc: string;
  /** Men per group when raised. */
  menPerGroup: number;
  /** Relative combat values (1 = average). */
  attack: number;
  defense: number;
  /** Effectiveness in wall assaults. */
  siege: number;
  /** Map speed in tiles per sim-second. */
  speed: number;
  discipline: number;
  /** Erzak consumed per man per day. */
  upkeep: number;
  /** Cost to raise one group (if recruitable). */
  cost?: Cost;
  icon: string;
}

export interface CommanderDef {
  id: string;
  name: string;
  title: string;
  desc: string;
  /** Divan party, if any. */
  party?: 'baris' | 'savas';
  /** Bonus summary shown in UI. */
  bonusText: string;
  portrait: string;
}

export interface CannonTypeDef {
  id: CannonType;
  name: string;
  desc: string;
  /** Wall damage per hit. */
  damage: number;
  /** Range in tiles. */
  range: number;
  /** Sim seconds between shots. */
  reloadSec: number;
  /** Max shots per game day (Şahi ≈ 7). */
  shotsPerDay: number;
  barutPerShot: number;
  gullePerShot: number;
  castCost: Cost;
  castDays: number;
  crew: number;
  icon: string;
}

export interface ShipTypeDef {
  id: ShipType;
  name: string;
  desc: string;
  side: Side;
  hp: number;
  /** Tiles per sim-second. */
  speed: number;
  /** Relative firepower / boarding strength. */
  power: number;
  /** Tall ships are hard to board from galleys. */
  tall: boolean;
  icon: string;
}

export type EventKind = 'sabit' | 'kosullu' | 'tepkisel' | 'karar';

export interface EventChoiceDef {
  id: string;
  label: string;
  /** Consequence summary shown under the button. */
  desc?: string;
  /** True for the choice made in history. */
  tarihi?: boolean;
}

export interface EventDef {
  id: string;
  /** Design code, e.g. 'H3', 'K7'. */
  code: string;
  title: string;
  /** Historical date label shown on the card, e.g. '22 Nisan 1453'. */
  dateLabel: string;
  kind: EventKind;
  /** Absolute day indices (see core/calendar `d()`). */
  earliestDay?: number;
  latestDay?: number;
  historicalDay?: number;
  /** Card body (Turkish). */
  text: string;
  /** "Tarihte ne oldu?" note. */
  tarihte: string;
  /** Source ids from data/sources.ts. */
  sources: string[];
  /** Miniature illustration texture key (UI). */
  image?: string;
  choices?: EventChoiceDef[];
  /** Pause the game while the card is open (default: true for 'karar'). */
  pause?: boolean;
  /** Trigger condition (checked each tick after earliestDay). */
  condition?: (s: GameState) => boolean;
  /** Applied when the event fires. */
  onFire?: (s: GameState, ctx: SimContext) => void;
  /** Applied when the player picks a choice. */
  onChoice?: (s: GameState, choiceId: string, ctx: SimContext) => void;
}

export type EncyclopediaCategory = 'kisi' | 'yer' | 'olay' | 'silah' | 'kaynak' | 'kavram';

export interface EncyclopediaEntry {
  id: string;
  title: string;
  category: EncyclopediaCategory;
  /** Short subtitle, e.g. 'Osmanlı sadrazamı'. */
  subtitle?: string;
  /** Body paragraphs (Turkish). */
  body: string[];
  sources: string[];
  related?: string[];
  /** Mark uncertain claims for the verification pass. */
  dogrulanacak?: boolean;
}
