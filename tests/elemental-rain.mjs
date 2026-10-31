// Запуск: node --experimental-default-type=module --test tests/elemental-rain.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../config_game.js';
import { BuildGrid } from '../build_grid.js';
import { canPlace } from '../build_rules.js';
import { Game } from '../game.js';
import { createEnemy, initEnemy } from '../world_enemy.js';

function buildRain(elements) {
  const grid = new BuildGrid(7);
  assert.equal(canPlace(grid, CONFIG.mods.rain, 3, 3).ok, true);
  grid.placeMod({ key: 'rain', def: CONFIG.mods.rain }, 3, 3);
  const coordinates = { burn: [3, 4], frost: [3, 5], lightning: [3, 6] };
  for (let i = 0; i < elements.length; i++) {
    const key = elements[i], pos = elements.length > 1 ? [3, 4 + i] : [3, 4];
    const possible = canPlace(grid, CONFIG.mods[key], pos[0], pos[1]);
    assert.equal(possible.ok, true, key + ': ' + possible.reason);
    grid.placeMod({ key, def: CONFIG.mods[key] }, pos[0], pos[1]);
  }
  assert.deepEqual(grid.orphans(), []);
  return grid;
}

function setup(keys = [], count = 2) {
  const grid = buildRain(keys);
  const enemies = [];
  for (let i = 0; i < count; i++) {
    const e = createEnemy();
    initEnemy(e, { radius: 12, speed: 50, hp: 1000, keepDistance: 0 }, 30 + 40 * i, 0);
    e.active = true;
    enemies.push(e);
  }
  const casts = { steam: 0, discharge: 0 };
  const fake = {
    config: CONFIG, state: 'playing', hero: { active: true }, skillCd: [0, 0, 0],
    build: grid, enemies: { items: enemies }, hud: { rainT: 0, rainMask: 0 },
    ignite: Game.prototype.ignite, chill: Game.prototype.chill, zap: Game.prototype.zap,
    steamBurst() { casts.steam++; },
    discharge() { casts.discharge++; },
    burst() {},
  };
  return { fake, enemies, casts, grid };
}

test('Магический дождь принимает стихии отдельно и цепочки парных и тройных комбинаций', () => {
  for (const keys of [
    [], ['burn'], ['frost'], ['lightning'],
    ['burn', 'frost'], ['burn', 'lightning'], ['frost', 'lightning'],
    ['burn', 'frost', 'lightning'],
  ]) {
    const build = buildRain(keys);
    const mods = build.modifiersFor(build.secondaryId('rain'));
    assert.equal(!!mods.burn, keys.includes('burn'));
    assert.equal(!!mods.frost, keys.includes('frost'));
    assert.equal(!!mods.lightning, keys.includes('lightning'));
    assert.equal(!!mods.steam, keys.includes('burn') && keys.includes('frost'));
  }
});

test('Обычный дождь сохраняет +20% уязвимости до смерти и не даёт стихий', () => {
  const { fake, enemies } = setup([]);
  assert.equal(Game.prototype.castRain.call(fake), true);
  assert.equal(fake.hud.rainMask, 0);
  assert.equal(fake.skillCd[0], CONFIG.skills.rain.cooldown);
  for (const e of enemies) {
    assert.equal(e.vuln, true);
    assert.equal(e.burnStacks, 0);
    assert.equal(e.frostStacks, 0);
    assert.equal(e.shockStacks, 0);
  }
});

test('Горение: ровно два стака на каждого врага без повторного каста во время кулдауна', () => {
  const { fake, enemies } = setup(['burn'], 3);
  assert.equal(Game.prototype.castRain.call(fake), true);
  assert.equal(fake.hud.rainMask, 1);
  for (const e of enemies) {
    assert.equal(e.burnStacks, 2);
    assert.equal(e.burnDmg, CONFIG.skills.rain.burnTickDamage);
    assert.ok(e.burnT > 0);
    assert.equal(e.vuln, true);
  }
  assert.equal(Game.prototype.castRain.call(fake), false);
  for (const e of enemies) assert.equal(e.burnStacks, 2);
});

test('Мороз: ровно два стака, обычное замедление, без урона Горения', () => {
  const { fake, enemies } = setup(['frost']);
  Game.prototype.castRain.call(fake);
  assert.equal(fake.hud.rainMask, 2);
  for (const e of enemies) {
    assert.equal(e.frostStacks, 2);
    assert.equal(e.speedMul, 1 - CONFIG.frost.slowPerStack * 2);
    assert.equal(e.burnStacks, 0);
    assert.equal(e.vuln, true);
  }
});

