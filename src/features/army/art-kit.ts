import { P } from '../../art/palette';
import type { PixelCanvas } from '../../art/pixel';

/**
 * Parametric pixel-figure painter for the army (pure — usable in tests/tools).
 * Infantry figures ≈7×13 px in a 16×20 frame, feet at (8, 17). Mounted figures
 * in a 24×26 frame. Light from the upper-left: left columns lit, right shaded.
 * Front = facing screen down-right (SE); back = facing up-right (NE); the
 * renderer mirrors with flipX for the left-facing directions.
 */

export type C3 = readonly [string, string, string];
export type C2 = readonly [string, string];

export type Head = 'bork' | 'sarik' | 'kulah' | 'bare' | 'basortu' | 'deri' | 'migfer' | 'kavuk' | 'akincibork' | 'tac';
export type Weapon = 'kilic' | 'yay' | 'teber' | 'mizrak' | 'balta' | 'sopa' | 'tirpan' | 'kazma' | 'kurek' | 'tokmak' | 'yaba' | 'none' | 'arbalet';

export interface Kit {
  skin: C2;
  coat: C3;
  /** Long coat down to the knees (dolama/kaftan). */
  long?: boolean;
  /** Under-garment visible at the chest opening. */
  under?: string;
  sash?: string;
  pants: C2;
  boots: string;
  head: Head;
  headC: C3;
  /** Turban top / cap / helmet crest. */
  capTop?: string;
  mail?: boolean;
  shield?: { rim: string; face: string; boss: string };
  weapon: Weapon;
  beard?: string;
  hair?: string;
  /** Patched/ragged clothes (dithered patches). */
  ragged?: string;
  apron?: string;
  /** Red cross on the chest (Genoese). */
  cross?: string;
  /** Feather in the cap (akıncı). */
  feather?: boolean;
}

export type ArmPose = 'rest' | 'swingA' | 'swingB' | 'ready' | 'strike' | 'recover' | 'draw' | 'loose' | 'up1' | 'up2' | 'carry' | 'fling' | 'push';

export interface Pose {
  bob: number;
  /** Foot offsets (back leg, front leg) for the lower two rows. */
  legB: number;
  legF: number;
  /** Lift of a foot (1 = raised, walking). */
  liftB?: number;
  liftF?: number;
  /** Upper-body lean in px (+ = forward/right). */
  lean: number;
  arm: ArmPose;
  back: boolean;
  /** Crouch amount in px (kneeling / bracing). */
  crouch?: number;
}

const O = P.outline[0];
const O2 = P.outline[1];
export const FW = 16;
export const FH = 20;
export const CX = 8;
export const FY = 17;

function px(p: PixelCanvas, x: number, y: number, c: string): void {
  p.set(x, y, c);
}

// ───────────────────────────── weapons ─────────────────────────────

