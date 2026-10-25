// Волны: враги приходят пачками по таблице из config.waves.table и появляются за краем экрана.
//
//   передышка (waves.intermission с, на экране «Волна N») → волна: враги выходят с заданным интервалом,
//   пока их живых меньше потолка; волна кончается, когда вышли все и все убиты → передышка → следующая.
//
// Начиная с waves.crash.startWave идёт краш-тест: волна не кончается, потолок живых растёт на capGrowth
// в секунду, а интервал появления падает до minInterval. Он нужен, чтобы найти число врагов,
// на котором телефон перестаёт держать 60 FPS.
//
// Миниборс (config.waves.boss): когда на волне босса убиты все враги, выходит босс, и новые враги не появляются,
// пока он жив. Убили босса: передышка и обычные волны дальше.
//
// После waves.total волн забег пройден: событие 'run:completed' { wave }, новые враги не выходят.
// События: 'wave:started' { wave, crash }, 'wave:cleared' { wave }, 'boss:spawned' { enemy }, 'boss:defeated' { wave }, 'run:completed' { wave }.
import { initEnemy } from './world_enemy.js';

const MAX_SPAWNS_PER_STEP = 20; // страховка: даже при интервале 0 за шаг не больше стольких

const TAU = Math.PI * 2;

/**
 * Точка за пределами видимой области камеры, но внутри арены. Пишет результат в out, возвращает false,
 * если подходящего места не нашлось (например, арена целиком помещается на экране).
 */
export function pickSpawnPoint(rnd, cam, arena, margin, out) {
  const edge = 20; // отступ от стены арены
  // 1) Кольцо вокруг камеры: радиус больше половины диагонали экрана, значит точка точно вне кадра.
  const R = Math.hypot(cam.viewW, cam.viewH) / 2 + margin;
  for (let i = 0; i < 16; i++) {
    const a = rnd() * TAU;
    const x = cam.x + Math.cos(a) * R;
    const y = cam.y + Math.sin(a) * R;
    if (x > arena.left + edge && x < arena.right - edge && y > arena.top + edge && y < arena.bottom - edge) {
      out.x = x;
      out.y = y;
      return true;
    }
  }
  // 2) Запасной путь: любая точка арены вне прямоугольника экрана.
  for (let i = 0; i < 16; i++) {
    const x = arena.left + edge + rnd() * (arena.width - 2 * edge);
    const y = arena.top + edge + rnd() * (arena.height - 2 * edge);
    if (Math.abs(x - cam.x) > cam.viewW / 2 + margin || Math.abs(y - cam.y) > cam.viewH / 2 + margin) {
      out.x = x;
      out.y = y;
      return true;
    }
  }
  return false;
}

export class Spawner {
  /** o: { config, enemies (EntityPool), camera, arena, rnd, bus? } */
  constructor(o) {
    this.cfg = o.config;
    this.enemies = o.enemies;
    this.camera = o.camera;
    this.arena = o.arena;
    this.rnd = o.rnd;
    this.bus = o.bus || null;
    this.hero = o.hero || null; // нужен, чтобы босс появился рядом с героем
    this.pt = { x: 0, y: 0 };
    this.alive = 0;
    this.reset();
  }

  /** Новый забег: с волны waves.startWave (по умолчанию с первой). */
  reset() {
    this.jumpToWave(this.cfg.waves.startWave);
  }

  /** Перейти к волне n: передышка с надписью, затем волна. Живых врагов не трогает. */
  jumpToWave(n) {
    this.wave = Math.max(1, Math.round(n));
    this.phase = 'intermission';
    this.timer = this.cfg.waves.intermission;
    this.spawned = 0;
    this.crashTime = 0;
    this.spawnTimer = 0;
  }

  /** Идёт ли краш-тест: он выключен по умолчанию (waves.crash.enabled), а когда включён, начинается с startWave. */
  get crash() {
    const c = this.cfg.waves.crash;
    return c.enabled >= 1 && this.wave >= c.startWave;
  }

