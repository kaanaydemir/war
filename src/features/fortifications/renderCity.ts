import Phaser from 'phaser';
import type { RenderContext } from '../../core/feature';
import type { LoopHandle } from '../../core/fx';
import { DEPTH } from '../../core/layers';
import { hash2 } from '../../core/rng';
import type { GameState } from '../../core/state';
import { geoToTile } from '../../data/geography';
import { CISTERNS, layoutCity, type CityItem, type CityLayout } from './city';
import { CISTERN_SPECS, LANDMARKS, SHEETS, valensPieces, type SheetSpec } from './cityArt';
import { LINES, nearestOnLine, offsetAt } from './geom';
import { Box } from './prims';
import { projBounds, renderScene, Scene, type Prim } from './raster';
import { PROJ_OX, PROJ_OY } from './wallArt';

/**
 * The city inside the walls (and Galata): y-sorted house / church / tree sprites
 * from baked sheets, landmarks, the Valens aqueduct, plus life — townsfolk walking
 * the lanes, chimney smoke, laundry, pigeons and storks, and warm windows at night.
 * Everything is culled to the camera view.
 */

interface Obj {
  img: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;
  x: number;
  y: number;
  r: number;
  glow?: Phaser.GameObjects.Image;
  glowKey?: string;
  glowFrame?: number;
  sway?: { base: number; alt: number; phase: number };
  anim?: string;
  chimney?: { x: number; y: number };
}

interface Walker {
  spr: Phaser.GameObjects.Sprite;
  cluster: number;
  tx: number;
  ty: number;
  gx: number;
  gy: number;
  wait: number;
  active: boolean;
}

const SHEET_OF: Partial<Record<CityItem['kind'], SheetSpec>> = {
  ev: SHEETS.ev,
  'ev-galata': SHEETS.evGalata,
  kilise: SHEETS.kilise,
  manastir: SHEETS.manastir,
  harabe: SHEETS.harabe,
  kuyu: SHEETS.kuyu,
};

const TREE: Partial<Record<CityItem['kind'], { key: string; w: number; h: number; n: number }>> = {
  agac: { key: 'city/agac', w: 13, h: 16, n: 3 },
  servi: { key: 'city/servi', w: 7, h: 20, n: 2 },
  zeytin: { key: 'city/zeytin', w: 13, h: 12, n: 3 },
  bag: { key: 'city/bag', w: 18, h: 12, n: 2 },
};

export class CityRender {
  layout: CityLayout;
  private objs: Obj[] = [];
  private walkers: Walker[] = [];
  private smokes: { obj: Obj; h: LoopHandle }[] = [];
  private t = 0;
  private swayAcc = 0;
  private smokeAcc = 0;
  private night = 0;
  timing: Record<string, number> = {};

