import { P } from '../../art/palette';
import type { PixelCanvas } from '../../art/pixel';
import type { TextureGen } from '../../art/texture';
import type { UnitTypeId } from '../../core/state';
import {
  CX,
  drawFigure,
  drawHorse,
  drawLying,
  drawRider,
  FH,
  footShadow,
  FW,
  FY,
  outlineAll,
  type ArmPose,
  type HorseKit,
  type Kit,
  type Pose,
} from './art-kit';
import type { BannerColor } from './data';

/**
 * ARMY ART — every sprite of the army, drawn procedurally with PixelCanvas
 * (keys 'army/…'). Infantry sheets are 16×20 frames, mounted 24×26.
 */

// ───────────────────────────── frame layouts ─────────────────────────────

/** Infantry sheet layout (front frames; +BACK for the back facing). */
export const INF = { idle: [0, 1], walk: [2, 3, 4, 5], atk: [6, 7, 8], die: [9, 10, 11], back: 12, climb: [24, 25], n: 26 } as const;
/** Mounted sheet layout. */
export const MNT = { idle: [0, 1], walk: [2, 3, 4, 5], atk: [6, 7], die: [8, 9], back: 10, n: 20, w: 24, h: 26 } as const;
/** Mehter musician layout. */
export const MEH = { idle: [0, 1], walk: [2, 3, 4, 5], play: [6, 7, 8, 9], back: 10, n: 20 } as const;
/** Banner / tuğ bearer layout (20×36). */
export const BAN = { idle: [0, 1, 2, 3], walk: [4, 5, 6, 7], back: 8, n: 16, w: 20, h: 36, fy: 33 } as const;
/** Commander (mounted, 24×26): idle 0..1, walk 2..5, back +6. */
export const CMD = { idle: [0, 1], walk: [2, 3, 4, 5], back: 6, n: 12 } as const;

// ───────────────────────────── kits ─────────────────────────────

const SK: [string, string] = [P.skin[4], P.skin[3]];
const SK2: [string, string] = [P.skin[3], P.skin[2]];
const TURB: [string, string, string] = [P.turban[3], P.turban[2], P.turban[1]];
const MUST = P.dirt[1];

