/**
 * HUD PIXEL ART — every UI ornament and icon is drawn here with PixelCanvas
 * from the master palette, then turned into data URLs for CSS
 * (border-image / background, always `image-rendering: pixelated` at integer
 * multiples of the UI pixel `--px`).
 *
 * Visual identity: Ottoman miniature page — parchment, gold rules (cetvel),
 * lapis & turquoise, red seals, tezhip corner ornaments, tent-valance (saçak).
 * Light from the upper-left, like the map art.
 *
 * Drawing code is pure (works in node for tests); only the *Url() helpers touch the DOM.
 */
import { P } from '../../art/palette';
import { bayer, PixelCanvas } from '../../art/pixel';

// ───────────────────────────── String-art legend ─────────────────────────────

/** One char → one palette color ('.' and ' ' = transparent). */
export const LEGEND: Record<string, string> = {
  k: P.outline[1],
  K: P.outline[0],
  // gold
  '0': P.gold[1],
  y: P.gold[2],
  Y: P.gold[3],
  g: P.gold[4],
  G: P.gold[5],
  w: P.gold[6],
  // steel / silver
  s: P.steel[2],
  S: P.steel[3],
  t: P.steel[4],
  T: P.steel[5],
  W: P.steel[6],
  // stone
  a: P.stone[2],
  b: P.stone[3],
  c: P.stone[4],
  d: P.stone[5],
  e: P.stone[6],
  E: P.stone[7],
  // wood
  o: P.wood[1],
  p: P.wood[2],
  q: P.wood[3],
  r: P.wood[4],
  u: P.wood[5],
  U: P.wood[6],
  // red
  '1': P.red[1],
  '2': P.red[2],
  '3': P.red[3],
  '4': P.red[4],
  '5': P.red[5],
  '6': P.red[6],
  // green
  '7': P.green[2],
  '8': P.green[3],
  '9': P.green[4],
  '!': P.green[5],
  // bronze
  m: P.bronze[1],
  n: P.bronze[2],
  N: P.bronze[3],
  M: P.bronze[4],
  '#': P.bronze[5],
  // blue / lapis
  l: P.blue[1],
  L: P.blue[2],
  i: P.blue[3],
  I: P.blue[4],
  j: P.blue[5],
  // turquoise
  z: '#2f9a96',
  Z: P.water[7],
  // cloth / paper
  x: P.cloth[3],
  X: P.cloth[4],
  v: P.cloth[5],
  // sand / sack
  h: P.sand[1],
  H: P.sand[2],
  f: P.sand[3],
  F: P.sand[4],
  '+': P.sand[5],
  // dark / powder
  A: P.smoke[1],
  C: P.smoke[2],
  '=': P.smoke[3],
  // fire
  O: P.fire[2],
  Q: P.fire[4],
  R: P.fire[5],
  '*': P.fire[6],
  // night
  V: P.night[1],
  '%': P.night[2],
  // brick / terracotta
  '(': P.brick[2],
  ')': P.brick[3],
  '[': P.brick[4],
  ']': P.brick[5],
  // skin
  '&': P.skin[4],
  '^': P.skin[3],
};

/** Draw string-art rows at (ox, oy). Unknown chars throw (caught by tests). */
export function drawRows(p: PixelCanvas, rows: readonly string[], ox = 0, oy = 0, legend = LEGEND, flipX = false): void {
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      const c = legend[ch];
      if (!c) throw new Error(`art: unknown legend char '${ch}'`);
      p.set(ox + (flipX ? row.length - 1 - x : x), oy + y, c);
    }
  }
}

// ───────────────────────────── Procedural helpers ─────────────────────────────

const LX = -0.52;
const LY = -0.62;
const LZ = 0.59;

/** Sphere-shaded disc with ordered dithering between ramp steps (light upper-left). */
export function shadedDisc(p: PixelCanvas, cx: number, cy: number, r: number, ramp: readonly string[], lo = 0, hi = ramp.length - 1): void {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const nx = (x + 0.5 - cx) / r;
      const ny = (y + 0.5 - cy) / r;
      const q = nx * nx + ny * ny;
      if (q > 1) continue;
      const nz = Math.sqrt(1 - q);
      const d = Math.max(0, nx * LX + ny * LY + nz * LZ);
      const t = lo + d * (hi - lo);
      let i = Math.floor(t);
      if (t - i > bayer(x, y)) i++;
      p.set(x, y, ramp[Math.max(0, Math.min(ramp.length - 1, i))]);
    }
}

/** Vertical dithered gradient across `stops` (top → bottom) inside a mask. */
function gradientFill(p: PixelCanvas, x0: number, y0: number, w: number, h: number, stops: readonly string[], mask?: (x: number, y: number) => boolean): void {
  for (let y = y0; y < y0 + h; y++) {
    const t = ((y - y0) / Math.max(1, h - 1)) * (stops.length - 1);
    for (let x = x0; x < x0 + w; x++) {
      if (mask && !mask(x, y)) continue;
      let i = Math.floor(t);
      if (t - i > bayer(x, y)) i++;
      p.set(x, y, stops[Math.min(stops.length - 1, i)]);
    }
  }
}

/** Tiny deterministic RNG for stable textures. */
function lcg(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Nearest-neighbour upscale (cursor images are not scaled by CSS). */
export function upscale(src: PixelCanvas, k: number): PixelCanvas {
  const out = new PixelCanvas(src.w * k, src.h * k);
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++) {
      const [r, g, b, a] = src.get(x, y);
      if (!a) continue;
      for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) out.set(x * k + i, y * k + j, (r << 16) | (g << 8) | b, a / 255);
    }
  return out;
}

// ───────────────────────────── Icon definitions ─────────────────────────────

export interface IconDef {
  w: number;
  h: number;
  /** Frames laid out horizontally (strip). */
  frames: number;
  /** Seconds per full cycle (animated icons). */
  period?: number;
  draw(p: PixelCanvas, frame: number): void;
}

function rowsIcon(rows: readonly string[]): IconDef {
  return { w: rows[0].length, h: rows.length, frames: 1, draw: (p) => drawRows(p, rows) };
}

// ── Resources (12×12) ──

const AKCE: IconDef = {
  w: 12,
  h: 12,
  frames: 1,
  draw(p) {
    // back coin (thickness), front coin; silver akçe with a stamped inscription
    p.disc(7, 5, 3, P.steel[2]);
    shadedDisc(p, 7.5, 5, 3.3, P.steel, 2, 6);
    p.disc(5, 7, 4, P.steel[2]);
    shadedDisc(p, 5.5, 6.5, 4.2, P.steel, 3, 6);
    // rim ring
    for (let a = 0; a < 32; a++) {
      const x = Math.round(5.5 + Math.cos((a / 32) * Math.PI * 2) * 3.4 - 0.5);
      const y = Math.round(6.5 + Math.sin((a / 32) * Math.PI * 2) * 3.4 - 0.5);
      if (a > 4 && a < 20) p.set(x, y, P.steel[3]);
    }
    // inscription (tiny tughra-like squiggle)
    p.set(4, 6, P.steel[2]);
    p.set(5, 5, P.steel[2]);
    p.set(5, 6, P.steel[2]);
    p.set(6, 7, P.steel[2]);
    p.set(4, 8, P.steel[3]);
    p.set(5, 8, P.steel[3]);
    p.set(3, 4, P.steel[6]);
    p.outline(P.outline[1]);
  },
};

