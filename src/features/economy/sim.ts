import type { Cost } from '../../core/defs';
import type { SimContext } from '../../core/feature';
import { FLAG } from '../../core/flags';
import { formatDate } from '../../core/calendar';
import { addLog, RESOURCE_IDS, type Building, type GameState, type ResourceId } from '../../core/state';
import type { WorldApi } from '../../core/world';
import { EDIRNE_ROAD, geoToTile } from '../../data/geography';
import { landmarkTile } from '../../data/landmarks';
import {
  buildingCenterTile,
  buildingsOf,
  caravanInterval,
  costText,
  dailyAkceUpkeep,
  dailyErzakConsumption,
  edirneActionCheck,
  erzakDays,
  erzakPurchaseAmount,
  footprintTiles,
  gain,
  hisarBuilding,
  hisarOverall,
  hisarPart,
  housingCapacity,
  isPlacementValid,
  labourFactor,
  placeBuilding,
  productionBonus,
  spend,
  staffRate,
  supplyCoverage,
} from './api';
import {
  AMELE_BATCH,
  BUILDING_BY_ID,
  CARAVAN_ADI,
  CARAVAN_ROTATION,
  FLOAT_CHUNK,
  HISAR,
  HISAR_TOWERS,
  ROAD_PROJECT,
  SUPPLY,
  VERGI,
  VIRTUAL_BUILDINGS,
  type CaravanKind,
  type EdirneActionId,
  type HisarPartId,
  type HisarTowerId,
} from './data';
import { addTo, econ, type Caravan, type EconState } from './econState';

const UNIQUE_KEEP = new Set(['rumeli-hisari', 'otag', 'edirne-dokumhane']);

// ───────────────────────────── World blocking sync ─────────────────────────────

/**
 * The world grid is shared across games (built once per page), so the set of
 * tiles we blocked is remembered per world and re-synced whenever the building
 * list (or the state object) changes.
 */
const blockCache = new WeakMap<WorldApi, { state: GameState | null; sig: string; tiles: Set<number> }>();

function buildingSig(state: GameState): string {
  let s = 0;
  for (const b of state.buildings) s = (s * 31 + b.id * 7 + b.tx * 3 + b.ty) % 1000000007;
  return `${state.buildings.length}:${s}`;
}

export function syncBlocked(state: GameState, world: WorldApi, force = false): void {
  let c = blockCache.get(world);
  if (!c) {
    c = { state: null, sig: '', tiles: new Set() };
    blockCache.set(world, c);
  }
  const sig = buildingSig(state);
  if (!force && c.state === state && c.sig === sig) return;
  const want = new Set<number>();
  for (const b of state.buildings) {
    if (VIRTUAL_BUILDINGS.has(b.type)) continue;
    for (const t of footprintTiles(b.type, b.tx, b.ty)) if (world.inBounds(t.tx, t.ty)) want.add(t.ty * 4096 + t.tx);
  }
  for (const k of c.tiles) if (!want.has(k)) world.setBlocked(k % 4096, Math.floor(k / 4096), false);
  for (const k of want) if (!c.tiles.has(k)) world.setBlocked(k % 4096, Math.floor(k / 4096), true);
  c.tiles = want;
  c.state = state;
  c.sig = sig;
}

// ───────────────────────────── Placement helpers ─────────────────────────────

/** Deterministic spiral search for a valid spot (scripted placement). */
export function findSpot(
  state: GameState,
  world: WorldApi,
  type: string,
  cx: number,
  cy: number,
  maxR = 8,
  opts: { ignoreNear?: boolean } = {},
): { tx: number; ty: number } | null {
  const def = BUILDING_BY_ID[type];
  if (!def) return null;
  const ox = Math.round(cx - (def.size[0] - 1) / 2);
  const oy = Math.round(cy - (def.size[1] - 1) / 2);
  for (let r = 0; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const ok = isPlacementValid(state, world, type, ox + dx, oy + dy, { ignorePhase: true, ignoreCost: true, ignoreNear: opts.ignoreNear }).ok;
        if (ok) return { tx: ox + dx, ty: oy + dy };
      }
  }
  return null;
}

/** Place a finished (or unbuilt) building at the nearest valid spot. */
export function placeNear(
  state: GameState,
  world: WorldApi,
  type: string,
  cx: number,
  cy: number,
  opts: { built?: boolean; data?: Building['data']; maxR?: number; ignoreNear?: boolean } = {},
): Building | null {
  let spot = findSpot(state, world, type, cx, cy, opts.maxR ?? 8);
  if (!spot && BUILDING_BY_ID[type]?.near) spot = findSpot(state, world, type, cx, cy, opts.maxR ?? 8, { ignoreNear: true });
  if (!spot) return null;
  const b = placeBuilding(state, type, spot.tx, spot.ty, { built: opts.built !== false, data: { ...(opts.data ?? {}) } });
  if (!b.built) b.progress = 0;
  syncBlocked(state, world);
  return b;
}

/** Search for the nearest tile of a terrain type around (cx,cy). */
function nearestTerrain(world: WorldApi, cx: number, cy: number, terrain: string, maxR: number): { tx: number; ty: number } | null {
  for (let r = 0; r <= maxR; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = Math.round(cx) + dx;
        const y = Math.round(cy) + dy;
        if (world.inBounds(x, y) && world.terrainAt(x, y) === terrain) return { tx: x, ty: y };
      }
  return null;
}

// ───────────────────────────── New game ─────────────────────────────

