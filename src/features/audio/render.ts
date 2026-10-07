/**
 * AudioDirector — the per-scene bridge between the game and the audio engine.
 * Created in createRender (the bus is new on every scene restart), it:
 *  - listens to bus events and plays spatialized, throttled SFX,
 *  - samples the camera view to crossfade ambience beds,
 *  - drives continuous positional loops (fires) and rhythmic layers
 *    (marching columns, oars, alarm bells),
 *  - chooses the adaptive music mode.
 */
import type { RenderContext } from '../../core/feature';
import { segmentOf } from '../../core/calendar';
import { FLAG } from '../../core/flags';
import type { CannonType, GameState, SectionId } from '../../core/state';
import { landmarkTile, type LandmarkId } from '../../data/landmarks';
import { currentWeather, lightLevel, season } from '../atmosphere/api';
import { sectionCenter } from '../fortifications/api';
import { ambience, type AmbWeights } from './ambience';
import { engine, type LoopHandle } from './engine';
import { Bucket, smooth01, spatialize, Throttle, type Spatial, type View } from './mix';
import { music, type MusicMode } from './music';
import { CANNON_POWER, fireBed, SFX, type SfxId, type SfxParams } from './sfx';
import type { Dest } from './synth';

type Tile = { tx: number; ty: number };

interface FireLoop {
  loop: LoopHandle;
  x: number;
  y: number;
  until: number;
}

const GALLEYS = new Set(['kadirga', 'kalyete', 'fusta', 'venedik-kadirgasi']);
const CHURCHES: LandmarkId[] = ['ayasofya', 'havariyun', 'pantokrator', 'kariye', 'blahernaiSarayi'];

export class AudioDirector {
  private offs: (() => void)[] = [];
  private throttle = new Throttle();
  private cannonBucket = new Bucket(6, 2.5);
  private impactBucket = new Bucket(6, 3);
  private smallBucket = new Bucket(5, 2);
  private buildBucket = new Bucket(3, 1.2);
  private clock = 0;
  private fires = new Map<string, FireLoop>();
  private assaults = new Map<SectionId, { at: Tile; intensity: number; last: number }>();
  private lastAssaultEnd = -999;
  private mehter = false;
  private navalBattle = false;
  private eclipseActive = false;
  private weatherEvt: { kind: string; intensity: number; at: number } | null = null;
  private ambT = 0;
  private stepT = 0;
  private oarT = 0;
  private bellT = 3;
  private musicT = 0;
  private candidate: MusicMode = 'sessiz';
  private candidateSince = 0;
  private settingsKey = '';
  private greekN = 0;
  private cityW = 0;

  constructor(private rc: RenderContext) {
    engine.installGesture();
    this.listen();
    this.offs.push(rc.store.subscribe(() => this.syncSettings()));
    this.syncSettings();
    const st = rc.getState();
    this.updateMusic(st, true);
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.offs = [];
    for (const f of this.fires.values()) f.loop.stop(0.8);
    this.fires.clear();
  }

  // ───────────────────────────── helpers ─────────────────────────────

  private view(): View {
    const cam = this.rc.scene.cameras.main;
    const v = cam.worldView;
    return { x: v.x, y: v.y, w: Math.max(1, v.width), h: Math.max(1, v.height), zoom: cam.zoom };
  }

  private spatialTile(t: Tile, range: number): Spatial {
    const p = this.rc.world.toWorld(t.tx, t.ty);
    return spatialize(p.x, p.y, this.view(), range);
  }

  /** Play a registered SFX at a tile (or non-positional when `at` is null). */
  play<K extends SfxId>(id: K, params: SfxParams<K>, at: Tile | null, opts: { gain?: number; delay?: number; bus?: 'sfx' | 'amb' } = {}): void {
    if (!engine.ready) return;
    const def = SFX[id];
    const sp = at ? this.spatialTile(at, def.range) : null;
    const v = engine.voice({
      bus: opts.bus ?? 'sfx',
      pri: def.pri,
      dur: def.dur,
      sp,
      gain: (def.gain ?? 1) * (opts.gain ?? 1),
      echo: def.echo ? def.echo * (sp ? 0.4 + 0.6 * sp.far : 1) : 0,
      delay: opts.delay,
    });
    if (!v) return;
    try {
      (def.play as (D: Dest, p: unknown) => void)(v, params);
      if (def.duck) engine.duck(def.duck * (sp ? sp.gain : 1));
    } catch (err) {
      console.warn('[audio] sfx failed', id, err);
    }
  }

