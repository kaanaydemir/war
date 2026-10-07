import { GEO_LAT0, GEO_LON1, TILES_PER_DEG_LAT, TILES_PER_DEG_LON } from '../core/constants';
import type { TilePt } from '../core/iso';

/**
 * GEOGRAPHY — authored from real coordinates (approximate, WGS84 lat/lon).
 * Projection: equirectangular around Istanbul, ≈62 m per tile.
 * features/world rasterizes these polygons into the tile grid and may smooth
 * them, but MUST keep landmarks where they are.
 */
export type LatLon = [number, number]; // [lat, lon]

/**
 * Geographic → tile. +tx = SOUTH, +ty = WEST (see core/constants.ts for why: it puts
 * the Ottoman side of the land walls toward the viewer).
 */
export function geoToTile(lat: number, lon: number): TilePt {
  return {
    tx: (GEO_LAT0 - lat) * TILES_PER_DEG_LAT,
    ty: (GEO_LON1 - lon) * TILES_PER_DEG_LON,
  };
}

/** Tile → geographic [lat, lon]. */
export function tileToGeo(tx: number, ty: number): LatLon {
  return [GEO_LAT0 - tx / TILES_PER_DEG_LAT, GEO_LON1 - ty / TILES_PER_DEG_LON];
}

/** Unit tile deltas for compass directions. Use these instead of hard-coded ±tx/±ty. */
export const GEO_DIR = {
  north: { tx: -1, ty: 0 },
  south: { tx: 1, ty: 0 },
  east: { tx: 0, ty: -1 },
  west: { tx: 0, ty: 1 },
} as const;

export function geoPolyToTiles(pts: LatLon[]): TilePt[] {
  return pts.map(([la, lo]) => geoToTile(la, lo));
}

/**
 * The single WATER polygon (Marmara + Bosphorus + Golden Horn), traced as:
 * European Marmara coast west→east, around Sarayburnu, into the Golden Horn
 * (south shore) to Kağıthane, back along the north shore (Galata), up the
 * European Bosphorus shore to the north map edge, across, down the Asian shore
 * to the south map edge, then along the south edge back west.
 * (Map edges: lat 41.098 … 40.986, lon 28.885 … 29.074.)
 */
export const WATER: LatLon[] = [
  // Marmara — European coast (Zeytinburnu → Yedikule → Samatya → Kumkapı → Sarayburnu)
  [40.9855, 28.885],
  [40.985, 28.905],
  [40.9905, 28.918],
  [40.9925, 28.9228],
  [40.996, 28.93],
  [40.9985, 28.938],
  [41.001, 28.948],
  [41.0035, 28.958],
  [41.0045, 28.965],
  [41.005, 28.972],
  [41.004, 28.979],
  [41.0065, 28.985],
  [41.011, 28.987],
  [41.017, 28.9855],
  // Golden Horn — south shore (Sirkeci → Eminönü → Unkapanı → Fener → Balat → Ayvansaray → Eyüp)
  [41.0168, 28.979],
  [41.0175, 28.971],
  [41.02, 28.965],
  [41.023, 28.96],
  [41.027, 28.956],
  [41.032, 28.95],
  [41.038, 28.947],
  [41.043, 28.944],
  [41.047, 28.938],
  [41.052, 28.934],
  [41.058, 28.936],
  [41.065, 28.94],
  // Golden Horn — north shore back east (Sütlüce → Hasköy → Kasımpaşa → Azapkapı → Karaköy)
  [41.064, 28.946],
  [41.057, 28.947],
  [41.05, 28.949],
  [41.043, 28.952],
  [41.038, 28.958],
  [41.035, 28.963],
  [41.031, 28.967],
  [41.027, 28.971],
  [41.024, 28.976],
  [41.025, 28.981],
  // Bosphorus — European shore northward (Tophane → Fındıklı → Dolmabahçe → Beşiktaş → Ortaköy → Bebek → Rumeli Hisarı)
  [41.0275, 28.984],
  [41.032, 28.99],
  [41.036, 28.995],
  [41.042, 29.006],
  [41.047, 29.025],
  [41.056, 29.033],
  [41.068, 29.042],
  [41.075, 29.044],
  [41.08, 29.048],
  [41.0848, 29.0545],
  [41.092, 29.0565],
  [41.0985, 29.057],
  // across the north edge
  [41.0985, 29.066],
  // Asian shore southward (Kanlıca → Anadolu Hisarı → Kandilli → Çengelköy → Beylerbeyi → Kuzguncuk → Üsküdar → Haydarpaşa → Kadıköy)
  [41.09, 29.067],
  [41.0823, 29.0665],
  [41.074, 29.061],
  [41.064, 29.059],
  [41.052, 29.052],
  [41.045, 29.045],
  [41.035, 29.03],
  [41.026, 29.015],
  [41.02, 29.009],
  [41.01, 29.012],
  [41.0, 29.02],
  [40.99, 29.023],
  [40.985, 29.024],
  // closes along the south map edge back to the first point (west)
];

