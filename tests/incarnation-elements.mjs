// Запуск: node --experimental-default-type=module --test tests/incarnation-elements.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../config_game.js';
import { BuildGrid } from '../build_grid.js';
import { canPlace } from '../build_rules.js';
import { createEnemy, initEnemy } from '../world_enemy.js';
import { Combat } from '../systems_combat.js';
import { Game } from '../game.js';
import { Incarnation, incarnationSegmentHit } from '../systems_incarnation.js';
import { Renderer } from '../render_renderer.js';

function buildIncarnation(elements = []) {
  const grid = new BuildGrid(7);
  grid.placeMod({ key: 'incarnation', def: CONFIG.mods.incarnation }, 3, 3);
  for (let i = 0; i < elements.length; i++) {
    const key = elements[i], y = i + 4;
    const can = canPlace(grid, CONFIG.mods[key], 3, y);
    assert.equal(can.ok, true, key + ' incompatible: ' + can.reason);
    grid.placeMod({ key, def: CONFIG.mods[key] }, 3, y);
  }
  assert.deepEqual(grid.orphans(), []);
  return { grid, mods: grid.modifiersFor(grid.secondaryId('incarnation')) };
}

function makeEnemy(x, y = 0, hp = 5000) {
  const e = createEnemy();
  initEnemy(e, { radius: 11, hp, speed: 100 }, x, y);
  e.active = true;
  return e;
}
function setup(elements = [], positions = [[60, 0]]) {
  const { mods, grid } = buildIncarnation(elements);
  const enemies = positions.map(([x, y]) => makeEnemy(x, y));
  const hero = { active: true, radius: 12, prevX: 0, prevY: 0, x: 100, y: 0, incarnationT: 5 };
  const stats = { hit: [], steam: 0, freeze: 0 };
  const bus = { emit(event, payload) { if (event === 'damage:dealt') stats.hit.push(payload); } };
  const combat = new Combat(bus, hero, CONFIG.combat);
  const g = Object.create(Game.prototype);
  Object.assign(g, {
    config: CONFIG, combat, hero, enemies: { items: enemies },
    shockSource: { shock: true, active: true },
    frostShockSource: { shock: true, frostShock: true, active: true },
    zapBolts: [], zapCandidates: [], rnd: () => 0.2,
    autoattack: { rangeMul: 1 },
    swarm: { grid: { query(x, y, r, buf) {
      for (let i = 0; i < enemies.length; i++) buf[i] = i;
      return enemies.length;
    } } },
    burst() {},
    steamBurst() { stats.steam++; },
  });
  const incarnation = new Incarnation({
    config: CONFIG, hero, enemies: { items: enemies }, combat,
    igniteMax: (e, d, i) => g.igniteMax(e, d, i),
    chill: (e, st, d, i) => g.chill(e, st, d, i),
    zap: (e, bd, bi, fr, st, chain) => g.zap(e, bd, bi, fr, st, chain),
  });
  incarnation.begin(mods);
  return { grid, mods, enemies, hero, g, incarnation, stats };
}

test('Воплощение принимает Горение, Мороз, Молнию и все их комбинации', () => {
  const combinations = [
    [], ['burn'], ['frost'], ['lightning'], ['burn', 'frost'],
    ['burn', 'lightning'], ['frost', 'lightning'], ['burn', 'frost', 'lightning'],
    ['lightning', 'frost', 'burn'], ['frost', 'lightning', 'burn'],
  ];
  for (const keys of combinations) {
    const { mods } = buildIncarnation(keys);
    assert.equal(!!mods.burn, keys.includes('burn'));
    assert.equal(!!mods.frost, keys.includes('frost'));
    assert.equal(!!mods.lightning, keys.includes('lightning'));
    assert.equal(!!mods.steam, keys.includes('frost') && keys.includes('burn'));
  }
});

