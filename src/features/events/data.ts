import type { EventDef } from '../../core/defs';
import { HAZIRLIK_EVENTS } from './events-hazirlik';
import { KUSATMA_EVENTS } from './events-kusatma';
import { YAN_EVENTS } from './events-yan';
import type { EventDefX } from './types';

/**
 * ALL event definitions: design events H1–H10, K1–K19 (some codes have several
 * moments, e.g. H3 start/finish, K19 sub-moments) plus minor flavour events (Y…)
 * and the Divan crisis (D…). Ordered by historical date for timelines.
 */
const sortKey = (e: EventDefX): number => e.historicalDay ?? e.earliestDay ?? Number.MAX_SAFE_INTEGER;

export const EVENTS_X: EventDefX[] = [...HAZIRLIK_EVENTS, ...KUSATMA_EVENTS, ...YAN_EVENTS].sort((a, b) => sortKey(a) - sortKey(b));

export const EVENTS: EventDef[] = EVENTS_X;

export const EVENT_BY_ID: Record<string, EventDef> = Object.fromEntries(EVENTS_X.map((e) => [e.id, e]));

export const EVENT_X_BY_ID: Record<string, EventDefX> = Object.fromEntries(EVENTS_X.map((e) => [e.id, e]));
