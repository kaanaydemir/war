/**
 * LOADING SCREEN — night over Constantinople: the skyline under a rising moon,
 * an Ottoman sancak waving from a siege tower, and the progress shown as a
 * stretch of Theodosian wall rising course by course (limestone with red brick
 * bands). Historical snippets rotate underneath.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { P } from '../../art/palette';
import { bayer, PixelCanvas } from '../../art/pixel';
import { useGame } from '../useGame';
import { BANNER_FRAMES, BANNER_H, BANNER_W, bannerStripUrl, artUrl, drawSkyline, logoArt } from './art';
import { LOAD_FACTS, loadCaption } from './content';
import { FxCanvas, pxVars, PxImg, Strip, usePx } from './kit';
import { factIndex, fmtPct } from './logic';

const WALL_W = 160;
const COURSE_H = 4;
const COURSES = 9;
const WALL_H = COURSES * COURSE_H + 8; // + crenellations

interface Block {
  x: number;
  w: number;
  course: number;
  brick: boolean;
}

/** Running-bond layout of the rising wall (bottom course first). */
export function wallBlocks(): Block[] {
  const out: Block[] = [];
  for (let c = 0; c < COURSES; c++) {
    const brick = c % 3 === 2;
    const bw = brick ? 5 : 9;
    let x = brick ? 0 : c % 2 ? -4 : 0;
    while (x < WALL_W) {
      const x0 = Math.max(0, x);
      const x1 = Math.min(WALL_W, x + bw);
      out.push({ x: x0, w: x1 - x0, course: c, brick });
      x += bw;
    }
  }
  return out;
}

function drawBlock(p: PixelCanvas, b: Block, yOff: number): void {
  const y0 = WALL_H - (b.course + 1) * COURSE_H + Math.round(yOff);
  const ramp = b.brick ? P.brick : P.limestone;
  for (let y = 0; y < COURSE_H; y++)
    for (let x = 0; x < b.w; x++) {
      const px = b.x + x;
      const py = y0 + y;
      let c: string;
      if (y === COURSE_H - 1 || x === b.w - 1) c = b.brick ? P.brick[1] : P.limestone[1]; // mortar/shadow (lower-right)
      else if (y === 0 || x === 0) c = b.brick ? P.brick[5] : P.limestone[5]; // lit (upper-left)
      else c = bayer(px, py) < 0.25 ? ramp[3] : b.brick ? P.brick[4] : P.limestone[4];
      p.set(px, py, c);
    }
}

function drawMerlons(p: PixelCanvas, done: number): void {
  // crenellations appear with the last few percent
  const y0 = WALL_H - COURSES * COURSE_H;
  const n = Math.floor(done * 12);
  for (let i = 0; i < n; i++) {
    const x0 = 2 + i * 13;
    for (let y = 0; y < 6; y++)
      for (let x = 0; x < 7; x++) p.set(x0 + x, y0 - 6 + y, y === 0 || x === 0 ? P.limestone[5] : x === 6 ? P.limestone[1] : P.limestone[3]);
  }
}

