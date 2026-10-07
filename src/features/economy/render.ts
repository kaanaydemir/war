import type Phaser from 'phaser';
import { dayToDate } from '../../core/calendar';
import type { RenderContext } from '../../core/feature';
import type { LightHandle, LoopHandle } from '../../core/fx';
import { DEPTH } from '../../core/layers';
import { RESOURCE_ADI, type Building, type GameState, type ResourceId } from '../../core/state';
import { isNight } from '../atmosphere/api';
import { buildingCenterTile, isPlacementValid, staffRate } from './api';
import { BUILDING_ART, frameFor, siteFrame, type BuildingArt } from './artBuildings';
import { BUILDING_BY_ID, VIRTUAL_BUILDINGS } from './data';
import { CaravanRenderer, Decor } from './renderDecor';
import { HisarView } from './renderHisar';
import { playDesync, rectInView, SpritePool, updateView, type ViewRect } from './renderUtil';

/** Animated overlay slots per building type (u,v in footprint tile units from the north vertex). */
interface Slot {
  u: number;
  v: number;
  key: string;
  anim?: string;
  flip?: boolean;
  /** Minimum staffing (0..1) for this worker to appear. */
  min?: number;
  /** Ping-pong walk to (u2,v2). */
  to?: [number, number];
  /** Always visible (props/guards). */
  always?: boolean;
  oy?: number;
  ox?: number;
}

const SLOTS: Record<string, Slot[]> = {
  'tas-ocagi': [
    { u: 1.15, v: 0.95, key: 'econ/amele-kazma', anim: 'econ/amele-kazma:work', min: 0.05 },
    { u: 1.75, v: 1.45, key: 'econ/amele-kazma', anim: 'econ/amele-kazma:work', flip: true, min: 0.4 },
    { u: 2.35, v: 2.35, key: 'econ/amele-cekic', anim: 'econ/amele-cekic:work', min: 0.6 },
    { u: 2.0, v: 1.1, key: 'econ/amele-tas', anim: 'econ/amele-tas:walk', to: [2.7, 2.6], min: 0.25 },
  ],
  'kereste-kampi': [
    { u: 1.7, v: 1.35, key: 'econ/bickici', anim: 'econ/bickici:work', min: 0.05, oy: 20 / 22 },
    { u: 0.55, v: 2.3, key: 'econ/amele-balta', anim: 'econ/amele-balta:work', min: 0.3 },
    { u: 2.6, v: 2.75, key: 'econ/amele-balta', anim: 'econ/amele-balta:work', flip: true, min: 0.6 },
    { u: 2.2, v: 0.9, key: 'econ/amele-kalas', anim: 'econ/amele-kalas:walk', to: [1.2, 2.5], min: 0.45 },
  ],
  'tasci-atolyesi': [
    { u: 0.75, v: 0.95, key: 'econ/tasci', anim: 'econ/tasci:work', min: 0.05 },
    { u: 1.15, v: 0.55, key: 'econ/tasci', anim: 'econ/tasci:work', flip: true, min: 0.5 },
    { u: 1.8, v: 0.5, key: 'econ/amele-tas', anim: 'econ/amele-tas:walk', to: [1.0, 1.0], min: 0.3 },
  ],
  baruthane: [
    { u: 2.1, v: 1.9, key: 'econ/amele-fici', anim: 'econ/amele-fici:walk', to: [1.2, 1.95], min: 0.05 },
    { u: 2.85, v: 0.95, key: 'econ/amele-yuru', anim: 'econ/amele-yuru:walk', to: [2.6, 1.5], min: 0.5 },
  ],
  'erzak-ambari': [
    { u: 2.1, v: 1.95, key: 'econ/amele2-cuval', anim: 'econ/amele2-cuval:walk', to: [1.35, 1.6], min: 0.05 },
    { u: 0.6, v: 2.0, key: 'econ/amele-tas', anim: 'econ/amele2-cuval:walk', to: [1.3, 1.65], min: 0.4 },
    { u: 2.8, v: 0.8, key: 'econ/amele-yuru', anim: 'econ/amele-yuru:walk', to: [2.6, 1.7], min: 0.7 },
  ],
  'yag-kazani': [
    { u: 1.15, v: 1.15, key: 'econ/kazan', anim: 'econ/kazan:boil', always: true, oy: 15 / 16 },
    { u: 1.65, v: 1.55, key: 'econ/kazan', anim: 'econ/kazan:boil', always: true, oy: 15 / 16 },
    { u: 1.15, v: 1.05, key: 'econ/buhar', anim: 'econ/buhar:rise', min: 0.05, oy: 1.6 },
    { u: 1.65, v: 1.45, key: 'econ/buhar', anim: 'econ/buhar:rise', min: 0.05, oy: 1.6 },
    { u: 0.8, v: 1.35, key: 'econ/amele-kazan', anim: 'econ/amele-kazan:work', min: 0.05 },
  ],
  kervansaray: [
    { u: 1.2, v: 1.7, key: 'econ/deve', always: true, oy: 23 / 26 },
    { u: 2.0, v: 1.1, key: 'econ/katir', always: true, flip: true, oy: 15 / 18 },
    { u: 1.0, v: 3.15, key: 'econ/nobetci', anim: 'econ/nobetci:idle', always: true },
  ],
  otag: [
    { u: 0.15, v: 0.15, key: 'econ/sancak-kirmizi', anim: 'econ/sancak-kirmizi:wave', always: true, ox: 2.5 / 16, oy: 1 },
    { u: 2.9, v: 2.9, key: 'econ/sancak-yesil', anim: 'econ/sancak-yesil:wave', always: true, ox: 2.5 / 16, oy: 1 },
    { u: 2.9, v: 0.15, key: 'econ/sancak-kirmizi', anim: 'econ/sancak-kirmizi:wave', always: true, ox: 2.5 / 16, oy: 1 },
    { u: 0.15, v: 2.9, key: 'econ/sancak-beyaz', anim: 'econ/sancak-beyaz:wave', always: true, ox: 2.5 / 16, oy: 1 },
    { u: 0.95, v: 3.15, key: 'econ/nobetci', anim: 'econ/nobetci:idle', always: true },
    { u: 1.7, v: 3.15, key: 'econ/nobetci', anim: 'econ/nobetci:idle', flip: true, always: true },
  ],
  'ordugah-cadirlari': [
    { u: 1.25, v: 1.42, key: 'econ/ates', anim: 'econ/ates:burn', always: true, oy: 14 / 16 },
    { u: 1.75, v: 0.35, key: 'econ/sancak-kirmizi', anim: 'econ/sancak-kirmizi:wave', always: true, ox: 2.5 / 16, oy: 1 },
  ],
};

