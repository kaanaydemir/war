import type Phaser from 'phaser';
import type { RenderContext } from '../../core/feature';
import type { LightHandle, LoopHandle } from '../../core/fx';
import type { GameState } from '../../core/state';
import { buildingCenterTile, buildingsOf, hisarBuilding, occupiedTiles } from './api';
import { h01 } from './artKit';
import type { TentKind } from './artTents';
import { econ } from './econState';
import { hisarPoint } from './artHisar';
import { pointAlong } from './sim';
import { inView, playDesync, SpritePool, type ViewRect } from './renderUtil';

interface Mover {
  pts: [number, number][];
  d: number;
  dir: 1 | -1;
  speed: number;
  len: number;
}

interface DecorItem {
  key: string;
  anim?: string;
  x: number;
  y: number;
  depth: number;
  flip: boolean;
  seed: number;
  ox: number;
  oy: number;
  fire?: boolean;
  lantern?: boolean;
  mover?: Mover;
  sprite: Phaser.GameObjects.Sprite | null;
  loop: LoopHandle | null;
  light: LightHandle | null;
}

const WING_TENTS: Record<string, [TentKind, number][]> = {
  merkez: [['konik-kirmizi', 3], ['sirt-beyaz', 2], ['konik-beyaz-kirmizi', 3], ['sirt-cizgili', 1]],
  karaca: [['konik-beyaz-kirmizi', 3], ['sirt-beyaz', 3], ['kucuk-bez', 3], ['konik-kirmizi', 1]],
  ishak: [['konik-beyaz-yesil', 3], ['sirt-yesil', 3], ['konik-yesil', 2], ['kucuk-bez', 2]],
  zaganos: [['konik-beyaz-kirmizi', 2], ['sirt-yesil', 2], ['konik-beyaz-yesil', 2], ['kucuk-bez', 2]],
  hisar: [['sirt-beyaz', 3], ['kucuk-bez', 3], ['konik-beyaz-kirmizi', 1]],
};
const WING_FLAGS: Record<string, string[]> = {
  merkez: ['kirmizi', 'kirmizi', 'yesil'],
  karaca: ['kirmizi', 'beyaz'],
  ishak: ['yesil', 'beyaz'],
  zaganos: ['beyaz', 'yesil'],
  hisar: ['kirmizi'],
};

function pickWeighted<T>(list: [T, number][], r: number): T {
  const total = list.reduce((a, [, w]) => a + w, 0);
  let x = r * total;
  for (const [v, w] of list) {
    x -= w;
    if (x <= 0) return v;
  }
  return list[list.length - 1][0];
}

function moverLen(pts: [number, number][]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return l;
}

/** Ottoman camp & work-camp decor: hundreds of tents, fires, flags, horses, stalls and walkers (culled & pooled). */
export class Decor {
  items: DecorItem[] = [];
  private sig = '';
  private fires = 0;
  private smokes = 0;
  private lights = 0;
  private time = 0;
  private wasNight = false;

  constructor(
    private rc: RenderContext,
    private pool: SpritePool,
  ) {}

  private signature(state: GameState): string {
    const h = hisarBuilding(state);
    let s = `${h ? h.id : 0}:${h?.built ? 1 : 0}`;
    for (const b of state.buildings) if (b.type === 'ordugah-cadirlari' || b.type === 'otag') s += `,${b.id}`;
    return s;
  }

