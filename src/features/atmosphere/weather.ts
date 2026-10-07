import Phaser from 'phaser';
import { DEPTH } from '../../core/layers';
import type { WorldApi } from '../../core/world';
import { RAIN_SLANTS } from './art-sky';
import type { RGB, Weather, WeatherKind } from './sky';

/**
 * Weather & sky layer: drifting cloud shadows (DEPTH.CLOUD_SHADOW), rain with
 * ground splashes, bouncing hail, swaying snow, fog banks, dawn mist over water
 * and lightning flashes. All sprites are pooled and live around the camera view.
 * Speeds are expressed in SCREEN pixels so rain reads the same at every zoom.
 */

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

interface Drop {
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  vy: number;
  ground: number;
  vz: number;
  z: number;
  bounces: number;
  phase: number;
  kind: 0 | 1 | 2; // rain, hail, snow
  splashT: number;
  alive: boolean;
}

interface Bank {
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  vx: number;
  alpha: number;
  mist: boolean;
}

const MAX_DROPS = 620;

export class WeatherLayer {
  private drops: Drop[] = [];
  private freeDrops: Drop[] = [];
  private clouds: { img: Phaser.GameObjects.Image; x: number; y: number; k: number }[] = [];
  private fog: Bank[] = [];
  private flashRect: Phaser.GameObjects.Image;
  /** Uniform fog veil under the banks (thick fog / mist). */
  private veil: Phaser.GameObjects.Image;
  /** Smoothed level per weather kind (0..1). */
  levels: Record<WeatherKind, number> = { acik: 1, yagmur: 0, dolu: 0, sis: 0, kar: 0 };
  /** Lightning brightness 0..1 (read by the lighting for the ambient boost). */
  lightning = 0;
  private nextBolt = rnd(3, 8);
  private boltSeq: number[] = [];
  private boltT = 0;
  /** Morning mist over water 0..1. */
  mist = 0;
  /** Darkness of the overcast for cloud shadows (cloud shadows vanish when overcast). */
  overcast = 0;
  private frames = 0;

  constructor(
    private scene: Phaser.Scene,
    private world: WorldApi,
  ) {
    this.flashRect = scene.add
      .image(0, 0, 'fx/white')
      .setOrigin(0, 0)
      .setDepth(DEPTH.WEATHER + 50)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setVisible(false);
    this.veil = scene.add.image(0, 0, 'fx/white').setOrigin(0, 0).setDepth(DEPTH.WEATHER - 20).setVisible(false);
    for (let i = 0; i < 9; i++) {
      const img = scene.add
        .image(0, 0, `fx/cloud-${i % 3}`)
        .setOrigin(0, 0)
        .setDepth(DEPTH.CLOUD_SHADOW)
        .setAlpha(0);
      img.setFlipX(i % 2 === 1);
      this.clouds.push({ img, x: NaN, y: NaN, k: 0.75 + Math.random() * 0.5 });
    }
  }

  /** Total "wet/storm" level used by others (birds hide, glints fade). */
  get storm(): number {
    return Math.min(1, this.levels.yagmur + this.levels.dolu);
  }

  update(
    dt: number,
    view: Phaser.Geom.Rectangle,
    zoom: number,
    target: Weather,
    wind: { x: number; y: number },
    amb: RGB,
    daylight: number,
    mistTarget: number,
  ): void {
    // smooth weather levels (warm start: the first frame snaps to the target)
    const warm = this.frames++ < 2;
    const rate = warm ? 10 : dt * 0.35;
    for (const k of Object.keys(this.levels) as WeatherKind[]) {
      const goal = k === target.kind ? (k === 'acik' ? 1 : Math.max(0.15, Math.min(1, target.intensity))) : 0;
      const cur = this.levels[k];
      this.levels[k] = cur + Math.max(-rate, Math.min(rate, goal - cur));
    }
    // hail storms come with rain
    const rainLvl = Math.min(1, this.levels.yagmur + this.levels.dolu * 0.7);
    const hailLvl = this.levels.dolu;
    const snowLvl = this.levels.kar;
    const fogLvl = this.levels.sis;
    this.mist += warm ? mistTarget - this.mist : Math.max(-dt * 0.2, Math.min(dt * 0.2, mistTarget - this.mist));
    this.overcast = Math.min(1, rainLvl * 1.2 + hailLvl + fogLvl * 0.8 + snowLvl * 0.6);

    // tint for everything above the lightmap: follow the ambient but stay readable
    const tr = Math.min(1, amb[0] * 0.75 + 0.3);
    const tg = Math.min(1, amb[1] * 0.75 + 0.3);
    const tb = Math.min(1, amb[2] * 0.75 + 0.32);
    const tint = (Math.round(tr * 255) << 16) | (Math.round(tg * 255) << 8) | Math.round(tb * 255);

    this.updateClouds(warm ? 10 : dt, view, wind, daylight);
    this.updateDrops(dt, view, zoom, wind, rainLvl, hailLvl, snowLvl, tint);
    const veilA = fogLvl * 0.3 + this.mist * 0.06;
    this.veil.setVisible(veilA > 0.01);
    if (veilA > 0.01) {
      this.veil.x = view.x - 30;
      this.veil.y = view.y - 30;
      this.veil.setDisplaySize(view.width + 60, view.height + 60);
      this.veil.setTint(tint);
      this.veil.alpha = veilA;
    }
    if (warm) for (let i = 0; i < 30; i++) this.updateFog(0.5, view, wind, fogLvl, tint, true);
    else this.updateFog(dt, view, wind, fogLvl, tint, false);
    this.updateLightning(dt, view, Math.max(hailLvl, this.levels.yagmur > 0.7 ? (this.levels.yagmur - 0.7) * 2 : 0));
  }

