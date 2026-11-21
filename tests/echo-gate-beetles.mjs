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

test('бык: здоровье 3.2, идёт к герою, на 10 м замирает на замах 0.9 с, рывок бьёт на 20', () => {
  const { sp } = mk();
  sp.enabled = true; sp.phase = 'active'; sp.spawned = 999;
  const b = sp.spawnAt(9, 0, 0, 0, 'bull');
  assert.ok(Math.abs(b.hp - 3.2) < 1e-9);
  const hits = [];
  sp.onAttack = (e, dmg) => hits.push(dmg);
  const states = new Set();
  let sawLine = null;
  for (let t = 0; t < 4 && !hits.length; t += 1 / 60) {
    sp.moveBeetles(1 / 60, hero);
    states.add(b.atk.state);
    const g = sp.telegraph(b);
    if (g && !sawLine) sawLine = { ...g };
  }
  assert.deepEqual(hits, [20]);
  assert.ok(states.has('windup') && states.has('strike'));
  assert.ok(sawLine && Math.abs(sawLine.length - 8.67) < 0.01 && sawLine.width >= 1);
});

test('бык: от рывка можно уйти, направление запоминается на замахе', () => {
  const { sp } = mk();
  sp.enabled = true; sp.phase = 'active'; sp.spawned = 999;
  const b = sp.spawnAt(9, 0, 0, 0, 'bull');
  b.atk.cd = 0;
  const hits = [];
  sp.onAttack = (e, dmg) => hits.push(dmg);
  let h = { x: 0, z: 0, radius: 0.47 };
  for (let t = 0; t < 3; t += 1 / 60) {
    sp.moveBeetles(1 / 60, h);
    if (b.atk.state === 'windup' && b.atk.t > 0.5) h = { x: 0, z: 6, radius: 0.47 }; // герой отошёл вбок
  }
  assert.equal(hits.length, 0);
});

test('волна 3: в каждой второй пачке один свободный бык вместо охранника', () => {
  const { sp } = mk();
  sp.wave = 3;
  sp.spawned = 0; sp.spawnGroup(6, sp.row(3), 0, 0, 12, rnd);
  assert.equal(count(sp, 'bull'), 0);
  sp.spawned = 6; sp.spawnGroup(6, sp.row(3), 0, 0, 12, rnd);
  assert.equal(count(sp, 'bull'), 1);
  assert.equal(count(sp, 'shooter'), 2);
  assert.ok(!sp.alive.find((b) => b.kind === 'bull').guardOf);
});

test('быки: откидывание выстрела 0.6 от обычного', () => {
  const { sp } = mk();
  const b = sp.spawnAt(5, 0, 0, 0, 'bull');
  sp.knock(b, 1, 0);
  assert.ok(Math.abs(b.kbVx * 0.07 - 0.47 * 0.6) < 1e-6);
});

test('градации: доли стрелков и быков с 6 волны растут и упираются в потолок', () => {
  const { sp } = mk();
  assert.equal(sp.share('shooter', 5), 0);
  assert.ok(Math.abs(sp.share('shooter', 6) - 0.12) < 1e-9);
  assert.ok(sp.share('shooter', 8) > sp.share('shooter', 6));
  assert.equal(sp.share('shooter', 100), 0.3);
  assert.equal(sp.share('bull', 100), 0.2);
});

test('скала: до 10 волны нет, на 10 одна, на 20 две; выходит целиком за краем экрана', () => {
  const { sp } = mk();
  assert.equal(sp.rockCount(9), 0);
  assert.equal(sp.rockCount(10), 1);
  assert.equal(sp.rockCount(15), 0);
  assert.equal(sp.rockCount(20), 2);
  sp.wave = 10;
  sp.spawnRocks(0, 0, 12, rnd);
  const r = sp.alive.find((b) => b.kind === 'rock');
  assert.ok(r);
  assert.ok(Math.hypot(r.x, r.z) - r.radius >= 12); // ближний край скалы за краем экрана
  assert.equal(r.radius, 2.0);
  assert.ok(r.heavy);
});

test('скала: подходит, на 9.3 м замахивается 0.9 с и выпускает мошек', () => {
  const { sp } = mk();
  sp.enabled = true; sp.phase = 'active'; sp.spawned = 999;
  const r = sp.spawnAt(14, 0, 0, 0, 'rock');
  let slams = 0;
  sp.onSlam = () => slams++;
  const states = new Set();
  let ring = null;
  for (let t = 0; t < 8 && !slams; t += 1 / 60) {
    sp.moveBeetles(1 / 60, hero);
    states.add(r.atk.state);
    const g = sp.telegraph(r);
    if (g && !ring) ring = { ...g };
  }
  assert.equal(slams, 1);
  assert.ok(states.has('windup'));
  assert.equal(ring.shape, 'circle');
  assert.ok(Math.abs(ring.radius - 3.4) < 1e-9);
});

