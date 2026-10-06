/**
 * Render depth bands (Phaser setDepth). World objects standing on the ground
 * use depth = their foot's world-y (see iso.depthOf), which lies in
 * [0, WORLD_PX_H ≈ 4000]. Everything else uses these bands.
 */
export const DEPTH = {
  /** Animated water plane (shader). */
  WATER: -30000,
  /** Baked terrain chunks. */
  TERRAIN: -20000,
  /** Ground decals: roads, moat, scorch marks, rubble flats, shadows, selection rings. */
  GROUND_DECAL: -15000,
  /** Ghost preview for building placement. */
  PLACEMENT: -14000,
  /** y-sorted objects live in [0, ~4000]. */
  OBJECT_BASE: 0,
  /** Projectiles in flight, birds, tall smoke. */
  AIR: 20000,
  /** Drifting cloud shadows. */
  CLOUD_SHADOW: 25000,
  /** Lightmap (night darkness multiply) and additive glow. */
  LIGHTING: 30000,
  GLOW: 31000,
  /** Rain, hail, fog, snow. */
  WEATHER: 35000,
  /** World-space UI: floating text, health/morale bars, order markers. */
  UI_WORLD: 45000,
} as const;
