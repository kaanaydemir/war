import type { CommanderDef, UnitTypeDef } from '../../core/defs';
import type { UnitTypeId } from '../../core/state';

/**
 * ARMY DATA (pure). Unit types, commanders, order of battle and balance.
 *
 * Numbers are deliberately compressed (see TASARIM "Gerçekçilik ilkesi"): one
 * group stands for a real contingent (500–3 000 men). Ottoman sources are the
 * primary reference; uncertain details are marked "(doğrulanacak)".
 */

export const UNIT_TYPES: Record<UnitTypeId, UnitTypeDef> = {
  yeniceri: {
    id: 'yeniceri',
    name: 'Yeniçeri',
    plural: 'Yeniçeriler',
    desc:
      'Kapıkulu piyadesi, padişahın ücretli ve disiplinli askeri. Ak börkleri ve önündeki pirinç kaşıklıkla tanınırlar; ' +
      'yay, kılıç ve teberle savaşırlar. Son hücumun üçüncü ve belirleyici dalgasıdır. Sayıları azdır ve kayıpları yerine konamaz.',
    menPerGroup: 1000,
    attack: 1.45,
    defense: 1.3,
    siege: 1.3,
    speed: 0.55,
    discipline: 0.95,
    upkeep: 1,
    cost: { akce: 6000, erzak: 1500 },
    icon: 'army/ikon-yeniceri',
  },
  azap: {
    id: 'azap',
    name: 'Azap',
    plural: 'Azaplar',
    desc:
      'Hafif piyade ve okçu. Ucuz ve çok yönlüdür: hendek doldurur, bombardımanı ok yağmuruyla korur, gerekirse merdivene sarılır. ' +
      'Surdaki okçulara ve arbaletçilere karşı savunmasızdır.',
    menPerGroup: 2000,
    attack: 0.85,
    defense: 0.8,
    siege: 0.85,
    speed: 0.6,
    discipline: 0.5,
    upkeep: 0.9,
    cost: { akce: 2400, erzak: 2000 },
    icon: 'army/ikon-azap',
  },
  sipahi: {
    id: 'sipahi',
    name: 'Tımarlı Sipahi',
    plural: 'Tımarlı Sipahiler',
    desc:
      'Tımar karşılığı sefere çıkan atlı asker; sarık, zırh gömlek ve yuvarlak kalkan taşır. Rumeli ve Anadolu sancaklarından gelir. ' +
      'Çevre güvenliği ve ikmal korumasında hızlıdır; sur hücumunda attan inip savaşır, orada orta güçtedir.',
    menPerGroup: 2400,
    attack: 1.1,
    defense: 1.0,
    siege: 0.8,
    speed: 1.1,
    discipline: 0.7,
    upkeep: 1.3,
    cost: { akce: 1800, erzak: 3000 },
    icon: 'army/ikon-sipahi',
  },
  basibozuk: {
    id: 'basibozuk',
    name: 'Başıbozuk',
    plural: 'Başıbozuklar',
    desc:
      'Ganimet umuduyla orduya katılan gönüllüler. Sayıları çoktur, donanımları ve kılıkları karışıktır; sopadan tırpana ne bulurlarsa onunla savaşırlar. ' +
      'Son hücumun ilk dalgasıdır. Disiplinleri düşüktür, çabuk dağılırlar.',
    menPerGroup: 3000,
    attack: 0.7,
    defense: 0.5,
    siege: 0.8,
    speed: 0.55,
    discipline: 0.2,
    upkeep: 0.8,
    cost: { akce: 900, erzak: 1500 },
    icon: 'army/ikon-basibozuk',
  },
  akinci: {
    id: 'akinci',
    name: 'Akıncı',
    plural: 'Akıncılar',
    desc:
      'Uç beylerine bağlı hafif atlılar. Keşif, baskın ve uzak seferler için idealdir (Trakya kasabaları, Mora). ' +
      'Surlara karşı neredeyse işe yaramazlar.',
    menPerGroup: 2000,
    attack: 0.9,
    defense: 0.6,
    siege: 0.25,
    speed: 1.5,
    discipline: 0.45,
    upkeep: 1.2,
    cost: { akce: 1200, erzak: 2000 },
    icon: 'army/ikon-akinci',
  },
  topcu: {
    id: 'topcu',
    name: 'Topçu',
    plural: 'Topçular',
    desc:
      'Topları kuran, dolduran ve ateşleyen ustalar ile yardımcıları. Surları yıkabilen tek güç onların elindedir; ' +
      'mevzi değiştirmeleri yavaştır, göğüs göğüse çarpışmada zayıftırlar.',
    menPerGroup: 400,
    attack: 0.5,
    defense: 0.6,
    siege: 0.3,
    speed: 0.45,
    discipline: 0.8,
    upkeep: 1,
    cost: { akce: 3000, erzak: 400 },
    icon: 'army/ikon-topcu',
  },
  lagimci: {
    id: 'lagimci',
    name: 'Lağımcı',
    plural: 'Lağımcılar',
    desc:
      'Madenlerde yetişmiş kazıcılar; Novaberde (Novo Brdo) gümüş madenlerinden gelenler en ünlüleridir (doğrulanacak). ' +
      'Kazma ve kürekle sur altına tünel açarlar. Karşı lağımla yok edilebilirler.',
    menPerGroup: 300,
    attack: 0.4,
    defense: 0.5,
    siege: 0.4,
    speed: 0.5,
    discipline: 0.7,
    upkeep: 1,
    cost: { akce: 2600, kereste: 40 },
    icon: 'army/ikon-lagimci',
  },
  mehter: {
    id: 'mehter',
    name: 'Mehter',
    plural: 'Mehterhâne',
    desc:
      'Kös, davul, nakkare, zurna ve zillerden oluşan askerî bando. Yürüyüşte ve hücumda çalar; ' +
      'yakındaki birliklerin moralini yükseltir, surların ardındakilerin yüreğine korku salar. Savaşmaz.',
    menPerGroup: 150,
    attack: 0.2,
    defense: 0.4,
    siege: 0,
    speed: 0.5,
    discipline: 0.9,
    upkeep: 1,
    cost: { akce: 1500, erzak: 200 },
    icon: 'army/ikon-mehter',
  },
};

