import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../echo-gate/src/config.js';
import { Stats } from '../echo-gate/src/stats.js';
import { Block } from '../echo-gate/src/block.js';
import { UPGRADES, chances, pickChoices, applyUpgrade } from '../echo-gate/src/upgrades.js';

const clone = () => structuredClone(CONFIG);

test('eight upgrades with soul bonuses in ascending rarity', () => {
  assert.equal(UPGRADES.length, 8);
  const c = chances(CONFIG);
  assert.ok(Math.abs(Object.values(c).reduce((a, b) => a + b, 0) - 100) < 1e-9);
  assert.ok(c.soul10 > c.soul50 && c.soul50 > c.soul100);
  for (const u of UPGRADES) assert.ok(CONFIG.upgrades[u.id], u.id);
});

test('pickChoices gives distinct entries and respects weights', () => {
  const cfg = clone();
  for (let i = 0; i < 200; i++) {
    const [a, b] = pickChoices(cfg, 2);
    assert.notEqual(a.id, b.id);
  }
  for (const u of UPGRADES) cfg.upgrades[u.id].weight = 0;
  cfg.upgrades.xp.weight = 1;
  assert.deepEqual(pickChoices(cfg, 2).map((u) => u.id), ['xp']);
  cfg.upgrades.hp.weight = 3;
  let hp = 0, xp = 0;
  let s = 7; const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
  for (let i = 0; i < 2000; i++) { const id = pickChoices(cfg, 1, rnd)[0].id; if (id === 'hp') hp++; else xp++; }
  assert.ok(hp > xp * 2 && hp < xp * 4, `${hp}/${xp}`);
});

test('upgrades apply to stats', () => {
  const cfg = clone();
  const st = new Stats(cfg);
  applyUpgrade(cfg, st, 'hp'); st.syncMax();
  assert.equal(st.maxHp, 105);
  assert.equal(st.hp, 105);
  applyUpgrade(cfg, st, 'hp'); st.syncMax();
  assert.equal(st.maxHp, 110);
  applyUpgrade(cfg, st, 'xp');
  st.addXp(10);
  assert.ok(Math.abs(st.xp - 11) < 1e-9 || st.level > 1);
  applyUpgrade(cfg, st, 'speed'); applyUpgrade(cfg, st, 'pickup'); applyUpgrade(cfg, st, 'blockTime');
  assert.deepEqual([st.bonus.speed, st.bonus.pickup, st.bonus.block].map((v) => +v.toFixed(2)), [0.05, 0.1, 0.1]);
  st.reset();
  assert.equal(st.bonus.hp, 0);
  assert.equal(st.maxHp, 100);
});

test('block: starts after delay, parries, reduces, cooldowns', () => {
  const b = new Block(CONFIG.block);
  b.update(0.05, false); assert.equal(b.active, false);
  b.update(0.06, false); assert.equal(b.active, true);
  assert.equal(b.filter(10), 0); // парирование
  b.update(0.3, false);
  assert.equal(b.parrying, false);
  assert.ok(Math.abs(b.filter(10) - 9) < 1e-9); // сила 10: гасит 10%
  b.update(1.3, false); // всего 1.7 > 1.5
  assert.equal(b.active, false);
  assert.equal(b.cd, 2);
  b.update(2.1, false); assert.equal(b.active, false); // один блок за остановку
  b.update(0.1, true); b.update(0.2, false); assert.equal(b.active, true);
  b.update(0.5, true); assert.equal(b.active, true); // движение блок не снимает
  b.update(1.1, true); assert.equal(b.active, false);
  assert.equal(b.cd, 2);
  b.update(1, true);
  assert.ok(Math.abs(b.ready - 0.5) < 1e-9);
});

test('block duration upgrade lengthens block', () => {
  const b = new Block(CONFIG.block);
  b.durMult = 1.2;
  assert.ok(Math.abs(b.duration - 1.8) < 1e-9);
});

test('soul bonus caps: 5 ×1.1, 3 ×1.5, 1 ×2', () => {
  const cfg = clone();
  const stats = new Stats(cfg);
  for (const [id, limit] of Object.entries({ soul10: 5, soul50: 3, soul100: 1 })) {
    assert.equal(UPGRADES.find(x => x.id === id).maxPicks, limit);
    for (let i = 0; i < limit; i++) assert.equal(applyUpgrade(cfg, stats, id), true);
    assert.equal(stats.soulMods[id], limit);
    assert.equal(applyUpgrade(cfg, stats, id), false);
    for (let i = 0; i < 20; i++) assert.ok(!pickChoices(cfg, 8, Math.random, stats).some(u => u.id === id));
  }
  stats.reset();
  assert.deepEqual(stats.soulMods, { soul10: 0, soul50: 0, soul100: 0 });
});

test('имя игрока: чистка и ограничение длины', async () => {
  const { cleanName, NAME_MAX } = await import('../echo-gate/src/name_prompt.js');
  assert.equal(cleanName('   Dark   Lord  '), 'Dark Lord');
  assert.equal(cleanName('   '), '');
  assert.equal(cleanName('x'.repeat(40)).length, NAME_MAX);
});
