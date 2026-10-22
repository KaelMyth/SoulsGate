// Кнопка паузы (всегда на экране) и экран паузы с полем билда.
// Экран паузы лежит ниже кнопки ⚙ и отладочной панели, поэтому ползунки доступны во время паузы.
import { h } from './ui_dom.js';
import { BuilderUI } from './ui_builder.js';

export class PauseUI {
  /** handlers: { onToggle, onResume, onRestart }; grid: BuildGrid; config: живой конфиг */
  constructor(root, handlers, grid, config) {
    this.button = h('button', {
      id: 'pause-btn', type: 'button', 'aria-label': 'Пауза', onclick: () => handlers.onToggle(),
    }, '❚❚');
    this.builder = new BuilderUI(grid, config);
    this.screen = h('div', { id: 'pause-screen', hidden: '' },
      h('div', { class: 'card' },
        h('h2', {}, 'Пауза'),
        this.builder.root,
        h('button', { id: 'pause-resume', type: 'button', onclick: () => handlers.onResume() }, 'Продолжить'),
        h('button', { id: 'pause-restart', class: 'secondary', type: 'button', onclick: () => handlers.onRestart() }, 'Начать заново')));
    root.append(this.button, this.screen);
  }

  setPaused(on) {
    this.screen.hidden = !on;
    this.button.textContent = on ? '▶︎' : '❚❚';
    this.button.classList.toggle('on', on);
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
