import { P } from '../../art/palette';
import type { PixelCanvas } from '../../art/pixel';
import type { TextureGen } from '../../art/texture';

/**
 * BYZANTIUM ART (keys 'byz/…') — pure PixelCanvas drawing, no Phaser.
 *
 *  - byz/isci   : night repair crews (soldiers, monks, women, townsmen) carrying beams,
 *                 baskets of earth, lanterns, swinging mallets. Face RIGHT; render flips.
 *  - byz/sorti  : sortie party — Genoese & Greek soldiers running with torches, striking.
 *  - byz/yapi   : stockade pieces being raised at night (stakes, barrels, sacks, gabions…).
 *  - byz/fener  : lantern on a pole (flickering).
 *  - byz/kivilcim : tiny hammer sparks / wood chips.
 *
 * Light from the upper-left: left columns lit, right columns shaded; selective dark outline.
 */

type C = string;

export const ISCI_W = 16;
export const ISCI_H = 20;
/** Feet line inside the frame. */
export const FOOT_Y = 18;

export interface Outfit {
  id: string;
  body: [C, C, C]; // light, mid, dark
  long: boolean; // robe to the ankles (monks, women)
  head: 'migfer' | 'kalimavkion' | 'basortu' | 'kulah' | 'sapka';
  headC: [C, C];
  beard?: C;
  belt?: C;
  legs: [C, C];
  skin: [C, C];
}

export const OUTFITS: Outfit[] = [
  // Greek militiaman: kettle helmet, blue padded tunic
  { id: 'asker', body: [P.blue[4], P.blue[3], P.blue[1]], long: false, head: 'migfer', headC: [P.steel[5], P.steel[3]], belt: P.wood[2], legs: [P.dirt[4], P.dirt[2]], skin: [P.skin[4], P.skin[3]], beard: P.dirt[1] },
  // monk: black habit and kalimavkion, grey beard
  { id: 'kesis', body: [P.night[3], P.night[1], P.outline[1]], long: true, head: 'kalimavkion', headC: [P.night[2], P.outline[1]], beard: P.cloth[3], legs: [P.outline[2], P.outline[1]], skin: [P.skin[4], P.skin[3]] },
  // woman: maphorion over a purple-red dress
  { id: 'kadin', body: [P.purple[5], P.purple[4], P.purple[2]], long: true, head: 'basortu', headC: [P.cloth[5], P.cloth[3]], legs: [P.purple[2], P.purple[1]], skin: [P.skin[5], P.skin[4]] },
  // townsman: undyed tunic, felt cap
  { id: 'halk', body: [P.sand[4], P.sand[3], P.sand[1]], long: false, head: 'kulah', headC: [P.wood[5], P.wood[3]], belt: P.red[2], legs: [P.wood[3], P.wood[2]], skin: [P.skin[4], P.skin[2]], beard: P.wood[1] },
  // woman 2: blue scarf, green dress
  { id: 'kadin2', body: [P.green[5], P.green[4], P.green[2]], long: true, head: 'basortu', headC: [P.blue[5], P.blue[3]], legs: [P.green[2], P.green[1]], skin: [P.skin[4], P.skin[3]] },
];

export type IsciAct = 'kiris' | 'sepet' | 'fener' | 'cekic' | 'yuru';
export const ISCI_ACTS: IsciAct[] = ['kiris', 'sepet', 'fener', 'cekic', 'yuru'];
export const ISCI_FRAMES = 4;

/** Frame index of (variant, action, frame) in 'byz/isci'. */
export function isciFrame(v: number, a: number, f: number): number {
  return (v * ISCI_ACTS.length + a) * ISCI_FRAMES + f;
}

/** Animation key for a variant/action. */
export function isciAnim(v: number, a: IsciAct): string {
  return `byz/isci:${OUTFITS[v].id}-${a}`;
}

// ───────────────────────────── small helpers ─────────────────────────────

function hline(p: PixelCanvas, x0: number, x1: number, y: number, c: C): void {
  for (let x = x0; x <= x1; x++) p.set(x, y, c);
}

