import type { EncyclopediaEntry } from '../../core/defs';
import { SOURCES } from '../../data/sources';

/** Ansiklopedi — YERLER. */
export const ENC_YERLER: EncyclopediaEntry[] = [
  {
    id: 'rumeli-hisari',
    title: 'Rumeli Hisarı (Boğazkesen)',
    category: 'yer',
    subtitle: '1452, Boğaz’ın en dar yeri',
    body: [
      'Boğaz’ın en dar yerinde, Anadolu Hisarı’nın tam karşısında 1452’de yapıldı. Osmanlı kaynakları ona “Boğazkesen” der: amacı Karadeniz ile Kostantiniyye arasındaki deniz yolunu denetlemekti.',
      'Üç büyük kulesini Saruca Paşa, Çandarlı Halil Paşa ve Zağanos Paşa yaptırdı; surlarla birbirine bağlanan küçük burçları ve kapıları vardır. İnşaat kaynakların çoğuna göre dört buçuk ay gibi kısa bir sürede, Ağustos 1452’nin sonunda bitti.',
      'Kıyıya yerleştirilen toplar Boğaz’dan geçen gemileri durdurdu; Kasım 1452’de Antonio Rizzo’nun gemisi bu toplarla batırıldı. Kulelerin üstünün başlangıçta külahlarla örtülü olduğu düşünülür (doğrulanacak); bugünkü görünüm sonraki onarımların ürünüdür.',
    ],
    sources: ['tursun', 'kritovulos', 'apz', 'emecen'],
    related: ['anadolu-hisari', 'bogaz', 'saruca-pasa', 'musliheddin', 'antonio-rizzo'],
  },
  {
    id: 'anadolu-hisari',
    title: 'Anadolu Hisarı (Güzelce Hisar)',
    category: 'yer',
    subtitle: 'Yıldırım Bayezid dönemi',
    body: [
      'Boğaz’ın Anadolu yakasında, Göksu deresinin ağzında Yıldırım Bayezid döneminde (1390’lar) yapıldı. Kaynaklarda Güzelce Hisar diye de anılır.',
      'Rumeli Hisarı karşısına yapılınca iki hisar Boğaz’ı iki yandan kıskaca aldı. Kıyıdaki toplarla birlikte Karadeniz’den gelen gemilerin geçişi tamamen Osmanlı denetimine girdi.',
    ],
    sources: ['apz', 'nesri', 'emecen'],
    related: ['rumeli-hisari', 'bogaz'],
  },
  {
    id: 'bogaz',
    title: 'Boğaz (Boğaziçi)',
    category: 'yer',
    body: [
      'Karadeniz’i Marmara’ya bağlayan dar deniz yolu. Kostantiniyye’nin buğdayı ve ticareti büyük ölçüde bu yoldan, Karadeniz limanlarından gelirdi.',
      'Rumeli Hisarı’nın yapılmasıyla Boğaz Osmanlı denetimine girdi; bu, kuşatma başlamadan önce şehrin erzak yollarını daralttı. Kuşatmada Osmanlı donanması Boğaz’ın Avrupa kıyısında, Beşiktaş önlerinde demirledi.',
    ],
    sources: ['kritovulos', 'emecen'],
    related: ['rumeli-hisari', 'anadolu-hisari', 'diplokionion'],
  },
  {
    id: 'galata',
    title: 'Galata (Pera)',
    category: 'yer',
    subtitle: 'Ceneviz kolonisi',
    body: [
      'Haliç’in kuzey kıyısında, surlarla çevrili bir Ceneviz kolonisiydi. Galata Kulesi 1348’de Cenevizliler tarafından yapılmıştı ve 1453’te konik bir çatıyla örtülüydü.',
      'Kuşatmada resmen tarafsız kaldı. Galatalılar iki tarafla da ilişki sürdürdü: ordugâha mal sattılar, bazıları ise gizlice surlara geçip savunmaya katıldı. Haberler her iki yöne de aktı; 28 Nisan baskınının Osmanlılara Galata’dan haber verildiği söylenir.',
      'Şehir düşünce Galata kapılarını açtı ve Sultan 1 Haziran 1453’te Galatalılara haklarını tanıyan bir ahidname verdi. Oyunda Galata ile ilişki bir gösterge olarak izlenir.',
    ],
    sources: ['inalcik', 'emecen', 'doukas', 'leonardo'],
    related: ['halic', 'halic-zinciri', 'gemilerin-karadan-yurutulmesi'],
  },
  {
    id: 'halic',
    title: 'Haliç',
    category: 'yer',
    subtitle: 'Şehrin kuzeyindeki doğal liman',
    body: [
      'Kostantiniyye ile Galata arasındaki uzun, korunaklı koydur. Şehrin en iyi limanıydı ve Bizans gemileri kuşatma boyunca burada, zincirin arkasında korundu.',
      'Haliç surları kara surlarından daha zayıftı; Bizans bu yüzden Haliç’in ağzını kalın bir zincirle kapattı. Osmanlılar 22 Nisan’da gemileri karadan indirerek Haliç’e girdiler ve sonra fıçılardan bir köprü kurdular. Böylece Bizans iki cepheyi birden savunmak zorunda kaldı.',
    ],
    sources: ['kritovulos', 'tursun', 'emecen', 'barbaro'],
    related: ['halic-zinciri', 'galata', 'gemilerin-karadan-yurutulmesi', 'halic-surlari'],
  },
  {
    id: 'ayasofya',
    title: 'Ayasofya',
    category: 'yer',
    subtitle: '537, Iustinianus',
    body: [
      'İmparator Iustinianus döneminde 532–537 yıllarında yapıldı; mimarları Trallesli Anthemios ve Miletli İsidoros’tur. Dev kubbesiyle bin yıl boyunca Hristiyan dünyasının en büyük kilisesi oldu.',
      '1453’te minaresi yoktu; minareler fetihten sonra, farklı dönemlerde eklendi. 12 Aralık 1452’de kilise birliği burada ilan edildi ve şehrin son gecesinde burada toplu bir ayin yapıldığı anlatılır.',
      'Sultan şehre girdiği gün Ayasofya’ya gitti ve camiye çevrilmesini emretti. İlk cuma namazı 1 Haziran 1453’te kılındı.',
    ],
    sources: ['tursun', 'kritovulos', 'emecen'],
    related: ['kilise-birligi', 'fatih'],
  },
  {
    id: 'kara-surlari',
    title: 'Theodosius Surları (Kara Surları)',
    category: 'yer',
    subtitle: '5. yüzyıl, üç katlı savunma',
    body: [
      'II. Theodosius döneminde yapıldı ve 447 depreminden sonra yenilendi. Haliç’ten Marmara’ya kadar uzanan hat, içte yüksek ana sur, önünde daha alçak dış sur ve onun önünde geniş bir hendekten oluşur.',
      'Duvarlar kireç taşı sıralarıyla, aralarına konmuş kırmızı tuğla bantlarla örülmüştür. Ana surun her birkaç düzine metrede bir kulesi vardır. Bin yıl boyunca hiçbir ordu bu surları zorla aşamamıştı.',
      '1453’te büyük toplar bu surların ilk kez sistemli biçimde yıkılabileceğini gösterdi. Bizanslılar gündüz açılan gedikleri geceleri kazıklar, toprak dolu fıçılar ve çalı demetleriyle kapattı.',
    ],
    sources: ['kritovulos', 'tursun', 'emecen'],
    related: ['topkapi', 'lykos', 'edirnekapi', 'blahernai', 'altinkapi'],
  },
  {
    id: 'topkapi',
    title: 'Topkapı (St. Romanos Kapısı)',
    category: 'yer',
    body: [
      'Kara surlarının ortasında, Lykos vadisinin güney ucundaki kapıdır. Bizans döneminde Aziz Romanos kapısı olarak anılıyordu.',
      'Sultan’ın otağı bu kapının karşısına kuruldu ve en büyük toplar bu kesimi dövdü. Türkçe adının, karşısına konan büyük toptan geldiği anlatılır.',
    ],
    sources: ['kritovulos', 'emecen'],
    related: ['lykos', 'otag', 'sahi-topu', 'giustiniani'],
  },
  {
    id: 'lykos',
    title: 'Lykos Vadisi (Mesoteikhion)',
    category: 'yer',
    subtitle: 'Surların en zayıf kesimi',
    body: [
      'Edirnekapı ile Topkapı arasındaki alçak vadidir; Lykos deresi şehre burada girerdi. Surlar burada çevredeki tepelerden daha alçakta kaldığı için savunması en zor kesimdi.',
      'Asıl bombardıman ve hücumlar bu kesime yöneldi. İmparator ve Giustiniani savunmayı burada bizzat yönetti; 18 Nisan, 7 Mayıs ve son hücumun en şiddetli çarpışmaları bu vadide oldu.',
    ],
    sources: ['kritovulos', 'barbaro', 'emecen'],
    related: ['topkapi', 'edirnekapi', 'giustiniani', 'son-hucum'],
  },
  {
    id: 'edirnekapi',
    title: 'Edirnekapı (Kharisios Kapısı)',
    category: 'yer',
    body: [
      'Kara surlarının kuzey kesiminde, şehrin en yüksek tepelerinden birinin önündeki kapıdır. Edirne yolu bu kapıya ulaşırdı.',
      'Türk geleneği, Sultan’ın 29 Mayıs’ta şehre bu kapıdan girdiğini kabul eder; bazı anlatımlar ise Topkapı’yı gösterir (doğrulanacak).',
    ],
    sources: ['emecen', 'tursun'],
    related: ['lykos', 'kara-surlari'],
  },
  {
    id: 'egrikapi',
    title: 'Eğrikapı ve Tekfur Sarayı',
    category: 'yer',
    body: [
      'Blahernai bölgesinin güney ucunda, Tekfur Sarayı (Porfirogennetos Sarayı) yanındaki kapıdır. Bu kesimde sur tek kattır ve önünde hendek yoktur.',
      'Lağımların büyük kısmı bu çevrede kazıldı. Kerkoporta’nın da bu bölgede, Blahernai ile Theodosius surlarının birleştiği yerde olduğu düşünülür.',
    ],
    sources: ['emecen', 'barbaro'],
    related: ['blahernai', 'kerkoporta', 'lagim'],
  },
  {
    id: 'kerkoporta',
    title: 'Kerkoporta',
    category: 'yer',
    subtitle: 'Yalnızca Doukas anlatır',
    body: [
      'Blahernai yakınlarında, surun dibindeki küçük bir arka kapıdır. Doukas’a göre son hücumda bir çıkıştan sonra açık unutulmuş, elli kadar Osmanlı askeri buradan girip burçlara sancak dikmiş ve savunucuları paniğe sürüklemiştir.',
      'Olayı başka hiçbir tanık anlatmaz. Bu yüzden bazı tarihçiler hikâyeyi gerçek kabul eder, bazıları abartılı ya da sonradan uydurulmuş bir açıklama sayar. Kapının yeri de kesin değildir.',
    ],
    sources: ['doukas', 'emecen'],
    related: ['blahernai', 'egrikapi', 'kaynak-doukas', 'son-hucum'],
    dogrulanacak: true,
  },
  {
    id: 'blahernai',
    title: 'Blahernai',
    category: 'yer',
    subtitle: 'Saray bölgesi ve tek kat sur',
    body: [
      'Kara surlarının Haliç’e uzanan kuzey ucundaki saray bölgesidir. Son yüzyıllarda imparatorlar Büyük Saray yerine Blahernai Sarayı’nda otururdu.',
      'Bu kesimde sur Theodosius surlarından farklı olarak tek kattır ve hendeği yoktur; ama yamaç üzerindedir. Venedikliler burayı savundu. Hendek olmadığı için Osmanlı lağımcıları en çok burada çalıştı.',
    ],
    sources: ['barbaro', 'emecen'],
    related: ['egrikapi', 'kerkoporta', 'minotto', 'lagim'],
  },
  {
    id: 'altinkapi',
    title: 'Altınkapı ve Yedikule',
    category: 'yer',
    body: [
      'Kara surlarının Marmara’ya yakın güney ucundaki tören kapısıdır; imparatorlar zaferlerden sonra şehre buradan girerdi.',
      'Bugün bu kapıyı içine alan Yedikule hisarı fetihten sonra, 1450’lerin sonunda Sultan Mehmed tarafından yaptırıldı; 1453’te henüz yoktu.',
    ],
    sources: ['emecen', 'inalcik'],
    related: ['kara-surlari', 'marmara-surlari'],
  },
  {
    id: 'marmara-surlari',
    title: 'Marmara Surları',
    category: 'yer',
    body: [
      'Sarayburnu’ndan Yedikule’ye kadar Marmara kıyısını izleyen tek kat deniz surlarıdır. Kıyıdaki akıntılar ve sığlıklar büyük bir deniz hücumunu zorlaştırıyordu.',
      'Kuşatmada bu kesim daha az savunucuyla tutuldu. Şehzade Orhan ve adamlarının bir bölümü burada bulunuyordu (doğrulanacak). Son hücumda donanma bu surlara da yüklendi.',
    ],
    sources: ['emecen', 'barbaro'],
    related: ['orhan-celebi', 'altinkapi'],
  },
  {
    id: 'halic-surlari',
    title: 'Haliç Surları',
    category: 'yer',
    body: [
      'Ayvansaray’dan Sarayburnu’na kadar Haliç kıyısını izleyen tek kat surlardır. Haliç zincirle kapalı olduğu sürece bu surlar ikinci derecede bir cepheydi.',
      'Gemiler karadan Haliç’e indirildikten ve fıçı köprü kurulduktan sonra Bizans bu surlara asker kaydırmak zorunda kaldı. Loukas Notaras bu kesimin savunmasında görevliydi.',
    ],
    sources: ['kritovulos', 'emecen'],
    related: ['halic', 'notaras', 'halic-zinciri'],
  },
  {
    id: 'otag',
    title: 'Otağ (Maltepe)',
    category: 'yer',
    subtitle: 'Sultan’ın karargâhı',
    body: [
      'Sultan’ın büyük, kırmızı renkli çadırıdır. Kuşatmada Topkapı’nın karşısındaki tepeye, Maltepe denen yere kuruldu.',
      'Otağın çevresinde yeniçeriler ve kapıkulu askerleri konaklıyordu. Divan toplantıları ve son hücum kararı burada alındı. Oyunda Sultan’ın ordugâhı dolaşması moral verir.',
    ],
    sources: ['tursun', 'kritovulos', 'emecen'],
    related: ['fatih', 'topkapi', 'kapikulu'],
  },
  {
    id: 'diplokionion',
    title: 'Çifte Sütunlar (Diplokionion)',
    category: 'yer',
    subtitle: 'Beşiktaş kıyısı',
    body: [
      'Bugünkü Beşiktaş–Dolmabahçe kıyısında, iki sütunla bilinen eski bir iskele yeridir. Osmanlı donanması kuşatma boyunca burada demirledi.',
      'Gemilerin karadan yürütülmesi buradan başladı: kızaklar Beşiktaş’tan yukarı tırmanıp sırtları aşarak Kasımpaşa’da Haliç’e iniyordu (güzergâhın ayrıntıları tartışmalıdır).',
    ],
    sources: ['kritovulos', 'emecen'],
    related: ['gemilerin-karadan-yurutulmesi', 'kasimpasa', 'bogaz'],
  },
  {
    id: 'kasimpasa',
    title: 'Kasımpaşa',
    category: 'yer',
    body: [
      'Haliç’in kuzey kıyısında, Galata surlarının batısındaki vadidir. Karadan yürütülen gemiler 22 Nisan’da burada denize indirildi.',
      'Haliç’e indirilen Osmanlı gemileri bu çevrede demirledi; fıçı köprü de buradan karşı kıyıya doğru kuruldu.',
    ],
    sources: ['kritovulos', 'emecen'],
    related: ['gemilerin-karadan-yurutulmesi', 'halic', 'diplokionion'],
  },
  {
    id: 'edirne',
    title: 'Edirne',
    category: 'yer',
    subtitle: 'Osmanlı başkenti',
    body: [
      '14. yüzyılın ikinci yarısından fetihe kadar Osmanlı devletinin başkentiydi. Kuşatmanın hazırlıkları, Divan toplantıları ve büyük topun dökümü burada yapıldı.',
      'Büyük topun deneme atışı Edirne’de yeni sarayın önünde yapıldı. Ordu 23 Mart 1453’te buradan yola çıktı. Oyunda Edirne haritada yer almaz; hazine, dökümhane ve asker toplama paneli olarak yönetilir.',
    ],
    sources: ['tursun', 'inalcik', 'emecen'],
    related: ['sahi-topu', 'orban'],
  },
  {
    id: 'mora',
    title: 'Mora Despotluğu',
    category: 'yer',
    body: [
      'Bizans’ın Yunanistan’daki son büyük toprağıydı; merkezi Mistra’ydı. 1453’te imparatorun kardeşleri Thomas ve Demetrios tarafından yönetiliyordu.',
      'Turahan Bey’in 1452 sonbaharındaki akını despotları kendi topraklarıyla uğraşmak zorunda bıraktı; Mora’dan Kostantiniyye’ye yardım gelmedi. Despotluk 1460’ta Osmanlı topraklarına katıldı.',
    ],
    sources: ['kritovulos', 'sphrantzes', 'emecen'],
    related: ['turahan-bey', 'konstantinos'],
  },
  {
    id: 'venedik',
    title: 'Venedik Cumhuriyeti',
    category: 'yer',
    body: [
      'Doğu Akdeniz ticaretinin en büyük gücüydü ve Kostantiniyye’de geniş bir ticaret kolonisi vardı. Sultan 1451’de Venedik’le antlaşmayı yeniledi.',
      'Rizzo’nun gemisinin batırılması Venedik’i öfkelendirdi, ama yardım filosu geç ve yavaş hazırlandı. Şehirdeki Venedikliler kuşatmada Blahernai’yi savundu; Barbaro’nun günlüğü onların gözünden yazılmıştır.',
    ],
    sources: ['inalcik', 'barbaro', 'emecen2'],
    related: ['antonio-rizzo', 'minotto', 'kaynak-barbaro'],
  },
];

