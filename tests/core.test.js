import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/core/events.js';
import { FixedStepper, FpsMeter } from '../src/core/loop.js';
import { Pool } from '../src/core/pool.js';

// ---------- EventBus ----------
test('шина: on/emit передаёт payload и имя', () => {
  const bus = new EventBus();
  const got = [];
  bus.on('a', (p, name) => got.push([p, name]));
  bus.emit('a', 1);
  bus.emit('b', 2);
  assert.deepEqual(got, [[1, 'a']]);
});

test('шина: отписка работает, once срабатывает один раз', () => {
  const bus = new EventBus();
  let n = 0;
  const off = bus.on('a', () => n++);
  let m = 0;
  bus.once('a', () => m++);
  bus.emit('a');
  bus.emit('a');
  off();
  bus.emit('a');
  assert.equal(n, 2);
  assert.equal(m, 1);
});

test('шина: отписка внутри обработчика не ломает остальных', () => {
  const bus = new EventBus();
  const order = [];
  const off = bus.on('a', () => { order.push('first'); off(); });
  bus.on('a', () => order.push('second'));
  bus.emit('a');
  bus.emit('a');
  assert.deepEqual(order, ['first', 'second', 'second']);
});

test('шина: tap видит все события', () => {
  const bus = new EventBus();
  const seen = [];
  bus.tap((name, p) => seen.push([name, p]));
  bus.emit('x', 1);
  bus.emit('y', 2);
  assert.deepEqual(seen, [['x', 1], ['y', 2]]);
});

// ---------- FixedStepper ----------
const stepCfg = () => ({ hz: 60, maxFrameMs: 250, maxStepsPerFrame: 5 });

test('цикл: 60 Гц кадры дают ~60 шагов в секунду', () => {
  const s = new FixedStepper(stepCfg());
  let n = 0;
  for (let i = 0; i < 600; i++) s.advance(1000 / 60, () => n++);
  assert.ok(Math.abs(n - 600) <= 1, 'шагов: ' + n);
});

test('цикл: на экране 144 Гц логика всё равно идёт 60 шагов в секунду', () => {
  const s = new FixedStepper(stepCfg());
  let n = 0;
  for (let i = 0; i < 1440; i++) s.advance(1000 / 144, () => n++); // 10 секунд
  assert.ok(Math.abs(n - 600) <= 1, 'шагов: ' + n);
});

test('цикл: на 30 FPS за кадр два шага, итог тот же', () => {
  const s = new FixedStepper(stepCfg());
  let n = 0;
  for (let i = 0; i < 300; i++) s.advance(1000 / 30, () => n++);
  assert.ok(Math.abs(n - 600) <= 1, 'шагов: ' + n);
});

test('цикл: долгий кадр не вызывает лавину шагов, отставание отбрасывается', () => {
  const s = new FixedStepper(stepCfg());
  let n = 0;
  const steps = s.advance(5000, () => n++);
  assert.equal(steps, 5);
  assert.equal(s.dropped, 1);
  assert.ok(s.alpha >= 0 && s.alpha < 1);
});

test('цикл: alpha всегда в диапазоне [0, 1)', () => {
  const s = new FixedStepper(stepCfg());
  for (let i = 0; i < 500; i++) {
    s.advance(5 + Math.random() * 40, () => {});
    assert.ok(s.alpha >= 0 && s.alpha < 1, 'alpha ' + s.alpha);
  }
});

// ---------- FpsMeter ----------
function feed(meter, t, frames, ms) {
  for (let i = 0; i < frames; i++) {
    t += ms;
    meter.frame(t, ms);
  }
  return t;
}

test('FPS: ровные 60 кадров дают ~60 и минимум ~60', () => {
  const m = new FpsMeter(500, 1500);
  feed(m, 0, 300, 1000 / 60);
  assert.ok(Math.abs(m.fps - 60) < 1.5, 'fps ' + m.fps);
  assert.ok(Math.abs(m.minFps - 60) < 2, 'min ' + m.minFps);
});

test('FPS: провал после прогрева попадает в минимум', () => {
  const m = new FpsMeter(500, 1500);
  let t = feed(m, 0, 180, 1000 / 60); // 3 с нормально
  t = feed(m, t, 60, 1000 / 20);      // 3 с по 20 FPS
  assert.ok(m.minFps < 25, 'min ' + m.minFps);
});

test('FPS: подтормаживание в первые полторы секунды в минимум не идёт', () => {
  const m = new FpsMeter(500, 1500);
  let t = feed(m, 0, 18, 1000 / 20); // ~0.9 с по 20 FPS
  t = feed(m, t, 300, 1000 / 60);
  assert.ok(m.minFps > 55, 'min ' + m.minFps);
});

test('FPS: interrupt не засчитывает простой как просадку', () => {
  const m = new FpsMeter(500, 1500);
  let t = feed(m, 0, 180, 1000 / 60);
  m.interrupt();
  t += 20000; // 20 секунд в фоне
  t = feed(m, t, 120, 1000 / 60);
  assert.ok(m.minFps > 55, 'min ' + m.minFps);
});

// ---------- Pool ----------
test('пул: объекты переиспользуются и сбрасываются', () => {
  let created = 0;
  const pool = new Pool(() => ({ v: 0, id: ++created }), (o) => { o.v = 0; }, 2);
  assert.equal(pool.available, 2);
  const a = pool.acquire();
  a.v = 5;
  assert.equal(pool.active, 1);
  pool.release(a);
  assert.equal(a.v, 0);
  assert.equal(pool.active, 0);
  const b = pool.acquire();
  assert.equal(b, a, 'тот же объект возвращён из пула');
  assert.equal(created, 2, 'новые объекты не создавались');
});

test('пул: когда пусто, создаёт новый объект', () => {
  const pool = new Pool(() => ({}), null, 0);
  const a = pool.acquire();
  const b = pool.acquire();
  assert.notEqual(a, b);
  assert.equal(pool.active, 2);
});
