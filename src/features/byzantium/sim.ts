import type { Bus } from '../../core/bus';
import { d, segmentOf, siegeDayNumber } from '../../core/calendar';
import { DAY_SEGMENTS } from '../../core/constants';
import type { Command } from '../../core/commands';
import type { ScenarioName, SimContext } from '../../core/feature';
import { FLAG } from '../../core/flags';
import type { TilePt } from '../../core/iso';
import { Rng } from '../../core/rng';
import { addLog, type GameState, type LogKind, type SectionId, type ShipType, type UnitGroup } from '../../core/state';
import { SECTIONS, SECTION_BY_ID } from '../../data/sections';
import { damageGroup } from '../army/api';
import { erzakDays } from '../economy/api';
import { getEventDef } from '../events/api';
import { rawBreach, repairSection, sectionApproach } from '../fortifications/api';
import { blockadeStrength } from '../navy/api';
import { burnTower } from '../siegeworks/api';
import { applyDefenderLosses, giustinianiPresent } from './api';
import {
  AI,
  DIFFICULTY_REPAIR,
  DIVAN,
  GALATA_LINES,
  GIUSTINIANI_SECTIONS,
  HISAR_EARLY_BEFORE,
  HIST_EVENTS,
  INTEL_LINES,
  RELIEF_MODS,
  RELIEF_SPREAD,
  RELIEF_WINDOW,
  REPAIR,
  REPAIR_CREWS,
  START_FOOD,
  TOTAL_DEFENDERS,
} from './data';
import { byzPriv, initPriv, type ByzPriv } from './state';

/**
 * BYZANTIUM SIMULATION (pure, deterministic — ctx.rng only, no Phaser).
 *
 *  - Relief (Haçlı) clock: hidden seeded arrival, dynamic diplomatic/naval modifiers,
 *    player estimate window narrowing with intel → 'yenilgi-hacli'.
 *  - Defender AI: per-section threat, gradual reallocation of men & reserves.
 *  - Night repairs: civilians, monks, women and soldiers plug breaches (fortifications.repairSection).
 *  - Night sorties against siege towers and exposed troops.
 *  - Byzantine morale/food/intel, Giustiniani's wound, the Emperor's fate.
 *  - Ottoman Divan balance & Galata relation; the Divan defeat → 'yenilgi-divan'.
 */

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const NIGHT_LEN = 1 - DAY_SEGMENTS.gece[0];
const OTTOMAN_SHIPS: ReadonlySet<ShipType> = new Set<ShipType>(['kadirga', 'kalyete', 'fusta', 'parandarya']);
const LAND_IDS = SECTIONS.filter((s) => s.kind === 'kara').map((s) => s.id);

// ───────────────────────────── bus inbox (listeners never touch state) ─────────────────────────────

type InboxItem =
  | { k: 'breach'; id: SectionId }
  | { k: 'assault'; id: SectionId; success: boolean }
  | { k: 'sunk'; type: ShipType }
  | { k: 'towerBurned'; id: SectionId }
  | { k: 'mineCollapsed'; id: SectionId }
  | { k: 'mineSuccess'; id: SectionId };

const inboxes = new WeakMap<Bus, InboxItem[]>();

function inbox(bus: Bus): InboxItem[] {
  let q = inboxes.get(bus);
  if (!q) {
    const box: InboxItem[] = [];
    q = box;
    inboxes.set(bus, box);
    const push = (it: InboxItem) => {
      if (box.length < 200) box.push(it);
    };
    bus.on('wall:breach', (e) => push({ k: 'breach', id: e.sectionId }));
    bus.on('assault:end', (e) => push({ k: 'assault', id: e.sectionId, success: e.success }));
    bus.on('ship:sunk', (e) => push({ k: 'sunk', type: e.type }));
    bus.on('tower:burned', (e) => push({ k: 'towerBurned', id: e.sectionId }));
    bus.on('mine:collapsed', (e) => push({ k: 'mineCollapsed', id: e.sectionId }));
    bus.on('mine:success', (e) => push({ k: 'mineSuccess', id: e.sectionId }));
  }
  return q;
}

// ───────────────────────────── helpers ─────────────────────────────

/** Does the events feature have a card that applies this morale itself? */
function eventsHandle(id: string): boolean {
  try {
    return !!getEventDef(id);
  } catch {
    return false;
  }
}

function addByzMorale(state: GameState, v: number): void {
  state.byz.morale = clamp(state.byz.morale + v, 0, 100);
}

function addDivan(state: GameState, v: number): void {
  state.divan = clamp(state.divan + v, -100, 100);
}

function addGalata(state: GameState, v: number): void {
  state.galata = clamp(state.galata + v, -100, 100);
}

function log(state: GameState, kind: LogKind, text: string, bus?: Bus): void {
  addLog(state, kind, text);
  bus?.emit('log', state.log[state.log.length - 1]);
}

function notify(bus: Bus, text: string, kind: 'bilgi' | 'uyari' | 'basari' | 'tehlike'): void {
  bus.emit('notify', { text, kind });
}

function fill(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}

const approachCache = new Map<SectionId, TilePt>();
/** Tile just outside the section (attacker side). Pure geometry — cached. */
export function approachOf(id: SectionId): TilePt {
  let p = approachCache.get(id);
  if (!p) {
    p = sectionApproach(id, 3);
    approachCache.set(id, p);
  }
  return p;
}

function wallHp(s: GameState['sections'][string]): number {
  return s.outer + s.inner + s.barricade * 400;
}

function sumDefenders(state: GameState): number {
  let n = 0;
  for (const id in state.sections) n += state.sections[id].defenders;
  return n;
}

function syncTotals(state: GameState): void {
  state.byz.defenders = sumDefenders(state) + Math.max(0, state.byz.reserves);
}

function inSiege(state: GameState): boolean {
  return state.time.phase === 'kusatma' && !state.flags[FLAG.sehirDustu];
}

// ───────────────────────────── init ─────────────────────────────

/** Seeded RNG for initialisation (initState has no ctx). */
function initRng(state: GameState): Rng {
  return new Rng((state.seed ^ 0x1453b12) | 0);
}

export function initState(state: GameState): void {
  const p = initPriv(state.time.day);
  state.features['byzantium'] = p;
  const rng = initRng(state);

  // ── garrison: historical posts from data/sections (Σ ≈ 6,500) + reserves under Notaras ≈ 7,000
  for (const def of SECTIONS) {
    const s = state.sections[def.id];
    if (s) {
      s.defenders = def.defenders;
      s.threat = 0;
    }
  }
  state.byz.reserves = Math.max(0, TOTAL_DEFENDERS - sumDefenders(state));
  syncTotals(state);
  state.byz.morale = 65;
  state.byz.food = START_FOOD;
  state.byz.repairCrews = REPAIR_CREWS;
  state.byz.intel = 10;
  // Rumours in Edirne wildly overestimate the garrison.
  state.byz.estimatedDefenders = Math.round(rng.range(9000, 13000) / 500) * 500;
  state.byz.giustinianiWounded = false;
  state.byz.emperorAlive = true;
  // hpPrev is filled lazily on the first siege tick (fortifications tunes the walls after us)

  // ── relief: hidden arrival, randomized by seed within the difficulty window
  const w = RELIEF_WINDOW[state.difficulty] ?? RELIEF_WINDOW.normal;
  const r = state.relief;
  r.arrival = Math.round(w.earliest + rng.next() * (w.latest - w.earliest)) + 0.3 + rng.next() * 0.4;
  r.arrived = false;
  r.notes = [];
  p.reliefSkew = rng.range(-0.35, 0.35);
  p.reliefMods = 0;
  p.intelNext = Math.floor(state.time.day) + 1;
  updateRelief(state, p, true);
}

