import { P } from '../../art/palette';
import { PixelCanvas } from '../../art/pixel';
import type { TextureGen } from '../../art/texture';
import { hash2 } from '../../core/rng';
import { IMG } from './build';
import {
  arrows,
  banner,
  bigFigure,
  carrack,
  dome,
  figure,
  flame,
  frame,
  galley,
  glow,
  goldSky,
  H,
  hill,
  IN,
  Mini,
  nightSky,
  ox,
  puffCloud,
  rider,
  roundTower,
  stormSky,
  tent,
  tower,
  vgrad,
  W,
  wall,
  water,
} from './art-kit';

/**
 * EVENT ILLUSTRATIONS — 160×96 miniatures for the event cards, in the manner
 * of Ottoman court painting (Matrakçı Nasuh, Hünername): flat stacked space,
 * gold-leaf skies, scroll clouds, outlined figures, illuminated frame that
 * banners and towers are allowed to break. 4 animation frames each.
 */
export const FRAMES = 4;
export const FPS = 5;

type Scene = (c: Mini, f: number) => void;

const GRASS = P.grass;
const SAGE = [P.green[1], P.green[2], P.green[3], P.green[4], P.green[5]] as const;
const OCHRE = P.dryGrass;
const LILAC = [P.purple[2], P.purple[3], P.purple[4], P.purple[5], P.limestone[4]] as const;
const ROSE = [P.brick[2], P.brick[3], P.brick[4], P.brick[5], P.brick[6]] as const;
const JAN = P.cloth; // janissary robes: blue-grey/white
const BLUE_ROBE = P.blue;

// ───────────────────────────── scenes ─────────────────────────────

const hisar: Scene = (c, f) => {
  goldSky(c, 52, [
    [100, 12, 16],
    [126, 22, 10],
  ]);
  // Asian shore across the water with Anadolu Hisarı
  hill(c, 104, IN.x1, (x) => 40 + Math.sin(x * 0.09) * 3 + (x - 104) * 0.05, 52, SAGE, 4, false);
  tower(c, 130, 46, 7, 11, 'konik');
  wall(c, 124, 136, 43, 47, { merlons: true });
  // Bosphorus
  water(c, 60, 48, IN.x1, IN.y1, f);
  galley(c, 112, 78, 26, -1, f, P.cloth);
  // European hillside (left, rising)
  hill(c, IN.x0, 104, (x) => 30 + (x - 6) * 0.42 + Math.sin(x * 0.2) * 1.5, IN.y1, GRASS, 1);
  hill(c, IN.x0, 72, (x) => 62 + (x - 6) * 0.35 + Math.sin(x * 0.3) * 1.2, IN.y1, OCHRE, 2);
  // walls stepping down the slope
  wall(c, 22, 44, 30, 44);
  wall(c, 44, 70, 42, 58);
  wall(c, 70, 98, 54, 70);
  // the three great towers
  roundTower(c, 26, 46, 7, 30, 'konik'); // Saruca Paşa
  roundTower(c, 92, 72, 9, 32, 'konik'); // Halil Paşa (sea tower)
  tower(c, 58, 60, 10, 20, 'mazgal'); // Zağanos Paşa
  // scaffolding on the sea tower
  for (let y = 46; y < 72; y += 5) c.line(81, y, 104, y, P.wood[3]);
  for (let x = 82; x <= 104; x += 7) c.line(x, 44, x, 72, P.wood[4]);
  // workers carrying stone up the slope
  figure(c, 40, 66, { robe: P.red, hat: 'baslik', hatColor: P.cloth, pose: 'tasi', itemColor: P.limestone, f, facing: 1 });
  figure(c, 50, 72, { robe: P.blue, hat: 'baslik', hatColor: P.cloth, pose: 'tasi', itemColor: P.limestone, f: f + 1, facing: 1 });
  figure(c, 30, 60, { robe: P.green, hat: 'sarik', pose: 'isaret', f, facing: 1, beard: true });
  ox(c, 18, 80, 1, f);
  // cart of stones
  c.rect(26, 75, 12, 3, P.wood[3]);
  c.rect(27, 72, 10, 3, P.limestone[4]);
  c.disc(28, 79, 2, P.wood[1]);
  c.disc(36, 79, 2, P.wood[1]);
  figure(c, 66, 84, { robe: P.gold, hat: 'sarik', pose: 'cek', f, facing: -1 });
  // banner breaking the frame
  c.free(() => banner(c, 26, 2, 12, P.red, f, 10, 6));
};

const ordu: Scene = (c, f) => {
  goldSky(c, 34, [
    [14, 9, 14],
    [118, 11, 18],
  ]);
  // the city beyond: dome far right
  dome(c, 128, 26, 7, 2);
  // inner wall + towers
  wall(c, IN.x0, IN.x1, 24, 38);
  for (let x = 14; x < 152; x += 22) tower(c, x, 38, 9, 19, 'mazgal');
  // outer wall
  wall(c, IN.x0, IN.x1, 36, 44);
  for (let x = 25; x < 152; x += 22) tower(c, x, 44, 6, 11, 'mazgal');
  // moat
  water(c, IN.x0, 45, IN.x1, 48, f, true);
  // camp meadow
  hill(c, IN.x0, IN.x1, (x) => 49 + Math.sin(x * 0.07) * 0.8, IN.y1, GRASS, 9);
  // back row of tents
  for (let i = 0; i < 7; i++) {
    const x = 10 + i * 21;
    if (x > 60 && x < 100) continue;
    tent(c, x, 62, 12, 10, i % 2 ? P.green : P.red, P.cloth, f);
  }
  // the Sultan's otağ (red & gold)
  tent(c, 64, 72, 30, 22, P.red, P.red, f, P.gold);
  banner(c, 60, 40, 30, P.red, f, 10, 6);
  banner(c, 98, 42, 28, P.green, f + 1, 9, 5, -1);
  // front tents
  tent(c, 14, 84, 16, 13, P.red, P.cloth, f);
  tent(c, 120, 86, 18, 14, P.green, P.cloth, f);
  // janissaries & sipahis
  for (let i = 0; i < 6; i++) figure(c, 42 + i * 4, 86, { robe: JAN, hat: 'bork', item: 'mizrak', f, facing: 1 });
  rider(c, 104, 84, { horse: P.cloth, robe: P.red, hat: 'buyuk-sarik', facing: -1, f });
  rider(c, 36, 76, { horse: P.wood, robe: P.blue, hat: 'sarik', facing: 1, f: f + 1, item: 'mizrak' });
  // white banner breaking the frame
  c.free(() => banner(c, 146, 0, 26, P.green, f + 2, 11, 6, -1));
};

