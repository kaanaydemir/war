/**
 * Adaptive procedural score.
 *   baslik   — title: Hüseyni, kös heartbeat, ney theme over a deep dem, kanun.
 *   hazirlik — calm ney taksim over a soft drone (Rast/Hicaz/Uşşak/Hüseyni), ud & kanun answers.
 *   kusatma  — tension: low drones, distant davul in ağır düyek, sparse distant zurna.
 *   gece     — siege night: dark drone, a lonely distant ney.
 *   hucum    — full MEHTER: kös, davul, nakkare, zil, çevgen, boru and two zurnas
 *              playing an original march (peşrev form: hane + teslim) in Hicaz.
 *   yuruyus  — the army on the march: lighter mehter.
 *   zafer    — festive mehter in Rast.
 *   yenilgi  — Saba lament.
 *
 * Page-lifetime (lives with the engine), so it crossfades across scene restarts.
 * Scheduling runs on its own timer with a look-ahead (Web Audio clock accurate).
 */
import { engine } from './engine';
import { boru, cevgen, davul, drone, kos, nakkare, neyPhrase, pluck, zil, zurnaPhrase, type LegatoNote } from './instruments';
import { filt, rand, type Dest } from './synth';
import {
  MAKAMS,
  USULS,
  composeMarch,
  composePhrase,
  composeTaksim,
  degreeHz,
  makeRng,
  marchOrder,
  type MakamId,
  type March,
  type MarchSection,
  type Note,
} from './theory';

export type MusicMode = 'sessiz' | 'baslik' | 'hazirlik' | 'yuruyus' | 'kusatma' | 'gece' | 'hucum' | 'zafer' | 'yenilgi';

const LOOKAHEAD = 0.4;

abstract class Piece {
  out: GainNode;
  protected srcs: AudioScheduledSourceNode[] = [];
  protected next: number;
  protected D: Dest;
  dead = false;

  constructor(protected level: number, wet: number) {
    const ctx = engine.ctx!;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(engine.buses.music);
    const send = ctx.createGain();
    send.gain.value = wet;
    this.out.connect(send);
    send.connect(engine.hallIn);
    this.next = ctx.currentTime + 0.15;
    this.D = engine.dest(this.out, this.next, (s) => this.track(s))!;
  }

  private track(s: AudioScheduledSourceNode): void {
    this.srcs.push(s);
    if (this.srcs.length > 600) this.srcs.splice(0, 200);
  }

  protected at(t: number, out?: AudioNode): Dest {
    return { ...this.D, t, out: out ?? this.D.out };
  }

  fadeIn(sec: number): void {
    const t = engine.now();
    const g = this.out.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(this.level, t + sec);
  }

  fadeOut(sec: number): void {
    if (this.dead) return;
    this.dead = true;
    const t = engine.now();
    const g = this.out.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + sec);
    setTimeout(() => {
      const now = engine.now();
      for (const s of this.srcs) {
        try {
          s.stop(now);
        } catch {
          /* ignore */
        }
      }
      try {
        this.out.disconnect();
      } catch {
        /* ignore */
      }
    }, (sec + 0.2) * 1000);
  }

  setLevel(v: number, sec = 2): void {
    if (this.dead) return;
    this.level = v;
    this.fadeIn(sec);
  }

  /** Schedule everything that starts before `until`. */
  abstract schedule(until: number): void;
}

/** Legato note list for a taksim phrase at a given octave shift. */
function taksimNotes(mk: MakamId, notes: { deg: number; dur: number; glide: boolean }[], oct: number): LegatoNote[] {
  const m = MAKAMS[mk];
  return notes.map((n) => ({ f: degreeHz(m, n.deg, oct), dur: n.dur, glide: n.glide }));
}

// ───────────────────────────── Ambient pieces ─────────────────────────────

class TitlePiece extends Piece {
  private cycle = 0;
  constructor() {
    super(0.85, 0.55);
  }
  schedule(until: number): void {
    while (this.next < until) {
      const t = this.next;
      const mk = MAKAMS.huseyni;
      const len = 16;
      drone(this.at(t), t, degreeHz(mk, 0, -1), len + 3, 1.0, { attack: 3 });
      drone(this.at(t + 0.5), t + 0.5, degreeHz(mk, 4, -1), len + 2, 0.55, { attack: 4, bright: 0.8 });
      // Kös heartbeat & davul
      kos(this.at(t), t, 0.85);
      kos(this.at(t), t + 8, 0.7);
      for (const dt of [4, 4.45, 12, 12.45]) davul(this.at(t), t + dt, 'dum', 0.45);
      if (this.cycle % 2 === 1) zil(this.at(t), t + 8, 0.25, 3);
      // Kanun opening arpeggio
      if (this.cycle % 2 === 0) [0, 2, 4, 7, 9].forEach((d, i) => pluck(this.at(t), t + 0.6 + i * 0.16, degreeHz(mk, d), 0.6, 'kanun'));
      // Ney theme (fixed seed → recognisable), varied every third cycle
      const tk = composeTaksim(1453 + (this.cycle % 3), 'huseyni', 2, { lo: -1, hi: 7, pace: 1.15 });
      let nt = t + 2;
      for (const ph of tk) {
        if (nt > t + len - 1) break;
        neyPhrase(this.at(nt), taksimNotes('huseyni', ph.notes, 1), 0.95);
        nt += ph.notes.reduce((a, n) => a + n.dur, 0) + ph.rest;
      }
      this.cycle++;
      this.next += len;
    }
  }
}

