import type { Cost, ShipTypeDef } from '../../core/defs';
import type { ShipType } from '../../core/state';

/**
 * NAVY static data (owner: navy). Pure — no Phaser.
 *
 * Numbers are game abstractions: one Ottoman ship ENTITY stands for a squadron of
 * several historical hulls (the map shows ≈ 35 entities for a fleet the sources
 * put at 100–400 vessels of every size; Barbaro: 12 galleys, 70–80 fustae,
 * 20–25 parandaria and many smaller boats).
 */
export const SHIP_TYPES: Record<ShipType, ShipTypeDef> = {
  kadirga: {
    id: 'kadirga',
    name: 'Kadırga',
    desc: 'Osmanlı donanmasının asıl savaş gemisi. Her yanda yirmi beşe yakın kürek, tek direk ve Latin yelkeni; pruvasında küçük toplar. Hızlı ve çevik, fakat bordası alçak: yüksek bordalı gemilere çıkmak çok zordur.',
    side: 'osmanli',
    hp: 100,
    speed: 0.62,
    power: 1,
    tall: false,
    icon: 'navy/ikon-kadirga',
  },
  kalyete: {
    id: 'kalyete',
    name: 'Kalyete',
    desc: 'Kadırgadan küçük, daha az kürekli savaş gemisi. Abluka ve keşifte kullanılır; karadan Haliç\'e indirilen gemilerin bir kısmı kalyetelerdi.',
    side: 'osmanli',
    hp: 72,
    speed: 0.68,
    power: 0.72,
    tall: false,
    icon: 'navy/ikon-kalyete',
  },
  fusta: {
    id: 'fusta',
    name: 'Fusta',
    desc: 'Hafif, alçak bordalı küçük kadırga. Çabuk, ucuz ve sığ suda rahat; 22 Nisan gecesi kızaklarla Haliç\'e indirilen gemilerin çoğu fustaydı.',
    side: 'osmanli',
    hp: 46,
    speed: 0.8,
    power: 0.46,
    tall: false,
    icon: 'navy/ikon-fusta',
  },
  parandarya: {
    id: 'parandarya',
    name: 'Parandarya',
    desc: 'Geniş karınlı nakliye gemisi: at, erzak, kereste ve top taşır. Savaşta işe yaramaz ama ordunun ikmali ona bağlıdır.',
    side: 'osmanli',
    hp: 80,
    speed: 0.42,
    power: 0.2,
    tall: false,
    icon: 'navy/ikon-parandarya',
  },
  'ceneviz-gemisi': {
    id: 'ceneviz-gemisi',
    name: 'Ceneviz gemisi',
    desc: 'Yüksek kıç ve baş kasaralı, kare yelkenli büyük Ceneviz ticaret gemisi (karaka). Güvertesi kadırgalardan çok yüksekte olduğu için yukarıdan taş, ok ve ateş çömleği yağdırır; borda ile ele geçirilmesi çok güçtür.',
    side: 'ceneviz',
    hp: 330,
    speed: 0.95,
    power: 2.2,
    tall: true,
    icon: 'navy/ikon-ceneviz',
  },
  'bizans-gemisi': {
    id: 'bizans-gemisi',
    name: 'Bizans gemisi',
    desc: 'İmparatorluğun büyük, yüksek bordalı zahire gemisi. 20 Nisan\'da Sicilya buğdayıyla gelen gemi buydu.',
    side: 'bizans',
    hp: 270,
    speed: 0.85,
    power: 1.7,
    tall: true,
    icon: 'navy/ikon-bizans',
  },
  'venedik-kadirgasi': {
    id: 'venedik-kadirgasi',
    name: 'Venedik kadırgası',
    desc: 'Venedik\'in büyük ticaret kadırgası. Kürekli ve yelkenli, Osmanlı kadırgasından iri ve kalabalık tayfalı. Kuşatmada Haliç\'teki Hristiyan filosunun belkemiğiydi.',
    side: 'venedik',
    hp: 140,
    speed: 0.66,
    power: 1.3,
    tall: false,
    icon: 'navy/ikon-venedik',
  },
};

export const SHIP_TYPE_IDS = Object.keys(SHIP_TYPES) as ShipType[];

/**
 * Footprint radius in tiles. Ships are drawn ≈ 4× their historical size for
 * readability, so spacing in the sim follows the sprites, not the real hulls.
 */
export const SHIP_RADIUS: Record<ShipType, number> = {
  kadirga: 1.15,
  kalyete: 0.95,
  fusta: 0.78,
  parandarya: 0.9,
  'ceneviz-gemisi': 0.95,
  'bizans-gemisi': 0.88,
  'venedik-kadirgasi': 1.25,
};

