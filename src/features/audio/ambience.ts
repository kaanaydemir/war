/**
 * Ambience beds that crossfade with the camera position, time of day and
 * weather: sea surf, open-water swell, wind (with whistling gusts), rain, hail,
 * Ottoman camp murmur, city hum, battle din and night crickets — plus random
 * one-shots (gulls, songbirds, owls, horses, sheep, dogs, the camp smithy,
 * thunder). Page-lifetime like the engine; the director feeds it weights.
 */
import { engine } from './engine';
import type { Spatial } from './mix';
import { SFX, type SfxId } from './sfx';
import { filt, gainNode, rand, type Dest } from './synth';

export interface AmbWeights {
  /** Surf near shores (0..1). */
  sea: number;
  /** Open water swell. */
  swell: number;
  wind: number;
  rain: number;
  hail: number;
  camp: number;
  city: number;
  battle: number;
  /** 0 = deep night … 1 = full day. */
  day: number;
  /** Land fraction of the view. */
  land: number;
  /** Songbird season factor (spring/summer, no rain). */
  birds: number;
  /** Building sites near the view (hammer/chisel chatter). */
  work: number;
}

export const ZERO_WEIGHTS: AmbWeights = { sea: 0, swell: 0, wind: 0.3, rain: 0, hail: 0, camp: 0, city: 0, battle: 0, day: 1, land: 1, birds: 0.5, work: 0 };

type BedId = 'sea' | 'swell' | 'wind' | 'rain' | 'hail' | 'camp' | 'city' | 'battle' | 'night';

const BED_LEVEL: Record<BedId, number> = {
  sea: 0.385,
  swell: 0.245,
  wind: 0.224,
  rain: 0.35,
  hail: 0.315,
  camp: 0.28,
  city: 0.175,
  battle: 0.385,
  night: 0.077,
};

export class Ambience {
  private beds = new Map<BedId, GainNode>();
  private built = false;
  private w: AmbWeights = { ...ZERO_WEIGHTS };
  /** Global ambience level (title screen dims, end screen…). */
  private master: GainNode | null = null;

  constructor() {
    engine.onReady(() => this.build());
  }

