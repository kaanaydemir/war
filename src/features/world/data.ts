import type { LatLon } from '../../data/geography';
import type { LandmarkId } from '../../data/landmarks';

/**
 * WORLD feature private geography (pure data, real approximate coordinates).
 * Complements data/geography.ts with what the terrain generator needs for
 * relief, roads, villages and decor exclusion. All [lat, lon].
 */

export interface RoadDef {
  id: string;
  /** Half width in tiles (visual + grid). */
  halfWidth: number;
  pts: LatLon[];
}

/**
 * Road network of 1452–53. Besides the two Roman roads (data/geography), the
 * Bosphorus shore track to Rumeli Hisarı, the Ottoman camp road along the land
 * walls, the track around the head of the Golden Horn (the army's link to
 * Zağanos Paşa's sector) and the Asian shore road to Anadolu Hisarı.
 */
export const EXTRA_ROADS: RoadDef[] = [
  {
    id: 'bogaz-kiyi',
    halfWidth: 0.55,
    pts: [
      [41.0262, 28.9812],
      [41.0287, 28.9852],
      [41.033, 28.9893],
      [41.0375, 28.9942],
      [41.0433, 29.0038],
      [41.0478, 29.0205],
      [41.0565, 29.0295],
      [41.0682, 29.0386],
      [41.0757, 29.0412],
      [41.0806, 29.0452],
      [41.0838, 29.0502],
    ],
  },
  {
    id: 'ordugah-sur',
    halfWidth: 0.55,
    pts: [
      [40.9962, 28.9125],
      [41.0015, 28.9105],
      [41.0082, 28.9078],
      [41.0138, 28.9088],
      [41.0185, 28.9095],
      [41.0228, 28.9135],
      [41.0262, 28.9182],
      [41.03, 28.9235],
      [41.0338, 28.9288],
      [41.0372, 28.9318],
      [41.0412, 28.9335],
      [41.0452, 28.9325],
    ],
  },
  {
    id: 'otag-edirne',
    halfWidth: 0.5,
    pts: [
      [41.0185, 28.9065],
      [41.0232, 28.9045],
      [41.0285, 28.9052],
      [41.0352, 28.9085],
    ],
  },
  {
    id: 'halic-basi',
    halfWidth: 0.5,
    pts: [
      [41.0452, 28.9325],
      [41.0505, 28.9298],
      [41.0565, 28.9305],
      [41.0628, 28.9335],
      [41.0688, 28.9395],
      [41.0696, 28.9462],
      [41.0655, 28.9505],
      [41.0585, 28.9512],
      [41.0512, 28.9535],
      [41.0452, 28.9568],
      [41.0402, 28.9612],
      [41.0365, 28.9662],
      [41.0322, 28.9685],
      [41.0268, 28.9688],
    ],
  },
  {
    id: 'pera-sirt',
    halfWidth: 0.5,
    pts: [
      [41.0402, 28.9612],
      [41.0425, 28.9682],
      [41.0452, 28.9765],
      [41.0512, 28.9855],
      [41.0592, 28.9955],
      [41.0668, 29.0062],
      [41.0732, 29.0185],
      [41.0778, 29.0312],
      [41.0812, 29.0405],
      [41.0838, 29.0502],
    ],
  },
  {
    id: 'galata-pera',
    halfWidth: 0.45,
    pts: [
      [41.0262, 28.9745],
      [41.0312, 28.9762],
      [41.0372, 28.9772],
      [41.0452, 28.9765],
    ],
  },
  {
    id: 'anadolu-kiyi',
    halfWidth: 0.5,
    pts: [
      [41.0195, 29.0215],
      [41.0262, 29.0262],
      [41.0352, 29.0365],
      [41.0452, 29.0492],
      [41.0552, 29.0568],
      [41.0652, 29.0628],
      [41.0748, 29.0662],
      [41.0822, 29.0712],
      [41.0905, 29.0712],
      [41.0975, 29.0712],
    ],
  },
];

