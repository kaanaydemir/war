import { geoPolyToTiles, geoToTile, LAND_WALLS, OVERLAND_ROUTE } from '../../data/geography';
import { landmarkTile } from '../../data/landmarks';
import { CHAPELS, DECOR_EXCLUDE, VILLAGES } from './data';
import { distSeg, fbm, ihash, vnoise } from './noise';
import { R, T, type WorldData } from './terrain';

/**
 * DECOR PLACEMENT (pure, deterministic): trees, cypresses, plane trees, orchards,
 * vineyards, bushes, rocks, reeds, farmhouses and village chapels. Positions never
 * depend on the season — only the art does.
 */
export const DECOR_KINDS = ['agac', 'servi', 'cinar', 'zeytin', 'meyve', 'asma', 'cali', 'kaya', 'saz', 'ev', 'kulube', 'sapel', 'tinaz'] as const;
export type DecorKind = (typeof DECOR_KINDS)[number];

export interface DecorSpec {
  /** Frame size of the sprite. */
  w: number;
  h: number;
  /** Foot (ground contact) inside the frame, px from top-left. */
  fx: number;
  fy: number;
  variants: number;
  /** Wind-sway frames (1 = static). */
  frames: number;
  /** Baked ground shadow ellipse: radii and offset from the foot (toward lower-right). */
  shadow: { rx: number; ry: number; ox: number; oy: number };
  /** Season-specific art? (else one 'all' sheet + winter variant only) */
  seasonal: boolean;
}

export const DECOR_SPEC: Record<DecorKind, DecorSpec> = {
  agac: { w: 26, h: 32, fx: 13, fy: 29, variants: 3, frames: 4, shadow: { rx: 10, ry: 4, ox: 5, oy: 1 }, seasonal: true },
  servi: { w: 12, h: 34, fx: 6, fy: 31, variants: 3, frames: 4, shadow: { rx: 7, ry: 2, ox: 6, oy: 1 }, seasonal: false },
  cinar: { w: 36, h: 40, fx: 18, fy: 37, variants: 2, frames: 4, shadow: { rx: 14, ry: 5, ox: 7, oy: 1 }, seasonal: true },
  zeytin: { w: 20, h: 18, fx: 10, fy: 16, variants: 2, frames: 4, shadow: { rx: 7, ry: 3, ox: 4, oy: 1 }, seasonal: false },
  meyve: { w: 18, h: 20, fx: 9, fy: 18, variants: 2, frames: 4, shadow: { rx: 6, ry: 3, ox: 3, oy: 1 }, seasonal: true },
  asma: { w: 14, h: 12, fx: 7, fy: 10, variants: 2, frames: 2, shadow: { rx: 5, ry: 2, ox: 3, oy: 0 }, seasonal: true },
  cali: { w: 14, h: 11, fx: 7, fy: 9, variants: 3, frames: 2, shadow: { rx: 5, ry: 2, ox: 3, oy: 0 }, seasonal: true },
  kaya: { w: 14, h: 11, fx: 7, fy: 9, variants: 3, frames: 1, shadow: { rx: 5, ry: 2, ox: 3, oy: 0 }, seasonal: false },
  saz: { w: 12, h: 16, fx: 6, fy: 14, variants: 2, frames: 4, shadow: { rx: 0, ry: 0, ox: 0, oy: 0 }, seasonal: true },
  ev: { w: 34, h: 32, fx: 19, fy: 23, variants: 2, frames: 1, shadow: { rx: 15, ry: 5, ox: 8, oy: 0 }, seasonal: false },
  kulube: { w: 26, h: 24, fx: 13, fy: 18, variants: 2, frames: 1, shadow: { rx: 11, ry: 4, ox: 6, oy: 0 }, seasonal: false },
  sapel: { w: 30, h: 40, fx: 16, fy: 30, variants: 1, frames: 1, shadow: { rx: 14, ry: 5, ox: 8, oy: 0 }, seasonal: false },
  tinaz: { w: 14, h: 12, fx: 7, fy: 10, variants: 2, frames: 1, shadow: { rx: 5, ry: 2, ox: 3, oy: 0 }, seasonal: false },
};

export interface DecorItem {
  kind: DecorKind;
  tx: number;
  ty: number;
  variant: number;
  /** Per-item phase for wind sway. */
  phase: number;
}