  rebuild(state: GameState): void {
    const sig = this.signature(state);
    if (sig === this.sig) return;
    this.sig = sig;
    this.clear();
    const world = this.rc.world;
    const occ0 = occupiedTiles(state);
    // keep decor one tile clear of every building footprint
    const occ = new Set<number>();
    for (const k of occ0) {
      const x = k % 4096;
      const y = Math.floor(k / 4096);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) occ.add((y + dy) * 4096 + x + dx);
    }
    const taken: [number, number][] = [];
    const ok = (tx: number, ty: number, spacing: number): boolean => {
      const ix = Math.floor(tx);
      const iy = Math.floor(ty);
      if (!world.inBounds(ix, iy) || world.isWater(ix, iy)) return false;
      const ter = world.terrainAt(ix, iy);
      if (ter === 'sur' || ter === 'hendek' || ter === 'sehir' || ter === 'yol' || ter === 'orman') return false;
      const reg = world.regionAt(ix, iy);
      if (reg === 'sur-ici' || reg === 'galata') return false;
      if (occ.has(iy * 4096 + ix)) return false;
      for (const [x, y] of taken) if (Math.abs(x - tx) < spacing && Math.abs(y - ty) < spacing && Math.hypot(x - tx, y - ty) < spacing) return false;
      return true;
    };
    const add = (tx: number, ty: number, item: Omit<DecorItem, 'x' | 'y' | 'depth' | 'sprite' | 'loop' | 'light'>) => {
      const w = world.toWorld(tx, ty);
      this.items.push({ ...item, x: Math.round(w.x), y: Math.round(w.y), depth: w.y, sprite: null, loop: null, light: null });
      taken.push([tx, ty]);
    };
    const tentField = (cx: number, cy: number, wing: string, seed: number, count: number, rMin: number, rMax: number) => {
      const kinds = WING_TENTS[wing] ?? WING_TENTS.karaca;
      let placed = 0;
      for (let k = 0; k < count * 3 && placed < count; k++) {
        const a = h01(seed, k, 1) * Math.PI * 2;
        const r = rMin + h01(seed, k, 2) * (rMax - rMin);
        const tx = cx + Math.cos(a) * r;
        const ty = cy + Math.sin(a) * r;
        if (!ok(tx, ty, 1.05)) continue;
        const kind = pickWeighted(kinds, h01(seed, k, 3));
        add(tx, ty, { key: `econ/cadir-${kind}`, anim: `econ/cadir-${kind}:flap`, flip: false, seed: h01(seed, k, 4), ox: 0.5, oy: 26 / 32 });
        placed++;
      }
      // campfires & banners
      for (let k = 0; k < 4; k++) {
        const a = h01(seed, k, 9) * Math.PI * 2;
        const r = 0.8 + h01(seed, k, 8) * (rMax - 0.8);
        const tx = cx + Math.cos(a) * r;
        const ty = cy + Math.sin(a) * r;
        if (!ok(tx, ty, 0.7)) continue;
        if (k < 3) add(tx, ty, { key: 'econ/ates', anim: 'econ/ates:burn', flip: false, seed: h01(seed, k, 7), ox: 0.5, oy: 14 / 16, fire: true });
        else {
          const flags = WING_FLAGS[wing] ?? WING_FLAGS.karaca;
          const c = flags[Math.floor(h01(seed, k, 6) * flags.length)];
          add(tx, ty, { key: `econ/sancak-${c}`, anim: `econ/sancak-${c}:wave`, flip: false, seed: h01(seed, k, 5), ox: 2.5 / 16, oy: 1 });
        }
      }
    };

