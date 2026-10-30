// Мини-босс Пепельный Арх: три микрофазы по здоровью. Числа в config.enemies.ashenArch.arch.
//
//   Фаза 1 (здоровье выше phases[0]): стрелок. Держит дистанцию (keepDistance), замирает и светится (aim, это сигнал для
//     парирования), потом выпускает volley.count серых шариков подряд, каждый в героя на момент выстрела.
//   Фаза 2: чуть краснеет, идёт к герою и делает серию рывков подряд, как бык: линия на земле (windup, её рисует renderer
//     через getTelegraph) → почти мгновенный рывок → короткая передышка → следующий рывок (dash.count штук) → пауза.
//   Фаза 3: разгорается: те же рывки быстрее и длиннее серией (burst), а вдоль пути в обе стороны от линии рывка
//     разлетаются шарики (burst.sideEvery: через сколько единиц пути пара шариков).
//
// Босс идёт по обычному движению врага (world_enemy.updateEnemy): пока e.atk.state не 'idle', он стоит; во время рывка
// двигает его эта система. Рывок и шарики бьют героя через Combat.damageHero (блок и парирование работают как у остальных).
// Парированный рывок оглушает босса на dash.stun секунд.
//
// Состояния (this.state): idle → (aim → fire → pause) в фазе 1; (windup → strike → recovery → gap → …) в фазах 2 и 3.
// События: 'arch:phase' { phase } при смене микрофазы.
import { initProjectile } from './world_projectile.js';

export class Arch {
  /** o: { config, hero, arena, combat, enemyShots (EntityPool), bus, defense?, rnd } */
  constructor(o) {
    this.cfg = o.config;
    this.hero = o.hero;
    this.arena = o.arena;
    this.combat = o.combat;
    this.shots = o.enemyShots;
    this.bus = o.bus;
    this.defense = o.defense || null;
    this.rnd = o.rnd || Math.random;
    this.enemy = null;
    this.state = 'idle';
    this.t = 0;
    this.cd = 0;
    this.n = 0;        // сколько залпов-шариков или рывков серии уже сделано
    this.travel = 0;   // пройдено на рывке (для шариков в стороны)
    this.sideAt = 0;
    this.bus.on('boss:spawned', ({ enemy }) => this.attach(enemy));
    this.bus.on('enemy:killed', ({ enemy }) => { if (enemy === this.enemy) this.detach(); });
    this.bus.on('hero:parried', (p) => this.onParried(p));
  }

  get A() { return this.enemy && this.enemy.def ? this.enemy.def.arch : null; }

  attach(e) {
    this.reset();
    if (!e.def.arch) return;
    this.enemy = e;
    e.archPhase = 0;
    e.walkIn = false;
    this.cd = e.def.arch.firstDelay;
  }

  detach() {
    const e = this.enemy;
    if (e && e.def) {
      e.atk.state = 'idle';
      e.aim = 0;
    }
    this.enemy = null;
    this.state = 'idle';
  }

  reset() {
    this.enemy = null;
    this.state = 'idle';
    this.t = 0;
    this.cd = 0;
    this.n = 0;
    this.travel = 0;
  }

  /** Номер микрофазы по здоровью (0, 1, 2). */
  phaseFor(e) {
    const f = e.hp / Math.max(1, e.maxHp);
    const P = e.def.arch.phases;
    return f <= P[1] ? 2 : f <= P[0] ? 1 : 0;
  }

  setState(s) {
    this.state = s;
    this.t = 0;
  }

  reachRadius() {
    const h = this.hero;
    return this.defense && this.defense.blocking ? Math.max(h.radius, this.defense.blockRadius) : h.radius;
  }

  /** Параметры рывка с учётом фазы 3 (burst переопределяет windup, count, pause). */
  dashCfg(e) {
    const A = e.def.arch;
    if (e.archPhase < 2) return A.dash;
    return { ...A.dash, windup: A.burst.windup, count: A.burst.count, pause: A.burst.pause };
  }

  update(dt) {
    const e = this.enemy;
    if (!e) return;
    if (!e.active || !e.def || !e.def.arch) { this.detach(); return; }
    if (e.freezeT > 0) return;
    const A = e.def.arch;
    const ph = this.phaseFor(e);
    if (ph !== e.archPhase) { // смена микрофазы: обрываем текущее действие, короткая пауза
      e.archPhase = ph;
      e.atk.state = 'idle';
      e.aim = 0;
      e.walkIn = ph > 0;
      this.n = 0;
      this.setState('idle');
      this.cd = A.phaseDelay;
      this.bus.emit('arch:phase', { phase: ph, enemy: e });
    }
    this.t += dt;
    if (ph === 0) this.updateVolley(e, A, dt);
    else this.updateDash(e, A, dt);
  }

  // ---------- фаза 1: залпы

  updateVolley(e, A, dt) {
    const V = A.volley;
    const h = this.hero;
    switch (this.state) {
      case 'idle': {
        if (this.cd > 0) { this.cd -= dt; return; }
        if (!h.active) return;
        const d = Math.hypot(h.x - e.x, h.y - e.y);
        if (d > A.dash.startRange || this.arena.segmentBlocked(e.x, e.y, h.x, h.y, V.shot.radius)) return; // не видит героя
        e.aim = e.aimTotal = V.aim;
        this.n = 0;
        this.setState('aim');
        break;
      }
      case 'aim':
        e.aim = Math.max(0, V.aim - this.t);
        if (this.t >= V.aim) { e.aim = 0; this.setState('fire'); this.fireOne(e, V); this.n = 1; }
        break;
      case 'fire':
        if (this.t >= V.interval) {
          this.t -= V.interval;
          this.fireOne(e, V);
          this.n++;
        }
        if (this.n >= V.count) { this.setState('idle'); this.cd = V.pause; }
        break;
      default:
        this.setState('idle');
    }
  }