/** Footprint origin for Rumeli Hisarı so that its center sits just inland of the landmark. */
export function hisarOrigin(): { tx: number; ty: number } {
  const l = landmarkTile('rumeliHisari');
  return { tx: Math.round(l.tx) - 2, ty: Math.round(l.ty) - 2 };
}

export function initEconomy(state: GameState, world: WorldApi): void {
  const e = econ(state);
  // Rebalance starting stocks (owner: economy): 1452 spring stores at Edirne.
  state.resources.erzak = Math.max(state.resources.erzak, 40000);
  state.resources.tas = Math.max(state.resources.tas, 400);
  state.resources.kereste = Math.max(state.resources.kereste, 350);

  if (!state.buildings.some((b) => b.type === 'edirne-dokumhane')) placeBuilding(state, 'edirne-dokumhane', -100, -100, { built: true });

  // Rumeli Hisarı construction site (unbuilt).
  if (!hisarBuilding(state)) {
    const o = hisarOrigin();
    const h = placeBuilding(state, 'rumeli-hisari', o.tx, o.ty, {
      built: false,
      data: { temel: 0, surlar: 0, saruca: 0, halil: 0, zaganos: 0 },
    });
    h.progress = 0;
    e.hisarId = h.id;
  }
  syncBlocked(state, world, true);

  // A first quarry and lumber camp near the site (materials gathered over the winter of 1451–52).
  const q = geoToTile(41.082, 29.035);
  const qq = nearestTerrain(world, q.tx, q.ty, 'kaya', 10) ?? q;
  if (!state.buildings.some((b) => b.type === 'tas-ocagi')) placeNear(state, world, 'tas-ocagi', qq.tx, qq.ty, { maxR: 10 });
  const f = geoToTile(41.0865, 29.032);
  const ff = nearestTerrain(world, f.tx, f.ty, 'orman', 10) ?? f;
  if (!state.buildings.some((b) => b.type === 'kereste-kampi')) placeNear(state, world, 'kereste-kampi', ff.tx, ff.ty, { maxR: 10 });

  e.nextCaravanDay = state.time.day + 4;
  // One caravan is already on the road from Edirne.
  spawnCaravan(state, world, 'karma', null, 0.55);
  assignWorkers(state);
}

// ───────────────────────────── Workers ─────────────────────────────

function hisarActive(state: GameState, b: Building | undefined): b is Building {
  return !!b && !b.built && state.time.day >= HISAR.startDay;
}

/** Nominal workers for the parts of the hisar still unfinished. */
export function hisarNominal(b: Building): number {
  if (hisarPart(b, 'temel') < 1) return HISAR.parts.temel.workers;
  let n = 0;
  for (const id of ['surlar', ...HISAR_TOWERS] as HisarPartId[]) if (hisarPart(b, id) < 1) n += HISAR.parts[id].workers;
  return n;
}

/**
 * Auto-assign workers: hisar (nominal) → construction sites → production
 * (proportional) → spare to the hisar (over-staffing). Manual ('isci-ata')
 * assignments are respected.
 */
export function assignWorkers(state: GameState): void {
  const e = econ(state);
  const pool = Math.max(0, state.workforce.total - (e.yol.active ? e.yol.workers : 0));
  const manual = state.buildings.filter((b) => b.data.manual === true && !VIRTUAL_BUILDINGS.has(b.type));
  let manualSum = manual.reduce((a, b) => a + b.workers, 0);
  if (manualSum > pool && manualSum > 0) {
    const k = pool / manualSum;
    manualSum = 0;
    for (const b of manual) {
      b.workers = Math.floor(b.workers * k);
      manualSum += b.workers;
    }
  }
  let free = pool - manualSum;
  const hisar = hisarBuilding(state);
  const auto = (b: Building) => b.data.manual !== true && !VIRTUAL_BUILDINGS.has(b.type);
  for (const b of state.buildings) if (auto(b)) b.workers = 0;

  // 1. Rumeli Hisarı at nominal staffing
  if (hisarActive(state, hisar) && auto(hisar)) {
    const g = Math.min(free, hisarNominal(hisar));
    hisar.workers = g;
    free -= g;
  }
  // 2. other construction sites
  for (const b of state.buildings) {
    if (b.built || b.type === 'rumeli-hisari' || !auto(b)) continue;
    const def = BUILDING_BY_ID[b.type];
    if (!def) continue;
    const g = Math.min(free, def.workersMax);
    b.workers = g;
    free -= g;
  }
  // 3. production buildings, proportional
  const prod = state.buildings.filter((b) => b.built && auto(b) && (BUILDING_BY_ID[b.type]?.produces ?? null) && (BUILDING_BY_ID[b.type]?.workersMax ?? 0) > 0);
  const want = prod.reduce((a, b) => a + BUILDING_BY_ID[b.type].workersMax, 0);
  if (want > 0) {
    const k = Math.min(1, free / want);
    for (const b of prod) {
      const g = Math.floor(BUILDING_BY_ID[b.type].workersMax * k);
      b.workers = g;
      free -= g;
    }
  }
  // 4. spare hands → over-staff the hisar
  if (hisarActive(state, hisar) && auto(hisar) && free > 0) {
    const cap = Math.round(hisarNominal(hisar) * HISAR.overstaffMax);
    const g = Math.min(free, cap - hisar.workers);
    if (g > 0) {
      hisar.workers += g;
      free -= g;
    }
  }
  state.workforce.assigned = state.buildings.reduce((a, b) => a + (VIRTUAL_BUILDINGS.has(b.type) ? 0 : b.workers), 0);
}

