import type Phaser from 'phaser';
import { hex, P } from '../../art/palette';
import { dayFrac } from '../../core/calendar';
import type { OrderInput, PickResult, RenderContext } from '../../core/feature';
import type { LightHandle } from '../../core/fx';
import { FLAG } from '../../core/flags';
import type { TilePt } from '../../core/iso';
import { DEPTH } from '../../core/layers';
import type { GameState, UnitGroup } from '../../core/state';
import { landmarkTile } from '../../data/landmarks';
import { isNight } from '../atmosphere/api';
import { sectionAt } from '../fortifications/api';
import { BAN } from './art';
import { campSlot, isLandSection } from './geo';
import { AssaultRenderer } from './render-assault';
import {
  facingOf,
  frameOf,
  hash,
  isArcherKey,
  isMounted,
  ORIGIN,
  soldierSheet,
  SpritePool,
  trailAt,
  trailLength,
  type Anim,
  type Layout,
  type Spr,
  type Img,
} from './render-util';
import { army, extraOf } from './state';

/**
 * ARMY RENDER — formations of animated soldiers for every group (pooled and
 * culled), banner bearers, commanders, baggage, dust, torches, selection,
 * orders; the assault spectacle lives in render-assault.ts.
 * Rebuilt on every createRender; never mutates GameState.
 */

const CULL = 180;
const SPACING = { inf: 0.36, mnt: 0.72 };

interface Soldier {
  s: Spr;
  key: string;
  layout: Layout;
  x: number;
  y: number;
  /** last screen pos to drive walk animation */
  walk: number;
  phase: number;
  seed: number;
  jx: number;
  jy: number;
  jT: number;
  atkT: number;
  torch: Img | null;
  back: boolean;
  flip: boolean;
}

interface GroupView {
  id: number;
  soldiers: Soldier[];
  banner: Spr | null;
  bx: number;
  by: number;
  cmd: Spr | null;
  tugs: Spr[];
  camels: Spr[];
  trail: TilePt[];
  cx: number;
  cy: number;
  mountedKey: string;
  visible: boolean;
  dustT: number;
  /** screen bounds for picking */
  b: { x0: number; y0: number; x1: number; y1: number };
  lastMen: number;
  /** Half-width of the formation's footprint (screen px) for the selection ring. */
  spread: number;
  floatAcc: number;
  floatT: number;
  moving: boolean;
}

interface SelView {
  ring: Spr;
  barBg: Img;
  barMen: Img;
  barMor: Img;
  marker: Spr;
  dots: Img[];
}

const instances = new WeakMap<RenderContext, ArmyRenderer>();

export function createArmyRender(rc: RenderContext): void {
  instances.set(rc, new ArmyRenderer(rc));
}

export function updateArmyRender(rc: RenderContext, state: GameState, dt: number): void {
  instances.get(rc)?.update(state, dt);
}

export class ArmyRenderer {
  private scene: Phaser.Scene;
  private pool: SpritePool;
  private views = new Map<number, GroupView>();
  private sel = new Map<number, SelView>();
  private time = 0;
  private lights: LightHandle[] = [];
  private torchPool: Img[] = [];
  private assault: AssaultRenderer;
  private clickMarks: { s: Spr; t: number }[] = [];
  private visit: { start: number; route: TilePt[]; sprites: Spr[] } | null = null;
  private campFires: { h: { destroy(): void }; }[] = [];
  private zoom = 1;

  constructor(private rc: RenderContext) {
    this.scene = rc.scene;
    this.pool = new SpritePool(this.scene);
    this.assault = new AssaultRenderer(rc, this.pool);
    const bus = rc.bus;
    bus.on('group:casualties', (e) => this.onCasualties(e.groupId, e.count));
    bus.on('group:routed', (e) => {
      const v = this.views.get(e.groupId);
      if (v && v.visible) this.rc.fx.floatText(Math.round(v.bx), Math.round(v.by) - 30, 'Bozgun!', hex(P.red[6]));
    });
    bus.on('group:order', (e) => {
      const v = this.views.get(e.groupId);
      if (v) v.trail = [];
    });
    rc.addPickable({ pick: (wx, wy, s) => this.pick(wx, wy, s), pickRect: (x0, y0, x1, y1, s) => this.pickRect(x0, y0, x1, y1, s) });
    rc.addOrderHandler((input, s) => this.order(input, s));
    this.scene.events.once('shutdown', () => this.destroyAll());
  }

  private wp(tx: number, ty: number): { x: number; y: number } {
    return this.rc.world.toWorld(tx, ty);
  }

