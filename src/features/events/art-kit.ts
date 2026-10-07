import { P } from '../../art/palette';
import { bayer, PixelCanvas, type Color } from '../../art/pixel';
import { hash2 } from '../../core/rng';

/**
 * MINIATURE KIT — helpers to paint small Ottoman-miniature-style illustrations
 * (flat perspective, gold skies, scroll clouds, outlined figures, decorative
 * frame that elements may "break"). Pure PixelCanvas — no Phaser.
 *
 * Canvas 160×96. Frame occupies the outer 6 px; the picture lives in IN.
 */
export const W = 160;
export const H = 96;
export const IN = { x0: 6, y0: 6, x1: 153, y1: 89 } as const;

/** PixelCanvas with an optional clip rectangle (inclusive). */
export class Mini extends PixelCanvas {
  clip: { x0: number; y0: number; x1: number; y1: number } | null = { ...IN };
  constructor(public f = 0) {
    super(W, H);
  }
  override set(x: number, y: number, c: Color, alpha = 1): void {
    const k = this.clip;
    if (k && (x < k.x0 || y < k.y0 || x > k.x1 || y > k.y1)) return;
    super.set(x, y, c, alpha);
  }
  /** Elements that break the frame: drawn AFTER the frame, unclipped. */
  readonly overlays: (() => void)[] = [];
  free(fn: () => void): void {
    this.overlays.push(fn);
  }
  /** Run fn without clipping, immediately. */
  unclipped(fn: () => void): void {
    const k = this.clip;
    this.clip = null;
    fn();
    this.clip = k;
  }
}

export type Ramp = readonly string[];
const O = P.outline[0];
const O2 = P.outline[1];

/** Draw into a temporary canvas, outline it, and blit at (x,y) (top-left of the temp, outline included). */
export function sprite(c: PixelCanvas, x: number, y: number, w: number, h: number, draw: (s: PixelCanvas) => void, outline: Color | null = O2): void {
  const s = new PixelCanvas(w + 2, h + 2);
  draw(s);
  if (outline != null) s.outline(outline);
  c.blit(s, x - 1, y - 1);
}

/** Vertical dithered gradient across a ramp segment. */
export function vgrad(c: PixelCanvas, x0: number, y0: number, x1: number, y1: number, cols: readonly string[]): void {
  const n = cols.length - 1;
  for (let y = y0; y <= y1; y++) {
    const t = (y - y0) / Math.max(1, y1 - y0);
    const ft = t * n;
    const i = Math.min(n - 1, Math.floor(ft));
    const fr = ft - i;
    for (let x = x0; x <= x1; x++) c.set(x, y, bayer(x, y) < fr ? cols[i + 1] : cols[i]);
  }
}

// ───────────────────────────── Skies ─────────────────────────────

/** Burnished gold-leaf sky with tooled dots, moving glints and scroll clouds. Fills down to the picture bottom. */
export function goldSky(c: Mini, yBottom: number, clouds: [number, number, number][] = []): void {
  vgrad(c, IN.x0, IN.y0, IN.x1, yBottom, [P.gold[5], P.gold[4], P.gold[4], P.gold[3]]);
  c.rect(IN.x0, yBottom + 1, IN.x1 - IN.x0 + 1, IN.y1 - yBottom, P.gold[3]);
  // tooled gilding: regular punched dots
  for (let y = IN.y0 + 2; y < yBottom - 1; y += 4)
    for (let x = IN.x0 + 2 + ((y >> 2) & 1) * 2; x < IN.x1; x += 4) c.set(x, y, y < yBottom * 0.5 ? P.gold[6] : P.gold[5], 0.35);
  // light glints that wander across the leaf with the frame
  for (let i = 0; i < 4; i++) {
    const gx = IN.x0 + 8 + Math.floor(hash2(i, 21, 5) * (IN.x1 - IN.x0 - 16));
    const gy = IN.y0 + 3 + Math.floor(hash2(i, 22, 5) * Math.max(1, yBottom - IN.y0 - 8));
    if ((i + c.f) % 4 !== 0) continue;
    c.set(gx, gy, P.gold[6]);
    c.set(gx - 1, gy, P.gold[6], 0.6);
    c.set(gx + 1, gy, P.gold[6], 0.6);
    c.set(gx, gy - 1, P.gold[6], 0.6);
    c.set(gx, gy + 1, P.gold[6], 0.6);
  }
  for (const [x, y, w] of clouds) scrollCloud(c, x, y, w);
}

/** "Çintemani" ribbon cloud of Ottoman/Persian painting: a wavy white band with curled ends and lapis contour. */
export function scrollCloud(c: PixelCanvas, x: number, y: number, w: number): void {
  sprite(
    c,
    x,
    y,
    w + 6,
    9,
    (s) => {
      const mid = 4;
      for (let i = 0; i <= w; i++) {
        const cy = mid + Math.round(Math.sin(i * 0.42) * 1.4);
        s.set(i + 3, cy - 1, P.cloth[5]);
        s.set(i + 3, cy, P.cloth[5]);
        s.set(i + 3, cy + 1, P.blue[5]);
        if (i % 7 === 3) {
          s.disc(i + 3, cy - 1, 2, P.cloth[5]);
          s.set(i + 3, cy - 3, P.cloth[4]);
        }
      }
      // curls (hollow rings) at both ends
      for (const [cx, cy] of [
        [2, mid + Math.round(Math.sin(0) * 1.4)],
        [w + 4, mid + Math.round(Math.sin(w * 0.42) * 1.4)],
      ]) {
        s.disc(cx, cy, 2, P.cloth[5]);
        s.set(cx, cy, P.blue[4]);
      }
    },
    P.blue[2],
  );
}

/** Deep lapis night sky with twinkling gold stars. */
export function nightSky(c: Mini, yBottom: number, f: number, seed = 1): void {
  vgrad(c, IN.x0, IN.y0, IN.x1, yBottom, [P.night[0], P.night[1], P.night[2], P.night[3]]);
  c.rect(IN.x0, yBottom + 1, IN.x1 - IN.x0 + 1, IN.y1 - yBottom, P.night[3]);
  for (let i = 0; i < 46; i++) {
    const x = IN.x0 + 2 + Math.floor(hash2(i, 3, seed) * (IN.x1 - IN.x0 - 4));
    const y = IN.y0 + 1 + Math.floor(hash2(i, 7, seed) * (yBottom - IN.y0 - 6));
    const tw = (Math.floor(hash2(i, 11, seed) * 4) + f) % 4;
    const big = hash2(i, 13, seed) > 0.78;
    const col = tw === 0 ? P.gold[6] : tw === 1 ? P.gold[5] : P.gold[4];
    c.set(x, y, col);
    if (big && tw < 2) {
      c.set(x - 1, y, P.gold[3]);
      c.set(x + 1, y, P.gold[3]);
      c.set(x, y - 1, P.gold[3]);
      c.set(x, y + 1, P.gold[3]);
    }
  }
}

