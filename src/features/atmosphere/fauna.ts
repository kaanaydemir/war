import Phaser from 'phaser';
import { DEPTH } from '../../core/layers';
import type { WorldApi } from '../../core/world';
import { BIRD_FRAMES } from './art-sky';
import type { RGB, Season } from './sky';

/**
 * Sky life: seagull flocks gliding over the water, crows circling the battlefield,
 * doves over the city, bats at dusk, fireflies on May nights, pollen motes and
 * autumn leaves on the wind, and sun/moon glints twinkling on the water.
 * Purely visual; uses Math.random (render-side only).
 */

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

type BirdKind = 'marti' | 'karga' | 'guvercin' | 'yarasa';

interface Bird {
  img: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  /** Orbit around the flock center. */
  orbitR: number;
  orbitA: number;
  orbitW: number;
  ox: number;
  oy: number;
  alt: number;
  phase: number;
  flapRate: number;
  /** Seconds remaining in the current flap burst (gulls alternate flapping & gliding). */
  flapT: number;
  glideT: number;
  px: number;
}

interface Flock {
  kind: BirdKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  tx: number;
  ty: number;
  speed: number;
  birds: Bird[];
  startle: number;
  circle: boolean;
  cA: number;
  cR: number;
  cx: number;
  cy: number;
  alive: boolean;
  fade: number;
}

interface Speck {
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  phase: number;
  kind: 0 | 1 | 2; // mote, firefly, leaf
  alive: boolean;
}

interface Glint {
  img: Phaser.GameObjects.Image;
  age: number;
  life: number;
  alive: boolean;
}

const BIRD_KEY: Record<BirdKind, string> = {
  marti: 'fx/marti',
  karga: 'fx/karga',
  guvercin: 'fx/guvercin',
  yarasa: 'fx/yarasa',
};
const BIRD_SIZE: Record<BirdKind, [number, number]> = {
  marti: [17, 11],
  karga: [15, 11],
  guvercin: [13, 11],
  yarasa: [9, 6],
};

export interface FaunaInput {
  view: Phaser.Geom.Rectangle;
  daylight: number;
  storm: number;
  season: Season;
  month: number;
  glint: RGB;
  eclipse: number;
  /** Points of interest for crows (recent impacts / battle). */
  battle: { x: number; y: number } | null;
  wind: { x: number; y: number };
  hour: number;
}

export class Fauna {
  private flocks: Flock[] = [];
  private birdFree: Bird[] = [];
  private specks: Speck[] = [];
  private glints: Glint[] = [];
  private glintAcc = 0;
  private flockCheck = 0;

  constructor(
    private scene: Phaser.Scene,
    private world: WorldApi,
  ) {}

  /** Birds near a blast take fright (fly off fast, flapping hard). */
  startle(x: number, y: number, power: number): void {
    for (const f of this.flocks) {
      const d = Math.hypot(f.x - x, f.y - y);
      if (d < 140 + power * 80) {
        f.startle = Math.max(f.startle, 2.5 + power);
        const a = Math.atan2(f.y - y, f.x - x);
        f.tx = f.x + Math.cos(a) * 500;
        f.ty = f.y + Math.sin(a) * 260;
        f.circle = false;
      }
    }
  }

  private isWaterAt(wx: number, wy: number): boolean {
    const t = this.world.toTile(wx, wy);
    return this.world.inBounds(t.tx, t.ty) && this.world.isWater(t.tx, t.ty);
  }

  private findPoint(view: Phaser.Geom.Rectangle, water: boolean | null, margin: number): { x: number; y: number } | null {
    for (let k = 0; k < 24; k++) {
      const x = view.x - margin + Math.random() * (view.width + margin * 2);
      const y = view.y - margin + Math.random() * (view.height + margin * 2);
      if (water === null || this.isWaterAt(x, y) === water) return { x, y };
    }
    return null;
  }

