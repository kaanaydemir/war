import { HALF_H, HALF_W, HEIGHT_STEP, WORLD_ORIGIN_X, WORLD_ORIGIN_Y } from '../../core/constants';
import { tileToWorld } from '../../core/iso';
import { P } from '../../art/palette';
import { bayer } from '../../art/pixel';
import { DECOR_SPEC, type DecorItem } from './decor';
import { fbm, ihash, vnoise } from './noise';
import type { Season } from './season';
import { MOAT_DEPTH, moatDepth as moatProfile, SEG_GALATAWALL, SEG_LANDWALL, SEG_ROAD, T, terrace, type WorldData } from './terrain';

/**
 * TERRAIN BAKER (pure; writes RGBA into a PixelCanvas-style buffer).
 *
 * Chunks are screen-aligned world-pixel rectangles. Each column is rendered
 * front-to-back as a height field ("voxel column" with a y-buffer): lifted land
 * occludes what lies behind it, and where the ground drops toward the viewer (shore
 * banks, terraced ledges, the moat scarp) earthen/stone skirts with strata appear.
 * Colours are palette ramp indices (art/palette.ts) chosen per material with dithered
 * slope lighting (sun from the upper-left); a stamp pass adds tufts, flowers and
 * pebbles; baked, dithered decor shadows fall to the lower right; cliff bases get
 * contact shadows. Water pixels stay transparent (the water shader shows through).
 */

export const CHUNK_W = 512;
export const CHUNK_H = 256;
const LIFT = 4 * HEIGHT_STEP + 6;

// ── ramps ──
const RAMP_LIST = [
  P.outline, // 0 (unused: transparent)
  P.grass, // 1
  P.dryGrass, // 2
  P.sand, // 3
  P.dirt, // 4
  P.stone, // 5
  P.limestone, // 6
  P.snow, // 7
  P.foliage, // 8
  P.water, // 9
  P.red, // 10
  P.gold, // 11
  P.cloth, // 12
  P.brick, // 13
  P.wood, // 14
  P.bronze, // 15
  P.green, // 16
  P.purple, // 17
  P.blue, // 18
] as const;
const RG = 1, RD = 2, RS = 3, RDI = 4, RST = 5, RL = 6, RSN = 7, RF = 8, RW = 9, RR = 10, RGO = 11, RC = 12, RB = 13, RBR = 15, RPU = 17;

/** Packed little-endian ABGR colours per ramp/index. */
const RAMP_RGBA: Uint32Array[] = RAMP_LIST.map((r) => {
  const a = new Uint32Array(r.length);
  r.forEach((c, i) => {
    const n = parseInt(c.slice(1), 16);
    a[i] = ((0xff << 24) | ((n & 255) << 16) | (((n >> 8) & 255) << 8) | ((n >> 16) & 255)) >>> 0;
  });
  return a;
});
const RAMP_LEN = RAMP_LIST.map((r) => r.length);

// materials (for stamps)
const M_GRASS = 1, M_FIELD = 2, M_FOREST = 3, M_ROCK = 4, M_SAND = 5, M_ROAD = 6, M_CITY = 7, M_MOAT = 8, M_FOOT = 9, M_SKIRT = 10, M_GARDEN = 11;

const B4 = new Float32Array(16);
for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) B4[y * 4 + x] = bayer(x, y);

/** 256×256 world-pixel hash tables (fast per-pixel randomness). */
const HT1 = new Float32Array(65536);
const HT2 = new Float32Array(65536);
const HT3 = new Float32Array(65536);
for (let i = 0; i < 65536; i++) {
  HT1[i] = ihash(i & 255, i >> 8, 7);
  HT2[i] = ihash(i & 255, i >> 8, 8);
  HT3[i] = ihash(i & 255, i >> 8, 21);
}

/** Clustered dither thresholds (equalized small-scale value noise): organic clumps instead of checkerboards. */
const CLUSTER = (() => {
  const n = 65536;
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i & 255;
    const y = i >> 8;
    // tileable 256 period: noise on a torus via wrapped lattice
    const cells = 96;
    const fx = (x / 256) * cells;
    const fy = (y / 256) * cells;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    let tx = fx - x0;
    let ty = fy - y0;
    tx = tx * tx * (3 - 2 * tx);
    ty = ty * ty * (3 - 2 * ty);
    const g = (a: number, b: number) => ihash(a % cells, b % cells, 4242);
    const v = g(x0, y0) + (g(x0 + 1, y0) - g(x0, y0)) * tx;
    const w = g(x0, y0 + 1) + (g(x0 + 1, y0 + 1) - g(x0, y0 + 1)) * tx;
    raw[i] = (v + (w - v) * ty) * 0.72 + ihash(x, y, 4343) * 0.28;
  }
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => raw[a] - raw[b]);
  const out = new Float32Array(n);
  order.forEach((idx, rank) => (out[idx] = (rank + 0.5) / n));
  return out;
})();

interface BakeCtx {
  world: WorldData;
  pA: Float32Array;
  pB: Float32Array;
  pC: Float32Array;
  beach: Float32Array;
  warpU: Float32Array;
  warpV: Float32Array;
  decorByChunk: Map<number, DecorItem[]>;
  parcel: Int8Array;
}

const ctxCache = new WeakMap<WorldData, BakeCtx>();