export const KITS: Record<string, Kit[]> = {
  yeniceri: [
    { skin: SK, coat: [P.blue[4], P.blue[3], P.blue[1]], long: true, under: P.red[5], sash: P.red[4], pants: [P.red[3], P.red[2]], boots: P.gold[2], head: 'bork', headC: TURB, weapon: 'kilic', beard: MUST },
    { skin: SK2, coat: [P.red[5], P.red[4], P.red[2]], long: true, under: P.cloth[4], sash: P.gold[4], pants: [P.blue[3], P.blue[2]], boots: P.gold[2], head: 'bork', headC: TURB, weapon: 'yay', beard: MUST },
    { skin: SK, coat: [P.blue[3], P.blue[2], P.blue[0]], long: true, under: P.gold[4], sash: P.gold[3], pants: [P.cloth[3], P.cloth[2]], boots: P.red[2], head: 'bork', headC: TURB, weapon: 'teber', beard: P.dirt[2] },
  ],
  azap: [
    { skin: SK2, coat: [P.sand[4], P.sand[3], P.sand[1]], sash: P.red[4], pants: [P.dirt[4], P.dirt[3]], boots: P.dirt[1], head: 'kulah', headC: [P.red[5], P.red[4], P.red[2]], weapon: 'yay', beard: MUST },
    { skin: SK, coat: [P.cloth[4], P.cloth[3], P.cloth[1]], sash: P.green[3], pants: [P.dirt[3], P.dirt[2]], boots: P.dirt[1], head: 'kulah', headC: [P.wood[5], P.wood[4], P.wood[2]], weapon: 'mizrak', shield: { rim: P.wood[3], face: P.sand[3], boss: P.wood[5] } },
  ],
  sipahi: [
    { skin: SK, coat: [P.red[4], P.red[3], P.red[1]], mail: true, sash: P.gold[4], pants: [P.blue[2], P.blue[1]], boots: P.red[2], head: 'sarik', headC: TURB, capTop: P.red[4], weapon: 'kilic', beard: P.dirt[1], shield: { rim: P.gold[3], face: P.red[3], boss: P.gold[5] } },
    { skin: SK2, coat: [P.green[4], P.green[3], P.green[1]], mail: true, sash: P.red[4], pants: [P.dirt[3], P.dirt[2]], boots: P.dirt[1], head: 'sarik', headC: TURB, capTop: P.green[4], weapon: 'mizrak', beard: P.outline[2], shield: { rim: P.steel[4], face: P.blue[3], boss: P.gold[5] } },
  ],
  basibozuk: [
    { skin: SK2, coat: [P.sand[3], P.sand[2], P.sand[0]], ragged: P.dirt[3], pants: [P.dirt[3], P.dirt[2]], boots: P.dirt[1], head: 'bare', headC: TURB, hair: P.outline[2], weapon: 'sopa', beard: P.outline[2] },
    { skin: SK, coat: [P.dirt[5], P.dirt[4], P.dirt[2]], ragged: P.sand[2], sash: P.red[3], pants: [P.cloth[2], P.cloth[1]], boots: P.dirt[1], head: 'basortu', headC: [P.green[4], P.green[3], P.green[1]], weapon: 'balta', beard: MUST },
    { skin: SK2, coat: [P.cloth[4], P.cloth[3], P.cloth[1]], ragged: P.dirt[4], pants: [P.blue[2], P.blue[1]], boots: P.dirt[2], head: 'kulah', headC: [P.cloth[2], P.cloth[1], P.cloth[0]], weapon: 'tirpan' },
    { skin: SK, coat: [P.red[3], P.red[2], P.red[0]], ragged: P.wood[3], sash: P.sand[3], pants: [P.dirt[4], P.dirt[3]], boots: P.dirt[1], head: 'sarik', headC: [P.sand[5], P.sand[4], P.sand[2]], capTop: P.wood[3], weapon: 'yaba', beard: P.dirt[2] },
  ],
  akinci: [
    { skin: SK2, coat: [P.sand[5], P.sand[4], P.sand[2]], sash: P.red[4], pants: [P.red[3], P.red[2]], boots: P.dirt[1], head: 'akincibork', headC: [P.red[5], P.red[4], P.red[2]], feather: true, weapon: 'mizrak', beard: MUST },
    { skin: SK, coat: [P.dryGrass[3], P.dryGrass[2], P.dryGrass[0]], sash: P.green[3], pants: [P.dirt[3], P.dirt[2]], boots: P.dirt[1], head: 'akincibork', headC: [P.wood[5], P.wood[4], P.wood[2]], feather: true, weapon: 'yay', beard: P.dirt[2] },
  ],
  topcu: [
    { skin: SK, coat: [P.red[5], P.red[4], P.red[2]], sash: P.gold[4], pants: [P.dirt[3], P.dirt[2]], boots: P.dirt[1], head: 'kulah', headC: [P.cloth[5], P.cloth[4], P.cloth[2]], apron: P.wood[3], weapon: 'tokmak', beard: MUST },
  ],
  lagimci: [
    { skin: SK2, coat: [P.dirt[4], P.dirt[3], P.dirt[1]], sash: P.dirt[5], pants: [P.dirt[3], P.dirt[2]], boots: P.outline[2], head: 'deri', headC: [P.wood[4], P.wood[3], P.wood[1]], apron: P.wood[2], weapon: 'kazma', beard: P.dirt[1] },
    { skin: SK, coat: [P.stone[4], P.stone[3], P.stone[1]], sash: P.dirt[4], pants: [P.dirt[3], P.dirt[2]], boots: P.outline[2], head: 'deri', headC: [P.dirt[5], P.dirt[4], P.dirt[2]], apron: P.wood[2], weapon: 'kurek' },
  ],
  rum: [
    { skin: SK, coat: [P.red[3], P.red[2], P.red[0]], mail: true, sash: P.gold[3], pants: [P.dirt[3], P.dirt[2]], boots: P.dirt[1], head: 'migfer', headC: TURB, weapon: 'mizrak', beard: P.dirt[1], shield: { rim: P.steel[4], face: P.red[4], boss: P.gold[5] } },
    { skin: SK2, coat: [P.cloth[5], P.cloth[4], P.cloth[2]], cross: P.red[4], pants: [P.red[3], P.red[2]], boots: P.dirt[1], head: 'migfer', headC: TURB, weapon: 'arbalet' },
    { skin: SK, coat: [P.blue[3], P.blue[2], P.blue[0]], mail: true, sash: P.red[3], pants: [P.dirt[4], P.dirt[3]], boots: P.dirt[1], head: 'migfer', headC: TURB, capTop: P.red[4], weapon: 'kilic', beard: P.outline[2], shield: { rim: P.gold[3], face: P.purple[3], boss: P.gold[5] } },
  ],
};

export const MEHTER_KIT: Kit = {
  skin: SK,
  coat: [P.red[5], P.red[4], P.red[2]],
  long: true,
  sash: P.gold[4],
  pants: [P.blue[2], P.blue[1]],
  boots: P.gold[2],
  head: 'sarik',
  headC: TURB,
  capTop: P.red[4],
  weapon: 'none',
  beard: MUST,
};

export const HORSES: HorseKit[] = [
  { coat: [P.wood[5], P.wood[4], P.wood[2]], mane: P.outline[1], cloth: [P.red[4], P.red[2]], orn: P.gold[4] },
  { coat: [P.stone[6], P.stone[5], P.stone[3]], mane: P.stone[2], cloth: [P.green[4], P.green[2]], orn: P.gold[4] },
  { coat: [P.brick[4], P.brick[3], P.brick[1]], mane: P.wood[1], cloth: [P.blue[3], P.blue[1]] },
  { coat: [P.outline[2], P.night[1], P.outline[0]], mane: P.outline[0], cloth: [P.red[3], P.red[1]], orn: P.gold[3] },
];
export const SULTAN_HORSE: HorseKit = { coat: [P.cloth[5], P.cloth[4], P.cloth[2]], mane: P.cloth[3], cloth: [P.red[5], P.red[3]], orn: P.gold[5] };

/** Sheet keys per unit type (variants). */
export function sheetKeys(type: UnitTypeId, mounted: boolean): string[] {
  switch (type) {
    case 'yeniceri':
      return ['army/yeniceri-0', 'army/yeniceri-1', 'army/yeniceri-2'];
    case 'azap':
      return ['army/azap-0', 'army/azap-1'];
    case 'sipahi':
      return mounted ? ['army/sipahi-atli-0', 'army/sipahi-atli-1'] : ['army/sipahi-0', 'army/sipahi-1'];
    case 'basibozuk':
      return ['army/basibozuk-0', 'army/basibozuk-1', 'army/basibozuk-2', 'army/basibozuk-3'];
    case 'akinci':
      return ['army/akinci-atli-0', 'army/akinci-atli-1'];
    case 'topcu':
      return ['army/topcu-0'];
    case 'lagimci':
      return ['army/lagimci-0', 'army/lagimci-1'];
    case 'mehter':
      return ['army/mehter-davul', 'army/mehter-zurna', 'army/mehter-zil', 'army/mehter-nakkare'];
  }
}

