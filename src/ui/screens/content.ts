/**
 * Player-facing texts of the screens (Turkish). Historical statements follow
 * docs/TASARIM.md (Ottoman sources primary); uncertain points are marked
 * "(doğrulanacak)" exactly like the encyclopedia.
 */
import type { ScenarioName } from '../../core/feature';
import type { Difficulty } from '../../core/state';

export interface Fact {
  text: string;
  /** Short source line shown under the fact. */
  kaynak: string;
}

/** Loading-screen snippets ("Tarihten bir yaprak"). */
export const LOAD_FACTS: Fact[] = [
  {
    text: 'Rumeli Hisarı (Boğazkesen) 1452 baharında başlayıp 31 Ağustos 1452’de, yaklaşık dört buçuk ayda tamamlandı. Mimarı Müslihiddin Ağa’ydı.',
    kaynak: 'Tursun Bey · Tansel',
  },
  {
    text: 'Hisarın üç büyük kulesini üç vezir yaptırdı: Saruca Paşa, Çandarlı Halil Paşa ve Zağanos Paşa.',
    kaynak: 'Aşıkpaşazade · Emecen',
  },
  {
    text: 'Kuşatma 6 Nisan 1453’te başladı; şehir 29 Mayıs 1453 Salı günü alındı.',
    kaynak: 'Tursun Bey · Kritovulos',
  },
  {
    text: 'Theodosius surları hendek, dış sur ve iç surdan oluşan bir çift sur sistemiydi. Kireçtaşı sıraların arasında kırmızı tuğla bantlar vardı.',
    kaynak: 'Emecen',
  },
  {
    text: '22 Nisan gecesi Osmanlı gemileri, yağlanmış kızaklar üzerinde Galata’nın ardındaki tepelerden karadan yürütülerek Kasımpaşa’dan Haliç’e indirildi.',
    kaynak: 'Tursun Bey · Kritovulos',
  },
  {
    text: '20 Nisan’da üç Ceneviz gemisiyle bir Bizans gemisi ablukayı yarıp Haliç’e girdi. Sultan Mehmed çarpışmayı kıyıdan izlerken atıyla denize girdi.',
    kaynak: 'Kritovulos · Barbaro (kontrol)',
  },
  {
    text: 'Akşemseddin’in kuşatma sırasında Sultan’a yazdığı mektup günümüze ulaştı. Mektup sabır ve tevekkül öğütler.',
    kaynak: 'Akşemseddin’in mektubu (belge)',
  },
  {
    text: 'Haliç’in ağzı, Bizanslıların gerdiği kalın bir zincirle kapatılmıştı.',
    kaynak: 'Kritovulos · Barbaro (kontrol)',
  },
  {
    text: 'Orban adlı dökümcü ustanın döktüğü büyük top, Edirne’den surların önüne onlarca çift öküzle taşındı.',
    kaynak: 'Kritovulos · Doukas (kontrol)',
  },
  {
    text: 'II. Mehmed Kostantiniyye’yi aldığında yirmi bir yaşındaydı.',
    kaynak: 'İnalcık',
  },
  {
    text: '1453’te Ayasofya’nın minaresi yoktu; minareler fetihten sonra eklendi.',
    kaynak: 'Emecen',
  },
  {
    text: 'Osmanlı sancakları kırmızı, beyaz ve yeşildi. Ay-yıldızlı bayrak çok daha sonraki bir döneme aittir.',
    kaynak: 'Emecen',
  },
  {
    text: 'Haliç’in üzerine fıçılardan bir köprü kuruldu; Zağanos Paşa’nın kesimi böylece kara surlarına bağlandı.',
    kaynak: 'Kritovulos · Tansel',
  },
  {
    text: '22 Mayıs 1453’te bir ay tutulması oldu. Surların ardında bu, kötüye yorulan işaretlerden biri sayıldı.',
    kaynak: 'Barbaro (kontrol) · Emecen',
  },
  {
    text: 'Şehri savunanların sayısı yaklaşık 7.000 olarak tahmin edilir. Bu tahmin Sphrantzes’in yaptığı sayıma dayanır.',
    kaynak: 'Sphrantzes (kontrol)',
  },
  {
    text: 'Tursun Bey kuşatmada bizzat bulundu ve gördüklerini Târîh-i Ebü’l-Feth’te anlattı.',
    kaynak: 'Tursun Bey',
  },
  {
    text: 'Kerkoporta kapısının açık unutulduğu hikâyesini yalnızca Doukas anlatır. Oyun bunu ansiklopedide ayrıca not eder.',
    kaynak: 'Doukas (kontrol) · Emecen',
  },
];

