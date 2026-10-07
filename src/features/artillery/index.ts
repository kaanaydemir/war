import type { Feature } from '../../core/feature';
import { generateArtilleryTextures } from './art';
import { createArtilleryRender, updateArtilleryRender } from './render';
import { applyArtilleryScenario, handleArtilleryCommand, initArtillery, tickArtillery } from './sim';

/**
 * ARTILLERY — Orban, the Edirne foundry, the great bombard Şahi, ox-drawn transport,
 * battery emplacement and the bombardment of the walls.
 */
export const artilleryFeature: Feature = {
  id: 'artillery',
  generateTextures: generateArtilleryTextures,
  initState: (state) => initArtillery(state),
  simTick: tickArtillery,
  handleCommand: handleArtilleryCommand,
  createRender: createArtilleryRender,
  updateRender: updateArtilleryRender,
  applyScenario: applyArtilleryScenario,
};