const deniz: Scene = (c, f) => {
  goldSky(c, 30, [
    [70, 9, 16],
    [118, 14, 12],
  ]);
  // the city on the horizon (Acropolis point)
  hill(c, IN.x0, 64, (x) => 22 + Math.sin(x * 0.12) * 2, 31, OCHRE, 3, false);
  wall(c, IN.x0, 62, 24, 31, { merlons: true });
  dome(c, 30, 22, 6, 2);
  tower(c, 52, 30, 6, 12, 'mazgal');
  // sea
  water(c, IN.x0, 31, IN.x1, IN.y1, f);
  // the four ships breaking through
  carrack(c, 74, 62, 1, f, 'ceneviz');
  carrack(c, 104, 70, 1, f + 1, 'ceneviz');
  carrack(c, 132, 60, 1, f + 2, 'bizans');
  carrack(c, 92, 50, 1, f + 3, 'ceneviz');
  // Ottoman galleys swarming
  galley(c, 40, 78, 30, 1, f, P.cloth);
  galley(c, 118, 86, 30, -1, f + 1, P.cloth);
  galley(c, 60, 88, 26, 1, f + 2, null);
  galley(c, 132, 76, 24, -1, f + 3, null);
  // arrows and smoke
  arrows(c, 52, 34, 140, 60, 10, f, 4);
  puffCloud(c, 88, 74, 4);
  puffCloud(c, 118, 66, 3);
  // the Sultan rides into the sea
  hill(c, IN.x0, 30, (x) => 70 + (x - 6) * 0.4, IN.y1, OCHRE, 5, false);
  rider(c, 24, 84, { horse: P.cloth, robe: P.red, hat: 'buyuk-sarik', facing: 1, f, inWater: true });
  for (let x = 14; x < 36; x++) if ((x + f) % 3 === 0) c.set(x, 84, P.water[8]);
  figure(c, 12, 76, { robe: JAN, hat: 'bork', f, facing: 1, item: 'mizrak' });
};

const gemiler: Scene = (c, f) => {
  nightSky(c, 60, f, 7);
  // full moon (22 Nisan 1453 fell close to a full moon)
  glow(c, 24, 18, 14, P.night[3], 0.45);
  c.disc(24, 18, 6, P.cloth[4]);
  c.disc(23, 17, 5, P.cloth[5]);
  c.set(25, 20, P.cloth[3]);
  c.set(21, 16, P.cloth[3]);
  // Galata on its hill (right), walls and the conical tower
  const NH = [P.night[0], P.night[1], P.night[2], P.night[2]] as const;
  hill(c, 108, IN.x1, (x) => 40 - (x - 108) * 0.1, 66, NH, 0, false);
  wall(c, 114, IN.x1, 37, 46, { dark: true });
  roundTower(c, 140, 40, 3, 20, 'konik');
  c.set(140, 30, P.fire[5]);
  // the Golden Horn at the bottom right, ships already launched
  water(c, 96, 70, IN.x1, IN.y1, f, true);
  galley(c, 120, 84, 24, 1, f, null);
  galley(c, 104, 89, 20, 1, f + 1, null);
  // the ridge to cross (Beşiktaş → Kasımpaşa)
  const ridge = (x: number) => 64 - Math.max(0, 30 - Math.abs(x - 66) * 0.62);
  hill(c, IN.x0, 112, ridge, IN.y1, [P.green[0], P.green[1], P.green[2], P.green[2]], 3);
  // cypresses on the slope
  for (const tx of [14, 22, 100, 108]) {
    const ty = Math.round(ridge(tx));
    for (let y = 0; y < 12; y++) {
      const half = y < 2 ? 0 : y < 9 ? 1 : 0;
      for (let k = -half; k <= half; k++) c.set(tx + k, ty - y, k < 0 ? P.cypress[3] : P.cypress[2]);
    }
  }
  // greased slipway: planks across the track, torches along it
  for (let x = IN.x0 + 2; x < 108; x += 3) {
    const y = Math.round(ridge(x));
    c.set(x, y - 1, P.wood[5]);
    c.set(x + 1, y - 1, P.wood[4]);
    c.set(x, y, P.wood[2]);
  }
  for (let i = 0; i < 6; i++) {
    const tx = 18 + i * 16;
    const ty = Math.round(ridge(tx)) + 2;
    c.line(tx, ty, tx, ty - 5, P.wood[3]);
    flame(c, tx, ty - 6, 3, f + i);
    glow(c, tx, ty - 7, 6, P.fire[5], 0.3);
  }
  // galleys following up the slope (masts and sails over the ridge)
  galley(c, 4, Math.round(ridge(14)) - 1, 24, 1, f + 2, P.cloth);
  // the great galley on the crest, sails set, on its cradle
  const gx = 46;
  const gyw = Math.round(ridge(66)) + 1;
  c.rect(gx + 4, gyw, 36, 3, P.wood[2]);
  galley(c, gx, gyw, 42, 1, f, P.cloth, P.red);
  // oxen and men hauling down toward the water
  ox(c, 98, Math.round(ridge(98)) + 2, 1, f);
  ox(c, 86, Math.round(ridge(86)) + 3, 1, f + 1);
  c.line(gx + 44, gyw - 2, 96, Math.round(ridge(96)) - 3, P.wood[5]);
  figure(c, 78, Math.round(ridge(78)) + 2, { robe: P.red, hat: 'baslik', pose: 'cek', f, facing: 1 });
  figure(c, 40, Math.round(ridge(40)) + 2, { robe: P.blue, hat: 'baslik', pose: 'cek', f: f + 1, facing: 1 });
  figure(c, 32, Math.round(ridge(32)) + 3, { robe: JAN, hat: 'bork', item: 'mesale', f, facing: 1 });
  // drummers covering the noise
  figure(c, 14, 88, { robe: P.red, hat: 'sarik', pose: 'kaldir', f, facing: 1 });
  c.disc(20, 85, 3, P.red[3]);
  c.disc(20, 84, 2, P.cloth[4]);
  figure(c, 30, 88, { robe: P.green, hat: 'sarik', pose: 'kaldir', f: f + 1, facing: 1 });
  c.disc(36, 85, 3, P.red[3]);
  c.disc(36, 84, 2, P.cloth[4]);
};

const tutulma: Scene = (c, f) => {
  nightSky(c, IN.y1, f, 3);
  // eclipsed moon
  const mx = 112;
  const my = 26;
  glow(c, mx, my, 18, P.night[3], 0.5);
  c.disc(mx, my, 10, P.cloth[4]);
  c.disc(mx - 1, my - 1, 9, P.cloth[5]);
  // umbra creeping from the lower left: dark coppery red
  for (let y = -10; y <= 10; y++)
    for (let x = -10; x <= 10; x++) {
      if (x * x + y * y > 108) continue;
      const dx = x + 7;
      const dy = y - 5;
      const dd = Math.sqrt(dx * dx + dy * dy);
      if (dd < 11) c.set(mx + x, my + y, dd < 8 ? P.blood[1] : P.red[2]);
      else if (dd < 12.5 && (x + y) % 2 === 0) c.set(mx + x, my + y, P.brick[2]);
    }
  // the city: walls, towers and the dome of Ayasofya (no minarets in 1453)
  const S = { dark: true };
  dome(c, 58, 54, 13, 3);
  for (let x = 40; x <= 76; x++) for (let y = 55; y < 64; y++) c.set(x, y, x < 58 ? P.stone[3] : P.stone[2]);
  dome(c, 40, 58, 5, 1);
  dome(c, 76, 58, 5, 1);
  wall(c, IN.x0, IN.x1, 64, IN.y1, { ...S });
  for (let x = 12; x < 152; x += 24) tower(c, x, IN.y1, 10, 33, 'mazgal', true);
  // moonlit rim on the merlons
  for (let x = IN.x0; x < IN.x1; x += 4) c.set(x + 1, 62, P.night[3]);
  // defenders looking up, a torch
  figure(c, 30, 64, { robe: P.purple, hat: 'migfer', item: 'mizrak', f, facing: 1 });
  figure(c, 98, 64, { robe: P.blue, hat: 'migfer', pose: 'kaldir', f, facing: 1 });
  figure(c, 104, 64, { robe: P.red, hat: 'yok', f, facing: 1 });
  figure(c, 132, 64, { robe: P.purple, hat: 'migfer', item: 'mesale', f, facing: -1 });
  glow(c, 130, 54, 8, P.fire[5], 0.35);
};

