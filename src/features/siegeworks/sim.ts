import type { Bus } from '../../core/bus';
import { formatDate, segmentOf } from '../../core/calendar';
import type { Command } from '../../core/commands';
import type { ScenarioName, SimContext } from '../../core/feature';
import { FLAG } from '../../core/flags';
import { addLog, nextId, type GameState, type LogKind, type Mine, type SectionId, type UnitGroup } from '../../core/state';
import type { WorldApi } from '../../core/world';
import { SECTION_BY_ID } from '../../data/sections';
import { damageGroup } from '../army/api-core';
import { applyDefenderLosses, counterMineSkill } from '../byzantium/api';
import { canAfford, costText, missingText, spend } from '../economy/api';
import { damageSection, sectionAt } from '../fortifications/api';
import {
  AMELE_FACTOR,
  AMELE_MAX,
  COUNTER_DAYS,
  COUNTER_FATE,
  FILL_CASUALTY,
  FILL_CLEAR,
  FILL_CREW_REF,
  FILL_KERESTE,
  FILL_NIGHT,
  FILL_NO_KERESTE,
  FILL_RATE,
  FILL_TYPE,
  MANTLET_EACH,
  MANTLET_MAX,
  MANTLET_RANGE,
  MINE_AUTOFIRE_DAYS,
  MINE_CREW_REF,
  MINE_DAMAGE,
  MINE_DAYS,
  MINE_DETECT_BASE,
  MINE_DETECT_MOAT,
  MINE_DETECT_PROG,
  MINE_DIST,
  MINE_FIRE_DAYS,
  MINE_MOAT_SLOW,
  MINE_PER_GROUP,
  MINE_WRECK_DAYS,
  TOWER_BUILD_DAYS,
  TOWER_BURN_DAYS,
  TOWER_COST,
  TOWER_CREW,
  TOWER_MAX,
  TOWER_MOAT_NEED,
  TOWER_MOAT_STOP,
  TOWER_PUSH_REF,
  TOWER_SPEED,
  TOWER_START,
  TOWER_WALL,
  TOWER_WRECK_DAYS,
  type MineFate,
} from './data';
import { clamp01, frontPos, hasMoat, isLand, nearestT, tunnelPoint } from './geo';
import { moatSite, sw, type MineExtra, type TowerState } from './state';

/**
 * SIEGEWORKS SIMULATION (pure, deterministic — ctx.rng only).
 * Moat filling, mines & counter-mines, the siege tower.
 */

const FEATURE = 'siegeworks';

// ───────────────────────────── helpers ─────────────────────────────

function log(state: GameState, kind: LogKind, text: string, bus?: Bus): void {
  addLog(state, kind, text);
  bus?.emit('log', { day: state.time.day, kind, text });
}

function notify(bus: Bus, text: string, kind: 'bilgi' | 'uyari' | 'basari' | 'tehlike'): void {
  bus.emit('notify', { text, kind });
}

/** Warn at most once per `days` per key. */
function warnOnce(state: GameState, bus: Bus, key: string, days: number, text: string, kind: 'bilgi' | 'uyari' | 'tehlike' = 'uyari'): void {
  const s = sw(state);
  const last = s.warned[key];
  if (last != null && state.time.day - last < days) return;
  s.warned[key] = state.time.day;
  notify(bus, text, kind);
}

function isNightNow(state: GameState): boolean {
  return segmentOf(state.time.day) === 'gece';
}

function sectionName(state: GameState, id: SectionId): string {
  return state.sections[id]?.name ?? SECTION_BY_ID[id]?.name ?? id;
}

/** Archer suppression of the section (army keeps it in its private state). 0..~0.55 */
export function archerCover(state: GameState, sectionId: SectionId): number {
  const a = state.features['army'] as { cover?: Record<string, number> } | undefined;
  const v = a?.cover?.[sectionId];
  return typeof v === 'number' && isFinite(v) ? Math.max(0, Math.min(0.8, v)) : 0;
}

/** Per-state cache of siper counts per section (recomputed when the buildings change or each game hour). */
const mantletCache = new WeakMap<GameState, { key: string; per: Record<SectionId, number> }>();

/** Mantlet (siper) cover in front of a section 0..MANTLET_MAX (finished siper buildings). */
export function mantletCoverOf(state: GameState, sectionId: SectionId): number {
  let built = 0;
  for (const b of state.buildings) if (b.type === 'siper' && b.built && b.hp > 0) built++;
  const key = `${state.buildings.length}:${built}:${Math.floor(state.time.day * 24)}`;
  let c = mantletCache.get(state);
  if (!c || c.key !== key) {
    const per: Record<SectionId, number> = {};
    for (const b of state.buildings) {
      if (b.type !== 'siper' || !b.built || b.hp <= 0) continue;
      const sid = sectionAt(b.tx + 0.5, b.ty, MANTLET_RANGE);
      if (sid) per[sid] = (per[sid] ?? 0) + 1;
    }
    c = { key, per };
    mantletCache.set(state, c);
  }
  return Math.min(MANTLET_MAX, (c.per[sectionId] ?? 0) * MANTLET_EACH);
}

/** Byzantine fire on the section 0..1 (defenders, minus cover). */
function exposure(state: GameState, sectionId: SectionId): number {
  const sec = state.sections[sectionId];
  if (!sec) return 0;
  const def = Math.min(1, sec.defenders / 700);
  const moraleF = 0.6 + 0.4 * Math.min(1, state.byz.morale / 80);
  return def * moraleF * (1 - archerCover(state, sectionId)) * (1 - mantletCoverOf(state, sectionId));
}

