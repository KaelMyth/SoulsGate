// Жуки: появление волнами и поведение (перенос systems_spawner.js и движения жуков из SoulsGate, мир в метрах).
//   пауза (waves.pause) → волна: пачки жуков выходят за краем экрана с интервалом interval, пока живых меньше потолка;
//   волна кончается, когда вышли все и все убиты → пауза → следующая. Волны 1-5 по рисункам (waves.patterns), дальше по таблице.
//   Здоровье жука растёт с волной (hpFor). Жук бежит к герою со стаей (swarm.js), при касании бьёт (beetle.touchDamage) с паузой touchCooldown.
// Числа: CONFIG.waves, CONFIG.beetle, CONFIG.swarm. Для тестов фабрику жуков можно подменить (make).
import { Swarm } from './swarm.js';

const TAU = Math.PI * 2;
const MAX_SPAWNS_PER_STEP = 20; // страховка от залпа при интервале 0

export class Spawner {
  /** cfg: весь CONFIG; make: () => жук с group/addTo/update (в игре 3D-жук, Beetle; в тестах заглушка, чтобы не грузить three) */
  constructor(scene, cfg, make) {
    this.scene = scene;
    this.cfg = cfg;
    this.make = make;
    this.swarm = new Swarm(cfg.swarm);
    this.pool = [];      // все созданные жуки (переиспользуются)
    this.alive = [];     // активные
    this.enabled = false;
    this.onTouch = null; // (жук) => true, если герой получил урон (тогда у жука пауза touchCooldown)
    this.reset();
  }

  /** Новая игра: поле пустое, первая волна после паузы. */
  reset() {
    this.clear();
    this.wave = 1;
    this.phase = 'pause';
    this.t = this.cfg.waves.pause;
    this.spawned = 0;
    this.spawnTimer = 0;
    this.lastAngle = null;
  }

  /** Включить: первая волна начинается после обычной паузы. */
  start() { this.enabled = true; this.reset(); }

  /** Рисунок волны n: { count, interval, maxAlive, groupSize, sides, spread }. */
  row(n) {
    const W = this.cfg.waves;
    if (n <= W.patterns.length) return W.patterns[n - 1];
    const k = n - W.patterns.length - 1;
    const base = { groupSize: 4, sides: 'varied', spread: 0.8 };
    if (k < W.table.length) return { ...base, ...W.table[k] };
    const last = W.table[W.table.length - 1];
    const extra = k - W.table.length + 1;
    return { ...base, count: last.count + 4 * extra, interval: Math.max(0.25, last.interval - 0.01 * extra), maxAlive: last.maxAlive + 2 * extra };
  }

  waveCount() { return Math.ceil(this.row(this.wave).count * this.cfg.waves.countMult); }
  cap() { return Math.min(this.cfg.waves.maxAlive, Math.ceil(this.row(this.wave).maxAlive * this.cfg.waves.countMult)); }

  /** Здоровье жука на волне n: +hpPerWave за волну, на каждой hpJumpEvery-й ещё +hpJumpPct от накопленного. */
  hpFor(n = this.wave) {
    const B = this.cfg.beetle;
    let h = B.hp;
    for (let w = 2; w <= n; w++) {
      h += B.hpPerWave;
      if (B.hpJumpEvery > 0 && w % B.hpJumpEvery === 0) h *= 1 + B.hpJumpPct;
    }
    return h;
  }

  take() {
    let b = this.pool.find((x) => !x.group.visible);
    if (!b) { b = this.make(); b.addTo(this.scene); this.pool.push(b); }
    b.group.visible = true;
    return b;
  }

  spawnAt(x, z, hx, hz) {
    const b = this.take();
    const hp = this.hpFor();
    b.state = { x, z, vx: 0, vz: 0 };
    b.x = x; b.z = z;
    b.radius = this.cfg.beetle.radius;
    b.hp = b.maxHp = hp;
    b.touchTimer = 0;
    b.kbVx = b.kbVz = 0;
    b.kbTau = 0.07;
    const d = Math.hypot(hx - x, hz - z) || 1;
    b.hx = (hx - x) / d; b.hz = (hz - z) / d;
    b.swX = b.swZ = 0;
    b.yaw = Math.atan2(b.hx, b.hz); // лицом к герою
    b.age = 0;
    b.flash = 0;
    this.alive.push(b);
    return b;
  }

