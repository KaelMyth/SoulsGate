// Запуск: node --experimental-default-type=module --test tests/incarnation.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../config_game.js';
import { Game } from '../game.js';
import { Hero } from '../world_hero.js';
import { Combat } from '../systems_combat.js';
import { HeroDefense } from '../systems_defense.js';
import { BuildGrid } from '../build_grid.js';
import { canPlace } from '../build_rules.js';

function buildSkill() {
  const grid = new BuildGrid(7);
  const ok = canPlace(grid, CONFIG.mods.incarnation, 3, 3);
  assert.equal(ok.ok, true, ok.reason);
  grid.placeMod({ key: 'incarnation', def: CONFIG.mods.incarnation }, 3, 3);
  assert.deepEqual(grid.orphans(), []);
  assert.ok(grid.secondaryId('incarnation'));
  return grid;
}

function fakeGame(ready = true) {
  const hero = new Hero(CONFIG.hero);
  const build = buildSkill();
  return {
    state: 'playing', hero, build, config: CONFIG,
    skillCd: [0, ready ? 0 : 15, 0],
    hud: { slotFlash: 0, rainOn: false, rainT: 0 },
  };
}

test('Воплощение — самостоятельное вторичное ядро для второго умения', () => {
  const grid = buildSkill();
  assert.equal(grid.modifiersFor(grid.secondaryId('incarnation')) !== undefined, true);
  assert.equal(CONFIG.skills.incarnation.duration, 5);
  assert.equal(CONFIG.skills.incarnation.cooldown, 30);
});

test('Второй слот запускает превращение на 5 секунд и 30-секундный откат', () => {
  const g = fakeGame();
  assert.equal(Game.prototype.castIncarnation.call(g), true);
  assert.equal(g.hero.incarnationT, 5);
  assert.equal(g.hero.incarnationSpeedMul, CONFIG.skills.incarnation.speedMul);
  assert.equal(g.hero.incarnationInertia, CONFIG.skills.incarnation.inertia);
  assert.equal(g.skillCd[1], 30);
  assert.equal(g.skillCd[0], 0, 'Магический дождь не затронут');
  assert.equal(g.hud.slotFlash, 2);
  assert.equal(g.hero.active, true, 'герой остаётся игровым объектом и не считается мёртвым');
});

test('Во время работы умение нельзя повторно запустить, и оно требует ядро в билде', () => {
  const g = fakeGame();
  Game.prototype.castIncarnation.call(g);
  assert.equal(Game.prototype.castIncarnation.call(g), false);
  g.hero.incarnationT = 0; g.skillCd[1] = 0;
  g.build = { secondaryId: () => null };
  assert.equal(Game.prototype.castIncarnation.call(g), false);
  g.build = buildSkill();
  g.state = 'paused';
  assert.equal(Game.prototype.castIncarnation.call(g), false);
  g.state = 'playing'; g.hero.active = false;
  assert.equal(Game.prototype.castIncarnation.call(g), false);
  g.hero.active = true; g.hero.dashing = true;
  assert.equal(Game.prototype.castIncarnation.call(g), false, 'пока идёт рывок, нельзя ломать управление');
});

test('Во время Воплощения урон от врагов, снарядов и горения равен нулю', () => {
  const g = fakeGame(); Game.prototype.castIncarnation.call(g);
  const history = [];
  const bus = { emit(kind) { history.push(kind); } };
  const combat = new Combat(bus, g.hero, CONFIG.combat);
  const hp = g.hero.hp;
  assert.equal(combat.damageHero(200, { parryable: true }), false);
  assert.equal(combat.damageHero(200, {}), false);
  assert.equal(combat.damageHeroDot(200, { burn: true }), false);
  assert.equal(g.hero.hp, hp);
  assert.equal(g.hero.active, true);
  assert.ok(!history.includes('hero:died'));
  assert.ok(!history.includes('damage:dealt'));
});

