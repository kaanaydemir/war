import { P } from '../../art/palette';
import type { PixelCanvas } from '../../art/pixel';
import type { TextureGen } from '../../art/texture';
import { ball, cone, hline, ri, sack, shadowEllipse, stoneBlock, vline, type Ramp } from './artKit';

/**
 * Characters, animals and small animated props for economy (keys 'econ/…').
 * Figures face RIGHT; render mirrors with flipX for left-walking.
 */

export interface Outfit {
  shirt: [string, string];
  vest?: [string, string];
  sash: string;
  pants: [string, string];
  cap: 'bork' | 'kulah' | 'sarik' | 'akbork' | 'none';
  capC: [string, string];
  skin?: [string, string];
  apron?: boolean;
}

export const OUTFITS: Record<string, Outfit> = {
  amele: { shirt: [P.cloth[4], P.cloth[2]], vest: [P.wood[4], P.wood[3]], sash: P.red[4], pants: [P.dirt[4], P.dirt[3]], cap: 'bork', capC: [P.red[5], P.red[3]] },
  amele2: { shirt: [P.sand[4], P.sand[2]], sash: P.green[3], pants: [P.blue[2], P.blue[1]], cap: 'sarik', capC: [P.turban[3], P.turban[1]], skin: [P.skin[3], P.skin[2]] },
  usta: { shirt: [P.cloth[3], P.cloth[2]], vest: [P.blue[3], P.blue[2]], sash: P.gold[3], pants: [P.dirt[3], P.dirt[2]], cap: 'kulah', capC: [P.cloth[5], P.cloth[3]], apron: true },
  yeniceri: { shirt: [P.red[4], P.red[3]], vest: [P.blue[2], P.blue[1]], sash: P.gold[4], pants: [P.blue[2], P.blue[1]], cap: 'akbork', capC: [P.turban[3], P.turban[1]] },
  saka: { shirt: [P.cloth[4], P.cloth[2]], vest: [P.green[3], P.green[2]], sash: P.red[3], pants: [P.dirt[4], P.dirt[3]], cap: 'kulah', capC: [P.sand[4], P.sand[2]] },
  surucu: { shirt: [P.sand[3], P.sand[1]], vest: [P.wood[3], P.wood[2]], sash: P.red[4], pants: [P.dirt[3], P.dirt[2]], cap: 'sarik', capC: [P.cloth[4], P.cloth[2]] },
  tuccar: { shirt: [P.green[4], P.green[3]], sash: P.gold[4], pants: [P.dirt[3], P.dirt[2]], cap: 'sarik', capC: [P.turban[3], P.turban[1]] },
};

export interface Pose {
  /** Walk phase 0..3 (−1 = standing). */
  walk: number;
  /** Front arm: 'swing' follows walk; 'up' raised; 'mid'; 'down' forward-low; 'carry' at shoulder. */
  arm: 'swing' | 'up' | 'mid' | 'down' | 'carry' | 'push' | 'pull';
  /** Body bob (−1 = up). */
  bob?: number;
  /** Crouch (kneeling worker). */
  kneel?: boolean;
}

/**
 * Draw a person (≈7×13) facing right with feet at (cx, fy). Pixel-level, lit from the upper-left.
 */
