// Экран посоха: открывается, когда подобран кристалл усиления; игра за ним стоит на паузе и видна сквозь тёмную вуаль.
// Слева большая 3D-модель посоха из трёх частей (голова, кольцо, наконечник): части по очереди мигают и подписаны
// (Power, Speed, Range). Кристалл (тоже 3D) из середины экрана нужно перетащить на часть, которую игрок хочет усилить.
// Сверху слева мощь посоха, ниже числа (тип, урон, перезарядка, дальность), между числами и счётчиками стоит кристалл,
// ниже сколько кристаллов вложено в каждую часть. Модели рисует отдельный прозрачный WebGL-холст поверх игры.
import * as THREE from 'three';
import { PARTS, staffStats } from './staff.js';
import { buildGem, makeEnvironment } from './staff_model.js'; // старый посох (buildStaff) остаётся в staff_model.js для позднего использования
import { buildStaffModel } from './staff_models.js';
import { glowTexture } from './staff_icons.js';
import { lookTier } from './staff_tiers.js';

const HALO = { basic: 0x35f2ff, fire: 0xff8a2a, ice: 0x9fdcff, electric: 0xffe45a, gravity: 0xb06bff, laser: 0xff3345, blades: 0xa8d4ff };
const PART_Y = { power: 1.75, speed: 0.9, range: -0.05 };

/** Посох с витрины (staff_models.js) для экрана прокачки: тот же вид, плюс по ореолу у каждой из трёх частей для подсветки. */
function buildShowcaseStaff(variant, glowTex, tier = 0) {
  const m = buildStaffModel(variant, glowTex, new THREE.MeshStandardMaterial({ color: 0x3b2415, roughness: 0.9 }), tier);
  const halos = {};
  for (const [p, size] of [['power', 1.3], ['speed', 0.95], ['range', 0.95]]) {
    const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: HALO[variant] || HALO.basic, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
    h.position.y = PART_Y[p];
    h.userData.size = size;
    h.scale.set(size, size, 1);
    h.renderOrder = 5;
    m.group.add(h);
    halos[p] = h;
  }
  return {
    group: m.group,
    top: 2.45,
    bottom: -0.5,
    centers: PART_Y,
    update: (t) => m.update(t, 0.2),
    pulse(name, v) {
      const h = halos[name];
      h.material.opacity = Math.min(0.95, 0.12 + v * 0.55);
      const k = h.userData.size * (1 + v * 0.25);
      h.scale.set(k, k, 1);
    },
  };
}

const LABEL = { power: 'Power', speed: 'Speed', range: 'Range' };

const FLAME = `<svg viewBox="0 0 32 40" aria-hidden="true"><defs><linearGradient id="flG" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#1f6fe0"/><stop offset="0.6" stop-color="#4fc3ff"/><stop offset="1" stop-color="#d8f6ff"/></linearGradient></defs>
  <path d="M16 2 C18 12 28 16 28 27 C28 34 22 38 16 38 C10 38 4 34 4 27 C4 20 9 18 11 11 C13 14 14 16 15 17 C16 12 15 7 16 2 Z" fill="url(#flG)"/>
  <path d="M16 18 C18 23 22 25 22 29.500 C22 33 19 35 16 35 C13 35 10 33 10 29.500 C10 25 15 23 16 18 Z" fill="#eafcff" opacity="0.85"/></svg>`;

const BLINK = 3; // секунд на круг: каждая из трёх частей мигает по очереди

