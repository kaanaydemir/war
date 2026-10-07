import { P } from '../../art/palette';
import { bayer, PixelCanvas } from '../../art/pixel';
import type { TextureGen } from '../../art/texture';
import { DECOR_KINDS, DECOR_SPEC, type DecorKind } from './decor';
import { ihash, vnoise } from './noise';
import { SEASONS, type Season } from './season';

/**
 * WORLD DECOR ART — procedural pixel sprites (no Phaser import; uses TextureGen).
 * Light from the upper-left, selective dark outline on the lower/right edges,
 * hue-shifted ramps from art/palette.ts only. Trees get 4 wind-sway frames
 * (0 rest, 1 lean, 2 strong lean, 3 recoil).
 *
 * Keys: `world/<kind>-<season>` for seasonal kinds, `world/<kind>` + `world/<kind>-kis`
 * otherwise. Frame index = variant * frames + swayFrame.
 */

type Ramp = readonly string[];

const AUTUMN_A: Ramp = [P.red[1], P.red[2], P.roof[2], P.roof[3], P.bronze[4], P.gold[4], P.gold[5], P.gold[6]];
const AUTUMN_B: Ramp = [P.dirt[1], P.roof[1], P.roof[2], P.red[3], P.roof[4], P.roof[5], P.bronze[5], P.gold[5]];
const SPRING: Ramp = [P.foliage[1], P.foliage[2], P.foliage[3], P.foliage[5], P.grass[4], P.grass[5], P.grass[6], P.grass[7]];
const SUMMER: Ramp = [P.foliage[0], P.foliage[1], P.foliage[2], P.foliage[3], P.foliage[4], P.foliage[5], P.foliage[6], P.grass[6]];
const PLANE: Ramp = [P.foliage[1], P.foliage[2], P.foliage[4], P.grass[3], P.grass[4], P.grass[5], P.grass[6], P.grass[7]];
const OLIVE: Ramp = [P.cypress[1], P.foliage[2], P.foliage[3], P.foliage[4], P.foliage[5], P.grass[4], P.limestone[3], P.limestone[4]];
const CYPRESS: Ramp = [P.outline[1], P.cypress[0], P.cypress[1], P.cypress[2], P.cypress[3], P.cypress[4], P.foliage[5]];
const DRY: Ramp = [P.dirt[2], P.dryGrass[0], P.dryGrass[1], P.dryGrass[2], P.dryGrass[3], P.dryGrass[4], P.dryGrass[5]];
const BARE: Ramp = [P.wood[1], P.wood[2], P.wood[3], P.wood[4], P.wood[5]];

const LX = -0.55;
const LY = -0.68;
const LZ = 0.48;

interface Blob {
  x: number;
  y: number;
  r: number;
}

function pick(r: Ramp, t: number, x: number, y: number): string {
  const i = Math.floor(t * (r.length - 1) + bayer(x, y) - 0.5 + 0.5);
  return r[Math.max(0, Math.min(r.length - 1, i))];
}

/** Draw a lumpy, lit canopy made of spheres into p (no sway). */
function canopy(p: PixelCanvas, blobs: Blob[], ramp: Ramp, seed: number, clump = 2.6, rough = 0.42): void {
  const mask = new Float32Array(p.w * p.h).fill(-9);
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      let best = -9;
      let nx = 0;
      let ny = 0;
      let nz = 0;
      for (const b of blobs) {
        const dx = x + 0.5 - b.x;
        const dy = y + 0.5 - b.y;
        // ragged leafy edge
        const rr = b.r * (0.86 + 0.28 * vnoise(x / 1.9 + seed, y / 1.9 - seed, seed));
        const d2 = dx * dx + dy * dy;
        if (d2 > rr * rr) continue;
        const z = Math.sqrt(rr * rr - d2);
        const key = z + b.y * 0.35;
        if (key > best) {
          best = key;
          nx = dx / rr;
          ny = dy / rr;
          nz = z / rr;
        }
      }
      if (best === -9) continue;
      let t = 0.5 + 0.55 * (nx * LX + ny * LY + nz * LZ);
      const c = vnoise(x / clump + seed * 3, y / clump - seed, seed + 5);
      t += (c - 0.5) * rough * 2;
      // leaf clusters: lit tops of clumps
      const c2 = vnoise(x / clump + seed * 3, (y + 1.2) / clump - seed, seed + 5);
      if (c - c2 > 0.12) t += 0.18;
      if (c2 - c > 0.14) t -= 0.12;
      mask[y * p.w + x] = Math.max(0, Math.min(1, t));
    }
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      const t = mask[y * p.w + x];
      if (t < -1) continue;
      const empty = (xx: number, yy: number) => xx < 0 || yy < 0 || xx >= p.w || yy >= p.h || mask[yy * p.w + xx] < -1;
      let tt = t;
      // selective outline: dark on lower/right silhouette, rim light on upper-left
      if (empty(x + 1, y) || empty(x, y + 1)) tt = Math.min(tt, 0.08);
      else if (empty(x - 1, y) || empty(x, y - 1)) tt = Math.min(1, tt + 0.12);
      const sparkle = ihash(x, y, seed + 77) < 0.05 && tt > 0.62;
      p.set(x, y, sparkle ? ramp[ramp.length - 1] : pick(ramp, tt, x, y));
    }
}

