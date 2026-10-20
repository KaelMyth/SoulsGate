// Экран смерти героя: итог забега и большая кнопка «Заново».
import { h } from './ui_dom.js';

export class DeathScreen {
  constructor(root, onRestart) {
    this.stats = h('p', { id: 'death-stats' });
    this.button = h('button', { id: 'death-restart', type: 'button', onclick: () => onRestart() }, 'Заново');
    this.el = h('div', { id: 'death-screen', hidden: '' },
      h('div', { class: 'card' }, h('h2', {}, 'Ты погиб'), this.stats, this.button));
    root.append(this.el);
  }

  show(text) {
    this.stats.textContent = text;
    this.el.hidden = false;
  }

  hide() {
    this.el.hidden = true;
  }

  get visible() {
    return !this.el.hidden;
  }
}
