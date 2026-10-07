import { P } from '../../art/palette';
import { bayer, PixelCanvas } from '../../art/pixel';
import type { TextureGen } from '../../art/texture';
import {
  ball,
  barrel,
  cone,
  cylinder,
  ellipseFn,
  faceShader,
  groundPatch,
  h01,
  hline,
  logEnd,
  outlineOnly,
  polyFn,
  prism,
  rampAt,
  ri,
  sack,
  shadowEllipse,
  snowify,
  stoneBlock,
  vline,
  type Ramp,
} from './artKit';
import { conicalTent, drawTent, imperialPavilion, ridgeTent, type TentKind } from './artTents';

/**
 * Economy building art. Every building texture is anchored at its footprint
 * CENTRE on the ground (render sets origin from BUILDING_ART[type]).
 */
export interface BuildingArt {
  key: string;
  w: number;
  h: number;
  /** Anchor (footprint centre at ground) inside the texture. */
  ax: number;
  ay: number;
  /** Visual top (px above anchor) for float texts / markers. */
  top: number;
}

export const BUILDING_ART: Record<string, BuildingArt> = {};

/** Footprint frame: canvas sized for an a×b footprint with `top` px of headroom. */
export function frameFor(a: number, b: number, top: number) {
  const w = (a + b) * 16 + 24;
  const h = (a + b) * 8 + top + 10;
  const ox = 12 + b * 16; // north vertex
  const oy = top;
  const cx = ox + (a - b) * 8;
  const cy = oy + (a + b) * 4;
  const at = (u: number, v: number): [number, number] => [ox + (u - v) * 16, oy + (u + v) * 8];
  return { w, h, ox, oy, cx, cy, at };
}

type Frame = ReturnType<typeof frameFor>;

function register(gen: TextureGen, key: string, type: string, a: number, b: number, top: number, draw: (p: PixelCanvas, f: Frame) => void, opts: { outline?: boolean; snow?: boolean } = {}): void {
  const f = frameFor(a, b, top);
  const paint = (p: PixelCanvas) => {
    draw(p, f);
    if (opts.outline !== false) outlineObjects(p);
  };
  gen.canvas(key, f.w, f.h, paint);
  // selection outline
  gen.canvas(`${key}#sel`, f.w, f.h, (p) => {
    const src = new PixelCanvas(f.w, f.h);
    paint(src);
    outlineOnly(src, p, P.gold[6]);
  });
  if (opts.snow !== false)
    gen.canvas(`${key}#kar`, f.w, f.h, (p) => {
      paint(p);
      snowify(p, 2);
    });
  BUILDING_ART[type] = { key, w: f.w, h: f.h, ax: f.cx, ay: f.cy, top };
}

/** Outline only pixels that are fully opaque structures (keeps soft ground decals un-outlined). */
function outlineObjects(p: PixelCanvas): void {
  const mark: number[] = [];
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      if (p.alphaAt(x, y) > 0) continue;
      const n = p.alphaAt(x - 1, y) === 255 || p.alphaAt(x + 1, y) === 255 || p.alphaAt(x, y - 1) === 255 || p.alphaAt(x, y + 1) === 255;
      if (n) mark.push(x, y);
    }
  for (let i = 0; i < mark.length; i += 2) p.set(mark[i], mark[i + 1], P.outline[1]);
}

/** Ground pad (soft, slightly transparent edge so it melts into the terrain). */
function pad(p: PixelCanvas, f: Frame, a: number, b: number, r: Ramp, base: number, seed: number): void {
  const [cx, cy] = [f.cx, f.cy];
  const rx = Math.round((a + b) * 8 + 2);
  const ry = Math.round((a + b) * 4 + 1);
  groundPatch(p, cx, cy, rx, ry, r, base, seed, 0.92);
  // make pad pixels semi-opaque so outline skips them
  for (let y = cy - ry - 2; y <= cy + ry + 2; y++)
    for (let x = cx - rx - 3; x <= cx + rx + 3; x++) {
      const a0 = p.alphaAt(x, y);
      if (a0 === 255) {
        const [rr, gg, bb] = p.get(x, y);
        p.erase(x, y);
        p.set(x, y, (rr << 16) | (gg << 8) | bb, 0.97);
      }
    }
}

// ───────────────────────────── individual buildings ─────────────────────────────

function drawQuarry(p: PixelCanvas, f: Frame): void {
  pad(p, f, 3, 3, P.dirt, 3.4, 3);
  const at = f.at;
  const D = 12;
  const n0 = at(0.4, 0.4);
  const n1 = at(2.2, 0.4);
  const n2 = at(2.2, 2.0);
  const n3 = at(0.4, 2.0);
  const dn = (q: [number, number]): [number, number] => [q[0], q[1] + D];
  // pit floor (rubble, darker)
  polyFn(p, [dn(n0), dn(n1), dn(n2), dn(n3)], (x, y) => rampAt(P.stone, (1.9 + (h01(x >> 1, y, 4) < 0.2 ? 0.8 : 0)) / 7, x, y));
  // back faces: cut limestone with quarrying steps
  const cut = (base: number, slope: number, x0: number, y0: number) => (x: number, y: number) => {
    const ty = Math.floor(y - (y0 + (x - x0) * slope));
    let v = base;
    if (ty % 4 === 0) v -= 1.1;
    else if (ty % 4 === 1) v += 0.5;
    if (((x + Math.floor(ty / 4) * 3) % 9) === 0) v -= 0.8;
    return rampAt(P.limestone, Math.max(0, Math.min(1, v / 5)), x, y);
  };
  polyFn(p, [n0, n1, dn(n1), dn(n0)], cut(4.2, 0.5, n0[0], n0[1])); // lit (faces down-left)
  polyFn(p, [n0, n3, dn(n3), dn(n0)], cut(2.1, -0.5, n0[0], n0[1])); // shaded
  // a terrace step inside along the back-right wall
  const s0 = at(0.4, 0.75);
  const s1 = at(2.2, 0.75);
  polyFn(p, [[s0[0], s0[1] + 5], [s1[0], s1[1] + 5], [s1[0], s1[1] + 8], [s0[0], s0[1] + 8]], () => P.limestone[2]);
  p.line(Math.round(s0[0]), Math.round(s0[1] + 5), Math.round(s1[0]), Math.round(s1[1] + 5), P.limestone[4]);
  // near lips occlude the floor (ground band) with a bright cut edge
  const ground = (x: number, y: number) => rampAt(P.dirt, (3.4 + (bayer(x, y) < 0.15 ? 0.7 : 0)) / 6, x, y);
  polyFn(p, [n1, n2, dn(n2), dn(n1)], ground);
  polyFn(p, [n3, n2, dn(n2), dn(n3)], ground);
  p.line(Math.round(n1[0]), Math.round(n1[1]), Math.round(n2[0]), Math.round(n2[1]), P.limestone[4]);
  p.line(Math.round(n3[0]), Math.round(n3[1]), Math.round(n2[0]), Math.round(n2[1]), P.limestone[5]);
  // rubble chips on the floor
  for (let i = 0; i < 26; i++) {
    const [x, y] = at(0.7 + h01(i, 1) * 1.3, 0.9 + h01(i, 2) * 0.9);
    p.set(Math.round(x), Math.round(y + D - 2), h01(i, 3) < 0.5 ? P.limestone[4] : P.stone[5]);
  }
  // blocks being cut in the pit
  const [bx, by] = at(1.2, 1.2);
  stoneBlock(p, Math.round(bx), Math.round(by + D - 4), 5);
  const [cx, cy] = at(1.75, 1.45);
  stoneBlock(p, Math.round(cx), Math.round(cy + D - 4), 5);
  // wooden shear-legs derrick hoisting a block out of the pit
  const [tx, ty] = at(2.25, 1.15);
  for (let j = 0; j < 30; j++) {
    p.set(Math.round(tx - 7 + j * 0.24), Math.round(ty - j), P.wood[5]);
    p.set(Math.round(tx + 5 - j * 0.17), Math.round(ty + 2 - j), P.wood[3]);
  }
  hline(p, Math.round(tx - 1), Math.round(tx + 1), Math.round(ty - 30), P.wood[6]);
  vline(p, Math.round(tx), Math.round(ty - 29), Math.round(ty + 4), P.sand[3]);
  stoneBlock(p, Math.round(tx), Math.round(ty + 4), 5);
  // dressed blocks stacked at the front
  for (const [u, v, n] of [[2.75, 2.2, 3], [2.0, 2.75, 2], [1.2, 2.75, 3]] as const) {
    const [x, y] = at(u, v);
    for (let k = 0; k < n; k++) stoneBlock(p, Math.round(x) - 6 + k * 5, Math.round(y) - 4, 5);
    stoneBlock(p, Math.round(x) - 3, Math.round(y) - 8, 5);
  }
  // water barrel & tools
  const [wx, wy] = at(0.45, 2.7);
  barrel(p, Math.round(wx), Math.round(wy - 6));
  vline(p, Math.round(wx + 7), Math.round(wy - 8), Math.round(wy), P.wood[4]);
  p.set(Math.round(wx + 6), Math.round(wy - 8), P.steel[4]);
  p.set(Math.round(wx + 8), Math.round(wy - 8), P.steel[3]);
}

