/**
 * SCREENS PIXEL ART — ornaments, frames, icons and set pieces for the title,
 * loading, end screens and modals. Everything is drawn with PixelCanvas from
 * the master palette and handed to CSS as data URLs (always shown with
 * `image-rendering: pixelated` at integer multiples of the UI pixel `--px`).
 *
 * Visual identity (shared with the HUD): Ottoman miniature page — parchment,
 * gold rules (cetvel), lapis & turquoise, red seals, tezhip corners.
 * Light from the upper-left.
 *
 * Draw functions are pure (node-safe, used by tests); *Url() helpers touch the DOM.
 */
import { P } from '../../art/palette';
import { bayer, PixelCanvas } from '../../art/pixel';
import { drawLogo, drawLogoGlint, type LogoArt } from './logo';

const GOLD = P.gold;
const INK = P.outline;
export const PAPER = ['#5a4128', '#8a6a42', '#b89a64', '#d8c49a', '#e6d5ae', '#efe2c2', '#f8efd8'] as const;
const LAPIS = ['#0b1230', '#152044', '#1f3266', '#24407a', '#2f5594', '#4a74b4'] as const;
const TURQ = ['#123a3e', '#1d5e60', '#2f9a96', '#56c2b4', '#9ae3d0'] as const;

// ───────────────────────────── string art ─────────────────────────────

const LEG: Record<string, string> = {
  k: INK[1],
  K: INK[0],
  y: GOLD[2],
  Y: GOLD[3],
  g: GOLD[4],
  G: GOLD[5],
  w: GOLD[6],
  '1': P.red[2],
  '2': P.red[3],
  '3': P.red[4],
  '4': P.red[5],
  '5': P.red[6],
  '7': P.green[2],
  '8': P.green[3],
  '9': P.green[4],
  l: LAPIS[1],
  L: LAPIS[2],
  i: LAPIS[3],
  I: LAPIS[4],
  j: LAPIS[5],
  z: TURQ[2],
  Z: TURQ[3],
  p: PAPER[2],
  q: PAPER[3],
  P: PAPER[5],
  W: '#ffffff',
  s: P.steel[2],
  S: P.steel[4],
  T: P.steel[5],
  o: P.wood[2],
  O: P.wood[4],
  u: P.wood[5],
  U: P.wood[6],
  b: P.bronze[3],
  B: P.bronze[5],
  c: P.stone[3],
  C: P.stone[5],
  e: P.stone[6],
  f: P.skin[3],
  F: P.skin[4],
  x: P.cloth[3],
  X: P.cloth[5],
};

export function rows(p: PixelCanvas, r: readonly string[], ox = 0, oy = 0, flipX = false): void {
  for (let y = 0; y < r.length; y++)
    for (let x = 0; x < r[y].length; x++) {
      const ch = r[y][x];
      if (ch === '.' || ch === ' ') continue;
      const c = LEG[ch];
      if (!c) throw new Error(`screens art: unknown char '${ch}'`);
      p.set(ox + (flipX ? r[y].length - 1 - x : x), oy + y, c);
    }
}

function fromRows(r: readonly string[]): PixelCanvas {
  const w = Math.max(...r.map((s) => s.length));
  const p = new PixelCanvas(w, r.length);
  rows(p, r);
  return p;
}

// ───────────────────────────── frames (9-slice) ─────────────────────────────

/** Border-image slice (1× px) of every frame below. */
export const FRAME_SLICE = 10;
export const FRAME_SIZE = 32;

/** Tezhip corner (10×10) drawn into the top-left; mirrored for the others. */
const CORNER_KAGIT = [
  'KKKKKKKKKK',
  'KwGGGGGGGG',
  'KGgggggggg',
  'KGgLLLLLLL',
  'KGgLwGLlll',
  'KGgLGGGLjl',
  'KGgLLGgiLl',
  'KGgLlLiLyy',
  'KGgLljLyGq',
  'KGgLllly.q',
];

