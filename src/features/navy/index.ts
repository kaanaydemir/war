import type { Feature } from '../../core/feature';
import { generateNavyTextures } from './art';
import { createNavyRender, updateNavyRender } from './render';
import { navyApplyScenario, navyInitState } from './scenario';
import { navyHandleCommand, navySimTick } from './sim';

/**
 * NAVY: Ottoman & Christian fleets, the Golden Horn chain, the 20 Nisan battle (K5),
 * the ships hauled overland (K7), the Venetian fire raid (K8), the pontoon bridge (K9)
 * and the final relief fleet.
 */
export const navyFeature: Feature = {
  id: 'navy',
  generateTextures: generateNavyTextures,
  initState: navyInitState,
  simTick: navySimTick,
  handleCommand: navyHandleCommand,
  createRender: createNavyRender,
  updateRender: updateNavyRender,
  applyScenario: navyApplyScenario,
};