export const UNIT_ORDER: UnitTypeId[] = ['yeniceri', 'sipahi', 'azap', 'basibozuk', 'akinci', 'topcu', 'lagimci', 'mehter'];

export const COMMANDERS: CommanderDef[] = [
  {
    id: 'fatih',
    name: 'II. Mehmed',
    title: 'Padişah (Fatih), 21 yaşında',
    desc:
      'Osmanlı padişahı; 30 Mart 1432’de doğdu, kuşatmada 21 yaşındaydı. Otağını Topkapı karşısında, Maltepe sırtına kurdu ve ' +
      'Lykos vadisine bakan merkezi bizzat yönetti. Son hücumda yeniçerileri hendeğe kadar kendisi sürdü.',
    party: 'savas',
    bonusText: 'Ordugâhı dolaşınca moral artar. Son hücumu yalnızca o ilan eder; yanındaki birlikler +%15 hücum.',
    portrait: 'army/portre-fatih',
  },
  {
    id: 'halil',
    name: 'Çandarlı Halil Paşa',
    title: 'Sadrazam (vezîriâzam)',
    desc:
      'Murad II döneminden kalma güçlü sadrazam; Çandarlı ailesinden. Kuşatmanın uzamasından ve Avrupa’nın yardımından çekindi, ' +
      'haraçla yetinip barış yapılmasını savundu. Fetihten kısa süre sonra azledildi ve idam edildi.',
    party: 'baris',
    bonusText: 'Akçe ve diplomasi bonusu; Divan dengesini barışa çeker.',
    portrait: 'army/portre-halil',
  },
  {
    id: 'zaganos',
    name: 'Zağanos Paşa',
    title: 'Vezir; Galata sırtları ve Haliç kuzeyi',
    desc:
      'Fatih’in lalası ve en güvendiği vezirlerden; savaş yanlısı kanadın önderi. Haliç’in kuzeyinde, Galata’yı gözeten sırtlarda konuşlandı; ' +
      'lağımlar, Haliç üzerine kurulan fıçı köprüsü ve gemilerin karadan yürütülmesinde rol aldı.',
    party: 'savas',
    bonusText: 'Lağım kazma, Haliç köprüsü ve gemilerin karadan yürütülmesinde hız.',
    portrait: 'army/portre-zaganos',
  },
  {
    id: 'saruca',
    name: 'Saruca Paşa',
    title: 'Paşa; merkez (doğrulanacak)',
    desc:
      'Rumeli Hisarı’nın üç büyük kulesinden birini yaptıran paşalardan. Kuşatmada merkezde, padişahın yanında görev aldığı kabul edilir (doğrulanacak).',
    bonusText: 'Merkezdeki kapıkulu süvarileri +moral.',
    portrait: 'army/portre-saruca',
  },
  {
    id: 'karaca',
    name: 'Karaca Paşa',
    title: 'Rumeli beylerbeyi; sol kanat',
    desc:
      'Rumeli beylerbeyi. Rumeli askerleriyle sol kanatta, Haliç’ten Blahernai surlarına ve Eğrikapı’ya kadar uzanan kesimde konuşlandı. ' +
      'Kış aylarında Trakya’daki Bizans kasabalarına yürüyen birlikler de Rumeli askerleriydi.',
    bonusText: 'Rumeli sipahileri +moral; Blahernai–Eğrikapı hücumlarında +%10.',
    portrait: 'army/portre-karaca',
  },
  {
    id: 'ishak',
    name: 'İshak Paşa',
    title: 'Anadolu beylerbeyi; sağ kanat',
    desc:
      'Anadolu beylerbeyi. Anadolu askerleriyle sağ kanatta, Topkapı’dan Marmara kıyısına kadar konuşlandı. ' +
      'Son hücumun ikinci dalgasını onun Anadolu askerleri oluşturdu.',
    bonusText: 'Anadolu askerleri +%10 hücum; son hücumun ikinci dalgası.',
    portrait: 'army/portre-ishak',
  },
  {
    id: 'mahmud',
    name: 'Mahmud Paşa',
    title: 'Bey; sağ kanatta İshak Paşa’nın yanında (doğrulanacak)',
    desc:
      'Bizans soylusu Angelos ailesinden gelen, sarayda yetişmiş komutan. Kuşatmada sağ kanatta görev aldığı rivayet edilir (doğrulanacak). ' +
      '1456’da sadrazam oldu.',
    bonusText: 'Komuta ettiği birlik +%5 hücum, +disiplin.',
    portrait: 'army/portre-mahmud',
  },
  {
    id: 'baltaoglu',
    name: 'Baltaoğlu Süleyman Bey',
    title: 'Donanma komutanı (Gelibolu sancakbeyi)',
    desc:
      'Kuşatmada Osmanlı donanmasının komutanı. 20 Nisan’da üç Ceneviz gemisi ile bir Bizans gemisinin ablukayı yarmasını önleyemedi; ' +
      'görevden alındı, yerine Hamza Bey getirildi.',
    bonusText: '20 Nisan’a kadar donanmayı yönetir.',
    portrait: 'army/portre-baltaoglu',
  },
  {
    id: 'hamza',
    name: 'Hamza Bey',
    title: 'Donanma komutanı (20 Nisan’dan sonra)',
    desc: '20 Nisan deniz çatışmasından sonra Baltaoğlu’nun yerine donanmanın başına geçti.',
    bonusText: 'Haliç’teki gemilerin savunması.',
    portrait: 'army/portre-hamza',
  },
  {
    id: 'turahan',
    name: 'Turahan Bey',
    title: 'Teselya uç beyi; Mora seferi',
    desc:
      '1452 sonbaharında oğullarıyla birlikte Mora’ya akın etti; böylece despotlar Thomas ve Demetrios ağabeyleri Konstantinos’a yardım gönderemedi. ' +
      'Seferdeki askerler kuşatmada bulunamaz.',
    bonusText: 'Mora seferi: Mora’dan yardım gelmez, ama akıncıların bir kısmı uzakta kalır.',
    portrait: 'army/portre-turahan',
  },
  {
    id: 'aksemseddin',
    name: 'Akşemseddin',
    title: 'Şeyh; manevi önder',
    desc:
      'Fatih’in hocalarından, Bayramî şeyhi. Kuşatma sırasında padişaha yazdığı mektup günümüze ulaşmıştır. ' +
      'Ebû Eyyûb el-Ensârî’nin kabrini bulduğu rivayet edilir.',
    bonusText: 'Moral olaylarında rol alır; dinlenen birliklerin morali daha çabuk toparlanır.',
    portrait: 'army/portre-aksemseddin',
  },
  {
    id: 'ulubatli',
    name: 'Ulubatlı Hasan',
    title: 'Yeniçeri',
    desc:
      'Ulubat’lı (Lopadion) iri yarı bir yeniçeri. Kritovoulos’a göre otuz kadar yoldaşıyla surun üstüne ilk çıkanlardandı ve orada düştü; ' +
      'sancağı burca diktiği Türk geleneğinde yaygın anlatıdır.',
    bonusText: 'Son hücumda sancağı burca diker.',
    portrait: 'army/portre-ulubatli',
  },
];