export function stormSky(c: Mini, yBottom: number, f: number): void {
  vgrad(c, IN.x0, IN.y0, IN.x1, yBottom, [P.smoke[2], P.smoke[3], P.smoke[4], P.smoke[3]]);
  c.rect(IN.x0, yBottom + 1, IN.x1 - IN.x0 + 1, IN.y1 - yBottom, P.smoke[3]);
  for (let i = 0; i < 7; i++) {
    const x = IN.x0 + 4 + i * 22 + ((f * 2 + i * 5) % 6);
    const y = IN.y0 + 3 + (i % 3) * 5;
    puffCloud(c, x, y, 7 + (i % 3) * 2, [P.smoke[1], P.smoke[2], P.smoke[3], P.smoke[4]]);
  }
}

// ───────────────────────────── Land & water ─────────────────────────────

/** Filled hill band. `top(x)` gives the ridge y; fills to yBottom. Miniature tufts & flowers. */
export function hill(c: PixelCanvas, x0: number, x1: number, top: (x: number) => number, yBottom: number, ramp: Ramp, seed = 0, flowers = true): void {
  const n = ramp.length;
  for (let x = x0; x <= x1; x++) {
    const ty = Math.round(top(x));
    for (let y = ty; y <= yBottom; y++) {
      const depth = y - ty;
      const col = depth === 0 ? ramp[0] : depth === 1 ? ramp[n - 1] : depth < 4 ? ramp[n - 2] : bayer(x, y) < 0.5 ? ramp[n - 3] : ramp[n - 2];
      c.set(x, y, col);
    }
  }
  if (!flowers) return;
  // tufts & flowers
  for (let i = 0; i < (x1 - x0) / 3; i++) {
    const x = x0 + Math.floor(hash2(i, 1, seed) * (x1 - x0));
    const ty = Math.round(top(x));
    const y = ty + 3 + Math.floor(hash2(i, 2, seed) * Math.max(1, yBottom - ty - 4));
    if (y > yBottom - 1) continue;
    const k = hash2(i, 5, seed);
    if (k < 0.55) {
      c.set(x, y, ramp[Math.max(0, n - 4)]);
      c.set(x - 1, y + 1, ramp[Math.max(0, n - 4)]);
      c.set(x + 1, y + 1, ramp[Math.max(0, n - 4)]);
    } else if (k < 0.8) {
      c.set(x, y, P.red[5]);
      c.set(x, y + 1, ramp[1]);
    } else {
      c.set(x, y, P.cloth[5]);
      c.set(x, y + 1, ramp[1]);
    }
  }
}

/** Miniature water: fish-scale wave pattern, gently scrolling with the frame. */
export function water(c: PixelCanvas, x0: number, y0: number, x1: number, y1: number, f: number, dark = false): void {
  const base = dark ? [P.water[1], P.water[2], P.water[2]] : [P.water[3], P.water[4], P.water[4]];
  vgrad(c, x0, y0, x1, y1, base);
  const hi = dark ? P.water[4] : P.water[6];
  const hi2 = dark ? P.water[5] : P.water[7];
  for (let row = 0, y = y0 + 2; y <= y1; y += 4, row++) {
    const off = (row % 2) * 4 + ((f + row) % 4) * (row % 2 ? 1 : -1);
    for (let x = x0 - 8 + off; x <= x1; x += 8) {
      c.set(x, y, hi);
      c.set(x + 1, y - 1, hi2);
      c.set(x + 2, y - 1, hi2);
      c.set(x + 3, y, hi);
    }
  }
}

// ───────────────────────────── Architecture ─────────────────────────────

/** Theodosian-style wall elevation: limestone courses with red brick bands. */
export function wall(c: PixelCanvas, x0: number, x1: number, yTop: number, yBase: number, opts: { merlons?: boolean; bricks?: boolean; dark?: boolean } = {}): void {
  const L = opts.dark ? [P.stone[2], P.stone[3], P.stone[4], P.stone[5]] : [P.limestone[2], P.limestone[3], P.limestone[4], P.limestone[5]];
  for (let y = yTop; y <= yBase; y++) {
    const band = opts.bricks !== false && (y - yTop) % 7 >= 4 && (y - yTop) % 7 <= 5;
    for (let x = x0; x <= x1; x++) {
      let col: string;
      if (band) col = (y - yTop) % 7 === 4 ? P.brick[4] : P.brick[3];
      else {
        const course = Math.floor((y - yTop) / 2);
        const joint = (x + (course % 2) * 3) % 6 === 0 || (y - yTop) % 2 === 1;
        col = joint ? L[1] : y - yTop < 2 ? L[3] : L[2];
      }
      if (opts.dark) col = band ? P.brick[2] : col;
      c.set(x, y, col);
    }
  }
  if (opts.merlons !== false) {
    for (let x = x0; x <= x1 - 1; x += 4) {
      c.set(x, yTop - 1, L[3]);
      c.set(x + 1, yTop - 1, L[2]);
      c.set(x, yTop - 2, L[3]);
      c.set(x + 1, yTop - 2, L[2]);
    }
  }
  // base shadow
  for (let x = x0; x <= x1; x++) c.set(x, yBase, L[0]);
}

/** Square tower elevation (cx = centre). roof: crenellated, conical (lead) or broken. */
export function tower(c: PixelCanvas, cx: number, yBase: number, w: number, h: number, roof: 'mazgal' | 'konik' | 'kirik' = 'mazgal', dark = false): void {
  const x0 = cx - Math.floor(w / 2);
  const x1 = x0 + w - 1;
  const yTop = yBase - h;
  // remember what is behind the top rows so a broken top shows the background
  const saved: [number, number, number, number][][] = [];
  if (roof === 'kirik')
    for (let x = x0; x <= x1; x++) {
      const col: [number, number, number, number][] = [];
      for (let y = yTop - 2; y < yTop + 6; y++) col.push(c.get(x, y));
      saved.push(col);
    }
  wall(c, x0, x1, yTop, yBase, { merlons: roof === 'mazgal', dark });
  // lit left edge / shaded right edge
  for (let y = yTop; y <= yBase; y++) {
    c.set(x0, y, dark ? P.stone[4] : P.limestone[5]);
    c.set(x1, y, dark ? P.stone[1] : P.limestone[1]);
    c.set(x1 - 1, y, dark ? P.stone[2] : P.limestone[2], 0.6);
  }
  // arrow slits
  for (let y = yTop + 3; y < yBase - 3; y += 7) {
    c.set(cx, y, O);
    c.set(cx, y + 1, O);
  }
  if (roof === 'konik') cone(c, cx, yTop - 1, Math.ceil(w / 2) + 1, Math.round(w * 0.9));
  if (roof === 'kirik') {
    for (let x = x0; x <= x1; x++) {
      const cut = Math.floor(hash2(x, yTop, 7) * 5);
      for (let y = yTop - 2; y < yTop + cut; y++) {
        const [r, g, bb, a] = saved[x - x0][y - (yTop - 2)];
        if (a === 0) c.erase(x, y);
        else c.set(x, y, (r << 16) | (g << 8) | bb);
      }
      c.set(x, yTop + cut, dark ? P.stone[1] : P.limestone[1]);
    }
  }
}

