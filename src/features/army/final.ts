import { dayFrac, siegeDayNumber } from '../../core/calendar';
import type { SimContext } from '../../core/feature';
import { FLAG } from '../../core/flags';
import type { TilePt } from '../../core/iso';
import { addLog, type GameState, type SectionId, type UnitGroup } from '../../core/state';
import type { WorldApi } from '../../core/world';
import { landmarkTile } from '../../data/landmarks';
import { sectionOutwardNormal, sectionPoint, towerPositions } from '../fortifications/api';
import { assaultMembers, clamp, newAssault, tickAssault, withdraw, type AssaultMods } from './combat';
import { BAL, UNIT_TYPES } from './data';
import { frontPoint, isLandSection, spreadT } from './geo';
import { sendStraight, sendTo } from './move';
import { applyOrder } from './orders';
import { army, extraOf, type FinalAssaultState } from './state';

/**
 * K18/K19 — the final assault. Declared by the Sultan, it runs by itself in
 * the historical order: (1) başıbozuklar, (2) İshak Paşa's Anadolu troops,
 * (3) the yeniçeriler, led by the Sultan to the moat. Only wave 3 can take the city.
 */

const flag = (s: GameState, k: string) => !!s.flags[k];

export interface Check {
  ok: boolean;
  reason?: string;
}

/** Best land breach (historically the Mesoteichion / Lykos valley). */
export function bestBreach(state: GameState): { id: SectionId; breach: number } {
  let id: SectionId = 'kara-lykos';
  let best = -1;
  for (const s of Object.values(state.sections)) {
    if (s.kind !== 'kara') continue;
    const v = s.breach + (s.id === 'kara-lykos' ? 0.04 : s.id === 'kara-topkapi' ? 0.02 : 0);
    if (v > best) {
      best = v;
      id = s.id;
    }
  }
  return { id, breach: state.sections[id]?.breach ?? 0 };
}

export function canDeclareFinal(state: GameState): Check {
  if (state.time.phase !== 'kusatma') return { ok: false, reason: 'Son hücum yalnızca kuşatma sırasında ilan edilir.' };
  if (flag(state, FLAG.sehirDustu)) return { ok: false, reason: 'Şehir alındı.' };
  const f = army(state).final;
  if (f && f.phase !== 'bitti' && f.phase !== 'basarisiz') return { ok: false, reason: 'Son hücum zaten ilan edildi.' };
  if (state.time.day < army(state).finalCooldownUntil)
    return { ok: false, reason: `Ordu toparlanıyor: yeni bir son hücum için ${Math.ceil(army(state).finalCooldownUntil - state.time.day)} gün beklenmeli.` };
  if (flag(state, FLAG.sonHucumIlan)) return { ok: true };
  if (bestBreach(state).breach < 0.5) return { ok: false, reason: 'Surda en az bir geniş gedik (%50) açılmalı.' };
  return { ok: true };
}

function present(state: GameState): UnitGroup[] {
  return state.groups.filter((g) => g.status !== 'uzakta' && g.status !== 'dagildi' && g.men > 0 && g.type !== 'mehter');
}

/** Assign the waves from the groups present (historical order, with fallbacks). */
export function planWaves(state: GameState, main: SectionId): { waves: number[][]; diversion: number[]; cover: number[] } {
  const pool = present(state);
  const used = new Set<number>();
  const take = (pred: (g: UnitGroup) => boolean, max = 99) => {
    const out: number[] = [];
    for (const g of pool) {
      if (out.length >= max) break;
      if (!used.has(g.id) && pred(g)) {
        used.add(g.id);
        out.push(g.id);
      }
    }
    return out;
  };
  const wing = (g: UnitGroup) => extraOf(state, g.id).wing;
  // wave 3: the yeniçeriler (with the Sultan's hassa)
  const w3 = take((g) => g.type === 'yeniceri');
  // archers to cover the breach (some azaps stay back to shoot)
  const cover = take((g) => g.type === 'azap' && wing(g) === 'merkez', 2);
  // diversion: Karaca Paşa's Rumeli troops on the Blachernae–Eğrikapı front
  const diversion = take((g) => wing(g) === 'karaca' && (g.type === 'sipahi' || g.type === 'azap'), 3);
  // wave 1: başıbozuklar (fallback: the remaining azaps)
  let w1 = take((g) => g.type === 'basibozuk');
  if (!w1.length) w1 = take((g) => g.type === 'azap', 2);
  // wave 2: İshak Paşa's Anadolu troops (fallback: any timariots)
  let w2 = take((g) => wing(g) === 'ishak' && (g.type === 'sipahi' || g.type === 'azap'));
  if (!w2.length) w2 = take((g) => g.type === 'sipahi' || g.type === 'azap', 3);
  if (!cover.length) cover.push(...take((g) => g.type === 'azap', 1));
  if (main === 'kara-egrikapi' || main === 'kara-blahernai') diversion.length = 0;
  return { waves: [[], w1, w2, w3], diversion, cover };
}