class HazirlikPiece extends Piece {
  private cycle = 0;
  private seed = Math.floor(Math.random() * 1e6);
  constructor(private night = false) {
    super(night ? 0.55 : 0.75, 0.6);
  }
  schedule(until: number): void {
    while (this.next < until) {
      const t = this.next;
      const order: MakamId[] = this.night ? ['segah', 'hicaz', 'saba'] : ['rast', 'hicaz', 'ussak', 'huseyni'];
      const mkId = order[this.cycle % order.length];
      const mk = MAKAMS[mkId];
      const tk = composeTaksim(this.seed + this.cycle * 7, mkId, this.night ? 2 : 3, { pace: this.night ? 1.25 : 1 });
      let len = 0;
      for (const p of tk) len += p.notes.reduce((a, n) => a + n.dur, 0) + p.rest;
      len += this.night ? 9 : 4;
      drone(this.at(t), t, degreeHz(mk, 0, -1), len + 3, this.night ? 0.7 : 0.6, { attack: 4, bright: this.night ? 0.6 : 0.9 });
      let nt = t + 2.5;
      const rnd = makeRng(this.seed + this.cycle);
      for (const ph of tk) {
        const plen = ph.notes.reduce((a, n) => a + n.dur, 0);
        neyPhrase(this.at(nt), taksimNotes(mkId, ph.notes, 1), this.night ? 0.6 : 0.85);
        nt += plen;
        // Ud / kanun answer in the rest
        if (ph.rest > 1.4 && !this.night) {
          const last = ph.notes[ph.notes.length - 1].deg;
          const n = 3 + Math.floor(rnd() * 4);
          const kind = rnd() < 0.6 ? 'ud' : 'kanun';
          let d = last + 2;
          for (let i = 0; i < n; i++) {
            pluck(this.at(nt), nt + 0.2 + i * 0.22, degreeHz(mk, d, kind === 'ud' ? 0 : 1), 0.55, kind);
            d += rnd() < 0.7 ? -1 : 1;
          }
        }
        nt += ph.rest;
      }
      // Kanun tremolo shimmer on the durak at the end of some cycles
      if (!this.night && this.cycle % 2 === 1) for (let i = 0; i < 10; i++) pluck(this.at(nt), nt + i * 0.07, degreeHz(mk, 7), 0.25 + 0.03 * i, 'kanun');
      this.cycle++;
      this.next += len;
    }
  }
}

class SiegePiece extends Piece {
  private cycle = 0;
  private rnd = makeRng(Math.floor(Math.random() * 1e6));
  private distant: BiquadFilterNode;
  constructor(private night: boolean) {
    super(night ? 0.8 : 0.95, 0.7);
    this.distant = filt(this.D, 'lowpass', night ? 500 : 750, 0.6);
  }
  schedule(until: number): void {
    const usul = USULS.agirDuyek;
    const eighth = 60 / 64 / 2;
    while (this.next < until) {
      const t = this.next;
      const len = usul.eighths * eighth;
      const mkId: MakamId = this.cycle % 8 < 4 ? 'hicaz' : 'segah';
      const mk = MAKAMS[mkId];
      if (this.cycle % 2 === 0) {
        drone(this.at(t), t, degreeHz(mk, 0, -1), len * 2 + 3, 0.8, { attack: 3, bright: this.night ? 0.45 : 0.6 });
        drone(this.at(t + 1), t + 1, degreeHz(mk, mk.guclu, -1), len * 2 + 2, 0.32, { attack: 5, bright: 0.5 });
      }
      const far = this.at(t, this.distant);
      const drums = this.night ? this.rnd() < 0.25 : this.cycle % 5 !== 4;
      if (drums) for (const s of usul.strokes) davul(far, t + s.at * eighth, s.k, this.night ? 0.5 : 0.75);
      if (!this.night && this.cycle % 4 === 0) kos(far, t, 0.8);
      // Sparse distant zurna (day) / lonely ney (night)
      if (this.cycle % 3 === 2 && this.rnd() < 0.8) {
        if (this.night) {
          const tk = composeTaksim(Math.floor(this.rnd() * 1e6), mkId, 1, { pace: 1.3 });
          neyPhrase(this.at(t + 0.5), taksimNotes(mkId, tk[0].notes, 1), 0.45);
        } else {
          const ph = composePhrase(this.rnd, { lo: -1, hi: 6, start: mk.guclu, cadence: this.rnd() < 0.5 ? 0 : mk.guclu, measures: 2, ornament: 0.35 });
          zurnaPhrase(this.at(t, this.distant), phraseToLegato(mk.id, ph.notes, eighth, 1), 0.55, 0);
        }
      }
      this.cycle++;
      this.next += len;
    }
  }
}

