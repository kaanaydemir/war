/**
 * ENCYCLOPEDIA — a bound book: category tabs and search on the left page,
 * the article on the right with an illuminated drop cap, "(doğrulanacak)"
 * badges, sources grouped by kind and related-entry links. Page-turn
 * animation between articles; back history.
 */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { EncyclopediaCategory, EncyclopediaEntry } from '../../core/defs';
import { store } from '../../core/store';
import {
  ENCYCLOPEDIA_KATEGORI_ADI,
  encyclopediaByCategory,
  getEncyclopediaEntry,
  searchEncyclopedia,
  sourceRefs,
} from '../../features/events/api';
import { useGame } from '../useGame';
import { drawSearchIcon, artUrl, iconUrl } from './art';
import { Modal, PxImg, sfx, usePx } from './kit';
import { navStep, splitDogrulanacak } from './logic';
import { closePanel } from './panels';

const CATS: EncyclopediaCategory[] = ['kisi', 'yer', 'olay', 'silah', 'kavram', 'kaynak'];

function safeByCategory(): Record<EncyclopediaCategory, EncyclopediaEntry[]> {
  try {
    return encyclopediaByCategory();
  } catch {
    return { kisi: [], yer: [], olay: [], silah: [], kaynak: [], kavram: [] };
  }
}

