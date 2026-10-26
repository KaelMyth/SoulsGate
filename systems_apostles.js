// Апостолы Апофеоза: первая атака финального босса «Призыв апостолов».
//
// Босс замирает, по четырём углам острова (arena.zone) показываются круги, и из них выходят четыре высоких создания
// (enemies.apostle*). Пока апостолы живы, они применяют умения ПООЧЕРЕДИ: каждые turnInterval секунд ходит следующий
// живой по порядку (порядок: вера, правда, сила, любовь). Мёртвого пропускаем сразу, без ожидания.
// Когда перебиты все, событие 'apostles:defeated' (дальше босс применяет следующее умение и снова зовёт их через requestSummon).
// Умер босс: апостолы исчезают.
//
//   Вера:   лечит всех остальных апостолов на faith.heal (50%) их максимального здоровья. Босса не лечит.
//   Правда: над головой 5 золотых клинков; каждый целится в героя в момент своего вылета и летит почти мгновенно,
//           как у Тартаса (telegraphDelay, launchInterval, overshoot). Клинки парируются.
//   Сила:   слабо притягивает героя к себе (pullSpeed меньше скорости героя; рывок героя не притягивается).
//           Если притянул (герой ближе explodeDist): взрыв и урон (парируется), притяжение кончается.
//   Любовь: «благословение»: на love.time секунд эффекты остальных апостолов сильнее на love.boost (20%) от базы:
//           лечение, число и урон клинков, скорость притяжения и урон взрыва. Умерла Любовь: усиление пропадает.
//
// ВТОРАЯ ФАЗА, «Призыв негативных апостолов» (requestSummon(delay, true), режим this.neg): те же четыре апостола, но умения усилены
//   в negative.power раз (урон, число клинков, скорость, взрыв), у апостолов больше здоровья (negative.hpMult), а два умения другие:
//   Вера:  вместо исцеления: rain.count клинков с неба в то место, где был герой rain.trailDelay секунд назад. Клинки падают
//          друг за другом через rain.interval, перед ударом rain.fall секунд виден красный круг. Урон парируется.
//   Сила:  вместо притяжения ОТТАЛКИВАЕТ героя от себя (push.speed). Если герой прижат к краю платформы (тяга почти не двигает его
//          push.pinTime секунд подряд), взрыв прямо на нём. Рывок героя вырывается из отталкивания.
//   Правда и Любовь те же, но сильнее.
//   Убитый негативный апостол не исчезает: он остаётся «выключенным» (this.husks, лежит тёмной оболочкой).
//
// ВТОРАЯ ФАЗА, умение 2 «Восстание» (startRise, зовёт оркестр босса): выключенные апостолы встают (rise.wait лежат, rise.standTime
//   поднимаются) и превращаются в быстрых бегунов (enemies.apostleRisen): мало здоровья, бегут на героя, бьют касанием.
//   Умение кончается, когда все они убиты: событие 'apostles:risen-defeated'.
//
// Графику рисует renderer: ЗАГЛУШКИ (круги телеграфов, линии, кольца).
// События: 'apostle:summon' { x, y }, 'apostle:cast' { enemy, kind }, 'apostle:heal' { enemy },
//          'apostle:explode' { x, y, hit }, 'apostle:blade-fly' { blade }, 'apostle:rain' { x, y } (клинок с неба нацелен),
//          'apostle:rain-hit' { x, y, hit }, 'apostle:rise' { x, y } (начал вставать), 'apostle:risen' { x, y } (побежал).
import { initEnemy } from './world_enemy.js';
import { segDist } from './systems_boss.js';

const MAX_BLADES = 12; // с запасом на усиление