const TAS = rowsIcon([
  '.....kk.....',
  '...kkEekk...',
  '.kkEEEeeekk.',
  'keEEEeeeeedk',
  'kdkkeeeddkbk',
  'kddcdkkbbcbk',
  'kdddddkbbbbk',
  'kcdddcbabbak',
  'kdddddbbbabk',
  'kdcdddbbabbk',
  '.kkdddbbbkk.',
  '...kkkkkk...',
]);

const KERESTE: IconDef = {
  w: 12,
  h: 12,
  frames: 1,
  draw(p) {
    const logs: [number, number][] = [
      [3.5, 8],
      [8.5, 8],
      [6, 3.6],
    ];
    for (const [cx, cy] of logs) {
      shadedDisc(p, cx, cy, 3, P.wood, 2, 4);
      p.disc(Math.floor(cx), Math.floor(cy), 1, P.wood[6]);
      p.set(Math.floor(cx) - 1, Math.floor(cy) - 1, P.wood[7]);
      p.set(Math.floor(cx), Math.floor(cy), P.wood[4]);
    }
    p.outline(P.outline[1]);
  },
};

const MADEN = rowsIcon([
  '............',
  '....kkk.....',
  '..kkdeck....',
  '.kcdeNMckk..',
  '.kdeM#Ncbck.',
  'kcddNNcbZbk.',
  'kddcbbczZbck',
  'kcdbM#cbzbak',
  '.kbbNMbbbaak',
  '.kbabbbaaak.',
  '..kkaaaakk..',
  '....kkkk....',
]);

const TUNC = rowsIcon([
  '............',
  '............',
  '...kkkkkkkk.',
  '..k##MMMMMNk',
  '.k#MMMMMMNnk',
  'kkkkkkkkkNnk',
  'k#MMMMMMkNnk',
  'kMMMMMMNknk.',
  'kNNNNNNnkk..',
  'kkkkkkkkk...',
  '............',
  '............',
]);

const BARUT = rowsIcon([
  '...kkkkkk...',
  '..kAACCAAk..',
  '.kpCA=CACpk.',
  '.kqrrrrrrqk.',
  '.kStTTTtSsk.',
  'kqrUUUUUrqpk',
  'kqrUuUUUrqpk',
  'kqruUUUUrqpk',
  '.kStTTTtSsk.',
  '.kqrrrrrrqk.',
  '..kppqqppk..',
  '...kkkkkk...',
]);

const GULLE: IconDef = {
  w: 12,
  h: 12,
  frames: 1,
  draw(p) {
    shadedDisc(p, 3.5, 8.5, 3.2, P.stone, 1, 7);
    shadedDisc(p, 8.5, 8.5, 3.2, P.stone, 1, 7);
    shadedDisc(p, 6, 4, 3.2, P.stone, 1, 7);
    p.outline(P.outline[1]);
  },
};

const ERZAK = rowsIcon([
  '...k....k...',
  '..kFk..kFk..',
  '...kFkkFk...',
  '....kHHk....',
  '...kffFFk...',
  '..kfF++FfK..',
  '.kfF+++FFhk.',
  '.kfF++FFfhk.',
  '.kfFFFFffhk.',
  '.kffffffhhk.',
  '..kHhhhhhk..',
  '...kkkkkk...',
]);

const YAG = rowsIcon([
  '...kkkkkk...',
  '..kvXXXXxk..',
  '..k[]]][(k..',
  '...k[[[(k...',
  '..k[]]][(k..',
  '.k[]]][[()k.',
  '.k[]][[[()k.',
  '.k[[[[[(()k.',
  '.k([[[(()(k.',
  '..k((((((k..',
  '...kkkkkk...',
  '............',
]);

// ── Gauges (12×12) ──

const MORAL = rowsIcon([
  '.Gk.........',
  'kgGk........',
  '.Yk4444k....',
  '.Yk45565k...',
  '.Yk455554k..',
  '.Yk4555554k.',
  '.Yk333333kk.',
  '.Yk3333kk...',
  '.Ykkkkk.....',
  '.Yk.........',
  '.yk.........',
  '.yk.........',
]);

const DIVAN = rowsIcon([
  '.....kk.....',
  '....kGgk....',
  '.kkkkGgkkkk.',
  'kGGGGGgggyyk',
  '.kk..Gy..kk.',
  '.Gk..Gy..kG.',
  'kG.k.Gy.kG.k',
  'kyyyk.ky.yyk',
  '.kkk.Gy.kkk.',
  '.....Gy.....',
  '...kGGgyk...',
  '..kkkkkkkk..',
]);

const GALATA = rowsIcon([
  '.....kk.....',
  '....k54k....',
  '...k4554k...',
  '..k344554k..',
  '..k3344554k.',
  '..kkkkkkkkk.',
  '...kEedck...',
  '...kekkck...',
  '...kEedck...',
  '...kEkdck...',
  '..kEEedcck..',
  '..kkkkkkkk..',
]);

const BIZANS: IconDef = {
  w: 12,
  h: 12,
  frames: 1,
  draw(p) {
    // Palaiologan arms: red cross with four "B" fire-steels on gold (heater shield)
    const rowW = [10, 10, 10, 10, 10, 10, 10, 8, 8, 6, 4];
    for (let y = 0; y < rowW.length; y++) {
      const w = rowW[y];
      const x0 = 6 - w / 2;
      for (let x = 0; x < w; x++) {
        const lit = x < w / 2 && y < 6;
        p.set(x0 + x, y, lit ? P.gold[5] : P.gold[4]);
      }
    }
    for (let y = 0; y < 11; y++) {
      p.set(5, y, P.red[4]);
      p.set(6, y, P.red[3]);
    }
    for (let x = 1; x < 11; x++) {
      p.set(x, 4, P.red[4]);
      p.set(x, 5, P.red[3]);
    }
    for (const [bx, by] of [
      [2, 1],
      [8, 1],
      [2, 7],
      [7, 7],
    ] as const) {
      p.set(bx, by, P.red[3]);
      p.set(bx + 1, by, P.red[4]);
      p.set(bx, by + 1, P.red[3]);
    }
    p.outline(P.outline[1]);
  },
};

const HACLI = rowsIcon([
  '.....k......',
  '...kkrkkk...',
  '...kvv4vk...',
  '...k44444k..',
  '...kvv4vXk..',
  '...kvx4xXk..',
  '....kkrkk...',
  'kk...kr...kk',
  'kUkkkkrkkkUk',
  'kurUUUUUUruk',
  '.kqqqqqqqqk.',
  '.zZzz.zZzzZ.',
]);

