// Запуск: node --experimental-default-type=module --test tests/gravity-shield.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../config_game.js';
import { GravityShield } from '../systems_gravity_shield.js';
import { createProjectile, initProjectile, resetProjectile } from '../world_projectile.js';
import { parentAccepts } from '../build_rules.js';
function setup() {
  const hero = { active: true, x: 0, y: 0, radius: 12 };
  const defense = { blocking: true, gravityOn: true };
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
test('без активного блока или мода поле не мешает', () => {
  const s = setup(); s.defense.gravityOn = false; s.shield.blockEnemies(); assert.equal(s.enemy.x, 12);
  s.defense.gravityOn = true; s.defense.blocking = false; s.shield.blockEnemies(); assert.equal(s.enemy.x, 12);
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