/** Ridge spines raising terrain — [lat, lon][] polyline, level, radius (tiles). */
export interface RidgeDef {
  pts: LatLon[];
  level: number;
  radius: number;
}

export const RIDGES: RidgeDef[] = [
  // Pera / Taksim ridge running north from Galata (the overland route crosses it)
  {
    pts: [
      [41.0305, 28.9765],
      [41.039, 28.9825],
      [41.049, 28.989],
      [41.06, 28.991],
      [41.075, 28.996],
      [41.09, 29.0],
    ],
    level: 2.9,
    radius: 7,
  },
  // European Bosphorus heights rising straight from the shore (Beşiktaş → Bebek → Rumeli Hisarı)
  {
    pts: [
      [41.046, 29.0],
      [41.053, 29.013],
      [41.0625, 29.0225],
      [41.0735, 29.0315],
      [41.0845, 29.0395],
      [41.0965, 29.0475],
    ],
    level: 3.3,
    radius: 8,
  },
  // Asian ridge behind Üsküdar, Kuzguncuk, Kandilli and Anadolu Hisarı
  {
    pts: [
      [41.018, 29.035],
      [41.034, 29.045],
      [41.046, 29.059],
      [41.058, 29.069],
      [41.071, 29.073],
      [41.085, 29.078],
      [41.098, 29.08],
    ],
    level: 2.8,
    radius: 9,
  },
  // Thracian plateau west of the walls (rolling)
  {
    pts: [
      [41.09, 28.89],
      [41.06, 28.905],
      [41.03, 28.895],
      [41.0, 28.89],
    ],
    level: 1.3,
    radius: 14,
  },
];

/** Valleys carved into the terrain — polyline, depth (levels), radius (tiles). */
export const VALLEYS: RidgeDef[] = [
  // Lykos stream valley: crosses the land walls at the Mesoteikhion (the weak point)
  {
    pts: [
      [41.034, 28.886],
      [41.0285, 28.906],
      [41.0262, 28.92],
      [41.0245, 28.927],
      [41.019, 28.938],
      [41.011, 28.948],
      [41.0045, 28.955],
    ],
    level: 1.1,
    radius: 4,
  },
  // Kağıthane & Alibey valleys at the head of the Golden Horn
  {
    pts: [
      [41.064, 28.94],
      [41.08, 28.944],
      [41.098, 28.948],
    ],
    level: 1.4,
    radius: 6,
  },
];

/** Decor-free zones (camps, fortresses, the overland slipway) — landmark + radius in tiles. */
export const DECOR_EXCLUDE: [LandmarkId, number][] = [
  ['otag', 10],
  ['karacaKarargah', 8],
  ['ishakKarargah', 8],
  ['zaganosKarargah', 7],
  ['rumeliHisari', 7],
  ['anadoluHisari', 5],
  ['diplokionion', 6],
  ['kasimpasa', 5],
  ['galataKulesi', 4],
];

/** Thracian / Bosphorus villages: [lat, lon, houses]. */
export const VILLAGES: [number, number, number][] = [
  [41.0655, 28.903, 5], // north Thrace hamlet
  [41.0465, 28.8925, 4], // by the Edirne road
  [40.9985, 28.8915, 4], // Marmara shore west (Bakırköy direction)
  [41.083, 28.917, 3], // upland farms
  [41.0905, 28.968, 3], // above Kağıthane
  [41.0545, 29.017, 3], // Ortaköy / Kuruçeşme slopes
  [41.0218, 29.0335, 6], // Üsküdar (Ottoman since the 14th century)
  [41.0585, 29.0665, 3], // Kandilli / Çengelköy
];

/** Small village chapels outside the walls (Thrace): [lat, lon]. */
export const CHAPELS: [number, number][] = [
  [41.0628, 28.9105],
  [41.0055, 28.8935],
];
