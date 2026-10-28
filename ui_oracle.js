// ОРАКЛ (временно): экран данных и отладки. Вкладки: «Данные» (итоги, забеги, экспорт), «Моды» и «Враги» (все настройки с иконкой).
// Правки настроек сохраняются на телефоне и применяются при каждом новом забеге. Удаляется вместе с oracle.js.
import { h } from './ui_dom.js';
import { icon } from './ui_icons.js';
import { numericLeaves } from './oracle.js';

const RES = { win: 'победа', dead: 'смерть', abort: 'прерван' };
const SRC = { shot: 'снаряд', pellet: 'дробь', laser: 'лазер', blades: 'клинки', aura: 'аура', absorption: 'поглощение', shock: 'молния', lightdash: 'рывок', burn: 'горение', frost: 'мороз', other: 'прочее' };
// Какие разделы конфига относятся к моду, помимо его собственного effect.
const EXTRA = {
  burn: ['burn'], frost: ['frost'], laser: ['laser'], shot: ['shot'], blades: ['blades'], aura: ['aura'], phantom: ['phantom'],
  lightning: ['shock'], kinetic: ['kinetic', 'lightdash'], rain: ['skills.rain'], absorption: ['absorption'], gravity: ['gravity'],
};

const ENEMY = {
  beetle: 'Жук', hunter: 'Охотник', shooter: 'Жук-стрелок', bull: 'Бык', frozenArcher: 'Замёрзший лучник', frozenSoldier: 'Замёрзший воин',
  frozenRam: 'Замёрзший таран', rockBeetle: 'Мошка', apostleRisen: 'Апостол: Воскресший', apostleFaith: 'Апостол: Вера', apostleTruth: 'Апостол: Истина',
  apostleForce: 'Апостол: Сила', apostleLove: 'Апостол: Любовь', apotheosis: 'Апофеоз', skeletonArcher: 'Скелет-стрелок', skeletonWarrior: 'Скелет-воин',
  skeletonRam: 'Скелет-таран', tartas: 'Тартас',
};
const enemyName = (cfg, key) => ENEMY[key] || (cfg.enemies[key] && cfg.enemies[key].name) || key;

const fmtTime = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

export class OracleScreen {
  constructor(root, oracle, config) {
    this.o = oracle;
    this.cfg = config;
    this.tab = 'data';
    this.body = h('div', { class: 'or-body' });
    this.tabs = [['data', 'Данные'], ['mods', 'Моды'], ['enemies', 'Враги']].map(([id, name]) =>
      h('button', { type: 'button', class: 'or-tab', 'data-tab': id, onclick: () => { this.tab = id; this.render(); } }, name));
    this.card = h('div', { class: 'card', id: 'oracle-card' },
      h('h2', {}, 'Оракл'),
      h('div', { class: 'or-tabs' }, ...this.tabs),
      this.body,
      h('div', { class: 'row' }, h('button', { type: 'button', id: 'oracle-back', onclick: () => this.hide() }, 'Назад')));
    this.el = h('div', { id: 'oracle-screen', hidden: '' }, this.card);
    root.append(this.el);
  }

  show() { this.el.hidden = false; this.render(); }
  hide() { this.el.hidden = true; }

  render() {
    for (const t of this.tabs) t.classList.toggle('on', t.dataset.tab === this.tab);
    this.body.replaceChildren();
    if (this.tab === 'data') this.renderData();
    else if (this.tab === 'mods') this.renderMods();
    else this.renderEnemies();
  }

  row(a, b) { return h('div', { class: 'or-row' }, h('span', {}, a), h('b', {}, String(b))); }