/** Flickering flame with its tip at (x, y-?) — base at (x, y). k = flicker frame. */
function flame(p: PixelCanvas, x: number, y: number, k: number, big = false): void {
  const sway = [0, 1, 0, -1][k & 3];
  const h = big ? 5 : 4;
  for (let j = 0; j < h; j++) {
    const w = j === 0 ? (big ? 2 : 1) : j < h - 2 ? 1 : 0;
    const sx = j >= h - 2 ? sway : 0;
    const c = j === 0 ? P.fire[6] : j === 1 ? P.fire[5] : j === 2 ? P.fire[4] : P.fire[3];
    for (let i = -w; i <= w; i++) p.set(x + i + sx, y - j, i === -w && j > 0 ? P.fire[5] : c);
  }
  p.set(x, y, P.fire[7]);
  if (k % 2 === 0) p.set(x + sway * 2, y - h - 1, P.fire[3]);
}

// ───────────────────────────── worker figure ─────────────────────────────

interface Pose {
  walk: number; // 0..3, −1 standing
  act: IsciAct;
  f: number;
}

function drawWorker(p: PixelCanvas, o: Outfit, pose: Pose): void {
  const cx = 7;
  const walking = pose.walk >= 0;
  const bob = walking && (pose.walk === 1 || pose.walk === 3) ? -1 : 0;
  const crouch = pose.act === 'cekic' && (pose.f === 2) ? 1 : 0;
  const fy = FOOT_Y;
  const [bl, bm, bd] = o.body;
  // soft ground shadow (lower-right)
  for (let i = -2; i <= 3; i++) p.set(cx + i + 1, fy + 1, P.outline[2], 0.35);
  // ── legs
  const fwd = pose.walk === 0 ? 1 : pose.walk === 2 ? -1 : 0;
  const legTop = fy - 3 + bob + crouch;
  if (!o.long) {
    for (let j = 0; j < 4 - crouch; j++) {
      const sh = j >= 2 ? fwd : 0;
      p.set(cx - 1 - sh, legTop + j, o.legs[1]);
      p.set(cx + 1 + sh, legTop + j, o.legs[0]);
    }
    p.set(cx - 1 - fwd - 1, fy, P.outline[1]);
    p.set(cx - 1 - fwd, fy, P.outline[1]);
    p.set(cx + 1 + fwd, fy, P.outline[1]);
    p.set(cx + 2 + fwd, fy, P.outline[1]);
  } else {
    // feet peeking under the hem
    p.set(cx - 1 - fwd, fy, P.outline[1]);
    p.set(cx + 1 + fwd, fy, P.outline[1]);
    p.set(cx + 2 + fwd, fy, P.outline[1]);
  }
  // ── body
  const ty = fy - 9 + bob + crouch; // shoulder row
  const bodyRows = o.long ? 9 : 6;
  for (let j = 0; j < bodyRows; j++) {
    const flare = o.long ? (j >= 6 ? 1 : 0) + (j >= 8 ? 1 : 0) : 0;
    const x0 = cx - 2 - flare + (j === 0 ? 1 : 0);
    const x1 = cx + 2 + flare;
    for (let x = x0; x <= x1; x++) {
      if (o.long && j >= bodyRows - 1 && fy - (ty + j) < 0) continue;
      const rel = x - cx;
      let c = rel <= -1 ? bl : rel <= 1 ? bm : bd;
      if (j === 0 && rel <= 0) c = bl;
      if (o.long && j >= 5 && (x + j) % 3 === 0 && rel > -1) c = bd; // robe folds
      p.set(x, ty + j, c);
    }
  }
  if (o.belt && !o.long) hline(p, cx - 2, cx + 2, ty + 4, o.belt);
  if (o.id === 'kesis') p.set(cx, ty + 1, P.gold[4]); // small pectoral cross
  if (o.id === 'kesis') p.set(cx, ty + 2, P.gold[3]);
  // ── head
  const hy = ty - 4;
  for (let j = 0; j < 3; j++)
    for (let i = -1; i <= 1; i++) p.set(cx + i, hy + j + 1, i < 1 ? o.skin[0] : o.skin[1]);
  p.set(cx + 2, hy + 2, o.skin[1]); // nose
  p.set(cx + 1, hy + 2, P.outline[1]); // eye
  if (o.beard) {
    p.set(cx, hy + 3, o.beard);
    p.set(cx + 1, hy + 3, o.beard);
    if (o.id === 'kesis') {
      p.set(cx, hy + 4, o.beard);
      p.set(cx + 1, hy + 4, o.beard);
    }
  }
  // ── headwear
  const [h0, h1] = o.headC;
  switch (o.head) {
    case 'migfer':
      hline(p, cx - 2, cx + 2, hy + 1, h1); // brim
      hline(p, cx - 1, cx + 1, hy, h0);
      p.set(cx + 1, hy, h1);
      p.set(cx, hy - 1, h0);
      p.set(cx - 2, hy + 1, h0);
      break;
    case 'kalimavkion':
      for (let j = -2; j <= 0; j++) hline(p, cx - 1, cx + 1, hy + j, j === -2 ? h0 : h1);
      p.set(cx - 1, hy - 1, h0);
      p.set(cx - 2, hy + 1, h1);
      p.set(cx - 2, hy + 2, h1); // veil falling behind
      p.set(cx - 2, hy + 3, h1);
      break;
    case 'basortu':
      hline(p, cx - 1, cx + 1, hy, h0);
      p.set(cx - 2, hy + 1, h0);
      p.set(cx - 2, hy + 2, h1);
      p.set(cx - 2, hy + 3, h1);
      p.set(cx - 1, hy + 3, h1);
      p.set(cx - 3, hy + 4, h1); // scarf over the shoulders
      p.set(cx - 2, hy + 4, h0);
      p.set(cx + 1, hy, h1);
      break;
    case 'kulah':
      hline(p, cx - 1, cx + 1, hy, h0);
      p.set(cx + 1, hy, h1);
      p.set(cx - 1, hy - 1, h0);
      p.set(cx, hy - 1, h1);
      break;
    case 'sapka':
      hline(p, cx - 2, cx + 2, hy, h1);
      hline(p, cx - 1, cx + 1, hy - 1, h0);
      break;
  }
  // ── arms & load
  const back = o.body[2];
  switch (pose.act) {
    case 'kiris': {
      // a long beam on the shoulder, bobbing with the step
      const by = ty - 1;
      for (let x = 0; x <= 14; x++) {
        p.set(x, by, x < 2 ? P.wood[6] : P.wood[5]);
        p.set(x, by + 1, x === 14 ? P.wood[1] : P.wood[3]);
      }
      p.set(0, by + 1, P.wood[2]);
      p.set(14, by, P.wood[4]);
      // grain
      p.set(4, by + 1, P.wood[2]);
      p.set(10, by, P.wood[4]);
      // hand gripping in front
      p.set(cx + 2, ty, bm);
      p.set(cx + 3, ty - 1 + 1, o.skin[0]);
      p.set(cx - 2, ty + 1, back);
      break;
    }
    case 'sepet': {
      // wicker basket of earth on the head, both hands up
      const by = hy - 4 - (o.head === 'kalimavkion' ? 1 : 0);
      for (let j = 0; j < 3; j++)
        for (let i = -2; i <= 2; i++) p.set(cx + i, by + j + 1, (i + j) % 2 === 0 ? P.wood[5] : P.wood[3]);
      p.set(cx + 2, by + 2, P.wood[2]);
      p.set(cx + 2, by + 3, P.wood[2]);
      hline(p, cx - 2, cx + 1, by, P.dirt[5]);
      p.set(cx - 1, by - 1, P.dirt[6]);
      p.set(cx, by - 1, P.dirt[4]);
      p.set(cx + 2, by, P.dirt[3]);
      // arms raised
      p.set(cx - 2, by + 4, bl);
      p.set(cx - 2, by + 3, o.skin[0]);
      p.set(cx + 2, by + 4, bm);
      p.set(cx + 3, by + 3, o.skin[1]);
      break;
    }
    case 'fener': {
      // lantern held forward, swinging gently
      const sw = [0, 1, 0, -1][pose.f & 3];
      p.set(cx + 2, ty + 1, bm);
      p.set(cx + 3, ty + 2, bm);
      p.set(cx + 4, ty + 2, o.skin[0]);
      const lx = cx + 4 + (sw > 0 ? 1 : 0);
      const ly = ty + 3;
      p.set(lx, ly, P.steel[2]); // handle
      p.set(lx - 1, ly + 1, P.outline[1]);
      p.set(lx + 1, ly + 1, P.outline[1]);
      p.set(lx, ly + 1, P.fire[pose.f % 2 ? 6 : 5]);
      p.set(lx - 1, ly + 2, P.fire[4]);
      p.set(lx, ly + 2, P.fire[7]);
      p.set(lx + 1, ly + 2, P.fire[4]);
      hline(p, lx - 1, lx + 1, ly + 3, P.outline[1]);
      p.set(cx - 3, ty + 2, back); // back arm swinging
      p.set(cx - 3, ty + 3, o.skin[1]);
      break;
    }
    case 'cekic': {
      // mallet: up · mid · strike · mid
      const ph = pose.f;
      p.set(cx - 2, ty + 1, back);
      if (ph === 0) {
        p.set(cx + 2, ty, bm);
        p.set(cx + 2, ty - 1, o.skin[0]);
        p.set(cx + 2, ty - 2, P.wood[4]);
        p.set(cx + 2, ty - 3, P.wood[4]);
        hline(p, cx + 1, cx + 3, ty - 4, P.wood[2]);
        hline(p, cx + 1, cx + 3, ty - 5, P.wood[5]);
      } else if (ph === 1 || ph === 3) {
        p.set(cx + 3, ty + 1, bm);
        p.set(cx + 4, ty + 1, o.skin[0]);
        p.set(cx + 5, ty, P.wood[4]);
        p.set(cx + 6, ty - 1, P.wood[4]);
        p.set(cx + 6, ty - 2, P.wood[5]);
        p.set(cx + 7, ty - 1, P.wood[2]);
        p.set(cx + 7, ty - 2, P.wood[3]);
      } else {
        p.set(cx + 3, ty + 2, bm);
        p.set(cx + 4, ty + 3, o.skin[0]);
        p.set(cx + 5, ty + 4, P.wood[4]);
        p.set(cx + 6, ty + 5, P.wood[4]);
        p.set(cx + 6, ty + 6, P.wood[5]);
        p.set(cx + 7, ty + 6, P.wood[2]);
        p.set(cx + 7, ty + 7, P.wood[3]);
        p.set(cx + 6, ty + 7, P.wood[2]);
      }
      // the stake being driven
      const sy = fy - 5 + (ph === 2 ? 1 : 0);
      p.set(cx + 6, sy + 3, P.wood[6]);
      for (let j = 4; j <= 6; j++) p.set(cx + 6, sy + j, P.wood[3]);
      p.set(cx + 7, sy + 5, P.wood[2]);
      break;
    }
    case 'yuru': {
      const a = pose.walk === 0 ? -1 : pose.walk === 2 ? 1 : 0;
      p.set(cx + 2, ty + 1, bm);
      p.set(cx + 2 + Math.max(0, a), ty + 2, bm);
      p.set(cx + 2 + a, ty + 3, o.skin[0]);
      p.set(cx - 3, ty + 1, back);
      p.set(cx - 3 - Math.max(0, a), ty + 2, back);
      p.set(cx - 3 - a, ty + 3, o.skin[1]);
      break;
    }
  }
  p.outline(P.outline[0]);
}

