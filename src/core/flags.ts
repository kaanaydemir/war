/**
 * Cross-feature progression flags stored in `state.flags`.
 * The owning feature SETS the flag; any feature (esp. events) may READ it.
 * Add new cross-feature flags here; feature-internal flags belong in the feature's own state.
 */
export const FLAG = {
  // ── Hazırlık ──
  /** economy: Rumeli Hisarı fully built (boolean). */
  hisarTamam: 'hisarTamam',
  /** economy: Rumeli Hisarı build progress 0..1 (number). */
  hisarIlerleme: 'hisarIlerleme',
  /** events/navy: Bosphorus under Ottoman control (boolean). */
  bogazKontrol: 'bogazKontrol',
  /** events: Hungary truce signed (boolean). */
  macarAteskes: 'macarAteskes',
  /** events: Venice treaty (boolean). */
  venedikAntlasma: 'venedikAntlasma',
  /** events: Rizzo decision — 'batir' | 'birak'. */
  rizzoKarari: 'rizzoKarari',
  /** events: Turahan Bey sent to Morea (boolean). */
  moraSeferi: 'moraSeferi',
  /** artillery: Orban hired (boolean). */
  orbanGeldi: 'orbanGeldi',
  /** artillery: great bombard cast (boolean). */
  sahiDokuldu: 'sahiDokuldu',
  /** artillery: great bombard in position at the walls (boolean). */
  sahiCephede: 'sahiCephede',
  /** economy: Edirne road prepared 0..1 (number) — speeds bombard transport. */
  yolHazirligi: 'yolHazirligi',
  /** army: Thracian Byzantine towns taken (boolean). */
  trakyaAlindi: 'trakyaAlindi',
  /** game: army departed Edirne (boolean). */
  yolaCikildi: 'yolaCikildi',

  // ── Kuşatma ──
  /** game: siege started (boolean). */
  kusatmaBasladi: 'kusatmaBasladi',
  /** navy: Golden Horn chain is in place (boolean). */
  zincirGerili: 'zincirGerili',
  /** navy: result of 20 Nisan battle — 'yarildi' (relief ships got through) | 'durduruldu'. */
  denizSavasi: 'denizSavasi',
  /** navy: ships hauled overland into the Golden Horn (boolean). */
  gemilerKaradan: 'gemilerKaradan',
  /** navy: pontoon bridge over the Golden Horn (boolean). */
  halicKoprusu: 'halicKoprusu',
  /** siegeworks: at least one mine started (boolean). */
  lagimBasladi: 'lagimBasladi',
  /** siegeworks: siege tower built / burned (boolean). */
  kuleYapildi: 'kuleYapildi',
  kuleYandi: 'kuleYandi',
  /** events: surrender offer sent & refused (boolean). */
  teslimTeklifi: 'teslimTeklifi',
  /** army: final assault declared (boolean). */
  sonHucumIlan: 'sonHucumIlan',
  /** army: final assault in progress (boolean). */
  sonHucum: 'sonHucum',
  /** army: current final-assault wave 0..3 (number). */
  hucumDalgasi: 'hucumDalgasi',
  /** byzantium: Giustiniani wounded (boolean). */
  giustinianiYarali: 'giustinianiYarali',
  /** army: Kerkoporta found open (boolean). */
  kerkoporta: 'kerkoporta',
  /** army: Ulubatlı Hasan planted the banner (boolean). */
  sancakDikildi: 'sancakDikildi',
  /** game: the city has fallen (boolean). */
  sehirDustu: 'sehirDustu',
} as const;

export type FlagKey = (typeof FLAG)[keyof typeof FLAG];
