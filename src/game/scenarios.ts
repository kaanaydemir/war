import { d } from '../core/calendar';
import type { Feature, ScenarioName } from '../core/feature';
import { FLAG } from '../core/flags';
import type { Difficulty, GameState, Phase } from '../core/state';
import type { WorldApi } from '../core/world';
import { landmarkTile, type LandmarkId } from '../data/landmarks';
import { createCoreState } from './newGame';

/**
 * QA / showcase scenarios. Core sets the calendar & phase; then every feature's
 * applyScenario() adds its own entities so the scene looks right.
 * URL: ?scenario=<name>&t=<dayFrac>&zoom=<1-4>&ui=0&speed=<0-3>&lm=<landmark>
 */
export interface ScenarioSetup {
  day: number;
  phase: Phase;
  siegeStart?: number;
  camera: LandmarkId;
  zoom: number;
  flags?: Record<string, number | boolean | string>;
  title: string;
}

export const SCENARIOS: Record<ScenarioName, ScenarioSetup> = {
  'yeni-oyun': { day: d(1, 3, 1452) + 0.3, phase: 'hazirlik', camera: 'rumeliHisari', zoom: 2, title: 'Yeni oyun' },
  'hisar-insaat': {
    day: d(10, 6, 1452) + 0.3,
    phase: 'hazirlik',
    camera: 'rumeliHisari',
    zoom: 3,
    flags: { [FLAG.hisarIlerleme]: 0.55 },
    title: 'Rumeli Hisarı inşaatı',
  },
  'kis-hazirlik': {
    day: d(20, 1, 1453) + 0.35,
    phase: 'hazirlik',
    camera: 'rumeliHisari',
    zoom: 2,
    flags: { [FLAG.hisarTamam]: true, [FLAG.hisarIlerleme]: 1, [FLAG.bogazKontrol]: true, [FLAG.orbanGeldi]: true },
    title: 'Kış hazırlığı',
  },
  'kusatma-gun1': {
    day: d(6, 4, 1453) + 0.15,
    phase: 'kusatma',
    siegeStart: d(6, 4, 1453),
    camera: 'topkapi',
    zoom: 2,
    flags: { [FLAG.hisarTamam]: true, [FLAG.hisarIlerleme]: 1, [FLAG.bogazKontrol]: true, [FLAG.zincirGerili]: true },
    title: 'Kuşatmanın ilk günü',
  },
  bombardiman: {
    day: d(16, 4, 1453) + 0.32,
    phase: 'kusatma',
    siegeStart: d(6, 4, 1453),
    camera: 'topkapi',
    zoom: 3,
    flags: { [FLAG.hisarTamam]: true, [FLAG.hisarIlerleme]: 1, [FLAG.sahiCephede]: true, [FLAG.zincirGerili]: true },
    title: 'Bombardıman',
  },
  'gece-onarim': {
    day: d(16, 4, 1453) + 0.8,
    phase: 'kusatma',
    siegeStart: d(6, 4, 1453),
    camera: 'sulukule',
    zoom: 3,
    flags: { [FLAG.hisarTamam]: true, [FLAG.sahiCephede]: true, [FLAG.zincirGerili]: true },
    title: 'Gece onarımı',
  },
  'deniz-savasi': {
    day: d(20, 4, 1453) + 0.4,
    phase: 'kusatma',
    siegeStart: d(6, 4, 1453),
    camera: 'akropolis',
    zoom: 2,
    flags: { [FLAG.hisarTamam]: true, [FLAG.sahiCephede]: true, [FLAG.zincirGerili]: true },
    title: '20 Nisan deniz savaşı',
  },
  'gemiler-karadan': {
    day: d(22, 4, 1453) + 0.75,
    phase: 'kusatma',
    siegeStart: d(6, 4, 1453),
    camera: 'kasimpasa',
    zoom: 2,
    flags: { [FLAG.hisarTamam]: true, [FLAG.sahiCephede]: true, [FLAG.zincirGerili]: true, [FLAG.denizSavasi]: 'yarildi' },
    title: 'Gemilerin karadan yürütülmesi',
  },
  lagim: {
    day: d(16, 5, 1453) + 0.45,
    phase: 'kusatma',
    siegeStart: d(6, 4, 1453),
    camera: 'egrikapi',
    zoom: 3,
    flags: { [FLAG.hisarTamam]: true, [FLAG.sahiCephede]: true, [FLAG.gemilerKaradan]: true, [FLAG.lagimBasladi]: true },
    title: 'Lağımlar',
  },
  kule: {
    day: d(18, 5, 1453) + 0.5,
    phase: 'kusatma',
    siegeStart: d(6, 4, 1453),
    camera: 'topkapi',
    zoom: 3,
    flags: { [FLAG.hisarTamam]: true, [FLAG.sahiCephede]: true, [FLAG.gemilerKaradan]: true, [FLAG.kuleYapildi]: true },
    title: 'Kuşatma kulesi',
  },
  'son-hucum': {
    day: d(29, 5, 1453) + 0.86,
    phase: 'kusatma',
    siegeStart: d(6, 4, 1453),
    camera: 'sulukule',
    zoom: 3,
    flags: {
      [FLAG.hisarTamam]: true,
      [FLAG.sahiCephede]: true,
      [FLAG.gemilerKaradan]: true,
      [FLAG.halicKoprusu]: true,
      [FLAG.sonHucumIlan]: true,
      [FLAG.sonHucum]: true,
      [FLAG.hucumDalgasi]: 3,
    },
    title: 'Son hücum',
  },
  zafer: {
    day: d(29, 5, 1453) + 0.35,
    phase: 'bitti',
    siegeStart: d(6, 4, 1453),
    camera: 'ayasofya',
    zoom: 2,
    flags: { [FLAG.sehirDustu]: true, [FLAG.sancakDikildi]: true },
    title: 'Zafer',
  },
  yenilgi: {
    day: d(12, 6, 1453) + 0.4,
    phase: 'bitti',
    siegeStart: d(6, 4, 1453),
    camera: 'akropolis',
    zoom: 2,
    title: 'Yenilgi',
  },
};

