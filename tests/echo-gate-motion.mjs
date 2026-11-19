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

test('index.html: список модулей для защиты от кеша совпадает с файлами src/, в version.json есть номер сборки', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const html = readFileSync(new URL('../echo-gate/index.html', import.meta.url), 'utf8');
  const listed = JSON.parse(html.match(/const files = (\[.*?\]);/)[1].replace(/'/g, '"')).sort();
  const actual = readdirSync(new URL('../echo-gate/src/', import.meta.url)).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3)).sort();
  assert.deepEqual(listed, actual);
  const v = JSON.parse(readFileSync(new URL('../echo-gate/version.json', import.meta.url), 'utf8'));
  assert.ok(Number.isInteger(v.build) && v.build > 0);
});

test('круглое препятствие (костёр): в него не войти, вдоль круга скользит', () => {
  const m = new Motion(CONFIG);
  m.bounds = { hx: 13, hz: 30, ang: 0, blocks: [{ x: 0, z: 0, r: 1.8 }] };
  m.x = 0; m.z = 5;
  let minD = 99;
  for (let i = 0; i < 600; i++) { m.update(1 / 60, 0.05, -1); minD = Math.min(minD, Math.hypot(m.x, m.z)); } // идёт на костёр
  assert.ok(minD >= 1.8 - 1e-6, `подошёл на ${minD}`);
  assert.ok(Math.abs(m.x) > 0.3 || m.z > 1.7); // обходит или упёрся, но не внутри
});
