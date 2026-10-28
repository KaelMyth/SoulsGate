// Запуск: node --experimental-default-type=module --test tests/absorption.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../config_game.js';
import { BuildGrid } from '../build_grid.js';
import { canPlace } from '../build_rules.js';
import { Absorption } from '../systems_absorption.js';

function setup() {
  const build = new BuildGrid(7);
  build.placeCore('shield', CONFIG.cores.shield, 3, 3);
  const hero = { x: 0, y: 0, active: true };
  const camera = { x: 0, y: 0, viewW: 480, viewH: 800 };
  const enemies = [];
  const hits = [];
  const absorption = new Absorption({
    config: CONFIG, hero, camera, enemies: { items: enemies },
    combat: { damageEnemy(e, dmg, source) {
      hits.push({ e, dmg, source });
      e.hp -= dmg;
      if (e.hp <= 0) e.active = false;
    } },
    modifiers: () => build.modifiersFor('shield'),
  });
  const equip = () => build.placeMod({ key: 'absorption', def: CONFIG.mods.absorption }, 3, 4);
  const advance = (seconds) => {
    for (let i = 0; i < Math.ceil(seconds * 60); i++) absorption.update(1 / 60);
  };
  return { build, hero, camera, enemies, hits, absorption, equip, advance };
}

const enemy = (x, y) => ({ x, y, radius: 12, hp: 1000, active: true });

test('Поглощение разрешено у щита и не остаётся сиротой', () => {
  const s = setup();
  assert.equal(canPlace(s.build, CONFIG.mods.absorption, 3, 4).ok, true);
  s.equip();
  assert.deepEqual(s.build.orphans(), []);
  assert.equal(s.build.modifiersFor('shield').absorption.count, 1);
  assert.equal(s.build.modifiersFor('projectile')?.absorption, undefined);
});

test('Поглощение выбирает самого дальнего видимого врага, бьёт каждые 3 секунды', () => {
  const s = setup(); s.equip();
  const near = enemy(70, 30);
  const mid = enemy(200, 0);
  const far = enemy(50, 300);
  const offscreen = enemy(600, 20);
  s.enemies.push(near, mid, far, offscreen);
  s.advance(2.2);
  assert.equal(s.absorption.target, far);
  assert.equal(s.hits.length, 0);
  s.advance(0.83);
  assert.equal(s.hits.length, 1);
  assert.equal(s.hits[0].e, far);
  assert.equal(s.hits[0].dmg, CONFIG.absorption.damage);
  assert.equal(s.hits[0].source.absorption, true);
  s.advance(3.01);
  assert.equal(s.hits.length, 2);
});

test('Если враг близко, Поглощение не бьёт; появившаяся цель получает предупреждение', () => {
  const s = setup(); s.equip();
  const e = enemy(50, 30); s.enemies.push(e);
  s.advance(5);
  assert.equal(s.hits.length, 0);
  e.x = 210;
  s.advance(0.1);
  assert.equal(s.absorption.target, e);
  assert.equal(s.hits.length, 0);
  s.advance(0.91);
  assert.equal(s.hits.length, 1);
});

test('Смерть цели, выход из кадра и снятие мода отменяют удар', () => {
  const s = setup(); s.equip();
  const e = enemy(205, 0); s.enemies.push(e);
  s.advance(2.2);
  e.active = false; s.advance(1);
  assert.equal(s.hits.length, 0);
  e.active = true; s.advance(0.1);
  e.x = 900; s.advance(1);
  assert.equal(s.hits.length, 0);
  e.x = 205; s.advance(0.1);
  s.build.takeMod(3, 4);
  s.advance(1);
  assert.equal(s.hits.length, 0);
  assert.equal(s.absorption.active, false);
  assert.equal(s.absorption.target, null);
});

test('Новый забег обнуляет заряд и вспышку', () => {
  const s = setup(); s.equip();
  const e = enemy(220, 0); s.enemies.push(e);
  s.advance(3.05);
  assert.equal(s.hits.length, 1);
  s.absorption.reset();
  assert.equal(s.absorption.flash, 0);
  assert.equal(s.absorption.target, null);
  s.advance(1);
  assert.equal(s.hits.length, 1);
});
