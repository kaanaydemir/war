import Phaser from 'phaser';
import { BootScene } from './BootScene';
import { GameScene } from './GameScene';

/**
 * Phaser game: full-window WebGL canvas, nearest-neighbour sampling, integer
 * camera zoom (pixel-perfect at every zoom level). The DOM UI sits on top.
 */
export function createGame(parent: string): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.WEBGL,
    parent,
    backgroundColor: '#0b0f24',
    pixelArt: true,
    antialias: false,
    roundPixels: true,
    disableContextMenu: true,
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: window.innerWidth,
      height: window.innerHeight,
    },
    render: { powerPreference: 'high-performance', maxLights: 32 },
    fps: { target: 60 },
    scene: [BootScene, GameScene],
  });
}
