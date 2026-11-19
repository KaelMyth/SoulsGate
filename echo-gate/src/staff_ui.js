// Экран посоха: открывается, когда подобран кристалл усиления. Слева на весь экран большой посох из трёх частей,
// которые по очереди мигают и подписаны (Power, Speed, Range). Кристалл из середины экрана нужно перетащить на часть,
// которую игрок хочет усилить. Сверху слева мощь посоха, ниже числа (тип, урон, перезарядка, дальность),
// между числами и счётчиками стоит кристалл, ниже сколько кристаллов вложено в каждую часть.
import { PARTS, staffStats } from './staff.js';

const LABEL = { power: 'Power', speed: 'Speed', range: 'Range' };

const ART = `
<svg id="st-art" viewBox="0 0 200 800" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
  <defs>
    <linearGradient id="stWood" x1="0" x2="1"><stop offset="0" stop-color="#4a2f1c"/><stop offset="0.45" stop-color="#9a6a3e"/><stop offset="1" stop-color="#4a2f1c"/></linearGradient>
    <linearGradient id="stGold" x1="0" x2="1"><stop offset="0" stop-color="#8d6a24"/><stop offset="0.5" stop-color="#f0c868"/><stop offset="1" stop-color="#8d6a24"/></linearGradient>
    <linearGradient id="stIron" x1="0" x2="1"><stop offset="0" stop-color="#2a3446"/><stop offset="0.5" stop-color="#8896ad"/><stop offset="1" stop-color="#2a3446"/></linearGradient>
    <radialGradient id="stOrb" cx="0.38" cy="0.32"><stop offset="0" stop-color="#e8fbff"/><stop offset="0.35" stop-color="#58d4ff"/><stop offset="1" stop-color="#1a5fb0"/></radialGradient>
    <radialGradient id="stHalo"><stop offset="0" stop-color="#7fe0ff" stop-opacity="0.7"/><stop offset="1" stop-color="#7fe0ff" stop-opacity="0"/></radialGradient>
  </defs>
  <g transform="translate(16 0) rotate(-5 130 420)">
    <rect x="123" y="200" width="14" height="570" rx="6" fill="url(#stWood)"/>
    <g class="part" data-part="power">
      <ellipse class="glow" cx="130" cy="130" rx="95" ry="105" fill="url(#stHalo)"/>
      <path d="M96 96 C84 150 104 200 130 214 C156 200 176 150 164 96" fill="none" stroke="url(#stGold)" stroke-width="11" stroke-linecap="round"/>
      <path d="M92 70 L100 100 L110 84 M168 70 L160 100 L150 84" fill="none" stroke="url(#stGold)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="130" cy="130" r="38" fill="url(#stOrb)"/>
      <path d="M130 100 L146 130 L130 160 L114 130 Z" fill="#ffffff" opacity="0.35"/>
      <rect x="112" y="204" width="36" height="14" rx="4" fill="url(#stGold)"/>
      <rect class="hit" x="40" y="40" width="160" height="210" fill="transparent"/>
    </g>
    <g class="part" data-part="speed">
      <ellipse class="glow" cx="130" cy="450" rx="80" ry="90" fill="url(#stHalo)"/>
      <g fill="#6b4226" stroke="#2c1a0e" stroke-width="2">
        <rect x="114" y="388" width="32" height="14" rx="3"/><rect x="112" y="406" width="36" height="14" rx="3"/><rect x="114" y="424" width="32" height="14" rx="3"/>
        <rect x="112" y="442" width="36" height="14" rx="3"/><rect x="114" y="460" width="32" height="14" rx="3"/><rect x="112" y="478" width="36" height="14" rx="3"/>
      </g>
      <path d="M118 430 l4 -6 l4 6 l-4 6 z M134 466 l4 -6 l4 6 l-4 6 z" fill="#7fe0ff"/>
      <path d="M146 484 C168 510 160 548 170 580 C156 570 146 540 140 496 Z" fill="#a33a2e" stroke="#2c1a0e" stroke-width="2"/>
      <rect class="hit" x="40" y="370" width="160" height="150" fill="transparent"/>
    </g>
    <g class="part" data-part="range">
      <ellipse class="glow" cx="130" cy="715" rx="70" ry="90" fill="url(#stHalo)"/>
      <rect x="117" y="650" width="26" height="12" rx="3" fill="url(#stGold)"/>
      <rect x="119" y="668" width="22" height="10" rx="3" fill="url(#stIron)"/>
      <path d="M118 680 L142 680 L133 770 L130 790 L127 770 Z" fill="url(#stIron)" stroke="#161d2b" stroke-width="2"/>
      <rect class="hit" x="40" y="630" width="160" height="165" fill="transparent"/>
    </g>
  </g>
  <g class="labels">
    <g data-label="power"><text x="14" y="140">POWER</text><path d="M14 148 H70"/></g>
    <g data-label="speed"><text x="14" y="455">SPEED</text><path d="M14 463 H70"/></g>
    <g data-label="range"><text x="14" y="725">RANGE</text><path d="M14 733 H70"/></g>
  </g>
</svg>`;

