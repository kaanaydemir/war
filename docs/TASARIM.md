# İstanbul'un Fethi — Oyun Tasarım Belgesi

> Durum: Taslak v0.1. Henüz kod yok.
> "(doğrulanacak)" işaretli maddeler kaynak taramasında kesinleştirilecek.

## 0. Temel kararlar

| Konu | Karar |
|---|---|
| Tür | Takvime bağlı tek bir kuşatma stratejisi. Tarihî olaylar iki kilitle açılır: zaman kilidi (en erken hangi gün) ve hazırlık kilidi (hangi kaynak, bina ya da koşul gerekiyor). |
| Görünüm | İzometrik pixel çizim (2:1 ızgara, ana çözünürlük 640×360, tam katlarla büyütme). Işık, su ve renkte Sea of Stars kalitesi. |
| Harita | Havadan gezilebilen tek geniş harita: Rumeli Hisarı, Anadolu Hisarı, Boğaz, Beşiktaş, Galata, Haliç, Kasımpaşa, kara surları, Marmara surları |
| Yönetim | Birlikler gönderilir ve izlenir; tek tek asker yönetilmez |
| Kaybetme | Haçlı yardımı yetişirse ya da Divan kuşatmayı kaldırırsa |
| Son | Kim kazanırsa son onun zaferi olur |
| Yaş sınırı | +16 |
| Tarih | Tarihe tam sadakat; Osmanlı kaynakları esas |
| Platform | Önce Steam (PC) |
| Dil | Türkçe |
| Çizimler | Claude |
| Motor (öneri) | Godot 4 |
| Görsel kimlik | Harita pixel çizim; arayüz, bilgi kartları ve ara sahneler Osmanlı minyatürlerinden esinlenir |

### Gerçekçilik ilkesi

- **Doğru olanlar:** Olaylar, kişiler, yerler, silahlar ve tarihler gerçektir.
- **Bilerek sıkıştırılanlar:** Zaman, asker sayıları ve haritadaki mesafeler. Bu sıkıştırmalar oyunda açıkça belirtilir.
- **Kaynaklar çeliştiğinde:** Oyun en çok kabul gören görüşü kullanır. Oyun içi ansiklopedide farklı görüşler kaynaklarıyla birlikte gösterilir.

---

## 1. Bir oyun günü (temel döngü)

**Zaman akışı:** Gerçek zamanlı akar. İstenince durdurulabilir; 1×, 2× ve 3× hız seçenekleri var. Oyun gerçek takvim tarihleriyle ilerler.