/** Parchment panel with an illuminated lapis & gold border. */
export function drawFrameKagit(): PixelCanvas {
  const S = FRAME_SIZE;
  const p = new PixelCanvas(S, S);
  // paper body with soft fibres
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const t = bayer(x, y);
      const n = ((x * 7 + y * 13) % 11) / 11;
      p.set(x, y, n > 0.86 && t > 0.5 ? PAPER[4] : PAPER[5]);
    }
  // border bands (top/bottom/left/right), period 4 for clean tiling
  const band = (i: number, along: number): string => {
    if (i === 0) return INK[0];
    if (i === 1) return GOLD[6];
    if (i === 2) return GOLD[4];
    if (i <= 6) {
      // lapis band with gold dots every 4 px (centre row)
      if (i === 4 && along % 4 === 1) return GOLD[5];
      if ((i === 3 || i === 5) && along % 4 === 1) return LAPIS[3];
      return i === 3 ? LAPIS[2] : i === 6 ? LAPIS[0] : LAPIS[1];
    }
    if (i === 7) return GOLD[2];
    if (i === 8) return GOLD[4];
    if (i === 9) return PAPER[3];
    return '';
  };
  for (let a = 0; a < S; a++)
    for (let i = 0; i < FRAME_SLICE; i++) {
      const c = band(i, a);
      if (!c) continue;
      p.set(a, i, c); // top
      p.set(i, a, c); // left
      // bottom & right: shadow side (darker gold)
      const cb = c === GOLD[6] ? GOLD[4] : c === GOLD[4] && i === 2 ? GOLD[3] : c;
      p.set(a, S - 1 - i, cb);
      p.set(S - 1 - i, a, cb);
    }
  // corners
  const corner = fromRows(CORNER_KAGIT);
  const put = (fx: boolean, fy: boolean) => {
    for (let y = 0; y < 10; y++)
      for (let x = 0; x < 10; x++) {
        const [r, g, b, a] = corner.get(x, y);
        if (!a) continue;
        p.set(fx ? S - 1 - x : x, fy ? S - 1 - y : y, (r << 16) | (g << 8) | b);
      }
  };
  put(false, false);
  put(true, false);
  put(false, true);
  put(true, true);
  return p;
}

/** Night-lapis panel (menus, dark dialogs): ink edge, gold rules, starry dither. */
export function drawFrameGece(): PixelCanvas {
  const S = FRAME_SIZE;
  const p = new PixelCanvas(S, S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) p.set(x, y, bayer(x, y) < 0.18 ? LAPIS[1] : LAPIS[0]);
  for (let a = 0; a < S; a++) {
    const set4 = (i: number, c: string, cShade = c) => {
      p.set(a, i, c);
      p.set(i, a, c);
      p.set(a, S - 1 - i, cShade);
      p.set(S - 1 - i, a, cShade);
    };
    set4(0, INK[0]);
    set4(1, GOLD[5], GOLD[3]);
    set4(2, GOLD[3], GOLD[2]);
    set4(3, INK[1]);
    if (a % 4 === 1) set4(5, GOLD[2]);
    set4(6, LAPIS[1]);
  }
  // corner brackets
  const br = ['KKKKKKK', 'KwGGGGG', 'KGgyyy.', 'KGy.G..', 'KGy.Gw.', 'KGy....', 'KG.....'];
  const c = fromRows(br);
  for (const [fx, fy] of [
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ] as const)
    for (let y = 0; y < c.h; y++)
      for (let x = 0; x < c.w; x++) {
        const [r, g, b, a] = c.get(x, y);
        if (a) p.set(fx ? S - 1 - x : x, fy ? S - 1 - y : y, (r << 16) | (g << 8) | b);
      }
  return p;
}

export type ButtonState = 'normal' | 'hover' | 'basili' | 'pasif' | 'kirmizi';
export const BTN_SLICE = 5;
export const BTN_SIZE = 18;

/** Button 9-slice (18×18, slice 5 → 8×8 tileable centre): bevelled lapis with gold rim; red variant for danger/primary. */
export function drawButton(state: ButtonState): PixelCanvas {
  const S = BTN_SIZE;
  const p = new PixelCanvas(S, S);
  const ramp =
    state === 'pasif'
      ? [P.stone[0], P.stone[1], P.stone[2], P.stone[3]]
      : state === 'kirmizi'
        ? [P.red[1], P.red[2], P.red[3], P.red[4]]
        : state === 'hover'
          ? [LAPIS[1], LAPIS[2], LAPIS[3], LAPIS[4]]
          : [LAPIS[0], LAPIS[1], LAPIS[2], LAPIS[3]];
  const rim = state === 'pasif' ? [P.stone[2], P.stone[4]] : state === 'hover' ? [GOLD[5], GOLD[6]] : [GOLD[3], GOLD[5]];
  const pressed = state === 'basili';
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const edge = x === 0 || y === 0 || x === S - 1 || y === S - 1;
      const corner = (x === 0 || x === S - 1) && (y === 0 || y === S - 1);
      if (corner) continue;
      if (edge) {
        p.set(x, y, INK[0]);
        continue;
      }
      const rimPx = x === 1 || y === 1 || x === S - 2 || y === S - 2;
      if (rimPx) {
        const lit = pressed ? x === S - 2 || y === S - 2 : x === 1 || y === 1;
        p.set(x, y, lit ? rim[1] : rim[0]);
        continue;
      }
      const inner = x === 2 || y === 2 || x === S - 3 || y === S - 3;
      if (inner) {
        const lit = pressed ? x === S - 3 || y === S - 3 : x === 2 || y === 2;
        p.set(x, y, lit ? ramp[3] : ramp[0]);
        continue;
      }
      // body: flat with a 4×4-periodic dither (tiles seamlessly in the 8×8 centre)
      p.set(x, y, pressed ? ramp[1] : bayer(x, y) < 0.25 ? ramp[1] : ramp[2]);
    }
  return p;
}

