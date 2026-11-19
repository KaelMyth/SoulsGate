// Спавн жуков волнами. Волна n: round(start * growth^(n-1)) жуков (не больше maxAlive), волны бесконечные.
// Волна длится duration секунд, затем пауза pause секунд, затем следующая. Все числа в CONFIG.waves.
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
      this.alive.push(b);
    }
  }

  clear() {
    for (const b of this.alive) b.group.visible = false;
    this.alive.length = 0;
  }

  update(dt, hx, hz) {
    if (!this.enabled) return;
    this.t -= dt;
    if (this.t <= 0) {
      if (this.phase === 'pause') {
        this.wave++;
        this.spawnWave(hx, hz);
        this.phase = 'wave';
        this.t = this.cfg.duration;
      } else {
        this.clear();
        this.phase = 'pause';
        this.t = this.cfg.pause;
      }
    }
    for (const b of this.alive) b.update(dt, b.state);
  }
}
