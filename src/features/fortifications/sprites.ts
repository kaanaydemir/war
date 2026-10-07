import { P } from '../../art/palette';
import type { PixelCanvas } from '../../art/pixel';
import type { TextureGen } from '../../art/texture';

/**
 * Hand-pixeled small sprites (pure drawing on PixelCanvas): wall defenders,
 * banners, torches, braziers, stockade props, repair crews, townsfolk, laundry,
 * pigeons & storks, orchard trees, cypresses, vines.
 * Light from the upper-left; selective dark outline on characters/props.
 */

type C = string;

// ───────────────────────────── figures ─────────────────────────────

export interface FigStyle {
  tunic: readonly C[];
  armor: 'pul' | 'zirh' | 'yok';
  helmet: 'konik' | 'sapka' | 'bork' | 'kukuleta' | 'yok';
  /** surcoat with a red cross (Genoese) */
  cross?: boolean;
  weapon: 'mizrak' | 'yay' | 'arbalet' | 'sancak' | 'cekic' | 'cuval' | 'yok';
  shield?: 'yuvarlak' | 'yok';
  skin?: number;
  legs?: readonly C[];
}

/** Draw a 7×13 figure facing LEFT (3/4) in a 16×20 frame; feet at y = 18. */
export function drawFigure(p: PixelCanvas, s: FigStyle, pose: { step?: number; bob?: number; aim?: number; arm?: number }): void {
  const ox = 5;
  const bob = pose.bob ?? 0;
  const step = pose.step ?? 0;
  const by = 18;
  const T = s.tunic;
  const skin = P.skin[s.skin ?? 4];
  const skinD = P.skin[(s.skin ?? 4) - 2];
  const legs = s.legs ?? P.cloth.slice(0, 3);
  // legs (walk cycle: step −1, 0, 1)
  const lx1 = ox + 2 + (step > 0 ? -1 : 0);
  const lx2 = ox + 4 + (step < 0 ? 1 : 0);
  p.rect(lx1, by - 3, 1, 3, legs[1]);
  p.rect(lx2, by - 3, 1, 3, legs[0]);
  p.set(lx1 - 1, by - 1, P.wood[1]);
  p.set(lx1, by - 1, P.wood[2]);
  p.set(lx2, by - 1, P.wood[1]);
  p.set(lx2 + 1, by - 1, P.wood[1]);
  const ty = by - 9 + bob;
  // tunic skirt
  p.rect(ox + 1, ty + 5, 5, 2, T[2]);
  p.set(ox + 1, ty + 5, T[3]);
  p.set(ox + 5, ty + 6, T[1]);
  // torso
  if (s.armor === 'pul') {
    // lamellar / scale: alternating steel rows
    for (let y = 0; y < 5; y++)
      for (let x = 0; x < 5; x++) {
        const c = (x + y) % 2 === 0 ? P.steel[3] : P.steel[2];
        p.set(ox + 1 + x, ty + y, x === 0 ? P.steel[4] : x === 4 ? P.steel[1] : c);
      }
    p.rect(ox + 1, ty + 4, 5, 1, P.wood[2]); // belt
  } else if (s.armor === 'zirh') {
    p.rect(ox + 1, ty, 5, 5, P.steel[3]);
    p.rect(ox + 1, ty, 1, 5, P.steel[4]);
    p.rect(ox + 5, ty, 1, 5, P.steel[1]);
    p.rect(ox + 1, ty + 4, 5, 1, P.wood[2]);
  } else {
    p.rect(ox + 1, ty, 5, 5, T[3]);
    p.rect(ox + 1, ty, 1, 5, T[4]);
    p.rect(ox + 5, ty, 1, 5, T[2]);
    p.rect(ox + 1, ty + 4, 5, 1, P.wood[2]);
  }
  if (s.cross) {
    // white surcoat with the red cross of Genoa
    p.rect(ox + 1, ty, 5, 6, P.cloth[4]);
    p.rect(ox + 1, ty, 1, 6, P.cloth[5]);
    p.rect(ox + 5, ty, 1, 6, P.cloth[2]);
    p.rect(ox + 3, ty, 1, 6, P.red[4]);
    p.rect(ox + 1, ty + 2, 5, 1, P.red[4]);
  }
  // head
  const hy = ty - 4;
  p.rect(ox + 2, hy + 1, 3, 3, skin);
  p.set(ox + 4, hy + 2, skinD);
  p.set(ox + 2, hy + 2, P.outline[1]); // eye (facing left)
  p.set(ox + 3, hy + 3, P.skin[2]);
  switch (s.helmet) {
    case 'konik':
      p.rect(ox + 1, hy, 5, 2, P.steel[3]);
      p.set(ox + 1, hy, P.steel[5]);
      p.rect(ox + 2, hy - 1, 3, 1, P.steel[4]);
      p.set(ox + 3, hy - 2, P.steel[5]);
      p.set(ox + 5, hy + 1, P.steel[1]);
      break;
    case 'sapka': // kettle hat
      p.rect(ox, hy + 1, 7, 1, P.steel[2]);
      p.rect(ox + 2, hy - 1, 3, 2, P.steel[4]);
      p.set(ox, hy + 1, P.steel[4]);
      break;
    case 'bork': // janissary börk (tall white felt cap)
      p.rect(ox + 2, hy - 3, 3, 4, P.turban[2]);
      p.rect(ox + 2, hy - 3, 1, 4, P.turban[3]);
      p.rect(ox + 4, hy - 4, 2, 3, P.turban[1]);
      p.set(ox + 1, hy, P.gold[4]);
      break;
    case 'kukuleta':
      p.rect(ox + 1, hy, 5, 2, T[2]);
      p.set(ox + 1, hy, T[4]);
      p.rect(ox + 5, hy + 1, 1, 3, T[1]);
      break;
    default:
      p.rect(ox + 2, hy, 3, 1, P.wood[1]);
  }
  // arms + weapon
  const arm = pose.arm ?? 0;
  switch (s.weapon) {
    case 'mizrak': {
      const sx = ox + 1;
      p.rect(sx, hy - 6 + arm, 1, 18, P.wood[3]);
      p.set(sx, hy - 7 + arm, P.steel[5]);
      p.set(sx, hy - 8 + arm, P.steel[4]);
      p.set(sx, ty + 2, skin);
      break;
    }
    case 'yay': {
      const a = pose.aim ?? 0;
      if (a > 0) {
        // drawn bow held out to the left
        const bx = ox - 1;
        for (let y = -3; y <= 3; y++) p.set(bx + (Math.abs(y) === 3 ? 1 : 0), ty + 1 + y, P.wood[4]);
        p.line(bx + 1, ty - 2, ox + 3 + (a > 1 ? 1 : 0), ty + 1, P.cloth[4]);
        p.line(bx + 1, ty + 4, ox + 3 + (a > 1 ? 1 : 0), ty + 1, P.cloth[4]);
        p.rect(ox, ty + 1, 4, 1, skin);
        if (a === 1) p.rect(bx - 1, ty + 1, 4, 1, P.wood[5]);
      } else {
        for (let y = -3; y <= 3; y++) p.set(ox + 6 + (Math.abs(y) === 3 ? -1 : 0), ty + 2 + y, P.wood[4]);
        p.set(ox + 5, ty + 2, skin);
      }
      break;
    }
    case 'arbalet': {
      const a = pose.aim ?? 0;
      if (a > 0) {
        p.rect(ox - 2, ty + 1, 6, 1, P.wood[3]);
        p.rect(ox - 2, ty, 1, 3, P.steel[3]);
        p.set(ox + 2, ty + 1, skin);
        if (a === 2) p.set(ox - 3, ty + 1, P.wood[6]);
      } else {
        p.rect(ox + 5, ty - 1, 1, 6, P.wood[3]);
        p.rect(ox + 4, ty - 1, 3, 1, P.steel[3]);
      }
      break;
    }
    case 'sancak': {
      p.rect(ox + 1, hy - 9, 1, 20, P.wood[3]);
      p.set(ox + 1, hy - 10, P.gold[5]);
      break;
    }
    case 'cekic': {
      const up = arm > 0;
      p.rect(ox - 1, ty + (up ? -2 : 2), 1, 3, P.wood[3]);
      p.rect(ox - 2, ty + (up ? -3 : 1), 3, 1, P.steel[2]);
      p.set(ox, ty + 1, skin);
      break;
    }
    case 'cuval': {
      p.rect(ox + 1, hy - 1, 5, 3, P.sand[2]);
      p.rect(ox + 1, hy - 1, 5, 1, P.sand[4]);
      p.set(ox + 5, hy + 1, P.sand[1]);
      break;
    }
    default:
      break;
  }
  if (s.shield === 'yuvarlak') {
    p.disc(ox + 5, ty + 2, 2, T[2]);
    p.set(ox + 4, ty + 1, T[4]);
    p.set(ox + 5, ty + 2, P.gold[4]);
  }
  p.outline(P.outline[1]);
}

