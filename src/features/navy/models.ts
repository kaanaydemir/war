import { P } from '../../art/palette';
import type { ShipType } from '../../core/state';
import { VoxBuilder, type Line3, type Mat, type Voxel } from './vox';

/**
 * Voxel models of the navy (pure data builders; no Phaser).
 * Local space: +x bow, +y starboard, +z up, z = 0 waterline. 1 voxel ≈ 1 px.
 */

// ───────────────────────────── materials ─────────────────────────────

export const MATS: Mat[] = [];
function mat(m: Mat): number {
  MATS.push(m);
  return MATS.length - 1;
}

export const M = {
  hull: mat({ ramp: P.wood, lo: 0, hi: 4 }),
  hullTar: mat({ ramp: P.wood, lo: 0, hi: 3 }),
  /** Tallow-coated bottom below the waterline (şap / don yağı). */
  bottom: mat({ ramp: P.sand, lo: 1, hi: 4 }),
  wale: mat({ ramp: P.wood, lo: 2, hi: 6 }),
  deck: mat({ ramp: P.wood, lo: 2, hi: 4 }),
  plank: mat({ ramp: P.wood, lo: 3, hi: 6 }),
  railPlank: mat({ ramp: P.wood, lo: 1, hi: 4 }),
  red: mat({ ramp: P.red, lo: 2, hi: 6 }),
  green: mat({ ramp: P.green, lo: 1, hi: 5 }),
  gold: mat({ ramp: P.gold, lo: 2, hi: 6 }),
  white: mat({ ramp: P.cloth, lo: 2, hi: 5 }),
  sail: mat({ ramp: P.cloth, lo: 2, hi: 5, noRim: true, dither: 0 }),
  sailSeam: mat({ ramp: P.cloth, lo: 1, hi: 4, noRim: true, dither: 0 }),
  sailCream: mat({ ramp: P.sand, lo: 2, hi: 5, noRim: true, dither: 0 }),
  sailCreamSeam: mat({ ramp: P.sand, lo: 1, hi: 4, noRim: true, dither: 0 }),
  sailRed: mat({ ramp: P.red, lo: 2, hi: 5, noRim: true, dither: 0 }),
  rope: mat({ ramp: P.wood, lo: 0, hi: 2, noOutline: true }),
  ropeLight: mat({ ramp: P.wood, lo: 2, hi: 4, noOutline: true }),
  oar: mat({ ramp: P.wood, lo: 1, hi: 5, noOutline: true }),
  spar: mat({ ramp: P.wood, lo: 1, hi: 5 }),
  iron: mat({ ramp: P.steel, lo: 0, hi: 4 }),
  steel: mat({ ramp: P.steel, lo: 2, hi: 6 }),
  bronze: mat({ ramp: P.bronze, lo: 2, hi: 6 }),
  skin: mat({ ramp: P.skin, lo: 2, hi: 5, noRim: true }),
  turban: mat({ ramp: P.turban, lo: 0, hi: 3 }),
  crewRed: mat({ ramp: P.red, lo: 2, hi: 5, noRim: true }),
  crewBlue: mat({ ramp: P.blue, lo: 1, hi: 4, noRim: true }),
  crewGreen: mat({ ramp: P.green, lo: 1, hi: 4, noRim: true }),
  crewBrown: mat({ ramp: P.dirt, lo: 2, hi: 5, noRim: true }),
  lantern: mat({ ramp: P.fire, lo: 6, hi: 6, emissive: true }),
  purple: mat({ ramp: P.purple, lo: 1, hi: 5 }),
  stone: mat({ ramp: P.stone, lo: 2, hi: 7 }),
  sack: mat({ ramp: P.sand, lo: 1, hi: 4 }),
  ox: mat({ ramp: P.cloth, lo: 1, hi: 5 }),
  oxDark: mat({ ramp: P.dirt, lo: 1, hi: 5 }),
  oxRed: mat({ ramp: P.wood, lo: 1, hi: 5 }),
  horn: mat({ ramp: P.sand, lo: 2, hi: 5 }),
  hoof: mat({ ramp: P.outline, lo: 0, hi: 2 }),
  grease: mat({ ramp: P.wood, lo: 1, hi: 6 }),
  barrel: mat({ ramp: P.wood, lo: 2, hi: 6 }),
};

export type V3 = [number, number, number];

/** sail: under sail (and oars) · row: oars only, sail furled · anchor · sink · land: on the slipway cradle. */
export type Pose = 'sail' | 'row' | 'anchor' | 'sink' | 'land';

// ───────────────────────────── ship specs ─────────────────────────────

export type Faction = 'osmanli' | 'venedik' | 'ceneviz' | 'bizans';

interface GalleySpec {
  kind: 'galley';
  L: number;
  B: number;
  H: number;
  oars: number;
  oarLen: number;
  mastH: number;
  masts: number; // 1 or 2
  canopy: 'buyuk' | 'kucuk' | 'yok';
  lanterns: number;
  faction: Faction;
  tar: boolean;
  cargo?: boolean;
  crew: number;
}

interface RoundSpec {
  kind: 'round';
  L: number;
  B: number;
  H: number;
  mainH: number;
  fore: boolean;
  faction: Faction;
  castle: number; // aftcastle height
  crew: number;
}

export type ShipSpec = GalleySpec | RoundSpec;

export const SPECS: Record<ShipType, ShipSpec> = {
  kadirga: { kind: 'galley', L: 42, B: 7, H: 3, oars: 12, oarLen: 9, mastH: 24, masts: 1, canopy: 'buyuk', lanterns: 1, faction: 'osmanli', tar: false, crew: 9 },
  kalyete: { kind: 'galley', L: 34, B: 6, H: 3, oars: 10, oarLen: 8, mastH: 20, masts: 1, canopy: 'kucuk', lanterns: 1, faction: 'osmanli', tar: false, crew: 6 },
  fusta: { kind: 'galley', L: 27, B: 5, H: 2, oars: 8, oarLen: 7, mastH: 16, masts: 1, canopy: 'yok', lanterns: 0, faction: 'osmanli', tar: false, crew: 5 },
  parandarya: { kind: 'galley', L: 28, B: 9, H: 4, oars: 6, oarLen: 7, mastH: 18, masts: 1, canopy: 'kucuk', lanterns: 0, faction: 'osmanli', tar: false, cargo: true, crew: 4 },
  'venedik-kadirgasi': { kind: 'galley', L: 46, B: 8, H: 4, oars: 13, oarLen: 9, mastH: 25, masts: 2, canopy: 'buyuk', lanterns: 1, faction: 'venedik', tar: true, crew: 10 },
  'ceneviz-gemisi': { kind: 'round', L: 30, B: 11, H: 7, mainH: 32, fore: true, faction: 'ceneviz', castle: 6, crew: 10 },
  'bizans-gemisi': { kind: 'round', L: 27, B: 10, H: 6, mainH: 28, fore: false, faction: 'bizans', castle: 4, crew: 8 },
};

