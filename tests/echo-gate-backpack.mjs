// Regression: an optional WebGL preview must never prevent opening the backpack.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (path) => readFileSync(new URL('../echo-gate/src/' + path, import.meta.url), 'utf8')
  .replace(/^import .*?;\s*$/gm, '')
  .replace(/\bexport (?=(?:class|function|const|let|async))/g, '');

function setup(options = {}) {
  const frames = [], timers = [], cancelled = [];
  let iconCalls = 0, viewCalls = 0;
  const renderer = { domElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 320, height: 640 }) } };
  class FakeView {
    constructor() {
      viewCalls++;
      if (options.failView) throw new Error('WebGL context lost');
    }
    render() { if (options.failRender) throw new Error('WebGL render error'); }
  }
  const Ui = new Function('InventoryView', 'makeStaffIcons', 'requestAnimationFrame',
    'cancelAnimationFrame', 'setTimeout', 'clearTimeout', src('inventory_ui.js') + '\nreturn InventoryUi;')(
    FakeView,
    () => { iconCalls++; return { basic: 'data:image/png;base64,AAAA' }; },
    (fn) => { frames.push(fn); return frames.length; },
    (n) => cancelled.push(n),
    (fn) => { timers.push(fn); return timers.length; },
    (n) => cancelled.push(n),
  );
  const visible = new Set();
  const ui = Object.create(Ui.prototype);
  Object.assign(ui, {
    open: false, view: null, viewFailed: false,
    viewInitFrame: null, iconsInitTimer: null, iconsFailed: false,
    icons: null, grid: { scrollTop: 25 }, renderer,
    stage: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 320, height: 260 }) },
    root: { classList: {
      add(name) { visible.add(name); },
      remove(name) { visible.delete(name); },
    } },
    refresh() { this.refreshes = (this.refreshes || 0) + 1; },
    cancel() {}, hideDetail() {}, onClose() {},
  });
  return { ui, frames, timers, cancelled, visible, get iconCalls() { return iconCalls; }, get viewCalls() { return viewCalls; } };
}

test('backpack becomes visible before the expensive WebGL preview or staff icons', () => {
  const s = setup();
  assert.equal(s.ui.show(), true);
  assert.equal(s.visible.has('on'), true);
  assert.equal(s.ui.open, true);
  assert.equal(s.viewCalls, 0);
  assert.equal(s.iconCalls, 0);
  assert.equal(s.ui.render(0.016), false); // World renders until preview is ready.
  assert.equal(s.frames.length, 1);
  assert.equal(s.timers.length, 1);
  s.frames[0]();
  assert.equal(s.viewCalls, 1);
  assert.equal(s.ui.render(0.016), true);
  s.timers[0]();
  assert.equal(s.iconCalls, 1);
  s.ui.hide();
  assert.equal(s.ui.open, false);
  assert.equal(s.visible.has('on'), false);
});

test('WebGL preview creation failure leaves inventory usable; no reinitialization loop', () => {
  const s = setup({ failView: true });
  s.ui.show();
  s.frames[0]();
  assert.equal(s.ui.open, true);
  assert.equal(s.visible.has('on'), true);
  assert.equal(s.ui.viewFailed, true);
  assert.equal(s.ui.render(0.016), false);
  s.ui.hide();
  s.ui.show();
  assert.equal(s.ui.open, true);
  assert.equal(s.viewCalls, 1);
});

test('failure during render falls back to accessible item grid', () => {
  const s = setup({ failRender: true });
  s.ui.show();
  s.frames[0]();
  assert.equal(s.ui.render(0.016), false);
  assert.equal(s.ui.viewFailed, true);
  assert.equal(s.visible.has('on'), true);
});

test('closing inventory cancels delayed preview and icon generation', () => {
  const s = setup();
  s.ui.show();
  s.ui.hide();
  assert.deepEqual(s.cancelled, [1, 1]);
  s.frames[0]();
  s.timers[0]();
  assert.equal(s.viewCalls, 0);
  assert.equal(s.iconCalls, 0);
});

test('game keeps the hub unblocked when inventory opening throws; retry works', () => {
  const Game = new Function(src('game.js') + '\nreturn Game;')();
  const game = Object.create(Game.prototype);
  let hides = 0, toasts = 0, attempts = 0;
  Object.assign(game, {
    inHub: true, switching: false, invOpen: false, forgeOpen: false,
    stick: { cancel() {} },
    saveUi: { open: false },
    soulTallyUi: { open: false },
    invUi: {
      show() { attempts++; if (attempts === 1) throw new Error('3D failure'); return true; },
      hide() { hides++; },
    },
    toast() { toasts++; },
  });
  game.openInventory();
  assert.equal(game.invOpen, false);
  assert.equal(hides, 1);
  assert.equal(toasts, 1);
  game.openInventory();
  assert.equal(game.invOpen, true);
  assert.equal(attempts, 2);
});