/** Ansiklopedi — OLAYLAR. */
export const ENC_OLAYLAR: EncyclopediaEntry[] = [
  {
    id: 'deniz-savasi',
    title: '20 Nisan Deniz Savaşı',
    category: 'olay',
    body: [
      '20 Nisan 1453’te üç Ceneviz gemisi ve imparatorun kiraladığı bir buğday gemisi Marmara’dan Haliç’e girmeye çalıştı. Baltaoğlu Süleyman Bey’in kadırgaları yüksek bordalı bu gemileri sardı.',
      'Rüzgârın kesildiği saatlerde çarpışma kıyının dibinde sürdü; kıyıdan izleyen Sultan’ın atını denize sürdüğü anlatılır. Akşama doğru rüzgâr yeniden esince gemiler zincirin arkasına, Haliç’e sığındı.',
      'Bu başarısızlık ordugâhta büyük üzüntüye yol açtı. Baltaoğlu görevden alındı; Akşemseddin’in Sultan’a yazdığı mektup bu günlerin havasını yansıtır. İki gün sonra gemiler karadan Haliç’e indirildi.',
    ],
    sources: ['kritovulos', 'tursun', 'emecen', 'barbaro'],
    related: ['baltaoglu', 'karaka', 'kadirga', 'aksemseddin'],
  },
  {
    id: 'gemilerin-karadan-yurutulmesi',
    title: 'Gemilerin Karadan Yürütülmesi',
    category: 'olay',
    subtitle: '22 Nisan 1453',
    body: [
      'Haliç’in ağzı zincirle kapalı olduğu için Sultan, gemileri karadan geçirmeye karar verdi. Beşiktaş’tan Kasımpaşa’ya uzanan güzergâhta yamaçlara kızaklar ve kalaslar döşendi, kalaslar yağlandı.',
      '21’i 22’ye bağlayan gece, yaklaşık yetmiş gemi öküzler ve insan gücüyle tepeden aşırılıp Haliç’e indirildi; sayılar kaynaklarda 67 ile 72 arasında değişir. Gemilerin yelkenleri açık, kürekçilerin yerlerinde olduğu anlatılır.',
      'Bu hamle Bizans’ı Haliç surlarına asker kaydırmak zorunda bıraktı ve savunmayı iki cepheye böldü. Osmanlı kaynakları olayı Sultan’ın dehasının bir işareti olarak över.',
    ],
    sources: ['tursun', 'kritovulos', 'apz', 'emecen', 'barbaro'],
    related: ['halic', 'diplokionion', 'kasimpasa', 'zaganos-pasa'],
  },
  {
    id: 'ay-tutulmasi',
    title: '22 Mayıs Ay Tutulması',
    category: 'olay',
    body: [
      '22 Mayıs 1453 akşamı dolunay kısmen tutulmuş olarak doğdu ve saatlerce karanlık kaldı. Bu tutulma astronomik hesaplarla doğrulanabilir.',
      'Şehirde, Kostantiniyye’nin ay büyürken düşmeyeceğine dair bir kehanet dolaşıyordu. Tutulma savunucular arasında kötü bir alamet olarak yorumlandı. Barbaro olayı günlüğüne kaydetmiştir.',
    ],
    sources: ['barbaro', 'emecen2'],
    related: ['ayasofya'],
  },
  {
    id: 'teslim-teklifi',
    title: 'Son Teslim Çağrısı',
    category: 'olay',
    body: [
      'Mayıs’ın son haftasında Sultan şehre bir elçi gönderdi. Teklife göre şehir teslim olursa halkın canı ve malı bağışlanacak, imparator da Mora’ya çekilebilecekti.',
      'Konstantinos teklifi reddetti; Doukas onun cevabını, şehri teslim etmenin kimsenin elinde olmadığı ve hepsinin ölmeye hazır olduğu biçiminde aktarır. Elçinin İsfendiyaroğlu İsmail Bey olduğu anlatılır (doğrulanacak).',
    ],
    sources: ['doukas', 'kritovulos', 'emecen'],
    related: ['konstantinos'],
    dogrulanacak: true,
  },
  {
    id: 'son-hucum',
    title: '29 Mayıs Son Hücum',
    category: 'olay',
    body: [
      '29 Mayıs gecesi, sabaha karşı mehterin sesiyle bütün cephede hücum başladı. İlk dalgada başıbozuklar, ikinci dalgada İshak Paşa’nın Anadolu askerleri, son dalgada yeniçeriler surlara yüklendi; aynı anda Haliç’ten ve Marmara’dan da saldırıldı.',
      'Giustiniani’nin ağır yaralanıp geri götürülmesi savunmayı sarstı. Yeniçeriler Lykos vadisindeki gedikten surlara çıktı; Ulubatlı Hasan’ın hikâyesi bu ana aittir. Doukas’a göre aynı sırada Kerkoporta’dan da içeri girilmişti.',
      'Şafaktan sonra savunma çöktü ve şehir alındı. İmparator Konstantinos son çarpışmada öldü. Sultan aynı gün şehre girip Ayasofya’ya gitti.',
    ],
    sources: ['tursun', 'kritovulos', 'apz', 'emecen', 'barbaro'],
    related: ['ulubatli-hasan', 'giustiniani', 'kerkoporta', 'yeniceri-ocagi', 'mehter'],
  },
  {
    id: 'kilise-birligi',
    title: 'Kilise Birliği',
    category: 'olay',
    subtitle: '1439 Floransa, 1452 Kostantiniyye',
    body: [
      'Bizans, Batı’dan askerî yardım alabilmek için Katolik ve Ortodoks kiliselerinin birleşmesini kabul etti. Birlik 1439’da Floransa Konsili’nde imzalandı, ama Bizans halkı ve din adamlarının çoğu buna karşıydı.',
      'Kardinal İsidoros’un gelişiyle birlik 12 Aralık 1452’de Ayasofya’da ilan edildi. İlan şehirde derin bir bölünme yarattı ve beklenen büyük Batı yardımını getirmedi.',
    ],
    sources: ['doukas', 'sphrantzes', 'leonardo', 'emecen'],
    related: ['isidoros', 'gennadios', 'ayasofya', 'konstantinos'],
  },
  {
    id: 'onceki-kusatmalar',
    title: 'Önceki Osmanlı Kuşatmaları',
    category: 'olay',
    body: [
      'Kostantiniyye 1453’ten önce de Osmanlılar tarafından kuşatılmıştı. Yıldırım Bayezid şehri 1390’larda yıllarca abluka altında tuttu; bu kuşatma 1402 Ankara Savaşı ile sona erdi.',
      'Fetret döneminde Musa Çelebi (1411) ve II. Murad (1422) de şehri kuşattı. Hiçbirinde surlar aşılamadı. 1453’ü farklı kılan, Boğaz’ın Rumeli Hisarı ile kesilmesi, büyük toplar ve Haliç’e karadan girilmesiydi.',
    ],
    sources: ['apz', 'nesri', 'inalcik', 'emecen'],
    related: ['anadolu-hisari', 'kara-surlari'],
  },
];

