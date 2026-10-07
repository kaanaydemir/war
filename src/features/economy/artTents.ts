import { P } from '../../art/palette';
import type { PixelCanvas } from '../../art/pixel';
import type { TextureGen } from '../../art/texture';
import { cone, cylinder, polyFn, rampAt, ri, shadowEllipse, vline, type Ramp } from './artKit';

/**
 * Ottoman campaign tents (çadır) — white, red and green canvas with decorative
 * valance bands (saçak), guy ropes and finials. Also the imperial Otağ.
 */
export type TentKind =
  | 'konik-beyaz-kirmizi'
  | 'konik-beyaz-yesil'
  | 'konik-kirmizi'
  | 'konik-yesil'
  | 'sirt-beyaz'
  | 'sirt-yesil'
  | 'sirt-cizgili'
  | 'kucuk-bez';

export const TENT_KINDS: TentKind[] = [
  'konik-beyaz-kirmizi',
  'konik-beyaz-yesil',
  'konik-kirmizi',
  'konik-yesil',
  'sirt-beyaz',
  'sirt-yesil',
  'sirt-cizgili',
  'kucuk-bez',
];

interface TentColors {
  body: Ramp;
  band: Ramp;
  band2?: Ramp;
}

const WHITE: Ramp = P.cloth.slice(1) as Ramp;
const RED: Ramp = P.red.slice(2) as Ramp;
const GREEN: Ramp = P.green as Ramp;
const GOLD: Ramp = P.gold.slice(2) as Ramp;
const BEIGE: Ramp = P.sand as Ramp;

function tentColors(kind: TentKind): TentColors {
  switch (kind) {
    case 'konik-beyaz-kirmizi':
      return { body: WHITE, band: RED };
    case 'konik-beyaz-yesil':
      return { body: WHITE, band: GREEN };
    case 'konik-kirmizi':
      return { body: RED, band: GOLD };
    case 'konik-yesil':
      return { body: GREEN, band: WHITE };
    case 'sirt-beyaz':
      return { body: WHITE, band: RED };
    case 'sirt-yesil':
      return { body: GREEN, band: GOLD };
    case 'sirt-cizgili':
      return { body: WHITE, band: RED, band2: RED };
    case 'kucuk-bez':
      return { body: BEIGE, band: P.dirt as Ramp };
  }
}

/** Guy rope from (x0,y0) to a peg at (x1,y1). */
function rope(p: PixelCanvas, x0: number, y0: number, x1: number, y1: number): void {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = Math.round(x0 + (x1 - x0) * t);
    const y = Math.round(y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * 1);
    if (p.alphaAt(x, y) === 0) p.set(x, y, P.sand[2], 0.9);
  }
  p.set(x1, y1, P.wood[2]);
}

/**
 * Conical pavilion tent (çadır). (cx, gy) = ground centre; rx = wall radius in px.
 * `flap` (0..2) animates the door flap and the valance ripple.
 */
