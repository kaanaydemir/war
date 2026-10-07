import { P } from '../../art/palette';
import { PixelCanvas } from '../../art/pixel';
import type { TextureGen } from '../../art/texture';
import { hash2 } from '../../core/rng';
import type { ShipType } from '../../core/state';
import { SHIP_TYPE_IDS } from './data';
import { frameOpts, POSE, shipKey, shipModel, shipSheetInfo } from './frames';
import { CHAIN_DIR } from './geo';
import { BRIDGE_DIR } from './data';
import {
  bridgeSegmentModel,
  buoyModel,
  chainLogModel,
  debrisModels,
  gunPlatformModel,
  MATS,
  oxPair,
  railModel,
  rollerModel,
  type Pose,
} from './models';
import { projectBounds, renderVox, type Line3, type RenderOpts, type Voxel } from './vox';

/**
 * NAVY textures (keys 'navy/…'). Ships are pre-rendered voxel models in 8
 * headings; props are rendered at their exact (fixed) geographic angles;
 * figures and FX are hand-pixelled.
 */

export interface PropInfo {
  w: number;
  h: number;
  ox: number;
  oy: number;
}

const props = new Map<string, PropInfo>();

/** Origin/size of a generated prop texture (render uses it to anchor sprites). */
export function propInfo(key: string): PropInfo | undefined {
  return props.get(key);
}

function voxProp(
  gen: TextureGen,
  key: string,
  frames: number,
  build: (f: number) => { vox: Voxel[]; lines: Line3[] },
  opts: RenderOpts,
  pad = 2,
): PropInfo {
  // bounds over all frames
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const built: { vox: Voxel[]; lines: Line3[] }[] = [];
  for (let f = 0; f < frames; f++) {
    const m = build(f);
    built.push(m);
    const b = projectBounds(m.vox, m.lines, opts);
    x0 = Math.min(x0, b.x0);
    y0 = Math.min(y0, b.y0);
    x1 = Math.max(x1, b.x1);
    y1 = Math.max(y1, b.y1);
  }
  const ox = Math.ceil(-x0) + pad;
  const oy = Math.ceil(-y0) + pad;
  const w = Math.ceil(x1 - x0) + pad * 2 + 1;
  const h = Math.ceil(y1 - y0) + pad * 2 + 1;
  const info = { w, h, ox, oy };
  props.set(key, info);
  if (frames === 1) gen.canvas(key, w, h, (p) => renderVox(p, ox, oy, built[0].vox, built[0].lines, MATS, opts));
  else gen.sheet(key, w, h, frames, (p, f) => renderVox(p, ox, oy, built[f].vox, built[f].lines, MATS, opts));
  return info;
}

// ───────────────────────────── ships ─────────────────────────────

function shipSheet(gen: TextureGen, t: ShipType, flagship: boolean): void {
  const info = shipSheetInfo(t);
  const m = shipModel(t);
  const dynCache = new Map<string, { vox: Voxel[]; lines: Line3[] }>();
  const dyn = (pose: Pose, anim: number) => {
    const k = `${pose}:${anim}`;
    let d = dynCache.get(k);
    if (!d) {
      d = m.dyn(pose, anim, flagship);
      dynCache.set(k, d);
    }
    return d;
  };
  const key = shipKey(t, flagship);
  gen.sheet(key, info.fw, info.fh, info.per * 8, (p, i) => {
    const h = Math.floor(i / info.per);
    const k = i % info.per;
    const fo = frameOpts(t, h, k);
    const d = dyn(fo.pose, fo.anim);
    const vox = fo.pose === 'land' ? m.hull.concat(d.vox, m.cradle) : m.hull.concat(d.vox);
    renderVox(p, info.ox, info.oy, vox, m.hullLines.concat(d.lines), MATS, fo.opts);
  });
  const fps = t === 'ceneviz-gemisi' || t === 'bizans-gemisi' ? 5 : 7;
  for (let h = 0; h < 8; h++) {
    const b = h * info.per;
    gen.anim(`${key}:yelken${h}`, key, [b + POSE.sail, b + POSE.sail + 1, b + POSE.sail + 2, b + POSE.sail + 3], fps);
  }
}

