/**
 * Notifications: bus subscriptions (re-subscribed whenever the scene's bus is
 * replaced), animated toasts with a gold flash, the collapsible "Günlük" log,
 * and the dawn auto-pause trigger.
 */
import { useEffect, useReducer, useRef } from 'preact/hooks';
import { formatDate } from '../../core/calendar';
import type { LogKind } from '../../core/state';
import { store } from '../../core/store';
import { getEventDef } from '../../features/events/api';
import { fmtShortDate } from './format';
import { logToToastKind, safe, ToastQueue, type ToastItem, type ToastKind } from './logic';
import { hud, Ikon, KapatBtn, setHud, ses, useHud } from './ui';

const queue = new ToastQueue();

/** Big centre ribbon for historic moments (phase changes, assault waves, the banner on the walls). */
interface Duyuru {
  id: number;
  title: string;
  sub?: string;
  tone: 'kirmizi' | 'altin';
}
let duyuru: Duyuru | null = null;
let duyuruSeq = 0;
let duyuruTimer = 0;
const duyuruListeners = new Set<() => void>();
export function announce(title: string, sub?: string, tone: Duyuru['tone'] = 'kirmizi'): void {
  duyuru = { id: ++duyuruSeq, title, sub, tone };
  ses('sayfa');
  for (const fn of duyuruListeners) fn();
  clearTimeout(duyuruTimer);
  duyuruTimer = window.setTimeout(() => {
    duyuru = null;
    for (const fn of duyuruListeners) fn();
  }, 4200);
}

export function DuyuruSeridi() {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const fn = () => force(0);
    duyuruListeners.add(fn);
    return () => duyuruListeners.delete(fn);
  }, []);
  if (!duyuru) return null;
  return (
    <div key={duyuru.id} class={`duyuru duyuru-${duyuru.tone}`}>
      <div class="duyuru-serit">
        <span class="duyuru-uc sol" />
        <div class="duyuru-yazi">
          <div class="duyuru-baslik">{duyuru.title.toLocaleUpperCase('tr')}</div>
          {duyuru.sub && <div class="duyuru-alt">{duyuru.sub}</div>}
        </div>
        <span class="duyuru-uc sag" />
      </div>
    </div>
  );
}

const DALGA_ADI = ['', 'Başıbozuklar saldırıyor', 'Anadolu askerleri saldırıyor', 'Yeniçeriler saldırıyor — Sultan önde'];
const toastListeners = new Set<() => void>();
function pushToast(text: string, kind: ToastKind, title?: string) {
  queue.push(text, kind, performance.now(), title);
  for (const fn of toastListeners) fn();
}

const KIND_IKON: Record<ToastKind, string> = {
  bilgi: 'gunluk',
  uyari: 'kilit',
  basari: 'onay',
  tehlike: 'emir-hucum',
  olay: 'muhur',
};

