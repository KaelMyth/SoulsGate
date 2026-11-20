// Окно заточки (наковальня в мастерской зачарования): посох на постаменте, ячейка для камня, шанс и прибавка к характеристикам.
// Камень тянется из лотка в ячейку (или нажатием). Цена в камнях и шанс берутся из sharpen.js, таблицы из CONFIG.sharpen.
import { makeStaffIcons } from './staff_icons.js';
import { sharpenInfo, attemptSharpen, sharpenedStats } from './sharpen.js';
import { GEM_ICON, COIN } from './inventory_ui.js';

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  n.append(...kids);
  return n;
}
const ico = (svg, cls = 'ico') => { const s = el('span', { class: cls }); s.innerHTML = svg; return s; };

export class ForgeUi {
  /** root: рамка игры (#phone); game: Game (нужны inventory и cfg); onClose: после закрытия */
  constructor(root, game, onClose) {
    this.game = game;
    this.inv = game.inventory;
    this.cfg = game.cfg;
    this.onClose = onClose;
    this.open = false;
    this.sel = null;      // выбранный посох
    this.filled = false;  // камни лежат в ячейке
    this.busy = false;    // идёт анимация результата
    this.icons = null;
    this.drag = null;

    this.title = el('div', { class: 'fg-title' }, 'Enchanting');
    this.coins = el('b', {}, '0');
    this.closeBtn = el('button', { type: 'button', class: 'fg-close', 'aria-label': 'Close' }, '✕');
    const top = el('div', { class: 'fg-top' }, this.closeBtn, this.title, el('div', { class: 'fg-coins' }, this.coins, ico(COIN)));

    this.chips = el('div', { class: 'fg-chips' });

    // Сцена: свечение, рунное кольцо, посох над постаментом.
    this.img = el('img', { class: 'fg-staff', alt: '', draggable: 'false' });
    this.name = el('div', { class: 'fg-name' });
    this.fx = el('div', { class: 'fg-fx' });
    const ped = el('div', { class: 'fg-ped' }, el('i', { class: 'slab' }), el('i', { class: 'col' }), el('i', { class: 'base' }));
    this.stage = el('div', { class: 'fg-stage' }, el('div', { class: 'fg-aura' }), el('div', { class: 'fg-ring' }), el('div', { class: 'fg-ring r2' }), this.img, ped, this.fx);
    for (let i = 0; i < 12; i++) { const s = el('i', { class: 'fg-spark' }); s.style.setProperty('--i', String(i)); this.stage.append(s); }

    // Ячейка для камня.
    this.socket = el('div', { class: 'fg-socket' });
    this.socketHint = el('div', { class: 'fg-socket-hint' });
    const socketWrap = el('div', { class: 'fg-socket-wrap' }, this.socket, this.socketHint);

    // Данные: шанс и характеристики.
    this.chance = el('b', {}, '100%');
    this.bar = el('i', {});
    this.rows = el('div', { class: 'fg-rows' });
    this.info = el('div', { class: 'fg-info' },
      el('div', { class: 'fg-chance' }, el('span', {}, 'Chance'), this.chance),
      el('div', { class: 'fg-bar' }, this.bar), this.rows);

    this.trayCount = el('b', {}, '×0');
    this.tray = el('div', { class: 'fg-tray' }, ico(GEM_ICON, 'ico gem'), this.trayCount);
    this.trayLabel = el('div', { class: 'fg-tray-label' }, 'Pearl gems · drag to the socket');
    this.go = el('button', { type: 'button', class: 'fg-go' }, 'Sharpen');
    this.toast = el('div', { class: 'fg-toast' });
    const bottom = el('div', { class: 'fg-bottom' }, el('div', { class: 'fg-trayrow' }, this.tray, this.trayLabel), this.go);

    this.root = el('div', { id: 'forge' }, top, this.chips, el('div', { class: 'fg-mid' }, this.stage, socketWrap, this.name), this.info, bottom, this.toast);
    root.append(this.root);

    this.closeBtn.addEventListener('click', () => this.hide());
    window.addEventListener('keydown', (e) => { if (this.open && e.key === 'Escape') this.hide(); });
    this.go.addEventListener('click', () => this.sharpen());
    this.tray.addEventListener('click', () => { if (!this.drag) this.fill(); });
    this.socket.addEventListener('click', () => { if (this.filled && !this.busy) { this.filled = false; this.refresh(); } else this.fill(); });
    this.tray.addEventListener('pointerdown', (e) => this.dragStart(e));
    this.root.addEventListener('pointermove', (e) => this.dragMove(e));
    this.root.addEventListener('pointerup', (e) => this.dragEnd(e));
    this.root.addEventListener('pointercancel', () => this.dragCancel());
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.root.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    this.inv.listen(() => { if (this.open && !this.busy) this.refresh(); });
  }

