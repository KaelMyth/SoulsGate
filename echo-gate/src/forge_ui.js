// Окно заточки (наковальня в мастерской зачарования): посох на постаменте, ячейка для камня, шанс и прибавка к характеристикам.
// Камни вложены в ячейку по умолчанию, характеристики открываются по кнопке «i». Цена в камнях и шанс берутся из sharpen.js, таблицы из CONFIG.sharpen.
import { makeStaffIcons } from './staff_icons.js';
import { ForgeScene } from './forge_scene.js';
import { sharpenInfo, attemptSharpen, sharpenedStats } from './sharpen.js';
import { GEM_ICON, SOUL_ICON } from './inventory_ui.js';

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
    this.filled = false;  // камней хватает, они лежат в ячейке
    this.busy = false;    // идёт анимация результата
    this.icons = null;

    this.title = el('div', { class: 'fg-title' }, 'Enchanting');
    this.souls = el('b', {}, '0');
    this.closeBtn = el('button', { type: 'button', class: 'fg-close', 'aria-label': 'Close' }, '✕');
    const top = el('div', { class: 'fg-top' }, this.closeBtn, this.title, el('div', { class: 'fg-coins' }, this.souls, ico(SOUL_ICON)));

    this.chips = el('div', { class: 'fg-chips' });

    // Сцена рисуется 3D (forge_scene.js) на своём холсте под окном.
    this.canvas = el('canvas', { class: 'fg-canvas' });
    this.name = el('div', { class: 'fg-name' });
    this.stage = this.canvas; // для совместимости: классы состояния вешаются на холст

    // Ячейка для камня.
    this.socket = el('div', { class: 'fg-socket' });
    this.socketHint = el('div', { class: 'fg-socket-hint' });
    const socketWrap = el('div', { class: 'fg-socket-wrap' }, this.socket, this.socketHint);

    // Шанс всегда на виду, характеристики только по кнопке «i».
    this.chance = el('b', {}, '100%');
    this.chanceBox = el('div', { class: 'fg-chance' }, el('span', {}, 'Chance'), this.chance);
    this.infoBtn = el('button', { type: 'button', class: 'fg-i', 'aria-label': 'Stats' }, 'i');
    this.rows = el('div', { class: 'fg-rows' });
    this.sheet = el('div', { class: 'fg-sheet' }, this.rows);
    this.go = el('button', { type: 'button', class: 'fg-go' }, 'Sharpen');
    this.toast = el('div', { class: 'fg-toast' });
    const bottom = el('div', { class: 'fg-bottom' }, this.infoBtn, this.go);

    this.root = el('div', { id: 'forge' }, this.canvas, top, this.chips, el('div', { class: 'fg-mid' }, socketWrap, this.chanceBox, this.name), this.sheet, bottom, this.toast);
    root.append(this.root);

    this.closeBtn.addEventListener('click', () => this.hide());
    window.addEventListener('keydown', (e) => { if (this.open && e.key === 'Escape') this.hide(); });
    this.go.addEventListener('click', () => this.sharpen());
    this.infoBtn.addEventListener('click', () => this.sheet.classList.toggle('on'));
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
    if (!this.icons) this.icons = makeStaffIcons(160);
    if (!this.scene) {
      try { this.scene = new ForgeScene(this.canvas); } catch (err) { this.scene = null; }
    }
    const l = this.staffs();
    this.sel = l.includes(this.sel) ? this.sel : l[0] || null;
    this.busy = false;
    this.root.classList.remove('busy');
    this.sheet.classList.remove('on');
    this.root.classList.add('show');
    this.refresh();
    requestAnimationFrame(() => requestAnimationFrame(() => this.root.classList.add('on')));
    this.lastT = performance.now();
    const loop = (now) => {
      if (!this.open) return;
      const dt = (now - this.lastT) / 1000; this.lastT = now;
      if (this.scene) {
        const w = this.root.clientWidth, h = this.root.clientHeight;
        if (w !== this.sw || h !== this.sh) { this.sw = w; this.sh = h; this.scene.resize(w, h); }
        this.scene.update(dt); this.scene.render();
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  hide() {
    if (!this.open || this.busy) return;
    this.open = false;
    this.root.classList.remove('on');
    setTimeout(() => { if (!this.open) this.root.classList.remove('show'); }, 420);
    if (this.onClose) this.onClose();
  }

  urlOf(item) { return (this.icons && this.icons[item.element || 'basic']) || ''; }

  say(t) {
    this.toast.textContent = t;
    this.toast.classList.remove('on'); void this.toast.offsetWidth; this.toast.classList.add('on');
  }

  refresh() {
    const inv = this.inv;
    this.souls.textContent = String(inv.souls);
    const list = this.staffs();
    if (!list.includes(this.sel)) this.sel = list[0] || null;
    this.chips.innerHTML = '';
    for (const it of list) {
      const b = el('button', { type: 'button', class: 'fg-chip' + (it === this.sel ? ' on' : '') });
      b.innerHTML = `<img src="${this.urlOf(it)}" alt="" draggable="false">${it.sharpen ? `<b>+${it.sharpen}</b>` : ''}`;
      b.addEventListener('click', () => { if (this.busy) return; this.sel = it; this.refresh(); });
      this.chips.append(b);
    }
    const it = this.sel;
    if (!it) { this.name.textContent = 'No staff'; this.rows.innerHTML = ''; this.go.disabled = true; return; }
    if (this.scene) { if (this.scene.broken) this.scene.restore(); this.scene.setStaff(it.element || 'basic'); }
    this.name.textContent = it.label;
    this.name.style.setProperty('--rar', it.rarityInfo.color);
    const info = sharpenInfo(this.cfg, it.sharpen);
    const cur = sharpenedStats(this.cfg, it.sharpen);
    const nxt = sharpenedStats(this.cfg, info.next);
    const have = inv.gemCount();
    this.chance.textContent = info.maxed ? '—' : `${Math.round(info.chance * 100)}%`;
    this.chanceBox.style.setProperty('--c', info.chance > 0.65 ? '#6fe08a' : info.chance > 0.35 ? '#ffc65a' : '#ff6a5a');
    const row = (label, a, b) => `<div class="r"><span>${label}</span><em>${a}</em><i>→</i><strong>${info.maxed ? a : b}</strong></div>`;
    this.rows.innerHTML = row('Damage', cur.damage.toFixed(2), nxt.damage.toFixed(2))
      + row('Attack speed', cur.rate.toFixed(2) + '/s', nxt.rate.toFixed(2) + '/s')
      + row('Range', cur.range.toFixed(1) + ' m', nxt.range.toFixed(1) + ' m');
    this.filled = !info.maxed && have >= info.cost; // камни вложены сами, если их хватает
    this.socket.classList.toggle('filled', this.filled);
    this.socket.innerHTML = info.maxed ? '' : `<span class="ico gem">${GEM_ICON}</span><b>${this.filled ? `×${info.cost}` : `${have}/${info.cost}`}</b>`;
    this.socketHint.textContent = info.maxed ? 'Maximum' : this.filled ? '' : 'Not enough gems';
    this.go.disabled = !this.filled || this.busy;
    this.go.textContent = info.maxed ? 'Maxed' : `Sharpen to +${info.next}`;
  }

  sharpen() {
    const it = this.sel;
    if (!it || !this.filled || this.busy) return;
    this.busy = true;
    this.root.classList.add('busy'); // на время ковки список посохов уходит, чтобы не закрывать анимацию
    this.go.disabled = true;
    if (this.scene) this.scene.charge();
    this.socket.classList.add('firing');
    setTimeout(() => {
      const r = attemptSharpen(this.cfg, this.inv, it);
      this.socket.classList.remove('firing');
      if (this.scene) { if (r.ok) this.scene.win(); else this.scene.lose(); }
      if (r.ok) { this.say(`${it.name} +${r.level}`); this.name.textContent = it.label; }
      else if (r.broken) this.say('The staff broke! Find it in the Broken tab');
      else this.say('Not enough gems');
      setTimeout(() => {
        this.busy = false;
        this.root.classList.remove('busy');
        this.refresh();
      }, r.ok ? 900 : 1300);
    }, 900);
  }
}
