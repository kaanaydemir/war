import type { TilePt } from '../../core/iso';
import { astar } from '../../core/path';
import type { WorldApi } from '../../core/world';
import { CHAIN, OVERLAND_ROUTE, geoPolyToTiles } from '../../data/geography';
import { landmarkTile } from '../../data/landmarks';
import { BRIDGE_DIR } from './data';

/**
 * Pure navigation geometry for the navy (no Phaser): the Golden Horn chain,
 * the overland haul route, the pontoon bridge line, sea path-finding with a
 * chain barrier and anchorage slot generation.
 */

// ───────────────────────────── Chain ─────────────────────────────

/** [Sarayburnu end (Eugenius tower), Galata end (Kastellion)] in tiles. */
export const CHAIN_T: [TilePt, TilePt] = geoPolyToTiles(CHAIN) as [TilePt, TilePt];

const chainDx = CHAIN_T[1].tx - CHAIN_T[0].tx;
const chainDy = CHAIN_T[1].ty - CHAIN_T[0].ty;
const chainLen = Math.hypot(chainDx, chainDy);
/** Unit vector along the chain (Sarayburnu → Galata). */
export const CHAIN_DIR = { tx: chainDx / chainLen, ty: chainDy / chainLen };
/** Unit normal pointing OUT of the Golden Horn (toward the Bosphorus). */
export const CHAIN_OUT = (() => {
  let n = { tx: -CHAIN_DIR.ty, ty: CHAIN_DIR.tx };
  const dip = landmarkTile('diplokionion');
  const mid = chainPoint(0.5);
  if ((dip.tx - mid.tx) * n.tx + (dip.ty - mid.ty) * n.ty < 0) n = { tx: -n.tx, ty: -n.ty };
  return n;
})();
export const CHAIN_LENGTH = chainLen;

export function chainPoint(f: number): TilePt {
  return { tx: CHAIN_T[0].tx + chainDx * f, ty: CHAIN_T[0].ty + chainDy * f };
}

/** Signed distance from the chain line (positive = outside, Bosphorus side). */
export function chainSide(tx: number, ty: number): number {
  return (tx - CHAIN_T[0].tx) * CHAIN_OUT.tx + (ty - CHAIN_T[0].ty) * CHAIN_OUT.ty;
}

/** True if a water point lies inside the Golden Horn (behind the chain). */
export function insideHorn(tx: number, ty: number): boolean {
  const maxTy = Math.max(CHAIN_T[0].ty, CHAIN_T[1].ty);
  return chainSide(tx, ty) < 0 && ty < maxTy + 0.5 && ty > 40;
}

/** Gate points just outside / inside the middle of the chain. */
export function chainGate(outside: boolean, dist = 3): TilePt {
  const m = chainPoint(0.55);
  const s = outside ? dist : -dist;
  return { tx: m.tx + CHAIN_OUT.tx * s, ty: m.ty + CHAIN_OUT.ty * s };
}

// ───────────────────────────── Overland route ─────────────────────────────

/** The authored route (data/geography OVERLAND_ROUTE). */
export const ROUTE_DATA: TilePt[] = geoPolyToTiles(OVERLAND_ROUTE);

interface Route {
  pts: TilePt[];
  lens: number[];
  total: number;
}

function makeRoute(pts: TilePt[]): Route {
  const lens: number[] = [];
  let total = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const l = Math.hypot(pts[i + 1].tx - pts[i].tx, pts[i + 1].ty - pts[i].ty);
    lens.push(l);
    total += l;
  }
  return { pts, lens, total };
}

let route: Route = makeRoute(ROUTE_DATA);

/** Current haul route points (extended to the real waterline once a world is known). */
export let ROUTE_T: TilePt[] = route.pts;
export let ROUTE_LENGTH = route.total;

/**
 * Extend the authored route so it starts and ends at the actual water of the
 * world grid (Bosphorus shore → Golden Horn shore at Kasımpaşa).
 */
