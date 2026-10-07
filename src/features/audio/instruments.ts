/**
 * Procedural Ottoman instruments: ney, zurna, kanun/ud (Karplus-Strong),
 * davul, kös, nakkare, zil, çevgen, boru and the dem drone.
 * All take a Dest (live voice, music piece or offline context).
 */
import { pluckBuffer } from './engine';
import { adsr, filt, gainNode, noise, playBuf, rand, tone, type Dest } from './synth';

const EPS = 0.0001;

// ───────────────────────────── Percussion ─────────────────────────────

/** Davul: 'dum' = tokmak on the bass head, 'tek'/'ke' = çubuk (thin stick) on the other. */
export function davul(D: Dest, t: number, stroke: 'dum' | 'tek' | 'ke' | 'tekke', vel = 1): void {
  if (stroke === 'dum') {
    tone(D, { f: rand(94, 102), f1: 50, t, a: 0.002, d: 0.6, g: 0.95 * vel });
    tone(D, { type: 'triangle', f: 170, f1: 85, t, d: 0.14, g: 0.28 * vel });
    noise(D, { buf: 'brown', t, d: 0.18, g: 0.55 * vel, type: 'lowpass', f: 420 });
    noise(D, { t, d: 0.025, g: 0.16 * vel, type: 'bandpass', f: 1600, q: 1.2 });
  } else {
    const v = stroke === 'ke' ? 0.6 * vel : vel;
    noise(D, { t, a: 0.001, d: 0.065, g: 0.5 * v, type: 'highpass', f: 1700 });
    tone(D, { f: rand(600, 660), f1: 360, t, d: 0.05, g: 0.26 * v });
    noise(D, { t: t + 0.004, d: 0.12, g: 0.09 * v, type: 'bandpass', f: 4200, q: 2 });
    if (stroke === 'tekke') davul(D, t + 0.07, 'ke', vel * 0.8);
  }
}

/** Kös: the huge camel-borne kettledrums — the heartbeat of the mehter. */
export function kos(D: Dest, t: number, vel = 1): void {
  tone(D, { f: rand(54, 58), f1: 34, t, a: 0.004, d: 2.4, g: 1.05 * vel });
  tone(D, { f: 91, f1: 62, t, a: 0.003, d: 1.2, g: 0.38 * vel });
  tone(D, { type: 'triangle', f: 142, f1: 120, t, d: 0.5, g: 0.12 * vel });
  noise(D, { buf: 'brown', t, a: 0.01, d: 1.9, g: 0.7 * vel, type: 'lowpass', f: 170 });
  noise(D, { buf: 'pink', t, d: 0.12, g: 0.4 * vel, type: 'lowpass', f: 1000 });
}

/** Nakkare: small paired kettledrums — quick, dry, two pitches. */
export function nakkare(D: Dest, t: number, vel = 1, high = false): void {
  const f = high ? rand(325, 340) : rand(245, 258);
  tone(D, { f, f1: f * 0.82, t, d: 0.17, g: 0.42 * vel });
  tone(D, { type: 'triangle', f: f * 2.31, t, d: 0.05, g: 0.08 * vel });
  noise(D, { t, d: 0.04, g: 0.28 * vel, type: 'bandpass', f: 2100, q: 1.4 });
}

const ZIL_RATIOS = [205.3, 304.4, 369.6, 522.7, 540, 800];

/** Zil: Turkish cymbals clashed together (metallic inharmonic cluster + hiss). */
export function zil(D: Dest, t: number, vel = 1, len = 1.6): void {
  const hp = filt(D, 'highpass', 5200, 0.7);
  const bp = filt(D, 'bandpass', 8800, 0.6, hp);
  const sum = gainNode(D, 1, bp);
  adsr(sum.gain, t, 0.001, 0.55 * vel, len);
  for (const r of ZIL_RATIOS) {
    const o = D.ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = r * rand(2.1, 2.3);
    o.connect(sum);
    o.start(t);
    o.stop(t + len + 0.1);
    D.track(o);
  }
  noise(D, { t, a: 0.001, d: len * 0.85, g: 0.24 * vel, type: 'highpass', f: 6500 });
  noise(D, { t: t + 0.012, d: 0.08, g: 0.2 * vel, type: 'bandpass', f: 5000, q: 1.5 });
}