/** Galleys get the 'karada' (on the slipway cradle) frames. */
export function hasLandFrames(t: ShipType): boolean {
  return t === 'fusta' || t === 'kalyete';
}

// ───────────────────────────── helpers ─────────────────────────────

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Thin voxel line between two points (part of the occupancy grid). */
function voxLine(b: VoxBuilder, a: V3, c: V3, m: number): void {
  const n = Math.ceil(Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]) * 1.5);
  for (let i = 0; i <= n; i++) {
    const t = i / Math.max(1, n);
    b.set(a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, a[2] + (c[2] - a[2]) * t, m);
  }
}

/** A small standing figure: body + head (turban/helmet/cap). */
function figure(b: VoxBuilder, x: number, y: number, z: number, body: number, head: number, tall = 2): void {
  for (let k = 0; k < tall; k++) b.surf(x, y, z + k, body, 0.3, 0.5, 0.8);
  b.surf(x, y, z + tall, head, 0.2, 0.3, 1);
}

// ───────────────────────────── galley ─────────────────────────────

interface Dyn {
  vox: Voxel[];
  lines: Line3[];
}

export interface ShipModel {
  type: ShipType;
  spec: ShipSpec;
  /** Static hull/deck/structures. */
  hull: Voxel[];
  hullLines: Line3[];
  /** Cradle under the keel (land frames). */
  cradle: Voxel[];
  /** Mast head & lantern points (local) for runtime FX. */
  lanterns: V3[];
  deckZ: number;
  /** Dynamic parts per pose. */
  dyn(pose: Pose, frame: number, flagship: boolean): Dyn;
}

function galleyHalfBeam(s: GalleySpec, x: number): number {
  const u = x / (s.L / 2);
  if (u >= 1 || u <= -1) return 0;
  const e = u > 0 ? Math.pow(1 - Math.pow(u, 2.2), 0.62) : Math.pow(1 - Math.pow(-u, 3.4), 0.5);
  return (s.B / 2) * e;
}

function galleyDeck(s: GalleySpec, x: number): number {
  const u = x / (s.L / 2);
  return s.H + (u > 0 ? 1.4 * u * u * u * u : 2.6 * u * u * u * u);
}

const FACTION_COLORS: Record<Faction, { trim: number; trim2: number; canopy: number; canopy2: number; sail: number; seam: number; crew: number[]; head: number }> = {
  osmanli: { trim: M.red, trim2: M.gold, canopy: M.red, canopy2: M.green, sail: M.sail, seam: M.sailSeam, crew: [M.crewRed, M.crewBlue, M.crewGreen, M.crewRed], head: M.turban },
  venedik: { trim: M.red, trim2: M.gold, canopy: M.red, canopy2: M.gold, sail: M.sailCream, seam: M.sailCreamSeam, crew: [M.crewBrown, M.crewBlue, M.crewRed], head: M.steel },
  ceneviz: { trim: M.red, trim2: M.white, canopy: M.red, canopy2: M.white, sail: M.sail, seam: M.sailSeam, crew: [M.crewBrown, M.crewRed, M.crewBlue], head: M.steel },
  bizans: { trim: M.purple, trim2: M.gold, canopy: M.purple, canopy2: M.gold, sail: M.sailCream, seam: M.sailCreamSeam, crew: [M.crewBrown, M.purple, M.crewBlue], head: M.steel },
};

