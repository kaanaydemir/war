/**
 * The audio engine: ONE AudioContext for the whole page, created lazily and
 * resumed on the first user gesture (browsers block audio before that).
 *
 * This is deliberately a page-lifetime singleton (unlike render objects, which
 * are rebuilt per scene): the context, buses, reverbs and music must survive
 * GameScene restarts (title → new game) so music can crossfade across them.
 *
 * Graph:
 *   voices ─┬─ lowpass ─ pan ─┬───────────────▶ sfx/amb/ui bus ─┐
 *           │                 └─ wet ─▶ outdoor reverb ─▶ sfx ──┤
 *           └─ echo send ─▶ ping-pong hill echo ─▶ sfx ────────┤
 *   music pieces ─┬────────────────────▶ music bus ─ duck ───────┤
 *                 └─ hall reverb ─────▶ music bus                ├─▶ master ─ limiter ─▶ out
 *   ambience beds ─────────────────────▶ amb bus ─ duck ─────────┘
 *
 * Every public method is safe to call when audio is unavailable (headless,
 * old browsers, blocked context): it simply does nothing.
 */
import { sliderGain, smooth01, VoiceLimiter, type Spatial } from './mix';
import { gainNode, ksBuffer, makeBuffers, makeImpulse, makeWaves, type Buffers, type Dest, type Waves } from './synth';

export type BusName = 'music' | 'sfx' | 'amb' | 'ui';

export interface VoiceOpts {
  bus?: BusName;
  /** Higher = more important (steals lower). */
  pri: number;
  /** Expected length (s) for the voice limiter and cleanup. */
  dur: number;
  sp?: Spatial | null;
  /** Extra linear gain. */
  gain?: number;
  /** Echo-off-the-hills send 0..1. */
  echo?: number;
  /** Extra start delay (s). */
  delay?: number;
}

export interface Voice extends Dest {
  id: number;
}

interface LiveVoice {
  g: GainNode;
  nodes: AudioNode[];
  srcs: AudioScheduledSourceNode[];
  timer: ReturnType<typeof setTimeout> | null;
}

export interface LoopHandle {
  dest: Dest;
  setSpatial(sp: Spatial, ramp?: number): void;
  setLevel(v: number, ramp?: number): void;
  stop(fade?: number): void;
  alive(): boolean;
}

type Ctor = typeof AudioContext;

