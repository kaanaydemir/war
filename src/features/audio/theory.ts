/**
 * Pure music theory for the procedural score (no WebAudio here — unit-tested).
 *
 * Turkish makam music is described in the 53-comma (Holdrian koma) system:
 * a whole octave = 53 koma, a perfect fourth = 22, a perfect fifth = 31.
 * Interval names: koma 1, bakiye 4, küçük mücennep 5, büyük mücennep 8,
 * tanini 9, artık ikili 12–13.
 *
 * Everything here is ORIGINAL procedural composition: melodies are random walks
 * constrained by makam rules (durak = final, güçlü = dominant, phrase cadences),
 * laid over historical usul (rhythmic cycles). No existing march is quoted.
 */

export type MakamId = 'hicaz' | 'rast' | 'ussak' | 'huseyni' | 'saba' | 'segah';

export interface Makam {
  id: MakamId;
  name: string;
  /** 7 step sizes in koma, summing to 53 (one octave from the durak). */
  steps: number[];
  /** Scale degree (index) of the güçlü (dominant). */
  guclu: number;
  /** Seyir: where melodies start. 'cikici' starts low, 'inici' high. */
  seyir: 'cikici' | 'inici' | 'inici-cikici';
  /** Durak frequency (Hz) of the reference octave. */
  durakHz: number;
}

export const MAKAMS: Record<MakamId, Makam> = {
  // Hicaz: Hicaz dörtlüsü (5+12+5) on dügâh + Rast beşlisi (9+8+5+9) on neva.
  hicaz: { id: 'hicaz', name: 'Hicaz', steps: [5, 12, 5, 9, 8, 5, 9], guclu: 3, seyir: 'inici-cikici', durakHz: 220 },
  // Rast: Rast beşlisi (9+8+5+9) + Rast dörtlüsü (9+8+5) on neva.
  rast: { id: 'rast', name: 'Rast', steps: [9, 8, 5, 9, 9, 8, 5], guclu: 4, seyir: 'cikici', durakHz: 196 },
  // Uşşak: Uşşak dörtlüsü (8+5+9) + Buselik beşlisi (9+4+9+9).
  ussak: { id: 'ussak', name: 'Uşşak', steps: [8, 5, 9, 9, 4, 9, 9], guclu: 3, seyir: 'cikici', durakHz: 220 },
  // Hüseyni: Hüseyni beşlisi (8+5+9+9) + Uşşak dörtlüsü (8+5+9) on hüseyni.
  huseyni: { id: 'huseyni', name: 'Hüseyni', steps: [8, 5, 9, 9, 8, 5, 9], guclu: 4, seyir: 'inici-cikici', durakHz: 220 },
  // Saba: Saba dörtlüsü (8+5+5) + Hicaz on çargâh (13+4+9+9 approx.) — the lament makam.
  saba: { id: 'saba', name: 'Saba', steps: [8, 5, 5, 13, 4, 9, 9], guclu: 2, seyir: 'cikici', durakHz: 220 },
  // Segâh (approximation): Segâh üçlüsü (5+9) + Hicaz dörtlüsü (5+12+5)… sums to 53.
  segah: { id: 'segah', name: 'Segâh', steps: [5, 9, 9, 5, 12, 5, 8], guclu: 2, seyir: 'cikici', durakHz: 246.9 },
};

/** Koma offset of an (unbounded) scale degree above the durak. */
export function degreeKoma(makam: Makam, degree: number): number {
  const oct = Math.floor(degree / 7);
  const idx = degree - oct * 7;
  let k = 0;
  for (let i = 0; i < idx; i++) k += makam.steps[i];
  return k + oct * 53;
}

/** Frequency of a scale degree (0 = durak). `octaveShift` multiplies by 2^shift. */
export function degreeHz(makam: Makam, degree: number, octaveShift = 0): number {
  return makam.durakHz * Math.pow(2, degreeKoma(makam, degree) / 53 + octaveShift);
}

/** All 53-koma offsets of one octave (for tests / debugging). */
export function scaleKomas(makam: Makam): number[] {
  const out: number[] = [];
  for (let d = 0; d <= 7; d++) out.push(degreeKoma(makam, d));
  return out;
}