  private takeBird(kind: BirdKind): Bird {
    let b = this.birdFree.pop();
    if (!b) {
      b = {
        img: this.scene.add.image(0, 0, BIRD_KEY[kind], 0).setOrigin(0, 0).setDepth(DEPTH.AIR + 5),
        shadow: this.scene.add.image(0, 0, 'fx/bird-shadow', 0).setOrigin(0, 0).setDepth(DEPTH.GROUND_DECAL + 70),
        orbitR: 0,
        orbitA: 0,
        orbitW: 0,
        ox: 0,
        oy: 0,
        alt: 0,
        phase: 0,
        flapRate: 0,
        flapT: 0,
        glideT: 0,
        px: 0,
      };
    } else b.img.setTexture(BIRD_KEY[kind], 0);
    b.img.setVisible(true);
    b.shadow.setVisible(true);
    b.phase = Math.random() * 6;
    b.flapT = rnd(0, 1.5);
    b.glideT = 0;
    return b;
  }

  private spawnFlock(kind: BirdKind, at: { x: number; y: number }, n: number, circle: boolean): void {
    const f: Flock = {
      kind,
      x: at.x,
      y: at.y,
      vx: 0,
      vy: 0,
      tx: at.x,
      ty: at.y,
      speed: kind === 'marti' ? rnd(16, 26) : kind === 'karga' ? rnd(18, 28) : kind === 'yarasa' ? rnd(22, 34) : rnd(26, 36),
      birds: [],
      startle: 0,
      circle,
      cA: Math.random() * Math.PI * 2,
      cR: kind === 'karga' ? rnd(40, 80) : rnd(50, 110),
      cx: at.x,
      cy: at.y,
      alive: true,
      fade: 0,
    };
    for (let i = 0; i < n; i++) {
      const b = this.takeBird(kind);
      b.orbitR = kind === 'guvercin' ? rnd(3, 12) : kind === 'yarasa' ? rnd(4, 18) : rnd(6, 26);
      b.orbitA = Math.random() * Math.PI * 2;
      b.orbitW = rnd(0.25, 0.7) * (Math.random() < 0.5 ? -1 : 1) * (kind === 'yarasa' ? 4 : 1);
      b.alt = kind === 'yarasa' ? rnd(12, 26) : kind === 'guvercin' ? rnd(20, 40) : rnd(34, 70);
      b.flapRate = kind === 'marti' ? rnd(7, 9) : kind === 'karga' ? rnd(8, 10) : kind === 'yarasa' ? rnd(16, 20) : rnd(12, 15);
      b.px = 0;
      b.img.alpha = 0;
      b.shadow.alpha = 0;
      f.birds.push(b);
    }
    this.flocks.push(f);
  }

  update(dt: number, inp: FaunaInput): void {
    this.manageFlocks(dt, inp);
    this.updateFlocks(dt, inp);
    this.updateSpecks(dt, inp);
    this.updateGlints(dt, inp);
  }

  private manageFlocks(dt: number, inp: FaunaInput): void {
    this.flockCheck -= dt;
    if (this.flockCheck > 0) return;
    this.flockCheck = 1.2;
    const v = inp.view;
    const day = inp.daylight;
    const count = (k: BirdKind) => this.flocks.filter((f) => f.kind === k && f.alive).length;
    // view-size aware: more flocks at zoom 1
    const area = (v.width * v.height) / (640 * 360);
    const scale = Math.min(3, Math.max(1, area));
    const calm = 1 - inp.storm;
    const wantGulls = day > 0.25 ? Math.round(2 * scale * calm + 0.4) : 0;
    const wantCrows = day > 0.35 && inp.battle ? Math.round(1 + scale * 0.5) : day > 0.35 ? Math.round(scale * 0.5 * calm) : 0;
    const wantDoves = day > 0.4 && calm > 0.5 ? Math.round(scale * 0.5) : 0;
    const dusk = inp.hour > 19.3 || inp.hour < 5.3;
    const wantBats = dusk && inp.season !== 'kis' && calm > 0.6 ? Math.round(scale * 0.8) : 0;
    if (count('marti') < wantGulls) {
      const p = this.findPoint(v, true, 120);
      if (p) this.spawnFlock('marti', p, 3 + ((Math.random() * 5) | 0), false);
    }
    if (count('karga') < wantCrows) {
      const p = inp.battle ?? this.findPoint(v, false, 100);
      if (p) this.spawnFlock('karga', { x: p.x + rnd(-80, 80), y: p.y + rnd(-50, 50) }, 4 + ((Math.random() * 6) | 0), true);
    }
    if (count('guvercin') < wantDoves) {
      const p = this.findPoint(v, false, 60);
      if (p) this.spawnFlock('guvercin', p, 5 + ((Math.random() * 5) | 0), true);
    }
    if (count('yarasa') < wantBats) {
      const p = this.findPoint(v, false, 40);
      if (p) this.spawnFlock('yarasa', p, 2 + ((Math.random() * 4) | 0), true);
    }
    // retire flocks that are no longer wanted or drifted far away
    for (const f of this.flocks) {
      if (!f.alive) continue;
      const far = f.x < v.x - 500 || f.x > v.right + 500 || f.y < v.y - 400 || f.y > v.bottom + 400;
      const unwanted =
        (f.kind === 'marti' && count('marti') > wantGulls) ||
        (f.kind === 'karga' && count('karga') > wantCrows) ||
        (f.kind === 'guvercin' && count('guvercin') > wantDoves) ||
        (f.kind === 'yarasa' && count('yarasa') > wantBats);
      if (far || unwanted) f.alive = false;
    }
  }

