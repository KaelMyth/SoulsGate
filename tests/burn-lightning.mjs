// Запуск: node --experimental-default-type=module --test tests/burn-lightning.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../config_game.js';
import { BuildGrid } from '../build_grid.js';
import { canPlace, highlight } from '../build_rules.js';
import { Game } from '../game.js';
import { createEnemy, initEnemy } from '../world_enemy.js';
import { Absorption } from '../systems_absorption.js';

function enemy(x, y = 0, hp = 1000) {
  const e = createEnemy();
  initEnemy(e, { hp, radius: 12 }, x, y);
  e.active = true;
  return e;
}

function setupCombat() {
  const enemies = [enemy(0), enemy(40), enemy(80), enemy(120), enemy(220)];
  const hits = [];
  const fx = [];
  const g = Object.create(Game.prototype);
  g.config = CONFIG;
  g.enemies = { items: enemies };
  g.zapCandidates = [];
  g.zapBolts = [];
  g.shockSource = { shock: true, active: true };
  g.burnSource = { burn: true, active: true };
  g.rnd = () => 0; // 2 ближайших врага по базовой цепи
  g.autoattack = { rangeMul: 1 };
  g.swarm = { grid: { query(x, y, range, result) {
    for (let i = 0; i < enemies.length; i++) result[i] = i;
    return enemies.length;
  } } };
  g.burst = (...args) => fx.push(args);
  g.combat = { damageEnemy(e, amount, source) {
    hits.push({ e, amount, source });
    if (e.cancelHit) return false;
    e.hp -= amount;
    if (e.hp <= 0) e.active = false;
    return true;
  } };
  return { g, enemies, hits, fx };
}

function equipBurnLightning(coreId = 'projectile') {
  const build = new BuildGrid(7);
  build.placeCore(coreId, CONFIG.cores[coreId], 3, 3);
  build.placeMod({ key: 'burn', def: CONFIG.mods.burn }, 3, 4);
  return build;
}

test('Молния ставится прямо на Горение, её место подсвечивается', () => {
  const build = equipBurnLightning();
  assert.equal(canPlace(build, CONFIG.mods.lightning, 3, 5).ok, true);
  assert.ok(highlight(build, CONFIG.mods.lightning).targets.some(c => c.x === 3 && c.y === 5));
  build.placeMod({ key: 'lightning', def: CONFIG.mods.lightning }, 3, 5);
  assert.deepEqual(build.orphans(), []);
  const m = build.modifiersFor('projectile');
  assert.equal(m.burn.count, 1);
  assert.equal(m.lightning.count, 1);
});

test('Горение → Молния: разряд по двум целям добавляет каждой ровно один стак огня', () => {
  const build = equipBurnLightning();
  build.placeMod({ key: 'lightning', def: CONFIG.mods.lightning }, 3, 5);
  const { g, enemies, hits } = setupCombat();
  const m = build.modifiersFor('projectile');
  const burnDamage = 20 * CONFIG.burn.damageFrac * m.burn.damage;
  const burnInterval = CONFIG.burn.interval / m.burn.rate;
  enemies[0].shockStacks = CONFIG.shock.maxStacks - 1;
  g.zap(enemies[0], burnDamage, burnInterval, 0, 0, m.lightning.mult);
  assert.equal(enemies[0].shockStacks, 0);
  assert.equal(g.zapBolts.length, 2);
  assert.deepEqual(enemies.slice(1, 3).map(e => e.burnStacks), [1, 1]);
  assert.equal(enemies[3].burnStacks, 0);
  assert.ok(enemies.slice(1, 3).every(e => e.burnDmg === burnDamage));
  assert.equal(hits.filter(h => h.source === g.shockSource).length, 3); // исходный разряд + 2 прыжка
});

test('Повторные разряды добавляют по одному стакy, максимум три, без умножения стаков', () => {
  const { g, enemies } = setupCombat();
  for (let k = 1; k <= 5; k++) {
    enemies[0].shockStacks = CONFIG.shock.maxStacks - 1;
    g.zap(enemies[0], 10, CONFIG.burn.interval);
    assert.equal(enemies[1].burnStacks, Math.min(k, 3));
    assert.equal(enemies[2].burnStacks, Math.min(k, 3));
  }
  g.updateBurning(0.5);
  const dmg = 10 * (1 + (CONFIG.burn.maxStacks - 1) * CONFIG.burn.stackBonus);
  // Урон Горения на 3 стаках = ×2 от базового; первый тик уже обработан в combat.
  assert.equal(dmg, 20);
  assert.equal(enemies[1].burnStacks, 3);
});