function fitRouteToWorld(world: WorldApi): void {
  const pts = ROUTE_DATA.map((p) => ({ ...p }));
  const near = (p: TilePt, horn: boolean): TilePt | null => {
    let best: TilePt | null = null;
    let bd = Infinity;
    for (let dy = -14; dy <= 14; dy++)
      for (let dx = -14; dx <= 14; dx++) {
        const x = Math.floor(p.tx) + dx + 0.5;
        const y = Math.floor(p.ty) + dy + 0.5;
        if (!world.isWater(x, y) || insideHorn(x, y) !== horn) continue;
        const d = Math.hypot(x - p.tx, y - p.ty);
        if (d < bd) {
          bd = d;
          best = { tx: x, ty: y };
        }
      }
    return best;
  };
  const last = pts[pts.length - 1];
  if (!world.isWater(last.tx, last.ty)) {
    const w = near(last, true);
    if (w) pts.push(w);
  }
  if (!world.isWater(pts[0].tx, pts[0].ty)) {
    const w = near(pts[0], false);
    if (w) pts.unshift(w);
  }
  route = makeRoute(pts);
  ROUTE_T = route.pts;
  ROUTE_LENGTH = route.total;
}

/** Point & heading (tile radians) at fraction f (0..1) along the overland route. Smoothly blended at corners. */
export function routeAt(f: number): { tx: number; ty: number; dir: number } {
  const p = routePoint(f);
  const a = routePoint(Math.max(0, f - 0.02));
  const b = routePoint(Math.min(1, f + 0.02));
  return { tx: p.tx, ty: p.ty, dir: Math.atan2(b.ty - a.ty, b.tx - a.tx) };
}

export function routePoint(f: number): TilePt {
  const { pts, lens, total } = route;
  let d = Math.max(0, Math.min(1, f)) * total;
  for (let i = 0; i < lens.length; i++) {
    if (d <= lens[i] || i === lens.length - 1) {
      const k = lens[i] ? Math.min(1, d / lens[i]) : 0;
      return {
        tx: pts[i].tx + (pts[i + 1].tx - pts[i].tx) * k,
        ty: pts[i].ty + (pts[i + 1].ty - pts[i].ty) * k,
      };
    }
    d -= lens[i];
  }
  return pts[pts.length - 1];
}

/** Fraction along the route of the authored ridge point (OVERLAND_ROUTE[2]). */
export function ridgeFraction(): number {
  const ridge = ROUTE_DATA[2];
  let best = 0.5;
  let bd = Infinity;
  for (let i = 0; i <= 200; i++) {
    const p = routePoint(i / 200);
    const d = Math.hypot(p.tx - ridge.tx, p.ty - ridge.ty);
    if (d < bd) {
      bd = d;
      best = i / 200;
    }
  }
  return best;
}

// ───────────────────────────── Navigation grid ─────────────────────────────

interface NavGrid {
  w: number;
  h: number;
  water: Uint8Array;
  /** Chessboard distance to the nearest land tile (capped). */
  shore: Uint8Array;
  chain: Uint8Array;
  bridge: Uint8Array;
}

const grids = new WeakMap<WorldApi, NavGrid>();

