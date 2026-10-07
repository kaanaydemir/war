/**
 * Bottom-left command bar (İnşa · Edirne · Günlük) and the build menu.
 */
import { useEffect, useState } from 'preact/hooks';
import type { BuildingCategory } from '../../core/defs';
import { RESOURCE_ADI, RESOURCE_IDS } from '../../core/state';
import { store } from '../../core/store';
import { workforceInfo } from '../../features/economy/api';
import { fmtCompact, fmtInt } from './format';
import { Gunluk } from './Bildirimler';
import { buildMenuItems, CATEGORY_ADI, safe, type BuildItem } from './logic';
import { Btn, hud, Ikon, Ipucu, KapatBtn, Miktar, setHud, ses, TexIkon, useHud } from './ui';

function togglePanel(id: string) {
  const open = store.ui.panel === id;
  ses(open ? 'kapat' : 'ac');
  store.setUi({ panel: open ? null : id, placement: null });
}

/** HUD hotkeys: B = İnşa, E = Edirne, G = Günlük (Space/1/2/3/Esc belong to the map). */
export function useKisayollar(): void {
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (store.ui.screen !== 'oyun') return;
      const k = e.key.toLocaleLowerCase('tr');
      if (k === 'b') togglePanel('insa');
      else if (k === 'e') togglePanel('edirne');
      else if (k === 'g' || k === 'ğ') {
        ses(hud.logOpen ? 'kapat' : 'ac');
        setHud({ logOpen: !hud.logOpen });
      } else if (e.key === 'Escape') {
        if (hud.confirm) setHud({ confirm: null });
      }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);
}

