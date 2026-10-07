import type { Command } from '../../core/commands';
import type { SimContext } from '../../core/feature';
import { addLog, type GameState, type PendingCard } from '../../core/state';
import { dawnTick } from './dawn';
import { EVENT_X_BY_ID, EVENTS_X } from './data';
import { affordable, priv, siegeDay } from './effects';
import { eclipseAt, weatherAt } from './sky';
import { FEATURE_ID, type EventDefX, type EventsPriv } from './types';

/** Non-pausing informational cards close themselves after this many sim seconds. */
export const AUTO_CLOSE_SEC = 40;

/** Does this card pause the game while open? */
export function cardPauses(def: EventDefX | undefined, s: GameState): boolean {
  if (!def) return false;
  const v = safeVariant(def, s);
  if (v?.pause != null) return v.pause;
  return def.pause ?? def.kind === 'karar';
}

export function safeVariant(def: EventDefX, s: GameState) {
  try {
    return def.variant?.(s) ?? null;
  } catch (err) {
    console.error(`[events] variant ${def.id} failed`, err);
    return null;
  }
}

/** Is the event eligible to fire now (ignoring whether it already fired)? */
export function eligible(def: EventDefX, s: GameState): boolean {
  const day = s.time.day;
  if (def.earliestDay != null && day < def.earliestDay) return false;
  if (def.latestDay != null && day > def.latestDay) return false;
  if (def.phases && !def.phases.includes(s.time.phase)) return false;
  if (def.minSiegeDay != null && siegeDay(s) < def.minSiegeDay) return false;
  if (def.condition) {
    try {
      return !!def.condition(s);
    } catch (err) {
      console.error(`[events] condition ${def.id} failed`, err);
      return false;
    }
  }
  return true;
}

/** Fire an event: onFire, record, enqueue card, notify. */
export function fireEvent(s: GameState, ctx: SimContext, def: EventDefX): void {
  s.events.fired[def.id] = s.time.day;
  try {
    def.onFire?.(s, ctx);
  } catch (err) {
    console.error(`[events] onFire ${def.id} failed`, err);
  }
  s.events.queue.push({ eventId: def.id, firedDay: s.time.day });
  const title = safeVariant(def, s)?.title ?? def.title;
  addLog(s, 'olay', `${title} (${def.dateLabel})`);
  ctx.bus.emit('event:fired', { eventId: def.id });
  ctx.bus.emit('log', s.log[s.log.length - 1]);
}

/** Pop the next queued card into `active`, pausing if needed. */
export function popCard(s: GameState): PendingCard | null {
  const p = priv(s);
  // decisions and other pausing cards go before informational ones
  let idx = s.events.queue.findIndex((c) => cardPauses(EVENT_X_BY_ID[c.eventId], s));
  if (idx < 0) idx = 0;
  const next = s.events.queue.splice(idx, 1)[0] ?? null;
  s.events.active = next;
  p.activeAge = 0;
  if (next && cardPauses(EVENT_X_BY_ID[next.eventId], s)) {
    if (s.time.speed > 0) p.savedSpeed = s.time.speed;
    s.time.speed = 0;
  }
  return next;
}

function restoreSpeed(s: GameState, p: EventsPriv): void {
  if (p.savedSpeed > 0 && s.time.speed === 0 && !s.outcome) s.time.speed = p.savedSpeed;
  p.savedSpeed = 0;
}

/** Close the active card, show the next one (if any) and restore speed when nothing pauses. */
export function closeCard(s: GameState): void {
  const p = priv(s);
  s.events.active = null;
  p.activeAge = 0;
  if (s.events.queue.length) popCard(s);
  const a = s.events.active as PendingCard | null;
  if (!a || !cardPauses(EVENT_X_BY_ID[a.eventId], s)) restoreSpeed(s, p);
}

