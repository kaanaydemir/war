/**
 * Pure mixing logic: voice limiting, throttling and spatial attenuation.
 * No WebAudio here — unit-tested in tests/audio.test.ts.
 */

// ───────────────────────────── Voice limiter ─────────────────────────────

export interface VoiceSlot {
  id: number;
  priority: number;
  start: number;
  end: number;
}

export interface Grant {
  id: number;
  /** Voices that must be faded out to make room. */
  steal: number[];
}

/**
 * Caps simultaneous one-shot voices. When full, a new voice steals the
 * lowest-priority (then oldest) running voice — but only if that voice's
 * priority is not higher than the newcomer's. Otherwise the new sound is dropped.
 */
export class VoiceLimiter {
  private slots: VoiceSlot[] = [];
  private seq = 0;

  constructor(public max: number) {}

  private prune(now: number): void {
    let w = 0;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (s.end > now) this.slots[w++] = s;
    }
    this.slots.length = w;
  }

  acquire(priority: number, now: number, duration: number): Grant | null {
    this.prune(now);
    const steal: number[] = [];
    if (this.slots.length >= this.max) {
      let vi = -1;
      for (let i = 0; i < this.slots.length; i++) {
        const s = this.slots[i];
        if (vi < 0) {
          vi = i;
          continue;
        }
        const v = this.slots[vi];
        if (s.priority < v.priority || (s.priority === v.priority && s.start < v.start)) vi = i;
      }
      const victim = this.slots[vi];
      if (!victim || victim.priority > priority) return null;
      steal.push(victim.id);
      this.slots.splice(vi, 1);
    }
    const id = ++this.seq;
    this.slots.push({ id, priority, start: now, end: now + Math.max(0.01, duration) });
    return { id, steal };
  }

  release(id: number): void {
    const i = this.slots.findIndex((s) => s.id === id);
    if (i >= 0) this.slots.splice(i, 1);
  }

  active(now: number): number {
    this.prune(now);
    return this.slots.length;
  }
}

// ───────────────────────────── Throttle ─────────────────────────────

/** Per-key minimum interval between repeats (seconds). */
export class Throttle {
  private last = new Map<string, number>();

  allow(key: string, now: number, minGap: number): boolean {
    const t = this.last.get(key);
    if (t !== undefined && now - t < minGap) return false;
    this.last.set(key, now);
    return true;
  }

  reset(): void {
    this.last.clear();
  }
}

/**
 * Leaky-bucket rate limiter: at most `burst` events, refilling `rate` per second.
 * Lets a volley of 6 shots through, then thins a sustained barrage.
 */
export class Bucket {
  private level: number;
  private t = -Infinity;

  constructor(public burst: number, public rate: number) {
    this.level = burst;
  }

  take(now: number, cost = 1): boolean {
    if (this.t !== -Infinity) this.level = Math.min(this.burst, this.level + (now - this.t) * this.rate);
    this.t = now;
    if (this.level < cost) return false;
    this.level -= cost;
    return true;
  }
}

// ───────────────────────────── Spatial ─────────────────────────────

export interface View {
  /** World-pixel rect of the camera (camera.worldView). */
  x: number;
  y: number;
  w: number;
  h: number;
  zoom: number;
}

export interface Spatial {
  /** Linear gain 0..1. */
  gain: number;
  /** Stereo pan -1..1. */
  pan: number;
  /** 0 = right here … 1 = very far (drives lowpass, reverb, layer choice). */
  far: number;
  /** Lowpass cutoff (Hz) — air absorption. */
  cutoff: number;
  /** Reverb send 0..1. */
  wet: number;
  /** Sound-travel delay (s) for distant events. */
  delay: number;
  onScreen: boolean;
}

export const REF_DIST = 420;

/**
 * Attenuate & pan a world-pixel position relative to the camera.
 * The listener hovers above the view centre; its altitude grows with the view
 * size, so zooming in brings the battlefield closer (louder, brighter) and
 * zooming out pushes everything into a distant, lowpassed panorama.
 * `range` > 1 lets huge sounds (Şahi) carry much further.
 */
export function spatialize(wx: number, wy: number, v: View, range = 1): Spatial {
  const halfW = Math.max(1, v.w / 2);
  const halfH = Math.max(1, v.h / 2);
  const cx = v.x + halfW;
  const cy = v.y + halfH;
  const dx = wx - cx;
  const dy = wy - cy;
  const nx = dx / halfW;
  const ny = dy / halfH;
  const onScreen = Math.abs(nx) <= 1.05 && Math.abs(ny) <= 1.05;
  const dWorld = Math.hypot(dx, dy * 1.4);
  const altitude = 140 + halfW * 0.45;
  const eff = Math.hypot(dWorld, altitude);
  const r = Math.max(0.2, range);
  let gain = 1 / (1 + Math.max(0, eff - REF_DIST * 0.6) / (REF_DIST * r));
  // Off-screen sounds lose presence quickly (but loud ones still carry).
  const out = Math.min(2, Math.max(0, Math.hypot(nx, ny) - 1.2));
  gain /= 1 + out * (0.7 / Math.sqrt(r));
  gain = Math.max(0, Math.min(1, gain));
  const far = Math.max(0, Math.min(1, Math.log2(eff / (REF_DIST * 0.8)) / (3.2 + Math.log2(r) * 0.6)));
  const pan = Math.max(-0.92, Math.min(0.92, nx * 0.7 * (1 - far * 0.4)));
  const cutoff = Math.max(220, 17000 * Math.pow(2, -far * 6));
  const wet = 0.12 + 0.55 * far;
  const delay = Math.max(0, Math.min(0.9, (dWorld - halfW * 1.1) / 3200));
  return { gain, pan, far, cutoff, wet, delay, onScreen };
}

/** Perceptual volume curve for 0..1 sliders. */
export function sliderGain(v: number): number {
  const x = Math.max(0, Math.min(1, v));
  return x * x;
}

/** Smoothstep crossfade weight helper (pure). */
export function smooth01(x: number): number {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
}
