import { HEIGHT_STEP, MAP_H, MAP_W, MAX_HEIGHT } from '../../core/constants';
import { tileToWorld, worldToTile, type Pt, type TilePt } from '../../core/iso';
import type { MoveMode, RegionId, Terrain, WorldApi } from '../../core/world';
import {
  CHAIN,
  EDIRNE_ROAD,
  FORESTS,
  GALATA_WALLS,
  HILLS,
  LAND_WALLS,
  QUARRIES,
  SILIVRI_ROAD,
  WATER,
  geoPolyToTiles,
  geoToTile,
  type LatLon,
} from '../../data/geography';
import { landmarkTile } from '../../data/landmarks';
import { SECTIONS } from '../../data/sections';
import { EXTRA_ROADS, RIDGES, VALLEYS } from './data';
import { chaikin, distSeg, fbm, smoothstep, vnoise } from './noise';

/**
 * WORLD GRID (pure data, no Phaser — runs in tests).
 *
 * Built once per page load from data/geography.ts, data/sections.ts and data/landmarks.ts.
 *
 * Coordinates: tile (tx,ty) is the diamond whose CENTER is tileToWorld(tx,ty), i.e. a
 * fractional tile coordinate belongs to tile (round(tx), round(ty)).
 *
 * Coastline: an exact signed distance field to the WATER polygon (+ gentle noise for a
 * natural shore) sampled at 2 samples per tile (`sdf`, positive on land). Both the grid
 * classification and the renderer/water shader use this same field, so the baked land
 * edge, the shoreline foam and the walkable tiles agree.
 *
 * REGION RULES
 *  - sur-ici:      land flood-filled from Ayasofya, bounded by the land-wall line (Theodosian
 *                  walls, rasterized 4-connected and extended into the water) and the sea.
 *                  Land-wall tiles and the city's sea-wall ring also count as sur-ici.
 *  - galata:       land inside GALATA_WALLS, extended south down to the Golden Horn shore.
 *  - halic:        water flood-filled from mid-Golden Horn, bounded by the CHAIN line.
 *  - bogaz:        other water NORTH of the Sarayburnu–Üsküdar line.
 *  - marmara:      all remaining water.
 *  - anadolu:      the land mass east of the Bosphorus (component of Anadolu Hisarı).
 *  - trakya:       European land west of the walls and south/west of the Golden Horn
 *                  (flood from the Ottoman camp; the Horn's head is closed by a line running
 *                  north along the Kağıthane valley).
 *  - pera:         remaining European land south of lat 41.055 (north of the Horn).
 *  - bogaz-avrupa: remaining European land north of lat 41.055 (Bosphorus shore, Rumeli Hisarı).
 */

// ───────────────────────────── enums ─────────────────────────────

export const TERRAIN_LIST: Terrain[] = ['derin-su', 'su', 'sig-su', 'kum', 'cimen', 'tarla', 'orman', 'kaya', 'yol', 'sehir', 'hendek', 'sur'];
export const T = {
  derinSu: 0,
  su: 1,
  sigSu: 2,
  kum: 3,
  cimen: 4,
  tarla: 5,
  orman: 6,
  kaya: 7,
  yol: 8,
  sehir: 9,
  hendek: 10,
  sur: 11,
} as const;

export const REGION_LIST: RegionId[] = ['sur-ici', 'galata', 'halic', 'bogaz', 'marmara', 'trakya', 'pera', 'bogaz-avrupa', 'anadolu'];
export const R = {
  surIci: 0,
  galata: 1,
  halic: 2,
  bogaz: 3,
  marmara: 4,
  trakya: 5,
  pera: 6,
  bogazAvrupa: 7,
  anadolu: 8,
} as const;

/** Line features used for smooth rendering (roads, walls, moat). Tile coordinates. */
export const SEG_ROAD = 0;
export const SEG_LANDWALL = 1;
export const SEG_GALATAWALL = 2;

export interface LineSeg {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  kind: number;
  /** Road half width (tiles); for land walls: 1 if the section has a moat. */
  w: number;
}

export interface WorldData extends WorldApi {
  readonly W: number;
  readonly H: number;
  /** Terrain per tile (index into TERRAIN_LIST). */
  readonly terrain: Uint8Array;
  /** Region per tile (index into REGION_LIST). */
  readonly region: Uint8Array;
  /** Surface height per tile, water tiles carry the neighbouring land height (for banks). */
  readonly hext: Float32Array;
  /** Raw relief (hills before coast flattening) — used for decor/beach rules. */
  readonly relief: Float32Array;
  /** BFS distance (tiles, 8-neighbour) from water to the nearest land; 0 on land. */
  readonly depth: Uint8Array;
  /** Signed coast distance at 2 samples per tile: sample (i,j) ↔ tile coord (i/2, j/2). +land. */
  readonly sdf: Float32Array;
  readonly sdfW: number;
  readonly sdfH: number;
  /** Smoothed distance to open water (tiles), negative inside water, sampled like sdf but clamped −40..8. */
  /** 1 = Constantinople (inside the land walls), 2 = Galata, 0 = elsewhere. */
  readonly city: Uint8Array;
  readonly segs: LineSeg[];
  /** CSR index: segments near each tile (within ~3 tiles). */
  readonly segStart: Int32Array;
  readonly segList: Int32Array;
  /** Bumps whenever setBlocked changes something (render caches key on it). */
  readonly blockedVersion: number;
  /** Bilinear coast SDF at fractional tile coords. */
  sdfAt(u: number, v: number): number;
  /** Terraced surface height (no moat) at fractional tile coords. */
  terracedAt(u: number, v: number): number;
  /** Bilinear render surface height at fractional tile coords (land-extended). */
  surfaceAt(u: number, v: number): number;
  idx(tx: number, ty: number): number;
}

// ───────────────────────────── geometry helpers ─────────────────────────────

