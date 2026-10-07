import type Phaser from 'phaser';
import { P, hex } from '../../art/palette';
import type { PickResult, RenderContext } from '../../core/feature';
import { FLAG } from '../../core/flags';
import type { LightHandle, LoopHandle } from '../../core/fx';
import { DEPTH } from '../../core/layers';
import type { GameState, Ship, ShipType } from '../../core/state';
import { lightLevel } from '../atmosphere/api';
import { propInfo } from './art';
import { SHIP_TYPES } from './data';
import { isGalley, localToScreen, POSE, shipKey, shipModel, shipSheetInfo, SINK_STAGES, type SheetInfo } from './frames';
import { bridgeEnds, CHAIN_LENGTH, chainPoint, headingIndex, navGrid, ridgeFraction, ROUTE_LENGTH, routeAt } from './geo';
import { SPECS } from './models';
import { navyState, type NavyState } from './state';

/**
 * NAVY rendering. Rebuilt on every createRender (scene restart). Ships are
 * synced from state by id every frame; everything else (wakes, flames, debris,
 * the overland haul crowd, chain logs, bridge) is pooled here.
 */

const TAU = Math.PI * 2;

interface ShipView {
  id: number;
  type: ShipType;
  key: string;
  info: SheetInfo;
  spr: Phaser.GameObjects.Sprite;
  refl: Phaser.GameObjects.Sprite;
  ring: Phaser.GameObjects.Sprite | null;
  shadow: Phaser.GameObjects.Image | null;
  phase: number;
  lastX: number;
  lastY: number;
  speed: number;
  foamT: number;
  lapT: number;
  sinkStart: number | null;
  sinkDone: boolean;
  wreck: boolean;
  flames: Phaser.GameObjects.Sprite[];
  fire: LoopHandle | null;
  lantern: LightHandle | null;
  char: number;
  gone: boolean;
  goneT: number;
  wx: number;
  wy: number;
  heading: number;
  visible: boolean;
}

interface Foam {
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  life: number;
  frames: number;
}

interface Floater {
  spr: Phaser.GameObjects.Sprite;
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  life: number;
  phase: number;
}

interface Rope {
  from: number;
  to: number;
  t: number;
  ok: boolean;
}

interface HaulTeam {
  shipId: number;
  oxen: Phaser.GameObjects.Sprite[];
  men: Phaser.GameObjects.Sprite[];
  drums: Phaser.GameObjects.Sprite[];
  torches: Phaser.GameObjects.Sprite[];
  lights: LightHandle[];
  dustT: number;
}

const OX_PAIRS = 5;

const HAULERS_PER_SIDE = 4;

class NavyRender {
  private scene: Phaser.Scene;
  private views = new Map<number, ShipView>();
  private foam: Foam[] = [];
  private foamPool: Phaser.GameObjects.Image[] = [];
  private floaters: Floater[] = [];
  private oneShots: { spr: Phaser.GameObjects.Sprite; t: number; life: number }[] = [];
  private ropes: Rope[] = [];
  private g: Phaser.GameObjects.Graphics;
  private gUi: Phaser.GameObjects.Graphics;
  private time = 0;
  private teams = new Map<number, HaulTeam>();
  private rollers: Phaser.GameObjects.Image[] = [];
  private rails: Phaser.GameObjects.Image[] = [];
  private posts: { spr: Phaser.GameObjects.Sprite; f: number; light: LightHandle | null; wx: number; wy: number }[] = [];
  private builders: Phaser.GameObjects.Sprite[] = [];
  private chainLogs: { img: Phaser.GameObjects.Image; x: number; y: number; f: number; phase: number }[] = [];
  private buoys: { spr: Phaser.GameObjects.Sprite; x: number; y: number; phase: number }[] = [];
  private bridgeSegs: { img: Phaser.GameObjects.Image; x: number; y: number; phase: number }[] = [];
  private bridgeWorkers: Phaser.GameObjects.Sprite[] = [];
  private sultan: Phaser.GameObjects.Sprite | null = null;
  private sultanFlag: Phaser.GameObjects.Sprite | null = null;
  private band: { spr: Phaser.GameObjects.Sprite; along: number; side: number }[] = [];
  private bandLights: LightHandle[] = [];
  private marker: Phaser.GameObjects.Sprite | null = null;
  private view = { x: 0, y: 0, right: 0, bottom: 0 };
  private night = 0;

  constructor(private rc: RenderContext) {
    this.scene = rc.scene;
    this.g = this.scene.add.graphics().setDepth(DEPTH.AIR - 5);
    this.gUi = this.scene.add.graphics().setDepth(DEPTH.UI_WORLD);
    this.listen();
    this.installInput();
  }

  // ───────────────────────────── helpers ─────────────────────────────

  private tex(key: string): boolean {
    return this.scene.textures.exists(key);
  }

  private w(tx: number, ty: number): { x: number; y: number } {
    return this.rc.world.toWorld(tx, ty);
  }

  private inView(x: number, y: number, m = 90): boolean {
    const v = this.view;
    return x > v.x - m && x < v.right + m && y > v.y - m && y < v.bottom + m * 1.5;
  }

  private shipView(id: number): ShipView | undefined {
    return this.views.get(id);
  }

  /** Deck point of a ship in world pixels. */
  private deckPos(v: ShipView, up = 0): { x: number; y: number } {
    const tall = SHIP_TYPES[v.type]?.tall;
    return { x: v.wx, y: v.wy - (tall ? 10 : 5) - up };
  }

  // ───────────────────────────── bus ─────────────────────────────

