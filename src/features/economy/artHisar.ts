import { P } from '../../art/palette';
import { bayer, type PixelCanvas } from '../../art/pixel';
import { cone, h01, hline, rampAt, ri, snowify, stoneBlock, vline, type Ramp } from './artKit';
import type { HisarTowerId } from './data';
import { BATTERY, GATES, HISAR_POLY, inHisarPoly, WALL_NODES } from './hisarLayout';

/**
 * RUMELİ HİSARI — procedural layered art. The fortress is drawn into two
 * layers (back: slope, back walls, Saruca Paşa tower, interior; front: shore
 * walls, Halil & Zağanos Paşa towers, shore battery) so that workers inside the
 * courtyard sort between them. Layers are regenerated lazily whenever the
 * quantized construction state changes.
 */
export const HISAR_CANVAS = { w: 228, h: 176, ax: 114, ay: 150 };

export interface HisarVisual {
  /** Foundation 0..4 (0 = staked out, 4 = foundation courses laid). */
  t: number;
  /** Curtain walls 0..5 (5 = complete with battlements). */
  s: number;
  /** Towers 0..6 (6 = roofed). */
  k: Record<HisarTowerId, number>;
  done: boolean;
  snow: boolean;
}

export function hisarVisualKey(v: HisarVisual, layer: 'back' | 'front'): string {
  return `econ/hisar-${layer}-${v.t}${v.s}${v.k.saruca}${v.k.halil}${v.k.zaganos}${v.done ? 'T' : ''}${v.snow ? 'K' : ''}`;
}

/** Quantize part progress → visual levels. */
export function quantHisar(data: Record<string, number | string | boolean>, built: boolean, started: boolean, snow: boolean): HisarVisual {
  const n = (k: string) => Number(data[k] ?? 0);
  const t = built ? 4 : n('temel') >= 1 ? 4 : n('temel') <= 0 ? (started ? 1 : 0) : n('temel') < 0.34 ? 1 : n('temel') < 0.67 ? 2 : 3;
  const qs = (p: number) => (p >= 1 ? 5 : t < 4 ? 0 : Math.min(4, Math.floor(p * 5)));
  const qk = (p: number) => (p >= 1 ? 6 : t < 4 ? 0 : 1 + Math.min(4, Math.floor(p * 5)));
  return {
    t,
    s: built ? 5 : qs(n('surlar')),
    k: { saruca: built ? 6 : qk(n('saruca')), halil: built ? 6 : qk(n('halil')), zaganos: built ? 6 : qk(n('zaganos')) },
    done: built,
    snow: snow && built,
  };
}

// ───────────────────────────── geometry ─────────────────────────────

export const WALL_H = 20;
export const BURC = { r: 0.42, h: 28 };
export const TOWER: Record<HisarTowerId, { r: number; h: number; roof: number }> = {
  saruca: { r: 0.84, h: 48, roof: 22 },
  halil: { r: 1.02, h: 52, roof: 26 },
  zaganos: { r: 0.84, h: 44, roof: 21 },
};

export function liftAt(_gx: number, gy: number): number {
  return Math.max(0, Math.min(10, -gy * 0.14));
}

/** Screen position (in the layer canvas) of a ground point. */
function scr(gx: number, gy: number, h = 0): [number, number] {
  return [HISAR_CANVAS.ax + gx, HISAR_CANVAS.ay + gy - liftAt(gx, gy) - h];
}

/** Anchor-relative screen offset of a ground point lifted by h (for the renderer). */
export function hisarPoint(gx: number, gy: number, h = 0): { x: number; y: number } {
  return { x: gx, y: gy - liftAt(gx, gy) - h };
}

const NODE_R = WALL_NODES.map((n) => (n.kind === 'kule' ? TOWER[n.tower!].r : n.kind === 'burc' ? BURC.r : 0.3));
const CENTROID = HISAR_POLY.reduce((a, [x, y]) => [a[0] + x / HISAR_POLY.length, a[1] + y / HISAR_POLY.length], [0, 0]);

/** Height (px) of each tower at visual level q. */
export function towerHeight(id: HisarTowerId, q: number): number {
  if (q <= 0) return 3;
  if (q >= 6) return TOWER[id].h;
  return Math.round(TOWER[id].h * (0.12 + 0.88 * ((q - 1) / 5)));
}

export function wallHeight(s: number, t: number): number {
  if (t < 4) return 0;
  if (s <= 0) return 3;
  if (s >= 5) return WALL_H;
  return Math.round(WALL_H * (0.2 + 0.8 * (s / 5)));
}

// ───────────────────────────── element painters ─────────────────────────────

/**
 * Rumeli Hisarı masonry: grey rubble stone in rough courses (warm highlights,
 * cool shadows). `lit` shifts the value along the stone ramp (−2..+2.5).
 */
