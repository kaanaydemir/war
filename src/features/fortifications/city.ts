import { hash2 } from '../../core/rng';
import type { RegionId, Terrain } from '../../core/world';
import { geoToTile } from '../../data/geography';
import { landmarkTile, type LandmarkId } from '../../data/landmarks';
import { LINES, nearestOnLine } from './geom';

/**
 * Deterministic procedural layout of 1453 Constantinople (pure, no Phaser).
 * The city had shrunk to a string of walled villages, orchards, vineyards and
 * fields between the monumental ruins; dense quarters survived along the Golden
 * Horn (Venetian/Genoese/Amalfitan quarters, Petrion, Blachernae), around
 * Ayasofya and at Psamathia/Studios. Galata was a dense Genoese town.
 */

export interface CityWorld {
  width: number;
  height: number;
  regionAt(tx: number, ty: number): RegionId;
  terrainAt(tx: number, ty: number): Terrain;
  heightAt(tx: number, ty: number): number;
  isWater(tx: number, ty: number): boolean;
}

export type CityKind =
  | 'ev' // Byzantine house
  | 'ev-galata' // Italian town house (Galata)
  | 'kilise' // small domed church
  | 'manastir' // monastery (cloister + church)
  | 'agac' // fruit tree
  | 'servi' // cypress
  | 'zeytin' // olive
  | 'bag' // vineyard row
  | 'harabe' // ruin
  | 'kuyu' // well
  | 'sarnic' // open cistern
  | 'landmark';

export interface CityItem {
  kind: CityKind;
  tx: number;
  ty: number;
  /** variant index */
  v: number;
  flip: boolean;
  /** landmark id for kind 'landmark' */
  lm?: string;
  /** cluster id (for walkers) or -1 */
  cluster: number;
}

export interface Cluster {
  id: number;
  tx: number;
  ty: number;
  r: number;
  name: string;
}

export interface CityLayout {
  items: CityItem[];
  clusters: Cluster[];
}

/** Landmarks drawn by fortifications (texture key suffix → landmark / position and keep-out radius). */
export interface LandmarkPlace {
  id: string;
  tx: number;
  ty: number;
  r: number;
}

const LL = (lat: number, lon: number) => geoToTile(lat, lon);

export const VALENS_PTS = [LL(41.0163, 28.9492), LL(41.0155, 28.9555), LL(41.0142, 28.9615)];

export const CISTERNS: { id: string; name: string; lat: number; lon: number; w: number; h: number }[] = [
  { id: 'aetius', name: 'Aetios Sarnıcı', lat: 41.0262, lon: 28.9438, w: 3.2, h: 2.6 },
  { id: 'aspar', name: 'Aspar Sarnıcı', lat: 41.0262, lon: 28.9502, w: 2.6, h: 2.6 },
  { id: 'mocius', name: 'Mokios Sarnıcı', lat: 41.0112, lon: 28.9372, w: 2.8, h: 2.8 },
];

export function cityLandmarks(): LandmarkPlace[] {
  const t = (id: LandmarkId) => landmarkTile(id);
  const a = t('ayasofya');
  return [
    { id: 'ayasofya', ...a, r: 4.2 },
    { id: 'hipodrom', ...t('hipodrom'), r: 4.2 },
    { id: 'buyukSaray', ...t('buyukSaray'), r: 2.6 },
    { id: 'akropolis', ...t('akropolis'), r: 1.6 },
    { id: 'havariyun', ...t('havariyun'), r: 2.0 },
    { id: 'pantokrator', ...t('pantokrator'), r: 2.0 },
    { id: 'kariye', ...t('kariye'), r: 1.5 },
    { id: 'blahernaiSarayi', ...t('blahernaiSarayi'), r: 2.2 },
    { id: 'tekfurSarayi', ...t('tekfurSarayi'), r: 1.2 },
    { id: 'galataKulesi', ...t('galataKulesi'), r: 1.1 },
    { id: 'eugeniusKulesi', ...t('eugeniusKulesi'), r: 0.9 },
    { id: 'anadoluHisari', ...t('anadoluHisari'), r: 2.2 },
  ];
}

