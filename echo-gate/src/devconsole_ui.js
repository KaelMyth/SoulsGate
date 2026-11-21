// Окно консоли разработчика: все посохи в трёх ступенях заточки (+1, +5, +10). Нажатие создаёт свежий посох и сразу надевает его.
// Прежний надетый посох уходит в рюкзак (если он тоже из консоли, просто исчезает: консольные копии не копятся).
import { makeStaffIcons, iconOf } from './staff_icons.js';
import { startingStaff, fireStaff, iceStaff, electricStaff, gravityStaff, laserStaff, bladesStaff } from './items.js';

const STAFFS = [
  { element: null, label: 'Force', make: startingStaff },
  { element: 'fire', label: 'Flame', make: fireStaff },
  { element: 'ice', label: 'Frost', make: iceStaff },
  { element: 'electric', label: 'Storm', make: electricStaff },
  { element: 'gravity', label: 'Void', make: gravityStaff },
  { element: 'laser', label: 'Prism', make: laserStaff },
  { element: 'blades', label: 'Bladestorm', make: bladesStaff },
];
const LEVELS = [1, 5, 10];

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  n.append(...kids);
  return n;
}

export class DevConsoleUi {
  /** root: рамка игры (#phone); game: Game; onClose: после закрытия */
  constructor(root, game, onClose) {
    this.game = game;
    this.inv = game.inventory;
    this.onClose = onClose;
    this.open = false;
    this.icons = null;
    this.closeBtn = el('button', { type: 'button', class: 'dc-close', 'aria-label': 'Close' }, '✕');
    const top = el('div', { class: 'dc-top' }, this.closeBtn, el('div', { class: 'dc-title' }, 'DEV CONSOLE'), el('div', {}));
    this.list = el('div', { class: 'dc-list' });
    this.toastEl = el('div', { class: 'dc-toast' });
    const hint = el('div', { class: 'dc-hint' }, '> tap a level to spawn that staff and equip it');
    this.root = el('div', { id: 'devcon' }, top, hint, this.list, this.toastEl);
    root.append(this.root);
    this.closeBtn.addEventListener('click', () => this.hide());
    window.addEventListener('keydown', (e) => { if (this.open && e.key === 'Escape') this.hide(); });
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.root.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    this.inv.listen(() => { if (this.open) this.refresh(); });
  }

  build() {
    this.list.textContent = '';
    this.rows = [];
    for (const s of STAFFS) {
      const img = el('img', { alt: '', draggable: 'false' });
      const url = iconOf(this.icons, s);
      if (url) img.src = url;
      const btns = LEVELS.map((lv) => {
        const b = el('button', { type: 'button', class: 'dc-lv', 'data-lv': String(lv) }, `+${lv}`);
        b.addEventListener('click', () => this.equip(s, lv));
        return b;
      });
      const row = el('div', { class: 'dc-row' }, el('div', { class: 'dc-ic' }, img), el('div', { class: 'dc-nm' }, s.label), el('div', { class: 'dc-btns' }, ...btns));
      this.list.append(row);
      this.rows.push({ s, btns });
    }
    this.refresh();
  }

  /** Подсветка надетого сейчас варианта. */
  refresh() {
    const cur = this.inv.equipped.staff;
    for (const { s, btns } of this.rows || []) {
      for (const b of btns) {
        const on = !!cur && (cur.element || null) === s.element && (cur.sharpen || 0) === Number(b.dataset.lv);
        b.classList.toggle('on', on);
      }
    }
  }

  equip(s, lv) {
    const item = s.make();
    item.sharpen = lv;
    item.dev = true;
    const old = this.inv.equipped.staff;
    if (old && !old.dev && !this.inv.add(old)) { this.say('Backpack is full'); return; }
    this.inv.equipped.staff = item;
    this.inv.changed();
    this.say(`${item.label} equipped`);
  }

  say(t) {
    this.toastEl.textContent = t;
    this.toastEl.classList.add('on');
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => this.toastEl.classList.remove('on'), 1400);
  }

  show() {
    if (this.open) return;
    this.open = true;
    if (!this.icons) this.icons = makeStaffIcons(128);
    this.build();
    this.root.classList.add('show');
    requestAnimationFrame(() => requestAnimationFrame(() => this.root.classList.add('on')));
  }

  hide() {
    if (!this.open) return;
    this.open = false;
    this.root.classList.remove('on');
    setTimeout(() => { if (!this.open) this.root.classList.remove('show'); }, 320);
    if (this.onClose) this.onClose();
  }
}