// ── Orders (12×12) ──

const EMIR_HUCUM = rowsIcon([
  '..........kk',
  '.........kWk',
  '........kWTk',
  '.......kWTk.',
  '......kWTk..',
  '.....kWTk...',
  '.kk.kWTk....',
  '.kGkWTk.....',
  '..kGTk......',
  '..kgGk......',
  '.kgkkgk.....',
  'kgk..kk.....',
]);

const EMIR_KORU: IconDef = {
  w: 12,
  h: 12,
  frames: 1,
  draw(p) {
    // round Ottoman kalkan: wicker/red with gold rim and steel boss
    shadedDisc(p, 6, 6, 5.6, P.red, 2, 6);
    for (let a = 0; a < 48; a++) {
      const x = Math.floor(6 + Math.cos((a / 48) * Math.PI * 2) * 5.1);
      const y = Math.floor(6 + Math.sin((a / 48) * Math.PI * 2) * 5.1);
      p.set(x, y, a > 18 && a < 42 ? P.gold[3] : P.gold[5]);
    }
    shadedDisc(p, 6, 6, 1.8, P.steel, 2, 6);
    p.outline(P.outline[1]);
  },
};

const EMIR_HENDEK = rowsIcon([
  '............',
  '....kkkk....',
  '..kkEEFEkk..',
  '.kEFFEEEhEk.',
  'kkkkkkkkkkkk',
  'kUrUrUrUrUqk',
  'krUrUrUrUrqk',
  '.kUrUrUrUqk.',
  '.krUrUrUrqk.',
  '..kUrUrUqk..',
  '...kkkkkk...',
  '............',
]);

const EMIR_LAGIM = rowsIcon([
  '..kkkk......',
  '.kTWWTkk....',
  'kTkkkWTTk...',
  'kk..kuWkTk..',
  '....kuk.kTk.',
  '...kuk...kk.',
  '..kuk.......',
  '.kuk........',
  'kuqk........',
  'kqk.........',
  'kk..........',
  '............',
]);

const EMIR_DINLEN: IconDef = {
  w: 12,
  h: 12,
  frames: 3,
  period: 0.45,
  draw(p, f) {
    const flame = [
      ['.....k......', '....kQk.....', '...kQRQk....', '..kQR*RQk...', '..kQRRRQk...', '.kOQQRQQOk..', '..kOQQQOk...'],
      ['......k.....', '.....kQk....', '....kQRQk...', '...kQR*RQk..', '..kQRR*RQk..', '..kOQRRQOk..', '..kOQQQOk...'],
      ['....k.......', '...kQk......', '...kQRQk....', '..kQR*RQk...', '..kQR*RRQk..', '.kOQRRRQOk..', '..kOQQQOk...'],
    ][f];
    drawRows(p, flame, 0, 1);
    drawRows(p, ['.kurkkkruk..', 'kuurrkrruuk.', '.kkkkkkkkk..'], 0, 8);
  },
};

const EMIR_GERI = rowsIcon([
  '....k.......',
  '...kgk......',
  '..kgGkkkkk..',
  '.kgGGGGGGGk.',
  '..kgYYYYYGk.',
  '...kgkkkkYk.',
  '....k...kYk.',
  '........kYk.',
  '...kkkkkkYk.',
  '...kYYYYYk..',
  '...kkkkkk...',
  '............',
]);

// ── Speed (7×7) ──

const HIZ_DUR = rowsIcon(['kk.kk..', 'kv.kv..', 'kv.kv..', 'kv.kv..', 'kv.kv..', 'kv.kv..', 'kk.kk..'].map((r) => '.' + r.slice(0, 6)));
const HIZ_1 = rowsIcon(['.k.....', '.kvk...', '.kvvk..', '.kvvvk.', '.kvvk..', '.kvk...', '.k.....']);
const HIZ_2 = rowsIcon(['k..k...', 'kvkkvk.', 'kvvkvvk', 'kvvkvvk', 'kvvkvvk', 'kvkkvk.', 'k..k...']);
const HIZ_3 = rowsIcon(['k.k.k..', 'kvkvkvk', 'kvkvkvk', 'kvkvkvk', 'kvkvkvk', 'kvkvkvk', 'k.k.k..']);

// ── Commands & special actions (16×16) ──

const INSA = rowsIcon([
  '................',
  '...kkkkkk.......',
  '..kTWWWTTk......',
  '..kSTTTTSSkk....',
  '..kssSSSssk.....',
  '...kkkukkk......',
  '......kuk.......',
  '......kuk.......',
  '......kuk..kkk..',
  '......kuk.kdedk.',
  '......kuk.kEedk.',
  '......kuk.kdcbk.',
  '.....kurk.kkkkk.',
  '.....kurk.kddck.',
  '.....kkkk.kcbak.',
  '..........kkkkk.',
]);

const EDIRNE = rowsIcon([
  '..k.........k...',
  '..t.........t...',
  '.ktk.......ktk..',
  '.kEk...kk..kEk..',
  '.kEk..kTTk.kEk..',
  '.ktk.kTWTtkktk..',
  '.kEk.kTTTtkkEk..',
  '.kEkkTTTTttkEk..',
  '.kEkkkkkkkkkEk..',
  '.kEkEEeeEEekEk..',
  '.kEkEkeEkeEkEk..',
  'kkEkEkeEkeEkEkk.',
  'kdEdEeeEeeEdEdk.',
  'kdEdEEeEEeEdEdk.',
  'kkkkkkkkkkkkkkk.',
  '................',
]);

const GUNLUK = rowsIcon([
  '................',
  '..kkkkkkkkkkk...',
  '.kFffffffffFFk..',
  '.kfkkkkkkkkfFk..',
  '..kFffffffFk....',
  '..kF+yyyy+Fk....',
  '..kF++++++Fk....',
  '..kF+yyy++Fk....',
  '..kF++++++Fk....',
  '..kF+yyyy+Fk....',
  '..kF++++++Fk....',
  '..kF+yy+++Fk....',
  '.kFffffffffFk...',
  '.kfkkkkkkkkfFk..',
  '..kkkkkkkkkkk...',
  '................',
]);

const GOREV = rowsIcon([
  '................',
  '...kkkkkkkkk....',
  '..k4kFFFFFFFk...',
  '..k4kF+++++Fk...',
  '..k4kF+yyy+Fk...',
  '..k4kF+++++Fk...',
  '..k4kF+yy++Fk...',
  '..k4kF+++++Fk...',
  '..k4kF+yyy+Fk...',
  '..k4kF+++++Fk...',
  '..k3kF+yy++Fk...',
  '..k3kFFFFFFFk...',
  '..k3kkkkkkkkk...',
  '..k4k...........',
  '..kk............',
  '................',
]);

