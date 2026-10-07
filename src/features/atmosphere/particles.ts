import Phaser from 'phaser';
import { DEPTH } from '../../core/layers';
import { PUFF_R, PUFF_SMALL_N, puffFrame } from './art-fx';

/**
 * Pooled pixel particles. Every particle is a plain record + one Phaser Image that
 * is recycled (never destroyed during play). Positions are rounded to whole art
 * pixels every frame (pixel-perfect at any integer zoom). Hard cap: MAX_PARTS.
 *
 * Particles live on a ground plane (x, y) with a height z (drawn at y − z), which
 * lets debris bounce, smoke rise and sparks arc with correct depth sorting by
 * their ground y.
 */

export const MAX_PARTS = 1500;

export const Mode = {
  /** Growing/dissolving puff (smoke, dust, mist) from the puff sheets. */
  Puff: 0,
  /** Plays frames f0..f0+count−1 once over its life. */
  Seq: 1,
  /** Loops frames at fps. */
  Loop: 2,
  /** Physical chunk: gravity on z, bounces, spins while airborne, settles. */
  Debris: 3,
  /** Single frame, fades out. */
  Still: 4,
  /** Frame chosen by remaining life (embers/sparks cool down). */
  Cool: 5,
} as const;
export type Mode = (typeof Mode)[keyof typeof Mode];

export interface Part {
  active: boolean;
  img: Phaser.GameObjects.Image | null;
  mode: Mode;
  key: string;
  curKey: string;
  curFrame: number;
  f0: number;
  count: number;
  fps: number;
  /** Frame size for origin math. */
  fw: number;
  fh: number;
  ox: number;
  oy: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** z acceleration (negative = gravity). */
  az: number;
  /** Exponential damping per second on vx/vy/vz. */
  drag: number;
  /** How strongly wind pushes it (0..1+), grows with height for smoke. */
  wind: number;
  age: number;
  life: number;
  alpha: number;
  fadeIn: number;
  /** Fraction of life after which it starts fading (0..1). */
  fadeAt: number;
  // puff
  tone: number;
  variant: number;
  r0: number;
  r1: number;
  dis: number;
  // debris
  bounce: number;
  settled: number;
  spin: number;
  spinRate: number;
  mat: number;
  shape: number;
  // misc
  flipX: boolean;
  tint: number;
  add: boolean;
  depth: number;
  phase: number;
}

const sheetSize: Record<string, [number, number]> = {
  'fx/puff-s': [20, 20],
  'fx/puff-l': [48, 48],
  'fx/debris': [10, 10],
  'fx/ember': [2, 2],
  'fx/spark': [3, 3],
  'fx/sparkle': [7, 7],
  'fx/muzzle': [40, 40],
  'fx/muzzle-l': [64, 64],
  'fx/ring': [64, 32],
  'fx/ring-l': [128, 64],
  'fx/splash': [16, 32],
  'fx/splash-l': [26, 52],
  'fx/drop': [2, 2],
  'fx/flame-s': [8, 12],
  'fx/flame-m': [12, 18],
  'fx/flame-l': [18, 28],
  'fx/scorch': [28, 14],
  'fx/rain-splash': [5, 3],
  'fx/hail': [3, 3],
  'fx/glint': [5, 5],
  'fx/firefly': [3, 3],
  'fx/yaprak': [4, 4],
};

export function frameSize(key: string): [number, number] {
  return sheetSize[key] ?? [8, 8];
}

function blank(): Part {
  return {
    active: false,
    img: null,
    mode: Mode.Still,
    key: '',
    curKey: '',
    curFrame: -1,
    f0: 0,
    count: 1,
    fps: 10,
    fw: 8,
    fh: 8,
    ox: 0.5,
    oy: 0.5,
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    az: 0,
    drag: 0,
    wind: 0,
    age: 0,
    life: 1,
    alpha: 1,
    fadeIn: 0,
    fadeAt: 0.5,
    tone: 0,
    variant: 0,
    r0: 0,
    r1: 0,
    dis: 1,
    bounce: 0.35,
    settled: 0,
    spin: 0,
    spinRate: 10,
    mat: 0,
    shape: 0,
    flipX: false,
    tint: 0xffffff,
    add: false,
    depth: 0,
    phase: 0,
  };
}

