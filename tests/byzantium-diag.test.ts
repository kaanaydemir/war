import { describe, expect, it } from 'vitest';
import { Bus, type EventName } from '../src/core/bus';
import { d, segmentOf } from '../src/core/calendar';
import { SEC_PER_DAY_KUSATMA, SIM_STEP } from '../src/core/constants';
import type { SimContext } from '../src/core/feature';
import { FLAG } from '../src/core/flags';
import { Rng } from '../src/core/rng';
import type { Difficulty, GameState } from '../src/core/state';
import type { WorldApi } from '../src/core/world';
import { createCoreState } from '../src/game/newGame';
import { createWorld } from '../src/features/world/terrain';
import { damageSection, rawBreach, sectionApproach } from '../src/features/fortifications/api';
import { initWalls, simTick as fortTick } from '../src/features/fortifications/sim';
import { spawnGroup } from '../src/features/army/api';
import { applyDefenderLosses, counterMineSkill, sectionDefense } from '../src/features/byzantium/api';
import { AI, RELIEF_WINDOW } from '../src/features/byzantium/data';
import { applyScenario, initState, simTick, updateRelief } from '../src/features/byzantium/sim';
import { byzPriv } from '../src/features/byzantium/state';

const world: WorldApi = createWorld();
const SIEGE = d(6, 4, 1453);

interface H {
  state: GameState;
  bus: Bus;
  events: { name: EventName; payload: unknown }[];
  tick: (n?: number) => void;
  runDays: (days: number, onTick?: () => void) => void;
}

function siegeState(difficulty: Difficulty = 'normal', seed = 1453): GameState {
  const s = createCoreState(difficulty, seed);
  initState(s);
  initWalls(s);
  s.time.phase = 'kusatma';
  s.time.siegeStartDay = SIEGE;
  s.time.day = SIEGE + 0.1;
  s.flags[FLAG.kusatmaBasladi] = true;
  byzPriv(s).lastDay = Math.floor(s.time.day);
  return s;
}

function harness(state: GameState, seed = 7): H {
  const bus = new Bus();
  const rng = new Rng(seed);
  const events: H['events'] = [];
  for (const n of ['sortie', 'greekfire', 'notify', 'wall:repaired', 'log'] as EventName[]) bus.on(n, (p) => events.push({ name: n, payload: p }));
  const ctx = (): SimContext => ({ dtSec: SIM_STEP, dtDays: SIM_STEP / SEC_PER_DAY_KUSATMA, rng, bus, world });
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      const c = ctx();
      state.time.day += c.dtDays;
      simTick(state, c);
      fortTick(state, c);
    }
  };
  const perDay = Math.round(SEC_PER_DAY_KUSATMA / SIM_STEP);
  const runDays = (days: number, onTick?: () => void) => {
    for (let i = 0; i < Math.round(days * perDay); i++) {
      tick();
      onTick?.();
      if (state.outcome) break;
    }
  };
  return { state, bus, events, tick, runDays };
}

/** Bombard a section with `perDay` HP spread over the daylight segment. */
function bombard(h: H, id: string, perDay: number): () => void {
  const ticksPerDaylight = (7 / 12 - 1 / 12) * (SEC_PER_DAY_KUSATMA / SIM_STEP);
  const per = perDay / ticksPerDaylight;
  let acc = 0;
  return () => {
    if (segmentOf(h.state.time.day) !== 'gunduz') return;
    acc += per;
    if (acc >= 20) {
      damageSection(h.state, h.bus, id, acc);
      acc = 0;
    }
  };
}

describe('diag', () => {
  it('prints', () => {
    for (const perDay of [0, 80, 150, 250, 350, 520]) {
      const s = siegeState();
      const h = harness(s);
      const id = 'kara-lykos';
      const out: string[] = [];
      for (let day = 0; day < 12; day++) {
        h.runDays(1, bombard(h, id, perDay));
        const sec = s.sections[id];
        if (day % 3 === 2) out.push(`d${day + 1}: o${Math.round(sec.outer)} i${Math.round(sec.inner)} bar${sec.barricade.toFixed(2)} raw${rawBreach(sec).toFixed(2)} br${sec.breach.toFixed(2)} def${sec.defenders} thr${sec.threat.toFixed(0)} mor${s.byz.morale.toFixed(1)} exh${byzPriv(s).exhaustion.toFixed(2)} rep${Math.round(byzPriv(s).repairLastNight[id] ?? 0)}`);
      }
      console.log(`perDay ${perDay}\n  ` + out.join('\n  '));
    }
    const s = siegeState('normal', 777);
    const h = harness(s, 3);
    const a = sectionApproach('kara-lykos', 3);
    spawnGroup(s, 'azap', 800, a.tx, a.ty, { status: 'calisiyor' });
    h.runDays(53, bombard(h, 'kara-lykos', 220));
    console.log('food', s.byz.food, 'morale', s.byz.morale, 'divan', s.divan, 'galata', s.galata, 'intel', s.byz.intel, 'est', s.byz.estimatedDefenders, 'def', s.byz.defenders, 'losses', s.stats.ottomanLosses, s.stats.byzantineLosses, 'arrival', s.relief.arrival - SIEGE, s.relief.knownMin - SIEGE, s.relief.knownMax - SIEGE);
    console.log(s.log.slice(-25).map((l) => `${(l.day - SIEGE).toFixed(1)} ${l.kind}: ${l.text}`).join('\n'));
    console.log(Object.values(s.sections).map((x) => `${x.id}:${x.defenders}/${x.threat.toFixed(0)}`).join(' '), 'res', s.byz.reserves);
  });
});
