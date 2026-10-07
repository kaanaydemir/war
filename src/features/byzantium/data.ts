import { d } from '../../core/calendar';
import type { Difficulty, SectionId } from '../../core/state';

/**
 * BYZANTIUM — static data & tuning (pure, no Phaser).
 *
 * Numbers follow the generally accepted reconstruction (Sphrantzes' muster ≈ 4,773 Greeks
 * + ≈ 2,000 foreigners ≈ 7,000 fighting men). Ottoman sources are primary for events;
 * Byzantine/Italian sources are used only to check the city's internal situation.
 */

export const FEATURE_ID = 'byzantium';

/** Fighting men at the start of the siege (Sphrantzes' count, rounded). */
export const TOTAL_DEFENDERS = 7000;

/** Civilians, monks, women and old men working on the walls at night. */
export const REPAIR_CREWS = 2200;

/** Days of food in the city when the siege begins (before blockade effects). */
export const START_FOOD = 110;

// ───────────────────────────── commanders & posts ─────────────────────────────

export interface Post {
  sectionId: SectionId;
  /** Commander name (Turkish display). */
  commander: string;
  /** Troop quality multiplier for section defense. */
  quality: number;
  /** Extra multiplier while the commander is in place. */
  leader: number;
  note: string;
  dogrulanacak?: boolean;
}

/** Historical posts (the Byzantine/Italian sources only as a check; see TASARIM §4). */
export const POSTS: Post[] = [
  { sectionId: 'kara-lykos', commander: 'XI. Konstantinos ve Giovanni Giustiniani Longo', quality: 1.25, leader: 1.3, note: 'İmparator ve Cenevizli Giustiniani’nin 700 zırhlı askeri Mesoteikhion’da.' },
  { sectionId: 'kara-topkapi', commander: 'Giustiniani’nin Cenevizlileri', quality: 1.2, leader: 1.25, note: 'Topkapı (St. Romanus) kapısı; büyük topun karşısı.' },
  { sectionId: 'kara-blahernai', commander: 'Venedik balyosu Girolamo Minotto', quality: 1.12, leader: 1.1, note: 'Venedikliler Blahernai sarayı çevresini tuttu.' },
  { sectionId: 'kara-egrikapi', commander: 'Bocchiardi kardeşler', quality: 1.08, leader: 1.05, note: 'Cenevizli Bocchiardi kardeşler Eğrikapı çevresinde (doğrulanacak).', dogrulanacak: true },
  { sectionId: 'kara-edirnekapi', commander: 'Theodoros Karystenos', quality: 1.0, leader: 1.0, note: 'Edirnekapı (Kharisios) kapısı.', dogrulanacak: true },
  { sectionId: 'kara-yedikule', commander: 'Philippides', quality: 1.0, leader: 1.0, note: 'Altınkapı ve Marmara ucu.', dogrulanacak: true },
  { sectionId: 'halic-fener', commander: 'Loukas Notaras', quality: 1.0, leader: 1.08, note: 'Megadük Notaras Haliç surlarında; yedek kuvvet onun elinde.' },
  { sectionId: 'marmara-yenikapi', commander: 'Şehzade Orhan Çelebi', quality: 1.0, leader: 1.05, note: 'Osmanlı şehzadesi Orhan ve adamları Marmara surlarında (doğrulanacak).', dogrulanacak: true },
];

export const POST_BY_SECTION: Record<string, Post> = Object.fromEntries(POSTS.map((p) => [p.sectionId, p]));

/** Where Giustiniani and the Emperor fight (strong until Giustiniani is wounded). */
export const GIUSTINIANI_SECTIONS: SectionId[] = ['kara-lykos', 'kara-topkapi'];

/** Default troop quality by wall kind (sea walls: monks, sailors, townsmen). */
export const KIND_QUALITY = { kara: 1.0, halic: 0.92, marmara: 0.85 } as const;

/** Johannes Grant, the Scottish/German engineer who led the counter-mines. */
export const GRANT = { base: 0.6, moraleBonus: 0.15, min: 0.55, max: 0.8 } as const;

// ───────────────────────────── relief (Haçlı yardımı) ─────────────────────────────

/** Historical siege start, 6 Nisan 1453 (Gün 1). */
export const HIST_SIEGE_START = d(6, 4, 1453);

/**
 * Hidden relief arrival window per difficulty (absolute days, derived from the historical start).
 * Normal: earliest ≈ 60 days after 6 Nisan (≈ 5 Haziran).
 */
