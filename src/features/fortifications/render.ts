import Phaser from 'phaser';
import { P, hex } from '../../art/palette';
import type { RenderContext } from '../../core/feature';
import type { GameState, SectionId } from '../../core/state';
import { lightLevel } from '../atmosphere/api';
import { sectionAt, sectionCenter, towerPositions } from './api';
import { LINES, SPANS } from './geom';
import { CityRender } from './renderCity';
import { LifeRender } from './renderLife';
import { WallsRender } from './renderWalls';
import { bandFor, lineWorld, type PieceDef } from './wallArt';

/**
 * Orchestrates every fortifications render layer for one GameScene lifetime:
 * walls (pieces + decals), the city, life on the walls, selection outlines,
 * picking, and the crumble/debris reactions to wall events.
 */
export class FortRender {
  walls: WallsRender;
  city: CityRender;
  life: LifeRender;
  private view = new Phaser.Geom.Rectangle();
  private offs: (() => void)[] = [];
  private sel: { key: string; img: Phaser.GameObjects.Image }[] = [];
  private selSec: SectionId | null = null;
  private selHover = false;
  private hoverSec: SectionId | null = null;
  private hoverAcc = 0;
  private t = 0;
  private chipAcc = 0;

  constructor(private rc: RenderContext) {
    const state = rc.getState();
    const t0 = performance.now();
    this.walls = new WallsRender(rc, state);
    const t1 = performance.now();
    this.city = new CityRender(rc, (tx, ty) => this.walls.ground.get(tx, ty));
    const t2 = performance.now();
    this.life = new LifeRender(rc, this.walls);
    (window as unknown as { __fortTiming: unknown }).__fortTiming = { walls: t1 - t0, city: t2 - t1, pieces: this.walls.pieces.length, items: this.city.layout.items.length, ...this.city.timing };

    this.walls.onCrumble = (p, lvl) => this.crumble(p, lvl);
    rc.addPickable({
      pick: (wx, wy) => {
        const hit = this.walls.pick(wx, wy);
        if (hit) return { kind: 'section', id: hit.sec, score: 40 };
        const t = rc.world.toTile(wx, wy);
        const s = sectionAt(t.tx, t.ty, 0.7);
        return s ? { kind: 'section', id: s, score: 46 } : null;
      },
    });
    const W = (t: { tx: number; ty: number }) => rc.world.toWorld(t.tx, t.ty);
    this.offs.push(
      rc.bus.on('wall:damaged', (e) => {
        if (this.chipAcc > 0.6) return;
        this.chipAcc += 0.15;
        const span = SPANS[e.sectionId];
        if (!span) return;
        const t = span.t0 + (span.t1 - span.t0) * (0.25 + Math.random() * 0.5);
        const band = bandFor(span.line, e.layer === 'outer' ? 'dis' : 'ic', t);
        const p = lineWorld(LINES[span.line], t, band.n1, (band.H * 0.6) | 0);
        const g = this.walls.ground.get(...this.tileOf(span.line, t));
        p.y -= g;
        if (!this.near(p.x, p.y)) return;
        const n = Math.min(8, 2 + Math.round(e.amount / 8));
        rc.fx.debris(p.x, p.y, n, Math.random() < 0.3 ? 'tugla' : 'tas');
        rc.fx.dust(p.x, p.y + 4, 0.6 + Math.min(1, e.amount / 40));
      }),
      rc.bus.on('wall:breach', (e) => {
        const c = W(sectionCenter(e.sectionId));
        rc.fx.debris(c.x, c.y - 10, 18, 'tas');
        rc.fx.debris(c.x + 4, c.y - 6, 10, 'tugla');
        for (let k = 0; k < 4; k++) rc.scene.time.delayedCall(k * 140, () => rc.fx.dust(c.x + (Math.random() - 0.5) * 30, c.y + (Math.random() - 0.5) * 8, 2 + Math.random()));
      }),
      rc.bus.on('wall:tower-collapse', (e) => {
        const c = W(e.at);
        rc.fx.debris(c.x, c.y - 26, 22, 'tas');
        rc.fx.debris(c.x, c.y - 18, 12, 'tugla');
        for (let k = 0; k < 5; k++) rc.scene.time.delayedCall(k * 120, () => rc.fx.dust(c.x + (Math.random() - 0.5) * 18, c.y - 4 - k * 4, 1.6 + k * 0.3));
      }),
      rc.bus.on('wall:repaired', (e) => {
        if (Math.random() > 0.15) return;
        const c = W(sectionCenter(e.sectionId));
        if (this.near(c.x, c.y)) rc.fx.dust(c.x + (Math.random() - 0.5) * 20, c.y, 0.5);
      }),
    );
    rc.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
    void towerPositions;
  }

  private tileOf(line: 'kara' | 'deniz' | 'galata', t: number): [number, number] {
    const l = LINES[line];
    const i = Math.min(l.pts.length - 2, Math.max(0, l.cum.findIndex((c) => c > t) - 1));
    const a = l.pts[i];
    const b = l.pts[i + 1];
    const f = (t - l.cum[i]) / (l.cum[i + 1] - l.cum[i] || 1);
    return [a.tx + (b.tx - a.tx) * f, a.ty + (b.ty - a.ty) * f];
  }

  private near(x: number, y: number): boolean {
    const v = this.view;
    return x > v.x - 100 && x < v.right + 100 && y > v.y - 100 && y < v.bottom + 100;
  }

