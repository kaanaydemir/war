import type { Command } from '../../core/commands';
import type { SimContext } from '../../core/feature';
import { FLAG } from '../../core/flags';
import { addLog, type GameState, type Order, type UnitGroup } from '../../core/state';
import { sectionAt } from '../fortifications/api';
import { planMarch, recruit, startTrakya, sultanVisit, tickCampaigns } from './campaign';
import { clamp, harass, isNight, recomputeCover, tickAssault, withdraw } from './combat';
import { BAL, UNIT_TYPES } from './data';
import { declareFinal, finalActive, startFinalNow, tickFinal } from './final';
import { stepMove } from './move';
import { applyOrder, arrive } from './orders';
import { army, extraOf } from './state';

/** Army simulation tick (pure; deterministic via ctx.rng). */
export function tickArmy(state: GameState, ctx: SimContext): void {
  if (state.time.phase === 'bitti') return;
  const a = army(state);
  const dt = ctx.dtSec;
  a.clock += dt;
  recomputeCover(state);
  tickCampaigns(state, ctx);

  const night = isNight(state);
  for (const g of state.groups) {
    if (g.status === 'uzakta' || g.status === 'dagildi') continue;
    if (g.men <= 0) {
      g.status = 'dagildi';
      continue;
    }
    if (g.path.length) {
      if (stepMove(state, ctx, g)) arrive(state, ctx.world, ctx.bus, g);
    } else if (g.status === 'yuruyor' || g.status === 'cekiliyor') {
      arrive(state, ctx.world, ctx.bus, g);
    }
    tickCondition(state, ctx, g, night);
    harass(state, ctx, g);
  }

  // ordinary assaults (the final assault's main section is driven by tickFinal)
  const f = a.final;
  for (const sid of Object.keys(a.assaults)) {
    if (f && f.main === sid && finalActive(state)) continue;
    const as = a.assaults[sid];
    const r = tickAssault(state, ctx, as);
    if (r === 'won' && !as.success) {
      as.success = true;
      const sec = state.sections[sid];
      const name = sec?.name ?? sid;
      ctx.bus.emit('notify', { text: `${name}: askerlerimiz gediğe tutundu, savunucular ağır kayıp verdi! Ama şehri almak için son hücum gerekir.`, kind: 'basari' });
      addLog(state, 'basari', `${name} bölümünde hücum başarılı oldu; askerler bir süre gedikte tutundu, sonra geri çekildi.`);
      state.morale = clamp(state.morale + 4, 0, 100);
      state.divan = clamp(state.divan + 4, -100, 100);
    }
    const timeUp = as.t > BAL.maxAssaultSec || as.success;
    if (r === 'over' || timeUp) {
      if (timeUp) for (const id of as.groupIds) {
        const g = state.groups.find((x) => x.id === id);
        if (g && g.status === 'savasiyor') withdraw(state, ctx, g, false);
      }
      endAssault(state, ctx, sid);
    }
  }

  tickFinal(state, ctx);
  tickMehter(state, ctx);

  const day = Math.floor(state.time.day);
  if (day !== a.lastDay) a.lastDay = day;
}

function endAssault(state: GameState, ctx: SimContext, sid: string): void {
  const a = army(state);
  const as = a.assaults[sid];
  if (!as) return;
  delete a.assaults[sid];
  // the final assault's side sections are part of the big night; no divan penalty there
  const partOfFinal = !!a.final && a.final.side.includes(sid) && finalActive(state);
  ctx.bus.emit('assault:end', { sectionId: sid, success: as.success });
  if (as.success || partOfFinal) return;
  const frac = as.committed > 0 ? Math.min(1, as.lost / as.committed) : 0;
  state.morale = clamp(state.morale - (2 + 10 * frac), 0, 100);
  state.divan = clamp(state.divan - (2 + 8 * frac), -100, 100);
  const name = state.sections[sid]?.name ?? sid;
  ctx.bus.emit('notify', { text: `${name} hücumu püskürtüldü (${as.lost} kayıp). Moral düştü; Divan’da barış yanlıları güçleniyor.`, kind: 'tehlike' });
  addLog(state, 'kayip', `${name} hücumu püskürtüldü: ${as.lost} şehit ve yaralı; savunucular ${as.defLost} kayıp verdi.`);
}

