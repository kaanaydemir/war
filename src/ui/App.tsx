import { useGame } from './useGame';
import { Hud } from './hud';
import { EndScreen, LoadingScreen, Overlays, TitleScreen } from './screens';

/** Top-level UI router (owner: ui-screens agent may extend). */
export function App() {
  const st = useGame();
  const screen = st.ui.screen;
  return (
    <>
      {screen === 'yukleniyor' && <LoadingScreen />}
      {screen === 'baslik' && <TitleScreen />}
      {screen === 'oyun' && <Hud />}
      {screen === 'son' && <EndScreen />}
      {screen !== 'yukleniyor' && <Overlays />}
    </>
  );
}
