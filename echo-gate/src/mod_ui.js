// Меню модификатора после рулетки в виде созвездия (как в Skyrim): внизу навершие посоха (3D), от него две ветки.
// Сначала линий нет, только два слегка подсвеченных ареола: туда можно повесить модификатор. Когда модификатор повешен, ареол
// загорается звездой, от посоха к ней прорисовывается полоска света, и от звезды отходят ещё два ареола (в ветке до branchMax ячеек).
// Положение ячеек считается само: дерево раскладывается по экрану силами отталкивания и пружинами к родителю в пределах своей половины.
import * as THREE from 'three';
import { buildStaffModel } from './staff_models.js';
import { lookTier } from './staff_tiers.js';
import { glowTexture } from './staff_icons.js';
import { MOD_INFO, isMult, multOf } from './mods.js';
import { MOD_ICON } from './mod_icons.js';

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  n.append(...kids);
  return n;
}
const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };

const HEAD_Y = 0.91; // навершие по высоте поля (доля), по ширине в центре

/** Раскладка ячеек по полю W x H (px): положения всех ячеек, дерево само расходится по своей половине экрана. */
export function layoutCells(cells, W, H) {
  const hx = W * 0.5, hy = H * HEAD_Y;
  const n = cells.length;
  const step = Math.max(58, Math.min(H * 0.115, W * 0.26)); // длина звена
  const minD = Math.max(54, Math.min(W * 0.17, H * 0.08));
  const pos = new Array(n);
  const dirs = new Array(n);
  const kids = cells.map(() => []);
  cells.forEach((c, i) => { if (c.parent >= 0) kids[c.parent].push(i); });
  // Первое приближение: звено от родителя вверх и в сторону своей ветки, дети веером.
  const place = (i) => {
    const c = cells[i];
    let from, base;
    if (c.parent === -1) { from = { x: hx, y: hy }; base = (c.branch === 0 ? -1 : 1) * 0.62; }
    else {
      from = pos[c.parent];
      const sibs = kids[c.parent];
      const k = sibs.indexOf(i);
      const spread = sibs.length > 1 ? (k === 0 ? -0.4 : 0.4) : 0;
      base = Math.max(-1.25, Math.min(1.25, dirs[c.parent] + spread));
    }
    dirs[i] = base;
    const len = c.parent === -1 ? step * 1.9 : step;
    pos[i] = { x: from.x + Math.sin(base) * len, y: from.y - Math.cos(base) * len };
  };
  const order = [];
  const walk = (i) => { order.push(i); kids[i].forEach(walk); };
  cells.forEach((c, i) => { if (c.parent === -1) walk(i); });
  order.forEach(place);
  // Релаксация: отталкивание, пружины к родителю, границы, своя половина экрана.
  for (let it = 0; it < 140; it++) {
    const f = pos.map(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        // расстояние считаем с запасом по горизонтали: у звезды справа подпись, соседи не должны на неё налезать
        const dx = pos[i].x - pos[j].x, dy = pos[i].y - pos[j].y;
        const d = Math.hypot(dx * 0.65, dy) || 0.01;
        if (d < minD) { const push = (minD - d) * 0.5; f[i].x += dx / (Math.hypot(dx, dy) || 1) * push; f[i].y += dy / (Math.hypot(dx, dy) || 1) * push; f[j].x -= dx / (Math.hypot(dx, dy) || 1) * push; f[j].y -= dy / (Math.hypot(dx, dy) || 1) * push; }
      }
      const c = cells[i];
      const from = c.parent === -1 ? { x: hx, y: hy } : pos[c.parent];
      const rest = c.parent === -1 ? step * 1.9 : step;
      const dx = pos[i].x - from.x, dy = pos[i].y - from.y, d = Math.hypot(dx, dy) || 0.01;
      const k = (d - rest) * 0.12;
      f[i].x -= dx / d * k; f[i].y -= dy / d * k;
      if (c.parent >= 0) { f[c.parent].x += dx / d * k * 0.5; f[c.parent].y += dy / d * k * 0.5; }
    }
    for (let i = 0; i < n; i++) {
      // Мягкая направляющая: слабая пружина к оси своей ветки, чтобы дерево росло столбом, а не уходило к краю.
      const axis = hx + (cells[i].branch === 0 ? -1 : 1) * W * 0.2;
      f[i].x += (axis - pos[i].x) * 0.03;
      pos[i].x += f[i].x; pos[i].y += f[i].y;
      const side = cells[i].branch === 0 ? [W * 0.02, W * 0.49] : [W * 0.51, W * 0.98];
      pos[i].x = Math.max(side[0], Math.min(side[1], pos[i].x));
      pos[i].y = Math.max(H * 0.1, Math.min(H * 0.86, pos[i].y));
    }
  }
  // Подгонка: если ветка вылезла за свою рамку, всё созвездие ветки сжимается к посоху (форма сохраняется), звёзды до края не доходят.
  const padX = Math.max(34, W * 0.1), top = H * 0.24;
  for (let b = 0; b < 2; b++) {
    let s = 1;
    for (let i = 0; i < n; i++) {
      if (cells[i].branch !== b) continue;
      const dx = Math.abs(pos[i].x - hx), dy = hy - pos[i].y;
      const roomX = (b === 0 ? hx - padX : W - padX - hx);
      if (dx > roomX) s = Math.min(s, roomX / dx);
      if (dy > hy - top) s = Math.min(s, (hy - top) / dy);
    }
    if (s < 1) for (let i = 0; i < n; i++) if (cells[i].branch === b) { pos[i].x = hx + (pos[i].x - hx) * s; pos[i].y = hy + (pos[i].y - hy) * s; }
  }
  return pos;
}