function MaliyetCipleri({ cost }: { cost: Partial<Record<string, number>> }) {
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

function YapiKarti({ it }: { it: BuildItem }) {
  const d = it.def;
  const sel = store.ui.placement?.building === d.id;
  const usable = !it.locked && it.affordable;
  return (
    <Ipucu
      icerik={
        <div class="ipucu-icerik genis">
          <div class="ipucu-baslik">{d.name}</div>
          <div class="ipucu-metin">{d.desc}</div>
          <div class="ipucu-tablo">
            <span>Yapım</span>
            <b class="num">{fmtCompact(d.buildDays)} gün</b>
            {d.workersMax > 0 && (
              <>
                <span>En çok işçi</span>
                <b class="num">{d.workersMax}</b>
              </>
            )}
            {d.produces &&
              RESOURCE_IDS.filter((r) => d.produces![r]).map((r) => (
                <>
                  <span>Üretir</span>
                  <b class="artti">
                    +{fmtInt(d.produces![r]!)} {RESOURCE_ADI[r].toLocaleLowerCase('tr')}/gün
                  </b>
                </>
              ))}
            {d.consumes &&
              RESOURCE_IDS.filter((r) => d.consumes![r]).map((r) => (
                <>
                  <span>Tüketir</span>
                  <b class="azaldi">
                    −{fmtInt(d.consumes![r]!)} {RESOURCE_ADI[r].toLocaleLowerCase('tr')}/gün
                  </b>
                </>
              ))}
          </div>
          {it.locked && <div class="ipucu-metin kirmizi-yazi">{it.locked}</div>}
          {!it.locked && !it.affordable && <div class="ipucu-metin kirmizi-yazi">Kaynak yetersiz.</div>}
        </div>
      }
    >
      <div
        class={`yapi-karti ${it.locked ? 'kilitli' : ''} ${!it.affordable ? 'pahali' : ''} ${sel ? 'secili' : ''}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          if (!usable) {
            ses('hata');
            return;
          }
          ses('onay');
          store.setUi({ placement: { building: d.id }, panel: null, selection: [] });
        }}
      >
        <div class="yapi-ikon">
          <TexIkon tex={d.icon} yedek="insa" max={24} />
        </div>
        <div class="yapi-ad">{d.name}</div>
        <MaliyetCipleri cost={d.cost} />
        {it.locked && (
          <div class="kilit-ortu">
            <Ikon ad="kilit" />
          </div>
        )}
      </div>
    </Ipucu>
  );
}

function IsciOzet() {
  const s = store.state!;
  const wf = safe(() => workforceInfo(s), null);
  const idle = wf ? wf.idle : Math.max(0, s.workforce.total - s.workforce.assigned);
  return (
    <Ipucu
      icerik={
        <div class="ipucu-icerik">
          <div class="ipucu-baslik">Amele</div>
          <div class="ipucu-tablo">
            <span>Toplam</span>
            <b class="num">{fmtInt(s.workforce.total)}</b>
            <span>Çalışan</span>
            <b class="num">{fmtInt(s.workforce.assigned)}</b>
            {wf && wf.away > 0 && (
              <>
                <span>Edirne yolunda</span>
                <b class="num">{fmtInt(wf.away)}</b>
              </>
            )}
            {wf && (
              <>
                <span>Barınak</span>
                <b class={`num ${wf.overcrowded ? 'azaldi' : ''}`}>{fmtInt(wf.housing)}</b>
              </>
            )}
          </div>
          {wf?.overcrowded && <div class="ipucu-metin kirmizi-yazi">Çadırlar yetmiyor: kalabalık amele yavaş çalışır.</div>}
        </div>
      }
    >
      <span>
        İşçi: <b class={`num ${wf?.overcrowded ? 'azaldi' : ''}`}>{fmtInt(idle)}</b> boşta / <span class="num">{fmtInt(s.workforce.total)}</span>
      </span>
    </Ipucu>
  );
}

const KATEGORILER: BuildingCategory[] = ['uretim', 'askeri', 'ordugah', 'ozel'];

function InsaMenusu() {
  const s = store.state;
  const [kat, setKat] = useState<BuildingCategory | 'hepsi'>('hepsi');
  if (!s || store.ui.panel !== 'insa') return null;
  const items = safe(() => buildMenuItems(s), []);
  const cats = KATEGORILER.filter((c) => items.some((i) => i.def.category === c));
  const shown = items
    .filter((i) => kat === 'hepsi' || i.def.category === kat)
    .sort((a, b) => Number(!!a.locked) - Number(!!b.locked));
  return (
    <div class="insa-menusu panel-kagit etkilesim acilir-panel">
      <div class="panel-baslik">
        <Ikon ad="insa" />
        <span class="baslik-yazi">İnşa</span>
        <span class="soluk kucuk">
          <IsciOzet />
        </span>
        <KapatBtn onClick={() => store.setUi({ panel: null })} />
      </div>
      <div class="sekmeler">
        <Btn tur="kagit" class="sekme" aktif={kat === 'hepsi'} onClick={() => setKat('hepsi')}>
          Hepsi
        </Btn>
        {cats.map((c) => (
          <Btn key={c} tur="kagit" class="sekme" aktif={kat === c} onClick={() => setKat(c)}>
            {CATEGORY_ADI[c]}
          </Btn>
        ))}
      </div>
      <div class="yapi-izgara" onWheel={(e) => e.stopPropagation()}>
        {shown.length === 0 && <div class="soluk">Bu dönemde kurulabilecek yapı yok.</div>}
        {shown.map((it) => (
          <YapiKarti key={it.def.id} it={it} />
        ))}
      </div>
    </div>
  );
}

function KomutBtn({ ikon, ad, tus, aktif, onClick }: { ikon: string; ad: string; tus: string; aktif: boolean; onClick: () => void }) {
  return (
    <Btn
      tur="gece"
      class="komut-btn"
      aktif={aktif}
      sesi={aktif ? 'kapat' : 'ac'}
      ipucu={
        <div class="ipucu-icerik">
          <b>{ad}</b> <span class="tus">{tus}</span>
        </div>
      }
      onClick={onClick}
    >
      <Ikon ad={ikon} />
      <span class="komut-ad">{ad}</span>
      <span class="tus-ipucu">{tus}</span>
    </Btn>
  );
}

export function AltSol() {
  const h = useHud();
  const s = store.state;
  if (!s) return null;
  const panel = store.ui.panel;
  return (
    <div class="alt-sol">
      <div class="komutlar etkilesim">
        <KomutBtn ikon="insa" ad="İnşa" tus="B" aktif={panel === 'insa'} onClick={() => store.setUi({ panel: panel === 'insa' ? null : 'insa', placement: null })} />
        <KomutBtn ikon="edirne" ad="Edirne" tus="E" aktif={panel === 'edirne'} onClick={() => store.setUi({ panel: panel === 'edirne' ? null : 'edirne', placement: null })} />
        <KomutBtn ikon="gunluk" ad="Günlük" tus="G" aktif={h.logOpen} onClick={() => setHud({ logOpen: !h.logOpen })} />
      </div>
      <InsaMenusu />
      <Gunluk />
    </div>
  );
}
