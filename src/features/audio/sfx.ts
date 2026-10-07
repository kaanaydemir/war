/**
 * Sound-effect synthesis: every sound in the game is layered here from
 * oscillators, filtered noise, impulse trains and envelopes.
 * Each entry declares its priority, length, carrying range (spatial), hill-echo
 * send and how much it ducks the music.
 */
import type { CannonType } from '../../core/state';
import { bell, davul, kos, pluck, zil } from './instruments';
import { MAKAMS, degreeHz } from './theory';
import { adsr, filt, gainNode, noise, rand, tone, type Dest } from './synth';

const EPS = 0.0001;

// ───────────────────────────── Shared building blocks ─────────────────────────────

/** Slow rolling rumble (brown noise, amplitude wobble). */
function rumble(D: Dest, t: number, o: { a: number; h: number; d: number; g: number; f: number; wobble?: number }): void {
  const wob = gainNode(D, 0.75);
  const lfo = D.ctx.createOscillator();
  lfo.frequency.value = o.wobble ?? rand(2.2, 3.6);
  const depth = D.ctx.createGain();
  depth.gain.value = 0.25;
  lfo.connect(depth);
  depth.connect(wob.gain);
  lfo.start(t);
  lfo.stop(t + o.a + o.h + o.d + 0.1);
  D.track(lfo);
  noise(D, { buf: 'brown', t, a: o.a, h: o.h, d: o.d, g: o.g, type: 'lowpass', f: o.f, f1: o.f * 0.55, out: wob });
}

/** Wooden friction creak (pulse train through resonances). */
export function creak(D: Dest, t: number, dur: number, g = 0.3, pitch = 1): void {
  g *= 2.6;
  const bp1 = filt(D, 'bandpass', 850 * pitch, 7);
  const bp2 = filt(D, 'bandpass', 1650 * pitch, 9);
  const env = gainNode(D, 1, bp1);
  env.connect(bp2);
  env.gain.setValueAtTime(EPS, t);
  env.gain.linearRampToValueAtTime(g, t + 0.08);
  env.gain.setValueAtTime(g, t + dur * 0.7);
  env.gain.exponentialRampToValueAtTime(EPS, t + dur);
  const o = D.ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(rand(14, 22) * pitch, t);
  o.frequency.linearRampToValueAtTime(rand(28, 46) * pitch, t + dur * rand(0.4, 0.7));
  o.frequency.linearRampToValueAtTime(rand(16, 30) * pitch, t + dur);
  o.connect(env);
  o.start(t);
  o.stop(t + dur + 0.05);
  D.track(o);
}

/** Metallic hit: inharmonic partials. */
function metal(D: Dest, t: number, base: number, g: number, d: number): void {
  const ratios = [1, 1.73, 2.41, 3.33, 4.07];
  ratios.forEach((r, i) => tone(D, { f: base * r * rand(0.99, 1.01), t, a: 0.001, d: d * (1 - i * 0.13), g: g / (1 + i * 0.6) }));
  noise(D, { t, d: 0.025, g: g * 2.2, type: 'highpass', f: 3200 });
}

/** A crowd of shouting voices through vowel formants. */
function voices(D: Dest, t: number, o: { n: number; f0: number; f1: number; dur: number; g: number; rise?: number; vowel?: 'a' | 'o' | 'e' }): void {
  const form = o.vowel === 'o' ? [520, 900] : o.vowel === 'e' ? [500, 1750] : [760, 1200];
  const b1 = filt(D, 'bandpass', form[0], 4);
  const b2 = filt(D, 'bandpass', form[1], 5);
  const bus = gainNode(D, 1, b1);
  bus.connect(b2);
  for (let i = 0; i < o.n; i++) {
    const st = t + rand(0, 0.45);
    const f = rand(o.f0, o.f1);
    const len = o.dur * rand(0.6, 1);
    const osc = D.ctx.createOscillator();
    osc.setPeriodicWave(D.waves.voice);
    osc.frequency.setValueAtTime(f * 0.9, st);
    osc.frequency.linearRampToValueAtTime(f * (o.rise ?? 1.12), st + len * 0.35);
    osc.frequency.linearRampToValueAtTime(f * (o.rise ?? 1.12) * 0.86, st + len);
    const lfo = D.ctx.createOscillator();
    lfo.frequency.value = rand(5, 8);
    const lg = D.ctx.createGain();
    lg.gain.value = f * 0.03;
    lfo.connect(lg);
    lg.connect(osc.frequency);
    const g = D.ctx.createGain();
    adsr(g.gain, st, rand(0.08, 0.3), o.g * rand(0.6, 1), len * 0.45, len * 0.4);
    osc.connect(g);
    g.connect(bus);
    for (const s of [osc, lfo]) {
      s.start(st);
      s.stop(st + len + 0.1);
      D.track(s);
    }
  }
}

// ───────────────────────────── Weapons ─────────────────────────────

export const CANNON_POWER: Record<CannonType, number> = { sahi: 1, buyuk: 0.72, orta: 0.5, kucuk: 0.32, havan: 0.55 };

