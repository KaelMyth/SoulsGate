import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../echo-gate/src/config.js';
import { Motion } from '../echo-gate/src/motion.js';
import { screenToWorld, worldToScreen } from '../echo-gate/src/iso.js';

test('изометрия: вверх по экрану уходит от камеры, вправо идёт вправо, длина сохраняется', () => {
  const o = {};
  screenToWorld(0, -1, o);
  assert.ok(o.x < 0 && o.z < 0, 'вверх = к (-x, -z)');
  screenToWorld(1, 0, o);
  assert.ok(o.x > 0 && o.z < 0, 'вправо = (+x, -z)');
  screenToWorld(0.6, 0.8, o);
  assert.ok(Math.abs(Math.hypot(o.x, o.z) - 1) < 1e-9);
  const back = {};
  worldToScreen(o.x, o.z, back);
  assert.ok(Math.abs(back.x - 0.6) < 1e-9 && Math.abs(back.y - 0.8) < 1e-9, 'обратное преобразование');
});

test('движение: полный стик даёт скорость героя', () => {
  const m = new Motion(CONFIG);
  for (let i = 0; i < 120; i++) m.update(1 / 60, 1, 0);
  assert.ok(Math.abs(m.speed - CONFIG.hero.speed) < 0.01);
  for (let i = 0; i < 60; i++) m.update(1 / 60, 0, 0);
  assert.ok(m.speed < 0.01, 'стик отпущен: остановился');
});

test('рывок проходит ровно dash.distance за duration и перезаряжается', () => {
  const m = new Motion(CONFIG);
  assert.ok(m.startDash(1, 0));
  assert.ok(!m.startDash(1, 0), 'второй рывок в рывке не стартует');
  const steps = Math.round(CONFIG.dash.duration * 6000); // мелкий шаг: интеграл точнее
  for (let i = 0; i < steps; i++) m.update(1 / 6000, 0, 0);
  assert.ok(!m.dashing);
  assert.ok(Math.abs(m.x - CONFIG.dash.distance) < 0.05, 'прошёл ' + m.x);
  assert.ok(!m.startDash(0, 1), 'перезарядка');
  for (let i = 0; i < 60 * 2; i++) m.update(1 / 60, 0, 0);
  assert.ok(m.startDash(0, 1), 'после перезарядки снова можно');
});

test('рывок без направления не стартует', () => {
  assert.ok(!new Motion(CONFIG).startDash(0, 0));
});