export function placeDecor(world: WorldData): DecorItem[] {
  const { W, H, terrain, region, city } = world;
  const out: DecorItem[] = [];
  const N = W * H;

  // ── exclusion mask ──
  const banned = new Uint8Array(N);
  const ban = (cx: number, cy: number, r: number) => {
    for (let y = Math.floor(cy - r); y <= cy + r; y++)
      for (let x = Math.floor(cx - r); x <= cx + r; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        if (Math.hypot(x - cx, y - cy) <= r) banned[y * W + x] = 1;
      }
  };
  for (const [id, r] of DECOR_EXCLUDE) {
    const t = landmarkTile(id);
    ban(t.tx, t.ty, r);
  }
  const wall = geoPolyToTiles(LAND_WALLS);
  const route = geoPolyToTiles(OVERLAND_ROUTE);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const t = terrain[i];
      if (city[i] || t <= T.sigSu || t === T.yol || t === T.sur || t === T.hendek) {
        banned[i] = 1;
        continue;
      }
      // siege zone in front of the land walls (Ottoman lines, batteries, trenches)
      let dw = Infinity;
      for (let k = 0; k + 1 < wall.length; k++) dw = Math.min(dw, distSeg(x, y, wall[k].tx, wall[k].ty, wall[k + 1].tx, wall[k + 1].ty));
      if (dw < 8) banned[i] = 1;
      let dr = Infinity;
      for (let k = 0; k + 1 < route.length; k++) dr = Math.min(dr, distSeg(x, y, route[k].tx, route[k].ty, route[k + 1].tx, route[k + 1].ty));
      if (dr < 2.2) banned[i] = 1;
    }
  // keep 1 tile off roads
  const nearRoad = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H && terrain[ny * W + nx] === T.yol) return true;
      }
    return false;
  };
  const ok = (x: number, y: number) => {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= W || yi >= H) return false;
    if (banned[yi * W + xi]) return false;
    if (world.sdfAt(x, y) < 0.45) return false;
    return !nearRoad(xi, yi);
  };
  const add = (kind: DecorKind, tx: number, ty: number, seed: number) => {
    out.push({ kind, tx, ty, variant: Math.floor(ihash(seed, 17, 3) * 1000), phase: ihash(seed, 29, 5) * Math.PI * 2 });
  };

  const kag = landmarkTile('kagithane');
  let seed = 1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (banned[i]) continue;
      const t = terrain[i];
      const rg = region[i];
      const r0 = ihash(x, y, 101);
      const s = world.sdfAt(x, y);
      const nearKag = Math.hypot(x - kag.tx, y - kag.ty) < 11;
      // sub-tile jitter positions
      const jx = (k: number) => x + (ihash(x, y, 200 + k) - 0.5) * 0.9;
      const jy = (k: number) => y + (ihash(x, y, 300 + k) - 0.5) * 0.9;

      if (t === T.orman) {
        // dense canopy: up to 2 trees per tile, bushes at the margins
        const edge = fbm(x * 0.2, y * 0.2, 2, 41);
        for (let k = 0; k < 2; k++) {
          if (ihash(x, y, 400 + k) > 0.78) continue;
          const px = jx(k);
          const py = jy(k);
          if (!ok(px, py)) continue;
          const r = ihash(x, y, 500 + k);
          const kind: DecorKind = r < 0.07 ? 'cinar' : r < 0.14 ? 'cali' : r < 0.18 && edge > 0.55 ? 'servi' : 'agac';
          add(kind, px, py, seed++);
        }
        continue;
      }
      if (t === T.kaya) {
        if (r0 < 0.3 && ok(jx(0), jy(0))) add('kaya', jx(0), jy(0), seed++);
        continue;
      }
      if (t === T.kum) {
        if (nearKag && s < 2.2 && r0 < 0.5 && ok(jx(0), jy(0))) add('saz', jx(0), jy(0), seed++);
        else if (r0 < 0.02 && ok(jx(0), jy(0))) add('kaya', jx(0), jy(0), seed++);
        continue;
      }
      if (t === T.tarla) {
        if (r0 < 0.018 && ok(jx(0), jy(0))) add('tinaz', jx(0), jy(0), seed++);
        else if (r0 > 0.992 && ok(jx(1), jy(1))) add('agac', jx(1), jy(1), seed++);
        continue;
      }
      if (t !== T.cimen) continue;

      // Kağıthane meadows: reeds by the water, great plane trees
      if (nearKag) {
        if (s < 2.4 && r0 < 0.55) {
          for (let k = 0; k < 2; k++) if (ok(jx(k), jy(k))) add('saz', jx(k), jy(k), seed++);
          continue;
        }
        if (r0 > 0.9 && ok(jx(0), jy(0))) add('cinar', jx(0), jy(0), seed++);
        continue;
      }
      const grove = vnoise(x * 0.12, y * 0.12, 77);
      const cypressMask = vnoise(x * 0.2 + 5, y * 0.2 - 3, 88);
      const shoreTrees = s < 4.5 && (rg === R.bogazAvrupa || rg === R.anadolu || rg === R.pera);
      if (shoreTrees && r0 < 0.06) {
        if (ok(jx(0), jy(0))) add('cinar', jx(0), jy(0), seed++);
        continue;
      }
      if (rg === R.pera || rg === R.bogazAvrupa) {
        // vineyards of Pera in rows; orchards; cypresses on the slopes
        if (grove > 0.6) {
          // rows along +tx (iso diagonal), two vines per tile
          if (y % 2 === 0 && ok(x, y)) add('asma', x - 0.2, y, seed++);
          if (y % 2 === 0 && ok(x + 0.3, y)) add('asma', x + 0.3, y, seed++);
          continue;
        }
        if (grove < 0.25) {
          if (x % 2 === 0 && y % 2 === 0 && ok(x, y)) add('meyve', x + (r0 - 0.5) * 0.3, y, seed++);
          continue;
        }
        if (cypressMask > 0.72 && r0 < 0.35 && ok(jx(0), jy(0))) add('servi', jx(0), jy(0), seed++);
        else if (r0 < 0.05 && ok(jx(0), jy(0))) add('agac', jx(0), jy(0), seed++);
        else if (r0 > 0.95 && ok(jx(1), jy(1))) add('cali', jx(1), jy(1), seed++);
        continue;
      }
      if (rg === R.anadolu) {
        // Üsküdar cypress groves, olive & fruit orchards
        if (cypressMask > 0.66 && r0 < 0.42 && ok(jx(0), jy(0))) add('servi', jx(0), jy(0), seed++);
        else if (grove > 0.62 && x % 2 === 0 && y % 2 === 1 && ok(x, y)) add('zeytin', x, y + (r0 - 0.5) * 0.3, seed++);
        else if (grove < 0.22 && x % 2 === 1 && y % 2 === 0 && ok(x, y)) add('meyve', x, y, seed++);
        else if (r0 < 0.05 && ok(jx(0), jy(0))) add('agac', jx(0), jy(0), seed++);
        else if (r0 > 0.96 && ok(jx(1), jy(1))) add('cali', jx(1), jy(1), seed++);
        continue;
      }
      // Thrace: open pasture, scattered oaks, bushes, rocks, cypress clumps, olive groves by the Marmara
      if (grove > 0.7 && s < 14 && y > H * 0.6 && x % 2 === 0 && y % 2 === 0 && ok(x, y)) {
        add('zeytin', x, y, seed++);
        continue;
      }
      if (cypressMask > 0.8 && r0 < 0.3 && ok(jx(0), jy(0))) add('servi', jx(0), jy(0), seed++);
      else if (r0 < 0.03 && ok(jx(0), jy(0))) add('agac', jx(0), jy(0), seed++);
      else if (r0 > 0.94 && ok(jx(1), jy(1))) add('cali', jx(1), jy(1), seed++);
      else if (r0 > 0.925 && r0 <= 0.94 && ok(jx(2), jy(2))) add('kaya', jx(2), jy(2), seed++);
    }

  // ── villages & chapels ──
  const taken: { tx: number; ty: number }[] = [];
  const free = (x: number, y: number, r: number) => taken.every((p) => Math.hypot(p.tx - x, p.ty - y) > r);
  VILLAGES.forEach(([la, lo, n], vi) => {
    const c = geoToTile(la, lo);
    let placed = 0;
    for (let a = 0; a < 40 && placed < n; a++) {
      const ang = ihash(vi, a, 900) * Math.PI * 2;
      const rad = 0.5 + ihash(vi, a, 901) * 3.6;
      const x = Math.round(c.tx + Math.cos(ang) * rad);
      const y = Math.round(c.ty + Math.sin(ang) * rad);
      if (!ok(x, y) || !free(x, y, 1.9)) continue;
      const i = y * W + x;
      if (terrain[i] === T.kaya || terrain[i] === T.kum) continue;
      taken.push({ tx: x, ty: y });
      add(placed % 3 === 2 ? 'kulube' : 'ev', x, y, seed++);
      placed++;
      // a fruit tree or two beside the house
      if (ok(x + 1.1, y + 0.4) && free(x + 1.1, y + 0.4, 0.9)) add('meyve', x + 1.1, y + 0.4, seed++);
    }
  });
  for (const [la, lo] of CHAPELS) {
    const c = geoToTile(la, lo);
    const x = Math.round(c.tx);
    const y = Math.round(c.ty);
    if (!ok(x, y) || !free(x, y, 1.5)) continue;
    taken.push({ tx: x, ty: y });
    add('sapel', x, y, seed++);
    if (ok(x - 1.2, y + 0.8)) add('servi', x - 1.2, y + 0.8, seed++);
    if (ok(x + 1.3, y - 0.9)) add('servi', x + 1.3, y - 0.9, seed++);
  }
  // remove natural decor overlapping houses
  return out.filter(
    (d) =>
      d.kind === 'ev' ||
      d.kind === 'kulube' ||
      d.kind === 'sapel' ||
      d.kind === 'meyve' ||
      d.kind === 'servi' ||
      taken.every((p) => Math.hypot(p.tx - d.tx, p.ty - d.ty) > 1.2),
  );
}
