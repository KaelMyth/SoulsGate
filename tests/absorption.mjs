// Запуск: node --experimental-default-type=module --test tests/absorption.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../config_game.js';
import { BuildGrid } from '../build_grid.js';
import { canPlace, canPlacePassive, highlight } from '../build_rules.js';
import { Absorption } from '../systems_absorption.js';

function setup() {
  const build = new BuildGrid(7);
  build.placeCore('shield', CONFIG.cores.shield, 3, 3);
  const hero = { x: 0, y: 0, active: true, hp: 50, maxHp: 100 };
  const camera = { x: 0, y: 0, viewW: 480, viewH: 800 };
  const enemies = [];
  const hits = [];
  const absorption = new Absorption({
    config: CONFIG, hero, camera, enemies: { items: enemies },
    combat: { damageEnemy(e, dmg, source) {
      hits.push({ e, dmg, source });
      e.hp -= dmg;
      if (e.hp <= 0) e.active = false;
      return true;
    } },
    modifiers: () => build.modifiersFor('shield'),
  });
  const equip = () => build.placeMod({ key: 'absorption', def: CONFIG.mods.absorption }, 3, 4);
  const advance = (seconds) => {
    for (let i = 0; i < Math.ceil(seconds * 60); i++) absorption.update(1 / 60);
  };
  return { build, hero, camera, enemies, hits, absorption, equip, advance };
}

const enemy = (x, y) => ({ x, y, radius: 12, hp: 1000, active: true });

test('Поглощение разрешено у щита и не остаётся сиротой', () => {
  const s = setup();
  assert.equal(canPlace(s.build, CONFIG.mods.absorption, 3, 4).ok, true);
  s.equip();
  assert.deepEqual(s.build.orphans(), []);
  assert.equal(s.build.modifiersFor('shield').absorption.count, 1);
  assert.equal(s.build.modifiersFor('projectile')?.absorption, undefined);
});

test('Поглощение выбирает самого дальнего видимого врага, бьёт каждые 3 секунды', () => {
  const s = setup(); s.equip();
  const near = enemy(70, 30);
  const mid = enemy(200, 0);
  const far = enemy(50, 300);
  const offscreen = enemy(600, 20);
  s.enemies.push(near, mid, far, offscreen);
  s.advance(2.2);
  assert.equal(s.absorption.target, far);
  assert.equal(s.hits.length, 0);
  s.advance(0.83);
  assert.equal(s.hits.length, 1);
  assert.equal(s.hits[0].e, far);
  assert.equal(s.hits[0].dmg, CONFIG.absorption.damage);
  assert.equal(s.hits[0].source.absorption, true);
  s.advance(3.01);
  assert.equal(s.hits.length, 2);
});

test('Нет минимальной дальности: Поглощение поражает и ближайшего врага', () => {
  const s = setup(); s.equip();
  const e = enemy(1, 1); s.enemies.push(e);
  s.advance(2.2);
  assert.equal(s.absorption.target, e);
  assert.equal(s.hits.length, 0);
  s.advance(0.9);
  assert.equal(s.hits.length, 1);
  assert.equal(s.hits[0].e, e);
});

test('Погибшая цель не заменяется новым врагом до следующего цикла', () => {
  const s = setup(); s.equip();
  const e = enemy(205, 0); s.enemies.push(e);
  s.advance(2.2);
  const newEnemy = enemy(220, 0); s.enemies.push(newEnemy);
  e.active = false;
  s.advance(0.92);
  assert.equal(s.hits.length, 0);
  assert.equal(s.absorption.target, null);
  s.advance(3.05);
  assert.equal(s.hits.length, 1);
  assert.equal(s.hits[0].e, newEnemy);
});

test('Снятие Поглощения отменяет все метки', () => {
  const s = setup(); s.equip();
  s.enemies.push(enemy(205, 0));
  s.advance(2.2);
  s.build.takeMod(3, 4);
  s.advance(1);
  assert.equal(s.hits.length, 0);
  assert.equal(s.absorption.active, false);
  assert.equal(s.absorption.targets.length, 0);
  assert.equal(s.absorption.target, null);
});

test('Новый забег обнуляет заряд и вспышку', () => {
  const s = setup(); s.equip();
  const e = enemy(220, 0); s.enemies.push(e);
  s.advance(3.05);
  assert.equal(s.hits.length, 1);
  s.absorption.reset();
  assert.equal(s.absorption.flash, 0);
  assert.equal(s.absorption.target, null);
  s.advance(1);
  assert.equal(s.hits.length, 1);
});

