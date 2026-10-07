/**
 * Debug hooks (window.__audio) for QA: engine stats, trigger any SFX or music
 * mode, and render a sound OFFLINE to measure its level (peak / RMS) — useful
 * in headless runs where nothing can be heard.
 */
import { engine } from './engine';
import { bell, cevgen, davul, kos, nakkare, neyPhrase, pluck, zil, zurnaPhrase } from './instruments';
import { music, type MusicMode } from './music';
import { SFX, type SfxId } from './sfx';
import { makeBuffers, makeWaves, type Dest } from './synth';
import { MAKAMS, composeMarch, degreeHz } from './theory';

type Extra = 'ney' | 'zurna' | 'kos' | 'davul' | 'nakkare' | 'zil' | 'cevgen' | 'kanun' | 'ud' | 'bell' | 'mehterBar';

const EXTRA: Record<Extra, (D: Dest) => void> = {
  ney: (D) => neyPhrase(D, [0, 1, 2, 3, 2, 1, 0].map((d) => ({ f: degreeHz(MAKAMS.hicaz, d, 1), dur: 0.5, glide: d % 2 === 0 })), 0.9),
  zurna: (D) => {
    const m = composeMarch(1453, 'hicaz');
    const E = 60 / 96 / 2;
    zurnaPhrase(
      D,
      m.teslim.phrases[0].notes.map((n) => ({ f: degreeHz(MAKAMS.hicaz, n.deg, 1), fu: degreeHz(MAKAMS.hicaz, n.deg + 1, 1), dur: n.dur * E, orn: n.orn, acc: n.acc })),
      1,
    );
  },
  kos: (D) => kos(D, D.t, 1),
  davul: (D) => ['dum', 'tek', 'tek', 'dum', 'tek'].forEach((k, i) => davul(D, D.t + i * 0.3, k as 'dum', 1)),
  nakkare: (D) => {
    for (let i = 0; i < 8; i++) nakkare(D, D.t + i * 0.16, 0.8, i % 2 === 1);
  },
  zil: (D) => zil(D, D.t, 1, 2),
  cevgen: (D) => cevgen(D, D.t, 1),
  kanun: (D) => [0, 2, 4, 7].forEach((d, i) => pluck(D, D.t + i * 0.15, degreeHz(MAKAMS.rast, d), 0.8, 'kanun')),
  ud: (D) => [0, 2, 4, 7].forEach((d, i) => pluck(D, D.t + i * 0.2, degreeHz(MAKAMS.rast, d), 0.8, 'ud')),
  bell: (D) => bell(D, D.t, 210, 1, 1.2),
  mehterBar: (D) => {
    const E = 60 / 96 / 2;
    for (let i = 0; i < 16; i++) {
      const t = D.t + i * E;
      if (i % 8 === 0) kos(D, t, 0.95);
      if ([0, 4, 8, 12].includes(i)) davul(D, t, 'dum', 0.85);
      if ([2, 3, 6, 10, 11, 14].includes(i)) davul(D, t, 'tek', 0.85);
      nakkare(D, t, 0.5, i % 2 === 1);
      if (i % 4 === 2) cevgen(D, t, 0.7);
    }
    zil(D, D.t, 0.75, 2.2);
    EXTRA.zurna(D);
  },
};

export interface Analysis {
  name: string;
  peak: number;
  rms: number;
  /** Fraction of samples above 0.99 (pre-limiter clipping). */
  clip: number;
  /** RMS per 0.25 s window (envelope sketch). */
  env: number[];
}

async function renderOffline(name: string, params: unknown = {}, seconds = 4): Promise<Analysis> {
  const sr = 44100;
  const octx = new OfflineAudioContext(2, Math.floor(sr * seconds), sr);
  const out = octx.createGain();
  out.connect(octx.destination);
  const D: Dest = { ctx: octx, bufs: makeBuffers(octx), waves: makeWaves(octx), out, echo: null, far: 0, t: 0.02, track: () => {} };
  if (name in SFX) {
    const def = SFX[name as SfxId];
    out.gain.value = def.gain ?? 1;
    (def.play as (D: Dest, p: unknown) => void)(D, params);
  } else if (name in EXTRA) EXTRA[name as Extra](D);
  else throw new Error('unknown sound ' + name);
  const buf = await octx.startRendering();
  let peak = 0;
  let sum = 0;
  let clip = 0;
  const env: number[] = [];
  const win = Math.floor(sr * 0.25);
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  let ws = 0;
  for (let i = 0; i < L.length; i++) {
    const a = Math.max(Math.abs(L[i]), Math.abs(R[i]));
    peak = Math.max(peak, a);
    if (a > 0.99) clip++;
    const s = (L[i] * L[i] + R[i] * R[i]) / 2;
    sum += s;
    ws += s;
    if ((i + 1) % win === 0) {
      env.push(Math.round(Math.sqrt(ws / win) * 1000) / 1000);
      ws = 0;
    }
  }
  return { name, peak: Math.round(peak * 1000) / 1000, rms: Math.round(Math.sqrt(sum / L.length) * 1000) / 1000, clip: clip / L.length, env };
}

let installed = false;
let meters: Record<string, AnalyserNode> | null = null;

/** RMS / peak of the music, sfx, ambience buses and master right now. */
function levels(): Record<string, { rms: number; peak: number }> | null {
  const ctx = engine.ctx;
  if (!ctx) return null;
  if (!meters) {
    meters = {};
    const taps: [string, AudioNode][] = [
      ['master', engine.master],
      ['music', engine.buses.music],
      ['sfx', engine.buses.sfx],
      ['amb', engine.buses.amb],
    ];
    for (const [k, n] of taps) {
      const a = ctx.createAnalyser();
      a.fftSize = 8192;
      n.connect(a);
      meters[k] = a;
    }
  }
  const out: Record<string, { rms: number; peak: number }> = {};
  const buf = new Float32Array(8192);
  for (const [k, a] of Object.entries(meters)) {
    a.getFloatTimeDomainData(buf);
    let s = 0;
    let p = 0;
    for (const x of buf) {
      s += x * x;
      p = Math.max(p, Math.abs(x));
    }
    out[k] = { rms: Math.round(Math.sqrt(s / buf.length) * 1000) / 1000, peak: Math.round(p * 1000) / 1000 };
  }
  return out;
}

export function installAudioDebug(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  (window as unknown as { __audio: unknown }).__audio = {
    engine,
    stats: () => ({ ...engine.stats(), music: music.mode }),
    unlock: () => engine.unlock(),
    music: (m: MusicMode) => music.setMode(m, 1),
    sounds: () => [...Object.keys(SFX), ...Object.keys(EXTRA)],
    play: (id: SfxId, params: unknown = {}) => {
      const def = SFX[id];
      const v = engine.voice({ pri: def.pri, dur: def.dur, gain: def.gain, echo: def.echo });
      if (v) (def.play as (D: Dest, p: unknown) => void)(v, params);
      return !!v;
    },
    analyze: renderOffline,
    levels,
  };
}