  private updateClouds(dt: number, view: Phaser.Geom.Rectangle, wind: { x: number; y: number }, daylight: number): void {
    const margin = 260;
    const W = view.width + margin * 2;
    const H = view.height + margin * 2;
    const alphaT = 0.16 * daylight * (1 - this.overcast * 0.85);
    for (const c of this.clouds) {
      if (Number.isNaN(c.x) || c.x < view.x - margin - 260 || c.x > view.right + margin || c.y < view.y - margin - 140 || c.y > view.bottom + margin) {
        // (re)seed somewhere around the view; prefer the upwind edge when re-seeding
        if (Number.isNaN(c.x)) {
          c.x = view.x - margin + Math.random() * W;
          c.y = view.y - margin + Math.random() * H;
        } else if (Math.abs(wind.x) > 0.5) {
          c.x = wind.x > 0 ? view.x - margin - 220 : view.right + margin - 20;
          c.y = view.y - margin + Math.random() * H;
        } else {
          c.x = view.x - margin + Math.random() * W;
          c.y = view.y - margin + Math.random() * H;
        }
      }
      c.x += wind.x * 1.6 * c.k * dt;
      c.y += wind.y * 1.6 * c.k * dt;
      c.img.x = Math.round(c.x);
      c.img.y = Math.round(c.y);
      const a = c.img.alpha;
      c.img.alpha = a + (alphaT * c.k - a) * Math.min(1, dt * 0.8);
      c.img.setVisible(c.img.alpha > 0.005);
    }
  }

