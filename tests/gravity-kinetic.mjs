// Запуск: node --experimental-default-type=module --test tests/gravity-kinetic.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../config_game.js';
import { BuildGrid } from '../build_grid.js';
import { canPlace } from '../build_rules.js';
import { HeroDefense } from '../systems_defense.js';
import { Game } from '../game.js';
import { createEnemy, initEnemy, updateEnemy } from '../world_enemy.js';
import { pointInPoly } from '../world_arena.js';

function makeBuild() {
  const grid = new BuildGrid(7);
  assert.ok(grid.placeMod({ key: 'kinetic', def: CONFIG.mods.kinetic }, 3, 3));
  const ok = canPlace(grid, CONFIG.mods.gravity, 3, 4);
  assert.equal(ok.ok, true, ok.reason);
  grid.placeMod({ key: 'gravity', def: CONFIG.mods.gravity }, 3, 4);
  return grid;
}

function defenseSetup(gravity) {
  const listeners = {};
  const events = [];
  const bus = {
    on(event, fn) { (listeners[event] ||= []).push(fn); },
    emit(event, data) { events.push({ event, data }); for (const fn of listeners[event] || []) fn(data); },
  };
  const hero = { active: true, x: 0, y: 0, radius: 12, facing: 0, invuln: 0,
    dashing: false, dashVx: 0, dashVy: 0, vx: 0, vy: 0, glideTime: 0 };
  const defense = new HeroDefense({ config: CONFIG, hero, bus, stick: { active: true }, modifiers: () => null });
  defense.kinetic = true;
  defense.gravityDashEnabled = gravity;
  return { hero, bus, defense, events };
}

function enemy(x, y = 0) {
  const e = createEnemy();
  initEnemy(e, { radius: 12, hp: 100, speed: 100, keepDistance: 0 }, x, y);
  e.active = true;
  return e;
}

test('Гравитация прикрепляется к вторичному ядру Кинетического рывка', () => {
  const grid = makeBuild();
  const id = grid.secondaryId('kinetic');
  assert.ok(id);
  const mods = grid.modifiersFor(id);
  assert.equal(mods.gravity.count, 1);
});

test('Обычный рывок по-прежнему движется, один раз посылает событие прибытия', () => {
  const s = defenseSetup(false);
  assert.equal(s.defense.tryDash(1, 0), true);
  assert.equal(s.hero.dashing, true);
  assert.ok(s.hero.dashVx > 0);
  s.defense.update(CONFIG.dash.duration + 0.01);
  s.defense.update(0.01);
  assert.equal(s.hero.dashing, false);
  assert.equal(s.events.filter(e => e.event === 'dash:landed').length, 1);
  assert.equal(s.events.filter(e => e.event === 'dash:gravity-started').length, 0);
  s.defense.update(0.2);
  assert.equal(s.events.filter(e => e.event === 'dash:landed').length, 1);
});

test('Обычное прибытие отбрасывает врагов по радиусу и не замедляет их', () => {
  const near = enemy(50), far = enemy(180);
  const fake = {
    config: CONFIG, hero: { active: true, x: 0, y: 0 },
    defense: { kinetic: true, dashSeq: 1, dashX: 1, dashY: 0 },
    kineticMods: null, enemies: { items: [near, far] },
    kineticEl: () => ({ bd: 0, bi: 0, fr: 0, st: 0, kind: 0 }),
    renderer: null, burst() {},
  };
  Game.prototype.kineticLanding.call(fake, false);
  assert.ok(near.kbVx > 0);
  assert.equal(far.kbVx, 0);
  assert.equal(near.gravityDashSlowT, 0);
  const initial = near.kbVx;
  Game.prototype.kineticLanding.call(fake, false);
  assert.equal(near.kbVx, initial, 'один импульс на рывок');
});

test('Гравитационный рывок сначала создаёт аномалию, затем телепортирует без рывковой скорости', () => {
  const s = defenseSetup(true);
  assert.equal(s.defense.tryDash(1, 0), true);
  assert.equal(s.defense.gravityDashCharging, true);
  assert.equal(s.hero.dashVx, 0);
  const started = s.events.find(e => e.event === 'dash:gravity-started');
  assert.ok(started);
  assert.equal(started.data.distance, CONFIG.dash.distance * CONFIG.kinetic.distanceScale * CONFIG.kinetic.gravityDistanceMul);
  s.defense.update(CONFIG.kinetic.gravityCharge + 0.001);
  assert.equal(s.hero.dashing, false);
  assert.equal(s.events.filter(e => e.event === 'dash:gravity-arrived').length, 1);
  assert.equal(s.events.filter(e => e.event === 'dash:landed').length, 0);
});

test('Место телепорта ограничено стеной и краем арены', () => {
  const g = { active: false };
  const h = { x: 0, y: 0, radius: 12 };
  const fake = {
    hero: h, config: CONFIG,
    arena: { left: -200, right: 200, top: -200, bottom: 200, zone: null,
      circleHitsRock(x, y, r) { return Math.abs(x - 115) < 20 + r && Math.abs(y) < 20 + r; } },
    gravityDash: g,
  };
  Game.prototype.startGravityDash.call(fake, { dirX: 1, dirY: 0, distance: 500, seq: 11 });
  assert.ok(g.x > 0 && g.x < 100);
  assert.equal(g.y, 0);
  assert.equal(g.seq, 11);
  assert.equal(g.charging, true);
});