  private sectionTile(id: SectionId): Tile | null {
    try {
      const c = sectionCenter(id);
      return Number.isFinite(c.tx) && Number.isFinite(c.ty) && (c.tx !== 0 || c.ty !== 0) ? c : null;
    } catch {
      return null;
    }
  }

  private syncSettings(): void {
    const s = this.rc.store.ui.settings;
    const screen = this.rc.store.ui.screen;
    const key = `${s.musicVolume}|${s.sfxVolume}|${screen}`;
    if (key === this.settingsKey) return;
    this.settingsKey = key;
    // Title attract mode: the battle plays quieter behind the menu.
    engine.setVolumes(s.musicVolume, s.sfxVolume, screen === 'baslik' ? 0.45 : screen === 'son' ? 0.6 : 1);
  }

  // ───────────────────────────── bus events ─────────────────────────────

  private listen(): void {
    const bus = this.rc.bus;
    const on: typeof bus.on = (name, fn) => {
      const off = bus.on(name, (p) => {
        if (!engine.ready) return;
        try {
          fn(p);
        } catch (err) {
          console.warn('[audio] handler failed', name, err);
        }
      });
      this.offs.push(off);
      return off;
    };
    const now = () => this.clock;
    const T = (key: string, gap: number) => this.throttle.allow(key, now(), gap);

    // ── artillery ──
    on('cannon:fire', (e) => {
      if (e.type !== 'sahi' && !this.cannonBucket.take(now())) return;
      if (!T('fire:' + e.type + ':' + e.cannonId, 0.15)) return;
      this.play(e.type as CannonType, undefined as never, e.from);
    });
    on('cannon:impact', (e) => {
      if (!this.impactBucket.take(now()) && e.type !== 'sahi') return;
      const power = CANNON_POWER[e.type] * (0.8 + Math.min(0.5, e.damage / 40));
      const water = this.rc.world.inBounds(Math.round(e.at.tx), Math.round(e.at.ty)) && this.rc.world.isWater(Math.round(e.at.tx), Math.round(e.at.ty));
      if (water) this.play('splash', { size: 0.6 + power }, e.at);
      else if (e.hitWall) this.play('impactWall', { power }, e.at);
      else this.play('impactGround', { power }, e.at);
    });
    on('cannon:cracked', (e) => {
      const c = this.rc.getState().cannons.find((x) => x.id === e.cannonId);
      this.play('cannonCracked', undefined as never, c ? { tx: c.tx, ty: c.ty } : null);
    });
    on('cannon:arrived', (e) => {
      const c = this.rc.getState().cannons.find((x) => x.id === e.cannonId);
      if (T('arrived', 3)) this.play('oxen', undefined as never, c ? { tx: c.tx, ty: c.ty } : null);
    });

    // ── walls ──
    on('wall:breach', (e) => this.play('breach', undefined as never, this.sectionTile(e.sectionId)));
    on('wall:tower-collapse', (e) => this.play('towerCollapse', undefined as never, e.at));
    on('wall:repaired', (e) => {
      if (T('repair:' + e.sectionId, 2.5)) this.play('construction', { kind: Math.random() < 0.6 ? 'hammer' : 'saw' }, this.sectionTile(e.sectionId), { gain: 0.7 });
    });

    // ── army ──
    on('assault:start', (e) => {
      const st = this.rc.getState();
      const gs = st.groups.filter((g) => e.groupIds.includes(g.id));
      const at = gs.length ? { tx: gs.reduce((a, g) => a + g.tx, 0) / gs.length, ty: gs.reduce((a, g) => a + g.ty, 0) / gs.length } : this.sectionTile(e.sectionId);
      if (at) this.assaults.set(e.sectionId, { at, intensity: 0.6, last: now() });
      this.play('crowd', { kind: 'hucum', size: 1 }, at);
      if (T('wardrums', 6)) this.play('warDrums', undefined as never, at, { delay: 0.3 });
      this.updateMusic(st, true);
    });
    on('assault:clash', (e) => {
      const a = this.assaults.get(e.sectionId);
      if (a) {
        a.at = e.at;
        a.intensity = Math.max(0.3, Math.min(1, e.intensity));
        a.last = now();
      } else this.assaults.set(e.sectionId, { at: e.at, intensity: Math.min(1, e.intensity), last: now() });
      if (T('clash:' + e.sectionId, 0.2)) this.play('clash', { intensity: e.intensity }, e.at);
    });
    on('assault:end', (e) => {
      const a = this.assaults.get(e.sectionId);
      this.assaults.delete(e.sectionId);
      this.lastAssaultEnd = now();
      const at = a?.at ?? this.sectionTile(e.sectionId);
      this.play('crowd', { kind: e.success ? 'zafer' : 'panik', size: 0.9 }, at);
      if (!e.success && T('retreat-bells', 5)) this.cityBells(3, false);
    });
    on('arrows:volley', (e) => {
      if (!T('arrows', 0.22) || !this.smallBucket.take(now())) return;
      this.play('arrows', { count: e.count }, e.to);
    });
    on('group:casualties', (e) => {
      if (e.count > 3 && T('groan', 0.7)) this.play('groan', undefined as never, e.at);
    });
    on('group:routed', (e) => {
      const g = this.rc.getState().groups.find((x) => x.id === e.groupId);
      if (T('routed', 2)) this.play('crowd', { kind: 'panik', size: 0.7 }, g ? { tx: g.tx, ty: g.ty } : null);
    });
    on('mehter:play', (e) => {
      this.mehter = e.playing;
      this.updateMusic(this.rc.getState(), true);
    });
    on('banner:planted', (e) => {
      this.play('crowd', { kind: 'zafer', size: 1.2 }, e.at);
      this.play('warDrums', undefined as never, e.at, { delay: 0.6 });
    });
    on('group:order', () => {
      /* acknowledged by the UI click */
    });

    // ── siegeworks ──
    on('mine:started', (e) => {
      if (T('mine:' + e.mineId, 4)) this.play('construction', { kind: 'chisel' }, this.sectionTile(e.sectionId), { gain: 0.6 });
    });
    on('mine:detected', () => {
      if (T('mine-detected', 6)) this.cityBells(4, true);
    });
    on('mine:collapsed', (e) => this.play('mineCollapse', {}, e.at));
    on('mine:success', (e) => this.play('mineCollapse', { big: true }, this.sectionTile(e.sectionId)));
    on('tower:built', (e) => {
      const at = this.sectionTile(e.sectionId);
      this.play('creak', { dur: 2.2, pitch: 0.6 }, at);
      this.play('crowd', { kind: 'tezahurat', size: 1 }, at, { delay: 1.5 });
    });
    on('tower:burned', (e) => {
      this.play('fireWhoosh', { big: true }, e.at);
      this.play('woodCrack', { size: 1.4 }, e.at, { delay: 2.5 });
      this.startFire('tower:' + e.sectionId, e.at, 28);
    });
    on('sortie', (e) => {
      this.play('crowd', { kind: 'hucum', size: 0.7 }, e.at);
      this.play('clash', { intensity: 1 }, e.at, { delay: 0.5 });
    });
    on('greekfire', (e) => {
      this.play('greekFire', undefined as never, e.at);
      this.startFire('gf:' + this.greekN++, e.at, 9);
    });

    // ── navy ──
    on('ship:fire', (e) => {
      if (!this.cannonBucket.take(now())) return;
      this.play('kucuk', undefined as never, e.from);
    });
    on('navy:battery', (e) => {
      if (!this.cannonBucket.take(now())) return;
      this.play('orta', undefined as never, e.from);
      if (!e.hit) this.play('splash', { size: 0.9 }, e.to, { delay: 0.9 });
    });
    on('ship:hit', (e) => {
      if (T('shiphit', 0.15)) this.play('woodCrack', { size: 1 }, e.at);
    });
    on('ship:sunk', (e) => this.play('shipSunk', undefined as never, e.at));
    on('ship:burning', (e) => {
      if (T('shipburn:' + e.shipId, 5)) this.play('fireWhoosh', {}, e.at);
    });
    on('ship:board', (e) => this.play('grapple', undefined as never, e.at));
    on('naval:battle', (e) => {
      this.navalBattle = e.started;
      if (e.started) {
        const sh = this.rc.getState().ships.find((s) => s.status === 'savas');
        this.play('warDrums', undefined as never, sh ? { tx: sh.tx, ty: sh.ty } : null, { gain: 0.8 });
      }
    });
    on('navy:chain', () => {
      const t = landmarkTile('eugeniusKulesi');
      this.play('chain', undefined as never, t);
    });
    on('overland:launch', (e) => {
      const s = this.rc.getState().ships.find((x) => x.id === e.shipId);
      const at = s ? { tx: s.tx, ty: s.ty } : null;
      this.play('creak', { dur: 2.4, pitch: 0.55 }, at);
      if (T('haul', 4)) this.play('oxen', undefined as never, at, { delay: 0.6 });
    });
    on('overland:progress', () => {
      if (!T('haul-creak', 2.2)) return;
      const s = this.rc.getState().ships.find((x) => x.status === 'karada');
      if (s) this.play('creak', { dur: 1.6, pitch: rand01() * 0.3 + 0.5 }, { tx: s.tx, ty: s.ty });
    });
    on('overland:launched', (e) => {
      this.play('splash', { size: 1.5 }, e.at);
      this.play('crowd', { kind: 'tezahurat', size: 1 }, e.at, { delay: 0.6 });
    });
    on('overland:done', () => {
      const t = landmarkTile('kasimpasa');
      this.play('crowd', { kind: 'zafer', size: 1 }, t);
    });

    // ── economy / construction ──
    on('construction:tick', (e) => {
      if (!T('build:' + e.id, 0.9) || !this.buildBucket.take(now())) return;
      const b = this.rc.getState().buildings.find((x) => x.id === e.id);
      const stone = b ? /hisar|tas|mevzi|dokumhane/.test(b.type) : false;
      const kinds = stone ? (['chisel', 'hammer', 'crane', 'chisel'] as const) : (['hammer', 'saw', 'hammer'] as const);
      this.play('construction', { kind: kinds[Math.floor(Math.random() * kinds.length)] }, e.at);
    });
    on('construction:stage', (e) => {
      this.play('construction', { kind: 'crane' }, e.at);
      this.play('crowd', { kind: 'tezahurat', size: 0.9 }, e.at, { delay: 1.2 });
    });
    on('building:placed', (e) => {
      const b = this.rc.getState().buildings.find((x) => x.id === e.id);
      if (T('placed', 0.3)) this.play('construction', { kind: 'hammer' }, b ? { tx: b.tx, ty: b.ty } : null, { gain: 0.8 });
    });
    on('building:complete', (e) => this.play('buildDone', undefined as never, e.at));
    on('caravan:arrived', () => {
      if (T('caravan', 4)) this.play('camelBells', undefined as never, landmarkTile('edirneYolu'));
    });
    on('caravan:departed', () => {
      if (T('caravan-d', 4)) this.play('camelBells', undefined as never, landmarkTile('edirneYolu'), { gain: 0.6 });
    });
    on('economy:produced', (e) => {
      if (e.res === 'akce' && T('coin', 1.5)) this.play('coin', undefined as never, e.at);
    });
    on('camp:established', (e) => {
      this.play('warDrums', undefined as never, e.at);
      this.play('crowd', { kind: 'tezahurat', size: 1.1 }, e.at, { delay: 0.8 });
    });

    // ── time & sky ──
    on('time:segment', (e) => {
      const st = this.rc.getState();
      if (st.time.phase !== 'kusatma') {
        if (e.segment === 'safak') this.play('rooster', undefined as never, landmarkTile('otag'), { bus: 'amb' });
        return;
      }
      if (e.segment === 'safak') {
        this.cityBells(5, false);
        if (Math.random() < 0.7) this.play('semantron', undefined as never, landmarkTile(CHURCHES[Math.floor(Math.random() * CHURCHES.length)]), { delay: 2 });
      } else if (e.segment === 'aksam') {
        this.cityBells(4, false);
      }
      this.updateMusic(st, false);
    });
    on('time:dawn', () => {
      if (T('rooster', 20)) this.play('rooster', undefined as never, landmarkTile('otag'), { bus: 'amb', delay: 1 });
    });
    on('phase:changed', () => this.updateMusic(this.rc.getState(), true));
    on('eclipse', (e) => {
      if (e.active && !this.eclipseActive) this.play('eclipse', undefined as never, null, { bus: 'amb' });
      this.eclipseActive = e.active;
    });
    on('weather', (e) => {
      this.weatherEvt = { kind: e.kind, intensity: e.intensity, at: now() };
      if ((e.kind === 'yagmur' || e.kind === 'dolu') && e.intensity > 0.5) this.play('thunder', undefined as never, null, { bus: 'amb', gain: 0.7, delay: 1.5 });
    });
    on('outcome', () => this.updateMusic(this.rc.getState(), true));
  }

