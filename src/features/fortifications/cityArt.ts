import { PixelCanvas } from '../../art/pixel';
import type { TextureGen } from '../../art/texture';
import { hash2 } from '../../core/rng';
import { geoToTile } from '../../data/geography';
import { CISTERNS, VALENS_PTS } from './city';
import { Arcade, Box, Cyl, GLOW, Mound, Poly, RAMP, Slab, type MatId, type RoofKind } from './prims';
import { pick, renderScene, Scene, type Prim } from './raster';

/**
 * City art (pure, generated once at boot): Byzantine houses, churches,
 * monasteries, Genoese town houses, ruins, wells, cisterns and the great
 * landmarks of 1453 — Ayasofya (no minarets!), the Hippodrome with its
 * obelisks, the ruined Great Palace, the Holy Apostles, the Valens aqueduct,
 * Pantokrator, Chora, Blachernae, Tekfur Sarayı, Galata Tower (conical roof),
 * the chain tower and Anadolu Hisarı.
 *
 * Every sprite is built from primitives around tile (0,0) and rendered with the
 * shared renderer. `ax, ay` = canvas position of the ground point (0,0).
 */

export interface SheetSpec {
  key: string;
  fw: number;
  fh: number;
  ax: number;
  ay: number;
  n: number;
}

export const SHEETS = {
  ev: { key: 'city/ev', fw: 60, fh: 52, ax: 28, ay: 36, n: 12 },
  evGalata: { key: 'city/ev-galata', fw: 56, fh: 62, ax: 26, ay: 46, n: 8 },
  kilise: { key: 'city/kilise', fw: 104, fh: 92, ax: 50, ay: 62, n: 4 },
  manastir: { key: 'city/manastir', fw: 160, fh: 116, ax: 76, ay: 76, n: 2 },
  harabe: { key: 'city/harabe', fw: 56, fh: 44, ax: 26, ay: 30, n: 4 },
  kuyu: { key: 'city/kuyu', fw: 22, fh: 24, ax: 10, ay: 17, n: 1 },
} satisfies Record<string, SheetSpec>;

export interface LandmarkSpec {
  key: string;
  w: number;
  h: number;
  ax: number;
  ay: number;
  build: (owner: number) => Prim[];
  /** chimney/smoke or flag anchor points (relative to the ground origin, px) */
  flags?: [number, number][];
}

const G = (o: Partial<{ ox: number; oy: number }> = {}) => o;
void G;

/** Render prims standalone (flat ground at z = 0) into a w×h canvas. */
export function standalone(prims: Prim[], w: number, h: number, ax: number, ay: number, shadow = true): PixelCanvas {
  const sc = new Scene();
  for (const p of prims) sc.add(p);
  sc.build();
  const out = renderScene(sc, {
    w,
    h,
    px0: ax,
    py0: ay,
    own: () => true,
    ground: () => 0,
    groundShadow: shadow ? () => true : undefined,
    shadowAlpha: 0.36,
    skirt: 1,
  });
  return out.canvas;
}

/** Night window overlay: only lit window pixels survive. */
export function glowLayer(prims: Prim[], w: number, h: number, ax: number, ay: number): PixelCanvas {
  GLOW.on = true;
  try {
    const sc = new Scene();
    for (const p of prims) sc.add(p);
    sc.build();
    const out = renderScene(sc, { w, h, px0: ax, py0: ay, own: () => true, ground: () => 0, skirt: 0, edges: false });
    const d = out.canvas.data;
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] < 40) d[i + 3] = 0;
    return out.canvas;
  } finally {
    GLOW.on = false;
  }
}

// ───────────────────────────── houses ─────────────────────────────

type BoxArgs = { cx?: number; cy?: number; ax?: number; ay?: number; ha: number; hb: number; base?: number; height: number; roof: RoofKind; rise?: number; mat: MatId; upper?: MatId; upperZ?: number; roofMat?: 'kiremit' | 'kursun' | 'ahsap' | 'tas'; windows?: 'ev' | 'kule' | 'kilise' | 'saray' | 'none'; ruin?: number; seed?: number };
const box = (o: BoxArgs, owner = 0) =>
  new Box({ cx: o.cx ?? 0, cy: o.cy ?? 0, ax: o.ax ?? 1, ay: o.ay ?? 0, base: o.base ?? 0, owner, roofMat: o.roofMat ?? 'kiremit', windows: o.windows ?? 'ev', seed: o.seed ?? 3, ...o });

const wallMats: MatId[] = ['siva', 'siva', 'tugla', 'siva-beyaz', 'siva-sari'];