/** Çevgen: staff hung with small bells — a bright jingle shake. */
export function cevgen(D: Dest, t: number, vel = 1): void {
  for (let i = 0; i < 3; i++) noise(D, { t: t + i * 0.035, d: 0.09, g: 0.3 * vel, type: 'bandpass', f: 7200, q: 3 });
  for (let i = 0; i < 5; i++) tone(D, { f: rand(4200, 8200), t: t + rand(0, 0.08), d: rand(0.15, 0.4), g: 0.05 * vel });
}

// ───────────────────────────── Strings ─────────────────────────────

/** Kanun (zither, plectrum — bright, double strings) or ud (lute, warm). */
export function pluck(D: Dest, t: number, f: number, vel = 1, kind: 'kanun' | 'ud' = 'kanun'): void {
  const b = pluckBuffer(D.ctx, f, kind);
  if (!b) return;
  if (kind === 'kanun') {
    const shelf = filt(D, 'highshelf', 3500, 0.7, D.out, 3);
    playBuf(D, b, t, 0.32 * vel, shelf);
    playBuf(D, b, t + 0.003, 0.18 * vel, shelf, 1.0025);
  } else {
    const lp = filt(D, 'lowpass', 2600, 0.6);
    playBuf(D, b, t, 0.42 * vel, lp);
    playBuf(D, b, t + 0.002, 0.2 * vel, lp, 0.9985);
    // Mızrap (plectrum) tick
    noise(D, { t, d: 0.012, g: 0.06 * vel, type: 'bandpass', f: 2500, q: 2 });
  }
}

// ───────────────────────────── Winds ─────────────────────────────

export interface LegatoNote {
  f: number;
  /** Seconds. */
  dur: number;
  glide?: boolean;
  orn?: 'none' | 'ust' | 'alt' | 'tril';
  /** Upper/lower neighbour frequencies for ornaments. */
  fu?: number;
  fl?: number;
  acc?: number;
}

/**
 * Ney — reed flute: breathy, intimate, slow attacks, glides between notes and
 * a vibrato that blooms on long notes. One oscillator per phrase (true legato).
 */
export function neyPhrase(D: Dest, notes: LegatoNote[], vel = 1): number {
  if (notes.length === 0) return 0;
  const ctx = D.ctx;
  const t0 = D.t;
  let total = 0;
  for (const n of notes) total += n.dur;
  const end = t0 + total;
  const osc = ctx.createOscillator();
  osc.setPeriodicWave(D.waves.ney);
  const fr = osc.frequency;
  fr.setValueAtTime(notes[0].f * 0.965, t0);
  fr.exponentialRampToValueAtTime(notes[0].f, t0 + 0.12);
  let t = t0;
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    if (i > 0) {
      const prev = notes[i - 1].f;
      fr.setValueAtTime(prev, t);
      fr.exponentialRampToValueAtTime(n.f, t + (n.glide ? 0.11 : 0.03));
    }
    t += n.dur;
  }
  // Vibrato that blooms
  const lfo = ctx.createOscillator();
  lfo.frequency.value = rand(4.6, 5.4);
  const vib = ctx.createGain();
  vib.gain.setValueAtTime(0, t0);
  vib.gain.linearRampToValueAtTime(notes[0].f * 0.0075, t0 + Math.min(1.2, total * 0.5));
  lfo.connect(vib);
  vib.connect(fr);
  // Amplitude with breath articulation between notes
  const amp = ctx.createGain();
  const ap = amp.gain;
  ap.setValueAtTime(EPS, t0);
  ap.linearRampToValueAtTime(0.32 * vel, t0 + 0.18);
  t = t0;
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    if (i > 0 && !n.glide) {
      ap.setValueAtTime(0.32 * vel, Math.max(t0 + 0.19, t - 0.04));
      ap.linearRampToValueAtTime(0.2 * vel, t);
      ap.linearRampToValueAtTime(0.32 * vel, t + 0.07);
    }
    t += n.dur;
  }
  ap.setValueAtTime(0.32 * vel, Math.max(t0 + 0.2, end - 0.45));
  ap.exponentialRampToValueAtTime(EPS, end + 0.15);
  const lp = filt(D, 'lowpass', 3200, 0.5);
  amp.connect(lp);
  osc.connect(amp);
  // Breath: band-limited noise following the fundamental region + airy hiss.
  const breath = ctx.createGain();
  breath.gain.setValueAtTime(EPS, t0);
  breath.gain.linearRampToValueAtTime(0.13 * vel, t0 + 0.06);
  breath.gain.linearRampToValueAtTime(0.055 * vel, t0 + 0.4);
  breath.gain.setValueAtTime(0.055 * vel, Math.max(t0 + 0.41, end - 0.3));
  breath.gain.exponentialRampToValueAtTime(EPS, end + 0.15);
  const bsrc = ctx.createBufferSource();
  bsrc.buffer = D.bufs.white;
  bsrc.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = notes[0].f * 2.2;
  bp.Q.value = 1.4;
  bsrc.connect(bp);
  bp.connect(breath);
  breath.connect(D.out);
  const hiss = noise(D, { t: t0, a: 0.05, h: Math.max(0, total - 0.3), d: 0.3, g: 0.022 * vel, type: 'highpass', f: 5000 });
  void hiss;
  for (const s of [osc, lfo, bsrc] as AudioScheduledSourceNode[]) {
    s.start(t0);
    s.stop(end + 0.25);
    D.track(s);
  }
  return total;
}