/** Loading-phase captions (what is being prepared), by progress. */
export function loadCaption(p: number): string {
  if (p < 0.12) return 'Harita çiziliyor…';
  if (p < 0.3) return 'Surlar örülüyor…';
  if (p < 0.45) return 'Ordugâh kuruluyor…';
  if (p < 0.6) return 'Toplar dökülüyor…';
  if (p < 0.72) return 'Ordu toplanıyor…';
  if (p < 0.84) return 'Donanma hazırlanıyor…';
  if (p < 0.98) return 'Gökyüzü boyanıyor…';
  return 'Hazır.';
}

// ───────────────────────────── scenario gallery ─────────────────────────────

export interface ScenarioInfo {
  name: ScenarioName;
  /** Event illustration key ('olay/…'). */
  image: string;
  desc: string;
}

export const SCENARIO_INFO: ScenarioInfo[] = [
  { name: 'yeni-oyun', image: 'olay/divan', desc: 'Mart 1452, Edirne. Hazırlık baştan başlıyor.' },
  { name: 'hisar-insaat', image: 'olay/hisar', desc: 'Boğazkesen yükseliyor; taş, kereste ve işçi yarışı.' },
  { name: 'kis-hazirlik', image: 'olay/dokum', desc: 'Orban geldi, dökümhane çalışıyor. Ordu toplanıyor.' },
  { name: 'kusatma-gun1', image: 'olay/ordu', desc: '6 Nisan 1453. Ordu surların önünde, otağ kuruldu.' },
  { name: 'bombardiman', image: 'olay/top', desc: 'Şahi topu cephede; Topkapı önünde ağır bombardıman.' },
  { name: 'gece-onarim', image: 'olay/ates', desc: 'Gece. Bizans gedikleri barikatlarla kapatıyor.' },
  { name: 'deniz-savasi', image: 'olay/deniz', desc: '20 Nisan. Ceneviz gemileri ablukayı yarmaya çalışıyor.' },
  { name: 'gemiler-karadan', image: 'olay/gemiler', desc: '22 Nisan gecesi. Gemiler kızaklarla Haliç’e iniyor.' },
  { name: 'lagim', image: 'olay/lagim', desc: 'Mayıs ortası. Lağımcılar surların altını kazıyor.' },
  { name: 'kule', image: 'olay/kule', desc: 'Kuşatma kulesi hendeğe yanaşıyor.' },
  { name: 'son-hucum', image: 'olay/sancak', desc: '29 Mayıs, şafaktan önce. Son hücum başladı.' },
  { name: 'zafer', image: 'olay/ayasofya', desc: 'Şehir alındı. Fethin sonu ve bilançosu.' },
  { name: 'yenilgi', image: 'olay/tutulma', desc: 'Yardım filosu yetişti. Yenilginin sonu.' },
];

// ───────────────────────────── difficulty ─────────────────────────────

export interface DifficultyInfo {
  id: Difficulty;
  name: string;
  /** Tuğ (horsetail) count shown as emblem. */
  tug: number;
  tagline: string;
}