export const FIG = {
  mizrak: { tunic: P.red, armor: 'pul', helmet: 'konik', weapon: 'mizrak', shield: 'yuvarlak' } as FigStyle,
  mizrakMavi: { tunic: P.blue, armor: 'pul', helmet: 'konik', weapon: 'mizrak', shield: 'yuvarlak' } as FigStyle,
  okcu: { tunic: P.blue, armor: 'yok', helmet: 'kukuleta', weapon: 'yay' } as FigStyle,
  okcuKirmizi: { tunic: P.red, armor: 'zirh', helmet: 'konik', weapon: 'yay' } as FigStyle,
  ceneviz: { tunic: P.cloth, armor: 'zirh', helmet: 'sapka', cross: true, weapon: 'arbalet' } as FigStyle,
  venedik: { tunic: P.red, armor: 'zirh', helmet: 'sapka', weapon: 'mizrak', shield: 'yuvarlak' } as FigStyle,
  osmanli: { tunic: P.red, armor: 'yok', helmet: 'bork', weapon: 'sancak' } as FigStyle,
  isci: { tunic: P.dryGrass, armor: 'yok', helmet: 'kukuleta', weapon: 'cuval', skin: 3 } as FigStyle,
  isciCekic: { tunic: P.wood, armor: 'yok', helmet: 'yok', weapon: 'cekic', skin: 3 } as FigStyle,
};