function rubble(x: number, y: number, base: number, lit: number, seed: number): string {
  const cy = Math.floor(y / 3);
  const off = (cy * 5 + seed) % 6;
  const cx = Math.floor((x + off) / 5);
  const n = h01(cx, cy, seed);
  let v = base + lit + (n - 0.5) * 0.8;
  if (y % 3 === 0) v -= 0.55;
  else if ((x + off) % 5 === 0) v -= 0.4;
  let r: Ramp = P.stone;
  if (n > 0.93) r = P.limestone;
  const t = Math.max(0, Math.min(1, (r === P.stone ? v : v * 0.72) / (r.length - 1)));
  return rampAt(r, t, x, y);
}

/**
 * Ground under the fortress. Before groundbreaking nothing (grass shows), during the
 * foundation only worked strips, afterwards a trodden courtyard on a terraced slope.
 */
function drawPad(p: PixelCanvas, v: HisarVisual): void {
  if (v.t < 4) return;
  const built = v.done;
  for (let gy = -96; gy <= 14; gy++)
    for (let gx = -112; gx <= 100; gx++) {
      const inner = inHisarPoly(gx, gy, 0);
      const ring = !inner && inHisarPoly(gx, gy, 9);
      if (!inner && !ring) continue;
      const [sx, sy0] = scr(gx, gy);
      const x = Math.round(sx);
      const sy = Math.round(sy0);
      const n = h01(gx >> 1, gy >> 1, 7);
      if (ring) {
        // embankment: earth face from the raised terrace down to the natural ground
        const fade = !inHisarPoly(gx, gy, 5);
        if (fade && bayer(x, sy) < 0.5) continue;
        const r: Ramp = built ? P.dryGrass : P.dirt;
        const top = rampAt(r, Math.min(1, (built ? 3.2 : 3.8) / (r.length - 1)), x, sy);
        p.set(x, sy, top);
        for (let y = sy + 1; y <= Math.round(HISAR_CANVAS.ay + gy); y++) p.set(x, y, rampAt(P.dirt, (2.2 + (gx < 0 ? 0.6 : 0)) / 6, x, y));
        continue;
      }
      let r: Ramp = P.dirt;
      let base = 4.0;
      if (built) {
        r = n > 0.55 ? P.grass : P.dryGrass;
        base = r === P.grass ? 3.2 : 1.9 + (n > 0.4 ? 0.5 : 0);
        if (Math.abs(gx + 26 - (gy + 10) * 0.9) < 3 || Math.abs(gy + 16) < 2.5) {
          r = P.limestone;
          base = 2.4;
        }
      } else if (n > 0.9) {
        r = P.limestone;
        base = 3.5;
      }
      const slope = gy < -12 ? 0.35 : 0;
      const val = base + slope + (n < 0.15 ? -0.7 : n > 0.85 ? 0.4 : 0);
      const c = rampAt(r, Math.max(0, Math.min(1, val / (r.length - 1))), x, sy);
      p.set(x, sy, c);
      p.set(x, sy + 1, c);
    }
}

interface Seg {
  i: number;
  a: { x: number; y: number };
  b: { x: number; y: number };
  mid: number;
}

function segments(): Seg[] {
  const out: Seg[] = [];
  for (let i = 0; i < WALL_NODES.length; i++) {
    const A = WALL_NODES[i];
    const B = WALL_NODES[(i + 1) % WALL_NODES.length];
    // trim ends inside the node towers (radius in plan px ≈ r * 22)
    const dx = B.x - A.x;
    const dy = (B.y - A.y) * 2;
    const L = Math.hypot(dx, dy);
    const ta = (NODE_R[i] * 21) / L;
    const tb = 1 - (NODE_R[(i + 1) % WALL_NODES.length] * 21) / L;
    const a = { x: A.x + (B.x - A.x) * ta, y: A.y + (B.y - A.y) * ta };
    const b = { x: A.x + (B.x - A.x) * tb, y: A.y + (B.y - A.y) * tb };
    out.push({ i, a, b, mid: (a.y + b.y) / 2 });
  }
  return out;
}