/** Cannon shot. Şahi: sub-bass thump, blast, rolling rumble, debris crackle, echoes off the hills. */
export function cannon(D: Dest, p: { type: CannonType }): void {
  const t = D.t;
  const near = D.far < 0.62;
  switch (p.type) {
    case 'sahi': {
      if (near) noise(D, { t, a: 0.001, d: 0.14, g: 0.85, type: 'highpass', f: 900 });
      noise(D, { buf: 'pink', t, a: 0.002, d: 1.1, g: 1.0, type: 'lowpass', f: 2600, f1: 260 });
      tone(D, { f: 64, f1: 25, t, a: 0.004, d: 1.8, g: 1.5 });
      tone(D, { type: 'triangle', f: 118, f1: 44, t, d: 0.55, g: 0.45 });
      rumble(D, t + 0.05, { a: 0.3, h: 0.7, d: 6.5, g: 1.25, f: 170 });
      noise(D, { buf: 'pink', t, a: 0.05, d: 2.6, g: 0.42, type: 'bandpass', f: 320, q: 0.8 });
      if (near) {
        noise(D, { buf: 'crackle', t: t + 0.22, a: 0.12, d: 1.9, g: 0.42, type: 'bandpass', f: 2300, q: 0.6 });
        tone(D, { type: 'triangle', f: 173, t, d: 1.6, g: 0.035 });
        tone(D, { f: 411, t, d: 1.1, g: 0.02 });
      }
      // Echo off the Thracian hills and the walls.
      for (const [dt, g] of [
        [0.95, 0.34],
        [1.85, 0.2],
        [3.0, 0.12],
      ]) {
        noise(D, { buf: 'brown', t: t + dt, a: 0.06, d: 1.7, g, type: 'lowpass', f: 380, f1: 120 });
        tone(D, { f: 52, f1: 30, t: t + dt, a: 0.02, d: 0.9, g: g * 0.7 });
      }
      break;
    }
    case 'buyuk': {
      if (near) noise(D, { t, a: 0.001, d: 0.1, g: 0.8, type: 'highpass', f: 1100 });
      noise(D, { buf: 'pink', t, a: 0.002, d: 0.8, g: 0.9, type: 'lowpass', f: 3000, f1: 320 });
      tone(D, { f: 78, f1: 32, t, a: 0.003, d: 1.1, g: 1.05 });
      rumble(D, t + 0.04, { a: 0.2, h: 0.3, d: 3.4, g: 0.7, f: 200 });
      if (near) noise(D, { buf: 'crackle', t: t + 0.18, a: 0.08, d: 1.2, g: 0.3, type: 'bandpass', f: 2500, q: 0.6 });
      noise(D, { buf: 'brown', t: t + 1.1, a: 0.05, d: 1.4, g: 0.2, type: 'lowpass', f: 400 });
      break;
    }
    case 'orta': {
      if (near) noise(D, { t, a: 0.001, d: 0.07, g: 0.8, type: 'highpass', f: 1500 });
      noise(D, { buf: 'pink', t, a: 0.001, d: 0.5, g: 0.8, type: 'lowpass', f: 3800, f1: 420 });
      tone(D, { f: 98, f1: 44, t, a: 0.002, d: 0.6, g: 0.85 });
      rumble(D, t + 0.03, { a: 0.12, h: 0.2, d: 1.8, g: 0.5, f: 240 });
      break;
    }
    case 'kucuk': {
      if (near) noise(D, { t, a: 0.001, d: 0.05, g: 0.75, type: 'highpass', f: 2200 });
      noise(D, { buf: 'pink', t, a: 0.001, d: 0.32, g: 0.7, type: 'lowpass', f: 5200, f1: 600 });
      tone(D, { f: 140, f1: 58, t, a: 0.002, d: 0.3, g: 0.6 });
      rumble(D, t + 0.02, { a: 0.08, h: 0.1, d: 1.0, g: 0.32, f: 300 });
      break;
    }
    case 'havan': {
      noise(D, { buf: 'pink', t, a: 0.002, d: 0.7, g: 0.8, type: 'lowpass', f: 1300, f1: 200 });
      tone(D, { f: 72, f1: 34, t, a: 0.003, d: 0.75, g: 1.0 });
      tone(D, { type: 'triangle', f: 230, f1: 175, t, d: 0.3, g: 0.22 });
      rumble(D, t + 0.03, { a: 0.15, h: 0.2, d: 2.2, g: 0.5, f: 200 });
      break;
    }
  }
}

/** Stone ball impact: on wall (crunch, crumble, brick rain), on ground (thud, dirt). */
export function impact(D: Dest, p: { power: number; wall: boolean }): void {
  const t = D.t;
  const pw = Math.max(0.25, Math.min(1.3, p.power));
  const near = D.far < 0.6;
  if (p.wall) {
    tone(D, { f: 84, f1: 36, t, a: 0.002, d: 0.55, g: 1.0 * pw });
    noise(D, { t, a: 0.001, d: 0.28, g: 0.85 * pw, type: 'bandpass', f: 950, q: 0.9 });
    noise(D, { buf: 'brown', t, a: 0.04, d: 1.7 * pw, g: 0.62 * pw, type: 'lowpass', f: 650, f1: 160 });
    if (near) {
      noise(D, { buf: 'crackle', t, a: 0.01, d: 1.0 * pw, g: 0.6 * pw, type: 'bandpass', f: 1450, q: 0.5 });
      noise(D, { buf: 'crackle', t: t + 0.35, a: 0.15, h: 0.3 * pw, d: 1.5, g: 0.32 * pw, type: 'highpass', f: 2400, rate: 0.8 });
    }
    if (pw > 0.8) {
      tone(D, { f: 64, f1: 30, t: t + 0.2, a: 0.01, d: 0.8, g: 0.6 });
      noise(D, { buf: 'pink', t: t + 0.18, a: 0.05, d: 1.4, g: 0.4, type: 'lowpass', f: 1200, f1: 250 });
    }
  } else {
    tone(D, { f: 72, f1: 34, t, a: 0.002, d: 0.45, g: 0.9 * pw });
    noise(D, { buf: 'pink', t, a: 0.002, d: 0.55, g: 0.6 * pw, type: 'lowpass', f: 1800, f1: 280 });
    if (near) noise(D, { buf: 'crackle', t: t + 0.18, a: 0.05, d: 0.8, g: 0.24 * pw, type: 'lowpass', f: 1600 });
  }
}

export function splash(D: Dest, p: { size: number }): void {
  const t = D.t;
  const s = Math.max(0.3, Math.min(1.5, p.size));
  tone(D, { f: 440, f1: 90, t, a: 0.001, d: 0.16, g: 0.45 * s });
  noise(D, { t, a: 0.008, d: 0.55 * s, g: 0.7 * s, type: 'bandpass', f: 1900, f1: 450, q: 0.9 });
  noise(D, { buf: 'brown', t, a: 0.02, d: 0.7 * s, g: 0.4 * s, type: 'lowpass', f: 450 });
  if (D.far < 0.6) noise(D, { buf: 'drops', t: t + 0.12, a: 0.05, d: 1.0 * s, g: 0.3 * s, type: 'highpass', f: 2000 });
}