/** Round tower elevation (cylinder shading lit from the left). */
export function roundTower(c: PixelCanvas, cx: number, yBase: number, r: number, h: number, roof: 'mazgal' | 'konik' = 'konik'): void {
  const yTop = yBase - h;
  const ramp = [P.limestone[1], P.limestone[2], P.limestone[3], P.limestone[4], P.limestone[5]];
  for (let x = -r; x <= r; x++) {
    const t = (x + r) / (2 * r); // 0 = left
    const lit = 1 - Math.abs(t - 0.3) * 1.6;
    const idx = Math.max(0, Math.min(4, Math.round(lit * 4)));
    for (let y = yTop; y <= yBase; y++) {
      const band = (y - yTop) % 9 >= 6 && (y - yTop) % 9 <= 6;
      const joint = (y - yTop) % 3 === 2 && (x + y) % 5 === 0;
      let col: string = ramp[idx];
      if (band) col = idx >= 3 ? P.brick[4] : P.brick[2];
      else if (joint) col = ramp[Math.max(0, idx - 1)];
      c.set(cx + x, y, col);
    }
  }
  // windows
  for (let y = yTop + 4; y < yBase - 4; y += 8) {
    c.set(cx - 1, y, O);
    c.set(cx - 1, y + 1, O);
  }
  if (roof === 'konik') cone(c, cx, yTop - 1, r + 2, Math.round(r * 2.1));
  else for (let x = -r; x <= r; x += 3) c.rect(cx + x, yTop - 2, 2, 2, ramp[3]);
  for (let x = -r; x <= r; x++) c.set(cx + x, yBase, P.limestone[0]);
}

/** Lead-covered conical roof with gold finial. */
export function cone(c: PixelCanvas, cx: number, yBase: number, hw: number, h: number): void {
  for (let y = 0; y < h; y++) {
    const span = Math.round((hw * (y + 1)) / h);
    for (let x = -span; x <= span; x++) {
      const lit = x < -span * 0.2;
      const col = x === -span || x === span ? P.steel[1] : lit ? P.steel[4] : x < span * 0.4 ? P.steel[3] : P.steel[2];
      c.set(cx + x, yBase - h + 1 + y, col);
    }
  }
  // eave line
  for (let x = -hw; x <= hw; x++) c.set(cx + x, yBase, P.steel[1]);
  c.set(cx, yBase - h, P.gold[5]);
  c.set(cx, yBase - h - 1, P.gold[6]);
  c.set(cx, yBase - h - 2, P.gold[4]);
}

/** Byzantine church/Ayasofya-style dome on a drum (half disc, ribbed, lead). */
export function dome(c: PixelCanvas, cx: number, yBase: number, r: number, drum = 2): void {
  // drum with windows
  for (let x = -r; x <= r; x++)
    for (let y = 0; y < drum; y++) c.set(cx + x, yBase - y, (x + r) % 3 === 1 && y === 0 ? P.outline[2] : x < 0 ? P.sand[4] : P.sand[3]);
  const top = yBase - drum;
  for (let y = 0; y <= r; y++) {
    const span = Math.round(Math.sqrt(r * r - y * y));
    for (let x = -span; x <= span; x++) {
      const nx = x / r;
      const ny = y / r;
      const light = -nx * 0.6 + ny * 0.5 + 0.2;
      const col = light > 0.55 ? P.steel[5] : light > 0.25 ? P.steel[4] : light > 0 ? P.steel[3] : P.steel[2];
      c.set(cx + x, top - y, col);
    }
  }
  // ribs
  for (let k = -2; k <= 2; k++) {
    for (let y = 1; y < r; y++) {
      const span = Math.sqrt(r * r - y * y);
      const x = Math.round((k / 3) * span);
      c.set(cx + x, top - y, P.steel[2], 0.6);
    }
  }
  c.set(cx, top - r - 1, P.gold[5]);
  c.set(cx, top - r - 2, P.gold[6]);
}

// ───────────────────────────── People ─────────────────────────────

export type Hat = 'sarik' | 'buyuk-sarik' | 'bork' | 'migfer' | 'kalpak' | 'baslik' | 'yok';
export type Pose = 'dur' | 'yuru' | 'tasi' | 'kaldir' | 'cek' | 'otur' | 'isaret';
export type Item = 'mizrak' | 'kazma' | 'kalkan' | 'mesale' | 'sancak' | 'yay' | 'sirik' | 'kalem' | null;

export interface FigOpts {
  robe: Ramp;
  hat?: Hat;
  hatColor?: Ramp;
  facing?: 1 | -1;
  pose?: Pose;
  item?: Item;
  itemColor?: Ramp;
  beard?: boolean;
  f?: number;
  scale?: 1 | 2;
}

/**
 * Small miniature figure (≈7×13). (x, yFoot) = centre of the feet.
 * Light from the upper left: left side of the robe lit.
 */