export class StaffUi {
  /** root: рамка игры (#phone); game: Game; cfg: CONFIG */
  constructor(root, game, cfg) {
    this.game = game;
    this.cfg = cfg;
    this.isOpen = false;
    this.drag = null;
    this.closeTimer = 0;
    this.fade = 0;      // сколько ещё рисовать после закрытия (пока гаснет)
    this.t = 0;
    this.gl = null;     // WebGL создаётся при первом открытии
    const el = document.createElement('div');
    el.id = 'staff';
    el.innerHTML = `
      <canvas id="st-canvas"></canvas>
      ${PARTS.map((p) => `<div class="part-hit" data-part="${p}"></div><div class="plabel" data-label="${p}">${LABEL[p].toUpperCase()}</div>`).join('')}
      <div id="st-might">${FLAME}<b>0</b></div>
      <button id="st-close" type="button" aria-label="Close">&times;</button>
      <div id="st-col">
        <div class="st-sec" id="st-stats">
          <div class="row"><span>Type</span><b id="st-type"></b></div>
          <div class="row" data-stat="power"><span>Damage</span><b id="st-dmg"></b></div>
          <div class="row" data-stat="speed"><span>Cooldown</span><b id="st-cd"></b></div>
          <div class="row" data-stat="range"><span>Range</span><b id="st-rng"></b></div>
        </div>
        <div id="st-gem-box">
          <div id="st-gem" role="button" aria-label="Crystal"><em id="st-count"></em></div>
          <p id="st-hint">Drag the crystal onto a part of the staff</p>
        </div>
        <div class="st-sec" id="st-ups">
          <div class="ttl">Upgrades</div>
          ${PARTS.map((p) => `<div class="row" data-stat="${p}"><span>${LABEL[p]}</span><b id="st-up-${p}">0</b></div>`).join('')}
        </div>
      </div>`;
    root.append(el);
    this.el = el;
    this.q = (s) => el.querySelector(s);
    this.gemEl = this.q('#st-gem');
    this.hits = [...el.querySelectorAll('.part-hit')];
    this.labels = Object.fromEntries([...el.querySelectorAll('.plabel')].map((e) => [e.dataset.label, e]));
    this.over = null;     // часть под перетаскиваемым кристаллом
    this.burst = { power: 0, speed: 0, range: 0 };
    this.q('#st-close').addEventListener('click', () => this.close());
    for (const ev of ['pointerdown', 'touchstart']) el.addEventListener(ev, (e) => e.stopPropagation()); // чтобы не включать стик под экраном
    this.gemEl.addEventListener('pointerdown', (e) => this.dragStart(e));
    window.addEventListener('pointermove', (e) => this.dragMove(e));
    window.addEventListener('pointerup', (e) => this.dragEnd(e));
    window.addEventListener('pointercancel', (e) => this.dragEnd(e, true));
    window.addEventListener('resize', () => { if (this.gl) this.layout(); });
  }

  /** Создать WebGL-сцену: прозрачный холст, ортографическая камера в пикселях, посох и кристалл. */
  initGl() {
    const canvas = this.q('#st-canvas');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    const scene = new THREE.Scene();
    scene.environment = makeEnvironment(renderer);
    const camera = new THREE.OrthographicCamera(0, 100, 100, 0, -3000, 3000);
    scene.add(new THREE.AmbientLight(0x8aa0c8, 0.5));
    const key = new THREE.DirectionalLight(0xfff0d8, 2.2);
    key.position.set(-300, 400, 600);
    const rim = new THREE.DirectionalLight(0x6fcfff, 1.6);
    rim.position.set(400, 100, -500);
    scene.add(key, rim);
    this.glowTex = glowTexture();
    this.staffRoot = new THREE.Group(); // позиция и масштаб в пикселях
    scene.add(this.staffRoot);
    this.variant = null;
    this.syncStaff();
    this.gem = buildGem();
    scene.add(this.gem);
    this.gl = { renderer, scene, camera };
    this.gemPos = new THREE.Vector3();
    this.gemTarget = new THREE.Vector3();
    this.layout();
  }

