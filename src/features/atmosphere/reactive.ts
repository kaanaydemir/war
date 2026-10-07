import Phaser from 'phaser';
import type { Bus, EventName, GameEvents } from '../../core/bus';
import type { LoopHandle } from '../../core/fx';
import { DEPTH } from '../../core/layers';
import type { CannonType } from '../../core/state';
import type { WorldApi } from '../../core/world';
import { sectionCenter } from '../fortifications/api';
import { TONE } from './art-fx';
import type { FxImpl } from './fx';
import { Mode, type Particles } from './particles';
import type { Weather } from './sky';

/**
 * Reactive ambience: listens to sim events and DECORATES them (owners call fx for
 * the primary effect). Adds lingering battlefield haze when many cannons fired
 * recently, smoke/dust drifting over the walls, scorch marks, embers after fires,
 * collapse clouds, plus the eclipse/weather state. Never touches GameState.
 */

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

const CANNON_HAZE: Record<CannonType, number> = { sahi: 3, buyuk: 2, orta: 1.1, kucuk: 0.6, havan: 0.9 };

interface HazeSrc {
  x: number;
  y: number;
  strength: number;
  tone: number;
  acc: number;
}

interface TempLoop {
  h: LoopHandle;
  t: number;
  life: number;
  fade: number;
}

interface Scorch {
  img: Phaser.GameObjects.Image;
  age: number;
}

export class Reactive {
  private haze: HazeSrc[] = [];
  private temps: TempLoop[] = [];
  private scorches: Scorch[] = [];
  private offs: (() => void)[] = [];
  /** Battlefield haze level (recent firing) 0..1+. */
  hazeLevel = 0;
  /** Recent battle focus for crows. */
  battle: { x: number; y: number; t: number } | null = null;
  /** Eclipse target from the bus. */
  eclipseTarget = 0;
  /** Weather override from the bus (until `weatherUntil` sim-day). */
  weatherOverride: Weather | null = null;
  weatherUntilDay = 0;
  private lastConstructionDust = 0;

  constructor(
    private scene: Phaser.Scene,
    private world: WorldApi,
    private fx: FxImpl,
    private parts: Particles,
    bus: Bus,
    private getDay: () => number,
  ) {
    const W = (t: { tx: number; ty: number }) => this.world.toWorld(t.tx, t.ty);
    const on = <K extends EventName>(k: K, fn: (p: GameEvents[K]) => void) => this.offs.push(bus.on(k, fn));

    on('cannon:fire', (e) => {
      const p = W(e.from);
      this.shotFired(p.x, p.y, CANNON_HAZE[e.type] ?? 1);
    });
    on('cannon:impact', (e) => {
      if (this.world.isWater(e.at.tx, e.at.ty)) return;
      const p = W(e.at);
      this.ballLanded(p.x, p.y, CANNON_HAZE[e.type] ?? 1, e.hitWall);
    });
    on('wall:breach', (e) => {
      const c = sectionCenter(e.sectionId);
      const p = W(c);
      this.collapseCloud(p.x, p.y, 1.4);
      this.markBattle(p.x, p.y);
    });
    on('wall:tower-collapse', (e) => {
      const p = W(e.at);
      this.collapseCloud(p.x, p.y, 2.2);
      this.fx.shake(0.55, 0.9);
    });
    on('mine:collapsed', (e) => {
      const p = W(e.at);
      this.fx.dust(p.x, p.y, 1.6);
      this.fx.shake(0.18, 0.5);
      this.addHaze(p.x, p.y, 1, TONE.dirt);
    });
    on('mine:success', (e) => {
      const p = W(sectionCenter(e.sectionId));
      this.fx.impact(p.x, p.y, 3, true);
      this.collapseCloud(p.x, p.y, 1.8);
      this.fx.shake(0.7, 1.0);
    });
    on('tower:burned', (e) => {
      const p = W(e.at);
      this.tempFire(p.x, p.y, 2.2, 30);
      this.tempSmoke(p.x, p.y - 10, 2.4, 45);
    });
    on('greekfire', (e) => {
      const p = W(e.at);
      this.tempFire(p.x, p.y, 1.4, 14);
      this.tempSmoke(p.x, p.y, 1.6, 20);
    });
    on('ship:sunk', (e) => {
      const p = W(e.at);
      this.fx.splash(p.x, p.y, 2.2);
      this.fx.debris(p.x, p.y, 8, 'tahta');
      this.tempSmoke(p.x, p.y, 1.4, 12);
    });
    on('ship:burning', (e) => {
      const p = W(e.at);
      this.tempSmoke(p.x, p.y - 6, 1.8, 25);
    });
    on('ship:hit', (e) => {
      const p = W(e.at);
      this.fx.debris(p.x, p.y, 4, 'tahta');
    });
    on('assault:clash', (e) => {
      const p = W(e.at);
      this.markBattle(p.x, p.y);
      if (this.parts.inView(p.x, p.y, 60)) {
        this.fx.dust(p.x + rnd(-8, 8), p.y + rnd(-4, 4), 0.5 + Math.min(1.5, e.intensity));
        if (Math.random() < 0.5) this.fx.sparks(p.x + rnd(-6, 6), p.y - 4, 4);
      }
      this.addHaze(p.x, p.y, 0.4 * Math.min(2, e.intensity), TONE.sand);
    });
    on('banner:planted', (e) => {
      const p = W(e.at);
      this.goldBurst(p.x, p.y - 20);
    });
    on('building:complete', (e) => {
      const p = W(e.at);
      this.fx.dust(p.x, p.y, 1.2);
      this.goldBurst(p.x, p.y - 10, 0.6);
    });
    on('construction:tick', (e) => {
      const now = this.scene.time.now;
      if (now - this.lastConstructionDust < 350) return;
      this.lastConstructionDust = now;
      const p = W(e.at);
      if (this.parts.inView(p.x, p.y, 20)) this.fx.dust(p.x + rnd(-6, 6), p.y + rnd(-3, 3), 0.4);
    });
    on('eclipse', (e) => {
      this.eclipseTarget = e.active ? 1 : 0;
    });
    on('weather', (e) => {
      this.weatherOverride = { kind: e.kind, intensity: e.intensity };
      // lasts until cleared by 'acik' or for one game day
      this.weatherUntilDay = this.getDay() + (e.kind === 'acik' ? 0.02 : 1);
    });
    on('camera:shake', (e) => this.fx.shake(e.intensity, e.duration));

    // scorch decals on ground impacts
    this.fx.scorch = (x, y, power) => this.addScorch(x, y, power);
  }

