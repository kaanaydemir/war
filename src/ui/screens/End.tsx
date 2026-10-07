/**
 * END SCREEN — a cinematic on an illuminated manuscript page.
 *
 * ZAFER: the map darkens, the page unfurls, the account of 29 May is written
 * line by line, the seal is stamped, then the ledger: days compared with
 * history, losses on both sides, shots, breaches, assaults — and a sober
 * closing on the human cost (16+, factual, not glorifying).
 * YENİLGİ: relief fleet (haçlı) or Divan lifting the siege, what history did,
 * and concrete advice on what could have been done differently.
 *
 * Click / Space / Enter skips the sequence. `?ekranhizli=1` shows it complete.
 */
import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { d, formatDate } from '../../core/calendar';
import { store } from '../../core/store';
import { useGame } from '../useGame';
import { iconUrl } from './art';
import { YENILGI_TEXT, ZAFER_CLOSING, ZAFER_LINES } from './content';
import { EventImage } from './EventImage';
import { Btn, DitherShade, Divider, fastMode, Num, FxCanvas, pxVars, PxImg, sfx, transition, useClock, useKeyLayer, usePx, useViewport } from './kit';
import { compareSiege, endingKind, fmtInt, lessonsFor, siegeDaysOf, statRows, tickValue, weekdayName } from './logic';

/** Sequence timings (ms). */
const T = {
  page: 1300,
  title: 2100,
  line0: 2900,
  lineGap: 1500,
};

function useSequence(nLines: number): { t: number; skip: () => void; done: boolean; tAfter: number } {
  const [skipped, setSkipped] = useState(fastMode());
  const tAfter = T.line0 + nLines * T.lineGap; // when the narrative finished
  const total = tAfter + 5200;
  const [finished, setFinished] = useState(false);
  const clock = useClock(30, !skipped && !finished);
  useEffect(() => {
    if (clock >= total && !finished) setFinished(true);
  }, [clock >= total]);
  const t = skipped || finished ? total + 1 : clock;
  return { t, skip: () => setSkipped(true), done: t >= total, tAfter };
}

function Line(props: { show: boolean; children: string; class?: string; delay?: number }) {
  return <p class={`son-satir ${props.show ? 'yaziliyor' : ''} ${props.class ?? ''}`}>{props.children}</p>;
}

function Ledger(props: { t0: number; t: number }) {
  const s = store.state;
  const rows = statRows(s?.stats);
  const k = Math.max(0, Math.min(1, (props.t - props.t0) / 1600));
  return (
    <div class={`son-defter ${props.t >= props.t0 ? 'gorunur' : ''}`}>
      {rows.map((r, i) => (
        <div key={r.id} class={`defter-satir d-${r.id}`} style={{ transitionDelay: `${i * 90}ms` }}>
          <span>{r.label}</span>
          <b class="num">{fmtInt(tickValue(r.value, k))}</b>
        </div>
      ))}
    </div>
  );
}

function Seal(props: { text: string; show: boolean }) {
  return (
    <div class={`son-muhur ${props.show ? 'basildi' : ''}`}>
      <span>{props.text}</span>
    </div>
  );
}

function Buttons(props: { show: boolean; onBak: () => void; bakiyor: boolean }) {
  return (
    <div class={`son-dugmeler ${props.show ? 'gorunur' : ''}`}>
      <Btn kind="kirmizi" onClick={() => transition(() => store.actions.toTitle())}>
        <PxImg src={iconUrl('baslik')} w={12} h={12} k={2} /> Başlığa dön
      </Btn>
      <Btn onClick={() => store.setUi({ panel: 'ansiklopedi' })} sound="ac">
        <PxImg src={iconUrl('kitap')} w={13} h={12} k={2} /> Ansiklopedi
      </Btn>
      <Btn kind="sade" onClick={props.onBak} sound="sayfa">
        {props.bakiyor ? 'Sayfaya dön' : 'Şehre bak'}
      </Btn>
    </div>
  );
}

