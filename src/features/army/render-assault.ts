import { hex, P } from '../../art/palette';
import type { RenderContext } from '../../core/feature';
import { FLAG } from '../../core/flags';
import type { TilePt } from '../../core/iso';
import type { GameState, SectionId } from '../../core/state';
import { sectionAt, sectionOutwardNormal, sectionPoint, towerPositions } from '../fortifications/api';
import { LADDER, ladderBaseX, ladderW } from './art';
import { assaultMembers } from './combat';
import { frameOf, hash, type Layout, type Spr, type SpritePool } from './render-util';
import { army } from './state';

/**
 * The assault spectacle: scaling ladders raised and pushed off, men climbing,
 * cresting or falling, Byzantine defenders on the battlements, arrows, stones
 * and fire pots, clash sparks at the breach, falling bodies, Ulubatlı Hasan and
 * the banners on the towers. Render-only.
 */

interface Climber {
  s: Spr;
  p: number;
  state: 'climb' | 'crest' | 'fall';
  t: number;
  x: number;
  y: number;
  vy: number;
  key: string;
}

interface Ladder {
  s: Spr;
  wallY: number;
  t: number;
  bx: number;
  by: number;
  topX: number;
  topY: number;
  flip: boolean;
  lean: 'u' | 'r';
  state: 'up' | 'fall' | 'down' | 'raise';
  timer: number;
  climbers: Climber[];
  spawn: number;
}

interface Defender {
  s: Spr;
  t: number;
  x: number;
  y: number;
  ground: boolean;
  phase: number;
  timer: number;
  key: string;
}

interface AssaultView {
  sid: SectionId;
  ladders: Ladder[];
  defs: Defender[];
  lastDef: number;
  shotT: number;
  crest: number;
  back: boolean;
  flip: boolean;
}

interface Dying {
  s: Spr;
  layout: Layout;
  t: number;
  y0: number;
  y1: number;
  vy: number;
  life: number;
}

const MAX_CORPSES = 150;

export class AssaultRenderer {
  private views = new Map<SectionId, AssaultView>();
  private dying: Dying[] = [];
  private time = 0;
  private banners: Spr[] = [];
  private hasan: { s: Spr; t: number; x: number; y0: number; y1: number } | null = null;
  private shots = 0;
  /** Kerkoporta (Doukas): a few dozen men slipping through the open postern. */
  private kerko: { sprites: Spr[]; from: TilePt; to: TilePt; tower: TilePt | null } | null = null;

  constructor(
    private rc: RenderContext,
    private pool: SpritePool,
  ) {
    const bus = rc.bus;
    bus.on('assault:clash', (e) => this.onClash(e.at, e.intensity));
    bus.on('arrows:volley', (e) => this.onVolley(e.from, e.to, e.count, e.side));
    bus.on('banner:planted', (e) => this.onBanner(e.at));
    bus.on('assault:start', (e) => {
      const p = sectionPoint(e.sectionId, 0.5);
      const w = this.wp(p.tx, p.ty);
      if (this.inView(w.x, w.y)) this.rc.fx.floatText(Math.round(w.x), Math.round(w.y) - 40, e.wave ? `${e.wave}. dalga!` : 'Hücum!', hex(P.red[6]));
    });
    bus.on('assault:end', (e) => {
      const v = this.views.get(e.sectionId);
      if (v) for (const l of v.ladders) if (l.state === 'up') this.pushLadder(l);
    });
  }

  private wp(tx: number, ty: number): { x: number; y: number } {
    return this.rc.world.toWorld(tx, ty);
  }

  private inView(x: number, y: number, m = 160): boolean {
    const v = this.rc.scene.cameras.main.worldView;
    return x > v.x - m && x < v.right + m && y > v.y - m && y < v.bottom + m;
  }

  /** Height of the wall crest above its foot (px), lower where it is broken. */
  private crestH(state: GameState, sid: SectionId): number {
    const s = state.sections[sid];
    const b = s ? s.breach : 0;
    return Math.round(9 + 13 * (1 - b));
  }