/** Rounded broadleaf tree (oak/plane) lit from the upper-left. */
function tree(p: PixelCanvas, x: number, y: number, s: number, seed: number): void {
  shadowEllipse(p, x + 3, y + 1, s + 2, Math.max(1, (s >> 1) + 1), 0.3);
  vline(p, x, y - s, y, P.wood[3]);
  vline(p, x + 1, y - s + 1, y, P.wood[1]);
  const cy = y - s - s + 1;
  const blobs: [number, number, number][] = [[0, 0, s], [-s * 0.6, s * 0.3, s * 0.7], [s * 0.6, s * 0.35, s * 0.7], [0, -s * 0.5, s * 0.65]];
  for (const [bx, by, br] of blobs)
    for (let j = -Math.ceil(br); j <= Math.ceil(br); j++)
      for (let i = -Math.ceil(br); i <= Math.ceil(br); i++) {
        const d = (i * i + j * j) / (br * br);
        if (d > 1) continue;
        const X = Math.round(x + bx + i);
        const Y = Math.round(cy + by + j);
        if (d > 0.75 && h01(X, Y, seed) < 0.35) continue;
        const lit = (-(bx + i) - (by + j) * 1.2) / (s * 1.8);
        p.set(X, Y, rampAt(P.foliage, Math.max(0, Math.min(1, (3.6 + lit * 3 + (h01(X >> 1, Y >> 1, seed) - 0.5)) / 6)), X, Y));
      }
}

/** Conifer (pine/cypress) */
function pine(p: PixelCanvas, x: number, y: number, h: number): void {
  shadowEllipse(p, x + 3, y + 1, 4, 2, 0.3);
  vline(p, x, y - 2, y, P.wood[2]);
  for (let j = 0; j < h; j++) {
    const w = Math.round(((j % 4) + 1) * 0.5 + (j / h) * 3);
    for (let i = -w; i <= w; i++) p.set(x + i, y - h - 1 + j, ri(P.cypress, 2.6 - i / (w + 1) * 1.6 + (j % 4 === 0 ? 0.6 : 0)));
  }
}

/** Pile of logs lying along +tx, ends showing at the lower-right. */
function logPile(p: PixelCanvas, x: number, y: number, rows: number, len = 14): void {
  shadowEllipse(p, x + 2, y + 2, len - 2, 3, 0.25);
  for (let r = 0; r < rows; r++)
    for (let k = 0; k < rows - r; k++) {
      const ex = x + k * 3 + r * 1.5;
      const ey = y - r * 3 + k * 0;
      for (let i = 0; i < len; i++) {
        const lx = Math.round(ex - i);
        const ly = Math.round(ey - i / 2);
        p.set(lx, ly - 1, P.wood[5]);
        p.set(lx, ly, P.wood[3]);
        p.set(lx, ly + 1, P.wood[2]);
      }
      logEnd(p, Math.round(ex) + 1, Math.round(ey));
    }
}

function stump(p: PixelCanvas, x: number, y: number): void {
  for (let j = 0; j < 3; j++) {
    p.set(x - 1, y - j, P.wood[3]);
    p.set(x, y - j, P.wood[4]);
    p.set(x + 1, y - j, P.wood[2]);
  }
  p.set(x - 1, y - 3, P.wood[6]);
  p.set(x, y - 3, P.wood[7]);
  p.set(x + 1, y - 3, P.wood[5]);
}

function drawLumber(p: PixelCanvas, f: Frame): void {
  pad(p, f, 3, 3, P.dirt, 3.8, 7);
  const at = f.at;
  // sawdust & chips
  for (let i = 0; i < 90; i++) {
    const [x, y] = at(0.5 + h01(i, 9) * 2, 0.5 + h01(i, 8) * 2);
    p.set(Math.round(x), Math.round(y), h01(i, 7) < 0.5 ? P.wood[6] : P.sand[4], 0.85);
  }
  // forest edge at the back
  const [ax, ay] = at(0.25, 0.25);
  pine(p, Math.round(ax) - 4, Math.round(ay) + 2, 14);
  const [bx2, by2] = at(1.2, 0.1);
  tree(p, Math.round(bx2), Math.round(by2) + 3, 5, 3);
  const [cx2, cy2] = at(0.1, 1.2);
  pine(p, Math.round(cx2), Math.round(cy2) + 2, 12);
  // lean-to tool shed
  const [sx, sy] = at(0.55, 0.95);
  prism(p, Math.round(sx), Math.round(sy), 0.9, 0.6, 9, {
    top: (x, y) => rampAt(P.wood, 0.7, x, y),
    left: faceShader(P.wood, 4.6, { tex: 'plank' }),
    right: faceShader(P.wood, 2.4, { tex: 'plank' }),
  });
  const r0 = at(0.45, 0.85);
  polyFn(p, [[r0[0], r0[1] - 13], [r0[0] + 18, r0[1] - 4], [r0[0] + 8, r0[1] + 4], [r0[0] - 10, r0[1] - 5]], (x, y) => rampAt(P.wood, ((x & 2) ? 5.6 : 4.8) / 7, x, y));
  // log piles
  const [lx, ly] = at(2.3, 0.9);
  logPile(p, Math.round(lx), Math.round(ly), 3);
  const [mx, my] = at(2.5, 1.9);
  logPile(p, Math.round(mx), Math.round(my), 2, 12);
  // sawn planks stacked
  const [px2, py2] = at(1.0, 2.5);
  for (let j = 0; j < 4; j++)
    for (let i = 0; i < 14; i++) {
      p.set(Math.round(px2) - i, Math.round(py2) - j * 2 - Math.floor(i / 2), P.wood[6 - (j & 1)]);
      p.set(Math.round(px2) - i, Math.round(py2) - j * 2 - Math.floor(i / 2) + 1, P.wood[3]);
    }
  // stumps
  for (const [u, v] of [[0.6, 2.1], [2.7, 0.4], [1.5, 2.85], [2.85, 2.5]]) {
    const [x, y] = at(u, v);
    stump(p, Math.round(x), Math.round(y));
  }
}