test('Вампиризм крепится непосредственно к Поглощению и подсвечивает нужную клетку', () => {
  const s = setup();
  assert.equal(canPlace(s.build, CONFIG.mods.vamp, 3, 4).ok, false); // не к голому щиту
  s.equip();
  assert.equal(canPlace(s.build, CONFIG.mods.vamp, 3, 5).ok, true);
  assert.equal(canPlace(s.build, CONFIG.mods.magnet, 3, 5).ok, false);
  assert.equal(canPlacePassive(s.build, CONFIG.mods.vamp, 0), true); // прежнее место сохранилось
  assert.equal(highlight(s.build, CONFIG.mods.vamp).targets.some(c => c.x === 3 && c.y === 5), true);
  s.build.placeMod({ key: 'vamp', def: CONFIG.mods.vamp }, 3, 5);
  assert.deepEqual(s.build.orphans(), []);
  assert.equal(s.build.modifiersFor('shield').absorption.vampirism, true);
  assert.equal(canPlace(s.build, CONFIG.mods.x2, 3, 6).ok, false);
});

test('Вампиризм на Поглощении лечит на 10% фактического урона, не избыточного', () => {
  const s = setup(); s.equip();
  s.build.placeMod({ key: 'vamp', def: CONFIG.mods.vamp }, 3, 5);
  const e = enemy(210, 0); e.hp = 5; s.enemies.push(e);
  s.hero.hp = 50;
  s.advance(3.05);
  assert.equal(s.hits.length, 1);
  assert.equal(s.hero.hp, 50.5); // из 90 урона реально было 5
  assert.equal(s.absorption.vampiric, true);
  assert.equal(s.absorption.flashVampiric, true);
  assert.equal(s.hits[0].source.vampiric, true);
});

test('Вампиризм только в углу не меняет Поглощение', () => {
  const s = setup(); s.equip();
  s.build.placePassive({ key: 'vamp', def: CONFIG.mods.vamp }, 0);
  assert.equal(s.build.passives().vamp, 1); // прежнее лечение при убийстве сохранено
  assert.equal(s.build.modifiersFor('shield').absorption.vampirism, false);
  s.enemies.push(enemy(210, 0)); s.hero.hp = 50;
  s.advance(3.05);
  assert.equal(s.hero.hp, 50);
  assert.equal(s.absorption.flashVampiric, false);
});

test('Лечение не превышает максимальное здоровье и прекращается после снятия Вампиризма', () => {
  const s = setup(); s.equip();
  s.build.placeMod({ key: 'vamp', def: CONFIG.mods.vamp }, 3, 5);
  s.enemies.push(enemy(210, 0)); s.hero.hp = 99;
  s.advance(3.05);
  assert.equal(s.hero.hp, 100);
  s.build.takeMod(3, 5);
  s.advance(3.05);
  assert.equal(s.hits.length, 2);
  assert.equal(s.absorption.vampiric, false);
  assert.equal(s.hits[1].source.vampiric, false);
  s.absorption.reset();
  assert.equal(s.absorption.source.vampiric, false);
});

test('Отменённый Combat-удар не лечит; сопротивление уменьшает лечение', () => {
  const s = setup(); s.equip();
  s.build.placeMod({ key: 'vamp', def: CONFIG.mods.vamp }, 3, 5);
  s.enemies.push(enemy(210, 0)); s.hero.hp = 50;
  s.absorption.combat.damageEnemy = () => false;
  s.advance(3.05);
  assert.equal(s.hero.hp, 50);
  s.absorption.combat.damageEnemy = (e) => { e.hp -= 20; return true; };
  s.advance(3.05);
  assert.equal(s.hero.hp, 52);
});

test('Удаление Поглощения оставляет дочерний Вампиризм сиротой и выключает эффект', () => {
  const s = setup(); s.equip();
  s.build.placeMod({ key: 'vamp', def: CONFIG.mods.vamp }, 3, 5);
  s.build.takeMod(3, 4);
  assert.equal(s.build.orphans().length, 1);
  s.enemies.push(enemy(210, 0));
  s.advance(4);
  assert.equal(s.absorption.active, false);
  assert.equal(s.absorption.target, null);
  assert.equal(s.hits.length, 0);
});

test('Выбранная цель зафиксирована: новые более дальние враги её не перехватывают', () => {
  const s = setup(); s.equip();
  const first = enemy(90, 0);
  s.enemies.push(first);
  s.advance(2.2);
  assert.equal(s.absorption.target, first);
  const newcomer = enemy(215, 340);
  s.enemies.push(newcomer);
  s.advance(0.9);
  assert.equal(s.hits.length, 1);
  assert.equal(s.hits[0].e, first);
  assert.equal(newcomer.hp, 1000);
});

