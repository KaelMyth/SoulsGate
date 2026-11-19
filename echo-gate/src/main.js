import { CONFIG } from './config.js';
import { Game } from './game.js';
import { loadBuildInfo } from './version.js';

const canvas = document.getElementById('view');
const ui = {
  base: document.getElementById('stick-base'),
  knob: document.getElementById('stick-knob'),
  start: document.getElementById('start'),
  root: document.getElementById('phone'),
  playBtn: document.getElementById('play'),
  fade: document.getElementById('fade'),
};
const R = CONFIG.stick.radius;
ui.base.style.width = ui.base.style.height = `${R * 2}px`;
ui.knob.style.width = ui.knob.style.height = `${R * 0.84}px`;

const game = new Game({ canvas, config: CONFIG, ui });
window.__echo = game; // для отладки и автотестов
game.start();

loadBuildInfo(CONFIG.repo).then((b) => {
  document.getElementById('build-ver').textContent = b.version;
  document.getElementById('build-notes').textContent = b.notes;
});
