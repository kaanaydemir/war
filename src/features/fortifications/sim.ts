import type { ScenarioName, SimContext } from '../../core/feature';
import { FLAG } from '../../core/flags';
import type { GameState, SectionId, WallSection } from '../../core/state';
import { SECTION_BY_ID } from '../../data/sections';
import { checkThresholds, fortState, rawBreach, recomputeBreach, targetTowersDown } from './api';

/**
 * Fortifications simulation: the walls themselves have no behaviour — other
 * features damage/repair them through api.ts. Each tick we only keep the derived
 * breach value fresh and raise threshold events (breach, tower collapse) when
 * any feature changed wall HP directly.
 */

/** Initial wall tuning (pure). Single-wall land sections lose their outer wall. */
export function initWalls(state: GameState): void {
  for (const s of Object.values(state.sections)) {
    const def = SECTION_BY_ID[s.id];
    if (!def) continue;
    if (s.kind === 'kara' && !def.moat) {
      // Blachernae / Komnenian wall: ONE wall, no moat — but a thick one on the hill.
      s.outer = 0;
      s.outerMax = 0;
      const m = Math.round(1000 * def.strength * 1.18);
      s.inner = m;
      s.innerMax = m;
    }
    s.towersDown = 0;
    recomputeBreach(s);
  }
  fortState(state).breached = {};
}

export function simTick(state: GameState, ctx: SimContext): void {
  for (const id in state.sections) {
    const s = state.sections[id];
    recomputeBreach(s);
    if (s.breach >= 0.5 || targetTowersDown(s) > s.towersDown || fortState(state).breached[id]) {
      checkThresholds(state, ctx.bus, id);
    }
  }
}

interface Dmg {
  /** remaining fraction of the outer wall */
  o?: number;
  /** remaining fraction of the inner wall */
  i?: number;
  moat?: number;
  bar?: number;
}