function drawMason(p: PixelCanvas, f: Frame): void {
  pad(p, f, 2, 2, P.stone, 3.6, 11);
  const at = f.at;
  // open shed: 4 posts + tiled hipped roof
  const H = 13;
  const posts: [number, number][] = [[0.25, 0.25], [1.35, 0.25], [1.35, 1.2], [0.25, 1.2]];
  for (const [u, v] of posts) {
    const [x, y] = at(u, v);
    vline(p, Math.round(x), Math.round(y - H), Math.round(y), P.wood[4]);
    vline(p, Math.round(x) + 1, Math.round(y - H), Math.round(y), P.wood[2]);
  }
  // workbench & rough blocks under the shed
  const [bx, by] = at(0.8, 0.7);
  stoneBlock(p, Math.round(bx - 4), Math.round(by - 4), 4);
  stoneBlock(p, Math.round(bx + 4), Math.round(by - 2), 4);
  // hipped roof (red tiles)
  const roof = (u: number, v: number, h: number): [number, number] => {
    const [x, y] = at(u, v);
    return [x, y - h];
  };
  const e = 0.12;
  const A = roof(0.25 - e, 0.25 - e, H);
  const B = roof(1.35 + e, 0.25 - e, H);
  const C = roof(1.35 + e, 1.2 + e, H);
  const D = roof(0.25 - e, 1.2 + e, H);
  const R0 = roof(0.6, 0.72, H + 9);
  const R1 = roof(1.0, 0.72, H + 9);
  const tiles = (base: number) => (x: number, y: number) => rampAt(P.roof, (base + ((y % 3 === 0) ? -0.9 : 0) + ((x + (y >> 1)) % 4 === 0 ? -0.4 : 0)) / 6, x, y);
  polyFn(p, [A, B, R1, R0], tiles(2.0)); // back
  polyFn(p, [B, C, R1], tiles(1.6)); // right (shade)
  polyFn(p, [D, A, R0], tiles(4.4)); // left (lit)
  polyFn(p, [C, D, R0, R1], tiles(3.8)); // front
  p.line(Math.round(R0[0]), Math.round(R0[1]), Math.round(R1[0]), Math.round(R1[1]), P.roof[6]);
  p.line(Math.round(D[0]), Math.round(D[1]), Math.round(C[0]), Math.round(C[1]), P.roof[1]);
  // cannonball pyramids in front
  for (const [u, v, n] of [[1.6, 1.5, 3], [0.9, 1.75, 3]] as const) {
    const [x, y] = at(u, v);
    for (let i = 0; i < n; i++) ball(p, Math.round(x - 6 + i * 5), Math.round(y - 1), 2);
    for (let i = 0; i < n - 1; i++) ball(p, Math.round(x - 3 + i * 5), Math.round(y - 4), 2);
    ball(p, Math.round(x), Math.round(y - 7), 2);
  }
  // rough blocks waiting
  const [rx, ry] = at(1.8, 0.4);
  stoneBlock(p, Math.round(rx), Math.round(ry - 3), 4);
  stoneBlock(p, Math.round(rx + 4), Math.round(ry - 1), 4);
}