const RES_COLOR: Partial<Record<ResourceId, number>> = {
  tas: 0xe6dcc4,
  kereste: 0xe0b77a,
  gulle: 0xd0c8b6,
  barut: 0xb9b4bc,
  erzak: 0xf4e3b5,
  yag: 0xfff1a0,
  tunc: 0xf8dc9a,
};

interface SlotSprite {
  slot: Slot;
  s: Phaser.GameObjects.Sprite;
  d: number;
  dir: 1 | -1;
}

interface BView {
  id: number;
  type: string;
  art: BuildingArt;
  base: Phaser.GameObjects.Image;
  sel: Phaser.GameObjects.Image | null;
  ring: Phaser.GameObjects.Image | null;
  site: Phaser.GameObjects.Image | null;
  scaffold: Phaser.GameObjects.Image | null;
  builders: Phaser.GameObjects.Sprite[];
  slots: SlotSprite[];
  built: boolean;
  x: number;
  y: number;
  visible: boolean;
  winter: boolean;
  loop: LoopHandle | null;
  light: LightHandle | null;
  fxT: number;
  floatT: number;
}

function artFor(b: Building): BuildingArt | undefined {
  if (b.type === 'ordugah-cadirlari') {
    const wing = String(b.data.wing ?? 'karaca');
    return BUILDING_ART[wing === 'karaca' ? 'ordugah-cadirlari' : `ordugah-cadirlari@${wing}`] ?? BUILDING_ART['ordugah-cadirlari'];
  }
  return BUILDING_ART[b.type];
}