export function conicalTent(p: PixelCanvas, cx: number, gy: number, rx: number, kind: TentKind, flap: number, opts: { tall?: number; finial?: boolean } = {}): void {
  const c = tentColors(kind);
  const ry = Math.max(2, Math.round(rx * 0.45));
  const wallH = Math.max(5, Math.round(rx * 0.85));
  const roofH = opts.tall ?? Math.round(rx * 1.25);
  const B = c.body;
  const nB = B.length - 1;
  shadowEllipse(p, cx + 3, gy + 1, rx + 3, ry + 1, 0.32);
  // short guy ropes to pegs on both sides (behind the tent)
  for (const sgn of [-1, 1]) {
    const x0 = cx + sgn * (rx + 1);
    const y0 = gy - wallH + 1;
    for (let j = 0; j <= 4; j++) p.set(x0 + sgn * Math.round(j * 0.8), y0 + j + 1, P.sand[2], 0.9);
    p.set(x0 + sgn * 4, y0 + 6, P.wood[2]);
  }
  // canvas wall (lit left, shaded right, soft vertical folds)
  for (let x = -rx; x <= rx; x++) {
    const u = x / (rx + 0.5);
    const e = Math.sqrt(Math.max(0, 1 - u * u));
    const yb = Math.round(gy + ry * e);
    const yt = Math.round(gy - wallH + ry * e);
    const lit = 0.62 - 0.55 * u;
    for (let y = yt; y <= yb; y++) {
      let v = nB * lit + 0.6;
      if ((x + 40) % 4 === 0) v -= 0.6;
      if (y >= yb - 1) v -= 0.8;
      let r = B;
      // decorative band (saçak) at the top of the wall
      if (y - yt < 2) {
        r = c.band;
        v = (c.band.length - 1) * (0.5 - 0.35 * u) + (y - yt === 0 ? 0.6 : 0);
      }
      p.set(cx + x, y, rampAt(r, Math.max(0, Math.min(1, v / (r.length - 1))), cx + x, y));
    }
    // scallops hanging under the band
    if ((x + 40 + flap) % 3 === 0) p.set(cx + x, yt + 2, ri(c.band, (c.band.length - 1) * (0.45 - 0.3 * u)));
  }
  // door on the lit front-left
  {
    const u = -0.45;
    const e = Math.sqrt(1 - u * u);
    const dx = cx + Math.round(u * rx);
    const yb = Math.round(gy + ry * e);
    const yt = Math.round(gy - wallH + ry * e) + 3;
    for (let y = yt; y < yb; y++) for (let i = -1; i <= 1; i++) if (!(y === yt && i !== 0)) p.set(dx + i, y, P.outline[2]);
    const fl = flap === 0 ? 0 : flap === 1 ? 1 : -1;
    for (let j = 0; j < 4; j++) p.set(dx - 2 - fl, yt + j, ri(B, nB - 1 - (j > 2 ? 1 : 0)));
    p.set(dx - 3 - fl, yt + 3, ri(B, nB - 2));
  }
  // conical roof with crown band
  const apex = gy - wallH - roofH;
  const coloured = kind === 'konik-yesil' || kind === 'konik-kirmizi';
  cone(p, cx, apex, gy - wallH, rx + 1, ry, B, {
    seams: 7,
    base: nB * 0.5,
    bands: coloured
      ? [
          { from: 0.2, to: 0.32, ramp: c.band, base: c.band.length * 0.55 },
          { from: 0.72, to: 0.8, ramp: c.band, base: c.band.length * 0.45 },
        ]
      : [{ from: 0.22, to: 0.32, ramp: c.band, base: c.band.length * 0.5 }],
  });
  // finial
  if (opts.finial !== false) {
    vline(p, cx, apex - 3, apex, P.wood[3]);
    p.set(cx, apex - 4, P.gold[5]);
    p.set(cx, apex - 5, P.gold[6]);
  }
}