// ───────────────────────────── infantry ─────────────────────────────

function infPose(f: number, archer: boolean): { pose: Pose; lying?: boolean } {
  const back = f >= INF.back && f < INF.back * 2;
  const i = f >= INF.back * 2 ? f : f % INF.back;
  const base: Pose = { bob: 0, legB: 0, legF: 0, lean: 0, arm: 'rest', back };
  if (f >= 24) return { pose: { ...base, back: true, arm: f === 24 ? 'up1' : 'up2', liftB: f === 24 ? 1 : 0, liftF: f === 24 ? 0 : 1, bob: 0 } };
  switch (i) {
    case 0:
      return { pose: base };
    case 1:
      return { pose: { ...base, bob: 1 } };
    case 2:
      return { pose: { ...base, legB: -2, legF: 2, arm: 'swingA' } };
    case 3:
      return { pose: { ...base, liftF: 1, bob: -1 } };
    case 4:
      return { pose: { ...base, legB: 1, legF: -2, arm: 'swingB' } };
    case 5:
      return { pose: { ...base, liftB: 1, bob: -1 } };
    case 6:
      return { pose: { ...base, lean: archer ? 0 : -1, arm: archer ? 'draw' : 'ready', legF: archer ? 1 : 0, legB: archer ? -1 : 0 } };
    case 7:
      return { pose: { ...base, lean: archer ? 0 : 1, arm: archer ? 'loose' : 'strike', legF: 1, legB: -1 } };
    case 8:
      return { pose: { ...base, arm: archer ? 'rest' : 'recover', legF: 1 } };
    case 9:
      return { pose: { ...base, lean: -1, arm: 'fling', bob: 0 } };
    case 10:
      return { pose: { ...base, lean: -1, arm: 'fling', crouch: 3 } };
    default:
      return { pose: base, lying: true };
  }
}

export function drawInfantryFrame(p: PixelCanvas, k: Kit, f: number): void {
  const archer = k.weapon === 'yay' || k.weapon === 'arbalet';
  const { pose, lying } = infPose(f, archer);
  if (lying) {
    drawLying(p, k, 0, 0, f);
    outlineAll(p);
    return;
  }
  drawFigure(p, k, pose);
  outlineAll(p);
  footShadow(p, CX, FY, 3);
}

// ───────────────────────────── mounted ─────────────────────────────

function drawHorseLying(p: PixelCanvas, h: HorseKit, oy: number): void {
  const y = 21 + oy;
  for (let x = 4; x <= 17; x++) {
    p.set(x, y, h.coat[1]);
    p.set(x, y + 1, h.coat[2]);
  }
  for (let x = 6; x <= 15; x++) p.set(x, y - 1, h.coat[0]);
  p.set(18, y, h.coat[1]);
  p.set(19, y + 1, h.coat[2]);
  p.set(20, y + 1, h.coat[1]);
  for (let x = 7; x <= 10; x++) p.set(x, y - 1, h.cloth[0]);
  p.set(3, y, h.mane);
  p.set(2, y + 1, h.mane);
  p.set(16, y + 2, P.outline[2]);
  p.set(13, y + 2, P.outline[2]);
}

export function drawMountedFrame(p: PixelCanvas, k: Kit, h: HorseKit, f: number): void {
  const back = f >= MNT.back;
  const i = f % MNT.back;
  let gait = -1;
  let arm: ArmPose = 'rest';
  let rear = 0;
  if (i === 1) gait = -1;
  if (i >= 2 && i <= 5) gait = i - 2;
  if (i === 6) arm = k.weapon === 'yay' ? 'draw' : 'ready';
  if (i === 7) arm = k.weapon === 'yay' ? 'loose' : 'strike';
  if (i === 8) {
    rear = 2;
    arm = 'fling';
  }
  if (i === 9) {
    drawHorseLying(p, h, 0);
    const q = p;
    drawLying(q, k, 4, 6, 1);
    outlineAll(p);
    return;
  }
  const s = drawHorse(p, h, gait, 0, 0, rear);
  const bob = i === 1 ? 1 : 0;
  drawRider(p, k, s.sx, s.sy + bob, arm, back);
  outlineAll(p);
  for (let x = 4; x <= 19; x++) if (p.alphaAt(x, 24) === 0) p.set(x, 24, P.outline[0], x === 4 || x === 19 ? 0.15 : 0.28);
}

// ───────────────────────────── mehter ─────────────────────────────

type MehterRole = 'davul' | 'zurna' | 'zil' | 'nakkare' | 'basi';

