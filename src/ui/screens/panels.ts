/**
 * Modal panel routing on top of `store.ui.panel`, with a one-level "return
 * to" so e.g. Settings opened from the pause menu goes back to the menu.
 */
import { store } from '../../core/store';

let returnTo: string | null = null;

/** Open a modal panel; `from` is restored when it closes. */
export function openPanel(id: string, from: string | null = null): void {
  returnTo = from;
  store.setUi({ panel: id });
}

/** Close the panel if it is one of `ids` (restoring the opener, if any). */
export function closePanel(ids: string[]): void {
  if (store.ui.panel && !ids.includes(store.ui.panel)) return;
  const back = returnTo;
  returnTo = null;
  store.setUi({ panel: back });
}