  private build(): void {
    if (this.built || !engine.ctx) return;
    try {
      const ctx = engine.ctx;
      this.master = ctx.createGain();
      this.master.gain.value = 0;
      this.master.connect(engine.buses.amb);
      this.master.gain.linearRampToValueAtTime(1, ctx.currentTime + 3);
      const D = engine.dest(this.master)!;
      const mkBed = (id: BedId): Dest => {
        const g = gainNode(D, 0);
        this.beds.set(id, g);
        return { ...D, out: g };
      };
      const src = (B: Dest, buf: keyof typeof engine.bufs, out: AudioNode, rate = 1): AudioBufferSourceNode => {
        const s = ctx.createBufferSource();
        s.buffer = engine.bufs[buf];
        s.loop = true;
        s.playbackRate.value = rate;
        s.connect(out);
        s.start(ctx.currentTime, Math.random() * 2);
        return s;
      };
      const lfo = (freq: number, depth: number, target: AudioParam, type: OscillatorType = 'sine'): OscillatorNode => {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.value = depth;
        o.connect(g);
        g.connect(target);
        o.start();
        return o;
      };
      const pan = (B: Dest, p: number, out: AudioNode = B.out): StereoPannerNode => {
        const n = ctx.createStereoPanner();
        n.pan.value = p;
        n.connect(out);
        return n;
      };

      // Sea surf: two decorrelated brown-noise channels with slow wave swells + foam hiss.
      {
        const B = mkBed('sea');
        for (const [p, f] of [
          [-0.55, 0.105],
          [0.55, 0.083],
        ]) {
          const wave = gainNode(B, 0.6, pan(B, p));
          lfo(f, 0.4, wave.gain);
          src(B, 'brown', filt(B, 'lowpass', 520, 0.6, wave));
          const foam = gainNode(B, 0.12, pan(B, -p * 0.6));
          lfo(f, 0.12, foam.gain);
          src(B, 'pink', filt(B, 'bandpass', 1600, 0.5, foam));
        }
      }
      // Open-water swell
      {
        const B = mkBed('swell');
        const g = gainNode(B, 0.8);
        lfo(0.07, 0.25, g.gain);
        src(B, 'brown', filt(B, 'lowpass', 230, 0.7, g), 0.8);
      }
      // Wind with wandering band and whistle
      {
        const B = mkBed('wind');
        const gust = gainNode(B, 0.7);
        lfo(0.09, 0.3, gust.gain);
        lfo(0.023, 0.15, gust.gain);
        const bp = filt(B, 'bandpass', 520, 1.2, gust);
        lfo(0.05, 260, bp.frequency);
        src(B, 'pink', bp);
        const wh = gainNode(B, 0.05, pan(B, 0.3));
        lfo(0.11, 0.04, wh.gain);
        const wbp = filt(B, 'bandpass', 1700, 9, wh);
        lfo(0.065, 420, wbp.frequency);
        src(B, 'white', wbp);
      }
      // Rain: droplets + hiss
      {
        const B = mkBed('rain');
        src(B, 'drops', filt(B, 'highpass', 900, 0.7, pan(B, -0.3)));
        src(B, 'drops', filt(B, 'highpass', 900, 0.7, pan(B, 0.3)), 0.93);
        const hiss = gainNode(B, 0.35);
        src(B, 'pink', filt(B, 'lowpass', 4200, 0.6, filt(B, 'highpass', 500, 0.6, hiss)));
      }
      // Hail: hard clicks
      {
        const B = mkBed('hail');
        src(B, 'crackle', filt(B, 'highpass', 1800, 0.7, pan(B, -0.25)), 2.2);
        src(B, 'crackle', filt(B, 'highpass', 2200, 0.7, pan(B, 0.25)), 1.8);
        src(B, 'drops', filt(B, 'bandpass', 3500, 0.8), 1.5);
      }
      // Camp murmur: babble through two formants with syllabic modulation.
      {
        const B = mkBed('camp');
        for (const [f, q, rate, p] of [
          [480, 2, 4.3, -0.4],
          [1250, 3, 5.7, 0.35],
          [820, 2.5, 3.1, 0],
        ]) {
          const g = gainNode(B, 0.5, pan(B, p));
          lfo(rate, 0.35, g.gain);
          lfo(rate * 0.37, 0.15, g.gain);
          src(B, 'pink', filt(B, 'bandpass', f, q, g), rand(0.9, 1.1));
        }
        src(B, 'brown', filt(B, 'lowpass', 260, 0.7, gainNode(B, 0.4)));
      }
      // City hum (distant, muffled)
      {
        const B = mkBed('city');
        src(B, 'brown', filt(B, 'lowpass', 420, 0.6, gainNode(B, 0.8)));
        const g = gainNode(B, 0.25);
        lfo(2.3, 0.12, g.gain);
        src(B, 'pink', filt(B, 'bandpass', 700, 1.5, g));
      }
      // Battle din: roar, clatter, stamping
      {
        const B = mkBed('battle');
        const roar = gainNode(B, 0.6);
        lfo(3.7, 0.22, roar.gain);
        lfo(0.31, 0.15, roar.gain);
        src(B, 'pink', filt(B, 'bandpass', 650, 0.7, roar));
        src(B, 'crackle', filt(B, 'highpass', 2800, 0.7, gainNode(B, 0.25)), 1.3);
        src(B, 'brown', filt(B, 'lowpass', 220, 0.7, gainNode(B, 0.6)));
      }
      // Night: crickets (gated sines)
      {
        const B = mkBed('night');
        for (const [f, pulse, chirp, p] of [
          [4450, 31, 2.2, -0.6],
          [4720, 28, 1.6, 0.5],
          [4210, 34, 2.9, 0.05],
        ]) {
          const o = ctx.createOscillator();
          o.frequency.value = f;
          const g1 = gainNode(B, 0.5, pan(B, p));
          const g2 = ctx.createGain();
          g2.gain.value = 0.5;
          g2.connect(g1);
          o.connect(g2);
          lfo(pulse, 0.5, g2.gain, 'square');
          lfo(chirp, 0.5, g1.gain, 'square');
          o.start();
        }
      }
      this.built = true;
      this.apply(0.1);
    } catch (err) {
      console.warn('[audio] ambience build failed', err);
    }
  }