function drawInstrument(p: PixelCanvas, role: MehterRole, f: number, back: boolean): void {
  const play = f >= 6 && f <= 9;
  const ph = play ? f - 6 : 0;
  const bob = f === 1 ? 1 : f === 3 || f === 5 ? -1 : 0;
  const tTop = FY + bob - 8;
  const x0 = CX - 2;
  const g = P.gold;
  switch (role) {
    case 'davul': {
      // big drum on the chest, mallet (tokmak) and switch (çubuk)
      const dy = tTop + 3;
      for (let y = dy; y < dy + 4; y++)
        for (let x = x0 + 1; x < x0 + 7; x++) p.set(x, y, x === x0 + 1 ? P.cloth[5] : x === x0 + 6 ? P.red[2] : y === dy || y === dy + 3 ? g[3] : P.red[4]);
      for (let x = x0 + 2; x < x0 + 6; x++) p.set(x, dy + 1 + (x % 2), g[5]);
      const up = ph === 0 || ph === 2;
      p.set(x0 + 6, up ? dy - 3 : dy - 1, P.wood[5]);
      p.set(x0 + 6, up ? dy - 2 : dy, P.wood[4]);
      p.set(x0 + 7, up ? dy - 4 : dy - 1, P.cloth[5]);
      break;
    }
    case 'zurna': {
      // shawm held up to the lips, bell swinging with the tune
      const mx = CX + 2;
      const my = tTop - 1;
      const sw = ph === 1 ? -1 : ph === 3 ? 1 : 0;
      p.set(mx, my, P.wood[4]);
      p.set(mx + 1, my + 1, P.wood[4]);
      p.set(mx + 2, my + 2 + sw, P.wood[5]);
      p.set(mx + 3, my + 3 + sw, g[4]);
      p.set(mx + 3, my + 4 + sw, g[3]);
      p.set(mx + 4, my + 3 + sw, g[5]);
      p.set(mx + 1, my + 2, P.skin[4]);
      break;
    }
    case 'zil': {
      // cymbals clashing
      const open = ph === 0 || ph === 2;
      const cy = tTop + 1;
      const lx = open ? CX - 4 : CX - 1;
      const rx = open ? CX + 5 : CX + 2;
      for (const x of [lx, rx]) {
        p.set(x, cy, g[5]);
        p.set(x, cy + 1, g[4]);
        p.set(x, cy - 1, g[3]);
      }
      if (!open && play) p.set(CX + 1, cy - 2, g[6]);
      break;
    }
    case 'nakkare': {
      // pair of small kettledrums at the waist
      const ny = tTop + 5;
      for (const nx of [x0, x0 + 4]) {
        p.set(nx, ny, P.cloth[4]);
        p.set(nx + 1, ny, P.cloth[5]);
        p.set(nx + 2, ny, P.cloth[4]);
        p.set(nx, ny + 1, P.bronze[4]);
        p.set(nx + 1, ny + 1, P.bronze[5]);
        p.set(nx + 2, ny + 1, P.bronze[3]);
        p.set(nx + 1, ny + 2, P.bronze[2]);
      }
      const hit = ph % 2 === 0;
      p.set(x0 + (hit ? 1 : 0), ny - (hit ? 1 : 3), P.wood[5]);
      p.set(x0 + 5 - (hit ? 0 : 1), ny - (hit ? 3 : 1), P.wood[5]);
      break;
    }
    case 'basi': {
      // mehterbaşı with the çevgen (staff hung with little bells)
      const sx = CX + 3;
      for (let y = tTop - 7; y <= FY; y++) p.set(sx, y + (play && ph % 2 ? -1 : 0), P.wood[5]);
      const ty = tTop - 8 + (play && ph % 2 ? -1 : 0);
      p.set(sx, ty, g[6]);
      p.set(sx - 1, ty + 1, g[4]);
      p.set(sx + 1, ty + 1, g[4]);
      p.set(sx - 1, ty + 2 + (ph === 1 ? 1 : 0), g[5]);
      p.set(sx + 1, ty + 2 + (ph === 3 ? 1 : 0), g[5]);
      break;
    }
  }
  void back;
}

export function drawMehterFrame(p: PixelCanvas, role: MehterRole, f: number): void {
  const back = f >= MEH.back;
  const i = f % MEH.back;
  let pose: Pose = { bob: 0, legB: 0, legF: 0, lean: 0, arm: 'carry', back };
  if (i === 1) pose = { ...pose, bob: 1 };
  if (i >= 2 && i <= 5) {
    const w = infPose(i, false).pose;
    pose = { ...w, back, arm: 'carry' };
  }
  if (i >= 6) pose = { ...pose, bob: i % 2 ? 0 : 1, lean: role === 'zurna' ? (i % 2 ? 0 : 1) : 0, arm: role === 'zil' ? (i % 2 ? 'push' : 'carry') : 'carry' };
  drawFigure(p, MEHTER_KIT, pose);
  if (!back || role === 'basi') drawInstrument(p, role, i, back);
  outlineAll(p);
  footShadow(p, CX, FY, 3);
}

/** Kös: great kettledrums slung on a horse, beaten by the rider. */
export function drawKosFrame(p: PixelCanvas, f: number): void {
  const back = f >= MEH.back;
  const i = f % MEH.back;
  const gait = i >= 2 && i <= 5 ? i - 2 : -1;
  const h: HorseKit = { coat: [P.stone[5], P.stone[4], P.stone[2]], mane: P.stone[1], cloth: [P.red[5], P.red[3]], orn: P.gold[5] };
  const s = drawHorse(p, h, gait);
  // drums on both flanks
  const dy = s.sy + 1;
  for (let y = dy; y < dy + 4; y++)
    for (let x = s.sx - 6; x < s.sx - 1; x++) {
      const rim = y === dy;
      p.set(x, y, rim ? P.cloth[4] : y === dy + 3 ? P.bronze[2] : x === s.sx - 6 ? P.bronze[5] : P.bronze[4]);
    }
  p.set(s.sx - 4, dy + 1, P.bronze[6]);
  const kit: Kit = { ...MEHTER_KIT, coat: [P.gold[4], P.gold[3], P.gold[1]] };
  const beat = i >= 6 && i % 2 === 0;
  drawRider(p, kit, s.sx + 1, s.sy, beat ? 'carry' : 'ready', back);
  // mallets
  p.set(s.sx - 3, beat ? dy - 1 : dy - 4, P.wood[5]);
  p.set(s.sx - 2, beat ? dy - 2 : dy - 5, P.wood[4]);
  outlineAll(p);
  for (let x = 4; x <= 19; x++) if (p.alphaAt(x, 24) === 0) p.set(x, 24, P.outline[0], 0.28);
}