/** Defender frame layout: 0-1 idle, 2-5 walk, 6 look, 7-9 shoot (aim 1, 2, release). */
export const DEF_FRAMES = 10;

function figureSheet(gen: TextureGen, key: string, st: FigStyle): void {
  gen.sheet(key, 16, 20, DEF_FRAMES, (p, f) => {
    if (f === 0) drawFigure(p, st, {});
    else if (f === 1) drawFigure(p, st, { bob: 1 });
    else if (f >= 2 && f <= 5) drawFigure(p, st, { step: [1, 0, -1, 0][f - 2], bob: f % 2 === 0 ? 0 : 1 });
    else if (f === 6) drawFigure(p, st, { bob: 0, arm: -1 });
    else if (f === 7) drawFigure(p, st, { aim: 1 });
    else if (f === 8) drawFigure(p, st, { aim: 2 });
    else drawFigure(p, st, { aim: 1, arm: 1 });
  });
  gen.anim(key + ':idle', key, [0, 0, 0, 1, 1, 0, 0, 1], 3);
  gen.anim(key + ':walk', key, [2, 3, 4, 5], 7);
  gen.anim(key + ':shoot', key, [7, 8, 8, 9, 0], 8, 0);
}

// ───────────────────────────── banners ─────────────────────────────

export type BannerKind = 'bizans' | 'bizans2' | 'venedik' | 'ceneviz' | 'osmanli' | 'osmanliBeyaz' | 'osmanliYesil';
export const BANNER_FRAMES = 6;
export const BANNER_W = 20;
export const BANNER_H = 26;

