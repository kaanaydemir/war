/**
 * TITLE SCREEN — over the live attract-mode map (dusk bombardment, drifting
 * camera): dithered vignette, embers and gold motes, the gilded pixel
 * logotype with a sweeping glint and twinkling sparkles, and a keyboard
 * navigable menu with sub-pages (difficulty, historical scenes, sources).
 */
import type { JSX } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { formatDate } from '../../core/calendar';
import type { ScenarioName } from '../../core/feature';
import { store } from '../../core/store';
import { DIFFICULTY_REPAIR, HIST_SIEGE_START, RELIEF_WINDOW } from '../../features/byzantium/data';
import { SCENARIOS } from '../../game/scenarios';
import { SOURCES } from '../../data/sources';
import { useGame } from '../useGame';
import { artUrl, drawTug, iconUrl, logoArt } from './art';
import { DIFFICULTY_INFO, SCENARIO_INFO } from './content';
import { EventImage } from './EventImage';
import { Btn, DitherShade, Divider, FxCanvas, pxVars, PxImg, sfx, transition, useKeyLayer, usePx, useViewport } from './kit';
import { QA } from './qa';
import { difficultyDetail, firstEnabled, fitScale, groupSources, navStep } from './logic';

type View = 'ana' | 'zorluk' | 'sahneler' | 'kaynaklar';

interface Item {
  id: string;
  label: string;
  icon: string;
  disabled?: boolean;
  hint?: string;
  run: () => void;
}

// ───────────────────────────── logo ─────────────────────────────

function Logo(props: { k: number }) {
  const a = logoArt();
  const { w, h } = a.logo.canvas;
  const k = props.k;
  // a handful of sparkle points chosen once
  const sparks = useMemo(() => {
    const pts = a.logo.sparkles;
    const out: { x: number; y: number; d: number; dur: number }[] = [];
    for (let i = 0; i < 9 && pts.length; i++) {
      const p = pts[Math.floor((i * 7919 + 13) % pts.length)];
      out.push({ x: p[0], y: p[1], d: (i * 0.83) % 5, dur: 2.6 + (i % 4) * 0.7 });
    }
    return out;
  }, [a]);
  const glintStyle = {
    '--glint-end': `-${w * a.frames * k}px`,
    animationTimingFunction: `steps(${a.frames})`,
  } as JSX.CSSProperties;
  return (
    <div class="baslik-logo" style={{ width: w * k, height: h * k }}>
      <PxImg src={a.url} w={w} h={h} k={k} class="logo-ana" />
      <span class="logo-parilti" style={{ width: w * k, height: h * k }}>
        <img src={a.glint} width={w * (a.frames + 1) * k} height={h * k} alt="" draggable={false} style={glintStyle} />
      </span>
      {sparks.map((s, i) => (
        <span
          key={i}
          class="logo-kivilcim"
          style={
            {
              left: (s.x - 3) * k,
              top: (s.y - 3) * k,
              width: 7 * k,
              height: 7 * k,
              animationDelay: `${s.d}s`,
              animationDuration: `${s.dur}s`,
              '--k': k,
            } as JSX.CSSProperties
          }
        />
      ))}
    </div>
  );
}

// ───────────────────────────── main menu ─────────────────────────────

function MainMenu(props: { items: Item[]; focus: number; setFocus: (i: number) => void; k: number }) {
  return (
    <nav class="baslik-menu">
      {props.items.map((it, i) => (
        <button
          key={it.id}
          type="button"
          class={`menu-oge ${i === props.focus ? 'odak' : ''}`}
          disabled={it.disabled}
          title={it.hint}
          style={{ animationDelay: `${0.5 + i * 0.07}s` }}
          onMouseEnter={() => {
            if (!it.disabled && i !== props.focus) {
              sfx('tik');
              props.setFocus(i);
            }
          }}
          onClick={() => {
            if (it.disabled) return sfx('hata');
            sfx('onay');
            props.setFocus(i);
            it.run();
          }}
        >
          <i class="menu-isaret" />
          <PxImg src={iconUrl(it.icon)} w={12} h={12} k={props.k} class="menu-ikon" />
          <span>{it.label}</span>
          {it.disabled && it.hint && <small>{it.hint}</small>}
        </button>
      ))}
    </nav>
  );
}

