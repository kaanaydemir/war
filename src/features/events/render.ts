import type Phaser from 'phaser';
import { DEPTH } from '../../core/layers';
import type { RenderContext } from '../../core/feature';
import type { GameState } from '../../core/state';
import { landmarkTile } from '../../data/landmarks';
import { ILLUSTRATION_KEYS } from './art';
import { EVENT_X_BY_ID, EVENTS_X } from './data';
import { eclipseAt, weatherAt } from './sky';

interface Marker {
  medal: Phaser.GameObjects.Sprite;
  ring: Phaser.GameObjects.Sprite;
  x: number;
  y: number;
  age: number;
}

const MARKER_LIFE = 9;

/**
 * Events render: when an event with a map location fires, a gilded medallion
 * drops onto that place with a ring pulse, flash and sparks. Also re-syncs the
 * historical sky (eclipse/weather) for listeners after a scene (re)start, and
 * offers a QA gallery of the card illustrations (?olaygaleri=1).
 */
export class EventsRender {
  private markers: Marker[] = [];
  /** Card id last seen in state.events.active (marker appears when a card is shown). */
  private lastActive: string | null = null;
  private synced = false;
  private gallery: HTMLDivElement | null = null;
  private offs: (() => void)[] = [];

  constructor(private rc: RenderContext) {
    rc.scene.events.once('shutdown', () => this.destroy());
    const params = new URLSearchParams(location.search);
    if (params.get('olaygaleri')) this.showGallery();
    const show = params.get('olay');
    if (show && EVENT_X_BY_ID[show]) rc.store.dispatch({ t: 'ozel', feature: 'events', action: 'olay-goster', payload: { id: show } });
  }

  private spawnMarker(id: Parameters<typeof landmarkTile>[0]): void {
    const t = landmarkTile(id);
    const p = this.rc.world.toWorld(t.tx, t.ty);
    const scene = this.rc.scene;
    if (!scene.textures.exists('olay/isaret')) return;
    // replace an existing marker at the same spot
    for (const m of this.markers) if (Math.hypot(m.x - p.x, m.y - p.y) < 4) m.age = MARKER_LIFE;
    const ring = scene.add.sprite(Math.round(p.x), Math.round(p.y), 'olay/halka').setDepth(DEPTH.UI_WORLD - 1);
    ring.play('olay/halka:anim');
    const medal = scene.add.sprite(Math.round(p.x), Math.round(p.y) - 40, 'olay/isaret').setOrigin(0.5, 1).setDepth(DEPTH.UI_WORLD);
    medal.play('olay/isaret:anim');
    this.markers.push({ medal, ring, x: p.x, y: p.y, age: 0 });
    this.rc.fx.flash(p.x, p.y - 6, 0xffd060, 56, 0.9);
    this.rc.fx.sparks(p.x, p.y - 8, 14);
  }

  update(state: GameState, dt: number): void {
    if (!this.synced) {
      // atmosphere/audio listen to these; a freshly loaded scenario may start mid-weather
      this.synced = true;
      const w = weatherAt(state.time.day);
      if (w.kind !== 'acik') this.rc.bus.emit('weather', w);
      if (eclipseAt(state.time.day)) this.rc.bus.emit('eclipse', { active: true });
    }
    const act = state.events.active?.eventId ?? null;
    if (act !== this.lastActive) {
      this.lastActive = act;
      const def = act ? EVENT_X_BY_ID[act] : undefined;
      if (def?.focus) this.spawnMarker(def.focus);
    }
    for (let i = this.markers.length - 1; i >= 0; i--) {
      const m = this.markers[i];
      m.age += dt;
      // drop in with a little bounce, then hover
      const drop = Math.min(1, m.age / 0.45);
      const ease = 1 - Math.pow(1 - drop, 3);
      const bounce = drop >= 1 ? Math.round(Math.sin(m.age * 3.2) * 1.5) : 0;
      m.medal.setY(Math.round(m.y - 4 - (1 - ease) * 40 + bounce));
      const fade = m.age > MARKER_LIFE - 1.5 ? Math.max(0, (MARKER_LIFE - m.age) / 1.5) : 1;
      m.medal.setAlpha(fade);
      m.ring.setAlpha(fade * 0.9);
      if (m.age >= MARKER_LIFE) {
        m.medal.destroy();
        m.ring.destroy();
        this.markers.splice(i, 1);
      }
    }
  }

  private showGallery(): void {
    const scene = this.rc.scene;
    const div = document.createElement('div');
    div.style.cssText =
      'position:fixed;inset:0;z-index:50;overflow:auto;background:#17131f;display:flex;flex-wrap:wrap;gap:12px;padding:12px;align-content:flex-start;font-family:var(--font);color:#efe2c2';
    const byImage = new Map<string, string[]>();
    for (const e of EVENTS_X) if (e.image) byImage.set(e.image, [...(byImage.get(e.image) ?? []), e.code]);
    for (const key of ILLUSTRATION_KEYS) {
      if (!scene.textures.exists(key)) continue;
      const src = scene.textures.get(key).getSourceImage() as HTMLCanvasElement;
      const cell = document.createElement('div');
      cell.style.cssText = 'display:flex;flex-direction:column;gap:4px;font-size:14px';
      const cv = document.createElement('canvas');
      cv.width = src.width;
      cv.height = src.height;
      cv.getContext('2d')!.drawImage(src, 0, 0);
      cv.style.cssText = `width:${src.width * 2}px;height:${src.height * 2}px;image-rendering:pixelated`;
      const cap = document.createElement('div');
      cap.textContent = `${key}  ·  ${[...new Set(byImage.get(key) ?? [])].join(', ')}`;
      cell.append(cv, cap);
      div.append(cell);
    }
    document.body.append(div);
    this.gallery = div;
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.offs = [];
    for (const m of this.markers) {
      m.medal.destroy();
      m.ring.destroy();
    }
    this.markers = [];
    this.gallery?.remove();
    this.gallery = null;
  }
}