  // ───────────────────────────── per frame ─────────────────────────────

  update(state: GameState, dt: number, night: boolean, keyOf: (groupId: number) => string | null): void {
    this.time += dt;
    const a = army(state);
    const live = new Set<SectionId>();
    for (const sid of Object.keys(a.assaults)) {
      const members = assaultMembers(state, sid);
      if (!members.length && !(a.final && a.final.main === sid && a.final.phase === 'dalga')) continue;
      const p = sectionPoint(sid, 0.5);
      const w = this.wp(p.tx, p.ty);
      if (!this.inView(w.x, w.y, 420)) continue;
      live.add(sid);
      let v = this.views.get(sid);
      if (!v) {
        v = this.newView(state, sid);
        this.views.set(sid, v);
      }
      const key = (members.length && keyOf(members[Math.floor(this.time) % members.length].id)) || 'army/basibozuk-0';
      this.updateView(state, v, dt, night, key, a.assaults[sid].foothold, a.assaults[sid].intensity);
    }
    for (const [sid, v] of this.views) {
      if (!live.has(sid)) {
        this.releaseView(v);
        this.views.delete(sid);
      }
    }
    this.updateDying(dt);
    this.updateBanners(state);
    this.updateHasan(dt);
    this.updateKerkoporta(state);
  }

  private newView(state: GameState, sid: SectionId): AssaultView {
    const sec = state.sections[sid];
    const breach = sec?.breach ?? 0;
    const crest = this.crestH(state, sid);
    const nL = breach > 0.65 ? 2 : Math.round(3 + 3 * (1 - breach));
    const n = sectionOutwardNormal(sid, 0.5);
    const nsx = n.tx - n.ty;
    const lean: 'u' | 'r' = Math.abs(nsx) < 0.45 ? 'u' : 'r';
    const flip = nsx > 0;
    const ladders: Ladder[] = [];
    for (let k = 0; k < nL; k++) {
      const t = 0.16 + (0.68 * (k + 0.5)) / nL + (hash(k, sid.length) - 0.5) * 0.06;
      const wall = sectionPoint(sid, t);
      const nn = sectionOutwardNormal(sid, t);
      const base = this.wp(wall.tx + nn.tx * 0.6, wall.ty + nn.ty * 0.6);
      const top = this.wp(wall.tx, wall.ty);
      const s = this.pool.get(`army/merdiven-${lean}`, 0, 'inf');
      const L = LADDER[lean];
      s.setOrigin((ladderBaseX(L.len) + 0.5) / ladderW(L.len), (L.h - 1) / L.h);
      s.setFlipX(flip);
      ladders.push({
        s,
        wallY: Math.round(top.y),
        t,
        bx: Math.round(base.x),
        by: Math.round(base.y),
        topX: Math.round(top.x + (base.x - top.x) * 0.15),
        topY: Math.round(top.y - crest),
        flip,
        lean,
        state: 'raise',
        timer: 0.5 + k * 0.3,
        climbers: [],
        spawn: k * 0.4,
      });
    }
    // facing of the defenders: toward the attackers (outward)
    const fBack = n.tx + n.ty < 0;
    return { sid, ladders, defs: [], lastDef: sec?.defenders ?? 0, shotT: 0, crest, back: fBack, flip: nsx < 0 };
  }

  private releaseView(v: AssaultView): void {
    for (const l of v.ladders) {
      for (const c of l.climbers) this.pool.release(c.s);
      this.pool.release(l.s);
    }
    for (const d of v.defs) this.pool.release(d.s);
    v.ladders = [];
    v.defs = [];
  }

  private pushLadder(l: Ladder): void {
    l.state = 'fall';
    l.timer = 0;
    for (const c of l.climbers) {
      c.state = 'fall';
      c.vy = -20;
      c.t = 0;
    }
  }

