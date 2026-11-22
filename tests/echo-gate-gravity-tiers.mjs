import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../echo-gate/src/config.js';
import { auraSlow, holePull } from '../echo-gate/src/status.js';

test('базовая пауза выстрела 0.75', () => assert.equal(CONFIG.attack.interval, 0.75));
test('искажение: вне радиуса 1, у героя 50%, плавно между', () => {
  const A = CONFIG.gravity.aura;
  assert.equal(auraSlow(A, A.radius + 1), 1);
  assert.ok(Math.abs(auraSlow(A, 0) - 0.5) < 1e-9);
  let prev = 1;
  for (let d = A.radius; d >= 0; d -= 0.25) { const f = auraSlow(A, d); assert.ok(f <= prev + 1e-9); prev = f; }
});
test('чёрная дыра тянет к центру и не перелетает его', () => {
  const H = CONFIG.gravity.hole;
  assert.deepEqual(holePull(H, 10, 0, 0, 0, 0.1), { dx: 0, dz: 0 });
  const m = holePull(H, 2, 0, 0, 0, 0.1);
  assert.ok(m.dx < 0 && m.dz === 0);
  const n = holePull(H, 0.01, 0, 0, 0, 1);
  assert.ok(Math.abs(n.dx) <= 0.01 + 1e-9);
});
test('+10: пауза дыры 1.1 с', () => assert.equal(CONFIG.gravity.hole.interval, 1.1));