/** Curtain wall segment by column sweep. */
function drawWall(p: PixelCanvas, s: Seg, H: number, opts: { done: boolean; scaffold: boolean; gate: number | null; seed: number }): void {
  const T = 3.2; // half thickness in plan px
  const dx = s.b.x - s.a.x;
  const dy = (s.b.y - s.a.y) * 2;
  const L = Math.hypot(dx, dy);
  let nx = -dy / L;
  let ny = dx / L;
  // outer normal points away from the centroid
  const mx = (s.a.x + s.b.x) / 2;
  const my = ((s.a.y + s.b.y) / 2) * 2;
  if (nx * (mx - CENTROID[0]) + ny * (my - CENTROID[1] * 2) < 0) {
    nx = -nx;
    ny = -ny;
  }
  // which side faces the viewer (+y in plan)?
  const frontSign = ny > 0 ? 1 : -1; // +1 → outer face visible
  const litFace = -nx * frontSign; // >0 means the visible face points left (lit)
  const steps = Math.ceil(L * 2.2);
  const top: [number, number][] = [];
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    const gx = s.a.x + dx * t;
    const gy = s.a.y + (dy * t) / 2;
    // visible face line
    const fx = gx + nx * T * frontSign;
    const fy = gy + (ny * T * frontSign) / 2;
    const [sx, sb] = scr(fx, fy);
    const ragged = !opts.done && H > 3 ? Math.round(h01(k >> 1, s.i, 3) * 2.2) : 0;
    const h = Math.max(0, H - ragged);
    const sxi = Math.round(sx);
    for (let y = Math.round(sb - h); y <= Math.round(sb); y++) {
      const fromBase = Math.round(sb) - y;
      let c = rubble(sxi, y, 3.7, litFace * 1.3 + (fromBase < 2 ? -0.9 : 0) + (fromBase > h - 2 ? 0.6 : 0), opts.seed);
      // putlog holes (scaffold sockets)
      if (h > 8 && fromBase % 7 === 4 && k % 11 === 5) c = P.outline[2];
      // gate opening
      if (opts.gate != null && Math.abs(t - opts.gate) * L < 4 && fromBase < 10) {
        const off = Math.abs(t - opts.gate) * L;
        if (fromBase < 8 || off < 4 - (fromBase - 7)) c = fromBase === 9 || off > 3.2 ? P.limestone[5] : P.outline[2];
      }
      p.set(sxi, y, c);
    }
    // top walkway strip (between outer & inner edges)
    const [ox, oy] = scr(gx + nx * T, gy + (ny * T) / 2);
    const [ix, iy] = scr(gx - nx * T, gy - (ny * T) / 2);
    const n = Math.max(1, Math.round(Math.max(Math.abs(ox - ix), Math.abs(oy - iy))));
    for (let j = 0; j <= n; j++) {
      const x = Math.round(ix + ((ox - ix) * j) / n);
      const y = Math.round(iy + ((oy - iy) * j) / n - h);
      p.set(x, y, opts.done ? ri(P.stone, 6) : rampAt(P.stone, (5.2 + (bayer(x, y) < 0.3 ? 0.8 : 0)) / 7, x, y));
    }
    top.push([ox, oy - h]);
    // battlements on the outer edge
    if (opts.done && k % 9 < 4) {
      const [bx, by] = [Math.round(ox), Math.round(oy - h)];
      for (let j = 1; j <= 3; j++) p.set(bx, by - j, rubble(bx, by - j, 4.4, 0.6 + litFace * 0.6, opts.seed));
    }
  }
  // scaffolding in front of the visible face
  if (opts.scaffold && H > 4) {
    const poles = Math.max(2, Math.round(L / 11));
    for (let q = 0; q <= poles; q++) {
      const t = q / poles;
      const gx = s.a.x + dx * t + nx * (T + 3) * frontSign;
      const gy = s.a.y + (dy * t) / 2 + ((ny * (T + 3)) / 2) * frontSign;
      const [sx, sb] = scr(gx, gy);
      vline(p, Math.round(sx), Math.round(sb - H - 4), Math.round(sb), P.wood[q % 2 ? 3 : 4]);
    }
    for (let hh = 5; hh < H + 3; hh += 6) {
      const [x0, y0] = scr(s.a.x + nx * (T + 3) * frontSign, s.a.y + ((ny * (T + 3)) / 2) * frontSign, hh);
      const [x1, y1] = scr(s.b.x + nx * (T + 3) * frontSign, s.b.y + ((ny * (T + 3)) / 2) * frontSign, hh);
      p.line(Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1), P.wood[5]);
      p.line(Math.round(x0), Math.round(y0) + 1, Math.round(x1), Math.round(y1) + 1, P.wood[2]);
    }
  }
}