// ───────────────────────────── relief clock ─────────────────────────────

interface ModsResult {
  days: number;
  notes: string[];
}

export function reliefModifiers(state: GameState, p: ByzPriv): ModsResult {
  const f = state.flags;
  let days = 0;
  const notes: string[] = [];
  const add = (v: number, note: string) => {
    if (!v) return;
    days += v;
    notes.push(`${note} (${v > 0 ? '+' : ''}${v} gün)`);
  };
  if (f[FLAG.macarAteskes]) add(RELIEF_MODS.macarAteskes.days, RELIEF_MODS.macarAteskes.note);
  if (f[FLAG.venedikAntlasma]) add(RELIEF_MODS.venedikAntlasma.days, RELIEF_MODS.venedikAntlasma.note);
  if (f[FLAG.moraSeferi]) add(RELIEF_MODS.moraSeferi.days, RELIEF_MODS.moraSeferi.note);
  if (f[FLAG.rizzoKarari] === 'batir') add(RELIEF_MODS.rizzoBatir.days, RELIEF_MODS.rizzoBatir.note);
  const hisarDay = typeof f[FLAG.hisarBitisGunu] === 'number' ? (f[FLAG.hisarBitisGunu] as number) : p.hisarSeenDay;
  if (f[FLAG.hisarTamam] && hisarDay != null && hisarDay < HISAR_EARLY_BEFORE) add(RELIEF_MODS.hisarErken.days, RELIEF_MODS.hisarErken.note);
  if (f[FLAG.denizSavasi] === 'durduruldu') add(RELIEF_MODS.denizDurduruldu.days, RELIEF_MODS.denizDurduruldu.note);
  if (f[FLAG.denizSavasi] === 'yarildi') add(RELIEF_MODS.denizYarildi.days, RELIEF_MODS.denizYarildi.note);
  const fleet = Math.round(p.blockadeEma * RELIEF_MODS.donanmaMax);
  if (fleet > 0) add(fleet, RELIEF_MODS.donanmaNote);
  return { days, notes };
}

/** Fold modifiers into the hidden arrival (delta-based: keeps other features' shifts) and refresh the estimate window. */
export function updateRelief(state: GameState, p: ByzPriv, fresh = false): void {
  const r = state.relief;
  if (r.arrived) return;
  const mods = reliefModifiers(state, p);
  r.arrival += mods.days - p.reliefMods;
  p.reliefMods = mods.days;
  // notes: replace our own, keep the ones other features pushed
  const mine = new Set(p.myNotes);
  const others = r.notes.filter((n) => !mine.has(n));
  p.myNotes = mods.notes;
  r.notes = [...mods.notes, ...others];
  // estimate window
  const intel = clamp(state.byz.intel, 0, 100) / 100;
  const spread = RELIEF_SPREAD.at0 + (RELIEF_SPREAD.at100 - RELIEF_SPREAD.at0) * intel;
  const skew = p.reliefSkew * (1 - 0.5 * intel);
  let lo = r.arrival - spread * (0.5 + skew);
  let hi = lo + spread;
  if (!fresh) {
    // narrowing from spies/events persists while it stays honest
    if (r.knownMin <= r.arrival && r.knownMin > lo) lo = r.knownMin;
    if (r.knownMax >= r.arrival && r.knownMax < hi) hi = r.knownMax;
  }
  lo = Math.min(Math.floor(lo), Math.floor(r.arrival));
  hi = Math.max(Math.ceil(hi), Math.ceil(r.arrival));
  if (hi - lo < 2) hi = lo + 2;
  r.knownMin = lo;
  r.knownMax = hi;
}

function checkReliefArrival(state: GameState, ctx: SimContext, p: ByzPriv): void {
  const r = state.relief;
  if (r.arrived || state.outcome || state.flags[FLAG.sehirDustu]) return;
  const ph = state.time.phase;
  if (ph !== 'kusatma' && ph !== 'yuruyus') return;
  const day = state.time.day;
  if (!p.reliefWarned && ph === 'kusatma' && day >= r.knownMin - 3) {
    p.reliefWarned = true;
    log(state, 'uyari', 'Casuslar uyarıyor: Haçlı donanması her an ufukta görünebilir. Zaman daralıyor!', ctx.bus);
    notify(ctx.bus, 'Haçlı yardımı yaklaşıyor! Tahmini aralığın başına geldik.', 'uyari');
  }
  if (day < r.arrival) return;
  r.arrived = true;
  const sd = siegeDayNumber(day, state.time.siegeStartDay);
  state.outcome = { result: 'yenilgi-hacli', day, siegeDays: sd };
  log(state, 'kayip', 'Venedik ve Papa’nın donanması Marmara’da göründü. Haçlı yardımı şehre ulaştı; kuşatma başarısız oldu.');
  notify(ctx.bus, 'Haçlı donanması ufukta! Yardım şehre ulaştı — kuşatma başarısız oldu.', 'tehlike');
}

// ───────────────────────────── per-tick entry ─────────────────────────────

export function simTick(state: GameState, ctx: SimContext): void {
  const p = byzPriv(state);
  const q = inbox(ctx.bus);
  if (state.flags[FLAG.sehirDustu]) {
    q.length = 0;
    emperorFate(state, ctx, p);
    return;
  }
  if (state.outcome || state.time.phase === 'bitti') {
    q.length = 0;
    return;
  }
  processInbox(state, ctx, p, q);

  // daily update (dawn rollover)
  const today = Math.floor(state.time.day);
  if (today > p.lastDay) {
    const n = Math.min(5, today - p.lastDay);
    for (let i = 0; i < n; i++) daily(state, ctx, p, p.lastDay + i + 1);
    p.lastDay = today;
  }
  checkReliefArrival(state, ctx, p);
  if (state.outcome) return;

  if (state.time.phase !== 'kusatma') {
    if (state.flags[FLAG.hisarTamam] && p.hisarSeenDay == null) p.hisarSeenDay = state.time.day;
    return;
  }

  trackDamage(state, p);
  p.aiAcc += ctx.dtDays;
  if (p.aiAcc >= AI.stepDays) {
    aiStep(state, ctx, p, p.aiAcc);
    p.aiAcc = 0;
  }
  const seg = segmentOf(state.time.day);
  if (seg === 'gece') nightTick(state, ctx, p);
  else if (p.repairBatch > 0) flushRepairs(state, ctx, p);
  finalAssault(state, ctx, p);
  divanCheck(state, ctx, p);
  syncTotals(state);
}

// ───────────────────────────── bus reactions ─────────────────────────────

