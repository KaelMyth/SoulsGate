// Настройки (из главного меню). Пока одно временное: сколько штук каждого мода лежит в пуле наград за уровень.
// Значения хранятся в браузере и применяются к config.rewards.pool. На релизе прототипа экран заменим настоящими настройками.
import { h } from './ui_dom.js';

const KEY = 'sg.rewardPool';

export class SettingsScreen {
  constructor(root, config) {
    this.cfg = config;
    this.defaults = Object.assign({}, config.rewards.pool);
    this.load();
    this.list = h('div', { class: 'set-list' });
    this.card = h('div', { class: 'card', id: 'settings-card' },
      h('h2', {}, 'Настройки'),
      h('p', {}, 'Сколько штук каждого мода в пуле наград за уровень (0 = не выпадает)'),
      this.list,
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'secondary', onclick: () => this.reset() }, 'Сбросить'),
        h('button', { type: 'button', id: 'settings-back', onclick: () => this.hide() }, 'Назад')));
    this.el = h('div', { id: 'settings-screen', hidden: '' }, this.card);
    root.append(this.el);
    this.rebuild();
  }

  load() {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      for (const k in saved) {
        if (!(k in this.cfg.mods) || !Number.isFinite(saved[k])) continue;
        const v = Math.max(0, Math.min(30, saved[k] | 0));
        if (v) this.cfg.rewards.pool[k] = v; else delete this.cfg.rewards.pool[k]; // 0 сохраняется явно, иначе вернётся значение из конфига
      }
    } catch (e) { /* хранилища может не быть: работаем со значениями из конфига */ }
  }

  save() {
    try {
      const all = {};
      for (const k of Object.keys(this.cfg.mods)) all[k] = this.cfg.rewards.pool[k] || 0;
      window.localStorage.setItem(KEY, JSON.stringify(all));
    } catch (e) { /* не критично */ }
  }

  set(key, n) {
    const v = Math.max(0, Math.min(30, n));
    if (v) this.cfg.rewards.pool[key] = v; else delete this.cfg.rewards.pool[key];
    this.save();
    this.rebuild();
  }

  reset() {
    const p = this.cfg.rewards.pool;
    for (const k in p) delete p[k];
    Object.assign(p, this.defaults);
    this.save();
    this.rebuild();
  }

  rebuild() {
    this.list.replaceChildren();
    for (const key of Object.keys(this.cfg.mods)) {
      const n = this.cfg.rewards.pool[key] || 0;
      this.list.append(h('div', { class: 'set-row', 'data-mod': key },
        h('span', { class: 'set-name' }, this.cfg.mods[key].name),
        h('button', { type: 'button', class: 'set-btn', onclick: () => this.set(key, n - 1) }, '−'),
        h('b', { class: 'set-n' }, String(n)),
        h('button', { type: 'button', class: 'set-btn', onclick: () => this.set(key, n + 1) }, '+')));
    }
  }

  show() { this.el.hidden = false; }
  hide() { this.el.hidden = true; }
}
