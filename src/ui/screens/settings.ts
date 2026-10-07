/**
 * Settings persistence. Core settings live in `store.ui.settings` (contract);
 * screen-only extras (UI scale, edge scroll, reduced motion) live here.
 * Both are saved to localStorage and restored at boot.
 */
import { store } from '../../core/store';
import { DEFAULT_EXTRA, parseSettings, type ExtraSettings } from './logic';

const KEY = 'istanbulun-fethi:ayarlar';

let extra: ExtraSettings = { ...DEFAULT_EXTRA };
const listeners = new Set<() => void>();

export function getExtra(): ExtraSettings {
  return extra;
}

export function onExtraChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ core: store.ui.settings, extra }));
  } catch {
    /* storage unavailable (private mode) — settings stay for this session */
  }
}

/** Apply settings that live outside the UI (camera edge scroll). Safe before the game exists. */
export function applyRuntime(): void {
  const cam = (window as any).__game?.scene?.camera;
  if (cam && typeof cam.edgeScroll === 'boolean') cam.edgeScroll = extra.kenarKaydirma;
  document.body.classList.toggle('az-hareket', extra.azHareket);
}

export function setExtra(patch: Partial<ExtraSettings>): void {
  extra = { ...extra, ...patch };
  persist();
  applyRuntime();
  for (const fn of listeners) fn();
  store.notify();
}

export function setCore(patch: Partial<typeof store.ui.settings>): void {
  store.setUi({ settings: { ...store.ui.settings, ...patch } });
  persist();
}

let loaded = false;
/** Restore persisted settings once (called at UI mount). */
export function loadSettings(): void {
  if (loaded) return;
  loaded = true;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    raw = null;
  }
  const s = parseSettings(raw, store.ui.settings);
  store.ui.settings = s.core;
  extra = s.extra;
  applyRuntime();
  // re-apply after every scene (re)start: the camera is recreated
  let lastBus = -1;
  store.subscribe(() => {
    if (store.busVersion !== lastBus) {
      lastBus = store.busVersion;
      applyRuntime();
    }
  });
}