export function figure(c: PixelCanvas, x: number, yFoot: number, o: FigOpts): void {
  const fw = 17;
  const fh = 26;
  const ox = 8; // local centre column
  const oy = 23; // local foot row
  const s = new PixelCanvas(fw, fh);
  const R = o.robe;
  const face = o.facing ?? 1;
  const pose = o.pose ?? 'dur';
  const f = o.f ?? 0;
  const X = (dx: number) => ox + dx * face;
  const seat = pose === 'otur';
  // legs / feet
  if (!seat) {
    const step = pose === 'yuru' || pose === 'cek' ? f % 2 : 0;
    s.set(X(-1 - step), oy, P.outline[2]);
    s.set(X(1 + (1 - step) - 1), oy, P.outline[2]);
  }
  // robe (kaftan) — flares at the hem
  const top = oy - (seat ? 6 : 8);
  for (let y = top; y < oy; y++) {
    const rel = y - top;
    const half = seat ? (rel < 2 ? 1 : 3) : rel < 2 ? 1 : rel < 5 ? 2 : 2 + (rel >= 7 ? 1 : 0);
    for (let dx = -half; dx <= half; dx++) {
      const lit = dx * face < 0;
      const col = dx === -half * face ? R[R.length - 1] : lit ? R[R.length - 2] : dx === 0 ? R[R.length - 3] : R[Math.max(0, R.length - 4)];
      s.set(ox + dx, y, col);
    }
  }
  // sash
  const sashY = top + 3;
  for (let dx = -2; dx <= 2; dx++) s.set(ox + dx, sashY, o.hat === 'bork' ? P.red[4] : P.gold[4]);
  // head
  const hy = top - 2;
  s.set(ox, hy, P.skin[4]);
  s.set(ox + face, hy, P.skin[3]);
  s.set(ox, hy + 1, P.skin[3]);
  s.set(ox + face, hy + 1, o.beard ? P.cloth[4] : P.skin[3]);
  if (o.beard) {
    s.set(ox, hy + 2, P.cloth[4]);
    s.set(ox + face, hy + 2, P.cloth[3]);
  }
  // hat
  const hat = o.hat ?? 'sarik';
  const T = o.hatColor ?? P.turban;
  switch (hat) {
    case 'sarik':
      s.rect(ox - 1, hy - 2, 3, 2, T[2]);
      s.set(ox - 1, hy - 2, T[3]);
      s.set(ox + 1, hy - 1, T[1]);
      s.set(ox, hy - 3, P.red[4]);
      break;
    case 'buyuk-sarik':
      s.rect(ox - 2, hy - 3, 5, 3, T[2]);
      s.set(ox - 2, hy - 3, T[3]);
      s.set(ox - 1, hy - 3, T[3]);
      s.set(ox + 2, hy - 1, T[1]);
      s.set(ox + 2, hy - 2, T[1]);
      s.set(ox, hy - 4, P.red[4]);
      s.set(ox + 1, hy - 4, P.red[3]);
      break;
    case 'bork':
      s.rect(ox - 1, hy - 5, 2, 5, P.cloth[5]);
      s.set(ox + face, hy - 1, P.cloth[4]);
      s.set(ox + face, hy - 2, P.cloth[4]);
      s.set(ox - face, hy - 5, P.cloth[4]);
      s.set(ox - 2 * face, hy - 4, P.cloth[4]);
      s.set(ox - 2 * face, hy - 3, P.cloth[3]);
      s.set(ox - 2 * face, hy - 2, P.cloth[3]);
      s.set(ox + (face > 0 ? 0 : -1) + face, hy - 2, P.gold[5]);
      break;
    case 'migfer':
      s.rect(ox - 1, hy - 1, 3, 1, P.steel[4]);
      s.set(ox, hy - 2, P.steel[5]);
      s.set(ox + face, hy - 1, P.steel[3]);
      break;
    case 'kalpak':
      s.rect(ox - 1, hy - 2, 3, 2, P.wood[2]);
      s.set(ox - 1, hy - 2, P.wood[3]);
      s.set(ox, hy - 3, P.wood[3]);
      break;
    case 'baslik':
      s.rect(ox - 1, hy - 1, 3, 2, T[2]);
      s.set(ox - face, hy + 1, T[1]);
      s.set(ox, hy - 2, T[3]);
      break;
    default:
      s.set(ox, hy - 1, P.wood[1]);
      s.set(ox + face, hy - 1, P.wood[1]);
  }
  // arms & items
  const hx = X(2);
  const handY = top + (pose === 'kaldir' ? -2 : pose === 'tasi' ? -1 : 2);
  const IC = o.itemColor ?? P.wood;
  if (pose === 'kaldir') {
    s.set(X(2), top, R[R.length - 3]);
    s.set(X(2), top - 1, R[R.length - 2]);
    s.set(X(2), top - 2, P.skin[4]);
  } else if (pose === 'tasi') {
    // load on the shoulders
    s.rect(ox - 2, hy - 2, 5, 2, IC[IC.length - 2]);
    s.set(ox - 2, hy - 2, IC[IC.length - 1]);
    s.set(ox + 2, hy - 1, IC[1]);
  } else if (pose === 'cek') {
    s.set(X(2), top + 1, R[R.length - 3]);
    s.set(X(3), top + 1, P.skin[4]);
  } else if (pose === 'isaret') {
    s.set(X(2), top + 1, R[R.length - 3]);
    s.set(X(3), top, R[R.length - 3]);
    s.set(X(4), top - 1, P.skin[4]);
  } else {
    s.set(X(2), top + 2, R[R.length - 4]);
    s.set(X(2), top + 3, P.skin[3]);
  }
  switch (o.item) {
    case 'mizrak':
      for (let y = hy - 6; y <= oy - 1; y++) s.set(hx, y, P.wood[4]);
      s.set(hx, hy - 7, P.steel[5]);
      s.set(hx, hy - 8, P.steel[4]);
      break;
    case 'sirik':
      for (let y = hy - 4; y <= oy; y++) s.set(hx, y, P.wood[3]);
      break;
    case 'kazma': {
      const up = f % 2 === 0;
      const ax = X(up ? 2 : 3);
      const ay = up ? hy - 3 : top + 1;
      s.set(ax, ay, P.wood[4]);
      s.set(ax, ay + 1, P.wood[4]);
      s.set(ax + (up ? -face : face), ay, P.steel[4]);
      s.set(ax + face, ay - (up ? 0 : 1), P.steel[5]);
      break;
    }
    case 'kalkan':
      s.disc(X(2), top + 2, 2, P.red[3]);
      s.set(X(2), top + 2, P.gold[5]);
      break;
    case 'mesale': {
      for (let y = handY; y <= handY + 3; y++) s.set(hx, y, P.wood[3]);
      const fl = f % 2;
      s.set(hx, handY - 1, P.fire[5]);
      s.set(hx, handY - 2, P.fire[6 - fl]);
      s.set(hx + (fl ? face : 0), handY - 3, P.fire[4]);
      break;
    }
    case 'yay':
      for (let y = top - 2; y <= top + 4; y++) s.set(X(3) + (y === top - 2 || y === top + 4 ? 0 : 1) * face, y, P.wood[4]);
      break;
    case 'kalem':
      s.set(X(3), top + 2, P.cloth[5]);
      s.set(X(4), top + 1, P.wood[2]);
      break;
    case 'sancak': {
      for (let y = hy - 9; y <= oy - 1; y++) s.set(hx, y, P.wood[4]);
      s.set(hx, hy - 10, P.gold[6]);
      const FC = o.itemColor ?? P.red;
      for (let j = 0; j < 5; j++)
        for (let i = 1; i <= 7; i++) {
          const wave = Math.round(Math.sin((i + f * 2) * 0.9) * 0.8);
          if (i === 7 && j === 2) continue;
          s.set(hx + i * face, hy - 9 + j + wave, j === 0 ? FC[FC.length - 1] : j === 4 ? FC[FC.length - 4] : FC[FC.length - 2]);
        }
      break;
    }
  }
  s.outline(O2);
  c.blit(s, x - ox, yFoot - oy);
}

export interface BigFigOpts {
  robe: Ramp;
  inner?: Ramp;
  /** Fur trim of the kaftan. */
  fur?: Ramp | null;
  turban?: 'kavuk' | 'sarik';
  beard?: 'siyah' | 'beyaz' | 'kizil';
  pose?: 'otur' | 'dur';
  facing?: 1 | -1;
  /** Sultan's aigrette. */
  sorguc?: boolean;
  /** Holding a pen and paper (writing). */
  yaziyor?: boolean;
  f?: number;
}

/**
 * Larger "hierarchic scale" figure (≈19×27) for close scenes — the Sultan,
 * a sheikh. (x, yFoot) = bottom centre. Lit from the upper left.
 */
