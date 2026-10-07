/**
 * SCREENS & MODALS (owner: ui-screens).
 *
 * LoadingScreen · TitleScreen · EndScreen and the Overlays layer (event cards,
 * encyclopedia, settings, pause menu, toasts, transition curtain) rendered on
 * top of every screen. Shared look primitives are documented in ui-kit.css.
 */
import './ui-kit.css';
import './screens.css';
import { useGame } from '../useGame';
import { Encyclopedia } from './Encyclopedia';
import { EventCard } from './EventCard';
import { Curtain, Toasts, usePx } from './kit';
import { MenuButton, PauseMenu } from './PauseMenu';
import { SettingsModal } from './Settings';
import { applyQaOnce } from './qa';

export { LoadingScreen } from './Loading';
export { TitleScreen } from './Title';
export { EndScreen } from './End';
export { installUiKit } from './art';
export { loadSettings } from './settings';
export { transition, toast } from './kit';
export { openPanel, closePanel } from './panels';
export { openPauseMenu } from './PauseMenu';

/** Modals/cards layered over every screen (event cards, encyclopedia, settings, pause menu…). */
export function Overlays() {
  const st = useGame();
  const px = usePx();
  const playing = st.ui.screen === 'oyun';
  applyQaOnce();
  return (
    <>
      {playing && <MenuButton />}
      {playing && <EventCard />}
      <PauseMenu />
      <SettingsModal />
      <Encyclopedia />
      <Toasts px={px} />
      <Curtain />
    </>
  );
}
