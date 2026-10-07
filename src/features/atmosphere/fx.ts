import Phaser from 'phaser';
import { hex, P } from '../../art/palette';
import type { FxApi, LightHandle, LoopHandle, ProjectileOpts } from '../../core/fx';
import { DEPTH } from '../../core/layers';
import { ARROW_DIRS, FLAME_FRAMES, MUZZLE_DIRS, MUZZLE_FRAMES, TONE } from './art-fx';
import { FONT_ADV, FONT_CELL_H, FONT_CELL_W, FONT_INDEX } from './art-sky';
import type { Lighting } from './lighting';
import { Mode, type Part, type Particles } from './particles';

/**
 * FxApi implementation. Every effect is built from pooled particles, pooled glow
 * sprites and lightmap lights. Effects far outside the camera view are skipped
 * (loops keep their state but stop spawning), so calling these often is cheap.
 */

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(arr: readonly T[]): T => arr[(Math.random() * arr.length) | 0];

const WARM = 0xffb060;
const HOT = 0xfff0c0;
const FIRE_LIGHT = 0xff9a40;

interface FireLoop {
  x: number;
  y: number;
  size: number;
  intensity: number;
  alive: boolean;
  flames: { img: Phaser.GameObjects.Image; key: string; dx: number; dy: number; phase: number; fps: number }[];
  glow: Phaser.GameObjects.Image | null;
  light: LightHandle;
  emberAcc: number;
  smokeAcc: number;
  t: number;
  visible: boolean;
}

interface SmokeLoop {
  x: number;
  y: number;
  size: number;
  intensity: number;
  alive: boolean;
  acc: number;
}

interface Projectile {
  active: boolean;
  fx: number;
  fy: number;
  tx: number;
  ty: number;
  arc: number;
  dur: number;
  t: number;
  kind: NonNullable<ProjectileOpts['kind']>;
  trail: boolean;
  onImpact?: () => void;
  img: Phaser.GameObjects.Image | null;
  shadow: Phaser.GameObjects.Image | null;
  glow: Phaser.GameObjects.Image | null;
  light: LightHandle | null;
  trailAcc: number;
  lastX: number;
  lastY: number;
}

interface FloatText {
  imgs: Phaser.GameObjects.Image[];
  offs: number[];
  x: number;
  y: number;
  t: number;
  color: number;
  life: number;
  w: number;
}

const BALL_KEYS: Record<string, { key: string; size: number; shadow: number }> = {
  gulle: { key: 'fx/gulle', size: 7, shadow: 0 },
  'buyuk-gulle': { key: 'fx/buyuk-gulle', size: 13, shadow: 1 },
  ok: { key: 'fx/ok', size: 13, shadow: 0 },
  ates: { key: 'fx/ates', size: 9, shadow: 0 },
  kursun: { key: 'fx/kursun', size: 3, shadow: 0 },
};

export class FxImpl implements FxApi {
  private fires: FireLoop[] = [];
  private smokes: SmokeLoop[] = [];
  private projs: Projectile[] = [];
  private texts: FloatText[] = [];
  private glyphFree: Phaser.GameObjects.Image[] = [];
  private glyphAll: Phaser.GameObjects.Image[] = [];
  private flameFree: Map<string, Phaser.GameObjects.Image[]> = new Map();
  private shakeAmp = 0;
  private shakeDur = 0;
  private shakeT = 0;
  private shakeTick = 0;
  private shakeEffect: any;
  private shakeOrigUpdate: unknown;
  /** Called on every muzzle/impact (reactive layer hooks: haze, bird startle…). */
  onBlast: ((x: number, y: number, power: number) => void) | null = null;
  /** Night factor 0..1 (glow strength) — set by the renderer each frame. */
  night = 0;

  constructor(
    private scene: Phaser.Scene,
    private parts: Particles,
    private lighting: Lighting,
  ) {
    // Pixel-perfect decaying camera shake: drive Phaser's shake offset ourselves
    // (integer art-pixel offsets, applied in Camera.preRender).
    const cam = scene.cameras.main;
    this.shakeEffect = (cam as any).shakeEffect;
    if (this.shakeEffect) {
      this.shakeOrigUpdate = Object.prototype.hasOwnProperty.call(this.shakeEffect, 'update') ? this.shakeEffect.update : undefined;
      this.shakeEffect.update = () => {};
    }
  }

  // ───────────────────────── helpers ─────────────────────────

  private puff(
    x: number,
    y: number,
    o: {
      tone: number;
      r0: number;
      r1: number;
      life: number;
      vx?: number;
      vy?: number;
      vz?: number;
      z?: number;
      drag?: number;
      wind?: number;
      alpha?: number;
      fadeAt?: number;
      fadeIn?: number;
      depth?: number;
      dis?: number;
      tint?: number;
      az?: number;
    },
  ): Part | null {
    const p = this.parts.take();
    if (!p) return null;
    p.mode = Mode.Puff;
    p.x = x;
    p.y = y;
    p.z = o.z ?? 0;
    p.vx = o.vx ?? 0;
    p.vy = o.vy ?? 0;
    p.vz = o.vz ?? 0;
    p.az = o.az ?? 0;
    p.drag = o.drag ?? 1.2;
    p.wind = o.wind ?? 0.6;
    p.tone = o.tone;
    p.variant = (Math.random() * 2) | 0;
    p.r0 = o.r0;
    p.r1 = o.r1;
    p.life = o.life;
    p.alpha = o.alpha ?? 0.92;
    p.fadeAt = o.fadeAt ?? 0.45;
    p.fadeIn = o.fadeIn ?? 0.06;
    p.dis = o.dis ?? 1;
    p.flipX = Math.random() < 0.5;
    p.tint = o.tint ?? 0xffffff;
    p.depth = o.depth ?? y + 4;
    p.ox = 0.5;
    p.oy = 0.5;
    this.parts.start(p);
    return p;
  }