/** Known inhabited quarters [lat, lon, radius tiles, density 0..1, name]. */
const QUARTERS: [number, number, number, number, string][] = [
  [41.0182, 28.9715, 4.2, 0.95, 'Perama (Venedik mahallesi)'],
  [41.0105, 28.9745, 3.6, 0.85, 'Augusteion'],
  [41.0135, 28.9795, 2.6, 0.7, 'Mangana'],
  [41.0302, 28.9485, 3.6, 0.9, 'Petrion (Fener)'],
  [41.0365, 28.9468, 3.0, 0.85, 'Blahernai'],
  [41.0242, 28.9585, 3.2, 0.8, 'Unkapanı'],
  [40.9985, 28.9335, 3.4, 0.8, 'Psamathia (Samatya)'],
  [41.0062, 28.9635, 3.0, 0.75, 'Kontoskalion'],
  [41.0195, 28.9515, 2.6, 0.6, 'Havariyun'],
  [41.0218, 28.9585, 2.2, 0.55, 'Zeyrek'],
  [41.0282, 28.9395, 2.2, 0.55, 'Edirnekapı içi'],
  [41.0205, 28.9265, 2.0, 0.5, 'Aya Romanos'],
  [41.0125, 28.951, 2.4, 0.5, 'Lykos köyü'],
  [41.003, 28.9525, 2.2, 0.55, 'Vlanga'],
  [41.0062, 28.9385, 2.0, 0.45, 'Cerrahpaşa'],
  [41.0028, 28.9268, 2.0, 0.45, 'Studios'],
  [41.0112, 28.9235, 1.8, 0.4, 'Pege'],
  [41.0155, 28.9375, 1.8, 0.4, 'Mesi köyü'],
  [41.0235, 28.9455, 1.8, 0.45, 'Pammakaristos'],
  [41.0065, 28.9705, 2.2, 0.55, 'Hebdomon yolu'],
  [41.0145, 28.9635, 2.0, 0.5, 'Forum Tauri'],
];

