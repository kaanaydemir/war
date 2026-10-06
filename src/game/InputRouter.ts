import Phaser from 'phaser';
import type { OrderInput, Pickable, PickResult } from '../core/feature';
import type { GameState } from '../core/state';
import type { Store } from '../core/store';
import type { WorldApi } from '../core/world';
import type { CameraController } from './CameraController';

/**
 * Mouse/keyboard routing for the map:
 *  - left click: select the best pick (or place a building in placement mode)
 *  - left drag: box-select (groups/ships)
 *  - right click (no drag): contextual order → order handlers
 *  - Esc: clear selection/placement · Space: pause/resume · 1/2/3: speed
 */
export class InputRouter {
  pickables: Pickable[] = [];
  orderHandlers: ((input: OrderInput, state: GameState) => boolean)[] = [];
  private down: { x: number; y: number } | null = null;
  /** Current box-select rect in screen px (for rendering), or null. */
  box: { x0: number; y0: number; x1: number; y1: number } | null = null;
  private boxEl: HTMLDivElement;
  private lastSpeed: 1 | 2 | 3 = 1;

  constructor(
    private scene: Phaser.Scene,
    private store: Store,
    private world: WorldApi,
    private camera: CameraController,
    private getState: () => GameState,
  ) {
    scene.input.mouse?.disableContextMenu();
    // Box-select rectangle is drawn in the DOM (camera zoom would scale a Phaser graphic).
    this.boxEl = document.createElement('div');
    this.boxEl.className = 'secim-kutusu';
    this.boxEl.style.display = 'none';
    document.body.appendChild(this.boxEl);
    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.store.ui.screen !== 'oyun') return;
      if (p.leftButtonDown()) this.down = { x: p.x, y: p.y };
    });
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const wp = p.positionToCamera(scene.cameras.main) as Phaser.Math.Vector2;
      const t = world.toTile(wp.x, wp.y);
      const ht = { tx: Math.floor(t.tx), ty: Math.floor(t.ty) };
      const cur = this.store.ui.hoverTile;
      if (!cur || cur.tx !== ht.tx || cur.ty !== ht.ty) this.store.ui.hoverTile = ht;
      if (this.down && p.leftButtonDown()) {
        const dx = p.x - this.down.x;
        const dy = p.y - this.down.y;
        if (Math.abs(dx) + Math.abs(dy) > 5 && !this.store.ui.placement) {
          this.box = { x0: this.down.x, y0: this.down.y, x1: p.x, y1: p.y };
        }
      }
    });
    scene.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (this.store.ui.screen !== 'oyun') return;
      if (p.rightButtonReleased()) {
        if (!this.camera.rightDragged) this.rightClick(p);
        this.camera.rightDragged = false;
        return;
      }
      if (!p.leftButtonReleased() || !this.down) return;
      const box = this.box;
      this.down = null;
      this.box = null;
      if (box) this.boxSelect(box);
      else this.leftClick(p);
    });
    const kb = scene.input.keyboard!;
    kb.on('keydown-ESC', () => this.store.setUi({ selection: [], placement: null, panel: null }));
    kb.on('keydown-SPACE', () => {
      const s = this.getState();
      if (s.time.speed === 0) this.store.dispatch({ t: 'hiz', speed: this.lastSpeed });
      else {
        this.lastSpeed = s.time.speed;
        this.store.dispatch({ t: 'hiz', speed: 0 });
      }
    });
    kb.on('keydown-ONE', () => this.store.dispatch({ t: 'hiz', speed: 1 }));
    kb.on('keydown-TWO', () => this.store.dispatch({ t: 'hiz', speed: 2 }));
    kb.on('keydown-THREE', () => this.store.dispatch({ t: 'hiz', speed: 3 }));
  }

  private worldPoint(p: Phaser.Input.Pointer): { x: number; y: number } {
    const wp = p.positionToCamera(this.scene.cameras.main) as Phaser.Math.Vector2;
    return { x: wp.x, y: wp.y };
  }

  pickAt(wx: number, wy: number): PickResult | null {
    const s = this.getState();
    let best: PickResult | null = null;
    for (const pk of this.pickables) {
      const r = pk.pick(wx, wy, s);
      if (r && (!best || r.score < best.score)) best = r;
    }
    return best;
  }

  private leftClick(p: Phaser.Input.Pointer): void {
    const { x, y } = this.worldPoint(p);
    const placement = this.store.ui.placement;
    if (placement) {
      const t = this.world.toTile(x, y);
      this.store.dispatch({ t: 'insa', building: placement.building, tx: Math.floor(t.tx), ty: Math.floor(t.ty) });
      if (!p.event.shiftKey) this.store.setUi({ placement: null });
      return;
    }
    const hit = this.pickAt(x, y);
    const additive = (p.event as MouseEvent).shiftKey;
    if (!hit) {
      if (!additive) this.store.setUi({ selection: [] });
      return;
    }
    const sel = additive ? [...this.store.ui.selection.filter((s) => !(s.kind === hit.kind && s.id === hit.id)), hit] : [hit];
    this.store.setUi({ selection: sel });
  }

  private boxSelect(box: { x0: number; y0: number; x1: number; y1: number }): void {
    const cam = this.scene.cameras.main;
    const a = cam.getWorldPoint(Math.min(box.x0, box.x1), Math.min(box.y0, box.y1));
    const b = cam.getWorldPoint(Math.max(box.x0, box.x1), Math.max(box.y0, box.y1));
    const s = this.getState();
    const out: PickResult[] = [];
    for (const pk of this.pickables) if (pk.pickRect) out.push(...pk.pickRect(a.x, a.y, b.x, b.y, s));
    this.store.setUi({ selection: out });
  }

  private rightClick(p: Phaser.Input.Pointer): void {
    if (this.store.ui.placement) {
      this.store.setUi({ placement: null });
      return;
    }
    const { x, y } = this.worldPoint(p);
    const t = this.world.toTile(x, y);
    const input: OrderInput = {
      selection: this.store.ui.selection,
      target: this.pickAt(x, y),
      tile: { tx: t.tx, ty: t.ty },
      wx: x,
      wy: y,
    };
    const s = this.getState();
    for (const h of this.orderHandlers) if (h(input, s)) return;
  }

  update(): void {
    const el = this.boxEl;
    if (!this.box) {
      if (el.style.display !== 'none') el.style.display = 'none';
      return;
    }
    const { x0, y0, x1, y1 } = this.box;
    const r = this.scene.game.canvas.getBoundingClientRect();
    el.style.display = 'block';
    el.style.left = `${r.left + Math.min(x0, x1)}px`;
    el.style.top = `${r.top + Math.min(y0, y1)}px`;
    el.style.width = `${Math.abs(x1 - x0)}px`;
    el.style.height = `${Math.abs(y1 - y0)}px`;
  }

  destroy(): void {
    this.boxEl.remove();
  }
}