export function navGrid(world: WorldApi): NavGrid {
  let g = grids.get(world);
  if (g) return g;
  const w = world.width;
  const h = world.height;
  const water = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) water[y * w + x] = world.isWater(x, y) ? 1 : 0;
  // distance transform (two-pass chessboard), capped at 8
  const shore = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) shore[i] = water[i] ? 8 : 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!shore[i]) continue;
      let v = shore[i];
      if (x > 0) v = Math.min(v, shore[i - 1] + 1);
      if (y > 0) {
        v = Math.min(v, shore[i - w] + 1);
        if (x > 0) v = Math.min(v, shore[i - w - 1] + 1);
        if (x < w - 1) v = Math.min(v, shore[i - w + 1] + 1);
      }
      shore[i] = v;
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (!shore[i]) continue;
      let v = shore[i];
      if (x < w - 1) v = Math.min(v, shore[i + 1] + 1);
      if (y < h - 1) {
        v = Math.min(v, shore[i + w] + 1);
        if (x < w - 1) v = Math.min(v, shore[i + w + 1] + 1);
        if (x > 0) v = Math.min(v, shore[i + w - 1] + 1);
      }
      shore[i] = v;
    }
  // chain barrier: tiles near the (extended) chain segment
  const chain = new Uint8Array(w * h);
  const ext = 3;
  const a = { tx: CHAIN_T[0].tx - CHAIN_DIR.tx * ext, ty: CHAIN_T[0].ty - CHAIN_DIR.ty * ext };
  const len = CHAIN_LENGTH + ext * 2;
  for (let s = 0; s <= len; s += 0.2) {
    const px = a.tx + CHAIN_DIR.tx * s;
    const py = a.ty + CHAIN_DIR.ty * s;
    for (let oy = -1; oy <= 1; oy++)
      for (let ox = -1; ox <= 1; ox++) {
        const x = Math.floor(px) + ox;
        const y = Math.floor(py) + oy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        if (Math.hypot(x + 0.5 - px, y + 0.5 - py) <= 0.85) chain[y * w + x] = 1;
      }
  }
  const bridge = new Uint8Array(w * h);
  g = { w, h, water, shore, chain, bridge };
  grids.set(world, g);
  fitRouteToWorld(world);
  const be = bridgeEnds(world);
  if (be) {
    const L = Math.hypot(be.b.tx - be.a.tx, be.b.ty - be.a.ty);
    for (let s = 0; s <= L; s += 0.2) {
      const px = be.a.tx + ((be.b.tx - be.a.tx) * s) / L;
      const py = be.a.ty + ((be.b.ty - be.a.ty) * s) / L;
      const x = Math.floor(px);
      const y = Math.floor(py);
      for (const [ox, oy] of [[0, 0], [1, 0], [0, 1]])
        if (x + ox < w && y + oy < h) bridge[(y + oy) * w + x + ox] = 1;
    }
  }
  return g;
}

export interface NavOpts {
  /** Chain barrier active for this ship. */
  chain: boolean;
  /** Pontoon bridge blocks passage. */
  bridge?: boolean;
}

export function passable(world: WorldApi, tx: number, ty: number, o: NavOpts): boolean {
  const g = navGrid(world);
  const x = Math.floor(tx);
  const y = Math.floor(ty);
  if (x < 0 || y < 0 || x >= g.w || y >= g.h) return false;
  const i = y * g.w + x;
  if (!g.water[i]) return false;
  if (o.chain && g.chain[i]) return false;
  if (o.bridge && g.bridge[i]) return false;
  return true;
}

export function shoreDist(world: WorldApi, tx: number, ty: number): number {
  const g = navGrid(world);
  const x = Math.floor(tx);
  const y = Math.floor(ty);
  if (x < 0 || y < 0 || x >= g.w || y >= g.h) return 8;
  return g.shore[y * g.w + x];
}

/** Straight segment stays on passable water (sampled). */
export function segmentClear(world: WorldApi, a: TilePt, b: TilePt, o: NavOpts, minShore = 0): boolean {
  const L = Math.hypot(b.tx - a.tx, b.ty - a.ty);
  const n = Math.max(1, Math.ceil(L / 0.35));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const x = a.tx + (b.tx - a.tx) * t;
    const y = a.ty + (b.ty - a.ty) * t;
    if (!passable(world, x, y, o)) return false;
    if (minShore > 0 && i < n && shoreDist(world, x, y) < minShore) return false;
  }
  return true;
}

/** Nearest passable water tile (center) to p within radius. */
export function nearestWater(world: WorldApi, p: TilePt, o: NavOpts, radius = 10, minShore = 0): TilePt | null {
  const cx = Math.floor(p.tx);
  const cy = Math.floor(p.ty);
  let best: TilePt | null = null;
  let bd = Infinity;
  for (let r = 0; r <= radius; r++) {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (!passable(world, x + 0.5, y + 0.5, o)) continue;
        if (minShore > 0 && shoreDist(world, x, y) < minShore) continue;
        const d = Math.hypot(x + 0.5 - p.tx, y + 0.5 - p.ty);
        if (d < bd) {
          bd = d;
          best = { tx: x + 0.5, ty: y + 0.5 };
        }
      }
    if (best && r >= 1) return best;
  }
  return best;
}

/**
 * Where the Sultan watches the 20 Nisan battle: the nearest beach on the Pera /
 * Tophane shore (north of the Horn mouth, outside the city walls), plus the
 * shallow water in front of it he rides into.
 */
