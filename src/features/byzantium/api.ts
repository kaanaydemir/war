import type { Bus } from '../../core/bus';
import { formatDate, segmentOf, siegeDayNumber } from '../../core/calendar';
import { FLAG } from '../../core/flags';
import type { GameState, SectionId } from '../../core/state';
import { SECTION_BY_ID } from '../../data/sections';
import { GIUSTINIANI_SECTIONS, GRANT, KIND_QUALITY, POST_BY_SECTION, POSTS, type Post } from './data';
import { byzPriv } from './state';

/** PUBLIC API of byzantium (owner: byzantium agent). Signatures are a contract. */

export interface DefenseOpts {
  /** Ottoman archer/handgun suppression on this section 0..1 (army may pass it explicitly). */
  suppression?: number;
}

/** Optional suppression map army may keep in its private state: state.features.army.suppression[sectionId] = 0..1. */
function armySuppression(state: GameState, sectionId: SectionId): number {
  const a = state.features?.['army'] as { suppression?: Record<string, number> } | undefined;
  const v = a?.suppression?.[sectionId];
  return typeof v === 'number' && isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
}

/** True while Giustiniani (and with him the Emperor's best men) holds the Mesoteikhion. */
export function giustinianiPresent(state: GameState): boolean {
  return !state.byz.giustinianiWounded && !state.flags[FLAG.giustinianiYarali];
}

/** Commander/troop multiplier of a section right now. */
export function commandFactor(state: GameState, sectionId: SectionId): number {
  const post = POST_BY_SECTION[sectionId];
  const isG = GIUSTINIANI_SECTIONS.includes(sectionId);
  if (isG) {
    if (giustinianiPresent(state)) return (post?.quality ?? 1) * (post?.leader ?? 1);
    // Giustiniani carried off: his Genoese follow him, the line wavers.
    const panic = byzPriv(state).panic;
    return 0.85 * (1 - 0.35 * panic);
  }
  if (!post) return 1;
  return post.quality * post.leader;
}

/**
 * Effective defensive strength of a section right now (used by army assault resolution).
 * Scale ≈ "effective defenders": men × troop quality × morale × wall × commander × night × suppression.
 * An intact wall roughly ×1.5, a wide unbarricaded breach ×0.5.
 */
export function sectionDefense(state: GameState, sectionId: SectionId, opts: DefenseOpts = {}): number {
  const s = state.sections[sectionId];
  if (!s) return 0;
  if (state.flags[FLAG.sehirDustu]) return 0;
  const kindQ = KIND_QUALITY[s.kind] ?? 1;
  const morale = Math.max(0, Math.min(100, state.byz.morale));
  const moraleF = 0.45 + (morale / 100) * 0.8;
  const breach = Math.max(0, Math.min(1, s.breach));
  const bar = Math.max(0, Math.min(1, s.barricade));
  const wallF = 0.5 + 1.0 * (1 - breach) + 0.25 * bar;
  const night = segmentOf(state.time.day) === 'gece' ? 0.9 : 1;
  const sup = Math.max(opts.suppression ?? 0, armySuppression(state, sectionId));
  const supF = 1 - 0.35 * sup;
  const exh = 1 - 0.25 * byzPriv(state).exhaustion;
  return Math.max(0, s.defenders * kindQ * moraleF * wallF * commandFactor(state, sectionId) * night * supF * exh);
}

/** Kill/wound defenders of a section (assaults, arrows, mines). */
export function applyDefenderLosses(state: GameState, bus: Bus, sectionId: SectionId, n: number): void {
  const s = state.sections[sectionId];
  if (!s) return;
  const lost = Math.min(s.defenders, Math.max(0, Math.round(n)));
  if (lost <= 0) return;
  s.defenders -= lost;
  state.byz.defenders = Math.max(0, state.byz.defenders - lost);
  state.stats.byzantineLosses += lost;
  byzPriv(state).lossAcc += lost;
  void bus;
}

/** Byzantine counter-mining skill 0..1 (Johannes Grant: ≈0.6–0.75). */
export function counterMineSkill(state: GameState): number {
  const morale = Math.max(0, Math.min(100, state.byz.morale));
  let v = GRANT.base + GRANT.moraleBonus * (morale / 100);
  if (state.difficulty === 'kolay') v -= 0.04;
  if (state.difficulty === 'zor') v += 0.04;
  if (state.flags[FLAG.sehirDustu]) return 0;
  return Math.max(GRANT.min, Math.min(GRANT.max, v));
}

// ───────────────────────────── extra read-only queries (UI / other features) ─────────────────────────────

/** Visible relief estimate (player knowledge only). */
export function reliefEstimate(state: GameState): { from: string; to: string; daysLeftMin: number; notes: string[]; arrived: boolean } {
  const r = state.relief;
  return {
    from: formatDate(r.knownMin),
    to: formatDate(r.knownMax),
    daysLeftMin: Math.max(0, Math.floor(r.knownMin - state.time.day)),
    notes: r.notes.slice(),
    arrived: r.arrived,
  };
}

/** Night repair effort per section during the last finished night (HP). */
export function lastNightRepairs(state: GameState): { sectionId: SectionId; name: string; amount: number }[] {
  const p = byzPriv(state);
  return Object.entries(p.repairLastNight)
    .filter(([, v]) => v > 1)
    .sort((a, b) => b[1] - a[1])
    .map(([id, amount]) => ({ sectionId: id, name: state.sections[id]?.name ?? id, amount: Math.round(amount) }));
}

/** Current repair-crew activity per section 0..1 (render/UI). */
export function repairActivity(state: GameState, sectionId: SectionId): number {
  return byzPriv(state).work[sectionId] ?? 0;
}

/** Byzantine exhaustion 0..~0.45 (night work wears the city down). */
export function byzExhaustion(state: GameState): number {
  return byzPriv(state).exhaustion;
}

/** Historical command posts (for tooltips / encyclopedia). */
export function defenderPosts(): Post[] {
  return POSTS.slice();
}

/** Turkish one-line status of a section's defense, filtered by intel (the player cannot see inside). */
export function sectionDefenseText(state: GameState, sectionId: SectionId): string {
  const s = state.sections[sectionId];
  if (!s) return '';
  const intel = state.byz.intel;
  const post = POST_BY_SECTION[sectionId];
  const who = post && (intel >= 25 || post.sectionId === 'kara-lykos') ? ` · ${post.commander}` : '';
  if (intel < 20) return `Savunucular: bilinmiyor${who}`;
  const step = intel >= 60 ? 50 : 100;
  const n = Math.round(s.defenders / step) * step;
  return `Savunucular: ≈${n}${who}`;
}

/** Divan defeat danger 0..1 (UI warning): how close all three collapse conditions are. */
export function divanDanger(state: GameState): number {
  const p = byzPriv(state);
  return Math.max(0, Math.min(1, p.divanCrisis));
}

/** Siege day when Giustiniani fell (null if not). */
export function giustinianiWoundedDay(state: GameState): number | null {
  const d = state.flags[FLAG.giustinianiYarali] ? byzPriv(state).done['giustiniani'] : undefined;
  return d != null ? siegeDayNumber(d, state.time.siegeStartDay) : null;
}

/** Display name helper. */
export function sectionName(id: SectionId): string {
  return SECTION_BY_ID[id]?.name ?? id;
}
