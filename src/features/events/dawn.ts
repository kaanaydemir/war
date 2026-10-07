import { DAY_SEGMENTS } from '../../core/constants';
import { formatDate, siegeDayNumber } from '../../core/calendar';
import type { SimContext } from '../../core/feature';
import type { GameState } from '../../core/state';
import { erzakDays } from '../economy/api';
import type { DawnLineKind, DawnPriv, EventsPriv, Snapshot } from './types';

/** Snapshot of everything the dawn report compares. */
export function snapshot(s: GameState): Snapshot {
  const sections: Snapshot['sections'] = {};
  for (const id in s.sections) {
    const w = s.sections[id];
    sections[id] = { outer: w.outer, inner: w.inner, barricade: w.barricade, breach: w.breach, defenders: w.defenders };
  }
  return {
    day: s.time.day,
    sections,
    ottomanLosses: s.stats.ottomanLosses,
    byzantineLosses: s.stats.byzantineLosses,
    shotsFired: s.stats.shotsFired,
    barut: s.resources.barut,
    gulle: s.resources.gulle,
    erzak: s.resources.erzak,
    shipsLost: s.stats.shipsLost,
    byzMorale: s.byz.morale,
  };
}

const n0 = (n: number): string => Math.round(n).toLocaleString('tr-TR');
const pct = (f: number): string => `%${Math.round(f * 100)}`;

/** Called every siege tick: dusk snapshot + compile at each new dawn. */
export function dawnTick(s: GameState, ctx: SimContext, p: EventsPriv): void {
  const dp = p.dawn;
  const dayInt = Math.floor(s.time.day);
  const frac = s.time.day - dayInt;
  if (frac >= DAY_SEGMENTS.aksam[0] && (!dp.duskSnap || Math.floor(dp.duskSnap.day) !== dayInt)) {
    dp.duskSnap = snapshot(s);
  }
  if (dayInt > dp.lastDay) {
    compileDawnReport(s, ctx, dp);
    dp.lastDay = dayInt;
    dp.dawnSnap = snapshot(s);
    ctx.bus.emit('notify', { text: 'Şafak raporu hazır.', kind: 'bilgi' });
  }
}

export function compileDawnReport(s: GameState, ctx: SimContext | null, dp: DawnPriv): void {
  const lines: { kind: DawnLineKind; text: string }[] = [];
  const add = (kind: DawnLineKind, text: string) => lines.push({ kind, text });
  const gun = siegeDayNumber(s.time.day, s.time.siegeStartDay);
  const prev = dp.dawnSnap;
  const dusk = dp.duskSnap;

  if (!prev) {
    // First dawn of the siege: the overview.
    add('bilgi', !gun || gun <= 1 ? 'Kuşatmanın ilk şafağı. Ordu surların önünde mevzileniyor.' : `Kuşatmanın ${gun}. günü. Şafak sökerken surlarda nöbet değişiyor.`);
    add('casus', `Casuslara göre surlarda ≈${n0(roundTo(estimateDefenders(s, ctx), 100))} savunucu var.`);
  } else {
    // ── Overnight repairs (dusk → dawn)
    if (dusk) {
      const repaired: { name: string; gain: number }[] = [];
      for (const id in s.sections) {
        const now = s.sections[id];
        const was = dusk.sections[id];
        if (!was) continue;
        const gain = now.inner + now.outer + now.barricade * 400 - (was.inner + was.outer + was.barricade * 400);
        if (gain > 15) repaired.push({ name: now.name, gain });
      }
      repaired.sort((a, b) => b.gain - a.gain);
      if (repaired.length) {
        const names = repaired.slice(0, 3).map((r) => r.name).join(', ');
        add('uyari', `Bizanslılar gece ${names} kesiminde gedikleri barikatla kapattı.`);
      }
    }
    // ── Damage & breaches
    let newlyDamaged = 0;
    for (const id in s.sections) {
      const now = s.sections[id];
      const was = prev.sections[id];
      if (was && now.breach > was.breach + 0.05) newlyDamaged++;
    }
    if (newlyDamaged) add('basari', `Dünkü bombardıman ${newlyDamaged} kesimde surları gözle görülür biçimde yıprattı.`);
    // ── Losses
    const lostO = s.stats.ottomanLosses - prev.ottomanLosses;
    const lostB = s.stats.byzantineLosses - prev.byzantineLosses;
    if (lostO > 0) add('kayip', `Dünkü kayıplarımız: ${n0(lostO)} asker.`);
    if (lostB > 0) add('basari', `Bizans kaybı: ≈${n0(roundTo(lostB, 10))} savunucu.`);
    const ships = s.stats.shipsLost - prev.shipsLost;
    if (ships > 0) add('kayip', `Donanma dün ${ships} gemi kaybetti.`);
    // ── Ammunition
    const shots = s.stats.shotsFired - prev.shotsFired;
    const usedB = Math.max(0, prev.barut - s.resources.barut);
    if (shots > 0) {
      const days = usedB > 0 ? s.resources.barut / usedB : Infinity;
      const txt = `Toplar dün ${n0(shots)} atış yaptı. Barut: ${n0(s.resources.barut)}${Number.isFinite(days) ? ` (≈${Math.floor(days)} günlük)` : ''}, gülle: ${n0(s.resources.gulle)}.`;
      add(days < 3 || s.resources.gulle < 10 ? 'uyari' : 'bilgi', txt);
    } else if (s.cannons.length) {
      add('bilgi', `Toplar dün susmuştu. Barut: ${n0(s.resources.barut)}, gülle: ${n0(s.resources.gulle)}.`);
    }
  }

  // ── Open breaches
  const open = Object.values(s.sections)
    .filter((w) => w.breach >= 0.5)
    .sort((a, b) => b.breach - a.breach);
  if (open.length) add('basari', `Açık gedik: ${open.slice(0, 3).map((w) => `${w.name} (${pct(w.breach)})`).join(', ')}.`);
  else if (prev) {
    const worst = Object.values(s.sections).sort((a, b) => b.breach - a.breach)[0];
    if (worst && worst.breach > 0.1) add('bilgi', `Hücuma elverişli gedik henüz yok. En yıpranmış kesim: ${worst.name} (${pct(worst.breach)}).`);
  }

  // ── Provisions
  const ed = erzakDays(s);
  if (Number.isFinite(ed)) add(ed < 10 ? 'uyari' : 'bilgi', `Ordugâhta ≈${Math.floor(ed)} günlük erzak var.`);

  // ── Spy news (deterministic via ctx.rng)
  const spy = spyNews(s, ctx);
  if (spy) add('casus', spy);

  // ── Relief estimate
  const r = s.relief;
  if (!r.arrived) {
    const near = s.time.day >= r.knownMin - 7;
    add(near ? 'uyari' : 'bilgi', `Haçlı yardımı tahmini: ${formatDate(r.knownMin)} – ${formatDate(r.knownMax)}.`);
  }

  dp.report = { day: s.time.day, lines };
}