function processInbox(state: GameState, ctx: SimContext, p: ByzPriv, q: InboxItem[]): void {
  if (!q.length) return;
  const items = q.splice(0, q.length);
  for (const it of items) {
    switch (it.k) {
      case 'breach': {
        const hit = Math.min(3, Math.max(0, 9 - p.breachToday));
        p.breachToday += hit;
        addByzMorale(state, -hit);
        addDivan(state, 3);
        break;
      }
      case 'assault':
        if (it.success) {
          addByzMorale(state, -6);
          addDivan(state, 6);
        } else {
          addByzMorale(state, 4);
          addDivan(state, -5);
          if (state.sections[it.id]) log(state, 'uyari', `${state.sections[it.id].name} önündeki hücum püskürtüldü; surlarda zafer naraları yükseliyor.`, ctx.bus);
        }
        break;
      case 'sunk':
        if (OTTOMAN_SHIPS.has(it.type)) addDivan(state, -1.5);
        break;
      case 'towerBurned':
        addDivan(state, -3);
        if (!eventsHandle('k12-kule-yandi')) addByzMorale(state, 3);
        break;
      case 'mineCollapsed':
        addDivan(state, -1);
        addByzMorale(state, 1);
        break;
      case 'mineSuccess':
        addDivan(state, 3);
        addByzMorale(state, -3);
        break;
    }
  }
}

// ───────────────────────────── wall damage tracking ─────────────────────────────

function trackDamage(state: GameState, p: ByzPriv): void {
  for (const id in state.sections) {
    const hp = wallHp(state.sections[id]);
    const prev = p.hpPrev[id];
    if (prev != null && hp < prev - 0.01) {
      const dmg = prev - hp;
      p.dmgRecent[id] = (p.dmgRecent[id] ?? 0) + dmg;
      p.dmgToday += dmg;
    }
    p.hpPrev[id] = hp;
  }
}

// ───────────────────────────── defender AI ─────────────────────────────

/** Repair need of a section 0..~2.5 (HP deficit + breach). */
export function repairNeed(s: GameState['sections'][string]): number {
  const max = s.outerMax + s.innerMax;
  if (max <= 0) return 0;
  const deficit = (max - s.outer - s.inner) / max;
  const rb = rawBreach(s);
  // a breach already well stockaded needs less
  const open = Math.max(0, rb - s.barricade * 0.75);
  return deficit + 1.5 * open + (rb > 0.04 && s.barricade < 1 ? 0.05 : 0);
}

/** Target threat 0..100 for each section from what the defenders can see. */
export function computeThreats(state: GameState, p: ByzPriv): Record<SectionId, number> {
  const out: Record<SectionId, number> = {};
  const ids = Object.keys(state.sections);
  for (const id of ids) {
    const s = state.sections[id];
    const max = s.outerMax + s.innerMax || 1;
    const bomb = Math.min(35, ((p.dmgRecent[id] ?? 0) / max) * 350);
    const dmg = rawBreach(s) * 30 + (1 - (s.outer + s.inner) / max) * 15;
    out[id] = bomb + dmg;
  }
  // Ottoman troops near the walls (one pass over groups)
  const R = AI.nearRadius;
  const near: Record<SectionId, number> = {};
  for (const g of state.groups) {
    if (g.men <= 0 || g.status === 'uzakta' || g.status === 'dagildi') continue;
    let best: SectionId | null = null;
    let bd: number = R;
    for (const id of ids) {
      const a = approachOf(id);
      const dd = Math.abs(g.tx - a.tx) + Math.abs(g.ty - a.ty);
      if (dd > R * 1.5) continue;
      const dist = Math.hypot(g.tx - a.tx, g.ty - a.ty);
      if (dist < bd) {
        bd = dist;
        best = id;
      }
    }
    if (best) near[best] = (near[best] ?? 0) + g.men * (1 - bd / R);
    const o = g.order;
    if (o.sectionId && out[o.sectionId] != null) {
      const bonus = o.type === 'hucum' ? 25 : o.type === 'kuleyi-ilerlet' ? 18 : o.type === 'lagim-kaz' ? 8 : o.type === 'hendek-doldur' ? 10 : 0;
      out[o.sectionId] += bonus;
    }
  }
  for (const id in near) out[id] += Math.min(25, near[id] / 120);
  // known mines
  for (const m of state.mines) {
    if (m.detected && (m.status === 'kaziliyor' || m.status === 'hazir') && out[m.sectionId] != null) out[m.sectionId] += 10;
  }
  // ships: Golden Horn / Marmara
  const horn = !!state.flags[FLAG.gemilerKaradan];
  const shipNear: Record<SectionId, number> = {};
  for (const sh of state.ships) {
    if (sh.side !== 'osmanli' || sh.status === 'batik' || sh.status === 'karada') continue;
    for (const id of ids) {
      const s = state.sections[id];
      if (s.kind === 'kara') continue;
      if (s.kind === 'halic' && !horn) continue;
      const a = approachOf(id);
      if (Math.abs(sh.tx - a.tx) + Math.abs(sh.ty - a.ty) < 12) shipNear[id] = (shipNear[id] ?? 0) + 1;
    }
  }
  for (const id of ids) {
    const s = state.sections[id];
    if (s.kind === 'halic') {
      if (horn) out[id] += 22 + Math.min(25, (shipNear[id] ?? 0) * 5);
    } else if (s.kind === 'marmara') {
      out[id] += Math.min(12, (shipNear[id] ?? 0) * 2);
    }
  }
  if (state.flags[FLAG.halicKoprusu]) {
    if (out['halic-balat'] != null) out['halic-balat'] += 15;
    if (out['kara-blahernai'] != null) out['kara-blahernai'] += 8;
  }
  if (state.flags[FLAG.sonHucum]) {
    for (const id of LAND_IDS) if (out[id] != null) out[id] += 10;
    for (const id of GIUSTINIANI_SECTIONS) if (out[id] != null) out[id] += 25;
  }
  for (const id of ids) out[id] = clamp(out[id], 0, 100);
  return out;
}

/** Desired garrison per section given threats. */
export function desiredAllocation(state: GameState): { want: Record<SectionId, number>; reserve: number } {
  const ids = Object.keys(state.sections);
  const total = sumDefenders(state) + state.byz.reserves;
  const scale = Math.min(1.2, total / TOTAL_DEFENDERS);
  let maxThreat = 0;
  for (const id of ids) maxThreat = Math.max(maxThreat, state.sections[id].threat);
  const reserveShare = maxThreat > 50 ? AI.reserveShare * 0.4 : AI.reserveShare;
  const reserve = Math.round(total * reserveShare);
  const want: Record<SectionId, number> = {};
  let floorSum = 0;
  let wSum = 0;
  const w: Record<SectionId, number> = {};
  for (const id of ids) {
    const hist = SECTION_BY_ID[id]?.defenders ?? 200;
    const f = hist * AI.floorShare * scale;
    want[id] = f;
    floorSum += f;
    w[id] = hist * 0.55 + Math.pow(state.sections[id].threat, 1.3) * 3;
    wSum += w[id];
  }
  const pool = Math.max(0, total - reserve - floorSum);
  for (const id of ids) {
    want[id] += (pool * w[id]) / (wSum || 1);
    if (GIUSTINIANI_SECTIONS.includes(id) && giustinianiPresent(state)) {
      want[id] = Math.max(want[id], (SECTION_BY_ID[id]?.defenders ?? 0) * Math.min(1, scale));
    }
  }
  return { want, reserve };
}