function tileableNoise(size: number, cells: number, seed: number): Float32Array {
  const out = new Float32Array(size * size);
  const g = (x: number, y: number) => ihash(((x % cells) + cells) % cells, ((y % cells) + cells) % cells, seed);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells;
      const fy = (y / size) * cells;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      let tx = fx - x0;
      let ty = fy - y0;
      tx = tx * tx * (3 - 2 * tx);
      ty = ty * ty * (3 - 2 * ty);
      const a = g(x0, y0);
      const b = g(x0 + 1, y0);
      const c = g(x0, y0 + 1);
      const d = g(x0 + 1, y0 + 1);
      out[y * size + x] = a + (b - a) * tx + (c + (d - c) * tx - (a + (b - a) * tx)) * ty;
    }
  return out;
}

export function chunkKey(cx: number, cy: number): number {
  return cy * 1024 + cx;
}

const PARCEL_U = 6.2;
const PARCEL_V = 4.6;
const PARCEL_N = 96;

function getCtx(world: WorldData, decor: DecorItem[]): BakeCtx {
  let c = ctxCache.get(world);
  if (c) return c;
  const { W, H, terrain } = world;
  const N = W * H;
  const pA = new Float32Array(N);
  const pB = new Float32Array(N);
  const pC = new Float32Array(N);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      pA[y * W + x] = fbm(x * 0.09, y * 0.09, 3, 501);
      pB[y * W + x] = fbm(x * 0.16 + 9, y * 0.16 - 4, 2, 502);
      pC[y * W + x] = vnoise(x * 0.37, y * 0.37, 503);
    }
  // blurred beach mask
  const beach = new Float32Array(N);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let s = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const t = terrain[ny * W + nx];
          if (t <= T.sigSu) continue;
          s += t === T.kum ? 1 : 0;
          n++;
        }
      beach[y * W + x] = n ? s / n : 0;
    }
  const n1 = tileableNoise(256, 16, 601);
  const n2 = tileableNoise(256, 16, 602);
  const n3 = tileableNoise(256, 64, 603);
  const n4 = tileableNoise(256, 64, 604);
  const warpU = new Float32Array(256 * 256);
  const warpV = new Float32Array(256 * 256);
  for (let i = 0; i < warpU.length; i++) {
    warpU[i] = (n1[i] - 0.5) * 0.85 + (n3[i] - 0.5) * 0.35;
    warpV[i] = (n2[i] - 0.5) * 0.85 + (n4[i] - 0.5) * 0.35;
  }
  // field parcels: a parcel is a field when its centre tile is farmland
  const parcel = new Int8Array(PARCEL_N * PARCEL_N);
  for (let row = 0; row < PARCEL_N; row++)
    for (let cu = 0; cu < PARCEL_N; cu++) {
      const cellU = cu - 24;
      const u0 = Math.round((cellU + 0.5) * PARCEL_U - row * 2.3);
      const v0 = Math.round((row + 0.5) * PARCEL_V);
      if (u0 < 0 || v0 < 0 || u0 >= W || v0 >= H) continue;
      parcel[row * PARCEL_N + cu] = terrain[v0 * W + u0] === T.tarla ? 1 : 0;
    }
  const decorByChunk = new Map<number, DecorItem[]>();
  for (const d of decor) {
    const p = tileToWorld(d.tx, d.ty, world.heightAt(d.tx, d.ty));
    const sp = DECOR_SPEC[d.kind].shadow;
    if (sp.rx <= 0) continue;
    const x0 = Math.floor((p.x + sp.ox - sp.rx - 2) / CHUNK_W);
    const x1 = Math.floor((p.x + sp.ox + sp.rx + 2) / CHUNK_W);
    const y0 = Math.floor((p.y + sp.oy - sp.ry - 2) / CHUNK_H);
    const y1 = Math.floor((p.y + sp.oy + sp.ry + 2) / CHUNK_H);
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++) {
        const k = chunkKey(cx, cy);
        let l = decorByChunk.get(k);
        if (!l) decorByChunk.set(k, (l = []));
        l.push(d);
      }
  }
  c = { world, pA, pB, pC, beach, warpU, warpV, decorByChunk, parcel };
  ctxCache.set(world, c);
  return c;
}

function frac(x: number): number {
  return x - Math.floor(x);
}

interface Scratch {
  ramp: Uint8Array;
  lvl: Float32Array;
  top: Uint8Array;
  mat: Uint8Array;
}
let scratch: Scratch | null = null;
function getScratch(): Scratch {
  if (!scratch) {
    const n = CHUNK_W * CHUNK_H;
    scratch = { ramp: new Uint8Array(n), lvl: new Float32Array(n), top: new Uint8Array(n), mat: new Uint8Array(n) };
  }
  return scratch;
}

/**
 * Bakes chunks. For time slicing call begin() → columns(c0,c1)… → finish(); bake()
 * does all at once. Only one chunk may be in progress at a time (shared scratch).
 */
export class ChunkBaker {
  private ctx: BakeCtx;
  constructor(
    private world: WorldData,
    decor: DecorItem[],
  ) {
    this.ctx = getCtx(world, decor);
  }

  bake(cx: number, cy: number, season: Season, out: Uint8ClampedArray): void {
    this.begin();
    this.columns(cx, cy, season, 0, CHUNK_W);
    this.finish(cx, cy, season, out);
  }