function buildGalley(type: ShipType, s: GalleySpec): ShipModel {
  const b = new VoxBuilder();
  const fc = FACTION_COLORS[s.faction];
  const half = s.L / 2;
  const hullM = s.tar ? M.hullTar : M.hull;
  for (let x = Math.ceil(-half); x <= Math.floor(half); x++) {
    const w = galleyHalfBeam(s, x);
    if (w < 0.4) continue;
    const hd = Math.round(galleyDeck(s, x));
    for (let z = -3; z <= hd; z++) {
      const wz = z < 0 ? w * (1 + z / 4.2) : w;
      if (wz < 0.4) continue;
      const wy = Math.round(wz);
      for (let y = -wy; y <= wy; y++) {
        let m = z < 0 ? M.bottom : hullM;
        if (z === hd) m = Math.abs(y) >= wy ? fc.trim : M.deck;
        else if (z === hd - 1 && Math.abs(y) >= wy) m = fc.trim2 === M.gold && x % 4 === 0 ? M.gold : fc.trim;
        else if (z === 1 && Math.abs(y) >= wy) m = M.wale;
        b.set(x, y, z, m);
      }
    }
    // low bulwark rail
    if (x > -half + 3 && x < half - 3) {
      b.set(x, Math.round(w), hd + 1, M.plank);
      b.set(x, -Math.round(w), hd + 1, M.plank);
    }
  }
  const deckZ = s.H;
  // rowing frame (apostis) with outriggers
  const ox0 = -half * 0.62;
  const ox1 = half * 0.58;
  const oy = Math.round(s.B / 2 + 1.5);
  for (let x = Math.round(ox0); x <= Math.round(ox1); x++) {
    b.set(x, oy, deckZ + 1, M.wale);
    b.set(x, -oy, deckZ + 1, M.wale);
    if ((x - Math.round(ox0)) % 5 === 0) for (let y = -oy; y <= oy; y++) b.set(x, y, deckZ + 1, M.wale);
  }
  // central gangway (corsia)
  for (let x = Math.round(ox0); x <= Math.round(ox1); x++) b.set(x, 0, deckZ + 1, M.plank);
  // bow: rembata platform + ram (mahmuz)
  const bowDeck = Math.round(galleyDeck(s, half - 3));
  b.box(half - 8, half - 3, -1, 1, bowDeck + 1, bowDeck + 1, M.plank);
  for (let k = 0; k < 6; k++) b.set(half - 1 + k, 0, s.H - 1 + Math.floor(k / 3), k > 3 ? M.gold : M.hull);
  // bow chaser (small bronze gun)
  if (s.faction === 'osmanli' || s.faction === 'venedik') voxLine(b, [half - 7, 0, bowDeck + 2], [half - 2, 0, bowDeck + 2], M.bronze);
  // stern: raised poop + canopy (tente)
  const sternX0 = -half + 1;
  const sternX1 = -half + (s.canopy === 'buyuk' ? 8 : 6);
  const sd = Math.round(galleyDeck(s, -half + 3));
  if (s.canopy !== 'yok') {
    b.box(sternX0 + 1, sternX1, -Math.round(galleyHalfBeam(s, sternX1)) + 1, Math.round(galleyHalfBeam(s, sternX1)) - 1, sd + 1, sd + 1, M.deck);
    const ch = s.canopy === 'buyuk' ? 5 : 4;
    const cw = Math.max(1, Math.round(galleyHalfBeam(s, sternX1)) - 1);
    for (const px of [sternX0 + 1, sternX1]) for (const py of [-cw, cw]) for (let z = sd + 2; z < sd + ch; z++) b.set(px, py, z, M.gold);
    // arched awning
    for (let x = sternX0; x <= sternX1 + 1; x++)
      for (let y = -cw - 1; y <= cw + 1; y++) {
        const arch = Math.round(1.6 * Math.cos((y / (cw + 1.5)) * (Math.PI / 2)));
        const stripe = (x + 40) % 3 === 0 ? fc.canopy2 : fc.canopy;
        b.set(x, y, sd + ch + arch, stripe);
      }
  } else {
    b.box(sternX0 + 1, sternX1, -1, 1, sd + 1, sd + 1, M.deck);
  }
  // decorated sternpost
  for (let z = sd; z <= sd + 3; z++) b.set(-half, 0, z, z === sd + 3 ? M.gold : fc.trim);
  // cargo (parandarya): timber, stone blocks, sacks, barrels
  if (s.cargo) {
    b.box(-6, -1, -2, 2, deckZ + 1, deckZ + 2, M.stone);
    b.box(1, 7, -3, -1, deckZ + 1, deckZ + 2, M.plank);
    b.box(1, 7, 1, 3, deckZ + 1, deckZ + 1, M.plank);
    b.box(-9, -8, -2, 2, deckZ + 1, deckZ + 2, M.sack);
    b.box(3, 4, 1, 2, deckZ + 2, deckZ + 3, M.barrel);
  }
  const hull = b.build();
  // lantern points
  const lanterns: V3[] = [];
  if (s.lanterns > 0) lanterns.push([-half - 1, 0, sd + (s.canopy === 'buyuk' ? 9 : 7)]);
  const mastX = Math.round(s.L * 0.1);
  const mast2X = Math.round(-s.L * 0.18);
  const hullLines: Line3[] = [];
  // lantern poles
  for (const l of lanterns) hullLines.push({ a: [l[0] + 0.5, 0, sd + 1], b: [l[0], 0, l[2] - 1], m: M.spar, shade: 0.3 });
  // cradle
  const cb = new VoxBuilder();
  const cx0 = Math.round(-half * 0.55);
  const cx1 = Math.round(half * 0.5);
  for (let x = cx0; x <= cx1; x++) {
    cb.set(x, -2, -5, M.hull);
    cb.set(x, 2, -5, M.hull);
    if ((x - cx0) % 4 === 0) {
      for (let y = -3; y <= 3; y++) cb.set(x, y, -4, M.wale);
      cb.set(x, -2, -3, M.wale);
      cb.set(x, 2, -3, M.wale);
    }
  }
  const cradle = cb.build();

  const dyn = (pose: Pose, frame: number, flagship: boolean): Dyn => {
    const d = new VoxBuilder();
    const lines: Line3[] = [];
    const phase = (frame / 4) * Math.PI * 2;
    const masts = s.masts === 2 ? [mastX, mast2X] : [mastX];
    masts.forEach((mx, mi) => {
      const mh = Math.round(s.mastH * (mi === 0 ? 1 : 0.72));
      const top = deckZ + mh;
      for (let z = deckZ + 1; z <= top; z++) d.set(mx, 0, z, M.spar);
      d.set(mx, 0, top + 1, M.gold);
      // shrouds
      lines.push({ a: [mx, 0, top - 1], b: [mx - 2, oy - 0.5, deckZ + 1], m: M.rope, shade: 0.2 });
      lines.push({ a: [mx, 0, top - 1], b: [mx - 2, -oy + 0.5, deckZ + 1], m: M.rope, shade: 0.2 });
      // lateen yard (antenna): low at the bow, high astern
      const yl = s.L * (mi === 0 ? 0.92 : 0.66);
      const fwd = yl * 0.48;
      const aft = yl * 0.52;
      const tilt = pose === 'sink' ? 0.5 : 0;
      // rowing into battle: the yard is lowered along the deck
      const lowered = pose === 'row';
      const A: V3 = lowered ? [mx + fwd * 0.8, 1.6, deckZ + 3] : [mx + fwd, 0.6, deckZ + Math.round(mh * 0.28) - tilt * 3];
      const B: V3 = lowered ? [mx - aft * 0.85, 1.6, deckZ + 6] : [mx - aft, 0.6, top + Math.round(mh * 0.12)];
      voxLine(d, A, B, M.spar);
      if (pose === 'sail' || pose === 'land') {
        const C: V3 = [mx - aft * 0.55, 0.6, deckZ + 2];
        const billow = 2.6 + 0.5 * Math.sin(phase);
        const lenAB = Math.hypot(B[0] - A[0], B[2] - A[2]);
        const lenAC = Math.hypot(C[0] - A[0], C[2] - A[2]);
        const nu = Math.ceil(lenAB * 1.6);
        const nv = Math.ceil(lenAC * 1.6);
        const stripes = flagship && s.faction === 'osmanli';
        for (let iu = 0; iu <= nu; iu++)
          for (let iv = 0; iv <= nv; iv++) {
            const u = iu / nu;
            const v = iv / nv;
            if (u + v > 1.0001) continue;
            const w = 1 - u - v;
            const bub = 6.75 * u * v * w * 4; // 0 at edges, ~1 inside
            const flutter = Math.sin(phase * 2 + u * 9) * 0.35 * u * (1 - w);
            const yoff = 0.6 + billow * bub + flutter;
            const x = A[0] + (B[0] - A[0]) * u + (C[0] - A[0]) * v;
            const z = A[2] + (B[2] - A[2]) * u + (C[2] - A[2]) * v;
            // seams run along the leech
            const seam = Math.floor(u * lenAB) % 4 === 0;
            let m = seam ? fc.seam : fc.sail;
            if (stripes && Math.floor((u * lenAB) / 5) % 2 === 1) m = M.sailRed;
            // normal: plane normal (±y) tilted by the bulge slope
            d.surf(x, yoff, z, m, (u - 0.4) * 0.6, 1, (0.5 - v) * 0.5);
          }
        // sheet line to the clew
        lines.push({ a: C, b: [C[0] - 3, 2, deckZ + 1], m: M.rope, shade: 0.25 });
      } else {
        // furled along the yard
        const n = 30;
        for (let i = 2; i <= n - 2; i++) {
          const t = i / n;
          const x = A[0] + (B[0] - A[0]) * t;
          const z = A[2] + (B[2] - A[2]) * t;
          const r = 1 + Math.sin(t * Math.PI) * 0.6;
          d.surf(x, 0.6 + r, z - 1, fc.sail, 0, 1, 0.3);
          d.surf(x, 0.6, z - 1, fc.sail, 0, 0.3, 1);
          d.surf(x, 0.6 - 0.5, z - 1.5, fc.seam, 0, 1, -0.2);
        }
      }
      // masthead pennant (flama) streaming aft
      if (pose !== 'sink') {
        const pl = mi === 0 ? 10 : 6;
        for (let i = 0; i < pl; i++) {
          const h = Math.max(1, Math.round(2.4 * (1 - i / pl)));
          const wave = Math.sin(phase + i * 0.7) * 0.9 * (i / pl);
          for (let k = 0; k < h; k++) {
            const m = s.faction === 'osmanli' ? (k === 0 && i < 3 ? M.green : M.red) : s.faction === 'venedik' ? (i < 3 ? M.gold : M.red) : M.white;
            const px = lowered ? mx - 1 - i : B[0] - i;
            const pz = lowered ? top + 1 - k : B[2] + 1 + k;
            d.surf(px, 0.6 + wave, pz, m, 0, 1, 0.1);
          }
        }
      }
    });
    // stern banners
    if (pose !== 'sink') {
      const flagPoles: [number, number][] = flagship ? [[-half + 1, -2], [-half + 1, 2], [-half + 2, 0]] : [[-half + 1, 0]];
      flagPoles.forEach(([fx, fy], i) => {
        const base = Math.round(galleyDeck(s, fx)) + 1;
        const ph = s.canopy === 'buyuk' ? 9 : 6;
        lines.push({ a: [fx, fy, base], b: [fx, fy, base + ph], m: M.spar, shade: 0.35 });
        const colors =
          s.faction === 'osmanli'
            ? [i === 1 ? M.green : M.red, i === 2 ? M.white : M.red]
            : s.faction === 'venedik'
              ? [M.red, M.gold]
              : [M.white, M.red];
        for (let a = 0; a < 6; a++)
          for (let k = 0; k < 4; k++) {
            const wave = Math.sin(phase + a * 0.9 + i) * 0.7 * (a / 6);
            let m = colors[0];
            if (s.faction === 'venedik' && a >= 2 && a <= 3 && k >= 1 && k <= 2) m = M.gold; // lion of St Mark (gold on red)
            if (s.faction === 'osmanli' && i === 2 && k === 2 && a >= 2 && a <= 3) m = M.red;
            d.surf(fx - 1 - a, fy + wave, base + ph - k, m, 0.1, 1, 0.1);
          }
      });
    }
    // crew on the gangway, bow and stern
    if (pose !== 'sink') {
      for (let i = 0; i < s.crew; i++) {
        const t = (i + 0.5) / s.crew;
        const jitter = ((frame + i) % 4 < 2 ? 0 : 1) * (i % 2 ? 1 : -1);
        const x = Math.round(ox0 + (ox1 - ox0) * t) + (pose === 'sail' || pose === 'row' ? jitter : 0);
        const y = i % 3 === 0 ? 1 : i % 3 === 1 ? -1 : 0;
        const body = fc.crew[i % fc.crew.length];
        figure(d, x, y, deckZ + 2, body, s.faction === 'osmanli' && i % 3 === 2 ? M.crewRed : fc.head);
      }
      // the bey under the awning
      if (s.canopy === 'buyuk') figure(d, -half + 5, 0, sd + 2, flagship ? M.green : M.crewRed, M.turban);
      // bow soldiers
      figure(d, half - 5, 1, bowDeck + 2, fc.crew[0], fc.head);
      figure(d, half - 6, -1, bowDeck + 2, fc.crew[1 % fc.crew.length], fc.head);
    }
    // oars
    const span = ox1 - ox0;
    for (let i = 0; i < s.oars; i++) {
      const x = ox0 + 1 + (span - 2) * (i / Math.max(1, s.oars - 1));
      for (const side of [1, -1]) {
        const p: V3 = [x, side * oy, deckZ + 1];
        let tip: V3;
        if (pose === 'land') continue;
        if (pose === 'sail' || pose === 'row') {
          const f = frame % 4;
          const sweep = [2.6, 0, -2.6, 0][f];
          const tz = [-0.3, -0.6, 0.2, 1.8][f];
          tip = [x + sweep, side * (oy + s.oarLen), tz];
        } else if (pose === 'anchor') {
          tip = [x - 0.6, side * (oy + s.oarLen * 0.8), 0.6 + (i % 2) * 0.2]; // resting on the water
        } else {
          tip = [x + (i % 3) - 1, side * (oy + s.oarLen * 0.7), deckZ - 2 + (i % 2)];
        }
        lines.push({ a: p, b: tip, m: M.oar, shade: 0.4 });
        // blade
        const bx = tip[0] - p[0];
        const by = tip[1] - p[1];
        const bz = tip[2] - p[2];
        const bl = Math.hypot(bx, by, bz) || 1;
        if (pose === 'sail' || pose === 'row') lines.push({ a: [tip[0] - (bx / bl) * 1.2, tip[1] - (by / bl) * 1.2, tip[2] - (bz / bl) * 1.2], b: [tip[0], tip[1], tip[2]], m: M.oar, shade: 0.9 });
      }
    }
    // lanterns (emissive)
    for (const l of lanterns) {
      d.surf(l[0], l[1], l[2], M.lantern, 0, 0, 1);
      d.surf(l[0], l[1], l[2] + 1, M.gold, 0, 0, 1);
      if (flagship) {
        d.surf(l[0] + 1, l[1] - 2, l[2] - 1, M.lantern, 0, 0, 1);
        d.surf(l[0] + 1, l[1] + 2, l[2] - 1, M.lantern, 0, 0, 1);
      }
    }
    return { vox: d.build(), lines };
  };
  return { type, spec: s, hull, hullLines, cradle, lanterns, deckZ, dyn };
}