test('Сфера поражает врагов на всём пути, даже при очень быстром движении за один кадр', () => {
  const a = setup([], [[45, 0], [75, 0], [95, 60], [150, 0]]);
  a.incarnation.update();
  assert.equal(a.enemies[0].hp, 5000 - CONFIG.skills.incarnation.contactDamage);
  assert.equal(a.enemies[1].hp, 5000 - CONFIG.skills.incarnation.contactDamage);
  assert.equal(a.enemies[2].hp, 5000);
  assert.equal(a.enemies[3].hp, 5000);
  assert.equal(a.stats.hit.filter(h => h.source?.incarnation).length, 2);
});

test('Один враг получает урон только один раз за каждое отдельное Воплощение', () => {
  const a = setup();
  const initial = a.enemies[0].hp;
  a.incarnation.update();
  a.hero.prevX = 100; a.hero.x = 0;
  a.incarnation.update();
  a.hero.prevX = 0; a.hero.x = 100;
  a.incarnation.update();
  assert.equal(a.enemies[0].hp, initial - CONFIG.skills.incarnation.contactDamage);
  a.incarnation.begin(a.mods);
  a.incarnation.update();
  assert.equal(a.enemies[0].hp, initial - 2 * CONFIG.skills.incarnation.contactDamage);
});

test('Мёртвые цели, выключенная комета и закончившееся время не наносят урона', () => {
  const a = setup();
  a.incarnation.reset();
  a.incarnation.update();
  assert.equal(a.enemies[0].hp, 5000);
  a.incarnation.begin(a.mods);
  a.hero.incarnationT = 0;
  a.incarnation.update();
  assert.equal(a.enemies[0].hp, 5000);
  a.hero.incarnationT = 5;
  a.hero.active = false;
  a.incarnation.update();
  assert.equal(a.enemies[0].hp, 5000);
  a.hero.active = true;
  a.enemies[0].active = false;
  a.incarnation.update();
  assert.equal(a.enemies[0].hp, 5000);
});

test('Попадание отменено: стихийные статусы не применяются', () => {
  const a = setup(['burn', 'frost', 'lightning']);
  a.incarnation.combat = { damageEnemy() { return false; } };
  a.incarnation.update();
  const e = a.enemies[0];
  assert.equal(e.burnStacks, 0);
  assert.equal(e.frostStacks, 0);
  assert.equal(e.shockStacks, 0);
});

test('Повторное использование объекта врага пулом создаёт новую цель, доступную для удара', () => {
  const a = setup();
  const e = a.enemies[0];
  a.incarnation.update();
  const oldGen = e.gen;
  initEnemy(e, { radius: 11, hp: 5000, speed: 100 }, 60, 0);
  e.active = true;
  assert.ok(e.gen > oldGen);
  a.incarnation.update();
  assert.equal(e.hp, 5000 - CONFIG.skills.incarnation.contactDamage);
});

test('Огненная сфера при одном контакте сразу создаёт максимум Горения', () => {
  const a = setup(['burn']);
  a.incarnation.update();
  const e = a.enemies[0];
  assert.equal(e.burnStacks, CONFIG.burn.maxStacks);
  assert.equal(e.burnDmg, CONFIG.skills.incarnation.burnTickDamage);
  assert.ok(e.burnT > 0);
  a.incarnation.update();
  assert.equal(e.burnStacks, CONFIG.burn.maxStacks);
});

test('Морозная сфера при касании сразу замораживает, без Горения и Молнии', () => {
  const a = setup(['frost']);
  a.incarnation.update();
  const e = a.enemies[0];
  assert.equal(e.freezeT, CONFIG.frost.freezeTime);
  assert.equal(e.burnStacks, 0);
  assert.equal(e.shockStacks, 0);
});

test('Электрическая сфера одним касанием вызывает один обычный разряд', () => {
  const a = setup(['lightning']);
  a.incarnation.update();
  const e = a.enemies[0];
  assert.equal(e.shockStacks, 0);
  assert.equal(e.hp, 5000 - CONFIG.skills.incarnation.contactDamage - CONFIG.shock.damage);
  assert.equal(a.g.zapBolts.length, 0, 'одна цель — цепи рисовать не к кому');
});

