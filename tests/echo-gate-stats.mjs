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
