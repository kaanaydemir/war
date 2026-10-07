import { dayToDate } from '../../core/calendar';

/** Seasons used by terrain/decor art. Winter = December–February (snow cover). */
export type Season = 'ilkbahar' | 'yaz' | 'sonbahar' | 'kis';
export const SEASONS: Season[] = ['ilkbahar', 'yaz', 'sonbahar', 'kis'];

export function seasonOf(dayIndex: number): Season {
  const m = dayToDate(dayIndex).month;
  if (m >= 3 && m <= 5) return 'ilkbahar';
  if (m >= 6 && m <= 8) return 'yaz';
  if (m >= 9 && m <= 11) return 'sonbahar';
  return 'kis';
}

export const SEASON_ADI: Record<Season, string> = {
  ilkbahar: 'İlkbahar',
  yaz: 'Yaz',
  sonbahar: 'Sonbahar',
  kis: 'Kış',
};
