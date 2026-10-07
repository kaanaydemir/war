/**
 * HUD primitives: pixel icons, bevelled buttons, tooltips, gauge bars,
 * ticking counters, error guards and the HUD-local state (target mode,
 * confirmation dialog, log panel) shared between HUD components.
 */
import { Component, type ComponentChildren, type JSX } from 'preact';
import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'preact/hooks';
import { playUi, type UiSound } from '../../features/audio/api';
import type { OrderType, SectionId } from '../../core/state';
import { ICONS, iconUrl, phaserIcon } from './art';
import { approach, splitSuffix } from './format';

// ───────────────────────────── Sound ─────────────────────────────

export function ses(kind: UiSound): void {
  try {
    playUi(kind);
  } catch {
    /* audio not ready */
  }
}

// ───────────────────────────── HUD-local state ─────────────────────────────

/** "Hedef seç" mode: the next click on a wall section completes the order. */
export interface TargetMode {
  kind: 'emir' | 'hendek' | 'lagim' | 'top' | 'kule';
  label: string;
  groupIds?: number[];
  cannonIds?: number[];
  order?: OrderType;
  /** Restrict to land walls. */
  landOnly?: boolean;
}

export interface ConfirmReq {
  title: string;
  body: ComponentChildren;
  ok: string;
  danger?: boolean;
  onOk: () => void;
}

export const hud = {
  target: null as TargetMode | null,
  confirm: null as ConfirmReq | null,
  logOpen: false,
  /** Dawn report open + the speed to restore. */
  dawn: null as { resume: 0 | 1 | 2 | 3 } | null,
  /** Section hovered while in target mode (for the banner). */
  targetHover: null as SectionId | null,
  /** Speed to restore once the event card that holds the pause closes (dawn report closed first). */
  resumeAfterCard: null as 0 | 1 | 2 | 3 | null,
};

const hudListeners = new Set<() => void>();

export function setHud(patch: Partial<typeof hud>): void {
  Object.assign(hud, patch);
  for (const fn of hudListeners) fn();
}

export function useHud(): typeof hud {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const fn = () => force(0);
    hudListeners.add(fn);
    return () => hudListeners.delete(fn);
  }, []);
  return hud;
}

export function askConfirm(req: ConfirmReq): void {
  ses('ac');
  setHud({ confirm: req });
}

// ───────────────────────────── Icon ─────────────────────────────

export function Ikon({ ad, olcek = 1, class: cls = '', title }: { ad: string; olcek?: number; class?: string; title?: string }) {
  const def = ICONS[ad];
  if (!def) return null;
  const style: Record<string, string> = {
    width: `calc(var(--px) * ${def.w * olcek})`,
    height: `calc(var(--px) * ${def.h * olcek})`,
    backgroundImage: `url(${iconUrl(ad)})`,
    backgroundSize: `${def.frames * 100}% 100%`,
  };
  if (def.frames > 1) {
    style.animationDuration = `${def.period ?? 0.6}s`;
    style.animationTimingFunction = `steps(${def.frames}, jump-none)`;
  }
  return <i class={`ikon ${def.frames > 1 ? 'ikon-anim' : ''} ${cls}`} style={style} title={title} aria-hidden="true" />;
}

/** Icon from a Phaser texture key (other features' art), falling back to a HUD icon. */
export function TexIkon({ tex, yedek, max = 16 }: { tex?: string; yedek: string; max?: number }) {
  const ph = phaserIcon(tex);
  if (!ph) return <Ikon ad={yedek} />;
  const k = Math.max(1, Math.floor(max / Math.max(ph.w, ph.h)));
  const scale = Math.max(ph.w, ph.h) > max ? max / Math.max(ph.w, ph.h) : k;
  return (
    <i
      class="ikon"
      style={{
        width: `calc(var(--px) * ${Math.round(ph.w * scale)})`,
        height: `calc(var(--px) * ${Math.round(ph.h * scale)})`,
        backgroundImage: `url(${ph.url})`,
        backgroundSize: '100% 100%',
      }}
    />
  );
}

// ───────────────────────────── Button ─────────────────────────────

export interface BtnProps {
  onClick?: () => void;
  disabled?: boolean;
  aktif?: boolean;
  tur?: 'lapis' | 'kagit' | 'altin' | 'kirmizi' | 'gece';
  class?: string;
  children?: ComponentChildren;
  ipucu?: ComponentChildren;
  sesi?: UiSound;
  style?: JSX.CSSProperties;
}