  /** Пачка из size жуков вокруг героя (hx, hz) на радиусе R (за краем экрана). Возвращает, сколько вышло. */
  spawnGroup(size, pat, hx, hz, R, rnd) {
    const W = this.cfg.waves;
    const r = R + W.margin;
    let base = rnd() * TAU;
    if (pat.sides === 'varied' && this.lastAngle !== null) base = this.lastAngle + TAU * (0.3 + rnd() * 0.4); // 108°…252° от прошлой пачки
    const ring0 = rnd() * TAU;
    for (let i = 0; i < size; i++) {
      const a = pat.sides === 'ring' ? ring0 + (i / size) * TAU : base;
      let x = hx + Math.cos(a) * r, z = hz + Math.sin(a) * r;
      if (pat.sides !== 'ring' && pat.spread > 0 && size > 1) {
        x += (rnd() - 0.5) * 2 * pat.spread;
        z += (rnd() - 0.5) * 2 * pat.spread;
      }
      this.spawnAt(x, z, hx, hz);
    }
    this.lastAngle = pat.sides === 'ring' ? ring0 : base;
    return size;
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

  /** Отбросить жука от точки (fx, fz): откидывание выстрела (beetle.knockback за knockbackTime). */
  knock(b, dx, dz) {
    const B = this.cfg.beetle;
    const len = Math.hypot(dx, dz);
    if (len < 1e-9 || B.knockback <= 0) return;
    const t = Math.max(0.01, B.knockbackTime);
    b.kbTau = t;
    b.kbVx += (dx / len) * B.knockback / t;
    b.kbVz += (dz / len) * B.knockback / t;
    b.flash = 0.12;
  }

  /** Волны: пауза, выход пачек, конец волны. R: радиус от героя до края экрана на земле. */
  updateWaves(dt, hx, hz, R, rnd) {
    if (this.phase === 'pause') {
      this.t -= dt;
      if (this.t > 0) return;
      this.phase = 'active';
      this.spawned = 0;
      this.spawnTimer = 0;
      this.lastAngle = null;
    }
    const pat = this.row(this.wave);
    const total = this.waveCount();
    this.spawnTimer -= dt;
    let made = 0;
    while (this.spawnTimer <= 0 && this.spawned < total && made < MAX_SPAWNS_PER_STEP) {
      const size = Math.min(pat.groupSize, total - this.spawned);
      if (this.alive.length + size > this.cap()) break; // потолок на всю пачку
      const n = this.spawnGroup(size, pat, hx, hz, R, rnd);
      this.spawned += n; made += n;
      this.spawnTimer += pat.interval;
    }
    if (this.spawnTimer < 0) this.spawnTimer = 0; // не копим «долг», иначе после гибели жуков хлынет залп
    if (this.spawned >= total && this.alive.length === 0) {
      this.wave++;
      this.phase = 'pause';
      this.t = this.cfg.waves.pause;
    }
  }

  /** Движение жуков к герою с учётом стаи, откидывания и касаний. hero: { x, z, radius }. */
  moveBeetles(dt, hero) {
    const B = this.cfg.beetle;
    const list = this.alive;
    this.swarm.steer(list);
    for (const e of list) {
      let dx = hero.x - e.x, dz = hero.z - e.z;
      const d = Math.hypot(dx, dz) || 1e-4;
      dx /= d; dz /= d;
      let vx = dx + e.swX, vz = dz + e.swZ; // к герою + подсказка стаи
      const vl = Math.hypot(vx, vz) || 1;
      vx /= vl; vz /= vl;
      // Курс сглаживаем, чтобы стая не дёргалась.
      const k = 1 - Math.exp(-dt / 0.12);
      e.hx += (vx - e.hx) * k; e.hz += (vz - e.hz) * k;
      const hl = Math.hypot(e.hx, e.hz) || 1;
      e.hx /= hl; e.hz /= hl;
      e.state.vx = e.hx * B.speed; e.state.vz = e.hz * B.speed;
      e.x += e.state.vx * dt + e.kbVx * dt;
      e.z += e.state.vz * dt + e.kbVz * dt;
      const decay = Math.exp(-dt / Math.max(0.01, e.kbTau));
      e.kbVx *= decay; e.kbVz *= decay;
    }
    this.swarm.separate(list, hero);
    for (const e of list) {
      e.touchTimer = Math.max(0, e.touchTimer - dt);
      e.flash = Math.max(0, e.flash - dt);
      e.age += dt;
      e.state.x = e.x; e.state.z = e.z;
      const reach = hero.radius + e.radius + 0.1;
      const dx = hero.x - e.x, dz = hero.z - e.z;
      if (e.touchTimer <= 0 && dx * dx + dz * dz <= reach * reach && this.onTouch && this.onTouch(e)) e.touchTimer = B.touchCooldown;
    }
  }

  update(dt, hero, R, rnd = Math.random) {
    if (!this.enabled) return;
    this.updateWaves(dt, hero.x, hero.z, R, rnd);
    this.moveBeetles(dt, hero);
    for (const b of this.alive) b.update(dt, b.state);
  }
}