export function bigFigure(c: PixelCanvas, x: number, yFoot: number, o: BigFigOpts): void {
  const s = new PixelCanvas(27, 34);
  const ox = 13;
  const oy = 31;
  const face = o.facing ?? 1;
  const R = o.robe;
  const I = o.inner ?? P.cloth;
  const n = R.length;
  const X = (dx: number) => ox + dx * face;
  const seated = (o.pose ?? 'otur') === 'otur';
  const f = o.f ?? 0;
  // lower body
  if (seated) {
    for (let y = oy - 5; y <= oy; y++) {
      const half = y === oy - 5 ? 7 : 9;
      for (let dx = -half; dx <= half; dx++) {
        const lit = dx * face < -2;
        s.set(ox + dx, y, y === oy ? R[1] : lit ? R[n - 2] : dx * face > 5 ? R[n - 4] : R[n - 3]);
      }
    }
    // knees fold line
    for (let dx = -6; dx <= 6; dx += 3) s.set(ox + dx, oy - 2, R[Math.max(0, n - 4)]);
  } else {
    for (let y = oy - 9; y <= oy; y++) {
      const half = 4 + Math.floor((y - (oy - 9)) / 4);
      for (let dx = -half; dx <= half; dx++) s.set(ox + dx, y, dx * face < 0 ? R[n - 2] : R[n - 3]);
    }
    for (let dx = -1; dx <= 1; dx++) for (let y = oy - 9; y <= oy; y++) s.set(ox + dx, y, I[I.length - 2]);
  }
  // torso
  const tTop = seated ? oy - 15 : oy - 20;
  const tBot = seated ? oy - 5 : oy - 9;
  for (let y = tTop; y <= tBot; y++) {
    const half = y === tTop ? 4 : 6;
    for (let dx = -half; dx <= half; dx++) {
      const lit = dx * face < -1;
      s.set(ox + dx, y, lit ? R[n - 2] : dx * face > 3 ? R[n - 4] : R[n - 3]);
    }
  }
  // inner robe & sash
  for (let y = tTop + 1; y <= tBot; y++) for (let dx = -1; dx <= 1; dx++) s.set(X(dx + 1), y, dx === -1 ? I[I.length - 1] : I[I.length - 2]);
  const sashY = tTop + 6;
  for (let dx = -5; dx <= 6; dx++) s.set(ox + dx, sashY, P.gold[4]);
  s.set(X(2), sashY + 1, P.gold[3]);
  // fur trim along the opening and collar
  if (o.fur !== null) {
    const F = o.fur ?? P.wood;
    for (let y = tTop; y <= tBot; y++) s.set(X(-1), y, y % 2 ? F[F.length - 3] : F[F.length - 2]);
    for (let dx = -4; dx <= 4; dx++) s.set(ox + dx, tTop, F[F.length - 2]);
  }
  // arms: sleeve forward to the lap / writing
  const handY = o.yaziyor ? tTop + 7 : tTop + 8;
  for (let k = 0; k < 5; k++) s.set(X(3 + Math.floor(k / 2)), tTop + 3 + k, R[n - 4]);
  s.set(X(5), handY, P.skin[4]);
  s.set(X(6), handY, P.skin[3]);
  if (o.yaziyor) {
    s.rect(Math.min(X(5), X(10)), handY + 1, 6, 3, P.cloth[5]);
    for (let k = 0; k < 4; k++) s.set(X(6 + k), handY + 2, k % 2 ? P.outline[2] : P.cloth[3]);
    s.set(X(7), handY - 1, P.wood[2]);
    s.set(X(8), handY - 2, P.wood[2]);
  }
  // head
  const hTop = tTop - 7;
  for (let y = hTop + 2; y < tTop; y++)
    for (let dx = -2; dx <= 2; dx++) s.set(ox + dx, y, dx * face < 0 ? P.skin[4] : P.skin[3]);
  s.set(X(2), hTop + 3, P.outline[2]); // eye
  s.set(X(3), hTop + 4, P.skin[3]); // nose
  // beard
  const B = o.beard === 'beyaz' ? [P.cloth[3], P.cloth[4], P.cloth[5]] : o.beard === 'kizil' ? [P.wood[3], P.wood[4], P.wood[5]] : [P.outline[2], P.wood[1], P.wood[2]];
  for (let y = hTop + 5; y <= tTop + (o.beard === 'beyaz' ? 2 : 0); y++)
    for (let dx = -2; dx <= 2; dx++) if (!(y === hTop + 5 && dx * face < 0)) s.set(X(dx), y, dx === 0 ? B[2] : B[1]);
  // turban
  const tb = o.turban ?? 'kavuk';
  const T = P.turban;
  if (tb === 'kavuk') {
    // tall cylindrical wrapped turban with coloured cap showing
    for (let y = hTop - 5; y <= hTop + 2; y++)
      for (let dx = -4; dx <= 4; dx++) {
        if (y === hTop - 5 && Math.abs(dx) > 3) continue;
        const fold = (dx + y) % 3 === 0;
        s.set(ox + dx, y, dx * face < -1 ? T[3] : fold ? T[1] : T[2]);
      }
    s.rect(ox - 1, hTop - 7, 3, 2, P.red[4]);
    s.set(ox - 1, hTop - 7, P.red[5]);
  } else {
    for (let y = hTop - 3; y <= hTop + 2; y++)
      for (let dx = -4; dx <= 4; dx++) {
        if ((y === hTop - 3 || y === hTop + 2) && Math.abs(dx) > 3) continue;
        const fold = (dx - y) % 3 === 0;
        s.set(ox + dx, y, dx * face < -1 ? T[3] : fold ? T[1] : T[2]);
      }
    s.set(ox, hTop - 4, P.green[4]);
    s.set(ox + 1, hTop - 4, P.green[3]);
  }
  if (o.sorguc) {
    s.set(X(1), hTop - 1, P.gold[6]);
    s.set(X(1), hTop - 2, P.red[5]);
    s.set(X(1), hTop - 6 - (f % 2), P.cloth[5]);
    s.set(X(2), hTop - 7, P.cloth[5]);
    s.set(X(1), hTop - 5, P.cloth[4]);
    s.set(X(1), hTop - 4, P.cloth[4]);
    s.set(X(1), hTop - 3, P.gold[5]);
  }
  s.outline(O2);
  c.blit(s, x - ox, yFoot - oy);
}

