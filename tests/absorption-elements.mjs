// Запуск: node --experimental-default-type=module --test tests/absorption-elements.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../config_game.js';
import { BuildGrid } from '../build_grid.js';
import { canPlace } from '../build_rules.js';
import { Absorption } from '../systems_absorption.js';
import { Game } from '../game.js';

function enemy(x = 150, y = 0) {
  return {
    x, y, radius: 12, active: true, hp: 5000, maxHp: 5000,
    def: { immuneFrost: false }, burnT: 0, burnStacks: 0,
    burnDmg: 0, burnInt: 0.5, burnTick: 0, frostStacks: 0,
    frostT: 0, freezeT: 0, speedMul: 1, kbVx: 0, kbVy: 0,
    shockStacks: 0, shockT: 0,
  };
}

function setup(keys = []) {
  const build = new BuildGrid(7);
  build.placeCore('shield', CONFIG.cores.shield, 3, 3);
  build.placeMod({ key: 'absorption', def: CONFIG.mods.absorption }, 3, 4);
  const slots = { burn: [2, 4], frost: [4, 4], lightning: [3, 5] };
  for (const key of keys) {
    const [x, y] = slots[key];
    assert.equal(canPlace(build, CONFIG.mods[key], x, y).ok, true, key + ' не подключается к Поглощению');
    build.placeMod({ key, def: CONFIG.mods[key] }, x, y);
  }
  assert.deepEqual(build.orphans(), []);
  const hero = { x: 0, y: 0, active: true, hp: 50, maxHp: 100 };
  const enemies = [enemy()];
  const hits = [];
  const discharges = [];
  const clouds = [];
  const calls = { burn: 0, frost: 0, lightning: 0 };
  // Настоящие методы Game с минимальным окружением для теста без Canvas/DOM.
  const game = Object.create(Game.prototype);
  game.config = CONFIG;
  game.burst = () => {};
  game.steamBurst = (x, y, dmg, interval) => clouds.push({ x, y, dmg, interval });
  game.discharge = (e, bd, bi, fr, st, cm) => discharges.push({ e, bd, bi, fr, st, cm });
  const absorption = new Absorption({
    config: CONFIG, hero, enemies: { items: enemies },
    camera: { x: 0, y: 0, viewW: 480, viewH: 800 },
    combat: { damageEnemy(e, dmg) {
      hits.push({ e, dmg });
      e.hp -= dmg;
      if (e.hp <= 0) e.active = false;
      return true;
    } },
    modifiers: () => build.modifiersFor('shield'),
    ignite: (e, d, i) => { calls.burn++; game.ignite(e, d, i); },
    chill: (e, st, d, i) => { calls.frost++; game.chill(e, st, d, i); },
    zap: (e, d, i, fr, st, cm) => { calls.lightning++; game.zap(e, d, i, fr, st, cm); },
  });
  const advance = (seconds) => {
    for (let i = 0; i < Math.ceil(seconds * 60); i++) absorption.update(1 / 60);
  };
  return { build, hero, enemies, hits, calls, discharges, clouds, absorption, advance };
}

test('Поглощение + Горение: сразу три стака и увеличенный урон тика', () => {
  const s = setup(['burn']);
  s.advance(3.05);
  assert.equal(s.hits.length, 1);
  assert.equal(s.calls.burn, CONFIG.burn.maxStacks);
  assert.equal(s.enemies[0].burnStacks, 3);
  assert.equal(s.enemies[0].burnT, CONFIG.burn.duration);
  assert.ok(s.enemies[0].burnDmg > 0);
  assert.equal(s.absorption.color, '172,84,136');
  assert.equal(s.absorption.flashes[0].color, '172,84,136');
});

test('Поглощение + Мороз: сразу пять стаков запускают заморозку', () => {
  const s = setup(['frost']);
  s.advance(3.05);
  assert.equal(s.calls.frost, CONFIG.frost.maxStacks);
  assert.equal(s.enemies[0].freezeT, CONFIG.frost.freezeTime);
  assert.equal(s.enemies[0].speedMul, 0);
  assert.equal(s.absorption.color, '172,84,136');
});

