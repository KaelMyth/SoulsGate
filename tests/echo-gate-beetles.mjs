import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../echo-gate/src/config.js';
import { Spawner } from '../echo-gate/src/spawner.js';

const stub = () => ({ group: { visible: false }, addTo() {}, update() {} });
const count = (sp, k) => sp.alive.filter((b) => b.kind === k).length;
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

test('стрелок: здоровье 14.08/12, держит дистанцию 6.33 м и стреляет после 1.2 с + прицеливание 0.5 с', () => {
  const { sp } = mk();
  sp.enabled = true; sp.phase = 'active'; sp.spawned = 999;
  const s = sp.spawnAt(12, 0, 0, 0, 'shooter');
  assert.ok(Math.abs(s.hp - 14.08 / 12) < 0.01);
  const shots = [];
  sp.onShot = (e, dx, dz) => shots.push([sp.cfg.shooter.keepDistance, Math.hypot(e.x, e.z), dx, dz]);
  let t = 0;
  for (; t < 12 && shots.length === 0; t += 1 / 60) sp.moveBeetles(1 / 60, hero);
  assert.equal(shots.length, 1);
  const d = Math.hypot(s.x, s.z);
  assert.ok(Math.abs(d - 6.33) < 0.2, `дистанция ${d}`);
  assert.ok(shots[0][2] < -0.99); // стреляет в героя (в сторону -x)
});

test('стрелок не стреляет, пока герой дальше 8.67 м', () => {
  const { sp } = mk();
  const s = sp.spawnAt(30, 0, 0, 0, 'shooter');
  let n = 0;
  sp.onShot = () => n++;
  s.speed = 0; sp.cfg.shooter.speed = 0;
  for (let t = 0; t < 6; t += 1 / 60) sp.moveBeetles(1 / 60, hero);
  assert.equal(n, 0);
});

test('волна 2: стрелок в кольце из 5 охранников; охрана бросается в бой, когда стрелок убит', () => {
  const { sp } = mk();
  sp.wave = 2;
  sp.spawnGroup(6, sp.row(2), 0, 0, 12, rnd);
  assert.equal(count(sp, 'shooter'), 1);
  assert.equal(count(sp, 'beetle'), 5);
  const leader = sp.alive.find((b) => b.kind === 'shooter');
  const guards = sp.alive.filter((b) => b.guardOf === leader);
  assert.equal(guards.length, 5);
  for (const g of guards) assert.ok(Math.abs(Math.hypot(g.x - leader.x, g.z - leader.z) - 1.53) < 0.01);
  sp.kill(leader);
  sp.moveBeetles(1 / 60, hero);
  assert.ok(guards.every((g) => g.guardOf === null && !g.goalOn));
});

test('охрана держится кольцом, пока герой далеко, и бросается в бой, когда герой ближе 3.5 м', () => {
  const { sp } = mk();
  sp.wave = 2;
  sp.spawnGroup(6, sp.row(2), 0, 0, 12, rnd);
  for (let t = 0; t < 2; t += 1 / 60) sp.moveBeetles(1 / 60, hero);
  assert.ok(sp.alive.some((b) => b.guardOf));
  sp.moveBeetles(1 / 60, { x: sp.alive.find((b) => b.kind === 'shooter').x + 1, z: 0, radius: 0.47 });
  assert.ok(sp.alive.every((b) => !b.guardOf));
});

test('волны 6+: часть жуков стрелки (шанс 0.2); волны 1 и 4 без стрелков', () => {
  const { sp } = mk();
  sp.wave = 7;
  for (let i = 0; i < 40; i++) sp.spawnGroup(4, sp.row(7), 0, 0, 12, rnd);
  const share = count(sp, 'shooter') / sp.alive.length;
  assert.ok(share > 0.1 && share < 0.3, `доля ${share}`);
  sp.clear();
  sp.wave = 4;
  sp.spawnGroup(12, sp.row(4), 0, 0, 12, rnd);
  assert.equal(count(sp, 'shooter'), 0);
});
