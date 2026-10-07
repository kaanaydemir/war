import { useEffect, useRef, useState } from 'preact/hooks';
import { useGame } from './useGame';
import { Hud } from './hud';
import { EndScreen, LoadingScreen, Overlays, TitleScreen } from './screens';
import type { Screen } from '../core/store';

/**
 * Top-level UI router. Screens cross-fade: the incoming screen fades in while
 * the outgoing one is kept for a short fade-out (owner: ui-screens).
 * QA: `?ekran=yukleniyor` shows the loading screen with simulated progress.
 */
export function App() {
  const st = useGame();
  const forced = useForcedScreen();
  const screen = forced ?? st.ui.screen;
  const prev = useRef<Screen>(screen);
  const [leaving, setLeaving] = useState<Screen | null>(null);
  useEffect(() => {
    if (prev.current !== screen) {
      const old = prev.current;
      prev.current = screen;
      // only the loading screen gets a visible fade-out (others are behind the curtain)
      if (old === 'yukleniyor') {
        setLeaving(old);
        const t = setTimeout(() => setLeaving(null), 900);
        return () => clearTimeout(t);
      }
    }
  }, [screen]);
  return (
    <>
      {screen === 'baslik' && (
        <div class="ekran-gecis" key="baslik">
          <TitleScreen />
        </div>
      )}
      {screen === 'oyun' && <Hud />}
      {screen === 'son' && (
        <div class="ekran-gecis" key="son">
          <EndScreen />
        </div>
      )}
      {screen !== 'yukleniyor' && <Overlays />}
      {(screen === 'yukleniyor' || leaving === 'yukleniyor') && (
        <div class={`ekran-gecis yukleme-kap ${screen !== 'yukleniyor' ? 'cikiyor' : ''}`} key="yukleniyor">
          <LoadingScreen simulated={forced === 'yukleniyor'} />
        </div>
      )}
    </>
  );
}

function useForcedScreen(): Screen | null {
  const [f] = useState<Screen | null>(() => {
    try {
      const v = new URLSearchParams(location.search).get('ekran');
      return v === 'yukleniyor' ? 'yukleniyor' : null;
    } catch {
      return null;
    }
  });
  return f;
}
