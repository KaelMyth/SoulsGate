// Запуск: node --experimental-default-type=module --test tests/elemental-reactions.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../config_game.js';
import { BuildGrid } from '../build_grid.js';
import { canPlace } from '../build_rules.js';
import { Game } from '../game.js';
import { Combat } from '../systems_combat.js';
import { createEnemy, initEnemy } from '../world_enemy.js';

function build(coreKind, keys) {
  const grid = new BuildGrid(7);
  if (coreKind === 'projectile' || coreKind === 'shield') grid.placeCore(coreKind, CONFIG.cores[coreKind], 3, 3);
  else grid.placeMod({ key: coreKind, def: CONFIG.mods[coreKind] }, 3, 3);
  let y = 4;
  for (const key of keys) {
    const check = canPlace(grid, CONFIG.mods[key], 3, y);
    assert.equal(check.ok, true, coreKind + ': ' + keys.join('→') + ': ' + key + ' (' + check.reason + ')');
    grid.placeMod({ key, def: CONFIG.mods[key] }, 3, y);
    y++;
  }
  assert.deepEqual(grid.orphans(), []);
  const id = coreKind === 'projectile' || coreKind === 'shield' ? coreKind : grid.secondaryId(coreKind);
  return grid.modifiersFor(id);
}

function enemy() {
  const e = createEnemy();
  initEnemy(e, { radius: 12, hp: 1500, speed: 100 }, 0, 0);
  return e;
}

function world(count = 5) {
  const foes = Array.from({ length: count }, (_, i) => {
    const e = enemy();
    e.x = i * 24;
    return e;
  });
  const hits = [];
  const bus = { emit(event, payload) { if (event === 'damage:dealt') hits.push(payload); } };
  const combat = new Combat(bus, { active: true }, CONFIG.combat);
  const g = {
    config: CONFIG, combat, shockSource: { shock: true, active: true }, frostShockSource: { shock: true, frostShock: true, active: true },
    enemies: { items: foes }, zapBolts: [],
    swarm: { grid: { query(x, y, r, buf) { for (let i = 0; i < foes.length; i++) buf[i] = i; return foes.length; } } },
    zapCandidates: [], rnd: () => 0.2,
    autoattack: { rangeMul: 1 },
    burst() {},
    ignite: Game.prototype.ignite, igniteMax: Game.prototype.igniteMax,
    chill: Game.prototype.chill, zap: Game.prototype.zap, discharge: Game.prototype.discharge,
    steamBurst() { this.steams = (this.steams || 0) + 1; },
  };
  return { g, foes, hits };
}

test('Мороз и Молния свободно крепятся друг к другу в обе стороны на разных источниках', () => {
  for (const core of ['projectile', 'rain', 'kinetic']) {
    for (const chain of [['frost', 'lightning'], ['lightning', 'frost']]) {
      const m = build(core, chain);
      assert.ok(m.frost, core + ': мороз');
      assert.ok(m.lightning, core + ': электризация');
    }
  }
});

test('Горение и Молния ставятся в обе стороны, цепь с Морозом сохраняет Пар', () => {
  for (const core of ['projectile', 'rain', 'kinetic']) {
    for (const keys of [['lightning', 'burn'], ['burn', 'lightning'], ['burn', 'lightning', 'frost'], ['frost', 'lightning', 'burn']]) {
      const m = build(core, keys);
      assert.ok(m.burn && m.lightning);
      if (keys.includes('frost')) assert.ok(m.steam && m.frost, 'Пар через Молнию');
    }
  }
});

test('Щит с Гравитацией принимает Мороз→Молния и Молния→Мороз только в своём поле', () => {
  for (const keys of [['gravity', 'frost', 'lightning'], ['gravity', 'lightning', 'frost']]) {
    const m = build('shield', keys);
    assert.equal(m.gravity.elements.mask, 6);
    assert.equal(m.frost, undefined);
    assert.equal(m.lightning, undefined);
  }
});

test('Заморозка электризованного врага вызывает ровно один небесный разряд на 15 урона', () => {
  const { g, foes, hits } = world();
  const e = foes[0];
  e.frostStacks = CONFIG.frost.maxStacks - 1;
  e.shockStacks = 2;
  const hp = e.hp;
  Game.prototype.chill.call(g, e, 0, 0, 0);
  assert.equal(e.freezeT, CONFIG.frost.freezeTime);
  assert.equal(e.hp, hp - 15);
  assert.equal(g.zapBolts.length, 1);
  assert.equal(g.zapBolts[0].sky, true);
  assert.equal(g.zapBolts[0].y0, e.y - CONFIG.frost.shockStrikeHeight);
  assert.equal(hits.filter(x => x.source?.frostShock).length, 1);
  Game.prototype.chill.call(g, e, 0, 0, 0);
  assert.equal(g.zapBolts.length, 1, 'после заморозки повторного удара нет');
});