// ───────────────────────────── sortie soldiers ─────────────────────────────

export const SORTI_FRAMES = 6; // 0-3 run, 4-5 strike
export const SORTI_VARIANTS = ['ceneviz', 'rum'] as const;

function drawSortie(p: PixelCanvas, v: number, f: number): void {
  const cx = 7;
  const fy = FOOT_Y;
  const run = f < 4;
  const ph = f & 3;
  const bob = run && (ph === 1 || ph === 3) ? -1 : 0;
  const genoa = v === 0;
  for (let i = -2; i <= 3; i++) p.set(cx + i + 1, fy + 1, P.outline[2], 0.35);
  // legs: long running stride
  const stride = run ? [2, 0, -2, 0][ph] : f === 4 ? 1 : 2;
  const leg = genoa ? [P.red[3], P.red[2]] : [P.dirt[4], P.dirt[2]];
  for (let j = 0; j < 4; j++) {
    const k = j >= 1 ? stride * (j / 3) : 0;
    p.set(Math.round(cx - 1 - k), fy - 3 + j + bob, leg[1]);
    p.set(Math.round(cx + 1 + k), fy - 3 + j + bob, leg[0]);
  }
  p.set(cx - 2 - Math.max(0, stride), fy, P.outline[1]);
  p.set(cx + 1 + Math.max(0, stride), fy, P.outline[1]);
  p.set(cx + 2 + Math.max(0, stride), fy, P.outline[1]);
  // torso: mail + surcoat
  const ty = fy - 9 + bob;
  const lean = run ? 1 : 0;
  for (let j = 0; j < 6; j++)
    for (let i = -2; i <= 2; i++) {
      const x = cx + i + (j < 2 ? lean : 0);
      let c: C;
      if (genoa) c = i <= -1 ? P.cloth[5] : i <= 1 ? P.cloth[4] : P.cloth[2];
      else c = i <= -1 ? P.blue[3] : i <= 1 ? P.blue[2] : P.blue[1];
      if (genoa && (i === 0 || j === 2)) c = i <= 0 ? P.red[5] : P.red[4]; // red cross
      if (j === 5) c = genoa ? P.steel[3] : P.steel[2]; // mail skirt
      p.set(x, ty + j, c);
    }
  // head + kettle helmet / bascinet
  const hy = ty - 4;
  for (let j = 0; j < 3; j++)
    for (let i = -1; i <= 1; i++) p.set(cx + i + lean, hy + j + 1, i < 1 ? P.skin[4] : P.skin[3]);
  p.set(cx + 1 + lean, hy + 2, P.outline[1]);
  if (genoa) {
    for (let j = -1; j <= 1; j++) hline(p, cx - 1 + lean, cx + 1 + lean, hy + j, j === -1 ? P.steel[5] : P.steel[4]);
    p.set(cx + 1 + lean, hy + 1, P.steel[2]);
    p.set(cx + lean, hy - 2, P.steel[6]);
    p.set(cx - 2 + lean, hy + 1, P.steel[3]);
    p.set(cx - 2 + lean, hy + 2, P.steel[3]); // aventail
  } else {
    hline(p, cx - 2 + lean, cx + 2 + lean, hy + 1, P.steel[3]);
    hline(p, cx - 1 + lean, cx + 1 + lean, hy, P.steel[5]);
    p.set(cx + lean, hy - 1, P.steel[5]);
    // round shield on the back arm
    for (let j = 0; j < 4; j++) for (let i = 0; i < 3; i++) p.set(cx - 4 + i, ty + 1 + j, i === 0 ? P.red[5] : j === 0 ? P.red[4] : P.red[3]);
    p.set(cx - 3, ty + 2, P.gold[5]);
  }
  // torch arm raised high (run) / sword strike
  if (run) {
    p.set(cx + 2 + lean, ty, genoa ? P.cloth[4] : P.blue[2]);
    p.set(cx + 3 + lean, ty - 1, P.skin[4]);
    p.set(cx + 3 + lean, ty - 2, P.wood[3]);
    p.set(cx + 3 + lean, ty - 3, P.wood[4]);
    flame(p, cx + 3 + lean, ty - 4, ph, true);
    // sword hanging in the back hand
    p.set(cx - 3, ty + 3, P.skin[3]);
    p.set(cx - 4, ty + 4, P.steel[5]);
    p.set(cx - 5, ty + 5, P.steel[4]);
  } else if (f === 4) {
    // sword raised
    p.set(cx + 2, ty, P.cloth[3]);
    p.set(cx + 2, ty - 1, P.skin[4]);
    p.set(cx + 1, ty - 2, P.steel[6]);
    p.set(cx, ty - 3, P.steel[5]);
    p.set(cx - 1, ty - 4, P.steel[4]);
    p.set(cx - 2, ty - 5, P.steel[4]);
  } else {
    // cut forward
    p.set(cx + 3, ty + 1, P.cloth[3]);
    p.set(cx + 4, ty + 2, P.skin[4]);
    for (let k = 0; k < 4; k++) p.set(cx + 5 + k, ty + 3 + (k >> 1), k === 0 ? P.steel[6] : P.steel[5]);
    p.set(cx + 9, ty + 4, P.steel[3]);
  }
  p.outline(P.outline[0]);
}

