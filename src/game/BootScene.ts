import Phaser from 'phaser';
import { PhaserTextureGen } from '../art/texture';
import { store } from '../core/store';
import { FEATURES } from './features';
import { getWorld } from './GameScene';

/**
 * Generates every procedural texture (feature by feature, yielding between
 * features so the loading screen can animate), builds the world grid, then
 * starts the GameScene.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create(): void {
    const gen = new PhaserTextureGen(this);
    const steps: (() => void)[] = [
      () => getWorld(),
      ...FEATURES.map((f) => () => {
        try {
          f.generateTextures?.(gen);
        } catch (err) {
          console.error(`[boot] ${f.id}.generateTextures failed`, err);
        }
      }),
    ];
    let i = 0;
    const next = () => {
      if (i >= steps.length) {
        (window as any).__loadProgress = 1;
        this.scene.start('game');
        return;
      }
      steps[i++]();
      (window as any).__loadProgress = i / steps.length;
      store.notify();
      this.time.delayedCall(0, next);
    };
    next();
  }
}