/** Why a choice can't be picked right now (Turkish), or null. */
export function choiceBlocked(s: GameState, def: EventDefX, choiceId: string): string | null {
  const c = def.choices?.find((x) => x.id === choiceId);
  if (!c) return 'Geçersiz seçim.';
  if (c.requires && !affordable(s, c.requires)) return 'Kaynak yetersiz.';
  try {
    return c.unavailable?.(s) ?? null;
  } catch {
    return null;
  }
}

/** Apply a choice on the active card. Returns true if applied. */
export function chooseOption(s: GameState, ctx: SimContext, eventId: string, choiceId: string): boolean {
  const a = s.events.active;
  if (!a || a.eventId !== eventId) return false;
  const def = EVENT_X_BY_ID[eventId];
  if (!def || !def.choices?.length) return false;
  if (choiceBlocked(s, def, choiceId)) return false;
  s.events.choices[eventId] = choiceId;
  try {
    def.onChoice?.(s, choiceId, ctx);
  } catch (err) {
    console.error(`[events] onChoice ${eventId} failed`, err);
  }
  const c = def.choices.find((x) => x.id === choiceId);
  addLog(s, 'olay', `${def.title}: ${c?.label ?? choiceId}`);
  ctx.bus.emit('event:resolved', { eventId, choiceId });
  closeCard(s);
  return true;
}

export function eventsTick(s: GameState, ctx: SimContext): void {
  const p = priv(s);

  // ── Sky & weather (historical)
  const ecl = eclipseAt(s.time.day);
  if (ecl !== p.eclipse) {
    p.eclipse = ecl;
    ctx.bus.emit('eclipse', { active: ecl });
  }
  const w = weatherAt(s.time.day);
  if (w.kind !== p.weather.kind || Math.abs(w.intensity - p.weather.intensity) > 0.04) {
    p.weather = { kind: w.kind, intensity: w.intensity };
    ctx.bus.emit('weather', w);
  }

  // ── Dawn report
  if (s.time.phase === 'kusatma') dawnTick(s, ctx, p);

  // ── Fire due events
  const fired = s.events.fired;
  for (const def of EVENTS_X) {
    if (fired[def.id] != null) continue;
    if (eligible(def, s)) fireEvent(s, ctx, def);
  }

  // ── Card flow
  if (!s.events.active) {
    if (s.events.queue.length) popCard(s);
  } else {
    const def = EVENT_X_BY_ID[s.events.active.eventId];
    if (!def) {
      closeCard(s);
    } else if (!cardPauses(def, s) && !def.choices?.length) {
      p.activeAge += ctx.dtSec;
      if (p.activeAge >= AUTO_CLOSE_SEC) {
        ctx.bus.emit('event:resolved', { eventId: def.id, choiceId: null });
        closeCard(s);
      }
    }
  }
}

export function eventsCommand(s: GameState, cmd: Command, ctx: SimContext): boolean {
  if (cmd.t === 'olay-secim') {
    chooseOption(s, ctx, cmd.eventId, cmd.choiceId);
    return true;
  }
  if (cmd.t === 'olay-kapat') {
    const a = s.events.active;
    if (a && a.eventId === cmd.eventId) {
      const def = EVENT_X_BY_ID[a.eventId];
      // decision cards can only be closed by choosing
      if (!def?.choices?.length) {
        ctx.bus.emit('event:resolved', { eventId: a.eventId, choiceId: null });
        closeCard(s);
      }
    }
    return true;
  }
  if (cmd.t === 'ozel' && cmd.feature === FEATURE_ID) {
    const p = priv(s);
    const payload = (cmd.payload ?? {}) as { id?: string };
    if (cmd.action === 'ipucu-kapat' && payload.id) {
      if (!p.dismissedTips.includes(payload.id)) p.dismissedTips.push(payload.id);
    } else if (cmd.action === 'ipuclari-kapat') {
      p.dismissedTips.push('*');
    } else if (cmd.action === 'ipuclari-sifirla') {
      p.dismissedTips = [];
    }
    return true;
  }
  return false;
}
