// Экран смерти героя: итог забега и большая кнопка «Заново».
import { h } from './ui_dom.js';

export class DeathScreen {
  constructor(root, onRestart) {
    this.stats = h('p', { id: 'death-stats' });
    this.button = h('button', { id: 'death-restart', type: 'button', onclick: () => onRestart() }, 'Заново');
    this.title = h('h2', {}, 'Ты погиб');
    this.el = h('div', { id: 'death-screen', hidden: '' },
      h('div', { class: 'card' }, this.title, this.stats, this.button));
    root.append(this.el);
  }

  /** title (необязательно): другой заголовок, например «Победа?» в конце игры (тогда экран светлее, класс ending). */
  show(text, title) {
    this.stats.textContent = text;
    this.title.textContent = title || 'Ты погиб';
    this.el.classList.toggle('ending', !!title);
    this.el.hidden = false;
  }

  hide() {
    this.el.hidden = true;
  }

  get visible() {
    return !this.el.hidden;
  }
}