function pointInPoly(x: number, y: number, poly: TilePt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.ty > y !== b.ty > y && x < ((b.tx - a.tx) * (y - a.ty)) / (b.ty - a.ty) + a.tx) inside = !inside;
  }
  return inside;
}

/** 4-connected grid walk between two tile points (inclusive). */
function walk4(a: TilePt, b: TilePt, cb: (x: number, y: number) => void): void {
  let x = Math.round(a.tx);
  let y = Math.round(a.ty);
  const xe = Math.round(b.tx);
  const ye = Math.round(b.ty);
  const nx = Math.abs(xe - x);
  const ny = Math.abs(ye - y);
  const sx = xe > x ? 1 : -1;
  const sy = ye > y ? 1 : -1;
  cb(x, y);
  for (let ix = 0, iy = 0; ix < nx || iy < ny; ) {
    if ((0.5 + ix) / (nx || 1e-9) < (0.5 + iy) / (ny || 1e-9) && ix < nx) {
      x += sx;
      ix++;
    } else if (iy < ny) {
      y += sy;
      iy++;
    } else {
      x += sx;
      ix++;
    }
    cb(x, y);
  }
}

function walkPoly4(pts: TilePt[], cb: (x: number, y: number) => void, closed = false): void {
  for (let i = 0; i + 1 < pts.length; i++) walk4(pts[i], pts[i + 1], cb);
  if (closed && pts.length > 2) walk4(pts[pts.length - 1], pts[0], cb);
}

function extendEnds(pts: TilePt[], by: number): TilePt[] {
  if (pts.length < 2) return pts;
  const a = pts[0];
  const a2 = pts[1];
  const b = pts[pts.length - 1];
  const b2 = pts[pts.length - 2];
  const la = Math.hypot(a.tx - a2.tx, a.ty - a2.ty) || 1;
  const lb = Math.hypot(b.tx - b2.tx, b.ty - b2.ty) || 1;
  return [
    { tx: a.tx + ((a.tx - a2.tx) / la) * by, ty: a.ty + ((a.ty - a2.ty) / la) * by },
    ...pts,
    { tx: b.tx + ((b.tx - b2.tx) / lb) * by, ty: b.ty + ((b.ty - b2.ty) / lb) * by },
  ];
}

function polyDist(px: number, py: number, pts: TilePt[]): number {
  let d = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const e = distSeg(px, py, pts[i].tx, pts[i].ty, pts[i + 1].tx, pts[i + 1].ty);
    if (e < d) d = e;
  }
  return d;
}

const tyOfLat = (lat: number) => geoToTile(lat, 0).ty;

// ───────────────────────────── generator ─────────────────────────────

