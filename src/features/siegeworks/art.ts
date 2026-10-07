import { P } from '../../art/palette';
import { bayer, type Color, PixelCanvas } from '../../art/pixel';
import type { TextureGen } from '../../art/texture';
import { hash2 } from '../../core/rng';

/**
 * SIEGEWORKS ART — procedural pixel art (master palette only, light from the upper-left).
 * Keys: 'siege/…'. Pure drawing code (PixelCanvas); the TextureGen registers it.
 *
 *  - figures: amele, azap, lağımcı, yeniçeri (16×20 frames, two facings, front/back views)
 *  - the great siege tower: 5 build stages × 3 charring levels, front parapet layer,
 *    wheels, drawbridge, banner, pushers inside the ground storey, wreck
 *  - mine shaft with windlass (4 frames), collapsed shaft, spoil heaps, prop logs, lantern,
 *    wicker screen, subsidence craters
 *  - moat work: fascine bundles, supply depot piles, dumped heaps
 *  - UI-world: x-ray dashes, tunnel head, wall target, selection rings, bars, icons
 */

type Ramp = readonly string[];
const O = P.outline;

function shade(p: PixelCanvas, cx: number, cy: number, rx: number, ry: number, alpha = 0.32): void {
  for (let y = -ry; y <= ry; y++)
    for (let x = -rx; x <= rx; x++) {
      const d = (x * x) / (rx * rx) + (y * y) / (ry * ry);
      if (d > 1) continue;
      const a = d > 0.6 ? alpha * 0.55 : alpha;
      if (d > 0.6 && bayer(cx + x, cy + y) > 0.5) continue;
      p.set(cx + x, cy + y, O[0], a);
    }
}

// ═════════════════════════════ FIGURES ═════════════════════════════

export const FIG_W = 16;
export const FIG_H = 20;
/** Foot row inside a figure frame (sprite origin y = FIG_FOOT / FIG_H). */
export const FIG_FOOT = 18;
export const FIG = {
  walkF: 0,
  walkB: 4,
  bundleF: 8,
  bundleB: 12,
  basketF: 16,
  basketB: 20,
  dump: 24,
  dig: 27,
  push: 31,
  bow: 35,
  torchF: 39,
  torchB: 43,
  idle: 47,
  crank: 49,
} as const;
export const FIG_N = 51;
export const FIG_VARIANTS = ['amele', 'azap', 'lagimci', 'yeniceri'] as const;
export type FigVariant = (typeof FIG_VARIANTS)[number];

/** Frame index for (base + k) with facing f (+1 = screen-right). */
export function figFrame(base: number, k: number, f: 1 | -1): number {
  return base + k + (f < 0 ? FIG_N : 0);
}

interface Look {
  coat: [string, string, string]; // dark, mid, light
  legs: string;
  sash: [string, string];
  head: 'takke' | 'sarik' | 'bork' | 'kece';
  headCol: [string, string, string];
  apron?: boolean;
  beard?: string;
  dusty?: boolean;
}

const LOOKS: Record<FigVariant, Look> = {
  // linen-shirted labourers (amele) — light cloth reads well against earth and grass
  amele: { coat: [P.cloth[2], P.cloth[3], P.cloth[4]], legs: P.dirt[2], sash: [P.red[4], P.red[3]], head: 'takke', headCol: [P.cloth[3], P.cloth[4], P.cloth[5]], beard: P.dirt[1], dusty: true },
  azap: { coat: [P.red[2], P.red[3], P.red[4]], legs: P.blue[1], sash: [P.green[3], P.green[2]], head: 'sarik', headCol: [P.turban[0], P.turban[1], P.turban[2]], beard: P.outline[2] },
  lagimci: { coat: [P.green[1], P.green[2], P.green[3]], legs: P.dirt[1], sash: [P.wood[3], P.wood[2]], head: 'kece', headCol: [P.wood[2], P.wood[3], P.wood[4]], apron: true, beard: P.dirt[1], dusty: true },
  yeniceri: { coat: [P.blue[1], P.blue[2], P.blue[3]], legs: P.cloth[1], sash: [P.red[4], P.red[3]], head: 'bork', headCol: [P.cloth[3], P.cloth[4], P.cloth[5]], beard: P.outline[2] },
};

type Legs = 's' | 'w0' | 'w1' | 'w2' | 'w3' | 'p0' | 'p1' | 'wide';
type Carry = 'bundle' | 'basket' | null;
type Tool = 'pick' | 'bow0' | 'bow1' | 'bow2' | 'bow3' | 'torch' | 'crank' | 'held-bundle' | 'thrown-bundle' | null;

interface Pose {
  view: 'f' | 'b';
  legs: Legs;
  bob?: number;
  lean?: number;
  /** Front-arm hand offset (facing-relative x, y) from its shoulder. */
  fa: [number, number];
  /** Rear-arm hand offset from its shoulder. */
  ra: [number, number];
  carry?: Carry;
  tool?: Tool;
  headDy?: number;
}

const WALK: Legs[] = ['w0', 'w1', 'w2', 'w3'];

function poseOf(frame: number): Pose {
  const k4 = (b: number) => frame - b;
  const bobW = (i: number) => (i % 2 === 1 ? -1 : 0);
  const swing = (i: number): [number, number] => [i === 1 ? 1 : i === 3 ? -1 : 0, 5];
  const swingR = (i: number): [number, number] => [i === 1 ? -1 : i === 3 ? 1 : 0, 5];
  if (frame < FIG.walkB) {
    const i = k4(FIG.walkF);
    return { view: 'f', legs: WALK[i], bob: bobW(i), fa: swing(i), ra: swingR(i) };
  }
  if (frame < FIG.bundleF) {
    const i = k4(FIG.walkB);
    return { view: 'b', legs: WALK[i], bob: bobW(i), fa: swing(i), ra: swingR(i) };
  }
  if (frame < FIG.bundleB) {
    const i = k4(FIG.bundleF);
    return { view: 'f', legs: WALK[i], bob: bobW(i) + 1, fa: [0, -2], ra: [0, -2], carry: 'bundle' };
  }
  if (frame < FIG.basketF) {
    const i = k4(FIG.bundleB);
    return { view: 'b', legs: WALK[i], bob: bobW(i) + 1, fa: [0, -2], ra: [0, -2], carry: 'bundle' };
  }
  if (frame < FIG.basketB) {
    const i = k4(FIG.basketF);
    return { view: 'f', legs: WALK[i], bob: bobW(i), fa: [0, 1], ra: [0, 1], carry: 'basket', lean: 0 };
  }
  if (frame < FIG.dump) {
    const i = k4(FIG.basketB);
    return { view: 'b', legs: WALK[i], bob: bobW(i), fa: [0, 1], ra: [0, 1], carry: 'basket' };
  }
  if (frame < FIG.dig) {
    const i = k4(FIG.dump);
    if (i === 0) return { view: 'f', legs: 's', fa: [0, -6], ra: [1, -6], tool: 'held-bundle', headDy: 0 };
    if (i === 1) return { view: 'f', legs: 'wide', bob: 1, lean: 1, fa: [3, 0], ra: [3, 0], tool: 'held-bundle' };
    return { view: 'f', legs: 'wide', bob: 1, lean: 1, fa: [3, 3], ra: [2, 3], tool: 'thrown-bundle' };
  }
  if (frame < FIG.push) {
    const i = k4(FIG.dig);
    const fa: [number, number][] = [
      [-2, -4],
      [0, -6],
      [3, 3],
      [2, 1],
    ];
    return { view: 'f', legs: 'wide', bob: i === 2 ? 1 : 0, lean: i === 2 ? 1 : 0, fa: fa[i], ra: [fa[i][0] - 1, fa[i][1] + 1], tool: 'pick' };
  }
  if (frame < FIG.bow) {
    const i = k4(FIG.push);
    return { view: 'f', legs: i % 2 ? 'p1' : 'p0', bob: 1 + (i === 1 ? 1 : 0), lean: 1, fa: [3, 1], ra: [4, 1] };
  }
  if (frame < FIG.torchF) {
    const i = k4(FIG.bow);
    const ra: [number, number][] = [
      [1, 4],
      [2, -1],
      [-1, -2],
      [-2, -2],
    ];
    const fa: [number, number][] = [
      [2, 4],
      [3, -1],
      [3, -1],
      [3, -1],
    ];
    return { view: 'f', legs: 'wide', fa: fa[i], ra: ra[i], tool: (['bow0', 'bow1', 'bow2', 'bow3'] as const)[i] };
  }
  if (frame < FIG.torchB) {
    const i = k4(FIG.torchF);
    return { view: 'f', legs: WALK[i], bob: bobW(i), fa: [1, -5], ra: swingR(i), tool: 'torch' };
  }
  if (frame < FIG.idle) {
    const i = k4(FIG.torchB);
    return { view: 'b', legs: WALK[i], bob: bobW(i), fa: [1, -5], ra: swingR(i), tool: 'torch' };
  }
  if (frame < FIG.crank) {
    const i = k4(FIG.idle);
    return { view: 'f', legs: 's', fa: [0, 5], ra: [0, 5], headDy: i };
  }
  const i = k4(FIG.crank);
  return { view: 'f', legs: 'wide', bob: i, lean: 1, fa: [3, i ? 3 : 0], ra: [3, i ? 3 : 0], tool: 'crank' };
}

function lit3(c: [string, string, string], dx: number): string {
  return dx <= -1 ? c[2] : dx >= 1 ? c[0] : c[1];
}

