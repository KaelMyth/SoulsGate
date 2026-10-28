// Запуск: node --experimental-default-type=module --test tests/gravity-blades.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../config_game.js';
import { Blades } from '../systems_blades.js';
import { BuildGrid } from '../build_grid.js';
import { canPlace } from '../build_rules.js';

function setup({ gravity = true, maxMultiplier = 1, phantom = false } = {}) {
  const build = new BuildGrid(7);
  build.placeCore('shield', CONFIG.cores.shield, 3, 3);
  const equip = (key, x, y) => {
    const check = canPlace(build, CONFIG.mods[key], x, y);
    assert.equal(check.ok, true, key + ': ' + check.reason);
    build.placeMod({ key, def: CONFIG.mods[key] }, x, y);
  };
  equip('blades', 3, 4);
  if (gravity) equip('gravity', 3, 5);
  const mods = build.modifiersFor('shield');
  if (maxMultiplier !== 1) mods.blades.max = maxMultiplier;
  if (phantom) mods.phantom = { count: 1, mult: 10, damage: 1 };
  const hero = { x: 0, y: 0, active: true };
  const target = { x: 150, y: 0, active: true, radius: 12, hp: 20000, def: {}, gen: 1 };
  const enemies = { items: [target] };
  const grid = {
    buf: [0],
    query(x, y, r, buf) {
      if (!target.active || Math.hypot(target.x - x, target.y - y) > r) return 0;
      if (buf) buf[0] = 0;
      else this.buf[0] = 0;
      return 1;
    },
  };
  let hits = 0;
  const combat = { damageEnemy(e, damage) { hits++; e.hp -= damage; return true; } };
  const arena = { left: -1000, right: 1000, top: -1000, bottom: 1000, circleHitsRock: () => false };
  const blades = new Blades({
    config: CONFIG, hero, enemies, grid, combat, arena,
    modifiers: () => mods, rnd: () => 0.1,
  });
  return { blades, mods, target, hero, hits: () => hits };
}

function run(s, frames = 600) {
  const seen = new Set();
  const states = new Set();
  const limit = Math.max(1, Math.round(CONFIG.blades.max * (s.mods.blades.max || 1)));
  for (let i = 0; i < frames; i++) {
    s.blades.update(1 / 60);
    assert.ok(s.blades.items.length <= limit, 'лимит превышен на кадре ' + i);
    for (const b of s.blades.items) {
      seen.add(b);
      states.add(b.state);
    }
  }
  return { seen, states, limit };
}

test('Гравитационные клинки бьют многократно, возвращаются, облетая героя', () => {
  const s = setup();
  const { seen, states, limit } = run(s, 600);
  assert.ok(s.hits() >= 3, 'каждый клинок должен попадать несколько раз');
  assert.ok(states.has('return'), 'возврат после удара');
  assert.ok(states.has('gravityOrbit'), 'полный облёт героя');
  assert.ok(states.has('fly'), 'повторный вылет во врага');
  assert.equal(seen.size, limit, 'ровно исходный набор клинков на всю игру');
  assert.equal(s.blades.items.length, limit);
});

test('Модификатор ×2 на Клинках увеличивает только разрешённый максимум, новые сверх него не появляются', () => {
  const s = setup({ maxMultiplier: 2 });
  const { seen, limit } = run(s, 720);
  assert.equal(limit, CONFIG.blades.max * 2);
  assert.equal(seen.size, limit);
  assert.equal(s.blades.items.length, limit);
});

test('Фантом не создаёт дополнительные клинки при Гравитации', () => {
  const s = setup({ phantom: true });
  const { seen, limit } = run(s, 720);
  assert.ok(s.hits() >= 2);
  assert.equal(seen.size, limit);
});

test('При потере цели постоянный клинок возвращается и ждёт на орбите без новых спавнов', () => {
  const s = setup();
  for (let i = 0; i < 75; i++) s.blades.update(1 / 60);
  assert.equal(s.blades.items.length, CONFIG.blades.max);
  s.target.active = false;
  const seen = new Set(s.blades.items);
  for (let i = 0; i < 480; i++) {
    s.blades.update(1 / 60);
    for (const b of s.blades.items) seen.add(b);
  }
  assert.equal(seen.size, CONFIG.blades.max);
  assert.equal(s.blades.items.length, CONFIG.blades.max);
  assert.ok(s.blades.items.some(b => b.state === 'gravityOrbit'), 'ждут новой цели');
  s.target.active = true;
  let hit0 = s.hits();
  for (let i = 0; i < 240; i++) s.blades.update(1 / 60);
  assert.ok(s.hits() > hit0, 'снова атакуют при появлении цели');
});

test('Без Гравитации обычные Клинки исчезают после попадания и затем копятся заново', () => {
  const s = setup({ gravity: false });
  const { seen } = run(s, 540);
  assert.ok(s.hits() >= 2);
  assert.ok(seen.size > CONFIG.blades.max, 'старые клинки удаляются, появляются новые');
  assert.ok(!s.blades.items.some(b => b.state === 'return' || b.state === 'gravityOrbit'));
});

test('Гравитационный режим отключается, если мод убран из билда', () => {
  const s = setup();
  for (let i = 0; i < 160; i++) s.blades.update(1 / 60);
  s.mods.gravity = null;
  s.blades.update(1 / 60);
  assert.equal(s.blades.gravityMode, false);
  assert.ok(s.blades.items.every(b => b.state !== 'return' && b.state !== 'gravityOrbit'));
});
