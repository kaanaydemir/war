import type { EncyclopediaCategory, EncyclopediaEntry, EventDef, EventKind } from '../../core/defs';
import { formatDate } from '../../core/calendar';
import type { GameState } from '../../core/state';
import { landmarkTile } from '../../data/landmarks';
import { SOURCE_BY_ID, type SourceDef } from '../../data/sources';
import { describeEffects, priv, type EffectChip } from './effects';
import { EVENT_BY_ID, EVENT_X_BY_ID, EVENTS_X } from './data';
import { ENCYCLOPEDIA } from './encyclopedia';
import { objectivesFor, tipsFor } from './objectives';
import { AUTO_CLOSE_SEC, cardPauses, choiceBlocked, safeVariant } from './sim';
import { eclipseAt, eclipseCoverage, weatherAt } from './sky';
import { illustrationCanvas, illustrationSheet, type IllustrationSheet } from './art';

/** PUBLIC API of events (owner: events agent). Signatures are a contract. */

export function getEventDef(id: string): EventDef | undefined {
  return EVENT_BY_ID[id];
}

export interface DawnReport {
  day: number;
  lines: { kind: 'bilgi' | 'uyari' | 'basari' | 'kayip' | 'casus'; text: string }[];
}

/** The latest dawn report (siege), or null. Compiled by the events sim at each siege dawn. */
export function getDawnReport(state: GameState): DawnReport | null {
  if (state.time.phase !== 'kusatma' && state.time.phase !== 'bitti') return null;
  return priv(state).dawn.report;
}

export interface Objective {
  id: string;
  text: string;
  done: boolean;
  /** Optional progress 0..1. */
  progress?: number;
  /** Optional camera hint. */
  focus?: { tx: number; ty: number };
  /** Side objective (not required to win). */
  optional?: boolean;
}

/** Current goals shown in the HUD ("Görevler"). Phase-aware. */
export function currentObjectives(state: GameState): Objective[] {
  try {
    return objectivesFor(state);
  } catch (err) {
    console.error('[events] objectives failed', err);
    return [];
  }
}

export interface Tip {
  id: string;
  title: string;
  text: string;
}

/**
 * Contextual tutorial tips for the current situation (max 2, undismissed).
 * Dismiss: dispatch {t:'ozel', feature:'events', action:'ipucu-kapat', payload:{id}}
 * (all: action 'ipuclari-kapat'; reset: 'ipuclari-sifirla').
 */
export function activeTips(state: GameState): Tip[] {
  return tipsFor(state);
}

// ───────────────────────────── Event cards (UI helpers) ─────────────────────────────

export const EVENT_KIND_ADI: Record<EventKind, string> = {
  sabit: 'Tarihî olay',
  kosullu: 'Koşullu olay',
  tepkisel: 'Tepkisel olay',
  karar: 'Karar',
};

export const SOURCE_GROUP_ADI: Record<SourceDef['group'], string> = {
  osmanli: 'Osmanlı kaynağı',
  belge: 'Belge',
  modern: 'Modern çalışma',
  kontrol: 'Kontrol kaynağı',
};

export interface SourceRef {
  id: string;
  /** "Tursun Bey, Târîh-i Ebü'l-Feth" */
  label: string;
  author: string;
  title: string;
  group: SourceDef['group'];
  groupLabel: string;
}

export function sourceRefs(ids: string[]): SourceRef[] {
  const out: SourceRef[] = [];
  for (const id of ids) {
    const s = SOURCE_BY_ID[id];
    if (!s) continue;
    out.push({ id, label: `${s.author}, ${s.title}`, author: s.author, title: s.title, group: s.group, groupLabel: SOURCE_GROUP_ADI[s.group] });
  }
  return out;
}

export interface CardChoiceView {
  id: string;
  label: string;
  desc?: string;
  /** The choice made in history (show "Tarihte" badge). */
  tarihi: boolean;
  disabled: boolean;
  /** Why disabled (Turkish). */
  reason?: string;
  /** Consequence chips (costs first). */
  effects: EffectChip[];
}