/** Copy src into dst shearing rows above `pivot` horizontally by up to `amp` px at the top. */
function swayBlit(dst: PixelCanvas, src: PixelCanvas, amp: number, top: number, pivot: number): void {
  for (let y = 0; y < src.h; y++) {
    const k = y >= pivot ? 0 : Math.pow((pivot - y) / Math.max(1, pivot - top), 1.3);
    const off = Math.round(amp * k);
    for (let x = 0; x < src.w; x++) {
      const [r, g, b, a] = src.get(x, y);
      if (a === 0) continue;
      dst.set(x + off, y, (r << 16) | (g << 8) | b, a / 255);
    }
  }
}

const SWAY = [0, 1, 2, -1];

function trunk(p: PixelCanvas, x: number, yTop: number, yBot: number, w: number, ramp: Ramp = P.wood): void {
  for (let y = yTop; y <= yBot; y++) {
    const flare = y > yBot - 2 ? 1 : 0;
    for (let i = -flare; i < w + flare; i++) {
      const lit = i <= 0;
      const c = i === w - 1 + flare ? ramp[1] : lit ? ramp[5] : ramp[3];
      p.set(x + i, y, c);
    }
  }
  // roots
  p.set(x - 2, yBot, ramp[2]);
  p.set(x + w + 1, yBot, ramp[1]);
}

/** Bare winter crown: recursive branches + snow on top. */
function bareCrown(p: PixelCanvas, x: number, y: number, len: number, ang: number, depth: number, seed: number, snow: boolean): void {
  const ex = x + Math.cos(ang) * len;
  const ey = y + Math.sin(ang) * len;
  const steps = Math.max(1, Math.round(len));
  for (let s = 0; s <= steps; s++) {
    const px = Math.round(x + (ex - x) * (s / steps));
    const py = Math.round(y + (ey - y) * (s / steps));
    p.set(px, py, depth > 2 ? BARE[3] : BARE[2]);
    if (depth > 2 && Math.cos(ang) < 0) p.set(px - 1, py, BARE[4]);
    if (snow && depth >= 2 && Math.abs(Math.sin(ang)) < 0.75 && ihash(px, py, seed) < 0.6) p.set(px, py - 1, P.snow[4]);
  }
  if (depth <= 0) return;
  const n = depth > 2 ? 3 : 2;
  for (let i = 0; i < n; i++) {
    const da = (ihash(seed, i, depth) - 0.5) * 1.3 + (i - (n - 1) / 2) * 0.55;
    bareCrown(p, ex, ey, len * (0.62 + ihash(seed, i + 9, depth) * 0.2), ang + da, depth - 1, seed * 3 + i + 1, snow);
  }
}

function deciduousRamp(season: Season, v: number): Ramp {
  if (season === 'ilkbahar') return v === 2 ? SUMMER : SPRING;
  if (season === 'yaz') return SUMMER;
  return v % 2 ? AUTUMN_A : AUTUMN_B;
}

// ───────────────────────────── kinds ─────────────────────────────