/** Spread casualties over groups with fractional accumulators. */
function bleed(state: GameState, bus: Bus, g: UnitGroup, men: number): void {
  const s = sw(state);
  const acc = (s.cas[g.id] ?? 0) + men;
  const whole = Math.floor(acc);
  s.cas[g.id] = acc - whole;
  if (whole > 0) damageGroup(state, bus, g.id, whole);
}

function working(state: GameState, type: UnitGroup['order']['type'], sectionId?: SectionId): UnitGroup[] {
  return state.groups.filter(
    (g) => g.status === 'calisiyor' && g.men > 0 && g.order.type === type && (sectionId == null || g.order.sectionId === sectionId),
  );
}

// ───────────────────────────── init ─────────────────────────────

export function initSiegeworks(state: GameState): void {
  sw(state);
}

// ───────────────────────────── tick ─────────────────────────────

export function tickSiegeworks(state: GameState, ctx: SimContext): void {
  if (state.time.phase !== 'kusatma' || state.outcome) return;
  if (state.flags[FLAG.sehirDustu]) return;
  tickMoat(state, ctx);
  tickMines(state, ctx);
  tickTowers(state, ctx);
}

// ───────────────────────────── moat filling ─────────────────────────────

function tickMoat(state: GameState, ctx: SimContext): void {
  const s = sw(state);
  const night = isNightNow(state);
  const groups = working(state, 'hendek-doldur');
  const bySec = new Map<SectionId, UnitGroup[]>();
  for (const g of groups) {
    const sid = g.order.sectionId!;
    if (!hasMoat(sid)) continue;
    let arr = bySec.get(sid);
    if (!arr) bySec.set(sid, (arr = []));
    arr.push(g);
  }
  for (const sid of Object.keys(s.moat)) if (!bySec.has(sid)) bySec.set(sid, []);

  for (const [sid, gs] of bySec) {
    const sec = state.sections[sid];
    if (!sec) continue;
    const site = moatSite(state, sid);
    let eff = 0;
    for (const g of gs) eff += g.men * (FILL_TYPE[g.type] ?? 0.6) * (0.75 + 0.25 * Math.min(1, g.morale / 70)) * (1 - 0.4 * Math.min(1, g.fatigue / 100));
    eff += site.amele * AMELE_FACTOR;
    site.men = eff;
    if (gs.length) {
      // the crews work where the groups stand
      let wt = 0;
      let ws = 0;
      for (const g of gs) {
        const q = nearestT(sid, g.tx, g.ty);
        wt += q.t * g.men;
        ws += g.men;
      }
      if (ws > 0) site.t = site.t + (wt / ws - site.t) * Math.min(1, ctx.dtDays * 4);
    }

    const exp = exposure(state, sid);
    if (eff <= 0.5) {
      // nobody at work: the defenders creep out at night and clear the fill
      if (night && sec.moatFill > 0 && sec.defenders > 150) {
        const clear = FILL_CLEAR * Math.min(1, sec.defenders / 600) * (0.5 + 0.5 * Math.min(1, state.byz.morale / 70)) * ctx.dtDays;
        sec.moatFill = Math.max(0, sec.moatFill - clear);
      }
      continue;
    }
    if (sec.moatFill >= 1) {
      sec.moatFill = 1;
      warnOnce(state, ctx.bus, 'dolu:' + sid, 3, `${sectionName(state, sid)} önündeki hendek dolduruldu.`, 'bilgi');
      continue;
    }
    // progress
    const crew = (2 * eff) / (eff + FILL_CREW_REF);
    const nightF = night ? FILL_NIGHT : 1;
    const fireF = 1 - 0.45 * exp;
    const kerNeed = FILL_KERESTE;
    let kerF = 1;
    let dFill = FILL_RATE * crew * nightF * fireF * ctx.dtDays;
    const kerUse = dFill * kerNeed;
    if (state.resources.kereste >= kerUse) state.resources.kereste -= kerUse;
    else {
      kerF = FILL_NO_KERESTE;
      warnOnce(state, ctx.bus, 'kereste-hendek', 2, 'Hendek için kereste kalmadı; adamlar yalnızca toprak ve taş atıyor.');
    }
    dFill *= kerF;
    const before = sec.moatFill;
    sec.moatFill = Math.min(1, sec.moatFill + dFill);
    site.dumped += sec.moatFill - before;
    if (before < 0.6 && sec.moatFill >= 0.6) {
      log(state, 'basari', `${sectionName(state, sid)} önündeki hendek büyük ölçüde dolduruldu; kule ve merdivenler artık surların dibine ulaşabilir.`, ctx.bus);
      notify(ctx.bus, 'Hendek dolduruldu: kule ilerleyebilir.', 'basari');
    }
    // casualties from arrows and handguns
    const lossPerDay = FILL_CASUALTY * exp * (night ? 0.45 : 1);
    for (const g of gs) {
      const share = g.men * (FILL_TYPE[g.type] ?? 0.6);
      bleed(state, ctx.bus, g, share * lossPerDay * ctx.dtDays);
    }
    if (site.amele > 0) {
      site.ameleCas += site.amele * lossPerDay * 1.15 * ctx.dtDays;
      const lost = Math.floor(site.ameleCas);
      if (lost > 0) {
        site.ameleCas -= lost;
        site.amele = Math.max(0, site.amele - lost);
        state.stats.ottomanLosses += lost;
      }
    }
    // arrow volleys for the render/audio (defenders shoot at the carriers)
    site.volley -= ctx.dtSec;
    if (site.volley <= 0) {
      site.volley = ctx.rng.range(4, 10) / Math.max(0.25, exp + 0.15);
      if (exp > 0.08 && sec.defenders > 60) {
        const from = frontPos(sid, site.t + ctx.rng.range(-0.08, 0.08), 0.2);
        const to = frontPos(sid, site.t + ctx.rng.range(-0.06, 0.06), ctx.rng.range(2.2, 3.4));
        ctx.bus.emit('arrows:volley', { from, to, count: Math.max(3, Math.round(4 + 10 * exp)), side: 'bizans' });
      }
    }
  }
}