  private inView(x: number, y: number, m = CULL): boolean {
    const v = this.scene.cameras.main.worldView;
    return x > v.x - m && x < v.right + m && y > v.y - m && y < v.bottom + m;
  }

  // ───────────────────────────── per frame ─────────────────────────────

  update(state: GameState, dt: number): void {
    this.time += dt;
    this.zoom = this.scene.cameras.main.zoom;
    const night = isNight(state);
    const seen = new Set<number>();
    const a = army(state);
    const torchSpots: { x: number; y: number; d: number }[] = [];
    const cam = this.scene.cameras.main.midPoint;
    for (const g of state.groups) {
      if (g.status === 'uzakta' || g.status === 'dagildi' || g.men <= 0) continue;
      seen.add(g.id);
      let v = this.views.get(g.id);
      if (!v) {
        v = this.newView(g);
        this.views.set(g.id, v);
      }
      this.updateGroup(state, g, v, dt, night, a.parade.includes(g.id));
      if (v.visible && night) torchSpots.push({ x: v.bx, y: v.by - 18, d: Math.hypot(v.bx - cam.x, v.by - cam.y) });
    }
    for (const [id, v] of this.views) {
      if (!seen.has(id)) {
        this.hideView(v);
        this.views.delete(id);
      }
    }
    this.assault.update(state, dt, night, (id) => {
      const s0 = this.views.get(id)?.soldiers.find((x) => x.layout === 'inf');
      return s0 ? s0.key : null;
    });
    for (const sp of this.assault.torchSpots()) torchSpots.push({ x: sp.x, y: sp.y, d: Math.hypot(sp.x - cam.x, sp.y - cam.y) * 0.7 });
    this.updateLights(torchSpots, night);
    this.updateSelection(state);
    this.updateClickMarks(dt);
    this.updateVisit(state, dt);
    this.updateCampFires(state);
  }

  private newView(g: UnitGroup): GroupView {
    const c = { tx: g.tx, ty: g.ty };
    return {
      id: g.id,
      soldiers: [],
      banner: null,
      bx: 0,
      by: 0,
      cmd: null,
      tugs: [],
      camels: [],
      trail: [],
      cx: c.tx,
      cy: c.ty,
      mountedKey: '',
      visible: false,
      dustT: Math.random(),
      b: { x0: 0, y0: 0, x1: 0, y1: 0 },
      lastMen: g.men,
      spread: 10,
      floatAcc: 0,
      floatT: 0,
      moving: false,
    };
  }

  private releaseSoldier(s: Soldier): void {
    this.pool.release(s.s);
    if (s.torch) {
      s.torch.setVisible(false);
      this.torchPool.push(s.torch);
      s.torch = null;
    }
  }

  private hideView(v: GroupView): void {
    for (const s of v.soldiers) this.releaseSoldier(s);
    v.soldiers = [];
    if (v.banner) this.pool.release(v.banner);
    if (v.cmd) this.pool.release(v.cmd);
    for (const t of v.tugs) this.pool.release(t);
    for (const c of v.camels) this.pool.release(c);
    v.banner = null;
    v.cmd = null;
    v.tugs = [];
    v.camels = [];
    v.visible = false;
  }

  /** Render-only position of a parading group (game over: loop its path). */
  private paradePos(g: UnitGroup): { tx: number; ty: number; moving: boolean } {
    const pts: TilePt[] = [{ tx: g.tx, ty: g.ty }, ...g.path];
    const L = trailLength(pts);
    if (L < 0.5) return { tx: g.tx, ty: g.ty, moving: false };
    const speed = g.type === 'sipahi' || g.type === 'akinci' ? 0.9 : 0.5;
    const s = (this.time * speed + hash(g.id, 1) * L) % (L + 3);
    const rev = [...pts].reverse();
    const p = trailAt(rev, Math.max(0, L - Math.min(L, s)));
    return { tx: p.tx, ty: p.ty, moving: s < L };
  }