test('После превращения обычные попадания и периодический урон снова работают', () => {
  const g = fakeGame(); Game.prototype.castIncarnation.call(g);
  const bus = { emit() {} }, combat = new Combat(bus, g.hero, CONFIG.combat);
  const arena = { resolveCircle() {} };
  g.hero.update(5, 0, 0, arena);
  assert.equal(g.hero.incarnationT, 0);
  const hp = g.hero.hp;
  assert.equal(combat.damageHero(10, {}), true);
  assert.equal(g.hero.hp, hp - 10);
  g.hero.invuln = 0;
  assert.equal(combat.damageHeroDot(3, { burn: true }), true);
  assert.equal(g.hero.hp, hp - 13);
});

test('Полет быстрее обычного бега, а на резком повороте комету заносит', () => {
  const arena = { resolveCircle() {} };
  const g = fakeGame(); Game.prototype.castIncarnation.call(g);
  const runner = new Hero(CONFIG.hero);
  for (let i = 0; i < 16; i++) {
    g.hero.update(0.1, 1, 0, arena);
    runner.update(0.1, 1, 0, arena);
  }
  assert.ok(g.hero.vx > runner.vx * 1.25, 'скорость после разгона должна быть заметно больше');
  const beforeVx = g.hero.vx;
  g.hero.update(0.12, 0, 1, arena);
  assert.ok(g.hero.vx > beforeVx * 0.5, 'сохраняется заметная боковая инерция');
  assert.ok(g.hero.vy > 0, 'начинает поворачивать');
  assert.ok(g.hero.x > 0 && g.hero.y > 0);
});

test('При отпускании стика комета не останавливается мгновенно, но постепенно тормозит', () => {
  const arena = { resolveCircle() {} };
  const g = fakeGame(); Game.prototype.castIncarnation.call(g);
  for (let i = 0; i < 12; i++) g.hero.update(0.1, 1, 0, arena);
  const before = g.hero.vx;
  g.hero.update(0.1, 0, 0, arena);
  assert.ok(g.hero.vx > 0 && g.hero.vx < before);
  assert.ok(g.hero.x > 0);
  for (let i = 0; i < 28; i++) g.hero.update(0.1, 0, 0, arena);
  assert.ok(g.hero.vx < before * 0.1);
});

test('Умение отрабатывает ровно 5 секунд игрового времени и не затрагивает дождь', () => {
  const g = fakeGame();
  Game.prototype.castIncarnation.call(g);
  const arena = { resolveCircle() {} };
  for (let i = 0; i < 49; i++) g.hero.update(0.1, 1, 0, arena);
  assert.ok(g.hero.incarnationT > 0 && g.hero.incarnationT < 0.11);
  g.hero.update(0.1, 1, 0, arena);
  assert.ok(g.hero.incarnationT <= 0.000001);
  const grid = g.build;
  const rain = {
    secondaryId(kind) { return kind === 'incarnation' ? grid.secondaryId(kind) : null; },
    modifiersFor(id) { return grid.modifiersFor(id); }, // как реальная сетка билда, для цвета слота
  };
  g.build = rain;
  Game.prototype.updateSkills.call(g, 1);
  assert.equal(g.skillCd[1], 29);
  assert.equal(g.skillCd[0], 0);
  assert.equal(g.hud.incarnationT, 0);
  assert.equal(g.hud.incarnationOn, true);
  assert.ok(Math.abs(g.hud.skillFrac1 - 1 / 30) < 1e-9);
});

test('Неуязвимая комета не мешает обычной перезарядке рывка', () => {
  const g = fakeGame(); Game.prototype.castIncarnation.call(g);
  const bus = { emit() {}, on() {} };
  const defense = new HeroDefense({ config: CONFIG, hero: g.hero, bus, stick: { active: true }, modifiers: () => null });
  const cd = defense.dashCd;
  assert.equal(defense.tryDash(1, 0), false, 'ускоренный полет исключает отдельный рывок');
  assert.equal(defense.dashCd, cd);
});

test('Перезапуск героя убирает комету и сбрасывает параметры движения', () => {
  const g = fakeGame(); Game.prototype.castIncarnation.call(g);
  g.hero.reset();
  assert.equal(g.hero.incarnationT, 0);
  assert.equal(g.hero.incarnationSpeedMul, 1);
  assert.equal(g.hero.incarnationInertia, 0);
  assert.equal(g.hero.active, true);
});