function drawAgac(p: PixelCanvas, v: number, f: number, season: Season): void {
  const s = DECOR_SPEC.agac;
  const fx = s.fx;
  const fy = s.fy;
  const seed = 11 + v * 7;
  if (season === 'kis') {
    trunk(p, fx - 1, fy - 12, fy, 2);
    const crown = new PixelCanvas(p.w, p.h);
    bareCrown(crown, fx, fy - 11, 6, -Math.PI / 2, 4, seed, true);
    // twig haze
    for (let y = 2; y < fy - 8; y++)
      for (let x = 3; x < p.w - 3; x++) {
        const dx = (x - fx) / 10;
        const dy = (y - (fy - 18)) / 9;
        if (dx * dx + dy * dy < 1 && ihash(x, y, seed) < 0.16) crown.under(x, y, BARE[1]);
      }
    swayBlit(p, crown, SWAY[f] * 0.5, 2, fy - 10);
    return;
  }
  trunk(p, fx - 1, fy - 9, fy, 2);
  const shapes: Blob[][] = [
    [
      { x: fx - 4, y: fy - 15, r: 6.5 },
      { x: fx + 4, y: fy - 14, r: 6 },
      { x: fx, y: fy - 20, r: 7 },
      { x: fx - 1, y: fy - 11, r: 5 },
    ],
    [
      { x: fx - 5, y: fy - 13, r: 5.5 },
      { x: fx + 3, y: fy - 17, r: 7.5 },
      { x: fx - 2, y: fy - 22, r: 5.5 },
      { x: fx + 5, y: fy - 11, r: 4.5 },
    ],
    [
      { x: fx, y: fy - 17, r: 8.5 },
      { x: fx - 6, y: fy - 13, r: 4.5 },
      { x: fx + 6, y: fy - 14, r: 4.5 },
    ],
  ];
  const crown = new PixelCanvas(p.w, p.h);
  canopy(crown, shapes[v % 3], deciduousRamp(season, v), seed);
  if (season === 'ilkbahar' && v === 1) {
    // a tree in blossom
    for (let i = 0; i < 26; i++) {
      const x = Math.round(fx - 8 + ihash(i, v, 3) * 16);
      const y = Math.round(fy - 26 + ihash(i, v, 4) * 16);
      if (crown.alphaAt(x, y)) crown.set(x, y, ihash(i, 1, 5) < 0.5 ? P.cloth[5] : P.roof[6]);
    }
  }
  swayBlit(p, crown, SWAY[f], 3, fy - 8);
}

function drawCinar(p: PixelCanvas, v: number, f: number, season: Season): void {
  const s = DECOR_SPEC.cinar;
  const fx = s.fx;
  const fy = s.fy;
  const seed = 31 + v * 13;
  const bark: Ramp = [P.stone[2], P.stone[3], P.limestone[2], P.limestone[3], P.limestone[4], P.limestone[5]];
  // mottled pale plane-tree trunk, forked
  for (let y = fy - 14; y <= fy; y++)
    for (let i = -1; i < 3; i++) {
      const m = ihash(i + 9, y, seed) < 0.3;
      p.set(fx - 1 + i, y, m ? bark[1] : i <= 0 ? bark[4] : i === 2 ? bark[1] : bark[3]);
    }
  p.set(fx - 3, fy, bark[2]);
  p.set(fx + 3, fy, bark[1]);
  if (season === 'kis') {
    const crown = new PixelCanvas(p.w, p.h);
    bareCrown(crown, fx, fy - 13, 7, -Math.PI / 2 - 0.4, 4, seed, true);
    bareCrown(crown, fx + 1, fy - 13, 7, -Math.PI / 2 + 0.45, 4, seed + 5, true);
    swayBlit(p, crown, SWAY[f] * 0.5, 2, fy - 12);
    return;
  }
  const ramp = season === 'ilkbahar' ? PLANE : season === 'yaz' ? SUMMER : AUTUMN_A;
  const blobs: Blob[] =
    v === 0
      ? [
          { x: fx - 8, y: fy - 18, r: 8 },
          { x: fx + 8, y: fy - 19, r: 8.5 },
          { x: fx, y: fy - 25, r: 9.5 },
          { x: fx - 2, y: fy - 15, r: 7 },
          { x: fx + 4, y: fy - 30, r: 5.5 },
        ]
      : [
          { x: fx - 6, y: fy - 21, r: 9.5 },
          { x: fx + 7, y: fy - 22, r: 9 },
          { x: fx + 1, y: fy - 16, r: 7.5 },
          { x: fx - 1, y: fy - 29, r: 6.5 },
        ];
  const crown = new PixelCanvas(p.w, p.h);
  canopy(crown, blobs, ramp, seed, 3.2, 0.48);
  swayBlit(p, crown, SWAY[f], 2, fy - 12);
}

