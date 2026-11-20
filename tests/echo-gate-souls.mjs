import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSoulTally } from '../echo-gate/src/soul_rewards.js';
import { Inventory } from '../echo-gate/src/inventory.js';
import { captureDeathLoot, bankLostLoot } from '../echo-gate/src/death_rewards.js';

test('all nine pickups multiply consecutively; tiers are blue, gold, red in order', () => {
  const mods = { soul10: 5, soul50: 3, soul100: 1 };
  const out = computeSoulTally(100, mods);
  assert.equal(out.stages.length, 10);
  assert.deepEqual(out.stages.slice(1).map(s => s.tier),
    [...Array(5).fill('blue'), ...Array(3).fill('gold'), 'red']);
  assert.equal(out.total, Math.round(100 * 1.1 ** 5 * 1.5 ** 3 * 2));
  assert.equal(out.stages[0].from, 0);
  assert.equal(out.stages[0].to, 100);
  assert.equal(out.stages.at(-1).to, out.total);
  assert.ok(out.stages.every((s, i) => i === 0 || s.from === out.stages[i - 1].to));
});

test('counts above rarity limits cannot increase the payout', () => {
  assert.deepEqual(computeSoulTally(100, { soul10: 999, soul50: 999, soul100: 999 }).counts,
    { soul10: 5, soul50: 3, soul100: 1 });
  assert.equal(computeSoulTally(0, { soul100: 1 }).total, 0);
  assert.equal(computeSoulTally(0, { soul100: 1 }).multiplier, 2);
  assert.equal(computeSoulTally(100, {}).total, 100);
  assert.equal(computeSoulTally(5, { soul10: 1 }).total, 6);
});

test('souls bank migrates old spirit plus gold once without duplication', () => {
  const prior = globalThis.localStorage;
  const values = new Map([['echo-gate-banked-v1', JSON.stringify({ spirit: 82, coins: 18 })]]);
  globalThis.localStorage = {
    getItem: k => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, v),
  };
  try {
    const original = new Inventory({ limit: 10 });
    assert.equal(original.souls, 100);
    original.addSouls(25);
    assert.equal(new Inventory({ limit: 10 }).souls, 125);
    const newFormat = JSON.parse(values.get('echo-gate-souls-v1'));
    assert.deepEqual(newFormat, { souls: 125 });
    // Changes to obsolete storage must not be imported twice.
    values.set('echo-gate-banked-v1', JSON.stringify({ spirit: 10000, coins: 10000 }));
    assert.equal(new Inventory({ limit: 10 }).souls, 125);
  } finally {
    if (prior === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = prior;
  }
});

test('rewarded recovery banks multiplied souls and restores five distinct gems', () => {
  const inventory = new Inventory({ limit: 10 });
  const lost = captureDeathLoot({ souls: 100 }, {}, { soul50: 2, soul100: 1 });
  assert.equal(inventory.souls, 0);
  assert.equal(bankLostLoot(inventory, lost), true);
  assert.equal(inventory.souls, 450);
  assert.equal(inventory.gemCount(), 5);
  assert.equal(new Set(inventory.slots.filter(Boolean).map(i => i.id)).size, 5);
});

test('no partial payout when inventory lacks room for mock recovered gems', () => {
  const inventory = new Inventory({ limit: 4 });
  const lost = captureDeathLoot({ souls: 100 }, {}, { soul100: 1 });
  assert.equal(bankLostLoot(inventory, lost), false);
  assert.equal(inventory.souls, 0);
  assert.equal(inventory.gemCount(), 0);
});
