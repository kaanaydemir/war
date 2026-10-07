import { d } from '../../core/calendar';
import type { ScenarioName } from '../../core/feature';
import { FLAG } from '../../core/flags';
import type { GameState } from '../../core/state';
import type { WorldApi } from '../../core/world';
import { geoToTile } from '../../data/geography';
import { landmarkTile } from '../../data/landmarks';
import { sectionApproach, sectionPoint } from '../fortifications/api';
import { buildingCenterTile, hisarBuilding, hisarOverall } from './api';
import { econ } from './econState';
import { assignWorkers, completeHisar, placeCamp, placeNear, spawnCaravan, syncBlocked } from './sim';

/** QA / showcase scenario setup for economy (runs after initState). */
export function applyEconomyScenario(name: ScenarioName, state: GameState, world: WorldApi): void {
  const e = econ(state);
  const hisar = hisarBuilding(state);
  e.lastDay = Math.floor(state.time.day);
  e.nextCaravanDay = state.time.day + 0.6;
  e.caravans = [];

  const hc = hisar ? buildingCenterTile(hisar) : landmarkTile('rumeliHisari');

  if (name === 'yeni-oyun') return;

  if (name === 'hisar-insaat' && hisar) {
    // ~55% — temel done, walls and three towers rising (the pashas' race)
    Object.assign(hisar.data, { temel: 1, surlar: 0.46, halil: 0.58, saruca: 0.47, zaganos: 0.4 });
    hisar.progress = hisarOverall(hisar);
    state.flags[FLAG.hisarIlerleme] = hisar.progress;
    e.warned.hisarBasladi = state.time.day;
    e.hisarPriority = 'halil';
    state.workforce.total = 1900;
    state.resources = { ...state.resources, akce: 21000, tas: 1600, kereste: 900, maden: 120, tunc: 40, barut: 60, gulle: 30, erzak: 52000, yag: 0 };
    placeNear(state, world, 'ordugah-cadirlari', hc.tx - 9, hc.ty + 1, { maxR: 5 });
    placeNear(state, world, 'ordugah-cadirlari', hc.tx - 7, hc.ty + 6, { maxR: 5 });
    placeNear(state, world, 'erzak-ambari', hc.tx - 12, hc.ty + 5, { maxR: 6 });
    const q = geoToTile(41.0835, 29.04);
    placeNear(state, world, 'tas-ocagi', q.tx, q.ty, { maxR: 8 });
    placeNear(state, world, 'tasci-atolyesi', hc.tx - 13, hc.ty - 2, { maxR: 6 });
    placeNear(state, world, 'yag-kazani', hc.tx - 14, hc.ty + 9, { maxR: 6 });
    spawnCaravan(state, world, 'karma', null, 0.82);
    spawnCaravan(state, world, 'amele', {}, 0.9, 250);
    assignWorkers(state);
    return;
  }

  // Everything after the summer of 1452: the fortress stands.
  if (hisar && !hisar.built) {
    completeHisar(state, null, hisar);
    state.flags[FLAG.hisarBitisGunu] = d(31, 8, 1452);
  }

  if (name === 'kis-hazirlik') {
    state.workforce.total = 1700;
    e.dokumhaneLevel = 2;
    e.yol = { active: true, workers: 250 };
    state.flags[FLAG.yolHazirligi] = 0.35;
    state.resources = { ...state.resources, akce: 34000, tas: 2600, kereste: 1400, maden: 140, tunc: 320, barut: 900, gulle: 700, erzak: 900000, yag: 40 };
    placeNear(state, world, 'erzak-ambari', hc.tx - 12, hc.ty + 5, { maxR: 6 });
    placeNear(state, world, 'kervansaray', hc.tx - 13, hc.ty - 4, { maxR: 6 });
    placeNear(state, world, 'tasci-atolyesi', hc.tx - 10, hc.ty + 9, { maxR: 6 });
    placeNear(state, world, 'baruthane', hc.tx - 17, hc.ty + 3, { maxR: 6 });
    placeNear(state, world, 'ordugah-cadirlari', hc.tx - 8, hc.ty + 3, { maxR: 5 });
    spawnCaravan(state, world, 'erzak', null, 0.88);
    assignWorkers(state);
    return;
  }

  // ── Siege & end scenarios: camp, emplacements, works ──
  state.workforce.total = 2400;
  e.dokumhaneLevel = 3;
  state.flags[FLAG.yolHazirligi] = 1;
  e.seferErzaki = name !== 'kusatma-gun1';
  e.scenarioErzakDays = 30;
  const late = !['kusatma-gun1', 'bombardiman'].includes(name);
  state.resources = {
    ...state.resources,
    akce: late ? 26000 : 38000,
    tas: 2200,
    kereste: 1800,
    maden: 90,
    tunc: 260,
    barut: late ? 1900 : 3200,
    gulle: late ? 900 : 1800,
    erzak: e.seferErzaki ? 1600000 : 400000,
    yag: name === 'gemiler-karadan' ? 420 : 160,
  };
  placeCamp(state, world, null);

  // emplacements opposite the main targets (historically: the Şahi faced St. Romanus / Topkapı)
  for (const [sec, dist] of [
    ['kara-topkapi', 7],
    ['kara-lykos', 7],
    ['kara-edirnekapi', 7],
    ['kara-mevlevihane', 8],
  ] as const) {
    const t = sectionApproach(sec, dist);
    placeNear(state, world, 'top-mevzii', t.tx, t.ty, { maxR: 4 });
  }
  // mantlets in front of the moat
  const siperRows: [string, number][] = late
    ? [
        ['kara-topkapi', 4],
        ['kara-lykos', 4],
        ['kara-edirnekapi', 3],
      ]
    : name === 'bombardiman'
      ? [
          ['kara-topkapi', 3],
          ['kara-lykos', 2],
        ]
      : [];
  for (const [sec, n] of siperRows) {
    for (let i = 0; i < n; i++) {
      const p = sectionPoint(sec, (i + 0.5) / n);
      placeNear(state, world, 'siper', p.tx - 4.5, p.ty, { maxR: 3 });
    }
  }
  // production behind the camp
  const ot = landmarkTile('otag');
  placeNear(state, world, 'tasci-atolyesi', ot.tx - 9, ot.ty + 3, { maxR: 6 });
  placeNear(state, world, 'baruthane', ot.tx - 12, ot.ty - 5, { maxR: 6 });
  placeNear(state, world, 'erzak-ambari', ot.tx - 11, ot.ty + 8, { maxR: 6 });
  placeNear(state, world, 'kervansaray', ot.tx - 14, ot.ty - 14, { maxR: 8 });
  const dip = landmarkTile('diplokionion');
  placeNear(state, world, 'yag-kazani', dip.tx - 4, dip.ty + 1, { maxR: 6 });
  placeNear(state, world, 'erzak-ambari', ot.tx - 4, ot.ty + 14, { maxR: 6 });
  syncBlocked(state, world, true);
  if (state.time.phase !== 'bitti') {
    spawnCaravan(state, world, 'erzak', null, 0.55);
    spawnCaravan(state, world, 'hazine', null, 0.25);
  }
  assignWorkers(state);
}