export const RELIEF_WINDOW: Record<Difficulty, { earliest: number; latest: number }> = {
  kolay: { earliest: HIST_SIEGE_START + 70, latest: HIST_SIEGE_START + 92 },
  normal: { earliest: HIST_SIEGE_START + 60, latest: HIST_SIEGE_START + 80 },
  zor: { earliest: HIST_SIEGE_START + 52, latest: HIST_SIEGE_START + 68 },
};

/** Static diplomatic/strategic relief modifiers (days, + = later). */
export const RELIEF_MODS = {
  macarAteskes: { days: 6, note: 'Macaristan ile ateşkes: Hunyadi harekete geçmiyor' },
  venedikAntlasma: { days: 5, note: 'Venedik ile antlaşma: Senato yardımı ağırdan alıyor' },
  moraSeferi: { days: 5, note: 'Turahan Bey Mora’da: despotlar yardım gönderemiyor' },
  rizzoBatir: { days: -6, note: 'Rizzo’nun gemisi batırıldı: Venedik öfkeli, filo hızlandı' },
  hisarErken: { days: 3, note: 'Boğazkesen erken bitti: Karadeniz yolu kapalı' },
  denizDurduruldu: { days: 2, note: '20 Nisan’da yardım gemileri durduruldu: Batı’da cesaret kırıldı' },
  denizYarildi: { days: -2, note: '20 Nisan’da gemiler ablukayı yardı: Batı’da umut doğdu' },
  /** Max days added by a strong Ottoman fleet/blockade. */
  donanmaMax: 5,
  donanmaNote: 'Osmanlı donanması denizi tutuyor',
} as const;

/** Rumeli Hisarı counts as "early" when completed before this day (1 Eylül 1452). */
export const HISAR_EARLY_BEFORE = d(1, 9, 1452);

/** Player estimate window width (days) at intel 0 and 100. */
export const RELIEF_SPREAD = { at0: 32, at100: 4 } as const;

// ───────────────────────────── repairs ─────────────────────────────

export const REPAIR = {
  /** Wall HP of effort per crew member per full night. */
  perCrew: 0.105,
  /** Soldiers of the section also work (per man per night). */
  perSoldier: 0.045,
  /** Largest share of the city's crews one section can absorb. */
  maxShare: 0.7,
  /** Repairs are applied in batches (days) to keep events cheap. */
  batchDays: 0.012,
  /** Exhaustion gained per night at full use / recovered per day. */
  exhaustGain: 0.034,
  exhaustRecover: 0.016,
  exhaustMax: 0.45,
} as const;

export const DIFFICULTY_REPAIR: Record<Difficulty, number> = { kolay: 0.8, normal: 1.0, zor: 1.22 };

// ───────────────────────────── defender AI ─────────────────────────────

export const AI = {
  /** How often the AI re-evaluates (days). */
  stepDays: 0.02,
  /** Men moved between sections per day at most. */
  movePerDay: 650,
  /** After the ships reach the Golden Horn the city scrambles (multiplier, days). */
  surgeMul: 2.6,
  surgeDays: 1.5,
  /** Minimum garrison as a share of the historical post. */
  floorShare: 0.45,
  /** Share of all men kept in reserve when calm. */
  reserveShare: 0.06,
  /** Radius (tiles) for Ottoman troops near a section. */
  nearRadius: 8,
} as const;

// ───────────────────────────── Divan / politics ─────────────────────────────

export const DIVAN = {
  /** Sustained days with all defeat conditions true before the siege is lifted. */
  crisisDays: 1.0,
  moraleMax: 15,
  erzakDaysMax: 3,
  divanMax: -40,
} as const;

// ───────────────────────────── historical morale events ─────────────────────────────

export interface HistMoraleEvent {
  id: string;
  /** Matching event card in features/events — if that card exists it applies the morale itself. */
  eventId: string;
  /** Earliest absolute day (date-based events). */
  day?: number;
  byzMorale: number;
  log: string;
  logKind: 'olay' | 'casus' | 'bilgi' | 'basari' | 'uyari' | 'kayip';
}