/** Big or small round tower with masonry, slits, battlements and (when done) a lead cone roof. */
function drawTower(p: PixelCanvas, gx: number, gy: number, rT: number, H: number, opts: { done: boolean; roof: number; scaffold: boolean; seed: number; open?: boolean; flat?: boolean }): void {
  const rx = Math.round(rT * 22);
  const ry = Math.round(rT * 11);
  const [cx, by] = scr(gx, gy);
  const cxi = Math.round(cx);
  const byi = Math.round(by);
  // back scaffold poles
  const poleAngles = [0.15, 0.4, 0.6, 0.85].map((a) => a * Math.PI * 2);
  const poleH = H + 5;
  const drawPoles = (front: boolean) => {
    if (!opts.scaffold) return;
    for (const a of poleAngles) {
      const s = Math.sin(a);
      if (s > 0 !== front) continue;
      const x = Math.round(cxi + Math.cos(a) * (rx + 3));
      const y = Math.round(byi + s * (ry + 2));
      vline(p, x, y - poleH, y, P.wood[front ? 4 : 2]);
    }
  };
  drawPoles(false);
  // shell
  for (let x = -rx; x <= rx; x++) {
    const u = x / (rx + 0.5);
    const e = Math.sqrt(Math.max(0, 1 - u * u));
    const yb = Math.round(byi + ry * e);
    const ragged = !opts.done && H > 4 ? Math.round(h01(x + 40, 9, opts.seed) * 2) : 0;
    const yt = Math.round(byi - H + ry * e) + ragged;
    const lit = (0.35 - 1.15 * u + 0.15 * e) * 2.3 + (u > 0.82 ? -0.7 : 0) + (u < -0.86 ? 0.5 : 0);
    for (let y = yt; y <= yb; y++) {
      const fromBase = yb - y;
      let c = rubble(cxi + x, y, 3.4, lit + (fromBase < 2 ? -0.9 : 0), opts.seed);
      // arrow slits
      if (opts.done && Math.abs(u) < 0.75 && (x + 200) % 9 === 4 && fromBase > 8 && fromBase % 14 > 9) c = P.outline[2];
      // string course (band of dressed stone) near the top when finished
      if (opts.done && fromBase === H - 4) c = rampAt(P.stone, Math.max(0, Math.min(1, (4.6 + lit * 0.7) / 7)), cxi + x, y);
      if (opts.done && (fromBase === H - 5 || fromBase === H - 6)) c = rampAt(P.stone, Math.max(0, Math.min(1, (2.0 + lit * 0.5) / 7)), cxi + x, y);
      p.set(cxi + x, y, c);
    }
  }
  // top: open ring while building, floor/battlements when done
  const topY = byi - H;
  if (!opts.done) {
    // wall thickness ring (rough) and dark interior
    for (let y = -ry; y <= ry; y++)
      for (let x = -rx; x <= rx; x++) {
        const d = (x * x) / (rx * rx + 0.3) + (y * y) / (ry * ry + 0.3);
        if (d > 1) continue;
        const inner = (x * x) / ((rx - 4) * (rx - 4) + 0.3) + (y * y) / ((ry - 2) * (ry - 2) + 0.3) <= 1;
        const c = inner ? (bayer(cxi + x, topY + y) < 0.3 ? P.stone[2] : P.stone[1]) : rampAt(P.stone, Math.max(0, Math.min(1, (5.2 - (1.3 * x) / rx + (bayer(cxi + x, topY + y) < 0.3 ? 0.6 : 0)) / 7)), cxi + x, topY + y);
        p.set(cxi + x, topY + y, c);
      }
    // a few blocks waiting on the top
    stoneBlock(p, cxi - Math.round(rx * 0.5), topY - 2, 3);
    stoneBlock(p, cxi + Math.round(rx * 0.4), topY + 1, 3);
  } else {
    // parapet ring with merlons
    for (let y = -ry; y <= ry; y++)
      for (let x = -rx; x <= rx; x++) {
        const d = (x * x) / (rx * rx + 0.3) + (y * y) / (ry * ry + 0.3);
        if (d > 1) continue;
        p.set(cxi + x, topY + y, d > 0.62 ? rampAt(P.stone, Math.max(0, Math.min(1, (5.4 - (1.4 * x) / rx) / 7)), cxi + x, topY + y) : P.stone[3]);
      }
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2;
      const x = Math.round(cxi + Math.cos(a) * (rx - 1));
      const y = Math.round(topY + Math.sin(a) * (ry - 1));
      const lit = Math.cos(a) < 0.2;
      for (let j = 1; j <= 3; j++) {
        p.set(x, y - j, ri(P.stone, lit ? 6 : 3));
        p.set(x + 1, y - j, ri(P.stone, lit ? 5 : 2));
      }
    }
    if (!opts.flat && opts.roof > 0) {
      // conical lead roof set inside the parapet
      cone(p, cxi, topY - 2 - opts.roof, topY - 2, rx - 2, Math.max(2, ry - 1), P.steel, { seams: 9, base: 2.3 });
      // finial
      const ty = topY - 2 - opts.roof;
      // gilded finial: spike with two stacked knobs (no cross)
      vline(p, cxi, ty - 3, ty, P.gold[3]);
      for (const [dx, dy, c] of [[-1, -4, 5], [0, -4, 6], [1, -4, 3], [-1, -5, 6], [0, -5, 6], [1, -5, 4], [0, -6, 5]] as const) p.set(cxi + dx, ty + dy, P.gold[c]);
    }
  }
  // front scaffold poles & ledgers
  if (opts.scaffold) {
    drawPoles(true);
    for (let hh = 6; hh < poleH; hh += 7) {
      for (let x = -rx - 3; x <= rx + 3; x++) {
        const u = x / (rx + 3.5);
        const e = Math.sqrt(Math.max(0, 1 - u * u));
        const y = Math.round(byi + (ry + 2) * e - hh);
        if ((x + hh) % 9 === 0) continue;
        p.set(cxi + x, y, P.wood[5]);
        if (hh % 14 === 6) p.set(cxi + x, y + 1, P.wood[3]);
      }
    }
  }
}

