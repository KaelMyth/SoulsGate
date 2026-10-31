// Кнопка паузы (на экране во время игры) и экран паузы: хранилище, поле билда, «Продолжить» и «Меню».
// «Меню» открывает второе окно: «Новая игра» и «Выход» (выход возвращает на экран выбора режима).
// Экран паузы лежит ниже кнопки ⚙ и отладочной панели, поэтому ползунки доступны во время паузы.
import { h, svg } from './ui_dom.js';
import { icon } from './ui_icons.js';

/** Шестерёнка низким полигоном: 8 зубцов и отверстие. */
function gearIcon() {
  const pts = [];
  for (let i = 0; i < 8; i++) {
    for (const [a, r] of [[0, 9.4], [0.14, 12.4], [0.36, 12.4], [0.5, 9.4]]) {
      const t = ((i + a) / 8) * Math.PI * 2;
      pts.push((16 + Math.cos(t) * r).toFixed(1) + ',' + (16 + Math.sin(t) * r).toFixed(1));
    }
  }
  return svg('svg', { viewBox: '0 0 32 32', 'aria-hidden': 'true' },
    svg('path', { d: 'M' + pts.join('L') + 'ZM16 11.4l4.6 4.6-4.6 4.6-4.6-4.6z', fill: 'currentColor', 'fill-rule': 'evenodd' }));
}
import { BuilderUI } from './ui_builder.js';

export class PauseUI {
  /** handlers: { onToggle, onResume, onRestart, onExit }; grid: BuildGrid; storage: Storage; config: живой конфиг */
  constructor(root, handlers, grid, storage, config) {
    this.storage = storage;
    this.button = h('button', {
      id: 'pause-btn', type: 'button', 'aria-label': 'Пауза', onclick: () => handlers.onToggle(),
    }, gearIcon());
    this.builder = new BuilderUI(grid, config, storage);
    // Тестовый набор (только режим «Тестирование»): одна кнопка открывает список всех модов из конфига,
    // нажатие на мод кладёт его в хранилище. Список выпадает вверх и листается: модов будет много.
    this.toolsList = h('div', { class: 'tools-list', hidden: '' });
    for (const key of Object.keys(config.mods)) {
      const def = config.mods[key];
      this.toolsList.append(h('button', {
        type: 'button', class: 'tool-item rarity-' + (def.rarity || 'common'), 'data-spawn': key,
        onclick: () => { this.storage.addAlways({ key, def }); this.builder.rebuild(); },
      }, h('span',{class:'tool-icon'},icon(def.icon)),
          h('span',{class:'tool-copy'},h('b',{},def.name),h('small',{},def.description))));
    }
    this.toolsBtn = h('button', {
      type: 'button', id: 'tools-toggle', class: 'tools-toggle', onclick: () => this.showTools(this.toolsList.hidden),
    }, '＋ Добавить мод (тест) ▴');
    this.tools = h('div', { class: 'test-tools' }, this.toolsBtn, this.toolsList);
    this.previewRow = h('div', { class: 'row', hidden: '' });
    this.mainRow = h('div', { class: 'row' },
        h('button', { id: 'pause-resume', type: 'button', onclick: () => handlers.onResume() }, 'Продолжить'),
        h('button', { id: 'pause-menu', class: 'secondary', type: 'button', onclick: () => this.showMenu(true) }, 'Меню'));
    this.main = h('div', { class: 'card', id: 'pause-main' },
      h('header',{class:'grimoire-head'},
        h('small',{},'ПЕЧАТЬ СИЛЫ'),h('h2',{},'Гримуар модов')),
      this.builder.root, this.tools, this.mainRow, this.previewRow);
    this.menu = h('div', { class: 'card', id: 'menu-card', hidden: '' },
      h('div',{class:'pause-chapter'},'СВИТОК СТРАННИКА'),
      h('h2', {}, 'Пауза'),
      h('button', { id: 'menu-resume', type: 'button', onclick: () => handlers.onResume() }, 'Продолжить'),
      h('button', { id: 'menu-new', type: 'button', onclick: () => handlers.onRestart() }, 'Новая игра'),
      h('button', { id: 'menu-exit', class: 'secondary', type: 'button', onclick: () => handlers.onExit() }, 'Выход'));
    this.screen = h('div', { id: 'pause-screen', hidden: '' }, this.main, this.menu);
    root.append(this.button, this.screen);
  }

  /**
   * Предпросмотр награды: поверх окна выбора открывается меню Билда, на поле подсвечены места для мода def.
   * Кнопки: «Выбрать этот» (onChoose) и «Назад» (onBack).
   */
  showPreview(def, onChoose, onBack) {
    this.previewing = true;
    this.screen.classList.toggle('preview', true);
    this.screen.hidden = false;
    this.showMenu(false);
    this.showTools(false);
    this.tools.hidden = true;
    this.mainRow.hidden = true;
    this.previewRow.hidden = false;
    this.previewRow.replaceChildren(
      h('button', { type: 'button', class: 'secondary', onclick: () => { this.hidePreview(); onBack(); } }, 'Назад'),
      h('button', { type: 'button', onclick: () => { this.hidePreview(); onChoose(); } }, 'Выбрать этот'));
    this.builder.sel = { kind: 'preview', def };
    this.builder.refresh();
  }

  hidePreview() {
    if (!this.previewing) return;
    this.previewing = false;
    this.screen.classList.toggle('preview', false);
    this.screen.hidden = true;
    this.mainRow.hidden = false;
    this.previewRow.hidden = true;
    this.tools.hidden = !this.testTools;
    if (this.builder.sel && this.builder.sel.kind === 'preview') this.builder.sel = null;
    this.builder.refresh();
  }

  /** Набор для тестов виден только в режиме «Тестирование». */
  setTestTools(on) {
    this.testTools = on;
    this.tools.hidden = !on;
    if (!on) this.showTools(false);
  }

  showTools(on) {
    this.toolsList.hidden = !on;
  }

  showMenu(on) {
    this.menu.hidden = !on;
    this.main.hidden = on;
  }

  setPaused(on) {
    this.screen.hidden = !on;
    this.button.classList.toggle('on', on);
    this.showMenu(false);
    this.showTools(false);
    if (on) this.builder.rebuild(); // хранилище могло измениться (награда за уровень): пересобираем ячейки, а не только подсветку
  }

  /** Сетка перерасставлена или сменила размер. */
  rebuild() {
    this.builder.rebuild();
  }

  /** Конфиг поменялся (ползунок): обновить цифры в карточке ядра. */
  refresh() {
    this.builder.refresh();
  }

  get visible() {
    return !this.screen.hidden;
  }
}
