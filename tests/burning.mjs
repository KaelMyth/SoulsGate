// Запуск: node --experimental-default-type=module --test tests/burning.mjs
// Проверяем настоящие методы Game, не создавая Canvas, DOM и игровой цикл.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../config_game.js';
import { Game } from '../game.js';
import { createEnemy, initEnemy } from '../world_enemy.js';
import { burnStats } from '../build_cores.js';

function setup() {
  const e = createEnemy();
  initEnemy(e, { hp: 10000, radius: 12 }, 10, 10);
  e.active = true;
  const hits = [];
  const g = Object.create(Game.prototype);
  g.config = CONFIG;
  g.enemies = { items: [e] };
  g.burnSource = { burn: true, active: true };
  g.combat = { damageEnemy(target, amount, source) {
    hits.push({ target, amount, source });
    target.hp -= amount;
    return true;
  } };
  return { e, hits, g,
    ignite: (dmg = 10, interval = 0.5) => g.ignite(e, dmg, interval),
    advance: (dt = 0.5) => g.updateBurning(dt),
  };
}

test('Первое, второе, третье наложения дают 100%, 150%, 200% базового тика', () => {
  const s = setup();
  s.ignite(); assert.equal(s.e.burnStacks, 1);
  s.advance(); assert.equal(s.hits.at(-1).amount, 10);
  s.ignite(); assert.equal(s.e.burnStacks, 2);
  s.advance(); assert.equal(s.hits.at(-1).amount, 15);
  s.ignite(); assert.equal(s.e.burnStacks, 3);
  s.advance(); assert.equal(s.hits.at(-1).amount, 20);
});

test('Четвёртый и последующие поджоги не увеличивают урон, но продлевают длительность', () => {
  const s = setup();
  for (let i = 0; i < 7; i++) s.ignite();
  assert.equal(s.e.burnStacks, 3);
  s.advance();
  assert.equal(s.hits.at(-1).amount, 20);
  s.advance(1);
  s.ignite();
  assert.equal(s.e.burnT, CONFIG.burn.duration);
  assert.equal(s.e.burnStacks, 3);
  s.advance();
  assert.equal(s.hits.at(-1).amount, 20);
});

test('Бонус стаков складывается от базы, а не умножается сам на себя', () => {
  const s = setup();
  s.ignite(40);
  s.ignite(40);
  s.ignite(40);
  s.advance();
  assert.equal(s.hits.at(-1).amount, 80);
  assert.notEqual(s.hits.at(-1).amount, 90);
});

test('Слабый поджог накапливает стак, но не заменяет более сильную основу', () => {
  const s = setup();
  s.ignite(20, 0.5);
  s.ignite(5, 0.1);
  assert.equal(s.e.burnDmg, 20);
  assert.equal(s.e.burnInt, 0.5);
  s.advance();
  assert.equal(s.hits.at(-1).amount, 30);
});

test('Более сильный источник заменяет базовый урон; бонус 50% остаётся аддитивным', () => {
  const s = setup();
  s.ignite(10);
  s.ignite(20, 0.25);
  s.ignite(15);
  assert.equal(s.e.burnDmg, 20);
  assert.equal(s.e.burnInt, 0.25);
  s.advance(0.25);
  assert.equal(s.hits.at(-1).amount, 40);
});

test('Повторный поджог не сбрасывает прогресс текущего тика', () => {
  const s = setup();
  s.ignite(10);
  s.advance(0.25);
  assert.equal(s.hits.length, 0);
  s.ignite(10);
  s.advance(0.25);
  assert.equal(s.hits.length, 1);
  assert.equal(s.hits[0].amount, 15);
});

test('После истечения Горения новый поджог начинает с первого стака', () => {
  const s = setup();
  s.ignite(); s.ignite(); s.ignite();
  s.advance(CONFIG.burn.duration);
  assert.equal(s.e.burnT, 0);
  s.ignite();
  assert.equal(s.e.burnStacks, 1);
  s.advance();
  assert.equal(s.hits.at(-1).amount, 10);
});

test('Переиспользование врага сбрасывает стаки и весь огонь', () => {
  const s = setup();
  s.ignite(); s.ignite(); s.ignite();
  initEnemy(s.e, { hp: 10000, radius: 12 }, 20, 20);
  s.e.active = true;
  assert.equal(s.e.burnStacks, 0);
  assert.equal(s.e.burnDmg, 0);
  assert.equal(s.e.burnT, 0);
  s.ignite();
  assert.equal(s.e.burnStacks, 1);
});

test('Нельзя поджечь неактивного врага или вызвать нулевой урон', () => {
  const s = setup();
  s.e.active = false;
  s.ignite();
  assert.equal(s.e.burnStacks, 0);
  s.e.active = true;
  s.ignite(0);
  assert.equal(s.e.burnStacks, 0);
});

test('В разных врагах заряды считаются независимо', () => {
  const s = setup();
  const b = createEnemy();
  initEnemy(b, { hp: 10000, radius: 12 }, 40, 40);
  b.active = true;
  s.g.enemies.items.push(b);
  s.ignite();
  s.g.ignite(b, 10, 0.5);
  s.g.ignite(b, 10, 0.5);
  s.advance();
  assert.equal(s.hits.find(h => h.target === s.e).amount, 10);
  assert.equal(s.hits.find(h => h.target === b).amount, 15);
});

test('Карточка билда показывает максимум три стака и 200% базового урона', () => {
  const stats = burnStats(CONFIG, { damage: 1, rate: 1 }, 100);
  assert.equal(CONFIG.burn.maxStacks, 3);
  assert.equal(CONFIG.burn.stackBonus, 0.5);
  assert.equal(stats.tick, 25);
  assert.equal(stats.maxTick, 50);
});
