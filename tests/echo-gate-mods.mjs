// Модификаторы снаряда: ячейки, рост дерева, множители, веса рулетки.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../echo-gate/src/config.js';
import { ModLoadout, pickMod, MOD_IDS } from '../echo-gate/src/mods.js';

const mk = () => new ModLoadout(CONFIG.mods);

test('старт: две пустые корневые ячейки (две ветки), эффекты нейтральны', () => {
  const m = mk();
  assert.equal(m.cells.length, 2);
  assert.deepEqual(m.effects(), { damage: 1, rate: 1, pierce: 0, shots: 1 });
});
test('обычные модификаторы: Мощь +20% урона, Прыткость +20% скорости, Пробитие 1', () => {
  const m = mk(); m.equip(0, 'might'); m.equip(1, 'swift'); m.equip(m.cells.findIndex((c) => c.parent === 0), 'pierce');
  const e = m.effects();
  assert.ok(Math.abs(e.damage - 1.2) < 1e-9 && Math.abs(e.rate - 1.2) < 1e-9 && e.pierce === 1);
});
test('после повешивания от ячейки отходят две новые, в ветке не больше восьми', () => {
  const m = mk();
  assert.deepEqual(m.equip(0, 'might'), [2, 3]);
  assert.equal(m.equip(0, 'swift').length, 0); // замена не растит ячейки
  assert.equal(m.cells.length, 4);
  // растим левую ветку до предела
  let guard = 0;
  while (m.branchSize(0) < 8 && guard++ < 50) {
    const empty = m.cells.findIndex((c) => c.branch === 0 && !c.mod);
    m.equip(empty, 'might');
  }
  assert.equal(m.branchSize(0), 8);
  assert.equal(m.branchSize(1), 1, 'вторая ветка не затронута');
  const empty = m.cells.findIndex((c) => c.branch === 0 && !c.mod);
  if (empty >= 0) m.equip(empty, 'might');
  assert.equal(m.branchSize(0), 8, 'потолок ветки');
  // вторая ветка растёт независимо
  assert.equal(m.equip(1, 'might').length, 2);
  assert.equal(m.branchSize(1), 3);
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
  assert.equal(m.cells.length, 2); assert.equal(m.effects().shots, 1);
});
test('рулетка: веса соблюдаются', () => {
  let s = 7; const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const n = {}; for (const id of MOD_IDS) n[id] = 0;
  for (let i = 0; i < 20000; i++) n[pickMod(rnd, CONFIG.mods)]++;
  assert.ok(n.might > n.pierce && n.pierce > n.epic && n.epic > n.legendary);
  assert.ok(Math.abs(n.legendary / 20000 - 0.08) < 0.01);
});

test('remove: убирает мод и всё, что выросло от него; индексы остаются согласованными', () => {
  const m = mk();
  m.equip(0, 'might');
  const c = m.cells.findIndex((x) => x.parent === 0);
  m.equip(c, 'swift');
  m.equip(1, 'pierce');
  assert.equal(m.remove(0), true);
  assert.equal(m.cells[0].mod, null);
  assert.ok(!m.cells.some((x) => x.parent === 0), 'ответвления ушли');
  assert.equal(m.cells.filter((x) => x.branch === 0).length, 1);
  const p = m.cells.findIndex((x) => x.mod === 'pierce');
  assert.ok(m.cells.filter((x) => x.parent === p).length === 2, 'вторая ветка цела');
  assert.equal(m.remove(0), false, 'пустую ячейку не убрать');
  assert.equal(m.equip(0, 'might').length, 2, 'после удаления ячейка снова растёт');
});