test('Фиксация сохраняется даже если отмеченный враг переместился за кадр', () => {
  const s = setup(); s.equip();
  const e = enemy(120, 0); s.enemies.push(e);
  s.advance(2.2);
  e.x = 600;
  s.advance(0.9);
  assert.equal(s.hits.length, 1);
  assert.equal(s.hits[0].e, e);
});

test('Х2 даёт две разные одновременные цели, Х3 — три', () => {
  for (const [key, count] of [['x2', 2], ['x3', 3]]) {
    const s = setup(); s.equip();
    s.build.placeMod({ key, def: CONFIG.mods[key] }, 3, 5);
    assert.equal(s.build.orphans().length, 0);
    assert.equal(s.build.modifiersFor('shield').absorption.targets, count);
    for (let i = 0; i < 5; i++) s.enemies.push(enemy(60 + 20 * i, 0));
    s.advance(2.2);
    assert.equal(s.absorption.targets.length, count);
    s.advance(0.9);
    assert.equal(s.hits.length, count);
    assert.equal(new Set(s.hits.map(h => h.e)).size, count);
    assert.ok(s.hits.every(h => h.dmg === CONFIG.absorption.damage));
    assert.equal(s.absorption.flashes.length, count);
  }
});

test('Х2→Х3 в одной цепочке = 6 целей, не 5 и не 2+3', () => {
  const s = setup(); s.equip();
  assert.equal(canPlace(s.build, CONFIG.mods.x2, 3, 5).ok, true);
  s.build.placeMod({ key: 'x2', def: CONFIG.mods.x2 }, 3, 5);
  assert.equal(canPlace(s.build, CONFIG.mods.x3, 3, 6).ok, true);
  s.build.placeMod({ key: 'x3', def: CONFIG.mods.x3 }, 3, 6);
  assert.equal(s.build.modifiersFor('shield').absorption.targets, 6);
  assert.deepEqual(s.build.orphans(), []);
  for (let i = 0; i < 7; i++) s.enemies.push(enemy(20 + i * 25, 0));
  s.advance(3.08);
  assert.equal(s.hits.length, 6);
});

test('Х2 и Х3 на разных гранях Поглощения также перемножаются: 6 целей', () => {
  const s = setup(); s.equip();
  s.build.placeMod({ key: 'x2', def: CONFIG.mods.x2 }, 2, 4);
  s.build.placeMod({ key: 'x3', def: CONFIG.mods.x3 }, 4, 4);
  assert.deepEqual(s.build.orphans(), []);
  assert.equal(s.build.modifiersFor('shield').absorption.targets, 6);
  for (let i = 0; i < 8; i++) s.enemies.push(enemy(10 + i * 20, 0));
  s.advance(3.08);
  assert.equal(s.hits.length, 6);
});

test('Вампиризм после Х2 лечит от всех поражённых целей, не удваивая урон', () => {
  const s = setup(); s.equip();
  s.build.placeMod({ key: 'x2', def: CONFIG.mods.x2 }, 3, 5);
  assert.equal(canPlace(s.build, CONFIG.mods.vamp, 3, 6).ok, true);
  s.build.placeMod({ key: 'vamp', def: CONFIG.mods.vamp }, 3, 6);
  assert.equal(s.build.modifiersFor('shield').absorption.vampirism, true);
  const a = enemy(200, 0), b = enemy(180, 20);
  a.hp = 30; b.hp = 40;
  s.enemies.push(a,b);s.hero.hp=50;
  s.advance(3.08);
  assert.equal(s.hits.length, 2);
  assert.equal(s.hero.hp, 57);
  assert.equal(s.absorption.flashes.length, 2);
  assert.ok(s.absorption.flashes.every(f => f.vampiric));
});

test('Число целей ограничено maxTargets при больших цепочках множителей', () => {
  const s = setup(); s.equip();
  s.build.placeMod({ key: 'x3', def: CONFIG.mods.x3 }, 3, 5);
  s.build.placeMod({ key: 'x3', def: CONFIG.mods.x3 }, 3, 6);
  assert.equal(s.build.modifiersFor('shield').absorption.targets, 9);
  const old = CONFIG.absorption.maxTargets;
  CONFIG.absorption.maxTargets = 4;
  try {
    for (let i = 0; i < 12; i++) s.enemies.push(enemy(15 + 12 * i, 0));
    s.advance(3.08);
    assert.equal(s.hits.length, 4);
  } finally {
    CONFIG.absorption.maxTargets = old;
  }
});