export class Particles {
  private all: Part[] = [];
  private free: Part[] = [];
  private live: Part[] = [];
  windX = 0;
  windY = 0;
  /** Camera view (world px) for culling, updated each frame. */
  view = new Phaser.Geom.Rectangle(0, 0, 1, 1);

  constructor(private scene: Phaser.Scene) {}

  get count(): number {
    return this.live.length;
  }

  /** 1 when idle → 0.25 when the pool is nearly full: scale optional spawn counts by this. */
  budget(): number {
    const f = this.live.length / MAX_PARTS;
    return f < 0.55 ? 1 : Math.max(0.2, 1 - (f - 0.55) * 1.8);
  }

  inView(x: number, y: number, margin = 64): boolean {
    const v = this.view;
    return x > v.x - margin && x < v.right + margin && y > v.y - margin && y < v.bottom + margin;
  }

  /** Take a particle from the pool (null when at the hard cap). Caller fills fields then calls start(). */
  take(): Part | null {
    let p = this.free.pop();
    if (!p) {
      if (this.all.length >= MAX_PARTS) return null;
      p = blank();
      this.all.push(p);
    }
    // reset the commonly-forgotten fields
    p.z = p.vx = p.vy = p.vz = p.az = p.drag = p.wind = p.age = 0;
    p.alpha = 1;
    p.fadeIn = 0;
    p.fadeAt = 0.5;
    p.settled = 0;
    p.spin = 0;
    p.flipX = false;
    p.tint = 0xffffff;
    p.add = false;
    p.ox = 0.5;
    p.oy = 0.5;
    p.dis = 1;
    p.phase = Math.random() * 10;
    return p;
  }