  private updateFlocks(dt: number, inp: FaunaInput): void {
    const shadowA = 0.28 * inp.daylight * (1 - inp.storm * 0.8);
    // sun from the upper-left: shadows fall lower-right of the bird
    for (let i = this.flocks.length - 1; i >= 0; i--) {
      const f = this.flocks[i];
      f.fade = f.alive ? Math.min(1, f.fade + dt * 0.8) : f.fade - dt * 0.8;
      if (f.fade <= 0 && !f.alive) {
        for (const b of f.birds) {
          b.img.setVisible(false);
          b.shadow.setVisible(false);
          this.birdFree.push(b);
        }
        this.flocks.splice(i, 1);
        continue;
      }
      f.startle = Math.max(0, f.startle - dt);
      const spd = f.speed * (1 + Math.min(1.6, f.startle * 0.5));
      if (f.circle && f.startle <= 0) {
        // circling over a point of interest (crows over the battle, doves over roofs)
        f.cA += (spd / f.cR) * dt * (f.kind === 'yarasa' ? 1.6 : 1);
        if (inp.battle && f.kind === 'karga') {
          f.cx += (inp.battle.x - f.cx) * Math.min(1, dt * 0.08);
          f.cy += (inp.battle.y - f.cy) * Math.min(1, dt * 0.08);
        }
        const nx = f.cx + Math.cos(f.cA) * f.cR;
        const ny = f.cy + Math.sin(f.cA) * f.cR * 0.5;
        f.vx = (nx - f.x) / Math.max(dt, 1e-3);
        f.vy = (ny - f.y) / Math.max(dt, 1e-3);
        f.x = nx;
        f.y = ny;
      } else {
        // wander toward a target; gulls pick targets over water
        const dx = f.tx - f.x;
        const dy = f.ty - f.y;
        const d = Math.hypot(dx, dy);
        if (d < 20) {
          const p = this.findPoint(inp.view, f.kind === 'marti' ? true : null, 200);
          if (p) {
            f.tx = p.x;
            f.ty = p.y;
          } else {
            f.tx = f.x + rnd(-200, 200);
            f.ty = f.y + rnd(-100, 100);
          }
          if (f.kind !== 'marti' && f.startle <= 0) {
            f.circle = true;
            f.cx = f.x;
            f.cy = f.y;
          }
        }
        const ux = dx / (d || 1);
        const uy = dy / (d || 1);
        const k = Math.min(1, dt * 0.7);
        f.vx += (ux * spd - f.vx) * k;
        f.vy += (uy * spd * 0.6 - f.vy) * k;
        f.x += (f.vx + inp.wind.x * 0.3) * dt;
        f.y += (f.vy + inp.wind.y * 0.3) * dt;
      }
      const facingLeft = f.vx < -1;
      const [bw, bh] = BIRD_SIZE[f.kind];
      for (const b of f.birds) {
        b.orbitA += b.orbitW * dt;
        b.phase += dt;
        const bx = f.x + Math.cos(b.orbitA) * b.orbitR;
        const by = f.y + Math.sin(b.orbitA) * b.orbitR * 0.5;
        const alt = b.alt + Math.sin(b.phase * 0.8) * 3;
        // flap/glide rhythm: gulls glide a lot; startled birds flap hard
        let frame: number;
        if (f.kind === 'yarasa') frame = Math.floor(b.phase * b.flapRate) % 4;
        else {
          if (f.startle > 0) {
            b.flapT = 0.5;
            b.glideT = 0;
          }
          if (b.flapT > 0) {
            b.flapT -= dt;
            if (b.flapT <= 0) b.glideT = f.kind === 'marti' ? rnd(1.2, 3.5) : f.kind === 'karga' ? rnd(0.6, 1.8) : rnd(0.3, 0.8);
            frame = Math.floor(b.phase * b.flapRate * (f.startle > 0 ? 1.6 : 1)) % BIRD_FRAMES;
          } else {
            b.glideT -= dt;
            if (b.glideT <= 0) b.flapT = f.kind === 'marti' ? rnd(0.5, 1.2) : rnd(0.8, 2);
            frame = 2;
          }
        }
        b.img.setFrame(frame);
        b.img.setFlipX(facingLeft);
        b.img.x = Math.round(bx - bw / 2);
        b.img.y = Math.round(by - alt - bh / 2);
        const a = Math.max(0, Math.min(1, f.fade));
        b.img.alpha = a;
        b.shadow.x = Math.round(bx - 3 + alt * 0.3);
        b.shadow.y = Math.round(by + 2);
        b.shadow.setFrame(alt > 50 ? 1 : 0);
        b.shadow.alpha = shadowA * a;
        b.shadow.setVisible(shadowA > 0.01);
      }
    }
  }