export function createWorld(): WorldData {
  const W = MAP_W;
  const H = MAP_H;
  const N = W * H;
  const idx = (x: number, y: number) => y * W + x;
  const inB = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;

  // ── 1. coast signed distance field (2 samples / tile) ──
  const SW = W * 2;
  const SH = H * 2;
  const sdf = new Float32Array(SW * SH);
  const water = geoPolyToTiles(WATER);
  const coastEdges: number[] = [];
  for (let i = 0; i < water.length; i++) {
    const a = water[i];
    const b = water[(i + 1) % water.length];
    const offMap =
      (a.ty < 0.5 && b.ty < 0.5) || (a.ty > H - 0.5 && b.ty > H - 0.5) || (a.tx < 0.5 && b.tx < 0.5) || (a.tx > W - 0.5 && b.tx > W - 0.5);
    if (!offMap) coastEdges.push(a.tx, a.ty, b.tx, b.ty);
  }
  {
    // unsigned distance within a band around each coast edge (cheap per-edge bbox loops)
    const CAP = 12;
    const dist = new Float32Array(SW * SH).fill(CAP);
    for (let e = 0; e < coastEdges.length; e += 4) {
      const ax = coastEdges[e];
      const ay = coastEdges[e + 1];
      const bx = coastEdges[e + 2];
      const by = coastEdges[e + 3];
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - CAP) * 2));
      const i1 = Math.min(SW - 1, Math.ceil((Math.max(ax, bx) + CAP) * 2));
      const j0 = Math.max(0, Math.floor((Math.min(ay, by) - CAP) * 2));
      const j1 = Math.min(SH - 1, Math.ceil((Math.max(ay, by) + CAP) * 2));
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const q = distSeg(i * 0.5, j * 0.5, ax, ay, bx, by);
          const k = j * SW + i;
          if (q < dist[k]) dist[k] = q;
        }
    }
    // sign by even-odd scanlines over the full polygon
    const xs: number[] = [];
    for (let j = 0; j < SH; j++) {
      const v = j * 0.5;
      xs.length = 0;
      for (let a = 0, b = water.length - 1; a < water.length; b = a++) {
        const p = water[a];
        const q = water[b];
        if (p.ty > v !== q.ty > v) xs.push(p.tx + ((v - p.ty) / (q.ty - p.ty)) * (q.tx - p.tx));
      }
      xs.sort((m, n) => m - n);
      let wetIdx = 0;
      for (let i = 0; i < SW; i++) {
        const u = i * 0.5;
        while (wetIdx < xs.length && xs[wetIdx] <= u) wetIdx++;
        const wet = (wetIdx & 1) === 1;
        const d = dist[j * SW + i];
        // natural shoreline: gentle coves & points, finer ripples
        const n = (fbm(u * 0.11, v * 0.11, 3, 7) - 0.5) * 1.5 + (vnoise(u * 0.55, v * 0.55, 11) - 0.5) * 0.4;
        const fade = Math.min(1, d / 2.5); // keep exact geography where the coast is narrow
        sdf[j * SW + i] = (wet ? -d : d) + n * (0.75 + 0.25 * Math.min(1, Math.max(0, (d - 0.2) / 3))) * (wet ? fade : 1);
      }
    }
  }
  const sdfAt = (u: number, v: number): number => {
    let gx = u * 2;
    let gy = v * 2;
    if (gx < 0) gx = 0;
    else if (gx > SW - 1.001) gx = SW - 1.001;
    if (gy < 0) gy = 0;
    else if (gy > SH - 1.001) gy = SH - 1.001;
    const x0 = gx | 0;
    const y0 = gy | 0;
    const fx = gx - x0;
    const fy = gy - y0;
    const k = y0 * SW + x0;
    const a = sdf[k] + (sdf[k + 1] - sdf[k]) * fx;
    const b = sdf[k + SW] + (sdf[k + SW + 1] - sdf[k + SW]) * fx;
    return a + (b - a) * fy;
  };

  // ── 2. land / water per tile, remove specks ──
  const isW = new Uint8Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) isW[idx(x, y)] = sdf[y * 2 * SW + x * 2] < 0 ? 1 : 0;
  {
    const comp = new Int32Array(N).fill(-1);
    const stack: number[] = [];
    let cid = 0;
    for (let s = 0; s < N; s++) {
      if (comp[s] !== -1) continue;
      const kind = isW[s];
      const members: number[] = [];
      stack.push(s);
      comp[s] = cid;
      while (stack.length) {
        const c = stack.pop()!;
        members.push(c);
        const cx = c % W;
        const cy = (c / W) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (!inB(nx, ny)) continue;
          const ni = idx(nx, ny);
          if (comp[ni] === -1 && isW[ni] === kind) {
            comp[ni] = cid;
            stack.push(ni);
          }
        }
      }
      if (members.length < 10) {
        // flip speck: islands sink, puddles fill
        for (const m of members) {
          isW[m] = kind ? 0 : 1;
          const mx = m % W;
          const my = (m / W) | 0;
          for (let oy = -1; oy <= 1; oy++)
            for (let ox = -1; ox <= 1; ox++) {
              const sx = mx * 2 + ox;
              const sy = my * 2 + oy;
              if (sx < 0 || sy < 0 || sx >= SW || sy >= SH) continue;
              const k = sy * SW + sx;
              sdf[k] = kind ? Math.max(sdf[k], 0.3) : Math.min(sdf[k], -0.3);
            }
        }
      }
      cid++;
    }
  }

  // ── 3. water depth (BFS distance to land, 8-neighbour) ──
  const depth = new Uint8Array(N);
  {
    const q = new Int32Array(N);
    let qh = 0;
    let qt = 0;
    const dist = new Int32Array(N).fill(-1);
    for (let i = 0; i < N; i++) if (!isW[i]) {
      dist[i] = 0;
      q[qt++] = i;
    }
    while (qh < qt) {
      const c = q[qh++];
      const cx = c % W;
      const cy = (c / W) | 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          if (!inB(nx, ny)) continue;
          const ni = idx(nx, ny);
          if (dist[ni] !== -1) continue;
          dist[ni] = dist[c] + 1;
          q[qt++] = ni;
        }
    }
    for (let i = 0; i < N; i++) depth[i] = isW[i] ? Math.min(255, Math.max(1, dist[i] === -1 ? 255 : dist[i])) : 0;
  }

  const terrain = new Uint8Array(N);
  const region = new Uint8Array(N);
  const city = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (isW[i]) terrain[i] = depth[i] <= 2 ? T.sigSu : depth[i] <= 7 ? T.su : T.derinSu;
    else terrain[i] = T.cimen;
  }

  // ── 4. walls: Theodosian land walls (barrier for the city flood) ──
  const wallTiles = geoPolyToTiles(LAND_WALLS);
  const barrier = new Uint8Array(N);
  walkPoly4(extendEnds(wallTiles, 5), (x, y) => {
    if (inB(x, y)) barrier[idx(x, y)] = 1;
  });

  const flood = (seed: TilePt, ok: (i: number) => boolean, mark: (i: number) => void): number => {
    const sx = Math.round(seed.tx);
    const sy = Math.round(seed.ty);
    if (!inB(sx, sy)) return 0;
    const s = idx(sx, sy);
    if (!ok(s)) return 0;
    const seen = new Uint8Array(N);
    const st = [s];
    seen[s] = 1;
    let n = 0;
    while (st.length) {
      const c = st.pop()!;
      mark(c);
      n++;
      const cx = c % W;
      const cy = (c / W) | 0;
      if (cx + 1 < W && !seen[c + 1] && ok(c + 1)) (seen[c + 1] = 1), st.push(c + 1);
      if (cx > 0 && !seen[c - 1] && ok(c - 1)) (seen[c - 1] = 1), st.push(c - 1);
      if (cy + 1 < H && !seen[c + W] && ok(c + W)) (seen[c + W] = 1), st.push(c + W);
      if (cy > 0 && !seen[c - W] && ok(c - W)) (seen[c - W] = 1), st.push(c - W);
    }
    return n;
  };

  // City = land reachable from Ayasofya without crossing the wall line.
  const cityCount = flood(landmarkTile('ayasofya'), (i) => !isW[i] && !barrier[i], (i) => (city[i] = 1));
  if (cityCount === 0 || cityCount > 9000) {
    // Safety net (should never trigger): polygon test.
    city.fill(0);
    const poly = geoPolyToTiles([...LAND_WALLS, ...WATER.slice(3, 22).reverse()] as LatLon[]);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!isW[idx(x, y)] && pointInPoly(x, y, poly)) city[idx(x, y)] = 1;
  }

  // Galata: inside the Genoese walls, extended south to the Golden Horn shore.
  const galataPoly = geoPolyToTiles(GALATA_WALLS);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      if (isW[i]) continue;
      let inG = pointInPoly(x, y, galataPoly);
      if (!inG && sdf[y * 2 * SW + x * 2] < 3.5) for (let k = 1; k <= 3 && !inG; k++) inG = pointInPoly(x, y - k, galataPoly);
      if (inG) city[i] = 2;
    }

  // ── 5. regions ──
  // water: Golden Horn (inside the chain), Bosphorus, Marmara
  const chainBar = new Uint8Array(N);
  walkPoly4(extendEnds(geoPolyToTiles(CHAIN), 3), (x, y) => {
    if (inB(x, y)) chainBar[idx(x, y)] = 1;
  });
  const halic = new Uint8Array(N);
  const hornSeed = geoToTile(41.0385, 28.952);
  const hs = nearestOf(hornSeed, (i) => isW[i] === 1 && !chainBar[i], W, H);
  if (hs) flood(hs, (i) => isW[i] === 1 && !chainBar[i], (i) => (halic[i] = 1));
  const sb = geoToTile(41.017, 28.9855);
  const us = geoToTile(41.025, 29.02);
  // landmass split for Europe: Thrace vs Pera (Horn head closed along the Kağıthane valley)
  const kagBar = new Uint8Array(N);
  walkPoly4([geoToTile(41.0648, 28.9405), geoToTile(41.0995, 28.9425)], (x, y) => {
    if (inB(x, y)) kagBar[idx(x, y)] = 1;
  });
  const anadolu = new Uint8Array(N);
  const as = nearestOf(landmarkTile('anadoluHisari'), (i) => !isW[i], W, H);
  if (as) flood(as, (i) => !isW[i], (i) => (anadolu[i] = 1));
  const trakya = new Uint8Array(N);
  const ts = nearestOf(landmarkTile('otag'), (i) => !isW[i] && !city[i], W, H);
  if (ts) flood(ts, (i) => !isW[i] && !city[i] && !barrier[i] && !kagBar[i] && !anadolu[i], (i) => (trakya[i] = 1));
  const peraLimit = tyOfLat(41.055);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      let r: number;
      if (isW[i]) {
        if (halic[i]) r = R.halic;
        else {
          const cross = (us.tx - sb.tx) * (y - sb.ty) - (us.ty - sb.ty) * (x - sb.tx);
          // north of the line (screen orientation: y grows south) ⇒ cross < 0
          r = cross < 0 ? R.bogaz : R.marmara;
        }
      } else if (city[i] === 1) r = R.surIci;
      else if (city[i] === 2) r = R.galata;
      else if (anadolu[i]) r = R.anadolu;
      else if (barrier[i]) r = xOnCitySide(x, y, wallTiles) ? R.surIci : R.trakya;
      else if (trakya[i] || kagBar[i]) r = R.trakya;
      else r = y > peraLimit ? R.pera : R.bogazAvrupa;
      region[i] = r;
    }

  // ── 6. relief ──
  // Land rises with distance from the nearest water body: steep along the Bosphorus,
  // moderate around the Golden Horn, gentle toward the Marmara and in Thrace; then
  // the historical hills (data/geography HILLS), the Pera ridge, noise and carved valleys.
  const relief = new Float32Array(N);
  {
    const lab = new Int8Array(N).fill(-1);
    const ld = new Float32Array(N).fill(1e9);
    const q = new Int32Array(N);
    let qh = 0;
    let qt = 0;
    for (let i = 0; i < N; i++)
      if (isW[i]) {
        lab[i] = region[i];
        ld[i] = 0;
        q[qt++] = i;
      }
    while (qh < qt) {
      const c = q[qh++];
      const cx = c % W;
      const cy = (c / W) | 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          if (!inB(nx, ny)) continue;
          const ni = idx(nx, ny);
          if (lab[ni] !== -1) continue;
          lab[ni] = lab[c];
          ld[ni] = ld[c] + (dx && dy ? 1.414 : 1);
          q[qt++] = ni;
        }
    }
    const M = new Float32Array(N);
    const S = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const l = lab[i];
      M[i] = l === R.bogaz ? 3.0 : l === R.halic ? 2.2 : 1.7;
      S[i] = l === R.bogaz ? 3.2 : l === R.halic ? 4.5 : 8;
    }
    const blur = (a: Float32Array, r: number) => {
      const t = new Float32Array(N);
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          let sum = 0;
          let n = 0;
          for (let dx = -r; dx <= r; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= W) continue;
            sum += a[idx(nx, y)];
            n++;
          }
          t[idx(x, y)] = sum / n;
        }
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          let sum = 0;
          let n = 0;
          for (let dy = -r; dy <= r; dy++) {
            const ny = y + dy;
            if (ny < 0 || ny >= H) continue;
            sum += t[idx(x, ny)];
            n++;
          }
          a[idx(x, y)] = sum / n;
        }
    };
    blur(M, 6);
    blur(S, 6);
    const hillT = HILLS.map(([la, lo, r, lv]) => ({ c: geoToTile(la, lo), r, lv }));
    const pera = { pts: geoPolyToTiles(RIDGES[0].pts), r: RIDGES[0].radius, lv: RIDGES[0].level };
    const valleyT = VALLEYS.map((rd) => ({ pts: geoPolyToTiles(rd.pts), r: rd.radius, lv: rd.level }));
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = idx(x, y);
        const sv = sdf[y * 2 * SW + x * 2];
        const d = Math.max(0, sv < 9 ? sv : ld[i]);
        const m = M[i];
        let h = 0.5 + m * (0.2 + 0.8 * (1 - Math.exp(-d / S[i])));
        const inland = Math.min(1, d / 4);
        // historical hills: soft swells, noise-shaped
        for (const hl of hillT) {
          const dd = Math.hypot(x - hl.c.tx, y - hl.c.ty) / (hl.r * 1.4);
          if (dd < 2.2) h += hl.lv * 0.42 * Math.exp(-1.6 * dd * dd) * inland;
        }
        {
          const dd = polyDist(x, y, pera.pts) / (pera.r * (0.75 + 0.5 * vnoise(x * 0.1, y * 0.1, 9)));
          if (dd < 2.4) h += 0.9 * Math.exp(-1.3 * dd * dd) * inland;
        }
        h += ((fbm(x * 0.055, y * 0.055, 3, 3) - 0.5) * 1.5 + (vnoise(x * 0.2, y * 0.2, 5) - 0.5) * 0.35) * inland;
        for (const vd of valleyT) {
          const dd = polyDist(x, y, vd.pts) / vd.r;
          if (dd < 2.6) h -= vd.lv * Math.exp(-1.4 * dd * dd);
        }
        relief[i] = Math.max(0.5, Math.min(MAX_HEIGHT, h));
      }
  }

  // ── 7. land cover ──
  const roadLines: { pts: TilePt[]; w: number }[] = [
    { pts: geoPolyToTiles(EDIRNE_ROAD), w: 0.65 },
    { pts: geoPolyToTiles(SILIVRI_ROAD), w: 0.65 },
    ...EXTRA_ROADS.map((r) => ({ pts: geoPolyToTiles(r.pts), w: r.halfWidth })),
  ].map((r) => ({ pts: chaikin(r.pts, 3), w: r.w }));

  const isLandFree = (i: number) => !isW[i] && !city[i];
  // fields (tarla): patchwork in Thrace + around Üsküdar
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      if (!isLandFree(i)) continue;
      const rg = region[i];
      if (rg !== R.trakya && rg !== R.anadolu && rg !== R.bogazAvrupa) continue;
      const n = fbm(x * 0.055 + 3.1, y * 0.055 - 1.7, 3, 21);
      const steep = relief[i] > 2.9;
      const thr = rg === R.trakya ? 0.57 : 0.64;
      if (n > thr && !steep && sdf[y * 2 * SW + x * 2] > 2) terrain[i] = T.tarla;
    }
  // forests
  const forestT = FORESTS.map(([la, lo, r]) => ({ c: geoToTile(la, lo), r }));
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      if (!isLandFree(i)) continue;
      for (const f of forestT) {
        const d = Math.hypot(x - f.c.tx, y - f.c.ty) / f.r + (fbm(x * 0.2, y * 0.2, 2, 41) - 0.5) * 0.7;
        if (d < 1) {
          terrain[i] = T.orman;
          break;
        }
      }
    }
  // beaches: low coasts outside the walls
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      if (!isLandFree(i)) continue;
      const s = sdf[y * 2 * SW + x * 2];
      if (s > 1.6) continue;
      const n = vnoise(x * 0.18, y * 0.18, 61);
      if (relief[i] < 1.25 && n > 0.4) terrain[i] = T.kum;
    }
  // quarries
  for (const q of QUARRIES) {
    const c = geoToTile(q[0], q[1]);
    for (let y = Math.floor(c.ty - 5); y <= c.ty + 5; y++)
      for (let x = Math.floor(c.tx - 5); x <= c.tx + 5; x++) {
        if (!inB(x, y)) continue;
        const i = idx(x, y);
        if (!isLandFree(i)) continue;
        const d = Math.hypot(x - c.tx, y - c.ty) + (vnoise(x * 0.5, y * 0.5, 71) - 0.5) * 1.6;
        if (d < 2.8) terrain[i] = T.kaya;
      }
  }
  // city ground
  for (let i = 0; i < N; i++) if (city[i] && !isW[i]) terrain[i] = T.sehir;

  // ── 8. segments (roads, walls) ──
  const segs: LineSeg[] = [];
  for (const r of roadLines)
    for (let i = 0; i + 1 < r.pts.length; i++)
      segs.push({ ax: r.pts[i].tx, ay: r.pts[i].ty, bx: r.pts[i + 1].tx, by: r.pts[i + 1].ty, kind: SEG_ROAD, w: r.w });
  for (const s of SECTIONS) {
    if (s.kind !== 'kara') continue;
    const p = geoPolyToTiles(s.path);
    for (let i = 0; i + 1 < p.length; i++)
      segs.push({ ax: p[i].tx, ay: p[i].ty, bx: p[i + 1].tx, by: p[i + 1].ty, kind: SEG_LANDWALL, w: s.moat ? 1 : 0 });
  }
  for (let i = 0; i < galataPoly.length; i++) {
    const a = galataPoly[i];
    const b = galataPoly[(i + 1) % galataPoly.length];
    segs.push({ ax: a.tx, ay: a.ty, bx: b.tx, by: b.ty, kind: SEG_GALATAWALL, w: 0 });
  }

  // per-segment bounding-box rasterization helper
  const forSegTiles = (g: LineSeg, reach: number, cb: (i: number, d: number) => void) => {
    const x0 = Math.max(0, Math.floor(Math.min(g.ax, g.bx) - reach));
    const x1 = Math.min(W - 1, Math.ceil(Math.max(g.ax, g.bx) + reach));
    const y0 = Math.max(0, Math.floor(Math.min(g.ay, g.by) - reach));
    const y1 = Math.min(H - 1, Math.ceil(Math.max(g.ay, g.by) + reach));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const d = distSeg(x, y, g.ax, g.ay, g.bx, g.by);
        if (d <= reach) cb(idx(x, y), d);
      }
  };
  // moat (hendek): 0.75–2.35 tiles outside land-wall sections with SectionDef.moat
  {
    const wd = new Float32Array(N).fill(Infinity);
    const wm = new Uint8Array(N);
    for (const g of segs) {
      if (g.kind !== SEG_LANDWALL) continue;
      forSegTiles(g, 2.5, (i, d) => {
        if (d < wd[i]) {
          wd[i] = d;
          wm[i] = g.w > 0 ? 1 : 0;
        }
      });
    }
    for (let i = 0; i < N; i++) {
      if (isW[i] || city[i] || barrier[i]) continue;
      if (wm[i] && wd[i] >= 0.75 && wd[i] <= 2.35) terrain[i] = T.hendek;
    }
  }
  // roads (gates get causeways across the moat)
  for (const g of segs) {
    if (g.kind !== SEG_ROAD) continue;
    forSegTiles(g, g.w + 0.12, (i) => {
      if (isW[i] || city[i] || barrier[i]) return;
      terrain[i] = T.yol;
    });
  }
  // land wall line
  walkPoly4(wallTiles, (x, y) => {
    if (!inB(x, y)) return;
    const i = idx(x, y);
    if (isW[i]) return;
    terrain[i] = T.sur;
    region[i] = R.surIci;
  });
  // Galata walls (land side) and every sea-wall ring (city & Galata shore)
  walkPoly4(
    galataPoly,
    (x, y) => {
      if (!inB(x, y)) return;
      const i = idx(x, y);
      if (isW[i]) return;
      terrain[i] = T.sur;
      region[i] = R.galata;
      if (!city[i]) city[i] = 2;
    },
    true,
  );
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      if (isW[i] || !city[i]) continue;
      let shore = false;
      for (let dy = -1; dy <= 1 && !shore; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (inB(nx, ny) && isW[idx(nx, ny)]) {
            shore = true;
            break;
          }
        }
      if (shore) terrain[i] = T.sur;
    }

  // ── 9. heights ──
  const hext = new Float32Array(N);
  {
    const tmp = new Float32Array(N);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = idx(x, y);
        tmp[i] = relief[i];
      }
    // gentle blur for smooth slopes
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        let s = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (!inB(nx, ny)) continue;
            const wgt = dx === 0 && dy === 0 ? 4 : dx === 0 || dy === 0 ? 2 : 1;
            s += tmp[idx(nx, ny)] * wgt;
            n += wgt;
          }
        hext[idx(x, y)] = s / n;
      }
    for (let i = 0; i < N; i++) {
      const t = terrain[i];
      if (t === T.kum) hext[i] = Math.min(hext[i], 0.32);
      hext[i] = Math.max(0, Math.min(MAX_HEIGHT, hext[i]));
    }
    // beaches blend: land next to sand eases down
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = idx(x, y);
        if (isW[i] || terrain[i] === T.kum) continue;
        let sand = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (inB(nx, ny) && terrain[idx(nx, ny)] === T.kum) sand++;
          }
        if (sand >= 3) hext[i] = Math.min(hext[i], 0.32 + (hext[i] - 0.32) * 0.55);
      }
  }
  // water tiles carry neighbouring land heights (render banks stay crisp)
  {
    const has = new Uint8Array(N);
    for (let i = 0; i < N; i++) has[i] = isW[i] ? 0 : 1;
    for (let it = 0; it < 3; it++) {
      const add: [number, number][] = [];
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const i = idx(x, y);
          if (has[i]) continue;
          let s = 0;
          let n = 0;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx;
              const ny = y + dy;
              if (!inB(nx, ny)) continue;
              const ni = idx(nx, ny);
              if (has[ni]) {
                s += hext[ni];
                n++;
              }
            }
          if (n) add.push([i, s / n]);
        }
      for (const [i, v] of add) {
        hext[i] = v;
        has[i] = 1;
      }
    }
    for (let i = 0; i < N; i++) if (!has[i]) hext[i] = 0.5;
  }

  // ── 10. segment spatial index (CSR) ──
  const segStart = new Int32Array(N + 1);
  const lists: number[][] = new Array(N);
  for (let i = 0; i < N; i++) lists[i] = [];
  segs.forEach((g, s) => {
    const reach = g.kind === SEG_ROAD ? g.w + 1.8 : 3.4;
    const x0 = Math.max(0, Math.floor(Math.min(g.ax, g.bx) - reach));
    const x1 = Math.min(W - 1, Math.ceil(Math.max(g.ax, g.bx) + reach));
    const y0 = Math.max(0, Math.floor(Math.min(g.ay, g.by) - reach));
    const y1 = Math.min(H - 1, Math.ceil(Math.max(g.ay, g.by) + reach));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) if (distSeg(x, y, g.ax, g.ay, g.bx, g.by) <= reach) lists[idx(x, y)].push(s);
  });
  let total = 0;
  for (let i = 0; i < N; i++) {
    segStart[i] = total;
    total += lists[i].length;
  }
  segStart[N] = total;
  const segList = new Int32Array(total);
  for (let i = 0, k = 0; i < N; i++) for (const s of lists[i]) segList[k++] = s;

  // ── 11. movement cost grids ──
  const blocked = new Uint8Array(N); // 0 default · 1 blocked by structure · 2 forced open (breach)
  const landCost = new Float64Array(N);
  const seaCost = new Float64Array(N);
  const baseCost = (t: number) =>
    t === T.yol ? 0.6 : t === T.orman ? 1.7 : t === T.kaya ? 1.5 : t === T.hendek ? 2.5 : t === T.sur ? Infinity : 1;
  const recost = (i: number) => {
    const t = terrain[i];
    const x = i % W;
    const y = (i / W) | 0;
    if (isW[i]) {
      landCost[i] = Infinity;
      seaCost[i] = blocked[i] === 1 ? Infinity : t === T.sigSu ? 1.4 : 1;
      return;
    }
    seaCost[i] = Infinity;
    if (blocked[i] === 1) {
      landCost[i] = Infinity;
      return;
    }
    let c = t === T.sur && blocked[i] === 2 ? 1.2 : baseCost(t);
    if (isFinite(c)) {
      let dh = 0;
      const h0 = hext[i];
      if (x > 0) dh = Math.max(dh, Math.abs(hext[i - 1] - h0));
      if (x + 1 < W) dh = Math.max(dh, Math.abs(hext[i + 1] - h0));
      if (y > 0) dh = Math.max(dh, Math.abs(hext[i - W] - h0));
      if (y + 1 < H) dh = Math.max(dh, Math.abs(hext[i + W] - h0));
      c += 0.15 * dh;
    }
    landCost[i] = c;
  };
  for (let i = 0; i < N; i++) recost(i);

  // ── 12. A* (typed arrays, lazy reset via generation stamps) ──
  const gScore = new Float32Array(N);
  const fScore = new Float32Array(N);
  const came = new Int32Array(N);
  const stamp = new Uint32Array(N);
  const closedStamp = new Uint32Array(N);
  let gen = 0;
  const heap = new Int32Array(N * 4);
  const DX = [1, -1, 0, 0, 1, 1, -1, -1];
  const DY = [0, 0, 1, -1, 1, -1, 1, -1];
  const DC = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2];

  const findPath = (from: TilePt, to: TilePt, mode: MoveMode): TilePt[] | null => {
    const cost = mode === 'sea' ? seaCost : landCost;
    const minC = mode === 'sea' ? 1 : 0.6;
    const sx = Math.round(from.tx);
    const sy = Math.round(from.ty);
    const gx = Math.round(to.tx);
    const gy = Math.round(to.ty);
    if (!inB(sx, sy) || !inB(gx, gy)) return null;
    const goal = idx(gx, gy);
    const start = idx(sx, sy);
    if (!isFinite(cost[goal])) return null;
    if (start === goal) return [{ tx: gx, ty: gy }];
    gen++;
    if (gen > 0xfffffff0) {
      stamp.fill(0);
      closedStamp.fill(0);
      gen = 1;
    }
    const hfn = (x: number, y: number) => {
      const dx = Math.abs(x - gx);
      const dy = Math.abs(y - gy);
      return minC * (dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy));
    };
    let hn = 0;
    const push = (i: number) => {
      let c = hn++;
      heap[c] = i;
      const fi = fScore[i];
      while (c > 0) {
        const p = (c - 1) >> 1;
        if (fScore[heap[p]] <= fi) break;
        heap[c] = heap[p];
        c = p;
      }
      heap[c] = i;
    };
    const pop = (): number => {
      const top = heap[0];
      const last = heap[--hn];
      if (hn > 0) {
        let c = 0;
        const fl = fScore[last];
        for (;;) {
          const l = c * 2 + 1;
          if (l >= hn) break;
          const r = l + 1;
          const m = r < hn && fScore[heap[r]] < fScore[heap[l]] ? r : l;
          if (fScore[heap[m]] >= fl) break;
          heap[c] = heap[m];
          c = m;
        }
        heap[c] = last;
      }
      return top;
    };
    stamp[start] = gen;
    gScore[start] = 0;
    came[start] = -1;
    fScore[start] = hfn(sx, sy);
    push(start);
    let expanded = 0;
    let found = false;
    while (hn > 0) {
      const cur = pop();
      if (cur === goal) {
        found = true;
        break;
      }
      if (closedStamp[cur] === gen) continue;
      closedStamp[cur] = gen;
      if (++expanded > 80000) break;
      const cx = cur % W;
      const cy = (cur / W) | 0;
      const gc = gScore[cur];
      for (let k = 0; k < 8; k++) {
        const nx = cx + DX[k];
        const ny = cy + DY[k];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx;
        const c = cost[ni];
        if (c === Infinity) continue;
        if (k >= 4 && (cost[cy * W + nx] === Infinity || cost[ny * W + cx] === Infinity)) continue;
        if (closedStamp[ni] === gen) continue;
        const ng = gc + DC[k] * c;
        if (stamp[ni] !== gen || ng < gScore[ni]) {
          stamp[ni] = gen;
          gScore[ni] = ng;
          came[ni] = cur;
          fScore[ni] = ng + hfn(nx, ny);
          if (hn >= heap.length - 1) return null;
          push(ni);
        }
      }
    }
    if (!found) return null;
    const out: TilePt[] = [];
    let c = goal;
    while (c !== -1) {
      out.push({ tx: c % W, ty: (c / W) | 0 });
      if (c === start) break;
      c = came[c];
    }
    return out.reverse();
  };

  // ── 13. API ──
  const ri = (v: number) => Math.round(v);
  const surfaceAt = (u: number, v: number): number => {
    if (u < 0) u = 0;
    else if (u > W - 1.001) u = W - 1.001;
    if (v < 0) v = 0;
    else if (v > H - 1.001) v = H - 1.001;
    const x0 = u | 0;
    const y0 = v | 0;
    const fx = u - x0;
    const fy = v - y0;
    const k = y0 * W + x0;
    const a = hext[k] + (hext[k + 1] - hext[k]) * fx;
    const b = hext[k + W] + (hext[k + W + 1] - hext[k + W]) * fx;
    return a + (b - a) * fy;
  };
  /** Render/gameplay surface: bilinear height, terraced into ledges where slopes are steep. */
  const terracedAt = (u: number, v: number): number => {
    if (u < 0) u = 0;
    else if (u > W - 1.001) u = W - 1.001;
    if (v < 0) v = 0;
    else if (v > H - 1.001) v = H - 1.001;
    const x0 = u | 0;
    const y0 = v | 0;
    const k = y0 * W + x0;
    return terrace(hext[k], hext[k + 1], hext[k + W], hext[k + W + 1], u - x0, v - y0);
  };
  const heightAt = (tx: number, ty: number): number => {
    const x = ri(tx);
    const y = ri(ty);
    if (!inB(x, y)) return 0;
    const i = idx(x, y);
    if (isW[i]) return 0;
    let h = terracedAt(tx, ty);
    if (!city[i] && terrain[i] !== T.yol) {
      let dWall = 99;
      let moat = 0;
      for (let q = segStart[i]; q < segStart[i + 1]; q++) {
        const g = segs[segList[q]];
        if (g.kind !== SEG_LANDWALL) continue;
        const d = distSeg(tx, ty, g.ax, g.ay, g.bx, g.by);
        if (d < dWall) {
          dWall = d;
          moat = g.w;
        }
      }
      if (moat) h -= moatDepth(dWall) * MOAT_DEPTH;
    }
    return h;
  };

  const api: WorldData = {
    width: W,
    height: H,
    W,
    H,
    terrain,
    region,
    hext,
    relief,
    depth,
    sdf,
    sdfW: SW,
    sdfH: SH,
    city,
    segs,
    segStart,
    segList,
    blockedVersion: 0,
    sdfAt,
    surfaceAt,
    terracedAt,
    idx,
    inBounds: (tx, ty) => inB(ri(tx), ri(ty)),
    terrainAt: (tx, ty) => {
      const x = ri(tx);
      const y = ri(ty);
      return inB(x, y) ? TERRAIN_LIST[terrain[idx(x, y)]] : 'derin-su';
    },
    heightAt,
    isWater: (tx, ty) => {
      const x = ri(tx);
      const y = ri(ty);
      return inB(x, y) ? isW[idx(x, y)] === 1 : true;
    },
    regionAt: (tx, ty): RegionId => {
      const x = Math.max(0, Math.min(W - 1, ri(tx)));
      const y = Math.max(0, Math.min(H - 1, ri(ty)));
      return REGION_LIST[region[idx(x, y)]];
    },
    moveCost: (tx, ty, mode) => {
      const x = ri(tx);
      const y = ri(ty);
      if (!inB(x, y)) return Infinity;
      return mode === 'sea' ? seaCost[idx(x, y)] : landCost[idx(x, y)];
    },
    findPath,
    nearestPassable: (t, mode, radius = 8) => {
      const cx = ri(t.tx);
      const cy = ri(t.ty);
      const cost = mode === 'sea' ? seaCost : landCost;
      for (let r = 0; r <= radius; r++) {
        let best: TilePt | null = null;
        let bd = Infinity;
        for (let dy = -r; dy <= r; dy++)
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            const x = cx + dx;
            const y = cy + dy;
            if (!inB(x, y) || cost[idx(x, y)] === Infinity) continue;
            const d = Math.hypot(x - t.tx, y - t.ty);
            if (d < bd) {
              bd = d;
              best = { tx: x, ty: y };
            }
          }
        if (best) return best;
      }
      return null;
    },
    toWorld: (tx, ty): Pt => tileToWorld(tx, ty, heightAt(tx, ty)),
    toTile: (wx, wy): TilePt => {
      let t = worldToTile(wx, wy);
      for (let k = 0; k < 4; k++) {
        const h = heightAt(t.tx, t.ty);
        t = worldToTile(wx, wy + h * HEIGHT_STEP);
      }
      return t;
    },
    setBlocked: (tx, ty, b) => {
      const x = ri(tx);
      const y = ri(ty);
      if (!inB(x, y)) return;
      const i = idx(x, y);
      const nv = b ? 1 : terrain[i] === T.sur ? 2 : 0;
      if (blocked[i] === nv) return;
      blocked[i] = nv;
      recost(i);
      (api as { blockedVersion: number }).blockedVersion++;
    },
  };
  return api;
}

