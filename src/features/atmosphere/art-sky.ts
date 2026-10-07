import { hex, P } from '../../art/palette';
import { bayer, type PixelCanvas } from '../../art/pixel';
import type { TextureGen } from '../../art/texture';
import { hash2 } from '../../core/rng';

/** Procedural pixel art for sky life, weather and the floating-text font. Phaser-free. */

const c = (s: string) => hex(s);

// ───────────────────────────── Birds ─────────────────────────────

export const BIRD_FRAMES = 6;
/** Wing-tip vertical offset per flap frame (negative = up). Frame 2 doubles as the glide pose. */
const FLAP_TIP = [-4, -2, 0, 2, 3, 1];
const FLAP_ELBOW = [-2, -1, -2, 0, 1, 1];

interface BirdStyle {
  w: number;
  h: number;
  span: number;
  wing: number;
  wingLit: number;
  wingShade: number;
  tip: number;
  body: number;
  bodyShade: number;
  beak: number | null;
  tipLen: number;
}

/** Bird glyph facing RIGHT (flip for left): bent "M" wings with lit leading edges. */
function drawBird(p: PixelCanvas, st: BirdStyle, frame: number): void {
  const cx = Math.floor(st.w / 2);
  const cy = Math.floor(st.h / 2) + (FLAP_TIP[frame] < 0 ? 1 : 0);
  const tipY = FLAP_TIP[frame];
  const elbY = FLAP_ELBOW[frame];
  for (const side of [-1, 1]) {
    // shoulder → elbow → tip polyline, 1px thick plus a shade row under the inner wing
    const pts: [number, number][] = [
      [cx + side * 1, cy],
      [cx + side * Math.round(st.span * 0.45), cy + elbY],
      [cx + side * st.span, cy + tipY],
    ];
    for (let s = 0; s < 2; s++) {
      const [x0, y0] = pts[s];
      const [x1, y1] = pts[s + 1];
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let i = 0; i <= n; i++) {
        const x = Math.round(x0 + ((x1 - x0) * i) / n);
        const y = Math.round(y0 + ((y1 - y0) * i) / n);
        const fromTip = Math.abs(x - (cx + side * st.span));
        const col = fromTip < st.tipLen ? st.tip : side < 0 ? st.wingLit : st.wing;
        p.set(x, y, col);
        // wing thickness near the body (inner wing)
        if (s === 0 && st.wingShade >= 0) p.set(x, y + 1, st.wingShade);
      }
    }
  }
  // body: 3px with a lit top-left and the head toward +x
  p.set(cx - 1, cy, st.body);
  p.set(cx, cy, st.body);
  p.set(cx + 1, cy, st.body);
  p.set(cx, cy + 1, st.bodyShade);
  p.set(cx - 1, cy + 1, st.bodyShade);
  p.set(cx + 2, cy, st.body);
  if (st.beak != null) p.set(cx + 3, cy, st.beak);
  p.set(cx - 2, cy + 1, st.bodyShade); // tail
}

function drawBat(p: PixelCanvas, frame: number): void {
  const body = c(P.outline[2]);
  const wing = c(P.purple[1]);
  const edge = c(P.purple[2]);
  const cx = 4;
  const cy = 2;
  const up = [-2, 0, 1, 0][frame];
  for (const s of [-1, 1]) {
    for (let i = 1; i <= 4; i++) {
      const y = cy + Math.round((up * i) / 4);
      p.set(cx + s * i, y, i === 4 ? edge : wing);
      if (i < 4 && frame !== 0) p.set(cx + s * i, y + 1, wing);
    }
    // scalloped trailing edge
    if (frame === 2) p.set(cx + s * 3, cy + 2, wing);
  }
  p.set(cx, cy, body);
  p.set(cx, cy + 1, body);
  p.set(cx - 1, cy - 1, body); // ears
  p.set(cx + 1, cy - 1, body);
}

// ───────────────────────────── Weather ─────────────────────────────

