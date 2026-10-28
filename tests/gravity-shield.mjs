// Запуск: node --experimental-default-type=module --test tests/gravity-shield.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../config_game.js';
import { GravityShield, gravitySegmentFraction } from '../systems_gravity_shield.js';
import { createProjectile, initProjectile, resetProjectile, updateProjectile } from '../world_projectile.js';
import { parentAccepts, canPlace } from '../build_rules.js';
import { BuildGrid } from '../build_grid.js';
import { HeroDefense } from '../systems_defense.js';
import { Game } from '../game.js';

function setup() {
  const hero = { active: true, x: 0, y: 0, radius: 12 };
  const defense = { blocking: true, gravityOn: true, gravityActive: true };
  const enemy = { active: true, x: 85, y: 0, radius: 10, def: {}, atk: { state: 'idle' } };
  const enemies = { items: [enemy] }, enemyShots = { items: [] }, shots = [];
  const heroShots = { items: shots,
    get count() { return shots.filter(p => p.active).length; },
    spawn() { const p = createProjectile(); p.active = true; shots.push(p); return p; } };
  const cfg = { gravity: { ...CONFIG.gravity }, limits: { maxShots: 200 }, enemies: CONFIG.enemies };
  const arena = { left: -1000, right: 1000, top: -1000, bottom: 1000,
    resolveCircle() {}, circleHitsRock() { return false; } };
  const shield = new GravityShield({ config: cfg, hero, defense, arena, enemies, enemyShots, heroShots });
  return { hero, defense, enemy, enemies, enemyShots, shots, shield, cfg, arena };
}

test('мод Гравитация крепится к ядру Щита', () => {
  assert.ok(parentAccepts(CONFIG.mods.gravity, { def: CONFIG.cores.shield }));
});
test('доля движения внутри поля учитывает пересечение границы', () => {
  assert.equal(gravitySegmentFraction(5, 0, -5, 0, 0, 0, 10), 1);
  assert.equal(gravitySegmentFraction(20, 0, 15, 0, 0, 0, 10), 0);
  assert.ok(Math.abs(gravitySegmentFraction(20, 0, 0, 0, 0, 0, 10) - 0.5) < 1e-10);
});
test('враги замедляются, но проходят горизонт событий', () => {
  const s = setup(); s.shield.beginEnemyStep(); s.enemy.x = 45; s.shield.slowEnemies();
  assert.ok(s.enemy.x < 85, 'враг не остановлен');
  assert.ok(s.enemy.x > 45, 'враг потерял скорость');
  assert.ok(s.enemy.x < s.cfg.gravity.shieldRadius + s.enemy.radius, 'враг пересёк границу поля');
});
test('внутри поля враг продолжает движение с указанной долей скорости', () => {
  const s = setup(); s.enemy.x = 60; s.shield.beginEnemyStep(); s.enemy.x = 40;
  s.shield.slowEnemies();
  assert.ok(Math.abs(s.enemy.x - (60 - 20 * s.cfg.gravity.shieldEnemySpeed)) < 1e-7);
});
test('выключенное поле не замедляет врагов', () => {
  const s = setup(); s.defense.gravityActive = false;
  s.shield.beginEnemyStep(); s.enemy.x = 45; s.shield.slowEnemies();
  assert.equal(s.enemy.x, 45);
});
test('пуля сохраняет владельца, урон и может проходить поле на малой скорости', () => {
  const s = setup(), p = createProjectile();
  initProjectile(p, { ...CONFIG.projectiles.bolt, speed: 200, range: 1500 }, 80, 0, -1, 0, s.enemy);
  p.active = true; s.enemyShots.items.push(p);
  const flightDt = s.shield.enemyShotDt(p, 0.2);
  assert.ok(flightDt > 0 && flightDt < 0.2);
  updateProjectile(p, flightDt, s.arena);
  assert.ok(p.x < 80 && p.x > 40);
  assert.equal(p.owner, s.enemy);
  assert.equal(p.gravityTouched, true);
  assert.equal(s.shots.length, 0, 'захвата в пул снарядов героя больше нет');
  assert.equal(p.active, true);
});
test('прямой выстрел всё-таки долетает до героя', () => {
  const s = setup(), p = createProjectile();
  initProjectile(p, { ...CONFIG.projectiles.bolt, speed: 200, range: 1500 }, 80, 0, -1, 0, s.enemy);
  p.active = true;
  for (let i = 0; i < 600 && p.x > s.hero.radius; i++)
    updateProjectile(p, s.shield.enemyShotDt(p, 1 / 60), s.arena);
  assert.ok(p.x <= s.hero.radius, 'поле проницаемо для пули');
  assert.equal(p.gravityOrbit, false);
  assert.equal(p.active, true);
});
test('прошедший через поле снаряд может ранить другого врага, но не своего владельца', () => {
  const s = setup(), p = createProjectile();
  initProjectile(p, CONFIG.projectiles.bolt, 35, 0, 1, 0, { active: true });
  p.active = true; p.gravityTouched = true; p.prevX = 25; p.x = 35;
  s.enemy.x = 30; s.enemy.y = 0; s.enemyShots.items.push(p);
  let hits = 0;
  s.shield.grid = { query(x, y, r, buf) { buf[0] = 0; return 1; } };
  s.shield.combat = { damageEnemy(e, damage, source) { hits++; assert.equal(source, p); } };
  s.shield.hitEnemies();
  assert.equal(hits, 1);
  assert.equal(p.active, false);
});
test('обычный блок всё ещё гасит снаряды, гравитационный пропускает', () => {
  const p = createProjectile(); p.active = true; p.x = 20; p.y = 0;
  let hits = 0;
  const fake = { defense: { blocking: true, gravityActive: true, blockRadius: 26 },
    hero: { active: true, x: 0, y: 0 }, enemyShots: { items: [p] }, onEnemyShotHitHero() { hits++; } };
  Game.prototype.hitShotsOnBlock.call(fake);
  assert.equal(hits, 0);
  fake.defense.gravityActive = false;
  Game.prototype.hitShotsOnBlock.call(fake);
  assert.equal(hits, 1);
});
test('гравитационные метки сбрасываются при повторном использовании снаряда', () => {
  const q = createProjectile();
  q.gravityTouched = true; resetProjectile(q);
  assert.equal(q.gravityTouched, false);
  q.gravityTouched = true; initProjectile(q, CONFIG.projectiles.bolt, 0, 0, 1, 0, {});
  assert.equal(q.gravityTouched, false);
});