/** Foundation trenches / courses (temel stage). */
function drawFoundation(p: PixelCanvas, t: number): void {
  const lines: [number, number, number, number][] = [];
  for (let i = 0; i < WALL_NODES.length; i++) {
    const A = WALL_NODES[i];
    const B = WALL_NODES[(i + 1) % WALL_NODES.length];
    lines.push([A.x, A.y, B.x, B.y]);
  }
  const rings = WALL_NODES.map((n, i) => ({ x: n.x, y: n.y, r: NODE_R[i] }));
  const total = lines.length;
  if (t >= 1) {
    // worked earth strips along the trenches
    for (const [x0, y0, x1, y1] of lines) {
      const L = Math.hypot(x1 - x0, (y1 - y0) * 2);
      const steps = Math.ceil(L * 1.5);
      for (let k = 0; k <= steps; k++) {
        const tt = k / steps;
        const [sx, sy] = scr(x0 + (x1 - x0) * tt, y0 + (y1 - y0) * tt);
        for (let dy = -4; dy <= 4; dy++)
          for (let dx = -8; dx <= 8; dx++) {
            const d = (dx * dx) / 64 + (dy * dy) / 16;
            if (d > 1) continue;
            const x = Math.round(sx) + dx;
            const y = Math.round(sy) + dy;
            if (d > 0.55 && bayer(x, y) < (d - 0.55) * 2.2) continue;
            if (p.alphaAt(x, y) === 0) p.set(x, y, rampAt(P.dirt, (3.6 + (h01(x, y, 2) < 0.15 ? 1 : 0)) / 6, x, y));
          }
      }
    }
  }
  lines.forEach(([x0, y0, x1, y1], li) => {
    const L = Math.hypot(x1 - x0, (y1 - y0) * 2);
    const steps = Math.ceil(L * 1.5);
    for (let k = 0; k <= steps; k++) {
      const tt = k / steps;
      const gx = x0 + (x1 - x0) * tt;
      const gy = y0 + (y1 - y0) * tt;
      const [sx, sy] = scr(gx, gy);
      if (t === 0) {
        // survey cord with stakes
        if (k % 2 === 0) p.set(Math.round(sx), Math.round(sy) - 2, P.cloth[4]);
        if (k % 14 === 0) {
          vline(p, Math.round(sx), Math.round(sy) - 4, Math.round(sy), P.wood[5]);
          p.set(Math.round(sx), Math.round(sy) - 5, P.red[5]);
        }
        continue;
      }
      const filled = t >= 3 || (t === 2 && li < total / 2);
      for (let w = -2; w <= 2; w++) {
        const x = Math.round(sx);
        const y = Math.round(sy) + Math.round(w / 2);
        p.set(x + w, y, filled ? rubble(x + w, y, 2.2, 0.4, 3) : w === -2 || w === 2 ? P.dirt[2] : P.outline[2]);
      }
      // spoil heaps beside the trench
      if (!filled && k % 5 === 0) {
        const x = Math.round(sx) + 4;
        const y = Math.round(sy) + 1;
        p.set(x, y, P.dirt[4]);
        p.set(x + 1, y, P.dirt[3]);
        p.set(x, y - 1, P.dirt[5]);
      }
    }
  });
  for (const r of rings) {
    const rx = Math.round(r.r * 22);
    const ry = Math.round(r.r * 11);
    const [cx, cy] = scr(r.x, r.y);
    for (let a = 0; a < 80; a++) {
      const ang = (a / 80) * Math.PI * 2;
      const x = Math.round(cx + Math.cos(ang) * rx);
      const y = Math.round(cy + Math.sin(ang) * ry);
      if (t === 0) {
        if (a % 3 === 0) p.set(x, y - 1, P.cloth[4]);
      } else {
        p.set(x, y, t >= 3 ? rubble(x, y, 2.4, 0.5, 5) : P.outline[2]);
        p.set(x, y + 1, t >= 3 ? rubble(x, y + 1, 2.0, 0.3, 5) : P.dirt[2]);
      }
    }
  }
}