  private updateView(state: GameState, v: AssaultView, dt: number, night: boolean, key: string, foothold: number, intensity: number): void {
    const sec = state.sections[v.sid];
    const breach = sec?.breach ?? 0;
    v.crest = this.crestH(state, v.sid);
    // ── ladders
    for (const l of v.ladders) {
      l.timer += dt;
      let frame = 0;
      if (l.state === 'raise') {
        frame = l.timer < 0.25 ? 2 : l.timer < 0.5 ? 1 : 0;
        if (l.timer > 0.55) {
          l.state = 'up';
          l.timer = 0;
          this.rc.fx.dust(l.bx, l.by, 0.5);
        }
      } else if (l.state === 'fall') {
        frame = l.timer < 0.15 ? 1 : l.timer < 0.35 ? 2 : 3;
        if (l.timer > 0.4) {
          l.state = 'down';
          l.timer = 0;
          this.rc.fx.dust(l.bx + (l.flip ? 10 : -10), l.by, 0.8);
        }
      } else if (l.state === 'down') {
        frame = 3;
        if (l.timer > 2.2 + hash(l.bx, l.by) * 2) {
          l.state = 'raise';
          l.timer = 0;
        }
      } else {
        // defenders push ladders off with forked poles (less often as the breach is won)
        const pushRate = 0.07 * (1 - foothold) * (sec && sec.defenders > 0 ? 1 : 0);
        if (Math.random() < pushRate * dt) this.pushLadder(l);
        // climbers
        l.spawn -= dt;
        if (l.spawn <= 0 && l.climbers.length < 2) {
          l.spawn = 0.9 + Math.random() * 0.8;
          const s = this.pool.get(key, 24, 'inf');
          l.climbers.push({ s, p: 0, state: 'climb', t: 0, x: l.bx, y: l.by, vy: 0, key });
        }
      }
      l.s.setPosition(l.bx, l.by).setFrame(frame).setDepth(frame === 3 ? l.by - 0.5 : l.wallY + 6);
      for (let i = l.climbers.length - 1; i >= 0; i--) {
        const c = l.climbers[i];
        c.t += dt;
        if (c.state === 'climb') {
          c.p += dt / 2.1;
          c.x = l.bx + (l.topX - l.bx) * c.p;
          c.y = l.by + (l.topY + 4 - l.by) * c.p;
          c.s.setFrame(24 + (Math.floor(c.t * 5) % 2)).setFlipX(l.flip);
          if (c.p >= 1) {
            const crestChance = 0.22 + foothold * 0.65;
            if (Math.random() < crestChance) {
              c.state = 'crest';
              c.t = 0;
            } else {
              c.state = 'fall';
              c.t = 0;
              c.vy = -24;
              if (Math.random() < 0.5) this.rc.fx.sparks(c.x, c.y - 8, 3);
            }
          }
          c.s.setPosition(Math.round(c.x), Math.round(c.y)).setDepth(l.wallY + 6.2);
        } else if (c.state === 'crest') {
          // on the battlements, cutting at the defenders
          const fr = frameOf('inf', 'atk', Math.floor(c.t * 8), !v.back);
          c.s.setFrame(fr).setFlipX(!v.flip).setPosition(Math.round(l.topX), Math.round(l.topY + 4)).setDepth(l.wallY + 7);
          if (c.t > 1.4) {
            if (Math.random() < 0.5) this.spawnDeath(c.key, 'inf', l.topX, l.by + 3, l.flip, true, l.by + 3 - (l.topY + 4));
            this.pool.release(c.s);
            l.climbers.splice(i, 1);
          }
        } else {
          c.vy += 140 * dt;
          c.y += c.vy * dt;
          c.x += (l.flip ? 8 : -8) * dt;
          const fr = frameOf('inf', 'die', Math.min(1, Math.floor(c.t * 5)), true);
          c.s.setFrame(fr).setPosition(Math.round(c.x), Math.round(c.y)).setDepth(l.wallY + 6.2);
          if (c.y >= l.by) {
            this.spawnDeath(c.key, 'inf', c.x, l.by + 2, l.flip, true, 0, 2);
            this.pool.release(c.s);
            l.climbers.splice(i, 1);
          }
        }
      }
    }
    // ── defenders on the crest (and in the breach)
    const want = sec ? Math.max(0, Math.min(10, Math.round((sec.defenders / 70) * (1 - foothold * 0.7)))) : 0;
    while (v.defs.length < want) {
      const k = v.defs.length;
      const t = 0.12 + ((k * 0.618) % 1) * 0.76;
      const ground = breach > 0.45 && k % 3 === 0;
      const key = `army/rum-${Math.floor(hash(k, v.sid.length) * 3) % 3}`;
      const wall = sectionPoint(v.sid, t);
      const w = this.wp(wall.tx, wall.ty);
      const s = this.pool.get(key, 0, 'inf');
      v.defs.push({ s, t, x: Math.round(w.x), y: Math.round(w.y), ground, phase: Math.random() * 10, timer: Math.random() * 3, key });
    }
    while (v.defs.length > want) {
      const d = v.defs.pop()!;
      this.spawnDeath(d.key, 'inf', d.x, d.y + (d.ground ? 0 : 2), !v.flip, v.back, d.ground ? 0 : v.crest);
      this.pool.release(d.s);
    }
    for (const d of v.defs) {
      d.timer -= dt;
      let anim: 'atk' | 'idle' = 'atk';
      if (d.timer < 0) d.timer = 1.5 + Math.random() * 2.5;
      if (d.timer > 1.2) anim = 'idle';
      const fr = frameOf('inf', anim, Math.floor(this.time * 6 + d.phase), v.back);
      const y = d.ground ? d.y : d.y - v.crest;
      d.s.setFrame(fr).setFlipX(v.flip).setPosition(d.x, y).setDepth(d.y + 1.5);
    }
    // ── missiles from the walls: arrows, stones, fire pots
    v.shotT -= dt * (0.6 + intensity * 1.6);
    if (v.shotT <= 0 && v.defs.length) {
      v.shotT = 0.35 + Math.random() * 0.4;
      const d = v.defs[Math.floor(Math.random() * v.defs.length)];
      const tgt = sectionPoint(v.sid, d.t + (Math.random() - 0.5) * 0.15);
      const nn = sectionOutwardNormal(v.sid, d.t);
      const dist = 0.8 + Math.random() * 2.8;
      const tw = this.wp(tgt.tx + nn.tx * dist, tgt.ty + nn.ty * dist);
      const fy = d.ground ? d.y - 8 : d.y - v.crest - 8;
      const r = Math.random();
      if (r < 0.62) this.rc.fx.projectile(d.x, fy, tw.x, tw.y - 2, { kind: 'ok', arc: 6, duration: 0.45 });
      else if (r < 0.85 || !night) {
        const lb = v.ladders.find((l) => l.state === 'up');
        const tx = lb ? lb.bx : tw.x;
        const ty = lb ? lb.by : tw.y;
        this.rc.fx.projectile(d.x, fy, tx, ty, { kind: 'gulle', arc: 3, duration: 0.4, onImpact: () => this.rc.fx.dust(tx, ty, 0.6) });
      } else {
        // fire pot (Rum ateşi): flash and smoke where it bursts
        this.rc.fx.projectile(d.x, fy, tw.x, tw.y, {
          kind: 'ates',
          arc: 10,
          duration: 0.6,
          trail: true,
          onImpact: () => {
            this.rc.fx.flash(tw.x, tw.y - 4, hex(P.fire[5]), 40, 0.5);
            this.rc.fx.smoke(tw.x, tw.y - 3, 0.8, 2);
            this.rc.fx.sparks(tw.x, tw.y - 3, 6);
          },
        });
      }
      d.timer = 1.1;
    }
    // breach melee sparks
    if (breach > 0.4 && Math.random() < dt * 3 * intensity) {
      const t = 0.25 + Math.random() * 0.5;
      const p = sectionPoint(v.sid, t);
      const w = this.wp(p.tx, p.ty);
      this.rc.fx.sparks(w.x, w.y - 6, 3);
    }
  }