// ───────────────────────────── Construction ─────────────────────────────

function effStaff(w: number, nominal: number): number {
  if (nominal <= 0) return 0;
  if (w <= nominal) return w / nominal;
  return 1 + HISAR.overstaffGain * Math.min(1, (w - nominal) / (nominal * (HISAR.overstaffMax - 1)));
}

/** Largest fraction (0..1) of `cost × amount` currently affordable. */
function affordFraction(state: GameState, cost: Cost, amount: number): number {
  let f = 1;
  for (const r of RESOURCE_IDS) {
    const need = (cost[r] ?? 0) * amount;
    if (need > 0) f = Math.min(f, state.resources[r] / need);
  }
  return Math.max(0, f);
}

function consume(state: GameState, e: EconState, cost: Cost, amount: number): void {
  for (const r of RESOURCE_IDS) {
    const v = (cost[r] ?? 0) * amount;
    if (v <= 0) continue;
    state.resources[r] = Math.max(0, state.resources[r] - v);
    addTo(e.today.consumed, r, v);
  }
}

function tickHisar(state: GameState, ctx: SimContext, e: EconState, b: Building): void {
  if (b.built) return;
  const day = state.time.day;
  if (day < HISAR.startDay) return;
  if (!e.warned.hisarBasladi) {
    e.warned.hisarBasladi = day;
    addLog(state, 'olay', `Rumeli Hisarı'nın temeli atıldı (${formatDate(day)}). Mimar Müslihiddin Ağa işin başında.`);
    ctx.bus.emit('notify', { text: 'Rumeli Hisarı inşaatı başladı.', kind: 'bilgi' });
  }
  const lf = labourFactor(state);
  const c = buildingCenterTile(b);
  const at = { tx: c.tx, ty: c.ty };
  const W = b.workers;
  const parts: HisarPartId[] = hisarPart(b, 'temel') < 1 ? ['temel'] : (['surlar', ...HISAR_TOWERS] as HisarPartId[]).filter((id) => hisarPart(b, id) < 1);
  // worker split by nominal weight (priority tower ×2)
  const weights = parts.map((id) => HISAR.parts[id].workers * (id === e.hisarPriority ? 2 : 1));
  const wsum = weights.reduce((a, x) => a + x, 0) || 1;
  for (const id of ['temel', 'surlar', ...HISAR_TOWERS] as HisarPartId[]) b.data[`w_${id}`] = 0;
  const ihsan = day < e.ihsanUntil ? 1 + HISAR.ihsanBonus : 1;
  parts.forEach((id, i) => {
    const def = HISAR.parts[id];
    const w = (W * weights[i]) / wsum;
    b.data[`w_${id}`] = Math.round(w);
    let dp = (ctx.dtDays * effStaff(w, def.workers) * lf * (id === 'temel' || id === 'surlar' ? 1 : ihsan)) / def.days;
    const p0 = hisarPart(b, id);
    dp = Math.min(dp, 1 - p0);
    if (dp <= 0) return;
    const f = Math.min(1, affordFraction(state, def.cost, dp));
    if (f < 1) {
      b.data.stalled = true;
      warnOnce(state, ctx, e, `hisar-malzeme`, 6, 'Rumeli Hisarı inşaatında malzeme bitti: taş ve kereste gerekiyor.');
    } else b.data.stalled = false;
    dp *= f;
    consume(state, e, def.cost, dp);
    const p1 = p0 + dp;
    b.data[id] = p1 >= 0.99999 ? 1 : p1;
    if (Math.floor(p1 * 200) !== Math.floor(p0 * 200)) ctx.bus.emit('construction:tick', { id: b.id, at });
    if (p1 >= 0.99999 && p0 < 1) {
      b.data[id] = 1;
      const name = def.name;
      addLog(state, 'basari', id === 'temel' ? 'Rumeli Hisarı\'nın temeli tamamlandı; surlar ve kuleler yükselmeye başladı.' : `${name} tamamlandı${def.pasha ? ` (${def.pasha})` : ''}.`);
      ctx.bus.emit('construction:stage', { id: b.id, type: b.type, stage: id, name, at });
      ctx.bus.emit('notify', { text: `${name} tamamlandı.`, kind: 'basari' });
    }
  });
  b.progress = hisarOverall(b);
  state.flags[FLAG.hisarIlerleme] = b.progress;
  if ((['temel', 'surlar', ...HISAR_TOWERS] as HisarPartId[]).every((id) => hisarPart(b, id) >= 1)) completeHisar(state, ctx, b);
}

export function completeHisar(state: GameState, ctx: Pick<SimContext, 'bus'> | null, b: Building): void {
  b.built = true;
  b.progress = 1;
  for (const id of ['temel', 'surlar', ...HISAR_TOWERS]) b.data[id] = 1;
  b.workers = 0;
  b.data.manual = false;
  state.flags[FLAG.hisarIlerleme] = 1;
  state.flags[FLAG.hisarTamam] = true;
  state.flags[FLAG.bogazKontrol] = true;
  state.flags[FLAG.hisarBitisGunu] = state.time.day;
  if (ctx) {
    const c = buildingCenterTile(b);
    const late = state.time.day - HISAR.historicalEnd;
    const when = late < -3 ? `tarihten ${Math.round(-late)} gün önce` : late > 3 ? `tarihten ${Math.round(late)} gün sonra` : 'tarihteki gibi';
    addLog(state, 'basari', `Rumeli Hisarı (Boğazkesen) tamamlandı — ${formatDate(state.time.day)}, ${when}. Boğaz artık Osmanlı denetiminde.`);
    ctx.bus.emit('building:complete', { id: b.id, type: b.type, at: { tx: c.tx, ty: c.ty } });
    ctx.bus.emit('notify', { text: 'Rumeli Hisarı tamamlandı! Boğaz denetim altında.', kind: 'basari' });
  }
}

