// Запуск: node --experimental-default-type=module --test tests/gravity.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../config_game.js';
import { BuildGrid } from '../build_grid.js';
import { canPlace } from '../build_rules.js';
import { AutoAttack } from '../systems_autoattack.js';
import { Game } from '../game.js';
import { createProjectile, resetProjectile, initProjectile, updateProjectile } from '../world_projectile.js';

const arena = { left: -2000, right: 2000, top: -2000, bottom: 2000,
  circleHitsRock: () => false };
const advance = (p, t) => {
  const n = Math.round(t * 60);
  for (let i = 0; i < n; i++) updateProjectile(p, 1 / 60, arena);
};

function setup() {
  const build = new BuildGrid(7);
  build.placeCore('projectile', CONFIG.cores.projectile, 3, 3);
  const shots = [];
  const pool = { get count() { return shots.filter(p => p.active).length; },
    spawn() { const p = createProjectile(); p.active = true; shots.push(p); return p; } };
  const hero = { active: true, x: 0, y: 0 };
  const emitted = [];
  const attack = new AutoAttack({
    config: CONFIG, hero, shots: pool, enemies: { items: [] },
    bus: { emit: (...a) => emitted.push(a) }, arena,
    modifiers: () => build.modifiersFor('projectile'), rnd: () => 0.5,
  });
  const equip = (key, x, y) => {
    const placement = canPlace(build, CONFIG.mods[key], x, y);
    assert.equal(placement.ok, true, key + ': ' + placement.reason);
    build.placeMod({ key, def: CONFIG.mods[key] }, x, y);
  };
  return { build, shots, pool, hero, emitted, attack, equip };
}

test('Гравитация устанавливается на ядро Снаряда и отображается в модификаторах', () => {
  const s = setup();
  s.equip('gravity', 3, 4);
  assert.deepEqual(s.build.orphans(), []);
  assert.equal(s.build.modifiersFor('projectile').gravity.count, 1);
});

test('Урон обычного снаряда повышается ровно на 25%', () => {
  const s = setup(); s.equip('gravity', 3, 4);
  s.attack.fire({ x: 200, y: 0 });
  assert.equal(s.shots.length, CONFIG.attack.count);
  const def = CONFIG.projectiles[CONFIG.attack.projectile];
  const penalty = Math.pow(CONFIG.attack.countDamage, Math.log2(CONFIG.attack.count));
  for (const p of s.shots) {
    assert.ok(Math.abs(p.damage - def.damage * penalty * 1.25) < 1e-8);
    assert.equal(p.gravity, true);
    assert.equal(p.gravityAge, 0);
    assert.equal(p.gravityStart, CONFIG.gravity.startSpeed);
    assert.equal(p.gravityEnd, CONFIG.gravity.maxSpeed);
  }
});

test('При старте снаряд идёт медленно, затем ускоряется выше базовой скорости', () => {
  const def = CONFIG.projectiles[CONFIG.attack.projectile];
  const p = createProjectile(); initProjectile(p, def, 0, 0, 1, 0, {});
  p.active = true;
  p.gravity = true;
  p.gravityStart = CONFIG.gravity.startSpeed;
  p.gravityEnd = CONFIG.gravity.maxSpeed;
  p.gravityRamp = CONFIG.gravity.rampTime;
  const d1 = p.x; updateProjectile(p, 1 / 60, arena);
  const v1 = (p.x - d1) * 60;
  advance(p, 0.2);
  const x2 = p.x; updateProjectile(p, 1 / 60, arena);
  const v2 = (p.x - x2) * 60;
  advance(p, 0.3);
  const x3 = p.x; updateProjectile(p, 1 / 60, arena);
  const v3 = (p.x - x3) * 60;
  assert.ok(v1 < def.speed * 0.6);
  assert.ok(v2 > v1 && v2 < v3);
  assert.ok(Math.abs(v3 - def.speed * CONFIG.gravity.maxSpeed) < 1e-7);
});

test('Дальность считает фактическое расстояние, а не базовую скорость', () => {
  const p = createProjectile();
  initProjectile(p, { ...CONFIG.projectiles.bolt, range: 100 }, 0, 0, 1, 0, {});
  p.active = true; p.gravity = true; p.gravityStart = 0.4; p.gravityEnd = 2.2; p.gravityRamp = 0.5;
  advance(p, 0.15);
  assert.ok(Math.abs(p.x - p.travelled) < 1e-6);
  assert.ok(p.active);
  for (let i = 0; i < 200 && p.active; i++) updateProjectile(p, 1 / 60, arena);
  assert.equal(p.active, false);
  assert.ok(p.travelled >= 100);
  assert.ok(p.travelled < 110);
});

