/**
 * Miniature illustration of an event ('olay/…' texture key), shown crisply at
 * an integer scale inside a gilded frame. Uses the animated strip from the
 * events API when available, else the static canvas, else the Phaser texture
 * source image, else an ornamental placeholder.
 */
import { eventImage, eventImageAnim } from '../../features/events/api';
import { Strip } from './kit';

const IMG_W = 160;
const IMG_H = 96;

interface Resolved {
  url: string;
  frames: number;
  fw: number;
  fh: number;
  fps: number;
}

const cache = new Map<string, Resolved | null>();

function canvasUrl(src: CanvasImageSource & { width: number; height: number }): string | null {
  try {
    if (src instanceof HTMLCanvasElement) return src.toDataURL('image/png');
    const cv = document.createElement('canvas');
    cv.width = src.width;
    cv.height = src.height;
    cv.getContext('2d')!.drawImage(src, 0, 0);
    return cv.toDataURL('image/png');
  } catch {
    return null;
  }
}

export function resolveEventImage(key: string): Resolved | null {
  if (cache.has(key)) return cache.get(key)!;
  let r: Resolved | null = null;
  try {
    const sh = eventImageAnim(key);
    if (sh) {
      const url = canvasUrl(sh.canvas);
      if (url) r = { url, frames: sh.frames, fw: sh.fw, fh: sh.fh, fps: sh.fps };
    }
  } catch {
    r = null;
  }
  if (!r) {
    try {
      const cv = eventImage(key);
      const url = cv && canvasUrl(cv);
      if (url && cv) r = { url, frames: 1, fw: cv.width, fh: cv.height, fps: 1 };
    } catch {
      r = null;
    }
  }
  if (!r) {
    try {
      const tex = (window as any).__game?.scene?.textures;
      if (tex?.exists?.(key)) {
        const img = tex.get(key).getSourceImage() as HTMLCanvasElement | HTMLImageElement;
        const url = canvasUrl(img as any);
        if (url) r = { url, frames: 1, fw: img.width, fh: img.height, fps: 1 };
      }
    } catch {
      r = null;
    }
  }
  // do not cache misses from before the game booted (textures may arrive later)
  if (r || (window as any).__ready) cache.set(key, r);
  return r;
}

export function EventImage(props: { imageKey?: string; k: number; class?: string }) {
  const r = props.imageKey ? resolveEventImage(props.imageKey) : null;
  const w = (r?.fw ?? IMG_W) * props.k;
  const h = (r?.fh ?? IMG_H) * props.k;
  return (
    <div class={'olay-resim ' + (props.class ?? '')} style={{ width: w, height: h }}>
      {r ? (
        r.frames > 1 ? (
          <Strip src={r.url} fw={r.fw} fh={r.fh} frames={r.frames} fps={r.fps} k={props.k} />
        ) : (
          <img src={r.url} width={w} height={h} alt="" class="px-img" draggable={false} />
        )
      ) : (
        <div class="olay-resim-bos" />
      )}
    </div>
  );
}
