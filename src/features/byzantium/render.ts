import type Phaser from 'phaser';
import { P, hex } from '../../art/palette';
import { segmentOf } from '../../core/calendar';
import type { RenderContext } from '../../core/feature';
import { FLAG } from '../../core/flags';
import type { LightHandle, LoopHandle } from '../../core/fx';
import { hash2 } from '../../core/rng';
import type { GameState, SectionId } from '../../core/state';
import { lightLevel } from '../atmosphere/api';
import { gatePositions, sectionCenter, sectionLength, sectionOutwardNormal, sectionPoint } from '../fortifications/api';
import { FOOT_Y, ISCI_H, ISCI_W, isciAnim, OUTFITS, SORTI_VARIANTS, YAPI_FRAMES, YAPI_H, type IsciAct } from './art';
import { repairNeed } from './sim';
import { byzPriv } from './state';

/**
 * BYZANTIUM RENDER — the city's night: repair crews with lanterns hauling beams and baskets
 * of earth to the breaches, mallets driving stakes, stockade pieces rising one by one, and
 * torch-lit sortie parties bursting out of a postern. Pooled, culled, never mutates state.
 */

type Spr = Phaser.GameObjects.Sprite;
interface Pt {
  x: number;
  y: number;
}

const CULL = 160;
const MAX_WORKERS = 72;
const MAX_LIGHTS = 20;
const MAX_FIRES = 3;
/** Tiles beyond the wall line where a sortie party emerges (outer wall face / peribolos). */
const POSTERN_OUT = 2.8;
const WALK_SPEED = 11; // world px / s
const RUN_SPEED = 30;
const FIRE = hex(P.fire[4]);
const LANTERN = hex(P.fire[5]);

interface Prop {
  spr: Spr;
  /** rise animation time (s), −1 = settled */
  t: number;
  x: number;
  y: number;
  alive: boolean;
}

interface Spot {
  t: number;
  work: Pt;
  supply: Pt;
  /** tangent (world px per unit) for spreading things along the wall */
  tan: Pt;
  /** inward unit (world px) */
  inn: Pt;
  pole: Spr | null;
  light: LightHandle | null;
  /** Material pile at the supply point (beams / sacks of earth). */
  pile: Spr | null;
  /** Small work fire by the pile (main sites only). */
  fire: LoopHandle | null;
  props: Prop[];
}

interface Site {
  id: SectionId;
  share: number;
  spots: Spot[];
  workers: Worker[];
  inView: boolean;
  seen: boolean;
}

type Phase = 'al' | 'gidis' | 'birak' | 'donus' | 'cekic' | 'fener';

interface Worker {
  spr: Spr;
  site: Site;
  spot: Spot;
  v: number;
  load: IsciAct;
  phase: Phase;
  timer: number;
  from: Pt;
  to: Pt;
  x: number;
  y: number;
  /** lantern walker: param along the wall */
  u: number;
  dir: number;
  light: LightHandle | null;
  alpha: number;
  leaving: boolean;
  lastFrame: number;
}

interface Runner {
  spr: Spr;
  from: Pt;
  to: Pt;
  x: number;
  y: number;
  delay: number;
  light: LightHandle | null;
  v: number;
}

interface Party {
  runners: Runner[];
  phase: 'cik' | 'vur' | 'don' | 'bitti';
  t: number;
  gate: Pt;
  target: Pt;
  fxT: number;
}

class Pool {
  private free: Spr[] = [];
  constructor(
    private scene: Phaser.Scene,
    private key: string,
    private oy: number,
  ) {}
  get(): Spr {
    const s = this.free.pop() ?? this.scene.add.sprite(0, 0, this.key, 0).setOrigin(0.5, this.oy);
    s.setVisible(true).setAlpha(1).setFlipX(false);
    return s;
  }
  put(s: Spr): void {
    s.anims.stop();
    s.setVisible(false);
    this.free.push(s);
  }
  destroy(): void {
    for (const s of this.free) s.destroy();
    this.free = [];
  }
}

export class ByzRender {
  private scene: Phaser.Scene;
  private workers: Pool;
  private props: Pool;
  private poles: Pool;
  private sparks: Pool;
  private runners: Pool;
  private sites = new Map<SectionId, Site>();
  private parties: Party[] = [];
  private lightCount = 0;
  private refreshAcc = 1;
  private time = 0;
  private dustBudget = 0;
  private gates: { x: number; y: number; tx: number; ty: number }[] = [];
  private offs: (() => void)[] = [];
  private activeSparks: { spr: Spr; t: number }[] = [];
  private nightVis = 0;
  private fireCount = 0;
  /** Frames since createRender: things that exist when a scene starts appear at once (no fade-in). */
  private frames = 0;
  private lastView = { x: NaN, y: NaN, w: 0 };