function recordMove(p: ByzPriv, from: SectionId | 'yedek', to: SectionId | 'yedek', n: number, day: number): void {
  const last = p.moves[p.moves.length - 1];
  if (last && last.from === from && last.to === to && day - last.day < 0.25) {
    last.n += n;
    last.day = day;
    return;
  }
  p.moves.push({ from, to, n, day });
  if (p.moves.length > 12) p.moves.shift();
}

/** Shift men gradually toward the desired allocation (never teleport large numbers). */
export function reallocate(state: GameState, p: ByzPriv, dtDays: number): void {
  const { want, reserve } = desiredAllocation(state);
  const surge = state.time.day < p.surgeUntil ? AI.surgeMul : 1;
  let budget = Math.floor(AI.movePerDay * dtDays * surge + 0.5);
  if (budget <= 0) return;
  const ids = Object.keys(state.sections);
  for (let guard = 0; guard < 8 && budget > 0; guard++) {
    // biggest deficit
    let dId: SectionId | null = null;
    let dVal = 0;
    for (const id of ids) {
      const def = want[id] - state.sections[id].defenders;
      if (def > Math.max(4, want[id] * 0.03) && def > dVal) {
        dVal = def;
        dId = id;
      }
    }
    // biggest surplus (reserves count first when above their target)
    let sId: SectionId | 'yedek' | null = null;
    let sVal = 0;
    const resSur = state.byz.reserves - reserve;
    if (resSur > 0) {
      sId = 'yedek';
      sVal = resSur;
    }
    for (const id of ids) {
      const sur = state.sections[id].defenders - want[id];
      if (sur > Math.max(4, want[id] * 0.03) && sur > sVal) {
        sVal = sur;
        sId = id;
      }
    }
    if (!sId) break;
    if (!dId) {
      // nothing needed: surplus drifts back to the reserve
      if (sId === 'yedek') break;
      const n = Math.min(budget, Math.floor(sVal * 0.5));
      if (n < 1) break;
      state.sections[sId].defenders -= n;
      state.byz.reserves += n;
      budget -= n;
      recordMove(p, sId, 'yedek', n, state.time.day);
      continue;
    }
    const n = Math.floor(Math.min(budget, dVal, sVal));
    if (n < 1) break;
    if (sId === 'yedek') state.byz.reserves -= n;
    else state.sections[sId].defenders -= n;
    state.sections[dId].defenders += n;
    budget -= n;
    recordMove(p, sId, dId, n, state.time.day);
  }
}

function aiStep(state: GameState, ctx: SimContext, p: ByzPriv, dt: number): void {
  // bombardment memory fades (≈ 0.7-day time constant)
  const decay = Math.exp(-dt / 0.7);
  for (const id in p.dmgRecent) p.dmgRecent[id] *= decay;
  // threat
  const target = computeThreats(state, p);
  const k = Math.min(1, dt * 6);
  for (const id in state.sections) {
    const s = state.sections[id];
    s.threat = s.threat + ((target[id] ?? 0) - s.threat) * k;
  }
  reallocate(state, p, dt);
  // repair crews' distribution (shown by the render)
  updateWork(state, p, dt);
  histEvents(state, ctx, p);
}

// ───────────────────────────── night repairs ─────────────────────────────

/** Nightly repair capacity of the city (HP of effort for a full night). */
export function nightlyCapacity(state: GameState, p: ByzPriv): number {
  const moraleF = 0.3 + 0.7 * (clamp(state.byz.morale, 0, 100) / 100);
  const foodF = state.byz.food > 10 ? 1 : 0.6 + 0.04 * Math.max(0, state.byz.food);
  const diff = DIFFICULTY_REPAIR[state.difficulty] ?? 1;
  return state.byz.repairCrews * REPAIR.perCrew * moraleF * (1 - p.exhaustion) * diff * foodF;
}

function updateWork(state: GameState, p: ByzPriv, dt: number): void {
  const night = segmentOf(state.time.day) === 'gece';
  const w: Record<SectionId, number> = {};
  let sum = 0;
  if (night) {
    for (const id in state.sections) {
      const s = state.sections[id];
      const need = repairNeed(s);
      if (need < 0.015) continue;
      w[id] = need * (1 + s.threat / 50);
      sum += w[id];
    }
  }
  const k = Math.min(1, dt * 30);
  const ids = new Set([...Object.keys(p.work), ...Object.keys(w)]);
  for (const id of ids) {
    let share = sum > 0 && w[id] ? w[id] / sum : 0;
    share = Math.min(REPAIR.maxShare, share);
    const cur = p.work[id] ?? 0;
    const v = night ? cur + (share - cur) * k : cur * (1 - k);
    if (v < 0.005 && share === 0) delete p.work[id];
    else p.work[id] = v;
  }
}

function startNight(state: GameState, ctx: SimContext, p: ByzPriv, nightDay: number): void {
  p.nightOf = nightDay;
  p.repairTonight = {};
  p.usedTonight = 0;
  p.capTonight = 0;
  p.sortiesTonight = 0;
  p.sortieAt = null;
  const day = siegeDayNumber(state.time.day, state.time.siegeStartDay) ?? 0;
  const m = state.byz.morale;
  if (day >= 3 && m >= 35 && !state.flags[FLAG.sonHucum] && !state.flags[FLAG.sonHucumIlan]) {
    const chance = 0.42 * Math.min(1.3, m / 65) * (giustinianiPresent(state) ? 1 : 0.5);
    if (ctx.rng.chance(chance)) p.sortieAt = nightDay + DAY_SEGMENTS.gece[0] + ctx.rng.range(0.03, 0.25);
  }
}

function nightTick(state: GameState, ctx: SimContext, p: ByzPriv): void {
  const nightDay = Math.floor(state.time.day);
  if (p.nightOf !== nightDay) startNight(state, ctx, p, nightDay);
  const frac = ctx.dtDays / NIGHT_LEN;
  const cap = nightlyCapacity(state, p) * frac;
  p.capTonight += cap;
  for (const id in p.work) {
    const share = p.work[id];
    if (share <= 0.002) continue;
    const s = state.sections[id];
    if (!s) continue;
    const soldiers = s.defenders * REPAIR.perSoldier * frac * Math.min(1, share * 4);
    const effort = cap * share + soldiers;
    p.repairPending[id] = (p.repairPending[id] ?? 0) + effort;
    p.usedTonight += cap * share;
  }
  p.repairBatch += ctx.dtDays;
  if (p.repairBatch >= REPAIR.batchDays) flushRepairs(state, ctx, p);
  if (p.sortieAt != null && state.time.day >= p.sortieAt) {
    p.sortieAt = null;
    doSortie(state, ctx, p);
  }
}

function flushRepairs(state: GameState, ctx: SimContext, p: ByzPriv): void {
  p.repairBatch = 0;
  for (const id in p.repairPending) {
    const a = p.repairPending[id];
    if (a > 0.05) {
      repairSection(state, ctx.bus, id, a);
      p.repairTonight[id] = (p.repairTonight[id] ?? 0) + a;
      p.hpPrev[id] = wallHp(state.sections[id]);
    }
  }
  p.repairPending = {};
}

// ───────────────────────────── sorties ─────────────────────────────