export interface EventCardView {
  id: string;
  code: string;
  title: string;
  dateLabel: string;
  kind: EventKind;
  kindLabel: string;
  minor: boolean;
  text: string;
  tarihte: string;
  sources: SourceRef[];
  /** Static illustration texture key ('olay/…'), 160×96. */
  image?: string;
  /** Day it fired + formatted date. */
  firedDay: number;
  firedDateLabel: string;
  /** True while this card pauses the game. */
  pauses: boolean;
  /** Decision card (must pick a choice; 'olay-kapat' is ignored). */
  isDecision: boolean;
  choices: CardChoiceView[];
  /** What already happened when the event fired (chips). */
  outcome: EffectChip[];
  /** Choice already made (history view). */
  chosen?: string;
  /** Map focus tile (for "Haritada göster"). */
  focus?: { tx: number; ty: number };
  /** Cards waiting behind this one. */
  queueLength: number;
  /** For non-pausing info cards: remaining auto-close fraction 1→0. */
  autoClose?: number;
}

/** Full view model of an event card (default: the active card), combining def + state. */
export function eventCardView(state: GameState, eventId?: string): EventCardView | null {
  const id = eventId ?? state.events.active?.eventId;
  if (!id) return null;
  const def = EVENT_X_BY_ID[id];
  if (!def) return null;
  const v = safeVariant(def, state);
  const isActive = state.events.active?.eventId === id;
  const firedDay = state.events.fired[id] ?? state.events.active?.firedDay ?? state.time.day;
  const choices: CardChoiceView[] = (def.choices ?? []).map((c) => {
    const reason = choiceBlocked(state, def, c.id);
    return {
      id: c.id,
      label: c.label,
      desc: c.desc,
      tarihi: !!c.tarihi,
      disabled: !!reason,
      reason: reason ?? undefined,
      effects: describeEffects(c.fx, c.requires),
    };
  });
  const outcome = [...describeEffects(def.fireFx), ...describeEffects(v?.fx)];
  const pauses = isActive && cardPauses(def, state);
  let autoClose: number | undefined;
  if (isActive && !pauses && !choices.length) autoClose = Math.max(0, 1 - priv(state).activeAge / AUTO_CLOSE_SEC);
  let focus: { tx: number; ty: number } | undefined;
  if (def.focus) {
    try {
      focus = landmarkTile(def.focus);
    } catch {
      focus = undefined;
    }
  }
  return {
    id,
    code: def.code,
    title: v?.title ?? def.title,
    dateLabel: def.dateLabel,
    kind: def.kind,
    kindLabel: EVENT_KIND_ADI[def.kind],
    minor: !!def.minor,
    text: v?.text ?? def.text,
    tarihte: v?.tarihte ?? def.tarihte,
    sources: sourceRefs(def.sources),
    image: v?.image ?? def.image,
    firedDay,
    firedDateLabel: formatDate(firedDay),
    pauses,
    isDecision: choices.length > 0,
    choices,
    outcome,
    chosen: state.events.choices[id],
    focus,
    queueLength: state.events.queue.length,
    autoClose,
  };
}

export interface EventHistoryItem {
  id: string;
  code: string;
  title: string;
  dateLabel: string;
  firedDay: number;
  firedDateLabel: string;
  kind: EventKind;
  minor: boolean;
  /** Label of the chosen option (if a decision). */
  choiceLabel?: string;
  /** Whether the player's choice matched history. */
  asHistory?: boolean;
}

/** Fired events, newest first (for an "Olaylar" journal panel). */
export function eventHistory(state: GameState): EventHistoryItem[] {
  const out: EventHistoryItem[] = [];
  for (const [id, day] of Object.entries(state.events.fired)) {
    const def = EVENT_X_BY_ID[id];
    if (!def) continue;
    const cid = state.events.choices[id];
    const c = cid ? def.choices?.find((x) => x.id === cid) : undefined;
    out.push({
      id,
      code: def.code,
      title: safeVariant(def, state)?.title ?? def.title,
      dateLabel: def.dateLabel,
      firedDay: day,
      firedDateLabel: formatDate(day),
      kind: def.kind,
      minor: !!def.minor,
      choiceLabel: c?.label,
      asHistory: c ? !!c.tarihi : undefined,
    });
  }
  return out.sort((a, b) => b.firedDay - a.firedDay);
}