function drawBundle(p: PixelCanvas, x0: number, y0: number, len: number, seed: number): void {
  // brushwood fascine bundle lying across: twigs, two cords
  for (let i = 0; i < len; i++) {
    for (let j = 0; j < 3; j++) {
      const h = hash2(i + seed, j, 77);
      const c = j === 0 ? (h > 0.5 ? P.dryGrass[4] : P.wood[6]) : j === 1 ? (h > 0.4 ? P.wood[5] : P.dryGrass[3]) : h > 0.5 ? P.wood[3] : P.foliage[3];
      p.set(x0 + i, y0 + j, c);
    }
  }
  // twig ends sticking out
  p.set(x0 - 1, y0, P.wood[5]);
  p.set(x0 - 1, y0 + 2, P.wood[4]);
  p.set(x0 + len, y0 + 1, P.wood[4]);
  p.set(x0 + len, y0 - 1 + 0, P.dryGrass[4]);
  // cords
  const c1 = x0 + Math.floor(len * 0.3);
  const c2 = x0 + Math.floor(len * 0.72);
  for (let j = 0; j < 3; j++) {
    p.set(c1, y0 + j, P.sand[1]);
    p.set(c2, y0 + j, P.sand[1]);
  }
}

function drawFig(p: PixelCanvas, look: Look, ps: Pose, f: 1 | -1, frame: number): void {
  const cx = 8;
  const foot = FIG_FOOT;
  const b = ps.bob ?? 0;
  const lean = (ps.lean ?? 0) * f;
  shade(p, cx + 1, foot, 4, 1, 0.3);
  const shY = foot - 9 + b;
  const skirtTop = foot - 5 + b;
  const skirtBot = foot - 3;
  const hy = foot - 12 + b + (ps.headDy ?? 0) * 0;
  const hx = cx + lean;
  const C = look.coat;

  // ── carried basket / bundle BEHIND (front view) ──
  if (ps.view === 'f' && ps.carry === 'bundle') drawBundle(p, cx - 6, shY - 3, 12, frame);
  if (ps.view === 'f' && ps.carry === 'basket') {
    for (let dx = -3; dx <= 3; dx++) {
      p.set(cx + dx, shY - 2, dx % 2 ? P.wood[4] : P.wood[5]);
      p.set(cx + dx, shY - 1, dx % 2 ? P.wood[3] : P.wood[4]);
    }
    for (let dx = -2; dx <= 2; dx++) p.set(cx + dx, shY - 3, dx < 0 ? P.dirt[4] : P.dirt[3]);
    p.set(cx - 1, shY - 4, P.dirt[5]);
    p.set(cx, shY - 4, P.dirt[4]);
  }

  // ── legs ──
  const legs: [number, number, number][] = [];
  switch (ps.legs) {
    case 's':
    case 'w0':
    case 'w2':
      legs.push([cx - 1, foot - 3, foot], [cx + 1, foot - 3, foot]);
      break;
    case 'w1':
      legs.push([cx - 1, foot - 3, foot], [cx + 1, foot - 3, foot - 1]);
      break;
    case 'w3':
      legs.push([cx - 1, foot - 3, foot - 1], [cx + 1, foot - 3, foot]);
      break;
    case 'wide':
      legs.push([cx - 2, foot - 3, foot], [cx + 2, foot - 3, foot]);
      break;
    case 'p0':
      legs.push([cx - 2 * f, foot - 3, foot], [cx + f, foot - 3, foot]);
      p.set(cx - 3 * f, foot, look.legs);
      break;
    case 'p1':
      legs.push([cx - f, foot - 3, foot], [cx + 2 * f, foot - 3, foot]);
      p.set(cx - 2 * f, foot, look.legs);
      break;
  }
  for (const [x, y0, y1] of legs) for (let y = y0; y <= y1; y++) p.set(x, y, y === y1 ? O[2] : look.legs);

  // ── rear arm (behind the torso) ──
  const rsx = cx - 3 * f + lean;
  const rhx = rsx + ps.ra[0] * f;
  const rhy = shY + 1 + ps.ra[1];
  p.line(rsx, shY + 1, rhx, rhy, C[0]);
  p.set(rhx, rhy, P.skin[2]);

  // ── skirt + torso ──
  for (let y = skirtTop; y <= skirtBot; y++) {
    const flare = y === skirtBot ? 1 : 0;
    for (let dx = -2 - flare; dx <= 2 + flare; dx++) p.set(cx + dx, y, lit3(C, dx));
  }
  for (let y = shY; y < skirtTop; y++) {
    const sh = y < shY + 2 ? lean : 0;
    for (let dx = -2; dx <= 2; dx++) p.set(cx + dx + sh, y, lit3(C, dx));
    if (ps.view === 'f') p.set(cx + f + sh, y, C[0]); // kaftan opening
  }
  if (ps.view === 'f') for (let y = skirtTop; y <= skirtBot; y++) p.set(cx + f, y, C[0]);
  if (look.apron && ps.view === 'f')
    for (let y = skirtTop - 1; y <= skirtBot; y++) {
      p.set(cx, y, P.wood[4]);
      p.set(cx - 1, y, P.wood[5]);
      p.set(cx + 1, y, P.wood[3]);
    }
  for (let dx = -2; dx <= 2; dx++) p.set(cx + dx, skirtTop - 1, dx < 0 ? look.sash[0] : look.sash[1]);
  if (look.dusty) {
    p.set(cx - 2, skirtBot, P.sand[2]);
    p.set(cx + 2, skirtBot - 1, P.dirt[2]);
  }

  // ── head ──
  if (ps.view === 'f') {
    for (let dy = 0; dy < 3; dy++) for (let dx = -1; dx <= 1; dx++) p.set(hx + dx, hy + dy, dx === -1 ? P.skin[4] : dx === 1 ? P.skin[2] : P.skin[3]);
    p.set(hx + f, hy + 1, O[0]);
    if (look.beard) {
      p.set(hx, hy + 2, look.beard);
      p.set(hx + f, hy + 2, look.beard);
    }
  } else {
    for (let dy = 0; dy < 3; dy++) for (let dx = -1; dx <= 1; dx++) p.set(hx + dx, hy + dy, dy === 2 ? P.skin[2] : dx < 0 ? P.dirt[2] : O[2]);
    p.set(hx - f, hy + 1, P.skin[3]);
  }
  const H = look.headCol;
  switch (look.head) {
    case 'takke':
      for (let dx = -1; dx <= 1; dx++) p.set(hx + dx, hy - 1, dx < 0 ? H[2] : dx > 0 ? H[0] : H[1]);
      p.set(hx, hy - 2, H[1]);
      break;
    case 'sarik':
      for (let dx = -2; dx <= 2; dx++) p.set(hx + dx, hy - 1, dx < 0 ? H[2] : dx > 0 ? H[0] : H[1]);
      for (let dx = -1; dx <= 1; dx++) p.set(hx + dx, hy - 2, dx < 0 ? H[2] : H[1]);
      p.set(hx, hy - 3, H[2]);
      p.set(hx - 1, hy, H[1]);
      break;
    case 'kece':
      for (let dx = -2; dx <= 2; dx++) p.set(hx + dx, hy - 1, dx < 0 ? H[2] : H[1]);
      for (let dx = -1; dx <= 1; dx++) p.set(hx + dx, hy - 2, dx < 0 ? H[2] : H[0]);
      p.set(hx, hy - 3, H[1]);
      break;
    case 'bork':
      for (let dx = -1; dx <= 1; dx++) p.set(hx + dx, hy - 1, dx < 0 ? H[2] : H[1]);
      for (let k = 2; k <= 5; k++) p.set(hx - (k > 3 ? f : 0), hy - k, k % 2 ? H[1] : H[2]);
      p.set(hx - 2 * f, hy - 4, H[1]);
      p.set(hx - 2 * f, hy - 3, H[0]);
      p.set(hx - 2 * f, hy - 2, H[0]);
      p.set(hx, hy - 1, P.gold[4]);
      break;
  }

  // ── carried items IN FRONT (back view) ──
  if (ps.view === 'b' && ps.carry === 'bundle') drawBundle(p, cx - 6, shY - 2, 12, frame);
  if (ps.view === 'b' && ps.carry === 'basket') {
    for (let y = shY - 1; y <= skirtTop; y++)
      for (let dx = -3; dx <= 3; dx++) {
        const weave = (dx + y) % 2 === 0;
        p.set(cx + dx, y, dx < -1 ? (weave ? P.wood[6] : P.wood[5]) : dx > 1 ? (weave ? P.wood[3] : P.wood[4]) : weave ? P.wood[5] : P.wood[4]);
      }
    for (let dx = -3; dx <= 3; dx++) p.set(cx + dx, shY - 2, dx < 0 ? P.dirt[4] : P.dirt[3]);
    for (let dx = -2; dx <= 1; dx++) p.set(cx + dx, shY - 3, dx < 0 ? P.dirt[5] : P.dirt[4]);
    p.set(cx - 3, skirtTop, P.wood[2]);
    p.set(cx + 3, skirtTop, P.wood[2]);
  }

  // ── front arm + tool ──
  const fsx = cx + 3 * f + lean;
  const fhx = fsx + ps.fa[0] * f;
  const fhy = shY + 1 + ps.fa[1];
  const tool = ps.tool ?? null;
  if (tool === 'pick') {
    // handle from the hands up/forward, iron head
    const tx = fhx + (ps.fa[1] < -2 ? -f : 2 * f);
    const ty = fhy + (ps.fa[1] < -2 ? -3 : 3);
    p.line(fhx, fhy, tx, ty, P.wood[5]);
    p.set(tx - f, ty - 1, P.steel[4]);
    p.set(tx, ty, P.steel[3]);
    p.set(tx + f, ty + 1, P.steel[2]);
  } else if (tool === 'torch') {
    p.line(fhx, fhy, fhx, fhy - 3, P.wood[3]);
    const fl = frame % 4;
    p.set(fhx, fhy - 4, P.fire[5]);
    p.set(fhx, fhy - 5, fl % 2 ? P.fire[6] : P.fire[4]);
    p.set(fhx + (fl === 1 ? 1 : fl === 3 ? -1 : 0), fhy - 6, P.fire[3]);
    p.set(fhx - 1, fhy - 4, P.fire[4]);
    p.set(fhx + 1, fhy - 4, P.fire[3]);
  } else if (tool === 'crank') {
    p.set(fhx + f, fhy, P.wood[4]);
    p.set(fhx + 2 * f, fhy, P.wood[3]);
  } else if (tool === 'held-bundle') {
    drawBundle(p, fhx - 5, fhy - 2, 10, frame);
  } else if (tool === 'thrown-bundle') {
    drawBundle(p, fhx - 3 + 2 * f, fhy + 1, 9, frame);
  } else if (tool && tool.startsWith('bow')) {
    // composite Turkish bow held toward the facing side
    const bx = fhx + f;
    const drawn = tool === 'bow2';
    const top = fhy - 4;
    const bot = fhy + 3;
    const curve = [0, 1, 1, 2, 2, 1, 1, 0];
    for (let k = 0; k < 8; k++) p.set(bx + f * curve[k], top + k, k === 0 || k === 7 ? P.wood[2] : P.wood[4]);
    p.set(bx - f, top - 1, P.wood[3]);
    p.set(bx - f, bot + 1, P.wood[3]);
    if (drawn) {
      p.line(bx, top, rhx, rhy, P.cloth[4], 0.9);
      p.line(bx, bot, rhx, rhy, P.cloth[4], 0.9);
      p.line(rhx, rhy, bx + 2 * f, fhy, P.wood[6]);
      p.set(bx + 3 * f, fhy, P.steel[5]);
    } else {
      for (let y = top; y <= bot; y++) p.set(bx - (tool === 'bow3' ? 0 : 0), y, P.cloth[3], 0.85);
      if (tool === 'bow1') p.line(bx, fhy, bx + 3 * f, fhy, P.wood[6]);
    }
  }
  p.line(fsx, shY + 1, fhx, fhy, ps.fa[1] < 0 ? C[1] : C[2]);
  p.set(fhx, fhy, P.skin[4]);
  if (tool === 'crank' || ps.legs === 'p0' || ps.legs === 'p1') p.set(rhx, rhy, P.skin[3]);
  p.outline(O[1]);
  // re-light flames after the outline
  if (tool === 'torch') p.set(fhx, fhy - 5, frame % 2 ? P.fire[7] : P.fire[6]);
}