test('Мощь увеличивает урон каждой цели на 10%', () => {
  const s = setup(); s.equip();
  assert.equal(canPlace(s.build, CONFIG.mods.power, 3, 5).ok, true);
  s.build.placeMod({ key: 'power', def: CONFIG.mods.power }, 3, 5);
  assert.deepEqual(s.build.orphans(), []);
  assert.ok(Math.abs(s.build.modifiersFor('shield').absorption.damage - 1.1) < 1e-9);
  s.enemies.push(enemy(210, 0)); s.advance(3.05);
  assert.ok(Math.abs(s.hits[0].dmg - 99) < 1e-8);
});

test('Мощь→Мощь: последовательные бонусы ×1.1 ×1.1 = 1.21', () => {
  const s = setup(); s.equip();
  s.build.placeMod({ key: 'power', def: CONFIG.mods.power }, 3, 5);
  assert.equal(canPlace(s.build, CONFIG.mods.power, 3, 6).ok, true);
  s.build.placeMod({ key: 'power', def: CONFIG.mods.power }, 3, 6);
  assert.ok(Math.abs(s.build.modifiersFor('shield').absorption.damage - 1.21) < 1e-9);
  s.enemies.push(enemy(210, 0)); s.advance(3.05);
  assert.ok(Math.abs(s.hits[0].dmg - 108.9) < 1e-8);
});

test('Мощь в двух независимых ветках даёт суммарно +20%', () => {
  const s = setup(); s.equip();
  s.build.placeMod({ key: 'power', def: CONFIG.mods.power }, 2, 4);
  s.build.placeMod({ key: 'power', def: CONFIG.mods.power }, 4, 4);
  assert.deepEqual(s.build.orphans(), []);
  assert.ok(Math.abs(s.build.modifiersFor('shield').absorption.damage - 1.2) < 1e-9);
});

test('Ускорение сокращает цикл и длительность каста', () => {
  const s = setup(); s.equip();
  assert.equal(canPlace(s.build, CONFIG.mods.haste, 3, 5).ok, true);
  s.build.placeMod({ key: 'haste', def: CONFIG.mods.haste }, 3, 5);
  assert.ok(Math.abs(s.build.modifiersFor('shield').absorption.rate - 1.1) < 1e-9);
  s.enemies.push(enemy(210, 0));
  s.advance(2.1);
  assert.equal(s.hits.length, 0);
  assert.equal(s.absorption.aiming, true);
  assert.ok(Math.abs(s.absorption.castTime - CONFIG.absorption.telegraph / 1.1) < 1e-9);
  s.advance(0.65);
  assert.equal(s.hits.length, 1);
  s.advance(2.75);
  assert.equal(s.hits.length, 2);
});

test('Ускорение→Ускорение: время сокращается по множителю 1.21', () => {
  const s = setup(); s.equip();
  s.build.placeMod({ key: 'haste', def: CONFIG.mods.haste }, 3, 5);
  s.build.placeMod({ key: 'haste', def: CONFIG.mods.haste }, 3, 6);
  assert.ok(Math.abs(s.build.modifiersFor('shield').absorption.rate - 1.21) < 1e-9);
  s.enemies.push(enemy(210, 0));
  s.advance(2.5);
  assert.equal(s.hits.length, 1);
});

test('Х2→Х3 + Мощь + Ускорение одновременно и Вампиризм', () => {
  const s = setup(); s.equip();
  s.build.placeMod({ key: 'x2', def: CONFIG.mods.x2 }, 3, 5);
  s.build.placeMod({ key: 'x3', def: CONFIG.mods.x3 }, 3, 6);
  s.build.placeMod({ key: 'power', def: CONFIG.mods.power }, 2, 4);
  s.build.placeMod({ key: 'haste', def: CONFIG.mods.haste }, 4, 4);
  const v = s.build.modifiersFor('shield').absorption;
  assert.equal(v.targets, 6);
  assert.ok(Math.abs(v.damage - 1.1) < 1e-9);
  assert.ok(Math.abs(v.rate - 1.1) < 1e-9);
  s.enemies.push(enemy(200, 0), enemy(180, 30), enemy(160, 0));
  s.advance(2.75);
  assert.equal(s.hits.length, 3);
  assert.ok(s.hits.every(h => Math.abs(h.dmg - 99) < 1e-8));
});

test('Изменение скорости во время каста сохраняет цель и прогресс', () => {
  const s = setup(); s.equip();
  const e = enemy(210, 0); s.enemies.push(e);
  s.advance(2.2);
  assert.equal(s.absorption.target, e);
  s.build.placeMod({ key: 'haste', def: CONFIG.mods.haste }, 3, 5);
  s.advance(0.75);
  assert.equal(s.hits.length, 1);
  assert.equal(s.hits[0].e, e);
});