  constructor(private rc: RenderContext) {
    this.scene = rc.scene;
    const oyW = (FOOT_Y + 0.5) / ISCI_H;
    this.workers = new Pool(this.scene, 'byz/isci', oyW);
    this.runners = new Pool(this.scene, 'byz/sorti', oyW);
    this.props = new Pool(this.scene, 'byz/yapi', (YAPI_H - 1.5) / YAPI_H);
    this.poles = new Pool(this.scene, 'byz/fener', 1);
    this.sparks = new Pool(this.scene, 'byz/kivilcim', 0.5);
    try {
      this.gates = gatePositions()
        .filter((g) => !g.sea)
        .map((g) => ({ ...rc.world.toWorld(g.tx, g.ty), tx: g.tx, ty: g.ty }));
    } catch {
      this.gates = [];
    }
    this.offs.push(rc.bus.on('sortie', (e) => this.spawnSortie(e.sectionId, e.at)));
    // QA hook (visual only — emits nothing into the simulation)
    (window as unknown as { __byz?: unknown }).__byz = {
      owner: this,
      sortie: (id: SectionId = 'kara-lykos') => {
        const c = sectionCenter(id);
        const n = sectionOutwardNormal(id);
        this.spawnSortie(id, { tx: c.tx + n.tx * 4, ty: c.ty + n.ty * 4 }, true);
      },
      /** Advance only this renderer's animation clock (slow headless QA runs). */
      step: (sec = 1) => {
        const st = rc.getState();
        for (let t = 0; t < sec; t += 1 / 30) this.update(st, 1 / 30);
      },
      info: () => ({
        nightVis: this.nightVis,
        lights: this.lightCount,
        time: this.time,
        refreshAcc: this.refreshAcc,
        view: (({ x, y, width, height }) => ({ x, y, width, height }))(this.view()),
        parties: this.parties.length,
        runners: this.parties.map((p) => ({ phase: p.phase, gate: p.gate, target: p.target, r: p.runners.map((r) => [Math.round(r.x), Math.round(r.y), +r.spr.alpha.toFixed(2)]) })),
        sites: [...this.sites.values()].map((s) => ({
          id: s.id,
          share: s.share,
          inView: s.inView,
          workers: s.workers.length,
          spots: s.spots.map((sp) => ({ work: sp.work, supply: sp.supply, props: sp.props.length, pole: !!sp.pole })),
        })),
      }),
    };
  }

  destroy(): void {
    const w = window as unknown as { __byz?: { owner?: unknown } };
    if (w.__byz?.owner === this) delete w.__byz;
    for (const off of this.offs) off();
    this.offs = [];
    for (const site of this.sites.values()) this.dropSite(site, true);
    this.sites.clear();
    for (const p of this.parties) this.endParty(p);
    this.parties = [];
    this.workers.destroy();
    this.props.destroy();
    this.poles.destroy();
    this.sparks.destroy();
    this.runners.destroy();
  }

  // ───────────────────────────── helpers ─────────────────────────────

  /** True during the first frames after a scene (re)start: spawn fully visible, settled. */
  private warm(): boolean {
    return this.frames <= 3;
  }

  private view(): Phaser.Geom.Rectangle {
    return this.scene.cameras.main.worldView;
  }

  private inView(x: number, y: number, m = CULL): boolean {
    const v = this.view();
    return x > v.x - m && x < v.right + m && y > v.y - m && y < v.bottom + m;
  }

  private w(tx: number, ty: number): Pt {
    const p = this.rc.world.toWorld(tx, ty);
    return { x: p.x, y: p.y };
  }

  private light(x: number, y: number, color: number, r: number, i: number): LightHandle | null {
    if (this.lightCount >= MAX_LIGHTS) return null;
    this.lightCount++;
    return this.rc.fx.light(x, y, color, r, i);
  }

  private freeLight(h: LightHandle | null): null {
    if (h) {
      h.destroy();
      this.lightCount--;
    }
    return null;
  }

