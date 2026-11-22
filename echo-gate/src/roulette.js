// Магическая рулетка при подборе фиолетового камня (кристалла умения): лента карточек катится справа налево,
// замедляется и встаёт так, что выигрыш оказывается под меткой в центре, как кейс в CS:GO.
// Пока внутри только цифры. Бой на время рулетки стоит. Если камней подобрано несколько, рулетки идут по очереди.
import { MOD_INFO } from './mods.js';
import { MOD_ICON } from './mod_icons.js';

/** Особая карточка ленты: не модификатор. Выпала: лента удваивается (два ряда) и крутится ещё раз, награды обоих рядов. */
export const DOUBLE = 'double';
const DOUBLE_INFO = { name: 'Double', color: '#ffd36b', tier: 'legendary' };

// Логика ленты (makeRoll) чистая, без DOM, тестируется в Node.

/** Лента: cells чисел, выигрыш на позиции win; offset: на сколько px сдвинуть ленту, чтобы выигрыш встал под метку. */
export function makeRoll(rnd, { cells = 43, win = 34, cellW = 88, gap = 8, max = 99, pick = null } = {}) {
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
  constructor(root, { onOpen, onClose, onResult, onPick, pick, spinMs = 3640, rnd = Math.random } = {}) {
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
    this.rows = el('div', { class: 'rl-rows' });
    this.hint = el('div', { class: 'rl-hint' }, '');
    this.title = el('div', { class: 'rl-title' }, 'Arcane Roll');
    this.root = el('div', { id: 'roulette', role: 'dialog', 'aria-label': 'Arcane Roll' }, this.title, this.rows, this.hint);
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
    this.second = false;
    this.onOpen();
    this.title.textContent = 'Arcane Roll';
    this.hint.textContent = '';
    this.hint.classList.remove('on');
    this.root.classList.remove('end', 'dbl');
    this.start(1);
    this.root.style.display = 'flex';
    void this.root.offsetWidth;
    this.root.classList.add('on');
  }

  /** Запустить count лент одновременно (2 после «Double»; вторая крутится дольше). */
  start(count) {
    this.lines = [];
    this.rows.replaceChildren();
    for (let i = 0; i < count; i++) {
      const roll = makeRoll(this.rnd, { pick: this.pick ? () => this.pick({ noDouble: this.second }) : null });
      const strip = el('div', { class: 'rl-strip' }, ...roll.items.map((n) => this.card(n)));
      const view = el('div', { class: 'rl-view' + (this.second ? ' grow' : '') }, strip, el('div', { class: 'rl-mark' }));
      this.rows.append(view);
      this.lines.push({ roll, strip, view, dur: this.spinMs + i * 700, done: false });
    }
    this.t0 = performance.now() + 350; // сначала окно плавно появляется
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  /** Карточка ленты: число или модификатор (иконка и название). */
  card(n) {
    if (typeof n === 'number') return el('div', { class: 'rl-cell ' + tier(n) }, String(n));
    const info = n === DOUBLE ? DOUBLE_INFO : MOD_INFO[n];
    const c = el('div', { class: 'rl-cell mod ' + info.tier });
    c.style.setProperty('--m', info.color);
    c.innerHTML = `<span class="mi">${MOD_ICON[n]}</span><span class="mn">${info.name}</span>`;
    return c;
  }

  frame() {
    if (!this.open) return;
    let all = true;
    for (const L of this.lines) {
      const t = (performance.now() - this.t0) / L.dur;
      const w = L.view.clientWidth;
      L.strip.style.transform = `translateX(${(w / 2 - ease(t) * L.roll.offset).toFixed(1)}px)`; // метка по центру: точка ленты x встаёт под центр
      if (t >= 1) {
        if (!L.done) { L.done = true; L.strip.children[L.roll.win].classList.add('won'); }
      } else all = false;
    }
    if (all) { this.finish(); return; }
    this.raf = requestAnimationFrame(() => this.frame());
  }

  finish() {
    const vals = this.lines.map((L) => L.roll.value);
    if (!this.second && vals[0] === DOUBLE) { // «Double»: короткая вспышка, и сразу снова, уже двумя лентами
      this.root.classList.add('dbl');
      this.title.textContent = 'DOUBLE ROLL';
      this.dblTimer = setTimeout(() => { this.second = true; this.start(2); }, 1400);
      return;
    }
    this.done = true;
    this.values = vals;
    this.root.classList.add('end');
    this.hint.textContent = 'Tap to continue';
    this.hint.classList.add('on');
    for (const v of vals) this.onResult(v);
  }

  close() {
    if (!this.open || !this.done) return;
    this.open = false;
    this.root.classList.remove('on');
    clearTimeout(this.timer);
    const next = () => { if (this.queue > 0) this.show(); else this.onClose(); };
    const vals = this.values.slice();
    const run = () => { // награды по очереди: на каждую своё окно модификатора
      if (!vals.length) { next(); return; }
      const v = vals.shift();
      if (this.onPick && typeof v === 'string') this.onPick(v, run); else run();
    };
    this.timer = setTimeout(() => {
      this.root.style.display = 'none';
      run();
    }, 250);
  }

  reset() {
    cancelAnimationFrame(this.raf);
    clearTimeout(this.timer);
    clearTimeout(this.dblTimer);
    this.queue = 0;
    this.root.classList.remove('on');
    this.root.style.display = 'none';
    if (this.open) { this.open = false; this.onClose(); }
  }
}