  private listen(): void {
    const bus = this.rc.bus;
    const fx = this.rc.fx;
    bus.on('ship:fire', (e) => {
      const a = this.views.get(e.shipId);
      const from = a ? this.deckPos(a, 2) : this.w(e.from.tx, e.from.ty);
      const tw = this.w(e.to.tx, e.to.ty);
      if (!this.inView(from.x, from.y, 200)) return;
      const tall = a ? SHIP_TYPES[a.type]?.tall : false;
      const to = { x: tw.x + (Math.random() - 0.5) * 10, y: tw.y - 6 + (Math.random() - 0.5) * 6 };
      const r = Math.random();
      if (tall) {
        if (r < 0.45) {
          fx.projectile(from.x, from.y - 6, to.x, to.y, { kind: 'gulle', arc: 10, duration: 0.55, onImpact: () => this.impact(to.x, to.y, false) });
        } else if (r < 0.72) {
          fx.projectile(from.x, from.y - 6, to.x, to.y, { kind: 'ates', arc: 16, duration: 0.7, trail: true, onImpact: () => this.firePot(to.x, to.y) });
        } else {
          for (let i = 0; i < 4; i++) fx.projectile(from.x + i, from.y - 4, to.x + (i - 2) * 3, to.y + (i % 2) * 2, { kind: 'ok', arc: 5, duration: 0.4 + i * 0.04 });
        }
      } else if (a && (a.type === 'kadirga' || a.type === 'venedik-kadirgasi' || a.type === 'kalyete') && r < 0.28) {
        // bow gun: fired low; against tall hulls the shot mostly fell short
        const bow = localToScreen((SPECS[a.type]?.L ?? 30) / 2 - 2, 0, 4, a.heading);
        const bx = a.wx + bow.dx;
        const by = a.wy + bow.dy;
        const dx = to.x - bx;
        const dy = to.y - by;
        const l = Math.hypot(dx, dy) || 1;
        fx.muzzle(bx, by, dx / l, dy / l, 0.7);
        fx.projectile(bx, by, to.x, to.y + 4, { kind: 'gulle', arc: 3, duration: 0.3, onImpact: () => this.impact(to.x, to.y + 4, Math.random() < 0.5) });
      } else if (r < 0.75) {
        for (let i = 0; i < 5; i++) fx.projectile(from.x + i - 2, from.y, to.x + (i - 2) * 2, to.y - 4 + (i % 3), { kind: 'ok', arc: 7, duration: 0.45 + i * 0.05 });
      } else {
        fx.projectile(from.x, from.y, to.x, to.y - 6, { kind: 'ates', arc: 12, duration: 0.6, trail: true, onImpact: () => this.firePot(to.x, to.y - 6) });
      }
      fx.smoke(from.x, from.y - 2, 0.5, 1);
    });
    bus.on('ship:hit', (e) => {
      const v = this.views.get(e.shipId);
      const p = v ? this.deckPos(v) : this.w(e.at.tx, e.at.ty);
      if (!this.inView(p.x, p.y)) return;
      fx.debris(p.x, p.y, 3, 'tahta');
      fx.sparks(p.x, p.y - 2, 3);
    });
    bus.on('ship:burning', (e) => {
      const v = this.views.get(e.shipId);
      const p = v ? this.deckPos(v) : this.w(e.at.tx, e.at.ty);
      if (this.inView(p.x, p.y)) fx.flash(p.x, p.y, 0xff8a30, 40, 0.4);
    });
    bus.on('ship:sunk', (e) => {
      const v = this.views.get(e.shipId);
      if (v && v.sinkStart == null) v.sinkStart = this.time;
      const p = v ? { x: v.wx, y: v.wy } : this.w(e.at.tx, e.at.ty);
      if (!this.inView(p.x, p.y, 150)) return;
      fx.splash(p.x, p.y, 2.2);
      fx.smoke(p.x, p.y - 8, 1.6, 4);
      fx.debris(p.x, p.y - 4, 6, 'tahta');
      this.ring(p.x, p.y, 0);
      if (SHIP_TYPES[e.type]?.tall) fx.shake(0.15, 0.4);
    });
    bus.on('ship:board', (e) => {
      this.ropes.push({ from: e.shipId, to: e.targetId, t: 0, ok: e.success });
      if (this.ropes.length > 40) this.ropes.shift();
      const v = this.views.get(e.targetId);
      if (v && this.inView(v.wx, v.wy)) {
        const p = this.deckPos(v);
        fx.sparks(p.x, p.y, e.success ? 8 : 3);
        if (e.success) fx.floatText(p.x, p.y - 14, '⚔', hex(P.gold[5]));
      }
    });
    bus.on('navy:battery', (e) => {
      const a = this.w(e.from.tx, e.from.ty);
      const b = this.w(e.to.tx, e.to.ty);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const l = Math.hypot(dx, dy) || 1;
      fx.muzzle(a.x, a.y - 4, dx / l, dy / l, 1.6);
      fx.flash(a.x, a.y, 0xffc070, 90, 0.5);
      fx.projectile(a.x, a.y - 4, b.x, b.y - 6, {
        kind: 'buyuk-gulle',
        arc: 14,
        duration: 0.7,
        trail: true,
        onImpact: () => {
          fx.impact(b.x, b.y - 6, 1.4, false);
          fx.splash(b.x, b.y, 2.5);
          this.ring(b.x, b.y, 0);
          fx.shake(0.35, 0.5);
        },
      });
    });
    bus.on('navy:chain', (e) => {
      if (!e.open) return;
      for (let i = 0; i < 3; i++) {
        const c = chainPoint(0.5 + i * 0.05);
        const p = this.w(c.tx, c.ty);
        if (this.inView(p.x, p.y)) this.ring(p.x, p.y, i * 0.15);
      }
    });
    bus.on('overland:launched', (e) => {
      const p = this.w(e.at.tx, e.at.ty);
      if (!this.inView(p.x, p.y, 150)) return;
      fx.splash(p.x, p.y, 2.4);
      this.ring(p.x, p.y, 0);
      this.ring(p.x - 6, p.y + 2, 0.12);
      for (let i = 0; i < 10; i++) this.emitFoam(p.x, p.y, Math.cos((i / 10) * TAU) * 14, Math.sin((i / 10) * TAU) * 7, 1.6);
    });
    bus.on('overland:launch', () => {
      const r = routeAt(0);
      const p = this.w(r.tx, r.ty);
      if (this.inView(p.x, p.y)) fx.dust(p.x, p.y, 1.4);
    });
  }

  private impact(x: number, y: number, hit: boolean): void {
    if (hit) {
      this.rc.fx.debris(x, y, 3, 'tahta');
      this.rc.fx.sparks(x, y, 3);
    } else {
      this.rc.fx.splash(x, y + 6, 0.8);
      this.ring(x, y + 6, 0, true);
    }
  }

  private firePot(x: number, y: number): void {
    this.rc.fx.flash(x, y, 0xff7a20, 26, 0.35);
    this.rc.fx.sparks(x, y, 6);
    if (!this.tex('navy/alev')) return;
    const s = this.scene.add.sprite(x, y + 2, 'navy/alev').setOrigin(0.5, 1).setDepth(y + 2);
    s.play('navy/alev:yan');
    this.oneShots.push({ spr: s, t: 0, life: 0.8 });
  }

  private ring(x: number, y: number, delay: number, small = false): void {
    if (!this.tex('navy/halka')) return;
    const s = this.scene.add.sprite(Math.round(x), Math.round(y), 'navy/halka', 0).setDepth(DEPTH.GROUND_DECAL + 6);
    if (small) s.setAlpha(0.8);
    s.setVisible(delay <= 0);
    if (delay <= 0) s.play('navy/halka:sicra');
    this.oneShots.push({ spr: s, t: -delay, life: 0.6 });
  }

  // ───────────────────────────── input ─────────────────────────────

  private installInput(): void {
    const rc = this.rc;
    rc.addPickable({
      pick: (wx, wy, state) => {
        let best: PickResult | null = null;
        for (const s of state.ships) {
          if (s.status === 'batik') continue;
          const v = this.views.get(s.id);
          if (!v) continue;
          const tall = SHIP_TYPES[s.type]?.tall;
          const halfW = tall ? 13 : (SPECS[s.type]?.L ?? 30) * 0.4;
          const top = tall ? 38 : 22;
          const cx = v.wx;
          const cy = v.wy - top * 0.4;
          if (Math.abs(wx - cx) > halfW || wy < v.wy - top || wy > v.wy + 7) continue;
          const d = Math.hypot(wx - cx, (wy - cy) * 0.8);
          const score = d / 6 + (s.side === 'osmanli' ? 0 : 1.5);
          if (!best || score < best.score) best = { kind: 'ship', id: s.id, score };
        }
        return best;
      },
      pickRect: (x0, y0, x1, y1, state) => {
        const out: PickResult[] = [];
        for (const s of state.ships) {
          if (s.side !== 'osmanli' || s.status === 'batik' || s.status === 'karada') continue;
          const v = this.views.get(s.id);
          if (!v) continue;
          const cy = v.wy - 8;
          if (v.wx >= x0 && v.wx <= x1 && cy >= y0 && cy <= y1) out.push({ kind: 'ship', id: s.id, score: 0 });
        }
        return out;
      },
    });
    rc.addOrderHandler((input, state) => {
      const ids = input.selection
        .filter((p) => p.kind === 'ship')
        .map((p) => state.ships.find((s) => s.id === p.id))
        .filter((s): s is Ship => !!s && s.side === 'osmanli' && s.status !== 'batik' && s.status !== 'karada')
        .map((s) => s.id);
      if (!ids.length) return false;
      let tx = input.tile.tx;
      let ty = input.tile.ty;
      if (!rc.world.isWater(tx, ty)) {
        const alt = rc.world.nearestPassable({ tx, ty }, 'sea', 2);
        if (!alt) {
          rc.bus.emit('notify', { text: 'Gemiler karaya çıkamaz.', kind: 'uyari' });
          return true;
        }
        tx = alt.tx + 0.5;
        ty = alt.ty + 0.5;
      }
      rc.store.dispatch({ t: 'filo-emir', shipIds: ids, target: { tx, ty } });
      this.showMarker(tx, ty);
      return true;
    });
  }

