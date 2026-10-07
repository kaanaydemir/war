import type { BuildingDef, Cost } from '../../core/defs';
import { d, TARIH } from '../../core/calendar';
import type { ResourceId } from '../../core/state';

/**
 * ECONOMY DATA (owner: economy). Pure data — no Phaser.
 *
 * Balance notes (Normal):
 *  - Hazırlık: 1 day ≈ 8.6 s at 1×. Rumeli Hisarı may be started on 15 Nisan 1452
 *    (TARIH.hisarBaslangic); at default staffing it is finished in early–mid August
 *    (historically 31 Ağustos 1452). Over-staffing (Edirne → amele topla) finishes
 *    it in July, which events may reward ("Hisarı erken bitirmek").
 *  - Kuşatma: 1 day ≈ 180 s. Caravans cover a share of the army's daily food
 *    (see SUPPLY); the rest must come from stockpiles built during hazırlık.
 */

export const BUILDINGS: BuildingDef[] = [
  {
    id: 'rumeli-hisari',
    name: 'Rumeli Hisarı (Boğazkesen)',
    desc:
      'Boğaz\'ın en dar yerinde, Anadolu Hisarı\'nın tam karşısına kurulan kale. Mimarı Müslihiddin Ağa. ' +
      'Üç büyük kulesini Saruca Paşa, Çandarlı Halil Paşa ve Zağanos Paşa yarışırcasına yaptırdı; ' +
      'üç kapısı ve on üç burcu vardır. Tarihte 15 Nisan – 31 Ağustos 1452 arasında, yaklaşık 4,5 ayda tamamlandı. ' +
      'Bitince Boğaz denetim altına girer, Karadeniz\'den şehre giden erzak kesilir.',
    category: 'ozel',
    size: [6, 6],
    cost: {},
    workersMax: 1800,
    buildDays: 130,
    phases: [],
    unique: true,
    icon: 'econ/icon-hisar',
  },
  {
    id: 'tas-ocagi',
    name: 'Taş Ocağı',
    desc: 'Kayalık arazide taş kesilir. Hisarın, mevzilerin ve güllelerin hammaddesi. Kayalık bir yerin yanına kurulmalı.',
    category: 'uretim',
    size: [3, 3],
    cost: { kereste: 40, akce: 300 },
    workersMax: 40,
    buildDays: 6,
    phases: ['hazirlik', 'kusatma'],
    produces: { tas: 45 },
    near: 'kaya',
    icon: 'econ/icon-tas-ocagi',
  },
  {
    id: 'kereste-kampi',
    name: 'Kereste Kampı',
    desc: 'Baltacılar ve bıçkıcılar ormandan kereste çıkarır. Kızak, iskele, siper ve kule için. Orman kenarına kurulmalı.',
    category: 'uretim',
    size: [3, 3],
    cost: { tas: 10, akce: 250 },
    workersMax: 35,
    buildDays: 5,
    phases: ['hazirlik', 'kusatma'],
    produces: { kereste: 35 },
    near: 'orman',
    icon: 'econ/icon-kereste-kampi',
  },
  {
    id: 'tasci-atolyesi',
    name: 'Taşçı Atölyesi',
    desc: 'Taşçı ustaları kaba taşı yontarak yuvarlak top güllesi yapar. Bir taş ocağının yakınında %20 daha verimli çalışır.',
    category: 'uretim',
    size: [2, 2],
    cost: { tas: 60, kereste: 40, akce: 400 },
    workersMax: 25,
    buildDays: 8,
    phases: ['hazirlik', 'kusatma'],
    consumes: { tas: 30 },
    produces: { gulle: 10 },
    icon: 'econ/icon-tasci-atolyesi',
  },
  {
    id: 'baruthane',
    name: 'Baruthane',
    desc: 'Odun kömürü yakılır; akçeyle alınan güherçile ve kükürtle dövülerek barut yapılır. Ateşten uzak, dikkatli işçilik ister.',
    category: 'uretim',
    size: [3, 2],
    cost: { tas: 80, kereste: 60, akce: 800 },
    workersMax: 25,
    buildDays: 12,
    phases: ['hazirlik', 'kusatma'],
    consumes: { kereste: 15, akce: 60 },
    produces: { barut: 14 },
    icon: 'econ/icon-baruthane',
  },
  {
    id: 'erzak-ambari',
    name: 'Erzak Ambarı',
    desc: 'Çevre köylerden zahire toplanır ve saklanır. Erzak bozulmasını azaltır; kuşatmada kervanların getirdiği erzağı artırır.',
    category: 'uretim',
    size: [3, 2],
    cost: { tas: 50, kereste: 80, akce: 500 },
    workersMax: 30,
    buildDays: 8,
    phases: ['hazirlik', 'kusatma'],
    produces: { erzak: 4000 },
    icon: 'econ/icon-erzak-ambari',
  },
  {
    id: 'yag-kazani',
    name: 'Yağ Kazanı',
    desc: 'Hayvan içyağı büyük kazanlarda eritilir. Gemileri karadan yürütmek için kızakları yağlamakta kullanılır.',
    category: 'uretim',
    size: [2, 2],
    cost: { tas: 20, kereste: 30, akce: 200 },
    workersMax: 12,
    buildDays: 4,
    phases: ['hazirlik', 'kusatma'],
    consumes: { erzak: 300, kereste: 4 },
    produces: { yag: 8 },
    icon: 'econ/icon-yag-kazani',
  },
  {
    id: 'ordugah-cadirlari',
    name: 'Ordugâh Çadırları',
    desc: 'Asker ve amele için çadır obası. Barınak sağlar (her oba 400 kişilik) ve ordu moralini destekler.',
    category: 'ordugah',
    size: [2, 2],
    cost: { kereste: 20, akce: 300 },
    workersMax: 20,
    buildDays: 2,
    phases: ['hazirlik', 'kusatma'],
    icon: 'econ/icon-ordugah-cadirlari',
  },
  {
    id: 'otag',
    name: 'Otağ-ı Hümâyun',
    desc: 'Sultan II. Mehmed\'in büyük kırmızı otağı. Kuşatmada Maltepe sırtına, Topkapı\'nın karşısına kuruldu.',
    category: 'ordugah',
    size: [3, 3],
    cost: {},
    workersMax: 0,
    buildDays: 1,
    phases: [],
    unique: true,
    icon: 'econ/icon-otag',
  },
  {
    id: 'top-mevzii',
    name: 'Top Mevzii',
    desc: 'Toprak tabya ve ahşap kalkanlarla korunan top yatağı. Topçular büyük topları buraya yerleştirir. Surlara yakın olmalı.',
    category: 'askeri',
    size: [2, 2],
    cost: { tas: 40, kereste: 60 },
    workersMax: 40,
    buildDays: 1.5,
    phases: ['yuruyus', 'kusatma'],
    regions: ['trakya', 'pera', 'bogaz-avrupa'],
    icon: 'econ/icon-top-mevzii',
  },
  {
    id: 'siper',
    name: 'Siper',
    desc: 'Hendeğin önünde ahşap kalkanlar (mantelet) ve toprak set. Okçu ve tüfek atışına karşı yaklaşan birlikleri korur.',
    category: 'askeri',
    size: [2, 1],
    cost: { kereste: 25 },
    workersMax: 20,
    buildDays: 0.5,
    phases: ['kusatma'],
    regions: ['trakya'],
    icon: 'econ/icon-siper',
  },
  {
    id: 'kervansaray',
    name: 'Kervansaray',
    desc: 'Kervanların konakladığı taş han. Edirne kervanlarını sıklaştırır ve getirdikleri yükü artırır (en çok iki tanesi etkili).',
    category: 'uretim',
    size: [3, 3],
    cost: { tas: 150, kereste: 100, akce: 1200 },
    workersMax: 50,
    buildDays: 15,
    phases: ['hazirlik', 'kusatma'],
    regions: ['trakya', 'pera', 'bogaz-avrupa'],
    icon: 'econ/icon-kervansaray',
  },
  {
    id: 'edirne-dokumhane',
    name: 'Edirne Dökümhanesi',
    desc: 'Edirne\'deki top dökümhanesi. Kervanlarla gelen bakır ve kalay (maden) eritilip tunç yapılır; büyük toplar tunçtan dökülür. Haritada yer almaz; Edirne panelinden genişletilir.',
    category: 'ozel',
    size: [1, 1],
    cost: {},
    workersMax: 0,
    buildDays: 1,
    phases: [],
    unique: true,
    produces: { tunc: 6 },
    consumes: { maden: 7, akce: 20 },
    icon: 'econ/icon-dokumhane',
  },
];

