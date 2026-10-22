// Поле билда: квадратная сетка, нарисованная ромбами (квадраты, повёрнутые на 45°).
// Тут только показ: что лежит в клетках, берётся из BuildGrid, данные ядра из config.cores.
import { h, clear } from './ui_dom.js';
import { icon } from './ui_icons.js';
import { coreStats } from './build_cores.js';

export class BuilderUI {
  constructor(grid, config) {
    this.grid = grid;
    this.config = config;
    this.selected = null; // id выбранного ядра
    this.board = h('div', { class: 'board' });
    this.wrap = h('div', { class: 'board-wrap' }, this.board);
    this.info = h('div', { class: 'core-info' });
    this.root = h('div', { class: 'builder' }, this.wrap, this.info);
    this.rebuild();
  }

  /** Пересобрать поле (новый размер или новая расстановка). */
  rebuild() {
    const g = this.grid;
    if (this.selected && !g.coreById(this.selected)) this.selected = null;
    if (this.wrap.style) this.wrap.style.setProperty('--n', String(g.size));
    this.wrap.setAttribute('data-size', String(g.size));
    clear(this.board);
    this.cellEls = [];
    for (const c of g.cells) {
      const el = h('button', {
        type: 'button', class: 'cell', 'data-x': String(c.x), 'data-y': String(c.y),
        'aria-label': c.core ? c.core.def.name : 'Пустая клетка',
      });
      if (c.core) {
        el.classList.toggle('core', true);
        el.setAttribute('data-core', c.core.id);
        el.append(icon(c.core.def.icon));
        el.addEventListener('click', () => this.select(c.core.id));
      }
      this.cellEls.push(el);
      this.board.append(el);
    }
    this.refresh();
  }

  select(id) {
    this.selected = this.selected === id ? null : id;
    this.refresh();
  }

  /** Обновить подсветку и карточку данных (значения берутся из живого конфига). */
  refresh() {
    this.cellEls.forEach((el, i) => {
      const core = this.grid.cells[i].core;
      el.classList.toggle('selected', !!core && core.id === this.selected);
    });
    clear(this.info);
    const core = this.selected && this.grid.coreById(this.selected);
    if (!core) {
      this.info.append(h('p', { class: 'hint' }, 'Нажми на ядро, чтобы увидеть его данные'));
      return;
    }
    this.info.append(h('h3', {}, core.def.name));
    for (const s of coreStats(core, this.config)) {
      this.info.append(h('div', { class: 'stat' }, h('span', {}, s.label), h('b', {}, s.text)));
    }
  }
}
