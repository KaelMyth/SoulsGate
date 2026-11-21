// Меню модификатора после рулетки: сверху выпавший модификатор с описанием, внизу навершие текущего посоха (3D),
// от него вверх три энергетических потока к едва заметным ячейкам. Тап по ячейке вешает модификатор;
// над занятой ячейкой вырастает новый поток к новой пустой ячейке (всего пять).
import * as THREE from 'three';
import { buildStaffModel } from './staff_models.js';
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

const HEAD = { x: 50, y: 91 };                              // навершие на поле, %
const ROOTS = [{ x: 19, y: 66 }, { x: 50, y: 58 }, { x: 81, y: 66 }];

/** Положение ячейки на поле (%): корни фиксированы, остальные над своим родителем. */
export function cellPos(cells, i) {
  const c = cells[i];
  if (c.parent === -1) return ROOTS[i];
  const p = cellPos(cells, c.parent);
  return { x: p.x + (p.x - 50) * 0.18, y: p.y - 27 };
}

/** Короткая подпись под ячейкой по модификатору и усилению. */
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
    this.cellEls = [];
    this.streams = [];

    this.cardIcon = el('div', { class: 'mm-icon' });
    this.cardName = el('div', { class: 'mm-name' });
    this.cardTag = el('div', { class: 'mm-tag' });
    this.cardDesc = el('div', { class: 'mm-desc' });
    this.card = el('div', { class: 'mm-card' }, this.cardIcon, el('div', { class: 'mm-text' }, this.cardTag, this.cardName, this.cardDesc));
    this.canvas = el('canvas', { class: 'mm-canvas' });
    this.svg = svgEl('svg', { class: 'mm-streams', viewBox: '0 0 100 100', preserveAspectRatio: 'none' });
    this.field = el('div', { class: 'mm-field' });
    this.hint = el('div', { class: 'mm-hint' }, 'Tap a cell to attach');
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

  /** Перерисовать ячейки и потоки; grow: индекс только что выросшей ячейки (появляется плавно). */
  rebuild(animate, grow = -1) {
    const cells = this.mods.cells, C = this.game.cfg.mods;
    this.field.replaceChildren();
    this.svg.replaceChildren();
    this.cellEls = [];
    cells.forEach((c, i) => {
      const p = cellPos(cells, i);
      const from = c.parent === -1 ? HEAD : cellPos(cells, c.parent);
      this.addStream(from, p, i === grow);
      const d = el('button', { type: 'button', class: 'mm-cell' + (c.mod ? ' filled' : '') + (i === grow ? ' grow' : ''), 'aria-label': 'Cell ' + (i + 1) });
      d.style.left = p.x + '%'; d.style.top = p.y + '%';
      if (c.mod) {
        const info = MOD_INFO[c.mod];
        d.style.setProperty('--m', info.color);
        d.innerHTML = `<span class="mi">${MOD_ICON[c.mod]}</span><span class="mv">${valueText(c.mod, c.parent === -1, this.mods.boost(i), C)}</span>`;
      } else d.innerHTML = '<span class="mi"></span>';
      d.addEventListener('click', () => this.equip(i));
      this.field.append(d);
      this.cellEls.push(d);
    });
  }

  addStream(a, b, grow) {
    const my = (a.y + b.y) / 2;
    const dpath = `M${a.x},${a.y} C${a.x},${my + (a.y - b.y) * 0.1} ${b.x},${my + (a.y - b.y) * 0.4} ${b.x},${b.y}`;
    const g = svgEl('g', { class: 'mm-stream' + (grow ? ' grow' : '') });
    for (const cls of ['glow', 'core', 'flow']) {
      const p = svgEl('path', { d: dpath, class: cls, pathLength: '1', 'vector-effect': 'non-scaling-stroke' });
      g.append(p);
    }
    this.svg.append(g);
  }

  equip(i) {
    if (!this.open || this.busy || !this.mod) return;
    this.busy = true;
    this.hint.classList.add('off');
    this.skip.classList.add('off');
    const cell = this.cellEls[i];
    // Значок перелетает из карточки в ячейку.
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
      this.rebuild(true, grown);
      const c2 = this.cellEls[i];
      c2.classList.add('flash');
      this.root.classList.add('pulse');
      setTimeout(() => this.root.classList.remove('pulse'), 600);
      setTimeout(() => this.close(), grown >= 0 ? 1500 : 900);
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
    if (variant === this.variant || !this.scene) return;
    this.variant = variant;
    if (this.staff) this.scene.remove(this.staff.group);
    this.staff = buildStaffModel(variant, this.glowTex, new THREE.MeshStandardMaterial({ color: 0x3b2415, roughness: 0.9 }));
    this.staff.group.scale.setScalar(1.9);
    this.scene.add(this.staff.group);
    this.t = 0;
  }

  renderScene(dt) {
    if (!this.r || !this.staff) return;
    const w = this.root.clientWidth, h = this.root.clientHeight;
    if (w !== this.w || h !== this.h) {
      this.w = w; this.h = h; this.r.setSize(w, h, false);
      const H = 7.2, A = w / h; // видимая высота мира, единиц
      this.cam.left = -H * A / 2; this.cam.right = H * A / 2; this.cam.top = H / 2; this.cam.bottom = -H / 2; this.cam.updateProjectionMatrix();
      // навершие (высота 1.65*1.9 в мире) должно встать в точку HEAD поля
      this.headY = 1.65 * 1.9;
      const cy = this.headY + (HEAD.y / 100 - 0.5) * H;
      this.cam.position.y = cy; this.cam.lookAt(0, cy, 0);
    }
    this.t += dt;
    this.staff.group.rotation.y = this.t * 0.6;
    this.staff.update(this.t, 0.5 + 0.5 * (this.busy ? 1 : 0));
    this.r.render(this.scene, this.cam);
  }
}