  private cityBells(tolls: number, alarm: boolean): void {
    const id = CHURCHES[Math.floor(Math.random() * CHURCHES.length)];
    this.play('bells', { tolls, alarm }, landmarkTile(id));
  }

  private startFire(key: string, at: Tile, seconds: number): void {
    if (this.fires.has(key)) {
      this.fires.get(key)!.until = this.clock + seconds;
      return;
    }
    if (this.fires.size >= 5) {
      // drop the one ending soonest
      let k0: string | null = null;
      let u0 = Infinity;
      for (const [k, f] of this.fires) if (f.until < u0) (u0 = f.until), (k0 = k);
      if (k0) {
        this.fires.get(k0)!.loop.stop(1);
        this.fires.delete(k0);
      }
    }
    const loop = engine.loop('sfx');
    if (!loop) return;
    try {
      fireBed(loop.dest, 3600, 1);
    } catch (err) {
      loop.stop(0);
      return;
    }
    const p = this.rc.world.toWorld(at.tx, at.ty);
    loop.setLevel(0.85, 0.6);
    loop.setSpatial(spatialize(p.x, p.y, this.view(), 1.2), 0.05);
    this.fires.set(key, { loop, x: p.x, y: p.y, until: this.clock + seconds });
  }

  // ───────────────────────────── per frame ─────────────────────────────