export function housePrims(v: number): Prim[] {
  const seed = v * 13 + 5;
  const m = wallMats[v % wallMats.length];
  switch (v) {
    case 0:
      return [box({ ha: 0.34, hb: 0.24, height: 8, roof: 'gable', rise: 6, mat: m, upperZ: 4, seed })];
    case 1:
      return [box({ ax: 0, ay: 1, ha: 0.34, hb: 0.24, height: 8, roof: 'gable', rise: 6, mat: 'siva', upperZ: 4, seed })];
    case 2:
      return [box({ ha: 0.34, hb: 0.27, height: 13, upper: 'ahsap', upperZ: 7, roof: 'hip', rise: 6, mat: 'tugla', seed })];
    case 3:
      return [box({ ax: 0, ay: 1, ha: 0.36, hb: 0.25, height: 13, upper: 'ahsap', upperZ: 7, roof: 'gable', rise: 6, mat: 'siva', seed })];
    case 4:
      return [
        box({ cx: -0.06, cy: -0.08, ha: 0.34, hb: 0.17, height: 12, upper: 'ahsap', upperZ: 7, roof: 'gable', rise: 5, mat: 'siva', seed }),
        box({ cx: 0.18, cy: 0.16, ax: 0, ay: 1, ha: 0.22, hb: 0.15, height: 8, roof: 'gable', rise: 5, mat: 'siva-beyaz', upperZ: 4, seed: seed + 1 }),
      ];
    case 5: {
      // house with a walled yard
      const out: Prim[] = [box({ cx: -0.14, cy: -0.12, ha: 0.24, hb: 0.2, height: 9, roof: 'gable', rise: 5, mat: 'siva', upperZ: 4, seed })];
      const wl = (cx: number, cy: number, ha: number, hb: number) => box({ cx, cy, ha, hb, height: 4, roof: 'flat', mat: 'galata', roofMat: 'tas', windows: 'none', seed });
      out.push(wl(0.1, 0.3, 0.3, 0.035), wl(0.38, 0.05, 0.035, 0.28));
      return out;
    }
    case 6:
      return [box({ ha: 0.3, hb: 0.28, height: 14, roof: 'hip', rise: 6, mat: 'tugla', windows: 'ev', upperZ: 7, seed })];
    case 7:
      // abandoned, roofless house
      return [box({ ha: 0.3, hb: 0.22, height: 9, roof: 'ruin', ruin: 0.75, mat: 'siva', seed }), new Mound({ ax: 0.1, ay: 0.24, bx: 0.28, by: 0.28, r: 0.13, base: 0, height: 3, owner: 0, seed, kind: 'moloz' })];
    case 8:
      return [box({ ha: 0.28, hb: 0.2, height: 7, roof: 'shed', rise: 4, mat: 'ahsap', roofMat: 'ahsap', windows: 'none', seed })];
    case 9:
      return [box({ ha: 0.18, hb: 0.18, height: 20, roof: 'pyramid', rise: 6, mat: 'tugla', windows: 'kule', seed }), box({ cx: 0.2, cy: 0.22, ha: 0.22, hb: 0.15, height: 8, roof: 'gable', rise: 4, mat: 'siva', upperZ: 4, seed: seed + 2 })];
    case 10:
      return [box({ ha: 0.55, hb: 0.18, height: 11, upper: 'ahsap', upperZ: 6, roof: 'gable', rise: 5, mat: 'siva-sari', seed })];
    default:
      return [
        box({ ha: 0.32, hb: 0.25, height: 8, roof: 'flat', mat: 'siva-beyaz', roofMat: 'tas', upperZ: 4, seed }),
        box({ cx: -0.1, cy: -0.08, ha: 0.14, hb: 0.12, base: 8, height: 5, roof: 'gable', rise: 3, mat: 'siva-beyaz', upperZ: 2, seed: seed + 3 }),
      ];
  }
}

export function galataHousePrims(v: number): Prim[] {
  const seed = v * 17 + 9;
  const mats: MatId[] = ['siva-pembe', 'siva-sari', 'siva', 'siva-beyaz', 'galata', 'siva-pembe', 'tugla', 'siva-sari'];
  const m = mats[v % mats.length];
  const tall = 14 + (v % 3) * 4;
  const ax = v % 2 === 0 ? 1 : 0;
  const ay = 1 - ax;
  const out: Prim[] = [box({ ax, ay, ha: 0.3, hb: 0.24, height: tall, roof: v % 4 === 3 ? 'hip' : 'gable', rise: 5, mat: m, seed, upperZ: 6 })];
  if (v % 3 === 0) out.push(box({ cx: ax * 0.1 + 0.14, cy: ay * 0.1 + 0.16, ha: 0.11, hb: 0.11, base: 0, height: tall + 6, roof: 'pyramid', rise: 4, mat: 'galata', windows: 'kule', seed }));
  return out;
}

// ───────────────────────────── churches & monasteries ─────────────────────────────

/** Dome rise matching its radius (a slightly flattened hemisphere in screen space). */
const domeRise = (r: number, k = 0.9) => Math.max(2, Math.round(r * 22 * k));

function cross(cx: number, cy: number, s: number, H: number, owner: number, seed: number, domes: 1 | 5, roofMat: 'kursun' | 'kiremit'): Prim[] {
  const out: Prim[] = [];
  // naos core + cross arms with gable roofs
  out.push(box({ cx, cy, ha: 0.2 * s, hb: 0.2 * s, height: H, roof: 'flat', mat: 'tugla', roofMat: 'kiremit', windows: 'kilise', seed }, owner));
  out.push(box({ cx, cy, ha: 0.32 * s, hb: 0.11 * s, height: H - 1, roof: 'gable', rise: 3 * s, mat: 'tugla', windows: 'kilise', seed }, owner));
  out.push(box({ cx, cy, ax: 0, ay: 1, ha: 0.32 * s, hb: 0.11 * s, height: H - 1, roof: 'gable', rise: 3 * s, mat: 'tugla', windows: 'kilise', seed: seed + 1 }, owner));
  // apse to the east (+tx), narthex to the west
  out.push(new Cyl({ cx: cx + 0.32 * s, cy, r: 0.12 * s, base: 0, height: H - 4, top: 'dome', rise: domeRise(0.12 * s, 0.5), mat: 'tugla', roofMat: 'kiremit', owner, clip: { nx: 1, ny: 0 }, seed }));
  out.push(box({ cx: cx - 0.33 * s, cy, ha: 0.07 * s, hb: 0.24 * s, height: H - 4, roof: 'shed', rise: 2, mat: 'tugla', windows: 'kilise', seed: seed + 2 }, owner));
  // dome(s) on drums
  const r = 0.13 * s;
  out.push(new Cyl({ cx, cy, r, base: H, height: 4 * s, top: 'dome', rise: domeRise(r), mat: 'tugla', roofMat, owner, windows: 'drum', ribs: roofMat === 'kursun' ? 10 : 0, seed }));
  if (domes === 5) {
    for (const [dx, dy] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      const rr = 0.075 * s;
      out.push(new Cyl({ cx: cx + dx * 0.17 * s, cy: cy + dy * 0.17 * s, r: rr, base: H - 1, height: 2.5 * s, top: 'dome', rise: domeRise(rr), mat: 'tugla', roofMat, owner, windows: 'drum', seed }));
    }
  }
  return out;
}