  constructor(
    private rc: RenderContext,
    ground: (tx: number, ty: number) => number,
  ) {
    const scene = rc.scene;
    const w = rc.world;
    const T0 = performance.now();
    this.layout = layoutCity(w);
    this.timing.layout = performance.now() - T0;
    for (const it of this.layout.items) {
      const p = w.toWorld(it.tx, it.ty);
      const sh = SHEET_OF[it.kind];
      if (sh) {
        const frame = it.v % sh.n;
        const img = scene.add.image(Math.round(p.x), Math.round(p.y), sh.key, frame).setOrigin(sh.ax / sh.fw, sh.ay / sh.fh).setDepth(p.y);
        img.setFlipX(false);
        const o: Obj = { img, x: p.x, y: p.y, r: sh.fw };
        if (scene.textures.exists(sh.key + '-isik')) {
          o.glowKey = sh.key + '-isik';
          o.glowFrame = frame;
        }
        if ((it.kind === 'ev' || it.kind === 'ev-galata') && hash2(Math.round(it.tx * 10), Math.round(it.ty * 10), 5) < 0.14) o.chimney = { x: p.x + 4, y: p.y - 20 };
        this.objs.push(o);
        this.decorate(it, p.x, p.y);
        continue;
      }
      const tr = TREE[it.kind];
      if (tr) {
        const v = it.v % tr.n;
        const img = scene.add.image(Math.round(p.x), Math.round(p.y) + 1, tr.key, v).setOrigin(0.5, 1).setDepth(p.y).setFlipX(it.flip);
        this.objs.push({ img, x: p.x, y: p.y, r: tr.w, sway: { base: v, alt: v + tr.n, phase: hash2(Math.round(it.tx * 3), Math.round(it.ty * 3), 9) } });
        continue;
      }
      if (it.kind === 'landmark' && it.lm && LANDMARKS[it.lm]) {
        const lm = LANDMARKS[it.lm];
        const img = scene.add.image(Math.round(p.x), Math.round(p.y), lm.key).setOrigin(lm.ax / lm.w, lm.ay / lm.h).setDepth(p.y + 2);
        const o: Obj = { img, x: p.x, y: p.y, r: lm.w };
        if (scene.textures.exists(lm.key + '-isik')) o.glowKey = lm.key + '-isik';
        this.objs.push(o);
        if (it.lm === 'ayasofya' || it.lm === 'havariyun' || it.lm === 'pantokrator') this.stork(p.x - 6, p.y - 40);
        continue;
      }
      if (it.kind === 'sarnic') {
        const c = CISTERN_SPECS[it.v];
        const img = scene.add.image(Math.round(p.x), Math.round(p.y), c.key).setOrigin(0.5, (c.h / 2 + 4) / c.h).setDepth(DEPTH.GROUND_DECAL + 20);
        this.objs.push({ img, x: p.x, y: p.y, r: c.w });
      }
    }
    const T1 = performance.now();
    this.timing.sprites = T1 - T0 - this.timing.layout;
    this.buildAqueduct(ground);
    const T2 = performance.now();
    this.buildHarbours();
    this.timing.aqueduct = T2 - T1;
    this.timing.harbours = performance.now() - T2;
    // townsfolk pool
    for (let i = 0; i < 30; i++) {
      const spr = scene.add.sprite(0, 0, 'city/insan', 0).setOrigin(0.5, 1).setVisible(false);
      this.walkers.push({ spr, cluster: -1, tx: 0, ty: 0, gx: 0, gy: 0, wait: Math.random() * 2, active: false });
    }
    void CISTERNS;
  }

  private decorate(it: CityItem, x: number, y: number): void {
    const scene = this.rc.scene;
    const h = hash2(Math.round(it.tx * 10), Math.round(it.ty * 10), 17);
    if ((it.kind === 'ev' || it.kind === 'ev-galata') && h < 0.11) {
      // laundry line by the house
      const spr = scene.add.sprite(Math.round(x + 10), Math.round(y + 6), 'city/camasir', 0).setOrigin(0.5, 1).setDepth(y + 6);
      this.objs.push({ img: spr, x: x + 10, y: y + 6, r: 16, anim: 'city/camasir:dalga' });
    } else if (it.kind === 'ev' && h > 0.9) {
      const spr = scene.add.sprite(Math.round(x - 3), Math.round(y - 14), 'city/guvercin', 0).setOrigin(0.5, 1).setDepth(y + 0.5);
      this.objs.push({ img: spr, x, y: y - 14, r: 6, anim: 'city/guvercin:dur' });
    } else if (it.kind === 'kilise' && h < 0.55) {
      this.stork(x + 6, y - 30);
    }
  }

  private stork(x: number, y: number): void {
    const spr = this.rc.scene.add.sprite(Math.round(x), Math.round(y), 'city/leylek', 0).setOrigin(0.5, 1).setDepth(y + 60);
    this.objs.push({ img: spr, x, y, r: 10, anim: 'city/leylek:dur' });
  }