  begin(): void {
    const s = getScratch();
    s.ramp.fill(0);
    s.top.fill(0);
    s.mat.fill(0);
  }

  columns(cx: number, cy: number, season: Season, c0: number, c1: number): void {
    const s = getScratch();
    const { world, pA, pB, pC, beach, warpU, warpV, parcel } = this.ctx;
    const { W, H, terrain, city, segs, segStart, segList } = world;
    const X0 = cx * CHUNK_W;
    const Y0 = cy * CHUNK_H;
    const winter = season === 'kis';
    const spring = season === 'ilkbahar';
    const summer = season === 'yaz';
    const autumn = season === 'sonbahar';
    const sdf = world.sdf;
    const SW = world.sdfW;
    const SH = world.sdfH;
    const hext = world.hext;
    const ramp = s.ramp;
    const lvl = s.lvl;
    const topB = s.top;
    const matB = s.mat;
    const verge = summer || autumn ? RD : RG;

    for (let x = c0; x < c1; x++) {
      const wxi = X0 + x;
      const wx = wxi + 0.5;
      const ax = (wx - WORLD_ORIGIN_X) / HALF_W;
      let ybuf = CHUNK_H;
      const bx = wxi & 255;
      for (let fy = Y0 + CHUNK_H + LIFT; fy >= Y0; fy--) {
        if (ybuf <= 0) break;
        const ay = (fy + 0.5 - WORLD_ORIGIN_Y - HALF_H) / HALF_H;
        let u = (ax + ay) * 0.5;
        let v = (ay - ax) * 0.5;
        // beyond the map: mirror (the land/sea continues naturally to the camera bounds)
        if (u < 0) u = -u;
        if (u > W - 1.001) u = Math.max(0, 2 * (W - 1.001) - u);
        if (v < 0) v = -v;
        if (v > H - 1.001) v = Math.max(0, 2 * (H - 1.001) - v);

        // coast field (bilinear, 2 samples / tile)
        let gx = u * 2;
        let gy = v * 2;
        if (gx > SW - 1.001) gx = SW - 1.001;
        if (gy > SH - 1.001) gy = SH - 1.001;
        const sx0 = gx | 0;
        const sy0 = gy | 0;
        const sfx = gx - sx0;
        const sfy = gy - sy0;
        const sk = sy0 * SW + sx0;
        const s0 = sdf[sk] + (sdf[sk + 1] - sdf[sk]) * sfx;
        const s1 = sdf[sk + SW] + (sdf[sk + SW + 1] - sdf[sk + SW]) * sfx;
        const sd = s0 + (s1 - s0) * sfy;
        if (sd <= 0) continue;

        // terraced height + smooth gradient for lighting
        const hx0 = u | 0;
        const hy0 = v | 0;
        const hfx = u - hx0;
        const hfy = v - hy0;
        const hk = hy0 * W + hx0;
        const h00 = hext[hk];
        const h10 = hext[hk + 1];
        const h01 = hext[hk + W];
        const h11 = hext[hk + W + 1];
        let h = terrace(h00, h10, h01, h11, hfx, hfy);
        const gu = (h10 - h00) * (1 - hfy) + (h11 - h01) * hfy;
        const gv = (h01 - h00) * (1 - hfx) + (h11 - h10) * hfx;
        // per-tile noise fields (bilinear)
        const pa0 = pA[hk] + (pA[hk + 1] - pA[hk]) * hfx;
        const pa = pa0 + (pA[hk + W] + (pA[hk + W + 1] - pA[hk + W]) * hfx - pa0) * hfy;
        const pb0 = pB[hk] + (pB[hk + 1] - pB[hk]) * hfx;
        const pb = pb0 + (pB[hk + W] + (pB[hk + W + 1] - pB[hk + W]) * hfx - pb0) * hfy;
        const pc0 = pC[hk] + (pC[hk + 1] - pC[hk]) * hfx;
        const pc = pc0 + (pC[hk + W] + (pC[hk + W + 1] - pC[hk + W]) * hfx - pc0) * hfy;

        const ti = Math.round(v) * W + Math.round(u);
        const tCity = city[ti];

        // ── line features: roads, walls, moat ──
        let dRoad = 99;
        let roadW = 0.5;
        let dWall = 99;
        let moat = 0;
        let dGal = 99;
        const sa = segStart[ti];
        const sb = segStart[ti + 1];
        for (let q = sa; q < sb; q++) {
          const g = segs[segList[q]];
          const ddx = g.bx - g.ax;
          const ddy = g.by - g.ay;
          const l2 = ddx * ddx + ddy * ddy;
          let t = l2 > 0 ? ((u - g.ax) * ddx + (v - g.ay) * ddy) / l2 : 0;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const qx = g.ax + ddx * t - u;
          const qy = g.ay + ddy * t - v;
          const d = Math.sqrt(qx * qx + qy * qy);
          if (g.kind === SEG_ROAD) {
            if (d - g.w < dRoad - roadW) {
              dRoad = d;
              roadW = g.w;
            }
          } else if (g.kind === SEG_LANDWALL) {
            if (d < dWall) {
              dWall = d;
              moat = g.w;
            }
          } else if (g.kind === SEG_GALATAWALL) {
            if (d < dGal) dGal = d;
          }
        }
        const wi = ((fy & 255) << 8) | bx;
        const wu = warpU[wi];
        const wv = warpV[wi];
        const hsh = HT1[wi];
        const roadEdge = dRoad - roadW + wu * 0.18;
        const isRoad = roadEdge < 0 && !tCity;
        let moatD = 0;
        let inMoat = false;
        if (moat && !tCity && dWall > 0.7 && dWall < 2.45 && !isRoad) {
          moatD = moatProfile(dWall);
          inMoat = dWall > 0.86 && dWall < 2.3;
          h -= moatD * MOAT_DEPTH;
        }

        const base = fy - Y0;
        const top = base - Math.round(h * HEIGHT_STEP);
        if (top >= ybuf) continue;

        // ── material ──
        const L = (gu * 3 + gv) * 0.6 + (h - 1.4) * 0.14; // sun from upper-left (west), higher = brighter
        let mat = M_GRASS;
        let rp = RG;
        let li = 4;
        const bay = CLUSTER[wi];

        // warped material lookup (organic, dithered borders)
        let mu = Math.round(u + wu + (hsh - 0.5) * 0.16);
        let mv = Math.round(v + wv + (HT2[wi] - 0.5) * 0.16);
        if (mu < 0) mu = 0;
        else if (mu >= W) mu = W - 1;
        if (mv < 0) mv = 0;
        else if (mv >= H) mv = H - 1;
        let tt = terrain[mv * W + mu];
        if (tt <= T.sigSu) tt = terrain[ti];
        if (tt <= T.sigSu) tt = tCity ? T.sehir : T.cimen;
        if (tCity && tt !== T.sehir && tt !== T.sur) tt = T.sehir;
        if (!tCity && (tt === T.sehir || tt === T.sur)) tt = terrain[ti] === T.sehir || terrain[ti] === T.sur ? T.cimen : terrain[ti];
        if (tt === T.yol || tt === T.hendek || tt === T.sur || tt === T.kum) tt = tt === T.sur ? T.sehir : T.cimen;
        // beaches: a smooth band along the waterline
        if (!tCity) {
          const bm0 = beach[hk] + (beach[hk + 1] - beach[hk]) * hfx;
          const bm = bm0 + (beach[hk + W] + (beach[hk + W + 1] - beach[hk + W]) * hfx - bm0) * hfy;
          if (bm > 0.12 && sd < 0.2 + bm * 1.4 + (pc - 0.5) * 0.9) tt = T.kum;
        }
        // field parcels override meadow
        let parcelHash = 0;
        let pu = 0;
        let prow = 0;
        if (tt === T.cimen || tt === T.tarla) {
          prow = Math.floor(v / PARCEL_V);
          pu = (u + prow * 2.3) / PARCEL_U;
          const cellU = Math.floor(pu);
          const pi = prow * PARCEL_N + cellU + 24;
          const isField = prow >= 0 && prow < PARCEL_N && cellU + 24 >= 0 && cellU + 24 < PARCEL_N ? parcel[pi] : 0;
          tt = isField ? T.tarla : T.cimen;
          parcelHash = ihash(cellU, prow, 31);
        }

        const wallFoot = dWall < 0.72 || dGal < 0.62 || (tCity !== 0 && sd < 0.95);
        if (wallFoot) {
          mat = M_FOOT;
          rp = RDI;
          li = 4 + (pc - 0.5) * 1.0 + L * 0.8;
          if (HT3[wi] > 0.94) {
            rp = RST;
            li = 3.4 + hsh * 1.5 + L;
          } else if (hsh < 0.015) {
            rp = RB;
            li = 3 + L;
          }
          if (winter && bay < 0.6) {
            rp = RSN;
            li = 2.6 + L * 1.5;
          }
        } else if (inMoat) {
          mat = M_MOAT;
          const puddle = pc > 0.64 && moatD > 0.95;
          if (puddle && !winter) {
            rp = RW;
            li = 3 + (pc - 0.64) * 9 + (HT3[wi] > 0.96 ? 3 : 0);
          } else if (puddle && winter) {
            rp = RSN;
            li = 1 + hsh;
          } else {
            rp = RDI;
            li = 2.2 + pa * 1.2 + (hsh - 0.5) * 0.8 + L * 0.6;
            if (pc > 0.55 && hsh > 0.6 && !winter) {
              rp = RG;
              li = 2.2 + hsh;
            }
            if (winter && bay < 0.5) {
              rp = RSN;
              li = 2 + L;
            }
          }
        } else if (isRoad) {
          mat = M_ROAD;
          const dc = dRoad / roadW; // 0 centre .. 1 edge
          rp = RDI;
          li = 4.5 + (pa - 0.5) * 1.2 + L * 1.2 + (hsh - 0.5) * 0.5;
          const rut = Math.abs(dc - 0.5);
          if (rut < 0.09) li -= 1.4;
          else if (rut < 0.15) li += 0.5;
          else if (dc < 0.16 && hsh > 0.5 && !winter) {
            rp = verge;
            li = 2.8 + hsh;
          }
          if (HT3[wi] < 0.02) {
            rp = RST;
            li = 4.6;
          }
          if (roadEdge > -0.14 && bay < (roadEdge + 0.14) / 0.14) {
            rp = verge;
            li = 3.2 + L;
          }
          if (winter && rut >= 0.09) {
            rp = RSN;
            li = 2.3 + L * 1.6 + (hsh - 0.5) * 0.8;
          }
        } else if (tt === T.sehir) {
          // city ground: worn turf & packed earth, a few winding lanes, garden plots, rare paved squares
          mat = M_CITY;
          const su = u / 5.6 + (pb - 0.5) * 1.6 + (pc - 0.5) * 0.4;
          const sv = v / 4.4 + (pa - 0.5) * 1.6;
          const eu = Math.min(frac(su), 1 - frac(su)) * 5.6;
          const ev = Math.min(frac(sv), 1 - frac(sv)) * 4.4;
          const blk = ihash(Math.floor(su), Math.floor(sv), 77);
          const lane = (eu < 0.13 && blk > 0.3) || (ev < 0.13 && blk < 0.75);
          if (lane) {
            rp = RDI;
            li = 4.7 + (pa - 0.5) * 0.8 + L + (hsh - 0.5) * 0.6;
          } else if (blk > 0.955 && eu > 0.5 && ev > 0.5) {
            rp = RL;
            const bu = u * 2.4 + Math.floor(v * 2.4) * 0.5;
            const joint = frac(bu) < 0.14 || frac(v * 2.4) < 0.17;
            li = joint ? 1.8 : 2.8 + ihash(Math.floor(bu), Math.floor(v * 2.4), 9) * 1.3 + L;
          } else if (blk < 0.22 && eu > 0.45 && ev > 0.45) {
            mat = M_GARDEN;
            const row = frac((blk > 0.11 ? u : v) * 2.7) < 0.5;
            rp = row ? (autumn ? RD : RG) : RDI;
            li = row ? 3.8 + L + (hsh - 0.5) * 0.6 : 3.4 + L;
            if (eu < 0.6 || ev < 0.6) {
              rp = RG;
              li = 2.4; // hedge
            }
          } else {
            const earth = 0.25 + (pc - 0.5) * 1.4;
            if (bay < earth) {
              rp = RDI;
              li = 4.2 + (hsh - 0.5) * 0.8 + L;
            } else {
              rp = spring ? RG : RD;
              li = (spring ? 3.6 : 3.3) + (pa - 0.5) * 1.4 + L * 1.3 + (hsh - 0.5) * 0.7;
            }
          }
          if (winter) {
            const cover = 0.74 + (pa - 0.5) * 0.6 - L * 0.2;
            if (bay < cover) {
              rp = RSN;
              li = 2.5 + L * 1.6 + (hsh - 0.5) * 0.6;
            }
          }
        } else if (tt === T.orman) {
          mat = M_FOREST;
          rp = RF;
          li = 3 + (pa - 0.5) * 1.6 + L * 1.6 + (hsh - 0.5) * 0.9;
          if (HT3[wi] > 0.84) {
            rp = autumn ? RBR : spring ? RG : RD;
            li = autumn ? 3 + hsh : spring ? 3.5 : 2.6;
          }
          if (winter) {
            const cover = 0.62 + (pb - 0.5) * 0.8 - L * 0.2;
            if (bay < cover) {
              rp = RSN;
              li = 1.7 + L * 1.6 + (hsh - 0.5) * 0.8;
            }
          }
        } else if (tt === T.kaya) {
          mat = M_ROCK;
          rp = RST;
          const bu = u * 1.7 + Math.floor(v * 1.7) * 0.37;
          const cu = frac(bu);
          const cv = frac(v * 1.7);
          const blk = ihash(Math.floor(bu), Math.floor(v * 1.7), 13);
          li = 3.6 + blk * 1.6 + L * 1.6 + (hsh - 0.5) * 0.6;
          if (cu < 0.08 || cv < 0.1) li = 1.6;
          else if (cv < 0.2) li += 0.9; // lit upper edge of each cut block
          if (winter && bay < 0.5 - L * 0.3) {
            rp = RSN;
            li = 2.7 + L * 1.5;
          }
        } else if (tt === T.kum) {
          mat = M_SAND;
          rp = RS;
          li = 3.7 + (pa - 0.5) * 1.0 + L * 1.2;
          const rip = Math.sin((u * 1.3 - v * 2.1) * 5 + pb * 9);
          if (rip > 0.8) li += 0.7;
          else if (rip < -0.85) li -= 0.6;
          if (sd < 0.45) li -= (0.45 - sd) * 6.5; // wet strip at the waterline
          if (HT3[wi] < 0.01) {
            rp = RC;
            li = 4;
          }
          if (winter && sd > 0.7 && bay < 0.6 + (pa - 0.5)) {
            rp = RSN;
            li = 2.7 + L * 1.4;
          }
        } else if (tt === T.tarla) {
          // patchwork parcels with iso-aligned furrows
          const edgeU = Math.min(frac(pu), 1 - frac(pu)) * PARCEL_U;
          const fv = frac(v / PARCEL_V);
          const edgeV = Math.min(fv, 1 - fv) * PARCEL_V;
          mat = M_FIELD;
          const along = parcelHash < 0.5 ? v : u;
          const f = frac(along * 2.4 + parcelHash * 3);
          const furrow = f < 0.42;
          const crop = Math.floor(parcelHash * 5); // 0 wheat 1 barley 2 ploughed 3 legumes 4 hay
          if (edgeU < 0.17 || edgeV < 0.17) {
            rp = verge;
            li = 2.6 + L + (hsh - 0.5);
            if (winter) {
              rp = RSN;
              li = 2.2;
            }
          } else if (winter) {
            rp = RSN;
            li = furrow ? 1.8 + L : 3 + L * 1.5;
            if (furrow && hsh > 0.82) {
              rp = RDI;
              li = 2.2;
            }
          } else if (crop === 2) {
            rp = RDI;
            li = (furrow ? 2.8 : 4.4) + L * 1.4 + (pa - 0.5);
          } else if (spring) {
            if (crop === 4) {
              rp = RG;
              li = (furrow ? 3.8 : 4.8) + L;
            } else {
              rp = furrow ? RDI : RG;
              li = furrow ? 3.4 + L : (crop === 3 ? 4 : 5.2) + L * 1.2 + (hsh - 0.5) * 0.5;
            }
          } else if (summer) {
            if (crop === 0 || crop === 1) {
              rp = furrow ? RD : RGO;
              li = furrow ? 3.2 + L : (crop === 0 ? 4.4 : 3.8) + L * 1.2 + (hsh - 0.5) * 0.7;
            } else if (crop === 3) {
              rp = furrow ? RDI : RG;
              li = furrow ? 3.4 + L : 4.2 + L;
            } else {
              rp = RD;
              li = (furrow ? 2.8 : 4.2) + L;
            }
          } else {
            rp = crop === 4 || crop === 0 ? RD : RDI;
            li = (furrow ? 2.6 : 4) + L * 1.2 + (hsh - 0.5) * 0.6;
          }
        } else {
          // meadow
          mat = M_GRASS;
          if (winter) {
            const cover = 0.97 + (pb - 0.5) * 0.4 - L * 0.2;
            rp = RSN;
            li = 2.7 + L * 1.7 + (pa - 0.5) * 0.8;
            if (bay >= cover) {
              rp = RD;
              li = 1.6 + hsh;
            }
          } else {
            const dry = summer ? 0.2 + pb * 0.75 : autumn ? 0.6 + pb * 0.4 : pb * 0.4 - 0.05;
            const useDry = dry > 0.62 || (dry > 0.48 && bay < (dry - 0.48) * 7);
            rp = useDry ? RD : RG;
            // lush hollows, sunny knolls
            li = (useDry ? 3.4 : summer ? 4.1 : 4.5) + (pa - 0.5) * 2.4 + L * 1.9;
            const bl = HT3[((fy & 255) << 8) | ((wxi >> 1) & 255)];
            if (bl > 0.88) li += 0.9;
            else if (bl < 0.07) li -= 1;
            if (autumn && pc > 0.65 && hsh > 0.55) {
              rp = RBR;
              li = 3 + hsh;
            }
          }
        }

        // ── write column run ──
        let fillEnd = ybuf - 1;
        if (fillEnd > base) fillEnd = base;
        if (fillEnd > CHUNK_H - 1) fillEnd = CHUNK_H - 1;
        const run = fillEnd - top + 1;
        if (run > 2) {
          // drop direction: toward water at shores, else downhill
          let dropU: number;
          let dropV: number;
          if (sd < 1.3) {
            dropU = -(sdf[sk + 1] - sdf[sk]);
            dropV = -(sdf[sk + SW] - sdf[sk]);
          } else {
            dropU = -gu;
            dropV = -gv;
          }
          const litFace = dropV > dropU;
          const shoreBank = sd < 1.6;
          const stoneBank = wallFoot || tt === T.kaya || h > 1.9;
          for (let r = top; r <= fillEnd; r++) {
            if (r < 0) continue;
            const k = r * CHUNK_W + x;
            const dk = r - top;
            if (dk === 0) {
              ramp[k] = rp;
              lvl[k] = li + 0.8; // sunlit lip
              topB[k] = 1;
              matB[k] = mat;
              continue;
            }
            matB[k] = M_SKIRT;
            topB[k] = 0;
            const strata = HT1[(((fy - dk) >> 1) & 255) << 8 | ((wxi / 5) & 255)];
            if (dk === 1 && (mat === M_GRASS || mat === M_FIELD || mat === M_FOREST || mat === M_GARDEN)) {
              ramp[k] = winter ? RSN : rp === RD ? RD : RG;
              lvl[k] = winter ? 2.4 : 2.2;
            } else if (moatD > 0) {
              ramp[k] = (r + wxi) % 6 === 0 ? RB : RL;
              lvl[k] = (litFace ? 2.8 : 1.6) + strata * 0.8 - (dk > 3 ? 0.4 : 0);
            } else if (stoneBank) {
              ramp[k] = strata > 0.82 ? RDI : RST;
              lvl[k] = (litFace ? 3.9 : 2.3) + strata * 1.1 - dk * 0.1;
            } else {
              ramp[k] = strata > 0.88 ? RST : RDI;
              lvl[k] = (litFace ? 4.1 : 2.6) + (strata - 0.5) * 1.3 - dk * 0.12;
            }
            if (r === fillEnd && shoreBank && r === base) {
              ramp[k] = RDI;
              lvl[k] = 1.2;
            }
          }
        } else {
          for (let r = top; r <= fillEnd; r++) {
            if (r < 0) continue;
            const k = r * CHUNK_W + x;
            ramp[k] = rp;
            lvl[k] = r === top ? li : li - 0.3;
            topB[k] = 1;
            matB[k] = mat;
          }
        }
        ybuf = top;
      }
    }
  }

