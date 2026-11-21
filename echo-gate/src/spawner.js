// Жуки и жуки-стрелки: появление волнами и поведение (перенос systems_spawner.js, systems_shooters.js, systems_guards.js из SoulsGate, мир в метрах).
//   пауза (waves.pause) → волна: пачки жуков выходят за краем экрана с интервалом interval, пока живых меньше потолка;
//   волна кончается, когда вышли все и все убиты → пауза → следующая. Волны 1-5 по рисункам (waves.patterns), дальше по таблице.
//   Здоровье жука растёт с волной (hpFor). Жук бежит к герою со стаей (swarm.js), при касании бьёт (beetle.touchDamage) с паузой touchCooldown.
//   Стрелок (CONFIG.shooter) держит дистанцию, замирает на прицеливании и стреляет шаром (onShot). В волнах 2-3 стрелок выходит в кольце охраны
//   из жуков (CONFIG.guards); охрана бросается в бой, когда герой подошёл или стрелок убит.
//   Бык (CONFIG.bull): подходит, на дистанции attack.range замирает на замах windup (на земле красная полоса), потом рывок по полосе
//   на length за strike; достал героя: урон attack.damage. После рывка стоит recovery, затем пауза cooldown. В волне 3 каждая вторая пачка несёт быка вместо охранника.
//   Скала (CONFIG.rock): огромная, выходит из-за края экрана в начале волны rock.fromWave (и далее каждые rock.every), идёт к герою,
//   на slam.range замирает на замах (на земле кольцо), бьёт в землю и выпускает мошек (onSlam; мошки: midges.js).
//   Градации: доля стрелков и быков в волнах 6+ растёт с волной (waves.mix).
// Числа: CONFIG.waves, CONFIG.beetle, CONFIG.shooter, CONFIG.bull, CONFIG.rock, CONFIG.guards, CONFIG.swarm. Для тестов фабрику жуков можно подменить (make).
import { resetStatus, tickStatus } from './status.js';
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
    this.onSlam = null;   // (скала) => выпустить мошек
    this.onAttack = null; // (бык, урон) => герой получил рывок
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
    this.floorMode = false;
    this.testWave = 0;
    this.boss = null;
  }

  /** Старые волны остаются доступны для отладки и тестов. */
  start() { this.reset(); this.enabled = true; }

  startFloor(floor = 1) {
    this.reset();
    this.floorMode = true;
    this.floorIndex = Math.max(1, Math.floor(floor));
    this.floorElapsed = 0;
    this.floorPhase = 'mobs';
    this.wave = 1 + (this.floorIndex - 1) * 6;
    this.spawnTimer = 0.5;
    this.enabled = true;
  }

  /** Тестовое поле: бесконечный спавн по одной фиксированной волне, без босса. */
  startTest(wave = 6) {
    this.reset();
    this.floorMode = true;
    this.testWave = Math.max(1, Math.floor(wave));
    this.floorIndex = 1;
    this.floorElapsed = 0;
    this.floorPhase = 'test';
    this.wave = this.testWave;
    this.spawnTimer = 0.5;
    this.enabled = true;
  }

  endFloor() {
    this.enabled = false;
    this.floorPhase = 'cleared';
    this.clear();
  }

  spawnFloorBoss(hx, hz, R, rnd) {
    const r = R + this.cfg.waves.margin + this.cfg.rock.radius;
    const a = rnd() * TAU;
    const b = this.spawnAt(hx + Math.cos(a) * r, hz + Math.sin(a) * r, hx, hz, 'rock');
    b.hp = b.maxHp = Math.ceil(this.hpFor(this.wave, this.cfg.rock.hp)
      * this.cfg.floors.bossHpMult * Math.pow(1.25, this.floorIndex - 1));
    this.boss = b;
    this.floorPhase = 'boss';
  }

  /** Бесконечный поток: используем состав и ограничения существующих волн. */
  updateFloorSpawns(dt, hx, hz, R, rnd) {
    this.floorElapsed += dt;
    this.wave = this.testWave || 1 + (this.floorIndex - 1) * 6
      + Math.floor(this.floorElapsed / this.cfg.floors.spawnStageSeconds);
    if (this.floorPhase === 'mobs' && this.floorElapsed >= this.cfg.floors.duration) {
      this.spawnFloorBoss(hx, hz, R, rnd);
    }
    const pat = this.row(this.wave);
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      const size = this.floorPhase === 'boss' ? Math.max(1, Math.ceil(pat.groupSize / 2)) : pat.groupSize;
      if (this.alive.length + size <= this.cap()) {
        this.spawned += this.spawnGroup(size, pat, hx, hz, R, rnd);
        this.spawnTimer = Math.max(0.75, pat.interval);
      } else this.spawnTimer = 0.25;
    }
  }

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
    resetStatus(b);
    b.aim = 0; b.aimTotal = def.aimTime || 0; b.fireTimer = def.firstShotDelay || 0;
    b.guardOf = null; b.goalOn = false; b.goalX = b.goalZ = 0;
    b.gen = ++this.gen;
    const A = def.attack;
    b.heavy = kind === 'rock'; // тяжёлую скалу мелочь не расталкивает
    b.atk = { state: 'idle', t: 0, cd: A ? A.firstDelay : def.slam ? def.slam.firstDelay : 0, dirX: 0, dirZ: 0, hit: false };
    this.alive.push(b);
    return b;
  }

  /** Тип жука волны: по lineup рисунка, иначе в волнах 6+ бык с шансом bullShare и стрелок с шансом shooterShare. */
  pickKind(pat, index, rnd) {
    if (pat.lineup) return pat.lineup[index % pat.lineup.length];
    if (!pat.formation && this.wave > this.cfg.waves.patterns.length) {
      const r = rnd();
      const bull = this.share('bull'), shooter = this.share('shooter');
      if (r < bull) return 'bull';
      if (r < bull + shooter) return 'shooter';
    }
    return 'beetle';
  }

  /** Градация: доля вида kind среди жуков текущей волны (waves.mix): 0 до from, потом start + step за волну, не больше max. */
  share(kind, wave = this.wave) {
    const m = this.cfg.waves.mix[kind];
    if (wave < m.from) return 0;
    return Math.min(m.max, m.start + m.step * (wave - m.from));
  }

  /** Сколько скал выходит в начале волны n: 0 до rock.fromWave; дальше одна, и на каждые every волн ещё одна. */
  rockCount(n = this.wave) {
    const R = this.cfg.rock;
    if (n < R.fromWave) return 0;
    if (R.every <= 0) return n === R.fromWave ? 1 : 0;
    return (n - R.fromWave) % R.every === 0 ? 1 + (n - R.fromWave) / R.every : 0;
  }

  /** Скала выходит из-за края экрана: полностью за краем (радиус R + margin + её радиус) с случайной стороны. */
  spawnRocks(hx, hz, R, rnd) {
    const n = this.rockCount();
    if (n === 0) return;
    const r = R + this.cfg.waves.margin + this.cfg.rock.radius;
    const base = rnd() * TAU;
    for (let i = 0; i < n; i++) {
      const a = base + (i / Math.max(1, n)) * TAU;
      this.spawnAt(hx + Math.cos(a) * r, hz + Math.sin(a) * r, hx, hz, 'rock');
    }
  }

  /** Пачка со стрелком: стрелок в точке, size-1 охранников кольцом вокруг него. */
  spawnFormation(size, x, z, hx, hz, pat, groupIndex) {
    const G = this.cfg.guards;
    const leader = this.spawnAt(x, z, hx, hz, 'shooter');
    for (let i = 0; i < size - 1; i++) {
      const ang = (i / (size - 1)) * TAU;
      const bull = pat.support && i === size - 2 && (groupIndex + 1) % pat.support.every === 0; // свободный бык вместо охранника
      const g = this.spawnAt(x + Math.cos(ang) * G.ringDist, z + Math.sin(ang) * G.ringDist, hx, hz, bull ? pat.support.kind : 'beetle');
      if (bull) continue;
      g.guardOf = leader; g.guardGen = leader.gen; g.guardAng = ang; g.guardIdx = i; g.guardN = size - 1;
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
      this.spawnFormation(size, hx + Math.cos(base) * r, hz + Math.sin(base) * r, hx, hz, pat, Math.floor(this.spawned / Math.max(1, pat.groupSize)));
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

  /** Враги, отставшие от героя дальше R + margin + respawnFar, переносятся на кольцо за краем экрана в случайном месте
   * (проверка раз в 0.5 с). Скалу и стрелков с охраной не трогаем: они идут отрядом. Здоровье и вид остаются. */
  respawnFar(dt, hero, R, rnd) {
    const W = this.cfg.waves;
    if (!(W.respawnFar > 0)) return;
    this.farTimer = (this.farTimer || 0) - dt;
    if (this.farTimer > 0) return;
    this.farTimer = 0.5;
    const far = R + W.margin + W.respawnFar;
    const r = R + W.margin;
    for (const b of this.alive) {
      if (b.heavy || b.guardOf) continue;
      if (Math.hypot(b.x - hero.x, b.z - hero.z) <= far) continue;
      if (this.alive.some((e) => e.guardOf === b)) continue; // у стрелка есть охрана
      const a = rnd() * TAU;
      this.moveTo(b, hero.x + Math.cos(a) * r, hero.z + Math.sin(a) * r, hero);
    }
  }

  /** Перенос жука в точку (x, z) лицом к герою: движение и замахи сбрасываются. */
  moveTo(b, x, z, hero) {
    b.state.x = x; b.state.z = z; b.state.vx = b.state.vz = 0;
    b.x = x; b.z = z;
    b.kbVx = b.kbVz = 0;
    b.swX = b.swZ = 0;
    const d = Math.hypot(hero.x - x, hero.z - z) || 1;
    b.hx = (hero.x - x) / d; b.hz = (hero.z - z) / d;
    b.yaw = Math.atan2(b.hx, b.hz);
    const A = b.atk, def = b.def;
    A.state = 'idle'; A.t = 0; A.hit = false;
    A.cd = def.attack ? def.attack.firstDelay : A.cd;
    b.aim = 0; b.fireTimer = def.firstShotDelay || 0;
    b.age = 0;
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
    const sc = b.def && b.def.knockbackScale !== undefined ? b.def.knockbackScale : 1;
    b.kbVx += (dx / len) * B.knockback * sc / t;
    b.kbVz += (dz / len) * B.knockback * sc / t;
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
      this.spawnRocks(hx, hz, R, rnd);
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
    const broken = new Set(); // стрелки, чья охрана уже бросилась в бой: если подошли к одному из охранников, нападает вся охрана сразу
    for (const e of this.alive) {
      const g = e.guardOf;
      if (!g) continue;
      if (g.gen !== e.guardGen || g.hp <= 0 || !g.group.visible
        || Math.hypot(hero.x - e.x, hero.z - e.z) < G.breakDist || Math.hypot(hero.x - g.x, hero.z - g.z) < G.breakDist) broken.add(g);
    }
    for (const e of this.alive) {
      const g = e.guardOf;
      if (!g) continue;
      if (broken.has(g) || g.gen !== e.guardGen || g.hp <= 0 || !g.group.visible) {
        e.guardOf = null; e.goalOn = false;
        continue;
      }
      // Охрана заслоняет стрелка веером со стороны героя: центр веера смотрит на героя, ширина G.arc рад. Веер поворачивается за героем.
      const n = e.guardN || 1, k = n > 1 ? (e.guardIdx / (n - 1)) - 0.5 : 0;
      const a = Math.atan2(hero.z - g.z, hero.x - g.x) + k * (G.arc || 0);
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

  /** Рывок быка (systems_attacks.js): idle → windup → strike → recovery → idle. d: расстояние до героя. */
  updateBull(e, dt, hero, d) {
    const A = e.def.attack, a = e.atk;
    if (a.state === 'idle') {
      if (a.cd > 0) a.cd -= dt;
      if (a.cd > 0 || d > A.range || d < 1e-6) return;
      a.state = 'windup'; a.t = 0; a.hit = false;
      a.dirX = (hero.x - e.x) / d; a.dirZ = (hero.z - e.z) / d; // направление запоминается: от рывка можно уйти
    } else if (a.state === 'windup') {
      a.t += dt;
      if (a.t >= A.windup) { a.state = 'strike'; a.t = 0; }
    } else if (a.state === 'strike') {
      a.t += dt;
      e.x += a.dirX * (A.length / A.strike) * dt;
      e.z += a.dirZ * (A.length / A.strike) * dt;
      const dx = hero.x - e.x, dz = hero.z - e.z, reach = hero.radius + e.radius;
      if (!a.hit && dx * dx + dz * dz <= reach * reach) {
        a.hit = true;
        if (this.onAttack) this.onAttack(e, A.damage);
        a.state = 'recovery'; a.t = 0; // достал и встал
      } else if (a.t >= A.strike) { a.state = 'recovery'; a.t = 0; }
    } else {
      a.t += dt;
      if (a.t >= A.recovery) { a.state = 'idle'; a.t = 0; a.cd = A.cooldown; }
    }
  }

  /** Скала (systems_rockbeetle.js): idle → windup → recovery → idle; в конце замаха удар в землю и мошки. */
  updateRock(e, dt, d) {
    const S = e.def.slam, a = e.atk;
    if (a.state === 'idle') {
      if (a.cd > 0) a.cd -= dt;
      if (a.cd <= 0 && d <= S.range) { a.state = 'windup'; a.t = 0; }
    } else if (a.state === 'windup') {
      a.t += dt;
      if (a.t >= S.windup) {
        if (this.onSlam) this.onSlam(e);
        a.state = 'recovery'; a.t = 0;
      }
    } else {
      a.t += dt;
      if (a.t >= S.recovery) { a.state = 'idle'; a.t = 0; a.cd = S.cooldown; }
    }
  }

  /** Что рисовать на земле: { x, z, dirX, dirZ, length, width, progress } пока бык замахивается, иначе null. */
  telegraph(e, out = {}) {
    if (e.def.slam) { // кольцо замаха скалы
      if (e.atk.state !== 'windup') return null;
      out.shape = 'circle'; out.x = e.x; out.z = e.z;
      out.radius = e.radius * e.def.slam.ringScale;
      out.progress = Math.min(1, e.atk.t / Math.max(0.01, e.def.slam.windup));
      return out;
    }
    if (!e.def.attack || e.atk.state !== 'windup') return null;
    out.shape = 'line';
    const A = e.def.attack;
    out.x = e.x; out.z = e.z; out.dirX = e.atk.dirX; out.dirZ = e.atk.dirZ;
    out.length = A.length; out.width = Math.max(A.width, e.radius * 2);
    out.progress = Math.min(1, e.atk.t / Math.max(0.01, A.windup));
    return out;
  }

  /** Движение жуков к герою (стрелки держат дистанцию, охрана идёт на место в кольце) с учётом стаи, откидывания и касаний. hero: { x, z, radius }. */
  moveBeetles(dt0, hero) {
    let dt = dt0;
    const list = this.alive;
    this.updateGuards(hero);
    this.swarm.steer(list);
    for (const e of list) {
      const def = e.def;
      e.timeMul = tickStatus(e, dt0, this.cfg.ice); // лёд: замедление и заморозка
      dt = dt0 * e.timeMul;
      if (e.goalOn) e.swX = e.swZ = 0; // стая охранников не тянет их друг к другу
      const hdx = hero.x - e.x, hdz = hero.z - e.z;
      const d = Math.hypot(hdx, hdz) || 1e-4;
      if (def.shot) this.updateShooter(e, dt, hero, d);
      if (def.attack) this.updateBull(e, dt, hero, d);
      if (def.slam) this.updateRock(e, dt, d);
      const tx = e.goalOn ? e.goalX : hero.x, tz = e.goalOn ? e.goalZ : hero.z;
      let dx = tx - e.x, dz = tz - e.z;
      const dist = Math.hypot(dx, dz) || 1e-4;
      dx /= dist; dz /= dist;
      const gap = e.goalOn ? dist - 0.1 : d - (hero.radius + e.radius - 0.07);
      const hold = (def.keepDistance > 0 && (e.aim > 0 || (!e.goalOn && d <= def.keepDistance))) || (def.attack && e.atk.state !== 'idle') || (def.slam && e.atk.state !== 'idle');
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
      if (def.attack && e.atk.state !== 'idle') e.state.face = Math.atan2(e.atk.dirX, e.atk.dirZ); // бык смотрит туда, куда прорвётся
      e.x += (vx + e.kbVx) * dt;
      e.z += (vz + e.kbVz) * dt;
      if (def.attack && e.atk.state === 'strike') { e.state.vx = e.atk.dirX * def.attack.length / def.attack.strike; e.state.vz = e.atk.dirZ * def.attack.length / def.attack.strike; } // для анимации
      const decay = Math.exp(-dt0 / Math.max(0.01, e.kbTau));
      e.kbVx *= decay; e.kbVz *= decay;
    }
    dt = dt0;
    this.swarm.separate(list, hero);
    for (const e of list) {
      e.touchTimer = Math.max(0, e.touchTimer - dt);
      e.flash = Math.max(0, e.flash - dt);
      e.age += dt;
      e.state.x = e.x; e.state.z = e.z;
      const reach = hero.radius + e.radius + 0.1;
      const dx = hero.x - e.x, dz = hero.z - e.z;
      if (e.touchTimer <= 0 && !(e.freezeT > 0) && dx * dx + dz * dz <= reach * reach && this.onTouch && this.onTouch(e)) e.touchTimer = e.def.touchCooldown;
    }
  }

  update(dt, hero, R, rnd = Math.random) {
    if (!this.enabled) return;
    if (this.floorMode) this.updateFloorSpawns(dt, hero.x, hero.z, R, rnd);
    else this.updateWaves(dt, hero.x, hero.z, R, rnd);
    this.respawnFar(dt, hero, R, rnd);
    this.moveBeetles(dt, hero);
    for (const b of this.alive) b.update(dt * (b.timeMul === undefined ? 1 : b.timeMul), b.state); // замороженный замирает и в анимации
  }
}
