// Магическая рулетка при подборе фиолетового камня (кристалла умения): лента карточек катится справа налево,
// замедляется и встаёт так, что выигрыш оказывается под меткой в центре, как кейс в CS:GO.
// Пока внутри только цифры. Бой на время рулетки стоит. Если камней подобрано несколько, рулетки идут по очереди.
import { MOD_INFO } from './mods.js';
import { MOD_ICON } from './mod_icons.js';

// Логика ленты (makeRoll) чистая, без DOM, тестируется в Node.

/** Лента: cells чисел, выигрыш на позиции win; offset: на сколько px сдвинуть ленту, чтобы выигрыш встал под метку. */
export function makeRoll(rnd, { cells = 60, win = 49, cellW = 88, gap = 8, max = 99, pick = null } = {}) {
  const items = [];
  for (let i = 0; i < cells; i++) items.push(pick ? pick() : 1 + Math.floor(rnd() * max)); // pick: свой выбор карточки (модификаторы)
  const pitch = cellW + gap;
  const jitter = (rnd() - 0.5) * cellW * 0.7; // метка не всегда ровно по центру карточки
  return { items, win, value: items[win], offset: win * pitch + cellW / 2 + jitter, pitch, cellW };
}

/** Прогресс анимации 0..1 -> доля пути 0..1 (быстро в начале, долгая остановка). */
export const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 4);

/** Оттенок карточки по числу, как редкость в кейсах. */
export const tier = (n) => (n >= 95 ? 'gold' : n >= 75 ? 'pink' : n >= 40 ? 'violet' : 'blue');

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.append(...kids);
  return e;
}

export class Roulette {
  /** root: рамка игры; onOpen/onClose: бой ставят на паузу и снимают; onResult(число) */
  constructor(root, { onOpen, onClose, onResult, onPick, pick, spinMs = 5200, rnd = Math.random } = {}) {
    this.onPick = onPick || null; // (выигрыш, done): после «Tap to continue» открыть своё окно, потом вызвать done
    this.pick = pick || null;     // () => карточка ленты; без неё катятся числа
    this.onOpen = onOpen || (() => {});
    this.onClose = onClose || (() => {});
    this.onResult = onResult || (() => {});
    this.spinMs = spinMs;
    this.rnd = rnd;
    this.queue = 0;
    this.open = false;
    this.done = false;
    this.raf = 0;
    this.strip = el('div', { class: 'rl-strip' });
    this.hint = el('div', { class: 'rl-hint' }, '');
    this.title = el('div', { class: 'rl-title' }, 'Arcane Roll');
    const view = el('div', { class: 'rl-view' }, this.strip, el('div', { class: 'rl-mark' }));
    this.view = view;
    this.root = el('div', { id: 'roulette', role: 'dialog', 'aria-label': 'Arcane Roll' }, this.title, view, this.hint);
    this.root.addEventListener('click', () => this.close());
    root.append(this.root);
  }

  /** Подобран камень: запустить рулетку (или поставить в очередь). */
  request() {
    this.queue++;
    if (!this.open) this.show();
  }

  show() {
    if (this.queue <= 0) return;
    this.queue--;
    this.open = true;
    this.done = false;
    this.onOpen();
    this.roll = makeRoll(this.rnd, { pick: this.pick });
    this.strip.replaceChildren(...this.roll.items.map((n) => this.card(n)));
    this.strip.style.transform = 'translateX(0)';
    this.hint.textContent = '';
    this.hint.classList.remove('on');
    this.root.classList.remove('end');
    this.root.style.display = 'flex';
    void this.root.offsetWidth;
    this.root.classList.add('on');
    this.t0 = performance.now() + 500; // сначала окно плавно появляется
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  /** Карточка ленты: число или модификатор (иконка и название). */
  card(n) {
    if (typeof n === 'number') return el('div', { class: 'rl-cell ' + tier(n) }, String(n));
    const info = MOD_INFO[n];
    const c = el('div', { class: 'rl-cell mod ' + info.tier });
    c.style.setProperty('--m', info.color);
    c.innerHTML = `<span class="mi">${MOD_ICON[n]}</span><span class="mn">${info.name}</span>`;
    return c;
  }

  frame(now) {
    if (!this.open) return;
    const t = (performance.now() - this.t0) / this.spinMs;
    const w = this.view.clientWidth;
    const x = ease(t) * this.roll.offset - 0 ; // путь ленты
    // метка по центру окна: сдвигаем так, чтобы точка ленты x оказалась под центром
    this.strip.style.transform = `translateX(${(w / 2 - x).toFixed(1)}px)`;
    if (t >= 1) { this.finish(); return; }
    this.raf = requestAnimationFrame((n) => this.frame(n));
  }

  finish() {
    this.done = true;
    this.strip.children[this.roll.win].classList.add('won');
    this.root.classList.add('end');
    this.hint.textContent = 'Tap to continue';
    this.hint.classList.add('on');
    this.onResult(this.roll.value);
  }

  close() {
    if (!this.open || !this.done) return;
    this.open = false;
    this.root.classList.remove('on');
    clearTimeout(this.timer);
    const next = () => { if (this.queue > 0) this.show(); else this.onClose(); };
    this.timer = setTimeout(() => {
      this.root.style.display = 'none';
      if (this.onPick && typeof this.roll.value === 'string') this.onPick(this.roll.value, next); else next();
    }, 350);
  }

  reset() {
    cancelAnimationFrame(this.raf);
    clearTimeout(this.timer);
    this.queue = 0;
    this.root.classList.remove('on');
    this.root.style.display = 'none';
    if (this.open) { this.open = false; this.onClose(); }
  }
}
