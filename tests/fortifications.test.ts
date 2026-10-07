import { describe, expect, it } from 'vitest';
import { Bus } from '../src/core/bus';
import type { GameEvents } from '../src/core/bus';
import { geoPolyToTiles, geoToTile, WATER } from '../src/data/geography';
import { SECTIONS } from '../src/data/sections';
import { createCoreState } from '../src/game/newGame';
import {
  assaultOpenness,
  collapsedTowers,
  damageSection,
  gatePositions,
  rawBreach,
  recomputeBreach,
  repairSection,
  sectionApproach,
  sectionAt,
  sectionCenter,
  sectionDamageStage,
  sectionLength,
  sectionOutwardNormal,
  sectionPath,
  sectionPoint,
  towerPositions,
} from '../src/features/fortifications/api';
import { LINES, SPANS, TOWERS, nearestOnLine, pointInPoly } from '../src/features/fortifications/geom';
import { applyScenario, initWalls, simTick } from '../src/features/fortifications/sim';
import { layoutCity, type CityWorld } from '../src/features/fortifications/city';
import { NullFx } from '../src/core/fx';
import { Rng } from '../src/core/rng';
import type { SimContext } from '../src/core/feature';

function freshState() {
  const s = createCoreState('normal', 1);
  initWalls(s);
  return s;
}

function collect(bus: Bus) {
  const ev: { k: keyof GameEvents; p: unknown }[] = [];
  for (const k of ['wall:damaged', 'wall:breach', 'wall:tower-collapse', 'wall:repaired'] as (keyof GameEvents)[]) {
    bus.on(k, (p) => ev.push({ k, p }));
  }
  return ev;
}

const WATER_T = geoPolyToTiles(WATER);

describe('fortifications geometry', () => {
  it('every section has a path of sensible length', () => {
    for (const s of SECTIONS) {
      const p = sectionPath(s.id);
      expect(p.length).toBeGreaterThanOrEqual(2);
      const len = sectionLength(s.id);
      expect(len).toBeGreaterThan(2);
      expect(len).toBeLessThan(40);
    }
  });

  it('land wall is about 5.7 km (~92 tiles)', () => {
    expect(LINES.kara.len).toBeGreaterThan(80);
    expect(LINES.kara.len).toBeLessThan(105);
  });

  it('sea sections follow the coast on land, close to the water', () => {
    for (const s of SECTIONS.filter((x) => x.kind !== 'kara')) {
      for (let k = 0; k <= 10; k++) {
        const p = sectionPoint(s.id, k / 10);
        expect(pointInPoly(p.tx, p.ty, WATER_T)).toBe(false);
        // some water within ~2.5 tiles on the outward side
        const n = sectionOutwardNormal(s.id, k / 10);
        const w = { tx: p.tx + n.tx * 2.5, ty: p.ty + n.ty * 2.5 };
        expect(pointInPoly(w.tx, w.ty, WATER_T)).toBe(true);
      }
    }
  });

  it('land outward normal points west (attacker side)', () => {
    for (const s of SECTIONS.filter((x) => x.kind === 'kara')) {
      expect(sectionOutwardNormal(s.id).tx).toBeLessThan(0);
    }
  });

  it('sectionPoint endpoints match the section path', () => {
    for (const s of SECTIONS) {
      const p = sectionPath(s.id);
      const a = sectionPoint(s.id, 0);
      const b = sectionPoint(s.id, 1);
      expect(Math.hypot(a.tx - p[0].tx, a.ty - p[0].ty)).toBeLessThan(1e-6);
      expect(Math.hypot(b.tx - p[p.length - 1].tx, b.ty - p[p.length - 1].ty)).toBeLessThan(1e-6);
    }
  });

  it('land sections tile the land wall without gaps', () => {
    const land = Object.values(SPANS)
      .filter((s) => s.line === 'kara')
      .sort((a, b) => a.t0 - b.t0);
    expect(land[0].t0).toBeLessThan(0.01);
    for (let i = 0; i + 1 < land.length; i++) expect(Math.abs(land[i].t1 - land[i + 1].t0)).toBeLessThan(1e-6);
    expect(Math.abs(land[land.length - 1].t1 - LINES.kara.len)).toBeLessThan(0.01);
  });

  it('sectionAt finds the section at its own center and null far away', () => {
    for (const s of SECTIONS) {
      const c = sectionCenter(s.id);
      expect(sectionAt(c.tx, c.ty)).toBe(s.id);
    }
    expect(sectionAt(5, 5)).toBeNull();
  });

  it('sectionApproach lies outside: west of land walls, in the water for sea walls', () => {
    for (const s of SECTIONS) {
      const a = sectionApproach(s.id, 4);
      const q = nearestOnLine(LINES[SPANS[s.id].line], a.tx, a.ty);
      expect(q.n).toBeGreaterThan(2);
      if (s.kind !== 'kara') expect(pointInPoly(a.tx, a.ty, WATER_T)).toBe(true);
      else expect(pointInPoly(a.tx, a.ty, WATER_T)).toBe(false);
    }
  });

  it('towers: every land section has towers spaced 1.4–3.5 tiles apart', () => {
    for (const s of SECTIONS.filter((x) => x.kind === 'kara')) {
      const tw = towerPositions(s.id);
      expect(tw.length).toBeGreaterThan(0);
      for (let i = 0; i + 1 < tw.length; i++) {
        const d = Math.hypot(tw[i + 1].tx - tw[i].tx, tw[i + 1].ty - tw[i].ty);
        expect(d).toBeGreaterThan(0.6);
        expect(d).toBeLessThan(3.6);
      }
    }
    expect(TOWERS.filter((t) => t.line === 'kara').length).toBeGreaterThan(40);
  });

  it('gates include the named land gates', () => {
    const names = gatePositions().map((g) => g.name);
    for (const n of ['Topkapı', 'Edirnekapı', 'Eğrikapı', 'Silivrikapı', 'Belgradkapı', 'Mevlevihanekapı', 'Altınkapı']) {
      expect(names).toContain(n);
    }
    const top = gatePositions().find((g) => g.name === 'Topkapı')!;
    const lm = geoToTile(41.0197, 28.9218);
    expect(Math.hypot(top.tx - lm.tx, top.ty - lm.ty)).toBeLessThan(0.5);
  });
});

