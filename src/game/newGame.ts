import { d } from '../core/calendar';
import type { Difficulty, GameState, WallSection } from '../core/state';
import { SECTIONS } from '../data/sections';

/**
 * Core initial state. Features add their entities in Feature.initState().
 * Numbers here are starting defaults; owning features may rebalance them in initState.
 */
export function createCoreState(difficulty: Difficulty, seed: number): GameState {
  const sections: Record<string, WallSection> = {};
  for (const s of SECTIONS) {
    const land = s.kind === 'kara';
    const max = Math.round(1000 * s.strength);
    sections[s.id] = {
      id: s.id,
      name: s.name,
      kind: s.kind,
      outer: land ? Math.round(max * 0.8) : 0,
      outerMax: land ? Math.round(max * 0.8) : 0,
      inner: max,
      innerMax: max,
      moatFill: 0,
      barricade: 0,
      breach: 0,
      defenders: s.defenders,
      threat: 0,
      towersDown: 0,
    };
  }
  const defenders = SECTIONS.reduce((a, s) => a + s.defenders, 0);
  return {
    version: 1,
    seed,
    rngState: seed,
    difficulty,
    idSeq: 0,
    time: {
      day: d(1, 3, 1452),
      phase: 'hazirlik',
      speed: 0,
      debugSpeed: 1,
      marchStartDay: null,
      siegeStartDay: null,
      autoPauseAtDawn: true,
    },
    resources: { akce: 15000, tas: 300, kereste: 300, maden: 60, tunc: 0, barut: 40, gulle: 0, erzak: 20000, yag: 0 },
    workforce: { total: 1200, assigned: 0 },
    morale: 70,
    divan: 10,
    galata: 0,
    relief: { arrival: d(10, 6, 1453), knownMin: d(20, 5, 1453), knownMax: d(15, 7, 1453), arrived: false, notes: [] },
    byz: {
      defenders,
      reserves: Math.max(0, 7000 - defenders),
      morale: 65,
      food: 120,
      repairCrews: 2000,
      intel: 10,
      estimatedDefenders: 10000,
      giustinianiWounded: false,
      emperorAlive: true,
    },
    sections,
    buildings: [],
    groups: [],
    cannons: [],
    ships: [],
    mines: [],
    events: { fired: {}, queue: [], active: null, choices: {} },
    flags: {},
    log: [],
    stats: { ottomanLosses: 0, byzantineLosses: 0, shotsFired: 0, breaches: 0, assaults: 0, shipsLost: 0 },
    outcome: null,
    features: {},
  };
}
