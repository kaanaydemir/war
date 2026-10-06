import type { WorldApi } from '../../core/world';

/** PUBLIC API of world (owner: world agent): 1 px per tile colored minimap (cached). */
let cache: HTMLCanvasElement | null = null;
export function minimapCanvas(world: WorldApi): HTMLCanvasElement {
  if (cache) return cache;
  const cv = document.createElement('canvas');
  cv.width = world.width;
  cv.height = world.height;
  const ctx = cv.getContext('2d')!;
  for (let y = 0; y < world.height; y++)
    for (let x = 0; x < world.width; x++) {
      ctx.fillStyle = world.isWater(x, y) ? '#1f6694' : '#4b8840';
      ctx.fillRect(x, y, 1, 1);
    }
  cache = cv;
  return cv;
}