function genFigures(gen: TextureGen): void {
  for (const v of FIG_VARIANTS) {
    const look = LOOKS[v];
    gen.sheet(`siege/adam-${v}`, FIG_W, FIG_H, FIG_N * 2, (p, i) => {
      const f: 1 | -1 = i < FIG_N ? 1 : -1;
      const fr = i % FIG_N;
      drawFig(p, look, poseOf(fr), f, fr);
    });
  }
}

// ═════════════════════════════ SIEGE TOWER ═════════════════════════════

/** Tower canvas size & anchor (footprint centre on the ground). */
export const TOWER_W = 72;
export const TOWER_H = 118;
const TA = 1.5; // footprint in tiles (both axes)
const TN = { x: 36, y: 88 }; // north vertex at ground
export const TOWER_ANCHOR = { x: 36, y: TN.y + TA * 8 }; // footprint centre
const TL = { x: TN.x - TA * 16, y: TN.y + TA * 8 };
const TB = { x: TN.x, y: TN.y + TA * 16 };
const TR = { x: TN.x + TA * 16, y: TN.y + TA * 8 };
/** Body height (px), storey lines. */
export const TOWER_BODY = 60;
const STOREYS = [0, 20, 40, 60];
const U_FACE = TA * 16; // 24 px across each visible face

/** Screen position of a point on the LEFT face (u from the left vertex, z up). */
function leftFace(u: number, z: number): { x: number; y: number } {
  return { x: TL.x + u, y: TL.y + Math.floor(u / 2) - z };
}
/** Screen position of a point on the RIGHT face (u from the bottom vertex). */
function rightFace(u: number, z: number): { x: number; y: number } {
  return { x: TB.x + u, y: TB.y - Math.floor(u / 2) - z };
}

/** Exported anchor points (relative to the canvas) for the render. */
export const TOWER_PTS = {
  /** Left-face wheel centres (rear, front). */
  wheels: [leftFace(5, 7), leftFace(18, 7)],
  /** Drawbridge hinge (bottom-left corner of the top-storey door on the right face). */
  bridge: rightFace(6, STOREYS[2] + 2),
  /** Archer foot positions on the top platform. */
  archers: [
    { x: TN.x - 9, y: TN.y + 13 - TOWER_BODY },
    { x: TN.x + 3, y: TN.y + 17 - TOWER_BODY },
    { x: TN.x + 12, y: TN.y + 12 - TOWER_BODY },
  ],
  banner: { x: TN.x, y: TN.y - TOWER_BODY - 10 },
  /** Fire anchor points (low → high). */
  fires: [leftFace(10, 10), rightFace(12, 16), leftFace(16, 30), rightFace(8, 38), leftFace(8, 50), { x: TN.x, y: TN.y + 10 - TOWER_BODY }],
  top: { x: TN.x, y: TN.y + 12 - TOWER_BODY },
};


interface TowerOpts {
  /** 0..4 (4 = complete) */
  stage: number;
  /** 0 = intact, 1 = scorched, 2 = burnt skeleton */
  char: number;
}

function charCol(c: string, char: number, x: number, y: number, zf = 0.5): string | null {
  if (char <= 0) return c;
  if (char === 1) {
    // scorched from below: blackened lower part, a glowing burn line, intact top
    const n = hash2(x >> 2, y >> 3, 5);
    const edge = 0.42 + n * 0.22;
    const h = hash2(x, y, 6);
    if (zf < edge - 0.05) return h < 0.55 ? P.smoke[0] : h < 0.93 ? P.smoke[1] : P.fire[2];
    if (zf < edge) return h < 0.5 ? P.fire[3] : h < 0.8 ? P.fire[4] : P.smoke[1];
    if (zf < edge + 0.06 && h < 0.4) return P.wood[1];
    return c;
  }
  const h = hash2(x, y, 9);
  if (h < 0.012) return P.fire[4];
  return h < 0.55 ? P.smoke[0] : P.outline[2];
}

/** Ox-hide colour sets (dark → light). */
const HIDES: Ramp[] = [
  [P.dirt[1], P.dirt[2], P.dirt[3], P.dirt[4], P.dirt[5]],
  [P.brick[0], P.brick[1], P.brick[2], P.wood[4], P.wood[5]],
  [P.wood[2], P.wood[3], P.wood[4], P.sand[1], P.sand[2]],
  [P.outline[2], P.dirt[1], P.dirt[2], P.dirt[3], P.wood[4]],
  [P.dirt[2], P.wood[3], P.dirt[4], P.sand[1], P.sand[3]],
];

/** Colour of an ox hide at (u, z) of a face, or null where the frame shows through. */
function hideAt(side: 'L' | 'R', u: number, z: number, x: number, y: number): string | null {
  // bays between the posts (u 2..10 and 13..21); each storey has two hides stacked
  const bay = u < 11 ? 0 : 1;
  const u0 = bay === 0 ? 2 : 13;
  const wd = 9;
  const w = u - u0;
  if (w < 0 || w >= wd) return null;
  const st = STOREYS.findIndex((s, i) => i < 3 && z > s && z < STOREYS[i + 1] - 1);
  if (st < 0) return null;
  const zTop = STOREYS[st + 1] - 2;
  const zBot = STOREYS[st] + 1;
  const half = Math.floor((zTop - zBot) / 2);
  const upper = z > zBot + half;
  const hTop = upper ? zTop : zBot + half + 1;
  const hBot = upper ? zBot + half - 1 : zBot;
  const v = hTop - z; // 0 at the top edge, grows downward
  const H = hTop - hBot;
  const id = (st * 4 + bay * 2 + (upper ? 1 : 0)) * 7 + (side === 'L' ? 0 : 3);
  // ragged bottom edge (the upper hide hangs over the lower one)
  const rag = Math.round(hash2(w, id, 17) * 1.6);
  if (v > H + rag) return null;
  const ramp = HIDES[Math.floor(hash2(id, 2, 23) * HIDES.length)];
  const k = side === 'L' ? 1 : -1;
  let i = k + 2;
  // light from the upper-left: top-left of each hide brighter, edges darker
  if (side === 'L' && v < 3 && w < 5) i += 1;
  if (w === 0 || w === wd - 1) i -= 2;
  if (v >= H + rag - 1) i -= 2; // curled bottom edge + cast shadow on the hide below
  if (v === 0) i = k + 3; // nailed top edge
  // hair texture & wet sheen
  const hh = hash2(x, y, id);
  if (hh > 0.86) i -= 1;
  else if (hh < 0.06) i += 1;
  if (side === 'L' && w > 1 && w < 5 && v > 1 && v < 5 && bayer(x, y) > 0.35) i += 1; // wet sheen
  // drips running down (wet hides)
  if (hash2(w, id, 29) > 0.8 && v > 2) i -= 1;
  // nails along the top
  if (v === 0 && w % 3 === 1) return P.steel[side === 'L' ? 4 : 2];
  // lacing where two hides meet
  if ((w === 0 || w === wd - 1) && v % 4 === 2) return P.sand[side === 'L' ? 2 : 0];
  return ramp[Math.max(0, Math.min(ramp.length - 1, i))];
}