function tickConstruction(state: GameState, ctx: SimContext, b: Building, lf: number): void {
  const def = BUILDING_BY_ID[b.type];
  if (!def) return;
  const rate = def.workersMax > 0 ? staffRate(b) * lf : 1;
  const p0 = b.progress;
  b.progress = Math.min(1, b.progress + (ctx.dtDays * rate) / Math.max(0.05, def.buildDays));
  const c = buildingCenterTile(b);
  if (Math.floor(b.progress * 20) !== Math.floor(p0 * 20)) ctx.bus.emit('construction:tick', { id: b.id, at: { tx: c.tx, ty: c.ty } });
  if (b.progress >= 1) {
    b.built = true;
    b.progress = 1;
    if (b.data.manual !== true) b.workers = 0;
    addLog(state, 'basari', `${def.name} tamamlandı.`);
    ctx.bus.emit('building:complete', { id: b.id, type: b.type, at: { tx: c.tx, ty: c.ty } });
  }
}

// ───────────────────────────── Production ─────────────────────────────

function tickProduction(state: GameState, ctx: SimContext, e: EconState, b: Building, lf: number): void {
  const def = BUILDING_BY_ID[b.type];
  if (!def?.produces) return;
  const virt = VIRTUAL_BUILDINGS.has(b.type);
  const rate = staffRate(b) * (virt ? 1 : lf) * productionBonus(state, b);
  if (rate <= 0) {
    b.data.rate = 0;
    return;
  }
  let f = 1;
  if (def.consumes) f = Math.min(1, affordFraction(state, def.consumes, rate * ctx.dtDays));
  b.data.rate = rate * f;
  b.data.stalled = f < 0.5;
  if (f <= 0) return;
  if (def.consumes) consume(state, e, def.consumes, rate * ctx.dtDays * f);
  const c = buildingCenterTile(b);
  for (const r of RESOURCE_IDS) {
    const v = (def.produces[r] ?? 0) * rate * ctx.dtDays * f;
    if (v <= 0) continue;
    state.resources[r] += v;
    addTo(e.today.produced, r, v);
    const chunk = FLOAT_CHUNK[r];
    if (chunk && !virt) {
      const key = `acc_${r}`;
      const acc = Number(b.data[key] ?? 0) + v;
      if (acc >= chunk) {
        const n = Math.floor(acc / chunk) * chunk;
        b.data[key] = acc - n;
        ctx.bus.emit('economy:produced', { id: b.id, res: r, amount: n, at: { tx: c.tx, ty: c.ty } });
      } else b.data[key] = acc;
    }
  }
}

// ───────────────────────────── Consumption, morale ─────────────────────────────

function tickUpkeep(state: GameState, ctx: SimContext, e: EconState): void {
  const dt = ctx.dtDays;
  const erzakNeed = dailyErzakConsumption(state) * dt;
  if (state.resources.erzak >= erzakNeed) {
    state.resources.erzak -= erzakNeed;
    if (e.starving && state.resources.erzak > erzakNeed * 4) {
      e.starving = false;
      addLog(state, 'bilgi', 'Erzak yeniden dağıtılıyor; açlık sona erdi.');
    }
  } else {
    if (!e.starving) {
      addLog(state, 'uyari', 'Erzak tükendi! Ordu ve amele aç; moral hızla düşüyor.');
      ctx.bus.emit('notify', { text: 'Erzak tükendi!', kind: 'tehlike' });
    }
    state.resources.erzak = 0;
    e.starving = true;
  }
  addTo(e.today.consumed, 'erzak', erzakNeed);
  // spoilage
  const spoil = buildingsOf(state, 'erzak-ambari', { built: true }).length > 0 ? SUPPLY.spoilageAmbar : SUPPLY.spoilage;
  const lost = state.resources.erzak * spoil * dt;
  state.resources.erzak -= lost;
  addTo(e.today.consumed, 'erzak', lost);

  const akceNeed = dailyAkceUpkeep(state) * dt;
  if (state.resources.akce >= akceNeed) {
    state.resources.akce -= akceNeed;
    if (e.unpaid && state.resources.akce > akceNeed * 10) {
      e.unpaid = false;
      addLog(state, 'bilgi', 'Ulufe ve amele ücretleri yeniden ödeniyor.');
    }
  } else {
    if (!e.unpaid) {
      addLog(state, 'uyari', 'Hazine boş: ulufe ve amele ücretleri ödenemiyor. İş yavaşladı, moral düşüyor.');
      ctx.bus.emit('notify', { text: 'Hazine boş! Ücretler ödenemiyor.', kind: 'uyari' });
    }
    state.resources.akce = 0;
    e.unpaid = true;
  }
  addTo(e.today.consumed, 'akce', akceNeed);

  // morale (owner of food/pay effects: economy)
  if (state.time.phase === 'kusatma' || state.time.phase === 'yuruyus') {
    let dm = 0;
    if (e.starving) dm -= 5;
    else if (erzakDays(state) < 4) dm -= 1;
    if (e.unpaid) dm -= 1.5;
    if (!e.starving && state.morale < 75) dm += Math.min(8, buildingsOf(state, 'ordugah-cadirlari', { built: true }).length) * 0.06;
    if (dm !== 0) state.morale = Math.max(0, Math.min(100, state.morale + dm * dt));
  }
}

