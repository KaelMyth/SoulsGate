// Герой-маг: движение, здоровье, неуязвимость после удара.
// Скорость и прочие числа берутся из конфига каждый шаг (меняются ползунками).
export class Hero {
  constructor(cfg) {
    this.cfg = cfg; // { speed, accelTime, radius, maxHp, iFrames }
    this.active = true; // жив; нужно слою столкновений
    this.maxHp = cfg.maxHp; // с пассивом «Бонусное здоровье» больше
    this.hpMul = 1;
    this.hp = cfg.maxHp;
    this.invuln = 0;    // сколько ещё секунд неуязвим
    this.x = 0;
    this.y = 0;
    this.prevX = 0; // положение на прошлом шаге: по нему рисуем интерполяцию
    this.prevY = 0;
    this.vx = 0;
    this.vy = 0;
    this.facing = -Math.PI / 2; // куда смотрит (посох), радианы; вверх по умолчанию
    this.dashing = false; // идёт рывок: стик не слушаем, летим со скоростью рывка
    this.dashVx = 0;
    this.dashVy = 0;
    this.glideTime = 0;   // после рывка: сколько ещё скорость гаснет плавно
    this.glideAccel = 0.2; // постоянная времени этого гашения, с
    this.incarnationT = 0; // «Воплощение»: неуязвимый энергетический шар
    this.incarnationSpeedMul = 1;
    this.incarnationInertia = 0;
    this.incarnationMask = 0;
    this.incarnationLaser = false;
    // Статусы от босса (разломы Тартаса): замедление и горение. Накладывает systems_boss.js, снимает таймер.
    this.slowT = 0;       // сколько ещё секунд замедлен
    this.slowMul = 1;     // во сколько раз медленнее, пока slowT > 0
    this.burnT = 0;       // сколько ещё секунд горит
    this.burnTick = 0;    // до следующего тика горения
  }

  get radius() {
    return this.cfg.radius;
  }

  /** ix, iy: вектор стика длиной 0..1. */
  update(dt, ix, iy, arena) {
    this.prevX = this.x;
    this.prevY = this.y;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.slowT > 0) this.slowT -= dt;
    if (this.incarnationT > 0) {
      this.incarnationT = Math.max(0, this.incarnationT - dt);
      if (this.incarnationT < 0.000001) this.incarnationT = 0; // убираем хвост погрешности после пяти секунд
    }

    if (this.incarnationLaser) { this.vx = this.vy = 0; return; }

    if (this.dashing) {
      this.vx = this.dashVx;
      this.vy = this.dashVy;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      arena.resolveCircle(this);
      return;
    }

    if (this.glideTime > 0) this.glideTime -= dt;
    const accelTime = this.incarnationT > 0
      ? Math.max(this.cfg.accelTime, this.incarnationInertia)
      : this.glideTime > 0 ? Math.max(this.cfg.accelTime, this.glideAccel) : this.cfg.accelTime;
    const sm = this.slowT > 0 ? this.slowMul : 1; // замедление не действует на рывок (он выше, в dashing)
    const sp = this.cfg.speed * (this.speedMul || 1) * (this.incarnationT > 0 ? this.incarnationSpeedMul : 1); // пассив скорости сохраняется
    const tvx = ix * sp * sm;
    const tvy = iy * sp * sm;
    if (accelTime > 0) {
      const k = 1 - Math.exp(-dt / accelTime);
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
    this.maxHp = this.cfg.maxHp * this.hpMul;
    this.hp = this.maxHp;
    this.active = true;
    this.invuln = 0;
    this.facing = -Math.PI / 2;
    this.dashing = false;
    this.incarnationT = 0;
    this.incarnationSpeedMul = 1;
    this.incarnationInertia = 0;
    this.incarnationMask = 0;
    this.slowT = 0;
    this.slowMul = 1;
    this.burnT = 0;
    this.burnTick = 0;
  }
}