export function churchPrims(v: number): Prim[] {
  const seed = v * 31 + 7;
  switch (v) {
    case 0:
      return cross(0, 0, 1.8, 15, 0, seed, 1, 'kursun');
    case 1:
      return cross(0, 0, 1.8, 16, 0, seed, 5, 'kiremit');
    case 2: {
      // basilica: long gabled nave + aisles + apse + bell tower
      return [
        box({ ha: 0.62, hb: 0.2, height: 16, roof: 'gable', rise: 7, mat: 'tugla', windows: 'kilise', seed }),
        box({ cy: -0.27, ha: 0.58, hb: 0.08, height: 10, roof: 'shed', rise: 3, mat: 'tugla', windows: 'kilise', seed: seed + 1 }),
        box({ cy: 0.27, ha: 0.58, hb: 0.08, height: 10, roof: 'shed', rise: 3, mat: 'tugla', windows: 'kilise', seed: seed + 2 }),
        new Cyl({ cx: 0.62, cy: 0, r: 0.17, base: 0, height: 12, top: 'dome', rise: 4, mat: 'tugla', roofMat: 'kiremit', owner: 0, clip: { nx: 1, ny: 0 }, seed }),
        box({ cx: -0.7, cy: -0.1, ha: 0.1, hb: 0.1, height: 24, roof: 'pyramid', rise: 5, mat: 'tugla', windows: 'kule', seed: seed + 3 }),
      ];
    }
    default:
      return [
        box({ ha: 0.32, hb: 0.22, height: 11, roof: 'gable', rise: 5, mat: 'tugla', windows: 'kilise', seed }),
        new Cyl({ cx: 0, cy: 0, r: 0.14, base: 11, height: 5, top: 'dome', rise: domeRise(0.14), mat: 'tugla', roofMat: 'kursun', owner: 0, windows: 'drum', ribs: 8, seed }),
        new Cyl({ cx: 0.32, cy: 0, r: 0.14, base: 0, height: 9, top: 'dome', rise: 3, mat: 'tugla', roofMat: 'kiremit', owner: 0, clip: { nx: 1, ny: 0 }, seed }),
      ];
  }
}

export function monasteryPrims(v: number): Prim[] {
  const seed = v * 41 + 3;
  const out: Prim[] = [];
  const R = 1.0;
  const wl = (cx: number, cy: number, ha: number, hb: number) => box({ cx, cy, ha, hb, height: 8, roof: 'merlon', mat: 'galata', windows: 'none', seed });
  out.push(wl(0, -R, R, 0.04), wl(0, R, R, 0.04), wl(-R, 0, 0.04, R), wl(R, 0, 0.04, R));
  // cells along two walls (shed roofs leaning on the enclosure)
  out.push(box({ cx: -0.15, cy: -R + 0.16, ha: 0.7, hb: 0.11, height: 8, roof: 'shed', rise: 3, mat: 'siva', windows: 'ev', upperZ: 4, seed }));
  out.push(box({ cx: -R + 0.16, cy: 0.15, ax: 0, ay: 1, ha: 0.66, hb: 0.11, height: 8, roof: 'shed', rise: 3, mat: 'siva', windows: 'ev', upperZ: 4, seed: seed + 1 }));
  // cloister court (garden with paths)
  out.push(
    new Slab({
      cx: 0.17,
      cy: 0.17,
      ax: 1,
      ay: 0,
      ha: 0.68,
      hb: 0.68,
      base: 0,
      height: 1,
      owner: 0,
      noShadow: true,
      color: (I, a, b, x, y) => {
        const path = Math.abs(a) < 0.05 || Math.abs(b) < 0.05;
        if (path) return pick(RAMP.lime, 2.6 + I * 2, x, y);
        return pick(RAMP.grass, 2 + I * 3 + (hash2(Math.floor(a * 30 + 50), Math.floor(b * 30 + 50), 3) < 0.3 ? 1 : 0), x, y);
      },
    }),
  );
  out.push(...cross(0.25, 0.22, 1.35, 13, 0, seed, v === 0 ? 1 : 5, 'kursun'));
  // gate tower
  out.push(box({ cx: 0, cy: R, ha: 0.13, hb: 0.1, height: 14, roof: 'pyramid', rise: 4, mat: 'galata', windows: 'kule', seed: seed + 5 }));
  return out;
}

export function ruinPrims(v: number): Prim[] {
  const seed = v * 23 + 1;
  const out: Prim[] = [];
  if (v === 0 || v === 2) {
    // row of broken columns
    for (let k = 0; k < 4; k++) {
      const h = 6 + hash2(k, v, 3) * 9;
      out.push(new Cyl({ cx: -0.33 + k * 0.22, cy: -0.03 + (v === 2 ? k * 0.06 : 0), r: 0.05, base: 0, height: h + 3, top: k === 1 ? 'flat' : 'ruin', ruin: 0.95, mat: 'mermer', owner: 0, seed: seed + k }));
    }
    out.push(box({ cx: 0.08, cy: 0.2, ha: 0.2, hb: 0.05, height: 3, roof: 'flat', mat: 'mermer', windows: 'none', seed }));
  } else {
    // fragment of a brick vaulted hall
    out.push(box({ ha: 0.36, hb: 0.06, height: 16, roof: 'ruin', ruin: 0.85, mat: 'tugla', windows: 'saray', seed }));
    out.push(box({ cx: 0.32, cy: 0.2, ax: 0, ay: 1, ha: 0.22, hb: 0.06, height: 11, roof: 'ruin', ruin: 0.7, mat: 'tugla', windows: 'none', seed: seed + 1 }));
  }
  out.push(new Mound({ ax: -0.16, ay: 0.2, bx: 0.24, by: 0.16, r: 0.15, base: 0, height: 3, owner: 0, seed, kind: 'moloz' }));
  return out;
}