export function layoutCity(w: CityWorld): CityLayout {
  const items: CityItem[] = [];
  const clusters: Cluster[] = [];
  const lms = cityLandmarks();
  const occ = new Map<number, number>(); // occupancy at 0.5-tile resolution
  const key = (x: number, y: number) => Math.round(y * 2) * 4096 + Math.round(x * 2);
  const W = w.width;
  const H = w.height;

  const inCity = (tx: number, ty: number) => {
    const x = Math.round(tx);
    const y = Math.round(ty);
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    if (w.isWater(x, y)) return false;
    const r = w.regionAt(x, y);
    return r === 'sur-ici';
  };
  const inGalata = (tx: number, ty: number) => {
    const x = Math.round(tx);
    const y = Math.round(ty);
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    if (w.isWater(x, y)) return false;
    return w.regionAt(x, y) === 'galata';
  };
  const wallClear = (tx: number, ty: number, k: number, s: number, g: number) => {
    const qk = nearestOnLine(LINES.kara, tx, ty);
    if (qk.dist < k) return false;
    const qs = nearestOnLine(LINES.deniz, tx, ty);
    if (qs.dist < s) return false;
    const qg = nearestOnLine(LINES.galata, tx, ty);
    if (qg.dist < g) return false;
    return w.terrainAt(Math.round(tx), Math.round(ty)) !== 'sur';
  };
  const lmClear = (tx: number, ty: number, pad = 0) => {
    for (const l of lms) if (Math.hypot(tx - l.tx, ty - l.ty) < l.r + pad) return false;
    // Valens aqueduct line
    for (let i = 0; i + 1 < VALENS_PTS.length; i++) {
      if (segDist(tx, ty, VALENS_PTS[i].tx, VALENS_PTS[i].ty, VALENS_PTS[i + 1].tx, VALENS_PTS[i + 1].ty) < 0.9 + pad) return false;
    }
    for (const c of CISTERNS) {
      const p = LL(c.lat, c.lon);
      if (Math.abs(tx - p.tx) < c.w / 2 + 0.6 + pad && Math.abs(ty - p.ty) < c.h / 2 + 0.6 + pad) return false;
    }
    return true;
  };
  const free = (tx: number, ty: number, rad: number) => {
    const r = Math.ceil(rad * 2);
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.hypot(dx, dy) > rad * 2 + 0.01) continue;
        if (occ.has(key(tx + dx / 2, ty + dy / 2))) return false;
      }
    return true;
  };
  const mark = (tx: number, ty: number, rad: number) => {
    const r = Math.ceil(rad * 2);
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) if (Math.hypot(dx, dy) <= rad * 2 + 0.01) occ.set(key(tx + dx / 2, ty + dy / 2), 1);
  };
  const put = (kind: CityKind, tx: number, ty: number, v: number, rad: number, cluster = -1, lm?: string) => {
    items.push({ kind, tx, ty, v, flip: hash2(Math.round(tx * 7), Math.round(ty * 7), 91) < 0.5, cluster, lm });
    if (rad > 0) mark(tx, ty, rad);
  };

  // landmarks first (they are drawn by name)
  for (const l of lms) {
    put('landmark', l.tx, l.ty, 0, 0, -1, l.id);
  }
  for (const c of CISTERNS) {
    const p = LL(c.lat, c.lon);
    put('sarnic', p.tx, p.ty, CISTERNS.indexOf(c), 0);
  }

  // ── quarters (dense house clusters with a church) ──
  const quarters: [number, number, number, number, string][] = QUARTERS.map((q) => {
    const p = LL(q[0], q[1]);
    return [p.tx, p.ty, q[2], q[3], q[4]];
  });
  // extra hamlets in the open interior (deterministic)
  for (let k = 0; k < 400 && quarters.length < 46; k++) {
    const tx = 50 + hash2(k, 1, 404) * 85;
    const ty = 104 + hash2(k, 2, 404) * 78;
    if (!inCity(tx, ty) || !wallClear(tx, ty, 4, 3, 2) || !lmClear(tx, ty, 1.5)) continue;
    if (quarters.some((q) => Math.hypot(q[0] - tx, q[1] - ty) < q[2] + 3.5)) continue;
    quarters.push([tx, ty, 1.3 + hash2(k, 3, 404) * 1.1, 0.45 + hash2(k, 4, 404) * 0.25, 'köy']);
  }

  quarters.forEach(([cx, cy, r, dens, name], qi) => {
    clusters.push({ id: qi, tx: cx, ty: cy, r, name });
    // church at the heart of the quarter
    let placedChurch = false;
    for (let k = 0; k < 8 && !placedChurch; k++) {
      const tx = cx + (hash2(qi, k, 501) - 0.5) * r * 0.6;
      const ty = cy + (hash2(qi, k, 502) - 0.5) * r * 0.6;
      if (inCity(tx, ty) && wallClear(tx, ty, 2.0, 1.5, 1.2) && lmClear(tx, ty, 0.6) && free(tx, ty, 0.9)) {
        put('kilise', tx, ty, Math.floor(hash2(qi, 9, 503) * 4), 0.95, qi);
        // a couple of cypresses by the church
        for (let c = 0; c < 2; c++) {
          const sx = tx + 0.9 + c * 0.45;
          const sy = ty - 0.6 + c * 0.35;
          if (inCity(sx, sy) && free(sx, sy, 0.2)) put('servi', sx, sy, c % 2, 0.22, qi);
        }
        placedChurch = true;
      }
    }
    // houses on a jittered grid with lanes left open
    const step = 0.72;
    for (let gy = -r; gy <= r; gy += step) {
      for (let gx = -r; gx <= r; gx += step) {
        const hx = hash2(Math.round((cx + gx) * 10), Math.round((cy + gy) * 10), 611);
        const hy = hash2(Math.round((cx + gx) * 10), Math.round((cy + gy) * 10), 612);
        const tx = cx + gx + (hx - 0.5) * 0.35;
        const ty = cy + gy + (hy - 0.5) * 0.35;
        const d = Math.hypot(gx, gy) / r;
        if (d > 1) continue;
        // winding lanes: skip a band through the quarter
        const lane = Math.abs(Math.sin((gx + cx * 0.3) * 1.3) * 1.2 - gy * 0.8) < 0.38;
        if (lane) continue;
        const p = Math.min(0.95, dens * 1.55 * (1 - d * d * 0.7));
        if (hash2(Math.round(tx * 13), Math.round(ty * 13), 613) > p) continue;
        if (!inCity(tx, ty) || !wallClear(tx, ty, 1.7, 1.15, 1.0) || !lmClear(tx, ty, 0.2)) continue;
        if (!free(tx, ty, 0.33)) continue;
        put('ev', tx, ty, Math.floor(hash2(Math.round(tx * 5), Math.round(ty * 5), 614) * 12), 0.33, qi);
      }
    }
    // gardens around the quarter: fruit trees & a well
    const nTrees = Math.round(r * 5 * (1.2 - dens * 0.5));
    for (let k = 0; k < nTrees; k++) {
      const a = hash2(qi, k, 621) * Math.PI * 2;
      const rr = r * (0.85 + hash2(qi, k, 622) * 0.7);
      const tx = cx + Math.cos(a) * rr;
      const ty = cy + Math.sin(a) * rr;
      if (!inCity(tx, ty) || !wallClear(tx, ty, 1.6, 1.1, 1.0) || !lmClear(tx, ty, 0) || !free(tx, ty, 0.25)) continue;
      const kind: CityKind = hash2(qi, k, 623) < 0.18 ? 'servi' : hash2(qi, k, 624) < 0.3 ? 'zeytin' : 'agac';
      put(kind, tx, ty, Math.floor(hash2(qi, k, 625) * 3), 0.25, qi);
    }
    const wx = cx + r * 0.2;
    const wy = cy + r * 0.45;
    if (inCity(wx, wy) && free(wx, wy, 0.2) && lmClear(wx, wy)) put('kuyu', wx, wy, 0, 0.2, qi);
  });

  // ── monasteries (walled cloisters with a church) at real-ish places ──
  const MONASTERIES: [number, number][] = [
    [41.0035, 28.9282], // Studios
    [41.0275, 28.9465], // Pammakaristos
    [41.0255, 28.9335], // Chora region (south)
    [41.0128, 28.9435], // Myrelaion area
    [41.0165, 28.9305], // St. Romanos area
    [41.0105, 28.9665], // Bodrum
    [41.0222, 28.9395], // Lips
    [41.0328, 28.9435], // near Blachernae
  ];
  MONASTERIES.forEach(([la, lo], i) => {
    const p = LL(la, lo);
    for (let k = 0; k < 10; k++) {
      const tx = p.tx + (hash2(i, k, 701) - 0.5) * 2.5;
      const ty = p.ty + (hash2(i, k, 702) - 0.5) * 2.5;
      if (inCity(tx, ty) && wallClear(tx, ty, 2.4, 2, 1.5) && lmClear(tx, ty, 1.0) && free(tx, ty, 1.35)) {
        put('manastir', tx, ty, i % 2, 1.35, -1);
        for (let c = 0; c < 3; c++) {
          const sx = tx - 1.4 + c * 0.5;
          const sy = ty + 1.3 - c * 0.2;
          if (inCity(sx, sy) && free(sx, sy, 0.2)) put('servi', sx, sy, c % 2, 0.2);
        }
        break;
      }
    }
  });

  // ── open country inside the walls: orchards, vineyards, scattered trees, ruins ──
  for (let ty = 60; ty < H - 10; ty += 1) {
    for (let tx = 60; tx < W - 40; tx += 1) {
      if (!inCity(tx, ty)) continue;
      const patch = hash2(Math.floor(tx / 5), Math.floor(ty / 4), 801);
      const fx = tx + (hash2(tx, ty, 802) - 0.5) * 0.6;
      const fy = ty + (hash2(tx, ty, 803) - 0.5) * 0.6;
      if (!wallClear(fx, fy, 1.6, 1.1, 1.0) || !lmClear(fx, fy, 0)) continue;
      if (patch < 0.16) {
        // orchard rows
        if ((tx + ty) % 2 === 0 && free(tx + 0.25, ty, 0.3)) put('agac', tx + 0.25, ty, Math.floor(hash2(tx, ty, 804) * 3), 0.3);
      } else if (patch < 0.26) {
        // vineyards / kitchen gardens: the terrain paints the rows; an odd fruit tree at the edge
        if (hash2(tx, ty, 805) < 0.12 && free(tx, ty, 0.3)) put('agac', tx, ty, 1, 0.3);
      } else if (patch < 0.31) {
        if (hash2(tx, ty, 806) < 0.5 && free(fx, fy, 0.3)) put('zeytin', fx, fy, Math.floor(hash2(tx, ty, 807) * 3), 0.3);
      } else if (patch > 0.965) {
        if (hash2(tx, ty, 808) < 0.35 && free(fx, fy, 0.5)) put('harabe', fx, fy, Math.floor(hash2(tx, ty, 809) * 4), 0.5);
      } else if (hash2(tx, ty, 810) < 0.07 && free(fx, fy, 0.3)) {
        put(hash2(tx, ty, 811) < 0.3 ? 'servi' : 'agac', fx, fy, Math.floor(hash2(tx, ty, 812) * 3), 0.3);
      }
    }
  }

  // ── Galata: a dense Genoese town ──
  const galClusterId = clusters.length;
  const gk = landmarkTile('galataKulesi');
  clusters.push({ id: galClusterId, tx: gk.tx + 2, ty: gk.ty + 1, r: 5, name: 'Galata' });
  for (let ty = gk.ty - 6; ty <= gk.ty + 8; ty += 0.62) {
    for (let tx = gk.tx - 12; tx <= gk.tx + 12; tx += 0.62) {
      const jx = tx + (hash2(Math.round(tx * 9), Math.round(ty * 9), 901) - 0.5) * 0.18;
      const jy = ty + (hash2(Math.round(tx * 9), Math.round(ty * 9), 902) - 0.5) * 0.18;
      const inside = inGalata(jx, jy);
      // the Genoese town spilled over its walls up the slope toward Pera
      const sub = !inside && !w.isWater(Math.round(jx), Math.round(jy)) && w.regionAt(Math.round(jx), Math.round(jy)) === 'pera' && nearestOnLine(LINES.galata, jx, jy).dist < 2.6;
      if (!inside && !sub) continue;
      if (sub && hash2(Math.round(jx * 7), Math.round(jy * 7), 905) < 0.55) continue;
      if (!wallClear(jx, jy, 0, 0, 0.42)) continue;
      if (!lmClear(jx, jy, 0.1)) continue;
      // a couple of streets running down to the quays
      if (Math.abs(((jx - gk.tx) % 4.2) + 4.2) % 4.2 < 0.35) continue;
      if (hash2(Math.round(jx * 11), Math.round(jy * 11), 903) < 0.08) continue;
      if (!free(jx, jy, 0.27)) continue;
      put('ev-galata', jx, jy, Math.floor(hash2(Math.round(jx * 5), Math.round(jy * 5), 904) * 8), 0.27, galClusterId);
    }
  }

  return { items, clusters };
}

function segDist(x: number, y: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}
