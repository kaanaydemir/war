import type { Feature } from '../../core/feature';
import { generateSiegeworksTextures } from './art';
import { createSiegeworksRender, updateSiegeworksRender } from './render';
import { applySiegeworksScenario, handleSiegeworksCommand, initSiegeworks, tickSiegeworks } from './sim';

/**
 * SIEGEWORKS — moat filling (hendek), mines & Grant's counter-mines (lağım, K11),
 * the great siege tower (K12) and mantlet cover.
 */
export const siegeworksFeature: Feature = {
  id: 'siegeworks',
  generateTextures: generateSiegeworksTextures,
  initState: (state) => initSiegeworks(state),
  simTick: tickSiegeworks,
  handleCommand: handleSiegeworksCommand,
  createRender: createSiegeworksRender,
  updateRender: updateSiegeworksRender,
  applyScenario: applySiegeworksScenario,
};