export function wellPrims(): Prim[] {
  return [
    new Cyl({ cx: 0, cy: 0, r: 0.1, base: 0, height: 4, top: 'flat', mat: 'mermer', owner: 0 }),
    new Cyl({ cx: 0, cy: 0, r: 0.06, base: 0, height: 4.4, top: 'flat', mat: 'moloz', owner: 0 }),
    box({ cx: -0.08, cy: 0, ha: 0.015, hb: 0.015, height: 10, roof: 'flat', mat: 'ahsap', roofMat: 'ahsap', windows: 'none' }),
    box({ cx: 0.08, cy: 0, ha: 0.015, hb: 0.015, height: 10, roof: 'flat', mat: 'ahsap', roofMat: 'ahsap', windows: 'none' }),
    box({ cx: 0, cy: 0, ha: 0.1, hb: 0.015, base: 10, height: 1, roof: 'flat', mat: 'ahsap', roofMat: 'ahsap', windows: 'none' }),
  ];
}

// ───────────────────────────── landmarks ─────────────────────────────

function ayasofya(o: number): Prim[] {
  const out: Prim[] = [];
  const k = 1.4; // landmark exaggeration (the Great Church must dominate the skyline)
  const H = 28;
  const lead = 'kursun' as const;
  const m: MatId = 'siva-pembe';
  // main block, inner & outer narthex, atrium remains
  out.push(box({ ha: 0.95 * k, hb: 0.85 * k, height: H, roof: 'flat', mat: m, roofMat: lead, windows: 'kilise', seed: 3 }, o));
  out.push(box({ cx: -1.1 * k, ha: 0.16 * k, hb: 0.85 * k, height: 21, roof: 'flat', mat: m, roofMat: lead, windows: 'kilise', seed: 4 }, o));
  out.push(box({ cx: -1.36 * k, ha: 0.1 * k, hb: 0.8 * k, height: 16, roof: 'flat', mat: m, roofMat: lead, windows: 'kilise', seed: 5 }, o));
  out.push(box({ cx: -1.95 * k, cy: -0.66 * k, ha: 0.5 * k, hb: 0.05, height: 8, roof: 'flat', mat: m, roofMat: lead, windows: 'none', seed: 6 }, o));
  out.push(box({ cx: -1.95 * k, cy: 0.66 * k, ha: 0.5 * k, hb: 0.05, height: 8, roof: 'flat', mat: m, roofMat: lead, windows: 'none', seed: 7 }, o));
  out.push(box({ cx: -2.42 * k, cy: 0, ha: 0.05, hb: 0.66 * k, height: 8, roof: 'flat', mat: m, roofMat: lead, windows: 'none', seed: 8 }, o));
  // the four great north/south buttress towers
  for (const sx of [-1, 1])
    for (const sy of [-1, 1]) {
      out.push(box({ cx: sx * 0.5 * k, cy: sy * 0.98 * k, ha: 0.16 * k, hb: 0.2 * k, height: H + 11, roof: 'pyramid', rise: 5, mat: m, roofMat: lead, windows: 'none', seed: 9 }, o));
    }
  // east apse
  out.push(new Poly({ cx: 0.95 * k, cy: 0, r: 0.3 * k, sides: 6, rot: 0, base: 0, height: H - 5, top: 'pyramid', rise: 5, mat: m, owner: o, clip: { nx: 1, ny: 0 } }));
  // semi-domes east & west, exedrae
  for (const sx of [-1, 1]) {
    out.push(new Cyl({ cx: sx * 0.42 * k, cy: 0, r: 0.5 * k, base: H, height: 3, top: 'dome', rise: 13, mat: m, roofMat: lead, owner: o, clip: { nx: sx, ny: 0 }, ribs: 10, seed: 11 }));
    for (const sy of [-1, 1]) {
      out.push(new Cyl({ cx: sx * 0.62 * k, cy: sy * 0.3 * k, r: 0.2 * k, base: H, height: 2, top: 'dome', rise: 5, mat: m, roofMat: lead, owner: o, clip: { nx: sx * 0.6, ny: sy * 0.8 }, seed: 12 }));
    }
  }
  // the great dome: drum with 40 windows, shallow lead dome with ribs
  out.push(new Cyl({ cx: 0, cy: 0, r: 0.52 * k, base: H, height: 10, top: 'dome', rise: 17, mat: m, roofMat: lead, owner: o, windows: 'drum', ribs: 40, seed: 13 }));
  // skeuophylakion rotunda (north-east)
  out.push(new Cyl({ cx: 0.85 * k, cy: -1.18 * k, r: 0.22 * k, base: 0, height: 14, top: 'dome', rise: 6, mat: 'tugla', roofMat: lead, owner: o, windows: 'kule', seed: 14 }));
  // baptistery (south-west)
  out.push(new Poly({ cx: -1.05 * k, cy: 1.22 * k, r: 0.2 * k, sides: 8, rot: 0, base: 0, height: 12, top: 'flat', mat: 'tugla', owner: o }));
  out.push(new Cyl({ cx: -1.05 * k, cy: 1.22 * k, r: 0.14 * k, base: 12, height: 2, top: 'dome', rise: 5, mat: 'tugla', roofMat: lead, owner: o, seed: 15 }));
  return out;
}