// ───────────────────────────── Seeded RNG (pure) ─────────────────────────────

/** mulberry32 — independent of the sim RNG (music never touches GameState). */
export function makeRng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted<T>(rnd: () => number, items: readonly T[], weights: readonly number[]): T {
  let total = 0;
  for (const w of weights) total += w;
  let r = rnd() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

// ───────────────────────────── Usul (rhythmic cycles) ─────────────────────────────

export type Stroke = 'dum' | 'tek' | 'ke' | 'tekke';

export interface Usul {
  id: string;
  name: string;
  /** Length of the cycle in eighth notes. */
  eighths: number;
  /** Davul strokes: position in eighths. 'dum' = tokmak (bass), 'tek'/'ke' = çubuk (stick). */
  strokes: { at: number; k: Stroke }[];
}

export const USULS: Record<string, Usul> = {
  // Düyek 8/8 — the classic mehter march cycle.
  duyek: {
    id: 'duyek',
    name: 'Düyek',
    eighths: 8,
    strokes: [
      { at: 0, k: 'dum' },
      { at: 2, k: 'tek' },
      { at: 3, k: 'tek' },
      { at: 4, k: 'dum' },
      { at: 6, k: 'tek' },
    ],
  },
  // Sofyan 4/4 — düm . tek ke
  sofyan: {
    id: 'sofyan',
    name: 'Sofyan',
    eighths: 8,
    strokes: [
      { at: 0, k: 'dum' },
      { at: 4, k: 'tek' },
      { at: 6, k: 'ke' },
    ],
  },
  // Ağır düyek (slow, doubled) — for the distant siege drums.
  agirDuyek: {
    id: 'agirDuyek',
    name: 'Ağır Düyek',
    eighths: 16,
    strokes: [
      { at: 0, k: 'dum' },
      { at: 4, k: 'tek' },
      { at: 6, k: 'tek' },
      { at: 8, k: 'dum' },
      { at: 12, k: 'tek' },
    ],
  },
};

// ───────────────────────────── Melody generator ─────────────────────────────

export type Ornament = 'none' | 'ust' | 'alt' | 'tril';

export interface Note {
  /** Start in eighth notes from the beginning of the section. */
  at: number;
  /** Duration in eighths. */
  dur: number;
  /** Scale degree (0 = durak; may be negative or ≥ 7). */
  deg: number;
  /** Ornament: upper/lower grace note (çarpma) or trill. */
  orn: Ornament;
  /** Strong-beat accent 0..1. */
  acc: number;
}

export interface Phrase {
  notes: Note[];
  /** Total length in eighths. */
  length: number;
  /** Degree the phrase cadences on. */
  cadence: number;
}

/** Rhythmic cells, in eighths, each summing to 8 (one düyek cycle). */
const CELLS: number[][] = [
  [2, 2, 2, 2],
  [2, 1, 1, 2, 2],
  [3, 1, 2, 2],
  [1, 1, 2, 2, 2],
  [2, 2, 1, 1, 2],
  [4, 2, 2],
  [2, 1, 1, 1, 1, 2],
  [3, 1, 3, 1],
  [1, 1, 1, 1, 2, 2],
];
const CELL_W = [5, 4, 3, 3, 3, 2, 2, 2, 1];
/** Cadential cells — the last note is long. */
const END_CELLS: number[][] = [
  [2, 2, 4],
  [1, 1, 2, 4],
  [2, 6],
  [4, 4],
  [3, 1, 4],
];
const END_W = [4, 3, 2, 2, 2];

export interface PhraseOpts {
  /** Lowest / highest allowed degree. */
  lo: number;
  hi: number;
  /** Cadence degree (last note). */
  cadence: number;
  /** Starting degree. */
  start: number;
  /** Number of 8-eighth measures. */
  measures: number;
  /** Probability of ornaments on notes ≥ 2 eighths. */
  ornament?: number;
}

/**
 * Generate one phrase: a constrained random walk with gravity toward the
 * cadence, ending with a stepwise approach to the cadence degree (a makam
 * "karar" — usually from above, the typical descending close).
 */
export function composePhrase(rnd: () => number, o: PhraseOpts): Phrase {
  const notes: Note[] = [];
  let at = 0;
  let deg = clampInt(o.start, o.lo, o.hi);
  let lastLeap = 0;
  const total = o.measures * 8;
  for (let m = 0; m < o.measures; m++) {
    const last = m === o.measures - 1;
    const cell = last ? pickWeighted(rnd, END_CELLS, END_W) : pickWeighted(rnd, CELLS, CELL_W);
    for (let i = 0; i < cell.length; i++) {
      const dur = cell[i];
      const progress = (at + dur) / total;
      if (notes.length > 0) {
        // Recover from a leap with a step in the opposite direction.
        if (lastLeap !== 0) {
          deg -= Math.sign(lastLeap);
          lastLeap = 0;
        } else {
          const toward = Math.sign(o.cadence - deg);
          const moves = [-2, -1, 0, 1, 2, -3, 3, 4, -4];
          const ws = moves.map((mv) => {
            let w = mv === 0 ? 0.6 : Math.abs(mv) === 1 ? 3.2 : Math.abs(mv) === 2 ? 1.2 : 0.35;
            if (toward !== 0 && Math.sign(mv) === toward) w *= 1 + 3 * progress;
            const nd = deg + mv;
            if (nd < o.lo || nd > o.hi) w = 0;
            return w;
          });
          const mv = pickWeighted(rnd, moves, ws);
          deg += mv;
          if (Math.abs(mv) >= 3) lastLeap = mv;
        }
        deg = clampInt(deg, o.lo, o.hi);
      }
      const strong = at % 4 === 0 ? 1 : at % 2 === 0 ? 0.6 : 0.3;
      const orn: Ornament =
        dur >= 2 && rnd() < (o.ornament ?? 0.25) ? pickWeighted(rnd, ['ust', 'alt', 'tril'] as Ornament[], [3, 1.5, 1]) : 'none';
      notes.push({ at, dur, deg, orn, acc: strong });
      at += dur;
    }
  }
  // Karar: approach the cadence stepwise over the last up-to-3 notes.
  const n = notes.length;
  const fromAbove = o.cadence + 2 <= o.hi ? rnd() < 0.7 : false;
  const approach = fromAbove ? [o.cadence + 2, o.cadence + 1, o.cadence] : [o.cadence - 1, o.cadence + 1, o.cadence];
  const k = Math.min(3, n);
  for (let i = 0; i < k; i++) {
    const d = approach[approach.length - k + i];
    notes[n - k + i].deg = clampInt(d, o.lo, o.hi);
  }
  notes[n - 1].deg = o.cadence;
  notes[n - 1].orn = 'none';
  return { notes, length: total, cadence: o.cadence };
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

export interface MarchSection {
  /** 'hane' (verse) or 'teslim' (refrain) — the Ottoman peşrev form. */
  kind: 'hane' | 'teslim';
  phrases: Phrase[];
  length: number;
}

export interface March {
  makam: MakamId;
  usul: string;
  /** Quarter-note tempo. */
  bpm: number;
  /** The fixed refrain, played after every hane. */
  teslim: MarchSection;
  /** Verses; hane 2 climbs to the upper register (miyan). */
  hanes: MarchSection[];
}

/**
 * Compose an ORIGINAL mehter march in peşrev form: several "hane" (each with
 * its own contour, the second climbing into the upper register as a miyan),
 * each answered by the same "teslim" refrain that closes on the durak.
 */
export function composeMarch(seed: number, makamId: MakamId = 'hicaz', bpm = 96): March {
  const rnd = makeRng(seed);
  const mk = MAKAMS[makamId];
  const g = mk.guclu;
  const section = (kind: 'hane' | 'teslim', specs: Omit<PhraseOpts, 'measures'>[]): MarchSection => {
    const phrases = specs.map((s) => composePhrase(rnd, { ...s, measures: 2, ornament: 0.3 }));
    return { kind, phrases, length: phrases.reduce((a, p) => a + p.length, 0) };
  };
  const teslim = section('teslim', [
    { lo: -2, hi: g + 2, start: g, cadence: g },
    { lo: -2, hi: g + 2, start: g + 1, cadence: 0 },
  ]);
  const hanes = [
    section('hane', [
      { lo: -1, hi: g + 2, start: 0, cadence: g },
      { lo: -2, hi: g + 1, start: g, cadence: 1 },
    ]),
    section('hane', [
      { lo: g - 1, hi: 9, start: g + 1, cadence: 7 },
      { lo: g - 1, hi: 8, start: 7, cadence: g },
    ]),
    section('hane', [
      { lo: -1, hi: 7, start: g, cadence: g + 1 },
      { lo: -2, hi: g + 2, start: g + 1, cadence: g },
    ]),
  ];
  return { makam: makamId, usul: 'duyek', bpm, teslim, hanes };
}

/** Flatten a march to the play order: hane1 teslim hane2 teslim hane3 teslim. */
export function marchOrder(m: March): MarchSection[] {
  const out: MarchSection[] = [];
  for (const h of m.hanes) out.push(h, m.teslim);
  return out;
}

// ───────────────────────────── Taksim (free improvisation) ─────────────────────────────

export interface TaksimNote {
  deg: number;
  /** Seconds. */
  dur: number;
  /** Glide into this note (ney portamento). */
  glide: boolean;
}

export interface TaksimPhrase {
  notes: TaksimNote[];
  /** Silence after the phrase, seconds. */
  rest: number;
}

/**
 * Free-rhythm improvisation (taksim) following the makam's seyir: begins
 * around the durak (çıkıcı) or the güçlü (inici), wanders, makes temporary
 * cadences (asma karar) on the güçlü, and the final phrase rests on the durak.
 */
export function composeTaksim(seed: number, makamId: MakamId, phrases = 4, opts: { lo?: number; hi?: number; pace?: number } = {}): TaksimPhrase[] {
  const rnd = makeRng(seed);
  const mk = MAKAMS[makamId];
  const lo = opts.lo ?? -2;
  const hi = opts.hi ?? 8;
  const pace = opts.pace ?? 1;
  const out: TaksimPhrase[] = [];
  let deg = mk.seyir === 'inici' ? mk.guclu + 2 : mk.seyir === 'cikici' ? 0 : mk.guclu;
  for (let p = 0; p < phrases; p++) {
    const lastPhrase = p === phrases - 1;
    const target = lastPhrase ? 0 : rnd() < 0.6 ? mk.guclu : pickWeighted(rnd, [0, 2, mk.guclu + 1, 7], [2, 1, 1, 1]);
    const len = 3 + Math.floor(rnd() * 6);
    const notes: TaksimNote[] = [];
    for (let i = 0; i < len; i++) {
      const towards = Math.sign(target - deg);
      const moves = [-2, -1, 0, 1, 2, 3, -3];
      const prog = i / len;
      const ws = moves.map((mv) => {
        let w = mv === 0 ? 0.3 : Math.abs(mv) === 1 ? 3 : Math.abs(mv) === 2 ? 1 : 0.3;
        if (towards !== 0 && Math.sign(mv) === towards) w *= 1 + 2.5 * prog;
        if (deg + mv < lo || deg + mv > hi) w = 0;
        return w;
      });
      if (i > 0) deg = clampInt(deg + pickWeighted(rnd, moves, ws), lo, hi);
      const long = rnd() < 0.25;
      notes.push({ deg, dur: (long ? 0.9 + rnd() * 1.4 : 0.22 + rnd() * 0.5) * pace, glide: rnd() < 0.35 });
    }
    // Asma karar / karar: settle by step onto the target with a long note.
    const before = clampInt(target + (rnd() < 0.65 ? 1 : -1), lo, hi);
    notes.push({ deg: before, dur: (0.3 + rnd() * 0.3) * pace, glide: true });
    notes.push({ deg: target, dur: (1.8 + rnd() * 1.8) * pace, glide: true });
    deg = target;
    out.push({ notes, rest: (lastPhrase ? 3 : 0.8 + rnd() * 2.2) * pace });
  }
  return out;
}

/** Total length in seconds of a taksim (notes + rests). */
export function taksimLength(t: TaksimPhrase[]): number {
  let s = 0;
  for (const p of t) {
    for (const n of p.notes) s += n.dur;
    s += p.rest;
  }
  return s;
}