export function towerCollapse(D: Dest): void {
  const t = D.t;
  noise(D, { t, a: 0.002, d: 0.25, g: 0.7, type: 'highpass', f: 600 });
  tone(D, { f: 60, f1: 28, t, a: 0.004, d: 1.4, g: 1.0 });
  noise(D, { buf: 'crackle', t, a: 0.3, d: 2.2, g: 0.5, type: 'bandpass', f: 420, q: 1.2, rate: 0.5 });
  for (let i = 0; i < 9; i++) {
    const ti = t + rand(0.25, 3.4);
    tone(D, { f: rand(45, 85), f1: rand(24, 34), t: ti, a: 0.004, d: 0.55, g: rand(0.35, 0.75) });
    noise(D, { buf: 'pink', t: ti, a: 0.005, d: 0.7, g: rand(0.25, 0.45), type: 'lowpass', f: 950, f1: 200 });
  }
  rumble(D, t + 0.1, { a: 0.5, h: 1.6, d: 4.2, g: 1.0, f: 150 });
  noise(D, { buf: 'pink', t: t + 0.4, a: 1.0, d: 3.2, g: 0.12, type: 'highpass', f: 1600 });
  noise(D, { buf: 'crackle', t: t + 1.4, a: 0.5, h: 1.0, d: 3.0, g: 0.3, type: 'bandpass', f: 2000, q: 0.6 });
}

/** Mine collapse: muffled underground rumble. */
export function mineCollapse(D: Dest, p: { big?: boolean }): void {
  const t = D.t;
  const lp = filt(D, 'lowpass', 340, 0.7);
  const U: Dest = { ...D, out: lp };
  tone(U, { f: 42, f1: 22, t, a: 0.05, d: 2.2, g: 1.1 });
  rumble(U, t, { a: 0.3, h: 1.2, d: 3.5, g: 1.0, f: 200 });
  for (let i = 0; i < 5; i++) tone(U, { f: rand(50, 70), f1: 30, t: t + rand(0.2, 2.2), d: 0.5, g: rand(0.3, 0.6) });
  noise(D, { buf: 'crackle', t: t + 0.4, a: 0.3, d: 2.0, g: 0.18, type: 'lowpass', f: 900 });
  if (p.big) towerCollapse({ ...D, t: t + 0.8 });
}

export function arrows(D: Dest, p: { count: number }): void {
  const t = D.t;
  const n = Math.max(3, Math.min(9, Math.round(3 + p.count / 25)));
  if (D.far < 0.5) for (let i = 0; i < 3; i++) tone(D, { type: 'triangle', f: rand(160, 200), f1: 140, t: t + rand(0, 0.08), d: 0.12, g: 0.1 });
  for (let i = 0; i < n; i++) {
    const t0 = t + rand(0, 0.38);
    noise(D, { t: t0, a: 0.06, d: rand(0.3, 0.5), g: rand(0.35, 0.55), type: 'bandpass', f: rand(2600, 4300), f1: rand(700, 1100), q: 2.6 });
    const ti = t0 + rand(0.65, 1.05);
    tone(D, { f: rand(260, 330), f1: 120, t: ti, d: 0.05, g: 0.2 });
    noise(D, { t: ti, d: 0.04, g: 0.16, type: 'bandpass', f: 1200, q: 1.5 });
    if (Math.random() < 0.3) tone(D, { f: rand(2900, 3600), t: ti, d: 0.08, g: 0.06 });
  }
}

export function clash(D: Dest, p: { intensity: number }): void {
  const t = D.t;
  const n = Math.max(1, Math.min(5, Math.round(1 + p.intensity * 4)));
  for (let i = 0; i < n; i++) {
    const ti = t + rand(0, 0.55);
    metal(D, ti, rand(1600, 2700), 0.11, rand(0.2, 0.45));
    if (Math.random() < 0.55) {
      tone(D, { f: rand(140, 180), f1: 85, t: ti + rand(0.05, 0.2), d: 0.09, g: 0.36 });
      noise(D, { buf: 'pink', t: ti, d: 0.07, g: 0.28, type: 'lowpass', f: 700 });
    }
  }
  if (Math.random() < 0.4) voices(D, t + rand(0, 0.3), { n: 1, f0: 120, f1: 170, dur: 0.35, g: 0.12, rise: 0.9, vowel: 'a' });
}

/** Crowd: 'hucum' (battle cry, chanted pulses), 'zafer' (cheer), 'panik', 'tezahurat' (small cheer). */
export function crowd(D: Dest, p: { kind: 'hucum' | 'zafer' | 'panik' | 'tezahurat'; size?: number }): void {
  const t = D.t;
  const size = p.size ?? 1;
  const dur = p.kind === 'tezahurat' ? 1.4 : p.kind === 'panik' ? 1.8 : 3.2;
  const roar = gainNode(D, 1);
  if (p.kind === 'hucum') {
    // "Allah Allah!" — chanted pulses of the roar.
    const gp = roar.gain;
    gp.setValueAtTime(0.4, t);
    for (let k = 0; k < 3; k++) {
      const tk = t + 0.15 + k * 0.95;
      gp.linearRampToValueAtTime(0.45, tk);
      gp.linearRampToValueAtTime(1, tk + 0.18);
      gp.setValueAtTime(1, tk + 0.6);
      gp.linearRampToValueAtTime(0.45, tk + 0.85);
    }
  }
  noise(D, { buf: 'pink', t, a: 0.35, h: dur * 0.5, d: dur * 0.5, g: 0.45 * size, type: 'bandpass', f: 720, q: 0.6, out: roar });
  noise(D, { buf: 'brown', t, a: 0.4, h: dur * 0.4, d: dur * 0.6, g: 0.3 * size, type: 'lowpass', f: 300, out: roar });
  const n = p.kind === 'tezahurat' ? 5 : 10;
  const pitch = p.kind === 'zafer' ? [170, 290] : p.kind === 'panik' ? [260, 420] : p.kind === 'tezahurat' ? [160, 260] : [125, 230];
  voices({ ...D, out: roar }, t, { n, f0: pitch[0], f1: pitch[1], dur, g: 0.065 * size, rise: p.kind === 'panik' ? 1.3 : 1.12, vowel: p.kind === 'zafer' ? 'e' : 'a' });
}