const SORTIE_PREFERRED: Partial<Record<UnitGroup['type'], number>> = { lagimci: 3, topcu: 3, azap: 2.5, basibozuk: 2, sipahi: 0.8, yeniceri: 0.2 };

function doSortie(state: GameState, ctx: SimContext, p: ByzPriv): void {
  const rng = ctx.rng;
  const m = state.byz.morale;
  const g0 = giustinianiPresent(state);
  const land = LAND_IDS.filter((id) => state.sections[id]).sort((a, b) => state.sections[b].threat - state.sections[a].threat);
  // 1) a siege tower — Greek fire and torches
  if (state.flags[FLAG.kuleYapildi] && !state.flags[FLAG.kuleYandi]) {
    const success = 0.3 + m / 250 + (g0 ? 0.1 : 0);
    if (rng.chance(success)) {
      for (const id of land.slice(0, 5)) {
        if (state.sections[id].defenders < 120) continue;
        if (burnTower(state, ctx.bus, id)) {
          const at = approachOf(id);
          ctx.bus.emit('sortie', { sectionId: id, at });
          ctx.bus.emit('greekfire', { at });
          applyDefenderLosses(state, ctx.bus, id, rng.int(3, 12));
          p.lastSortie = { sectionId: id, day: state.time.day, tx: at.tx, ty: at.ty, kind: 'kule' };
          p.sortiesTonight++;
          log(state, 'kayip', `Gece baskını! Rumlar ${state.sections[id].name} önündeki kuşatma kulesini Rum ateşiyle tutuşturdu.`);
          notify(ctx.bus, 'Gece baskını: kuşatma kulesi yanıyor!', 'tehlike');
          return;
        }
      }
    }
  }
  // 2) exposed troops / workers in front of the walls
  let best: UnitGroup | null = null;
  let bestScore = 0;
  let bestSec: SectionId | null = null;
  for (const id of land) {
    const s = state.sections[id];
    if (s.defenders < 120) continue;
    const a = approachOf(id);
    for (const g of state.groups) {
      if (g.men <= 0 || g.status === 'uzakta' || g.status === 'dagildi') continue;
      const dist = Math.hypot(g.tx - a.tx, g.ty - a.ty);
      if (dist > 6.5) continue;
      let score = (SORTIE_PREFERRED[g.type] ?? 1) * (1 + (6.5 - dist) / 6.5);
      if (g.status === 'calisiyor') score *= 1.6;
      if (g.order.type === 'hendek-doldur' || g.order.type === 'lagim-kaz' || g.order.type === 'kuleyi-ilerlet') score *= 1.4;
      score *= 600 / (300 + g.men);
      if (score > bestScore) {
        bestScore = score;
        best = g;
        bestSec = id;
      }
    }
  }
  if (!best || !bestSec) return;
  const kill = Math.min(best.men, 70, Math.round(Math.min(best.men, 600) * rng.range(0.05, 0.12) * (0.7 + m / 100)));
  if (kill <= 0) return;
  const at = { tx: best.tx, ty: best.ty };
  ctx.bus.emit('sortie', { sectionId: bestSec, at });
  if (rng.chance(0.3)) ctx.bus.emit('greekfire', { at });
  damageGroup(state, ctx.bus, best.id, kill);
  applyDefenderLosses(state, ctx.bus, bestSec, rng.int(2, 10));
  addDivan(state, -1);
  p.lastSortie = { sectionId: bestSec, day: state.time.day, tx: at.tx, ty: at.ty, kind: 'birlik' };
  p.sortiesTonight++;
  log(state, 'kayip', `Gece baskını! Rumlar bir kapıdan çıkıp ${state.sections[bestSec].name} önündeki ${best.name} birliğine saldırdı: ${kill} kayıp.`, ctx.bus);
}

// ───────────────────────────── historical morale events ─────────────────────────────

/** Events whose morale/food the navy applies itself when no event card exists. */
const NAVY_COVERED = new Set(['deniz-yarildi', 'deniz-durduruldu', 'gemiler-karadan']);

function histEvents(state: GameState, ctx: SimContext, p: ByzPriv): void {
  const day = state.time.day;
  for (const ev of HIST_EVENTS) {
    if (p.done[ev.id] != null) continue;
    let ok = false;
    switch (ev.id) {
      case 'deniz-yarildi':
        ok = state.flags[FLAG.denizSavasi] === 'yarildi';
        break;
      case 'deniz-durduruldu':
        ok = state.flags[FLAG.denizSavasi] === 'durduruldu';
        break;
      case 'gemiler-karadan':
        ok = !!state.flags[FLAG.gemilerKaradan];
        break;
      default:
        ok = ev.day != null && day >= ev.day && inSiege(state);
    }
    if (!ok) continue;
    p.done[ev.id] = day;
    // structural consequences (always ours)
    if (ev.id === 'gemiler-karadan') {
      p.surgeUntil = day + AI.surgeDays;
      addGalata(state, -4);
      log(state, 'casus', 'Casuslar: Rumlar Haliç surlarına asker kaydırıyor; kara surları inceliyor.', ctx.bus);
    }
    if (ev.id === 'deniz-yarildi') {
      log(state, 'casus', 'Gemilerin getirdiği tahıl şehirde ekmek dağıtımını bir süre rahatlatacak.', ctx.bus);
    }
    // morale: the events card (or the navy) applies it when it exists
    if (NAVY_COVERED.has(ev.id) || eventsHandle(ev.eventId)) continue;
    addByzMorale(state, ev.byzMorale);
    log(state, ev.logKind, ev.log, ctx.bus);
  }
}

// ───────────────────────────── final assault: Giustiniani ─────────────────────────────

function finalAssault(state: GameState, ctx: SimContext, p: ByzPriv): void {
  if (!giustinianiPresent(state)) {
    if (p.panic > 0) p.panic = Math.max(0, p.panic - ctx.dtDays * 0.5);
    return;
  }
  const wave3 = !!state.flags[FLAG.sonHucum] && Number(state.flags[FLAG.hucumDalgasi] ?? 0) >= 3;
  if (wave3 && p.woundAt == null) p.woundAt = state.time.day + ctx.rng.range(0.012, 0.035);
  if (p.woundAt != null && state.time.day >= p.woundAt) woundGiustiniani(state, ctx, p);
}

export function woundGiustiniani(state: GameState, ctx: SimContext, p: ByzPriv): void {
  if (!giustinianiPresent(state)) return;
  state.byz.giustinianiWounded = true;
  state.flags[FLAG.giustinianiYarali] = true;
  p.done['giustiniani'] = state.time.day;
  p.panic = 1;
  // his Genoese carry him to the harbour and many follow him off the walls
  let left = 0;
  for (const id of GIUSTINIANI_SECTIONS) {
    const s = state.sections[id];
    if (!s) continue;
    const n = Math.round(s.defenders * 0.3);
    s.defenders -= n;
    left += n;
  }
  addByzMorale(state, -12);
  if (!eventsHandle('k19-giustiniani')) addByzMorale(state, -15);
  addDivan(state, 10);
  log(state, 'basari', `Giustiniani ağır yaralandı ve gemisine taşındı! Ardından ≈${Math.round(left / 50) * 50} Cenevizli surları bırakıyor; Mesoteikhion’da savunma çözülüyor.`);
  notify(ctx.bus, 'Giustiniani yaralandı! Lykos’ta savunma çözülüyor.', 'basari');
  const at = approachOf('kara-lykos');
  ctx.bus.emit('camera:shake', { intensity: 0.25, duration: 0.6 });
  void at;
}

