/**
 * HUD view logic (pure — no DOM, no Phaser). Reads GameState through the
 * feature APIs and turns it into small view models for the components.
 * Every function tolerates empty/half-filled data from other features.
 */
import type { BuildingDef } from '../../core/defs';
import { FLAG } from '../../core/flags';
import type { Cannon, GameState, GroupStatus, OrderType, SectionId, ShipStatus, UnitGroup, UnitTypeId } from '../../core/state';
import type { RegionId, Terrain } from '../../core/world';
import { UNIT_TYPES } from '../../features/army/data';
import { inRange } from '../../features/artillery/api';
import { canAfford, erzakDays } from '../../features/economy/api';
import { BUILDINGS } from '../../features/economy/data';
import { fmtInt } from './format';

/** Run `fn`, returning `fallback` if a (possibly half-written) feature API throws. */
export function safe<T>(fn: () => T, fallback: T): T {
  try {
    const v = fn();
    return v === undefined ? fallback : v;
  } catch {
    return fallback;
  }
}

// ───────────────────────────── Names ─────────────────────────────

const UNIT_ADI_YEDEK: Record<UnitTypeId, string> = {
  yeniceri: 'Yeniçeriler',
  azap: 'Azaplar',
  sipahi: 'Tımarlı Sipahiler',
  basibozuk: 'Başıbozuklar',
  akinci: 'Akıncılar',
  topcu: 'Topçular',
  lagimci: 'Lağımcılar',
  mehter: 'Mehter',
};

/** Display name of a unit type (army data when present, fallback otherwise). */
export function unitTypeName(type: UnitTypeId): string {
  const def = safe(() => UNIT_TYPES[type], undefined);
  return def?.plural || def?.name || UNIT_ADI_YEDEK[type] || type;
}

export const ORDER_ADI: Record<OrderType, string> = {
  bekle: 'Bekliyor',
  git: 'Yürüyor',
  konuslan: 'Konuşlanıyor',
  'bombardimani-koru': 'Bombardımanı koruyor',
  'hendek-doldur': 'Hendek dolduruyor',
  'kuleyi-ilerlet': 'Kuleyi ilerletiyor',
  'lagim-kaz': 'Lağım kazıyor',
  hucum: 'Hücumda',
  'geri-cekil': 'Geri çekiliyor',
  kesif: 'Keşifte',
  'ikmal-koru': 'İkmal yolunu koruyor',
  dinlen: 'Dinleniyor',
};

export const GROUP_STATUS_ADI: Record<GroupStatus, string> = {
  bosta: 'Boşta',
  yuruyor: 'Yürüyor',
  calisiyor: 'Çalışıyor',
  savasiyor: 'Savaşıyor',
  cekiliyor: 'Çekiliyor',
  dagildi: 'Dağıldı',
  uzakta: 'Uzakta',
};

export const SHIP_STATUS_ADI: Record<ShipStatus, string> = {
  demirli: 'Demirli',
  seyir: 'Seyirde',
  savas: 'Savaşta',
  karada: 'Karada (kızakta)',
  batik: 'Battı',
  yaniyor: 'Yanıyor!',
};

export const SIDE_ADI: Record<string, string> = {
  osmanli: 'Osmanlı',
  bizans: 'Bizans',
  ceneviz: 'Ceneviz',
  venedik: 'Venedik',
};

export const MINE_STATUS_ADI: Record<string, string> = {
  kaziliyor: 'Kazılıyor',
  hazir: 'Hazır',
  cokertildi: 'Çökertildi',
  atesl: 'Ateşleniyor',
  basarili: 'Sur çöktü!',
};

export const TERRAIN_ADI: Record<Terrain, string> = {
  'derin-su': 'Derin su',
  su: 'Su',
  'sig-su': 'Sığlık',
  kum: 'Kumsal',
  cimen: 'Çayır',
  tarla: 'Tarla',
  orman: 'Orman',
  kaya: 'Kayalık',
  yol: 'Yol',
  sehir: 'Şehir',
  hendek: 'Hendek',
  sur: 'Sur',
};

export const REGION_ADI: Record<RegionId, string> = {
  'sur-ici': 'Kostantiniyye (sur içi)',
  galata: 'Galata (Ceneviz kolonisi)',
  halic: 'Haliç',
  bogaz: 'Boğaziçi',
  marmara: 'Marmara Denizi',
  trakya: 'Trakya — ordugâh',
  pera: 'Pera sırtları',
  'bogaz-avrupa': 'Boğaz’ın Rumeli yakası',
  anadolu: 'Anadolu yakası',
};

// ───────────────────────────── Checklists ─────────────────────────────

export interface CheckItem {
  label: string;
  ok: boolean;
  /** Optional detail (e.g. "38.000 / 50.000"). */
  detail?: string;
  /** Advisory only (does not block the action). */
  soft?: boolean;
}

const ORDU_HEDEF = 50000;