test('Х2 на Молнии под Горением увеличивает число прыжков, не число стаков на врага', () => {
  const build = equipBurnLightning();
  build.placeMod({ key: 'lightning', def: CONFIG.mods.lightning }, 3, 5);
  build.placeMod({ key: 'x2', def: CONFIG.mods.x2 }, 3, 6);
  assert.deepEqual(build.orphans(), []);
  const m = build.modifiersFor('projectile');
  assert.equal(m.lightning.mult, 2);
  const { g, enemies } = setupCombat();
  enemies[0].shockStacks = CONFIG.shock.maxStacks - 1;
  g.zap(enemies[0], 10, 0.5, 0, 0, m.lightning.mult);
  assert.equal(g.zapBolts.length, 3); // только три соседних врага в радиусе 140
  assert.deepEqual(enemies.slice(1, 4).map(e => e.burnStacks), [1, 1, 1]);
});

test('Молния без Горения не поджигает соседей', () => {
  const { g, enemies } = setupCombat();
  enemies[0].shockStacks = CONFIG.shock.maxStacks - 1;
  g.zap(enemies[0], 0, 0);
  assert.deepEqual(enemies.slice(1, 4).map(e => e.burnStacks), [0, 0, 0]);
});

test('Отменённый цепной удар не наносит стак Горения этому врагу', () => {
  const { g, enemies } = setupCombat();
  enemies[1].cancelHit = true;
  enemies[0].shockStacks = CONFIG.shock.maxStacks - 1;
  g.zap(enemies[0], 10, 0.5);
  assert.equal(enemies[1].burnStacks, 0);
  assert.equal(enemies[2].burnStacks, 1);
});

test('Мёртвая от цепной молнии цель не загорается, выжившая получает один стак', () => {
  const { g, enemies } = setupCombat();
  enemies[1].hp = 1;
  enemies[0].shockStacks = CONFIG.shock.maxStacks - 1;
  g.zap(enemies[0], 10, 0.5);
  assert.equal(enemies[1].active, false);
  assert.equal(enemies[1].burnStacks, 0);
  assert.equal(enemies[2].burnStacks, 1);
});

test('Ветка Горение → Молния доступна и при Поглощении и фиксирует оба эффекта', () => {
  const build = new BuildGrid(7);
  build.placeCore('shield', CONFIG.cores.shield, 3, 3);
  build.placeMod({ key: 'absorption', def: CONFIG.mods.absorption }, 3, 4);
  build.placeMod({ key: 'burn', def: CONFIG.mods.burn }, 2, 4);
  assert.equal(canPlace(build, CONFIG.mods.lightning, 1, 4).ok, true);
  build.placeMod({ key: 'lightning', def: CONFIG.mods.lightning }, 1, 4);
  assert.deepEqual(build.orphans(), []);
  const m = build.modifiersFor('shield');
  assert.equal(m.absorption.burn, true);
  assert.equal(m.absorption.lightning, true);
  assert.equal(m.absorption.targets, 1);
  assert.equal(m.lightning.count, 1);
});

test('Старые связки Горение+Мороз и Молния на Лазере не потеряли совместимость', () => {
  const build = equipBurnLightning();
  assert.equal(canPlace(build, CONFIG.mods.frost, 3, 5).ok, true);
  assert.equal(canPlace(build, CONFIG.mods.lightning, 3, 5).ok, true);
  assert.equal(canPlace(build, CONFIG.mods.x2, 3, 5).ok, false);
});

test('Поглощение → Горение → Молния: основной враг получает 3 стака, два соседа по одному', () => {
  const build = new BuildGrid(7);
  build.placeCore('shield', CONFIG.cores.shield, 3, 3);
  build.placeMod({ key: 'absorption', def: CONFIG.mods.absorption }, 3, 4);
  build.placeMod({ key: 'burn', def: CONFIG.mods.burn }, 2, 4);
  build.placeMod({ key: 'lightning', def: CONFIG.mods.lightning }, 1, 4);
  const { g, enemies } = setupCombat();
  const hero = { x: 0, y: 0, hp: 100, maxHp: 100, active: true };
  const absorption = new Absorption({
    config: CONFIG, hero, enemies: { items: enemies },
    // Узкий обзор: выбирается только враг-источник x=0, остальные за пределами экрана.
    camera: { x: 0, y: 0, viewW: 50, viewH: 200 },
    combat: g.combat, modifiers: () => build.modifiersFor('shield'),
    ignite: (e, dmg, interval) => g.ignite(e, dmg, interval),
    zap: (e, dmg, interval, frost, steam, mult) => g.zap(e, dmg, interval, frost, steam, mult),
  });
  for (let i = 0; i < Math.ceil(3.05 * 60); i++) absorption.update(1 / 60);
  assert.equal(enemies[0].burnStacks, 3);
  assert.deepEqual(enemies.slice(1, 3).map(e => e.burnStacks), [1, 1]);
  assert.equal(enemies[3].burnStacks, 0);
  assert.equal(g.zapBolts.length, 2);
  assert.equal(absorption.color, '255,172,80');
  assert.equal(absorption.flashes.length, 1);
});