test('Горение + Мороз создают Пар на одном касании и не замораживают', () => {
  const a = setup(['burn', 'frost']);
  a.incarnation.update();
  assert.equal(a.enemies[0].burnStacks, CONFIG.burn.maxStacks);
  assert.equal(a.stats.steam, 1);
  assert.equal(a.enemies[0].freezeT, 0);
});

test('Мороз + Электризация: один контакт вызывает и небесный удар на 15, и разряд', () => {
  const a = setup(['frost', 'lightning']);
  a.incarnation.update();
  const e = a.enemies[0];
  assert.equal(e.freezeT, CONFIG.frost.freezeTime);
  assert.equal(a.g.zapBolts.filter(x => x.sky).length, 1);
  assert.equal(a.stats.hit.filter(x => x.source?.frostShock).length, 1);
  assert.equal(e.hp, 5000 - CONFIG.skills.incarnation.contactDamage - CONFIG.frost.shockStrikeDamage - CONFIG.shock.damage);
});

test('Горение + Электризация запускают широкие красные дуги, передающие максимум огня', () => {
  const a = setup(['burn', 'lightning'], [[55,0], [172,0]]);
  a.incarnation.update();
  assert.equal(a.enemies[0].burnStacks, CONFIG.burn.maxStacks);
  assert.equal(a.enemies[1].burnStacks, CONFIG.burn.maxStacks);
  assert.equal(a.enemies[1].hp, 5000 - CONFIG.shock.damage * CONFIG.shock.chainFrac);
  assert.ok(a.g.zapBolts.every(x => x.fireArc));
});

test('Тройная сфера вызывает Пар и красные дуги, урон не удваивается на той же цели', () => {
  const a = setup(['burn', 'frost', 'lightning'], [[55,0], [172,0]]);
  a.incarnation.update();
  assert.equal(a.enemies[0].burnStacks, CONFIG.burn.maxStacks);
  assert.equal(a.enemies[0].freezeT, 0);
  assert.equal(a.stats.steam, 1);
  assert.equal(a.enemies[1].burnStacks, CONFIG.burn.maxStacks);
  assert.ok(a.g.zapBolts.some(x => x.fireArc));
  a.incarnation.update();
  assert.equal(a.stats.steam, 1);
});

test('Неподвижная сфера бьёт один раз, если враг касается её радиуса', () => {
  const a = setup([], [[0,0], [40,0]]);
  a.hero.prevX = 0; a.hero.x = 0;
  a.incarnation.update();
  assert.equal(a.enemies[0].hp, 5000 - CONFIG.skills.incarnation.contactDamage);
  assert.equal(a.enemies[1].hp, 5000);
});

test('Геометрия касается границы круга, но не выходит за неё', () => {
  assert.equal(incarnationSegmentHit(0,0,100,0,50,20,20), true);
  assert.equal(incarnationSegmentHit(0,0,100,0,50,21,20), false);
  assert.equal(incarnationSegmentHit(0,0,0,0,0,10,11), true);
  assert.equal(incarnationSegmentHit(0,0,0,0,0,12,11), false);
});

test('Стихийная форма рисует уникальную палитру у всех восьми вариантов', () => {
  const forms = CONFIG.skills.incarnation.forms;
  assert.equal(forms.length, 8);
  assert.equal(new Set(forms.map(f => f.outer)).size, 8);
  for (let i = 0; i < 8; i++) {
    const used = [];
    const ctx = new Proxy({}, {
      get(target, key) { return key in target ? target[key] : (...args) => used.push([key, ...args]); },
      set(target, key, value) { if (key === 'fillStyle') used.push([key, value]); target[key] = value; return true; },
    });
    const fake = {ctx, hero: { vx: 160, vy: 40, facing: 0, cfg: { speed: 180 }, incarnationMask: i },
      cfg: CONFIG, clock: 3.21};
    Renderer.prototype.drawIncarnation.call(fake, 50, 50);
    assert.ok(used.some(([key, value]) => key === 'fillStyle' && value === forms[i].outer),
      'different outer color for mask ' + i);
  }
});
