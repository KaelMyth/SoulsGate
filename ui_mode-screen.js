// Стартовый экран: выбор режима. «Игра»: только игровой интерфейс, как у настоящего игрока.
// «Тестирование»: панель отладки, ползунки, FPS, краш-тест, как раньше.
import { h } from './ui_dom.js';

export class ModeScreen {
  /** onPick(mode): 'game' | 'test' */
  constructor(root, onPick) {
    this.el = h('div', { id: 'mode-screen', hidden: '' },
      h('div', { class: 'card' },
        h('h2', {}, 'SoulsGate'),
        h('p', {}, 'Выбери режим'),
        h('button', { id: 'mode-game', type: 'button', onclick: () => onPick('game') }, 'Игра'),
        h('button', { id: 'mode-test', class: 'secondary', type: 'button', onclick: () => onPick('test') }, 'Тестирование')));
    root.append(this.el);
  }

  show() {
    this.el.hidden = false;
  }

  hide() {
    this.el.hidden = true;
  }

  get visible() {
    return !this.el.hidden;
  }
}
