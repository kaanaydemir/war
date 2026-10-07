/**
 * Low-level WebAudio synthesis kit. Works on any BaseAudioContext (live or
 * OfflineAudioContext — the debug analyser renders sounds offline).
 * Everything is procedural: noise beds, crackle impulse trains, Karplus-Strong
 * plucks and custom periodic waves are generated here once per context.
 */

export interface Buffers {
  white: AudioBuffer;
  pink: AudioBuffer;
  brown: AudioBuffer;
  /** Sparse impulse train: debris, fire, gravel, brick rain. */
  crackle: AudioBuffer;
  /** Dense droplets for rain/hail. */
  drops: AudioBuffer;
}

export interface Waves {
  zurna: PeriodicWave;
  ney: PeriodicWave;
  reed: PeriodicWave;
  voice: PeriodicWave;
  organ: PeriodicWave;
}

/** Where a synth function writes: one voice / one instrument destination. */
export interface Dest {
  ctx: BaseAudioContext;
  bufs: Buffers;
  waves: Waves;
  /** Dry input of the voice. */
  out: AudioNode;
  /** Echo-off-the-hills send (may be null). */
  echo: AudioNode | null;
  /** 0 near … 1 very far (layers are skipped when far). */
  far: number;
  /** Start time. */
  t: number;
  /** Register a scheduled source so voice stealing can stop it. */
  track(src: AudioScheduledSourceNode): void;
}

const EPS = 0.0001;

// ───────────────────────────── Buffers ─────────────────────────────

let rndState = 0x9e3779b9;
function frand(): number {
  // xorshift — fast and independent of Math.random (deterministic textures).
  rndState ^= rndState << 13;
  rndState ^= rndState >>> 17;
  rndState ^= rndState << 5;
  return ((rndState >>> 0) / 4294967296) * 2 - 1;
}

function normalize(d: Float32Array, peak = 0.95): void {
  let m = 0;
  for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
  if (m > 0) for (let i = 0; i < d.length; i++) d[i] *= peak / m;
}

export function makeBuffers(ctx: BaseAudioContext): Buffers {
  const sr = ctx.sampleRate;
  const mk = (sec: number, fill: (d: Float32Array) => void, ch = 1): AudioBuffer => {
    const b = ctx.createBuffer(ch, Math.floor(sec * sr), sr);
    for (let c = 0; c < ch; c++) {
      const d = b.getChannelData(c);
      fill(d);
    }
    return b;
  };
  const white = mk(3, (d) => {
    for (let i = 0; i < d.length; i++) d[i] = frand() * 0.9;
  });
  const pink = mk(4, (d) => {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = frand();
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
      b6 = w * 0.115926;
    }
    normalize(d, 0.9);
  });
  const brown = mk(4, (d) => {
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      last = (last + 0.02 * frand()) / 1.02;
      d[i] = last;
    }
    normalize(d, 0.95);
  });
  const crackle = mk(4, (d) => {
    let i = 0;
    while (i < d.length) {
      i += 1 + Math.floor((frand() * 0.5 + 0.5) * sr * 0.012);
      const amp = Math.pow(frand() * 0.5 + 0.5, 2.2) * (frand() < 0 ? -1 : 1);
      const len = 3 + Math.floor((frand() * 0.5 + 0.5) * 40);
      for (let k = 0; k < len && i + k < d.length; k++) d[i + k] += amp * Math.exp(-k / (len * 0.25)) * (k % 2 ? -0.6 : 1);
    }
    normalize(d, 0.95);
  });
  const drops = mk(3, (d) => {
    for (let i = 0; i < d.length; i++) d[i] = frand() * 0.05;
    let i = 0;
    while (i < d.length) {
      i += 1 + Math.floor((frand() * 0.5 + 0.5) * sr * 0.004);
      const amp = Math.pow(frand() * 0.5 + 0.5, 1.6) * (frand() < 0 ? -1 : 1);
      const len = 6 + Math.floor((frand() * 0.5 + 0.5) * 60);
      const f = 0.25 + (frand() * 0.5 + 0.5) * 0.4;
      for (let k = 0; k < len && i + k < d.length; k++) d[i + k] += amp * Math.exp(-k / (len * 0.3)) * Math.sin(k * f);
    }
    normalize(d, 0.9);
  });
  return { white, pink, brown, crackle, drops };
}