/** Draw a weapon held at hand (hx,hy). dir: 1 right. 'up' raises it vertically. */
function weapon(p: PixelCanvas, k: Kit, hx: number, hy: number, mode: 'rest' | 'up' | 'fwd' | 'low' | 'carry', back: boolean): void {
  const st = P.steel;
  const wd = P.wood;
  switch (k.weapon) {
    case 'kilic': {
      // curved sabre (kılıç)
      if (mode === 'up') {
        px(p, hx, hy - 1, st[4]);
        px(p, hx - 1, hy - 2, st[5]);
        px(p, hx - 1, hy - 3, st[5]);
        px(p, hx - 2, hy - 4, st[6]);
        px(p, hx, hy, P.gold[3]);
      } else if (mode === 'fwd') {
        px(p, hx + 1, hy, st[4]);
        px(p, hx + 2, hy, st[5]);
        px(p, hx + 3, hy + 1, st[5]);
        px(p, hx + 4, hy + 1, st[6]);
        px(p, hx, hy, P.gold[3]);
      } else {
        px(p, hx, hy + 1, st[4]);
        px(p, hx + 1, hy + 2, st[5]);
        px(p, hx + 1, hy + 3, st[3]);
        px(p, hx, hy, P.gold[3]);
      }
      break;
    }
    case 'yay': {
      // composite recurve bow, held in the front hand
      const bx = mode === 'fwd' ? hx + 2 : hx + 1;
      const c0 = wd[3];
      const c1 = wd[5];
      px(p, bx, hy - 3, c0);
      px(p, bx + 1, hy - 2, c1);
      px(p, bx + 1, hy - 1, c1);
      px(p, bx + 1, hy, c1);
      px(p, bx + 1, hy + 1, c1);
      px(p, bx, hy + 2, c0);
      // string
      const sx = mode === 'fwd' ? hx - 1 : bx;
      for (let y = hy - 2; y <= hy + 1; y++) px(p, sx, y, P.cloth[3]);
      if (mode === 'fwd') px(p, hx + 3, hy - 1, P.steel[5]); // arrow tip
      break;
    }
    case 'teber':
    case 'mizrak':
    case 'yaba':
    case 'tirpan': {
      // pole arm: vertical when resting/carrying, slanted forward in attack
      const top = mode === 'fwd' ? 0 : -8;
      if (mode === 'fwd') {
        for (let i = -3; i <= 3; i++) px(p, hx + i, hy - Math.round(i * 0.35), wd[4]);
        const tx = hx + 4;
        const ty = hy - 1;
        if (k.weapon === 'mizrak') {
          px(p, tx, ty, st[5]);
          px(p, tx + 1, ty, st[6]);
        } else if (k.weapon === 'teber') {
          px(p, tx, ty - 1, st[5]);
          px(p, tx, ty, st[4]);
          px(p, tx, ty + 1, st[3]);
          px(p, tx + 1, ty, st[6]);
        } else if (k.weapon === 'yaba') {
          px(p, tx, ty - 1, st[4]);
          px(p, tx, ty + 1, st[4]);
          px(p, tx + 1, ty - 1, st[5]);
          px(p, tx + 1, ty + 1, st[5]);
        } else {
          px(p, tx, ty, st[4]);
          px(p, tx + 1, ty + 1, st[5]);
          px(p, tx + 1, ty + 2, st[5]);
        }
      } else {
        const x = hx;
        for (let y = hy + 3; y >= hy + top; y--) px(p, x, y, y < hy - 3 ? wd[5] : wd[4]);
        const ty = hy + top - 1;
        if (k.weapon === 'mizrak') {
          px(p, x, ty, st[5]);
          px(p, x, ty - 1, st[6]);
        } else if (k.weapon === 'teber') {
          px(p, x, ty, st[5]);
          px(p, x + 1, ty + 1, st[4]);
          px(p, x + 1, ty + 2, st[3]);
          px(p, x - 1, ty + 1, st[4]);
        } else if (k.weapon === 'yaba') {
          px(p, x - 1, ty, st[4]);
          px(p, x + 1, ty, st[4]);
          px(p, x, ty, st[5]);
        } else {
          px(p, x, ty, wd[5]);
          px(p, x + 1, ty, st[4]);
          px(p, x + 2, ty + 1, st[5]);
          px(p, x + 3, ty + 2, st[5]);
        }
      }
      break;
    }
    case 'balta':
    case 'sopa':
    case 'tokmak':
    case 'kazma':
    case 'kurek': {
      const head = (x: number, y: number, up: boolean) => {
        if (k.weapon === 'balta') {
          px(p, x, y, st[5]);
          px(p, x + 1, y, st[4]);
          px(p, x + 1, y + (up ? 1 : -1), st[3]);
        } else if (k.weapon === 'sopa') {
          px(p, x, y, wd[3]);
          px(p, x + 1, y, wd[4]);
          px(p, x, y - 1, wd[5]);
        } else if (k.weapon === 'tokmak') {
          px(p, x, y, wd[5]);
          px(p, x + 1, y, wd[4]);
          px(p, x, y - 1, wd[6]);
          px(p, x + 1, y - 1, wd[5]);
        } else if (k.weapon === 'kazma') {
          px(p, x - 1, y, st[4]);
          px(p, x, y, st[3]);
          px(p, x + 1, y, st[4]);
          px(p, x + 2, y + 1, st[5]);
          px(p, x - 2, y + 1, st[3]);
        } else {
          px(p, x, y, st[4]);
          px(p, x + 1, y, st[5]);
          px(p, x, y + 1, st[3]);
          px(p, x + 1, y + 1, st[4]);
        }
      };
      if (mode === 'up') {
        for (let i = 1; i <= 4; i++) px(p, hx - (i >> 1), hy - i, wd[4]);
        head(hx - 2, hy - 5, true);
      } else if (mode === 'fwd' || mode === 'low') {
        for (let i = 1; i <= 3; i++) px(p, hx + i, hy + (mode === 'low' ? i >> 1 : 0), wd[4]);
        head(hx + 4, hy + (mode === 'low' ? 1 : 0), false);
      } else {
        // resting on the shoulder
        for (let i = 1; i <= 4; i++) px(p, hx - (i >> 1), hy - i, wd[4]);
        head(hx - 3, hy - 4, true);
      }
      break;
    }
    case 'arbalet': {
      px(p, hx, hy, wd[3]);
      px(p, hx + 1, hy, wd[4]);
      px(p, hx + 2, hy, wd[4]);
      px(p, hx + 2, hy - 1, st[4]);
      px(p, hx + 2, hy + 1, st[4]);
      break;
    }
    case 'none':
      break;
  }
  void back;
}