function emperorFate(state: GameState, ctx: SimContext, p: ByzPriv): void {
  if (!state.byz.emperorAlive && p.emperorFateLogged) return;
  state.byz.emperorAlive = false;
  state.byz.morale = 0;
  if (!p.emperorFateLogged) {
    p.emperorFateLogged = true;
    log(state, 'olay', 'Son imparator XI. Konstantinos Palaiologos’un Topkapı yakınlarında savaşırken düştüğü söyleniyor; cesedi kesin olarak teşhis edilemedi.', ctx.bus);
  }
}

// ───────────────────────────── Divan defeat (Yenilgi 2) ─────────────────────────────

export function divanConditions(state: GameState): boolean {
  let ed = Infinity;
  try {
    ed = erzakDays(state);
  } catch {
    ed = Infinity;
  }
  return state.morale < DIVAN.moraleMax && ed < DIVAN.erzakDaysMax && state.divan < DIVAN.divanMax;
}

function divanCheck(state: GameState, ctx: SimContext, p: ByzPriv): void {
  if (state.outcome) return;
  if (divanConditions(state)) {
    p.divanCrisis += ctx.dtDays;
    if (!p.divanWarned) {
      p.divanWarned = true;
      log(state, 'kayip', 'Ordu çözülüyor: moral ve erzak tükendi, Divan’da barış yanlıları üstün. Hemen toparlanmazsak kuşatma kaldırılacak!');
      notify(ctx.bus, 'Divan kuşatmayı kaldırmak üzere! Moral, erzak ve Divan dengesini düzelt.', 'tehlike');
    }
  } else {
    p.divanCrisis = Math.max(0, p.divanCrisis - ctx.dtDays * 2);
    if (p.divanCrisis === 0) p.divanWarned = false;
  }
  if (p.divanCrisis >= DIVAN.crisisDays) {
    state.outcome = { result: 'yenilgi-divan', day: state.time.day, siegeDays: siegeDayNumber(state.time.day, state.time.siegeStartDay) };
    log(state, 'kayip', 'Halil Paşa’nın kanadı Divan’a hâkim oldu; Sultan kuşatmayı kaldırmak zorunda kaldı. Ordu Edirne yoluna düştü.');
    notify(ctx.bus, 'Divan kararıyla kuşatma kaldırıldı.', 'tehlike');
  }
}

// ───────────────────────────── daily (dawn) update ─────────────────────────────

function daily(state: GameState, ctx: SimContext, p: ByzPriv, day: number): void {
  const rng = ctx.rng;
  const siege = state.time.phase === 'kusatma';
  // night ends at dawn: book-keep repairs & exhaustion
  if (p.nightOf != null) {
    flushRepairs(state, ctx, p);
    p.repairLastNight = p.repairTonight;
    p.repairTonight = {};
    const use = p.capTonight > 0 ? clamp(p.usedTonight / p.capTonight, 0, 1) : 0;
    p.exhaustion = clamp(p.exhaustion + REPAIR.exhaustGain * use, 0, REPAIR.exhaustMax);
    p.nightOf = null;
    p.usedTonight = 0;
    p.capTonight = 0;
    if (siege) repairReport(state, ctx, p);
  }
  p.exhaustion = clamp(p.exhaustion - REPAIR.exhaustRecover, 0, REPAIR.exhaustMax);

  // naval blockade memory (for the relief modifier)
  if (siege) {
    let b = 0;
    try {
      b = blockadeStrength(state);
    } catch {
      b = 0;
    }
    p.blockadeEma += (b - p.blockadeEma) * 0.25;
  }

  if (siege) {
    dailyFood(state, ctx, p, day);
    dailyMorale(state, p);
    dailyDivan(state);
    dailyGalata(state, ctx);
    dailyIntel(state, ctx, p, day);
  } else if (state.flags[FLAG.bogazKontrol] && state.byz.food > 70) {
    // Black Sea grain no longer passes Boğazkesen
    state.byz.food = Math.max(70, state.byz.food - 0.05);
  }
  updateRelief(state, p);
  p.dmgToday = 0;
  p.breachToday = 0;
  void rng;
}

function repairReport(state: GameState, ctx: SimContext, p: ByzPriv): void {
  // only worth a line when a real breach was plugged, and not every single dawn
  const day = Math.floor(state.time.day);
  const top = Object.entries(p.repairLastNight)
    .filter(([id, v]) => v > 60 && rawBreach(state.sections[id]) > 0.3 && day - (p.repLog[id] ?? -99) >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([id]) => state.sections[id]?.name)
    .filter(Boolean);
  if (!top.length) return;
  for (const [id] of Object.entries(p.repairLastNight).filter(([, v]) => v > 60)) p.repLog[id] = day;
  const txt =
    top.length === 1
      ? `Rumlar gece boyunca ${top[0]} kesimindeki gedikleri kazık, fıçı ve toprak çuvallarıyla kapattı.`
      : `Rumlar gece boyunca ${top[0]} ve ${top[1]} kesimlerini onardı; gedikler barikatla kapatıldı.`;
  log(state, 'uyari', txt, ctx.bus);
}

function dailyFood(state: GameState, ctx: SimContext, p: ByzPriv, day: number): void {
  const b = state.byz;
  let rate = 1 + 0.45 * p.blockadeEma + (state.flags[FLAG.bogazKontrol] ? 0.1 : 0);
  const yarildi = p.done['deniz-yarildi'];
  if (yarildi != null && day - yarildi < 12) rate *= 0.8; // Genoese grain from the 20 Nisan ships
  b.food = Math.max(0, b.food - rate);
  if (b.food <= 0) {
    p.famineDays++;
    // hunger: men slip away to feed their families
    const desert = Math.max(1, Math.round(sumDefenders(state) * 0.008));
    let left = desert;
    const fromRes = Math.min(state.byz.reserves, left);
    state.byz.reserves -= fromRes;
    left -= fromRes;
    if (left > 0) {
      const big = Object.values(state.sections).sort((a, c) => c.defenders - a.defenders)[0];
      if (big) big.defenders = Math.max(0, big.defenders - left);
    }
    b.repairCrews = Math.max(400, Math.round(b.repairCrews * 0.985));
    p.exhaustion = clamp(p.exhaustion + 0.02, 0, REPAIR.exhaustMax);
    if (p.famineDays === 1) log(state, 'casus', 'Kaçaklar şehirde kıtlık başladığını söylüyor; surlarda nöbet tutanlar azalıyor.', ctx.bus);
  }
}

function dailyMorale(state: GameState, p: ByzPriv): void {
  const b = state.byz;
  let dm = 0;
  if (b.food <= 0) dm -= 4;
  else if (b.food < 10) dm -= 1.8;
  else if (b.food < 25) dm -= 0.7;
  // the daily dread of the guns
  dm -= Math.min(2, p.dmgToday / 600);
  dm -= Math.min(6, p.lossAcc / 120);
  p.lossAcc = 0;
  let breached = 0;
  for (const id in state.sections) if (state.sections[id].breach >= 0.5) breached++;
  dm -= Math.min(1.5, breached * 0.5);
  if (p.dmgToday < 50 && breached === 0 && b.morale < 72) dm += 0.8;
  if (p.exhaustion > 0.3) dm -= 0.3;
  // resilience: priests, the Emperor and Giustiniani rally the city back toward a steady mood
  const steady = giustinianiPresent(state) ? 50 : 30;
  if (b.morale < steady) dm += (steady - b.morale) * 0.03;
  addByzMorale(state, dm);
}

