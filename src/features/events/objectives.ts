import { d, dayFrac, formatDate } from '../../core/calendar';
import { FLAG } from '../../core/flags';
import type { GameState } from '../../core/state';
import { landmarkTile, type LandmarkId } from '../../data/landmarks';
import { SECTION_BY_ID } from '../../data/sections';
import { erzakDays } from '../economy/api';
import { sectionCenter } from '../fortifications/api';
import { EVENT_X_BY_ID } from './data';
import { clamp, flag, priv, siegeDay, totalMen } from './effects';

export interface ObjectiveX {
  id: string;
  text: string;
  done: boolean;
  progress?: number;
  focus?: { tx: number; ty: number };
  /** Optional (side) objective. */
  optional?: boolean;
}

/** Rough target for "army gathered" (men on the map). */
export const ORDU_HEDEF = 50000;
const MARCH_DAYS = 13;

const lm = (id: LandmarkId) => landmarkTile(id);
const num = (v: unknown): number => (typeof v === 'number' ? v : v === true ? 1 : 0);

export function objectivesFor(s: GameState): ObjectiveX[] {
  const out: ObjectiveX[] = [];
  const ph = s.time.phase;
  if (ph === 'hazirlik') {
    const hisarP = flag(s, FLAG.hisarTamam) ? 1 : clamp(num(s.flags[FLAG.hisarIlerleme]), 0, 1);
    out.push({ id: 'hisar', text: 'Rumeli Hisarı’nı (Boğazkesen) tamamla', done: flag(s, FLAG.hisarTamam), progress: hisarP, focus: lm('rumeliHisari') });
    out.push({ id: 'orban', text: 'Dökümcü Orban’ı Edirne’ye getir', done: flag(s, FLAG.orbanGeldi) });
    if (flag(s, FLAG.orbanGeldi) || s.time.day >= d(1, 9, 1452)) {
      const casting = s.cannons.find((c) => c.type === 'sahi');
      out.push({
        id: 'sahi',
        text: 'Şahi topunu dök ve Edirne’de dene',
        done: flag(s, FLAG.sahiDokuldu),
        progress: flag(s, FLAG.sahiDokuldu) ? 1 : casting ? clamp(casting.progress, 0, 1) : 0,
      });
    }
    const men = totalMen(s);
    out.push({ id: 'ordu', text: 'Orduyu topla: tımar çağrısı, kapıkulu ve gönüllüler', done: men >= ORDU_HEDEF, progress: clamp(men / ORDU_HEDEF, 0, 1) });
    if (flag(s, FLAG.sahiDokuldu) || s.time.day >= d(1, 12, 1452)) {
      const road = clamp(num(s.flags[FLAG.yolHazirligi]), 0, 1);
      out.push({ id: 'yol', text: 'Büyük top için Edirne yolunu düzelt', done: road >= 0.99, progress: road, focus: lm('edirneYolu') });
    }
    if (s.time.day >= d(1, 11, 1452)) {
      out.push({ id: 'trakya', text: 'Trakya’daki Bizans kasabalarını al', done: flag(s, FLAG.trakyaAlindi), optional: true });
    }
    if (s.time.day >= d(1, 2, 1453) || (flag(s, FLAG.hisarTamam) && flag(s, FLAG.sahiDokuldu))) {
      out.push({ id: 'hareket', text: `Edirne’den yola çık (tarihte ${formatDate(d(23, 3, 1453))})`, done: flag(s, FLAG.yolaCikildi) });
    }
    return out;
  }
  if (ph === 'yuruyus') {
    const start = s.time.marchStartDay ?? s.time.day;
    out.push({ id: 'yuruyus', text: 'Ordu yolda: surların önüne var', done: false, progress: clamp((s.time.day - start) / MARCH_DAYS, 0, 1) });
    const sahi = s.cannons.find((c) => c.type === 'sahi');
    if (sahi && sahi.status === 'yolda') out.push({ id: 'sahi-yolda', text: 'Büyük top yolda', done: false, progress: clamp(sahi.progress, 0, 1) });
    return out;
  }
  if (ph !== 'kusatma') return out;

  const gun = siegeDay(s);
  // 1. guns emplaced
  const guns = s.cannons.filter((c) => c.status !== 'dokuluyor');
  const ready = guns.filter((c) => c.status === 'hazir' || c.status === 'soguyor').length;
  const gunsP = guns.length ? ready / guns.length : flag(s, FLAG.sahiCephede) ? 1 : 0;
  out.push({ id: 'top-mevzi', text: 'Topları surların karşısına mevzilendir', done: flag(s, FLAG.sahiCephede) && gunsP >= 0.99, progress: gunsP, focus: lm('topkapi') });

  // 2. breach
  const land = Object.values(s.sections).filter((w) => w.kind === 'kara');
  const worst = land.slice().sort((a, b) => b.breach - a.breach)[0];
  const maxBreach = worst ? worst.breach : 0;
  out.push({
    id: 'gedik',
    text: worst && maxBreach > 0.05 ? `Surda gedik aç (en yıpranmış: ${worst.name})` : 'Surda gedik aç',
    done: maxBreach >= 0.5,
    progress: clamp(maxBreach / 0.5, 0, 1),
    focus: worst && maxBreach > 0.05 ? sectionCenter(worst.id) : lm('topkapi'),
  });

  // 3. moat in front of the most damaged moated section
  const moated = land.filter((w) => SECTION_BY_ID[w.id]?.moat).sort((a, b) => b.breach - a.breach)[0];
  if (moated) {
    out.push({
      id: 'hendek',
      text: `Hendeği doldur (${moated.name})`,
      done: moated.moatFill >= 0.8,
      progress: clamp(moated.moatFill / 0.8, 0, 1),
      focus: sectionCenter(moated.id),
    });
  }

  // 4. ships overland
  if (gun >= 4 || s.events.fired['k5-deniz-savasi'] != null) {
    out.push({ id: 'gemiler', text: 'Gemileri karadan Haliç’e indir', done: flag(s, FLAG.gemilerKaradan), focus: lm('diplokionion') });
  }
  // 5. bridge (optional)
  if (flag(s, FLAG.gemilerKaradan)) {
    out.push({ id: 'kopru', text: 'Haliç’e fıçılardan köprü kur', done: flag(s, FLAG.halicKoprusu), optional: true, focus: lm('ayvansaray') });
  }
  // 6. mines
  if (gun >= 12 || flag(s, FLAG.lagimBasladi)) {
    const best = s.mines.reduce((m, x) => Math.max(m, x.status === 'cokertildi' ? 0 : x.progress), 0);
    const ok = s.mines.some((m) => m.status === 'basarili');
    out.push({ id: 'lagim', text: 'Sur altına lağım kaz', done: ok, progress: ok ? 1 : best, optional: true, focus: lm('egrikapi') });
  }
  // 7. final assault
  const assaultP = clamp(Math.min(1, maxBreach / 0.5) * 0.5 + clamp((70 - s.byz.morale) / 50, 0, 1) * 0.5, 0, 1);
  out.push({ id: 'son-hucum', text: 'Son hücumu ilan et', done: flag(s, FLAG.sonHucumIlan), progress: flag(s, FLAG.sonHucumIlan) ? 1 : assaultP, focus: lm('otag') });
  if (flag(s, FLAG.sonHucumIlan)) out.push({ id: 'sehir', text: 'Şehri al', done: flag(s, FLAG.sehirDustu), focus: lm('sulukule') });

  // 8. the clock
  const r = s.relief;
  if (!r.arrived && s.time.siegeStartDay != null) {
    const span = Math.max(1, r.knownMin - s.time.siegeStartDay);
    out.push({
      id: 'yardim',
      text: `Haçlı yardımı gelmeden bitir (en erken ≈${formatDate(r.knownMin)})`,
      done: flag(s, FLAG.sehirDustu),
      progress: clamp((s.time.day - s.time.siegeStartDay) / span, 0, 1),
    });
  }
  return out;
}