// ───────────────────────────── round ship (carrack) ─────────────────────────────

function roundHalfBeam(s: RoundSpec, x: number, z: number): number {
  const u = x / (s.L / 2);
  if (u >= 1.02 || u <= -1) return 0;
  let e: number;
  if (u > 0) e = Math.pow(Math.max(0, 1 - Math.pow(u, 2.1)), 0.55);
  else e = u < -0.88 ? 0.62 : Math.pow(Math.max(0, 1 - Math.pow(-u, 4)), 0.45);
  let w = (s.B / 2) * e;
  if (z < 0) w *= 1 + z / 5.5;
  if (z > s.H - 3) w -= (z - (s.H - 3)) * 0.28; // tumblehome
  return w;
}

function buildRound(type: ShipType, s: RoundSpec): ShipModel {
  const b = new VoxBuilder();
  const fc = FACTION_COLORS[s.faction];
  const half = s.L / 2;
  const sheer = (x: number) => {
    const u = x / half;
    return s.H + (u > 0 ? 1.5 * u * u : 1.2 * u * u);
  };
  for (let x = Math.ceil(-half); x <= Math.floor(half); x++) {
    const hd = Math.round(sheer(x));
    for (let z = -4; z <= hd; z++) {
      const w = roundHalfBeam(s, x, z);
      if (w < 0.4) continue;
      const wy = Math.round(w);
      for (let y = -wy; y <= wy; y++) {
        let m = z < 0 ? M.bottom : M.hullTar;
        if (z === hd) m = Math.abs(y) >= wy ? M.wale : M.deck;
        else if (Math.abs(y) >= wy - 0.5 && (z === 2 || z === 4 || z === hd - 1)) m = M.wale;
        else if (Math.abs(y) >= wy - 0.5 && z === hd - 2 && s.faction === 'ceneviz') m = (x + 20) % 4 < 2 ? M.red : M.white;
        else if (Math.abs(y) >= wy - 0.5 && z === hd - 2 && s.faction === 'bizans') m = M.purple;
        b.set(x, y, z, m);
      }
    }
    // bulwark
    const wtop = Math.round(roundHalfBeam(s, x, sheer(x)));
    if (wtop > 0) {
      b.set(x, wtop, Math.round(sheer(x)) + 1, M.wale);
      b.set(x, -wtop, Math.round(sheer(x)) + 1, M.wale);
    }
  }
  // aftcastle (two tiers)
  const ac0 = Math.round(-half);
  const ac1 = Math.round(-half + 9);
  const deckAt = (x: number) => Math.round(sheer(x));
  for (let x = ac0; x <= ac1; x++) {
    const w = Math.max(1, Math.round(roundHalfBeam(s, x, s.H)) - 0);
    const z0 = deckAt(x) + 1;
    const z1 = z0 + s.castle - 1;
    for (let z = z0; z <= z1; z++)
      for (let y = -w; y <= w; y++) {
        const edge = Math.abs(y) === w || x === ac0 || x === ac1;
        if (!edge && z < z1) continue;
        let m = z === z1 ? (edge ? M.wale : M.deck) : M.hullTar;
        if (edge && z === z1 - 1) m = (x + y + 20) % 4 < 2 ? fc.trim : fc.trim2;
        b.set(x, y, z, m);
      }
    // crenellated rail
    if ((x + y0(x)) % 2 === 0) {
      b.set(x, w, z1 + 1, M.wale);
      b.set(x, -w, z1 + 1, M.wale);
    }
  }
  function y0(x: number): number {
    return x & 1;
  }
  const poopZ = deckAt(ac0) + s.castle;
  // poop deck (second tier)
  for (let x = ac0; x <= ac0 + 4; x++) {
    const w = Math.max(1, Math.round(roundHalfBeam(s, x, s.H)) - 1);
    for (let y = -w; y <= w; y++) {
      b.set(x, y, poopZ + 1, M.hull);
      b.set(x, y, poopZ + 2, Math.abs(y) === w || x === ac0 ? M.wale : M.deck);
    }
  }
  // forecastle: triangular, overhanging the stem
  if (s.fore) {
    const f0 = Math.round(half - 7);
    for (let x = f0; x <= Math.round(half + 2); x++) {
      const t = (x - f0) / (half + 2 - f0);
      const w = Math.max(0, Math.round((s.B / 2 - 1) * (1 - t * t)));
      const z0 = deckAt(Math.min(x, half - 1)) + 1;
      for (let z = z0; z <= z0 + 3; z++)
        for (let y = -w; y <= w; y++) {
          const edge = Math.abs(y) === w;
          if (!edge && z < z0 + 3) continue;
          b.set(x, y, z, z === z0 + 3 ? (edge ? M.wale : M.deck) : z === z0 + 2 ? fc.trim : M.hull);
        }
    }
  }
  // rudder
  for (let z = -3; z <= s.H; z++) b.set(-half - 1, 0, z, M.wale);
  const hull = b.build();
  const hullLines: Line3[] = [];
  // bowsprit
  hullLines.push({ a: [half - 2, 0, s.H + 3], b: [half + 9, 0, s.H + 8], m: M.spar, shade: 0.5 });
  const lanterns: V3[] = [[-half - 0.5, 0, poopZ + 5]];
  hullLines.push({ a: [-half, 0, poopZ + 2], b: [-half - 0.5, 0, poopZ + 4], m: M.spar, shade: 0.3 });
  const cradle: Voxel[] = [];

  const dyn = (pose: Pose, frame: number, _flagship: boolean): Dyn => {
    const d = new VoxBuilder();
    const lines: Line3[] = [];
    const phase = (frame / 4) * Math.PI * 2;
    const mainX = 1;
    const foreX = Math.round(half - 5);
    const mizX = Math.round(-half + 6);
    const deck = s.H + 1;
    const masts: { x: number; h: number; sq: boolean; w: number; sh: number }[] = [
      { x: mainX, h: s.mainH, sq: true, w: s.B + 3, sh: s.mainH * 0.48 },
      { x: mizX, h: Math.round(s.mainH * 0.62), sq: false, w: 0, sh: 0 },
    ];
    if (s.fore) masts.push({ x: foreX, h: Math.round(s.mainH * 0.66), sq: true, w: s.B - 1, sh: s.mainH * 0.32 });
    for (const mt of masts) {
      const top = deck + mt.h;
      const z0 = mt.x === mizX ? poopZ + 3 : deck;
      for (let z = z0; z <= top; z++) d.set(mt.x, 0, z, M.spar);
      // shrouds to the rails
      const w = Math.round(roundHalfBeam(s, mt.x, s.H));
      for (const k of [-1, 1]) {
        lines.push({ a: [mt.x, 0, top - 2], b: [mt.x - 2, k * (w + 0.5), deck + 1], m: M.rope, shade: 0.18 });
        lines.push({ a: [mt.x, 0, top - 2], b: [mt.x + 1, k * (w + 0.5), deck + 1], m: M.rope, shade: 0.18 });
      }
      if (mt.x === mainX) {
        // fighting top (gabia) with crossbowmen
        const tz = top - 5;
        for (let a = 0; a < 16; a++) {
          const ang = (a / 16) * Math.PI * 2;
          d.set(mt.x + Math.round(Math.cos(ang) * 1.7), Math.round(Math.sin(ang) * 1.7), tz, M.wale);
          d.set(mt.x + Math.round(Math.cos(ang) * 1.7), Math.round(Math.sin(ang) * 1.7), tz + 1, fc.trim);
        }
        if (pose !== 'sink') figure(d, mt.x + 1, 0, tz + 1, fc.crew[0], fc.head, 1);
        // stay to the bowsprit
        lines.push({ a: [mt.x, 0, top - 1], b: [half + 8, 0, s.H + 8], m: M.rope, shade: 0.2 });
      }
      if (mt.sq) {
        const yardZ = top - (mt.x === mainX ? 7 : 3);
        // yard across the ship
        voxLine(d, [mt.x + 0.5, -mt.w / 2 - 1, yardZ], [mt.x + 0.5, mt.w / 2 + 1, yardZ], M.spar);
        if (pose === 'sail' || pose === 'land') {
          const billow = 2.8 + 0.5 * Math.sin(phase + mt.x);
          const nu = Math.ceil(mt.w * 1.6);
          const nv = Math.ceil(mt.sh * 1.6);
          for (let iu = 0; iu <= nu; iu++)
            for (let iv = 0; iv <= nv; iv++) {
              const u = iu / nu;
              const v = iv / nv;
              const y = -mt.w / 2 + mt.w * u;
              const z = yardZ - 0.5 - mt.sh * v;
              const bub = Math.sin(u * Math.PI) * Math.sin(Math.min(1, v * 1.15) * Math.PI * 0.9 + 0.15);
              const flutter = Math.sin(phase * 2 + v * 7 + u * 3) * 0.3 * v;
              const x = mt.x + 1 + billow * bub + flutter;
              // Genoese: red St George's cross; Byzantine: plain cream with a purple band
              let m = Math.floor(v * mt.sh) % 4 === 0 ? fc.seam : fc.sail;
              if (s.faction === 'ceneviz' && (Math.abs(u - 0.5) < 0.09 || Math.abs(v - 0.42) < 0.08)) m = M.sailRed;
              if (s.faction === 'bizans' && v > 0.84) m = M.purple;
              d.surf(x, y, z, m, 1, (u - 0.5) * -0.6, 0.15 + (0.5 - v) * 0.3);
            }
          // sheets
          lines.push({ a: [mt.x + 2, -mt.w / 2, yardZ - mt.sh], b: [mt.x - 3, -Math.round(roundHalfBeam(s, mt.x - 3, s.H)), deck + 1], m: M.rope, shade: 0.25 });
          lines.push({ a: [mt.x + 2, mt.w / 2, yardZ - mt.sh], b: [mt.x - 3, Math.round(roundHalfBeam(s, mt.x - 3, s.H)), deck + 1], m: M.rope, shade: 0.25 });
        } else {
          // furled on the yard
          for (let y = -mt.w / 2; y <= mt.w / 2; y += 0.5) {
            d.surf(mt.x + 1, y, yardZ - 1, fc.sail, 0.4, 0, 1);
            d.surf(mt.x + 1.5, y, yardZ - 1.5, fc.seam, 1, 0, 0);
          }
        }
      } else {
        // mizzen lateen
        const A: V3 = [mt.x + 6, 0.5, z0 + Math.round(mt.h * 0.25)];
        const B: V3 = [mt.x - 8, 0.5, top + 2];
        voxLine(d, A, B, M.spar);
        if (pose === 'sail' || pose === 'land') {
          const C: V3 = [mt.x - 5, 0.5, z0 + 1];
          const nu = 22;
          const nv = 14;
          for (let iu = 0; iu <= nu; iu++)
            for (let iv = 0; iv <= nv; iv++) {
              const u = iu / nu;
              const v = iv / nv;
              if (u + v > 1.0001) continue;
              const w = 1 - u - v;
              const bub = 6.75 * u * v * w * 4;
              const x = A[0] + (B[0] - A[0]) * u + (C[0] - A[0]) * v;
              const z = A[2] + (B[2] - A[2]) * u + (C[2] - A[2]) * v;
              d.surf(x, 0.5 + bub * 1.8 + Math.sin(phase + u * 6) * 0.2, z, Math.floor(u * 14) % 4 === 0 ? fc.seam : fc.sail, 0.3, 1, 0.2);
            }
        }
      }
      // pennant from each masthead
      if (pose !== 'sink') {
        const pl = mt.x === mainX ? 12 : 6;
        for (let i = 0; i < pl; i++) {
          const h = Math.max(1, Math.round((mt.x === mainX ? 3 : 2) * (1 - i / pl)));
          const wave = Math.sin(phase + i * 0.6) * 1 * (i / pl);
          for (let k = 0; k < h; k++) {
            let m = s.faction === 'ceneviz' ? M.white : s.faction === 'bizans' ? M.gold : M.red;
            if (s.faction === 'ceneviz' && (i === 3 || k === 1)) m = M.red;
            if (s.faction === 'bizans' && (i === 3 || k === 1)) m = M.red;
            d.surf(mt.x - 1 - i, wave, top + 1 + k, m, 0.1, 1, 0.1);
          }
        }
      }
    }
    // stern ensign
    if (pose !== 'sink') {
      const fx = -half - 1;
      const base = poopZ + 3;
      lines.push({ a: [fx, 0, base], b: [fx, 0, base + 9], m: M.spar, shade: 0.35 });
      for (let a = 0; a < 7; a++)
        for (let k = 0; k < 5; k++) {
          const wave = Math.sin(phase + a * 0.8) * 0.8 * (a / 7);
          let m: number;
          if (s.faction === 'ceneviz') m = a === 3 || k === 2 ? M.red : M.white; // red cross on white
          else if (s.faction === 'bizans') m = a === 3 || k === 2 ? M.red : M.gold; // red cross on gold (four B's implied)
          else m = a >= 2 && a <= 4 && k >= 1 && k <= 3 ? M.gold : M.red; // Venice
          d.surf(fx - 1 - a, wave, base + 9 - k, m, 0.1, 1, 0.1);
        }
      // crew with helmets on the castles and the waist
      for (let i = 0; i < s.crew; i++) {
        const t = i / s.crew;
        let x: number;
        let z: number;
        if (i % 3 === 0) {
          x = ac0 + 2 + (i % 5);
          z = deckAt(ac0) + s.castle + 1;
        } else if (i % 3 === 1 && s.fore) {
          x = Math.round(half - 4 + (i % 2));
          z = deckAt(half - 4) + 5;
        } else {
          x = Math.round(-half + 10 + t * (s.L - 16));
          z = deck + 1;
        }
        const y = (i % 2 ? 1 : -1) * (1 + (i % 4 === 0 ? 1 : 0));
        figure(d, x + (((frame + i) % 4) < 2 ? 0 : 1) * (pose === 'sail' ? 1 : 0), y, z, fc.crew[i % fc.crew.length], fc.head);
      }
    }
    for (const l of lanterns) {
      d.surf(l[0], l[1], l[2], M.lantern, 0, 0, 1);
      d.surf(l[0], l[1], l[2] + 1, M.gold, 0, 0, 1);
    }
    return { vox: d.build(), lines };
  };
  return { type, spec: s, hull, hullLines, cradle, lanterns, deckZ: s.H, dyn };
}