/** Timber frame + hides on one face. side 'L' lit, 'R' shaded (front, faces the wall). */
function towerFace(p: PixelCanvas, side: 'L' | 'R', o: TowerOpts, layer: 'body' | 'parapet'): void {
  const builtFrame = o.stage >= 4 ? TOWER_BODY : ((o.stage + 1) / 4) * TOWER_BODY;
  const builtHide = o.stage >= 4 ? TOWER_BODY : (o.stage / 4) * TOWER_BODY - 4;
  const shadeK = side === 'L' ? 0 : -2;
  const W = P.wood;
  const zMin = layer === 'body' ? 0 : TOWER_BODY;
  const zMax = layer === 'body' ? TOWER_BODY : TOWER_BODY + 8;
  for (let u = 0; u < U_FACE; u++) {
    for (let z = zMin; z < zMax; z++) {
      const pt = side === 'L' ? leftFace(u, z) : rightFace(u, z);
      let c: string | null = null;
      if (layer === 'parapet') {
        if (o.stage < 4) continue;
        // wicker hoarding with crenels
        const zz = z - TOWER_BODY;
        const cren = zz >= 5 && Math.floor(u / 4) % 2 === 1;
        if (cren) continue;
        if (zz === 0 || zz === 1) c = W[Math.max(1, 3 + shadeK)];
        else if (u === 0 || u === U_FACE - 1) c = W[Math.max(1, 4 + shadeK)];
        else {
          const weave = (u + (zz >> 1)) % 3 === 0;
          c = weave ? W[Math.max(1, 4 + shadeK)] : P.dryGrass[Math.max(0, 3 + shadeK)];
          if (zz === 7 || (zz === 4 && Math.floor(u / 4) % 2 === 1)) c = P.dryGrass[Math.max(0, 4 + shadeK)];
        }
        if (side === 'L' && u === 0) c = W[6];
        const cc = charCol(c, o.char, pt.x, pt.y, 1);
        if (cc) p.set(pt.x, pt.y, cc);
        continue;
      }
      const post = u <= 1 || u >= U_FACE - 2 || u === 12 || u === 11;
      const beam = STOREYS.some((s) => z >= s - 1 && z <= s) || z === 0;
      const frameHere = z < builtFrame;
      // ground storey on the front face is open (men inside push the tower)
      const openFront = side === 'R' && z >= 2 && z < STOREYS[1] - 1 && u >= 3 && u <= U_FACE - 4 && !(u === 11 || u === 12);
      if (!frameHere) continue;
      if (post || beam) {
        const lightU = side === 'L' && (u === 0 || u === 11) ? 1 : 0;
        c = W[Math.max(1, 4 + shadeK + lightU - (beam && !post ? 0 : 0))];
        if (beam && z === STOREYS.find((s) => z >= s - 1 && z <= s)) c = W[Math.max(1, 5 + shadeK)];
        if (post && u === U_FACE - 1) c = W[Math.max(1, 3 + shadeK)];
      } else if (openFront) {
        c = (z + u) % 7 === 0 ? P.outline[2] : P.outline[1];
        if (z < 4) c = P.dirt[1];
      } else if (z < builtHide && o.char < 2 && hideAt(side, u, z, pt.x, pt.y)) {
        // arrow slits through the hides
        const slit = (u === 6 || u === 17) && ((z >= STOREYS[1] + 7 && z <= STOREYS[1] + 9) || (z >= STOREYS[2] + 6 && z <= STOREYS[2] + 8));
        if (slit && !(side === 'R' && z > STOREYS[2])) c = z === STOREYS[1] + 9 || z === STOREYS[2] + 8 ? P.wood[side === 'L' ? 5 : 3] : P.outline[0];
        else c = hideAt(side, u, z, pt.x, pt.y);
      } else if (z < builtFrame) {
        // diagonal braces visible where the hides are not yet nailed (or have burned away)
        const zs = STOREYS.reduce((a, s) => (z >= s ? s : a), 0);
        const local = z - zs;
        const brace = Math.abs((u % 12) - local * 0.6) < 0.8 || Math.abs(11 - (u % 12) - local * 0.6) < 0.8;
        if (brace) c = W[Math.max(1, 3 + shadeK)];
        else continue;
      }
      if (!c) continue;
      const cc = charCol(c, o.char, pt.x, pt.y, z / TOWER_BODY);
      if (cc) p.set(pt.x, pt.y, cc);
    }
  }
}

function towerTop(p: PixelCanvas, o: TowerOpts): void {
  if (o.stage < 4) return;
  const z = TOWER_BODY;
  // platform floor (planks along the iso axis)
  const n = { x: TN.x, y: TN.y - z };
  const pts: [number, number][] = [
    [n.x, n.y],
    [TR.x, TR.y - z],
    [TB.x, TB.y - z],
    [TL.x, TL.y - z],
  ];
  p.poly(pts, P.wood[5]);
  for (let y = n.y; y < TB.y - z; y++)
    for (let x = TL.x; x <= TR.x; x++) {
      if (p.alphaAt(x, y) === 0) continue;
      const k = Math.floor((x * 0.5 + y) / 3);
      const c = hash2(k, 0, 51) > 0.7 ? P.wood[5] : P.wood[4];
      if (Math.floor(x * 0.5 + y) % 3 === 0) p.set(x, y, P.wood[3]);
      else p.set(x, y, c);
      const cc = charCol(p.get(x, y)[3] ? c : c, o.char, x, y);
      if (cc && o.char) p.set(x, y, cc);
    }
  // back parapet (inner faces, darker), with crenels
  for (let u = 0; u <= U_FACE; u++) {
    for (let zz = 0; zz < 8; zz++) {
      const cren = zz >= 5 && Math.floor(u / 4) % 2 === 1;
      if (cren) continue;
      // north-west inner face (from left vertex to north vertex)
      const a = { x: TL.x + u, y: TL.y - z - Math.floor(u / 2) - zz };
      const b = { x: TN.x + u, y: TN.y - z + Math.floor(u / 2) - zz };
      const c1 = zz === 7 ? P.dryGrass[3] : (u + zz) % 3 === 0 ? P.wood[3] : P.dryGrass[2];
      const c2 = zz === 7 ? P.dryGrass[2] : (u + zz) % 3 === 0 ? P.wood[2] : P.dryGrass[1];
      const k1 = charCol(c1, o.char, a.x, a.y);
      const k2 = charCol(c2, o.char, b.x, b.y);
      if (k1) p.set(a.x, a.y, k1);
      if (k2) p.set(b.x, b.y, k2);
    }
  }
  // banner pole at the back corner
  if (o.char < 2) for (let y = 0; y < 18; y++) p.set(TN.x, TN.y - z - 8 - y, y > 15 ? P.gold[4] : P.wood[3]);
}

function towerWheelsFront(p: PixelCanvas, o: TowerOpts): void {
  // wheel edges on the shaded front face corners
  for (const u of [1, U_FACE - 3]) {
    for (let z = -1; z < 13; z++) {
      const pt = rightFace(u, z);
      p.set(pt.x, pt.y, z < 1 || z > 11 ? P.steel[1] : o.char ? P.smoke[0] : P.wood[2]);
      p.set(pt.x + 1, pt.y, z < 1 || z > 11 ? P.steel[2] : o.char ? P.smoke[1] : P.wood[3]);
    }
  }
}