// ───────────────────────────── headgear ─────────────────────────────

function headgear(p: PixelCanvas, k: Kit, hx: number, ht: number, back: boolean): void {
  // hx = head left column, ht = head top row (head is 3×3 at hx..hx+2, ht..ht+2)
  const [hl, hm, hd] = k.headC;
  switch (k.head) {
    case 'bork': {
      // tall white börk (4 px), leaning back; brass kaşıklık at the front; yatırma down the back
      for (let y = ht - 4; y < ht; y++) {
        const off = y < ht - 2 ? -1 : 0;
        px(p, hx + off, y, hl);
        px(p, hx + 1 + off, y, y === ht - 4 ? hl : hm);
        px(p, hx + 2 + off, y, hd);
      }
      // band
      px(p, hx, ht - 1, hm);
      px(p, hx + 1, ht - 1, hd);
      px(p, hx + 2, ht - 1, hd);
      if (!back) {
        px(p, hx + 2, ht - 2, P.gold[5]);
        px(p, hx + 3, ht - 2, P.gold[3]);
        px(p, hx + 2, ht - 1, P.gold[3]);
      }
      // flap (yatırma)
      const fx = back ? hx + 1 : hx - 1;
      for (let y = ht - 3; y <= ht + 2; y++) px(p, fx, y, y > ht - 1 ? hd : hm);
      if (back) px(p, hx, ht + 1, hd);
      break;
    }
    case 'sarik':
    case 'kavuk': {
      const big = k.head === 'kavuk';
      const top = k.capTop ?? P.red[4];
      // cap (kavuk/taj) peeking above
      px(p, hx + 1, ht - (big ? 3 : 2), top);
      if (big) {
        px(p, hx, ht - 3, top);
        px(p, hx + 2, ht - 3, top);
        px(p, hx + 1, ht - 4, top);
      }
      // turban roll
      const w0 = big ? hx - 2 : hx - 1;
      const w1 = big ? hx + 4 : hx + 3;
      for (let y = ht - (big ? 2 : 1); y <= ht; y++)
        for (let x = w0; x <= w1; x++) {
          const edge = x === w1 || y === ht;
          px(p, x, y, x === w0 ? hl : edge ? hd : (x + y) % 3 === 0 ? hm : hl);
        }
      break;
    }
    case 'kulah': {
      px(p, hx + 1, ht - 3, hm);
      px(p, hx, ht - 2, hl);
      px(p, hx + 1, ht - 2, hm);
      px(p, hx + 2, ht - 2, hd);
      for (let x = hx - 1; x <= hx + 3; x++) px(p, x, ht - 1, x <= hx ? hl : x === hx + 3 ? hd : hm);
      break;
    }
    case 'akincibork': {
      for (let x = hx - 1; x <= hx + 3; x++) px(p, x, ht - 1, x <= hx ? hl : hm);
      px(p, hx, ht - 2, hl);
      px(p, hx + 1, ht - 2, hm);
      px(p, hx + 2, ht - 2, hd);
      px(p, hx + 1, ht - 3, hm);
      if (k.feather) {
        px(p, hx - 1, ht - 3, P.cloth[5]);
        px(p, hx - 2, ht - 4, P.cloth[4]);
        px(p, hx - 2, ht - 5, P.cloth[5]);
      }
      break;
    }
    case 'basortu': {
      for (let x = hx - 1; x <= hx + 2; x++) px(p, x, ht - 1, x === hx - 1 ? hl : hm);
      for (let x = hx - 1; x <= hx + 1; x++) px(p, x, ht, x === hx - 1 ? hl : hm);
      px(p, back ? hx + 1 : hx - 2, ht + 1, hd);
      px(p, back ? hx + 1 : hx - 2, ht + 2, hd);
      break;
    }
    case 'deri': {
      for (let x = hx - 1; x <= hx + 3; x++) px(p, x, ht, x <= hx ? hl : x === hx + 3 ? hd : hm);
      px(p, hx, ht - 1, hl);
      px(p, hx + 1, ht - 1, hm);
      px(p, hx + 2, ht - 1, hd);
      break;
    }
    case 'migfer': {
      // kettle hat: wide brim, dome
      for (let x = hx - 1; x <= hx + 3; x++) px(p, x, ht, x <= hx ? P.steel[5] : x === hx + 3 ? P.steel[2] : P.steel[4]);
      px(p, hx, ht - 1, P.steel[6]);
      px(p, hx + 1, ht - 1, P.steel[4]);
      px(p, hx + 2, ht - 1, P.steel[3]);
      px(p, hx + 1, ht - 2, P.steel[5]);
      if (k.capTop) px(p, hx + 1, ht - 3, k.capTop);
      break;
    }
    case 'tac': {
      px(p, hx, ht - 1, P.gold[5]);
      px(p, hx + 1, ht - 2, P.gold[6]);
      px(p, hx + 2, ht - 1, P.gold[4]);
      break;
    }
    case 'bare': {
      const hc = k.hair ?? P.dirt[1];
      px(p, hx, ht, hc);
      px(p, hx + 1, ht, hc);
      px(p, hx + 2, ht, hc);
      px(p, hx - 0, ht + 1, hc);
      break;
    }
  }
}

