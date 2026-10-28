// Запуск: node --experimental-default-type=module --test tests/gravity-laser.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../config_game.js';
import { BuildGrid } from '../build_grid.js';
import { canPlace } from '../build_rules.js';
import { AutoAttack } from '../systems_autoattack.js';
import { Game } from '../game.js';
import { Blades } from '../systems_blades.js';
import { laserStats } from '../build_cores.js';

function setup(gravity = 'sibling') {
  const build = new BuildGrid(7);
  build.placeCore('projectile', CONFIG.cores.projectile, 3, 3);
  const equip = (key, x, y) => {
    const result = canPlace(build, CONFIG.mods[key], x, y);
    assert.equal(result.ok, true, key + ' at ' + x + ',' + y + ': ' + result.reason);
    build.placeMod({ key, def: CONFIG.mods[key] }, x, y);
  };
  equip('laser', 3, 4);
  if (gravity === 'child') equip('gravity', 3, 5);
  if (gravity === 'sibling') equip('gravity', 2, 3);
  const hero = { x: 0, y: 0, active: true, facing: 0 };
  const enemies = [{ x: 110, y: 0, hp: 10000, active: true, radius: 12,
    burnStacks: 0, frostStacks: 0, shockStacks: 0 }];
  const lasers = [], hits = [], effects = [];
  const auto = new AutoAttack({
    config: CONFIG, hero, enemies: { items: enemies }, lasers,
    shots: { count: 0 }, modifiers: () => build.modifiersFor('projectile'),
    bus: { emit: () => {} }, arena: { segmentBlocked: () => false }, rnd: () => 0.5,
  });
  auto.targetsByDistance = () => enemies.filter(e => e.active).map(e => ({ e, d: Math.hypot(e.x - hero.x, e.y - hero.y) }));
  auto.rangeMul = 1;
  const game = Object.create(Game.prototype);
  game.config = CONFIG;
  game.hero = hero; game.lasers = lasers;
  game.enemies = { items: enemies };
  game.arena = { segmentBlocked: () => false };
  game.swarm = { grid: { query(x, y, r, indices) {
    for (let i = 0; i < enemies.length; i++) indices[i] = i;
    return enemies.length;
  } } };
  game.rayE = []; game.rayT = [];
  game.laserSource = { laser: true, active: true };
  game.combat = { damageEnemy(e, amount) {
    hits.push({ enemy: e, amount });
    e.hp -= amount;
    if (e.hp <= 0) e.active = false;
    return true;
  } };
  game.ignite = (e, dmg, interval) => effects.push({ kind: 'burn', enemy: e, dmg, interval });
  game.chill = (e) => effects.push({ kind: 'frost', enemy: e });
  game.zap = (e) => effects.push({ kind: 'lightning', enemy: e });
  game.tryPhantomLaser = () => {};
  const frame = t => { for (let i = 0; i < Math.ceil(t * 60); i++) game.updateLasers(1 / 60); };
  const fire = () => auto.fireLaser(enemies[0], build.modifiersFor('projectile'));
  return { build, equip, hero, enemies, lasers, hits, effects, auto, game, frame, fire };
}

test('Гравитацию можно поставить на Лазер и рядом с ним, обе комбинации действуют', () => {
  for (const mode of ['child', 'sibling']) {
    const s = setup(mode);
    assert.deepEqual(s.build.orphans(), []);
    assert.equal(s.build.modifiersFor('projectile').laser.count, 1);
    assert.equal(s.build.modifiersFor('projectile').gravity.count, 1);
    s.fire();
    assert.equal(s.lasers.length, CONFIG.attack.count);
    assert.ok(s.lasers.every(l => l.gravityLaser));
  }
});

test('Лазер разрешён и как дочерний мод Гравитации', () => {
  const s = setup('none');
  s.build.takeMod(3, 4);
  s.equip('gravity', 3, 4);
  s.equip('laser', 3, 5);
  assert.deepEqual(s.build.orphans(), []);
  assert.equal(s.build.modifiersFor('projectile').laser.count, 1);
  assert.equal(s.build.modifiersFor('projectile').gravity.count, 1);
  s.fire();
  assert.ok(s.lasers.every(l => l.gravityLaser));
});

test('Круг заряжается без урона, лазер появляется только после накопления', () => {
  const s = setup();
  s.fire();
  const l = s.lasers[0], delay = CONFIG.gravity.laserCharge;
  assert.equal(l.gravityChargeAge, 0);
  assert.equal(l.age, 0);
  s.frame(delay - 0.08);
  assert.equal(s.hits.length, 0);
  assert.equal(l.done, 0);
  assert.equal(l.age, 0);
  assert.ok(l.gravityChargeAge > 0);
  s.frame(0.12);
  assert.ok(s.hits.length > 0);
  assert.equal(l.gravityChargeAge, l.gravityChargeTime);
  assert.ok(l.age > 0);
});