/** Next historical start time: after midnight (≈00:10). */
export function nextStart(day: number): number {
  const f = dayFrac(day);
  const base = Math.floor(day);
  return f < 0.42 ? base + 0.8 : base + 1.8;
}

/** K18: declare the final assault (sets FLAG.sonHucumIlan, schedules wave 1). */
export function declareFinal(state: GameState, ctx: SimContext, immediate = false): Check {
  const c = canDeclareFinal(state);
  if (!c.ok) return c;
  const a = army(state);
  const main = bestBreach(state).id;
  const side: SectionId[] = main === 'kara-egrikapi' ? ['kara-blahernai'] : ['kara-egrikapi'];
  const plan = planWaves(state, main);
  const startDay = immediate ? state.time.day + 0.12 : nextStart(state.time.day);
  a.final = {
    phase: 'ilan',
    declaredDay: state.time.day,
    startDay,
    wave: 0,
    t: 0,
    main,
    side,
    waves: plan.waves,
    diversion: plan.diversion,
    cover: plan.cover,
    foothold: 0,
    exhaustion: 0,
    hasan: false,
    kerkoporta: false,
    sultanAtMoat: false,
    bannerAt: null,
    kerkoAt: null,
  };
  state.flags[FLAG.sonHucumIlan] = true;
  state.morale = clamp(state.morale + 5, 0, 100);
  for (const g of present(state)) g.order.type === 'bekle' && (g.order = { type: 'dinlen' });
  addLog(state, 'olay', 'Son hücum ilan edildi. Tellallar ordugâhı dolaşıyor; askerler dinlendiriliyor, gece ateşler yakılacak.');
  ctx.bus.emit('notify', { text: 'Son hücum ilan edildi! Ordu dinleniyor; hücum gece yarısından sonra başlayacak.', kind: 'basari' });
  return { ok: true };
}

/** Start the assault now (second press of "Son hücum" while waiting). */
export function startFinalNow(state: GameState, ctx: SimContext): Check {
  const f = army(state).final;
  if (!f) return declareFinal(state, ctx, true);
  if (f.phase !== 'ilan') return { ok: false, reason: 'Son hücum zaten başladı.' };
  f.startDay = state.time.day + 0.12;
  return { ok: true };
}

function setMehter(state: GameState, ctx: SimContext, on: boolean): void {
  const a = army(state);
  if (a.mehter === on) return;
  a.mehter = on;
  ctx.bus.emit('mehter:play', { playing: on });
}

function ids2groups(state: GameState, ids: number[]): UnitGroup[] {
  const out: UnitGroup[] = [];
  for (const id of ids) {
    const g = state.groups.find((x) => x.id === id);
    if (g && g.status !== 'dagildi' && g.status !== 'uzakta' && g.men > 0) out.push(g);
  }
  return out;
}

function orderWave(state: GameState, world: WorldApi, ctx: SimContext, f: FinalAssaultState, w: number): void {
  const gs = ids2groups(state, f.waves[w] ?? []);
  gs.forEach((g, i) => {
    if (w === 3) g.morale = clamp(g.morale + 15, 0, 100);
    applyOrder(state, world, ctx.bus, g, { type: 'hucum', sectionId: f.main }, i, gs.length);
  });
}

function stage(state: GameState, world: WorldApi, ctx: SimContext, f: FinalAssaultState): void {
  // wave 1 + diversion go in; waves 2/3 line up behind; archers cover the breach
  orderWave(state, world, ctx, f, 1);
  const div = ids2groups(state, f.diversion);
  div.forEach((g, i) => applyOrder(state, world, ctx.bus, g, { type: 'hucum', sectionId: f.side[0] }, i, div.length));
  const cov = ids2groups(state, f.cover);
  cov.forEach((g, i) => applyOrder(state, world, ctx.bus, g, { type: 'bombardimani-koru', sectionId: f.main }, i, cov.length));
  for (const w of [2, 3]) {
    const gs = ids2groups(state, f.waves[w]);
    gs.forEach((g, i) => {
      const p = frontPoint(world, f.main, spreadT(i, gs.length), w === 2 ? 7.5 : 10.5);
      g.order = { type: 'git', target: p };
      if (sendTo(state, world, g, p)) g.status = 'yuruyor';
    });
  }
  // the mehter marches up behind the centre
  for (const g of state.groups) {
    if (g.type !== 'mehter' || g.status === 'uzakta' || g.status === 'dagildi') continue;
    const p = frontPoint(world, f.main, 0.5, 12.5);
    g.order = { type: 'git', target: p };
    if (sendTo(state, world, g, p)) g.status = 'yuruyor';
  }
}