/** Ridge (wall) tent along the iso x axis. (cx, gy) = ground centre. */
export function ridgeTent(p: PixelCanvas, cx: number, gy: number, len: number, kind: TentKind, flap: number): void {
  const c = tentColors(kind);
  const a = len / 16; // tiles along +tx
  const b = 0.75; // depth along +ty
  // footprint north vertex
  const ox = cx - (a - b) * 8;
  const oy = gy - (a + b) * 4;
  const wallH = 4;
  const roofH = 9;
  shadowEllipse(p, cx + 4, gy + 1, Math.round(len * 0.7), 4, 0.28);
  const n = (u: number, v: number, h: number): [number, number] => [ox + (u - v) * 16, oy + (u + v) * 8 - h];
  // ropes
  rope(p, ...n(0.05, b / 2, wallH + roofH - 1), ...(n(-0.4, b / 2, 0).map(Math.round) as [number, number]));
  rope(p, ...n(a - 0.05, b / 2, wallH + roofH - 1), ...(n(a + 0.4, b / 2, 0).map(Math.round) as [number, number]));
  // left (lit) low wall along +tx at v=b
  const shadeL = (r: Ramp, base: number) => (x: number, y: number) => rampAt(r, (base + ((x + y) % 7 === 0 ? -0.5 : 0)) / (r.length - 1), x, y);
  polyFn(p, [n(0, b, wallH), n(a, b, wallH), n(a, b, 0), n(0, b, 0)], shadeL(c.body, c.body.length - 2.2));
  // right (shaded) end wall at u=a
  polyFn(p, [n(a, 0, wallH), n(a, b, wallH), n(a, b, 0), n(a, 0, 0)], shadeL(c.body, 1.6));
  // gable end triangle (shaded)
  polyFn(p, [n(a, 0, wallH), n(a, b, wallH), n(a, b / 2, wallH + roofH)], shadeL(c.body, 2.2));
  // roof slopes: front (lit) slope from ridge to v=b eave
  const stripes = kind === 'sirt-cizgili';
  polyFn(p, [n(0, b / 2, wallH + roofH), n(a, b / 2, wallH + roofH), n(a, b, wallH), n(0, b, wallH)], (x, y) => {
    let r = c.body;
    let base = r.length - 1.6;
    if (stripes && Math.floor((x - y * 2 + 400) / 4) % 2 === 0) {
      r = c.band;
      base = r.length - 2;
    }
    return rampAt(r, base / (r.length - 1), x, y);
  });
  // back slope barely visible as the ridge line highlight
  const r0 = n(0, b / 2, wallH + roofH);
  const r1 = n(a, b / 2, wallH + roofH);
  p.line(Math.round(r0[0]), Math.round(r0[1]), Math.round(r1[0]), Math.round(r1[1]), ri(c.body, c.body.length - 1));
  polyFn(p, [n(0, 0, wallH), n(a, 0, wallH), n(a, b / 2, wallH + roofH), n(0, b / 2, wallH + roofH)], (x, y) => rampAt(c.body, 2.6 / (c.body.length - 1), x, y));
  // valance band along the front eave
  for (let u = 0; u <= a + 0.001; u += 1 / 32) {
    const [x, y] = n(u, b, wallH);
    const xi = Math.round(x);
    const yi = Math.round(y);
    p.set(xi, yi, ri(c.band, c.band.length - 2));
    p.set(xi, yi + 1 + ((xi + flap) % 3 === 0 ? 1 : 0), ri(c.band, 2));
  }
  // door opening at the left gable end (lit side) with flap
  const [dx, dy] = n(0, b * 0.5, 0);
  for (let j = 0; j < wallH + 3; j++) {
    const w = Math.floor(j / 3);
    for (let i = -w; i <= w; i++) p.set(Math.round(dx) + i, Math.round(dy) - j + 1, P.outline[2]);
  }
  // left gable (lit) triangle — drawn around the door
  polyFn(p, [n(0, 0, wallH), n(0, b, wallH), n(0, b / 2, wallH + roofH)], shadeL(c.body, c.body.length - 1.5));
  p.set(Math.round(dx) - 2 - flap, Math.round(dy) - 2, ri(c.body, 3));
  // finials at the ridge ends
  p.set(Math.round(r0[0]), Math.round(r0[1]) - 1, P.gold[5]);
  p.set(Math.round(r1[0]), Math.round(r1[1]) - 1, P.gold[5]);
}

/** Small soldier tent (pup tent) */
function smallTent(p: PixelCanvas, cx: number, gy: number, kind: TentKind, flap: number): void {
  ridgeTent(p, cx, gy, 14, kind, flap);
}

export function drawTent(p: PixelCanvas, cx: number, gy: number, kind: TentKind, flap: number): void {
  if (kind.startsWith('konik')) conicalTent(p, cx, gy, kind === 'konik-kirmizi' ? 9 : 8, kind, flap);
  else if (kind === 'kucuk-bez') smallTent(p, cx, gy, kind, flap);
  else ridgeTent(p, cx, gy, 22, kind, flap);
}

/** Tent decor sheets: 'econ/cadir-<kind>' 32×32, 3 frames + ':flap' anim. Ground centre at (16, 26). */
export function generateTentTextures(gen: TextureGen): void {
  for (const k of TENT_KINDS) {
    const key = `econ/cadir-${k}`;
    gen.sheet(key, 32, 32, 3, (p, f) => {
      drawTent(p, 16, 26, k, f);
      p.outline(P.outline[1]);
    });
    gen.anim(`${key}:flap`, key, [0, 1, 0, 2], 3);
  }
}

