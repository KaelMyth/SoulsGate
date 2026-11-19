// Окно инвентаря: сверху витрина с магом и открытым фолиантом (3D, InventoryView), под ней полоса со счётчиками
// (сила духа слева, предметов из лимита по центру, монеты справа) и ячейки инвентаря. Открывается кнопкой у кучи снаряжения.
import { InventoryView } from './inventory_view.js';

const NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
  e.append(...kids);
  return e;
}

/** Иконка из готовой разметки SVG (строкой). */
function icon(svg) {
  const w = document.createElement('span');
  w.className = 'inv-ico';
  w.innerHTML = svg;
  return w;
}

const FLAME = `<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="inv-fl" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#2f6dff"/><stop offset="0.6" stop-color="#5fc8ff"/><stop offset="1" stop-color="#d8f6ff"/></linearGradient></defs><path fill="url(#inv-fl)" d="M12.6 1.8c.5 3.200-1.300 4.900-3 6.800-1.800 2-3.400 3.900-3.400 7 0 3.600 2.600 6.400 6 6.400s6-2.700 6-6.200c0-2.300-1-4-2.300-5.400-.3 1.300-.9 2.100-1.800 2.600.5-3.600-.2-8.100-1.500-11.200z"/><path fill="#eafaff" opacity=".85" d="M12 21.200c-1.700 0-3-1.300-3-3 0-1.800 1.400-2.800 2.300-4.300.2 1 1.100 1.600 1.700 2.200.5.500.9 1.200.9 2.100 0 1.600-.9 3-1.900 3z"/></svg>`;
const COIN = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#e0a93e"/><circle cx="12" cy="12" r="10" fill="none" stroke="#fff0b0" stroke-width="1.200" opacity=".9"/><circle cx="12" cy="12" r="6.800" fill="none" stroke="#a8741a" stroke-width="1.600"/><path d="M8.500 6.500a8 8 0 0 1 5-1" fill="none" stroke="#fff6d0" stroke-width="1.400" stroke-linecap="round" opacity=".8"/></svg>`;

export class InventoryUi {
  /** root: рамка игры (#phone); inv: Inventory; renderer: THREE.WebGLRenderer; cfg: CONFIG.inventory; onClose: после закрытия */
  constructor(root, inv, renderer, cfg, onClose) {
    this.inv = inv;
    this.renderer = renderer;
    this.cfg = cfg;
    this.onClose = onClose;
    this.open = false;
    this.view = null; // 3D-витрина создаётся при первом открытии (экономит память, пока окно не нужно)

    this.close = el('button', { id: 'inv-close', type: 'button', 'aria-label': 'Close' }, '✕');
    this.stage = el('div', { class: 'inv-stage' });
    this.spirit = el('b', {}, '0');
    this.count = el('b', {}, '0 / 0');
    this.coins = el('b', {}, '0');
    const strip = el('div', { class: 'inv-strip' },
      el('div', { class: 'inv-stat spirit', title: 'Spirit power' }, icon(FLAME), this.spirit),
      el('div', { class: 'inv-stat items', title: 'Items' }, this.count),
      el('div', { class: 'inv-stat coins', title: 'Coins' }, this.coins, icon(COIN)));
    this.grid = el('div', { class: 'inv-grid' });
    this.grid.style.setProperty('--cols', String(cfg.columns));
    this.cells = [];
    for (let i = 0; i < cfg.limit; i++) {
      const c = el('div', { class: 'inv-cell' });
      this.cells.push(c);
      this.grid.append(c);
    }
    this.panel = el('div', { class: 'inv-panel' }, strip, this.grid);
    this.root = el('div', { id: 'inv' }, this.stage, this.panel, this.close);
    this.root.style.setProperty('--stage', `${Math.round(cfg.stageFrac * 100)}%`);
    root.append(this.root);

    this.close.addEventListener('click', () => this.hide());
    window.addEventListener('keydown', (e) => { if (this.open && e.key === 'Escape') this.hide(); });
    inv.onChange = () => { if (this.open) this.refresh(); };
  }

  /** Обновить числа и ячейки (предметы пока нет, ячейки пустые). */
  refresh() {
    const inv = this.inv;
    this.spirit.textContent = String(inv.spirit);
    this.count.textContent = `${inv.count} / ${inv.limit}`;
    this.coins.textContent = String(inv.coins);
    this.cells.forEach((c, i) => c.classList.toggle('full', i < inv.count));
  }

  show() {
    if (this.open) return;
    this.open = true;
    if (!this.view) this.view = new InventoryView(this.renderer);
    this.refresh();
    this.grid.scrollTop = 0;
    this.root.classList.add('on');
  }

  hide() {
    if (!this.open) return;
    this.open = false;
    this.root.classList.remove('on');
    if (this.onClose) this.onClose();
  }

  /** Кадр окна: 3D-витрина в прямоугольник .inv-stage. */
  render(dt) {
    if (!this.open || !this.view) return;
    this.view.render(dt, this.stage.getBoundingClientRect(), this.renderer.domElement.getBoundingClientRect());
  }
}