/** Historically plausible wall state per scenario date (fractions REMAINING). */
const SCENARIO_DAMAGE: Partial<Record<ScenarioName, Partial<Record<SectionId, Dmg>>>> = {
  // 16 Nisan: ten days of bombardment — the outer wall at Lykos/Topkapı is badly battered.
  bombardiman: {
    'kara-blahernai': { i: 0.9 },
    'kara-egrikapi': { i: 0.88 },
    'kara-edirnekapi': { o: 0.66, i: 0.94, moat: 0.06 },
    'kara-lykos': { o: 0.42, i: 0.86, moat: 0.18 },
    'kara-topkapi': { o: 0.5, i: 0.9, moat: 0.14 },
    'kara-mevlevihane': { o: 0.82, i: 0.97 },
    'kara-silivrikapi': { o: 0.9 },
    'kara-yedikule': { o: 0.92 },
  },
  // the same night: breaches in the outer wall plugged with stockades.
  'gece-onarim': {
    'kara-blahernai': { i: 0.88, bar: 0.2 },
    'kara-egrikapi': { i: 0.86 },
    'kara-edirnekapi': { o: 0.55, i: 0.9, moat: 0.08, bar: 0.35 },
    'kara-lykos': { o: 0.16, i: 0.74, moat: 0.22, bar: 0.75 },
    'kara-topkapi': { o: 0.3, i: 0.84, moat: 0.18, bar: 0.6 },
    'kara-mevlevihane': { o: 0.8, i: 0.96 },
    'kara-silivrikapi': { o: 0.9 },
  },
  'deniz-savasi': {
    'kara-edirnekapi': { o: 0.6, i: 0.92, moat: 0.1, bar: 0.3 },
    'kara-lykos': { o: 0.3, i: 0.8, moat: 0.25, bar: 0.6 },
    'kara-topkapi': { o: 0.4, i: 0.88, moat: 0.2, bar: 0.45 },
    'kara-blahernai': { i: 0.86 },
    'halic-balat': { i: 0.95 },
  },
  'gemiler-karadan': {
    'kara-edirnekapi': { o: 0.55, i: 0.9, moat: 0.12, bar: 0.35 },
    'kara-lykos': { o: 0.26, i: 0.78, moat: 0.3, bar: 0.6 },
    'kara-topkapi': { o: 0.36, i: 0.86, moat: 0.24, bar: 0.5 },
    'kara-blahernai': { i: 0.84 },
  },
  lagim: {
    'kara-blahernai': { i: 0.74, bar: 0.3 },
    'kara-egrikapi': { i: 0.78, bar: 0.25 },
    'kara-edirnekapi': { o: 0.4, i: 0.8, moat: 0.3, bar: 0.45 },
    'kara-lykos': { o: 0.12, i: 0.66, moat: 0.5, bar: 0.7 },
    'kara-topkapi': { o: 0.22, i: 0.74, moat: 0.42, bar: 0.6 },
    'kara-mevlevihane': { o: 0.7, i: 0.92 },
  },
  kule: {
    'kara-blahernai': { i: 0.74, bar: 0.3 },
    'kara-edirnekapi': { o: 0.38, i: 0.8, moat: 0.32, bar: 0.45 },
    'kara-lykos': { o: 0.1, i: 0.64, moat: 0.55, bar: 0.7 },
    'kara-topkapi': { o: 0.2, i: 0.72, moat: 0.48, bar: 0.6 },
    'kara-mevlevihane': { o: 0.68, i: 0.92 },
  },
  // 29 Mayıs, before dawn: the stockade at the Mesoteichion is all that is left.
  'son-hucum': {
    'kara-blahernai': { i: 0.66, bar: 0.35 },
    'kara-egrikapi': { i: 0.62, bar: 0.4 },
    'kara-edirnekapi': { o: 0.26, i: 0.72, moat: 0.5, bar: 0.5 },
    'kara-lykos': { o: 0.04, i: 0.42, moat: 0.75, bar: 0.55 },
    'kara-topkapi': { o: 0.08, i: 0.5, moat: 0.7, bar: 0.5 },
    'kara-mevlevihane': { o: 0.55, i: 0.86, moat: 0.2 },
    'kara-silivrikapi': { o: 0.8, i: 0.95 },
    'kara-belgradkapi': { o: 0.85 },
    'halic-balat': { i: 0.9 },
    'halic-fener': { i: 0.92 },
  },
  // 29 Mayıs, noon: the city has fallen.
  zafer: {
    'kara-blahernai': { i: 0.6 },
    'kara-egrikapi': { i: 0.56 },
    'kara-edirnekapi': { o: 0.22, i: 0.66, moat: 0.55 },
    'kara-lykos': { o: 0.02, i: 0.36, moat: 0.8 },
    'kara-topkapi': { o: 0.05, i: 0.42, moat: 0.75 },
    'kara-mevlevihane': { o: 0.5, i: 0.84, moat: 0.2 },
    'kara-silivrikapi': { o: 0.78, i: 0.94 },
    'kara-belgradkapi': { o: 0.84 },
    'halic-balat': { i: 0.88 },
    'halic-fener': { i: 0.9 },
  },
  yenilgi: {
    'kara-edirnekapi': { o: 0.3, i: 0.78, moat: 0.4, bar: 0.8 },
    'kara-lykos': { o: 0.1, i: 0.6, moat: 0.6, bar: 0.9 },
    'kara-topkapi': { o: 0.14, i: 0.66, moat: 0.55, bar: 0.85 },
    'kara-blahernai': { i: 0.72, bar: 0.5 },
  },
};

function applyDmg(s: WallSection, d: Dmg): void {
  // Respect damage other features may already have applied (keep the lower HP).
  if (d.o != null && s.outerMax > 0) s.outer = Math.min(s.outer, Math.round(s.outerMax * d.o));
  if (d.i != null) s.inner = Math.min(s.inner, Math.round(s.innerMax * d.i));
  if (d.moat != null) s.moatFill = Math.max(s.moatFill, d.moat);
  if (d.bar != null) s.barricade = Math.max(s.barricade, d.bar);
}

export function applyScenario(name: ScenarioName, state: GameState): void {
  const table = SCENARIO_DAMAGE[name];
  if (table) {
    for (const [id, d] of Object.entries(table)) {
      const s = state.sections[id];
      if (s && d) applyDmg(s, d);
    }
  }
  if (name === 'zafer') for (const s of Object.values(state.sections)) s.barricade = 0;
  const fs = fortState(state);
  for (const s of Object.values(state.sections)) {
    s.towersDown = Math.max(s.towersDown, targetTowersDown(s));
    recomputeBreach(s);
    // scenario setup: mark already-open breaches silently (no event storm on load)
    fs.breached[s.id] = s.breach >= 0.5;
    if (rawBreach(s) >= 0.5 && name !== 'yeni-oyun') state.stats.breaches = Math.max(state.stats.breaches, 1);
  }
  if (name === 'zafer') state.flags[FLAG.sehirDustu] = true;
}

/** Is the city taken (Ottoman banners on the towers)? */
export function cityFallen(state: GameState): boolean {
  return !!state.flags[FLAG.sehirDustu] || state.outcome?.result === 'zafer';
}