export const BUILDING_BY_ID: Record<string, BuildingDef> = Object.fromEntries(BUILDINGS.map((b) => [b.id, b]));

/** Buildings that never appear on the map (virtual, Edirne panel). */
export const VIRTUAL_BUILDINGS = new Set(['edirne-dokumhane']);

// ───────────────────────────── Rumeli Hisarı ─────────────────────────────

export type HisarPartId = 'temel' | 'surlar' | 'saruca' | 'halil' | 'zaganos';
export type HisarTowerId = 'saruca' | 'halil' | 'zaganos';

export interface HisarPartDef {
  id: HisarPartId;
  name: string;
  /** Who built it (towers) — for UI/log. */
  pasha?: string;
  /** Days at nominal staffing. */
  days: number;
  /** Nominal workers. */
  workers: number;
  /** Total materials consumed over the whole part (proportional to progress). */
  cost: Cost;
}

export const HISAR_TOWERS: HisarTowerId[] = ['saruca', 'halil', 'zaganos'];

export const HISAR = {
  /** Groundbreaking may not happen before this (15 Nisan 1452). */
  startDay: TARIH.hisarBaslangic,
  historicalEnd: TARIH.hisarBitis,
  architect: 'Müslihiddin Ağa',
  parts: {
    temel: { id: 'temel', name: 'Temel', days: 26, workers: 600, cost: { tas: 1700, kereste: 300, akce: 2000 } },
    surlar: { id: 'surlar', name: 'Surlar ve burçlar', days: 112, workers: 450, cost: { tas: 3100, kereste: 450, akce: 3000 } },
    saruca: { id: 'saruca', name: 'Saruca Paşa Kulesi', pasha: 'Saruca Paşa', days: 112, workers: 150, cost: { tas: 1150, kereste: 400, akce: 1500 } },
    halil: { id: 'halil', name: 'Halil Paşa Kulesi', pasha: 'Çandarlı Halil Paşa', days: 112, workers: 150, cost: { tas: 1150, kereste: 400, akce: 1500 } },
    zaganos: { id: 'zaganos', name: 'Zağanos Paşa Kulesi', pasha: 'Zağanos Paşa', days: 112, workers: 150, cost: { tas: 1150, kereste: 400, akce: 1500 } },
  } as Record<HisarPartId, HisarPartDef>,
  /** Over-staffing cap (× nominal) and its extra efficiency (diminishing). */
  overstaffMax: 2,
  overstaffGain: 0.5,
  /** 'hisar-ihsan' (Sultan's reward to the competing pashas). */
  ihsanCost: { akce: 2000 } as Cost,
  ihsanBonus: 0.2,
  ihsanDays: 20,
  ihsanCooldown: 35,
};

