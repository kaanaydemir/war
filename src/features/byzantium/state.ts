import { featureState, type GameState, type SectionId } from '../../core/state';
import { FEATURE_ID } from './data';

/**
 * Private, JSON-serializable state of the byzantium feature (state.features.byzantium).
 * Pure — no Phaser.
 */
export interface ByzPriv {
  v: 1;
  // ── relief ──
  /** Sum of modifier days currently folded into state.relief.arrival. */
  reliefMods: number;
  /** Skew of the player's estimate window around the truth (−0.4..0.4). */
  reliefSkew: number;
  /** Notes this feature owns inside state.relief.notes. */
  myNotes: string[];
  /** Smoothed naval blockade (0..1) for the relief modifier. */
  blockadeEma: number;
  /** Day Rumeli Hisarı was seen complete (fallback when economy sets no hisarBitisGunu). */
  hisarSeenDay: number | null;

  // ── clocks ──
  /** Last integer day processed by the daily update. */
  lastDay: number;
  aiAcc: number;
  // ── walls ──
  /** Last seen wall HP (outer + inner) per section — damage detection. */
  hpPrev: Record<SectionId, number>;
  /** Decaying recent bombardment damage per section (HP). */
  dmgRecent: Record<SectionId, number>;
  /** Wall damage taken today (all sections) — for morale. */
  dmgToday: number;
  // ── night repairs ──
  /** Effort accumulated but not yet applied (batched). */
  repairPending: Record<SectionId, number>;
  repairBatch: number;
  /** Current share of the work force per section (0..1) — the render shows crews from it. */
  work: Record<SectionId, number>;
  /** Repair effort spent tonight / last night per section. */
  repairTonight: Record<SectionId, number>;
  repairLastNight: Record<SectionId, number>;
  /** Day a repair report was last logged per section. */
  repLog: Record<SectionId, number>;
  /** Fraction of capacity used tonight (for exhaustion). */
  usedTonight: number;
  capTonight: number;
  exhaustion: number;
  /** Day index of the night currently being worked (floor of its start). */
  nightOf: number | null;
  // ── AI ──
  /** Men-move capacity multiplier ends at this day (gemiler karadan surge). */
  surgeUntil: number;
  /** Recent troop movements (for the render & reports). */
  moves: { from: SectionId | 'yedek'; to: SectionId | 'yedek'; n: number; day: number }[];
  // ── sorties ──
  sortieAt: number | null;
  sortiesTonight: number;
  lastSortie: { sectionId: SectionId; day: number; tx: number; ty: number; kind: 'kule' | 'birlik' } | null;
  // ── morale / politics ──
  /** Historical morale events already handled (id → day). */
  done: Record<string, number>;
  /** Defender losses not yet turned into morale. */
  lossAcc: number;
  /** Breach morale applied today (cap). */
  breachToday: number;
  /** Days the Divan-defeat conditions have held. */
  divanCrisis: number;
  divanWarned: boolean;
  reliefWarned: boolean;
  /** Final assault: Giustiniani is wounded at this day. */
  woundAt: number | null;
  /** Morale/defense "panic" at the Mesoteikhion after Giustiniani withdraws (0..1). */
  panic: number;
  emperorFateLogged: boolean;
  /** Days with famine (food = 0). */
  famineDays: number;
  /** Next day a deserter/spy report may arrive. */
  intelNext: number;
}

export function initPriv(day: number): ByzPriv {
  return {
    v: 1,
    reliefMods: 0,
    reliefSkew: 0,
    myNotes: [],
    blockadeEma: 0,
    hisarSeenDay: null,
    lastDay: Math.floor(day),
    aiAcc: 0,
    hpPrev: {},
    dmgRecent: {},
    dmgToday: 0,
    repairPending: {},
    repairBatch: 0,
    work: {},
    repairTonight: {},
    repairLastNight: {},
    repLog: {},
    usedTonight: 0,
    capTonight: 0,
    exhaustion: 0,
    nightOf: null,
    surgeUntil: -1,
    moves: [],
    sortieAt: null,
    sortiesTonight: 0,
    lastSortie: null,
    done: {},
    lossAcc: 0,
    breachToday: 0,
    divanCrisis: 0,
    divanWarned: false,
    reliefWarned: false,
    woundAt: null,
    panic: 0,
    emperorFateLogged: false,
    famineDays: 0,
    intelNext: 0,
  };
}

/** Typed accessor (creates defaults for old saves). */
export function byzPriv(state: GameState): ByzPriv {
  const p = featureState<ByzPriv>(state, FEATURE_ID, () => initPriv(state.time.day));
  // older saves: fill fields added later with defaults
  if (p.repLog === undefined) {
    const def = initPriv(state.time.day) as unknown as Record<string, unknown>;
    const cur = p as unknown as Record<string, unknown>;
    for (const k of Object.keys(def)) if (cur[k] === undefined) cur[k] = def[k];
  }
  return p;
}