  private updateSpecks(dt: number, inp: FaunaInput): void {
    const v = inp.view;
    const calm = 1 - inp.storm;
    const area = Math.min(3, (v.width * v.height) / (640 * 360));
    // pollen/dust motes on spring/summer days, fireflies on late-spring/summer nights, leaves in autumn
    const wantMotes = inp.daylight > 0.5 && (inp.season === 'ilkbahar' || inp.season === 'yaz') ? Math.round(16 * area * calm) : 0;
    const fireflyMonth = inp.month >= 5 && inp.month <= 7;
    const wantFlies = inp.daylight < 0.25 && fireflyMonth ? Math.round(18 * area * calm) : 0;
    const wantLeaves = inp.season === 'sonbahar' ? Math.round(14 * area) : 0;
    const want = [wantMotes, wantFlies, wantLeaves];
    const have = [0, 0, 0];
    for (const s of this.specks) if (s.alive) have[s.kind]++;
    for (let k = 0 as 0 | 1 | 2; k < 3; k = (k + 1) as 0 | 1 | 2) {
      if (have[k] < want[k]) this.spawnSpeck(k, inp);
    }
    const gl = inp.glint;
    const glTint = (Math.round(255 * Math.min(1, gl[0])) << 16) | (Math.round(220 * Math.min(1, gl[1])) << 8) | Math.round(140 * Math.min(1, gl[2]));
    for (const s of this.specks) {
      if (!s.alive) continue;
      s.age += dt;
      s.phase += dt;
      if (s.age >= s.life || s.x < v.x - 60 || s.x > v.right + 60 || s.y < v.y - 60 || s.y > v.bottom + 60) {
        s.alive = false;
        s.img.setVisible(false);
        continue;
      }
      const t = s.age / s.life;
      let a = Math.min(1, s.age * 2, (1 - t) * 3);
      if (s.kind === 0) {
        s.x += (inp.wind.x * 0.8 + Math.sin(s.phase * 1.3) * 4) * dt;
        s.y += (inp.wind.y * 0.5 + Math.cos(s.phase * 0.9) * 2) * dt;
        a *= 0.55 + 0.45 * Math.sin(s.phase * 5);
        s.img.setTint(glTint);
      } else if (s.kind === 1) {
        s.x += Math.sin(s.phase * 0.7) * 6 * dt;
        s.y += Math.cos(s.phase * 0.53) * 4 * dt;
        const pulse = Math.max(0, Math.sin(s.phase * 2.2));
        a *= pulse * pulse;
        s.img.setFrame(pulse > 0.8 ? 0 : 1);
      } else {
        s.x += (inp.wind.x * 1.6 + Math.sin(s.phase * 2) * 8) * dt;
        s.y += (14 + Math.cos(s.phase * 2.4) * 6) * dt;
        s.img.setFrame(Math.floor(s.phase * 6) % 4);
      }
      s.img.x = Math.round(s.x);
      s.img.y = Math.round(s.y);
      s.img.alpha = a;
    }
  }