/** Soft cast shadows of the towers falling to the lower-right. */
function drawShadows(p: PixelCanvas, v: HisarVisual): void {
  WALL_NODES.forEach((n) => {
    const r = n.kind === 'kule' ? TOWER[n.tower!].r : BURC.r;
    const h = n.kind === 'kule' ? towerHeight(n.tower!, v.k[n.tower!]) : BURC.h;
    const rx = Math.round(r * 22 + h * 0.25);
    const ry = Math.round(r * 11 + h * 0.08);
    const [cx, cy] = scr(n.x + r * 14 + h * 0.18, n.y + r * 5);
    for (let y = -ry; y <= ry; y++)
      for (let x = -rx; x <= rx; x++) {
        const d = (x * x) / (rx * rx) + (y * y) / (ry * ry);
        if (d > 1) continue;
        const X = Math.round(cx) + x;
        const Y = Math.round(cy) + y;
        if (d > 0.65 && bayer(X, Y) < 0.5) continue;
        if (p.alphaAt(X, Y) > 0) p.set(X, Y, P.outline[1], 0.28);
      }
  });
}

/** A small timber-framed house with a red tile roof (barracks, storerooms). */
function house(p: PixelCanvas, gx: number, gy: number, a: number, b: number, h: number): void {
  const [ox, oy] = scr(gx, gy);
  const X = Math.round(ox);
  const Y = Math.round(oy);
  const A: [number, number] = [X + a * 16, Y + a * 8];
  const B: [number, number] = [X - b * 16, Y + b * 8];
  const C: [number, number] = [A[0] - b * 16, A[1] + b * 8];
  const face = (pts: [number, number][], base: number) => {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, y] of pts) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    for (let y = Math.floor(minY); y <= maxY; y++) {
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [x0, y0] = pts[i];
        const [x1, y1] = pts[(i + 1) % pts.length];
        if ((y0 <= y + 0.5 && y1 > y + 0.5) || (y1 <= y + 0.5 && y0 > y + 0.5)) xs.push(x0 + ((y + 0.5 - y0) / (y1 - y0)) * (x1 - x0));
      }
      xs.sort((m, n) => m - n);
      for (let k = 0; k + 1 < xs.length; k += 2)
        for (let x = Math.ceil(xs[k] - 0.5); x <= Math.floor(xs[k + 1] - 0.5); x++) {
          let vv = base;
          if ((x & 3) === 0) vv -= 1.2; // timber frame
          p.set(x, y, ri(P.wood, vv));
        }
    }
  };
  face([B, C, [C[0], C[1] - h], [B[0], B[1] - h]], 5.4); // lit long side
  face([C, A, [A[0], A[1] - h], [C[0], C[1] - h]], 3.2); // shaded end
  // gable roof along +tx
  const mid = (P1: [number, number], P2: [number, number]): [number, number] => [(P1[0] + P2[0]) / 2, (P1[1] + P2[1]) / 2];
  const R0 = mid([X, Y - h], [B[0], B[1] - h]);
  const R1 = mid([A[0], A[1] - h], [C[0], C[1] - h]);
  const rh = 6;
  const roofFill = (pts: [number, number][], base: number) => {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, y] of pts) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    for (let y = Math.floor(minY); y <= maxY; y++) {
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [x0, y0] = pts[i];
        const [x1, y1] = pts[(i + 1) % pts.length];
        if ((y0 <= y + 0.5 && y1 > y + 0.5) || (y1 <= y + 0.5 && y0 > y + 0.5)) xs.push(x0 + ((y + 0.5 - y0) / (y1 - y0)) * (x1 - x0));
      }
      xs.sort((m, n) => m - n);
      for (let k = 0; k + 1 < xs.length; k += 2)
        for (let x = Math.ceil(xs[k] - 0.5); x <= Math.floor(xs[k + 1] - 0.5); x++) p.set(x, y, ri(P.roof, base - (y % 3 === 0 ? 0.9 : 0)));
    }
  };
  roofFill([[X, Y - h], [A[0], A[1] - h], [R1[0], R1[1] - rh], [R0[0], R0[1] - rh]], 2.4);
  roofFill([[B[0] - 1, B[1] - h + 1], [C[0], C[1] - h + 1], [R1[0], R1[1] - rh], [R0[0], R0[1] - rh]], 4.6);
  roofFill([[C[0], C[1] - h], [A[0], A[1] - h], [R1[0], R1[1] - rh]], 3.0);
  p.line(Math.round(R0[0]), Math.round(R0[1] - rh), Math.round(R1[0]), Math.round(R1[1] - rh), P.roof[6]);
  // door
  const [dx, dy] = [Math.round((B[0] + C[0]) / 2), Math.round((B[1] + C[1]) / 2)];
  for (let j = 1; j <= 4; j++) {
    p.set(dx, dy - j, P.outline[2]);
    p.set(dx + 1, dy - j + 1, P.outline[2]);
  }
}