// ───────────────────────────── stockade pieces ─────────────────────────────

export const YAPI_W = 16;
export const YAPI_H = 16;
/** 0 stakes bundle · 1 two stakes · 2 palisade · 3 earth barrel · 4 barrels+sacks · 5 gabion · 6 sack pile · 7 timber A-frame */
export const YAPI_FRAMES = 8;

function stake(p: PixelCanvas, x: number, by: number, h: number): void {
  for (let j = 0; j < h; j++) {
    p.set(x, by - j, j < 2 ? P.wood[3] : P.wood[5]);
    p.set(x + 1, by - j, P.wood[2]);
  }
  p.set(x, by - h, P.wood[6]);
  p.set(x + 1, by - h, P.wood[4]);
  p.set(x, by - h - 1, P.wood[5]); // sharpened tip
}

function barrel(p: PixelCanvas, x: number, by: number): void {
  for (let j = 0; j < 7; j++)
    for (let i = 0; i < 5; i++) {
      const c = i === 0 ? P.wood[6] : i === 1 ? P.wood[5] : i === 4 ? P.wood[2] : P.wood[4];
      p.set(x + i, by - j, c);
    }
  hline(p, x, x + 4, by - 1, P.steel[2]);
  hline(p, x, x + 4, by - 5, P.steel[2]);
  p.set(x, by - 5, P.steel[4]);
  p.set(x, by - 1, P.steel[4]);
  hline(p, x, x + 4, by - 7, P.dirt[3]);
  hline(p, x + 1, x + 3, by - 8, P.dirt[5]);
  p.set(x + 1, by - 8, P.dirt[6]);
}