test('Поглощение + Молния: максимум стаков запускает один разряд', () => {
  const s = setup(['lightning']);
  s.advance(3.05);
  assert.equal(s.calls.lightning, CONFIG.shock.maxStacks);
  assert.equal(s.discharges.length, 1);
  assert.equal(s.enemies[0].shockStacks, 0);
  assert.equal(s.absorption.color, '172,84,136');
});

test('Существующие стаки добираются до максимума без лишней Молнии', () => {
  const s = setup(['lightning']);
  s.enemies[0].shockStacks = 2; s.enemies[0].shockT = 2;
  s.advance(3.05);
  assert.equal(s.calls.lightning, 2);
  assert.equal(s.discharges.length, 1);
  assert.equal(s.enemies[0].shockStacks, 0);
});

test('Существующие стаки Мороза добираются до заморозки, без лишних накладываний', () => {
  const s = setup(['frost']);
  s.enemies[0].frostStacks = 3; s.enemies[0].frostT = 1;
  s.advance(3.05);
  assert.equal(s.calls.frost, 2);
  assert.equal(s.enemies[0].freezeT, CONFIG.frost.freezeTime);
});

test('Поглощение + Горение + Мороз запускает Пар и окрашивается в светлый цвет', () => {
  const s = setup(['burn', 'frost']);
  s.advance(3.05);
  assert.equal(s.enemies[0].burnStacks, 3);
  assert.equal(s.clouds.length, 1);
  assert.equal(s.enemies[0].freezeT, 0);
  assert.equal(s.absorption.color, '172,84,136');
});

test('Все три стихии: 3/5/4 стака, Пар и Молния, белая вспышка', () => {
  const s = setup(['burn', 'frost', 'lightning']);
  s.advance(3.05);
  assert.equal(s.calls.burn, 3);
  assert.equal(s.calls.frost, 5);
  assert.equal(s.calls.lightning, 4);
  assert.equal(s.clouds.length, 1);
  assert.equal(s.discharges.length, 1);
  assert.equal(s.absorption.color, '172,84,136');
});

test('Х2: стихии полностью накладываются на каждую из двух целей', () => {
  const s = setup(['burn', 'frost']);
  // Заменим набор стихий для отдельного теста: Х2 на свободной клетке ветви Поглощения.
  const b = setup();
  b.build.placeMod({ key: 'x2', def: CONFIG.mods.x2 }, 3, 5);
  b.build.placeMod({ key: 'burn', def: CONFIG.mods.burn }, 2, 4);
  b.build.placeMod({ key: 'frost', def: CONFIG.mods.frost }, 4, 4);
  b.enemies.push(enemy(100, 0));
  assert.deepEqual(b.build.orphans(), []);
  assert.equal(b.build.modifiersFor('shield').absorption.targets, 2);
  b.advance(3.05);
  assert.equal(b.hits.length, 2);
  assert.deepEqual(b.enemies.map(e => e.burnStacks), [3, 3]);
  assert.equal(b.clouds.length, 2);
  assert.equal(s.build.modifiersFor('shield').absorption.targets, 1);
});

test('Х2 на Молнии усиливает её цепь, а не количество целей Поглощения', () => {
  const s = setup(['lightning']);
  s.build.placeMod({ key: 'x2', def: CONFIG.mods.x2 }, 3, 6);
  assert.deepEqual(s.build.orphans(), []);
  const mods = s.build.modifiersFor('shield');
  assert.equal(mods.absorption.targets, 1);
  assert.equal(mods.lightning.mult, 2);
  s.advance(3.05);
  assert.equal(s.discharges[0].cm, 2);
});

test('Мощь на Горении не должна увеличивать прямой урон Поглощения', () => {
  const s = setup(['burn']);
  s.build.placeMod({ key: 'power', def: CONFIG.mods.power }, 1, 4);
  assert.deepEqual(s.build.orphans(), []);
  const mods = s.build.modifiersFor('shield');
  assert.equal(mods.absorption.damage, 1);
  assert.ok(mods.burn.damage > 1);
});

test('Без стихий прежняя графика и отсутствие стаков сохраняются', () => {
  const s = setup();
  s.advance(3.05);
  assert.equal(s.calls.burn + s.calls.frost + s.calls.lightning, 0);
  assert.equal(s.absorption.color, '172,84,136');
});

