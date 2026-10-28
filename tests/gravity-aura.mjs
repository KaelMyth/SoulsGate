// Запуск: node --experimental-default-type=module --test tests/gravity-aura.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../config_game.js';
import { BuildGrid } from '../build_grid.js';
import { canPlace } from '../build_rules.js';
import { HeroDefense } from '../systems_defense.js';
import { GravityShield } from '../systems_gravity_shield.js';
import { Aura } from '../systems_aura.js';
import { createProjectile, initProjectile, resetProjectile } from '../world_projectile.js';

function build(entries) {
  const grid = new BuildGrid(7);
  grid.placeCore('shield', CONFIG.cores.shield, 3, 3);
  for (const [key, x, y] of entries) {
    const ok = canPlace(grid, CONFIG.mods[key], x, y);
    assert.equal(ok.ok, true, key + ' on ' + x + ',' + y + ' (' + ok.reason + ')');
    grid.placeMod({ key, def: CONFIG.mods[key] }, x, y);
  }
  assert.deepEqual(grid.orphans(), []);
  return grid.modifiersFor('shield');
}

function setup(mods) {
  const hero = { active: true, x: 0, y: 0, radius: 12, dashing: false, glideTime: 0 };
  const stick = { active: true };
  const bus = { on() {}, emit() {} };
  const defense = new HeroDefense({ config: CONFIG, hero, stick, bus, modifiers: () => mods });
  const enemy = { active: true, x: 60, y: 0, radius: 10, def: {}, atk: { state: 'idle' } };
  const enemies = { items: [enemy] };
  const arena = { resolveCircle() {} };
  const gravity = new GravityShield({
    config: CONFIG, hero, defense, enemies, arena, enemyShots: { items: [] }, heroShots: { items: [] },
  });
  defense.update(1 / 60);
  return { hero, stick, defense, enemy, enemies, gravity };
}

test('Гравитация и Аура смерти сочетаются в обеих последовательностях', () => {
  const a = build([['gravity', 3, 4], ['aura', 3, 5]]);
  const b = build([['aura', 3, 4], ['gravity', 3, 5]]);
  assert.ok(a.gravity && a.aura);
  assert.ok(b.gravity && b.aura);
  const c = build([['gravity', 3, 4], ['aura', 2, 3]]);
  assert.ok(c.gravity && c.aura);
});

test('Гравитационная Аура постоянна на движении без собственного времени и кулдауна', () => {
  const s = setup(build([['gravity', 3, 4], ['aura', 3, 5]]));
  assert.equal(s.defense.gravityAuraMode, true);
  assert.equal(s.defense.gravityActive, true);
  assert.equal(s.defense.gravityTime, 0);
  assert.equal(s.defense.gravityDurationMax, 0);
  for (let i = 0; i < 60; i++) s.defense.update(1);
  assert.equal(s.defense.gravityActive, true);
  assert.equal(s.defense.blockCd, 0);
  assert.equal(s.defense.blocking, false);
  s.hero.x = 120;
  assert.equal(s.gravity.active, true);
  assert.equal(s.gravity.radius, CONFIG.aura.radius);
});

test('Перезарядка комбинированного режима остаётся как у Ауры, без отката Гравитации', () => {
  const s = setup(build([['gravity', 3, 4], ['aura', 3, 5]]));
  s.stick.active = false;
  s.defense.update(CONFIG.block.startDelay + 0.05);
  assert.equal(s.defense.blocking, true);
  assert.equal(s.defense.gravityTime, 0);
  s.stick.active = true;
  s.defense.update(0.05);
  assert.equal(s.defense.blocking, false);
  assert.equal(s.defense.blockCd, CONFIG.block.cancelCooldown);
  assert.equal(s.defense.gravityActive, true);
});

test('Радиус Гравитации наследует увеличенный Х2 радиус Ауры', () => {
  const mods = build([['gravity', 2, 3], ['aura', 3, 4], ['x2', 3, 5]]);
  assert.equal(mods.aura.mult, 2);
  const s = setup(mods);
  const expected = CONFIG.aura.radius * (1 + CONFIG.aura.radiusStep);
  assert.equal(s.defense.gravityAuraRadius, expected);
  assert.equal(s.gravity.radius, expected);
});

test('Замедление в комбинированном поле слабее обычной Гравитации, хотя радиус больше', () => {
  const hybrid = setup(build([['gravity', 3, 4], ['aura', 3, 5]]));
  const plain = setup(build([['gravity', 3, 4]]));
  plain.stick.active = false;
  plain.defense.update(CONFIG.block.startDelay + 0.05);
  for (const s of [hybrid, plain]) {
    s.enemy.x = 50;
    s.gravity.beginEnemyStep();
    s.enemy.x = 30;
    s.gravity.slowEnemies();
  }
  assert.ok(Math.abs(hybrid.enemy.x - (50 - 20 * CONFIG.gravity.auraEnemySpeed)) < 1e-8);
  assert.ok(Math.abs(plain.enemy.x - (50 - 20 * CONFIG.gravity.shieldEnemySpeed)) < 1e-8);
  assert.ok(hybrid.enemy.x < plain.enemy.x, 'в режиме Ауры враг проходит дальше');
  assert.ok(hybrid.gravity.radius > plain.gravity.radius);
});