export function groan(D: Dest): void {
  voices(D, D.t, { n: 2, f0: 100, f1: 140, dur: 0.8, g: 0.3, rise: 0.78, vowel: 'o' });
}

export function warDrums(D: Dest): void {
  const t = D.t;
  kos(D, t, 1);
  const times = [0.7, 1.25, 1.7, 2.05, 2.35, 2.6, 2.82, 3.0, 3.16, 3.3];
  for (const dt of times) davul(D, t + dt, 'dum', 0.8);
  kos(D, t + 3.5, 1);
  zil(D, t + 3.5, 0.7, 2);
}

// ───────────────────────────── Fire, wood, water ─────────────────────────────

/** Continuous fire (for loops): crackle + roar; returns nothing, runs `dur` s. */
export function fireBed(D: Dest, dur: number, g = 1): void {
  const t = D.t;
  noise(D, { buf: 'crackle', t, a: 0.6, h: dur, d: 1.5, g: 0.42 * g, type: 'bandpass', f: 2600, q: 0.5, rate: rand(0.8, 1.2) });
  noise(D, { buf: 'crackle', t, a: 0.6, h: dur, d: 1.5, g: 0.3 * g, type: 'lowpass', f: 900, rate: 0.45 });
  noise(D, { buf: 'brown', t, a: 0.9, h: dur, d: 2, g: 0.5 * g, type: 'lowpass', f: 380 });
  noise(D, { buf: 'pink', t, a: 0.9, h: dur, d: 2, g: 0.08 * g, type: 'bandpass', f: 900, q: 0.8 });
}

export function fireWhoosh(D: Dest, p: { big?: boolean }): void {
  const t = D.t;
  const s = p.big ? 1 : 0.6;
  noise(D, { buf: 'pink', t, a: 0.15, d: 1.4 * s, g: 1.1 * s, type: 'bandpass', f: 500, f1: 2200, q: 0.9 });
  noise(D, { buf: 'brown', t, a: 0.2, d: 2 * s, g: 0.5 * s, type: 'lowpass', f: 300 });
  noise(D, { buf: 'crackle', t: t + 0.2, a: 0.2, d: 2.4 * s, g: 0.35, type: 'bandpass', f: 2400, q: 0.6 });
}

export function greekFire(D: Dest): void {
  const t = D.t;
  fireWhoosh(D, { big: true });
  noise(D, { t: t + 0.2, a: 0.1, h: 2, d: 1.2, g: 0.13, type: 'highpass', f: 5200 });
  noise(D, { buf: 'brown', t: t + 0.1, a: 0.4, h: 2.5, d: 2, g: 0.6, type: 'lowpass', f: 420 });
}

export function woodCrack(D: Dest, p: { size?: number }): void {
  const t = D.t;
  const s = p.size ?? 1;
  noise(D, { t, a: 0.001, d: 0.08, g: 0.7 * s, type: 'bandpass', f: 1800, q: 1.2 });
  noise(D, { buf: 'crackle', t, a: 0.005, d: 0.5, g: 0.42 * s, type: 'lowpass', f: 2500 });
  tone(D, { type: 'triangle', f: 230, f1: 90, t, d: 0.16, g: 0.32 * s });
  noise(D, { buf: 'crackle', t: t + 0.05, d: 0.3, g: 0.2 * s, type: 'highpass', f: 3000 });
}

export function shipSunk(D: Dest): void {
  const t = D.t;
  woodCrack(D, { size: 1.2 });
  woodCrack({ ...D, t: t + 0.4 }, { size: 0.9 });
  creak(D, t + 0.2, 2.6, 0.35, 0.6);
  splash({ ...D, t: t + 0.9 }, { size: 1.5 });
  for (let i = 0; i < 26; i++) {
    const ti = t + 1.2 + rand(0, 3);
    const f = rand(280, 900);
    tone(D, { f, f1: f * 1.7, t: ti, a: 0.002, d: rand(0.03, 0.07), g: rand(0.04, 0.1) });
  }
  noise(D, { buf: 'brown', t: t + 1, a: 0.5, d: 3, g: 0.35, type: 'lowpass', f: 300 });
}

export function oars(D: Dest, p: { n?: number }): void {
  const t = D.t;
  const n = p.n ?? 1;
  for (let i = 0; i < n; i++) {
    const ti = t + i * 0.04 + rand(0, 0.05);
    noise(D, { t: ti, a: 0.12, d: 0.5, g: 0.4, type: 'bandpass', f: 700, f1: 380, q: 1.2 });
    noise(D, { buf: 'drops', t: ti + 0.45, a: 0.05, d: 0.6, g: 0.1, type: 'highpass', f: 2200 });
  }
  tone(D, { type: 'triangle', f: 120, f1: 90, t, d: 0.08, g: 0.1 });
}

export function sailFlap(D: Dest): void {
  const t = D.t;
  for (let i = 0; i < 3; i++) noise(D, { buf: 'pink', t: t + i * rand(0.09, 0.15), a: 0.01, d: 0.12, g: 0.7, type: 'lowpass', f: 900 });
  noise(D, { buf: 'pink', t, a: 0.2, d: 0.8, g: 0.25, type: 'bandpass', f: 400, q: 0.8 });
}

export function chain(D: Dest): void {
  const t = D.t;
  for (let i = 0; i < 20; i++) {
    const ti = t + i * 0.075 + rand(0, 0.03);
    tone(D, { f: rand(2100, 3600), t: ti, d: 0.1, g: 0.08 });
    noise(D, { t: ti, d: 0.02, g: 0.12, type: 'bandpass', f: 4200, q: 2 });
    tone(D, { type: 'triangle', f: rand(300, 380), t: ti, d: 0.04, g: 0.08 });
  }
  creak(D, t, 1.6, 0.25, 0.7);
}

export function grapple(D: Dest): void {
  const t = D.t;
  noise(D, { t, a: 0.05, d: 0.3, g: 0.18, type: 'bandpass', f: 2600, f1: 1200, q: 2 });
  metal(D, t + 0.35, 1900, 0.1, 0.3);
  woodCrack({ ...D, t: t + 0.36 }, { size: 0.5 });
  clash({ ...D, t: t + 0.6 }, { intensity: 0.7 });
}

