import type { CannonType, LogEntry, Outcome, Phase, SectionId, ShipType } from './state';
import type { DaySegment } from './calendar';

/**
 * Typed event bus. The SIMULATION emits events describing what happened;
 * render/FX/audio/UI listen and react. Listeners must never mutate GameState.
 *
 * Add new events here (contract). Positions are in TILE coordinates.
 */
export interface GameEvents {
  // time
  'time:segment': { segment: DaySegment; day: number };
  'time:dawn': { day: number };
  'phase:changed': { phase: Phase };

  // artillery
  'cannon:fire': { cannonId: number; type: CannonType; from: { tx: number; ty: number }; to: { tx: number; ty: number }; sectionId: SectionId | null };
  'cannon:impact': { cannonId: number; type: CannonType; at: { tx: number; ty: number }; sectionId: SectionId | null; damage: number; hitWall: boolean };
  'cannon:arrived': { cannonId: number; type: CannonType };
  'cannon:cracked': { cannonId: number };

  // walls
  'wall:damaged': { sectionId: SectionId; amount: number; layer: 'outer' | 'inner' };
  'wall:breach': { sectionId: SectionId };
  'wall:repaired': { sectionId: SectionId; amount: number };
  'wall:tower-collapse': { sectionId: SectionId; at: { tx: number; ty: number } };

  // army
  'group:order': { groupId: number };
  'group:arrived': { groupId: number };
  'group:casualties': { groupId: number; count: number; at: { tx: number; ty: number } };
  'group:routed': { groupId: number };
  'assault:start': { sectionId: SectionId; groupIds: number[]; wave: number };
  'assault:clash': { sectionId: SectionId; at: { tx: number; ty: number }; intensity: number };
  'assault:end': { sectionId: SectionId; success: boolean };
  'arrows:volley': { from: { tx: number; ty: number }; to: { tx: number; ty: number }; count: number; side: 'osmanli' | 'bizans' };
  'mehter:play': { playing: boolean };
  'banner:planted': { at: { tx: number; ty: number } };

  // siegeworks
  'mine:started': { mineId: number; sectionId: SectionId };
  'mine:detected': { mineId: number; sectionId: SectionId };
  'mine:collapsed': { mineId: number; sectionId: SectionId; at: { tx: number; ty: number } };
  'mine:success': { mineId: number; sectionId: SectionId };
  'tower:built': { sectionId: SectionId };
  'tower:burned': { sectionId: SectionId; at: { tx: number; ty: number } };
  'sortie': { sectionId: SectionId; at: { tx: number; ty: number } };
  'greekfire': { at: { tx: number; ty: number } };

  // navy
  'ship:fire': { shipId: number; from: { tx: number; ty: number }; to: { tx: number; ty: number } };
  'ship:hit': { shipId: number; at: { tx: number; ty: number } };
  'ship:sunk': { shipId: number; type: ShipType; at: { tx: number; ty: number } };
  'ship:burning': { shipId: number; at: { tx: number; ty: number } };
  'naval:battle': { started: boolean };
  'overland:progress': { progress: number };
  'overland:done': {};

  // economy / construction
  'building:placed': { id: number; type: string };
  'building:complete': { id: number; type: string; at: { tx: number; ty: number } };
  'construction:tick': { id: number; at: { tx: number; ty: number } };
  'caravan:arrived': { what: string };

  // events & narrative
  'event:fired': { eventId: string };
  'event:resolved': { eventId: string; choiceId: string | null };
  'eclipse': { active: boolean };
  'weather': { kind: 'acik' | 'yagmur' | 'dolu' | 'sis' | 'kar'; intensity: number };

  // meta
  'log': LogEntry;
  'notify': { text: string; kind: 'bilgi' | 'uyari' | 'basari' | 'tehlike' };
  'outcome': Outcome;
  'camera:focus': { tx: number; ty: number; zoom?: number; duration?: number };
  'camera:shake': { intensity: number; duration: number };
}

export type EventName = keyof GameEvents;
type Handler<K extends EventName> = (payload: GameEvents[K]) => void;

export class Bus {
  private handlers = new Map<EventName, Set<Handler<any>>>();

  on<K extends EventName>(name: K, fn: Handler<K>): () => void {
    let set = this.handlers.get(name);
    if (!set) {
      set = new Set();
      this.handlers.set(name, set);
    }
    set.add(fn);
    return () => set!.delete(fn);
  }

  emit<K extends EventName>(name: K, payload: GameEvents[K]): void {
    const set = this.handlers.get(name);
    if (!set) return;
    for (const fn of set) {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[bus] handler for ${name} failed`, err);
      }
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}