/** Lend workforce amele to a section's moat (0 = send them back). */
export function setAmele(state: GameState, bus: Bus, sectionId: SectionId, workers: number): string | null {
  if (state.time.phase !== 'kusatma') return 'Kuşatma başlamadı.';
  if (!isLand(sectionId) || !hasMoat(sectionId)) return 'Bu kesimde hendek yok.';
  const site = moatSite(state, sectionId);
  const want = Math.max(0, Math.min(AMELE_MAX, Math.round(workers)));
  const free = Math.max(0, state.workforce.total - state.workforce.assigned);
  const delta = want - site.amele;
  if (delta > 0) {
    const take = Math.min(delta, free);
    if (take <= 0) return 'Boşta amele yok.';
    state.workforce.total -= take;
    site.amele += take;
  } else if (delta < 0) {
    state.workforce.total += -delta;
    site.amele += delta;
  }
  if (site.amele > 0) log(state, 'bilgi', `${site.amele} amele ${sectionName(state, sectionId)} önündeki hendeği doldurmaya gönderildi.`, bus);
  return null;
}

// ───────────────────────────── mines ─────────────────────────────

export function mineX(state: GameState, m: Mine): MineExtra {
  const s = sw(state);
  let x = s.mineX[m.id];
  if (!x) {
    const q = nearestT(m.sectionId, m.tx, m.ty);
    x = {
      t: q.t,
      length: Math.max(2, q.dist),
      startDay: state.time.day,
      counter: -1,
      counterDays: 0.8,
      fate: null,
      fateDay: state.time.day,
      readyDay: -1,
      fireDay: -1,
      cas: 0,
    };
    s.mineX[m.id] = x;
  }
  return x;
}

export function activeMine(m: Mine): boolean {
  return m.status === 'kaziliyor' || m.status === 'hazir' || m.status === 'atesl';
}

/** Can this group start a tunnel at this section? null = yes, else a Turkish reason. */
export function mineCheck(state: GameState, sectionId: SectionId, g: UnitGroup | undefined): string | null {
  if (state.time.phase !== 'kusatma') return 'Kuşatma başlamadı.';
  if (!isLand(sectionId)) return 'Yalnızca kara surlarının altına lağım kazılır.';
  if (!g) return 'Lağımcı birliği yok.';
  if (g.type !== 'lagimci') return 'Lağımı yalnızca lağımcılar kazabilir.';
  if (g.men < 30) return 'Lağımcı birliği çok zayıf.';
  const mine = state.mines.filter((m) => m.groupId === g.id && (m.status === 'kaziliyor' || m.status === 'hazir'));
  if (mine.length >= MINE_PER_GROUP) return `Bu birlik zaten ${MINE_PER_GROUP} lağım kazıyor.`;
  return null;
}

/** Start a tunnel at the given entrance (pure; used by the sim and scenarios). */
export function startMine(state: GameState, bus: Bus | null, sectionId: SectionId, tx: number, ty: number, groupId: number | null): Mine {
  const m: Mine = { id: nextId(state), sectionId, tx, ty, progress: 0, detected: false, status: 'kaziliyor', groupId };
  state.mines.push(m);
  mineX(state, m);
  const first = !state.flags[FLAG.lagimBasladi];
  state.flags[FLAG.lagimBasladi] = true;
  if (bus) {
    bus.emit('mine:started', { mineId: m.id, sectionId });
    log(
      state,
      'bilgi',
      first
        ? `Novaberdolu lağımcılar ${sectionName(state, sectionId)} önünde ilk lağıma kazma vurdu. Tünel sessizce surların altına ilerleyecek.`
        : `${sectionName(state, sectionId)} önünde yeni bir lağım kazılmaya başlandı.`,
      bus,
    );
  }
  return m;
}

/** Fire the props of a finished tunnel. */
export function fireMine(state: GameState, bus: Bus, m: Mine): string | null {
  if (m.status !== 'hazir') return m.status === 'kaziliyor' ? 'Tünel henüz surun altına ulaşmadı.' : 'Bu lağım ateşlenemez.';
  const x = mineX(state, m);
  m.status = 'atesl';
  x.fireDay = state.time.day;
  log(state, 'bilgi', `${sectionName(state, m.sectionId)} altındaki lağımın destek kütüklerine ateş verildi.`, bus);
  notify(bus, 'Lağım ateşlendi! Destekler yanıyor…', 'bilgi');
  return null;
}