  /** Строка таблицы для волны; после конца таблицы держится последняя. */
  row(wave) {
    const t = this.cfg.waves.table;
    return t[Math.min(wave, t.length) - 1];
  }

  /** Сколько врагов в волне (с множителем численности). В краш-тесте не ограничено. */
  waveCount() {
    return this.crash ? Infinity : Math.ceil(this.row(this.wave).count * this.cfg.spawn.countMult);
  }

  /** Потолок живых врагов сейчас: по таблице, в краш-тесте растёт со временем, всегда под жёстким потолком. */
  cap() {
    const base = Math.ceil(this.row(this.wave).maxAlive * this.cfg.spawn.countMult);
    const grow = this.crash ? Math.floor(this.crashTime * this.cfg.waves.crash.capGrowth) : 0;
    return Math.min(base + grow, this.cfg.limits.maxEnemies);
  }

  /** Интервал между появлениями сейчас. В краш-тесте плавно падает до minInterval за rampTime. */
  interval() {
    const row = this.row(this.wave);
    if (!this.crash) return row.interval;
    const c = this.cfg.waves.crash;
    const k = Math.min(1, this.crashTime / Math.max(0.001, c.rampTime));
    return row.interval + (c.minInterval - row.interval) * k;
  }

  countAlive() {
    const items = this.enemies.items;
    let n = 0;
    for (let i = 0; i < items.length; i++) if (items[i].active) n++;
    return n;
  }