export function sultanBeach(world: WorldApi, battle: TilePt): { tx: number; ty: number; wx: number; wy: number } | null {
  const northOf = Math.min(CHAIN_T[0].ty, CHAIN_T[1].ty) + 1;
  const g = navGrid(world);
  let best: TilePt | null = null;
  let bd = Infinity;
  const cx = Math.floor(battle.tx);
  const cy = Math.floor(battle.ty);
  for (let dy = -24; dy <= 6; dy++)
    for (let dx = -18; dx <= 18; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= g.w || y >= g.h) continue;
      if (g.water[y * g.w + x] || y + 0.5 > northOf) continue;
      if (chainSide(x + 0.5, y + 0.5) < 0) continue;
      const reg = world.regionAt(x, y);
      if (reg === 'sur-ici' || reg === 'galata') continue;
      // must be a beach: water next to it
      if (!(g.water[y * g.w + x + 1] || g.water[(y + 1) * g.w + x] || g.water[y * g.w + x - 1] || g.water[(y - 1) * g.w + x])) continue;
      const d = Math.hypot(x + 0.5 - battle.tx, y + 0.5 - battle.ty);
      if (d < bd) {
        bd = d;
        best = { tx: x + 0.5, ty: y + 0.5 };
      }
    }
  if (!best) return null;
  const w = nearestWater(world, best, { chain: false }, 3);
  return { tx: best.tx, ty: best.ty, wx: w?.tx ?? best.tx, wy: w?.ty ?? best.ty };
}

/** Nearest land tile center to p, optionally filtered. */
export function nearestLand(world: WorldApi, p: TilePt, radius = 14, accept: (x: number, y: number) => boolean = () => true): TilePt | null {
  const g = navGrid(world);
  const cx = Math.floor(p.tx);
  const cy = Math.floor(p.ty);
  let best: TilePt | null = null;
  let bd = Infinity;
  for (let dy = -radius; dy <= radius; dy++)
    for (let dx = -radius; dx <= radius; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= g.w || y >= g.h) continue;
      if (g.water[y * g.w + x] || !accept(x, y)) continue;
      const d = Math.hypot(x + 0.5 - p.tx, y + 0.5 - p.ty);
      if (d < bd) {
        bd = d;
        best = { tx: x + 0.5, ty: y + 0.5 };
      }
    }
  return best;
}

/**
 * Sea path (tile centers), smoothed by string-pulling. Prefers open water
 * (shore tiles cost more). Returns null when unreachable (e.g. blocked by the chain).
 */
export function navPath(world: WorldApi, from: TilePt, to: TilePt, o: NavOpts): TilePt[] | null {
  const g = navGrid(world);
  const goal = passable(world, to.tx, to.ty, o) ? to : nearestWater(world, to, o, 8);
  if (!goal) return null;
  const start = passable(world, from.tx, from.ty, o) ? from : nearestWater(world, from, o, 4);
  if (!start) return null;
  if (segmentClear(world, start, goal, o, 1)) return [{ tx: goal.tx, ty: goal.ty }];
  const cost = (x: number, y: number): number => {
    const i = y * g.w + x;
    if (!g.water[i]) return Infinity;
    if (o.chain && g.chain[i]) return Infinity;
    if (o.bridge && g.bridge[i]) return Infinity;
    const s = g.shore[i];
    return s <= 1 ? 3 : s === 2 ? 1.6 : 1;
  };
  const raw = astar(
    g.w,
    g.h,
    { tx: Math.floor(start.tx), ty: Math.floor(start.ty) },
    { tx: Math.floor(goal.tx), ty: Math.floor(goal.ty) },
    cost,
  );
  if (!raw) return null;
  const pts: TilePt[] = raw.map((p) => ({ tx: p.tx + 0.5, ty: p.ty + 0.5 }));
  pts[pts.length - 1] = { tx: goal.tx, ty: goal.ty };
  // string pulling
  const out: TilePt[] = [];
  let cur: TilePt = start;
  let i = 0;
  while (i < pts.length) {
    let j = pts.length - 1;
    while (j > i && !segmentClear(world, cur, pts[j], o, 1)) j--;
    out.push(pts[j]);
    cur = pts[j];
    i = j + 1;
  }
  return out;
}

