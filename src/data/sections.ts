import type { SectionKind } from '../core/state';
import type { LatLon } from './geography';

/**
 * WALL SECTIONS — the units of siege. Land sections follow LAND_WALLS between
 * gate anchors; sea sections follow the coastline between `from` and `to`.
 * Defender notes follow the generally accepted reconstruction; items marked
 * "(doğrulanacak)" need source verification.
 */
export interface SectionDef {
  id: string;
  name: string;
  kind: SectionKind;
  /** Polyline (land) or endpoints along the coast (sea). NORTH→SOUTH / clockwise. */
  path: LatLon[];
  /** Historical defenders at the start of the siege (approx. share of ~7,000). */
  defenders: number;
  commander?: string;
  /** Wall strength multiplier (single Blachernae wall weaker vs. cannon but on a hill, etc.). */
  strength: number;
  /** Has a moat (hendek) in front. */
  moat: boolean;
  note?: string;
}

export const SECTIONS: SectionDef[] = [
  // ───────── Land walls (Golden Horn → Marmara) ─────────
  {
    id: 'kara-blahernai',
    name: 'Blahernai Surları',
    kind: 'kara',
    path: [[41.0428, 28.9443], [41.0402, 28.9428], [41.036, 28.9418]],
    defenders: 600,
    commander: 'Venedikliler (Minotto)',
    strength: 0.85,
    moat: false,
    note: 'Tek kat sur; saray bölgesi.',
  },
  {
    id: 'kara-egrikapi',
    name: 'Eğrikapı — Tekfur Sarayı',
    kind: 'kara',
    path: [[41.036, 28.9418], [41.0335, 28.9405]],
    defenders: 450,
    strength: 0.95,
    moat: false,
    note: 'Kerkoporta bu bölgede.',
  },
  {
    id: 'kara-edirnekapi',
    name: 'Edirnekapı',
    kind: 'kara',
    path: [[41.0335, 28.9405], [41.0297, 28.9339]],
    defenders: 500,
    strength: 1.0,
    moat: true,
  },
  {
    id: 'kara-lykos',
    name: 'Mesoteikhion (Lykos Vadisi)',
    kind: 'kara',
    path: [[41.0297, 28.9339], [41.0245, 28.927]],
    defenders: 900,
    commander: 'Konstantinos XI ve Giustiniani',
    strength: 0.9,
    moat: true,
    note: 'Vadide alçak kalan, en zayıf kesim; asıl hücum burada.',
  },
  {
    id: 'kara-topkapi',
    name: 'Topkapı (St. Romanus)',
    kind: 'kara',
    path: [[41.0245, 28.927], [41.0197, 28.9218]],
    defenders: 800,
    commander: 'Giustiniani',
    strength: 1.0,
    moat: true,
    note: 'Fatih\'in otağı karşısında; büyük top bu kesimi dövdü.',
  },
  {
    id: 'kara-mevlevihane',
    name: 'Mevlevihanekapı',
    kind: 'kara',
    path: [[41.0197, 28.9218], [41.0135, 28.918]],
    defenders: 450,
    strength: 1.05,
    moat: true,
  },
  {
    id: 'kara-silivrikapi',
    name: 'Silivrikapı',
    kind: 'kara',
    path: [[41.0135, 28.918], [41.008, 28.9165]],
    defenders: 400,
    strength: 1.1,
    moat: true,
  },
  {
    id: 'kara-belgradkapi',
    name: 'Belgradkapı',
    kind: 'kara',
    path: [[41.008, 28.9165], [41.001, 28.92]],
    defenders: 350,
    strength: 1.1,
    moat: true,
  },
  {
    id: 'kara-yedikule',
    name: 'Altınkapı',
    kind: 'kara',
    path: [[41.001, 28.92], [40.9945, 28.9225], [40.9928, 28.9232]],
    defenders: 350,
    strength: 1.15,
    moat: true,
  },

  // ───────── Golden Horn sea walls (Ayvansaray → Sarayburnu) ─────────
  {
    id: 'halic-balat',
    name: 'Haliç Surları — Balat',
    kind: 'halic',
    path: [[41.043, 28.944], [41.032, 28.95]],
    defenders: 300,
    strength: 0.9,
    moat: false,
  },
  {
    id: 'halic-fener',
    name: 'Haliç Surları — Fener (Petrion)',
    kind: 'halic',
    path: [[41.032, 28.95], [41.023, 28.96]],
    defenders: 300,
    commander: 'Loukas Notaras',
    strength: 0.9,
    moat: false,
  },
  {
    id: 'halic-eminonu',
    name: 'Haliç Surları — Eminönü',
    kind: 'halic',
    path: [[41.023, 28.96], [41.0168, 28.979]],
    defenders: 250,
    strength: 0.9,
    moat: false,
  },

  // ───────── Marmara sea walls (Sarayburnu → Yedikule) ─────────
  {
    id: 'marmara-akropolis',
    name: 'Marmara Surları — Akropolis',
    kind: 'marmara',
    path: [[41.017, 28.9855], [41.0065, 28.985]],
    defenders: 200,
    strength: 1.0,
    moat: false,
  },
  {
    id: 'marmara-kumkapi',
    name: 'Marmara Surları — Kontoskalion',
    kind: 'marmara',
    path: [[41.0065, 28.985], [41.0045, 28.965]],
    defenders: 200,
    strength: 1.0,
    moat: false,
  },
  {
    id: 'marmara-yenikapi',
    name: 'Marmara Surları — Theodosius Limanı',
    kind: 'marmara',
    path: [[41.0045, 28.965], [40.9985, 28.938]],
    defenders: 250,
    commander: 'Orhan Çelebi (doğrulanacak)',
    strength: 1.0,
    moat: false,
  },
  {
    id: 'marmara-samatya',
    name: 'Marmara Surları — Samatya',
    kind: 'marmara',
    path: [[40.9985, 28.938], [40.9928, 28.9232]],
    defenders: 200,
    strength: 1.0,
    moat: false,
  },
];

export const SECTION_BY_ID: Record<string, SectionDef> = Object.fromEntries(SECTIONS.map((s) => [s.id, s]));