  setWeights(w: AmbWeights): void {
    this.w = w;
    this.apply(1.2);
  }

  /** Global ambience level (fade). */
  setLevel(v: number, sec = 2): void {
    if (!this.master || !engine.ctx) return;
    this.master.gain.setTargetAtTime(v, engine.ctx.currentTime, sec / 3);
  }

  private apply(tc: number): void {
    if (!this.built || !engine.ctx) return;
    const w = this.w;
    const night = 1 - w.day;
    const target: Record<BedId, number> = {
      sea: w.sea,
      swell: w.swell,
      wind: w.wind,
      rain: w.rain,
      hail: w.hail,
      camp: w.camp * (0.6 + 0.4 * w.day),
      city: w.city * (0.5 + 0.5 * w.day),
      battle: w.battle,
      night: Math.max(0, night - 0.25) * w.land * (1 - w.rain) * 1.3,
    };
    const t = engine.ctx.currentTime;
    for (const [id, g] of this.beds) g.gain.setTargetAtTime(Math.min(1, target[id]) * BED_LEVEL[id], t, tc);
  }

  /** Random one-shots. dt in real seconds. */
  tick(dt: number): void {
    if (!this.built) return;
    const w = this.w;
    const day = w.day;
    const night = 1 - day;
    const water = Math.min(1, w.sea + w.swell);
    const chance = (rate: number) => Math.random() < rate * dt;
    if (chance(0.16 * water * Math.max(0.15, day))) this.oneShot('seagull', water);
    if (chance(0.32 * w.land * day * w.birds * (1 - w.battle))) this.oneShot('songbird', w.land);
    if (chance(0.03 * night * w.land)) this.oneShot('owl', w.land * 0.8);
    if (chance(0.04 * w.camp)) this.oneShot('neigh', w.camp);
    if (chance(0.025 * w.camp * day)) this.oneShot('bleat', w.camp);
    if (chance(0.02 * w.camp)) this.oneShot('bark', w.camp * 0.8);
    if (chance(0.05 * w.camp * day)) this.oneShot('anvil', w.camp * 0.8);
    if (chance(0.015 * w.camp)) this.oneShot('oxen', w.camp * 0.7);
    if (chance(0.25 * w.work * day)) this.oneShot('construction', w.work, { kind: (['hammer', 'chisel', 'saw', 'crane'] as const)[Math.floor(Math.random() * 4)] });
    if (w.rain > 0.45 && chance(0.02 * w.rain)) this.oneShot('thunder', 0.5 + 0.5 * w.rain, undefined, 0.8);
  }

  private oneShot(id: SfxId, level: number, params?: unknown, far?: number): void {
    const def = SFX[id];
    const f = far ?? rand(0.25, 0.6);
    const sp: Spatial = {
      gain: Math.min(1, level) * rand(0.35, 0.85),
      pan: rand(-0.85, 0.85),
      far: f,
      cutoff: Math.max(500, 16000 * Math.pow(2, -f * 4.5)),
      wet: 0.25 + f * 0.4,
      delay: 0,
      onScreen: true,
    };
    const v = engine.voice({ bus: 'amb', pri: Math.min(def.pri, 2), dur: def.dur, sp, gain: def.gain });
    if (!v) return;
    try {
      (def.play as (D: Dest, p: unknown) => void)(v, params ?? {});
    } catch (err) {
      console.warn('[audio] ambience one-shot failed', id, err);
    }
  }
}

export const ambience = new Ambience();
