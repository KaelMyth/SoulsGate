// Живая часть заставки на canvas поверх статичной сцены: пламя, искры, свечения, снегопад.
// Координаты огня и свечений заданы в системе образца 941×1672 (как в ui_menu-scene.js), снег идёт по всему экрану.
import { SCENE_W } from './ui_menu-scene.js';

const TAU = Math.PI * 2;
const FIRE_X = 498;
const FIRE_Y = 1238;

/** Мягкое пятно света одного цвета: рисуется один раз, потом только масштабируется. */
function makeGlow(r, g, b) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',1)');
  gr.addColorStop(0.35, 'rgba(' + r + ',' + g + ',' + b + ',0.35)');
  gr.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)');
  x.fillStyle = gr;
  x.fillRect(0, 0, 128, 128);
  return c;
}

// Языки пламени: x от центра, полуширина, высота (в единицах образца), фаза.
const TONGUES = [
  [0, 25, 150, 0.0], [-34, 18, 98, 1.7], [36, 19, 112, 3.1], [14, 12, 74, 4.4], [-16, 13, 66, 5.2], [-52, 10, 46, 0.9], [56, 10, 56, 2.4],
];

export class MenuFx {
  /** canvas: полноэкранный слой; stage: элемент, внутри которого лежит сцена (даёт масштаб и сдвиг). */
  constructor(canvas, stage) {
    this.canvas = canvas;
    this.stage = stage;
    this.ctx = canvas.getContext('2d');
    this.glowOrange = makeGlow(255, 150, 64);
    this.glowBlue = makeGlow(110, 175, 255);
    this.glowCyan = makeGlow(160, 235, 255);
    this.flakes = [];
    this.embers = [];
    this.raf = 0;
    this.last = 0;
    this.t = 0;
    this.W = 0;
    this.H = 0;
    this.s = 1;
    this.ox = 0;
    this.oy = 0;
    this.tick = (now) => this.frame(now);
    this.resize();
    this.resizeHandler = () => this.resize();
    window.addEventListener('resize', this.resizeHandler);
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.canvas.width = Math.round(this.W * dpr);
    this.canvas.height = Math.round(this.H * dpr);
    this.dpr = dpr;
    const r = this.stage.getBoundingClientRect();
    this.s = r.width > 0 ? r.width / SCENE_W : 1;
    this.ox = r.left;
    this.oy = r.top;
    const n = Math.min(125,Math.max(65,Math.round(this.W*this.H/4200)));
    if (this.flakes.length !== n) {
      this.flakes = [];
      for (let i = 0; i < n; i++) {
        this.flakes.push({ x: Math.random() * this.W, y: Math.random() * this.H, z: 0.2 + Math.random() * 0.8, ph: Math.random() * TAU, tw: Math.random()*TAU });
      }
    }
  }

