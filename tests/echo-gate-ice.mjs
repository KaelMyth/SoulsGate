import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../echo-gate/src/config.js';
import { resetStatus, applyIce, tickStatus, applyFire, burnTick, applyShock, gravityFactor } from '../echo-gate/src/status.js';

const ice = CONFIG.ice;
const mk = (o = {}) => { const e = { ...o }; resetStatus(e); return e; };

test('лёд: стак замедляет на 3 секунды, повторное попадание обновляет время', () => {
  const e = mk();
  assert.equal(applyIce(e, ice), 'chill');
  assert.ok(Math.abs(tickStatus(e, 1, ice) - 0.7) < 1e-9);
  assert.equal(applyIce(e, ice), 'chill'); // второй стак: время снова 3 с
  assert.ok(Math.abs(tickStatus(e, 2.9, ice) - 0.4) < 1e-9);
  assert.equal(tickStatus(e, 0.2, ice), 1); // вышло
  assert.equal(e.chill, 0);
});

test('лёд: три стака замораживают на секунду, потом стаки с нуля', () => {
  const e = mk();
  applyIce(e, ice); applyIce(e, ice);
  assert.equal(applyIce(e, ice), 'freeze');
  assert.equal(tickStatus(e, 0.5, ice), 0);
  assert.equal(applyIce(e, ice), 'immune'); // замороженный не копит стаки
  assert.equal(tickStatus(e, 0.6, ice), 0); // доморозка до конца секунды
  assert.equal(tickStatus(e, 0.1, ice), 1);
  assert.equal(applyIce(e, ice), 'chill');
  assert.equal(e.chill, 1);
});

test('лёд: огромных врагов только замедляет, не замораживает', () => {
  const e = mk({ heavy: true });
  for (let i = 0; i < 6; i++) assert.equal(applyIce(e, ice), 'chill');
  assert.equal(e.chill, 2);
  assert.ok(tickStatus(e, 0.1, ice) > 0);
});

test('огонь: стаки поджога, урон горения, на третьем стаке взрыв', () => {
  const fire = CONFIG.fire;
  const e = mk();
  assert.equal(applyFire(e, fire), 'burn');
  assert.ok(Math.abs(burnTick(e, 1, fire, 1) - 0.25) < 1e-9); // 1 стак: 0.25 выстрела за секунду
  assert.equal(applyFire(e, fire), 'burn');
  assert.ok(Math.abs(burnTick(e, 1, fire, 2) - 1.0) < 1e-9); // 2 стака, урон 2: 0.25*2*1*2
  assert.equal(applyFire(e, fire), 'explode');
  assert.equal(e.burn, 0); assert.equal(e.burnT, 0);
  assert.equal(burnTick(e, 1, fire, 1), 0);
});

test('огонь: горение гаснет через burnTime, последний тик не больше остатка', () => {
  const fire = CONFIG.fire;
  const e = mk();
  applyFire(e, fire);
  let total = 0;
  for (let i = 0; i < 100; i++) total += burnTick(e, 0.1, fire, 1);
  assert.ok(Math.abs(total - fire.burnDps * fire.burnTime) < 1e-6);
  assert.equal(e.burn, 0);
});

test('электричество: два стака вызывают цепную молнию, стак гаснет через stackTime', () => {
  const el = CONFIG.electric;
  const e = mk();
  assert.equal(applyShock(e, el), 'shock');
  assert.equal(e.shock, 1);
  tickStatus(e, el.stackTime + 0.1, CONFIG.ice);
  assert.equal(e.shock, 0);
  applyShock(e, el);
  assert.equal(applyShock(e, el), 'chain');
  assert.equal(e.shock, 0);
});

test('гравитация: снаряд почти стоит, потом резкий рывок до maxSpeed', () => {
  const G = CONFIG.gravity;
  assert.ok(Math.abs(gravityFactor(G, 0) - G.startSpeed) < 1e-9);
  assert.ok(gravityFactor(G, G.rampTime * G.holdFraction * 0.99) < 0.2); // конец задержки: почти стоит
  assert.ok(gravityFactor(G, G.rampTime * 0.9) > gravityFactor(G, G.rampTime * 0.8));
  assert.ok(Math.abs(gravityFactor(G, G.rampTime + 1) - G.maxSpeed) < 1e-9);
  // путь до цели 6 м при обычной скорости 16 м/с: с задержкой заметно дольше 0.375 с
  let t = 0, d = 0;
  while (d < 6 && t < 5) { t += 0.005; d += 16 * gravityFactor(G, t) * 0.005; }
  assert.ok(t > 0.9 && t < 1.6, String(t));
});

test('огонь: взрыв при смерти включён по умолчанию', () => {
  assert.ok(CONFIG.fire.deathScale > 0 && CONFIG.fire.deathScale <= 1.5);
});

test('лёд по ступеням заточки: на средней два стака замораживают, на высшей шипы при смерти', async () => {
  const { tierOf } = await import('../echo-gate/src/staff_tiers.js');
  assert.deepEqual([0, 4, 5, 9, 10].map((s) => tierOf(CONFIG, s)), [0, 0, 1, 1, 2]);
  const stacks = (t) => ({ ...ice, stacksToFreeze: ice.tiers[t].stacksToFreeze });
  const e0 = mk(); applyIce(e0, stacks(0)); assert.equal(applyIce(e0, stacks(0)), 'chill');
  const e1 = mk(); applyIce(e1, stacks(1)); assert.equal(applyIce(e1, stacks(1)), 'freeze');
  assert.deepEqual(ice.tiers.map((t) => t.deathSpikes), [0, 0, 4]);
});
