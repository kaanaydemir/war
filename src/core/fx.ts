/**
 * FX API — implemented by features/atmosphere, used by every render feature.
 * All coordinates are WORLD PIXELS (use world.toWorld to convert from tiles).
 * Every method must be cheap and safe to call often; implementations pool objects.
 */
export interface LightHandle {
  setPosition(x: number, y: number): void;
  setIntensity(v: number): void;
  setRadius(r: number): void;
  destroy(): void;
}

export interface LoopHandle {
  setPosition(x: number, y: number): void;
  setIntensity(v: number): void;
  destroy(): void;
}

export interface ProjectileOpts {
  /** Arc height in pixels (0 = flat). */
  arc?: number;
  /** Flight time in seconds. */
  duration?: number;
  kind?: 'gulle' | 'buyuk-gulle' | 'ok' | 'ates' | 'kursun';
  trail?: boolean;
  onImpact?: () => void;
}

export interface FxApi {
  /** Point light (torch/fire/flash). color = 0xRRGGBB, radius in px, intensity 0..2. */
  light(x: number, y: number, color: number, radius: number, intensity: number): LightHandle;
  /** One-shot bright flash light that decays over `duration` seconds. */
  flash(x: number, y: number, color: number, radius: number, duration?: number): void;
  /** Puffs of smoke. size 0.5..3. */
  smoke(x: number, y: number, size?: number, count?: number): void;
  /** Continuous fire (with embers + light + smoke). */
  fire(x: number, y: number, size?: number): LoopHandle;
  /** Continuous chimney/camp smoke column. */
  smokeColumn(x: number, y: number, size?: number): LoopHandle;
  /** Ground dust burst. */
  dust(x: number, y: number, size?: number): void;
  /** Stone/brick debris chunks with gravity and bounce. */
  debris(x: number, y: number, count?: number, palette?: 'tas' | 'tugla' | 'tahta'): void;
  /** Cannon muzzle blast: flash + smoke ring + sparks + shake. power 0.5..3. */
  muzzle(x: number, y: number, dirX: number, dirY: number, power?: number): void;
  /** Big impact explosion of stone ball on wall/ground. */
  impact(x: number, y: number, power?: number, onWall?: boolean): void;
  /** Water splash (ships, cannonballs into sea). */
  splash(x: number, y: number, size?: number): void;
  /** Sparks (metal, arrows on shields). */
  sparks(x: number, y: number, count?: number): void;
  /** Ballistic projectile from A to B. */
  projectile(fromX: number, fromY: number, toX: number, toY: number, opts?: ProjectileOpts): void;
  /** Camera shake (intensity 0..1, seconds). */
  shake(intensity: number, duration?: number): void;
  /** Floating pixel text (e.g. "-120"). */
  floatText(x: number, y: number, text: string, color?: number): void;
}

/** No-op implementation used before atmosphere is ready and in tests. */
export const NullFx: FxApi = {
  light: () => ({ setPosition() {}, setIntensity() {}, setRadius() {}, destroy() {} }),
  flash() {},
  smoke() {},
  fire: () => ({ setPosition() {}, setIntensity() {}, destroy() {} }),
  smokeColumn: () => ({ setPosition() {}, setIntensity() {}, destroy() {} }),
  dust() {},
  debris() {},
  muzzle() {},
  impact() {},
  splash() {},
  sparks() {},
  projectile(_a, _b, _c, _d, opts) {
    opts?.onImpact?.();
  },
  shake() {},
  floatText() {},
};

/** Forwarding FX proxy: features call it immediately; atmosphere installs the real impl. */
export interface FxProxy extends FxApi {
  setImpl(impl: FxApi): void;
}

export function createFxProxy(): FxProxy {
  let impl: FxApi = NullFx;
  const proxy = { setImpl: (f: FxApi) => void (impl = f) } as unknown as FxProxy;
  for (const k of Object.keys(NullFx) as (keyof FxApi)[]) {
    (proxy as any)[k] = (...args: unknown[]) => (impl[k] as (...a: unknown[]) => unknown)(...args);
  }
  return proxy;
}