class EconomyRenderer {
  private scene: Phaser.Scene;
  private pool: SpritePool;
  private views = new Map<number, BView>();
  private hisar: HisarView | null = null;
  private decor: Decor;
  private caravans: CaravanRenderer;
  private ghostDiamond: Phaser.GameObjects.Image;
  private ghostImg: Phaser.GameObjects.Image;
  private ghostKey = '';
  private ghostOk = false;
  private ghostT = 0;
  private view: ViewRect = { x0: 0, y0: 0, x1: 0, y1: 0 };
  private t = 0;
  private unsub: (() => void)[] = [];

  constructor(private rc: RenderContext) {
    this.scene = rc.scene;
    this.pool = new SpritePool(rc.scene);
    this.decor = new Decor(rc, this.pool);
    this.caravans = new CaravanRenderer(rc, this.pool);
    this.ghostDiamond = rc.scene.add.image(0, 0, '__DEFAULT').setDepth(DEPTH.PLACEMENT).setVisible(false);
    this.ghostImg = rc.scene.add.image(0, 0, '__DEFAULT').setDepth(DEPTH.PLACEMENT + 1).setVisible(false);
    rc.addPickable({ pick: (wx, wy) => this.pick(wx, wy) });
    this.listen();
    this.scene.events.once('shutdown', () => this.destroy());
  }

  // ───────────────────────── bus reactions ─────────────────────────

  private listen(): void {
    const bus = this.rc.bus;
    const fx = this.rc.fx;
    this.unsub.push(
      bus.on('economy:produced', (e) => {
        const v = this.views.get(e.id);
        if (!v || !v.visible || this.t - v.floatT < 1.4) return;
        v.floatT = this.t;
        const name = RESOURCE_ADI[e.res].toLocaleLowerCase('tr');
        fx.floatText(v.x, v.y - Math.min(30, v.art.top) - 4, `+${Math.round(e.amount)} ${name}`, RES_COLOR[e.res] ?? 0xffffff);
      }),
      bus.on('construction:tick', (e) => {
        const v = this.views.get(e.id);
        if (v?.visible) {
          fx.dust(v.x + (Math.random() - 0.5) * 20, v.y - 2, 0.6);
          if (Math.random() < 0.5) fx.sparks(v.x + (Math.random() - 0.5) * 16, v.y - 10, 3);
        }
      }),
      bus.on('construction:stage', (e) => {
        if (!this.hisar || this.hisar.id !== e.id || !this.hisar.visible) return;
        const [x, y] = this.hisar.stagePoint(e.stage);
        fx.flash(x, y, 0xfff1a0, 70, 0.5);
        fx.dust(x - 10, y + 8, 1.4);
        fx.dust(x + 10, y + 8, 1.4);
        fx.debris(x, y, 6, 'tas');
        fx.floatText(x, y - 18, `${e.name} tamamlandı!`, 0xf2d65a);
        fx.shake(0.12, 0.3);
      }),
      bus.on('building:complete', (e) => {
        if (this.hisar && this.hisar.id === e.id) {
          if (!this.hisar.visible) return;
          const [x, y] = this.hisar.topPoint();
          for (const s of ['saruca', 'halil', 'zaganos']) {
            const [tx, ty] = this.hisar.stagePoint(s);
            fx.flash(tx, ty - 10, 0xfff1a0, 90, 0.8);
            fx.dust(tx, ty + 20, 2);
          }
          fx.floatText(x, y, 'Rumeli Hisarı tamamlandı!', 0xf2d65a);
          fx.shake(0.2, 0.5);
          return;
        }
        const v = this.views.get(e.id);
        if (v?.visible) {
          fx.flash(v.x, v.y - 16, 0xffe6a0, 50, 0.45);
          fx.dust(v.x - 12, v.y, 1.2);
          fx.dust(v.x + 12, v.y, 1.2);
          fx.debris(v.x, v.y - 12, 5, 'tahta');
          fx.floatText(v.x, v.y - v.art.top, `${BUILDING_BY_ID[v.type]?.name ?? ''} tamamlandı`, 0xb7d66a);
        }
      }),
    );
  }

