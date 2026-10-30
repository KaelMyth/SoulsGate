// Регрессия: меню не должно одновременно показывать старый BUILD и новый RELEASE.
// node --test tests/release-159-single-version.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BUILD } from '../config_game.js';
import { RELEASE } from '../release_notes.js';

test('Сборка наследует только актуальный номер и название релиза', () => {
  assert.equal(BUILD, 'Обновление №' + RELEASE.number + ' — ' + RELEASE.title);
});

test('Отладочное меню показывает название релиза единожды', () => {
  const source = readFileSync(new URL('../debug_panel.js', import.meta.url), 'utf8');
  assert.match(source, /h\('h3', \{\}, 'Отладка'\)/);
  assert.equal((source.match(/class: 'dbg-release'/g) || []).length, 1);
  const refresh = source.split('refreshStats() {')[1];
  assert.ok(refresh, 'метод статистики существует');
  assert.doesNotMatch(refresh, /RELEASE\.title/);
});
