// Запуск: node --experimental-default-type=module --test tests/absorption-aura.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../config_game.js';
import { BuildGrid } from '../build_grid.js';
import { canPlace, highlight } from '../build_rules.js';
import { Absorption } from '../systems_absorption.js';

function enemy(x, y = 0, hp = 1000) {
  return { x, y, active: true, hp, maxHp: hp, radius: 12, gen: 1,
    burnStacks: 0, burnT: 0, frostStacks: 0, freezeT: 0, shockStacks: 0 };
}
function setup(random = () => 0) {
  const build = new BuildGrid(7);
  build.placeCore('shield', CONFIG.cores.shield, 3, 3);
  const equip = (key, x, y) => {
    const r = canPlace(build, CONFIG.mods[key], x, y);
    assert.equal(r.ok, true, key + ' at ' + x + ',' + y + ': ' + r.reason);
    build.placeMod({ key, def: CONFIG.mods[key] }, x, y);
  };
  equip('aura', 3, 4);
  equip('absorption', 3, 5);
  const hero = { x: 0, y: 0, hp: 40, maxHp: 100, active: true };
  const enemies = [enemy(50), enemy(80), enemy(200)];
  const hits = [], effects = [];
  const aura = { active: true, radius: CONFIG.aura.radius };
  const absorption = new Absorption({
    config: CONFIG, hero, enemies: { items: enemies }, aura, rnd: random,
    camera: { x: 0, y: 0, viewW: 600, viewH: 800 },
    combat: { damageEnemy(e, damage, source) {
      if (e.blockHit || !e.active) return false;
      hits.push({ e, damage, aura: !!source.absorption });
      e.hp -= damage;
      if (e.hp <= 0) e.active = false;
      return true;
    } },
    modifiers: () => build.modifiersFor('shield'),
    ignite: (e) => { effects.push('burn'); e.burnStacks++; e.burnT = 3; },
    chill: (e) => { effects.push('frost'); e.frostStacks++; if (e.frostStacks === CONFIG.frost.maxStacks) e.freezeT = CONFIG.frost.freezeTime; },
    zap: (e) => { effects.push('lightning'); e.shockStacks++; if (e.shockStacks >= CONFIG.shock.maxStacks) e.shockStacks = 0; },
  });
  const advance = s => { for (let i = 0; i < Math.ceil(s * 60); i++) absorption.update(1 / 60); };
  return { build, equip, hero, enemies, hits, effects, aura, absorption, advance };
}

test('Поглощение можно поставить на Ауру, и билду известен отдельный режим', () => {
  const s = setup();
  assert.deepEqual(s.build.orphans(), []);
  const m = s.build.modifiersFor('shield');
  assert.equal(m.aura.count, 1);
  assert.equal(m.absorption.auraCount, 1);
  assert.equal(m.absorption.standaloneCount, 0);
  assert.equal(m.absorption.auraTargets, 1);
  assert.equal(m.absorption.standaloneTargets, 0);
  assert.equal(highlight(s.build, CONFIG.mods.power).targets.some(c => c.x === 2 && c.y === 5), true);
});

test('Раз в 2 секунды удар случайному врагу в Ауре, без лишнего обычного цикла раз в 3 с', () => {
  const s = setup(() => 0.999);
  s.advance(1.9);
  assert.equal(s.hits.length, 0);
  s.advance(0.12);
  assert.equal(s.hits.length, 1);
  assert.equal(s.hits[0].e, s.enemies[1]); // последний кандидат внутри Ауры
  assert.equal(s.hits[0].damage, CONFIG.absorption.damage);
  assert.equal(s.absorption.flashes.length, 1);
  s.advance(1.01);
  assert.equal(s.hits.length, 1); // нет обычного удара на третьей секунде
  s.advance(1.0);
  assert.equal(s.hits.length, 2);
});

test('Враги за пределами Ауры не выбираются, даже если видны на экране', () => {
  const s = setup(() => 0.9);
  s.advance(2.05);
  assert.equal(s.hits.length, 1);
  assert.ok(s.hits.every(h => h.e !== s.enemies[2]));
  s.enemies[0].x = 600;
  s.enemies[1].x = 500;
  s.advance(2.05);
  assert.equal(s.hits.length, 1);
});

test('Если нет целей, случайный удар пропускается, следующая попытка через 2 с', () => {
  const s = setup();
  s.enemies[0].x = 400; s.enemies[1].x = 500;
  s.advance(2.05);
  assert.equal(s.hits.length, 0);
  s.enemies[0].x = 50;
  s.advance(1.8);
  assert.equal(s.hits.length, 0);
  s.advance(0.2);
  assert.equal(s.hits.length, 1);
});

test('Х2/Х3 на Поглощении увеличивают число уникальных случайных целей', () => {
  const s = setup(() => 0);
  s.equip('x2', 3, 6);
  assert.equal(s.build.modifiersFor('shield').absorption.auraTargets, 2);
  s.advance(2.05);
  assert.equal(s.hits.length, 2);
  assert.equal(new Set(s.hits.map(h => h.e)).size, 2);
  assert.ok(s.hits.every(h => h.damage === CONFIG.absorption.damage));
  assert.equal(s.absorption.flashes.length, 2);
});