  start() {
    if (this.raf) return;
    this.resize();
    this.last = 0;
    this.raf = requestAnimationFrame(this.tick);
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  frame(now) {
    this.raf = requestAnimationFrame(this.tick);
    const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 0.016;
    this.last = now;
    this.t += dt;
    this.draw(dt);
  }

  draw(dt) {
    const ctx = this.ctx;
    const s = this.s;
    const t = this.t;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
    const X = (x) => this.ox + x * s;
    const Y = (y) => this.oy + y * s;
    const flick = .53 + .23 * Math.sin(t * 8.1) + .14 * Math.sin(t * 13.7 + .7);

    // Свечения: костёр, кристалл на посохе, глаза кота, фонарь.
    ctx.globalCompositeOperation = 'lighter';
    const glow = (img, x, y, r, a) => {
      ctx.globalAlpha = a;
      ctx.drawImage(img, X(x) - r * s, Y(y) - r * s, r * 2 * s, r * 2 * s);
    };
    glow(this.glowOrange, FIRE_X, FIRE_Y - 70, 310 + 18 * flick, 0.15 + 0.08 * flick);
    glow(this.glowOrange, FIRE_X, FIRE_Y - 20, 145, 0.14 + 0.08 * flick);
    glow(this.glowBlue, 146, 850, 190 + 10 * Math.sin(t * 2.1), 0.5 + 0.14 * Math.sin(t * 2.1));
    glow(this.glowCyan, 146, 850, 60, 0.55);
    glow(this.glowCyan, 324, 1105, 30, 0.6 + 0.25 * Math.sin(t * 1.6));
    glow(this.glowCyan, 348, 1105, 30, 0.6 + 0.25 * Math.sin(t * 1.6));
    glow(this.glowBlue, 324, 1210, 190, 0.3);
    glow(this.glowOrange, 470, 836, 80 + 6 * flick, 0.5 + 0.12 * flick);

    // Пламя уже нарисовано в исходном арте. Только живой рассеянный свет:
    // никаких векторных треугольников поверх иллюстрации.
    ctx.globalCompositeOperation = 'lighter';
    glow(this.glowOrange, FIRE_X, FIRE_Y - 76, 142, .16 + .09 * flick);
    glow(this.glowOrange, FIRE_X, FIRE_Y + 15, 260, .10 + .08 * flick);
    glow(this.glowOrange, FIRE_X - 118, FIRE_Y + 22, 205, .035 + .035 * flick);
    glow(this.glowOrange, FIRE_X + 130, FIRE_Y + 36, 215, .045 + .045 * flick);

    // Искры: поднимаются, чуть сносятся, гаснут.
    if (this.embers.length < 16 && Math.random() < dt * 14) {
      this.embers.push({ x: FIRE_X + (Math.random() - 0.5) * 70, y: FIRE_Y - 70, vx: (Math.random() - 0.3) * 24, vy: -(70 + Math.random() * 110), age: 0, life: 1.2 + Math.random() * 1.6, sz: 2 + Math.random() * 3.2, ph: Math.random() * TAU });
    }
    ctx.globalCompositeOperation = 'lighter';
    for (let i = this.embers.length - 1; i >= 0; i--) {
      const e = this.embers[i];
      e.age += dt;
      if (e.age >= e.life) {
        this.embers.splice(i, 1);
        continue;
      }
      e.x += (e.vx + Math.sin(t * 3 + e.ph) * 18) * dt;
      e.y += e.vy * dt;
      e.vy *= 1 - 0.25 * dt;
      const k = 1 - e.age / e.life;
      ctx.globalAlpha = k;
      ctx.fillStyle = k > 0.5 ? '#ffd08a' : '#ff8a3a';
      const sz = e.sz * s * (0.5 + 0.5 * k);
      ctx.beginPath();
      ctx.moveTo(X(e.x), Y(e.y) - sz);
      ctx.lineTo(X(e.x) + sz * 0.7, Y(e.y));
      ctx.lineTo(X(e.x), Y(e.y) + sz);
      ctx.lineTo(X(e.x) - sz * 0.7, Y(e.y));
      ctx.closePath();
      ctx.fill();
    }

    // Снег: ближние крупнее, быстрее и ярче. Сносит влево.
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#eaf2ff';
    for (let i = 0; i < this.flakes.length; i++) {
      const f = this.flakes[i];
      f.y += (19 + 63 * f.z) * dt;
      f.x += (-9 * f.z + Math.sin(t * 0.7 + f.ph) * 11 * f.z) * dt;
      if (f.y > this.H + 6) {
        f.y = -6;
        f.x = Math.random() * (this.W + 40);
      }
      if (f.x < -6) f.x = this.W + 4;
      ctx.globalAlpha = (.19 + .57 * f.z) * (.84 + .16*Math.sin(t*1.7+f.tw));
      ctx.beginPath();
      ctx.arc(f.x, f.y, .55 + f.z * 1.55, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  destroy() {
    this.stop();
    window.removeEventListener('resize', this.resizeHandler);
  }
}
