// Три слота умений: Магический дождь (1), Воплощение (2), Воодушевление (3).
// Сам ромб рисует canvas (render_renderer.js, drawHud), кнопка даёт только зону нажатия.
import { h } from './ui_dom.js';

export class SlotUI {
  /** onPress(число нажатий, номер слота 0..2): вызывается при нажатии. */
  constructor(root, onPress) {
    this.presses = 0;
    this.buttons = [0, 1, 2].map((i) => h('button', {
      class: 'slot-btn', type: 'button', 'aria-label': 'Слот умения ' + (i + 1),
      onpointerdown: (e) => {
        if (e.cancelable) e.preventDefault();
        this.presses++;
        onPress(this.presses, i);
      },
    }));
    this.row = h('div', { id: 'slot-row' }, ...this.buttons);
    root.append(this.row);
  }
}
