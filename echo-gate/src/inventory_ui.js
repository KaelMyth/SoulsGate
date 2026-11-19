// Окно инвентаря: сверху витрина с магом и открытым фолиантом (3D, InventoryView), под ней полоса со счётчиками
// (сила духа слева, предметов из лимита по центру, монеты справа) и ячейки инвентаря. Открывается кнопкой у кучи снаряжения.
import { InventoryView } from './inventory_view.js';

const TOME_ICON = `<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="7" y="4" width="19" height="24" rx="2.500" fill="#3a2a3d" stroke="#c9a25a" stroke-width="1.400"/><rect x="9.500" y="6.500" width="14" height="19" rx="1.500" fill="#e9e2cf"/><rect x="7" y="4" width="4" height="24" rx="2" fill="#2a1d2d"/><path d="M17.500 11.500l3.200 4.200-3.200 4.200-3.200-4.200z" fill="none" stroke="#1fc8e6" stroke-width="1.600"/><circle cx="17.500" cy="15.700" r="1.100" fill="#35f2ff"/></svg>`;
const STAFF_ICON = `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M9 28L21.500 9.500" stroke="#9a6a3e" stroke-width="3" stroke-linecap="round"/><path d="M9 28L21.500 9.500" stroke="#c9a25a" stroke-width="1" stroke-linecap="round" opacity=".7"/><path d="M17 7.200a6 6 0 0 1 9 5" fill="none" stroke="#c9a25a" stroke-width="2.200" stroke-linecap="round"/><path d="M22.500 3.500l3.200 4.500-3.200 4.500-3.200-4.500z" fill="#5ee6ff" stroke="#d8f8ff" stroke-width="1"/></svg>`;
const ICONS = { tome: TOME_ICON, staff: STAFF_ICON };
const DRAG_PX = 7;        // на сколько сдвинуть палец или мышь, чтобы началось перетаскивание
const HOLD_MS = 170;      // долгое касание начинает перетаскивание, а короткое сдвигание прокручивает сетку

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
    this.pending = null; // нажатие, которое может стать перетаскиванием или нажатием
    this.drag = null;    // идущее перетаскивание: { src, item, ghost }

    this.close = el('button', { id: 'inv-close', type: 'button', 'aria-label': 'Close' }, '✕');
    this.hints = {
      tome: el('div', { class: 'inv-hint tome' }, 'Drag the tome here'),
      staff: el('div', { class: 'inv-hint staff' }, 'Drag the staff here'),
    };
    this.stage = el('div', { class: 'inv-stage' }, this.hints.tome, this.hints.staff);
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
      c.dataset.i = String(i);
      this.cells.push(c);
      this.grid.append(c);
    }
    this.panel = el('div', { class: 'inv-panel' }, strip, this.grid);
    this.detail = el('div', { class: 'inv-detail' });
    this.root = el('div', { id: 'inv' }, this.stage, this.panel, this.close, this.detail);
    this.root.style.setProperty('--stage', `${Math.round(cfg.stageFrac * 100)}%`);
    root.append(this.root);

    this.close.addEventListener('click', () => this.hide());
    window.addEventListener('keydown', (e) => { if (this.open && e.key === 'Escape') { if (this.detail.classList.contains('on')) this.hideDetail(); else this.hide(); } });
    inv.onChange = () => { if (this.open) this.refresh(); };

    this.root.addEventListener('pointerdown', (e) => this.down(e));
    this.root.addEventListener('pointermove', (e) => this.move(e));
    this.root.addEventListener('pointerup', (e) => this.up(e));
    this.root.addEventListener('pointercancel', () => this.cancel());
    // Пока тащим предмет, страница не должна прокручиваться.
    this.root.addEventListener('touchmove', (e) => { if (this.drag) e.preventDefault(); }, { passive: false });
    this.detail.addEventListener('click', (e) => { if (e.target === this.detail) this.hideDetail(); });
  }

  /** Обновить числа, ячейки и витрину. */
  refresh() {
    const inv = this.inv;
    this.spirit.textContent = String(inv.spirit);
    this.count.textContent = `${inv.count} / ${inv.limit}`;
    this.coins.textContent = String(inv.coins);
    const lift = this.drag && this.drag.src.type === 'slot' ? this.drag.src.i : -1;
    this.cells.forEach((c, i) => {
      const it = inv.slots[i];
      c.classList.toggle('full', !!it);
      c.classList.toggle('lift', i === lift);
      c.style.setProperty('--rar', it ? it.rarityInfo.color : 'transparent');
      c.innerHTML = it ? `<span class="it">${ICONS[it.kind] || ''}</span>` : '';
    });
    for (const slot of ['tome', 'staff']) {
      const carrying = !!(this.drag && this.drag.src.type === 'equip' && this.drag.src.slot === slot);
      if (this.view) this.view.setVisible(slot, !!inv.equipped[slot] && !carrying);
      this.hints[slot].classList.toggle('on', !inv.equipped[slot] || carrying || !!(this.drag && this.drag.item.slot === slot));
    }
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
    this.cancel();
    this.hideDetail();
    this.open = false;
    this.root.classList.remove('on');
    if (this.onClose) this.onClose();
  }

  /** Кадр окна: 3D-витрина в прямоугольник .inv-stage. */
  render(dt) {
    if (!this.open || !this.view) return;
    this.view.render(dt, this.stage.getBoundingClientRect(), this.renderer.domElement.getBoundingClientRect());
  }

  // --- Перетаскивание и нажатия ---------------------------------------------------------------------------------

  /** Что лежит под точкой нажатия: { type:'slot', i } для ячейки с предметом, { type:'equip', slot:'tome' } для фолианта на витрине. */
  pick(e) {
    const cell = e.target.closest && e.target.closest('.inv-cell');
    if (cell && this.inv.slots[+cell.dataset.i]) return { type: 'slot', i: +cell.dataset.i };
    const r = this.stage.getBoundingClientRect();
    if (this.view && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
        && !(e.target.closest && e.target.closest('button'))) {
      for (const slot of ['tome', 'staff']) {
        if (this.inv.equipped[slot] && this.view.hit(slot, e.clientX, e.clientY, r)) return { type: 'equip', slot };
      }
    }
    return null;
  }

  itemOf(src) { return src.type === 'slot' ? this.inv.slots[src.i] : this.inv.equipped[src.slot]; }

  down(e) {
    if (this.detail.classList.contains('on') || this.drag || this.pending || (e.button != null && e.button > 0)) return;
    const src = this.pick(e);
    if (!src) return;
    this.pending = { src, x: e.clientX, y: e.clientY, id: e.pointerId, touch: e.pointerType !== 'mouse', timer: 0 };
    if (this.pending.touch) {
      this.pending.timer = setTimeout(() => { if (this.pending) this.startDrag(this.pending.x, this.pending.y); }, HOLD_MS);
    }
  }

  move(e) {
    const p = this.pending;
    if (p && e.pointerId === p.id && !this.drag) {
      const d = Math.hypot(e.clientX - p.x, e.clientY - p.y);
      if (!p.touch && d > DRAG_PX) this.startDrag(e.clientX, e.clientY);
      else if (p.touch && d > DRAG_PX * 1.5) this.cancel(); // палец поехал до долгого нажатия: это прокрутка
    }
    if (!this.drag) return;
    this.placeGhost(e.clientX, e.clientY);
    this.markDrop(e.clientX, e.clientY);
  }

  startDrag(x, y) {
    const p = this.pending;
    if (!p) return;
    clearTimeout(p.timer);
    const item = this.itemOf(p.src);
    if (!item) { this.pending = null; return; }
    const ghost = el('div', { class: 'inv-ghost' });
    ghost.style.setProperty('--rar', item.rarityInfo.color);
    ghost.innerHTML = `<span class="it">${ICONS[item.kind] || ''}</span>`;
    this.root.append(ghost);
    this.drag = { src: p.src, item, ghost, id: p.id };
    this.pending = null;
    try { this.root.setPointerCapture(p.id); } catch (err) { /* не критично */ }
    this.root.classList.add('dragging');
    this.refresh();
    this.placeGhost(x, y);
    this.markDrop(x, y);
  }

  placeGhost(x, y) {
    const r = this.root.getBoundingClientRect();
    this.drag.ghost.style.transform = `translate(${x - r.left}px, ${y - r.top}px) translate(-50%, -60%)`;
  }

  /** Ячейка под точкой (или -1) и находится ли точка над витриной. */
  target(x, y) {
    const hit = document.elementFromPoint(x, y);
    const cell = hit && hit.closest ? hit.closest('.inv-cell') : null;
    const r = this.stage.getBoundingClientRect();
    return { cell: cell ? +cell.dataset.i : -1, stage: x >= r.left && x <= r.right && y >= r.top && y <= r.bottom };
  }

  markDrop(x, y) {
    const t = this.target(x, y);
    const it = this.drag.item;
    this.cells.forEach((c, i) => c.classList.toggle('drop', i === t.cell && this.canDropOnCell(t.cell)));
    this.stage.classList.toggle('drop', t.stage && this.drag.src.type === 'slot' && !!it.slot);
  }

  canDropOnCell(i) {
    const d = this.drag;
    if (i < 0) return false;
    if (d.src.type === 'slot') return i !== d.src.i;
    const there = this.inv.slots[i];
    return !there || there.slot === d.src.slot; // на занятую ячейку фолиант можно, только если лежащий там предмет надевается на то же место
  }

  up(e) {
    if (this.pending && e.pointerId === this.pending.id) { // нажатие без перетаскивания: показать данные предмета
      const src = this.pending.src;
      this.cancel();
      const item = this.itemOf(src);
      if (item) this.showDetail(src, item);
      return;
    }
    const d = this.drag;
    if (!d) return;
    const t = this.target(e.clientX, e.clientY);
    const inv = this.inv;
    this.endDrag();
    if (d.src.type === 'slot') {
      if (t.cell >= 0) inv.moveSlot(d.src.i, t.cell);
      else if (t.stage && d.item.slot) inv.equipFrom(d.src.i);
    } else if (t.cell >= 0) {
      inv.unequipTo(d.src.slot, t.cell);
    } else if (!t.stage && e.clientY > this.stage.getBoundingClientRect().bottom) {
      inv.unequip(d.src.slot); // отпустили над панелью, но мимо ячейки: в первую свободную
    }
    this.refresh();
  }

  endDrag() {
    const d = this.drag;
    if (!d) return;
    d.ghost.remove();
    this.drag = null;
    this.root.classList.remove('dragging');
    this.cells.forEach((c) => c.classList.remove('drop'));
    this.stage.classList.remove('drop');
    try { this.root.releasePointerCapture(d.id); } catch (err) { /* не критично */ }
  }

  cancel() {
    if (this.pending) { clearTimeout(this.pending.timer); this.pending = null; }
    if (this.drag) { this.endDrag(); this.refresh(); }
  }

  // --- Окно данных предмета -------------------------------------------------------------------------------------

  showDetail(src, item) {
    const rows = item.details().map(([k, v]) => `<div class="row"><span>${k}</span><b>${v}</b></div>`).join('');
    const equipped = src.type === 'equip';
    this.detail.innerHTML = `
      <div class="card" style="--rar:${item.rarityInfo.color}">
        <div class="head"><span class="it">${ICONS[item.kind] || ''}</span>
          <div><div class="name">${item.name}</div><div class="sub">${item.kindInfo.label} · ${item.rarityInfo.label}${equipped ? ' · Equipped' : ''}</div></div></div>
        <div class="rows">${rows}</div>
        <p class="desc">${item.desc}</p>
        <div class="acts"><button type="button" data-act="toggle">${equipped ? 'Unequip' : 'Equip'}</button><button type="button" data-act="close">Close</button></div>
      </div>`;
    const toggle = this.detail.querySelector('[data-act="toggle"]');
    if (!equipped && !item.slot) toggle.style.display = 'none';
    toggle.addEventListener('click', () => {
      if (equipped) this.inv.unequip(src.slot);
      else this.inv.equipFrom(src.i);
      this.hideDetail();
    });
    this.detail.querySelector('[data-act="close"]').addEventListener('click', () => this.hideDetail());
    this.detail.classList.add('on');
  }

  hideDetail() { this.detail.classList.remove('on'); }
}
