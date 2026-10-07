/**
 * Pure helpers for the screens (no DOM, no Phaser) — unit-tested in
 * tests/ui-screens.test.ts.
 */
import { FLAG } from '../../core/flags';
import type { Difficulty, GameState, Outcome, Stats } from '../../core/state';
import type { SourceDef } from '../../data/sources';
import { HISTORICAL_SIEGE_DAYS } from './content';

// ───────────────────────────── keyboard navigation ─────────────────────────────

/**
 * Move a menu cursor by `delta`, wrapping and skipping disabled items.
 * Returns the current index if every item is disabled.
 */
export function navStep(i: number, delta: number, n: number, disabled: (k: number) => boolean = () => false): number {
  if (n <= 0) return 0;
  const dir = delta >= 0 ? 1 : -1;
  let k = ((i % n) + n) % n;
  for (let step = 0; step < n; step++) {
    k = (((k + dir) % n) + n) % n;
    if (!disabled(k)) return k;
  }
  return i;
}

/** First enabled index (or 0). */
export function firstEnabled(n: number, disabled: (k: number) => boolean): number {
  for (let k = 0; k < n; k++) if (!disabled(k)) return k;
  return 0;
}

// ───────────────────────────── numbers ─────────────────────────────

/** Turkish thousands separator ('12.345'). */
export function fmtInt(n: number): string {
  const v = Math.round(Math.max(0, n));
  return v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Turkish percentage ('%42'). */
export function fmtPct(p: number): string {
  return `%${Math.round(Math.max(0, Math.min(1, p)) * 100)}`;
}

/** Ease-out counter value for ticking stats (t: 0..1). */
export function tickValue(target: number, t: number): number {
  const k = Math.max(0, Math.min(1, t));
  return Math.round(target * (1 - Math.pow(1 - k, 3)));
}

// ───────────────────────────── outcome ─────────────────────────────

/** Siege day count for the end screen (outcome.siegeDays, else derived). */
export function siegeDaysOf(state: GameState | null): number | null {
  const o = state?.outcome;
  if (o?.siegeDays != null) return o.siegeDays;
  if (state && state.time.siegeStartDay != null) return Math.max(1, Math.floor((o?.day ?? state.time.day) - state.time.siegeStartDay) + 1);
  return null;
}

export interface Comparison {
  /** Main sentence ("Sen İstanbul'u X günde fethettin. Tarihte kuşatma 53 gün sürdü."). */
  main: string;
  /** Verdict line. */
  verdict: string;
  /** Days faster (+) or slower (−) than history. */
  delta: number;
}

export function compareSiege(days: number | null): Comparison {
  const H = HISTORICAL_SIEGE_DAYS;
  if (days == null) return { main: `Tarihte kuşatma ${H} gün sürdü.`, verdict: '', delta: 0 };
  const main = `Sen İstanbul’u ${days} günde fethettin. Tarihte kuşatma ${H} gün sürdü.`;
  const delta = H - days;
  let verdict: string;
  if (delta > 0) verdict = `Tarihten ${delta} gün önce.`;
  else if (delta < 0) verdict = `Tarihten ${-delta} gün sonra.`;
  else verdict = 'Tam tarihteki gibi.';
  return { main, verdict, delta };
}

export interface StatRow {
  id: keyof Stats;
  label: string;
  value: number;
}

export function statRows(stats: Stats | null | undefined): StatRow[] {
  const s = stats ?? { ottomanLosses: 0, byzantineLosses: 0, shotsFired: 0, breaches: 0, assaults: 0, shipsLost: 0 };
  return [
    { id: 'ottomanLosses', label: 'Osmanlı kayıpları', value: s.ottomanLosses },
    { id: 'byzantineLosses', label: 'Bizans kayıpları', value: s.byzantineLosses },
    { id: 'shotsFired', label: 'Atılan gülle', value: s.shotsFired },
    { id: 'breaches', label: 'Açılan gedik', value: s.breaches },
    { id: 'assaults', label: 'Hücum', value: s.assaults },
    { id: 'shipsLost', label: 'Kaybedilen gemi', value: s.shipsLost },
  ];
}

export type EndingKind = Outcome['result'];

export function endingKind(state: GameState | null): EndingKind {
  return state?.outcome?.result ?? 'zafer';
}

/**
 * "Neler farklı yapılabilirdi?" — concrete, state-based advice after a defeat
 * (max `limit` items, most important first).
 */
export function lessonsFor(state: GameState | null, limit = 4): string[] {
  if (!state) return [];
  const f = state.flags;
  const out: string[] = [];
  const kind = state.outcome?.result;
  if (!f[FLAG.sahiCephede]) out.push('Şahi topunu erken döktürüp yolu düzleterek cepheye çabuk ulaştırmak, surlarda gedik açmayı hızlandırırdı.');
  if ((state.stats?.breaches ?? 0) === 0) out.push('Bombardımanı tek bir sur bölümünde, örneğin Lykos vadisinde yoğunlaştırmak Bizans’ın gece onarımlarını boşa çıkarırdı.');
  if (!f[FLAG.gemilerKaradan]) out.push('Gemileri karadan Haliç’e indirmek, Bizans’ı Haliç surlarına asker kaydırmaya zorlar ve kara surlarını zayıflatırdı.');
  if (kind === 'yenilgi-hacli') {
    if (!f[FLAG.macarAteskes]) out.push('Macaristan ile ateşkes, Hunyadi’nin harekete geçmesini ve yardımın gelişini geciktirirdi.');
    if (!f[FLAG.venedikAntlasma]) out.push('Venedik ile bir antlaşma, Senato’nun yardım filosunu ağırdan almasını sağlardı.');
    if (!f[FLAG.moraSeferi]) out.push('Turahan Bey’i Mora’ya göndermek, Mora despotlarının yardım yollamasını engellerdi.');
    if (f[FLAG.rizzoKarari] === 'batir') out.push('Rizzo’nun gemisini batırmak Venedik’i öfkelendirdi ve yardım filosunu hızlandırdı.');
  }
  if (kind === 'yenilgi-divan') {
    if (state.morale < 40) out.push('Mehter, bahşiş ve Akşemseddin’in öğütleri ordunun moralini ayakta tutardı.');
    if ((state.divan ?? 0) < 0) out.push('Savaş kanadını, yani Zağanos Paşa’yı desteklemek Divan’ı kuşatmadan yana tutardı.');
    out.push('Erzak kafilelerini korumak ve Gelibolu’dan deniz yoluyla erzak getirmek ordunun dayanma süresini uzatırdı.');
  }
  if (!f[FLAG.sonHucumIlan] && (state.stats?.breaches ?? 0) > 0) out.push('Gedik açıldıktan sonra son hücumu erken ilan etmek, yardım yetişmeden sonucu belirlerdi.');
  // general advice, so the list never feels thin
  if (!f[FLAG.hisarTamam]) out.push('Rumeli Hisarı’nı erken bitirmek Boğaz’ı keser, Karadeniz’den şehre gelecek erzak ve yardımı durdururdu.');
  if (!f[FLAG.lagimBasladi]) out.push('Lağımcıları surların altına göndermek, savunmayı toplar susunca bile tedirgin ederdi.');
  if ((state.stats?.assaults ?? 0) === 0 && kind === 'yenilgi-hacli') out.push('Ara hücumlarla savunanları yıpratmak, zaten az olan Bizans askerini her gün biraz daha azaltırdı.');
  out.push('Kuşatmanın her günü önemliydi: daha hızlı hazırlık, yardımın yetişmesine fırsat bırakmazdı.');
  return out.slice(0, limit);
}

// ───────────────────────────── calendar ─────────────────────────────

export const GUN_ADLARI = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'] as const;

/**
 * Weekday name of an absolute day index, anchored on a reference day whose
 * weekday is known (29 Mayıs 1453 was a Tuesday — Salı — in the Julian calendar).
 */
export function weekdayName(dayIndex: number, refDay: number, refWeekday = 2): string {
  const diff = Math.floor(dayIndex) - Math.floor(refDay);
  return GUN_ADLARI[(((refWeekday + diff) % 7) + 7) % 7];
}

// ───────────────────────────── sources ─────────────────────────────

export const SOURCE_GROUP_TITLES: Record<SourceDef['group'], string> = {
  osmanli: 'Osmanlı kaynakları',
  belge: 'Belgeler',
  modern: 'Modern çalışmalar',
  kontrol: 'Kontrol amaçlı',
};

export function groupSources(list: SourceDef[]): { group: SourceDef['group']; title: string; items: SourceDef[] }[] {
  const order: SourceDef['group'][] = ['osmanli', 'belge', 'modern', 'kontrol'];
  return order
    .map((g) => ({ group: g, title: SOURCE_GROUP_TITLES[g], items: list.filter((s) => s.group === g) }))
    .filter((g) => g.items.length > 0);
}

// ───────────────────────────── difficulty ─────────────────────────────

/** Siege day number (Gün N, 6 Nisan = Gün 1) for an absolute day relative to the historical start. */
export function gunNo(absDay: number, histStart: number): number {
  return Math.round(absDay - histStart) + 1;
}

export function difficultyDetail(
  d: Difficulty,
  relief: Record<Difficulty, { earliest: number; latest: number }>,
  repair: Record<Difficulty, number>,
  histStart: number,
): { yardim: string; onarim: string } {
  const r = relief[d];
  const k = repair[d] ?? 1;
  const kat = (Math.round(k * 100) / 100).toString().replace('.', ',');
  return {
    yardim: `Haçlı yardımı en erken ${gunNo(r.earliest, histStart)}. gün, en geç ${gunNo(r.latest, histStart)}. gün gelebilir.`,
    onarim:
      Math.abs(k - 1) < 0.005
        ? 'Bizans gedikleri tarihteki hızla onarır.'
        : `Bizans gedikleri daha ${k < 1 ? 'yavaş' : 'hızlı'} onarır: tarihteki hızın ${kat} katı.`,
  };
}

// ───────────────────────────── settings ─────────────────────────────

export type UiOlcek = 'oto' | 2 | 3 | 4;

export interface ExtraSettings {
  uiOlcek: UiOlcek;
  kenarKaydirma: boolean;
  /** Reduce screen-shake/flash heavy animations in menus. */
  azHareket: boolean;
}

export const DEFAULT_EXTRA: ExtraSettings = { uiOlcek: 'oto', kenarKaydirma: true, azHareket: false };

export interface CoreSettings {
  musicVolume: number;
  sfxVolume: number;
  autoPauseAtDawn: boolean;
  showTutorial: boolean;
}

const clamp01 = (v: unknown, d: number) => (typeof v === 'number' && isFinite(v) ? Math.max(0, Math.min(1, v)) : d);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);