function drawTower(p: PixelCanvas, o: TowerOpts): void {
  // contact shadow + cast shadow to the lower right
  for (let y = TN.y - 2; y < TB.y + 8; y++)
    for (let x = TL.x - 2; x < TR.x + 18; x++) {
      const dx = x - (TN.x + 8);
      const dy = y - (TN.y + 15);
      if (Math.abs(dx) / 30 + Math.abs(dy) / 12 > 1) continue;
      if (bayer(x, y) > 0.75 && Math.abs(dx) / 30 + Math.abs(dy) / 12 > 0.8) continue;
      p.set(x, y, O[0], 0.3);
    }
  if (o.stage < 1) {
    // ground beams, wheels-axle sledge and lumber
    for (let u = 0; u < U_FACE; u++) {
      for (const [face, k] of [
        ['L', 0],
        ['R', -2],
      ] as const) {
        for (let z = 0; z < 4; z++) {
          const pt = face === 'L' ? leftFace(u, z) : rightFace(u, z);
          p.set(pt.x, pt.y, P.wood[Math.max(1, (z === 3 ? 5 : 4) + k)]);
        }
      }
    }
  }
  towerFace(p, 'L', o, 'body');
  towerFace(p, 'R', o, 'body');
  if (o.stage >= 4) towerTop(p, o);
  towerWheelsFront(p, o);
  // storey beams protrude past the corners
  for (const st of STOREYS.slice(1)) {
    if (st > ((o.stage + 1) / 4) * TOWER_BODY + 1) break;
    for (const du of [-1, -2]) {
      const a = leftFace(du, st);
      p.set(a.x, a.y, o.char ? P.smoke[1] : du === -2 ? P.wood[6] : P.wood[5]);
      p.set(a.x, a.y + 1, o.char ? P.smoke[0] : P.wood[3]);
    }
    for (const du of [U_FACE, U_FACE + 1]) {
      const a = rightFace(du, st);
      p.set(a.x, a.y, o.char ? P.smoke[0] : P.wood[3]);
      p.set(a.x, a.y + 1, o.char ? P.smoke[0] : P.wood[2]);
    }
  }
  // scaffolding & ladders while building
  if (o.stage < 4) {
    const h = ((o.stage + 1) / 4) * TOWER_BODY;
    for (let y = 0; y < h + 6; y++) {
      p.set(TL.x - 3, TL.y - y, y % 6 === 0 ? P.wood[5] : P.wood[3]);
      p.set(TR.x + 3, TR.y - y, y % 6 === 0 ? P.wood[4] : P.wood[2]);
    }
    for (let y = 4; y < h + 2; y += 6) {
      p.line(TL.x - 3, TL.y - y, TL.x + 2, TL.y - y + 2, P.wood[5]);
      p.line(TR.x + 3, TR.y - y, TR.x - 2, TR.y - y + 2, P.wood[3]);
    }
  }
  p.outline(O[1]);
}

function drawTowerFront(p: PixelCanvas, o: TowerOpts): void {
  towerFace(p, 'L', o, 'parapet');
  towerFace(p, 'R', o, 'parapet');
  // corner post highlight
  for (let zz = 0; zz < 8; zz++) {
    const a = leftFace(U_FACE - 1, TOWER_BODY + zz);
    p.set(a.x, a.y, P.wood[o.char ? 1 : 6]);
  }
  p.outline(O[1]);
}

export const WHEEL = { w: 14, h: 18 };
function drawWheel(p: PixelCanvas, frame: number, char: number): void {
  // solid plank wheel with iron tyre, projected on the left (iso) face plane
  const cx = 7;
  const cy = 8;
  const r = 6.6;
  const ang = (frame / 4) * (Math.PI / 2);
  for (let y = 0; y < WHEEL.h; y++)
    for (let x = 0; x < WHEEL.w; x++) {
      const u = (x - cx) / 0.9;
      const v = u * 0.5 - (y - cy);
      const d = Math.hypot(u, v);
      if (d > r) continue;
      let c: string;
      if (d > r - 1.2) c = u < 0 ? P.steel[3] : P.steel[2];
      else {
        const a = Math.atan2(v, u) - ang;
        const plank = Math.floor(((a / Math.PI + 2) * 3) % 3);
        c = [P.wood[4], P.wood[5], P.wood[4]][plank];
        if (d < 1.6) c = P.steel[3];
        else if (Math.abs(Math.sin(a * 2)) < 0.12 && d < r - 2) c = P.wood[2];
        if (u < -2 && v > 0) c = c === P.wood[4] ? P.wood[5] : c;
      }
      if (char) c = charCol(c, char, x + frame, y) ?? c;
      p.set(x, y, c);
    }
  // bolts
  p.set(cx, cy - 4, P.steel[4]);
  p.outline(O[1]);
}

/** Drawbridge sprite: frames 0 (closed) → 3 (down). Canvas origin = hinge at (BR_X, BR_Y). */
export const BRIDGE = { w: 34, h: 26, hx: 2, hy: 17 };
function drawBridge(p: PixelCanvas, frame: number): void {
  const t = frame / 3;
  const ang = t * (Math.PI / 2);
  // door width along the right face (u 6..18 = 12 px, rising 6 px) ; length 16
  const len = 17;
  const e0 = { x: BRIDGE.hx, y: BRIDGE.hy };
  const e1 = { x: BRIDGE.hx + 12, y: BRIDGE.hy - 6 };
  // closed: vector straight up ; open: along +tx (screen (16,8)/|.| ≈ (0.89,0.45))
  const vx = Math.sin(ang) * 0.89 * len;
  const vy = -Math.cos(ang) * len + Math.sin(ang) * 0.45 * len;
  const quad: [number, number][] = [
    [e0.x, e0.y],
    [e1.x, e1.y],
    [e1.x + vx, e1.y + vy],
    [e0.x + vx, e0.y + vy],
  ];
  p.poly(quad, P.wood[3]);
  // planks along the length, iron straps across
  for (let s = 0; s <= 1.0001; s += 1 / 12) {
    const ax = e0.x + (e1.x - e0.x) * s;
    const ay = e0.y + (e1.y - e0.y) * s;
    const col = Math.round(s * 12) % 3 === 0 ? P.wood[2] : frame >= 2 ? P.wood[5] : P.wood[4];
    p.line(ax, ay, ax + vx, ay + vy, col);
  }
  for (const k of [0.25, 0.75]) {
    p.line(e0.x + vx * k, e0.y + vy * k, e1.x + vx * k, e1.y + vy * k, P.steel[2]);
  }
  // chains to the top of the door
  if (frame > 0) {
    const top0 = { x: e0.x, y: e0.y - len };
    const top1 = { x: e1.x, y: e1.y - len };
    p.line(top0.x, top0.y, e0.x + vx, e0.y + vy, P.steel[3], 0.9);
    p.line(top1.x, top1.y, e1.x + vx, e1.y + vy, P.steel[3], 0.9);
  }
  p.outline(O[1]);
}

/** Pushers inside the open ground storey (overlay on the tower canvas), 4 frames. */
function drawInsidePushers(p: PixelCanvas, frame: number, char: number): void {
  if (char > 0) return;
  for (let k = 0; k < 4; k++) {
    const u = 4 + k * 5 + (k > 1 ? 1 : 0);
    if (u >= 10 && u <= 13) continue;
    const step = (frame + k) % 4;
    const base = rightFace(u, 2);
    const x = base.x;
    const y = base.y;
    const lean = step % 2;
    // legs
    p.set(x - 1, y - 1, P.outline[2]);
    p.set(x + 1, y - (step === 1 ? 2 : 1), P.outline[2]);
    p.set(x - 1, y - 2, P.dirt[2]);
    p.set(x + 1, y - 2, P.dirt[2]);
    // body leaning toward the wall (screen right)
    for (let j = 3; j < 9; j++) {
      const sx = x + Math.floor((j - 3) * 0.35) + lean;
      p.set(sx - 1, y - j, j > 6 ? P.red[2] : P.red[3]);
      p.set(sx, y - j, P.red[2]);
    }
    // head + turban catching the light from the gap
    const hx = x + 2 + lean;
    p.set(hx, y - 10, P.skin[2]);
    p.set(hx - 1, y - 10, P.skin[1]);
    p.set(hx, y - 11, P.turban[1]);
    p.set(hx - 1, y - 11, P.turban[0]);
    // arms on the cross-beam
    p.set(hx + 1, y - 8, P.skin[2]);
    p.set(hx + 2, y - 8, P.wood[5]);
  }
}

/** Flames licking up the tower faces (drawn by the render in front of the tower). */
export const FLAME = { w: 14, h: 24 };
function drawFlame(p: PixelCanvas, frame: number, seed: number): void {
  const cx = 7;
  const base = FLAME.h - 2;
  for (let y = 0; y < FLAME.h; y++) {
    const k = (base - y) / (FLAME.h - 4); // 0 at base → 1 at tip
    if (k < 0 || k > 1.05) continue;
    const sway = Math.round(Math.sin(k * 4 + frame * 1.6 + seed) * 2 * k);
    const half = Math.max(0, Math.round((1 - k) * 5 * (0.75 + 0.25 * Math.sin(frame * 2.1 + y * 0.7 + seed))));
    for (let dx = -half; dx <= half; dx++) {
      const e = Math.abs(dx) / Math.max(1, half);
      const heat = (1 - k) * (1 - e * 0.7);
      const c = heat > 0.72 ? P.fire[7] : heat > 0.55 ? P.fire[6] : heat > 0.38 ? P.fire[5] : heat > 0.22 ? P.fire[4] : P.fire[3];
      if (e > 0.85 && bayer(cx + dx, y) > 0.5) continue;
      p.set(cx + dx + sway, y, c);
    }
  }
  // detached tongues
  for (let i = 0; i < 2; i++) {
    const ty = Math.round(2 + ((frame * 3 + i * 5 + seed) % 7));
    const tx = cx + Math.round(Math.sin(frame + i * 2 + seed) * 2);
    p.set(tx, ty, P.fire[4]);
    p.set(tx, ty + 1, P.fire[5]);
  }
}

function drawBanner(p: PixelCanvas, frame: number): void {
  // red Ottoman sancak with a pale fringe, fluttering (pole is in the tower canvas)
  const w = 11;
  for (let x = 0; x < w; x++) {
    const wave = Math.round(Math.sin(x * 0.7 - frame * 1.57) * 1.2 * (x / w));
    for (let y = 0; y < 6; y++) {
      const c = y === 0 ? P.red[5] : y === 5 ? P.red[2] : x % 4 === 3 ? P.red[3] : P.red[4];
      p.set(1 + x, 2 + y + wave, c);
    }
    if (x === w - 1) p.set(1 + x, 8 + wave, P.gold[4]);
  }
  p.outline(O[1]);
}