/** Cloth emblem in flat cloth space (w × h). Returns a color or null. */
function emblem(kind: BannerKind, x: number, y: number, w: number, h: number): C {
  const cx = x - w / 2 + 0.5;
  const cy = y - h / 2 + 0.5;
  switch (kind) {
    case 'bizans': {
      // red field, golden double-headed eagle
      const ex = Math.abs(cx);
      const eagle =
        (y >= 3 && y <= 4 && ex >= 1 && ex <= 5) || // wings
        (y === 5 && ex >= 2 && ex <= 4) ||
        (y >= 2 && y <= 6 && ex < 1) || // body
        (y === 1 && ex >= 1.5 && ex <= 2.5) || // heads
        (y === 2 && ex >= 1 && ex <= 2) ||
        (y === 7 && ex >= 1 && ex <= 1.5);
      if (eagle) return y === 1 || (y === 3 && ex > 4) ? P.gold[6] : P.gold[5];
      return P.red[4];
    }
    case 'bizans2': {
      // gold field, red cross with four Bs
      if (Math.abs(cx) < 1 || Math.abs(cy) < 1) return P.red[4];
      const qx = Math.abs(cx) - 1;
      const qy = Math.abs(cy) - 1;
      const bx = Math.floor(qx) - 1;
      const by = Math.floor(qy) - 0;
      if (bx >= 0 && bx <= 1 && by >= 0 && by <= 2 && !(bx === 1 && by === 1)) return P.red[3];
      return P.gold[5];
    }
    case 'venedik': {
      // red field, golden lion of St Mark (blocky winged lion)
      const lion =
        (y >= 3 && y <= 5 && cx > -4 && cx < 3) ||
        (y >= 1 && y <= 3 && cx > -5 && cx < -2) ||
        (y === 2 && cx > 0 && cx < 4) ||
        (y >= 6 && y <= 7 && (Math.abs(cx + 3) < 0.6 || Math.abs(cx - 1.5) < 0.6));
      if (lion) return y <= 2 ? P.gold[6] : P.gold[5];
      return P.red[4];
    }
    case 'ceneviz':
      if (Math.abs(cx) < 1 || Math.abs(cy) < 1) return P.red[4];
      return P.cloth[5];
    case 'osmanli':
      return P.red[4];
    case 'osmanliBeyaz':
      return P.cloth[5];
    case 'osmanliYesil':
      return P.green[4];
  }
}

function drawBanner(p: PixelCanvas, kind: BannerKind, frame: number, big: boolean): void {
  const poleX = 2;
  const poleTop = 2;
  const cw = big ? 15 : 12;
  const ch = big ? 10 : 8;
  // pole
  p.rect(poleX, poleTop, 1, BANNER_H - poleTop - 1, P.wood[2]);
  p.set(poleX, poleTop, P.gold[5]);
  p.set(poleX, poleTop - 1, P.gold[6]);
  const swallow = kind.startsWith('osmanli');
  const ph = (frame / BANNER_FRAMES) * Math.PI * 2;
  for (let x = 0; x < cw; x++) {
    const amp = 0.5 + x * 0.12;
    const off = Math.round(Math.sin(ph - x * 0.55) * amp);
    const slope = Math.cos(ph - x * 0.55);
    for (let y = 0; y < ch; y++) {
      // swallowtail cut on Ottoman banners
      if (swallow && x > cw - 4 && Math.abs(y - (ch - 1) / 2) < (x - (cw - 4)) * 0.9) continue;
      const c = emblem(kind, x, y, cw, ch);
      const px = poleX + 1 + x;
      const py = poleTop + 1 + y + off;
      p.set(px, py, c);
      // fold shading: folds turned toward the light brighten, the others darken
      if (slope < -0.45) p.set(px, py, P.outline[1], 0.3);
      else if (slope > 0.5) p.set(px, py, '#fff6dc', 0.2);
    }
  }
  p.outline(P.outline[1]);
}

// ───────────────────────────── fire props ─────────────────────────────