  private updateDrops(
    dt: number,
    view: Phaser.Geom.Rectangle,
    zoom: number,
    wind: { x: number; y: number },
    rain: number,
    hail: number,
    snow: number,
    tint: number,
  ): void {
    const screenArea = view.width * view.height * zoom * zoom;
    const zoomMul = zoom < 2 ? 1.5 : 1;
    const want = [
      Math.round(Math.min(480, (screenArea / 1900) * zoomMul) * rain),
      Math.round(Math.min(140, (screenArea / 9000) * zoomMul) * hail),
      Math.round(Math.min(420, (screenArea / 2400) * zoomMul) * snow),
    ];
    const have = [0, 0, 0];
    for (const d of this.drops) if (d.alive) have[d.kind]++;
    // spawn deficits (gradually: max 40/frame)
    let budget = 40;
    for (let k = 0 as 0 | 1 | 2; k < 3; k = (k + 1) as 0 | 1 | 2) {
      while (have[k] < want[k] && budget-- > 0) {
        const d = this.takeDrop();
        if (!d) break;
        this.seedDrop(d, k, view, true);
        have[k]++;
      }
    }
    const fallRain = 760 / zoom;
    const windScreen = wind.x * 6;
    const slantIdx = Math.max(0, Math.min(RAIN_SLANTS.length - 1, Math.round(windScreen / 60) + 3));
    for (const d of this.drops) {
      if (!d.alive) continue;
      // retire extras smoothly when the weather calms
      const img = d.img;
      if (d.kind === 0) {
        if (d.splashT > 0) {
          d.splashT += dt;
          const f = Math.floor(d.splashT / 0.06);
          if (f >= 3) {
            if (have[0] > want[0]) {
              this.killDrop(d);
              have[0]--;
            } else this.seedDrop(d, 0, view, false);
            continue;
          }
          img.setFrame(f);
          continue;
        }
        d.y += fallRain * dt;
        d.x += (windScreen / zoom) * dt;
        if (d.y >= d.ground) {
          d.splashT = 0.0001;
          img.setTexture('fx/rain-splash', 0);
          img.x = Math.round(d.x - 2);
          img.y = Math.round(d.ground - 2);
          continue;
        }
        img.setFrame(slantIdx);
        img.x = Math.round(d.x - 3);
        img.y = Math.round(d.y - 8);
      } else if (d.kind === 1) {
        // hail: fall fast, bounce twice, vanish
        if (d.z > 0 || d.vz > 0) {
          d.vz -= (900 / zoom) * dt;
          d.z += d.vz * dt;
          d.x += (windScreen / zoom) * 0.6 * dt;
          if (d.z <= 0) {
            d.z = 0;
            if (d.bounces < 2) {
              d.vz = (d.bounces === 0 ? 120 : 50) / zoom;
              d.x += rnd(-2, 2);
              d.bounces++;
              img.setFrame(1);
            } else {
              if (have[1] > want[1]) {
                this.killDrop(d);
                have[1]--;
              } else this.seedDrop(d, 1, view, false);
              continue;
            }
          }
        }
        img.x = Math.round(d.x - 1);
        img.y = Math.round(d.ground - d.z - 1);
      } else {
        // snow: slow, swaying, drifting with the wind; melts at its ground line
        d.phase += dt;
        d.y += d.vy * dt;
        d.x += ((windScreen * 0.6) / zoom + Math.sin(d.phase * 1.7) * (14 / zoom)) * dt;
        if (d.y >= d.ground) {
          d.splashT += dt;
          img.alpha = Math.max(0, 0.95 - d.splashT * 1.5);
          if (d.splashT > 0.6) {
            if (have[2] > want[2]) {
              this.killDrop(d);
              have[2]--;
            } else this.seedDrop(d, 2, view, false);
            continue;
          }
        }
        img.x = Math.round(d.x - 1);
        img.y = Math.round(Math.min(d.y, d.ground) - 1);
      }
      img.setTint(tint);
      // recycle drops that drifted out of view
      if (d.x < view.x - 40 || d.x > view.right + 40) {
        if (have[d.kind] > want[d.kind]) {
          this.killDrop(d);
          have[d.kind]--;
        } else this.seedDrop(d, d.kind, view, false);
      }
    }
  }

  private takeDrop(): Drop | null {
    let d = this.freeDrops.pop();
    if (!d) {
      if (this.drops.length >= MAX_DROPS) return null;
      d = {
        img: this.scene.add.image(0, 0, 'fx/rain', 0).setOrigin(0, 0).setDepth(DEPTH.WEATHER),
        x: 0,
        y: 0,
        vy: 0,
        ground: 0,
        vz: 0,
        z: 0,
        bounces: 0,
        phase: 0,
        kind: 0,
        splashT: 0,
        alive: false,
      };
      this.drops.push(d);
    }
    return d;
  }

  private killDrop(d: Drop): void {
    d.alive = false;
    d.img.setVisible(false);
    this.freeDrops.push(d);
  }

  private seedDrop(d: Drop, kind: 0 | 1 | 2, view: Phaser.Geom.Rectangle, initial: boolean): void {
    d.alive = true;
    d.kind = kind;
    d.splashT = 0;
    d.bounces = 0;
    d.phase = Math.random() * 10;
    d.x = view.x - 20 + Math.random() * (view.width + 40);
    d.ground = view.y + Math.random() * (view.height + 10);
    const img = d.img;
    img.setVisible(true);
    img.alpha = kind === 2 ? rnd(0.7, 1) : kind === 1 ? 1 : rnd(0.75, 1);
    if (kind === 0) {
      img.setTexture('fx/rain', 3);
      d.y = initial ? d.ground - Math.random() * view.height * 0.8 : d.ground - rnd(0.3, 1) * view.height * 0.6;
    } else if (kind === 1) {
      img.setTexture('fx/hail', 0);
      d.z = initial ? Math.random() * view.height * 0.7 : rnd(0.4, 0.9) * view.height * 0.7;
      d.vz = -rnd(300, 420) / 3;
      d.y = d.ground;
    } else {
      img.setTexture('fx/snow', (Math.random() * 4) | 0);
      d.vy = rnd(14, 30);
      d.y = initial ? d.ground - Math.random() * view.height : d.ground - rnd(0.5, 1) * view.height;
    }
  }

