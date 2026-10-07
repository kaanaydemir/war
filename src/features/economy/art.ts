import type { TextureGen } from '../../art/texture';
import { generateBuildingTextures } from './artBuildings';
import { drawHisarLayer, hisarVisualKey, HISAR_CANVAS, type HisarVisual } from './artHisar';
import { generateTentTextures } from './artTents';
import { generateUnitTextures } from './artUnits';

/** Generate every economy texture (BootScene, once). */
export function generateEconomyTextures(gen: TextureGen): void {
  generateUnitTextures(gen);
  generateTentTextures(gen);
  generateBuildingTextures(gen);
  // Rumeli Hisarı: the staked-out site and the finished fortress (summer & winter) up front;
  // intermediate construction states are generated lazily by the renderer.
  const pre: HisarVisual[] = [
    { t: 0, s: 0, k: { saruca: 0, halil: 0, zaganos: 0 }, done: false, snow: false },
    { t: 4, s: 5, k: { saruca: 6, halil: 6, zaganos: 6 }, done: true, snow: false },
    { t: 4, s: 5, k: { saruca: 6, halil: 6, zaganos: 6 }, done: true, snow: true },
  ];
  for (const v of pre) for (const layer of ['back', 'front'] as const) genHisarLayer(gen, v, layer);
}

/** Generate (if missing) one hisar layer texture and return its key. */
export function genHisarLayer(gen: TextureGen, v: HisarVisual, layer: 'back' | 'front'): string {
  const key = hisarVisualKey(v, layer);
  if (!gen.has(key)) gen.canvas(key, HISAR_CANVAS.w, HISAR_CANVAS.h, (p) => drawHisarLayer(p, v, layer));
  return key;
}
