// Окно выбора награды за уровень: 3 карточки модов и снизу кнопка обмена на опыт.
import { h } from './ui_dom.js';
import { icon } from './ui_icons.js';

const HOLD_MS = 380;
const RARITY_NAMES = { common: 'Обычный', rare: 'Редкий', epic: 'Эпический', legendary: 'Легендарный' };

export class LevelUpScreen {
  /** root: куда класть окно; onPick(offer), onExchange(): вызываются при выборе. */
  constructor(root, onPick, onExchange, onPreview) {
    this.onPreview = onPreview || null; // долгое нажатие на карточку: показать, куда мод встанет
    this.onPick = onPick;
    this.onExchange = onExchange;
    this.title = h('h2', {});
    this.subtitle = h('p', { class: 'lu-subtitle' }, 'ВЫБЕРИТЕ ДАР');
    this.modGuide = h('p', { class: 'lu-mod-guide', hidden: '' },
      'Моды усиливают и меняют умения. Выбери один, затем перетащи его из хранилища на ядро или совместимый мод в меню билда. Цвет указывает редкость.');
    this.list = h('div', { class: 'lu-list' });
    this.exchange = h('button', { type: 'button', class: 'lu-exchange', onclick: () => this.choose(() => this.onExchange()) });
    this.el = h('div', { id: 'levelup-screen', hidden: '' },
      h('div', { class: 'card' }, this.title, this.subtitle, this.modGuide, this.list, this.exchange));
    root.append(this.el);
    this.armedAt = 0;
  }

  /** offers: [{ token, key, def }], level: новый уровень, exchangeText: подпись кнопки обмена. */
  show(level, offers, exchangeText, showModGuide = false) {
    this.title.textContent = 'Уровень ' + level;
    this.modGuide.hidden = !showModGuide;
    this.list.replaceChildren();
    for (const o of offers) {
      const rarity = o.def.rarity || 'common';
      const card = h('button', { type: 'button', class: 'lu-card rarity-' + rarity, oncontextmenu: (e) => e.preventDefault(), onclick: () => { if (this.heldFired) { this.heldFired = false; return; } this.choose(() => this.onPick(o)); } },
        h('span', { class: 'lu-icon' }, icon(o.def.icon)),
        h('span', { class: 'lu-text' },
          h('span', { class: 'lu-rarity' }, RARITY_NAMES[rarity] || RARITY_NAMES.common),
          h('b', {}, o.def.name),
          h('small', {}, o.def.description)));
      this.hold(card, o);
      this.list.append(card);
    }
    this.exchange.textContent = exchangeText;
    this.el.hidden = false;
    this.armedAt = performance.now() + 450; // случайное касание в момент выскакивания окна не выбирает
  }

  /** Долгое нажатие (HOLD_MS) на карточку: открывается предпросмотр, а отпускание не выбирает мод. */
  hold(card, offer) {
    let timer = 0;
    const stop = () => { if (timer) { clearTimeout(timer); timer = 0; } };
    card.addEventListener('pointerdown', () => {
      this.heldFired = false;
      stop();
      timer = setTimeout(() => {
        timer = 0;
        if (performance.now() < this.armedAt || !this.onPreview) return;
        this.heldFired = true;
        this.onPreview(offer);
      }, HOLD_MS);
    });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) card.addEventListener(ev, stop);
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