// ───────────────────────────── banners ─────────────────────────────

export const BANNER_RAMP: Record<BannerColor, { c: [string, string, string]; border?: string }> = {
  kirmizi: { c: [P.red[5], P.red[4], P.red[2]] },
  beyaz: { c: [P.cloth[5], P.cloth[4], P.cloth[2]], border: P.red[4] },
  yesil: { c: [P.green[5], P.green[4], P.green[2]] },
  sultan: { c: [P.cloth[5], P.cloth[4], P.cloth[3]], border: P.gold[4] },
};

/** Swallow-tailed sancak cloth hanging from (x0,y0), width w, height h, waving with phase. */
export function drawFlag(p: PixelCanvas, x0: number, y0: number, w: number, h: number, col: BannerColor | 'hasan', phase: number, wind = 1): void {
  const r = col === 'hasan' ? { c: [P.red[5], P.red[4], P.red[2]] as [string, string, string], border: P.gold[5] } : BANNER_RAMP[col];
  for (let x = 0; x < w; x++) {
    const wave = Math.round(Math.sin(phase * Math.PI * 0.5 + x * 0.9) * (x / w) * 1.6 * wind);
    const notch = x >= w - 2 ? (x === w - 1 ? 2 : 1) : 0;
    for (let y = 0; y < h; y++) {
      if (notch && y >= Math.floor(h / 2) - (notch === 2 ? 1 : 0) && y <= Math.floor((h - 1) / 2) + (notch === 2 ? 1 : 0)) continue;
      const shade = Math.sin(phase * Math.PI * 0.5 + x * 0.9 + 0.8);
      let c = shade > 0.35 ? r.c[0] : shade < -0.35 ? r.c[2] : r.c[1];
      if (r.border && (y === 0 || y === h - 1)) c = r.border;
      p.set(x0 + x, y0 + y + wave, c);
    }
  }
}

function drawPoleTop(p: PixelCanvas, x: number, y: number): void {
  p.set(x, y, P.gold[6]);
  p.set(x - 1, y + 1, P.gold[4]);
  p.set(x, y + 1, P.gold[5]);
  p.set(x + 1, y + 1, P.gold[3]);
  p.set(x, y + 2, P.gold[3]);
}

const BEARER_KIT: Record<BannerColor, Kit> = {
  kirmizi: KITS.sipahi[0],
  beyaz: KITS.azap[0],
  yesil: KITS.sipahi[1],
  sultan: KITS.yeniceri[1],
};

export function drawBearerFrame(p: PixelCanvas, col: BannerColor | 'tug' | 'hasan', f: number): void {
  const back = f >= BAN.back;
  const i = f % BAN.back;
  const walk = i >= 4;
  const ph = i % 4;
  const kit = col === 'tug' ? KITS.yeniceri[0] : col === 'hasan' ? { ...KITS.yeniceri[0], shield: { rim: P.gold[3], face: P.red[3], boss: P.gold[5] } } : BEARER_KIT[col];
  const pose: Pose = walk ? { ...infPose(2 + ph, false).pose, back, arm: 'up1' } : { bob: ph === 2 ? 1 : 0, legB: 0, legF: 0, lean: 0, arm: 'up1', back };
  const ox = 2;
  const oy = BAN.fy - FY;
  drawFigure(p, kit, pose, ox, oy);
  // pole
  const bob = pose.bob;
  const px0 = CX + ox + 3;
  const top = 3 + bob;
  for (let y = top + 2; y <= BAN.fy - 3 + bob; y++) p.set(px0, y, y < top + 10 ? P.wood[6] : P.wood[4]);
  drawPoleTop(p, px0, top);
  if (col === 'tug') {
    // horsetail standard: gold ball, black and white tails swaying
    const sw = ph === 1 ? 1 : ph === 3 ? -1 : 0;
    for (let k = 0; k < 7; k++) {
      p.set(px0 - 1 + (k > 3 ? sw : 0), top + 3 + k, P.outline[1]);
      p.set(px0 + 1 + (k > 4 ? sw : 0), top + 3 + k, k % 2 ? P.outline[2] : P.night[1]);
    }
    p.set(px0 - 2 + sw, top + 9, P.outline[2]);
    p.set(px0 + sw, top + 10, P.cloth[3]);
  } else {
    drawFlag(p, px0 + 1, top + 3, 8, 6, col, ph + (walk ? 0.5 : 0), walk ? 1.4 : 1);
  }
  outlineAll(p);
  footShadow(p, CX + ox, BAN.fy, 3);
}

