import { render } from 'preact';
import { App } from './App';
import { installUiKit, loadSettings } from './screens';

export function mountUi(el: HTMLElement): void {
  installUiKit();
  loadSettings();
  render(<App />, el);
}
