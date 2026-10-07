/**
 * Edirne panel: the capital off-map — foundry (cast cannons, hire Orban,
 * guns being cast/transported), treasury, troop levy (tımar çağrısı), road
 * preparation & caravans, and the big "YOLA ÇIK" decision (H10).
 */
import { useState } from 'preact/hooks';
import { formatDate, TARIH } from '../../core/calendar';
import type { Cost } from '../../core/defs';
import { FLAG } from '../../core/flags';
import { RESOURCE_IDS, type CannonType, type GameState, type UnitTypeId } from '../../core/state';
import { store } from '../../core/store';
import { UNIT_TYPES } from '../../features/army/data';
import { canCast, canHireOrban, castEta, cannonStatusText, isAtEdirne, transportEta } from '../../features/artillery/api';
import { CANNON_ORDER, CANNON_TYPES, ORBAN_COST } from '../../features/artillery/data';
import { canAfford, caravansEnRoute, dailyAkceUpkeep, edirneActions, edirneInfo, ledger } from '../../features/economy/api';
import { CARAVAN_ADI, type CaravanKind } from '../../features/economy/data';
import { edirneUrl } from './art';
import { fmtCompact, fmtDays, fmtDelta, fmtInt, fmtPct } from './format';
import { checklistOk, readinessChecklist, safe, totalMen } from './logic';
import { opt } from './opt';
import { askConfirm, Btn, Cubuk, Ikon, Ipucu, KapatBtn, Koseler, Miktar, TexIkon } from './ui';

function Maliyet({ cost }: { cost: Cost }) {
  const s = store.state!;
  const ids = RESOURCE_IDS.filter((r) => (cost[r] ?? 0) > 0);
  if (!ids.length) return <span class="soluk kucuk">bedelsiz</span>;
  return (
    <span class="maliyet">
      {ids.map((r) => (
        <span key={r} class={`maliyet-cip ${s.resources[r] >= (cost[r] ?? 0) ? '' : 'yetersiz'}`}>
          <Ikon ad={r} />
          <Miktar n={cost[r] ?? 0} fmt={fmtCompact} />
        </span>
      ))}
    </span>
  );
}

// ───────────────────────────── Dökümhane ─────────────────────────────

