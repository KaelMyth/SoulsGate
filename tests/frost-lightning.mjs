// Запуск: node --experimental-default-type=module --test tests/frost-lightning.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../config_game.js';
import { BuildGrid } from '../build_grid.js';
import { canPlace, highlight } from '../build_rules.js';
import { Game } from '../game.js';
import { createEnemy, initEnemy } from '../world_enemy.js';
import { Absorption } from '../systems_absorption.js';

function enemy(x, y = 0, hp = 1000, immune = false) {
  const e = createEnemy();
  initEnemy(e, { hp, radius: 12, immuneFrost: immune }, x, y);
  e.active = true;
  return e;
}

function combatSetup() {
  const enemies = [enemy(0), enemy(40), enemy(80), enemy(120), enemy(220)];
  const hits = [], clouds = [];
  const g = Object.create(Game.prototype);
  g.config = CONFIG;
  g.enemies = { items: enemies };
  g.zapCandidates = [];
  g.zapBolts = [];
  g.shockSource = { shock: true, active: true };
  g.rnd = () => 0; // 2 ближайших врага
  g.autoattack = { rangeMul: 1 };
  g.swarm = { grid: { query(x, y, range, result) {
    for (let i = 0; i < enemies.length; i++) result[i] = i;
    return enemies.length;
  } } };
  g.burst = () => {};
  g.steamBurst = (x, y, damage, interval) => clouds.push({ x, y, damage, interval });
  g.combat = { damageEnemy(e, amount, source) {
    hits.push({ e, amount, source });
    if (e.cancelHit) return false;
    e.hp -= amount;
    if (e.hp <= 0) e.active = false;
    return true;
  } };
  const discharge = (burnDamage = 0, burnInterval = 0, frost = 1, steam = 0, mult = 1) => {
    enemies[0].shockStacks = CONFIG.shock.maxStacks - 1;
    g.zap(enemies[0], burnDamage, burnInterval, frost, steam, mult);
  };
  return { g, enemies, hits, clouds, discharge };
}

function buildSetup(coreId = 'projectile') {
  const build = new BuildGrid(7);
  build.placeCore(coreId, CONFIG.cores[coreId], 3, 3);
  build.placeMod({ key: 'frost', def: CONFIG.mods.frost }, 3, 4);
  return build;
}

test('Молния прикрепляется к Морозу и подсвечивается в сетке', () => {
  const build = buildSetup();
  assert.equal(canPlace(build, CONFIG.mods.lightning, 3, 5).ok, true);
  assert.ok(highlight(build, CONFIG.mods.lightning).targets.some(c => c.x === 3 && c.y === 5));
  build.placeMod({ key: 'lightning', def: CONFIG.mods.lightning }, 3, 5);
  assert.deepEqual(build.orphans(), []);
  const mods = build.modifiersFor('projectile');
  assert.equal(mods.frost.count, 1);
  assert.equal(mods.lightning.count, 1);
});

test('Цепной разряд накладывает ровно один стак Мороза на каждого поражённого соседа', () => {
  const build = buildSetup();
  build.placeMod({ key: 'lightning', def: CONFIG.mods.lightning }, 3, 5);
  const { g, enemies, hits, discharge } = combatSetup();
  discharge();
  assert.equal(g.zapBolts.length, 2);
  assert.deepEqual(enemies.slice(1, 4).map(e => e.frostStacks), [1, 1, 0]);
  assert.deepEqual(enemies.slice(1, 4).map(e => e.speedMul), [0.9, 0.9, 1]);
  assert.deepEqual(enemies.slice(1, 3).map(e => e.shockStacks), [0, 0]); // нет цепной рекурсии
  assert.equal(hits.filter(h => h.source === g.shockSource).length, 3);
});

test('Повторные цепные попадания накапливают по одному Морозу вплоть до заморозки', () => {
  const { enemies, discharge } = combatSetup();
  for (let i = 1; i <= CONFIG.frost.maxStacks; i++) {
    discharge();
    if (i < CONFIG.frost.maxStacks) {
      assert.equal(enemies[1].frostStacks, i);
      assert.equal(enemies[2].frostStacks, i);
      assert.ok(enemies[1].freezeT === 0);
    }
  }
  assert.equal(enemies[1].freezeT, CONFIG.frost.freezeTime);
  assert.equal(enemies[2].freezeT, CONFIG.frost.freezeTime);
  assert.equal(enemies[1].speedMul, 0);
  assert.equal(enemies[1].frostStacks, 0);
  discharge();
  assert.equal(enemies[1].freezeT, CONFIG.frost.freezeTime); // замороженные не копят новые стаки
});

