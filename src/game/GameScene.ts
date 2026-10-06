import Phaser from 'phaser';
import { Bus } from '../core/bus';
import { dayFrac } from '../core/calendar';
import type { RenderContext, ScenarioName } from '../core/feature';
import { createFxProxy, type FxProxy } from '../core/fx';
import type { Difficulty, GameState } from '../core/state';
import { store } from '../core/store';
import type { WorldApi } from '../core/world';
import { createWorld } from '../features/world/terrain';
import { landmarkTile, LANDMARKS, type LandmarkId } from '../data/landmarks';
import { CameraController } from './CameraController';
import { FEATURES } from './features';
import { InputRouter } from './InputRouter';
import { buildState, scenarioCamera, SCENARIOS } from './scenarios';
import { Simulation } from './Simulation';

const SAVE_KEY = 'istanbulun-fethi:kayit';

/** World data is pure and expensive to rasterize: build once per page load. */
let WORLD: WorldApi | null = null;
export function getWorld(): WorldApi {
  if (!WORLD) WORLD = createWorld();
  return WORLD;
}

/** Pending request for the next GameScene.create() (new game / scenario / load). */
let pending: { state: GameState; camera?: { tx: number; ty: number; zoom: number }; attract?: boolean } | null = null;

/**
 * The single gameplay scene. Owns world, bus, FX proxy, simulation, camera and input,
 * and drives every feature's render hooks. Starting a new game/scenario restarts the
 * scene so every feature rebuilds its render objects from the new state.
 */
export class GameScene extends Phaser.Scene {
  world!: WorldApi;
  bus!: Bus;
  fx!: FxProxy;
  sim!: Simulation;
  camera!: CameraController;
  router!: InputRouter;
  rc!: RenderContext;

  constructor() {
    super('game');
  }

  get state(): GameState {
    return this.sim.state;
  }