export const RAIN_SLANTS = [-3, -2, -1, 0, 1, 2, 3];

function drawCloudShadow(p: PixelCanvas, seed: number): void {
  const w = p.w;
  const h = p.h;
  const blobs: [number, number, number][] = [];
  const n = 6 + Math.floor(hash2(seed, 1, 9) * 4);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    blobs.push([
      w * (0.15 + 0.7 * t) + (hash2(i, seed, 2) - 0.5) * w * 0.12,
      h * 0.5 + (hash2(i, seed, 3) - 0.5) * h * 0.35,
      (0.16 + hash2(i, seed, 4) * 0.14) * w * (1 - Math.abs(t - 0.5) * 0.9),
    ]);
  }
  const col = c(P.night[0]);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let best = 0;
      for (const [bx, by, br] of blobs) {
        const dx = (x - bx) / br;
        const dy = ((y - by) * 2) / br; // iso-flattened 2:1
        const v = 1 - Math.sqrt(dx * dx + dy * dy);
        if (v > best) best = v;
      }
      if (best <= 0) continue;
      const dens = Math.min(1, best * 3.2);
      if (bayer(x, y) > dens) continue;
      p.set(x, y, col);
    }
}

function fbm(x: number, y: number, seed: number): number {
  let v = 0;
  let a = 0.5;
  let f = 1;
  for (let o = 0; o < 4; o++) {
    const xi = Math.floor(x * f);
    const yi = Math.floor(y * f);
    const fx = x * f - xi;
    const fy = y * f - yi;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const h00 = hash2(xi, yi, seed + o);
    const h10 = hash2(xi + 1, yi, seed + o);
    const h01 = hash2(xi, yi + 1, seed + o);
    const h11 = hash2(xi + 1, yi + 1, seed + o);
    v += a * (h00 + (h10 - h00) * sx + (h01 - h00) * sy + (h00 - h10 - h01 + h11) * sx * sy);
    a *= 0.5;
    f *= 2;
  }
  return v;
}

function drawFog(p: PixelCanvas, seed: number): void {
  // soft banded fog: per-pixel alpha quantized to 5 levels, dithered only between levels
  const w = p.w;
  const h = p.h;
  const lit = c(P.cloth[5]);
  const mid = c(P.cloth[4]);
  const levels = 5;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = (x - w / 2) / (w / 2);
      const dy = (y - h / 2) / (h / 2);
      const env = Math.max(0, 1 - Math.sqrt(dx * dx * 0.85 + dy * dy * 1.2));
      const n = fbm(x / 34, y / 15, seed);
      const dens = Math.min(1, Math.pow(env, 0.8) * (n * 1.7 - 0.25));
      if (dens <= 0.02) continue;
      const q = dens * levels;
      const b = Math.floor(q);
      const lvl = Math.min(levels, b + (bayer(x, y) < q - b ? 1 : 0));
      if (lvl <= 0) continue;
      p.set(x, y, dy < -0.15 && n > 0.55 ? lit : mid, (lvl / levels) * 0.85);
    }
}

// ───────────────────────────── Font ─────────────────────────────

interface Glyph {
  rows: string[];
  top?: string;
  bottom?: string;
}

