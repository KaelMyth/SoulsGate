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
    this.bounds = null; // { hx, hz, ang, blocks }: прямоугольник, повёрнутый на ang вокруг начала; null = мир без границ
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
    if (this.bounds) this.clamp();
  }

  /** Не выпускать за прямоугольник bounds; скорость вдоль упёртой стены гасится. */
  clamp() {
    const { hx, hz, ang } = this.bounds;
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    // Мировые (x, z) в местные (lx, lz): поворот на -ang.
    let lx = this.x * c - this.z * s;
    let lz = this.x * s + this.z * c;
    let lvx = this.vx * c - this.vz * s;
    let lvz = this.vx * s + this.vz * c;
    if (lx > hx) { lx = hx; if (lvx > 0) lvx = 0; } else if (lx < -hx) { lx = -hx; if (lvx < 0) lvx = 0; }
    if (lz > hz) { lz = hz; if (lvz > 0) lvz = 0; } else if (lz < -hz) { lz = -hz; if (lvz < 0) lvz = 0; }
    // Препятствия (местные прямоугольники {x, z, hx, hz} и круги {x, z, r}): выталкиваем по оси с меньшим проникновением.
    for (const b of this.bounds.blocks || []) {
      const dx = lx - b.x, dz = lz - b.z;
      if (b.r !== undefined) { // круглое препятствие {x, z, r} (костёр): выталкиваем по радиусу, скорость в сторону костра гасится
        const d = Math.hypot(dx, dz);
        if (d >= b.r) continue;
        const nx = d > 1e-6 ? dx / d : 1, nz = d > 1e-6 ? dz / d : 0;
        lx = b.x + nx * b.r; lz = b.z + nz * b.r;
        const into = lvx * nx + lvz * nz;
        if (into < 0) { lvx -= into * nx; lvz -= into * nz; } // остаётся скольжение вдоль круга
        continue;
      }
      const px = b.hx - Math.abs(dx), pz = b.hz - Math.abs(dz);
      if (px <= 0 || pz <= 0) continue;
      if (px < pz) { lx = b.x + Math.sign(dx || 1) * b.hx; if (lvx * dx < 0) lvx = 0; }
      else { lz = b.z + Math.sign(dz || 1) * b.hz; if (lvz * dz < 0) lvz = 0; }
    }
    this.x = lx * c + lz * s;
    this.z = -lx * s + lz * c;
    this.vx = lvx * c + lvz * s;
    this.vz = -lvx * s + lvz * c;
  }

  get speed() { return Math.hypot(this.vx, this.vz); }
}