export function EndScreen() {
  const st = useGame();
  const px = usePx();
  const vp = useViewport();
  const s = st.state;
  const kind = endingKind(s);
  const zafer = kind === 'zafer';
  const days = siegeDaysOf(s);
  const cmp = compareSiege(days);
  const outDay = s?.outcome?.day ?? s?.time.day ?? d(29, 5, 1453);
  const dateLine = `${formatDate(outDay)}, ${weekdayName(outDay, d(29, 5, 1453), 2)}.`;
  const defeat = !zafer ? YENILGI_TEXT[kind as 'yenilgi-hacli' | 'yenilgi-divan'] : null;
  const lines = zafer ? ZAFER_LINES : defeat!.lines;
  const seq = useSequence(lines.length);
  const [bakiyor, setBakiyor] = useState(false);
  const t = seq.t;
  const stamp = seq.tAfter + 200;
  const ledgerT = seq.tAfter + 900;
  const closingT = seq.tAfter + 2600;
  const btnT = seq.tAfter + 3800;

  useEffect(() => {
    if (t >= T.page && t < T.page + 40) sfx('sayfa');
  }, [t >= T.page]);
  useEffect(() => {
    if (t >= stamp && !fastMode()) sfx('onay');
  }, [t >= stamp]);

  useKeyLayer((e) => {
    if (store.ui.panel) return false;
    if (!seq.done && (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape')) {
      seq.skip();
      return true;
    }
    if (seq.done && e.key === 'Enter') {
      transition(() => store.actions.toTitle());
      return true;
    }
    return false;
  });

  const imgK = vp.w >= 1700 && vp.h >= 1000 ? 3 : 2;
  const pageStyle = { ...pxVars(px) } as JSX.CSSProperties;
  return (
    <div
      class={`ekran son ${zafer ? 'zafer' : 'yenilgi'} ${t >= T.page ? 'sayfa-acik' : ''} ${bakiyor ? 'bakiyor' : ''}`}
      style={pageStyle}
      onClick={() => {
        if (!seq.done) seq.skip();
      }}
    >
      <div class="son-karartma" />
      <DitherShade px={px} strength={1} top={0.25} bottom={0.25} color={zafer ? [23, 12, 8] : [8, 10, 24]} />
      <FxCanvas px={px} counts={zafer ? { zerre: 34, kul: 16 } : { kul: 48 }} />
      <div class="son-sayfa etkilesim" onClick={(e) => e.stopPropagation()}>
        <div class="son-merdane ust" />
        <div class="son-kagit uk-kaydir">
          <i class="kose k1" />
          <i class="kose k2" />
          <i class="kose k3" />
          <i class="kose k4" />
          <div class="son-sutunlar">
            <div class="son-sol">
              <div class={`son-resim ${t >= T.title ? 'gorunur' : ''}`}>
                <EventImage imageKey={zafer ? 'olay/ayasofya' : kind === 'yenilgi-hacli' ? 'olay/deniz' : 'olay/divan'} k={imgK} />
              </div>
              <div class={`son-ust-yazi ${t >= T.title ? 'gorunur' : ''}`}><Num text={zafer ? dateLine : formatDate(outDay)} />
              </div>
              <h1 class={`son-baslik ${t >= T.title ? 'gorunur' : ''}`}>{zafer ? 'Kostantiniyye Alındı' : defeat!.title}</h1>
              <Divider class={t >= T.title ? 'gorunur' : 'gizli'} />
              <div class="son-anlati">
                {lines.map((l, i) => (
                  <Line key={i} show={t >= T.line0 + i * T.lineGap}>
                    {l}
                  </Line>
                ))}
              </div>
              {!zafer && (
                <div class={`son-tarihte ${t >= stamp ? 'gorunur' : ''}`}>
                  <h3>Tarihte ne oldu?</h3>
                  <p>{defeat!.tarihte}</p>
                </div>
              )}
            </div>
            <div class="son-sag">
              <Seal text={zafer ? 'FETİH' : 'YENİLGİ'} show={t >= stamp} />
              <div class={`son-kiyas ${t >= ledgerT - 400 ? 'gorunur' : ''}`}>
                {zafer ? (
                  <>
                    <p class="kiyas-ana">
                      <Num text={cmp.main} />
                    </p>
                    {cmp.verdict && (
                      <p class={`kiyas-hukum ${cmp.delta > 0 ? 'iyi' : cmp.delta < 0 ? 'kotu' : ''}`}>
                        <Num text={cmp.verdict} />
                      </p>
                    )}
                  </>
                ) : (
                  <p class="kiyas-ana">
                    <Num text={`Kuşatma ${days ?? '—'} gün sürdü. Tarihte şehir 53. günde alındı.`} />
                  </p>
                )}
              </div>
              <h3 class={`son-ara ${t >= ledgerT ? 'gorunur' : ''}`}>Kuşatmanın bilançosu</h3>
              <Ledger t0={ledgerT} t={t} />
              <div class={`son-kapanis ${t >= closingT ? 'gorunur' : ''}`}>
                {zafer ? (
                  ZAFER_CLOSING.map((p, i) => (
                    <p key={i} style={{ transitionDelay: `${i * 450}ms` }}>
                      {p}
                    </p>
                  ))
                ) : (
                  <>
                    <h3>Neler farklı yapılabilirdi?</h3>
                    <ul>
                      {lessonsFor(s).map((l, i) => (
                        <li key={i} style={{ transitionDelay: `${i * 300}ms` }}>
                          {l}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
              <Buttons show={t >= btnT} bakiyor={bakiyor} onBak={() => setBakiyor((b) => !b)} />
            </div>
          </div>
        </div>
        <div class="son-merdane alt" />
      </div>
      {bakiyor && (
        <button type="button" class="son-geri-don uk-btn etkilesim" onClick={() => setBakiyor(false)}>
          Sayfaya dön
        </button>
      )}
      {!seq.done && <div class="son-gec">Geçmek için tıkla</div>}
    </div>
  );
}