/** Короткая подпись под звездой по модификатору и усилению. */
function valueText(mod, root, boost, cfg) {
  if (isMult(mod)) return root ? `×${multOf(cfg, mod) * boost} shots` : `×${multOf(cfg, mod) * boost} boost`;
  if (mod === 'might') return `+${Math.round(cfg.damage * boost * 100)}% dmg`;
  if (mod === 'swift') return `+${Math.round(cfg.rate * boost * 100)}% rate`;
  return `${cfg.pierce * boost} target${cfg.pierce * boost > 1 ? 's' : ''}`;
}

export class ModMenu {
  /** root: рамка игры; game: Game (stats.mods, cfg.mods, inventory) */
  constructor(root, game) {
    this.game = game;
    this.open = false;
    this.busy = false;
    this.mod = null;
    this.done = null;
    this.nodes = [];
    this.size = { w: 0, h: 0 };

    this.cardIcon = el('div', { class: 'mm-icon' });
    this.cardName = el('div', { class: 'mm-name' });
    this.cardTag = el('div', { class: 'mm-tag' });
    this.cardDesc = el('div', { class: 'mm-desc' });
    this.card = el('div', { class: 'mm-card' }, this.cardIcon, el('div', { class: 'mm-text' }, this.cardTag, this.cardName, this.cardDesc));
    this.canvas = el('canvas', { class: 'mm-canvas' });
    this.svg = svgEl('svg', { class: 'mm-streams', viewBox: '0 0 100 100' });
    this.field = el('div', { class: 'mm-field' });
    this.hint = el('div', { class: 'mm-hint' }, 'Tap a glowing point to attach');
    this.skip = el('button', { type: 'button', class: 'mm-skip' }, 'Discard');
    this.root = el('div', { id: 'modmenu', role: 'dialog', 'aria-label': 'Modifier' }, this.canvas, this.svg, this.field, this.card, this.hint, this.skip);
    root.append(this.root);
    this.skip.addEventListener('click', () => { if (!this.busy) this.close(); });
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.root.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
  }

  get mods() { return this.game.stats.mods; }