// ───────────────────────────── textures ─────────────────────────────

/** Tileable parchment (64×64): fibres, mottling, a few darker flecks. */
export function drawPaper(size = 64, ramp: readonly string[] = PAPER): PixelCanvas {
  const p = new PixelCanvas(size, size);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      // low-frequency mottling (tileable sines) — kept subtle: sparse dither only at the extremes
      const m =
        Math.sin((x / size) * Math.PI * 2 * 2 + 1.3) * 0.5 +
        Math.sin((y / size) * Math.PI * 2 * 3 + 0.4) * 0.35 +
        Math.sin(((x + y) / size) * Math.PI * 2 + 2.1) * 0.4 +
        Math.sin(((x - 2 * y) / size) * Math.PI * 2 + 0.7) * 0.3;
      const v = m * 0.4 + 0.5; // ~0..1
      const t = bayer(x, y);
      let c: string = ramp[5];
      if (v > 0.8 && t < (v - 0.8) * 1.2) c = ramp[4];
      else if (v < 0.2 && t < (0.2 - v) * 1.2) c = ramp[6];
      p.set(x, y, c);
    }
  // fibres
  for (let i = 0; i < 22; i++) {
    const x0 = Math.floor(rnd() * size);
    const y0 = Math.floor(rnd() * size);
    const len = 3 + Math.floor(rnd() * 6);
    const dy = rnd() < 0.5 ? 0 : 1;
    for (let k = 0; k < len; k++) p.set((x0 + k) % size, (y0 + (dy ? k >> 2 : 0)) % size, ramp[4]);
  }
  for (let i = 0; i < 10; i++) p.set(Math.floor(rnd() * size), Math.floor(rnd() * size), ramp[3]);
  return p;
}

/** Ink-night tile for dark panels: lapis with sparse stars. */
export function drawNightTile(size = 48): PixelCanvas {
  const p = new PixelCanvas(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) p.set(x, y, bayer(x, y) < 0.12 ? LAPIS[1] : LAPIS[0]);
  const stars = [
    [5, 7], [31, 3], [19, 22], [40, 30], [9, 38], [27, 44], [44, 12],
  ];
  for (const [x, y] of stars) p.set(x, y, LAPIS[3]);
  p.set(19, 22, GOLD[3]);
  return p;
}

// ───────────────────────────── small ornaments ─────────────────────────────

/** Cetvel divider centre piece (rosette between rules), 21×7. */
export function drawDividerCenter(): PixelCanvas {
  return fromRows([
    '.........K.........',
    '........KgK........',
    'gggggggKgwgKggggggg',
    'yyyyyyKg3G3gKyyyyyy',
    '.......KgGgK.......',
    '........KgK........',
    '.........K.........',
  ]);
}

/** Tileable rule for dividers (4×7). */
export function drawDividerTile(): PixelCanvas {
  return fromRows(['....', '....', 'gggg', 'yyyy', '....', '....', '....']);
}

/** Red wax seal (22×22) used for event codes & stamps. */
export function drawSeal(): PixelCanvas {
  const p = new PixelCanvas(22, 22);
  const cx = 10.5;
  const cy = 10.5;
  for (let y = 0; y < 22; y++)
    for (let x = 0; x < 22; x++) {
      const a = Math.atan2(y - cy, x - cx);
      const r = Math.hypot(x - cx, y - cy);
      const R = 9.6 + Math.sin(a * 7) * 0.9; // wobbly wax rim
      if (r > R + 1) continue;
      if (r > R) {
        p.set(x, y, INK[0]);
        continue;
      }
      const lit = (cx - x + cy - y) / 14; // upper-left light
      let c: string = P.red[3];
      if (r > R - 1.6) c = lit > 0.1 ? P.red[5] : P.red[2];
      else if (r < 6.8 && r > 5.6) c = lit > 0 ? P.red[2] : P.red[1]; // impressed ring
      else if (lit > 0.45 && r > 3) c = P.red[4];
      p.set(x, y, c);
    }
  p.set(5, 6, P.red[6]);
  p.set(6, 5, P.red[6]);
  return p;
}

/** Scroll roller (wooden rod with gold knobs): 12×10 end cap + 4×10 tileable rod. */
export function drawRollerEnd(): PixelCanvas {
  return fromRows([
    '..KKKK......',
    '.KGwGgK.....',
    'KGwGggyKKKKK',
    'KwGggyyKOuuU',
    'KGggyyyKoOuu',
    'KgggyyYKooOO',
    'KgyyyYYKoooo',
    '.KyyYYK.KKKK',
    '..KKKK......',
    '............',
  ]);
}
export function drawRollerRod(): PixelCanvas {
  return fromRows(['....', '....', 'KKKK', 'uUuu', 'Ouuu', 'OOOO', 'oooo', 'KKKK', '....', '....']);
}

