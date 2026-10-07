/**
 * Overlay layers of the HUD: dawn report card, confirmation dialog,
 * "hedef seç" target mode (captures the next map click), placement hint and
 * the subtle map hover tooltip.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { formatDate, siegeDayNumber } from '../../core/calendar';
import type { Command } from '../../core/commands';
import { store } from '../../core/store';
import { buildingDef } from '../../features/economy/api';
import { getDawnReport, type DawnReport } from '../../features/events/api';
import { sectionAt } from '../../features/fortifications/api';
import { LANDMARKS, landmarkTile } from '../../data/landmarks';
import { getWorld } from '../../game/GameScene';
import { fmtPct } from './format';
import { REGION_ADI, safe, TERRAIN_ADI } from './logic';
import { Btn, hud, Ikon, Koseler, setHud, ses, useHud, type TargetMode } from './ui';

// ───────────────────────────── Dawn report ─────────────────────────────

const SATIR_IKON: Record<DawnReport['lines'][number]['kind'], string> = {
  bilgi: 'gunluk',
  uyari: 'kilit',
  basari: 'onay',
  kayip: 'emir-hucum',
  casus: 'bizans',
};

export function kapatSafak(): void {
  const resume = hud.dawn?.resume ?? 1;
  setHud({ dawn: null });
  store.setUi({ showDawnReport: false });
  if (store.state && store.state.time.speed === 0) store.dispatch({ t: 'hiz', speed: resume || 1 });
}

export function SafakRaporu() {
  const h = useHud();
  const s = store.state;
  if (!s || !store.ui.showDawnReport) return null;
  const rep = safe(() => getDawnReport(s), null);
  const gun = siegeDayNumber(s.time.day, s.time.siegeStartDay);
  return (
    <div class="safak-perde etkilesim">
      <div class="safak-kart panel-kagit buyuk-panel">
        <Koseler />
        <div class="safak-gok" />
        <div class="safak-ust">
          <Ikon ad="gok-safak" olcek={2} />
          <div>
            <div class="safak-baslik">{'Şafak Raporu'.toLocaleUpperCase('tr')}</div>
            <div class="safak-tarih">
              {formatDate(s.time.day)}
              {gun != null && <span class="num"> · Gün {gun}</span>}
            </div>
          </div>
        </div>
        <div class="ayirici" />
        <ul class="safak-satirlar">
          {!rep && <li class="soluk">Haberciler henüz gelmedi…</li>}
          {rep?.lines.map((l, i) => (
            <li key={i} class={`safak-satir satir-${l.kind}`} style={{ animationDelay: `${0.15 + i * 0.12}s` }}>
              <Ikon ad={SATIR_IKON[l.kind] ?? 'gunluk'} />
              <span>{l.text}</span>
            </li>
          ))}
        </ul>
        <div class="safak-alt">
          <label class="onay-kutusu" onMouseDown={(e) => e.preventDefault()}>
            <input
              type="checkbox"
              tabIndex={-1}
              checked={store.ui.settings.autoPauseAtDawn}
              onChange={(e) => store.setUi({ settings: { ...store.ui.settings, autoPauseAtDawn: (e.target as HTMLInputElement).checked } })}
            />
            Her şafakta dur
          </label>
          <Btn tur="altin" class="buyuk-btn" sesi="onay" onClick={kapatSafak}>
            Devam
          </Btn>
        </div>
        {h.dawn == null && <span />}
      </div>
    </div>
  );
}

// ───────────────────────────── Confirmation ─────────────────────────────

export function OnayKutusu() {
  const h = useHud();
  const c = h.confirm;
  if (!c) return null;
  const close = () => setHud({ confirm: null });
  return (
    <div class="onay-perde etkilesim" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div class={`onay-kart panel-kagit buyuk-panel ${c.danger ? 'tehlikeli' : ''}`}>
        <Koseler />
        <div class="onay-baslik">{c.title}</div>
        <div class="ayirici" />
        <div class="onay-govde">{c.body}</div>
        <div class="onay-butonlar">
          <Btn tur="kagit" sesi="kapat" onClick={close}>
            Vazgeç
          </Btn>
          <Btn
            tur={c.danger ? 'kirmizi' : 'altin'}
            class="buyuk-btn"
            sesi="onay"
            onClick={() => {
              close();
              c.onOk();
            }}
          >
            {c.ok}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────── Target mode ─────────────────────────────

function targetCommand(t: TargetMode, sectionId: string): Command[] {
  switch (t.kind) {
    case 'emir':
      return [{ t: 'emir', groupIds: t.groupIds ?? [], order: { type: t.order ?? 'hucum', sectionId } }];
    case 'hendek':
      return (t.groupIds ?? []).map((g) => ({ t: 'hendek-doldur', sectionId, groupId: g }) as Command);
    case 'lagim':
      return (t.groupIds ?? []).map((g) => ({ t: 'lagim-kaz', sectionId, groupId: g }) as Command);
    case 'top':
      return [{ t: 'top-hedef', cannonIds: t.cannonIds ?? [], sectionId }];
    case 'kule':
      return [{ t: 'kule-insa', sectionId }];
  }
}

function hoveredSection(): string | null {
  const ht = store.ui.hoverTile;
  if (!ht) return null;
  return safe(() => sectionAt(ht.tx + 0.5, ht.ty + 0.5, 3), null);
}

export function startTarget(t: TargetMode): void {
  ses('ac');
  setHud({ target: t, targetHover: null });
}

export function HedefModu() {
  const h = useHud();
  const t = h.target;
  useEffect(() => {
    if (!t) return;
    document.body.classList.add('hud-hedef');
    const isCanvas = (e: Event) => (e.target as HTMLElement | null)?.tagName === 'CANVAS';
    const block = (e: MouseEvent) => {
      if (!isCanvas(e)) return;
      e.stopImmediatePropagation();
      e.preventDefault();
    };
    const up = (e: MouseEvent) => {
      if (!isCanvas(e)) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      const cur = hud.target;
      if (!cur) return;
      const sid = hoveredSection();
      const sec = sid ? store.state?.sections[sid] : null;
      if (!sid || !sec || (cur.landOnly && sec.kind !== 'kara')) {
        ses('hata');
        return;
      }
      for (const c of targetCommand(cur, sid)) store.dispatch(c);
      ses('onay');
      setHud({ target: null, targetHover: null });
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setHud({ target: null, targetHover: null });
    };
    const poll = window.setInterval(() => {
      const sid = hoveredSection();
      if (sid !== hud.targetHover) setHud({ targetHover: sid });
    }, 80);
    window.addEventListener('mousedown', block, true);
    window.addEventListener('pointerdown', block, true);
    window.addEventListener('mouseup', up, true);
    window.addEventListener('pointerup', block, true);
    window.addEventListener('keydown', key);
    return () => {
      document.body.classList.remove('hud-hedef');
      clearInterval(poll);
      window.removeEventListener('mousedown', block, true);
      window.removeEventListener('pointerdown', block, true);
      window.removeEventListener('mouseup', up, true);
      window.removeEventListener('pointerup', block, true);
      window.removeEventListener('keydown', key);
    };
  }, [t]);
  if (!t) return null;
  const sec = h.targetHover ? store.state?.sections[h.targetHover] : null;
  const bad = sec && t.landOnly && sec.kind !== 'kara';
  return (
    <div class="hedef-serit etkilesim">
      <Ikon ad="emir-hucum" />
      <div class="hedef-yazi">
        <b>{t.label}</b>
        <span>{sec ? (bad ? `${sec.name} — yalnızca kara surları` : `Hedef: ${sec.name} · gedik ${fmtPct(sec.breach)}`) : 'Haritada bir sur kesimine tıkla'}</span>
      </div>
      <Btn tur="kagit" sesi="kapat" onClick={() => setHud({ target: null })}>
        Vazgeç <span class="tus">Esc</span>
      </Btn>
    </div>
  );
}

// ───────────────────────────── Placement hint ─────────────────────────────

const YAKIN_ADI: Record<string, string> = { kaya: 'kayalık arazinin', orman: 'orman kenarının', su: 'suyun' };

export function YerlestirmeIpucu() {
  const pl = store.ui.placement;
  if (!pl) return null;
  const def = safe(() => buildingDef(pl.building), undefined);
  return (
    <div class="yerlestirme-serit">
      <b>{def?.name ?? pl.building}</b>
      <span>
        <span class="tus">Sol tık</span> kur · <span class="tus">Shift</span> ile birden çok · <span class="tus">Sağ tık</span>/<span class="tus">Esc</span> vazgeç
      </span>
      {def?.near && <span class="soluk">{YAKIN_ADI[def.near] ?? def.near} yanına kurulmalı</span>}
    </div>
  );
}

// ───────────────────────────── Map hover tooltip ─────────────────────────────

const LANDMARK_LIST = Object.values(LANDMARKS);
let lmTiles: { name: string; tx: number; ty: number }[] | null = null;
function nearestLandmark(tx: number, ty: number): string | null {
  if (!lmTiles) lmTiles = LANDMARK_LIST.map((l) => ({ name: l.name, ...safe(() => landmarkTile(l.id as keyof typeof LANDMARKS), { tx: -999, ty: -999 }) }));
  let best: string | null = null;
  let bd = 4.5;
  for (const l of lmTiles) {
    const d = Math.hypot(l.tx - tx, l.ty - ty);
    if (d < bd) {
      bd = d;
      best = l.name;
    }
  }
  return best;
}

interface HoverInfo {
  x: number;
  y: number;
  lines: { t: string; cls?: string }[];
}

export function ImlecIpucu() {
  const [info, setInfo] = useState<HoverInfo | null>(null);
  const mouse = useRef({ x: 0, y: 0, overCanvas: false, still: 0, moved: 0 });
  const lastKey = useRef('');
  useEffect(() => {
    const mm = (e: MouseEvent) => {
      const m = mouse.current;
      m.x = e.clientX;
      m.y = e.clientY;
      m.overCanvas = (e.target as HTMLElement | null)?.tagName === 'CANVAS';
      m.moved = performance.now();
    };
    window.addEventListener('mousemove', mm, { passive: true });
    const iv = window.setInterval(() => {
      const m = mouse.current;
      const s = store.state;
      const ht = store.ui.hoverTile;
      const idle = performance.now() - m.moved;
      if (!s || !ht || !m.overCanvas || store.ui.placement || idle < 220 || store.ui.screen !== 'oyun') {
        if (lastKey.current) {
          lastKey.current = '';
          setInfo(null);
        }
        return;
      }
      const key = `${ht.tx},${ht.ty},${Math.round(m.x / 4)},${Math.round(m.y / 4)}`;
      if (key === lastKey.current) return;
      lastKey.current = key;
      const w = safe(() => getWorld(), null);
      const lines: HoverInfo['lines'] = [];
      if (w && w.inBounds(ht.tx, ht.ty)) {
        const sid = safe(() => sectionAt(ht.tx + 0.5, ht.ty + 0.5, hud.target ? 3 : 1.6), null);
        const sec = sid ? s.sections[sid] : null;
        if (sec) {
          lines.push({ t: sec.name, cls: 'vurgu' });
          lines.push({ t: sec.breach > 0.05 ? `Gedik ${fmtPct(sec.breach)}` : 'Sağlam', cls: sec.breach >= 0.5 ? 'kirmizi-yazi' : '' });
        } else {
          const lm = nearestLandmark(ht.tx + 0.5, ht.ty + 0.5);
          if (lm) lines.push({ t: lm, cls: 'vurgu' });
          const reg = safe(() => w.regionAt(ht.tx, ht.ty), null);
          const ter = safe(() => w.terrainAt(ht.tx, ht.ty), null);
          const parts = [reg ? REGION_ADI[reg] : null, ter ? TERRAIN_ADI[ter] : null].filter(Boolean) as string[];
          if (parts.length) lines.push({ t: parts.join(' · ') });
        }
      }
      setInfo(lines.length ? { x: m.x, y: m.y, lines } : null);
    }, 90);
    return () => {
      window.removeEventListener('mousemove', mm);
      clearInterval(iv);
    };
  }, []);
  if (!info) return null;
  return (
    <div class="imlec-ipucu" style={{ right: `${Math.max(4, window.innerWidth - info.x + 6)}px`, top: `${info.y + 20}px` }}>
      {info.lines.map((l, i) => (
        <div key={i} class={l.cls ?? ''}>
          {l.t}
        </div>
      ))}
    </div>
  );
}
