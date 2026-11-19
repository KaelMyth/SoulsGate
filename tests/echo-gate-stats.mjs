import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../echo-gate/src/config.js';
import { Stats } from '../echo-gate/src/stats.js';

const fresh = () => new Stats(JSON.parse(JSON.stringify(CONFIG)));

test('старт: полное здоровье, 1 уровень, нет опыта', () => {
  const s = fresh();
  assert.equal(s.hp, s.maxHp);
  assert.equal(s.level, 1);
  assert.equal(s.xp, 0);
});

test('нужный опыт по формуле SoulsGate: 5, 8, 13 ...', () => {
  const s = fresh();
  assert.equal(s.xpNeed(1), 5);
  assert.equal(s.xpNeed(2), 8);
  assert.equal(s.xpNeed(3), 13);
});

test('опыт поднимает уровень, остаток переходит дальше, можно сразу несколько уровней', () => {
  const s = fresh();
  const seen = [];
  s.onLevel = (l) => seen.push(l);
  s.addXp(6);
  assert.equal(s.level, 2);
  assert.ok(Math.abs(s.xp - 1) < 1e-9);
  s.addXp(100);
  assert.ok(s.level >= 5 && seen.length === s.level - 1);
});

test('множитель опыта и убийство: kill даёт perKill × gainMult', () => {
  const s = fresh();
  s.cfg.xp.gainMult = 2;
  s.cfg.xp.perKill = 1;
  s.kill();
  assert.equal(s.kills, 1);
  assert.equal(s.xp, 2);
});

test('здоровье: урон не ниже 0, лечение не выше максимума', () => {
  const s = fresh();
  assert.equal(s.hurt(30), false);
  assert.equal(s.hp, s.maxHp - 30);
  assert.equal(s.hurt(1000), true);
  assert.equal(s.hp, 0);
  s.heal(1e6);
  assert.equal(s.hp, s.maxHp);
});

test('ползунок максимума: текущее здоровье меняется на ту же величину', () => {
  const s = fresh();
  s.hurt(40); // 60 из 100
  s.cfg.hero.maxHp = 150;
  s.update(0);
  assert.equal(s.maxHp, 150);
  assert.equal(s.hp, 110);
  s.cfg.hero.maxHp = 50;
  s.update(0);
  assert.equal(s.hp, 10); // 110 − 100
  s.cfg.hero.maxHp = 5;
  s.update(0);
  assert.equal(s.hp, 1, 'не ниже 1 и не выше нового максимума');
});

test('лечение со временем и сброс', () => {
  const s = fresh();
  s.hurt(50);
  s.cfg.hero.regen = 10;
  s.update(1);
  assert.equal(s.hp, 60);
  s.addXp(6);
  s.reset();
  assert.equal(s.hp, s.maxHp);
  assert.equal(s.level, 1);
  assert.equal(s.kills, 0);
});

test('collect: xp gem gives xp, crystals and pages go to counters', () => {
  const s = new Stats(JSON.parse(JSON.stringify(CONFIG)));
  s.collect('xp', 2);
  assert.equal(s.xp, 2);
  s.collect('power'); s.collect('power'); s.collect('skill'); s.collect('page');
  assert.deepEqual(s.loot, { power: 2, skill: 1, page: 1 });
  s.reset();
  assert.deepEqual(s.loot, { power: 0, skill: 0, page: 0 });
});

test('staff: upgrade needs a pending crystal and changes stats', async () => {
  const { staffStats } = await import('../echo-gate/src/staff.js');
  const cfg = JSON.parse(JSON.stringify(CONFIG));
  const s = new Stats(cfg);
  assert.equal(s.upgrade('power'), false); // нет кристаллов
  s.collect('power'); s.collect('power'); s.collect('power');
  assert.equal(s.pendingPower, 3);
  const base = staffStats(cfg, s.upgrades);
  assert.equal(base.might, 20);
  assert.ok(s.upgrade('power') && s.upgrade('speed') && s.upgrade('range'));
  assert.equal(s.pendingPower, 0);
  assert.equal(s.upgrade('speed'), false);
  const up = staffStats(cfg, s.upgrades);
  assert.ok(up.damage > base.damage && up.interval < base.interval && up.range > base.range && up.might > base.might);
  assert.equal(s.upgrade('nonsense'), false);
});

test('перезарядка посоха упирается только в 0.05 с, остальные усиления без предела', async () => {
  const { staffStats } = await import('../echo-gate/src/staff.js');
  const { CONFIG } = await import('../echo-gate/src/config.js');
  assert.equal(CONFIG.staff.speed.min, 0.05);
  assert.ok(Math.abs(staffStats(CONFIG, { power: 0, speed: 10, range: 0 }).interval - 0.5 * 0.9 ** 10) < 1e-9); // 0.174 с, выше предела
  assert.equal(staffStats(CONFIG, { power: 0, speed: 100, range: 0 }).interval, 0.05);
  const big = staffStats(CONFIG, { power: 1000, speed: 0, range: 1000 });
  assert.equal(big.damage, CONFIG.attack.damage + 500);
  assert.equal(big.range, CONFIG.attack.range + 1000);
});