  private dust(x: number, y: number, size: number): void {
    if (this.dustBudget <= 0 || !this.inView(x, y, 20)) return;
    this.dustBudget--;
    this.rc.fx.dust(x, y, size);
  }

  private spark(x: number, y: number): void {
    if (this.activeSparks.length > 24 || !this.inView(x, y, 10)) return;
    const s = this.sparks.get();
    s.setPosition(Math.round(x), Math.round(y)).setDepth(y + 2).setFrame(0);
    s.play('byz/kivilcim:cak');
    this.activeSparks.push({ spr: s, t: 0.3 });
  }

  // ───────────────────────────── sites (night repairs) ─────────────────────────────

  private makeSite(state: GameState, id: SectionId): Site {
    const s = state.sections[id];
    const sea = s.kind !== 'kara';
    const len = sectionLength(id);
    const n = Math.max(1, Math.min(3, Math.round(len / 3.2)));
    const spots: Spot[] = [];
    const idx = Object.keys(state.sections).indexOf(id);
    for (let k = 0; k < n; k++) {
      const t = Math.max(0.12, Math.min(0.88, 0.5 + (k - (n - 1) / 2) * 0.2 + (hash2(idx, k, 91) - 0.5) * 0.08));
      const c = sectionPoint(id, t);
      const nn = sectionOutwardNormal(id, t);
      const nWork = sea ? -0.55 : -0.32;
      const nSup = sea ? -2.1 : -2.5;
      const work = this.w(c.tx + nn.tx * nWork, c.ty + nn.ty * nWork);
      const supply = this.w(c.tx + nn.tx * nSup + (hash2(idx, k, 3) - 0.5) * 0.8, c.ty + nn.ty * nSup + (hash2(idx, k, 4) - 0.5) * 0.8);
      const c2 = sectionPoint(id, Math.min(1, t + 0.05));
      const a = this.w(c.tx, c.ty);
      const b = this.w(c2.tx, c2.ty);
      const tl = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const tan = { x: (b.x - a.x) / tl, y: (b.y - a.y) / tl };
      const ip = this.w(c.tx - nn.tx, c.ty - nn.ty);
      const il = Math.hypot(ip.x - a.x, ip.y - a.y) || 1;
      const inn = { x: (ip.x - a.x) / il, y: (ip.y - a.y) / il };
      spots.push({ t, work, supply, tan, inn, pole: null, light: null, pile: null, fire: null, props: [] });
    }
    return { id, share: 0, spots, workers: [], inView: false, seen: false };
  }

  private dropSite(site: Site, hard: boolean): void {
    for (const wk of site.workers) this.releaseWorker(wk);
    site.workers = [];
    for (const sp of site.spots) {
      if (sp.pole) this.poles.put(sp.pole);
      sp.pole = null;
      sp.light = this.freeLight(sp.light);
      this.dropDecor(sp);
      if (hard) {
        for (const pr of sp.props) this.props.put(pr.spr);
        sp.props = [];
      }
    }
  }

  private dropDecor(sp: Spot): void {
    if (sp.pile) this.props.put(sp.pile);
    sp.pile = null;
    if (sp.fire) {
      sp.fire.destroy();
      sp.fire = null;
      this.fireCount--;
    }
  }

  private shares(state: GameState, night: boolean): Map<SectionId, number> {
    const out = new Map<SectionId, number>();
    if (!night) return out;
    const p = byzPriv(state);
    let any = false;
    for (const id in p.work) {
      if (p.work[id] > 0.02) {
        out.set(id, p.work[id]);
        any = true;
      }
    }
    if (any) return out;
    // paused/just-loaded: derive from the walls themselves
    let sum = 0;
    const tmp: [SectionId, number][] = [];
    for (const id in state.sections) {
      const s = state.sections[id];
      const need = repairNeed(s);
      if (need < 0.03) continue;
      const wv = need * (1 + s.threat / 50);
      tmp.push([id, wv]);
      sum += wv;
    }
    for (const [id, wv] of tmp) out.set(id, Math.min(0.7, wv / sum));
    return out;
  }

