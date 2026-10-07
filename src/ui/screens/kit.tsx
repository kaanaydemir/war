/**
 * Shared screen components & hooks: UI pixel scale, pixel images, buttons,
 * modal shell with open/close animation, keyboard layers, particle canvas,
 * screen-transition curtain and toasts.
 */
import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'preact/hooks';
import { P } from '../../art/palette';
import { playUi, type UiSound } from '../../features/audio/api';
import { uiPx } from './logic';
import { getExtra, onExtraChange } from './settings';

// ───────────────────────────── sound ─────────────────────────────

/** UI sound (never throws; silent until audio is unlocked by a gesture). */
export function sfx(kind: UiSound): void {
  try {
    playUi(kind);
  } catch {
    /* audio feature not ready */
  }
}

// ───────────────────────────── scale ─────────────────────────────

/** Current UI pixel size (2/3 by viewport, or the player's choice). */
export function usePx(): number {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const fn = () => force(0);
    window.addEventListener('resize', fn);
    const off = onExtraChange(fn);
    return () => {
      window.removeEventListener('resize', fn);
      off();
    };
  }, []);
  return uiPx(window.innerWidth, window.innerHeight, getExtra().uiOlcek);
}

export function useViewport(): { w: number; h: number } {
  const [v, setV] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const fn = () => setV({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return v;
}

/** Style object setting --px for a subtree. */
export function pxVars(px: number): JSX.CSSProperties {
  return { '--px': `${px}px` } as JSX.CSSProperties;
}

// ───────────────────────────── pixel image ─────────────────────────────

export function PxImg(props: { src: string; w: number; h: number; k: number; class?: string; style?: JSX.CSSProperties; alt?: string }) {
  return (
    <img
      class={'px-img ' + (props.class ?? '')}
      src={props.src}
      width={props.w * props.k}
      height={props.h * props.k}
      alt={props.alt ?? ''}
      draggable={false}
      style={props.style}
    />
  );
}

/** Animated sprite strip (horizontal frames) via a stepped transform (compositor-friendly). */
export function Strip(props: { src: string; fw: number; fh: number; frames: number; fps: number; k: number; class?: string; style?: JSX.CSSProperties }) {
  const dur = props.frames / props.fps;
  return (
    <span class={'px-strip ' + (props.class ?? '')} style={{ width: props.fw * props.k, height: props.fh * props.k, ...props.style }}>
      <img
        src={props.src}
        width={props.fw * props.frames * props.k}
        height={props.fh * props.k}
        alt=""
        draggable={false}
        style={
          {
            animationDuration: `${dur}s`,
            animationTimingFunction: `steps(${props.frames})`,
            '--strip-end': `-${props.fw * props.frames * props.k}px`,
          } as JSX.CSSProperties
        }
      />
    </span>
  );
}

/** Text with digit runs set in the numeral font (Pixelify's 5 reads like an S at small sizes). */
export function Num(props: { text: string }) {
  const parts = props.text.split(/(\d[\d.,]*)/);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? (
          <span key={i} class="num">
            {p}
          </span>
        ) : (
          p
        ),
      )}
    </>
  );
}

// ───────────────────────────── buttons ─────────────────────────────

export function Btn(props: {
  onClick?: () => void;
  children: ComponentChildren;
  disabled?: boolean;
  kind?: 'normal' | 'kirmizi' | 'sade';
  class?: string;
  title?: string;
  sound?: UiSound;
  focused?: boolean;
  onHover?: () => void;
}) {
  return (
    <button
      type="button"
      class={`uk-btn ${props.kind ?? 'normal'} ${props.focused ? 'odak' : ''} ${props.class ?? ''}`}
      disabled={props.disabled}
      title={props.title}
      onMouseEnter={() => {
        if (!props.disabled) sfx('tik');
        props.onHover?.();
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (props.disabled) {
          sfx('hata');
          return;
        }
        sfx(props.sound ?? 'onay');
        props.onClick?.();
      }}
    >
      {props.children}
    </button>
  );
}