  /** Public hooks (also used by the QA demo): a gun fired / a ball landed at world px. */
  shotFired(x: number, y: number, strength: number): void {
    this.addHaze(x, y, strength, TONE.light);
    this.hazeLevel = Math.min(2, this.hazeLevel + 0.08 * strength);
  }

  ballLanded(x: number, y: number, strength: number, onWall: boolean): void {
    this.addHaze(x, y - (onWall ? 8 : 0), strength * 0.8, onWall ? TONE.stone : TONE.dirt);
    this.markBattle(x, y);
  }

  private markBattle(x: number, y: number): void {
    this.battle = { x, y, t: 25 };
  }

  private addHaze(x: number, y: number, strength: number, tone: number): void {
    // merge with a nearby source
    for (const h of this.haze) {
      if (Math.abs(h.x - x) < 40 && Math.abs(h.y - y) < 24) {
        h.strength = Math.min(6, h.strength + strength);
        h.x += (x - h.x) * 0.3;
        h.y += (y - h.y) * 0.3;
        return;
      }
    }
    if (this.haze.length >= 24) this.haze.sort((a, b) => b.strength - a.strength).pop();
    this.haze.push({ x, y, strength, tone, acc: 0 });
  }

  /** Huge rolling dust cloud (collapses / breaches). */
  private collapseCloud(x: number, y: number, s: number): void {
    this.fx.debris(x, y, Math.round(10 * s), 'tas');
    this.fx.debris(x, y, Math.round(5 * s), 'tugla');
    this.fx.dust(x, y, Math.min(3, 1.5 * s));
    this.addHaze(x, y, 3 * s, TONE.stone);
    if (!this.parts.inView(x, y, 200)) return;
    const n = Math.round(14 * s * this.parts.budget());
    for (let i = 0; i < n; i++) {
      const a = rnd(0, Math.PI * 2);
      const sp = rnd(10, 45) * s;
      const p = this.parts.take();
      if (!p) break;
      p.mode = Mode.Puff;
      p.x = x + rnd(-10, 10) * s;
      p.y = y + rnd(-5, 5) * s;
      p.z = rnd(0, 20) * s;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp * 0.5;
      p.vz = rnd(6, 28);
      p.drag = 0.9;
      p.wind = 0.6;
      p.tone = Math.random() < 0.6 ? TONE.stone : TONE.light;
      p.variant = (Math.random() * 2) | 0;
      p.r0 = Math.min(9, 4 + s * 2);
      p.r1 = 13;
      p.life = rnd(4, 8);
      p.alpha = 0.9;
      p.fadeAt = 0.4;
      p.fadeIn = 0.1;
      p.depth = y + 30;
      this.parts.start(p);
    }
  }

  private tempFire(x: number, y: number, size: number, life: number): void {
    this.temps.push({ h: this.fx.fire(x, y, size), t: 0, life, fade: 4 });
  }

  private tempSmoke(x: number, y: number, size: number, life: number): void {
    this.temps.push({ h: this.fx.smokeColumn(x, y, size), t: 0, life, fade: 6 });
  }