function hipodrom(o: number): Prim[] {
  const out: Prim[] = [];
  // axis NNE → SSW
  const ax = -0.33;
  const ay = 0.94;
  const L = 2.9;
  const W = 0.62;
  const px = -ay;
  const py = ax;
  // arena floor
  out.push(
    new Slab({
      cx: 0,
      cy: 0,
      ax,
      ay,
      ha: L,
      hb: W,
      base: 0,
      height: 1,
      owner: o,
      noShadow: true,
      color: (I, a, b, x, y) => {
        const track = Math.abs(Math.abs(b) - W * 0.5) < 0.12;
        return track ? pick(RAMP.sand, 3 + I * 1.5, x, y) : pick(RAMP.dryGrass, 2.2 + I * 2 + (hash2(Math.floor(a * 9 + 90), Math.floor(b * 9 + 90), 3) < 0.25 ? 0.8 : 0), x, y);
      },
    }),
  );
  // ruined seating walls along both long sides (stepped, broken)
  const n = 9;
  for (let k = 0; k < n; k++) {
    const f = -L + 0.2 + (k + 0.5) * ((2 * L - 0.4) / n);
    for (const s of [-1, 1]) {
      const h = 6 + hash2(k, s + 3, 5) * 6;
      const ruin = hash2(k, s + 7, 5) < 0.45 ? 0.5 + hash2(k, s, 6) * 0.4 : undefined;
      out.push(box({ cx: ax * f + px * s * (W + 0.08), cy: ay * f + py * s * (W + 0.08), ax, ay, ha: (L - 0.2) / n, hb: 0.09, height: h, roof: ruin != null ? 'ruin' : 'flat', ruin, mat: 'tugla', roofMat: 'tas', windows: 'saray', seed: k * 3 + s }, o));
    }
  }
  // sphendone: curved southern end on arched substructures
  for (let k = 0; k <= 6; k++) {
    const a = Math.PI * (k / 6);
    const r = W + 0.06;
    const cx = ax * L + (ax * Math.sin(a) * r * 0.9 + px * Math.cos(a) * r);
    const cy = ay * L + (ay * Math.sin(a) * r * 0.9 + py * Math.cos(a) * r);
    out.push(box({ cx, cy, ax: Math.cos(a) * ax - Math.sin(a) * px, ay: Math.cos(a) * ay - Math.sin(a) * py, ha: 0.14, hb: 0.08, height: 12, roof: 'flat', mat: 'tugla', roofMat: 'tas', windows: 'saray', seed: 30 + k }, o));
  }
  // spina with the monuments
  out.push(box({ ax, ay, ha: L * 0.72, hb: 0.05, height: 2, roof: 'flat', mat: 'mermer', windows: 'none', seed: 40 }, o));
  // Obelisk of Theodosius (pink granite) on its marble base
  out.push(box({ cx: ax * -0.9, cy: ay * -0.9, ha: 0.07, hb: 0.07, height: 4, roof: 'flat', mat: 'mermer', windows: 'none' }, o));
  out.push(box({ cx: ax * -0.9, cy: ay * -0.9, ha: 0.035, hb: 0.035, base: 4, height: 17, roof: 'pyramid', rise: 3, mat: 'siva-pembe', roofMat: 'tas', windows: 'none' }, o));
  // Serpent Column (bronze)
  out.push(new Cyl({ cx: ax * -0.2, cy: ay * -0.2, r: 0.025, base: 2, height: 7, top: 'flat', mat: 'moloz', owner: o }));
  // Walled obelisk
  out.push(box({ cx: ax * 0.6, cy: ay * 0.6, ha: 0.04, hb: 0.04, base: 2, height: 19, roof: 'pyramid', rise: 2, mat: 'galata', roofMat: 'tas', windows: 'none' }, o));
  return out;
}

function buyukSaray(o: number): Prim[] {
  const out: Prim[] = [];
  const spots: [number, number, number, number, number, number][] = [
    // cx, cy, ha, hb, height, ruin
    [-0.6, -0.4, 0.35, 0.08, 14, 0.75],
    [-0.2, -0.55, 0.08, 0.3, 10, 0.6],
    [0.3, -0.2, 0.3, 0.25, 9, 0.45],
    [0.8, 0.3, 0.25, 0.08, 16, 0.85],
    [-0.4, 0.5, 0.3, 0.1, 8, 0.5],
    [0.25, 0.65, 0.12, 0.12, 12, 0.65],
  ];
  spots.forEach(([cx, cy, ha, hb, h, r], k) => {
    out.push(box({ cx, cy, ha, hb, height: h, roof: 'ruin', ruin: r, mat: 'tugla', windows: 'saray', seed: 50 + k }, o));
    out.push(new Mound({ ax: cx - ha * 0.5, ay: cy + hb + 0.06, bx: cx + ha * 0.5, by: cy + hb + 0.1, r: 0.12, base: 0, height: 2.5, owner: o, seed: 60 + k, kind: 'moloz' }));
  });
  // a still-standing vaulted hall (the Boukoleon side)
  out.push(box({ cx: 0.95, cy: 0.75, ha: 0.28, hb: 0.12, height: 14, roof: 'flat', mat: 'mermer', roofMat: 'tas', windows: 'saray', seed: 70 }, o));
  for (let k = 0; k < 5; k++) out.push(new Cyl({ cx: -0.1 + k * 0.12, cy: 0.15, r: 0.03, base: 0, height: 5 + hash2(k, 9, 9) * 8, top: 'ruin', ruin: 0.95, mat: 'mermer', owner: o, seed: 80 + k }));
  return out;
}