test('Небесный разряд не срабатывает, когда на враге нет электризации', () => {
  const { g, foes } = world();
  foes[0].frostStacks = CONFIG.frost.maxStacks - 1;
  const hp = foes[0].hp;
  Game.prototype.chill.call(g, foes[0], 0, 0, 0);
  assert.equal(foes[0].hp, hp);
  assert.equal(g.zapBolts.length, 0);
});

test('Пар имеет приоритет перед заморозкой и ударом сверху; морозоустойчивый босс тоже защищён', () => {
  const { g, foes } = world();
  const a = foes[0];
  a.frostStacks = CONFIG.frost.maxStacks - 1;
  a.shockStacks = 3;
  Game.prototype.chill.call(g, a, 1, 7, 0.5);
  assert.equal(g.steams, 1);
  assert.equal(a.freezeT, 0);
  assert.equal(g.zapBolts.length, 0);
  const boss = foes[1];
  boss.def = { radius: 12, immuneFrost: true };
  boss.frostStacks = CONFIG.frost.maxStacks - 1;
  boss.shockStacks = 2;
  Game.prototype.chill.call(g, boss, 0);
  assert.equal(boss.freezeT, 0);
  assert.equal(g.zapBolts.length, 0);
});

test('Красные широкие дуги после разряда мгновенно дают максимум Горения всем поражённым', () => {
  const { g, foes } = world();
  const e = foes[0];
  for (let i = 0; i < CONFIG.shock.maxStacks; i++) Game.prototype.zap.call(g, e, 8, 0.4, 0, 0, 1);
  assert.equal(e.burnStacks, CONFIG.burn.maxStacks);
  assert.equal(g.zapBolts.length, 2);
  for (const bolt of g.zapBolts) assert.equal(bolt.fireArc, true);
  for (let i = 1; i <= 2; i++) {
    assert.equal(foes[i].burnStacks, CONFIG.burn.maxStacks);
    assert.equal(foes[i].burnDmg, 8);
    assert.equal(foes[i].burnT, CONFIG.burn.duration);
  }
  assert.equal(foes[3].burnStacks, 0, 'нет поражения за пределами цепи');
});

test('Если враг уже горел, даже обычная Молния создаёт огненные дуги', () => {
  const { g, foes } = world();
  Game.prototype.ignite.call(g, foes[0], 12, 0.5);
  foes[0].shockStacks = CONFIG.shock.maxStacks - 1;
  Game.prototype.zap.call(g, foes[0]);
  assert.equal(foes[0].burnStacks, CONFIG.burn.maxStacks);
  assert.ok(g.zapBolts.every(b => b.fireArc));
  assert.equal(foes[1].burnStacks, CONFIG.burn.maxStacks);
  assert.equal(foes[1].burnDmg, 12);
});

test('Обычный разряд остаётся жёлтым и не передаёт Горение без огня', () => {
  const { g, foes } = world();
  foes[0].shockStacks = CONFIG.shock.maxStacks - 1;
  Game.prototype.zap.call(g, foes[0]);
  assert.equal(foes[0].burnStacks, 0);
  assert.ok(g.zapBolts.every(b => !b.fireArc));
  assert.equal(foes[1].burnStacks, 0);
});

test('Огненный разряд не добавляет заряды электризации соседям и не зацикливается', () => {
  const { g, foes } = world();
  foes[0].shockStacks = CONFIG.shock.maxStacks - 1;
  Game.prototype.zap.call(g, foes[0], 10, 0.5);
  for (let i = 1; i <= 2; i++) assert.equal(foes[i].shockStacks, 0);
  assert.ok(g.zapBolts.length <= CONFIG.shock.chainMax);
});

test('Электризация и Мороз передаются вместе с огненными дугами, а заморозка — с небесным ударом', () => {
  const { g, foes } = world();
  foes[0].shockStacks = CONFIG.shock.maxStacks - 1;
  foes[1].frostStacks = CONFIG.frost.maxStacks - 1;
  foes[1].shockStacks = 1;
  Game.prototype.zap.call(g, foes[0], 9, 0.5, 1, 0, 1);
  assert.equal(foes[1].burnStacks, CONFIG.burn.maxStacks);
  assert.equal(foes[1].freezeT, CONFIG.frost.freezeTime);
  assert.equal(foes[1].hp, 1500 - CONFIG.shock.damage * CONFIG.shock.chainFrac - 15);
  assert.ok(g.zapBolts.some(b => b.sky));
});

test('Состояние реакций не переносится новому врагу из пула', () => {
  const e = enemy();
  e.frostStacks = 4; e.shockStacks = 3; e.burnStacks = CONFIG.burn.maxStacks;
  e.freezeT = 3; e.burnT = 3;
  initEnemy(e, { radius: 12, hp: 100, speed: 50 }, 0, 0);
  assert.equal(e.frostStacks, 0);
  assert.equal(e.shockStacks, 0);
  assert.equal(e.burnStacks, 0);
  assert.equal(e.freezeT, 0);
});
