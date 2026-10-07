import { segmentOf } from '../../core/calendar';
import type { SimContext } from '../../core/feature';
import { addLog, type GameState, type SectionId, type UnitGroup } from '../../core/state';
import { applyDefenderLosses, sectionDefense } from '../byzantium/api';
import { assaultOpenness, sectionAt, sectionPoint } from '../fortifications/api';
import { assaultBonus } from '../siegeworks/api';
import { damageGroup } from './api-core';
import { BAL, UNIT_TYPES } from './data';
import { frontPoint, isLandSection } from './geo';
import { sendTo } from './move';
import { army, extraOf, type AssaultState } from './state';

/**
 * Assault resolution (pure). Each active assault on a wall section pits the
 * storming groups' effective power (limited by the frontage a breach allows)
 * against the section's defense multiplied by the wall's remaining height.
 * See BAL in data.ts for the formulas.
 */

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export function routMorale(g: UnitGroup): number {
  return BAL.routMoraleBase - BAL.routMoraleDisc * UNIT_TYPES[g.type].discipline;
}

export function isNight(state: GameState): boolean {
  return segmentOf(state.time.day) === 'gece';
}

/** Commander multiplier on attack. */
export function commanderMult(g: UnitGroup, sectionId: SectionId | null): number {
  switch (g.commanderId) {
    case 'fatih':
      return 1.15;
    case 'karaca':
      return sectionId && /blahernai|egrikapi/.test(sectionId) ? 1.1 : 1.04;
    case 'ishak':
      return 1.1;
    case 'mahmud':
    case 'zaganos':
    case 'saruca':
      return 1.05;
    default:
      return 1;
  }
}

/** Is a mehter band playing within ~16 tiles? */
export function mehterNear(state: GameState, tx: number, ty: number): boolean {
  if (!army(state).mehter) return false;
  for (const g of state.groups) {
    if (g.type !== 'mehter' || g.status === 'uzakta' || g.status === 'dagildi' || g.men <= 0) continue;
    if (Math.hypot(g.tx - tx, g.ty - ty) < 16) return true;
  }
  return false;
}

/** Per-man effective fighting value for storming a wall. */
export function groupQuality(state: GameState, g: UnitGroup, sectionId: SectionId | null): number {
  const d = UNIT_TYPES[g.type];
  const moraleF = 0.4 + 0.8 * (g.morale / 100);
  const fatigueF = 1 - 0.5 * (g.fatigue / 100);
  const xpF = 1 + g.xp / 400;
  return d.attack * Math.max(0.05, d.siege) * moraleF * fatigueF * xpF * commanderMult(g, sectionId);
}

/** Archer suppression of a section (0..coverMax). */
export function coverOf(state: GameState, sectionId: SectionId): number {
  return army(state).cover[sectionId] ?? 0;
}

/** Recompute archer cover from groups on 'bombardimani-koru'. */
export function recomputeCover(state: GameState): void {
  const a = army(state);
  const acc: Record<string, number> = {};
  for (const g of state.groups) {
    if (g.order.type !== 'bombardimani-koru' || g.status !== 'calisiyor' || !g.order.sectionId) continue;
    const archer = g.type === 'azap' ? 1 : g.type === 'yeniceri' ? 0.8 : g.type === 'akinci' ? 0.6 : 0.35;
    const night = isNight(state) ? 0.45 : 1;
    acc[g.order.sectionId] = (acc[g.order.sectionId] ?? 0) + g.men * archer * (0.5 + g.morale / 200) * night;
  }
  a.cover = {};
  for (const [sid, v] of Object.entries(acc)) {
    const sec = state.sections[sid];
    const defs = Math.max(150, sec?.defenders ?? 500);
    a.cover[sid] = clamp((v * BAL.coverPerMan * 900) / defs, 0, BAL.coverMax);
  }
}

/** Remove men with batching so the render doesn't get a casualty event every tick. */
export function bleed(state: GameState, ctx: SimContext, g: UnitGroup, men: number, force = false): number {
  const e = extraOf(state, g.id);
  e.lossAcc = (e.lossAcc ?? 0) + men;
  const thresh = Math.max(4, g.men * 0.006);
  if (e.lossAcc >= thresh || (force && e.lossAcc >= 1)) {
    const n = Math.min(g.men, Math.floor(e.lossAcc));
    e.lossAcc -= n;
    if (n > 0) damageGroup(state, ctx.bus, g.id, n);
    if (g.men <= 0) disband(state, ctx, g);
    return n;
  }
  return 0;
}

export function disband(state: GameState, ctx: SimContext, g: UnitGroup): void {
  g.men = 0;
  g.status = 'dagildi';
  g.path = [];
  addLog(state, 'kayip', `${g.name} dağıldı.`);
}