function roundTo(n: number, step: number): number {
  return Math.round(n / step) * step;
}

/** Noisy defender estimate (less noise with more intel). */
function estimateDefenders(s: GameState, ctx: SimContext | null): number {
  const noise = (1 - s.byz.intel / 100) * 0.35;
  const r = ctx ? ctx.rng.range(-noise, noise) : 0;
  return Math.max(500, s.byz.defenders * (1 + r));
}

function spyNews(s: GameState, ctx: SimContext | null): string | null {
  const chance = 0.35 + s.byz.intel / 160 + Math.max(0, s.galata) / 400;
  if (!ctx || !ctx.rng.chance(Math.min(0.95, chance))) return null;
  const pick = ctx.rng.int(0, 4);
  switch (pick) {
    case 0:
      return `Kaçaklara göre şehirde ≈${Math.max(1, Math.round(s.byz.food))} günlük erzak kaldı.`;
    case 1:
      return `Casuslar surlarda ≈${n0(roundTo(estimateDefenders(s, ctx), 100))} savunucu olduğunu söylüyor.`;
    case 2: {
      const top = Object.values(s.sections).sort((a, b) => b.threat - a.threat)[0];
      if (top && top.threat > 10) return `Bizans yedeklerini ${top.name} kesimine kaydırıyor.`;
      return 'Surlardan kaçan bir asker, savunucuların yorgun ve uykusuz olduğunu anlatıyor.';
    }
    case 3:
      return s.byz.morale >= 55
        ? 'Galata’dan gelen tüccarlar şehirde umudun hâlâ diri olduğunu anlatıyor.'
        : s.byz.morale >= 35
          ? 'Galata’dan gelen tüccarlar şehirde umutların azaldığını anlatıyor.'
          : 'Galata’dan gelen tüccarlara göre şehirde halk umudunu yitirmiş; kiliseler gece gündüz dolu.';
    default:
      return s.galata >= 20
        ? 'Galata’daki dostlarımız Venedik gemilerinin hareketlerini haber verdi.'
        : 'Haliç’teki gemilerden gelen ışıklar, gece boyunca surlara erzak ve asker taşındığını gösteriyor.';
  }
}