function warnOnce(state: GameState, ctx: SimContext, e: EconState, key: string, everyDays: number, text: string): void {
  const last = e.warned[key];
  if (last != null && state.time.day - last < everyDays) return;
  e.warned[key] = state.time.day;
  addLog(state, 'uyari', text);
  ctx.bus.emit('notify', { text, kind: 'uyari' });
}

// ───────────────────────────── Caravans ─────────────────────────────

function roadEntry(world: WorldApi): { tx: number; ty: number } {
  const p = geoToTile(EDIRNE_ROAD[0][0], EDIRNE_ROAD[0][1]);
  const t = { tx: Math.max(0, Math.round(p.tx)), ty: Math.round(p.ty) };
  return world.nearestPassable(t, 'land', 12) ?? t;
}

/** Where caravans unload right now. */
export function depotTile(state: GameState, world: WorldApi): { tile: { tx: number; ty: number }; destId: number | null } {
  const kerv = buildingsOf(state, 'kervansaray', { built: true })[0];
  let b: Building | undefined = kerv;
  if (!b && state.time.phase !== 'hazirlik') b = buildingsOf(state, 'otag')[0];
  if (!b && state.time.phase === 'hazirlik') b = buildingsOf(state, 'erzak-ambari', { built: true })[0] ?? hisarBuilding(state);
  let t: { tx: number; ty: number };
  if (b) {
    const def = BUILDING_BY_ID[b.type];
    if (b.type === 'rumeli-hisari') {
      // unload at the south-west (left) side of the fortress, on the slope road
      const c = buildingCenterTile(b);
      t = { tx: Math.round(c.tx - 5), ty: Math.round(c.ty + 4) };
    } else t = { tx: b.tx - 1, ty: b.ty + Math.floor(def.size[1] / 2) };
  } else {
    const o = landmarkTile('otag');
    t = { tx: Math.round(o.tx) - 3, ty: Math.round(o.ty) };
  }
  const p = world.nearestPassable(t, 'land', 10) ?? t;
  return { tile: p, destId: b?.id ?? null };
}

function pathLength(path: { tx: number; ty: number }[]): number {
  let l = 0;
  for (let i = 1; i < path.length; i++) l += Math.hypot(path[i].tx - path[i - 1].tx, path[i].ty - path[i - 1].ty);
  return l;
}

/** Remove collinear points (keeps saves small). */
function simplify(path: { tx: number; ty: number }[]): { tx: number; ty: number }[] {
  if (path.length < 3) return path;
  const out = [path[0]];
  for (let i = 1; i < path.length - 1; i++) {
    const a = out[out.length - 1];
    const b = path[i];
    const c = path[i + 1];
    const d1x = Math.sign(b.tx - a.tx);
    const d1y = Math.sign(b.ty - a.ty);
    const d2x = Math.sign(c.tx - b.tx);
    const d2y = Math.sign(c.ty - b.ty);
    if (d1x !== d2x || d1y !== d2y) out.push(b);
  }
  out.push(path[path.length - 1]);
  return out;
}

/** Point at distance `d` (tiles) along a path; also returns the travel direction. */
export function pointAlong(path: { tx: number; ty: number }[], d: number): { tx: number; ty: number; dx: number; dy: number } {
  if (path.length === 0) return { tx: 0, ty: 0, dx: 1, dy: 0 };
  if (d <= 0 || path.length === 1) {
    const b = path[1] ?? path[0];
    return { tx: path[0].tx, ty: path[0].ty, dx: b.tx - path[0].tx || 1, dy: b.ty - path[0].ty };
  }
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const l = Math.hypot(b.tx - a.tx, b.ty - a.ty);
    if (d <= l || i === path.length - 1) {
      const t = l > 0 ? Math.min(1, d / l) : 1;
      return { tx: a.tx + (b.tx - a.tx) * t, ty: a.ty + (b.ty - a.ty) * t, dx: b.tx - a.tx, dy: b.ty - a.ty };
    }
    d -= l;
  }
  const last = path[path.length - 1];
  return { tx: last.tx, ty: last.ty, dx: 1, dy: 0 };
}

const CARGO_WEIGHTS: Record<CaravanKind, { erzak: number; akce: number; maden: number }> = {
  erzak: { erzak: 1.5, akce: 0.5, maden: 0.3 },
  hazine: { erzak: 0.6, akce: 2.2, maden: 0.3 },
  maden: { erzak: 0.6, akce: 0.6, maden: 3.0 },
  karma: { erzak: 0.8, akce: 1.2, maden: 1.1 },
  amele: { erzak: 0, akce: 0, maden: 0 },
};

