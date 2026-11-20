// Окно выбора усиления при повышении уровня: надпись "Choose an Upgrade" и две карточки с усилениями.
// Какие усиления выпали, решает getChoices() (список и шансы в upgrades.js), выбранное применяет onPick(усиление).
// Появляется плавно (фон, надпись и карточки по очереди), бой на это время стоит. Если уровней набралось несколько, окна идут по очереди.
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
  constructor(root, { onOpen, onClose, getChoices, onPick, count = 2, fadeMs = 450 } = {}) {
    this.getChoices = getChoices || (() => []);
    this.onPick = onPick || (() => {});
    this.choices = [];
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
    this.choices = this.getChoices().slice(0, this.cards.length);
    this.cards.forEach((c, i) => this.fillCard(c, this.choices[i]));
    this.onOpen();
    this.root.style.display = 'flex';
    void this.root.offsetWidth; // чтобы переход включился с нуля
    this.root.classList.add('on');
  }

  fillCard(card, u) {
    card.replaceChildren();
    card.style.visibility = u ? '' : 'hidden';
    if (!u) return;
    const ic = el('div', { class: 'lu-icon' });
    ic.innerHTML = u.icon;
    ic.style.color = u.color;
    card.style.setProperty('--c', u.color);
    card.append(ic, el('div', { class: 'lu-name' }, u.name), el('div', { class: 'lu-text' }, u.text(u.value)));
  }

  pick(i) {
    if (!this.open || !this.root.classList.contains('on') || !this.choices[i]) return;
    this.onPick(this.choices[i]);
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