  private bit(
    key: string,
    mode: Mode,
    x: number,
    y: number,
    o: {
      f0?: number;
      count?: number;
      fps?: number;
      life: number;
      vx?: number;
      vy?: number;
      vz?: number;
      z?: number;
      az?: number;
      drag?: number;
      wind?: number;
      alpha?: number;
      fadeAt?: number;
      add?: boolean;
      depth?: number;
      tint?: number;
      ox?: number;
      oy?: number;
      bounce?: number;
      flipX?: boolean;
    },
  ): Part | null {
    const p = this.parts.take();
    if (!p) return null;
    p.mode = mode;
    p.key = key;
    p.f0 = o.f0 ?? 0;
    p.count = o.count ?? 1;
    p.fps = o.fps ?? 10;
    p.x = x;
    p.y = y;
    p.z = o.z ?? 0;
    p.vx = o.vx ?? 0;
    p.vy = o.vy ?? 0;
    p.vz = o.vz ?? 0;
    p.az = o.az ?? 0;
    p.drag = o.drag ?? 0;
    p.wind = o.wind ?? 0;
    p.life = o.life;
    p.alpha = o.alpha ?? 1;
    p.fadeAt = o.fadeAt ?? 0.6;
    p.add = o.add ?? false;
    p.depth = o.depth ?? y + 2;
    p.tint = o.tint ?? 0xffffff;
    p.ox = o.ox ?? 0.5;
    p.oy = o.oy ?? 0.5;
    p.bounce = o.bounce ?? 0;
    p.flipX = o.flipX ?? false;
    this.parts.start(p);
    return p;
  }

  private ember(x: number, y: number, z: number, spread = 14, up = 40): void {
    this.bit('fx/ember', Mode.Cool, x + rnd(-2, 2), y + rnd(-1, 1), {
      f0: 0,
      count: 4,
      life: rnd(0.8, 2.2),
      z,
      vx: rnd(-spread, spread),
      vy: rnd(-spread, spread) * 0.4,
      vz: rnd(up * 0.5, up),
      az: -6,
      drag: 0.7,
      wind: 1.2,
      fadeAt: 0.7,
      add: true,
      depth: DEPTH.GLOW + 1,
    });
  }

  private spark(x: number, y: number, z: number, vx: number, vy: number, vz: number, life = 0.45): void {
    this.bit('fx/spark', Mode.Cool, x, y, {
      count: 4,
      life,
      z,
      vx,
      vy,
      vz,
      az: -220,
      drag: 1.5,
      fadeAt: 0.6,
      add: true,
      bounce: 0.3,
      depth: DEPTH.GLOW + 2,
    });
  }

  private ring(x: number, y: number, big: boolean, life: number, tint = 0xffffff, alpha = 0.8, depth?: number): void {
    this.bit(big ? 'fx/ring-l' : 'fx/ring', Mode.Seq, x, y, {
      count: big ? 10 : 8,
      life,
      alpha,
      fadeAt: 0.35,
      tint,
      depth: depth ?? DEPTH.GROUND_DECAL + 50,
    });
  }

  private camDistFactor(x: number, y: number): number {
    const v = this.parts.view;
    const cx = v.centerX;
    const cy = v.centerY;
    const dx = Math.max(0, Math.abs(x - cx) - v.width / 2);
    const dy = Math.max(0, Math.abs(y - cy) - v.height / 2);
    const d = Math.hypot(dx, dy * 1.5);
    return Math.max(0, 1 - d / 700);
  }

  // ───────────────────────── FxApi ─────────────────────────

  light(x: number, y: number, color: number, radius: number, intensity: number): LightHandle {
    return this.lighting.addLight(x, y, color, radius, intensity);
  }

  flash(x: number, y: number, color: number, radius: number, duration = 0.25): void {
    if (!this.parts.inView(x, y, radius + 32)) return;
    this.lighting.flash(x, y, color, radius, duration);
  }

  smoke(x: number, y: number, size = 1, count = 4): void {
    if (!this.parts.inView(x, y, 120)) return;
    const n = Math.max(1, Math.round(count * this.parts.budget()));
    const s = Math.max(0.4, Math.min(3, size));
    for (let i = 0; i < n; i++) {
      const r0 = Math.min(6, 1 + s * 1.2 + rnd(-0.5, 1));
      this.puff(x + rnd(-3, 3) * s, y + rnd(-2, 2) * s, {
        tone: Math.random() < 0.6 ? TONE.gray : TONE.light,
        r0,
        r1: Math.min(13, r0 + 2 + s * 2.4),
        life: rnd(1.6, 3.2) * (0.7 + s * 0.3),
        vx: rnd(-6, 6) * s,
        vy: rnd(-3, 3),
        vz: rnd(10, 22) * (0.8 + s * 0.25),
        z: rnd(0, 4),
        drag: 0.9,
        wind: 0.7,
        alpha: rnd(0.75, 0.92),
      });
    }
  }