function endMine(state: GameState, ctx: SimContext, m: Mine, fate: MineFate): void {
  const x = mineX(state, m);
  x.fate = fate;
  x.fateDay = state.time.day;
  const name = sectionName(state, m.sectionId);
  const head = tunnelPoint({ tx: m.tx, ty: m.ty }, m.sectionId, x.t, Math.max(0.15, m.progress));
  const g = m.groupId != null ? state.groups.find((y) => y.id === m.groupId) : undefined;
  const crew = g ? Math.max(1, g.men / Math.max(1, groupMines(state, g.id).length)) : 60;
  switch (fate) {
    case 'cokme': {
      m.status = 'cokertildi';
      const lost = Math.round(crew * ctx.rng.range(0.12, 0.3));
      if (g) damageGroup(state, ctx.bus, g.id, lost);
      ctx.bus.emit('mine:collapsed', { mineId: m.id, sectionId: m.sectionId, at: head });
      applyDefenderLosses(state, ctx.bus, m.sectionId, ctx.rng.int(0, 4));
      log(state, 'kayip', `Karşı lağım! ${name} altındaki tünelimiz Rumların kazdığı dehlizle kesildi ve çökertildi. ${lost} lağımcı toprak altında kaldı.`, ctx.bus);
      notify(ctx.bus, `Lağım çökertildi (${name}).`, 'tehlike');
      break;
    }
    case 'duman': {
      m.status = 'cokertildi';
      const lost = Math.round(crew * ctx.rng.range(0.06, 0.16));
      if (g) damageGroup(state, ctx.bus, g.id, lost);
      ctx.bus.emit('mine:collapsed', { mineId: m.id, sectionId: m.sectionId, at: head });
      log(state, 'kayip', `Rumlar ${name} altındaki tünelimize duman ve Rum ateşi saldı; lağımcılar dışarı kaçtı, tünel kullanılamaz oldu. Kayıp: ${lost}.`, ctx.bus);
      notify(ctx.bus, `Tünele duman salındı (${name}).`, 'tehlike');
      break;
    }
    case 'esir': {
      m.status = 'cokertildi';
      const lost = Math.round(crew * ctx.rng.range(0.08, 0.18));
      if (g) damageGroup(state, ctx.bus, g.id, lost);
      ctx.bus.emit('mine:collapsed', { mineId: m.id, sectionId: m.sectionId, at: head });
      let n = 0;
      for (const o of state.mines) {
        if (o.id === m.id || o.detected || !(o.status === 'kaziliyor' || o.status === 'hazir')) continue;
        o.detected = true;
        n++;
        ctx.bus.emit('mine:detected', { mineId: o.id, sectionId: o.sectionId });
      }
      log(
        state,
        'kayip',
        n > 0
          ? `${name} altındaki karşı lağımda lağımcılarımızdan bazıları esir düştü; işkence altında öteki ${n} tünelin yerini söylediler.`
          : `${name} altındaki karşı lağımda lağımcılarımızdan bazıları esir düştü.`,
        ctx.bus,
      );
      notify(ctx.bus, n > 0 ? `Esir lağımcılar ${n} tüneli ele verdi!` : `Lağımcılar esir düştü (${name}).`, 'tehlike');
      break;
    }
    case 'basarili': {
      m.status = 'basarili';
      const sec = state.sections[m.sectionId];
      if (sec) {
        const dmg = MINE_DAMAGE * (sec.outerMax + sec.innerMax) * (hasMoat(m.sectionId) ? 0.85 : 1);
        sec.barricade = Math.max(0, sec.barricade - 0.6);
        damageSection(state, ctx.bus, m.sectionId, dmg);
      }
      applyDefenderLosses(state, ctx.bus, m.sectionId, ctx.rng.int(25, 70));
      state.byz.morale = Math.max(0, state.byz.morale - 6);
      state.morale = Math.min(100, state.morale + 4);
      sw(state).mineHit[m.sectionId] = state.time.day;
      ctx.bus.emit('mine:success', { mineId: m.id, sectionId: m.sectionId });
      log(state, 'basari', `Lağım patladı! ${name} altındaki destekler yanıp çökünce sur bir gürültüyle yere oturdu; büyük bir gedik açıldı.`, ctx.bus);
      notify(ctx.bus, `Lağım başarılı: ${name} çöktü!`, 'basari');
      break;
    }
  }
}

function groupMines(state: GameState, groupId: number): Mine[] {
  return state.mines.filter((m) => m.groupId === groupId && (m.status === 'kaziliyor' || m.status === 'hazir'));
}

