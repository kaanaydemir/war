import Phaser from 'phaser';
import type { LightHandle } from '../../core/fx';
import { DEPTH } from '../../core/layers';
import { LIGHT_RADII } from './art-fx';
import type { RGB } from './sky';

/**
 * LIGHTING
 *  - Lightmap: a RenderTexture covering camera.worldView (repositioned every frame,
 *    1 texel = 1 art pixel) filled with the ambient color; point lights are stamped
 *    into it additively (dithered, banded radial falloffs). It is displayed with
 *    MULTIPLY at DEPTH.LIGHTING, so night darkens the world and lights cut through.
 *  - Glow: additive halo sprites at DEPTH.GLOW (flames, flashes) — the pixel-art
 *    "bloom" that keeps fire bright on top of the multiply.
 *  - Grade: camera post-FX color matrix (season/weather saturation) + vignette.
 */

interface LightRec {
  x: number;
  y: number;
  color: number;
  radius: number;
  intensity: number;
  alive: boolean;
  /** Transient flash: decays to 0 over `decay` seconds. */
  decay: number;
  age: number;
}

export interface GlowRec {
  img: Phaser.GameObjects.Image;
  alive: boolean;
}

/** Global gain on lightmap lights: < 1 so a torch tints the ground warm rather than clipping to white. */
const LIGHT_GAIN = 0.78;

function lightKey(r: number): { key: string; r: number } {
  let best = LIGHT_RADII[0];
  for (const lr of LIGHT_RADII) if (Math.abs(lr - r) < Math.abs(best - r)) best = lr;
  return { key: `fx/light-${best}`, r: best };
}

function packRGB(c: RGB): number {
  const r = Math.max(0, Math.min(255, Math.round(c[0] * 255)));
  const g = Math.max(0, Math.min(255, Math.round(c[1] * 255)));
  const b = Math.max(0, Math.min(255, Math.round(c[2] * 255)));
  return (r << 16) | (g << 8) | b;
}

function scaleColor(color: number, k: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((color >> 8) & 255) * k));
  const b = Math.min(255, Math.round((color & 255) * k));
  return (r << 16) | (g << 8) | b;
}

export class Lighting {
  private rt: Phaser.GameObjects.RenderTexture;
  private stamp: Phaser.GameObjects.Image;
  private lights: LightRec[] = [];
  private freeLights: LightRec[] = [];
  private glows: Phaser.GameObjects.Image[] = [];
  private glowFree: Phaser.GameObjects.Image[] = [];
  /** Transient additive flash sprites. */
  private flashes: { img: Phaser.GameObjects.Image; age: number; life: number; a0: number }[] = [];
  private rtX = 0;
  private rtY = 0;
  private rtW = 0;
  private rtH = 0;
  private colorFx: Phaser.FX.ColorMatrix | null = null;
  private vignette: Phaser.FX.Vignette | null = null;
  /** 0..1 how visible point lights are (1 = night). */
  lightsVisible = 0;
  /** Glow strength multiplier (higher at night). */
  glowFactor = 1;
  /** Extra white added to the ambient (lightning). */
  ambientBoost = 0;
  /** Packed ambient used this frame. */
  ambientPacked = 0xffffff;
  ambient: RGB = [1, 1, 1];

  constructor(private scene: Phaser.Scene) {
    const cam = scene.cameras.main;
    const v = cam.worldView;
    this.rtW = Math.max(16, Math.ceil(v.width) + 4);
    this.rtH = Math.max(16, Math.ceil(v.height) + 4);
    this.rt = scene.add.renderTexture(0, 0, this.rtW, this.rtH);
    this.rt.setOrigin(0, 0);
    this.rt.setDepth(DEPTH.LIGHTING);
    this.rt.setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.stamp = scene.make.image({ key: 'fx/light-32', add: false });
    this.stamp.setOrigin(0.5, 0.5);
    this.stamp.setBlendMode(Phaser.BlendModes.ADD);
    // camera grading (WebGL only)
    try {
      if (cam.postFX) {
        this.colorFx = cam.postFX.addColorMatrix();
        this.vignette = cam.postFX.addVignette(0.5, 0.5, 0.92, 0.18);
      }
    } catch (err) {
      console.warn('[atmosphere] camera postFX unavailable', err);
      this.colorFx = null;
      this.vignette = null;
    }
  }

  // ───────── lights ─────────

  addLight(x: number, y: number, color: number, radius: number, intensity: number, decay = 0): LightHandle {
    const rec = this.freeLights.pop() ?? ({} as LightRec);
    rec.x = x;
    rec.y = y;
    rec.color = color;
    rec.radius = radius;
    rec.intensity = intensity;
    rec.alive = true;
    rec.decay = decay;
    rec.age = 0;
    this.lights.push(rec);
    return {
      setPosition: (nx: number, ny: number) => {
        rec.x = nx;
        rec.y = ny;
      },
      setIntensity: (v: number) => {
        rec.intensity = v;
      },
      setRadius: (r: number) => {
        rec.radius = r;
      },
      destroy: () => {
        rec.alive = false;
      },
    };
  }

  // ───────── glow sprites ─────────