/** Small mosque (mescit) with a short minaret, and wooden barracks — finished interior. */
function drawInterior(p: PixelCanvas, done: boolean): void {
  if (!done) return;
  // timber barracks & storerooms along the hill wall
  house(p, -52, -44, 1.2, 0.6, 8);
  house(p, -28, -56, 1.3, 0.6, 8);
  house(p, 18, -58, 1.0, 0.6, 7);
  // the fortress mescit: whitewashed cube, lead dome, slender minaret
  const [mx, my] = scr(-46, -30);
  const cx = Math.round(mx);
  const cy = Math.round(my);
  for (let j = 0; j < 10; j++)
    for (let i = -8; i <= 8; i++) {
      const lit = i < 0;
      p.set(cx + i, cy - j + Math.round(Math.abs(i) * 0.5), ri(P.cloth, lit ? 4.6 - (j < 2 ? 1 : 0) : 2.6 - (j < 2 ? 1 : 0)));
    }
  for (let i = -8; i <= 8; i++) p.set(cx + i, cy - 10 + Math.round(Math.abs(i) * 0.5), ri(P.cloth, 5));
  for (let j = 0; j < 7; j++) {
    const w = Math.round(Math.sqrt(Math.max(0, 1 - (j / 7) ** 2)) * 7);
    for (let i = -w; i <= w; i++) p.set(cx + i, cy - 11 - j, ri(P.steel, 3.6 - (i * 1.6) / 7 + (j > 5 ? 0.8 : 0)));
  }
  p.set(cx, cy - 19, P.gold[5]);
  p.set(cx, cy - 20, P.gold[6]);
  p.rect(cx - 4, cy - 6, 2, 4, P.outline[2]);
  // minaret (şerefe + cone)
  for (let j = 0; j < 26; j++) {
    p.set(cx + 10, cy + 2 - j, ri(P.cloth, 4.6));
    p.set(cx + 11, cy + 2 - j, ri(P.cloth, 3.4));
    p.set(cx + 12, cy + 2 - j, ri(P.cloth, 2.2));
  }
  hline(p, cx + 9, cx + 13, cy - 17, P.cloth[5]);
  hline(p, cx + 9, cx + 13, cy - 16, P.cloth[2]);
  cone(p, cx + 11, cy - 32, cy - 24, 2, 1, P.steel, { seams: 3, base: 2.4 });
  p.set(cx + 11, cy - 33, P.gold[6]);
  // well / cistern
  const [wx, wy] = scr(10, -24);
  for (let i = -3; i <= 3; i++) {
    p.set(Math.round(wx) + i, Math.round(wy), P.limestone[3]);
    p.set(Math.round(wx) + i, Math.round(wy) - 1, P.limestone[4]);
  }
  p.set(Math.round(wx), Math.round(wy) - 2, P.water[4]);
}

/** Construction clutter inside the courtyard: piles, lime pits, plank ramps. */
function drawWorks(p: PixelCanvas, v: HisarVisual): void {
  if (v.done) return;
  const piles: [number, number][] = [[-50, -22], [-12, -42], [24, -28], [-58, -36], [38, -46]];
  piles.forEach(([gx, gy], i) => {
    const [sx, sy] = scr(gx, gy);
    const n = v.t === 0 ? 2 : 4;
    for (let k = 0; k < n; k++) stoneBlock(p, Math.round(sx) + (k % 2) * 5 - 3, Math.round(sy) - 3 - Math.floor(k / 2) * 3, 4);
    if (i % 2 === 0) {
      // timber stack
      for (let j = 0; j < 3; j++) hline(p, Math.round(sx) + 6, Math.round(sx) + 16, Math.round(sy) - j * 2, ri(P.wood, 5 - j));
    }
  });
  if (v.t >= 1) {
    // lime pits (white)
    for (const [gx, gy] of [[-24, -18], [14, -48]]) {
      const [sx, sy] = scr(gx, gy);
      for (let y = -2; y <= 2; y++)
        for (let x = -6; x <= 6; x++)
          if ((x * x) / 36 + (y * y) / 4 <= 1) p.set(Math.round(sx) + x, Math.round(sy) + y, y < 0 ? P.limestone[5] : P.limestone[4]);
      p.set(Math.round(sx), Math.round(sy) - 3, P.cloth[5]);
    }
  }
}