const sancak: Scene = (c, f) => {
  goldSky(c, 60, [[16, 12, 14]]);
  puffCloud(c, 40, 30, 6);
  puffCloud(c, 128, 36, 7);
  puffCloud(c, 70, 18, 4);
  // breached wall and the tower
  wall(c, IN.x0, 76, 44, 74);
  wall(c, 118, IN.x1, 40, 74);
  tower(c, 100, 74, 26, 46, 'kirik');
  // rubble slope in the breach
  hill(c, 60, 124, (x) => 74 - Math.max(0, 14 - Math.abs(x - 90) * 0.4), IN.y1, [P.limestone[1], P.limestone[2], P.limestone[3], P.limestone[3]], 6, false);
  for (let i = 0; i < 26; i++) {
    const x = 62 + Math.floor(hash2(i, 1, 2) * 60);
    const y = 66 + Math.floor(hash2(i, 2, 2) * 18);
    c.rect(x, y, 2, 1, hash2(i, 3, 2) < 0.4 ? P.brick[3] : P.limestone[4]);
  }
  // ground & attackers
  hill(c, IN.x0, IN.x1, () => 80, IN.y1, OCHRE, 8, false);
  // ladder
  for (let k = 0; k < 30; k++) {
    c.set(52 + Math.floor(k * 0.55), 78 - k, P.wood[4]);
    c.set(57 + Math.floor(k * 0.55), 78 - k, P.wood[3]);
    if (k % 4 === 0) c.line(52 + Math.floor(k * 0.55), 78 - k, 57 + Math.floor(k * 0.55), 78 - k, P.wood[5]);
  }
  figure(c, 62, 58, { robe: JAN, hat: 'bork', item: 'kalkan', pose: 'kaldir', f, facing: 1 });
  figure(c, 57, 68, { robe: JAN, hat: 'bork', f: f + 1, facing: 1, item: 'kalkan' });
  for (let i = 0; i < 7; i++) figure(c, 14 + i * 7, 88, { robe: i % 2 ? JAN : P.red, hat: i % 2 ? 'bork' : 'sarik', item: 'mizrak', f: f + i, facing: 1 });
  figure(c, 84, 76, { robe: JAN, hat: 'bork', item: 'yay', f, facing: 1 });
  // defenders on the wall
  figure(c, 130, 40, { robe: P.purple, hat: 'migfer', item: 'mizrak', f, facing: -1 });
  figure(c, 142, 40, { robe: P.steel, hat: 'migfer', pose: 'kaldir', f, facing: -1 });
  arrows(c, 70, 20, 140, 50, 9, f, 9, -4, 2);
  // Ulubatlı Hasan on the broken tower, planting the banner (breaks the frame)
  figure(c, 98, 30, { robe: JAN, hat: 'bork', pose: 'kaldir', f, facing: -1 });
  c.free(() => banner(c, 101, 1, 30, P.red, f, 14, 8));
};

const dokum: Scene = (c, f) => {
  goldSky(c, 60, [[64, 9, 18]]);
  hill(c, IN.x0, IN.x1, () => 60, IN.y1, P.dirt, 3, false);
  // timber casting shed with a tiled roof over the mould pit
  for (const px of [86, 112, 140]) for (let y = 30; y <= 62; y++) {
    c.set(px, y, P.wood[4]);
    c.set(px + 1, y, P.wood[2]);
  }
  for (let y = 22; y <= 30; y++) {
    const t = (y - 22) / 8;
    for (let x = Math.round(92 - t * 10); x <= Math.round(136 + t * 10); x++) c.set(x, y, (x + y) % 4 === 0 ? P.roof[2] : y === 30 ? P.roof[1] : t < 0.4 ? P.roof[5] : P.roof[4]);
  }
  for (let x = 82; x <= 146; x++) c.set(x, 31, P.wood[3]);
  // hoist: tripod with pulley and chain above the pit
  c.line(104, 34, 116, 58, P.wood[4]);
  c.line(128, 34, 116, 58, P.wood[3]);
  c.line(104, 34, 128, 34, P.wood[5]);
  c.disc(116, 36, 1, P.steel[4]);
  for (let y = 37; y < 52; y += 2) c.set(116, y, P.steel[3]);
  // brick furnace with dome and chimney
  for (let y = 28; y <= 62; y++)
    for (let x = 14; x <= 50; x++) {
      const dx = x - 32;
      const top = 42 - Math.round(Math.sqrt(Math.max(0, 324 - dx * dx)) * 0.75);
      if (y < top) continue;
      const course = (y + (Math.floor(x / 3) % 2)) % 3 === 0;
      c.set(x, y, course ? P.brick[1] : x < 26 ? P.brick[5] : x < 40 ? P.brick[4] : P.brick[3]);
    }
  c.rect(28, 12, 7, 18, P.brick[3]);
  c.rect(28, 12, 2, 18, P.brick[5]);
  c.rect(27, 11, 9, 2, P.brick[2]);
  // furnace mouth glow
  for (let y = 46; y <= 61; y++) for (let x = 26; x <= 38; x++) if ((x - 32) ** 2 / 36 + (y - 61) ** 2 / 200 <= 1) c.set(x, y, (f + x * 3 + y) % 5 === 0 ? P.fire[7] : y < 52 ? P.fire[5] : P.fire[6]);
  glow(c, 32, 55, 16, P.fire[5], 0.5);
  // sparks rising
  for (let i = 0; i < 6; i++) {
    const t = (i * 0.17 + f * 0.25) % 1;
    c.set(30 + Math.round(Math.sin(i * 2 + t * 6) * 3), 44 - Math.round(t * 18), t < 0.5 ? P.fire[6] : P.fire[4]);
  }
  // bellows workers
  figure(c, 12, 70, { robe: P.blue, hat: 'baslik', hatColor: P.cloth, pose: 'cek', f, facing: 1 });
  figure(c, 50, 70, { robe: P.cloth, hat: 'baslik', hatColor: P.red, pose: 'cek', f: f + 1, facing: -1 });
  // molten bronze channel to the mould pit
  for (let x = 40; x <= 96; x++) {
    const y = 64 + Math.round((x - 40) * 0.1);
    c.set(x, y, (x + f * 3) % 7 === 0 ? P.fire[7] : P.fire[6]);
    c.set(x, y + 1, P.fire[4]);
  }
  // pit with the long barrel mould glowing
  c.rect(92, 66, 50, 10, P.dirt[1]);
  c.rect(94, 68, 46, 6, P.bronze[3]);
  c.rect(94, 68, 46, 2, f % 2 ? P.fire[6] : P.fire[5]);
  glow(c, 117, 70, 18, P.fire[4], 0.35);
  // smoke from the chimney (rolls with the frame)
  puffCloud(c, 32 + (f % 2), 6 - (f % 2), 4);
  puffCloud(c, 46 + f, 6, 3);
  // workers with long poles stirring the channel
  figure(c, 64, 74, { robe: P.red, hat: 'baslik', hatColor: P.cloth, item: 'sirik', f, facing: -1 });
  figure(c, 78, 76, { robe: P.green, hat: 'baslik', hatColor: P.cloth, item: 'sirik', f: f + 1, facing: -1 });
  // Orban in his fur cap, pointing; an official in a great turban
  figure(c, 148, 86, { robe: P.green, hat: 'kalpak', pose: 'isaret', f, facing: -1, beard: true });
  figure(c, 134, 88, { robe: P.red, hat: 'buyuk-sarik', f, facing: -1, beard: true });
  // bronze ingots & a finished barrel on its sledge
  for (let i = 0; i < 5; i++) c.rect(12 + i * 4, 84, 3, 2, i % 2 ? P.bronze[5] : P.bronze[4]);
  c.rect(84, 82, 38, 5, P.bronze[3]);
  c.rect(84, 82, 38, 1, P.bronze[6]);
  c.rect(84, 86, 38, 1, P.bronze[1]);
  for (let x = 88; x < 122; x += 8) c.rect(x, 82, 1, 5, P.bronze[2]);
  c.line(80, 88, 126, 88, P.wood[3]);
};

