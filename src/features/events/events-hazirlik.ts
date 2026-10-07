import { d } from '../../core/calendar';
import { FLAG } from '../../core/flags';
import { store } from '../../core/store';
import { ev, IMG } from './build';
import { flag, priv, totalMen } from './effects';
import type { EventDefX } from './types';

/**
 * HAZIRLIK (1452 – Mart 1453): design events H1–H10.
 * Ottoman sources primary; Western sources only to check dates (see data/sources.ts).
 */
export const HAZIRLIK_EVENTS: EventDefX[] = [
  // ───────────────────────────── H1 ─────────────────────────────
  ev({
    id: 'h1-divan',
    code: 'H1',
    title: 'Edirne Divanı: kuşatma kararı',
    dateLabel: '1452 başı',
    kind: 'karar',
    earliestDay: d(1, 3, 1452),
    historicalDay: d(1, 3, 1452),
    phases: ['hazirlik'],
    image: IMG.divan,
    text:
      'Edirne Sarayı, 1452 kışı. Genç Sultan Mehmed, babası II. Murad’ın ölümünden bir yıl sonra vezirlerini Divan’a topladı. ' +
      'Konuşulan tek şey Kostantiniyye: Bizans’ın elinde kalan bu şehir, Rumeli ile Anadolu’yu birbirinden ayırıyor ve her taht kavgasında bir şehzadeyi koz olarak saklıyor. ' +
      'Sadrazam Çandarlı Halil Paşa, Haçlı birliğinden ve kuşatmanın masrafından çekiniyor; Zağanos Paşa ile Şehabeddin Paşa ise hemen harekete geçilmesini istiyor. ' +
      'Divan göstergesi bu iki kanadın dengesidir: barış kanadı ağır basarsa kuşatma kaldırılabilir.',
    tarihte:
      'Sultan kuşatmaya karar verdi, ama Halil Paşa’yı sadrazamlıktan almadı; Halil Paşa kuşatma boyunca görevinde kaldı ve fetihten kısa süre sonra azledilip idam edildi. ' +
      'Barış yanlıları ile savaş yanlıları arasındaki çekişme kuşatmanın son günlerine kadar sürdü.',
    sources: ['tursun', 'apz', 'inalcik', 'emecen'],
    choices: [
      {
        id: 'halil-gorevde',
        label: 'Kuşatmaya karar ver; Halil Paşa görevinde kalsın',
        desc: 'Karar kesin, ama sadrazamın deneyimi ve hazine bilgisi elde tutulur.',
        tarihi: true,
        fx: { divan: 8, morale: 5 },
      },
      {
        id: 'zaganos',
        label: 'Savaş kanadına yaslan; Zağanos Paşa öne çıksın',
        desc: 'Ordu coşar; Halil Paşa’nın çevresi küser, hazine işleri aksar.',
        fx: { divan: 20, morale: 8, res: { akce: -1500 } },
      },
      {
        id: 'ihtiyat',
        label: 'Acele etme: önce hazine ve antlaşmalar',
        desc: 'Hazine dolar, ama barış kanadı güç kazanır.',
        fx: { divan: -10, res: { akce: 3000 } },
      },
    ],
  }),

  // ───────────────────────────── H2 ─────────────────────────────
  ev({
    id: 'h2-antlasmalar',
    code: 'H2',
    title: 'Macaristan ve Venedik ile antlaşmalar',
    dateLabel: 'Eylül – Kasım 1451',
    kind: 'karar',
    earliestDay: d(18, 3, 1452),
    historicalDay: d(18, 3, 1452),
    phases: ['hazirlik'],
    text:
      'Sultan, tahta çıkar çıkmaz batıdaki cepheleri yatıştırmak için elçiler gönderdi. Venedik ticaretini sürdürmek, Macar naibi Hunyadi Yanoş ise sınırda soluklanmak istiyor. ' +
      'Antlaşmalar yenilenirse, şehir kuşatıldığında Tuna’dan ve denizden gelecek bir Haçlı yardımı gecikir. ' +
      'Ama her elçilik hediye ister, her imza da tutulması gereken bir sözdür.',
    tarihte:
      'Venedik ile antlaşma Eylül 1451’de yenilendi; Hunyadi ile üç yıllık bir ateşkes Kasım 1451’de imzalandı (tarihler doğrulanacak). ' +
      'Kuşatma yılında ne Venedik ne de Macaristan zamanında büyük bir kuvvet gönderebildi.',
    sources: ['inalcik', 'tansel', 'emecen'],
    choices: [
      {
        id: 'ikisi',
        label: 'İki antlaşmayı da onayla',
        desc: 'Haçlı yardımı belirgin şekilde gecikir.',
        tarihi: true,
        requires: { akce: 2500 },
        fx: { flags: { [FLAG.macarAteskes]: true, [FLAG.venedikAntlasma]: true } },
      },
      {
        id: 'macar',
        label: 'Yalnızca Macar ateşkesini yenile',
        desc: 'Tuna yatışır; Venedik serbest kalır.',
        requires: { akce: 1200 },
        fx: { flags: { [FLAG.macarAteskes]: true } },
      },
      {
        id: 'hicbiri',
        label: 'Hediye yok, söz yok',
        desc: 'Hazine korunur; yardım daha erken gelebilir.',
        fx: { divan: 5 },
      },
    ],
    historical: (s) => {
      s.flags[FLAG.macarAteskes] = true;
      s.flags[FLAG.venedikAntlasma] = true;
    },
  }),

  // ───────────────────────────── H3 ─────────────────────────────
  ev({
    id: 'h3-hisar-temel',
    code: 'H3',
    title: 'Boğazkesen’in temeli atılıyor',
    dateLabel: 'Nisan 1452',
    kind: 'sabit',
    pause: true,
    earliestDay: d(15, 4, 1452),
    historicalDay: d(15, 4, 1452),
    phases: ['hazirlik'],
    image: IMG.hisar,
    focus: 'rumeliHisari',
    text:
      'Sultan, Boğaz’ın en dar yerinde, Anadolu Hisarı’nın tam karşısında bir hisar yaptırmaya karar verdi. ' +
      'Rumeli’nin dört bir yanından taşçılar, kireççiler ve marangozlar getirildi; işi vezirler bölüşüyor, her biri bir kuleyi kendi adamlarıyla yükseltecek. ' +
      'Bizans elçileri itiraz etti, ama boşuna. Hisar için taş, kereste ve işçi gerekiyor: Rumeli Hisarı inşaatına işçi ata.',
    tarihte:
      'İnşaat 1452 baharında başladı ve kaynakların çoğuna göre dört buçuk ay gibi kısa bir sürede, Ağustos sonunda tamamlandı. ' +
      'Üç büyük kuleyi Saruca Paşa, Çandarlı Halil Paşa ve Zağanos Paşa yaptırdı; mimarı geleneksel olarak Müslihiddin Ağa’dır. Osmanlı kaynakları hisara “Boğazkesen” der.',
    sources: ['tursun', 'apz', 'kritovulos', 'nesri', 'emecen'],
  }),
  ev({
    id: 'h3-hisar-tamam',
    code: 'H3',
    title: 'Boğazkesen tamamlandı',
    dateLabel: '31 Ağustos 1452',
    kind: 'kosullu',
    pause: true,
    historicalDay: d(31, 8, 1452),
    phases: ['hazirlik', 'yuruyus'],
    image: IMG.hisar,
    focus: 'rumeliHisari',
    condition: (s) => flag(s, FLAG.hisarTamam),
    text:
      'Hisarın son taşı yerine oturdu. Üç büyük kule, aralarındaki burçlar ve kıyıya dizilen toplar artık Boğaz’ı bir zincir gibi kesiyor. ' +
      'Karadeniz’den Kostantiniyye’ye inen buğday gemileri bundan böyle ancak Sultan’ın izniyle geçebilecek. Şehirde ekmek pahalanmaya başladı.',
    tarihte:
      'Hisar Ağustos 1452’nin sonunda bitti (31 Ağustos, doğrulanacak). Sultan ardından birkaç gün Kostantiniyye surlarının önünde dolaşıp savunmayı inceledi ve Edirne’ye döndü. ' +
      'Kıyıdaki büyük toplar Boğaz’dan geçen gemileri denetlemeye başladı.',
    sources: ['tursun', 'kritovulos', 'apz', 'emecen'],
    fireFx: { flags: { [FLAG.bogazKontrol]: true }, byzFood: -15, byzMorale: -4, morale: 5 },
    historical: (s) => {
      s.flags[FLAG.bogazKontrol] = true;
    },
  }),

  // ───────────────────────────── H4 ─────────────────────────────
  ev({
    id: 'h4-rizzo',
    code: 'H4',
    title: 'Antonio Rizzo’nun gemisi',
    dateLabel: 'Kasım 1452',
    kind: 'karar',
    earliestDay: d(20, 11, 1452),
    latestDay: d(15, 2, 1453),
    historicalDay: d(26, 11, 1452),
    phases: ['hazirlik'],
    image: IMG.rizzo,
    focus: 'rumeliHisari',
    condition: (s) => flag(s, FLAG.bogazKontrol),
    text:
      'Karadeniz’den buğday yüklemiş bir Venedik gemisi Boğazkesen’in önüne geldi. Kaptanı Antonio Rizzo, hisarın işaretlerine rağmen yelken indirmiyor, geçiş için durmuyor. ' +
      'Gemiyi geçirirsen Venedik ile arayı bozmazsın ama Boğaz üzerindeki sözün sarsılır. Batırırsan herkes Boğaz’ın kapandığını anlar; Venedik de öfkelenir.',
    tarihte:
      'Kasım 1452’nin sonunda hisarın topları Rizzo’nun gemisini batırdı. Kaptan ve tayfası yakalanıp Dimetoka’da bulunan Sultan’ın huzuruna götürüldü; Rizzo idam edildi, tayfası da öldürüldü (Doukas ve Barbaro’ya göre; ayrıntılar doğrulanacak). ' +
      'Olay Boğaz’ın kapandığını herkese gösterdi ve Venedik’te kuşatılan şehre yardım isteyenlerin sesini yükseltti.',
    sources: ['emecen', 'inalcik', 'doukas', 'barbaro'],
    choices: [
      {
        id: 'batir',
        label: 'Ateş açılsın, gemi batırılsın',
        desc: 'Boğaz kesin olarak kapanır; Venedik öfkelenir ve yardımı hızlandırmaya çalışabilir.',
        tarihi: true,
        fx: { flags: { [FLAG.rizzoKarari]: 'batir' }, morale: 3, byzMorale: -5, byzFood: -4, galata: -5 },
      },
      {
        id: 'birak',
        label: 'Uyarı atışıyla yetin, geçsin',
        desc: 'Venedik yatışır; ama şehre erzak sızmaya devam eder.',
        fx: { flags: { [FLAG.rizzoKarari]: 'birak' }, byzFood: 6, divan: -4, galata: 4 },
      },
    ],
    historical: (s) => {
      s.flags[FLAG.rizzoKarari] = 'batir';
    },
  }),

  // ───────────────────────────── H5 ─────────────────────────────
  ev({
    id: 'h5-orban',
    code: 'H5',
    title: 'Dökümcü Orban',
    dateLabel: '1452',
    kind: 'kosullu',
    pause: true,
    historicalDay: d(15, 7, 1452),
    phases: ['hazirlik'],
    image: IMG.dokum,
    condition: (s) => flag(s, FLAG.orbanGeldi),
    text:
      'Orban adında bir top dökücü usta Sultan’ın hizmetine girdi. Kendisini önce Bizans’a sunduğu, imparatorun ise istediği ücreti ödeyemediği anlatılıyor. ' +
      'Usta, dilenirse en kalın surları bile yıkacak büyüklükte bir top dökebileceğini söylüyor. Sultan onu cömertçe ödüllendirdi ve dökümhanenin kurulmasını emretti. ' +
      'Büyük top için maden, tunç ve akçe gerekiyor.',
    tarihte:
      'Orban’ın kökeni tartışmalıdır (Macar ya da Erdelli; doğrulanacak). Doukas’a göre ilk büyük topu üç ayda dökülüp Boğazkesen’e kondu. ' +
      'Osmanlı kaynakları ustanın adından çok, dökülen büyük toplardan, “şâhî” toplardan söz eder.',
    sources: ['kritovulos', 'tansel', 'emecen', 'doukas'],
    fireFx: { morale: 2 },
  }),
  ev({
    id: 'h5-deneme-atisi',
    code: 'H5',
    title: 'Edirne’de deneme atışı',
    dateLabel: 'Ocak 1453',
    kind: 'kosullu',
    pause: true,
    historicalDay: d(15, 1, 1453),
    phases: ['hazirlik', 'yuruyus'],
    image: IMG.top,
    condition: (s) => flag(s, FLAG.sahiDokuldu),
    text:
      'Dev top, sarayın önündeki meydana çekildi. Halk, korkudan düşüp bayılmasın diye bir gün önceden tellallarla uyarıldı. ' +
      'Barut ateşlendiğinde gök gürledi; kocaman taş gülle uzaklara uçtu ve düştüğü yerde toprağa gömüldü. ' +
      'Şimdi sıra en zor işte: bu canavarı Edirne’den surların önüne taşımak.',
    tarihte:
      'Doukas, deneme atışında güllenin bir milden uzağa gittiğini ve sesin çok uzaklardan duyulduğunu yazar (abartılı olabilir). ' +
      'Top Şubat’ta öküzlerin çektiği arabalarla yola çıkarıldı; yolu düzeltmek ve köprüleri sağlamlaştırmak için önden işçiler gönderildi.',
    sources: ['kritovulos', 'emecen2', 'doukas'],
    fireFx: { morale: 6, divan: 4 },
  }),

  // ───────────────────────────── H6 ─────────────────────────────
  ev({
    id: 'h6-mora',
    code: 'H6',
    title: 'Turahan Bey’in Mora seferi',
    dateLabel: 'Ekim 1452',
    kind: 'karar',
    earliestDay: d(1, 10, 1452),
    historicalDay: d(1, 10, 1452),
    phases: ['hazirlik'],
    text:
      'Mora’da imparatorun iki kardeşi, despotlar Thomas ve Demetrios hüküm sürüyor. Şehir kuşatılırsa ağabeylerine asker ve erzak yollayabilirler. ' +
      'Teselya uç beyi Turahan Bey, oğulları Ahmed ve Ömer Bey’le birlikte Mora’ya akın etmeye hazır. Ama giden her akıncı kuşatmada eksik olacak.',
    tarihte:
      '1452 sonbaharında Turahan Bey ve oğulları Mora’ya girdi; despotlar kuşatma boyunca kendi topraklarıyla uğraşmak zorunda kaldı. Mora’dan Kostantiniyye’ye yardım gelmedi.',
    sources: ['kritovulos', 'tansel', 'emecen', 'sphrantzes'],
    choices: [
      {
        id: 'gonder',
        label: 'Turahan Bey Mora’ya aksın',
        desc: 'Mora’dan yardım gelmez; akıncıların bir kısmı kuşatmaya katılamaz.',
        tarihi: true,
        fx: { flags: { [FLAG.moraSeferi]: true }, res: { erzak: -1500 }, morale: 2 },
      },
      {
        id: 'gonderme',
        label: 'Akıncılar kuşatma için kalsın',
        desc: 'Mora’dan şehre asker ve erzak gidebilir.',
      },
    ],
    historical: (s) => {
      s.flags[FLAG.moraSeferi] = true;
    },
  }),

  // ───────────────────────────── H7 ─────────────────────────────
  ev({
    id: 'h7-trakya',
    code: 'H7',
    title: 'Trakya’daki Bizans kasabaları',
    dateLabel: '1452 – 1453 kışı',
    kind: 'kosullu',
    historicalDay: d(1, 2, 1453),
    phases: ['hazirlik', 'yuruyus'],
    condition: (s) => flag(s, FLAG.trakyaAlindi),
    text:
      'Karaca Bey’in askerleri Karadeniz ve Marmara kıyısında Bizans’a bağlı kalan kasabalara yürüdü. Kimi kasaba kapılarını kendiliğinden açtı, kimi direndi. ' +
      'Şehre erzak taşıyabilecek dost limanlar birer birer kapanıyor; ordu arkasını güvene alarak ilerleyebilecek.',
    tarihte:
      'Kaynaklara göre Misivri (Mesembria), Ahyolu (Anchialos) ve Vize (Bizye) teslim oldu; Silivri (Selymbria) ile Epibatos direndi. ' +
      'Kasabaların listesi ve akıbetleri kaynaklarda farklıdır (doğrulanacak).',
    sources: ['kritovulos', 'tansel', 'emecen'],
    fireFx: { byzMorale: -3, res: { erzak: 800 }, morale: 2 },
  }),

  // ───────────────────────────── H8 ─────────────────────────────
  ev({
    id: 'h8-tasima',
    code: 'H8',
    title: 'Büyük topun yolculuğu',
    dateLabel: 'Şubat – Mart 1453',
    kind: 'kosullu',
    historicalDay: d(1, 2, 1453),
    phases: ['hazirlik', 'yuruyus'],
    image: IMG.top,
    condition: (s) =>
      s.cannons.some((c) => c.type === 'sahi' && c.status === 'yolda') || flag(s, FLAG.sahiCephede) || (flag(s, FLAG.sahiDokuldu) && flag(s, FLAG.yolaCikildi)),
    text:
      'Dev top Edirne’den yola çıktı. Yükü onlarca çift öküz çekiyor; topun iki yanında yürüyen adamlar devrilmesin diye onu dengede tutuyor. ' +
      'Önden giden marangozlar köprüleri sağlamlaştırıyor, işçiler yolu düzeltiyor.',
    variant: (s) => {
      const road = Number(s.flags[FLAG.yolHazirligi] ?? 0);
      return road < 0.4
        ? {
            text:
              'Dev top Edirne’den yola çıktı. Yükü onlarca çift öküz çekiyor; topun iki yanında yürüyen adamlar devrilmesin diye onu dengede tutuyor. ' +
              'Ama yol hazırlığı yetersiz: kafile her derede, her yokuşta saplanıyor. Yolu düzeltecek işçi göndermek topu surlara çok daha erken ulaştırır.',
          }
        : {
            text:
              'Dev top Edirne’den yola çıktı. Yükü onlarca çift öküz çekiyor; topun iki yanında yürüyen adamlar devrilmesin diye onu dengede tutuyor. ' +
              'Önceden düzeltilen yol ve sağlamlaştırılan köprüler sayesinde kafile beklenenden hızlı ilerliyor.',
          };
    },
    tarihte:
      'Doukas’a göre topu otuz araba ve altmış öküz taşıdı; iki yüz kişi onu dengede tutmak için yanında yürüdü, elli marangoz ve iki yüz işçi yolu ve köprüleri hazırladı. ' +
      'Edirne ile şehir arasındaki yolculuk yaklaşık iki ay sürdü (doğrulanacak).',
    sources: ['emecen2', 'doukas'],
    fireFx: { morale: 2 },
  }),

  // ───────────────────────────── H9 ─────────────────────────────
  ev({
    id: 'h9-ordu',
    code: 'H9',
    title: 'Ordunun toplanması',
    dateLabel: '1452 – 1453 kışı',
    kind: 'kosullu',
    earliestDay: d(10, 1, 1453),
    historicalDay: d(1, 3, 1453),
    phases: ['hazirlik'],
    condition: (s) => totalMen(s) >= 25000 || s.time.day >= d(1, 3, 1453),
    text:
      'Rumeli ve Anadolu’daki tımarlı sipahilere sefer çağrısı ulaştı. Kapıkulu askerleri, yeniçeriler ve topçular Edirne’de toplanıyor; ' +
      'uç beylerinin akıncıları, gönüllüler ve dervişler de ordunun peşine takılıyor. Her asker her gün ekmek ister: erzak kafilelerini ihmal etme.',
    tarihte:
      'Ordunun büyüklüğü kaynaklarda çok farklı verilir; Batılı tanıklar yüz binleri aşan sayılar yazar, modern araştırmalar savaşan askerlerin 60–80 bin civarında olduğunu düşünür (doğrulanacak). ' +
      'Yeniçerilerin sayısı birkaç bin kadardı.',
    sources: ['tursun', 'kritovulos', 'inalcik', 'emecen'],
    fireFx: { morale: 3 },
  }),

  // ───────────────────────────── H10 ─────────────────────────────
  ev({
    id: 'h10-hareket',
    code: 'H10',
    title: 'Edirne’den hareket',
    dateLabel: '23 Mart 1453',
    kind: 'karar',
    earliestDay: d(23, 3, 1453),
    historicalDay: d(23, 3, 1453),
    phases: ['hazirlik'],
    image: IMG.ordu,
    condition: (s) => !flag(s, FLAG.yolaCikildi),
    text:
      'Bahar geldi. Sultan’ın otağı Edirne dışında kuruldu, ordu yürüyüşe hazır. Tarihte ordu bugün, 23 Mart 1453 Cuma günü yola çıktı. ' +
      'Erken çıkmak Haçlı yardımına karşı zaman kazandırır; beklemek ise daha çok asker, top ve erzakla yola çıkmak demektir.',
    tarihte:
      'Ordu 23 Mart’ta Edirne’den çıktı; öncü birlikler Nisan başında şehrin önüne geldi. Sultan 5 Nisan’da vardı ve kuşatma 6 Nisan’da başladı.',
    sources: ['tursun', 'kritovulos', 'emecen'],
    choices: [
      { id: 'yola-cik', label: 'Yola çık', desc: 'Ordu on üç günde surların önüne varır.', tarihi: true },
      { id: 'bekle', label: 'Hazırlığa devam et', desc: 'Her gecikme günü, yardımın yetişme ihtimalini artırır.' },
    ],
    choose: (s, choiceId) => {
      if (choiceId !== 'yola-cik') return;
      // The march itself is core-owned: queue the regular command (applied next frame).
      store.dispatch({ t: 'yola-cik' });
      // The informational "Ordu yolda" card would be redundant now.
      s.events.fired['h10-yolda'] = s.time.day;
      priv(s).vars['h10'] = 'kart';
    },
  }),
  ev({
    id: 'h10-yolda',
    code: 'H10',
    title: 'Ordu yolda',
    dateLabel: 'Mart – Nisan 1453',
    kind: 'kosullu',
    pause: false,
    historicalDay: d(23, 3, 1453),
    phases: ['yuruyus'],
    condition: (s) => flag(s, FLAG.yolaCikildi),
    text:
      'Ordu Edirne’den çıktı. Önde akıncılar ve öncüler, ardından sancak sancak tımarlı sipahiler, ortada Sultan’ın kapıkulu askerleri ve yeniçeriler yürüyor. ' +
      'Yol üstündeki Bizans köyleri kapılarını açıyor. On üç gün sonra surlar görünecek.',
    tarihte: 'Ordu 23 Mart 1453’te Edirne’den çıktı ve Nisan’ın ilk günlerinde şehrin önüne vardı.',
    sources: ['tursun', 'kritovulos'],
  }),
];