function tickMines(state: GameState, ctx: SimContext): void {
  const s = sw(state);
  const day = state.time.day;
  // 1) sapper groups at work: start a tunnel where they stand if they have none at this section
  for (const g of working(state, 'lagim-kaz')) {
    if (g.type !== 'lagimci') continue;
    const sid = g.order.sectionId!;
    if (!isLand(sid)) continue;
    const mine = groupMines(state, g.id);
    // adopt an abandoned tunnel nearby
    if (!mine.some((m) => m.sectionId === sid)) {
      const orphan = state.mines.find((m) => m.groupId == null && m.status === 'kaziliyor' && Math.hypot(m.tx - g.tx, m.ty - g.ty) < 3);
      if (orphan) {
        orphan.groupId = g.id;
        continue;
      }
      if (mine.length >= MINE_PER_GROUP) continue;
      const q = nearestT(sid, g.tx, g.ty);
      const p = q.dist > 4 && q.dist < 9.5 ? { tx: g.tx, ty: g.ty } : frontPos(sid, q.t, MINE_DIST);
      startMine(state, ctx.bus, sid, Math.round(p.tx * 4) / 4, Math.round(p.ty * 4) / 4, g.id);
      if (hasMoat(sid))
        warnOnce(state, ctx.bus, 'lagim-hendek', 4, 'Hendekli kesimde tünel hendeğin altından, daha derinden geçmeli: kazı yavaş ilerler. En iyi yer hendeksiz Blahernai ve Eğrikapı.', 'bilgi');
    }
  }

  // 2) every mine
  for (const m of state.mines) {
    const x = mineX(state, m);
    const g = m.groupId != null ? state.groups.find((y) => y.id === m.groupId) : undefined;
    const digging = !!g && g.status === 'calisiyor' && g.order.type === 'lagim-kaz' && g.men > 0 && Math.hypot(g.tx - m.tx, g.ty - m.ty) < 10;
    if (g && (g.status === 'dagildi' || g.men <= 0)) m.groupId = null;

    if (m.status === 'kaziliyor') {
      if (digging) {
        const n = Math.max(1, groupMines(state, g!.id).filter((o) => o.status === 'kaziliyor').length);
        const crew = Math.min(1.35, g!.men / n / MINE_CREW_REF);
        const ground = hasMoat(m.sectionId) ? MINE_MOAT_SLOW : 1;
        const fat = 1 - 0.35 * Math.min(1, g!.fatigue / 100);
        m.progress = Math.min(1, m.progress + (Math.pow(crew, 0.75) * ground * fat * ctx.dtDays) / MINE_DAYS);
      }
      if (m.progress >= 1) {
        m.status = 'hazir';
        x.readyDay = day;
        log(state, 'basari', `${sectionName(state, m.sectionId)}: tünel surun temeline ulaştı. Destek kütükleri yerleştirildi; ateşlenmeye hazır.`, ctx.bus);
        notify(ctx.bus, 'Lağım surun altına ulaştı! Ateşlemek için lağımı seçin.', 'basari');
      }
    } else if (m.status === 'hazir') {
      if (day - x.readyDay >= MINE_AUTOFIRE_DAYS) fireMine(state, ctx.bus, m);
    } else if (m.status === 'atesl') {
      if (day - x.fireDay >= MINE_FIRE_DAYS) endMine(state, ctx, m, 'basarili');
      continue;
    } else {
      continue;
    }
    if (m.status !== 'kaziliyor' && m.status !== 'hazir') continue;

    // detection by Grant's listeners (bowls of water, drums) — only while men are underground or the props stand
    if (!m.detected) {
      const skill = counterMineSkill(state);
      const moatF = hasMoat(m.sectionId) ? MINE_DETECT_MOAT : 1;
      const activity = digging || m.status === 'hazir' ? 1 : 0.35;
      const hazard = skill * (MINE_DETECT_BASE + MINE_DETECT_PROG * m.progress) * moatF * activity;
      if (ctx.rng.chance(hazard * ctx.dtDays)) {
        m.detected = true;
        ctx.bus.emit('mine:detected', { mineId: m.id, sectionId: m.sectionId });
        log(state, 'uyari', `Rumlar ${sectionName(state, m.sectionId)} altındaki tünelimizin kazma seslerini duydu; karşı lağım kazıyorlar.`, ctx.bus);
        warnOnce(state, ctx.bus, 'tespit:' + m.id, 99, 'Bir lağımımız fark edildi! Rumlar karşı lağım kazıyor.', 'tehlike');
      }
    }
    // counter-mine (also when another feature — e.g. the K15 event — marked it detected)
    if (m.detected) {
      if (x.counter < 0) {
        x.counter = 0;
        const skill = counterMineSkill(state);
        x.counterDays = ctx.rng.range(COUNTER_DAYS[0], COUNTER_DAYS[1]) * (1.25 - 0.5 * skill);
      }
      x.counter = Math.min(1, x.counter + ctx.dtDays / Math.max(0.1, x.counterDays));
      if (x.counter >= 1) {
        const r = ctx.rng.next();
        const skill = counterMineSkill(state);
        const escape = COUNTER_FATE.kurtul * (1.6 - skill);
        if (r < escape) {
          // our sappers drove them off underground — the tunnel survives, but the enemy will dig again
          x.counter = 0;
          x.counterDays = ctx.rng.range(COUNTER_DAYS[0], COUNTER_DAYS[1]);
          log(state, 'basari', `${sectionName(state, m.sectionId)} altında yeraltı çarpışması: lağımcılarımız karşı lağımı püskürttü.`, ctx.bus);
          if (g) bleed(state, ctx.bus, g, ctx.rng.range(2, 8));
          applyDefenderLosses(state, ctx.bus, m.sectionId, ctx.rng.int(2, 8));
        } else {
          const rest = (r - escape) / (1 - escape);
          const tot = COUNTER_FATE.cokme + COUNTER_FATE.duman + COUNTER_FATE.esir;
          const fate: MineFate = rest < COUNTER_FATE.cokme / tot ? 'cokme' : rest < (COUNTER_FATE.cokme + COUNTER_FATE.duman) / tot ? 'duman' : 'esir';
          endMine(state, ctx, m, fate);
        }
      }
    }
  }

  // 3) forget long-dead mines (keep the entity list short)
  for (let i = state.mines.length - 1; i >= 0; i--) {
    const m = state.mines[i];
    if (m.status !== 'cokertildi' && m.status !== 'basarili') continue;
    const x = s.mineX[m.id];
    if (x && day - x.fateDay > MINE_WRECK_DAYS) {
      state.mines.splice(i, 1);
      delete s.mineX[m.id];
    }
  }
}

// ───────────────────────────── siege tower ─────────────────────────────

export function towerPos(t: TowerState): { tx: number; ty: number } {
  return frontPos(t.sectionId, t.t, t.dist);
}

export function standingTowers(state: GameState): TowerState[] {
  return sw(state).towers.filter((t) => t.status !== 'yaniyor' && t.status !== 'yikildi');
}

/** Can a siege tower be raised before this section? null = yes. */
export function towerCheck(state: GameState, sectionId: SectionId): string | null {
  if (state.time.phase !== 'kusatma') return 'Kuşatma başlamadı.';
  if (!isLand(sectionId)) return 'Kule yalnızca kara surlarına yanaştırılır.';
  if (standingTowers(state).length >= TOWER_MAX) return 'Kuşatma kulesi zaten kuruldu.';
  if (!canAfford(state, TOWER_COST)) return `Yetersiz kaynak: ${missingText(state, TOWER_COST)}.`;
  return null;
}

export function buildTower(state: GameState, bus: Bus | null, sectionId: SectionId, t?: number): TowerState | string {
  const r = towerCheck(state, sectionId);
  if (r) return r;
  spend(state, TOWER_COST);
  const site = sw(state).moat[sectionId];
  const tt = t ?? (site && site.dumped > 0 ? site.t : 0.5);
  const tw: TowerState = {
    id: nextId(state),
    sectionId,
    t: Math.max(0.12, Math.min(0.88, tt)),
    dist: TOWER_START,
    status: 'insa',
    progress: 0,
    moving: false,
    burn: 0,
    since: state.time.day,
  };
  sw(state).towers.push(tw);
  if (bus) log(state, 'bilgi', `${sectionName(state, sectionId)} karşısında kuşatma kulesi kurulmaya başlandı (${costText(TOWER_COST)}).`, bus);
  return tw;
}