export function buildShipModel(type: ShipType): ShipModel {
  const s = SPECS[type];
  return s.kind === 'galley' ? buildGalley(type, s) : buildRound(type, s);
}

// ───────────────────────────── props ─────────────────────────────

/** Pair of oxen under a yoke, walking along +x. */
export function oxPair(frame: number, dark: boolean): { vox: Voxel[]; lines: Line3[] } {
  const b = new VoxBuilder();
  const body = dark ? M.oxRed : M.ox;
  const step = (frame / 4) * Math.PI * 2;
  for (const side of [-2, 2]) {
    // barrel body with a hump over the shoulders
    for (let x = -5; x <= 4; x++)
      for (let y = -1; y <= 1; y++)
        for (let z = 3; z <= 6; z++) {
          if (Math.abs(y) === 1 && (z === 6 || z === 3) && (x === -5 || x === 4)) continue;
          if (z === 6 && x < 1 && Math.abs(y) === 1) continue;
          b.set(x, side + y, z, body);
        }
    b.box(1, 3, side, side, 7, 7, body);
    // head lowered under the yoke, pale muzzle, wide pale horns
    b.box(5, 6, side - 1, side + 1, 3, 5, body);
    b.set(7, side, 3, M.horn);
    b.set(7, side, 4, body);
    for (const k of [-1, 1]) {
      b.set(5, side + k * 2, 6, M.horn);
      b.set(5, side + k * 3, 7, M.horn);
    }
    // legs
    const legs: [number, number, number][] = [
      [3, -1, 0],
      [3, 1, Math.PI],
      [-4, -1, Math.PI],
      [-4, 1, 0],
    ];
    for (const [lx, ly, ph] of legs) {
      const sw = Math.round(Math.sin(step + ph) * 1.2);
      const lift = Math.max(0, Math.round(Math.cos(step + ph)));
      b.set(lx + Math.round(sw / 2), side + ly, 2, body);
      b.set(lx + sw, side + ly, 1 + lift, body);
      b.set(lx + sw, side + ly, lift, M.hoof);
    }
    b.set(-6, side, 5, body);
    b.set(-6, side, 4 - (frame % 2), M.hoof);
  }
  // yoke beam across both necks + drawbar back to the team behind
  b.box(5, 5, -4, 4, 7, 7, M.wale);
  const lines: Line3[] = [{ a: [5, 0, 6], b: [-11, 0, 4], m: M.spar, shade: 0.5 }];
  return { vox: b.build(), lines };
}