const top: Scene = (c, f) => {
  goldSky(c, 58, [[14, 10, 22]]);
  // distant land walls taking the hit
  hill(c, 92, IN.x1, (x) => 48 - (x - 92) * 0.04, 60, OCHRE, 4, false);
  wall(c, 100, IN.x1, 34, 50);
  tower(c, 120, 50, 9, 22, 'kirik');
  tower(c, 144, 50, 9, 20, 'mazgal');
  const hitF = f % 4;
  puffCloud(c, 120, 34 - hitF, 3 + (hitF > 1 ? 1 : 0), [P.dirt[3], P.dirt[4], P.dirt[5], P.dirt[6]]);
  for (let i = 0; i < 6; i++) c.set(112 + i * 3 + hitF, 30 - ((i + hitF) % 3) * 3 - hitF, i % 2 ? P.limestone[4] : P.brick[4]);
  // ground
  hill(c, IN.x0, IN.x1, (x) => 58 + Math.sin(x * 0.05) * 1.2, IN.y1, GRASS, 6);
  // the great bombard: chamber + chase, on a timber bed
  const gy = 70;
  c.rect(8, gy + 8, 68, 5, P.wood[3]);
  c.rect(8, gy + 8, 68, 1, P.wood[5]);
  for (let x = 12; x < 74; x += 10) c.rect(x, gy + 13, 3, 4, P.wood[2]);
  for (let x = 10; x <= 74; x++) {
    const r = x < 28 ? 5 : 7;
    for (let y = -r; y <= r; y++) {
      const k = (y + r) / (2 * r); // 0 top → 1 bottom
      const col = k < 0.1 ? P.bronze[5] : k < 0.24 ? P.bronze[6] : k < 0.4 ? P.bronze[4] : k < 0.72 ? P.bronze[3] : k < 0.88 ? P.bronze[1] : P.steel[3];
      c.set(x, gy + y, col);
    }
    if (x === 28 || (x > 28 && (x - 28) % 11 === 0) || x === 10) for (let y = -r - 1; y <= r + 1; y++) c.set(x, gy + y, y < -r + 2 ? P.bronze[6] : y > r - 2 ? P.bronze[0] : P.bronze[2]);
  }
  // muzzle ring and dark bore
  for (let y = -8; y <= 8; y++) c.set(75, gy + y, y < -5 ? P.bronze[6] : y > 5 ? P.bronze[1] : P.bronze[4]);
  for (let y = -4; y <= 4; y++) c.set(76, gy + y, P.outline[0]);
  // muzzle blast: flash cone and rolling smoke
  const b = f % 4;
  const flashLen = [18, 12, 6, 2][b];
  puffCloud(c, 96 + b * 4, gy - 9 - b, 4 + Math.floor(b / 2));
  puffCloud(c, 110 + b * 5, gy - 19 - b * 2, 5 + Math.floor(b / 2));
  if (b >= 2) puffCloud(c, 84 + b * 2, gy - 2, 3 + b - 2);
  glow(c, 84, gy, 18, P.fire[6], [0.7, 0.5, 0.3, 0.12][b]);
  for (let k = 0; k < flashLen; k++) {
    const half = Math.round(2 + k * 0.55);
    for (let y = -half; y <= half; y++) {
      if (Math.abs(y) === half && (k + y) % 2 === 0) continue;
      c.set(77 + k, gy + y, Math.abs(y) < half * 0.45 && k < flashLen * 0.6 ? P.fire[7] : k > flashLen * 0.7 ? P.fire[4] : P.fire[6]);
    }
  }
  // the stone ball in flight
  c.disc(126 + b * 5, 40 - b * 2, 2, P.stone[5]);
  c.set(125 + b * 5, 39 - b * 2, P.stone[7]);
  // gunners: one with the linstock at the breech, others shielding their ears
  figure(c, 14, 88, { robe: P.red, hat: 'sarik', item: 'mesale', f, facing: 1 });
  figure(c, 30, 88, { robe: P.blue, hat: 'baslik', hatColor: P.cloth, pose: 'kaldir', f, facing: -1 });
  figure(c, 44, 87, { robe: JAN, hat: 'bork', pose: 'kaldir', f: f + 1, facing: 1 });
  figure(c, 58, 88, { robe: P.green, hat: 'sarik', pose: 'isaret', f, facing: 1, beard: true });
  // stacked stone balls
  for (let i = 0; i < 4; i++) {
    c.disc(92 + i * 6, 84, 2, P.stone[4]);
    c.set(91 + i * 6, 83, P.stone[6]);
  }
  c.disc(95, 80, 2, P.stone[4]);
  c.disc(101, 80, 2, P.stone[4]);
};

const divan: Scene = (c, f) => {
  // back wall: İznik-blue tiles and three ogival arches
  vgrad(c, IN.x0, IN.y0, IN.x1, 64, [P.blue[1], P.blue[2], P.blue[3], P.blue[2]]);
  for (let y = IN.y0 + 1; y < 64; y += 4)
    for (let x = IN.x0 + ((y >> 2) & 1) * 2; x < IN.x1; x += 4) {
      c.set(x, y, P.blue[4]);
      if ((x + y) % 8 === 1) c.set(x, y, P.green[5]);
    }
  const arch = (cx: number, w: number, topY: number) => {
    for (let y = topY; y <= 60; y++) {
      const t = (y - topY) / 10;
      const half = y < topY + 10 ? Math.round(w * Math.sin(Math.min(1, t) * (Math.PI / 2))) : w;
      for (let k = -half; k <= half; k++) c.set(cx + k, y, P.gold[5]);
      for (let k = -half + 1; k <= half - 1; k++) c.set(cx + k, y, y < topY + 4 ? P.gold[4] : P.night[1]);
    }
    for (let y = topY + 12; y < 57; y += 3) for (let k = -w + 3; k <= w - 3; k += 3) c.set(cx + k, y, P.gold[3]);
    c.set(cx, topY - 1, P.gold[6]);
  };
  arch(30, 14, 14);
  arch(130, 14, 14);
  // canopy behind the throne
  arch(80, 22, 8);
  for (let y = 26; y < 60; y++) for (let k = -18; k <= 18; k++) c.set(80 + k, y, (k + 40) % 6 < 3 ? P.red[3] : P.red[2]);
  for (let k = -18; k <= 18; k++) c.set(80 + k, 26, P.gold[5]);
  for (let k = -18; k <= 18; k += 2) c.set(80 + k, 27, P.gold[4]);
  // hanging lamps
  for (const lx of [52, 108]) {
    c.line(lx, IN.y0, lx, 22, P.gold[3]);
    c.disc(lx, 25, 2, P.gold[5]);
    c.set(lx, 28, P.fire[6 - (f % 2)]);
    glow(c, lx, 27, 7, P.fire[6], 0.3);
  }
  // carpet floor
  vgrad(c, IN.x0, 64, IN.x1, IN.y1, [P.red[3], P.red[2]]);
  for (let y = 67; y < IN.y1; y += 5) for (let x = IN.x0 + ((y / 5) % 2) * 4; x < IN.x1; x += 8) c.diamond(x, y, 4, 3, P.gold[3]);
  for (let x = IN.x0; x <= IN.x1; x++) {
    c.set(x, 64, P.gold[4]);
    c.set(x, 65, x % 3 ? P.green[3] : P.gold[3]);
  }
  // sedir (throne platform) with cushions
  c.rect(60, 54, 40, 12, P.gold[3]);
  c.rect(60, 54, 40, 2, P.gold[5]);
  for (let x = 62; x <= 98; x += 6) c.diamond(x + 2, 60, 4, 3, P.red[4]);
  c.rect(64, 44, 32, 10, P.red[4]);
  c.rect(64, 44, 32, 1, P.red[5]);
  // the Sultan
  bigFigure(c, 80, 56, { robe: P.red, inner: P.gold, fur: P.wood, turban: 'kavuk', beard: 'kizil', sorguc: true, facing: 1, f });
  // viziers: Halil Paşa (green, left) & Zağanos Paşa (red, right)
  figure(c, 48, 82, { robe: P.green, hat: 'buyuk-sarik', facing: 1, pose: 'isaret', f, beard: true });
  figure(c, 36, 84, { robe: P.blue, hat: 'buyuk-sarik', facing: 1, f, beard: true });
  figure(c, 24, 86, { robe: P.purple, hat: 'sarik', facing: 1, f, beard: true });
  figure(c, 112, 82, { robe: P.red, hat: 'buyuk-sarik', facing: -1, pose: 'isaret', f, beard: true });
  figure(c, 124, 84, { robe: P.bronze, hat: 'buyuk-sarik', facing: -1, f, beard: true });
  figure(c, 136, 86, { robe: P.green, hat: 'sarik', facing: -1, f, beard: true });
  figure(c, 12, 88, { robe: JAN, hat: 'bork', item: 'mizrak', facing: 1, f });
  figure(c, 148, 88, { robe: JAN, hat: 'bork', item: 'mizrak', facing: -1, f });
};

