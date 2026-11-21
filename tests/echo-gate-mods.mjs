// Модификаторы снаряда: ячейки, рост дерева, множители, веса рулетки.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../echo-gate/src/config.js';
import { ModLoadout, pickMod, MOD_IDS } from '../echo-gate/src/mods.js';

const mk = () => new ModLoadout(CONFIG.mods);

test('старт: три пустые корневые ячейки, эффекты нейтральны', () => {
  const m = mk();
  assert.equal(m.cells.length, 3);
  assert.deepEqual(m.effects(), { damage: 1, rate: 1, pierce: 0, shots: 1 });
});
test('обычные модификаторы: Мощь +20% урона, Прыткость +20% скорости, Пробитие 1', () => {
  const m = mk(); m.equip(0, 'might'); m.equip(1, 'swift'); m.equip(2, 'pierce');
  const e = m.effects();
  assert.ok(Math.abs(e.damage - 1.2) < 1e-9 && Math.abs(e.rate - 1.2) < 1e-9 && e.pierce === 1);
});
test('после повешивания над ячейкой вырастает новая, всего не больше пяти', () => {
  const m = mk();
  assert.equal(m.equip(0, 'might'), 3);
  assert.equal(m.equip(1, 'might'), 4);
  assert.equal(m.equip(2, 'might'), -1);
  assert.equal(m.cells.length, 5);
  assert.equal(m.equip(0, 'swift'), -1); // замена не растит ячейки
  assert.equal(m.cells.length, 5);
});
test('Эпический и Легендарный на самом посохе умножают число снарядов', () => {
  const m = mk(); m.equip(0, 'epic');
  assert.equal(m.effects().shots, 2);
  m.equip(1, 'legendary');
  assert.equal(m.effects().shots, 6);
});
test('множитель в верхней ячейке усиливает модификатор, от которого отходит', () => {
  const m = mk(); m.equip(0, 'might');
  const child = m.cells.findIndex((c) => c.parent === 0);
  m.equip(child, 'epic');
  const e = m.effects();
  assert.ok(Math.abs(e.damage - 1.4) < 1e-9, 'Мощь ×2 = +40%');
  assert.equal(e.shots, 1);
  m.equip(child, 'legendary');
  assert.ok(Math.abs(m.effects().damage - 1.6) < 1e-9, 'Мощь ×3 = +60%');
  const m2 = mk(); m2.equip(0, 'pierce'); m2.equip(m2.cells.findIndex((c) => c.parent === 0), 'epic');
  assert.equal(m2.effects().pierce, 2);
});
test('reset очищает ячейки', () => {
  const m = mk(); m.equip(0, 'epic'); m.reset();
  assert.equal(m.cells.length, 3); assert.equal(m.effects().shots, 1);
});
test('рулетка: веса соблюдаются', () => {
  let s = 7; const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const n = {}; for (const id of MOD_IDS) n[id] = 0;
  for (let i = 0; i < 20000; i++) n[pickMod(rnd, CONFIG.mods)]++;
  assert.ok(n.might > n.pierce && n.pierce > n.epic && n.epic > n.legendary);
  assert.ok(Math.abs(n.legendary / 20000 - 0.08) < 0.01);
});