/** A greased log roller (lying across the slipway, axis along y). */
export function rollerModel(len: number): Voxel[] {
  const b = new VoxBuilder();
  b.cylinder([0, -len / 2, 0.8], [0, len / 2, 0.8], 1.1, M.grease, M.plank);
  return b.build();
}

/** A plank of the slipway rails, along x. */
export function railModel(len: number): Voxel[] {
  const b = new VoxBuilder();
  b.box(-len / 2, len / 2, 0, 0, 0, 0, M.railPlank);
  return b.build();
}

/** Floating timber log of the Golden Horn chain, along x, with iron bands and chain links at the ends. */
export function chainLogModel(len: number): { vox: Voxel[]; lines: Line3[] } {
  const b = new VoxBuilder();
  b.cylinder([-len / 2, 0, 0.3], [len / 2, 0, 0.3], 1.3, M.hull, M.wale);
  for (const x of [-len / 2 + 1, 0, len / 2 - 1]) for (let a = -2; a <= 2; a++) for (const z of [-1, 0, 1, 2]) if (Math.abs(a) + Math.abs(z - 0.5) >= 1.9 && Math.abs(a) <= 1.5) b.set(x, a, z, M.iron);
  const vox = b.build();
  const lines: Line3[] = [];
  // chain links hanging to the neighbors
  for (let i = 0; i < 4; i++) {
    const x = len / 2 + 0.5 + i;
    lines.push({ a: [x, 0, 0.8 - (i % 2) * 0.5], b: [x + 1, 0, 0.3 + (i % 2) * 0.5], m: M.iron, shade: 0.35 + (i % 2) * 0.3 });
  }
  return { vox, lines };
}

