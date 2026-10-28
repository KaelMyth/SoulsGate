// Запуск: node --experimental-default-type=module --test tests/absorption-blades.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../config_game.js';
import { BuildGrid } from '../build_grid.js';
import { canPlace } from '../build_rules.js';
import { Absorption } from '../systems_absorption.js';
import { Blades } from '../systems_blades.js';

function enemy(x = 100, y = 0, gen = 1) {
  return { x, y, gen, active: true, hp: 1000, radius: 12,
    burnT: 0, burnStacks: 0, burnDmg: 0, burnInt: 0.5,
    frostStacks: 0, freezeT: 0, shockStacks: 0 };
}

function setup() {
  const build = new BuildGrid(7);
  build.placeCore('shield', CONFIG.cores.shield, 3, 3);
  const equip = (key, x, y) => {
    assert.equal(canPlace(build, CONFIG.mods[key], x, y).ok, true, key + ' on ' + x + ',' + y);
    build.placeMod({ key, def: CONFIG.mods[key] }, x, y);
  };
  equip('absorption', 3, 4);
  const hero = { x: 0, y: 0, active: true, hp: 20, maxHp: 100 };
  const en = [enemy(100)];
  const hits = [], elems = [];
  const combat = { damageEnemy(e, amount, source) {
    if (!e.active || e.cancelled) return false;
    hits.push({ e, amount, absorption: !!source.absorption, blade: !!source.blade });
    e.hp -= amount;
    if (e.hp <= 0) e.active = false;
    return true;
  } };
  const absorption = new Absorption({
    config: CONFIG, hero, camera: { x: 0, y: 0, viewW: 400, viewH: 600 },
    enemies: { items: en }, combat, modifiers: () => build.modifiersFor('shield'),
    ignite: (e) => { elems.push(['burn', e]); e.burnStacks = CONFIG.burn.maxStacks; },
    chill: (e) => { elems.push(['frost', e]); e.frostStacks++; if (e.frostStacks === CONFIG.frost.maxStacks) e.freezeT = CONFIG.frost.freezeTime; },
    zap: (e) => { elems.push(['lightning', e]); e.shockStacks++; if (e.shockStacks === CONFIG.shock.maxStacks) e.shockStacks = 0; },
  });
  const grid = { query(x, y, range, buf) { if (buf) { en.forEach((e, i) => { buf[i] = i; }); } return en.length; }, buf: [0] };
  const blades = new Blades({
    config: CONFIG, hero, enemies: { items: en }, grid, combat,
    modifiers: () => build.modifiersFor('shield'),
    onAbsorptionHit: (e) => absorption.recordBladeHit(e),
    rnd: () => 0.5,
  });
  const frame = (seconds) => {
    for (let k = 0; k < Math.ceil(seconds * 60); k++) absorption.update(1 / 60);
  };
  const bladeHit = (e, linked = true) => {
    const b = { x: e.x - 1, y: e.y, a: 0, off: 0, state: 'fly', target: e,
      vx: 0, vy: 0, age: 0, absorptionLinked: linked };
    blades.items.push(b);
    blades.update(1 / 60);
  };
  return { build, equip, hero, en, hits, elems, combat, absorption, blades, frame, bladeHit };
}

test('Клинки можно прикрепить непосредственно к Поглощению; связь отражается в билде', () => {
  const s = setup(); s.equip('blades', 3, 5);
  assert.deepEqual(s.build.orphans(), []);
  const m = s.build.modifiersFor('shield');
  assert.equal(m.absorption.blades, true);
  assert.equal(m.blades.linkedAbsorption, 1);
  assert.equal(m.blades.count, 1);
});

test('После третьего попадания по ОДНОЙ цели создаётся отсроченный удар ровно через 1 секунду', () => {
  const s = setup(); s.equip('blades', 3, 5);
  for (let i = 0; i < 2; i++) s.bladeHit(s.en[0]);
  assert.equal(s.absorption.bladeMarks.length, 0);
  s.bladeHit(s.en[0]);
  assert.equal(s.absorption.bladeMarks.length, 1);
  assert.equal(s.absorption.bladeMarks[0].enemy, s.en[0]);
  assert.equal(s.absorption.bladeMarks[0].total, 1);
  s.frame(0.95);
  assert.equal(s.hits.filter(h => h.absorption).length, 0);
  s.frame(0.1);
  assert.equal(s.hits.filter(h => h.absorption).length, 1);
  assert.equal(s.hits.filter(h => h.absorption)[0].amount, CONFIG.absorption.damage);
});

test('Попадания по двум разным врагам НЕ складываются в общую тройку', () => {
  const s = setup(); s.equip('blades', 3, 5);
  const second = enemy(120); s.en.push(second);
  s.bladeHit(s.en[0]); s.bladeHit(second); s.bladeHit(s.en[0]);
  assert.equal(s.absorption.bladeMarks.length, 0);
  s.bladeHit(second);
  assert.equal(s.absorption.bladeMarks.length, 0);
  s.bladeHit(s.en[0]);
  assert.equal(s.absorption.bladeMarks.length, 1);
  assert.equal(s.absorption.bladeMarks[0].enemy, s.en[0]);
});

test('Повторные попадания по отмеченному врагу не ставят вторую метку', () => {
  const s = setup(); s.equip('blades', 3, 5);
  for (let i = 0; i < 7; i++) s.bladeHit(s.en[0]);
  assert.equal(s.absorption.bladeMarks.length, 1);
  s.frame(1.05);
  assert.equal(s.hits.filter(h => h.absorption).length, 1);
  for (let i = 0; i < 3; i++) s.bladeHit(s.en[0]);
  assert.equal(s.absorption.bladeMarks.length, 1);
});