  start(p: Part): void {
    if (!p.img) {
      p.img = this.scene.add.image(0, 0, '__DEFAULT').setOrigin(0, 0);
      p.curKey = '';
    }
    const img = p.img;
    img.setVisible(true);
    img.setDepth(p.depth);
    img.setBlendMode(p.add ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
    if (p.tint !== 0xffffff) img.setTint(p.tint);
    else img.clearTint();
    img.setFlipX(p.flipX);
    p.curFrame = -1;
    if (p.mode !== Mode.Puff) {
      const sz = frameSize(p.key);
      p.fw = sz[0];
      p.fh = sz[1];
    }
    p.active = true;
    this.live.push(p);
    this.draw(p, 0);
  }

  private setFrame(p: Part, key: string, frame: number): void {
    const img = p.img!;
    if (p.curKey !== key) {
      img.setTexture(key, frame);
      p.curKey = key;
      p.curFrame = frame;
      return;
    }
    if (p.curFrame !== frame) {
      img.setFrame(frame);
      p.curFrame = frame;
    }
  }

  private release(p: Part): void {
    p.active = false;
    p.img?.setVisible(false);
    this.free.push(p);
  }

  /** Puff radius index (float 0..13) → sheet/frame. */
  private puffFrame(p: Part, t: number): void {
    // ease-out growth
    const g = 1 - (1 - t) * (1 - t);
    const ri = Math.max(0, Math.min(PUFF_R.length - 1, Math.round(p.r0 + (p.r1 - p.r0) * g)));
    const big = ri >= PUFF_SMALL_N;
    const local = big ? ri - PUFF_SMALL_N : ri;
    const dis = Math.max(0, Math.min(3, Math.floor(((t - p.fadeAt) / (1 - p.fadeAt)) * 3.3 * Math.min(1.4, p.dis) + (p.dis > 1.5 ? 1 : 0))));
    const key = big ? 'fx/puff-l' : 'fx/puff-s';
    p.fw = p.fh = big ? 48 : 20;
    this.setFrame(p, key, puffFrame(p.tone, p.variant, t < p.fadeAt ? (p.dis > 1.5 ? 1 : 0) : dis, local));
  }

  private draw(p: Part, t: number): void {
    switch (p.mode) {
      case Mode.Puff:
        this.puffFrame(p, t);
        break;
      case Mode.Seq:
        this.setFrame(p, p.key, p.f0 + Math.min(p.count - 1, Math.floor(t * p.count)));
        break;
      case Mode.Loop:
        this.setFrame(p, p.key, p.f0 + (Math.floor(p.age * p.fps + p.phase) % p.count));
        break;
      case Mode.Debris:
        this.setFrame(p, p.key, p.f0 + (Math.floor(p.spin) & 3));
        break;
      case Mode.Cool:
        this.setFrame(p, p.key, p.f0 + Math.min(p.count - 1, Math.floor(t * t * p.count)));
        break;
      default:
        this.setFrame(p, p.key, p.f0);
    }
    const img = p.img!;
    img.x = Math.round(p.x - p.fw * p.ox);
    img.y = Math.round(p.y - p.z - p.fh * p.oy);
    // alpha: fade in, hold, fade out
    let a = p.alpha;
    if (p.fadeIn > 0 && p.age < p.fadeIn) a *= p.age / p.fadeIn;
    if (t > p.fadeAt) {
      // hold most of the alpha while the puff dissolves, then let it go
      const k = (t - p.fadeAt) / (1 - p.fadeAt);
      a *= p.mode === Mode.Puff ? Math.max(0, 1 - k * k) : Math.max(0, 1 - k);
    }
    img.alpha = a;
  }

  update(dt: number): void {
    const live = this.live;
    const wx = this.windX;
    const wy = this.windY;
    let w = 0;
    for (let i = 0; i < live.length; i++) {
      const p = live[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.release(p);
        continue;
      }
      const t = p.age / p.life;
      if (p.mode === Mode.Debris) {
        if (p.settled === 0) {
          p.vz += p.az * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.z += p.vz * dt;
          p.spin += p.spinRate * dt;
          if (p.z <= 0) {
            p.z = 0;
            if (Math.abs(p.vz) > 28) {
              p.vz = -p.vz * p.bounce;
              p.vx *= 0.55;
              p.vy *= 0.55;
              p.spinRate *= 0.6;
            } else {
              p.vz = p.vx = p.vy = 0;
              p.settled = 1;
            }
          }
        }
      } else {
        if (p.drag > 0) {
          const k = Math.exp(-p.drag * dt);
          p.vx *= k;
          p.vy *= k;
          p.vz *= k;
        }
        p.vz += p.az * dt;
        // wind pushes harder the higher a puff has risen
        const wk = p.wind * (1 + Math.min(2, p.z / 40));
        p.x += (p.vx + wx * wk) * dt;
        p.y += (p.vy + wy * wk) * dt;
        p.z += p.vz * dt;
        if (p.z < 0 && p.az < 0) {
          // droplets/sparks/hail hit the ground
          p.z = 0;
          if (p.bounce > 0 && p.vz < -30) {
            p.vz = -p.vz * p.bounce;
            p.vx *= 0.6;
            p.vy *= 0.6;
          } else {
            p.vz = 0;
            p.vx *= 0.5;
            p.vy *= 0.5;
            if (p.mode !== Mode.Cool) p.age = Math.max(p.age, p.life * 0.92);
          }
        }
      }
      this.draw(p, t);
      live[w++] = p;
    }
    live.length = w;
  }

  clear(): void {
    for (const p of this.live) this.release(p);
    this.live.length = 0;
  }

  destroy(): void {
    for (const p of this.all) p.img?.destroy();
    this.all.length = 0;
    this.free.length = 0;
    this.live.length = 0;
  }
}

/** Convenience: puff radius index for a pixel radius. */
export function puffIndex(radiusPx: number): number {
  let best = 0;
  for (let i = 0; i < PUFF_R.length; i++) if (Math.abs(PUFF_R[i] - radiusPx) < Math.abs(PUFF_R[best] - radiusPx)) best = i;
  return best;
}

export { DEPTH };