function waveAlive(state: GameState, f: FinalAssaultState, w: number): boolean {
  return ids2groups(state, f.waves[w] ?? []).some((g) => g.status === 'savasiyor' || (g.status === 'yuruyor' && g.order.type === 'hucum'));
}

function beginWave(state: GameState, world: WorldApi, ctx: SimContext, f: FinalAssaultState, w: number): void {
  f.wave = w;
  f.phase = 'dalga';
  f.t = 0;
  state.flags[FLAG.hucumDalgasi] = w;
  state.flags[FLAG.sonHucum] = true;
  setMehter(state, ctx, true);
  if (w > 1) orderWave(state, world, ctx, f, w);
  ensureMainAssault(state, f);
  const as = army(state).assaults[f.main];
  as.wave = w;
  as.t = 0;
  const name = state.sections[f.main]?.name ?? f.main;
  const ids = f.waves[w] ?? [];
  ctx.bus.emit('assault:start', { sectionId: f.main, groupIds: ids, wave: w });
  const txt =
    w === 1
      ? `Son hücum başladı! Mehter vuruyor; başıbozuklar merdivenlerle ${name} gediğine atılıyor.`
      : w === 2
        ? 'İkinci dalga: İshak Paşa’nın Anadolu askerleri gediğe yükleniyor.'
        : 'Üçüncü dalga: Sultan yeniçerileri bizzat hendeğe kadar sürüyor!';
  ctx.bus.emit('notify', { text: txt, kind: w === 3 ? 'basari' : 'uyari' });
  addLog(state, 'olay', txt);
  const p = sectionPoint(f.main, 0.5);
  ctx.bus.emit('camera:focus', { tx: p.tx, ty: p.ty, zoom: 2, duration: 0.8 });
}

function endWave(state: GameState, ctx: SimContext, f: FinalAssaultState, w: number): void {
  for (const g of ids2groups(state, f.waves[w] ?? [])) if (g.status === 'savasiyor' || g.status === 'yuruyor') withdraw(state, ctx, g, false);
}

function plantBanner(state: GameState, ctx: SimContext, f: FinalAssaultState): void {
  f.hasan = true;
  const towers = towerPositions(f.main);
  let at: TilePt = sectionPoint(f.main, 0.5);
  let bd = Infinity;
  for (const tw of towers) {
    const d = Math.abs(tw.t - 0.5);
    if (d < bd) {
      bd = d;
      at = { tx: tw.tx, ty: tw.ty };
    }
  }
  f.bannerAt = { tx: at.tx, ty: at.ty };
  state.flags[FLAG.sancakDikildi] = true;
  ctx.bus.emit('banner:planted', { at: f.bannerAt });
  ctx.bus.emit('camera:focus', { tx: at.tx, ty: at.ty, zoom: 3, duration: 0.7 });
  ctx.bus.emit('camera:shake', { intensity: 0.25, duration: 0.5 });
  ctx.bus.emit('notify', { text: 'Ulubatlı Hasan sancağı burca dikti! Ordu yeniden atılıyor.', kind: 'basari' });
  addLog(state, 'basari', 'Ulubatlı Hasan otuz kadar yoldaşıyla surlara tırmandı ve sancağı burca dikti; kendisi de orada şehit düştü.');
  for (const g of ids2groups(state, f.waves[3])) g.morale = clamp(g.morale + 20, 0, 100);
  const hero = state.groups.find((g) => extraOf(state, g.id).hero === 'hasan' && g.status !== 'dagildi');
  if (hero) hero.xp = 100;
}