/** Close (X) icon 9×9. */
export function drawCloseIcon(): PixelCanvas {
  return fromRows([
    'KK.....KK',
    'KGK...KGK',
    '.KGK.KGK.',
    '..KGKGK..',
    '...KGK...',
    '..KGKgK..',
    '.KGK.KgK.',
    'KGK...KgK',
    'KK.....KK',
  ]);
}

/** Menu (☰) icon 11×9 — three gold bars with rosette ends. */
export function drawMenuIcon(): PixelCanvas {
  return fromRows([
    'KKKKKKKKKKK',
    'KwGGGGGGGgK',
    'KKKKKKKKKKK',
    '...........',
    'KKKKKKKKKKK',
    'KwGGGGGGGgK',
    'KKKKKKKKKKK',
    '...........',
    'KKKKKKKKKKK',
    'KwGGGGGGGgK',
    'KKKKKKKKKKK',
  ]);
}

/** Search lens 10×10. */
export function drawSearchIcon(): PixelCanvas {
  return fromRows([
    '..KKKK....',
    '.KjIIjK...',
    'KjIWIIjK..',
    'KIWIIIIK..',
    'KIIIIIIK..',
    '.KiIIiKK..',
    '..KKKKgK..',
    '......KgK.',
    '.......KgK',
    '........K.',
  ]);
}

/** Pointer for the active menu item (tulip-arrow) 8×9. */
export function drawPointer(): PixelCanvas {
  return fromRows([
    'KK......',
    'K3KK....',
    'K43KK...',
    'K4433KK.',
    'K44333gK',
    'K4433KK.',
    'K43KK...',
    'K3KK....',
    'KK......',
  ]);
}

// ───────────────────────────── icons (12×12) ─────────────────────────────