function akropolis(o: number): Prim[] {
  const out: Prim[] = [];
  // Column of the Goths
  out.push(box({ ha: 0.07, hb: 0.07, height: 4, roof: 'flat', mat: 'mermer', windows: 'none' }, o));
  out.push(new Cyl({ cx: 0, cy: 0, r: 0.045, base: 4, height: 24, top: 'flat', mat: 'mermer', owner: o }));
  out.push(box({ ha: 0.06, hb: 0.06, base: 28, height: 3, roof: 'flat', mat: 'mermer', windows: 'none' }, o));
  // St George of Mangana & ruins
  out.push(...cross(0.75, 0.45, 0.9, 12, o, 91, 1, 'kursun'));
  out.push(box({ cx: -0.5, cy: 0.6, ha: 0.25, hb: 0.07, height: 10, roof: 'ruin', ruin: 0.6, mat: 'tugla', windows: 'saray', seed: 92 }, o));
  return out;
}

function havariyun(o: number): Prim[] {
  const out: Prim[] = [];
  const H = 15;
  const lead = 'kursun' as const;
  // cruciform: four equal arms
  out.push(box({ ha: 0.62, hb: 0.2, height: H, roof: 'flat', mat: 'tugla', roofMat: lead, windows: 'kilise', seed: 101 }, o));
  out.push(box({ ax: 0, ay: 1, ha: 0.62, hb: 0.2, height: H, roof: 'flat', mat: 'tugla', roofMat: lead, windows: 'kilise', seed: 102 }, o));
  // five domes on drums
  out.push(new Cyl({ cx: 0, cy: 0, r: 0.2, base: H, height: 6, top: 'dome', rise: domeRise(0.2), mat: 'tugla', roofMat: lead, owner: o, windows: 'drum', ribs: 16, seed: 103 }));
  for (const [dx, dy] of [
    [0.42, 0],
    [-0.42, 0],
    [0, 0.42],
    [0, -0.42],
  ]) {
    out.push(new Cyl({ cx: dx, cy: dy, r: 0.15, base: H, height: 4, top: 'dome', rise: domeRise(0.15), mat: 'tugla', roofMat: lead, owner: o, windows: 'drum', ribs: 12, seed: 104 }));
  }
  // mausoleum of Constantine (rotunda) at the east end
  out.push(new Cyl({ cx: 0.95, cy: 0, r: 0.24, base: 0, height: 12, top: 'dome', rise: domeRise(0.24), mat: 'tugla', roofMat: lead, owner: o, windows: 'kule', seed: 105 }));
  return out;
}

function pantokrator(o: number): Prim[] {
  const out: Prim[] = [];
  for (const [k, cy] of [
    [0, -0.42],
    [1, 0],
    [2, 0.42],
  ] as [number, number][]) {
    const H = k === 1 ? 11 : 13;
    out.push(box({ cy, ha: 0.42, hb: 0.17, height: H, roof: 'flat', mat: 'tugla', roofMat: 'kursun', windows: 'kilise', seed: 110 + k }, o));
    out.push(new Cyl({ cx: 0.06, cy, r: 0.14, base: H, height: 5, top: 'dome', rise: domeRise(0.14), mat: 'tugla', roofMat: 'kursun', owner: o, windows: 'drum', ribs: 12, seed: 115 + k }));
    if (k !== 1) out.push(new Cyl({ cx: -0.25, cy, r: 0.09, base: H, height: 3, top: 'dome', rise: domeRise(0.09), mat: 'tugla', roofMat: 'kursun', owner: o, windows: 'drum', seed: 118 + k }));
    out.push(new Poly({ cx: 0.42, cy, r: 0.12, sides: 6, rot: 0, base: 0, height: H - 3, top: 'pyramid', rise: 3, mat: 'tugla', owner: o, clip: { nx: 1, ny: 0 } }));
  }
  out.push(box({ cx: -0.5, ha: 0.08, hb: 0.6, height: 9, roof: 'flat', mat: 'tugla', roofMat: 'kursun', windows: 'kilise', seed: 120 }, o));
  return out;
}

function kariye(o: number): Prim[] {
  const out: Prim[] = [];
  out.push(box({ ha: 0.25, hb: 0.25, height: 12, roof: 'flat', mat: 'tugla', roofMat: 'kursun', windows: 'kilise', seed: 130 }, o));
  out.push(new Cyl({ cx: 0, cy: 0, r: 0.15, base: 12, height: 7, top: 'dome', rise: domeRise(0.15), mat: 'tugla', roofMat: 'kursun', owner: o, windows: 'drum', ribs: 12, seed: 131 }));
  // inner & outer narthex with small domes
  out.push(box({ cx: -0.36, ha: 0.12, hb: 0.3, height: 9, roof: 'flat', mat: 'tugla', roofMat: 'kursun', windows: 'kilise', seed: 132 }, o));
  out.push(new Cyl({ cx: -0.36, cy: -0.12, r: 0.07, base: 9, height: 3, top: 'dome', rise: domeRise(0.07), mat: 'tugla', roofMat: 'kursun', owner: o, windows: 'drum', seed: 133 }));
  out.push(new Cyl({ cx: -0.36, cy: 0.14, r: 0.07, base: 9, height: 3, top: 'dome', rise: domeRise(0.07), mat: 'tugla', roofMat: 'kursun', owner: o, windows: 'drum', seed: 134 }));
  // parekklesion (south)
  out.push(box({ cy: 0.36, ha: 0.25, hb: 0.1, height: 10, roof: 'gable', rise: 3, mat: 'tugla', roofMat: 'kursun', windows: 'kilise', seed: 135 }, o));
  out.push(new Cyl({ cx: 0.06, cy: 0.36, r: 0.07, base: 10, height: 3, top: 'dome', rise: domeRise(0.07), mat: 'tugla', roofMat: 'kursun', owner: o, windows: 'drum', seed: 136 }));
  out.push(new Cyl({ cx: 0.26, cy: 0, r: 0.1, base: 0, height: 10, top: 'dome', rise: 3, mat: 'tugla', roofMat: 'kursun', owner: o, clip: { nx: 1, ny: 0 }, seed: 137 }));
  return out;
}

