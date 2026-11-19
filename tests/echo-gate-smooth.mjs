import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../echo-gate/src/config.js';
import { Motion } from '../echo-gate/src/motion.js';
import { advance, MAX_STEP } from '../echo-gate/src/timestep.js';

// Неровные кадры: обычно 16–18 мс, иногда 8 и 33 мс (так ведёт себя requestAnimationFrame на телефоне).
function frames(n) {
  const out = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < n; i++) {
    const r = rnd();
    out.push(r < 0.08 ? 0.033 : r < 0.16 ? 0.008 : 0.016 + rnd() * 0.002);
  }
  return out;
}

test('герой на экране идёт по прямой со скоростью героя: смещение за кадр = скорость × время кадра', () => {
  const m = new Motion(CONFIG);
  for (let i = 0; i < 60; i++) advance(1 / 60, (s) => m.update(s, 1, 0)); // разогнались
  let worst = 0;
  for (const dt of frames(300)) {
    const x0 = m.x;
    advance(dt, (s) => m.update(s, 1, 0));
    worst = Math.max(worst, Math.abs(m.x - x0 - CONFIG.hero.speed * dt));
  }
  assert.ok(worst < 1e-6, 'рывок смещения за кадр ' + worst);
});

test('длинный кадр режется на куски не длиннее MAX_STEP и сумма шагов равна кадру', () => {
  const parts = [];
  advance(0.1, (s) => parts.push(s));
  assert.ok(parts.length >= 3 && parts.every((s) => s <= MAX_STEP + 1e-12));
  assert.ok(Math.abs(parts.reduce((a, b) => a + b, 0) - 0.1) < 1e-9);
});