export const DIFFICULTY_INFO: DifficultyInfo[] = [
  { id: 'kolay', name: 'Kolay', tug: 1, tagline: 'Tarihi öğrenmek ve hikâyenin tadını çıkarmak için.' },
  { id: 'normal', name: 'Normal', tug: 2, tagline: 'Tarihteki hızla giden oyuncu güvende kalır.' },
  { id: 'zor', name: 'Zor', tug: 3, tagline: 'Batı’nın yardımı erken yola çıkar. Her gün önemlidir.' },
];

// ───────────────────────────── end screens ─────────────────────────────

/** Victory cinematic lines (shown one by one). */
export const ZAFER_LINES: string[] = [
  'Gece yarısından sonra davullar ve mehter yükseldi; son hücum başladı. Önce başıbozuklar, sonra Anadolu askerleri, en son yeniçeriler surlara yürüdü.',
  'Giustiniani yaralanıp surdan çekilince savunma çözüldü. Sancak burçlara dikildi.',
  'Gün ağarırken Kostantiniyye’nin kapıları açıldı.',
  'Öğleden sonra Sultan Mehmed atıyla şehre girdi ve doğruca Ayasofya’ya gitti.',
];

/** Closing paragraphs after the statistics: the human cost, stated plainly. */
export const ZAFER_CLOSING: string[] = [
  'Fethin bir bedeli vardı. Şehir, dönemin savaş geleneğine göre askerin yağmasına bırakıldı. Binlerce kişi hayatını kaybetti; halkın büyük bölümü esir alındı, aileler dağıldı.',
  'Son Bizans imparatoru XI. Konstantinos, surlarda askerlerinin arasında çarpışarak öldü. Akıbetine dair ayrıntılar kaynaklarda farklı anlatılır. Bin yılı aşkın Doğu Roma İmparatorluğu onunla sona erdi.',
  'Sultan Mehmed şehri yeniden iskân ettirdi, Rum Ortodoks patrikliğini yeniden kurdurdu ve Galata’ya ahidname verdi. Kostantiniyye, Osmanlı Devleti’nin başkenti oldu.',
];

export interface DefeatText {
  title: string;
  lines: string[];
  tarihte: string;
}

export const YENILGI_TEXT: Record<'yenilgi-hacli' | 'yenilgi-divan', DefeatText> = {
  'yenilgi-hacli': {
    title: 'Haçlı Yardımı Yetişti',
    lines: [
      'Ufukta Venedik ve Papalık gemilerinin yelkenleri belirdi.',
      'Haliç’in zinciri yerinde, surlar ayakta kaldı. Yorgun ordu iki ateş arasında kalmamak için çekilmek zorunda kaldı.',
      'Divan toplandı. Çandarlı Halil Paşa’nın sözü geçti: kuşatma kaldırıldı ve ordu Edirne yoluna düştü.',
    ],
    tarihte:
      'Tarihte Venedik’in gönderdiği yardım filosu yola çıktı ama geç kaldı. Şehir yardım gelmeden, 29 Mayıs 1453’te alındı. Tarihte kuşatma 53 gün sürdü.',
  },
  'yenilgi-divan': {
    title: 'Divan Kuşatmayı Kaldırdı',
    lines: [
      'Erzak tükendi, moral çöktü. Ordugâhta “Edirne’ye dönelim” diyenlerin sesi yükseldi.',
      'Divan’da Çandarlı Halil Paşa’nın barış kanadı ağır bastı. Zağanos Paşa’nın itirazları sonuç vermedi.',
      'Otağ söküldü, toplar geri çekildi. Kostantiniyye bir kez daha ayakta kaldı.',
    ],
    tarihte:
      'Tarihte 26 Mayıs’taki Divan’da Halil Paşa kuşatmanın kaldırılmasını savundu. Zağanos Paşa ve genç komutanlar devam edilmesini istedi. Sultan son hücuma karar verdi ve şehir 29 Mayıs’ta alındı.',
  },
};

/** Historical siege length used for comparisons (6 Nisan → 29 Mayıs 1453). */
export const HISTORICAL_SIEGE_DAYS = 53;