function drawServi(p: PixelCanvas, v: number, f: number, winter: boolean): void {
  const s = DECOR_SPEC.servi;
  const fx = s.fx;
  const fy = s.fy;
  const hgt = [27, 23, 30][v % 3];
  const wmax = [3.6, 3.2, 3.9][v % 3];
  const crown = new PixelCanvas(p.w, p.h);
  const mask: number[] = [];
  for (let y = fy - hgt; y <= fy - 1; y++) {
    const t = (y - (fy - hgt)) / hgt; // 0 top → 1 bottom
    const half = wmax * Math.pow(Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.62), 0.9) * (t > 0.9 ? 0.75 : 1);
    for (let x = Math.floor(fx - half - 1); x <= fx + half + 1; x++) {
      const dx = (x + 0.5 - fx) / Math.max(0.6, half);
      const edge = 0.85 + 0.3 * vnoise(x * 0.8, y * 0.7, v + 3);
      if (Math.abs(dx) > edge) continue;
      // cylinder lighting from the left, vertical leaf streaks
      let tt = 0.62 - dx * 0.42 + (vnoise(x * 0.9, y * 0.35, v + 9) - 0.5) * 0.55 - t * 0.12;
      if (Math.abs(dx) > edge - 0.18 && dx > 0) tt = 0.05;
      mask.push(x, y);
      crown.set(x, y, pick(CYPRESS, Math.max(0, Math.min(1, tt)), x, y));
      if (winter && dx < -0.1 && ihash(x, y, v) < 0.28) crown.set(x, y, ihash(x, y, 2) < 0.5 ? P.snow[3] : P.snow[4]);
    }
  }
  p.set(fx, fy, P.wood[2]);
  p.set(fx - 1, fy, P.wood[3]);
  swayBlit(p, crown, SWAY[f] * 0.5, fy - hgt, fy - 2);
}

function drawZeytin(p: PixelCanvas, v: number, f: number, winter: boolean): void {
  const s = DECOR_SPEC.zeytin;
  const fx = s.fx;
  const fy = s.fy;
  // gnarled twin trunk
  for (let y = fy - 6; y <= fy; y++) {
    const o = y < fy - 3 ? (y % 2 ? 1 : 0) : 0;
    p.set(fx - 1 + o, y, P.wood[4]);
    p.set(fx + o, y, P.wood[2]);
  }
  p.set(fx + 1, fy - 5, P.wood[3]);
  p.set(fx + 2, fy - 6, P.wood[3]);
  const crown = new PixelCanvas(p.w, p.h);
  canopy(
    crown,
    v
      ? [
          { x: fx - 4, y: fy - 9, r: 4.5 },
          { x: fx + 3, y: fy - 10, r: 5 },
          { x: fx, y: fy - 12, r: 4 },
        ]
      : [
          { x: fx - 3, y: fy - 10, r: 5 },
          { x: fx + 4, y: fy - 9, r: 4 },
        ],
    OLIVE,
    41 + v,
    1.8,
    0.5,
  );
  if (winter)
    for (let y = 0; y < p.h; y++)
      for (let x = 0; x < p.w; x++)
        if (crown.alphaAt(x, y) && !crown.alphaAt(x, y - 1) && ihash(x, y, 9) < 0.7) crown.set(x, y, P.snow[4]);
  swayBlit(p, crown, SWAY[f] * 0.5, 3, fy - 6);
}

