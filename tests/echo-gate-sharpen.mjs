// Заточка: шансы, цены, прибавки, поломка, выкуп.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../echo-gate/src/config.js';
import { Inventory } from '../echo-gate/src/inventory.js';
import { fireStaff, pearlGem } from '../echo-gate/src/items.js';
import { sharpenInfo, attemptSharpen, sharpenedStats, bonusAt } from '../echo-gate/src/sharpen.js';

const mk = (gems = 20) => { const inv = new Inventory({ limit: 100 }); for (let i = 0; i < gems; i++) inv.add(pearlGem()); return inv; };

test('шанс: 100% на первую, потом минус 10% до 10%', () => {
  const ch = []; for (let l = 0; l < 10; l++) ch.push(Math.round(sharpenInfo(CONFIG, l).chance * 100));
  assert.deepEqual(ch, [100, 90, 80, 70, 60, 50, 40, 30, 20, 10]);
  assert.equal(sharpenInfo(CONFIG, 10).maxed, true);
});
test('цена растёт с уровнем', () => {
  assert.deepEqual([0, 1, 4, 9].map((l) => sharpenInfo(CONFIG, l).cost), [1, 2, 5, 10]);
});
test('прибавка и числа посоха', () => {
  assert.equal(bonusAt(CONFIG, 0), 0); assert.equal(bonusAt(CONFIG, 1), 5); assert.equal(bonusAt(CONFIG, 4), 8);
  const s = sharpenedStats(CONFIG, 1);
  assert.ok(Math.abs(s.damage - 1.05) < 1e-9 && Math.abs(s.range - 9.45) < 1e-9 && Math.abs(s.rate - 2.1) < 1e-9);
});
test('удача: +1, камни списаны', () => {
  const inv = mk(); const st = fireStaff(); inv.add(st);
  const r = attemptSharpen(CONFIG, inv, st, () => 0);
  assert.equal(r.ok, true); assert.equal(st.sharpen, 1); assert.equal(inv.gemCount(), 19);
});
test('провал: посох в сломанных, камни списаны, экипировка очищена', () => {
  const inv = mk(); const st = fireStaff(); inv.add(st); inv.equipFrom(inv.slots.indexOf(st));
  st.sharpen = 3;
  const r = attemptSharpen(CONFIG, inv, st, () => 0.99);
  assert.equal(r.broken, true); assert.equal(inv.broken[0], st); assert.equal(inv.equipped.staff, null); assert.equal(inv.gemCount(), 16);
  assert.equal(st.sharpen, 3);
});
test('не хватает камней: ничего не меняется', () => {
  const inv = mk(1); const st = fireStaff(); st.sharpen = 2; inv.add(st);
  const r = attemptSharpen(CONFIG, inv, st, () => 0);
  assert.equal(r.reason, 'gems'); assert.equal(st.sharpen, 2); assert.equal(inv.gemCount(), 1);
});
test('выкуп за золото и за рекламу', () => {
  const inv = mk(0); const st = fireStaff(); inv.add(st); inv.breakItem(st);
  assert.equal(inv.repairBroken(0, 'gold', 100), false);
  inv.coins = 150;
  assert.equal(inv.repairBroken(0, 'gold', 100), true); assert.equal(inv.coins, 50); assert.ok(inv.slots.includes(st));
  inv.breakItem(st); assert.equal(inv.repairBroken(0, 'ad', 100), true); assert.equal(inv.coins, 50);
});