/** Worker-days of each part (weights for the overall progress number). */
export function hisarPartWork(id: HisarPartId): number {
  const p = HISAR.parts[id];
  return p.days * p.workers;
}
export const HISAR_TOTAL_WORK = (['temel', 'surlar', 'saruca', 'halil', 'zaganos'] as HisarPartId[]).reduce((a, id) => a + hisarPartWork(id), 0);

// ───────────────────────────── Supply & upkeep ─────────────────────────────

export const SUPPLY = {
  /** Days between Edirne caravans (departures) per phase. */
  intervalHazirlik: 10,
  intervalKusatma: 2.5,
  /** Interval multiplier per kervansaray (max 2 count). */
  kervansarayInterval: 0.75,
  kervansarayCargo: 0.15,
  /** Caravan map speed, tiles per sim-second. */
  speedHazirlik: 1.6,
  speedKusatma: 0.42,
  /** Erzak coverage of the army's consumption brought by caravans. */
  coverageHazirlik: 1.1,
  coverageKusatma: 0.8,
  coveragePerKervansaray: 0.06,
  coveragePerAmbar: 0.04,
  coverageBogaz: 0.05,
  coverageYol: 0.05,
  /** Per-caravan cargo besides food. */
  akceHazirlik: 4600,
  akceKusatma: 1300,
  madenHazirlik: 28,
  madenKusatma: 8,
  /** Minimum erzak a food caravan brings. */
  erzakMin: 8000,
  /** Provisions the army carries from Edirne (days of consumption) — given once at siege start. */
  seferErzakiDays: 8,
  /** Erzak spoilage per day (fraction of stock) — reduced by ambars. */
  spoilage: 0.004,
  spoilageAmbar: 0.0012,
};

