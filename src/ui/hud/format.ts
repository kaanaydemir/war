/**
 * HUD formatting helpers (pure — no DOM, no Phaser). Turkish number style:
 * thousands separated by '.', decimals by ','. Minus sign is U+2212.
 */
import { dayToDate } from '../../core/calendar';

export const MINUS = '−';

const AY_KISA = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'] as const;

/** 38000 → "38.000" (rounded, Turkish grouping). */
export function fmtInt(n: number): string {
  if (!Number.isFinite(n)) return '∞';
  const neg = n < 0;
  const s = String(Math.round(Math.abs(n)));
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += '.';
    out += s[i];
  }
  return (neg && out !== '0' ? MINUS : '') + out;
}

/** One decimal with a Turkish comma, dropping ",0". */
function dec1(n: number): string {
  const r = Math.round(n * 10) / 10;
  const s = r.toFixed(1).replace('.', ',');
  return s.endsWith(',0') ? s.slice(0, -2) : s;
}

/**
 * Compact amounts for the resource bar (≤ 5 glyphs):
 * 9850 → "9.850", 38500 → "38,5B", 385000 → "385B", 1600000 → "1,6Mn".
 */
export function fmtCompact(n: number): string {
  if (!Number.isFinite(n)) return '∞';
  const a = Math.abs(n);
  const sign = n < 0 ? MINUS : '';
  if (a < 10000) return sign + fmtInt(a);
  if (a < 100000) return sign + dec1(a / 1000) + 'B';
  if (a < 1e6) return sign + Math.round(a / 1000) + 'B';
  if (a < 1e8) return sign + dec1(a / 1e6) + 'Mn';
  return sign + Math.round(a / 1e6) + 'Mn';
}

/** "+12" / "−5" / "0" with compact magnitude. */
export function fmtDelta(n: number): string {
  if (!Number.isFinite(n) || Math.abs(n) < 0.5) return '0';
  return (n > 0 ? '+' : MINUS) + fmtCompact(Math.abs(n));
}

/** Days with one decimal below 10 ("4,5"), integer above; Infinity → "∞". */
export function fmtDays(n: number): string {
  if (!Number.isFinite(n)) return '∞';
  if (n < 0) return '0';
  if (n < 10) return dec1(n);
  return fmtInt(Math.floor(n));
}

/** "%45" (Turkish percent sign before the number). */
export function fmtPct(f: number): string {
  if (!Number.isFinite(f)) return '%0';
  return `%${Math.round(f * 100)}`;
}

/** Absolute day index → "12 Haz". */
export function fmtShortDate(day: number): string {
  const c = dayToDate(day);
  return `${c.day} ${AY_KISA[c.month - 1]}`;
}

/** Estimate window → "12 Haz – 3 Tem" (or a single date when equal). */
export function fmtDateRange(a: number, b: number): string {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  if (Math.floor(lo) === Math.floor(hi)) return fmtShortDate(lo);
  return `${fmtShortDate(lo)} – ${fmtShortDate(hi)}`;
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : Number.isFinite(v) ? v : 0;
}

// ───────────────────────────── Gauge semantics ─────────────────────────────

/** Relief-fleet tension: 0 calm · 1 approaching · 2 tense · 3 critical (inside the window) · 4 arrived. */
export interface ReliefTension {
  level: 0 | 1 | 2 | 3 | 4;
  /** Days until the earliest estimate (negative once inside the window). */
  daysToMin: number;
  /** Days until the latest estimate. */
  daysToMax: number;
  label: string;
}