function WallProgress(props: { progress: number; px: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const blocks = useMemo(wallBlocks, []);
  const target = useRef(0);
  target.current = props.progress;
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d')!;
    const pc = new PixelCanvas(WALL_W, WALL_H);
    const img = ctx.createImageData(WALL_W, WALL_H);
    let shown = 0;
    let raf = 0;
    let last = performance.now();
    const dust: { x: number; y: number; vx: number; vy: number; l: number }[] = [];
    let landed = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const goal = Math.min(1, target.current) * blocks.length;
      shown = Math.min(goal, shown + Math.max(8, (goal - shown) * 3) * dt);
      pc.clear();
      // ghost outline of the finished wall (faint)
      for (let y = WALL_H - COURSES * COURSE_H; y < WALL_H; y++)
        for (let x = 0; x < WALL_W; x++) if (bayer(x, y) < 0.08) pc.set(x, y, P.night[2]);
      const full = Math.floor(shown);
      for (let i = 0; i < Math.min(full, blocks.length); i++) drawBlock(pc, blocks[i], 0);
      if (full < blocks.length && shown > 0) {
        const frac = shown - full;
        drawBlock(pc, blocks[full], -(1 - frac) * 7);
      }
      if (full > landed) {
        // dust puff where the newest block landed
        const b = blocks[Math.min(full, blocks.length) - 1];
        if (b && dust.length < 40)
          for (let k = 0; k < 3; k++)
            dust.push({ x: b.x + Math.random() * b.w, y: WALL_H - (b.course + 1) * COURSE_H, vx: (Math.random() - 0.5) * 14, vy: -6 - Math.random() * 8, l: 0.5 });
        landed = full;
      }
      for (let i = dust.length - 1; i >= 0; i--) {
        const d = dust[i];
        d.l -= dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.vy += 20 * dt;
        if (d.l <= 0) dust.splice(i, 1);
        else pc.set(Math.round(d.x), Math.round(d.y), P.sand[4], 0.8);
      }
      if (target.current >= 0.999 && shown >= blocks.length - 0.01) drawMerlons(pc, 1);
      img.data.set(pc.data);
      ctx.putImageData(img, 0, 0);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [blocks]);
  return <canvas ref={ref} width={WALL_W} height={WALL_H} class="px-img" style={{ width: WALL_W * props.px, height: WALL_H * props.px }} />;
}

/** Loading progress source: the boot scene writes window.__loadProgress (0..1). */
function useProgress(simulated: boolean): number {
  useGame(); // re-render on store.notify (BootScene notifies per step)
  const [sim, setSim] = useState(0);
  useEffect(() => {
    if (!simulated) return;
    const t = setInterval(() => setSim((s) => (s >= 1.15 ? 0 : s + 0.035)), 120);
    return () => clearInterval(t);
  }, [simulated]);
  if (simulated) return Math.min(1, sim);
  return Math.max(0, Math.min(1, Number((window as any).__loadProgress ?? 0)));
}

export function LoadingScreen(props: { simulated?: boolean } = {}) {
  const px = usePx();
  const progress = useProgress(!!props.simulated);
  const [fi, setFi] = useState(() => Math.floor(Math.random() * LOAD_FACTS.length));
  useEffect(() => {
    const t0 = performance.now();
    const start = fi;
    const t = setInterval(() => setFi((start + factIndex(performance.now() - t0, LOAD_FACTS.length)) % LOAD_FACTS.length), 500);
    return () => clearInterval(t);
  }, []);
  const fact = LOAD_FACTS[fi];
  const logo = logoArt();
  const sky = artUrl('skyline', () => drawSkyline(320, 70));
  const k = px;
  return (
    <div class="ekran yukleme" style={pxVars(px)}>
      <FxCanvas px={px} counts={{ yildiz: 70, kor: 26 }} />
      <div class="yukleme-ay" />
      <div class="yukleme-orta">
        <PxImg src={logo.url} w={logo.logo.canvas.w} h={logo.logo.canvas.h} k={k} class="yukleme-logo" />
        <div class="yukleme-sahne" style={{ width: 320 * k, height: 70 * k }}>
          <PxImg src={sky} w={320} h={70} k={k} />
          <Strip src={bannerStripUrl()} fw={BANNER_W} fh={BANNER_H} frames={BANNER_FRAMES} fps={10} k={k} class="yukleme-sancak" />
        </div>
        <div class="yukleme-sur">
          <WallProgress progress={progress} px={k} />
        </div>
        <div class="yukleme-durum">
          <span>{loadCaption(progress)}</span>
          <b class="num">{fmtPct(progress)}</b>
        </div>
        <div class="yukleme-not uk-panel-gece" key={fi}>
          <h3>Tarihten bir yaprak</h3>
          <p>{fact.text}</p>
          <small>{fact.kaynak}</small>
        </div>
      </div>
    </div>
  );
}