/** Nearest tile (Chebyshev rings) satisfying ok, or null. */
function nearestOf(t: TilePt, ok: (i: number) => boolean, W: number, H: number): TilePt | null {
  const cx = Math.round(t.tx);
  const cy = Math.round(t.ty);
  for (let r = 0; r < 20; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        if (ok(y * W + x)) return { tx: x, ty: y };
      }
  return null;
}

/** For barrier cells: is the cell on the city (east) side of the land-wall polyline? */
function xOnCitySide(x: number, y: number, wall: TilePt[]): boolean {
  // the land walls run N→S; the city lies to the east (+tx)
  let best = Infinity;
  let side = false;
  for (let i = 0; i + 1 < wall.length; i++) {
    const a = wall[i];
    const b = wall[i + 1];
    const d = distSeg(x, y, a.tx, a.ty, b.tx, b.ty);
    if (d < best) {
      best = d;
      const cross = (b.tx - a.tx) * (y - a.ty) - (b.ty - a.ty) * (x - a.tx);
      side = cross <= 0;
    }
  }
  return side;
}

/**
 * Terraced surface from a bilinear cell (corner heights + fractions). On steep
 * slopes the ground forms ledges at whole height levels (crisp cliffs with strata in
 * the renderer); gentle ground stays smooth. Shared by heightAt and the baker.
 */
