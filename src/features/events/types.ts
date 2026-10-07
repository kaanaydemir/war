import type { Cost, EventChoiceDef, EventDef } from '../../core/defs';
import type { GameState, Phase } from '../../core/state';
import type { LandmarkId } from '../../data/landmarks';

/**
 * Events feature — extended (private) definition types. `EventDefX` is assignable
 * to the shared `EventDef`, so `EVENTS` can be consumed by anyone through the
 * core contract; the extra fields are used by this feature and its api helpers.
 */

/** Declarative consequences (applied by the engine, summarised on the card). */
export interface Effects {
  /** Ottoman army morale delta (0..100 scale). */
  morale?: number;
  /** Divan delta (+ = war party / Zağanos, − = peace party / Halil). */
  divan?: number;
  /** Relation with Genoese Galata delta. */
  galata?: number;
  /** Byzantine morale delta. */
  byzMorale?: number;
  /** Byzantine food (days) delta. */
  byzFood?: number;
  /** Player intel on the city delta. */
  intel?: number;
  /** Resource gains (+) or costs (−). */
  res?: Cost;
  /** Cross-feature flags to set (core/flags.ts). */
  flags?: Record<string, number | boolean | string>;
  /** Shift the hidden relief arrival by N days (+ = later). */
  relief?: number;
}

export interface EventChoiceX extends EventChoiceDef {
  fx?: Effects;
  /** Resources required to pick this choice (checked & shown as disabled). */
  requires?: Cost;
  /** Extra availability rule. Return a Turkish reason when unavailable. */
  unavailable?: (s: GameState) => string | null;
}

/** Text/image overrides evaluated against the current state (e.g. battle result). */
export interface EventVariant {
  title?: string;
  text?: string;
  tarihte?: string;
  image?: string;
  /** Override pausing. */
  pause?: boolean;
  /** Extra effects applied at fire time for this variant (also shown on the card). */
  fx?: Effects;
}

export interface EventDefX extends EventDef {
  choices?: EventChoiceX[];
  /** Effects applied when the event fires. */
  fireFx?: Effects;
  /** Only fires during these phases (default: any). */
  phases?: Phase[];
  /** Minimum siege day number (Gün N) — relative pacing for siege events. */
  minSiegeDay?: number;
  /** Map location to show ("Haritada göster"). */
  focus?: LandmarkId;
  /** Minor flavour event (not in the design table). */
  minor?: boolean;
  variant?: (s: GameState) => EventVariant | null;
  /**
   * Scenario fast-forward: apply only the persistent, cross-feature consequences
   * (flags) of the HISTORICAL outcome, without morale/resource deltas.
   */
  historical?: (s: GameState) => void;
}

/** Feature-private state (state.features.events). JSON-serializable. */
export interface EventsPriv {
  /** Speed to restore when a pausing card closes (0 = none saved). */
  savedSpeed: 0 | 1 | 2 | 3;
  /** Sim seconds the current non-pausing card has been open. */
  activeAge: number;
  /** Last emitted weather / eclipse (for change detection). */
  weather: { kind: WeatherKind; intensity: number };
  eclipse: boolean;
  /** Free-form per-event outcome notes (e.g. K8: 'uyarildi' | 'baskin'). */
  vars: Record<string, string | number | boolean>;
  dawn: DawnPriv;
  dismissedTips: string[];
}

export type WeatherKind = 'acik' | 'yagmur' | 'dolu' | 'sis' | 'kar';

export interface SectionSnap {
  outer: number;
  inner: number;
  barricade: number;
  breach: number;
  defenders: number;
}

export interface Snapshot {
  day: number;
  sections: Record<string, SectionSnap>;
  ottomanLosses: number;
  byzantineLosses: number;
  shotsFired: number;
  barut: number;
  gulle: number;
  erzak: number;
  shipsLost: number;
  byzMorale: number;
}

export type DawnLineKind = 'bilgi' | 'uyari' | 'basari' | 'kayip' | 'casus';

export interface DawnPriv {
  /** Integer day index of the last compiled report. */
  lastDay: number;
  /** Snapshot taken at the last dawn (losses/ammo since). */
  dawnSnap: Snapshot | null;
  /** Snapshot taken at dusk (overnight repairs). */
  duskSnap: Snapshot | null;
  report: { day: number; lines: { kind: DawnLineKind; text: string }[] } | null;
}

export const FEATURE_ID = 'events';