  /** Persistent additive glow sprite (caller positions it; release with releaseGlow). */
  takeGlow(radius: number, color: number): Phaser.GameObjects.Image {
    const lk = lightKey(radius);
    let img = this.glowFree.pop();
    if (!img) {
      img = this.scene.add.image(0, 0, lk.key).setOrigin(0.5, 0.5).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.GLOW);
      this.glows.push(img);
    } else img.setTexture(lk.key);
    img.setTint(color);
    img.setVisible(true);
    img.setAlpha(0.5);
    return img;
  }

  releaseGlow(img: Phaser.GameObjects.Image): void {
    img.setVisible(false);
    this.glowFree.push(img);
  }

  /** One-shot additive flash halo + transient lightmap light. */
  flash(x: number, y: number, color: number, radius: number, duration: number, strength = 1): void {
    this.addLight(x, y, color, radius, 1.6 * strength, duration);
    if (this.flashes.length > 48) return;
    const img = this.takeGlow(radius * (0.55 + 0.25 * this.glowFactor), color);
    img.x = Math.round(x);
    img.y = Math.round(y);
    // daylight flashes stay tight & hot; at night the halo blooms wide
    const a0 = Math.min(1, (0.28 + 0.6 * this.glowFactor) * strength);
    img.setAlpha(a0);
    this.flashes.push({ img, age: 0, life: Math.max(0.05, duration), a0 });
  }

  // ───────── per frame ─────────

  update(dt: number, amb: RGB, sat: number, vignette: number, v: Phaser.Geom.Rectangle): void {
    const boost = this.ambientBoost;
    this.ambient = amb;
    const a: RGB = [Math.min(1, amb[0] + boost), Math.min(1, amb[1] + boost), Math.min(1, amb[2] + boost * 1.05)];
    this.ambientPacked = packRGB(a);

    // transient flashes
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.age += dt;
      const t = f.age / f.life;
      if (t >= 1) {
        this.releaseGlow(f.img);
        this.flashes.splice(i, 1);
        continue;
      }
      f.img.setAlpha(f.a0 * (1 - t) * (1 - t));
    }

    // resize / reposition the lightmap to cover the view. The camera may still pan
    // after this update (CameraController runs later), so pad generously.
    const PAD = 24;
    const needW = Math.ceil(v.width) + PAD * 2;
    const needH = Math.ceil(v.height) + PAD * 2;
    if (needW !== this.rtW || needH !== this.rtH) {
      this.rtW = needW;
      this.rtH = needH;
      this.rt.resize(needW, needH);
    }
    this.rtX = Math.floor(v.x) - PAD;
    this.rtY = Math.floor(v.y) - PAD;
    this.rt.setPosition(this.rtX, this.rtY);

    const allWhite = a[0] > 0.995 && a[1] > 0.995 && a[2] > 0.995;
    this.rt.setVisible(!allWhite);
    if (!allWhite) {
      this.rt.fill(this.ambientPacked, 1);
      this.drawLights(dt);
    } else {
      this.ageLights(dt);
    }

    // grading
    if (this.colorFx) {
      // skip the full-screen pass entirely when it would be a no-op
      const on = Math.abs(sat) > 0.015;
      this.colorFx.active = on;
      if (on) {
        this.colorFx.reset();
        this.colorFx.saturate(sat, true);
      }
    }
    if (this.vignette) this.vignette.strength = vignette;
  }

  private ageLights(dt: number): void {
    const L = this.lights;
    let w = 0;
    for (let i = 0; i < L.length; i++) {
      const l = L[i];
      if (l.decay > 0) {
        l.age += dt;
        if (l.age >= l.decay) l.alive = false;
      }
      if (!l.alive) {
        this.freeLights.push(l);
        continue;
      }
      L[w++] = l;
    }
    L.length = w;
  }

  private drawLights(dt: number): void {
    const L = this.lights;
    const x0 = this.rtX;
    const y0 = this.rtY;
    const x1 = x0 + this.rtW;
    const y1 = y0 + this.rtH;
    const st = this.stamp;
    let began = false;
    let w = 0;
    for (let i = 0; i < L.length; i++) {
      const l = L[i];
      let k = 1;
      if (l.decay > 0) {
        l.age += dt;
        if (l.age >= l.decay) l.alive = false;
        const t = l.age / l.decay;
        k = (1 - t) * (1 - t);
      }
      if (!l.alive) {
        this.freeLights.push(l);
        continue;
      }
      L[w++] = l;
      const r = l.radius;
      if (l.x + r < x0 || l.x - r > x1 || l.y + r < y0 || l.y - r > y1) continue;
      // persistent lights fade out in daylight (they would only wash out the tint);
      // transient flashes always show. LIGHT_GAIN keeps lit ground warm instead of white.
      let inten = l.intensity * k * LIGHT_GAIN * (l.decay > 0 ? 1 : this.lightsVisible);
      if (inten <= 0.01) continue;
      if (!began) {
        this.rt.beginDraw();
        began = true;
      }
      const lk = lightKey(r);
      if (st.texture.key !== lk.key) st.setTexture(lk.key);
      const px = Math.round(l.x - x0);
      const py = Math.round(l.y - y0);
      // intensities above 1 → brighten the tint, then a second pass
      while (inten > 0.01) {
        const a = Math.min(1, inten);
        st.setTint(l.color);
        st.setAlpha(a);
        this.rt.batchDraw(st, px, py);
        inten -= 1;
      }
    }
    L.length = w;
    if (began) this.rt.endDraw();
  }

  destroy(): void {
    const cam = this.scene.cameras.main;
    try {
      if (this.colorFx) cam.postFX.remove(this.colorFx as unknown as Phaser.FX.Controller);
      if (this.vignette) cam.postFX.remove(this.vignette);
    } catch {
      /* camera already gone */
    }
    this.rt.destroy();
    this.stamp.destroy();
    for (const g of this.glows) g.destroy();
    this.glows.length = 0;
    this.glowFree.length = 0;
    this.flashes.length = 0;
    this.lights.length = 0;
  }
}

export { packRGB, scaleColor };
