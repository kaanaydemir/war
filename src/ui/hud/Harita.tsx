/**
 * Minimap (bottom-right): the world's 1-px-per-tile map (tile space, north up:
 * x = tx east, y = ty south) drawn crisply at integer scale, with live markers
 * (walls coloured by breach, buildings, groups, cannons, ships, selection) and
 * the camera's iso view as a rotated quad. Click/drag to move the camera.
 */
import { useEffect, useRef } from 'preact/hooks';
import { worldToTile } from '../../core/iso';
import { store } from '../../core/store';
import type { WorldApi } from '../../core/world';
import { SECTIONS } from '../../data/sections';
import { buildingDef } from '../../features/economy/api';
import { sectionPath } from '../../features/fortifications/api';
import { minimapCanvas } from '../../features/world/minimap';
import { getWorld } from '../../game/GameScene';
import { breachColor, safe, SIDE_COLOR, viewQuad } from './logic';
import { opt } from './opt';
import { Ikon, Ipucu, ses } from './ui';

function worldOrNull(): WorldApi | null {
  return safe(() => (window as any).__game?.scene?.world ?? getWorld(), null);
}

function draw(cv: HTMLCanvasElement, t: number): void {
  const s = store.state;
  const w = worldOrNull();
  const ctx = cv.getContext('2d');
  if (!ctx || !s || !w) return;
  const S = cv.width / w.width;
  ctx.imageSmoothingEnabled = false;
  const base = safe(() => minimapCanvas(w), null);
  if (base) ctx.drawImage(base, 0, 0, cv.width, cv.height);
  else {
    ctx.fillStyle = '#152044';
    ctx.fillRect(0, 0, cv.width, cv.height);
  }
  const blink = Math.floor(t / 320) % 2 === 0;
  const dot = (tx: number, ty: number, col: string, size = 2) => {
    const x = Math.round(tx * S - (size * S) / 2);
    const y = Math.round(ty * S - (size * S) / 2);
    ctx.fillStyle = '#17131f';
    ctx.fillRect(x - S, y - S, (size + 2) * S, (size + 2) * S);
    ctx.fillStyle = col;
    ctx.fillRect(x, y, size * S, size * S);
  };

  // walls coloured by breach
  for (const def of SECTIONS) {
    const sec = s.sections[def.id];
    const p = safe(() => sectionPath(def.id), []);
    if (!sec || p.length < 2) continue;
    const col = sec.breach >= 0.5 && !blink ? '#650f1a' : breachColor(sec.breach);
    for (const pass of [0, 1]) {
      ctx.fillStyle = pass === 0 ? '#17131f' : col;
      for (let i = 0; i + 1 < p.length; i++) {
        const a = p[i];
        const b = p[i + 1];
        const n = Math.max(1, Math.ceil(Math.hypot(b.tx - a.tx, b.ty - a.ty) * 2));
        for (let k = 0; k <= n; k++) {
          const x = Math.floor((a.tx + ((b.tx - a.tx) * k) / n) * S);
          const y = Math.floor((a.ty + ((b.ty - a.ty) * k) / n) * S);
          if (pass === 0) ctx.fillRect(x - S, y - S, 3 * S, 3 * S);
          else ctx.fillRect(x, y, S, S);
        }
      }
    }
  }
  // buildings
  for (const b of s.buildings) {
    if (b.tx < 0) continue;
    const def = safe(() => buildingDef(b.type), undefined);
    const sz = def?.size ?? [1, 1];
    ctx.fillStyle = '#17131f';
    ctx.fillRect(Math.floor(b.tx * S) - S, Math.floor(b.ty * S) - S, (sz[0] + 2) * S, (sz[1] + 2) * S);
    ctx.fillStyle = b.built ? (b.owner === 'osmanli' ? '#e6cb92' : '#b1aaa2') : '#916645';
    ctx.fillRect(Math.floor(b.tx * S), Math.floor(b.ty * S), sz[0] * S, sz[1] * S);
  }
  const selected = new Set(store.ui.selection.map((p) => `${p.kind}:${p.id}`));
  // mines (shaft entrances) and siege towers
  for (const m of s.mines) {
    if (m.status === 'cokertildi') continue;
    dot(m.tx, m.ty, m.detected && blink ? '#f26a5a' : '#916645', 2);
  }
  for (const t of opt.towers(s)) {
    if (!t.at || t.status === 'yikildi') continue;
    const sel = selected.has(`building:${t.pickId}`);
    dot(t.at.tx, t.at.ty, sel && blink ? '#ffffff' : t.status === 'yaniyor' && blink ? '#f8902a' : '#c8a46a', 3);
  }
  // ships
  for (const sh of s.ships) {
    if (sh.status === 'batik' || sh.hp <= 0) continue;
    const sel = selected.has(`ship:${sh.id}`);
    dot(sh.tx, sh.ty, sel && blink ? '#fff1a0' : sh.status === 'yaniyor' && blink ? '#f8902a' : SIDE_COLOR[sh.side] ?? '#ffffff', 2);
  }
  // cannons
  for (const c of s.cannons) {
    if (c.status === 'dokuluyor' || c.tx < 0) continue;
    const sel = selected.has(`cannon:${c.id}`);
    dot(c.tx, c.ty, sel && blink ? '#ffffff' : '#f2d65a', c.type === 'sahi' ? 3 : 2);
  }
  // groups
  for (const g of s.groups) {
    if (g.status === 'uzakta' || g.status === 'dagildi' || g.men <= 0) continue;
    const sel = selected.has(`group:${g.id}`);
    dot(g.tx, g.ty, sel ? (blink ? '#fff1a0' : '#f2d65a') : g.status === 'savasiyor' && blink ? '#f26a5a' : '#b81f2c', 2);
  }
  // selected wall section
  for (const p of store.ui.selection)
    if (p.kind === 'section') {
      const pts = safe(() => sectionPath(String(p.id)), []);
      ctx.fillStyle = blink ? '#fff1a0' : '#2f9a96';
      for (const q of pts) ctx.fillRect(Math.floor(q.tx * S) - S, Math.floor(q.ty * S) - S, 3 * S, 3 * S);
    }
  // camera view (iso rectangle → rotated quad in tile space)
  const v = safe(() => store.actions.getCameraView(), null);
  if (v && v.w > 1) {
    const quad = viewQuad(v, (x, y) => worldToTile(x, y));
    // translucent fill, then crisp pixel edges (dark shadow + bright line)
    ctx.save();
    ctx.fillStyle = 'rgba(255, 241, 160, 0.16)';
    ctx.beginPath();
    quad.forEach((q, i) => (i ? ctx.lineTo(q.tx * S, q.ty * S) : ctx.moveTo(q.tx * S, q.ty * S)));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    const edge = (col: string, off: number) => {
      ctx.fillStyle = col;
      for (let i = 0; i < 4; i++) {
        const a = quad[i];
        const b = quad[(i + 1) % 4];
        const n = Math.max(1, Math.ceil(Math.hypot(b.tx - a.tx, b.ty - a.ty) * S));
        for (let k = 0; k <= n; k++) {
          const x = Math.floor((a.tx + ((b.tx - a.tx) * k) / n) * S) + off;
          const y = Math.floor((a.ty + ((b.ty - a.ty) * k) / n) * S) + off;
          ctx.fillRect(x, y, S, S);
        }
      }
    };
    edge('#17131f', S);
    edge(blink ? '#ffffff' : '#fff1a0', 0);
  }
}

