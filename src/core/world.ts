import type { Pt, TilePt } from './iso';

/**
 * World query API — implemented by features/world (pure data, no Phaser),
 * available to every feature via SimContext.world and RenderContext.world.
 */
export type Terrain =
  | 'derin-su' // deep water
  | 'su' // water
  | 'sig-su' // shallows
  | 'kum' // beach
  | 'cimen' // grass
  | 'tarla' // fields/farmland
  | 'orman' // forest
  | 'kaya' // rocky / quarry ground
  | 'yol' // road
  | 'sehir' // city ground (inside the walls / Galata)
  | 'hendek' // moat
  | 'sur'; // wall footprint (impassable to land units unless breached)

export type RegionId =
  | 'sur-ici' // inside Constantinople
  | 'galata'
  | 'halic' // Golden Horn water
  | 'bogaz' // Bosphorus water
  | 'marmara'
  | 'trakya' // European countryside west of the walls (army camp)
  | 'pera' // hills north of Galata (Zağanos)
  | 'bogaz-avrupa' // European Bosphorus shore (Rumeli Hisarı, Beşiktaş)
  | 'anadolu'; // Asian shore

export type MoveMode = 'land' | 'sea';

export interface WorldApi {
  readonly width: number;
  readonly height: number;
  inBounds(tx: number, ty: number): boolean;
  terrainAt(tx: number, ty: number): Terrain;
  heightAt(tx: number, ty: number): number;
  isWater(tx: number, ty: number): boolean;
  regionAt(tx: number, ty: number): RegionId;
  /** Movement cost multiplier (Infinity = impassable). */
  moveCost(tx: number, ty: number, mode: MoveMode): number;
  /** A* path on integer tiles (inclusive of goal), or null. */
  findPath(from: TilePt, to: TilePt, mode: MoveMode): TilePt[] | null;
  /** Nearest passable tile for the given mode (search radius in tiles). */
  nearestPassable(t: TilePt, mode: MoveMode, radius?: number): TilePt | null;
  /** Tile → world pixels, including terrain height. */
  toWorld(tx: number, ty: number): Pt;
  /** World pixels → fractional tile (height-aware best effort). */
  toTile(wx: number, wy: number): TilePt;
  /** Mark tiles as blocked/unblocked by a structure (e.g. buildings). */
  setBlocked(tx: number, ty: number, blocked: boolean): void;
}