| Aşama | Zaman birimi | 1× hızda süre | Toplam |
|---|---|---|---|
| Hazırlık (Mart 1452 → Edirne'den hareket) | Hafta | ~60 sn | ~50 dk |
| Kuşatma (Gün 1 → son hücum) | Gün | ~3 dk | ~2,5–3 saat |

### Kuşatmada bir gün

1. **Şafak (raporlar):** Gece Bizans'ın onardığı yerler, kayıplar, kalan erzak, casus haberleri ve günün olay kartı gelir. Oyun bu sırada isteğe bağlı olarak kendiliğinden durur.
2. **Gündüz:** Toplar oyuncunun seçtiği sur bölümünü döver. İşçiler kaynak toplar ve inşa eder. Birlikler görevlerini yapar: hendek doldurma, mevzi kurma, hücum.
3. **Akşam:** Toplar soğur, barut ve gülle sayımı yapılır, Divan olayları gelir.
4. **Gece:** Bizans gedikleri barikatla onarır. Lağımcılar kazar (gece fark edilmeleri daha zordur). Gizli operasyonlar yapılır, örneğin gemilerin karadan geçirilmesi. İki taraf da gece baskını yapabilir.

### Temel döngü

```
Kaynak topla → Üret ve inşa et → Olay kilitlerini aç
      ↑                                  ↓
Moral, erzak ve zaman değişir    Surları döv ↔ Bizans gece onarır
      ↑                                  ↓
Sonucu izle ← Hücum et (birliği gönder) ← Gedik açılır ve Bizans direnci kırılır
```

### Ekrandaki göstergeler

- Takvim ve gün sayacı
- Haçlı yardımının tahmini geliş aralığı (belirsiz bir zaman aralığı olarak gösterilir)
- Ordu morali
- Erzak (kaç günlük kaldığı)
- Divan dengesi (barış yanlıları ile savaş yanlıları)
- Tahmini Bizans direnci (casuslar netleştirir)
- Her sur bölümünün durumu

### Kazanma ve kaybetme

- **Zafer:** Son hücum başarılı olur ve şehir düşer.
- **Yenilgi 1:** Haçlı yardımı yetişir.
- **Yenilgi 2:** Moral ve erzak çöker, Divan'da barış yanlıları üstün gelir ve kuşatma kaldırılır.

### Zorluk

Kolay, Normal ve Zor seviyeleri var. Zorluk, yardımın gelebileceği en erken günü ve Bizans'ın onarım hızını değiştirir. Normal'de tarihteki hızla (54 gün) giden oyuncu güvende kalır.

---

## 2. Kaynaklar ve ekonomi

| Kaynak | Nereden gelir | Ne için harcanır |
|---|---|---|
| Akçe | Edirne hazinesi, vergiler | Ustaların ücreti (Orban), paralı işçi, satın alma, bahşiş (moral) |
| Taş | Taş ocakları (Boğaz kıyısı, sur dışı) | Rumeli Hisarı, mevziler, **taş gülle** (taşçılar yontar) |
| Kereste | Boğaz'ın kuzeyindeki ormanlar | Kızaklar, kuşatma kulesi, siperler, gemi, Haliç köprüsü, odun kömürü |
| Maden (bakır, kalay) | Edirne'ye gelen kafileler | Dökümhanede **tunç** üretimi |
| Barut | Baruthane (kömür + akçe ile alınan güherçile ve kükürt) | Top atışı |
| Erzak | Edirne ve Anadolu kafileleri, Gelibolu'dan deniz yoluyla, çevre köyler | Her asker ve işçi her gün tüketir |
| İnsan gücü | Asker (birlikler) ve işçi (amele, taşçı, marangoz, dökümcü, lağımcı) | Görevler |

### Üretim zincirleri

- **Top:** Maden + akçe → dökümhanede tunç → tunç + usta + süre → top. Büyük top için Orban gerekir.
- **Büyük topun cepheye gelmesi:** Top döküldükten sonra onlarca çift öküzle yola çıkar. Yol düzleyen işçiler ve köprüler hazırsa erken, değilse geç gelir. Ateş gücü yüksektir ama soğuması gerektiği için günde ancak birkaç atış yapabilir.
- **Gemilerin karadan geçirilmesi:** Kereste (kızak ve kalas) + yağ + öküz + işçi + yol açma + Galata'nın sakin kalması.
- **Lağım:** Lağımcı birlikleri (madenlerde deneyim kazanmış ustalar) + tünel desteği için kereste.
- **Kuşatma kulesi:** Kereste + ıslak deri kaplama.

### Edirne

Edirne haritada yer almaz, bir panel olarak çalışır. Dökümhane, hazine ve asker toplama çağrısı oradan yönetilir. Kafileler haritanın kenarındaki Edirne yolundan girer.

---

## 3. Osmanlı ordusu

Her birlik gerçek bir asker sayısını temsil eder (ör. 500 kişi). Her birliğin bir komutanı vardır; morali, yorgunluğu ve deneyimi ayrı ayrı izlenir.

| Birlik | Görevi | Güçlü yanı | Zayıf yanı |
|---|---|---|---|
| Yeniçeriler | Elit piyade; son dalga | Disiplin, moral | Az sayıda, kaybı yerine konamaz |
| Azaplar | Okçu hafif piyade; hendek doldurma | Ucuz, çok yönlü | Okçulara karşı savunmasız |
| Tımarlı sipahiler (Rumeli, Anadolu) | Çevre güvenliği, ikmal koruma; kuşatmada attan inip savaşır | Hareketli | Sur hücumunda orta güçte |
| Başıbozuklar (gönüllüler) | Hücumun ilk dalgası | Çok sayıda | Düşük disiplin, çabuk dağılır |
| Akıncılar | Keşif, baskın, Mora seferi | Hızlı | Surlara karşı işe yaramaz |
| Topçular | Top mevzileri | Surları yıkan tek güç | Mevzi değiştirmesi yavaş |
| Lağımcılar | Sur altına tünel kazmak | Gedik açar | Karşı lağımla yok olabilir |
| Mehter | Hücum sırasında moral verir | — | — |
| Donanma (kadırga, kalyete, fusta, nakliye gemileri) | Abluka, deniz çatışması, Haliç | — | Büyük Ceneviz gemilerine karşı zayıf |

### Komutanlar ve oyundaki etkileri

- **II. Mehmed (Fatih):** Merkezde, Topkapı önü ve Lykos vadisi. Ordugâhı dolaşınca moral artar; son hücumu yalnızca o ilan edebilir.
- **Çandarlı Halil Paşa (sadrazam):** Akçe ve diplomasi bonusu verir ama barış yanlısıdır; Divan dengesini o yöne çeker.
- **Zağanos Paşa:** Haliç'in kuzeyinde Galata'yı gözetler. Lağımlar, Haliç köprüsü ve gemilerin karadan geçirilmesinde bonus verir; savaş yanlısıdır.
- **Saruca Paşa:** Rumeli Hisarı kulelerinden birini yaptırır; merkezde görev alır.
- **Karaca Paşa (Rumeli beylerbeyi):** Sol kanat, Haliç'ten Blahernai surlarına kadar.
- **İshak Paşa (Anadolu beylerbeyi):** Sağ kanat, Topkapı'dan Marmara'ya kadar; son hücumun ikinci dalgası.
- **Baltaoğlu Süleyman Bey, sonra Hamza Bey:** Donanma komutanları. 20 Nisan yenilgisinden sonra komutan değişir.
- **Turahan Bey:** Mora seferini yönetir (hazırlık aşamasında bir karar).
- **Orban:** Dökümcü usta; büyük top için şart.
- **Akşemseddin:** Manevi önder; moral olaylarında rol alır.
- **Ulubatlı Hasan:** Son hücumda sancağı burca diker (tarihî olay).

### Birliklere verilebilen emirler

Konuşlan, bombardımanı koru, hendek doldur, kuşatma kulesini ilerlet, lağım kaz, hücum et, geri çekil, keşif ve baskın, ikmal koru, dinlen. Emir verildikten sonra oyuncu birliği izler; ekranda kayıplar ve moral akar.

### Hücumun sonucu

Şunlara bağlıdır: sur bölümünün hasarı, o bölümdeki savunucu sayısı ve morali, birliğin yorgunluğu, gündüz mü gece mi olduğu, mehter ve komutan.

---

## 4. Bizans savunması (yapay zekâ)

### Başlangıç düzeni

Tarihteki dağılıma göre kurulur. Bu dağılım Osmanlı kaynaklarında ayrıntılı olmadığı için diğer kaynaklar yalnızca kontrol amacıyla kullanılır.

- **Konstantinos XI ve Giustiniani:** Topkapı ve Lykos vadisi.
- **Venedikliler:** Blahernai.
- **Notaras:** Haliç surları.
- **Orhan Çelebi:** Marmara surları (doğrulanacak).
- **Johannes Grant:** Karşı lağımlar.
- **Savunucu sayısı:** Yaklaşık 7.000 (Sphrantzes'in sayımı).

### Davranışlar

- **Tehdit puanı:** Her sur bölümü için hesaplanır. Girdileri: bombardıman hasarı, yakındaki Osmanlı birlikleri, kuşatma kulesi, fark edilen lağımlar. Yedek askerler en çok tehdit altındaki bölüme kaydırılır.
- **Gece onarımı:** Onarım hızı = savunucu ve sivil işçi sayısı × moral × malzeme. Gedikler ahşap barikat, toprak dolu fıçı ve çuvallarla kapatılır.
- **Gemiler Haliç'e inince:** Bizans, Haliç surlarına asker kaydırmak zorunda kalır ve kara surları zayıflar (tarihteki etkisi).
- **Karşı lağım:** Lağımlar belli bir olasılıkla fark edilir. Fark edilen tünel çökertilir. Esir düşen lağımcılardan bilgi alınırsa diğer tüneller de açığa çıkar.
- **Gece baskınları:** Hendekteki Osmanlı işlerine ve kuşatma kulesine yapılır. Kuşatma kulesi yakılabilir.
- **Deniz:** Haliç zinciri, Bizans ve İtalyan gemileri, dışarıdan gelen yardım gemileri, Haliç'teki Osmanlı gemilerini yakma girişimi.
- **Bizans morali:** 20 Nisan deniz zaferiyle yükselir. Gemilerin Haliç'e inmesi, ay tutulması ve Giustiniani'nin yaralanmasıyla düşer; bu sonuncusu çöküşe yol açar.
- **Teslim teklifi:** Konstantinos her durumda reddeder (tarihte olduğu gibi).
- **Sis perdesi:** Oyuncu şehrin içini görmez. Casuslar, Galata ve kaçaklar bilgi getirir.

### Galata

Ceneviz kolonisidir ve tarafsızdır. Galata ile ilişki bir gösterge olarak izlenir; iki tarafa da bilgi sızdırır. Gemilerin karadan geçirilmesi için Galata'nın sakin kalması gerekir.

### Haçlı yardımı

- Yardımın geleceği gün oyuncudan gizli bir aralıktır. Normal zorlukta en erken ~60. gün.
- Casus ve tüccar haberleri bu aralığı zamanla daraltır.
- Aşağıdaki hamleler yardımı geciktirir:
  - Macaristan ile ateşkes
  - Venedik ile antlaşma
  - Turahan Bey'in Mora seferi
  - Gelibolu'da donanma bırakmak
  - Rumeli Hisarı'nı erken bitirmek
- Rizzo kararının sonucuna göre Venedik'in öfkesi yardımı hızlandırabilir.

---

## 5. Olay takvimi

Olay türleri:

- **Sabit:** Takvimde belli bir tarihte olur.
- **Koşullu:** Oyuncu kilitleri açınca olur.
- **Tepkisel:** Bizans ya da dış güçler tetikler.
- **Karar:** Seçim kartı olarak gelir; kartta "Tarihte ne oldu?" notu bulunur.

Takvim gerçek tarihlerle işler. Edirne'den ne zaman yola çıkılacağına oyuncu karar verir: erken çıkarsa yardım tehdidine karşı zaman kazanır ama daha az hazırlıklı olur. Gün numaraları tarihteki başlangıca (6 Nisan = Gün 1) göre verilmiştir.

### Hazırlık (1452 – Mart 1453)

| # | Olay | Tarih | Türü | Kilit veya etki |
|---|---|---|---|---|
| H1 | Edirne Divanı: kuşatma kararı | 1452 başı | Karar | Divan dengesi tanıtılır (öğretici bölüm) |
| H2 | Macaristan ve Venedik ile antlaşmalar | 1451–52 | Karar | Yardımın gelişini geciktirir |
| H3 | Rumeli Hisarı (Boğazkesen) inşası. Mimarı Müslihiddin Ağa. 3 ana kule (Saruca, Halil, Zağanos Paşa), 3 kapı, 12 küçük kule | 15 Nisan – 31 Ağustos 1452 | Koşullu | Taş + kereste + işçi. Bitince Boğaz denetimi başlar ve Bizans erzakı düşer |
| H4 | Boğaz denetimi ve Antonio Rizzo'nun gemisinin batırılması | Kasım 1452 | Karar | Boğaz kesin kontrol altına girer; buna karşılık Venedik öfkelenir |
| H5 | Orban'ın gelişi, top dökümü ve deneme atışı | 1452 sonu – Ocak 1453 | Koşullu | Dökümhane + tunç + akçe |
| H6 | Turahan Bey'in Mora seferi | 1452 sonbaharı | Karar | Ordudan asker ayrılır; buna karşılık Mora'dan yardım gelmez |
| H7 | Trakya'daki Bizans kasabaları | 1452–53 | Koşullu | Birlik gönderilir (hangi kasabalar olduğu doğrulanacak) |
| H8 | Büyük topun taşınması | Şubat – Mart 1453 | Koşullu | Öküz + yol + köprü; varış süresi değişken |
| H9 | Ordunun toplanması (tımar çağrısı, kapıkulu, gönüllüler) | Kış 1452–53 | Koşullu | Asker sayısını belirler |
| H10 | Edirne'den hareket | Tarihte 23 Mart 1453 | Karar | Kuşatmanın başlangıç gününü belirler |

### Kuşatma (6 Nisan – 29 Mayıs 1453)

| # | Olay | Tarih | Türü | Kilit veya etki |
|---|---|---|---|---|
| K1 | Ordu surların önünde: otağ Maltepe'de, kanatlar yerleşir, donanma Beşiktaş'ta; Haliç zinciri gerilmiş | 6 Nisan (Gün 1) | Sabit | Birlikler konuşlanır |
| K2 | Dış kaleler (Tarabya ve diğerleri) ile Büyükada kulesi | Nisan'ın ilk haftası | Koşullu | Bölge güvenliği sağlanır |
| K3 | Ağır bombardıman başlar | Büyük top mevzilenince | Koşullu | Sur hasarı başlar |
| K4 | İlk büyük gece hücumu (Lykos vadisi) | Tarihte 18 Nisan | Karar | Tarihte püskürtüldü |
| K5 | Deniz çatışması: 3 Ceneviz + 1 Bizans gemisi ablukayı yarar; Fatih atıyla denize girer; Baltaoğlu'nun yerine Hamza Bey gelir | 20 Nisan | Tepkisel | Sonuç oyuncunun donanma gücüne bağlı |
| K6 | Akşemseddin'in Fatih'e mektubu (gerçek belge) | 20 Nisan'dan sonra | Sabit | Moral olayı |
| K7 | Gemilerin karadan Haliç'e indirilmesi (~70 gemi, Beşiktaş'tan Kasımpaşa'ya, yağlanmış kızaklarla, gece) | Tarihte 22 Nisan | Koşullu | En erken ~Gün 12 + kereste, yağ, öküz, işçi, sakin Galata, gece |
| K8 | Venedik'in Haliç'teki Osmanlı gemilerini yakma baskını | 28 Nisan | Tepkisel | Galata ile ilişki iyiyse önceden haber alınır |
| K9 | Haliç üzerine fıçılardan köprü ve yüzer top platformu | Nisan sonu – Mayıs | Koşullu | Zağanos Paşa; Haliç'te ikinci cephe |
| K10 | Ara hücumlar | Mayıs | Karar | Tarihe referans |
| K11 | Lağımlar ve karşı lağımlar (Johannes Grant) | Mayıs ortası | Koşullu ve tepkisel | Gedik açılır ya da tünel kaybedilir |
| K12 | Kuşatma kulesi; gece yakılır | Mayıs ortası (tarih doğrulanacak) | Koşullu ve tepkisel | |
| K13 | Teslim teklifi; Konstantinos reddeder | Mayıs'ın son haftası | Sabit | |
| K14 | Ay tutulması | 22 Mayıs | Sabit (gökyüzü olayı) | Bizans morali düşer |
| K15 | Esir lağımcılar tünelleri ele verir; yardım filosunu aramaya çıkan gemi eli boş döner | 23 Mayıs (doğrulanacak) | Tepkisel | |
| K16 | Surların ardından gelen haberler: ikona alayı, dolu, sis | 24–25 Mayıs | Sabit | Bizans morali düşer |
| K17 | Divan: Halil Paşa (kuşatmayı kaldır) karşısında Zağanos Paşa (devam) | 26 Mayıs | Karar | Divan dengesi; Yenilgi 2'ye götürebilir |
| K18 | Son hücumun ilanı; ordugâhta ateşler, dinlenme | 27–28 Mayıs | Koşullu | Oyuncu ilan eder (en az bir gedik + düşük Bizans direnci) |
| K19 | Son hücum: başıbozuklar, Anadolu askerleri, yeniçeriler; Giustiniani yaralanır; Kerkoporta (yalnızca Doukas anlatır, ansiklopedide not düşülür); Ulubatlı Hasan; şehir düşer; Fatih şehre girer ve Ayasofya'ya gider | 29 Mayıs | Koşullu | Zafer sonu ve karşılaştırma ekranı ("Sen X günde aldın, tarihte 53 gün sürdü") |

---

## 6. Açık konular

- **Görsel deneme sahnesi:** Topkapı önündeki surlar, hendek, birkaç çadır ve bir top; gündüz ve gece hâliyle. Koda geçince ilk iş bu olacak ve kullanıcı onaylayınca devam edilecek.
- **Zafer sonu:** Fetihten sonraki yağmanın ve kayıpların nasıl anlatılacağı.
- **Kaynak doğrulama turu:** "(doğrulanacak)" işaretli maddeler kesinleştirilecek.
- **Diğer:** Ses ve müzik (mehter), arayüz düzeni, kayıt sistemi.

---

## 7. Kaynakça

### Osmanlı kaynakları (esas)

- Tursun Bey, *Târîh-i Ebü'l-Feth* (kuşatmada bizzat bulunmuş)
- Aşıkpaşazade, *Tevârîh-i Âl-i Osmân*
- Kıvâmî, *Fetihnâme-i Sultan Mehmed*
- Neşrî, *Kitâb-ı Cihan-nümâ*
- Kritovoulos, *Tarih-i Sultan Mehmed Han-ı Sânî* (eserini Fatih'e sunmuş bir Rum)

### Belgeler

- Akşemseddin'in kuşatma sırasında Fatih'e yazdığı mektup
- Fatih'in fetihten sonra gönderdiği fetihnameler

### Modern çalışmalar

- Selâhattin Tansel, *Osmanlı Kaynaklarına Göre Fatih Sultan Mehmed'in Siyasi ve Askeri Faaliyeti*
- Feridun M. Emecen, *İstanbul'un Fethi Olayı ve Meseleleri*; *Fetih ve Kıyamet 1453*
- Halil İnalcık'ın Fatih dönemi çalışmaları

### Kontrol amaçlı (tarih doğrulama ve surların içindeki durum)

- Nicolò Barbaro'nun günlüğü, Sphrantzes, Doukas, Sakızlı Leonardo

### Görsel kaynaklar

- Buondelmonti'nin İstanbul haritası (1420'ler)
- Matrakçı Nasuh'un İstanbul minyatürü
- Panorama 1453 Tarih Müzesi