const OZEL_GEMI = rowsIcon([
  '.......k........',
  '......kvk.......',
  '.....kvvXk......',
  '....kvvvXxk.....',
  '...kvvvvXxk.....',
  '...kkkkrkkkk....',
  'k.....kr.....k..',
  'kUkkkkkrkkkkUk..',
  'kurUUUUUUUUruk..',
  '.kqqqqqqqqqqk...',
  '..kkkkkkkkkk....',
  '.kpk.kpk.kpk....',
  'kurqkurqkurqk...',
  '9kpk9kpk9kpk98..',
  '9999999999999998',
  '8888888888888888',
]);

const OZEL_KOPRU = rowsIcon([
  '................',
  '................',
  '................',
  '.kkkkkkkkkkkkkk.',
  'kUUUUUUUUUUUUUUk',
  'krrrrrrrrrrrrrrk',
  '.kkkkkkkkkkkkkk.',
  '.kpk.kpk.kpk.kp.',
  'kqrUkqrUkqrUkqr.',
  'kSTSkSTSkSTSkST.',
  'kqrUkqrUkqrUkqr.',
  'IkpkIkpkIkpkIkp.',
  'iIiiiIiiiIiiiIii',
  'LiLLLiLLLiLLLiLL',
  'lLllLlllLlllLlll',
  '................',
]);

const OZEL_KULE = rowsIcon([
  '.....kkkkk......',
  '....kUuuurk.....',
  '....kkkkkkk.....',
  '....kr(p(qk.....',
  '....kr)p)qk.....',
  '....kkkkkkk.....',
  '....kr(p(qk.....',
  '....kr)p)qk.....',
  '...kkkkkkkkk....',
  '...kr(p(p(qk....',
  '...kr)p)p)qk....',
  '...kkkkkkkkk....',
  '..kr(p(p(p(qk...',
  '..kkkkkkkkkkk...',
  '..kSk.kSk.kSk...',
  '...k...k...k....',
]);

const OZEL_PADISAH = rowsIcon([
  '.......kk.......',
  '......kGgk......',
  '......kvXk......',
  '....kkvvXxkk....',
  '...kvvvvvXxxk...',
  '..kvvvXXXXxxxk..',
  '..kvvXXXXXxxxk..',
  '..kvvvvvvvXxxk..',
  '...kk45554kk....',
  '....k45554k.....',
  '...kkkkkkkkk....',
  '...k&&&&&&^k....',
  '...k&k&&k&^k....',
  '...k&&&&&&^k....',
  '....kk&&&^kk....',
  '......kkkk......',
]);

const OZEL_SONHUCUM = rowsIcon([
  'kk............kk',
  'kWk..........kWk',
  '.kWk........kWk.',
  '..kWk......kWk..',
  '...kWk....kWk...',
  '....kWk..kWk....',
  '.....kWkkWk.....',
  '......kWWk......',
  '......kWWk......',
  '.....kWkkWk.....',
  '..kk.kGkkGk.kk..',
  '..kGkGk..kGkGk..',
  '...kGk....kGk...',
  '...kgGk..kGgk...',
  '..kgkkgkkgkkgk..',
  '.kgk..kk..kkkgk.',
]);

// ── Edirne sections (16×16) ──

const OCAK: IconDef = {
  w: 16,
  h: 16,
  frames: 3,
  period: 0.4,
  draw(p, f) {
    drawRows(p, [
      '.....kkkkk......',
      '.....kaabk......',
      '.....kabbk......',
      '....kkkkkkk.....',
      '...kddddddck....',
      '..kdddkkkdddk...',
      '..kddk...kddk...',
      '..kdk.....kdk...',
      '..kdk.....kdk...',
      '..kdk.....kck...',
      '..kddkkkkkdck...',
      '..kccccccccck...',
      '..kkkkkkkkkkk...',
      '................',
    ], 0, 1);
    const fl = [
      ['..k..', '.kQk.', 'kQRQk', 'kR*Rk'],
      ['...k.', '..kQk', '.kQRk', 'kRR*k'],
      ['.k...', 'kQk..', 'kRQk.', 'k*RRk'],
    ][f];
    drawRows(p, fl, 5, 7);
    p.set(6, 11, P.fire[3]);
    p.set(7, 11, P.fire[4]);
    p.set(8, 11, P.fire[3]);
    // smoke puff
    p.set(6 + (f % 2), 0, P.smoke[4]);
  },
};

const HAZINE = rowsIcon([
  '................',
  '................',
  '...kkkkkkkkkk...',
  '..kurrrrrrrrrk..',
  '.kurUUUUUUUUrqk.',
  '.kqrrrrrrrrrrqk.',
  '.kGkkkkGGkkkkGk.',
  '.kyrrrkYykrrrYk.',
  '.kGrUrkgykrUrGk.',
  '.kyrrrrkkrrrrYk.',
  '.kGrUrrrrrrUrGk.',
  '.kyrrrrrrrrrrYk.',
  '.kGqqqqqqqqqqGk.',
  '.kkkkkkkkkkkkkk.',
  '................',
  '................',
]);

const ASKER = rowsIcon([
  '...Gk...........',
  '..kgGk..........',
  '...Yk44444k.....',
  '...Yk455554k....',
  '...Yk4555554k...',
  '...Yk45555554k..',
  '...Yk4vv55554k..',
  '...Yk4v5v5554k..',
  '...Yk4vv55554k..',
  '...Yk3333333kk..',
  '...Yk33333kk....',
  '...Yk333kk......',
  '...Ykkkk........',
  '...Yk...........',
  '...yk...........',
  '..kkkk..........',
]);

const YOL = rowsIcon([
  '................',
  '................',
  '................',
  '................',
  '..kkkkkkkkkkkk..',
  '.kEEeEEEEeEEEek.',
  'kkkkkkkkkkkkkkkk',
  'kEedEeedEedEeedk',
  'kddcdkkkkkdcddck',
  'kdcdk.....kdcbck',
  'kdcdkIiIiIkcdbbk',
  'kcdkiIiiiiIkcbck',
  'kddkLiLiLiLkdbbk',
  'kcbkLLLLLLLkbbak',
  'kkkkkkkkkkkkkkkk',
  '................',
]);

const KERVAN = rowsIcon([
  '................',
  '.........kk.....',
  '........kuUk....',
  '...kk...kUuk.kk.',
  '..kUuk..kuk.kUk.',
  '.kUUUukkkuk.kuk.',
  'kUUuUUUuuukkuk..',
  'kuUUuUUuuuuuuk..',
  'k4G4kuUUuuuuk...',
  '.kGk.kuuuuuqk...',
  '..k..kqkkkqk....',
  '.....kqk.kqk....',
  '.....kqk.kqk....',
  '....kkqkkkqkk...',
  '................',
  '................',
]);

// ── Misc ──

const ONAY = rowsIcon(['......kk', '.....k9k', 'kk..k9k.', 'k9kk9k..', '.k99k...', '..kk....']);
const RED = rowsIcon(['kk..kk', 'k5kk5k', '.k55k.', '.k55k.', 'k5kk5k', 'kk..kk']);
const KILIT = rowsIcon(['..kkk..', '.kSkSk.', '.kk.kk.', 'kkkkkkk', 'kgGGGgk', 'kgYkYgk', 'kgYYYgk', 'kkkkkkk']);