function drawBaruthane(p: PixelCanvas, f: Frame): void {
  pad(p, f, 3, 2, P.dirt, 3.0, 13);
  const at = f.at;
  // main powder house (thick stone, lead roof)
  const [ox, oy] = at(0.35, 0.2);
  const H = 15;
  const c = prism(p, Math.round(ox), Math.round(oy), 1.7, 1.0, H, {
    top: () => P.limestone[4],
    left: faceShader(P.limestone, 3.8, { gy: (x) => oy + 1.0 * 8 + 8 * 0 + (x - (ox - 16)) * 0.5 + 0, h: H, tex: 'masonry', seed: 1 }),
    right: faceShader(P.limestone, 2.0, { gy: (x) => oy + 1.0 * 8 + 1.7 * 8 - (x - (ox - 16 + 27)) * 0.5, h: H, tex: 'masonry', seed: 4 }),
  });
  // lead hip roof
  const ridgeH = 8;
  const mid = (a: [number, number], b: [number, number]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const r0 = mid(c.top, c.left);
  const r1 = mid(c.right, c.bottom);
  const R0: [number, number] = [r0[0] + 6, r0[1] - ridgeH + 3];
  const R1: [number, number] = [r1[0] - 6, r1[1] - ridgeH - 3];
  const lead = (base: number) => (x: number, y: number) => rampAt(P.steel, (base + (x % 5 === 0 ? -0.6 : 0)) / 6, x, y);
  polyFn(p, [c.top, c.right, R1, R0], lead(2.4));
  polyFn(p, [c.right, c.bottom, R1], lead(1.6));
  polyFn(p, [c.left, c.top, R0], lead(4.2));
  polyFn(p, [c.bottom, c.left, R0, R1], lead(3.6));
  p.line(Math.round(R0[0]), Math.round(R0[1]), Math.round(R1[0]), Math.round(R1[1]), P.steel[5]);
  // small iron-barred windows + door on the lit face
  const [dx, dy] = at(0.35 + 0.0, 0.2 + 1.0);
  for (let k = 0; k < 2; k++) {
    const wx = Math.round(dx + 8 + k * 12);
    const wy = Math.round(dy - 9 + k * 6);
    p.rect(wx, wy, 2, 3, P.outline[2]);
    p.set(wx, wy + 1, P.steel[3]);
  }
  const doorX = Math.round(dx + 22);
  const doorY = Math.round(dy + 1);
  p.rect(doorX, doorY - 9, 4, 8, P.wood[2]);
  hline(p, doorX, doorX + 3, doorY - 10, P.limestone[5]);
  p.set(doorX + 3, doorY - 5, P.gold[4]);
  // charcoal kiln mound (smokes)
  const [kx, ky] = at(2.55, 0.6);
  for (let y = 0; y < 9; y++) {
    const w = Math.round(Math.sqrt(Math.max(0, 1 - (y / 9) ** 2)) * 9);
    for (let x = -w; x <= w; x++) p.set(Math.round(kx) + x, Math.round(ky) - y, rampAt(P.dirt, (3 - x / (w + 1) * 1.6 + (y > 6 ? 0.6 : 0)) / 6, Math.round(kx) + x, Math.round(ky) - y));
  }
  p.set(Math.round(kx), Math.round(ky) - 9, P.outline[1]);
  p.set(Math.round(kx) + 1, Math.round(ky) - 9, P.fire[3]);
  for (let x = -8; x <= 8; x += 4) p.set(Math.round(kx) + x, Math.round(ky) - 1, P.fire[4]);
  // barrel stack under a small lean-to
  const [bx, by] = at(2.4, 1.6);
  const barrels = [[0, 0], [5, 0], [10, 0], [2, -5], [7, -5], [5, 3], [0, 3]];
  for (const [x, y] of barrels) barrel(p, Math.round(bx - 8 + x), Math.round(by - 6 + y));
  hline(p, Math.round(bx - 10), Math.round(bx + 8), Math.round(by - 14), P.wood[5]);
  hline(p, Math.round(bx - 10), Math.round(bx + 8), Math.round(by - 13), P.wood[3]);
  vline(p, Math.round(bx - 10), Math.round(by - 13), Math.round(by + 1), P.wood[3]);
  vline(p, Math.round(bx + 8), Math.round(by - 13), Math.round(by - 2), P.wood[2]);
  // water trough for safety + sacks of saltpetre
  const [wx, wy] = at(1.2, 1.7);
  for (let i = 0; i < 9; i++) {
    p.set(Math.round(wx) + i, Math.round(wy) - 2, P.water[5]);
    p.set(Math.round(wx) + i, Math.round(wy) - 1, P.wood[3]);
  }
  sack(p, Math.round(wx) - 7, Math.round(wy) - 5);
  sack(p, Math.round(wx) - 3, Math.round(wy) - 3);
}

function drawGranary(p: PixelCanvas, f: Frame): void {
  pad(p, f, 3, 2, P.dirt, 3.8, 17);
  const at = f.at;
  const [ox, oy] = at(0.3, 0.2);
  // stone plinth
  prism(p, Math.round(ox), Math.round(oy), 2.2, 1.2, 4, {
    top: () => P.stone[4],
    left: faceShader(P.stone, 4.4, { tex: 'none' }),
    right: faceShader(P.stone, 2.6, { tex: 'none' }),
  });
  // timber barn on the plinth
  const H = 14;
  const c = prism(p, Math.round(ox), Math.round(oy) - 4, 2.2, 1.2, H, {
    top: () => P.wood[4],
    left: faceShader(P.wood, 5.2, { tex: 'plank' }),
    right: faceShader(P.wood, 3.0, { tex: 'plank' }),
  });
  // gable roof along +tx: ridge from mid of top-left edge to mid of right-bottom edge
  const mid = (a: [number, number], b: [number, number]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const g0 = mid(c.top, c.left);
  const g1 = mid(c.right, c.bottom);
  const RH = 11;
  const R0: [number, number] = [g0[0], g0[1] - RH];
  const R1: [number, number] = [g1[0], g1[1] - RH];
  const tiles = (base: number) => (x: number, y: number) => rampAt(P.roof, (base + ((y % 3 === 0) ? -0.9 : 0) + ((x + (y >> 1)) % 4 === 0 ? -0.4 : 0)) / 6, x, y);
  const ev = 2;
  polyFn(p, [[c.top[0], c.top[1] - 1], [c.right[0] + ev, c.right[1] - 1], R1, R0], tiles(2.2));
  polyFn(p, [[c.left[0] - ev, c.left[1] + 1], [c.bottom[0], c.bottom[1] + 1], R1, R0], tiles(4.3));
  // gable end (shaded face side, right)
  polyFn(p, [c.right, c.bottom, R1], faceShader(P.wood, 2.6, { tex: 'plank' }));
  p.line(Math.round(R0[0]), Math.round(R0[1]), Math.round(R1[0]), Math.round(R1[1]), P.roof[6]);
  // big double door on the lit long side with sacks
  const [dx, dy] = at(1.3, 1.4);
  p.rect(Math.round(dx) - 5, Math.round(dy) - 15, 8, 10, P.wood[1]);
  vline(p, Math.round(dx) - 1, Math.round(dy) - 15, Math.round(dy) - 6, P.wood[3]);
  hline(p, Math.round(dx) - 6, Math.round(dx) + 3, Math.round(dy) - 16, P.wood[6]);
  // sacks piled outside
  for (const [u, v] of [[1.9, 1.75], [2.2, 1.85], [2.05, 1.6], [0.6, 1.8]]) {
    const [x, y] = at(u, v);
    sack(p, Math.round(x), Math.round(y - 5));
  }
  // grain baskets
  const [kx, ky] = at(2.7, 0.7);
  for (let k = 0; k < 2; k++) {
    for (let j = 0; j < 4; j++) hline(p, Math.round(kx) + k * 7, Math.round(kx) + 4 + k * 7, Math.round(ky) - j, ri(P.wood, j === 3 ? 6 : 4 - (j & 1)));
    hline(p, Math.round(kx) + k * 7 + 1, Math.round(kx) + 3 + k * 7, Math.round(ky) - 4, P.gold[5]);
  }
}

function drawTallow(p: PixelCanvas, f: Frame): void {
  pad(p, f, 2, 2, P.dirt, 3.2, 19);
  const at = f.at;
  // small shed with barrels at the back
  const [ox, oy] = at(0.15, 0.15);
  const c = prism(p, Math.round(ox), Math.round(oy), 0.9, 0.7, 10, {
    top: () => P.wood[4],
    left: faceShader(P.wood, 4.8, { tex: 'plank' }),
    right: faceShader(P.wood, 2.6, { tex: 'plank' }),
  });
  polyFn(p, [[c.top[0], c.top[1] - 6], [c.right[0] + 2, c.right[1] - 1], [c.bottom[0], c.bottom[1] + 1], [c.left[0] - 2, c.left[1] - 1]], (x, y) => rampAt(P.roof, ((x + y) % 3 === 0 ? 3 : 4) / 6, x, y));
  // tallow barrels
  const [bx, by] = at(1.5, 0.4);
  barrel(p, Math.round(bx) - 6, Math.round(by) - 6, P.wood);
  barrel(p, Math.round(bx) - 1, Math.round(by) - 5, P.wood);
  barrel(p, Math.round(bx) - 4, Math.round(by) - 10, P.wood);
  // firewood stack
  const [wx, wy] = at(0.5, 1.6);
  for (let j = 0; j < 3; j++) for (let k = 0; k < 4; k++) logEnd(p, Math.round(wx) + k * 3 - j, Math.round(wy) - 2 - j * 3);
  // hearth pits (cauldrons are animated sprites on top)
  for (const [u, v] of [[1.15, 1.15], [1.65, 1.55]]) {
    const [x, y] = at(u, v);
    ellipseFn(p, Math.round(x), Math.round(y), 7, 3, (xx, yy) => (bayer(xx, yy) < 0.5 ? P.outline[2] : P.dirt[1]));
  }
}

function drawKervansaray(p: PixelCanvas, f: Frame): void {
  pad(p, f, 3, 3, P.sand, 2.8, 23);
  const at = f.at;
  const H = 14;
  const T = 0.55; // wall thickness in tiles
  const o = 0.15;
  const L = 2.7;
  const bar = (u0: number, v0: number, a: number, b: number) => {
    const [x, y] = at(u0, v0);
    const c = prism(p, Math.round(x), Math.round(y), a, b, H, {
      top: (xx, yy) => rampAt(P.stone, (6.2 + (bayer(xx, yy) < 0.15 ? -0.6 : 0)) / 7, xx, yy),
      left: (xx, yy) => {
        const course = Math.floor((yy - xx * 0.5 + 1000) / 4);
        let v = 5.3;
        if ((yy - Math.floor(xx * 0.5)) % 4 === 0) v -= 1;
        else if ((xx + course * 3) % 7 === 0) v -= 0.8;
        return rampAt(P.stone, v / 7, xx, yy);
      },
      right: (xx, yy) => {
        let v = 2.9;
        if ((yy + Math.floor(xx * 0.5)) % 4 === 0) v -= 0.8;
        return rampAt(P.stone, v / 7, xx, yy);
      },
    });
    return c;
  };
  // back bars first (north & west), then courtyard, then front bars
  bar(o, o, L, T); // north wing (along +tx)
  bar(o, o + T, T, L - T); // west wing (along +ty)
  // courtyard floor
  const q0 = at(o + T, o + T);
  const q1 = at(o + L, o + T);
  const q2 = at(o + L, o + L);
  const q3 = at(o + T, o + L);
  polyFn(p, [[q0[0], q0[1] - 1], [q1[0], q1[1] - 1], [q2[0], q2[1] - 1], [q3[0], q3[1] - 1]], (x, y) => rampAt(P.sand, ((x + y) % 6 === 0 ? 2.6 : 3.4) / 5, x, y));
  // fountain (şadırvan)
  const [fx, fy] = at(o + 1.5, o + 1.45);
  ellipseFn(p, Math.round(fx), Math.round(fy), 5, 2, (x) => (x < fx ? P.limestone[4] : P.limestone[2]));
  ellipseFn(p, Math.round(fx), Math.round(fy) - 1, 3, 1, () => P.water[6]);
  vline(p, Math.round(fx), Math.round(fy) - 4, Math.round(fy) - 1, P.limestone[5]);
  // sacks & a resting camel shape in the yard
  sack(p, Math.round(fx) + 8, Math.round(fy) - 6);
  sack(p, Math.round(fx) + 12, Math.round(fy) - 4);
  // east & south wings (front)
  bar(o + L - T, o + T, T, L - T);
  bar(o, o + L - T, L - T, T);
  // arched portal on the front-left (south) wing, lit face
  const [gx, gy] = at(o + 1.1, o + L);
  const px0 = Math.round(gx);
  const py0 = Math.round(gy);
  // raised portal block
  for (let j = 0; j < H + 6; j++) for (let i = -6; i <= 6; i++) p.set(px0 + i, py0 - j + Math.round(i * -0.5), j > H + 3 ? P.limestone[5] : ri(P.limestone, i < 0 ? 4 : 3));
  // arch opening
  for (let j = 0; j < 10; j++) {
    const w = j > 7 ? 9 - j : 2;
    for (let i = -w; i <= w; i++) p.set(px0 + i, py0 - 1 - j + Math.round(i * -0.5), P.outline[2]);
  }
  for (let i = -3; i <= 3; i++) p.set(px0 + i, py0 - 11 - Math.abs(i) / 2 + Math.round(i * -0.5), P.brick[4]);
  // little lead domes on the roof (rooms)
  const domes: [number, number][] = [[o + 0.5, o + 0.27], [o + 1.4, o + 0.27], [o + 2.3, o + 0.27], [o + 0.27, o + 1.3], [o + 0.27, o + 2.1], [o + L - 0.27, o + 1.3], [o + L - 0.27, o + 2.1], [o + 1.9, o + L - 0.27]];
  for (const [u, v] of domes) {
    const [x, y] = at(u, v);
    const cx = Math.round(x);
    const cy = Math.round(y - H);
    for (let j = 0; j < 4; j++) {
      const w = Math.round(Math.sqrt(1 - (j / 4) ** 2) * 4);
      for (let i = -w; i <= w; i++) p.set(cx + i, cy - j, ri(P.steel, 4 - i / 3 + (j > 2 ? 1 : 0)));
    }
    p.set(cx, cy - 4, P.gold[5]);
  }
}

function gabion(p: PixelCanvas, x: number, y: number): void {
  // wicker basket filled with earth
  cylinder(p, x, y - 7, 3, 2, 7, P.wood, { tex: 'plank', base: 4.5 });
  ellipseFn(p, x, y - 7, 3, 1, () => P.dirt[4]);
  for (let j = 1; j < 7; j += 2) hline(p, x - 3, x + 3, y - j, P.wood[3]);
}

function drawEmplacement(p: PixelCanvas, f: Frame): void {
  pad(p, f, 2, 2, P.dirt, 3.2, 29);
  const at = f.at;
  // plank platform in the middle (cannon bed)
  const pl = [at(0.45, 0.5), at(1.45, 0.5), at(1.45, 1.5), at(0.45, 1.5)];
  polyFn(p, pl.map(([x, y]) => [x, y - 1] as [number, number]), (x, y) => rampAt(P.wood, (((x - y * 2) & 3) === 0 ? 2.8 : 4.6) / 7, x, y));
  // earth berm along the east (+tx, facing the walls) and south sides
  const berm = (u0: number, v0: number, u1: number, v1: number) => {
    const steps = 18;
    for (let s = 0; s <= steps; s++) {
      const u = u0 + ((u1 - u0) * s) / steps;
      const v = v0 + ((v1 - v0) * s) / steps;
      const [x, y] = at(u, v);
      for (let j = 0; j < 7; j++) {
        const w = 6 - j;
        for (let i = -w; i <= w; i++) p.set(Math.round(x) + i, Math.round(y) - j, rampAt(P.dirt, (3.4 - i / 6 + (j > 4 ? 1 : 0)) / 6, Math.round(x) + i, Math.round(y) - j));
      }
    }
  };
  berm(1.75, 0.15, 1.75, 1.85); // east (front-right)
  berm(0.2, 1.75, 1.75, 1.75); // south (front-left)
  // gabions on the berm crest
  for (let k = 0; k < 3; k++) {
    const [x, y] = at(1.75, 0.35 + k * 0.55);
    gabion(p, Math.round(x), Math.round(y) - 5);
  }
  for (let k = 0; k < 2; k++) {
    const [x, y] = at(0.45 + k * 0.7, 1.75);
    gabion(p, Math.round(x), Math.round(y) - 5);
  }
  // cannonballs and a powder barrel at the back
  const [bx, by] = at(0.35, 0.4);
  ball(p, Math.round(bx), Math.round(by) - 2, 2);
  ball(p, Math.round(bx) + 5, Math.round(by), 2);
  ball(p, Math.round(bx) + 2, Math.round(by) - 4, 2);
  barrel(p, Math.round(bx) - 9, Math.round(by) - 5);
}

function mantlet(p: PixelCanvas, x: number, y: number, seed: number): void {
  // leaning plank shield 7×11 with a prop stick behind
  for (let j = 0; j < 11; j++)
    for (let i = 0; i < 7; i++) {
      const xx = x + i + Math.floor(j / 4);
      const yy = y - j + Math.floor(i / 2);
      const v = (i % 3 === 0 ? 3 : 5) - (j < 1 ? -1 : 0) + (h01(i, j, seed) < 0.1 ? -1 : 0);
      p.set(xx, yy, ri(P.wood, v));
    }
  // iron bands
  for (let i = 0; i < 7; i++) {
    p.set(x + i + 1, y - 3 + Math.floor(i / 2), P.steel[2]);
    p.set(x + i + 2, y - 8 + Math.floor(i / 2), P.steel[2]);
  }
  // arrow stuck
  if (seed % 2 === 0) {
    p.set(x + 3, y - 6, P.wood[6]);
    p.set(x + 2, y - 7, P.wood[6]);
    p.set(x + 1, y - 8, P.cloth[5]);
  }
}

function drawSiper(p: PixelCanvas, f: Frame): void {
  pad(p, f, 2, 1, P.dirt, 3.0, 31);
  const at = f.at;
  // trench behind (west/back side)
  const t0 = at(0.15, 0.25);
  const t1 = at(1.85, 0.25);
  for (let s = 0; s <= 30; s++) {
    const x = Math.round(t0[0] + ((t1[0] - t0[0]) * s) / 30);
    const y = Math.round(t0[1] + ((t1[1] - t0[1]) * s) / 30);
    p.set(x, y, P.outline[2]);
    p.set(x, y + 1, P.dirt[1]);
    p.set(x + 1, y + 1, P.dirt[1]);
  }
  // earth heap along the front edge
  for (let s = 0; s <= 24; s++) {
    const [x, y] = at(0.1 + (1.8 * s) / 24, 0.85);
    for (let j = 0; j < 4; j++) for (let i = -3 + j; i <= 3 - j; i++) p.set(Math.round(x) + i, Math.round(y) - j, ri(P.dirt, 3 + (i < 0 ? 1 : 0) + (j === 3 ? 1 : 0)));
  }
  // mantlets
  for (let k = 0; k < 4; k++) {
    const [x, y] = at(0.3 + k * 0.45, 0.6);
    mantlet(p, Math.round(x) - 3, Math.round(y), k);
  }
}

function drawTentField(p: PixelCanvas, f: Frame, wing: string): void {
  pad(p, f, 2, 2, P.dryGrass, 2.6, 37);
  const at = f.at;
  const kinds: Record<string, TentKind[]> = {
    merkez: ['konik-kirmizi', 'sirt-cizgili', 'konik-beyaz-kirmizi'],
    karaca: ['konik-beyaz-kirmizi', 'sirt-beyaz', 'kucuk-bez'],
    ishak: ['konik-beyaz-yesil', 'sirt-yesil', 'konik-yesil'],
    zaganos: ['konik-beyaz-kirmizi', 'sirt-yesil', 'konik-beyaz-yesil'],
    hisar: ['sirt-beyaz', 'kucuk-bez', 'konik-beyaz-kirmizi'],
  };
  const k = kinds[wing] ?? kinds.karaca;
  const [x0, y0] = at(0.6, 0.55);
  drawTent(p, Math.round(x0), Math.round(y0), k[1], 0);
  const [x1, y1] = at(1.45, 0.75);
  drawTent(p, Math.round(x1), Math.round(y1), k[0], 0);
  const [x2, y2] = at(0.7, 1.45);
  drawTent(p, Math.round(x2), Math.round(y2), k[2], 0);
  // weapons rack & cooking pot
  const [rx, ry] = at(1.55, 1.6);
  for (let i = 0; i < 4; i++) {
    vline(p, Math.round(rx) - 3 + i * 2, Math.round(ry) - 9, Math.round(ry), P.wood[4]);
    p.set(Math.round(rx) - 3 + i * 2, Math.round(ry) - 10, P.steel[5]);
  }
  hline(p, Math.round(rx) - 4, Math.round(rx) + 4, Math.round(ry) - 6, P.wood[3]);
  const [cx, cy] = at(1.25, 1.35);
  for (let i = -2; i <= 2; i++) p.set(Math.round(cx) + i, Math.round(cy) - 2, P.bronze[3 + (i < 0 ? 1 : 0)]);
  hline(p, Math.round(cx) - 1, Math.round(cx) + 1, Math.round(cy) - 1, P.bronze[2]);
  p.set(Math.round(cx), Math.round(cy), P.fire[4]);
}

function drawOtag(p: PixelCanvas, f: Frame): void {
  pad(p, f, 3, 3, P.dryGrass, 3.0, 41);
  const at = f.at;
  // carpets inside the enclosure
  const c0 = at(0.5, 0.5);
  const c1 = at(2.5, 0.5);
  const c2 = at(2.5, 2.5);
  const c3 = at(0.5, 2.5);
  polyFn(p, [c0, c1, c2, c3], (x, y) => {
    const v = (x + y * 2) % 8 < 1 ? P.gold[3] : (x - y * 2 + 800) % 12 < 2 ? P.blue[2] : P.red[3];
    return v;
  });
  // red cloth enclosure (sarayperde / zokak) — back sides first
  const H = 8;
  const fence = (u0: number, v0: number, u1: number, v1: number, lit: boolean, gate?: number) => {
    const steps = Math.round(Math.hypot(u1 - u0, v1 - v0) * 24);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      if (gate != null && Math.abs(t - gate) < 0.09) continue;
      const [x, y] = at(u0 + (u1 - u0) * t, v0 + (v1 - v0) * t);
      const xi = Math.round(x);
      const yi = Math.round(y);
      for (let j = 0; j < H; j++) {
        let c: string = lit ? P.red[4] : P.red[3];
        if (j >= H - 2) c = lit ? P.gold[5] : P.gold[3];
        else if (j === 2 && s % 6 < 3) c = lit ? P.gold[4] : P.gold[2];
        else if (s % 12 === 0) c = P.red[2];
        p.set(xi, yi - j, c);
      }
      // crenellated top
      if (s % 4 < 2) p.set(xi, yi - H, lit ? P.gold[6] : P.gold[4]);
    }
  };
  fence(0.1, 0.1, 2.9, 0.1, false);
  fence(0.1, 0.1, 0.1, 2.9, true);
  // inner tents
  const [sx, sy] = at(2.15, 0.85);
  ridgeTent(p, Math.round(sx), Math.round(sy), 24, 'sirt-cizgili', 0);
  const [tx, ty] = at(0.85, 2.2);
  conicalTent(p, Math.round(tx), Math.round(ty), 7, 'konik-kirmizi', 0);
  const [mx, my] = at(1.45, 1.4);
  imperialPavilion(p, Math.round(mx), Math.round(my), 0);
  // front fence with the gate (lit SW face), right side shaded
  fence(2.9, 0.1, 2.9, 2.9, false);
  fence(0.1, 2.9, 2.9, 2.9, true, 0.42);
  // gate posts with gilded tops
  for (const t of [0.33, 0.51]) {
    const [x, y] = at(0.1 + 2.8 * t, 2.9);
    vline(p, Math.round(x), Math.round(y) - H - 4, Math.round(y), P.gold[3]);
    p.set(Math.round(x), Math.round(y) - H - 5, P.gold[6]);
  }
}

// ───────────────────────────── construction site & ghost ─────────────────────────────

function drawSiteDecal(p: PixelCanvas, f: Frame, a: number, b: number): void {
  const at = f.at;
  const pts = [at(0, 0), at(a, 0), at(a, b), at(0, b)];
  polyFn(p, pts, (x, y) => rampAt(P.dirt, (bayer(x, y) < 0.25 ? 3.6 : 4.2) / 6, x, y), 0.85);
  // corner stakes and cord
  for (let i = 0; i < 4; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % 4];
    const n = Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)));
    for (let s = 0; s <= n; s += 1) {
      const x = Math.round(x0 + ((x1 - x0) * s) / n);
      const y = Math.round(y0 + ((y1 - y0) * s) / n);
      if (s % 2 === 0) p.set(x, y - 2, P.cloth[4]);
    }
    vline(p, Math.round(x0), Math.round(y0) - 4, Math.round(y0), P.wood[5]);
    p.set(Math.round(x0), Math.round(y0) - 5, P.red[5]);
  }
}