// ───────────────────────────── standing figure ─────────────────────────────

/** Draw a standing/walking/fighting infantry figure facing right. */
export function drawFigure(p: PixelCanvas, k: Kit, pose: Pose, ox = 0, oy = 0): void {
  const cx = CX + ox;
  const crouch = pose.crouch ?? 0;
  const fy = FY + oy;
  const by = fy + pose.bob + crouch; // body anchor (bob/crouch shift the upper body)
  const lean = pose.lean;
  const back = pose.back;
  const [sl, sd] = k.skin;
  const [cl, cm, cd] = k.coat;

  // legs (2 px each), lower two rows follow the stride
  const leg = (x: number, off: number, lift: number, c: C2) => {
    for (let j = 0; j < 4; j++) {
      const y = fy - 3 + j - (j >= 2 ? lift : 0);
      const xo = j >= 2 ? off : j === 1 ? Math.trunc(off / 2) : 0;
      if (crouch && j < 1) continue;
      px(p, x + xo, y, c[0]);
      px(p, x + 1 + xo, y, c[1]);
    }
    const sy = fy - (lift ? 1 : 0);
    px(p, x + off, sy, k.boots);
    px(p, x + off + 1, sy, k.boots);
    if (!back) px(p, x + off + 2, sy, k.boots);
    else px(p, x + off - 1, sy, k.boots);
  };
  const pantsB: C2 = [k.pants[1], k.pants[1]];
  leg(cx - 2, pose.legB, pose.liftB ?? 0, pantsB);
  leg(cx, pose.legF, pose.liftF ?? 0, k.pants);

  // torso
  const tTop = by - 8;
  const tx0 = cx - 2 + (lean > 0 ? 1 : lean < 0 ? -1 : 0) * 0;
  for (let y = tTop; y <= by - 4; y++) {
    const sh = y < tTop + 2 ? lean : 0;
    for (let x = 0; x < 5; x++) {
      const c = x === 0 ? cl : x === 4 ? cd : cm;
      px(p, tx0 + x + sh, y, c);
    }
  }
  if (k.mail) {
    for (let y = tTop + 1; y <= by - 5; y++)
      for (let x = 1; x < 4; x++) if ((x + y) % 2 === 0) px(p, tx0 + x + (y < tTop + 2 ? lean : 0), y, x === 3 ? P.steel[3] : P.steel[5]);
  }
  if (k.under && !back) {
    px(p, tx0 + 3 + lean, tTop, k.under);
    px(p, tx0 + 3 + lean, tTop + 1, k.under);
  }
  if (k.cross && !back) {
    px(p, tx0 + 2, tTop + 2, k.cross);
    px(p, tx0 + 1, tTop + 2, k.cross);
    px(p, tx0 + 3, tTop + 2, k.cross);
    px(p, tx0 + 2, tTop + 1, k.cross);
    px(p, tx0 + 2, tTop + 3, k.cross);
  }
  if (k.ragged) {
    px(p, tx0 + 1, tTop + 3, k.ragged);
    px(p, tx0 + 3, tTop + 1, k.ragged);
  }
  if (k.sash) for (let x = 0; x < 5; x++) px(p, tx0 + x, by - 4, x === 4 ? P.outline[2] : k.sash);
  // long coat skirt
  if (k.long) {
    for (let y = by - 3; y <= by - 2 + (crouch ? 0 : 0); y++)
      for (let x = -1; x < 5; x++) {
        if (x === -1 && y === by - 3) continue;
        const c = x <= 0 ? cl : x >= 4 ? cd : cm;
        px(p, tx0 + x + (y === by - 2 ? (pose.legB < 0 ? -1 : 0) : 0), y, c);
      }
  }
  if (k.apron && !back) for (let y = by - 4; y <= by - 2; y++) for (let x = 1; x < 4; x++) px(p, tx0 + x, y, k.apron);

  // head
  const hx = cx - 1 + lean;
  const ht = by - 11;
  for (let y = ht; y < ht + 3; y++)
    for (let x = 0; x < 3; x++) {
      if (back) px(p, hx + x, y, x === 2 ? sd : sl);
      else px(p, hx + x, y, x === 0 ? sd : sl);
    }
  if (!back) {
    px(p, hx + 2, ht + 1, O2); // eye
    if (k.beard) {
      px(p, hx + 1, ht + 2, k.beard);
      px(p, hx + 2, ht + 2, k.beard);
    } else px(p, hx + 2, ht + 2, sd);
  } else {
    const hc = k.hair ?? P.dirt[1];
    if (k.head !== 'bork' && k.head !== 'basortu') {
      px(p, hx, ht + 1, hc);
      px(p, hx + 1, ht + 1, hc);
      px(p, hx + 2, ht + 1, hc);
    }
  }
  headgear(p, k, hx, ht, back);

  // shield on the back arm
  const shX = tx0 - 1 + (lean > 0 ? 1 : 0);
  const shY = tTop + 2;
  const drawShield = () => {
    if (!k.shield) return;
    const s = k.shield;
    const sx = back ? tx0 + 3 : shX - 1;
    const rows = ['.oo.', 'offo', 'ofbo', '.oo.'];
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        const ch = rows[y][x];
        if (ch === '.') continue;
        px(p, sx - 1 + x, shY - 1 + y, ch === 'o' ? s.rim : ch === 'b' ? s.boss : x === 1 && y === 1 ? P.gold[6] : s.face);
      }
  };

  // arms
  const shoulderF = { x: tx0 + 4 + lean, y: tTop + 1 };
  const shoulderB = { x: tx0 + lean, y: tTop + 1 };
  const armPix = (pts: [number, number][], c: string) => {
    for (const [x, y] of pts) px(p, x, y, c);
  };
  const sleeve = cm;
  const sleeveD = cd;
  // back arm
  if (pose.arm === 'up1' || pose.arm === 'up2' || pose.arm === 'fling') {
    const dy = pose.arm === 'up2' ? 1 : 0;
    armPix([[shoulderB.x, shoulderB.y - 1 + dy], [shoulderB.x, shoulderB.y - 2 + dy]], sleeve);
    px(p, shoulderB.x, shoulderB.y - 3 + dy, sl);
  } else if (pose.arm === 'swingA') {
    armPix([[shoulderB.x - 1, shoulderB.y + 1], [shoulderB.x - 1, shoulderB.y + 2]], sleeveD);
    px(p, shoulderB.x - 2, shoulderB.y + 3, sd);
  } else {
    armPix([[shoulderB.x - 1, shoulderB.y + 1], [shoulderB.x - 1, shoulderB.y + 2]], sleeveD);
    px(p, shoulderB.x - 1, shoulderB.y + 3, sd);
  }
  if (!back) drawShield();

  // front (weapon) arm
  let hand = { x: shoulderF.x, y: shoulderF.y + 3 };
  let wmode: 'rest' | 'up' | 'fwd' | 'low' | 'carry' = 'rest';
  switch (pose.arm) {
    case 'rest':
      armPix([[shoulderF.x, shoulderF.y + 1], [shoulderF.x, shoulderF.y + 2]], sleeve);
      hand = { x: shoulderF.x, y: shoulderF.y + 3 };
      break;
    case 'swingA':
      armPix([[shoulderF.x, shoulderF.y + 1], [shoulderF.x + 1, shoulderF.y + 2]], sleeve);
      hand = { x: shoulderF.x + 1, y: shoulderF.y + 3 };
      break;
    case 'swingB':
      armPix([[shoulderF.x, shoulderF.y + 1], [shoulderF.x - 1, shoulderF.y + 2]], sleeve);
      hand = { x: shoulderF.x - 1, y: shoulderF.y + 3 };
      break;
    case 'ready':
      armPix([[shoulderF.x, shoulderF.y - 1], [shoulderF.x - 1, shoulderF.y - 2]], sleeve);
      hand = { x: shoulderF.x - 1, y: shoulderF.y - 3 };
      wmode = 'up';
      break;
    case 'strike':
      armPix([[shoulderF.x + 1, shoulderF.y], [shoulderF.x + 2, shoulderF.y]], sleeve);
      hand = { x: shoulderF.x + 3, y: shoulderF.y };
      wmode = 'fwd';
      break;
    case 'recover':
      armPix([[shoulderF.x + 1, shoulderF.y + 1], [shoulderF.x + 1, shoulderF.y + 2]], sleeve);
      hand = { x: shoulderF.x + 2, y: shoulderF.y + 2 };
      wmode = 'low';
      break;
    case 'draw':
      armPix([[shoulderF.x + 1, shoulderF.y], [shoulderF.x + 2, shoulderF.y]], sleeve);
      hand = { x: shoulderF.x + 2, y: shoulderF.y };
      wmode = 'fwd';
      // drawing hand at the cheek
      px(p, shoulderF.x - 1, shoulderF.y, sl);
      break;
    case 'loose':
      armPix([[shoulderF.x + 1, shoulderF.y], [shoulderF.x + 2, shoulderF.y]], sleeve);
      hand = { x: shoulderF.x + 2, y: shoulderF.y };
      wmode = 'fwd';
      px(p, shoulderF.x - 2, shoulderF.y - 1, sl);
      break;
    case 'up1':
    case 'up2': {
      const dy = pose.arm === 'up1' ? 1 : 0;
      armPix([[shoulderF.x, shoulderF.y - 1 + dy], [shoulderF.x, shoulderF.y - 2 + dy]], sleeve);
      hand = { x: shoulderF.x, y: shoulderF.y - 3 + dy };
      wmode = 'carry';
      break;
    }
    case 'carry':
      armPix([[shoulderF.x, shoulderF.y + 1]], sleeve);
      hand = { x: shoulderF.x + 1, y: shoulderF.y + 1 };
      wmode = 'carry';
      break;
    case 'fling':
      armPix([[shoulderF.x + 1, shoulderF.y - 1], [shoulderF.x + 2, shoulderF.y - 2]], sleeve);
      hand = { x: shoulderF.x + 2, y: shoulderF.y - 3 };
      wmode = 'carry';
      break;
    case 'push':
      armPix([[shoulderF.x + 1, shoulderF.y], [shoulderF.x + 2, shoulderF.y - 1]], sleeve);
      hand = { x: shoulderF.x + 3, y: shoulderF.y - 1 };
      wmode = 'fwd';
      break;
  }
  if (wmode !== 'carry' && pose.arm !== 'up1' && pose.arm !== 'up2' && pose.arm !== 'fling') weapon(p, k, hand.x, hand.y, wmode, back);
  px(p, hand.x, hand.y, sl);
  if (back) drawShield();
}