export const UPKEEP = {
  /** Erzak per worker per day. */
  workerErzak: 1,
  /** Fallback erzak per soldier per day (army UNIT_TYPES.upkeep overrides). */
  soldierErzak: 1,
  /** Akçe per worker per day (wages). */
  workerAkce: 0.25,
  /** Akçe per kapıkulu soldier per day (ulufe) — salaried troops only. */
  kapikuluAkce: 0.04,
  /** Akçe per other soldier per day. */
  otherAkce: 0.004,
};

export const KAPIKULU = new Set(['yeniceri', 'topcu', 'mehter', 'lagimci']);

/** Housing: base capacity (villages, Edirne) + per tent field. */
export const HOUSING = { base: 1400, perTents: 400, overcrowdedRate: 0.75 };

/** Prices used by Edirne purchase actions. */
export const PRICES = {
  /** Akçe per person-day of erzak. */
  erzak: 0.008,
  maden: 40,
};

// ───────────────────────────── Edirne actions ─────────────────────────────

export type EdirneActionId =
  | 'yol-hazirla'
  | 'yol-durdur'
  | 'amele-topla'
  | 'dokumhane-genislet'
  | 'vergi'
  | 'erzak-satin-al'
  | 'maden-satin-al'
  | 'hisar-oncelik'
  | 'hisar-ihsan'
  | 'otomatik-isci';

export interface EdirneActionDef {
  id: EdirneActionId;
  name: string;
  desc: string;
  /** Static part of the cost (dynamic costs are computed by the API). */
  cost?: Cost;
  /** Shown in the Edirne panel (false = contextual, e.g. hisar priority from the building card). */
  panel: boolean;
}