  private refreshSites(state: GameState, night: boolean): void {
    const shares = this.shares(state, night);
    // drop sites no longer worked
    for (const [id, site] of this.sites) {
      if (!shares.has(id)) {
        site.share = 0;
        for (const wk of site.workers) wk.leaving = true;
      }
    }
    let budget = MAX_WORKERS;
    const ordered = [...shares.entries()].sort((a, b) => b[1] - a[1]);
    for (const [id, share] of ordered) {
      if (!state.sections[id]) continue;
      let site = this.sites.get(id);
      if (!site) {
        site = this.makeSite(state, id);
        this.sites.set(id, site);
      }
      site.share = share;
      site.inView = site.spots.some((sp) => this.inView(sp.work.x, sp.work.y) || this.inView(sp.supply.x, sp.supply.y));
      const want = site.inView ? Math.min(budget, Math.max(4, Math.min(18, Math.round(share * 42)))) : 0;
      budget -= want;
      this.balanceWorkers(site, want);
      // lantern poles, material piles and a work fire at spots (only in view)
      site.spots.forEach((sp, si) => {
        if (site.inView && !sp.pile) {
          const x = sp.supply.x + sp.tan.x * 7;
          const y = sp.supply.y + sp.tan.y * 7;
          sp.pile = this.props.get();
          sp.pile.setFrame(si % 2 === 0 ? 0 : 6).setPosition(Math.round(x), Math.round(y)).setDepth(y);
        }
        if (site.inView && !sp.fire && si === 0 && share >= 0.2 && this.fireCount < MAX_FIRES) {
          const x = sp.supply.x - sp.tan.x * 9 + sp.inn.x * 2;
          const y = sp.supply.y - sp.tan.y * 9 + sp.inn.y * 2;
          sp.fire = this.rc.fx.fire(Math.round(x), Math.round(y), 0.55);
          this.fireCount++;
        }
        if (!site.inView) this.dropDecor(sp);
        if (site.inView && !sp.pole) {
          const off = 9;
          const px = sp.work.x + sp.tan.x * off + sp.inn.x * 3;
          const py = sp.work.y + sp.tan.y * off + sp.inn.y * 3;
          sp.pole = this.poles.get();
          sp.pole.setPosition(Math.round(px), Math.round(py)).setDepth(py).setAlpha(this.warm() ? 1 : 0);
          sp.pole.play({ key: 'byz/fener:yan', startFrame: Math.floor(Math.random() * 4) });
          sp.light = this.light(px + 2, py - 12, LANTERN, 60, 0);
        } else if (!site.inView && sp.pole) {
          this.poles.put(sp.pole);
          sp.pole = null;
          sp.light = this.freeLight(sp.light);
        }
      });
    }
  }

  private balanceWorkers(site: Site, want: number): void {
    const active = site.workers.filter((w) => !w.leaving);
    if (active.length > want) {
      for (let i = want; i < active.length; i++) active[i].leaving = true;
      return;
    }
    for (let i = active.length; i < want; i++) site.workers.push(this.newWorker(site, i));
  }

  private newWorker(site: Site, i: number): Worker {
    const spot = site.spots[i % site.spots.length];
    const r = Math.random();
    // roles: the first two per spot hammer, one lantern-bearer per site, the rest haul
    const perSpot = Math.floor(i / site.spots.length);
    let phase: Phase = 'al';
    if (perSpot < 2) phase = 'cekic';
    else if (perSpot === 2 && i % site.spots.length === 0) phase = 'fener';
    // outfits: hammerers mostly soldiers/townsmen; haulers anyone; lantern: monks & women
    let v: number;
    if (phase === 'cekic') v = r < 0.55 ? 0 : 3;
    else if (phase === 'fener') v = r < 0.5 ? 1 : 2;
    else v = Math.floor(Math.random() * OUTFITS.length);
    const spr = this.workers.get();
    const load: IsciAct = Math.random() < 0.5 ? 'kiris' : 'sepet';
    const wk: Worker = {
      spr,
      site,
      spot,
      v,
      load,
      phase,
      timer: Math.random() * 1.5,
      from: spot.supply,
      to: spot.work,
      x: 0,
      y: 0,
      u: Math.random(),
      dir: Math.random() < 0.5 ? 1 : -1,
      light: null,
      alpha: 0,
      leaving: false,
      lastFrame: -1,
    };
    if (phase === 'cekic') {
      const side = perSpot === 0 ? -1 : 1;
      wk.x = spot.work.x + spot.tan.x * side * (5 + Math.random() * 3) + spot.inn.x * (Math.random() * 3);
      wk.y = spot.work.y + spot.tan.y * side * (5 + Math.random() * 3) + spot.inn.y * (Math.random() * 3);
      spr.setFlipX(side > 0);
      spr.play({ key: isciAnim(v, 'cekic'), startFrame: Math.floor(Math.random() * 4) });
    } else if (phase === 'fener') {
      this.placeLantern(wk, 0);
      spr.play({ key: isciAnim(v, 'fener'), startFrame: Math.floor(Math.random() * 4) });
      wk.light = this.light(wk.x, wk.y - 10, FIRE, 38, 0);
    } else {
      // haulers start somewhere along their route
      const k = Math.random();
      const going = Math.random() < 0.5;
      wk.phase = going ? 'gidis' : 'donus';
      wk.from = going ? spot.supply : spot.work;
      wk.to = going ? spot.work : spot.supply;
      wk.x = wk.from.x + (wk.to.x - wk.from.x) * k;
      wk.y = wk.from.y + (wk.to.y - wk.from.y) * k;
      this.jitterRoute(wk);
      spr.play({ key: isciAnim(v, going ? load : 'yuru'), startFrame: Math.floor(Math.random() * 4) });
    }
    if (this.warm()) wk.alpha = 1;
    spr.setPosition(Math.round(wk.x), Math.round(wk.y)).setDepth(wk.y).setAlpha(0);
    return wk;
  }