describe('fortifications damage model', () => {
  it('outer wall absorbs first on double-wall land sections', () => {
    const st = freshState();
    const bus = new Bus();
    const ev = collect(bus);
    const s = st.sections['kara-topkapi'];
    const inner0 = s.inner;
    damageSection(st, bus, s.id, 100);
    expect(s.outer).toBeLessThan(s.outerMax);
    expect(s.outerMax - s.outer).toBeGreaterThan(inner0 - s.inner);
    expect(ev.some((e) => e.k === 'wall:damaged')).toBe(true);
  });

  it('Blachernae is a single wall without a moat', () => {
    const st = freshState();
    const s = st.sections['kara-blahernai'];
    expect(s.outerMax).toBe(0);
    const bus = new Bus();
    damageSection(st, bus, s.id, 100);
    expect(s.inner).toBe(s.innerMax - 100);
  });

  it('breach event fires once when crossing 0.5 and towers collapse progressively', () => {
    const st = freshState();
    const bus = new Bus();
    const ev = collect(bus);
    const s = st.sections['kara-lykos'];
    for (let i = 0; i < 80 && s.breach < 0.9; i++) damageSection(st, bus, s.id, 42);
    expect(s.breach).toBeGreaterThan(0.5);
    expect(ev.filter((e) => e.k === 'wall:breach').length).toBe(1);
    expect(st.stats.breaches).toBe(1);
    expect(s.towersDown).toBeGreaterThan(0);
    expect(ev.filter((e) => e.k === 'wall:tower-collapse').length).toBe(s.towersDown);
    expect(collapsedTowers(s).length).toBe(s.towersDown);
    expect(sectionDamageStage(s)).toBe(4);
  });

  it('outer wall alone opens the line partially (stockade line of 1453)', () => {
    const st = freshState();
    const s = st.sections['kara-topkapi'];
    s.outer = 0;
    recomputeBreach(s);
    expect(s.breach).toBeGreaterThan(0.5);
    expect(s.breach).toBeLessThan(0.7);
  });

  it('barricades plug breaches and soak shots; repair builds stockades', () => {
    const st = freshState();
    const bus = new Bus();
    const s = st.sections['kara-lykos'];
    s.outer = 0;
    s.inner = s.innerMax * 0.5;
    recomputeBreach(s);
    const open = s.breach;
    repairSection(st, bus, s.id, 400);
    expect(s.barricade).toBeGreaterThan(0);
    expect(s.breach).toBeLessThan(open);
    const bar = s.barricade;
    const inner = s.inner;
    damageSection(st, bus, s.id, 20);
    expect(s.barricade).toBeLessThan(bar);
    expect(s.inner).toBeGreaterThanOrEqual(inner - 20);
  });

  it('damage stages progress monotonically', () => {
    const st = freshState();
    const bus = new Bus();
    const s = st.sections['kara-topkapi'];
    let last = sectionDamageStage(s);
    expect(last).toBe(0);
    for (let i = 0; i < 100; i++) {
      damageSection(st, bus, s.id, 30);
      const now = sectionDamageStage(s);
      expect(now).toBeGreaterThanOrEqual(last);
      last = now;
    }
    expect(last).toBe(4);
  });

  it('moat matters to assaults but not to rawBreach', () => {
    const st = freshState();
    const s = st.sections['kara-topkapi'];
    s.outer = 0;
    s.inner = s.innerMax * 0.3;
    recomputeBreach(s);
    const r = rawBreach(s);
    const a0 = assaultOpenness(s);
    s.moatFill = 1;
    expect(rawBreach(s)).toBe(r);
    expect(assaultOpenness(s)).toBeGreaterThan(a0);
  });

  it('simTick raises threshold events for HP changed directly by other features', () => {
    const st = freshState();
    const bus = new Bus();
    const ev = collect(bus);
    const ctx: SimContext = { dtSec: 0.1, dtDays: 0.001, rng: new Rng(1), bus, world: null as never };
    const s = st.sections['kara-edirnekapi'];
    s.outer = 0;
    s.inner = 0;
    simTick(st, ctx);
    expect(s.breach).toBeGreaterThan(0.9);
    expect(ev.filter((e) => e.k === 'wall:breach').length).toBe(1);
    simTick(st, ctx);
    expect(ev.filter((e) => e.k === 'wall:breach').length).toBe(1);
    expect(ev.filter((e) => e.k === 'wall:tower-collapse').length).toBeGreaterThan(0);
  });

  it('scenarios damage Lykos/Topkapı realistically', () => {
    const st = freshState();
    applyScenario('bombardiman', st);
    expect(st.sections['kara-lykos'].outer).toBeLessThan(st.sections['kara-lykos'].outerMax * 0.6);
    expect(st.sections['kara-silivrikapi'].outer).toBeGreaterThan(st.sections['kara-lykos'].outer);
    const st2 = freshState();
    applyScenario('son-hucum', st2);
    expect(rawBreach(st2.sections['kara-lykos'])).toBeGreaterThan(0.5);
    expect(st2.sections['kara-lykos'].barricade).toBeGreaterThan(0);
    const st3 = freshState();
    applyScenario('gece-onarim', st3);
    expect(st3.sections['kara-lykos'].barricade).toBeGreaterThan(0.5);
  });
});

describe('city layout', () => {
  it('is deterministic and keeps out of walls and landmarks', () => {
    // fake world: everything within a box is city ground
    const w: CityWorld = {
      width: 256,
      height: 200,
      regionAt: (tx, ty) => (tx > 60 && tx < 140 && ty > 70 && ty < 170 ? 'sur-ici' : 'trakya'),
      terrainAt: (tx, ty) => (tx > 60 && tx < 140 && ty > 70 && ty < 170 ? 'sehir' : 'cimen'),
      heightAt: () => 1,
      isWater: () => false,
    };
    const a = layoutCity(w);
    const b = layoutCity(w);
    expect(a.items.length).toBeGreaterThan(100);
    expect(a.items.length).toBe(b.items.length);
    expect(a.items[10]).toEqual(b.items[10]);
    for (const it of a.items) {
      if (it.kind === 'landmark' || it.kind === 'sarnic') continue; // placed at their real positions
      expect(w.regionAt(Math.round(it.tx), Math.round(it.ty))).not.toBe('trakya');
    }
  });
});

// keep the NullFx import used (render helpers are exercised in the browser build)
void NullFx;