  private goldBurst(x: number, y: number, s = 1): void {
    if (!this.parts.inView(x, y, 40)) return;
    this.fx.flash(x, y, 0xffe08a, 40 * s, 0.6);
    const n = Math.round(14 * s);
    for (let i = 0; i < n; i++) {
      const p = this.parts.take();
      if (!p) break;
      const a = (i / n) * Math.PI * 2;
      p.mode = Mode.Seq;
      p.key = 'fx/sparkle';
      p.f0 = 0;
      p.count = 4;
      p.x = x;
      p.y = y;
      p.z = 0;
      p.vx = Math.cos(a) * rnd(20, 45);
      p.vy = Math.sin(a) * rnd(12, 26);
      p.vz = rnd(5, 25);
      p.drag = 1.6;
      p.az = -10;
      p.life = rnd(0.7, 1.3);
      p.fadeAt = 0.5;
      p.add = true;
      p.depth = DEPTH.GLOW + 4;
      this.parts.start(p);
    }
  }

  private addScorch(x: number, y: number, power: number): void {
    if (!this.parts.inView(x, y, 60)) return;
    const t = this.world.toTile(x, y);
    if (this.world.isWater(t.tx, t.ty)) return;
    let s: Scorch | undefined;
    if (this.scorches.length >= 36) s = this.scorches.shift();
    if (!s) {
      s = {
        img: this.scene.add.image(0, 0, 'fx/scorch', 0).setOrigin(0, 0).setDepth(DEPTH.GROUND_DECAL + 20),
        age: 0,
      };
    }
    s.age = 0;
    s.img.setFrame((Math.random() * 3) | 0);
    s.img.setFlipX(Math.random() < 0.5);
    s.img.x = Math.round(x - 14);
    s.img.y = Math.round(y - 7);
    s.img.setVisible(true);
    s.img.alpha = Math.min(0.75, 0.4 + power * 0.15);
    this.scorches.push(s);
  }

  update(dt: number): void {
    // decay
    this.hazeLevel = Math.max(0, this.hazeLevel - dt * 0.012);
    if (this.battle) {
      this.battle.t -= dt;
      if (this.battle.t <= 0) this.battle = null;
    }
    // lingering battlefield haze: big faint puffs drifting low with the wind
    const b = this.parts.budget();
    for (let i = this.haze.length - 1; i >= 0; i--) {
      const h = this.haze[i];
      h.strength *= Math.exp(-dt / 40);
      if (h.strength < 0.08) {
        this.haze.splice(i, 1);
        continue;
      }
      if (!this.parts.inView(h.x, h.y, 260)) continue;
      h.acc += dt * Math.min(1.6, h.strength * 0.35) * b;
      while (h.acc > 1) {
        h.acc -= 1;
        const p = this.parts.take();
        if (!p) break;
        p.mode = Mode.Puff;
        p.x = h.x + rnd(-24, 24);
        p.y = h.y + rnd(-10, 10);
        p.z = rnd(4, 18);
        p.vx = rnd(-3, 3);
        p.vy = rnd(-1, 1);
        p.vz = rnd(1.5, 5);
        p.drag = 0.15;
        p.wind = 1.1;
        p.tone = h.tone;
        p.variant = (Math.random() * 2) | 0;
        p.r0 = 6 + Math.random() * 3;
        p.r1 = 11 + Math.random() * 2.5;
        p.life = rnd(9, 16);
        p.alpha = Math.min(0.42, 0.14 + h.strength * 0.05);
        p.fadeAt = 0.45;
        p.fadeIn = 2.5;
        p.dis = 2;
        p.depth = h.y + 40;
        this.parts.start(p);
      }
    }
    // temporary loops (burning towers, greek fire, sinking ships)
    for (let i = this.temps.length - 1; i >= 0; i--) {
      const t = this.temps[i];
      t.t += dt;
      if (t.t > t.life) {
        const k = 1 - (t.t - t.life) / t.fade;
        if (k <= 0) {
          t.h.destroy();
          this.temps.splice(i, 1);
          continue;
        }
        t.h.setIntensity(k);
      }
    }
    // scorch marks fade over ~70 s
    for (let i = this.scorches.length - 1; i >= 0; i--) {
      const s = this.scorches[i];
      s.age += dt;
      if (s.age > 50) {
        s.img.alpha -= dt * 0.03;
        if (s.img.alpha <= 0) {
          s.img.destroy();
          this.scorches.splice(i, 1);
        }
      }
    }
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.offs.length = 0;
    for (const t of this.temps) t.h.destroy();
    for (const s of this.scorches) s.img.destroy();
    this.temps.length = 0;
    this.scorches.length = 0;
    this.haze.length = 0;
    this.fx.scorch = null;
  }
}
