import type { TilePt } from './iso';

/**
 * Generic 8-directional A* on an integer grid with a binary heap.
 * cost(x,y) returns a multiplier ≥ 1 or Infinity for blocked tiles.
 */
export function astar(
  w: number,
  h: number,
  from: TilePt,
  to: TilePt,
  cost: (x: number, y: number) => number,
  maxNodes = 60000,
): TilePt[] | null {
  const sx = Math.round(from.tx);
  const sy = Math.round(from.ty);
  const gx = Math.round(to.tx);
  const gy = Math.round(to.ty);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h || gx < 0 || gy < 0 || gx >= w || gy >= h) return null;
  if (!isFinite(cost(gx, gy))) return null;
  const N = w * h;
  const g = new Float32Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const heap: number[] = [];
  const f = new Float32Array(N);
  const H = (x: number, y: number) => {
    const dx = Math.abs(x - gx);
    const dy = Math.abs(y - gy);
    return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy);
  };
  const push = (i: number) => {
    heap.push(i);
    let c = heap.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (f[heap[p]] <= f[heap[c]]) break;
      [heap[p], heap[c]] = [heap[c], heap[p]];
      c = p;
    }
  };
  const pop = (): number => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let c = 0;
      for (;;) {
        const l = c * 2 + 1;
        const r = l + 1;
        let m = c;
        if (l < heap.length && f[heap[l]] < f[heap[m]]) m = l;
        if (r < heap.length && f[heap[r]] < f[heap[m]]) m = r;
        if (m === c) break;
        [heap[m], heap[c]] = [heap[c], heap[m]];
        c = m;
      }
    }
    return top;
  };
  const start = sy * w + sx;
  const goal = gy * w + gx;
  g[start] = 0;
  f[start] = H(sx, sy);
  push(start);
  let expanded = 0;
  const DIRS = [
    [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
    [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
  ];
  while (heap.length) {
    const cur = pop();
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    if (++expanded > maxNodes) return null;
    const cx = cur % w;
    const cy = (cur / w) | 0;
    for (const [dx, dy, base] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const c = cost(nx, ny);
      if (!isFinite(c)) continue;
      // no corner cutting through blocked tiles
      if (dx !== 0 && dy !== 0 && (!isFinite(cost(cx + dx, cy)) || !isFinite(cost(cx, cy + dy)))) continue;
      const ni = ny * w + nx;
      if (closed[ni]) continue;
      const ng = g[cur] + base * c;
      if (ng < g[ni]) {
        g[ni] = ng;
        came[ni] = cur;
        f[ni] = ng + H(nx, ny);
        push(ni);
      }
    }
  }
  if (came[goal] === -1 && goal !== start) return null;
  const out: TilePt[] = [];
  let c = goal;
  while (c !== -1) {
    out.push({ tx: c % w, ty: (c / w) | 0 });
    if (c === start) break;
    c = came[c];
  }
  return out.reverse();
}