test('В момент прибытия персонаж телепортируется без интерполяции и наносит один удар', () => {
  const s = { active: true, charging: true, seq: 2, x: 90, y: 40, t: 0 };
  const hero = { x: 0, y: 0, vx: 5, vy: 9, glideTime: 0.3,
    place(x, y) { this.x = this.prevX = x; this.y = this.prevY = y; } };
  let impacts = 0;
  const fake = { hero, gravityDash: s, arena: { resolveCircle() {} }, kineticLanding(gravity) {
    assert.equal(gravity, true); impacts++;
  } };
  Game.prototype.finishGravityDash.call(fake, { seq: 99 });
  assert.equal(impacts, 0, 'старое событие не телепортирует');
  Game.prototype.finishGravityDash.call(fake, { seq: 2 });
  assert.equal(impacts, 1);
  assert.deepEqual([hero.x, hero.y, hero.prevX, hero.prevY], [90, 40, 90, 40]);
  assert.equal(hero.glideTime, 0);
  assert.equal(s.charging, false);
  Game.prototype.finishGravityDash.call(fake, { seq: 2 });
  assert.equal(impacts, 1);
});

test('Гравитационное прибытие сильнее толкает и накладывает временное замедление', () => {
  const e = enemy(70);
  const fake = { config: CONFIG, hero: { active: true, x: 0, y: 0 },
    defense: { kinetic: true, dashSeq: 5, dashX: 1, dashY: 0 },
    kineticMods: null, enemies: { items: [e] },
    kineticEl: () => ({ bd: 0, bi: 0, fr: 0, st: 0, kind: 0 }),
    renderer: null, burst() {} };
  Game.prototype.kineticLanding.call(fake, true);
  assert.ok(e.kbVx > 0);
  assert.equal(e.gravityDashSlowT, CONFIG.kinetic.gravitySlowTime);
  assert.equal(e.gravityDashSlowMul, CONFIG.kinetic.gravitySlowMul);
  const v = e.kbVx;
  Game.prototype.kineticLanding.call(fake, true);
  assert.equal(e.kbVx, v, 'по одной цели нельзя ударить дважды одним приземлением');
});

test('Гравитационное замедление накладывается поверх Мороза и затем спадает', () => {
  const e = enemy(0);
  e.speedMul = 0.5; // Мороз
  e.gravityDashSlowT = 1;
  e.gravityDashSlowMul = 0.55;
  const hero = { x: 200, y: 0, radius: 12 };
  const arena = { segmentBlocked() { return false; }, resolveCircle() {} };
  updateEnemy(e, 0.1, hero, arena);
  assert.ok(Math.abs(e.x - 100 * 0.1 * 0.5 * 0.55) < 0.0001);
  updateEnemy(e, 1, hero, arena);
  assert.equal(e.gravityDashSlowT, 0);
  assert.ok(e.x > 20, 'после окончания дополнительное замедление исчезает');
  initEnemy(e, { radius: 12, hp: 100, speed: 100 }, 0, 0);
  assert.equal(e.gravityDashSlowT, 0);
  assert.equal(e.gravityDashSlowMul, 1);
});


test('Молния вместе с Гравитацией не перехватывает телепорт цепным рывком', () => {
  const s = defenseSetup(true);
  let plans = 0;
  s.defense.lightDash = true;
  s.defense.lightning = { plan() { plans++; return true; } };
  s.defense.tryDash(0, 1);
  assert.equal(plans, 0);
  assert.equal(s.defense.gravityDashCharging, true);
  assert.ok(s.events.some(e => e.event === 'dash:started'), 'другие моды рывка получают событие запуска');
});

test('Лазер на гравитационном рывке направлен в предсказанную аномалию', () => {
  const fake = {
    config: CONFIG,
    defense: { kinetic: true, gravityDashCharging: true, dashX: 1, dashY: 0 },
    kineticMods: { laser: {} }, lightdash: { active: false },
    hero: { x: 0, y: 0, radius: 12 },
    arena: { left: -500, right: 500, top: -500, bottom: 500, circleHitsRock() { return false; } },
    gravityDash: { active: true, x: 245, y: 10 },
    dashBeams: [],
    kineticEl() { return { kind: 0 }; },
  };
  Game.prototype.startDashBeam.call(fake);
  assert.equal(fake.dashBeams.length, 1);
  assert.equal(fake.dashBeams[0].x1, 245);
  assert.equal(fake.dashBeams[0].y1, 10);
});

test('Границы полигона финального острова также ограничивают точку телепортации', () => {
  const hero = { x: 0, y: 0, radius: 10 };
  const zone = { left: -100, right: 100, top: -100, bottom: 100,
    poly: [{ x: -80, y: -60 }, { x: 60, y: -60 }, { x: 0, y: 60 }] };
  const fake = { hero, config: CONFIG, gravityDash: {},
    arena: { left: -500, right: 500, top: -500, bottom: 500, zone,
      circleHitsRock() { return false; } } };
  Game.prototype.startGravityDash.call(fake, { dirX: 1, dirY: 0, distance: 500, seq: 4 });
  assert.ok(fake.gravityDash.x < 45);
  assert.ok(fake.gravityDash.x > 0);
});

test('После завершения эффекта гравитационный коэффициент сбрасывается', () => {
  const e = enemy(0), hero = { x: 200, y: 0, radius: 10 };
  const arena = { segmentBlocked() { return false; }, resolveCircle() {} };
  e.gravityDashSlowT = 0.05;
  e.gravityDashSlowMul = CONFIG.kinetic.gravitySlowMul;
  updateEnemy(e, 0.1, hero, arena);
  assert.equal(e.gravityDashSlowT, 0);
  assert.equal(e.gravityDashSlowMul, 1);
});