// ───────────────────────────── difficulty ─────────────────────────────

function DifficultyPicker(props: { focus: number; setFocus: (i: number) => void; onPick: (i: number) => void; onBack: () => void; px: number }) {
  return (
    <section class="baslik-alt uk-panel-gece zorluk">
      <header class="alt-baslik">
        <button type="button" class="uk-geri" onClick={props.onBack} title="Geri (Esc)">
          <PxImg src={iconUrl('geri')} w={12} h={12} k={props.px} />
        </button>
        <h2>Zorluk seç</h2>
      </header>
      <p class="alt-aciklama">
        Zorluk, Haçlı yardımının gelebileceği en erken günü ve Bizans’ın surları gece onarma hızını değiştirir.
      </p>
      <div class="zorluk-kartlar">
        {DIFFICULTY_INFO.map((d, i) => {
          const det = difficultyDetail(d.id, RELIEF_WINDOW, DIFFICULTY_REPAIR, HIST_SIEGE_START);
          return (
            <button
              key={d.id}
              type="button"
              class={`zorluk-kart ${i === props.focus ? 'odak' : ''} z-${d.id}`}
              onMouseEnter={() => {
                if (i !== props.focus) {
                  sfx('tik');
                  props.setFocus(i);
                }
              }}
              onClick={() => {
                sfx('onay');
                props.onPick(i);
              }}
            >
              <PxImg src={artUrl('tug' + d.tug, () => drawTug(d.tug))} w={26} h={34} k={props.px} class="tug" />
              <b>{d.name}</b>
              <em>{d.tagline}</em>
              <ul>
                <li>{det.yardim}</li>
                <li>{det.onarim}</li>
              </ul>
            </button>
          );
        })}
      </div>
      <footer class="alt-ipucu">← → seç · Enter başla · Esc geri</footer>
    </section>
  );
}

// ───────────────────────────── scenarios ─────────────────────────────

function ScenarioGallery(props: { focus: number; setFocus: (i: number) => void; onPick: (i: number) => void; onBack: () => void; px: number }) {
  const sel = SCENARIO_INFO[props.focus] ?? SCENARIO_INFO[0];
  const setup = SCENARIOS[sel.name];
  const { h } = useViewport();
  const imgK = h >= 900 ? Math.max(2, props.px) : 2;
  return (
    <section class="baslik-alt uk-panel-gece sahneler">
      <header class="alt-baslik">
        <button type="button" class="uk-geri" onClick={props.onBack} title="Geri (Esc)">
          <PxImg src={iconUrl('geri')} w={12} h={12} k={props.px} />
        </button>
        <h2>Tarihî Sahneler</h2>
      </header>
      <div class="sahne-govde">
        <ol class="sahne-liste uk-kaydir">
          {SCENARIO_INFO.map((s, i) => (
            <li key={s.name}>
              <button
                type="button"
                class={i === props.focus ? 'odak' : ''}
                onMouseEnter={() => {
                  if (i !== props.focus) {
                    sfx('tik');
                    props.setFocus(i);
                  }
                }}
                onClick={() => {
                  if (i === props.focus) {
                    sfx('onay');
                    props.onPick(i);
                  } else {
                    sfx('sayfa');
                    props.setFocus(i);
                  }
                }}
              >
                <span class="num">{String(i + 1).padStart(2, '0')}</span>
                {SCENARIOS[s.name]?.title ?? s.name}
              </button>
            </li>
          ))}
        </ol>
        <div class="sahne-onizleme" key={sel.name}>
          <div class="sahne-resim">
            <EventImage imageKey={sel.image} k={imgK} />
          </div>
          <h3>{setup?.title ?? sel.name}</h3>
          <div class="sahne-tarih num">{setup ? formatDate(setup.day) : ''}</div>
          <p>{sel.desc}</p>
          <Btn kind="kirmizi" onClick={() => props.onPick(props.focus)}>
            Sahneyi oyna
          </Btn>
        </div>
      </div>
      <footer class="alt-ipucu">↑ ↓ seç · Enter oyna · Esc geri</footer>
    </section>
  );
}