/** Horse (≈13×9) with optional rider. (x,yFoot) = centre of the hooves. */
export function rider(c: PixelCanvas, x: number, yFoot: number, o: { horse: Ramp; robe: Ramp; hat?: Hat; facing?: 1 | -1; f?: number; item?: Item; itemColor?: Ramp; caparison?: Ramp; inWater?: boolean }): void {
  const s = new PixelCanvas(26, 26);
  const face = o.facing ?? 1;
  const ox = 13;
  const oy = 23;
  const Hh = o.horse;
  const X = (dx: number) => ox + dx * face;
  const f = o.f ?? 0;
  // legs
  const legs = [-4, -2, 3, 5];
  legs.forEach((lx, i) => {
    const lift = (i + f) % 2 === 0 && !o.inWater ? 1 : 0;
    for (let y = oy - 4; y <= oy - lift; y++) s.set(X(lx), y, Hh[1]);
  });
  // body
  for (let y = oy - 8; y <= oy - 4; y++)
    for (let dx = -5; dx <= 5; dx++) {
      const edge = (y === oy - 8 || y === oy - 4) && (dx === -5 || dx === 5);
      if (edge) continue;
      s.set(X(dx), y, y === oy - 8 ? Hh[Hh.length - 1] : dx * face < 0 ? Hh[Hh.length - 2] : Hh[Hh.length - 3]);
    }
  // neck & head
  for (let k = 0; k < 4; k++) {
    s.set(X(5 + Math.floor(k / 2)), oy - 9 - k, Hh[Hh.length - 2]);
    s.set(X(6 + Math.floor(k / 2)), oy - 9 - k, Hh[Hh.length - 3]);
  }
  s.set(X(8), oy - 12, Hh[Hh.length - 2]);
  s.set(X(9), oy - 11, Hh[Hh.length - 3]);
  s.set(X(9), oy - 10, Hh[1]);
  s.set(X(7), oy - 13, Hh[1]); // ear
  // mane & tail
  for (let k = 0; k < 4; k++) s.set(X(4 + Math.floor(k / 2)), oy - 9 - k, Hh[0]);
  s.set(X(-6), oy - 7, Hh[0]);
  s.set(X(-7), oy - 6 + (f % 2), Hh[0]);
  s.set(X(-7), oy - 5 + (f % 2), Hh[0]);
  // caparison / saddle cloth
  const C = o.caparison ?? P.red;
  for (let dx = -2; dx <= 2; dx++) for (let y = oy - 8; y <= oy - 5; y++) s.set(X(dx), y, y === oy - 5 ? P.gold[4] : dx * face < 0 ? C[C.length - 2] : C[C.length - 3]);
  s.outline(O2);
  // rider
  figure(s, ox, oy - 7, { robe: o.robe, hat: o.hat ?? 'sarik', facing: face, pose: o.item ? 'dur' : 'dur', item: o.item ?? null, itemColor: o.itemColor, f, beard: true });
  c.blit(s, x - ox, yFoot - oy);
}

/** Ox (≈11×7). */
export function ox(c: PixelCanvas, x: number, yFoot: number, facing: 1 | -1 = 1, f = 0): void {
  const s = new PixelCanvas(18, 12);
  const X = (dx: number) => 8 + dx * facing;
  const oy = 10;
  for (const [i, lx] of [-4, -2, 2, 4].entries()) {
    const lift = (i + f) % 2 === 0 ? 1 : 0;
    for (let y = oy - 3; y <= oy - lift; y++) s.set(X(lx), y, P.wood[1]);
  }
  for (let y = oy - 7; y <= oy - 3; y++)
    for (let dx = -5; dx <= 4; dx++) {
      if ((y === oy - 7 || y === oy - 3) && (dx === -5 || dx === 4)) continue;
      s.set(X(dx), y, y === oy - 7 ? P.wood[6] : dx * facing < 0 ? P.wood[5] : P.wood[4]);
    }
  // head lowered
  s.rect(Math.min(X(5), X(7)), oy - 6, 3, 3, P.wood[4]);
  s.set(X(7), oy - 4, P.wood[3]);
  s.set(X(5), oy - 7, P.cloth[4]); // horn
  s.set(X(7), oy - 7, P.cloth[4]);
  // yoke
  s.set(X(4), oy - 8, P.wood[2]);
  s.set(X(5), oy - 8, P.wood[2]);
  s.outline(O2);
  c.blit(s, x - 8, yFoot - oy);
}

// ───────────────────────────── Camp ─────────────────────────────

/** Ottoman tent: striped conical roof, scalloped valance, door. (x = left, yBase = ground). */
export function tent(c: PixelCanvas, x: number, yBase: number, w: number, h: number, A: Ramp, B: Ramp, f = 0, pennant: Ramp | null = null): void {
  sprite(
    c,
    x,
    yBase - h - 4,
    w,
    h + 5,
    (s) => {
      const oy = h + 4;
      const eave = Math.round(h * 0.5);
      const wallTop = oy - eave;
      // walls
      for (let y = wallTop; y <= oy; y++)
        for (let xx = 1; xx < w; xx++) {
          const stripe = Math.floor((xx - 1) / 3) % 2 === 0;
          s.set(xx, y, stripe ? B[B.length - 2] : B[B.length - 3]);
        }
      // door
      const dc = Math.floor(w / 2);
      for (let y = wallTop + 2; y <= oy; y++) {
        const half = Math.min(2, Math.floor((y - wallTop) / 2));
        for (let k = -half; k <= half; k++) s.set(dc + k, y, P.outline[2]);
      }
      // roof
      const apexY = 4;
      for (let y = apexY; y < wallTop; y++) {
        const t = (y - apexY) / Math.max(1, wallTop - apexY);
        const half = Math.round(t * (w / 2 + 1));
        for (let k = -half; k <= half; k++) {
          const xx = dc + k;
          const seg = Math.floor(((k + w) * 2) / Math.max(2, w)) % 2;
          const lit = k < 0;
          s.set(xx, y, seg ? (lit ? A[A.length - 1] : A[A.length - 3]) : lit ? A[A.length - 2] : A[A.length - 4]);
        }
      }
      // valance
      for (let xx = 0; xx <= w; xx++) {
        s.set(xx, wallTop, P.gold[4]);
        if (xx % 2 === 0) s.set(xx, wallTop + 1, A[A.length - 3]);
      }
      // finial
      s.set(dc, apexY - 1, P.gold[6]);
      s.set(dc, apexY - 2, P.gold[5]);
      if (pennant) {
        for (let y = 0; y < apexY - 1; y++) s.set(dc, y, P.wood[3]);
        for (let i = 1; i <= 4; i++) s.set(dc + i, (i + f) % 2, pennant[pennant.length - 2]);
      }
    },
    O2,
  );
}

/**
 * Sancak on a pole: a long tapered pennon with swallowtail, rippling with the
 * frame (wave travels from the pole to the tail). Gold finial and fringe.
 */
export function banner(c: PixelCanvas, x: number, yTop: number, pole: number, col: Ramp, f: number, len = 11, ht = 6, dir: 1 | -1 = 1): void {
  const pad = 3;
  sprite(
    c,
    x - (dir < 0 ? len + 2 : 1),
    yTop - 3,
    len + 4,
    pole + 7,
    (s) => {
      const px = dir > 0 ? 1 : len + 2;
      for (let y = 3; y <= pole + 5; y++) s.set(px, y, y < 6 ? P.wood[5] : P.wood[4]);
      // finial: gold ball and spear tip
      s.set(px, 2, P.gold[5]);
      s.set(px, 1, P.gold[6]);
      s.set(px, 0, P.gold[4]);
      const n = col.length;
      for (let i = 1; i <= len; i++) {
        const t = i / len;
        const wave = Math.sin(i * 0.62 - f * (Math.PI / 2)) * (0.4 + t * 1.3);
        const slope = Math.cos(i * 0.62 - f * (Math.PI / 2));
        const hh = Math.max(2, Math.round(ht - t * 2));
        const y0 = pad + Math.round(wave) + Math.round((ht - hh) / 2);
        for (let j = 0; j < hh; j++) {
          // swallowtail notch
          if (i === len && hh > 2 && j === Math.floor(hh / 2)) continue;
          let k = slope > 0.3 ? n - 2 : slope < -0.3 ? n - 4 : n - 3;
          if (j === 0) k += 1;
          if (j === hh - 1) k -= 1;
          s.set(px + i * dir, y0 + j, col[Math.max(0, Math.min(n - 1, k))]);
        }
      }
      // gold fringe along the hoist
      for (let j = 0; j < ht; j++) s.set(px + dir, pad + j, P.gold[5]);
    },
    O2,
  );
}