function audioCtor(): Ctor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  failed = false;
  bufs!: Buffers;
  waves!: Waves;
  master!: GainNode;
  buses!: Record<BusName, GainNode>;
  musicDuck!: GainNode;
  ambDuck!: GainNode;
  revIn!: GainNode;
  hallIn!: GainNode;
  echoIn!: GainNode;
  limiter = new VoiceLimiter(30);
  uiLimiter = new VoiceLimiter(6);
  private live = new Map<number, LiveVoice>();
  private loops = new Set<LoopHandle>();
  private readyCbs: (() => void)[] = [];
  private gestureInstalled = false;
  private vol = { music: 0.6, sfx: 0.8, sfxScale: 1 };

  /** True once the context exists and is running (or at least created). */
  get ready(): boolean {
    return !!this.ctx && !this.failed;
  }

  now(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  /** Register `fn` to run once the context is created (immediately if ready). */
  onReady(fn: () => void): void {
    if (this.ready) {
      try {
        fn();
      } catch (err) {
        console.error('[audio] onReady failed', err);
      }
    } else this.readyCbs.push(fn);
  }

  /** Install one-time document listeners that unlock audio on the first gesture. */
  installGesture(): void {
    if (this.gestureInstalled || typeof document === 'undefined') return;
    this.gestureInstalled = true;
    const unlock = () => this.unlock();
    for (const ev of ['pointerdown', 'keydown', 'touchstart', 'mousedown']) {
      document.addEventListener(ev, unlock, { capture: true, passive: true });
    }
    document.addEventListener('visibilitychange', () => this.onVisibility());
  }

  /** Create/resume the context. Must be called from a user gesture. */
  unlock(): void {
    if (this.failed) return;
    try {
      if (!this.ctx) {
        const C = audioCtor();
        if (!C) {
          this.failed = true;
          return;
        }
        this.ctx = new C({ latencyHint: 'interactive' });
        this.build();
        const cbs = this.readyCbs;
        this.readyCbs = [];
        for (const fn of cbs) {
          try {
            fn();
          } catch (err) {
            console.error('[audio] onReady failed', err);
          }
        }
      }
      if (this.ctx.state === 'suspended' && !(typeof document !== 'undefined' && document.hidden)) {
        this.ctx.resume().catch(() => {});
      }
    } catch (err) {
      this.failed = true;
      this.ctx = null;
      console.info('[audio] WebAudio unavailable — oyun sessiz devam ediyor', err);
    }
  }

  private build(): void {
    const ctx = this.ctx!;
    this.bufs = makeBuffers(ctx);
    this.waves = makeWaves(ctx);

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -9;
    comp.knee.value = 8;
    comp.ratio.value = 10;
    comp.attack.value = 0.004;
    comp.release.value = 0.28;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(comp);

    const mk = (out: AudioNode, v = 1): GainNode => {
      const g = ctx.createGain();
      g.gain.value = v;
      g.connect(out);
      return g;
    };
    this.musicDuck = mk(this.master);
    this.ambDuck = mk(this.master);
    this.buses = {
      music: mk(this.musicDuck),
      sfx: mk(this.master),
      amb: mk(this.ambDuck),
      ui: mk(this.master),
    };

    // Outdoor reverb (open field, walls & hills) — returns into the sfx bus.
    const rev = ctx.createConvolver();
    rev.buffer = makeImpulse(ctx, 2.8, 3.2, { early: 7, damp: 0.75 });
    this.revIn = mk(rev, 0.7);
    rev.connect(this.buses.sfx);

    // Hall reverb for the music (big, warm).
    const hall = ctx.createConvolver();
    hall.buffer = makeImpulse(ctx, 3.6, 2.4, { early: 4, damp: 0.55 });
    this.hallIn = mk(hall, 0.8);
    hall.connect(this.buses.music);

    // Ping-pong "echo off the hills" (dark, long).
    const dL = ctx.createDelay(3);
    const dR = ctx.createDelay(3);
    dL.delayTime.value = 0.63;
    dR.delayTime.value = 0.94;
    const lpL = ctx.createBiquadFilter();
    const lpR = ctx.createBiquadFilter();
    lpL.type = lpR.type = 'lowpass';
    lpL.frequency.value = 700;
    lpR.frequency.value = 520;
    this.echoIn = ctx.createGain();
    this.echoIn.connect(dL);
    dL.connect(lpL);
    dR.connect(lpR);
    const fbL = mk(dR, 0.42);
    const fbR = mk(dL, 0.36);
    lpL.connect(fbL);
    lpR.connect(fbR);
    const panL = ctx.createStereoPanner();
    const panR = ctx.createStereoPanner();
    panL.pan.value = -0.65;
    panR.pan.value = 0.6;
    lpL.connect(panL);
    lpR.connect(panR);
    const echoOut = mk(this.buses.sfx, 0.85);
    panL.connect(echoOut);
    panR.connect(echoOut);
    echoOut.connect(this.revIn);

    this.applyVolumes(0);
  }

  // ───────────────────────────── Volumes & ducking ─────────────────────────────

  setVolumes(music: number, sfx: number, sfxScale = 1): void {
    if (this.vol.music === music && this.vol.sfx === sfx && this.vol.sfxScale === sfxScale) return;
    this.vol = { music, sfx, sfxScale };
    this.applyVolumes(0.25);
  }

  private applyVolumes(ramp: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const set = (g: GainNode, v: number) => {
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(v, t + Math.max(0.01, ramp));
    };
    const s = sliderGain(this.vol.sfx);
    set(this.buses.music, sliderGain(this.vol.music) * 0.95);
    set(this.buses.sfx, s * this.vol.sfxScale);
    set(this.buses.amb, s * (0.6 + 0.4 * this.vol.sfxScale));
    set(this.buses.ui, Math.max(0.15, s) * 0.9);
  }

  /** Briefly duck music & ambience under a huge sound. amount 0..1. */
  duck(amount: number, hold = 0.4, release = 2.2): void {
    if (!this.ctx || amount <= 0.02) return;
    const t = this.ctx.currentTime;
    const a = smooth01(amount);
    for (const [g, depth] of [
      [this.musicDuck, 0.55],
      [this.ambDuck, 0.4],
    ] as const) {
      const p = g.gain;
      p.cancelScheduledValues(t);
      p.setValueAtTime(p.value, t);
      p.linearRampToValueAtTime(Math.max(0.2, 1 - depth * a), t + 0.05);
      p.setValueAtTime(Math.max(0.2, 1 - depth * a), t + 0.05 + hold);
      p.linearRampToValueAtTime(1, t + 0.05 + hold + release);
    }
  }

  private onVisibility(): void {
    if (!this.ctx) return;
    try {
      if (document.hidden) {
        const t = this.ctx.currentTime;
        this.master.gain.cancelScheduledValues(t);
        this.master.gain.setValueAtTime(this.master.gain.value, t);
        this.master.gain.linearRampToValueAtTime(0, t + 0.2);
        setTimeout(() => {
          if (document.hidden) this.ctx?.suspend().catch(() => {});
        }, 300);
      } else {
        this.ctx.resume().catch(() => {});
        const t = this.ctx.currentTime;
        this.master.gain.cancelScheduledValues(t);
        this.master.gain.setValueAtTime(0, t);
        this.master.gain.linearRampToValueAtTime(0.9, t + 0.6);
      }
    } catch {
      /* ignore */
    }
  }

  // ───────────────────────────── Voices ─────────────────────────────

  /**
   * Allocate a one-shot voice. Returns null when audio is unavailable, the
   * sound would be inaudible, or the voice limiter rejects it.
   */
  voice(o: VoiceOpts): Voice | null {
    const ctx = this.ctx;
    if (!ctx || this.failed || ctx.state === 'closed') return null;
    const sp = o.sp ?? null;
    const level = (o.gain ?? 1) * (sp ? sp.gain : 1);
    if (level < 0.012) return null;
    const now = ctx.currentTime;
    const lim = o.bus === 'ui' ? this.uiLimiter : this.limiter;
    const grant = lim.acquire(o.pri, now, o.dur);
    if (!grant) return null;
    for (const id of grant.steal) this.kill(id);
    try {
      const bus = this.buses[o.bus ?? 'sfx'];
      const g = ctx.createGain();
      g.gain.value = level;
      const nodes: AudioNode[] = [g];
      let tail: AudioNode = g;
      if (sp && sp.cutoff < 16000) {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = sp.cutoff;
        lp.Q.value = 0.5;
        tail.connect(lp);
        tail = lp;
        nodes.push(lp);
      }
      const pan = ctx.createStereoPanner();
      pan.pan.value = sp ? sp.pan : 0;
      tail.connect(pan);
      pan.connect(bus);
      nodes.push(pan);
      if (o.bus !== 'ui' && o.bus !== 'music') {
        const wet = ctx.createGain();
        wet.gain.value = sp ? sp.wet : 0.15;
        pan.connect(wet);
        wet.connect(this.revIn);
        nodes.push(wet);
      }
      let echo: AudioNode | null = null;
      if (o.echo && o.echo > 0) {
        const e = ctx.createGain();
        e.gain.value = o.echo;
        e.connect(this.echoIn);
        echo = e;
        nodes.push(e);
      }
      const lv: LiveVoice = { g, nodes, srcs: [], timer: null };
      this.live.set(grant.id, lv);
      lv.timer = setTimeout(() => this.cleanup(grant.id), (o.dur + (o.delay ?? 0) + (sp?.delay ?? 0) + 1.5) * 1000);
      const t = now + 0.01 + (o.delay ?? 0) + (sp ? sp.delay : 0);
      return {
        id: grant.id,
        ctx,
        bufs: this.bufs,
        waves: this.waves,
        out: g,
        echo,
        far: sp ? sp.far : 0,
        t,
        track: (s) => lv.srcs.push(s),
      };
    } catch (err) {
      lim.release(grant.id);
      console.warn('[audio] voice failed', err);
      return null;
    }
  }

  private kill(id: number): void {
    const lv = this.live.get(id);
    if (!lv || !this.ctx) return;
    const t = this.ctx.currentTime;
    try {
      lv.g.gain.cancelScheduledValues(t);
      lv.g.gain.setValueAtTime(lv.g.gain.value, t);
      lv.g.gain.linearRampToValueAtTime(0, t + 0.05);
      for (const s of lv.srcs) {
        try {
          s.stop(t + 0.06);
        } catch {
          /* already stopped */
        }
      }
    } catch {
      /* ignore */
    }
    if (lv.timer) clearTimeout(lv.timer);
    lv.timer = setTimeout(() => this.cleanup(id), 200);
  }

  private cleanup(id: number): void {
    const lv = this.live.get(id);
    if (!lv) return;
    this.live.delete(id);
    this.limiter.release(id);
    this.uiLimiter.release(id);
    for (const n of lv.nodes) {
      try {
        n.disconnect();
      } catch {
        /* ignore */
      }
    }
  }

  /** A continuous positional loop (fires, battle beds). Caller builds sources into `dest.out`. */
  loop(bus: BusName = 'sfx'): LoopHandle | null {
    const ctx = this.ctx;
    if (!ctx || this.failed) return null;
    try {
      const level = ctx.createGain();
      level.gain.value = 0;
      const sp = ctx.createGain();
      sp.gain.value = 0;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 8000;
      const pan = ctx.createStereoPanner();
      const wet = ctx.createGain();
      wet.gain.value = 0.2;
      level.connect(sp);
      sp.connect(lp);
      lp.connect(pan);
      pan.connect(this.buses[bus]);
      pan.connect(wet);
      wet.connect(this.revIn);
      const srcs: AudioScheduledSourceNode[] = [];
      let alive = true;
      const engine = this;
      const h: LoopHandle = {
        dest: { ctx, bufs: this.bufs, waves: this.waves, out: level, echo: null, far: 0, t: ctx.currentTime + 0.02, track: (s) => srcs.push(s) },
        setSpatial(s: Spatial, ramp = 0.25) {
          if (!alive) return;
          const t = ctx.currentTime;
          sp.gain.setTargetAtTime(s.gain, t, ramp);
          lp.frequency.setTargetAtTime(s.cutoff, t, ramp);
          pan.pan.setTargetAtTime(s.pan, t, ramp);
          wet.gain.setTargetAtTime(s.wet, t, ramp);
        },
        setLevel(v: number, ramp = 0.5) {
          if (!alive) return;
          level.gain.setTargetAtTime(v, ctx.currentTime, ramp);
        },
        stop(fade = 1) {
          if (!alive) return;
          alive = false;
          engine.loops.delete(h);
          const t = ctx.currentTime;
          level.gain.cancelScheduledValues(t);
          level.gain.setValueAtTime(level.gain.value, t);
          level.gain.linearRampToValueAtTime(0, t + fade);
          for (const s of srcs) {
            try {
              s.stop(t + fade + 0.05);
            } catch {
              /* ignore */
            }
          }
          setTimeout(() => {
            for (const n of [level, sp, lp, pan, wet]) {
              try {
                n.disconnect();
              } catch {
                /* ignore */
              }
            }
          }, (fade + 0.3) * 1000);
        },
        alive: () => alive,
      };
      this.loops.add(h);
      return h;
    } catch (err) {
      console.warn('[audio] loop failed', err);
      return null;
    }
  }

  /** Non-limited destination for persistent music/ambience layers. */
  dest(out: AudioNode, t?: number, track?: (s: AudioScheduledSourceNode) => void): Dest | null {
    if (!this.ctx) return null;
    return { ctx: this.ctx, bufs: this.bufs, waves: this.waves, out, echo: null, far: 0, t: t ?? this.ctx.currentTime, track: track ?? (() => {}) };
  }

  stats(): Record<string, number | string | boolean> {
    return {
      state: this.ctx?.state ?? (this.failed ? 'failed' : 'none'),
      voices: this.ctx ? this.limiter.active(this.ctx.currentTime) : 0,
      live: this.live.size,
      loops: this.loops.size,
      plucks: this.ctx ? (pluckCaches.get(this.ctx)?.size ?? 0) : 0,
    };
  }
}

const pluckCaches = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();

/** Pluck buffer cache usable with any context (live or offline). */
export function pluckBuffer(ctx: BaseAudioContext | null, freq: number, kind: 'kanun' | 'ud'): AudioBuffer | null {
  if (!ctx) return null;
  let c = pluckCaches.get(ctx);
  if (!c) {
    c = new Map();
    pluckCaches.set(ctx, c);
  }
  const key = `${kind}:${freq.toFixed(1)}`;
  let b = c.get(key);
  if (!b) {
    b = kind === 'kanun' ? ksBuffer(ctx, freq, 2.4, 0.9, 1.5) : ksBuffer(ctx, freq, 3, 0.5, 2.2);
    if (c.size > 240) c.clear();
    c.set(key, b);
  }
  return b;
}

/** Page-wide engine (see header comment for why this is a module singleton). */
export const engine = new AudioEngine();

/** Small helper so other modules can make a gain on a bus. */
export function busGain(bus: BusName, v: number): GainNode | null {
  if (!engine.ctx) return null;
  const d = engine.dest(engine.buses[bus]);
  return d ? gainNode(d, v) : null;
}
