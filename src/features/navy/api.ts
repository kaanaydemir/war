import { siegeDayNumber } from '../../core/calendar';
import { FLAG } from '../../core/flags';
import { nextId, RESOURCE_ADI, type GameState, type ResourceId, type Ship, type ShipType, type Side } from '../../core/state';
import { BRIDGE, NAVY_COMMANDERS, OVERLAND, SHIP_TYPES } from './data';
import { insideHorn } from './geo';
import { navyState } from './state';

/** PUBLIC API of navy (owner: navy agent). Signatures are a contract. */
export function spawnShip(state: GameState, type: ShipType, side: Side, tx: number, ty: number, hp = 100): Ship {
  const s: Ship = { id: nextId(state), type, side, tx, ty, heading: 0, hp, hpMax: hp, status: 'demirli', path: [] };
  state.ships.push(s);
  return s;
}

/** Spawn a ship with the hit points of its type definition. */
export function spawnTypedShip(state: GameState, type: ShipType, side: Side, tx: number, ty: number, heading = 0): Ship {
  const s = spawnShip(state, type, side, tx, ty, SHIP_TYPES[type]?.hp ?? 100);
  s.heading = heading;
  return s;
}

/** Ship is afloat and able to act (not sunk, not on the slipway). */
export function shipActive(s: Ship): boolean {
  return s.status !== 'batik' && s.status !== 'karada' && s.hp > 0;
}

export function ottomanShips(state: GameState): Ship[] {
  return state.ships.filter((s) => s.side === 'osmanli' && shipActive(s));
}

/** Number of afloat Ottoman ships inside the Golden Horn. */
export function ottomanShipsInHorn(state: GameState): number {
  return state.ships.filter((s) => s.side === 'osmanli' && shipActive(s) && insideHorn(s.tx, s.ty)).length;
}

/**
 * Naval blockade strength 0..1 used by byzantium to reduce supply by sea.
 * Ottoman warships outside the chain (Bosphorus / Marmara) weigh most;
 * ships inside the Golden Horn (after the overland haul) add pressure on the
 * harbour. Before the siege, Rumeli Hisarı's control of the Bosphorus gives a base value.
 */
export function blockadeStrength(state: GameState): number {
  let outside = 0;
  let inside = 0;
  for (const s of state.ships) {
    if (s.side !== 'osmanli' || !shipActive(s) || s.status === 'yaniyor') continue;
    const def = SHIP_TYPES[s.type];
    const p = (def?.power ?? 0.5) * Math.max(0.25, s.hp / Math.max(1, s.hpMax));
    if (insideHorn(s.tx, s.ty)) inside += p;
    else outside += p;
  }
  const base = state.flags[FLAG.bogazKontrol] || state.flags[FLAG.hisarTamam] ? 0.3 : 0;
  const v = Math.min(0.85, (outside / 11) * 0.85) + Math.min(0.15, (inside / 5) * 0.15);
  return Math.max(base, Math.min(1, v));
}

export interface Requirement {
  ok: boolean;
  label: string;
}

export interface OverlandCheck {
  ok: boolean;
  /** Each requirement (Turkish label) and whether it is met — for the HUD. */
  reqs: Requirement[];
  /** Operation stage: 'yok' (not started), 'kizak', 'cekiliyor', 'tamam'. */
  stage: 'yok' | 'kizak' | 'cekiliyor' | 'tamam';
  /** 0..1 overall progress. */
  progress: number;
}

/** Small ships available to haul overland (outside the Horn). */
export function haulCandidates(state: GameState): Ship[] {
  return state.ships
    .filter((s) => s.side === 'osmanli' && (s.type === 'fusta' || s.type === 'kalyete') && shipActive(s) && !insideHorn(s.tx, s.ty))
    .slice(0, OVERLAND.maxEntities);
}

/** K7 preconditions for the 'gemileri-karadan' command. */
export function overlandCheck(state: GameState): OverlandCheck {
  const n = navyState(state);
  const day = siegeDayNumber(state.time.day, state.time.siegeStartDay);
  const free = state.workforce.total - state.workforce.assigned;
  const reqs: Requirement[] = [
    { ok: state.time.phase === 'kusatma' && day != null && day >= OVERLAND.minSiegeDay, label: `En erken kuşatmanın ${OVERLAND.minSiegeDay}. günü` },
  ];
  for (const [r, v] of Object.entries(OVERLAND.cost) as [ResourceId, number][]) {
    reqs.push({ ok: state.resources[r] >= v, label: `${v} ${RESOURCE_ADI[r].toLocaleLowerCase('tr')}` });
  }
  reqs.push({ ok: free >= OVERLAND.workers, label: `${OVERLAND.workers} boşta işçi (öküz koşumları ve kızak)` });
  reqs.push({ ok: state.galata >= OVERLAND.minGalata, label: 'Galata sakin olmalı' });
  reqs.push({ ok: haulCandidates(state).length >= OVERLAND.minEntities, label: 'Boğaz\'da yeterli fusta ve kalyete' });
  const o = n.overland;
  const progress = o.stage === 'tamam' ? 1 : o.stage === 'yok' ? 0 : o.slipway * 0.3 + (o.total ? (o.hauled / o.total) * 0.7 : 0);
  return {
    ok: o.stage === 'yok' && !state.flags[FLAG.gemilerKaradan] && reqs.every((r) => r.ok),
    reqs,
    stage: state.flags[FLAG.gemilerKaradan] ? 'tamam' : o.stage,
    progress,
  };
}

export interface BridgeCheck {
  ok: boolean;
  reqs: Requirement[];
  stage: 'yok' | 'insa' | 'tamam';
  progress: number;
}

/** K9 preconditions for {t:'ozel', feature:'navy', action:'kopru'}. */
export function bridgeCheck(state: GameState): BridgeCheck {
  const n = navyState(state);
  const free = state.workforce.total - state.workforce.assigned;
  const reqs: Requirement[] = [{ ok: !!state.flags[FLAG.gemilerKaradan], label: 'Gemiler Haliç\'e indirilmiş olmalı' }];
  for (const [r, v] of Object.entries(BRIDGE.cost) as [ResourceId, number][]) {
    reqs.push({ ok: state.resources[r] >= v, label: `${v} ${RESOURCE_ADI[r].toLocaleLowerCase('tr')}` });
  }
  reqs.push({ ok: free >= BRIDGE.workers, label: `${BRIDGE.workers} boşta işçi` });
  const stage = state.flags[FLAG.halicKoprusu] ? 'tamam' : n.bridge.stage;
  return { ok: stage === 'yok' && reqs.every((r) => r.ok), reqs, stage, progress: stage === 'tamam' ? 1 : n.bridge.progress };
}

/** Current fleet commander. */
export function navyCommander(state: GameState): { id: string; name: string; title: string } {
  return NAVY_COMMANDERS[navyState(state).commander];
}

/** Wind (for UI/atmosphere): strength 0..1, direction in tile-space radians (blowing toward). */
export function windNow(state: GameState): { strength: number; dir: number } {
  const w = navyState(state).wind;
  return { strength: w.s, dir: w.dir };
}

/** Display name of a ship (flagship / named ships), falling back to its type name. */
export function shipName(state: GameState, ship: Ship): string {
  const e = navyState(state).extra[ship.id];
  return e?.name ?? SHIP_TYPES[ship.type]?.name ?? ship.type;
}

/** True while the 20 Nisan battle is being fought. */
export function navalBattleActive(state: GameState): boolean {
  const st = navyState(state).battle.stage;
  return st === 'yaklasma' || st === 'savas';
}
