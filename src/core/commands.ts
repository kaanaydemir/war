import type { CannonType, Order, SectionId, UnitTypeId } from './state';

/**
 * Commands are the ONLY way the UI/player input changes the simulation.
 * They are queued and applied at the start of the next sim tick by
 * `Simulation`, which offers each command to every feature's `handleCommand`
 * until one returns true.
 *
 * Feature-specific actions that don't deserve a top-level type can use
 * `{ t: 'ozel', feature, action, payload }`.
 */
export type Command =
  | { t: 'hiz'; speed: 0 | 1 | 2 | 3 }
  | { t: 'insa'; building: string; tx: number; ty: number }
  | { t: 'insa-iptal'; buildingId: number }
  | { t: 'isci-ata'; buildingId: number; workers: number }
  | { t: 'emir'; groupIds: number[]; order: Order }
  | { t: 'top-hedef'; cannonIds: number[]; sectionId: SectionId }
  | { t: 'top-dok'; type: CannonType }
  | { t: 'asker-topla'; unit: UnitTypeId; count: number }
  | { t: 'olay-secim'; eventId: string; choiceId: string }
  | { t: 'olay-kapat'; eventId: string }
  | { t: 'yola-cik' }
  | { t: 'son-hucum' }
  | { t: 'gemileri-karadan' }
  | { t: 'filo-emir'; shipIds: number[]; target: { tx: number; ty: number } }
  | { t: 'lagim-kaz'; sectionId: SectionId; groupId: number }
  | { t: 'kule-insa'; sectionId: SectionId }
  | { t: 'kule-ilerlet'; sectionId: SectionId }
  | { t: 'hendek-doldur'; sectionId: SectionId; groupId: number }
  | { t: 'ozel'; feature: string; action: string; payload?: unknown };

export type CommandType = Command['t'];
