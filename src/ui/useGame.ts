import { useEffect, useReducer } from 'preact/hooks';
import { store } from '../core/store';

/**
 * Re-render the calling component whenever the store notifies (~8 Hz while the
 * sim runs, immediately after UI changes). Read `store.state` / `store.ui` directly.
 */
export function useGame(): typeof store {
  const [, force] = useReducer((x: number, _a: number) => x + 1, 0);
  useEffect(() => store.subscribe(() => force(0)), []);
  return store;
}