export function Divider(props: { class?: string }) {
  return (
    <div class={'uk-ayrac ' + (props.class ?? '')}>
      <span />
      <i />
      <span />
    </div>
  );
}

// ───────────────────────────── keyboard layers ─────────────────────────────

type KeyHandler = (e: KeyboardEvent) => boolean | void;
const layers: { id: number; fn: KeyHandler }[] = [];
let layerSeq = 0;
let keyInstalled = false;

function installKeys(): void {
  if (keyInstalled) return;
  keyInstalled = true;
  window.addEventListener(
    'keydown',
    (e) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA';
      if (typing && e.key !== 'Escape' && e.key !== 'Enter' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const top = layers[layers.length - 1];
      if (!top) return;
      if (top.fn(e)) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true,
  );
}

/** Register a keyboard handler; only the most recently mounted active layer receives keys. */
export function useKeyLayer(fn: KeyHandler, active = true): void {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!active) return;
    installKeys();
    const id = ++layerSeq;
    layers.push({ id, fn: (e) => ref.current(e) });
    return () => {
      const i = layers.findIndex((l) => l.id === id);
      if (i >= 0) layers.splice(i, 1);
    };
  }, [active]);
}

/** True when any key layer is active (e.g. a modal) — the pause-menu hotkey defers to it. */
export function keyLayerCount(): number {
  return layers.length;
}

// ───────────────────────────── presence (enter/exit animation) ─────────────────────────────

/** Keep a component mounted for `ms` after `open` turns false (for exit animations). */
export function usePresence(open: boolean, ms: number): { mounted: boolean; closing: boolean } {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      return;
    }
    if (!mounted) return;
    setClosing(true);
    const t = setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, ms);
    return () => clearTimeout(t);
  }, [open]);
  return { mounted, closing };
}

// ───────────────────────────── modal shell ─────────────────────────────

export function Modal(props: {
  open: boolean;
  onClose?: () => void;
  title?: ComponentChildren;
  kind?: 'kagit' | 'gece';
  class?: string;
  width?: number;
  children: ComponentChildren;
  /** Close on Esc / backdrop / X (default true). */
  closable?: boolean;
  px: number;
  onKey?: KeyHandler;
}) {
  const { mounted, closing } = usePresence(props.open, 260);
  const closable = props.closable !== false;
  useKeyLayer((e) => {
    if (props.onKey?.(e)) return true;
    if (e.key === 'Escape' && closable) {
      sfx('kapat');
      props.onClose?.();
      return true;
    }
    return false;
  }, props.open);
  useEffect(() => {
    if (props.open) sfx('ac');
  }, [props.open]);
  if (!mounted) return null;
  return (
    <div class={`uk-perde etkilesim ${closing ? 'kapaniyor' : ''}`} style={pxVars(props.px)} onClick={() => closable && props.onClose?.()}>
      <div
        class={`uk-modal uk-panel-${props.kind ?? 'kagit'} ${props.class ?? ''} ${closing ? 'kapaniyor' : ''}`}
        style={props.width ? { width: `min(${props.width * props.px}px, calc(100vw - ${8 * props.px}px))` } : undefined}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
        {props.title && (
          <header class="uk-modal-baslik">
            <h2>{props.title}</h2>
            {closable && (
              <button
                type="button"
                class="uk-kapat"
                title="Kapat (Esc)"
                onClick={() => {
                  sfx('kapat');
                  props.onClose?.();
                }}
              />
            )}
          </header>
        )}
        {props.children}
      </div>
    </div>
  );
}

// ───────────────────────────── particles ─────────────────────────────

export type FxKind = 'kor' | 'zerre' | 'kul' | 'yildiz' | 'yaprak' | 'patlama';

interface Particle {
  kind: FxKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  ph: number;
  s: number;
}

const FIRE = P.fire;
const GOLDR = P.gold;
const ASH = [P.smoke[3], P.smoke[4], P.smoke[5]];
const PETAL = [P.red[4], P.red[5], P.red[3]];