  // ───────────────────────────── events ─────────────────────────────

  private onClash(at: TilePt, intensity: number): void {
    const w = this.wp(at.tx, at.ty);
    if (!this.inView(w.x, w.y)) return;
    this.rc.fx.sparks(w.x, w.y - 7, 3 + Math.round(intensity * 6));
    if (Math.random() < 0.35) this.rc.fx.flash(w.x, w.y - 6, hex(P.fire[6]), 22, 0.18);
    if (Math.random() < 0.3) this.rc.fx.dust(w.x, w.y, 0.7);
  }

  private onVolley(from: TilePt, to: TilePt, count: number, side: 'osmanli' | 'bizans'): void {
    const a = this.wp(from.tx, from.ty);
    const b = this.wp(to.tx, to.ty);
    if (!this.inView(a.x, a.y) && !this.inView(b.x, b.y)) return;
    const n = Math.min(7, Math.max(2, Math.ceil(count / 2)));
    for (let i = 0; i < n; i++) {
      const ox = (Math.random() - 0.5) * 26;
      const oy = (Math.random() - 0.5) * 12;
      const fy = side === 'bizans' ? a.y - 18 : a.y - 8;
      const ty = side === 'osmanli' ? b.y - 16 + oy * 0.4 : b.y + oy;
      this.rc.fx.projectile(a.x + ox * 0.4, fy + oy * 0.3, b.x + ox, ty, { kind: 'ok', arc: 10 + Math.random() * 8, duration: 0.55 + Math.random() * 0.3 });
    }
  }