/** Pennant (sancak) on a gold-tipped pole, fluttering: 16×22, 4 frames. */
const SANCAK: IconDef = {
  w: 16,
  h: 22,
  frames: 4,
  period: 0.7,
  draw(p, f) {
    // pole
    for (let y = 3; y < 22; y++) {
      p.set(1, y, P.wood[5]);
      p.set(2, y, P.wood[3]);
    }
    shadedDisc(p, 2, 2, 1.8, P.gold, 2, 6);
    // flag: swallow-tailed red sancak with a gold edge
    const L = 13;
    for (let i = 0; i < L; i++) {
      const x = 3 + i;
      const wave = Math.sin(i * 0.62 - (f * Math.PI) / 2) * (0.4 + i * 0.12);
      const top = 4 + Math.round(wave);
      let h = 9 - Math.floor(i * 0.18);
      const notch = i >= L - 3 ? i - (L - 4) : 0;
      const slope = Math.cos(i * 0.62 - (f * Math.PI) / 2);
      for (let j = 0; j < h; j++) {
        if (notch && j >= Math.floor(h / 2) - notch + 1 && j <= Math.floor(h / 2) + notch - 1) continue;
        let c: string = slope > 0.35 ? P.red[5] : slope < -0.35 ? P.red[3] : P.red[4];
        if (j === 0) c = slope > 0 ? P.gold[5] : P.gold[3];
        if (j === h - 1) c = P.red[2];
        p.set(x, top + j, c);
      }
    }
    p.outline(P.outline[1]);
  },
};

/** Day-segment medallion (sky disc with sun/moon): 20×20, 4 frames. */
function skyMedallion(seg: 'safak' | 'gunduz' | 'aksam' | 'gece' | 'tutulma'): IconDef {
  return {
    w: 20,
    h: 20,
    frames: 4,
    period: 1.2,
    draw(p, f) {
      const cx = 9.5;
      const cy = 9.5;
      const inside = (x: number, y: number) => Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= 8.2;
      const skies: Record<string, readonly string[]> = {
        safak: [P.night[3], P.purple[4], P.purple[5], P.red[6], P.fire[5], P.fire[6]],
        gunduz: [P.blue[3], P.blue[4], P.blue[5], P.water[8]],
        aksam: [P.purple[1], P.purple[2], P.red[3], P.red[4], P.fire[3]],
        gece: [P.night[0], P.night[1], P.night[2], P.night[3]],
        tutulma: [P.night[0], P.night[1], P.purple[1], P.purple[2]],
      };
      const horizon = seg === 'gunduz' ? 14 : 13;
      gradientFill(p, 0, 0, 20, horizon, skies[seg], inside);
      // ground / sea
      const sea = seg === 'gunduz' ? [P.water[5], P.water[4]] : seg === 'gece' || seg === 'tutulma' ? [P.night[1], P.night[0]] : [P.water[3], P.water[2]];
      gradientFill(p, 0, horizon, 20, 20 - horizon, sea, inside);
      // distant hills (Thracian shore)
      for (let x = 0; x < 20; x++) {
        const hh = Math.round(1.2 + Math.sin(x * 0.55) * 1.1 + (x > 11 ? 1 : 0));
        for (let j = 0; j < hh; j++) if (inside(x, horizon - 1 - j)) p.set(x, horizon - 1 - j, seg === 'gunduz' ? P.grass[3] : seg === 'gece' || seg === 'tutulma' ? P.night[0] : P.purple[1]);
      }
      if (seg === 'gunduz') {
        // sun with rotating rays
        shadedDisc(p, 9.5, 7, 3.2, P.gold, 4, 6);
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2 + (f * Math.PI) / 16;
          const r0 = 4.4 + ((k + f) % 2) * 0.6;
          for (let r = r0; r < r0 + 1.6; r += 0.8) {
            const x = Math.floor(9.5 + Math.cos(a) * r);
            const y = Math.floor(7 + Math.sin(a) * r);
            if (inside(x, y)) p.set(x, y, k % 2 ? P.gold[5] : P.gold[6]);
          }
        }
        // drifting cloud
        const cxl = 3 + f;
        for (const [dx, dy] of [
          [0, 0],
          [1, 0],
          [2, 0],
          [1, -1],
          [3, 0],
          [2, -1],
        ])
          if (inside(cxl + dx, 11 + dy)) p.set(cxl + dx, 11 + dy, P.cloth[5]);
      } else if (seg === 'safak' || seg === 'aksam') {
        // şafak: small pale-gold sun just rising; akşam: large red sun sinking
        const ramp = seg === 'safak' ? [P.fire[5], P.fire[6], P.gold[6], P.fire[7]] : [P.red[3], P.red[4], P.fire[3], P.fire[4]];
        const r = seg === 'safak' ? 3.2 : 4.2;
        const sy = horizon + (seg === 'safak' ? -0.5 : 1);
        for (let y = 0; y < horizon; y++)
          for (let x = 0; x < 20; x++) {
            const d = Math.hypot(x + 0.5 - 9.5, y + 0.5 - sy);
            if (d <= r && inside(x, y)) p.set(x, y, ramp[Math.min(3, Math.floor((1 - d / r) * 3.99 + bayer(x, y) * 0.5))]);
          }
        // glittering path of light on the sea (dashes that shimmer per frame)
        for (let j = 0; j < 5; j++) {
          const y = horizon + 1 + j;
          const half = Math.max(1, 3 - (j >> 1));
          for (let x = -half; x < half; x++) {
            if ((x + j * 2 + f) & 2) continue;
            const px = Math.floor(9.5 + x);
            if (inside(px, y)) p.set(px, y, j < 2 ? ramp[2] : ramp[1]);
          }
        }
      } else {
        // moon (crescent; blood-red full moon during the 22 Mayıs eclipse)
        if (seg === 'tutulma') {
          shadedDisc(p, 11.5, 6.5, 3.2, P.brick, 1, 5);
        } else {
          for (let y = 0; y < 20; y++)
            for (let x = 0; x < 20; x++) {
              const a = Math.hypot(x + 0.5 - 11.5, y + 0.5 - 6.5);
              const b = Math.hypot(x + 0.5 - 13.2, y + 0.5 - 5.4);
              if (a <= 3.4 && b > 3.0) p.set(x, y, a < 2.6 ? P.gold[6] : P.cloth[4]);
            }
        }
        // twinkling stars
        const stars: [number, number][] = [
          [4, 4],
          [6, 9],
          [3, 8],
          [8, 3],
          [15, 10],
          [7, 6],
        ];
        stars.forEach(([x, y], i) => {
          const on = (i + f) % 4;
          if (!inside(x, y)) return;
          p.set(x, y, on === 0 ? P.cloth[5] : on === 1 ? P.cloth[3] : P.night[3]);
          if (on === 0 && i % 2 === 0) {
            p.set(x - 1, y, P.night[3]);
            p.set(x + 1, y, P.night[3]);
          }
        });
        // moonlit path
        for (let j = 0; j < 4; j++) {
          const px = 11 + ((j + f) % 2);
          if (inside(px, horizon + 1 + j)) p.set(px, horizon + 1 + j, seg === 'tutulma' ? P.brick[2] : P.night[3]);
        }
      }
      // gold rim (bevelled), dark outer edge
      for (let y = 0; y < 20; y++)
        for (let x = 0; x < 20; x++) {
          const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
          if (d > 8.2 && d <= 9.6) {
            const lit = x + y < 18;
            p.set(x, y, d > 9 ? P.gold[2] : lit ? P.gold[5] : P.gold[3]);
          }
        }
      p.outline(P.outline[1]);
    },
  };
}