  private updateGroup(state: GameState, g: UnitGroup, v: GroupView, dt: number, night: boolean, parade: boolean): void {
    const e = extraOf(state, g.id);
    let gx = g.tx;
    let gy = g.ty;
    let moving = g.path.length > 0 && (g.status === 'yuruyor' || g.status === 'cekiliyor');
    if (parade && state.time.phase === 'bitti') {
      const pp = this.paradePos(g);
      gx = pp.tx;
      gy = pp.ty;
      moving = pp.moving;
    }
    // smooth the 10 Hz sim position
    const jump = Math.hypot(gx - v.cx, gy - v.cy);
    if (jump > 6) {
      v.cx = gx;
      v.cy = gy;
      v.trail = [];
    } else {
      const k = Math.min(1, dt * 10);
      v.cx += (gx - v.cx) * k;
      v.cy += (gy - v.cy) * k;
    }
    // trail (newest first)
    const head = v.trail[0];
    if (!head || Math.hypot(head.tx - v.cx, head.ty - v.cy) > 0.12) {
      v.trail.unshift({ tx: v.cx, ty: v.cy });
      if (v.trail.length > 90) v.trail.length = 90;
    }
    v.moving = moving;
    const c = this.wp(v.cx, v.cy);
    const visible = this.inView(c.x, c.y);
    if (!visible) {
      if (v.visible) this.hideView(v);
      return;
    }
    v.visible = true;
    const mounted = isMounted(g);
    const cap = this.zoom >= 2 ? 30 : 20;
    const n = g.type === 'mehter' ? Math.max(4, Math.min(12, Math.round(g.men / 14))) : Math.max(1, Math.min(cap, Math.round(g.men / 50)));
    const mk = `${mounted ? 'm' : 'f'}${n}`;
    if (mk !== v.mountedKey) {
      // rebuild the formation's sprites (count or mount changed)
      const old = v.soldiers;
      v.soldiers = [];
      for (let i = 0; i < n; i++) {
        const sh = soldierSheet(g.type, mounted, g.id, i, n);
        const prev = old[i];
        const sp = this.pool.get(sh.key, 0, sh.layout);
        v.soldiers.push({
          s: sp,
          key: sh.key,
          layout: sh.layout,
          x: prev ? prev.x : v.cx + (hash(g.id, i) - 0.5) * 1.5,
          y: prev ? prev.y : v.cy + (hash(i, g.id) - 0.5) * 1.5,
          walk: 0,
          phase: hash(g.id * 3, i) * 10,
          seed: hash(g.id, i * 13 + 1),
          jx: 0,
          jy: 0,
          jT: hash(i, g.id * 7) * 6,
          atkT: hash(g.id, i * 5) * 3,
          torch: null,
          back: false,
          flip: false,
        });
      }
      for (const s of old) this.releaseSoldier(s);
      v.mountedKey = mk;
    }
    // formation targets
    const sp = mounted ? SPACING.mnt : SPACING.inf;
    const face = e.face && Math.hypot(e.face.tx, e.face.ty) > 0.1 ? e.face : { tx: g.facing, ty: 0 };
    const fl = Math.hypot(face.tx, face.ty) || 1;
    let fx = face.tx / fl;
    let fy = face.ty / fl;
    const lead = trailAt(v.trail, 0);
    if (moving) {
      fx = lead.dx;
      fy = lead.dy;
    }
    const rx = -fy;
    const ry = fx;
    const cols = moving ? (mounted ? 2 : n > 12 ? 4 : 3) : Math.max(1, Math.ceil(Math.sqrt(n * (mounted ? 1.2 : 1.7))));
    const rows = Math.ceil(n / cols);
    const fighting = g.status === 'savasiyor';
    const working = g.status === 'calisiyor';
    const playing = g.type === 'mehter' && (army(state).mehter || moving);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const wallSid = fighting || working ? g.order.sectionId ?? null : null;
    const breach = wallSid ? state.sections[wallSid]?.breach ?? 0 : 0;
    const followSpeed = (moving ? 2.4 : 1.4) * (state.time.speed > 1 ? state.time.speed : 1);
    for (let i = 0; i < v.soldiers.length; i++) {
      const s = v.soldiers[i];
      let tx: number;
      let ty: number;
      let anim: Anim = 'idle';
      const col = i % cols;
      const row = Math.floor(i / cols);
      const lat = (col - (cols - 1) / 2) * sp;
      if (moving) {
        const p = trailAt(v.trail, row * sp * 1.15 + (col % 2) * 0.08);
        const prx = -p.dy;
        const pry = p.dx;
        tx = p.tx + prx * lat;
        ty = p.ty + pry * lat;
      } else {
        const stag = row % 2 ? sp * 0.5 : 0;
        const depthOff = (row - (rows - 1) / 2) * sp * 0.95;
        tx = v.cx + rx * (lat + stag) - fx * depthOff;
        ty = v.cy + ry * (lat + stag) - fy * depthOff;
        if (fighting) {
          // storming: a front rank presses to the wall along a wide frontage, the mass seethes behind
          const lat2 = ((i + 0.5) / v.soldiers.length - 0.5) * (2.2 + v.soldiers.length * 0.09) + (s.seed - 0.5) * 0.35;
          const front = i % 5 < 3;
          const depth = front
            ? 1.45 + breach * 0.9 + Math.sin(this.time * 1.7 + s.phase) * 0.28
            : -0.4 + s.seed * 1.3 + Math.sin(this.time * 0.8 + s.phase) * 0.3;
          tx = v.cx + rx * lat2 + fx * depth;
          ty = v.cy + ry * lat2 + fy * depth;
        } else if (working && g.order.type === 'hendek-doldur') {
          // carry earth and fascines to the moat and back
          const sw = (Math.sin(this.time * 0.8 + s.phase) + 1) * 0.5;
          tx += fx * sw * 1.4;
          ty += fy * sw * 1.4;
        } else {
          // idle life: small shuffles
          s.jT -= dt;
          if (s.jT <= 0) {
            s.jT = 2.5 + Math.random() * 6;
            s.jx = (Math.random() - 0.5) * sp * 0.7;
            s.jy = (Math.random() - 0.5) * sp * 0.7;
          }
          tx += s.jx;
          ty += s.jy;
        }
      }
      // move toward the slot
      const dx = tx - s.x;
      const dy = ty - s.y;
      const d = Math.hypot(dx, dy);
      let stepDir = { tx: 0, ty: 0 };
      if (d > 5) {
        s.x = tx;
        s.y = ty;
      } else if (d > 0.02) {
        const vmax = Math.max(0.6, d * followSpeed) * dt;
        const st = Math.min(d, vmax);
        s.x += (dx / d) * st;
        s.y += (dy / d) * st;
        stepDir = { tx: dx / d, ty: dy / d };
        s.walk += st * 14;
        if (st / dt > 0.12) anim = 'walk';
      }
      // facing
      let f = facingOf(fx, fy);
      if (anim === 'walk' && (Math.abs(stepDir.tx) + Math.abs(stepDir.ty) > 0)) f = facingOf(stepDir.tx, stepDir.ty);
      if (fighting && anim !== 'walk') f = facingOf(fx, fy);
      s.back = f.back;
      s.flip = f.flip;
      // fighting / working anims
      if (anim !== 'walk') {
        if (fighting) {
          anim = 'atk';
        } else if (working && (g.order.type === 'lagim-kaz' || g.order.type === 'bombardimani-koru' || g.order.type === 'kuleyi-ilerlet')) {
          s.atkT -= dt;
          anim = s.atkT < 1.2 ? 'atk' : 'idle';
          if (s.atkT <= 0) s.atkT = 2 + s.seed * 3;
          if (g.order.type === 'bombardimani-koru' && isArcherKey(s.key) && s.atkT > 1.9 && s.atkT - dt <= 1.9 && wallSid) this.assault.archerShot(s.x, s.y, wallSid, state);
        } else if (playing) anim = 'play';
        else if (g.type === 'yeniceri' && g.status === 'bosta' && hash(g.id, i) < 0.12 && !night) anim = Math.sin(this.time * 0.5 + s.phase) > 0.6 ? 'atk' : 'idle';
      }
      if (anim === 'walk' && g.type === 'mehter' && playing) anim = 'walk';
      // frame
      let step: number;
      if (anim === 'walk') step = Math.floor(s.walk);
      else if (anim === 'atk') step = Math.floor(this.time * (fighting ? 7 : 5) + s.phase);
      else if (anim === 'play') step = Math.floor(this.time * 6 + (g.type === 'mehter' ? 0 : s.phase));
      else step = Math.floor(this.time * 1.4 + s.phase);
      const fr = frameOf(s.layout, anim, step, s.back);
      const w = this.wp(s.x, s.y);
      const x = Math.round(w.x);
      const y = Math.round(w.y);
      s.s.setPosition(x, y).setFrame(fr).setFlipX(s.flip).setDepth(y + i * 0.001);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      // torches at night (one man in seven)
      if (night && i % (fighting ? 4 : 7) === 3 && s.layout === 'inf') {
        if (!s.torch) {
          s.torch = this.torchPool.pop() ?? this.scene.add.image(0, 0, 'army/mesale', 0);
          s.torch.setVisible(true).setOrigin(0.5, 1);
        }
        const tfx = s.flip ? -4 : 4;
        s.torch.setPosition(x + tfx, y - 7).setFrame(Math.floor(this.time * 9 + s.phase) % 3).setDepth(y + 0.5);
      } else if (s.torch) {
        s.torch.setVisible(false);
        this.torchPool.push(s.torch);
        s.torch = null;
      }
    }
    let bannerTop = Infinity;
    // banner bearer at the head / front of the formation
    const bannerKey = `army/sancak-${e.banner}`;
    let btx: number;
    let bty: number;
    if (moving) {
      const p = trailAt(v.trail, 0);
      btx = p.tx + p.dx * sp * 0.9;
      bty = p.ty + p.dy * sp * 0.9;
    } else {
      const fr = (rows / 2) * sp + (fighting ? 0.2 : 0.35);
      btx = v.cx + fx * fr * (fighting ? 0.6 : 1) - rx * sp * 0.4;
      bty = v.cy + fy * fr * (fighting ? 0.6 : 1) - ry * sp * 0.4;
    }
    if (g.type !== 'mehter' || true) {
      if (!v.banner) v.banner = this.pool.get(bannerKey, 0, 'ban');
      if (v.banner.texture.key !== bannerKey) v.banner.setTexture(bannerKey, 0);
      const f = facingOf(fx, fy);
      const bw = this.wp(btx, bty);
      const step = Math.floor(this.time * (moving ? 7 : 5) + g.id);
      v.banner
        .setPosition(Math.round(bw.x), Math.round(bw.y))
        .setFrame(frameOf('ban', moving ? 'walk' : 'idle', step, f.back))
        .setFlipX(f.flip)
        .setDepth(Math.round(bw.y) + 0.002);
      v.bx = bw.x;
      v.by = bw.y;
      bannerTop = Math.round(bw.y) - BAN.fy + 2;
    }
    // commander (and the Sultan's tuğs)
    if (g.commanderId) {
      const key = g.commanderId === 'fatih' ? 'army/pasa-fatih' : g.commanderId === 'zaganos' || g.commanderId === 'mahmud' ? 'army/pasa-pasa' : g.commanderId === 'karaca' || g.commanderId === 'turahan' ? 'army/pasa-pasa2' : 'army/pasa-pasa3';
      if (!v.cmd) v.cmd = this.pool.get(key, 0, 'cmd');
      const ctx_ = btx + rx * 0.75 - fx * 0.15;
      const cty = bty + ry * 0.75 - fy * 0.15;
      const cw = this.wp(ctx_, cty);
      const f = facingOf(fx, fy);
      v.cmd
        .setPosition(Math.round(cw.x), Math.round(cw.y))
        .setFrame(frameOf('cmd', moving ? 'walk' : 'idle', Math.floor(moving ? this.time * 8 : this.time * 0.8 + g.id), f.back))
        .setFlipX(f.flip)
        .setDepth(Math.round(cw.y) + 0.003);
      const nt = g.commanderId === 'fatih' ? 2 : 1;
      while (v.tugs.length < nt) v.tugs.push(this.pool.get('army/sancak-tug', 0, 'ban'));
      v.tugs.forEach((t, k) => {
        const off = (k === 0 ? 1.35 : -0.55) + 0;
        const tw = this.wp(btx + rx * off - fx * 0.5, bty + ry * off - fy * 0.5);
        t.setPosition(Math.round(tw.x), Math.round(tw.y))
          .setFrame(frameOf('ban', moving ? 'walk' : 'idle', Math.floor(this.time * 6 + k * 2), f.back))
          .setFlipX(f.flip)
          .setDepth(Math.round(tw.y) + 0.004);
      });
    }
    // baggage camels behind marching columns
    const wantCamels = moving && (state.time.phase === 'yuruyus' || g.order.type === 'git') && (g.type === 'yeniceri' || g.type === 'sipahi' || g.type === 'topcu') && state.time.phase !== 'kusatma' ? 2 : 0;
    while (v.camels.length > wantCamels) this.pool.release(v.camels.pop()!);
    while (v.camels.length < wantCamels) v.camels.push(this.pool.get('army/deve', 0, 'mnt'));
    v.camels.forEach((cm, k) => {
      const p = trailAt(v.trail, rows * sp * 1.15 + 0.8 + k * 0.9);
      const cw = this.wp(p.tx, p.ty);
      const f = facingOf(p.dx, p.dy);
      cm.setPosition(Math.round(cw.x), Math.round(cw.y))
        .setFrame(Math.floor(this.time * 6 + k) % 4)
        .setFlipX(f.flip)
        .setDepth(Math.round(cw.y));
    });
    // dust under marching feet
    if (moving) {
      v.dustT -= dt;
      if (v.dustT <= 0 && v.soldiers.length) {
        v.dustT = mounted ? 0.18 : 0.32;
        const s = v.soldiers[Math.floor(Math.random() * v.soldiers.length)];
        const w = this.wp(s.x, s.y);
        this.rc.fx.dust(w.x, w.y, mounted ? 0.9 : 0.55);
      }
    }
    v.spread = Math.max(maxX - minX, (maxY - minY) * 2) / 2 + 6;
    v.b = { x0: minX - 8, y0: Math.min(minY - 16, bannerTop), x1: maxX + 8, y1: maxY + 3 };
  }