const mektup: Scene = (c, f) => {
  // tent interior: deep red hangings with gold tracery
  for (let x = IN.x0; x <= IN.x1; x++)
    for (let y = IN.y0; y <= 64; y++) {
      const stripe = Math.floor((x - IN.x0) / 8) % 2 === 0;
      c.set(x, y, stripe ? P.red[2] : P.red[3]);
    }
  for (let x = IN.x0 + 4; x <= IN.x1; x += 8)
    for (let y = IN.y0 + 6; y < 62; y += 8) {
      c.diamond(x, y, 4, 4, P.gold[3]);
      c.set(x, y, P.gold[5]);
    }
  // top valance with scallops
  for (let x = IN.x0; x <= IN.x1; x++) {
    c.set(x, IN.y0, P.gold[5]);
    c.set(x, IN.y0 + 1, P.green[3]);
    c.set(x, IN.y0 + 2, P.green[3]);
    if (x % 4 < 2) c.set(x, IN.y0 + 3, P.green[3]);
    c.set(x, IN.y0 + 2, x % 4 === 1 ? P.gold[4] : P.green[3]);
  }
  // ogival doorway opening onto the camp
  const dx0 = 120;
  for (let y = 14; y <= 64; y++) {
    const t = (y - 14) / 12;
    const half = y < 26 ? Math.round(14 * Math.sin(Math.min(1, t) * (Math.PI / 2))) : 14;
    for (let k = -half; k <= half; k++) c.set(dx0 + k, y, P.gold[5]);
    for (let k = -half + 2; k <= half - 2; k++) c.set(dx0 + k, y, y < 46 ? (y < 30 ? P.gold[5] : P.gold[4]) : P.grass[4]);
  }
  tent(c, 108, 56, 10, 8, P.green, P.cloth, f);
  tent(c, 120, 58, 14, 12, P.red, P.red, f, P.gold);
  figure(c, 112, 62, { robe: JAN, hat: 'bork', item: 'mizrak', f, facing: 1 });
  // carpet
  vgrad(c, IN.x0, 64, IN.x1, IN.y1, [P.green[2], P.green[1]]);
  for (let x = IN.x0; x <= IN.x1; x++) {
    c.set(x, 64, P.gold[4]);
    c.set(x, 66, x % 3 ? P.red[3] : P.gold[3]);
  }
  for (let y = 71; y < IN.y1; y += 6) for (let x = IN.x0 + 4; x < IN.x1; x += 10) c.diamond(x + ((y / 6) % 2) * 5, y, 6, 3, P.red[3]);
  // cushion
  c.rect(34, 76, 30, 8, P.red[4]);
  c.rect(34, 76, 30, 1, P.red[5]);
  // the sheikh, writing his letter
  bigFigure(c, 48, 82, { robe: P.green, inner: P.cloth, fur: null, turban: 'sarik', beard: 'beyaz', facing: 1, yaziyor: true, f });
  // rahle (reading stand) with an open book
  c.line(70, 84, 80, 72, P.wood[4]);
  c.line(80, 84, 70, 72, P.wood[3]);
  c.rect(69, 69, 12, 3, P.cloth[5]);
  c.set(75, 69, P.wood[2]);
  for (let x = 70; x < 80; x += 2) c.set(x, 70, P.outline[2]);
  // oil lamp
  c.rect(90, 82, 6, 2, P.bronze[4]);
  c.set(96, 81, P.bronze[3]);
  flame(c, 92, 81, 4, f);
  glow(c, 92, 77, 14, P.fire[6], 0.35);
  // a disciple waiting to carry the letter
  figure(c, 104, 86, { robe: P.cloth, hat: 'sarik', facing: -1, f, beard: true });
  // books & inkwell
  c.rect(14, 82, 12, 3, P.red[3]);
  c.rect(15, 79, 10, 3, P.blue[3]);
  c.rect(16, 76, 8, 3, P.green[3]);
  c.rect(28, 84, 3, 2, P.outline[2]);
};

const lagim: Scene = (c, f) => {
  goldSky(c, 38, [[24, 10, 20]]);
  // the wall above ground
  wall(c, 86, IN.x1, 14, 38);
  tower(c, 116, 38, 14, 28, 'mazgal');
  figure(c, 100, 14, { robe: P.purple, hat: 'migfer', item: 'mizrak', f, facing: -1 });
  // ground surface & cut-away earth
  hill(c, IN.x0, IN.x1, () => 38, 40, GRASS, 1, false);
  for (let y = 40; y <= IN.y1; y++)
    for (let x = IN.x0; x <= IN.x1; x++) {
      const stratum = Math.floor((y - 40 + Math.sin(x * 0.08) * 2) / 9);
      const ramp = [P.dirt[4], P.dirt[3], P.dirt[2], P.dirt[3]];
      let col: string = ramp[((stratum % 4) + 4) % 4];
      if (hash2(x, y, 5) < 0.04) col = P.dirt[5];
      c.set(x, y, col);
    }
  // the tunnel (Ottoman side → under the wall)
  const tunnel = (x: number) => 60 + Math.round(Math.sin(x * 0.05) * 2);
  for (let x = 12; x <= 118; x++) {
    const ty = tunnel(x);
    for (let y = ty - 5; y <= ty + 5; y++) c.set(x, y, y === ty + 5 ? P.dirt[1] : P.outline[2]);
  }
  // entrance shaft
  for (let y = 38; y < 60; y++) for (let x = 10; x <= 16; x++) c.set(x, y, P.outline[2]);
  for (let y = 40; y < 60; y += 3) c.line(10, y, 16, y, P.wood[3]);
  // timber props
  for (let x = 24; x <= 112; x += 11) {
    const ty = tunnel(x);
    c.line(x, ty - 5, x, ty + 4, P.wood[4]);
    c.line(x + 4, ty - 5, x + 4, ty + 4, P.wood[3]);
    c.line(x - 1, ty - 5, x + 5, ty - 5, P.wood[5]);
  }
  // miners with picks, lamp glow
  figure(c, 106, tunnel(106) + 4, { robe: P.dirt, hat: 'baslik', hatColor: P.cloth, item: 'kazma', f, facing: 1 });
  figure(c, 92, tunnel(92) + 4, { robe: P.wood, hat: 'baslik', hatColor: P.cloth, pose: 'tasi', itemColor: P.dirt, f: f + 1, facing: -1 });
  figure(c, 60, tunnel(60) + 4, { robe: P.red, hat: 'sarik', item: 'mesale', f, facing: 1 });
  glow(c, 60, tunnel(60) - 2, 9, P.fire[5], 0.4);
  glow(c, 110, tunnel(110) - 2, 6, P.fire[5], 0.3);
  // counter-mine approaching from inside (Johannes Grant)
  for (let x = 128; x <= IN.x1; x++) {
    const ty = 54 + Math.round((x - 128) * 0.1);
    for (let y = ty - 4; y <= ty + 4; y++) c.set(x, y, P.outline[1]);
  }
  puffCloud(c, 132, 50, 3, [P.smoke[2], P.smoke[3], P.smoke[4], P.smoke[5]]);
  figure(c, 140, 59, { robe: P.purple, hat: 'migfer', item: 'mesale', f, facing: -1 });
  // listening defenders' dust falling
  for (let i = 0; i < 4; i++) c.set(122 + i * 2, 42 + ((f + i) % 4) * 3, P.dirt[5]);
};