/** Red wax seal (Gün N badge) 22×22. */
const MUHUR: IconDef = {
  w: 22,
  h: 22,
  frames: 1,
  draw(p) {
    // scalloped wax edge
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      shadedDisc(p, 11 + Math.cos(a) * 8.2, 11 + Math.sin(a) * 8.2, 2.4, P.red, 1, 4);
    }
    shadedDisc(p, 11, 11, 9, P.red, 1, 5);
    // pressed inner ring
    for (let a = 0; a < 64; a++) {
      const x = Math.floor(11 + Math.cos((a / 64) * Math.PI * 2) * 6.6);
      const y = Math.floor(11 + Math.sin((a / 64) * Math.PI * 2) * 6.6);
      p.set(x, y, a > 8 && a < 40 ? P.red[5] : P.red[2]);
    }
    p.outline(P.outline[1]);
  },
};

/** Tezhip corner ornament (top-left orientation) 14×14. */
const KOSE = rowsIcon([
  '.kkkkkkkkkk...',
  'kGGGGGGGGGGkk.',
  'kGy444yLLLgGGk',
  'kG45654yLiLgk.',
  'kG46564yLLgk..',
  'kGy444yLLgk...',
  'kGyyyyyygk....',
  'kGLLLyygk.....',
  'kGLiLygk......',
  'kGLLLgk.......',
  'kGLLgk........',
  'kGgGk.........',
  '.kGk..........',
  '..k...........',
]);

/** Map-pin crosshair cursor (drawn 15×15, upscaled ×2). */
function crosshair(): PixelCanvas {
  const p = new PixelCanvas(15, 15);
  drawRows(p, [
    '......kkk......',
    '......k5k......',
    '......k4k......',
    '......k4k......',
    '....kkkkkkk....',
    '...kGk...kGk...',
    'kkkkk.....kkkkk',
    'k544k..g..k445k',
    'kkkkk.....kkkkk',
    '...kGk...kGk...',
    '....kkkkkkk....',
    '......k4k......',
    '......k4k......',
    '......k5k......',
    '......kkk......',
  ]);
  return upscale(p, 2);
}

export const ICONS: Record<string, IconDef> = {
  akce: AKCE,
  tas: TAS,
  kereste: KERESTE,
  maden: MADEN,
  tunc: TUNC,
  barut: BARUT,
  gulle: GULLE,
  erzak: ERZAK,
  yag: YAG,
  moral: MORAL,
  divan: DIVAN,
  galata: GALATA,
  bizans: BIZANS,
  hacli: HACLI,
  'emir-hucum': EMIR_HUCUM,
  'emir-koru': EMIR_KORU,
  'emir-hendek': EMIR_HENDEK,
  'emir-lagim': EMIR_LAGIM,
  'emir-dinlen': EMIR_DINLEN,
  'emir-geri': EMIR_GERI,
  'hiz-0': HIZ_DUR,
  'hiz-1': HIZ_1,
  'hiz-2': HIZ_2,
  'hiz-3': HIZ_3,
  insa: INSA,
  edirne: EDIRNE,
  gunluk: GUNLUK,
  gorev: GOREV,
  'ozel-gemi': OZEL_GEMI,
  'ozel-kopru': OZEL_KOPRU,
  'ozel-kule': OZEL_KULE,
  'ozel-padisah': OZEL_PADISAH,
  'ozel-sonhucum': OZEL_SONHUCUM,
  ocak: OCAK,
  hazine: HAZINE,
  asker: ASKER,
  yol: YOL,
  kervan: KERVAN,
  onay: ONAY,
  red: RED,
  kilit: KILIT,
  sancak: SANCAK,
  'gok-safak': skyMedallion('safak'),
  'gok-gunduz': skyMedallion('gunduz'),
  'gok-aksam': skyMedallion('aksam'),
  'gok-gece': skyMedallion('gece'),
  'gok-tutulma': skyMedallion('tutulma'),
  muhur: MUHUR,
  kose: KOSE,
};

/** Render an icon (all frames side by side) into a PixelCanvas. */
export function renderIcon(def: IconDef): PixelCanvas {
  const strip = new PixelCanvas(def.w * def.frames, def.h);
  for (let f = 0; f < def.frames; f++) {
    const fr = new PixelCanvas(def.w, def.h);
    def.draw(fr, f);
    strip.blit(fr, f * def.w, 0);
  }
  return strip;
}

// ───────────────────────────── Frames & textures ─────────────────────────────

/** Border slice width (art px) of the panel frames. */
export const FRAME_SLICE = 6;

/**
 * Panel frame for border-image: ink outline, bevelled 3-px gold rule, ink
 * line, then the panel fill; tiny lapis knots in the inner corners (tezhip).
 */
export function drawFrame(kind: 'kagit' | 'gece' | 'kirmizi'): PixelCanvas {
  const S = FRAME_SLICE;
  const N = S * 2 + 4;
  const p = new PixelCanvas(N, N);
  const fill = kind === 'kagit' ? '#efe2c2' : kind === 'gece' ? P.night[1] : P.red[2];
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const d = Math.min(x, y, N - 1 - x, N - 1 - y);
      // top & left edges catch the light (upper-left), bottom & right are in shade
      const lit = (d === y && x < N - 1 - y) || (d === x && y < N - 1 - x);
      let c: string;
      if (d === 0) c = P.outline[1];
      else if (d === 1) c = lit ? P.gold[5] : P.gold[3];
      else if (d === 2) c = P.gold[4];
      else if (d === 3) c = lit ? P.gold[3] : P.gold[2];
      else if (d === 4) c = kind === 'kagit' ? P.outline[2] : P.outline[1];
      else c = fill;
      p.set(x, y, c);
    }
  // rounded outer corners
  for (const [x, y] of [
    [0, 0],
    [N - 1, 0],
    [0, N - 1],
    [N - 1, N - 1],
  ]) {
    p.erase(x, y);
    p.set(x + (x ? -1 : 1), y + (y ? -1 : 1), P.outline[1]);
  }
  // inner-corner knots (2×2 lapis/turquoise with a gold pip)
  const knot = kind === 'kagit' ? [P.blue[2], '#2f9a96'] : [P.gold[2], P.gold[4]];
  for (const [x, y] of [
    [S - 1, S - 1],
    [N - S - 1, S - 1],
    [S - 1, N - S - 1],
    [N - S - 1, N - S - 1],
  ]) {
    p.rect(x, y, 2, 2, knot[0]);
    p.set(x + (x < N / 2 ? 0 : 1), y + (y < N / 2 ? 0 : 1), knot[1]);
  }
  return p;
}

