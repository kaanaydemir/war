import { HALF_H, HALF_W, HEIGHT_STEP, WORLD_ORIGIN_X, WORLD_ORIGIN_Y } from './constants';

/**
 * Isometric projection helpers. "World" coordinates are art pixels at zoom 1.
 * A tile (tx, ty) maps to the TOP vertex of its diamond; the diamond center is
 * HALF_H below. Fractional tiles are allowed (unit positions).
 */
export interface Pt {
  x: number;
  y: number;
}
export interface TilePt {
  tx: number;
  ty: number;
}

/** Center of tile (tx,ty) in world pixels, lifted by height level h. */
export function tileToWorld(tx: number, ty: number, h = 0): Pt {
  return {
    x: WORLD_ORIGIN_X + (tx - ty) * HALF_W,
    y: WORLD_ORIGIN_Y + (tx + ty) * HALF_H + HALF_H - h * HEIGHT_STEP,
  };
}

/** Inverse projection (ignores height). Returns fractional tile coordinates. */
export function worldToTile(wx: number, wy: number): TilePt {
  const x = (wx - WORLD_ORIGIN_X) / HALF_W;
  const y = (wy - WORLD_ORIGIN_Y - HALF_H) / HALF_H;
  return { tx: (x + y) / 2, ty: (y - x) / 2 };
}

/** Depth key for y-sorting objects whose foot is at world y. */
export function depthOf(worldY: number): number {
  return worldY;
}

export function dist(a: TilePt, b: TilePt): number {
  return Math.hypot(a.tx - b.tx, a.ty - b.ty);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
