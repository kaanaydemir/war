import type Phaser from 'phaser';

/** Pool of Phaser sprites (hidden when released). */
export class SpritePool {
  private free: Phaser.GameObjects.Sprite[] = [];
  readonly all: Phaser.GameObjects.Sprite[] = [];
  constructor(private scene: Phaser.Scene) {}

  acquire(key: string, frame?: number): Phaser.GameObjects.Sprite {
    let s = this.free.pop();
    if (!s) {
      s = this.scene.add.sprite(0, 0, key, frame);
      this.all.push(s);
    } else {
      s.setTexture(key, frame);
    }
    s.setVisible(true).setAlpha(1).clearTint().setFlipX(false).setOrigin(0.5, 1);
    return s;
  }

  release(s: Phaser.GameObjects.Sprite): void {
    s.anims?.stop();
    s.setVisible(false);
    this.free.push(s);
  }

  destroy(): void {
    for (const s of this.all) s.destroy();
    this.all.length = 0;
    this.free.length = 0;
  }
}

/** Camera world view expanded by a margin (reused object). */
export interface ViewRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function updateView(cam: Phaser.Cameras.Scene2D.Camera, margin: number, out: ViewRect): ViewRect {
  const v = cam.worldView;
  out.x0 = v.x - margin;
  out.y0 = v.y - margin;
  out.x1 = v.x + v.width + margin;
  out.y1 = v.y + v.height + margin;
  return out;
}

export function inView(v: ViewRect, x: number, y: number, pad = 0): boolean {
  return x >= v.x0 - pad && x <= v.x1 + pad && y >= v.y0 - pad && y <= v.y1 + pad;
}

export function rectInView(v: ViewRect, x0: number, y0: number, x1: number, y1: number): boolean {
  return x1 >= v.x0 && x0 <= v.x1 && y1 >= v.y0 && y0 <= v.y1;
}

/** Start an animation at a random frame (so crowds don't move in lockstep). */
export function playDesync(s: Phaser.GameObjects.Sprite, anim: string, seed: number): void {
  if (s.anims.currentAnim?.key === anim && s.anims.isPlaying) return;
  if (!s.scene.anims.exists(anim)) return;
  const n = Math.max(1, s.scene.anims.get(anim).frames.length);
  const f = ((Math.floor(Math.abs(seed) * 1000) % n) + n) % n;
  s.play({ key: anim, startFrame: f });
}