/** Commanders of the fleet (K5: Baltaoğlu is replaced by Hamza Bey after 20 Nisan). */
export const NAVY_COMMANDERS = {
  baltaoglu: { id: 'baltaoglu', name: 'Baltaoğlu Süleyman Bey', title: 'Donanma komutanı (Gelibolu sancakbeyi)' },
  hamza: { id: 'hamza', name: 'Hamza Bey', title: 'Donanma komutanı' },
} as const;
export type NavyCommanderId = keyof typeof NAVY_COMMANDERS;

/** Ottoman siege fleet (entities). Order matters: the first kadırga is the flagship. */
export const OTTOMAN_FLEET: { type: ShipType; count: number }[] = [
  { type: 'kadirga', count: 8 },
  { type: 'kalyete', count: 7 },
  { type: 'fusta', count: 13 },
  { type: 'parandarya', count: 5 },
];

/** Christian ships inside the Golden Horn at the start of the siege. */
export const HORN_FLEET: { type: ShipType; side: 'bizans' | 'ceneviz' | 'venedik'; name: string }[] = [
  { type: 'venedik-kadirgasi', side: 'venedik', name: 'Gabriele Trevisan\'ın kadırgası' },
  { type: 'venedik-kadirgasi', side: 'venedik', name: 'Aluvixe Diedo\'nun kadırgası' },
  { type: 'venedik-kadirgasi', side: 'venedik', name: 'Zaccaria Grioni\'nin kadırgası' },
  { type: 'ceneviz-gemisi', side: 'ceneviz', name: 'Ceneviz karakası' },
  { type: 'ceneviz-gemisi', side: 'ceneviz', name: 'Ceneviz karakası' },
  { type: 'bizans-gemisi', side: 'bizans', name: 'İmparatorluk gemisi' },
  { type: 'bizans-gemisi', side: 'bizans', name: 'İmparatorluk gemisi' },
  { type: 'venedik-kadirgasi', side: 'venedik', name: 'Venedik kadırgası' },
];

/** K5 relief ships (20 Nisan): three Genoese carracks hired by the Pope + one imperial grain ship. */
export const RELIEF_SHIPS: { type: ShipType; side: 'bizans' | 'ceneviz'; name: string }[] = [
  { type: 'ceneviz-gemisi', side: 'ceneviz', name: 'Ceneviz gemisi (Maurizio Cattaneo)' },
  { type: 'ceneviz-gemisi', side: 'ceneviz', name: 'Ceneviz gemisi (Domenico da Novara)' },
  { type: 'ceneviz-gemisi', side: 'ceneviz', name: 'Ceneviz gemisi (Battista da Felizzano)' },
  { type: 'bizans-gemisi', side: 'bizans', name: 'İmparatorluk zahire gemisi (Flectanella)' },
];

/** K7 — ships hauled overland. */
export const OVERLAND = {
  /** Earliest siege day (Gün N). */
  minSiegeDay: 12,
  cost: { kereste: 400, yag: 100, akce: 2500 } as Cost,
  workers: 300,
  /** Galata must stay calm (state.galata ≥ this). */
  minGalata: -20,
  /** Game days of work to lay the greased-log slipway. */
  slipwayDays: 0.45,
  /** Historical number of vessels hauled (shown in UI/log). */
  historicalShips: 72,
  /** Max ship entities hauled (fustae + kalyete). */
  maxEntities: 16,
  minEntities: 4,
  /** Route traversal speed (tiles per sim-second) and launch spacing (sim-seconds). */
  haulSpeed: 1.45,
  launchGap: 3.2,
} as const;

/** K9 — pontoon bridge of barrels over the upper Golden Horn. */
export const BRIDGE = {
  cost: { kereste: 350, akce: 3000 } as Cost,
  workers: 250,
  buildDays: 1.6,
} as const;

/** K5 — morale consequences. */
export const BATTLE_EFFECTS = {
  yarildi: { morale: -7, divan: -8, byzMorale: 10, byzFood: 15 },
  durduruldu: { morale: 8, divan: 6, byzMorale: -10, byzFood: 0 },
} as const;

/** Overland haul start/end are taken from data/geography OVERLAND_ROUTE. */

/**
 * Direction of the pontoon bridge in tile space (unit vector), across the upper
 * Golden Horn from the Ayvansaray shore toward the opposite (Hasköy/Sütlüce) shore.
 */
export const BRIDGE_DIR = { tx: 0.66, ty: -0.75 } as const;