function flame(p: PixelCanvas, cx: number, by: number, f: number, size: number): void {
  const hs = [5, 6, 4, 6, 5, 4];
  const h = Math.round(hs[f % hs.length] * size);
  for (let y = 0; y < h; y++) {
    const t = y / h;
    const w = Math.max(0, Math.round((1 - t) * 2 * size + (y === 0 ? 0 : 0)));
    const sway = Math.round(Math.sin(f * 1.7 + y * 0.9) * t * 1.2);
    for (let x = -w; x <= w; x++) {
      const core = Math.abs(x) <= w - 1 && t < 0.55;
      p.set(cx + x + sway, by - y, core ? (t < 0.3 ? P.fire[6] : P.fire[5]) : t > 0.7 ? P.fire[3] : P.fire[4]);
    }
  }
  if (f % 2 === 0) p.set(cx + (f % 3) - 1, by - h - 1, P.fire[5]);
}

// ───────────────────────────── trees ─────────────────────────────

function blob(p: PixelCanvas, cx: number, cy: number, rx: number, ry: number, ramp: readonly C[], seed: number, sway: number): void {
  for (let y = -ry; y <= ry; y++)
    for (let x = -rx; x <= rx; x++) {
      const nx = x / rx;
      const ny = y / ry;
      const n = Math.sin((x + seed) * 2.1) * Math.cos((y - seed) * 1.7) * 0.18;
      const d = nx * nx + ny * ny + n;
      if (d > 1) continue;
      // light from upper-left
      const l = -nx * 0.55 - ny * 0.75 + (1 - d) * 0.4;
      const idx = Math.max(1, Math.min(ramp.length - 1, Math.round(2.6 + l * 2.6 + ((x * 7 + y * 13 + seed) % 3 === 0 ? -0.6 : 0))));
      p.set(cx + x + (y < 0 ? sway : 0), cy + y, ramp[idx]);
    }
}

function drawTree(p: PixelCanvas, v: number, sway: number): void {
  // fruit tree (orchard): short trunk, round crown
  const w = p.w;
  const cx = Math.floor(w / 2);
  const by = p.h - 1;
  p.rect(cx, by - 5, 1, 5, P.wood[2]);
  p.set(cx - 1, by, P.wood[1]);
  p.set(cx + 1, by - 3, P.wood[1]);
  const ramp = v === 2 ? P.grass : P.foliage;
  blob(p, cx, by - 9, 5, 4, ramp, v * 3, sway);
  if (v === 1) {
    // ripe fruit / blossom dots
    for (let k = 0; k < 5; k++) p.set(cx - 3 + ((k * 5) % 7), by - 11 + ((k * 3) % 5), k % 2 ? P.red[5] : P.gold[5]);
  }
  p.outline(P.outline[2]);
}

function drawCypress(p: PixelCanvas, v: number, sway: number): void {
  const cx = Math.floor(p.w / 2);
  const by = p.h - 1;
  const H = v === 0 ? 17 : 14;
  for (let y = 0; y < H; y++) {
    const t = y / H;
    const r = Math.max(0.6, Math.sin(Math.min(1, (1 - t) * 1.25) * Math.PI) * 2.3 * (t < 0.12 ? t / 0.12 + 0.3 : 1));
    const sw = Math.round(sway * t * t);
    for (let x = -Math.ceil(r); x <= Math.ceil(r); x++) {
      if (Math.abs(x) > r) continue;
      const lit = x < 0 ? 3 : x === 0 ? 2 : 1;
      const k = (x * 5 + y * 3) % 4 === 0 ? -1 : 0;
      p.set(cx + x + sw, by - 1 - y, P.cypress[Math.max(0, Math.min(4, lit + k + (t > 0.85 ? 1 : 0)))]);
    }
  }
  p.set(cx, by, P.wood[1]);
  p.outline(P.outline[1]);
}

function drawOlive(p: PixelCanvas, v: number, sway: number): void {
  const cx = Math.floor(p.w / 2);
  const by = p.h - 1;
  p.line(cx, by, cx - 1, by - 4, P.wood[3]);
  p.line(cx, by, cx + 2, by - 3, P.wood[2]);
  const olive = ['#2d3a2c', '#43533a', '#5d6e48', '#7d8c5a', '#a0ab78'];
  blob(p, cx - 1, by - 7, 4, 3, olive, v * 5 + 1, sway);
  blob(p, cx + 3, by - 6, 3, 2, olive, v * 5 + 2, sway);
  p.outline(P.outline[2]);
}