  // ───────────────────────── per frame ─────────────────────────

  update(state: GameState, dt: number): void {
    this.t += dt;
    const cam = this.scene.cameras.main;
    updateView(cam, 48, this.view);
    const running = state.time.speed > 0 && !state.outcome;
    const night = isNight(state);
    const month = dayToDate(state.time.day).month;
    const winter = state.time.phase === 'hazirlik' && (month === 12 || month <= 2);
    const selected = new Set<number>();
    for (const s of this.rc.store.ui.selection) if (s.kind === 'building') selected.add(Number(s.id));

    // sync building views
    const seen = new Set<number>();
    for (const b of state.buildings) {
      if (VIRTUAL_BUILDINGS.has(b.type)) continue;
      if (b.type === 'rumeli-hisari') {
        if (!this.hisar || this.hisar.id !== b.id) {
          this.hisar?.destroy();
          this.hisar = new HisarView(this.rc, b.id);
        }
        this.hisar.update(state, b, dt, this.view, { snow: winter, running, night, selected: selected.has(b.id), time: this.t });
        seen.add(b.id);
        continue;
      }
      seen.add(b.id);
      let v = this.views.get(b.id);
      if (v && (v.built !== b.built || v.winter !== winter)) {
        this.destroyView(v);
        this.views.delete(b.id);
        v = undefined;
      }
      if (!v) {
        const nv = this.createView(b, winter);
        if (!nv) continue;
        v = nv;
        this.views.set(b.id, v);
      }
      this.updateView(v, b, state, dt, running, night, selected.has(b.id));
    }
    for (const [id, v] of this.views)
      if (!seen.has(id)) {
        this.destroyView(v);
        this.views.delete(id);
      }
    if (this.hisar && !seen.has(this.hisar.id)) {
      this.hisar.destroy();
      this.hisar = null;
    }

    this.decor.update(state, dt, this.view, { night, running, speed: Math.max(1, state.time.speed) });
    this.caravans.update(state, dt, this.view, running);
    this.updateGhost(state, dt);
  }

  private createView(b: Building, winter: boolean): BView | null {
    const art = artFor(b);
    if (!art) return null;
    const sc = this.scene;
    const c = buildingCenterTile(b);
    const w = this.rc.world.toWorld(c.tx, c.ty);
    const x = Math.round(w.x);
    const y = Math.round(w.y);
    const key = winter && sc.textures.exists(`${art.key}#kar`) ? `${art.key}#kar` : art.key;
    const base = sc.add.image(x, y, key).setOrigin(art.ax / art.w, art.ay / art.h).setDepth(y);
    const v: BView = {
      id: b.id,
      type: b.type,
      art,
      base,
      sel: null,
      ring: null,
      site: null,
      scaffold: null,
      builders: [],
      slots: [],
      built: b.built,
      x,
      y,
      visible: true,
      winter,
      loop: null,
      light: null,
      fxT: Math.random(),
      floatT: -10,
    };
    const def = BUILDING_BY_ID[b.type];
    const [a, bb] = def.size;
    if (!b.built) {
      const sf = siteFrame(a, bb);
      // the site decal & scaffold use the 40px-headroom frame
      const nx = x - (sf.cx - sf.ox);
      const ny = y - (sf.cy - sf.oy);
      v.site = sc.add.image(nx, ny, `econ/santiye-${a}x${bb}`).setOrigin(sf.ox / sf.w, sf.oy / sf.h).setDepth(DEPTH.GROUND_DECAL + 2);
      v.scaffold = sc.add.image(nx, ny, `econ/iskele-${a}x${bb}`).setOrigin(sf.ox / sf.w, sf.oy / sf.h).setDepth(y + 1);
      const fr = frameFor(a, bb, 0);
      for (const [u, vv, flip] of [[0.1, bb + 0.25, false], [a + 0.25, bb * 0.5, true]] as const) {
        const [px, py] = fr.at(u, vv);
        const s = sc.add.sprite(x + px - fr.cx, y + py - fr.cy, 'econ/amele-cekic', 0).setOrigin(0.5, 1).setFlipX(flip).setDepth(y + py - fr.cy);
        playDesync(s, 'econ/amele-cekic:work', u * 0.3);
        v.builders.push(s);
      }
    } else {
      const fr = frameFor(a, bb, 0);
      for (const slot of SLOTS[b.type] ?? []) {
        const [px, py] = fr.at(slot.u, slot.v);
        const s = sc.add.sprite(x + px - fr.cx, y + py - fr.cy, slot.key, 0);
        s.setOrigin(slot.ox ?? 0.5, slot.oy ?? 18 / 20).setFlipX(!!slot.flip).setDepth(y + py - fr.cy + 0.5);
        if (slot.anim) playDesync(s, slot.anim, slot.u * 0.21 + slot.v * 0.13 + b.id * 0.07);
        v.slots.push({ slot, s, d: Math.random(), dir: 1 });
      }
      // tent-field banner colour follows the wing
      if (b.type === 'ordugah-cadirlari') {
        const wing = String(b.data.wing ?? 'karaca');
        const col = wing === 'ishak' ? 'yesil' : wing === 'zaganos' ? 'beyaz' : wing === 'hisar' ? 'kirmizi' : wing === 'merkez' ? 'kirmizi' : 'kirmizi';
        const fl = v.slots.find((ss) => ss.slot.key.startsWith('econ/sancak'));
        if (fl) {
          fl.s.setTexture(`econ/sancak-${col}`, 0);
          playDesync(fl.s, `econ/sancak-${col}:wave`, b.id * 0.1);
        }
      }
    }
    return v;
  }