/** Ansiklopedi — SİLAHLAR ve ARAÇLAR. */
export const ENC_SILAHLAR: EncyclopediaEntry[] = [
  {
    id: 'sahi-topu',
    title: 'Şahi Topu (Büyük Top)',
    category: 'silah',
    body: [
      'Osmanlı kaynaklarının “şâhî” dediği dev tunç toplardır. En büyüğü Orban usta tarafından Edirne’de döküldü ve Ocak 1453’te sarayın önünde denendi.',
      'Doukas’a göre top otuz arabalık bir kafileyle, altmış öküzle taşındı; namlusunun uzunluğu ve güllesinin ağırlığı için kaynaklar farklı ve çoğu zaman abartılı rakamlar verir (doğrulanacak). Taş gülleleri taşçılar yontuyordu.',
      'Isınan namlunun soğuması gerektiğinden günde ancak birkaç kez ateşlenebiliyordu. Gücü yüksek ama hedefi değiştirmesi zordu; asıl işi surlarda gedik açmaktı. Oyunda büyük top Topkapı karşısındaki mevziye taşınır.',
    ],
    sources: ['kritovulos', 'tursun', 'emecen2', 'doukas'],
    related: ['orban', 'havan', 'topkapi', 'edirne'],
    dogrulanacak: true,
  },
  {
    id: 'havan',
    title: 'Havan',
    category: 'silah',
    body: [
      'Kısa namlulu, geniş ağızlı ve güllesini yüksek bir yay çizerek fırlatan toptur. Kritovoulos’a göre Sultan, Haliç’te zincirin ardına sığınan gemileri vurmak için böyle bir topun dökülmesini istedi.',
      'Galata’nın arkasındaki tepeden atılan gülleler Haliç’teki bir gemiyi batırdı; güllelerin Galata’ya da düşmesi Cenevizlileri tedirgin etti (ayrıntılar doğrulanacak).',
    ],
    sources: ['kritovulos', 'barbaro'],
    related: ['sahi-topu', 'galata', 'halic'],
  },
  {
    id: 'rum-atesi',
    title: 'Rum Ateşi',
    category: 'silah',
    body: [
      'Bizans’ın yüzyıllar önce deniz savaşlarında kullandığı, suyla sönmeyen yanıcı karışımdır. Tam formülü bilinmez ve gizli tutulmuştur.',
      '1453’te asıl Rum ateşinin hâlâ kullanılıp kullanılmadığı belirsizdir; savunucular katran, reçine ve kükürt gibi maddelerden yapılan yanıcı karışımlar, fıçılar ve kundaklar kullandı. Kuşatma kulesinin yakılması ve lağımlara ateş verilmesi bu tür araçlarla yapıldı.',
    ],
    sources: ['emecen', 'barbaro'],
    related: ['kusatma-kulesi', 'lagim'],
    dogrulanacak: true,
  },
  {
    id: 'lagim',
    title: 'Lağım',
    category: 'silah',
    subtitle: 'Sur altına kazılan tünel',
    body: [
      'Kuşatanların surların altına kazdığı tüneldir. Tünel kalaslarla desteklenir; vakti gelince destekler yakılır ve üstteki sur çöker.',
      'Kuşatmada lağımlar Zağanos Paşa’nın kesiminde, özellikle hendeği olmayan Blahernai bölgesinde kazıldı. Lağımcıların bir kısmının Sırp maden ustaları olduğu yazılır (doğrulanacak).',
      'Johannes Grant yönetimindeki karşı lağımlar Osmanlı tünellerini birer birer buldu. 23 Mayıs’ta yakalanan subayların kalan tünelleri ele verdiği anlatılır. Oyunda lağımlar gece daha zor fark edilir.',
    ],
    sources: ['kritovulos', 'sphrantzes', 'barbaro', 'emecen'],
    related: ['johannes-grant', 'blahernai', 'zaganos-pasa'],
  },
  {
    id: 'kusatma-kulesi',
    title: 'Kuşatma Kulesi',
    category: 'silah',
    body: [
      'Tahtadan yapılan, tekerlekler ya da kızaklar üzerinde surlara yaklaştırılan yüksek kuledir. Ateşe karşı ıslak hayvan derileriyle kaplanır; içindeki merdivenlerden okçular ve askerler surlara ulaşır.',
      'Barbaro’ya göre Mayıs ortasında Romanos kapısı yakınında bir gecede böyle bir kule kuruldu ve önündeki hendek dolduruldu. Savunucular gece çıkışıyla kuleyi barutla yaktı (tarih doğrulanacak).',
    ],
    sources: ['barbaro', 'kritovulos', 'emecen'],
    related: ['rum-atesi', 'topkapi'],
  },
  {
    id: 'halic-zinciri',
    title: 'Haliç Zinciri',
    category: 'silah',
    body: [
      'Haliç’in ağzını kapatan kalın demir zincirdir. Bir ucu şehirdeki Eugenius kulesine, öteki ucu Galata surlarına bağlanmıştı ve ahşap şamandıralar üzerinde yüzüyordu.',
      'Kuşatmanın başında, Nisan’ın ilk günlerinde gerildi (2 Nisan, doğrulanacak). Osmanlı donanması zinciri zorla aşamayınca gemiler karadan Haliç’e indirildi. İstanbul’daki müzelerde sergilenen bazı zincir parçalarının bu zincire ait olduğu düşünülür (doğrulanacak).',
    ],
    sources: ['kritovulos', 'barbaro', 'emecen'],
    related: ['halic', 'galata', 'gemilerin-karadan-yurutulmesi'],
  },
  {
    id: 'kadirga',
    title: 'Kadırga',
    category: 'silah',
    body: [
      'Kürekle ve yardımcı yelkenle yürüyen, uzun ve alçak bordalı savaş gemisidir. Osmanlı donanmasının ana gemisiydi; daha küçükleri kalyete ve fusta diye anılır.',
      'Rüzgârdan bağımsız hareket edebilmesi büyük üstünlüktü; ama alçak bordası yüzünden yüksek Ceneviz ticaret gemilerine tırmanmak çok zordu. 20 Nisan savaşında bu zayıflık açıkça görüldü.',
    ],
    sources: ['kritovulos', 'emecen'],
    related: ['karaka', 'deniz-savasi', 'baltaoglu'],
  },
  {
    id: 'karaka',
    title: 'Ceneviz Gemisi (Karaka)',
    category: 'silah',
    body: [
      'Yüksek bordalı, iri gövdeli, yelkenli Akdeniz ticaret gemisidir. Baş ve kıç tarafındaki yüksek kasaralardan okçular ve taş atanlar aşağıdaki kadırgalara üstün gelir.',
      '20 Nisan’da üç Ceneviz gemisi ve bir Bizans gemisi, sayıca çok üstün Osmanlı kadırgalarına rağmen Haliç’e girmeyi başardı.',
    ],
    sources: ['kritovulos', 'barbaro', 'emecen'],
    related: ['kadirga', 'deniz-savasi'],
  },
];