  private showMarker(tx: number, ty: number): void {
    if (!this.tex('navy/hedef')) return;
    const p = this.w(tx, ty);
    if (!this.marker) this.marker = this.scene.add.sprite(0, 0, 'navy/hedef', 0).setOrigin(0.5, 1).setDepth(DEPTH.UI_WORLD - 1);
    this.marker.setPosition(Math.round(p.x), Math.round(p.y + 6)).setVisible(true).setAlpha(1);
    this.marker.play('navy/hedef:in');
    this.marker.setData('t', 0);
  }

  // ───────────────────────────── update ─────────────────────────────

  update(state: GameState, dt: number): void {
    this.time += dt;
    const cam = this.scene.cameras.main;
    const wv = cam.worldView;
    this.view.x = wv.x;
    this.view.y = wv.y;
    this.view.right = wv.x + wv.width;
    this.view.bottom = wv.y + wv.height;
    this.night = 1 - lightLevel(state);
    const n = navyState(state);
    this.g.clear();
    this.gUi.clear();
    this.syncShips(state, n, dt);
    this.updateFoam(dt);
    this.updateFloaters(dt);
    this.updateOneShots(dt);
    this.updateRopes(dt);
    this.updateHaul(state, n, dt);
    this.updateChain(state, n);
    this.updateBridge(state, n);
    this.updateSultan(state, n);
    this.updateSelection(state);
    if (this.marker && this.marker.visible) {
      const t = (this.marker.getData('t') as number) + dt;
      this.marker.setData('t', t);
      if (t > 1.2) this.marker.setAlpha(Math.max(0, 1 - (t - 1.2) * 2));
      if (t > 1.7) this.marker.setVisible(false);
    }
  }

  // ───────────────────────────── ships ─────────────────────────────

  private createView(s: Ship, n: NavyState): ShipView | null {
    const flagship = !!n.extra[s.id]?.flagship;
    const key = shipKey(s.type, flagship);
    if (!this.tex(key)) return null;
    const info = shipSheetInfo(s.type);
    const spr = this.scene.add.sprite(0, 0, key, 0).setOrigin(info.ox / info.fw, info.oy / info.fh);
    const refl = this.scene.add
      .sprite(0, 0, key, 0)
      .setOrigin(info.ox / info.fw, (info.fh - info.oy) / info.fh)
      .setFlipY(true)
      .setAlpha(0.2)
      .setTint(hex(P.water[3]))
      .setDepth(DEPTH.GROUND_DECAL + 2);
    const p = this.w(s.tx, s.ty);
    return {
      id: s.id,
      type: s.type,
      key,
      info,
      spr,
      refl,
      ring: null,
      shadow: null,
      phase: Math.random() * TAU,
      lastX: p.x,
      lastY: p.y,
      speed: 0,
      foamT: Math.random(),
      lapT: Math.random() * 2,
      sinkStart: null,
      sinkDone: false,
      wreck: false,
      flames: [],
      fire: null,
      lantern: null,
      char: 0,
      gone: false,
      goneT: 0,
      wx: p.x,
      wy: p.y,
      heading: s.heading,
      visible: true,
    };
  }

  private destroyView(v: ShipView): void {
    v.spr.destroy();
    v.refl.destroy();
    v.ring?.destroy();
    v.shadow?.destroy();
    for (const f of v.flames) f.destroy();
    v.fire?.destroy();
    v.lantern?.destroy();
  }

  private syncShips(state: GameState, n: NavyState, dt: number): void {
    for (const v of this.views.values()) v.gone = true;
    let lights = 0;
    for (const s of state.ships) {
      let v = this.views.get(s.id);
      if (!v) {
        v = this.createView(s, n) ?? undefined;
        if (!v) continue;
        this.views.set(s.id, v);
        // already sinking when first seen (scenario): skip ahead
        if (s.status === 'batik') v.sinkStart = this.time - (n.extra[s.id]?.sinkT ?? 0);
      }
      v.gone = false;
      lights += this.updateShip(v, s, n, dt, lights);
    }
    // ships removed from state: finish their sinking animation, then free
    for (const [id, v] of this.views) {
      if (!v.gone) continue;
      v.goneT += dt;
      if (v.sinkStart == null) v.sinkStart = this.time;
      this.animateSinking(v, dt);
      if (v.goneT > 8 || v.sinkDone) {
        this.destroyView(v);
        this.views.delete(id);
      }
    }
  }

  private updateShip(v: ShipView, s: Ship, n: NavyState, dt: number, lightsUsed: number): number {
    const p = this.w(s.tx, s.ty);
    v.wx = p.x;
    v.wy = p.y;
    v.heading = s.heading;
    const vis = this.inView(p.x, p.y, 100);
    v.visible = vis;
    v.spr.setVisible(vis);
    if (!vis) {
      v.refl.setVisible(false);
      v.shadow?.setVisible(false);
      for (const f of v.flames) f.setVisible(false);
      if (v.lantern) {
        v.lantern.destroy();
        v.lantern = null;
      }
      if (v.fire) {
        v.fire.destroy();
        v.fire = null;
      }
      v.lastX = p.x;
      v.lastY = p.y;
      return 0;
    }
    // speed (px/s, smoothed)
    const inst = Math.hypot(p.x - v.lastX, p.y - v.lastY) / Math.max(dt, 1e-3);
    v.speed += (Math.min(inst, 60) - v.speed) * Math.min(1, dt * 4);
    v.lastX = p.x;
    v.lastY = p.y;
    const h = headingIndex(s.heading);
    const base = h * v.info.per;
    const def = SHIP_TYPES[s.type];
    const tall = !!def?.tall;
    const t = this.time + v.phase;
    let frame: number;
    let bob = Math.round(Math.sin(t * (tall ? 1.1 : 1.6)) * 0.85);
    let onWater = true;
    if (s.status === 'batik') {
      if (v.sinkStart == null) v.sinkStart = this.time;
      this.animateSinking(v, dt);
      return 0;
    } else if (s.status === 'karada') {
      frame = base + POSE.land + (Math.floor(t * 3) % 2);
      bob = Math.floor(t * 5) % 2 === 0 ? 0 : -1; // rolling over the logs
      onWater = false;
    } else {
      const moving = s.status === 'seyir' || s.status === 'savas' || (s.status === 'yaniyor' && v.speed > 2) || v.speed > 3;
      if (moving) {
        const fps = tall ? 4 + Math.min(3, v.speed / 6) : 6 + Math.min(4, v.speed / 4);
        // galleys fight (and cross calms) under oars with the lateen sail furled
        const row = !tall && isGalley(s.type) && (s.status === 'savas' || s.status === 'yaniyor' || n.wind.s < 0.3 || (n.extra[s.id]?.targetId != null));
        frame = base + (row ? POSE.row : POSE.sail) + (Math.floor(t * fps) % 4);
      } else {
        frame = base + POSE.anchor + (Math.floor(t * 2.2) % 2);
      }
    }
    v.spr.setFrame(frame);
    v.spr.setPosition(Math.round(p.x), Math.round(p.y) + bob);
    // on land the hull casts a soft shadow to the lower-right
    if (!onWater && this.tex('navy/golge')) {
      if (!v.shadow) v.shadow = this.scene.add.image(0, 0, 'navy/golge').setDepth(DEPTH.GROUND_DECAL + 14);
      v.shadow.setPosition(Math.round(p.x) + 5, Math.round(p.y) + 3).setVisible(true);
    } else v.shadow?.setVisible(false);
    v.spr.setDepth(p.y);
    v.spr.setAlpha(1);
    // reflection
    v.refl.setVisible(onWater);
    if (onWater) {
      v.refl.setFrame(frame);
      const wob = Math.floor(this.time * 3 + v.phase) % 3 === 0 ? 1 : 0;
      v.refl.setPosition(Math.round(p.x) + wob, Math.round(p.y) - bob + 1);
      v.refl.setAlpha(0.16 * (1 - this.night * 0.6));
    }
    // charring while burning / damaged
    const ex = n.extra[s.id];
    const burning = (ex?.burn ?? 0) > 0 || s.status === 'yaniyor';
    const dmg = 1 - Math.max(0, s.hp) / Math.max(1, s.hpMax);
    const targetChar = burning ? Math.min(1, 0.35 + dmg) : dmg * 0.5;
    v.char += (targetChar - v.char) * Math.min(1, dt * 0.8);
    if (v.char > 0.03) {
      const k = 1 - v.char * 0.55;
      const r = Math.round(255 * k);
      const gg = Math.round(255 * k * 0.9);
      const b = Math.round(255 * k * 0.82);
      v.spr.setTint((r << 16) | (gg << 8) | b);
    } else v.spr.clearTint();
    // fire on deck
    this.updateFlames(v, s, burning, bob);
    // wake & lapping foam
    if (onWater) {
      if (v.speed > 2) {
        v.foamT -= dt;
        if (v.foamT <= 0) {
          v.foamT = tall ? 0.11 : 0.08;
          this.emitWake(v, s);
        }
      } else {
        v.lapT -= dt;
        if (v.lapT <= 0) {
          v.lapT = 1.2 + Math.random() * 1.6;
          const side = Math.random() < 0.5 ? -1 : 1;
          const sp = SPECS[s.type];
          const o = localToScreen((Math.random() - 0.5) * sp.L * 0.6, side * (sp.B / 2 + 1), 0, s.heading);
          this.emitFoam(p.x + o.dx, p.y + o.dy, o.dx * 0.15, o.dy * 0.15, 1.4);
        }
      }
    }
    // stern lantern at night
    let used = 0;
    const m = shipModel(s.type);
    if (this.night > 0.35 && m.lanterns.length && lightsUsed < 12 && s.status !== 'karada') {
      const l = m.lanterns[0];
      const o = localToScreen(l[0], l[1], l[2], (h * Math.PI) / 4);
      const lx = Math.round(p.x) + o.dx;
      const ly = Math.round(p.y) + bob + o.dy;
      if (!v.lantern) v.lantern = this.rc.fx.light(lx, ly, 0xffb860, 26, 0.9);
      v.lantern.setPosition(lx, ly);
      v.lantern.setIntensity(0.6 + this.night * 0.6 + Math.sin(this.time * 9 + v.phase) * 0.05);
      used = 1;
    } else if (v.lantern) {
      v.lantern.destroy();
      v.lantern = null;
    }
    return used;
  }