function shipIcon(gen: TextureGen, t: ShipType): void {
  const m = shipModel(t);
  const d = m.dyn('sail', 0, false);
  const vox = m.hull.concat(d.vox);
  const lines = m.hullLines.concat(d.lines);
  const W = 32;
  const H = 32;
  const heading = (3 * Math.PI) / 4;
  const b1 = projectBounds(vox, lines, { heading, clipZ: 0 });
  const scale = Math.min(29 / (b1.x1 - b1.x0), 27 / (b1.y1 - b1.y0), 0.8);
  const opts: RenderOpts = { heading, clipZ: 0, scale, wetLine: true };
  const b = projectBounds(vox, lines, opts);
  const ox = Math.round(W / 2 - (b.x0 + b.x1) / 2);
  const oy = Math.round(H / 2 - (b.y0 + b.y1) / 2);
  gen.canvas(`navy/ikon-${iconName(t)}`, W, H, (p) => {
    // little sea swell under the hull
    for (let x = 4; x < 28; x++) {
      const y = oy + 1 + ((x >> 2) % 2);
      p.set(x, y, P.water[4]);
      p.set(x, y + 1, P.water[3]);
      if (x % 5 === 0) p.set(x, y - 1, P.water[7]);
    }
    renderVox(p, ox, oy, vox, lines, MATS, opts);
  });
}

function iconName(t: ShipType): string {
  return t === 'ceneviz-gemisi' ? 'ceneviz' : t === 'bizans-gemisi' ? 'bizans' : t === 'venedik-kadirgasi' ? 'venedik' : t;
}

// ───────────────────────────── figures (hand-pixelled, facing LEFT) ─────────────────────────────

type HeadWear = 'turban' | 'bork' | 'kulah' | 'bare';

interface FigOpts {
  /** x of the feet center, y of the soles. */
  x: number;
  y: number;
  stride: number; // −1..1
  lean: number; // px the head is shifted left
  shirt: readonly string[]; // ramp
  pants: readonly string[];
  head: HeadWear;
  armFront?: [number, number]; // hand position relative to shoulder
  armBack?: [number, number];
}

function figure(p: PixelCanvas, o: FigOpts): { shoulder: [number, number] } {
  const { x, y } = o;
  const sk = P.skin;
  // legs
  const legA = Math.round(o.stride * 1.5);
  const legB = -legA;
  for (let k = 0; k < 4; k++) {
    const t = k / 3;
    p.set(x - 1 + Math.round(legA * (1 - t)), y - k, o.pants[1]);
    p.set(x + 1 + Math.round(legB * (1 - t)), y - k, o.pants[2]);
  }
  p.set(x - 1 + legA - 1, y, P.outline[1]);
  p.set(x + 1 + legB - 1, y, P.outline[1]);
  // torso (lit on the left)
  const tx = x - Math.round(o.lean * 0.4);
  for (let k = 0; k < 5; k++) {
    const sh = Math.round((o.lean * k) / 5);
    p.set(tx - 1 - sh, y - 4 - k, o.shirt[3]);
    p.set(tx - sh, y - 4 - k, o.shirt[2]);
    p.set(tx + 1 - sh, y - 4 - k, o.shirt[1]);
  }
  // sash
  p.set(tx - 1, y - 5, P.red[3]);
  p.set(tx, y - 5, P.red[3]);
  p.set(tx + 1, y - 5, P.red[2]);
  const hx = tx - o.lean;
  const hy = y - 10;
  // head
  p.set(hx - 1, hy, sk[4]);
  p.set(hx, hy, sk[3]);
  p.set(hx - 1, hy + 1, sk[3]);
  p.set(hx, hy + 1, sk[2]);
  p.set(hx - 2, hy, sk[3]); // nose (facing left)
  // headwear
  if (o.head === 'turban') {
    p.set(hx - 1, hy - 1, P.turban[3]);
    p.set(hx, hy - 1, P.turban[2]);
    p.set(hx + 1, hy - 1, P.turban[1]);
    p.set(hx, hy - 2, P.turban[2]);
    p.set(hx - 1, hy - 2, P.turban[3]);
  } else if (o.head === 'bork') {
    p.set(hx - 1, hy - 1, P.cloth[5]);
    p.set(hx, hy - 1, P.cloth[4]);
    p.set(hx, hy - 2, P.cloth[4]);
    p.set(hx + 1, hy - 3, P.cloth[3]);
    p.set(hx + 1, hy - 2, P.cloth[3]);
  } else if (o.head === 'kulah') {
    p.set(hx - 1, hy - 1, P.red[4]);
    p.set(hx, hy - 1, P.red[3]);
    p.set(hx, hy - 2, P.red[4]);
  } else {
    p.set(hx, hy - 1, P.dirt[1]);
    p.set(hx + 1, hy, P.dirt[1]);
  }
  const shoulder: [number, number] = [tx - 1 - Math.round(o.lean * 0.6), y - 8];
  const arm = (hand: [number, number] | undefined, c: string) => {
    if (!hand) return;
    p.line(shoulder[0], shoulder[1], shoulder[0] + hand[0], shoulder[1] + hand[1], c);
    p.set(shoulder[0] + hand[0], shoulder[1] + hand[1], sk[3]);
  };
  arm(o.armBack, o.shirt[1]);
  arm(o.armFront, o.shirt[3]);
  return { shoulder };
}