/** Commanders: mounted, big turban (kavuk), rich kaftan. */
export const COMMANDER_KITS: Record<string, { kit: Kit; horse: HorseKit }> = {
  fatih: {
    kit: { skin: SK, coat: [P.gold[5], P.gold[4], P.gold[2]], long: true, sash: P.red[4], pants: [P.red[3], P.red[2]], boots: P.gold[3], head: 'kavuk', headC: TURB, capTop: P.red[4], weapon: 'none', beard: P.dirt[2] },
    horse: SULTAN_HORSE,
  },
  pasa: {
    kit: { skin: SK, coat: [P.green[4], P.green[3], P.green[1]], long: true, sash: P.gold[4], pants: [P.red[3], P.red[2]], boots: P.gold[2], head: 'kavuk', headC: TURB, capTop: P.green[4], weapon: 'none', beard: P.cloth[2] },
    horse: HORSES[0],
  },
  pasa2: {
    kit: { skin: SK2, coat: [P.red[5], P.red[4], P.red[2]], long: true, sash: P.gold[4], pants: [P.blue[2], P.blue[1]], boots: P.gold[2], head: 'kavuk', headC: TURB, capTop: P.red[4], weapon: 'kilic', beard: P.outline[2] },
    horse: HORSES[3],
  },
  pasa3: {
    kit: { skin: SK, coat: [P.blue[4], P.blue[3], P.blue[1]], long: true, sash: P.gold[4], pants: [P.red[3], P.red[2]], boots: P.gold[2], head: 'kavuk', headC: TURB, capTop: P.blue[4], weapon: 'kilic', beard: P.dirt[1] },
    horse: HORSES[1],
  },
};

export function commanderSheet(id: string | null): string {
  if (id === 'fatih') return 'army/pasa-fatih';
  if (id === 'zaganos' || id === 'mahmud') return 'army/pasa-pasa';
  if (id === 'karaca' || id === 'turahan') return 'army/pasa-pasa2';
  return 'army/pasa-pasa3';
}

export function drawCommanderFrame(p: PixelCanvas, id: string, f: number): void {
  const { kit, horse } = COMMANDER_KITS[id];
  const back = f >= CMD.back;
  const i = f % CMD.back;
  const gait = i >= 2 ? i - 2 : -1;
  const s = drawHorse(p, horse, gait);
  drawRider(p, kit, s.sx, s.sy + (i === 1 ? 1 : 0), i === 1 ? 'carry' : 'rest', back);
  outlineAll(p);
  for (let x = 4; x <= 19; x++) if (p.alphaAt(x, 24) === 0) p.set(x, 24, P.outline[0], 0.28);
}

// ───────────────────────────── camel (baggage) ─────────────────────────────

export function drawCamelFrame(p: PixelCanvas, f: number): void {
  const gait = f % 4;
  const hy = 23;
  const bob = gait === 1 || gait === 3 ? -1 : 0;
  const by = hy - 10 + bob;
  const c: [string, string, string] = [P.sand[4], P.sand[3], P.sand[1]];
  const legOff = [[1, -1, -1, 1], [0, 0, 0, 0], [-1, 1, 1, -1], [0, 0, 0, 0]][gait];
  [5, 7, 14, 16].forEach((lx, i) => {
    for (let y = by + 4; y <= hy; y++) p.set(lx + (y > by + 7 ? legOff[i] : 0), y, y === hy ? P.outline[2] : i % 2 ? c[1] : c[2]);
  });
  for (let y = by; y <= by + 4; y++) for (let x = 4; x <= 17; x++) if (!((x === 4 || x === 17) && (y === by || y === by + 4))) p.set(x, y, y === by ? c[0] : y > by + 2 ? c[2] : c[1]);
  // hump + load (striped saddle bags)
  for (let x = 8; x <= 13; x++) p.set(x, by - 1, c[0]);
  for (let y = by - 4; y <= by + 1; y++)
    for (let x = 7; x <= 14; x++) {
      const stripe = (x + y) % 3 === 0;
      p.set(x, y, y === by - 4 ? P.cloth[4] : stripe ? P.red[4] : x < 10 ? P.sand[2] : P.wood[4]);
    }
  // neck & head
  for (let i = 0; i < 5; i++) {
    p.set(17 + (i >> 1), by - i, c[1]);
    p.set(18 + (i >> 1), by - i, c[2]);
  }
  p.set(20, by - 5, c[1]);
  p.set(21, by - 5, c[1]);
  p.set(21, by - 4, c[2]);
  p.set(20, by - 6, c[0]);
  p.set(20, by - 5, P.outline[1]);
  outlineAll(p);
  for (let x = 4; x <= 19; x++) if (p.alphaAt(x, 24) === 0) p.set(x, 24, P.outline[0], 0.26);
}

// ───────────────────────────── props ─────────────────────────────

/**
 * Scaling ladder: frame 0 leaning against the wall, 1–2 pushed off and toppling,
 * 3 lying. Variant 'u' leans slightly (wall straight ahead), 'r' leans to the right.
 */
export function drawLadderFrame(p: PixelCanvas, f: number, lean: 'u' | 'r', len: number): void {
  const bx = lean === 'u' ? 7 : 4;
  const by = p.h - 2;
  const angles = lean === 'u' ? [82, 98, 125, 168] : [62, 82, 115, 165];
  const a = (angles[f] * Math.PI) / 180;
  const dx = Math.cos(a);
  const dy = -Math.sin(a);
  const L = f === 3 ? Math.min(len, p.w - 4) : len;
  const nx = -dy;
  const ny = dx;
  for (let s = 0; s <= L; s++) {
    const x = bx + dx * s;
    const y = by + dy * s;
    p.set(Math.round(x), Math.round(y), P.wood[5]);
    p.set(Math.round(x + nx * 3), Math.round(y + ny * 3), P.wood[3]);
    if (s % 3 === 1) for (let r = 1; r < 3; r++) p.set(Math.round(x + nx * r), Math.round(y + ny * r), P.wood[4]);
  }
  p.outline(P.outline[0]);
}