export const COMMANDER_BY_ID: Record<string, CommanderDef> = Object.fromEntries(COMMANDERS.map((c) => [c.id, c]));

// ───────────────────────────── Wings & order of battle ─────────────────────────────

/** Camp wings (historical positions, see data/landmarks). */
export type WingId = 'merkez' | 'karaca' | 'ishak' | 'zaganos' | 'akinci' | 'hisar';

export const WING_ADI: Record<WingId, string> = {
  merkez: 'Merkez (Padişah, Lykos–Topkapı)',
  karaca: 'Sol kanat (Karaca Paşa, Haliç–Blahernai)',
  ishak: 'Sağ kanat (İshak Paşa, Topkapı–Marmara)',
  zaganos: 'Zağanos Paşa (Galata sırtları)',
  akinci: 'Akıncılar (artçı ve keşif)',
  hisar: 'Rumeli Hisarı',
};

/** Wall sections each land wing faces (camp slots are laid out in front of them). */
export const WING_SECTIONS: Partial<Record<WingId, string[]>> = {
  merkez: ['kara-lykos', 'kara-topkapi'],
  karaca: ['kara-blahernai', 'kara-egrikapi', 'kara-edirnekapi'],
  ishak: ['kara-mevlevihane', 'kara-silivrikapi', 'kara-belgradkapi'],
};

