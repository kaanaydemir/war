import type { Feature, RenderContext } from '../../core/feature';
import { store } from '../../core/store';
import type { GameState } from '../../core/state';
import { generateIllustrations, generateMarkers } from './art';
import { compileDawnReport, snapshot } from './dawn';
import { EVENT_X_BY_ID, EVENTS_X } from './data';
import { priv } from './effects';
import { EventsRender } from './render';
import { eventsCommand, eventsTick, popCard } from './sim';
import { eclipseAt, weatherAt } from './sky';
import type { Command } from '../../core/commands';

/**
 * EVENTS feature: the historical event engine (H1–H10, K1–K19, minor events),
 * decision cards with pause/resume, dawn reports, objectives and tips, the
 * historical sky (eclipse, hail, fog) and the encyclopedia data.
 */
/** Render instances per scene RenderContext (rebuilt on every scene restart). */
const renders = new WeakMap<RenderContext, EventsRender>();

export const eventsFeature: Feature = {
  id: 'events',

  generateTextures(gen) {
    generateIllustrations(gen);
    generateMarkers(gen);
  },

  initState(state) {
    priv(state);
  },

  simTick(state, ctx) {
    // Title-screen attract mode: let the sky run, but never pop cards behind the menu.
    if (store.ui.screen === 'baslik') return;
    eventsTick(state, ctx);
  },

  handleCommand(state, cmd, ctx) {
    if (cmd.t === 'ozel' && cmd.feature === 'events' && cmd.action === 'olay-goster') {
      // QA: show a card without firing it (screenshots of the card UI)
      const id = (cmd.payload as { id?: string } | undefined)?.id;
      if (id && EVENT_X_BY_ID[id]) {
        state.events.queue.unshift({ eventId: id, firedDay: state.time.day });
        if (!state.events.active) popCard(state);
      }
      return true;
    }
    return eventsCommand(state, cmd as Command, ctx);
  },

  createRender(rc: RenderContext) {
    renders.set(rc, new EventsRender(rc));
  },

  updateRender(rc, state, dt) {
    renders.get(rc)?.update(state, dt);
  },

  applyScenario(_name, state) {
    applyHistoryUntil(state, state.time.day);
  },
};

/**
 * Fast-forward the event history to `day`: every event historically on or
 * before that day is marked fired (without re-applying onFire), decisions get
 * the historical choice and the persistent flags of that choice. The card
 * queue stays empty so scenario screenshots are clean.
 */
export function applyHistoryUntil(state: GameState, day: number): void {
  const cutoff = Math.floor(day) + 1;
  for (const def of EVENTS_X) {
    const key = def.historicalDay ?? def.earliestDay;
    if (key == null || key >= cutoff) continue;
    state.events.fired[def.id] ??= key;
    if (def.choices?.length && !state.events.choices[def.id]) {
      const h = def.choices.find((c) => c.tarihi) ?? def.choices[0];
      state.events.choices[def.id] = h.id;
    }
    try {
      def.historical?.(state);
    } catch (err) {
      console.error(`[events] historical ${def.id} failed`, err);
    }
  }
  state.events.queue = [];
  state.events.active = null;
  const p = priv(state);
  p.savedSpeed = 0;
  p.eclipse = eclipseAt(state.time.day);
  p.weather = weatherAt(state.time.day);
  if (state.time.phase === 'kusatma') {
    p.dawn.lastDay = Math.floor(day);
    p.dawn.dawnSnap = null;
    compileDawnReport(state, null, p.dawn);
    p.dawn.dawnSnap = snapshot(state);
  }
}