const kule: Scene = (c, f) => {
  goldSky(c, 74, [[14, 10, 20]]);
  wall(c, 108, IN.x1, 18, 74);
  tower(c, 132, 74, 16, 62, 'mazgal');
  hill(c, IN.x0, IN.x1, () => 74, IN.y1, OCHRE, 3, false);
  // moat, half filled with fascines and earth
  water(c, 92, 74, 107, 79, f, true);
  for (let x = 92; x <= 101; x++) for (let y = 74; y < 79; y++) c.set(x, y, (x * 3 + y) % 4 ? P.dryGrass[2] : P.wood[2]);
  // siege tower: tapered timber frame, plank courses, wet hides hung over it
  const base = 78;
  const topY = 14;
  const L = (y: number) => 48 + Math.round((base - y) * 0.12);
  const R = (y: number) => 90 - Math.round((base - y) * 0.12);
  for (let y = topY; y <= base; y++) {
    for (let x = L(y); x <= R(y); x++) {
      const plank = (y - topY) % 3 === 0;
      const lit = x < L(y) + 10;
      c.set(x, y, plank ? P.wood[2] : lit ? P.wood[5] : x > R(y) - 6 ? P.wood[3] : P.wood[4]);
    }
    c.set(L(y), y, P.wood[6]);
    c.set(R(y), y, P.wood[1]);
  }
  // hides: irregular stitched patches
  const hides: [number, number, number, number][] = [
    [52, 24, 12, 10],
    [70, 20, 13, 9],
    [54, 44, 14, 12],
    [74, 40, 11, 14],
    [58, 62, 12, 10],
    [76, 60, 10, 9],
  ];
  for (const [hx, hy, hw, hh] of hides) {
    for (let y = hy; y < hy + hh; y++)
      for (let x = hx; x < hx + hw; x++) {
        if ((x === hx || x === hx + hw - 1) && (y === hy || y === hy + hh - 1)) continue;
        const lit = x < hx + 4;
        c.set(x, y, lit ? P.dirt[5] : (x + y) % 7 === 0 ? P.dirt[3] : P.dirt[4]);
      }
    for (let x = hx + 1; x < hx + hw - 1; x += 2) c.set(x, hy, P.wood[1]);
    for (let x = hx + 1; x < hx + hw - 1; x += 2) c.set(x, hy + hh - 1, P.dirt[2]);
  }
  // floors & windows with archers
  for (const y of [30, 48, 66]) {
    for (let x = L(y); x <= R(y); x++) c.set(x, y, P.wood[1]);
    for (const wx of [62, 74]) {
      c.rect(wx, y - 5, 4, 3, P.outline[1]);
      c.set(wx + 1, y - 5, P.skin[3]);
      c.set(wx + 1, y - 6, P.cloth[5]);
    }
  }
  // top hoarding with a parapet and roof
  c.rect(50, topY - 4, 42, 4, P.wood[3]);
  for (let x = 50; x < 92; x += 4) c.rect(x, topY - 7, 2, 3, P.wood[4]);
  figure(c, 64, topY - 4, { robe: JAN, hat: 'bork', item: 'yay', f, facing: 1 });
  figure(c, 78, topY - 4, { robe: P.red, hat: 'sarik', item: 'kalkan', f, facing: 1 });
  // wheels
  for (const x of [54, 68, 82]) {
    c.disc(x, base + 1, 4, P.wood[2]);
    c.disc(x, base + 1, 2, P.wood[3]);
    c.set(x, base + 1, P.wood[6]);
  }
  // drawbridge toward the wall
  c.line(92, topY + 2, 108, 18, P.wood[5]);
  c.line(92, topY + 3, 108, 19, P.wood[3]);
  // defenders hurl fire pots; the foot of the tower catches
  figure(c, 116, 18, { robe: P.purple, hat: 'migfer', pose: 'kaldir', f, facing: -1 });
  figure(c, 124, 18, { robe: P.red, hat: 'migfer', item: 'mizrak', f, facing: -1 });
  const t = (f % 4) / 4;
  const px = Math.round(112 - t * 22);
  const py = Math.round(14 - Math.sin(t * Math.PI) * 6 + t * 30);
  c.disc(px, py, 1, P.fire[6]);
  c.set(px + 1, py - 1, P.fire[4]);
  flame(c, 60, base - 1, 7 + (f % 2), f);
  flame(c, 84, base - 1, 5, f + 1);
  glow(c, 70, base - 4, 14, P.fire[5], 0.35);
  puffCloud(c, 44 - (f % 2), 64 - (f % 4) * 2, 4);
  puffCloud(c, 38 - (f % 2) * 2, 52 - (f % 4) * 2, 3);
  // attackers sheltering behind
  figure(c, 22, 88, { robe: JAN, hat: 'bork', item: 'yay', f, facing: 1 });
  figure(c, 34, 87, { robe: P.red, hat: 'sarik', item: 'kalkan', f, facing: 1 });
  figure(c, 12, 87, { robe: P.green, hat: 'sarik', pose: 'cek', f, facing: 1 });
  arrows(c, 94, 26, 130, 60, 6, f, 2, -4, 2);
  c.free(() => banner(c, 70, 0, 8, P.green, f, 10, 5));
};

