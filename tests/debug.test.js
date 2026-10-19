import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config/game.js';
import { TUNABLES } from '../src/config/tunables.js';
import {
  getPath, setPath, formatValue, snapshot, loadOverrides, saveOverrides,
} from '../src/debug/tunables.js';
import { Renderer } from '../src/render/renderer.js';
import { Arena } from '../src/world/arena.js';
import { Hero } from '../src/world/hero.js';
import { Camera } from '../src/world/camera.js';

const clone = (o) => JSON.parse(JSON.stringify(o));

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    has: (k) => m.has(k),
  };
}

test('ползунки: каждый path существует в конфиге и стартовое значение в пределах min..max', () => {
  for (const t of TUNABLES) {
    const v = getPath(CONFIG, t.path);
    assert.equal(typeof v, 'number', t.path);
    assert.ok(v >= t.min && v <= t.max, t.path + ' = ' + v + ' вне ' + t.min + '..' + t.max);
    assert.ok(t.max > t.min && t.step > 0, t.path);
  }
});

test('getPath/setPath работают по вложенным путям', () => {
  const o = { a: { b: { c: 1 } } };
  assert.equal(getPath(o, 'a.b.c'), 1);
  setPath(o, 'a.b.c', 5);
  assert.equal(o.a.b.c, 5);
});

test('formatValue берёт число знаков из шага', () => {
  assert.equal(formatValue({ step: 5 }, 180), '180');
  assert.equal(formatValue({ step: 0.01 }, 0.1), '0.10');
  assert.equal(formatValue({ step: 0.5 }, 2), '2.0');
});

test('сохранение: пишется только отличающееся от стартовых значений', () => {
  const cfg = clone(CONFIG);
  const defaults = clone(CONFIG);
  const st = memoryStorage();
  saveOverrides(cfg, defaults, TUNABLES, st, 'k');
  assert.equal(st.has('k'), false, 'ничего не менялось, ничего не пишем');
  cfg.hero.speed = 250;
  saveOverrides(cfg, defaults, TUNABLES, st, 'k');
  assert.deepEqual(JSON.parse(st.getItem('k')), { 'hero.speed': 250 });
});

test('загрузка: применяет сохранённое, обрезает по границам, игнорирует мусор', () => {
  const st = memoryStorage();
  st.setItem('k', JSON.stringify({ 'hero.speed': 99999, 'stick.radius': 'abc', 'нет.такого': 1, 'camera.smoothTime': 0.2 }));
  const cfg = clone(CONFIG);
  const n = loadOverrides(cfg, TUNABLES, st, 'k');
  assert.equal(n, 2);
  assert.equal(cfg.hero.speed, 400);
  assert.equal(cfg.stick.radius, CONFIG.stick.radius);
  assert.equal(cfg.camera.smoothTime, 0.2);
});

test('загрузка: битый JSON не роняет игру', () => {
  const st = memoryStorage();
  st.setItem('k', '{не json');
  assert.equal(loadOverrides(clone(CONFIG), TUNABLES, st, 'k'), 0);
});

test('сохранение: хранилище, которое бросает ошибки, не ломает игру', () => {
  const bad = { getItem() { throw new Error('нельзя'); }, setItem() { throw new Error('нельзя'); }, removeItem() { throw new Error('нельзя'); } };
  const cfg = clone(CONFIG);
  cfg.hero.speed = 250;
  saveOverrides(cfg, clone(CONFIG), TUNABLES, bad, 'k');
  assert.equal(loadOverrides(cfg, TUNABLES, bad, 'k'), 0);
});

test('snapshot отдаёт все значения ползунков', () => {
  const s = snapshot(CONFIG, TUNABLES);
  assert.equal(Object.keys(s).length, TUNABLES.length);
  assert.equal(s['hero.speed'], CONFIG.hero.speed);
});

// ---------- Отрисовка без браузера: проверяем, что кадр рисуется без ошибок ----------
function recordingCanvas(w, h) {
  const calls = [];
  const ctx = new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...args) => { calls.push(k); }),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  return { calls, canvas: { clientWidth: w, clientHeight: h, width: 0, height: 0, getContext: () => ctx } };
}

test('отрисовка: кадр рисуется без ошибок, размер холста учитывает потолок DPR', () => {
  globalThis.devicePixelRatio = 3;
  const cfg = clone(CONFIG);
  const arena = new Arena(cfg.arena);
  const hero = new Hero(cfg.hero);
  const camera = new Camera(cfg.camera);
  const stick = { active: true, baseX: 100, baseY: 600, kx: 20, ky: -10 };
  const { canvas, calls } = recordingCanvas(375, 812);
  const r = new Renderer(canvas, cfg, { arena, hero, camera, stick });
  r.resize();
  assert.equal(canvas.width, 375 * 2, 'DPR 3 ограничен до maxDpr = 2');
  assert.equal(canvas.height, 812 * 2);
  camera.snapTo(hero.x, hero.y, arena);
  r.draw(0.5);
  assert.ok(calls.includes('fillRect') && calls.includes('ellipse') && calls.includes('arc'));
  cfg.render.maxDpr = 1;
  r.resize();
  assert.equal(canvas.width, 375);
  delete globalThis.devicePixelRatio;
});

test('отрисовка: скалы вне экрана не рисуются', () => {
  const cfg = clone(CONFIG);
  cfg.arena.rocks = [{ x: 0, y: 0, r: 40 }, { x: 0, y: 800, r: 40 }];
  const arena = new Arena(cfg.arena);
  const hero = new Hero(cfg.hero);
  const camera = new Camera(cfg.camera);
  const { canvas, calls } = recordingCanvas(375, 812);
  const r = new Renderer(canvas, cfg, { arena, hero, camera, stick: { active: false } });
  r.resize();
  camera.snapTo(0, 0, arena);
  r.draw(0);
  // По 2 многоугольника (тело и грань) на каждую видимую скалу: видна одна из двух.
  assert.equal(calls.filter((c) => c === 'closePath').length, 2);
});