function cityFalls(state: GameState, world: WorldApi, ctx: SimContext, f: FinalAssaultState): void {
  const a = army(state);
  f.phase = 'dusus';
  f.t = 0;
  state.flags[FLAG.sehirDustu] = true;
  state.morale = clamp(state.morale + 20, 0, 100);
  const name = state.sections[f.main]?.name ?? f.main;
  ctx.bus.emit('assault:end', { sectionId: f.main, success: true });
  ctx.bus.emit('notify', { text: `Şehir düştü! Askerler ${name} gediğinden içeri akıyor.`, kind: 'basari' });
  addLog(state, 'basari', 'Konstantiniyye fethedildi. Sancaklar surlarda dalgalanıyor; Sultan şehre girip Ayasofya’ya gidecek.');
  a.outcomeAt = a.clock + BAL.fallSec;
  // pour in through the breach
  const inside = (t: number, d: number): TilePt => {
    const p = sectionPoint(f.main, t);
    const n = sectionOutwardNormal(f.main, t);
    return { tx: p.tx - n.tx * d, ty: p.ty - n.ty * d };
  };
  const pour = state.groups.filter((g) => g.status !== 'uzakta' && g.status !== 'dagildi' && g.men > 0 && (g.order.sectionId === f.main || f.waves[3].includes(g.id)));
  const aya = landmarkTile('ayasofya');
  pour.forEach((g, i) => {
    const t = spreadT(i, pour.length);
    const gate = sectionPoint(f.main, t);
    const deep = inside(t, 6 + (i % 3) * 3);
    const toward = { tx: deep.tx + (aya.tx - deep.tx) * 0.12, ty: deep.ty + (aya.ty - deep.ty) * 0.12 };
    g.order = { type: 'git', target: toward };
    g.status = 'yuruyor';
    sendStraight(state, g, [{ tx: gate.tx, ty: gate.ty }, deep, toward]);
    a.parade.push(g.id);
  });
  for (const sid of Object.keys(a.assaults)) delete a.assaults[sid];
}

function failFinal(state: GameState, ctx: SimContext, f: FinalAssaultState): void {
  const a = army(state);
  f.phase = 'basarisiz';
  state.flags[FLAG.sonHucum] = false;
  state.flags[FLAG.hucumDalgasi] = 0;
  state.flags[FLAG.sonHucumIlan] = false;
  a.finalCooldownUntil = state.time.day + BAL.finalCooldownDays;
  state.morale = clamp(state.morale - 15, 0, 100);
  state.divan = clamp(state.divan - 20, -100, 100);
  for (const sid of [f.main, ...f.side]) {
    for (const g of assaultMembers(state, sid)) withdraw(state, ctx, g, false);
    if (a.assaults[sid]) {
      ctx.bus.emit('assault:end', { sectionId: sid, success: false });
      delete a.assaults[sid];
    }
  }
  setMehter(state, ctx, false);
  ctx.bus.emit('notify', { text: 'Son hücum püskürtüldü. Ordunun morali çöktü; Divan’da barış yanlıları sesini yükseltiyor.', kind: 'tehlike' });
  addLog(state, 'kayip', 'Son hücum püskürtüldü. Halil Paşa kuşatmanın kaldırılmasını yeniden dile getiriyor.');
}

