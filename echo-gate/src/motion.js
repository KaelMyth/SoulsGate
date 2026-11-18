// Движение героя без графики: стик + рывок из SoulsGate (экспоненциальный рывок, скольжение после него, перезарядка).
// Мир: земля это плоскость x/z, y вверх. Всё в метрах и секундах.
export class Motion {
  /** cfg: { hero, dash } из config.js */
  constructor(cfg) {
    this.cfg = cfg;
    this.x = 0;
    this.z = 0;
    this.vx = 0;
    this.vz = 0;
    this.dashing = false;
    this.dashT = 0;
    this.dashX = 0;
    this.dashZ = 0;
    this.glideT = 0;
    this.cooldown = 0;
    this.dashSeq = 0; // растёт с каждым рывком: по нему график видит новый рывок
  }

  /** Начальная скорость рывка: интеграл v0·e^(−t/decay) за duration даёт ровно distance. */
  dashSpeed() {
    const D = this.cfg.dash;
    return D.distance / (D.decay * (1 - Math.exp(-D.duration / D.decay)));
  }

  /** Рывок в направлении мирового (dx, dz). false, если ещё перезаряжается или уже в рывке. */
  startDash(dx, dz) {
    if (this.dashing || this.cooldown > 0) return false;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) return false;
    this.dashX = dx / len;
    this.dashZ = dz / len;
    this.dashing = true;
    this.dashT = 0;
    this.glideT = 0;
    this.dashSeq++;
    return true;
  }

  /** Шаг. (inX, inZ): мировой вектор стика, длина 0..1. */
  update(dt, inX, inZ) {
    const H = this.cfg.hero;
    const D = this.cfg.dash;
    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.dashing) {
      const v = this.dashSpeed() * Math.exp(-this.dashT / D.decay);
      this.vx = this.dashX * v;
      this.vz = this.dashZ * v;
      this.dashT += dt;
      if (this.dashT >= D.duration) {
        this.dashing = false;
        this.glideT = D.glide;
        this.cooldown = D.cooldown;
      }
    } else {
      const tx = inX * H.speed;
      const tz = inZ * H.speed;
      // После рывка остаток скорости плавно переходит в обычное движение.
      const tau = this.glideT > 0 ? Math.max(H.accelTime, D.glide / 3) : H.accelTime;
      const k = tau <= 1e-6 ? 1 : 1 - Math.exp(-dt / tau);
      this.vx += (tx - this.vx) * k;
      this.vz += (tz - this.vz) * k;
      if (this.glideT > 0) this.glideT = Math.max(0, this.glideT - dt);
    }
    this.x += this.vx * dt;
    this.z += this.vz * dt;
  }

  get speed() { return Math.hypot(this.vx, this.vz); }
}
