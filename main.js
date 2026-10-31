import { CONFIG, BUILD } from './config_game.js';
import { RELEASE } from './release_notes.js';
import { TUNABLES } from './config_tunables.js';
import { loadOverrides, safeStorage } from './debug_tunables.js';
import { lockBrowserGestures } from './platform_viewport.js?v=209';
import { Game } from './game.js?v=209';

// Однозначный лог загрузки: номер и суть обновления доступны сразу в консоли.
console.info('[SoulGates] Обновление №' + RELEASE.number + ' — ' + RELEASE.title);
window.__SOULSGATE_RELEASE__ = RELEASE;

const storage = safeStorage();
const storageKey = 'proto.tunables.v' + CONFIG.version;

// Стартовые значения запоминаем до применения сохранённых ползунков (нужны для «Сбросить параметры»).
const defaults = JSON.parse(JSON.stringify(CONFIG));
loadOverrides(CONFIG, TUNABLES, storage, storageKey);

// Оракл и Настройки — прокручиваемые окна: их свайпы нельзя блокировать обработчиком жестов.
lockBrowserGestures(document, '#dbg-panel, #dbg-btn, #death-screen, #pause-btn, #pause-screen, #mode-screen, #settings-screen, #oracle-screen, #tutorial-choice, #tutorial-guide');

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
  menu: true, // игра начинается с экрана выбора режима
});
game.start();

window.__game = game; // для отладки с компьютера через консоль браузера