  update(state: GameState, dt: number): void {
    this.clock += dt;
    if (!engine.ready) return;
    const v = this.view();

    // Fire loops: follow the camera, expire, sync burning ships.
    for (const s of state.ships) {
      if (s.status === 'yaniyor') {
        const key = 'ship:' + s.id;
        const f = this.fires.get(key);
        if (f) {
          f.until = this.clock + 2;
          const p = this.rc.world.toWorld(s.tx, s.ty);
          f.x = p.x;
          f.y = p.y;
        } else this.startFire(key, { tx: s.tx, ty: s.ty }, 2);
      }
    }
    for (const [k, f] of this.fires) {
      if (this.clock > f.until) {
        f.loop.stop(2.5);
        this.fires.delete(k);
      } else f.loop.setSpatial(spatialize(f.x, f.y, v, 1.2), 0.2);
    }

    // Expire stale assaults (no clash for 25 s).
    for (const [k, a] of this.assaults) if (this.clock - a.last > 25) this.assaults.delete(k);

    this.ambT -= dt;
    if (this.ambT <= 0) {
      this.ambT = 0.3;
      ambience.setWeights(this.weights(state, v));
    }
    ambience.tick(dt);
    if (state.time.speed > 0) this.rhythmic(state, v, dt);

    this.musicT -= dt;
    if (this.musicT <= 0) {
      this.musicT = 0.5;
      this.updateMusic(state, false);
    }
  }