  private updateFlames(v: ShipView, s: Ship, burning: boolean, bob: number): void {
    if (burning && this.tex('navy/alev')) {
      const sp = SPECS[s.type];
      const tall = SHIP_TYPES[s.type]?.tall;
      const want = tall ? 3 : sp.L > 36 ? 3 : 2;
      while (v.flames.length < want) {
        const f = this.scene.add.sprite(0, 0, 'navy/alev', 0).setOrigin(0.5, 1);
        f.play({ key: 'navy/alev:yan', startFrame: Math.floor(Math.random() * 6) });
        v.flames.push(f);
      }
      v.flames.forEach((f, i) => {
        const lx = (i - (v.flames.length - 1) / 2) * sp.L * 0.28;
        const o = localToScreen(lx, i % 2 ? 1 : -1, sp.H + 1, s.heading);
        f.setPosition(Math.round(v.wx + o.dx), Math.round(v.wy + o.dy) + bob);
        f.setDepth(v.wy + 0.5 + i * 0.01);
        f.setVisible(true);
      });
      const c = this.deckPos(v);
      if (!v.fire) v.fire = this.rc.fx.fire(c.x, c.y, tall ? 1.4 : 1);
      v.fire.setPosition(c.x, c.y);
    } else {
      if (v.flames.length) {
        for (const f of v.flames) f.destroy();
        v.flames = [];
        this.rc.fx.smoke(v.wx, v.wy - 8, 1, 3);
      }
      if (v.fire) {
        v.fire.destroy();
        v.fire = null;
      }
    }
  }

  private animateSinking(v: ShipView, dt: number): void {
    const t = this.time - (v.sinkStart ?? this.time);
    const h = headingIndex(v.heading);
    const base = h * v.info.per;
    const stageDur = 1.5;
    const stage = Math.min(SINK_STAGES.length - 1, Math.floor(t / stageDur));
    v.spr.setFrame(base + POSE.sink + stage);
    v.spr.setPosition(Math.round(v.wx), Math.round(v.wy));
    v.spr.setDepth(v.wy);
    v.refl.setVisible(false);
    for (const f of v.flames) f.destroy();
    v.flames = [];
    v.fire?.destroy();
    v.fire = null;
    v.lantern?.destroy();
    v.lantern = null;
    const end = SINK_STAGES.length * stageDur;
    // gentle tint toward the water as it goes down
    const k = Math.min(1, t / end);
    const c = Math.round(255 - 90 * k);
    v.spr.setTint((Math.round(c * 0.75) << 16) | (Math.round(c * 0.9) << 8) | c);
    if (t > end) v.spr.setAlpha(Math.max(0, 1 - (t - end) / 1.6));
    if (!v.visible && !this.inView(v.wx, v.wy, 100)) {
      if (t > end + 1.6) v.sinkDone = true;
      return;
    }
    // bubbles + foam while going down
    v.foamT -= dt;
    if (v.foamT <= 0 && t < end + 1) {
      v.foamT = 0.12;
      const sp = SPECS[v.type];
      const o = localToScreen((Math.random() - 0.5) * sp.L * 0.7, (Math.random() - 0.5) * sp.B, 0, v.heading);
      this.emitFoam(v.wx + o.dx, v.wy + o.dy, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 3, 1.5);
    }
    if (!v.sinkDone && t > end - 0.6 && !v.wreck) {
      v.wreck = true;
      this.spawnWreckage(v);
    }
    if (t > end + 1.6) {
      v.sinkDone = true;
      v.spr.setVisible(false);
    }
  }

  private spawnWreckage(v: ShipView): void {
    const scene = this.scene;
    if (this.tex('navy/kabarcik')) {
      const b = scene.add.sprite(Math.round(v.wx), Math.round(v.wy), 'navy/kabarcik', 0).setDepth(DEPTH.GROUND_DECAL + 7);
      b.play('navy/kabarcik:kaynar');
      this.oneShots.push({ spr: b, t: 0, life: 7 });
    }
    const nDeb = SHIP_TYPES[v.type]?.tall ? 6 : 4;
    if (this.tex('navy/enkaz'))
      for (let i = 0; i < nDeb; i++) {
        const spr = scene.add.sprite(0, 0, 'navy/enkaz', i % 4).setDepth(DEPTH.GROUND_DECAL + 8);
        const a = Math.random() * TAU;
        this.floaters.push({ spr, x: v.wx + Math.cos(a) * 6, y: v.wy + Math.sin(a) * 3, vx: Math.cos(a) * 3, vy: Math.sin(a) * 1.5 + 0.6, t: 0, life: 24 + Math.random() * 8, phase: Math.random() * TAU });
      }
    if (this.tex('navy/kazazede'))
      for (let i = 0; i < 3; i++) {
        const spr = scene.add.sprite(0, 0, 'navy/kazazede', 0).setDepth(DEPTH.GROUND_DECAL + 9);
        spr.play({ key: 'navy/kazazede:el', startFrame: i % 2 });
        const a = Math.random() * TAU;
        this.floaters.push({ spr, x: v.wx + Math.cos(a) * 9, y: v.wy + Math.sin(a) * 4, vx: Math.cos(a) * 1.5, vy: 0.4, t: 0, life: 16 + i * 3, phase: Math.random() * TAU });
      }
  }

  // ───────────────────────────── wakes ─────────────────────────────

