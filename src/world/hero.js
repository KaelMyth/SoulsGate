// Герой-маг. На этапе 1 только движение: скорость берётся из конфига (ползунок в панели).
export class Hero {
  constructor(cfg) {
    this.cfg = cfg; // { speed, accelTime, radius }, читается каждый шаг
    this.x = 0;
    this.y = 0;
    this.prevX = 0; // положение на прошлом шаге: по нему рисуем интерполяцию
    this.prevY = 0;
    this.vx = 0;
    this.vy = 0;
    this.facing = -Math.PI / 2; // куда смотрит (посох), радианы; вверх по умолчанию
  }

  get radius() {
    return this.cfg.radius;
  }

  /** ix, iy: вектор стика длиной 0..1. */
  update(dt, ix, iy, arena) {
    this.prevX = this.x;
    this.prevY = this.y;

    const tvx = ix * this.cfg.speed;
    const tvy = iy * this.cfg.speed;
    if (this.cfg.accelTime > 0) {
      const k = 1 - Math.exp(-dt / this.cfg.accelTime);
      this.vx += (tvx - this.vx) * k;
      this.vy += (tvy - this.vy) * k;
      if (tvx === 0 && tvy === 0 && Math.abs(this.vx) + Math.abs(this.vy) < 2) {
        this.vx = 0;
        this.vy = 0;
      }
    } else {
      this.vx = tvx;
      this.vy = tvy;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    arena.resolveCircle(this);

    if (ix !== 0 || iy !== 0) this.facing = Math.atan2(iy, ix);
  }

  /** Телепорт без интерполяции (старт, перезапуск). */
  place(x, y) {
    this.x = this.prevX = x;
    this.y = this.prevY = y;
    this.vx = this.vy = 0;
  }
}