test('мошки: разлетаются, кружат вокруг героя и бросаются; выстрел сбивает; попадание бьёт на 8', async () => {
  const { Midges } = await import('../echo-gate/src/midges.js');
  const cfg = JSON.parse(JSON.stringify(CONFIG));
  const mg = new Midges(cfg, rnd);
  mg.burst(10, 0, hero, 8, cfg.rock.midge);
  assert.equal(mg.count, 8);
  const hits = [];
  let t = 0;
  let minD = 99;
  for (; t < 8 && mg.count > 0; t += 1 / 60) {
    mg.update(1 / 60, hero, (d) => hits.push(d));
    for (const m of mg.items) if (m.active && t > 0.6 && t < 3.5) minD = Math.min(minD, Math.hypot(m.x, m.z));
  }
  assert.ok(hits.length > 0 && hits.every((d) => d === 8));
  assert.ok(minD > 1.5, `кружили на ${minD}`); // не лезли в героя во время кружения
  mg.burst(10, 0, hero, 3, cfg.rock.midge);
  const m = mg.hitTest(10, 0, 0.17);
  assert.ok(m);
  mg.kill(m, 'shot');
  assert.equal(mg.count, 2);
});

test('отставший враг переносится на кольцо за экраном, скала и стрелок с охраной остаются', () => {
  const { cfg, sp } = mk();
  const R = 12, ring = R + cfg.waves.margin;
  const far = sp.spawnAt(80, 0, 0, 0, 'beetle');
  const bull = sp.spawnAt(0, -90, 0, 0, 'bull');
  const rock = sp.spawnAt(60, 60, 0, 0, 'rock');
  const lead = sp.spawnAt(-70, 0, 0, 0, 'shooter');
  const guard = sp.spawnAt(-72, 0, 0, 0, 'beetle');
  guard.guardOf = lead;
  bull.atk.state = 'windup';
  sp.farTimer = 0;
  sp.respawnFar(0.01, hero, R, rnd);
  assert.ok(Math.abs(Math.hypot(far.x, far.z) - ring) < 1e-6, 'жук на кольце');
  assert.ok(Math.abs(Math.hypot(bull.x, bull.z) - ring) < 1e-6, 'бык на кольце');
  assert.equal(bull.atk.state, 'idle'); // замах сбросился
  assert.equal(far.state.x, far.x);
  assert.equal(rock.x, 60); // скалу не трогаем
  assert.equal(lead.x, -70); // стрелок с охраной остаётся
  assert.equal(guard.x, -72);
  // близкий не двигается, при выключенной настройке тоже
  const near = sp.spawnAt(ring + 3, 0, 0, 0, 'beetle');
  sp.farTimer = 0; sp.respawnFar(0.01, hero, R, rnd);
  assert.equal(near.x, ring + 3);
  cfg.waves.respawnFar = 0;
  const off = sp.spawnAt(90, 0, 0, 0, 'beetle');
  sp.farTimer = 0; sp.respawnFar(0.01, hero, R, rnd);
  assert.equal(off.x, 90);
});

test('охрана закрывает стрелка веером со стороны героя, а когда герой подошёл к одному охраннику, нападает вся охрана', () => {
  const { sp } = mk();
  sp.wave = 2;
  sp.spawnGroup(6, sp.row(2), 0, 0, 12, rnd);
  const leader = sp.alive.find((b) => b.kind === 'shooter');
  const guards = sp.alive.filter((b) => b.guardOf === leader);
  const far = { x: leader.x + 20, z: leader.z - 6, radius: 0.47 };
  for (let t = 0; t < 4; t += 1 / 60) sp.moveBeetles(1 / 60, far); // герой далеко: охрана встаёт на место
  const toHero = Math.atan2(far.z - leader.z, far.x - leader.x);
  for (const g of guards) {
    assert.ok(g.guardOf, 'держит строй');
    let da = Math.atan2(g.goalZ - leader.z, g.goalX - leader.x) - toHero;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    assert.ok(Math.abs(da) <= 1.4, 'цель на стороне героя');
  }
  // герой подходит только к одному охраннику: нападает вся охрана
  const g0 = guards[0];
  sp.moveBeetles(1 / 60, { x: g0.x + 1.5, z: g0.z, radius: 0.47 });
  assert.ok(guards.every((g) => g.guardOf === null && !g.goalOn));
});