  private updateFog(dt: number, view: Phaser.Geom.Rectangle, wind: { x: number; y: number }, fogLvl: number, tint: number, warm: boolean): void {
    const wantFog = Math.round(fogLvl * 16);
    const wantMist = Math.round(this.mist * 10);
    let nFog = 0;
    let nMist = 0;
    for (const b of this.fog) if (b.alpha > 0 || b.img.visible) b.mist ? nMist++ : nFog++;
    const spawn = (mist: boolean) => {
      let b = this.fog.find((x) => !x.img.visible);
      if (!b) {
        if (this.fog.length >= 30) return;
        b = {
          img: this.scene.add.image(0, 0, `fx/fog-${this.fog.length % 3}`).setOrigin(0, 0).setDepth(DEPTH.WEATHER - 10),
          x: 0,
          y: 0,
          vx: 0,
          alpha: 0,
          mist,
        };
        this.fog.push(b);
      }
      b.mist = mist;
      b.alpha = 0.001;
      b.img.setVisible(true);
      b.img.setFlipX(Math.random() < 0.5);
      // mist hugs the water: try a few samples
      let x = view.x - 120 + Math.random() * (view.width + 40);
      let y = view.y - 40 + Math.random() * (view.height + 20);
      if (mist) {
        for (let k = 0; k < 12; k++) {
          const tx = view.x + Math.random() * view.width;
          const ty = view.y + Math.random() * view.height;
          const t = this.world.toTile(tx, ty);
          if (this.world.isWater(t.tx, t.ty)) {
            x = tx - 100;
            y = ty - 38;
            break;
          }
        }
      }
      b.x = x;
      b.y = y;
      b.vx = (wind.x * 0.25 + rnd(-2, 2)) * (mist ? 0.5 : 1);
    };
    if (nFog < wantFog) spawn(false);
    if (nMist < wantMist) spawn(true);
    for (const b of this.fog) {
      if (!b.img.visible) continue;
      const want = b.mist ? (nMist > wantMist ? 0 : 0.32 + this.mist * 0.25) : nFog > wantFog ? 0 : 0.35 + fogLvl * 0.3;
      b.alpha += warm ? want - b.alpha : Math.max(-dt * 0.12, Math.min(dt * 0.12, want - b.alpha));
      if (b.alpha <= 0) {
        b.img.setVisible(false);
        if (b.mist) nMist--;
        else nFog--;
        continue;
      }
      if (!warm) b.x += b.vx * dt;
      if (b.x < view.x - 260 || b.x > view.right + 60 || b.y < view.y - 120 || b.y > view.bottom + 40) {
        b.alpha = 0;
        b.img.setVisible(false);
        continue;
      }
      b.img.x = Math.round(b.x);
      b.img.y = Math.round(b.y);
      b.img.alpha = b.alpha;
      b.img.setTint(tint);
    }
  }

  private updateLightning(dt: number, view: Phaser.Geom.Rectangle, storm: number): void {
    if (storm > 0.2) {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0 && this.boltSeq.length === 0) {
        this.nextBolt = rnd(4, 11) / storm;
        // double flicker: on, off, on (brighter), fade
        this.boltSeq = [0.06, 0.08, 0.32];
        this.boltT = 0;
      }
    }
    if (this.boltSeq.length) {
      this.boltT += dt;
      const total = this.boltSeq.reduce((a, b) => a + b, 0);
      const t = this.boltT;
      let v = 0;
      if (t < this.boltSeq[0]) v = 0.6;
      else if (t < this.boltSeq[0] + this.boltSeq[1]) v = 0.1;
      else if (t < total) v = 1 - (t - this.boltSeq[0] - this.boltSeq[1]) / this.boltSeq[2];
      else this.boltSeq = [];
      this.lightning = v;
    } else this.lightning = Math.max(0, this.lightning - dt * 4);
    const fr = this.flashRect;
    if (this.lightning > 0.01) {
      fr.setVisible(true);
      fr.x = view.x - 4;
      fr.y = view.y - 4;
      fr.setDisplaySize(view.width + 8, view.height + 8);
      fr.setTint(0xc8d4ff);
      fr.alpha = this.lightning * 0.22;
    } else fr.setVisible(false);
  }

  destroy(): void {
    for (const d of this.drops) d.img.destroy();
    for (const c of this.clouds) c.img.destroy();
    for (const b of this.fog) b.img.destroy();
    this.flashRect.destroy();
    this.veil.destroy();
    this.drops.length = 0;
  }
}