const G: Record<string, Glyph> = {
  '0': { rows: ['.##.', '#..#', '#..#', '#..#', '.##.'] },
  '1': { rows: ['.#.', '##.', '.#.', '.#.', '###'] },
  '2': { rows: ['###.', '...#', '.##.', '#...', '####'] },
  '3': { rows: ['###.', '...#', '.##.', '...#', '###.'] },
  '4': { rows: ['#..#', '#..#', '####', '...#', '...#'] },
  '5': { rows: ['####', '#...', '###.', '...#', '###.'] },
  '6': { rows: ['.##.', '#...', '###.', '#..#', '.##.'] },
  '7': { rows: ['####', '...#', '..#.', '.#..', '.#..'] },
  '8': { rows: ['.##.', '#..#', '.##.', '#..#', '.##.'] },
  '9': { rows: ['.##.', '#..#', '.###', '...#', '.##.'] },
  '+': { rows: ['...', '.#.', '###', '.#.', '...'] },
  '-': { rows: ['...', '...', '###', '...', '...'] },
  '%': { rows: ['#..#', '..#.', '.#..', '#..#', '....'] },
  '!': { rows: ['#', '#', '#', '.', '#'] },
  '?': { rows: ['###', '..#', '.##', '...', '.#.'] },
  '.': { rows: ['.', '.', '.', '.', '#'] },
  ',': { rows: ['.', '.', '.', '#', '#'] },
  ':': { rows: ['.', '#', '.', '#', '.'] },
  '/': { rows: ['...#', '..#.', '.#..', '#...', '....'] },
  "'": { rows: ['#', '#', '.', '.', '.'] },
  '×': { rows: ['...', '#.#', '.#.', '#.#', '...'] },
  ' ': { rows: ['..', '..', '..', '..', '..'] },
  A: { rows: ['.##.', '#..#', '####', '#..#', '#..#'] },
  B: { rows: ['###.', '#..#', '###.', '#..#', '###.'] },
  C: { rows: ['.###', '#...', '#...', '#...', '.###'] },
  Ç: { rows: ['.###', '#...', '#...', '#...', '.###'], bottom: '..#.' },
  D: { rows: ['###.', '#..#', '#..#', '#..#', '###.'] },
  E: { rows: ['####', '#...', '###.', '#...', '####'] },
  F: { rows: ['####', '#...', '###.', '#...', '#...'] },
  G: { rows: ['.###', '#...', '#.##', '#..#', '.###'] },
  Ğ: { rows: ['.###', '#...', '#.##', '#..#', '.###'], top: '.##.' },
  H: { rows: ['#..#', '#..#', '####', '#..#', '#..#'] },
  I: { rows: ['###', '.#.', '.#.', '.#.', '###'] },
  İ: { rows: ['###', '.#.', '.#.', '.#.', '###'], top: '.#.' },
  J: { rows: ['...#', '...#', '...#', '#..#', '.##.'] },
  K: { rows: ['#..#', '#.#.', '##..', '#.#.', '#..#'] },
  L: { rows: ['#...', '#...', '#...', '#...', '####'] },
  M: { rows: ['#...#', '##.##', '#.#.#', '#...#', '#...#'] },
  N: { rows: ['#..#', '##.#', '#.##', '#..#', '#..#'] },
  O: { rows: ['.##.', '#..#', '#..#', '#..#', '.##.'] },
  Ö: { rows: ['.##.', '#..#', '#..#', '#..#', '.##.'], top: '#..#' },
  P: { rows: ['###.', '#..#', '###.', '#...', '#...'] },
  Q: { rows: ['.##.', '#..#', '#..#', '#.#.', '.#.#'] },
  R: { rows: ['###.', '#..#', '###.', '#.#.', '#..#'] },
  S: { rows: ['.###', '#...', '.##.', '...#', '###.'] },
  Ş: { rows: ['.###', '#...', '.##.', '...#', '###.'], bottom: '.#..' },
  T: { rows: ['###', '.#.', '.#.', '.#.', '.#.'] },
  U: { rows: ['#..#', '#..#', '#..#', '#..#', '.##.'] },
  Ü: { rows: ['#..#', '#..#', '#..#', '#..#', '.##.'], top: '#..#' },
  V: { rows: ['#...#', '#...#', '.#.#.', '.#.#.', '..#..'] },
  W: { rows: ['#...#', '#...#', '#.#.#', '##.##', '#...#'] },
  X: { rows: ['#..#', '#..#', '.##.', '#..#', '#..#'] },
  Y: { rows: ['#.#', '#.#', '.#.', '.#.', '.#.'] },
  Z: { rows: ['####', '...#', '.##.', '#...', '####'] },
};