function sack(p: PixelCanvas, x: number, y: number): void {
  hline(p, x + 1, x + 4, y, P.sand[5]);
  hline(p, x, x + 5, y + 1, P.sand[4]);
  hline(p, x, x + 5, y + 2, P.sand[3]);
  p.set(x + 5, y + 2, P.sand[1]);
  p.set(x + 5, y + 1, P.sand[2]);
  p.set(x + 2, y + 1, P.sand[2]); // tie
}

function drawYapi(p: PixelCanvas, f: number): void {
  const by = YAPI_H - 2;
  // ground shadow / scattered earth
  for (let i = 1; i < 14; i++) p.set(i + 1, by + 1, P.outline[2], 0.3);
  switch (f) {
    case 0: {
      // bundle of stakes lying on the ground, lashed
      for (let k = 0; k < 3; k++) {
        hline(p, 1 + k, 13 - k, by - k * 2, P.wood[3 + (k % 2)]);
        hline(p, 1 + k, 13 - k, by - 1 - k * 2, P.wood[5 + (k % 2)]);
        p.set(13 - k + 1, by - 1 - k * 2, P.wood[6]);
      }
      p.set(5, by - 4, P.dirt[2]);
      p.set(5, by - 3, P.dirt[2]);
      p.set(9, by - 4, P.dirt[2]);
      p.set(9, by - 3, P.dirt[2]);
      break;
    }
    case 1: {
      stake(p, 4, by, 7);
      stake(p, 9, by, 9);
      hline(p, 3, 12, by - 4, P.wood[2]);
      p.set(6, by, P.dirt[4]);
      p.set(7, by, P.dirt[3]);
      break;
    }
    case 2: {
      const hs = [8, 10, 9, 11, 8];
      for (let k = 0; k < 5; k++) stake(p, 1 + k * 3, by, hs[k]);
      hline(p, 0, 14, by - 3, P.wood[2]);
      hline(p, 0, 14, by - 6, P.wood[2]);
      hline(p, 0, 6, by - 6, P.wood[4]);
      hline(p, 0, 14, by, P.dirt[3]);
      break;
    }
    case 3: {
      barrel(p, 5, by);
      p.set(4, by, P.dirt[4]);
      p.set(10, by, P.dirt[2]);
      break;
    }
    case 4: {
      barrel(p, 2, by);
      barrel(p, 8, by - 1);
      sack(p, 4, by - 2);
      break;
    }
    case 5: {
      // wicker gabion filled with earth
      for (let j = 0; j < 8; j++)
        for (let i = 0; i < 7; i++) {
          let c: C = (i + j) % 2 ? P.wood[5] : P.wood[3];
          if (i === 0) c = (j % 2) ? P.wood[6] : P.wood[5];
          if (i === 6) c = P.wood[2];
          p.set(4 + i, by - j, c);
        }
      hline(p, 4, 10, by - 8, P.dirt[4]);
      hline(p, 5, 9, by - 9, P.dirt[5]);
      p.set(6, by - 9, P.dirt[6]);
      break;
    }
    case 6: {
      sack(p, 1, by - 2);
      sack(p, 7, by - 2);
      sack(p, 4, by - 5);
      sack(p, 9, by - 5);
      sack(p, 6, by - 8);
      break;
    }
    default: {
      // timber A-frame with a crossbar (stockade scaffold)
      p.line(2, by, 7, by - 11, P.wood[5]);
      p.line(3, by, 8, by - 11, P.wood[3]);
      p.line(13, by, 8, by - 11, P.wood[2]);
      p.line(12, by, 7, by - 11, P.wood[4]);
      hline(p, 4, 11, by - 5, P.wood[5]);
      hline(p, 4, 11, by - 4, P.wood[2]);
      p.set(7, by - 12, P.wood[6]);
      p.set(8, by - 12, P.dirt[2]); // lashing
      break;
    }
  }
  p.outline(P.outline[0]);
}