/** Lying body (last die frame), head to the left. */
export function drawLying(p: PixelCanvas, k: Kit, ox = 0, oy = 0, variant = 0): void {
  const y = FY + oy - 1;
  const x0 = 3 + ox;
  const [cl, cm, cd] = k.coat;
  // legs
  for (let x = 0; x < 3; x++) {
    px(p, x0 + 8 + x, y, k.pants[0]);
    px(p, x0 + 8 + x, y + 1, k.pants[1]);
  }
  px(p, x0 + 11, y, k.boots);
  px(p, x0 + 11, y + 1, k.boots);
  // torso
  for (let x = 0; x < 5; x++) {
    px(p, x0 + 3 + x, y - 1, x === 0 ? cl : cm);
    px(p, x0 + 3 + x, y, cm);
    px(p, x0 + 3 + x, y + 1, cd);
  }
  if (k.sash) px(p, x0 + 7, y, k.sash);
  // head
  px(p, x0 + 1, y, k.skin[0]);
  px(p, x0 + 2, y, k.skin[0]);
  px(p, x0 + 1, y + 1, k.skin[1]);
  px(p, x0 + 2, y + 1, k.skin[1]);
  // headgear knocked off
  if (k.head === 'bork') {
    px(p, x0 - 1, y + 1, k.headC[0]);
    px(p, x0 - 2, y + 1, k.headC[0]);
    px(p, x0 - 3, y + 1, k.headC[1]);
  } else if (k.head === 'sarik' || k.head === 'kavuk') {
    px(p, x0, y, k.headC[0]);
    px(p, x0, y - 1, k.headC[1]);
  } else if (k.head !== 'bare') {
    px(p, x0, y, k.headC[1]);
  }
  // dropped weapon
  if (k.weapon !== 'none') {
    const st = variant % 2 ? P.wood[4] : P.steel[4];
    px(p, x0 + 4, y + 2, st);
    px(p, x0 + 5, y + 2, st);
    px(p, x0 + 6, y + 2, P.steel[5]);
  }
  if (k.shield) {
    px(p, x0 + 9, y - 1, k.shield.rim);
    px(p, x0 + 10, y - 1, k.shield.face);
    px(p, x0 + 10, y - 2, k.shield.rim);
  }
}