  staffs() {
    const list = [];
    if (this.inv.equipped.staff) list.push(this.inv.equipped.staff);
    for (const s of this.inv.slots) if (s && s.kind === 'staff') list.push(s);
    return list;
  }

  show() {
    if (this.open) return;
    this.open = true;
    if (!this.icons) this.icons = makeStaffIcons(380);
    const l = this.staffs();
    this.sel = l.includes(this.sel) ? this.sel : l[0] || null;
    this.filled = false;
    this.busy = false;
    this.root.classList.add('show');
    this.refresh();
    requestAnimationFrame(() => requestAnimationFrame(() => this.root.classList.add('on')));
  }

  hide() {
    if (!this.open || this.busy) return;
    this.open = false;
    this.dragCancel();
    this.root.classList.remove('on');
    setTimeout(() => { if (!this.open) this.root.classList.remove('show'); }, 420);
    if (this.onClose) this.onClose();
  }

  urlOf(item) { return (this.icons && this.icons[item.element || 'basic']) || ''; }

  fill() {
    if (this.busy || !this.sel) return;
    const info = sharpenInfo(this.cfg, this.sel.sharpen);
    if (info.maxed) return this.say('This staff is at the maximum');
    if (this.inv.gemCount() < info.cost) return this.say(`You need ${info.cost} pearl gem${info.cost > 1 ? 's' : ''}`);
    this.filled = true;
    this.refresh();
  }

  say(t) {
    this.toast.textContent = t;
    this.toast.classList.remove('on'); void this.toast.offsetWidth; this.toast.classList.add('on');
  }