  private buildAqueduct(ground: (tx: number, ty: number) => number): void {
    const pieces = valensPieces();
    const sc = new Scene();
    // lift each piece onto the terrain under its centre
    const bases: number[] = [];
    pieces.forEach((pc, i) => {
      for (const pr of pc.prims) {
        const o = (pr as unknown as { o: { base: number; ax: number; ay: number; bx: number; by: number; f0: number; f1: number } }).o;
        const fm = (o.f0 + o.f1) / 2;
        const g = Math.round(ground(o.ax + (o.bx - o.ax) * fm, o.ay + (o.by - o.ay) * fm));
        o.base = g;
        (pr as unknown as { zTop: number }).zTop += g;
        bases[i] = g;
        sc.add(pr);
      }
    });
    sc.build();
    const tm = this.rc.scene.textures;
    pieces.forEach((pc, i) => {
      const pr = pc.prims[0];
      const b = projBounds(pr.x0, pr.y0, pr.x1, pr.y1, bases[i] - 4, pr.zTop);
      const sb = projBounds(pr.x0, pr.y0, pr.x1 + 1, pr.y1, bases[i] - 4, bases[i]);
      const ox = Math.floor(PROJ_OX + Math.min(b.l, sb.l)) - 2;
      const oy = Math.floor(PROJ_OY + b.t) - 2;
      const w = Math.ceil(PROJ_OX + Math.max(b.r, sb.r)) - ox + 3;
      const h = Math.ceil(PROJ_OY + Math.max(b.b, sb.b)) - oy + 3;
      const key = `city/valens-${i}`;
      if (!tm.exists(key)) {
        const out = renderScene(sc, { w, h, px0: PROJ_OX - ox, py0: PROJ_OY - oy, own: (q) => q.owner === i, ground, groundShadow: () => true, shadowAlpha: 0.34, skirt: 3 });
        tm.addCanvas(key, out.canvas.toCanvas());
      }
      const fm = (pc.f0 + pc.f1) / 2;
      const o = (pr as unknown as { o: { ax: number; ay: number; bx: number; by: number } }).o;
      const cx = o.ax + (o.bx - o.ax) * fm;
      const cy = o.ay + (o.by - o.ay) * fm;
      const depth = PROJ_OY + (cx + cy) * 8 - bases[i] + 2;
      const img = this.rc.scene.add.image(ox, oy, key).setOrigin(0, 0).setDepth(depth);
      this.objs.push({ img, x: ox + w / 2, y: oy + h / 2, r: Math.max(w, h) });
    });
  }