/** Ground shadow (drawn after outlining). */
export function footShadow(p: PixelCanvas, cx: number, fy: number, rx: number): void {
  for (let x = -rx; x <= rx; x++) {
    const a = Math.abs(x) === rx ? 0.18 : 0.32;
    if (p.alphaAt(cx + x, fy + 1) === 0) p.set(cx + x, fy + 1, P.outline[0], a);
  }
  for (let x = -rx + 1; x <= rx - 1; x++) if (p.alphaAt(cx + x + 1, fy) === 0) p.set(cx + x + 1, fy, P.outline[0], 0.22);
}

/** Outline all opaque pixels (selective dark outline). */
export function outlineAll(p: PixelCanvas): void {
  p.outline(O);
}

// ───────────────────────────── horses ─────────────────────────────

export interface HorseKit {
  coat: C3;
  mane: string;
  /** Saddle cloth (çul). */
  cloth: C2;
  /** Ornament (gold bridle studs). */
  orn?: string;
}

/**
 * Horse in side view facing right in a 24×26 frame; hooves at y=23.
 * gait 0..3 (walk), -1 standing. Returns the saddle point.
 */
export function drawHorse(p: PixelCanvas, h: HorseKit, gait: number, ox = 0, oy = 0, rear = 0): { sx: number; sy: number } {
  const hy = 23 + oy;
  const [cl, cm, cd] = h.coat;
  const bob = gait === 1 || gait === 3 ? -1 : 0;
  const by = hy - 10 + bob; // body top
  const x0 = 3 + ox;
  // legs: hind pair (x0+1, x0+3), fore pair (x0+10, x0+12)
  const legOff = gait < 0 ? [0, 0, 0, 0] : [[1, -1, -1, 1], [0, 0, 0, 0], [-1, 1, 1, -1], [0, 0, 0, 0]][gait];
  const legLift = gait < 0 ? [0, 0, 0, 0] : [[0, 0, 0, 0], [1, 0, 0, 1], [0, 0, 0, 0], [0, 1, 1, 0]][gait];
  const legs: [number, string][] = [
    [x0 + 1, cd],
    [x0 + 3, cm],
    [x0 + 10, cd],
    [x0 + 12, cm],
  ];
  legs.forEach(([lx, c], i) => {
    const top = by + 4;
    const lift = legLift[i] + (rear && i >= 2 ? 2 : 0);
    const bottom = hy - lift;
    for (let y = top; y <= bottom; y++) {
      const xo = y > top + 2 ? legOff[i] + (rear && i >= 2 ? 1 : 0) : 0;
      px(p, lx + xo, y, y >= bottom ? P.outline[2] : y > top + 3 ? cd : c);
    }
  });
  // barrel, rounded rump and chest
  for (let y = by; y <= by + 4; y++)
    for (let x = x0; x <= x0 + 13; x++) {
      if ((y === by || y === by + 4) && (x === x0 || x === x0 + 13)) continue;
      if (x === x0 + 13 && y === by + 4) continue;
      const c = y === by ? cl : y >= by + 3 ? cd : x < x0 + 3 ? cl : cm;
      px(p, x, y, c);
    }
  // neck rising forward, head angled down to the muzzle
  const r = rear;
  const neck: [number, number, string][] = [
    [x0 + 11, by - 1, cm], [x0 + 12, by - 1, cm], [x0 + 13, by - 1, cd], [x0 + 14, by, cm],
    [x0 + 12, by - 2, cl], [x0 + 13, by - 2, cm], [x0 + 14, by - 2, cm], [x0 + 14, by - 1, cm],
    [x0 + 13, by - 3, cl], [x0 + 14, by - 3, cm], [x0 + 15, by - 3, cm],
    [x0 + 14, by - 4, cl], [x0 + 15, by - 4, cm], [x0 + 16, by - 4, cm],
    [x0 + 16, by - 3, cm], [x0 + 17, by - 3, cm], [x0 + 17, by - 2, cd], [x0 + 18, by - 2, cd],
    [x0 + 15, by - 5, cm], [x0 + 16, by - 5, cl],
  ];
  for (const [x, y, c] of neck) px(p, x, y - r, c);
  px(p, x0 + 16, by - 6 - r, cm); // ear
  px(p, x0 + 16, by - 4 - r, P.outline[1]); // eye
  px(p, x0 + 18, by - 1 - r, P.outline[2]); // nostril/muzzle
  // mane
  for (const [x, y] of [[x0 + 10, by - 1], [x0 + 11, by - 2], [x0 + 12, by - 3], [x0 + 13, by - 4], [x0 + 14, by - 5], [x0 + 15, by - 6]]) px(p, x, y - r, h.mane);
  // tail
  const tw = gait === 1 ? -1 : gait === 3 ? 1 : 0;
  px(p, x0 - 1, by, h.mane);
  px(p, x0 - 1, by + 1, h.mane);
  px(p, x0 - 2, by + 2, h.mane);
  px(p, x0 - 2 + tw, by + 3, h.mane);
  px(p, x0 - 2 + tw, by + 4, h.mane);
  px(p, x0 - 1 + tw, by + 5, h.mane);
  // saddle cloth (çul)
  for (let x = x0 + 4; x <= x0 + 8; x++) {
    px(p, x, by, h.cloth[0]);
    px(p, x, by + 1, h.cloth[0]);
    px(p, x, by + 2, h.cloth[1]);
  }
  px(p, x0 + 4, by + 3, h.cloth[1]);
  px(p, x0 + 8, by + 3, h.cloth[1]);
  if (h.orn) {
    px(p, x0 + 5, by + 2, h.orn);
    px(p, x0 + 7, by + 2, h.orn);
    px(p, x0 + 15, by - 3 - r, h.orn); // bridle
  }
  return { sx: x0 + 6, sy: by };
}

