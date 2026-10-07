import Phaser from 'phaser';
import { MAP_H, MAP_W } from '../../core/constants';
import type { RenderContext } from '../../core/feature';
import { DEPTH } from '../../core/layers';
import { hash2 } from '../../core/rng';
import type { GameState, SectionId } from '../../core/state';
import type { PixelCanvas } from '../../art/pixel';
import { collapsedTowers, innerOpen, outerOpen, rawBreach } from './api';
import { sectionTowers, SPANS, type LineId, type TowerSpec } from './geom';
import { Scene, renderScene } from './raster';
import {
  decalPrims,
  gapCenter,
  GroundCache,
  layoutPieces,
  piecePrims,
  pieceRect,
  PROJ_OX,
  PROJ_OY,
  renderPiece,
  type PieceDamage,
  type PieceDef,
} from './wallArt';

/**
 * Wall pieces as y-sorted Phaser images with per-piece canvas textures rendered by
 * the pure renderer. Rendering is progressive (pieces in view first, the rest in a
 * time-budgeted queue) and textures survive scene restarts (keyed by damage
 * signature). A piece is re-rendered when its damage level changes; the old
 * texture shakes first and debris flies (see onCrumble).
 * Ground decals (peribolos terrace, moat fill, debris) live at DEPTH.GROUND_DECAL.
 */

export interface PieceRT {
  def: PieceDef;
  img: Phaser.GameObjects.Image | null;
  level: number;
  collapsedSig: string;
  /** signature of the texture currently shown ('' = none) */
  shown: string;
  queued: boolean;
  /** crumble shake timer */
  shake: number;
}

interface DecalRT {
  def: PieceDef;
  key: string;
  img: Phaser.GameObjects.Image | null;
  sig: string;
  want: string;
  ox: number;
  oy: number;
  w: number;
  h: number;
}

/** Moat fill quantised to 5 % steps (finer changes are invisible but would cost re-renders). */
const moatStep = (m: number): number => Math.round(Math.max(0, Math.min(1, m)) * 20) / 20;

/** Per-piece damage level 0..4 from section state (deterministic). */
export function pieceLevel(state: GameState, p: PieceDef): number {
  if (!p.sec) return 0;
  const s = state.sections[p.sec];
  const span = SPANS[p.sec];
  if (!s || !span) return 0;
  const open = p.layer === 'dis' ? outerOpen(s) : innerOpen(s);
  const tRel = ((p.t0 + p.t1) / 2 - span.t0) / Math.max(0.001, span.t1 - span.t0);
  const focus = 0.55 + 0.75 * (1 - Math.abs(2 * tRel - 1));
  // overshooting balls batter the inner wall behind a broken outer wall
  const collateral = p.layer === 'ic' && !p.single ? outerOpen(s) * 0.3 : 0;
  const o2 = Math.min(1, open + collateral);
  let local = o2 * focus + (hash2(p.idx, 1, 77) - 0.5) * 0.28 * Math.min(1, o2 * 4);
  // a breached section always shows at least one real gap near its middle
  const gapLayer = p.single ? 'ic' : 'dis';
  if (p.layer === gapLayer && rawBreach(s) >= 0.5 && Math.abs(tRel - 0.5) < 0.12 && p.towers.length === 0) local = Math.max(local, 0.72);
  if (local < 0.07) return 0;
  if (local < 0.24) return 1;
  if (local < 0.44) return 2;
  // a real gap needs the wall itself to be broken, not just collateral damage
  if (local < 0.7 || open < 0.38) return 3;
  return 4;
}