function drawMeyve(p: PixelCanvas, v: number, f: number, season: Season): void {
  const s = DECOR_SPEC.meyve;
  const fx = s.fx;
  const fy = s.fy;
  trunk(p, fx - 1, fy - 6, fy, 2);
  if (season === 'kis') {
    const crown = new PixelCanvas(p.w, p.h);
    bareCrown(crown, fx, fy - 6, 4, -Math.PI / 2, 3, 51 + v, true);
    swayBlit(p, crown, SWAY[f] * 0.5, 2, fy - 6);
    return;
  }
  const ramp = season === 'ilkbahar' ? SPRING : season === 'yaz' ? SUMMER : v ? AUTUMN_A : AUTUMN_B;
  const crown = new PixelCanvas(p.w, p.h);
  canopy(
    crown,
    [
      { x: fx - 3, y: fy - 10, r: 4.5 },
      { x: fx + 3, y: fy - 10, r: 4.5 },
      { x: fx, y: fy - 13, r: 5 },
    ],
    ramp,
    61 + v,
    2.1,
  );
  if (season === 'ilkbahar' || season === 'yaz') {
    // blossom (spring) or fruit (summer)
    for (let i = 0; i < (season === 'ilkbahar' ? 34 : 12); i++) {
      const x = Math.round(fx - 7 + ihash(i, v, 13) * 14);
      const y = Math.round(fy - 18 + ihash(i, v, 14) * 12);
      if (!crown.alphaAt(x, y)) continue;
      if (season === 'ilkbahar') crown.set(x, y, ihash(i, v, 15) < 0.55 ? P.cloth[5] : v ? P.roof[6] : P.cloth[4]);
      else {
        crown.set(x, y, v ? P.red[5] : P.gold[5]);
        crown.set(x, y + 1, v ? P.red[3] : P.bronze[3]);
      }
    }
  }
  swayBlit(p, crown, SWAY[f], 2, fy - 6);
}

function drawAsma(p: PixelCanvas, v: number, f: number, season: Season): void {
  const s = DECOR_SPEC.asma;
  const fx = s.fx;
  const fy = s.fy;
  // stake
  for (let y = fy - 8; y <= fy; y++) {
    p.set(fx, y, P.wood[4]);
    p.set(fx + 1, y, P.wood[2]);
  }
  if (season === 'kis') {
    for (let i = 0; i < 6; i++) p.set(fx - 3 + i, fy - 5 + (i % 2), P.wood[3]);
    p.set(fx, fy - 9, P.snow[4]);
    return;
  }
  const ramp = season === 'sonbahar' ? (v ? AUTUMN_A : AUTUMN_B) : season === 'yaz' ? SUMMER : SPRING;
  const crown = new PixelCanvas(p.w, p.h);
  canopy(
    crown,
    [
      { x: fx - 3, y: fy - 5, r: 3.4 },
      { x: fx + 3, y: fy - 5, r: 3.4 },
      { x: fx, y: fy - 7, r: 3 },
    ],
    ramp,
    71 + v,
    1.6,
    0.5,
  );
  if (season === 'yaz' || season === 'sonbahar') {
    const gx = fx + (v ? 2 : -3);
    crown.set(gx, fy - 3, P.purple[3]);
    crown.set(gx + 1, fy - 3, P.purple[2]);
    crown.set(gx, fy - 2, P.purple[2]);
    crown.set(gx, fy - 4, P.purple[4]);
  }
  swayBlit(p, crown, SWAY[f] * 0.5, 1, fy - 2);
}

function drawCali(p: PixelCanvas, v: number, f: number, season: Season): void {
  const s = DECOR_SPEC.cali;
  const fx = s.fx;
  const fy = s.fy;
  if (season === 'kis') {
    const crown = new PixelCanvas(p.w, p.h);
    for (let i = 0; i < 5; i++) bareCrown(crown, fx - 2 + i, fy, 2.5, -Math.PI / 2 + (i - 2) * 0.35, 2, 81 + v * 5 + i, false);
    for (let x = fx - 5; x <= fx + 5; x++) if (ihash(x, v, 3) < 0.6) crown.set(x, fy - 4 - (x & 1), P.snow[4]);
    swayBlit(p, crown, 0, 0, fy);
    return;
  }
  const ramp = season === 'sonbahar' ? (v % 2 ? AUTUMN_A : AUTUMN_B) : season === 'yaz' ? SUMMER : SPRING;
  const crown = new PixelCanvas(p.w, p.h);
  const blobs: Blob[] = [
    { x: fx - 3, y: fy - 3, r: 3.6 },
    { x: fx + 3, y: fy - 3, r: 3.4 },
    { x: fx, y: fy - 5, r: 3.8 },
  ];
  if (v === 2) blobs.push({ x: fx + 5, y: fy - 2, r: 2.5 });
  canopy(crown, blobs, ramp, 91 + v, 1.7);
  if (season === 'ilkbahar' && v === 0)
    for (let i = 0; i < 6; i++) {
      const x = Math.round(fx - 5 + ihash(i, 3, 1) * 10);
      const y = Math.round(fy - 8 + ihash(i, 3, 2) * 6);
      if (crown.alphaAt(x, y)) crown.set(x, y, P.cloth[5]);
    }
  swayBlit(p, crown, SWAY[f] * 0.5, 1, fy - 1);
}