function drawScaffold(p: PixelCanvas, f: Frame, a: number, b: number, H: number): void {
  const at = f.at;
  // poles at regular intervals along the two front edges and the back edges
  const poles: [number, number][] = [];
  for (let u = 0; u <= a + 0.01; u += 0.5) {
    poles.push(at(u, 0));
    poles.push(at(u, b));
  }
  for (let v = 0.5; v < b; v += 0.5) {
    poles.push(at(0, v));
    poles.push(at(a, v));
  }
  for (const [x, y] of poles) vline(p, Math.round(x), Math.round(y) - H, Math.round(y), P.wood[4]);
  // ledgers (horizontal) every 7 px
  for (let h = 6; h <= H; h += 7) {
    const edges: [[number, number], [number, number]][] = [
      [at(0, b), at(a, b)],
      [at(a, 0), at(a, b)],
    ];
    for (const [[x0, y0], [x1, y1]] of edges) p.line(Math.round(x0), Math.round(y0) - h, Math.round(x1), Math.round(y1) - h, P.wood[5]);
  }
  // diagonal braces on the front-left face
  const [x0, y0] = at(0, b);
  const [x1, y1] = at(a, b);
  p.line(Math.round(x0), Math.round(y0), Math.round((x0 + x1) / 2), Math.round((y0 + y1) / 2) - H, P.wood[3]);
  p.line(Math.round((x0 + x1) / 2), Math.round((y0 + y1) / 2), Math.round(x1), Math.round(y1) - H, P.wood[3]);
}

