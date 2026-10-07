import type Phaser from 'phaser';
import { MAP_H, MAP_W, WORLD_ORIGIN_X, WORLD_ORIGIN_Y, WORLD_PX_H, WORLD_PX_W } from '../../core/constants';
import { DEPTH } from '../../core/layers';
import { P } from '../../art/palette';
import { R, type WorldData } from './terrain';

/**
 * ANIMATED WATER — one world-sized quad at DEPTH.WATER with a custom fragment shader.
 * Quantized to WORLD pixels (floor of the world coordinate), so it is crisp at every
 * integer zoom and stable while the camera moves. Colours come only from the palette
 * (a palette row stored in the data texture) and are dithered with a 4×4 Bayer matrix.
 *
 * Data texture 512×512 (2 samples per tile, as WorldData.sdf):
 *   R = water depth (tiles / 40)   G = coast SDF (−4..4 tiles)   B = current strength
 *   row 511 = palette: 0–9 water, 10–16 gold, 17–20 night, 21–27 steel, 28–32 snow
 */
export const WATER_DATA_KEY = 'world/water-data';
const TEX = 512;

const FRAG = `
precision highp float;
uniform vec2 resolution;
uniform float uTime;
uniform float uLight;
uniform float uDusk;
uniform float uWinter;
uniform sampler2D iChannel0;
varying vec2 fragCoord;

vec3 pal(float i) { return texture2D(iChannel0, vec2((i + 0.5) / 512.0, 511.5 / 512.0)).rgb; }
float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float hash(vec2 p) { p = fract(p * vec2(0.1031, 0.1030)); p += dot(p, p.yx + 33.33); return fract((p.x + p.y) * p.x); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  vec2 w = floor(vec2(fragCoord.x, resolution.y - fragCoord.y));
  vec2 wc = w + 0.5;
  float ax = (wc.x - ${WORLD_ORIGIN_X.toFixed(1)}) / 16.0;
  float ay = (wc.y - ${WORLD_ORIGIN_Y.toFixed(1)} - 8.0) / 8.0;
  vec2 uv = vec2(ax + ay, ay - ax) * 0.5;
  vec2 lim = vec2(${(MAP_W - 1.001).toFixed(3)}, ${(MAP_H - 1.001).toFixed(3)});
  uv = abs(uv);
  uv = lim - abs(lim - uv);
  vec4 d = texture2D(iChannel0, (uv * 2.0 + 0.5) / 512.0);
  float depth = d.r * 40.0;
  float sdf = d.g * 8.0 - 4.0;
  float cur = d.b;
  float t = uTime;
  float dd = max(depth, -sdf);

  // base colour by depth (shallows turquoise → deep navy) with slow drifting patches
  float L = 2.15 + 4.6 * exp(-dd / 2.4);
  L += (noise(w * vec2(0.006, 0.012) + vec2(t * 0.02, -t * 0.013)) - 0.5) * 0.9;

  // layered wave bands: short horizontal crests (iso water reads best as dashes)
  float w1 = noise(vec2(w.x * 0.05 + t * 0.32, w.y * 0.19 - t * 0.12));
  float w2 = noise(vec2(w.x * 0.083 - t * 0.21, w.y * 0.27 + t * 0.09) + 17.0);
  float wv = w1 * 0.62 + w2 * 0.38;
  float shoreCalm = smoothstep(0.0, 1.6, dd);
  bool crest = wv > 0.66 && shoreCalm > 0.5;
  if (wv > 0.71) L += 1.15 * shoreCalm;
  else if (wv > 0.64) L += 0.45 * shoreCalm;
  else if (wv < 0.27) L -= 0.75 * shoreCalm;

  // Bosphorus current: streaks drifting SSW along the strait
  vec2 fdir = normalize(vec2(-0.3, 1.0));
  vec2 fper = vec2(fdir.y, -fdir.x);
  float s = dot(uv, fdir);
  float n = dot(uv, fper);
  float streak = noise(vec2(n * 2.6, s * 0.28 - t * 0.55));
  float streak2 = noise(vec2(n * 5.1 + 7.0, s * 0.5 - t * 0.9));
  if (streak > 0.74) L += 1.1 * cur;
  if (streak2 > 0.82) L += 0.7 * cur;

  // night: sink toward deep blue
  L -= (1.0 - max(uLight, uDusk * 0.55)) * 1.3;
  L -= uWinter * 0.35;

  // shoreline: brighter shallows, pulsing foam bands rolling in, permanent lap line
  float foam = 0.0;
  if (sdf > -1.4) {
    L += smoothstep(-0.9, 0.0, sdf) * 0.9;
    float brk = noise(w * vec2(0.11, 0.2) + vec2(t * 0.15, 0.0));
    for (int k = 0; k < 2; k++) {
      float ph = fract(t * 0.16 + float(k) * 0.5 + noise(uv * 0.35) * 0.6);
      float pos = -1.15 + ph * 1.05;
      float a = sin(ph * 3.14159);
      if (abs(sdf - pos) < 0.045 + 0.05 * a && brk > 0.38 - a * 0.15 && a > 0.25) foam = max(foam, a);
    }
    if (sdf > -0.09 - 0.04 * sin(t * 1.3 + noise(uv) * 6.0)) foam = 1.0;
  }

  // specular glints that sparkle on crests
  vec2 cell = floor(w / vec2(6.0, 4.0));
  float h = hash(cell + 3.7);
  vec2 gp = cell * vec2(6.0, 4.0) + floor(vec2(hash(cell + 9.1) * 4.0, hash(cell + 1.3) * 3.0));
  float tw = sin(t * (1.6 + h * 2.4) + h * 60.0);
  bool onGlint = (w.y == gp.y) && (w.x >= gp.x) && (w.x <= gp.x + 1.0);
  bool glint = onGlint && h > mix(0.9, 0.62, uLight) && tw > 0.9 && wv > 0.45 && dd > 0.6;

  float b = bayer4(w);
  float idx = clamp(floor(L + b), 0.0, 9.0);
  vec3 col = pal(idx);

  // golden-hour reflections on the bright crests
  float hb = hash(w * 1.37 + 0.5);
  if (uDusk > 0.0 && wv > 0.72 && shoreCalm > 0.5 && hb < uDusk * 0.55) col = pal(wv > 0.78 ? 16.0 : 15.0);
  else if (uDusk > 0.0 && streak > 0.84 && cur > 0.4 && hb < uDusk * 0.5) col = pal(15.0);
  // night tint: deepest levels pull from the night ramp
  if (uLight < 0.6 && idx <= 2.0 && hash(w + 7.7) > uLight * 1.6) col = pal(17.0 + clamp(idx + 1.0, 0.0, 3.0));

  if (foam > 0.0) {
    float fl = foam > 0.8 ? 9.0 : 8.0;
    col = pal(fl - (1.0 - uLight) * 1.0);
    if (uDusk > 0.3 && b < uDusk * 0.5) col = pal(16.0);
  }
  if (glint) {
    col = uLight > 0.35 ? (uDusk > 0.35 ? pal(16.0) : pal(9.0)) : pal(32.0);
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

const VERT = `
precision highp float;
uniform mat4 uProjectionMatrix;
uniform mat4 uViewMatrix;
uniform vec2 uResolution;
attribute vec2 inPosition;
varying vec2 fragCoord;
varying vec2 outTexCoord;
void main () {
  gl_Position = uProjectionMatrix * uViewMatrix * vec4(inPosition, 1.0, 1.0);
  fragCoord = vec2(inPosition.x, uResolution.y - inPosition.y);
  outTexCoord = vec2(inPosition.x / uResolution.x, fragCoord.y / uResolution.y);
}
`;

/** Build the 512×512 RGBA data texture contents (pure). */
export function buildWaterData(world: WorldData): Uint8ClampedArray {
  const { W, H, sdf, sdfW, sdfH, depth, region } = world;
  const out = new Uint8ClampedArray(TEX * TEX * 4);
  // current strength per tile (blurred region mask)
  const curT = new Float32Array(W * H);
  const sb = { x: 135, y: 145 };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const r = region[y * W + x];
      let c = r === R.bogaz ? 1 : r === R.halic ? 0.12 : 0;
      if (r === R.marmara) c = Math.max(0.15, 0.75 - Math.hypot(x - sb.x, y - sb.y) / 40);
      curT[y * W + x] = c;
    }
  const tmp = new Float32Array(W * H);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        let s = 0;
        let n = 0;
        for (let k = -4; k <= 4; k++) {
          const xx = pass ? x : x + k;
          const yy = pass ? y + k : y;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          s += curT[yy * W + xx];
          n++;
        }
        tmp[y * W + x] = s / n;
      }
    curT.set(tmp);
  }
  for (let j = 0; j < Math.min(sdfH, TEX - 1); j++)
    for (let i = 0; i < Math.min(sdfW, TEX); i++) {
      const s = sdf[j * sdfW + i];
      const tx = Math.min(W - 1, i >> 1);
      const ty = Math.min(H - 1, j >> 1);
      const dTile = depth[ty * W + tx];
      const dd = s < 0 ? Math.max(-s, dTile > 11 ? dTile : 0) : 0;
      const k = (j * TEX + i) * 4;
      out[k] = Math.round(Math.min(1, dd / 40) * 255);
      out[k + 1] = Math.round(Math.max(0, Math.min(1, (s + 4) / 8)) * 255);
      out[k + 2] = Math.round(Math.max(0, Math.min(1, curT[ty * W + tx])) * 255);
      out[k + 3] = 255;
    }
  // pad rows beyond the map with the last row
  for (let j = sdfH; j < TEX - 1; j++) out.copyWithin(j * TEX * 4, (sdfH - 1) * TEX * 4, sdfH * TEX * 4);
  // palette row
  const palette: string[] = [...P.water, ...P.gold, ...P.night, ...P.steel, ...P.snow];
  palette.forEach((c, i) => {
    const n = parseInt(c.slice(1), 16);
    const k = ((TEX - 1) * TEX + i) * 4;
    out[k] = (n >> 16) & 255;
    out[k + 1] = (n >> 8) & 255;
    out[k + 2] = n & 255;
    out[k + 3] = 255;
  });
  return out;
}

export interface WaterView {
  setUniforms(time: number, light: number, dusk: number, winter: number): void;
  destroy(): void;
}

export function createWater(scene: Phaser.Scene, world: WorldData): WaterView {
  const tm = scene.textures;
  if (!tm.exists(WATER_DATA_KEY)) {
    const cv = document.createElement('canvas');
    cv.width = TEX;
    cv.height = TEX;
    const ctx = cv.getContext('2d')!;
    ctx.putImageData(new ImageData(buildWaterData(world) as Uint8ClampedArray<ArrayBuffer>, TEX, TEX), 0, 0);
    tm.addCanvas(WATER_DATA_KEY, cv);
  }
  const isGL = scene.sys.renderer.type === 2; // Phaser.WEBGL
  if (isGL) {
    try {
      // A plain BaseShader-shaped object (keeps this module free of runtime Phaser imports).
      const base = {
        key: 'world-water',
        fragmentSrc: FRAG,
        vertexSrc: VERT,
        uniforms: {
          uTime: { type: '1f', value: 0 },
          uLight: { type: '1f', value: 1 },
          uDusk: { type: '1f', value: 0 },
          uWinter: { type: '1f', value: 0 },
        },
      } as unknown as Phaser.Display.BaseShader;
      const sh = scene.add.shader(base, 0, 0, WORLD_PX_W, WORLD_PX_H);
      sh.setOrigin(0, 0);
      sh.setDepth(DEPTH.WATER);
      sh.setSampler2D('iChannel0', WATER_DATA_KEY, 0, {
        magFilter: 'linear',
        minFilter: 'linear',
        wrapS: 'clamp_to_edge',
        wrapT: 'clamp_to_edge',
      });
      return {
        setUniforms(time, light, dusk, winter) {
          sh.setUniform('uTime.value', time);
          sh.setUniform('uLight.value', light);
          sh.setUniform('uDusk.value', dusk);
          sh.setUniform('uWinter.value', winter);
        },
        destroy: () => sh.destroy(),
      };
    } catch (err) {
      console.error('[world] water shader failed, using fallback', err);
    }
  }
  // Fallback: flat palette water with a slowly breathing tint.
  const rect = scene.add.rectangle(0, 0, WORLD_PX_W, WORLD_PX_H, parseInt(P.water[4].slice(1), 16)).setOrigin(0, 0).setDepth(DEPTH.WATER);
  return {
    setUniforms(_t, light) {
      rect.setFillStyle(parseInt((light > 0.5 ? P.water[4] : P.water[2]).slice(1), 16));
    },
    destroy: () => rect.destroy(),
  };
}