/** Hauler pulling a rope over his shoulder (frames: stride cycle). Rope grip ≈ (3, 7). */
function drawHamal(p: PixelCanvas, f: number, variant: number): void {
  const stride = [1, 0.3, -1, -0.3][f];
  const shirts = [P.cloth, P.dryGrass, P.sand, P.blue];
  const heads: HeadWear[] = ['kulah', 'turban', 'bare', 'bork'];
  figure(p, {
    x: 7,
    y: 15,
    stride,
    lean: 2,
    shirt: shirts[variant % shirts.length],
    pants: P.dirt,
    head: heads[variant % heads.length],
    armFront: [-2, -1 + (f % 2)],
    armBack: [-1, 0],
  });
  p.outline(P.outline[1]);
}

function drawDavulcu(p: PixelCanvas, f: number): void {
  const stride = [0.6, 0, -0.6, 0][f];
  const { shoulder } = figure(p, { x: 7, y: 16, stride, lean: 0, shirt: P.red, pants: P.blue, head: 'bork' });
  // big drum (davul) at the waist
  const dx = 2;
  const dy = 9;
  p.ellipse(dx + 2, dy + 1, 2, 2, P.red[3]);
  p.set(dx, dy, P.cloth[4]);
  p.set(dx, dy + 1, P.cloth[4]);
  p.set(dx, dy + 2, P.cloth[3]);
  p.set(dx + 2, dy - 1, P.gold[4]);
  p.set(dx + 2, dy + 3, P.gold[2]);
  // stick
  const up = f % 2 === 0;
  p.line(shoulder[0], shoulder[1], shoulder[0] - 3, shoulder[1] + (up ? -3 : 1), P.wood[3]);
  p.set(shoulder[0] - 3, shoulder[1] + (up ? -4 : 2), P.wood[5]);
  p.outline(P.outline[1]);
}

function drawMesaleci(p: PixelCanvas, f: number): void {
  const stride = [0.8, 0.2, -0.8, -0.2][f];
  const { shoulder } = figure(p, { x: 7, y: 19, stride, lean: 0, shirt: P.green, pants: P.dirt, head: 'turban', armFront: [-2, -4] });
  const tx = shoulder[0] - 2;
  const ty = shoulder[1] - 5;
  p.line(tx, ty, tx, ty + 4, P.wood[2]);
  flame(p, tx, ty, f, 1);
  p.outline(P.outline[1]);
}

function drawIsci(p: PixelCanvas, f: number): void {
  const up = f < 2;
  const { shoulder } = figure(p, {
    x: 7,
    y: 15,
    stride: 0.4,
    lean: 3,
    shirt: P.dryGrass,
    pants: P.dirt,
    head: 'kulah',
    armFront: up ? [-1, -4] : [-3, 2],
  });
  // mallet head
  const hx = shoulder[0] + (up ? -1 : -3);
  const hy = shoulder[1] + (up ? -5 : 3);
  p.rect(hx - 1, hy - 1, 3, 2, P.wood[4]);
  p.outline(P.outline[1]);
}