export function drawFigure(p: PixelCanvas, cx: number, fy: number, o: Outfit, pose: Pose): void {
  const skin = o.skin ?? [P.skin[4], P.skin[3]];
  const bob = pose.bob ?? (pose.walk === 1 || pose.walk === 3 ? -1 : 0);
  const k = pose.kneel ? 2 : 0;
  const y0 = fy + bob + k; // feet line
  // legs
  const leg = (x: number, dx: number, c: string) => {
    for (let j = 0; j < 4 - k; j++) {
      const sh = j >= 2 ? dx : 0;
      p.set(x + sh, y0 - 4 + j + k, c);
      p.set(x + 1 + sh, y0 - 4 + j + k, c);
    }
    p.set(x + dx + (dx >= 0 ? 1 : 0), y0, P.outline[2]); // shoe
    p.set(x + dx + (dx >= 0 ? 2 : 1), y0, P.outline[2]);
  };
  const ph = pose.walk;
  const fwd = ph === 0 ? 1 : ph === 2 ? -1 : 0;
  leg(cx - 2, -fwd, o.pants[1]);
  leg(cx, fwd, o.pants[0]);
  if (pose.kneel) {
    hline(p, cx - 2, cx + 2, y0 - 1, o.pants[1]);
  }
  // torso (5 wide, 5 tall)
  const ty = y0 - 9 + k;
  for (let j = 0; j < 5; j++)
    for (let i = -2; i <= 2; i++) {
      let c = i <= 0 ? o.shirt[0] : o.shirt[1];
      if (o.vest && (i === -2 || i === 2) && j < 4) c = i < 0 ? o.vest[0] : o.vest[1];
      if (o.apron && i >= 0 && j >= 2) c = i === 0 ? P.wood[5] : P.wood[4];
      if (j === 3) c = o.sash;
      p.set(cx + i, ty + j, c);
    }
  p.set(cx - 2, ty, o.shirt[0]);
  // back arm (darker)
  const backArm = pose.arm === 'swing' ? (ph === 0 ? 1 : ph === 2 ? -1 : 0) : 0;
  p.set(cx - 3, ty + 1, o.shirt[1]);
  p.set(cx - 3 - (backArm > 0 ? 0 : 0), ty + 2, o.shirt[1]);
  p.set(cx - 3 + (backArm < 0 ? -1 : 0), ty + 3, skin[1]);
  // head
  const hy = ty - 4;
  for (let j = 0; j < 3; j++)
    for (let i = -1; i <= 1; i++) p.set(cx + i, hy + j + 1, i < 1 ? skin[0] : skin[1]);
  p.set(cx + 2, hy + 2, skin[1]); // nose
  p.set(cx + 1, hy + 2, P.outline[1]); // eye
  p.set(cx - 1, hy + 3, skin[1]);
  // beard for some
  if (o.cap === 'sarik' || o.cap === 'akbork') p.set(cx + 1, hy + 3, P.dirt[1]);
  // cap
  switch (o.cap) {
    case 'bork':
      hline(p, cx - 1, cx + 1, hy, o.capC[0]);
      p.set(cx + 1, hy, o.capC[1]);
      hline(p, cx - 1, cx, hy - 1, o.capC[0]);
      p.set(cx - 2, hy + 1, o.capC[1]);
      break;
    case 'kulah':
      hline(p, cx - 1, cx + 1, hy, o.capC[0]);
      p.set(cx + 1, hy, o.capC[1]);
      p.set(cx, hy - 1, o.capC[0]);
      p.set(cx - 1, hy - 1, o.capC[0]);
      p.set(cx - 1, hy - 2, o.capC[1]);
      break;
    case 'sarik':
      hline(p, cx - 2, cx + 1, hy + 1, o.capC[0]);
      hline(p, cx - 1, cx + 1, hy, o.capC[0]);
      p.set(cx + 1, hy + 1, o.capC[1]);
      p.set(cx + 1, hy, o.capC[1]);
      p.set(cx, hy - 1, P.red[4]);
      break;
    case 'akbork': {
      // tall white felt cap of the Janissaries with the flap falling behind
      for (let j = 0; j < 4; j++) hline(p, cx - 1, cx + (j < 3 ? 1 : 0), hy - j, j < 2 ? o.capC[0] : o.capC[0]);
      p.set(cx + 1, hy, o.capC[1]);
      p.set(cx + 1, hy - 1, o.capC[1]);
      p.set(cx, hy - 3, P.gold[5]); // kaşıklık (spoon holder)
      p.set(cx - 2, hy, o.capC[0]);
      p.set(cx - 2, hy + 1, o.capC[0]);
      p.set(cx - 2, hy + 2, o.capC[1]);
      p.set(cx - 3, hy + 3, o.capC[1]);
      break;
    }
    case 'none':
      hline(p, cx - 1, cx + 1, hy, P.dirt[1]);
      break;
  }
  // front arm
  const s0 = o.shirt[0];
  switch (pose.arm) {
    case 'swing': {
      const a = ph === 0 ? -1 : ph === 2 ? 1 : 0;
      p.set(cx + 2, ty + 1, s0);
      p.set(cx + 2 + Math.max(0, a), ty + 2, s0);
      p.set(cx + 2 + a, ty + 3, skin[0]);
      break;
    }
    case 'carry':
      p.set(cx + 2, ty, s0);
      p.set(cx + 2, ty - 1, skin[0]);
      break;
    case 'up':
      p.set(cx + 2, ty, s0);
      p.set(cx + 2, ty - 1, s0);
      p.set(cx + 2, ty - 2, skin[0]);
      break;
    case 'mid':
      p.set(cx + 2, ty + 1, s0);
      p.set(cx + 3, ty + 1, s0);
      p.set(cx + 4, ty + 1, skin[0]);
      break;
    case 'down':
      p.set(cx + 2, ty + 1, s0);
      p.set(cx + 3, ty + 2, s0);
      p.set(cx + 4, ty + 3, skin[0]);
      break;
    case 'push':
      p.set(cx + 2, ty + 1, s0);
      p.set(cx + 3, ty + 2, skin[0]);
      p.set(cx + 4, ty + 2, skin[0]);
      break;
    case 'pull':
      p.set(cx + 2, ty + 1, s0);
      p.set(cx + 2, ty + 2, skin[0]);
      break;
  }
}

/** Figure frame helper: 16×20 with shadow + outline. */
function figureSheet(gen: TextureGen, key: string, frames: number, draw: (p: PixelCanvas, f: number) => void, w = 16, h = 20, outline = true): void {
  gen.sheet(key, w, h, frames, (p, f) => {
    draw(p, f);
    if (outline) p.outline(P.outline[1]);
    // shadow drawn last but only into empty pixels (under the figure)
    for (let y = h - 3; y < h; y++)
      for (let x = 0; x < w; x++) {
        const cx = w / 2 - 1;
        const d = ((x - cx - 0.5) * (x - cx - 0.5)) / 16 + ((y - (h - 2)) * (y - (h - 2))) / 1.2;
        if (d <= 1 && p.alphaAt(x, y) === 0) p.set(x, y, P.outline[1], 0.32);
      }
  });
}

// ───────────────────────────── generators ─────────────────────────────