  create(): void {
    this.world = getWorld();
    this.bus = new Bus();
    this.fx = createFxProxy();
    const params = new URLSearchParams(location.search);

    let req = pending;
    pending = null;
    if (!req) {
      // First boot: URL scenario (QA) or title-screen attract mode.
      const scen = params.get('scenario') as ScenarioName | null;
      if (scen && SCENARIOS[scen]) {
        req = { state: buildState(scen, 'normal', 1453, this.world, FEATURES), camera: scenarioCamera(scen) };
        store.ui.screen = 'oyun';
      } else {
        const s = buildState('bombardiman', 'normal', 29, this.world, FEATURES);
        s.time.day = Math.floor(s.time.day) + 0.62; // golden-hour dusk for the title
        s.time.speed = 1;
        req = { state: s, attract: true };
        store.ui.screen = 'baslik';
      }
    }
    const state = req.state;
    // URL overrides for QA screenshots
    const tf = params.get('t');
    if (tf != null) state.time.day = Math.floor(state.time.day) + Number(tf);
    const sp = params.get('speed');
    if (sp != null) state.time.speed = Number(sp) as 0 | 1 | 2 | 3;

    store.state = state;
    store.bus = this.bus;
    store.busVersion++;
    this.sim = new Simulation(state, FEATURES, this.bus, this.world, store);
    this.camera = new CameraController(this);
    this.camera.attract = !!req.attract;
    this.router = new InputRouter(this, store, this.world, this.camera, () => this.sim.state);

    this.rc = {
      scene: this,
      world: this.world,
      fx: this.fx,
      bus: this.bus,
      store,
      getState: () => this.sim.state,
      addPickable: (p) => this.router.pickables.push(p),
      addOrderHandler: (fn) => this.router.orderHandlers.push(fn),
    };

    // Atmosphere first: it installs the real FX implementation.
    const ordered = [...FEATURES].sort((a, b) => (a.id === 'atmosphere' ? -1 : b.id === 'atmosphere' ? 1 : 0));
    for (const f of ordered) {
      try {
        f.createRender?.(this.rc);
      } catch (err) {
        console.error(`[render] ${f.id}.createRender failed`, err);
      }
    }

    // Camera placement
    const lm = params.get('lm') as LandmarkId | null;
    const z = params.get('zoom');
    if (lm && LANDMARKS[lm]) {
      const t = landmarkTile(lm);
      this.camera.focusTile(t.tx, t.ty, z ? Number(z) : req.camera?.zoom ?? 3);
    } else if (req.camera) {
      this.camera.focusTile(req.camera.tx, req.camera.ty, z ? Number(z) : req.camera.zoom);
    } else {
      this.camera.focusLandmark('topkapi', z ? Number(z) : 2);
    }

    this.bus.on('camera:focus', (e) => this.camera.focusTile(e.tx, e.ty, e.zoom, e.duration ?? 0.6));
    this.bus.on('outcome', () => store.setUi({ screen: 'son', selection: [], placement: null }));

    this.installActions();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.router.destroy();
      this.bus.clear();
    });
    if (params.get('ui') === '0') document.body.classList.add('ui-gizli');
    store.notify();
    (window as any).__game = {
      scene: this,
      store,
      tick: (n = 1) => {
        for (let i = 0; i < n; i++) this.sim.tick();
      },
      setDayFrac: (f: number) => {
        this.sim.state.time.day = Math.floor(this.sim.state.time.day) + f;
      },
      dayFrac: () => dayFrac(this.sim.state.time.day),
    };
    (window as any).__ready = true;
  }

  private restartWith(state: GameState, camera?: { tx: number; ty: number; zoom: number }, attract = false): void {
    pending = { state, camera, attract };
    store.setUi({ selection: [], placement: null, panel: null, showDawnReport: false });
    this.scene.restart();
  }

  private installActions(): void {
    store.actions = {
      newGame: (difficulty: Difficulty) => {
        const s = buildState('yeni-oyun', difficulty, Math.floor(Math.random() * 1e9), this.world, FEATURES);
        store.ui.screen = 'oyun';
        this.restartWith(s, scenarioCamera('yeni-oyun'));
      },
      loadScenario: (name: string) => {
        const n = name as ScenarioName;
        if (!SCENARIOS[n]) return;
        const s = buildState(n, 'normal', 1453, this.world, FEATURES);
        store.ui.screen = s.outcome ? 'son' : 'oyun';
        this.restartWith(s, scenarioCamera(n));
      },
      focusTile: (tx, ty, zoom) => this.camera.focusTile(tx, ty, zoom, 0.5),
      setZoom: (zz) => this.camera.setZoom(zz),
      save: () => {
        try {
          localStorage.setItem(SAVE_KEY, JSON.stringify(this.sim.state));
        } catch (err) {
          console.error('save failed', err);
        }
      },
      load: () => {
        try {
          const raw = localStorage.getItem(SAVE_KEY);
          if (!raw) return false;
          const s = JSON.parse(raw) as GameState;
          s.time.speed = 0;
          store.ui.screen = 'oyun';
          this.restartWith(s);
          return true;
        } catch {
          return false;
        }
      },
      hasSave: () => {
        try {
          return !!localStorage.getItem(SAVE_KEY);
        } catch {
          return false;
        }
      },
      getCameraView: () => {
        const v = this.cameras.main.worldView;
        return { x: v.x, y: v.y, w: v.width, h: v.height, zoom: this.cameras.main.zoom };
      },
      toTitle: () => {
        const s = buildState('bombardiman', 'normal', 29, this.world, FEATURES);
        s.time.day = Math.floor(s.time.day) + 0.62;
        s.time.speed = 1;
        store.ui.screen = 'baslik';
        this.restartWith(s, undefined, true);
      },
    };
  }

  update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 0.1);
    this.sim.update(dt);
    const s = this.sim.state;
    for (const f of FEATURES) {
      if (!f.updateRender) continue;
      try {
        f.updateRender(this.rc, s, dt);
      } catch (err) {
        console.error(`[render] ${f.id}.updateRender failed`, err);
      }
    }
    this.camera.update(dt);
    this.router.update();
  }
}
