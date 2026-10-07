/**
 * QA URL params for screenshots of the screens (never used in normal play):
 *   ?ekranpanel=ansiklopedi|ayarlar|menu   open a modal once the game is ready
 *   ?ansmadde=<encyclopedia id>            open an encyclopedia entry
 *   ?baslikgorunum=zorluk|sahneler|kaynaklar   title sub-page
 *   ?olaykart=<eventId>                    preview an event card (read-only view)
 *   ?ekranhizli=1                          skip cinematic delays (end screen)
 *   ?ekran=yukleniyor                      loading screen with simulated progress
 */
import { store } from '../../core/store';

function param(k: string): string | null {
  try {
    return new URLSearchParams(location.search).get(k);
  } catch {
    return null;
  }
}

export const QA = {
  panel: param('ekranpanel'),
  entry: param('ansmadde'),
  titleView: param('baslikgorunum') as 'zorluk' | 'sahneler' | 'kaynaklar' | null,
  eventId: param('olaykart'),
};

let applied = false;
/** Apply panel/entry params once the first real screen is up. */
export function applyQaOnce(): void {
  if (applied || store.ui.screen === 'yukleniyor' || !store.state) return;
  applied = true;
  if (!QA.panel && !QA.entry) return;
  setTimeout(() => store.setUi({ panel: QA.panel ?? store.ui.panel, encyclopediaEntry: QA.entry ?? null }), 300);
}