function drawVine(p: PixelCanvas, v: number, sway: number): void {
  // a row of vines on stakes, running along the iso tx axis (down-right)
  for (let k = 0; k < 4; k++) {
    const x = 1 + k * 4;
    const y = 3 + k * 2;
    p.rect(x + 1, y - 2, 1, 4, P.wood[3]);
    for (let j = -1; j <= 2; j++) p.set(x + j + (j < 1 ? sway : 0), y - 2 + Math.abs(j % 2), v ? P.grass[4 + (j & 1)] : P.grass[3 + (j & 1)]);
    p.set(x + 1, y - 3, P.grass[5]);
    if (v === 1) p.set(x + 2, y, P.purple[3]);
  }
  p.outline(P.outline[2]);
}

// ───────────────────────────── townsfolk, laundry, birds ─────────────────────────────

const PEOPLE: { body: readonly C[]; head: C }[] = [
  { body: P.blue, head: P.cloth[4] },
  { body: P.red, head: P.wood[2] },
  { body: P.dryGrass, head: P.cloth[3] },
  { body: P.purple, head: P.cloth[5] },
  { body: P.cloth, head: P.wood[1] },
  { body: P.green, head: P.cloth[4] },
];

function drawPerson(p: PixelCanvas, v: number, f: number): void {
  const c = PEOPLE[v % PEOPLE.length];
  const ox = 2;
  const by = 11;
  const step = [1, 0, -1, 0][f % 4];
  // legs
  p.set(ox + 1 + (step > 0 ? -1 : 0), by, P.outline[2]);
  p.set(ox + 2 + (step < 0 ? 1 : 0), by, P.outline[2]);
  // robe
  p.rect(ox, by - 5, 4, 5, c.body[3]);
  p.rect(ox, by - 5, 1, 5, c.body[4]);
  p.rect(ox + 3, by - 5, 1, 5, c.body[2]);
  // head
  p.rect(ox + 1, by - 7, 2, 2, P.skin[4]);
  p.rect(ox + 1, by - 8, 2, 1, c.head);
  if (v % 3 === 1) p.rect(ox, by - 7, 1, 3, c.head); // veil
  if (v % 4 === 2) {
    // basket / jar on the shoulder
    p.rect(ox + 3, by - 8, 2, 2, P.bronze[3]);
  }
  p.outline(P.outline[1]);
}

function drawLaundry(p: PixelCanvas, f: number): void {
  // a line strung between two poles with flapping cloths
  const w = p.w;
  p.rect(0, 2, 1, 8, P.wood[2]);
  p.rect(w - 1, 0, 1, 8, P.wood[2]);
  p.line(0, 2, w - 1, 0, P.wood[4]);
  const cols = [P.cloth[5], P.blue[4], P.red[5], P.cloth[4], P.gold[5]];
  for (let k = 0; k < 4; k++) {
    const x = 2 + k * 3;
    const y = 2 - Math.round((x / (w - 1)) * 2) + 1;
    const flap = Math.round(Math.sin(f * 1.6 + k * 1.3));
    for (let j = 0; j < 3; j++) p.set(x + (j === 2 ? flap : 0), y + j, cols[(k + f) % cols.length]);
    p.set(x + 1, y, cols[k % cols.length]);
    p.set(x + 1, y + 1 + (flap > 0 ? 1 : 0), cols[k % cols.length]);
  }
}

function drawPigeon(p: PixelCanvas, f: number): void {
  const peck = f === 2;
  p.rect(1, 2, 3, 2, P.steel[3]);
  p.set(1, 2, P.steel[4]);
  p.set(3, 3, P.steel[2]);
  if (peck) p.set(0, 3, P.steel[4]);
  else p.set(0, 1 + (f === 1 ? 1 : 0), P.steel[4]);
  p.set(4, 2, P.steel[1]);
  p.set(1, 4, P.red[5]);
  p.set(3, 4, P.red[5]);
}