test('Молния: ровно два стака с обычным порогом разряда', () => {
  const { fake, enemies, casts } = setup(['lightning']);
  Game.prototype.castRain.call(fake);
  assert.equal(fake.hud.rainMask, 4);
  for (const e of enemies) assert.equal(e.shockStacks, 2);
  assert.equal(casts.discharge, 0);
  enemies[0].shockStacks = CONFIG.shock.maxStacks - 2;
  fake.skillCd[0] = 0;
  Game.prototype.castRain.call(fake);
  assert.equal(casts.discharge, 2, 'оба врага с накопленными стаками разрядились');
});

test('Горение + Мороз: два стака каждой стихии и обычная паровая реакция', () => {
  const { fake, enemies, casts } = setup(['burn', 'frost']);
  Game.prototype.castRain.call(fake);
  assert.equal(fake.hud.rainMask, 3);
  for (const e of enemies) {
    assert.equal(e.burnStacks, 2);
    assert.equal(e.frostStacks, 2);
  }
  enemies[0].frostStacks = CONFIG.frost.maxStacks - 2;
  fake.skillCd[0] = 0;
  Game.prototype.castRain.call(fake);
  assert.equal(casts.steam, 1);
  assert.equal(enemies[0].freezeT, 0, 'вместо заморозки сработал Пар');
});

test('Горение + Молния: оба получают по два стака', () => {
  const { fake, enemies } = setup(['burn', 'lightning']);
  Game.prototype.castRain.call(fake);
  assert.equal(fake.hud.rainMask, 5);
  for (const e of enemies) {
    assert.equal(e.burnStacks, 2);
    assert.equal(e.shockStacks, 2);
    assert.equal(e.frostStacks, 0);
  }
});

test('Мороз + Молния: два стака каждой, без Горения', () => {
  const { fake, enemies } = setup(['frost', 'lightning']);
  Game.prototype.castRain.call(fake);
  assert.equal(fake.hud.rainMask, 6);
  for (const e of enemies) {
    assert.equal(e.frostStacks, 2);
    assert.equal(e.shockStacks, 2);
    assert.equal(e.burnStacks, 0);
  }
});

test('Тройной дождь: Горение, Мороз и Молния дают по два стака на всех живых', () => {
  const { fake, enemies } = setup(['burn', 'frost', 'lightning'], 3);
  Game.prototype.castRain.call(fake);
  assert.equal(fake.hud.rainMask, 7);
  for (const e of enemies) {
    assert.equal(e.burnStacks, 2);
    assert.equal(e.frostStacks, 2);
    assert.equal(e.shockStacks, 2);
    assert.equal(e.vuln, true);
  }
});

test('Неактивные враги не получают новые статусы; дождь только в игре с умением', () => {
  const { fake, enemies } = setup(['burn', 'frost', 'lightning']);
  enemies[1].active = false;
  Game.prototype.castRain.call(fake);
  assert.equal(enemies[1].vuln, false);
  assert.equal(enemies[1].burnStacks, 0);
  assert.equal(enemies[1].frostStacks, 0);
  assert.equal(enemies[1].shockStacks, 0);
  fake.skillCd[0] = 0;
  fake.state = 'paused';
  assert.equal(Game.prototype.castRain.call(fake), false);
  fake.state = 'playing';
  fake.hero.active = false;
  assert.equal(Game.prototype.castRain.call(fake), false);
  fake.hero.active = true;
  const original = fake.build;
  fake.build = { secondaryId() { return null; } };
  assert.equal(Game.prototype.castRain.call(fake), false);
  fake.build = original;
});

test('Цвет дождя фиксируется на время эффекта, а цвет слота следует за билдом', () => {
  const { fake, grid } = setup(['burn']);
  Game.prototype.castRain.call(fake);
  assert.equal(fake.hud.rainMask, 1);
  const burning = grid.cells.find(c => c.mod && c.mod.key === 'burn');
  burning.mod = { key: 'frost', def: CONFIG.mods.frost };
  grid.ver++;
  fake.inspiration = fake.inspiration || { active: false, remaining: 0 };
  Game.prototype.updateSkills.call(fake, 0.1);
  assert.equal(fake.hud.rainMask, 1, 'активный дождь остаётся огненным');
  assert.equal(fake.hud.rainEquippedMask, 2, 'слот становится морозным');
});