/** Mehter shawm player (zurna raised toward the sky), swaying. */
function drawZurnaci(p: PixelCanvas, f: number): void {
  const sway = [0, 1, 0, -1][f];
  const { shoulder } = figure(p, { x: 7, y: 16, stride: 0, lean: sway, shirt: P.red, pants: P.blue, head: 'bork' });
  // zurna: from the mouth forward and up, flared bell
  const mx = shoulder[0] - 2;
  const my = shoulder[1] - 3;
  p.line(mx, my, mx - 3, my - 2 - (f % 2), P.gold[4]);
  p.set(mx - 4, my - 3 - (f % 2), P.gold[5]);
  p.set(mx - 4, my - 2 - (f % 2), P.gold[3]);
  p.set(mx - 1, my + 1, P.skin[3]);
  p.outline(P.outline[1]);
}

/** Nakkare player: a pair of small kettle drums on the ground. */
function drawNakkareci(p: PixelCanvas, f: number): void {
  figure(p, { x: 7, y: 16, stride: 0, lean: 1, shirt: P.green, pants: P.dirt, head: 'turban', armFront: f % 2 ? [-3, 2] : [-2, -1], armBack: f % 2 ? [-1, -1] : [-2, 2] });
  for (const dx of [1, 4]) {
    p.ellipse(dx, 14, 1, 1, P.bronze[3]);
    p.set(dx, 13, P.cloth[4]);
  }
  p.outline(P.outline[1]);
}

/** Banner bearer with a tall red–green sancak fluttering. */
function drawSancaktar(p: PixelCanvas, f: number): void {
  const { shoulder } = figure(p, { x: 9, y: 31, stride: 0, lean: 0, shirt: P.cloth, pants: P.red, head: 'bork', armFront: [-1, -3] });
  const px = shoulder[0] - 1;
  for (let y = 1; y <= 30; y++) p.set(px, y, y < 3 ? P.gold[5] : P.wood[3]);
  p.set(px, 0, P.gold[6]);
  // swallow-tailed banner streaming to the right, rippling
  for (let i = 0; i < 9; i++) {
    const off = Math.round(Math.sin(f * 1.5 + i * 0.8) * (i / 9) * 1.5);
    for (let k = 0; k < 6; k++) {
      if (i > 6 && (k === 2 || k === 3)) continue; // swallow tail
      const c = k < 2 ? P.green[3] : k < 6 ? (i % 3 === 1 && k === 3 ? P.gold[4] : P.red[k === 5 ? 3 : 4]) : P.red[3];
      p.set(px + 1 + i, 3 + k + off, c);
    }
  }
  p.outline(P.outline[1]);
}

function flame(p: PixelCanvas, x: number, y: number, f: number, size: number): void {
  const h = 3 + size + ((f * 7) % 3 === 0 ? 1 : 0);
  for (let k = 0; k < h; k++) {
    const t = k / h;
    const w = Math.max(0, Math.round((1 - t) * (1 + size * 0.6)));
    const sway = Math.round(Math.sin(f * 1.9 + k * 0.9) * t * 1.2);
    for (let i = -w; i <= w; i++) {
      const c = Math.abs(i) === w ? P.fire[3] : t < 0.4 ? P.fire[6] : P.fire[5];
      p.set(x + i + sway, y - k, c);
    }
  }
  p.set(x, y + 1, P.fire[6]);
}