  // ───────────────────────────── casualties ─────────────────────────────

  private onCasualties(groupId: number, count: number): void {
    const v = this.views.get(groupId);
    if (!v || !v.visible || !v.soldiers.length) return;
    const n = Math.min(4, Math.max(1, Math.ceil(count / 35)));
    for (let k = 0; k < n; k++) {
      const s = v.soldiers[Math.floor(Math.random() * v.soldiers.length)];
      const w = this.wp(s.x, s.y);
      // mehter sheets have no death frames: a red-coated, turbaned infantry body stands in
      const mehter = s.layout === 'meh' || s.layout === 'kos';
      this.assault.spawnDeath(mehter ? 'army/sipahi-0' : s.key, mehter ? 'inf' : s.layout, w.x + (Math.random() - 0.5) * 4, w.y, s.flip, s.back);
    }
    v.floatAcc += count;
    if (this.time - v.floatT > 0.7) {
      v.floatT = this.time;
      this.rc.fx.floatText(Math.round(v.bx), Math.round(v.by) - 34, `-${v.floatAcc}`, hex(P.red[6]));
      v.floatAcc = 0;
    }
  }

  // ───────────────────────────── lights ─────────────────────────────

  private updateLights(spots: { x: number; y: number; d: number }[], night: boolean): void {
    const max = 16;
    spots.sort((a, b) => a.d - b.d);
    const use = night ? spots.slice(0, max) : [];
    while (this.lights.length < use.length) this.lights.push(this.rc.fx.light(0, 0, hex(P.fire[5]), 34, 0));
    this.lights.forEach((l, i) => {
      const s = use[i];
      if (!s) {
        l.setIntensity(0);
        return;
      }
      l.setPosition(s.x, s.y);
      l.setIntensity(0.75 + Math.sin(this.time * 11 + i * 1.7) * 0.12);
    });
  }