/**
 * Anchorage slots: open-water points near `seed`, at least `spacing` tiles apart,
 * filtered by `accept`. Breadth-first from the nearest water so slots hug the seed.
 */
export function anchorSlots(
  world: WorldApi,
  seed: TilePt,
  count: number,
  spacing: number,
  o: NavOpts,
  accept: (p: TilePt) => boolean = () => true,
  minShore = 2,
): TilePt[] {
  const g = navGrid(world);
  const start = nearestWater(world, seed, o, 16, minShore) ?? nearestWater(world, seed, o, 16);
  if (!start) return [];
  const seen = new Uint8Array(g.w * g.h);
  const q: number[] = [Math.floor(start.ty) * g.w + Math.floor(start.tx)];
  seen[q[0]] = 1;
  const out: TilePt[] = [];
  let head = 0;
  while (head < q.length && out.length < count) {
    const i = q[head++];
    const x = i % g.w;
    const y = (i / g.w) | 0;
    const p = { tx: x + 0.5, ty: y + 0.5 };
    if (g.shore[i] >= minShore && accept(p) && passable(world, p.tx, p.ty, o)) {
      if (out.every((s) => Math.hypot(s.tx - p.tx, s.ty - p.ty) >= spacing)) out.push(p);
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) continue;
      const ni = ny * g.w + nx;
      if (seen[ni] || !g.water[ni] || (o.chain && g.chain[ni])) continue;
      seen[ni] = 1;
      q.push(ni);
    }
    if (q.length > 40000) break;
  }
  return out;
}

// ───────────────────────────── Pontoon bridge ─────────────────────────────

const bridgeCache = new WeakMap<WorldApi, { a: TilePt; b: TilePt } | null>();

/**
 * Bridge endpoints (land tiles on both shores) across the upper Golden Horn,
 * starting from the Ayvansaray shore along BRIDGE_DIR.
 */
export function bridgeEnds(world: WorldApi): { a: TilePt; b: TilePt } | null {
  if (bridgeCache.has(world)) return bridgeCache.get(world)!;
  const ay = landmarkTile('ayvansaray');
  const dx = BRIDGE_DIR.tx;
  const dy = BRIDGE_DIR.ty;
  let result: { a: TilePt; b: TilePt } | null = null;
  let bestLen = Infinity;
  // try lines through points near Ayvansaray; keep the shortest full shore-to-shore crossing
  for (let k = -5; k <= 5; k++) {
    const ox = ay.tx - dy * k * 0.7;
    const oy = ay.ty + dx * k * 0.7;
    // a water point on this line
    let q: number | null = null;
    for (let s = -6; s <= 14; s += 0.25)
      if (world.isWater(ox + dx * s, oy + dy * s)) {
        q = s;
        break;
      }
    if (q == null) continue;
    let s0 = q;
    while (s0 > q - 25 && world.isWater(ox + dx * s0, oy + dy * s0)) s0 -= 0.25;
    let s1 = q;
    while (s1 < q + 25 && world.isWater(ox + dx * s1, oy + dy * s1)) s1 += 0.25;
    if (world.isWater(ox + dx * s0, oy + dy * s0) || world.isWater(ox + dx * s1, oy + dy * s1)) continue;
    const len = s1 - s0;
    if (len < 2.5 || len > 18) continue;
    if (len < bestLen) {
      bestLen = len;
      result = {
        a: { tx: ox + dx * (s0 - 0.3), ty: oy + dy * (s0 - 0.3) },
        b: { tx: ox + dx * (s1 + 0.3), ty: oy + dy * (s1 + 0.3) },
      };
    }
  }
  bridgeCache.set(world, result);
  return result;
}

export function angleOf(dx: number, dy: number): number {
  return Math.atan2(dy, dx);
}

/** Shortest signed angle difference b − a in (−π, π]. */
export function angDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** 8-way heading index (0 = +tx/east, counter-clockwise in tile space by π/4 steps). */
export function headingIndex(h: number): number {
  return ((Math.round(h / (Math.PI / 4)) % 8) + 8) % 8;
}
