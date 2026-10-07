import type { SimContext } from '../../core/feature';
import { RESOURCE_IDS, type GameState } from '../../core/state';
import { applyEffects } from './effects';
import type { EventDefX } from './types';

/** Illustration texture keys (generated in art.ts, 160×96 miniature style). */
export const IMG = {
  divan: 'olay/divan',
  hisar: 'olay/hisar',
  rizzo: 'olay/rizzo',
  dokum: 'olay/dokum',
  top: 'olay/top',
  ordu: 'olay/ordu',
  deniz: 'olay/deniz',
  gemiler: 'olay/gemiler',
  mektup: 'olay/mektup',
  lagim: 'olay/lagim',
  kule: 'olay/kule',
  tutulma: 'olay/tutulma',
  dolu: 'olay/dolu',
  ates: 'olay/ates',
  sancak: 'olay/sancak',
  ayasofya: 'olay/ayasofya',
} as const;

export type EventInput = Omit<EventDefX, 'onFire' | 'onChoice'> & {
  /** Custom logic at fire time (runs BEFORE declarative fireFx / variant fx). */
  fire?: (s: GameState, ctx: SimContext) => void;
  /** Custom logic after the chosen option's declarative fx were applied. */
  choose?: (s: GameState, choiceId: string, ctx: SimContext) => void;
};

/**
 * Event factory: wires declarative effects into the contract hooks so that
 * `def.onFire` / `def.onChoice` are complete on their own.
 */
export function ev(input: EventInput): EventDefX {
  const { fire, choose, ...def } = input;
  const out: EventDefX = {
    ...def,
    onFire(s, ctx) {
      fire?.(s, ctx);
      applyEffects(s, def.fireFx);
      applyEffects(s, def.variant?.(s)?.fx);
    },
    onChoice(s, choiceId, ctx) {
      const c = def.choices?.find((x) => x.id === choiceId);
      if (!c) return;
      if (c.requires) for (const r of RESOURCE_IDS) s.resources[r] = Math.max(0, s.resources[r] - (c.requires[r] ?? 0));
      applyEffects(s, c.fx);
      choose?.(s, choiceId, ctx);
    },
  };
  return out;
}
