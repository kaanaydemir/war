import { describe, expect, it } from 'vitest';
import { tileToWorld } from '../src/core/iso';
import { d } from '../src/core/calendar';
import { landmarkTile, LANDMARKS, type LandmarkId } from '../src/data/landmarks';
import { geoPolyToTiles, LAND_WALLS } from '../src/data/geography';
import { createWorld, moatDepth, terrace } from '../src/features/world/terrain';
import { placeDecor, DECOR_SPEC } from '../src/features/world/decor';
import { seasonOf } from '../src/features/world/season';
import { minimapPixels } from '../src/features/world/minimap';
import { buildWaterData } from '../src/features/world/water';
import { ChunkBaker, CHUNK_H, CHUNK_W } from '../src/features/world/bake';

const world = createWorld();
const lt = (id: LandmarkId) => landmarkTile(id);
const near = (id: LandmarkId, r: number, pred: (x: number, y: number) => boolean) => {
  const t = lt(id);
  for (let y = Math.round(t.ty) - r; y <= Math.round(t.ty) + r; y++)
    for (let x = Math.round(t.tx) - r; x <= Math.round(t.tx) + r; x++) if (pred(x, y)) return true;
  return false;
};

describe('world geography', () => {
  it('puts landmarks on land in the right regions', () => {
    const land: [LandmarkId, string][] = [
      ['ayasofya', 'sur-ici'],
      ['hipodrom', 'sur-ici'],
      ['pantokrator', 'sur-ici'],
      ['kariye', 'sur-ici'],
      ['otag', 'trakya'],
      ['karacaKarargah', 'trakya'],
      ['ishakKarargah', 'trakya'],
      ['zaganosKarargah', 'pera'],
      ['rumeliHisari', 'bogaz-avrupa'],
      ['anadoluHisari', 'anadolu'],
      ['uskudar', 'anadolu'],
      ['besiktas', 'pera'],
    ];
    for (const [id, region] of land) {
      const t = lt(id);
      expect(world.isWater(t.tx, t.ty), id).toBe(false);
      expect(world.regionAt(t.tx, t.ty), id).toBe(region);
    }
    const g = lt('galataKulesi');
    expect(world.isWater(g.tx, g.ty)).toBe(false);
    expect(world.regionAt(g.tx, g.ty)).toBe('galata');
  });

  it('has Golden Horn water near Kasımpaşa and Bosphorus water between the two Hisars', () => {
    expect(near('kasimpasa', 3, (x, y) => world.isWater(x, y) && world.regionAt(x, y) === 'halic')).toBe(true);
    const r = lt('rumeliHisari');
    const a = lt('anadoluHisari');
    for (let k = 0.3; k <= 0.7; k += 0.1) {
      const x = r.tx + (a.tx - r.tx) * k;
      const y = r.ty + (a.ty - r.ty) * k;
      expect(world.isWater(x, y)).toBe(true);
      expect(world.regionAt(x, y)).toBe('bogaz');
    }
    expect(world.terrainAt((r.tx + a.tx) / 2, (r.ty + a.ty) / 2)).toMatch(/su/);
    // Marmara south of the city
    const tl = lt('theodosiusLimani');
    expect(world.regionAt(tl.tx, tl.ty + 8)).toBe('marmara');
  });

  it('classifies water depth by distance to land', () => {
    let deep = 0;
    let shallow = 0;
    for (let y = 0; y < world.height; y++)
      for (let x = 0; x < world.width; x++) {
        const t = world.terrainAt(x, y);
        if (t === 'derin-su') deep++;
        if (t === 'sig-su') shallow++;
        if (t === 'sig-su') expect(world.depth[y * world.W + x]).toBeLessThanOrEqual(2);
        if (t === 'derin-su') expect(world.depth[y * world.W + x]).toBeGreaterThan(7);
      }
    expect(deep).toBeGreaterThan(500);
    expect(shallow).toBeGreaterThan(300);
  });

  it('marks the land walls as an impassable, contiguous barrier', () => {
    const wall = geoPolyToTiles(LAND_WALLS);
    for (const p of wall.slice(1, -1)) {
      const x = Math.round(p.tx);
      const y = Math.round(p.ty);
      expect(world.terrainAt(x, y)).toBe('sur');
      expect(world.moveCost(x, y, 'land')).toBe(Infinity);
    }
    // no land path from the camp into the city
    const inside = world.nearestPassable(lt('ayasofya'), 'land')!;
    expect(world.findPath(lt('otag'), inside, 'land')).toBeNull();
  });

  it('has a moat outside Topkapı and none inside the city', () => {
    expect(near('topkapi', 3, (x, y) => world.terrainAt(x, y) === 'hendek' && x < lt('topkapi').tx)).toBe(true);
    const t = lt('topkapi');
    for (let k = 1; k <= 3; k++) expect(world.terrainAt(t.tx + 3 + k, t.ty)).not.toBe('hendek');
    // Blachernae (single wall) has no moat
    expect(near('blahernaiSarayi', 2, (x, y) => world.terrainAt(x, y) === 'hendek')).toBe(false);
    expect(moatDepth(1.5)).toBe(1);
    expect(moatDepth(0.2)).toBe(0);
  });

  it('finds a land path from the otağ to Rumeli Hisarı around the Golden Horn', () => {
    const goal = world.nearestPassable(lt('rumeliHisari'), 'land')!;
    const t0 = performance.now();
    const p = world.findPath(lt('otag'), goal, 'land');
    const ms = performance.now() - t0;
    expect(p).not.toBeNull();
    expect(p!.length).toBeGreaterThan(100);
    for (const s of p!) expect(world.isWater(s.tx, s.ty)).toBe(false);
    expect(ms).toBeLessThan(250);
  });

  it('finds sea paths from the Bosphorus into the Golden Horn and to the Marmara', () => {
    const from = world.nearestPassable(lt('diplokionion'), 'sea')!;
    const horn = world.nearestPassable(lt('kasimpasa'), 'sea')!;
    const marm = world.nearestPassable({ tx: lt('theodosiusLimani').tx, ty: lt('theodosiusLimani').ty + 8 }, 'sea')!;
    expect(world.findPath(from, horn, 'sea')).not.toBeNull();
    expect(world.findPath(from, marm, 'sea')).not.toBeNull();
    expect(world.findPath(from, lt('otag'), 'sea')).toBeNull();
  });

  it('respects setBlocked and breaches', () => {
    const t = lt('otag');
    const x = Math.round(t.tx) + 3;
    const y = Math.round(t.ty);
    const before = world.moveCost(x, y, 'land');
    expect(isFinite(before)).toBe(true);
    world.setBlocked(x, y, true);
    expect(world.moveCost(x, y, 'land')).toBe(Infinity);
    world.setBlocked(x, y, false);
    expect(world.moveCost(x, y, 'land')).toBe(before);
    // opening a wall tile (breach)
    const w = geoPolyToTiles(LAND_WALLS)[5];
    world.setBlocked(w.tx, w.ty, false);
    expect(isFinite(world.moveCost(w.tx, w.ty, 'land'))).toBe(true);
    world.setBlocked(w.tx, w.ty, true);
    expect(world.moveCost(w.tx, w.ty, 'land')).toBe(Infinity);
  });

  it('uses the specified movement costs', () => {
    const counts: Record<string, number> = {};
    for (let y = 0; y < world.height; y++)
      for (let x = 0; x < world.width; x++) {
        const t = world.terrainAt(x, y);
        counts[t] = (counts[t] ?? 0) + 1;
        const c = world.moveCost(x, y, 'land');
        if (t === 'yol') expect(c).toBeGreaterThanOrEqual(0.6);
        if (t === 'yol') expect(c).toBeLessThan(1.4);
        if (t === 'orman') expect(c).toBeGreaterThanOrEqual(1.7);
        if (t.endsWith('su')) expect(c).toBe(Infinity);
        const s = world.moveCost(x, y, 'sea');
        if (t === 'sig-su') expect(s).toBe(1.4);
        if (t === 'su' || t === 'derin-su') expect(s).toBe(1);
      }
    for (const t of ['kum', 'cimen', 'tarla', 'orman', 'kaya', 'yol', 'sehir', 'hendek', 'sur', 'su', 'sig-su', 'derin-su']) expect(counts[t], t).toBeGreaterThan(0);
  });

  it('has the Pera ridge clearly higher than the Thracian plain', () => {
    const z = lt('zaganosKarargah');
    const peraTop = Math.max(...[-4, 0, 4].flatMap((dx) => [-4, 0, 4].map((dy) => world.heightAt(z.tx + 6 + dx, z.ty - 8 + dy))));
    const plain = world.heightAt(lt('otag').tx - 10, lt('otag').ty);
    expect(peraTop).toBeGreaterThan(plain + 0.8);
    for (let y = 0; y < world.height; y += 7)
      for (let x = 0; x < world.width; x += 7) {
        const h = world.heightAt(x, y);
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThanOrEqual(4);
      }
  });

  it('round-trips toWorld/toTile with height', () => {
    for (const id of Object.keys(LANDMARKS) as LandmarkId[]) {
      const t = lt(id);
      const p = world.toWorld(t.tx, t.ty);
      const flat = tileToWorld(t.tx, t.ty);
      expect(p.x).toBeCloseTo(flat.x);
      expect(p.y).toBeLessThanOrEqual(flat.y + 1e-6);
      const back = world.toTile(p.x, p.y);
      expect(Math.hypot(back.tx - t.tx, back.ty - t.ty)).toBeLessThan(0.6);
    }
  });

  it('terraces only steep ground', () => {
    expect(terrace(1.2, 1.25, 1.21, 1.24, 0.5, 0.5)).toBeCloseTo(1.225, 3);
    const steep = terrace(1.0, 2.0, 1.0, 2.0, 0.5, 0.5);
    expect(steep).toBeGreaterThanOrEqual(1);
    expect(steep).toBeLessThanOrEqual(2);
  });
});

