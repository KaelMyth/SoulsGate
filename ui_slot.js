// Три слота умений внизу по центру. Пока работает только первый (Магический дождь, если его ядро стоит в билде), два других пустые.
// Сам ромб рисует canvas (render_renderer.js, drawHud), кнопка даёт только зону нажатия.
import { h } from './ui_dom.js';

export class SlotUI {
  /** onPress(число нажатий, номер слота 0..2): вызывается при нажатии. */
  constructor(root, onPress) {
    this.presses = 0;
    this.buttons = [0, 1, 2].map((i) => h('button', {
      class: i === 0 ? 'slot-btn' : 'slot-btn off', type: 'button', 'aria-label': 'Слот умения ' + (i + 1),
      onpointerdown: (e) => {
        if (e.cancelable) e.preventDefault();
        if (i !== 0) return;
        this.presses++;
        onPress(this.presses, i);
      },
    }));
    this.row = h('div', { id: 'slot-row' }, ...this.buttons);
    root.append(this.row);
  }
}