/** Ansiklopedi — KAVRAMLAR. */
export const ENC_KAVRAMLAR: EncyclopediaEntry[] = [
  {
    id: 'timar',
    title: 'Tımar',
    category: 'kavram',
    body: [
      'Bir bölgenin vergi gelirinin, karşılığında savaşa atlı asker olarak katılma şartıyla bir sipahiye bırakılmasıdır. Tımar sahibi geliri oranında yanında silahlı adamlar (cebelü) getirmekle yükümlüydü.',
      'Rumeli ve Anadolu’nun tımarlı sipahileri Osmanlı ordusunun en kalabalık atlı gücüydü. Sefer çağrısı geldiğinde sancak beylerinin ve beylerbeylerinin bayrakları altında toplanırlardı.',
    ],
    sources: ['inalcik', 'emecen'],
    related: ['kapikulu', 'karaca-pasa', 'ishak-pasa'],
  },
  {
    id: 'kapikulu',
    title: 'Kapıkulu',
    category: 'kavram',
    body: [
      'Doğrudan Sultan’a bağlı, maaşlı ve sürekli askerlerdir. Yeniçeriler, kapıkulu süvarileri, topçular, cebeciler ve top arabacıları bu gruba girer.',
      'Tımarlılardan farklı olarak yıl boyunca hizmette bulunurlar ve Sultan’ın çevresinde konaklarlar. Kuşatmada otağın çevresinde, merkezde yer aldılar.',
    ],
    sources: ['inalcik', 'emecen'],
    related: ['yeniceri-ocagi', 'timar', 'otag'],
  },
  {
    id: 'yeniceri-ocagi',
    title: 'Yeniçeri Ocağı',
    category: 'kavram',
    body: [
      'Osmanlı’nın 14. yüzyılda kurulan sürekli piyade birliğidir. Askerleri önce savaş esirlerinden, sonra devşirme yoluyla toplanırdı. Beyaz börkleriyle tanınırlar.',
      '1453’te sayıları birkaç bin kadardı (doğrulanacak). Disiplinleri ve okçulukları ile ordunun en güvenilir gücüydüler. Son hücumda belirleyici üçüncü dalgayı onlar oluşturdu.',
    ],
    sources: ['inalcik', 'emecen', 'kritovulos'],
    related: ['kapikulu', 'ulubatli-hasan', 'son-hucum'],
  },
  {
    id: 'mehter',
    title: 'Mehter',
    category: 'kavram',
    body: [
      'Osmanlı askerî müzik takımıdır. Kös, davul, nakkare, zurna, boru ve zillerden oluşur. Savaşta ve kuşatmalarda askerlere cesaret vermek, düşmanı sarsmak için çalınırdı.',
      'Kaynaklar son hücumdan önceki gecelerde ve hücum sırasında davulların ve boruların susmadığını anlatır. Oyunda hücum sırasında çalan mehter birliklerin moralini yükseltir.',
    ],
    sources: ['tursun', 'emecen', 'barbaro'],
    related: ['son-hucum'],
  },
  {
    id: 'divan',
    title: 'Divan',
    category: 'kavram',
    body: [
      'Sultan’ın başkanlığında ya da onun adına vezirlerin toplandığı devlet meclisidir. Siyasi, askerî ve hukuki meseleler burada görüşülür.',
      'Kuşatma boyunca Divan’da iki kanat vardı: Çandarlı Halil Paşa’nın çevresindeki barış yanlıları ve Zağanos Paşa’nın önderliğindeki savaş yanlıları. 26 Mayıs’taki toplantıda Sultan savaş kanadının görüşünü benimsedi.',
      'Oyunda Divan dengesi bir gösterge olarak izlenir: zaferler ve kararlı adımlar dengeyi savaşa, yenilgiler ve ağır kayıplar barışa çeker. Denge barıştan yana çökerse kuşatma kaldırılabilir.',
    ],
    sources: ['inalcik', 'emecen', 'tansel'],
    related: ['halil-pasa', 'zaganos-pasa'],
  },
  {
    id: 'azap',
    title: 'Azap',
    category: 'kavram',
    body: [
      'Hafif silahlı piyade askeridir; çoğu okçudur. Kuşatmalarda hendek doldurma, siper kazma ve ilk saldırılar gibi ağır işlerde kullanılırdı.',
      'Ucuz ve çok yönlüdürler, ama zırhları zayıf olduğu için surlardaki okçulara karşı savunmasızdırlar.',
    ],
    sources: ['inalcik', 'emecen'],
    related: ['basibozuk', 'timar'],
  },
  {
    id: 'basibozuk',
    title: 'Başıbozuk (Gönüllüler)',
    category: 'kavram',
    body: [
      'Düzenli birliklere bağlı olmayan, ganimet ve gaza için sefere katılan gönüllülerdir. Aralarında farklı yerlerden ve dinlerden insanlar bulunabiliyordu.',
      'Son hücumun ilk dalgasını oluşturdular. Kalabalık ama disiplinsizdiler; amaçları savunucuları yormak ve okları, taşları üzerlerine çekmekti.',
    ],
    sources: ['kritovulos', 'emecen'],
    related: ['azap', 'son-hucum'],
  },
  {
    id: 'akinci',
    title: 'Akıncı',
    category: 'kavram',
    body: [
      'Uç beylerinin emrindeki hafif atlı akın birlikleridir. Düşman topraklarında keşif ve baskın yapar, düşmanı yıpratırlardı.',
      'Surlara karşı işe yaramazlar, ama çevre güvenliği ve uzak seferler için vazgeçilmezdirler. Turahan Bey’in 1452 Mora akını buna bir örnektir.',
    ],
    sources: ['inalcik', 'emecen'],
    related: ['turahan-bey', 'mora'],
  },
  {
    id: 'aman',
    title: 'Aman ve Kılıç Hakkı',
    category: 'kavram',
    body: [
      'İslam ve Osmanlı savaş hukukuna göre teslim olan bir şehre aman verilir: halkın canı, malı ve inancı korunur. Direnip kılıçla alınan şehir ise askerin yağmasına bırakılırdı.',
      'Sultan son teslim çağrısında şehre aman teklif etti; teklif reddedilince şehir savaşla alındı ve üç günlük yağma ilan edildi. Galata ise kapılarını açtığı için ahidnameyle güvence aldı.',
    ],
    sources: ['inalcik', 'emecen'],
    related: ['teslim-teklifi', 'galata'],
  },
];