  private updateView(v: BView, b: Building, state: GameState, dt: number, running: boolean, night: boolean, selected: boolean): void {
    const fx = this.rc.fx;
    const art = v.art;
    const vis = rectInView(this.view, v.x - art.ax, v.y - art.ay, v.x - art.ax + art.w, v.y - art.ay + art.h);
    if (vis !== v.visible) {
      v.visible = vis;
      v.base.setVisible(vis);
      v.site?.setVisible(vis);
      v.scaffold?.setVisible(vis);
      for (const s of v.builders) s.setVisible(vis);
      for (const ss of v.slots) ss.s.setVisible(vis);
      if (!vis) this.dropFx(v);
    }
    // selection
    if (selected && vis) {
      if (!v.sel) {
        const k = `${art.key}#sel`;
        v.sel = this.scene.add.image(v.x, v.y, k).setOrigin(art.ax / art.w, art.ay / art.h).setDepth(v.y + 0.25);
        const def = BUILDING_BY_ID[b.type];
        const [a, bb] = def.size;
        const sf = siteFrame(a, bb);
        v.ring = this.scene.add
          .image(v.x - (sf.cx - sf.ox), v.y - (sf.cy - sf.oy), `econ/halka-${a}x${bb}`)
          .setOrigin(sf.ox / sf.w, sf.oy / sf.h)
          .setDepth(DEPTH.GROUND_DECAL + 5);
      }
      const pulse = 0.6 + 0.4 * Math.sin(this.t * 5);
      v.sel.setAlpha(pulse);
      v.ring?.setAlpha(0.7 + 0.3 * Math.sin(this.t * 5 + 1));
    } else if (v.sel) {
      v.sel.destroy();
      v.ring?.destroy();
      v.sel = null;
      v.ring = null;
    }
    if (!vis) return;

    if (!b.built) {
      // the building rises out of its scaffolding
      const p = Math.max(0, Math.min(1, b.progress));
      const cut = Math.round(art.ay * (1 - (0.15 + 0.85 * p)));
      v.base.setCrop(0, cut, art.w, art.h - cut);
      v.base.setAlpha(0.92);
      const working = b.workers > 0 && running;
      for (const s of v.builders) {
        s.setVisible(b.workers > 0);
        if (working && !s.anims.isPlaying) s.anims.resume();
        if (!working && s.anims.isPlaying) s.anims.pause();
      }
      if (working) {
        v.fxT -= dt * Math.max(1, state.time.speed);
        if (v.fxT <= 0) {
          v.fxT = 0.6 + Math.random() * 0.8;
          fx.dust(v.x + (Math.random() - 0.5) * art.w * 0.5, v.y + 2, 0.5);
        }
      }
      return;
    }

    // staffed animation
    const rate = Number(b.data.rate ?? 0);
    const staff = staffRate(b);
    const active = rate > 0.01 && running;
    const fr = frameFor(BUILDING_BY_ID[b.type].size[0], BUILDING_BY_ID[b.type].size[1], 0);
    for (const ss of v.slots) {
      const sl = ss.slot;
      const show = sl.always || (staff >= (sl.min ?? 0) && rate > 0.01);
      ss.s.setVisible(show);
      if (!show) continue;
      if (sl.to) {
        if (active) {
          ss.d += ss.dir * dt * 0.35 * Math.max(1, state.time.speed);
          if (ss.d >= 1) {
            ss.d = 1;
            ss.dir = -1;
          } else if (ss.d <= 0) {
            ss.d = 0;
            ss.dir = 1;
          }
        }
        const [x0, y0] = fr.at(sl.u, sl.v);
        const [x1, y1] = fr.at(sl.to[0], sl.to[1]);
        const px = x0 + (x1 - x0) * ss.d;
        const py = y0 + (y1 - y0) * ss.d;
        const nx = Math.round(v.x + px - fr.cx);
        const ny = Math.round(v.y + py - fr.cy);
        if (ss.s.x !== nx || ss.s.y !== ny) ss.s.setPosition(nx, ny).setDepth(v.y + py - fr.cy + 0.5);
        const fl = (x1 - x0) * ss.dir < 0;
        if (ss.s.flipX !== fl) ss.s.setFlipX(fl);
      }
      const animate = sl.always ? running || !sl.to : active;
      if (animate && !ss.s.anims.isPlaying && sl.anim) playDesync(ss.s, sl.anim, sl.u);
      if (!animate && ss.s.anims.isPlaying && !sl.always) ss.s.anims.pause();
    }
    // ambient effects
    v.fxT -= dt * Math.max(1, state.time.speed);
    if (active && v.fxT <= 0) {
      v.fxT = 0.8 + Math.random() * 1.2;
      if (b.type === 'tas-ocagi') {
        const [px, py] = fr.at(1.3 + Math.random() * 0.6, 1.0 + Math.random() * 0.6);
        fx.dust(v.x + px - fr.cx, v.y + py - fr.cy + 6, 0.7);
        if (Math.random() < 0.3) fx.debris(v.x + px - fr.cx, v.y + py - fr.cy, 2, 'tas');
      } else if (b.type === 'kereste-kampi') {
        if (Math.random() < 0.5) fx.debris(v.x - 4, v.y - 6, 2, 'tahta');
      } else if (b.type === 'tasci-atolyesi') {
        fx.sparks(v.x - 6, v.y - 8, 2);
        if (Math.random() < 0.4) fx.dust(v.x - 4, v.y - 2, 0.4);
      }
    }
    // smoke and night light
    const wantLoop = (b.type === 'baruthane' || b.type === 'yag-kazani') && rate > 0.01;
    if (wantLoop && !v.loop) {
      const [px, py] = b.type === 'baruthane' ? fr.at(2.55, 0.6) : fr.at(1.4, 1.3);
      v.loop = fx.smokeColumn(v.x + px - fr.cx, v.y + py - fr.cy - (b.type === 'baruthane' ? 10 : 8), b.type === 'baruthane' ? 0.8 : 0.5);
    } else if (!wantLoop && v.loop) {
      v.loop.destroy();
      v.loop = null;
    }
    const wantLight = night && (b.type === 'yag-kazani' || b.type === 'otag' || b.type === 'kervansaray' || b.type === 'ordugah-cadirlari');
    if (wantLight && !v.light) v.light = fx.light(v.x, v.y - 6, b.type === 'otag' ? 0xffc870 : 0xff9a40, b.type === 'otag' ? 56 : 36, b.type === 'otag' ? 1.0 : 0.8);
    else if (!wantLight && v.light) {
      v.light.destroy();
      v.light = null;
    }
  }