export function generateUnitTextures(gen: TextureGen): void {
  const walkers: [string, Outfit, ((p: PixelCanvas, f: number, cx: number, fy: number) => void) | null][] = [
    ['econ/amele-yuru', OUTFITS.amele, null],
    ['econ/amele2-yuru', OUTFITS.amele2, null],
    [
      'econ/amele-tas',
      OUTFITS.amele,
      (p, f, cx, fy) => {
        const b = f === 1 || f === 3 ? -1 : 0;
        // stone block on the shoulder
        for (let j = 0; j < 3; j++) hline(p, cx - 2, cx + 2, fy - 14 + j + b, ri(P.limestone, 4 - j));
        p.set(cx + 2, fy - 14 + b, P.limestone[5]);
        p.set(cx - 2, fy - 12 + b, P.limestone[2]);
      },
    ],
    [
      'econ/amele2-cuval',
      OUTFITS.amele2,
      (p, f, cx, fy) => {
        const b = f === 1 || f === 3 ? -1 : 0;
        sack(p, cx - 3, fy - 15 + b);
      },
    ],
    [
      'econ/amele-kalas',
      OUTFITS.amele,
      (p, f, cx, fy) => {
        const b = f === 1 || f === 3 ? -1 : 0;
        for (let i = -6; i <= 5; i++) {
          p.set(cx + i, fy - 12 + b + (i < -2 ? 1 : 0), P.wood[5]);
          p.set(cx + i, fy - 11 + b + (i < -2 ? 1 : 0), P.wood[3]);
        }
      },
    ],
    [
      'econ/saka',
      OUTFITS.saka,
      (p, f, cx, fy) => {
        const b = f === 1 || f === 3 ? -1 : 0;
        // leather water-skin (kırba) on the back
        for (let j = 0; j < 4; j++) hline(p, cx - 4, cx - 2, fy - 11 + j + b, j === 0 ? P.wood[5] : P.wood[3 + (j & 1)]);
        p.set(cx - 5, fy - 9 + b, P.wood[2]);
      },
    ],
    [
      'econ/yeniceri-yuru',
      OUTFITS.yeniceri,
      (p, f, cx, fy) => {
        const b = f === 1 || f === 3 ? -1 : 0;
        // spear on the shoulder
        for (let j = 0; j < 14; j++) p.set(cx + 3 - Math.floor(j / 5), fy - 6 - j + b, P.wood[4]);
        p.set(cx + 1, fy - 20 + b, P.steel[5]);
      },
    ],
    ['econ/surucu', OUTFITS.surucu, (p, f, cx, fy) => {
      const b = f === 1 || f === 3 ? -1 : 0;
      // walking stick
      vline(p, cx + 4, fy - 12 + b, fy - 1, P.wood[5]);
    }],
  ];
  for (const [key, outfit, extra] of walkers) {
    const carry = key.includes('tas') || key.includes('cuval') || key.includes('kalas');
    figureSheet(gen, key, 4, (p, f) => {
      drawFigure(p, 7, 18, outfit, { walk: f, arm: carry ? 'carry' : 'swing' });
      extra?.(p, f, 7, 18);
    });
    gen.anim(`${key}:walk`, key, [0, 1, 2, 3], 7);
  }

  // hammering mason (chisel on stone), 4 frames
  figureSheet(gen, 'econ/amele-cekic', 4, (p, f) => {
    drawFigure(p, 6, 18, OUTFITS.usta, { walk: -1, arm: f === 0 ? 'up' : f === 1 ? 'mid' : f === 2 ? 'down' : 'mid', kneel: true });
    // hammer head
    const hp = f === 0 ? [8, 7] : f === 1 ? [11, 10] : f === 2 ? [11, 14] : [11, 10];
    p.set(hp[0], hp[1], P.steel[4]);
    p.set(hp[0] + 1, hp[1], P.steel[2]);
    // stone block being worked
    stoneBlock(p, 12, 15, 3);
    if (f === 2) {
      p.set(13, 13, P.gold[6]);
      p.set(14, 12, P.fire[6]);
    }
  });
  gen.anim('econ/amele-cekic:work', 'econ/amele-cekic', [0, 1, 2, 3], 8);

  // pickaxe in the quarry
  figureSheet(gen, 'econ/amele-kazma', 4, (p, f) => {
    drawFigure(p, 7, 18, OUTFITS.amele, { walk: -1, arm: f === 0 ? 'up' : f === 3 ? 'mid' : 'down' });
    const tip = f === 0 ? [[9, 6], [10, 5], [8, 5]] : f === 1 || f === 2 ? [[11, 15], [12, 16], [12, 14]] : [[11, 9], [12, 8], [12, 10]];
    for (const [x, y] of tip) p.set(x, y, P.steel[3]);
    if (f === 2) {
      p.set(13, 16, P.limestone[5]);
      p.set(14, 15, P.limestone[4]);
    }
  });
  gen.anim('econ/amele-kazma:work', 'econ/amele-kazma', [0, 1, 2, 3], 6);

  // axeman
  figureSheet(gen, 'econ/amele-balta', 4, (p, f) => {
    drawFigure(p, 7, 18, OUTFITS.amele2, { walk: -1, arm: f === 0 ? 'up' : f === 1 ? 'mid' : 'down' });
    const head = f === 0 ? [9, 5] : f === 1 ? [12, 9] : [12, 13];
    p.set(head[0], head[1], P.steel[4]);
    p.set(head[0], head[1] + 1, P.steel[2]);
    if (f === 2) {
      p.set(13, 14, P.wood[6]);
      p.set(14, 13, P.wood[7]);
    }
  });
  gen.anim('econ/amele-balta:work', 'econ/amele-balta', [0, 1, 2, 3], 6);

  // mortar mixer stirring a trough
  figureSheet(gen, 'econ/amele-karis', 4, (p, f) => {
    drawFigure(p, 6, 18, OUTFITS.amele, { walk: -1, arm: f % 2 === 0 ? 'push' : 'pull', bob: f === 1 ? -1 : 0 });
    // trough with lime mortar
    for (let i = 9; i <= 15; i++) {
      p.set(i, 15, P.wood[4]);
      p.set(i, 16, P.wood[3]);
      p.set(i, 17, P.wood[2]);
    }
    for (let i = 10; i <= 14; i++) p.set(i, 14, (i + f) % 3 === 0 ? P.limestone[4] : P.limestone[5]);
    // paddle
    const tx = f % 2 === 0 ? 11 : 13;
    p.set(tx, 13, P.wood[5]);
    p.set(tx - 1, 12, P.wood[5]);
    p.set(tx - 2, 11, P.wood[5]);
  });
  gen.anim('econ/amele-karis:work', 'econ/amele-karis', [0, 1, 2, 3], 5);

  // stonemason carving a cannonball
  figureSheet(gen, 'econ/tasci', 4, (p, f) => {
    drawFigure(p, 5, 18, OUTFITS.usta, { walk: -1, arm: f === 0 ? 'up' : f === 1 ? 'mid' : f === 2 ? 'down' : 'mid', kneel: true });
    ball(p, 12, 15, 3);
    if (f === 2) {
      p.set(10, 11, P.limestone[5]);
      p.set(15, 11, P.limestone[4]);
      p.set(9, 12, P.gold[6]);
    }
    const hp = f === 0 ? [7, 7] : f === 1 ? [9, 10] : f === 2 ? [10, 13] : [9, 10];
    p.set(hp[0], hp[1], P.steel[4]);
  });
  gen.anim('econ/tasci:work', 'econ/tasci', [0, 1, 2, 3], 7);

  // stirring a tallow cauldron
  figureSheet(gen, 'econ/amele-kazan', 4, (p, f) => {
    drawFigure(p, 5, 18, OUTFITS.amele2, { walk: -1, arm: f % 2 === 0 ? 'push' : 'mid' });
    const tx = f % 2 === 0 ? 10 : 11;
    for (let j = 0; j < 5; j++) p.set(tx - Math.floor(j / 2), 10 + j, P.wood[5]);
  });
  gen.anim('econ/amele-kazan:work', 'econ/amele-kazan', [0, 1, 2, 3], 5);

  // barrel roller (baruthane): pushes a barrel
  figureSheet(gen, 'econ/amele-fici', 4, (p, f) => {
    drawFigure(p, 6, 18, OUTFITS.amele, { walk: f, arm: 'push' });
    const bx = 11;
    for (let j = 0; j < 4; j++)
      for (let i = 0; i < 4; i++) p.set(bx + i, 14 + j, ri(P.wood, (i + f) % 4 === 0 ? 2 : i < 2 ? 5 : 4));
  });
  gen.anim('econ/amele-fici:walk', 'econ/amele-fici', [0, 1, 2, 3], 6);

  // janissary guard idle (2 frames breathing + spear glint)
  figureSheet(gen, 'econ/nobetci', 4, (p, f) => {
    drawFigure(p, 7, 18, OUTFITS.yeniceri, { walk: -1, arm: 'carry', bob: f === 2 ? -1 : 0 });
    // halberd / spear
    vline(p, 10, 2, 17, P.wood[4]);
    p.set(10, 1, P.steel[5]);
    p.set(10, 0, f === 1 ? P.steel[6] : P.steel[4]);
    p.set(11, 2, P.steel[3]);
  });
  gen.anim('econ/nobetci:idle', 'econ/nobetci', [0, 1, 2, 2, 0, 0], 2);

  // pair of sawyers at a saw-horse (32×22)
  gen.sheet('econ/bickici', 32, 22, 4, (p, f) => {
    // trestle + log
    for (let i = 6; i <= 25; i++) {
      p.set(i, 12, P.wood[6]);
      p.set(i, 13, P.wood[5]);
      p.set(i, 14, P.wood[3]);
    }
    for (const x of [8, 23]) {
      p.set(x - 1, 15, P.wood[3]);
      p.set(x - 2, 16, P.wood[3]);
      p.set(x + 1, 15, P.wood[2]);
      p.set(x + 2, 16, P.wood[2]);
      p.set(x - 2, 17, P.wood[2]);
      p.set(x + 2, 17, P.wood[1]);
    }
    const off = f === 0 ? -2 : f === 1 ? 0 : f === 2 ? 2 : 0;
    drawFigure(p, 5 + (off < 0 ? -1 : 0), 20, OUTFITS.amele, { walk: -1, arm: off < 0 ? 'pull' : 'push' });
    drawFigure(p, 27 - (off > 0 ? -1 : 0), 20, OUTFITS.amele2, { walk: -1, arm: off > 0 ? 'pull' : 'push' });
    // saw blade
    for (let i = 9 + off; i <= 22 + off; i++) p.set(i, 11, P.steel[4]);
    p.set(16 + off, 12, P.steel[3]);
    // sawdust
    if (f % 2 === 0) {
      p.set(15, 16, P.wood[7]);
      p.set(17, 17, P.wood[6]);
    }
    p.outline(P.outline[1]);
  });
  gen.anim('econ/bickici:work', 'econ/bickici', [0, 1, 2, 3], 6);

  generateAnimals(gen);
  generateProps(gen);
}