export const ICON_ROWS: Record<string, string[]> = {
  // encyclopedia categories
  kisi: [
    '...KKKKKK...',
    '..KXXXXXXK..',
    '.KXXxXXxXXK.',
    '.KXxXX3XxXK.',
    '..KXXXXXXK..',
    '..KfFFFFfK..',
    '..KfFkFkfK..',
    '...KFFFFK...',
    '..KK3KK3KK..',
    '.K33433433K.',
    'K3343343343K',
    'KKKKKKKKKKKK',
  ],
  yer: [
    '.K.K.KK.K.K.',
    '.KCKCKKCKCK.',
    '.KCCCCCCCeK.',
    '..KCCCCCeK..',
    '..KCCceCcK..',
    '..KCKkKCcK..',
    '..KC2C2CcK..',
    '..KCCCCCcK..',
    '..KCeKKCcK..',
    '..KCKkkKcK..',
    '.KCCKkkKccK.',
    'KKKKKKKKKKKK',
  ],
  olay: [
    '.KKKKKKKKKK.',
    'KOuKPPPPPPKK',
    'KoOKPqqqqPKo',
    '.KKPPPPPPPK.',
    '..KPqqqqqPK.',
    '..KPPPPPPPK.',
    '..KPqqqPPPK.',
    '..KPPPP33PK.',
    '..KPqqP343K.',
    '.KKKKKKK3KK.',
    'KOuuuuuuKoK.',
    '.KKKKKKKKK..',
  ],
  silah: [
    '............',
    '.......KKK..',
    '.....KKbBbK.',
    '...KKbBBBbK.',
    '.KKbBBBBbbK.',
    'KkbBBBbbbK..',
    'KkkbbbbKK...',
    '.KKKKKK.....',
    '..KoOK.KoOK.',
    '.KoKoOKoKoK.',
    '.KoOoKKoOoK.',
    '..KKK...KKK.',
  ],
  kaynak: [
    '..KKKKKKKK..',
    '.K3333333lK.',
    'K3444G4433lK',
    'K34GwGG433K.',
    'K344G44433K.',
    'K34444G433K.',
    'K3444GwG33K.',
    'K34444G433K.',
    'K33333333KK.',
    'KPPPPPPPPK..',
    'KqqqqqqqqK..',
    '.KKKKKKKKK..',
  ],
  kavram: [
    '.....KK.....',
    '....KGgK....',
    '.KK.KGgK.KK.',
    '.KGKKGgKKgK.',
    '..KGKLlKgK..',
    'KKKKLwGlKKKK',
    'KGGGlGgLggyK',
    'KKKKKlLKKKKK',
    '..KgKllKyK..',
    '.KgKKgyKKyK.',
    '.KK.KgyK.KK.',
    '.....KK.....',
  ],
  // menu / misc
  geri: [
    '............',
    '....KK......',
    '...KGK......',
    '..KGgKKKKKK.',
    '.KGggggggggK',
    'KwGgggggggyK',
    '.KGyyyyyyyyK',
    '..KGyKKKKKK.',
    '...KyK......',
    '....KK......',
    '............',
    '............',
  ],
  ayar: [
    '.....KK.....',
    '..KK.KGK.KK.',
    '..KGKKGKKGK.',
    '...KGGGGgK..',
    '.KKGgKKKgyKK',
    'KGGGKllKKgyK',
    'KgygKllKKyyK',
    '.KKgyKKKyyKK',
    '...KyyyyyK..',
    '..KyKKyKKyK.',
    '..KK.KyK.KK.',
    '.....KK.....',
  ],
  kitap: [
    '............',
    '.KKKKK.KKKKK',
    'KPPPPPKPPPPPK',
    'KPqqqPKPqqqPK',
    'KPPPPPKPPPPPK',
    'KPqqqPKPqqPPK',
    'KPPPPPKPPPPPK',
    'KPqqPPKPqqqPK',
    'KPPPPPKPPPPPK',
    'KKKKKKKKKKKKK',
    '.KgggggKgggK.',
    '..KKKKK.KKK..',
  ],
  kayit: [
    'KKKKKKKKKKK.',
    'KiIIIIIIIjKK',
    'KiKXXXXXKjjK',
    'KiKXXXXXKjjK',
    'KiKKKKKKKjjK',
    'KiiiiiiiiiiK',
    'KiKKKKKKKKiK',
    'KiKPPPPPPKiK',
    'KiKPqqqqPKiK',
    'KiKPPPPPPKiK',
    'KiKPqqqPPKiK',
    'KKKKKKKKKKKK',
  ],
  yukle: [
    '....KKKK....',
    '...KGwwGK...',
    '..KGggggGK..',
    '.KKKgggYKKK.',
    '...KgggYK...',
    '...KgyyYK...',
    'KK.KKKKKK.KK',
    'KoK......KoK',
    'KoOKKKKKKOoK',
    'KoOuuuuuuOoK',
    'KoooooooooK.',
    '.KKKKKKKKKK.',
  ],
  baslik: [
    '.....KK.....',
    '....KGgK....',
    '...KGgggK...',
    '..KGgKKgyK..',
    '.KGgK33KgyK.',
    'KGgK3443KgyK',
    'KKK344443KKK',
    '..K3K44K3K..',
    '..K3KkkK3K..',
    '..K3KkkK3K..',
    '..K33KK33K..',
    '..KKKKKKKKK.',
  ],
  oynat: [
    '.KK.........',
    '.KGKK.......',
    '.KGggKK.....',
    '.KGgggGKK...',
    '.KGgggggGKK.',
    '.KGgggggggyK',
    '.KGggggggyyK',
    '.KGgggggyKK.',
    '.KGgggyKK...',
    '.KGgyKK.....',
    '.KyKK.......',
    '.KK.........',
  ],
  tam: [
    'KKKKK..KKKKK',
    'KGggK..KggyK',
    'KgKK....KKyK',
    'KgK......KyK',
    'KK........KK',
    '............',
    '............',
    'KK........KK',
    'KgK......KyK',
    'KgKK....KKyK',
    'KgyyK..KyyyK',
    'KKKKK..KKKKK',
  ],
  ses: [
    '.....KK.....',
    '....KGK..K..',
    '...KGgK...K.',
    'KKKGggK.K..K',
    'KGGgggK..K.K',
    'KGggggK..K.K',
    'KGggggK..K.K',
    'KyyyygK..K.K',
    'KKKyygK.K..K',
    '...KyyK...K.',
    '....KyK..K..',
    '.....KK.....',
  ],
};

export function drawIcon(name: string): PixelCanvas | null {
  const r = ICON_ROWS[name];
  return r ? fromRows(r) : null;
}

/** Horsetail standard (tuğ) with n tails — difficulty emblem (20×30). */
export function drawTug(n: number): PixelCanvas {
  const W = 26;
  const H = 34;
  const p = new PixelCanvas(W, H);
  const cx = 13;
  // pole
  for (let y = 4; y < H; y++) {
    p.set(cx, y, P.wood[4]);
    p.set(cx + 1, y, P.wood[2]);
  }
  // gilded ball finial
  p.disc(cx, 3, 2, GOLD[4]);
  p.set(cx - 1, 2, GOLD[6]);
  p.set(cx, 0, GOLD[5]);
  // cross-bar
  for (let x = cx - 9; x <= cx + 10; x++) {
    p.set(x, 7, GOLD[3]);
    p.set(x, 8, GOLD[2]);
  }
  // tails hanging from the bar (horsehair: white/red/black-brown)
  const offs = n === 1 ? [0] : n === 2 ? [-5, 5] : [-7, 0, 7];
  const hair = [P.cloth[5], P.red[4], P.wood[1]];
  offs.forEach((o, i) => {
    const x0 = cx + o;
    const c = hair[i % 3];
    const dark = c === P.cloth[5] ? P.cloth[3] : c === P.red[4] ? P.red[2] : P.outline[1];
    // knot
    p.rect(x0 - 1, 9, 3, 2, GOLD[4]);
    for (let y = 11; y < 31; y++) {
      const sway = Math.round(Math.sin(y * 0.35 + i) * 0.8);
      const w = y < 14 ? 3 : y < 26 ? 5 : 3;
      for (let k = 0; k < w; k++) {
        const xx = x0 - (w >> 1) + k + sway;
        p.set(xx, y, k === 0 ? c : k === w - 1 ? dark : bayer(xx, y) < 0.5 ? c : dark);
      }
    }
  });
  p.outline(INK[0]);
  return p;
}