export function buildState(
  scenario: ScenarioName,
  difficulty: Difficulty,
  seed: number,
  world: WorldApi,
  features: Feature[],
): GameState {
  const s = createCoreState(difficulty, seed);
  for (const f of features) {
    try {
      f.initState?.(s, world);
    } catch (err) {
      console.error(`[scenario] ${f.id}.initState failed`, err);
    }
  }
  if (scenario === 'yeni-oyun') return s;
  const setup = SCENARIOS[scenario];
  s.time.day = setup.day;
  s.time.phase = setup.phase;
  s.time.siegeStartDay = setup.siegeStart ?? null;
  if (setup.phase !== 'hazirlik') {
    s.flags[FLAG.yolaCikildi] = true;
    s.time.marchStartDay = d(23, 3, 1453);
  }
  if (setup.siegeStart != null) s.flags[FLAG.kusatmaBasladi] = true;
  Object.assign(s.flags, setup.flags ?? {});
  for (const f of features) {
    try {
      f.applyScenario?.(scenario, s, world);
    } catch (err) {
      console.error(`[scenario] ${f.id}.applyScenario failed`, err);
    }
  }
  if (scenario === 'zafer') s.outcome = { result: 'zafer', day: s.time.day, siegeDays: 54 };
  if (scenario === 'yenilgi') s.outcome = { result: 'yenilgi-hacli', day: s.time.day, siegeDays: 67 };
  return s;
}

export function scenarioCamera(name: ScenarioName): { tx: number; ty: number; zoom: number } {
  const setup = SCENARIOS[name];
  const t = landmarkTile(setup.camera);
  return { tx: t.tx, ty: t.ty, zoom: setup.zoom };
}
