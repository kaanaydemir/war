import type { Cost } from '../../core/defs';
import type { Mine, UnitTypeId } from '../../core/state';

/**
 * SIEGEWORKS — static data & balance (pure, no Phaser).
 *
 * Historical notes (Ottoman sources first):
 *  - Tursun Bey and Aşıkpaşazade describe the hendek being filled with earth, stones and
 *    çalı (brushwood) under fire; Kritovoulos adds timber and the men working at night.
 *  - The Novo Brdo (Novaberda) miners dug the lağıms, mostly against the single
 *    Blachernae wall where there was no moat; Grant (Sphrantzes: "Ioannes Grant")
 *    listened for them and answered with counter-tunnels, smoke and fire. Barbaro's
 *    diary lists the finds between 16 and 25 May; captured officers betrayed the
 *    remaining tunnels on 23 May.
 *  - Barbaro: on 18/19 May a great wooden tower covered with hides appeared before the
 *    St Romanus gate overnight; the defenders burned it with powder barrels in a sortie.
 */

// ───────────────────────────── moat filling ─────────────────────────────

/** Moat fill fraction per day with ~900 effective men in good conditions. */
export const FILL_RATE = 0.16;
/** Crew size at which the crew factor reaches 1 (diminishing returns beyond). */
export const FILL_CREW_REF = 900;
/** Night work: darker, slower, but less exposed. */
export const FILL_NIGHT = 0.6;
/** Kereste consumed per full section of moat (fascines, planks). */
export const FILL_KERESTE = 140;
/** Without timber the men only throw earth and rubble. */
export const FILL_NO_KERESTE = 0.55;
/** Arrow/handgun casualties per effective man per day (full exposure, strong garrison). */
export const FILL_CASUALTY = 0.011;
/** Byzantines clear the moat at night where nobody works (per day at night, strong garrison). */
export const FILL_CLEAR = 0.035;
/** Moat work effectiveness of each unit type. */
export const FILL_TYPE: Partial<Record<UnitTypeId, number>> = { azap: 1, basibozuk: 0.95, lagimci: 0.85, yeniceri: 0.6, topcu: 0.6, sipahi: 0.45, akinci: 0.4, mehter: 0.2 };
/** Civilian amele (workforce) lent to the moat: max per section. */
export const AMELE_MAX = 1200;
/** Amele are less disciplined under fire than soldiers. */
export const AMELE_FACTOR = 0.8;

// ───────────────────────────── mines (K11) ─────────────────────────────

/** Days to finish a tunnel with a full crew (150+ miners) on a moatless section. */
export const MINE_DAYS = 7;
/** Miners per tunnel for full speed. */
export const MINE_CREW_REF = 150;
/** On moat sections the tunnel must go under the moat: deeper, wetter, slower. */
export const MINE_MOAT_SLOW = 0.6;
/** Max tunnels one sapper group can drive at once. */
export const MINE_PER_GROUP = 3;
/** Distance of the shaft from the wall (tiles). */
export const MINE_DIST = 6.5;
/** Daily detection hazard = skill × (BASE + PROG × progress) (× moat factor). */
export const MINE_DETECT_BASE = 0.12;
export const MINE_DETECT_PROG = 0.55;
export const MINE_DETECT_MOAT = 1.25;
/** Days the Byzantine counter-tunnel needs after detection (range). */
export const COUNTER_DAYS: [number, number] = [0.35, 1.2];
/** Outcome weights of the counter-mine fight. */
export const COUNTER_FATE = { cokme: 0.42, duman: 0.33, esir: 0.15, kurtul: 0.1 } as const;
/** A finished tunnel fires by itself after this many days (props rot / risk). */
export const MINE_AUTOFIRE_DAYS = 1.0;
/** Burning the props until the wall drops (days). */
export const MINE_FIRE_DAYS = 0.05;
/** Wall damage of a successful mine as a share of the section's (outer + inner) max HP. */
export const MINE_DAMAGE = 0.75;
/** Mines that were lost stay visible for a while (days). */
export const MINE_WRECK_DAYS = 6;

export const MINE_STATUS_ADI: Record<Mine['status'], string> = {
  kaziliyor: 'Kazılıyor',
  hazir: 'Hazır — ateşlenmeyi bekliyor',
  cokertildi: 'Çökertildi',
  atesl: 'Destekler yanıyor',
  basarili: 'Sur çöktü!',
};

export type MineFate = 'cokme' | 'duman' | 'esir' | 'basarili';

export const MINE_FATE_ADI: Record<MineFate, string> = {
  cokme: 'Karşı lağımla çökertildi',
  duman: 'Duman ve ateşle boğuldu',
  esir: 'Lağımcılar esir düştü',
  basarili: 'Sur yıkıldı',
};

// ───────────────────────────── siege tower (K12) ─────────────────────────────

export const TOWER_COST: Cost = { kereste: 400, akce: 2000 };
/** Days to raise the tower (historically: overnight with thousands of hands). */
export const TOWER_BUILD_DAYS = 1.2;
/** Start distance from the wall line (tiles). */
export const TOWER_START = 6;
/** Distance at which the tower stops at the moat edge when the moat is not filled. */
export const TOWER_MOAT_STOP = 3.05;
/** Distance at which the tower touches the outer wall and drops its bridge. */
export const TOWER_WALL = 1.2;
/** Moat fill needed to roll the tower across. */
export const TOWER_MOAT_NEED = 0.6;
/** Tiles per day with a full pushing crew. */
export const TOWER_SPEED = 6;
/** Built-in crew that moves the tower without extra groups (men). */
export const TOWER_CREW = 150;
/** Men pushing for full speed. */
export const TOWER_PUSH_REF = 450;
/** Burning: days until the tower collapses into a smouldering wreck. */
export const TOWER_BURN_DAYS = 0.45;
/** Wreck stays for (days). */
export const TOWER_WRECK_DAYS = 4;
/** Max towers standing at once (historically one great tower). */
export const TOWER_MAX = 1;

export type TowerStatus = 'insa' | 'hazir' | 'ilerliyor' | 'bekliyor' | 'surda' | 'yaniyor' | 'yikildi';

export const TOWER_STATUS_ADI: Record<TowerStatus, string> = {
  insa: 'Kuruluyor',
  hazir: 'Hazır — ilerletme emri bekliyor',
  ilerliyor: 'Surlara itiliyor',
  bekliyor: 'Hendek kenarında bekliyor',
  surda: 'Surlara dayandı — köprü indi',
  yaniyor: 'Yanıyor!',
  yikildi: 'Yanıp yıkıldı',
};

// ───────────────────────────── assault bonus ─────────────────────────────

export const BONUS = {
  /** Tower at the wall: men cross its bridge onto the outer wall. */
  towerAtWall: 1.35,
  /** Tower close to the wall: its archers sweep the battlements. */
  towerNear: 1.08,
  /** Per unit of moat fill on moat sections (ladders reach the wall foot). */
  moat: 0.12,
  /** Scaling ladders brought across a half-filled moat. */
  ladders: 1.05,
  /** Ladders prepared for the general assault (final assault declared). */
  finalLadders: 1.05,
  /** A mine brought the wall down recently (rubble ramp, shaken defenders). */
  mineRecent: 1.15,
  mineRecentDays: 1.5,
  /** Mantlets in front of the section. */
  mantlet: 0.1,
};

/** Mantlet (siper) cover per finished siper near a section, and the cap. */
export const MANTLET_EACH = 0.14;
export const MANTLET_MAX = 0.5;
/** Siper counts for a section if it stands within this many tiles of the wall line. */
export const MANTLET_RANGE = 9;
