import { CONFIG } from './config.js';
import { Game } from './game.js';

const canvas = document.getElementById('view');
const ui = {
  base: document.getElementById('stick-base'),
  knob: document.getElementById('stick-knob'),
  hint: document.getElementById('hint'),
};
const R = CONFIG.stick.radius;
ui.base.style.width = ui.base.style.height = `${R * 2}px`;
ui.knob.style.width = ui.knob.style.height = `${R * 0.84}px`;

const game = new Game({ canvas, config: CONFIG, ui });
window.__echo = game; // для отладки и автотестов
game.start();
