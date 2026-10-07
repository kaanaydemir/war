import type Phaser from 'phaser';
import { sunElevation } from '../../core/calendar';
import { DEPTH } from '../../core/layers';
import type { RenderContext } from '../../core/feature';
import type { GameState } from '../../core/state';
import { PixelCanvas } from '../../art/pixel';
import { lightLevel } from '../atmosphere/api';
import { decorTextureKey } from './art';
import { CHUNK_H, CHUNK_W, ChunkBaker, chunkKey } from './bake';
import { DECOR_SPEC, type DecorItem } from './decor';
import { seasonOf, type Season } from './season';
import type { LoopHandle } from '../../core/fx';
import { createWater, type WaterView } from './water';
import type { WorldData } from './terrain';

/**
 * WORLD RENDER: lazily baked, LRU-evicted terrain chunks (canvas textures at
 * DEPTH.TERRAIN), the animated water plane, and pooled y-sorted decor sprites
 * spawned only for visible chunks, swaying in travelling wind gusts.
 */

interface Chunk {
  cx: number;
  cy: number;
  key: string;
  img: Phaser.GameObjects.Image;
  season: Season | null;
  used: number;
}

interface ActiveDecor {
  item: DecorItem;
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  frames: number;
  base: number;
  sway: number;
  hidden: boolean;
}

interface Job {
  ch: Chunk;
  season: Season;
  col: number;
}

const TEX_PREFIX = 'world/chunk-';
const MIN_RESIDENT = 30;
const SLICE_COLS = 32;
const BG_BUDGET_MS = 4;

export class WorldRender {
  private baker: ChunkBaker;
  private chunks = new Map<number, Chunk>();
  private freeTex: string[] = [];
  private texCount = 0;
  private pc = new PixelCanvas(CHUNK_W, CHUNK_H);
  private imageData: ImageData;
  private job: Job | null = null;
  private frame = 0;
  private season: Season;
  private water: WaterView;
  private time = 0;
  // decor
  private decorByChunk = new Map<number, { item: DecorItem; x: number; y: number }[]>();
  private activeDecor = new Map<number, ActiveDecor[]>();
  private pool: Phaser.GameObjects.Image[] = [];
  private swayAcc = 0;
  private hideKey = '';
  private smoke = new Map<DecorItem, LoopHandle>();

  constructor(
    private rc: RenderContext,
    private world: WorldData,
    decor: DecorItem[],
  ) {
    this.baker = new ChunkBaker(world, decor);
    this.imageData = new ImageData(this.pc.data as Uint8ClampedArray<ArrayBuffer>, CHUNK_W, CHUNK_H);
    const st = rc.getState();
    this.season = seasonOf(st.time.day);
    this.water = createWater(rc.scene, world);
    for (const d of decor) {
      const p = world.toWorld(d.tx, d.ty);
      const sp = DECOR_SPEC[d.kind];
      // bucket by the chunk containing the sprite's foot (sprites extend upward/sideways)
      const k = chunkKey(Math.floor(p.x / CHUNK_W), Math.floor(p.y / CHUNK_H));
      let l = this.decorByChunk.get(k);
      if (!l) this.decorByChunk.set(k, (l = []));
      l.push({ item: d, x: Math.round(p.x), y: Math.round(p.y) });
      void sp;
    }
    rc.scene.events.once('shutdown', () => this.destroy());
  }

  private allocTex(): string {
    const free = this.freeTex.pop();
    if (free) return free;
    const key = TEX_PREFIX + this.texCount++;
    const tm = this.rc.scene.textures;
    if (!tm.exists(key)) tm.createCanvas(key, CHUNK_W, CHUNK_H);
    return key;
  }

  private upload(ch: Chunk): void {
    const tex = this.rc.scene.textures.get(ch.key) as Phaser.Textures.CanvasTexture;
    tex.context.putImageData(this.imageData, 0, 0);
    tex.refresh();
  }

  private bakeNow(ch: Chunk, season: Season): void {
    if (this.job) this.job = null; // shared scratch: abandon the background job
    this.baker.bake(ch.cx, ch.cy, season, this.pc.data);
    this.upload(ch);
    ch.season = season;
  }

  private ensureChunk(cx: number, cy: number): Chunk {
    const k = chunkKey(cx, cy);
    let ch = this.chunks.get(k);
    if (!ch) {
      const key = this.allocTex();
      const img = this.rc.scene.add.image(cx * CHUNK_W, cy * CHUNK_H, key).setOrigin(0, 0).setDepth(DEPTH.TERRAIN).setVisible(false);
      ch = { cx, cy, key, img, season: null, used: this.frame };
      this.chunks.set(k, ch);
    }
    return ch;
  }

