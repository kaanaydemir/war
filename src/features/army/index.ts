import type { Feature } from '../../core/feature';
import { generateArmyTextures } from './art';
import { initArmy } from './campaign';
import { createArmyRender, updateArmyRender } from './render';
import { applyArmyScenario } from './scenario';
import { handleArmyCommand, tickArmy } from './sim';

/**
 * ARMY — unit types & commanders, groups, movement, orders, assaults,
 * the march from Edirne and the final assault (K18/K19).
 */
export const armyFeature: Feature = {
  id: 'army',
  generateTextures: (gen) => generateArmyTextures(gen),
  initState: (state, world) => initArmy(state, world),
  simTick: (state, ctx) => tickArmy(state, ctx),
  handleCommand: (state, cmd, ctx) => handleArmyCommand(state, cmd, ctx),
  createRender: (rc) => createArmyRender(rc),
  updateRender: (rc, state, dt) => updateArmyRender(rc, state, dt),
  applyScenario: (name, state, world) => applyArmyScenario(name, state, world),
};