function Dokumhane({ s }: { s: GameState }) {
  const orban = !!s.flags[FLAG.orbanGeldi];
  const hire = safe(() => canHireOrban(s), { ok: false, reason: '' });
  const level = safe(() => edirneInfo(s).dokumhaneLevel, 1);
  const work = s.cannons.filter((c) => c.status === 'dokuluyor' || c.status === 'yolda' || safe(() => isAtEdirne(s, c.id), false));
  return (
    <div class="edirne-bolum">
      <div class={`orban-kart ${orban ? 'hizmette' : ''}`}>
        <Ikon ad="ocak" olcek={2} />
        <div class="orban-yazi">
          <div class="orban-ad">Usta dökümcü Orban</div>
          <div class="soluk kucuk">
            {orban
              ? 'Sultan’ın hizmetinde. Büyük toplar ve Şahi dökülebilir.'
              : 'Macar dökümcü önce Bizans’a gitti; imparator ücretini ödeyemedi. Sultan istediğinin kat kat fazlasını verirse büyük topları o döker.'}
          </div>
        </div>
        {!orban && (
          <Btn
            tur="altin"
            disabled={!hire.ok}
            ipucu={hire.reason ? <div class="ipucu-icerik kirmizi-yazi">{hire.reason}</div> : undefined}
            onClick={() => store.dispatch({ t: 'ozel', feature: 'artillery', action: 'orban-tut' })}
          >
            Orban’ı tut <Maliyet cost={ORBAN_COST as Cost} />
          </Btn>
        )}
      </div>
      <div class="alt-baslik">
        Top dök <span class="soluk kucuk">· dökümhane {level}. kademe</span>
      </div>
      <div class="top-listesi">
        {CANNON_ORDER.map((t: CannonType) => {
          const def = CANNON_TYPES[t];
          if (!def) return null;
          const chk = safe(() => canCast(s, t), { ok: false, reason: '' });
          return (
            <div key={t} class={`top-satiri ${chk.ok ? '' : 'pasif'}`}>
              <TexIkon tex={def.icon} yedek="gulle" max={16} />
              <Ipucu
                icerik={
                  <div class="ipucu-icerik genis">
                    <div class="ipucu-baslik">{def.name}</div>
                    <div class="ipucu-metin">{def.desc}</div>
                    <div class="ipucu-tablo">
                      <span>Menzil</span>
                      <b class="num">{def.range}</b>
                      <span>Günde atış</span>
                      <b class="num">{def.shotsPerDay}</b>
                      <span>Hasar</span>
                      <b class="num">{def.damage}</b>
                    </div>
                  </div>
                }
              >
                <span class="top-ad">{def.name}</span>
              </Ipucu>
              <span class="num soluk kucuk">{def.castDays} gün</span>
              <Maliyet cost={def.castCost} />
              <Btn
                tur="kirmizi"
                class="kucuk-btn"
                disabled={!chk.ok}
                sesi="onay"
                ipucu={chk.reason ? <div class="ipucu-icerik kirmizi-yazi">{chk.reason}</div> : undefined}
                onClick={() => store.dispatch({ t: 'top-dok', type: t })}
              >
                Dök
              </Btn>
            </div>
          );
        })}
      </div>
      {work.length > 0 && (
        <>
          <div class="alt-baslik">Dökümhane ve yol</div>
          <div class="is-listesi">
            {work.map((c) => {
              const atE = safe(() => isAtEdirne(s, c.id), false);
              const eta = c.status === 'dokuluyor' ? safe(() => castEta(s, c), 0) : c.status === 'yolda' ? safe(() => transportEta(s, c), 0) : 0;
              return (
                <div key={c.id} class="is-satiri">
                  <span class="is-ad">{c.name}</span>
                  <Cubuk deger={atE ? 1 : c.progress} tur={c.status === 'dokuluyor' ? 'kizgin' : 'altin'} />
                  <span class="kucuk">{safe(() => cannonStatusText(s, c), c.status)}</span>
                  {eta > 0 && <span class="num soluk kucuk">{fmtDays(eta)} g</span>}
                  {atE && s.time.phase === 'hazirlik' && (
                    <Btn tur="lapis" class="kucuk-btn" onClick={() => store.dispatch({ t: 'ozel', feature: 'artillery', action: 'yola-gonder', payload: { cannonIds: [c.id] } })}>
                      Yola gönder
                    </Btn>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ───────────────────────────── Hazine ─────────────────────────────

function Hazine({ s }: { s: GameState }) {
  const led = safe(() => ledger(s), { produced: {} as Cost, consumed: {} as Cost });
  const up = safe(() => dailyAkceUpkeep(s), 0);
  const acts = safe(() => edirneActions(s), []).filter((a) => a.id !== 'yol-hazirla' && a.id !== 'yol-durdur');
  const net = (led.produced?.akce ?? 0) - (led.consumed?.akce ?? 0);
  return (
    <div class="edirne-bolum">
      <div class="hazine-ozet">
        <Ikon ad="hazine" olcek={2} />
        <div class="ipucu-tablo">
          <span>Hazine</span>
          <b class="num">{fmtInt(s.resources.akce)} akçe</b>
          <span>Dün net</span>
          <b class={`num ${net >= 0 ? 'artti' : 'azaldi'}`}>{fmtDelta(net)}</b>
          <span>Günlük ulûfe ve ücret</span>
          <b class="num azaldi">−{fmtInt(up)}</b>
        </div>
      </div>
      <div class="eylem-listesi">
        {acts.length === 0 && <div class="soluk">Hazine defterleri hazırlanıyor…</div>}
        {acts.map((a) => (
          <div key={a.id} class={`eylem-satiri ${a.ok ? '' : 'pasif'}`}>
            <div class="eylem-yazi">
              <b>{a.name}</b>
              <span class="soluk kucuk">{a.desc}</span>
              {!a.ok && a.reason && <span class="kirmizi-yazi kucuk">{a.reason}</span>}
            </div>
            <Maliyet cost={a.cost} />
            <Btn tur="lapis" class="kucuk-btn" disabled={!a.ok} sesi="onay" onClick={() => store.dispatch({ t: 'ozel', feature: 'economy', action: a.id })}>
              Emret
            </Btn>
          </div>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────────── Asker toplama ─────────────────────────────

function Trakya({ s }: { s: GameState }) {
  const t = opt.trakya(s);
  if (!t || t.done || s.time.phase !== 'hazirlik') return null;
  return (
    <div class={`eylem-satiri ${t.ok || t.inProgress ? '' : 'pasif'}`}>
      <Ikon ad="emir-hucum" />
      <div class="eylem-yazi">
        <b>Trakya’daki Bizans kasabalarını al</b>
        <span class="soluk kucuk">
          {t.inProgress ? `Birlikler seferde: ${fmtDays(t.daysLeft)} gün sonra dönerler.` : `Bir kol ${t.days} günlük sefere çıkar; çevre kasabalar alınır, Bizans’ın ikmali daralır.`}
        </span>
        {!t.ok && !t.inProgress && t.reason && <span class="kirmizi-yazi kucuk">{t.reason}</span>}
      </div>
      {!t.inProgress && <Maliyet cost={t.cost} />}
      <Btn tur="kirmizi" class="kucuk-btn" disabled={!t.ok || t.inProgress} sesi="onay" onClick={() => store.dispatch({ t: 'ozel', feature: 'army', action: 'trakya' })}>
        Sefer
      </Btn>
    </div>
  );
}

function AskerToplama({ s }: { s: GameState }) {
  const rec = opt.recruitOptions(s);
  if (rec && rec.length)
    return (
      <div class="edirne-bolum">
        <div class="ozet-satiri">
          <Ikon ad="asker" olcek={2} />
          <div>
            <div>
              Ordu: <b class="num">{fmtInt(totalMen(s))}</b> asker
            </div>
            <div class="soluk kucuk">Rumeli ve Anadolu tımarlıları çağrılır, kapıkulu ocakları doldurulur, gönüllüler (başıbozuklar) yazılır.</div>
          </div>
        </div>
        <div class="eylem-listesi">
          {rec.map((r) => (
            <div key={r.unit} class={`eylem-satiri ${r.ok ? '' : 'pasif'}`}>
              <TexIkon tex={UNIT_TYPES[r.unit]?.icon} yedek="asker" max={16} />
              <div class="eylem-yazi">
                <b>{r.label}</b>
                <span class="soluk kucuk">
                  Bir birlik: <span class="num">{fmtInt(r.men)}</span> kişi · <span class="num">{r.have}</span>/<span class="num">{r.max}</span> birlik
                </span>
                {!r.ok && r.reason && <span class="kirmizi-yazi kucuk">{r.reason}</span>}
              </div>
              <Maliyet cost={r.cost} />
              <Btn tur="kirmizi" class="kucuk-btn" disabled={!r.ok} sesi="onay" ipucu={<div class="ipucu-icerik genis">{r.desc}</div>} onClick={() => store.dispatch({ t: 'asker-topla', unit: r.unit, count: 1 })}>
                Çağır
              </Btn>
            </div>
          ))}
          <Trakya s={s} />
        </div>
      </div>
    );
  const types = (Object.keys(UNIT_TYPES) as UnitTypeId[]).filter((t) => UNIT_TYPES[t]);
  const menBy = new Map<string, number>();
  for (const g of s.groups) if (g.status !== 'dagildi') menBy.set(g.type, (menBy.get(g.type) ?? 0) + g.men);
  return (
    <div class="edirne-bolum">
      <div class="ozet-satiri">
        <Ikon ad="asker" olcek={2} />
        <div>
          <div>
            Ordu: <b class="num">{fmtInt(totalMen(s))}</b> asker
          </div>
          <div class="soluk kucuk">Rumeli ve Anadolu tımarlıları çağrılır, kapıkulu ocakları doldurulur, gönüllüler (başıbozuklar) yazılır.</div>
        </div>
      </div>
      <div class="eylem-listesi">
        {types.length === 0 && <div class="soluk">Tımar defterleri hazırlanıyor…</div>}
        {types.map((t) => {
          const def = UNIT_TYPES[t];
          const cost = def.cost;
          const ok = !!cost && safe(() => canAfford(s, cost), false) && s.time.phase !== 'bitti';
          return (
            <div key={t} class={`eylem-satiri ${ok ? '' : 'pasif'}`}>
              <TexIkon tex={def.icon} yedek="asker" max={16} />
              <div class="eylem-yazi">
                <b>{def.plural || def.name}</b>
                <span class="soluk kucuk">
                  {cost ? `Bir birlik: ${fmtInt(def.menPerGroup)} kişi` : 'Toplanamaz'} · mevcut <span class="num">{fmtInt(menBy.get(t) ?? 0)}</span>
                </span>
              </div>
              {cost && <Maliyet cost={cost} />}
              <Btn
                tur="kirmizi"
                class="kucuk-btn"
                disabled={!ok}
                sesi="onay"
                ipucu={<div class="ipucu-icerik">{def.desc}</div>}
                onClick={() => store.dispatch({ t: 'asker-topla', unit: t, count: 1 })}
              >
                Çağır
              </Btn>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ───────────────────────────── Yol & kervanlar ─────────────────────────────

function YolKervan({ s }: { s: GameState }) {
  const yol = Math.max(0, Math.min(1, Number(s.flags[FLAG.yolHazirligi] ?? 0)));
  const info = safe(() => edirneInfo(s), null);
  const act = safe(() => edirneActions(s), []).filter((a) => a.id === 'yol-hazirla' || a.id === 'yol-durdur');
  const kervan = safe(() => caravansEnRoute(s), []);
  return (
    <div class="edirne-bolum">
      <div class="ozet-satiri">
        <Ikon ad="yol" olcek={2} />
        <div class="genis-blok">
          <div>
            Edirne yolu hazırlığı <b class="num">{fmtPct(yol)}</b>
            {info?.yolActive && <span class="etiket altin-etiket">Amele çalışıyor</span>}
          </div>
          <Cubuk deger={yol} tur="toprak" class="cubuk-genis" />
          <div class="soluk kucuk">Düzlenmiş yollar ve dere köprüleri, büyük topun öküzlerle taşınmasını hızlandırır.</div>
        </div>
      </div>
      {act.map((a) => (
        <div key={a.id} class={`eylem-satiri ${a.ok ? '' : 'pasif'}`}>
          <div class="eylem-yazi">
            <b>{a.name}</b>
            <span class="soluk kucuk">{a.desc}</span>
            {!a.ok && a.reason && <span class="kirmizi-yazi kucuk">{a.reason}</span>}
          </div>
          <Maliyet cost={a.cost} />
          <Btn tur="lapis" class="kucuk-btn" disabled={!a.ok} sesi="onay" onClick={() => store.dispatch({ t: 'ozel', feature: 'economy', action: a.id })}>
            Emret
          </Btn>
        </div>
      ))}
      <div class="alt-baslik">
        Kervanlar
        {info && Number.isFinite(info.nextCaravanIn) && <span class="soluk kucuk"> · sonraki {fmtDays(info.nextCaravanIn)} gün sonra</span>}
      </div>
      <div class="is-listesi">
        {kervan.length === 0 && <div class="soluk kucuk">Yolda kervan yok.</div>}
        {kervan.map((k) => (
          <div key={k.id} class="is-satiri">
            <Ikon ad="kervan" />
            <span class="is-ad">{CARAVAN_ADI[k.kind as CaravanKind] ?? k.kind}</span>
            <Cubuk deger={k.progress} tur="altin" />
            <span class="kervan-yuk">
              {RESOURCE_IDS.filter((r) => (k.cargo[r] ?? 0) > 0)
                .slice(0, 3)
                .map((r) => (
                  <span key={r} class="maliyet-cip">
                    <Ikon ad={r} />
                    <Miktar n={k.cargo[r] ?? 0} fmt={fmtCompact} />
                  </span>
                ))}
              {k.workers > 0 && <span class="kucuk">{k.workers} amele</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────────── Yola çık ─────────────────────────────

function YolaCik({ s }: { s: GameState }) {
  if (s.time.phase !== 'hazirlik') return null;
  const items = readinessChecklist(s);
  const allOk = items.every((i) => i.ok);
  return (
    <div class={`yola-cik ${allOk ? 'hazir' : ''}`}>
      <ul class="kontrol-listesi">
        {items.map((i) => (
          <li key={i.label} class={i.ok ? 'tamam' : ''}>
            {i.ok ? <Ikon ad="onay" /> : <i class="bos-kutu" />}
            <span>{i.label}</span>
            {i.detail && <span class="soluk kucuk"> {i.detail}</span>}
          </li>
        ))}
      </ul>
      <Btn
        tur="kirmizi"
        class="yola-cik-btn"
        disabled={!checklistOk(items)}
        sesi="ac"
        onClick={() =>
          askConfirm({
            title: 'Edirne’den yola çıkılsın mı?',
            danger: !allOk,
            ok: 'Yola çık',
            body: (
              <>
                <p>
                  Ordu Konstantiniyye’ye yürür; yaklaşık 13 günde surların önüne varır. Bu karar geri alınamaz. Tarihte ordu <b>{formatDate(TARIH.edirnedenHareket)}</b> günü yola çıktı.
                </p>
                {!allOk && <p class="kirmizi-yazi">Hazırlık tamamlanmadı: erken çıkmak yardım tehdidine karşı zaman kazandırır ama ordu eksik kalır.</p>}
              </>
            ),
            onOk: () => {
              store.dispatch({ t: 'yola-cik' });
              store.setUi({ panel: null });
            },
          })
        }
      >
        YOLA ÇIK
      </Btn>
    </div>
  );
}

type Sekme = 'dokumhane' | 'hazine' | 'asker' | 'yol';
const SEKMELER: { id: Sekme; ad: string; ikon: string }[] = [
  { id: 'dokumhane', ad: 'Dökümhane', ikon: 'ocak' },
  { id: 'hazine', ad: 'Hazine', ikon: 'hazine' },
  { id: 'asker', ad: 'Asker Toplama', ikon: 'asker' },
  { id: 'yol', ad: 'Yol ve Kervanlar', ikon: 'kervan' },
];

export function EdirnePaneli() {
  const s = store.state;
  const [sekme, setSekme] = useState<Sekme>('dokumhane');
  if (!s || store.ui.panel !== 'edirne') return null;
  return (
    <div class="edirne-perde">
      <div class="edirne-panel panel-kagit buyuk-panel etkilesim" onWheel={(e) => e.stopPropagation()}>
        <Koseler />
        <div class="edirne-manzara" style={{ backgroundImage: `url(${edirneUrl()})` }}>
          <div class="edirne-baslik">
            <span class="edirne-ad">{'Edirne'.toLocaleUpperCase('tr')}</span>
            <span class="edirne-alt">Payitaht · {formatDate(s.time.day)}</span>
          </div>
          <KapatBtn onClick={() => store.setUi({ panel: null })} />
        </div>
        <div class="sekmeler">
          {SEKMELER.map((t) => (
            <Btn key={t.id} tur="kagit" class="sekme" aktif={sekme === t.id} sesi="sayfa" onClick={() => setSekme(t.id)}>
              <Ikon ad={t.ikon} />
              <span>{t.ad}</span>
            </Btn>
          ))}
        </div>
        <div class="edirne-icerik">
          {sekme === 'dokumhane' && <Dokumhane s={s} />}
          {sekme === 'hazine' && <Hazine s={s} />}
          {sekme === 'asker' && <AskerToplama s={s} />}
          {sekme === 'yol' && <YolKervan s={s} />}
        </div>
        <YolaCik s={s} />
      </div>
    </div>
  );
}

