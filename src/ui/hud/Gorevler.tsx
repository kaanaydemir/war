/**
 * "Görevler" (objectives) panel, top-left; contextual tips as dismissible
 * scroll cards beneath it.
 */
import { useState } from 'preact/hooks';
import { store } from '../../core/store';
import { activeTips, currentObjectives, type Objective } from '../../features/events/api';
import { safe } from './logic';
import { Btn, Ikon, ses } from './ui';

function GorevSatiri({ o }: { o: Objective }) {
  const p = o.progress != null ? Math.max(0, Math.min(1, o.progress)) : null;
  const tik = !!o.focus;
  return (
    <li
      class={`gorev ${o.done ? 'tamam' : ''} ${o.optional ? 'istege-bagli' : ''} ${tik ? 'tiklanir' : ''}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        if (!o.focus) return;
        ses('tik');
        store.actions.focusTile(o.focus.tx, o.focus.ty);
      }}
    >
      <span class="gorev-kutu">{o.done ? <Ikon ad="onay" /> : <i class="bos-kutu" />}</span>
      <span class="gorev-govde">
        <span class="gorev-yazi">
          {o.text}
          {o.optional && <em class="etiket">isteğe bağlı</em>}
        </span>
        {p != null && !o.done && (
          <span class="gorev-ilerleme">
            <span style={{ width: `${p * 100}%` }} />
          </span>
        )}
      </span>
      {tik && <span class="gorev-git">➜</span>}
    </li>
  );
}

export function Gorevler() {
  const s = store.state;
  const [acik, setAcik] = useState(true);
  if (!s) return null;
  const list = safe(() => currentObjectives(s), []);
  const tips = store.ui.settings.showTutorial ? safe(() => activeTips(s), []) : [];
  const yapilan = list.filter((o) => o.done).length;
  if (store.ui.panel === 'insa') return null;
  return (
    <div class="sol-sutun">
      {list.length > 0 && (
        <div class={`gorevler panel-kagit etkilesim ${acik ? '' : 'kapali'}`}>
          <div
            class="gorevler-baslik"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              ses(acik ? 'kapat' : 'ac');
              setAcik(!acik);
            }}
          >
            <Ikon ad="gorev" />
            <span class="baslik-yazi">Görevler</span>
            <span class="num sayac">
              {yapilan}/{list.length}
            </span>
            <span class="ok">{acik ? '▾' : '▸'}</span>
          </div>
          {acik && (
            <ul class="gorev-liste">
              {list.map((o) => (
                <GorevSatiri key={o.id} o={o} />
              ))}
            </ul>
          )}
        </div>
      )}
      {tips.map((t) => (
        <div key={t.id} class="tomar etkilesim">
          <div class="tomar-govde">
            <div class="tomar-baslik">{t.title}</div>
            <div class="tomar-metin">{t.text}</div>
            <Btn
              tur="kagit"
              class="tomar-kapat"
              sesi="kapat"
              onClick={() => store.dispatch({ t: 'ozel', feature: 'events', action: 'ipucu-kapat', payload: { id: t.id } })}
            >
              Anladım
            </Btn>
          </div>
        </div>
      ))}
    </div>
  );
}
