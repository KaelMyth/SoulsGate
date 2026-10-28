// ОРАКЛ: временная надстройка для сбора данных о забегах и подстройки баланса. Потом удаляется целиком:
// файлы oracle.js, ui_oracle.js, папка oracle/, кнопка в ui_mode-screen.js, строки «oracle» в game.js, события 'run:ended'/'run:started'.
// Копит итоги каждого забега (победа, смерть, прерван) в браузере, считает средние и отдаёт данные текстом.
// Игру не меняет: только слушает события шины. Единственное исключение: сохранённые правки настроек применяются к конфигу.

import { BUILD } from './config_game.js';

const RUNS_KEY = 'sg.oracle.runs';
const OVR_KEY = 'sg.oracle.overrides';
const MAX_RUNS = 300;

function store() {
  try {
    const s = window.localStorage;
    s.getItem('__probe__');
    return s;
  } catch (e) {
    return { getItem() { return null; }, setItem() {}, removeItem() {} };
  }
}

function getPath(obj, path) { return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj); }
function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((o, k) => o[k], obj)[last] = value;
}

/** Все числовые настройки объекта: [{ path, value }], до глубины depth. Строки, цвета и массивы пропускаются. */
export function numericLeaves(obj, prefix, depth = 3) {
  const out = [];
  if (!obj || typeof obj !== 'object' || depth < 0) return out;
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    const p = prefix ? prefix + '.' + k : k;
    if (typeof v === 'number' && Number.isFinite(v)) out.push({ path: p, value: v });
    else if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...numericLeaves(v, p, depth - 1));
  }
  return out;
}

/** Какой источник урона: по флагам объекта-источника. */
function classify(src) {
  if (!src) return 'other';
  if (src.laser) return 'laser';
  if (src.pellet) return 'pellet';
  if (src.blade) return 'blades';
  if (src.aura) return 'aura';
  if (src.shock) return 'shock';
  if (src.lightning) return 'lightdash';
  if (src.burn) return 'burn';
  if (src.frost || src.steam) return 'frost';
  return 'shot'; // основной снаряд и всё остальное от героя
}

const r2 = (x) => Math.round(x * 100) / 100;

export class Oracle {
  constructor(game) {
    this.g = game;
    this.cfg = game.config;
    this.storage = store();
    this.runs = this.loadRuns();
    this.defaults = {};   // значения настроек до правок Оракла: { путь: число }
    this.overrides = {};  // правки Оракла: { путь: число }
    this.typeOf = new Map(); // def врага → ключ
    this.collectDefaults();
    this.loadOverrides();
    this.applyOverrides();
    this.cur = null;
    this.hit = new WeakMap(); // враг → время первого удара (для времени жизни под огнём)
    const bus = game.bus;
    bus.on('run:started', () => { this.applyOverrides(); this.begin(); });
    bus.on('run:restarted', () => { this.applyOverrides(); this.begin(); });
    bus.on('run:ended', ({ result }) => this.finish(result));
    bus.on('damage:dealt', (e) => this.onDamage(e));
    bus.on('enemy:killed', (e) => this.onKill(e));
    bus.on('boss:intro-finished', () => { if (this.cur && this.cur.bossAt == null) this.cur.bossAt = this.g.runTime; });
    bus.on('boss:defeated', () => this.bossDown());
    bus.on('apotheosis:victory', () => this.bossDown());
  }

  // ---------- настройки ----------

  collectDefaults() {
    const c = this.cfg;
    const take = (obj, prefix) => { for (const l of numericLeaves(obj, prefix, 4)) this.defaults[l.path] = l.value; };
    take(c.enemies, 'enemies');
    take(c.mods, 'mods');
    for (const k of ['burn', 'frost', 'laser', 'shot', 'blades', 'aura', 'phantom', 'shock', 'kinetic', 'lightdash', 'skills', 'attack', 'hero', 'block', 'dash']) if (c[k]) take(c[k], k);
    for (const k of Object.keys(c.enemies)) this.typeOf.set(c.enemies[k], k);
  }

  loadOverrides() {
    try {
      const raw = this.storage.getItem(OVR_KEY);
      const data = raw ? JSON.parse(raw) : {};
      for (const p in data) if (p in this.defaults && Number.isFinite(data[p])) this.overrides[p] = data[p];
    } catch (e) { /* нет хранилища: работаем с настройками из конфига */ }
  }