function tickCondition(state: GameState, ctx: SimContext, g: UnitGroup, night: boolean): void {
  const dt = ctx.dtSec;
  const d = UNIT_TYPES[g.type];
  const resting = g.order.type === 'dinlen' && g.status === 'bosta';
  if (g.status === 'bosta') g.fatigue += (resting ? BAL.fatigueRest : BAL.fatigueIdle * (night ? 1.5 : 1)) * dt;
  else if (g.status === 'calisiyor') g.fatigue += BAL.fatigueWork * dt;
  g.fatigue = clamp(g.fatigue, 0, 100);
  if (g.status !== 'savasiyor') {
    const base = clamp(state.morale + (d.discipline - 0.5) * 20 - g.fatigue * 0.15 + (resting ? 6 : 0), 5, 100);
    const k = BAL.moraleDrift * (resting ? 3 : 1) * (g.status === 'cekiliyor' ? 0.5 : 1);
    g.morale += (base - g.morale) * Math.min(1, k * dt * 0.1);
    g.morale = clamp(g.morale, 0, 100);
  }
  // scouting near the walls slowly improves knowledge of the city
  if (g.status === 'calisiyor' && g.order.type === 'kesif' && state.time.phase === 'kusatma') {
    if (sectionAt(g.tx, g.ty, 14)) state.byz.intel = Math.min(70, state.byz.intel + 0.012 * dt * (g.type === 'akinci' ? 1.5 : 1));
  }
}

function tickMehter(state: GameState, ctx: SimContext): void {
  const a = army(state);
  if (finalActive(state) || (a.final && a.final.phase === 'ilan')) return; // tickFinal owns it
  const assault = Object.keys(a.assaults).length > 0;
  const marching = state.time.phase === 'yuruyus' && state.groups.some((g) => g.type === 'mehter' && g.status === 'yuruyor');
  const visit = !!a.visit && state.time.day < a.visit.until;
  const on = assault || marching || visit;
  if (on !== a.mehter) {
    a.mehter = on;
    ctx.bus.emit('mehter:play', { playing: on });
  }
}

function warn(ctx: SimContext, text: string): void {
  ctx.bus.emit('notify', { text, kind: 'uyari' });
}

export function handleArmyCommand(state: GameState, cmd: Command, ctx: SimContext): boolean {
  switch (cmd.t) {
    case 'emir': {
      const gs = cmd.groupIds.map((id) => state.groups.find((g) => g.id === id)).filter((g): g is UnitGroup => !!g);
      if (!gs.length) return false;
      if (state.flags[FLAG.sehirDustu]) return true;
      let err: string | null = null;
      gs.forEach((g, i) => {
        const r = applyOrder(state, ctx.world, ctx.bus, g, cmd.order, i, gs.length);
        if (r) err = `${g.name}: ${r}`;
      });
      if (err) warn(ctx, err);
      return true;
    }
    case 'hendek-doldur':
    case 'lagim-kaz': {
      const g = state.groups.find((x) => x.id === cmd.groupId);
      if (!g) return false;
      const order: Order = { type: cmd.t === 'hendek-doldur' ? 'hendek-doldur' : 'lagim-kaz', sectionId: cmd.sectionId };
      const r = applyOrder(state, ctx.world, ctx.bus, g, order);
      if (r) warn(ctx, `${g.name}: ${r}`);
      return true;
    }
    case 'asker-topla':
      recruit(state, ctx.bus, cmd.unit, cmd.count);
      return true;
    case 'yola-cik':
      planMarch(state, ctx.world);
      return false;
    case 'son-hucum': {
      const f = army(state).final;
      const r = f && f.phase === 'ilan' ? startFinalNow(state, ctx) : declareFinal(state, ctx);
      if (!r.ok && r.reason) warn(ctx, r.reason);
      return true;
    }
    case 'ozel': {
      if (cmd.feature !== 'army') return false;
      switch (cmd.action) {
        case 'padisah-ziyareti':
          sultanVisit(state, ctx.bus);
          return true;
        case 'trakya':
          startTrakya(state, ctx.bus);
          return true;
        case 'son-hucum-baslat': {
          const r = startFinalNow(state, ctx);
          if (!r.ok && r.reason) warn(ctx, r.reason);
          return true;
        }
        case 'emir': {
          const p = cmd.payload as { groupIds?: number[]; order?: Order } | undefined;
          if (!p?.groupIds || !p.order) return true;
          return handleArmyCommand(state, { t: 'emir', groupIds: p.groupIds, order: p.order }, ctx);
        }
        default:
          return false;
      }
    }
    default:
      return false;
  }
}

