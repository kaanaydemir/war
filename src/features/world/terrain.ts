import { MAP_H, MAP_W } from '../../core/constants';
import { tileToWorld, worldToTile, type TilePt } from '../../core/iso';
import { astar } from '../../core/path';
import type { MoveMode, RegionId, Terrain, WorldApi } from '../../core/world';
import { WATER, geoPolyToTiles } from '../../data/geography';

/**
 * STUB (owner: world agent). Pure-data world grid built from data/geography.ts.
 * Must stay free of Phaser so it runs in tests.
 */
function pointInPoly(x: number, y: number, poly: TilePt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.ty > y !== b.ty > y && x < ((b.tx - a.tx) * (y - a.ty)) / (b.ty - a.ty) + a.tx) inside = !inside;
  }
  return inside;
}

export function createWorld(): WorldApi {
  const W = MAP_W;
  const H = MAP_H;
  const terrain: Terrain[] = new Array(W * H);
  const blocked = new Uint8Array(W * H);
  const water = geoPolyToTiles(WATER);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) terrain[y * W + x] = pointInPoly(x + 0.5, y + 0.5, water) ? 'su' : 'cimen';
  const inB = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
  const api: WorldApi = {
    width: W,
    height: H,
    inBounds: (tx, ty) => inB(Math.floor(tx), Math.floor(ty)),
    terrainAt: (tx, ty) => (inB(tx | 0, ty | 0) ? terrain[(ty | 0) * W + (tx | 0)] : 'derin-su'),
    heightAt: () => 0,
    isWater: (tx, ty) => {
      const t = api.terrainAt(tx, ty);
      return t === 'su' || t === 'derin-su' || t === 'sig-su';
    },
    regionAt: (tx, ty): RegionId => (api.isWater(tx, ty) ? 'marmara' : 'trakya'),
    moveCost: (tx, ty, mode: MoveMode) => {
      if (!inB(tx | 0, ty | 0)) return Infinity;
      const w = api.isWater(tx, ty);
      if (mode === 'sea') return w ? 1 : Infinity;
      if (w || blocked[(ty | 0) * W + (tx | 0)]) return Infinity;
      return 1;
    },
    findPath: (from, to, mode) => astar(W, H, from, to, (x, y) => api.moveCost(x, y, mode)),
    nearestPassable: (t, mode, radius = 8) => {
      for (let r = 0; r <= radius; r++)
        for (let dy = -r; dy <= r; dy++)
          for (let dx = -r; dx <= r; dx++) {
            const x = Math.round(t.tx) + dx;
            const y = Math.round(t.ty) + dy;
            if (isFinite(api.moveCost(x, y, mode))) return { tx: x, ty: y };
          }
      return null;
    },
    toWorld: (tx, ty) => tileToWorld(tx, ty, 0),
    toTile: (wx, wy) => worldToTile(wx, wy),
    setBlocked: (tx, ty, b) => {
      if (inB(tx | 0, ty | 0)) blocked[(ty | 0) * W + (tx | 0)] = b ? 1 : 0;
    },
  };
  return api;
}
