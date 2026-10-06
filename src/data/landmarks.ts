import { geoToTile } from './geography';
import type { TilePt } from '../core/iso';

/**
 * Named places with real approximate coordinates. Every feature that places
 * something "at" a historical location must use these.
 */
export interface Landmark {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** Short description for tooltips / encyclopedia links. */
  note?: string;
}

export const LANDMARKS = {
  rumeliHisari: { id: 'rumeliHisari', name: 'Rumeli Hisarı (Boğazkesen)', lat: 41.0847, lon: 29.0535, note: '1452, 4,5 ayda inşa edildi' },
  anadoluHisari: { id: 'anadoluHisari', name: 'Anadolu Hisarı', lat: 41.0823, lon: 29.0685, note: 'Yıldırım Bayezid döneminde yapıldı' },
  galataKulesi: { id: 'galataKulesi', name: 'Galata Kulesi', lat: 41.0256, lon: 28.9741, note: 'Ceneviz kolonisi Galata' },
  ayasofya: { id: 'ayasofya', name: 'Ayasofya', lat: 41.0086, lon: 28.9802 },
  hipodrom: { id: 'hipodrom', name: 'Hipodrom', lat: 41.0057, lon: 28.9752 },
  buyukSaray: { id: 'buyukSaray', name: 'Büyük Saray (harabe)', lat: 41.0045, lon: 28.977 },
  akropolis: { id: 'akropolis', name: 'Akropolis (Sarayburnu)', lat: 41.0135, lon: 28.984 },
  havariyun: { id: 'havariyun', name: 'Havariyun Kilisesi', lat: 41.0193, lon: 28.9497 },
  valens: { id: 'valens', name: 'Valens Su Kemeri', lat: 41.0155, lon: 28.9555 },
  kariye: { id: 'kariye', name: 'Kariye (Khora)', lat: 41.0313, lon: 28.939 },
  pantokrator: { id: 'pantokrator', name: 'Pantokrator Manastırı', lat: 41.02, lon: 28.96 },
  blahernaiSarayi: { id: 'blahernaiSarayi', name: 'Blahernai Sarayı', lat: 41.0405, lon: 28.9435 },
  tekfurSarayi: { id: 'tekfurSarayi', name: 'Tekfur Sarayı', lat: 41.0338, lon: 28.9412 },
  theodosiusLimani: { id: 'theodosiusLimani', name: 'Theodosius Limanı', lat: 41.0045, lon: 28.955 },
  kontoskalion: { id: 'kontoskalion', name: 'Kontoskalion Limanı', lat: 41.0048, lon: 28.966 },
  eugeniusKulesi: { id: 'eugeniusKulesi', name: 'Eugenius Kulesi (zincir ucu)', lat: 41.0166, lon: 28.9785 },

  // Gates of the land walls
  ayvansaray: { id: 'ayvansaray', name: 'Ayvansaray', lat: 41.0428, lon: 28.9443 },
  egrikapi: { id: 'egrikapi', name: 'Eğrikapı', lat: 41.036, lon: 28.9418 },
  kerkoporta: { id: 'kerkoporta', name: 'Kerkoporta', lat: 41.0332, lon: 28.9398 },
  edirnekapi: { id: 'edirnekapi', name: 'Edirnekapı', lat: 41.0297, lon: 28.9339 },
  sulukule: { id: 'sulukule', name: 'Sulukule (Lykos vadisi)', lat: 41.0245, lon: 28.927 },
  topkapi: { id: 'topkapi', name: 'Topkapı (St. Romanus)', lat: 41.0197, lon: 28.9218 },
  mevlevihanekapi: { id: 'mevlevihanekapi', name: 'Mevlevihanekapı', lat: 41.0135, lon: 28.918 },
  silivrikapi: { id: 'silivrikapi', name: 'Silivrikapı', lat: 41.008, lon: 28.9165 },
  belgradkapi: { id: 'belgradkapi', name: 'Belgradkapı', lat: 41.001, lon: 28.92 },
  yedikule: { id: 'yedikule', name: 'Altınkapı / Yedikule', lat: 40.9945, lon: 28.9225 },

  // Ottoman positions
  otag: { id: 'otag', name: 'Fatih\'in otağı (Maltepe)', lat: 41.0185, lon: 28.906 },
  karacaKarargah: { id: 'karacaKarargah', name: 'Karaca Paşa (Rumeli askerleri)', lat: 41.036, lon: 28.925 },
  ishakKarargah: { id: 'ishakKarargah', name: 'İshak Paşa (Anadolu askerleri)', lat: 41.005, lon: 28.905 },
  zaganosKarargah: { id: 'zaganosKarargah', name: 'Zağanos Paşa (Galata sırtları)', lat: 41.042, lon: 28.968 },
  diplokionion: { id: 'diplokionion', name: 'Diplokionion (Beşiktaş) — Osmanlı donanması', lat: 41.04, lon: 29.0045 },
  kasimpasa: { id: 'kasimpasa', name: 'Kasımpaşa', lat: 41.0365, lon: 28.9645 },
  edirneYolu: { id: 'edirneYolu', name: 'Edirne Yolu', lat: 41.044, lon: 28.887 },
  kagithane: { id: 'kagithane', name: 'Kağıthane', lat: 41.062, lon: 28.944 },
  besiktas: { id: 'besiktas', name: 'Beşiktaş', lat: 41.042, lon: 29.006 },
  uskudar: { id: 'uskudar', name: 'Üsküdar', lat: 41.025, lon: 29.02 },
} satisfies Record<string, Landmark>;

export type LandmarkId = keyof typeof LANDMARKS;

export function landmarkTile(id: LandmarkId): TilePt {
  const l = LANDMARKS[id];
  return geoToTile(l.lat, l.lon);
}