  // ───────────────────────────── selection & orders ─────────────────────────────

  private updateSelection(state: GameState): void {
    const ids = new Set<number>();
    for (const p of this.rc.store.ui.selection) if (p.kind === 'group') ids.add(Number(p.id));
    for (const [id, sv] of this.sel) {
      if (!ids.has(id) || !this.views.get(id)?.visible) {
        for (const o of [sv.ring, sv.barBg, sv.barMen, sv.barMor, sv.marker, ...sv.dots]) o.destroy();
        this.sel.delete(id);
      }
    }
    for (const id of ids) {
      const v = this.views.get(id);
      const g = state.groups.find((x) => x.id === id);
      if (!v || !v.visible || !g) continue;
      let sv = this.sel.get(id);
      if (!sv) {
        sv = {
          ring: this.scene.add.sprite(0, 0, 'army/halka-1', 0).setDepth(DEPTH.GROUND_DECAL + 6),
          barBg: this.scene.add.image(0, 0, 'army/px').setOrigin(0, 0).setTint(hex(P.outline[0])).setDepth(DEPTH.UI_WORLD),
          barMen: this.scene.add.image(0, 0, 'army/px').setOrigin(0, 0).setDepth(DEPTH.UI_WORLD + 1),
          barMor: this.scene.add.image(0, 0, 'army/px').setOrigin(0, 0).setTint(hex(P.gold[5])).setDepth(DEPTH.UI_WORLD + 1),
          marker: this.scene.add.sprite(0, 0, 'army/hedef', 0).setOrigin(4 / 12, 15 / 16).setDepth(DEPTH.UI_WORLD - 1),
          dots: [],
        };
        this.sel.set(id, sv);
      }
      const c = this.wp(v.cx, v.cy);
      const rpx = v.spread;
      const ri = rpx < 16 ? 0 : rpx < 24 ? 1 : rpx < 34 ? 2 : 3;
      sv.ring.setTexture(`army/halka-${ri}`, Math.floor(this.time * 4) % 3).setPosition(Math.round(c.x), Math.round(c.y));
      // bars
      const bw = 18;
      const bx = Math.round(v.bx - bw / 2);
      const by = Math.round(v.b.y0 - 5);
      sv.barBg.setPosition(bx - 1, by - 1).setDisplaySize(bw + 2, 5);
      const menF = Math.max(0, Math.min(1, g.men / Math.max(1, g.maxMen)));
      sv.barMen.setPosition(bx, by).setDisplaySize(Math.max(1, Math.round(bw * menF)), 1).setTint(hex(menF > 0.5 ? P.green[5] : menF > 0.25 ? P.gold[5] : P.red[5]));
      sv.barMor.setPosition(bx, by + 2).setDisplaySize(Math.max(1, Math.round((bw * g.morale) / 100)), 1).setTint(hex(g.morale > 45 ? P.gold[5] : P.red[6]));
      // order marker and path dots
      const e = extraOf(state, g.id);
      const goal = e.goal ?? (g.path.length ? g.path[g.path.length - 1] : null);
      const hucum = g.order.type === 'hucum';
      if (goal && (g.status === 'yuruyor' || g.status === 'cekiliyor')) {
        const gw = this.wp(goal.tx, goal.ty);
        sv.marker.setVisible(true).setTexture(hucum ? 'army/hedef-hucum' : 'army/hedef', Math.floor(this.time * 6) % 4).setPosition(Math.round(gw.x), Math.round(gw.y));
        const pts: TilePt[] = [{ tx: g.tx, ty: g.ty }, ...g.path];
        const L = trailLength(pts);
        const nd = Math.min(60, Math.floor(L / 0.7));
        while (sv.dots.length < nd) sv.dots.push(this.scene.add.image(0, 0, 'army/nokta').setDepth(DEPTH.GROUND_DECAL + 7));
        while (sv.dots.length > nd) sv.dots.pop()!.destroy();
        const rev = [...pts].reverse();
        const off = (this.time * 1.2) % 0.7;
        for (let k = 0; k < nd; k++) {
          const p = trailAt(rev, Math.max(0, L - (k * 0.7 + off)));
          const w = this.wp(p.tx, p.ty);
          sv.dots[k].setPosition(Math.round(w.x), Math.round(w.y)).setAlpha(0.85);
        }
      } else {
        sv.marker.setVisible(false);
        while (sv.dots.length) sv.dots.pop()!.destroy();
      }
    }
  }