const GEM = `<svg viewBox="-30 -42 60 84" aria-hidden="true">
  <defs><radialGradient id="gemHalo"><stop offset="0" stop-color="#ffb84d" stop-opacity="0.8"/><stop offset="1" stop-color="#ffb84d" stop-opacity="0"/></radialGradient></defs>
  <circle r="38" fill="url(#gemHalo)"/>
  <path d="M0 -36 L20 -8 L16 12 L0 36 L-16 12 L-20 -8 Z" fill="#ff9d2e" stroke="#ffe0a0" stroke-width="2" stroke-linejoin="round"/>
  <path d="M0 -36 L20 -8 L0 -2 Z" fill="#ffd27a"/><path d="M0 -36 L-20 -8 L0 -2 Z" fill="#ffb54a"/>
  <path d="M0 -2 L20 -8 L16 12 Z" fill="#e47a14"/><path d="M0 -2 L-20 -8 L-16 12 Z" fill="#f0902a"/><path d="M0 -2 L16 12 L0 36 L-16 12 Z" fill="#c85f0a"/>
</svg>`;

const FLAME = `<svg viewBox="0 0 32 40" aria-hidden="true"><defs><linearGradient id="flG" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#1f6fe0"/><stop offset="0.6" stop-color="#4fc3ff"/><stop offset="1" stop-color="#d8f6ff"/></linearGradient></defs>
  <path d="M16 2 C18 12 28 16 28 27 C28 34 22 38 16 38 C10 38 4 34 4 27 C4 20 9 18 11 11 C13 14 14 16 15 17 C16 12 15 7 16 2 Z" fill="url(#flG)"/>
  <path d="M16 18 C18 23 22 25 22 29.500 C22 33 19 35 16 35 C13 35 10 33 10 29.500 C10 25 15 23 16 18 Z" fill="#eafcff" opacity="0.85"/></svg>`;

export class StaffUi {
  /** root: рамка игры (#phone); game: Game; cfg: CONFIG */
  constructor(root, game, cfg) {
    this.game = game;
    this.cfg = cfg;
    this.isOpen = false;
    this.drag = null;
    this.closeTimer = 0;
    const el = document.createElement('div');
    el.id = 'staff';
    el.innerHTML = `
      ${ART}
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
          <div id="st-gem" role="button" aria-label="Crystal">${GEM}<em id="st-count"></em></div>
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
    this.gem = this.q('#st-gem');
    this.parts = [...el.querySelectorAll('.part')];
    this.q('#st-close').addEventListener('click', () => this.close());
    for (const ev of ['pointerdown', 'touchstart']) el.addEventListener(ev, (e) => e.stopPropagation());
    this.gem.addEventListener('pointerdown', (e) => this.dragStart(e));
    window.addEventListener('pointermove', (e) => this.dragMove(e));
    window.addEventListener('pointerup', (e) => this.dragEnd(e));
    window.addEventListener('pointercancel', (e) => this.dragEnd(e, true));
  }

  /** Числа посоха и счётчики усилений на экране. */
  refresh(flashPart) {
    const s = this.game.stats;
    const st = staffStats(this.cfg, s.upgrades);
    this.q('#st-might b').textContent = st.might;
    this.q('#st-type').textContent = this.cfg.staff.type;
    this.q('#st-dmg').textContent = st.damage.toFixed(1);
    this.q('#st-cd').textContent = st.interval.toFixed(2) + ' s';
    this.q('#st-rng').textContent = st.range.toFixed(1) + ' m';
    for (const p of PARTS) this.q('#st-up-' + p).textContent = s.upgrades[p];
    const n = s.pendingPower;
    this.q('#st-count').textContent = n > 1 ? '×' + n : '';
    this.gem.classList.toggle('empty', n <= 0);
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
    this.refresh();
    this.el.classList.add('on');
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    clearTimeout(this.closeTimer);
    this.endDrag();
    this.el.classList.remove('on');
    this.game.paused = false;
  }

  partAt(x, y) {
    for (const e of document.elementsFromPoint(x, y)) {
      const g = e.closest && e.closest('.part');
      if (g) return g;
    }
    return null;
  }

  dragStart(e) {
    if (!this.isOpen || this.game.stats.pendingPower <= 0) return;
    e.preventDefault();
    const ghost = this.gem.cloneNode(true);
    ghost.id = 'st-ghost';
    ghost.querySelector('em').remove();
    this.el.append(ghost);
    this.drag = { ghost, id: e.pointerId, over: null };
    this.gem.classList.add('lifted');
    this.moveGhost(e);
  }

  moveGhost(e) {
    const r = this.el.getBoundingClientRect();
    this.drag.ghost.style.transform = `translate(${e.clientX - r.left - 31}px, ${e.clientY - r.top - 44}px)`;
  }

  dragMove(e) {
    if (!this.drag || e.pointerId !== this.drag.id) return;
    this.moveGhost(e);
    const over = this.partAt(e.clientX, e.clientY);
    if (over !== this.drag.over) {
      if (this.drag.over) this.drag.over.classList.remove('over');
      if (over) over.classList.add('over');
      this.drag.over = over;
    }
  }

  dragEnd(e, cancel) {
    if (!this.drag || e.pointerId !== this.drag.id) return;
    const part = !cancel && this.partAt(e.clientX, e.clientY);
    this.endDrag();
    if (!part) return; // отпущен мимо: кристалл возвращается на место
    const key = part.dataset.part;
    if (!this.game.stats.upgrade(key)) return;
    part.classList.add('burst');
    setTimeout(() => part.classList.remove('burst'), 900);
    this.refresh(key);
    if (this.game.stats.pendingPower <= 0) this.closeTimer = setTimeout(() => this.close(), 1100);
  }

  endDrag() {
    if (!this.drag) return;
    if (this.drag.over) this.drag.over.classList.remove('over');
    this.drag.ghost.remove();
    this.drag = null;
    this.gem.classList.remove('lifted');
  }
}