  update(dt) {
    if (this.phase === 'intermission') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.phase = 'active';
        this.spawned = 0;
        this.crashTime = 0;
        this.spawnTimer = 0;
        if (this.bus) this.bus.emit('wave:started', { wave: this.wave, crash: this.crash });
      }
      return;
    }

    if (this.phase === 'complete') return; // забег пройден: ждём перезапуска

    // Бой с боссом: новые враги не выходят, пока босс жив. Убили босса: обычные волны идут дальше.
    if (this.phase === 'boss') {
      this.alive = this.countAlive();
      if (this.alive === 0) {
        if (this.bus) this.bus.emit('boss:defeated', { wave: this.wave });
        const total = this.cfg.waves.total;
        if (total > 0 && this.wave >= total) { // победа над финальным боссом: забег пройден
          this.phase = 'complete';
          if (this.bus) this.bus.emit('run:completed', { wave: this.wave });
          return;
        }
        this.wave++;
        this.phase = 'intermission';
        this.timer = this.cfg.waves.intermission;
      }
      return;
    }

    if (this.crash) this.crashTime += dt;
    this.alive = this.countAlive();
    const total = this.waveCount();
    this.spawnTimer -= dt;
    let made = 0;
    while (this.spawnTimer <= 0 && this.spawned < total && this.alive < this.cap() && made < MAX_SPAWNS_PER_STEP) {
      if (!this.spawnOne()) break;
      this.spawned++;
      this.alive++;
      made++;
      this.spawnTimer += this.interval();
    }
    // Упёрлись в потолок или в лимит за шаг: не копим «долг» по таймеру, иначе после гибели врагов хлынет залп.
    if (this.spawnTimer < 0) this.spawnTimer = 0;

    if (!this.crash && this.spawned >= total && this.alive === 0) {
      if (this.bus) this.bus.emit('wave:cleared', { wave: this.wave });
      // Волна босса: после зачистки вместо передышки выходит босс.
      const W = this.cfg.waves;
      const B = W.boss && W.boss.wave === this.wave ? W.boss : W.finalBoss && W.finalBoss.wave === this.wave ? W.finalBoss : null;
      if (B && this.cfg.enemies[B.enemy]) {
        this.spawnBoss(this.cfg.enemies[B.enemy]);
        return;
      }
      // Последняя волна забега зачищена: забег пройден, новые враги не выходят.
      const total = this.cfg.waves.total;
      if (total > 0 && this.wave >= total) {
        this.phase = 'complete';
        if (this.bus) this.bus.emit('run:completed', { wave: this.wave });
        return;
      }
      this.wave++;
      this.phase = 'intermission';
      this.timer = this.cfg.waves.intermission;
    }
  }

  /**
   * Босс появляется на def.spawnDistance от героя (в первом подходящем направлении внутри арены),
   * не в скале. Событие 'boss:spawned' { enemy } запускает вступление (камера и надпись).
   */
  spawnBoss(def) {
    const e = this.enemies.spawn();
    initEnemy(e, def, 0, 0);
    e.hp = e.maxHp = def.hp; // здоровье босса не растёт от номера волны
    const cx = this.hero ? this.hero.x : this.camera.x;
    const cy = this.hero ? this.hero.y : this.camera.y;
    const dist = def.spawnDistance || 280;
    const a0 = this.rnd() * TAU;
    let placed = false;
    for (let i = 0; i < 16 && !placed; i++) {
      const a = a0 + (i / 16) * TAU;
      e.x = cx + Math.cos(a) * dist;
      e.y = cy + Math.sin(a) * dist;
      this.arena.resolveCircle(e);
      // Подходит, если после выталкивания из скал и стен босс всё ещё достаточно далеко от героя.
      placed = Math.hypot(e.x - cx, e.y - cy) > dist * 0.7;
    }
    if (!placed) { // тесная арена: ставим в центр
      e.x = 0;
      e.y = 0;
      this.arena.resolveCircle(e);
    }
    e.prevX = e.x;
    e.prevY = e.y;
    this.phase = 'boss';
    this.alive = this.countAlive();
    if (this.bus) this.bus.emit('boss:spawned', { enemy: e });
  }

  /**
   * Здоровье врага на текущей волне: с каждой волны +perWave, на каждой jumpEvery-й волне скачок
   * на jumpPct от накопленного. Считается шаг за шагом (скачок берёт долю уже набранного здоровья).
   */
  hpFor(base) {
    const c = this.cfg.waves.hp;
    if (!c) return base;
    let h = base;
    for (let w = 2; w <= this.wave; w++) {
      h += c.perWave;
      if (c.jumpEvery > 0 && w % c.jumpEvery === 0) h *= 1 + c.jumpPct;
    }
    return h;
  }

  /** Тип скелета по весам (ключ из enemies) или null, если весов нет. Без выделений памяти. */
  pickSkeleton(weights) {
    let sum = 0;
    for (const k in weights) if (this.cfg.enemies[k]) sum += weights[k];
    if (sum <= 0) return null;
    let x = this.rnd() * sum;
    let last = null;
    for (const k in weights) {
      if (!this.cfg.enemies[k]) continue;
      last = k;
      x -= weights[k];
      if (x < 0) return k;
    }
    return last;
  }

  spawnOne() {
    if (!pickSpawnPoint(this.rnd, this.camera, this.arena, this.cfg.spawn.margin, this.pt)) return false;
    const e = this.enemies.spawn();
    const sp = this.cfg.spawn;
    // Смесь врагов: быки и стрелки с своих волн, остальное жуки. Доли в config.spawn.
    const bullShare = this.wave >= sp.bullFromWave ? sp.bullShare : 0;
    const shooterShare = this.wave >= sp.shooterFromWave ? sp.shooterShare : 0;
    const r = this.rnd();
    let kind = r < bullShare ? 'bull' : r < bullShare + shooterShare ? 'shooter' : sp.enemy;
    const sk = sp.skeleton;
    if (sk && this.wave >= sk.fromWave && this.rnd() < sk.share) kind = this.pickSkeleton(sk.weights) || kind; // скелеты временами
    initEnemy(e, this.cfg.enemies[kind], this.pt.x, this.pt.y);
    e.hp = e.maxHp = this.hpFor(this.cfg.enemies[kind].hp);
    this.arena.resolveCircle(e); // не внутри скалы
    e.prevX = e.x;
    e.prevY = e.y;
    return true;
  }
}