const dolu: Scene = (c, f) => {
  stormSky(c, 44, f);
  // city street: houses and a church dome
  dome(c, 112, 30, 10, 3);
  for (let x = 98; x <= 126; x++) for (let y = 31; y < 60; y++) c.set(x, y, x < 112 ? P.sand[3] : P.sand[2]);
  const house = (x: number, w: number, h: number, col: readonly string[]) => {
    for (let y = 60 - h; y < 60; y++) for (let k = 0; k < w; k++) c.set(x + k, y, k < 2 ? col[4] : col[3]);
    for (let k = -1; k <= w; k++) c.set(x + k, 60 - h - 1, P.roof[3]);
    for (let k = 0; k <= w - 1; k++) c.set(x + k, 60 - h - 2, P.roof[4]);
    c.rect(x + Math.floor(w / 2) - 1, 60 - h + 3, 2, 3, P.outline[2]);
  };
  house(IN.x0, 18, 22, P.limestone);
  house(26, 14, 18, P.sand);
  house(42, 20, 26, P.limestone);
  house(132, 22, 24, P.sand);
  // wet street
  vgrad(c, IN.x0, 60, IN.x1, IN.y1, [P.stone[3], P.stone[2]]);
  for (let i = 0; i < 14; i++) {
    const x = IN.x0 + Math.floor(hash2(i, 1, 8) * 140);
    const y = 64 + Math.floor(hash2(i, 2, 8) * 22);
    c.rect(x, y, 6, 1, P.water[5]);
    if ((i + f) % 3 === 0) c.set(x + 2, y, P.water[8]);
  }
  // the procession with the icon — the icon tilting
  const tilt = f % 2;
  c.rect(66, 46 + tilt, 12, 14, P.gold[4]);
  c.rect(68, 48 + tilt, 8, 10, P.red[3]);
  c.disc(72, 51 + tilt, 2, P.skin[4]);
  c.rect(70, 54 + tilt, 4, 4, P.blue[3]);
  c.line(64, 62, 80, 62, P.wood[4]);
  for (let i = 0; i < 4; i++) figure(c, 62 + i * 6, 76, { robe: i % 2 ? P.purple : P.cloth, hat: 'baslik', hatColor: P.steel, pose: 'kaldir', f: f + i, facing: 1, beard: true });
  for (let i = 0; i < 5; i++) figure(c, 20 + i * 7, 82, { robe: [P.red, P.blue, P.purple, P.cloth, P.green][i], hat: 'baslik', hatColor: P.steel, f: f + i, facing: 1 });
  figure(c, 100, 80, { robe: P.purple, hat: 'migfer', f, facing: -1 });
  figure(c, 108, 84, { robe: P.cloth, hat: 'baslik', hatColor: P.steel, pose: 'kaldir', f, facing: -1 });
  // hail & rain streaks
  for (let i = 0; i < 70; i++) {
    const x = IN.x0 + Math.floor(hash2(i, 4, 1) * 148);
    const y = IN.y0 + ((Math.floor(hash2(i, 5, 1) * 84) + f * 6) % 84);
    if (i % 3 === 0) {
      c.set(x, y, P.cloth[5]);
      c.set(x + 1, y, P.cloth[4]);
    } else c.line(x, y, x - 1, y + 3, P.smoke[5]);
  }
};

const ates: Scene = (c, f) => {
  nightSky(c, 40, f, 11);
  // the walls in darkness with a few lit windows
  wall(c, IN.x0, IN.x1, 18, 34, { dark: true });
  for (let x = 16; x < 152; x += 26) tower(c, x, 34, 9, 22, 'mazgal', true);
  for (let i = 0; i < 5; i++) c.set(20 + i * 29, 26, P.fire[5 + ((f + i) % 2)]);
  // hillsides with torches
  hill(c, IN.x0, IN.x1, (x) => 40 + Math.sin(x * 0.06) * 3, IN.y1, [P.night[0], P.green[0], P.green[1], P.green[1]], 2, false);
  for (let i = 0; i < 40; i++) {
    const x = IN.x0 + 2 + Math.floor(hash2(i, 1, 4) * 144);
    const y = 44 + Math.floor(hash2(i, 2, 4) * 40);
    const on = (i + f) % 3 !== 0;
    c.set(x, y, on ? P.fire[6] : P.fire[4]);
    if (on && i % 4 === 0) c.set(x, y - 1, P.fire[5]);
  }
  // tents silhouettes with fires in front
  for (let i = 0; i < 5; i++) tent(c, 10 + i * 30, 76, 14, 11, [P.night[0], P.night[1], P.night[2], P.night[3]], [P.night[0], P.night[1], P.night[2], P.night[2]], f);
  for (let i = 0; i < 4; i++) {
    const x = 30 + i * 30;
    glow(c, x, 80, 10, P.fire[5], 0.45);
    flame(c, x, 82, 5 + ((f + i) % 2), f + i);
    c.line(x - 3, 83, x + 3, 83, P.wood[2]);
  }
  // figures around the fires; mehter drum
  figure(c, 24, 88, { robe: JAN, hat: 'bork', f, facing: 1 });
  figure(c, 38, 88, { robe: P.red, hat: 'sarik', f, facing: -1 });
  figure(c, 84, 88, { robe: JAN, hat: 'bork', item: 'mesale', f, facing: 1 });
  figure(c, 98, 88, { robe: P.green, hat: 'sarik', pose: 'kaldir', f, facing: -1 });
  c.disc(130, 84, 4, P.red[3]);
  c.disc(130, 83, 3, P.cloth[4]);
  figure(c, 140, 88, { robe: P.red, hat: 'sarik', pose: 'kaldir', f, facing: -1 });
};

const ayasofya: Scene = (c, f) => {
  goldSky(c, 70, [
    [10, 12, 18],
    [124, 16, 16],
  ]);
  const cx = 80;
  // body of the church (plastered, warm ochre)
  for (let x = 38; x <= 122; x++) for (let y = 46; y <= 74; y++) c.set(x, y, x < cx - 14 ? P.sand[4] : x < cx + 18 ? P.sand[3] : P.sand[2]);
  for (let x = 38; x <= 122; x++) c.set(x, 46, P.sand[5]);
  // windows (arched rows)
  for (let x = 44; x < 118; x += 6) {
    c.rect(x, 54, 2, 4, P.outline[2]);
    c.set(x, 53, P.outline[1]);
    c.rect(x, 64, 2, 5, P.outline[2]);
  }
  // great buttress towers (no minarets in 1453)
  for (const bx of [42, 118]) {
    for (let y = 34; y <= 74; y++) for (let k = -4; k <= 4; k++) c.set(bx + k, y, k < -1 ? P.sand[5] : k < 2 ? P.sand[4] : P.sand[2]);
    for (let k = -4; k <= 4; k++) c.set(bx + k, 34, P.sand[5]);
    for (let k = -3; k <= 3; k++) c.set(bx + k, 33, P.steel[3]);
  }
  // semi-domes stepping down from the main dome
  dome(c, cx - 22, 46, 11, 1);
  dome(c, cx + 22, 46, 11, 1);
  // drum and main dome
  for (let k = -21; k <= 21; k++) for (let y = 40; y <= 46; y++) c.set(cx + k, y, k < -8 ? P.sand[5] : k < 8 ? P.sand[4] : P.sand[3]);
  dome(c, cx, 38, 21, 3);
  // forecourt & crowd
  hill(c, IN.x0, IN.x1, () => 74, IN.y1, [P.stone[2], P.stone[4], P.stone[3], P.stone[3]], 2, false);
  for (let x = IN.x0; x < IN.x1; x += 6) for (let y = 77; y < IN.y1; y += 4) c.set(x + ((y >> 2) % 2) * 3, y, P.stone[2]);
  for (let i = 0; i < 5; i++) figure(c, 14 + i * 8, 87, { robe: JAN, hat: 'bork', item: 'mizrak', f: f + i, facing: 1 });
  rider(c, 80, 88, { horse: P.cloth, robe: P.red, hat: 'buyuk-sarik', facing: 1, f, caparison: P.gold });
  figure(c, 92, 88, { robe: P.green, hat: 'sarik', f, facing: -1, item: 'sancak', itemColor: P.green });
  for (let i = 0; i < 4; i++) figure(c, 110 + i * 9, 87, { robe: i % 2 ? P.red : P.blue, hat: 'buyuk-sarik', f: f + i, facing: -1, beard: true });
  banner(c, 58, 54, 32, P.red, f, 12, 6);
  c.free(() => banner(c, 140, 0, 30, P.green, f + 2, 11, 6, -1));
};

