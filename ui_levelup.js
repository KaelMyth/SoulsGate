// Окно выбора награды за уровень: 3 карточки модов и снизу кнопка обмена на опыт.
import { h } from './ui_dom.js';
import { icon } from './ui_icons.js';

export class LevelUpScreen {
  /** root: куда класть окно; onPick(offer), onExchange(): вызываются при выборе. */
  constructor(root, onPick, onExchange) {
    this.onPick = onPick;
    this.onExchange = onExchange;
    this.title = h('h2', {});
    this.list = h('div', { class: 'lu-list' });
    this.exchange = h('button', { type: 'button', class: 'lu-exchange', onclick: () => this.choose(() => this.onExchange()) });
    this.el = h('div', { id: 'levelup-screen', hidden: '' },
      h('div', { class: 'card' }, this.title, this.list, this.exchange));
    root.append(this.el);
    this.armedAt = 0;
  }

  /** offers: [{ token, key, def }], level: новый уровень, exchangeText: подпись кнопки обмена. */
  show(level, offers, exchangeText) {
    this.title.textContent = 'Уровень ' + level;
    this.list.replaceChildren();
    for (const o of offers) {
      const card = h('button', { type: 'button', class: 'lu-card', onclick: () => this.choose(() => this.onPick(o)) },
        h('span', { class: 'lu-icon' }, icon(o.def.icon)),
        h('span', { class: 'lu-text' },
          h('b', {}, o.def.name),
          h('small', {}, o.def.description)));
      this.list.append(card);
    }
    this.exchange.textContent = exchangeText;
    this.el.hidden = false;
    this.armedAt = performance.now() + 450; // случайное касание в момент выскакивания окна не выбирает
  }

  choose(fn) {
    if (performance.now() < this.armedAt) return;
    this.hide();
    fn();
  }

  hide() {
    this.el.hidden = true;
  }

  get visible() {
    return !this.el.hidden;
  }
}