  /** Render-only arrow from an archer in formation to the wall crest. */
  archerShot(tx: number, ty: number, sid: SectionId, state: GameState): void {
    if (this.shots > 40) return;
    const a = this.wp(tx, ty);
    if (!this.inView(a.x, a.y)) return;
    const t = 0.15 + Math.random() * 0.7;
    const p = sectionPoint(sid, t);
    const b = this.wp(p.tx, p.ty);
    this.shots++;
    this.rc.fx.projectile(a.x, a.y - 8, b.x + (Math.random() - 0.5) * 6, b.y - this.crestH(state, sid) - 2, {
      kind: 'ok',
      arc: 14,
      duration: 0.7,
      onImpact: () => {
        this.shots--;
        if (Math.random() < 0.25) this.rc.fx.sparks(b.x, b.y - this.crestH(state, sid), 2);
      },
    });
  }

  private onBanner(at: TilePt): void {
    const w = this.wp(at.tx, at.ty);
    // Ulubatlı Hasan scales the tower with the banner
    const s = this.pool.get('army/sancak-hasan', 4, 'ban');
    this.hasan = { s, t: 0, x: Math.round(w.x), y0: Math.round(w.y) + 2, y1: Math.round(w.y) - 30 };
    this.rc.fx.flash(w.x, w.y - 30, hex(P.gold[6]), 90, 0.8);
  }

  private updateHasan(dt: number): void {
    const h = this.hasan;
    if (!h) return;
    h.t += dt;
    const climb = Math.min(1, h.t / 1.6);
    const y = h.y0 + (h.y1 - h.y0) * climb;
    h.s.setPosition(h.x - 6, Math.round(y)).setFrame(frameOf('ban', climb < 1 ? 'walk' : 'idle', Math.floor(h.t * 8), true)).setDepth(h.y0 + 6);
    if (h.t > 1.6 && h.t - dt <= 1.6) {
      this.rc.fx.flash(h.x, h.y1 - 10, hex(P.gold[6]), 120, 1);
      this.rc.fx.sparks(h.x, h.y1 - 12, 14);
      this.rc.fx.shake(0.25, 0.5);
      this.rc.fx.floatText(h.x, h.y1 - 46, 'Sancak burçta!', hex(P.gold[6]));
    }
    if (h.t > 4.2) {
      // Hasan falls, pierced by arrows
      this.spawnDeath('army/yeniceri-0', 'inf', h.x - 6, h.y0 + 3, false, true, h.y0 + 3 - h.y1);
      this.pool.release(h.s);
      this.hasan = null;
    }
  }