/** Regular cargo for a caravan of `kind` departing now. */
export function regularCargo(state: GameState, kind: CaravanKind, interval: number, jitter = 1): Cost {
  const w = CARGO_WEIGHTS[kind];
  const kerv = Math.min(2, buildingsOf(state, 'kervansaray', { built: true }).length);
  const mult = (1 + SUPPLY.kervansarayCargo * kerv) * jitter;
  const siege = state.time.phase !== 'hazirlik';
  const per = Math.max(dailyErzakConsumption(state), 1200);
  const coverage = supplyCoverage(state);
  // kervansaray already raises coverage during the siege — don't count it twice for food
  const erzakMult = siege ? jitter : mult;
  return {
    erzak: Math.round(Math.max(SUPPLY.erzakMin * w.erzak, per * coverage * interval * w.erzak) * erzakMult),
    akce: Math.round((siege ? SUPPLY.akceKusatma : SUPPLY.akceHazirlik) * w.akce * mult),
    maden: Math.round((siege ? SUPPLY.madenKusatma : SUPPLY.madenHazirlik) * w.maden * mult),
  };
}

export function spawnCaravan(
  state: GameState,
  world: WorldApi,
  kind: CaravanKind,
  cargo: Cost | null,
  startFrac = 0,
  workers = 0,
): Caravan {
  const e = econ(state);
  const start = roadEntry(world);
  const dep = depotTile(state, world);
  let path = world.findPath(start, dep.tile, 'land');
  if (!path || path.length < 2) path = [start, dep.tile];
  path = simplify(path);
  const len = pathLength(path);
  const interval = Number.isFinite(caravanInterval(state)) ? caravanInterval(state) : SUPPLY.intervalHazirlik;
  const c: Caravan = {
    id: ++e.caravanSeq,
    kind,
    path,
    dist: len * startFrac,
    len,
    cargo: cargo ?? regularCargo(state, kind, interval),
    workers,
    size: kind === 'amele' ? 3 + Math.min(6, Math.round(workers / 60)) : kind === 'hazine' ? 4 : 6,
    destId: dep.destId,
  };
  e.caravans.push(c);
  return c;
}

function tickCaravans(state: GameState, ctx: SimContext, e: EconState): void {
  const interval = caravanInterval(state);
  if (Number.isFinite(interval) && state.time.day >= e.nextCaravanDay) {
    const kind = CARAVAN_ROTATION[e.rotation % CARAVAN_ROTATION.length];
    e.rotation++;
    const jitter = ctx.rng.range(0.9, 1.1);
    const c = spawnCaravan(state, ctx.world, kind, null);
    c.cargo = regularCargo(state, kind, interval, jitter);
    e.nextCaravanDay = state.time.day + interval * ctx.rng.range(0.9, 1.1);
    ctx.bus.emit('caravan:departed', { id: c.id, kind });
  }
  if (e.caravans.length === 0) return;
  const speed = state.time.phase === 'hazirlik' ? SUPPLY.speedHazirlik : state.time.phase === 'yuruyus' ? SUPPLY.speedHazirlik : SUPPLY.speedKusatma;
  for (let i = e.caravans.length - 1; i >= 0; i--) {
    const c = e.caravans[i];
    c.dist += speed * ctx.dtSec;
    if (c.dist < c.len) continue;
    e.caravans.splice(i, 1);
    gain(state, c.cargo);
    for (const r of RESOURCE_IDS) if (c.cargo[r]) addTo(e.today.produced, r, c.cargo[r]!);
    if (c.workers > 0) state.workforce.total += c.workers;
    const what = CARAVAN_ADI[c.kind];
    const goods = costText(c.cargo);
    const text = c.workers > 0 ? `${c.workers} amele ve usta ordugâha ulaştı.` : `Edirne'den ${what} geldi: ${goods}.`;
    addLog(state, 'bilgi', text);
    ctx.bus.emit('caravan:arrived', { what: c.workers > 0 ? `${c.workers} amele` : goods || what });
  }
}

// ───────────────────────────── Siege camp ─────────────────────────────

export function placeCamp(state: GameState, world: WorldApi, bus: SimContext['bus'] | null): void {
  const e = econ(state);
  if (e.campPlaced) return;
  e.campPlaced = true;
  const ot = landmarkTile('otag');
  if (!buildingsOf(state, 'otag').length) placeNear(state, world, 'otag', ot.tx, ot.ty, { maxR: 6 });
  const wings: { id: string; lm: Parameters<typeof landmarkTile>[0]; fields: number; spread: number }[] = [
    { id: 'merkez', lm: 'otag', fields: 6, spread: 6 },
    { id: 'karaca', lm: 'karacaKarargah', fields: 5, spread: 5 },
    { id: 'ishak', lm: 'ishakKarargah', fields: 5, spread: 5 },
    { id: 'zaganos', lm: 'zaganosKarargah', fields: 4, spread: 4 },
  ];
  for (const w of wings) {
    const c = landmarkTile(w.lm);
    // camps sit back from the walls (west of them on land; north on Pera)
    const back = w.id === 'zaganos' ? { tx: 0, ty: -2 } : { tx: -5, ty: 0 };
    for (let k = 0; k < w.fields; k++) {
      const a = k * 2.399963 + (w.id.length % 3);
      const r = w.spread * Math.sqrt((k + 0.6) / w.fields);
      const cx = c.tx + back.tx + Math.cos(a) * r;
      const cy = c.ty + back.ty + Math.sin(a) * r;
      placeNear(state, world, 'ordugah-cadirlari', cx, cy, { maxR: 5, data: { wing: w.id, variant: k } });
    }
  }
  state.flags[FLAG.ordugahKuruldu] = true;
  addLog(state, 'olay', 'Ordugâh kuruldu: Otağ-ı Hümâyun Maltepe sırtında; Karaca Paşa solda, İshak Paşa sağda, Zağanos Paşa Galata sırtlarında.');
  bus?.emit('camp:established', { at: { tx: ot.tx, ty: ot.ty } });
}

