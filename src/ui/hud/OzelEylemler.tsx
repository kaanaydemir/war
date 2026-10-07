/**
 * Contextual special actions (right side, above the minimap): ships overland,
 * Golden Horn bridge, siege tower, the Sultan's camp visit and the dramatic
 * SON HÜCUM — each with a requirement checklist tooltip.
 */
import type { ComponentChildren } from 'preact';
import { FLAG } from '../../core/flags';
import type { GameState } from '../../core/state';
import { store } from '../../core/store';
import { bridgeCheck, overlandCheck, type Requirement } from '../../features/navy/api';
import { fmtPct } from './format';
import { startTarget } from './Katmanlar';
import { checklistOk, safe, sonHucumChecklist, type CheckItem } from './logic';
import { opt } from './opt';
import { askConfirm, Btn, Cubuk, Ikon } from './ui';

function Liste({ items }: { items: (Requirement | CheckItem)[] }) {
  return (
    <ul class="kontrol-listesi">
      {items.map((r, i) => (
        <li key={i} class={r.ok ? 'tamam' : (r as CheckItem).soft ? 'yumusak' : ''}>
          {r.ok ? <Ikon ad="onay" /> : <Ikon ad="red" />}
          <span>{r.label}</span>
          {(r as CheckItem).detail && <span class="soluk kucuk"> {(r as CheckItem).detail}</span>}
        </li>
      ))}
    </ul>
  );
}

function Madalyon({
  ikon,
  ad,
  durum,
  hazir,
  tamam,
  ilerleme,
  ipucu,
  onClick,
  tur = 'gece',
  class: cls = '',
}: {
  ikon: string;
  ad: string;
  durum?: string;
  hazir: boolean;
  tamam?: boolean;
  ilerleme?: number;
  ipucu: ComponentChildren;
  onClick: () => void;
  tur?: 'gece' | 'kirmizi';
  class?: string;
}) {
  return (
    <Btn
      tur={tur}
      class={`madalyon ${hazir ? 'hazir' : ''} ${tamam ? 'tamam' : ''} ${cls}`}
      disabled={!hazir}
      sesi="ac"
      ipucu={
        <div class="ipucu-icerik genis">
          <div class="ipucu-baslik">{ad}</div>
          {durum && <div class="ipucu-metin vurgu">{durum}</div>}
          {ipucu}
        </div>
      }
      onClick={onClick}
    >
      <Ikon ad={ikon} />
      {ilerleme != null && ilerleme > 0 && ilerleme < 1 && (
        <span class="madalyon-ilerleme">
          <span style={{ width: `${ilerleme * 100}%` }} />
        </span>
      )}
      <span class="madalyon-ad">{ad}</span>
    </Btn>
  );
}

function GemilerKaradan({ s }: { s: GameState }) {
  const c = safe(() => overlandCheck(s), null);
  if (!c || c.stage === 'tamam') return null;
  const run = c.stage !== 'yok';
  return (
    <Madalyon
      ikon="ozel-gemi"
      ad="Gemileri karadan yürüt"
      hazir={c.ok}
      ilerleme={run ? c.progress : undefined}
      durum={run ? `Sürüyor: ${fmtPct(c.progress)}` : undefined}
      ipucu={
        <>
          <div class="ipucu-metin">Beşiktaş’tan Kasımpaşa’ya, yağlanmış kızaklarla, gece. Tarihte 22 Nisan 1453’te ~70 gemi Haliç’e indirildi.</div>
          <Liste items={c.reqs} />
        </>
      }
      onClick={() =>
        askConfirm({
          title: 'Gemiler karadan yürütülsün mü?',
          ok: 'Başlat',
          body: <p>Fustalar ve kalyeteler kızaklara çekilir; öküzler ve amele onları Pera sırtlarından aşırıp Haliç’e indirir. Kereste, yağ ve işçi harcanır.</p>,
          onOk: () => store.dispatch({ t: 'gemileri-karadan' }),
        })
      }
    />
  );
}

function Kopru({ s }: { s: GameState }) {
  if (!s.flags[FLAG.gemilerKaradan]) return null;
  const c = safe(() => bridgeCheck(s), null);
  if (!c || c.stage === 'tamam') return null;
  const run = c.stage === 'insa';
  return (
    <Madalyon
      ikon="ozel-kopru"
      ad="Haliç köprüsü"
      hazir={c.ok}
      ilerleme={run ? c.progress : undefined}
      durum={run ? `İnşa ediliyor: ${fmtPct(c.progress)}` : undefined}
      ipucu={
        <>
          <div class="ipucu-metin">Zağanos Paşa’nın askerleri fıçılardan bir köprü ve yüzer top platformu kurar: Haliç’te ikinci cephe açılır.</div>
          <Liste items={c.reqs} />
        </>
      }
      onClick={() => store.dispatch({ t: 'ozel', feature: 'navy', action: 'kopru' })}
    />
  );
}