export function totalMen(s: GameState): number {
  let n = 0;
  for (const g of s.groups) if (g.status !== 'dagildi') n += g.men;
  return n;
}

/** H10 readiness checklist for "YOLA ÇIK". All items are advisory: the player may leave early. */
export function readinessChecklist(s: GameState): CheckItem[] {
  const men = totalMen(s);
  const days = safe(() => erzakDays(s), 0);
  const sahi = !!s.flags[FLAG.sahiDokuldu] || s.cannons.some((c) => c.type === 'sahi' && c.status !== 'dokuluyor');
  return [
    { label: 'Rumeli Hisarı tamamlandı', ok: !!s.flags[FLAG.hisarTamam], soft: true },
    { label: 'Şahi döküldü', ok: sahi, soft: true },
    { label: 'Ordu toplandı', ok: men >= ORDU_HEDEF, detail: `${fmtInt(men)} / ${fmtInt(ORDU_HEDEF)} asker`, soft: true },
    { label: 'Yeterli erzak (en az 30 gün)', ok: days >= 30, detail: Number.isFinite(days) ? `${Math.floor(days)} günlük` : 'bol', soft: true },
  ];
}

/** K18 advisory checklist for the final assault. */
export function sonHucumChecklist(s: GameState): CheckItem[] {
  const land = Object.values(s.sections).filter((w) => w.kind === 'kara');
  const best = land.reduce((m, w) => Math.max(m, w.breach), 0);
  const est = s.byz.estimatedDefenders || s.byz.defenders;
  return [
    { label: 'Kuşatma sürüyor', ok: s.time.phase === 'kusatma' },
    { label: 'Son hücum henüz ilan edilmedi', ok: !s.flags[FLAG.sonHucumIlan] },
    { label: 'Surda en az bir gedik (%50)', ok: best >= 0.5, detail: `en geniş: %${Math.round(best * 100)}`, soft: true },
    { label: 'Bizans direnci kırılmış', ok: s.byz.morale < 45 || est < 4500, detail: `moral %${Math.round(s.byz.morale)}`, soft: true },
    { label: 'Ordu morali yüksek', ok: s.morale >= 55, detail: `%${Math.round(s.morale)}`, soft: true },
  ];
}

export function checklistOk(items: CheckItem[]): boolean {
  return items.every((i) => i.ok || i.soft);
}

// ───────────────────────────── Selection helpers ─────────────────────────────

/** Cannons able to take a new target now that can reach the section. */
export function readyCannonsInRange(s: GameState, sectionId: SectionId): Cannon[] {
  return s.cannons.filter(
    (c) => (c.status === 'hazir' || c.status === 'soguyor') && c.tx >= 0 && safe(() => inRange(c, sectionId), false),
  );
}

/**
 * Best group of the given types for a job at a section: prefer the current
 * selection, then idle groups, then the nearest. Null if none exist.
 */
export function pickGroupFor(
  s: GameState,
  types: UnitTypeId[],
  at: { tx: number; ty: number } | null,
  selectedIds: number[] = [],
): UnitGroup | null {
  const usable = s.groups.filter((g) => types.includes(g.type) && g.status !== 'dagildi' && g.status !== 'uzakta' && g.men > 0);
  if (!usable.length) return null;
  const sel = usable.find((g) => selectedIds.includes(g.id));
  if (sel) return sel;
  const score = (g: UnitGroup) => (g.status === 'bosta' ? 0 : 1000) + (at ? Math.hypot(g.tx - at.tx, g.ty - at.ty) : 0);
  return usable.slice().sort((a, b) => score(a) - score(b))[0];
}

/** Order kinds the HUD can give, and whether each needs a wall-section target. */
export type HudOrder = 'hucum' | 'bombardimani-koru' | 'hendek-doldur' | 'lagim-kaz' | 'dinlen' | 'geri-cekil';

export const HUD_ORDERS: { id: HudOrder; label: string; key: string; needsSection: boolean; icon: string; only?: UnitTypeId[] }[] = [
  { id: 'hucum', label: 'Hücum', key: 'H', needsSection: true, icon: 'emir-hucum' },
  { id: 'bombardimani-koru', label: 'Bombardımanı Koru', key: 'K', needsSection: false, icon: 'emir-koru' },
  { id: 'hendek-doldur', label: 'Hendek Doldur', key: 'D', needsSection: true, icon: 'emir-hendek' },
  { id: 'lagim-kaz', label: 'Lağım Kaz', key: 'L', needsSection: true, icon: 'emir-lagim', only: ['lagimci'] },
  { id: 'dinlen', label: 'Dinlen', key: 'N', needsSection: false, icon: 'emir-dinlen' },
  { id: 'geri-cekil', label: 'Geri Çekil', key: 'G', needsSection: false, icon: 'emir-geri' },
];

// ───────────────────────────── Build menu ─────────────────────────────