function drawWreck(p: PixelCanvas, frame: number): void {
  // charred heap: fallen beams, ash, a wheel on its side, upright stumps
  const cx = 36;
  const cy = 30;
  shade(p, cx + 4, cy + 2, 28, 9, 0.35);
  for (let y = -8; y <= 8; y++)
    for (let x = -26; x <= 26; x++) {
      const d = (x * x) / (26 * 26) + (y * y) / 81;
      if (d > 1) continue;
      const h = hash2(x, y, 31);
      p.set(cx + x, cy + y, d > 0.7 ? (h > 0.5 ? P.smoke[2] : P.smoke[3]) : h > 0.7 ? P.smoke[3] : P.smoke[1]);
    }
  const beams: [number, number, number, number][] = [
    [-22, 2, 14, -6],
    [-10, -6, 20, 6],
    [-18, -2, 6, 8],
    [2, -9, 24, -1],
    [-6, 4, 18, 2],
  ];
  for (const [x0, y0, x1, y1] of beams) {
    p.line(cx + x0, cy + y0, cx + x1, cy + y1, P.smoke[0]);
    p.line(cx + x0, cy + y0 - 1, cx + x1, cy + y1 - 1, P.wood[1]);
  }
  for (const [sx, h] of [
    [-14, 14],
    [8, 20],
    [16, 9],
  ]) {
    for (let y = 0; y < h; y++) {
      p.set(cx + sx, cy - y, y > h - 3 ? P.smoke[2] : P.smoke[0]);
      p.set(cx + sx + 1, cy - y, P.wood[1]);
    }
  }
  // embers glowing (animated)
  for (let k = 0; k < 14; k++) {
    const x = cx + Math.round((hash2(k, 1, 7) - 0.5) * 44);
    const y = cy + Math.round((hash2(k, 2, 7) - 0.5) * 12);
    const on = (k + frame) % 3 !== 0;
    if (on) p.set(x, y, hash2(k, frame, 3) > 0.5 ? P.fire[4] : P.fire[3]);
  }
  p.outline(O[1]);
}

/** Small men building the tower are taken from the figure sheets; this is the lumber pile. */
function drawLumber(p: PixelCanvas): void {
  shade(p, 12, 10, 11, 3);
  for (let r = 0; r < 3; r++)
    for (let k = 0; k < 4 - r; k++) {
      const x = 3 + k * 5 + r * 2;
      const y = 9 - r * 3;
      p.line(x, y, x + 8, y - 4, P.wood[4]);
      p.line(x, y + 1, x + 8, y - 3, P.wood[3]);
      p.set(x, y, P.wood[6]);
      p.set(x, y + 1, P.wood[5]);
    }
  p.outline(O[1]);
}

// ═════════════════════════════ MINES ═════════════════════════════

export const SHAFT = { w: 44, h: 40, ox: 22, oy: 28 };

function drawShaft(out: PixelCanvas, frame: number, collapsed: boolean): void {
  const cx = SHAFT.ox;
  const cy = SHAFT.oy;
  let p = out;
  shade(p, cx + 3, cy + 2, 17, 6, 0.3);
  // spoil ring & trampled ground
  for (let y = -6; y <= 7; y++)
    for (let x = -18; x <= 18; x++) {
      const d = (x * x) / 324 + (y * y) / 49;
      if (d > 1) continue;
      if (d > 0.82 && bayer(cx + x, cy + y) > 0.55) continue;
      const h = hash2(x, y, 41);
      p.set(cx + x, cy + y, h > 0.75 ? P.dirt[5] : h > 0.35 ? P.dirt[4] : P.dirt[3]);
    }
  p = new PixelCanvas(out.w, out.h);
  if (collapsed) {
    // caved-in hole: slumped earth, broken beams, cracked ground
    for (let y = -4; y <= 5; y++)
      for (let x = -11; x <= 11; x++) {
        const d = (x * x) / 121 + (y * y) / 25;
        if (d > 1) continue;
        p.set(cx + x, cy + y, d < 0.35 ? P.dirt[1] : d < 0.65 ? P.dirt[2] : P.dirt[3]);
      }
    p.line(cx - 12, cy - 6, cx + 2, cy + 1, P.wood[2]);
    p.line(cx - 12, cy - 7, cx + 2, cy, P.wood[4]);
    p.line(cx + 4, cy - 8, cx + 12, cy + 3, P.wood[3]);
    p.line(cx + 5, cy - 9, cx + 13, cy + 2, P.wood[5]);
    for (let k = 0; k < 4; k++) p.line(cx - 15 + k * 9, cy + 6, cx - 12 + k * 9 + (k % 2 ? 3 : -2), cy + 3, P.dirt[1]);
    p.outline(O[1]);
    out.blit(p, 0, 0);
    return;
  }
  // log collar (1×1 tile diamond) around a black hole
  const hw = 12;
  const hh = 6;
  for (let y = -hh; y <= hh; y++) {
    const span = Math.round(hw * (1 - Math.abs(y) / hh));
    for (let x = -span; x <= span; x++) {
      const inner = Math.abs(x) / (hw - 3) + Math.abs(y) / (hh - 1.5) <= 1;
      if (inner) {
        // shaft: far walls visible at the top, black depth below
        const depth = y + hh;
        p.set(cx + x, cy + y, depth < 3 ? (x < 0 ? P.dirt[2] : P.dirt[1]) : depth < 4 ? P.outline[2] : P.outline[0]);
      } else {
        const lit = y < 0 ? (x < 0 ? P.wood[6] : P.wood[5]) : x < 0 ? P.wood[4] : P.wood[3];
        p.set(cx + x, cy + y, (x + y) % 5 === 0 ? P.wood[2] : lit);
      }
    }
  }
  // log ends at the corners
  p.set(cx - hw - 1, cy, P.wood[6]);
  p.set(cx + hw + 1, cy, P.wood[4]);
  // ladder top poking out
  p.line(cx + 2, cy + 1, cx + 3, cy - 6, P.wood[5]);
  p.line(cx + 5, cy, cx + 6, cy - 6, P.wood[4]);
  for (let k = 0; k < 3; k++) p.line(cx + 2, cy - 1 - k * 2, cx + 6, cy - 1 - k * 2, P.wood[3]);
  // windlass: forked posts left & right, drum across, crank on the right
  const py = cy - 11;
  for (const [x, c] of [
    [cx - 9, P.wood[5]],
    [cx + 9, P.wood[3]],
  ] as const) {
    for (let y = py; y < cy - 1; y++) p.set(x, y, c);
    p.set(x - 1, py - 1, c);
    p.set(x + 1, py - 1, c);
  }
  for (let x = cx - 8; x <= cx + 8; x++) {
    p.set(x, py, P.wood[6]);
    p.set(x, py + 1, (x + frame) % 3 === 0 ? P.wood[2] : P.wood[4]);
  }
  // rope wound on the drum and down the hole with a bucket bobbing
  const ropeLen = [5, 7, 9, 7][frame % 4];
  for (let y = py + 2; y < py + 2 + ropeLen; y++) p.set(cx - 1, y, P.dryGrass[3]);
  const by = py + 2 + ropeLen;
  p.rect(cx - 3, by, 4, 3, P.wood[3]);
  p.set(cx - 3, by, P.wood[5]);
  p.set(cx - 2, by, P.wood[5]);
  p.set(cx - 2, by + 1, P.dirt[4]);
  // crank handle rotating
  const cr = [
    [2, -2],
    [3, 0],
    [2, 2],
    [0, 3],
  ][frame % 4];
  p.set(cx + 10, py, P.steel[3]);
  p.line(cx + 10, py, cx + 10 + cr[0], py + cr[1], P.steel[4]);
  p.set(cx + 10 + cr[0], py + cr[1], P.wood[5]);
  // pick & shovel leaning on the collar
  p.line(cx - 15, cy + 2, cx - 12, cy - 6, P.wood[4]);
  p.set(cx - 13, cy - 7, P.steel[4]);
  p.set(cx - 11, cy - 6, P.steel[3]);
  p.outline(O[1]);
  out.blit(p, 0, 0);
}

/** Wicker screen protecting the shaft from the wall. */
function drawScreen(p: PixelCanvas): void {
  // low wicker screen (siper) on stakes, rising along the iso axis
  shade(p, 15, 14, 9, 2, 0.28);
  for (let x = 0; x < 16; x++) {
    const yb = 16 - Math.floor(x / 2);
    for (let z = 0; z < 6; z++) {
      const weave = (x + z) % 3 === 0;
      const c = z === 5 ? P.dryGrass[3] : weave ? P.wood[3] : P.dryGrass[x < 4 ? 3 : 2];
      p.set(7 + x, yb - z, c);
    }
    if (x % 5 === 0) for (let z = -1; z < 8; z++) p.set(7 + x, yb - z, P.wood[2]);
  }
  p.outline(O[1]);
}