/** Shore battery of great bronze cannons (only when finished) — front layer. */
function drawBattery(p: PixelCanvas): void {
  for (const b of BATTERY) {
    const [sx, sy] = scr(b.x, b.y);
    const x = Math.round(sx);
    const y = Math.round(sy);
    // timber bed with a low earthen breastwork in front
    for (let j = 0; j < 3; j++) hline(p, x - 8, x + 6, y + j - 1, ri(P.wood, 5 - j));
    for (let i = -6; i <= 9; i++) {
      p.set(x + i, y + 3 + (i > 4 ? 1 : 0), P.dirt[3]);
      p.set(x + i, y + 4 + (i > 4 ? 1 : 0), P.dirt[2]);
    }
    // great bronze barrel aimed at the strait (down-right)
    for (let i = 0; i < 15; i++) {
      const th = i < 4 ? 4 : 3;
      for (let j = 0; j < th; j++) p.set(x - 7 + i, y - 5 + Math.floor(i / 4) + j, ri(P.bronze, 5.5 - j * 1.4 - (i > 12 ? 0.8 : 0)));
    }
    // reinforcing rings & muzzle
    for (const i of [3, 8]) for (let j = 0; j < 4; j++) p.set(x - 7 + i, y - 5 + Math.floor(i / 4) + j, P.bronze[2]);
    p.set(x + 8, y - 1, P.outline[1]);
    p.set(x + 8, y - 2, P.bronze[1]);
    // stone shot beside it
    for (let k = 0; k < 3; k++) {
      p.set(x - 10 + k * 2, y + 1, P.stone[5]);
      p.set(x - 10 + k * 2, y + 2, P.stone[3]);
    }
  }
}

// ───────────────────────────── layer composition ─────────────────────────────

type Elem = { y: number; draw: () => void };

export function drawHisarLayer(p: PixelCanvas, v: HisarVisual, layer: 'back' | 'front'): void {
  const elems: Elem[] = [];
  const front = (y: number) => y > -30;
  const H = wallHeight(v.s, v.t);
  const building = !v.done;
  if (layer === 'back') {
    drawPad(p, v);
    if (v.t >= 4) drawShadows(p, v);
    if (v.t < 4) drawFoundation(p, v.t);
    drawWorks(p, v);
    drawInterior(p, v.done);
  }
  if (v.t >= 4) {
    for (const s of segments()) {
      const isFront = s.i <= 3;
      if (isFront !== (layer === 'front')) continue;
      const g = GATES.find((gg) => gg.seg === s.i);
      elems.push({
        y: s.mid,
        draw: () => drawWall(p, s, H, { done: v.done || v.s >= 5, scaffold: building && v.s < 5 && v.s > 0, gate: g ? g.t : null, seed: s.i * 3 }),
      });
    }
    WALL_NODES.forEach((n, i) => {
      if (front(n.y) !== (layer === 'front')) return;
      if (n.kind === 'kule') {
        const id = n.tower!;
        const q = v.k[id];
        elems.push({
          y: n.y + 0.5,
          draw: () =>
            drawTower(p, n.x, n.y, TOWER[id].r, towerHeight(id, q), {
              done: q >= 6,
              roof: TOWER[id].roof,
              scaffold: building && q > 0 && q < 6,
              seed: i * 7,
            }),
        });
      } else if (n.kind === 'burc') {
        const hb = v.s >= 5 ? BURC.h : Math.max(3, Math.round(BURC.h * (H / WALL_H)));
        elems.push({ y: n.y + 0.4, draw: () => drawTower(p, n.x, n.y, BURC.r, hb, { done: v.s >= 5, roof: 0, flat: true, scaffold: false, seed: i * 5 }) });
      }
    });
  }
  elems.sort((a, b) => a.y - b.y);
  for (const e of elems) e.draw();
  if (layer === 'front' && v.done) drawBattery(p);
  p.outline(P.outline[1]);
  if (v.snow) snowify(p, 2);
}

/** Top of each big tower (anchor-relative) at its current visual level — for cranes, banners, masons. */
export function towerTopPoint(id: HisarTowerId, q: number): { x: number; y: number } {
  const n = WALL_NODES.find((w) => w.tower === id)!;
  return hisarPoint(n.x, n.y, towerHeight(id, q) + (q >= 6 ? TOWER[id].roof + 8 : 0));
}

export function towerBasePoint(id: HisarTowerId): { x: number; y: number; r: number } {
  const n = WALL_NODES.find((w) => w.tower === id)!;
  return { ...hisarPoint(n.x, n.y, 0), r: TOWER[id].r };
}

/** Points along the wall tops (for sentries / masons) at the given wall height. */
export function wallTopPoints(H: number, count: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const segs = segments();
  for (let i = 0; i < count; i++) {
    const s = segs[i % segs.length];
    const t = 0.3 + 0.4 * h01(i, 77);
    out.push(hisarPoint(s.a.x + (s.b.x - s.a.x) * t, s.a.y + (s.b.y - s.a.y) * t, H));
  }
  return out;
}