test('Уход цели из кадра не отменяет уже зафиксированную метку', () => {
  const s = setup(); s.equip('blades', 3, 5);
  for (let i = 0; i < 3; i++) s.bladeHit(s.en[0]);
  s.en[0].x = 9999;
  s.frame(1.05);
  assert.equal(s.hits.filter(h => h.absorption).length, 1);
});

test('Смерть врага и повторное использование записи из пула отменяют метку', () => {
  const s = setup(); s.equip('blades', 3, 5);
  for (let i = 0; i < 3; i++) s.bladeHit(s.en[0]);
  s.en[0].active = false;
  s.frame(1.05);
  assert.equal(s.absorption.bladeMarks.length, 0);
  s.en[0].active = true; s.en[0].gen = 2;
  for (let i = 0; i < 3; i++) s.bladeHit(s.en[0]);
  s.en[0].gen = 3;
  s.frame(1.05);
  assert.equal(s.hits.filter(h => h.absorption).length, 0);
});

test('Независимые клинки на щите не вызывают Поглощение', () => {
  const s = setup(); s.equip('blades', 2, 3); // самостоятельный мод, не под Поглощением
  assert.equal(s.build.modifiersFor('shield').absorption.blades, false);
  for (let i = 0; i < 4; i++) s.bladeHit(s.en[0]);
  assert.equal(s.absorption.bladeMarks.length, 0);
});

test('Успешный урон только связанных клинков засчитывается; отменённый не учитывается', () => {
  const s = setup(); s.equip('blades', 3, 5);
  s.en[0].cancelled = true;
  for (let i = 0; i < 3; i++) s.bladeHit(s.en[0]);
  assert.equal(s.absorption.bladeMarks.length, 0);
  s.en[0].cancelled = false;
  for (let i = 0; i < 3; i++) s.bladeHit(s.en[0]);
  assert.equal(s.absorption.bladeMarks.length, 1);
});

test('В комбинации двух видов Клинков только связанные получают признак Поглощения', () => {
  const s = setup(); s.equip('blades', 3, 5); s.equip('blades', 2, 3);
  const m = s.build.modifiersFor('shield');
  assert.equal(m.blades.count, 2);
  assert.equal(m.blades.linkedAbsorption, 1);
  s.en[0].active = false; // не запускаем залп: проверяем происхождение накопленных клинков
  s.blades.update(0.52);
  assert.ok(s.blades.items.some(b => b.state === 'orbit' && b.absorptionLinked));
  s.blades.update(0.52);
  assert.ok(s.blades.items.some(b => b.state === 'orbit' && !b.absorptionLinked));
});

test('При удалении Клинков из-под Поглощения метка отменяется', () => {
  const s = setup(); s.equip('blades', 3, 5);
  for (let i = 0; i < 3; i++) s.bladeHit(s.en[0]);
  s.build.takeMod(3, 5);
  s.frame(1.05);
  assert.equal(s.hits.filter(h => h.absorption).length, 0);
  assert.equal(s.absorption.bladeMarks.length, 0);
});

test('После сброса игры счётчики и ожидающие метки очищаются', () => {
  const s = setup(); s.equip('blades', 3, 5);
  s.bladeHit(s.en[0]);
  s.bladeHit(s.en[0]);
  s.absorption.reset();
  s.bladeHit(s.en[0]); 
  assert.equal(s.absorption.bladeMarks.length, 0);
});


test('Бонусный удар использует Мощь и Вампиризм непосредственно на Поглощении', () => {
  const s = setup(); s.equip('blades', 3, 5);
  s.equip('power', 2, 4);
  s.equip('vamp', 4, 4);
  assert.deepEqual(s.build.orphans(), []);
  for (let i = 0; i < 3; i++) s.bladeHit(s.en[0]);
  s.frame(1.05);
  const strike = s.hits.filter(h => h.absorption);
  assert.equal(strike.length, 1);
  assert.ok(Math.abs(strike[0].amount - CONFIG.absorption.damage * 1.1) < 1e-9);
  assert.ok(s.hero.hp > 20);
  assert.equal(s.absorption.flashes[0].color, '255,50,75');
});

test('Бонусный удар использует Горение, Мороз, Молнию и сочетание Пар из настоящего дерева', () => {
  const s = setup(); s.equip('blades', 3, 5);
  s.equip('burn', 2, 4);
  s.equip('frost', 1, 4); // Мороз как ребёнок Горения
  s.equip('lightning', 4, 4);
  assert.deepEqual(s.build.orphans(), []);
  const m = s.build.modifiersFor('shield');
  assert.equal(m.absorption.burn, true);
  assert.equal(m.absorption.frost, true);
  assert.equal(m.absorption.lightning, true);
  assert.ok(m.steam);
  for (let i = 0; i < 3; i++) s.bladeHit(s.en[0]);
  s.frame(1.05);
  const strike = s.hits.filter(h => h.absorption);
  assert.equal(strike.length, 1);
  assert.equal(strike[0].amount, CONFIG.absorption.damage + CONFIG.shock.attackBonus);
  assert.equal(s.en[0].burnStacks, CONFIG.burn.maxStacks);
  assert.equal(s.en[0].freezeT, CONFIG.frost.freezeTime); // тестовый chill вызывает заморозку
  assert.equal(s.en[0].shockStacks, 0); // четыре заряда дали разряд
  assert.equal(s.absorption.flashes[0].color, '255,255,255');
});

test('Обычный трёхсекундный цикл Поглощения не сбивается бонусным', () => {
  const s = setup(); s.equip('blades', 3, 5);
  for (let i = 0; i < 3; i++) s.bladeHit(s.en[0]);
  s.frame(1.05); // бонусный удар
  s.frame(2.05); // обычный
  assert.equal(s.hits.filter(h => h.absorption).length, 2);
});
