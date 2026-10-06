import type { EventDef } from '../../core/defs';
import type { GameState } from '../../core/state';
import { EVENT_BY_ID } from './data';

/** PUBLIC API of events (owner: events agent). Signatures are a contract. */

export function getEventDef(id: string): EventDef | undefined {
  return EVENT_BY_ID[id];
}

export interface DawnReport {
  day: number;
  lines: { kind: 'bilgi' | 'uyari' | 'basari' | 'kayip' | 'casus'; text: string }[];
}

/** The latest dawn report (siege), or null. */
export function getDawnReport(state: GameState): DawnReport | null {
  return null;
}

export interface Objective {
  id: string;
  text: string;
  done: boolean;
  /** Optional progress 0..1. */
  progress?: number;
  /** Optional camera hint. */
  focus?: { tx: number; ty: number };
}

/** Current goals shown in the HUD ("Görevler"). */
export function currentObjectives(state: GameState): Objective[] {
  return [];
}

export interface Tip {
  id: string;
  title: string;
  text: string;
}

/** Contextual tutorial tips for the current situation. */
export function activeTips(state: GameState): Tip[] {
  return [];
}