export function reliefTension(day: number, knownMin: number, knownMax: number, arrived: boolean): ReliefTension {
  const daysToMin = knownMin - day;
  const daysToMax = knownMax - day;
  if (arrived) return { level: 4, daysToMin, daysToMax, label: 'Haçlı donanması geldi!' };
  if (daysToMin <= 0) return { level: 3, daysToMin, daysToMax, label: 'Yardım her an gelebilir!' };
  if (daysToMin <= 7) return { level: 2, daysToMin, daysToMax, label: `En erken ${Math.ceil(daysToMin)} gün içinde` };
  if (daysToMin <= 20) return { level: 1, daysToMin, daysToMax, label: `En erken ${Math.ceil(daysToMin)} gün sonra` };
  return { level: 0, daysToMin, daysToMax, label: `En erken ${Math.ceil(daysToMin)} gün sonra` };
}

export function moraleLabel(m: number): string {
  if (m >= 85) return 'Coşkulu';
  if (m >= 65) return 'Yüksek';
  if (m >= 45) return 'Dengeli';
  if (m >= 25) return 'Bezgin';
  return 'Çökmek üzere';
}

/** Divan −100 (barış: Halil Paşa) .. +100 (savaş: Zağanos Paşa). */
export function divanLabel(v: number): string {
  if (v <= -60) return 'Barış yanlıları ağır basıyor';
  if (v <= -20) return 'Halil Paşa’nın sözü geçiyor';
  if (v < 20) return 'Divan kararsız';
  if (v < 60) return 'Zağanos Paşa’nın sözü geçiyor';
  return 'Savaş yanlıları ağır basıyor';
}

export function galataLabel(v: number): string {
  if (v >= 50) return 'Dostane';
  if (v >= 15) return 'Yumuşak';
  if (v > -15) return 'Tarafsız';
  if (v > -50) return 'Gergin';
  return 'Düşmanca';
}

/** Defender estimate with an uncertainty that shrinks with intel (0..100). */
export function defenderRange(estimate: number, intel: number): [number, number] {
  const unc = 0.05 + 0.35 * (1 - clamp01(intel / 100));
  const lo = Math.max(0, Math.floor((estimate * (1 - unc)) / 100) * 100);
  const hi = Math.ceil((estimate * (1 + unc)) / 100) * 100;
  return [lo, hi];
}

/** Erzak warning level: 0 ok · 1 low (<15 days) · 2 critical (<6 days). */
export function erzakLevel(days: number): 0 | 1 | 2 {
  if (!Number.isFinite(days)) return 0;
  if (days < 6) return 2;
  if (days < 15) return 1;
  return 0;
}

/**
 * Smoothly approach a target value for ticking counters.
 * Exponential ease (rate per second) that snaps when close.
 */
export function approach(cur: number, target: number, dt: number, rate = 9): number {
  if (!Number.isFinite(target)) return target;
  const d = target - cur;
  if (Math.abs(d) < 0.5) return target;
  return cur + d * (1 - Math.exp(-rate * dt));
}

/** UI pixel size for a viewport: 2 screen px per UI pixel, 3 from ~1800×1000 up. */
export function uiScale(w: number, h: number): 2 | 3 {
  return w >= 1800 && h >= 1000 ? 3 : 2;
}

/** "38,5B" → ["38,5", "B"]; "1,6Mn" → ["1,6", "Mn"] (the unit is drawn in the text font: Silkscreen's B looks like 8). */
export function splitSuffix(s: string): [string, string] {
  const m = /^(.*?\d)(B|Mn)$/.exec(s);
  return m ? [m[1], m[2]] : [s, ''];
}

const RUZGAR_ADI = ['Gündoğusu', 'Keşişleme', 'Kıble', 'Lodos', 'Günbatısı', 'Karayel', 'Yıldız', 'Poyraz'] as const;

/**
 * Turkish sailors' wind name for a wind blowing TOWARD `dir` (radians, tile
 * space: 0 = east, +π/2 = south). Named after where it comes FROM:
 * a wind blowing north (−π/2) is "Kıble" (the south wind).
 */
export function windName(dir: number): string {
  const from = dir + Math.PI;
  const i = ((Math.round((from / (Math.PI * 2)) * 8) % 8) + 8) % 8;
  return RUZGAR_ADI[i];
}
