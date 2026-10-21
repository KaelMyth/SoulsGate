import { CONFIG, BUILD } from './config_game.js';
import { TUNABLES } from './config_tunables.js';
import { loadOverrides, safeStorage } from './debug_tunables.js';
import { lockBrowserGestures } from './platform_viewport.js';
import { Game } from './game.js';

const storage = safeStorage();
const storageKey = 'proto.tunables.v' + CONFIG.version;

// Стартовые значения запоминаем до применения сохранённых ползунков (нужны для «Сбросить параметры»).
const defaults = JSON.parse(JSON.stringify(CONFIG));
loadOverrides(CONFIG, TUNABLES, storage, storageKey);

lockBrowserGestures(document, '#dbg-panel, #dbg-btn, #death-screen, #pause-btn, #pause-screen, #slot-btn');

const game = new Game({
  canvas: document.getElementById('game'),
  uiRoot: document.getElementById('ui-root'),
  probe: document.getElementById('safe-probe'),
  config: CONFIG,
  defaults,
  tunables: TUNABLES,
  build: BUILD,
  storage,
  storageKey,
});
game.start();

window.__game = game; // для отладки с компьютера через консоль браузера
