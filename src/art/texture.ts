import type Phaser from 'phaser';
import { PixelCanvas } from './pixel';

/**
 * TextureGen — registers procedurally drawn pixel art as Phaser textures,
 * spritesheets and animations. Passed to Feature.generateTextures().
 *
 * Naming convention for keys: '<feature>/<thing>[-variant]', e.g.
 * 'army/yeniceri', 'fort/kule-hasar2', 'navy/kadirga'. Animation keys:
 * '<textureKey>:<anim>', e.g. 'army/yeniceri:walk'.
 */
export interface TextureGen {
  /** Single image texture. */
  canvas(key: string, w: number, h: number, draw: (p: PixelCanvas) => void): void;
  /**
   * Spritesheet with `frames` frames of fw×fh. Frames are numbered 0..frames-1
   * and laid out in rows automatically. draw() is called once per frame.
   */
  sheet(key: string, fw: number, fh: number, frames: number, draw: (p: PixelCanvas, frame: number) => void): void;
  /** Animation from frame indices of a sheet. repeat −1 = loop. */
  anim(key: string, sheetKey: string, frames: number[], fps: number, repeat?: number): void;
  /** True if a texture key already exists. */
  has(key: string): boolean;
}

export class PhaserTextureGen implements TextureGen {
  constructor(private scene: Phaser.Scene) {}

  has(key: string): boolean {
    return this.scene.textures.exists(key);
  }

  canvas(key: string, w: number, h: number, draw: (p: PixelCanvas) => void): void {
    if (this.has(key)) this.scene.textures.remove(key);
    const p = new PixelCanvas(w, h);
    draw(p);
    this.scene.textures.addCanvas(key, p.toCanvas());
  }

  sheet(key: string, fw: number, fh: number, frames: number, draw: (p: PixelCanvas, frame: number) => void): void {
    if (this.has(key)) this.scene.textures.remove(key);
    const cols = Math.max(1, Math.min(frames, Math.floor(4096 / fw)));
    const rows = Math.ceil(frames / cols);
    const atlas = new PixelCanvas(cols * fw, rows * fh);
    for (let i = 0; i < frames; i++) {
      const p = new PixelCanvas(fw, fh);
      draw(p, i);
      atlas.blit(p, (i % cols) * fw, Math.floor(i / cols) * fh);
    }
    const tex = this.scene.textures.addCanvas(key, atlas.toCanvas());
    if (!tex) return;
    for (let i = 0; i < frames; i++) tex.add(i, 0, (i % cols) * fw, Math.floor(i / cols) * fh, fw, fh);
  }

  anim(key: string, sheetKey: string, frames: number[], fps: number, repeat = -1): void {
    if (this.scene.anims.exists(key)) this.scene.anims.remove(key);
    this.scene.anims.create({
      key,
      frames: frames.map((f) => ({ key: sheetKey, frame: f })),
      frameRate: fps,
      repeat,
    });
  }
}
