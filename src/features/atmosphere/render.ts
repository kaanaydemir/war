import Phaser from 'phaser';
import { clockHours, dayToDate } from '../../core/calendar';
import type { RenderContext } from '../../core/feature';
import type { FxProxy } from '../../core/fx';
import type { GameState } from '../../core/state';
import { skyShared } from './api';
import { Fauna } from './fauna';
import { FxImpl } from './fx';
import { Lighting } from './lighting';
import { Particles } from './particles';
import { Reactive } from './reactive';
import {
  ambientFor,
  baseWeather,
  calendarEclipse,
  effectiveHour,
  isDaylightPhase,
  seasonOf,
  windAt,
  type Weather,
  type WeatherKind,
} from './sky';
import { WeatherLayer } from './weather';
import { FxDemo } from './demo';

/**
 * Atmosphere renderer: owns the FX implementation, lighting, weather, fauna and
 * reactive ambience for one GameScene lifetime (rebuilt on every createRender).
 */
export class AtmosphereRender {
  readonly parts: Particles;
  readonly lighting: Lighting;
  readonly fx: FxImpl;
  readonly weather: WeatherLayer;
  readonly fauna: Fauna;
  readonly reactive: Reactive;
  private demo: FxDemo | null = null;
  private time = 0;
  private eclipseSmooth = 0;
  private shownWeather: Weather = { kind: 'acik', intensity: 0 };
  private qaWeather: Weather | null = null;

  constructor(private rc: RenderContext) {
    const scene = rc.scene;
    this.parts = new Particles(scene);
    this.lighting = new Lighting(scene);
    this.fx = new FxImpl(scene, this.parts, this.lighting);
    (rc.fx as FxProxy).setImpl(this.fx);
    this.weather = new WeatherLayer(scene, rc.world);
    this.fauna = new Fauna(scene, rc.world);
    this.reactive = new Reactive(scene, rc.world, this.fx, this.parts, rc.bus, () => rc.getState().time.day);
    this.fx.onBlast = (x, y, p) => this.fauna.startle(x, y, p);
    skyShared.eventEclipse = 0;
    skyShared.weather = { kind: 'acik', intensity: 0 };
    skyShared.ambient = [1, 1, 1];

    const params = new URLSearchParams(location.search);
    const demo = params.get('fxdemo');
    if (demo) {
      this.demo = new FxDemo(rc, this.fx, demo, this.reactive);
      (window as any).__atmo = this;
    }
    // QA overrides: ?weather=yagmur|dolu|sis|kar[:intensity] · ?eclipse=1
    const wq = params.get('weather');
    if (wq) {
      const [k, i] = wq.split(':');
      this.qaWeather = { kind: k as WeatherKind, intensity: i ? Number(i) : 0.8 };
      this.weather.levels.acik = 0;
      (this.weather.levels as Record<string, number>)[k] = this.qaWeather.intensity;
    }
    if (params.get('eclipse') === '1') {
      this.reactive.eclipseTarget = 1;
      this.eclipseSmooth = 1;
    }

    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  update(state: GameState, dt: number): void {
    this.time += dt;
    const cam = this.rc.scene.cameras.main;
    // derive the view from scroll/zoom (worldView lags one frame behind camera moves)
    const vw = Math.floor(cam.width / cam.zoom + 0.5);
    const vh = Math.floor(cam.height / cam.zoom + 0.5);
    const vx = Math.floor(cam.scrollX + cam.width / 2 - vw / 2 + 0.5);
    const vy = Math.floor(cam.scrollY + cam.height / 2 - vh / 2 + 0.5);
    this.parts.view.setTo(vx, vy, vw, vh);
    const day = state.time.day;
    const phase = state.time.phase;

    // weather target: bus override (events) else calendar climate
    const r = this.reactive;
    let target: Weather;
    if (this.qaWeather) target = this.qaWeather;
    else if (r.weatherOverride && day < r.weatherUntilDay) target = r.weatherOverride;
    else {
      r.weatherOverride = null;
      target = baseWeather(day, phase);
    }
    // eclipse: bus event (smoothed) + calendar
    this.eclipseSmooth += Math.max(-dt * 0.25, Math.min(dt * 0.25, r.eclipseTarget - this.eclipseSmooth));
    skyShared.eventEclipse = this.eclipseSmooth;
    const eclipse = Math.max(this.eclipseSmooth, calendarEclipse(day));

    // dominant displayed weather (smoothed levels from the weather layer)
    const lv = this.weather.levels;
    let kind: WeatherKind = 'acik';
    let best = 0.02;
    for (const k of ['yagmur', 'dolu', 'sis', 'kar'] as WeatherKind[])
      if (lv[k] > best) {
        best = lv[k];
        kind = k;
      }
    this.shownWeather.kind = kind;
    this.shownWeather.intensity = kind === 'acik' ? 0 : best;
    skyShared.weather = this.shownWeather;

    const sky = ambientFor(day, phase, this.shownWeather, eclipse);
    const amb = sky.amb;
    // battlefield haze: slight flattening & desaturation
    const haze = Math.min(1, r.hazeLevel);
    let sat = sky.sat - haze * 0.08;
    if (haze > 0) {
      for (let i = 0; i < 3; i++) amb[i] = amb[i] * (1 - haze * 0.05) + haze * 0.03;
    }
    skyShared.ambient = amb;

    const wind = windAt(day, phase);
    this.parts.windX = wind.x;
    this.parts.windY = wind.y;

    this.lighting.ambientBoost = this.weather.lightning * 0.55;
    this.lighting.lightsVisible = sky.lightsVisible;
    this.lighting.glowFactor = sky.lightsVisible;
    const vignette = 0.12 + 0.2 * (1 - sky.light) + this.weather.overcast * 0.08;
    this.lighting.update(dt, amb, sat, vignette, this.parts.view);

    this.fx.night = sky.lightsVisible;
    this.fx.update(dt, this.time);
    if (this.demo) this.demo.update(dt, state);
    this.parts.update(dt);

    // dawn mist over the water during the siege (05:00–07:30)
    const hour = effectiveHour(day, phase);
    let mist = 0;
    if (!isDaylightPhase(phase)) {
      const h = clockHours(day);
      if (h > 4.3 && h < 8) mist = Math.sin(((h - 4.3) / 3.7) * Math.PI) * 0.8;
    }
    this.weather.update(dt, this.parts.view, cam.zoom, target, wind, amb, sky.light, mist);

    const date = dayToDate(day);
    this.fauna.update(dt, {
      view: this.parts.view,
      daylight: sky.light,
      storm: this.weather.storm,
      season: seasonOf(day),
      month: date.month,
      glint: sky.glint,
      eclipse,
      battle: r.battle,
      wind,
      hour,
    });
    r.update(dt);
  }

  destroy(): void {
    this.reactive.destroy();
    this.demo?.destroy();
    this.fauna.destroy();
    this.weather.destroy();
    this.fx.destroy();
    this.lighting.destroy();
    this.parts.destroy();
  }
}
