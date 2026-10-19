// Сквозная проверка без браузера: подделка DOM, настоящие Game, Stick, цикл, панель и отрисовка.
// Ловит опечатки и ошибки в связях между частями, которые не видны в модульных тестах.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config/game.js';
import { TUNABLES } from '../src/config/tunables.js';

const clone = (o) => JSON.parse(JSON.stringify(o));

// ---------- мини-DOM ----------
class FakeEl {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.attrs = {};
    this.listeners = {};
    this.className = '';
    this.hidden = false;
    this.value = '';
    this.textContent = '';
    this.clientWidth = 375;
    this.clientHeight = 812;
    this.width = 0;
    this.height = 0;
    this.classes = new Set();
    const self = this;
    this.classList = {
      toggle(c, on) { if (on === undefined ? !self.classes.has(c) : on) self.classes.add(c); else self.classes.delete(c); },
      contains: (c) => self.classes.has(c),
    };
  }
  setAttribute(k, v) {
    this.attrs[k] = v;
    if (k === 'hidden') this.hidden = true;
    if (k === 'value') this.value = v;
  }
  append(...kids) { for (const k of kids) this.children.push(k); }
  addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
  fire(t, e) { for (const f of this.listeners[t] || []) f(e); }
  focus() {}
  select() {}
  getBoundingClientRect() { return { left: 0, top: 0 }; }
  setPointerCapture() {}
  releasePointerCapture() {}
  getContext() { return this.ctx; }
  find(pred, acc = []) {
    if (pred(this)) acc.push(this);
    for (const c of this.children) if (c instanceof FakeEl) c.find(pred, acc);
    return acc;
  }
}

function setupEnv() {
  const calls = [];
  const transforms = [];
  const ctx = new Proxy({}, {
    get: (t, k) => {
      if (k in t) return t[k];
      if (k === 'setTransform') return (...a) => { transforms.push(a); };
      return (...a) => { calls.push(k); };
    },
    set: (t, k, v) => { t[k] = v; return true; },
  });
  const canvas = new FakeEl('canvas');
  canvas.ctx = ctx;
  const probe = new FakeEl('div');
  const uiRoot = new FakeEl('div');

  const set = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  const docListeners = {};
  set('document', {
    hidden: false,
    createElement: (tag) => new FakeEl(tag),
    addEventListener: (t, f) => { (docListeners[t] = docListeners[t] || []).push(f); },
    removeEventListener() {},
  });
  set('window', { addEventListener() {}, localStorage: undefined });
  set('getComputedStyle', () => ({ paddingTop: '47px', paddingRight: '0px', paddingBottom: '34px', paddingLeft: '0px' }));
  set('navigator', {});
  set('devicePixelRatio', 3);
  let rafCb = null;
  set('requestAnimationFrame', (cb) => { rafCb = cb; return 1; });
  const frame = (t) => { const cb = rafCb; rafCb = null; cb(t); };
  return { canvas, probe, uiRoot, calls, transforms, frame, docListeners };
}

function teardownEnv() {
  for (const k of ['document', 'window', 'getComputedStyle', 'navigator', 'devicePixelRatio', 'requestAnimationFrame']) {
    delete globalThis[k];
  }
}

const memoryStorage = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
};

async function makeGame(env, cfgOverride) {
  const { Game } = await import('../src/game.js');
  const config = clone(CONFIG);
  if (cfgOverride) cfgOverride(config);
  return new Game({
    canvas: env.canvas,
    uiRoot: env.uiRoot,
    probe: env.probe,
    config,
    defaults: clone(CONFIG),
    tunables: TUNABLES,
    build: 'тест',
    storage: memoryStorage(),
    storageKey: 'test',
  });
}

const touch = (over) => Object.assign(
  { pointerId: 1, pointerType: 'touch', button: 0, clientX: 187, clientY: 600, timeStamp: 0, cancelable: true, preventDefault() {} },
  over,
);

// Прогнать N кадров на 60 Гц, начиная с t0. Возвращает последнее время.
function run(env, t0, frames, ms = 1000 / 60) {
  let t = t0;
  for (let i = 0; i < frames; i++) { t += ms; env.frame(t); }
  return t;
}

test('сборка: игра создаётся, цикл идёт, кадры рисуются без ошибок', async () => {
  const env = setupEnv();
  try {
    const game = await makeGame(env);
    game.start();
    run(env, 0, 120);
    assert.ok(env.calls.includes('fillRect'));
    assert.equal(env.canvas.width, 375 * 2, 'DPR 3 ограничен потолком 2');
    assert.equal(game.insets.top, 47, 'безопасная зона iPhone прочитана');
    assert.equal(game.insets.bottom, 34);
  } finally { teardownEnv(); }
});

test('сборка: касание и сдвиг пальца двигают героя, отпускание останавливает и шлёт событие', async () => {
  const env = setupEnv();
  try {
    const game = await makeGame(env);
    const seen = [];
    game.bus.on('stick:release', (p) => seen.push(p));
    game.start();
    let t = run(env, 0, 10);
    env.canvas.fire('pointerdown', touch({ timeStamp: t }));
    env.canvas.fire('pointermove', touch({ clientX: 187 + 80, timeStamp: t })); // дальше радиуса: полный газ вправо
    const x0 = game.hero.x;
    t = run(env, t, 60);
    assert.ok(game.hero.x - x0 > 120, 'за секунду герой прошёл ' + (game.hero.x - x0));
    assert.ok(Math.abs(game.hero.y) < 1e-6, 'по вертикали не сместился');
    env.canvas.fire('pointerup', touch({ timeStamp: t }));
    t = run(env, t, 30);
    const xStop = game.hero.x;
    run(env, t, 30);
    assert.equal(game.hero.x, xStop, 'после отпускания стоит');
    assert.equal(seen.length, 1);
    assert.ok(seen[0].duration > 900, 'длительность удержания ' + seen[0].duration);
  } finally { teardownEnv(); }
});

