import Phaser from 'phaser';
import { hex, P } from '../../art/palette';
import type { RenderContext } from '../../core/feature';
import type { LightHandle, LoopHandle } from '../../core/fx';
import { DEPTH } from '../../core/layers';
import type { GameState } from '../../core/state';
import type { FxImpl } from './fx';
import type { Reactive } from './reactive';

/**
 * QA showcase for the FX engine (only with the URL param `?fxdemo=1`; `fxdemo=bg`
 * also paints a placeholder ground when the world renderer is not ready).
 * Places a battery, fires, smoke, torches, arrows and splashes around the camera
 * center so every effect can be screenshot in any scenario.
 */
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export class FxDemo {
  private started = false;
  private cx = 0;
  private cy = 0;
  private t = 0;
  private guns: { x: number; y: number; tx: number; ty: number; next: number; power: number; big: boolean }[] = [];
  private loops: LoopHandle[] = [];
  private lights: LightHandle[] = [];
  private bg: Phaser.GameObjects.Graphics | null = null;
  private nextVolley = 1.2;
  private nextSplash = 0.5;
  private nextText = 0.8;
  private nextPot = 2;

  constructor(
    private rc: RenderContext,
    private fx: FxImpl,
    private mode: string,
    private reactive: Reactive,
  ) {}

  private start(): void {
    const cam = this.rc.scene.cameras.main;
    const v = cam.worldView;
    void cam;
    this.cx = Math.round(v.centerX);
    this.cy = Math.round(v.centerY);
    const s = Math.min(1.6, Math.max(0.6, v.width / 430));
    const cx = this.cx;
    const cy = this.cy;
    if (this.mode.includes('bg')) this.paintGround(v);
    // QA hooks for scripted captures
    (window as any).__fx = this.fx;
    (window as any).__fxCenter = { x: cx, y: cy };
    if (this.mode.includes('quiet')) return;
    const wall: [number, number][] = [
      [cx + 50 * s, cy - 60 * s],
      [cx + 60 * s, cy - 10 * s],
      [cx + 75 * s, cy + 40 * s],
    ];
    this.guns = [
      { x: cx - 150 * s, y: cy + 50 * s, tx: wall[0][0], ty: wall[0][1], next: 0.3, power: 1.2, big: false },
      { x: cx - 130 * s, y: cy + 80 * s, tx: wall[1][0], ty: wall[1][1], next: 1.0, power: 2.8, big: true },
      { x: cx - 165 * s, y: cy + 15 * s, tx: wall[2][0], ty: wall[2][1], next: 1.7, power: 0.9, big: false },
    ];
    this.loops.push(this.fx.fire(cx + 95 * s, cy + 20 * s, 2.2));
    this.loops.push(this.fx.fire(cx + 30 * s, cy + 70 * s, 1.2));
    this.loops.push(this.fx.fire(cx - 95 * s, cy + 100 * s, 0.6));
    this.loops.push(this.fx.smokeColumn(cx - 60 * s, cy - 50 * s, 1.2));
    this.loops.push(this.fx.smokeColumn(cx + 120 * s, cy - 40 * s, 2));
    for (let i = 0; i < 6; i++) {
      const x = cx + (45 + i * 8) * s;
      const y = cy + (-70 + i * 26) * s;
      this.lights.push(this.fx.light(x, y, 0xffa848, 22, 1.1));
    }
    this.lights.push(this.fx.light(cx - 150 * s, cy + 50 * s, 0xffc070, 40, 0.9));
  }

  private paintGround(v: Phaser.Geom.Rectangle): void {
    const g = this.rc.scene.add.graphics().setDepth(DEPTH.TERRAIN + 1);
    const w = this.rc.world;
    const grass = [hex(P.grass[4]), hex(P.grass[5]), hex(P.dryGrass[3])];
    const water = [hex(P.water[3]), hex(P.water[4])];
    const pad = 200;
    for (let y = v.y - pad; y < v.bottom + pad; y += 8)
      for (let x = v.x - pad; x < v.right + pad; x += 16) {
        const t = w.toTile(x, y);
        const isW = w.isWater(t.tx, t.ty);
        const k = (Math.floor(t.tx) + Math.floor(t.ty)) & 1;
        g.fillStyle(isW ? water[k] : grass[(Math.floor(t.tx * 3) + Math.floor(t.ty * 5)) % 3], 1);
        g.fillRect(Math.round(x), Math.round(y), 16, 8);
      }
    // a strip of "wall" for the impacts
    const s = Math.min(1.6, Math.max(0.6, v.width / 430));
    g.fillStyle(hex(P.limestone[3]), 1);
    for (let i = 0; i < 12; i++) g.fillRect(this.cx + (48 + i * 2.5) * s, this.cy + (-80 + i * 12) * s, 10, 14);
    this.bg = g;
  }

  update(dt: number, _state: GameState): void {
    this.t += dt;
    if (!this.started) {
      // wait for the camera's first preRender so worldView is valid
      if (this.t < 0.15) return;
      this.started = true;
      this.start();
    }
    if (this.mode.includes('quiet')) return;
    for (const g of this.guns) {
      g.next -= dt;
      if (g.next > 0) continue;
      g.next = g.big ? rnd(3.5, 4.5) : rnd(1.6, 2.8);
      const tx = g.tx + rnd(-8, 8);
      const ty = g.ty + rnd(-6, 6);
      this.fx.muzzle(g.x, g.y, tx - g.x, ty - g.y, g.power);
      this.reactive.shotFired(g.x, g.y, g.big ? 3 : 1);
      this.fx.projectile(g.x, g.y - 3, tx, ty, {
        kind: g.big ? 'buyuk-gulle' : 'gulle',
        arc: g.big ? 40 : 28,
        onImpact: () => {
          const wall = Math.random() < 0.7;
          this.fx.impact(tx, ty, g.big ? 2.4 : 1.1, wall);
          this.reactive.ballLanded(tx, ty, g.big ? 3 : 1, wall);
          if (Math.random() < 0.6) this.fx.floatText(tx, ty - 12, `-${Math.round(rnd(40, 180))}`, 0xff8a6a);
        },
      });
    }
    this.nextVolley -= dt;
    if (this.nextVolley <= 0) {
      this.nextVolley = rnd(2.5, 3.5);
      for (let i = 0; i < 10; i++) {
        const fx0 = this.cx + rnd(50, 70);
        const fy0 = this.cy + rnd(-40, 30);
        this.rc.scene.time.delayedCall(i * 60, () =>
          this.fx.projectile(fx0, fy0, this.cx - rnd(60, 130), this.cy + rnd(20, 90), { kind: 'ok', arc: rnd(20, 34) }),
        );
      }
    }
    this.nextPot -= dt;
    if (this.nextPot <= 0) {
      this.nextPot = rnd(4, 6);
      this.fx.projectile(this.cx + 60, this.cy - 20, this.cx - rnd(40, 90), this.cy + rnd(40, 80), { kind: 'ates', arc: 50 });
    }
    this.nextSplash -= dt;
    if (this.nextSplash <= 0) {
      this.nextSplash = rnd(0.8, 1.6);
      const v = this.rc.scene.cameras.main.worldView;
      for (let k = 0; k < 20; k++) {
        const x = v.x + Math.random() * v.width;
        const y = v.y + Math.random() * v.height;
        const t = this.rc.world.toTile(x, y);
        if (this.rc.world.isWater(t.tx, t.ty)) {
          this.fx.splash(x, y, rnd(0.6, 2));
          break;
        }
      }
    }
    this.nextText -= dt;
    if (this.nextText <= 0) {
      this.nextText = rnd(2.5, 4);
      const texts = ['Gedik açıldı!', '+50 Akçe', 'Moral +5', 'Şahi ateşledi', '-12'];
      this.fx.floatText(this.cx + rnd(-60, 20), this.cy + rnd(-30, 30), texts[(Math.random() * texts.length) | 0], [0xffe08a, 0x9fe08a, 0xffffff, 0xff9a6a][(Math.random() * 4) | 0]);
    }
  }

  destroy(): void {
    for (const l of this.loops) l.destroy();
    for (const l of this.lights) l.destroy();
    this.bg?.destroy();
  }
}