class LamentPiece extends Piece {
  private cycle = 0;
  constructor() {
    super(0.8, 0.7);
  }
  schedule(until: number): void {
    while (this.next < until) {
      const t = this.next;
      const tk = composeTaksim(1453 + this.cycle, 'saba', 2, { pace: 1.3 });
      let len = 4;
      for (const p of tk) len += p.notes.reduce((a, n) => a + n.dur, 0) + p.rest;
      drone(this.at(t), t, degreeHz(MAKAMS.saba, 0, -1), len + 3, 0.8, { attack: 4, bright: 0.6 });
      kos(this.at(t), t + 0.5, 0.4);
      let nt = t + 2;
      for (const ph of tk) {
        neyPhrase(this.at(nt), taksimNotes('saba', ph.notes, 1), 0.85);
        nt += ph.notes.reduce((a, n) => a + n.dur, 0) + ph.rest;
      }
      this.cycle++;
      this.next += len;
    }
  }
}

// ───────────────────────────── Mehter ─────────────────────────────

function phraseToLegato(mk: MakamId, notes: Note[], eighth: number, oct: number): LegatoNote[] {
  const m = MAKAMS[mk];
  return notes.map((n) => ({
    f: degreeHz(m, n.deg, oct),
    fu: degreeHz(m, n.deg + 1, oct),
    fl: degreeHz(m, n.deg - 1, oct),
    dur: n.dur * eighth,
    orn: n.orn,
    acc: n.acc,
  }));
}

/** Second zurna: heterophony — splits some long notes, re-rolls ornaments. */
function heterophony(notes: LegatoNote[], eighth: number): LegatoNote[] {
  const out: LegatoNote[] = [];
  for (const n of notes) {
    if (n.dur >= eighth * 3.5 && Math.random() < 0.4) {
      const k = Math.round(n.dur / eighth);
      for (let i = 0; i < k; i++) out.push({ ...n, dur: eighth, orn: i === 0 ? 'ust' : 'none', acc: i === 0 ? 1 : 0.4 });
    } else {
      out.push({ ...n, orn: n.dur >= eighth * 2 && Math.random() < 0.3 ? (Math.random() < 0.5 ? 'ust' : 'alt') : n.orn });
    }
  }
  return out;
}

interface MehterOpts {
  makam: MakamId;
  bpm: number;
  seed: number;
  intensity: number;
  kos: boolean;
}

class MehterPiece extends Piece {
  private march: March;
  private order: MarchSection[];
  private sec = -1; // -1 = drum intro
  private e = 0;
  private loops = 0;
  private eighth: number;

  constructor(private o: MehterOpts) {
    super(0.85 * o.intensity + 0.1, 0.35);
    this.march = composeMarch(o.seed, o.makam, o.bpm);
    this.order = marchOrder(this.march);
    this.eighth = 60 / o.bpm / 2;
  }

  schedule(until: number): void {
    const usul = USULS.duyek;
    const E = this.eighth;
    const I = this.o.intensity;
    while (this.next < until) {
      const t = this.next;
      const section = this.sec < 0 ? null : this.order[this.sec];
      const len = section ? section.length : 16;
      const e = this.e;
      const m = e % 8;
      const D = this.at(t);
      if (e === 0) this.sectionStart(t, section);
      // Davul usul (two players, slight human offset)
      for (const s of usul.strokes) {
        if (s.at === m) {
          davul(D, t + rand(0, 0.008), s.k, 0.7 * I);
          if (I > 0.8) davul(D, t + 0.012 + rand(0, 0.01), s.k, 0.45 * I);
        }
      }
      // Kös on the downbeats
      if (this.o.kos && (m === 0 && (section?.kind === 'teslim' || (e / 8) % 2 === 0 || !section))) kos(D, t, 0.72 * I);
      // Intro: accelerating kös/davul roll into the march
      if (!section && e >= 8 && e % 2 === 0 && this.o.kos) kos(D, t, 0.5 + 0.06 * (e - 8));
      // Nakkare: running eighths, sixteenth rolls at phrase ends
      if (section || e >= 8) {
        const acc = m === 0 || m === 4 ? 1 : 0.55;
        nakkare(D, t, 0.6 * acc * I, m % 2 === 1);
        if (e % 16 >= 14) nakkare(D, t + E / 2, 0.4 * I, m % 2 === 0);
      }
      // Çevgen on the off-beats, zil every second measure
      if (section && (m === 2 || m === 6)) cevgen(D, t, 0.7 * I);
      if (section && m === 0 && (e / 8) % 2 === 1) zil(D, t, 0.35 * I, 1.1);
      this.e++;
      this.next += E;
      if (this.e >= len) {
        this.e = 0;
        this.sec++;
        if (this.sec >= this.order.length) {
          // New hanes each loop, same teslim (refrain stays memorable).
          this.loops++;
          const fresh = composeMarch(this.o.seed + this.loops * 101, this.o.makam, this.o.bpm);
          this.march = { ...fresh, teslim: this.march.teslim };
          this.order = marchOrder(this.march);
          this.sec = 0;
        }
      }
    }
  }

