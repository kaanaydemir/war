import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/700.css';
import '@fontsource/silkscreen/400.css';
import './styles/base.css';
import { createGame } from './game/Game';
import { mountUi } from './ui/mount';

mountUi(document.getElementById('ui')!);
createGame('game');
