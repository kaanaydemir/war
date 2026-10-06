/**
 * Bibliography. Event cards and encyclopedia entries cite these ids.
 * Osmanlı kaynakları esas; diğerleri kontrol amaçlı.
 */
export interface SourceDef {
  id: string;
  author: string;
  title: string;
  group: 'osmanli' | 'belge' | 'modern' | 'kontrol';
  note?: string;
}

export const SOURCES: SourceDef[] = [
  { id: 'tursun', author: 'Tursun Bey', title: 'Târîh-i Ebü\'l-Feth', group: 'osmanli', note: 'Kuşatmada bizzat bulunmuş.' },
  { id: 'apz', author: 'Aşıkpaşazade', title: 'Tevârîh-i Âl-i Osmân', group: 'osmanli' },
  { id: 'kivami', author: 'Kıvâmî', title: 'Fetihnâme-i Sultan Mehmed', group: 'osmanli' },
  { id: 'nesri', author: 'Neşrî', title: 'Kitâb-ı Cihan-nümâ', group: 'osmanli' },
  { id: 'kritovulos', author: 'Kritovoulos', title: 'Tarih-i Sultan Mehmed Han-ı Sânî', group: 'osmanli', note: 'Eserini Fatih\'e sunmuş bir Rum.' },
  { id: 'aksemseddin', author: 'Akşemseddin', title: 'Fatih\'e kuşatma sırasında yazılan mektup', group: 'belge' },
  { id: 'fetihname', author: 'II. Mehmed', title: 'Fetihnâmeler', group: 'belge' },
  { id: 'tansel', author: 'Selâhattin Tansel', title: 'Osmanlı Kaynaklarına Göre Fatih Sultan Mehmed\'in Siyasi ve Askeri Faaliyeti', group: 'modern' },
  { id: 'emecen', author: 'Feridun M. Emecen', title: 'İstanbul\'un Fethi Olayı ve Meseleleri', group: 'modern' },
  { id: 'emecen2', author: 'Feridun M. Emecen', title: 'Fetih ve Kıyamet 1453', group: 'modern' },
  { id: 'inalcik', author: 'Halil İnalcık', title: 'Fatih Devri Üzerinde Tetkikler ve Vesikalar', group: 'modern' },
  { id: 'barbaro', author: 'Nicolò Barbaro', title: 'Kuşatma Günlüğü', group: 'kontrol' },
  { id: 'sphrantzes', author: 'Georgios Sphrantzes', title: 'Chronicon Minus', group: 'kontrol' },
  { id: 'doukas', author: 'Doukas', title: 'Historia Turco-Byzantina', group: 'kontrol' },
  { id: 'leonardo', author: 'Sakızlı Leonardo', title: 'Papa\'ya mektup', group: 'kontrol' },
];

export const SOURCE_BY_ID: Record<string, SourceDef> = Object.fromEntries(SOURCES.map((s) => [s.id, s]));
