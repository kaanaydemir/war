import type { CannonTypeDef } from '../../core/defs';
import type { CannonType, SectionId } from '../../core/state';
import type { TilePt } from '../../core/iso';
import { EDIRNE_ROAD, geoToTile } from '../../data/geography';

/**
 * ARTILLERY DATA (pure — no Phaser).
 *
 * Historical notes (Ottoman sources primary):
 *  - Şahi: the great bronze bombard cast by the master founder Orban (Urban) in
 *    Edirne, winter 1452–53. Kritovoulos describes stone balls of enormous weight;
 *    it could only fire a handful of times a day (≈7) because the barrel had to cool,
 *    and it was set up opposite the St. Romanus gate (Topkapı).
 *  - Transport: dozens of oxen and hundreds of men; carpenters and labourers went
 *    ahead to level the road and build bridges (Kritovoulos, Doukas).
 *  - Havan: Kritovoulos tells that Mehmed had a gun designed that would throw its
 *    stone high so it fell onto ships in the Golden Horn; from the hill behind Galata
 *    it sank a ship.
 *
 * Time scale: a siege day = 180 sim-seconds; ~120 s of it is daylight.
 */
export const CANNON_TYPES: Record<CannonType, CannonTypeDef> = {
  sahi: {
    id: 'sahi',
    name: 'Şahi',
    desc:
      'Dökümcü usta Orban\'ın Edirne\'de döktüğü dev tunç bombarda. Yüzlerce kiloluk taş gülleler atar; ' +
      'namlusu ısındığı için günde ancak yedi kez ateşlenebilir. Soğumadan zorlanırsa çatlayabilir.',
    damage: 42,
    range: 15,
    reloadSec: 15,
    shotsPerDay: 7,
    barutPerShot: 2,
    gullePerShot: 2,
    castCost: { tunc: 120, akce: 4000 },
    castDays: 90,
    crew: 20,
    icon: 'topcu/icon-sahi',
  },
  buyuk: {
    id: 'buyuk',
    name: 'Büyük Bombarda',
    desc: 'Orban\'ın yanında yetişen dökümcülerin döktüğü ağır toplar. Surları döven asıl güç bunlardır.',
    damage: 16,
    range: 12,
    reloadSec: 8,
    shotsPerDay: 12,
    barutPerShot: 1,
    gullePerShot: 1,
    castCost: { tunc: 40, akce: 1200 },
    castDays: 30,
    crew: 10,
    icon: 'topcu/icon-buyuk',
  },
  orta: {
    id: 'orta',
    name: 'Orta Top',
    desc: 'Orta boy tunç top. Hızlı doldurulur; burç ve mazgalları döverek savunucuları sindirir.',
    damage: 6,
    range: 10,
    reloadSec: 4.5,
    shotsPerDay: 20,
    barutPerShot: 0.4,
    gullePerShot: 0.3,
    castCost: { tunc: 14, akce: 450 },
    castDays: 14,
    crew: 6,
    icon: 'topcu/icon-orta',
  },
  kucuk: {
    id: 'kucuk',
    name: 'Darbezen',
    desc: 'Hafif, çabuk ateşlenen küçük top. Sura az hasar verir ama burçlardaki askerleri yıpratır.',
    damage: 2.5,
    range: 8,
    reloadSec: 2.6,
    shotsPerDay: 36,
    barutPerShot: 0.15,
    gullePerShot: 0.1,
    castCost: { tunc: 5, akce: 150 },
    castDays: 6,
    crew: 4,
    icon: 'topcu/icon-kucuk',
  },
  havan: {
    id: 'havan',
    name: 'Havan Topu',
    desc:
      'Fatih\'in tasarlattığı, gülleyi yükseğe atıp yukarıdan düşüren top (Kritovulos). ' +
      'Galata sırtından Haliç\'teki gemileri döver.',
    damage: 4,
    range: 22,
    reloadSec: 12,
    shotsPerDay: 10,
    barutPerShot: 0.8,
    gullePerShot: 0.5,
    castCost: { tunc: 20, akce: 800 },
    castDays: 20,
    crew: 6,
    icon: 'topcu/icon-havan',
  },
};

export const CANNON_ORDER: CannonType[] = ['sahi', 'buyuk', 'orta', 'kucuk', 'havan'];

/** Extra per-type parameters (artillery-private; not part of the shared def). */
export interface CannonExtra {
  /** Base hit probability at point-blank range. */
  hitBase: number;
  /** Heat added per shot, and heat lost per sim-second. */
  heatPerShot: number;
  coolPerSec: number;
  /** Per-shot crack chance when cold, plus extra per unit of heat above 0.55. */
  crackBase: number;
  crackHot: number;
  /** Total Edirne → front transport days at road preparation 0 (×1.35) … 1 (×0.75). */
  transportDays: number;
  /** How many of those days are spent visibly on the map (last stretch of the road). */
  onMapDays: number;
  /** Hours of digging-in once at the battery site. */
  emplaceHours: number;
  /** Tiles per sim-second while being hauled to a new battery site. */
  moveSpeed: number;
  /** Distance from the wall line for auto-emplacement (tiles). */
  standoff: number;
  /** Ball flight time = flightBase + dist × flightPerTile (sim seconds). */
  flightBase: number;
  flightPerTile: number;
  /** Chance a wall hit also kills a defender on the parapet. */
  killChance: number;
  /** Ship damage per hit (havan). */
  shipDamage: number;
  /** Pairs of oxen hauling it. */
  oxPairs: number;
  /** Visible crew figures on the map. */
  crewVisible: number;
  /** Name stem for numbered guns. */
  stem: string;
}