  renderData() {
    const o = this.o;
    const S = o.summary();
    const B = this.body;
    B.append(h('p', {}, 'Забегов: ' + S.runs + ' (законченных ' + S.done + ', прерванных ' + S.aborted + ')'));
    if (S.done) {
      B.append(
        this.row('Победы', S.wins + ' из ' + S.done),
        this.row('Среднее время', fmtTime(S.avgTime)),
        this.row('Средний урон в секунду', S.avgDps),
        this.row('Средний пик (5 с)', S.avgPeak),
        this.row('Максимальный удар', S.maxHit),
        this.row('Среднее убийств', S.avgKills),
        this.row('Средняя волна', S.avgWave),
        this.row('Получено урона (средн.)', S.avgTaken));
      if (S.bossRuns) B.append(this.row('Босс: среднее время боя', fmtTime(S.avgBoss) + ' (' + S.bossRuns + ')'));
      if (S.mods.length) {
        B.append(h('h3', {}, 'Урон в секунду: с модом / без'));
        for (const m of S.mods) B.append(this.row(m.name + ' (' + m.nWith + '/' + m.nWithout + ')', m.dpsWith + ' / ' + (m.dpsWithout == null ? '–' : m.dpsWithout)));
      }
      if (S.enemies.length) {
        B.append(h('h3', {}, 'Время жизни под огнём, с'));
        for (const e of S.enemies) B.append(this.row(enemyName(this.cfg, e.key), (e.ttk == null ? '–' : e.ttk) + ' (' + e.kills + ')'));
      }
    }
    B.append(h('h3', {}, 'Последние забеги'));
    const last = o.runs.slice(-10).reverse();
    if (!last.length) B.append(h('p', {}, 'Пока пусто: сыграй забег до победы или смерти.'));
    for (const r of last) {
      const top = Object.keys(r.bySrc).sort((a, b) => r.bySrc[b] - r.bySrc[a]).slice(0, 3).map((k) => (SRC[k] || k) + ' ' + Math.round(r.bySrc[k] / Math.max(1, r.dmg) * 100) + '%').join(', ');
      B.append(h('div', { class: 'or-run' },
        h('b', {}, (RES[r.result] || r.result) + ' · ' + fmtTime(r.time) + ' · волна ' + r.wave + ' · ур. ' + r.level),
        h('span', {}, 'урон/с ' + r.dps + ', пик ' + r.dps5 + ', удар ' + r.maxHit + (r.boss != null ? ', босс ' + fmtTime(r.boss) : '')),
        h('span', {}, top)));
    }
    this.area = h('textarea', { class: 'or-area', readonly: '', rows: '5' });
    this.msg = h('p', { class: 'or-msg' });
    B.append(
      h('div', { class: 'row' },
        h('button', { type: 'button', id: 'oracle-copy', onclick: () => this.copy() }, 'Скопировать'),
        h('button', { type: 'button', id: 'oracle-save', onclick: () => this.download() }, 'Скачать')),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'secondary', onclick: () => this.showText() }, 'Показать текст'),
        h('button', { type: 'button', class: 'secondary', id: 'oracle-clear', onclick: () => { if (confirm('Стереть все забеги?')) { o.clearRuns(); this.render(); } } }, 'Очистить')),
      this.msg, this.area);
  }

  showText() {
    this.area.value = this.o.exportText();
    this.area.style.display = 'block';
  }

  copy() {
    const text = this.o.exportText();
    const done = (ok) => { this.msg.textContent = ok ? 'Скопировано: вставь в чат' : 'Не вышло скопировать: нажми «Показать текст» и выдели вручную'; };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => done(true), () => this.fallbackCopy(text, done));
    else this.fallbackCopy(text, done);
  }

  fallbackCopy(text, done) {
    this.showText();
    try { this.area.focus(); this.area.select(); done(document.execCommand('copy')); } catch (e) { done(false); }
  }

  download() {
    try {
      const url = URL.createObjectURL(new Blob([this.o.exportText()], { type: 'application/json' }));
      const a = h('a', { href: url, download: 'oracle-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.json' });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      this.msg.textContent = 'Файл сохранён';
    } catch (e) { this.msg.textContent = 'Не вышло скачать: используй «Скопировать»'; }
  }

  field(path) {
    const o = this.o;
    const input = h('input', { type: 'number', step: 'any', value: String(o.get(path)), 'data-path': path, inputmode: 'decimal' });
    const line = h('label', { class: 'or-field' + (o.changed(path) ? ' ch' : '') }, h('span', {}, path.split('.').slice(-2).join('.')), input);
    input.addEventListener('change', () => {
      const v = parseFloat(input.value);
      if (!Number.isFinite(v)) { input.value = String(o.get(path)); return; }
      o.set(path, v);
      line.classList.toggle('ch', o.changed(path));
    });
    return line;
  }

  group(iconName, color, title, sections) {
    const paths = [];
    for (const s of sections) for (const l of numericLeaves(this.o.get(s), s, 3)) if (!paths.includes(l.path)) paths.push(l.path);
    const d = h('details', { class: 'or-group' });
    const head = h('summary', {});
    if (iconName) head.append(h('span', { class: 'or-ico' }, icon(iconName)));
    else head.append(h('span', { class: 'or-dot', style: 'background:' + (color || '#889') }));
    head.append(h('span', { class: 'or-title' }, title), h('i', {}, paths.length ? String(paths.length) : '–'));
    d.append(head);
    let built = false;
    d.addEventListener('toggle', () => {
      if (!d.open || built) return;
      built = true;
      if (!paths.length) d.append(h('p', {}, 'Настроек нет'));
      for (const p of paths) d.append(this.field(p));
    });
    return d;
  }

  renderMods() {
    this.body.append(h('p', {}, 'Все числа можно менять. Правки сохраняются и применяются к каждому новому забегу. Жёлтым выделено изменённое.'));
    for (const key of Object.keys(this.cfg.mods)) {
      const def = this.cfg.mods[key];
      const extra = EXTRA[def.effect.kind] || [];
      this.body.append(this.group(def.icon, null, def.name, ['mods.' + key + '.effect', ...extra]));
    }
    this.body.append(this.resetRow());
  }

  renderEnemies() {
    this.body.append(h('p', {}, 'Здоровье, скорость, урон и атаки врагов.'));
    for (const key of Object.keys(this.cfg.enemies)) {
      const def = this.cfg.enemies[key];
      this.body.append(this.group(null, def.color, enemyName(this.cfg, key), ['enemies.' + key]));
    }
    this.body.append(this.resetRow());
  }

  resetRow() {
    return h('div', { class: 'row' }, h('button', { type: 'button', class: 'secondary', id: 'oracle-reset', onclick: () => { this.o.resetSettings(); this.render(); } }, 'Сбросить все правки'));
  }
}