export function terrace(h00: number, h10: number, h01: number, h11: number, fx: number, fy: number): number {
  const h = (h00 + (h10 - h00) * fx) * (1 - fy) + (h01 + (h11 - h01) * fx) * fy;
  const gu = (h10 - h00) * (1 - fy) + (h11 - h01) * fy;
  const gv = (h01 - h00) * (1 - fx) + (h11 - h10) * fx;
  const g = Math.sqrt(gu * gu + gv * gv);
  if (g < 0.2) return h;
  let k = (g - 0.2) / 0.25;
  if (k > 1) k = 1;
  k = k * k * (3 - 2 * k);
  const f = h - Math.floor(h);
  let e = (f - 0.8) / 0.16;
  e = e <= 0 ? 0 : e >= 1 ? 1 : e * e * (3 - 2 * e);
  const ht = Math.floor(h) + e;
  return h + (ht - h) * k;
}

/** Moat profile (0..1) by distance from the land-wall line: steep scarps, flat bottom. */
export const MOAT_DEPTH = 0.95;
export function moatDepth(dWall: number): number {
  if (dWall <= 0.7 || dWall >= 2.45) return 0;
  const e = Math.min((dWall - 0.78) / 0.22, (2.38 - dWall) / 0.22);
  return e <= 0 ? 0 : e >= 1 ? 1 : e;
}

/** Cached singleton for render-side modules (GameScene builds its own via createWorld too). */
let shared: WorldData | null = null;
export function asWorldData(w: WorldApi): WorldData | null {
  if ((w as WorldData).sdf instanceof Float32Array) return w as WorldData;
  return shared;
}
export function sharedWorld(): WorldData {
  if (!shared) shared = createWorld();
  return shared;
}
