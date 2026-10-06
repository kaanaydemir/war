import { rgb } from './palette';

/**
 * PixelCanvas — fast pixel-level drawing on an ImageData buffer.
 * All procedural art is drawn with this (no anti-aliasing, ever).
 *
 * Colors are '#rrggbb' strings (from the master palette) or packed 0xRRGGBB.
 * Alpha is 0..1; when < 1 it blends over the existing pixel.
 */
export type Color = string | number;

function toRGB(c: Color): [number, number, number] {
  if (typeof c === 'number') return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
  return rgb(c);
}

const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/** Ordered-dither threshold in [0,1) for pixel (x,y). */
export function bayer(x: number, y: number): number {
  return (BAYER4[y & 3][x & 3] + 0.5) / 16;
}

export interface IsoBoxColors {
  top: Color;
  left: Color; // lit face (light comes from upper-left)
  right: Color; // shaded face
  edge?: Color; // optional highlight on the top-left edges
  outline?: Color;
}

export class PixelCanvas {
  readonly data: Uint8ClampedArray;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.data = new Uint8ClampedArray(w * h * 4);
  }

  clear(): void {
    this.data.fill(0);
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  /** Set a pixel. alpha < 1 blends over the existing pixel. */
  set(x: number, y: number, c: Color, alpha = 1): void {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || alpha <= 0) return;
    const i = (y * this.w + x) * 4;
    const [r, g, b] = toRGB(c);
    const d = this.data;
    if (alpha >= 1 || d[i + 3] === 0) {
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = alpha >= 1 ? 255 : Math.round(alpha * 255);
      return;
    }
    const a0 = d[i + 3] / 255;
    const a = alpha + a0 * (1 - alpha);
    d[i] = (r * alpha + d[i] * a0 * (1 - alpha)) / a;
    d[i + 1] = (g * alpha + d[i + 1] * a0 * (1 - alpha)) / a;
    d[i + 2] = (b * alpha + d[i + 2] * a0 * (1 - alpha)) / a;
    d[i + 3] = a * 255;
  }

  /** Set pixel only if currently transparent. */
  under(x: number, y: number, c: Color): void {
    if (!this.inside(x, y)) return;
    if (this.data[((y | 0) * this.w + (x | 0)) * 4 + 3] === 0) this.set(x, y, c);
  }

  alphaAt(x: number, y: number): number {
    if (!this.inside(x, y)) return 0;
    return this.data[((y | 0) * this.w + (x | 0)) * 4 + 3];
  }

  get(x: number, y: number): [number, number, number, number] {
    if (!this.inside(x, y)) return [0, 0, 0, 0];
    const i = ((y | 0) * this.w + (x | 0)) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }

  erase(x: number, y: number): void {
    if (!this.inside(x, y)) return;
    const i = ((y | 0) * this.w + (x | 0)) * 4;
    this.data[i + 3] = 0;
  }

  rect(x: number, y: number, w: number, h: number, c: Color, alpha = 1): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c, alpha);
  }

  /** Dithered blend between two colors; t=0 → all a, t=1 → all b. */
  ditherRect(x: number, y: number, w: number, h: number, a: Color, b: Color, t: number): void {
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) this.set(x + i, y + j, bayer(x + i, y + j) < t ? b : a);
  }

  /** Bresenham line. */
  line(x0: number, y0: number, x1: number, y1: number, c: Color, alpha = 1): void {
    x0 |= 0;
    y0 |= 0;
    x1 |= 0;
    y1 |= 0;
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c, alpha);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  /** Clean 2:1 isometric line (2 px across, 1 px down per step). dir: +1 down-right, −1 down-left. */
  isoLine(x: number, y: number, steps: number, dir: 1 | -1, c: Color): void {
    for (let s = 0; s < steps; s++) {
      this.set(x + s * 2 * dir, y + s, c);
      this.set(x + s * 2 * dir + dir, y + s, c);
    }
  }

  /** Scanline polygon fill (even-odd). */
  poly(pts: [number, number][], c: Color, alpha = 1): void {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, y] of pts) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const xs: number[] = [];
      const yc = y + 0.5;
      for (let i = 0; i < pts.length; i++) {
        const [x0, y0] = pts[i];
        const [x1, y1] = pts[(i + 1) % pts.length];
        if ((y0 <= yc && y1 > yc) || (y1 <= yc && y0 > yc)) {
          xs.push(x0 + ((yc - y0) / (y1 - y0)) * (x1 - x0));
        }
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.ceil(xs[k] - 0.5); x <= Math.floor(xs[k + 1] - 0.5); x++) this.set(x, y, c, alpha);
      }
    }
  }

  disc(cx: number, cy: number, r: number, c: Color, alpha = 1): void {
    for (let y = -r; y <= r; y++)
      for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.8) this.set(cx + x, cy + y, c, alpha);
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, c: Color, alpha = 1): void {
    for (let y = -ry; y <= ry; y++)
      for (let x = -rx; x <= rx; x++)
        if ((x * x) / (rx * rx + 0.5) + (y * y) / (ry * ry + 0.5) <= 1) this.set(cx + x, cy + y, c, alpha);
  }

  /** Filled iso diamond centered at (cx,cy) with full width w and height h (use w = 2h). */
  diamond(cx: number, cy: number, w: number, h: number, c: Color, alpha = 1): void {
    const hw = w / 2;
    const hh = h / 2;
    for (let y = 0; y < h; y++) {
      const dy = Math.abs(y + 0.5 - hh) / hh;
      const span = Math.round(hw * (1 - dy));
      for (let x = -span; x < span; x++) this.set(Math.round(cx + x), Math.round(cy - hh + y), c, alpha);
    }
  }

  /**
   * Isometric box. (ox, oy) = screen position of the footprint's NORTH (top)
   * vertex at ground level. Footprint spans `a` tiles along +tx (screen down-right)
   * and `b` tiles along +ty (screen down-left); tile size 32×16. Height in px.
   */
  isoBox(ox: number, oy: number, a: number, b: number, height: number, col: IsoBoxColors, tileW = 32, tileH = 16): void {
    const hw = tileW / 2;
    const hh = tileH / 2;
    const top: [number, number] = [ox, oy - height];
    const right: [number, number] = [ox + a * hw, oy + a * hh - height];
    const bottom: [number, number] = [ox + (a - b) * hw, oy + (a + b) * hh - height];
    const left: [number, number] = [ox - b * hw, oy + b * hh - height];
    // left (SW-facing, lit) face
    this.poly([left, bottom, [bottom[0], bottom[1] + height], [left[0], left[1] + height]], col.left);
    // right (SE-facing, shaded) face
    this.poly([bottom, right, [right[0], right[1] + height], [bottom[0], bottom[1] + height]], col.right);
    // top
    this.poly([top, right, bottom, left], col.top);
    if (col.edge) {
      this.line(left[0], left[1], top[0], top[1], col.edge);
      this.line(left[0], left[1], bottom[0], bottom[1], col.edge);
    }
    if (col.outline) this.outline(col.outline);
  }

  /** Add a 1-px outline around all opaque pixels (only into transparent pixels). */
  outline(c: Color, diagonal = false): void {
    const mark: number[] = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        if (this.alphaAt(x, y) !== 0) continue;
        const n =
          this.alphaAt(x - 1, y) > 127 ||
          this.alphaAt(x + 1, y) > 127 ||
          this.alphaAt(x, y - 1) > 127 ||
          this.alphaAt(x, y + 1) > 127 ||
          (diagonal &&
            (this.alphaAt(x - 1, y - 1) > 127 ||
              this.alphaAt(x + 1, y - 1) > 127 ||
              this.alphaAt(x - 1, y + 1) > 127 ||
              this.alphaAt(x + 1, y + 1) > 127));
        if (n) mark.push(x, y);
      }
    for (let i = 0; i < mark.length; i += 2) this.set(mark[i], mark[i + 1], c);
  }

  /** Copy another canvas onto this one at (dx,dy), optionally flipped horizontally. */
  blit(src: PixelCanvas, dx: number, dy: number, flipX = false): void {
    for (let y = 0; y < src.h; y++)
      for (let x = 0; x < src.w; x++) {
        const sx = flipX ? src.w - 1 - x : x;
        const [r, g, b, a] = src.get(sx, y);
        if (a === 0) continue;
        this.set(dx + x, dy + y, (r << 16) | (g << 8) | b, a / 255);
      }
  }

  /** Multiply-darken all opaque pixels inside a rect by factor (0..1). */
  darken(x: number, y: number, w: number, h: number, factor: number): void {
    for (let j = y; j < y + h; j++)
      for (let i = x; i < x + w; i++) {
        if (!this.inside(i, j)) continue;
        const k = (j * this.w + i) * 4;
        if (this.data[k + 3] === 0) continue;
        this.data[k] *= factor;
        this.data[k + 1] *= factor;
        this.data[k + 2] *= factor;
      }
  }

  /** Create an HTMLCanvasElement with this image (browser only). */
  toCanvas(): HTMLCanvasElement {
    const cv = document.createElement('canvas');
    cv.width = this.w;
    cv.height = this.h;
    const ctx = cv.getContext('2d')!;
    const img = ctx.createImageData(this.w, this.h);
    img.data.set(this.data);
    ctx.putImageData(img, 0, 0);
    return cv;
  }
}