function tanhCurve(k: number): Float32Array<ArrayBuffer> {
  const n = 1024;
  const c = new Float32Array(new ArrayBuffer(n * 4));
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return c;
}
let zurnaCurve: Float32Array<ArrayBuffer> | null = null;

/**
 * Zurna — the piercing shawm of the mehter. Tongued notes, çarpma grace notes,
 * trills, slight pitch instability; driven through a soft clipper and a
 * nasal formant. `detune` in cents separates the two players.
 */
export function zurnaPhrase(D: Dest, notes: LegatoNote[], vel = 1, detune = 0): number {
  if (notes.length === 0) return 0;
  const ctx = D.ctx;
  const t0 = D.t;
  let total = 0;
  for (const n of notes) total += n.dur;
  const end = t0 + total;
  const osc = ctx.createOscillator();
  osc.setPeriodicWave(D.waves.zurna);
  osc.detune.value = detune;
  const fr = osc.frequency;
  const amp = ctx.createGain();
  const ap = amp.gain;
  const peak = 0.3 * vel;
  ap.setValueAtTime(EPS, t0);
  let t = t0;
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    const acc = n.acc ?? 0.6;
    const pk = peak * (0.82 + 0.18 * acc);
    const prev = i > 0 ? notes[i - 1].f : n.f * 0.97;
    // pitch
    if (n.orn === 'ust' && n.fu) {
      fr.setValueAtTime(n.fu, t);
      fr.setValueAtTime(n.f, t + 0.05);
    } else if (n.orn === 'alt' && n.fl) {
      fr.setValueAtTime(n.fl, t);
      fr.setValueAtTime(n.f, t + 0.05);
    } else if (n.orn === 'tril' && n.fu) {
      fr.setValueAtTime(n.f, t);
      const steps = Math.max(2, Math.floor((n.dur * 0.6) / 0.055));
      for (let k = 0; k < steps; k++) fr.setValueAtTime(k % 2 ? n.f : n.fu, t + 0.04 + k * 0.055);
      fr.setValueAtTime(n.f, t + 0.04 + steps * 0.055);
    } else {
      fr.setValueAtTime(prev, t);
      fr.exponentialRampToValueAtTime(n.f, t + 0.02);
    }
    // tongued articulation
    ap.setValueAtTime(i === 0 ? EPS : peak * 0.45, t);
    ap.linearRampToValueAtTime(pk * 1.08, t + 0.018);
    ap.linearRampToValueAtTime(pk, t + 0.07);
    if (n.dur > 0.2) ap.setValueAtTime(pk, t + n.dur - 0.035);
    ap.linearRampToValueAtTime(peak * 0.45, t + n.dur - 0.004);
    t += n.dur;
  }
  ap.setValueAtTime(peak * 0.45, end);
  ap.exponentialRampToValueAtTime(EPS, end + 0.08);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = rand(5.4, 6.4);
  const vib = ctx.createGain();
  vib.gain.value = notes[0].f * 0.004;
  lfo.connect(vib);
  vib.connect(fr);
  const drift = ctx.createOscillator();
  drift.frequency.value = rand(0.2, 0.45);
  const dg = ctx.createGain();
  dg.gain.value = notes[0].f * 0.0025;
  drift.connect(dg);
  dg.connect(fr);
  if (!zurnaCurve) zurnaCurve = tanhCurve(2.2);
  const shaper = ctx.createWaveShaper();
  shaper.curve = zurnaCurve;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 300;
  const pk = ctx.createBiquadFilter();
  pk.type = 'peaking';
  pk.frequency.value = 1450;
  pk.Q.value = 1.1;
  pk.gain.value = 5;
  const shelf = ctx.createBiquadFilter();
  shelf.type = 'highshelf';
  shelf.frequency.value = 5200;
  shelf.gain.value = -9;
  osc.connect(amp);
  amp.connect(shaper);
  shaper.connect(hp);
  hp.connect(pk);
  pk.connect(shelf);
  const outG = gainNode(D, 0.9);
  shelf.connect(outG);
  for (const s of [osc, lfo, drift]) {
    s.start(t0);
    s.stop(end + 0.15);
    D.track(s);
  }
  return total;
}