/** Subscribe to the CURRENT scene bus; re-run when `busVersion` changes. */
export function useBusAboneligi(): void {
  const bv = store.busVersion;
  useEffect(() => {
    const bus = store.bus;
    if (!bus) return;
    const offs: (() => void)[] = [];
    offs.push(bus.on('notify', (e) => pushToast(e.text, e.kind)));
    offs.push(
      bus.on('log', (e) => {
        const k = logToToastKind(e.kind);
        if (k) pushToast(e.text, k);
      }),
    );
    offs.push(
      bus.on('event:fired', (e) => {
        const def = safe(() => getEventDef(e.eventId), undefined);
        if (def) pushToast(def.title, 'olay', `${def.code} · ${def.dateLabel}`);
      }),
    );
    offs.push(
      bus.on('wall:breach', (e) => {
        const name = store.state?.sections[e.sectionId]?.name ?? 'Sur';
        pushToast(`${name} kesiminde gedik açıldı!`, 'basari', 'Gedik');
      }),
    );
    offs.push(bus.on('cannon:cracked', () => pushToast('Bir topun namlusu çatladı!', 'tehlike')));
    offs.push(
      bus.on('phase:changed', (e) => {
        if (e.phase === 'yuruyus') announce('Yola çıkıldı', 'Ordu Edirne’den Kostantiniyye’ye yürüyor', 'altin');
        else if (e.phase === 'kusatma') announce('Kuşatma başladı', `${formatDate(store.state?.time.day ?? 0)} · Gün 1`);
      }),
    );
    offs.push(
      bus.on('assault:start', (e) => {
        if (e.wave > 0) announce(`${e.wave}. dalga`, DALGA_ADI[e.wave] ?? store.state?.sections[e.sectionId]?.name);
      }),
    );
    offs.push(bus.on('banner:planted', () => announce('Sancak burçta!', 'Ulubatlı Hasan sancağı surlara dikti', 'altin')));
    offs.push(
      bus.on('group:routed', (e) => {
        const g = store.state?.groups.find((x) => x.id === e.groupId);
        pushToast(`${g?.name ?? 'Bir birlik'} bozguna uğradı!`, 'tehlike');
      }),
    );
    offs.push(
      bus.on('outcome', (o) => {
        pushToast(o.result === 'zafer' ? 'Şehir düştü!' : 'Kuşatma kaybedildi.', o.result === 'zafer' ? 'basari' : 'tehlike');
      }),
    );
    offs.push(
      bus.on('time:dawn', () => {
        const s = store.state;
        if (!s || s.time.phase !== 'kusatma') return;
        if (!store.ui.settings.autoPauseAtDawn) return;
        const resume = (s.time.speed || hud.dawn?.resume || 1) as 0 | 1 | 2 | 3;
        store.dispatch({ t: 'hiz', speed: 0 });
        setHud({ dawn: { resume } });
        store.setUi({ showDawnReport: true });
        ses('sayfa');
      }),
    );
    return () => offs.forEach((f) => f());
  }, [bv]);
}

function Tost({ t, now }: { t: ToastItem; now: number }) {
  const age = now - t.born;
  return (
    <div class={`tost tost-${t.kind}`} onMouseDown={(e) => e.preventDefault()} onClick={() => queue.remove(t.id)}>
      <span class="tost-serit" />
      <Ikon ad={KIND_IKON[t.kind]} />
      <div class="tost-govde">
        {t.title && <div class="tost-baslik">{t.title}</div>}
        <div class="tost-metin">
          {t.text}
          {t.count > 1 && <b class="num tost-sayac">×{t.count}</b>}
        </div>
      </div>
      <span class="tost-parilti" />
      {age < 300 && <span class="tost-flas" />}
    </div>
  );
}

export function Bildirimler() {
  const [, force] = useReducer((x: number) => x + 1, 0);
  const timer = useRef(0);
  useEffect(() => {
    const fn = () => force(0);
    toastListeners.add(fn);
    timer.current = window.setInterval(() => {
      if (queue.prune(performance.now())) force(0);
    }, 400);
    return () => {
      toastListeners.delete(fn);
      clearInterval(timer.current);
    };
  }, []);
  const now = performance.now();
  return (
    <div class="tostlar etkilesim">
      {queue.items
        .slice()
        .reverse()
        .map((t) => (
          <Tost key={t.id} t={t} now={now} />
        ))}
    </div>
  );
}

const LOG_ETIKET: Record<LogKind, string> = {
  bilgi: 'Bilgi',
  uyari: 'Uyarı',
  basari: 'Başarı',
  kayip: 'Kayıp',
  casus: 'Casus',
  olay: 'Olay',
};

export function Gunluk() {
  const h = useHud();
  const s = store.state;
  const list = useRef<HTMLDivElement>(null);
  const n = s?.log.length ?? 0;
  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [n, h.logOpen]);
  if (!s || !h.logOpen) return null;
  const items = s.log.slice(-80);
  return (
    <div class="gunluk panel-kagit etkilesim">
      <div class="panel-baslik">
        <Ikon ad="gunluk" />
        <span class="baslik-yazi">Günlük</span>
        <span class="soluk kucuk">{formatDate(s.time.day)}</span>
        <KapatBtn onClick={() => setHud({ logOpen: false })} />
      </div>
      <div class="gunluk-liste" ref={list} onWheel={(e) => e.stopPropagation()}>
        {items.length === 0 && <div class="soluk">Henüz kayıt yok.</div>}
        {items.map((e, i) => (
          <div key={`${n}-${i}`} class={`gunluk-satir log-${e.kind}`}>
            <span class="gunluk-tarih">{fmtShortDate(e.day)}</span>
            <span class="gunluk-tur">{LOG_ETIKET[e.kind] ?? ''}</span>
            <span class="gunluk-metin">{e.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