test('Х2 на Молнии увеличивает количество поражённых врагов, но не стаки каждого', () => {
  const build = buildSetup();
  build.placeMod({ key: 'lightning', def: CONFIG.mods.lightning }, 3, 5);
  build.placeMod({ key: 'x2', def: CONFIG.mods.x2 }, 3, 6);
  assert.deepEqual(build.orphans(), []);
  const mult = build.modifiersFor('projectile').lightning.mult;
  assert.equal(mult, 2);
  const { g, enemies, discharge } = combatSetup();
  discharge(0, 0, 1, 0, mult);
  assert.equal(g.zapBolts.length, 3);
  assert.deepEqual(enemies.slice(1, 4).map(e => e.frostStacks), [1, 1, 1]);
});

test('Молния без Мороза не передаёт холода', () => {
  const { enemies, discharge } = combatSetup();
  discharge(0, 0, 0);
  assert.deepEqual(enemies.slice(1, 4).map(e => e.frostStacks), [0, 0, 0]);
});

test('Отменённое попадание молнии не передаёт стак Мороза', () => {
  const { enemies, discharge } = combatSetup();
  enemies[1].cancelHit = true;
  discharge();
  assert.equal(enemies[1].frostStacks, 0);
  assert.equal(enemies[2].frostStacks, 1);
});

test('Убитая разрядом цель не получает статус, выжившая получает', () => {
  const { enemies, discharge } = combatSetup();
  enemies[1].hp = 1;
  discharge();
  assert.equal(enemies[1].active, false);
  assert.equal(enemies[1].frostStacks, 0);
  assert.equal(enemies[2].frostStacks, 1);
});

test('Иммунитет к Морозу не отменяет урон Молнии, но запрещает заморозку', () => {
  const { enemies, hits, discharge } = combatSetup();
  enemies[1].def.immuneFrost = true;
  for (let i = 0; i < CONFIG.frost.maxStacks; i++) discharge();
  assert.equal(enemies[1].freezeT, 0);
  assert.equal(enemies[1].speedMul, 1);
  assert.ok(hits.some(h => h.e === enemies[1]));
});

test('В сочетании с Горением последний стак Мороза от Молнии вызывает Пар', () => {
  const { enemies, clouds, discharge } = combatSetup();
  enemies[1].frostStacks = CONFIG.frost.maxStacks - 1;
  discharge(10, 0.5, 1, 1);
  assert.equal(clouds.length, 1);
  assert.equal(clouds[0].x, enemies[1].x);
  assert.equal(enemies[1].freezeT, 0);
  assert.equal(enemies[2].frostStacks, 1);
  assert.equal(enemies[2].burnStacks, CONFIG.burn.maxStacks); // красные дуги сразу дают максимум огня
});

test('Молнию можно навесить на Мороз, который уже образовал связку Пар с Горением', () => {
  const build = buildSetup();
  build.placeMod({ key: 'burn', def: CONFIG.mods.burn }, 3, 5); // Мороз + Горение => Пар
  assert.equal(canPlace(build, CONFIG.mods.lightning, 2, 4).ok, true);
  build.placeMod({ key: 'lightning', def: CONFIG.mods.lightning }, 2, 4);
  assert.deepEqual(build.orphans(), []);
  const m = build.modifiersFor('projectile');
  assert.ok(m.steam);
  assert.equal(m.frost.count, 1);
  assert.equal(m.lightning.count, 1);
});

test('Поглощение → Мороз → Молния: главная цель заморожена, соседям по 1 стаку', () => {
  const build = new BuildGrid(7);
  build.placeCore('shield', CONFIG.cores.shield, 3, 3);
  build.placeMod({ key: 'absorption', def: CONFIG.mods.absorption }, 3, 4);
  build.placeMod({ key: 'frost', def: CONFIG.mods.frost }, 2, 4);
  assert.equal(canPlace(build, CONFIG.mods.lightning, 1, 4).ok, true);
  build.placeMod({ key: 'lightning', def: CONFIG.mods.lightning }, 1, 4);
  assert.deepEqual(build.orphans(), []);
  const m = build.modifiersFor('shield');
  assert.equal(m.absorption.frost, true);
  assert.equal(m.absorption.lightning, true);
  assert.equal(m.absorption.targets, 1);
  const { g, enemies } = combatSetup();
  const hero = { x: 0, y: 0, active: true, hp: 100, maxHp: 100 };
  const absorption = new Absorption({
    config: CONFIG, hero, enemies: { items: enemies },
    camera: { x: 0, y: 0, viewW: 50, viewH: 200 },
    combat: g.combat, modifiers: () => build.modifiersFor('shield'),
    chill: (e, st, bd, bi) => g.chill(e, st, bd, bi),
    zap: (e, bd, bi, fr, st, cm) => g.zap(e, bd, bi, fr, st, cm),
  });
  for (let i = 0; i < Math.ceil(3.05 * 60); i++) absorption.update(1 / 60);
  assert.equal(enemies[0].freezeT, CONFIG.frost.freezeTime);
  assert.deepEqual(enemies.slice(1, 4).map(e => e.frostStacks), [1, 1, 0]);
  assert.equal(g.zapBolts.length, 2);
  assert.equal(absorption.color, '172,84,136');
});