/** Ansiklopedi — KAYNAKLAR (every source in data/sources.ts). */
const KAYNAK_METIN: Record<string, { subtitle: string; body: string[]; related?: string[] }> = {
  tursun: {
    subtitle: 'Osmanlı kaynağı — kuşatmada bulunmuş',
    body: [
      'Tursun Bey, Sultan’ın divanında kâtip olarak çalışmış ve kuşatmaya bizzat katılmış bir Osmanlı devlet adamıdır. Târîh-i Ebü’l-Feth’i hayatının son yıllarında, 15. yüzyılın sonlarında yazdı.',
      'Eser süslü bir dille yazılmıştır ve Sultan’ı över; ama bir görgü tanığının gözlemlerini içerir. Kuşatmanın düzeni, son hücum ve Sultan’ın Ayasofya ziyareti için temel Osmanlı kaynağıdır.',
    ],
    related: ['fatih', 'ayasofya'],
  },
  apz: {
    subtitle: 'Osmanlı kaynağı — erken Osmanlı tarihi',
    body: [
      'Aşıkpaşazade, 15. yüzyılda yaşamış bir derviş ve tarihçidir. Tevârîh-i Âl-i Osmân, Osmanlı hanedanının kuruluşundan kendi zamanına kadar olan olayları sade bir Türkçeyle anlatır.',
      'Eser, halk arasındaki anlatıları ve dervişlerin bakış açısını yansıtır. Fetih anlatısı kısadır ama Osmanlı tarafının olayı nasıl hatırladığını gösterir.',
    ],
  },
  kivami: {
    subtitle: 'Osmanlı kaynağı — fetihnâme türü',
    body: [
      'Kıvâmî’nin Fetihnâme-i Sultan Mehmed’i, Sultan Mehmed’in seferlerini anlatan bir tarih eseridir ve 15. yüzyılın sonlarına tarihlenir (doğrulanacak).',
      'Eser, Sultan’ın fetihlerini övgüyle ve ayrıntılı biçimde anlatır; diğer Osmanlı kroniklerini kontrol etmek için değerlidir. Tıpkıbasımı Franz Babinger tarafından yayımlanmıştır (doğrulanacak).',
    ],
  },
  nesri: {
    subtitle: 'Osmanlı kaynağı — genel tarih',
    body: [
      'Mehmed Neşrî, II. Bayezid döneminde yaşamış bir tarihçidir. Kitâb-ı Cihan-nümâ adlı genel tarihinin Osmanlı bölümü, daha önceki kronikleri bir araya getirir.',
      'Neşrî, Aşıkpaşazade ve diğer kaynakları birleştirip düzenlediği için erken Osmanlı tarihinin en çok kullanılan derlemelerinden biridir.',
    ],
  },
  kritovulos: {
    subtitle: 'Sultan’a sunulmuş Rumca tarih',
    body: [
      'Kritovoulos, İmroz adasından bir Rum yöneticidir. Fetihten sonra Sultan’ın hizmetine girdi ve 1451–1467 yıllarını anlatan tarihini Rumca yazıp Sultan’a sundu. El yazması Topkapı Sarayı’nda bulunmuştur.',
      'Kuşatmanın en ayrıntılı ve düzenli anlatımlarından birini verir; Ulubatlı Hasan’ın hikâyesi, havan topu ve Haliç köprüsü gibi ayrıntılar ondan gelir. Sultan’ı över ama Rumların acısını da gizlemez. Türkçeye Tarih-i Sultan Mehmed Han-ı Sânî adıyla çevrilmiştir.',
    ],
    related: ['ulubatli-hasan', 'havan'],
  },
  aksemseddin: {
    subtitle: 'Belge — kuşatma sırasında yazılmış mektup',
    body: [
      'Akşemseddin’in kuşatma sırasında, 20 Nisan deniz yenilgisinden sonra Sultan’a yazdığı mektuptur. Topkapı Sarayı Arşivi’nde korunur ve Halil İnalcık tarafından yayımlanmıştır (doğrulanacak).',
      'Mektup, ordugâhtaki moral bozukluğunu, Sultan’ın çevresindeki tartışmaları ve şeyhin öğütlerini anlatır. Kuşatmanın içinden, olayların sıcağında yazılmış ender bir Osmanlı belgesidir.',
    ],
    related: ['aksemseddin', 'deniz-savasi'],
  },
  fetihname: {
    subtitle: 'Belge — zafer mektupları',
    body: [
      'Fetihten sonra Sultan’ın Memlük sultanı, Mekke şerifi ve Karakoyunlu hükümdarı Cihan Şah gibi İslam dünyasının önde gelenlerine gönderdiği zafer mektuplarıdır.',
      'Fetihnameler olayı Osmanlı devletinin resmi bakışıyla anlatır. Önemli bir kısmı Feridun Bey’in 16. yüzyılda derlediği Münşeâtü’s-Selâtîn’de korunmuştur.',
    ],
  },
  tansel: {
    subtitle: 'Modern çalışma',
    body: [
      'Selâhattin Tansel’in 1953’te yayımlanan çalışması, Fatih’in siyasi ve askerî faaliyetlerini öncelikle Osmanlı kaynaklarına dayanarak inceler.',
      'Osmanlı kroniklerini karşılaştırmalı olarak kullandığı için oyunun “Osmanlı kaynakları esas” ilkesine temel oluşturan eserlerden biridir.',
    ],
  },
  emecen: {
    subtitle: 'Modern çalışma',
    body: [
      'Feridun M. Emecen’in İstanbul’un Fethi Olayı ve Meseleleri, kuşatmanın tartışmalı noktalarını (tarihler, sayılar, Kerkoporta, Halil Paşa’nın tutumu gibi) kaynakları karşılaştırarak ele alır.',
      'Oyunda kaynaklar çeliştiğinde en çok kabul gören görüşü belirlemek için başvurulan temel modern çalışmalardandır.',
    ],
  },
  emecen2: {
    subtitle: 'Modern çalışma',
    body: [
      'Feridun M. Emecen’in Fetih ve Kıyamet 1453 adlı eseri, fethi hem Osmanlı hem Bizans tarafının beklentileri, kehanetleri ve kıyamet inançları açısından inceler.',
      'Ay tutulması, ikona alayı ve işaretler gibi olayların iki tarafta nasıl yorumlandığını anlamak için önemlidir.',
    ],
  },
  inalcik: {
    subtitle: 'Modern çalışma',
    body: [
      'Halil İnalcık’ın Fatih Devri Üzerinde Tetkikler ve Vesikalar adlı eseri (1954), Fatih dönemini arşiv belgelerine dayanarak inceler; Akşemseddin’in mektubu gibi belgeleri de değerlendirir.',
      'İnalcık’ın Osmanlı kurumları, tımar sistemi ve Fatih’in siyaseti üzerine çalışmaları, oyunun kurumlar ve Divan dengesi tasarımına temel olmuştur.',
    ],
  },
  barbaro: {
    subtitle: 'Kontrol kaynağı — Venedikli görgü tanığı',
    body: [
      'Nicolò Barbaro, şehirdeki Venedik gemilerinden birinde hekimdi. Kuşatma boyunca gün gün tuttuğu günlük, özellikle deniz olaylarının tarihleri için en düzenli kaynaktır.',
      'Venedikli bakışıyla yazdığı için Cenevizlilere karşı önyargılıdır. Oyunda tarihleri ve surların içindeki durumu kontrol etmek için kullanılır.',
    ],
  },
  sphrantzes: {
    subtitle: 'Kontrol kaynağı — imparatorun yakını',
    body: [
      'Georgios Sphrantzes, İmparator Konstantinos’un yakın dostu ve devlet adamıydı. Chronicon Minus adıyla bilinen kısa kroniği güvenilir sayılır; daha uzun Chronicon Maius ise sonradan genişletilmiş bir metindir.',
      'İmparatorun emriyle yaptığı savaşabilecek Rumların sayımı (beş bine yakın; yabancılarla birlikte savunucuların yedi bin civarında olduğu kabul edilir) ve Johannes Grant gibi bilgiler ondan gelir.',
    ],
  },
  doukas: {
    subtitle: 'Kontrol kaynağı — Bizanslı tarihçi',
    body: [
      'Doukas, Midilli’deki Ceneviz yöneticilerin hizmetinde bulunmuş bir Bizanslı tarihçidir. Eseri 15. yüzyılın ortalarına kadar olan olayları anlatır.',
      'Orban ve büyük topun dökümü, Rizzo’nun gemisi ve Kerkoporta gibi birçok canlı ayrıntı yalnızca ondadır. Kerkoporta’yı anlatan tek kaynak olduğu için bu konuda dikkatle okunur.',
    ],
    related: ['kerkoporta', 'orban'],
  },
  leonardo: {
    subtitle: 'Kontrol kaynağı — Sakızlı başpiskopos',
    body: [
      'Sakızlı Leonardo, Midilli başpiskoposuydu ve kilise birliği için Kardinal İsidoros’la birlikte şehre gelmişti. Kuşatmaya tanık oldu ve Ağustos 1453’te Papa’ya uzun bir mektup yazdı.',
      'Mektubu ayrıntılıdır ama Rumlara ve birlik karşıtlarına karşı sert bir dil kullanır; Giustiniani’yi ve Galatalıları suçlayan yargıları dikkatle okunmalıdır.',
    ],
  },
};

export const ENC_KAYNAKLAR: EncyclopediaEntry[] = SOURCES.map((src) => {
  const k = KAYNAK_METIN[src.id];
  return {
    id: `kaynak-${src.id}`,
    title: `${src.author} — ${src.title}`,
    category: 'kaynak' as const,
    subtitle: k?.subtitle ?? src.note,
    body: k?.body ?? [src.note ?? `${src.author} tarafından yazılmış kaynak.`],
    sources: [src.id],
    related: k?.related,
    dogrulanacak: k ? k.body.some((p) => p.includes('doğrulanacak')) : true,
  };
});
