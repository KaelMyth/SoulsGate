import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../echo-gate/src/config.js';
import { Spawner } from '../echo-gate/src/spawner.js';

const stub = () => ({ group: { visible: false }, addTo() {}, update() {} });
const mk = () => {
  const cfg = JSON.parse(JSON.stringify(CONFIG));
  const sp = new Spawner(null, cfg, stub);
  sp.start();
  return { cfg, sp };
};
const hero = { x: 0, z: 0, radius: 0.47 };
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const run = (sp, sec, h = hero) => { for (let t = 0; t < sec; t += 1 / 60) sp.update(1 / 60, h, 12, rnd); };

test('здоровье жука: 1.6 выстрела, +0.333 за волну, скачок 10% на каждой 5-й', () => {
  const { sp } = mk();
  assert.equal(sp.hpFor(1), 1.6);
  assert.ok(Math.abs(sp.hpFor(2) - 1.9333333333) < 1e-6);
  assert.ok(Math.abs(sp.hpFor(5) - (1.6 + 4 / 3) * 1.1) < 1e-6);
});

test('волна 1: пачки по 4 за краем экрана, не больше 16 живых', () => {
  const { sp } = mk();
  run(sp, 2.6 + 0.1); // пауза 2.5 → первая пачка
  assert.equal(sp.alive.length, 4);
  for (const b of sp.alive) assert.ok(Math.hypot(b.x, b.z) > 12); // за краем экрана (радиус 12 м)
  run(sp, 30);
  assert.ok(sp.alive.length <= 16);
});

test('жуки бегут к герою со скоростью 2.83 м/с', () => {
  const { sp } = mk();
  run(sp, 2.6);
  const b = sp.alive[0];
  const d0 = Math.hypot(b.x, b.z);
  run(sp, 1);
  const d1 = Math.hypot(b.x, b.z);
  assert.ok(d0 - d1 > 2 && d0 - d1 < 3.4, `прошёл ${d0 - d1}`);
});

test('касание бьёт героя, пауза 0.8 с между ударами одного жука', () => {
  const { sp } = mk();
  let hits = 0;
  sp.onTouch = () => { hits++; return true; };
  sp.spawnAt(0.5, 0, 0, 0);
  sp.enabled = true;
  sp.phase = 'active'; sp.spawned = 99; // без новых пачек
  for (let t = 0; t < 2.0; t += 1 / 60) sp.moveBeetles(1 / 60, hero);
  assert.equal(hits, 3); // 0, 0.8, 1.6
});

test('откидывание сдвигает жука на 0.47 м', () => {
  const { sp } = mk();
  const b = sp.spawnAt(5, 0, 0, 0);
  sp.knock(b, 1, 0);
  const x0 = b.x;
  b.hx = 0; b.hz = 0; // курс не мешает
  const B = sp.cfg.beetle; B.speed = 0;
  for (let t = 0; t < 0.6; t += 1 / 60) sp.moveBeetles(1 / 60, { x: 100, z: 0, radius: 0.47 });
  assert.ok(Math.abs(b.x - x0 - 0.47) < 0.1, `сдвиг ${b.x - x0}`);
});

test('волна кончается, когда убиты все; следующая после паузы, жуков больше', () => {
  const { sp } = mk();
  run(sp, 2.6);
  sp.spawned = sp.waveCount();
  for (const b of [...sp.alive]) sp.kill(b);
  run(sp, 0.1);
  assert.equal(sp.wave, 2);
  assert.equal(sp.phase, 'pause');
  assert.equal(sp.waveCount(), 24);
});

test('жуки не слипаются в точку и не заходят в героя', () => {
  const { sp } = mk();
  for (let i = 0; i < 10; i++) sp.spawnAt(3, 3, 0, 0);
  sp.enabled = true; sp.phase = 'active'; sp.spawned = 99;
  for (let t = 0; t < 8; t += 1 / 60) sp.moveBeetles(1 / 60, hero);
  for (const b of sp.alive) assert.ok(Math.hypot(b.x, b.z) >= 0.47 + 0.5 - 0.1);
});