test('Гравитация действует на каждый снаряд потока, а не только на залпы', () => {
  const s = setup(); s.equip('gravity', 3, 4);
  s.attack.fireStream({ x: 170, y: 0 }, s.build.modifiersFor('projectile'), 6);
  assert.equal(s.shots.length, 1);
  assert.equal(s.shots[0].gravity, true);
  assert.ok(s.shots[0].damage > 0);
});

test('Мощь складывается с Гравитацией без потери бонуса и без повторного умножения', () => {
  const s = setup();
  s.equip('gravity', 3, 4);
  s.equip('power', 2, 3);
  s.attack.fire({ x: 200, y: 0 });
  const def = CONFIG.projectiles[CONFIG.attack.projectile];
  const pen = Math.pow(CONFIG.attack.countDamage, Math.log2(CONFIG.attack.count));
  assert.ok(Math.abs(s.shots[0].damage - def.damage * 1.1 * pen * 1.25) < 1e-7);
});

test('У незачарованных снарядов базовая скорость и урон не меняются', () => {
  const s = setup();
  s.attack.fire({ x: 200, y: 0 });
  const p = s.shots[0];
  assert.equal(p.gravity, false);
  const oldX = p.x;
  updateProjectile(p, 1 / 60, arena);
  assert.ok(Math.abs((p.x - oldX) * 60 - CONFIG.projectiles.bolt.speed) < 1e-7);
});

test('Переиспользуемые и вражеские снаряды не наследуют Гравитацию', () => {
  const p = createProjectile(), def = CONFIG.projectiles.bolt;
  initProjectile(p, def, 0, 0, 1, 0, {});
  p.gravity = true; p.gravityAge = 0.5;
  resetProjectile(p);
  assert.equal(p.gravity, false);
  initProjectile(p, def, 0, 0, 1, 0, {});
  assert.equal(p.gravity, false);
  assert.equal(p.gravityAge, 0);
  updateProjectile(p, 1 / 60, arena);
  assert.ok(Math.abs(p.x - def.speed / 60) < 1e-8);
});

test('Фантомная копия тоже разгоняется с нуля и не получает 25% второй раз', () => {
  const s = setup(); s.equip('gravity', 3, 4);
  s.attack.fire({ x: 180, y: 0 });
  const p = s.shots[0];
  p.phantom = 1;
  p.gravityAge = 0.25;
  const g = Object.create(Game.prototype);
  g.config = CONFIG;
  g.rnd = () => 0;
  g.arena = arena;
  g.heroShots = s.pool;
  g.phSpot = { x: 0, y: 0, d: 0 };
  g.burst = () => {};
  g.tryPhantom(p, { x: 160, y: 0, active: true });
  assert.equal(s.shots.length, CONFIG.attack.count + 1);
  const q = s.shots.at(-1);
  assert.equal(q.gravity, true);
  assert.equal(q.gravityAge, 0);
  assert.equal(q.gravityStart, p.gravityStart);
  assert.equal(q.gravityEnd, p.gravityEnd);
  assert.ok(Math.abs(q.damage - p.damage * CONFIG.phantom.damageFrac * p.phDmg) < 1e-8);
});

test('При снятии мода новые снаряды обычные, ранее выпущенные продолжают разгон', () => {
  const s = setup(); s.equip('gravity', 3, 4);
  s.attack.fire({ x: 180, y: 0 });
  const old = s.shots[0];
  s.build.takeMod(3, 4);
  s.attack.fire({ x: 180, y: 0 });
  assert.equal(old.gravity, true);
  assert.equal(s.shots.at(-1).gravity, false);
});

test('Гравитация не влияет на запас дальности, число снарядов и обычный интервал атаки', () => {
  const s = setup(); s.equip('gravity', 3, 4);
  const m = s.build.modifiersFor('projectile');
  assert.equal(m.count, undefined);
  assert.equal(m.rate, undefined);
  s.attack.fire({ x: 200, y: 0 });
  assert.equal(s.shots.length, CONFIG.attack.count);
  assert.ok(s.shots.every(p => p.range === CONFIG.projectiles.bolt.range));
});