function drawStork(p: PixelCanvas, f: number): void {
  // stork standing in its nest on a dome/roof ridge
  p.rect(1, 9, 7, 2, P.wood[3]);
  p.set(1, 9, P.wood[4]);
  p.set(7, 10, P.wood[1]);
  p.rect(3, 4, 3, 4, P.cloth[5]);
  p.rect(5, 5, 2, 2, P.outline[1]); // black wing tips
  p.rect(4, 8, 1, 1, P.red[5]);
  const up = f === 1;
  p.set(3, up ? 1 : 2, P.cloth[5]);
  p.set(3, 3, P.cloth[5]);
  p.rect(1, up ? 0 : 2, 2, 1, P.red[5]); // bill (clattering)
  if (up) p.set(1, 1, P.red[4]);
  p.outline(P.outline[1]);
}

// ───────────────────────────── stockade props ─────────────────────────────

/** frames: 0-1 palisade (two stake patterns), 2 barrel, 3 sacks, 4 beams, 5 gabion, 6 ladder-plank */
export const PROP_FRAMES = 7;

function drawProp(p: PixelCanvas, f: number): void {
  const by = p.h - 1;
  switch (f) {
    case 0:
    case 1: {
      // palisade of sharpened stakes lashed to a rail
      const hs = f === 0 ? [11, 9, 12, 10] : [10, 12, 9, 11];
      for (let k = 0; k < 4; k++) {
        const x = 1 + k * 3;
        const h = hs[k];
        p.rect(x, by - h, 2, h, P.wood[3]);
        p.rect(x, by - h, 1, h, P.wood[5]);
        p.set(x + 1, by - h - 1, P.wood[2]);
        p.set(x, by - h, P.wood[6]);
      }
      p.rect(0, by - 6, 13, 1, P.wood[2]);
      p.rect(0, by - 3, 13, 1, P.wood[2]);
      break;
    }
    case 2: {
      // barrel filled with earth
      p.rect(3, by - 7, 6, 7, P.wood[3]);
      p.rect(3, by - 7, 2, 7, P.wood[5]);
      p.rect(8, by - 7, 1, 7, P.wood[1]);
      p.rect(3, by - 6, 6, 1, P.steel[2]);
      p.rect(3, by - 2, 6, 1, P.steel[2]);
      p.rect(4, by - 8, 4, 1, P.dirt[4]);
      break;
    }
    case 3: {
      // sacks of earth
      for (const [x, y] of [
        [1, by - 3],
        [6, by - 3],
        [3, by - 6],
      ]) {
        p.rect(x, y, 5, 3, P.sand[2]);
        p.rect(x, y, 5, 1, P.sand[4]);
        p.set(x + 4, y + 2, P.sand[1]);
        p.set(x, y + 1, P.sand[3]);
      }
      break;
    }
    case 4: {
      // stacked beams
      for (let k = 0; k < 3; k++) {
        p.rect(1 + k, by - 2 - k * 2, 11, 2, P.wood[3 + (k & 1)]);
        p.rect(1 + k, by - 2 - k * 2, 11, 1, P.wood[5]);
        p.set(11 + k, by - 1 - k * 2, P.wood[1]);
      }
      break;
    }
    case 5: {
      // wicker gabion
      for (let y = 0; y < 7; y++)
        for (let x = 0; x < 6; x++) p.set(3 + x, by - 7 + y, (x + y) % 2 ? P.wood[4] : P.wood[3]);
      p.rect(3, by - 8, 6, 1, P.dirt[4]);
      p.rect(8, by - 7, 1, 7, P.wood[1]);
      break;
    }
    default: {
      p.line(1, by - 1, 11, by - 6, P.wood[4]);
      p.line(1, by, 11, by - 5, P.wood[2]);
    }
  }
  p.outline(P.outline[1]);
}

// ───────────────────────────── registration ─────────────────────────────