  fire(x: number, y: number, size = 1): LoopHandle {
    const s = Math.max(0.4, Math.min(3, size));
    const flames: FireLoop['flames'] = [];
    const add = (key: string, dx: number, dy: number) =>
      flames.push({ img: this.takeFlame(key), key, dx, dy, phase: Math.random() * 8, fps: rnd(10, 14) });
    if (s < 0.9) add('fx/flame-s', 0, 0);
    else if (s < 1.6) {
      add('fx/flame-m', 0, 0);
      add('fx/flame-s', -5, 1);
    } else if (s < 2.4) {
      add('fx/flame-l', 0, 0);
      add('fx/flame-m', -8, 2);
      add('fx/flame-m', 7, 1);
      add('fx/flame-s', 2, 3);
    } else {
      add('fx/flame-l', -5, 0);
      add('fx/flame-l', 6, 1);
      add('fx/flame-m', -12, 3);
      add('fx/flame-m', 12, 3);
      add('fx/flame-s', 0, 4);
    }
    const rec: FireLoop = {
      x,
      y,
      size: s,
      intensity: 1,
      alive: true,
      flames,
      glow: this.lighting.takeGlow(8 + s * 9, 0xff7a28),
      light: this.lighting.addLight(x, y - 4 * s, FIRE_LIGHT, 28 + s * 26, 1.2),
      emberAcc: 0,
      smokeAcc: 0,
      t: Math.random() * 10,
      visible: true,
    };
    this.fires.push(rec);
    return {
      setPosition: (nx: number, ny: number) => {
        rec.x = nx;
        rec.y = ny;
      },
      setIntensity: (v: number) => {
        rec.intensity = Math.max(0, v);
      },
      destroy: () => {
        rec.alive = false;
      },
    };
  }

  private takeFlame(key: string): Phaser.GameObjects.Image {
    const list = this.flameFree.get(key);
    const img = list?.pop() ?? this.scene.add.image(0, 0, key, 0).setOrigin(0, 0);
    img.setVisible(true);
    return img;
  }

  private releaseFlame(key: string, img: Phaser.GameObjects.Image): void {
    img.setVisible(false);
    let list = this.flameFree.get(key);
    if (!list) this.flameFree.set(key, (list = []));
    list.push(img);
  }

  smokeColumn(x: number, y: number, size = 1): LoopHandle {
    const rec: SmokeLoop = { x, y, size: Math.max(0.3, Math.min(3, size)), intensity: 1, alive: true, acc: Math.random() };
    this.smokes.push(rec);
    return {
      setPosition: (nx: number, ny: number) => {
        rec.x = nx;
        rec.y = ny;
      },
      setIntensity: (v: number) => {
        rec.intensity = Math.max(0, v);
      },
      destroy: () => {
        rec.alive = false;
      },
    };
  }

