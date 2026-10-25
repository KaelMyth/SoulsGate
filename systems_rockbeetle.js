// Горные жуки: скалы «просыпаются» и становятся врагами; их единственная атака выпускает мошек.
//
// Пробуждение (config.waves.rockWake): в начале указанной волны несколько скал исчезают, и на месте каждой
// просыпается Горный жук (enemies.rockBeetle). Скала не возвращается до нового забега. Размер и здоровье жука
// зависят от размера скалы.
//
// Атака (def.slam): жук подходит на slam.range, замирает (замах: на земле кольцо), бьёт в землю, и из него вылетают
// мошки. Состояния лежат в e.atk: wake → idle → windup → recovery → idle.
//
// Мошки (свой пул, не снаряды обычных врагов): летят не по прямой. Сначала разлетаются от жука, потом кружат
// вокруг героя на сужающемся кольце, каждая на своём месте по кругу (так они пытаются его окружить), потом
// бросаются на героя. Мошку можно:
//   - спарировать и задоджить блоком (источник удара parryable, как у снарядов стрелков);
//   - сбить снарядами героя (одно попадание, снаряд с pierce летит дальше).
// Графика мошек: ЗАГЛУШКА ГРАФИКИ (маленькие кружки, рисует renderer).
//
// События: 'rock:woke' { x, y, r, enemy }, 'rockbeetle:windup' { enemy }, 'rockbeetle:slam' { enemy },
//          'midge:died' { x, y, how: 'hit' | 'shot' | 'parry' | 'life' }.
import { EntityPool } from './core_entity-pool.js';
import { initEnemy } from './world_enemy.js';

const TAU = Math.PI * 2;

export function createMidge() {
  return {
    active: false,
    x: 0, y: 0, prevX: 0, prevY: 0,
    vx: 0, vy: 0,
    radius: 5, damage: 8,
    parryable: true, enemy: null, // поля источника удара: блок и парирование читают их же
    travelled: 0,
    age: 0,
    slot: 0,    // угол «места» вокруг героя
    dir: 1,     // в какую сторону кружит
    phase: 0,   // фаза дрожания
    outX: 1, outY: 0, // куда разлетается в начале
    orbitEnd: 0,      // когда (по возрасту) кончает кружить и бросается
    def: null,
  };
}

export function resetMidge(m) {
  m.active = false;
  m.def = null;
}

export class RockBeetles {
  /** o: { config, hero, arena, nav, enemies (EntityPool), combat, defense, bus, rnd } */
  constructor(o) {
    this.cfg = o.config;
    this.hero = o.hero;
    this.arena = o.arena;
    this.nav = o.nav || null;
    this.enemies = o.enemies;
    this.combat = o.combat;
    this.defense = o.defense || null;
    this.bus = o.bus;
    this.rnd = o.rnd || Math.random;
    this.midges = new EntityPool(createMidge, resetMidge, 0);
    this.cand = []; // буфер выбора скал
    this.bus.on('wave:started', ({ wave }) => this.wake(wave));
  }

  /** Новый забег: мошки исчезают, скалы возвращаются. */
  reset() {
    this.midges.clear();
    this.arena.restoreRocks();
    if (this.nav) this.nav.buildBlocked();
  }

  // ---------- Пробуждение ----------

  wake(wave) {
    const table = this.cfg.waves.rockWake;
    const def = this.cfg.enemies.rockBeetle;
    if (!table || !def) return;
    for (let k = 0; k < table.length; k++) {
      const W = table[k];
      if (W.wave !== wave) continue;
      const rocks = this.arena.rocks;
      const minD = this.cfg.waves.rockWakeMinHeroDist || 0;
      const cand = this.cand;
      cand.length = 0;
      for (let i = 0; i < rocks.length; i++) {
        if (Math.hypot(rocks[i].x - this.hero.x, rocks[i].y - this.hero.y) >= minD + rocks[i].r) cand.push(rocks[i]);
      }
      if (W.pick === 'smallest') cand.sort((a, b) => a.r - b.r);
      else for (let i = cand.length - 1; i > 0; i--) { // перемешать (Фишер-Йейтс)
        const j = Math.floor(this.rnd() * (i + 1));
        const t = cand[i]; cand[i] = cand[j]; cand[j] = t;
      }
      const n = Math.min(W.count, cand.length);
      for (let i = 0; i < n; i++) this.wakeRock(cand[i], def);
      cand.length = 0;
      if (n > 0 && this.nav) this.nav.buildBlocked(); // скал стало меньше: враги ходят напрямик
    }
  }