  /** Показать посох, который надет у мага сейчас (при смене стихии модель пересоздаётся). */
  syncStaff() {
    const eq = this.game.inventory && this.game.inventory.equipped.staff;
    const variant = (eq && eq.element) || 'basic';
    const tier = eq ? lookTier(eq.sharpen || 0) : 0;
    if (variant === this.variant && tier === this.tier) return;
    if (this.staff) this.staffRoot.remove(this.staff.group);
    this.variant = variant;
    this.tier = tier;
    this.staff = buildShowcaseStaff(variant, this.glowTex, tier);
    this.staffRoot.add(this.staff.group);
  }

  /** Раскладка под размер экрана: посох слева на всю высоту, подписи и зоны попадания у частей, кристалл в слоте. */
  layout() {
    const r = this.el.getBoundingClientRect();
    const W = Math.max(1, r.width);
    const H = Math.max(1, r.height);
    this.W = W;
    this.H = H;
    const { renderer, camera } = this.gl;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(W, H, false);
    camera.left = 0; camera.right = W; camera.top = H; camera.bottom = 0;
    camera.updateProjectionMatrix();
    const s = (H * 0.8) / (this.staff.top - this.staff.bottom); // пикселей на единицу модели
    this.scale = s;
    this.staffRoot.scale.setScalar(s);
    const cx = W * 0.3;
    const cy = H * 0.5 - ((this.staff.top + this.staff.bottom) / 2) * s;
    this.staffRoot.position.set(cx, cy, 0);
    for (const p of PARTS) {
      const y = H - (cy + this.staff.centers[p] * s); // CSS-координата центра части
      const half = p === 'power' ? 0.55 * s : p === 'speed' ? 0.35 * s : 0.5 * s;
      const hit = this.el.querySelector(`.part-hit[data-part="${p}"]`);
      hit.style.top = y - half + 'px';
      hit.style.height = half * 2 + 'px';
      hit.style.left = '0px';
      hit.style.width = W * 0.52 + 'px';
      this.labels[p].style.top = y - 8 + 'px';
    }
    const g = this.gemEl.getBoundingClientRect();
    this.gemSlot = { x: g.left - r.left + g.width / 2, y: g.top - r.top + g.height / 2 };
    this.gemScale = Math.min(g.height * 0.9, 100);
  }

  /** Числа посоха и счётчики усилений на экране. */
  refresh(flashPart) {
    const s = this.game.stats;
    const st = staffStats(this.cfg, s.upgrades, this.game.equippedSharpen());
    this.q('#st-might b').textContent = st.might;
    this.q('#st-type').textContent = this.cfg.staff.type;
    this.q('#st-dmg').textContent = st.damage.toFixed(1);
    this.q('#st-cd').textContent = st.interval.toFixed(2) + ' s';
    this.q('#st-rng').textContent = st.range.toFixed(1) + ' m';
    for (const p of PARTS) this.q('#st-up-' + p).textContent = s.upgrades[p];
    const n = s.pendingPower;
    this.q('#st-count').textContent = n > 1 ? '×' + n : '';
    this.gemEl.classList.toggle('empty', n <= 0);
    this.q('#st-hint').style.visibility = n > 0 ? 'visible' : 'hidden';
    if (flashPart) {
      for (const r of this.el.querySelectorAll(`[data-stat="${flashPart}"]`)) {
        r.classList.remove('up');
        void r.offsetWidth;
        r.classList.add('up');
      }
    }
  }

  open() {
    if (this.isOpen || this.game.stats.pendingPower <= 0) return;
    this.isOpen = true;
    clearTimeout(this.closeTimer);
    this.game.stick.cancel();
    this.game.paused = true; // бой стоит, пока игрок выбирает часть посоха
    this.el.classList.add('show');
    document.body.classList.add('staff-open');
    if (!this.gl) this.initGl();
    this.syncStaff();
    this.refresh();
    this.fade = 0.5;
    requestAnimationFrame(() => {
      this.el.classList.add('on'); // плавное появление: класс ставится после показа, чтобы сработал переход
      this.layout();
      this.gemPos.set(this.gemSlot.x, this.H - this.gemSlot.y, 40);
    });
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    clearTimeout(this.closeTimer);
    this.endDrag();
    this.el.classList.remove('on');
    document.body.classList.remove('staff-open');
    this.fade = 0.5; // ещё столько кадров рисуем, пока экран гаснет
    this.game.paused = false;
    setTimeout(() => { if (!this.isOpen) this.el.classList.remove('show'); }, 450);
  }

