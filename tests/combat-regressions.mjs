// Запуск: node --experimental-default-type=module --test tests/combat-regressions.mjs
// Без внешних зависимостей и без запуска Canvas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SpatialGrid } from '../core_spatial-grid.js';
import { Pellets } from '../systems_pellets.js';
import { AutoAttack } from '../systems_autoattack.js';

const area = { left: 0, top: 0, width: 400, height: 400 };

test('вложенный spatial query не портит внешний буфер', () => {
  const grid = new SpatialGrid(area, 40);
  const enemies = [
    { active: true, x: 25, y: 25 },
    { active: true, x: 65, y: 25 },
    { active: true, x: 350, y: 350 },
  ];
  grid.rebuild(enemies);
  const outer = [];
  const count = grid.query(40, 25, 40, outer);
  assert.deepEqual(outer.slice(0, count), [0, 1]);
  grid.query(350, 350, 5);
  assert.deepEqual(outer.slice(0, count), [0, 1]);
});

test('дробинка с пробитием не наносит повторный урон старой цели', () => {
  const grid = new SpatialGrid(area, 40);
  const a = { active: true, x: 70, y: 90, radius: 14 };
  const b = { active: true, x: 70, y: 90, radius: 14 };
  const en = [a, b];
  grid.rebuild(en);
  const hits = [];
  const pellets = new Pellets({
    config: { shot: { capacity: 8, radius: 3 }, enemies: { beetle: { radius: 14 } } },
    arena: { ...area, right: 400, bottom: 400, circleHitsRock: () => false },
    grid, enemies: { items: en },
    onHit: (e) => { hits.push(e); grid.query(300, 300, 10); },
  });
  pellets.add(70, 90, 1, 0, 100, 4, 0, 0, 0, 0, 0, 2);
  for (let i = 0; i < 8; i++) pellets.update(1 / 60);
  assert.equal(hits.filter(e => e === a).length, 1);
  assert.equal(hits.filter(e => e === b).length, 1);
});

test('залп не превышает лимит активных снарядов', () => {
  let active = 4;
  const shots = { get count() { return active; }, spawn() { active++; return { hits: [] }; } };
  const cfg = {
    attack: { core: 'projectile', projectile: 'bolt', count: 5, spread: 10, formations: { 5: [5] }, countDamage: 1 },
    projectiles: { bolt: { speed: 100, damage: 5, radius: 3, range: 100 } },
    limits: { maxShots: 5 },
  };
  const atk = new AutoAttack({
    config: cfg, hero: { x: 0, y: 0, active: true }, enemies: { items: [] }, shots,
    bus: { emit() {} }, modifiers: () => ({ count: { percent: 0, flat: 0 } }),
  });
  atk.fire({ x: 10, y: 0 });
  assert.equal(active, 5);
});
