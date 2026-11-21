// Окно магазина в стиле инвентаря: сверху витрина с псом-продавцом за прилавком (3D, ShopView), под ней полоса
// с душами и сетка товаров. Нажатие на товар открывает его карточку на месте пса, там же кнопка покупки.
import { ShopView } from './shop_view.js';
import { SOUL_ICON, GEM_ICON } from './inventory_ui.js';
import { makeStaffIcons, iconOf } from './staff_icons.js';
import { pearlGem, fireStaff, iceStaff, electricStaff, gravityStaff, laserStaff, bladesStaff } from './items.js';

/** Витрина: что продаётся и за сколько душ. Цены временные, итог задаст таблица экономики. */
export const CATALOG = [
  { make: pearlGem, price: 200 },
  { make: fireStaff, price: 2500 },
  { make: iceStaff, price: 2500 },
  { make: electricStaff, price: 2500 },
  { make: gravityStaff, price: 3500 },
  { make: laserStaff, price: 3500 },
  { make: bladesStaff, price: 3500 },
];
const CELLS = 12;

function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
  e.append(...kids);
  return e;
}

export class ShopUi {
  constructor(root, inv, renderer, cfg, onClose) {
    this.inv = inv; this.renderer = renderer; this.cfg = cfg; this.onClose = onClose;
    this.open = false; this.view = null; this.icons = null; this.sel = -1;
    this.preview = CATALOG.map((e) => e.make());
    this.close = el('button', { id: 'shop-close', type: 'button', 'aria-label': 'Close' }, '✕');
    this.detail = el('div', { class: 'shop-detail' });
    this.stage = el('div', { class: 'inv-stage shop-stage' }, this.detail);
    this.souls = el('b', {}, '0');
    const ico = el('span', { class: 'inv-ico' });
    ico.innerHTML = SOUL_ICON;
    const strip = el('div', { class: 'inv-strip' },
      el('div', { class: 'inv-stat souls', title: 'Souls' }, ico, this.souls),
      el('div', { class: 'inv-stat items shop-title' }, 'SHOP'));
    this.grid = el('div', { class: 'inv-grid' });
    this.grid.style.setProperty('--cols', String(cfg.columns));
    this.cells = [];
    for (let i = 0; i < CELLS; i++) {
      const c = el('div', { class: 'inv-cell shop-cell' });
      c.dataset.i = String(i);
      c.addEventListener('click', () => { if (CATALOG[i]) this.select(i); });
      this.cells.push(c);
      this.grid.append(c);
    }
    this.panel = el('div', { class: 'inv-panel' }, strip, this.grid);
    this.root = el('div', { id: 'inv', class: 'shop' }, this.stage, this.panel, this.close);
    this.root.id = 'shop';
    this.root.style.setProperty('--stage', `${Math.round(cfg.stageFrac * 100)}%`);
    root.append(this.root);
    this.close.addEventListener('click', () => this.hide());
    window.addEventListener('keydown', (e) => { if (this.open && e.key === 'Escape') { if (this.sel >= 0) this.select(-1); else this.hide(); } });
    inv.listen(() => { if (this.open) this.refresh(); });
  }

  icon(item) {
    if (item.kind === 'staff') {
      const url = iconOf(this.icons, item);
      if (url) return `<img src="${url}" alt="" draggable="false">`;
      return GEM_ICON;
    }
    return GEM_ICON;
  }

  refresh() {
    this.souls.textContent = String(this.inv.souls);
    this.cells.forEach((c, i) => {
      const e = CATALOG[i], it = this.preview[i];
      c.classList.toggle('full', !!e);
      c.classList.toggle('sel', i === this.sel);
      c.style.setProperty('--rar', it ? it.rarityInfo.color : 'transparent');
      c.innerHTML = e ? `<span class="it">${this.icon(it)}</span><b class="price${this.inv.souls < e.price ? ' poor' : ''}">${e.price.toLocaleString('en-US')}</b>` : '';
    });
    if (this.sel >= 0) this.renderDetail();
  }

  /** i < 0: вернуть пса. Иначе показать карточку товара i на месте пса. */
  select(i) {
    this.sel = i;
    this.cells.forEach((c, k) => c.classList.toggle('sel', k === i));
    this.detail.classList.toggle('on', i >= 0);
    if (i >= 0) this.renderDetail();
  }

  renderDetail() {
    const e = CATALOG[this.sel], it = this.preview[this.sel];
    const inv = this.inv;
    const rows = it.details().filter(([k]) => k !== 'Condition' && k !== 'Sharpening').map(([k, v]) => `<div class="row"><span>${k}</span><b>${v}</b></div>`).join('');
    const poor = inv.souls < e.price, full = inv.full;
    this.detail.innerHTML = `
      <div class="card" style="--rar:${it.rarityInfo.color}">
        <div class="head"><span class="it">${this.icon(it)}</span>
          <div><div class="name">${it.label}</div><div class="sub">${it.kindInfo.label} · ${it.rarityInfo.label}</div></div></div>
        <div class="rows">${rows}</div>
        <p class="desc">${it.desc}</p>
        <div class="acts"><button type="button" class="buy" data-act="buy"${poor || full ? ' disabled' : ''}>${full ? 'Inventory full' : `Buy ${e.price.toLocaleString('en-US')}`}<i class="inv-ico">${SOUL_ICON}</i></button><button type="button" data-act="back">Back</button></div>
      </div>`;
    this.detail.querySelector('[data-act="buy"]').addEventListener('click', () => this.buy());
    this.detail.querySelector('[data-act="back"]').addEventListener('click', () => this.select(-1));
  }

  buy() {
    const e = CATALOG[this.sel];
    if (!e || this.inv.full || !this.inv.spendSouls(e.price)) return;
    this.inv.add(e.make());
    this.refresh();
  }

  show() {
    if (this.open) return true;
    this.open = true;
    this.root.classList.add('on');
    this.select(-1);
    this.refresh();
    this.grid.scrollTop = 0;
    if (!this.view && !this.viewFailed) {
      this.initFrame = requestAnimationFrame(() => {
        this.initFrame = null;
        if (!this.open || this.view || this.viewFailed) return;
        try { this.view = new ShopView(this.renderer); } catch (error) { this.viewFailed = true; console.warn('Shop 3D view unavailable', error); }
      });
    }
    if (!this.icons && !this.iconsFailed) {
      this.iconsTimer = setTimeout(() => {
        this.iconsTimer = null;
        if (!this.open || this.icons || this.iconsFailed) return;
        try { this.icons = makeStaffIcons(); if (!Object.keys(this.icons).length) this.iconsFailed = true; } catch (error) { this.iconsFailed = true; }
        if (this.open) this.refresh();
      }, 250);
    }
    return true;
  }

  hide() {
    if (!this.open) return;
    if (this.initFrame != null) cancelAnimationFrame(this.initFrame);
    if (this.iconsTimer != null) clearTimeout(this.iconsTimer);
    this.initFrame = this.iconsTimer = null;
    this.open = false;
    this.root.classList.remove('on');
    if (this.onClose) this.onClose();
  }

  render(dt) {
    if (!this.open || !this.view) return false;
    try {
      this.view.render(dt, this.stage.getBoundingClientRect(), this.renderer.domElement.getBoundingClientRect());
      return true;
    } catch (error) {
      this.view = null; this.viewFailed = true;
      console.warn('Shop 3D render unavailable', error);
      return false;
    }
  }
}