const rizzo: Scene = (c, f) => {
  goldSky(c, 44, [
    [52, 10, 14],
    [100, 16, 10],
  ]);
  // shores
  water(c, IN.x0, 40, IN.x1, IN.y1, f);
  hill(c, IN.x0, 46, (x) => 30 + (x - 6) * 0.7, IN.y1, GRASS, 3);
  hill(c, 126, IN.x1, (x) => 46 - (x - 126) * 0.2, 54, SAGE, 5, false);
  tower(c, 140, 48, 7, 12, 'konik');
  // Rumeli Hisarı sea tower with the shore battery
  roundTower(c, 22, 60, 9, 30, 'konik');
  wall(c, 30, 50, 52, 64);
  // cannon firing from the shore
  c.rect(42, 66, 12, 3, P.bronze[3]);
  c.rect(42, 66, 12, 1, P.bronze[5]);
  flame(c, 57, 68, 3 + (f % 2), f);
  puffCloud(c, 62, 62, 4);
  // the Venetian ship, hit: splash, broken spar, smoke
  carrack(c, 104, 76, -1, f, 'venedik');
  puffCloud(c, 108, 46, 5 + (f % 2), [P.smoke[2], P.smoke[3], P.smoke[4], P.smoke[5]]);
  flame(c, 98, 66, 5, f);
  for (let i = 0; i < 6; i++) c.set(84 + i * 2, 76 - ((i + f) % 3) * 2, P.water[8]);
  c.disc(82, 74, 1 + (f % 2), P.water[8]);
  // gunners on the shore
  figure(c, 40, 76, { robe: P.red, hat: 'sarik', item: 'mesale', f, facing: 1 });
  figure(c, 30, 80, { robe: JAN, hat: 'bork', f, facing: 1 });
  c.free(() => banner(c, 22, 0, 16, P.red, f, 10, 6));
};

const SCENES: Record<string, Scene> = {
  [IMG.hisar]: hisar,
  [IMG.ordu]: ordu,
  [IMG.deniz]: deniz,
  [IMG.gemiler]: gemiler,
  [IMG.tutulma]: tutulma,
  [IMG.sancak]: sancak,
  [IMG.dokum]: dokum,
  [IMG.top]: top,
  [IMG.divan]: divan,
  [IMG.mektup]: mektup,
  [IMG.lagim]: lagim,
  [IMG.kule]: kule,
  [IMG.dolu]: dolu,
  [IMG.ates]: ates,
  [IMG.ayasofya]: ayasofya,
  [IMG.rizzo]: rizzo,
};

export const ILLUSTRATION_KEYS = Object.keys(SCENES);

/** Paint one frame of an illustration into a fresh 160×96 canvas. */
export function paintIllustration(key: string, f = 0): PixelCanvas | null {
  const scene = SCENES[key];
  if (!scene) return null;
  const c = new Mini(f);
  try {
    scene(c, f);
  } catch (err) {
    console.error(`[events] illustration ${key} failed`, err);
  }
  frame(c);
  c.clip = null;
  for (const fn of c.overlays) fn();
  return c;
}

/** Register static (`olay/x`) and animated (`olay/x:anim`) textures. */
export function generateIllustrations(gen: TextureGen): void {
  for (const key of ILLUSTRATION_KEYS) {
    gen.canvas(key, W, H, (p) => {
      const c = paintIllustration(key, 0);
      if (c) p.blit(c, 0, 0);
    });
    gen.sheet(`${key}:anim`, W, H, FRAMES, (p, fr) => {
      const c = paintIllustration(key, fr);
      if (c) p.blit(c, 0, 0);
    });
    gen.anim(`${key}:anim`, `${key}:anim`, [0, 1, 2, 3], FPS, -1);
  }
}

// ───────────────────────────── DOM access (UI) ─────────────────────────────

export interface IllustrationSheet {
  canvas: HTMLCanvasElement;
  frames: number;
  fw: number;
  fh: number;
  fps: number;
}

const canvasCache = new Map<string, HTMLCanvasElement>();
const sheetCache = new Map<string, IllustrationSheet>();

export function illustrationCanvas(key: string): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  let cv = canvasCache.get(key);
  if (!cv) {
    const p = paintIllustration(key, 0);
    if (!p) return null;
    cv = p.toCanvas();
    canvasCache.set(key, cv);
  }
  return cv;
}

export function illustrationSheet(key: string): IllustrationSheet | null {
  if (typeof document === 'undefined') return null;
  let sh = sheetCache.get(key);
  if (!sh) {
    if (!SCENES[key]) return null;
    const strip = new PixelCanvas(W * FRAMES, H);
    for (let i = 0; i < FRAMES; i++) {
      const p = paintIllustration(key, i);
      if (p) strip.blit(p, i * W, 0);
    }
    sh = { canvas: strip.toCanvas(), frames: FRAMES, fw: W, fh: H, fps: FPS };
    sheetCache.set(key, sh);
  }
  return sh;
}

// ───────────────────────────── World markers ─────────────────────────────

/**
 * Map marker shown where an event happens: a gilded şemse medallion with a
 * sweeping gleam (4 frames), and an expanding gold ring on the ground (6 frames).
 */
export function generateMarkers(gen: TextureGen): void {
  gen.sheet('olay/isaret', 15, 21, 4, (p, fr) => {
    const cx = 7;
    const cy = 7;
    // pointer stem
    for (let y = 13; y < 20; y++) p.set(cx, y, y < 16 ? P.gold[4] : P.gold[3]);
    p.set(cx, 20, P.gold[2]);
    // medallion: gold rim, red field, white star-flower
    p.disc(cx, cy, 6, P.gold[3]);
    p.disc(cx, cy, 5, P.gold[5]);
    p.disc(cx - 1, cy - 1, 3, P.gold[6]);
    p.disc(cx, cy, 3, P.red[4]);
    p.disc(cx - 1, cy - 1, 1, P.red[5]);
    p.set(cx, cy, P.cloth[5]);
    for (const [dx, dy] of [
      [0, -2],
      [0, 2],
      [-2, 0],
      [2, 0],
    ])
      p.set(cx + dx, cy + dy, P.gold[6]);
    // tips (rumi)
    p.set(cx, cy - 7, P.gold[5]);
    p.set(cx - 7, cy, P.gold[4]);
    p.set(cx + 7, cy, P.gold[4]);
    // sweeping gleam
    const gx = -4 + fr * 4;
    for (let k = -6; k <= 6; k++) {
      const x = cx + gx + Math.floor(k / 2);
      const y = cy + k;
      if (p.alphaAt(x, y) && Math.abs(k) < 6) p.set(x, y, P.cloth[5], 0.7);
    }
    p.outline(P.outline[1]);
  });
  gen.anim('olay/isaret:anim', 'olay/isaret', [0, 1, 2, 3, 3, 3], 8, -1);
  gen.sheet('olay/halka', 40, 20, 6, (p, fr) => {
    const rx = 4 + fr * 3;
    const ry = Math.max(2, Math.round(rx / 2));
    const a = 1 - fr / 6;
    for (let t = 0; t < 360; t += 2) {
      const r = (t * Math.PI) / 180;
      const x = Math.round(20 + Math.cos(r) * rx);
      const y = Math.round(10 + Math.sin(r) * ry);
      p.set(x, y, fr < 2 ? P.gold[6] : P.gold[5], a);
    }
  });
  gen.anim('olay/halka:anim', 'olay/halka', [0, 1, 2, 3, 4, 5], 10, -1);
}