  private jitterRoute(wk: Worker): void {
    const sp = wk.spot;
    const lat = (Math.random() - 0.5) * 14;
    const end = { x: wk.to.x + sp.tan.x * lat, y: wk.to.y + sp.tan.y * lat };
    wk.to = end;
  }

  private placeLantern(wk: Worker, dt: number): void {
    const site = wk.site;
    const a = site.spots[0];
    const b = site.spots[site.spots.length - 1];
    wk.u += (wk.dir * dt * 4) / Math.max(20, Math.hypot(b.work.x - a.work.x, b.work.y - a.work.y) + 30);
    if (wk.u > 1) {
      wk.u = 1;
      wk.dir = -1;
    } else if (wk.u < 0) {
      wk.u = 0;
      wk.dir = 1;
    }
    const spanX = b.work.x - a.work.x;
    const spanY = b.work.y - a.work.y;
    const ext = 14;
    const x = a.work.x - a.tan.x * ext + (spanX + a.tan.x * 2 * ext) * wk.u + a.inn.x * 9;
    const y = a.work.y - a.tan.y * ext + (spanY + a.tan.y * 2 * ext) * wk.u + a.inn.y * 9;
    const dx = x - wk.x;
    wk.x = x;
    wk.y = y;
    if (Math.abs(dx) > 0.01) wk.spr.setFlipX(dx < 0);
  }

  private releaseWorker(wk: Worker): void {
    this.workers.put(wk.spr);
    wk.light = this.freeLight(wk.light);
  }

  private updateWorker(wk: Worker, dt: number): boolean {
    const target = wk.leaving ? 0 : 1;
    wk.alpha += (target - wk.alpha) * Math.min(1, dt * 2.5);
    if (wk.leaving && wk.alpha < 0.03) {
      this.releaseWorker(wk);
      return false;
    }
    const spr = wk.spr;
    switch (wk.phase) {
      case 'cekic': {
        const fr = spr.anims.currentFrame?.index ?? 0;
        if (fr !== wk.lastFrame) {
          wk.lastFrame = fr;
          if (fr === 3 && Math.random() < 0.45) {
            const fx = spr.flipX ? -1 : 1;
            this.spark(wk.x + fx * 6, wk.y - 3);
          }
          if (fr === 3 && Math.random() < 0.05) this.dust(wk.x + (spr.flipX ? -6 : 6), wk.y, 0.5);
        }
        break;
      }
      case 'fener': {
        this.placeLantern(wk, dt);
        if (wk.light) {
          wk.light.setPosition(wk.x + (spr.flipX ? -4 : 4), wk.y - 8);
          wk.light.setIntensity(1.15 * this.nightVis * wk.alpha * (0.8 + 0.15 * Math.sin(this.time * 9 + wk.u * 20)));
        }
        break;
      }
      case 'al':
      case 'birak': {
        wk.timer -= dt;
        if (wk.timer <= 0) {
          if (wk.phase === 'birak') {
            this.dust(wk.x, wk.y, 0.6);
            wk.phase = 'donus';
            wk.from = { x: wk.x, y: wk.y };
            wk.to = wk.spot.supply;
            spr.play(isciAnim(wk.v, 'yuru'));
          } else {
            wk.phase = 'gidis';
            wk.from = { x: wk.x, y: wk.y };
            wk.to = wk.spot.work;
            this.jitterRoute(wk);
            wk.load = Math.random() < 0.5 ? 'kiris' : 'sepet';
            spr.play(isciAnim(wk.v, wk.load));
          }
        }
        break;
      }
      case 'gidis':
      case 'donus': {
        const dx = wk.to.x - wk.x;
        const dy = wk.to.y - wk.y;
        const dist = Math.hypot(dx, dy);
        const sp = WALK_SPEED * (wk.phase === 'gidis' ? 0.85 : 1.1);
        if (dist < 1.5) {
          wk.phase = wk.phase === 'gidis' ? 'birak' : 'al';
          wk.timer = wk.phase === 'birak' ? 0.5 + Math.random() * 0.5 : 0.6 + Math.random() * 1.4;
          spr.anims.stop();
          spr.setFrame(spr.anims.currentAnim ? spr.anims.currentAnim.frames[0].frame.name : spr.frame.name);
        } else {
          const k = Math.min(dist, sp * dt) / dist;
          wk.x += dx * k;
          wk.y += dy * k;
          if (Math.abs(dx) > 0.05) spr.setFlipX(dx < 0);
        }
        break;
      }
    }
    spr.setPosition(Math.round(wk.x), Math.round(wk.y)).setDepth(wk.y).setAlpha(wk.alpha * Math.max(0.15, this.nightVis));
    return true;
  }