export function makeWaves(ctx: BaseAudioContext): Waves {
  const wave = (amps: number[]): PeriodicWave => {
    const re = new Float32Array(amps.length + 1);
    const im = new Float32Array(amps.length + 1);
    for (let i = 0; i < amps.length; i++) im[i + 1] = amps[i];
    return ctx.createPeriodicWave(re, im);
  };
  // Zurna: very bright double reed — strong upper partials, formant hump ~6–9th.
  const zurna: number[] = [];
  for (let n = 1; n <= 28; n++) {
    const formant = 1 + 0.9 * Math.exp(-Math.pow((n - 7) / 3.2, 2)) + 0.45 * Math.exp(-Math.pow((n - 15) / 3, 2));
    zurna.push((1 / Math.pow(n, 0.55)) * formant * (n % 2 === 0 ? 0.85 : 1));
  }
  // Ney: nearly a sine with a gentle octave and breathy 3rd.
  const ney = [1, 0.32, 0.14, 0.06, 0.03, 0.015];
  // Reed drone (dem): warm, odd-heavy.
  const reed: number[] = [];
  for (let n = 1; n <= 16; n++) reed.push((n % 2 ? 1 : 0.35) / n);
  // Voice: buzzy glottal source (sawtooth-like with rolloff) for shouts/murmur.
  const voice: number[] = [];
  for (let n = 1; n <= 24; n++) voice.push(1 / Math.pow(n, 1.15));
  const organ = [1, 0.5, 0.33, 0.12, 0.2, 0.05, 0.08];
  return { zurna: wave(zurna), ney: wave(ney), reed: wave(reed), voice: wave(voice), organ: wave(organ) };
}

/** Karplus-Strong pluck rendered into a buffer (kanun / ud). */
export function ksBuffer(ctx: BaseAudioContext, freq: number, dur: number, bright: number, t60: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.max(1, Math.floor(dur * sr));
  const buf = ctx.createBuffer(1, len, sr);
  const y = buf.getChannelData(0);
  const p = Math.max(2, sr / freq - 0.5);
  const ip = Math.floor(p);
  const fr = p - ip;
  const g = Math.pow(10, -3 / (t60 * freq));
  // Excitation: one period of filtered noise (brightness) + a pluck-position comb.
  let lp = 0;
  const a = 0.15 + bright * 0.85;
  for (let i = 0; i <= ip + 1 && i < len; i++) {
    lp += a * (frand() - lp);
    y[i] = lp;
  }
  for (let i = ip + 2; i < len; i++) {
    const x1 = y[i - ip] * (1 - fr) + y[i - ip - 1] * fr;
    const x2 = y[i - ip - 1] * (1 - fr) + (i - ip - 2 >= 0 ? y[i - ip - 2] : 0) * fr;
    y[i] = g * (0.5 * x1 + 0.5 * x2);
  }
  // Remove DC and fade the tail.
  let mean = 0;
  for (let i = 0; i < Math.min(len, 2000); i++) mean += y[i];
  mean /= Math.min(len, 2000);
  const fade = Math.floor(sr * 0.05);
  for (let i = 0; i < len; i++) {
    y[i] -= mean * Math.exp(-i / 2000);
    if (i > len - fade) y[i] *= (len - i) / fade;
  }
  normalize(y, 0.9);
  return buf;
}

// ───────────────────────────── Node helpers ─────────────────────────────

export function gainNode(D: Dest, v: number, out: AudioNode = D.out): GainNode {
  const g = D.ctx.createGain();
  g.gain.value = v;
  g.connect(out);
  return g;
}

export function filt(D: Dest, type: BiquadFilterType, f: number, q = 0.7, out: AudioNode = D.out, gainDb = 0): BiquadFilterNode {
  const b = D.ctx.createBiquadFilter();
  b.type = type;
  b.frequency.value = f;
  b.Q.value = q;
  if (gainDb) b.gain.value = gainDb;
  b.connect(out);
  return b;
}

export function panNode(D: Dest, pan: number, out: AudioNode = D.out): AudioNode {
  const ctx = D.ctx as BaseAudioContext & { createStereoPanner?: () => StereoPannerNode };
  if (typeof ctx.createStereoPanner === 'function') {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(out);
    return p;
  }
  return gainNode(D, 1, out);
}

/** Attack–hold–exponential decay envelope on a gain param. */
export function adsr(p: AudioParam, t: number, a: number, peak: number, d: number, hold = 0): void {
  p.setValueAtTime(EPS, t);
  p.linearRampToValueAtTime(Math.max(EPS, peak), t + Math.max(0.001, a));
  if (hold > 0) p.setValueAtTime(Math.max(EPS, peak), t + a + hold);
  p.exponentialRampToValueAtTime(EPS, t + a + hold + Math.max(0.005, d));
}