test('экран: герой в центре, камера следует, край арены не уходит за экран', async () => {
  const env = setupEnv();
  try {
    const game = await makeGame(env);
    game.start();
    run(env, 0, 5);
    // Последняя матрица мира: [a, b, c, d, e, f] в пикселях устройства.
    const dpr = game.renderer.dpr;
    // Матрица мира отличается от экранной (стик): её масштаб = (ширина экрана / ширина обзора) * dpr.
    const worldScale = (375 / 420) * dpr;
    const worldT = () => env.transforms.filter((m) => Math.abs(m[0] - worldScale) < 1e-9).pop();
    let [a, , , d, e, f] = worldT();
    // Герой в (0,0) должен оказаться в центре экрана.
    assert.ok(Math.abs(e - (375 / 2) * dpr) < 1, 'центр по X: ' + e);
    assert.ok(Math.abs(f - (812 / 2) * dpr) < 1, 'центр по Y: ' + f);
    assert.ok(Math.abs(a - (375 / 420) * dpr) < 1e-9, 'масштаб');

    // Гоним героя в левый верхний угол арены: камера упирается в край, но не уходит за него.
    game.hero.place(-590, -890);
    game.camera.snapTo(-590, -890, game.arena);
    run(env, 100, 3);
    [a, , , d, e, f] = worldT();
    const leftEdgeScreen = a * game.arena.left + e;
    const topEdgeScreen = d * game.arena.top + f;
    assert.ok(leftEdgeScreen >= -1e-6, 'левый край арены виден на экране: ' + leftEdgeScreen);
    assert.ok(topEdgeScreen >= -1e-6, 'верхний край арены виден на экране: ' + topEdgeScreen);
    assert.ok(leftEdgeScreen < 1, 'камера прижата к краю');
  } finally { teardownEnv(); }
});

test('панель: открывается, показывает FPS и события, ползунок меняет конфиг и шлёт config:changed', async () => {
  const env = setupEnv();
  try {
    const game = await makeGame(env);
    game.start();
    let t = run(env, 0, 60);
    env.canvas.fire('pointerdown', touch({ timeStamp: t }));
    env.canvas.fire('pointerup', touch({ timeStamp: t + 100 }));

    const button = env.uiRoot.children[0];
    const panelEl = env.uiRoot.children[1];
    assert.equal(panelEl.hidden, true, 'панель закрыта по умолчанию');
    button.fire('click', {});
    assert.equal(panelEl.hidden, false);
    const stats = panelEl.find((el) => el.attrs.id === 'dbg-stats')[0];
    assert.match(stats.textContent, /FPS/);
    assert.match(stats.textContent, /объектов в мире 15/);
    assert.match(stats.textContent, /stick:release/);
    game.panel.toggle(); // закрыть, чтобы остановить таймер обновления
    assert.equal(panelEl.hidden, true);

    const changes = [];
    game.bus.on('config:changed', (e) => changes.push(e));
    const sliders = panelEl.find((el) => el.attrs.type === 'range');
    assert.equal(sliders.length, TUNABLES.length);
    const speed = sliders[0];
    speed.value = '300';
    speed.fire('input', {});
    assert.equal(game.config.hero.speed, 300);
    assert.deepEqual(changes[0], { path: 'hero.speed', value: 300 });

    // Смена потолка DPR сразу пересоздаёт размер холста.
    const dprSlider = sliders[sliders.length - 1];
    dprSlider.value = '1';
    dprSlider.fire('input', {});
    assert.equal(env.canvas.width, 375);

    speed.fire('change', {}); // сохранение при окончании движения ползунка
    game.panel.resetParams();
    assert.equal(game.config.hero.speed, CONFIG.hero.speed);
    assert.equal(game.config.render.maxDpr, CONFIG.render.maxDpr);
    assert.equal(speed.value, String(CONFIG.hero.speed), 'ползунок вернулся на место');
  } finally { teardownEnv(); }
});

test('панель: «Скопировать параметры» заполняет поле текстом с версией сборки', async () => {
  const env = setupEnv();
  try {
    const game = await makeGame(env);
    game.panel.copyParams();
    const box = env.uiRoot.children[1].find((el) => el.attrs.id === 'dbg-copy')[0];
    assert.equal(box.hidden, false);
    assert.match(box.value, /^тест\n\{/);
    assert.match(box.value, /"hero.speed": 180/);
  } finally { teardownEnv(); }
});

test('свёрнули приложение: стик отпускается сам', async () => {
  const env = setupEnv();
  try {
    const game = await makeGame(env);
    const seen = [];
    game.bus.on('stick:release', (p) => seen.push(p));
    game.start();
    env.canvas.fire('pointerdown', touch());
    globalThis.document.hidden = true;
    for (const f of env.docListeners.visibilitychange || []) f();
    assert.equal(game.stick.active, false);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].cancelled, true);
  } finally { teardownEnv(); }
});
