import type { Feature, RenderContext } from '../../core/feature';
import { generateWorldTextures } from './art';
import { placeDecor, type DecorItem } from './decor';
import { WorldRender } from './render';
import { asWorldData, sharedWorld, type WorldData } from './terrain';

/**
 * WORLD feature: terrain grid (terrain.ts, pure WorldApi), baked terrain chunks,
 * animated water shader, seasonal swaying decor and the minimap (minimap.ts).
 * Camera controls live in core (CameraController).
 */
const decorCache = new WeakMap<WorldData, DecorItem[]>();
const renders = new WeakMap<RenderContext, WorldRender>();

function decorFor(world: WorldData): DecorItem[] {
  let d = decorCache.get(world);
  if (!d) decorCache.set(world, (d = placeDecor(world)));
  return d;
}

export const worldFeature: Feature = {
  id: 'world',

  generateTextures(gen) {
    generateWorldTextures(gen);
  },

  createRender(rc) {
    const world = asWorldData(rc.world) ?? sharedWorld();
    renders.set(rc, new WorldRender(rc, world, decorFor(world)));
  },

  updateRender(rc, state, dt) {
    renders.get(rc)?.update(state, dt);
  },
};
