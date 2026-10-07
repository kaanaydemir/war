/**
 * EVENT CARD — a miniature-manuscript scroll that unfurls over the map.
 *
 * Pausing cards (decisions, major events) open centred over a dimmed map;
 * non-pausing info cards unroll at the side with a burning fuse that shows
 * the auto-close time. Choices stamp a wax seal when picked; the historical
 * choice is revealed only after choosing or inside "Tarihte ne oldu?".
 * Keys: 1–4 choose · Enter continue · T toggles "Tarihte ne oldu?".
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { store } from '../../core/store';
import { encyclopediaForEvent, eventCardView, type EventCardView } from '../../features/events/api';
import { useGame } from '../useGame';
import { EventImage } from './EventImage';
import { QA } from './qa';
import { Btn, pxVars, sfx, useKeyLayer, usePx, useViewport } from './kit';

const KIND_CLASS: Record<string, string> = { sabit: 'tur-sabit', kosullu: 'tur-kosullu', tepkisel: 'tur-tepkisel', karar: 'tur-karar' };
const KIND_SHORT: Record<string, string> = { sabit: 'Sabit', kosullu: 'Koşullu', tepkisel: 'Tepkisel', karar: 'Karar' };

function safeView(): EventCardView | null {
  const s = store.state;
  if (!s) return null;
  if (QA.eventId && !s.events?.active) {
    // QA preview of any card (read-only view; decisions shown as pausing)
    try {
      const v = eventCardView(s, QA.eventId);
      return v ? { ...v, pauses: v.isDecision || !v.minor } : null;
    } catch {
      return null;
    }
  }
  if (!s.events?.active) return null;
  try {
    return eventCardView(s);
  } catch (err) {
    console.error('[screens] eventCardView failed', err);
    return null;
  }
}

function Chips(props: { chips: { label: string; value: string; good: boolean | null }[] }) {
  if (!props.chips.length) return null;
  return (
    <div class="olay-cipler">
      {props.chips.map((c, i) => (
        <span key={i} class={`olay-cip ${c.good === true ? 'iyi' : c.good === false ? 'kotu' : ''}`}>
          {c.label} <b class="num">{c.value}</b>
        </span>
      ))}
    </div>
  );
}

function CardBody(props: { v: EventCardView; side: boolean; px: number; imgK: number; chosen: string | null; onChoose: (id: string) => void; onClose: () => void }) {
  const { v } = props;
  const [tarihte, setTarihte] = useState(false);
  const enc = (() => {
    try {
      return encyclopediaForEvent(v.id).slice(0, 4);
    } catch {
      return [];
    }
  })();
  const revealed = tarihte || !!props.chosen;
  const n = v.choices.length;
  useKeyLayer((e) => {
    if (store.ui.panel || store.ui.encyclopediaEntry) return false;
    const d = Number(e.key);
    if (v.isDecision && d >= 1 && d <= n && !props.chosen) {
      const c = v.choices[d - 1];
      if (c && !c.disabled) props.onChoose(c.id);
      else sfx('hata');
      return true;
    }
    if (e.key.toLowerCase() === 't') {
      sfx('sayfa');
      setTarihte((x) => !x);
      return true;
    }
    if (!v.isDecision && (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ')) {
      props.onClose();
      return true;
    }
    return false;
  }, !props.side); // side (info) cards never take the keyboard
  return (
    <>
      <header class="olay-ust">
        <div class="olay-muhur" title={v.kindLabel}>
          <span>{v.code}</span>
        </div>
        <div class="olay-baslik-blok">
          <div class="olay-meta">
            <span class={`olay-tur ${KIND_CLASS[v.kind] ?? ''}`}>{KIND_SHORT[v.kind] ?? v.kindLabel}</span>
            <span class="olay-tarih num">{v.dateLabel}</span>
            {v.queueLength > 0 && <span class="olay-sira">+{v.queueLength} kart bekliyor</span>}
          </div>
          <h2 class="olay-baslik">{v.title}</h2>
        </div>
        {!v.isDecision && props.side && <button type="button" class="uk-kapat" title="Kapat" onClick={props.onClose} />}
      </header>
      <div class="olay-govde">
        <div class="olay-sol">
          {v.image && <EventImage imageKey={v.image} k={props.imgK} />}
          <p class="olay-metin">{v.text}</p>
          <Chips chips={v.outcome} />
        </div>
        <div class="olay-sag">
          {v.isDecision && (
            <div class="olay-secimler">
              {v.choices.map((c, i) => {
                const picked = props.chosen === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    class={`olay-secim ${picked ? 'secildi' : ''} ${props.chosen && !picked ? 'soluk' : ''} ${revealed && c.tarihi ? 'tarihi' : ''}`}
                    disabled={c.disabled || !!props.chosen}
                    title={c.reason}
                    onMouseEnter={() => !c.disabled && !props.chosen && sfx('tik')}
                    onClick={() => {
                      if (c.disabled) return sfx('hata');
                      props.onChoose(c.id);
                    }}
                  >
                    <span class="secim-no num">{i + 1}</span>
                    <span class="secim-yazi">
                      <b>{c.label}</b>
                      {c.desc && <small>{c.desc}</small>}
                      {c.disabled && c.reason && <em class="secim-neden">{c.reason}</em>}
                      <Chips chips={c.effects} />
                    </span>
                    {revealed && c.tarihi && <span class="tarihi-rozet">Tarihte</span>}
                    {picked && <span class="secim-damga" />}
                  </button>
                );
              })}
            </div>
          )}
          {v.tarihte && (
            <div class={`olay-tarihte ${tarihte ? 'acik' : ''}`}>
              <button
                type="button"
                class="tarihte-dugme"
                onClick={() => {
                  sfx('sayfa');
                  setTarihte((x) => !x);
                }}
              >
                <i />
                Tarihte ne oldu?
              </button>
              {tarihte && <p>{v.tarihte}</p>}
            </div>
          )}
          {v.sources.length > 0 && (
            <div class="olay-kaynak">
              <span>Kaynak:</span> {v.sources.map((s) => s.label).join(' · ')}
            </div>
          )}
          <div class="olay-alt">
            {enc.length > 0 &&
              enc.map((e) => (
                <button key={e.id} type="button" class="olay-bag" onClick={() => store.setUi({ encyclopediaEntry: e.id })}>
                  {e.title}
                </button>
              ))}
            {v.focus && (
              <button type="button" class="olay-bag harita" onClick={() => v.focus && store.actions.focusTile(v.focus.tx, v.focus.ty, 3)}>
                Haritada göster
              </button>
            )}
          </div>
          {!v.isDecision && (
            <div class="olay-devam">
              <Btn kind="kirmizi" onClick={props.onClose} sound="kapat">
                Devam
              </Btn>
            </div>
          )}
        </div>
      </div>
      {v.autoClose != null && (
        <div class="olay-fitil" title="Kendiliğinden kapanacak">
          <span style={{ width: `${Math.round(v.autoClose * 100)}%` }} />
        </div>
      )}
    </>
  );
}

export function EventCard() {
  useGame();
  const px = usePx();
  const vp = useViewport();
  const live = safeView();
  const lastRef = useRef<EventCardView | null>(null);
  const [closing, setClosing] = useState<EventCardView | null>(null);
  const [chosen, setChosen] = useState<{ id: string; choice: string } | null>(null);
  const prevId = useRef<string | null>(null);

  // keep the last card for its closing animation
  useEffect(() => {
    const id = live?.id ?? null;
    if (prevId.current && prevId.current !== id && lastRef.current) {
      const last = lastRef.current;
      setClosing(last);
      const t = setTimeout(() => setClosing((c) => (c === last ? null : c)), 380);
      prevId.current = id;
      if (id) sfx('sayfa');
      return () => clearTimeout(t);
    }
    if (!prevId.current && id) sfx('ac');
    prevId.current = id;
  }, [live?.id]);
  if (live) lastRef.current = live;

  const v = live ?? closing;
  if (!v) return null;
  const isClosing = !live || (closing != null && live.id !== v.id);
  const side = !v.pauses && !v.isDecision;
  const wide = vp.w >= 1100;
  const imgK = side ? 1 : vp.h >= 1000 && vp.w >= 1700 ? 3 : 2;
  const myChoice = chosen && chosen.id === v.id ? chosen.choice : null;

  const close = () => {
    sfx('kapat');
    store.dispatch({ t: 'olay-kapat', eventId: v.id });
  };
  const choose = (cid: string) => {
    if (myChoice) return;
    sfx('onay');
    setChosen({ id: v.id, choice: cid });
    // let the seal stamp and the historical mark show, then commit
    setTimeout(() => store.dispatch({ t: 'olay-secim', eventId: v.id, choiceId: cid }), 1250);
  };

  return (
    <div class={`olay-katman ${side ? 'yan' : 'orta'} ${isClosing ? 'kapaniyor' : ''}`} style={pxVars(px)}>
      {!side && <div class="olay-perde etkilesim" />}
      <div class={`olay-kart etkilesim ${side ? 'kucuk' : ''} ${wide ? 'genis' : ''}`} key={v.id}>
        <div class="olay-merdane ust" />
        <div class="olay-kagit">
          <CardBody v={v} side={side} px={px} imgK={imgK} chosen={myChoice ?? v.chosen ?? null} onChoose={choose} onClose={close} />
        </div>
        <div class="olay-merdane alt" />
      </div>
    </div>
  );
}