test('Вампиризм сохраняет красный цвет поверх огня', () => {
  const s = setup(['burn']);
  s.build.placeMod({ key: 'vamp', def: CONFIG.mods.vamp }, 3, 5);
  s.advance(3.05);
  assert.equal(s.absorption.color, '197,73,110');
  assert.equal(s.absorption.flashes[0].color, '197,73,110');
  assert.equal(s.hero.hp, 59);
});

test('Отменённый удар и мгновенное убийство не накладывают стихии', () => {
  const s = setup(['burn', 'frost', 'lightning']);
  s.absorption.combat.damageEnemy = () => false;
  s.advance(3.05);
  assert.equal(s.calls.burn + s.calls.frost + s.calls.lightning, 0);
  s.enemies[0].hp = 1;
  s.absorption.combat.damageEnemy = (e) => { e.hp = -89; e.active = false; return true; };
  s.advance(3.05);
  assert.equal(s.calls.burn + s.calls.frost + s.calls.lightning, 0);
});

test('Горение → Мороз внутри ветки Поглощения тоже вызывает Пар', () => {
  const s = setup(['burn']);
  assert.equal(canPlace(s.build, CONFIG.mods.frost, 1, 4).ok, true);
  s.build.placeMod({ key: 'frost', def: CONFIG.mods.frost }, 1, 4);
  assert.deepEqual(s.build.orphans(), []);
  const m = s.build.modifiersFor('shield');
  assert.equal(m.absorption.burn, true);
  assert.equal(m.absorption.frost, true);
  assert.ok(m.steam);
  s.advance(3.05);
  assert.equal(s.clouds.length, 1);
});

test('Мороз → Горение внутри ветки Поглощения тоже вызывает Пар', () => {
  const s = setup(['frost']);
  assert.equal(canPlace(s.build, CONFIG.mods.burn, 5, 4).ok, true);
  s.build.placeMod({ key: 'burn', def: CONFIG.mods.burn }, 5, 4);
  assert.deepEqual(s.build.orphans(), []);
  const m = s.build.modifiersFor('shield');
  assert.equal(m.absorption.burn, true);
  assert.equal(m.absorption.frost, true);
  assert.ok(m.steam);
  s.advance(3.05);
  assert.equal(s.clouds.length, 1);
});

test('Горение с 2 стаками добирает только последний, а не накладывается трижды', () => {
  const s = setup(['burn']);
  const e = s.enemies[0];
  e.burnT = 2; e.burnStacks = 2; e.burnDmg = 5; e.burnTick = 0.5;
  s.advance(3.05);
  assert.equal(s.calls.burn, 1);
  assert.equal(e.burnStacks, 3);
  assert.ok(e.burnDmg > 5);
});

test('Цвет Молнии с Огнём — оранжевый, с Морозом — ледяной', () => {
  const fire = setup(['burn', 'lightning']);
  const ice = setup(['frost', 'lightning']);
  fire.advance(3.05); ice.advance(3.05);
  assert.equal(fire.absorption.color, '172,84,136');
  assert.equal(ice.absorption.color, '172,84,136');
  assert.equal(fire.discharges.length, 1);
  assert.equal(ice.discharges.length, 1);
});

test('Ускорение и Мощь на Поглощении сохраняются вместе со стихией и не усиливают её ветки повторно', () => {
  const s = setup(['burn']);
  s.build.placeMod({ key: 'power', def: CONFIG.mods.power }, 3, 5);
  s.build.placeMod({ key: 'haste', def: CONFIG.mods.haste }, 1, 4);
  // Ускорение на самом Горении усиливает его тики, но не скорость каста Поглощения.
  assert.deepEqual(s.build.orphans(), []);
  const m = s.build.modifiersFor('shield');
  assert.ok(Math.abs(m.absorption.damage - 1.1) < 1e-8);
  assert.equal(m.absorption.rate, 1);
  assert.ok(m.burn.rate > 1);
  s.advance(3.05);
  assert.ok(Math.abs(s.hits[0].dmg - CONFIG.absorption.damage * 1.1) < 1e-8);
});
