// Кнопка паузы (всегда на экране) и экран паузы.
// Экран паузы лежит ниже кнопки ⚙ и отладочной панели, поэтому ползунки доступны во время паузы.
import { h } from './ui_dom.js';

export class PauseUI {
  /** handlers: { onToggle, onResume, onRestart } */
  constructor(root, handlers) {
    this.button = h('button', {
      id: 'pause-btn', type: 'button', 'aria-label': 'Пауза', onclick: () => handlers.onToggle(),
    }, '❚❚');
    this.screen = h('div', { id: 'pause-screen', hidden: '' },
      h('div', { class: 'card' },
        h('h2', {}, 'Пауза'),
        h('p', {}, 'Настройки доступны по кнопке ⚙'),
        h('button', { id: 'pause-resume', type: 'button', onclick: () => handlers.onResume() }, 'Продолжить'),
        h('button', { id: 'pause-restart', class: 'secondary', type: 'button', onclick: () => handlers.onRestart() }, 'Начать заново')));
    root.append(this.button, this.screen);
  }

  setPaused(on) {
    this.screen.hidden = !on;
    this.button.textContent = on ? '▶︎' : '❚❚';
    this.button.classList.toggle('on', on);
  }

  get visible() {
    return !this.screen.hidden;
  }
}