export type BannerColor = 'kirmizi' | 'beyaz' | 'yesil' | 'sultan';

export interface PlannedGroup {
  type: UnitTypeId;
  name: string;
  men: number;
  wing: WingId;
  commanderId?: string | null;
  banner?: BannerColor;
  /** Hero aboard (Ulubatlı Hasan's orta). */
  hero?: 'hasan';
  /** March order: lower enters the map earlier. */
  march: number;
}

/** The army gathering at Edirne for the 1453 campaign (new game: 'uzakta'). */
export const ARMY_PLAN: PlannedGroup[] = [
  // Zağanos goes first: the longest road, round the head of the Golden Horn.
  { type: 'sipahi', name: 'Zağanos Paşa Askerleri', men: 2400, wing: 'zaganos', commanderId: 'zaganos', banner: 'yesil', march: 0 },
  { type: 'azap', name: 'Azaplar IV', men: 2000, wing: 'zaganos', banner: 'kirmizi', march: 0.4 },
  // Left wing — Rumeli
  { type: 'sipahi', name: 'Rumeli Sipahileri I', men: 2400, wing: 'karaca', commanderId: 'karaca', banner: 'kirmizi', march: 1 },
  { type: 'sipahi', name: 'Rumeli Sipahileri II', men: 2400, wing: 'karaca', banner: 'kirmizi', march: 1.3 },
  { type: 'sipahi', name: 'Rumeli Sipahileri III', men: 2400, wing: 'karaca', banner: 'beyaz', march: 1.6 },
  { type: 'sipahi', name: 'Rumeli Sipahileri IV', men: 2400, wing: 'karaca', banner: 'kirmizi', march: 1.9 },
  { type: 'azap', name: 'Azaplar I', men: 2000, wing: 'karaca', banner: 'kirmizi', march: 2.2 },
  { type: 'azap', name: 'Azaplar II', men: 2000, wing: 'karaca', banner: 'yesil', march: 2.5 },
  // Akıncılar (rear guard and scouts)
  { type: 'akinci', name: 'Akıncılar I', men: 2000, wing: 'akinci', banner: 'kirmizi', march: 0.2 },
  { type: 'akinci', name: 'Akıncılar II', men: 2000, wing: 'akinci', banner: 'beyaz', march: 0.6 },
  // Right wing — Anadolu (crossed at Gelibolu, joins the march)
  { type: 'sipahi', name: 'Anadolu Sipahileri I', men: 2400, wing: 'ishak', commanderId: 'ishak', banner: 'yesil', march: 3 },
  { type: 'sipahi', name: 'Anadolu Sipahileri II', men: 2400, wing: 'ishak', commanderId: 'mahmud', banner: 'yesil', march: 3.3 },
  { type: 'sipahi', name: 'Anadolu Sipahileri III', men: 2400, wing: 'ishak', banner: 'beyaz', march: 3.6 },
  { type: 'azap', name: 'Azaplar III', men: 2000, wing: 'ishak', banner: 'kirmizi', march: 3.9 },
  // Volunteers
  { type: 'basibozuk', name: 'Başıbozuk Gönüllüler I', men: 3000, wing: 'merkez', banner: 'yesil', march: 4.2 },
  // Centre — the Sultan and the kapıkulu
  { type: 'lagimci', name: 'Novaberdolu Lağımcılar', men: 300, wing: 'merkez', banner: 'beyaz', march: 4.6 },
  { type: 'topcu', name: 'Topçular I', men: 400, wing: 'merkez', banner: 'kirmizi', march: 4.8 },
  { type: 'topcu', name: 'Topçular II', men: 400, wing: 'merkez', banner: 'kirmizi', march: 5 },
  { type: 'sipahi', name: 'Kapıkulu Süvarileri', men: 2000, wing: 'merkez', commanderId: 'saruca', banner: 'kirmizi', march: 5.3 },
  { type: 'yeniceri', name: 'Yeniçeri Ortası I', men: 1000, wing: 'merkez', banner: 'beyaz', march: 5.6 },
  { type: 'yeniceri', name: 'Yeniçeri Ortası II', men: 1000, wing: 'merkez', banner: 'kirmizi', march: 5.8 },
  { type: 'yeniceri', name: 'Yeniçeri Ortası III', men: 1000, wing: 'merkez', banner: 'beyaz', hero: 'hasan', march: 6 },
  { type: 'yeniceri', name: 'Yeniçeri Ortası IV', men: 1000, wing: 'merkez', banner: 'kirmizi', march: 6.2 },
  { type: 'mehter', name: 'Mehterhâne-i Hümâyun', men: 150, wing: 'merkez', banner: 'kirmizi', march: 6.4 },
  { type: 'yeniceri', name: 'Hassa Yeniçerileri', men: 1000, wing: 'merkez', commanderId: 'fatih', banner: 'sultan', march: 6.6 },
];