function Paragraph(props: { text: string; first: boolean }) {
  const parts = splitDogrulanacak(props.text);
  let rest = parts;
  let cap: string | null = null;
  if (props.first && parts.length && !parts[0].mark && parts[0].text.length > 1 && /\p{L}/u.test(parts[0].text[0])) {
    const t = parts[0].text;
    cap = t[0];
    rest = [{ text: t.slice(1), mark: false }, ...parts.slice(1)];
  }
  return (
    <p class={props.first ? 'ilk' : ''}>
      {cap && <span class="bas-harf">{cap}</span>}
      {rest.map((p, i) =>
        p.mark ? (
          <span key={i} class="dogrulanacak" title="Bu bilgi kaynak taramasında kesinleştirilecek">
            {p.text}
          </span>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </p>
  );
}

function Article(props: { e: EncyclopediaEntry; open: (id: string) => void }) {
  const { e } = props;
  const refs = (() => {
    try {
      return sourceRefs(e.sources);
    } catch {
      return [];
    }
  })();
  const related = (e.related ?? []).map((id) => getEncyclopediaEntry(id)).filter((x): x is EncyclopediaEntry => !!x);
  return (
    <article class="ans-madde" key={e.id}>
      <div class="ans-kategori">{ENCYCLOPEDIA_KATEGORI_ADI[e.category]}</div>
      <h2>{e.title}</h2>
      {e.subtitle && <div class="ans-alt">{e.subtitle}</div>}
      {e.dogrulanacak && <div class="ans-uyari">Bu maddede doğrulanacak bilgiler var.</div>}
      <div class="ans-metin">
        {e.body.map((p, i) => (
          <Paragraph key={i} text={p} first={i === 0} />
        ))}
      </div>
      {refs.length > 0 && (
        <div class="ans-kaynaklar">
          <h3>Kaynaklar</h3>
          <ul>
            {refs.map((r) => (
              <li key={r.id} class={`g-${r.group}`}>
                <span class="kaynak-tur">{r.groupLabel}</span> <b>{r.author}</b>, <i>{r.title}</i>
              </li>
            ))}
          </ul>
        </div>
      )}
      {related.length > 0 && (
        <div class="ans-ilgili">
          <h3>İlgili maddeler</h3>
          <div>
            {related.map((r) => (
              <button key={r.id} type="button" class="olay-bag" onClick={() => props.open(r.id)}>
                {r.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

function Welcome(props: { open: (id: string) => void; counts: Record<EncyclopediaCategory, number>; pick: (c: EncyclopediaCategory) => void }) {
  return (
    <article class="ans-madde ans-giris">
      <div class="ans-kategori">Ansiklopedi</div>
      <h2>Kuşatmanın Kitabı</h2>
      <div class="ans-metin">
        <Paragraph
          first
          text="Bu kitapta 1453 kuşatmasının kişileri, yerleri, olayları, silahları ve kavramları anlatılır. Bilgiler Osmanlı kaynaklarına dayanır; diğer kaynaklar kontrol amacıyla kullanılır. Kaynakların çeliştiği yerlerde farklı görüşler birlikte verilir."
        />
      </div>
      <div class="ans-giris-kartlar">
        {CATS.map((c) => (
          <button key={c} type="button" onClick={() => props.pick(c)}>
            <PxImg src={iconUrl(c)} w={12} h={12} k={2} />
            <b>{ENCYCLOPEDIA_KATEGORI_ADI[c]}</b>
            <span class="num">{props.counts[c]}</span>
          </button>
        ))}
      </div>
      <p class="ans-ipucu">“(doğrulanacak)” işaretli bilgiler kaynak taramasında kesinleştirilecek.</p>
    </article>
  );
}

export function Encyclopedia() {
  const st = useGame();
  const px = usePx();
  const open = st.ui.panel === 'ansiklopedi' || !!st.ui.encyclopediaEntry;
  const byCat = useMemo(safeByCategory, []);
  const counts = useMemo(() => Object.fromEntries(CATS.map((c) => [c, byCat[c]?.length ?? 0])) as Record<EncyclopediaCategory, number>, [byCat]);
  const [cat, setCat] = useState<EncyclopediaCategory>('kisi');
  const [q, setQ] = useState('');
  const [current, setCurrent] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [cursor, setCursor] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLOListElement>(null);

  // external open requests (event cards, HUD): store.ui.encyclopediaEntry
  useEffect(() => {
    const id = st.ui.encyclopediaEntry;
    if (id && id !== current) {
      const e = getEncyclopediaEntry(id);
      if (e) {
        setCat(e.category);
        setQ('');
        setCurrent(id);
      }
    }
  }, [st.ui.encyclopediaEntry]);

  const list: EncyclopediaEntry[] = q.trim() ? safeSearch(q) : byCat[cat] ?? [];
  const entry = current ? getEncyclopediaEntry(current) : undefined;

  useEffect(() => {
    const i = list.findIndex((e) => e.id === current);
    if (i >= 0) setCursor(i);
  }, [current, cat, q]);
  useEffect(() => {
    listRef.current?.querySelector('.odak')?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  const openEntry = (id: string, push = true) => {
    if (id === current) return;
    sfx('sayfa');
    if (push && current) setHistory((h) => [...h.slice(-20), current]);
    const e = getEncyclopediaEntry(id);
    if (e && !q.trim()) setCat(e.category);
    setCurrent(id);
  };
  const back = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    openEntry(prev, false);
  };
  const close = () => {
    setHistory([]);
    closePanel(['ansiklopedi']);
    store.setUi({ encyclopediaEntry: null });
  };

  return (
    <Modal
      open={open}
      onClose={close}
      px={px}
      width={500}
      class="ansiklopedi"
      title={
        <>
          <PxImg src={iconUrl('kitap')} w={13} h={12} k={px} /> Ansiklopedi
        </>
      }
      onKey={(e) => {
        const typing = (e.target as HTMLElement)?.tagName === 'INPUT';
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          const n = list.length;
          if (!n) return true;
          const c = navStep(cursor, e.key === 'ArrowDown' ? 1 : -1, n);
          setCursor(c);
          sfx('tik');
          return true;
        }
        if (e.key === 'Enter') {
          const it = list[cursor];
          if (it) openEntry(it.id);
          return true;
        }
        if (!typing && e.key === '/') {
          searchRef.current?.focus();
          return true;
        }
        if (!typing && e.key === 'Backspace') {
          back();
          return true;
        }
        if (typing && e.key === 'Escape' && q) {
          setQ('');
          return true;
        }
        return false;
      }}
    >
      <div class="ans-govde">
        <aside class="ans-sol">
          <label class="ans-ara">
            <PxImg src={artUrl('search', drawSearchIcon)} w={10} h={10} k={px} />
            <input
              ref={searchRef}
              type="search"
              placeholder="Ara… (/)"
              value={q}
              spellcheck={false}
              onInput={(e) => {
                setQ((e.target as HTMLInputElement).value);
                setCursor(0);
              }}
            />
          </label>
          {!q.trim() && (
            <div class="ans-sekmeler">
              {CATS.map((c) => (
                <button
                  key={c}
                  type="button"
                  class={c === cat ? 'secili' : ''}
                  title={ENCYCLOPEDIA_KATEGORI_ADI[c]}
                  onClick={() => {
                    sfx('sayfa');
                    setCat(c);
                    setCursor(0);
                  }}
                >
                  <PxImg src={iconUrl(c)} w={12} h={12} k={px} />
                  <span>{ENCYCLOPEDIA_KATEGORI_ADI[c].split(' ')[0]}</span>
                </button>
              ))}
            </div>
          )}
          <div class="ans-liste-baslik">
            {q.trim() ? `“${q.trim()}” için ${list.length} sonuç` : `${ENCYCLOPEDIA_KATEGORI_ADI[cat]} · ${list.length}`}
          </div>
          <ol class="ans-liste uk-kaydir" ref={listRef}>
            {list.map((e, i) => (
              <li key={e.id}>
                <button
                  type="button"
                  class={`${e.id === current ? 'secili' : ''} ${i === cursor ? 'odak' : ''}`}
                  onClick={() => {
                    setCursor(i);
                    openEntry(e.id);
                  }}
                >
                  <span>{e.title}</span>
                  {e.dogrulanacak && <i class="d-isaret" title="Doğrulanacak bilgi içerir" />}
                </button>
              </li>
            ))}
            {!list.length && <li class="ans-bos">Sonuç yok.</li>}
          </ol>
        </aside>
        <section class="ans-sag uk-kaydir">
          {history.length > 0 && entry && (
            <button type="button" class="ans-geri" onClick={back} title="Geri (Backspace)">
              <PxImg src={iconUrl('geri')} w={12} h={12} k={px} /> Geri
            </button>
          )}
          {entry ? <Article e={entry} open={openEntry} /> : <Welcome open={openEntry} counts={counts} pick={(c) => setCat(c)} />}
        </section>
      </div>
    </Modal>
  );
}

function safeSearch(q: string): EncyclopediaEntry[] {
  try {
    return searchEncyclopedia(q);
  } catch {
    return [];
  }
}
