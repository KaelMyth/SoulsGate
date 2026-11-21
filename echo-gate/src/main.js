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
  eyeBlink: document.getElementById('eye-blink'),
  floorBanner: document.getElementById('floor-banner'),
  floorCleared: document.getElementById('floor-cleared'),
  floorRewards: document.getElementById('floor-rewards'),
  bossHealth: document.getElementById('boss-health'),
  bossFill: document.getElementById('boss-fill'),
  wakeBtn: document.getElementById('wake-btn'),
  continueBtn: document.getElementById('continue-btn'),
  deathScreen: document.getElementById('death-screen'),
  deathFloor: document.getElementById('death-floor'),
  deathCurrency: document.getElementById('death-currency'),
  deathCollected: document.getElementById('death-collected'),
  deathGrid: document.getElementById('death-grid'),
  deathHome: document.getElementById('death-home'),
  deathRecover: document.getElementById('death-recover'),
  testAd: document.getElementById('test-rewarded-ad'),
  testAdClaim: document.getElementById('test-ad-claim'),
  testAdCancel: document.getElementById('test-ad-cancel'),
  toast: document.getElementById('toast'),
  fps: document.getElementById('fps'),
  shopBtn: document.getElementById('shop-btn'),
  gearBtn: document.getElementById('gear-btn'),
  soulHud: document.getElementById('souls-hud'),
  saveBtn: document.getElementById('save-btn'),
  anvilBtn: document.getElementById('anvil-btn'),
  devBtn: document.getElementById('dev-btn'),
  pauseBtn: document.getElementById('pause-btn'),
  dashBtn: document.getElementById('dash-btn'),
  pause: document.getElementById('pause'),
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