function blahernai(o: number): Prim[] {
  const out: Prim[] = [];
  // palace halls on the terraces of the sixth hill (axis along the walls)
  out.push(box({ cx: 0, cy: 0, ha: 0.55, hb: 0.2, height: 20, roof: 'flat', mat: 'tugla', roofMat: 'kursun', windows: 'saray', seed: 140 }, o));
  out.push(box({ cx: 0.5, cy: 0.45, ax: 0, ay: 1, ha: 0.4, hb: 0.16, height: 16, roof: 'hip', rise: 5, mat: 'tugla', windows: 'saray', seed: 141 }, o));
  out.push(box({ cx: -0.45, cy: 0.5, ha: 0.2, hb: 0.2, height: 26, roof: 'pyramid', rise: 6, mat: 'tugla', windows: 'saray', seed: 142 }, o));
  // palace chapel
  out.push(...cross(0.05, 0.75, 0.8, 11, o, 143, 1, 'kursun'));
  // terrace wall
  out.push(box({ cx: 0, cy: -0.32, ha: 0.75, hb: 0.05, height: 6, roof: 'merlon', mat: 'blaherna', windows: 'none', seed: 144 }, o));
  return out;
}

function tekfur(o: number): Prim[] {
  const out: Prim[] = [];
  // three-storey palace (Porphyrogenitus) between the walls, its long axis along the walls
  const ax = -0.45;
  const ay = 0.89;
  out.push(box({ ax, ay, ha: 0.62, hb: 0.24, height: 36, roof: 'merlon', mat: 'tugla', windows: 'saray', seed: 150 }, o));
  out.push(box({ cx: ax * 0.66 + 0.16, cy: ay * 0.66 - 0.08, ax, ay, ha: 0.15, hb: 0.17, height: 42, roof: 'merlon', mat: 'tugla', windows: 'kule', seed: 151 }, o));
  return out;
}

function galataKulesi(o: number): Prim[] {
  return [
    new Cyl({ cx: 0, cy: 0, r: 0.28, base: 0, height: 44, top: 'flat', mat: 'galata', owner: o, windows: 'kule', seed: 160 }),
    new Cyl({ cx: 0, cy: 0, r: 0.31, base: 40, height: 3, top: 'flat', mat: 'galata', owner: o, seed: 161 }),
    new Cyl({ cx: 0, cy: 0, r: 0.3, base: 43, height: 1, top: 'cone', rise: 16, mat: 'galata', roofMat: 'kiremit', owner: o, seed: 162 }),
  ];
}

function eugenius(o: number): Prim[] {
  return [
    box({ ha: 0.3, hb: 0.3, height: 30, roof: 'merlon', mat: 'deniz', windows: 'kule', seed: 170 }, o),
    box({ cx: 0.2, cy: 0.3, ha: 0.1, hb: 0.1, height: 6, roof: 'flat', mat: 'deniz', windows: 'none', seed: 171 }, o),
  ];
}

function anadoluHisari(o: number): Prim[] {
  const out: Prim[] = [];
  // Bayezid's keep (Güzelce Hisar)
  out.push(box({ ha: 0.24, hb: 0.24, height: 38, roof: 'merlon', mat: 'hisar', windows: 'kule', seed: 180 }, o));
  out.push(box({ ha: 0.12, hb: 0.12, base: 38, height: 2, roof: 'pyramid', rise: 7, mat: 'hisar', roofMat: 'ahsap', windows: 'none', seed: 181 }, o));
  // curtain enclosure (pentagon-ish)
  const pts: [number, number][] = [
    [-0.7, -0.5],
    [0.55, -0.6],
    [0.8, 0.4],
    [0.1, 0.8],
    [-0.75, 0.35],
  ];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy);
    out.push(box({ cx: (a[0] + b[0]) / 2, cy: (a[1] + b[1]) / 2, ax: dx / l, ay: dy / l, ha: l / 2, hb: 0.05, height: 12, roof: 'merlon', mat: 'hisar', windows: 'none', seed: 182 + i }, o));
    out.push(new Cyl({ cx: a[0], cy: a[1], r: 0.13, base: 0, height: 18, top: 'merlon', mat: 'hisar', owner: o, windows: 'kule', seed: 190 + i }));
  }
  return out;
}

export function valensPieces(): { prims: Prim[]; f0: number; f1: number; seg: number }[] {
  const out: { prims: Prim[]; f0: number; f1: number; seg: number }[] = [];
  let off = 0;
  for (let i = 0; i + 1 < VALENS_PTS.length; i++) {
    const a = VALENS_PTS[i];
    const b = VALENS_PTS[i + 1];
    const len = Math.hypot(b.tx - a.tx, b.ty - a.ty);
    const n = Math.ceil(len / 1.2);
    for (let k = 0; k < n; k++) {
      const f0 = k / n;
      const f1 = (k + 1) / n;
      out.push({ prims: [], f0, f1, seg: i });
      out[out.length - 1].prims.push(new Arcade({ ax: a.tx, ay: a.ty, bx: b.tx, by: b.ty, f0, f1, half: 0.09, base: 0, height: 22, owner: out.length - 1, off, mat: 'sur' }));
    }
    off += len;
  }
  return out;
}