const HEAP = [
  { w: 16, h: 9 },
  { w: 22, h: 12 },
  { w: 28, h: 15 },
  { w: 34, h: 18 },
];
function drawHeap(p: PixelCanvas, size: number, seed: number, ramp: 'dirt' | 'fresh'): void {
  const { w, h } = HEAP[size];
  const cx = w / 2;
  const base = h - 2;
  const rx = w / 2 - 1;
  const ry = Math.max(2, Math.round(h * 0.3));
  const peak = Math.round(h * 0.55);
  shade(p, Math.round(cx) + 2, base, Math.round(rx), Math.max(2, ry - 1), 0.28);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const nx = (x - cx) / rx;
      const groundY = base + Math.round(Math.sqrt(Math.max(0, 1 - nx * nx)) * ry * 0.5);
      const top = base - Math.round((1 - nx * nx) * peak) + Math.round((hash2(x, seed, 3) - 0.5) * 1.5);
      if (y < top || y > groundY || Math.abs(nx) > 1) continue;
      // light from the upper-left: slope sign
      const slope = nx < -0.15 ? 2 : nx > 0.35 ? 0 : 1;
      const h2 = hash2(x, y, seed);
      const fresh = ramp === 'fresh';
      let idx = (fresh ? 2 : 3) + slope + (y === top ? 1 : 0) - (h2 > 0.82 ? 1 : 0);
      idx = Math.max(1, Math.min(6, idx));
      let c: string = P.dirt[idx];
      if (h2 < 0.06) c = P.stone[4 + slope];
      if (fresh && h2 > 0.93) c = P.sand[2];
      p.set(x, y, c);
    }
  p.outline(O[1]);
}

function drawLantern(p: PixelCanvas, frame: number): void {
  for (let y = 0; y < 12; y++) p.set(2, y + 1, P.wood[3]);
  p.set(3, 1, P.wood[4]);
  p.set(4, 1, P.wood[4]);
  p.set(5, 2, P.steel[3]);
  p.rect(4, 3, 3, 4, P.steel[2]);
  p.set(5, 4, frame ? P.fire[6] : P.fire[5]);
  p.set(5, 5, frame ? P.fire[5] : P.fire[6]);
  p.set(4, 4, P.fire[4]);
  p.set(6, 5, P.fire[3]);
  p.outline(O[1]);
  p.set(5, 4, frame ? P.fire[7] : P.fire[6]);
}

/** Subsidence crater: 'cokuntu' (counter-mine cave-in) or 'gocuk' (mine success under the wall). */
function drawCrater(p: PixelCanvas, rx: number, ry: number, seed: number, rubble: boolean): void {
  const cx = rx + 3;
  const cy = ry + 3;
  for (let y = -ry - 2; y <= ry + 2; y++)
    for (let x = -rx - 2; x <= rx + 2; x++) {
      const n = (hash2(Math.floor((x + 40) / 3), Math.floor((y + 40) / 2), seed) - 0.5) * 0.25;
      const d = (x * x) / (rx * rx) + (y * y) / (ry * ry) + n;
      if (d > 1.15) continue;
      let c: string;
      if (d > 0.95) {
        // raised cracked rim, lit on the upper-left
        if (bayer(cx + x, cy + y) > 0.6) continue;
        c = y < 0 && x < 0 ? P.dirt[5] : P.dirt[4];
      } else if (d > 0.7) c = y < 0 ? P.dirt[2] : x < 0 ? P.dirt[4] : P.dirt[3];
      else if (d > 0.35) c = y < -ry * 0.2 ? P.dirt[1] : P.dirt[2];
      else c = P.dirt[1];
      p.set(cx + x, cy + y, c, d > 0.95 ? 0.8 : 1);
    }
  // radiating cracks
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + hash2(k, seed, 1);
    const L = rx * (0.3 + hash2(k, seed, 2) * 0.35);
    let x = cx + Math.cos(a) * rx * 0.95;
    let y = cy + Math.sin(a) * ry * 0.95;
    for (let s = 0; s < L; s++) {
      x += Math.cos(a) + (hash2(k, s, 5) - 0.5);
      y += Math.sin(a) * 0.5;
      p.set(Math.round(x), Math.round(y), P.dirt[1], 0.85);
    }
  }
  if (rubble)
    for (let k = 0; k < rx * 2; k++) {
      const x = cx + Math.round((hash2(k, seed, 7) - 0.5) * rx * 1.6);
      const y = cy + Math.round((hash2(k, seed, 8) - 0.5) * ry * 1.4);
      const brick = hash2(k, seed, 9) > 0.7;
      p.set(x, y, brick ? P.brick[4] : P.limestone[4]);
      p.set(x + 1, y, brick ? P.brick[2] : P.limestone[2]);
      if (k % 3 === 0) p.set(x, y - 1, brick ? P.brick[5] : P.limestone[5]);
    }
}

// ═════════════════════════════ MOAT WORK ═════════════════════════════

function drawFascinePile(p: PixelCanvas, size: number, seed: number): void {
  const n = [5, 9, 14][size];
  const w = p.w;
  shade(p, Math.floor(w / 2) + 2, p.h - 4, Math.floor(w / 2) - 2, 3, 0.3);
  let k = 0;
  for (let row = 0; k < n; row++) {
    const inRow = Math.max(1, 4 - row);
    for (let i = 0; i < inRow && k < n; i++, k++) {
      const x = 3 + i * 6 + row * 3 + Math.round(hash2(k, seed, 1) * 2);
      const y = p.h - 7 - row * 3 + Math.round(hash2(k, seed, 2));
      // bundles lie along the iso axis (2:1)
      for (let s = 0; s < 9; s++) {
        for (let j = 0; j < 3; j++) {
          const h = hash2(s + k * 13, j, seed);
          const c = j === 0 ? (h > 0.5 ? P.dryGrass[4] : P.wood[6]) : j === 1 ? (h > 0.4 ? P.wood[5] : P.dryGrass[3]) : h > 0.5 ? P.wood[3] : P.foliage[3];
          p.set(x + s, y + j - Math.floor(s / 2) + 4, c);
        }
      }
      p.set(x + 2, y + 4 - 1, P.sand[1]);
      p.set(x + 6, y + 4 - 3, P.sand[1]);
    }
  }
  // a couple of earth baskets and planks at the foot
  if (size > 0) {
    const bx = 2;
    const by = p.h - 6;
    p.rect(bx, by, 5, 3, P.wood[4]);
    p.rect(bx + 1, by - 1, 3, 1, P.dirt[4]);
    p.line(w - 16, p.h - 3, w - 3, p.h - 9, P.wood[5]);
    p.line(w - 16, p.h - 2, w - 3, p.h - 8, P.wood[3]);
  }
  p.outline(O[1]);
}

function drawDump(p: PixelCanvas, size: number, seed: number): void {
  // freshly dumped earth, stones and brushwood at the moat edge
  const w = p.w;
  const h = p.h;
  const cx = w / 2;
  const cy = h / 2 + 1;
  const rx = w / 2 - 2;
  const ry = h / 2 - 2;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const n = (hash2(x >> 1, y, seed) - 0.5) * 0.35;
      const d = ((x - cx) * (x - cx)) / (rx * rx) + ((y - cy) * (y - cy)) / (ry * ry) + n;
      if (d > 1) continue;
      if (d > 0.8 && bayer(x, y) > 0.5) continue;
      const upLeft = x < cx && y < cy;
      const hh = hash2(x, y, seed + 1);
      let c: string = d < 0.4 ? (upLeft ? P.dirt[5] : P.dirt[4]) : upLeft ? P.dirt[4] : P.dirt[3];
      if (hh < 0.07) c = P.stone[5];
      else if (hh < 0.1) c = P.brick[3];
      else if (hh > 0.9) c = P.dryGrass[2];
      p.set(x, y, c);
    }
  // brushwood sticking out
  for (let k = 0; k < 2 + size * 2; k++) {
    const x = Math.round(cx + (hash2(k, seed, 3) - 0.5) * rx * 1.4);
    const y = Math.round(cy + (hash2(k, seed, 4) - 0.5) * ry);
    p.line(x, y, x + 3, y - 2, k % 2 ? P.wood[5] : P.dryGrass[4]);
  }
}

// ═════════════════════════════ UI-WORLD ═════════════════════════════

function drawXray(p: PixelCanvas, frame: number): void {
  const cols = [
    [P.gold[6], P.gold[4]],
    [P.gold[3], P.gold[2]],
    [P.red[6], P.red[4]],
    [P.cloth[4], P.cloth[2]],
  ][frame];
  p.set(2, 1, cols[0]);
  p.set(3, 1, cols[0]);
  p.set(1, 2, cols[1]);
  p.set(2, 2, cols[0]);
  p.set(3, 2, cols[1]);
  p.set(2, 3, cols[1]);
  p.outline(O[0]);
}

function drawPickIcon(p: PixelCanvas, frame: number): void {
  // pulsing ring + pick: the tunnel face
  const r = frame ? 5 : 4;
  for (let a = 0; a < 24; a++) {
    const x = Math.round(6 + Math.cos((a / 24) * Math.PI * 2) * r);
    const y = Math.round(6 + Math.sin((a / 24) * Math.PI * 2) * r * 0.55);
    p.set(x, y, frame ? P.gold[5] : P.gold[4]);
  }
  p.line(3, 9, 8, 3, P.wood[5]);
  p.set(7, 2, P.steel[5]);
  p.set(8, 3, P.steel[4]);
  p.set(9, 4, P.steel[3]);
  p.set(9, 5, P.steel[3]);
}