  private sectionStart(t: number, s: MarchSection | null): void {
    const D = this.at(t);
    const I = this.o.intensity;
    const mk = MAKAMS[this.o.makam];
    if (!s) {
      zil(D, t, 0.4 * I, 2);
      return;
    }
    zil(D, t, 0.75 * I, 2.2);
    zil(D, t + 0.015, 0.4 * I, 1.2);
    const E = this.eighth;
    // Boru announces each hane with the durak and güçlü
    if (s.kind === 'hane' && I > 0.6) {
      boru(D, t, degreeHz(mk, 0, 0), E * 6, 0.8 * I);
      boru(D, t + E * 8, degreeHz(mk, mk.guclu, 0), E * 6, 0.7 * I);
    }
    // Dem: a zurna holding the durak under the melody
    drone(D, t, degreeHz(mk, 0, 0), s.length * E, 0.35 * I, { attack: 0.4, bright: 1.6 });
    // Two zurnas
    const notes: LegatoNote[] = [];
    for (const ph of s.phrases) notes.push(...phraseToLegato(this.o.makam, ph.notes, E, 1));
    zurnaPhrase(this.at(t), notes, 0.95 * I, -4);
    zurnaPhrase(this.at(t + 0.012), heterophony(notes, E), 0.75 * I, 7);
  }
}

// ───────────────────────────── Player ─────────────────────────────

function createPiece(mode: MusicMode): Piece | null {
  switch (mode) {
    case 'baslik':
      return new TitlePiece();
    case 'hazirlik':
      return new HazirlikPiece(false);
    case 'kusatma':
      return new SiegePiece(false);
    case 'gece':
      return new SiegePiece(true);
    case 'hucum':
      return new MehterPiece({ makam: 'hicaz', bpm: 96, seed: 1453, intensity: 1, kos: true });
    case 'yuruyus':
      return new MehterPiece({ makam: 'hicaz', bpm: 84, seed: 323, intensity: 0.75, kos: false });
    case 'zafer':
      return new MehterPiece({ makam: 'rast', bpm: 104, seed: 2905, intensity: 1, kos: true });
    case 'yenilgi':
      return new LamentPiece();
    default:
      return null;
  }
}

export class MusicPlayer {
  mode: MusicMode = 'sessiz';
  private piece: Piece | null = null;
  private wanted: MusicMode = 'sessiz';
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    engine.onReady(() => this.start());
  }

  private start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), 70);
    this.apply(4);
  }

  /** Request a mode; crossfades over `fade` seconds. */
  setMode(m: MusicMode, fade = 3): void {
    if (m === this.wanted) return;
    this.wanted = m;
    if (engine.ready) this.apply(fade);
  }

  private apply(fade: number): void {
    if (this.wanted === this.mode && this.piece) return;
    try {
      this.piece?.fadeOut(fade);
      this.mode = this.wanted;
      this.piece = createPiece(this.mode);
      this.piece?.fadeIn(Math.max(0.5, fade * 0.8));
    } catch (err) {
      console.warn('[audio] music switch failed', err);
      this.piece = null;
    }
  }

  private tick(): void {
    const ctx = engine.ctx;
    if (!ctx || ctx.state !== 'running' || !this.piece) return;
    try {
      // Never fall behind (tab throttling): skip ahead instead of bursting.
      const now = ctx.currentTime;
      const p = this.piece as unknown as { next: number };
      if (p.next < now - 0.5) p.next = now + 0.05;
      this.piece.schedule(now + LOOKAHEAD);
    } catch (err) {
      console.warn('[audio] music schedule failed', err);
      this.piece = null;
    }
  }
}

/** Page-wide music player. */
export const music = new MusicPlayer();
