import type { Feature, RenderContext } from '../../core/feature';
import type { GameState } from '../../core/state';
import { installAudioDebug } from './debug';
import { engine } from './engine';
import { AudioDirector } from './render';
import './music';
import './ambience';

/**
 * AUDIO — 100% procedural WebAudio: spatialized SFX for every bus event,
 * ambience beds that follow the camera, and an adaptive makam-based score
 * (ney taksim, siege drones, full mehter for the assault).
 * The AudioContext is created on the first user gesture; everything is a no-op
 * when audio is unavailable (headless, blocked).
 */
const directors = new WeakMap<RenderContext, AudioDirector>();

export const audioFeature: Feature = {
  id: 'audio',

  createRender(rc: RenderContext): void {
    engine.installGesture();
    installAudioDebug();
    const d = new AudioDirector(rc);
    directors.set(rc, d);
    rc.scene.events.once('shutdown', () => {
      d.dispose();
      directors.delete(rc);
    });
  },

  updateRender(rc: RenderContext, state: GameState, dt: number): void {
    directors.get(rc)?.update(state, dt);
  },
};
