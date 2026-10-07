/**
 * Top bar: sky medallion + date/clock cartouche, siege-day seal, speed
 * controls, resources with ticking counters and per-day ledger tooltips.
 */
import { formatClock, formatDate, SEGMENT_ADI, segmentOf, siegeDayNumber } from '../../core/calendar';
import type { Cost } from '../../core/defs';
import { RESOURCE_ADI, RESOURCE_IDS, type GameState, type ResourceId } from '../../core/state';
import { store } from '../../core/store';
import { dailyAmmoUse } from '../../features/artillery/api';
import { erzakDays, ledger, productionPerDay, upkeepPerDay } from '../../features/economy/api';
import { skyState } from '../../features/events/api';
import { erzakLevel, fmtCompact, fmtDays, fmtDelta, fmtInt } from './format';
import { safe } from './logic';
import { Btn, Ikon, Ipucu, Sayi } from './ui';

const KAYNAK_ACIKLAMA: Record<ResourceId, string> = {
  akce: 'Gümüş sikke. Ücretler, satın almalar, Orban’ın ücreti ve bahşişler.',
  tas: 'Taş ocaklarından. Hisar, mevziler ve taş gülleler için.',
  kereste: 'Ormanlardan. Kızak, siper, kule, köprü ve odun kömürü için.',
  maden: 'Bakır ve kalay. Edirne dökümhanesinde tunca dönüşür.',
  tunc: 'Dökümhanenin ürettiği tunç. Toplar bundan dökülür.',
  barut: 'Baruthanede güherçile, kükürt ve kömürden dövülür. Her atış yakar.',
  gulle: 'Taşçıların yonttuğu yuvarlak taş gülleler.',
  erzak: 'Kişi-gün olarak zahire. Her asker ve işçi her gün yer.',
  yag: 'Eritilmiş içyağı. Gemileri kızaklarla karadan yürütmek için.',
};

function KaynakIpucu({ s, r }: { s: GameState; r: ResourceId }) {
  const led = safe(() => ledger(s), { produced: {} as Cost, consumed: {} as Cost });
  const prod = safe(() => productionPerDay(s), {} as Cost);
  const up = safe(() => upkeepPerDay(s), {} as Cost);
  const made = led.produced?.[r] ?? 0;
  const used = led.consumed?.[r] ?? 0;
  const net = made - used;
  const ammo = r === 'barut' || r === 'gulle' ? safe(() => dailyAmmoUse(s), { barut: 0, gulle: 0 }) : null;
  return (
    <div class="ipucu-icerik">
      <div class="ipucu-baslik">
        <Ikon ad={r} /> {RESOURCE_ADI[r]} <b class="num">{fmtInt(s.resources[r])}</b>
      </div>
      <div class="ipucu-metin">{KAYNAK_ACIKLAMA[r]}</div>
      <div class="ipucu-tablo">
        <span>Dün gelen</span>
        <b class="num artti">+{fmtInt(made)}</b>
        <span>Dün giden</span>
        <b class="num azaldi">−{fmtInt(used)}</b>
        <span>Net</span>
        <b class={`num ${net >= 0 ? 'artti' : 'azaldi'}`}>{fmtDelta(net)}</b>
        {(prod[r] ?? 0) > 0 && (
          <>
            <span>Atölyeler / gün</span>
            <b class="num">+{fmtInt(prod[r] ?? 0)}</b>
          </>
        )}
        {(up[r] ?? 0) > 0 && (
          <>
            <span>Gündelik gider</span>
            <b class="num azaldi">−{fmtInt(up[r] ?? 0)}</b>
          </>
        )}
        {ammo && (
          <>
            <span>Topların günlük ihtiyacı</span>
            <b class="num">{fmtInt(ammo[r as "barut" | "gulle"])}</b>
          </>
        )}
        {r === 'erzak' && (
          <>
            <span>Yetecek süre</span>
            <b class="num">{fmtDays(safe(() => erzakDays(s), Infinity))} gün</b>
          </>
        )}
      </div>
    </div>
  );
}

function kaynakUyari(s: GameState, r: ResourceId): string {
  if (r === 'erzak') {
    const lv = erzakLevel(safe(() => erzakDays(s), Infinity));
    return lv === 2 ? 'tehlike' : lv === 1 ? 'uyari' : '';
  }
  if ((r === 'barut' || r === 'gulle') && s.time.phase === 'kusatma') {
    const need = safe(() => dailyAmmoUse(s), { barut: 0, gulle: 0 })[r];
    if (need > 0 && s.resources[r] < need * 0.5) return 'tehlike';
    if (need > 0 && s.resources[r] < need * 2) return 'uyari';
  }
  if (r === 'akce' && s.resources.akce < 200) return 'uyari';
  return '';
}