// ───────────────────────────── lantern pole & sparks ─────────────────────────────

export const FENER_W = 9;
export const FENER_H = 18;

function drawFener(p: PixelCanvas, f: number): void {
  // pole with a hook and a hanging lantern
  for (let j = 3; j < FENER_H - 1; j++) {
    p.set(2, j, j < 6 ? P.wood[5] : P.wood[4]);
    p.set(3, j, P.wood[2]);
  }
  p.set(1, FENER_H - 1, P.dirt[3]);
  p.set(4, FENER_H - 1, P.dirt[2]);
  hline(p, 2, 6, 3, P.wood[3]);
  p.set(6, 4, P.steel[2]);
  const sw = [0, 0, 1, 0][f & 3];
  const lx = 6 + sw;
  hline(p, lx - 1, lx + 1, 5, P.outline[1]);
  p.set(lx - 1, 6, P.outline[1]);
  p.set(lx + 1, 6, P.outline[1]);
  p.set(lx, 6, P.fire[f % 2 ? 6 : 7]);
  p.set(lx - 1, 7, P.fire[f % 3 === 0 ? 5 : 4]);
  p.set(lx, 7, P.fire[7]);
  p.set(lx + 1, 7, P.fire[3]);
  hline(p, lx - 1, lx + 1, 8, P.outline[1]);
  p.outline(P.outline[0]);
}