// ───────────────────────────── animals & carts ─────────────────────────────

function ox(p: PixelCanvas, x: number, fy: number, f: number, coat: Ramp, light: number): void {
  // body 11×5, facing right
  const by = fy - 9;
  for (let j = 0; j < 5; j++)
    for (let i = 0; i < 11; i++) {
      if ((j === 0 && (i < 1 || i > 8)) || (j === 4 && (i < 1 || i > 9))) continue;
      const v = light - (j >= 3 ? 1 : 0) + (i < 4 && j < 2 ? 1 : 0);
      p.set(x + i, by + j, ri(coat, v));
    }
  // hump & head
  p.set(x + 8, by - 1, ri(coat, light));
  p.set(x + 9, by - 1, ri(coat, light));
  for (let j = 0; j < 3; j++) {
    p.set(x + 11, by + j, ri(coat, light - 1));
    p.set(x + 12, by + j + 1, ri(coat, light - 1));
  }
  p.set(x + 13, by + 3, ri(coat, light - 2));
  p.set(x + 12, by + 1, P.outline[1]);
  // horns
  p.set(x + 11, by - 1, P.cloth[4]);
  p.set(x + 12, by - 2, P.cloth[3]);
  // legs (4) with gait
  const legs = [1, 3, 8, 10];
  legs.forEach((lx, k) => {
    const sw = (k + f) % 2 === 0 ? 1 : 0;
    for (let j = 0; j < 4; j++) p.set(x + lx + (j === 3 ? sw : 0), by + 5 + j, ri(coat, light - 2 - (k % 2)));
  });
  // tail
  p.set(x - 1, by + 1, ri(coat, light - 2));
  p.set(x - 1, by + 2 + (f % 2), ri(coat, light - 2));
}