/** Forces at the Rumeli Hisarı building site in 1452 (new game, on the map). */
export const HISAR_GUARD: PlannedGroup[] = [
  { type: 'yeniceri', name: 'Hisar Muhafızları', men: 400, wing: 'hisar', banner: 'beyaz', march: 0 },
  { type: 'azap', name: 'Hisar Azapları', men: 600, wing: 'hisar', banner: 'kirmizi', march: 0 },
  { type: 'sipahi', name: 'İşçi Muhafızları', men: 300, wing: 'hisar', banner: 'yesil', march: 0 },
];

// ───────────────────────────── Recruitment (H9) ─────────────────────────────

export interface RecruitDef {
  /** Display label in the Edirne panel. */
  label: string;
  /** Hint (Turkish). */
  desc: string;
  /** Max groups of this type in the whole army (incl. initial). */
  max: number;
  /** Days for a group raised during the siege to reach the camp. */
  arriveDays: number;
  wing: WingId;
  banner: BannerColor;
  /** Name stem for new groups. */
  stem: string;
}

export const RECRUIT: Record<UnitTypeId, RecruitDef> = {
  yeniceri: { label: 'Kapıkulu ocağından yeniçeri', desc: 'Pahalı ve sınırlı; en güçlü piyade.', max: 8, arriveDays: 4, wing: 'merkez', banner: 'kirmizi', stem: 'Yeniçeri Ortası' },
  sipahi: { label: 'Tımar çağrısı (sipahi)', desc: 'Sancaklardan atlı tımarlılar gelir.', max: 22, arriveDays: 5, wing: 'ishak', banner: 'yesil', stem: 'Tımarlı Sipahiler' },
  azap: { label: 'Azap yazımı', desc: 'Okçu hafif piyade; hendek ve koruma işleri.', max: 14, arriveDays: 4, wing: 'karaca', banner: 'kirmizi', stem: 'Azaplar' },
  basibozuk: { label: 'Gönüllü çağrısı (başıbozuk)', desc: 'Ucuz ve kalabalık; son hücumun ilk dalgası.', max: 10, arriveDays: 3, wing: 'merkez', banner: 'yesil', stem: 'Başıbozuk Gönüllüler' },
  akinci: { label: 'Uç beylerinden akıncı', desc: 'Hızlı atlılar: keşif, baskın, seferler.', max: 6, arriveDays: 3, wing: 'akinci', banner: 'beyaz', stem: 'Akıncılar' },
  topcu: { label: 'Topçu ustaları ve yardımcıları', desc: 'Top mevzilerinde çalışırlar.', max: 5, arriveDays: 4, wing: 'merkez', banner: 'kirmizi', stem: 'Topçular' },
  lagimci: { label: 'Madenci getirt (lağımcı)', desc: 'Sur altına lağım kazmak için.', max: 4, arriveDays: 6, wing: 'merkez', banner: 'beyaz', stem: 'Lağımcılar' },
  mehter: { label: 'Mehter takımı', desc: 'Moral; hücumda çalar.', max: 2, arriveDays: 4, wing: 'merkez', banner: 'kirmizi', stem: 'Mehter Takımı' },
};

