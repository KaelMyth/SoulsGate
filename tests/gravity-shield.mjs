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


test('Огонь, Мороз и Молния крепятся к Гравитации на Щите', () => {
  for (const key of ['burn', 'frost', 'lightning']) {
    const build = new BuildGrid(7);
    build.placeCore('shield', CONFIG.cores.shield, 3, 3);
    build.placeMod({ key: 'gravity', def: CONFIG.mods.gravity }, 3, 4);
    assert.equal(canPlace(build, CONFIG.mods[key], 3, 5).ok, true, key);
  }
});

test('Гравитация берёт стихии только из своей ветки, а не из соседних Клинков', () => {
  const m = buildShield([['gravity', 3, 4], ['burn', 3, 5], ['blades', 2, 3], ['frost', 1, 3]]);
  assert.equal(m.gravity.elements.mask, 1); // только Огонь
  assert.equal(m.burn, undefined, 'Горение Гравитации не переходит на Клинки');
  assert.ok(m.frost);
});

test('Ветка Горение + Мороз + Молния на Гравитации даёт все три стихии', () => {
  const m = buildShield([['gravity', 3, 4], ['burn', 3, 5], ['frost', 3, 6], ['lightning', 2, 6]]);
  assert.equal(m.gravity.elements.mask, 7);
  assert.equal(m.burn, undefined);
  assert.equal(m.frost, undefined);
  assert.equal(m.lightning, undefined);
});

test('Огонь периодически обновляет стаки на врагах в поле, а вне поля не действует', () => {
  const s = setup();
  s.defense.gravityElements = { mask: 1 };
  s.enemy.x = 30; s.enemy.y = 0;
  let applied = 0;
  s.shield.ignite = (e, damage, interval) => {
    assert.equal(e, s.enemy);
    assert.equal(damage, s.cfg.gravity.shieldBurnDamage);
    assert.equal(interval, CONFIG.burn.interval);
    applied++;
  };
  s.shield.applyElements(0.016);
  assert.equal(applied, 1);
  s.shield.applyElements(s.cfg.gravity.shieldElementInterval / 2);
  assert.equal(applied, 1);
  s.shield.applyElements(s.cfg.gravity.shieldElementInterval / 2);
  assert.equal(applied, 2);
  s.enemy.x = 500;
  s.shield.applyElements(s.cfg.gravity.shieldElementInterval);
  assert.equal(applied, 2);
  s.defense.gravityActive = false;
  s.shield.applyElements(1);
  assert.equal(applied, 2);
});

test('Мороз и Молния через поле вызывают штатные системы статусов', () => {
  const s = setup(); s.enemy.x = 30; s.defense.gravityElements = { mask: 7 };
  let burn = 0, frost = 0, lightning = 0;
  s.shield.ignite = () => { burn++; };
  s.shield.chill = (enemy, steam, damage, interval) => {
    assert.equal(steam, 1);
    assert.equal(damage, s.cfg.gravity.shieldBurnDamage);
    frost++;
  };
  s.shield.zap = (enemy, damage, interval, hasFrost, steam) => {
    assert.equal(hasFrost, 1);
    assert.equal(steam, 1);
    lightning++;
  };
  s.shield.applyElements(0.016);
  assert.equal(burn, 1);
  assert.equal(frost, 1);
  assert.equal(lightning, 1);
});

test('Обратный снаряд получает стихии после касательного разворота, но прямой — нет', () => {
  const s = setup();
  s.defense.gravityElements = { mask: 5 };
  s.enemy.x = 150;
  const p = createProjectile();
  initProjectile(p, { ...CONFIG.projectiles.bolt, speed: 180 }, 50, 55, -1, 0, s.enemy);
  p.active = true;
  s.shield.enemyShotDt(p, 0.35);
  assert.equal(p.gravityReturned, true);
  assert.equal(p.gravityElementMask, 5);
  assert.ok(p.vx * p.x + p.vy * p.y > 0, 'летит от центра наружу');
  const q = createProjectile();
  initProjectile(q, { ...CONFIG.projectiles.bolt, speed: 180 }, 50, 0, -1, 0, s.enemy);
  q.active = true;
  for (let i = 0; i < 20; i++) s.shield.enemyShotDt(q, 0.05);
  assert.equal(q.gravityReturned, false);
  assert.equal(q.gravityElementMask, 0);
});

