import type { Cost } from '../../core/defs';
import type { SimContext } from '../../core/feature';
import { siegeDayNumber } from '../../core/calendar';
import { addLog, featureState, RESOURCE_ADI, RESOURCE_IDS, type GameState, type ResourceId, type SectionId } from '../../core/state';
import { damageGroup } from '../army/api';
import { applyDefenderLosses } from '../byzantium/api';
import { FEATURE_ID, type Effects, type EventsPriv } from './types';

/** Feature-private state accessor. */
export function priv(s: GameState): EventsPriv {
  const p = featureState<EventsPriv>(s, FEATURE_ID, () => ({
    savedSpeed: 0,
    activeAge: 0,
    weather: { kind: 'acik', intensity: 0 },
    eclipse: false,
    vars: {},
    dawn: { lastDay: -1, dawnSnap: null, duskSnap: null, report: null },
    dismissedTips: [],
  }));
  // tolerate older saves
  p.vars ??= {};
  p.dismissedTips ??= [];
  p.dawn ??= { lastDay: -1, dawnSnap: null, duskSnap: null, report: null };
  return p;
}

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

export function flag(s: GameState, key: string): boolean {
  return !!s.flags[key];
}

export function siegeDay(s: GameState): number {
  return siegeDayNumber(s.time.day, s.time.siegeStartDay) ?? 0;
}

/** Ottoman men present (not away). */
export function totalMen(s: GameState): number {
  let n = 0;
  for (const g of s.groups) if (g.status !== 'uzakta' && g.status !== 'dagildi') n += g.men;
  return n;
}

/** Apply a declarative effect bundle. */
export function applyEffects(s: GameState, fx: Effects | undefined): void {
  if (!fx) return;
  if (fx.morale) s.morale = clamp(s.morale + fx.morale, 0, 100);
  if (fx.divan) s.divan = clamp(s.divan + fx.divan, -100, 100);
  if (fx.galata) s.galata = clamp(s.galata + fx.galata, -100, 100);
  if (fx.byzMorale) s.byz.morale = clamp(s.byz.morale + fx.byzMorale, 0, 100);
  if (fx.byzFood) s.byz.food = Math.max(0, s.byz.food + fx.byzFood);
  if (fx.intel) s.byz.intel = clamp(s.byz.intel + fx.intel, 0, 100);
  if (fx.res) {
    for (const r of RESOURCE_IDS) {
      const v = fx.res[r];
      if (v) s.resources[r] = Math.max(0, s.resources[r] + v);
    }
  }
  if (fx.flags) Object.assign(s.flags, fx.flags);
  if (fx.relief) {
    s.relief.arrival += fx.relief;
    s.relief.notes.push(fx.relief > 0 ? `Divan diplomasisi yardımı geciktirdi (+${fx.relief} gün)` : `Yardım hızlandı (${fx.relief} gün)`);
  }
}

/** Resources needed for a choice → can we pay? */
export function affordable(s: GameState, cost: Cost | undefined): boolean {
  if (!cost) return true;
  return RESOURCE_IDS.every((r) => (cost[r] ?? 0) <= s.resources[r]);
}

export interface EffectChip {
  label: string;
  value: string;
  /** Good for the player (Ottoman side)? null = neutral. */
  good: boolean | null;
}

const sign = (n: number): string => (n > 0 ? `+${n}` : `−${Math.abs(n)}`);
const fmt = (n: number): string => {
  const a = Math.abs(Math.round(n));
  const t = a >= 1000 ? a.toLocaleString('tr-TR') : String(a);
  return (n > 0 ? '+' : '−') + t;
};

