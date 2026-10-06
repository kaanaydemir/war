import type Phaser from 'phaser';
import type { Bus } from './bus';
import type { Command } from './commands';
import type { FxApi } from './fx';
import type { Rng } from './rng';
import type { GameState } from './state';
import type { WorldApi } from './world';
import type { TextureGen } from '../art/texture';
import type { Store } from './store';

/**
 * FEATURE CONTRACT
 *
 * The game is built from vertical-slice features (world, fortifications, army…).
 * Each feature lives in src/features/<id>/ and exports a `Feature` object from
 * its index.ts. The game loop calls the hooks below; all are optional.
 *
 * Order of calls each sim tick follows FEATURE_ORDER in game/features.ts.
 */

export type FeatureId =
  | 'world'
  | 'fortifications'
  | 'economy'
  | 'artillery'
  | 'army'
  | 'navy'
  | 'siegeworks'
  | 'byzantium'
  | 'events'
  | 'atmosphere'
  | 'audio';

export interface SimContext {
  /** Sim seconds elapsed this tick (= SIM_STEP). Use for movement/animation-paced logic. */
  dtSec: number;
  /** Game days elapsed this tick (depends on phase). Use for economy/calendar logic. */
  dtDays: number;
  rng: Rng;
  bus: Bus;
  world: WorldApi;
}

/** Things under the mouse that can be selected. */
export type PickKind = 'group' | 'building' | 'cannon' | 'ship' | 'section' | 'mine';
export interface PickResult {
  kind: PickKind;
  id: number | string;
  /** Lower = closer/more specific; router picks the smallest. */
  score: number;
}

export interface Pickable {
  /** Return what is at world-pixel (wx,wy), or null. */
  pick(wx: number, wy: number, state: GameState): PickResult | null;
  /** Optional box selection (world-pixel rect). Only groups/ships should answer. */
  pickRect?(x0: number, y0: number, x1: number, y1: number, state: GameState): PickResult[];
}

export interface OrderInput {
  /** Current selection when the right-click happened. */
  selection: PickResult[];
  /** Target under the cursor (if any). */
  target: PickResult | null;
  tile: { tx: number; ty: number };
  wx: number;
  wy: number;
}

export interface RenderContext {
  scene: Phaser.Scene;
  world: WorldApi;
  fx: FxApi;
  bus: Bus;
  store: Store;
  /** Current state (read-only for render). */
  getState(): GameState;
  /** Register an object provider for mouse picking. */
  addPickable(p: Pickable): void;
  /**
   * Register a right-click order handler. Return true if handled.
   * Handlers are called in registration order with the current selection.
   */
  addOrderHandler(fn: (input: OrderInput, state: GameState) => boolean): void;
}

export type ScenarioName =
  | 'yeni-oyun'
  | 'hisar-insaat'
  | 'kis-hazirlik'
  | 'kusatma-gun1'
  | 'bombardiman'
  | 'gece-onarim'
  | 'deniz-savasi'
  | 'gemiler-karadan'
  | 'lagim'
  | 'kule'
  | 'son-hucum'
  | 'zafer'
  | 'yenilgi';

export interface Feature {
  id: FeatureId;
  /** Generate procedural pixel-art textures/animations (BootScene, once). */
  generateTextures?(gen: TextureGen): void;
  /** Add initial entities/definitions for a new game (pure). */
  initState?(state: GameState, world: WorldApi): void;
  /** Fixed-step simulation (pure; may emit bus events). */
  simTick?(state: GameState, ctx: SimContext): void;
  /** Handle a player command; return true if consumed. */
  handleCommand?(state: GameState, cmd: Command, ctx: SimContext): boolean;
  /** Create render objects for the game scene. */
  createRender?(rc: RenderContext): void;
  /** Per-frame render update. dt = real seconds since last frame. */
  updateRender?(rc: RenderContext, state: GameState, dt: number): void;
  /** Mutate a freshly initialized state into a QA scenario. */
  applyScenario?(name: ScenarioName, state: GameState, world: WorldApi): void;
}