  saveOverrides() {
    try {
      if (Object.keys(this.overrides).length) this.storage.setItem(OVR_KEY, JSON.stringify(this.overrides));
      else this.storage.removeItem(OVR_KEY);
    } catch (e) { /* не критично */ }
  }

  applyOverrides() {
    for (const p in this.overrides) {
      try { if (getPath(this.cfg, p) !== this.overrides[p]) setPath(this.cfg, p, this.overrides[p]); } catch (e) { /* путь исчез: пропускаем */ }
    }
  }

  get(path) { return getPath(this.cfg, path); }

  /** Изменить настройку из меню Оракла. */
  set(path, value) {
    if (!(path in this.defaults) || !Number.isFinite(value)) return;
    setPath(this.cfg, path, value);
    if (value === this.defaults[path]) delete this.overrides[path]; else this.overrides[path] = value;
    this.saveOverrides();
    this.g.bus.emit('config:changed', { path, value });
  }

  resetSettings() {
    for (const p in this.overrides) { try { setPath(this.cfg, p, this.defaults[p]); } catch (e) { /* пропуск */ } }
    this.overrides = {};
    this.saveOverrides();
    this.g.bus.emit('config:changed', { path: 'oracle.reset', value: 0 });
  }

  changed(path) { return path in this.overrides; }

  // ---------- забег ----------

  begin() {
    this.cur = {
      t0: Date.now(), mode: this.g.mode || '?',
      total: 0, taken: 0, maxHit: 0, maxHitSrc: '', bySrc: {}, bucket: [], kills: 0,
      types: {}, bossAt: null, bossTime: null,
    };
  }

  onDamage(e) {
    const c = this.cur;
    if (!c) return;
    if (e.targetKind === 'hero') { c.taken += e.amount; return; }
    if (e.targetKind !== 'enemy') return;
    const a = e.amount;
    if (!(a > 0)) return;
    const src = classify(e.source);
    c.total += a;
    c.bySrc[src] = (c.bySrc[src] || 0) + a;
    if (a > c.maxHit) { c.maxHit = a; c.maxHitSrc = src; }
    const sec = Math.floor(this.g.runTime || 0);
    c.bucket[sec] = (c.bucket[sec] || 0) + a;
    if (!this.hit.has(e.target)) this.hit.set(e.target, this.g.runTime || 0);
  }

  onKill({ enemy }) {
    const c = this.cur;
    if (!c) return;
    c.kills++;
    const key = this.typeOf.get(enemy.def) || '?';
    const t = c.types[key] || (c.types[key] = { n: 0, ttk: 0, ttkN: 0 });
    t.n++;
    const first = this.hit.get(enemy);
    if (first !== undefined) { t.ttk += Math.max(0, (this.g.runTime || 0) - first); t.ttkN++; this.hit.delete(enemy); }
  }

  bossDown() {
    const c = this.cur;
    if (c && c.bossAt != null && c.bossTime == null) c.bossTime = r2((this.g.runTime || 0) - c.bossAt);
  }

  /** Снимок билда: моды с родителем и ядром-владельцем, пассивы. */
  buildSnapshot() {
    const b = this.g.build;
    const items = [];
    try {
      const tree = b.tree();
      b.cells.forEach((cell, i) => {
        if (!cell.mod) return;
        const o = tree.owner.get(i);
        const p = tree.parent.get(i);
        items.push({ k: cell.mod.key || cell.mod.id, i, p: p === undefined ? null : p, o: o === undefined ? null : String(o) });
      });
    } catch (e) { /* дерево не собралось: пропускаем */ }
    const passives = [];
    try {
      (b.pcells || []).forEach((c, i) => { if (c.mod) passives.push({ k: c.mod.key || c.mod.id, i }); });
    } catch (e) { /* пропуск */ }
    return { items, passives };
  }