/** The Otağ-ı Hümâyun pavilion (used by the otağ building art). */
export function imperialPavilion(p: PixelCanvas, cx: number, gy: number, flap: number): void {
  const rx = 22;
  const ry = 11;
  const wallH = 13;
  shadowEllipse(p, cx + 5, gy + 2, rx + 4, ry + 2, 0.32);
  // ropes
  for (const [dx, dy] of [[-rx - 9, -1], [rx + 9, 1], [-rx + 2, ry + 4], [rx - 4, ry + 4]]) rope(p, cx + Math.sign(dx) * 6, gy - wallH - 22, cx + dx, gy + dy);
  cylinder(p, cx, gy - wallH, rx, ry, wallH, RED, {
    tex: 'cloth',
    base: RED.length * 0.55,
    band: [
      { y0: wallH - 3, y1: wallH, ramp: GOLD, base: GOLD.length * 0.6 },
      { y0: 0, y1: 2, ramp: GOLD, base: GOLD.length * 0.45 },
    ],
  });
  // gilded medallion pattern on the wall
  for (let k = -3; k <= 3; k++) {
    const x = cx + k * 6;
    const u = (x - cx) / rx;
    const e = Math.sqrt(Math.max(0, 1 - u * u));
    const y = Math.round(gy - wallH + ry * e + 6);
    p.set(x, y, P.gold[5]);
    p.set(x - 1, y + 1, P.gold[4]);
    p.set(x + 1, y + 1, P.gold[4]);
    p.set(x, y + 2, P.gold[3]);
  }
  // grand door (front-left) with raised awning
  const dx = cx - 8;
  for (let j = 0; j < 10; j++)
    for (let i = -3; i <= 3; i++) p.set(dx + i, gy + ry - 1 - j, j > 7 && Math.abs(i) > 1 ? P.gold[4] : P.outline[2]);
  for (let i = -6; i <= 6; i++) {
    p.set(dx + i, gy + ry - 12 - (flap === 1 && i % 2 === 0 ? 1 : 0), P.gold[5]);
    p.set(dx + i, gy + ry - 11, P.red[4]);
  }
  vline(p, dx - 6, gy + ry - 11, gy + ry + 1, P.gold[3]);
  vline(p, dx + 6, gy + ry - 11, gy + ry + 1, P.gold[2]);
  // roof
  cone(p, cx, gy - wallH - 30, gy - wallH, rx + 2, ry + 1, RED, {
    seams: 12,
    base: RED.length * 0.58,
    bands: [
      { from: 0.1, to: 0.22, ramp: GOLD, base: GOLD.length * 0.62 },
      { from: 0.5, to: 0.56, ramp: GOLD, base: GOLD.length * 0.5 },
      { from: 0.84, to: 0.9, ramp: GOLD, base: GOLD.length * 0.45 },
    ],
  });
  // gold crescent-free medallions on the roof between the bands
  for (let k = -2; k <= 2; k++) {
    const x = cx + k * 7;
    const y = gy - wallH - 9 + Math.abs(k);
    p.set(x, y, P.gold[5]);
    p.set(x, y - 1, P.gold[6]);
    p.set(x - 1, y, P.gold[4]);
    p.set(x + 1, y, P.gold[4]);
  }
  // valance
  for (let x = -rx - 1; x <= rx + 1; x++) {
    const u = x / (rx + 2.5);
    const e = Math.sqrt(Math.max(0, 1 - u * u));
    const y = Math.round(gy - wallH + (ry + 1) * e);
    const zig = (x + flap) % 4 < 2 ? 1 : 0;
    p.set(cx + x, y, u < 0.2 ? P.gold[6] : P.gold[4]);
    p.set(cx + x, y + 1, u < 0.2 ? P.gold[5] : P.gold[3]);
    if (zig) p.set(cx + x, y + 2, P.red[3]);
  }
  // gold finial (alem) on a tall pole
  const top = gy - wallH - 30;
  vline(p, cx, top - 6, top, P.gold[3]);
  // large gilded knob (alem) on the imperial pavilion
  for (const [dx, dy, c] of [[-1, -7, 5], [0, -7, 6], [1, -7, 3], [-1, -8, 6], [0, -8, 6], [1, -8, 4], [0, -9, 5], [0, -10, 6]] as const)
    p.set(cx + dx, top + dy, P.gold[c]);
}