export class Apostles {
  /** o: { config, hero, arena, enemies (EntityPool), combat, defense, bus, rnd } */
  constructor(o) {
    this.cfg = o.config;
    this.hero = o.hero;
    this.arena = o.arena;
    this.enemies = o.enemies;
    this.combat = o.combat;
    this.defense = o.defense || null;
    this.bus = o.bus;
    this.rnd = o.rnd || Math.random;
    this.boss = null;
    this.state = 'off';   // off | idle | summon | active
    this.t = 0;
    this.cd = 0;          // ожидание до призыва
    this.corners = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }];
    this.turnT = 0;       // до следующего хода
    this.next = 0;        // индекс в order: чей ход следующий
    this.cast = null;     // идущий замах умения { e, kind, t }
    this.loveT = 0;       // сколько ещё секунд действует усиление Любви
    this.pull = null;     // притяжение Силы { e, t } пока идёт
    this.pullSrc = { x: 0, y: 0, active: true, parryable: true, enemy: null }; // источник взрыва для блока и парирования
    this.blades = [];
    for (let i = 0; i < MAX_BLADES; i++) {
      this.blades.push({
        x: 0, y: 0, x1: 0, y1: 0, x2: 0, y2: 0, dx: 1, dy: 0, len: 1, hw: 7, travel: 0, launchAt: 0,
        state: 0, aimed: false, active: false, hit: false, parryable: true, enemy: null, gold: true,
      });
    }
    this.neg = false;     // вторая фаза: негативные апостолы
    this.husks = [];      // выключенные апостолы: { x, y, def, kind, k } k: 0 лежит .. 1 стоит (для отрисовки)
    this.rise = { state: 'off', t: 0 }; // 'off' | 'wait' | 'stand' | 'run'
    this.rain = [];       // клинки с неба Веры (негатив): { x, y, state 0 ждёт | 1 круг | 2 удар | 3 нет, t, launchAt, src }
    this.rainCount = 0;
    this.rainT = 0;
    this.trail = [];      // последние положения героя по кадрам (для клинков с неба «туда, где он был»)
    this.lastDt = 1 / 60;
    this.bladeCount = 0;  // сколько клинков в идущей серии
    this.bladeNext = 0;
    this.bladeT = 0;
    this.bus.on('boss:spawned', ({ enemy }) => this.attach(enemy));
    this.bus.on('enemy:killed', ({ enemy }) => this.onKilled(enemy));
  }

  get A() { return this.boss ? this.boss.def.apostles : null; }

  get N() { return this.boss ? this.boss.def.apostles.negative : null; }

  attach(boss) {
    this.reset();
    if (!boss.def.apostles) return;
    this.boss = boss;
    this.state = 'idle';
    this.cd = boss.def.apostles.firstDelay;
  }

  reset() {
    this.boss = null;
    this.state = 'off';
    this.cast = null;
    this.pull = null;
    this.loveT = 0;
    this.neg = false;
    this.husks.length = 0;
    this.rise.state = 'off';
    this.rainCount = 0;
    this.rain.length = 0;
    this.trail.length = 0;
    this.bladeCount = 0;
    for (let i = 0; i < this.blades.length; i++) { this.blades[i].state = 0; this.blades[i].active = false; }
  }

  onKilled(e) {
    if (e === this.boss) { // босс убит: апостолы не нужны
      this.dismiss();
      this.reset();
      return;
    }
    if (e.def && e.def.apostle) {
      if (this.cast && this.cast.e === e) this.cast = null;
      if (this.pull && this.pull.e === e) this.pull = null;
      if (e.def.apostle === 'love') this.loveT = 0; // без Любви усиления нет
      if (this.neg) this.husks.push({ x: e.x, y: e.y, def: e.def, kind: e.def.apostle, k: 0 }); // выключился, но остался лежать
    }
  }

  dismiss() {
    const it = this.enemies.items;
    for (let i = 0; i < it.length; i++) if (it[i].def && (it[i].def.apostle || it[i].def.risen)) it[i].active = false;
  }

  alive() {
    const it = this.enemies.items;
    let n = 0;
    for (let i = 0; i < it.length; i++) if (it[i].active && it[i].def && it[i].def.apostle) n++;
    return n;
  }

  /** Живой апостол по виду умения ('faith' | 'truth' | 'force' | 'love') или null. */
  find(kind) {
    const it = this.enemies.items;
    for (let i = 0; i < it.length; i++) if (it[i].active && it[i].def && it[i].def.apostle === kind) return it[i];
    return null;
  }

  /** Множитель усиления Любви: 1 или 1 + love.boost. */
  boost() {
    return (this.loveT > 0 ? 1 + this.A.love.boost : 1) * (this.neg ? this.N.power : 1);
  }

  /** Усиление только Любви (без множителя негатива). */
  loveMult() {
    return this.loveT > 0 ? 1 + this.A.love.boost : 1;
  }

  update(dt) {
    const boss = this.boss;
    this.updateBlades(dt); // клинки летят и после смерти Правды
    this.updateRain(dt);
    this.recordTrail(dt);
    if (!boss) return;
    if (!boss.active) { this.dismiss(); this.reset(); return; }
    const A = boss.def.apostles;
    if (this.loveT > 0) this.loveT -= dt;
    this.updateRise(dt);
    this.t += dt;
    switch (this.state) {
      case 'idle':
        this.cd -= dt;
        if (this.cd <= 0 && this.alive() === 0 && this.arena.zone) this.startSummon(A);
        break;
      case 'summon':
        if (this.t >= A.castTime) this.finishSummon(A);
        break;
      case 'active':
        if (this.alive() === 0) { // апостолы перебиты: босс переходит к следующему умению (systems_apotheosis.js)
          this.state = 'idle';
          this.cd = Infinity; // новый призыв только по requestSummon()
          this.cast = null;
          this.pull = null;
          this.loveT = 0;
          this.bus.emit('apostles:defeated', {});
        } else {
          this.updateTurns(dt, A);
        }
        break;
      default: break;
    }
    this.updatePull(dt, A);
  }

  /** Призвать апостолов снова через delay секунд (по умолчанию resummonDelay). Зовёт оркестр босса. */
  requestSummon(delay, negative) {
    if (!this.boss) return;
    this.neg = !!negative;
    this.state = 'idle';
    this.cd = delay !== undefined ? delay : this.A.resummonDelay;
  }

  /** Занят ли апостол этого вида своим предыдущим умением (серия клинков или притяжение ещё идут). */
  busy(kind) {
    if (kind === 'truth') return this.bladeCount > 0;
    if (kind === 'faith') return this.rainCount > 0; // клинки с неба ещё падают
    if (kind === 'force') return !!this.pull;
    return false;
  }

  // ---------- Призыв ----------

  startSummon(A) {
    const z = this.arena.zone;
    const k = A.cornerInset;
    this.corners[0].x = z.left + k; this.corners[0].y = z.top + k;
    this.corners[1].x = z.right - k; this.corners[1].y = z.top + k;
    this.corners[2].x = z.right - k; this.corners[2].y = z.bottom - k;
    this.corners[3].x = z.left + k; this.corners[3].y = z.bottom - k;
    this.state = 'summon';
    this.t = 0;
    this.bus.emit('apostle:summon', { x: this.boss.x, y: this.boss.y });
  }

  finishSummon(A) {
    const kinds = A.order;
    for (let i = 0; i < 4; i++) {
      const def = this.cfg.enemies[A.defs[kinds[i]]];
      if (!def) continue;
      const e = this.enemies.spawn();
      initEnemy(e, def, this.corners[i].x, this.corners[i].y);
      if (this.neg) e.hp = e.maxHp = def.hp * this.N.hpMult;
      this.arena.resolveCircle(e); // остров ломаный: угол мог оказаться за кромкой
      e.prevX = e.x;
      e.prevY = e.y;
      this.bus.emit('apostle:summon', { x: e.x, y: e.y });
    }
    this.state = 'active';
    this.t = 0;
    this.next = 0;
    this.turnT = A.firstTurnDelay;
    this.loveT = 0;
  }

  // ---------- Очерёдность умений ----------

  updateTurns(dt, A) {
    if (this.cast) {
      this.cast.t += dt;
      if (this.cast.t >= A.spellCast) {
        const c = this.cast;
        this.cast = null;
        if (c.e.active) this.resolve(c.kind, c.e, A);
      }
    }
    this.turnT -= dt;
    if (this.turnT > 0 || this.cast) return;
    // Следующий живой по порядку: мёртвого пропускаем сразу.
    for (let k = 0; k < A.order.length; k++) {
      const kind = A.order[this.next % A.order.length];
      this.next++;
      const e = this.find(kind);
      if (!e || this.busy(kind)) continue; // мёртвого и занятого (ещё идёт прошлое умение) пропускаем
      this.cast = { e, kind, t: 0 };
      this.turnT = A.turnInterval;
      this.bus.emit('apostle:cast', { enemy: e, kind });
      return;
    }
  }

  resolve(kind, e, A) {
    const m = this.boost();
    if (kind === 'faith') (this.neg ? this.castRain(e, A, m) : this.castFaith(e, A, m));
    else if (kind === 'truth') this.castTruth(e, A, m);
    else if (kind === 'force') this.castForce(e, A, m);
    else if (kind === 'love') this.castLove(A);
  }

  castFaith(e, A, m) {
    const it = this.enemies.items;
    const frac = A.faith.heal * m;
    for (let i = 0; i < it.length; i++) {
      const o = it[i];
      if (!o.active || o === e || !o.def || !o.def.apostle) continue; // босс и сама Вера не лечатся
      o.hp = Math.min(o.maxHp, o.hp + o.maxHp * frac);
      this.bus.emit('apostle:heal', { enemy: o });
    }
  }

  castLove(A) {
    this.loveT = A.love.time;
  }

  // ---------- Восстание: выключенные апостолы встают и бегут ----------

  /** Отладка: если выключенных нет, положить по одному в углах платформы. */
  makeHusks() {
    const z = this.arena.zone;
    if (!z || !this.boss) return;
    const A = this.A;
    const k = A.cornerInset;
    const pts = [[z.left + k, z.top + k], [z.right - k, z.top + k], [z.right - k, z.bottom - k], [z.left + k, z.bottom - k]];
    this.husks.length = 0;
    for (let i = 0; i < 4; i++) {
      const c = { x: pts[i][0], y: pts[i][1], radius: 16 };
      this.arena.resolveCircle(c);
      this.husks.push({ x: c.x, y: c.y, def: this.cfg.enemies[A.defs[A.order[i]]], kind: A.order[i], k: 0 });
    }
  }

  startRise() {
    if (!this.boss) return;
    if (!this.husks.length) this.makeHusks();
    this.rise.state = 'wait';
    this.rise.t = 0;
  }

  /** Бегуны ещё живы? */
  risenAlive() {
    const it = this.enemies.items;
    let n = 0;
    for (let i = 0; i < it.length; i++) if (it[i].active && it[i].def && it[i].def.risen) n++;
    return n;
  }

  updateRise(dt) {
    const R = this.rise;
    if (R.state === 'off') return;
    const RC = this.N.rise;
    R.t += dt;
    if (R.state === 'wait') {
      if (R.t >= RC.wait) {
        R.state = 'stand';
        R.t = 0;
        for (let i = 0; i < this.husks.length; i++) this.bus.emit('apostle:rise', { x: this.husks[i].x, y: this.husks[i].y });
      }
    } else if (R.state === 'stand') {
      const k = Math.min(1, R.t / Math.max(0.01, RC.standTime));
      for (let i = 0; i < this.husks.length; i++) this.husks[i].k = k;
      if (R.t >= RC.standTime) {
        const def = this.cfg.enemies[RC.def];
        for (let i = 0; i < this.husks.length; i++) {
          const h = this.husks[i];
          const e = this.enemies.spawn();
          initEnemy(e, def, h.x, h.y);
          this.arena.resolveCircle(e);
          e.prevX = e.x;
          e.prevY = e.y;
          this.bus.emit('apostle:risen', { x: e.x, y: e.y });
        }
        this.husks.length = 0;
        R.state = 'run';
        R.t = 0;
      }
    } else if (R.state === 'run' && this.risenAlive() === 0) {
      R.state = 'off';
      this.bus.emit('apostles:risen-defeated', {});
    }
  }

  // ---------- Негатив: Сила отталкивает ----------

  updatePush(p, dt, A) {
    const e = p.e;
    const hero = this.hero;
    const F = A.force;
    const P = this.N.push;
    if (p.t >= F.pullTime) { this.pull = null; return; }
    if (hero.dashing) return; // рывок героя вырывается из отталкивания
    let dx = hero.x - e.x;
    let dy = hero.y - e.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-3) { dx = 0; dy = 1; } else { dx /= d; dy /= d; }
    const step = P.speed * p.m * dt;
    const x0 = hero.x;
    const y0 = hero.y;
    hero.x += dx * step;
    hero.y += dy * step;
    this.arena.resolveCircle(hero);
    const moved = Math.hypot(hero.x - x0, hero.y - y0);
    p.pinned = moved < step * P.pinRatio ? p.pinned + dt : Math.max(0, p.pinned - dt);
    if (p.pinned >= P.pinTime && this.hero.invuln <= 0) { // прижат к краю платформы: взрыв на герое (в неуязвимости ждёт)
      this.pullSrc.x = hero.x;
      this.pullSrc.y = hero.y;
      this.pullSrc.active = true;
      this.combat.damageHero(F.damage * p.m, this.pullSrc);
      this.bus.emit('apostle:explode', { x: hero.x, y: hero.y, hit: this.pullSrc.active });
      this.pull = null;
    }
  }

  // ---------- Негатив: Вера, клинки с неба ----------

  recordTrail(dt) {
    if (!this.neg || !this.hero.active) { if (this.trail.length) this.trail.length = 0; return; }
    this.lastDt = dt;
    this.trail.push(this.hero.x, this.hero.y);
    if (this.trail.length > 240) this.trail.splice(0, 2); // около 2 секунд истории
  }

  /** Где был герой delay секунд назад (по кадрам). */
  trailAt(delay) {
    const n = this.trail.length / 2;
    if (n === 0) return { x: this.hero.x, y: this.hero.y };
    const back = Math.min(n - 1, Math.max(0, Math.round(delay / Math.max(1e-4, this.lastDt))));
    const i = (n - 1 - back) * 2;
    return { x: this.trail[i], y: this.trail[i + 1] };
  }

  castRain(e, A, m) {
    const R = this.N.rain;
    const n = Math.round(R.count * this.loveMult());
    while (this.rain.length < n) this.rain.push({ x: 0, y: 0, state: 3, t: 0, launchAt: 0, src: { x: 0, y: 0, active: true, parryable: true, enemy: null } });
    for (let i = 0; i < n; i++) {
      const b = this.rain[i];
      b.state = 0;
      b.t = 0;
      b.launchAt = i * R.interval;
      b.dmg = R.damage * this.N.power;
    }
    this.rainCount = n;
    this.rainT = 0;
  }

  updateRain(dt) {
    const n = this.rainCount;
    if (n <= 0) return;
    const R = this.cfg.enemies.apotheosis.apostles.negative.rain;
    const hero = this.hero;
    this.rainT += dt;
    let live = 0;
    for (let i = 0; i < n; i++) {
      const b = this.rain[i];
      if (b.state === 3) continue;
      live++;
      if (b.state === 0) {
        if (this.rainT < b.launchAt) continue;
        const p = this.trailAt(R.trailDelay); // место, где герой был недавно
        b.x = p.x;
        b.y = p.y;
        b.state = 1;
        b.t = 0;
        this.bus.emit('apostle:rain', { x: b.x, y: b.y });
      } else if (b.state === 1) {
        b.t += dt;
        if (b.t >= R.fall) {
          b.state = 2;
          b.t = 0;
          let hit = false;
          if (hero.active) {
            const dx = hero.x - b.x;
            const dy = hero.y - b.y;
            if (dx * dx + dy * dy <= (R.radius + hero.radius * 0.5) * (R.radius + hero.radius * 0.5)) {
              b.src.x = b.x; b.src.y = b.y; b.src.active = true;
              this.combat.damageHero(b.dmg, b.src); // парируется (источник гаснет)
              hit = b.src.active;
            }
          }
          this.bus.emit('apostle:rain-hit', { x: b.x, y: b.y, hit });
        }
      } else if (b.state === 2) {
        b.t += dt;
        if (b.t >= R.hold) b.state = 3;
      }
    }
    if (live === 0) this.rainCount = 0;
  }

  // ---------- Сила: притяжение ----------

  castForce(e, A, m) {
    this.pull = { e, t: 0, m, push: this.neg, pinned: 0 };
  }

  updatePull(dt, A) {
    const p = this.pull;
    if (!p) return;
    const e = p.e;
    const hero = this.hero;
    if (!e.active || !hero.active) { this.pull = null; return; }
    const F = A.force;
    p.t += dt;
    if (p.push) { this.updatePush(p, dt, A); return; }
    const dx = e.x - hero.x;
    const dy = e.y - hero.y;
    const d = Math.hypot(dx, dy);
    if (d <= F.explodeDist + e.radius) { // притянул: взрыв
      this.pullSrc.x = e.x;
      this.pullSrc.y = e.y;
      this.pullSrc.active = true;
      const dmg = F.damage * p.m;
      this.combat.damageHero(dmg, this.pullSrc);
      this.bus.emit('apostle:explode', { x: e.x, y: e.y, hit: this.pullSrc.active });
      this.pull = null;
      return;
    }
    if (p.t >= F.pullTime) { this.pull = null; return; }
    if (hero.dashing) return; // рывок героя вырывается из притяжения
    const step = F.pullSpeed * p.m * dt;
    hero.x += (dx / d) * step;
    hero.y += (dy / d) * step;
    this.arena.resolveCircle(hero);
  }

  // ---------- Правда: золотые клинки ----------

  castTruth(e, A, m) {
    const T = A.truth;
    const n = Math.min(MAX_BLADES, Math.round(T.blades * m));
    const lift = e.radius * 2.4;
    for (let i = 0; i < n; i++) {
      const bl = this.blades[i];
      bl.x1 = bl.x = e.x + (i - (n - 1) / 2) * T.spread;
      bl.y1 = bl.y = e.y - lift;
      bl.hw = T.width / 2;
      bl.state = 1;
      bl.aimed = false;
      bl.active = true;
      bl.hit = false;
      bl.travel = 0;
      bl.damage = T.damage * m;
    }
    // порядок вылета случайный (перемешиваем индексы в буфере)
    const ord = this.order || (this.order = []);
    ord.length = n;
    for (let i = 0; i < n; i++) ord[i] = i;
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(this.rnd() * (i + 1));
      const t = ord[i]; ord[i] = ord[j]; ord[j] = t;
    }
    this.bladeCount = n;
    this.bladeNext = 0;
    this.bladeT = 0;
    const first = this.blades[ord[0]];
    this.aimBlade(first, T);
    first.launchAt = T.telegraphDelay;
  }

  aimBlade(bl, T) {
    let dx = this.hero.x - bl.x1;
    let dy = this.hero.y - bl.y1;
    let d = Math.hypot(dx, dy);
    if (d < 1e-3) { dx = 0; dy = 1; d = 0; } else { dx /= d; dy /= d; }
    bl.dx = dx;
    bl.dy = dy;
    bl.len = Math.max(1, d + T.overshoot);
    bl.x2 = bl.x1 + dx * bl.len;
    bl.y2 = bl.y1 + dy * bl.len;
    bl.aimed = true;
  }

  updateBlades(dt) {
    const n = this.bladeCount;
    if (n <= 0) return;
    const T = this.cfg.enemies.apotheosis.apostles.truth;
    const hero = this.hero;
    this.bladeT += dt;
    const ord = this.order;
    while (this.bladeNext < n) {
      const nb = this.blades[ord[this.bladeNext]];
      if (this.bladeT < nb.launchAt) break;
      nb.state = 2;
      this.bus.emit('apostle:blade-fly', { blade: nb });
      this.bladeNext++;
      if (this.bladeNext < n) {
        const nx = this.blades[ord[this.bladeNext]];
        this.aimBlade(nx, T); // прицел по месту героя в момент этого вылета
        nx.launchAt = nb.launchAt + T.launchInterval;
      }
    }
    let live = 0;
    for (let i = 0; i < n; i++) {
      const bl = this.blades[i];
      if (bl.state === 3 || bl.state === 0) continue;
      if (bl.state === 1) { live++; continue; }
      if (!bl.active) { bl.state = 3; continue; } // парированный клинок гаснет
      const speed = bl.len / Math.max(0.01, T.time);
      const step = Math.min(speed * dt, bl.len - bl.travel);
      const px = bl.x;
      const py = bl.y;
      bl.x += bl.dx * step;
      bl.y += bl.dy * step;
      bl.travel += step;
      if (!bl.hit && hero.active && segDist(hero.x, hero.y, px, py, bl.x, bl.y) <= bl.hw + this.reach()) {
        bl.hit = true;
        this.combat.damageHero(bl.damage, bl);
      }
      if (!bl.active || bl.travel >= bl.len - 1e-6) { bl.state = 3; bl.active = false; } else live++;
    }
    if (live === 0) this.bladeCount = 0;
  }

  reach() {
    const h = this.hero;
    return this.defense && this.defense.blocking ? Math.max(h.radius, this.defense.blockRadius) : h.radius;
  }
}