  private pick(wx: number, wy: number, state: GameState): PickResult | null {
    let best: PickResult | null = null;
    for (const v of this.views.values()) {
      if (!v.visible) continue;
      const b = v.b;
      if (wx < b.x0 || wx > b.x1 || wy < b.y0 || wy > b.y1) continue;
      const c = this.wp(v.cx, v.cy);
      const score = 1.5 + Math.hypot(wx - c.x, wy - c.y) / 40;
      if (!best || score < best.score) best = { kind: 'group', id: v.id, score };
    }
    void state;
    return best;
  }

  private pickRect(x0: number, y0: number, x1: number, y1: number, state: GameState): PickResult[] {
    const out: PickResult[] = [];
    for (const v of this.views.values()) {
      if (!v.visible) continue;
      const c = this.wp(v.cx, v.cy);
      if (c.x >= x0 && c.x <= x1 && c.y >= y0 && c.y <= y1) out.push({ kind: 'group', id: v.id, score: 1 });
    }
    void state;
    return out;
  }

  private order(input: OrderInput, state: GameState): boolean {
    const ids = input.selection.filter((p) => p.kind === 'group').map((p) => Number(p.id));
    if (!ids.length) return false;
    const gs = ids.map((id) => state.groups.find((g) => g.id === id)).filter((g): g is UnitGroup => !!g);
    let sid: string | null = null;
    if (input.target?.kind === 'section') sid = String(input.target.id);
    if (!sid) sid = sectionAt(input.tile.tx, input.tile.ty, 2.2);
    const store = this.rc.store;
    const siege = state.time.phase === 'kusatma';
    let label = 'Yürü!';
    let hucum = false;
    if (sid && siege && isLandSection(sid)) {
      const allArchers = gs.every((g) => g.type === 'azap');
      const allMiners = gs.every((g) => g.type === 'lagimci');
      const type = allMiners ? 'lagim-kaz' : allArchers ? 'bombardimani-koru' : 'hucum';
      store.dispatch({ t: 'emir', groupIds: ids, order: { type, sectionId: sid } });
      label = type === 'hucum' ? 'Hücum!' : type === 'lagim-kaz' ? 'Lağım!' : 'Okçular, koruyun!';
      hucum = type === 'hucum';
    } else {
      store.dispatch({ t: 'emir', groupIds: ids, order: { type: 'git', target: { tx: input.tile.tx, ty: input.tile.ty } } });
    }
    this.rc.fx.floatText(Math.round(input.wx), Math.round(input.wy) - 10, label, hex(hucum ? P.red[6] : P.gold[5]));
    const m = this.scene.add.sprite(Math.round(input.wx), Math.round(input.wy), hucum ? 'army/hedef-hucum' : 'army/hedef', 0).setOrigin(4 / 12, 15 / 16).setDepth(DEPTH.UI_WORLD - 1);
    this.clickMarks.push({ s: m, t: 1.2 });
    return ids.length === input.selection.length;
  }