/** The Sultan on his grey horse, wading into the shallows, arm raised (faces LEFT). */
function drawSultan(p: PixelCanvas, f: number): void {
  const horse = P.cloth;
  const by = 14;
  const bob = f % 2;
  // body
  for (let x = 5; x <= 14; x++)
    for (let y = by - 4 + bob; y <= by - 1 + bob; y++) {
      const top = y === by - 4 + bob;
      p.set(x, y, top ? horse[5] : x < 8 ? horse[4] : y === by - 1 + bob ? horse[2] : horse[3]);
    }
  // neck & head (to the left)
  p.line(5, by - 4 + bob, 3, by - 8 + bob, horse[4]);
  p.line(6, by - 4 + bob, 4, by - 8 + bob, horse[3]);
  p.rect(1, by - 9 + bob, 3, 2, horse[4]);
  p.set(0, by - 8 + bob, horse[3]);
  p.set(3, by - 10 + bob, horse[2]); // ear
  p.set(1, by - 9 + bob, P.outline[1]); // eye-ish
  // mane & tail
  p.line(5, by - 5 + bob, 4, by - 9 + bob, P.stone[2]);
  p.line(15, by - 3 + bob, 16, by + bob, P.stone[3]);
  // legs churning water
  const lp = [0, 1, 0, -1][f];
  for (const [lx, ph] of [
    [6, lp],
    [8, -lp],
    [12, -lp],
    [14, lp],
  ]) {
    p.line(lx, by + bob, lx + ph, by + 3, horse[2]);
  }
  // saddle cloth (gold-red)
  p.rect(8, by - 4 + bob, 4, 2, P.red[3]);
  p.set(8, by - 3 + bob, P.gold[4]);
  p.set(11, by - 3 + bob, P.gold[4]);
  // rider: green kaftan, white kavuk with red top
  const rx = 10;
  const ry = by - 5 + bob;
  p.rect(rx - 1, ry - 5, 3, 5, P.green[3]);
  p.set(rx - 1, ry - 5, P.green[4]);
  p.set(rx + 1, ry - 1, P.green[1]);
  p.set(rx - 1, ry - 2, P.gold[4]); // sash
  p.set(rx, ry - 2, P.gold[4]);
  p.set(rx - 1, ry - 7, P.skin[4]);
  p.set(rx, ry - 7, P.skin[3]);
  p.set(rx - 2, ry - 7, P.dirt[1]); // beard toward the front
  p.rect(rx - 2, ry - 10, 4, 3, P.turban[3]);
  p.set(rx + 1, ry - 10, P.turban[1]);
  p.set(rx, ry - 11, P.red[4]);
  // raised arm pointing (frames 0–1 high, 2–3 forward)
  if (f < 2) {
    p.line(rx - 1, ry - 4, rx - 3, ry - 9, P.green[4]);
    p.set(rx - 3, ry - 10, P.skin[4]);
  } else {
    p.line(rx - 1, ry - 4, rx - 5, ry - 5, P.green[4]);
    p.set(rx - 6, ry - 5, P.skin[4]);
  }
  p.outline(P.outline[1]);
  // water around the legs (drawn after the outline)
  for (let x = 2; x <= 18; x++) {
    const sh = hash2(x, f, 7);
    p.set(x, by + 2, sh < 0.5 ? P.water[8] : P.water[7], 0.9);
    if (sh > 0.7) p.set(x, by + 1, P.water[9]);
    p.set(x, by + 3, P.water[5], 0.8);
  }
}

function drawSurvivor(p: PixelCanvas, f: number): void {
  // ring of disturbed water
  for (let a = 0; a < 14; a++) {
    const ang = (a / 14) * Math.PI * 2;
    p.set(Math.round(4 + Math.cos(ang) * 3.5), Math.round(6 + Math.sin(ang) * 1.6), P.water[7], 0.8);
  }
  p.set(3, 4, P.skin[4]);
  p.set(4, 4, P.skin[3]);
  p.set(3, 3, P.dirt[1]);
  p.set(4, 3, P.dirt[1]);
  if (f === 0) {
    p.set(6, 3, P.skin[4]);
    p.set(6, 2, P.skin[4]);
    p.set(7, 1, P.skin[4]);
  } else {
    p.set(6, 4, P.skin[3]);
    p.set(7, 3, P.skin[4]);
  }
  p.set(3, 5, P.water[8]);
  p.set(4, 5, P.water[9]);
}

// ───────────────────────────── FX sprites ─────────────────────────────

