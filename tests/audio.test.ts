import { describe, expect, it } from 'vitest';
import { Bucket, REF_DIST, Throttle, VoiceLimiter, sliderGain, spatialize, type View } from '../src/features/audio/mix';
import {
  MAKAMS,
  USULS,
  composeMarch,
  composePhrase,
  composeTaksim,
  degreeHz,
  degreeKoma,
  makeRng,
  marchOrder,
  scaleKomas,
  taksimLength,
  type MakamId,
} from '../src/features/audio/theory';

describe('makam scales (53-koma)', () => {
  it('every makam spans exactly one octave (53 koma)', () => {
    for (const m of Object.values(MAKAMS)) {
      expect(m.steps.length).toBe(7);
      expect(m.steps.reduce((a, b) => a + b, 0)).toBe(53);
    }
  });

  it('Hicaz has the augmented second (12 koma) between segâh and nim hicaz', () => {
    expect(MAKAMS.hicaz.steps[1]).toBe(12);
    expect(scaleKomas(MAKAMS.hicaz)).toEqual([0, 5, 17, 22, 31, 39, 44, 53]);
  });

  it('Rast has a perfect fifth (31 koma) at the güçlü', () => {
    expect(degreeKoma(MAKAMS.rast, MAKAMS.rast.guclu)).toBe(31);
  });

  it('degrees wrap across octaves', () => {
    const m = MAKAMS.ussak;
    expect(degreeKoma(m, 7)).toBe(53);
    expect(degreeKoma(m, -7)).toBe(-53);
    expect(degreeHz(m, 7)).toBeCloseTo(m.durakHz * 2, 6);
    expect(degreeHz(m, 0, -1)).toBeCloseTo(m.durakHz / 2, 6);
    expect(degreeHz(m, 3)).toBeGreaterThan(degreeHz(m, 2));
  });

  it('a 22-koma fourth is close to a just 4/3', () => {
    expect(Math.pow(2, 22 / 53)).toBeCloseTo(4 / 3, 2);
  });
});

describe('usul', () => {
  it('strokes fit inside their cycle', () => {
    for (const u of Object.values(USULS)) {
      for (const s of u.strokes) {
        expect(s.at).toBeGreaterThanOrEqual(0);
        expect(s.at).toBeLessThan(u.eighths);
      }
      expect(u.strokes[0]).toEqual({ at: 0, k: 'dum' });
    }
  });
});

describe('melody generator', () => {
  it('is deterministic for a seed', () => {
    const a = composeMarch(1453, 'hicaz');
    const b = composeMarch(1453, 'hicaz');
    const c = composeMarch(1454, 'hicaz');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
  });

  it('phrases fill their measures exactly and end on the cadence', () => {
    for (let seed = 1; seed < 60; seed++) {
      const rnd = makeRng(seed);
      const p = composePhrase(rnd, { lo: -2, hi: 6, start: 3, cadence: 0, measures: 2 });
      const total = p.notes.reduce((a, n) => a + n.dur, 0);
      expect(total).toBe(16);
      expect(p.length).toBe(16);
      expect(p.notes[p.notes.length - 1].deg).toBe(0);
      // contiguous timeline
      let at = 0;
      for (const n of p.notes) {
        expect(n.at).toBe(at);
        at += n.dur;
        expect(n.deg).toBeGreaterThanOrEqual(-2);
        expect(n.deg).toBeLessThanOrEqual(6);
      }
      // the karar is approached by step
      const k = p.notes.slice(-2).map((n) => n.deg);
      expect(Math.abs(k[1] - k[0])).toBeLessThanOrEqual(2);
    }
  });

  it('march follows peşrev form: hane/teslim alternation, teslim closes on the durak', () => {
    const ids: MakamId[] = ['hicaz', 'rast', 'ussak'];
    for (const id of ids) {
      const m = composeMarch(29, id);
      const order = marchOrder(m);
      expect(order.length).toBe(m.hanes.length * 2);
      order.forEach((s, i) => expect(s.kind).toBe(i % 2 === 0 ? 'hane' : 'teslim'));
      const last = m.teslim.phrases[m.teslim.phrases.length - 1];
      expect(last.notes[last.notes.length - 1].deg).toBe(0);
      // every section is a whole number of düyek cycles
      for (const s of order) expect(s.length % USULS.duyek.eighths).toBe(0);
      // the miyan (second hane) climbs higher than the first
      const max = (s: (typeof m.hanes)[number]) => Math.max(...s.phrases.flatMap((p) => p.notes.map((n) => n.deg)));
      expect(max(m.hanes[1])).toBeGreaterThan(max(m.hanes[0]));
    }
  });

  it('taksim ends on the durak and has positive length', () => {
    for (const id of Object.keys(MAKAMS) as MakamId[]) {
      const t = composeTaksim(7, id, 4);
      expect(t.length).toBe(4);
      const last = t[t.length - 1].notes;
      expect(last[last.length - 1].deg).toBe(0);
      expect(taksimLength(t)).toBeGreaterThan(5);
      for (const p of t) for (const n of p.notes) expect(n.dur).toBeGreaterThan(0);
    }
  });
});

