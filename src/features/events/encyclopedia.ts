import type { EncyclopediaEntry } from '../../core/defs';
import { ENC_KAVRAMLAR, ENC_KAYNAKLAR, ENC_OLAYLAR, ENC_SILAHLAR, ENC_YERLER } from './enc-diger';
import { ENC_KISILER } from './enc-kisiler';

/**
 * Ansiklopedi: people, places, events, weapons, concepts and every source of
 * data/sources.ts. Claims that still need checking carry `dogrulanacak: true`
 * and an inline "(doğrulanacak)" mark.
 */
export const ENCYCLOPEDIA: EncyclopediaEntry[] = [...ENC_KISILER, ...ENC_YERLER, ...ENC_OLAYLAR, ...ENC_SILAHLAR, ...ENC_KAVRAMLAR, ...ENC_KAYNAKLAR].map(
  (e) => (e.dogrulanacak || !e.body.some((p) => p.includes('doğrulanacak')) ? e : { ...e, dogrulanacak: true }),
);