    // ── siege camp ──
    const fields = buildingsOf(state, 'ordugah-cadirlari');
    fields.forEach((b, i) => {
      const c = buildingCenterTile(b);
      const wing = String(b.data.wing ?? 'karaca');
      tentField(c.tx, c.ty, wing, b.id * 13 + 7, wing === 'merkez' ? 12 : 11, 1.7, 4.2);
      // horse lines on the wings
      if ((wing === 'karaca' || wing === 'ishak') && i % 2 === 0) {
        const tx0 = c.tx - 3.5;
        const ty0 = c.ty + 2.5;
        for (let k = 0; k < 5; k++) {
          const tx = tx0 + k * 0.55;
          const ty = ty0 - k * 0.1;
          if (!ok(tx, ty, 0.45)) continue;
          add(tx, ty, { key: `econ/at-${(b.id + k) % 4}`, anim: `econ/at-${(b.id + k) % 4}:idle`, flip: k % 2 === 1, seed: h01(b.id, k, 11), ox: 0.5, oy: 16 / 18 });
        }
      }
      // water carriers walking between the tents
      if (i % 2 === 1) {
        const pts: [number, number][] = [];
        for (let k = 0; k < 3; k++) {
          const a = h01(b.id, k, 21) * Math.PI * 2;
          const w = world.toWorld(c.tx + Math.cos(a) * 3, c.ty + Math.sin(a) * 3);
          pts.push([w.x, w.y]);
        }
        const w0 = world.toWorld(c.tx, c.ty);
        pts.splice(1, 0, [w0.x, w0.y + 10]);
        this.items.push({
          key: 'econ/saka',
          anim: 'econ/saka:walk',
          x: pts[0][0],
          y: pts[0][1],
          depth: pts[0][1],
          flip: false,
          seed: h01(b.id, 3, 5),
          ox: 0.5,
          oy: 18 / 20,
          mover: { pts, d: 0, dir: 1, speed: 9, len: moverLen(pts) },
          sprite: null,
          loop: null,
          light: null,
        });
      }
    });
    // ── around the otağ: tuğ standards, guards, market ──
    const otag = buildingsOf(state, 'otag')[0];
    if (otag) {
      const c = buildingCenterTile(otag);
      const front = [[c.tx + 0.6, c.ty + 2.4], [c.tx + 1.2, c.ty + 2.3], [c.tx + 1.8, c.ty + 2.2]];
      for (const [tx, ty] of front) if (ok(tx, ty, 0.3)) add(tx, ty, { key: 'econ/tug', anim: 'econ/tug:wave', flip: false, seed: tx % 1, ox: 0.5, oy: 1 });
      for (const [tx, ty, f] of [[c.tx - 1.0, c.ty + 2.4, false], [c.tx - 0.2, c.ty + 2.6, true], [c.tx - 2.3, c.ty + 1.0, false], [c.tx + 2.4, c.ty - 0.6, true]] as const)
        if (ok(tx, ty, 0.3)) add(tx, ty, { key: 'econ/nobetci', anim: 'econ/nobetci:idle', flip: f, seed: ty % 1, ox: 0.5, oy: 18 / 20, lantern: true });
      // ordu pazarı — market stalls west of the otağ
      for (let k = 0; k < 4; k++) {
        const tx = c.tx - 5.5 - (k % 2) * 1.6;
        const ty = c.ty - 1.5 + Math.floor(k / 2) * 1.8;
        if (ok(tx, ty, 1)) add(tx, ty, { key: `econ/pazar-${k % 3}`, anim: `econ/pazar-${k % 3}:idle`, flip: k % 2 === 1, seed: k * 0.27, ox: 15 / 28, oy: 22 / 26 });
      }
    }
    // ── Rumeli Hisarı workers' camp (on the slope south-west of the site) ──
    const h = hisarBuilding(state);
    if (h) {
      const c = buildingCenterTile(h);
      const ax = Math.floor(c.tx);
      const ay = Math.floor(c.ty);
      const aw = world.toWorld(ax, ay);
      const spots: [number, number][] = [[-150, -30], [-136, -48], [-160, -6], [-176, -22], [-126, -66], [-170, -50], [-148, 6]];
      spots.forEach(([gx, gy], k) => {
        const hp = hisarPoint(0, 0, 0);
        const t = world.toTile(aw.x + gx + hp.x, aw.y + gy);
        if (!ok(t.tx, t.ty, 0.9)) return;
        const kinds = WING_TENTS.hisar;
        const kind = pickWeighted(kinds, h01(k, 5, 5));
        add(t.tx, t.ty, { key: `econ/cadir-${kind}`, anim: `econ/cadir-${kind}:flap`, flip: false, seed: h01(k, 2, 2), ox: 0.5, oy: 26 / 32 });
      });
      for (const [gx, gy] of [[-142, -16], [-164, -36]]) {
        const t = world.toTile(aw.x + gx, aw.y + gy);
        if (ok(t.tx, t.ty, 0.5)) add(t.tx, t.ty, { key: 'econ/ates', anim: 'econ/ates:burn', flip: false, seed: gx * 0.01, ox: 0.5, oy: 14 / 16, fire: true });
      }
      const t = world.toTile(aw.x - 128, aw.y - 30);
      if (ok(t.tx, t.ty, 0.3)) add(t.tx, t.ty, { key: 'econ/sancak-kirmizi', anim: 'econ/sancak-kirmizi:wave', flip: false, seed: 0.3, ox: 2.5 / 16, oy: 1 });
    }
  }

  update(state: GameState, dt: number, view: ViewRect, opts: { night: boolean; running: boolean; speed: number }): void {
    this.rebuild(state);
    const fx = this.rc.fx;
    if (opts.night !== this.wasNight) {
      this.wasNight = opts.night;
      for (const it of this.items) this.dropFx(it);
    }
    this.fires = 0;
    this.smokes = 0;
    this.lights = 0;
    this.time += dt;
    for (const it of this.items) {
      if (it.mover && opts.running) {
        const m = it.mover;
        m.d += m.dir * m.speed * dt * opts.speed;
        if (m.d >= m.len) {
          m.d = m.len;
          m.dir = -1;
        } else if (m.d <= 0) {
          m.d = 0;
          m.dir = 1;
        }
        let d = m.d;
        for (let i = 1; i < m.pts.length; i++) {
          const [x0, y0] = m.pts[i - 1];
          const [x1, y1] = m.pts[i];
          const l = Math.hypot(x1 - x0, y1 - y0);
          if (d <= l || i === m.pts.length - 1) {
            const t = l > 0 ? Math.min(1, d / l) : 0;
            it.x = Math.round(x0 + (x1 - x0) * t);
            it.y = Math.round(y0 + (y1 - y0) * t);
            it.depth = it.y;
            it.flip = (x1 - x0) * m.dir < 0;
            break;
          }
          d -= l;
        }
      }
      const vis = inView(view, it.x, it.y, 40);
      if (vis && !it.sprite) {
        const s = this.pool.acquire(it.key, 0);
        s.setOrigin(it.ox, it.oy);
        s.setPosition(it.x, it.y).setDepth(it.depth).setFlipX(it.flip);
        it.sprite = s;
        if (it.anim) playDesync(s, it.anim, it.seed);
      } else if (!vis && it.sprite) {
        this.pool.release(it.sprite);
        it.sprite = null;
        this.dropFx(it);
      }
      if (!it.sprite) continue;
      const s = it.sprite;
      if (it.mover) {
        if (s.x !== it.x || s.y !== it.y) s.setPosition(it.x, it.y).setDepth(it.depth);
        if (s.flipX !== it.flip) s.setFlipX(it.flip);
        if (opts.running && !s.anims.isPlaying) playDesync(s, it.anim!, it.seed);
        if (!opts.running && s.anims.isPlaying) s.anims.stop();
      }
      if (it.fire) {
        if (opts.night) {
          if (!it.loop && this.fires < 16) it.loop = fx.fire(it.x, it.y - 4, 0.5);
          if (it.loop) this.fires++;
          if (!it.light && this.lights < 24) it.light = fx.light(it.x, it.y - 5, 0xff9a40, 34 + Math.round(it.seed * 10), 1.1);
          if (it.light) {
            this.lights++;
            it.light.setIntensity(0.95 + 0.25 * Math.sin(this.time * 9 + it.seed * 20) * Math.sin(this.time * 3.3 + it.seed * 7));
          }
        } else {
          if (!it.loop && this.smokes < 5 && it.seed < 0.6) it.loop = fx.smokeColumn(it.x, it.y - 6, 0.45);
          if (it.loop) this.smokes++;
        }
      }
      if (it.lantern && opts.night && !it.light) it.light = fx.light(it.x + 3, it.y - 12, 0xffb45a, 30, 0.9);
      if (it.light && !opts.night) {
        it.light.destroy();
        it.light = null;
      }
    }
  }

  private dropFx(it: DecorItem): void {
    it.loop?.destroy();
    it.loop = null;
    it.light?.destroy();
    it.light = null;
  }

  clear(): void {
    for (const it of this.items) {
      if (it.sprite) this.pool.release(it.sprite);
      this.dropFx(it);
    }
    this.items = [];
  }
}