  /** Marching feet, hooves, oars, alarm bells during the final assault. */
  private rhythmic(state: GameState, v: View, dt: number): void {
    this.stepT -= dt;
    if (this.stepT <= 0) {
      this.stepT = 0.56;
      let foot: { g: GameState['groups'][number]; s: Spatial } | null = null;
      let horse: { g: GameState['groups'][number]; s: Spatial } | null = null;
      for (const g of state.groups) {
        if (g.status !== 'yuruyor' && g.status !== 'cekiliyor') continue;
        const p = this.rc.world.toWorld(g.tx, g.ty);
        const s = spatialize(p.x, p.y, v, 0.8);
        if (s.gain < 0.08) continue;
        const cav = g.type === 'sipahi' || g.type === 'akinci';
        if (cav) {
          if (!horse || s.gain > horse.s.gain) horse = { g, s };
        } else if (!foot || s.gain > foot.s.gain) foot = { g, s };
      }
      if (foot) this.play('step', { men: foot.g.men, armor: foot.g.type === 'yeniceri' }, { tx: foot.g.tx, ty: foot.g.ty });
      if (horse && Math.random() < 0.9) this.play('hooves', { gallop: horse.g.type === 'akinci' }, { tx: horse.g.tx, ty: horse.g.ty });
      if (horse && Math.random() < 0.03) this.play('neigh', undefined as never, { tx: horse.g.tx, ty: horse.g.ty });
    }
    this.oarT -= dt;
    if (this.oarT <= 0) {
      this.oarT = 2.3;
      let best: { tx: number; ty: number; galley: boolean; g: number } | null = null;
      for (const s of state.ships) {
        if (s.status !== 'seyir' && s.status !== 'savas') continue;
        const p = this.rc.world.toWorld(s.tx, s.ty);
        const sp = spatialize(p.x, p.y, v, 0.9);
        if (sp.gain < 0.08) continue;
        if (!best || sp.gain > best.g) best = { tx: s.tx, ty: s.ty, galley: GALLEYS.has(s.type), g: sp.gain };
      }
      if (best) {
        if (best.galley) this.play('oars', { n: 3 }, best);
        else if (Math.random() < 0.5) this.play('sail', undefined as never, best);
        if (Math.random() < 0.35) this.play('creak', { dur: 1.1, pitch: 0.75 }, best, { delay: 0.6 });
      }
    }
    // A distant church bell now and then when the city fills the view (daytime, siege).
    if (this.cityW > 0.3 && state.time.phase === 'kusatma' && Math.random() < dt * 0.01 * this.cityW && this.throttle.allow('citybell', this.clock, 25)) {
      this.cityBells(2 + Math.floor(Math.random() * 3), false);
    }
    // Alarm bells across the city during the final assault (historically the bells rang all night).
    if (state.flags[FLAG.sonHucum] && !state.flags[FLAG.sehirDustu]) {
      this.bellT -= dt;
      if (this.bellT <= 0) {
        this.bellT = 2.5 + Math.random() * 3;
        this.cityBells(3, true);
      }
    }
  }