export interface TimelineItem {
  id: string;
  code: string;
  title: string;
  dateLabel: string;
  historicalDay: number;
  fired: boolean;
}

/** The historical calendar of the design events (H/K codes), in date order. */
export function historicalTimeline(state: GameState | null): TimelineItem[] {
  return EVENTS_X.filter((e) => !e.minor && e.historicalDay != null).map((e) => ({
    id: e.id,
    code: e.code,
    title: e.title,
    dateLabel: e.dateLabel,
    historicalDay: e.historicalDay!,
    fired: !!state && state.events.fired[e.id] != null,
  }));
}

// ───────────────────────────── Illustrations ─────────────────────────────

/**
 * The miniature illustration for a texture key ('olay/…') as a canvas (DOM only).
 * Same pixels as the Phaser texture (scene.textures.get(key).getSourceImage()).
 * Scale with CSS `image-rendering: pixelated` at integer multiples.
 */
export function eventImage(key: string): HTMLCanvasElement | null {
  return illustrationCanvas(key);
}

/**
 * Animated version: a horizontal strip of `frames` frames (fw×fh) at `fps`.
 * Phaser key: `${key}:anim` (spritesheet) — CSS: background-position steps(frames).
 */
export function eventImageAnim(key: string): IllustrationSheet | null {
  return illustrationSheet(key);
}
export type { IllustrationSheet };

// ───────────────────────────── Sky (for atmosphere/audio) ─────────────────────────────

/** Historical eclipse/weather at the current time (the sim also emits 'eclipse'/'weather' on change). */
export function skyState(state: GameState): { eclipse: boolean; eclipseCoverage: number; weather: { kind: 'acik' | 'yagmur' | 'dolu' | 'sis' | 'kar'; intensity: number } } {
  return { eclipse: eclipseAt(state.time.day), eclipseCoverage: eclipseCoverage(state.time.day), weather: weatherAt(state.time.day) };
}

// ───────────────────────────── Encyclopedia ─────────────────────────────

export const ENCYCLOPEDIA_KATEGORI_ADI: Record<EncyclopediaCategory, string> = {
  kisi: 'Kişiler',
  yer: 'Yerler',
  olay: 'Olaylar',
  silah: 'Silahlar ve araçlar',
  kaynak: 'Kaynaklar',
  kavram: 'Kavramlar',
};

const ENC_BY_ID: Record<string, EncyclopediaEntry> = Object.fromEntries(ENCYCLOPEDIA.map((e) => [e.id, e]));

export function getEncyclopediaEntry(id: string): EncyclopediaEntry | undefined {
  return ENC_BY_ID[id];
}

/** Entries grouped by category (alphabetical, Turkish collation). */
export function encyclopediaByCategory(): Record<EncyclopediaCategory, EncyclopediaEntry[]> {
  const out = { kisi: [], yer: [], olay: [], silah: [], kaynak: [], kavram: [] } as Record<EncyclopediaCategory, EncyclopediaEntry[]>;
  for (const e of ENCYCLOPEDIA) out[e.category].push(e);
  for (const k of Object.keys(out) as EncyclopediaCategory[]) out[k].sort((a, b) => a.title.localeCompare(b.title, 'tr'));
  return out;
}

/** Case/diacritic-insensitive search over title, subtitle and body. */
export function searchEncyclopedia(q: string): EncyclopediaEntry[] {
  const norm = (t: string) =>
    t
      .toLocaleLowerCase('tr')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/ı/g, 'i');
  const n = norm(q.trim());
  if (!n) return [];
  const scored: { e: EncyclopediaEntry; s: number }[] = [];
  for (const e of ENCYCLOPEDIA) {
    const t = norm(e.title);
    let s = 0;
    if (t.startsWith(n)) s = 3;
    else if (t.includes(n)) s = 2;
    else if (norm(e.subtitle ?? '').includes(n)) s = 1.5;
    else if (e.body.some((p) => norm(p).includes(n))) s = 1;
    if (s) scored.push({ e, s });
  }
  return scored.sort((a, b) => b.s - a.s || a.e.title.localeCompare(b.e.title, 'tr')).map((x) => x.e);
}