export const EDIRNE_ACTIONS: EdirneActionDef[] = [
  {
    id: 'yol-hazirla',
    name: 'Edirne yolunu hazırla',
    desc: 'Amele yolları düzler, dereler üzerine köprüler kurar. Büyük topun öküzlerle taşınmasını hızlandırır. 250 amele yola gönderilir.',
    cost: { akce: 2500, kereste: 150 },
    panel: true,
  },
  { id: 'yol-durdur', name: 'Yol çalışmasını durdur', desc: 'Yoldaki amele geri çağrılır.', panel: false },
  {
    id: 'amele-topla',
    name: 'Amele topla',
    desc: 'Rumeli ve Anadolu\'dan 250 amele ve usta çağrılır. Bir kervanla gelirler.',
    cost: { akce: 2200 },
    panel: true,
  },
  {
    id: 'dokumhane-genislet',
    name: 'Dökümhaneyi genişlet',
    desc: 'Edirne dökümhanesine yeni ocaklar eklenir; tunç üretimi artar (en çok 3. kademe).',
    cost: { akce: 3500, tas: 120, kereste: 120 },
    panel: true,
  },
  {
    id: 'vergi',
    name: 'Olağanüstü vergi (avarız)',
    desc: 'Hazineye hemen akçe girer; ama halk ve asker hoşnutsuzlanır (moral düşer, Divan\'da barış yanlıları güçlenir).',
    panel: true,
  },
  {
    id: 'erzak-satin-al',
    name: 'Erzak satın al',
    desc: 'Trakya ve Anadolu pazarlarından ordunun 8 günlük erzağı alınır; bir kervanla gelir.',
    panel: true,
  },
  {
    id: 'maden-satin-al',
    name: 'Bakır ve kalay satın al',
    desc: 'Tunç dökümü için 60 yük maden alınır; bir kervanla gelir.',
    cost: { akce: 60 * PRICES.maden },
    panel: true,
  },
  {
    id: 'hisar-oncelik',
    name: 'Kuleye öncelik ver',
    desc: 'Seçilen paşanın kulesine daha çok amele verilir.',
    panel: false,
  },
  {
    id: 'hisar-ihsan',
    name: 'Paşalara ihsan vaat et',
    desc: 'Sultan, kulesini önce bitiren paşaya ihsan vaat eder. Kuleler 20 gün boyunca %20 daha hızlı yükselir.',
    cost: HISAR.ihsanCost,
    panel: false,
  },
  { id: 'otomatik-isci', name: 'Ameleyi otomatik dağıt', desc: 'Elle yapılan bütün amele atamaları kaldırılır.', panel: false },
];

export const EDIRNE_ACTION_BY_ID: Record<string, EdirneActionDef> = Object.fromEntries(EDIRNE_ACTIONS.map((a) => [a.id, a]));

export const ROAD_PROJECT = { workers: 250, days: 45 };
export const AMELE_BATCH = 250;
export const VERGI = { akce: 7000, morale: -5, divan: -6, cooldownHazirlik: 60, cooldownKusatma: 12 };
export const DOKUMHANE_MAX_LEVEL = 3;

/** Caravan kinds — affects cargo and visuals. */
export type CaravanKind = 'erzak' | 'maden' | 'hazine' | 'amele' | 'karma';

export const CARAVAN_ADI: Record<CaravanKind, string> = {
  erzak: 'erzak kervanı',
  maden: 'maden kervanı',
  hazine: 'hazine kervanı',
  amele: 'amele kafilesi',
  karma: 'Edirne kervanı',
};

/** Rotation of regular caravans. */
export const CARAVAN_ROTATION: CaravanKind[] = ['erzak', 'hazine', 'erzak', 'maden', 'karma'];

/** Resources shown with a floating "+N" when produced (and the chunk size). */
export const FLOAT_CHUNK: Partial<Record<ResourceId, number>> = {
  tas: 10,
  kereste: 10,
  gulle: 5,
  barut: 5,
  erzak: 1000,
  yag: 4,
  tunc: 5,
};

/** Siege-camp layout (landmark-relative), used when the siege begins. */
export const CAMP = {
  /** Tent fields per wing: [landmark, count, spread(tiles)]. */
  wings: [
    { id: 'merkez', name: 'Sultan\'ın merkez ordugâhı', landmark: 'otag', fields: 6, spread: 6 },
    { id: 'karaca', name: 'Karaca Paşa (Rumeli askerleri)', landmark: 'karacaKarargah', fields: 5, spread: 6 },
    { id: 'ishak', name: 'İshak Paşa (Anadolu askerleri)', landmark: 'ishakKarargah', fields: 5, spread: 6 },
    { id: 'zaganos', name: 'Zağanos Paşa (Galata sırtları)', landmark: 'zaganosKarargah', fields: 4, spread: 5 },
  ] as const,
};

/** Historical end-of-construction label for the log. */
export const HISAR_TARIHI_BITIS = d(31, 8, 1452);
