/**
 * State gauges hanging under the top bar: army morale, provisions (days),
 * Divan balance, Galata relation, Byzantine resistance estimate and the
 * crusader relief window (grows tense & red as it approaches).
 */
import { formatDate } from '../../core/calendar';
import type { GameState } from '../../core/state';
import { store } from '../../core/store';
import { erzakDays } from '../../features/economy/api';
import { blockadeStrength } from '../../features/navy/api';
import { defenderRange, divanLabel, erzakLevel, fmtDateRange, fmtDays, fmtInt, galataLabel, moraleLabel, reliefTension } from './format';
import { safe } from './logic';
import { Cubuk, Ikon, Ipucu, Sayi } from './ui';

function Cip({ ikon, ad, children, ipucu, class: cls = '' }: { ikon: string; ad: string; children: preact.ComponentChildren; ipucu: preact.ComponentChildren; class?: string }) {
  return (
    <Ipucu icerik={ipucu}>
      <div class={`gosterge ${cls}`}>
        <Ikon ad={ikon} />
        <div class="gosterge-govde">
          <span class="gosterge-ad">{ad}</span>
          <span class="gosterge-deger">{children}</span>
        </div>
      </div>
    </Ipucu>
  );
}

function Moral({ s }: { s: GameState }) {
  const m = s.morale;
  const tone = m < 30 ? 'kirmizi' : m < 50 ? 'turuncu' : 'yesil';
  return (
    <Cip
      ikon="moral"
      ad="Ordu morali"
      class={m < 30 ? 'tehlike' : ''}
      ipucu={
        <div class="ipucu-icerik">
          <div class="ipucu-baslik">
            Ordu morali <b class="num">%{Math.round(m)}</b>
          </div>
          <div class="ipucu-metin">{moraleLabel(m)}. Zaferler, Sultan’ın ordugâhı dolaşması, mehter ve bahşiş yükseltir; kayıplar, açlık ve başarısız hücumlar düşürür.</div>
        </div>
      }
    >
      <Cubuk deger={m / 100} tur={tone} class="cubuk-kisa" />
      <Sayi deger={Math.round(m)} fmt={(n) => `%${Math.round(n)}`} ucan={false} class="num kucuk" />
    </Cip>
  );
}

function Erzak({ s }: { s: GameState }) {
  const days = safe(() => erzakDays(s), Infinity);
  const lv = erzakLevel(days);
  return (
    <Cip
      ikon="erzak"
      ad="Erzak"
      class={lv === 2 ? 'tehlike' : lv === 1 ? 'uyari' : ''}
      ipucu={
        <div class="ipucu-icerik">
          <div class="ipucu-baslik">Erzak</div>
          <div class="ipucu-metin">
            Ambarlardaki zahire, ordunun ve amelenin bugünkü tüketimiyle <b>{fmtDays(days)}</b> gün yeter. Kervanlar Edirne yolundan, gemiler Gelibolu’dan getirir.
          </div>
          {lv > 0 && <div class="ipucu-metin kirmizi-yazi">Açlık başlarsa moral hızla çöker!</div>}
        </div>
      }
    >
      <span class="num">{fmtDays(days)}</span>
      <span class="birim">gün</span>
    </Cip>
  );
}

function Divan({ s }: { s: GameState }) {
  const v = Math.max(-100, Math.min(100, s.divan));
  return (
    <Cip
      ikon="divan"
      ad="Divan"
      class={v < -60 ? 'tehlike' : v < -25 ? 'uyari' : ''}
      ipucu={
        <div class="ipucu-icerik">
          <div class="ipucu-baslik">Divan dengesi</div>
          <div class="denge-etiket">
            <span>Çandarlı Halil Paşa · barış</span>
            <span>savaş · Zağanos Paşa</span>
          </div>
          <Cubuk deger={1} tur="denge" isaret={(v + 100) / 200} class="cubuk-genis" />
          <div class="ipucu-metin">{divanLabel(v)}.</div>
          <div class="ipucu-metin soluk">Barış yanlıları üstün gelirse Divan kuşatmayı kaldırabilir.</div>
        </div>
      }
    >
      <span class="denge-uc barisci">H</span>
      <Cubuk deger={1} tur="denge" isaret={(v + 100) / 200} class="cubuk-kisa" />
      <span class="denge-uc savasci">Z</span>
    </Cip>
  );
}