  finish(cx: number, cy: number, season: Season, out: Uint8ClampedArray): void {
    const s = getScratch();
    const { world } = this.ctx;
    const X0 = cx * CHUNK_W;
    const Y0 = cy * CHUNK_H;
    const ramp = s.ramp;
    const lvl = s.lvl;
    const topB = s.top;
    const matB = s.mat;
    const winter = season === 'kis';
    const spring = season === 'ilkbahar';
    const summer = season === 'yaz';

    // ── contact shadows at the foot of every skirt/cliff ──
    for (let x = 0; x < CHUNK_W; x++) {
      let prevSkirt = false;
      let shade = 0;
      for (let y = 0; y < CHUNK_H; y++) {
        const k = y * CHUNK_W + x;
        if (matB[k] === M_SKIRT) {
          prevSkirt = true;
          continue;
        }
        if (prevSkirt && topB[k]) shade = 2;
        prevSkirt = false;
        if (shade > 0 && topB[k]) {
          lvl[k] -= shade === 2 ? 1.1 : 0.5;
          shade--;
        } else shade = 0;
      }
    }

    // ── stamps: tufts, flowers, pebbles, litter ──
    const put = (px: number, py: number, needMat: number, r: number, l: number) => {
      if (px < 0 || py < 0 || px >= CHUNK_W || py >= CHUNK_H) return;
      const k = py * CHUNK_W + px;
      if (!topB[k]) return;
      if (needMat && matB[k] !== needMat) return;
      ramp[k] = r;
      lvl[k] = l;
    };
    const corners = [
      [X0, Y0],
      [X0 + CHUNK_W, Y0],
      [X0, Y0 + CHUNK_H + LIFT],
      [X0 + CHUNK_W, Y0 + CHUNK_H + LIFT],
    ];
    let umin = Infinity, umax = -Infinity, vmin = Infinity, vmax = -Infinity;
    for (const [px, py] of corners) {
      const ax = (px - WORLD_ORIGIN_X) / HALF_W;
      const ay = (py - WORLD_ORIGIN_Y - HALF_H) / HALF_H;
      const u = (ax + ay) / 2;
      const v = (ay - ax) / 2;
      umin = Math.min(umin, u);
      umax = Math.max(umax, u);
      vmin = Math.min(vmin, v);
      vmax = Math.max(vmax, v);
    }
    const { W, H, terrain } = world;
    const tu0 = Math.max(0, Math.floor(umin) - 1);
    const tu1 = Math.min(W - 1, Math.ceil(umax) + 1);
    const tv0 = Math.max(0, Math.floor(vmin) - 1);
    const tv1 = Math.min(H - 1, Math.ceil(vmax) + 1);
    const dry = summer || season === 'sonbahar';
    for (let ty = tv0; ty <= tv1; ty++)
      for (let tx = tu0; tx <= tu1; tx++) {
        const t = terrain[ty * W + tx];
        if (t <= T.sigSu) continue;
        const n = t === T.cimen ? 9 : t === T.orman ? 5 : t === T.kum || t === T.yol || t === T.sehir || t === T.tarla ? 3 : 2;
        const flowerZone = vnoise(tx * 0.22, ty * 0.22, 991);
        for (let k = 0; k < n; k++) {
          const u = tx + ihash(tx, ty, 700 + k) - 0.5;
          const v = ty + ihash(tx, ty, 800 + k) - 0.5;
          const h = world.terracedAt(u, v);
          const px = Math.round(WORLD_ORIGIN_X + (u - v) * HALF_W) - X0;
          const py = Math.round(WORLD_ORIGIN_Y + (u + v) * HALF_H + HALF_H - h * HEIGHT_STEP) - Y0;
          if (px < -3 || py < -3 || px > CHUNK_W + 3 || py > CHUNK_H + 3) continue;
          const r = ihash(tx, ty, 900 + k);
          if (t === T.cimen || t === T.tarla) {
            const m = t === T.cimen ? M_GRASS : M_FIELD;
            if (winter) {
              if (r < 0.14) {
                put(px, py, M_GRASS, RD, 2);
                put(px + 1, py - 1, M_GRASS, RD, 3.4);
              }
              continue;
            }
            const flowers = spring ? flowerZone > 0.58 : summer ? flowerZone > 0.75 : false;
            if (flowers && r < 0.32) {
              const fr = ihash(tx, ty, 950 + k);
              const fc = spring ? (fr < 0.45 ? RR : fr < 0.8 ? RC : RGO) : fr < 0.6 ? RGO : RPU;
              const fl = fc === RR ? 5 : fc === RPU ? 4 : 5;
              put(px, py, m, RG, 2);
              put(px, py - 1, m, fc, fl);
              if (fc === RC) put(px + 1, py - 1, m, RGO, 5);
              if (fr < 0.25) {
                put(px + 2, py + 1, m, RG, 2);
                put(px + 2, py, m, fc, fl - (fc === RR ? 1 : 0));
              }
            } else if (m === M_GRASS) {
              // grass tuft: dark root, light tips
              const rr = season === 'sonbahar' ? (r > 0.15 ? RD : RG) : dry && r > 0.45 ? RD : RG;
              const lt = rr === RD ? 4.8 : 6.2;
              const dk = rr === RD ? 1.6 : 2;
              put(px, py, M_GRASS, rr, dk);
              put(px - 1, py, M_GRASS, rr, dk + 0.6);
              put(px + 1, py, M_GRASS, rr, dk + 0.6);
              put(px - 1, py - 1, M_GRASS, rr, lt - 1);
              put(px + 1, py - 1, M_GRASS, rr, lt - 1.2);
              put(px, py - 1, M_GRASS, rr, lt - 0.5);
              if (r > 0.55) put(px - 2, py - 2, M_GRASS, rr, lt);
              if (r < 0.35) put(px + 2, py - 2, M_GRASS, rr, lt - 0.4);
              if (r > 0.3 && r < 0.6) put(px, py - 2, M_GRASS, rr, lt);
            }
          } else if (t === T.orman) {
            if (winter) continue;
            // ferns & undergrowth
            put(px, py, M_FOREST, RF, 2);
            put(px - 1, py - 1, M_FOREST, RF, 4.5);
            put(px + 1, py - 1, M_FOREST, RF, 5.2);
            put(px, py - 2, M_FOREST, RF, 5.6);
          } else if (t === T.kum) {
            if (r < 0.6) {
              put(px, py, M_SAND, RST, 4.6);
              put(px + 1, py, M_SAND, RST, 3);
              put(px, py + 1, M_SAND, RS, 1.8);
            }
          } else if (t === T.yol) {
            put(px, py, M_ROAD, RST, 5);
            put(px + 1, py, M_ROAD, RST, 2.8);
            put(px, py + 1, M_ROAD, RDI, 2.4);
          } else if (t === T.sehir) {
            if (r < 0.45 && !winter) {
              put(px, py, M_CITY, RG, 3.2);
              put(px + 1, py - 1, M_CITY, RG, 4.8);
              put(px - 1, py - 1, M_CITY, RG, 4.2);
            } else if (r > 0.8) {
              put(px, py, M_CITY, RST, 4.4);
              put(px + 1, py, M_CITY, RST, 2.6);
            }
          } else if (t === T.kaya) {
            put(px, py, M_ROCK, RST, 6);
            put(px + 1, py, M_ROCK, RST, 4.6);
            put(px, py + 1, M_ROCK, RST, 1.6);
          }
        }
      }

    // ── baked decor shadows (cool, dithered, lower-right) ──
    const items = this.ctx.decorByChunk.get(chunkKey(cx, cy));
    if (items) {
      for (const d of items) {
        const sp = DECOR_SPEC[d.kind].shadow;
        const p = tileToWorld(d.tx, d.ty, world.heightAt(d.tx, d.ty));
        const ox = p.x + sp.ox - X0;
        const oy = p.y + sp.oy - Y0;
        const leafy = d.kind === 'agac' || d.kind === 'cinar' || d.kind === 'meyve' || d.kind === 'asma' || d.kind === 'cali';
        const strength = winter && leafy ? 0.55 : 1;
        for (let yy = Math.floor(oy - sp.ry - 1); yy <= oy + sp.ry + 1; yy++) {
          if (yy < 0 || yy >= CHUNK_H) continue;
          for (let xx = Math.floor(ox - sp.rx - 1); xx <= ox + sp.rx + 1; xx++) {
            if (xx < 0 || xx >= CHUNK_W) continue;
            const ex = (xx + 0.5 - ox) / sp.rx;
            const ey = (yy + 0.5 - oy) / sp.ry;
            const e = ex * ex + ey * ey;
            if (e > 1) continue;
            const k = yy * CHUNK_W + xx;
            if (!topB[k] || ramp[k] === 0) continue;
            const b = B4[(((yy + Y0) & 3) << 2) | ((xx + X0) & 3)];
            if (e > 0.6 && b > (1 - e) * 2.5 * strength) continue;
            lvl[k] -= (e < 0.35 ? 2 : 1.5) * strength;
            if (ramp[k] === RSN) lvl[k] -= 0.3;
          }
        }
      }
    }

    // ── resolve to RGBA with ordered dither ──
    const o32 = new Uint32Array(out.buffer, out.byteOffset, CHUNK_W * CHUNK_H);
    for (let y = 0; y < CHUNK_H; y++) {
      const by = ((y + Y0) & 255) << 8;
      for (let x = 0; x < CHUNK_W; x++) {
        const k = y * CHUNK_W + x;
        const r = ramp[k];
        if (r === 0) {
          o32[k] = 0;
          continue;
        }
        const len = RAMP_LEN[r];
        let i = Math.floor(lvl[k] + CLUSTER[by | ((x + X0) & 255)]);
        if (i < 0) i = 0;
        else if (i >= len) i = len - 1;
        o32[k] = RAMP_RGBA[r][i];
      }
    }
  }
}

/** World-pixel rect of a chunk. */
export function chunkRect(cx: number, cy: number): { x: number; y: number; w: number; h: number } {
  return { x: cx * CHUNK_W, y: cy * CHUNK_H, w: CHUNK_W, h: CHUNK_H };
}