/**
 * Low-resolution particle layer drawn on the UI pixel grid (crisp, cheap):
 * kor = rising embers, zerre = drifting gold motes, kul = falling ash,
 * yildiz = twinkling stars, yaprak = drifting tulip petals.
 */
export function FxCanvas(props: {
  px: number;
  counts: Partial<Record<FxKind, number>>;
  class?: string;
  /** One-shot gold burst at (x, y) in viewport fractions, after `delay` seconds. */
  burst?: { x: number; y: number; n: number; delay: number; spread?: number };
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const counts = props.counts;
  const key = JSON.stringify(counts);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    let W = 0;
    let H = 0;
    const resize = () => {
      W = Math.ceil(window.innerWidth / props.px);
      H = Math.ceil(window.innerHeight / props.px);
      cv.width = W;
      cv.height = H;
      cv.style.width = `${W * props.px}px`;
      cv.style.height = `${H * props.px}px`;
    };
    resize();
    window.addEventListener('resize', resize);
    const ps: Particle[] = [];
    const spawn = (p: Particle, initial: boolean) => {
      const r = Math.random;
      p.ph = r() * 6.28;
      switch (p.kind) {
        case 'kor':
          p.x = r() * W;
          p.y = initial ? H * (0.3 + r() * 0.7) : H + 2;
          p.vx = (r() - 0.5) * 4;
          p.vy = -(6 + r() * 14);
          p.max = 3 + r() * 5;
          p.s = r() < 0.15 ? 2 : 1;
          break;
        case 'zerre':
          p.x = r() * W;
          p.y = r() * H;
          p.vx = (r() - 0.5) * 3;
          p.vy = -(0.5 + r() * 2);
          p.max = 4 + r() * 6;
          p.s = 1;
          break;
        case 'kul':
          p.x = r() * W;
          p.y = initial ? r() * H : -2;
          p.vx = 1 + r() * 3;
          p.vy = 3 + r() * 5;
          p.max = 8 + r() * 10;
          p.s = r() < 0.3 ? 2 : 1;
          break;
        case 'patlama':
          break;
        case 'yildiz':
          p.x = r() * W;
          p.y = r() * H * 0.6;
          p.vx = 0;
          p.vy = 0;
          p.max = 1e9;
          p.s = r() < 0.12 ? 2 : 1;
          break;
        case 'yaprak':
          p.x = r() * W;
          p.y = initial ? r() * H : -3;
          p.vx = 4 + r() * 6;
          p.vy = 5 + r() * 6;
          p.max = 10 + r() * 8;
          p.s = 2;
          break;
      }
      p.life = initial ? r() * p.max : 0;
    };
    const burst = props.burst;
    if (burst) {
      for (let i = 0; i < burst.n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 20 + Math.random() * 70;
        const sx = (Math.random() - 0.5) * (burst.spread ?? 0);
        ps.push({ kind: 'patlama', x: 0, y: 0, vx: Math.cos(a) * sp * 1.6, vy: Math.sin(a) * sp - 25, life: -burst.delay, max: 0.8 + Math.random() * 1.2, ph: sx, s: Math.random() < 0.25 ? 2 : 1 });
      }
    }
    for (const [kind, n] of Object.entries(counts) as [FxKind, number][]) {
      for (let i = 0; i < n; i++) {
        const p = { kind, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, ph: 0, s: 1 } as Particle;
        spawn(p, true);
        ps.push(p);
      }
    }
    let raf = 0;
    let last = performance.now();
    let t = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      if (document.hidden) return;
      ctx.clearRect(0, 0, W, H);
      for (const p of ps) {
        p.life += dt;
        if (p.kind === 'patlama') {
          if (p.life < 0 || p.life > p.max) continue;
          if (p.x === 0 && p.y === 0 && burst) {
            p.x = burst.x * W + p.ph;
            p.y = burst.y * H;
          }
          p.vy += 60 * dt;
          p.vx *= 1 - 1.8 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          const u = p.life / p.max;
          ctx.globalAlpha = u > 0.7 ? 0.5 : 1;
          ctx.fillStyle = u < 0.25 ? '#ffffff' : u < 0.55 ? GOLDR[6] : GOLDR[4];
          ctx.fillRect(p.x | 0, p.y | 0, p.s, p.s);
          continue;
        }
        if (p.life > p.max || p.y < -4 || p.y > H + 4 || p.x > W + 4) spawn(p, false);
        const u = p.life / p.max;
        let c: string;
        let a = 1;
        switch (p.kind) {
          case 'kor': {
            p.x += (p.vx + Math.sin(t * 2 + p.ph) * 3) * dt;
            p.y += p.vy * dt;
            c = u < 0.2 ? FIRE[6] : u < 0.45 ? FIRE[5] : u < 0.7 ? FIRE[4] : FIRE[3];
            if (Math.sin(t * 17 + p.ph) > 0.85) c = FIRE[7];
            a = u > 0.85 ? 0.5 : 1;
            break;
          }
          case 'zerre': {
            p.x += (p.vx + Math.sin(t * 0.7 + p.ph) * 2) * dt;
            p.y += p.vy * dt;
            const tw = Math.sin(t * 2.4 + p.ph * 3);
            c = tw > 0.6 ? GOLDR[6] : GOLDR[5];
            a = tw > -0.2 ? 1 : 0.5;
            if (u < 0.1 || u > 0.9) a = 0.5;
            break;
          }
          case 'kul': {
            p.x += (p.vx + Math.sin(t * 1.3 + p.ph) * 4) * dt;
            p.y += p.vy * dt;
            c = ASH[(p.ph * 10) % 3 | 0];
            a = 0.75;
            break;
          }
          case 'yildiz': {
            const tw = Math.sin(t * (1 + (p.ph % 1.5)) + p.ph * 7);
            c = tw > 0.7 ? '#ffffff' : '#8ab0e0';
            a = tw > 0.2 ? 1 : tw > -0.4 ? 0.5 : 0.25;
            break;
          }
          default: {
            p.x += (p.vx + Math.sin(t * 1.1 + p.ph) * 6) * dt;
            p.y += p.vy * dt;
            c = PETAL[(p.ph * 10) % 3 | 0];
            a = 0.9;
          }
        }
        ctx.globalAlpha = a;
        ctx.fillStyle = c;
        const flutter = p.kind === 'yaprak' && Math.sin(t * 6 + p.ph) > 0;
        ctx.fillRect(p.x | 0, p.y | 0, flutter ? 1 : p.s, p.s);
      }
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [props.px, key]);
  return <canvas ref={ref} class={'fx-tuval ' + (props.class ?? '')} />;
}