test('Вражеские снаряды в Ауре замедляются слабее и не становятся неуязвимыми', () => {
  const hybrid = setup(build([['gravity', 3, 4], ['aura', 3, 5]]));
  const plain = setup(build([['gravity', 3, 4]]));
  plain.stick.active = false;
  plain.defense.update(CONFIG.block.startDelay + 0.05);
  const def = { ...CONFIG.projectiles.bolt, speed: 100, range: 1000 };
  const p1 = createProjectile(), p2 = createProjectile();
  initProjectile(p1, def, 50, 0, -1, 0, hybrid.enemy);
  initProjectile(p2, def, 50, 0, -1, 0, plain.enemy);
  const d1 = hybrid.gravity.enemyShotDt(p1, 0.1);
  const d2 = plain.gravity.enemyShotDt(p2, 0.1);
  assert.ok(Math.abs(d1 - CONFIG.gravity.auraProjectileSpeed * 0.1) < 1e-8);
  assert.ok(Math.abs(d2 - CONFIG.gravity.shieldProjectileSpeed * 0.1) < 1e-8);
  assert.ok(d1 > d2 && d1 < 0.1);
  assert.equal(p1.gravityReturned, false);
});

test('В комбинированной Ауре стихийные стаки реже, а Горение слабее', () => {
  const mods = build([['gravity', 3, 4], ['burn', 3, 5], ['aura', 2, 3]]);
  const s = setup(mods);
  s.enemy.x = 40;
  let hits = 0;
  s.gravity.ignite = (enemy, dmg, interval) => {
    assert.equal(enemy, s.enemy);
    assert.equal(dmg, CONFIG.gravity.shieldBurnDamage * CONFIG.gravity.auraBurnDamageMul);
    assert.equal(interval, CONFIG.burn.interval);
    hits++;
  };
  s.gravity.applyElements(0.02);
  assert.equal(hits, 1);
  s.gravity.applyElements(CONFIG.gravity.shieldElementInterval);
  assert.equal(hits, 1, 'в Ауре прошло лишь полпериода');
  s.gravity.applyElements(CONFIG.gravity.shieldElementInterval);
  assert.equal(hits, 2);
});

test('Аура сама наносит меньший урон и тикает реже, а обычная Аура не изменена', () => {
  const hero = { active: true, x: 0, y: 0 };
  const enemy = { active: true, x: 25, y: 0, radius: 10 };
  const enemies = { items: [enemy] };
  const grid = { buf: [0], query() { return 1; } };
  const make = (mods) => {
    let count = 0, damage = 0;
    const aura = new Aura({ config: CONFIG, hero, enemies, grid, modifiers: () => mods,
      combat: { damageEnemy(e, amount) { count++; damage += amount; return true; } },
      ignite() {}, chill() {}, zap() {} });
    return { aura, totals: () => ({ count, damage }) };
  };
  const regular = make({ aura: { mult: 1, damage: 1, rate: 1 } });
  const hybrid = make({ aura: { mult: 1, damage: 1, rate: 1 }, gravity: { count: 1 } });
  regular.aura.update(1);
  hybrid.aura.update(1);
  assert.equal(regular.totals().count, CONFIG.aura.ticks);
  assert.equal(hybrid.totals().count, Math.floor(CONFIG.aura.ticks * CONFIG.gravity.auraTickRateMul));
  assert.ok(Math.abs(hybrid.totals().damage / hybrid.totals().count - CONFIG.aura.damage * CONFIG.gravity.auraDamageMul) < 1e-8);
  assert.ok(hybrid.totals().damage < regular.totals().damage);
});

test('Обычная Гравитация по-прежнему заканчивается по таймеру, Аура без неё не создаёт поле', () => {
  const ordinary = setup(build([['gravity', 3, 4]]));
  assert.equal(ordinary.defense.gravityActive, false);
  ordinary.stick.active = false;
  ordinary.defense.update(CONFIG.block.startDelay + 0.05);
  assert.equal(ordinary.defense.gravityActive, true);
  ordinary.stick.active = true;
  ordinary.defense.update(CONFIG.gravity.shieldDuration + 0.1);
  assert.equal(ordinary.defense.gravityActive, false);
  const aura = setup(build([['aura', 3, 4]]));
  assert.equal(aura.defense.gravityActive, false);
  assert.equal(aura.defense.gravityAuraMode, false);
});


test('Ослабление урона возвращённого вражеского снаряда действует только в гибридном поле', () => {
  const s = setup(build([['gravity', 3, 4], ['aura', 3, 5]]));
  const p = createProjectile();
  initProjectile(p, CONFIG.projectiles.bolt, 45, 0, 1, 0, { active: true });
  p.active = true;
  p.prevX = 35; p.x = 45; p.gravityTouched = true; p.gravityReturned = true; p.gravityAuraWeak = true;
  s.enemy.x = 40;
  s.gravity.enemyShots.items.push(p);
  s.gravity.grid = { query(x, y, radius, buf) { buf[0] = 0; return 1; } };
  let gotDamage = -1;
  s.gravity.combat = { damageEnemy(e, damage) { gotDamage = damage; return true; } };
  s.gravity.hitEnemies();
  assert.ok(Math.abs(gotDamage - p.damage * CONFIG.gravity.auraProjectileDamageMul) < 1e-8);
  assert.equal(p.active, false);
});

test('Ослабление снаряда не передаётся следующему снаряду из пула', () => {
  const p = createProjectile();
  p.gravityAuraWeak = true;
  initProjectile(p, CONFIG.projectiles.bolt, 0, 0, 1, 0, {});
  assert.equal(p.gravityAuraWeak, false);
  p.gravityAuraWeak = true;
  resetProjectile(p);
  assert.equal(p.gravityAuraWeak, false);
});