// ───────────────────────────── Construction ─────────────────────────────

export function hammer(D: Dest, p: { n?: number }): void {
  const n = p.n ?? (Math.random() < 0.5 ? 2 : 3);
  for (let i = 0; i < n; i++) {
    const ti = D.t + i * rand(0.34, 0.45);
    tone(D, { type: 'triangle', f: rand(190, 215), f1: 135, t: ti, d: 0.09, g: 0.42 });
    noise(D, { t: ti, d: 0.05, g: 0.42, type: 'bandpass', f: rand(650, 800), q: 1.5 });
  }
}

export function chisel(D: Dest): void {
  const n = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    const ti = D.t + i * rand(0.22, 0.3);
    tone(D, { f: rand(2400, 3200), t: ti, d: 0.12, g: 0.11 });
    tone(D, { f: rand(4400, 5200), t: ti, d: 0.07, g: 0.05 });
    noise(D, { t: ti, d: 0.03, g: 0.28, type: 'highpass', f: 3500 });
    noise(D, { buf: 'crackle', t: ti + 0.01, d: 0.15, g: 0.14, type: 'bandpass', f: 3000, q: 0.8 });
  }
}

export function saw(D: Dest): void {
  const strokes = 3 + Math.floor(Math.random() * 2);
  for (let i = 0; i < strokes; i++) {
    const ti = D.t + i * 0.42;
    const push = i % 2 === 0;
    const am = gainNode(D, 0.6);
    const sq = D.ctx.createOscillator();
    sq.type = 'square';
    sq.frequency.value = push ? rand(80, 100) : rand(60, 75);
    const depth = D.ctx.createGain();
    depth.gain.value = 0.4;
    sq.connect(depth);
    depth.connect(am.gain);
    sq.start(ti);
    sq.stop(ti + 0.45);
    D.track(sq);
    noise(D, { t: ti, a: 0.08, d: 0.3, g: push ? 0.9 : 0.6, type: 'bandpass', f: push ? 2800 : 2300, q: 2.5, out: am });
  }
}

export function crane(D: Dest): void {
  creak(D, D.t, 1.3, 0.3, 0.8);
  noise(D, { t: D.t + 0.2, a: 0.2, d: 0.6, g: 0.08, type: 'bandpass', f: 520, q: 4 });
  tone(D, { f: 92, f1: 58, t: D.t + 1.35, d: 0.22, g: 0.45 });
  noise(D, { buf: 'pink', t: D.t + 1.35, d: 0.18, g: 0.3, type: 'lowpass', f: 600 });
}

export function construction(D: Dest, p: { kind: 'hammer' | 'chisel' | 'saw' | 'crane' }): void {
  if (p.kind === 'chisel') chisel(D);
  else if (p.kind === 'saw') saw(D);
  else if (p.kind === 'crane') crane(D);
  else hammer(D, {});
}

export function buildDone(D: Dest): void {
  hammer(D, { n: 3 });
  crowd({ ...D, t: D.t + 1.1 }, { kind: 'tezahurat', size: 0.8 });
}

// ───────────────────────────── Animals, people, nature ─────────────────────────────

export function step(D: Dest, p: { men: number; armor?: boolean }): void {
  const n = Math.max(2, Math.min(7, Math.round(p.men / 120)));
  for (let i = 0; i < n; i++) {
    noise(D, { buf: 'pink', t: D.t + rand(0, 0.07), a: 0.004, d: 0.09, g: 0.5, type: 'lowpass', f: rand(350, 650) });
  }
  if (p.armor && Math.random() < 0.5) noise(D, { buf: 'crackle', t: D.t, d: 0.12, g: 0.18, type: 'highpass', f: 4200 });
}

export function hooves(D: Dest, p: { gallop?: boolean }): void {
  const pattern = p.gallop ? [0, 0.08, 0.16, 0.42] : [0, 0.3];
  for (const dt of pattern) {
    const ti = D.t + dt + rand(0, 0.015);
    tone(D, { f: rand(380, 450), f1: 280, t: ti, d: 0.035, g: 0.32 });
    noise(D, { t: ti, d: 0.035, g: 0.32, type: 'bandpass', f: 1400, q: 1.2 });
  }
}

export function neigh(D: Dest): void {
  const t = D.t;
  const b1 = filt(D, 'bandpass', 1100, 2);
  const b2 = filt(D, 'bandpass', 2400, 3);
  const g = gainNode(D, 1, b1);
  g.connect(b2);
  adsr(g.gain, t, 0.05, 0.3, 0.45, 0.85);
  const o = D.ctx.createOscillator();
  o.setPeriodicWave(D.waves.voice);
  const f = o.frequency;
  f.setValueAtTime(380, t);
  f.linearRampToValueAtTime(rand(900, 1000), t + 0.15);
  f.linearRampToValueAtTime(rand(620, 700), t + 0.7);
  f.linearRampToValueAtTime(400, t + 1.3);
  const lfo = D.ctx.createOscillator();
  lfo.frequency.value = rand(10, 13);
  const lg = D.ctx.createGain();
  lg.gain.setValueAtTime(0, t);
  lg.gain.linearRampToValueAtTime(70, t + 0.3);
  lfo.connect(lg);
  lg.connect(f);
  o.connect(g);
  for (const s of [o, lfo]) {
    s.start(t);
    s.stop(t + 1.45);
    D.track(s);
  }
  noise(D, { t, a: 0.05, d: 1.2, g: 0.06, type: 'bandpass', f: 1500, q: 1 });
  noise(D, { buf: 'pink', t: t + 1.35, a: 0.01, d: 0.22, g: 0.22, type: 'lowpass', f: 800 });
}