const PHASE_ADI: Record<string, string> = { hazirlik: 'hazırlık', yuruyus: 'yürüyüş', kusatma: 'kuşatma', bitti: 'oyun sonu' };

const FLAG_ADI: Record<string, string> = {
  [FLAG.hisarTamam]: 'Rumeli Hisarı tamamlanmalı',
  [FLAG.orbanGeldi]: 'Orban hizmete girmeli',
  [FLAG.kusatmaBasladi]: 'Kuşatma başlamalı',
  [FLAG.gemilerKaradan]: 'Gemiler Haliç’e indirilmeli',
  [FLAG.sahiDokuldu]: 'Şahi dökülmeli',
};

export interface BuildItem {
  def: BuildingDef;
  /** Turkish lock reason, or null when it can be placed now. */
  locked: string | null;
  affordable: boolean;
}

export const CATEGORY_ADI: Record<string, string> = {
  uretim: 'Üretim',
  askeri: 'Askerî',
  ordugah: 'Ordugâh',
  ozel: 'Özel',
};

/** Placeable buildings (phase-aware) with lock reasons; virtual/scripted ones are hidden. */
export function buildMenuItems(s: GameState, defs: BuildingDef[] = BUILDINGS): BuildItem[] {
  const out: BuildItem[] = [];
  for (const def of defs) {
    if (!def || !def.phases || def.phases.length === 0) continue;
    let locked: string | null = null;
    if (!def.phases.includes(s.time.phase)) {
      locked = `${def.phases.map((p) => PHASE_ADI[p] ?? p).join(' ve ')} döneminde kurulur`;
      locked = locked.charAt(0).toLocaleUpperCase('tr') + locked.slice(1);
    } else {
      const miss = (def.requires ?? []).find((f) => !s.flags[f]);
      if (miss) locked = FLAG_ADI[miss] ?? 'Henüz kilidi açılmadı';
      else if (def.unique && s.buildings.some((b) => b.type === def.id)) locked = 'Yalnızca bir tane olabilir';
    }
    out.push({ def, locked, affordable: safe(() => canAfford(s, def.cost), false) });
  }
  return out;
}

// ───────────────────────────── Toasts ─────────────────────────────

export type ToastKind = 'bilgi' | 'uyari' | 'basari' | 'tehlike' | 'olay';

/** Which log kinds deserve a toast (others only appear in the Günlük). */
export function logToToastKind(kind: string): ToastKind | null {
  switch (kind) {
    case 'basari':
      return 'basari';
    case 'kayip':
      return 'tehlike';
    case 'casus':
      return 'bilgi';
    default:
      return null;
  }
}

/**
 * De-duplicating toast queue: identical text within `windowMs` is merged
 * (count++). Pure so it can be unit-tested; the component owns the instance.
 */
export interface ToastItem {
  id: number;
  text: string;
  kind: ToastKind;
  title?: string;
  born: number;
  count: number;
}

export class ToastQueue {
  items: ToastItem[] = [];
  private seq = 0;
  constructor(
    public max = 5,
    public ttlMs = 6500,
    public windowMs = 4000,
  ) {}

  push(text: string, kind: ToastKind, now: number, title?: string): ToastItem {
    const dup = this.items.find((t) => t.text === text && now - t.born < this.windowMs);
    if (dup) {
      dup.count++;
      dup.born = now;
      return dup;
    }
    const t: ToastItem = { id: ++this.seq, text, kind, title, born: now, count: 1 };
    this.items.push(t);
    while (this.items.length > this.max) this.items.shift();
    return t;
  }

  /** Remove expired toasts; danger/event toasts live longer. */
  prune(now: number): boolean {
    const before = this.items.length;
    this.items = this.items.filter((t) => now - t.born < this.ttlMs * (t.kind === 'tehlike' || t.kind === 'olay' ? 1.6 : 1));
    return this.items.length !== before;
  }

  remove(id: number): void {
    this.items = this.items.filter((t) => t.id !== id);
  }
}

// ───────────────────────────── Minimap ─────────────────────────────

/** Section line color by breach (intact stone → cracked amber → open red). */
export function breachColor(breach: number): string {
  if (breach >= 0.5) return '#f26a5a';
  if (breach >= 0.25) return '#f8902a';
  if (breach >= 0.08) return '#f2d65a';
  return '#ece4cf';
}

export const SIDE_COLOR: Record<string, string> = {
  osmanli: '#dd3a3a',
  bizans: '#b67cc8',
  ceneviz: '#fbf8f0',
  venedik: '#f2d65a',
};

/** Convert the camera's world-pixel view into a tile-space quad (iso → minimap). */
export function viewQuad(
  v: { x: number; y: number; w: number; h: number },
  toTile: (wx: number, wy: number) => { tx: number; ty: number },
): { tx: number; ty: number }[] {
  return [toTile(v.x, v.y), toTile(v.x + v.w, v.y), toTile(v.x + v.w, v.y + v.h), toTile(v.x, v.y + v.h)];
}