test('Возвращённый снаряд поджигает первоначального стрелка и даёт стак Молнии', () => {
  const s = setup(); s.enemy.x = 35;
  const p = createProjectile();
  initProjectile(p, CONFIG.projectiles.bolt, 25, 0, 1, 0, s.enemy);
  p.active = true;
  p.gravityTouched = true; p.gravityReturned = true; p.gravityElementMask = 5;
  p.prevX = 25; p.x = 45; s.enemyShots.items.push(p);
  s.shield.grid = { query(x, y, r, buf) { buf[0] = 0; return 1; } };
  let hits = 0, burns = 0, shocks = 0;
  s.shield.combat = { damageEnemy() { hits++; return true; } };
  s.shield.ignite = () => { burns++; };
  s.shield.zap = () => { shocks++; };
  s.shield.hitEnemies();
  assert.equal(hits, 1);
  assert.equal(burns, 1);
  assert.equal(shocks, 1);
});

test('При повторном использовании вражеский снаряд не наследует стихийный возврат', () => {
  const p = createProjectile();
  p.gravityReturned = true; p.gravityReturnAge = 0.3; p.gravityElementMask = 7;
  resetProjectile(p);
  assert.equal(p.gravityReturned, false);
  assert.equal(p.gravityElementMask, 0);
  initProjectile(p, CONFIG.projectiles.bolt, 0, 0, 1, 0, {});
  assert.equal(p.gravityReturnAge, 0);
  assert.equal(p.gravityElementMask, 0);
});


test('Ускорение на Гравитации сильнее сокращает откат, но не меняет обычный Щит', () => {
  const plain = buildShield([['gravity', 3, 4]]);
  const fast = buildShield([['gravity', 3, 4], ['haste', 3, 5]]);
  const faster = buildShield([['gravity', 3, 4], ['haste', 3, 5], ['haste', 3, 6]]);
  assert.equal(plain.gravity.cooldownRate, 1);
  assert.ok(Math.abs(fast.gravity.cooldownRate - 1.3) < 1e-9);
  assert.ok(Math.abs(faster.gravity.cooldownRate - 1.63) < 1e-9);
  assert.equal(plain.rate, undefined);
  assert.equal(fast.rate, undefined);
  const { defense, stick } = defenseHarness(fast);
  stick.active = true;
  defense.update(0.1);
  const expected = CONFIG.gravity.shieldCooldown / 1.3;
  assert.ok(Math.abs(defense.blockCdMax - expected) < 1e-9);
  assert.ok(Math.abs(defense.blockCd - defense.gravityTime - expected) < 1e-9);
  const regular = defenseHarness({});
  regular.stick.active = true;
  regular.defense.update(0.1);
  assert.equal(regular.defense.blockCd, CONFIG.block.cancelCooldown);
});

test('Ускорение на Клинках не ускоряет перезарядку Гравитационного щита', () => {
  const m = buildShield([['gravity', 3, 4], ['blades', 2, 3], ['haste', 1, 3]]);
  assert.equal(m.gravity.cooldownRate, 1);
  assert.ok(m.blades.rate > 1);
});

test('Клинки и Гравитация крепятся друг к другу обеими последовательностями', () => {
  const a = buildShield([['blades', 3, 4], ['gravity', 3, 5]]);
  const b = buildShield([['gravity', 3, 4], ['blades', 3, 5]]);
  assert.ok(a.blades && a.gravity);
  assert.ok(b.blades && b.gravity);
});