export const CANNON_EXTRA: Record<CannonType, CannonExtra> = {
  sahi: {
    hitBase: 0.72, heatPerShot: 0.32, coolPerSec: 0.0135, crackBase: 0.0006, crackHot: 0.012,
    transportDays: 45, onMapDays: 10, emplaceHours: 3, moveSpeed: 0.22, standoff: 8.6,
    flightBase: 0.9, flightPerTile: 0.08, killChance: 0.12, shipDamage: 60, oxPairs: 12, crewVisible: 12, stem: 'Şahi',
  },
  buyuk: {
    hitBase: 0.66, heatPerShot: 0.15, coolPerSec: 0.015, crackBase: 0.0002, crackHot: 0.004,
    transportDays: 22, onMapDays: 5, emplaceHours: 2, moveSpeed: 0.35, standoff: 6.4,
    flightBase: 0.7, flightPerTile: 0.07, killChance: 0.04, shipDamage: 30, oxPairs: 6, crewVisible: 7, stem: 'Büyük Bombarda',
  },
  orta: {
    hitBase: 0.6, heatPerShot: 0.08, coolPerSec: 0.016, crackBase: 0, crackHot: 0,
    transportDays: 14, onMapDays: 3, emplaceHours: 1.5, moveSpeed: 0.5, standoff: 5.6,
    flightBase: 0.55, flightPerTile: 0.06, killChance: 0.03, shipDamage: 14, oxPairs: 3, crewVisible: 4, stem: 'Orta Top',
  },
  kucuk: {
    hitBase: 0.55, heatPerShot: 0.05, coolPerSec: 0.02, crackBase: 0, crackHot: 0,
    transportDays: 10, onMapDays: 2, emplaceHours: 1, moveSpeed: 0.7, standoff: 4.8,
    flightBase: 0.45, flightPerTile: 0.05, killChance: 0.05, shipDamage: 6, oxPairs: 1, crewVisible: 3, stem: 'Darbezen',
  },
  havan: {
    hitBase: 0.38, heatPerShot: 0.12, coolPerSec: 0.012, crackBase: 0.0003, crackHot: 0.003,
    transportDays: 16, onMapDays: 3, emplaceHours: 2, moveSpeed: 0.4, standoff: 8,
    flightBase: 2.2, flightPerTile: 0.05, killChance: 0.02, shipDamage: 35, oxPairs: 3, crewVisible: 4, stem: 'Havan Topu',
  },
};

/** Orban's salary/hire cost — Mehmed paid him far more than Byzantium could. */
export const ORBAN_COST = { akce: 3500 } as const;
/** Max simultaneous castings in the Edirne foundry. */
export const FOUNDRY_SLOTS = 2;
/** Cost and duration of hooping a cracked barrel with iron bands. */
export const REPAIR_COST = { tunc: 10, akce: 400 } as const;
export const REPAIR_DAYS = 2;

/** Rough priority for auto-assigning land-wall targets (historic main effort on Lykos/St. Romanus). */
export const TARGET_WEIGHT: Record<SectionId, number> = {
  'kara-topkapi': 3,
  'kara-lykos': 3,
  'kara-edirnekapi': 2,
  'kara-blahernai': 2,
  'kara-egrikapi': 1.2,
  'kara-mevlevihane': 1.2,
  'kara-silivrikapi': 1,
  'kara-belgradkapi': 0.8,
  'kara-yedikule': 0.8,
};

/** Historic battery layout (≈14 batteries; Leonardo, Barbaro, Kritovoulos). */
export const HISTORIC_BATTERIES: { section: SectionId; type: CannonType; t?: number }[] = [
  { section: 'kara-blahernai', type: 'buyuk' },
  { section: 'kara-blahernai', type: 'orta' },
  { section: 'kara-egrikapi', type: 'kucuk' },
  { section: 'kara-edirnekapi', type: 'buyuk' },
  { section: 'kara-edirnekapi', type: 'orta' },
  { section: 'kara-lykos', type: 'buyuk' },
  { section: 'kara-lykos', type: 'orta' },
  { section: 'kara-lykos', type: 'kucuk' },
  // the Şahi faced the St. Romanus gate (south end of this section)
  { section: 'kara-topkapi', type: 'sahi', t: 0.86 },
  { section: 'kara-topkapi', type: 'buyuk', t: 0.42 },
  { section: 'kara-topkapi', type: 'orta', t: 0.1 },
  { section: 'kara-mevlevihane', type: 'orta' },
  { section: 'kara-silivrikapi', type: 'buyuk' },
  { section: 'kara-belgradkapi', type: 'kucuk' },
];

/** Where cannons waiting in Edirne are kept (off-map, west of the road's entry). */
export const EDIRNE_TILE: TilePt = { tx: -8, ty: 95 };

/** Artillery park near the Sultan's camp, where arriving guns wait for orders. */
export const PARK_TILE: TilePt = { tx: 37, ty: 126 };

/** Havan site on the hill behind Galata (Kritovoulos). */
export const HAVAN_TILE: TilePt = geoToTile(41.0312, 28.9772);

/** Edirne road on the map (tile space) — the first three vertices, then the park. */
export function roadPath(): TilePt[] {
  const road = EDIRNE_ROAD.slice(0, 3).map(([la, lo]) => geoToTile(la, lo));
  return [{ tx: road[0].tx - 0.5, ty: road[0].ty }, ...road.slice(1)];
}

/** Turkish status labels. */
export const STATUS_ADI: Record<string, string> = {
  dokuluyor: 'Dökülüyor',
  yolda: 'Yolda',
  mevzileniyor: 'Mevzileniyor',
  hazir: 'Hazır',
  soguyor: 'Soğuyor',
  kirik: 'Çatlak',
  edirne: 'Edirne\'de bekliyor',
};