// ───────────────────────────── Main tick ─────────────────────────────

export function economyTick(state: GameState, ctx: SimContext): void {
  if (state.time.phase === 'bitti') return;
  const e = econ(state);
  syncBlocked(state, ctx.world);

  // daily bookkeeping
  const dayInt = Math.floor(state.time.day);
  if (dayInt !== e.lastDay) {
    e.yesterday = e.today;
    e.today = { produced: {}, consumed: {} };
    e.lastDay = dayInt;
    if (state.time.phase === 'kusatma' && erzakDays(state) < 6 && !e.starving)
      warnOnce(state, ctx, e, 'erzak-az', 3, `Erzak azalıyor: yalnızca ${Math.max(0, Math.floor(erzakDays(state)))} günlük kaldı.`);
    if (state.workforce.total > housingCapacity(state)) warnOnce(state, ctx, e, 'barinak', 20, 'Amele barınaksız kaldı; ordugâh çadırları kurulmalı.');
  }

  // siege camp + provisions carried from Edirne
  if (state.time.phase === 'kusatma' && !e.campPlaced) placeCamp(state, ctx.world, ctx.bus);
  if (state.time.phase === 'kusatma' && !e.seferErzaki) {
    const since = state.time.siegeStartDay != null ? state.time.day - state.time.siegeStartDay : 1;
    if (state.groups.length > 0 || since > 0.3) {
      e.seferErzaki = true;
      const days = e.scenarioErzakDays ?? SUPPLY.seferErzakiDays;
      const add = Math.round(dailyErzakConsumption(state) * days);
      state.resources.erzak += add;
      addLog(state, 'bilgi', `Ordunun Edirne'den getirdiği ${Math.round(days)} günlük sefer erzakı ambarlara kondu.`);
    }
  }

  // destroyed buildings
  for (let i = state.buildings.length - 1; i >= 0; i--) {
    const b = state.buildings[i];
    if (b.hp > 0 || UNIQUE_KEEP.has(b.type)) continue;
    state.buildings.splice(i, 1);
    addLog(state, 'kayip', `${BUILDING_BY_ID[b.type]?.name ?? b.type} yıkıldı.`);
  }

  assignWorkers(state);
  const lf = labourFactor(state);
  for (const b of state.buildings) {
    if (b.type === 'rumeli-hisari') tickHisar(state, ctx, e, b);
    else if (!b.built) tickConstruction(state, ctx, b, lf);
    else tickProduction(state, ctx, e, b, lf);
  }
  tickUpkeep(state, ctx, e);
  tickCaravans(state, ctx, e);

  // Edirne road project
  if (e.yol.active) {
    const v = Number(state.flags[FLAG.yolHazirligi] ?? 0) + (ctx.dtDays * (e.yol.workers / ROAD_PROJECT.workers) * lf) / ROAD_PROJECT.days;
    state.flags[FLAG.yolHazirligi] = Math.min(1, v);
    if (v >= 1) {
      e.yol.active = false;
      e.yol.workers = 0;
      addLog(state, 'basari', 'Edirne yolu düzlendi, köprüler kuruldu. Büyük top artık daha çabuk taşınır.');
      ctx.bus.emit('notify', { text: 'Edirne yolu hazır.', kind: 'basari' });
    }
  }
  if (state.time.phase !== 'hazirlik' && e.yol.active) {
    e.yol.active = false;
    e.yol.workers = 0;
  }
}

// ───────────────────────────── Commands ─────────────────────────────

function notify(ctx: SimContext, text: string, kind: 'bilgi' | 'uyari' | 'basari' | 'tehlike' = 'uyari'): void {
  ctx.bus.emit('notify', { text, kind });
}

export function handleEconomyCommand(state: GameState, cmd: import('../../core/commands').Command, ctx: SimContext): boolean {
  const e = econ(state);
  switch (cmd.t) {
    case 'insa': {
      const def = BUILDING_BY_ID[cmd.building];
      if (!def) return false;
      const chk = isPlacementValid(state, ctx.world, cmd.building, cmd.tx, cmd.ty);
      if (!chk.ok) {
        notify(ctx, chk.reason ?? 'Buraya kurulamaz.');
        return true;
      }
      spend(state, def.cost);
      for (const r of RESOURCE_IDS) if (def.cost[r]) addTo(e.today.consumed, r, def.cost[r]!);
      const b = placeBuilding(state, cmd.building, cmd.tx, cmd.ty, { built: false });
      b.progress = 0;
      syncBlocked(state, ctx.world);
      assignWorkers(state);
      addLog(state, 'bilgi', `${def.name} için inşaat alanı açıldı.`);
      ctx.bus.emit('building:placed', { id: b.id, type: b.type });
      return true;
    }
    case 'insa-iptal': {
      const idx = state.buildings.findIndex((x) => x.id === cmd.buildingId);
      if (idx < 0) return false;
      const b = state.buildings[idx];
      const def = BUILDING_BY_ID[b.type];
      if (!def || UNIQUE_KEEP.has(b.type)) {
        notify(ctx, 'Bu yapı yıkılamaz.');
        return true;
      }
      const k = b.built ? 0.25 : 0.75 - 0.5 * b.progress;
      const refund: Cost = {};
      for (const r of RESOURCE_IDS) if (def.cost[r]) refund[r] = Math.floor(def.cost[r]! * k);
      gain(state, refund);
      state.buildings.splice(idx, 1);
      syncBlocked(state, ctx.world);
      assignWorkers(state);
      const rt = costText(refund);
      addLog(state, 'bilgi', `${def.name} ${b.built ? 'söküldü' : 'inşaatı iptal edildi'}${rt ? ` (geri alınan: ${rt})` : ''}.`);
      return true;
    }
    case 'isci-ata': {
      const b = state.buildings.find((x) => x.id === cmd.buildingId);
      if (!b) return false;
      const def = BUILDING_BY_ID[b.type];
      if (!def || VIRTUAL_BUILDINGS.has(b.type)) return true;
      if (cmd.workers < 0) {
        b.data.manual = false;
      } else {
        const max = b.type === 'rumeli-hisari' ? Math.round(hisarNominal(b) * HISAR.overstaffMax) : def.workersMax;
        const others = state.buildings.reduce((a, x) => a + (x !== b && x.data.manual === true ? x.workers : 0), 0);
        const pool = Math.max(0, state.workforce.total - (e.yol.active ? e.yol.workers : 0) - others);
        b.workers = Math.max(0, Math.min(max, pool, Math.round(cmd.workers)));
        b.data.manual = true;
      }
      assignWorkers(state);
      return true;
    }
    case 'ozel': {
      if (cmd.feature !== 'economy') return false;
      runEdirneAction(state, ctx, cmd.action as EdirneActionId, cmd.payload);
      return true;
    }
    default:
      return false;
  }
}