  private evict(keep: Set<number>, cap: number): void {
    if (this.chunks.size <= cap) return;
    const list = [...this.chunks.entries()].filter(([k]) => !keep.has(k)).sort((a, b) => a[1].used - b[1].used);
    for (const [k, ch] of list) {
      if (this.chunks.size <= cap) break;
      if (this.job?.ch === ch) this.job = null;
      ch.img.destroy();
      this.freeTex.push(ch.key);
      this.chunks.delete(k);
    }
  }

  update(state: GameState, dt: number): void {
    this.frame++;
    this.time += dt;
    const cam = this.rc.scene.cameras.main;
    const v = cam.worldView;
    const season = seasonOf(state.time.day);
    const seasonChanged = season !== this.season;
    this.season = season;

    // ── terrain chunks ──
    const cx0 = Math.floor((v.x - 2) / CHUNK_W);
    const cx1 = Math.floor((v.right + 2) / CHUNK_W);
    const cy0 = Math.floor((v.y - 2) / CHUNK_H);
    const cy1 = Math.floor((v.bottom + 2) / CHUNK_H);
    const visible = new Set<number>();
    let syncBudget = 5;
    for (let cy = cy0; cy <= cy1; cy++)
      for (let cx = cx0; cx <= cx1; cx++) {
        if (cx < 0 || cy < 0 || cx * CHUNK_W > 8192 || cy * CHUNK_H > 4096) continue;
        visible.add(chunkKey(cx, cy));
        const ch = this.ensureChunk(cx, cy);
        ch.used = this.frame;
        if (ch.season === null && (this.frame <= 2 || syncBudget-- > 0)) this.bakeNow(ch, season); // never show holes
        else if (ch.season === null) continue;
        ch.img.setVisible(true);
      }
    for (const [k, ch] of this.chunks) if (!visible.has(k)) ch.img.setVisible(false);

    // background work: stale (season) visible chunks first, then the 1-chunk prefetch ring
    const t0 = performance.now();
    if (!this.job) {
      let next: Chunk | null = null;
      for (const k of visible) {
        const ch = this.chunks.get(k)!;
        if (ch.season !== season) {
          next = ch;
          break;
        }
      }
      if (!next) {
        outer: for (let cy = cy0 - 1; cy <= cy1 + 1; cy++)
          for (let cx = cx0 - 1; cx <= cx1 + 1; cx++) {
            if (cx < 0 || cy < 0 || cx * CHUNK_W > 8192 || cy * CHUNK_H > 4096) continue;
            const k = chunkKey(cx, cy);
            if (visible.has(k)) continue;
            const ch = this.chunks.get(k);
            if (ch && ch.season === season) continue;
            if (!ch && this.chunks.size >= Math.max(MIN_RESIDENT, visible.size + 12)) continue;
            next = this.ensureChunk(cx, cy);
            break outer;
          }
      }
      if (next) {
        this.job = { ch: next, season, col: 0 };
        this.baker.begin();
      }
    }
    while (this.job && performance.now() - t0 < BG_BUDGET_MS) {
      const j = this.job;
      const c1 = Math.min(CHUNK_W, j.col + SLICE_COLS);
      this.baker.columns(j.ch.cx, j.ch.cy, j.season, j.col, c1);
      j.col = c1;
      if (j.col >= CHUNK_W) {
        this.baker.finish(j.ch.cx, j.ch.cy, j.season, this.pc.data);
        this.upload(j.ch);
        j.ch.season = j.season;
        j.ch.used = this.frame;
        this.job = null;
      }
    }
    // keep everything around the view; evict least recently used beyond the cap
    const keep = new Set(visible);
    for (let cy = cy0 - 1; cy <= cy1 + 1; cy++) for (let cx = cx0 - 1; cx <= cx1 + 1; cx++) keep.add(chunkKey(cx, cy));
    this.evict(keep, Math.max(MIN_RESIDENT, visible.size + 12));

    // ── water ──
    const light = lightLevel(state);
    const e = sunElevation(state.time.day);
    const dusk = state.time.phase === 'hazirlik' ? 0 : Math.max(0, 1 - Math.abs(e + 0.12) / 0.38);
    this.water.setUniforms(this.time, light, dusk, season === 'kis' ? 1 : 0);

    // ── decor ──
    this.updateDecor(state, dt, seasonChanged, light);
  }

  private hiddenAt(state: GameState, it: DecorItem): boolean {
    if (it.kind === 'tinaz' && (this.season === 'ilkbahar' || this.season === 'kis')) return true;
    const tx = Math.round(it.tx);
    const ty = Math.round(it.ty);
    if (!isFinite(this.world.moveCost(tx, ty, 'land')) && !this.world.isWater(tx, ty)) return true;
    for (const b of state.buildings) if (Math.abs(b.tx - it.tx) < 2.2 && Math.abs(b.ty - it.ty) < 2.2) return true;
    for (const c of state.cannons) if (Math.abs(c.tx - it.tx) < 1.4 && Math.abs(c.ty - it.ty) < 1.4) return true;
    return false;
  }