// ───────────────────────────── Tips ─────────────────────────────

export interface TipX {
  id: string;
  title: string;
  text: string;
}

interface TipDef extends TipX {
  when: (s: GameState) => boolean;
}

const TIPS: TipDef[] = [
  {
    id: 'kart',
    title: 'Karar kartları',
    text: 'Her kartta “Tarihte ne oldu?” notu var; tarihte yapılan seçim işaretlidir. Seçimini yapınca oyun kaldığı yerden sürer.',
    when: (s) => {
      const a = s.events.active;
      return !!a && !!EVENT_X_BY_ID[a.eventId]?.choices?.length;
    },
  },
  {
    id: 'zaman',
    title: 'Zaman',
    text: 'Oyun gerçek takvimle akar. Hız düğmeleriyle durdurabilir ya da 3× hızlandırabilirsin; önemli olaylarda oyun kendiliğinden durur.',
    when: (s) => s.time.phase === 'hazirlik' && s.time.day < d(10, 4, 1452),
  },
  {
    id: 'hisar',
    title: 'Boğazkesen',
    text: 'Rumeli Hisarı’na işçi ata; taş ocağı ve kereste kampı kur. Hisar bitince Boğaz kapanır ve şehrin erzakı azalmaya başlar.',
    when: (s) => s.time.phase === 'hazirlik' && !flag(s, FLAG.hisarTamam) && s.time.day >= d(15, 4, 1452),
  },
  {
    id: 'orban',
    title: 'Şahi topu',
    text: 'Edirne panelinden dökümhaneye maden ve akçe ayır. Büyük top için Orban usta şart; dökümden sonra topun cepheye taşınması da hazırlık ister.',
    when: (s) => flag(s, FLAG.orbanGeldi) && !flag(s, FLAG.sahiDokuldu),
  },
  {
    id: 'divan',
    title: 'Divan dengesi',
    text: 'Barış kanadı güçleniyor. Zaferler ve Zağanos Paşa’nın işleri dengeyi savaşa, yenilgiler ve ağır kayıplar barışa çeker. Denge çökerse kuşatma kaldırılır.',
    when: (s) => s.divan < -25,
  },
  {
    id: 'erzak',
    title: 'Erzak azalıyor',
    text: 'Kafileleri koru, çevre köylerden ve denizden erzak getir. Aç asker çabuk dağılır.',
    when: (s) => {
      const e = erzakDays(s);
      return Number.isFinite(e) && e < 15;
    },
  },
  {
    id: 'bombardiman',
    title: 'Bombardıman',
    text: 'Topları seç ve bir sur bölümüne sağ tıkla. Aynı kesimi dövmek gediği daha hızlı açar; Bizans geceleri gedikleri onarır.',
    when: (s) => s.time.phase === 'kusatma' && siegeDay(s) <= 3,
  },
  {
    id: 'gece',
    title: 'Gece',
    text: 'Geceleri Bizans gedikleri barikatla kapatır. Lağımcılar gece daha zor fark edilir; gemiler karadan gece geçirilir.',
    when: (s) => s.time.phase === 'kusatma' && dayFrac(s.time.day) >= 0.66 && siegeDay(s) <= 5,
  },
  {
    id: 'gedik',
    title: 'Gedik açıldı',
    text: 'Hendeği azaplarla doldur, sonra hücum et. Son hücumu yalnızca Sultan ilan eder: en az bir gedik ve kırılmış bir Bizans direnci gerekir.',
    when: (s) => s.time.phase === 'kusatma' && !flag(s, FLAG.sonHucumIlan) && Object.values(s.sections).some((w) => w.breach >= 0.5),
  },
  {
    id: 'galata',
    title: 'Galata',
    text: 'Cenevizliler küsmüş. Galata sakin olmazsa gemileri karadan geçirmek ve haber almak zorlaşır.',
    when: (s) => s.time.phase === 'kusatma' && s.galata < -20,
  },
  {
    id: 'moral',
    title: 'Moral',
    text: 'Mehter, Sultan’ın ordugâhı dolaşması ve bahşiş morali yükseltir; başarısız hücumlar ve açlık düşürür.',
    when: (s) => s.morale < 40,
  },
  {
    id: 'yardim',
    title: 'Haçlı yardımı yaklaşıyor',
    text: 'Tahmini geliş aralığı daralıyor. Yardım yetişmeden son hücumu ilan etmelisin.',
    when: (s) => s.time.phase === 'kusatma' && !s.relief.arrived && s.time.day >= s.relief.knownMin - 10,
  },
];

/** Up to `max` situational tips the player has not dismissed. */
export function tipsFor(s: GameState, max = 2): TipX[] {
  const dismissed = priv(s).dismissedTips;
  if (dismissed.includes('*')) return [];
  const out: TipX[] = [];
  for (const t of TIPS) {
    if (out.length >= max) break;
    if (dismissed.includes(t.id)) continue;
    let ok = false;
    try {
      ok = t.when(s);
    } catch {
      ok = false;
    }
    if (ok) out.push({ id: t.id, title: t.title, text: t.text });
  }
  return out;
}

export const TIP_IDS = TIPS.map((t) => t.id);