function drawGhost(p: PixelCanvas, f: Frame, a: number, b: number, ok: boolean): void {
  const at = f.at;
  const pts = [at(0, 0), at(a, 0), at(a, b), at(0, b)];
  const fill = ok ? P.green[4] : P.red[5];
  const edge = ok ? P.green[5] : P.red[6];
  polyFn(p, pts, (x, y) => (bayer(x, y) < 0.5 ? fill : null), 0.55);
  for (let i = 0; i < 4; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % 4];
    p.line(Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1), edge);
  }
  // tile grid
  for (let u = 1; u < a; u++) {
    const [x0, y0] = at(u, 0);
    const [x1, y1] = at(u, b);
    p.line(Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1), fill, 0.6);
  }
  for (let v = 1; v < b; v++) {
    const [x0, y0] = at(0, v);
    const [x1, y1] = at(a, v);
    p.line(Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1), fill, 0.6);
  }
}

/** Selection ring (diamond) for a footprint. */
function drawRing(p: PixelCanvas, f: Frame, a: number, b: number): void {
  const at = f.at;
  const pts = [at(-0.15, -0.15), at(a + 0.15, -0.15), at(a + 0.15, b + 0.15), at(-0.15, b + 0.15)];
  for (let i = 0; i < 4; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % 4];
    const n = Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)));
    for (let s = 0; s <= n; s++) {
      const x = Math.round(x0 + ((x1 - x0) * s) / n);
      const y = Math.round(y0 + ((y1 - y0) * s) / n);
      const corner = s < 6 || s > n - 6;
      if (corner || s % 4 < 2) p.set(x, y, corner ? P.gold[6] : P.gold[4]);
    }
  }
}