/** Byzantine defender throwing a stone / pushing a pole / falling. Uses INF layout. */

export function drawRingFrame(p: PixelCanvas, rx: number, f: number): void {
  const ry = Math.max(3, Math.round(rx / 2));
  const cx = p.w / 2;
  const cy = p.h / 2;
  const n = Math.round(rx * 4.2);
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(t) * rx - 0.5);
    const y = Math.round(cy + Math.sin(t) * ry - 0.5);
    const dash = Math.floor((i + f * 2) / 3) % 2 === 0;
    p.set(x, y, dash ? P.gold[5] : P.gold[2]);
  }
}

export function drawMarkerFrame(p: PixelCanvas, f: number, hucum: boolean): void {
  // little order flag on a pole, planted in a ground cross
  const x = 4;
  for (let y = 3; y <= 14; y++) p.set(x, y, P.wood[5]);
  p.set(x - 2, 15, P.outline[1]);
  p.set(x + 2, 15, P.outline[1]);
  p.set(x - 1, 14, P.outline[1]);
  p.set(x + 1, 14, P.outline[1]);
  drawFlag(p, x + 1, 3, 6, 4, hucum ? 'kirmizi' : 'sultan', f, 1.2);
  if (hucum) {
    p.set(x + 3, 4, P.cloth[5]);
    p.set(x + 4, 5, P.cloth[5]);
  }
  p.set(x, 2, P.gold[6]);
  p.outline(P.outline[0]);
}

export function drawTorchFrame(p: PixelCanvas, f: number): void {
  const flick = [0, 1, -1][f % 3];
  p.set(2, 6, P.wood[3]);
  p.set(2, 7, P.wood[2]);
  p.set(2, 5, P.fire[3]);
  p.set(2, 4, P.fire[5]);
  p.set(2 + flick, 3, P.fire[6]);
  p.set(1, 4, P.fire[4]);
  p.set(3, 5, P.fire[4]);
  if (f !== 1) p.set(2 + flick, 2, P.fire[5]);
}

/** Great banner on the tower (Ulubatlı Hasan). */
export function drawTowerBannerFrame(p: PixelCanvas, f: number): void {
  const x = 4;
  for (let y = 4; y < p.h - 1; y++) p.set(x, y, y < 12 ? P.wood[6] : P.wood[4]);
  drawPoleTop(p, x, 1);
  drawFlag(p, x + 1, 5, 14, 9, 'hasan', f, 1.6);
  p.outline(P.outline[0]);
}

/** Unit-type icons for the UI (16×16 bust). */
export function drawIcon(p: PixelCanvas, type: UnitTypeId): void {
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const edge = x === 0 || y === 0 || x === 15 || y === 15;
      p.set(x, y, edge ? P.gold[2] : (x + y) % 2 ? P.red[1] : P.red[2]);
    }
  if (type === 'mehter') {
    drawMehterFrame(sub(p, 0, -2), 'davul', 6);
    return;
  }
  const keys = KITS[type] ?? KITS.yeniceri;
  const kit = keys[0];
  drawFigure(p, kit, { bob: 0, legB: 0, legF: 0, lean: 0, arm: kit.weapon === 'yay' ? 'draw' : 'ready', back: false }, 0, -2);
  p.outline(P.outline[0]);
}

/** Helper: view of a canvas with an offset (draws through). */
function sub(p: PixelCanvas, ox: number, oy: number): PixelCanvas {
  const proxy = Object.create(p) as PixelCanvas;
  proxy.set = (x: number, y: number, c: string | number, a?: number) => p.set(x + ox, y + oy, c, a);
  proxy.alphaAt = (x: number, y: number) => p.alphaAt(x + ox, y + oy);
  return proxy;
}

/** Commander portrait 32×32 (UI). */
export function drawPortrait(p: PixelCanvas, id: string): void {
  const bg = id === 'fatih' ? P.red : id === 'halil' || id === 'aksemseddin' ? P.green : P.blue;
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, x === 0 || y === 0 || x === 31 || y === 31 ? P.gold[3] : y < 16 ? bg[2] : bg[1]);
  const skin = [P.skin[2], P.skin[3], P.skin[4], P.skin[5]];
  const kaft = id === 'fatih' ? P.gold : id === 'zaganos' || id === 'halil' ? P.green : id === 'ulubatli' ? P.blue : id === 'karaca' ? P.red : P.blue;
  // shoulders & kaftan
  for (let y = 22; y < 31; y++)
    for (let x = 5; x < 27; x++) {
      const d = Math.abs(x - 16) - (y - 22) * 1.3;
      if (d > 8) continue;
      p.set(x, y, x < 12 ? kaft[4] : x > 21 ? kaft[2] : kaft[3]);
    }
  for (let y = 22; y < 31; y++) p.set(16, y, P.gold[5]);
  // face
  for (let y = 11; y < 22; y++)
    for (let x = 11; x < 21; x++) {
      const dx = (x - 15.5) / 5;
      const dy = (y - 16) / 6;
      if (dx * dx + dy * dy > 1) continue;
      p.set(x, y, skin[x < 14 ? 3 : x > 18 ? 1 : 2]);
    }
  p.set(13, 15, P.outline[1]);
  p.set(18, 15, P.outline[1]);
  p.set(13, 14, P.dirt[1]);
  p.set(18, 14, P.dirt[1]);
  p.set(16, 17, skin[1]);
  // beard
  const beard = id === 'halil' || id === 'aksemseddin' ? P.cloth[3] : id === 'fatih' ? P.dirt[2] : P.outline[2];
  for (let y = 18; y < 23; y++) for (let x = 12; x < 20; x++) if (y > 19 || x < 13 || x > 18) if ((x - 16) ** 2 / 16 + (y - 18) ** 2 / 25 <= 1) p.set(x, y, beard);
  p.set(14, 19, beard);
  p.set(15, 19, beard);
  p.set(17, 19, beard);
  p.set(18, 19, beard);
  // headgear
  if (id === 'ulubatli') {
    for (let y = 2; y < 12; y++) for (let x = 12; x < 20; x++) p.set(x - (y < 6 ? 1 : 0), y, x < 14 ? P.turban[3] : x > 18 ? P.turban[1] : P.turban[2]);
    p.set(18, 10, P.gold[5]);
    p.set(18, 9, P.gold[4]);
  } else {
    const cap = id === 'fatih' ? P.red[4] : id === 'aksemseddin' ? P.green[3] : P.red[3];
    for (let y = 3; y < 8; y++) for (let x = 13; x < 19; x++) p.set(x, y, cap);
    for (let y = 6; y < 12; y++)
      for (let x = 7; x < 25; x++) {
        const dx = (x - 16) / 9;
        const dy = (y - 9) / 3.2;
        if (dx * dx + dy * dy > 1) continue;
        p.set(x, y, (x + y) % 4 === 0 ? P.turban[1] : x < 12 ? P.turban[3] : P.turban[2]);
      }
  }
  p.outline(P.outline[0]);
}