function drawSpark(p: PixelCanvas, f: number): void {
  const pts: [number, number, C][][] = [
    [[2, 2, P.fire[7]], [1, 1, P.fire[5]], [3, 1, P.fire[5]]],
    [[2, 2, P.fire[5]], [0, 0, P.fire[4]], [4, 0, P.fire[4]], [1, 3, P.wood[5]]],
    [[0, 1, P.fire[3]], [4, 1, P.fire[3]], [2, 4, P.wood[4]]],
  ];
  for (const [x, y, c] of pts[f]) p.set(x, y, c);
}

// ───────────────────────────── registration ─────────────────────────────

export function generateByzTextures(gen: TextureGen): void {
  const nA = ISCI_ACTS.length;
  gen.sheet('byz/isci', ISCI_W, ISCI_H, OUTFITS.length * nA * ISCI_FRAMES, (p, idx) => {
    const v = Math.floor(idx / (nA * ISCI_FRAMES));
    const a = Math.floor(idx / ISCI_FRAMES) % nA;
    const f = idx % ISCI_FRAMES;
    const act = ISCI_ACTS[a];
    drawWorker(p, OUTFITS[v], { walk: act === 'cekic' ? -1 : f, act, f });
  });
  for (let v = 0; v < OUTFITS.length; v++)
    for (let a = 0; a < nA; a++) {
      const act = ISCI_ACTS[a];
      const fps = act === 'cekic' ? 6 : act === 'fener' ? 6 : 8;
      const base = isciFrame(v, a, 0);
      gen.anim(isciAnim(v, act), 'byz/isci', [base, base + 1, base + 2, base + 3], fps);
    }

  gen.sheet('byz/sorti', ISCI_W, ISCI_H, SORTI_VARIANTS.length * SORTI_FRAMES, (p, idx) =>
    drawSortie(p, Math.floor(idx / SORTI_FRAMES), idx % SORTI_FRAMES),
  );
  SORTI_VARIANTS.forEach((name, v) => {
    const b = v * SORTI_FRAMES;
    gen.anim(`byz/sorti:${name}-kos`, 'byz/sorti', [b, b + 1, b + 2, b + 3], 11);
    gen.anim(`byz/sorti:${name}-vur`, 'byz/sorti', [b + 4, b + 5, b + 4, b + 5], 7);
  });

  gen.sheet('byz/yapi', YAPI_W, YAPI_H, YAPI_FRAMES, (p, f) => drawYapi(p, f));
  gen.sheet('byz/fener', FENER_W, FENER_H, 4, (p, f) => drawFener(p, f));
  gen.anim('byz/fener:yan', 'byz/fener', [0, 1, 2, 3], 5);
  gen.sheet('byz/kivilcim', 5, 5, 3, (p, f) => drawSpark(p, f));
  gen.anim('byz/kivilcim:cak', 'byz/kivilcim', [0, 1, 2], 14, 0);
}