// ───────────────────────────── Balance ─────────────────────────────

/**
 * Tunables. Rates are per SIM-SECOND unless noted (a siege day = 180 sim-s at 1×).
 * Assault model (see combat.ts):
 *   frontage   = FRONT_BASE + FRONT_OPEN × openness           (men who can engage at once)
 *   O_eff      = engaged·q + reserve·q·RESERVE_W               (q = attack·siege·morale·fatigue·xp·bonuses)
 *   D_eff      = sectionDefense · (1 + WALL_ADV·(1−open)) · (1−cover) · (1−0.5·exhaustion) · special
 *   foothold' = FOOT_RATE · (0.2 + open) · clamp(O/D − 1, −1, 2.5)
 */
export const BAL = {
  // movement
  marchSpeedMult: 2.6,
  nightSpeedMult: 0.85,
  formationSpacing: 2.6,
  // fatigue (0..100)
  fatigueWalk: 0.1,
  fatigueWork: 0.05,
  fatigueFight: 0.55,
  fatigueIdle: -0.08,
  fatigueRest: -0.4,
  // group morale drift toward its baseline when not fighting
  moraleDrift: 0.03,
  // combat
  FRONT_BASE: 550,
  FRONT_OPEN: 2600,
  RESERVE_W: 0.1,
  WALL_ADV: 2.3,
  FOOT_RATE: 0.02,
  defKill: 0.0016,
  attKill: 0.014,
  routMoraleBase: 46,
  routMoraleDisc: 32,
  /** Morale lost per 1.0 fraction of men lost in a tick. */
  moraleLossPerCasualty: 140,
  maxAssaultSec: 75,
  /** Defender exhaustion growth per second × min(2.5, ratio). */
  exhaustRate: 0.004,
  // arrows from the walls on groups nearby (casualties per 1000 defenders per sim-second)
  arrowHarass: 0.35,
  // archer cover (bombardımanı koru)
  coverMax: 0.55,
  coverPerMan: 1 / 9000,
  // sultan's visit
  visitCooldownDays: 2.5,
  visitMorale: 6,
  visitGroupMorale: 10,
  // final assault (sim seconds)
  waveSec: [0, 24, 24, 48] as const,
  waveGapSec: 4,
  fallSec: 14,
  finalCooldownDays: 3,
};

