/**
 * IN-GAME HUD (owner: ui-hud). Preact DOM over the Phaser canvas.
 *
 * Ottoman-miniature-inspired pixel UI: parchment panels with bevelled gold
 * rules and tezhip corners, lapis & turquoise accents, red wax seals. All art
 * is generated with PixelCanvas (./art.ts) and scaled by the UI pixel --px
 * (2 px up to ~1800×1000, 3 px above).
 *
 * Reads the store via useGame(); changes the game only by dispatching Commands.
 */
import './hud.css';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { useGame } from '../useGame';
import { AltSol, useKisayollar } from './AltSol';
import { artCssVars, cursorUrl, ICONS } from './art';
import { announce, Bildirimler, DuyuruSeridi, useBusAboneligi } from './Bildirimler';
import { EdirnePaneli } from './EdirnePaneli';
import { Gorevler } from './Gorevler';
import { Gostergeler } from './Gostergeler';
import { Harita } from './Harita';
import { HedefModu, ImlecIpucu, OnayKutusu, SafakRaporu, YerlestirmeIpucu } from './Katmanlar';
import { OzelEylemler } from './OzelEylemler';
import { Secim } from './Secim';
import { askConfirm, Ikon, IpucuKatmani, Koruma, setHud } from './ui';
import { store } from '../../core/store';
import type { PickKind } from '../../core/feature';
import { UstSerit } from './UstSerit';
import { uiScale } from './format';


function useUiScale(): 2 | 3 {
  const [px, setPx] = useState(() => uiScale(window.innerWidth, window.innerHeight));
  useEffect(() => {
    const fn = () => setPx(uiScale(window.innerWidth, window.innerHeight));
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return px;
}

/**
 * QA hooks for screenshots (no effect in normal play):
 *   ?hudpanel=insa|edirne · ?hudsec=group|cannon|building|ship|mine:first|<id> or section:<id>
 *   ?hudsafak=1 (dawn report) · ?hudlog=1 (Günlük) · ?hudonay=1 (confirm dialog) · ?hudhedef=1 (target mode)
 */
function useQaHooks(ready: boolean): void {
  useEffect(() => {
    if (!ready) return;
    const q = new URLSearchParams(location.search);
    const s = store.state;
    if (!s) return;
    const t = window.setTimeout(() => {
      const panel = q.get('hudpanel');
      if (panel) store.setUi({ panel });
      const sec = q.get('hudsec');
      if (sec) {
        const [kind, idRaw] = sec.split(':');
        const list: Record<string, { id: number | string }[]> = {
          group: s.groups,
          cannon: s.cannons.filter((c) => c.tx >= 0),
          building: s.buildings,
          ship: s.ships,
          mine: s.mines,
        };
        let id: number | string | undefined;
        if (kind === 'section') id = idRaw;
        else if (idRaw === 'first' || !idRaw) id = list[kind]?.[0]?.id;
        else if (idRaw === 'all') {
          store.setUi({ selection: (list[kind] ?? []).slice(0, 8).map((e) => ({ kind: kind as PickKind, id: e.id, score: 0 })) });
        } else id = Number(idRaw);
        if (id != null) store.setUi({ selection: [{ kind: kind as PickKind, id, score: 0 }] });
      }
      if (q.get('hudsafak') === '1') {
        setHud({ dawn: { resume: 1 } });
        store.setUi({ showDawnReport: true });
      }
      if (q.get('hudlog') === '1') setHud({ logOpen: true });
      if (q.get('hudduyuru') === '1') announce('Kuşatma başladı', '6 Nisan 1453 · Gün 1');
      if (q.get('hudhedef') === '1') setHud({ target: { kind: 'emir', order: 'hucum', groupIds: [], label: 'Hücum edilecek sur kesimini seç' } });
      if (q.get('hudonay') === '1')
        askConfirm({ title: 'Son hücum ilan edilsin mi?', danger: true, ok: 'HÜCUM!', body: <p>Bu karar geri alınamaz.</p>, onOk: () => {} });
    }, 300);
    return () => clearTimeout(t);
  }, [ready]);
}

/** Debug: ?hudgaleri=1 shows every HUD icon enlarged (art review). */
function Galeri() {
  return (
    <div class="galeri panel-kagit etkilesim">
      {Object.keys(ICONS).map((k) => (
        <div key={k} class="galeri-oge">
          <Ikon ad={k} olcek={3} />
          <span>{k}</span>
        </div>
      ))}
    </div>
  );
}

export function Hud() {
  const st = useGame();
  useBusAboneligi();
  useKisayollar();
  const px = useUiScale();
  const vars = useMemo(() => artCssVars(), []);
  useEffect(() => {
    document.body.style.setProperty('--hud-imlec', `url(${cursorUrl()}) 15 15, crosshair`);
  }, []);
  const galeri = useMemo(() => new URLSearchParams(location.search).get('hudgaleri') === '1', []);
  const s = st.state;
  useQaHooks(!!s);
  if (!s) return null;
  return (
    <div class={`hud olcek-${px} evre-${s.time.phase}`} style={{ ...vars, '--px': `${px}px` }}>
      <Koruma ad="harita">
        <Harita />
      </Koruma>
      <Koruma ad="görevler">
        <Gorevler />
      </Koruma>
      <Koruma ad="seçim">
        <Secim />
      </Koruma>
      <Koruma ad="özel eylemler">
        <OzelEylemler />
      </Koruma>
      <Koruma ad="komutlar">
        <AltSol />
      </Koruma>
      <Koruma ad="göstergeler">
        <Gostergeler />
      </Koruma>
      <Koruma ad="üst şerit">
        <UstSerit />
      </Koruma>
      <Koruma ad="bildirimler">
        <Bildirimler />
        <DuyuruSeridi />
      </Koruma>
      <Koruma ad="yerleştirme">
        <YerlestirmeIpucu />
      </Koruma>
      <Koruma ad="hedef">
        <HedefModu />
      </Koruma>
      <Koruma ad="edirne">
        <EdirnePaneli />
      </Koruma>
      <Koruma ad="şafak">
        <SafakRaporu />
      </Koruma>
      <Koruma ad="onay">
        <OnayKutusu />
      </Koruma>
      <ImlecIpucu />
      <IpucuKatmani />
      {galeri && <Galeri />}
    </div>
  );
}