  private updateClickMarks(dt: number): void {
    for (let i = this.clickMarks.length - 1; i >= 0; i--) {
      const c = this.clickMarks[i];
      c.t -= dt;
      c.s.setFrame(Math.floor(this.time * 8) % 4).setAlpha(Math.min(1, c.t * 2));
      if (c.t <= 0) {
        c.s.destroy();
        this.clickMarks.splice(i, 1);
      }
    }
  }

  // ───────────────────────────── Sultan's tour & camp fires ─────────────────────────────

  private updateVisit(state: GameState, dt: number): void {
    const vs = army(state).visit;
    const active = vs && state.time.day >= vs.start && state.time.day < vs.until;
    if (!active) {
      if (this.visit) {
        for (const s of this.visit.sprites) this.pool.release(s);
        this.visit = null;
      }
      return;
    }
    if (!this.visit || this.visit.start !== vs!.start) {
      const route: TilePt[] = [landmarkTile('otag')];
      for (let k = 0; k < 4; k++) route.push(campSlot(this.rc.world, 'merkez', k).pos);
      route.push(campSlot(this.rc.world, 'karaca', 2).pos, campSlot(this.rc.world, 'karaca', 0).pos);
      const sprites = [
        this.pool.get('army/pasa-fatih', 0, 'cmd'),
        this.pool.get('army/sancak-tug', 0, 'ban'),
        this.pool.get('army/sancak-tug', 0, 'ban'),
        this.pool.get('army/sancak-sultan', 0, 'ban'),
        this.pool.get('army/sipahi-atli-0', 0, 'mnt'),
        this.pool.get('army/sipahi-atli-1', 0, 'mnt'),
      ];
      this.visit = { start: vs!.start, route, sprites };
    }
    const v = this.visit!;
    const L = trailLength(v.route);
    const f = (state.time.day - vs!.start) / (vs!.until - vs!.start);
    const rev = [...v.route].reverse();
    const offsets = [0, -0.7, -1.1, -1.6, -2.4, -2.8];
    v.sprites.forEach((s, k) => {
      const d = Math.max(0, Math.min(L, f * L + offsets[k]));
      const p = trailAt(rev, L - d);
      const lat = k === 1 ? 0.5 : k === 2 ? -0.5 : k >= 4 ? (k % 2 ? 0.5 : -0.5) : 0;
      const w = this.wp(p.tx - p.dy * lat, p.ty + p.dx * lat);
      const fc = facingOf(p.dx, p.dy);
      const layout: Layout = k === 0 ? 'cmd' : k >= 4 ? 'mnt' : 'ban';
      s.setPosition(Math.round(w.x), Math.round(w.y))
        .setFrame(frameOf(layout, 'walk', Math.floor(this.time * 8 + k), fc.back))
        .setFlipX(fc.flip)
        .setDepth(Math.round(w.y));
      if (k === 0 && Math.random() < dt * 3) this.rc.fx.dust(w.x, w.y, 0.8);
    });
  }