/** Bevelled pixel button that never takes keyboard focus (Space stays "pause"). */
export function Btn({ onClick, disabled, aktif, tur = 'lapis', class: cls = '', children, ipucu, sesi = 'tik', style }: BtnProps) {
  const b = (
    <button
      type="button"
      tabIndex={-1}
      class={`btn btn-${tur} ${aktif ? 'aktif' : ''} ${disabled ? 'kapali' : ''} ${cls}`}
      style={style}
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.stopPropagation();
        if (disabled) {
          ses('hata');
          return;
        }
        ses(sesi);
        onClick?.();
      }}
    >
      {children}
    </button>
  );
  return ipucu ? <Ipucu icerik={ipucu}>{b}</Ipucu> : b;
}

// ───────────────────────────── Tooltip ─────────────────────────────

interface TipState {
  content: ComponentChildren;
  rect: DOMRect;
  id: number;
}
let tip: TipState | null = null;
let tipSeq = 0;
const tipListeners = new Set<() => void>();
function setTip(t: TipState | null) {
  tip = t;
  for (const fn of tipListeners) fn();
}

/** Wrap an element; hovering shows `icerik` in the shared tooltip layer. */
export function Ipucu({ icerik, children, class: cls = '' }: { icerik: ComponentChildren; children: ComponentChildren; class?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const myId = useRef(0);
  // keep content fresh while hovered (values tick)
  useEffect(() => {
    if (tip && tip.id === myId.current && ref.current) setTip({ ...tip, content: icerik });
  });
  useEffect(
    () => () => {
      if (tip && tip.id === myId.current) setTip(null);
    },
    [],
  );
  return (
    <span
      ref={ref}
      class={`ipucu-sarici ${cls}`}
      onMouseEnter={() => {
        if (!ref.current) return;
        myId.current = ++tipSeq;
        setTip({ content: icerik, rect: ref.current.getBoundingClientRect(), id: myId.current });
      }}
      onMouseLeave={() => {
        if (tip && tip.id === myId.current) setTip(null);
      }}
    >
      {children}
    </span>
  );
}

export function IpucuKatmani() {
  const [, force] = useReducer((x: number) => x + 1, 0);
  const el = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const fn = () => force(0);
    tipListeners.add(fn);
    return () => tipListeners.delete(fn);
  }, []);
  useLayoutEffect(() => {
    if (!tip || !el.current) {
      if (pos) setPos(null);
      return;
    }
    const r = tip.rect;
    const w = el.current.offsetWidth;
    const h = el.current.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let x = r.left + r.width / 2 - w / 2;
    let y = r.bottom + 8;
    if (y + h > vh - 4) y = r.top - h - 8;
    x = Math.max(4, Math.min(vw - w - 4, x));
    y = Math.max(4, y);
    if (!pos || Math.abs(pos.x - x) > 0.5 || Math.abs(pos.y - y) > 0.5) setPos({ x: Math.round(x), y: Math.round(y) });
  });
  if (!tip) return null;
  return (
    <div ref={el} class={`ipucu-kutu panel-kagit ${pos ? 'gorunur' : ''}`} style={{ left: `${pos?.x ?? -9999}px`, top: `${pos?.y ?? -9999}px` }}>
      {tip.content}
    </div>
  );
}

// ───────────────────────────── Gauge bar ─────────────────────────────

export function Cubuk({ deger, tur = 'altin', class: cls = '', isaret }: { deger: number; tur?: string; class?: string; isaret?: number }) {
  const v = Math.max(0, Math.min(1, Number.isFinite(deger) ? deger : 0));
  return (
    <span class={`cubuk cubuk-${tur} ${cls}`}>
      <span class="cubuk-dolu" style={{ width: `${v * 100}%` }} />
      {isaret != null && <span class="cubuk-isaret" style={{ left: `${Math.max(0, Math.min(1, isaret)) * 100}%` }} />}
    </span>
  );
}

// ───────────────────────────── Ticking number ─────────────────────────────


/** Static compact amount with the unit suffix split out. */
export function Miktar({ n, fmt }: { n: number; fmt: (n: number) => string }) {
  const [a, b] = splitSuffix(fmt(n));
  return (
    <span class="num">
      {a}
      {b && <span class="sayi-ek">{b}</span>}
    </span>
  );
}

interface Floater {
  id: number;
  text: string;
  up: boolean;
}
let floaterSeq = 0;

/**
 * A number that rolls toward its target (counter tick) and spawns a floating
 * "+N"/"−N" when it jumps by more than `esik` (relative or absolute).
 */
