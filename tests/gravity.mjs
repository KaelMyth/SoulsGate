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
    assert.equal(p.gravityHold, CONFIG.gravity.holdFraction);
  }
});

test('Снаряд удерживается притяжением, затем резко вырывается с повышенной скоростью', () => {
  const def = CONFIG.projectiles[CONFIG.attack.projectile];
  const p = createProjectile(); initProjectile(p, { ...def, range: 2000 }, 0, 0, 1, 0, {});
  p.active = true; // длинная трасса для измерения скорости уже после рывка
  p.gravity = true;
  p.gravityStart = CONFIG.gravity.startSpeed;
  p.gravityEnd = CONFIG.gravity.maxSpeed;
  p.gravityRamp = CONFIG.gravity.rampTime;
  p.gravityHold = CONFIG.gravity.holdFraction;
  const d1 = p.x; updateProjectile(p, 1 / 60, arena);
  const vStart = (p.x - d1) * 60;
  advance(p, 0.6);
  const d2 = p.x; updateProjectile(p, 1 / 60, arena);
  const vHeld = (p.x - d2) * 60;
  advance(p, 0.26);
  const d3 = p.x; updateProjectile(p, 1 / 60, arena);
  const vEscape = (p.x - d3) * 60;
  advance(p, 0.3);
  const d4 = p.x; updateProjectile(p, 1 / 60, arena);
  const vMax = (p.x - d4) * 60;
  assert.ok(vStart < def.speed * 0.12, 'медленный отрыв');
  assert.ok(vHeld < def.speed * 0.25, 'длительное сопротивление');
  assert.ok(vEscape > def.speed * 2, 'резкое ускорение');
  assert.ok(Math.abs(vMax - def.speed * CONFIG.gravity.maxSpeed) < 1e-7);
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
  assert.equal(q.gravityHold, p.gravityHold);
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

test('Гравитация увеличивает базу Горения на снаряде вместе с прямым уроном', () => {
  const s = setup();
  s.equip('gravity', 3, 4);
  s.equip('burn', 2, 3);
  s.attack.fire({ x: 180, y: 0 });
  const p = s.shots[0];
  const mods = s.build.modifiersFor('projectile');
  assert.ok(mods.burn);
  assert.ok(Math.abs(p.burnDmg - p.damage * CONFIG.burn.damageFrac * mods.burn.damage) < 1e-8);
});

test('Ускоренный снаряд проверяет всё расстояние за кадр и не пролетает сквозь врага', () => {
  const e = { x: 42, y: 0, radius: 9, active: true };
  const p = createProjectile();
  initProjectile(p, CONFIG.projectiles.bolt, 0, 0, 1, 0, {});
  p.active = true;
  p.prevX = 0; p.prevY = 0;
  p.x = 80; p.y = 0; p.gravity = true;
  const hits = [];
  const game = Object.create(Game.prototype);
  game.heroShots = { items: [p] };
  game.enemies = { items: [e] };
  game.config = CONFIG;
  game.shotCandidates = [];
  game.swarm = { grid: { query(x, y, radius, out) {
    const dx = x - e.x, dy = y - e.y;
    const near = dx * dx + dy * dy <= radius * radius;
    if (near) out[0] = 0;
    return near ? 1 : 0;
  } } };
  game.collisions = { checks: 0 };
  game.onShotHitEnemy = (shot, target) => hits.push({ shot, target });
  game.hitEnemiesWithShots();
  assert.equal(hits.length, 1);
  assert.equal(hits[0].target, e);
});

test('Сегмент ускоренного снаряда не поражает врага в стороне от траектории', () => {
  const e = { x: 42, y: 35, radius: 9, active: true };
  const p = createProjectile();
  initProjectile(p, CONFIG.projectiles.bolt, 0, 0, 1, 0, {});
  p.active = true;
  p.prevX = 0; p.prevY = 0;
  p.x = 80; p.y = 0; p.gravity = true;
  const hits = [];
  const g = Object.create(Game.prototype);
  g.heroShots = { items: [p] }; g.enemies = { items: [e] };
  g.config = CONFIG; g.shotCandidates = [];
  g.swarm = { grid: { query(x, y, radius, arr) { arr[0] = 0; return 1; } } };
  g.collisions = { checks: 0 };
  g.onShotHitEnemy = () => hits.push(true);
  g.hitEnemiesWithShots();
  assert.equal(hits.length, 0);
});

test('При максимальном притяжении снаряд долго остаётся возле героя', () => {
  const p = createProjectile();
  initProjectile(p, CONFIG.projectiles.bolt, 0, 0, 1, 0, {});
  p.active = true;
  const G = CONFIG.gravity;
  Object.assign(p, { gravity: true, gravityStart: G.startSpeed,
    gravityEnd: G.maxSpeed, gravityRamp: G.rampTime, gravityHold: G.holdFraction });
  advance(p, G.rampTime * G.holdFraction - 1 / 60);
  assert.ok(p.travelled < 70, 'не улетает далеко до освобождения');
  assert.equal(p.active, true);
});

test('На стандартной дальности после удержания следует короткий мощный рывок', () => {
  const p = createProjectile();
  initProjectile(p, CONFIG.projectiles.bolt, 0, 0, 1, 0, {});
  p.active = true;
  const G = CONFIG.gravity;
  Object.assign(p, { gravity: true, gravityStart: G.startSpeed,
    gravityEnd: G.maxSpeed, gravityRamp: G.rampTime, gravityHold: G.holdFraction });
  advance(p, G.rampTime * G.holdFraction - 1 / 60);
  const heldDistance = p.travelled;
  let extra = 0;
  while (p.active && extra < 2) { updateProjectile(p, 1 / 60, arena); extra += 1 / 60; }
  assert.equal(p.active, false);
  assert.ok(heldDistance < p.range / 4);
  assert.ok(extra < 0.4, 'после вырывания снаряд быстро долетает до конца');
  assert.ok(Math.abs(p.travelled - p.range) < 1e-6);
});

test('Доля удержания настраивается независимо от максимальной скорости', () => {
  const G = CONFIG.gravity, def = CONFIG.projectiles.bolt;
  const first = createProjectile(), second = createProjectile();
  for (const p of [first, second]) {
    initProjectile(p, { ...def, range: 3000 }, 0, 0, 1, 0, {});
    p.active = true; p.gravity = true;
    p.gravityStart = G.startSpeed; p.gravityEnd = G.maxSpeed; p.gravityRamp = G.rampTime;
  }
  first.gravityHold = 0.2;
  second.gravityHold = 0.85;
  advance(first, 0.7); advance(second, 0.7);
  assert.ok(first.travelled > second.travelled * 3, 'ранний выход из поля ускоряет полёт');
});

test('Пул снарядов сбрасывает длительность удержания на безопасное значение', () => {
  const p = createProjectile();
  initProjectile(p, CONFIG.projectiles.bolt, 0, 0, 1, 0, {});
  p.gravityHold = 0.92;
  resetProjectile(p);
  initProjectile(p, CONFIG.projectiles.bolt, 0, 0, 1, 0, {});
  assert.equal(p.gravity, false);
  assert.equal(p.gravityHold, 0.72);
});