export class WallsRender {
  pieces: PieceRT[] = [];
  decals: DecalRT[] = [];
  ground: GroundCache;
  private scenes = new Map<LineId, Scene>();
  private sceneDirty = new Set<LineId>();
  private collapsedBySec = new Map<SectionId, Set<TowerSpec>>();
  private checkAcc = 1;
  private first = true;
  private allDone = false;
  private dirtyAny = true;
  private age = 0;
  private byLine = new Map<LineId, PieceRT[]>();
  /** numeric fingerprint of the wall state last seen by refreshDamage */
  private fp: number[] = [];
  private nearRect = new Phaser.Geom.Rectangle();
  private gf: (tx: number, ty: number) => number;
  /** Called when a piece gets worse (debris & dust are spawned by the caller). */
  onCrumble?: (p: PieceDef, newLevel: number, oldLevel: number, towers: TowerSpec[]) => void;
  /** total ms spent rendering (diagnostics) */
  renderMs = 0;
  /** bumped whenever any piece's damage level or collapsed towers change */
  version = 0;
  /** bumped whenever a piece texture is (re)rendered */
  texVersion = 0;

  constructor(
    private rc: RenderContext,
    state: GameState,
  ) {
    const w = rc.world;
    this.ground = new GroundCache((tx, ty) => w.heightAt(tx, ty), MAP_W, MAP_H);
    this.gf = (tx, ty) => this.ground.get(tx, ty);
    const defs = layoutPieces(this.gf);
    for (const d of defs) {
      const rt: PieceRT = { def: d, img: null, level: 0, collapsedSig: '', shown: '', queued: false, shake: 0 };
      this.pieces.push(rt);
      let l = this.byLine.get(d.line);
      if (!l) this.byLine.set(d.line, (l = []));
      l.push(rt);
    }
    // stable texture rects: union of intact and fully ruined geometry
    for (const p of this.pieces) {
      const lo = p.def.base - 8;
      const a = piecePrims(p.def, { level: 0, collapsed: new Set() }, false);
      const b = piecePrims(p.def, { level: 4, collapsed: new Set(p.def.towers) }, false);
      const r1 = pieceRect(p.def, a, lo);
      const r2 = pieceRect(p.def, b, lo);
      const ox = Math.min(r1.ox, r2.ox);
      const oy = Math.min(r1.oy, r2.oy);
      p.def.ox = ox;
      p.def.oy = oy;
      p.def.w = Math.max(r1.ox + r1.w, r2.ox + r2.w) - ox;
      p.def.h = Math.max(r1.oy + r1.h, r2.oy + r2.h) - oy;
    }
    for (const p of this.pieces) {
      if (p.def.layer !== 'dis') continue;
      const prims = decalPrims(p.def, 4, 1, this.gf);
      const r = pieceRect(p.def, prims, p.def.base - 10);
      this.decals.push({ def: p.def, key: p.def.key + '-d', img: null, sig: '', want: '', ox: r.ox, oy: r.oy, w: r.w, h: r.h + 4 });
    }
    this.refreshDamage(state, true);
    for (const lineId of this.byLine.keys()) this.sceneDirty.add(lineId);
  }

  sig(p: PieceRT): string {
    return `${p.level}|${p.collapsedSig}`;
  }

  private sectionCollapsed(state: GameState, sec: SectionId | null): Set<TowerSpec> {
    if (!sec) return new Set();
    const s = state.sections[sec];
    if (!s) return new Set();
    const towers = sectionTowers(sec);
    const idx = new Set(collapsedTowers(s));
    return new Set(towers.filter((t) => idx.has(t.index)));
  }

  /** Has any section's wall state changed since the last refresh? (no allocations) */
  private sectionsChanged(state: GameState): boolean {
    let i = 0;
    let changed = false;
    const fp = this.fp;
    for (const id in state.sections) {
      const s = state.sections[id];
      const a = s.outer;
      const b = s.inner;
      const c = s.towersDown;
      const d = moatStep(s.moatFill);
      if (fp[i] !== a || fp[i + 1] !== b || fp[i + 2] !== c || fp[i + 3] !== d) {
        fp[i] = a;
        fp[i + 1] = b;
        fp[i + 2] = c;
        fp[i + 3] = d;
        changed = true;
      }
      i += 4;
    }
    if (fp.length !== i) {
      fp.length = i;
      changed = true;
    }
    return changed;
  }