export function Sayi({ deger, fmt, esik = 0.03, minEsik = 1, ucan = true, class: cls = '' }: { deger: number; fmt: (n: number) => string; esik?: number; minEsik?: number; ucan?: boolean; class?: string }) {
  const shown = useRef(deger);
  const base = useRef({ v: deger, t: performance.now() });
  const span = useRef<HTMLSpanElement>(null);
  const suf = useRef<HTMLSpanElement>(null);
  const paint = (v: number) => {
    const [a, b] = splitSuffix(fmt(v));
    if (span.current) span.current.textContent = a;
    if (suf.current) suf.current.textContent = b;
  };
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const raf = useRef(0);
  const [pulse, setPulse] = useState<'' | 'artti' | 'azaldi'>('');

  useEffect(() => {
    const now = performance.now();
    const b = base.current;
    const diff = deger - b.v;
    const thr = Math.max(minEsik, Math.abs(b.v) * esik);
    if (Number.isFinite(diff) && Math.abs(diff) >= thr) {
      if (ucan) {
        const f: Floater = { id: ++floaterSeq, text: (diff > 0 ? '+' : '−') + fmt(Math.abs(diff)), up: diff > 0 };
        setFloaters((fs) => [...fs.slice(-2), f]);
        setTimeout(() => setFloaters((fs) => fs.filter((x) => x.id !== f.id)), 1400);
      }
      setPulse(diff > 0 ? 'artti' : 'azaldi');
      setTimeout(() => setPulse(''), 500);
      base.current = { v: deger, t: now };
    } else if (now - b.t > 2500 || !Number.isFinite(diff)) {
      base.current = { v: deger, t: now };
    }
    if (!Number.isFinite(deger)) {
      shown.current = deger;
      paint(deger);
      return;
    }
    cancelAnimationFrame(raf.current);
    let last = performance.now();
    const step = () => {
      const t = performance.now();
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      shown.current = approach(Number.isFinite(shown.current) ? shown.current : deger, deger, dt);
      paint(shown.current);
      if (shown.current !== deger) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [deger]);

  return (
    <span class={`sayi ${pulse} ${cls}`}>
      <span ref={span}>{splitSuffix(fmt(shown.current))[0]}</span>
      <span ref={suf} class="sayi-ek">
        {splitSuffix(fmt(shown.current))[1]}
      </span>
      {floaters.map((f) => (
        <span key={f.id} class={`ucan-sayi ${f.up ? 'yukari' : 'asagi'}`}>
          {splitSuffix(f.text)[0]}
          <span class="sayi-ek">{splitSuffix(f.text)[1]}</span>
        </span>
      ))}
    </span>
  );
}

// ───────────────────────────── Error guard ─────────────────────────────

/** Catches render errors of a HUD part (other features may be half-written) and hides only that part. */
export class Koruma extends Component<{ ad: string; children?: ComponentChildren }, { hata: boolean }> {
  state = { hata: false };
  private static warned = new Set<string>();
  private retry = 0;
  componentDidCatch(err: unknown) {
    if (!Koruma.warned.has(this.props.ad)) {
      Koruma.warned.add(this.props.ad);
      console.error(`[hud] ${this.props.ad} çizilemedi`, err);
    }
    this.setState({ hata: true });
    // try again a little later (data may have filled in)
    clearTimeout(this.retry);
    this.retry = window.setTimeout(() => this.setState({ hata: false }), 3000);
  }
  componentWillUnmount() {
    clearTimeout(this.retry);
  }
  render() {
    return this.state.hata ? null : this.props.children;
  }
}

// ───────────────────────────── Panel helpers ─────────────────────────────

/** Small heading with gold rule ornaments on both sides. */
export function Baslik({ children, class: cls = '' }: { children: ComponentChildren; class?: string }) {
  return (
    <div class={`baslik ${cls}`}>
      <span class="baslik-cizgi" />
      <span class="baslik-yazi">{children}</span>
      <span class="baslik-cizgi" />
    </div>
  );
}

/** Tezhip corner ornaments for large panels. */
export function Koseler() {
  return (
    <>
      <i class="kose kose-sol-ust" />
      <i class="kose kose-sag-ust" />
      <i class="kose kose-sol-alt" />
      <i class="kose kose-sag-alt" />
    </>
  );
}

export function KapatBtn({ onClick }: { onClick: () => void }) {
  return (
    <Btn tur="kirmizi" class="kapat-btn" sesi="kapat" onClick={onClick}>
      <Ikon ad="red" />
    </Btn>
  );
}