test('Х2 на самой Ауре расширяет зону и не множит количество целей Поглощения', () => {
  const s = setup();
  s.equip('x2', 2, 4);
  assert.equal(s.build.modifiersFor('shield').aura.mult, 2);
  assert.equal(s.build.modifiersFor('shield').absorption.auraTargets, 1);
  s.aura.radius = CONFIG.aura.radius * (1 + CONFIG.aura.radiusStep);
  s.enemies[0].x = 140; s.enemies[1].x = 200;
  s.advance(2.05);
  assert.equal(s.hits.length, 1);
  assert.equal(s.hits[0].e, s.enemies[0]);
});

test('Мощь и Вампиризм на Поглощении действуют на случайный удар Ауры', () => {
  const s = setup();
  s.equip('power', 2, 5);
  s.equip('vamp', 4, 5);
  const m = s.build.modifiersFor('shield');
  assert.ok(Math.abs(m.absorption.damage - 1.1) < 1e-8);
  assert.equal(m.absorption.vampirism, true);
  s.enemies[0].hp = 30; s.enemies[1].x = 500;
  s.advance(2.05);
  assert.equal(s.hits.length, 1);
  assert.ok(Math.abs(s.hits[0].damage - 99) < 1e-8);
  assert.equal(s.hero.hp, 43); // реальный урон 30, лечение 3
  assert.equal(s.absorption.flashes[0].color, '197,73,110');
});

test('Горение, Мороз и Молния на Поглощении с Аурой достигают максимума стаков', () => {
  const s = setup();
  s.equip('burn', 2, 5);
  s.equip('frost', 1, 5); // мороз как ребёнок горения
  s.equip('lightning', 4, 5);
  assert.deepEqual(s.build.orphans(), []);
  const m = s.build.modifiersFor('shield');
  assert.equal(m.absorption.burn, true);
  assert.equal(m.absorption.frost, true);
  assert.equal(m.absorption.lightning, true);
  s.advance(2.05);
  assert.equal(s.hits.length, 1);
  assert.equal(s.enemies[0].burnStacks, CONFIG.burn.maxStacks);
  assert.equal(s.enemies[0].freezeT, CONFIG.frost.freezeTime);
  assert.equal(s.enemies[0].shockStacks, 0);
  assert.deepEqual(s.effects.filter(x => x === 'burn').length, 3);
  assert.deepEqual(s.effects.filter(x => x === 'frost').length, 5);
  assert.deepEqual(s.effects.filter(x => x === 'lightning').length, 4);
  assert.equal(s.absorption.flashes[0].color, '172,84,136');
});

test('Ускорение сокращает 2-секундный интервал и не сбрасывает накопленный прогресс', () => {
  const s = setup();
  s.advance(0.8);
  s.equip('haste', 2, 5);
  s.advance(0.95);
  assert.equal(s.hits.length, 0);
  s.advance(0.15);
  assert.equal(s.hits.length, 1);
});

test('Если Аура неактивна, Поглощение на ней не срабатывает', () => {
  const s = setup();
  s.aura.active = false;
  s.advance(4.2);
  assert.equal(s.hits.length, 0);
  s.aura.active = true;
  s.advance(1.9);
  assert.equal(s.hits.length, 0);
  s.advance(0.15);
  assert.equal(s.hits.length, 1);
});

test('Прямое Поглощение на щите и Поглощение на Ауре работают независимо', () => {
  const s = setup();
  s.equip('absorption', 2, 3);
  const m = s.build.modifiersFor('shield');
  assert.equal(m.absorption.auraTargets, 1);
  assert.equal(m.absorption.standaloneTargets, 1);
  assert.equal(m.absorption.standaloneCount, 1);
  s.advance(2.05);
  assert.equal(s.hits.length, 1);
  s.advance(1.05);
  assert.equal(s.hits.length, 2);
  assert.equal(s.hits[1].e, s.enemies[2]); // стандартное Поглощение выбирает самого дальнего видимого
});

test('Удаление Ауры и сброс нового забега отменяют дополнительный таймер', () => {
  const s = setup();
  s.advance(1.0);
  s.build.takeMod(3, 4);
  s.advance(2.0);
  assert.equal(s.hits.length, 0);
  assert.equal(s.absorption.active, false);
  s.build.takeMod(3, 5); // после удаления родителя дочерний мод остаётся сиротой
  s.equip('aura', 3, 4);
  s.equip('absorption', 3, 5);
  s.absorption.reset();
  s.advance(1.9);
  assert.equal(s.hits.length, 0);
  s.advance(0.15);
  assert.equal(s.hits.length, 1);
});

test('Отменённый урон не накладывает стихии и не лечит', () => {
  const s = setup(); s.equip('vamp', 2, 5); s.equip('burn', 4, 5);
  s.enemies[0].blockHit = true;
  s.enemies[1].x = 500;
  s.advance(2.05);
  assert.equal(s.hits.length, 0);
  assert.equal(s.effects.length, 0);
  assert.equal(s.hero.hp, 40);
});
