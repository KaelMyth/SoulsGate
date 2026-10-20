// Герой-маг: движение, здоровье, неуязвимость после удара.
// Скорость и прочие числа берутся из конфига каждый шаг (меняются ползунками).
export class Hero {
  constructor(cfg) {
    this.cfg = cfg; // { speed, accelTime, radius, maxHp, iFrames }
    this.active = true; // жив; нужно слою столкновений
    this.hp = cfg.maxHp;
    this.invuln = 0;    // сколько ещё секунд неуязвим
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
    if (this.invuln > 0) this.invuln -= dt;

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

    // Если автоатака ни во что не целится, посох смотрит по ходу движения.
    if (ix !== 0 || iy !== 0) this.facing = Math.atan2(iy, ix);
  }

  /** Телепорт без интерполяции (старт, перезапуск). */
  place(x, y) {
    this.x = this.prevX = x;
    this.y = this.prevY = y;
    this.vx = this.vy = 0;
  }

  /** Новая жизнь: в центр арены, полное здоровье. */
  reset() {
    this.place(0, 0);
    this.hp = this.cfg.maxHp;
    this.active = true;
    this.invuln = 0;
    this.facing = -Math.PI / 2;
  }
}