  private dropFx(v: BView): void {
    v.loop?.destroy();
    v.loop = null;
    v.light?.destroy();
    v.light = null;
  }

  private destroyView(v: BView): void {
    this.dropFx(v);
    v.base.destroy();
    v.sel?.destroy();
    v.ring?.destroy();
    v.site?.destroy();
    v.scaffold?.destroy();
    for (const s of v.builders) s.destroy();
    for (const ss of v.slots) ss.s.destroy();
  }

  // ───────────────────────── placement ghost ─────────────────────────

  private updateGhost(state: GameState, dt: number): void {
    const ui = this.rc.store.ui;
    const pl = ui.placement;
    const hov = ui.hoverTile;
    const def = pl ? BUILDING_BY_ID[pl.building] : undefined;
    const art = def ? BUILDING_ART[def.id] : undefined;
    if (!pl || !hov || !def || !art) {
      if (this.ghostDiamond.visible) {
        this.ghostDiamond.setVisible(false);
        this.ghostImg.setVisible(false);
      }
      this.ghostKey = '';
      return;
    }
    const [a, b] = def.size;
    const key = `${def.id}@${hov.tx},${hov.ty}`;
    this.ghostT -= dt;
    if (key !== this.ghostKey || this.ghostT <= 0) {
      this.ghostKey = key;
      this.ghostT = 0.25;
      this.ghostOk = isPlacementValid(state, this.rc.world, def.id, hov.tx, hov.ty).ok;
      const sf = siteFrame(a, b);
      const north = this.rc.world.toWorld(hov.tx, hov.ty);
      this.ghostDiamond
        .setTexture(`econ/ghost-${a}x${b}-${this.ghostOk ? 'ok' : 'bad'}`)
        .setOrigin(sf.ox / sf.w, sf.oy / sf.h)
        .setPosition(Math.round(north.x), Math.round(north.y - 8))
        .setVisible(true);
      const c = this.rc.world.toWorld(hov.tx + (a - 1) / 2, hov.ty + (b - 1) / 2);
      this.ghostImg
        .setTexture(art.key)
        .setOrigin(art.ax / art.w, art.ay / art.h)
        .setPosition(Math.round(c.x), Math.round(c.y))
        .setDepth(c.y + 0.75)
        .setTint(this.ghostOk ? 0xb7ffb0 : 0xff8a80)
        .setVisible(true);
    }
    this.ghostImg.setAlpha(0.55 + 0.15 * Math.sin(this.t * 6));
    this.ghostDiamond.setAlpha(0.75 + 0.25 * Math.sin(this.t * 6));
  }