/** A buoy barrel with a small pennant. */
export function buoyModel(frame: number): { vox: Voxel[]; lines: Line3[] } {
  const b = new VoxBuilder();
  b.cylinder([0, 0, -1], [0, 0, 2], 1.6, M.barrel, M.wale);
  for (let a = 0; a < 12; a++) {
    const ang = (a / 12) * Math.PI * 2;
    b.set(Math.round(Math.cos(ang) * 1.7), Math.round(Math.sin(ang) * 1.7), 1, M.iron);
  }
  const lines: Line3[] = [{ a: [0, 0, 2], b: [0, 0, 7], m: M.spar, shade: 0.3 }];
  for (let i = 0; i < 4; i++) for (let k = 0; k < 2; k++) b.surf(-1 - i, Math.sin(frame * 1.6 + i) * 0.6, 7 - k, k === 0 ? M.red : M.gold, 0, 1, 0);
  return { vox: b.build(), lines };
}

/** Pontoon bridge section: two barrels lashed under a plank deck; axis of travel along x. */
export function bridgeSegmentModel(withRail: boolean): { vox: Voxel[]; lines: Line3[] } {
  const b = new VoxBuilder();
  // barrels lie across the bridge, their ends sticking out beyond the narrow deck
  for (const x of [-1.6, 1.6]) {
    b.cylinder([x, -5.5, 0.4], [x, 5.5, 0.4], 1.5, M.barrel, M.wale);
    for (const y of [-4, 0, 4]) for (let a = 0; a < 12; a++) {
      const ang = (a / 12) * Math.PI * 2;
      b.set(x + Math.round(Math.cos(ang) * 1.6), y, 0.4 + Math.round(Math.sin(ang) * 1.6), M.iron);
    }
  }
  // planks across two stringers
  for (let x = -3; x <= 3; x++) for (let y = -3; y <= 3; y++) b.set(x, y, 2.6, x % 2 === 0 ? M.plank : M.deck);
  const lines: Line3[] = [];
  if (withRail)
    for (const y of [-3, 3]) {
      b.set(-3, y, 3.6, M.wale);
      b.set(-3, y, 4.6, M.wale);
      lines.push({ a: [-3, y, 4.6], b: [4, y, 4.2], m: M.rope, shade: 0.5 });
    }
  return { vox: b.build(), lines };
}

