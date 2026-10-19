import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/core/events.js';
import { Stick, computeStick } from '../src/input/stick.js';

// ---------- математика ----------
const out = () => ({ x: 0, y: 0, mag: 0, kx: 0, ky: 0 });

test('стик: внутри мёртвой зоны вектор нулевой', () => {
  const o = computeStick(3, 0, 56, 0.12, out());
  assert.equal(o.mag, 0);
  assert.equal(o.x, 0);
});

test('стик: полное отклонение даёт длину 1, дальше радиуса не растёт', () => {
  const o = computeStick(500, 0, 56, 0.12, out());
  assert.ok(Math.abs(o.x - 1) < 1e-9);
  assert.equal(o.y, 0);
  assert.ok(Math.abs(o.kx - 56) < 1e-9, 'ручка не уходит за радиус');
});

test('стик: направление сохраняется по диагонали, длина не больше 1', () => {
  const o = computeStick(100, 100, 56, 0.12, out());
  assert.ok(Math.abs(Math.hypot(o.x, o.y) - 1) < 1e-9);
  assert.ok(Math.abs(o.x - o.y) < 1e-9);
});

test('стик: сила растёт плавно после мёртвой зоны', () => {
  const half = computeStick(28, 0, 56, 0.12, out()).mag;
  assert.ok(half > 0.4 && half < 0.5, 'mag ' + half);
});

// ---------- события касаний (подделка элемента без браузера) ----------
function fakeEl() {
  const l = {};
  return {
    addEventListener(t, f) { (l[t] = l[t] || []).push(f); },
    fire(t, e) { for (const f of l[t] || []) f(e); },
    getBoundingClientRect() { return { left: 0, top: 0 }; },
    setPointerCapture() {},
    releasePointerCapture() {},
  };
}
const ev = (over) => Object.assign(
  { pointerId: 1, pointerType: 'touch', button: 0, clientX: 100, clientY: 200, timeStamp: 1000, cancelable: true, preventDefault() {} },
  over,
);
function setup() {
  const el = fakeEl();
  const bus = new EventBus();
  const events = [];
  bus.tap((name, p) => events.push([name, p]));
  const stick = new Stick(el, bus, { radius: 56, deadzone: 0.12 });
  return { el, bus, events, stick };
}

test('касание: стик появляется там, где коснулись, и шлёт stick:press', () => {
  const { el, events, stick } = setup();
  el.fire('pointerdown', ev({ clientX: 120, clientY: 300 }));
  assert.equal(stick.active, true);
  assert.equal(stick.baseX, 120);
  assert.equal(stick.baseY, 300);
  assert.equal(events[0][0], 'stick:press');
});

test('движение: сдвиг пальца вправо даёт вектор вправо', () => {
  const { el, stick } = setup();
  el.fire('pointerdown', ev());
  el.fire('pointermove', ev({ clientX: 100 + 56 }));
  assert.ok(Math.abs(stick.x - 1) < 1e-9);
  assert.equal(stick.y, 0);
});

test('второй палец игнорируется полностью', () => {
  const { el, events, stick } = setup();
  el.fire('pointerdown', ev({ pointerId: 1, clientX: 100, clientY: 200 }));
  el.fire('pointerdown', ev({ pointerId: 2, clientX: 300, clientY: 400 }));
  el.fire('pointermove', ev({ pointerId: 2, clientX: 350, clientY: 400 }));
  assert.equal(stick.baseX, 100, 'стик не перепрыгнул на второй палец');
  assert.equal(stick.x, 0, 'второй палец не двигает стик');
  el.fire('pointerup', ev({ pointerId: 2 }));
  assert.equal(stick.active, true, 'отпускание второго пальца не отпускает стик');
  assert.equal(events.filter((e) => e[0] === 'stick:press').length, 1);
  assert.equal(events.filter((e) => e[0] === 'stick:release').length, 0);
});

test('отпускание: ровно одно stick:release с длительностью, стик уже сброшен', () => {
  const { el, bus, events, stick } = setup();
  let activeInHandler = null;
  bus.on('stick:release', () => { activeInHandler = stick.active; });
  el.fire('pointerdown', ev({ timeStamp: 1000 }));
  el.fire('pointermove', ev({ clientX: 156, timeStamp: 1100 }));
  el.fire('pointerup', ev({ timeStamp: 1400 }));
  el.fire('lostpointercapture', ev({ timeStamp: 1401 })); // браузер шлёт его после pointerup
  const rel = events.filter((e) => e[0] === 'stick:release');
  assert.equal(rel.length, 1);
  assert.equal(rel[0][1].duration, 400);
  assert.equal(rel[0][1].cancelled, false);
  assert.ok(Math.abs(rel[0][1].dirX - 1) < 1e-9, 'направление в момент отпускания передано');
  assert.equal(activeInHandler, false);
  assert.equal(stick.x, 0);
  assert.equal(stick.active, false);
});

test('отмена касания (pointercancel) отпускает стик с cancelled', () => {
  const { el, events } = setup();
  el.fire('pointerdown', ev());
  el.fire('pointercancel', ev());
  const rel = events.find((e) => e[0] === 'stick:release');
  assert.equal(rel[1].cancelled, true);
});

test('правая кнопка мыши стик не включает', () => {
  const { el, stick } = setup();
  el.fire('pointerdown', ev({ pointerType: 'mouse', button: 2 }));
  assert.equal(stick.active, false);
});

test('после отпускания можно коснуться снова', () => {
  const { el, stick } = setup();
  el.fire('pointerdown', ev({ pointerId: 1 }));
  el.fire('pointerup', ev({ pointerId: 1 }));
  el.fire('pointerdown', ev({ pointerId: 7, clientX: 50, clientY: 60 }));
  assert.equal(stick.active, true);
  assert.equal(stick.baseX, 50);
});

test('cancel() без касания ничего не шлёт, с касанием шлёт release', () => {
  const { el, events, stick } = setup();
  stick.cancel();
  assert.equal(events.length, 0);
  el.fire('pointerdown', ev());
  stick.cancel(5000);
  assert.equal(events.filter((e) => e[0] === 'stick:release').length, 1);
  assert.equal(stick.active, false);
});