function buildShield(entries) {
  const build = new BuildGrid(7);
  build.placeCore('shield', CONFIG.cores.shield, 3, 3);
  for (const [key, x, y] of entries) {
    const check = canPlace(build, CONFIG.mods[key], x, y);
    assert.equal(check.ok, true, key + ': ' + check.reason);
    build.placeMod({ key, def: CONFIG.mods[key] }, x, y);
  }
  return build.modifiersFor('shield');
}

function defenseHarness(mods) {
  const bus = { on() {}, emit() {} };
  const hero = { active: true, x: 0, y: 0, radius: 12, dashing: false, glideTime: 0 };
  const stick = { active: false };
  const defense = new HeroDefense({ config: CONFIG, hero, stick, bus, modifiers: () => mods });
  defense.update(0.15);
  assert.equal(defense.blocking, true);
  return { defense, stick, hero };
}

test('Х2 и Х3 на Гравитации продлевают щит, цепочка перемножается', () => {
  const one = buildShield([['gravity', 3, 4]]);
  const two = buildShield([['gravity', 3, 4], ['x2', 3, 5]]);
  const three = buildShield([['gravity', 3, 4], ['x3', 3, 5]]);
  const six = buildShield([['gravity', 3, 4], ['x2', 3, 5], ['x3', 3, 6]]);
  assert.equal(one.gravity.durationMult, 1);
  assert.equal(two.gravity.durationMult, 2);
  assert.equal(three.gravity.durationMult, 3);
  assert.equal(six.gravity.durationMult, 6);
});

test('Х2 на ядре Щита продлевает Гравитацию и сохраняет обычное усиление силы блока', () => {
  const mods = buildShield([['gravity', 3, 4], ['x2', 2, 3]]);
  assert.equal(mods.gravity.durationMult, 2);
  assert.equal(mods.blockPower.percent, 100);
});

test('Х2/Х3 на Снаряде не меняют длительность гравитационного щита', () => {
  const grid = new BuildGrid(7);
  grid.placeCore('projectile', CONFIG.cores.projectile, 3, 3);
  for (const [key, x, y] of [['gravity', 3, 4], ['x3', 3, 5]]) {
    assert.equal(canPlace(grid, CONFIG.mods[key], x, y).ok, true);
    grid.placeMod({ key, def: CONFIG.mods[key] }, x, y);
  }
  assert.equal(grid.modifiersFor('projectile').gravity.durationMult, undefined);
});

test('поле следует за движущимся героем до конца собственного времени, затем перезаряжается', () => {
  const mods = buildShield([['gravity', 3, 4], ['x2', 3, 5]]);
  const { defense, stick } = defenseHarness(mods);
  assert.equal(defense.gravityDurationMax, CONFIG.gravity.shieldDuration * 2);
  assert.equal(defense.gravityTime, defense.gravityDurationMax);
  stick.active = true;
  defense.update(0.1);
  assert.equal(defense.blocking, false);
  assert.equal(defense.gravityActive, true);
  assert.ok(defense.blockCd > CONFIG.gravity.shieldCooldown);
  defense.update(CONFIG.gravity.shieldDuration * 2);
  assert.equal(defense.gravityActive, false);
  assert.ok(Math.abs(defense.blockCd - CONFIG.gravity.shieldCooldown) < 0.2);
  stick.active = false;
  defense.update(0.15);
  assert.equal(defense.blocking, false);
  defense.update(CONFIG.gravity.shieldCooldown + 0.1);
  assert.equal(defense.blocking, true);
});

test('обычный блок по-прежнему исчезает при движении и использует прежнюю перезарядку', () => {
  const { defense, stick } = defenseHarness({});
  assert.equal(defense.gravityActive, false);
  stick.active = true; defense.update(0.1);
  assert.equal(defense.blocking, false);
  assert.equal(defense.blockCd, CONFIG.block.cancelCooldown);
  assert.equal(defense.gravityTime, 0);
});

test('после движения поле замедляет, но не гасит входящий урон', () => {
  const { defense, stick } = defenseHarness({ gravity: { count: 1, durationMult: 1 } });
  stick.active = true; defense.update(0.1);
  let inc = { amount: 10, cancelled: false, parryable: false };
  defense.onHit(inc);
  assert.equal(inc.blocked, undefined);
  assert.equal(inc.amount, 10);
  assert.equal(defense.parrying, false);
});