  /** Sample the camera view to weight the ambience beds. */
  private weights(state: GameState, v: View): AmbWeights {
    const world = this.rc.world;
    let water = 0;
    let city = 0;
    let n = 0;
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 4; j++) {
        const wx = v.x + ((i + 0.5) / 6) * v.w;
        const wy = v.y + ((j + 0.5) / 4) * v.h;
        const t = world.toTile(wx, wy);
        const tx = Math.round(t.tx);
        const ty = Math.round(t.ty);
        n++;
        if (!world.inBounds(tx, ty)) continue;
        if (world.isWater(tx, ty)) water++;
        else {
          const r = world.regionAt(tx, ty);
          if (r === 'sur-ici' || r === 'galata') city++;
        }
      }
    }
    const fw = water / n;
    const fc = city / n;
    // Camp: men and camp buildings near the view.
    const margin = 0.25;
    const x0 = v.x - v.w * margin;
    const x1 = v.x + v.w * (1 + margin);
    const y0 = v.y - v.h * margin;
    const y1 = v.y + v.h * (1 + margin);
    let men = 0;
    for (const g of state.groups) {
      if (g.status === 'uzakta') continue;
      const p = world.toWorld(g.tx, g.ty);
      if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1) men += g.men;
    }
    let work = 0;
    for (const b of state.buildings) {
      const p = world.toWorld(b.tx, b.ty);
      if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
      if (b.type === 'ordugah-cadirlari' || b.type === 'otag') men += 1500;
      if (!b.built && b.workers > 0) work += 0.4;
    }
    const zoomNear = (v.zoom - 1) / 3; // 0 at zoom 1, 1 at zoom 4
    const detail = 0.55 + 0.45 * zoomNear;
    const camp = smooth01(men / 5000) * detail;
    // Battle din: nearest active assault (or naval battle).
    let battle = 0;
    for (const a of this.assaults.values()) {
      const p = world.toWorld(a.at.tx, a.at.ty);
      const s = spatialize(p.x, p.y, v, 2);
      battle = Math.max(battle, s.gain * (0.5 + 0.5 * a.intensity));
    }
    if (this.navalBattle) {
      for (const s of state.ships) {
        if (s.status !== 'savas') continue;
        const p = world.toWorld(s.tx, s.ty);
        battle = Math.max(battle, spatialize(p.x, p.y, v, 1.5).gain * 0.6);
      }
    }
    const day = lightLevel(state);
    const w = this.weather(state);
    const rain = w.kind === 'yagmur' ? w.intensity : w.kind === 'kar' ? w.intensity * 0.15 : 0;
    const hail = w.kind === 'dolu' ? w.intensity : 0;
    const se = season(state);
    const birds = (se === 'kis' ? 0.15 : se === 'sonbahar' ? 0.5 : 1) * (1 - rain) * (1 - hail);
    const wind = Math.min(1, 0.22 + 0.35 * (1 - zoomNear) + 0.5 * Math.max(rain, hail) + (w.kind === 'kar' ? 0.3 : 0) + 0.15 * fw);
    this.cityW = Math.min(1, fc * 2);
    return {
      sea: Math.min(1, fw * 2.2) * (0.75 + 0.25 * zoomNear),
      swell: smooth01((fw - 0.4) / 0.6),
      wind,
      rain,
      hail,
      camp,
      city: Math.min(1, fc * 2) * detail,
      battle: Math.min(1, battle),
      day,
      land: 1 - fw,
      birds,
      work: Math.min(1, work) * detail,
    };
  }

  private weather(state: GameState): { kind: string; intensity: number } {
    try {
      const w = currentWeather(state);
      if (w && w.kind !== 'acik') return w;
    } catch {
      /* atmosphere not ready */
    }
    if (this.weatherEvt && this.clock - this.weatherEvt.at < 120) return this.weatherEvt;
    return { kind: 'acik', intensity: 0 };
  }

  // ───────────────────────────── music ─────────────────────────────

  private desiredMode(state: GameState): MusicMode {
    const screen = this.rc.store.ui.screen;
    if (screen === 'baslik') return 'baslik';
    if (state.outcome) return state.outcome.result === 'zafer' ? 'zafer' : 'yenilgi';
    if (screen === 'yukleniyor') return 'sessiz';
    const assault = this.assaults.size > 0 || this.clock - this.lastAssaultEnd < 12;
    if (this.mehter || assault || state.flags[FLAG.sonHucum]) return 'hucum';
    switch (state.time.phase) {
      case 'hazirlik':
        return 'hazirlik';
      case 'yuruyus':
        return 'yuruyus';
      case 'kusatma':
        return segmentOf(state.time.day) === 'gece' ? 'gece' : 'kusatma';
      default:
        return 'kusatma';
    }
  }

  private updateMusic(state: GameState, urgent: boolean): void {
    const m = this.desiredMode(state);
    const immediate = urgent || m === 'hucum' || m === 'zafer' || m === 'yenilgi' || m === 'baslik' || music.mode === 'sessiz';
    if (m !== this.candidate) {
      this.candidate = m;
      this.candidateSince = this.clock;
    }
    if (m === music.mode) return;
    if (immediate || this.clock - this.candidateSince > 2.5) {
      const fade = m === 'hucum' ? 1.5 : m === 'zafer' || m === 'yenilgi' ? 2 : 4;
      music.setMode(m, fade);
    }
    // Ambience a bit lower under the title.
    ambience.setLevel(this.rc.store.ui.screen === 'baslik' ? 0.6 : 1);
  }
}

function rand01(): number {
  return Math.random();
}