// ───────────────────────────── icons ─────────────────────────────

function icon(gen: TextureGen, key: string, draw: (p: PixelCanvas) => void): void {
  gen.canvas(key, 24, 24, (p) => {
    draw(p);
    p.outline(P.outline[0]);
  });
}

function generateIcons(gen: TextureGen): void {
  icon(gen, 'econ/icon-hisar', (p) => {
    // a curtain wall with battlements and a great roofed tower
    for (let j = 0; j < 6; j++) hline(p, 1, 22, 16 + j, ri(P.stone, 4.5 - (j > 4 ? 1.5 : 0)));
    for (let x = 1; x <= 22; x += 3) {
      p.set(x, 15, P.stone[6]);
      p.set(x + 1, 15, P.stone[5]);
    }
    cylinder(p, 12, 9, 6, 2, 12, P.stone, { tex: 'masonry', base: 4 });
    cone(p, 12, 1, 9, 7, 2, P.steel, { seams: 4, base: 2.3 });
    p.set(12, 0, P.gold[6]);
    p.rect(11, 17, 2, 3, P.outline[2]);
  });
  icon(gen, 'econ/icon-tas-ocagi', (p) => {
    stoneBlock(p, 8, 14, 5);
    stoneBlock(p, 14, 16, 5);
    for (let i = 0; i < 9; i++) p.set(5 + i, 12 - i, P.wood[5]);
    for (let i = 0; i < 5; i++) {
      p.set(11 + i, 3 + (i >> 1), P.steel[4]);
      p.set(11 - i, 3 + (i >> 1), P.steel[3]);
    }
  });
  icon(gen, 'econ/icon-kereste-kampi', (p) => {
    for (let k = 0; k < 3; k++) {
      for (let i = 0; i < 14; i++) p.set(5 + i, 16 - k * 4 + (i >> 3), P.wood[4]);
      logEnd(p, 18, 16 - k * 4);
    }
    for (let i = 0; i < 8; i++) p.set(4 + i, 9 - i, P.wood[5]);
    p.set(12, 2, P.steel[4]);
    p.set(12, 3, P.steel[3]);
    p.set(11, 2, P.steel[5]);
  });
  icon(gen, 'econ/icon-tasci-atolyesi', (p) => {
    ball(p, 7, 17, 4);
    ball(p, 16, 17, 4);
    ball(p, 12, 10, 4);
  });
  icon(gen, 'econ/icon-baruthane', (p) => {
    for (let j = 0; j < 12; j++)
      for (let i = 0; i < 10; i++) p.set(7 + i, 9 + j, ri(P.wood, (j === 2 || j === 9 ? 2 : i < 4 ? 5 : 3)));
    vline(p, 12, 4, 8, P.sand[3]);
    p.set(12, 3, P.fire[5]);
    p.set(13, 2, P.fire[6]);
    p.set(11, 2, P.fire[4]);
  });
  icon(gen, 'econ/icon-erzak-ambari', (p) => {
    sack(p, 5, 12);
    sack(p, 12, 13);
    sack(p, 8, 7);
    for (let i = 0; i < 4; i++) p.set(15 + i, 6 + i, P.gold[5]);
  });
  icon(gen, 'econ/icon-yag-kazani', (p) => {
    for (let y = 9; y <= 18; y++) {
      const hw = y < 12 ? 8 : 8 - Math.floor((y - 12) / 1.5);
      for (let x = -hw; x <= hw; x++) p.set(12 + x, y, ri(P.bronze, 4 - x / 4));
    }
    hline(p, 4, 20, 9, P.sand[5]);
    p.set(9, 6, P.cloth[5]);
    p.set(14, 4, P.cloth[4]);
    p.set(12, 7, P.cloth[5]);
    for (const x of [7, 12, 17]) p.set(x, 20, P.fire[5]);
  });
  icon(gen, 'econ/icon-ordugah-cadirlari', (p) => conicalTent(p, 12, 19, 8, 'konik-beyaz-kirmizi', 0, { tall: 9 }));
  icon(gen, 'econ/icon-otag', (p) => conicalTent(p, 12, 19, 9, 'konik-kirmizi', 0, { tall: 10 }));
  icon(gen, 'econ/icon-top-mevzii', (p) => {
    for (let i = 0; i < 14; i++) for (let j = 0; j < 4; j++) p.set(4 + i, 9 + j + (i >> 2), ri(P.bronze, 5 - j));
    wheel(p, 8, 16);
    for (let j = 0; j < 4; j++) hline(p, 2, 22, 20 + (j >> 1), P.dirt[3 + (j & 1)]);
  });
  icon(gen, 'econ/icon-siper', (p) => {
    mantlet(p, 3, 18, 0);
    mantlet(p, 12, 18, 1);
  });
  icon(gen, 'econ/icon-kervansaray', (p) => {
    for (let j = 0; j < 12; j++) hline(p, 3, 20, 8 + j, ri(P.limestone, 3 + (j < 2 ? 1 : 0)));
    for (let j = 0; j < 7; j++) {
      const w = j > 5 ? 1 : 2;
      hline(p, 11 - w, 11 + w, 19 - j, P.outline[2]);
    }
    for (const x of [6, 11, 16]) {
      p.set(x, 7, P.steel[4]);
      hline(p, x - 1, x + 1, 6, P.steel[3]);
    }
  });
  icon(gen, 'econ/icon-dokumhane', (p) => {
    for (let y = 6; y < 16; y++) {
      const hw = 6 - Math.floor((y - 6) / 3);
      for (let x = -hw; x <= hw; x++) p.set(12 + x, y, ri(P.steel, 3 - x / 3));
    }
    for (let x = -5; x <= 5; x++) p.set(12 + x, 6, P.fire[5 + (x & 1)]);
    for (let i = 0; i < 8; i++) hline(p, 5 + i, 19 - i, 19 + (i >> 2), P.bronze[3 + (i & 1)]);
  });
}

