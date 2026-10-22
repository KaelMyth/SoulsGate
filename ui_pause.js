// Кнопка паузы (на экране во время игры) и экран паузы: хранилище, поле билда, «Продолжить» и «Меню».
// «Меню» открывает второе окно: «Новая игра» и «Выход» (выход пока заглушка: назад к паузе).
// Экран паузы лежит ниже кнопки ⚙ и отладочной панели, поэтому ползунки доступны во время паузы.
import { h } from './ui_dom.js';
import { BuilderUI } from './ui_builder.js';

export class PauseUI {
  /** handlers: { onToggle, onResume, onRestart }; grid: BuildGrid; storage: Storage; config: живой конфиг */
  constructor(root, handlers, grid, storage, config) {
    this.button = h('button', {
      id: 'pause-btn', type: 'button', 'aria-label': 'Пауза', onclick: () => handlers.onToggle(),
    }, '❚❚');
    this.builder = new BuilderUI(grid, config, storage);
    this.main = h('div', { class: 'card', id: 'pause-main' },
      this.builder.root,
      h('div', { class: 'row' },
        h('button', { id: 'pause-resume', type: 'button', onclick: () => handlers.onResume() }, 'Продолжить'),
        h('button', { id: 'pause-menu', class: 'secondary', type: 'button', onclick: () => this.showMenu(true) }, 'Меню')));
    this.menu = h('div', { class: 'card', id: 'menu-card', hidden: '' },
      h('h2', {}, 'Меню'),
      h('button', { id: 'menu-new', type: 'button', onclick: () => handlers.onRestart() }, 'Новая игра'),
      h('button', { id: 'menu-exit', class: 'secondary', type: 'button', onclick: () => this.showMenu(false) }, 'Выход'));
    this.screen = h('div', { id: 'pause-screen', hidden: '' }, this.main, this.menu);
    root.append(this.button, this.screen);
  }

  showMenu(on) {
    this.menu.hidden = !on;
    this.main.hidden = on;
  }

  setPaused(on) {
    this.screen.hidden = !on;
    this.button.textContent = on ? '▶︎' : '❚❚';
    this.button.classList.toggle('on', on);
    this.showMenu(false);
    if (on) this.builder.refresh();
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
