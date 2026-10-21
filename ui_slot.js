// Кнопка-заглушка «слот умения» внизу экрана. Умения в ней пока нет: она нужна, чтобы проверить главный
// сценарий управления одним пальцем: убрать палец со стика, нажать кнопку и вернуться на стик.
import { h } from './ui_dom.js';

export class SlotUI {
  /** onPress(): вызывается при нажатии. */
  constructor(root, onPress) {
    this.presses = 0;
    this.button = h('button', {
      id: 'slot-btn', type: 'button', 'aria-label': 'Слот умения',
      onpointerdown: (e) => {
        if (e.cancelable) e.preventDefault();
        this.press();
        onPress(this.presses);
      },
    }, 'Умение');
    root.append(this.button);
  }

  press() {
    this.presses++;
    this.button.classList.toggle('flash', true);
    setTimeout(() => this.button.classList.toggle('flash', false), 120);
  }
}