  dust(x: number, y: number, size = 1): void {
    if (!this.parts.inView(x, y, 100)) return;
    const s = Math.max(0.4, Math.min(3, size));
    const n = Math.max(2, Math.round((4 + s * 4) * this.parts.budget()));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd(-0.3, 0.3);
      const sp = rnd(14, 34) * s;
      const r0 = Math.min(5, 1 + s + rnd(0, 1));
      this.puff(x + Math.cos(a) * 2, y + Math.sin(a), {
        tone: Math.random() < 0.6 ? TONE.sand : TONE.dirt,
        r0,
        r1: Math.min(12, r0 + 2 + s * 2),
        life: rnd(1.1, 2.0) * (0.8 + s * 0.25),
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp * 0.5,
        vz: rnd(4, 14),
        drag: 2.6,
        wind: 0.35,
        alpha: rnd(0.55, 0.72),
        fadeAt: 0.3,
        dis: 1.2,
      });
    }
  }

  debris(x: number, y: number, count = 6, palette: 'tas' | 'tugla' | 'tahta' = 'tas'): void {
    if (!this.parts.inView(x, y, 100)) return;
    const n = Math.max(1, Math.round(count * this.parts.budget()));
    const mat = palette === 'tas' ? 0 : palette === 'tugla' ? 1 : 2;
    for (let i = 0; i < n; i++) {
      const m = palette === 'tas' && Math.random() < 0.25 ? 1 : mat; // walls: limestone with brick bands
      const shape = Math.random() < 0.3 ? 2 + ((Math.random() * 2) | 0) : (Math.random() * 2) | 0;
      const a = rnd(0, Math.PI * 2);
      const sp = rnd(18, 70);
      const p = this.bit('fx/debris', Mode.Debris, x + rnd(-3, 3), y + rnd(-2, 2), {
        f0: (m * 4 + shape) * 4,
        count: 4,
        life: rnd(2.5, 5),
        z: rnd(2, 8),
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp * 0.5,
        vz: rnd(50, 150),
        az: -380,
        fadeAt: 0.75,
        depth: y + 6,
        bounce: 0.38,
      });
      if (p) {
        p.spinRate = rnd(8, 20) * (Math.random() < 0.5 ? -1 : 1);
        p.spin = Math.random() * 4;
      }
    }
  }

  muzzle(x: number, y: number, dirX: number, dirY: number, power = 1): void {
    const pw = Math.max(0.5, Math.min(3, power));
    const att = this.camDistFactor(x, y);
    if (att > 0) this.shake(Math.min(1, 0.12 * pw * pw * att), 0.18 + pw * 0.12);
    this.onBlast?.(x, y, pw);
    if (!this.parts.inView(x, y, 160)) return;
    const len = Math.hypot(dirX, dirY) || 1;
    const dx = dirX / len;
    const dy = dirY / len;
    const big = pw >= 1.8;
    // directional flash sprite (pre-drawn 16 directions)
    const ang = Math.atan2(dy, dx);
    const di = ((Math.round((ang / (Math.PI * 2)) * MUZZLE_DIRS) % MUZZLE_DIRS) + MUZZLE_DIRS) % MUZZLE_DIRS;
    this.bit(big ? 'fx/muzzle-l' : 'fx/muzzle', Mode.Seq, x, y, {
      f0: di * MUZZLE_FRAMES,
      count: MUZZLE_FRAMES,
      life: 0.16 + pw * 0.05,
      fadeAt: 0.8,
      depth: y + 30,
    });
    // additive hot glow + lightmap flash
    this.lighting.flash(x + dx * 6, y + dy * 3, HOT, 30 + pw * 26, 0.22 + pw * 0.08, 0.9 + pw * 0.15);
    this.lighting.flash(x + dx * 10, y + dy * 5, WARM, 50 + pw * 30, 0.5 + pw * 0.1, 0.45);
    // shockwave ring on the ground
    this.ring(x, y + 2, big, 0.35 + pw * 0.12, 0xffffff, 0.75);
    // smoke: forward cone + muzzle ring (powder smoke is pale)
    const b = this.parts.budget();
    const nCone = Math.round((7 + pw * 7) * b);
    for (let i = 0; i < nCone; i++) {
      const sp = rnd(30, 95) * (0.7 + pw * 0.35);
      const spread = rnd(-0.38, 0.38);
      const ca = Math.cos(spread);
      const sa = Math.sin(spread);
      const vx = (dx * ca - dy * sa) * sp;
      const vy = (dx * sa + dy * ca) * sp;
      const r0 = Math.min(6, 1 + pw + rnd(0, 1.5));
      this.puff(x + dx * rnd(4, 9), y + dy * rnd(2, 5), {
        tone: Math.random() < 0.75 ? TONE.light : TONE.gray,
        r0,
        r1: Math.min(13, r0 + 3 + pw * 2.4),
        life: rnd(2.2, 4) * (0.8 + pw * 0.3),
        vx,
        vy: vy * 0.6,
        vz: rnd(5, 14),
        z: rnd(2, 6),
        drag: 2.4,
        wind: 0.8,
        alpha: rnd(0.68, 0.85),
        fadeAt: 0.5,
        depth: y + 8,
      });
    }
    const nRing = Math.round((4 + pw * 3) * b);
    for (let i = 0; i < nRing; i++) {
      const a = (i / nRing) * Math.PI * 2;
      const sp = rnd(16, 30) * (0.8 + pw * 0.3);
      this.puff(x, y, {
        tone: TONE.light,
        r0: Math.min(5, 1 + pw * 0.8),
        r1: Math.min(11, 3 + pw * 2.4),
        life: rnd(1.6, 2.8) * (0.8 + pw * 0.25),
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp * 0.5,
        vz: rnd(4, 10),
        z: 3,
        drag: 2.8,
        wind: 0.7,
        alpha: rnd(0.6, 0.78),
        fadeAt: 0.45,
        depth: y + 7,
      });
    }
    // sparks & burning wadding thrown forward
    const nSp = Math.round((6 + pw * 6) * b);
    for (let i = 0; i < nSp; i++) {
      const sp = rnd(60, 190);
      const spread = rnd(-0.5, 0.5);
      const vx = (dx * Math.cos(spread) - dy * Math.sin(spread)) * sp;
      const vy = (dx * Math.sin(spread) + dy * Math.cos(spread)) * sp;
      this.spark(x + dx * 5, y + dy * 3, 4, vx, vy * 0.6, rnd(10, 60), rnd(0.25, 0.6));
    }
    for (let i = 0; i < Math.round(3 * pw * b); i++) this.ember(x + dx * 8, y + dy * 4, 4, 30, 30);
    // dust kicked up under the barrel
    this.dust(x - dx * 4, y - dy * 2 + 3, 0.6 + pw * 0.5);
  }

  impact(x: number, y: number, power = 1, onWall = false): void {
    const pw = Math.max(0.3, Math.min(3, power));
    const att = this.camDistFactor(x, y);
    if (att > 0) this.shake(Math.min(1, 0.1 * pw * pw * att), 0.16 + pw * 0.1);
    this.onBlast?.(x, y, pw * 0.8);
    if (!this.parts.inView(x, y, 160)) return;
    const b = this.parts.budget();
    const depth = onWall ? y + 26 : y + 6;
    // flash
    this.lighting.flash(x, y - 4, HOT, 22 + pw * 14, 0.16 + pw * 0.05, 0.8);
    // shockwave
    this.ring(x, y + (onWall ? 8 : 1), pw >= 1.8, 0.3 + pw * 0.1, onWall ? 0xe8dcc0 : 0xf0e0c0, 0.7);
    // dust plume: ground → sand/dirt, walls → limestone dust + brick red
    const nPlume = Math.round((6 + pw * 6) * b);
    for (let i = 0; i < nPlume; i++) {
      const a = rnd(-Math.PI, 0); // upward hemisphere (screen)
      const sp = rnd(10, 40) * (0.7 + pw * 0.3);
      const r0 = Math.min(6, 1 + pw + rnd(0, 1));
      this.puff(x + rnd(-3, 3), y + rnd(-2, 2), {
        tone: onWall ? (Math.random() < 0.7 ? TONE.stone : TONE.light) : Math.random() < 0.5 ? TONE.dirt : TONE.sand,
        r0,
        r1: Math.min(13, r0 + 3 + pw * 2.5),
        life: rnd(2, 3.6) * (0.8 + pw * 0.3),
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp * 0.3,
        vz: rnd(14, 40) * (0.7 + pw * 0.25),
        z: rnd(0, 6),
        drag: 1.8,
        wind: 0.6,
        alpha: rnd(0.68, 0.85),
        fadeAt: 0.42,
        depth,
      });
    }
    // fast low dust skirt
    const nSkirt = Math.round((4 + pw * 4) * b);
    for (let i = 0; i < nSkirt; i++) {
      const a = (i / nSkirt) * Math.PI * 2;
      const sp = rnd(40, 70) * (0.6 + pw * 0.3);
      this.puff(x, y + (onWall ? 8 : 0), {
        tone: onWall ? TONE.stone : TONE.sand,
        r0: 1,
        r1: Math.min(9, 3 + pw * 2),
        life: rnd(0.8, 1.4),
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp * 0.5,
        vz: 2,
        drag: 3.5,
        wind: 0.3,
        alpha: 0.6,
        fadeAt: 0.25,
        dis: 1.3,
        depth,
      });
    }
    // debris
    const nDeb = Math.round((5 + pw * 6) * b);
    if (onWall) {
      this.debris(x, y, Math.ceil(nDeb * 0.65), 'tas');
      this.debris(x, y, Math.ceil(nDeb * 0.35), 'tugla');
    } else this.debris(x, y, Math.ceil(nDeb * 0.5), 'tas');
    // sparks from stone on stone
    for (let i = 0; i < Math.round((3 + pw * 3) * b); i++)
      this.spark(x, y, 4, rnd(-90, 90), rnd(-40, 40), rnd(30, 120), rnd(0.2, 0.45));
    if (!onWall) this.scorch?.(x, y + 1, pw);
  }

  /** Optional hook (reactive layer): ground scorch decal. */
  scorch: ((x: number, y: number, power: number) => void) | null = null;

  splash(x: number, y: number, size = 1): void {
    if (!this.parts.inView(x, y, 100)) return;
    const s = Math.max(0.3, Math.min(3, size));
    const big = s >= 1.2;
    const b = this.parts.budget();
    this.bit(big ? 'fx/splash-l' : 'fx/splash', Mode.Seq, x, y + 1, {
      count: big ? 9 : 8,
      life: 0.55 + s * 0.25,
      fadeAt: 0.85,
      oy: 1,
      depth: y + 3,
    });
    // droplets
    const nDrop = Math.round((6 + s * 8) * b);
    for (let i = 0; i < nDrop; i++) {
      const a = rnd(0, Math.PI * 2);
      const sp = rnd(10, 40) * s;
      this.bit('fx/drop', Mode.Cool, x + rnd(-2, 2), y, {
        count: 3,
        life: rnd(0.5, 1.0),
        z: rnd(4, 14) * s,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp * 0.5,
        vz: rnd(40, 110) * Math.sqrt(s),
        az: -300,
        depth: y + 4,
      });
    }
    // foam rings + mist
    this.ring(x, y + 1, big, 0.7 + s * 0.3, 0xd8fff4, 0.7, DEPTH.GROUND_DECAL + 40);
    if (big) setTimeoutScene(this.scene, 180, () => this.ring(x, y + 1, false, 0.8, 0xbfeee6, 0.6, DEPTH.GROUND_DECAL + 40));
    const nMist = Math.round((2 + s * 2) * b);
    for (let i = 0; i < nMist; i++)
      this.puff(x + rnd(-4, 4), y, {
        tone: TONE.mist,
        r0: 1,
        r1: Math.min(10, 3 + s * 2.5),
        life: rnd(0.8, 1.6),
        vx: rnd(-10, 10),
        vz: rnd(8, 20),
        z: rnd(2, 8),
        drag: 2,
        wind: 0.5,
        alpha: 0.7,
        fadeAt: 0.3,
        dis: 2,
      });
  }

  sparks(x: number, y: number, count = 8): void {
    if (!this.parts.inView(x, y, 60)) return;
    const n = Math.max(1, Math.round(count * this.parts.budget()));
    for (let i = 0; i < n; i++) {
      const a = rnd(0, Math.PI * 2);
      const sp = rnd(40, 120);
      this.spark(x, y, 2, Math.cos(a) * sp, Math.sin(a) * sp * 0.5, rnd(20, 80), rnd(0.2, 0.5));
    }
    this.lighting.flash(x, y, HOT, 10, 0.1, 0.5);
  }

  projectile(fromX: number, fromY: number, toX: number, toY: number, opts: ProjectileOpts = {}): void {
    const kind = opts.kind ?? 'gulle';
    const dist = Math.hypot(toX - fromX, toY - fromY);
    const speed = kind === 'ok' ? 240 : kind === 'kursun' ? 520 : kind === 'buyuk-gulle' ? 260 : 300;
    const dur = opts.duration ?? Math.max(0.25, Math.min(2.6, dist / speed));
    const arc = opts.arc ?? (kind === 'kursun' ? dist * 0.03 : kind === 'ok' ? dist * 0.28 : dist * 0.18);
    let pr = this.projs.find((p) => !p.active);
    if (!pr) {
      if (this.projs.length >= 220) {
        // over budget: resolve immediately but keep the gameplay callback
        opts.onImpact?.();
        return;
      }
      pr = {
        active: false,
        fx: 0,
        fy: 0,
        tx: 0,
        ty: 0,
        arc: 0,
        dur: 1,
        t: 0,
        kind: 'gulle',
        trail: true,
        img: null,
        shadow: null,
        glow: null,
        light: null,
        trailAcc: 0,
        lastX: 0,
        lastY: 0,
      };
      this.projs.push(pr);
    }
    pr.active = true;
    pr.fx = fromX;
    pr.fy = fromY;
    pr.tx = toX;
    pr.ty = toY;
    pr.arc = arc;
    pr.dur = dur;
    pr.t = 0;
    pr.kind = kind;
    pr.trail = opts.trail ?? kind !== 'ok';
    pr.onImpact = opts.onImpact;
    pr.trailAcc = 0;
    pr.lastX = fromX;
    pr.lastY = fromY;
    const def = BALL_KEYS[kind] ?? BALL_KEYS.gulle;
    if (!pr.img) pr.img = this.scene.add.image(0, 0, def.key, 0).setOrigin(0, 0).setDepth(DEPTH.AIR);
    else pr.img.setTexture(def.key, 0);
    pr.img.setVisible(false);
    if (!pr.shadow) pr.shadow = this.scene.add.image(0, 0, 'fx/shadow', 0).setOrigin(0, 0).setDepth(DEPTH.GROUND_DECAL + 60);
    pr.shadow.setFrame(def.shadow).setVisible(false);
    if (kind === 'ates') {
      pr.glow = this.lighting.takeGlow(16, 0xff8a30);
      pr.light = this.lighting.addLight(fromX, fromY, FIRE_LIGHT, 24, 1);
    }
  }

  shake(intensity: number, duration = 0.3): void {
    const i = Math.max(0, Math.min(1, intensity));
    if (i <= 0.001) return;
    // decaying amplitude; a new bigger shake overrides a weaker one
    const remaining = this.shakeDur > 0 ? this.shakeAmp * Math.pow(1 - Math.min(1, this.shakeT / this.shakeDur), 2) : 0;
    if (i >= remaining) {
      this.shakeAmp = i;
      this.shakeDur = Math.max(0.05, duration);
      this.shakeT = 0;
    } else {
      this.shakeAmp = Math.min(1, remaining + i * 0.3);
    }
  }

  floatText(x: number, y: number, text: string, color = 0xffffff): void {
    if (!this.parts.inView(x, y, 40)) return;
    if (this.texts.length > 40) this.finishText(this.texts.shift()!);
    const up = text.toLocaleUpperCase('tr-TR');
    const imgs: Phaser.GameObjects.Image[] = [];
    const offs: number[] = [];
    let cx = 0;
    for (const ch of up) {
      const idx = FONT_INDEX[ch];
      if (idx === undefined) {
        cx += 3;
        continue;
      }
      const img = this.glyphFree.pop() ?? this.newGlyph();
      img.setFrame(idx);
      img.setVisible(true);
      img.setTint(0xffffff);
      imgs.push(img);
      offs.push(cx);
      cx += FONT_ADV[ch] + 1;
    }
    this.texts.push({ imgs, offs, x: x + rnd(-3, 3), y, t: 0, color, life: 1.25, w: cx - 1 });
  }

  private newGlyph(): Phaser.GameObjects.Image {
    const img = this.scene.add.image(0, 0, 'fx/font', 0).setOrigin(0, 0).setDepth(DEPTH.UI_WORLD + 10);
    this.glyphAll.push(img);
    return img;
  }

  private finishText(ft: FloatText): void {
    for (const img of ft.imgs) {
      img.setVisible(false);
      this.glyphFree.push(img);
    }
    ft.imgs.length = 0;
  }

  // ───────────────────────── per-frame ─────────────────────────

  update(dt: number, time: number): void {
    this.updateShake(dt);
    this.updateFires(dt);
    this.updateSmokes(dt);
    this.updateProjectiles(dt);
    this.updateTexts(dt);
    void time;
  }

  private updateShake(dt: number): void {
    const se = this.shakeEffect;
    if (!se) return;
    if (this.shakeDur <= 0) {
      se.isRunning = false;
      se._offsetX = 0;
      se._offsetY = 0;
      return;
    }
    this.shakeT += dt;
    const t = this.shakeT / this.shakeDur;
    if (t >= 1) {
      this.shakeDur = 0;
      se.isRunning = false;
      se._offsetX = 0;
      se._offsetY = 0;
      return;
    }
    // change offset at ~30 Hz; integer art pixels so the image stays on the pixel grid
    this.shakeTick -= dt;
    if (this.shakeTick <= 0) {
      this.shakeTick = 1 / 30;
      const zoom = this.scene.cameras.main.zoom;
      const ampScreen = this.shakeAmp * 16 * (1 - t) * (1 - t);
      const amp = ampScreen / zoom;
      const a = Math.random() * Math.PI * 2;
      let ox = Math.round(Math.cos(a) * amp);
      let oy = Math.round(Math.sin(a) * amp * 0.7);
      if (ox === 0 && oy === 0 && amp > 0.35) oy = Math.random() < 0.5 ? 1 : -1;
      // Phaser's shake offset is applied in the zoomed matrix: units are art pixels
      se.isRunning = true;
      se._offsetX = ox;
      se._offsetY = oy;
    }
  }

  private updateFires(dt: number): void {
    const night = this.night;
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      if (!f.alive) {
        for (const fl of f.flames) this.releaseFlame(fl.key, fl.img);
        if (f.glow) this.lighting.releaseGlow(f.glow);
        f.light.destroy();
        this.fires.splice(i, 1);
        continue;
      }
      f.t += dt;
      const vis = this.parts.inView(f.x, f.y, 80) && f.intensity > 0.02;
      const inten = Math.min(1.5, f.intensity);
      // flicker: two incommensurate sines + noise
      const flick = 0.82 + 0.1 * Math.sin(f.t * 13.1) + 0.06 * Math.sin(f.t * 23.7 + 1.3) + Math.random() * 0.06;
      f.light.setPosition(f.x + Math.sin(f.t * 7) * 1.2, f.y - 5 * f.size);
      f.light.setIntensity(vis ? (0.75 + 0.3 * f.size) * flick * inten : 0);
      for (const fl of f.flames) {
        fl.img.setVisible(vis);
        if (!vis) continue;
        const frame = Math.floor(f.t * fl.fps + fl.phase) % FLAME_FRAMES;
        fl.img.setFrame(frame);
        const w = fl.img.width;
        const h = fl.img.height;
        fl.img.x = Math.round(f.x + fl.dx - w / 2);
        fl.img.y = Math.round(f.y + fl.dy - h);
        fl.img.setDepth(f.y + fl.dy + 1);
        fl.img.alpha = Math.min(1, inten * 1.2);
      }
      if (f.glow) {
        f.glow.setVisible(vis);
        if (vis) {
          f.glow.x = Math.round(f.x);
          f.glow.y = Math.round(f.y - 6 * f.size);
          f.glow.alpha = (0.05 + 0.3 * night) * flick * Math.min(1, inten);
        }
      }
      if (!vis) continue;
      // embers & smoke
      f.emberAcc += dt * (2.5 + f.size * 4) * inten;
      while (f.emberAcc > 1) {
        f.emberAcc -= 1;
        this.ember(f.x + rnd(-4, 4) * f.size, f.y, 8 * f.size, 10, 30 + f.size * 12);
      }
      // rolling plume: small hot puffs at the flame tips that grow, darken and drift downwind
      f.smokeAcc += dt * (3 + f.size * 3.2) * inten * this.parts.budget();
      while (f.smokeAcc > 1) {
        f.smokeAcc -= 1;
        const r0 = Math.min(5, 1 + f.size * 0.9 + rnd(0, 1));
        this.puff(f.x + rnd(-3, 3) * f.size, f.y - 2, {
          tone: Math.random() < 0.55 ? TONE.soot : TONE.gray,
          r0,
          r1: Math.min(13, r0 + 4 + f.size * 2.6),
          life: rnd(3.5, 6) * (0.8 + f.size * 0.2),
          vx: rnd(-3, 3),
          vz: rnd(20, 30) * (0.85 + f.size * 0.15),
          z: 9 * f.size + rnd(0, 4),
          drag: 0.35,
          wind: 1,
          alpha: rnd(0.55, 0.75),
          fadeAt: 0.5,
          fadeIn: 0.25,
          depth: f.y + 2,
        });
      }
    }
  }

  private updateSmokes(dt: number): void {
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const s = this.smokes[i];
      if (!s.alive) {
        this.smokes.splice(i, 1);
        continue;
      }
      if (!this.parts.inView(s.x, s.y, 140) || s.intensity <= 0.01) continue;
      s.acc += dt * (2.2 + s.size * 2.2) * s.intensity * this.parts.budget();
      while (s.acc > 1) {
        s.acc -= 1;
        const r0 = Math.min(4, 0.5 + s.size + rnd(0, 0.8));
        this.puff(s.x + rnd(-1.5, 1.5), s.y, {
          tone: s.size > 1.6 ? (Math.random() < 0.5 ? TONE.gray : TONE.soot) : Math.random() < 0.7 ? TONE.light : TONE.gray,
          r0,
          r1: Math.min(13, r0 + 4 + s.size * 3),
          life: rnd(4.5, 7.5) * (0.7 + s.size * 0.25),
          vx: rnd(-1.5, 1.5),
          vz: rnd(13, 20) * (0.8 + s.size * 0.2),
          z: rnd(0, 2),
          drag: 0.25,
          wind: 0.9,
          alpha: rnd(0.5, 0.7),
          fadeAt: 0.45,
          fadeIn: 0.5,
          depth: s.y + 2,
        });
      }
    }
  }

  private updateProjectiles(dt: number): void {
    for (const pr of this.projs) {
      if (!pr.active) continue;
      pr.t += dt / pr.dur;
      const t = Math.min(1, pr.t);
      const gx = pr.fx + (pr.tx - pr.fx) * t;
      const gy = pr.fy + (pr.ty - pr.fy) * t;
      const z = pr.arc * 4 * t * (1 - t);
      const x = gx;
      const y = gy - z;
      const img = pr.img!;
      const sh = pr.shadow!;
      const vis = this.parts.inView(x, y, 40);
      img.setVisible(vis);
      sh.setVisible(vis && pr.kind !== 'kursun');
      if (vis) {
        const def = BALL_KEYS[pr.kind] ?? BALL_KEYS.gulle;
        if (pr.kind === 'ok') {
          // orient along the screen velocity (pre-drawn 16 directions)
          const vx = pr.tx - pr.fx;
          const vy = pr.ty - pr.fy - pr.arc * 4 * (1 - 2 * t);
          const a = Math.atan2(vy, vx);
          const di = ((Math.round((a / (Math.PI * 2)) * ARROW_DIRS) % ARROW_DIRS) + ARROW_DIRS) % ARROW_DIRS;
          img.setFrame(di);
        } else if (pr.kind !== 'kursun') {
          img.setFrame(Math.floor(pr.t * pr.dur * 14) % 4);
        }
        img.x = Math.round(x - def.size / 2);
        img.y = Math.round(y - def.size / 2);
        // drop shadow on the ground (light from upper-left → shadow slightly lower-right)
        sh.x = Math.round(gx - 8 + Math.min(6, z * 0.08));
        sh.y = Math.round(gy - 4 + 1);
        sh.alpha = Math.max(0.12, 0.42 - z / 260);
        if (pr.glow) {
          pr.glow.x = Math.round(x);
          pr.glow.y = Math.round(y);
          pr.glow.alpha = 0.35 + 0.35 * this.night;
        }
        // trail
        if (pr.trail) {
          const step = Math.hypot(x - pr.lastX, y - pr.lastY);
          pr.trailAcc += step;
          const every = pr.kind === 'buyuk-gulle' ? 5 : pr.kind === 'ates' ? 4 : pr.kind === 'kursun' ? 10 : 7;
          while (pr.trailAcc > every) {
            pr.trailAcc -= every;
            if (pr.kind === 'ates') {
              this.ember(x, y, 0, 6, 6);
              if (Math.random() < 0.5)
                this.puff(x, y, { tone: TONE.soot, r0: 0, r1: 3, life: rnd(0.7, 1.2), vz: 4, drag: 1, wind: 0.6, alpha: 0.7, depth: DEPTH.AIR - 1 });
            } else {
              const big = pr.kind === 'buyuk-gulle';
              this.puff(x + rnd(-1, 1), y + rnd(-1, 1), {
                tone: TONE.light,
                r0: big ? 1 : 0,
                r1: big ? 4 : 2,
                life: rnd(0.45, 0.8) * (big ? 1.6 : 1),
                vz: 3,
                drag: 1,
                wind: 0.6,
                alpha: big ? 0.6 : 0.45,
                fadeAt: 0.2,
                dis: 2,
                depth: DEPTH.AIR - 1,
              });
            }
          }
        }
      }
      if (pr.light) pr.light.setPosition(x, y);
      pr.lastX = x;
      pr.lastY = y;
      if (pr.t >= 1) {
        pr.active = false;
        img.setVisible(false);
        sh.setVisible(false);
        if (pr.glow) {
          this.lighting.releaseGlow(pr.glow);
          pr.glow = null;
        }
        if (pr.light) {
          pr.light.destroy();
          pr.light = null;
        }
        if (pr.onImpact) {
          try {
            pr.onImpact();
          } catch (err) {
            console.error('[atmosphere] projectile onImpact failed', err);
          }
        } else if (vis) {
          // default landing: arrows stick briefly, balls kick dust
          if (pr.kind === 'ok') {
            this.bit('fx/ok', Mode.Still, pr.tx, pr.ty, { f0: img.frame.name as unknown as number, life: 2.5, fadeAt: 0.7, depth: pr.ty + 2 });
          } else if (pr.kind === 'ates') {
            this.flash(pr.tx, pr.ty, FIRE_LIGHT, 30, 0.4);
            for (let i = 0; i < 8; i++) this.ember(pr.tx, pr.ty, 2, 30, 50);
            this.smoke(pr.tx, pr.ty, 0.8, 3);
          } else if (pr.kind !== 'kursun') {
            this.dust(pr.tx, pr.ty, pr.kind === 'buyuk-gulle' ? 1.4 : 0.7);
          }
        }
      }
    }
  }

  private updateTexts(dt: number): void {
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const ft = this.texts[i];
      ft.t += dt;
      const t = ft.t / ft.life;
      if (t >= 1) {
        this.finishText(ft);
        this.texts.splice(i, 1);
        continue;
      }
      // pop: overshoot up 9px in 0.15s then settle & drift up
      let dy: number;
      if (ft.t < 0.15) {
        const k = ft.t / 0.15;
        dy = -11 * (1 - (1 - k) * (1 - k));
      } else if (ft.t < 0.28) {
        dy = -11 + 3 * ((ft.t - 0.15) / 0.13);
      } else dy = -8 - (ft.t - 0.28) * 7;
      const alpha = t < 0.72 ? 1 : 1 - (t - 0.72) / 0.28;
      const tint = ft.t < 0.07 ? 0xffffff : ft.color;
      const x0 = Math.round(ft.x - ft.w / 2) - 1;
      const y0 = Math.round(ft.y + dy) - 2;
      for (let k = 0; k < ft.imgs.length; k++) {
        const img = ft.imgs[k];
        // small wave on entry: each glyph lags a bit
        const lag = ft.t < 0.25 ? Math.round(Math.sin(Math.min(1, ft.t * 8 - k * 0.25) * Math.PI) * -1) : 0;
        img.x = x0 + ft.offs[k];
        img.y = y0 + lag;
        img.alpha = alpha;
        img.setTint(tint);
      }
    }
  }

  destroy(): void {
    if (this.shakeEffect) {
      if (this.shakeOrigUpdate) this.shakeEffect.update = this.shakeOrigUpdate;
      else delete this.shakeEffect.update;
      this.shakeEffect.isRunning = false;
      this.shakeEffect._offsetX = 0;
      this.shakeEffect._offsetY = 0;
    }
    for (const f of this.fires) {
      for (const fl of f.flames) fl.img.destroy();
    }
    for (const list of this.flameFree.values()) for (const img of list) img.destroy();
    for (const pr of this.projs) {
      pr.img?.destroy();
      pr.shadow?.destroy();
    }
    for (const g of this.glyphAll) g.destroy();
    this.fires.length = 0;
    this.smokes.length = 0;
    this.projs.length = 0;
    this.texts.length = 0;
  }
}

/** setTimeout bound to the scene clock (paused/cleared with the scene). */
function setTimeoutScene(scene: Phaser.Scene, ms: number, fn: () => void): void {
  scene.time.delayedCall(ms, fn);
}

export const FX_COLORS = { WARM, HOT, FIRE_LIGHT, gold: hex(P.gold[5]) };
export { pick };