export function advanceTower(state: GameState, bus: Bus, sectionId: SectionId): string | null {
  const tw = sw(state).towers.find((t) => t.sectionId === sectionId && t.status !== 'yaniyor' && t.status !== 'yikildi');
  if (!tw) return 'Bu kesimde kuşatma kulesi yok.';
  if (tw.status === 'insa') return 'Kule henüz bitmedi.';
  if (tw.status === 'surda') return 'Kule zaten surlara dayandı.';
  if (tw.status === 'bekliyor' && (state.sections[sectionId]?.moatFill ?? 0) < TOWER_MOAT_NEED)
    return `Hendek doldurulmadan kule ilerleyemez (en az %${Math.round(TOWER_MOAT_NEED * 100)}).`;
  tw.moving = true;
  if (tw.status === 'hazir' || tw.status === 'bekliyor') {
    tw.status = 'ilerliyor';
    tw.since = state.time.day;
  }
  log(state, 'bilgi', `Kuşatma kulesi ${sectionName(state, sectionId)} surlarına doğru itiliyor.`, bus);
  return null;
}

function setTowerStatus(state: GameState, tw: TowerState, st: TowerState['status']): void {
  tw.status = st;
  tw.since = state.time.day;
}

function tickTowers(state: GameState, ctx: SimContext): void {
  const s = sw(state);
  const day = state.time.day;
  for (let i = s.towers.length - 1; i >= 0; i--) {
    const tw = s.towers[i];
    const sec = state.sections[tw.sectionId];
    const name = sectionName(state, tw.sectionId);
    const pushers = working(state, 'kuleyi-ilerlet', tw.sectionId);
    switch (tw.status) {
      case 'insa': {
        const night = isNightNow(state);
        tw.progress = Math.min(1, tw.progress + (ctx.dtDays / TOWER_BUILD_DAYS) * (night ? 1.15 : 1));
        if (tw.progress >= 1) {
          setTowerStatus(state, tw, 'hazir');
          state.flags[FLAG.kuleYapildi] = true;
          state.flags[FLAG.kuleYandi] = false;
          ctx.bus.emit('tower:built', { sectionId: tw.sectionId });
          log(state, 'basari', `Islak öküz derileriyle kaplı dev kuşatma kulesi ${name} karşısında yükseldi.`, ctx.bus);
          notify(ctx.bus, 'Kuşatma kulesi hazır! İlerletmek için kuleyi seçip surlara sağ tıklayın.', 'basari');
          if (pushers.length) tw.moving = true;
        }
        break;
      }
      case 'hazir':
      case 'bekliyor': {
        if (tw.status === 'hazir' && pushers.length) tw.moving = true;
        if (tw.moving && (tw.status === 'hazir' || (sec?.moatFill ?? 0) >= TOWER_MOAT_NEED)) setTowerStatus(state, tw, 'ilerliyor');
        break;
      }
      case 'ilerliyor': {
        let men = TOWER_CREW;
        for (const g of pushers) men += g.men;
        const pushF = 0.4 + 0.6 * Math.min(1, men / TOWER_PUSH_REF);
        const terrainF = isNightNow(state) ? 0.8 : 1;
        tw.dist = Math.max(TOWER_WALL, tw.dist - TOWER_SPEED * pushF * terrainF * ctx.dtDays);
        const fill = sec?.moatFill ?? 1;
        if (hasMoat(tw.sectionId) && fill < TOWER_MOAT_NEED && tw.dist <= TOWER_MOAT_STOP) {
          tw.dist = TOWER_MOAT_STOP;
          setTowerStatus(state, tw, 'bekliyor');
          warnOnce(
            state,
            ctx.bus,
            'kule-hendek:' + tw.id,
            1,
            `Kule hendek kenarında durdu: hendek en az %${Math.round(TOWER_MOAT_NEED * 100)} doldurulmalı (şu an %${Math.round(fill * 100)}).`,
          );
        } else if (tw.dist <= TOWER_WALL + 1e-6) {
          setTowerStatus(state, tw, 'surda');
          tw.moving = false;
          log(state, 'basari', `Kuşatma kulesi ${name} surlarına dayandı; asma köprü dış surun üstüne indi.`, ctx.bus);
          notify(ctx.bus, 'Kule surlara dayandı! Hücumda büyük üstünlük sağlar.', 'basari');
        }
        // defenders shoot at the men pushing it
        towerFire(state, ctx, tw, pushers, 1);
        break;
      }
      case 'surda':
        towerFire(state, ctx, tw, pushers, 0.6);
        break;
      case 'yaniyor': {
        tw.burn = Math.min(1, tw.burn + ctx.dtDays / TOWER_BURN_DAYS);
        if (tw.burn >= 1) {
          setTowerStatus(state, tw, 'yikildi');
          log(state, 'kayip', `Yanan kuşatma kulesi ${name} önünde çöktü.`, ctx.bus);
        }
        break;
      }
      case 'yikildi':
        if (day - tw.since > TOWER_WRECK_DAYS) s.towers.splice(i, 1);
        break;
    }
  }
}

function towerFire(state: GameState, ctx: SimContext, tw: TowerState, pushers: UnitGroup[], k: number): void {
  const exp = exposure(state, tw.sectionId);
  if (exp <= 0) return;
  const near = 1 - Math.min(1, (tw.dist - TOWER_WALL) / (TOWER_START - TOWER_WALL)) * 0.6;
  for (const g of pushers) bleed(state, ctx.bus, g, g.men * 0.012 * exp * near * k * ctx.dtDays);
  // the tower's archers answer: a few defenders fall
  if (ctx.rng.chance(0.6 * ctx.dtDays * k)) applyDefenderLosses(state, ctx.bus, tw.sectionId, 1);
}