  private updateProps(state: GameState, site: Site | undefined, id: SectionId, dt: number, show: boolean): void {
    if (!site) return;
    const s = state.sections[id];
    const bar = s ? Math.max(0, Math.min(1, s.barricade)) : 0;
    const per = show && site.inView ? Math.min(6, Math.floor(bar * 6.5 + (site.share > 0 ? 1 : 0))) : 0;
    site.spots.forEach((sp, si) => {
      // spawn missing pieces (rise one by one)
      let alive = sp.props.filter((pr) => pr.alive).length;
      while (alive < per && (this.warm() || !sp.props.some((pr) => pr.t >= 0 && pr.t < 0.25))) {
        const k = alive;
        const side = k % 2 === 0 ? 1 : -1;
        const along = (Math.floor((k + 1) / 2) * 9 + (hash2(si, k, 5) - 0.5) * 3) * side;
        const deep = (k % 3) * 2.5 - 1;
        const x = sp.work.x + sp.tan.x * along + sp.inn.x * deep;
        const y = sp.work.y + sp.tan.y * along + sp.inn.y * deep;
        const spr = this.props.get();
        const frame = Math.floor(hash2(si * 7 + k, site.id.length, 17) * YAPI_FRAMES);
        if (this.warm()) {
          spr.setFrame(frame).setPosition(Math.round(x), Math.round(y)).setDepth(y).setAlpha(1);
          sp.props.push({ spr, t: -1, x, y, alive: true });
        } else {
          spr.setFrame(frame).setPosition(Math.round(x), Math.round(y - 8)).setDepth(y).setAlpha(0);
          sp.props.push({ spr, t: 0, x, y, alive: true });
        }
        alive++;
      }
      // retire extra pieces
      if (alive > per) {
        const lastAlive = [...sp.props].reverse().find((pr) => pr.alive);
        if (lastAlive) lastAlive.alive = false;
      }
      for (let i = sp.props.length - 1; i >= 0; i--) {
        const pr = sp.props[i];
        if (!pr.alive) {
          pr.spr.setAlpha(pr.spr.alpha - dt * 0.6);
          if (pr.spr.alpha <= 0.02) {
            this.props.put(pr.spr);
            sp.props.splice(i, 1);
          }
          continue;
        }
        if (pr.t >= 0) {
          pr.t += dt;
          const k = Math.min(1, pr.t / 0.35);
          // drop in with a little bounce
          const off = k < 0.7 ? -8 * (1 - k / 0.7) * (1 - k / 0.7) : -1.5 * Math.sin(((k - 0.7) / 0.3) * Math.PI);
          pr.spr.setPosition(Math.round(pr.x), Math.round(pr.y + off)).setAlpha(Math.min(1, k * 2.5));
          if (k >= 1) {
            pr.t = -1;
            pr.spr.setPosition(Math.round(pr.x), Math.round(pr.y));
            this.dust(pr.x, pr.y, 0.7);
          }
        }
      }
    });
  }