// ───────────────────────────── dithered vignette ─────────────────────────────

/**
 * Bayer-dithered vignette & gradient overlay on a coarse pixel grid (2× UI px),
 * so even the darkening reads as pixel art. `top`/`bottom` add band shading.
 */
export function DitherShade(props: { px: number; color?: [number, number, number]; strength?: number; top?: number; bottom?: number; class?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { w, h } = useViewport();
  useLayoutEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const cell = props.px * 2;
    const W = Math.ceil(w / cell);
    const H = Math.ceil(h / cell);
    cv.width = W;
    cv.height = H;
    cv.style.width = `${W * cell}px`;
    cv.style.height = `${H * cell}px`;
    const ctx = cv.getContext('2d')!;
    const img = ctx.createImageData(W, H);
    const [r, g, b] = props.color ?? [11, 15, 36];
    const st = props.strength ?? 0.85;
    const B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const nx = (x + 0.5) / W - 0.5;
        const ny = (y + 0.5) / H - 0.5;
        const d = Math.sqrt(nx * nx * 1.1 + ny * ny * 1.6);
        let v = Math.max(0, (d - 0.28) / 0.45) * st;
        if (props.top) v = Math.max(v, (1 - y / (H * props.top)) * 0.95);
        if (props.bottom) v = Math.max(v, ((y - H * (1 - props.bottom)) / (H * props.bottom)) * 0.95);
        v = Math.max(0, Math.min(1, v));
        // quantise to 3 alpha levels and dither between them
        const lv = v * 3;
        const lo = Math.floor(lv);
        const frac = lv - lo;
        const th = (B[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
        const q = (lo + (frac > th ? 1 : 0)) / 3;
        const i = (y * W + x) * 4;
        img.data[i] = r;
        img.data[i + 1] = g;
        img.data[i + 2] = b;
        img.data[i + 3] = Math.round(q * 235);
      }
    ctx.putImageData(img, 0, 0);
  }, [w, h, props.px, props.strength, props.top, props.bottom]);
  return <canvas ref={ref} class={'golge-tuval ' + (props.class ?? '')} />;
}