function wheel(p: PixelCanvas, cx: number, cy: number): void {
  for (let a = 0; a < 16; a++) {
    const t = (a / 16) * Math.PI * 2;
    p.set(Math.round(cx + Math.cos(t) * 3), Math.round(cy + Math.sin(t) * 3), P.wood[3]);
  }
  p.set(cx, cy, P.steel[3]);
}

// ───────────────────────────── entry ─────────────────────────────

export function generateBuildingTextures(gen: TextureGen): void {
  register(gen, 'econ/b-tas-ocagi', 'tas-ocagi', 3, 3, 30, (p, f) => drawQuarry(p, f));
  register(gen, 'econ/b-kereste-kampi', 'kereste-kampi', 3, 3, 26, (p, f) => drawLumber(p, f));
  register(gen, 'econ/b-tasci-atolyesi', 'tasci-atolyesi', 2, 2, 30, (p, f) => drawMason(p, f));
  register(gen, 'econ/b-baruthane', 'baruthane', 3, 2, 30, (p, f) => drawBaruthane(p, f));
  register(gen, 'econ/b-erzak-ambari', 'erzak-ambari', 3, 2, 34, (p, f) => drawGranary(p, f));
  register(gen, 'econ/b-yag-kazani', 'yag-kazani', 2, 2, 20, (p, f) => drawTallow(p, f));
  register(gen, 'econ/b-kervansaray', 'kervansaray', 3, 3, 28, (p, f) => drawKervansaray(p, f));
  register(gen, 'econ/b-top-mevzii', 'top-mevzii', 2, 2, 18, (p, f) => drawEmplacement(p, f));
  register(gen, 'econ/b-siper', 'siper', 2, 1, 16, (p, f) => drawSiper(p, f));
  register(gen, 'econ/b-otag', 'otag', 3, 3, 64, (p, f) => drawOtag(p, f));
  for (const wing of ['merkez', 'karaca', 'ishak', 'zaganos', 'hisar']) {
    register(gen, `econ/b-ordugah-cadirlari-${wing}`, wing === 'karaca' ? 'ordugah-cadirlari' : `ordugah-cadirlari@${wing}`, 2, 2, 30, (p, f) => drawTentField(p, f, wing));
  }
  // sites, scaffolds, ghosts and rings for every footprint size
  const sizes: [number, number][] = [[3, 3], [2, 2], [3, 2], [2, 1]];
  for (const [a, b] of sizes) {
    const fr = frameFor(a, b, 40);
    gen.canvas(`econ/santiye-${a}x${b}`, fr.w, fr.h, (p) => drawSiteDecal(p, fr, a, b));
    gen.canvas(`econ/iskele-${a}x${b}`, fr.w, fr.h, (p) => {
      drawScaffold(p, fr, a, b, 22);
      p.outline(P.outline[1]);
    });
    gen.canvas(`econ/ghost-${a}x${b}-ok`, fr.w, fr.h, (p) => drawGhost(p, fr, a, b, true));
    gen.canvas(`econ/ghost-${a}x${b}-bad`, fr.w, fr.h, (p) => drawGhost(p, fr, a, b, false));
    gen.canvas(`econ/halka-${a}x${b}`, fr.w, fr.h, (p) => drawRing(p, fr, a, b));
  }
  generateIcons(gen);
}

/** Frame geometry for site/scaffold/ghost textures of size a×b (shared with render). */
export function siteFrame(a: number, b: number) {
  return frameFor(a, b, 40);
}
