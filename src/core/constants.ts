/**
 * Global constants shared by every feature. Changing these affects all modules —
 * treat as a contract.
 */

/** Isometric tile footprint in art pixels (2:1 dimetric). */
export const TILE_W = 32;
export const TILE_H = 16;
export const HALF_W = TILE_W / 2;
export const HALF_H = TILE_H / 2;
/** Vertical art-pixel offset per terrain height level. */
export const HEIGHT_STEP = 4;
/** Max terrain height level (0..MAX_HEIGHT). */
export const MAX_HEIGHT = 4;

/**
 * World grid size in tiles. Grid x grows toward geographic EAST, grid y grows
 * toward geographic SOUTH. In the isometric projection north therefore points
 * to the upper-right of the screen. ~62 m per tile.
 */
export const MAP_W = 256;
export const MAP_H = 200;

/** Projection anchors (see data/geography.ts geoToTile). */
export const GEO_LON0 = 28.885;
export const GEO_LAT0 = 41.098;
export const TILES_PER_DEG_LON = 1353;
export const TILES_PER_DEG_LAT = 1790;

/** World pixel origin so that every tile maps to positive coordinates. */
export const WORLD_ORIGIN_X = MAP_H * HALF_W + 64;
export const WORLD_ORIGIN_Y = 96;
/** Bounding size of the whole world in art pixels (zoom 1). */
export const WORLD_PX_W = (MAP_W + MAP_H) * HALF_W + 128;
export const WORLD_PX_H = (MAP_W + MAP_H) * HALF_H + 192;

/** Camera zoom levels: integer art-pixel → screen-pixel scales (pixel-perfect). */
export const ZOOM_LEVELS = [1, 2, 3, 4] as const;
export const DEFAULT_ZOOM = 3;

/** Simulation: fixed step in "sim seconds" (real seconds × game speed). */
export const SIM_STEP = 0.1;
/** Real seconds per game day at 1× speed. */
export const SEC_PER_DAY_HAZIRLIK = 60 / 7; // 1 week ≈ 60 s
export const SEC_PER_DAY_KUSATMA = 180; // 1 siege day ≈ 3 min
export const SEC_PER_DAY_YURUYUS = 6; // march from Edirne

/**
 * Siege day segmentation (fraction of a day, 0 = start of dawn ≈ 05:00).
 * Şafak 15 s, Gündüz 90 s, Akşam 15 s, Gece 60 s at 1× during the siege.
 */
export const DAY_SEGMENTS = {
  safak: [0, 1 / 12],
  gunduz: [1 / 12, 7 / 12],
  aksam: [7 / 12, 8 / 12],
  gece: [8 / 12, 1],
} as const;

/** Calendar epoch: day 0 = 1 Mart 1452. */
export const EPOCH = { year: 1452, month: 3, day: 1 } as const;