// ───────────────────────────── Ships ─────────────────────────────

/** Ottoman galley (kadırga): low hull, banks of oars, lateen sail. x = stern-left; yWater = waterline. */
export function galley(c: PixelCanvas, x: number, yWater: number, len: number, dir: 1 | -1, f: number, sail: Ramp | null = P.cloth, flag: Ramp = P.red): void {
  const s = new PixelCanvas(len + 14, 34);
  const oy = 26;
  const X = (k: number) => (dir > 0 ? 6 + k : 6 + len - k);
  // oars
  const nOars = Math.max(3, Math.floor(len / 4));
  for (let i = 0; i < nOars; i++) {
    const k = 4 + Math.round((i * (len - 8)) / Math.max(1, nOars - 1));
    const sweep = (f + i) % 2 === 0 ? -1 : 1;
    for (let t = 0; t < 5; t++) s.set(X(k + sweep * Math.floor(t / 2)), oy + t, P.wood[3]);
  }
  // hull
  for (let k = 0; k <= len; k++) {
    const endRise = k < 4 ? 4 - k : k > len - 5 ? k - (len - 5) : 0;
    const top = oy - 3 - Math.floor(endRise / 2);
    for (let y = top; y <= oy + 1; y++) {
      const col = y === top ? P.gold[4] : y === top + 1 ? P.red[3] : y >= oy ? P.wood[2] : P.wood[3];
      s.set(X(k), y, col);
    }
  }
  // ram/beak
  s.set(X(len + 1), oy - 1, P.wood[4]);
  s.set(X(len + 2), oy - 2, P.wood[4]);
  // stern canopy
  for (let k = 1; k < 6; k++) s.set(X(k), oy - 5, P.red[4]);
  s.set(X(1), oy - 4, P.wood[3]);
  s.set(X(5), oy - 4, P.wood[3]);
  // mast & lateen sail
  const mk = Math.round(len * 0.55);
  for (let y = oy - 20; y <= oy - 3; y++) s.set(X(mk), y, P.wood[4]);
  if (sail) {
    // yard: diagonal
    for (let t = 0; t <= 16; t++) s.set(X(mk - 8 + t), oy - 21 + Math.floor(t / 2.2), P.wood[5]);
    for (let y = 0; y < 13; y++) {
      const y0 = oy - 20 + y;
      const xl = mk - 7 + Math.floor(y * 0.55);
      const xr = mk + 7 - Math.floor(y * 0.15);
      for (let k = xl; k <= Math.min(xr, mk + 8); k++) {
        if (y0 < oy - 21 + Math.floor((k - (mk - 8)) / 2.2)) continue;
        const stripe = (k - xl) % 5 === 2;
        s.set(X(k), y0, stripe ? P.red[4] : (k - xl) < 3 ? sail[sail.length - 1] : sail[sail.length - 2]);
      }
    }
  }
  // pennant
  for (let i = 1; i <= 5; i++) s.set(X(mk + i), oy - 21 - ((i + f) % 2), flag[flag.length - 2]);
  s.outline(O2);
  c.blit(s, x - 6, yWater - oy);
}

/** Tall Genoese/Venetian/Byzantine round ship (carrack). x = hull centre; yWater = waterline. */
export function carrack(c: PixelCanvas, x: number, yWater: number, dir: 1 | -1, f: number, nation: 'ceneviz' | 'venedik' | 'bizans'): void {
  const s = new PixelCanvas(40, 46);
  const cx = 20;
  const oy = 40;
  const X = (k: number) => cx + k * dir;
  // hull (tall, rounded) with castles
  for (let k = -14; k <= 14; k++) {
    const curve = Math.round(((k * k) / 196) * 3);
    const castle = k < -8 ? 5 : k > 9 ? 3 : 0;
    const top = oy - 9 - castle + Math.floor(curve / 2);
    for (let y = top; y <= oy + 1 - curve; y++) {
      const plank = (y - top) % 3 === 2;
      const col = y === top ? P.wood[6] : plank ? P.wood[2] : k < 0 ? P.wood[4] : P.wood[3];
      s.set(X(k), y, col);
    }
  }
  // gun-ports / shields along the rail
  for (let k = -12; k <= 12; k += 4) s.set(X(k), oy - 6, nation === 'ceneviz' ? P.red[4] : nation === 'venedik' ? P.gold[4] : P.purple[4]);
  // masts
  const masts = [-5, 5];
  masts.forEach((mk, i) => {
    const h = i === 0 ? 28 : 33;
    for (let y = oy - 9 - h; y <= oy - 8; y++) s.set(X(mk), y, P.wood[2]);
    // top castle
    s.rect(X(mk) - 1, oy - 9 - h + 3, 3, 2, P.wood[4]);
    // square sail (bellied)
    const sy = oy - 9 - h + 7;
    for (let y = 0; y < 14; y++)
      for (let k = -6; k <= 6; k++) {
        const belly = Math.round(Math.sin((y / 13) * Math.PI) * 1.5);
        const px = X(mk + k) + belly * dir;
        const lit = k < -2;
        s.set(px, sy + y, lit ? P.cloth[5] : k > 3 ? P.cloth[3] : P.cloth[4]);
      }
    // emblem
    const ex = X(mk);
    if (nation === 'ceneviz') {
      for (let y = 1; y < 13; y++) s.set(ex, sy + y, P.red[4]);
      for (let k = -5; k <= 5; k++) s.set(X(mk + k), sy + 6, P.red[4]);
    } else if (nation === 'venedik') {
      s.rect(ex - 2, sy + 4, 5, 5, P.red[3]);
      s.set(ex, sy + 6, P.gold[5]);
      s.set(ex - 1, sy + 5, P.gold[5]);
      s.set(ex + 1, sy + 7, P.gold[4]);
    } else {
      s.rect(ex - 2, sy + 4, 5, 5, P.red[4]);
      s.set(ex - 1, sy + 5, P.gold[6]);
      s.set(ex + 1, sy + 5, P.gold[6]);
      s.set(ex, sy + 6, P.gold[5]);
      s.set(ex, sy + 7, P.gold[5]);
    }
    // pennant
    const pc = nation === 'ceneviz' ? P.cloth : nation === 'venedik' ? P.red : P.gold;
    for (let k = 1; k <= 6; k++) s.set(X(mk + k), oy - 10 - h + ((k + f) % 2), k === 1 && nation === 'ceneviz' ? P.red[4] : pc[pc.length - 2]);
  });
  // bowsprit
  for (let k = 0; k < 6; k++) s.set(X(14 + k), oy - 8 - Math.floor(k / 2), P.wood[3]);
  s.outline(O2);
  c.blit(s, x - cx, yWater - oy);
}

