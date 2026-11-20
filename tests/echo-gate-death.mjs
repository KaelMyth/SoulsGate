import test from 'node:test';
import assert from 'node:assert/strict';
import { captureDeathLoot, bankLostLoot } from '../echo-gate/src/death_rewards.js';
import { Inventory } from '../echo-gate/src/inventory.js';

function inv(limit = 20) {
  const v = new Inventory({ limit });
  // Blank mock inventory, the base game normally supplies its own gear.
  return v;
}

test('death escrow displays five distinct Pearl Sharpening Gems and actual currency totals', () => {
  const lost = captureDeathLoot({ souls: 22 }, { power: 2, skill: 1, page: 4 }, { soul10: 2 });
  assert.equal(lost.gems.length, 5);
  assert.equal(new Set(lost.gems.map(g => g.id)).size, 5);
  assert.equal(lost.gems.every(g => g.kind === 'gem'), true);
  assert.equal(lost.souls, 22);
  assert.equal(lost.soulMods.soul10, 2);
  assert.deepEqual(lost.collected, { power: 2, skill: 1, page: 4 });
});

test('home loses escrow; rewarded recovery banks all five distinct gems once', () => {
  const store = inv(10);
  const lost = captureDeathLoot({ souls: 16 });
  assert.equal(store.gemCount(), 0); // no grant until reward confirmed
  assert.equal(store.souls, 0);
  assert.equal(bankLostLoot(store, lost), true);
  assert.equal(store.gemCount(), 5);
  assert.equal(store.souls, 16);
  assert.equal(new Set(store.slots.filter(Boolean).map(i => i.id)).size, 5);
});

test('recovery is blocked atomically if fewer than five empty slots exist', () => {
  const store = inv(4);
  const lost = captureDeathLoot({ souls: 16 });
  assert.equal(bankLostLoot(store, lost), false);
  assert.equal(store.gemCount(), 0);
  assert.equal(store.souls, 0);
});