function drawFoam(p: PixelCanvas, f: number): void {
  // sparse iso ellipse of foam, growing and thinning
  const r = 1.5 + f * 1.6;
  const cx = p.w / 2;
  const cy = p.h / 2;
  const keep = 1 - f * 0.18;
  for (let a = 0; a < 40; a++) {
    const ang = (a / 40) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(ang) * r);
    const y = Math.round(cy + Math.sin(ang) * r * 0.5);
    if (hash2(a, f, 3) > keep) continue;
    p.set(x, y, f < 2 ? P.water[9] : P.water[8]);
  }
  if (f < 2) {
    p.set(cx, cy, P.water[9]);
    p.set(cx - 1, cy, P.water[8]);
  }
}

function drawRing(p: PixelCanvas, f: number): void {
  const r = 2 + f * 2.2;
  const cx = p.w / 2;
  const cy = p.h / 2;
  for (let a = 0; a < 64; a++) {
    const ang = (a / 64) * Math.PI * 2;
    if (hash2(a, f, 9) < f * 0.12) continue;
    p.set(Math.round(cx + Math.cos(ang) * r), Math.round(cy + Math.sin(ang) * r * 0.5), f < 3 ? P.water[9] : P.water[8]);
    if (f < 2) p.set(Math.round(cx + Math.cos(ang) * (r - 1)), Math.round(cy + Math.sin(ang) * (r - 1) * 0.5), P.water[7]);
  }
  // central spray column on the first frames
  if (f < 3) {
    const h = [6, 9, 5][f];
    for (let k = 0; k < h; k++) {
      p.set(cx, cy - k, k > h - 3 ? P.water[9] : P.water[8]);
      if (k % 2 === 0) p.set(cx + (k % 4 === 0 ? 1 : -1) * (1 + f), cy - k + 1, P.water[9]);
    }
  }
}

function drawBubbles(p: PixelCanvas, f: number): void {
  for (let i = 0; i < 6; i++) {
    const x = 2 + Math.round(hash2(i, 1, 4) * (p.w - 4));
    const y = p.h - 2 - ((Math.round(hash2(i, 2, 4) * 6) + f * 2) % (p.h - 2));
    const big = hash2(i, f, 5) > 0.6;
    p.set(x, y, P.water[9]);
    if (big) {
      p.set(x + 1, y, P.water[8]);
      p.set(x, y - 1, P.water[8]);
    }
  }
}

function drawFlames(p: PixelCanvas, f: number): void {
  // three tongues of fire with a hot core, flickering
  const base = p.h - 2;
  const tongues = [
    [4, 8 + ((f * 3) % 4)],
    [8, 12 + ((f * 5) % 5)],
    [12, 7 + ((f * 2 + 1) % 4)],
  ];
  for (const [cx, h] of tongues) {
    for (let k = 0; k < h; k++) {
      const t = k / h;
      const w = Math.max(0, Math.round((1 - t) * 2.6 - 0.3));
      const sway = Math.round(Math.sin(f * 1.7 + k * 0.6 + cx) * t * 2);
      for (let i = -w; i <= w; i++) {
        const edge = Math.abs(i) === w;
        const c = t > 0.75 ? P.fire[3] : edge ? P.fire[4] : t < 0.35 ? P.fire[6] : P.fire[5];
        p.set(cx + i + sway, base - k, c);
      }
    }
  }
  // embers
  for (let i = 0; i < 3; i++) {
    const x = 2 + Math.round(hash2(i, f, 11) * (p.w - 4));
    const y = Math.round(hash2(i, f, 12) * (p.h - 10));
    p.set(x, y, P.fire[5]);
  }
}

function drawTorchPost(p: PixelCanvas, f: number): void {
  const x = 3;
  for (let y = 6; y < p.h; y++) p.set(x, y, y < 8 ? P.wood[2] : P.wood[3]);
  p.set(x - 1, 7, P.steel[2]);
  p.set(x + 1, 7, P.steel[1]);
  flame(p, x, 5, f, 1);
  p.outline(P.outline[1]);
}

function drawSelect(p: PixelCanvas, r: number, f: number): void {
  const cx = p.w / 2;
  const cy = p.h / 2;
  const n = Math.round(r * 5);
  for (let a = 0; a < n; a++) {
    const ang = (a / n) * Math.PI * 2;
    // dashed with a moving gap (2 frames)
    if (((a + f * 2) >> 1) % 4 === 3) continue;
    const x = Math.round(cx + Math.cos(ang) * r);
    const y = Math.round(cy + Math.sin(ang) * r * 0.5);
    p.set(x, y, Math.sin(ang) > 0 ? P.gold[5] : P.gold[4]);
  }
}