/** Rider (upper body) seated at saddle point, facing right (or back). */
export function drawRider(p: PixelCanvas, k: Kit, sx: number, sy: number, arm: ArmPose, back: boolean): void {
  const [sl, sd] = k.skin;
  const [cl, cm, cd] = k.coat;
  // leg over the flank
  px(p, sx + 1, sy, k.pants[0]);
  px(p, sx + 1, sy + 1, k.pants[0]);
  px(p, sx + 1, sy + 2, k.pants[1]);
  px(p, sx + 2, sy + 3, k.boots);
  // torso
  const tTop = sy - 5;
  for (let y = tTop; y < sy; y++) for (let x = -2; x <= 2; x++) px(p, sx + x, y, x === -2 ? cl : x === 2 ? cd : cm);
  if (k.long) for (let x = -3; x <= 2; x++) px(p, sx + x, sy, x <= -2 ? cl : cm);
  if (k.mail) for (let y = tTop + 1; y < sy - 1; y++) for (let x = -1; x <= 1; x++) if ((x + y) % 2 === 0) px(p, sx + x, y, P.steel[5]);
  if (k.sash) for (let x = -2; x <= 2; x++) px(p, sx + x, sy - 1, k.sash);
  // head
  const hx = sx - 1;
  const ht = tTop - 3;
  for (let y = ht; y < ht + 3; y++) for (let x = 0; x < 3; x++) px(p, hx + x, y, back ? (x === 2 ? sd : sl) : x === 0 ? sd : sl);
  if (!back) {
    px(p, hx + 2, ht + 1, O2);
    if (k.beard) {
      px(p, hx + 1, ht + 2, k.beard);
      px(p, hx + 2, ht + 2, k.beard);
    }
  }
  headgear(p, k, hx, ht, back);
  // shield on the back
  if (k.shield) {
    const s = k.shield;
    const cx = back ? sx + 1 : sx - 3;
    for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) if (Math.abs(x) + Math.abs(y) <= 3) px(p, cx + x, tTop + 2 + y, Math.abs(x) === 2 || Math.abs(y) === 2 || Math.abs(x) + Math.abs(y) === 3 ? s.rim : s.face);
    px(p, cx, tTop + 2, s.boss);
  }
  // arm
  const shx = sx + 2;
  const shy = tTop + 1;
  if (arm === 'ready' || arm === 'up1') {
    px(p, shx, shy - 1, cm);
    px(p, shx, shy - 2, cm);
    px(p, shx, shy - 3, sl);
    weapon(p, k, shx, shy - 3, 'up', back);
  } else if (arm === 'strike' || arm === 'draw' || arm === 'loose') {
    px(p, shx + 1, shy, cm);
    px(p, shx + 2, shy, sl);
    weapon(p, k, shx + 2, shy, 'fwd', back);
    if (arm === 'draw') px(p, shx - 2, shy, sl);
  } else if (arm === 'carry') {
    px(p, shx, shy + 1, cm);
    px(p, shx + 1, shy + 1, sl);
  } else {
    px(p, shx, shy + 1, cm);
    px(p, shx + 1, shy + 2, sl);
    weapon(p, k, shx + 1, shy + 2, k.weapon === 'mizrak' ? 'rest' : 'rest', back);
  }
}
