// Запуск: node --experimental-default-type=module --test tests/gravity-shield.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../config_game.js';
import { GravityShield } from '../systems_gravity_shield.js';
import { createProjectile, initProjectile, resetProjectile } from '../world_projectile.js';
import { parentAccepts, canPlace } from '../build_rules.js';
import { BuildGrid } from '../build_grid.js';
import { HeroDefense } from '../systems_defense.js';
function setup() {
  const hero = { active: true, x: 0, y: 0, radius: 12 };
  const defense = { blocking: true, gravityOn: true, gravityActive: true };
  const enemy = { active: true, x: 12, y: 0, radius: 10, def: {}, atk: { state: 'idle' } };
  const enemies = { items: [enemy] }, enemyShots = { items: [] }, shots = [];
  const heroShots = { items: shots,
    get count() { return shots.filter(p => p.active).length; },
    spawn() { const p = createProjectile(); p.active = true; shots.push(p); return p; } };
  const cfg = { gravity: { ...CONFIG.gravity }, limits: { maxShots: 200 } };
  const shield = new GravityShield({ config: cfg, hero, defense, arena: { resolveCircle() {} }, enemies, enemyShots, heroShots });
  return { hero, defense, enemy, enemyShots, shots, shield, cfg };
}
test('мод Гравитация крепится к ядру Щита', () => {
  assert.ok(parentAccepts(CONFIG.mods.gravity, { def: CONFIG.cores.shield }));
});
test('враги остаются за горизонтом событий', () => {
  const s = setup(); s.shield.blockEnemies();
  assert.ok(Math.hypot(s.enemy.x, s.enemy.y) >= s.cfg.gravity.shieldRadius + s.enemy.radius - 1e-6);
});
test('без гравитационного поля враги проходят, а после снятия обычного блока поле работает', () => {
  const s = setup(); s.defense.gravityActive = false; s.shield.blockEnemies(); assert.equal(s.enemy.x, 12);
  s.defense.gravityActive = true; s.defense.blocking = false; s.shield.blockEnemies();
  assert.ok(s.enemy.x >= s.cfg.gravity.shieldRadius + s.enemy.radius);
});
test('перехватывает даже быстрый снаряд и передаёт его герою', () => {
  const s = setup(), p = createProjectile();
  initProjectile(p, CONFIG.projectiles.bolt, 150, 0, -1, 0, s.enemy);
  p.active = true; p.prevX = 150; p.x = -150; s.enemyShots.items.push(p);
  s.shield.captureShots();
  assert.equal(p.active, false); assert.equal(s.shots.length, 1);
  assert.equal(s.shots[0].gravityOrbit, true); assert.equal(s.shots[0].gravityReflected, true);
  assert.equal(s.shots[0].owner, s.hero); assert.equal(s.shots[0].damage, p.damage);
});
test('после облёта снаряд улетает по касательной', () => {
  const s = setup(), p = createProjectile();
  initProjectile(p, CONFIG.projectiles.bolt, 70, 0, -1, 0, s.enemy);
  p.active = true; p.prevX = 80; p.x = 60; s.enemyShots.items.push(p); s.shield.captureShots();
  const q = s.shots[0], x = q.x, y = q.y;
  for (let i = 0; i < 60 && q.gravityOrbit; i++) s.shield.updateOrbits(1 / 60);
  assert.equal(q.gravityOrbit, false); assert.ok(Math.hypot(q.x - x, q.y - y) > 10);
  assert.ok(Math.hypot(q.vx, q.vy) > 0); assert.equal(q.travelled, 0);
});
test('поля орбиты очищаются при возврате в пул', () => {
  const q = createProjectile(); q.gravityOrbit = true; q.gravityReflected = true;
  resetProjectile(q); assert.equal(q.gravityOrbit, false); assert.equal(q.gravityReflected, false);
  initProjectile(q, CONFIG.projectiles.bolt, 0, 0, 1, 0, {});
  assert.equal(q.gravityOrbit, false); assert.equal(q.gravityReflected, false);
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

test('действующее поле блокирует удары и без обычной стойки блока', () => {
  const { defense, stick } = defenseHarness({ gravity: { count: 1, durationMult: 1 } });
  stick.active = true; defense.update(0.1);
  let inc = { amount: 10, cancelled: false, parryable: false };
  defense.onHit(inc);
  assert.equal(inc.blocked, true);
  assert.ok(inc.amount < 10);
  assert.equal(defense.parrying, false);
});
