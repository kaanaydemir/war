import type Phaser from 'phaser';
import type { TilePt } from '../../core/iso';
import type { UnitGroup, UnitTypeId } from '../../core/state';
import { BAN, INF, MEH, MNT, sheetKeys } from './art';

/** Shared render helpers (Phaser-side). */

export type Spr = Phaser.GameObjects.Sprite;
export type Img = Phaser.GameObjects.Image;

export type Layout = 'inf' | 'mnt' | 'meh' | 'kos' | 'ban' | 'cmd';

export const ORIGIN: Record<Layout, [number, number]> = {
  inf: [0.5, 18 / 20],
  mnt: [0.5, 24 / 26],
  meh: [0.5, 18 / 20],
  kos: [0.5, 24 / 26],
  ban: [10 / 20, (BAN.fy + 1) / BAN.h],
  cmd: [0.5, 24 / 26],
};

export type Anim = 'idle' | 'walk' | 'atk' | 'die' | 'climb' | 'play';

/** Frame index for a layout / anim / step (step = integer animation counter). */
export function frameOf(layout: Layout, anim: Anim, step: number, back: boolean): number {
  const m = (arr: readonly number[]) => arr[((step % arr.length) + arr.length) % arr.length];
  switch (layout) {
    case 'inf': {
      if (anim === 'climb') return m(INF.climb);
      const b = back ? INF.back : 0;
      if (anim === 'walk') return m(INF.walk) + b;
      if (anim === 'atk' || anim === 'play') return m(INF.atk) + b;
      if (anim === 'die') return INF.die[Math.min(2, Math.max(0, step))] + b;
      return m(INF.idle) + b;
    }
    case 'mnt': {
      const b = back ? MNT.back : 0;
      if (anim === 'walk') return m(MNT.walk) + b;
      if (anim === 'atk' || anim === 'play') return m(MNT.atk) + b;
      if (anim === 'die') return MNT.die[Math.min(1, Math.max(0, step))] + b;
      return m(MNT.idle) + b;
    }
    case 'meh':
    case 'kos': {
      const b = back ? MEH.back : 0;
      if (anim === 'walk') return m(MEH.walk) + b;
      if (anim === 'play' || anim === 'atk') return m(MEH.play) + b;
      return m(MEH.idle) + b;
    }
    case 'ban': {
      const b = back ? BAN.back : 0;
      return (anim === 'walk' ? m(BAN.walk) : m(BAN.idle)) + b;
    }
    case 'cmd': {
      const b = back ? 6 : 0;
      if (anim === 'walk') return 2 + (((step % 4) + 4) % 4) + b;
      return (((step % 2) + 2) % 2) + b;
    }
  }
}

export function hash(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Is the group's sipahi riding (not storming / filling the moat)? */
export function isMounted(g: UnitGroup): boolean {
  if (g.type === 'akinci') return true;
  if (g.type !== 'sipahi') return false;
  if (g.status === 'savasiyor') return false;
  if (g.status === 'calisiyor' && (g.order.type === 'hendek-doldur' || g.order.type === 'lagim-kaz' || g.order.type === 'kuleyi-ilerlet')) return false;
  return true;
}

const MEHTER_ROLES = ['army/mehter-davul', 'army/mehter-zurna', 'army/mehter-zil', 'army/mehter-nakkare'];

/** Sheet key + layout for soldier i of a group. */
export function soldierSheet(type: UnitTypeId, mounted: boolean, gid: number, i: number, n: number): { key: string; layout: Layout } {
  if (type === 'mehter') {
    if (i === 0 && n >= 4) return { key: 'army/mehter-kos', layout: 'kos' };
    if (i === 1 && n >= 4) return { key: 'army/mehter-basi', layout: 'meh' };
    return { key: MEHTER_ROLES[(i + gid) % MEHTER_ROLES.length], layout: 'meh' };
  }
  const keys = sheetKeys(type, mounted);
  const k = keys[Math.floor(hash(gid, i * 7 + 3) * keys.length) % keys.length];
  return { key: k, layout: mounted ? 'mnt' : 'inf' };
}

/** Is the sheet's weapon a bow (archers shoot arrows from formation)? */
export function isArcherKey(key: string): boolean {
  return key === 'army/yeniceri-1' || key === 'army/azap-0' || key === 'army/akinci-atli-1';
}

/** Point at arc length s back along a trail (index 0 = newest), plus direction. */
export function trailAt(trail: TilePt[], s: number): { tx: number; ty: number; dx: number; dy: number } {
  if (!trail.length) return { tx: 0, ty: 0, dx: 1, dy: 0 };
  let acc = 0;
  for (let i = 0; i + 1 < trail.length; i++) {
    const a = trail[i];
    const b = trail[i + 1];
    const l = Math.hypot(b.tx - a.tx, b.ty - a.ty) || 1e-6;
    if (acc + l >= s) {
      const f = (s - acc) / l;
      return { tx: a.tx + (b.tx - a.tx) * f, ty: a.ty + (b.ty - a.ty) * f, dx: (a.tx - b.tx) / l, dy: (a.ty - b.ty) / l };
    }
    acc += l;
  }
  const last = trail[trail.length - 1];
  const prev = trail[trail.length - 2] ?? last;
  const l = Math.hypot(prev.tx - last.tx, prev.ty - last.ty) || 1;
  return { tx: last.tx, ty: last.ty, dx: (prev.tx - last.tx) / l || 1, dy: (prev.ty - last.ty) / l };
}

export function trailLength(trail: TilePt[]): number {
  let acc = 0;
  for (let i = 0; i + 1 < trail.length; i++) acc += Math.hypot(trail[i + 1].tx - trail[i].tx, trail[i + 1].ty - trail[i].ty);
  return acc;
}

/** Screen-space facing from a tile-space direction: back = moving up-screen, flip = moving left. */
export function facingOf(dtx: number, dty: number): { back: boolean; flip: boolean } {
  const sx = dtx - dty;
  const sy = dtx + dty;
  return { back: sy < -0.05, flip: sx < 0 };
}

/** Simple pooled sprite factory. */
export class SpritePool {
  private free: Spr[] = [];
  constructor(private scene: Phaser.Scene) {}
  get(key: string, frame: number, layout: Layout): Spr {
    const s = this.free.pop() ?? this.scene.add.sprite(0, 0, key, frame);
    s.setTexture(key, frame);
    s.setOrigin(ORIGIN[layout][0], ORIGIN[layout][1]);
    s.setVisible(true).setAlpha(1).setFlipX(false).clearTint();
    return s;
  }
  release(s: Spr): void {
    s.setVisible(false);
    this.free.push(s);
  }
  destroy(): void {
    for (const s of this.free) s.destroy();
    this.free = [];
  }
}