  private updateBanners(state: GameState): void {
    const f = army(state).final;
    const spots: TilePt[] = [];
    if (state.flags[FLAG.sancakDikildi] && f?.bannerAt && (!this.hasan || this.hasan.t > 1.6)) spots.push(f.bannerAt);
    if (this.kerko?.tower) spots.push(this.kerko.tower);
    if (state.flags[FLAG.sehirDustu] && f) {
      for (const sid of [f.main, ...f.side]) {
        const tw = towerPositions(sid);
        for (let k = 0; k < tw.length; k += 2) {
          const p = { tx: tw[k].tx, ty: tw[k].ty };
          if (!f.bannerAt || Math.hypot(p.tx - f.bannerAt.tx, p.ty - f.bannerAt.ty) > 1) spots.push(p);
        }
      }
    }
    while (this.banners.length > spots.length) this.pool.release(this.banners.pop()!);
    while (this.banners.length < spots.length) {
      const s = this.pool.get('army/burc-sancak', 0, 'inf');
      s.setOrigin(4.5 / 22, 39 / 40);
      this.banners.push(s);
    }
    this.banners.forEach((s, i) => {
      const w = this.wp(spots[i].tx, spots[i].ty);
      s.setPosition(Math.round(w.x), Math.round(w.y) - 26)
        .setFrame(Math.floor(this.time * 6 + i) % 4)
        .setDepth(Math.round(w.y) + 4);
    });
  }

  private releaseKerko(): void {
    if (!this.kerko) return;
    for (const s of this.kerko.sprites) this.pool.release(s);
    this.kerko = null;
  }

  private updateKerkoporta(state: GameState): void {
    const f = army(state).final;
    const at = f?.kerkoporta ? f.kerkoAt : null;
    if (!at || !state.flags[FLAG.kerkoporta]) {
      this.releaseKerko();
      return;
    }
    if (!this.kerko) {
      const sid = sectionAt(at.tx, at.ty, 4);
      let t = 0.5;
      if (sid) {
        let bd = Infinity;
        for (let k = 0; k <= 20; k++) {
          const q = sectionPoint(sid, k / 20);
          const dd = Math.hypot(q.tx - at.tx, q.ty - at.ty);
          if (dd < bd) {
            bd = dd;
            t = k / 20;
          }
        }
      }
      const n = sid ? sectionOutwardNormal(sid, t) : { tx: -1, ty: 0 };
      let tower: TilePt | null = null;
      if (sid) {
        let bd = Infinity;
        for (const tw of towerPositions(sid)) {
          const dd = Math.hypot(tw.tx - at.tx, tw.ty - at.ty);
          if (dd < bd && dd > 0.8) {
            bd = dd;
            tower = { tx: tw.tx, ty: tw.ty };
          }
        }
      }
      const sprites: Spr[] = [];
      for (let i = 0; i < 9; i++) sprites.push(this.pool.get(i === 0 ? 'army/sancak-kirmizi' : `army/yeniceri-${i % 3}`, 0, i === 0 ? 'ban' : 'inf'));
      this.kerko = { sprites, from: { tx: at.tx + n.tx * 3.2, ty: at.ty + n.ty * 3.2 }, to: { tx: at.tx - n.tx * 3, ty: at.ty - n.ty * 3 }, tower };
    }
    const k = this.kerko;
    const mid = this.wp((k.from.tx + k.to.tx) / 2, (k.from.ty + k.to.ty) / 2);
    const show = state.time.phase === 'kusatma' && this.inView(mid.x, mid.y, 200);
    const dx = k.to.tx - k.from.tx;
    const dy = k.to.ty - k.from.ty;
    const fc = { back: dx + dy < -0.05, flip: dx - dy < 0 };
    k.sprites.forEach((s, i) => {
      if (!show) {
        s.setVisible(false);
        return;
      }
      // a thin stream through the postern, one by one, fading in outside and out inside the city
      const u = (this.time * 0.12 + i / k.sprites.length) % 1;
      const lat = (hash(i, 77) - 0.5) * (u < 0.4 || u > 0.6 ? 0.9 : 0.15);
      const w = this.wp(k.from.tx + dx * u - dy * lat * 0.4, k.from.ty + dy * u + dx * lat * 0.4);
      const a = Math.min(1, u / 0.12, (1 - u) / 0.18);
      const layout: Layout = i === 0 ? 'ban' : 'inf';
      s.setVisible(true)
        .setAlpha(a)
        .setPosition(Math.round(w.x), Math.round(w.y))
        .setFrame(frameOf(layout, 'walk', Math.floor(this.time * 9 + i * 3), fc.back))
        .setFlipX(fc.flip)
        .setDepth(Math.round(w.y));
    });
  }

