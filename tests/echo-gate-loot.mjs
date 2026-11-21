// Таблица добычи с жука: опыт всегда, кристаллы и страницы по шансам 1/40, 1/80, 1/60.
import test from 'node:test';
import assert from 'node:assert/strict';
import { rollDrops } from '../echo-gate/src/drops.js';
import { CONFIG } from '../echo-gate/src/config.js';

test('chances in config are 1/40, 1/80, 1/60', () => {
  assert.equal(CONFIG.loot.power.chance, 1 / 40);
  assert.equal(CONFIG.loot.skill.chance, 1 / 80);
  assert.equal(CONFIG.loot.page.chance, 1 / 60);
});

test('xp always drops; rare drops follow rng thresholds', () => {
  assert.deepEqual(rollDrops(CONFIG.loot, () => 0.999), ['xp']);
  assert.deepEqual(rollDrops(CONFIG.loot, () => 0), ['xp', 'power', 'skill', 'page']);
  const seq = [0.02, 0.5, 0.5]; // только усиление (0.02 < 0.025)
  let i = 0;
  assert.deepEqual(rollDrops(CONFIG.loot, () => seq[i++]), ['xp', 'power']);
});

test('statistics over many kills are close to the chances', () => {
  const N = 200000;
  const c = { power: 0, skill: 0, page: 0 };
  let seed = 12345;
  const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let k = 0; k < N; k++) for (const t of rollDrops(CONFIG.loot, rng)) if (t !== 'xp') c[t]++;
  assert.ok(Math.abs(c.power / N - 1 / 40) < 0.003);
  assert.ok(Math.abs(c.skill / N - 1 / 80) < 0.003);
  assert.ok(Math.abs(c.page / N - 1 / 60) < 0.003);
});