  // ───────────────────────────── sorties ─────────────────────────────

  private spawnSortie(id: SectionId, at: { tx: number; ty: number }, force = false): void {
    if (this.parties.length >= 2) return;
    const target = this.w(at.tx, at.ty);
    if (!force && !this.inView(target.x, target.y, 260)) return;
    // nearest postern / gate along the land walls
    let gate: Pt | null = null;
    let bd = Infinity;
    for (const g of this.gates) {
      const dd = Math.hypot(g.x - target.x, g.y - target.y);
      if (dd < bd) {
        bd = dd;
        gate = g;
      }
    }
    // posterns open onto the peribolos: the party appears just beyond the outer wall face
    const nn = sectionOutwardNormal(id);
    let gt = this.gates.find((g) => g.x === gate?.x && g.y === gate?.y);
    if (!gt || bd > 220) {
      const c = sectionCenter(id);
      gt = { x: 0, y: 0, tx: c.tx, ty: c.ty };
    }
    gate = this.w(gt.tx + nn.tx * POSTERN_OUT, gt.ty + nn.ty * POSTERN_OUT);
    const genoa = id === 'kara-lykos' || id === 'kara-topkapi' || id === 'kara-egrikapi';
    const n = 6 + Math.floor(Math.random() * 3);
    const runners: Runner[] = [];
    for (let i = 0; i < n; i++) {
      const v = genoa ? (Math.random() < 0.7 ? 0 : 1) : Math.random() < 0.25 ? 0 : 1;
      const spr = this.runners.get();
      const spread = { x: (Math.random() - 0.5) * 22, y: (Math.random() - 0.5) * 11 };
      const r: Runner = {
        spr,
        from: { x: gate.x, y: gate.y },
        to: { x: target.x + spread.x, y: target.y + spread.y },
        x: gate.x,
        y: gate.y,
        delay: i * 0.22 + Math.random() * 0.15,
        light: i < 3 ? this.light(gate.x, gate.y - 14, FIRE, 40, 0) : null,
        v,
      };
      spr.setPosition(Math.round(gate.x), Math.round(gate.y)).setDepth(gate.y).setAlpha(0);
      spr.play({ key: `byz/sorti:${SORTI_VARIANTS[v]}-kos`, startFrame: i % 4 });
      runners.push(r);
    }
    this.parties.push({ runners, phase: 'cik', t: 0, gate, target, fxT: 0 });
  }

  private endParty(p: Party): void {
    for (const r of p.runners) {
      this.runners.put(r.spr);
      r.light = this.freeLight(r.light);
    }
    p.runners = [];
    p.phase = 'bitti';
  }

  private updateParty(p: Party, dt: number): void {
    p.t += dt;
    let arrived = 0;
    for (const r of p.runners) {
      if (r.delay > 0) {
        r.delay -= dt;
        r.spr.setAlpha(0);
        continue;
      }
      const dx = r.to.x - r.x;
      const dy = r.to.y - r.y;
      const dist = Math.hypot(dx, dy);
      if (p.phase === 'vur') {
        arrived++;
      } else if (dist < 2) {
        arrived++;
        if (p.phase === 'cik') {
          r.spr.play(`byz/sorti:${SORTI_VARIANTS[r.v]}-vur`, true);
          r.spr.setFlipX(p.target.x < r.x - 1 ? true : Math.random() < 0.5);
        }
      } else {
        const k = Math.min(dist, RUN_SPEED * dt) / dist;
        r.x += dx * k;
        r.y += dy * k;
        if (Math.abs(dx) > 0.05) r.spr.setFlipX(dx < 0);
      }
      const fade = p.phase === 'don' ? Math.min(1, dist / 14) : 1;
      r.spr.setPosition(Math.round(r.x), Math.round(r.y)).setDepth(r.y).setAlpha(Math.min(1, r.spr.alpha + dt * 4) * fade);
      if (r.light) {
        r.light.setPosition(r.x + (r.spr.flipX ? -4 : 4), r.y - 16);
        r.light.setIntensity(fade * (0.9 + 0.2 * Math.sin(this.time * 13 + r.x)));
      }
    }
    if (p.phase === 'cik' && arrived >= p.runners.length) {
      p.phase = 'vur';
      p.t = 0;
      this.rc.fx.flash(p.target.x, p.target.y - 6, FIRE, 70, 0.5);
    } else if (p.phase === 'vur') {
      p.fxT -= dt;
      if (p.fxT <= 0) {
        p.fxT = 0.18 + Math.random() * 0.25;
        const r = p.runners[Math.floor(Math.random() * p.runners.length)];
        if (r && this.inView(r.x, r.y, 20)) {
          this.rc.fx.sparks(r.x + (r.spr.flipX ? -7 : 7), r.y - 9, 3);
          if (Math.random() < 0.25) this.dust(r.x, r.y, 0.6);
        }
      }
      if (p.t > 2.2) {
        p.phase = 'don';
        for (const r of p.runners) {
          r.to = { x: p.gate.x + (Math.random() - 0.5) * 6, y: p.gate.y + (Math.random() - 0.5) * 3 };
          r.spr.play({ key: `byz/sorti:${SORTI_VARIANTS[r.v]}-kos`, startFrame: Math.floor(Math.random() * 4) });
        }
      }
    } else if (p.phase === 'don' && (arrived >= p.runners.length || p.t > 12)) {
      this.endParty(p);
    }
  }