function Kaynaklar({ s }: { s: GameState }) {
  return (
    <div class="kaynaklar">
      {RESOURCE_IDS.map((r) => (
        <Ipucu key={r} icerik={<KaynakIpucu s={s} r={r} />}>
          <div class={`kaynak ${kaynakUyari(s, r)}`}>
            <Ikon ad={r} />
            <Sayi deger={Math.floor(s.resources[r])} fmt={fmtCompact} esik={r === 'erzak' ? 0.02 : 0.04} minEsik={r === 'erzak' ? 500 : 3} class="num" />
          </div>
        </Ipucu>
      ))}
    </div>
  );
}

const HIZLAR: { v: 0 | 1 | 2 | 3; tus: string; ad: string }[] = [
  { v: 0, tus: 'Boşluk', ad: 'Duraklat' },
  { v: 1, tus: '1', ad: 'Normal hız' },
  { v: 2, tus: '2', ad: 'İki kat hız' },
  { v: 3, tus: '3', ad: 'Üç kat hız' },
];

function HizKontrol({ s }: { s: GameState }) {
  return (
    <div class="hiz-grup">
      {HIZLAR.map((h) => (
        <Btn
          key={h.v}
          tur="gece"
          class="hiz-btn"
          aktif={s.time.speed === h.v}
          ipucu={
            <div class="ipucu-icerik">
              <b>{h.ad}</b> <span class="tus">{h.tus}</span>
            </div>
          }
          onClick={() => store.dispatch({ t: 'hiz', speed: h.v })}
        >
          <Ikon ad={`hiz-${h.v}`} />
          <span class="tus-ipucu">{h.v === 0 ? '␣' : h.tus}</span>
        </Btn>
      ))}
    </div>
  );
}

function Takvim({ s }: { s: GameState }) {
  const seg = segmentOf(s.time.day);
  const eclipse = seg === 'gece' && safe(() => skyState(s).eclipse, false);
  const gok = eclipse ? 'gok-tutulma' : `gok-${seg}`;
  const gun = siegeDayNumber(s.time.day, s.time.siegeStartDay);
  const ph = s.time.phase;
  const evre = ph === 'hazirlik' ? 'Hazırlık' : ph === 'yuruyus' ? 'Yürüyüş' : ph === 'bitti' ? 'Son' : null;
  const yuruyusGun = ph === 'yuruyus' && s.time.marchStartDay != null ? Math.min(13, Math.floor(s.time.day - s.time.marchStartDay) + 1) : null;
  return (
    <div class="takvim">
      <Ipucu
        icerik={
          <div class="ipucu-icerik">
            <div class="ipucu-baslik">{SEGMENT_ADI[seg]}</div>
            <div class="ipucu-metin">
              {seg === 'safak' && 'Şafak: raporlar gelir, gece yapılan onarımlar görülür.'}
              {seg === 'gunduz' && 'Gündüz: toplar surları döver, işçiler çalışır, birlikler görev yapar.'}
              {seg === 'aksam' && 'Akşam: toplar soğur, barut ve gülle sayılır, Divan toplanır.'}
              {seg === 'gece' && (eclipse ? 'Ay tutuldu! Surların ardında korku ve kötü alamet.' : 'Gece: Bizans gedikleri onarır, lağımcılar kazar, gizli işler yapılır.')}
            </div>
            <div class="ipucu-metin soluk">Tarihler Jülyen takvimine göredir (kaynaklardaki gibi).</div>
          </div>
        }
      >
        <span key={gok} class="gok-sarici">
          <Ikon ad={gok} class="gok-madalyon" />
        </span>
      </Ipucu>
      <div class="takvim-yazi">
        <div class="tarih">{formatDate(s.time.day)}</div>
        <div class="saat">
          <span class="num">{formatClock(s.time.day)}</span>
          <span class="nokta">·</span>
          <span>{SEGMENT_ADI[seg]}</span>
        </div>
      </div>
      {gun != null && ph !== 'hazirlik' && ph !== 'yuruyus' ? (
        <Ipucu icerik={<div class="ipucu-icerik">Kuşatmanın {gun}. günü. Tarihte kuşatma 53 gün sürdü (6 Nisan – 29 Mayıs 1453).</div>}>
          <div class="gun-muhur">
            <span class="gun-ust">GÜN</span>
            <span class="gun-sayi num">{gun}</span>
          </div>
        </Ipucu>
      ) : (
        evre && (
          <div class="evre-serit">
            {evre}
            {yuruyusGun != null && <span class="num"> {yuruyusGun}/13</span>}
          </div>
        )
      )}
    </div>
  );
}

export function UstSerit() {
  const s = store.state;
  if (!s) return null;
  return (
    <div class="ust-serit etkilesim">
      <Ikon ad="sancak" class="sancak" />
      <Takvim s={s} />
      <HizKontrol s={s} />
      <Kaynaklar s={s} />
      {s.time.speed === 0 && <div class="duraklatildi">Duraklatıldı</div>}
    </div>
  );
}
