/**
 * LOGOTYPE — "İSTANBUL'UN FETHİ · 1453" drawn as crisp pixel art.
 *
 * A hand-made display font (cap height 12, Roman-style thick/thin stems with
 * serifs) is rasterised into a 1-bit mask, then styled like gilded lettering in
 * an Ottoman manuscript: metallic gold ramp with a horizon line, upper-left
 * bevel light, double dark outline and a deep red drop shadow. Underneath, an
 * illuminated band (cetvel rules, rûmî scrolls, tulip buds) carries a lapis
 * şemse medallion with the year.
 *
 * Pure PixelCanvas code (node-safe) — the DOM helpers live in art.ts.
 */
import { P } from '../../art/palette';
import { bayer, PixelCanvas } from '../../art/pixel';

/** Cap height of the display font (rows). Accent rows sit above (negative y). */
export const CAP = 12;
const ACCENT = 4;

type Glyph = { rows: string[]; accent?: string[] };

const G: Record<string, Glyph> = {
  A: {
    rows: [
      '.....XXX.....',
      '.....XXXX....',
      '....XX.XX....',
      '....XX.XXX...',
      '...XX...XX...',
      '...XX...XXX..',
      '..XXXXXXXXX..',
      '..XX.....XXX.',
      '.XX......XXX.',
      '.XX.......XXX',
      'XXXX.....XXXX',
      'XXXX....XXXXX',
    ],
  },
  B: {
    rows: [
      'XXXXXXXXX...',
      '.XXX....XX..',
      '.XXX.....XX.',
      '.XXX.....XX.',
      '.XXX....XX..',
      '.XXXXXXXX...',
      '.XXX....XXX.',
      '.XXX.....XXX',
      '.XXX.....XXX',
      '.XXX.....XXX',
      '.XXX....XXX.',
      'XXXXXXXXXX..',
    ],
  },
  E: {
    rows: [
      'XXXXXXXXXXX',
      '.XXX.....XX',
      '.XXX......X',
      '.XXX.......',
      '.XXX...X...',
      '.XXXXXXXX..',
      '.XXX...X...',
      '.XXX.......',
      '.XXX......X',
      '.XXX.....XX',
      '.XXX....XXX',
      'XXXXXXXXXXX',
    ],
  },
  F: {
    rows: [
      'XXXXXXXXXXX',
      '.XXX.....XX',
      '.XXX......X',
      '.XXX.......',
      '.XXX...X...',
      '.XXXXXXXX..',
      '.XXX...X...',
      '.XXX.......',
      '.XXX.......',
      '.XXX.......',
      '.XXX.......',
      'XXXXX......',
    ],
  },
  H: {
    rows: [
      'XXXXX...XXXXX',
      '.XXX.....XXX.',
      '.XXX.....XXX.',
      '.XXX.....XXX.',
      '.XXX.....XXX.',
      '.XXXXXXXXXXX.',
      '.XXX.....XXX.',
      '.XXX.....XXX.',
      '.XXX.....XXX.',
      '.XXX.....XXX.',
      '.XXX.....XXX.',
      'XXXXX...XXXXX',
    ],
  },
  I: {
    rows: [
      'XXXXXXX',
      '.XXXXX.',
      '..XXX..',
      '..XXX..',
      '..XXX..',
      '..XXX..',
      '..XXX..',
      '..XXX..',
      '..XXX..',
      '..XXX..',
      '.XXXXX.',
      'XXXXXXX',
    ],
  },
  L: {
    rows: [
      'XXXXX......',
      '.XXX.......',
      '.XXX.......',
      '.XXX.......',
      '.XXX.......',
      '.XXX.......',
      '.XXX.......',
      '.XXX.......',
      '.XXX......X',
      '.XXX.....XX',
      '.XXX....XXX',
      'XXXXXXXXXXX',
    ],
  },
  N: {
    rows: [
      'XXXX....XXXX',
      '.XXX.....XX.',
      '.XXXX....XX.',
      '.XXXXX...XX.',
      '.XX.XXX..XX.',
      '.XX..XXX.XX.',
      '.XX...XXXXX.',
      '.XX....XXXX.',
      '.XX.....XXX.',
      '.XX......XX.',
      '.XX.......X.',
      'XXXX......X.',
    ],
  },
  S: {
    rows: [
      '...XXXXX.XX',
      '.XXX...XXXX',
      'XXX......XX',
      'XXX.......X',
      'XXXXX......',
      '.XXXXXXX...',
      '...XXXXXXX.',
      '.......XXXX',
      'X.......XXX',
      'XX......XXX',
      'XXXX...XXX.',
      'XX.XXXXX...',
    ],
  },
  T: {
    rows: [
      'XXXXXXXXXXX',
      'XX..XXX..XX',
      'X...XXX...X',
      '....XXX....',
      '....XXX....',
      '....XXX....',
      '....XXX....',
      '....XXX....',
      '....XXX....',
      '....XXX....',
      '...XXXXX...',
      '..XXXXXXX..',
    ],
  },
  U: {
    rows: [
      'XXXXX...XXXX',
      '.XXX.....XX.',
      '.XXX.....XX.',
      '.XXX.....XX.',
      '.XXX.....XX.',
      '.XXX.....XX.',
      '.XXX.....XX.',
      '.XXX.....XX.',
      '.XXX.....XX.',
      '.XXXX...XXX.',
      '..XXXXXXXX..',
      '....XXXXX...',
    ],
  },
  "'": { rows: ['.XXX', '.XXX', '..XX', '.XX.', 'XX..', '....', '....', '....', '....', '....', '....', '....'] },
  ' ': { rows: Array.from({ length: CAP }, () => '.....') },
  '1': {
    rows: [
      '..XXX..',
      '.XXXX..',
      'XXXXX..',
      '..XXX..',
      '..XXX..',
      '..XXX..',
      '..XXX..',
      '..XXX..',
      '..XXX..',
      '..XXX..',
      '.XXXXX.',
      'XXXXXXX',
    ],
  },
  '4': {
    rows: [
      '.....XXXX..',
      '....XXXXX..',
      '...XX.XXX..',
      '...XX.XXX..',
      '..XX..XXX..',
      '.XX...XXX..',
      'XX....XXX..',
      'XXXXXXXXXXX',
      '......XXX..',
      '......XXX..',
      '.....XXXXX.',
      '....XXXXXXX',
    ],
  },
  '5': {
    rows: [
      '.XXXXXXXXXX',
      '.XXX.....XX',
      '.XXX.......',
      '.XXX.......',
      '.XXXXXXXX..',
      '.XX....XXX.',
      '........XXX',
      '........XXX',
      'X.......XXX',
      'XX......XXX',
      'XXX....XXX.',
      '.XXXXXXXX..',
    ],
  },
  '3': {
    rows: [
      '..XXXXXXX..',
      '.XXX...XXX.',
      'XXX.....XXX',
      '........XXX',
      '.......XXX.',
      '....XXXXX..',
      '.......XXX.',
      '........XXX',
      'X.......XXX',
      'XX......XXX',
      'XXX....XXX.',
      '.XXXXXXXX..',
    ],
  },
};
// Dotted capital İ: a lozenge dot (ornamental, like an illuminated diacritic).
G['İ'] = { rows: G.I.rows, accent: ['...X...', '..XXX..', '...X...', '.......'] };