// ───────────────────────────── set pieces ─────────────────────────────

export const BANNER_FRAMES = 8;
export const BANNER_W = 52;
export const BANNER_H = 46;

/**
 * Ottoman war banner (sancak) on a pole, waving — 8 frames, 52×46 each.
 * Plain crimson field with a gold fringe and gilded ball finial (no
 * crescent-star: that national flag is much later).
 */
export function drawBannerFrame(f: number): PixelCanvas {
  const p = new PixelCanvas(BANNER_W, BANNER_H);
  const poleX = 4;
  // pole
  for (let y = 4; y < BANNER_H; y++) {
    p.set(poleX, y, P.wood[5]);
    p.set(poleX + 1, y, P.wood[3]);
  }
  p.disc(poleX + 1, 3, 2, GOLD[4]);
  p.set(poleX, 2, GOLD[6]);
  p.set(poleX + 1, 0, GOLD[5]);
  const ph = (f / BANNER_FRAMES) * Math.PI * 2;
  const fw = 42;
  const fh = 22;
  for (let x = 0; x < fw; x++) {
    const u = x / fw;
    const amp = 1 + u * 3.2;
    const wave = Math.sin(u * 5.5 - ph) * amp;
    const slope = Math.cos(u * 5.5 - ph); // shading by slope
    const top = Math.round(6 + wave + u * 1.5);
    const len = Math.round(fh - u * 4 + Math.sin(u * 3 - ph) * 0.8);
    for (let y = 0; y < len; y++) {
      let c: string = P.red[4];
      if (slope > 0.55) c = P.red[5];
      else if (slope > 0.2) c = bayer(x, y) < 0.5 ? P.red[5] : P.red[4];
      else if (slope < -0.55) c = P.red[2];
      else if (slope < -0.2) c = bayer(x, y) < 0.5 ? P.red[3] : P.red[2];
      if (y === 0) c = slope > 0 ? P.red[6] : P.red[4];
      p.set(poleX + 2 + x, top + y, c);
    }
    // gold fringe along the fly edge & bottom
    const by = top + len;
    p.set(poleX + 2 + x, by, x % 2 ? GOLD[4] : GOLD[2]);
    if (x % 2 === 0) p.set(poleX + 2 + x, by + 1, GOLD[3]);
  }
  p.outline(INK[0]);
  return p;
}