  private spawnSpeck(kind: 0 | 1 | 2, inp: FaunaInput): void {
    let s = this.specks.find((x) => !x.alive);
    if (!s) {
      if (this.specks.length > 160) return;
      s = {
        img: this.scene.add.image(0, 0, 'fx/ember', 1).setOrigin(0, 0),
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        age: 0,
        life: 1,
        phase: 0,
        kind: 0,
        alive: false,
      };
      this.specks.push(s);
    }
    const p = this.findPoint(inp.view, kind === 1 ? false : null, 0);
    if (!p) return;
    s.alive = true;
    s.kind = kind;
    s.x = p.x;
    s.y = p.y;
    s.age = 0;
    s.phase = Math.random() * 10;
    s.life = kind === 1 ? rnd(5, 10) : rnd(4, 9);
    const img = s.img;
    img.setVisible(true);
    img.alpha = 0;
    if (kind === 0) {
      img.setTexture('fx/ember', 1).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.GLOW + 3);
    } else if (kind === 1) {
      img.setTexture('fx/firefly', 0).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.GLOW + 3).clearTint();
    } else {
      const tints = [0xdc8551, 0xc2623b, 0xdcb12c, 0xad7744];
      img.setTexture('fx/yaprak', 0).setBlendMode(Phaser.BlendModes.NORMAL).setDepth(DEPTH.AIR + 2).setTint(tints[(Math.random() * 4) | 0]);
      s.y = inp.view.y - 10 + Math.random() * inp.view.height * 0.6;
    }
  }

  private updateGlints(dt: number, inp: FaunaInput): void {
    const v = inp.view;
    const night = inp.daylight < 0.3;
    // sun glitter by day; sparse moonlight glints by night (blood-red during the eclipse)
    const area = (v.width * v.height) / (640 * 360);
    const rate = (night ? 10 : 38) * Math.min(3, area) * (1 - inp.storm * 0.9);
    this.glintAcc += dt * rate;
    let tries = 0;
    while (this.glintAcc > 1 && tries++ < 30) {
      this.glintAcc -= 1;
      const x = v.x + Math.random() * v.width;
      const y = v.y + Math.random() * v.height;
      if (!this.isWaterAt(x, y)) continue;
      // glints cluster: avoid the immediate shore (sample a bit inland of the point)
      if (!this.isWaterAt(x + 10, y + 6) || !this.isWaterAt(x - 10, y - 6)) continue;
      let g = this.glints.find((q) => !q.alive);
      if (!g) {
        if (this.glints.length >= 90) break;
        g = {
          img: this.scene.add.image(0, 0, 'fx/glint', 0).setOrigin(0, 0).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.GLOW - 5),
          age: 0,
          life: 1,
          alive: false,
        };
        this.glints.push(g);
      }
      g.alive = true;
      g.age = 0;
      g.life = rnd(0.45, 1.0);
      g.img.setVisible(true);
      g.img.x = Math.round(x - 2);
      g.img.y = Math.round(y - 2);
      let c = inp.glint;
      if (inp.eclipse > 0.05 && night) c = [1, 0.32 + 0.4 * (1 - inp.eclipse), 0.28 + 0.4 * (1 - inp.eclipse)];
      const k = night ? 0.85 : 1;
      g.img.setTint((Math.round(255 * c[0] * k) << 16) | (Math.round(255 * c[1] * k) << 8) | Math.round(255 * c[2] * k));
    }
    if (this.glintAcc > 4) this.glintAcc = 0;
    for (const g of this.glints) {
      if (!g.alive) continue;
      g.age += dt;
      if (g.age >= g.life) {
        g.alive = false;
        g.img.setVisible(false);
        continue;
      }
      const t = g.age / g.life;
      g.img.setFrame(Math.min(4, Math.floor(t * 5)));
      g.img.alpha = night ? 0.7 : 0.85;
    }
  }

  destroy(): void {
    for (const f of this.flocks)
      for (const b of f.birds) {
        b.img.destroy();
        b.shadow.destroy();
      }
    for (const b of this.birdFree) {
      b.img.destroy();
      b.shadow.destroy();
    }
    for (const s of this.specks) s.img.destroy();
    for (const g of this.glints) g.img.destroy();
    this.flocks.length = 0;
    this.birdFree.length = 0;
    this.specks.length = 0;
    this.glints.length = 0;
  }
}