/** Encyclopedia entries related to an event card (by shared source/keyword links). */
export function encyclopediaForEvent(eventId: string): EncyclopediaEntry[] {
  const ids = EVENT_ENCYCLOPEDIA[eventId] ?? [];
  return ids.map((i) => ENC_BY_ID[i]).filter((e): e is EncyclopediaEntry => !!e);
}

/** Event → encyclopedia links ("Ansiklopedide oku"). */
export const EVENT_ENCYCLOPEDIA: Record<string, string[]> = {
  'h1-divan': ['fatih', 'halil-pasa', 'zaganos-pasa', 'divan'],
  'h2-antlasmalar': ['hunyadi', 'venedik'],
  'h3-hisar-temel': ['rumeli-hisari', 'anadolu-hisari', 'saruca-pasa', 'bogaz'],
  'h3-hisar-tamam': ['rumeli-hisari', 'bogaz'],
  'h4-rizzo': ['antonio-rizzo', 'rumeli-hisari', 'venedik'],
  'h5-orban': ['orban', 'sahi-topu'],
  'h5-deneme-atisi': ['sahi-topu', 'orban', 'edirne'],
  'h6-mora': ['turahan-bey', 'mora'],
  'h7-trakya': ['karaca-pasa'],
  'h8-tasima': ['sahi-topu'],
  'h9-ordu': ['timar', 'kapikulu', 'yeniceri-ocagi', 'basibozuk', 'akinci'],
  'h10-hareket': ['edirne', 'fatih'],
  'k1-ordu-surlarda': ['otag', 'karaca-pasa', 'ishak-pasa', 'halic-zinciri', 'kara-surlari'],
  'k3-bombardiman': ['sahi-topu', 'topkapi', 'kara-surlari'],
  'k4-gece-hucumu': ['lykos', 'giustiniani'],
  'k5-deniz-savasi': ['deniz-savasi', 'baltaoglu', 'hamza-bey', 'karaka', 'kadirga'],
  'k6-aksemseddin': ['aksemseddin', 'kaynak-aksemseddin'],
  'k7-gemiler-karadan': ['gemilerin-karadan-yurutulmesi', 'halic', 'kasimpasa', 'galata'],
  'k8-yakma-baskini': ['halic', 'galata', 'rum-atesi'],
  'k9-halic-koprusu': ['halic', 'zaganos-pasa'],
  'k10-ara-hucum': ['blahernai', 'lykos'],
  'k11-lagimlar': ['lagim', 'zaganos-pasa', 'blahernai'],
  'k11-karsi-lagim': ['johannes-grant', 'lagim'],
  'k12-kusatma-kulesi': ['kusatma-kulesi'],
  'k12-kule-yandi': ['kusatma-kulesi', 'rum-atesi'],
  'k13-teslim-teklifi': ['konstantinos', 'teslim-teklifi'],
  'k14-ay-tutulmasi': ['ay-tutulmasi'],
  'k16-isaretler': ['ayasofya', 'ay-tutulmasi'],
  'k17-divan': ['halil-pasa', 'zaganos-pasa', 'divan'],
  'k18-son-hucum-ilani': ['mehter', 'son-hucum'],
  'k19-son-hucum': ['son-hucum', 'yeniceri-ocagi', 'basibozuk'],
  'k19-giustiniani': ['giustiniani'],
  'k19-kerkoporta': ['kerkoporta', 'kaynak-doukas'],
  'k19-ulubatli-hasan': ['ulubatli-hasan'],
  'k19-fetih': ['ayasofya', 'fatih', 'konstantinos', 'kaynak-fetihname'],
  'y-sehzade-orhan': ['orhan-celebi'],
  'y-orban-bizans': ['orban'],
  'y-kilise-birligi': ['kilise-birligi', 'isidoros', 'gennadios'],
  'y-giustiniani-gelis': ['giustiniani'],
  'y-galata-ticaret': ['galata'],
  'y-havan': ['havan', 'galata'],
  'y-macar-elcileri': ['hunyadi'],
};