  private updateCampFires(state: GameState): void {
    const f = army(state).final;
    const fr = dayFrac(state.time.day);
    const want = !!f && (f.phase === 'ilan' || f.phase === 'toplanma') && (fr > 0.6 || fr < 0.05);
    if (want && !this.campFires.length) {
      for (const wing of ['merkez', 'karaca', 'ishak'] as const) {
        for (let k = 0; k < 3; k++) {
          const p = campSlot(this.rc.world, wing, k * 2 + 1).pos;
          const w = this.wp(p.tx - 1.6, p.ty + 0.8);
          this.campFires.push({ h: this.rc.fx.fire(w.x, w.y, 0.8) });
        }
      }
    } else if (!want && this.campFires.length) {
      for (const c of this.campFires) c.h.destroy();
      this.campFires = [];
    }
  }

  private destroyAll(): void {
    for (const v of this.views.values()) this.hideView(v);
    this.views.clear();
    for (const sv of this.sel.values()) for (const o of [sv.ring, sv.barBg, sv.barMen, sv.barMor, sv.marker, ...sv.dots]) o.destroy();
    this.sel.clear();
    for (const l of this.lights) l.destroy();
    this.lights = [];
    for (const c of this.campFires) c.h.destroy();
    this.campFires = [];
    for (const t of this.torchPool) t.destroy();
    this.assault.destroy();
    this.pool.destroy();
  }
}

export { ORIGIN };
void FLAG;