function Galata({ s }: { s: GameState }) {
  const v = Math.max(-100, Math.min(100, s.galata));
  return (
    <Cip
      ikon="galata"
      ad="Galata"
      class={v <= -50 ? 'tehlike' : v <= -15 ? 'uyari' : ''}
      ipucu={
        <div class="ipucu-icerik">
          <div class="ipucu-baslik">
            Galata (Ceneviz) <b>{galataLabel(v)}</b>
          </div>
          <Cubuk deger={1} tur="iliski" isaret={(v + 100) / 200} class="cubuk-genis" />
          <div class="ipucu-metin">Ceneviz kolonisi resmen tarafsızdır ama iki tarafa da bilgi sızdırır. Gemilerin karadan yürütülmesi için Galata’nın sakin kalması gerekir.</div>
        </div>
      }
    >
      <span class="galata-etiket">{galataLabel(v)}</span>
    </Cip>
  );
}

function Bizans({ s }: { s: GameState }) {
  const est = s.byz.estimatedDefenders || 0;
  const [lo, hi] = defenderRange(est, s.byz.intel);
  const blokaj = s.time.phase === 'kusatma' ? safe(() => blockadeStrength(s), null) : null;
  return (
    <Cip
      ikon="bizans"
      ad="Bizans direnci"
      ipucu={
        <div class="ipucu-icerik">
          <div class="ipucu-baslik">Tahmini Bizans direnci</div>
          <div class="ipucu-metin">
            Surlarda tahminen <b class="num">{fmtInt(lo)}</b>–<b class="num">{fmtInt(hi)}</b> savunucu var.
          </div>
          <div class="ipucu-tablo">
            <span>Casus bilgisi</span>
            <b class="num">%{Math.round(s.byz.intel)}</b>
            {blokaj != null && (
              <>
                <span>Deniz ablukası</span>
                <b class="num">%{Math.round(blokaj * 100)}</b>
              </>
            )}
            {s.byz.intel >= 40 && Number.isFinite(s.byz.food) && (
              <>
                <span>Şehrin zahiresi (tahmini)</span>
                <b class="num">≈{fmtDays(s.byz.food)} gün</b>
              </>
            )}
          </div>
          <div class="ipucu-metin soluk">Casuslar, kaçaklar ve Galata haberleri tahmini netleştirir. Sphrantzes’e göre şehirde ≈7.000 savunucu vardı.</div>
        </div>
      }
    >
      <span class="yaklasik">≈</span>
      <Sayi deger={est} fmt={(n) => fmtInt(Math.round(n / 100) * 100)} ucan={false} class="num" />
    </Cip>
  );
}

function Hacli({ s }: { s: GameState }) {
  const r = s.relief;
  if (!r || !Number.isFinite(r.knownMin) || !Number.isFinite(r.knownMax)) return null;
  const t = reliefTension(s.time.day, r.knownMin, r.knownMax, r.arrived);
  const cls = ['', 'yakin', 'gergin', 'kritik', 'kritik'][t.level];
  return (
    <Cip
      ikon="hacli"
      ad="Haçlı yardımı"
      class={`hacli ${cls}`}
      ipucu={
        <div class="ipucu-icerik">
          <div class="ipucu-baslik">Haçlı yardımı — tahmini geliş</div>
          <div class="ipucu-metin">
            <b>{formatDate(r.knownMin)}</b> ile <b>{formatDate(r.knownMax)}</b> arası. {t.label}.
          </div>
          <div class="ipucu-metin soluk">Venedik ve Papa’nın donanması yetişirse kuşatma kaybedilir. Casus ve tüccar haberleri bu aralığı daraltır.</div>
          {r.notes.length > 0 && (
            <ul class="ipucu-liste">
              {r.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
        </div>
      }
    >
      <span class="hacli-tarih">{fmtDateRange(r.knownMin, r.knownMax)}</span>
    </Cip>
  );
}

export function Gostergeler() {
  const s = store.state;
  if (!s) return null;
  return (
    <div class="gostergeler etkilesim">
      <Moral s={s} />
      <Erzak s={s} />
      <Divan s={s} />
      <Galata s={s} />
      {(s.time.phase === 'kusatma' || s.byz.intel > 0) && <Bizans s={s} />}
      <Hacli s={s} />
    </div>
  );
}
