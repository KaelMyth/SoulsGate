// Жуки и жуки-стрелки: появление волнами и поведение (перенос systems_spawner.js, systems_shooters.js, systems_guards.js из SoulsGate, мир в метрах).
//   пауза (waves.pause) → волна: пачки жуков выходят за краем экрана с интервалом interval, пока живых меньше потолка;
//   волна кончается, когда вышли все и все убиты → пауза → следующая. Волны 1-5 по рисункам (waves.patterns), дальше по таблице.
//   Здоровье жука растёт с волной (hpFor). Жук бежит к герою со стаей (swarm.js), при касании бьёт (beetle.touchDamage) с паузой touchCooldown.
//   Стрелок (CONFIG.shooter) держит дистанцию, замирает на прицеливании и стреляет шаром (onShot). В волнах 2-3 стрелок выходит в кольце охраны
//   из жуков (CONFIG.guards); охрана бросается в бой, когда герой подошёл или стрелок убит.
// Числа: CONFIG.waves, CONFIG.beetle, CONFIG.shooter, CONFIG.guards, CONFIG.swarm. Для тестов фабрику жуков можно подменить (make).
import { Swarm } from './swarm.js';

const TAU = Math.PI * 2;
const MAX_SPAWNS_PER_STEP = 20; // страховка от залпа при интервале 0