function Kule({ s }: { s: GameState }) {
  if (s.time.phase !== 'kusatma') return null;
  if (s.flags[FLAG.kuleYapildi] && !s.flags[FLAG.kuleYandi]) return null;
  const reqs: CheckItem[] = [
    { label: 'Kuşatma sürüyor', ok: s.time.phase === 'kusatma' },
    { label: 'Kereste ve ıslak deri kaplama', ok: s.resources.kereste >= 200, detail: `${Math.floor(s.resources.kereste)} kereste`, soft: true },
  ];
  return (
    <Madalyon
      ikon="ozel-kule"
      ad="Kuşatma kulesi"
      hazir={true}
      durum={s.flags[FLAG.kuleYandi] ? 'Önceki kule yakıldı' : undefined}
      ipucu={
        <>
          <div class="ipucu-metin">Ahşap, ıslak derilerle kaplı yürüyen kule. Hendeğe yanaştırılır; Bizanslılar gece yakmaya çalışır.</div>
          <Liste items={reqs} />
          <div class="ipucu-metin soluk">Ardından haritada bir kara suru kesimine tıkla.</div>
        </>
      }
      onClick={() => startTarget({ kind: 'kule', label: 'Kulenin kurulacağı kara suru kesimini seç', landOnly: true })}
    />
  );
}

function PadisahZiyareti({ s }: { s: GameState }) {
  if (s.time.phase !== 'kusatma' && s.time.phase !== 'yuruyus') return null;
  const sv = opt.sultanVisit(s);
  return (
    <Madalyon
      ikon="ozel-padisah"
      ad="Padişah ziyareti"
      hazir={sv ? sv.ok : true}
      durum={sv && !sv.ok ? sv.reason ?? (sv.readyIn > 0 ? `${Math.ceil(sv.readyIn)} gün sonra yeniden` : undefined) : undefined}
      ipucu={<div class="ipucu-metin">Sultan Mehmed atıyla ordugâhı dolaşır, askere ihsan dağıtır. Ordu morali yükselir.</div>}
      onClick={() => store.dispatch({ t: 'ozel', feature: 'army', action: 'padisah-ziyareti' })}
    />
  );
}

const EVRE_ADI: Record<string, string> = {
  ilan: 'İlan edildi: ordugâhta ateşler yanıyor',
  toplanma: 'Dalgalar toplanıyor',
  dalga: 'Hücum!',
  ara: 'Dalgalar arası',
  dusus: 'Şehir düşüyor!',
  bitti: 'Şehir alındı',
  basarisiz: 'Hücum püskürtüldü',
};

function SonHucum({ s }: { s: GameState }) {
  if (s.time.phase !== 'kusatma') return null;
  const fa = opt.finalAssault(s);
  if (s.flags[FLAG.sonHucumIlan] || (fa && fa.declared)) {
    const wave = fa?.wave ?? Number(s.flags[FLAG.hucumDalgasi] ?? 0);
    return (
      <div class="son-hucum-durum">
        <Ikon ad="ozel-sonhucum" />
        <div class="son-hucum-yazi">
          <span>
            {'Son hücum'.toLocaleUpperCase('tr')}
            {wave > 0 && <span class="num"> · {wave}. dalga</span>}
          </span>
          {fa && (
            <span class="son-hucum-alt">
              {fa.waveName ?? EVRE_ADI[fa.phase] ?? ''}
              {fa.startsIn != null && fa.startsIn > 0 && ` · ${Math.ceil(fa.startsIn * 24)} saat sonra`}
              {fa.mainSectionName && ` · ${fa.mainSectionName}`}
            </span>
          )}
          {fa && fa.active && <Cubuk deger={fa.foothold} tur="altin" class="cubuk-genis" />}
        </div>
      </div>
    );
  }
  const items = sonHucumChecklist(s);
  if (fa && !fa.canDeclare && fa.reason) items.unshift({ label: fa.reason, ok: false });
  const ok = fa ? fa.canDeclare : checklistOk(items);
  const ready = ok && items.every((i) => i.ok);
  return (
    <Madalyon
      ikon="ozel-sonhucum"
      ad="SON HÜCUM"
      tur="kirmizi"
      class={`son-hucum ${ready ? 'olgun' : ''}`}
      hazir={ok}
      ipucu={
        <>
          <div class="ipucu-metin">Son hücumu yalnızca Sultan ilan edebilir. Ordugâhta ateşler yakılır, bir gün dinlenilir; ardından başıbozuklar, Anadolu askerleri ve yeniçeriler dalga dalga saldırır.</div>
          <Liste items={items} />
        </>
      }
      onClick={() =>
        askConfirm({
          title: 'Son hücum ilan edilsin mi?',
          danger: true,
          ok: 'HÜCUM!',
          body: (
            <>
              <p>Bu karar geri alınamaz. Ordugâhta ateşler yakılacak, mehter vuracak; ardından bütün ordu surlara yüklenecek.</p>
              {!ready && <p class="kirmizi-yazi">Koşullar tam olgunlaşmadı: hücum ağır kayıpla püskürtülebilir.</p>}
              <Liste items={items} />
            </>
          ),
          onOk: () => store.dispatch({ t: 'son-hucum' }),
        })
      }
    />
  );
}

export function OzelEylemler() {
  const s = store.state;
  if (!s || s.time.phase === 'hazirlik' || s.time.phase === 'bitti') return null;
  return (
    <div class="ozel-eylemler etkilesim">
      <SonHucum s={s} />
      <div class="ozel-sira">
        <GemilerKaradan s={s} />
        <Kopru s={s} />
        <Kule s={s} />
        <PadisahZiyareti s={s} />
      </div>
    </div>
  );
}