// ───────────────────────────── caravans ─────────────────────────────

interface Member {
  key: string;
  spacing: number;
  oy: number;
  sprite: Phaser.GameObjects.Sprite | null;
}

interface CaravanSprites {
  shown: number;
  members: Member[];
  lastX: number;
  lastY: number;
  dustT: number;
}

const MEMBER: Record<string, { spacing: number; oy: number }> = {
  'econ/kagni-cuval': { spacing: 1.7, oy: 25 / 28 },
  'econ/kagni-tas': { spacing: 1.7, oy: 25 / 28 },
  'econ/kagni-hazine': { spacing: 1.7, oy: 25 / 28 },
  'econ/kagni-kereste': { spacing: 1.7, oy: 25 / 28 },
  'econ/deve': { spacing: 1.2, oy: 23 / 26 },
  'econ/katir': { spacing: 0.9, oy: 15 / 18 },
  'econ/surucu': { spacing: 0.6, oy: 18 / 20 },
  'econ/yeniceri-yuru': { spacing: 0.6, oy: 18 / 20 },
  'econ/amele-yuru': { spacing: 0.5, oy: 18 / 20 },
  'econ/amele2-yuru': { spacing: 0.5, oy: 18 / 20 },
};

function composition(kind: string, size: number, seed: number): string[] {
  switch (kind) {
    case 'erzak':
      return ['econ/surucu', 'econ/katir', 'econ/kagni-cuval', 'econ/kagni-cuval', 'econ/surucu', 'econ/kagni-cuval', 'econ/katir'];
    case 'hazine':
      return ['econ/yeniceri-yuru', 'econ/yeniceri-yuru', 'econ/kagni-hazine', 'econ/kagni-hazine', 'econ/yeniceri-yuru', 'econ/deve'];
    case 'maden':
      return ['econ/surucu', 'econ/katir', 'econ/katir', 'econ/kagni-tas', 'econ/kagni-tas', 'econ/katir'];
    case 'amele': {
      const out = ['econ/kagni-kereste'];
      for (let i = 0; i < size * 2; i++) out.push((i + seed) % 3 === 0 ? 'econ/amele2-yuru' : 'econ/amele-yuru');
      return out;
    }
    default:
      return ['econ/surucu', 'econ/deve', 'econ/deve', 'econ/kagni-cuval', 'econ/deve', 'econ/katir', 'econ/kagni-cuval'];
  }
}

