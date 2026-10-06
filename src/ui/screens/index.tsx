import { useGame } from '../useGame';

/** STUBS (owner: ui-screens agent). */
export function LoadingScreen() {
  const p = Math.round(((window as any).__loadProgress ?? 0) * 100);
  return <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 24 }}>Yükleniyor… {p}%</div>;
}

export function TitleScreen() {
  const st = useGame();
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
      <div class="etkilesim" style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: 48 }}>İstanbul'un Fethi — 1453</h1>
        <button onClick={() => st.actions.newGame('normal')}>Yeni Oyun</button>
      </div>
    </div>
  );
}

export function EndScreen() {
  const st = useGame();
  const o = st.state?.outcome;
  return (
    <div class="etkilesim" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: '#0008' }}>
      <div>
        <h1>{o?.result === 'zafer' ? 'Zafer' : 'Yenilgi'}</h1>
        <button onClick={() => st.actions.toTitle()}>Başlığa dön</button>
      </div>
    </div>
  );
}

/** Modals/cards layered over every screen (event cards, encyclopedia…). */
export function Overlays() {
  return null;
}