export function cisternPrims(i: number): Prim[] {
  const c = CISTERNS[i];
  const out: Prim[] = [];
  const hw = c.w / 2;
  const hh = c.h / 2;
  const wl = (cx: number, cy: number, ha: number, hb: number, s: number) => box({ cx, cy, ha, hb, height: 5, roof: 'flat', mat: 'sur', roofMat: 'tas', windows: 'none', seed: s });
  out.push(wl(0, -hh, hw, 0.05, 1), wl(0, hh, hw, 0.05, 2), wl(-hw, 0, 0.05, hh, 3), wl(hw, 0, 0.05, hh, 4));
  // gardens planted in the dry open cistern
  out.push(
    new Slab({
      cx: 0,
      cy: 0,
      ax: 1,
      ay: 0,
      ha: hw - 0.05,
      hb: hh - 0.05,
      base: -1,
      height: 1,
      owner: 0,
      noShadow: true,
      color: (I, a, b, x, y) => {
        const row = Math.floor((a + hw) * 6) % 2 === 0;
        const plot = hash2(Math.floor((a + hw) * 2), Math.floor((b + hh) * 2), i + 7);
        if (plot < 0.3) return pick(RAMP.dirt, 2.4 + I * 2, x, y);
        return row ? pick(RAMP.grass, 3 + I * 2.5, x, y) : pick(RAMP.grass, 1.8 + I * 2, x, y);
      },
    }),
  );
  return out;
}

export const LANDMARKS: Record<string, LandmarkSpec> = {
  ayasofya: { key: 'city/ayasofya', w: 270, h: 200, ax: 140, ay: 128, build: ayasofya },
  hipodrom: { key: 'city/hipodrom', w: 210, h: 120, ax: 105, ay: 62, build: hipodrom },
  buyukSaray: { key: 'city/buyuksaray', w: 120, h: 80, ax: 60, ay: 46, build: buyukSaray },
  akropolis: { key: 'city/akropolis', w: 100, h: 90, ax: 45, ay: 58, build: akropolis },
  havariyun: { key: 'city/havariyun', w: 120, h: 100, ax: 58, ay: 64, build: havariyun },
  pantokrator: { key: 'city/pantokrator', w: 110, h: 90, ax: 55, ay: 58, build: pantokrator },
  kariye: { key: 'city/kariye', w: 80, h: 70, ax: 40, ay: 46, build: kariye },
  blahernaiSarayi: { key: 'city/blahernai', w: 120, h: 100, ax: 58, ay: 62, build: blahernai },
  tekfurSarayi: { key: 'city/tekfur', w: 100, h: 104, ax: 50, ay: 72, build: tekfur },
  galataKulesi: { key: 'city/galata-kulesi', w: 44, h: 86, ax: 22, ay: 74, build: galataKulesi, flags: [[0, -60]] },
  eugeniusKulesi: { key: 'city/eugenius', w: 60, h: 66, ax: 30, ay: 50, build: eugenius, flags: [[0, -36]] },
  anadoluHisari: { key: 'fort/anadolu-hisari', w: 110, h: 100, ax: 55, ay: 64, build: anadoluHisari, flags: [[0, -50]] },
};

/** Big landmark texture keys of the city cisterns. */
export const CISTERN_SPECS = CISTERNS.map((c, i) => ({ key: `city/sarnic-${i}`, w: Math.ceil((c.w + c.h) * 16 + 40), h: Math.ceil((c.w + c.h) * 8 + 30), i }));

export function generateCityTextures(gen: TextureGen): void {
  const sheet = (s: SheetSpec, prims: (v: number) => Prim[], glow: boolean) => {
    const cache: PixelCanvas[] = [];
    gen.sheet(s.key, s.fw, s.fh, s.n, (p, f) => {
      const cv = standalone(prims(f), s.fw, s.fh, s.ax, s.ay);
      cache[f] = cv;
      p.blit(cv, 0, 0);
    });
    if (glow) gen.sheet(s.key + '-isik', s.fw, s.fh, s.n, (p, f) => p.blit(glowLayer(prims(f), s.fw, s.fh, s.ax, s.ay), 0, 0));
  };
  sheet(SHEETS.ev, housePrims, true);
  sheet(SHEETS.evGalata, galataHousePrims, true);
  sheet(SHEETS.kilise, churchPrims, true);
  sheet(SHEETS.manastir, monasteryPrims, true);
  sheet(SHEETS.harabe, ruinPrims, false);
  sheet(SHEETS.kuyu, () => wellPrims(), false);
  for (const [id, lm] of Object.entries(LANDMARKS)) {
    gen.canvas(lm.key, lm.w, lm.h, (p) => p.blit(standalone(lm.build(0), lm.w, lm.h, lm.ax, lm.ay), 0, 0));
    if (id !== 'hipodrom' && id !== 'buyukSaray' && id !== 'akropolis') {
      gen.canvas(lm.key + '-isik', lm.w, lm.h, (p) => p.blit(glowLayer(lm.build(0), lm.w, lm.h, lm.ax, lm.ay), 0, 0));
    }
  }
  for (const c of CISTERN_SPECS) {
    gen.canvas(c.key, c.w, c.h, (p) => p.blit(standalone(cisternPrims(c.i), c.w, c.h, c.w / 2, c.h / 2 + 4), 0, 0));
  }
}

/** Valens aqueduct piece canvases rendered at runtime (needs world heights for its base). */
export function valensTile(): { tx: number; ty: number } {
  return geoToTile(41.0155, 28.9555);
}