function animalCall(D: Dest, t: number, f0: number, contour: [number, number][], dur: number, g: number, form: [number, number], vib = 0, vibRate = 7): void {
  const b1 = filt(D, 'bandpass', form[0], 3);
  const b2 = filt(D, 'bandpass', form[1], 4);
  const gn = gainNode(D, 1, b1);
  gn.connect(b2);
  adsr(gn.gain, t, 0.04, g, dur * 0.4, dur * 0.5);
  const o = D.ctx.createOscillator();
  o.setPeriodicWave(D.waves.voice);
  o.frequency.setValueAtTime(f0 * contour[0][1], t);
  for (const [at, m] of contour) o.frequency.linearRampToValueAtTime(f0 * m, t + at * dur);
  o.connect(gn);
  const srcs: OscillatorNode[] = [o];
  if (vib > 0) {
    const lfo = D.ctx.createOscillator();
    lfo.frequency.value = vibRate;
    const lg = D.ctx.createGain();
    lg.gain.value = f0 * vib;
    lfo.connect(lg);
    lg.connect(o.frequency);
    srcs.push(lfo);
  }
  for (const s of srcs) {
    s.start(t);
    s.stop(t + dur + 0.1);
    D.track(s);
  }
}

export function bleat(D: Dest): void {
  animalCall(D, D.t, rand(380, 460), [[0, 1], [0.3, 1.05], [1, 0.92]], 0.7, 0.25, [900, 2300], 0.06, 8);
}

export function bark(D: Dest): void {
  for (let i = 0; i < (Math.random() < 0.5 ? 2 : 3); i++) {
    const ti = D.t + i * rand(0.25, 0.35);
    animalCall(D, ti, rand(330, 380), [[0, 1], [0.3, 1.1], [1, 0.7]], 0.14, 0.3, [1000, 2200]);
    noise(D, { t: ti, d: 0.1, g: 0.08, type: 'bandpass', f: 1200, q: 1 });
  }
}

export function moo(D: Dest): void {
  animalCall(D, D.t, rand(105, 120), [[0, 0.9], [0.2, 1], [1, 0.88]], 1.4, 0.3, [380, 900], 0.01, 4);
}

export function rooster(D: Dest): void {
  const t = D.t;
  const f0 = rand(560, 620);
  const sy: [number, number, number][] = [
    [0, 0.13, 1],
    [0.16, 0.13, 1.15],
    [0.32, 0.16, 1.3],
    [0.52, 0.85, 1.45],
  ];
  for (const [dt, d, m] of sy) animalCall(D, t + dt, f0 * m, [[0, 0.96], [0.3, 1.02], [1, dt > 0.5 ? 0.82 : 0.98]], d, 0.18, [1500, 3000], dt > 0.5 ? 0.02 : 0, 9);
}

export function seagull(D: Dest): void {
  const n = 2 + Math.floor(Math.random() * 3);
  let f = rand(1250, 1450);
  for (let i = 0; i < n; i++) {
    const ti = D.t + i * rand(0.32, 0.42);
    const hp = filt(D, 'highpass', 900, 0.7);
    animalCall({ ...D, out: hp }, ti, f, [[0, 1], [0.2, 1.55], [1, 1.12]], 0.3, 0.22, [2300, 3600], 0.015, 14);
    f *= 0.95;
  }
}

export function songbird(D: Dest): void {
  const n = 4 + Math.floor(Math.random() * 7);
  let t = D.t;
  const base = rand(3200, 5200);
  const trill = Math.random() < 0.35;
  for (let i = 0; i < n; i++) {
    const f = base * rand(0.8, 1.25);
    const d = trill ? 0.035 : rand(0.04, 0.12);
    tone(D, { f, f1: f * rand(0.7, 1.4), glide: 'lin', t, a: 0.004, d, g: 0.2 });
    t += d + (trill ? 0.012 : rand(0.03, 0.1));
  }
}

export function owl(D: Dest): void {
  const t = D.t;
  const f = rand(370, 410);
  const hoot = (ti: number, len: number) => {
    tone(D, { f: f * 1.02, f1: f * 0.96, t: ti, a: 0.07, h: len * 0.4, d: len * 0.6, g: 0.16 });
    tone(D, { f: f * 2, t: ti, a: 0.07, h: len * 0.3, d: len * 0.5, g: 0.015 });
  };
  hoot(t, 0.5);
  hoot(t + 1.0, 0.22);
  hoot(t + 1.3, 0.22);
  hoot(t + 1.6, 0.8);
}

export function anvil(D: Dest): void {
  const n = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n; i++) {
    const ti = D.t + i * rand(0.38, 0.5);
    for (const [f, g, d] of [
      [rand(1750, 1850), 0.1, 0.5],
      [2890, 0.06, 0.35],
      [4320, 0.035, 0.25],
    ]) tone(D, { f, t: ti, d, g });
    noise(D, { t: ti, d: 0.02, g: 0.15, type: 'highpass', f: 3000 });
  }
}

export function thunder(D: Dest): void {
  const t = D.t;
  noise(D, { t, a: 0.01, d: 0.4, g: 0.5, type: 'highpass', f: 700 });
  rumble(D, t + 0.1, { a: 0.4, h: 1.2, d: 5, g: 1.0, f: 220, wobble: rand(1.5, 3) });
  noise(D, { buf: 'crackle', t, a: 0.05, d: 2.2, g: 0.3, type: 'lowpass', f: 700, rate: 0.6 });
}

/** Church bells: toll count, big = Ayasofya-sized bell. */
export function bells(D: Dest, p: { tolls: number; alarm?: boolean }): void {
  const f0 = p.alarm ? rand(300, 340) : rand(196, 220);
  for (let i = 0; i < p.tolls; i++) {
    const ti = D.t + i * (p.alarm ? rand(0.55, 0.75) : rand(1.6, 2.1));
    bell(D, ti, f0 * (p.alarm && i % 2 ? 1.19 : 1), 0.9, p.alarm ? 0.7 : 1.2);
  }
}

/** Semantron (talanton): the Byzantine wooden board struck in an accelerating rhythm. */
export function semantron(D: Dest): void {
  const pattern = [0, 0.55, 1.1, 1.45, 1.75, 2.0, 2.2, 2.38, 2.54, 2.68, 2.8, 3.25];
  for (const dt of pattern) {
    const ti = D.t + dt;
    const f = rand(560, 640);
    tone(D, { type: 'triangle', f, f1: f * 0.75, t: ti, d: 0.07, g: 0.36 });
    noise(D, { t: ti, d: 0.05, g: 0.24, type: 'bandpass', f: 1100, q: 2 });
  }
}

