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
    this.onHit = o.onHit; // (enemy, damage, vx, vy, burnDmg, burnInt, frost, steam) => void
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
    this.sd = new Float32Array(N);   // случайное зерно дробинки: по нему отрисовка раскидывает клубы, не зависит от номера в массиве
    this.mx = new Float32Array(N);   // дальность при вылете: по ней отрисовка считает возраст частицы
    this.dmg = new Float32Array(N);
    this.bd = new Float32Array(N);   // горение: урон тика (0 = дробинка не поджигает)
    this.bi = new Float32Array(N);   // горение: интервал тиков
    this.st = new Float32Array(N);   // пар: множитель горения облака (0 = нет связки)
    this.zp = new Uint8Array(N);     // 1 = дробинка электризует
    this.fr = new Uint8Array(N);
    this.pp = new Float32Array(N);   // шанс фантомного веера при попадании (0 = дробинка фантом не вызывает)
    this.pg = new Uint8Array(N);     // поколение фантома (для затухания шанса)
    this.pc = new Uint8Array(N);     // сколько врагов ещё можно пройти насквозь (мод «Пробитие»)
    this.lh = new Array(N).fill(null); // последний пробитый враг: его второй раз не бьём     // 1 = дробинка вешает заряд Мороза
    this.hitHistory = new Array(N).fill(null); // история пробитых целей, переиспользуется при удалении дробинки
    this.candidates = [];
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
  add(x, y, vx, vy, range, dmg, bd = 0, bi = 0, fr = 0, st = 0, zp = 0, pc = 0, pp = 0, pg = 0) {
    const i = this.n++;
    this.x[i] = this.px[i] = x;
    this.y[i] = this.py[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.left[i] = this.mx[i] = range;
    this.sd[i] = Math.random();
    this.dmg[i] = dmg;
    this.bd[i] = bd;
    this.bi[i] = bi;
    this.fr[i] = fr;
    this.st[i] = st;
    this.zp[i] = zp;
    this.pc[i] = pc;
    this.pp[i] = pp;
    this.pg[i] = pg;
    this.lh[i] = null;
    if (this.hitHistory[i]) this.hitHistory[i].length = 0;
  }

  remove(i) {
    const last = --this.n;
    if (i === last) return;
    const recycled = this.hitHistory[i];
    this.hitHistory[i] = this.hitHistory[last];
    this.hitHistory[last] = recycled;
    this.x[i] = this.x[last]; this.y[i] = this.y[last];
    this.px[i] = this.px[last]; this.py[i] = this.py[last];
    this.vx[i] = this.vx[last]; this.vy[i] = this.vy[last];
    this.left[i] = this.left[last]; this.mx[i] = this.mx[last]; this.sd[i] = this.sd[last]; this.dmg[i] = this.dmg[last];
    this.bd[i] = this.bd[last]; this.bi[i] = this.bi[last]; this.fr[i] = this.fr[last]; this.st[i] = this.st[last]; this.zp[i] = this.zp[last]; this.pc[i] = this.pc[last]; this.lh[i] = this.lh[last]; this.pp[i] = this.pp[last]; this.pg[i] = this.pg[last];
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
      const candidates = this.candidates;
      const cnt = grid.query(x, y, q, candidates);
      let hit = false;
      for (let k = 0; k < cnt; k++) {
        const e = en[candidates[k]];
        if (!e || !e.active || (this.hitHistory[i] && this.hitHistory[i].includes(e))) continue;
        const dx = x - e.x;
        const dy = y - e.y;
        const r = S.radius + e.radius;
        if (dx * dx + dy * dy <= r * r) {
          this.onHit(e, this.dmg[i], vx, vy, this.bd[i], this.bi[i], this.fr[i], this.st[i], this.zp[i], this.pc[i], this.pp[i], this.pg[i]);
          if (this.pc[i] > 0) {
            this.pc[i]--;
            (this.hitHistory[i] || (this.hitHistory[i] = [])).push(e);
            break;
          } // пробила: летит дальше
          hit = true;
          break;
        }
      }
      if (hit) this.remove(i);
    }
  }
}
