/** PUBLIC API of audio (owner: audio agent). UI sound hooks. */
import { engine } from './engine';
import { Throttle } from './mix';
import { ui } from './sfx';

export type UiSound = 'tik' | 'ac' | 'kapat' | 'hata' | 'onay' | 'sayfa';

const UI_LEN: Record<UiSound, number> = { tik: 0.1, ac: 1.2, kapat: 1.2, hata: 0.4, onay: 1.4, sayfa: 0.4 };
const uiThrottle = new Throttle();

/**
 * Play a short interface sound (safe anywhere, any time; silent until audio is
 * unlocked by a user gesture — calling it from a click handler unlocks it).
 *   tik: hover/click · ac: panel open · kapat: panel close · hata: invalid action
 *   onay: confirm / success · sayfa: page turn (encyclopedia, event cards)
 */
export function playUi(kind: UiSound): void {
  try {
    engine.installGesture();
    if (!engine.ready) engine.unlock();
    if (!engine.ready) return;
    const now = engine.now();
    if (!uiThrottle.allow(kind, now, kind === 'tik' ? 0.04 : 0.08)) return;
    const v = engine.voice({ bus: 'ui', pri: 9, dur: UI_LEN[kind] });
    if (v) ui(v, kind);
  } catch (err) {
    console.warn('[audio] playUi failed', err);
  }
}

/** True once WebAudio is running (e.g. to show a "sesi aç" hint otherwise). */
export function audioReady(): boolean {
  return engine.ready && engine.ctx?.state === 'running';
}
