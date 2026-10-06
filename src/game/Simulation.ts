import type { Bus } from '../core/bus';
import { segmentOf } from '../core/calendar';
import type { Command } from '../core/commands';
import { SEC_PER_DAY_HAZIRLIK, SEC_PER_DAY_KUSATMA, SEC_PER_DAY_YURUYUS, SIM_STEP } from '../core/constants';
import type { Feature, SimContext } from '../core/feature';
import { FLAG } from '../core/flags';
import { Rng } from '../core/rng';
import { addLog, type GameState } from '../core/state';
import type { Store } from '../core/store';
import type { WorldApi } from '../core/world';

/** Days the march from Edirne takes (23 Mart → 5 Nisan ≈ 13 days). */
export const MARCH_DAYS = 13;

/**
 * Fixed-step simulation driver. Owns: time advance, day-segment events,
 * phase transitions (hazirlik → yuruyus → kusatma), command dispatch, outcome.
 */
export class Simulation {
  private acc = 0;
  private rng: Rng;
  private lastOutcome: unknown = null;
  private notifyAcc = 0;

  constructor(
    public state: GameState,
    private features: Feature[],
    private bus: Bus,
    private world: WorldApi,
    private store: Store,
  ) {
    this.rng = new Rng(state.rngState);
  }

  secPerDay(): number {
    switch (this.state.time.phase) {
      case 'hazirlik':
        return SEC_PER_DAY_HAZIRLIK;
      case 'yuruyus':
        return SEC_PER_DAY_YURUYUS;
      default:
        return SEC_PER_DAY_KUSATMA;
    }
  }

  private ctx(dtSec: number): SimContext {
    return { dtSec, dtDays: dtSec / this.secPerDay(), rng: this.rng, bus: this.bus, world: this.world };
  }

  /** Call every frame with real elapsed seconds. */
  update(realDt: number): void {
    const s = this.state;
    for (const cmd of this.store.drain()) this.apply(cmd);
    let speed = s.time.speed * s.time.debugSpeed;
    if (s.outcome || s.time.phase === 'bitti') speed = 0;
    if (speed > 0) {
      this.acc += Math.min(realDt, 0.25) * speed;
      let steps = 0;
      while (this.acc >= SIM_STEP && steps < 240) {
        this.tick();
        this.acc -= SIM_STEP;
        steps++;
      }
      if (steps >= 240) this.acc = 0;
    }
    if (s.outcome && s.outcome !== this.lastOutcome) {
      this.lastOutcome = s.outcome;
      s.time.phase = 'bitti';
      this.bus.emit('outcome', s.outcome);
    }
    this.notifyAcc += realDt;
    if (this.notifyAcc > 0.12) {
      this.notifyAcc = 0;
      this.store.notify();
    }
  }

  /** Advance exactly one fixed step (also used by tests/scenarios). */
  tick(): void {
    const s = this.state;
    const ctx = this.ctx(SIM_STEP);
    const prevSeg = segmentOf(s.time.day);
    const prevDay = Math.floor(s.time.day);
    s.time.day += ctx.dtDays;
    const seg = segmentOf(s.time.day);
    if (seg !== prevSeg) {
      this.bus.emit('time:segment', { segment: seg, day: s.time.day });
      if (seg === 'safak') this.bus.emit('time:dawn', { day: s.time.day });
    } else if (Math.floor(s.time.day) !== prevDay && s.time.phase !== 'kusatma') {
      this.bus.emit('time:dawn', { day: s.time.day });
    }

    // March → siege transition (core-owned so the game always progresses).
    if (s.time.phase === 'yuruyus' && s.time.marchStartDay != null && s.time.day >= s.time.marchStartDay + MARCH_DAYS) {
      this.startSiege();
    }

    for (const f of this.features) {
      if (!f.simTick) continue;
      try {
        f.simTick(s, ctx);
      } catch (err) {
        console.error(`[sim] ${f.id}.simTick failed`, err);
      }
    }
    s.rngState = this.rng.state;
  }

  startSiege(): void {
    const s = this.state;
    s.time.phase = 'kusatma';
    // siege day 1 starts at the dawn of the arrival day
    s.time.day = Math.floor(s.time.day);
    s.time.siegeStartDay = s.time.day;
    s.flags[FLAG.kusatmaBasladi] = true;
    addLog(s, 'olay', 'Ordu surların önüne vardı. Kuşatma başladı.');
    this.bus.emit('phase:changed', { phase: 'kusatma' });
  }

  apply(cmd: Command): void {
    const s = this.state;
    const ctx = this.ctx(0);
    // core commands
    if (cmd.t === 'hiz') {
      s.time.speed = cmd.speed;
      return;
    }
    if (cmd.t === 'yola-cik') {
      // Core owns the phase change; every feature is then notified (return value ignored).
      if (s.time.phase !== 'hazirlik') return;
      s.time.phase = 'yuruyus';
      s.time.marchStartDay = s.time.day;
      s.flags[FLAG.yolaCikildi] = true;
      addLog(s, 'olay', 'Ordu Edirne\'den yola çıktı.');
      for (const f of this.features) {
        try {
          f.handleCommand?.(s, cmd, ctx);
        } catch (err) {
          console.error(`[sim] ${f.id}.handleCommand failed`, err);
        }
      }
      this.bus.emit('phase:changed', { phase: 'yuruyus' });
      return;
    }
    for (const f of this.features) {
      try {
        if (f.handleCommand?.(s, cmd, ctx)) return;
      } catch (err) {
        console.error(`[sim] ${f.id}.handleCommand failed`, err);
        return;
      }
    }
  }
}