  /** A piece got worse: stone and brick fly, dust rolls down the wall. */
  private crumble(p: PieceDef, lvl: number): void {
    const x = p.wx;
    const y = p.wy - (p.walkZ - p.base) * 0.6;
    if (!this.near(x, y)) return;
    const n = 6 + lvl * 4;
    this.rc.fx.debris(x, y, n, 'tas');
    this.rc.fx.debris(x, y + 2, Math.round(n / 2), 'tugla');
    this.rc.fx.dust(x, p.wy, 1 + lvl * 0.4);
    this.rc.scene.time.delayedCall(220, () => this.rc.fx.dust(x + 6, p.wy + 2, 0.8 + lvl * 0.3));
    if (lvl >= 4) this.rc.fx.shake(0.25, 0.35);
  }

  update(state: GameState, dt: number): void {
    this.t += dt;
    this.chipAcc = Math.max(0, this.chipAcc - dt);
    // worldView is only refreshed in preRender: derive the view from scroll + zoom instead
    const cam = this.rc.scene.cameras.main;
    const vw = cam.width / cam.zoom;
    const vh = cam.height / cam.zoom;
    const vx = cam.scrollX + (cam.width - vw) / 2;
    const vy = cam.scrollY + (cam.height - vh) / 2;
    this.view.setTo(vx - 40, vy - 60, vw + 80, vh + 120);
    const night = Math.max(0, Math.min(1, (0.62 - lightLevel(state)) / 0.45));
    this.walls.update(state, dt, this.view);
    this.city.update(state, dt, this.view, night);
    this.life.update(state, dt, this.view, night);
    this.updateSelection(dt);
  }

  // ───────────────────────────── selection / hover outline ─────────────────────────────

  private updateSelection(dt: number): void {
    const store = this.rc.store;
    const sel = store.ui.selection.find((s) => s.kind === 'section');
    let sec = sel ? String(sel.id) : null;
    let hover = false;
    this.hoverAcc += dt;
    if (this.hoverAcc > 0.1) {
      this.hoverAcc = 0;
      const p = this.rc.scene.input.activePointer;
      const wp = p.positionToCamera(this.rc.scene.cameras.main) as Phaser.Math.Vector2;
      this.hoverSec = store.ui.screen === 'oyun' ? (this.walls.pick(wp.x, wp.y)?.sec ?? null) : null;
    }
    if (!sec && this.hoverSec) {
      sec = this.hoverSec;
      hover = true;
    }
    if (sec !== this.selSec || hover !== this.selHover) {
      for (const s of this.sel) s.img.destroy();
      this.sel = [];
      this.selSec = sec;
      this.selHover = hover;
      if (sec) this.buildOutline(sec);
    }
    if (this.sel.length) {
      const a = hover ? 0.45 + Math.sin(this.t * 5) * 0.12 : 0.65 + Math.sin(this.t * 4.2) * 0.3;
      for (const s of this.sel) s.img.setAlpha(a);
    }
  }

  /** Gold outline around the union of a section's wall pieces (pixel-exact). */
  private buildOutline(sec: SectionId): void {
    const tm = this.rc.scene.textures;
    const pieces = this.walls.pieces.filter((p) => p.def.sec === sec && p.img);
    const data = new Map<PieceDef, ImageData>();
    for (const p of pieces) {
      const tex = tm.get(p.def.key) as Phaser.Textures.CanvasTexture;
      if (!tex || !tex.getContext) continue;
      data.set(p.def, tex.getContext().getImageData(0, 0, p.def.w, p.def.h));
    }
    const solidAt = (wx: number, wy: number): boolean => {
      for (const [d, img] of data) {
        const x = wx - d.ox;
        const y = wy - d.oy;
        if (x < 0 || y < 0 || x >= d.w || y >= d.h) continue;
        if (img.data[(y * d.w + x) * 4 + 3] >= 250) return true;
      }
      return false;
    };
    const gold = hex(P.gold[5]);
    const goldD = hex(P.gold[3]);
    for (const [d, img] of data) {
      const key = `${d.key}-sel`;
      const cv = document.createElement('canvas');
      cv.width = d.w + 2;
      cv.height = d.h + 2;
      const ctx = cv.getContext('2d')!;
      const out = ctx.createImageData(d.w + 2, d.h + 2);
      for (let y = -1; y <= d.h; y++)
        for (let x = -1; x <= d.w; x++) {
          const inside = x >= 0 && y >= 0 && x < d.w && y < d.h && img.data[(y * d.w + x) * 4 + 3] >= 250;
          if (inside) continue;
          const wx = d.ox + x;
          const wy = d.oy + y;
          // ring pixel: next to this piece's structure, and not inside a sibling piece
          let edge = false;
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < d.w && ny < d.h && img.data[(ny * d.w + nx) * 4 + 3] >= 250) edge = true;
          }
          if (!edge || solidAt(wx, wy)) continue;
          const k = ((y + 1) * (d.w + 2) + (x + 1)) * 4;
          const c = (x + y) % 3 === 0 ? goldD : gold;
          out.data[k] = (c >> 16) & 255;
          out.data[k + 1] = (c >> 8) & 255;
          out.data[k + 2] = c & 255;
          out.data[k + 3] = 255;
        }
      ctx.putImageData(out, 0, 0);
      if (tm.exists(key)) tm.remove(key);
      tm.addCanvas(key, cv);
      const im = this.rc.scene.add.image(d.ox - 1, d.oy - 1, key).setOrigin(0, 0).setDepth(d.depth + 0.8);
      this.sel.push({ key, img: im });
    }
  }

  destroy(): void {
    for (const o of this.offs) o();
    for (const s of this.sel) s.img.destroy();
    this.walls.destroy();
    this.city.destroy();
    this.life.destroy();
  }
}
