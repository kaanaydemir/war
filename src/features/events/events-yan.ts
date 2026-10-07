import { d } from '../../core/calendar';
import { FLAG } from '../../core/flags';
import { addLog, type GameState } from '../../core/state';
import { ev, IMG } from './build';
import { flag, siegeDay } from './effects';
import type { EventDefX } from './types';

const inSiege = (s: GameState): boolean => flag(s, FLAG.kusatmaBasladi) && !flag(s, FLAG.sehirDustu);

/**
 * Minor flavour events (codes Y1…) and the Divan crisis (D1–D2).
 * Flavour must stay historical: anything not attested is labelled as a game event.
 */
export const YAN_EVENTS: EventDefX[] = [
  ev({
    id: 'y-sehzade-orhan',
    code: 'Y1',
    minor: true,
    title: 'Şehzade Orhan meselesi',
    dateLabel: '1451 – 1452',
    kind: 'sabit',
    pause: false,
    earliestDay: d(6, 3, 1452),
    phases: ['hazirlik'],
    text:
      'Kostantiniyye’de, Osmanlı tahtında hak iddia edebilecek bir şehzade yaşıyor: Süleyman Çelebi’nin torunu Orhan. İmparatorun elçileri, Orhan’ın geçimi için ödenen paranın artırılmasını istedi; ' +
      'aksi halde onu serbest bırakabileceklerini ima etti. Bu tehdit Divan’daki barış yanlılarını bile kızdırdı.',
    tarihte:
      'Doukas’a göre bu istek 1451’de geldi ve Halil Paşa elçileri sert bir dille azarladı. Sultan Orhan için ayrılan gelirleri kesti. ' +
      'Orhan kuşatmada şehri savundu ve şehir düşerken öldü (ayrıntılar doğrulanacak).',
    sources: ['inalcik', 'emecen', 'doukas'],
    fireFx: { divan: 4 },
  }),
  ev({
    id: 'y-orban-bizans',
    code: 'Y2',
    minor: true,
    title: 'Kapıdaki usta',
    dateLabel: '1452',
    kind: 'sabit',
    pause: false,
    earliestDay: d(26, 3, 1452),
    phases: ['hazirlik'],
    image: IMG.dokum,
    condition: (s) => !flag(s, FLAG.orbanGeldi),
    text:
      'Kostantiniyye’den gelen haberlere göre, top dökümünde usta biri, Orban adında bir Macar, hizmetlerini önce İmparator Konstantinos’a sunmuş. ' +
      'Ama yoksul hazine ustanın istediği ücreti ödeyememiş, malzemeyi de sağlayamamış. Usta şimdi kendine yeni bir efendi arıyor; Edirne’de onu çağırmanın zamanı.',
    tarihte: 'Doukas’a göre Orban önce Bizans’a başvurdu; ücreti ödenmeyince Sultan’ın hizmetine girdi (doğrulanacak).',
    sources: ['emecen', 'doukas'],
  }),
  ev({
    id: 'y-bogaz-gecis',
    code: 'Y3',
    minor: true,
    title: 'Boğaz’da geçiş',
    dateLabel: 'Eylül 1452',
    kind: 'kosullu',
    pause: false,
    earliestDay: d(3, 9, 1452),
    phases: ['hazirlik'],
    image: IMG.hisar,
    focus: 'rumeliHisari',
    condition: (s) => flag(s, FLAG.bogazKontrol),
    text:
      'Boğazkesen’in topları kıyıya dizildi. Karadeniz’den inen ya da Karadeniz’e çıkan her gemi hisarın önünde yelken indirip geçiş izni almak zorunda. ' +
      'Kaptanlar, Boğaz’ın sahibinin değiştiğini ilk kez bu kadar açık görüyor.',
    tarihte: 'Kritovoulos ve Doukas, hisarın tamamlanmasından sonra Boğaz’dan geçen gemilerin durdurulup denetlendiğini yazar.',
    sources: ['kritovulos', 'doukas'],
    fireFx: { byzFood: -4 },
  }),
  ev({
    id: 'y-kilise-birligi',
    code: 'Y4',
    minor: true,
    title: 'Ayasofya’da birlik ayini',
    dateLabel: '12 Aralık 1452',
    kind: 'sabit',
    pause: false,
    earliestDay: d(12, 12, 1452),
    historicalDay: d(12, 12, 1452),
    phases: ['hazirlik'],
    text:
      'Papa’nın elçisi Kardinal İsidoros, yanında iki yüz kadar okçuyla şehre geldi. 12 Aralık’ta Ayasofya’da Katolik ve Ortodoks kiliselerinin birliği ilan edildi. ' +
      'Kaçaklara göre şehir ikiye bölünmüş: birliğe karşı olanlar ayinden uzak duruyor, keşiş Gennadios’un çevresinde toplanıyor.',
    tarihte:
      'Kilise birliği 1439’da Floransa Konsili’nde kabul edilmişti; Kostantiniyye’de ilanı 12 Aralık 1452’de yapıldı. Halk arasında derin bir hoşnutsuzluk yarattı, ama Batı’dan beklenen büyük yardımı getirmedi.',
    sources: ['emecen', 'doukas', 'sphrantzes', 'leonardo'],
    fireFx: { byzMorale: -4 },
  }),
  ev({
    id: 'y-giustiniani-gelis',
    code: 'Y5',
    minor: true,
    title: 'Cenevizli Giustiniani geliyor',
    dateLabel: 'Ocak 1453',
    kind: 'sabit',
    pause: false,
    earliestDay: d(29, 1, 1453),
    historicalDay: d(29, 1, 1453),
    phases: ['hazirlik'],
    text:
      'İki büyük gemi Haliç’e girdi. Cenevizli Giovanni Giustiniani Longo, kendi parasıyla tuttuğu yedi yüz kadar zırhlı askerle imparatorun hizmetine geldi. ' +
      'Konstantinos, kuşatma savaşlarında ün salmış bu komutanı kara surlarının savunmasının başına getirdi.',
    tarihte:
      'Giustiniani Ocak 1453’ün sonunda geldi (Barbaro 29 Ocak der, doğrulanacak). Kara surlarının savunmasını o düzenledi ve Topkapı–Lykos kesiminde bizzat savaştı.',
    sources: ['emecen', 'barbaro', 'sphrantzes'],
    fireFx: { byzMorale: 5 },
  }),
  ev({
    id: 'y-sehirde-hazirlik',
    code: 'Y6',
    minor: true,
    title: 'Şehirde hazırlık',
    dateLabel: 'Kış 1453',
    kind: 'sabit',
    pause: false,
    earliestDay: d(15, 2, 1453),
    phases: ['hazirlik'],
    text:
      'Kaçakların anlattığına göre imparator kış boyunca surları onartıyor, hendeği temizletiyor; kiliselerden ve manastırlardan para toplanıp silah alınıyor. ' +
      'Sur içindeki bağ ve bahçelere ekin ekilmiş: şehir uzun bir kuşatmaya hazırlanıyor.',
    tarihte: 'Bizans kaynakları kış hazırlıklarını, onarımları ve para toplama çabalarını anlatır (doğrulanacak).',
    sources: ['emecen2', 'sphrantzes'],
    fireFx: { intel: 3 },
  }),
  ev({
    id: 'y-galata-ticaret',
    code: 'Y7',
    minor: true,
    title: 'Galata’nın iki yüzü',
    dateLabel: 'Nisan 1453',
    kind: 'karar',
    earliestDay: d(11, 4, 1453),
    minSiegeDay: 5,
    phases: ['kusatma'],
    focus: 'galataKulesi',
    condition: inSiege,
    text:
      'Galata’nın Cenevizlileri tarafsız olduklarını söylüyor. Gündüz ordugâha yağ, ip ve erzak satıyorlar; geceleri ise bazılarının gizlice surlara geçip savunuculara katıldığı fısıldanıyor. ' +
      'Haberler de iki yöne akıyor: bizden onlara, onlardan bize.',
    tarihte:
      'Sultan kuşatma boyunca Galata’nın tarafsızlığına dokunmadı. Doukas ve Leonardo, Galatalıların iki tarafla da ilişki sürdürdüğünü yazar. ' +
      'Şehir düşünce Galata kapılarını açtı ve 1 Haziran 1453’te Sultan’dan bir ahidname aldı.',
    sources: ['inalcik', 'emecen', 'doukas', 'leonardo'],
    choices: [
      {
        id: 'goz-yum',
        label: 'Göz yum: ticaret ve haber aksın',
        desc: 'Galata dost kalır; casus haberleri artar, ama şehre de bir şeyler sızar.',
        tarihi: true,
        fx: { galata: 12, intel: 6, byzFood: 2, res: { yag: 40, akce: 400 } },
      },
      {
        id: 'sikistir',
        label: 'Sıkıştır: Galata kapılarını gözetime al',
        desc: 'Sızıntı azalır; ama Cenevizliler küser, gemileri karadan geçirmek zorlaşır.',
        fx: { galata: -20, byzFood: -3, intel: -2, divan: 3 },
      },
    ],
  }),
  ev({
    id: 'y-havan',
    code: 'Y8',
    minor: true,
    title: 'Galata üstünden havan',
    dateLabel: 'Mayıs 1453',
    kind: 'sabit',
    pause: false,
    earliestDay: d(5, 5, 1453),
    minSiegeDay: 12,
    phases: ['kusatma'],
    image: IMG.top,
    focus: 'galataKulesi',
    condition: inSiege,
    text:
      'Sultan, Haliç’te zincirin ardına sığınan gemilere ulaşmak için yeni bir top döktürdü: namlusu kısa, ağzı geniş, güllesini yukarı fırlatıp yukarıdan düşüren bir havan. ' +
      'Galata’nın arkasındaki tepeden atılan güllelerden biri bir gemiyi ortasından delip batırdı. Galatalılar güllelerin kendi damlarına da düşmesinden korkuyor.',
    tarihte:
      'Kritovoulos, havanın Sultan’ın tarifiyle döküldüğünü ve Galata üzerinden atılan güllelerin Haliç’teki gemileri batırdığını anlatır (tarih doğrulanacak).',
    sources: ['kritovulos', 'barbaro'],
    fireFx: { byzMorale: -3, galata: -4 },
  }),
  ev({
    id: 'y-venedik-filosu',
    code: 'Y9',
    minor: true,
    title: 'Ege’den haber',
    dateLabel: 'Mayıs 1453',
    kind: 'sabit',
    pause: false,
    earliestDay: d(3, 5, 1453),
    minSiegeDay: 10,
    phases: ['kusatma'],
    condition: inSiege,
    fire: (s) => {
      // spy news narrows the visible relief window around the hidden arrival day
      const r = s.relief;
      if (r.arrived) return;
      r.knownMin = Math.round(r.knownMin + (Math.min(r.arrival, r.knownMax) - r.knownMin) * 0.3);
      r.knownMax = Math.round(r.knownMax - (r.knownMax - Math.max(r.arrival, r.knownMin)) * 0.3);
      addLog(s, 'casus', 'Casuslar Haçlı yardımının tahmini geliş aralığını daralttı.');
    },
    text:
      'Sakız’dan gelen bir tüccar gemisi haber getirdi: Venedik, Giacomo Loredan komutasında bir yardım filosu hazırlıyor; Papa’nın da birkaç gemi göndereceği söyleniyor. ' +
      'Ama filo henüz Ege’de ve ağır ilerliyor. Casuslarımız yardımın ne zaman gelebileceğine dair tahminimizi daralttı.',
    tarihte:
      'Venedik senatosu yardım filosunu geç ve yavaş hazırladı; Loredan’ın donanması şehir düştüğünde hâlâ Ege’deydi (doğrulanacak).',
    sources: ['emecen2', 'barbaro'],
    fireFx: { intel: 4 },
  }),
  ev({
    id: 'y-macar-elcileri',
    code: 'Y10',
    minor: true,
    title: 'Macar elçileri',
    dateLabel: 'Mayıs 1453 (doğrulanacak)',
    kind: 'sabit',
    pause: false,
    earliestDay: d(10, 5, 1453),
    minSiegeDay: 14,
    phases: ['kusatma'],
    focus: 'otag',
    condition: inSiege,
    text:
      'Ordugâha Hunyadi Yanoş’un elçileri geldi. Naibin, Sultan’la yaptığı ateşkesi geri vermek istediği konuşuluyor. Haber Divan’da Halil Paşa’nın elini güçlendirdi.',
    variant: (s) =>
      flag(s, FLAG.macarAteskes)
        ? null
        : {
            text:
              'Ordugâha Hunyadi Yanoş’un elçileri geldi. Ateşkes olmadığı için naibin Tuna boyunda asker topladığı konuşuluyor. Haber Divan’da Halil Paşa’nın elini iyice güçlendirdi.',
            fx: { divan: -5 },
          },
    tarihte:
      'Doukas, kuşatma sırasında ordugâha bir Macar elçiliğinin geldiğini ve elçilerden birinin topçulara atışlarını nasıl düzelteceklerini gösterdiğini yazar. ' +
      'Elçiliğin amacı ve tarihi tartışmalıdır (doğrulanacak).',
    sources: ['emecen', 'doukas'],
    fireFx: { divan: -5 },
  }),
  ev({
    id: 'y-sehirde-kitlik',
    code: 'Y11',
    minor: true,
    title: 'Şehirde kıtlık',
    dateLabel: 'Mayıs 1453',
    kind: 'sabit',
    pause: false,
    earliestDay: d(13, 5, 1453),
    minSiegeDay: 18,
    phases: ['kusatma'],
    condition: inSiege,
    text:
      'Kaçaklar şehirde ekmeğin azaldığını anlatıyor. Bazı savunucular ailelerine yiyecek bulmak için surlardaki yerlerini bırakıyor; imparator ekmeğin ölçülü dağıtılmasını emretmiş. ' +
      'Venedikliler ile Cenevizliler arasında da kavga eksik değil.',
    tarihte:
      'Barbaro ve Leonardo, Mayıs ortasında şehirde yiyecek sıkıntısı çekildiğini, savunucuların ailelerini beslemek için surlardan ayrıldığını ve Venedik–Ceneviz çekişmelerini anlatır (doğrulanacak).',
    sources: ['emecen2', 'barbaro', 'leonardo'],
    fireFx: { byzMorale: -4, byzFood: -3, intel: 4 },
  }),
  ev({
    id: 'y-son-ayin',
    code: 'Y12',
    minor: true,
    title: 'Ayasofya’da son ayin',
    dateLabel: '28 Mayıs 1453',
    kind: 'sabit',
    pause: false,
    earliestDay: d(28, 5, 1453) + 0.6,
    historicalDay: d(28, 5, 1453),
    phases: ['kusatma'],
    focus: 'ayasofya',
    condition: inSiege,
    text:
      'Kaçakların anlattığına göre şehirde, birliğe karşı olanlar da olmayanlar da Ayasofya’da aynı ayinde buluşmuş. İmparator ileri gelenlerle helalleşmiş, sonra herkes surlardaki yerine dönmüş. ' +
      'Surların ardı bu gece alışılmadık derecede sessiz.',
    tarihte:
      '28 Mayıs akşamı Ayasofya’da toplu bir ayin yapıldığı ve imparatorun ileri gelenlerle vedalaştığı anlatılır; sahnenin ayrıntıları daha geç ve süslü anlatımlara dayanır (doğrulanacak).',
    sources: ['emecen2', 'sphrantzes', 'leonardo'],
    fireFx: { byzMorale: 3 },
  }),
  // ───────────────────────────── Divan crisis (Yenilgi 2 path) ─────────────────────────────
  ev({
    id: 'd1-divan-krizi',
    code: 'D1',
    minor: true,
    title: 'Divan’da kriz',
    dateLabel: 'Kuşatma',
    kind: 'karar',
    phases: ['kusatma'],
    image: IMG.divan,
    focus: 'otag',
    condition: (s) => inSiege(s) && s.divan <= -70,
    text:
      'Halil Paşa’nın çevresi artık açıkça konuşuyor: ordu eriyor, Haçlı donanması yolda, şehir alınamayacak. Bazı beyler çadırlarını toplamaya hazırlanıyor. ' +
      'Sultan bu gidişe bir son vermezse kuşatma Divan kararıyla kaldırılacak.',
    tarihte:
      'Tarihte böyle bir çözülme yaşanmadı: Halil Paşa’nın kanadı son ana kadar barışı savundu, ama Sultan Divan’ın dengesini savaştan yana tutmayı başardı.',
    sources: ['emecen', 'inalcik'],
    choices: [
      {
        id: 'ihsan',
        label: 'Hazineyi aç: beylere ve askere ihsan dağıt',
        requires: { akce: 5000 },
        fx: { divan: 35, morale: 8 },
      },
      {
        id: 'zaganos',
        label: 'Zağanos Paşa’yı öne çıkar, muhalifleri sustur',
        desc: 'Sert bir adım; yorgun ordu bunu kaldırabilir mi?',
        fx: { divan: 25, morale: -6, galata: -5 },
        unavailable: (s) => (s.morale < 35 ? 'Ordu morali buna dayanmaz (moral en az 35 olmalı).' : null),
      },
      {
        id: 'kaldir',
        label: 'Kuşatmayı kaldır',
        desc: 'Ordu Edirne’ye döner. Oyun biter.',
      },
    ],
    choose: (s, c) => {
      if (c !== 'kaldir') return;
      raiseSiege(s);
    },
  }),
  ev({
    id: 'd2-divan-cozulme',
    code: 'D2',
    minor: true,
    title: 'Kuşatma kaldırıldı',
    dateLabel: 'Kuşatma',
    kind: 'tepkisel',
    pause: true,
    phases: ['kusatma'],
    image: IMG.divan,
    condition: (s) => inSiege(s) && s.divan <= -95 && s.events.fired['d1-divan-krizi'] != null && s.events.choices['d1-divan-krizi'] !== 'kaldir',
    fire: (s) => raiseSiege(s),
    text:
      'Divan dağıldı. Halil Paşa’nın kanadı, yorgun beyleri ve sancakları arkasına alarak kuşatmanın kaldırılmasını Sultan’a kabul ettirdi. Toplar arabalara yükleniyor, ordu Edirne yoluna düşüyor. ' +
      'Surlarda çanlar çalıyor.',
    tarihte: 'Tarihte kuşatma kaldırılmadı; Sultan Zağanos Paşa’nın görüşünü benimsedi ve şehir 29 Mayıs 1453’te alındı.',
    sources: ['emecen', 'inalcik'],
  }),
  ev({
    id: 'y-ordugah-soylenti',
    code: 'Y13',
    minor: true,
    title: 'Ordugâhta söylentiler',
    dateLabel: 'Kuşatma',
    kind: 'karar',
    phases: ['kusatma'],
    minSiegeDay: 4,
    condition: (s) => inSiege(s) && s.morale < 35,
    text:
      'Nöbet ateşlerinin başında fısıltılar dolaşıyor: Macar ordusu Tuna’yı geçmiş, Venedik donanması Boğaz’a girmek üzereymiş. Kimi askerler çadırlarını toplamayı konuşuyor. ' +
      'Bir şey yapılmazsa söylenti kılıçtan hızlı yayılacak.',
    tarihte:
      'Bu bir oyun olayıdır. Kaynaklar, kuşatma uzadıkça ordugâhta yorgunluk ve yardım söylentileri yayıldığını anlatır; Sultan’ın ordugâhı dolaşıp askere ihsanda bulunduğu da Osmanlı kaynaklarında geçer.',
    sources: ['tursun', 'emecen'],
    choices: [
      { id: 'bahsis', label: 'Askere bahşiş dağıt', requires: { akce: 3000 }, fx: { morale: 14 } },
      { id: 'gezinti', label: 'Sultan ordugâhı dolaşsın', desc: 'Az ama kesin bir moral.', fx: { morale: 7, divan: 2 } },
      { id: 'gormezden', label: 'Görmezden gel', desc: 'Söylenti Divan’a kadar ulaşır.', fx: { morale: -4, divan: -6 } },
    ],
  }),

];

function raiseSiege(s: GameState): void {
  if (s.outcome) return;
  s.outcome = { result: 'yenilgi-divan', day: s.time.day, siegeDays: siegeDay(s) || null };
  addLog(s, 'kayip', 'Divan kararıyla kuşatma kaldırıldı.');
}