/** Byzantine sortie burns the tower before this section (if any). */
export function burnTowerAt(state: GameState, bus: Bus, sectionId: SectionId): boolean {
  const tw = sw(state).towers.find((t) => t.sectionId === sectionId && t.status !== 'yaniyor' && t.status !== 'yikildi');
  if (!tw) return false;
  setTowerStatus(state, tw, 'yaniyor');
  tw.burn = 0;
  tw.moving = false;
  state.flags[FLAG.kuleYandi] = true;
  const at = towerPos(tw);
  bus.emit('tower:burned', { sectionId, at });
  for (const g of state.groups) {
    if (g.order.type !== 'kuleyi-ilerlet' || g.order.sectionId !== sectionId || g.men <= 0) continue;
    damageGroup(state, bus, g.id, Math.max(1, Math.round(g.men * 0.06)));
  }
  log(state, 'kayip', `Rumlar gece çıkışında barut fıçılarıyla ${sectionName(state, sectionId)} önündeki kuşatma kulesini ateşe verdi!`, bus);
  return true;
}

// ───────────────────────────── commands ─────────────────────────────

export function handleSiegeworksCommand(state: GameState, cmd: Command, ctx: SimContext): boolean {
  switch (cmd.t) {
    case 'hendek-doldur': {
      // army moves the group (we only validate here)
      const sec = state.sections[cmd.sectionId];
      let r: string | null = null;
      if (state.time.phase !== 'kusatma') r = 'Kuşatma başlamadı.';
      else if (!sec || !isLand(cmd.sectionId) || !hasMoat(cmd.sectionId)) r = 'Bu kesimde hendek yok.';
      else if (sec.moatFill >= 0.995) r = 'Bu hendek zaten dolduruldu.';
      if (r) {
        notify(ctx.bus, r, 'uyari');
        return true;
      }
      return false;
    }
    case 'lagim-kaz': {
      const g = state.groups.find((x) => x.id === cmd.groupId);
      const r = mineCheck(state, cmd.sectionId, g);
      if (r) {
        notify(ctx.bus, `${g?.name ? g.name + ': ' : ''}${r}`, 'uyari');
        return true;
      }
      return false;
    }
    case 'kule-insa': {
      const r = buildTower(state, ctx.bus, cmd.sectionId);
      if (typeof r === 'string') notify(ctx.bus, r, 'uyari');
      else notify(ctx.bus, 'Kuşatma kulesi kuruluyor…', 'bilgi');
      return true;
    }
    case 'kule-ilerlet': {
      const r = advanceTower(state, ctx.bus, cmd.sectionId);
      if (r) notify(ctx.bus, r, 'uyari');
      return true;
    }
    case 'ozel': {
      if (cmd.feature !== FEATURE) return false;
      const p = (cmd.payload ?? {}) as { mineId?: number; sectionId?: string; workers?: number; t?: number };
      switch (cmd.action) {
        case 'lagim-atesle': {
          const m = state.mines.find((x) => x.id === p.mineId);
          const r = m ? fireMine(state, ctx.bus, m) : 'Lağım bulunamadı.';
          if (r) notify(ctx.bus, r, 'uyari');
          return true;
        }
        case 'amele-hendek': {
          if (!p.sectionId) return true;
          const r = setAmele(state, ctx.bus, p.sectionId, p.workers ?? 0);
          if (r) notify(ctx.bus, r, 'uyari');
          return true;
        }
        case 'kule-insa': {
          if (!p.sectionId) return true;
          const r = buildTower(state, ctx.bus, p.sectionId, p.t);
          if (typeof r === 'string') notify(ctx.bus, r, 'uyari');
          return true;
        }
        // ── QA / debug (URL ?siege=…) ──
        case 'kule-yak': {
          const t = sw(state).towers.find((x) => x.status !== 'yaniyor' && x.status !== 'yikildi');
          if (t && burnTowerAt(state, ctx.bus, t.sectionId)) t.burn = Math.max(0, Math.min(0.95, Number((cmd.payload as { burn?: number } | undefined)?.burn ?? 0)));
          return true;
        }
        case 'kule-durum': {
          const t = sw(state).towers[0];
          const q = (cmd.payload ?? {}) as { status?: TowerState['status']; progress?: number; dist?: number };
          if (t) {
            if (q.status) setTowerStatus(state, t, q.status);
            if (q.progress != null) t.progress = q.progress;
            if (q.dist != null) t.dist = q.dist;
          }
          return true;
        }
        case 'lagim-bitir': {
          const m = state.mines.find((x) => x.id === p.mineId);
          if (m && m.status === 'kaziliyor') {
            m.progress = 1;
            m.status = 'hazir';
            mineX(state, m).readyDay = state.time.day;
          }
          if (m && !fireMine(state, ctx.bus, m)) mineX(state, m).fireDay -= MINE_FIRE_DAYS * 0.9;
          return true;
        }
      }
      return true;
    }
  }
  return false;
}

// ───────────────────────────── scenarios ─────────────────────────────