  /** Recompute levels; changed pieces (and neighbours) need new textures. */
  private refreshDamage(state: GameState, initial = false): void {
    if (!this.sectionsChanged(state) && !initial) return;
    this.collapsedBySec.clear();
    for (const sec of Object.keys(SPANS)) this.collapsedBySec.set(sec, this.sectionCollapsed(state, sec));
    for (const p of this.pieces) {
      const lvl = pieceLevel(state, p.def);
      const col = this.collapsedBySec.get(p.def.sec ?? '') ?? new Set<TowerSpec>();
      const csig = p.def.towers.map((t) => (col.has(t) ? 1 : 0)).join('');
      if (lvl !== p.level || csig !== p.collapsedSig) {
        const worse = lvl > p.level || csig > p.collapsedSig;
        const newly = p.def.towers.filter((t, i) => col.has(t) && p.collapsedSig[i] !== '1');
        const old = p.level;
        p.level = lvl;
        p.collapsedSig = csig;
        this.version++;
        if (!initial) {
          if (worse) {
            this.onCrumble?.(p.def, lvl, old, newly);
            p.shake = 0.32;
          }
          this.sceneDirty.add(p.def.line);
          this.touchAround(p);
          this.dirtyAny = true;
        }
      }
    }
    for (const d of this.decals) {
      const s = d.def.sec ? state.sections[d.def.sec] : null;
      const want = `${this.pieces[d.def.idx]?.level ?? 0}|${moatStep(s ? s.moatFill : 0)}`;
      if (want !== d.want) this.dirtyAny = true;
      d.want = want;
    }
  }

  /** neighbours' occlusion changes too: force a re-render of nearby pieces */
  private touchAround(p: PieceRT): void {
    for (const q of this.byLine.get(p.def.line) ?? []) {
      if (q === p || q.def.t1 < p.def.t0 - 0.9 || q.def.t0 > p.def.t1 + 0.9) continue;
      q.shown = q.shown ? q.shown + '*' : '';
    }
  }

  private buildScene(lineId: LineId): void {
    const sc = new Scene();
    for (const p of this.byLine.get(lineId) ?? []) {
      const dmg: PieceDamage = { level: p.level, collapsed: this.collapsedBySec.get(p.def.sec ?? '') ?? new Set() };
      for (const pr of piecePrims(p.def, dmg, false)) sc.add(pr);
    }
    sc.build();
    this.scenes.set(lineId, sc);
  }

  private uploadCanvas(key: string, cv: PixelCanvas, sig: string): void {
    const tm = this.rc.scene.textures;
    let tex = tm.exists(key) ? (tm.get(key) as Phaser.Textures.CanvasTexture) : null;
    if (tex && (!(tex instanceof Phaser.Textures.CanvasTexture) || tex.width !== cv.w || tex.height !== cv.h)) {
      tm.remove(key);
      tex = null;
    }
    if (!tex) tex = tm.createCanvas(key, cv.w, cv.h)!;
    const ctx = tex.getContext();
    const img = ctx.createImageData(cv.w, cv.h);
    img.data.set(cv.data);
    ctx.putImageData(img, 0, 0);
    tex.refresh();
    // our own opacity mask (Phaser's cached pixel data is not refreshed by refresh())
    const alpha = new Uint8Array(cv.w * cv.h);
    for (let i = 0, n = cv.w * cv.h; i < n; i++) alpha[i] = cv.data[i * 4 + 3] >= 250 ? 1 : 0;
    const tagged = tex as unknown as { fortSig: string; fortAlpha: Uint8Array };
    tagged.fortSig = sig;
    tagged.fortAlpha = alpha;
  }