function dailyDivan(state: GameState): void {
  let dv = 0;
  if (state.morale < 40) dv -= (40 - state.morale) / 15;
  let ed = Infinity;
  try {
    ed = erzakDays(state);
  } catch {
    ed = Infinity;
  }
  if (ed < 4) dv -= 2;
  else if (ed < 10) dv -= 1;
  const sd = siegeDayNumber(state.time.day, state.time.siegeStartDay) ?? 0;
  if (sd > 50) dv -= 1.2;
  else if (sd > 40) dv -= 0.6;
  if (state.time.day >= state.relief.knownMin - 7) dv -= 1.2;
  let breach = false;
  for (const id in state.sections) if (state.sections[id].breach >= 0.5) breach = true;
  if (breach) dv += 1;
  if (state.byz.morale < 30) dv += 0.8;
  dv += (0 - state.divan) * 0.015;
  addDivan(state, dv);
}

function dailyGalata(state: GameState, ctx: SimContext): void {
  const rng = ctx.rng;
  state.galata = clamp(state.galata * 0.985, -100, 100);
  const r = rng.next();
  if (r < 0.1) {
    addGalata(state, rng.int(2, 5));
    log(state, 'bilgi', rng.pick(GALATA_LINES.ticaret), ctx.bus);
  } else if (r < 0.17) {
    addGalata(state, -rng.int(3, 7));
    log(state, 'uyari', rng.pick(GALATA_LINES.olay), ctx.bus);
  }
}

function dailyIntel(state: GameState, ctx: SimContext, p: ByzPriv, day: number): void {
  const rng = ctx.rng;
  const b = state.byz;
  if (b.intel > 25) b.intel = Math.max(25, b.intel - 0.15);
  if (day >= p.intelNext) {
    const pDes = clamp(0.3 + (60 - b.morale) / 150 + (b.food < 30 ? 0.15 : 0), 0.1, 0.85);
    const pSpy = clamp(0.2 + state.galata / 300, 0.05, 0.6);
    if (rng.chance(pDes)) {
      b.intel = clamp(b.intel + rng.int(2, 5), 0, 100);
      log(state, 'casus', deserterLine(state, rng), ctx.bus);
      p.intelNext = day + 1;
    } else if (rng.chance(pSpy)) {
      b.intel = clamp(b.intel + rng.int(1, 3), 0, 100);
      const pool = [...INTEL_LINES.casusOnarim, ...INTEL_LINES.casusYardim, ...(state.flags[FLAG.lagimBasladi] ? INTEL_LINES.casusGrant : [])];
      log(state, 'casus', rng.pick(pool), ctx.bus);
      p.intelNext = day + 1;
    }
  }
  // the estimate converges on the truth as intel grows
  const noise = 0.3 * (1 - b.intel / 100);
  const target = b.defenders * (1 + rng.range(-noise, noise));
  const k = 0.15 + b.intel / 250;
  b.estimatedDefenders = Math.max(500, Math.round((b.estimatedDefenders + (target - b.estimatedDefenders) * k) / 50) * 50);
}

function deserterLine(state: GameState, rng: SimContext['rng']): string {
  const b = state.byz;
  const r = rng.next();
  if (b.food < 30 && r < 0.35) return rng.pick(INTEL_LINES.kacakAclik);
  if (r < 0.6) {
    const noise = 0.25 * (1 - b.intel / 100);
    const n = Math.round((b.defenders * (1 + rng.range(-noise, noise))) / 100) * 100;
    return fill(rng.pick(INTEL_LINES.kacakSayi), { n: n.toLocaleString('tr-TR') });
  }
  if (r < 0.8) {
    const top = Object.values(state.sections).sort((a, c) => c.threat - a.threat)[0];
    if (top) return fill(rng.pick(INTEL_LINES.kacakKesim), { s: top.name });
  }
  return rng.pick(INTEL_LINES.kacakMoral);
}

// ───────────────────────────── commands ─────────────────────────────

/**
 * Feature commands ({t:'ozel', feature:'byzantium', action}):
 *  - 'casus'  : send spies into the city (400 akçe) → intel +6..10.
 *  - 'galata-hediye' : gifts to the Galata podestà (600 akçe) → Galata relation +8, intel +2.
 */
export function handleCommand(state: GameState, cmd: Command, ctx: SimContext): boolean {
  if (cmd.t !== 'ozel' || cmd.feature !== 'byzantium') return false;
  if (cmd.action === 'casus') {
    if (state.resources.akce < 400) {
      notify(ctx.bus, 'Casus göndermek için 400 akçe gerekli.', 'uyari');
      return true;
    }
    state.resources.akce -= 400;
    const g = ctx.rng.int(6, 10) + Math.max(0, Math.round(state.galata / 25));
    state.byz.intel = clamp(state.byz.intel + g, 0, 100);
    log(state, 'casus', 'Rum kılığına girmiş casuslar şehre sızdı; surların ardından haber getirecekler.', ctx.bus);
    updateRelief(state, byzPriv(state));
    return true;
  }
  if (cmd.action === 'galata-hediye') {
    if (state.resources.akce < 600) {
      notify(ctx.bus, 'Galata’ya hediye için 600 akçe gerekli.', 'uyari');
      return true;
    }
    state.resources.akce -= 600;
    addGalata(state, 8);
    state.byz.intel = clamp(state.byz.intel + 2, 0, 100);
    log(state, 'bilgi', 'Galata podestasına hediyeler gönderildi; Cenevizliler tarafsız kalacaklarına söz verdi.', ctx.bus);
    return true;
  }
  return false;
}

// ───────────────────────────── scenarios ─────────────────────────────

interface ScenarioByz {
  morale: number;
  food: number;
  intel: number;
  exhaustion?: number;
  galata?: number;
  divan?: number;
  /** Section → defenders (moved from reserves / quiet sections). */
  men?: Record<SectionId, number>;
  dmgRecent?: Record<SectionId, number>;
  threat?: Record<SectionId, number>;
  work?: Record<SectionId, number>;
}