/** Per-tick driver of the final assault. */
export function tickFinal(state: GameState, ctx: SimContext): void {
  const a = army(state);
  // A scenario/event may have raised FLAG.sonHucum without us: adopt it.
  if (!a.final && flag(state, FLAG.sonHucum) && state.time.phase === 'kusatma' && !flag(state, FLAG.sehirDustu)) {
    state.flags[FLAG.sonHucumIlan] = true;
    declareFinal(state, ctx, true);
    if (a.final) (a.final as FinalAssaultState).startDay = state.time.day;
  }
  const f = a.final;
  if (!f) return;
  const dt = ctx.dtSec;
  f.t += dt;
  const world = ctx.world;
  switch (f.phase) {
    case 'ilan': {
      // rest day: fires in the camp, everybody recovers
      for (const g of present(state)) {
        g.fatigue = clamp(g.fatigue - 0.35 * dt, 0, 100);
        g.morale = clamp(g.morale + 0.05 * dt, 0, 100);
      }
      setMehter(state, ctx, dayFrac(state.time.day) > 0.62);
      if (state.time.day >= f.startDay - 0.1) {
        f.phase = 'toplanma';
        f.t = 0;
        const plan = planWaves(state, f.main);
        f.waves = plan.waves;
        f.diversion = plan.diversion;
        f.cover = plan.cover;
        stage(state, world, ctx, f);
        ctx.bus.emit('notify', { text: 'Birlikler hücum mevzilerine yürüyor. Merdivenler ve çengeller hazır.', kind: 'bilgi' });
      }
      return;
    }
    case 'toplanma': {
      setMehter(state, ctx, true);
      const engaged = ids2groups(state, f.waves[1]).some((g) => g.status === 'savasiyor');
      if (engaged || f.t > 30 || state.time.day >= f.startDay + 0.08) {
        if (!f.waves[1].length) {
          f.wave = 1;
          f.phase = 'ara';
          f.t = 0;
          state.flags[FLAG.sonHucum] = true;
          state.flags[FLAG.hucumDalgasi] = 1;
        } else beginWave(state, world, ctx, f, 1);
      }
      return;
    }
    case 'ara': {
      if (f.t >= BAL.waveGapSec) {
        let w = f.wave + 1;
        while (w <= 3 && !ids2groups(state, f.waves[w]).length) w++;
        if (w > 3) {
          failFinal(state, ctx, f);
          return;
        }
        beginWave(state, world, ctx, f, w);
      }
      return;
    }
    case 'dalga': {
      ensureMainAssault(state, f);
      const as = a.assaults[f.main];
      const engaged = assaultMembers(state, f.main).length > 0;
      if (!engaged) {
        // the wave is still crossing to the breach (or already spent)
        if (!waveAlive(state, f, f.wave) || f.t > 40) {
          if (f.wave >= 3) {
            failFinal(state, ctx, f);
            return;
          }
          endWave(state, ctx, f, f.wave);
          f.phase = 'ara';
          f.t = 0;
        }
        return;
      }
      as.wave = f.wave;
      const mods: AssaultMods = { cap: f.wave >= 3 ? 1 : 0.45, defMult: 1, attMult: 1 };
      if (f.wave === 3) {
        mods.attMult *= 1.12;
        const sultan = state.groups.find((g) => g.commanderId === 'fatih' && g.status === 'savasiyor');
        if (sultan && !f.sultanAtMoat) {
          f.sultanAtMoat = true;
          addLog(state, 'olay', 'Sultan atını hendeğin kenarına sürdü; yeniçeriler onun gözü önünde gediğe atılıyor.');
        }
        if (flag(state, FLAG.giustinianiYarali) || state.byz.giustinianiWounded) mods.defMult *= 0.45;
        // Kerkoporta (Doukas): a postern left open near Eğrikapı while Karaca's men press there
        if (!f.kerkoporta && f.t > 5) {
          const pressing = f.side.some((sid) => assaultMembers(state, sid).length > 0);
          if (pressing && ctx.rng.chance(0.05 * dt)) {
            f.kerkoporta = true;
            f.kerkoAt = landmarkTile('kerkoporta');
            state.flags[FLAG.kerkoporta] = true;
            ctx.bus.emit('notify', { text: 'Eğrikapı yakınında Kerkoporta açık bulundu! Birkaç düzine asker içeri daldı (yalnızca Doukas anlatır).', kind: 'basari' });
            addLog(state, 'olay', 'Kerkoporta açık bulundu; içeri dalan askerler burçlara sancak dikti. Bu olayı yalnızca Doukas anlatır.');
          }
        }
        if (f.kerkoporta) mods.defMult *= 0.8;
        if (f.hasan) mods.defMult *= 0.6;
      }
      const prevF = as.foothold;
      const r = tickAssault(state, ctx, as, mods);
      f.foothold = as.foothold;
      f.exhaustion = as.exhaustion;
      if (f.wave === 3 && !f.hasan && as.foothold >= 0.55 && prevF < 0.55 + 1e-9) plantBanner(state, ctx, f);
      if (f.wave === 3 && r === 'won') {
        cityFalls(state, world, ctx, f);
        return;
      }
      const limit = BAL.waveSec[f.wave] ?? 30;
      if (as.t >= limit || r === 'over') {
        if (f.wave >= 3) {
          failFinal(state, ctx, f);
          return;
        }
        endWave(state, ctx, f, f.wave);
        as.t = 0;
        as.groupIds = [];
        f.phase = 'ara';
        f.t = 0;
        ctx.bus.emit('assault:end', { sectionId: f.main, success: false });
      }
      return;
    }
    case 'dusus': {
      setMehter(state, ctx, true);
      if (a.outcomeAt != null && a.clock >= a.outcomeAt && !state.outcome) {
        const sd = siegeDayNumber(state.time.day, state.time.siegeStartDay);
        state.outcome = { result: 'zafer', day: state.time.day, siegeDays: sd };
        f.phase = 'bitti';
      }
      return;
    }
    default:
      return;
  }
}

/** Assaults of the final assault keep their wear across waves. */
export function ensureMainAssault(state: GameState, f: FinalAssaultState): void {
  const a = army(state);
  if (!a.assaults[f.main]) {
    const as = newAssault(state, f.main, f.wave);
    as.foothold = f.foothold;
    as.exhaustion = f.exhaustion;
    a.assaults[f.main] = as;
  }
}

export function finalActive(state: GameState): boolean {
  const f = army(state).final;
  return !!f && (f.phase === 'toplanma' || f.phase === 'dalga' || f.phase === 'ara' || f.phase === 'dusus');
}