  wakeRock(rock, def) {
    this.arena.removeRock(rock);
    const e = this.enemies.spawn();
    initEnemy(e, def, rock.x, rock.y);
    const r = Math.min(def.maxRadius, Math.max(def.minRadius, rock.r * def.radiusScale));
    e.radius = r;
    e.hp = e.maxHp = def.hp * (rock.r / def.hpRockRef);
    e.prevX = e.x;
    e.prevY = e.y;
    e.atk.state = 'wake';
    e.atk.t = 0;
    e.atk.cd = def.slam.firstDelay;
    this.bus.emit('rock:woke', { x: rock.x, y: rock.y, r: rock.r, enemy: e });
  }

  // ---------- Атака жука ----------

  update(dt, list) {
    const hero = this.hero;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.active || !e.def.slam || e.freezeT > 0) continue;
      const S = e.def.slam;
      const a = e.atk;
      switch (a.state) {
        case 'wake':
          a.t += dt;
          if (a.t >= e.def.wakeTime) { a.state = 'idle'; a.t = 0; }
          break;
        case 'idle':
          if (a.cd > 0) a.cd -= dt;
          if (a.cd <= 0 && hero.active && Math.hypot(hero.x - e.x, hero.y - e.y) <= S.range) {
            a.state = 'windup';
            a.t = 0;
            this.bus.emit('rockbeetle:windup', { enemy: e });
          }
          break;
        case 'windup':
          a.t += dt;
          if (a.t >= S.windup) {
            this.slam(e, S);
            a.state = 'recovery';
            a.t = 0;
          }
          break;
        case 'recovery':
          a.t += dt;
          if (a.t >= S.recovery) { a.state = 'idle'; a.t = 0; a.cd = S.cooldown; }
          break;
        default: break;
      }
    }
    this.updateMidges(dt);
  }

  slam(e, S) {
    const M = S.midge;
    const max = this.cfg.limits.maxMidges;
    const n = S.midges;
    const a0 = this.rnd() * TAU;
    const slot0 = Math.atan2(e.y - this.hero.y, e.x - this.hero.x); // места по кругу делим от стороны жука
    for (let i = 0; i < n; i++) {
      if (this.midges.count >= max) break;
      const m = this.midges.spawn();
      const a = a0 + (i / n) * TAU + (this.rnd() - 0.5) * 0.4;
      m.x = m.prevX = e.x;
      m.y = m.prevY = e.y;
      m.outX = Math.cos(a);
      m.outY = Math.sin(a);
      m.vx = m.outX * M.speed * 0.6;
      m.vy = m.outY * M.speed * 0.6;
      m.radius = M.radius;
      m.damage = M.damage;
      m.parryable = !!M.parryable;
      m.enemy = null;
      m.def = M;
      m.travelled = 0;
      m.age = 0;
      m.slot = slot0 + (i / n) * TAU; // равномерно по кругу: вместе замыкают кольцо
      m.dir = this.rnd() < 0.5 ? -1 : 1;
      m.phase = this.rnd() * TAU;
      m.orbitEnd = M.scatterTime + M.orbitTime + (this.rnd() - 0.5) * 2 * M.orbitJitter;
    }
    this.bus.emit('rockbeetle:slam', { enemy: e });
  }

  // ---------- Мошки ----------

  updateMidges(dt) {
    const list = this.midges.items;
    const hero = this.hero;
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (!m.active) continue;
      const M = m.def;
      m.prevX = m.x;
      m.prevY = m.y;
      m.age += dt;
      if (m.age >= M.life) { this.kill(m, 'life'); continue; }
      let dx;
      let dy;
      let sp = M.speed;
      if (m.age < M.scatterTime) {
        dx = m.outX;
        dy = m.outY;
        sp *= 0.8;
      } else if (m.age < m.orbitEnd) {
        // Место на кольце вокруг героя: кольцо сужается, место едет по кругу, у каждой мошки своя сторона и дрожание.
        const k = Math.min(1, (m.age - M.scatterTime) / Math.max(0.01, m.orbitEnd - M.scatterTime));
        const R = M.orbitRadius + (M.orbitRadiusEnd - M.orbitRadius) * k + Math.sin(m.age * M.wobbleFreq + m.phase) * M.wobble;
        const ang = m.slot + m.dir * M.angularSpeed * (m.age - M.scatterTime);
        const tx = hero.x + Math.cos(ang) * R;
        const ty = hero.y + Math.sin(ang) * R;
        dx = tx - m.x;
        dy = ty - m.y;
        // Не лететь сквозь героя к месту на другой стороне кольца: у героя обходят по касательной (иначе не окружат, а ударят в лоб).
        const hx0 = m.x - hero.x;
        const hy0 = m.y - hero.y;
        const dh = Math.hypot(hx0, hy0) || 1;
        if (dh < R * 0.8) {
          const ox = hx0 / dh;
          const oy = hy0 / dh;
          dx = ox * 0.6 - oy * m.dir * 0.8;
          dy = oy * 0.6 + ox * m.dir * 0.8;
        }
      } else {
        dx = hero.x - m.x;
        dy = hero.y - m.y;
        sp *= M.diveSpeedMul;
      }
      const d = Math.hypot(dx, dy) || 1;
      const kk = 1 - Math.exp(-dt / Math.max(0.01, M.turnTime)); // инерция: траектория дугой, а не ломаной
      m.vx += ((dx / d) * sp - m.vx) * kk;
      m.vy += ((dy / d) * sp - m.vy) * kk;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.travelled += Math.hypot(m.vx, m.vy) * dt;
      const A = this.arena;
      if (m.x < A.left) m.x = A.left; else if (m.x > A.right) m.x = A.right;
      if (m.y < A.top) m.y = A.top; else if (m.y > A.bottom) m.y = A.bottom;

      // Попала в героя (или встретила блок): урон проходит через Combat, значит блок и парирование работают как обычно.
      if (!hero.active) continue;
      const hx = m.x - hero.x;
      const hy = m.y - hero.y;
      let reach = hero.radius + m.radius;
      if (this.defense && this.defense.blocking) reach = Math.max(reach, this.defense.blockRadius + m.radius); // сфера блока
      if (hx * hx + hy * hy <= reach * reach) {
        this.combat.damageHero(m.damage, m);
        this.kill(m, m.active ? 'hit' : 'parry'); // парирование гасит источник (active = false)
      }
    }
  }

  kill(m, how) {
    const was = m.active;
    m.active = false;
    if (was || how === 'parry') this.bus.emit('midge:died', { x: m.x, y: m.y, how });
  }

  /**
   * Снаряды героя сбивают мошек: одно попадание. Снаряд тратится (кроме пробивающего: у него убывает pierce).
   * Звать после движения снарядов.
   */
  hitByShots(shots) {
    const list = this.midges.items;
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (!m.active) continue;
      for (let k = 0; k < shots.length; k++) {
        const p = shots[k];
        if (!p.active) continue;
        const dx = p.x - m.x;
        const dy = p.y - m.y;
        const r = p.radius + m.radius;
        if (dx * dx + dy * dy > r * r) continue;
        if (p.pierce > 0) p.pierce--;
        else p.active = false;
        this.kill(m, 'shot');
        break;
      }
    }
  }

  sweep() {
    this.midges.sweep();
  }
}