/** Parchment fibre texture 32×32 (tileable). */
export function drawPaper(): PixelCanvas {
  const p = new PixelCanvas(32, 32);
  p.rect(0, 0, 32, 32, '#efe2c2');
  const rnd = lcg(1453);
  for (let i = 0; i < 70; i++) {
    const x = Math.floor(rnd() * 32);
    const y = Math.floor(rnd() * 32);
    p.set(x, y, rnd() < 0.55 ? '#e5d5b0' : '#f6ecd4');
  }
  for (let i = 0; i < 9; i++) {
    const x = Math.floor(rnd() * 32);
    const y = Math.floor(rnd() * 32);
    const l = 2 + Math.floor(rnd() * 4);
    for (let k = 0; k < l; k++) p.set((x + k) % 32, y, '#e8d9b4');
  }
  return p;
}

/** Navy panel texture with a faint 8-pointed-star lattice (16×16, tileable). */
export function drawNight(): PixelCanvas {
  const p = new PixelCanvas(16, 16);
  p.rect(0, 0, 16, 16, P.night[1]);
  const c = '#1a2a58';
  // square
  p.line(4, 4, 11, 4, c);
  p.line(4, 11, 11, 11, c);
  p.line(4, 4, 4, 11, c);
  p.line(11, 4, 11, 11, c);
  // rotated square (diamond)
  p.line(7, 2, 13, 8, c);
  p.line(13, 8, 8, 13, c);
  p.line(8, 13, 2, 8, c);
  p.line(2, 8, 7, 2, c);
  p.set(7, 7, '#22346a');
  p.set(8, 8, '#22346a');
  p.set(0, 0, '#1a2a58');
  return p;
}

/** Tent valance (saçak) hanging under the top bar: 8×7 repeating tile. */
export function drawSacak(): PixelCanvas {
  const p = new PixelCanvas(8, 7);
  drawRows(p, [
    'GGGGGGGG',
    'yyyyyyyy',
    '44444444',
    'k343g43k',
    '.k3333k.',
    '..k22k..',
    '...kk...',
  ]);
  return p;
}

/** Width (art px) of the Edirne panorama = inner width of the Edirne panel. */
export const EDIRNE_W = 288;
export const EDIRNE_H = 48;

/**
 * Edirne panorama (panel header), golden afternoon over the Tunca: the new
 * palace (Saray-ı Cedid, begun 1450) with its Cihannüma tower on the river,
 * Üç Şerefeli Camii (1447) with its tall three-balcony minaret and the
 * nine-domed Eski Cami (1414). No Selimiye — that is 1575.
 */
export function drawEdirne(): PixelCanvas {
  const W = EDIRNE_W;
  const H = EDIRNE_H;
  const p = new PixelCanvas(W, H);
  const K = P.outline[1];
  gradientFill(p, 0, 0, W, 32, [P.blue[2], P.blue[3], P.blue[4], P.water[7], P.sand[5], P.fire[5]]);
  // low sun with a dithered halo
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - 236, (y - 22) * 1.3);
      if (d < 22 && bayer(x, y) < (1 - d / 22) * 0.55) p.set(x, y, P.gold[6]);
    }
  shadedDisc(p, 236, 22, 6, P.gold, 4, 6);
  // wisps of cloud
  for (const [cx, cy, l] of [
    [40, 8, 22],
    [150, 5, 30],
    [200, 12, 18],
  ] as const) {
    for (let i = 0; i < l; i++) p.set(cx + i, cy, P.cloth[5]);
    for (let i = 3; i < l - 4; i++) p.set(cx + i, cy - 1, P.cloth[4]);
    for (let i = 2; i < l - 2; i++) p.set(cx + i + 1, cy + 1, P.fire[6]);
  }
  // far hills (Thrace), two layers
  for (let x = 0; x < W; x++) {
    const h1 = Math.round(9 + Math.sin(x * 0.031) * 3 + Math.sin(x * 0.11) * 1.2);
    for (let j = 0; j < h1; j++) p.set(x, 34 - j, j > h1 - 2 ? P.purple[5] : P.purple[4]);
    const h2 = Math.round(5 + Math.sin(x * 0.05 + 2) * 2);
    for (let j = 0; j < h2; j++) p.set(x, 34 - j, j > h2 - 2 ? P.purple[4] : P.purple[3]);
  }
  // town ground
  p.rect(0, 34, W, 7, P.dryGrass[3]);
  for (let x = 0; x < W; x++) if (bayer(x, 35) < 0.3) p.set(x, 35, P.dryGrass[4]);
  // river Tunca
  gradientFill(p, 0, 41, W, H - 41, [P.water[6], P.water[5], P.water[4], P.water[3]]);
  for (let x = 0; x < W; x++) p.set(x, 41, P.sand[3]);
  const rnd = lcg(1361);
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(rnd() * (W - 4));
    const y = 43 + Math.floor(rnd() * 4);
    p.set(x, y, P.water[8]);
    p.set(x + 1, y, P.water[7]);
  }
  // sun glitter on the river
  for (let y = 42; y < H; y++) for (let x = 226; x < 248; x++) if (bayer(x, y * 3) < 0.25) p.set(x, y, P.gold[6]);

  const house = (x: number, w: number, h: number, base: number) => {
    p.rect(x, base - h, w, h, P.limestone[4]);
    p.rect(x + w - 1, base - h, 1, h, P.limestone[2]);
    p.set(x + 1, base - h + 1, P.wood[3]);
    for (let i = -1; i <= w; i++) p.set(x + i, base - h - 1, i < w / 2 ? P.roof[5] : P.roof[3]);
    for (let i = 0; i < w; i++) p.set(x + i, base - h - 2, P.roof[4]);
  };
  for (let x = 4; x < W - 8; x += 6 + Math.floor(rnd() * 5)) house(x, 4 + Math.floor(rnd() * 3), 3 + Math.floor(rnd() * 3), 40);

  const dome = (cx: number, base: number, r: number) => {
    for (let y = 0; y <= r; y++)
      for (let x = -r; x <= r; x++) {
        if (x * x + y * y > r * r + r * 0.6) continue;
        const edge = x * x + y * y > (r - 1) * (r - 1) + (r - 1) * 0.6;
        p.set(cx + x, base - y, edge ? P.steel[2] : x < -r / 3 ? P.steel[5] : x < r / 3 ? P.steel[4] : P.steel[3]);
      }
    p.set(cx, base - r - 1, P.gold[5]);
    p.set(cx, base - r - 2, P.gold[4]);
    p.set(cx, base - r - 3, P.gold[6]);
  };
  const block = (x: number, y: number, w: number, h: number) => {
    p.rect(x, y, w, h, P.limestone[4]);
    p.rect(x + Math.floor(w * 0.7), y, w - Math.floor(w * 0.7), h, P.limestone[2]);
    p.rect(x, y, w, 1, P.limestone[5]);
    for (let i = x + 2; i < x + w - 2; i += 4) {
      p.set(i, y + 3, P.outline[2]);
      p.set(i, y + 4, P.outline[2]);
    }
    p.line(x - 1, y, x - 1, y + h - 1, K);
    p.line(x + w, y, x + w, y + h - 1, K);
  };
  const minaret = (x: number, base: number, h: number, balconies: number) => {
    p.rect(x, base - h, 3, h, P.limestone[5]);
    p.rect(x + 2, base - h, 1, h, P.limestone[2]);
    p.line(x - 1, base - h, x - 1, base, K);
    p.line(x + 3, base - h, x + 3, base, K);
    for (let b = 1; b <= balconies; b++) {
      const by = base - Math.round((h * (b + 1.6)) / (balconies + 2.4));
      p.rect(x - 2, by, 7, 1, P.limestone[3]);
      p.rect(x - 1, by + 1, 5, 1, P.outline[2]);
    }
    // lead-covered conical cap
    p.rect(x, base - h - 1, 3, 1, P.steel[3]);
    p.set(x + 1, base - h - 2, P.steel[4]);
    p.set(x + 1, base - h - 3, P.steel[4]);
    p.set(x + 1, base - h - 4, P.steel[3]);
    p.set(x + 1, base - h - 5, P.gold[5]);
  };
  // Saray-ı Cedid by the river with the Cihannüma tower
  block(92, 32, 32, 8);
  p.rect(104, 18, 8, 14, P.limestone[4]);
  p.rect(110, 18, 2, 14, P.limestone[2]);
  p.line(103, 18, 103, 31, K);
  p.line(112, 18, 112, 31, K);
  for (let i = 0; i < 10; i++) {
    const w = Math.max(0, 5 - Math.floor(i / 2));
    p.rect(108 - w, 17 - i, w * 2, 1, i < 5 ? P.roof[4] : P.roof[5]);
  }
  p.set(107, 7, P.gold[5]);
  p.set(107, 6, P.gold[6]);
  p.rect(106, 22, 1, 2, K);
  p.rect(109, 22, 1, 2, K);
  // Üç Şerefeli Camii (1447): broad central dome, four minarets, the tallest with three balconies
  block(150, 28, 46, 12);
  dome(160, 28, 5);
  dome(186, 28, 5);
  dome(173, 28, 11);
  minaret(142, 40, 34, 3);
  minaret(201, 40, 26, 2);
  minaret(136, 40, 20, 1);
  minaret(207, 40, 20, 1);
  // Eski Cami (1414): square hall with nine domes (three visible), two minarets
  block(222, 30, 30, 10);
  for (let i = 0; i < 3; i++) dome(227 + i * 10, 30, 4);
  minaret(217, 40, 24, 1);
  minaret(254, 40, 24, 1);
  // cypresses
  for (const cx of [84, 90, 128, 266, 278]) {
    for (let y = 0; y < 11; y++) {
      const w = y < 2 ? 1 : y < 9 ? 2 : 1;
      for (let x = 0; x < w; x++) p.set(cx + x, 40 - 11 + y, x === 0 && w > 1 ? P.cypress[3] : P.cypress[1]);
    }
  }
  // the old stone bridge over the Tunca
  for (let x = 40; x < 88; x++) {
    p.set(x, 40, P.limestone[3]);
    p.set(x, 41, P.limestone[2]);
  }
  for (let a = 0; a < 6; a++) {
    const cx = 43 + a * 7;
    p.set(cx, 42, P.limestone[2]);
    p.set(cx + 4, 42, P.limestone[2]);
    p.set(cx + 1, 43, P.outline[2]);
    p.set(cx + 3, 43, P.outline[2]);
  }
  return p;
}