// ───────────────────────────── FX ─────────────────────────────

/** Stylised miniature smoke: a billow of lobes with curled highlights and a soft contour. */
export function puffCloud(c: PixelCanvas, cx: number, cy: number, r: number, ramp: Ramp = [P.smoke[4], P.smoke[5], P.smoke[6], P.cloth[5]]): void {
  const w = 2 * r + 8;
  const h = 2 * r + 4;
  sprite(
    c,
    cx - r - 4,
    cy - r - 2,
    w,
    h,
    (s) => {
      const lobes: [number, number, number][] = [];
      const rr = Math.max(2, Math.round(r * 0.55));
      // base row
      for (let i = 0; i < 3; i++) lobes.push([3 + rr + Math.round((i * (w - 6 - 2 * rr)) / 2), h - rr - 2, rr]);
      // crown
      lobes.push([Math.round(w * 0.4), rr + 1, Math.max(2, rr)]);
      lobes.push([Math.round(w * 0.66), rr + 2, Math.max(2, rr - 1)]);
      lobes.push([Math.round(w * 0.5), Math.round(h * 0.5), Math.max(2, rr + 1)]);
      for (const [x, y, q] of lobes) s.disc(x, y, q, ramp[1]);
      for (const [x, y, q] of lobes) s.disc(x - 1, y - 1, Math.max(1, q - 1), ramp[2]);
      for (const [x, y, q] of lobes) if (q > 2) s.disc(x - 1, y - 2, Math.max(1, q - 3), ramp[3]);
      // underside shade
      for (let y = 0; y < s.h; y++)
        for (let x = 0; x < s.w; x++) if (s.alphaAt(x, y) && y >= h - 3 && bayer(x, y) < 0.6) s.set(x, y, ramp[0]);
      // miniature curl strokes
      for (const [x, y, q] of lobes)
        if (q >= 3) {
          s.set(x + 1, y, ramp[0]);
          s.set(x + 1, y + 1, ramp[0]);
          s.set(x, y + 1, ramp[0]);
        }
    },
    ramp[0] === P.smoke[4] ? P.smoke[3] : P.smoke[2],
  );
}

/** Flickering flame (teardrop layers). (x, yBase) = bottom centre. */
export function flame(c: PixelCanvas, x: number, yBase: number, h: number, f: number): void {
  const sway = [0, 1, 0, -1][f % 4];
  for (let y = 0; y < h; y++) {
    const t = y / h;
    const half = Math.round((1 - t) * (h * 0.35) + 0.4);
    const off = Math.round(sway * t * 1.5);
    for (let k = -half; k <= half; k++) {
      const core = Math.abs(k) < half * 0.5 && t < 0.6;
      const col = core ? (t < 0.3 ? P.fire[7] : P.fire[6]) : t > 0.7 ? P.fire[3] : P.fire[5];
      c.set(x + k + off, yBase - y, col);
    }
  }
  c.set(x + sway * 2, yBase - h - 1 - (f % 2), P.fire[4]);
}

/** Soft additive-looking glow (dithered alpha). */
export function glow(c: PixelCanvas, cx: number, cy: number, r: number, col: string, strength = 0.5): void {
  for (let y = -r; y <= r; y++)
    for (let x = -r; x <= r; x++) {
      const dd = Math.sqrt(x * x + y * y) / r;
      if (dd > 1) continue;
      const a = (1 - dd) * strength;
      if (bayer(cx + x, cy + y) < a * 1.6) c.set(cx + x, cy + y, col, Math.min(1, a + 0.15));
    }
}

/** A few arrows streaking diagonally. */
export function arrows(c: PixelCanvas, x0: number, y0: number, x1: number, y1: number, n: number, f: number, seed = 3, dx = 4, dy = 2): void {
  for (let i = 0; i < n; i++) {
    const t = (hash2(i, 1, seed) + f * 0.13) % 1;
    const x = Math.round(x0 + hash2(i, 2, seed) * (x1 - x0) + t * dx * 3);
    const y = Math.round(y0 + hash2(i, 3, seed) * (y1 - y0) + t * dy * 3);
    c.line(x, y, x + dx, y + dy, P.wood[1]);
    c.set(x + dx, y + dy, P.steel[4]);
    c.set(x, y, P.cloth[4]);
  }
}

// ───────────────────────────── Frame ─────────────────────────────

/**
 * Illuminated manuscript frame (cetvel): ink line, gilded band with a running
 * lapis/red pattern, inner gold rule. Corner rosettes. Drawn without clipping.
 */
export function frame(c: Mini): void {
  c.unclipped(() => {
    const x0 = 1;
    const y0 = 1;
    const x1 = W - 2;
    const y1 = H - 2;
    const ring = (k: number, col: string) => {
      for (let x = x0 + k; x <= x1 - k; x++) {
        c.set(x, y0 + k, col);
        c.set(x, y1 - k, col);
      }
      for (let y = y0 + k; y <= y1 - k; y++) {
        c.set(x0 + k, y, col);
        c.set(x1 - k, y, col);
      }
    };
    ring(0, O);
    ring(1, P.gold[5]);
    ring(2, P.gold[3]);
    ring(3, P.blue[2]);
    ring(4, P.gold[6]);
    // running pattern on the lapis band
    for (let x = x0 + 5; x <= x1 - 5; x += 4) {
      c.set(x, y0 + 3, P.gold[4]);
      c.set(x, y1 - 3, P.gold[4]);
    }
    for (let y = y0 + 5; y <= y1 - 5; y += 4) {
      c.set(x0 + 3, y, P.gold[4]);
      c.set(x1 - 3, y, P.gold[4]);
    }
    // light/shade on the gold band (lit from upper-left)
    for (let x = x0 + 1; x <= x1 - 1; x++) c.set(x, y1 - 1, P.gold[3]);
    for (let y = y0 + 1; y <= y1 - 1; y++) c.set(x1 - 1, y, P.gold[3]);
    // corner rosettes
    const corners: [number, number][] = [
      [x0 + 2, y0 + 2],
      [x1 - 2, y0 + 2],
      [x0 + 2, y1 - 2],
      [x1 - 2, y1 - 2],
    ];
    for (const [cx, cy] of corners) {
      c.disc(cx, cy, 2, P.red[4]);
      c.set(cx, cy, P.gold[6]);
      c.set(cx - 1, cy - 1, P.red[5]);
      for (const [dx, dy] of [
        [-3, 0],
        [3, 0],
        [0, -3],
        [0, 3],
      ])
        c.set(cx + dx, cy + dy, P.gold[5]);
    }
    for (let x = 0; x < W; x++) {
      c.erase(x, 0);
      c.erase(x, H - 1);
    }
    for (let y = 0; y < H; y++) {
      c.erase(0, y);
      c.erase(W - 1, y);
    }
  });
}
