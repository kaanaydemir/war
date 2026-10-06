import { formatClock, formatDate, siegeDayNumber } from '../../core/calendar';
import { RESOURCE_ADI, RESOURCE_IDS } from '../../core/state';
import { useGame } from '../useGame';

/** STUB (owner: ui-hud agent): in-game HUD. */
export function Hud() {
  const st = useGame();
  const s = st.state;
  if (!s) return null;
  const gun = siegeDayNumber(s.time.day, s.time.siegeStartDay);
  return (
    <div class="etkilesim" style={{ position: 'absolute', top: 8, left: 8, padding: 8, background: '#17131fcc', fontSize: 16 }}>
      <div>
        {formatDate(s.time.day)} {formatClock(s.time.day)} {gun ? `— Gün ${gun}` : ''}
      </div>
      <div>{RESOURCE_IDS.map((r) => `${RESOURCE_ADI[r]}: ${Math.floor(s.resources[r])}`).join(' · ')}</div>
      <div>
        {[0, 1, 2, 3].map((v) => (
          <button onClick={() => st.dispatch({ t: 'hiz', speed: v as 0 | 1 | 2 | 3 })}>{v === 0 ? '❚❚' : `${v}×`}</button>
        ))}
      </div>
    </div>
  );
}