// ───────────────────────────── sources & credits ─────────────────────────────

export function SourcesPanel(props: { onBack?: () => void; px: number }) {
  const groups = groupSources(SOURCES);
  return (
    <section class="baslik-alt uk-panel-gece kaynaklar">
      <header class="alt-baslik">
        {props.onBack && (
          <button type="button" class="uk-geri" onClick={props.onBack} title="Geri (Esc)">
            <PxImg src={iconUrl('geri')} w={12} h={12} k={props.px} />
          </button>
        )}
        <h2>Kaynaklar &amp; Emeği Geçenler</h2>
      </header>
      <div class="kaynak-govde uk-kaydir">
        <p class="alt-aciklama">
          Oyun tarihe sadık kalır ve Osmanlı kaynaklarını esas alır. Surların içindeki durum ve tarih doğrulaması için diğer kaynaklar yalnızca kontrol
          amacıyla kullanılır. Zaman, asker sayıları ve haritadaki mesafeler bilerek sıkıştırılmıştır.
        </p>
        <div class="kaynak-gruplar">
          {groups.map((g) => (
            <div key={g.group} class={`kaynak-grup g-${g.group}`}>
              <h3>{g.title}</h3>
              <ul>
                {g.items.map((s) => (
                  <li key={s.id}>
                    <b>{s.author}</b>, <i>{s.title}</i>
                    {s.note && <small> — {s.note}</small>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <Divider />
        <div class="emek">
          <h3>Emeği Geçenler</h3>
          <dl>
            <dt>Tasarım, kod ve pixel çizimler</dt>
            <dd>Claude</dd>
            <dt>Müzik ve sesler</dt>
            <dd>Gerçek zamanlı sentez (mehter makamları)</dd>
            <dt>Görsel kaynaklar</dt>
            <dd>Buondelmonti’nin İstanbul haritası, Matrakçı Nasuh’un İstanbul minyatürü, Panorama 1453 Tarih Müzesi</dd>
            <dt>Yazı tipleri</dt>
            <dd>Pixelify Sans, Silkscreen (SIL Open Font License)</dd>
            <dt>Motor</dt>
            <dd>Phaser 3, Preact, TypeScript, Vite</dd>
          </dl>
        </div>
      </div>
    </section>
  );
}

// ───────────────────────────── screen ─────────────────────────────

export function TitleScreen() {
  const st = useGame();
  const px = usePx();
  const vp = useViewport();
  const [view, setView] = useState<View>(() => QA.titleView ?? 'ana');
  const hasSave = st.actions.hasSave();
  const items: Item[] = [
    { id: 'yeni', label: 'Yeni Oyun', icon: 'oynat', run: () => setView('zorluk') },
    {
      id: 'devam',
      label: 'Devam Et',
      icon: 'yukle',
      disabled: !hasSave,
      hint: hasSave ? undefined : 'Kayıt yok',
      run: () => transition(() => store.actions.load()),
    },
    { id: 'sahne', label: 'Tarihî Sahneler', icon: 'olay', run: () => setView('sahneler') },
    { id: 'ansiklopedi', label: 'Ansiklopedi', icon: 'kitap', run: () => store.setUi({ panel: 'ansiklopedi' }) },
    { id: 'ayarlar', label: 'Ayarlar', icon: 'ayar', run: () => store.setUi({ panel: 'ayarlar' }) },
    { id: 'kaynaklar', label: 'Kaynaklar & Emeği Geçenler', icon: 'kaynak', run: () => setView('kaynaklar') },
  ];
  const [focus, setFocus] = useState(() => (hasSave ? 1 : 0));
  const [dFocus, setDFocus] = useState(1);
  const [sFocus, setSFocus] = useState(4);
  useEffect(() => {
    if (items[focus]?.disabled) setFocus(firstEnabled(items.length, (k) => !!items[k].disabled));
  }, [hasSave]);

  const back = () => {
    sfx('kapat');
    setView('ana');
  };
  const pickDifficulty = (i: number) => {
    const d = DIFFICULTY_INFO[i];
    transition(() => store.actions.newGame(d.id));
  };
  const pickScenario = (i: number) => {
    const s = SCENARIO_INFO[i];
    transition(() => store.actions.loadScenario(s.name as ScenarioName));
  };

  useKeyLayer((e) => {
    if (store.ui.panel) return false;
    const k = e.key;
    if (view === 'ana') {
      if (k === 'ArrowDown' || k === 'ArrowUp' || k === 's' || k === 'w') {
        const nf = navStep(focus, k === 'ArrowDown' || k === 's' ? 1 : -1, items.length, (i) => !!items[i].disabled);
        if (nf !== focus) sfx('tik');
        setFocus(nf);
        return true;
      }
      if (k === 'Enter' || k === ' ') {
        const it = items[focus];
        if (it && !it.disabled) {
          sfx('onay');
          it.run();
        }
        return true;
      }
      return false;
    }
    if (k === 'Escape' || k === 'Backspace') {
      back();
      return true;
    }
    if (view === 'zorluk') {
      if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'a' || k === 'd') {
        sfx('tik');
        setDFocus((f) => navStep(f, k === 'ArrowRight' || k === 'd' ? 1 : -1, DIFFICULTY_INFO.length));
        return true;
      }
      if (k === 'Enter' || k === ' ') {
        sfx('onay');
        pickDifficulty(dFocus);
        return true;
      }
    }
    if (view === 'sahneler') {
      if (k === 'ArrowDown' || k === 'ArrowUp' || k === 's' || k === 'w') {
        sfx('sayfa');
        setSFocus((f) => navStep(f, k === 'ArrowDown' || k === 's' ? 1 : -1, SCENARIO_INFO.length));
        return true;
      }
      if (k === 'Enter' || k === ' ') {
        sfx('onay');
        pickScenario(sFocus);
        return true;
      }
    }
    return false;
  });

  const a = logoArt();
  const logoK = fitScale(a.logo.canvas.w, vp.w * 0.92, px * 2, 1);
  const compact = view !== 'ana';
  return (
    <div class={`ekran baslik gorunum-${view}`} style={pxVars(px)}>
      <DitherShade px={px} top={0.34} bottom={0.3} strength={0.9} />
      <div class="baslik-isik" />
      <FxCanvas px={px} counts={{ kor: 46, zerre: 26 }} burst={{ x: 0.5, y: 0.17, n: 90, delay: 0.55, spread: 120 }} />
      <div class="baslik-yerlesim">
        <div class={`baslik-ust ${compact ? 'kucuk' : ''}`}>
          <Logo k={compact ? Math.max(1, Math.round(logoK / 2)) : logoK} />
          {!compact && <div class="baslik-alt-yazi">Kostantiniyye kuşatması · 6 Nisan – 29 Mayıs 1453</div>}
        </div>
        <div class="baslik-icerik etkilesim" key={view}>
          {view === 'ana' && <MainMenu items={items} focus={focus} setFocus={setFocus} k={px} />}
          {view === 'zorluk' && <DifficultyPicker focus={dFocus} setFocus={setDFocus} onPick={pickDifficulty} onBack={back} px={px} />}
          {view === 'sahneler' && <ScenarioGallery focus={sFocus} setFocus={setSFocus} onPick={pickScenario} onBack={back} px={px} />}
          {view === 'kaynaklar' && <SourcesPanel onBack={back} px={px} />}
        </div>
      </div>
      <footer class="baslik-alt-bilgi">
        <span>↑ ↓ seç · Enter onayla · Esc geri</span>
        <span>Osmanlı kaynaklarına sadık bir kuşatma stratejisi · v0.1</span>
      </footer>
    </div>
  );
}