/** Loading-screen skyline of Constantinople (silhouette with moon rim light), 320×70. */
export function drawSkyline(w = 320, h = 70): PixelCanvas {
  const p = new PixelCanvas(w, h);
  const base = h - 1;
  const far = LAPIS[1];
  const near = LAPIS[0];
  const rim = '#5a74a8';
  const fill = (x0: number, x1: number, top: (x: number) => number, c: string) => {
    for (let x = Math.max(0, x0); x <= Math.min(w - 1, x1); x++) for (let y = Math.max(0, Math.round(top(x))); y <= base; y++) p.set(x, y, c);
  };
  // hills behind the city
  fill(0, w - 1, (x) => h - 26 - Math.sin(x / 47) * 6 - Math.sin(x / 13 + 1) * 2, far);
  // Ayasofya (no minarets in 1453): shallow ribbed dome on a windowed drum,
  // semi-domes stepping down east & west, heavy buttress masses.
  const ax = Math.round(w * 0.62);
  const half = (cx: number, r: number, hgt: number, baseY: number) => {
    for (let x = cx - r; x <= cx + r; x++) {
      const d = (x - cx) / r;
      const top = baseY - Math.sqrt(Math.max(0, 1 - d * d)) * hgt;
      for (let y = Math.round(top); y <= baseY; y++) p.set(x, y, far);
    }
  };
  fill(ax - 34, ax + 34, () => h - 30, far); // nave block
  fill(ax - 24, ax - 17, () => h - 44, far); // buttress towers
  fill(ax + 17, ax + 24, () => h - 44, far);
  half(ax - 15, 12, 7, h - 36); // west semi-dome
  half(ax + 15, 12, 7, h - 36); // east semi-dome
  fill(ax - 15, ax + 15, () => h - 44, far); // drum
  half(ax, 17, 9, h - 44); // main dome
  for (let x = ax - 14; x <= ax + 14; x += 3) p.set(x, h - 42, '#e8b866'); // drum windows
  for (let x = ax - 12; x <= ax + 12; x += 6) p.set(x, h - 50, rim); // ribs glint
  p.set(ax, h - 54, GOLD[4]);
  // Hagia Irene (smaller dome)
  const ix = ax - 52;
  fill(ix - 12, ix + 12, () => h - 32, far);
  for (let x = ix - 7; x <= ix + 7; x++) {
    const d = (x - ix) / 7;
    for (let y = Math.round(h - 32 - Math.sqrt(Math.max(0, 1 - d * d)) * 6); y < h - 32; y++) p.set(x, y, far);
  }
  // Column of Justinian with statue
  const cxj = ax + 46;
  fill(cxj - 1, cxj, () => h - 58, far);
  fill(cxj - 2, cxj + 1, () => h - 59, far); // capital
  fill(cxj - 1, cxj + 2, () => h - 62, far); // equestrian statue
  p.set(cxj + 3, h - 61, far);
  // houses with tiled roofs
  for (let i = 0; i < 26; i++) {
    const x = (i * 37 + 11) % (w - 20);
    const hh = 6 + ((i * 13) % 7);
    fill(x, x + 8 + (i % 3) * 3, () => h - 22 - hh, far);
  }
  // cypress trees
  for (let i = 0; i < 9; i++) {
    const x = (i * 41 + 23) % w;
    const th = 14 + (i % 3) * 5;
    for (let y = 0; y < th; y++) {
      const half = Math.round(Math.sin((y / th) * Math.PI) * 2.2);
      for (let k = -half; k <= half; k++) p.set(x + k, h - 20 - th + y, far);
    }
  }
  // Theodosian walls in front: outer + inner wall with towers (nearest, darkest)
  const wallTop = h - 18;
  fill(0, w - 1, () => wallTop, near);
  for (let x = 0; x < w; x += 2) p.set(x, wallTop - 1, near); // crenellation
  for (let tx = 8; tx < w; tx += 28) {
    const sq = (tx / 28) % 2 === 0;
    const tw = sq ? 10 : 12;
    fill(tx, tx + tw, () => wallTop - 12, near);
    for (let x = tx; x <= tx + tw; x += 2) p.set(x, wallTop - 13, near);
    // lit arrow slit
    if ((tx / 28) % 3 === 1) {
      p.set(tx + (tw >> 1), wallTop - 8, '#f8902a');
      p.set(tx + (tw >> 1), wallTop - 7, '#e0541a');
    }
  }
  // brick band hint (deep red) across the wall face
  for (let x = 0; x < w; x++) if (bayer(x, 0) < 0.5) p.set(x, wallTop + 5, '#2a1220');
  // moon rim light on the upper-left edges of the silhouette
  for (let y = 1; y < h; y++)
    for (let x = 1; x < w; x++) {
      const [, , , a] = p.get(x, y);
      if (!a) continue;
      const [, , , au] = p.get(x, y - 1);
      if (!au && bayer(x, y) < 0.85) p.set(x, y, rim);
    }
  return p;
}

/** Twinkling sparkle strip: 6 frames of 7×7 (dot → star → dot). */
export function drawSparkleStrip(): PixelCanvas {
  const frames = [
    ['.......', '.......', '.......', '...w...', '.......', '.......', '.......'],
    ['.......', '.......', '...G...', '..GwG..', '...G...', '.......', '.......'],
    ['.......', '...G...', '...w...', '.GwWwG.', '...w...', '...G...', '.......'],
    ['...G...', '...w...', '..GwG..', 'GwwWwwG', '..GwG..', '...w...', '...G...'],
    ['.......', '...G...', '...w...', '.GwWwG.', '...w...', '...G...', '.......'],
    ['.......', '.......', '...G...', '..GwG..', '...G...', '.......', '.......'],
  ];
  const p = new PixelCanvas(7 * frames.length, 7);
  frames.forEach((fr, i) => rows(p, fr, i * 7, 0));
  return p;
}

/** Large tezhip corner ornament (28×28) for the end-screen page (top-left; mirror for others). */
export function drawPageCorner(): PixelCanvas {
  const p = new PixelCanvas(28, 28);
  // quarter rosette: concentric gold/lapis arcs
  for (let y = 0; y < 28; y++)
    for (let x = 0; x < 28; x++) {
      const r = Math.hypot(x, y);
      const a = Math.atan2(y, x);
      const petal = Math.abs(Math.sin(a * 4)) * 3;
      if (r < 6) p.set(x, y, r < 4 ? P.red[4] : GOLD[5]);
      else if (r < 13 + petal) p.set(x, y, r < 7 ? INK[0] : r > 12 + petal ? GOLD[4] : (x + y) % 3 === 0 ? LAPIS[3] : LAPIS[2]);
      else if (r < 14.5 + petal) p.set(x, y, GOLD[3]);
      else if (r < 15.5 + petal) p.set(x, y, INK[0]);
    }
  // small leaf tips along the axes
  for (let i = 0; i < 9; i++) {
    p.set(18 + i, 1, GOLD[4]);
    p.set(1, 18 + i, GOLD[4]);
    p.set(18 + i, 2, GOLD[2]);
    p.set(2, 18 + i, GOLD[2]);
  }
  p.set(1, 1, GOLD[6]);
  p.set(4, 4, GOLD[6]);
  return p;
}

