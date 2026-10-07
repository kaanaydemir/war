/**
 * PAUSE MENU — the ☰ button (top-right, under the HUD bar) and the menu
 * modal: Devam, Kaydet, Yükle, Ayarlar, Ansiklopedi, Başlığa Dön (confirm).
 * Opening pauses the game; Devam restores the previous speed.
 */
import { useState } from 'preact/hooks';
import { store } from '../../core/store';
import { useGame } from '../useGame';
import { artUrl, drawMenuIcon, iconUrl } from './art';
import { Modal, pxVars, PxImg, sfx, toast, transition, useKeyLayer, usePx } from './kit';
import { navStep } from './logic';
import { closePanel, openPanel } from './panels';

let savedSpeed: 0 | 1 | 2 | 3 = 0;

export function openPauseMenu(): void {
  const s = store.state;
  if (s && s.time.speed > 0) {
    savedSpeed = s.time.speed;
    store.dispatch({ t: 'hiz', speed: 0 });
  }
  openPanel('menu');
}

function resume(): void {
  closePanel(['menu']);
  if (savedSpeed > 0 && store.state && !store.state.events.active) store.dispatch({ t: 'hiz', speed: savedSpeed });
  savedSpeed = 0;
}

/** ☰ button shown during play. Also binds Esc / F10 when nothing else claims the key. */
export function MenuButton() {
  const st = useGame();
  const px = usePx();
  useKeyLayer((e) => {
    if (e.key !== 'Escape' && e.key !== 'F10') return false;
    // let the HUD use Esc for placement/selection first
    if (st.ui.panel || st.ui.placement || st.ui.selection.length || st.state?.events.active) return false;
    sfx('ac');
    openPauseMenu();
    return true;
  }, st.ui.screen === 'oyun');
  if (st.ui.screen !== 'oyun') return null;
  return (
    <button
      type="button"
      class={`menu-dugme etkilesim ${st.ui.panel === 'menu' ? 'acik' : ''}`}
      style={pxVars(px)}
      title="Menü (Esc)"
      onMouseEnter={() => sfx('tik')}
      onClick={() => {
        sfx('ac');
        if (st.ui.panel === 'menu') resume();
        else openPauseMenu();
      }}
    >
      <PxImg src={artUrl('menu-icon', drawMenuIcon)} w={11} h={11} k={px} />
    </button>
  );
}

interface Row {
  id: string;
  label: string;
  icon: string;
  run: () => void;
  disabled?: boolean;
  danger?: boolean;
}

export function PauseMenu() {
  const st = useGame();
  const px = usePx();
  const open = st.ui.panel === 'menu';
  const [focus, setFocus] = useState(0);
  const [confirm, setConfirm] = useState<null | 'baslik' | 'yukle'>(null);
  const hasSave = st.actions.hasSave();
  const rows: Row[] = [
    { id: 'devam', label: 'Devam', icon: 'oynat', run: resume },
    {
      id: 'kaydet',
      label: 'Kaydet',
      icon: 'kayit',
      run: () => {
        store.actions.save();
        toast(store.actions.hasSave() ? 'Oyun kaydedildi.' : 'Kayıt yapılamadı.', store.actions.hasSave() ? 'basari' : 'uyari');
      },
    },
    { id: 'yukle', label: 'Yükle', icon: 'yukle', disabled: !hasSave, run: () => setConfirm('yukle') },
    { id: 'ayarlar', label: 'Ayarlar', icon: 'ayar', run: () => openPanel('ayarlar', 'menu') },
    { id: 'ansiklopedi', label: 'Ansiklopedi', icon: 'kitap', run: () => openPanel('ansiklopedi', 'menu') },
    { id: 'baslik', label: 'Başlığa Dön', icon: 'baslik', danger: true, run: () => setConfirm('baslik') },
  ];
  const doConfirm = () => {
    const c = confirm;
    setConfirm(null);
    if (c === 'baslik') {
      closePanel(['menu']);
      savedSpeed = 0;
      transition(() => store.actions.toTitle());
    } else if (c === 'yukle') {
      closePanel(['menu']);
      savedSpeed = 0;
      transition(() => {
        if (!store.actions.load()) toast('Kayıt yüklenemedi.', 'uyari');
      });
    }
  };
  return (
    <Modal
      open={open}
      onClose={confirm ? () => setConfirm(null) : resume}
      px={px}
      width={150}
      kind="gece"
      class="duraklat"
      title="Duraklatıldı"
      onKey={(e) => {
        if (confirm) {
          if (e.key === 'Enter') {
            sfx('onay');
            doConfirm();
            return true;
          }
          return false;
        }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          sfx('tik');
          setFocus((f) => navStep(f, e.key === 'ArrowDown' ? 1 : -1, rows.length, (i) => !!rows[i].disabled));
          return true;
        }
        if (e.key === 'Enter') {
          const r = rows[focus];
          if (r && !r.disabled) {
            sfx('onay');
            r.run();
          }
          return true;
        }
        return false;
      }}
    >
      {confirm ? (
        <div class="onay-kutu">
          <p>{confirm === 'baslik' ? 'Başlık ekranına dönülsün mü? Kaydedilmemiş ilerleme kaybolur.' : 'Kayıtlı oyun yüklensin mi? Şu anki ilerleme kaybolur.'}</p>
          <div class="onay-dugmeler">
            <button type="button" class="uk-btn kirmizi" onClick={() => (sfx('onay'), doConfirm())}>
              Evet
            </button>
            <button type="button" class="uk-btn" onClick={() => (sfx('kapat'), setConfirm(null))}>
              Vazgeç
            </button>
          </div>
        </div>
      ) : (
        <nav class="duraklat-menu">
          {rows.map((r, i) => (
            <button
              key={r.id}
              type="button"
              class={`menu-oge ${i === focus ? 'odak' : ''} ${r.danger ? 'tehlike' : ''}`}
              disabled={r.disabled}
              onMouseEnter={() => {
                if (!r.disabled && i !== focus) {
                  sfx('tik');
                  setFocus(i);
                }
              }}
              onClick={() => {
                if (r.disabled) return sfx('hata');
                sfx('onay');
                setFocus(i);
                r.run();
              }}
            >
              <i class="menu-isaret" />
              <PxImg src={iconUrl(r.icon)} w={12} h={12} k={px} class="menu-ikon" />
              <span>{r.label}</span>
            </button>
          ))}
        </nav>
      )}
    </Modal>
  );
}