export class Spawner {
  /** cfg: весь CONFIG; make: (kind) => жук с group/addTo/update (kind 'beetle' | 'shooter'; в тестах заглушка, чтобы не грузить three) */
  constructor(scene, cfg, make) {
    this.scene = scene;
    this.cfg = cfg;
    this.make = make;
    this.swarm = new Swarm(cfg.swarm);
    this.gen = 0;
    this.pool = [];      // все созданные жуки (переиспользуются)
    this.alive = [];     // активные
    this.enabled = false;
    this.onShot = null;  // (стрелок, dirX, dirZ) => выпустить шар
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
  hpFor(n = this.wave, base = this.cfg.beetle.hp) {
    const B = this.cfg.beetle;
    let h = base;
    for (let w = 2; w <= n; w++) {
      h += B.hpPerWave;
      if (B.hpJumpEvery > 0 && w % B.hpJumpEvery === 0) h *= 1 + B.hpJumpPct;
    }
    return h;
  }

  take(kind) {
    let b = this.pool.find((x) => x.kind === kind && !x.group.visible);
    if (!b) { b = this.make(kind); b.kind = kind; b.addTo(this.scene); this.pool.push(b); }
    b.group.visible = true;
    return b;
  }

  spawnAt(x, z, hx, hz, kind = 'beetle') {
    const b = this.take(kind);
    const def = this.cfg[kind];
    b.def = def;
    b.state = { x, z, vx: 0, vz: 0 };
    b.x = x; b.z = z;
    b.radius = def.radius;
    b.hp = b.maxHp = this.hpFor(this.wave, def.hp);
    b.touchTimer = 0;
    b.kbVx = b.kbVz = 0;
    b.kbTau = 0.07;
    const d = Math.hypot(hx - x, hz - z) || 1;
    b.hx = (hx - x) / d; b.hz = (hz - z) / d;
    b.swX = b.swZ = 0;
    b.swarm = kind === 'beetle';
    b.yaw = Math.atan2(b.hx, b.hz); // лицом к герою
    b.age = 0;
    b.flash = 0;
    b.aim = 0; b.aimTotal = def.aimTime || 0; b.fireTimer = def.firstShotDelay || 0;
    b.guardOf = null; b.goalOn = false; b.goalX = b.goalZ = 0;
    b.gen = ++this.gen;
    this.alive.push(b);
    return b;
  }

  /** Тип жука волны: по lineup рисунка, иначе стрелок с шансом shooterShare (только волны 6+). */
  pickKind(pat, index, rnd) {
    if (pat.lineup) return pat.lineup[index % pat.lineup.length];
    if (!pat.formation && this.wave > this.cfg.waves.patterns.length && rnd() < this.cfg.waves.shooterShare) return 'shooter';
    return 'beetle';
  }

  /** Пачка со стрелком: стрелок в точке, size-1 охранников кольцом вокруг него. */
  spawnFormation(size, x, z, hx, hz) {
    const G = this.cfg.guards;
    const leader = this.spawnAt(x, z, hx, hz, 'shooter');
    for (let i = 0; i < size - 1; i++) {
      const ang = (i / (size - 1)) * TAU;
      const g = this.spawnAt(x + Math.cos(ang) * G.ringDist, z + Math.sin(ang) * G.ringDist, hx, hz, 'beetle');
      g.guardOf = leader; g.guardGen = leader.gen; g.guardAng = ang;
      g.goalOn = true; g.goalX = g.x; g.goalZ = g.z;
    }
  }

  /** Пачка из size жуков вокруг героя (hx, hz) на радиусе R (за краем экрана). Возвращает, сколько вышло. */
  spawnGroup(size, pat, hx, hz, R, rnd) {
    const W = this.cfg.waves;
    const r = R + W.margin;
    let base = rnd() * TAU;
    if (pat.sides === 'varied' && this.lastAngle !== null) base = this.lastAngle + TAU * (0.3 + rnd() * 0.4); // 108°…252° от прошлой пачки
    const ring0 = rnd() * TAU;
    if (pat.formation) {
      this.lastAngle = base;
      this.spawnFormation(size, hx + Math.cos(base) * r, hz + Math.sin(base) * r, hx, hz);
      return size;
    }
    for (let i = 0; i < size; i++) {
      const a = pat.sides === 'ring' ? ring0 + (i / size) * TAU : base;
      let x = hx + Math.cos(a) * r, z = hz + Math.sin(a) * r;
      if (pat.sides !== 'ring' && pat.spread > 0 && size > 1) {
        x += (rnd() - 0.5) * 2 * pat.spread;
        z += (rnd() - 0.5) * 2 * pat.spread;
      }
      this.spawnAt(x, z, hx, hz, this.pickKind(pat, this.spawned + i, rnd));
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

  /** Охрана: место в кольце вокруг стрелка; бросается в бой, когда герой подошёл или стрелок погиб (guards.js из SoulsGate). */
  updateGuards(hero) {
    const G = this.cfg.guards;
    for (const e of this.alive) {
      const g = e.guardOf;
      if (!g) continue;
      if (g.gen !== e.guardGen || g.hp <= 0 || !g.group.visible
        || Math.hypot(hero.x - e.x, hero.z - e.z) < G.breakDist || Math.hypot(hero.x - g.x, hero.z - g.z) < G.breakDist) {
        e.guardOf = null; e.goalOn = false;
        continue;
      }
      const a = Math.atan2(hero.z - g.z, hero.x - g.x) + e.guardAng; // кольцо поворачивается, один охранник всегда между стрелком и героем
      e.goalX = g.x + Math.cos(a) * G.ringDist;
      e.goalZ = g.z + Math.sin(a) * G.ringDist;
    }
  }

  /** Стрелок: прицеливается и стреляет (systems_shooters.js). d: расстояние до героя. */
  updateShooter(e, dt, hero, d) {
    const def = e.def;
    if (e.aim > 0) {
      e.aim -= dt;
      if (e.aim <= 0) {
        e.aim = 0;
        if (this.onShot) this.onShot(e, (hero.x - e.x) / (d || 1), (hero.z - e.z) / (d || 1));
        e.fireTimer = def.fireInterval;
      }
      return;
    }
    if (d > def.shotRange) return;
    e.fireTimer -= dt;
    if (e.fireTimer <= 0) e.aim = def.aimTime;
  }

  /** Движение жуков к герою (стрелки держат дистанцию, охрана идёт на место в кольце) с учётом стаи, откидывания и касаний. hero: { x, z, radius }. */
  moveBeetles(dt, hero) {
    const list = this.alive;
    this.updateGuards(hero);
    this.swarm.steer(list);
    for (const e of list) {
      const def = e.def;
      if (e.goalOn) e.swX = e.swZ = 0; // стая охранников не тянет их друг к другу
      const hdx = hero.x - e.x, hdz = hero.z - e.z;
      const d = Math.hypot(hdx, hdz) || 1e-4;
      if (def.shot) this.updateShooter(e, dt, hero, d);
      const tx = e.goalOn ? e.goalX : hero.x, tz = e.goalOn ? e.goalZ : hero.z;
      let dx = tx - e.x, dz = tz - e.z;
      const dist = Math.hypot(dx, dz) || 1e-4;
      dx /= dist; dz /= dist;
      const gap = e.goalOn ? dist - 0.1 : d - (hero.radius + e.radius - 0.07);
      const hold = def.keepDistance > 0 && (e.aim > 0 || (!e.goalOn && d <= def.keepDistance));
      let vx = 0, vz = 0;
      if (gap > 0 && !hold) {
        let mx = dx + e.swX, mz = dz + e.swZ; // к цели + подсказка стаи
        const ml = Math.hypot(mx, mz) || 1;
        mx /= ml; mz /= ml;
        const k = 1 - Math.exp(-dt / 0.12); // курс сглаживаем, чтобы стая не дёргалась
        e.hx += (mx - e.hx) * k; e.hz += (mz - e.hz) * k;
        const hl = Math.hypot(e.hx, e.hz) || 1;
        e.hx /= hl; e.hz /= hl;
        let sp = def.speed;
        if (!e.swarm || e.goalOn) sp = Math.min(sp, gap / dt); // не вдавливаемся в героя и не проскакиваем место в кольце
        vx = e.hx * sp; vz = e.hz * sp;
      }
      e.state.vx = vx; e.state.vz = vz;
      e.state.face = Math.atan2(hdx, hdz); // стрелок смотрит на героя, пока стоит
      e.x += (vx + e.kbVx) * dt;
      e.z += (vz + e.kbVz) * dt;
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
      if (e.touchTimer <= 0 && dx * dx + dz * dz <= reach * reach && this.onTouch && this.onTouch(e)) e.touchTimer = e.def.touchCooldown;
    }
  }

  update(dt, hero, R, rnd = Math.random) {
    if (!this.enabled) return;
    this.updateWaves(dt, hero.x, hero.z, R, rnd);
    this.moveBeetles(dt, hero);
    for (const b of this.alive) b.update(dt, b.state);
  }
}