  private emitWake(v: ShipView, s: Ship): void {
    const sp = SPECS[s.type];
    const stern = localToScreen(-sp.L / 2, 0, 0, s.heading);
    const side = localToScreen(0, 1, 0, s.heading);
    const back = localToScreen(-1, 0, 0, s.heading);
    const spd = Math.min(1.5, v.speed / 12);
    // V: two foam bits spreading outward from the quarters
    for (const k of [-1, 1]) {
      const q = localToScreen(-sp.L * 0.3, (k * sp.B) / 2, 0, s.heading);
      this.emitFoam(v.wx + q.dx, v.wy + q.dy, (side.dx * k * 7 + back.dx * 3) * spd, (side.dy * k * 7 + back.dy * 3) * spd, 1.7);
    }
    // churned water astern
    this.emitFoam(v.wx + stern.dx, v.wy + stern.dy, back.dx * 4 * spd, back.dy * 4 * spd, 1.3);
    // bow wave
    if (Math.random() < 0.5) {
      const bow = localToScreen(sp.L / 2 - 1, (Math.random() - 0.5) * 2, 0, s.heading);
      this.emitFoam(v.wx + bow.dx, v.wy + bow.dy, side.dx * (Math.random() - 0.5) * 8, side.dy * (Math.random() - 0.5) * 8, 0.8);
    }
  }

  private emitFoam(x: number, y: number, vx: number, vy: number, life: number): void {
    if (!this.tex('navy/kopuk')) return;
    if (this.foam.length > 520) return;
    if (!this.inView(x, y, 20)) return;
    let img = this.foamPool.pop();
    if (!img) img = this.scene.add.image(0, 0, 'navy/kopuk', 0).setDepth(DEPTH.GROUND_DECAL + 4);
    img.setVisible(true).setAlpha(0.85).setFrame(0);
    this.foam.push({ img, x, y, vx, vy, t: 0, life, frames: 5 });
  }

  private updateFoam(dt: number): void {
    const keep: Foam[] = [];
    for (const f of this.foam) {
      f.t += dt;
      if (f.t >= f.life) {
        f.img.setVisible(false);
        this.foamPool.push(f.img);
        continue;
      }
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.vx *= 1 - dt * 0.8;
      f.vy *= 1 - dt * 0.8;
      const k = f.t / f.life;
      f.img.setFrame(Math.min(f.frames - 1, Math.floor(k * f.frames)));
      f.img.setPosition(Math.round(f.x), Math.round(f.y));
      f.img.setAlpha(0.9 * (1 - k * k) * (1 - this.night * 0.45));
      keep.push(f);
    }
    this.foam = keep;
  }

  private updateFloaters(dt: number): void {
    this.floaters = this.floaters.filter((f) => {
      f.t += dt;
      if (f.t > f.life) {
        f.spr.destroy();
        return false;
      }
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.vx *= 1 - dt * 0.15;
      f.vy *= 1 - dt * 0.15;
      const bob = Math.round(Math.sin(this.time * 1.8 + f.phase) * 0.7);
      f.spr.setPosition(Math.round(f.x), Math.round(f.y) + bob);
      f.spr.setAlpha(Math.min(1, (f.life - f.t) / 3));
      return true;
    });
  }

  private updateOneShots(dt: number): void {
    this.oneShots = this.oneShots.filter((o) => {
      o.t += dt;
      if (o.t >= 0 && !o.spr.visible) {
        o.spr.setVisible(true);
        if (o.spr.texture.key === 'navy/halka') o.spr.play('navy/halka:sicra');
      }
      if (o.t > o.life) {
        o.spr.destroy();
        return false;
      }
      if (o.life > 2) o.spr.setAlpha(Math.min(1, (o.life - o.t) / 2));
      return true;
    });
  }

  // ───────────────────────────── grapples ─────────────────────────────