export const FONT_CHARS = Object.keys(G);
/** Cell: 1px outline + 1 diacritic row + 5 glyph rows + 1 cedilla row + 1px outline. */
export const FONT_CELL_W = 7;
export const FONT_CELL_H = 9;
/** Index of each char in the 'fx/font' sheet and its advance width (px, without spacing). */
export const FONT_INDEX: Record<string, number> = {};
export const FONT_ADV: Record<string, number> = {};
FONT_CHARS.forEach((ch, i) => {
  FONT_INDEX[ch] = i;
  FONT_ADV[ch] = G[ch].rows[0].length;
});

function drawGlyph(p: PixelCanvas, g: Glyph): void {
  const hi = c(P.cloth[5]);
  const mid = c(P.cloth[4]);
  const lo = c(P.cloth[3]);
  const put = (row: string, y: number, col: number) => {
    for (let x = 0; x < row.length; x++) if (row[x] === '#') p.set(1 + x, y, col);
  };
  if (g.top) put(g.top, 1, hi);
  g.rows.forEach((r, i) => put(r, 2 + i, i < 2 ? hi : i < 4 ? mid : lo));
  if (g.bottom) put(g.bottom, 7, lo);
  p.outline(c(P.outline[0]), true);
}

// ───────────────────────────── Registration ─────────────────────────────