describe('voice limiter', () => {
  it('accepts until full, then steals the lowest priority', () => {
    const l = new VoiceLimiter(3);
    const a = l.acquire(1, 0, 5)!;
    const b = l.acquire(5, 0.1, 5)!;
    const c = l.acquire(3, 0.2, 5)!;
    expect(l.active(0.3)).toBe(3);
    const d = l.acquire(4, 0.3, 5)!;
    expect(d.steal).toEqual([a.id]);
    expect(l.active(0.4)).toBe(3);
    // a lower-priority newcomer is rejected when everything is more important
    expect(l.acquire(2, 0.5, 5)).toBeNull();
    // equal priority steals the oldest of that priority
    const e = l.acquire(3, 0.6, 5)!;
    expect(e.steal).toEqual([c.id]);
    void b;
  });

  it('frees voices when they end', () => {
    const l = new VoiceLimiter(2);
    l.acquire(1, 0, 1);
    l.acquire(1, 0, 1);
    expect(l.acquire(0, 0.5, 1)).toBeNull();
    const g = l.acquire(0, 1.5, 1);
    expect(g).not.toBeNull();
    expect(g!.steal).toEqual([]);
  });

  it('release removes a voice', () => {
    const l = new VoiceLimiter(1);
    const a = l.acquire(5, 0, 10)!;
    l.release(a.id);
    expect(l.acquire(0, 0.1, 1)!.steal).toEqual([]);
  });
});

describe('throttles', () => {
  it('Throttle enforces a minimum gap per key', () => {
    const t = new Throttle();
    expect(t.allow('a', 0, 1)).toBe(true);
    expect(t.allow('a', 0.5, 1)).toBe(false);
    expect(t.allow('b', 0.5, 1)).toBe(true);
    expect(t.allow('a', 1.01, 1)).toBe(true);
  });

  it('Bucket lets a burst through then thins a barrage', () => {
    const b = new Bucket(3, 1);
    expect([b.take(0), b.take(0), b.take(0), b.take(0)]).toEqual([true, true, true, false]);
    expect(b.take(0.5)).toBe(false);
    expect(b.take(1.1)).toBe(true);
  });
});

describe('spatial attenuation', () => {
  const view = (zoom: number): View => {
    const w = 1920 / zoom;
    const h = 1080 / zoom;
    return { x: 5000 - w / 2, y: 3000 - h / 2, w, h, zoom };
  };

  it('is loudest at the centre and decreases monotonically with distance', () => {
    const v = view(2);
    let prev = Infinity;
    for (let d = 0; d <= 6000; d += 250) {
      const s = spatialize(5000 + d, 3000, v);
      expect(s.gain).toBeLessThanOrEqual(prev + 1e-9);
      expect(s.gain).toBeGreaterThanOrEqual(0);
      expect(s.gain).toBeLessThanOrEqual(1);
      prev = s.gain;
    }
    expect(spatialize(5000, 3000, v).gain).toBeGreaterThan(0.6);
  });

  it('pans left/right with screen position', () => {
    const v = view(3);
    expect(spatialize(5000 - 300, 3000, v).pan).toBeLessThan(-0.3);
    expect(spatialize(5000 + 300, 3000, v).pan).toBeGreaterThan(0.3);
    expect(Math.abs(spatialize(5000, 3000, v).pan)).toBeLessThan(1e-9);
    expect(Math.abs(spatialize(5000 + 1e6, 3000, v).pan)).toBeLessThanOrEqual(0.92);
  });

  it('zooming in brings the action closer', () => {
    const near = spatialize(5000, 3000, view(4));
    const far = spatialize(5000, 3000, view(1));
    expect(near.gain).toBeGreaterThan(far.gain);
    expect(near.far).toBeLessThan(far.far);
    expect(near.cutoff).toBeGreaterThan(far.cutoff);
  });

  it('distant sounds are darker, wetter and later; big guns carry further', () => {
    const v = view(3);
    const close = spatialize(5000, 3000, v);
    const distant = spatialize(5000 + 5000, 3000 + 2000, v);
    expect(distant.onScreen).toBe(false);
    expect(close.onScreen).toBe(true);
    expect(distant.cutoff).toBeLessThan(close.cutoff);
    expect(distant.wet).toBeGreaterThan(close.wet);
    expect(distant.delay).toBeGreaterThan(close.delay);
    const sahi = spatialize(5000 + 5000, 3000 + 2000, v, 5);
    expect(sahi.gain).toBeGreaterThan(distant.gain * 2);
    expect(sahi.gain).toBeGreaterThan(0.1);
  });

  it('reference distance is sane and slider curve is perceptual', () => {
    expect(REF_DIST).toBeGreaterThan(100);
    expect(sliderGain(0)).toBe(0);
    expect(sliderGain(1)).toBe(1);
    expect(sliderGain(0.5)).toBeCloseTo(0.25);
    expect(sliderGain(2)).toBe(1);
  });
});
