import type { Feature } from '../core/feature';
import { worldFeature } from '../features/world';
import { economyFeature } from '../features/economy';
import { fortificationsFeature } from '../features/fortifications';
import { artilleryFeature } from '../features/artillery';
import { siegeworksFeature } from '../features/siegeworks';
import { armyFeature } from '../features/army';
import { navyFeature } from '../features/navy';
import { byzantiumFeature } from '../features/byzantium';
import { eventsFeature } from '../features/events';
import { atmosphereFeature } from '../features/atmosphere';
import { audioFeature } from '../features/audio';

/**
 * Feature order = sim tick order AND render creation order.
 * Atmosphere is created FIRST in render (it installs the FX implementation)
 * — see GameScene, which special-cases it.
 */
export const FEATURES: Feature[] = [
  worldFeature,
  economyFeature,
  artilleryFeature,
  siegeworksFeature,
  armyFeature,
  navyFeature,
  byzantiumFeature,
  fortificationsFeature,
  eventsFeature,
  atmosphereFeature,
  audioFeature,
];
