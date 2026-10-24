// Дробь (мод «Дробь»): снаряд вылетает веером мелких дробинок. Дробинок бывает сотни за выстрел, поэтому это не сущности
// из пула, а плоские массивы чисел: создание это запись в массив, обновление это один цикл без объектов и выделений памяти.
// Живые дробинки лежат плотно в [0, n); убитая заменяется последней. Рисуются одним путём за кадр (см. renderer.drawPellets).

export class Pellets {
  /** o: { config, arena, grid (SpatialGrid), enemies (EntityPool), onHit(enemy, pellet index данные) } */
  constructor(o) {
    this.cfg = o.config;
    this.arena = o.arena;
    this.grid = o.grid;
    this.enemies = o.enemies;
    this.onHit = o.onHit; // (enemy, damage, vx, vy, volley) => void
    const N = o.config.shot.capacity;
    this.cap = N;
    this.n = 0;
    this.x = new Float32Array(N);
    this.y = new Float32Array(N);
    this.px = new Float32Array(N);   // прошлое положение: для плавной отрисовки между шагами
    this.py = new Float32Array(N);
    this.vx = new Float32Array(N);
    this.vy = new Float32Array(N);
    this.left = new Float32Array(N); // сколько ещё лететь
    this.dmg = new Float32Array(N);
    this.reach = 0;
  }

  clear() {
    this.n = 0;
  }

  /** Сколько ещё дробинок влезет. */
  free() {
    return this.cap - this.n;
  }

  /** Добавить дробинку (без проверки места: вызывающий смотрит free()). */
  add(x, y, vx, vy, range, dmg) {
    const i = this.n++;
    this.x[i] = this.px[i] = x;
    this.y[i] = this.py[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.left[i] = range;
    this.dmg[i] = dmg;
  }

  remove(i) {
    const last = --this.n;
    if (i === last) return;
    this.x[i] = this.x[last]; this.y[i] = this.y[last];
    this.px[i] = this.px[last]; this.py[i] = this.py[last];
    this.vx[i] = this.vx[last]; this.vy[i] = this.vy[last];
    this.left[i] = this.left[last]; this.dmg[i] = this.dmg[last];
  }

  update(dt) {
    const S = this.cfg.shot;
    const arena = this.arena;
    const en = this.enemies.items;
    const grid = this.grid;
    // Самый крупный враг + запас на сдвиг врагов с момента сборки сетки (как у обычных снарядов).
    if (!this.reach) {
      let big = 0;
      for (const k in this.cfg.enemies) big = Math.max(big, this.cfg.enemies[k].radius || 0);
      this.reach = big + 12;
    }
    const q = S.radius + this.reach;
    for (let i = this.n - 1; i >= 0; i--) {
      const vx = this.vx[i];
      const vy = this.vy[i];
      this.px[i] = this.x[i];
      this.py[i] = this.y[i];
      const x = (this.x[i] += vx * dt);
      const y = (this.y[i] += vy * dt);
      this.left[i] -= Math.hypot(vx, vy) * dt;
      if (this.left[i] <= 0 || x < arena.left || x > arena.right || y < arena.top || y > arena.bottom
        || arena.circleHitsRock(x, y, S.radius)) {
        this.remove(i);
        continue;
      }
      const cnt = grid.query(x, y, q);
      const buf = grid.buf;
      let hit = false;
      for (let k = 0; k < cnt; k++) {
        const e = en[buf[k]];
        if (!e || !e.active) continue;
        const dx = x - e.x;
        const dy = y - e.y;
        const r = S.radius + e.radius;
        if (dx * dx + dy * dy <= r * r) {
          this.onHit(e, this.dmg[i], vx, vy);
          hit = true;
          break;
        }
      }
      if (hit) this.remove(i);
    }
  }
}