function wheelSolid(p: PixelCanvas, cx: number, cy: number, f: number): void {
  // Thracian kağnı: one big solid wooden disc wheel (side view)
  const R = 5;
  for (let y = -R; y <= R; y++)
    for (let x = -R; x <= R; x++) {
      const d = x * x + y * y;
      if (d > R * R + 2) continue;
      const rim = d > (R - 1.2) * (R - 1.2);
      const lit = x + y < 0;
      p.set(cx + x, cy + y, rim ? (lit ? P.wood[4] : P.wood[2]) : lit ? P.wood[5] : P.wood[4]);
    }
  // plank seams rotate with the wheel
  const a = (f / 4) * Math.PI;
  for (let r = -R + 1; r <= R - 1; r++) p.set(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), P.wood[2]);
  p.set(cx, cy, P.steel[3]);
}

export function generateAnimals(gen: TextureGen): void {
  const coats: Ramp[] = [P.dirt, P.wood, P.cloth];
  // ox cart with sacks (kağnı) 48×28
  const cargo = ['cuval', 'tas', 'hazine', 'kereste'] as const;
  for (const c of cargo) {
    const key = `econ/kagni-${c}`;
    gen.sheet(key, 48, 28, 4, (p, f) => {
      shadowEllipse(p, 24, 25, 20, 2, 0.3);
      // cart bed
      const bx = 2;
      const by = 13;
      for (let i = 0; i < 20; i++) {
        p.set(bx + i, by, P.wood[6]);
        p.set(bx + i, by + 1, P.wood[4]);
        p.set(bx + i, by + 2, P.wood[3]);
      }
      // side rails
      for (let i = 0; i < 20; i += 4) {
        p.set(bx + i, by - 1, P.wood[5]);
        p.set(bx + i, by - 2, P.wood[5]);
      }
      // load
      if (c === 'cuval') {
        sack(p, bx + 2, by - 5);
        sack(p, bx + 7, by - 5);
        sack(p, bx + 12, by - 5);
        sack(p, bx + 5, by - 9);
        sack(p, bx + 10, by - 9);
      } else if (c === 'tas') {
        stoneBlock(p, bx + 4, by - 4, 4);
        stoneBlock(p, bx + 9, by - 4, 4);
        stoneBlock(p, bx + 14, by - 4, 4);
        stoneBlock(p, bx + 7, by - 8, 4);
      } else if (c === 'kereste') {
        for (let j = 0; j < 3; j++) for (let i = -1; i < 22; i++) p.set(bx + i, by - 2 - j * 2, ri(P.wood, 5 - j));
        for (let j = 0; j < 3; j++) p.set(bx + 21, by - 2 - j * 2, P.wood[7]);
      } else {
        // treasury chests (hazine) with red cloth
        for (let k = 0; k < 3; k++) {
          const cx = bx + 2 + k * 6;
          for (let j = 0; j < 4; j++) hline(p, cx, cx + 4, by - 4 + j, ri(P.wood, 4 - (j === 3 ? 2 : 0)));
          hline(p, cx, cx + 4, by - 5, P.red[4]);
          p.set(cx + 2, by - 3, P.gold[5]);
        }
      }
      // shaft to the yoke
      for (let i = 0; i < 8; i++) p.set(bx + 20 + i, by + 1, P.wood[3]);
      wheelSolid(p, bx + 10, by + 5, f);
      // two oxen (far one darker)
      ox(p, 30, 24, f + 1, coats[1], 4);
      ox(p, 28, 26, f, coats[f >= 0 ? 0 : 0], 5);
      // yoke
      hline(p, 39, 41, 15, P.wood[2]);
      p.outline(P.outline[1]);
    });
    gen.anim(`${key}:walk`, key, [0, 1, 2, 3], 5);
  }

  // camel with bales (deve) 26×26
  gen.sheet('econ/deve', 26, 26, 4, (p, f) => {
    shadowEllipse(p, 13, 23, 10, 2, 0.3);
    const c = P.sand;
    const by = 11;
    // body (rounded)
    for (let j = 0; j < 6; j++)
      for (let i = 4; i < 18; i++) {
        if ((j === 0 || j === 5) && (i < 6 || i > 15)) continue;
        p.set(i, by + j, ri(c, 3.6 - (j > 3 ? 1.2 : 0) + (i < 10 && j < 2 ? 1 : 0)));
      }
    // single hump
    for (let j = 0; j < 4; j++) for (let i = 8 + j; i < 15 - j; i++) p.set(i, by - 1 - j, ri(c, 4 - j * 0.3 - (i > 12 ? 1 : 0)));
    // neck curving forward-down then up to the head
    const nk: [number, number][] = [[18, 12], [19, 13], [20, 13], [21, 12], [21, 11], [22, 10], [22, 9], [22, 8], [23, 7]];
    for (const [x, y] of nk) {
      p.set(x, y, c[3]);
      p.set(x, y + 1, c[2]);
    }
    // head with muzzle
    hline(p, 22, 25, 6, c[4]);
    hline(p, 22, 25, 7, c[3]);
    p.set(23, 5, c[3]);
    p.set(23, 6, P.outline[1]);
    // saddle bags: red kilim & green bale
    for (let j = 0; j < 4; j++) for (let i = 5; i < 9; i++) p.set(i, by - 1 + j, j % 2 === 0 ? P.red[4] : P.red[3]);
    for (let j = 0; j < 4; j++) for (let i = 14; i < 17; i++) p.set(i, by - 1 + j, j === 1 ? P.gold[4] : P.green[3]);
    hline(p, 7, 15, by - 4, P.wood[4]);
    // legs: knobbly, with gait
    [6, 8, 15, 17].forEach((lx, k) => {
      const sw = (k + f) % 2 === 0 ? 1 : -1;
      for (let j = 0; j < 7; j++) p.set(lx + (j > 3 ? sw : 0), by + 6 + j, ri(c, k % 2 ? 2 : 3));
      p.set(lx + sw, by + 12, c[1]);
    });
    // tail
    p.set(3, by + 1, c[2]);
    p.set(3, by + 2 + (f % 2), c[1]);
    p.outline(P.outline[1]);
  });
  gen.anim('econ/deve:walk', 'econ/deve', [0, 1, 2, 3], 5);

  // pack mule (katır) 20×18
  gen.sheet('econ/katir', 20, 18, 4, (p, f) => {
    shadowEllipse(p, 10, 15, 7, 2, 0.3);
    const c = P.dirt;
    const by = 6;
    for (let j = 0; j < 4; j++) for (let i = 3; i < 13; i++) p.set(i, by + j, ri(c, 4 - (j > 2 ? 1 : 0) + (i < 7 && j === 0 ? 1 : 0)));
    // head & ears
    for (let j = 0; j < 3; j++) {
      p.set(13, by - 1 + j, c[3]);
      p.set(14, by + j, c[3]);
      p.set(15, by + 1 + j, c[2]);
    }
    p.set(13, by - 3, c[3]);
    p.set(14, by - 3, c[3]);
    p.set(14, by, P.outline[1]);
    // panniers
    for (let j = 0; j < 4; j++) for (let i = 4; i < 7; i++) p.set(i, by - 1 + j, ri(P.wood, 5 - (j > 2 ? 2 : 0)));
    for (let j = 0; j < 4; j++) for (let i = 9; i < 12; i++) p.set(i, by - 1 + j, ri(P.wood, 4 - (j > 2 ? 2 : 0)));
    [4, 6, 10, 12].forEach((lx, k) => {
      const sw = (k + f) % 2 === 0 ? 1 : 0;
      for (let j = 0; j < 5; j++) p.set(lx + (j > 2 ? sw : 0), by + 4 + j, c[2]);
    });
    p.set(2, by + 1, c[2]);
    p.set(2, by + 2 + (f % 2), c[1]);
    p.outline(P.outline[1]);
  });
  gen.anim('econ/katir:walk', 'econ/katir', [0, 1, 2, 3], 7);

  // standing horses for the horse lines (various coats), 2 frames (tail swish / head)
  const horseCoats: Ramp[] = [P.wood, P.dirt, P.cloth, [...P.outline, ...P.stone.slice(1, 4)] as Ramp];
  horseCoats.forEach((coat, idx) => {
    const key = `econ/at-${idx}`;
    gen.sheet(key, 20, 18, 2, (p, f) => {
      shadowEllipse(p, 10, 16, 7, 1, 0.3);
      const by = 6;
      const L = coat.length;
      const lt = Math.min(L - 1, 4);
      for (let j = 0; j < 4; j++) for (let i = 3; i < 13; i++) p.set(i, by + j, ri(coat, lt - (j > 2 ? 1 : 0) + (i < 6 && j === 0 ? 1 : 0)));
      // neck & head (lowered on frame 1 → grazing)
      const hd = f === 1 ? 2 : 0;
      for (let j = 0; j < 4; j++) {
        p.set(13, by - 1 + j + hd, ri(coat, lt - 1));
        p.set(14, by - 2 + j + hd, ri(coat, lt - 1));
      }
      p.set(15, by - 1 + hd, ri(coat, lt - 1));
      p.set(15, by + hd, ri(coat, lt - 2));
      p.set(14, by - 1 + hd, P.outline[1]);
      // mane
      p.set(12, by - 1, P.outline[2]);
      p.set(13, by - 2 + hd, P.outline[2]);
      // saddle cloth (red / green)
      for (let i = 6; i < 10; i++) {
        p.set(i, by - 1, idx % 2 ? P.green[3] : P.red[4]);
        p.set(i, by, idx % 2 ? P.green[2] : P.red[3]);
      }
      [4, 6, 10, 12].forEach((lx) => {
        for (let j = 0; j < 6; j++) p.set(lx, by + 4 + j, ri(coat, lt - 2));
      });
      // tail swish
      p.set(2, by, P.outline[2]);
      p.set(1 + f, by + 1, P.outline[2]);
      p.set(1 + f, by + 2, P.outline[2]);
      p.set(2 - f, by + 3, P.outline[2]);
      p.outline(P.outline[1]);
    });
    gen.anim(`${key}:idle`, key, [0, 0, 0, 1, 1, 0], 2);
  });
}

