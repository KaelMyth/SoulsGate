import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRoll, ease, tier } from '../echo-gate/src/roulette.js';

test('roll: winner under the mark, numbers in range', () => {
  let s = 3; const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
  for (let i = 0; i < 50; i++) {
    const r = makeRoll(rnd);
    assert.equal(r.value, r.items[r.win]);
    assert.ok(r.items.every((n) => n >= 1 && n <= 99));
    const left = r.win * r.pitch, right = left + r.cellW;
    assert.ok(r.offset > left && r.offset < right, 'offset stays inside the winning cell');
  }
});

test('ease: monotonic 0..1 and slows at the end', () => {
  assert.equal(ease(0), 0); assert.equal(ease(1), 1); assert.equal(ease(2), 1);
  assert.ok(ease(0.5) > 0.9 && ease(0.9) < 1 && ease(0.9) > ease(0.5));
  assert.equal(tier(99), 'gold'); assert.equal(tier(1), 'blue');
});