const SCENARIO_BYZ: Partial<Record<ScenarioName, ScenarioByz>> = {
  'kusatma-gun1': { morale: 63, food: 108, intel: 12 },
  bombardiman: {
    morale: 58,
    food: 100,
    intel: 18,
    men: { 'kara-lykos': 1080, 'kara-topkapi': 900 },
    dmgRecent: { 'kara-lykos': 420, 'kara-topkapi': 300, 'kara-edirnekapi': 140 },
    threat: { 'kara-lykos': 72, 'kara-topkapi': 58, 'kara-edirnekapi': 34 },
  },
  'gece-onarim': {
    morale: 57,
    food: 99,
    intel: 18,
    exhaustion: 0.08,
    men: { 'kara-lykos': 1120, 'kara-topkapi': 930, 'kara-edirnekapi': 540 },
    dmgRecent: { 'kara-lykos': 480, 'kara-topkapi': 340, 'kara-edirnekapi': 160 },
    threat: { 'kara-lykos': 78, 'kara-topkapi': 62, 'kara-edirnekapi': 38 },
    work: { 'kara-lykos': 0.5, 'kara-topkapi': 0.3, 'kara-edirnekapi': 0.14, 'kara-blahernai': 0.06 },
  },
  'deniz-savasi': { morale: 55, food: 96, intel: 20, exhaustion: 0.1 },
  'gemiler-karadan': { morale: 60, food: 97, intel: 22, exhaustion: 0.12, men: { 'halic-balat': 380, 'halic-fener': 360 } },
  lagim: {
    morale: 46,
    food: 62,
    intel: 36,
    exhaustion: 0.26,
    galata: 6,
    men: { 'kara-lykos': 1250, 'kara-topkapi': 980, 'halic-balat': 420, 'halic-fener': 400, 'halic-eminonu': 300 },
    threat: { 'kara-lykos': 70, 'kara-topkapi': 60, 'kara-egrikapi': 40, 'halic-balat': 45 },
  },
  kule: {
    morale: 44,
    food: 60,
    intel: 38,
    exhaustion: 0.28,
    men: { 'kara-lykos': 1260, 'kara-topkapi': 1000, 'halic-balat': 420, 'halic-fener': 400 },
    threat: { 'kara-lykos': 72, 'kara-topkapi': 66, 'halic-balat': 45 },
  },
  'son-hucum': {
    morale: 38,
    food: 42,
    intel: 48,
    exhaustion: 0.36,
    divan: 25,
    men: {
      'kara-lykos': 1550,
      'kara-topkapi': 1150,
      'kara-edirnekapi': 420,
      'kara-blahernai': 480,
      'kara-egrikapi': 360,
      'kara-mevlevihane': 320,
      'kara-silivrikapi': 240,
      'kara-belgradkapi': 200,
      'kara-yedikule': 200,
      'halic-balat': 330,
      'halic-fener': 300,
      'halic-eminonu': 200,
      'marmara-akropolis': 120,
      'marmara-kumkapi': 120,
      'marmara-yenikapi': 150,
      'marmara-samatya': 120,
    },
    threat: { 'kara-lykos': 100, 'kara-topkapi': 92, 'kara-edirnekapi': 55, 'kara-blahernai': 50, 'halic-balat': 48 },
    work: { 'kara-lykos': 0.45, 'kara-topkapi': 0.35 },
  },
  zafer: { morale: 0, food: 38, intel: 60 },
  yenilgi: { morale: 70, food: 55, intel: 50, exhaustion: 0.2, galata: -10, divan: -20 },
};

export function applyScenario(name: ScenarioName, state: GameState): void {
  const p = byzPriv(state);
  const day = state.time.day;
  p.lastDay = Math.floor(day);
  p.nightOf = null;
  // historical events before the scenario date have already happened (no double morale)
  for (const ev of HIST_EVENTS) {
    const flagged =
      (ev.id === 'deniz-yarildi' && state.flags[FLAG.denizSavasi] === 'yarildi') ||
      (ev.id === 'deniz-durduruldu' && state.flags[FLAG.denizSavasi] === 'durduruldu') ||
      (ev.id === 'gemiler-karadan' && !!state.flags[FLAG.gemilerKaradan]);
    if (flagged || (ev.day != null && ev.day <= day)) p.done[ev.id] = Math.min(day, ev.day ?? day);
  }
  // historical 20 Nisan result once the scenario is past it
  if (day > d(21, 4, 1453) && state.flags[FLAG.denizSavasi] == null && name !== 'deniz-savasi') p.done['deniz-yarildi'] = d(20, 4, 1453);
  const cfg = SCENARIO_BYZ[name];
  if (cfg) {
    const b = state.byz;
    b.morale = cfg.morale;
    b.food = cfg.food;
    b.intel = cfg.intel;
    p.exhaustion = cfg.exhaustion ?? 0;
    if (cfg.galata != null) state.galata = cfg.galata;
    if (cfg.divan != null) state.divan = cfg.divan;
    if (cfg.men) {
      // move men: the pool is everyone (sections + reserves); listed sections get their number
      const total = sumDefenders(state) + b.reserves;
      for (const [id, n] of Object.entries(cfg.men)) if (state.sections[id]) state.sections[id].defenders = n;
      const listed = sumDefenders(state);
      const over = listed + Math.round(total * 0.03) - total;
      if (over > 0) {
        // take the excess from unlisted sections, proportionally
        const un = Object.values(state.sections).filter((s) => cfg.men![s.id] == null);
        const unSum = un.reduce((a, s) => a + s.defenders, 0) || 1;
        for (const s of un) s.defenders = Math.max(60, Math.round(s.defenders - (over * s.defenders) / unSum));
      }
      b.reserves = Math.max(0, total - sumDefenders(state));
    }
    if (name === 'son-hucum') {
      // the city is exhausted: ≈ 4,900 fighting men left after 53 days
      const scale = 4900 / Math.max(1, sumDefenders(state) + b.reserves);
      if (scale < 1) {
        for (const s of Object.values(state.sections)) s.defenders = Math.round(s.defenders * scale);
        b.reserves = Math.round(b.reserves * scale);
      }
      b.repairCrews = 1500;
      state.stats.byzantineLosses = Math.max(state.stats.byzantineLosses, 2100);
    }
    for (const [id, v] of Object.entries(cfg.dmgRecent ?? {})) p.dmgRecent[id] = v;
    for (const [id, v] of Object.entries(cfg.threat ?? {})) if (state.sections[id]) state.sections[id].threat = v;
    for (const [id, v] of Object.entries(cfg.work ?? {})) p.work[id] = v;
    b.estimatedDefenders = Math.round((sumDefenders(state) + b.reserves) * (1 + (1 - b.intel / 100) * 0.25) / 50) * 50;
  }
  if (name === 'zafer') {
    state.byz.emperorAlive = false;
    state.byz.giustinianiWounded = true;
    state.flags[FLAG.giustinianiYarali] = true;
    p.emperorFateLogged = true;
    p.done['giustiniani'] = d(29, 5, 1453) + 0.1;
  }
  if (name === 'son-hucum') {
    // Giustiniani still holds the stockade — he is about to be struck.
    p.woundAt = day + 0.02;
  }
  if (name === 'gece-onarim' || name === 'son-hucum') {
    p.nightOf = Math.floor(day);
  }
  syncTotals(state);
  // fortifications applies the scenario's wall damage after us: start damage tracking fresh
  p.hpPrev = {};
  // relief estimate reflects the scenario's intel
  if (name === 'yenilgi') {
    const r = state.relief;
    r.arrival = Math.floor(day) - 0.5;
    r.knownMin = Math.floor(day) - 6;
    r.knownMax = Math.floor(day) + 4;
    r.arrived = true;
    r.notes = [...p.myNotes];
  } else {
    updateRelief(state, p, true);
    // a scenario set after the hidden date would end at once: push the relief past it
    if (state.time.phase === 'kusatma' && state.relief.arrival <= day + 3) {
      const shift = Math.ceil(day + 8 - state.relief.arrival);
      state.relief.arrival += shift;
      updateRelief(state, p, true);
    }
  }
}