  private updateRopes(dt: number): void {
    const g = this.g;
    this.ropes = this.ropes.filter((r) => {
      r.t += dt;
      if (r.t > 2.6) return false;
      const a = this.views.get(r.from);
      const b = this.views.get(r.to);
      if (!a || !b || !a.visible) return true;
      const pa = this.deckPos(a);
      const pb = this.deckPos(b, 2);
      // the hook flies out during the first 0.35 s
      const fly = Math.min(1, r.t / 0.35);
      const ex = pa.x + (pb.x - pa.x) * fly;
      const ey = pa.y + (pb.y - pa.y) * fly;
      // failed grapples are cut and fall
      const drop = !r.ok && r.t > 1.1 ? (r.t - 1.1) * 14 : 0;
      const sag = 4 + Math.sin(r.t * 6) * 0.6;
      const steps = Math.max(4, Math.ceil(Math.hypot(ex - pa.x, ey - pa.y)));
      g.fillStyle(hex(P.wood[2]), 1);
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = pa.x + (ex - pa.x) * t;
        const y = pa.y + (ey - pa.y) * t + Math.sin(t * Math.PI) * sag + drop * t * t;
        g.fillRect(Math.round(x), Math.round(y), 1, 1);
      }
      g.fillStyle(hex(P.steel[4]), 1);
      g.fillRect(Math.round(ex), Math.round(ey + drop), 1, 1);
      return true;
    });
  }

  // ───────────────────────────── selection & bars ─────────────────────────────

  private updateSelection(state: GameState): void {
    const sel = new Set<number>();
    for (const p of this.rc.store.ui.selection) if (p.kind === 'ship') sel.add(p.id as number);
    const blink = Math.floor(this.time * 3) % 2;
    for (const v of this.views.values()) {
      const selected = sel.has(v.id) && v.visible && v.sinkStart == null;
      if (selected) {
        const big = SHIP_TYPES[v.type]?.tall || (SPECS[v.type]?.L ?? 0) >= 40;
        const key = big ? 'navy/secim-b' : 'navy/secim-k';
        if (!v.ring && this.tex(key)) v.ring = this.scene.add.sprite(0, 0, key, 0);
        v.ring?.setPosition(Math.round(v.wx), Math.round(v.wy) + 1).setDepth(DEPTH.GROUND_DECAL + 5).setFrame(blink).setVisible(true);
      } else if (v.ring) v.ring.setVisible(false);
    }
    // health bars: selected or damaged ships in a fight
    const g = this.gUi;
    for (const s of state.ships) {
      const v = this.views.get(s.id);
      if (!v || !v.visible || s.status === 'batik' || s.status === 'karada') continue;
      const role = navyState(state).extra[s.id]?.role;
      const hurt = s.hp < s.hpMax - 0.5;
      const show = sel.has(s.id) || (hurt && (role === 'yardim' || role === 'baskin')) || (hurt && s.hp < s.hpMax * 0.45 && (s.status === 'savas' || s.status === 'yaniyor'));
      if (!show) continue;
      const tall = SHIP_TYPES[s.type]?.tall;
      const w = tall ? 18 : 14;
      const x = Math.round(v.wx - w / 2);
      const y = Math.round(v.wy - (tall ? 46 : 30));
      const k = Math.max(0, s.hp / s.hpMax);
      g.fillStyle(hex(P.outline[0]), 0.85);
      g.fillRect(x - 1, y - 1, w + 2, 4);
      g.fillStyle(hex(P.outline[2]), 1);
      g.fillRect(x, y, w, 2);
      const col = s.side === 'osmanli' ? (k > 0.5 ? P.green[5] : k > 0.25 ? P.gold[5] : P.red[5]) : k > 0.5 ? P.blue[5] : P.red[5];
      g.fillStyle(hex(col), 1);
      g.fillRect(x, y, Math.max(1, Math.round(w * k)), 2);
      g.fillStyle(0xffffff, 0.35);
      g.fillRect(x, y, Math.max(1, Math.round(w * k)), 1);
    }
  }

  // ───────────────────────────── the Sultan (20 Nisan) ─────────────────────────────

  private updateSultan(state: GameState, n: NavyState): void {
    const b = n.battle;
    const show = (b.stage === 'savas' || b.stage === 'yaklasma') && !!b.sultan && this.tex('navy/sultan');
    if (!show) {
      this.sultan?.setVisible(false);
      this.sultanFlag?.setVisible(false);
      return;
    }
    const sl = b.sultan!;
    // ride back and forth between the beach and the shallows
    const k = 0.45 + Math.sin(this.time * 0.4) * 0.3;
    const tx = sl.tx + (sl.wx - sl.tx) * k;
    const ty = sl.ty + (sl.wy - sl.ty) * k;
    const p = this.w(tx, ty);
    if (!this.sultan) {
      this.sultan = this.scene.add.sprite(0, 0, 'navy/sultan', 0).setOrigin(0.5, 0.85);
      this.sultan.play('navy/sultan:bagir');
    }
    const c = b.centroid ? this.w(b.centroid.tx, b.centroid.ty) : p;
    this.sultan.setFlipX(c.x > p.x);
    this.sultan.setPosition(Math.round(p.x), Math.round(p.y)).setDepth(p.y).setVisible(this.inView(p.x, p.y, 40));
    // his standard-bearer waits on the beach
    if (!this.sultanFlag && this.tex('navy/sancaktar')) {
      this.sultanFlag = this.scene.add.sprite(0, 0, 'navy/sancaktar', 0).setOrigin(0.5, 1);
      this.sultanFlag.play('navy/sancaktar:dalga');
    }
    if (this.sultanFlag) {
      const q = this.w(sl.tx - (sl.wx - sl.tx) * 0.6, sl.ty - (sl.wy - sl.ty) * 0.6);
      this.sultanFlag.setPosition(Math.round(q.x), Math.round(q.y)).setDepth(q.y).setVisible(this.sultan.visible);
    }
    if (Math.random() < 0.06 && this.sultan.visible) this.emitFoam(p.x + (Math.random() - 0.5) * 8, p.y + 2, (Math.random() - 0.5) * 8, 2, 0.9);
  }

  // ───────────────────────────── the chain ─────────────────────────────

  private updateChain(state: GameState, n: NavyState): void {
    const up = !!state.flags[FLAG.zincirGerili];
    if (!up) {
      for (const l of this.chainLogs) l.img.setVisible(false);
      for (const b of this.buoys) b.spr.setVisible(false);
      return;
    }
    if (!this.chainLogs.length && this.tex('navy/zincir-kutuk')) {
      const info = propInfo('navy/zincir-kutuk');
      const lenTiles = 17 / 16;
      const count = Math.max(4, Math.floor(CHAIN_LENGTH / lenTiles));
      for (let i = 0; i < count; i++) {
        const f = (i + 0.5) / count;
        const c = chainPoint(f);
        const p = this.w(c.tx, c.ty);
        const img = this.scene.add.image(0, 0, 'navy/zincir-kutuk');
        if (info) img.setOrigin(info.ox / info.w, info.oy / info.h);
        this.chainLogs.push({ img, x: p.x, y: p.y, f, phase: i * 0.7 });
        if (i % 3 === 1 && this.tex('navy/samandira')) {
          const bi = propInfo('navy/samandira');
          const c2 = chainPoint(f + 0.5 / count);
          const p2 = this.w(c2.tx + 0.35, c2.ty + 0.1);
          const spr = this.scene.add.sprite(0, 0, 'navy/samandira', 0);
          if (bi) spr.setOrigin(bi.ox / bi.w, bi.oy / bi.h);
          this.buoys.push({ spr, x: p2.x, y: p2.y, phase: i });
        }
      }
    }
    const open = n.chainOpen > 0 ? Math.min(1, n.chainOpen > 27 ? (30 - n.chainOpen) / 3 : n.chainOpen < 3 ? n.chainOpen / 3 : 1) : 0;
    for (const l of this.chainLogs) {
      const vis = this.inView(l.x, l.y, 30);
      l.img.setVisible(vis);
      if (!vis) continue;
      const bob = Math.round(Math.sin(this.time * 1.4 + l.phase) * 0.7);
      // the middle of the chain is lowered to let friendly ships through
      const gate = Math.max(0, 1 - Math.abs(l.f - 0.55) / 0.12);
      const sink = Math.round(open * gate * 3);
      l.img.setPosition(Math.round(l.x), Math.round(l.y) + bob + sink);
      l.img.setAlpha(1 - open * gate * 0.75);
      l.img.setDepth(l.y);
    }
    for (const b of this.buoys) {
      const vis = this.inView(b.x, b.y, 30);
      b.spr.setVisible(vis);
      if (!vis) continue;
      b.spr.setFrame(Math.floor(this.time * 4 + b.phase) % 4);
      b.spr.setPosition(Math.round(b.x), Math.round(b.y) + Math.round(Math.sin(this.time * 1.7 + b.phase) * 0.8));
      b.spr.setDepth(b.y);
    }
  }

  // ───────────────────────────── the pontoon bridge ─────────────────────────────

  private updateBridge(state: GameState, n: NavyState): void {
    const st = state.flags[FLAG.halicKoprusu] ? 'tamam' : n.bridge.stage;
    if (st === 'yok') {
      for (const s of this.bridgeSegs) s.img.setVisible(false);
      return;
    }
    if (!this.bridgeSegs.length && this.tex('navy/kopru')) {
      const ends = bridgeEnds(this.rc.world);
      if (!ends) return;
      const L = Math.hypot(ends.b.tx - ends.a.tx, ends.b.ty - ends.a.ty);
      const step = 7.5 / 16;
      const count = Math.max(2, Math.round(L / step));
      const info = propInfo('navy/kopru');
      const ginfo = propInfo('navy/kopru-top');
      for (let i = 0; i < count; i++) {
        const t = (i + 0.5) / count;
        const tx = ends.a.tx + (ends.b.tx - ends.a.tx) * t;
        const ty = ends.a.ty + (ends.b.ty - ends.a.ty) * t;
        const p = this.w(tx, ty);
        const mid = i === Math.floor(count / 2);
        const key = mid && this.tex('navy/kopru-top') ? 'navy/kopru-top' : 'navy/kopru';
        const img = this.scene.add.image(0, 0, key);
        const pi = mid ? ginfo : info;
        if (pi) img.setOrigin(pi.ox / pi.w, pi.oy / pi.h);
        this.bridgeSegs.push({ img, x: p.x, y: p.y, phase: i * 0.5 });
      }
    }
    const prog = st === 'tamam' ? 1 : n.bridge.progress;
    const shown = Math.ceil(prog * this.bridgeSegs.length);
    this.bridgeSegs.forEach((s, i) => {
      const vis = i < shown && this.inView(s.x, s.y, 40);
      s.img.setVisible(vis);
      if (!vis) return;
      s.img.setPosition(Math.round(s.x), Math.round(s.y) + Math.round(Math.sin(this.time * 1.2 + s.phase) * 0.6));
      s.img.setDepth(s.y);
    });
    // builders at the head of the bridge
    const building = st === 'insa' && shown > 0;
    if (building && !this.bridgeWorkers.length && this.tex('navy/isci')) {
      for (let i = 0; i < 3; i++) {
        const w = this.scene.add.sprite(0, 0, 'navy/isci', 0).setOrigin(0.5, 1);
        w.play({ key: 'navy/isci:cak', startFrame: i });
        this.bridgeWorkers.push(w);
      }
    }
    this.bridgeWorkers.forEach((w, i) => {
      const head = this.bridgeSegs[Math.max(0, shown - 1)];
      if (!building || !head) {
        w.setVisible(false);
        return;
      }
      w.setVisible(this.inView(head.x, head.y));
      w.setPosition(Math.round(head.x + (i - 1) * 5), Math.round(head.y - 2 + (i % 2) * 2)).setDepth(head.y + 1 + i);
      w.setFlipX(i % 2 === 0);
    });
  }

  // ───────────────────────────── the overland haul ─────────────────────────────

  private routeW(f: number): { x: number; y: number; dir: number } {
    const r = routeAt(Math.max(0, Math.min(1, f)));
    const p = this.w(r.tx, r.ty);
    return { x: p.x, y: p.y, dir: r.dir };
  }

  private updateHaul(state: GameState, n: NavyState, dt: number): void {
    const o = n.overland;
    const slip = o.stage === 'kizak' ? o.slipway : o.stage === 'cekiliyor' ? 1 : 0;
    const active = o.stage === 'kizak' || o.stage === 'cekiliyor';
    // slipway rollers & rails
    if (active && !this.rollers.length && this.tex('navy/kutuk-d0')) this.buildSlipway();
    const shownR = Math.floor(slip * this.rollers.length);
    this.rollers.forEach((r, i) => {
      const vis = active && i < shownR && this.inView(r.x, r.y, 20);
      r.setVisible(vis);
    });
    const shownRail = Math.floor(slip * this.rails.length);
    this.rails.forEach((r, i) => r.setVisible(active && i < shownRail && this.inView(r.x, r.y, 20)));
    // torch posts (lit at night)
    let lights = 0;
    for (const p of this.posts) {
      const vis = active && p.f <= slip && this.night > 0.3 && this.inView(p.wx, p.wy, 30);
      p.spr.setVisible(vis);
      if (vis && lights < 10) {
        if (!p.light) p.light = this.rc.fx.light(p.wx, p.wy - 14, 0xffa040, 40, 1);
        p.light.setIntensity(0.8 + Math.sin(this.time * 11 + p.f * 40) * 0.12);
        lights++;
      } else if (p.light) {
        p.light.destroy();
        p.light = null;
      }
    }
    // builders at the slipway head
    const building = o.stage === 'kizak';
    if (building && !this.builders.length && this.tex('navy/isci')) {
      for (let i = 0; i < 4; i++) {
        const w = this.scene.add.sprite(0, 0, 'navy/isci', 0).setOrigin(0.5, 1);
        w.play({ key: 'navy/isci:cak', startFrame: i % 4 });
        this.builders.push(w);
      }
    }
    if (this.builders.length) {
      const head = this.routeW(slip);
      const perp = { x: -Math.sin(head.dir), y: Math.cos(head.dir) };
      this.builders.forEach((w, i) => {
        if (!building) {
          w.setVisible(false);
          return;
        }
        const side = i % 2 ? 1 : -1;
        const q = this.w(routeAt(slip).tx + perp.x * side * 0.6 - Math.cos(head.dir) * (i >> 1) * 0.5, routeAt(slip).ty + perp.y * side * 0.6 - Math.sin(head.dir) * (i >> 1) * 0.5);
        w.setPosition(Math.round(q.x), Math.round(q.y)).setDepth(q.y).setVisible(this.inView(q.x, q.y));
        w.setFlipX(side > 0);
      });
      if (building && Math.random() < dt * 2 && this.inView(head.x, head.y)) this.rc.fx.dust(head.x, head.y, 0.6);
    }
    // teams for every ship on the slipway
    const onRidge = new Set<number>();
    for (const s of state.ships) {
      if (s.status !== 'karada') continue;
      onRidge.add(s.id);
      let team = this.teams.get(s.id);
      if (!team) {
        team = this.createTeam(s.id);
        this.teams.set(s.id, team);
      }
      this.updateTeam(team, s, n, dt);
    }
    for (const [id, team] of this.teams) {
      if (onRidge.has(id)) continue;
      this.destroyTeam(team);
      this.teams.delete(id);
    }
    this.updateBand(o.stage === 'cekiliyor');
    if (!active && this.rollers.length && !state.ships.some((s) => s.status === 'karada')) {
      // keep the slipway as a scar on the hill after the haul
      for (const r of this.rollers) r.setVisible(this.inView(r.x, r.y, 20) && o.stage === 'tamam');
    }
  }

  /** The mehter band and the sancak at the crest of the Pera ridge, playing through the night. */
  private updateBand(on: boolean): void {
    const crestF = ridgeFraction();
    if (on && !this.band.length) {
      const members: [string, string, number, number][] = [
        ['navy/sancaktar', 'navy/sancaktar:dalga', 0, 2.1],
        ['navy/davulcu', 'navy/davulcu:cal', -0.6, 2.4],
        ['navy/davulcu', 'navy/davulcu:cal', 0.6, 2.5],
        ['navy/zurnaci', 'navy/zurnaci:cal', -1.1, 2.0],
        ['navy/zurnaci', 'navy/zurnaci:cal', 1.1, 2.1],
        ['navy/nakkareci', 'navy/nakkareci:cal', 0.1, 2.9],
        ['navy/mesale', 'navy/mesale:yan', -1.6, 2.6],
        ['navy/mesale', 'navy/mesale:yan', 1.7, 2.7],
      ];
      members.forEach(([key, anim, along, side], i) => {
        if (!this.tex(key)) return;
        const spr = this.scene.add.sprite(0, 0, key, 0).setOrigin(0.5, 1);
        spr.play({ key: anim, startFrame: i % 4 });
        this.band.push({ spr, along, side });
      });
    }
    if (!this.band.length) return;
    const r = routeAt(crestF);
    const perp = { tx: Math.sin(r.dir), ty: -Math.cos(r.dir) };
    let anyVis = false;
    const faceRight = Math.cos(r.dir) - Math.sin(r.dir) < 0;
    for (const b of this.band) {
      const tx = r.tx + Math.cos(r.dir) * b.along + perp.tx * b.side;
      const ty = r.ty + Math.sin(r.dir) * b.along + perp.ty * b.side;
      const p = this.w(tx, ty);
      const vis = on && this.inView(p.x, p.y, 40);
      anyVis = anyVis || vis;
      b.spr.setPosition(Math.round(p.x), Math.round(p.y)).setDepth(p.y).setVisible(vis);
      // they face the slipway
      b.spr.setFlipX(faceRight);
    }
    const lit = anyVis && this.night > 0.3;
    if (lit && !this.bandLights.length) {
      for (const b of this.band) if (b.spr.texture.key === 'navy/mesale') this.bandLights.push(this.rc.fx.light(b.spr.x, b.spr.y - 16, 0xffa040, 52, 1.1));
    } else if (!lit && this.bandLights.length) {
      for (const l of this.bandLights) l.destroy();
      this.bandLights = [];
    }
    if (lit) {
      let i = 0;
      for (const b of this.band) {
        if (b.spr.texture.key !== 'navy/mesale') continue;
        const l = this.bandLights[i++];
        l?.setPosition(b.spr.x, b.spr.y - 16);
        l?.setIntensity(1 + Math.sin(this.time * 12 + i) * 0.12);
      }
    }
  }

  private buildSlipway(): void {
    const scene = this.scene;
    navGrid(this.rc.world); // make sure the route is fitted to this world
    const step = 0.62;
    const n = Math.floor(ROUTE_LENGTH / step);
    const dirKey = (base: string, dir: number) => `${base}-d${((Math.round(dir / (Math.PI / 8)) % 16) + 16) % 16}`;
    for (let i = 0; i < n; i++) {
      const f = i / n;
      const r = routeAt(f);
      const p = this.w(r.tx, r.ty);
      const key = dirKey('navy/kutuk', r.dir);
      const info = propInfo(key);
      const img = scene.add.image(Math.round(p.x), Math.round(p.y), key).setDepth(DEPTH.GROUND_DECAL + 12).setVisible(false);
      if (info) img.setOrigin(info.ox / info.w, info.oy / info.h);
      this.rollers.push(img);
      // plank rails on both sides
      const rk = dirKey('navy/ray', r.dir);
      const ri = propInfo(rk);
      for (const side of [-1, 1]) {
        const q = this.w(r.tx - Math.sin(r.dir) * side * 0.32, r.ty + Math.cos(r.dir) * side * 0.32);
        const rail = scene.add.image(Math.round(q.x), Math.round(q.y), rk).setDepth(DEPTH.GROUND_DECAL + 11).setVisible(false);
        if (ri) rail.setOrigin(ri.ox / ri.w, ri.oy / ri.h);
        this.rails.push(rail);
      }
      // torch posts every ~5 tiles, alternating sides
      if (i % 9 === 4 && this.tex('navy/mesale')) {
        const side = Math.floor(i / 9) % 2 ? 1 : -1;
        const q = this.w(r.tx - Math.sin(r.dir) * side * 1.3, r.ty + Math.cos(r.dir) * side * 1.3);
        const spr = scene.add.sprite(Math.round(q.x), Math.round(q.y), 'navy/mesale', 0).setOrigin(0.5, 1).setDepth(q.y).setVisible(false);
        spr.play({ key: 'navy/mesale:yan', startFrame: i % 4 });
        this.posts.push({ spr, f, light: null, wx: q.x, wy: q.y });
      }
    }
  }

  private createTeam(shipId: number): HaulTeam {
    const scene = this.scene;
    const team: HaulTeam = { shipId, oxen: [], men: [], drums: [], torches: [], lights: [], dustT: 0 };
    for (let i = 0; i < OX_PAIRS; i++) {
      const key = i % 2 ? 'navy/okuz-koyu' : 'navy/okuz';
      if (!this.tex(key)) continue;
      const info = propInfo(key);
      const s = scene.add.sprite(0, 0, key, 0);
      if (info) s.setOrigin(info.ox / info.w, info.oy / info.h);
      team.oxen.push(s);
    }
    for (let i = 0; i < HAULERS_PER_SIDE * 2 + 3; i++) {
      const key = `navy/hamal${i % 4}`;
      if (!this.tex(key)) continue;
      const s = scene.add.sprite(0, 0, key, 0).setOrigin(0.5, 1);
      s.play({ key: `${key}:yuru`, startFrame: i % 4 });
      team.men.push(s);
    }
    for (let i = 0; i < 2; i++) {
      if (!this.tex('navy/davulcu')) break;
      const s = scene.add.sprite(0, 0, 'navy/davulcu', 0).setOrigin(0.5, 1);
      s.play({ key: 'navy/davulcu:cal', startFrame: i * 2 });
      team.drums.push(s);
    }
    for (let i = 0; i < 2; i++) {
      if (!this.tex('navy/mesaleci')) break;
      const s = scene.add.sprite(0, 0, 'navy/mesaleci', 0).setOrigin(0.5, 1);
      s.play({ key: 'navy/mesaleci:yuru', startFrame: i });
      team.torches.push(s);
    }
    return team;
  }

  private destroyTeam(t: HaulTeam): void {
    for (const s of [...t.oxen, ...t.men, ...t.drums, ...t.torches]) s.destroy();
    for (const l of t.lights) l.destroy();
  }

  private updateTeam(team: HaulTeam, s: Ship, n: NavyState, dt: number): void {
    const ex = n.extra[s.id];
    const f = ex?.haulT ?? 0;
    const shipLenT = (SPECS[s.type]?.L ?? 30) / 16;
    const df = 1 / ROUTE_LENGTH;
    const here = this.routeW(f);
    const vis = this.inView(here.x, here.y, 160);
    const all = [...team.oxen, ...team.men, ...team.drums, ...team.torches];
    if (!vis) {
      for (const o of all) o.setVisible(false);
      for (const l of team.lights) l.destroy();
      team.lights = [];
      return;
    }
    const tile = routeAt(f);
    const hIdx = headingIndex(tile.dir);
    // screen direction of travel → which way the men face
    const faceRight = Math.cos(tile.dir) - Math.sin(tile.dir) > 0;
    const perp = { tx: -Math.sin(tile.dir), ty: Math.cos(tile.dir) };
    const place = (spr: Phaser.GameObjects.Sprite, along: number, side: number, lift = 0) => {
      const r = routeAt(Math.min(1, Math.max(0, f + along * df)));
      const q = this.w(r.tx + perp.tx * side, r.ty + perp.ty * side);
      spr.setPosition(Math.round(q.x), Math.round(q.y) - lift).setDepth(q.y).setVisible(true);
      return q;
    };
    // oxen ahead of the bow
    const oxStart = shipLenT / 2 + 0.6;
    const walk = Math.floor(this.time * 6);
    team.oxen.forEach((o, i) => {
      place(o, oxStart + i * 0.85, 0);
      o.setFrame(hIdx * 4 + ((walk + i) % 4));
    });
    // haulers on both sides of the oxen, leaning into the ropes
    const ropes: { x: number; y: number }[][] = [[], []];
    team.men.forEach((m, i) => {
      if (i >= HAULERS_PER_SIDE * 2) {
        // pushers at the stern
        const k = i - HAULERS_PER_SIDE * 2;
        place(m, -shipLenT / 2 - 0.35, (k - 1) * 0.5);
        m.setFlipX(faceRight);
        return;
      }
      const side = i % 2 ? 1 : -1;
      const k = i >> 1;
      const q = place(m, oxStart + 0.3 + k * 0.85, side * 0.95);
      m.setFlipX(faceRight);
      ropes[i % 2].push({ x: q.x + (faceRight ? 2 : -2), y: q.y - 8 });
    });
    // drummers beside the ship, torchbearers further out
    team.drums.forEach((d, i) => {
      place(d, 0.3 - i * 0.6, (i ? 1 : -1) * 1.15);
      d.setFlipX(faceRight);
    });
    const torchOn = this.night > 0.3;
    team.torches.forEach((t, i) => {
      t.setVisible(torchOn);
      if (!torchOn) return;
      place(t, oxStart + 1.6 + i * 1.2, (i % 2 ? 1 : -1) * 1.5);
      t.setFlipX(faceRight);
    });
    // torch lights (max 2 per team)
    if (torchOn) {
      while (team.lights.length < 3) team.lights.push(this.rc.fx.light(0, 0, 0xffa848, 46, 1));
      team.lights.forEach((l, i) => {
        if (i === 2) {
          // the hull lit from below by the torches of the crowd
          l.setPosition(here.x, here.y - 14);
          l.setRadius(58);
          l.setIntensity(0.75 + Math.sin(this.time * 7) * 0.08);
          return;
        }
        const t = team.torches[i];
        if (!t) return;
        l.setPosition(t.x - (faceRight ? -2 : 2), t.y - 18);
        l.setIntensity(0.9 + Math.sin(this.time * 13 + i) * 0.12);
      });
    } else if (team.lights.length) {
      for (const l of team.lights) l.destroy();
      team.lights = [];
    }
    // ropes: from the bow along each line of haulers, and to the yoke
    const bow = this.routeW(f + (shipLenT / 2 - 0.1) * df);
    const g = this.g;
    g.fillStyle(hex(P.sand[3]), 1);
    for (const line of ropes) {
      let prev = { x: bow.x, y: bow.y - 7 };
      for (const pt of line) {
        this.pixelLine(prev.x, prev.y, pt.x, pt.y);
        prev = pt;
      }
    }
    const ox0 = team.oxen[0];
    if (ox0) this.pixelLine(bow.x, bow.y - 6, ox0.x, ox0.y - 4);
    for (let i = 1; i < team.oxen.length; i++) this.pixelLine(team.oxen[i - 1].x, team.oxen[i - 1].y - 4, team.oxen[i].x, team.oxen[i].y - 4);
    // dust from the rollers
    team.dustT -= dt;
    if (team.dustT <= 0) {
      team.dustT = 0.5 + Math.random() * 0.4;
      const stern = this.routeW(f - (shipLenT / 2) * df);
      this.rc.fx.dust(stern.x, stern.y, 0.5);
    }
  }

  private pixelLine(x0: number, y0: number, x1: number, y1: number): void {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      this.g.fillRect(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * 1.5), 1, 1);
    }
  }

  destroy(): void {
    for (const l of this.bandLights) l.destroy();
    for (const v of this.views.values()) this.destroyView(v);
    this.views.clear();
    for (const t of this.teams.values()) this.destroyTeam(t);
    for (const p of this.posts) p.light?.destroy();
  }
}

const renders = new WeakMap<Phaser.Scene, NavyRender>();

export function createNavyRender(rc: RenderContext): void {
  const r = new NavyRender(rc);
  renders.set(rc.scene, r);
  // 'shutdown' = Phaser.Scenes.Events.SHUTDOWN (type-only Phaser import keeps tests Node-safe)
  rc.scene.events.once('shutdown', () => {
    r.destroy();
    renders.delete(rc.scene);
  });
}

export function updateNavyRender(rc: RenderContext, state: GameState, dt: number): void {
  renders.get(rc.scene)?.update(state, dt);
}