  refresh() {
    const inv = this.inv;
    this.coins.textContent = String(inv.coins);
    const list = this.staffs();
    if (!list.includes(this.sel)) { this.sel = list[0] || null; this.filled = false; }
    this.chips.innerHTML = '';
    for (const it of list) {
      const b = el('button', { type: 'button', class: 'fg-chip' + (it === this.sel ? ' on' : '') });
      b.innerHTML = `<img src="${this.urlOf(it)}" alt="" draggable="false">${it.sharpen ? `<b>+${it.sharpen}</b>` : ''}`;
      b.addEventListener('click', () => { if (this.busy) return; this.sel = it; this.filled = false; this.refresh(); });
      this.chips.append(b);
    }
    const it = this.sel;
    this.stage.classList.toggle('empty', !it);
    if (!it) { this.name.textContent = 'No staff'; this.img.removeAttribute('src'); this.rows.innerHTML = ''; this.go.disabled = true; this.trayCount.textContent = `×${inv.gemCount()}`; return; }
    this.img.src = this.urlOf(it);
    this.name.textContent = it.label;
    this.name.style.setProperty('--rar', it.rarityInfo.color);
    const info = sharpenInfo(this.cfg, it.sharpen);
    const cur = sharpenedStats(this.cfg, it.sharpen);
    const nxt = sharpenedStats(this.cfg, info.next);
    const have = inv.gemCount();
    this.trayCount.textContent = `×${have}`;
    this.chance.textContent = info.maxed ? '—' : `${Math.round(info.chance * 100)}%`;
    this.bar.style.width = `${info.maxed ? 0 : Math.round(info.chance * 100)}%`;
    this.bar.style.setProperty('--c', info.chance > 0.65 ? '#6fe08a' : info.chance > 0.35 ? '#ffc65a' : '#ff6a5a');
    const row = (label, a, b) => `<div class="r"><span>${label}</span><em>${a}</em><i>→</i><strong>${info.maxed ? a : b}</strong></div>`;
    this.rows.innerHTML = row('Damage', cur.damage.toFixed(2), nxt.damage.toFixed(2))
      + row('Attack speed', cur.rate.toFixed(2) + '/s', nxt.rate.toFixed(2) + '/s')
      + row('Range', cur.range.toFixed(1) + ' m', nxt.range.toFixed(1) + ' m');
    this.socket.classList.toggle('filled', this.filled);
    this.socket.innerHTML = this.filled ? `<span class="ico gem">${GEM_ICON}</span><b>×${info.cost}</b>` : '<span class="plus">+</span>';
    this.socketHint.textContent = info.maxed ? 'Maximum' : this.filled ? 'Tap to take back' : `Needs ${info.cost} pearl gem${info.cost > 1 ? 's' : ''}`;
    this.go.disabled = !this.filled || this.busy;
    this.go.textContent = info.maxed ? 'Maxed' : `Sharpen to +${info.next}`;
  }

  sharpen() {
    const it = this.sel;
    if (!it || !this.filled || this.busy) return;
    this.busy = true;
    this.go.disabled = true;
    this.stage.classList.add('charging');
    setTimeout(() => {
      const r = attemptSharpen(this.cfg, this.inv, it);
      this.stage.classList.remove('charging');
      this.filled = false;
      const cls = r.ok ? 'win' : 'lose';
      this.stage.classList.add(cls);
      if (r.ok) { this.say(`${it.name} +${r.level}`); this.name.textContent = it.label; this.img.src = this.urlOf(it); }
      else if (r.broken) this.say('The staff broke! Find it in the Broken tab');
      else this.say('Not enough gems');
      setTimeout(() => {
        this.stage.classList.remove(cls);
        this.busy = false;
        this.refresh();
      }, r.ok ? 900 : 1300);
    }, 900);
  }

  // Перетаскивание камня из лотка в ячейку.
  dragStart(e) {
    if (this.busy || e.button > 0) return;
    const g = el('div', { class: 'fg-ghost' });
    g.append(ico(GEM_ICON, 'ico gem'));
    g.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%)`;
    this.root.append(g);
    this.drag = { g, x: e.clientX, y: e.clientY, id: e.pointerId, moved: false };
    try { this.root.setPointerCapture(e.pointerId); } catch (err) { /* не критично */ }
  }
  dragMove(e) {
    const d = this.drag;
    if (!d) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) d.moved = true;
    d.g.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%)`;
    const r = this.socket.getBoundingClientRect();
    this.socket.classList.toggle('drop', e.clientX > r.left - 20 && e.clientX < r.right + 20 && e.clientY > r.top - 20 && e.clientY < r.bottom + 20);
  }
  dragEnd(e) {
    const d = this.drag;
    if (!d) return;
    const r = this.socket.getBoundingClientRect();
    const over = e.clientX > r.left - 20 && e.clientX < r.right + 20 && e.clientY > r.top - 20 && e.clientY < r.bottom + 20;
    const moved = d.moved;
    this.dragCancel();
    if (moved && over) this.fill();
    else if (!moved) this.fill();
  }
  dragCancel() {
    if (!this.drag) return;
    this.drag.g.remove();
    this.drag = null;
    this.socket.classList.remove('drop');
  }
}