describe('world decor & art data', () => {
  const decor = placeDecor(world);
  it('places plenty of decor, never in water, walls or the city', () => {
    expect(decor.length).toBeGreaterThan(2000);
    const kinds = new Set(decor.map((d) => d.kind));
    for (const k of ['agac', 'servi', 'cinar', 'asma', 'meyve', 'cali', 'kaya', 'saz', 'ev', 'sapel']) expect(kinds.has(k as never), k).toBe(true);
    for (const it of decor) {
      expect(world.isWater(it.tx, it.ty)).toBe(false);
      expect(world.city[Math.round(it.ty) * world.W + Math.round(it.tx)]).toBe(0);
      expect(['sur', 'hendek', 'yol']).not.toContain(world.terrainAt(it.tx, it.ty));
      expect(DECOR_SPEC[it.kind]).toBeDefined();
    }
  });

  it('keeps the camp clear and reeds at Kağıthane', () => {
    const o = lt('otag');
    expect(decor.some((d) => Math.hypot(d.tx - o.tx, d.ty - o.ty) < 6)).toBe(false);
    const k = lt('kagithane');
    expect(decor.some((d) => d.kind === 'saz' && Math.hypot(d.tx - k.tx, d.ty - k.ty) < 12)).toBe(true);
  });

  it('maps the calendar to seasons', () => {
    expect(seasonOf(d(16, 4, 1453))).toBe('ilkbahar');
    expect(seasonOf(d(10, 6, 1452))).toBe('yaz');
    expect(seasonOf(d(15, 10, 1452))).toBe('sonbahar');
    expect(seasonOf(d(20, 1, 1453))).toBe('kis');
    expect(seasonOf(d(1, 12, 1452))).toBe('kis');
  });

  it('bakes terrain chunks with land opaque and water transparent', () => {
    const baker = new ChunkBaker(world, decor);
    const out = new Uint8ClampedArray(CHUNK_W * CHUNK_H * 4);
    const p = tileToWorld(lt('rumeliHisari').tx, lt('rumeliHisari').ty);
    baker.bake(Math.floor(p.x / CHUNK_W), Math.floor(p.y / CHUNK_H), 'kis', out);
    let opaque = 0;
    let clear = 0;
    for (let i = 3; i < out.length; i += 4) out[i] ? opaque++ : clear++;
    expect(opaque).toBeGreaterThan(1000);
    expect(clear).toBeGreaterThan(1000);
  });

  it('builds minimap and water data', () => {
    const px = minimapPixels(world);
    expect(px.length).toBe(world.width * world.height * 4);
    const wd = buildWaterData(world);
    expect(wd.length).toBe(512 * 512 * 4);
    // a mid-Bosphorus sample is deep-ish water with current
    const r = lt('rumeliHisari');
    const a = lt('anadoluHisari');
    const i = Math.round((r.ty + a.ty)) * 512 + Math.round(r.tx + a.tx);
    expect(wd[i * 4 + 1]).toBeLessThan(128); // SDF < 0 → water
    expect(wd[i * 4 + 2]).toBeGreaterThan(100); // Bosphorus current
  });
});
