import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../echo-gate/src/config.js';
import { Spawner } from '../echo-gate/src/spawner.js';
import { Inventory } from '../echo-gate/src/inventory.js';

const hero = { x: 0, z: 0, radius: 0.47 };
const enemyStub = () => ({ group: { visible: false }, addTo() {}, update() {} });
const make = () => {
  const cfg = JSON.parse(JSON.stringify(CONFIG));
  const spawner = new Spawner(null, cfg, enemyStub);
  return { cfg, spawner };
};

test('floor spawns continuously after all current enemies die', () => {
  const { cfg, spawner } = make();
  cfg.floors.duration = 30;
  cfg.waves.patterns[0].interval = 0.2;
  spawner.startFloor(1);
  for (let i = 0; i < 12; i++) spawner.update(0.1, hero, 12, () => 0.3);
  assert.ok(spawner.alive.length > 0);
  for (const e of [...spawner.alive]) spawner.kill(e);
  for (let i = 0; i < 12; i++) spawner.update(0.1, hero, 12, () => 0.3);
  assert.ok(spawner.alive.length > 0, 'respawns without waiting for a new wave');
  assert.equal(spawner.floorIndex, 1);
});

test('Stone Beetle boss appears after duration, with amplified health', () => {
  const { cfg, spawner } = make();
  cfg.floors.duration = 1;
  spawner.startFloor(1);
  for (let i = 0; i < 12; i++) spawner.update(0.1, hero, 12, () => 0.3);
  assert.equal(spawner.floorPhase, 'boss');
  assert.equal(spawner.boss?.kind, 'rock');
  assert.ok(spawner.boss.maxHp >= cfg.rock.hp * cfg.floors.bossHpMult);
  assert.ok(spawner.alive.includes(spawner.boss));
  spawner.kill(spawner.boss);
  spawner.endFloor();
  assert.equal(spawner.alive.length, 0);
  assert.equal(spawner.enabled, false);
  spawner.startFloor(2);
  assert.equal(spawner.floorIndex, 2);
  assert.equal(spawner.boss, null);
  assert.equal(spawner.enabled, true);
});

test('banked currency persists; unbanked currency does not touch inventory', () => {
  const previous = globalThis.localStorage;
  const saved = new Map();
  globalThis.localStorage = {
    getItem: (key) => saved.get(key) ?? null,
    setItem: (key, val) => saved.set(key, val),
  };
  try {
    const a = new Inventory({ limit: 10 });
    const unbanked = { spirit: 25, gold: 5 };
    assert.equal(a.spirit, 0);
    assert.equal(a.coins, 0);
    a.addSpirit(unbanked.spirit);
    a.addCoins(unbanked.gold);
    const b = new Inventory({ limit: 10 });
    assert.equal(b.spirit, 25);
    assert.equal(b.coins, 5);
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
});
