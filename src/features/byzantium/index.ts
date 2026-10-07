import type { Feature, RenderContext } from '../../core/feature';
import { generateByzTextures } from './art';
import { ByzRender } from './render';
import { applyScenario, handleCommand, initState, simTick } from './sim';

/**
 * BYZANTIUM — the defenders' AI, Byzantine morale/food/intel, the relief (Haçlı) clock,
 * the Divan defeat condition; visuals: night repair crews with lanterns, rising stockades,
 * torch-lit sortie parties (keys 'byz/…').
 */
const renders = new WeakMap<RenderContext, ByzRender>();

export const byzantiumFeature: Feature = {
  id: 'byzantium',

  generateTextures(gen) {
    generateByzTextures(gen);
  },

  initState(state) {
    initState(state);
  },

  simTick(state, ctx) {
    simTick(state, ctx);
  },

  handleCommand(state, cmd, ctx) {
    return handleCommand(state, cmd, ctx);
  },

  applyScenario(name, state) {
    applyScenario(name, state);
  },

  createRender(rc) {
    const r = new ByzRender(rc);
    renders.set(rc, r);
    rc.scene.events.once('shutdown', () => {
      r.destroy();
      renders.delete(rc);
    });
  },

  updateRender(rc, state, dt) {
    renders.get(rc)?.update(state, dt);
  },
};