test('Лазер выходит из круга перед героем, а не из его центра', () => {
  const s = setup();
  s.fire();
  s.frame(0.05);
  const l = s.lasers[0];
  assert.ok(Math.abs(l.x - CONFIG.gravity.laserOrigin) < 1e-6);
  assert.ok(Math.abs(l.y) < 1e-6);
  s.hero.x = 15;
  s.frame(0.05);
  assert.ok(Math.abs(l.x - (s.hero.x + CONFIG.gravity.laserOrigin)) < 1e-6);
});

test('Гравитация даёт +25% урона КАЖДОГО тика и не сокращает жизнь лазера', () => {
  const s = setup();
  const m = s.build.modifiersFor('projectile');
  s.fire();
  const l = s.lasers[0];
  const base = laserStats(CONFIG, m.laser, CONFIG.projectiles[CONFIG.attack.projectile].damage, CONFIG.attack.count);
  assert.ok(Math.abs(l.tick - base.tick * 1.25) < 1e-8);
  assert.equal(l.life, base.life);
  assert.equal(l.ticks, base.ticks);
  s.frame(CONFIG.gravity.laserCharge + 0.05);
  assert.ok(s.hits.some(h => Math.abs(h.amount - base.tick * 1.25) < 1e-8));
  assert.equal(l.done, 1);
});

test('Если цель умерла до освобождения, круг гаснет без урона', () => {
  const s = setup();
  s.fire();
  s.frame(0.2);
  s.enemies[0].active = false;
  s.frame(1);
  assert.equal(s.lasers.length, 0);
  assert.equal(s.hits.length, 0);
});

test('Обычный Лазер без Гравитации стреляет сразу, без кольца', () => {
  const s = setup('none');
  s.fire();
  assert.ok(s.lasers.every(l => !l.gravityLaser));
  s.frame(1 / 60);
  assert.ok(s.hits.length > 0);
});

test('Горение + Мороз + Молния применяются после зарядки, не до неё', () => {
  const s = setup();
  s.equip('burn', 4, 3);
  s.equip('frost', 5, 3); // на Горении, без замыкания соседней ветки
  s.equip('lightning', 3, 5); // на Лазере, не касается Гравитации
  assert.deepEqual(s.build.orphans(), []);
  s.fire();
  s.frame(CONFIG.gravity.laserCharge - 0.05);
  assert.equal(s.effects.length, 0);
  s.frame(0.1);
  assert.ok(s.effects.some(e => e.kind === 'burn'));
  assert.ok(s.effects.some(e => e.kind === 'frost'));
  assert.ok(s.effects.some(e => e.kind === 'lightning'));
  const laser = s.lasers[0];
  assert.ok(laser.burnDmg > 0);
});

test('Гравитация усиливает также урон Горения от Лазера на 25%', () => {
  const withGravity = setup();
  const plain = setup('none');
  withGravity.equip('burn', 4, 3);
  plain.equip('burn', 4, 3);
  withGravity.fire(); plain.fire();
  assert.ok(Math.abs(withGravity.lasers[0].burnDmg / plain.lasers[0].burnDmg - 1.25) < 1e-9);
});

test('Мощь и Гравитация усиливают Лазер однократно', () => {
  const s = setup();
  s.equip('power', 4, 3);
  s.fire();
  const base = CONFIG.projectiles[CONFIG.attack.projectile].damage;
  const m = s.build.modifiersFor('projectile');
  const expected = laserStats(CONFIG, m.laser, base * 1.1, CONFIG.attack.count).tick * 1.25;
  assert.ok(Math.abs(s.lasers[0].tick - expected) < 1e-8);
});

test('Повторное срабатывание не сбрасывает уже заряжаемые кольца', () => {
  const s = setup();
  s.fire();
  s.frame(0.3);
  const first = s.lasers[0];
  const age = first.gravityChargeAge;
  s.fire();
  assert.equal(first.gravityChargeAge, age);
  assert.equal(s.lasers.length, CONFIG.attack.count * 2);
  assert.equal(s.lasers.at(-1).gravityChargeAge, 0);
});