/** Drop-cap tile (lapis square with gold rim & corner florets), 24×24. */
export function drawDropCap(): PixelCanvas {
  const p = new PixelCanvas(24, 24);
  for (let y = 0; y < 24; y++)
    for (let x = 0; x < 24; x++) {
      const e = Math.min(x, y, 23 - x, 23 - y);
      let c: string;
      if (e === 0) c = INK[0];
      else if (e === 1) c = x < 12 && y < 12 ? GOLD[6] : GOLD[4];
      else if (e === 2) c = GOLD[2];
      else c = (x * 3 + y * 5) % 7 === 0 ? LAPIS[2] : LAPIS[1];
      p.set(x, y, c);
    }
  for (const [x, y] of [
    [4, 4],
    [19, 4],
    [4, 19],
    [19, 19],
  ]) {
    p.set(x, y, GOLD[5]);
    p.set(x - 1, y, GOLD[3]);
    p.set(x + 1, y, GOLD[3]);
    p.set(x, y - 1, GOLD[3]);
    p.set(x, y + 1, GOLD[3]);
  }
  return p;
}

// ───────────────────────────── DOM helpers (cached data URLs) ─────────────────────────────

const urlCache = new Map<string, string>();

export function toUrl(p: PixelCanvas): string {
  return p.toCanvas().toDataURL('image/png');
}

/** Cached data URL by key (draw runs once per page). */
export function artUrl(key: string, draw: () => PixelCanvas): string {
  let u = urlCache.get(key);
  if (!u) {
    u = toUrl(draw());
    urlCache.set(key, u);
  }
  return u;
}

let logoCache: { logo: LogoArt; url: string; glint: string; frames: number } | null = null;
export function logoArt(): { logo: LogoArt; url: string; glint: string; frames: number } {
  if (!logoCache) {
    const logo = drawLogo();
    const frames = 18;
    logoCache = { logo, url: toUrl(logo.canvas), glint: toUrl(drawLogoGlint(logo, frames)), frames };
  }
  return logoCache;
}

export function bannerStripUrl(): string {
  return artUrl('banner-strip', () => {
    const strip = new PixelCanvas(BANNER_W * BANNER_FRAMES, BANNER_H);
    for (let f = 0; f < BANNER_FRAMES; f++) strip.blit(drawBannerFrame(f), f * BANNER_W, 0);
    return strip;
  });
}

export function iconUrl(name: string): string {
  return artUrl('icon-' + name, () => drawIcon(name) ?? new PixelCanvas(1, 1));
}

/**
 * CSS custom properties with every shared ornament (install once on :root).
 * Documented in ui-kit.css — the HUD may reuse them.
 */
export function uiKitCssVars(): Record<string, string> {
  const u = (k: string, d: () => PixelCanvas) => `url(${artUrl(k, d)})`;
  return {
    '--uk-cerceve-kagit': u('frame-kagit', drawFrameKagit),
    '--uk-cerceve-gece': u('frame-gece', drawFrameGece),
    '--uk-btn': u('btn-normal', () => drawButton('normal')),
    '--uk-btn-hover': u('btn-hover', () => drawButton('hover')),
    '--uk-btn-basili': u('btn-basili', () => drawButton('basili')),
    '--uk-btn-pasif': u('btn-pasif', () => drawButton('pasif')),
    '--uk-btn-kirmizi': u('btn-kirmizi', () => drawButton('kirmizi')),
    '--uk-kagit': u('paper', () => drawPaper()),
    '--uk-gece': u('night', () => drawNightTile()),
    '--uk-ayrac': u('div-tile', drawDividerTile),
    '--uk-ayrac-orta': u('div-center', drawDividerCenter),
    '--uk-muhur': u('seal', drawSeal),
    '--uk-kapat': u('close', drawCloseIcon),
    '--uk-isaret': u('pointer', drawPointer),
    '--uk-bas-harf': u('dropcap', drawDropCap),
    '--uk-kivilcim': u('sparkle', drawSparkleStrip),
    '--uk-merdane-uc': u('roller-end', drawRollerEnd),
    '--uk-merdane': u('roller-rod', drawRollerRod),
    '--uk-kose': u('page-corner', drawPageCorner),
  };
}

let installed = false;
/** Install the ui-kit CSS variables on <html> (idempotent). */
export function installUiKit(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  const vars = uiKitCssVars();
  for (const [k, v] of Object.entries(vars)) document.documentElement.style.setProperty(k, v);
}