function drawTarget(p: PixelCanvas, frame: number): void {
  const c = frame ? P.red[6] : P.red[5];
  p.isoLine(0, 4, 4, 1, c);
  p.isoLine(8, 0, 0, 1, c);
  for (let s = 0; s < 4; s++) {
    p.set(s * 2, 3 - s, c);
    p.set(s * 2 + 1, 3 - s, c);
    p.set(8 + s * 2, s, c);
    p.set(9 + s * 2, s, c);
    p.set(s * 2, 4 + s, c);
    p.set(s * 2 + 1, 4 + s, c);
    p.set(8 + s * 2, 7 - s, c);
    p.set(9 + s * 2, 7 - s, c);
  }
  p.set(8, 4, frame ? P.gold[6] : P.gold[4]);
}

function drawRing(p: PixelCanvas, rx: number, ry: number, frame: number): void {
  const cx = rx + 2;
  const cy = ry + 2;
  const c1 = frame ? P.gold[6] : P.gold[5];
  const c2 = P.gold[3];
  for (let y = -ry - 1; y <= ry + 1; y++)
    for (let x = -rx - 1; x <= rx + 1; x++) {
      const d = Math.sqrt((x * x) / (rx * rx) + (y * y) / (ry * ry));
      const inside = (xx: number, yy: number) => (xx * xx) / (rx * rx) + (yy * yy) / (ry * ry) <= 1;
      if (inside(x, y) && (!inside(x + 1, y) || !inside(x - 1, y) || !inside(x, y + 1) || !inside(x, y - 1))) {
        void d;
        const dash = Math.floor((Math.atan2(y, x) / Math.PI + 1) * 8 + frame) % 2 === 0;
        p.set(cx + x, cy + y, dash ? c1 : c2);
      }
    }
}

function drawBar(p: PixelCanvas): void {
  p.rect(0, 0, p.w, p.h, O[0]);
  p.rect(1, 1, p.w - 2, p.h - 2, P.night[1]);
}

function icon(p: PixelCanvas, kind: 'lagim' | 'kule' | 'hendek'): void {
  // parchment roundel with gold rim
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const d = Math.hypot(x - 15.5, y - 15.5);
      if (d > 15.5) continue;
      p.set(x, y, d > 14 ? P.gold[2] : d > 13 ? P.gold[4] : d > 12.2 ? P.gold[3] : y < 15 ? '#efe2c2' : '#d8c49a');
    }
  if (kind === 'kule') {
    p.rect(11, 8, 10, 17, P.wood[4]);
    p.rect(11, 8, 4, 17, P.wood[5]);
    for (let y = 10; y < 24; y += 4) p.rect(11, y, 10, 1, P.wood[2]);
    p.rect(10, 6, 12, 2, P.dryGrass[3]);
    for (let x = 10; x < 22; x += 3) p.set(x, 5, P.dryGrass[3]);
    p.disc(12, 25, 2, P.steel[2]);
    p.disc(20, 25, 2, P.steel[2]);
    p.rect(15, 2, 1, 4, P.wood[2]);
    p.rect(16, 2, 4, 2, P.red[4]);
  } else if (kind === 'lagim') {
    for (let y = 18; y < 27; y++) for (let x = 4; x < 28; x++) p.set(x, y, y < 20 ? P.grass[4] : P.dirt[y % 3 === 0 ? 2 : 3]);
    p.rect(8, 21, 15, 2, P.outline[1]);
    for (let x = 8; x < 23; x += 3) p.set(x, 20, P.wood[4]);
    p.rect(22, 9, 6, 9, P.stone[5]);
    p.rect(22, 9, 6, 2, P.brick[4]);
    p.line(5, 15, 10, 9, P.wood[5]);
    p.set(9, 8, P.steel[5]);
    p.set(11, 9, P.steel[4]);
  } else {
    for (let y = 16; y < 26; y++) for (let x = 4; x < 28; x++) p.set(x, y, y < 18 ? P.grass[4] : y < 21 ? P.water[4] : P.dirt[3]);
    for (let k = 0; k < 3; k++) drawBundle(p, 6 + k * 7, 14 + k, 6, k);
    p.rect(20, 7, 8, 9, P.stone[5]);
    p.rect(20, 7, 8, 2, P.brick[4]);
  }
  p.outline(O[1]);
}

// ═════════════════════════════ registration ═════════════════════════════

export const TOWER_STAGES = 5;

export function generateSiegeworksTextures(gen: TextureGen): void {
  genFigures(gen);

  // siege tower: stages 0..4, charring 0..2 (charring only on the finished tower)
  for (let s = 0; s < TOWER_STAGES; s++) gen.canvas(`siege/kule-${s}`, TOWER_W, TOWER_H, (p) => drawTower(p, { stage: s, char: 0 }));
  for (const c of [1, 2]) gen.canvas(`siege/kule-4-yanik${c}`, TOWER_W, TOWER_H, (p) => drawTower(p, { stage: 4, char: c }));
  for (const c of [0, 1, 2]) gen.canvas(`siege/kule-on${c ? '-yanik' + c : ''}`, TOWER_W, TOWER_H, (p) => drawTowerFront(p, { stage: 4, char: c }));
  gen.sheet('siege/kule-itici', TOWER_W, TOWER_H, 4, (p, f) => drawInsidePushers(p, f, 0));
  gen.sheet('siege/teker', WHEEL.w, WHEEL.h, 4, (p, f) => drawWheel(p, f, 0));
  gen.sheet('siege/teker-yanik', WHEEL.w, WHEEL.h, 4, (p, f) => drawWheel(p, f, 2));
  gen.sheet('siege/kopru', BRIDGE.w, BRIDGE.h, 4, (p, f) => drawBridge(p, f));
  gen.sheet('siege/sancak', 14, 12, 4, (p, f) => drawBanner(p, f));
  gen.sheet('siege/alev', FLAME.w, FLAME.h, 8, (p, f) => drawFlame(p, f % 4, f < 4 ? 0 : 2.3));
  gen.anim('siege/alev:yan', 'siege/alev', [0, 1, 2, 3], 10);
  gen.anim('siege/alev:yan2', 'siege/alev', [4, 5, 6, 7], 9);
  gen.anim('siege/sancak:dalga', 'siege/sancak', [0, 1, 2, 3], 7);
  gen.sheet('siege/enkaz', 72, 44, 3, (p, f) => drawWreck(p, f));
  gen.anim('siege/enkaz:kor', 'siege/enkaz', [0, 1, 2], 4);
  gen.canvas('siege/kereste', 26, 14, (p) => drawLumber(p));

  // mines
  gen.sheet('siege/kuyu', SHAFT.w, SHAFT.h, 4, (p, f) => drawShaft(p, f, false));
  gen.canvas('siege/kuyu-cokuk', SHAFT.w, SHAFT.h, (p) => drawShaft(p, 0, true));
  gen.canvas('siege/perde', 30, 20, (p) => drawScreen(p));
  for (let s = 0; s < HEAP.length; s++) gen.canvas(`siege/toprak-${s}`, HEAP[s].w, HEAP[s].h, (p) => drawHeap(p, s, 7 + s, 'fresh'));
  gen.sheet('siege/fener', 9, 14, 2, (p, f) => drawLantern(p, f));
  gen.anim('siege/fener:yan', 'siege/fener', [0, 1], 5);
  gen.canvas('siege/cokuntu', 44, 22, (p) => drawCrater(p, 19, 8, 3, false));
  gen.canvas('siege/gocuk', 76, 34, (p) => drawCrater(p, 34, 13, 8, true));
  gen.canvas('siege/iz', 12, 8, (p) => drawCrater(p, 4, 2, 5, false));

  // moat work
  gen.canvas('siege/demet-0', 26, 14, (p) => drawFascinePile(p, 0, 1));
  gen.canvas('siege/demet-1', 34, 18, (p) => drawFascinePile(p, 1, 2));
  gen.canvas('siege/demet-2', 40, 22, (p) => drawFascinePile(p, 2, 3));
  gen.canvas('siege/dokuntu-0', 18, 9, (p) => drawDump(p, 0, 4));
  gen.canvas('siege/dokuntu-1', 24, 12, (p) => drawDump(p, 1, 5));
  gen.canvas('siege/dokuntu-2', 30, 15, (p) => drawDump(p, 2, 6));

  // UI-world
  gen.sheet('siege/xray', 6, 5, 4, (p, f) => drawXray(p, f));
  gen.sheet('siege/xray-uc', 13, 12, 2, (p, f) => drawPickIcon(p, f));
  gen.sheet('siege/xray-hedef', 17, 9, 2, (p, f) => drawTarget(p, f));
  gen.sheet('siege/halka-k', 32, 18, 2, (p, f) => drawRing(p, 13, 6, f));
  gen.sheet('siege/halka-m', 50, 26, 2, (p, f) => drawRing(p, 22, 10, f));
  gen.sheet('siege/halka-b', 60, 32, 2, (p, f) => drawRing(p, 27, 13, f));
  gen.canvas('siege/bar', 22, 4, (p) => drawBar(p));
  gen.canvas('siege/bar-dolum', 1, 2, (p) => {
    p.set(0, 0, P.gold[5]);
    p.set(0, 1, P.gold[3]);
  });
  gen.canvas('siege/bar-kirmizi', 1, 2, (p) => {
    p.set(0, 0, P.red[5]);
    p.set(0, 1, P.red[3]);
  });
  for (const k of ['lagim', 'kule', 'hendek'] as const) gen.canvas(`siege/ikon-${k}`, 32, 32, (p) => icon(p, k));
}

/** Exposed for node contact sheets. */
export const _debug = { drawTower, drawShaft, drawFig, poseOf, LOOKS };
export type { Color };
