import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config/game.js';
import { FixedStepper } from '../src/core/loop.js';
import { Arena } from '../src/world/arena.js';
import { Hero } from '../src/world/hero.js';
import { Camera } from '../src/world/camera.js';

const clone = (o) => JSON.parse(JSON.stringify(o));

function arenaOne(rock) {
  return new Arena({ width: 1000, height: 1000, rocks: rock ? [rock] : [] });
}

// ---------- Arena ----------
test('арена: границы не выпускают круг', () => {
  const a = arenaOne();
  const c = { x: 99999, y: -99999, radius: 14 };
  a.resolveCircle(c);
  assert.equal(c.x, 500 - 14);
  assert.equal(c.y, -500 + 14);
});

test('арена: круг внутри скалы выталкивается на расстояние r + radius', () => {
  const a = arenaOne({ x: 0, y: 0, r: 50 });
  const c = { x: 10, y: 5, radius: 14 };
  a.resolveCircle(c);
  assert.ok(Math.hypot(c.x, c.y) >= 64 - 1e-9);
});

test('арена: ровно в центре скалы не возникает NaN', () => {
  const a = arenaOne({ x: 0, y: 0, r: 50 });
  const c = { x: 0, y: 0, radius: 14 };
  a.resolveCircle(c);
  assert.ok(Number.isFinite(c.x) && Number.isFinite(c.y));
});

test('арена: герой, упёршийся в скалу, не заходит в неё и скользит вдоль', () => {
  const a = arenaOne({ x: 100, y: 0, r: 40 });
  const hero = new Hero({ speed: 200, accelTime: 0, radius: 14 });
  hero.place(0, 10);
  let minD = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < 180; i++) {
    hero.update(1 / 60, 1, 0.3, a); // вправо и немного вниз
    minD = Math.min(minD, Math.hypot(hero.x - 100, hero.y));
    maxY = Math.max(maxY, hero.y);
  }
  assert.ok(minD >= 54 - 1e-6, 'минимальная дистанция ' + minD);
  assert.ok(maxY > 40, 'скользит вдоль скалы, а не залипает: y=' + maxY);
});

test('арена: стартовые позиции скал внутри арены и не накладываются друг на друга', () => {
  const a = new Arena(CONFIG.arena);
  for (const r of a.rocks) {
    assert.ok(r.x - r.r >= a.left && r.x + r.r <= a.right, 'скала вне арены по X: ' + JSON.stringify(r));
    assert.ok(r.y - r.r >= a.top && r.y + r.r <= a.bottom, 'скала вне арены по Y: ' + JSON.stringify(r));
  }
  for (let i = 0; i < a.rocks.length; i++) {
    for (let j = i + 1; j < a.rocks.length; j++) {
      const p = a.rocks[i];
      const q = a.rocks[j];
      assert.ok(Math.hypot(p.x - q.x, p.y - q.y) > p.r + q.r, 'скалы ' + i + ' и ' + j + ' пересекаются');
    }
  }
  // У точки старта (0,0) должно быть свободно.
  const start = { x: 0, y: 0, radius: CONFIG.hero.radius };
  a.resolveCircle(start);
  assert.equal(start.x, 0);
  assert.equal(start.y, 0);
});

// ---------- Hero ----------
test('герой: полный стик вправо за секунду проходит speed единиц', () => {
  const a = arenaOne();
  const hero = new Hero({ speed: 200, accelTime: 0, radius: 14 });
  for (let i = 0; i < 60; i++) hero.update(1 / 60, 1, 0, a);
  assert.ok(Math.abs(hero.x - 200) < 1e-6, 'x ' + hero.x);
});

test('герой: половина стика даёт половину скорости', () => {
  const a = arenaOne();
  const hero = new Hero({ speed: 200, accelTime: 0, radius: 14 });
  for (let i = 0; i < 60; i++) hero.update(1 / 60, 0.5, 0, a);
  assert.ok(Math.abs(hero.x - 100) < 1e-6);
});

test('герой: с разгоном первый шаг медленнее полной скорости, потом выходит на неё', () => {
  const a = arenaOne();
  const hero = new Hero({ speed: 200, accelTime: 0.05, radius: 14 });
  hero.update(1 / 60, 1, 0, a);
  assert.ok(hero.vx > 0 && hero.vx < 200);
  for (let i = 0; i < 60; i++) hero.update(1 / 60, 1, 0, a);
  assert.ok(hero.vx > 199);
});