  finish(result) {
    const c = this.cur;
    if (!c) return;
    this.cur = null;
    const time = this.g.runTime || 0;
    if (time < 1 && result === 'abort') return; // пустой запуск без игры не пишем
    let peak = 0;
    for (let s = 0; s < c.bucket.length; s++) {
      let sum = 0;
      for (let k = 0; k < 5; k++) sum += c.bucket[s + k] || 0;
      if (sum > peak) peak = sum;
    }
    const types = {};
    for (const k in c.types) types[k] = { n: c.types[k].n, ttk: c.types[k].ttkN ? r2(c.types[k].ttk / c.types[k].ttkN) : null };
    const bySrc = {};
    for (const k in c.bySrc) bySrc[k] = Math.round(c.bySrc[k]);
    const g = this.g;
    const run = {
      at: new Date(c.t0).toISOString(), mode: c.mode, result,
      time: r2(time), wave: g.spawner ? g.spawner.wave : 0, level: g.xp ? g.xp.level : 0, kills: c.kills,
      dmg: Math.round(c.total), dps: r2(c.total / Math.max(1, time)), dps5: r2(peak / 5),
      maxHit: r2(c.maxHit), maxHitSrc: c.maxHitSrc, taken: Math.round(c.taken), hp: Math.round(g.hero.hp), maxHp: Math.round(g.hero.maxHp),
      boss: c.bossTime, bySrc, types, build: this.buildSnapshot(),
      tuned: Object.keys(this.overrides).length,
    };
    this.runs.push(run);
    if (this.runs.length > MAX_RUNS) this.runs.splice(0, this.runs.length - MAX_RUNS);
    this.saveRuns();
    return run;
  }

  // ---------- хранение ----------

  loadRuns() {
    try {
      const raw = this.storage.getItem(RUNS_KEY);
      const a = raw ? JSON.parse(raw) : [];
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }

  saveRuns() {
    try { this.storage.setItem(RUNS_KEY, JSON.stringify(this.runs)); } catch (e) { /* не критично */ }
  }

  clearRuns() {
    this.runs = [];
    this.saveRuns();
  }

  // ---------- итоги ----------

  /** Средние по законченным забегам (победа или смерть) и срез «с модом / без мода». */
  summary() {
    const done = this.runs.filter((r) => r.result === 'win' || r.result === 'dead');
    const n = done.length;
    const avg = (f) => (n ? r2(done.reduce((s, r) => s + f(r), 0) / n) : 0);
    const out = {
      runs: this.runs.length, done: n, aborted: this.runs.length - n,
      wins: done.filter((r) => r.result === 'win').length,
      avgTime: avg((r) => r.time), avgDps: avg((r) => r.dps), avgPeak: avg((r) => r.dps5),
      maxHit: n ? Math.max(...done.map((r) => r.maxHit)) : 0,
      avgKills: avg((r) => r.kills), avgWave: avg((r) => r.wave), avgTaken: avg((r) => r.taken),
      bossRuns: done.filter((r) => r.boss != null).length,
      avgBoss: 0, mods: [], enemies: [],
    };
    const bossRuns = done.filter((r) => r.boss != null);
    if (bossRuns.length) out.avgBoss = r2(bossRuns.reduce((s, r) => s + r.boss, 0) / bossRuns.length);
    const has = (r, k) => r.build.items.some((i) => i.k === k) || r.build.passives.some((i) => i.k === k);
    for (const k of Object.keys(this.cfg.mods)) {
      const w = done.filter((r) => has(r, k));
      const wo = done.filter((r) => !has(r, k));
      if (!w.length) continue;
      const m = (a) => (a.length ? r2(a.reduce((s, r) => s + r.dps, 0) / a.length) : null);
      out.mods.push({ key: k, name: this.cfg.mods[k].name, nWith: w.length, dpsWith: m(w), nWithout: wo.length, dpsWithout: m(wo) });
    }
    const t = {};
    for (const r of done) for (const k in r.types) {
      const e = t[k] || (t[k] = { n: 0, ttk: 0, ttkN: 0 });
      e.n += r.types[k].n;
      if (r.types[k].ttk != null) { e.ttk += r.types[k].ttk * r.types[k].n; e.ttkN += r.types[k].n; }
    }
    out.enemies = Object.keys(t).map((k) => ({ key: k, kills: t[k].n, ttk: t[k].ttkN ? r2(t[k].ttk / t[k].ttkN) : null }));
    return out;
  }

  /** Данные одним текстом (JSON): итоги, правки настроек, забеги. Это вставляют в чат для разбора. */
  exportText() {
    return JSON.stringify({
      oracle: 1, build: BUILD,
      exportedAt: new Date().toISOString(), summary: this.summary(), tuned: this.overrides, runs: this.runs,
    });
  }
}
