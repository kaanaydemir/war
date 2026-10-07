import { d } from '../../core/calendar';
import { FLAG } from '../../core/flags';
import { addLog, type GameState } from '../../core/state';
import { ev, IMG } from './build';
import { applyEffects, flag, priv, resolveProbe, siegeDay } from './effects';
import type { EventDefX } from './types';

const inSiege = (s: GameState): boolean => flag(s, FLAG.kusatmaBasladi) && !flag(s, FLAG.sehirDustu);

/** After a scripted probe: morale consequences + remembered result for the card. */
function probeAftermath(s: GameState, id: string, success: boolean): void {
  priv(s).vars[id] = success ? 'basari' : 'puskurtuldu';
  if (success) applyEffects(s, { byzMorale: -6, morale: 4 });
  else applyEffects(s, { byzMorale: 4, morale: -3, intel: 5 });
}

/**
 * KUŞATMA (6 Nisan – 29 Mayıs 1453): design events K1–K19.
 */
export const KUSATMA_EVENTS: EventDefX[] = [
  // ───────────────────────────── K1 ─────────────────────────────
  ev({
    id: 'k1-ordu-surlarda',
    code: 'K1',
    title: 'Ordu surların önünde',
    dateLabel: '6 Nisan 1453',
    kind: 'sabit',
    pause: true,
    historicalDay: d(6, 4, 1453),
    phases: ['kusatma'],
    image: IMG.ordu,
    focus: 'otag',
    condition: (s) => flag(s, FLAG.kusatmaBasladi),
    text:
      'Sultan’ın kırmızı otağı Topkapı’nın karşısındaki tepeye, Maltepe’ye kuruldu. Karaca Paşa’nın Rumeli askerleri sol kanatta Haliç’e kadar, İshak Paşa’nın Anadolu askerleri sağ kanatta Marmara’ya kadar yerleşti; ' +
      'Zağanos Paşa Galata’nın arkasındaki sırtları tuttu. Donanma Beşiktaş’ta, Çifte Sütunlar önüne demirledi. Haliç’in ağzına ise kalın bir zincir gerilmiş.',
    tarihte:
      'Kuşatma 6 Nisan 1453 Cuma günü başladı. Bizanslılar Haliç zincirini birkaç gün önce germişti (2 Nisan, doğrulanacak). Kuşatma 53 gün sürecekti.',
    sources: ['tursun', 'kritovulos', 'apz', 'emecen'],
    fireFx: { morale: 5, byzMorale: -3 },
  }),

  // ───────────────────────────── K2 ─────────────────────────────
  ev({
    id: 'k2-dis-kaleler',
    code: 'K2',
    title: 'Tarabya, Studios ve Büyükada',
    dateLabel: 'Nisan’ın ilk haftası',
    kind: 'karar',
    earliestDay: d(7, 4, 1453),
    historicalDay: d(9, 4, 1453),
    minSiegeDay: 3,
    phases: ['kusatma'],
    condition: inSiege,
    text:
      'Surların dışında Bizans’a bağlı birkaç küçük hisar hâlâ direniyor: Boğaz kıyısında Tarabya, Marmara kıyısında Studios köyündeki hisar ve Adalar’da Büyükada’nın kulesi. ' +
      'Arkada düşman bırakmak ikmal yollarını tehlikeye atar. Birkaç top ve bir miktar barutla bu kaleler birkaç günde düşürülebilir.',
    tarihte:
      'Kritovoulos’a göre Sultan, Tarabya ve Studios’taki hisarları toplarla dövdürüp aldı; Baltaoğlu donanmayla Büyükada’daki kuleyi kuşattı ve kule ateşe verilince savunanlar teslim oldu. ' +
      'Teslim olanlar ağır biçimde cezalandırıldı (ayrıntılar doğrulanacak).',
    sources: ['kritovulos', 'emecen'],
    choices: [
      {
        id: 'al',
        label: 'Kaleleri düşür',
        desc: 'İkmal yolları güvene alınır, şehir dış dünyadan biraz daha kopar.',
        tarihi: true,
        requires: { barut: 20 },
        fx: { morale: 4, byzMorale: -3, intel: 4 },
      },
      { id: 'birak', label: 'Gözetim altında bırak', desc: 'Barut korunur; ama arkada düşman kalır.', fx: { morale: -2 } },
    ],
  }),

  // ───────────────────────────── K3 ─────────────────────────────
  ev({
    id: 'k3-bombardiman',
    code: 'K3',
    title: 'Ağır bombardıman başlıyor',
    dateLabel: 'Nisan 1453',
    kind: 'kosullu',
    pause: true,
    historicalDay: d(12, 4, 1453),
    phases: ['kusatma'],
    image: IMG.top,
    focus: 'topkapi',
    condition: (s) => inSiege(s) && flag(s, FLAG.sahiCephede),
    text:
      'Büyük top Topkapı karşısındaki mevzisine yerleşti; çevresine daha küçük toplar dizildi. İlk gülle surlara çarptığında yer sarsıldı, taş ve tuğla parçaları hendeğe yağdı. ' +
      'Bin yıldır ayakta duran Theodosius surları artık her gün dövülecek; Bizanslılar ise her gece gedikleri kapatmaya çalışacak.',
    tarihte:
      'Osmanlı kaynakları büyük topların surlarda açtığı gediklerden övgüyle söz eder. Bombardıman Nisan’ın ilk haftalarında başladı ve kuşatma boyunca sürdü (en ağır atışların başlangıcı için 12 Nisan verilir, doğrulanacak). ' +
      'Büyük top ısındığı için günde ancak birkaç kez ateşlenebiliyordu.',
    sources: ['tursun', 'kritovulos', 'apz', 'barbaro'],
    fireFx: { byzMorale: -4, morale: 3 },
  }),

  // ───────────────────────────── K4 ─────────────────────────────
  ev({
    id: 'k4-gece-hucumu',
    code: 'K4',
    title: 'Lykos vadisine gece hücumu',
    dateLabel: '18 Nisan 1453',
    kind: 'karar',
    earliestDay: d(18, 4, 1453),
    historicalDay: d(18, 4, 1453),
    minSiegeDay: 8,
    phases: ['kusatma'],
    focus: 'sulukule',
    condition: inSiege,
    text:
      'Mesoteikhion’da, Lykos deresinin şehre girdiği alçak vadide dış sur yer yer yıkıldı. Savunucular geceleri gedikleri kazıklarla, toprak dolu fıçılarla ve çalı demetleriyle kapatıyor. ' +
      'Paşalar, gün batımından sonra yapılacak büyük bir hücumla bu barikatların yoklanmasını öneriyor.',
    variant: (s) => {
      const r = priv(s).vars['k4-gece-hucumu'];
      if (r === 'basari') return { tarihte: 'Bu kez hücum savunmayı sarstı. Tarihte ise 18 Nisan gecesi dört saat kadar süren hücum püskürtülmüştü.' };
      return null;
    },
    tarihte:
      '18 Nisan gecesi Lykos vadisinde dört saat kadar süren büyük bir hücum yapıldı ve püskürtüldü. Barbaro Osmanlı kayıplarını yüksek, savunucularınkini çok düşük gösterir (doğrulanacak).',
    sources: ['kritovulos', 'emecen', 'barbaro'],
    choices: [
      {
        id: 'hucum',
        label: 'Gece hücumu',
        desc: 'Sonuç gediğin genişliğine ve savunmanın moraline bağlıdır. Başarısızlık Bizans’a cesaret verir, ama savunmayı tanırız.',
        tarihi: true,
      },
      { id: 'bekle', label: 'Bombardımanı sürdür', desc: 'Kayıp yok; ama Divan sabırsızlanır.', fx: { divan: -2 } },
    ],
    choose: (s, c, ctx) => {
      if (c !== 'hucum') return;
      const r = resolveProbe(s, ctx, 'kara-lykos', 1);
      probeAftermath(s, 'k4-gece-hucumu', r.success);
    },
  }),

  // ───────────────────────────── K5 ─────────────────────────────
  ev({
    id: 'k5-deniz-savasi',
    code: 'K5',
    title: 'Ablukayı yaran gemiler',
    dateLabel: '20 Nisan 1453',
    kind: 'tepkisel',
    pause: true,
    historicalDay: d(20, 4, 1453),
    phases: ['kusatma'],
    image: IMG.deniz,
    focus: 'akropolis',
    condition: (s) => !!s.flags[FLAG.denizSavasi],
    text:
      'Üç Ceneviz gemisi ve imparatorun tuttuğu bir buğday gemisi, güneyden esen rüzgârla Marmara’dan çıkageldi. Baltaoğlu Süleyman Bey’in kadırgaları yüksek bordalı gemileri sardı, ' +
      'ama oklar ve taşlar yukarıdan yağdı, kancalar tutmadı. Kıyıdan savaşı izleyen Sultan atını denize sürdü. Akşama doğru rüzgâr yeniden esti ve gemiler zincirin ardına, Haliç’e girdi.',
    variant: (s) =>
      s.flags[FLAG.denizSavasi] === 'durduruldu'
        ? {
            title: 'Deniz savaşı: gemiler durduruldu',
            text:
              'Üç Ceneviz gemisi ve imparatorun buğday gemisi Marmara’dan çıkageldi. Bu kez kadırgalar gemileri rüzgârın kesildiği anda yakaladı; kancalar tuttu, güvertelere çıkıldı. ' +
              'Kıyıdaki ordu sevinç çığlıklarıyla çınladı: şehrin beklediği buğday ve asker Haliç’e ulaşamadı.',
            fx: { byzMorale: -8, morale: 8, divan: 6 },
          }
        : { fx: { byzMorale: 8, morale: -6, divan: -8, byzFood: 6 } },
    fire: (s) => {
      if (s.flags[FLAG.denizSavasi] !== 'durduruldu') addLog(s, 'uyari', 'Baltaoğlu Süleyman Bey görevden alındı; donanmanın başına Hamza Bey getirildi.');
    },
    tarihte:
      '20 Nisan’da dört gemi ablukayı yarıp Haliç’e girdi; bu, kuşatmanın en ağır Osmanlı başarısızlığıydı. Sultan’ın atını denize sürdüğü anlatılır. ' +
      'Baltaoğlu Süleyman Bey görevden alındı ve yerine Hamza Bey getirildi (ayrıntılar doğrulanacak).',
    sources: ['kritovulos', 'tursun', 'emecen', 'barbaro'],
  }),

  // ───────────────────────────── K6 ─────────────────────────────
  ev({
    id: 'k6-aksemseddin',
    code: 'K6',
    title: 'Akşemseddin’in mektubu',
    dateLabel: '20 Nisan’dan sonra',
    kind: 'sabit',
    pause: true,
    earliestDay: d(21, 4, 1453),
    historicalDay: d(21, 4, 1453),
    phases: ['kusatma'],
    image: IMG.mektup,
    focus: 'otag',
    condition: inSiege,
    text:
      'Ordugâhta bulunan şeyh Akşemseddin, Sultan’a bir mektup gönderdi. Deniz yenilgisinin askerler arasında üzüntüye ve dedikoduya yol açtığını, emirlerin gereğince yerine getirilmediğinin konuşulduğunu yazıyor. ' +
      'Sultan’a, gevşeklik gösterenleri cezalandırmasını, yiğitlik gösterenleri ödüllendirmesini, kararlı ve sabırlı olmasını öğütlüyor; duasının ordu ile olduğunu bildiriyor.',
    variant: (s) =>
      s.flags[FLAG.denizSavasi] === 'durduruldu'
        ? {
            text:
              'Ordugâhta bulunan şeyh Akşemseddin Sultan’a bir mektup gönderdi. Gerçek mektup bir yenilginin ardından yazılmıştı; senin donanman ise ablukayı tuttu. ' +
              'Yine de şeyhin öğüdü değişmiyor: zaferle gevşememek, gevşeklik gösterenleri cezalandırmak, yiğitleri ödüllendirmek, kararlı ve sabırlı olmak.',
          }
        : null,
    tarihte:
      'Akşemseddin’in kuşatma sırasında yazdığı mektup Topkapı Sarayı Arşivi’nde korunur ve Halil İnalcık tarafından yayımlanmıştır (doğrulanacak). ' +
      '20 Nisan yenilgisinin ordugâhta yarattığı sarsıntıyı ve Sultan’ın çevresindeki tartışmaları gösteren ender bir iç belgedir. Buradaki metin bir özettir, alıntı değildir.',
    sources: ['aksemseddin', 'inalcik', 'emecen'],
    fireFx: { morale: 8, divan: 6 },
  }),

  // ───────────────────────────── K7 ─────────────────────────────
  ev({
    id: 'k7-gemiler-karadan',
    code: 'K7',
    title: 'Gemiler karadan Haliç’e',
    dateLabel: '22 Nisan 1453',
    kind: 'kosullu',
    pause: true,
    historicalDay: d(22, 4, 1453),
    phases: ['kusatma'],
    image: IMG.gemiler,
    focus: 'kasimpasa',
    condition: (s) => flag(s, FLAG.gemilerKaradan),
    text:
      'Gece boyunca Beşiktaş’tan Kasımpaşa’ya uzanan sırtlara kızaklar döşendi, kalaslar don yağıyla yağlandı. Öküzler ve yüzlerce adam, yelkenleri açık, kürekçileri yerinde kadırgaları tepeden aşırdı; ' +
      'davullar ve borular sesleri bastırdı. Sabah Bizanslılar, zincirin ardındaki Haliç’te yetmiş kadar Osmanlı gemisini gördü.',
    tarihte:
      '22 Nisan 1453’te (21’i 22’ye bağlayan gece) yaklaşık 70 gemi karadan Haliç’e indirildi; sayı kaynaklara göre 67 ile 72 arasında değişir. ' +
      'Bu hamle Bizans’ı Haliç surlarına asker ayırmaya zorladı ve kara surlarını zayıflattı. Osmanlı kaynakları olayı Sultan’ın tedbiri olarak över.',
    sources: ['tursun', 'kritovulos', 'apz', 'emecen', 'barbaro'],
    fireFx: { byzMorale: -10, morale: 8, divan: 6 },
  }),

  // ───────────────────────────── K8 ─────────────────────────────
  ev({
    id: 'k8-yakma-baskini',
    code: 'K8',
    title: 'Haliç’te gece baskını',
    dateLabel: '28 Nisan 1453',
    kind: 'tepkisel',
    pause: true,
    earliestDay: d(28, 4, 1453),
    latestDay: d(25, 5, 1453),
    historicalDay: d(28, 4, 1453),
    phases: ['kusatma'],
    focus: 'kasimpasa',
    condition: (s) => inSiege(s) && flag(s, FLAG.gemilerKaradan) && s.time.day >= (s.events.fired['k7-gemiler-karadan'] ?? s.time.day) + 3,
    fire: (s, ctx) => {
      const warned = s.galata >= 0 || s.byz.intel >= 40;
      priv(s).vars['k8-yakma-baskini'] = warned ? 'uyarildi' : 'baskin';
      if (warned) return;
      // surprise: some of our ships in the Golden Horn burn
      const inHorn = s.ships.filter((sh) => sh.side === 'osmanli' && sh.status !== 'batik' && ctx.world.regionAt(Math.round(sh.tx), Math.round(sh.ty)) === 'halic');
      const n = Math.min(inHorn.length, ctx.rng.int(1, 3));
      for (let i = 0; i < n; i++) {
        const sh = inHorn[ctx.rng.int(0, inHorn.length - 1)];
        sh.hp = Math.max(1, Math.round(sh.hp - sh.hpMax * ctx.rng.range(0.4, 0.7)));
        ctx.bus.emit('ship:burning', { shipId: sh.id, at: { tx: sh.tx, ty: sh.ty } });
      }
    },
    variant: (s) =>
      priv(s).vars['k8-yakma-baskini'] === 'baskin'
        ? {
            text:
              'Karanlıkta yaklaşan Venedik kadırgaları ve yanıcı maddelerle dolu gemiler, Haliç’te demirli gemilerimize saldırdı. Alevler direklere sardı, tayfalar suya atladı. ' +
              'Topçular sonunda saldırganları geri püskürttü, ama birkaç gemimiz ağır yara aldı. Galata’dan haber gelseydi bu baskın önceden bilinirdi.',
            fx: { morale: -5, byzMorale: 4 },
          }
        : {
            text:
              'Gece yarısından önce Galata’dan gelen bir haberci uyardı: Venedikliler Haliç’teki gemilerimizi yakmak için hazırlanıyor. Topçular kıyıda bekledi. ' +
              'Şafak sökerken Venedik kadırgaları sessizce yaklaştığında ilk gülle öndeki kadırgayı ortasından vurdu; gemi kısa sürede battı, ötekiler geri çekildi.',
            fx: { byzMorale: -6, morale: 4 },
          },
    text: 'Venedikliler Haliç’teki gemilerimizi yakmak için bir gece baskını hazırlıyor.',
    tarihte:
      '28 Nisan şafağında Giacomo Coco komutasındaki Venedik baskını, önceden haber alan Osmanlı topçularınca karşılandı; Coco’nun kadırgası batırıldı. Haberin Galata’dan sızdığı söylenir (doğrulanacak). ' +
      'Esir düşen denizciler surların önünde idam edildi; Bizans da elindeki Türk esirlerini surlarda öldürerek karşılık verdi.',
    sources: ['kritovulos', 'emecen', 'barbaro', 'leonardo'],
  }),

  // ───────────────────────────── K9 ─────────────────────────────
  ev({
    id: 'k9-halic-koprusu',
    code: 'K9',
    title: 'Haliç’e fıçılardan köprü',
    dateLabel: 'Nisan sonu – Mayıs 1453',
    kind: 'kosullu',
    pause: true,
    historicalDay: d(19, 5, 1453),
    phases: ['kusatma'],
    focus: 'ayvansaray',
    condition: (s) => inSiege(s) && flag(s, FLAG.halicKoprusu),
    text:
      'Zağanos Paşa’nın adamları yan yana bağlanmış yüzlerce fıçının üstüne kalaslar çaktı. Kasımpaşa kıyısından Ayvansaray’a doğru uzanan bu yüzen yol, askerlerin Haliç’i yürüyerek geçmesini sağlıyor; ' +
      'üzerine konan toplar Haliç surlarını yakından dövebiliyor. Bizans artık iki cepheyi birden savunmak zorunda.',
    tarihte:
      'Kritovoulos köprünün fıçılar üzerine kurulduğunu ve üstünde top taşındığını anlatır. Köprünün tamamlanma tarihi kaynaklarda farklıdır (Mayıs ortası, doğrulanacak).',
    sources: ['kritovulos', 'emecen', 'barbaro'],
    fireFx: { byzMorale: -4, morale: 3 },
  }),

  // ───────────────────────────── K10 ─────────────────────────────
  ev({
    id: 'k10-ara-hucum',
    code: 'K10',
    title: 'Ara hücumlar',
    dateLabel: 'Mayıs 1453',
    kind: 'karar',
    earliestDay: d(7, 5, 1453),
    historicalDay: d(7, 5, 1453),
    minSiegeDay: 16,
    phases: ['kusatma'],
    focus: 'sulukule',
    condition: inSiege,
    text:
      'Bombardıman sürüyor; Lykos vadisinde ve Blahernai’de surlar ağır yara aldı. Paşalar savunmayı yıpratmak için yeni bir yoklama hücumu öneriyor. ' +
      'Her hücum savunucuları yorar ama ordudan da can alır; başarısız bir hücum ise Bizans’a cesaret verir.',
    tarihte:
      'Mayıs boyunca birkaç büyük hücum yapıldı: 7 Mayıs gecesi Lykos vadisinde, 12 Mayıs’ta Blahernai’de (Barbaro). Hepsi püskürtüldü, ama savunucuların sayısı ve gücü günden güne eridi.',
    sources: ['kritovulos', 'emecen', 'barbaro'],
    choices: [
      { id: 'lykos', label: 'Lykos vadisine hücum', desc: 'En çok dövülen kesim; savunmanın kalbi de orada.', tarihi: true },
      { id: 'blahernai', label: 'Blahernai’ye hücum', desc: 'Tek kat sur, hendek yok; ama tepede ve iyi savunuluyor.' },
      { id: 'bekle', label: 'Bekle, bombardımana devam', desc: 'Kayıp yok; Divan sabırsızlanır.', fx: { divan: -2 } },
    ],
    choose: (s, c, ctx) => {
      if (c === 'bekle') return;
      const r = resolveProbe(s, ctx, c === 'lykos' ? 'kara-lykos' : 'kara-blahernai', 0.9);
      probeAftermath(s, 'k10-ara-hucum', r.success);
    },
  }),

  // ───────────────────────────── K11 ─────────────────────────────
  ev({
    id: 'k11-lagimlar',
    code: 'K11',
    title: 'Lağımcılar sur altında',
    dateLabel: 'Mayıs 1453',
    kind: 'kosullu',
    pause: true,
    historicalDay: d(16, 5, 1453),
    phases: ['kusatma'],
    image: IMG.lagim,
    focus: 'egrikapi',
    condition: (s) => inSiege(s) && flag(s, FLAG.lagimBasladi),
    text:
      'Zağanos Paşa’nın emrindeki lağımcılar, madenlerde yetişmiş ustalar, surların altına doğru dar tüneller kazmaya başladı. Tüneller kalaslarla destekleniyor; vakti gelince destekler yakılıp üstteki sur çökertilecek. ' +
      'Ama karşı tarafta da toprağı dinleyen kulaklar var.',
    tarihte:
      'Lağımlar en çok hendeği olmayan Blahernai kesiminde kazıldı. Lağımcıların bir kısmının Sırp maden ustaları (Novo Brdo) olduğu yazılır (doğrulanacak). ' +
      'İlk tünel 16 Mayıs’ta fark edildi; Mayıs sonuna kadar on dörde yakın tünel açığa çıkarıldı (doğrulanacak).',
    sources: ['kritovulos', 'emecen', 'barbaro', 'sphrantzes'],
    fireFx: { morale: 2 },
  }),
  ev({
    id: 'k11-karsi-lagim',
    code: 'K11',
    title: 'Karşı lağım: Johannes Grant',
    dateLabel: 'Mayıs 1453',
    kind: 'tepkisel',
    pause: false,
    historicalDay: d(16, 5, 1453),
    phases: ['kusatma'],
    image: IMG.lagim,
    focus: 'egrikapi',
    condition: (s) => inSiege(s) && s.mines.some((m) => m.detected || m.status === 'cokertildi'),
    text:
      'Surların ardında Johannes Grant adında bir mühendis, kazma seslerini dinletip tünellerimizi arıyor. Bir tünelimiz bulundu: karşıdan kazılan bir dehlizle üstümüze çıktılar, ' +
      'desteklere ateş verip içerideki lağımcılara duman saldılar. Tüneller artık daha derinden ve daha sessiz kazılmalı.',
    tarihte:
      'Sphrantzes’e göre karşı lağımları Johannes Grant yönetti; “Alaman” diye anılsa da bazı araştırmacılar onun İskoç olabileceğini düşünür (doğrulanacak). ' +
      'Bulunan tünellerin çoğu çökertildi ya da içine duman ve ateş verildi.',
    sources: ['emecen', 'sphrantzes', 'barbaro'],
    fireFx: { morale: -2, byzMorale: 2 },
  }),

  // ───────────────────────────── K12 ─────────────────────────────
  ev({
    id: 'k12-kusatma-kulesi',
    code: 'K12',
    title: 'Kuşatma kulesi',
    dateLabel: 'Mayıs 1453',
    kind: 'kosullu',
    pause: true,
    historicalDay: d(18, 5, 1453),
    phases: ['kusatma'],
    image: IMG.kule,
    focus: 'topkapi',
    condition: (s) => inSiege(s) && flag(s, FLAG.kuleYapildi),
    text:
      'Bir gecede, surların karşısında tahtadan dev bir kule yükseldi. Dışı ıslak öküz derileriyle kaplı, içinde merdivenler ve okçular var; önündeki hendek toprak ve çalıyla dolduruluyor. ' +
      'Bizanslılar sabah kalktıklarında kuleyi surlarının dibinde gördü.',
    tarihte:
      'Barbaro, 18 Mayıs sabahı Romanos kapısı yakınında bir gecede kurulmuş büyük bir kule görüldüğünü yazar (doğrulanacak). Kule savunucuların gece çıkışıyla yakıldı.',
    sources: ['kritovulos', 'emecen', 'barbaro'],
    fireFx: { morale: 3, byzMorale: -3 },
  }),
  ev({
    id: 'k12-kule-yandi',
    code: 'K12',
    title: 'Kule yakıldı',
    dateLabel: 'Mayıs 1453',
    kind: 'tepkisel',
    pause: false,
    historicalDay: d(19, 5, 1453),
    phases: ['kusatma'],
    image: IMG.kule,
    focus: 'topkapi',
    condition: (s) => inSiege(s) && flag(s, FLAG.kuleYandi),
    text:
      'Gece karanlığında surlardan çıkan bir bölük barut fıçılarını kulenin dibine yuvarladı. Patlamanın ardından alevler kuleyi sardı ve tahtadan dev yapı sabaha kadar yandı. ' +
      'Bizanslılar hendeği yeniden boşaltmaya koyuldu.',
    tarihte: 'Barbaro’ya göre kule, kurulduğu günün gecesinde savunucuların çıkışıyla yakıldı (doğrulanacak).',
    sources: ['emecen', 'barbaro'],
    fireFx: { morale: -3, byzMorale: 3 },
  }),

  // ───────────────────────────── K13 ─────────────────────────────
  ev({
    id: 'k13-teslim-teklifi',
    code: 'K13',
    title: 'Son teslim çağrısı',
    dateLabel: 'Mayıs’ın son haftası',
    kind: 'sabit',
    pause: true,
    earliestDay: d(21, 5, 1453),
    historicalDay: d(21, 5, 1453),
    phases: ['kusatma'],
    image: IMG.divan,
    condition: inSiege,
    text:
      'Sultan, son bir kez şehre elçi gönderdi. Teklif açık: şehir kapılarını açarsa halkın canı ve malı bağışlanacak; imparator dilediği yere, Mora’ya gidip orada hüküm sürebilecek. ' +
      'İmparator Konstantinos’un cevabı da açık oldu: şehri teslim etmek ne onun ne de şehirde yaşayan herhangi birinin elindedir; hepsi canlarını vermeye hazırdır.',
    tarihte:
      'Teslim çağrısını İsfendiyaroğlu İsmail Bey’in götürdüğü anlatılır (doğrulanacak). Teslim olan şehre aman verilir, direnen şehir ise kılıçla alınırdı. ' +
      'Konstantinos teklifi reddetti; cevabını Doukas aktarır (burada özetlenmiştir).',
    sources: ['kritovulos', 'emecen', 'doukas'],
    fireFx: { flags: { [FLAG.teslimTeklifi]: true }, divan: 5, byzMorale: 2 },
    historical: (s) => {
      s.flags[FLAG.teslimTeklifi] = true;
    },
  }),

  // ───────────────────────────── K14 ─────────────────────────────
  ev({
    id: 'k14-ay-tutulmasi',
    code: 'K14',
    title: 'Ay tutulması',
    dateLabel: '22 Mayıs 1453',
    kind: 'sabit',
    pause: true,
    earliestDay: d(22, 5, 1453) + 0.6,
    historicalDay: d(22, 5, 1453),
    phases: ['kusatma'],
    image: IMG.tutulma,
    focus: 'ayasofya',
    condition: inSiege,
    text:
      'Akşam karanlığında dolunay doğdu, ama yüzünün büyük kısmı karanlık içindeydi. Şehirde eski bir kehanet dilden dile dolaşıyor: Kostantiniyye, ay büyürken asla düşmeyecek. ' +
      'Surlarda bekleyenler, kararan aya bakıp dua ediyor. Saatler sonra ay yeniden ağardığında bile şehirdeki korku dağılmadı.',
    tarihte:
      '22 Mayıs 1453 akşamı İstanbul’da kısmi bir ay tutulması görüldü (astronomik hesapla doğrulanabilir). Bizans tanıkları bunu kötü bir alamet saydı; ' +
      'ay büyürken şehrin düşmeyeceğine dair kehanet Barbaro’nun günlüğünde geçer.',
    sources: ['emecen2', 'barbaro'],
    fireFx: { byzMorale: -12, morale: 2 },
  }),

  // ───────────────────────────── K15 ─────────────────────────────
  ev({
    id: 'k15-esirler',
    code: 'K15',
    title: 'Ele verilen tüneller, eli boş dönen gemi',
    dateLabel: '23 Mayıs 1453',
    kind: 'tepkisel',
    pause: false,
    earliestDay: d(23, 5, 1453) + 0.2,
    historicalDay: d(23, 5, 1453),
    phases: ['kusatma'],
    condition: inSiege,
    fire: (s, ctx) => {
      let n = 0;
      for (const m of s.mines) {
        if ((m.status === 'kaziliyor' || m.status === 'hazir') && !m.detected) {
          m.detected = true;
          n++;
          ctx.bus.emit('mine:detected', { mineId: m.id, sectionId: m.sectionId });
        }
      }
      priv(s).vars['k15-esirler'] = n;
    },
    variant: (s) =>
      Number(priv(s).vars['k15-esirler'] ?? 0) > 0
        ? {
            pause: true,
            text:
              'Karşı lağımda yakalanan iki lağımcı subayımız işkenceye dayanamadı ve öteki tünellerin yerlerini söyledi. Bizanslılar bütün tünellerimizi tek tek bulup dumanla ve ateşle dolduruyor. ' +
              'Aynı gün Ege’de Venedik filosunu aramaya giden küçük bir gemi şehre eli boş döndü: ufukta yardım yok.',
            fx: { morale: -4 },
          }
        : null,
    text:
      'Bizanslıların Ege’ye yolladığı küçük bir gemi, haftalar sonra şehre eli boş döndü: Venedik filosundan ve Haçlı yardımından hiçbir iz yok. ' +
      'Kaçaklara göre haber şehirde moral bozdu, ama surlardakiler yerlerini bırakmadı.',
    tarihte:
      '23 Mayıs’ta karşı lağımda yakalanan Osmanlı subaylarının tünellerin yerini ele verdiği ve tünellerin hepsinin yok edildiği anlatılır (doğrulanacak). ' +
      'Aynı gün, Mayıs başında yardım filosunu aramaya giden Venedik brigantini eli boş döndü.',
    sources: ['emecen', 'barbaro', 'sphrantzes'],
    fireFx: { byzMorale: -5 },
  }),

  // ───────────────────────────── K16 ─────────────────────────────
  ev({
    id: 'k16-isaretler',
    code: 'K16',
    title: 'Surların ardından haberler',
    dateLabel: '24 – 25 Mayıs 1453',
    kind: 'sabit',
    pause: true,
    earliestDay: d(24, 5, 1453) + 0.42,
    historicalDay: d(24, 5, 1453),
    phases: ['kusatma'],
    image: IMG.dolu,
    focus: 'ayasofya',
    condition: inSiege,
    text:
      'Kaçaklar ve Galata’dan gelen tüccarlar tuhaf şeyler anlatıyor. Şehrin koruyucusu sayılan Meryem ikonası alayla sokaklarda dolaştırılırken taşıyanların elinden kaymış, yerden güçlükle kaldırılmış. ' +
      'Az sonra gök yarılmış, dolu ve sağanak alayı dağıtmış, sokaklar sele dönmüş. Ertesi sabah şehri kalın bir sis örtmüş; halk bunu da hayra yormamış.',
    tarihte:
      'İkona alayı, dolu ve sis anlatıları Bizans tarafındaki kaynaklardan gelir; bir kısmı geç ve süslü anlatımlardır (doğrulanacak). ' +
      'Emecen, kuşatma günlerinde iki tarafın da işaretleri ve kehanetleri nasıl yorumladığını ayrıntılı biçimde ele alır.',
    sources: ['emecen2', 'barbaro'],
    fireFx: { byzMorale: -8, intel: 3 },
  }),

  // ───────────────────────────── K17 ─────────────────────────────
  ev({
    id: 'k17-divan',
    code: 'K17',
    title: 'Son Divan: Halil Paşa ve Zağanos Paşa',
    dateLabel: '26 Mayıs 1453',
    kind: 'karar',
    earliestDay: d(26, 5, 1453) + 0.55,
    historicalDay: d(26, 5, 1453),
    phases: ['kusatma'],
    image: IMG.divan,
    focus: 'otag',
    condition: (s) => inSiege(s) && !flag(s, FLAG.sonHucumIlan),
    text:
      'Sultan, paşaları otağında topladı. Çandarlı Halil Paşa söze girdi: Macar ve Venedik yardımının yolda olduğu konuşuluyor, ordu yorgun, kayıplar ağır; şehirden ağır bir haraç alınıp kuşatmanın kaldırılması akıllıca olur. ' +
      'Zağanos Paşa karşı çıktı: surlar yıkılmış, savunucular tükenmek üzere; geri dönmek Bizans’a ve bütün Avrupa’ya cesaret vermek demektir. Son söz Sultan’ın.',
    variant: (s) => {
      const n = siegeDay(s);
      if (!n) return null;
      return {
        text:
          `Kuşatmanın ${n}. gününde Sultan, paşaları otağında topladı. Çandarlı Halil Paşa söze girdi: Macar ve Venedik yardımının yolda olduğu konuşuluyor, ordu yorgun, kayıplar ağır; ` +
          'şehirden ağır bir haraç alınıp kuşatmanın kaldırılması akıllıca olur. Zağanos Paşa karşı çıktı: surlar yıkılmış, savunucular tükenmek üzere; ' +
          'geri dönmek Bizans’a ve bütün Avrupa’ya cesaret vermek demektir. Son söz Sultan’ın.',
      };
    },
    tarihte:
      'Kaynaklar Halil Paşa’nın kuşatmanın kaldırılmasını, Zağanos Paşa’nın ise sürdürülmesini savunduğunu yazar (ayrıntılar kaynaklarda farklıdır, doğrulanacak). ' +
      'Sultan Zağanos Paşa’nın görüşünü benimsedi; son hücum 29 Mayıs’a kararlaştırıldı. Halil Paşa fetihten sonra azledilip idam edildi.',
    sources: ['emecen', 'inalcik', 'tansel', 'doukas'],
    choices: [
      {
        id: 'zaganos',
        label: 'Zağanos Paşa haklı: kuşatma sürsün',
        desc: 'Son hücuma hazırlanılır; barış kanadı susar.',
        tarihi: true,
        fx: { divan: 25, morale: 8 },
      },
      {
        id: 'halil',
        label: 'Halil Paşa’yı dinle: barış şartlarını yokla',
        desc: 'Elçiler gidip gelir: haraç vaadi hazineyi doldurur, diplomasi yardımı geciktirir. Ama ordu bozulur, Bizans nefes alır; Divan barışa kayarsa kuşatma kaldırılabilir.',
        fx: { divan: -30, morale: -10, byzMorale: 10, res: { akce: 6000 }, relief: 8 },
      },
    ],
  }),

  // ───────────────────────────── K18 ─────────────────────────────
  ev({
    id: 'k18-son-hucum-ilani',
    code: 'K18',
    title: 'Son hücumun ilanı',
    dateLabel: '27 – 28 Mayıs 1453',
    kind: 'kosullu',
    pause: true,
    historicalDay: d(27, 5, 1453),
    phases: ['kusatma'],
    image: IMG.ates,
    focus: 'otag',
    condition: (s) => inSiege(s) && flag(s, FLAG.sonHucumIlan),
    text:
      'Tellallar ordugâhı dolaşıp ilan etti: son hücum yakındır. Askerler gündüz oruç tutup dua ediyor; gece ise ordugâhın her yanında meşaleler ve ateşler yakılıyor, tepeler ışıkla doldu, ' +
      'davullar ve zurnalar susmuyor. Son gün herkes dinlendirildi. Sultan bütün mevzileri tek tek dolaşıp komutanlarla konuştu.',
    tarihte:
      'Son hücumdan önceki gecelerde ordugâhta yakılan ateşler ve meşaleler surlardan görülüyordu (Barbaro). 28 Mayıs dinlenme ve hazırlık günüydü. ' +
      'Savaşla alınan şehrin üç gün askere bırakılacağı da ilan edildi.',
    sources: ['tursun', 'kritovulos', 'emecen', 'barbaro'],
    fireFx: { morale: 10, byzMorale: -6 },
  }),

  // ───────────────────────────── K19 ─────────────────────────────
  ev({
    id: 'k19-son-hucum',
    code: 'K19',
    title: 'Son hücum',
    dateLabel: '29 Mayıs 1453',
    kind: 'kosullu',
    pause: true,
    historicalDay: d(29, 5, 1453),
    phases: ['kusatma'],
    image: IMG.sancak,
    focus: 'sulukule',
    condition: (s) => inSiege(s) && flag(s, FLAG.sonHucum),
    text:
      'Gece yarısından sonra mehter vurdu ve bütün cephe aynı anda yürüdü. İlk dalgada başıbozuklar merdivenlerle gediklere atıldı; onları İshak Paşa’nın Anadolu askerleri izledi. ' +
      'Savunucular yorgun ama yerlerinde. Sultan şimdi son kozunu, yeniçerileri ileri sürmeye hazırlanıyor.',
    tarihte:
      'Son hücum 29 Mayıs gecesi, sabaha karşı başladı. Üç dalga halinde yapıldı: başıbozuklar, Anadolu askerleri ve yeniçeriler. Aynı anda Haliç’ten ve Marmara’dan da surlara yüklenildi.',
    sources: ['tursun', 'kritovulos', 'apz', 'emecen'],
    fireFx: { morale: 4 },
  }),
  ev({
    id: 'k19-giustiniani',
    code: 'K19',
    title: 'Giustiniani yaralandı',
    dateLabel: '29 Mayıs 1453, şafak',
    kind: 'tepkisel',
    pause: false,
    historicalDay: d(29, 5, 1453),
    phases: ['kusatma'],
    focus: 'topkapi',
    condition: (s) => flag(s, FLAG.kusatmaBasladi) && flag(s, FLAG.giustinianiYarali),
    text:
      'Topkapı’daki gedikte savunmayı yöneten Cenevizli Giovanni Giustiniani ağır yaralandı. Komutanın iç surdaki bir kapıdan geri götürüldüğünü gören adamları çözüldü; ' +
      'İmparator onu yerinde tutmaya boşuna çalıştı. Savunma hattı çatırdıyor.',
    tarihte:
      'Giustiniani’nin yaralanması savunmanın çöküşünde belirleyici oldu. Gemiyle Sakız’a götürüldü ve kısa süre sonra orada öldü. ' +
      'Barbaro ve Leonardo, Ceneviz komutanını savunmayı terk etmekle suçlar; bu suçlama tartışmalıdır.',
    sources: ['kritovulos', 'emecen', 'barbaro', 'leonardo'],
    fireFx: { byzMorale: -15, morale: 6 },
  }),
  ev({
    id: 'k19-kerkoporta',
    code: 'K19',
    title: 'Kerkoporta',
    dateLabel: '29 Mayıs 1453',
    kind: 'tepkisel',
    pause: false,
    historicalDay: d(29, 5, 1453),
    phases: ['kusatma'],
    focus: 'kerkoporta',
    condition: (s) => flag(s, FLAG.kusatmaBasladi) && flag(s, FLAG.kerkoporta),
    text:
      'Blahernai yakınlarında, surun dibindeki küçük bir kapı açık bulundu; bir çıkıştan sonra kapatılmasının unutulduğu söyleniyor. ' +
      'Elli kadar asker içeri daldı, burçlara çıkıp sancaklarımızı dikti; arkalarından yükselen çığlıklar savunucuları şaşkına çevirdi.',
    tarihte:
      'Kerkoporta olayını yalnızca Doukas anlatır; diğer tanıklar bu kapıdan söz etmez. Bu yüzden tarihçiler olayın gerçekliğini ve önemini tartışır. ' +
      'Oyun bu anlatıyı Doukas’a dayanan bir olasılık olarak gösterir.',
    sources: ['emecen', 'doukas'],
    fireFx: { byzMorale: -6 },
  }),
  ev({
    id: 'k19-ulubatli-hasan',
    code: 'K19',
    title: 'Ulubatlı Hasan',
    dateLabel: '29 Mayıs 1453',
    kind: 'tepkisel',
    pause: false,
    historicalDay: d(29, 5, 1453),
    phases: ['kusatma'],
    image: IMG.sancak,
    focus: 'topkapi',
    condition: (s) => flag(s, FLAG.kusatmaBasladi) && flag(s, FLAG.sancakDikildi),
    text:
      'Ulubatlı Hasan adında iri yarı bir yeniçeri, kalkanını başına kaldırıp otuz kadar arkadaşıyla gedikten surlara tırmandı. Oklar ve taşlar altında birçoğu düştü; ' +
      'Hasan burca ulaştı ve sancağı dikti, sonra o da yaralanıp düştü. Burçtaki sancağı gören ordu yeniden atıldı; savunma dağıldı.',
    tarihte:
      'Kritovoulos, Ulubat’tan (Lopadion) Hasan adlı iri yapılı bir yeniçerinin otuz kadar yoldaşıyla surun üstüne ilk çıkanlardan olduğunu ve orada düştüğünü yazar. ' +
      'Sancağı burca diktiği, Türk geleneğinde yaygın anlatıdır.',
    sources: ['kritovulos', 'emecen'],
    fireFx: { morale: 10, byzMorale: -10 },
  }),
  ev({
    id: 'k19-fetih',
    code: 'K19',
    title: 'Fetih',
    dateLabel: '29 Mayıs 1453',
    kind: 'kosullu',
    pause: false,
    historicalDay: d(29, 5, 1453),
    phases: ['kusatma', 'bitti'],
    image: IMG.ayasofya,
    focus: 'ayasofya',
    condition: (s) => flag(s, FLAG.sehirDustu),
    text:
      'Şehir düştü. Sancaklar surlarda dalgalanıyor; İmparator Konstantinos son çarpışmada, askerlerinin arasında kayboldu. ' +
      'Sultan atıyla şehre girdi ve doğruca Ayasofya’ya gitti. Kubbenin altında durdu ve bu büyük mabedin camiye çevrilmesini emretti.',
    variant: (s) => {
      const n = s.time.siegeStartDay != null ? Math.floor(s.time.day - s.time.siegeStartDay) : null;
      if (n == null) return null;
      return {
        text:
          'Şehir düştü. Sancaklar surlarda dalgalanıyor; İmparator Konstantinos son çarpışmada, askerlerinin arasında kayboldu. ' +
          'Sultan atıyla şehre girdi ve doğruca Ayasofya’ya gitti. Kubbenin altında durdu ve bu büyük mabedin camiye çevrilmesini emretti. ' +
          (n < 53 ? `Sen şehri ${n} günde aldın; tarihte kuşatma 53 gün sürdü.` : n === 53 ? 'Tarihteki gibi, tam 53 günde.' : `Sen şehri ${n} günde aldın; tarihte kuşatma 53 gün sürdü.`),
      };
    },
    tarihte:
      '29 Mayıs 1453 Salı günü şehir alındı. Tursun Bey, Sultan’ın Ayasofya’yı gezdiğini ve harap Bizans sarayına bakarken dünyanın geçiciliğini anlatan bir Farsça beyit okuduğunu yazar (doğrulanacak). ' +
      'İlk cuma namazı 1 Haziran’da Ayasofya’da kılındı. Sultan’ın şehre hangi kapıdan girdiği tartışmalıdır; gelenek Edirnekapı’yı gösterir.',
    sources: ['tursun', 'kritovulos', 'apz', 'fetihname', 'emecen'],
  }),
];