  // ───────────────────────── picking ─────────────────────────

  private pick(wx: number, wy: number) {
    let best: { id: number; depth: number } | null = null;
    for (const v of this.views.values()) {
      if (!v.visible) continue;
      const lx = Math.floor(wx - v.x + v.art.ax);
      const ly = Math.floor(wy - v.y + v.art.ay);
      if (lx < 0 || ly < 0 || lx >= v.art.w || ly >= v.art.h) continue;
      const a = this.scene.textures.getPixelAlpha(lx, ly, v.base.texture.key);
      if (a == null || a < 200) continue;
      if (!best || v.y > best.depth) best = { id: v.id, depth: v.y };
    }
    if (best) return { kind: 'building' as const, id: best.id, score: 30 - best.depth / 100000 };
    if (this.hisar?.hit(wx, wy)) return { kind: 'building' as const, id: this.hisar.id, score: 31 };
    return null;
  }

  destroy(): void {
    for (const u of this.unsub) u();
    this.unsub = [];
    for (const v of this.views.values()) this.destroyView(v);
    this.views.clear();
    this.hisar?.destroy();
    this.hisar = null;
    this.decor.clear();
    this.caravans.clear();
    this.pool.destroy();
  }
}

const RENDERERS = new WeakMap<RenderContext, EconomyRenderer>();

export function createEconomyRender(rc: RenderContext): void {
  RENDERERS.set(rc, new EconomyRenderer(rc));
}

export function updateEconomyRender(rc: RenderContext, state: GameState, dt: number): void {
  RENDERERS.get(rc)?.update(state, dt);
}

