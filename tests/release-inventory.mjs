// Запуск: node --experimental-default-type=module --test tests/release-inventory.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, BUILD } from '../config_game.js';
import { RELEASE } from '../release_notes.js';
import { Game } from '../game.js';
import { Storage } from '../build_storage.js';
import { BuildGrid } from '../build_grid.js';

function setup(mode = 'test') {
  const g = Object.create(Game.prototype);
  g.mode = mode;
  g.config = CONFIG;
  g.rnd = () => 0.41;
  g.build = new BuildGrid(CONFIG.build.size);
  g.inventory = new Storage(CONFIG.build.storageSlots);
  return g;
}

test('В Тестировании стартовый инвентарь пустой, но ячейки остаются', () => {
  const g = setup('test');
  g.layoutBuild();
  assert.equal(g.inventory.size, CONFIG.build.storageSlots);
  assert.ok(g.inventory.slots.every(item => item === null));
  assert.deepEqual(CONFIG.build.startMods, []);
});

test('Новый тестовый забег удаляет предметы прошлого забега', () => {
  const g = setup('test');
  g.layoutBuild();
  const index = g.inventory.add({ key: 'gravity', def: CONFIG.mods.gravity });
  assert.ok(index >= 0);
  g.layoutBuild();
  assert.ok(g.inventory.slots.every(item => item === null));
});

test('Обычная Игра тоже стартует с пустым инвентарём', () => {
  const g = setup('game');
  g.layoutBuild();
  assert.ok(g.inventory.slots.every(item => item === null));
});

test('Номер и название обновления заданы, версия настроек Оракула не сброшена', () => {
  // Номер и название обновления меняются каждый релиз: проверяем форму, а не конкретное число.
  assert.ok(Number.isInteger(RELEASE.number) && RELEASE.number >= 124);
  assert.ok(typeof RELEASE.title === 'string' && RELEASE.title.length > 0);
  assert.ok(BUILD.includes('№' + RELEASE.number) || BUILD.includes(String(RELEASE.number)));
  assert.ok(Number.isInteger(CONFIG.version) && CONFIG.version >= 14); // версия растёт при смене стартовых ползунков
});