export const HIST_EVENTS: HistMoraleEvent[] = [
  { id: 'deniz-yarildi', eventId: 'k5-deniz-savasi', byzMorale: 8, log: 'Ceneviz gemileri ablukayı yardı; surlarda çanlar çalıyor.', logKind: 'kayip' },
  { id: 'deniz-durduruldu', eventId: 'k5-deniz-savasi', byzMorale: -8, log: 'Yardım gemileri Haliç’e giremedi; surlarda umutsuzluk var.', logKind: 'basari' },
  { id: 'gemiler-karadan', eventId: 'k7-gemiler-karadan', byzMorale: -10, log: 'Gemilerimizi Haliç’te gören Rumlar dehşete düştü.', logKind: 'basari' },
  { id: 'ay-tutulmasi', eventId: 'k14-ay-tutulmasi', day: d(22, 5, 1453) + 0.64, byzMorale: -12, log: 'Ay tutuldu. Kaçaklar, şehirde bunun kıyametin alameti sayıldığını anlatıyor.', logKind: 'casus' },
  { id: 'gemi-dondu', eventId: 'k15-esirler', day: d(23, 5, 1453) + 0.25, byzMorale: -6, log: 'Yardım filosunu aramaya çıkan Venedik gemisi eli boş döndü (doğrulanacak).', logKind: 'casus' },
  { id: 'isaretler', eventId: 'k16-isaretler', day: d(24, 5, 1453) + 0.45, byzMorale: -8, log: 'İkona alayında Hodegetria ikonası yere düştü; ardından dolu ve yoğun sis geldi. Şehirde kötü alametler konuşuluyor.', logKind: 'casus' },
];

// ───────────────────────────── intel texts ─────────────────────────────

/** Deserter / spy lines. `{n}` = estimated defenders, `{s}` = section name. */
export const INTEL_LINES = {
  kacakSayi: [
    'Bir kaçak: surlarda yalnızca birkaç bin asker var; sayıları ≈{n} kadar.',
    'Surlardan sarkıtılan iple kaçan bir Rum, savunucuların ≈{n} kişi olduğunu söylüyor.',
    'Bir kaçak: İmparator her mahalleden adam toplatmış; yine de ≈{n} savaşçıyı geçmiyorlar.',
  ],
  kacakKesim: [
    'Bir kaçak: yedekler geceleyin {s} kesimine kaydırılıyor.',
    'Bir kaçak: en çok asker şimdi {s} kesiminde bekliyor.',
  ],
  kacakAclik: [
    'Bir kaçak: şehirde ekmek ölçüyle dağıtılıyor; askerler ailelerini doyurmak için surları bırakıyor.',
    'Bir kaçak: ambarlar azalıyor, fakir halk kilise kapılarında yiyecek bekliyor.',
  ],
  kacakMoral: [
    'Bir kaçak: Venedikliler ile Cenevizliler arasında yine kavga çıkmış.',
    'Bir kaçak: halk kiliselerde dua ediyor; birliğe karşı olanlar Notaras’ın çevresinde toplanıyor.',
    'Bir kaçak: Giustiniani her gece Lykos’taki barikatın başında; askerler ona güveniyor.',
  ],
  casusOnarim: [
    'Galata’dan haber: Rumlar geceleri kadın ve keşişlerle surları onarıyor; toprak dolu fıçılar diziyorlar.',
    'Casus haberi: gedikler kazık, çalı ve toprak çuvallarıyla kapatılıyor.',
  ],
  casusGrant: ['Casus haberi: Johannes Grant adlı bir Alman usta karşı lağımları yönetiyor; tüneller dinleniyor.'],
  casusYardim: [
    'Galata’dan haber: Venedik’te bir yardım filosu hazırlanıyor, ama henüz Ege’ye çıkmamış.',
    'Sakızlı bir tüccar: Papa’nın gemileri için para toplanıyor; filo ağır ilerliyor.',
    'Casus haberi: Haçlı donanmasının Eğriboz’da toplandığı söyleniyor.',
  ],
} as const;

export const GALATA_LINES = {
  ticaret: [
    'Galata tüccarları ordugâha yağ ve erzak sattı; ilişkiler ısınıyor.',
    'Galata podestası Sultan’a dostluk haberi gönderdi.',
  ],
  olay: [
    'Galata’dan şehre gece gizlice asker geçtiği söyleniyor; Cenevizlilere güven azaldı.',
    'Bir Ceneviz gemisi Osmanlı güllesiyle hasar gördü; Galata huzursuz.',
    'Galatalılar gündüz ordugâhla ticaret yapıp gece şehre yardım taşıyor.',
  ],
} as const;