/** A free spot near (t0, dist0) in front of a section: away from guns, buildings and other mines. */
export function clearSpot(state: GameState, sectionId: SectionId, t0: number, dist0: number, spread = 0.22): { t: number; dist: number; tx: number; ty: number } {
  let best = { t: t0, dist: dist0, ...frontPos(sectionId, t0, dist0) };
  let bestScore = -Infinity;
  for (let dt = -spread; dt <= spread + 1e-6; dt += spread / 8) {
    for (let dd = -1; dd <= 1.001; dd += 0.5) {
      const t = Math.max(0.05, Math.min(0.95, t0 + dt));
      const dist = dist0 + dd;
      const p = frontPos(sectionId, t, dist);
      let clear = 6;
      for (const c of state.cannons) clear = Math.min(clear, Math.hypot(c.tx - p.tx, c.ty - p.ty) - 1.6);
      for (const b of state.buildings) clear = Math.min(clear, Math.hypot(b.tx + 0.5 - p.tx, b.ty + 0.5 - p.ty) - 1.4);
      for (const m of state.mines) clear = Math.min(clear, Math.hypot(m.tx - p.tx, m.ty - p.ty) - 2.2);
      const score = Math.min(clear, 3) - Math.abs(dt) * 3 - Math.abs(dd) * 0.4;
      if (score > bestScore) {
        bestScore = score;
        best = { t, dist, ...p };
      }
    }
  }
  return best;
}

export function applySiegeworksScenario(name: ScenarioName, state: GameState, world: WorldApi): void {
  void world;
  const s = sw(state);
  const sapper = state.groups.find((g) => g.type === 'lagimci');
  const lend = (sid: SectionId, t: number, amele: number, dumped: number) => {
    const site = moatSite(state, sid);
    site.t = t;
    site.dumped = Math.max(site.dumped, dumped);
    const take = Math.min(amele, Math.max(0, state.workforce.total - 100));
    state.workforce.total -= take;
    site.amele += take;
  };
  switch (name) {
    case 'lagim': {
      // Novaberdolu sappers before Eğrikapı and the Blachernae wall, 16 Mayıs 1453
      const mk = (sid: SectionId, t: number, dist: number, progress: number, startAgo: number) => {
        const p = clearSpot(state, sid, t, dist, 0.05);
        const m = startMine(state, null, sid, Math.round(p.tx * 4) / 4, Math.round(p.ty * 4) / 4, sapper?.id ?? null);
        m.progress = progress;
        const x = mineX(state, m);
        x.startDay = state.time.day - startAgo;
        return { m, x };
      };
      // historically most tunnels went for the single Blachernae wall (no moat)
      mk('kara-blahernai', 0.76, 4.5, 0.58, 4);
      const b = mk('kara-blahernai', 0.55, 4.4, 0.8, 6);
      b.m.detected = true;
      b.x.counter = 0.6;
      b.x.counterDays = 0.9;
      // the Novaberdolu company itself works the newest shaft before Eğrikapı (where the army posts it)
      const n = frontPos('kara-egrikapi', 0.5, MINE_DIST);
      const fresh = startMine(state, null, 'kara-egrikapi', Math.round(n.tx * 4) / 4, Math.round(n.ty * 4) / 4, sapper?.id ?? null);
      fresh.progress = 0.16;
      mineX(state, fresh).startDay = state.time.day - 1;
      // an older tunnel that Grant's men caved in two days ago
      const c = mk('kara-blahernai', 0.66, 3.4, 0.64, 7);
      c.m.status = 'cokertildi';
      c.m.detected = true;
      c.m.groupId = null;
      c.x.counter = 1;
      c.x.fate = 'cokme';
      c.x.fateDay = state.time.day - 2;
      state.flags[FLAG.lagimBasladi] = true;
      break;
    }
    case 'kule': {
      // 18 Mayıs: the great tower is rolled over the filled moat before St Romanus
      const sid = 'kara-topkapi';
      const sec = state.sections[sid];
      if (sec) sec.moatFill = Math.max(sec.moatFill, 0.68);
      const tw: TowerState = { id: nextId(state), sectionId: sid, t: 0.86, dist: 1.95, status: 'ilerliyor', progress: 1, moving: true, burn: 0, since: state.time.day - 0.1 };
      s.towers.push(tw);
      lend(sid, 0.66, 500, 0.5);
      state.flags[FLAG.kuleYapildi] = true;
      state.flags[FLAG.kuleYandi] = false;
      break;
    }
    case 'bombardiman':
    case 'gece-onarim': {
      // amele and azaps carrying fascines and earth into the moat at St Romanus and in the Lykos valley
      const lyk = state.sections['kara-lykos'];
      if (lyk) lyk.moatFill = Math.max(lyk.moatFill, name === 'bombardiman' ? 0.3 : 0.36);
      const top = state.sections['kara-topkapi'];
      if (top) top.moatFill = Math.max(top.moatFill, 0.22);
      const mev = state.sections['kara-mevlevihane'];
      if (mev) mev.moatFill = Math.max(mev.moatFill, 0.18);
      lend('kara-mevlevihane', 0.12, 420, 0.18);
      lend('kara-lykos', 0.84, 520, 0.25);
      lend('kara-topkapi', 0.9, 300, 0.2);
      break;
    }
    case 'son-hucum':
    case 'zafer': {
      for (const sid of ['kara-lykos', 'kara-topkapi', 'kara-edirnekapi']) moatSite(state, sid).dumped = 0.6;
      if (name === 'son-hucum') {
        // the burned tower's wreck from 18/19 May was cleared; nothing stands
        state.flags[FLAG.kuleYapildi] = true;
        state.flags[FLAG.kuleYandi] = true;
        state.flags[FLAG.lagimBasladi] = true;
      }
      break;
    }
  }
}

/** Debug/test helper: one-line Turkish summary. */
export function summary(state: GameState): string {
  const s = sw(state);
  const mines = state.mines.map((m) => `${m.sectionId}:${m.status}:${Math.round(m.progress * 100)}%${m.detected ? '!' : ''}`).join(' ');
  const towers = s.towers.map((t) => `${t.sectionId}:${t.status}:${t.dist.toFixed(1)}`).join(' ');
  return `${formatDate(state.time.day)} lağım[${mines}] kule[${towers}]`;
}

