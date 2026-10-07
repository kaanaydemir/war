import type { Feature, RenderContext } from '../../core/feature';
import { generateFxTextures } from './art-fx';
import { generateSkyTextures } from './art-sky';
import { AtmosphereRender } from './render';

/**
 * ATMOSPHERE — the FX engine (core/fx.ts FxApi), day/night lightmap, season
 * grading, weather, sky life and reactive battle ambience. Render-only: it never
 * touches the simulation.
 */

/** One renderer per scene lifetime (GameScene restarts rebuild it). */
const renders = new WeakMap<RenderContext, AtmosphereRender>();

export const atmosphereFeature: Feature = {
  id: 'atmosphere',

  generateTextures(gen) {
    generateFxTextures(gen);
    generateSkyTextures(gen);
  },

  createRender(rc) {
    renders.set(rc, new AtmosphereRender(rc));
  },

  updateRender(rc, state, dt) {
    renders.get(rc)?.update(state, dt);
  },
};
