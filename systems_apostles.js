// Апостолы Апофеоза: первая атака финального босса «Призыв апостолов».
//
// Босс замирает, по четырём углам острова (arena.zone) показываются круги, и из них выходят четыре высоких создания
// (enemies.apostle*). Пока апостолы живы, они применяют умения ПООЧЕРЕДИ: каждые turnInterval секунд ходит следующий
// живой по порядку (порядок: вера, правда, сила, любовь). Мёртвого пропускаем сразу, без ожидания.
// Когда перебиты все, через resummonDelay босс призывает новых. Умер босс: апостолы исчезают.
//
//   Вера:   лечит всех остальных апостолов на faith.heal (50%) их максимального здоровья. Босса не лечит.
//   Правда: над головой 5 золотых клинков; каждый целится в героя в момент своего вылета и летит почти мгновенно,
//           как у Тартаса (telegraphDelay, launchInterval, overshoot). Клинки парируются.
//   Сила:   слабо притягивает героя к себе (pullSpeed меньше скорости героя; рывок героя не притягивается).
//           Если притянул (герой ближе explodeDist): взрыв и урон (парируется), притяжение кончается.
//   Любовь: «благословение»: на love.time секунд эффекты остальных апостолов сильнее на love.boost (20%) от базы:
//           лечение, число и урон клинков, скорость притяжения и урон взрыва. Умерла Любовь: усиление пропадает.
//
// Графику рисует renderer: ЗАГЛУШКИ (круги телеграфов, линии, кольца).
// События: 'apostle:summon' { x, y }, 'apostle:cast' { enemy, kind }, 'apostle:heal' { enemy },
//          'apostle:explode' { x, y, hit }, 'apostle:blade-fly' { blade }.
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
    this.bladeCount = 0;  // сколько клинков в идущей серии
    this.bladeNext = 0;
    this.bladeT = 0;
    this.bus.on('boss:spawned', ({ enemy }) => this.attach(enemy));
    this.bus.on('enemy:killed', ({ enemy }) => this.onKilled(enemy));
  }

  get A() { return this.boss ? this.boss.def.apostles : null; }

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
    }
  }

  dismiss() {
    const it = this.enemies.items;
    for (let i = 0; i < it.length; i++) if (it[i].def && it[i].def.apostle) it[i].active = false;
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
    return this.loveT > 0 ? 1 + this.A.love.boost : 1;
  }

  update(dt) {
    const boss = this.boss;
    this.updateBlades(dt); // клинки летят и после смерти Правды
    if (!boss) return;
    if (!boss.active) { this.dismiss(); this.reset(); return; }
    const A = boss.def.apostles;
    if (this.loveT > 0) this.loveT -= dt;
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
        if (this.alive() === 0) {
          this.state = 'idle';
          this.cd = A.resummonDelay;
          this.cast = null;
          this.pull = null;
          this.loveT = 0;
        } else {
          this.updateTurns(dt, A);
        }
        break;
      default: break;
    }
    this.updatePull(dt, A);
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
      if (!e) continue;
      this.cast = { e, kind, t: 0 };
      this.turnT = A.turnInterval;
      this.bus.emit('apostle:cast', { enemy: e, kind });
      return;
    }
  }

  resolve(kind, e, A) {
    const m = this.boost();
    if (kind === 'faith') this.castFaith(e, A, m);
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

  // ---------- Сила: притяжение ----------

  castForce(e, A, m) {
    this.pull = { e, t: 0, m };
  }

  updatePull(dt, A) {
    const p = this.pull;
    if (!p) return;
    const e = p.e;
    const hero = this.hero;
    if (!e.active || !hero.active) { this.pull = null; return; }
    const F = A.force;
    p.t += dt;
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