function runEdirneAction(state: GameState, ctx: SimContext, id: EdirneActionId, payload: unknown): void {
  const e = econ(state);
  const chk = edirneActionCheck(state, id, payload);
  if (!chk.ok) {
    notify(ctx, chk.reason ?? 'Yapılamaz.');
    return;
  }
  if (!spend(state, chk.cost)) {
    notify(ctx, 'Yetersiz kaynak.');
    return;
  }
  for (const r of RESOURCE_IDS) if (chk.cost[r]) addTo(e.today.consumed, r as ResourceId, chk.cost[r]!);
  const day = state.time.day;
  switch (id) {
    case 'yol-hazirla':
      e.yol.active = true;
      e.yol.workers = Math.min(ROAD_PROJECT.workers, state.workforce.total);
      addLog(state, 'bilgi', `${e.yol.workers} amele Edirne yolunu düzlemeye ve köprü kurmaya gitti.`);
      break;
    case 'yol-durdur':
      e.yol.active = false;
      e.yol.workers = 0;
      addLog(state, 'bilgi', 'Yoldaki amele geri çağrıldı.');
      break;
    case 'amele-topla': {
      const c = spawnCaravan(state, ctx.world, 'amele', {}, 0.25, AMELE_BATCH);
      ctx.bus.emit('caravan:departed', { id: c.id, kind: 'amele' });
      addLog(state, 'bilgi', `${AMELE_BATCH} amele ve usta yola çıktı.`);
      break;
    }
    case 'dokumhane-genislet':
      e.dokumhaneLevel += 1;
      addLog(state, 'basari', `Edirne dökümhanesi genişletildi (${e.dokumhaneLevel}. kademe).`);
      break;
    case 'vergi': {
      state.resources.akce += VERGI.akce;
      addTo(e.today.produced, 'akce', VERGI.akce);
      state.morale = Math.max(0, state.morale + VERGI.morale);
      state.divan = Math.max(-100, Math.min(100, state.divan + VERGI.divan));
      e.vergiReadyDay = day + (state.time.phase === 'hazirlik' ? VERGI.cooldownHazirlik : VERGI.cooldownKusatma);
      addLog(state, 'uyari', `Olağanüstü avarız vergisi toplandı: +${VERGI.akce} akçe. Halk ve asker hoşnutsuz.`);
      break;
    }
    case 'erzak-satin-al': {
      const n = erzakPurchaseAmount(state);
      const c = spawnCaravan(state, ctx.world, 'erzak', { erzak: n }, 0.2);
      ctx.bus.emit('caravan:departed', { id: c.id, kind: 'erzak' });
      addLog(state, 'bilgi', `${n} kişilik-günlük erzak satın alındı; kervan yolda.`);
      break;
    }
    case 'maden-satin-al': {
      const c = spawnCaravan(state, ctx.world, 'maden', { maden: 60 }, 0.2);
      ctx.bus.emit('caravan:departed', { id: c.id, kind: 'maden' });
      addLog(state, 'bilgi', '60 yük bakır ve kalay satın alındı; kervan yolda.');
      break;
    }
    case 'hisar-oncelik': {
      const k = (payload as { kule?: HisarTowerId | null } | undefined)?.kule ?? null;
      e.hisarPriority = k;
      addLog(state, 'bilgi', k ? `${HISAR.parts[k].name} önceliklendirildi.` : 'Kuleler arasında öncelik kaldırıldı.');
      break;
    }
    case 'hisar-ihsan':
      e.ihsanUntil = day + HISAR.ihsanDays;
      e.ihsanReadyDay = day + HISAR.ihsanCooldown;
      addLog(state, 'olay', 'Sultan, kulesini önce bitiren paşaya ihsan vaat etti. Saruca, Halil ve Zağanos paşalar yarışa girdi.');
      break;
    case 'otomatik-isci':
      for (const b of state.buildings) b.data.manual = false;
      addLog(state, 'bilgi', 'Amele yeniden otomatik dağıtılıyor.');
      break;
  }
  assignWorkers(state);
}