export class CaravanRenderer {
  private views = new Map<number, CaravanSprites>();

  constructor(
    private rc: RenderContext,
    private pool: SpritePool,
  ) {}

  update(state: GameState, dt: number, view: ViewRect, running: boolean): void {
    const e = econ(state);
    const world = this.rc.world;
    const alive = new Set<number>();
    for (const c of e.caravans) {
      alive.add(c.id);
      let v = this.views.get(c.id);
      if (!v) {
        v = { shown: c.dist, members: composition(c.kind, c.size, c.id).map((key) => ({ key, ...MEMBER[key], sprite: null })), lastX: 0, lastY: 0, dustT: 0 };
        this.views.set(c.id, v);
      }
      const diff = c.dist - v.shown;
      v.shown = Math.abs(diff) > 4 ? c.dist : v.shown + diff * Math.min(1, dt * 6);
      let d = v.shown;
      for (const m of v.members) {
        if (d < 0 || d > c.len) {
          if (m.sprite) {
            this.pool.release(m.sprite);
            m.sprite = null;
          }
          d -= m.spacing;
          continue;
        }
        const pt = pointAlong(c.path, d);
        const w = world.toWorld(pt.tx, pt.ty);
        const vis = inView(view, w.x, w.y, 48);
        if (vis && !m.sprite) {
          m.sprite = this.pool.acquire(m.key, 0);
          m.sprite.setOrigin(0.5, m.oy);
        } else if (!vis && m.sprite) {
          this.pool.release(m.sprite);
          m.sprite = null;
        }
        if (m.sprite) {
          const s = m.sprite;
          s.setPosition(Math.round(w.x), Math.round(w.y)).setDepth(w.y);
          const sdx = pt.dx - pt.dy;
          if (Math.abs(sdx) > 0.01) s.setFlipX(sdx < 0);
          if (running) playDesync(s, `${m.key}:walk`, (d * 0.37) % 1);
          else if (s.anims.isPlaying) s.anims.stop();
          if (m === v.members[0]) {
            v.lastX = w.x;
            v.lastY = w.y;
          }
        }
        d -= m.spacing;
      }
      // road dust
      if (running && v.members[0].sprite) {
        v.dustT -= dt * Math.max(1, state.time.speed);
        if (v.dustT <= 0) {
          v.dustT = 0.9 + Math.random() * 0.8;
          this.rc.fx.dust(v.lastX - 6, v.lastY, 0.5);
        }
      }
    }
    for (const [id, v] of this.views) {
      if (alive.has(id)) continue;
      const arrivedVisible = v.members.some((m) => m.sprite);
      if (arrivedVisible) {
        this.rc.fx.dust(v.lastX, v.lastY, 1.0);
        this.rc.fx.floatText(v.lastX, v.lastY - 26, 'Kervan geldi', 0xf2d65a);
      }
      for (const m of v.members) if (m.sprite) this.pool.release(m.sprite);
      this.views.delete(id);
    }
  }

  clear(): void {
    for (const v of this.views.values()) for (const m of v.members) if (m.sprite) this.pool.release(m.sprite);
    this.views.clear();
  }
}