  // ───────────────────────────── frame update ─────────────────────────────

  update(state: GameState, dt: number): void {
    this.time += dt;
    this.dustBudget = Math.min(6, this.dustBudget + dt * 4);
    const siege = state.time.phase === 'kusatma' && !state.flags[FLAG.sehirDustu];
    const seg = segmentOf(state.time.day);
    const light = lightLevel(state);
    const night = siege && (seg === 'gece' || (seg === 'safak' && light < 0.3));
    const targetVis = night ? Math.max(0, Math.min(1, (0.62 - light) / 0.3)) : 0;
    this.frames++;
    if (this.warm()) this.nightVis = targetVis;
    else this.nightVis += (targetVis - this.nightVis) * Math.min(1, dt * 1.5);

    // re-evaluate sites twice a second, at once when the camera jumps, and every early frame
    const v = this.view();
    const moved = Math.abs(v.x - this.lastView.x) + Math.abs(v.y - this.lastView.y) > 48 || v.width !== this.lastView.w || isNaN(this.lastView.x);
    this.refreshAcc += dt;
    if (this.refreshAcc > 0.5 || moved || this.warm()) {
      this.refreshAcc = 0;
      this.lastView.x = v.x;
      this.lastView.y = v.y;
      this.lastView.w = v.width;
      this.refreshSites(state, night);
    }

    // workers, lanterns and rising stockades
    for (const [id, site] of this.sites) {
      site.workers = site.workers.filter((wk) => this.updateWorker(wk, dt));
      for (const sp of site.spots) {
        if (sp.pole) {
          const a = Math.min(1, sp.pole.alpha + dt * 1.5) * (site.share > 0 ? 1 : 0);
          sp.pole.setAlpha(site.share > 0 ? Math.min(1, sp.pole.alpha + dt * 1.5) : Math.max(0, sp.pole.alpha - dt));
          if (sp.light) sp.light.setIntensity(1.35 * this.nightVis * Math.max(a, sp.pole.alpha) * (0.95 + 0.12 * Math.sin(this.time * 7.3 + sp.t * 40) + 0.05 * Math.sin(this.time * 17)));
          if (site.share <= 0 && sp.pole.alpha <= 0.01) {
            this.poles.put(sp.pole);
            sp.pole = null;
            sp.light = this.freeLight(sp.light);
            this.dropDecor(sp);
          }
        }
      }
      this.updateProps(state, site, id, dt, night && site.share > 0);
      if (site.share <= 0) for (const sp of site.spots) if (!sp.pole) this.dropDecor(sp);
      const empty = site.workers.length === 0 && site.spots.every((sp) => !sp.pole && !sp.pile && sp.props.length === 0);
      if (empty && site.share <= 0) this.sites.delete(id);
    }

    for (let i = this.activeSparks.length - 1; i >= 0; i--) {
      const s = this.activeSparks[i];
      s.t -= dt;
      if (s.t <= 0) {
        this.sparks.put(s.spr);
        this.activeSparks.splice(i, 1);
      }
    }

    for (const p of this.parties) this.updateParty(p, dt);
    this.parties = this.parties.filter((p) => p.phase !== 'bitti');
  }
}

/** Frame size exported for tests/docs. */
export const BYZ_SPRITE = { w: ISCI_W, h: ISCI_H };