// ───────────────────────────── registration ─────────────────────────────

export const PORTRAIT_IDS = ['fatih', 'halil', 'zaganos', 'saruca', 'karaca', 'ishak', 'mahmud', 'baltaoglu', 'hamza', 'turahan', 'aksemseddin', 'ulubatli'];

export function generateArmyTextures(gen: TextureGen): void {
  // infantry
  for (const [type, kits] of Object.entries(KITS)) {
    kits.forEach((k, v) => gen.sheet(`army/${type}-${v}`, FW, FH, INF.n, (p, f) => drawInfantryFrame(p, k, f)));
  }
  // mounted
  KITS.sipahi.forEach((k, v) => gen.sheet(`army/sipahi-atli-${v}`, MNT.w, MNT.h, MNT.n, (p, f) => drawMountedFrame(p, k, HORSES[v === 0 ? 1 : 0], f)));
  KITS.akinci.forEach((k, v) => gen.sheet(`army/akinci-atli-${v}`, MNT.w, MNT.h, MNT.n, (p, f) => drawMountedFrame(p, k, HORSES[v === 0 ? 0 : 2], f)));
  // mehter
  for (const role of ['davul', 'zurna', 'zil', 'nakkare', 'basi'] as const) gen.sheet(`army/mehter-${role}`, FW, FH, MEH.n, (p, f) => drawMehterFrame(p, role, f));
  gen.sheet('army/mehter-kos', MNT.w, MNT.h, MEH.n, (p, f) => drawKosFrame(p, f));
  // banners & tuğ
  for (const c of ['kirmizi', 'beyaz', 'yesil', 'sultan', 'tug', 'hasan'] as const) gen.sheet(`army/sancak-${c}`, BAN.w, BAN.h, BAN.n, (p, f) => drawBearerFrame(p, c, f));
  // commanders
  for (const id of Object.keys(COMMANDER_KITS)) gen.sheet(`army/pasa-${id}`, MNT.w, MNT.h, CMD.n, (p, f) => drawCommanderFrame(p, id, f));
  gen.sheet('army/deve', MNT.w, MNT.h, 4, (p, f) => drawCamelFrame(p, f));
  // props
  gen.sheet('army/merdiven-u', 14, 30, 4, (p, f) => drawLadderFrame(p, f, 'u', 24));
  gen.sheet('army/merdiven-r', 22, 28, 4, (p, f) => drawLadderFrame(p, f, 'r', 23));
  [12, 18, 26, 36].forEach((rx, i) => gen.sheet(`army/halka-${i}`, rx * 2 + 4, rx + 4, 3, (p, f) => drawRingFrame(p, rx, f)));
  gen.sheet('army/hedef', 12, 16, 4, (p, f) => drawMarkerFrame(p, f, false));
  gen.sheet('army/hedef-hucum', 12, 16, 4, (p, f) => drawMarkerFrame(p, f, true));
  gen.sheet('army/mesale', 5, 8, 3, (p, f) => drawTorchFrame(p, f));
  gen.sheet('army/burc-sancak', 22, 40, 4, (p, f) => drawTowerBannerFrame(p, f));
  gen.canvas('army/px', 1, 1, (p) => p.set(0, 0, '#ffffff'));
  gen.canvas('army/nokta', 2, 2, (p) => {
    p.set(0, 0, P.gold[5]);
    p.set(1, 0, P.gold[4]);
    p.set(0, 1, P.gold[3]);
    p.set(1, 1, P.gold[2]);
  });
  for (const t of ['yeniceri', 'azap', 'sipahi', 'basibozuk', 'akinci', 'topcu', 'lagimci', 'mehter'] as UnitTypeId[]) gen.canvas(`army/ikon-${t}`, 16, 16, (p) => drawIcon(p, t));
  for (const id of PORTRAIT_IDS) gen.canvas(`army/portre-${id}`, 32, 32, (p) => drawPortrait(p, id));
}