export function glyphFor(ch: string): Glyph | undefined {
  return G[ch];
}

/** True if every char of `text` has a glyph. */
export function canRender(text: string): boolean {
  return [...text].every((c) => !!G[c]);
}

export interface TextMask {
  w: number;
  h: number;
  /** 1 = ink. Row-major. y=0 is the top of the ACCENT area. */
  bits: Uint8Array;
  /** Letter boxes (x of each glyph start) for sparkle placement. */
  boxes: { ch: string; x: number; w: number }[];
}

/** Rasterise text into a 1-bit mask (cap at rows ACCENT..ACCENT+CAP-1). */
export function textMask(text: string, spacing = 1): TextMask {
  const chars = [...text];
  let w = 0;
  const boxes: TextMask['boxes'] = [];
  for (let i = 0; i < chars.length; i++) {
    const g = G[chars[i]];
    if (!g) throw new Error(`logo: no glyph for '${chars[i]}'`);
    const gw = Math.max(...g.rows.map((r) => r.length));
    boxes.push({ ch: chars[i], x: w, w: gw });
    w += gw + (i < chars.length - 1 ? spacing : 0);
  }
  const h = ACCENT + CAP;
  const bits = new Uint8Array(w * h);
  for (const b of boxes) {
    const g = G[b.ch];
    g.rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) if (row[x] === 'X') bits[(ACCENT + y) * w + b.x + x] = 1;
    });
    g.accent?.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) if (row[x] === 'X') bits[y * w + b.x + x] = 1;
    });
  }
  return { w, h, bits, boxes };
}

const GOLD = P.gold;

/**
 * Paint a mask as gilded lettering at (ox, oy). The gold ramp is metallic:
 * bright crown, a darker "horizon" line at mid-cap, a warm reflection below.
 */
