import type { WorldApi } from '../../core/world';
import { P } from '../../art/palette';
import { asWorldData, T, type WorldData } from './terrain';

/**
 * PUBLIC API of world: 1 px per tile minimap (cached per world).
 * Water ramp by depth, land coloured by terrain with a soft hillshade (light from
 * the upper-left), city tan, walls dark red, roads.
 */
const cache = new WeakMap<object, HTMLCanvasElement>();

function rgb(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Pure: RGBA pixels (width × height × 4) of the minimap. */
export function minimapPixels(world: WorldApi): Uint8ClampedArray {
  const W = world.width;
  const H = world.height;
  const out = new Uint8ClampedArray(W * H * 4);
  const wd: WorldData | null = asWorldData(world);
  const water = [P.water[5], P.water[5], P.water[4], P.water[4], P.water[3], P.water[3], P.water[3], P.water[2], P.water[2]].map(rgb);
  const col: Record<number, [number, number, number]> = {
    [T.kum]: rgb(P.sand[4]),
    [T.cimen]: rgb(P.grass[4]),
    [T.tarla]: rgb(P.dryGrass[3]),
    [T.orman]: rgb(P.foliage[3]),
    [T.kaya]: rgb(P.stone[4]),
    [T.yol]: rgb(P.dirt[5]),
    [T.sehir]: rgb(P.sand[3]),
    [T.hendek]: rgb(P.dirt[2]),
    [T.sur]: rgb(P.brick[2]),
  };
  const names: string[] = ['derin-su', 'su', 'sig-su', 'kum', 'cimen', 'tarla', 'orman', 'kaya', 'yol', 'sehir', 'hendek', 'sur'];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const k = (y * W + x) * 4;
      let c: [number, number, number];
      if (world.isWater(x, y)) {
        const d = wd ? wd.depth[y * W + x] : 4;
        c = water[Math.min(water.length - 1, Math.max(0, d - 1))];
        // subtle shoreline highlight
        if (d === 1) c = rgb(P.water[6]);
      } else {
        const t = wd ? wd.terrain[y * W + x] : names.indexOf(world.terrainAt(x, y));
        c = col[t] ?? col[T.cimen];
        const h = world.heightAt(x, y);
        const hl = world.heightAt(Math.max(0, x - 1), y);
        const hu = world.heightAt(x, Math.max(0, y - 1));
        const shade = 1 + (h - hl) * 0.18 + (h - hu) * 0.08 + (h - 1.5) * 0.05;
        if (t !== T.sur) c = [c[0] * shade, c[1] * shade, c[2] * shade];
      }
      out[k] = c[0];
      out[k + 1] = c[1];
      out[k + 2] = c[2];
      out[k + 3] = 255;
    }
  return out;
}

export function minimapCanvas(world: WorldApi): HTMLCanvasElement {
  const hit = cache.get(world);
  if (hit) return hit;
  const cv = document.createElement('canvas');
  cv.width = world.width;
  cv.height = world.height;
  const ctx = cv.getContext('2d')!;
  ctx.putImageData(new ImageData(minimapPixels(world) as Uint8ClampedArray<ArrayBuffer>, world.width, world.height), 0, 0);
  cache.set(world, cv);
  return cv;
}