/** Boru: natural trumpet of the mehter — bright brassy long tones. */
export function boru(D: Dest, t: number, f: number, dur: number, vel = 1): void {
  const lp = filt(D, 'lowpass', 900, 1.2);
  const g = gainNode(D, 1, lp);
  g.gain.setValueAtTime(EPS, t);
  g.gain.linearRampToValueAtTime(0.22 * vel, t + 0.06);
  g.gain.setValueAtTime(0.2 * vel, t + dur - 0.2);
  g.gain.exponentialRampToValueAtTime(EPS, t + dur + 0.3);
  lp.frequency.setValueAtTime(600, t);
  lp.frequency.linearRampToValueAtTime(2600, t + 0.08);
  lp.frequency.linearRampToValueAtTime(1800, t + 0.4);
  for (const det of [-5, 4]) {
    const o = D.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f * 0.94, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.07);
    o.detune.value = det;
    o.connect(g);
    o.start(t);
    o.stop(t + dur + 0.4);
    D.track(o);
  }
}

/** Dem — sustained drone (reed timbre), slowly breathing. */
export function drone(D: Dest, t: number, f: number, dur: number, vel = 1, opts: { attack?: number; bright?: number } = {}): void {
  const a = opts.attack ?? 2.5;
  const lp = filt(D, 'lowpass', 700 * (opts.bright ?? 1), 0.8);
  const g = gainNode(D, 1, lp);
  g.gain.setValueAtTime(EPS, t);
  g.gain.linearRampToValueAtTime(0.14 * vel, t + a);
  g.gain.setValueAtTime(0.14 * vel, t + Math.max(a, dur - a));
  g.gain.linearRampToValueAtTime(EPS, t + dur + 0.1);
  const lfo = D.ctx.createOscillator();
  lfo.frequency.value = rand(0.06, 0.13);
  const lg = D.ctx.createGain();
  lg.gain.value = 260 * (opts.bright ?? 1);
  lfo.connect(lg);
  lg.connect(lp.frequency);
  const srcs: OscillatorNode[] = [lfo];
  for (const [mul, det, w] of [
    [1, -4, 'reed'],
    [1, 5, 'reed'],
    [0.5, 0, 'sine'],
  ] as const) {
    const o = D.ctx.createOscillator();
    if (w === 'reed') o.setPeriodicWave(D.waves.reed);
    else o.type = 'sine';
    o.frequency.value = f * mul;
    o.detune.value = det;
    const og = D.ctx.createGain();
    og.gain.value = w === 'sine' ? 0.9 : 0.5;
    o.connect(og);
    og.connect(g);
    srcs.push(o);
  }
  for (const s of srcs) {
    s.start(t);
    s.stop(t + dur + 0.2);
    D.track(s);
  }
}

/** Big church bell (inharmonic partials: hum, prime, tierce, quint, nominal…). */
export function bell(D: Dest, t: number, f0: number, vel = 1, big = 1): void {
  const parts: [number, number, number][] = [
    [0.5, 0.32, 7],
    [1, 0.45, 5],
    [1.183, 0.34, 4],
    [1.506, 0.2, 3.2],
    [2, 0.4, 3],
    [2.514, 0.12, 2],
    [2.662, 0.1, 1.6],
    [3.011, 0.09, 1.3],
    [4.166, 0.05, 0.9],
  ];
  for (const [r, a, d] of parts) tone(D, { f: f0 * r * rand(0.998, 1.002), t, a: 0.002, d: d * big, g: a * vel * 0.5 });
  noise(D, { t, d: 0.03, g: 0.18 * vel, type: 'bandpass', f: 2200, q: 1.5 });
}