export function camelBells(D: Dest): void {
  for (let i = 0; i < 14; i++) {
    const ti = D.t + rand(0, 2.4);
    const f = rand(1500, 2400);
    tone(D, { f, t: ti, d: 0.6, g: 0.05 });
    tone(D, { f: f * 2.76, t: ti, d: 0.25, g: 0.02 });
  }
  for (let i = 0; i < 4; i++) hooves({ ...D, t: D.t + i * 0.65 }, {});
}

export function eclipseOmen(D: Dest): void {
  const t = D.t;
  for (const [f, det] of [
    [55, 0],
    [82.4, 7],
    [110.7, -9],
  ]) {
    const lp = filt(D, 'lowpass', 600, 1);
    const g = gainNode(D, 1, lp);
    adsr(g.gain, t, 3, 0.16, 4, 3);
    const o = D.ctx.createOscillator();
    o.setPeriodicWave(D.waves.reed);
    o.frequency.value = f;
    o.detune.value = det;
    o.connect(g);
    o.start(t);
    o.stop(t + 10.2);
    D.track(o);
  }
  bells({ ...D, t: t + 1.5 }, { tolls: 5 });
}

// ───────────────────────────── Cannon misc ─────────────────────────────

export function cannonCracked(D: Dest): void {
  metal(D, D.t, 410, 0.3, 1.4);
  metal(D, D.t + 0.03, 233, 0.25, 1.8);
  noise(D, { buf: 'crackle', t: D.t, d: 0.6, g: 0.4, type: 'bandpass', f: 1800 });
  voices({ ...D, t: D.t + 0.4 }, D.t + 0.4, { n: 4, f0: 140, f1: 220, dur: 1.2, g: 0.1, rise: 1.2, vowel: 'a' });
}

export function oxen(D: Dest): void {
  moo(D);
  creak(D, D.t + 0.3, 1.5, 0.22, 0.6);
  for (let i = 0; i < 3; i++) hooves({ ...D, t: D.t + i * 0.7 }, {});
}

export function coin(D: Dest): void {
  for (let i = 0; i < 3; i++) {
    const ti = D.t + i * rand(0.05, 0.09);
    tone(D, { f: rand(3800, 4600), t: ti, d: 0.18, g: 0.12 });
    tone(D, { f: rand(6000, 7000), t: ti, d: 0.1, g: 0.06 });
  }
}

// ───────────────────────────── UI ─────────────────────────────

const HICAZ = MAKAMS.hicaz;
const uiNote = (deg: number) => degreeHz(HICAZ, deg, 1);

export function ui(D: Dest, kind: 'tik' | 'ac' | 'kapat' | 'hata' | 'onay' | 'sayfa'): void {
  const t = D.t;
  switch (kind) {
    case 'tik':
      tone(D, { f: 2300, f1: 1800, t, a: 0.001, d: 0.03, g: 0.22 });
      tone(D, { type: 'triangle', f: 920, t, a: 0.001, d: 0.022, g: 0.1 });
      noise(D, { t, d: 0.012, g: 0.12, type: 'highpass', f: 5000 });
      break;
    case 'ac':
      pluck(D, t, uiNote(0), 0.7, 'kanun');
      pluck(D, t + 0.07, uiNote(4), 0.6, 'kanun');
      noise(D, { t, a: 0.04, d: 0.18, g: 0.07, type: 'bandpass', f: 2500, f1: 5200, q: 1 });
      break;
    case 'kapat':
      pluck(D, t, uiNote(4), 0.55, 'kanun');
      pluck(D, t + 0.07, uiNote(0), 0.6, 'kanun');
      noise(D, { t, a: 0.03, d: 0.16, g: 0.06, type: 'bandpass', f: 5000, f1: 2000, q: 1 });
      break;
    case 'hata': {
      const lp = filt(D, 'lowpass', 900, 0.8);
      for (const dt of [0, 0.13]) {
        tone(D, { type: 'square', f: 150, t: t + dt, a: 0.003, d: 0.09, g: 0.12, out: lp });
        tone(D, { type: 'square', f: 159, t: t + dt, a: 0.003, d: 0.09, g: 0.09, out: lp });
      }
      tone(D, { type: 'triangle', f: 75, t, d: 0.2, g: 0.2 });
      break;
    }
    case 'onay':
      for (const [i, deg] of [0, 2, 4, 7].entries()) pluck(D, t + i * 0.045, uiNote(deg), 0.55, 'kanun');
      tone(D, { f: 5200, t: t + 0.15, d: 0.4, g: 0.025 });
      tone(D, { f: 7100, t: t + 0.15, d: 0.3, g: 0.015 });
      break;
    case 'sayfa':
      noise(D, { buf: 'pink', t, a: 0.03, d: 0.22, g: 0.25, type: 'bandpass', f: 3000, f1: 1800, q: 0.8 });
      noise(D, { buf: 'crackle', t: t + 0.02, d: 0.2, g: 0.12, type: 'highpass', f: 2500 });
      noise(D, { buf: 'brown', t, a: 0.05, d: 0.2, g: 0.08, type: 'lowpass', f: 500 });
      break;
  }
}

// ───────────────────────────── Registry ─────────────────────────────

export interface SfxDef<P = any> {
  /** Priority for the voice limiter (UI 9, Şahi 10, ambience 1). */
  pri: number;
  /** Length (s) used for voice accounting. */
  dur: number;
  /** Carrying range for spatialize(). */
  range: number;
  /** Hill-echo send. */
  echo?: number;
  /** Music/ambience duck amount at full volume. */
  duck?: number;
  gain?: number;
  play(D: Dest, p: P): void;
}

const def = <P>(d: SfxDef<P>): SfxDef<P> => d;

