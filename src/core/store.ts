import type { Command } from './commands';
import type { GameState } from './state';
import type { PickResult } from './feature';

/**
 * Store: the bridge between the Preact UI and the game.
 *
 * - `state` is the live GameState (mutable, owned by the simulation). The UI must
 *   treat it as READ-ONLY and re-render on `subscribe` notifications (~8 Hz) or
 *   immediately after dispatch.
 * - UI → game: `dispatch(cmd)` (queued, applied next sim tick).
 * - UI-only state (screen, selection, placement mode, open panels) lives in `ui`.
 */
export type Screen = 'yukleniyor' | 'baslik' | 'oyun' | 'son';

export interface Placement {
  building: string;
}

export interface UiState {
  screen: Screen;
  /** Current selection from the map. */
  selection: PickResult[];
  /** Building placement mode (ghost follows cursor). */
  placement: Placement | null;
  /** Hovered tile (for tooltips). */
  hoverTile: { tx: number; ty: number } | null;
  /** Open side panel/modal id (e.g. 'edirne', 'ansiklopedi', 'ayarlar', 'insa'). */
  panel: string | null;
  /** Encyclopedia entry to open. */
  encyclopediaEntry: string | null;
  /** Show the dawn report overlay. */
  showDawnReport: boolean;
  /** Settings */
  settings: { musicVolume: number; sfxVolume: number; autoPauseAtDawn: boolean; showTutorial: boolean };
}

type Listener = () => void;

export class Store {
  state: GameState | null = null;
  ui: UiState = {
    screen: 'yukleniyor',
    selection: [],
    placement: null,
    hoverTile: null,
    panel: null,
    encyclopediaEntry: null,
    showDawnReport: false,
    settings: { musicVolume: 0.6, sfxVolume: 0.8, autoPauseAtDawn: true, showTutorial: true },
  };
  /** Increments on every notify — use as a render key. */
  version = 0;
  private listeners = new Set<Listener>();
  private queue: Command[] = [];
  /** Game-level hooks installed by GameScene (new game, load scenario, camera…). */
  actions: {
    newGame(difficulty: GameState['difficulty']): void;
    loadScenario(name: string): void;
    focusTile(tx: number, ty: number, zoom?: number): void;
    setZoom(z: number): void;
    save(): void;
    load(): boolean;
    hasSave(): boolean;
    toTitle(): void;
  } = {
    newGame() {},
    loadScenario() {},
    focusTile() {},
    setZoom() {},
    save() {},
    load: () => false,
    hasSave: () => false,
    toTitle() {},
  };

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify(): void {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  dispatch(cmd: Command): void {
    this.queue.push(cmd);
    this.notify();
  }

  /** Called by Simulation: take all queued commands. */
  drain(): Command[] {
    const q = this.queue;
    this.queue = [];
    return q;
  }

  setUi(patch: Partial<UiState>): void {
    Object.assign(this.ui, patch);
    this.notify();
  }
}

/** Singleton store shared by game and UI. */
export const store = new Store();
