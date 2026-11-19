// Echo Gate: цикл игры. Фиксированный шаг 1/60, как в SoulsGate. Управление перенесено оттуда же:
// стик по касанию (Stick), двойной свайп = рывок (SwipeDetector), клавиатура для компьютера.
import { EventBus } from './events.js';
import { Stick } from './input_stick.js';
import { SwipeDetector } from './input_swipe.js';
import { Keys } from './input_keys.js';
import { screenToWorld } from './iso.js';
import { Motion } from './motion.js';
import { World } from './world.js';
import { Hero } from './hero.js';
import { Spawner } from './spawner.js';
import { Attack } from './attack.js';

const STEP = 1 / 60;

export class Game {
  constructor(o) {
    this.cfg = o.config;
    this.bus = new EventBus();
    this.canvas = o.canvas;
    this.world = new World(o.canvas, this.cfg);
    this.hero = new Hero();
    this.hero.addTo(this.world.scene);
    this.motion = new Motion(this.cfg);
    this.spawner = new Spawner(this.world.scene, this.cfg.waves);
    this.attack = new Attack(this.world.scene, this.cfg.attack, this.hero, this.spawner);

    this.stick = new Stick(o.canvas, this.bus, this.cfg.stick);
    this.swipe = new SwipeDetector(this.bus, this.cfg.dash, (sx, sy) => {
      screenToWorld(sx, sy, this.tmp);
      this.dash(this.tmp.x, this.tmp.z);
    });
    this.keys = new Keys(() => this.dashFromInput());
    this.tmp = { x: 0, z: 0 };
    this.kv = { x: 0, y: 0 };
    this.ui = o.ui; // { base, knob, start }
    this.acc = 0;
    this.last = 0;
    this.running = true;
    this.playing = false; // пока не нажали Play, герой не слушается

    window.addEventListener('blur', () => this.stick.cancel());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.stick.cancel(); });
    this.world.follow(0, 0, 0, true);
  }

  /** Кнопка Play: убрать стартовый экран и включить управление. */
  play() {
    this.playing = true;
    this.spawner.start();
    if (this.ui.start) this.ui.start.classList.add('gone');
  }

  dash(wx, wz) {
    if (!this.playing) return;
    if (this.motion.startDash(wx, wz)) this.bus.emit('dash:started', { x: wx, z: wz });
  }

  /** Рывок без свайпа (Пробел): по текущему стику, иначе вперёд по взгляду. */
  dashFromInput() {
    const d = this.readInput(this.tmp);
    if (d.x !== 0 || d.z !== 0) this.dash(d.x, d.z);
    else this.dash(Math.sin(this.hero.yaw), Math.cos(this.hero.yaw));
  }

  /** Мировой вектор ввода (стик или клавиши), длина 0..1. */
  readInput(out) {
    if (!this.playing) { out.x = 0; out.z = 0; }
    else if (this.stick.active) screenToWorld(this.stick.x, this.stick.y, out);
    else if (this.keys.read(this.kv)) screenToWorld(this.kv.x, this.kv.y, out);
    else { out.x = 0; out.z = 0; }
    return out;
  }

  /** Один шаг логики. */
  step(dt) {
    const m = this.motion;
    const inp = this.readInput(this.tmp);
    m.update(dt, inp.x, inp.z);
    this.hero.update(dt, m, this.cfg.hero.speed);
    this.spawner.update(dt, m.x, m.z);
    if (this.playing) this.attack.update(dt, m.x, m.z);
    this.world.follow(dt, m.x, m.z, false);
  }

  /** Нарисовать стик на экране (DOM поверх канваса). */
  drawStick() {
    const u = this.ui;
    if (!u || !u.base) return;
    const s = this.stick;
    if (!s.active) { u.base.style.opacity = '0'; u.knob.style.opacity = '0'; return; }
    const R = this.cfg.stick.radius;
    u.base.style.opacity = '1';
    u.knob.style.opacity = '1';
    u.base.style.transform = `translate(${s.baseX - R}px, ${s.baseY - R}px)`;
    u.knob.style.transform = `translate(${s.baseX + s.kx - R * 0.42}px, ${s.baseY + s.ky - R * 0.42}px)`;
  }

  frame(now) {
    if (!this.running) return;
    const t = now / 1000;
    const dt = Math.min(0.1, this.last ? t - this.last : STEP);
    this.last = t;
    this.acc += dt;
    while (this.acc >= STEP) { this.step(STEP); this.acc -= STEP; }
    this.drawStick();
    this.world.render();
    requestAnimationFrame((n) => this.frame(n));
  }

  start() {
    requestAnimationFrame((n) => this.frame(n));
  }
}
