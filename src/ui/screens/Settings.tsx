/**
 * SETTINGS — music & effects volume, dawn auto-pause, tutorial tips, UI
 * scale, edge scrolling, reduced motion and fullscreen. Persisted.
 */
import { useEffect, useState } from 'preact/hooks';
import { store } from '../../core/store';
import { useGame } from '../useGame';
import { iconUrl } from './art';
import { Btn, Modal, PxImg, sfx, usePx } from './kit';
import type { UiOlcek } from './logic';
import { closePanel } from './panels';
import { getExtra, onExtraChange, setCore, setExtra } from './settings';

function Slider(props: { label: string; value: number; onChange: (v: number) => void; icon?: string; px: number }) {
  const pct = Math.round(props.value * 100);
  return (
    <label class="ayar-satir">
      <span class="ayar-ad">
        {props.icon && <PxImg src={iconUrl(props.icon)} w={12} h={12} k={props.px} />}
        {props.label}
      </span>
      <span class="uk-kaydirici">
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={pct}
          style={{ '--dolu': `${pct}%` } as any}
          onInput={(e) => props.onChange(Number((e.target as HTMLInputElement).value) / 100)}
          onChange={() => sfx('tik')}
        />
      </span>
      <b class="num ayar-deger">%{pct}</b>
    </label>
  );
}

function Toggle(props: { label: string; desc?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label class="ayar-satir">
      <span class="ayar-ad">
        {props.label}
        {props.desc && <small>{props.desc}</small>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={props.value}
        class={`uk-anahtar ${props.value ? 'acik' : ''}`}
        onClick={() => {
          sfx('tik');
          props.onChange(!props.value);
        }}
      >
        <i />
      </button>
      <b class="ayar-deger">{props.value ? 'Açık' : 'Kapalı'}</b>
    </label>
  );
}

function Choice<T extends string | number>(props: { label: string; value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div class="ayar-satir">
      <span class="ayar-ad">{props.label}</span>
      <span class="uk-secenekler">
        {props.options.map((o) => (
          <button
            key={String(o.v)}
            type="button"
            class={o.v === props.value ? 'secili' : ''}
            onClick={() => {
              sfx('tik');
              props.onChange(o.v);
            }}
          >
            {o.label}
          </button>
        ))}
      </span>
      <b class="ayar-deger" />
    </div>
  );
}

function useFullscreen(): boolean {
  const [fs, setFs] = useState(!!document.fullscreenElement);
  useEffect(() => {
    const fn = () => setFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', fn);
    return () => document.removeEventListener('fullscreenchange', fn);
  }, []);
  return fs;
}

export function toggleFullscreen(): void {
  try {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  } catch {
    /* not allowed (iframe / headless) */
  }
}

export function SettingsModal() {
  const st = useGame();
  const px = usePx();
  const [extra, setLocal] = useState(getExtra());
  useEffect(() => onExtraChange(() => setLocal(getExtra())), []);
  const fs = useFullscreen();
  const s = st.ui.settings;
  const open = st.ui.panel === 'ayarlar';
  return (
    <Modal
      open={open}
      onClose={() => closePanel(['ayarlar'])}
      px={px}
      width={300}
      kind="kagit"
      class="ayarlar"
      title={
        <>
          <PxImg src={iconUrl('ayar')} w={12} h={12} k={px} /> Ayarlar
        </>
      }
    >
      <div class="ayar-govde">
        <h3>Ses</h3>
        <Slider label="Müzik" icon="ses" value={s.musicVolume} onChange={(v) => setCore({ musicVolume: v })} px={px} />
        <Slider label="Efektler" icon="ses" value={s.sfxVolume} onChange={(v) => setCore({ sfxVolume: v })} px={px} />
        <h3>Oyun</h3>
        <Toggle
          label="Şafakta duraklat"
          desc="Şafak raporu gelince oyun durur."
          value={s.autoPauseAtDawn}
          onChange={(v) => setCore({ autoPauseAtDawn: v })}
        />
        <Toggle label="Öğretici ipuçları" desc="Görevler panelinde yol gösterir." value={s.showTutorial} onChange={(v) => setCore({ showTutorial: v })} />
        <Toggle label="Kenarda kaydır" desc="Fare ekran kenarına gelince harita kayar." value={extra.kenarKaydirma} onChange={(v) => setExtra({ kenarKaydirma: v })} />
        <h3>Görüntü</h3>
        <Choice<UiOlcek>
          label="Arayüz ölçeği"
          value={extra.uiOlcek}
          options={[
            { v: 'oto', label: 'Otomatik' },
            { v: 2, label: '2×' },
            { v: 3, label: '3×' },
            { v: 4, label: '4×' },
          ]}
          onChange={(v) => setExtra({ uiOlcek: v })}
        />
        <Toggle label="Az hareket" desc="Menü animasyonlarını sadeleştirir." value={extra.azHareket} onChange={(v) => setExtra({ azHareket: v })} />
        <div class="ayar-satir">
          <span class="ayar-ad">Tam ekran</span>
          <Btn onClick={toggleFullscreen} sound="tik">
            <PxImg src={iconUrl('tam')} w={12} h={12} k={2} /> {fs ? 'Pencereye dön' : 'Tam ekran yap'}
          </Btn>
          <b class="ayar-deger" />
        </div>
      </div>
      <footer class="ayar-alt">
        <span>Ayarlar bu tarayıcıda saklanır.</span>
        <Btn kind="kirmizi" onClick={() => closePanel(['ayarlar'])} sound="kapat">
          Tamam
        </Btn>
      </footer>
    </Modal>
  );
}
