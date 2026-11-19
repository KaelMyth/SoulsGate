// Интерфейс боя в стиле SoulsGate: тонкая полоса опыта у нижней кромки с подписью «ур. N», красная дуга здоровья
// вокруг героя (видна, только когда здоровье не полное, «след урона» догоняет медленнее), надпись «Уровень N» при повышении.
// Всё из DOM и SVG поверх канваса, числа берёт у Stats.
const NS = 'http://www.w3.org/2000/svg';
const A0 = Math.PI * 1.08; // дуга здоровья над героем, как в SoulsGate
const A1 = Math.PI * 1.92;
const R = 40;              // px при стандартном масштабе

function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
  e.append(...kids);
  return e;
}

function sv(tag, attrs) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
  return e;
}

export class Hud {
  /** root: рамка игры; stats: Stats; world: World (для проекции героя на экран); cfg: CONFIG */
  constructor(root, stats, world, cfg) {
    this.stats = stats;
    this.world = world;
    this.cfg = cfg;
    this.xp = 0;        // сглаженные значения
    this.hp = 1;
    this.hpTrail = 1;
    this.hpShow = 0;
    this.pt = { x: 0, y: 0 };

    this.level = el('div', { id: 'hud-level' }, 'ур. 1');
    this.xpFill = el('i');
    this.xpBar = el('div', { id: 'hud-xp' }, this.xpFill);
    this.flash = el('div', { id: 'hud-flash' });
    this.root = el('div', { id: 'hud', class: 'gone' }, this.level, this.xpBar, this.flash);

    const S = 96;
    const c = S / 2;
    const d = `M${(c + R * Math.cos(A0)).toFixed(2)} ${(c + R * Math.sin(A0)).toFixed(2)}A${R} ${R} 0 0 1 ${(c + R * Math.cos(A1)).toFixed(2)} ${(c + R * Math.sin(A1)).toFixed(2)}`;
    const arc = (stroke) => sv('path', { d, fill: 'none', stroke, 'stroke-width': 4.5, 'stroke-linecap': 'round', pathLength: 100 });
    this.track = arc('rgba(190,215,250,0.16)');
    this.trail = arc('rgba(255,200,190,0.55)');
    this.fill = arc('#e5534b');
    this.text = sv('text', { x: c, y: c - R - 8, 'text-anchor': 'middle', fill: '#ffd9d5', 'font-size': 13, 'font-weight': 500 });
    this.hpSvg = sv('svg', { id: 'hud-hp', width: S, height: S, viewBox: `0 0 ${S} ${S}` });
    this.hpSvg.append(this.track, this.trail, this.fill, this.text);
    this.hpSvg.style.opacity = '0';
    this.root.append(this.hpSvg);
    root.append(this.root);
  }

  show() { this.root.classList.remove('gone'); }

  /** Каждый кадр после отрисовки мира. hero: Hero (положение и радиус). */
  update(dt, hero) {
    const s = this.stats;
    const k = (tau) => 1 - Math.exp(-dt / tau);
    this.xp += (s.xpFraction - this.xp) * k(0.12);
    this.xpFill.style.width = (this.xp * 100).toFixed(1) + '%';
    const lv = 'ур. ' + s.level;
    if (this.level.textContent !== lv) this.level.textContent = lv;

    // «Уровень N»: проявляется быстро, гаснет к концу flashTime.
    const F = this.cfg.xp.flashTime;
    if (s.levelFlash > 0) {
      const t = s.levelFlash / F;
      this.flash.textContent = 'Уровень ' + s.level;
      this.flash.style.opacity = String(Math.max(0, Math.min(1, t * 3, (1 - t) * 8)));
    } else this.flash.style.opacity = '0';

    // Здоровье: дуга над героем, видна, пока оно не полное.
    const full = s.hp >= s.maxHp - 1e-6;
    this.hpShow += ((full ? 0 : 1) - this.hpShow) * k(full ? 0.5 : 0.1);
    if (full) this.hp = this.hpTrail = 1;
    if (this.hpShow < 0.02) { this.hpSvg.style.opacity = '0'; return; }
    const t = s.hpFraction;
    this.hp += (t - this.hp) * k(0.07);
    this.hpTrail = t > this.hpTrail ? t : this.hpTrail + (this.hp - this.hpTrail) * k(0.55);
    const dash = (f) => `${(Math.max(0, Math.min(1, f)) * 100).toFixed(2)} 100`;
    this.trail.setAttribute('stroke-dasharray', this.hpTrail > this.hp ? dash(this.hpTrail) : '0 100');
    this.fill.setAttribute('stroke-dasharray', dash(this.hp));
    const pulse = t < 0.3 ? 0.5 + 0.5 * Math.sin(performance.now() / 1000 * 6) : 0;
    this.fill.setAttribute('stroke', pulse > 0 ? `rgb(255,${Math.round(95 + 60 * pulse)},${Math.round(85 + 60 * pulse)})` : '#e5534b');
    this.text.textContent = Math.ceil(s.hp) + ' / ' + Math.round(s.maxHp);
    // Положение и размер: по герою на экране, масштаб по пикселям на метр.
    const p = hero.group.position;
    this.world.project(p.x, 0.8, p.z, this.pt);
    const box = this.hpSvg.parentElement.parentElement;
    const ppm = Math.min(box.clientWidth, box.clientHeight) / (2 * this.cfg.camera.viewSpan);
    const sc = Math.max(0.6, Math.min(2, ppm / 42));
    this.hpSvg.style.transform = `translate(${(this.pt.x - 48).toFixed(1)}px, ${(this.pt.y - 48).toFixed(1)}px) scale(${sc.toFixed(3)})`;
    this.hpSvg.style.opacity = this.hpShow.toFixed(2);
  }
}