  /** Moles of the Kontoskalion (active) and Theodosian (silted, ruinous) harbours on the Marmara shore. */
  private buildHarbours(): void {
    const line = LINES.deniz;
    const tm = this.rc.scene.textures;
    const defs: [string, number, number, boolean][] = [
      ['kontoskalion', 41.0048, 28.966, false],
      ['theodosiusLimani', 41.0035, 28.955, true],
    ];
    for (const [id, la, lo, ruined] of defs) {
      const c = geoToTile(la, lo);
      const q = nearestOnLine(line, c.tx, c.ty);
      const prims: Prim[] = [];
      const P = (dt: number, n: number) => offsetAt(line, q.t + dt, n);
      const arm = (pts: { tx: number; ty: number }[], seed: number) => {
        for (let i = 0; i + 1 < pts.length; i++) {
          const a = pts[i];
          const b = pts[i + 1];
          const l = Math.hypot(b.tx - a.tx, b.ty - a.ty) || 1;
          prims.push(
            new Box({ cx: (a.tx + b.tx) / 2, cy: (a.ty + b.ty) / 2, ax: (b.tx - a.tx) / l, ay: (b.ty - a.ty) / l, ha: l / 2 + 0.05, hb: 0.08, base: 0, height: ruined ? 4 : 7, roof: ruined ? 'ruin' : 'merlon', ruin: ruined ? 0.6 : undefined, mat: 'deniz', owner: 0, windows: 'none', seed: seed + i }),
          );
        }
        const e = pts[pts.length - 1];
        prims.push(new Box({ cx: e.tx, cy: e.ty, ax: 1, ay: 0, ha: 0.15, hb: 0.15, base: 0, height: ruined ? 8 : 17, roof: ruined ? 'ruin' : 'merlon', ruin: ruined ? 0.55 : undefined, mat: 'deniz', owner: 0, windows: 'kule', seed: seed + 9 }));
      };
      const w = ruined ? 1.0 : 1.5;
      const r = ruined ? 2.0 : 3.0;
      arm([P(-w, 0.1), P(-w - 0.15, r * 0.65), P(-w * 0.55, r), P(-0.3, r + 0.1)], 3);
      arm([P(w, 0.1), P(w + 0.15, r * 0.6), P(w * 0.6, r * 0.95), P(0.35, r)], 13);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const pr of prims) {
        const b = projBounds(pr.x0, pr.y0, pr.x1 + 0.8, pr.y1, -4, pr.zTop);
        x0 = Math.min(x0, b.l);
        y0 = Math.min(y0, b.t);
        x1 = Math.max(x1, b.r);
        y1 = Math.max(y1, b.b);
      }
      const ox = Math.floor(PROJ_OX + x0) - 2;
      const oy = Math.floor(PROJ_OY + y0) - 2;
      const W = Math.ceil(PROJ_OX + x1) - ox + 3;
      const H = Math.ceil(PROJ_OY + y1) - oy + 3;
      const key = `fort/liman-${id}`;
      if (!tm.exists(key)) {
        const sc = new Scene();
        for (const pr of prims) sc.add(pr);
        const out = renderScene(sc, { w: W, h: H, px0: PROJ_OX - ox, py0: PROJ_OY - oy, own: () => true, ground: () => 0, groundShadow: () => true, shadowAlpha: 0.3, skirt: 3 });
        tm.addCanvas(key, out.canvas.toCanvas());
      }
      const cc = P(0, 0.4);
      const img = this.rc.scene.add.image(ox, oy, key).setOrigin(0, 0).setDepth(PROJ_OY + (cc.tx + cc.ty) * 8);
      this.objs.push({ img, x: ox + W / 2, y: oy + H / 2, r: Math.max(W, H) });
    }
  }

  private inView(o: { x: number; y: number; r: number }, v: Phaser.Geom.Rectangle): boolean {
    return o.x + o.r > v.x && o.x - o.r < v.right && o.y + o.r > v.y && o.y - o.r * 1.4 < v.bottom;
  }

  update(state: GameState, dt: number, view: Phaser.Geom.Rectangle, night: number): void {
    this.t += dt;
    this.night = night;
    this.swayAcc += dt;
    const swayTick = this.swayAcc > 0.25;
    if (swayTick) this.swayAcc = 0;
    const scene = this.rc.scene;
    for (const o of this.objs) {
      const vis = this.inView(o, view);
      if (o.img.visible !== vis) {
        o.img.setVisible(vis);
        if (o.anim) {
          const s = o.img as Phaser.GameObjects.Sprite;
          if (vis) s.play({ key: o.anim, startFrame: Math.floor(Math.random() * 3) }, true);
          else s.stop();
        }
      }
      if (!vis) {
        if (o.glow && o.glow.visible) o.glow.setVisible(false);
        continue;
      }
      if (o.sway && swayTick) {
        const ph = Math.sin(this.t * 1.3 + o.sway.phase * 6.28 + o.x * 0.01);
        (o.img as Phaser.GameObjects.Image).setFrame(ph > 0.55 ? o.sway.alt : o.sway.base);
      }
      // warm windows after dusk
      if (o.glowKey) {
        if (night > 0.05) {
          if (!o.glow) {
            const src = o.img;
            o.glow = scene.add
              .image(src.x, src.y, o.glowKey, o.glowFrame ?? 0)
              .setOrigin(src.originX, src.originY)
              .setBlendMode(Phaser.BlendModes.ADD)
              .setDepth(DEPTH.GLOW - 20);
          }
          const flick = 0.85 + Math.sin(this.t * 3 + o.x) * 0.08;
          o.glow.setVisible(true).setAlpha(Math.min(1, night * 1.1) * flick);
        } else if (o.glow && o.glow.visible) o.glow.setVisible(false);
      }
    }
    this.updateSmoke(dt, view, state);
    this.updateWalkers(dt, view);
  }

  private updateSmoke(dt: number, view: Phaser.Geom.Rectangle, state: GameState): void {
    this.smokeAcc += dt;
    if (this.smokeAcc < 0.7) return;
    this.smokeAcc = 0;
    // sparse chimney smoke: a handful of chimneys near the camera centre
    const hour = ((state.time.day % 1) + 1) % 1;
    const want = hour < 0.15 || (hour > 0.5 && hour < 0.75) ? 6 : 3;
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      if (!this.inView(this.smokes[i].obj, view)) {
        this.smokes[i].h.destroy();
        this.smokes.splice(i, 1);
      }
    }
    if (this.smokes.length >= want) return;
    const cands = this.objs.filter((o) => o.chimney && this.inView(o, view) && !this.smokes.some((s) => s.obj === o));
    if (!cands.length) return;
    const o = cands[Math.floor(Math.random() * cands.length)];
    const h = this.rc.fx.smokeColumn(o.chimney!.x, o.chimney!.y, 0.55);
    this.smokes.push({ obj: o, h });
  }

  private updateWalkers(dt: number, view: Phaser.Geom.Rectangle): void {
    const clusters = this.layout.clusters.filter((c) => {
      const p = this.rc.world.toWorld(c.tx, c.ty);
      return p.x > view.x - 40 && p.x < view.right + 40 && p.y > view.y - 40 && p.y < view.bottom + 40;
    });
    const nActive = Math.round(this.walkers.length * (1 - this.night * 0.8));
    let k = 0;
    for (const wk of this.walkers) {
      k++;
      if (!wk.active) {
        if (k > nActive || !clusters.length) {
          if (wk.spr.visible) wk.spr.setVisible(false).stop();
          continue;
        }
        // at most a few townsfolk per quarter
        const counts = new Map<number, number>();
        for (const o of this.walkers) if (o.active) counts.set(o.cluster, (counts.get(o.cluster) ?? 0) + 1);
        const free = clusters.filter((q) => (counts.get(q.id) ?? 0) < Math.max(2, Math.round(q.r * 1.6)));
        if (!free.length) continue;
        const c = free[Math.floor(Math.random() * free.length)];
        wk.cluster = c.id;
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * c.r;
        wk.tx = c.tx + Math.cos(a) * r;
        wk.ty = c.ty + Math.sin(a) * r;
        wk.gx = wk.tx;
        wk.gy = wk.ty;
        wk.wait = Math.random() * 1.5;
        wk.active = true;
        const v = Math.floor(Math.random() * 6);
        wk.spr.setVisible(true).play({ key: `city/insan:${v}`, startFrame: Math.floor(Math.random() * 4) });
      }
      const c = this.layout.clusters[wk.cluster];
      if (!c) {
        wk.active = false;
        continue;
      }
      const dx = wk.gx - wk.tx;
      const dy = wk.gy - wk.ty;
      const d = Math.hypot(dx, dy);
      if (d < 0.05) {
        wk.wait -= dt;
        if (wk.spr.anims.isPlaying) wk.spr.anims.pause();
        if (wk.wait <= 0) {
          // next destination along a lane of the quarter
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * c.r * 1.1;
          wk.gx = c.tx + Math.cos(a) * r;
          wk.gy = c.ty + Math.sin(a) * r;
          if (Math.random() < 0.5) wk.gy = wk.ty;
          else wk.gx = wk.tx;
          wk.wait = 0.5 + Math.random() * 3;
          if (Math.random() < 0.08) wk.active = false;
          wk.spr.anims.resume();
        }
      } else {
        const sp = 0.14 * dt;
        wk.tx += (dx / d) * Math.min(sp, d);
        wk.ty += (dy / d) * Math.min(sp, d);
        const sx = (dx - dy) * 16;
        wk.spr.setFlipX(sx > 0);
      }
      const p = this.rc.world.toWorld(wk.tx, wk.ty);
      if (p.x < view.x - 60 || p.x > view.right + 60 || p.y < view.y - 60 || p.y > view.bottom + 60) {
        wk.active = false;
        continue;
      }
      wk.spr.setPosition(Math.round(p.x), Math.round(p.y)).setDepth(p.y + 0.3);
    }
  }

  destroy(): void {
    for (const s of this.smokes) s.h.destroy();
    for (const o of this.objs) {
      o.img.destroy();
      o.glow?.destroy();
    }
    for (const w of this.walkers) w.spr.destroy();
  }
}

export function valensCenter(): { tx: number; ty: number } {
  return geoToTile(41.0155, 28.9555);
}