function drawKaya(p: PixelCanvas, v: number, winter: boolean): void {
  const s = DECOR_SPEC.kaya;
  const fx = s.fx;
  const fy = s.fy;
  const shapes: [number, number][][] = [
    [[fx - 6, fy], [fx - 5, fy - 4], [fx - 1, fy - 7], [fx + 4, fy - 6], [fx + 6, fy - 2], [fx + 4, fy + 1], [fx - 3, fy + 1]],
    [[fx - 4, fy], [fx - 3, fy - 3], [fx + 1, fy - 5], [fx + 4, fy - 3], [fx + 4, fy], [fx, fy + 1]],
    [[fx - 6, fy], [fx - 4, fy - 5], [fx, fy - 6], [fx + 2, fy - 8], [fx + 6, fy - 4], [fx + 5, fy], [fx, fy + 1]],
  ];
  const poly = shapes[v % 3];
  const tmp = new PixelCanvas(p.w, p.h);
  tmp.poly(poly, P.stone[3]);
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      if (!tmp.alphaAt(x, y)) continue;
      // facets: upper-left lit, lower-right shaded
      const up = !tmp.alphaAt(x, y - 1) || !tmp.alphaAt(x, y - 2);
      const right = !tmp.alphaAt(x + 1, y) || !tmp.alphaAt(x + 2, y);
      const facet = vnoise(x * 0.45, y * 0.45, v + 2);
      let i = 3 + (x < fx ? 1 : 0) + (facet > 0.6 ? 1 : 0) - (y > fy - 2 ? 1 : 0);
      if (up) i += 2;
      if (right) i = 1;
      let c: string = P.stone[Math.max(1, Math.min(7, i))];
      if (up && !winter && ihash(x, y, v) < 0.35) c = P.grass[4]; // moss
      if (up && winter) c = ihash(x, y, 2) < 0.5 ? P.snow[4] : P.snow[3];
      if (!tmp.alphaAt(x, y + 1) || !tmp.alphaAt(x + 1, y)) c = P.stone[0];
      p.set(x, y, c);
    }
}

function drawSaz(p: PixelCanvas, v: number, f: number, season: Season): void {
  const s = DECOR_SPEC.saz;
  const fx = s.fx;
  const fy = s.fy;
  const green = season === 'ilkbahar' || season === 'yaz';
  const ramp: Ramp = green ? [P.grass[2], P.grass[3], P.grass[4], P.grass[5], P.grass[6]] : [P.dryGrass[0], P.dryGrass[1], P.dryGrass[2], P.dryGrass[3], P.dryGrass[4]];
  const n = 7 + v;
  for (let i = 0; i < n; i++) {
    const x0 = fx - 4 + Math.round(ihash(i, v, 1) * 8);
    const hgt = 6 + Math.round(ihash(i, v, 2) * 7);
    const lean = (ihash(i, v, 3) - 0.5) * 2;
    const sway = SWAY[(f + i) % 4] * 0.6;
    for (let k = 0; k < hgt; k++) {
      const t = k / hgt;
      const x = Math.round(x0 + (lean + sway) * t * t * 2);
      const y = fy - k;
      p.set(x, y, ramp[Math.min(4, Math.floor(1 + t * 3.4 + (i % 2)))]);
    }
    if (ihash(i, v, 4) < 0.35) {
      const x = Math.round(x0 + (lean + sway) * 2);
      p.set(x, fy - hgt, P.wood[2]);
      p.set(x, fy - hgt - 1, P.wood[3]);
      p.set(x, fy - hgt + 1, P.wood[1]);
    }
    if (season === 'kis' && ihash(i, v, 5) < 0.5) p.set(Math.round(x0 + lean * 2), fy - hgt, P.snow[4]);
  }
}

