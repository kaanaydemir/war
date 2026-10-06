import { DAY_SEGMENTS, EPOCH } from './constants';

/** Calendar math. Day index 0 = 1 Mart 1452 (Julian calendar, as used by the sources). */

export const AY_ADLARI = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
] as const;

export interface CalendarDate {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
}

function isLeap(y: number): boolean {
  // Julian calendar: every 4th year.
  return y % 4 === 0;
}

function daysInMonth(y: number, m: number): number {
  return [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

/** Convert an absolute day index (may be fractional) to a calendar date. */
export function dayToDate(dayIndex: number): CalendarDate {
  let d = Math.floor(dayIndex);
  let y: number = EPOCH.year;
  let m: number = EPOCH.month;
  let day: number = EPOCH.day;
  while (d > 0) {
    const left = daysInMonth(y, m) - day;
    if (d <= left) {
      day += d;
      d = 0;
    } else {
      d -= left + 1;
      day = 1;
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
  }
  return { year: y, month: m, day };
}

/** Convert a calendar date to an absolute day index (integer, start of that day). */
export function dateToDay(date: CalendarDate): number {
  let n = 0;
  let y: number = EPOCH.year;
  let m: number = EPOCH.month;
  let day: number = EPOCH.day;
  // walk months (small ranges only — fine for 1452–1454)
  while (y < date.year || (y === date.year && m < date.month)) {
    n += daysInMonth(y, m) - day + 1;
    day = 1;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return n + (date.day - day);
}

/** Shorthand: d(6, 4, 1453) → day index of 6 Nisan 1453. */
export function d(day: number, month: number, year: number): number {
  return dateToDay({ year, month, day });
}

export function formatDate(dayIndex: number): string {
  const c = dayToDate(dayIndex);
  return `${c.day} ${AY_ADLARI[c.month - 1]} ${c.year}`;
}

/** Fraction of the current day in [0,1). 0 = start of dawn. */
export function dayFrac(dayIndex: number): number {
  return dayIndex - Math.floor(dayIndex);
}

export type DaySegment = keyof typeof DAY_SEGMENTS;

export function segmentOf(dayIndex: number): DaySegment {
  const f = dayFrac(dayIndex);
  if (f < DAY_SEGMENTS.safak[1]) return 'safak';
  if (f < DAY_SEGMENTS.gunduz[1]) return 'gunduz';
  if (f < DAY_SEGMENTS.aksam[1]) return 'aksam';
  return 'gece';
}

export const SEGMENT_ADI: Record<DaySegment, string> = {
  safak: 'Şafak',
  gunduz: 'Gündüz',
  aksam: 'Akşam',
  gece: 'Gece',
};

/** Clock time (hours 0-24) for display; dawn starts at 05:00. */
export function clockHours(dayIndex: number): number {
  return (5 + dayFrac(dayIndex) * 24) % 24;
}

export function formatClock(dayIndex: number): string {
  const h = clockHours(dayIndex);
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * Sun elevation proxy in [-1, 1] used by lighting: 1 = noon, 0 = horizon, -1 = midnight.
 * Derived from clock time (sunrise ≈ 05:30, sunset ≈ 19:30 in April–May Istanbul).
 */
export function sunElevation(dayIndex: number): number {
  const h = clockHours(dayIndex);
  return Math.sin(((h - 6.5) / 24) * Math.PI * 2) * 1.0;
}

/** Siege day number (Gün N) or null before the siege starts. */
export function siegeDayNumber(dayIndex: number, siegeStartDay: number | null): number | null {
  if (siegeStartDay == null) return null;
  return Math.floor(dayIndex - siegeStartDay) + 1;
}

/** Key historical dates as day indices. */
export const TARIH = {
  hisarBaslangic: d(15, 4, 1452),
  hisarBitis: d(31, 8, 1452),
  edirnedenHareket: d(23, 3, 1453),
  kusatmaBaslangic: d(6, 4, 1453),
  ilkHucum: d(18, 4, 1453),
  denizSavasi: d(20, 4, 1453),
  gemilerKaradan: d(22, 4, 1453),
  yakmaBaskini: d(28, 4, 1453),
  ayTutulmasi: d(22, 5, 1453),
  divan: d(26, 5, 1453),
  sonHucum: d(29, 5, 1453),
} as const;