export function paintGilded(p: PixelCanvas, m: TextMask, ox: number, oy: number, opts: { shadow?: boolean } = {}): void {
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < m.w && y < m.h ? m.bits[y * m.w + x] : 0);
  // dilated masks: ring1 = 8-neighbour halo, ring2 = 2-px halo
  const near = (x: number, y: number, r: number) => {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (r === 2 && Math.abs(dx) === 2 && Math.abs(dy) === 2) continue;
        if (at(x + dx, y + dy)) return true;
      }
    return false;
  };
  // 1. drop shadow (deep red ink) — the 2-px halo shifted down-right
  if (opts.shadow !== false) {
    for (let y = -2; y < m.h + 5; y++)
      for (let x = -2; x < m.w + 4; x++) if (!near(x, y, 2) && near(x - 1, y - 2, 2)) p.set(ox + x, oy + y, P.red[0]);
  }
  // 2. inner outline (dark bronze) and outer outline (ink)
  for (let y = -2; y < m.h + 2; y++)
    for (let x = -2; x < m.w + 2; x++) {
      if (at(x, y)) continue;
      if (near(x, y, 1)) p.set(ox + x, oy + y, GOLD[1]);
      else if (near(x, y, 2)) p.set(ox + x, oy + y, P.outline[0]);
    }
  // 3. metallic fill
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++) {
      if (!at(x, y)) continue;
      const cy = y - ACCENT; // cap-relative row
      let c: string;
      const t = bayer(x, y);
      if (cy < 0) c = GOLD[5];
      else if (cy <= 1) c = GOLD[6];
      else if (cy <= 3) c = t < 0.5 ? GOLD[6] : GOLD[5];
      else if (cy <= 4) c = GOLD[5];
      else if (cy === 5) c = t < 0.5 ? GOLD[5] : GOLD[4];
      else if (cy === 6) c = GOLD[3]; // horizon
      else if (cy === 7) c = t < 0.5 ? GOLD[3] : GOLD[4];
      else if (cy <= 9) c = GOLD[4];
      else if (cy === 10) c = t < 0.5 ? GOLD[4] : GOLD[5];
      else c = GOLD[5];
      // bevel: light from upper-left
      const ul = !at(x - 1, y) || !at(x, y - 1);
      const dr = !at(x + 1, y) || !at(x, y + 1);
      if (ul && !dr) c = cy < 6 ? GOLD[6] : GOLD[5];
      else if (dr && !ul) c = cy < 6 ? GOLD[4] : GOLD[2];
      else if (dr && ul) c = GOLD[4];
      p.set(ox + x, oy + y, c);
    }
  // 4. specular glints on the crowns of stems
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++) {
      if (!at(x, y) || at(x, y - 1) || at(x - 1, y)) continue;
      if (at(x + 1, y) && at(x, y + 1)) p.set(ox + x, oy + y, '#ffffff');
    }
}

// ───────────────────────────── ornaments ─────────────────────────────

/** A rûmî spiral curl (dir +1 curls right, −1 left), ~9×7. */
function rumiCurl(p: PixelCanvas, x: number, y: number, dir: 1 | -1, c1: string, c2: string): void {
  const pts: [number, number][] = [];
  for (let i = 0; i < 40; i++) {
    const a = i * 0.36;
    const r = 6 - i * 0.13;
    pts.push([Math.round(x + dir * Math.cos(a) * r), Math.round(y - Math.sin(a) * r * 0.85)]);
  }
  for (const [px, py] of pts) p.set(px, py, c1);
  p.set(pts[pts.length - 1][0], pts[pts.length - 1][1], c2);
}

/** Small tulip bud (lâle) 5×7, pointing up. */
function tulip(p: PixelCanvas, cx: number, by: number, flip = false): void {
  const d = flip ? -1 : 1;
  const rows = ['.r.r.', 'rRrRr', 'rRRRr', '.rRr.', '..g..', '.g.g.'];
  rows.forEach((row, j) => {
    for (let i = 0; i < 5; i++) {
      const ch = row[i];
      if (ch === '.') continue;
      const c = ch === 'r' ? P.red[4] : ch === 'R' ? P.red[5] : P.green[4];
      p.set(cx - 2 + i, by + (d > 0 ? j - 5 : 5 - j), c);
    }
  });
}

/** Eight-pointed star rosette (common in Ottoman geometric ornament). */
function rosette(p: PixelCanvas, cx: number, cy: number): void {
  const pts = [
    [0, -3], [0, 3], [-3, 0], [3, 0], [-2, -2], [2, -2], [-2, 2], [2, 2],
  ];
  for (const [dx, dy] of pts) p.set(cx + dx, cy + dy, GOLD[4]);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) p.set(cx + dx, cy + dy, GOLD[5]);
  p.set(cx, cy, P.red[4]);
  p.set(cx - 1, cy - 1, GOLD[6]);
}

