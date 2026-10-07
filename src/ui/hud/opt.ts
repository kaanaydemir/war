/**
 * Optional feature APIs. Other features published extra UI helpers in their
 * api.ts beyond the original contract (recruit options, final-assault status,
 * section defence text…). They are accessed through namespace objects and
 * typed locally, so a rename on their side degrades the HUD gracefully
 * (fallback views) instead of breaking the build. Every call is wrapped in safe().
 */
import type { Cost } from '../../core/defs';
import type { CommanderDef } from '../../core/defs';
import type { GameState, OrderType, SectionId, UnitGroup, UnitTypeId } from '../../core/state';
import * as armyApi from '../../features/army/api';
import * as byzApi from '../../features/byzantium/api';
import { safe } from './logic';

export interface RecruitOptionV {
  unit: UnitTypeId;
  label: string;
  desc: string;
  men: number;
  cost: Cost;
  have: number;
  max: number;
  ok: boolean;
  reason?: string;
}

export interface FinalAssaultV {
  phase: string;
  declared: boolean;
  active: boolean;
  wave: number;
  waveName: string | null;
  startsIn: number | null;
  mainSection: SectionId | null;
  mainSectionName: string | null;
  foothold: number;
  canDeclare: boolean;
  reason?: string;
}

export interface AssaultV {
  sectionId: SectionId;
  sectionName: string;
  wave: number;
  attackers: number;
  defenders: number;
  foothold: number;
  ratio: number;
  lost: number;
  defLost: number;
}

export interface TrakyaV {
  ok: boolean;
  reason?: string;
  inProgress: boolean;
  daysLeft: number;
  done: boolean;
  cost: Cost;
  days: number;
}

type ArmyOpt = Partial<{
  recruitOptions(s: GameState): RecruitOptionV[];
  sultanVisitStatus(s: GameState): { ok: boolean; reason?: string; readyIn: number };
  finalAssaultStatus(s: GameState): FinalAssaultV;
  canOrder(s: GameState, g: UnitGroup, type: OrderType): string | null;
  commanderOf(g: UnitGroup): CommanderDef | null;
  awayReason(s: GameState, g: UnitGroup): string | null;
  assaultAt(s: GameState, id: SectionId): AssaultV | null;
  trakyaStatus(s: GameState): TrakyaV;
}>;

type ByzOpt = Partial<{
  sectionDefenseText(s: GameState, id: SectionId): string;
  lastNightRepairs(s: GameState): { sectionId: SectionId; name: string; amount: number }[];
}>;

const A = armyApi as unknown as ArmyOpt;
const B = byzApi as unknown as ByzOpt;

export const opt = {
  recruitOptions: (s: GameState) => safe(() => A.recruitOptions?.(s) ?? null, null),
  sultanVisit: (s: GameState) => safe(() => A.sultanVisitStatus?.(s) ?? null, null),
  finalAssault: (s: GameState) => safe(() => A.finalAssaultStatus?.(s) ?? null, null),
  canOrder: (s: GameState, g: UnitGroup, t: OrderType) => safe(() => A.canOrder?.(s, g, t) ?? null, null),
  commanderOf: (g: UnitGroup) => safe(() => A.commanderOf?.(g) ?? null, null),
  awayReason: (s: GameState, g: UnitGroup) => safe(() => A.awayReason?.(s, g) ?? null, null),
  assaultAt: (s: GameState, id: SectionId) => safe(() => A.assaultAt?.(s, id) ?? null, null),
  trakya: (s: GameState) => safe(() => A.trakyaStatus?.(s) ?? null, null),
  sectionDefenseText: (s: GameState, id: SectionId) => safe(() => B.sectionDefenseText?.(s, id) ?? null, null),
};