/** Floating gun platform with a bronze cannon (center of the bridge). */
export function gunPlatformModel(): { vox: Voxel[]; lines: Line3[] } {
  const b = new VoxBuilder();
  for (const x of [-4, 0, 4]) for (const y of [-4, 4]) b.cylinder([x - 1.5, y, 0.2], [x + 1.5, y, 0.2], 1.7, M.barrel, M.wale);
  for (let x = -6; x <= 6; x++) for (let y = -6; y <= 6; y++) b.set(x, y, 2, (x + y) % 3 === 0 ? M.plank : M.deck);
  // gun carriage + barrel aimed across (+y)
  b.box(-1, 1, -2, 2, 3, 3, M.wale);
  b.cylinder([0, -3, 4.5], [0, 6, 4.5], 1.2, M.bronze, M.gold);
  // gabions
  for (const x of [-5, 5]) b.box(x, x, 3, 5, 3, 5, M.sack);
  const lines: Line3[] = [];
  return { vox: b.build(), lines };
}

/** Haul cradle with a hull-less frame (used while the slipway is being built). */
export function debrisModels(): { vox: Voxel[]; lines: Line3[] }[] {
  const out: { vox: Voxel[]; lines: Line3[] }[] = [];
  // plank
  {
    const b = new VoxBuilder();
    b.box(-3, 3, 0, 1, 0, 0, M.deck);
    out.push({ vox: b.build(), lines: [] });
  }
  // barrel
  {
    const b = new VoxBuilder();
    b.cylinder([-1.5, 0, 0.5], [1.5, 0, 0.5], 1.4, M.barrel, M.wale);
    out.push({ vox: b.build(), lines: [] });
  }
  // broken spar with rag
  {
    const b = new VoxBuilder();
    for (let x = -5; x <= 5; x++) b.set(x, 0, 0, M.spar);
    b.surf(1, 1, 0, M.sail, 0, 0, 1);
    b.surf(2, 1, 0, M.sail, 0, 0, 1);
    b.surf(2, 2, 0, M.sailSeam, 0, 0, 1);
    out.push({ vox: b.build(), lines: [] });
  }
  // grating
  {
    const b = new VoxBuilder();
    for (let x = -2; x <= 2; x++) for (let y = -2; y <= 2; y++) if ((x + y) % 2 === 0) b.set(x, y, 0, M.wale);
    out.push({ vox: b.build(), lines: [] });
  }
  return out;
}

export { smooth };