  /** Opacity mask (1 = solid) of a fortifications canvas texture, row-major w×h. */
  alphaOf(key: string): Uint8Array | null {
    const tm = this.rc.scene.textures;
    if (!tm.exists(key)) return null;
    return (tm.get(key) as unknown as { fortAlpha?: Uint8Array }).fortAlpha ?? null;
  }

  private texSig(key: string): string | null {
    const tm = this.rc.scene.textures;
    if (!tm.exists(key)) return null;
    return ((tm.get(key) as unknown as { fortSig?: string }).fortSig as string) ?? null;
  }

  private ensureImage(p: PieceRT): void {
    if (!p.img) p.img = this.rc.scene.add.image(p.def.ox, p.def.oy, p.def.key).setOrigin(0, 0).setDepth(p.def.depth);
    else p.img.setTexture(p.def.key);
  }

  private renderPieceTex(p: PieceRT): void {
    const sc = this.scenes.get(p.def.line);
    if (!sc) return;
    const t0 = performance.now();
    const out = renderPiece(sc, p.def, this.gf);
    const sig = this.sig(p);
    this.uploadCanvas(p.def.key, out.canvas, sig);
    this.texVersion++;
    p.shown = sig;
    this.ensureImage(p);
    this.renderMs += performance.now() - t0;
  }

  private renderDecal(d: DecalRT, state: GameState): void {
    const s = d.def.sec ? state.sections[d.def.sec] : null;
    const moat = moatStep(s ? s.moatFill : 0);
    const lvl = this.pieces[d.def.idx]?.level ?? 0;
    const sig = d.want;
    if (this.texSig(d.key) !== sig) {
      const sc = new Scene();
      for (const pr of decalPrims(d.def, lvl, moat, this.gf)) sc.add(pr);
      const out = renderScene(sc, {
        w: d.w,
        h: d.h,
        px0: PROJ_OX - d.ox,
        py0: PROJ_OY - d.oy,
        own: () => true,
        ground: this.gf,
        skirt: 0,
        edges: false,
      });
      this.uploadCanvas(d.key, out.canvas, sig);
    }
    d.sig = sig;
    if (!d.img) d.img = this.rc.scene.add.image(d.ox, d.oy, d.key).setOrigin(0, 0).setDepth(DEPTH.GROUND_DECAL + 5);
    else d.img.setTexture(d.key);
  }

  /** Per-frame: damage checks (throttled), progressive re-render, culling, crumble shake. */
  update(state: GameState, dt: number, view: Phaser.Geom.Rectangle): void {
    this.checkAcc += dt;
    if (this.checkAcc > 0.2) {
      this.checkAcc = 0;
      if (!this.first) this.refreshDamage(state);
    }
    if (this.sceneDirty.size) {
      for (const l of this.sceneDirty) this.buildScene(l);
      this.sceneDirty.clear();
    }
    // fast path: every texture is current and nothing changed → only cull/shake
    if (this.allDone && !this.dirtyAny) {
      this.cull(dt, view);
      this.first = false;
      return;
    }
    // which pieces need a texture?
    const near = this.nearRect.setTo(view.x - view.width * 0.5, view.y - view.height * 0.5, view.width * 2, view.height * 2);
    const todo: PieceRT[] = [];
    this.dirtyAny = false;
    for (const p of this.pieces) {
      const want = this.sig(p);
      if (p.shown === want) continue;
      if (!p.shown && this.texSig(p.def.key) === want) {
        // texture from a previous scene with the same damage: reuse it
        p.shown = want;
        this.ensureImage(p);
        continue;
      }
      todo.push(p);
    }
    if (todo.length) {
      const cx = view.centerX;
      const cy = view.centerY;
      const vis = (p: PieceRT) => this.inView(p.def, view);
      todo.sort((a, b) => {
        const va = vis(a) ? 0 : 1;
        const vb = vis(b) ? 0 : 1;
        if (va !== vb) return va - vb;
        return Math.hypot(a.def.wx - cx, a.def.wy - cy) - Math.hypot(b.def.wx - cx, b.def.wy - cy);
      });
      const start = performance.now();
      // first frame: everything in view synchronously; then a time budget
      this.age += dt;
      // first frame: everything in view; while loading a generous budget; later ONE piece
      // per frame (≈4–8 ms each) so a crumbling section never costs more than a frame's slack
      const budget = this.first ? 900 : this.age < 4 ? 14 : 0;
      let done = 0;
      for (const p of todo) {
        const isVis = vis(p);
        if (!this.first && isVis && p.shake > 0.04) continue; // let the crumble shake play
        if (this.first && !isVis && !this.inView(p.def, near)) break;
        if (!this.first && done > 0 && performance.now() - start > budget) break;
        if (this.first && !isVis && performance.now() - start > budget) break;
        this.renderPieceTex(p);
        done++;
      }
    }
    // decals
    let dn = this.first ? 999 : 2;
    for (const d of this.decals) {
      if (d.sig === d.want && d.img) continue;
      if (!this.first && !this.inView(d, near) && dn < 3) continue;
      if (dn-- <= 0) break;
      this.renderDecal(d, state);
    }
    this.first = false;
    this.allDone = todo.length === 0 && this.decals.every((d) => d.sig === d.want && d.img);
    this.cull(dt, view);
  }