  private updateDecor(state: GameState, dt: number, seasonChanged: boolean, light: number): void {
    const cam = this.rc.scene.cameras.main;
    const v = cam.worldView;
    const M = 48;
    const cx0 = Math.floor((v.x - M) / CHUNK_W);
    const cx1 = Math.floor((v.right + M) / CHUNK_W);
    const cy0 = Math.floor((v.y - M) / CHUNK_H);
    const cy1 = Math.floor((v.bottom + M + 40) / CHUNK_H);
    const want = new Set<number>();
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) want.add(chunkKey(cx, cy));

    const hk = `${state.buildings.length}:${state.cannons.length}:${this.world.blockedVersion}:${this.season}`;
    const rehide = hk !== this.hideKey;
    this.hideKey = hk;

    // release chunks out of view
    for (const [k, list] of this.activeDecor) {
      if (want.has(k)) continue;
      for (const a of list) {
        a.img.setVisible(false);
        this.pool.push(a.img);
        const sm = this.smoke.get(a.item);
        if (sm) {
          sm.destroy();
          this.smoke.delete(a.item);
        }
      }
      this.activeDecor.delete(k);
    }
    // acquire newly visible chunks
    for (const k of want) {
      if (this.activeDecor.has(k)) continue;
      const items = this.decorByChunk.get(k) ?? [];
      const list: ActiveDecor[] = [];
      for (const d of items) {
        const sp = DECOR_SPEC[d.item.kind];
        const img = this.pool.pop() ?? this.rc.scene.add.image(0, 0, '__DEFAULT');
        const variant = d.item.variant % sp.variants;
        img.setTexture(decorTextureKey(d.item.kind, this.season), variant * sp.frames);
        img.setOrigin(sp.fx / sp.w, sp.fy / sp.h);
        img.setPosition(d.x, d.y);
        img.setDepth(d.y);
        const a: ActiveDecor = { item: d.item, img, x: d.x, y: d.y, frames: sp.frames, base: variant * sp.frames, sway: -1, hidden: false };
        a.hidden = this.hiddenAt(state, d.item);
        img.setVisible(!a.hidden);
        list.push(a);
      }
      this.activeDecor.set(k, list);
    }
    if (seasonChanged || rehide) {
      for (const list of this.activeDecor.values())
        for (const a of list) {
          if (seasonChanged) a.img.setTexture(decorTextureKey(a.item.kind, this.season), a.base);
          a.hidden = this.hiddenAt(state, a.item);
          a.img.setVisible(!a.hidden);
          a.sway = -1;
        }
    }

    // wind: gusts travel across the land as a wave; frames 0 rest · 1 lean · 2 strong · 3 recoil
    this.swayAcc += dt;
    if (this.swayAcc >= 0.09) {
      this.swayAcc = 0;
      const t = this.time;
      const gustBase = 0.55 + 0.45 * Math.sin(t * 0.21) * Math.sin(t * 0.077 + 1.3);
      for (const list of this.activeDecor.values())
        for (const a of list) {
          if (a.frames < 2 || a.hidden) continue;
          const wave = Math.sin(t * 2.1 - a.x * 0.011 - a.y * 0.017 + a.item.phase * 0.35);
          const gust = Math.sin(t * 0.6 - a.x * 0.0035 + a.y * 0.002);
          const s = wave * (0.45 + 0.55 * Math.max(0, gust)) * gustBase;
          let f = s > 0.62 ? 2 : s > 0.22 ? 1 : s < -0.42 ? 3 : 0;
          if (a.frames === 2) f = f === 0 || f === 3 ? 0 : 1;
          if (f !== a.sway) {
            a.sway = f;
            a.img.setFrame(a.base + f);
          }
        }
    }

    // chimney smoke from visible farmhouses (cold season or evening)
    const wantSmoke = this.season === 'kis' || this.season === 'sonbahar' || light < 0.75;
    let n = this.smoke.size;
    for (const list of this.activeDecor.values())
      for (const a of list) {
        if (a.item.kind !== 'ev') continue;
        const has = this.smoke.get(a.item);
        if (has && (!wantSmoke || a.hidden)) {
          has.destroy();
          this.smoke.delete(a.item);
          n--;
        } else if (!has && wantSmoke && !a.hidden && n < 8) {
          this.smoke.set(a.item, this.rc.fx.smokeColumn(a.x + 3, a.y - 21, 0.5));
          n++;
        }
      }
  }

  destroy(): void {
    for (const sm of this.smoke.values()) sm.destroy();
    this.smoke.clear();
    this.water.destroy();
    this.chunks.clear();
    this.activeDecor.clear();
    this.pool = [];
  }
}