  /** Вызывается каждый кадр из Game.frame: анимация и отрисовка моделей. */
  update(dt) {
    if (!this.gl || (!this.isOpen && this.fade <= 0)) return;
    if (!this.isOpen) this.fade -= dt;
    this.t += dt;
    const t = this.t;
    this.staff.update(t);
    // Посох плавно поворачивается из стороны в сторону, чтобы был виден объём.
    this.staff.group.rotation.y = Math.sin(t * 0.55) * 0.6;
    this.staff.group.rotation.z = -0.1;
    // Части мигают по очереди; под кристаллом горит ярко; после вложения вспыхивает.
    const idx = Math.floor((t % (BLINK)) / 1);
    const ph = (t % 1);
    PARTS.forEach((p, i) => {
      this.burst[p] = Math.max(0, this.burst[p] - dt * 1.4);
      let v = i === idx ? Math.sin(ph * Math.PI) : 0;
      if (this.over === p) v = 1.3;
      v = Math.max(v, this.burst[p] * 2);
      this.staff.pulse(p, v);
      const lab = this.labels[p];
      lab.style.opacity = String(0.5 + 0.5 * Math.min(1, v));
      lab.classList.toggle('lit', v > 0.5);
    });
    // Кристалл: в слоте или за пальцем, мягко догоняет цель, вращается и качается.
    const g = this.gem;
    const have = this.game.stats.pendingPower > 0;
    g.visible = have || !!this.drag;
    if (this.drag) this.gemTarget.set(this.drag.x, this.H - this.drag.y, 60);
    else this.gemTarget.set(this.gemSlot.x, this.H - this.gemSlot.y + Math.sin(t * 2.2) * 4, 40);
    this.gemPos.lerp(this.gemTarget, Math.min(1, dt * (this.drag ? 28 : 12)));
    g.position.copy(this.gemPos);
    const k = this.gemScale * (this.drag ? 1.3 : 1);
    g.scale.set(k, k, k);
    g.rotation.y = t * 1.6;
    g.rotation.z = this.drag ? 0.25 : 0.08;
    g.userData.glow.material.opacity = 0.55 + 0.2 * Math.sin(t * 3);
    this.gl.renderer.render(this.gl.scene, this.gl.camera);
  }

  partAt(x, y) {
    for (const e of document.elementsFromPoint(x, y)) {
      if (e.classList && e.classList.contains('part-hit')) return e.dataset.part;
    }
    return null;
  }

  local(e) {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  dragStart(e) {
    if (!this.isOpen || this.game.stats.pendingPower <= 0) return;
    e.preventDefault();
    this.drag = { id: e.pointerId, ...this.local(e) };
    this.gemEl.classList.add('lifted');
  }

  dragMove(e) {
    if (!this.drag || e.pointerId !== this.drag.id) return;
    Object.assign(this.drag, this.local(e));
    this.over = this.partAt(e.clientX, e.clientY);
  }

  dragEnd(e, cancel) {
    if (!this.drag || e.pointerId !== this.drag.id) return;
    const part = cancel ? null : this.partAt(e.clientX, e.clientY);
    this.endDrag();
    if (!part) return; // отпущен мимо: кристалл возвращается на место
    if (!this.game.stats.upgrade(part)) return;
    this.burst[part] = 1;
    this.refresh(part);
    if (this.game.stats.pendingPower <= 0) this.closeTimer = setTimeout(() => this.close(), 1200);
  }

  endDrag() {
    this.drag = null;
    this.over = null;
    this.gemEl.classList.remove('lifted');
  }
}
