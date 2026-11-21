import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../echo-gate/src/config.js';
import { resetStatus, applyIce, tickStatus, applyFire, burnTick, applyShock } from '../echo-gate/src/status.js';

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
