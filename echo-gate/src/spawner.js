// Спавн жуков волнами. Волна n: round(start * growth^(n-1)) жуков (не больше maxAlive), волны бесконечные.
// Волна заканчивается, когда убит последний жук; затем пауза pause секунд и следующая волна. Все числа в CONFIG.waves.
import { Beetle } from './beetle.js';

export class Spawner {
  constructor(scene, cfg) {
    this.scene = scene;
    this.cfg = cfg;
    this.pool = [];      // все созданные жуки (переиспользуются)
    this.alive = [];     // активные в текущей волне
    this.wave = 0;       // номер текущей волны (0 до старта)
    this.phase = 'pause';
    this.t = 0;
    this.enabled = false;
  }

  /** Включить: первая волна начинается после обычной паузы. */
  start() { this.enabled = true; this.phase = 'pause'; this.t = this.cfg.pause; }

  countFor(n) {
    const w = this.cfg;
    return Math.min(w.maxAlive, Math.round(w.start * Math.pow(w.growth, n - 1)));
  }

  take() {
    let b = this.pool.find((x) => !x.group.visible);
    if (!b) { b = new Beetle(); b.addTo(this.scene); this.pool.push(b); }
    b.group.visible = true;
    return b;
  }

  spawnWave(cx, cz) {
    const n = this.countFor(this.wave);
    const w = this.cfg;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = w.ringMin + Math.random() * (w.ringMax - w.ringMin);
      const b = this.take();
      b.state = { x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, vx: 0, vz: 0 };
      b.yaw = Math.atan2(cx - b.state.x, cz - b.state.z); // лицом к герою
      b.hp = w.beetleHp;
      this.alive.push(b);
    }
  }

  /** Убрать убитого жука с поля. */
  kill(b) {
    const i = this.alive.indexOf(b);
    if (i >= 0) this.alive.splice(i, 1);
    b.group.visible = false;
  }

  clear() {
    for (const b of this.alive) b.group.visible = false;
    this.alive.length = 0;
  }

  update(dt, hx, hz) {
    if (!this.enabled) return;
    if (this.phase === 'wave') {
      if (this.alive.length === 0) { this.phase = 'pause'; this.t = this.cfg.pause; } // убит последний жук
    } else {
      this.t -= dt;
      if (this.t <= 0) {
        this.wave++;
        this.spawnWave(hx, hz);
        this.phase = 'wave';
      }
    }
    for (const b of this.alive) b.update(dt, b.state);
  }
}