// ───────────────────────────── DOM: data URLs ─────────────────────────────

const urlCache = new Map<string, string>();

function toUrl(p: PixelCanvas): string {
  return p.toCanvas().toDataURL('image/png');
}

function cached(key: string, make: () => PixelCanvas): string {
  let u = urlCache.get(key);
  if (!u) {
    u = toUrl(make());
    urlCache.set(key, u);
  }
  return u;
}

/** Data URL of an icon strip (all frames). */
export function iconUrl(name: string): string {
  const def = ICONS[name];
  if (!def) return '';
  return cached(`icon:${name}`, () => renderIcon(def));
}

export function frameUrl(kind: 'kagit' | 'gece' | 'kirmizi'): string {
  return cached(`frame:${kind}`, () => drawFrame(kind));
}

export function paperUrl(): string {
  return cached('paper', drawPaper);
}

export function nightUrl(): string {
  return cached('night', drawNight);
}

export function sacakUrl(): string {
  return cached('sacak', drawSacak);
}

export function edirneUrl(): string {
  return cached('edirne-panorama', drawEdirne);
}

export function cursorUrl(): string {
  return cached('cursor', crosshair);
}

/** CSS custom properties that hud.css uses for the generated art. */
export function artCssVars(): Record<string, string> {
  return {
    '--hud-kagit': `url(${paperUrl()})`,
    '--hud-gece': `url(${nightUrl()})`,
    '--hud-cerceve-kagit': `url(${frameUrl('kagit')})`,
    '--hud-cerceve-gece': `url(${frameUrl('gece')})`,
    '--hud-cerceve-kirmizi': `url(${frameUrl('kirmizi')})`,
    '--hud-sacak': `url(${sacakUrl()})`,
    '--hud-kose': `url(${iconUrl('kose')})`,
    '--hud-muhur': `url(${iconUrl('muhur')})`,
    '--hud-imlec': `url(${cursorUrl()}) 15 15, crosshair`,
  };
}

/**
 * Icon from a Phaser texture (building/unit/cannon icons generated by other
 * features in BootScene), as a data URL plus its size, or null.
 */
const phaserCache = new Map<string, { url: string; w: number; h: number } | null>();
export function phaserIcon(key: string | undefined): { url: string; w: number; h: number } | null {
  if (!key) return null;
  if (phaserCache.has(key)) return phaserCache.get(key)!;
  let out: { url: string; w: number; h: number } | null = null;
  try {
    const game = (window as any).__game?.scene?.game;
    const tm = game?.textures;
    if (tm?.exists(key)) {
      const frame = tm.get(key).get();
      const src = frame.source.image as HTMLCanvasElement | HTMLImageElement;
      const cv = document.createElement('canvas');
      cv.width = frame.cutWidth;
      cv.height = frame.cutHeight;
      cv.getContext('2d')!.drawImage(src, frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight, 0, 0, frame.cutWidth, frame.cutHeight);
      out = { url: cv.toDataURL('image/png'), w: frame.cutWidth, h: frame.cutHeight };
    }
  } catch {
    out = null;
  }
  // only cache hits — textures may appear later
  if (out) phaserCache.set(key, out);
  return out;
}
