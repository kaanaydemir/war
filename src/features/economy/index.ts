import type { Feature } from '../../core/feature';
import { generateEconomyTextures } from './art';
import { createEconomyRender, updateEconomyRender } from './render';
import { applyEconomyScenario } from './scenario';
import { economyTick, handleEconomyCommand, initEconomy } from './sim';

/**
 * ECONOMY & CONSTRUCTION — resources, buildings, workers, Edirne caravans, the
 * Ottoman siege camp and Rumeli Hisarı (owner: economy agent).
 */
export const economyFeature: Feature = {
  id: 'economy',
  generateTextures: (gen) => generateEconomyTextures(gen),
  initState: (state, world) => initEconomy(state, world),
  simTick: (state, ctx) => economyTick(state, ctx),
  handleCommand: (state, cmd, ctx) => handleEconomyCommand(state, cmd, ctx),
  createRender: (rc) => createEconomyRender(rc),
  updateRender: (rc, state, dt) => updateEconomyRender(rc, state, dt),
  applyScenario: (name, state, world) => applyEconomyScenario(name, state, world),
};
