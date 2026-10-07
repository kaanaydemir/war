import type { Feature, RenderContext } from '../../core/feature';
import { generateCityTextures } from './cityArt';
import { FortRender } from './render';
import { generateSpriteTextures } from './sprites';
import { applyScenario, initWalls, simTick } from './sim';

/**
 * FORTIFICATIONS: the Theodosian land walls, the sea walls, Galata, Anadolu
 * Hisarı and the whole Byzantine city (houses, churches, landmarks, life).
 * Sim: the wall damage model (api.ts) + breach/tower-collapse thresholds (sim.ts).
 */
const renders = new WeakMap<RenderContext, FortRender>();

export const fortificationsFeature: Feature = {
  id: 'fortifications',

  generateTextures(gen) {
    generateSpriteTextures(gen);
    generateCityTextures(gen);
  },

  initState(state) {
    initWalls(state);
  },

  simTick(state, ctx) {
    simTick(state, ctx);
  },

  applyScenario(name, state) {
    applyScenario(name, state);
  },

  createRender(rc) {
    renders.set(rc, new FortRender(rc));
  },

  updateRender(rc, state, dt) {
    renders.get(rc)?.update(state, dt);
  },
};