// ───────────────────────────── props ─────────────────────────────

export function generateProps(gen: TextureGen): void {
  // campfire 14×14 (logs + flames)
  gen.sheet('econ/ates', 14, 16, 4, (p, f) => {
    // stone ring
    for (const [x, y] of [[2, 13], [4, 14], [7, 14], [10, 14], [12, 13], [3, 12], [11, 12]]) p.set(x, y, P.stone[3]);
    // logs
    for (let i = 3; i <= 10; i++) p.set(i, 12 - ((i - 3) >> 2), P.wood[3]);
    for (let i = 3; i <= 10; i++) p.set(i, 11 + ((i - 3) >> 2), P.wood[2]);
    // flames
    const fl = [
      [[5, 10], [6, 9], [6, 8], [7, 7], [7, 6], [8, 8], [8, 9], [9, 10], [7, 10], [6, 10], [8, 10], [7, 9], [7, 8]],
      [[5, 10], [6, 9], [7, 8], [7, 7], [6, 6], [6, 5], [8, 9], [9, 9], [7, 10], [8, 10], [6, 10], [7, 9]],
      [[5, 10], [6, 9], [7, 9], [8, 8], [8, 7], [8, 6], [9, 5], [6, 8], [7, 10], [8, 10], [6, 10], [7, 8]],
      [[6, 10], [6, 9], [7, 8], [7, 7], [7, 6], [7, 5], [8, 9], [5, 9], [7, 10], [8, 10], [7, 9], [6, 8]],
    ][f];
    for (const [x, y] of fl) {
      const t = (10 - y) / 5;
      p.set(x, y, t > 0.7 ? P.fire[4] : t > 0.35 ? P.fire[5] : P.fire[6]);
    }
    p.set(7, 10, P.fire[7]);
    // spark
    p.set(5 + f, 3 - (f % 2), P.fire[5]);
  });
  gen.anim('econ/ates:burn', 'econ/ates', [0, 1, 2, 3], 9);

  // Ottoman banners (sancak) 16×28: red, green, white, yellow; flutter 4 frames
  const flags: [string, Ramp][] = [
    ['kirmizi', P.red.slice(2) as Ramp],
    ['yesil', P.green.slice(1) as Ramp],
    ['beyaz', P.cloth.slice(1) as Ramp],
  ];
  for (const [name, r] of flags) {
    const key = `econ/sancak-${name}`;
    gen.sheet(key, 16, 28, 4, (p, f) => {
      vline(p, 2, 2, 26, P.wood[4]);
      vline(p, 3, 3, 26, P.wood[2]);
      p.set(2, 1, P.gold[5]);
      p.set(2, 0, P.gold[6]);
      // swallow-tailed flag, waving
      for (let i = 0; i < 12; i++) {
        const w = Math.round(Math.sin((i / 3.2) - f * (Math.PI / 2)) * 1.2);
        const len = 7 - (i > 8 ? (i - 8) * 1 : 0);
        for (let j = 0; j < 7; j++) {
          if (i > 8 && j > 2 && j < 4) continue; // swallow tail notch
          if (j >= len && i > 8) continue;
          const shade = j === 0 ? r.length - 1 : w > 0 ? r.length - 2 : w < 0 ? 1 : r.length - 3;
          p.set(3 + i, 3 + j + w, ri(r, shade - (i > 8 ? 1 : 0)));
        }
      }
      p.outline(P.outline[1]);
    });
    gen.anim(`${key}:wave`, key, [0, 1, 2, 3], 7);
  }

  // tuğ — horsetail standard (12×30)
  gen.sheet('econ/tug', 12, 30, 4, (p, f) => {
    vline(p, 5, 4, 29, P.wood[4]);
    vline(p, 6, 5, 29, P.wood[2]);
    // golden ball & crest
    p.set(5, 1, P.gold[6]);
    p.set(4, 2, P.gold[5]);
    p.set(5, 2, P.gold[6]);
    p.set(6, 2, P.gold[4]);
    p.set(5, 3, P.gold[3]);
    // horsehair tassel
    for (let j = 0; j < 10; j++) {
      const sway = Math.round(Math.sin(j / 3 + f * 1.4) * (j / 5));
      const w = j < 2 ? 3 : j < 7 ? 4 : 3;
      for (let i = 0; i < w; i++) p.set(4 - (w >> 1) + i + 1 + sway, 4 + j, i === 0 ? P.dirt[3] : j > 7 ? P.outline[2] : P.dirt[1]);
    }
    p.outline(P.outline[1]);
  });
  gen.anim('econ/tug:wave', 'econ/tug', [0, 1, 2, 3], 4);

  // steam wisp (12×20), 6 frames rising
  gen.sheet('econ/buhar', 12, 22, 6, (p, f) => {
    for (let k = 0; k < 3; k++) {
      const t = (f + k * 2) % 6;
      const y = 19 - t * 3;
      const x = 6 + Math.round(Math.sin(t * 1.1 + k) * 2);
      const r = 1 + (t > 2 ? 1 : 0);
      const a = 0.65 - t * 0.09;
      for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (i * i + j * j <= r * r) p.set(x + i, y + j, i + j < 0 ? P.cloth[5] : P.cloth[4], a);
    }
  });
  gen.anim('econ/buhar:rise', 'econ/buhar', [0, 1, 2, 3, 4, 5], 6);

  // bubbling copper cauldron on a hearth (16×16)
  gen.sheet('econ/kazan', 16, 16, 4, (p, f) => {
    // hearth stones and fire
    for (let i = 2; i <= 13; i++) p.set(i, 14, P.stone[2 + (i % 2)]);
    const fl = f % 2;
    for (const x of [4, 7, 10]) {
      p.set(x + fl, 13, P.fire[5]);
      p.set(x, 12, P.fire[4]);
      p.set(x + 1 - fl, 12, P.fire[6]);
    }
    // cauldron (bronze/copper)
    for (let y = 5; y <= 11; y++) {
      const hw = y < 7 ? 6 : 6 - Math.floor((y - 7) / 1.5);
      for (let x = -hw; x <= hw; x++) {
        const u = x / (hw + 0.5);
        const v = 4 - u * 2 - (y > 9 ? 1 : 0);
        p.set(8 + x, y, ri(P.bronze, v));
      }
    }
    hline(p, 2, 14, 5, P.bronze[5]);
    // molten tallow surface
    for (let x = 3; x <= 13; x++) p.set(x, 4, (x + f) % 4 === 0 ? P.sand[5] : P.sand[4]);
    p.set(5 + f * 2, 3, P.sand[5]);
    p.outline(P.outline[1]);
  });
  gen.anim('econ/kazan:boil', 'econ/kazan', [0, 1, 2, 3], 6);

  // market stall (pazar) 28×26, 2 frames (awning ripple)
  const stallColors: [string, string][] = [
    [P.red[4], P.cloth[4]],
    [P.green[3], P.cloth[4]],
    [P.blue[3], P.gold[4]],
  ];
  stallColors.forEach(([a, b], idx) => {
    const key = `econ/pazar-${idx}`;
    gen.sheet(key, 28, 26, 2, (p, f) => {
      shadowEllipse(p, 15, 22, 11, 3, 0.3);
      // counter
      for (let j = 0; j < 4; j++) hline(p, 5, 22, 17 + j, ri(P.wood, 5 - j));
      // goods
      const goods = [P.red[5], P.gold[5], P.green[4], P.bronze[4], P.sand[4]];
      for (let i = 0; i < 6; i++) {
        p.set(6 + i * 3, 16, goods[(i + idx) % goods.length]);
        p.set(7 + i * 3, 16, goods[(i + idx + 1) % goods.length]);
        p.set(6 + i * 3, 15, goods[(i + idx) % goods.length]);
      }
      // poles
      vline(p, 4, 6, 21, P.wood[3]);
      vline(p, 23, 6, 21, P.wood[2]);
      // striped awning sloped
      for (let i = 2; i <= 25; i++)
        for (let j = 0; j < 4; j++) {
          const rip = f === 1 && j === 3 && i % 3 === 0 ? 1 : 0;
          p.set(i, 4 + j + Math.floor((i - 2) / 12) + rip, Math.floor(i / 3) % 2 === 0 ? a : b);
        }
      // merchant
      drawFigure(p, 14, 15, OUTFITS.tuccar, { walk: -1, arm: f === 1 ? 'mid' : 'down' });
      p.outline(P.outline[1]);
    });
    gen.anim(`${key}:idle`, key, [0, 0, 1, 0, 1, 1], 2);
  });

  // treadwheel crane (vinç) 48×60, 8 frames: wheel turns, block rises.
  gen.sheet('econ/vinc', 48, 62, 8, (p, f) => {
    const w = P.wood;
    // base sills
    for (let i = 6; i <= 30; i++) {
      p.set(i, 58, w[3]);
      p.set(i, 59, w[2]);
    }
    // A-frame and jib (mast up to the right)
    for (let j = 0; j < 46; j++) {
      p.set(20 + Math.floor(j / 6), 58 - j, w[5]);
      p.set(21 + Math.floor(j / 6), 58 - j, w[3]);
    }
    for (let j = 0; j < 20; j++) p.set(8 + Math.floor(j / 2), 58 - j * 2, w[4]);
    // jib arm to the right
    for (let i = 0; i < 18; i++) {
      p.set(27 + i, 13 + Math.floor(i / 6), w[5]);
      p.set(27 + i, 14 + Math.floor(i / 6), w[2]);
    }
    // pulley
    p.set(44, 15, P.steel[4]);
    p.set(45, 16, P.steel[2]);
    // the great wheel (side view) radius 11 at (17,44)
    const cx = 15;
    const cy = 45;
    const R = 11;
    for (let a = 0; a < 64; a++) {
      const t = (a / 64) * Math.PI * 2;
      const x = Math.round(cx + Math.cos(t) * R * 0.55);
      const y = Math.round(cy + Math.sin(t) * R);
      p.set(x, y, Math.cos(t) < 0 ? w[5] : w[3]);
      p.set(x + 1, y, w[2]);
    }
    // spokes rotating
    for (let k = 0; k < 4; k++) {
      const t = (k / 4) * Math.PI + (f / 8) * (Math.PI / 2);
      for (let r = 0; r < R; r++) p.set(Math.round(cx + Math.cos(t) * r * 0.55), Math.round(cy + Math.sin(t) * r), w[4]);
    }
    p.set(cx, cy, P.steel[3]);
    // man walking inside the wheel
    drawFigure(p, cx + 1, cy + R - 1, OUTFITS.amele, { walk: f % 4, arm: 'swing' });
    // rope from wheel to pulley and down
    for (let i = 0; i < 24; i++) p.set(cx + 3 + i, cy - 4 - Math.floor(i * 1.15), P.sand[3]);
    const blockY = 52 - f * 4;
    vline(p, 45, 17, blockY - 3, P.sand[3]);
    // hook & stone block
    p.set(45, blockY - 2, P.steel[3]);
    stoneBlock(p, 45, blockY - 1, 4);
    p.outline(P.outline[1]);
  });
  gen.anim('econ/vinc:work', 'econ/vinc', [0, 1, 2, 3, 4, 5, 6, 7], 5);

  // rising stone block mortar pit (ground) — mortar heap & lime 16×10
  gen.canvas('econ/kirec', 18, 10, (p) => {
    for (let y = 0; y < 6; y++)
      for (let x = -7 + y; x <= 7 - y; x++) p.set(9 + x, 8 - y, y === 5 ? P.limestone[5] : x < 0 ? P.limestone[4] : P.limestone[3]);
    p.outline(P.outline[1]);
  });

  // pile of hewn stone blocks
  gen.canvas('econ/tas-yigin', 24, 16, (p) => {
    shadowEllipse(p, 13, 13, 10, 2, 0.3);
    const pos = [[4, 9], [9, 9], [14, 9], [19, 9], [6, 5], [11, 5], [16, 5], [9, 1], [14, 1]];
    for (const [x, y] of pos) stoneBlock(p, x, y + 1, 4);
    p.outline(P.outline[1]);
  });

  // timber stack
  gen.canvas('econ/kereste-yigin', 26, 16, (p) => {
    shadowEllipse(p, 13, 13, 11, 2, 0.3);
    for (let j = 0; j < 4; j++) for (let i = 2 + j * 1; i < 22 - j; i++) p.set(i, 11 - j * 2, ri(P.wood, 5 - (j & 1)));
    for (let j = 0; j < 4; j++) for (let k = 0; k < 4 - j; k++) {
      const x = 21 - j + 0 + k * 0;
      p.set(x, 11 - j * 2, P.wood[7]);
    }
    p.outline(P.outline[1]);
  });

  // stacked cannonballs (pyramid)
  gen.canvas('econ/gulle-yigin', 22, 16, (p) => {
    shadowEllipse(p, 12, 13, 9, 2, 0.3);
    const rows = [[3, 12, 4], [6, 8, 3], [9, 4, 2]];
    for (const [x0, y, n] of rows) for (let i = 0; i < n; i++) ball(p, x0 + i * 5, y, 2);
    p.outline(P.outline[1]);
  });

  // little stakes with a survey cord (hisar site, before groundbreaking)
  gen.canvas('econ/kazik', 4, 8, (p) => {
    vline(p, 1, 1, 7, P.wood[5]);
    vline(p, 2, 2, 7, P.wood[3]);
    p.set(1, 0, P.red[5]);
  });

  // decorative cone used by tents' gold finial check (keeps cone in bundle)
  gen.canvas('econ/alem', 6, 10, (p) => {
    cone(p, 3, 1, 7, 2, 1, P.gold, { seams: 3 });
    p.set(3, 0, P.gold[6]);
  });

}