  /** Открыть меню с выпавшим модификатором; done вызывается после закрытия. */
  show(mod, done) {
    this.mod = mod;
    this.done = done || null;
    this.open = true;
    this.busy = false;
    const info = MOD_INFO[mod];
    this.root.style.setProperty('--m', info.color);
    this.cardIcon.innerHTML = MOD_ICON[mod];
    this.cardName.textContent = info.name;
    this.cardTag.textContent = info.tier === 'legendary' ? 'Legendary modifier' : info.tier === 'epic' ? 'Epic modifier' : 'Modifier';
    this.cardDesc.textContent = info.desc;
    this.card.className = 'mm-card ' + info.tier;
    this.root.style.display = 'flex';
    this.field.replaceChildren(); this.svg.replaceChildren(); this.nodes = [];
    this.rebuild(false);
    this.initScene();
    void this.root.offsetWidth;
    this.root.classList.add('on');
    this.last = performance.now();
    const loop = (now) => {
      if (!this.open) return;
      const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000)); this.last = now;
      this.renderScene(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  close() {
    if (!this.open) return;
    this.open = false;
    cancelAnimationFrame(this.raf);
    this.root.classList.remove('on');
    const done = this.done; this.done = null;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.root.style.display = 'none'; if (done) done(); }, 380);
  }

  /** Принудительно закрыть без продолжения (смена забега). */
  reset() {
    cancelAnimationFrame(this.raf);
    clearTimeout(this.timer);
    this.open = false; this.busy = false; this.done = null;
    this.root.classList.remove('on');
    this.root.style.display = 'none';
  }

  /** Синхронизировать звёзды и линии с ячейками: новые ячейки создаются у родителя и плавно уезжают на своё место;
   * lit: индекс только что загоревшейся звезды (у неё прорисовывается линия), grown: индексы только что выросших ареолов. */
  rebuild(animate, lit = -1, grown = []) {
    const cells = this.mods.cells, C = this.game.cfg.mods;
    const w = this.root.clientWidth || 360, h = this.root.clientHeight || 740;
    this.size = { w, h };
    this.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const pos = layoutCells(cells, w, h);
    const head = { x: w * 0.5, y: h * HEAD_Y };
    cells.forEach((c, i) => {
      let nd = this.nodes[i];
      if (!nd) {
        const from = c.parent === -1 ? head : this.nodes[c.parent] || head;
        nd = { x: from.x, y: from.y, tx: pos[i].x, ty: pos[i].y, born: 0 };
        nd.el = el('button', { type: 'button', class: 'mm-node', 'aria-label': 'Slot ' + (i + 1) });
        nd.el.addEventListener('click', () => this.equip(i));
        nd.g = svgEl('g', { class: 'mm-link' });
        nd.glow = svgEl('path', { class: 'glow', pathLength: '1' });
        nd.core = svgEl('path', { class: 'core', pathLength: '1' });
        nd.flow = svgEl('path', { class: 'flow', pathLength: '1' });
        nd.g.append(nd.glow, nd.core, nd.flow);
        this.svg.append(nd.g);
        this.field.append(nd.el);
        this.nodes[i] = nd;
      }
      nd.tx = pos[i].x; nd.ty = pos[i].y;
      nd.parent = c.parent;
      nd.root = c.parent === -1;
      const filled = !!c.mod;
      nd.el.classList.toggle('filled', filled);
      nd.el.classList.toggle('grow', grown.includes(i));
      nd.el.classList.toggle('flash', i === lit);
      nd.g.setAttribute('class', 'mm-link ' + (filled ? 'lit' : nd.root ? 'none' : 'faint') + (i === lit ? ' grow' : ''));
      if (filled) {
        const info = MOD_INFO[c.mod];
        nd.el.style.setProperty('--m', info.color);
        nd.el.innerHTML = `<span class="star"></span><span class="mv"><span class="mi">${MOD_ICON[c.mod]}</span>${valueText(c.mod, nd.root, this.mods.boost(i), C)}</span>`;
        nd.g.style.setProperty('--m', info.color);
      } else {
        nd.el.innerHTML = '<span class="halo"></span>';
      }
    });
    this.head = head;
    if (!animate) for (const nd of this.nodes) { nd.x = nd.tx; nd.y = nd.ty; }
    this.moveNodes(0);
  }

  /** Плавный переезд звёзд на новые места и перерисовка линий (кривые от родителя к звезде). */
  moveNodes(dt) {
    const k = dt > 0 ? 1 - Math.exp(-dt * 5) : 1;
    this.nodes.forEach((nd, i) => {
      if (!nd) return;
      nd.x += (nd.tx - nd.x) * k; nd.y += (nd.ty - nd.y) * k;
      nd.el.style.transform = `translate(${nd.x.toFixed(1)}px, ${nd.y.toFixed(1)}px)`;
      const a = nd.root ? this.head : this.nodes[nd.parent];
      const ax = a.x, ay = a.y;
      const mx = (ax + nd.x) / 2, my = (ay + nd.y) / 2;
      const len = Math.hypot(nd.x - ax, nd.y - ay) || 1;
      const bend = (i % 2 ? 1 : -1) * len * 0.1;
      const cx = mx + (-(nd.y - ay) / len) * bend, cy = my + ((nd.x - ax) / len) * bend;
      const d = `M${ax.toFixed(1)},${ay.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${nd.x.toFixed(1)},${nd.y.toFixed(1)}`;
      nd.glow.setAttribute('d', d); nd.core.setAttribute('d', d); nd.flow.setAttribute('d', d);
    });
  }

  equip(i) {
    if (!this.open || this.busy || !this.mod) return;
    this.busy = true;
    this.hint.classList.add('off');
    this.skip.classList.add('off');
    const cell = this.nodes[i].el;
    // Значок перелетает из карточки к ячейке.
    const a = this.cardIcon.getBoundingClientRect(), b = cell.getBoundingClientRect();
    const fly = el('div', { class: 'mm-fly' });
    fly.innerHTML = MOD_ICON[this.mod];
    fly.style.left = a.left + a.width / 2 + 'px'; fly.style.top = a.top + a.height / 2 + 'px';
    this.root.append(fly);
    void fly.offsetWidth;
    fly.style.transform = `translate(${b.left + b.width / 2 - (a.left + a.width / 2)}px, ${b.top + b.height / 2 - (a.top + a.height / 2)}px) scale(0.8)`;
    this.card.classList.add('spent');
    setTimeout(() => {
      fly.remove();
      const grown = this.mods.equip(i, this.mod);
      this.rebuild(true, i, grown);
      this.root.classList.add('pulse');
      setTimeout(() => this.root.classList.remove('pulse'), 600);
      setTimeout(() => this.close(), grown.length ? 1900 : 1100);
    }, 620);
  }

  // Навершие посоха: маленькая 3D-сцена на нижней части экрана.
  initScene() {
    if (!this.r) {
      try { this.r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true }); } catch (e) { this.r = null; return; }
      this.r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.scene = new THREE.Scene();
      this.glowTex = glowTexture();
      this.scene.add(new THREE.HemisphereLight(0xcfc8ff, 0x201838, 1.3));
      const key = new THREE.DirectionalLight(0xffffff, 1.3); key.position.set(2, 5, 4); this.scene.add(key);
      const rim = new THREE.DirectionalLight(0x9a7bff, 1.1); rim.position.set(-3, 2, -3); this.scene.add(rim);
      this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -20, 20);
      this.cam.position.set(0, 3, 8); this.cam.lookAt(0, 3, 0);
    }
    this.variant = null;
    this.setStaff();
  }

  setStaff() {
    const eq = this.game.inventory && this.game.inventory.equipped.staff;
    const variant = (eq && eq.element) || 'basic';
    const tier = eq ? lookTier(eq.sharpen || 0) : 0;
    if ((variant === this.variant && tier === this.tier) || !this.scene) return;
    this.variant = variant;
    this.tier = tier;
    if (this.staff) this.scene.remove(this.staff.group);
    this.staff = buildStaffModel(variant, this.glowTex, new THREE.MeshStandardMaterial({ color: 0x3b2415, roughness: 0.9 }), tier);
    this.staff.group.scale.setScalar(1.9);
    this.scene.add(this.staff.group);
    this.t = 0;
  }

  renderScene(dt) {
    this.moveNodes(dt);
    if (!this.r || !this.staff) return;
    const w = this.root.clientWidth, h = this.root.clientHeight;
    if (w !== this.w || h !== this.h) {
      this.w = w; this.h = h; this.r.setSize(w, h, false);
      const H = 7.2, A = w / h; // видимая высота мира, единиц
      this.cam.left = -H * A / 2; this.cam.right = H * A / 2; this.cam.top = H / 2; this.cam.bottom = -H / 2; this.cam.updateProjectionMatrix();
      // навершие (высота 1.65*1.9 в мире) должно встать в точку HEAD поля
      this.headY = 1.65 * 1.9;
      const cy = this.headY + (HEAD_Y - 0.5) * H;
      this.cam.position.y = cy; this.cam.lookAt(0, cy, 0);
      if (this.nodes.length) this.rebuild(true); // размер поля изменился: раскладка заново
    }
    this.t += dt;
    this.staff.group.rotation.y = this.t * 0.6;
    this.staff.update(this.t, 0.5 + 0.5 * (this.busy ? 1 : 0));
    this.r.render(this.scene, this.cam);
  }
}
