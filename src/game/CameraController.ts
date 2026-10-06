import Phaser from 'phaser';
import { WORLD_PX_H, WORLD_PX_W, ZOOM_LEVELS } from '../core/constants';
import { tileToWorld } from '../core/iso';
import { landmarkTile, type LandmarkId } from '../data/landmarks';

/**
 * Pixel-perfect RTS camera:
 *  - integer zoom levels only (1–4 screen px per art px), wheel zooms toward cursor
 *  - WASD / arrow keys, screen-edge scrolling, right- or middle-drag panning
 *  - focus(tile) with smooth pan, and an "attract" drift for the title screen
 */
export class CameraController {
  private cam: Phaser.Cameras.Scene2D.Camera;
  private keys: Record<string, Phaser.Input.Keyboard.Key> = {};
  private zoomIndex = 2;
  private target: { x: number; y: number } | null = null;
  private dragging = false;
  private dragStart = { x: 0, y: 0, sx: 0, sy: 0 };
  /** True while a right-drag pan happened (InputRouter suppresses the order). */
  rightDragged = false;
  attract = false;
  private attractT = 0;
  edgeScroll = true;

  constructor(private scene: Phaser.Scene) {
    this.cam = scene.cameras.main;
    this.cam.setBounds(0, 0, WORLD_PX_W, WORLD_PX_H);
    this.cam.setRoundPixels(true);
    const kb = scene.input.keyboard!;
    for (const k of ['W', 'A', 'S', 'D', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'Q', 'E']) {
      this.keys[k] = kb.addKey(k, false);
    }
    scene.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      if (this.attract) return;
      this.zoomBy(dy > 0 ? -1 : 1, p.x, p.y);
    });
    scene.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.middleButtonDown() || p.rightButtonDown()) {
        this.dragging = true;
        this.rightDragged = false;
        this.dragStart = { x: p.x, y: p.y, sx: this.cam.scrollX, sy: this.cam.scrollY };
      }
    });
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.dragging) return;
      const dx = p.x - this.dragStart.x;
      const dy = p.y - this.dragStart.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) this.rightDragged = true;
      if (this.rightDragged) {
        this.target = null;
        this.cam.setScroll(this.dragStart.sx - dx / this.cam.zoom, this.dragStart.sy - dy / this.cam.zoom);
      }
    });
    scene.input.on('pointerup', () => {
      this.dragging = false;
    });
    this.setZoom(3);
  }

  get zoom(): number {
    return ZOOM_LEVELS[this.zoomIndex];
  }

  setZoom(z: number, sx?: number, sy?: number): void {
    const idx = Math.max(0, ZOOM_LEVELS.indexOf(z as (typeof ZOOM_LEVELS)[number]));
    this.applyZoomIndex(idx, sx, sy);
  }

  zoomBy(step: number, sx?: number, sy?: number): void {
    this.applyZoomIndex(Phaser.Math.Clamp(this.zoomIndex + step, 0, ZOOM_LEVELS.length - 1), sx, sy);
  }

  private applyZoomIndex(idx: number, sx?: number, sy?: number): void {
    const cam = this.cam;
    const px = sx ?? cam.width / 2;
    const py = sy ?? cam.height / 2;
    const before = cam.getWorldPoint(px, py);
    this.zoomIndex = idx;
    cam.setZoom(ZOOM_LEVELS[idx]);
    cam.preRender();
    const after = cam.getWorldPoint(px, py);
    cam.setScroll(cam.scrollX + (before.x - after.x), cam.scrollY + (before.y - after.y));
  }

  /** Center the camera on a tile (smooth if duration > 0). */
  focusTile(tx: number, ty: number, zoom?: number, duration = 0): void {
    if (zoom) this.setZoom(zoom);
    const w = tileToWorld(tx, ty);
    if (duration <= 0) {
      this.cam.centerOn(w.x, w.y);
      this.target = null;
    } else {
      this.target = { x: w.x, y: w.y };
    }
  }

  focusLandmark(id: LandmarkId, zoom?: number): void {
    const t = landmarkTile(id);
    this.focusTile(t.tx, t.ty, zoom);
  }

  update(dt: number): void {
    const cam = this.cam;
    if (this.attract) {
      this.attractT += dt;
      // slow drift along the land walls and the Golden Horn
      const path: LandmarkId[] = ['yedikule', 'topkapi', 'edirnekapi', 'ayvansaray', 'kasimpasa', 'galataKulesi', 'akropolis', 'ayasofya'];
      const seg = 40; // seconds per leg
      const i = Math.floor(this.attractT / seg) % path.length;
      const f = (this.attractT % seg) / seg;
      const a = landmarkTile(path[i]);
      const b = landmarkTile(path[(i + 1) % path.length]);
      const e = f * f * (3 - 2 * f);
      const w = tileToWorld(a.tx + (b.tx - a.tx) * e, a.ty + (b.ty - a.ty) * e);
      cam.centerOn(w.x, w.y);
      return;
    }
    const speed = (520 * dt) / cam.zoom;
    let vx = 0;
    let vy = 0;
    if (this.keys.A.isDown || this.keys.LEFT.isDown) vx -= 1;
    if (this.keys.D.isDown || this.keys.RIGHT.isDown) vx += 1;
    if (this.keys.W.isDown || this.keys.UP.isDown) vy -= 1;
    if (this.keys.S.isDown || this.keys.DOWN.isDown) vy += 1;
    const p = this.scene.input.activePointer;
    if (this.edgeScroll && p.isDown === false && this.scene.game.hasFocus) {
      const m = 6;
      if (p.x >= 0 && p.x < m) vx -= 1;
      if (p.x > cam.width - m && p.x <= cam.width) vx += 1;
      if (p.y >= 0 && p.y < m) vy -= 1;
      if (p.y > cam.height - m && p.y <= cam.height) vy += 1;
    }
    if (vx || vy) {
      this.target = null;
      cam.setScroll(cam.scrollX + vx * speed, cam.scrollY + vy * speed);
    }
    if (this.target) {
      const c = cam.midPoint;
      const k = Math.min(1, dt * 4);
      const nx = c.x + (this.target.x - c.x) * k;
      const ny = c.y + (this.target.y - c.y) * k;
      cam.centerOn(nx, ny);
      if (Math.hypot(this.target.x - nx, this.target.y - ny) < 1) this.target = null;
    }
  }
}