/** Structured summary of effects for the UI (chips). */
export function describeEffects(fx: Effects | undefined, requires?: Cost): EffectChip[] {
  const out: EffectChip[] = [];
  if (!fx && !requires) return out;
  if (requires) {
    for (const r of RESOURCE_IDS) {
      const v = requires[r];
      if (v) out.push({ label: RESOURCE_ADI[r], value: fmt(-v), good: false });
    }
  }
  if (!fx) return out;
  if (fx.morale) out.push({ label: 'Moral', value: sign(fx.morale), good: fx.morale > 0 });
  if (fx.divan)
    out.push({ label: fx.divan > 0 ? 'Divan → savaş' : 'Divan → barış', value: sign(fx.divan), good: fx.divan > 0 });
  if (fx.galata) out.push({ label: 'Galata', value: sign(fx.galata), good: fx.galata > 0 });
  if (fx.byzMorale) out.push({ label: 'Bizans morali', value: sign(fx.byzMorale), good: fx.byzMorale < 0 });
  if (fx.byzFood) out.push({ label: 'Şehrin erzakı', value: sign(fx.byzFood) + ' gün', good: fx.byzFood < 0 });
  if (fx.intel) out.push({ label: 'İstihbarat', value: sign(fx.intel), good: fx.intel > 0 });
  if (fx.res) {
    for (const r of RESOURCE_IDS) {
      const v = fx.res[r as ResourceId];
      if (v) out.push({ label: RESOURCE_ADI[r], value: fmt(v), good: v > 0 });
    }
  }
  if (fx.relief) out.push({ label: 'Haçlı yardımı', value: fx.relief > 0 ? `${fx.relief} gün gecikir` : `${-fx.relief} gün erken`, good: fx.relief > 0 });
  return out;
}

export interface SkirmishResult {
  ottomanLost: number;
  byzLost: number;
  success: boolean;
}

/**
 * Abstract resolution of a scripted probing assault (K4/K10 cards). Uses ctx.rng only.
 * Losses are taken from the irregular groups (başıbozuk/azap) first.
 */
export function resolveProbe(s: GameState, ctx: SimContext, sectionId: SectionId, scale = 1): SkirmishResult {
  const sec = s.sections[sectionId];
  const breach = sec ? sec.breach : 0;
  const moat = sec ? sec.moatFill : 0;
  const defMul = sec ? Math.max(0.3, sec.defenders / 600) : 1;
  const chance = clamp(0.08 + breach * 0.6 + moat * 0.15 - (s.byz.morale - 50) / 250 - defMul * 0.08, 0.03, 0.75);
  const success = ctx.rng.chance(chance);
  const base = (success ? 140 : 220) * scale * (1 - breach * 0.35);
  const ottomanLost = Math.round(base * ctx.rng.range(0.75, 1.3));
  const byzLost = Math.round((success ? 90 : 35) * scale * ctx.rng.range(0.7, 1.3));
  // pick irregulars first
  const pool = s.groups
    .filter((g) => g.status !== 'uzakta' && g.status !== 'dagildi' && g.men > 0)
    .sort((a, b) => rank(a.type) - rank(b.type) || b.men - a.men);
  let left = ottomanLost;
  for (const g of pool) {
    if (left <= 0) break;
    const take = Math.min(left, Math.floor(g.men * 0.4));
    if (take <= 0) continue;
    damageGroup(s, ctx.bus, g.id, take);
    left -= take;
  }
  if (left > 0) s.stats.ottomanLosses += left; // abstract levies not on the map
  if (sec) applyDefenderLosses(s, ctx.bus, sectionId, byzLost);
  s.stats.assaults++;
  addLog(
    s,
    success ? 'basari' : 'kayip',
    success
      ? `${sec?.name ?? 'Sur'} önünde yoklama hücumu savunmayı sarstı: ~${ottomanLost} kayıp, Bizans ~${byzLost}.`
      : `${sec?.name ?? 'Sur'} önünde hücum püskürtüldü: ~${ottomanLost} kayıp.`,
  );
  return { ottomanLost, byzLost, success };
}

function rank(t: string): number {
  return t === 'basibozuk' ? 0 : t === 'azap' ? 1 : t === 'sipahi' ? 2 : t === 'yeniceri' ? 5 : 3;
}