/** Theodosian land walls polyline, NORTH (Golden Horn) → SOUTH (Marmara). */
export const LAND_WALLS: LatLon[] = [
  [41.0428, 28.9443], // Ayvansaray (Golden Horn end)
  [41.0402, 28.9428], // Blahernai
  [41.036, 28.9418], // Eğrikapı (Kaligaria)
  [41.0335, 28.9405], // Tekfur Sarayı (Porphyrogenitus) — Kerkoporta nearby
  [41.0297, 28.9339], // Edirnekapı (Charisius)
  [41.0245, 28.927], // Sulukule — Mesoteichion / Lykos valley
  [41.0197, 28.9218], // Topkapı (St. Romanus)
  [41.0135, 28.918], // Mevlevihanekapı (Rhegium)
  [41.008, 28.9165], // Silivrikapı (Pege)
  [41.001, 28.92], // Belgradkapı (Xylokerkos)
  [40.9945, 28.9225], // Yedikule / Altınkapı
  [40.9928, 28.9232], // Mermer Kule (shore)
];

/** Genoese Galata walls (closed polygon, approximate). */
export const GALATA_WALLS: LatLon[] = [
  [41.0238, 28.9695],
  [41.0262, 28.9725],
  [41.0256, 28.9741], // Galata Kulesi
  [41.0262, 28.9775],
  [41.0258, 28.981],
  [41.0245, 28.9808],
  [41.0242, 28.9765],
];

/** Route of the ships hauled overland (22 Nisan 1453), Bosphorus → Golden Horn. */
export const OVERLAND_ROUTE: LatLon[] = [
  [41.037, 28.9955], // Bosphorus shore (Dolmabahçe / Diplokionion)
  [41.0385, 28.989],
  [41.039, 28.982], // ridge
  [41.0378, 28.9745],
  [41.0362, 28.9665], // Kasımpaşa — into the Golden Horn
];

/** Golden Horn chain: Eugenius tower (Sarayburnu side) → Galata (Kastellion). */
export const CHAIN: LatLon[] = [
  [41.0166, 28.9785],
  [41.0242, 28.9772],
];

/** Edirne road, entering from the west map edge toward Edirnekapı. */
export const EDIRNE_ROAD: LatLon[] = [
  [41.044, 28.885],
  [41.039, 28.9],
  [41.033, 28.915],
  [41.0297, 28.931],
];

/** Via Egnatia toward the Golden Gate (Silivri road). */
export const SILIVRI_ROAD: LatLon[] = [
  [40.998, 28.885],
  [40.999, 28.905],
  [40.9955, 28.92],
];

/** Hills (for terrain height) — [lat, lon, radiusTiles, heightLevel]. */
export const HILLS: [number, number, number, number][] = [
  [41.039, 28.982, 9, 3], // Pera/Taksim ridge (overland route crosses it)
  [41.027, 28.974, 4, 2], // Galata hill
  [41.0085, 28.976, 6, 2], // First hill (Ayasofya / Akropolis)
  [41.017, 28.95, 7, 2], // Valens / Fatih hills
  [41.026, 28.938, 6, 3], // Sixth hill (Edirnekapı)
  [41.015, 28.905, 6, 2], // Maltepe (Ottoman HQ)
  [41.08, 29.05, 6, 3], // Rumeli Hisarı slope
  [41.08, 29.072, 6, 2], // Anadolu side
  [41.045, 28.97, 6, 2], // Okmeydanı / Kasımpaşa heights
];

/** Forests (timber) — [lat, lon, radiusTiles]. North of Pera and up the Bosphorus. */
export const FORESTS: [number, number, number][] = [
  [41.07, 29.0, 12],
  [41.088, 29.03, 10],
  [41.065, 28.965, 8],
  [41.088, 28.94, 12],
  [41.07, 29.07, 8],
];

/** Stone quarries — [lat, lon]. */
export const QUARRIES: LatLon[] = [
  [41.082, 29.035],
  [41.005, 28.895],
  [41.052, 28.915],
];