export function generateSpriteTextures(gen: TextureGen): void {
  figureSheet(gen, 'fort/asker-mizrak', FIG.mizrak);
  figureSheet(gen, 'fort/asker-mizrak2', FIG.mizrakMavi);
  figureSheet(gen, 'fort/asker-okcu', FIG.okcu);
  figureSheet(gen, 'fort/asker-okcu2', FIG.okcuKirmizi);
  figureSheet(gen, 'fort/asker-ceneviz', FIG.ceneviz);
  figureSheet(gen, 'fort/asker-venedik', FIG.venedik);
  figureSheet(gen, 'fort/asker-osmanli', FIG.osmanli);
  figureSheet(gen, 'fort/isci', FIG.isci);
  figureSheet(gen, 'fort/isci-cekic', FIG.isciCekic);
  gen.anim('fort/isci-cekic:work', 'fort/isci-cekic', [6, 0, 6, 1], 5);

  const banners: BannerKind[] = ['bizans', 'bizans2', 'venedik', 'ceneviz', 'osmanli', 'osmanliBeyaz', 'osmanliYesil'];
  for (const b of banners) {
    for (const big of [false, true]) {
      const key = `fort/sancak-${b}${big ? '-buyuk' : ''}`;
      gen.sheet(key, BANNER_W, BANNER_H, BANNER_FRAMES, (p, f) => drawBanner(p, b, f, big));
      gen.anim(key + ':dalga', key, [0, 1, 2, 3, 4, 5], 8);
    }
  }

  gen.sheet('fort/mesale', 7, 12, 6, (p, f) => {
    p.rect(3, 6, 1, 6, P.wood[2]);
    p.rect(2, 6, 3, 1, P.steel[2]);
    flame(p, 3, 5, f, 0.8);
  });
  gen.anim('fort/mesale:yan', 'fort/mesale', [0, 1, 2, 3, 4, 5], 10);
  gen.sheet('fort/mangal', 11, 14, 6, (p, f) => {
    // iron brazier on three legs
    p.rect(2, 8, 7, 3, P.steel[1]);
    p.rect(2, 8, 7, 1, P.steel[3]);
    p.set(3, 11, P.steel[1]);
    p.set(7, 11, P.steel[1]);
    p.set(5, 12, P.steel[1]);
    p.set(3, 12, P.steel[0]);
    p.set(7, 12, P.steel[0]);
    flame(p, 5, 8, f, 1.15);
    p.set(4, 8, P.fire[6]);
    p.set(6, 8, P.fire[5]);
  });
  gen.anim('fort/mangal:yan', 'fort/mangal', [0, 1, 2, 3, 4, 5], 9);

  gen.sheet('fort/barikat', 14, 14, PROP_FRAMES, (p, f) => drawProp(p, f));

  gen.sheet('city/agac', 13, 16, 6, (p, f) => drawTree(p, f % 3, f >= 3 ? 1 : 0));
  gen.sheet('city/servi', 7, 20, 4, (p, f) => drawCypress(p, f % 2, f >= 2 ? 1 : 0));
  gen.sheet('city/zeytin', 13, 12, 6, (p, f) => drawOlive(p, f % 3, f >= 3 ? 1 : 0));
  gen.sheet('city/bag', 18, 12, 4, (p, f) => drawVine(p, f % 2, f >= 2 ? 1 : 0));

  gen.sheet('city/insan', 8, 13, 24, (p, f) => drawPerson(p, Math.floor(f / 4), f % 4));
  for (let v = 0; v < 6; v++) gen.anim(`city/insan:${v}`, 'city/insan', [v * 4, v * 4 + 1, v * 4 + 2, v * 4 + 3], 6);
  gen.sheet('city/camasir', 16, 9, 4, (p, f) => drawLaundry(p, f));
  gen.anim('city/camasir:dalga', 'city/camasir', [0, 1, 2, 3], 4);
  gen.sheet('city/guvercin', 5, 5, 3, (p, f) => drawPigeon(p, f));
  gen.anim('city/guvercin:dur', 'city/guvercin', [0, 0, 0, 1, 0, 0, 2, 0, 2, 0], 4);
  gen.sheet('city/leylek', 9, 12, 2, (p, f) => drawStork(p, f));
  gen.anim('city/leylek:dur', 'city/leylek', [0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0], 4);
}