  private cull(dt: number, view: Phaser.Geom.Rectangle): void {
    // culling + crumble shake
    for (const p of this.pieces) {
      if (!p.img) continue;
      const vis = this.inView(p.def, view);
      if (p.img.visible !== vis) p.img.setVisible(vis);
      if (p.shake > 0) {
        p.shake -= dt;
        const k = Math.max(0, p.shake);
        p.img.x = p.def.ox + Math.round(Math.sin(k * 80) * Math.min(1, k * 5));
        if (p.shake <= 0) p.img.x = p.def.ox;
      }
    }
    for (const d of this.decals) {
      if (!d.img) continue;
      const vis = this.inView(d, view);
      if (d.img.visible !== vis) d.img.setVisible(vis);
    }
  }

  inView(d: { ox: number; oy: number; w: number; h: number }, view: Phaser.Geom.Rectangle): boolean {
    return d.ox < view.right + 8 && d.ox + d.w > view.x - 8 && d.oy < view.bottom + 8 && d.oy + d.h > view.y - 8;
  }

  /** Section under world pixel (pixel-exact on wall pieces: opaque texels only). */
  pick(wx: number, wy: number): { sec: SectionId; piece: PieceDef } | null {
    let best: PieceRT | null = null;
    for (const p of this.pieces) {
      const d = p.def;
      if (!d.sec || !p.img || !p.img.visible) continue;
      const x = Math.floor(wx - d.ox);
      const y = Math.floor(wy - d.oy);
      if (x < 0 || y < 0 || x >= d.w || y >= d.h) continue;
      if (best && d.depth <= best.def.depth) continue;
      const a = this.alphaOf(d.key);
      if (!a || a[y * d.w + x] !== 1) continue;
      best = p;
    }
    return best ? { sec: best.def.sec!, piece: best.def } : null;
  }

  /** Gap (breach) positions of a section's pieces for stockade props. */
  gaps(sec: SectionId): { piece: PieceDef; t: number; w: number }[] {
    const out: { piece: PieceDef; t: number; w: number }[] = [];
    for (const p of this.pieces) {
      if (p.def.sec !== sec) continue;
      const g = gapCenter(p.def, p.level);
      if (g) out.push({ piece: p.def, t: g.t, w: g.w });
    }
    return out;
  }

  levelOf(p: PieceDef): number {
    return this.pieces[p.idx]?.level ?? 0;
  }

  collapsed(sec: SectionId | null): Set<TowerSpec> {
    return this.collapsedBySec.get(sec ?? '') ?? new Set();
  }

  destroy(): void {
    for (const p of this.pieces) p.img?.destroy();
    for (const d of this.decals) d.img?.destroy();
  }
}