/** Lapis şemse (almond medallion) with gold rim; returns its inner box. */
function semse(p: PixelCanvas, cx: number, cy: number, hw: number, hh: number): void {
  for (let y = -hh - 2; y <= hh + 2; y++)
    for (let x = -hw - 18; x <= hw + 18; x++) {
      // lens: rectangle with pointed ends
      const ex = Math.abs(x) - hw;
      const inside = (r: number) => (ex <= 0 ? Math.abs(y) <= hh + r : Math.abs(y) <= hh + r - ex * 0.9);
      if (inside(2)) {
        let c: string = P.outline[0];
        if (inside(1)) c = GOLD[2];
        if (inside(0)) c = GOLD[5];
        if (inside(-1)) c = P.blue[1];
        if (inside(-2)) c = (x + y) & 1 ? P.blue[1] : P.blue[2];
        if (inside(-3)) c = P.night[1];
        if (c === GOLD[5] && (y < 0 || x < 0)) c = GOLD[6];
        p.set(cx + x, cy + y, c);
      }
    }
}

export interface LogoArt {
  canvas: PixelCanvas;
  /** Glyph pixels suited for sparkles (bright crown pixels). */
  sparkles: [number, number][];
  /** Text box within the canvas. */
  text: { x: number; y: number; w: number; h: number };
}

/** Compose the full logotype. Width ≈ 230, height ≈ 48 (1× pixels). */
export function drawLogo(title = "İSTANBUL'UN FETHİ", year = '1453'): LogoArt {
  const m = textMask(title);
  const ym = textMask(year);
  const padX = 14;
  const W = m.w + padX * 2;
  const textY = 3;
  const bandY = textY + m.h + 15; // centre line of the band
  const H = bandY + 14;
  const p = new PixelCanvas(W, H);

  // ── illuminated band ──
  const x0 = 4;
  const x1 = W - 5;
  const mid = W >> 1;
  for (let x = x0 + 6; x <= x1 - 6; x++) {
    p.set(x, bandY - 2, GOLD[5]);
    p.set(x, bandY - 1, GOLD[2]);
    p.set(x, bandY + 2, GOLD[4]);
    p.set(x, bandY + 3, GOLD[1]);
    // lapis inlay between the rules, with gold dots
    p.set(x, bandY, P.blue[2]);
    p.set(x, bandY + 1, P.blue[1]);
    if ((x - mid) % 4 === 0) p.set(x, bandY, GOLD[5]);
  }
  rumiCurl(p, x0 + 5, bandY, -1, GOLD[4], GOLD[6]);
  rumiCurl(p, x1 - 5, bandY, 1, GOLD[4], GOLD[6]);
  // tulips & rosettes along the band
  const quarter = (mid - x0) / 2;
  for (const s of [-1, 1]) {
    const qx = Math.round(mid + s * quarter * 1.25);
    rosette(p, qx, bandY + 1);
    tulip(p, Math.round(mid + s * quarter * 0.62), bandY - 3);
    tulip(p, Math.round(mid + s * quarter * 1.75), bandY - 3);
  }
  // central şemse medallion with the year
  const mhw = (ym.w >> 1) + 2;
  semse(p, mid, bandY + 1, mhw, 10);
  // year digits: small gilded numerals (cap height 12 is too tall → use mask as is, medallion fits)
  paintGilded(p, ym, mid - (ym.w >> 1), bandY + 1 - 4 - 6, { shadow: false });

  // ── title text ──
  paintGilded(p, m, padX, textY);

  // small crowning ornament above the apostrophe gap: none — keep the top clean.

  // sparkle candidates: top-left crown pixels of the glyphs
  const sparkles: [number, number][] = [];
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++) {
      const on = m.bits[y * m.w + x];
      if (!on) continue;
      const up = y > 0 ? m.bits[(y - 1) * m.w + x] : 0;
      const left = x > 0 ? m.bits[y * m.w + x - 1] : 0;
      if (!up && !left) sparkles.push([padX + x, textY + y]);
    }
  return { canvas: p, sparkles, text: { x: padX, y: textY, w: m.w, h: m.h } };
}

/**
 * Glint strip: `frames` frames of the logo's glyph pixels lit by a diagonal
 * band sweeping left→right (+1 trailing empty frame). Transparent elsewhere.
 */
export function drawLogoGlint(logo: LogoArt, frames = 16): PixelCanvas {
  const W = logo.canvas.w;
  const H = logo.canvas.h;
  const strip = new PixelCanvas(W * (frames + 1), H);
  const src = logo.canvas;
  const span = W + H;
  for (let f = 0; f < frames; f++) {
    const pos = -H + (span * (f + 0.5)) / frames;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const [r, g, b, a] = src.get(x, y);
        if (a < 255) continue;
        // only bright gold pixels catch the light (skip outlines/shadows)
        if (r < 0xb0 || g < 0x80) continue;
        const d = x + y * 0.6 - pos;
        if (d >= 0 && d < 3) strip.set(f * W + x, y, d < 1.5 ? '#ffffff' : GOLD[6]);
        else if (d >= 3 && d < 4) strip.set(f * W + x, y, GOLD[6], 0.6);
      }
  }
  return strip;
}