test('После снятия Гравитации новые лазеры обычные, старые завершают зарядку', () => {
  const s = setup();
  s.fire();
  const old = s.lasers[0];
  s.build.takeMod(2, 3);
  s.fire();
  assert.equal(old.gravityLaser, true);
  assert.equal(s.lasers.at(-1).gravityLaser, false);
});

test('Фантомная копия Гравитационного Лазера заново накапливает энергию', () => {
  const s = setup();
  s.fire();
  const laser = s.lasers[0];
  laser.phantom = 1; laser.phDmg = 1.1;
  laser.gravityChargeAge = laser.gravityChargeTime;
  const g = s.game;
  g.phSpot = { x: 0, y: 0, d: 30 };
  g.burst = () => {};
  g.rnd = () => 0;
  g.tryPhantomLaser = Game.prototype.tryPhantomLaser;
  g.tryPhantomLaser(laser, s.enemies[0]);
  assert.equal(s.lasers.length, CONFIG.attack.count + 1);
  const phantom = s.lasers.at(-1);
  assert.equal(phantom.gravityLaser, true);
  assert.equal(phantom.gravityChargeAge, 0);
  assert.equal(phantom.gravityChargeTime, laser.gravityChargeTime);
  assert.equal(phantom.gravityOrigin, 0);
  assert.equal(phantom.fixed, true);
  assert.ok(Math.abs(phantom.tick - laser.tick * CONFIG.phantom.damageFrac * laser.phDmg) < 1e-8);
});

test('Пауза не продвигает накопление Гравитации; reset игры очищает все круги', () => {
  const s = setup(); s.fire();
  s.frame(0.2);
  const progress = s.lasers[0].gravityChargeAge;
  assert.ok(progress > 0);
  s.lasers.length = 0; // эквивалент сброса лазеров в новом забеге
  assert.equal(s.lasers.length, 0);
});

test('Несколько Лазеров и X2 сохраняют число лучей, каждый имеет свой круг', () => {
  const s = setup();
  s.equip('x2', 4, 4);
  s.fire();
  const expected = CONFIG.attack.count * 2;
  assert.equal(s.lasers.length, expected);
  assert.ok(s.lasers.every(l => l.gravityLaser && l.gravityChargeAge === 0));
});

test('Лазер из Спектральных клинков тоже создаёт гравитационный круг', () => {
  const s = setup('none');
  s.build.takeMod(3, 4);
  s.equip('blades', 3, 4);
  s.equip('laser', 3, 5);
  s.equip('gravity', 3, 6);
  assert.deepEqual(s.build.orphans(), []);
  const mods = s.build.modifiersFor('projectile');
  assert.equal(mods.gravity.count, 1);
  const blades = new Blades({ config: CONFIG, hero: s.hero, lasers: s.lasers });
  const anchor = { x: 25, y: 0, state: 'fire' };
  assert.equal(blades.pushLaser(anchor, s.enemies[0], mods, 50, 1), true);
  const l = s.lasers[0];
  const base = laserStats(CONFIG, mods.laser, 50, 1);
  assert.equal(l.gravityLaser, true);
  assert.equal(l.gravityOrigin, 0);
  assert.ok(Math.abs(l.tick - base.tick * 1.25) < 1e-9);
  s.frame(CONFIG.gravity.laserCharge - 0.05);
  assert.equal(s.hits.length, 0);
  assert.equal(l.x, anchor.x);
  s.frame(0.1);
  assert.ok(s.hits.length > 0);
});

test('Фантомный лазер из сферы также сохраняет задержку и усиливает урон лишь однажды', () => {
  const s = setup('none');
  s.build.takeMod(3, 4);
  s.equip('blades', 3, 4);
  s.equip('laser', 3, 5);
  s.equip('gravity', 3, 6);
  const m = s.build.modifiersFor('projectile');
  const blades = new Blades({ config: CONFIG, hero: s.hero, lasers: s.lasers });
  const anchor = { x: 25, y: 0, state: 'fire' };
  blades.pushLaser(anchor, s.enemies[0], m, 50, 1);
  const laser = s.lasers[0];
  laser.phantom = 1;
  const g = s.game;
  g.phSpot = { x: 0, y: 0, d: 30 };
  g.burst = () => {};
  g.rnd = () => 0;
  g.tryPhantomLaser = Game.prototype.tryPhantomLaser;
  g.tryPhantomLaser(laser, s.enemies[0]);
  const clone = s.lasers.at(-1);
  assert.equal(clone.gravityChargeAge, 0);
  assert.equal(clone.gravityLaser, true);
  assert.ok(Math.abs(clone.tick - laser.tick * CONFIG.phantom.damageFrac * (laser.phDmg || 1)) < 1e-9);
});