/** Isometric house helper: walls + gable roof. (ox,oy) = north vertex at ground. */
function house(p: PixelCanvas, ox: number, oy: number, a: number, b: number, wallH: number, roofH: number, wall: Ramp, roof: Ramp, winter: boolean, thatch: boolean): void {
  const hw = 8;
  const hh = 4;
  // walls (left face lit, right face shaded)
  p.isoBox(ox, oy, a, b, wallH, { top: wall[3], left: wall[4], right: wall[2] }, 16, 8);
  // stone texture on walls
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      const [r, g, bb, al] = p.get(x, y);
      if (!al) continue;
      if (ihash(x, y, 5) < 0.12) p.set(x, y, (r << 16) | (g << 8) | bb, 1);
    }
  // gable roof along a (ridge runs +tx)
  const top: [number, number] = [ox, oy - wallH];
  const right: [number, number] = [ox + a * hw, oy + a * hh - wallH];
  const bottom: [number, number] = [ox + (a - b) * hw, oy + (a + b) * hh - wallH];
  const left: [number, number] = [ox - b * hw, oy + b * hh - wallH];
  const r0: [number, number] = [(top[0] + left[0]) / 2, (top[1] + left[1]) / 2 - roofH];
  const r1: [number, number] = [(right[0] + bottom[0]) / 2, (right[1] + bottom[1]) / 2 - roofH];
  const ext = 1;
  // far roof plane (north-east), near plane (south-west, lit by the sun from the left)
  p.poly([[top[0], top[1] - ext], [right[0] + ext, right[1] - ext], r1, r0], roof[2]);
  p.poly([[left[0] - ext, left[1] + ext], [bottom[0], bottom[1] + ext], r1, r0], roof[4]);
  // gable end (south-east face, shaded wall triangle)
  p.poly([bottom, right, r1], wall[2]);
  // tile courses / thatch strokes on the lit plane
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      const [r, g, bb, al] = p.get(x, y);
      if (!al) continue;
      const c = (r << 16) | (g << 8) | bb;
      const lit = c === parseInt(roof[4].slice(1), 16);
      const far = c === parseInt(roof[2].slice(1), 16);
      if (!lit && !far) continue;
      if (thatch) {
        if (ihash(x, y, 3) < 0.25) p.set(x, y, lit ? roof[5] : roof[1]);
      } else if ((y + Math.floor(x / 2)) % 3 === 0) p.set(x, y, lit ? roof[3] : roof[1]);
      if (winter && (lit || far) && ihash(x, y, 8) < 0.82) p.set(x, y, lit ? P.snow[4] : P.snow[2]);
    }
  // ridge highlight
  p.line(r0[0], r0[1], r1[0], r1[1], winter ? P.snow[4] : roof[6]);
}

function drawEv(p: PixelCanvas, v: number, winter: boolean): void {
  const wall: Ramp = v ? [P.limestone[0], P.limestone[1], P.limestone[2], P.limestone[3], P.limestone[4], P.limestone[5]] : [P.stone[2], P.stone[3], P.stone[4], P.stone[5], P.stone[6], P.stone[7]];
  const ox = 17;
  const oy = 17;
  // chimney behind the roof
  p.rect(ox + 5, oy - 15, 2, 6, wall[2]);
  p.set(ox + 5, oy - 15, wall[4]);
  house(p, ox, oy, 1.5, 1, 9, 7, wall, P.roof, winter, false);
  // door & window on the lit (left) face
  p.rect(13, 19, 2, 4, P.wood[1]);
  p.set(13, 19, P.wood[3]);
  p.rect(17, 19, 2, 2, P.outline[1]);
  p.outline(P.outline[1]);
}

function drawKulube(p: PixelCanvas, v: number, winter: boolean): void {
  const wall: Ramp = [P.wood[1], P.wood[2], P.wood[3], P.wood[4], P.wood[5], P.wood[6]];
  const thatch: Ramp = [P.dryGrass[0], P.dryGrass[1], P.dryGrass[2], P.dryGrass[3], P.dryGrass[4], P.dryGrass[5], P.dryGrass[5]];
  house(p, 13, 13, 1, 1, 6, 6, wall, thatch, winter, true);
  p.rect(9, 15, 2, 4, P.outline[1]);
  if (v) {
    // little fence
    for (let i = 0; i < 4; i++) p.set(1 + i * 2, 23 - i, P.wood[4]);
  }
  p.outline(P.outline[1]);
}