export interface ToneOpts {
  type?: OscillatorType;
  wave?: PeriodicWave;
  f: number;
  /** Glide target frequency. */
  f1?: number;
  /** Glide time constant style: 'exp' (default) or 'lin'. */
  glide?: 'exp' | 'lin';
  /** Glide duration (defaults to a + h + d). */
  gt?: number;
  t?: number;
  a?: number;
  h?: number;
  d: number;
  g: number;
  out?: AudioNode;
  detune?: number;
}

export function tone(D: Dest, o: ToneOpts): OscillatorNode {
  const t = o.t ?? D.t;
  const a = o.a ?? 0.005;
  const h = o.h ?? 0;
  const osc = D.ctx.createOscillator();
  if (o.wave) osc.setPeriodicWave(o.wave);
  else osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.f, t);
  if (o.f1 !== undefined) {
    const gt = o.gt ?? a + h + o.d;
    if (o.glide === 'lin') osc.frequency.linearRampToValueAtTime(o.f1, t + gt);
    else osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t + gt);
  }
  if (o.detune) osc.detune.value = o.detune;
  const g = D.ctx.createGain();
  adsr(g.gain, t, a, o.g, o.d, h);
  osc.connect(g);
  g.connect(o.out ?? D.out);
  osc.start(t);
  osc.stop(t + a + h + o.d + 0.05);
  D.track(osc);
  return osc;
}

export interface NoiseOpts {
  buf?: keyof Buffers;
  t?: number;
  a?: number;
  h?: number;
  d: number;
  g: number;
  type?: BiquadFilterType;
  f?: number;
  /** Filter sweep target. */
  f1?: number;
  q?: number;
  out?: AudioNode;
  rate?: number;
  /** Optional second filter (e.g. highpass + lowpass band). */
  type2?: BiquadFilterType;
  f2?: number;
}

export function noise(D: Dest, o: NoiseOpts): AudioBufferSourceNode {
  const t = o.t ?? D.t;
  const a = o.a ?? 0.003;
  const h = o.h ?? 0;
  const buf = D.bufs[o.buf ?? 'white'];
  const src = D.ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  if (o.rate) src.playbackRate.value = o.rate;
  const g = D.ctx.createGain();
  adsr(g.gain, t, a, o.g, o.d, h);
  let head: AudioNode = g;
  g.connect(o.out ?? D.out);
  if (o.type2) {
    const f2 = D.ctx.createBiquadFilter();
    f2.type = o.type2;
    f2.frequency.value = o.f2 ?? 1000;
    f2.connect(head);
    head = f2;
  }
  if (o.type) {
    const f = D.ctx.createBiquadFilter();
    f.type = o.type;
    f.Q.value = o.q ?? 0.7;
    f.frequency.setValueAtTime(o.f ?? 1000, t);
    if (o.f1 !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + a + h + o.d);
    f.connect(head);
    head = f;
  }
  src.connect(head);
  const off = Math.random() * Math.max(0, buf.duration - 0.5);
  src.start(t, off);
  src.stop(t + a + h + o.d + 0.05);
  D.track(src);
  return src;
}

/** Plays a prepared buffer (KS pluck, etc.). */
export function playBuf(D: Dest, buf: AudioBuffer, t: number, g: number, out: AudioNode = D.out, rate = 1): AudioBufferSourceNode {
  const src = D.ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const gn = D.ctx.createGain();
  gn.gain.value = g;
  src.connect(gn);
  gn.connect(out);
  src.start(t);
  D.track(src);
  return src;
}

/** Sub-tree with its own gain, so a group of layers can be faded together. */
export function sub(D: Dest, g: number, out: AudioNode = D.out): Dest {
  return { ...D, out: gainNode(D, g, out) };
}

export const rand = (lo: number, hi: number): number => lo + Math.random() * (hi - lo);
export const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];

/** Stereo reverb impulse: early reflections + decaying diffuse tail. */
export function makeImpulse(ctx: BaseAudioContext, seconds: number, decay: number, opts: { early?: number; damp?: number } = {}): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(seconds * sr);
  const b = ctx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    let lp = 0;
    const damp = opts.damp ?? 0.6;
    for (let i = 0; i < len; i++) {
      const x = i / len;
      // Damping increases over time (high frequencies die first).
      const k = 1 - damp * x;
      lp += k * (frand() - lp);
      d[i] = lp * Math.pow(1 - x, decay);
    }
    // Early reflections (hills, walls).
    const er = opts.early ?? 6;
    for (let e = 0; e < er; e++) {
      const at = Math.floor(sr * (0.012 + e * 0.017 + Math.abs(frand()) * 0.02 + c * 0.003));
      if (at < len) d[at] += (0.6 - e * 0.07) * (frand() < 0 ? -1 : 1);
    }
    normalize(d, 0.5);
  }
  return b;
}