/** Withdraw to camp. routed=true emits 'group:routed'. */
export function withdraw(state: GameState, ctx: SimContext, g: UnitGroup, routed: boolean): void {
  if (g.status === 'dagildi') return;
  const e = extraOf(state, g.id);
  g.order = { type: 'geri-cekil' };
  g.status = 'cekiliyor';
  const home = e.home ?? { tx: g.tx - 8, ty: g.ty };
  if (!sendTo(state, ctx.world, g, home)) g.path = [];
  if (routed) {
    ctx.bus.emit('group:routed', { groupId: g.id });
    addLog(state, 'kayip', `${g.name} bozuldu ve geri kaçıyor.`);
  }
}

export interface AssaultMods {
  /** Max foothold this assault may reach (waves 1–2 of the final assault are capped). */
  cap: number;
  /** Multiplier on defense (Giustiniani wounded, Kerkoporta, banner). */
  defMult: number;
  /** Multiplier on attack (Sultan present, wave elan). */
  attMult: number;
}

export const NO_MODS: AssaultMods = { cap: 1, defMult: 1, attMult: 1 };

export function assaultMembers(state: GameState, sid: SectionId): UnitGroup[] {
  return state.groups.filter((g) => g.status === 'savasiyor' && g.order.type === 'hucum' && g.order.sectionId === sid && g.men > 0);
}

export function newAssault(state: GameState, sid: SectionId, wave: number): AssaultState {
  return {
    sectionId: sid,
    wave,
    startDay: state.time.day,
    t: 0,
    groupIds: [],
    foothold: 0,
    exhaustion: 0,
    committed: 0,
    lost: 0,
    defLost: 0,
    defAcc: 0,
    intensity: 0,
    ratio: 0,
    clashAcc: 0,
    volleyAcc: 0,
    success: false,
  };
}

export interface AssaultSnapshot {
  open: number;
  O: number;
  D: number;
  ratio: number;
  engaged: number;
  men: number;
}

/** Compute the current balance of an assault (no side effects). */
export function assaultBalance(state: GameState, sid: SectionId, members: UnitGroup[], exhaustion: number, mods: AssaultMods): AssaultSnapshot {
  const sec = state.sections[sid];
  const open = sec ? assaultOpenness(sec) : 0;
  const frontage = BAL.FRONT_BASE + BAL.FRONT_OPEN * open;
  let men = 0;
  for (const g of members) men += g.men;
  const eFrac = men > 0 ? Math.min(1, frontage / men) : 0;
  let O = 0;
  for (const g of members) {
    const q = groupQuality(state, g, sid);
    O += q * (g.men * eFrac + g.men * (1 - eFrac) * BAL.RESERVE_W);
  }
  const mid = sectionPoint(sid, 0.5);
  O *= Math.max(1, assaultBonus(state, sid)) * mods.attMult;
  if (mehterNear(state, mid.tx, mid.ty)) O *= 1.08;
  if (isNight(state)) O *= 0.92;
  const cover = coverOf(state, sid);
  const Draw = Math.max(0, sectionDefense(state, sid));
  const D = Draw * (1 + BAL.WALL_ADV * (1 - open)) * (1 - cover) * (1 - 0.5 * exhaustion) * mods.defMult;
  return { open, O, D, ratio: O / Math.max(1, D), engaged: Math.min(men, frontage), men };
}

/**
 * One tick of an assault. Returns 'ok' while it continues, 'won' if the
 * foothold reached its cap at 1, or 'over' when every storming group is gone.
 */