function drawOrderMarker(p: PixelCanvas, f: number): void {
  const cx = p.w / 2;
  const cy = p.h - 6;
  // ripple
  const r = 2 + f * 1.5;
  for (let a = 0; a < 32; a++) {
    const ang = (a / 32) * Math.PI * 2;
    if (f > 3 && a % 2) continue;
    p.set(Math.round(cx + Math.cos(ang) * r), Math.round(cy + Math.sin(ang) * r * 0.5), f < 3 ? P.gold[5] : P.gold[3]);
  }
  // anchor glyph dropping in
  const ay = Math.min(cy - 3, 2 + f * 3);
  if (f < 4) {
    const c = P.gold[5];
    p.set(cx, ay, c);
    p.set(cx - 1, ay + 1, c);
    p.set(cx + 1, ay + 1, c);
    for (let k = 1; k <= 5; k++) p.set(cx, ay + k, c);
    p.set(cx - 2, ay + 4, c);
    p.set(cx + 2, ay + 4, c);
    p.set(cx - 1, ay + 5, c);
    p.set(cx + 1, ay + 5, c);
    p.outline(P.outline[1]);
  }
}

// ───────────────────────────── entry ─────────────────────────────

export function generateNavyTextures(gen: TextureGen): void {
  // ships (8 headings × sail/anchor/sink/land)
  for (const t of SHIP_TYPE_IDS) {
    shipSheet(gen, t, false);
    shipIcon(gen, t);
  }
  shipSheet(gen, 'kadirga', true);

  // oxen pairs (8 headings × 4 walk frames)
  for (const dark of [false, true]) {
    const key = dark ? 'navy/okuz-koyu' : 'navy/okuz';
    const built = new Map<number, ReturnType<typeof oxPair>>();
    const get = (f: number) => {
      let m = built.get(f);
      if (!m) {
        m = oxPair(f, dark);
        built.set(f, m);
      }
      return m;
    };
    const W = 30;
    const H = 26;
    props.set(key, { w: W, h: H, ox: 15, oy: 18 });
    gen.sheet(key, W, H, 32, (p, i) => {
      const h = Math.floor(i / 4);
      const f = i % 4;
      const m = get(f);
      renderVox(p, 15, 18, m.vox, m.lines, MATS, { heading: (h * Math.PI) / 4, clipZ: null });
    });
  }

  // slipway rollers & rails in 16 directions
  for (let d = 0; d < 16; d++) {
    const heading = (d * Math.PI) / 8;
    voxProp(gen, `navy/kutuk-d${d}`, 1, () => ({ vox: rollerModel(9), lines: [] }), { heading, clipZ: null });
    voxProp(gen, `navy/ray-d${d}`, 1, () => ({ vox: railModel(8), lines: [] }), { heading, clipZ: null });
  }

  // the Golden Horn chain: floating logs + buoys
  const chainHeading = Math.atan2(CHAIN_DIR.ty, CHAIN_DIR.tx);
  voxProp(gen, 'navy/zincir-kutuk', 1, () => chainLogModel(13), { heading: chainHeading, clipZ: -0.2, wetLine: true });
  voxProp(gen, 'navy/samandira', 4, (f) => buoyModel(f), { heading: chainHeading + 0.6, clipZ: -0.2, wetLine: true });

  // pontoon bridge
  const bh = Math.atan2(BRIDGE_DIR.ty, BRIDGE_DIR.tx);
  voxProp(gen, 'navy/kopru', 1, () => bridgeSegmentModel(true), { heading: bh, clipZ: -0.3, wetLine: true });
  voxProp(gen, 'navy/kopru-top', 1, () => gunPlatformModel(), { heading: bh, clipZ: -0.3, wetLine: true });

  // floating debris (4 variants)
  const deb = debrisModels();
  voxProp(gen, 'navy/enkaz', deb.length, (f) => deb[f], { heading: 0.4, clipZ: -0.3 }, 1);

  // figures
  for (let v = 0; v < 4; v++) gen.sheet(`navy/hamal${v}`, 12, 17, 4, (p, f) => drawHamal(p, f, v));
  gen.sheet('navy/davulcu', 12, 18, 4, (p, f) => drawDavulcu(p, f));
  gen.sheet('navy/mesaleci', 12, 21, 4, (p, f) => drawMesaleci(p, f));
  gen.sheet('navy/isci', 12, 17, 4, (p, f) => drawIsci(p, f));
  gen.sheet('navy/zurnaci', 12, 17, 4, (p, f) => drawZurnaci(p, f));
  gen.sheet('navy/nakkareci', 12, 17, 4, (p, f) => drawNakkareci(p, f));
  gen.sheet('navy/sancaktar', 22, 33, 4, (p, f) => drawSancaktar(p, f));
  gen.anim('navy/zurnaci:cal', 'navy/zurnaci', [0, 1, 2, 3], 5);
  gen.anim('navy/nakkareci:cal', 'navy/nakkareci', [0, 1, 2, 3], 9);
  gen.anim('navy/sancaktar:dalga', 'navy/sancaktar', [0, 1, 2, 3], 6);
  gen.sheet('navy/sultan', 20, 18, 4, (p, f) => drawSultan(p, f));
  gen.sheet('navy/kazazede', 9, 8, 2, (p, f) => drawSurvivor(p, f));
  for (let v = 0; v < 4; v++) {
    gen.anim(`navy/hamal${v}:yuru`, `navy/hamal${v}`, [0, 1, 2, 3], 6);
  }
  gen.anim('navy/davulcu:cal', 'navy/davulcu', [0, 1, 2, 3], 8);
  gen.anim('navy/mesaleci:yuru', 'navy/mesaleci', [0, 1, 2, 3], 6);
  gen.anim('navy/isci:cak', 'navy/isci', [0, 1, 2, 3], 6);
  gen.anim('navy/sultan:bagir', 'navy/sultan', [0, 1, 2, 3], 5);
  gen.anim('navy/kazazede:el', 'navy/kazazede', [0, 1], 3);

  // soft cast shadow (to the lower-right), dithered edge
  gen.canvas('navy/golge', 40, 14, (p) => {
    for (let y = 0; y < 14; y++)
      for (let x = 0; x < 40; x++) {
        const dx = (x - 20) / 19;
        const dy = (y - 7) / 6.5;
        const d = dx * dx + dy * dy;
        if (d > 1) continue;
        if (d > 0.6 && ((x + y) & 1)) continue;
        p.set(x, y, P.outline[1], 0.45);
      }
  });
  // fx
  gen.sheet('navy/kopuk', 16, 9, 5, (p, f) => drawFoam(p, f));
  gen.sheet('navy/halka', 28, 22, 6, (p, f) => drawRing(p, f));
  gen.anim('navy/halka:sicra', 'navy/halka', [0, 1, 2, 3, 4, 5], 12, 0);
  gen.sheet('navy/kabarcik', 12, 12, 4, (p, f) => drawBubbles(p, f));
  gen.anim('navy/kabarcik:kaynar', 'navy/kabarcik', [0, 1, 2, 3], 8);
  gen.sheet('navy/alev', 16, 22, 6, (p, f) => drawFlames(p, f));
  gen.anim('navy/alev:yan', 'navy/alev', [0, 1, 2, 3, 4, 5], 12);
  gen.sheet('navy/mesale', 7, 18, 4, (p, f) => drawTorchPost(p, f));
  gen.anim('navy/mesale:yan', 'navy/mesale', [0, 1, 2, 3], 9);
  gen.sheet('navy/secim-k', 44, 24, 2, (p, f) => drawSelect(p, 19, f));
  gen.sheet('navy/secim-b', 62, 33, 2, (p, f) => drawSelect(p, 28, f));
  gen.sheet('navy/hedef', 17, 20, 6, (p, f) => drawOrderMarker(p, f));
  gen.anim('navy/hedef:in', 'navy/hedef', [0, 1, 2, 3, 4, 5], 10, 0);
}