test('герой: после отпускания стика полностью останавливается', () => {
  const a = arenaOne();
  const hero = new Hero({ speed: 200, accelTime: 0.05, radius: 14 });
  for (let i = 0; i < 30; i++) hero.update(1 / 60, 1, 0, a);
  for (let i = 0; i < 60; i++) hero.update(1 / 60, 0, 0, a);
  assert.equal(hero.vx, 0);
  const x = hero.x;
  hero.update(1 / 60, 0, 0, a);
  assert.equal(hero.x, x);
});

test('герой: facing следует за направлением и остаётся при остановке', () => {
  const a = arenaOne();
  const hero = new Hero({ speed: 200, accelTime: 0, radius: 14 });
  hero.update(1 / 60, 0, 1, a);
  assert.ok(Math.abs(hero.facing - Math.PI / 2) < 1e-9);
  hero.update(1 / 60, 0, 0, a);
  assert.ok(Math.abs(hero.facing - Math.PI / 2) < 1e-9);
});

test('герой: путь не зависит от частоты кадров экрана (60, 120, 144, 30 Гц)', () => {
  const result = [];
  for (const fps of [60, 120, 144, 30]) {
    const a = arenaOne();
    const hero = new Hero({ speed: 180, accelTime: 0.05, radius: 14 });
    const stepper = new FixedStepper({ hz: 60, maxFrameMs: 250, maxStepsPerFrame: 5 });
    for (let f = 0; f < fps * 2; f++) {
      stepper.advance(1000 / fps, (dt) => hero.update(dt, 1, 0, a));
    }
    result.push(hero.x);
  }
  const spread = Math.max(...result) - Math.min(...result);
  assert.ok(spread <= 180 / 60 + 1e-6, 'разброс ' + spread + ', значения ' + result.join(', '));
});

// ---------- Camera ----------
function camCfg(over) {
  return Object.assign({ viewWidth: 400, smoothTime: 0.1, clampToArena: true }, over);
}

test('камера: масштаб из ширины обзора, высота по пропорции экрана', () => {
  const cam = new Camera(camCfg());
  cam.setScreen(375, 812);
  assert.ok(Math.abs(cam.scale - 375 / 400) < 1e-9);
  assert.ok(Math.abs(cam.viewH - 812 / (375 / 400)) < 1e-9);
});

test('камера: плавно догоняет цель и сходится', () => {
  const a = arenaOne();
  const cam = new Camera(camCfg({ clampToArena: false }));
  cam.setScreen(400, 800);
  cam.update(1 / 60, 100, 0, a);
  assert.ok(cam.x > 0 && cam.x < 100, 'x ' + cam.x);
  for (let i = 0; i < 120; i++) cam.update(1 / 60, 100, 0, a);
  assert.ok(Math.abs(cam.x - 100) < 0.5);
});

test('камера: smoothTime 0 держит жёстко', () => {
  const a = arenaOne();
  const cam = new Camera(camCfg({ smoothTime: 0, clampToArena: false }));
  cam.setScreen(400, 800);
  cam.update(1 / 60, 123, -45, a);
  assert.equal(cam.x, 123);
  assert.equal(cam.y, -45);
});

test('камера: не показывает пустоту за краем арены', () => {
  const a = arenaOne();
  const cam = new Camera(camCfg({ smoothTime: 0 }));
  cam.setScreen(400, 800); // обзор 400 x 800
  cam.update(1 / 60, 480, 480, a);
  assert.equal(cam.x, 500 - 200);
  assert.equal(cam.y, 500 - 400);
});

test('камера: если арена меньше обзора, держится по центру арены', () => {
  const a = arenaOne();
  const cam = new Camera(camCfg({ smoothTime: 0, viewWidth: 2000 }));
  cam.setScreen(400, 800);
  cam.update(1 / 60, 300, 300, a);
  assert.equal(cam.x, 0);
  assert.equal(cam.y, 0);
});

test('камера: viewWidth меняется на лету и масштаб пересчитывается', () => {
  const cfg = camCfg();
  const cam = new Camera(cfg);
  cam.setScreen(400, 800);
  cfg.viewWidth = 200;
  cam.refresh();
  assert.equal(cam.scale, 2);
});