export function tickAssault(state: GameState, ctx: SimContext, a: AssaultState, mods: AssaultMods = NO_MODS): 'ok' | 'won' | 'over' {
  const dt = ctx.dtSec;
  const sid = a.sectionId;
  const members = assaultMembers(state, sid);
  a.groupIds = members.map((g) => g.id);
  if (!members.length) return 'over';
  a.t += dt;
  const snap = assaultBalance(state, sid, members, a.exhaustion, mods);
  const { open, O, ratio } = snap;
  a.ratio = ratio;
  const prevFoot = a.foothold;
  const drive = clamp(ratio - 1, -1, 2.5);
  a.foothold = clamp(a.foothold + BAL.FOOT_RATE * (0.2 + open) * drive * dt, 0, mods.cap);
  const rising = a.foothold > prevFoot;
  a.exhaustion = clamp(a.exhaustion + BAL.exhaustRate * Math.min(2, ratio) * dt, 0, 0.7);

  // defender losses
  const sec = state.sections[sid];
  a.defAcc += BAL.defKill * O * (0.12 + open) * (1 + 0.5 * a.foothold) * dt;
  if (a.defAcc >= 1 && sec) {
    const n = Math.min(sec.defenders, Math.floor(a.defAcc));
    a.defAcc -= n;
    if (n > 0) {
      applyDefenderLosses(state, ctx.bus, sid, n);
      a.defLost += n;
    }
  }

  // attacker losses: the engaged men take most of it
  const cover = coverOf(state, sid);
  const Draw = Math.max(0, sectionDefense(state, sid));
  const night = isNight(state) ? 0.8 : 1;
  const special = mods.defMult;
  const loss = BAL.attKill * Draw * (1 - cover) * special * (1.3 - 0.6 * open) * night * (0.5 + 0.5 * Math.min(2, snap.engaged / 1000)) * dt;
  const menTotal = snap.men || 1;
  const disc = (g: UnitGroup) => UNIT_TYPES[g.type].discipline;
  for (const g of members) {
    const share = g.men / menTotal;
    const before = g.men;
    const lost = loss * share;
    a.lost += bleed(state, ctx, g, lost);
    // morale
    g.morale -= (lost / Math.max(1, before)) * BAL.moraleLossPerCasualty;
    g.morale -= dt * 0.22 * (1 - disc(g)) * (ratio < 1 ? 2.2 : 0.6);
    if (rising) g.morale += dt * 0.3;
    g.morale = clamp(g.morale, 0, 100);
    g.fatigue = clamp(g.fatigue + BAL.fatigueFight * dt, 0, 100);
    g.xp = clamp(g.xp + 0.3 * dt, 0, 100);
    if (g.status === 'savasiyor' && g.morale < routMorale(g)) withdraw(state, ctx, g, true);
  }

  // render cues
  a.intensity = clamp((snap.engaged / 1600) * (0.55 + 0.45 * Math.min(2, ratio) / 2), 0.15, 1);
  a.clashAcc += dt;
  if (a.clashAcc >= 0.45) {
    a.clashAcc = 0;
    const t = 0.2 + ctx.rng.next() * 0.6;
    const p = frontPoint(null, sid, t, 0.4);
    ctx.bus.emit('assault:clash', { sectionId: sid, at: { tx: p.tx, ty: p.ty }, intensity: a.intensity });
  }
  a.volleyAcc += dt;
  if (a.volleyAcc >= 0.9) {
    a.volleyAcc = 0;
    const t = 0.2 + ctx.rng.next() * 0.6;
    const wall = sectionPoint(sid, t);
    const tgt = frontPoint(null, sid, t + (ctx.rng.next() - 0.5) * 0.2, 2.5 + ctx.rng.next() * 2);
    const defs = sec?.defenders ?? 0;
    if (defs > 0) ctx.bus.emit('arrows:volley', { from: wall, to: tgt, count: Math.max(2, Math.min(14, Math.round(defs / 60))), side: 'bizans' });
    const archers = members.filter((g) => g.type === 'azap' || g.type === 'yeniceri');
    if (archers.length) {
      const from = frontPoint(null, sid, t, 4);
      ctx.bus.emit('arrows:volley', { from, to: wall, count: Math.min(16, 3 + archers.length * 3), side: 'osmanli' });
    }
  }
  if (a.foothold >= 1 - 1e-6) return 'won';
  return 'ok';
}

/** Defender archers harass groups working/standing near the walls (day mostly). */
export function harass(state: GameState, ctx: SimContext, g: UnitGroup): void {
  if (g.status === 'savasiyor' || g.status === 'uzakta' || g.status === 'dagildi' || g.men <= 0) return;
  if (state.time.phase !== 'kusatma' || state.flags['sehirDustu']) return;
  const sid = sectionAt(g.tx, g.ty, 5.5);
  if (!sid || !isLandSection(sid)) return;
  const sec = state.sections[sid];
  if (!sec || sec.defenders <= 0) return;
  const exposure = g.status === 'calisiyor' ? 1 : 0.45;
  const light = isNight(state) ? 0.3 : 1;
  const rate = BAL.arrowHarass * (sec.defenders / 1000) * (1 - coverOf(state, sid)) * exposure * light;
  bleed(state, ctx, g, rate * ctx.dtSec);
  const e = extraOf(state, g.id);
  e.harassAcc = (e.harassAcc ?? 0) + ctx.dtSec;
  if (e.harassAcc > 2.4) {
    e.harassAcc = 0;
    ctx.bus.emit('arrows:volley', {
      from: sectionPoint(sid, 0.5),
      to: { tx: g.tx, ty: g.ty },
      count: Math.max(2, Math.min(8, Math.round(sec.defenders / 120))),
      side: 'bizans',
    });
  }
}