export function Harita() {
  const ref = useRef<HTMLCanvasElement>(null);
  const drag = useRef(false);
  const lastFocus = useRef(0);
  const w = worldOrNull();
  const W = w?.width ?? 256;
  const H = w?.height ?? 200;
  const S = Math.max(1, Math.round(window.devicePixelRatio || 1));

  useEffect(() => {
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (t - last < 70) return;
      last = t;
      if (ref.current && store.ui.screen === 'oyun') draw(ref.current, t);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const focusAt = (e: MouseEvent, force = false) => {
    const cv = ref.current;
    if (!cv) return;
    const r = cv.getBoundingClientRect();
    const tx = ((e.clientX - r.left) / r.width) * W;
    const ty = ((e.clientY - r.top) / r.height) * H;
    const now = performance.now();
    if (!force && now - lastFocus.current < 60) return;
    lastFocus.current = now;
    store.actions.focusTile(Math.max(0, Math.min(W - 1, tx)), Math.max(0, Math.min(H - 1, ty)));
  };

  useEffect(() => {
    const mm = (e: MouseEvent) => drag.current && focusAt(e);
    const mu = () => (drag.current = false);
    window.addEventListener('mousemove', mm);
    window.addEventListener('mouseup', mu);
    return () => {
      window.removeEventListener('mousemove', mm);
      window.removeEventListener('mouseup', mu);
    };
  }, []);

  return (
    <div class="harita panel-gece etkilesim">
      <div class="harita-baslik">
        <span class="baslik-yazi">Harita</span>
        <Ipucu
          icerik={
            <div class="ipucu-icerik">
              <div class="ipucu-baslik">Lejant</div>
              <div class="lejant">
                <i style={{ background: '#b81f2c' }} /> Osmanlı birlikleri
                <i style={{ background: '#f2d65a' }} /> Toplar
                <i style={{ background: '#e6cb92' }} /> Yapılar
                <i style={{ background: '#c8a46a' }} /> Kuşatma kulesi
                <i style={{ background: '#916645' }} /> Lağımlar
                <i style={{ background: '#fbf8f0' }} /> Ceneviz gemileri
                <i style={{ background: '#b67cc8' }} /> Bizans gemileri
                <i style={{ background: '#f26a5a' }} /> Gedik açılmış sur
              </div>
              <div class="ipucu-metin soluk">Tıkla ya da sürükle: kamerayı oraya götür.</div>
            </div>
          }
        >
          <span class="pusula">
            <span class="pusula-ok">▲</span>K
          </span>
        </Ipucu>
      </div>
      <canvas
        ref={ref}
        class="harita-tuval"
        width={W * S}
        height={H * S}
        style={{ width: `${W}px`, height: `${H}px` }}
        onMouseDown={(e) => {
          e.preventDefault();
          drag.current = true;
          ses('tik');
          focusAt(e, true);
        }}
        onWheel={(e) => e.stopPropagation()}
      />
    </div>
  );
}
