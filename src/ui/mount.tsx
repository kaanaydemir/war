import { render } from 'preact';
import { App } from './App';

export function mountUi(el: HTMLElement): void {
  render(<App />, el);
}
