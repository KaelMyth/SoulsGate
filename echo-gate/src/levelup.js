// Окно выбора усиления при повышении уровня: надпись "Choose an Upgrade" и две пустые карточки.
// Появляется плавно (фон, надпись и карточки по очереди), бой на это время стоит. Нажатие на карточку закрывает окно
// (содержимого карточек пока нет). Если уровней набралось несколько, окна идут по очереди.
// DOM: #levelup создаётся здесь, стили в styles.css.
function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v; else e.setAttribute(k, v);
  }
  e.append(...kids);
  return e;
}

export class LevelUp {
  /** root: куда добавить окно (#phone); onOpen/onClose: бой ставят на паузу и снимают; count: сколько карточек */
  constructor(root, { onOpen, onClose, count = 2, fadeMs = 450 } = {}) {
    this.onOpen = onOpen || (() => {});
    this.onClose = onClose || (() => {});
    this.fadeMs = fadeMs;
    this.queue = 0;     // сколько окон ждут
    this.open = false;
    this.cards = [];
    const cards = el('div', { class: 'lu-cards' });
    for (let i = 0; i < count; i++) {
      const c = el('button', { class: 'lu-card', type: 'button', 'aria-label': 'Upgrade ' + (i + 1) });
      c.addEventListener('click', () => this.pick(i));
      this.cards.push(c);
      cards.append(c);
    }
    this.title = el('div', { class: 'lu-title' }, 'Choose an Upgrade');
    this.root = el('div', { id: 'levelup', role: 'dialog', 'aria-label': 'Choose an Upgrade' }, this.title, cards);
    this.root.style.setProperty('--fade', fadeMs + 'ms');
    root.append(this.root);
    this.timer = null;
  }

  /** Новый уровень: показать окно (или поставить в очередь, если уже открыто). */
  request() {
    this.queue++;
    if (!this.open) this.show();
  }

  show() {
    if (this.queue <= 0) return;
    this.queue--;
    this.open = true;
    this.onOpen();
    this.root.style.display = 'flex';
    void this.root.offsetWidth; // чтобы переход включился с нуля
    this.root.classList.add('on');
  }

  pick(i) {
    if (!this.open || !this.root.classList.contains('on')) return;
    this.root.classList.remove('on');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.root.style.display = 'none';
      this.open = false;
      if (this.queue > 0) this.show(); else this.onClose();
    }, this.fadeMs);
    this.picked = i;
  }

  /** Сбросить всё: новая игра или возврат в хаб. */
  reset() {
    clearTimeout(this.timer);
    this.queue = 0;
    this.root.classList.remove('on');
    this.root.style.display = 'none';
    if (this.open) { this.open = false; this.onClose(); }
  }
}