  /** Один шарик в героя на этот момент, со случайным разбросом угла. */
  fireOne(e, V) {
    const lim = this.cfg.limits;
    if (this.shots.count >= lim.maxEnemyShots) return;
    const h = this.hero;
    const a = Math.atan2(h.y - e.y, h.x - e.x) + (this.rnd() - 0.5) * 2 * V.jitter;
    const p = this.shots.spawn();
    initProjectile(p, V.shot, e.x, e.y, Math.cos(a), Math.sin(a), e);
    this.bus.emit('enemy:shot', { projectile: p, enemy: e });
  }

  // ---------- фазы 2 и 3: рывки

  updateDash(e, A, dt) {
    const D = this.dashCfg(e);
    const a = e.atk;
    const h = this.hero;
    switch (this.state) {
      case 'idle': {
        a.state = 'idle'; // обычное движение: идёт к герою
        if (this.cd > 0) { this.cd -= dt; return; }
        if (!h.active) return;
        const d = Math.hypot(h.x - e.x, h.y - e.y);
        if (d > D.startRange || this.arena.segmentBlocked(e.x, e.y, h.x, h.y, e.radius)) return;
        this.n = 0;
        this.startWindup(e, a, h);
        break;
      }
      case 'windup':
        if (this.t >= D.windup) {
          a.t = 0;
          a.state = 'strike';
          e.strikeSrc.active = true;
          e.strikeSrc.parryable = D.parryable !== false;
          this.travel = 0;
          this.sideAt = 0;
          this.setState('strike');
          this.bus.emit('enemy:strike', { enemy: e });
        } else {
          a.t = this.t;
        }
        break;
      case 'strike':
        this.strike(e, A, D, a, dt);
        break;
      case 'recovery':
        if (this.t >= D.recovery) {
          this.n++;
          if (this.n >= D.count) { a.state = 'idle'; this.setState('idle'); this.cd = D.pause; }
          else { this.setState('gap'); }
        }
        break;
      case 'gap':
        if (this.t >= D.gap) this.startWindup(e, a, h);
        break;
      case 'stun':
        if (this.t >= D.stun) { a.state = 'idle'; this.setState('idle'); this.cd = D.pause; }
        break;
      default:
        this.setState('idle');
    }
  }

  startWindup(e, a, h) {
    const dx = h.x - e.x;
    const dy = h.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    a.state = 'windup';
    a.t = 0;
    a.hit = false;
    a.dirX = dx / d; // направление запоминается: от рывка можно уйти
    a.dirY = dy / d;
    this.setState('windup');
    this.bus.emit('enemy:windup', { enemy: e });
  }

  strike(e, A, D, a, dt) {
    const step = (D.length / Math.max(0.01, D.strike)) * dt;
    const bx = e.x;
    const by = e.y;
    e.x += a.dirX * step;
    e.y += a.dirY * step;
    this.arena.resolveCircle(e);
    const moved = Math.hypot(e.x - bx, e.y - by);
    this.travel += moved;
    // Фаза 3: вдоль пути пары шариков в обе стороны от линии рывка.
    if (e.archPhase === 2) {
      const S = A.burst;
      while (this.travel >= this.sideAt + S.sideEvery) {
        this.sideAt += S.sideEvery;
        this.fireSide(e, S, a.dirX, a.dirY);
      }
    }
    const reach = this.reachRadius() + e.radius;
    const hx = this.hero.x - e.x;
    const hy = this.hero.y - e.y;
    if (!a.hit && this.hero.active && hx * hx + hy * hy <= reach * reach) {
      a.hit = true;
      e.strikeSrc.x = e.x;
      e.strikeSrc.y = e.y;
      this.combat.damageHero(D.damage, e.strikeSrc); // рывок идёт сквозь героя до конца (при парировании state станет 'stun', onParried)
      if (this.state !== 'strike') return;
    }
    if (moved < step * 0.5 || this.t >= D.strike) this.endStrike(e, a);
  }

  endStrike(e, a) {
    a.state = 'recovery';
    this.setState('recovery');
  }

  fireSide(e, S, dx, dy) {
    const lim = this.cfg.limits;
    for (let k = -1; k <= 1; k += 2) {
      if (this.shots.count >= lim.maxEnemyShots) return;
      const p = this.shots.spawn();
      initProjectile(p, S.shot, e.x, e.y, -dy * k, dx * k, e); // перпендикуляр к линии рывка
      this.bus.emit('enemy:shot', { projectile: p, enemy: e });
    }
  }

  /** Парированный рывок оглушает босса. */
  onParried(p) {
    const e = this.enemy;
    if (!e || !p.source || p.source.enemy !== e || this.state !== 'strike') return;
    e.atk.state = 'stun';
    e.atk.hit = true;
    this.setState('stun');
    this.bus.emit('enemy:parried', { enemy: e });
  }
}