  // ───────────────────────────── bodies ─────────────────────────────

  /** A soldier falls (optionally from a height `fall` px above y) and lies as a corpse. */
  spawnDeath(key: string, layout: Layout, x: number, y: number, flip: boolean, back: boolean, fall = 0, lieOnly = 0): void {
    if (!this.inView(x, y)) return;
    const lay: Layout = layout === 'mnt' ? 'mnt' : 'inf';
    const s = this.pool.get(key, frameOf(lay, 'die', lieOnly, back), lay);
    s.setFlipX(flip).setPosition(Math.round(x), Math.round(y - fall));
    this.dying.push({ s, layout: lay, t: lieOnly ? 0.6 : 0, y0: y - fall, y1: y, vy: fall > 0 ? -18 : 0, life: 26 + Math.random() * 6 });
    while (this.dying.length > MAX_CORPSES) {
      const d = this.dying.shift()!;
      this.pool.release(d.s);
    }
  }

  private updateDying(dt: number): void {
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const d = this.dying[i];
      d.t += dt;
      let y = d.y1;
      if (d.y0 < d.y1) {
        d.vy += 220 * dt;
        d.y0 = Math.min(d.y1, d.y0 + d.vy * dt);
        y = d.y0;
      }
      const last = d.layout === 'mnt' ? 1 : 2;
      const step = d.y0 < d.y1 ? Math.min(last - 1, Math.floor(d.t * 6)) : Math.min(last, Math.floor(d.t * 6));
      const back = d.s.frame.name !== undefined && Number(d.s.frame.name) >= (d.layout === 'mnt' ? 10 : 12);
      d.s.setFrame(frameOf(d.layout, 'die', step, back)).setPosition(d.s.x, Math.round(y)).setDepth(Math.round(y) - (step >= last ? 1.5 : 0));
      if (d.t > d.life) d.s.setAlpha(Math.max(0, 1 - (d.t - d.life) / 2));
      if (d.t > d.life + 2) {
        this.pool.release(d.s);
        this.dying.splice(i, 1);
      }
    }
  }

  /** Places that should glow at night (defenders' braziers, ladder tops). */
  torchSpots(): { x: number; y: number }[] {
    const out: { x: number; y: number }[] = [];
    for (const v of this.views.values()) {
      const d = v.defs[0];
      if (d) out.push({ x: d.x, y: d.y - v.crest - 6 });
      const l = v.ladders[1] ?? v.ladders[0];
      if (l) out.push({ x: l.topX, y: l.topY });
    }
    return out;
  }

  destroy(): void {
    for (const v of this.views.values()) this.releaseView(v);
    this.views.clear();
    for (const d of this.dying) this.pool.release(d.s);
    this.dying = [];
    for (const b of this.banners) this.pool.release(b);
    this.banners = [];
    this.releaseKerko();
    if (this.hasan) this.pool.release(this.hasan.s);
    this.hasan = null;
  }
}