export function generateSkyTextures(gen: TextureGen): void {
  const gull: BirdStyle = {
    w: 17,
    h: 11,
    span: 7,
    wing: c(P.cloth[4]),
    wingLit: c(P.cloth[5]),
    wingShade: c(P.cloth[2]),
    tip: c(P.outline[2]),
    body: c(P.cloth[5]),
    bodyShade: c(P.cloth[3]),
    beak: c(P.gold[5]),
    tipLen: 2,
  };
  const crow: BirdStyle = {
    w: 15,
    h: 11,
    span: 6,
    wing: c(P.outline[2]),
    wingLit: c(P.night[1]),
    wingShade: c(P.outline[0]),
    tip: c(P.outline[0]),
    body: c(P.outline[2]),
    bodyShade: c(P.outline[0]),
    beak: c(P.steel[1]),
    tipLen: 1,
  };
  const dove: BirdStyle = {
    w: 13,
    h: 11,
    span: 5,
    wing: c(P.steel[5]),
    wingLit: c(P.cloth[5]),
    wingShade: c(P.steel[3]),
    tip: c(P.steel[3]),
    body: c(P.cloth[4]),
    bodyShade: c(P.steel[4]),
    beak: null,
    tipLen: 1,
  };
  gen.sheet('fx/marti', gull.w, gull.h, BIRD_FRAMES, (p, f) => drawBird(p, gull, f));
  gen.sheet('fx/karga', crow.w, crow.h, BIRD_FRAMES, (p, f) => drawBird(p, crow, f));
  gen.sheet('fx/guvercin', dove.w, dove.h, BIRD_FRAMES, (p, f) => drawBird(p, dove, f));
  gen.sheet('fx/yarasa', 9, 6, 4, (p, f) => drawBat(p, f));
  gen.sheet('fx/bird-shadow', 7, 3, 2, (p, f) => {
    const col = c(P.outline[0]);
    if (f === 0) {
      for (let x = 1; x < 6; x++) p.set(x, 1, col);
      p.set(3, 0, col);
    } else {
      for (let x = 2; x < 5; x++) p.set(x, 1, col);
    }
  });

  // water glints (twinkle sequence), fireflies, motes, leaves
  gen.sheet('fx/glint', 5, 5, 5, (p, f) => {
    const w = 0xffffff;
    const L = [0, 1, 2, 1, 0][f];
    p.set(2, 2, w);
    for (let k = 1; k <= L; k++) {
      p.set(2 + k, 2, w, k === L ? 0.6 : 1);
      p.set(2 - k, 2, w, k === L ? 0.6 : 1);
      if (k < 2) {
        p.set(2, 2 + k, w, 0.8);
        p.set(2, 2 - k, w, 0.8);
      }
    }
  });
  gen.sheet('fx/firefly', 3, 3, 2, (p, f) => {
    p.set(1, 1, c(P.gold[6]));
    if (f === 0) {
      p.set(0, 1, c(P.green[5]));
      p.set(2, 1, c(P.green[5]));
      p.set(1, 0, c(P.green[5]));
      p.set(1, 2, c(P.green[5]));
    }
  });
  gen.sheet('fx/yaprak', 4, 4, 4, (p, f) => {
    const a = c(P.cloth[5]);
    const b = c(P.cloth[3]);
    const shapes = [
      [[0, 1], [1, 1], [2, 1], [1, 2], [3, 1]],
      [[1, 0], [1, 1], [2, 2], [2, 3]],
      [[1, 1], [2, 1], [1, 2], [2, 2]],
      [[2, 0], [2, 1], [1, 2], [1, 3]],
    ][f];
    shapes.forEach(([x, y], i) => p.set(x, y, i === 0 ? a : b));
  });

  // weather
  gen.sheet('fx/rain', 7, 9, RAIN_SLANTS.length, (p, f) => {
    // streak: faint tail on top, bright head at the bottom (motion read)
    const s = RAIN_SLANTS[f];
    const x0 = 3 - Math.round(s / 2);
    const n = 7;
    for (let i = 0; i < n; i++) {
      const x = Math.round(x0 + (s * i) / (n - 1));
      const col = i < 2 ? c(P.snow[0]) : i < 5 ? c(P.snow[1]) : c(P.snow[3]);
      p.set(x, i + 1, col, i < 2 ? 0.55 : 1);
    }
  });
  gen.sheet('fx/rain-splash', 5, 3, 3, (p, f) => {
    const col = c(P.snow[2]);
    if (f === 0) {
      p.set(2, 1, col);
      p.set(1, 2, col);
      p.set(3, 2, col);
    } else if (f === 1) {
      p.set(1, 1, col);
      p.set(3, 1, col);
      p.set(0, 2, col);
      p.set(4, 2, col);
    } else {
      p.set(0, 1, col, 0.6);
      p.set(4, 1, col, 0.6);
    }
  });
  gen.sheet('fx/hail', 3, 3, 2, (p, f) => {
    if (f === 0) {
      p.set(0, 0, c(P.snow[4]));
      p.set(1, 0, c(P.snow[3]));
      p.set(0, 1, c(P.snow[3]));
      p.set(1, 1, c(P.snow[1]));
    } else p.set(1, 1, c(P.snow[3]));
  });
  gen.sheet('fx/snow', 3, 3, 4, (p, f) => {
    const w = c(P.snow[4]);
    const s = c(P.snow[2]);
    if (f === 0) p.set(1, 1, w);
    else if (f === 1) {
      p.set(1, 1, w);
      p.set(2, 1, s);
      p.set(1, 2, s);
    } else if (f === 2) {
      p.set(1, 1, w);
      p.set(0, 1, s);
      p.set(2, 1, s);
      p.set(1, 0, s);
      p.set(1, 2, s);
    } else {
      p.set(1, 1, w);
      p.set(0, 0, s);
      p.set(2, 2, s);
      p.set(2, 0, s);
      p.set(0, 2, s);
    }
  });
  for (let i = 0; i < 3; i++) gen.canvas(`fx/cloud-${i}`, 240, 120, (p) => drawCloudShadow(p, 101 + i * 17));
  for (let i = 0; i < 3; i++) gen.canvas(`fx/fog-${i}`, 200, 76, (p) => drawFog(p, 55 + i * 23));
  // screen-sized flash / lightning tint unit
  gen.canvas('fx/white', 4, 4, (p) => p.rect(0, 0, 4, 4, 0xffffff));

  // float-text font
  gen.sheet('fx/font', FONT_CELL_W, FONT_CELL_H, FONT_CHARS.length, (p, f) => drawGlyph(p, G[FONT_CHARS[f]]));
}