export const SFX = {
  sahi: def<void>({ pri: 10, dur: 7, range: 5, echo: 0.55, duck: 0.9, play: (D) => cannon(D, { type: 'sahi' }) }),
  buyuk: def<void>({ pri: 8, dur: 4.5, range: 3, echo: 0.35, duck: 0.45, play: (D) => cannon(D, { type: 'buyuk' }) }),
  orta: def<void>({ pri: 6, dur: 2.5, range: 2, echo: 0.2, duck: 0.15, gain: 0.9, play: (D) => cannon(D, { type: 'orta' }) }),
  kucuk: def<void>({ pri: 5, dur: 1.5, range: 1.4, echo: 0.12, gain: 0.85, play: (D) => cannon(D, { type: 'kucuk' }) }),
  havan: def<void>({ pri: 6, dur: 2.6, range: 2, echo: 0.25, duck: 0.2, play: (D) => cannon(D, { type: 'havan' }) }),
  impactWall: def<{ power: number }>({ pri: 7, dur: 2.6, range: 2, echo: 0.15, play: (D, p) => impact(D, { power: p.power, wall: true }) }),
  impactGround: def<{ power: number }>({ pri: 5, dur: 1.4, range: 1.5, play: (D, p) => impact(D, { power: p.power, wall: false }) }),
  splash: def<{ size: number }>({ pri: 4, dur: 1.3, range: 1.2, play: splash }),
  breach: def<void>({
    pri: 9,
    dur: 5,
    range: 3,
    echo: 0.3,
    duck: 0.5,
    play: (D) => {
      impact(D, { power: 1.3, wall: true });
      mineCollapse({ ...D, t: D.t + 0.3 }, {});
      crowd({ ...D, t: D.t + 1.2 }, { kind: 'zafer', size: 0.8 });
    },
  }),
  towerCollapse: def<void>({ pri: 10, dur: 7, range: 4, echo: 0.45, duck: 0.85, play: towerCollapse }),
  mineCollapse: def<{ big?: boolean }>({ pri: 8, dur: 6, range: 2.5, duck: 0.4, play: mineCollapse }),
  arrows: def<{ count: number }>({ pri: 4, dur: 1.6, range: 1, gain: 0.8, play: arrows }),
  clash: def<{ intensity: number }>({ pri: 4, dur: 1.2, range: 1, gain: 0.85, play: clash }),
  crowd: def<{ kind: 'hucum' | 'zafer' | 'panik' | 'tezahurat'; size?: number }>({ pri: 7, dur: 4, range: 2.2, play: crowd }),
  groan: def<void>({ pri: 2, dur: 1, range: 0.8, gain: 0.7, play: groan }),
  warDrums: def<void>({ pri: 8, dur: 6, range: 3, echo: 0.2, play: warDrums }),
  fireWhoosh: def<{ big?: boolean }>({ pri: 6, dur: 3, range: 1.5, play: fireWhoosh }),
  greekFire: def<void>({ pri: 7, dur: 5, range: 1.8, play: greekFire }),
  woodCrack: def<{ size?: number }>({ pri: 5, dur: 0.8, range: 1.2, play: woodCrack }),
  shipSunk: def<void>({ pri: 8, dur: 5, range: 2.2, duck: 0.25, play: shipSunk }),
  oars: def<{ n?: number }>({ pri: 2, dur: 1.4, range: 0.9, gain: 0.8, play: oars }),
  sail: def<void>({ pri: 1, dur: 1, range: 0.8, gain: 0.6, play: sailFlap }),
  creak: def<{ dur?: number; pitch?: number }>({ pri: 1, dur: 2, range: 0.8, gain: 0.7, play: (D, p) => creak(D, D.t, p.dur ?? 1.2, 0.28, p.pitch ?? 0.8) }),
  chain: def<void>({ pri: 7, dur: 2.2, range: 1.8, play: chain }),
  grapple: def<void>({ pri: 5, dur: 1.8, range: 1.2, play: grapple }),
  construction: def<{ kind: 'hammer' | 'chisel' | 'saw' | 'crane' }>({ pri: 2, dur: 1.8, range: 0.9, gain: 0.75, play: construction }),
  buildDone: def<void>({ pri: 6, dur: 3, range: 1.6, play: buildDone }),
  step: def<{ men: number; armor?: boolean }>({ pri: 1, dur: 0.25, range: 0.8, gain: 0.7, play: step }),
  hooves: def<{ gallop?: boolean }>({ pri: 1, dur: 0.6, range: 0.9, gain: 0.7, play: hooves }),
  neigh: def<void>({ pri: 2, dur: 1.7, range: 1.2, gain: 0.7, play: neigh }),
  bleat: def<void>({ pri: 1, dur: 0.9, range: 0.9, gain: 0.6, play: bleat }),
  bark: def<void>({ pri: 1, dur: 1, range: 1, gain: 0.55, play: bark }),
  oxen: def<void>({ pri: 3, dur: 2.5, range: 1.2, play: oxen }),
  rooster: def<void>({ pri: 2, dur: 1.6, range: 1.6, gain: 0.7, play: rooster }),
  seagull: def<void>({ pri: 1, dur: 1.6, range: 1.2, gain: 0.55, play: seagull }),
  songbird: def<void>({ pri: 1, dur: 1.2, range: 1, gain: 0.5, play: songbird }),
  owl: def<void>({ pri: 1, dur: 2.6, range: 1.4, gain: 0.6, play: owl }),
  anvil: def<void>({ pri: 1, dur: 2, range: 1, gain: 0.5, play: anvil }),
  thunder: def<void>({ pri: 6, dur: 7, range: 6, duck: 0.3, play: thunder }),
  bells: def<{ tolls: number; alarm?: boolean }>({ pri: 5, dur: 12, range: 4, gain: 0.7, play: bells }),
  semantron: def<void>({ pri: 3, dur: 3.6, range: 3, gain: 0.55, play: semantron }),
  camelBells: def<void>({ pri: 2, dur: 3, range: 1.2, gain: 0.7, play: camelBells }),
  eclipse: def<void>({ pri: 7, dur: 11, range: 10, play: eclipseOmen }),
  cannonCracked: def<void>({ pri: 7, dur: 2.2, range: 1.5, play: cannonCracked }),
  coin: def<void>({ pri: 1, dur: 0.4, range: 0.8, gain: 0.6, play: coin }),
  fireBed: def<{ dur: number }>({ pri: 3, dur: 10, range: 1.2, play: (D, p) => fireBed(D, p.dur) }),
} satisfies Record<string, SfxDef>;

export type SfxId = keyof typeof SFX;
export type SfxParams<K extends SfxId> = (typeof SFX)[K] extends SfxDef<infer P> ? P : never;