/** Parse persisted settings defensively (bad/missing fields fall back to defaults). */
export function parseSettings(raw: string | null, core: CoreSettings): { core: CoreSettings; extra: ExtraSettings } {
  let o: any = null;
  try {
    o = raw ? JSON.parse(raw) : null;
  } catch {
    o = null;
  }
  const c = o?.core ?? {};
  const e = o?.extra ?? {};
  const olcek: UiOlcek = e.uiOlcek === 2 || e.uiOlcek === 3 || e.uiOlcek === 4 ? e.uiOlcek : 'oto';
  return {
    core: {
      musicVolume: clamp01(c.musicVolume, core.musicVolume),
      sfxVolume: clamp01(c.sfxVolume, core.sfxVolume),
      autoPauseAtDawn: bool(c.autoPauseAtDawn, core.autoPauseAtDawn),
      showTutorial: bool(c.showTutorial, core.showTutorial),
    },
    extra: { uiOlcek: olcek, kenarKaydirma: bool(e.kenarKaydirma, DEFAULT_EXTRA.kenarKaydirma), azHareket: bool(e.azHareket, DEFAULT_EXTRA.azHareket) },
  };
}

/** UI pixel size: automatic 2/3 by viewport (same thresholds as the HUD) or forced. */
export function uiPx(w: number, h: number, pref: UiOlcek = 'oto'): number {
  if (pref !== 'oto') return pref;
  return w >= 1800 && h >= 1000 ? 3 : 2;
}

/** Largest integer scale ≤ max that fits `size` into `avail`. */
export function fitScale(size: number, avail: number, max: number, min = 1): number {
  for (let k = max; k > min; k--) if (size * k <= avail) return k;
  return min;
}

// ───────────────────────────── encyclopedia ─────────────────────────────

/** Split a paragraph at "(doğrulanacak…)" marks so the UI can badge them. */
export function splitDogrulanacak(text: string): { text: string; mark: boolean }[] {
  const out: { text: string; mark: boolean }[] = [];
  const re = /\(doğrulanacak[^)]*\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), mark: false });
    out.push({ text: m[0].slice(1, -1), mark: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), mark: false });
  return out;
}

/** Rotate through facts deterministically from a time value. */
export function factIndex(ms: number, n: number, periodMs = 6500): number {
  if (n <= 0) return 0;
  return Math.floor(ms / periodMs) % n;
}