function drawSapel(p: PixelCanvas, winter: boolean): void {
  // small cross-in-square chapel: banded limestone/brick walls, drum & dome, cross
  const ox = 15;
  const oy = 24;
  const wall: Ramp = [P.limestone[0], P.limestone[1], P.limestone[2], P.limestone[3], P.limestone[4], P.limestone[5]];
  house(p, ox, oy, 1.4, 1.1, 11, 4, wall, P.roof, winter, false);
  // brick bands
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      const [r, g, bb, al] = p.get(x, y);
      if (!al) continue;
      const c = (r << 16) | (g << 8) | bb;
      const isWall = c === parseInt(wall[4].slice(1), 16) || c === parseInt(wall[2].slice(1), 16);
      if (isWall && (y % 5 === 0 || y % 5 === 1)) p.set(x, y, x < ox + 2 ? P.brick[4] : P.brick[2]);
    }
  // drum + dome
  const cx = ox + 2;
  const cy = oy - 12;
  p.rect(cx - 3, cy - 3, 7, 4, wall[3]);
  p.rect(cx + 1, cy - 3, 3, 4, wall[2]);
  for (let y = -4; y <= 0; y++)
    for (let x = -4; x <= 4; x++) {
      if (x * x * 0.9 + y * y * 2.4 > 16) continue;
      const lit = x < 0 && y < -1;
      p.set(cx + x, cy - 3 + y, winter ? (lit ? P.snow[4] : P.snow[2]) : lit ? P.roof[5] : x > 1 ? P.roof[2] : P.roof[3]);
    }
  // gold cross
  p.set(cx, cy - 9, P.gold[5]);
  p.set(cx, cy - 10, P.gold[6]);
  p.set(cx, cy - 11, P.gold[5]);
  p.set(cx - 1, cy - 10, P.gold[4]);
  p.set(cx + 1, cy - 10, P.gold[4]);
  // door, arched window
  p.rect(8, 25, 2, 4, P.wood[1]);
  p.set(12, 24, P.outline[1]);
  p.set(12, 25, P.outline[1]);
  p.outline(P.outline[1]);
}

function drawTinaz(p: PixelCanvas, v: number): void {
  const s = DECOR_SPEC.tinaz;
  const fx = s.fx;
  const fy = s.fy;
  const r = v ? 5 : 4;
  for (let y = -r - 3; y <= 0; y++)
    for (let x = -r; x <= r; x++) {
      const nx = x / r;
      const ny = y / (r + 3);
      if (nx * nx + ny * ny > 1) continue;
      const t = 0.55 - nx * 0.4 - ny * 0.25 + (ihash(x, y, v) - 0.5) * 0.4;
      p.set(fx + x, fy + y, pick(DRY, Math.max(0, Math.min(1, t)), x, y));
    }
  p.set(fx, fy - r - 4, P.wood[3]);
  p.outline(P.outline[1]);
}

// ───────────────────────────── registration ─────────────────────────────

export function decorTextureKey(kind: DecorKind, season: Season): string {
  const s = DECOR_SPEC[kind];
  if (s.seasonal) return `world/${kind}-${season}`;
  return season === 'kis' ? `world/${kind}-kis` : `world/${kind}`;
}

export function drawDecor(kind: DecorKind, p: PixelCanvas, variant: number, frame: number, season: Season): void {
  const winter = season === 'kis';
  switch (kind) {
    case 'agac':
      return drawAgac(p, variant, frame, season);
    case 'cinar':
      return drawCinar(p, variant, frame, season);
    case 'servi':
      return drawServi(p, variant, frame, winter);
    case 'zeytin':
      return drawZeytin(p, variant, frame, winter);
    case 'meyve':
      return drawMeyve(p, variant, frame, season);
    case 'asma':
      return drawAsma(p, variant, frame, season);
    case 'cali':
      return drawCali(p, variant, frame, season);
    case 'kaya':
      return drawKaya(p, variant, winter);
    case 'saz':
      return drawSaz(p, variant, frame, season);
    case 'ev':
      return drawEv(p, variant, winter);
    case 'kulube':
      return drawKulube(p, variant, winter);
    case 'sapel':
      return drawSapel(p, winter);
    case 'tinaz':
      return drawTinaz(p, variant);
  }
}

/** Register every decor spritesheet (all seasons). */
export function generateWorldTextures(gen: TextureGen): void {
  for (const kind of DECOR_KINDS) {
    const s = DECOR_SPEC[kind];
    const seasons: Season[] = s.seasonal ? SEASONS : ['ilkbahar', 'kis'];
    for (const season of seasons) {
      const key = decorTextureKey(kind, season);
      gen.sheet(key, s.w, s.h, s.variants * s.frames, (p, i) => drawDecor(kind, p, Math.floor(i / s.frames), i % s.frames, season));
    }
  }
}