// ───────────────────────────── curtain (screen transitions) ─────────────────────────────

type CurtainPhase = 'yok' | 'kapaniyor' | 'kapali' | 'aciliyor';
let curtainPhase: CurtainPhase = 'yok';
const curtainListeners = new Set<() => void>();
const setCurtain = (p: CurtainPhase) => {
  curtainPhase = p;
  for (const fn of curtainListeners) fn();
};

/**
 * Fade to ink, run `action` (e.g. start a new game — the scene restarts behind
 * the curtain), then fade back in.
 */
export function transition(action: () => void, holdMs = 650): void {
  if (curtainPhase !== 'yok') return;
  setCurtain('kapaniyor');
  setTimeout(() => {
    setCurtain('kapali');
    try {
      action();
    } catch (err) {
      console.error('[screens] transition action failed', err);
    }
    setTimeout(() => {
      setCurtain('aciliyor');
      setTimeout(() => setCurtain('yok'), 700);
    }, holdMs);
  }, 380);
}

export function Curtain() {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    curtainListeners.add(force as () => void);
    return () => {
      curtainListeners.delete(force as () => void);
    };
  }, []);
  if (curtainPhase === 'yok') return null;
  return (
    <div class={`perde-gecis ${curtainPhase}`}>
      {(curtainPhase === 'kapali' || curtainPhase === 'kapaniyor') && <div class="perde-muhur" />}
    </div>
  );
}

// ───────────────────────────── toasts ─────────────────────────────

interface Toast {
  id: number;
  text: string;
  kind: 'basari' | 'bilgi' | 'uyari';
}
let toasts: Toast[] = [];
let toastSeq = 0;
const toastListeners = new Set<() => void>();

export function toast(text: string, kind: Toast['kind'] = 'basari'): void {
  const t = { id: ++toastSeq, text, kind };
  toasts = [...toasts, t].slice(-3);
  for (const fn of toastListeners) fn();
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    for (const fn of toastListeners) fn();
  }, 2600);
}

export function Toasts(props: { px: number }) {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    toastListeners.add(force as () => void);
    return () => {
      toastListeners.delete(force as () => void);
    };
  }, []);
  if (!toasts.length) return null;
  return (
    <div class="uk-tostlar" style={pxVars(props.px)}>
      {toasts.map((t) => (
        <div key={t.id} class={`uk-tost ${t.kind}`}>
          <i />
          {t.text}
        </div>
      ))}
    </div>
  );
}

// ───────────────────────────── misc hooks ─────────────────────────────

/** Milliseconds since mount, updated at `fps` (for sequenced animations). */
export function useClock(fps = 30, running = true): number {
  const [t, setT] = useState(0);
  const start = useMemo(() => performance.now(), []);
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let lastSet = 0;
    const step = (now: number) => {
      raf = requestAnimationFrame(step);
      if (now - lastSet >= 1000 / fps) {
        lastSet = now;
        setT(now - start);
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [running, fps]);
  return t;
}

/** Debug/QA: URL flag `?ekranhizli=1` skips cinematic delays (screenshots). */
export function fastMode(): boolean {
  try {
    return new URLSearchParams(location.search).get('ekranhizli') === '1';
  } catch {
    return false;
  }
}
