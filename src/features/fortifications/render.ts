import Phaser from 'phaser';
import { P, hex } from '../../art/palette';
import type { RenderContext } from '../../core/feature';
import type { GameState, SectionId } from '../../core/state';
import { lightLevel } from '../atmosphere/api';
import { sectionAt, sectionCenter } from './api';
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
  private selVer = -1;
  private selAcc = 0;
  private hoverSec: SectionId | null = null;
  private hoverAcc = 0;
  private t = 0;
  private chipAcc = 0;

  constructor(private rc: RenderContext) {
    const state = rc.getState();
    this.walls = new WallsRender(rc, state);
    this.city = new CityRender(rc, (tx, ty) => this.walls.ground.get(tx, ty));
    this.life = new LifeRender(rc, this.walls);

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
    // rebuild when the target changes, or when its wall textures were re-rendered (crumble)
    const ver = this.walls.texVersion;
    this.selAcc += dt;
    const stale = !!sec && ver !== this.selVer && this.selAcc > 0.5;
    if (sec !== this.selSec || hover !== this.selHover || stale) {
      this.selAcc = 0;
      this.clearOutline();
      this.selSec = sec;
      this.selHover = hover;
      this.selVer = ver;
      if (sec) this.buildOutline(sec);
    }
    if (this.sel.length) {
      const a = hover ? 0.45 + Math.sin(this.t * 5) * 0.12 : 0.65 + Math.sin(this.t * 4.2) * 0.3;
      for (const s of this.sel) s.img.setAlpha(a);
    }
  }

  /**
   * Gold outline around the union of a section's wall pieces (pixel-exact). The union
   * alpha mask is built once in world space, then each piece gets its own ring image at
   * its own depth so the outline still y-sorts with whatever stands in front.
   */
  private buildOutline(sec: SectionId): void {
    const tm = this.rc.scene.textures;
    const items: { d: PieceDef; a: Uint8Array }[] = [];
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const p of this.walls.pieces) {
      if (p.def.sec !== sec || !p.img) continue;
      const a = this.walls.alphaOf(p.def.key);
      if (!a) continue;
      const d = p.def;
      items.push({ d, a });
      x0 = Math.min(x0, d.ox - 1);
      y0 = Math.min(y0, d.oy - 1);
      x1 = Math.max(x1, d.ox + d.w + 1);
      y1 = Math.max(y1, d.oy + d.h + 1);
    }
    if (!items.length) return;
    // union opacity mask of the whole section in world space
    const MW = x1 - x0;
    const MH = y1 - y0;
    const mask = new Uint8Array(MW * MH);
    for (const { d, a } of items)
      for (let y = 0; y < d.h; y++) {
        const row = (d.oy - y0 + y) * MW + (d.ox - x0);
        for (let x = 0; x < d.w; x++) if (a[y * d.w + x]) mask[row + x] = 1;
      }
    // neighbouring sections' masonry: no seam where the wall simply continues
    for (const p of this.walls.pieces) {
      const d = p.def;
      if (d.sec === sec || !p.img || d.ox > x1 || d.ox + d.w < x0 || d.oy > y1 || d.oy + d.h < y0) continue;
      const a = this.walls.alphaOf(d.key);
      if (!a) continue;
      for (let y = Math.max(0, y0 - d.oy); y < Math.min(d.h, y1 - d.oy); y++) {
        const row = (d.oy - y0 + y) * MW + (d.ox - x0);
        for (let x = Math.max(0, x0 - d.ox); x < Math.min(d.w, x1 - d.ox); x++) if (a[y * d.w + x] && !mask[row + x]) mask[row + x] = 2;
      }
    }
    // one ring canvas for the section; each piece shows its own frame of it at its depth
    const key = `fort/secim-${sec}`;
    if (tm.exists(key)) tm.remove(key);
    // Phaser's canvas textures use CPU-backed contexts: uploading them is cheap
    const tex = tm.createCanvas(key, MW, MH)!;
    const ctx = tex.getContext();
    const out = ctx.createImageData(MW, MH);
    const gold = hex(P.gold[5]);
    const goldD = hex(P.gold[3]);
    for (let y = 1; y < MH - 1; y++)
      for (let x = 1; x < MW - 1; x++) {
        const i = y * MW + x;
        if (mask[i] || !(mask[i - 1] === 1 || mask[i + 1] === 1 || mask[i - MW] === 1 || mask[i + MW] === 1)) continue;
        const c = (x + y) % 3 === 0 ? goldD : gold;
        out.data[i * 4] = (c >> 16) & 255;
        out.data[i * 4 + 1] = (c >> 8) & 255;
        out.data[i * 4 + 2] = c & 255;
        out.data[i * 4 + 3] = 255;
      }
    ctx.putImageData(out, 0, 0);
    tex.refresh();
    items.forEach(({ d }, k) => {
      tex.add(k, 0, d.ox - 1 - x0, d.oy - 1 - y0, d.w + 2, d.h + 2);
      const im = this.rc.scene.add.image(d.ox - 1, d.oy - 1, key, k).setOrigin(0, 0).setDepth(d.depth + 0.8);
      this.sel.push({ key, img: im });
    });
  }

  private clearOutline(): void {
    const tm = this.rc.scene.textures;
    for (const s of this.sel) {
      s.img.destroy();
      if (tm.exists(s.key)) tm.remove(s.key);
    }
    this.sel = [];
  }

  destroy(): void {
    for (const o of this.offs) o();
    this.clearOutline();
    this.walls.destroy();
    this.city.destroy();
    this.life.destroy();
  }
}
