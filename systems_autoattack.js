// Автоатака: ближайший враг в радиусе, снаряд летит в него, перезарядка настраивается.
// Цель ищется через сетку (spatial grid), если она передана: цена не растёт с размером орды.
import { initProjectile } from './world_projectile.js';
import { applyMod, countPenalty, laserStats, projectileCount } from './build_cores.js';

/** Горение из модов: снаряд при попадании поджигает (урон тика от урона снаряда, интервал из частоты). */
function setBurn(p, cfg, m) {
  if (m && m.pierce) p.pierce = m.pierce.count; // пробитие: сколько врагов пройти насквозь
  if (m && m.frost) p.frost = true; // мороз (заряды замедления) у снаряда
  if (m && m.lightning) p.zap = m.lightning.mult; // шар молний: электризует при попадании
  if (m && m.phantom) { p.phantom = Math.min(1, cfg.phantom.chance * m.phantom.mult); p.phDmg = m.phantom.damage || 1; } // фантомный выстрел: шанс при попадании
  if (!m || !m.burn) return;
  p.burnDmg = p.damage * cfg.burn.damageFrac * m.burn.damage;
  p.burnInt = cfg.burn.interval / m.burn.rate;
  if (m.frost && m.steam) p.steam = m.steam.damage; // связка: на 5 зарядах взрыв пара вместо заморозки
}

/** Гравитация включается только для обычных летящих снарядов (не Дробь/Лазер). */
function setGravity(p, cfg, m) {
  if (!m || !m.gravity) return;
  const G = cfg.gravity;
  p.gravity = true;
  p.gravityAge = 0;
  p.gravityStart = G.startSpeed;
  p.gravityEnd = G.maxSpeed;
  p.gravityRamp = G.rampTime;
  p.gravityHold = G.holdFraction;
  p.damage *= 1 + G.damageBonus * m.gravity.count;
}

/**
 * Ближайший активный враг в пределах radius от (x, y) или null.
 * Если передана арена, враги за скалой (снаряд в них не долетит) не выбираются;
 * pad: запас на толщину снаряда.
 */
export function findNearest(enemies, x, y, radius, arena, pad, grid) {
  let best = null;
  let bestD2 = radius * radius;
  // С сеткой смотрим только врагов в соседних клетках; без неё (тесты, простые случаи) всех.
  const n = grid ? grid.query(x, y, radius) : enemies.length;
  const buf = grid ? grid.buf : null;
  for (let k = 0; k < n; k++) {
    const e = enemies[grid ? buf[k] : k];
    if (!e || !e.active) continue;
    const dx = e.x - x;
    const dy = e.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 > bestD2) continue;
    if (arena && arena.segmentBlocked(x, y, e.x, e.y, pad || 0)) continue;
    bestD2 = d2;
    best = e;
  }
  return best;
}

/** Свечение огненного шара по числу снарядов: 1 даёт 0, 2: 0.25, 4: 0.5, 8: 0.75, 16 и больше: 1. */
function countGlow(count) {
  return Math.min(1, Math.log2(Math.max(1, count)) / 4);
}

export class AutoAttack {
  /** o: { config, hero, enemies (EntityPool), shots (EntityPool), bus, arena?, grid? (SpatialGrid по enemies.items) } */
  constructor(o) {
    this.cfg = o.config;
    this.arena = o.arena || null;
    this.grid = o.grid || null;
    this.hero = o.hero;
    this.enemies = o.enemies;
    this.shots = o.shots;
    this.pellets = o.pellets || null; // дробинки (мод «Дробь»)
    this.lasers = o.lasers || []; // лазеры на поле (ими занимается игра)
    this.bus = o.bus;
    this.modifiers = o.modifiers || null; // (coreId) => { стат: { percent, flat } }
    this.rnd = o.rnd || Math.random;
    this.rangeMul = 1;  // пассив «Дальность атаки»
    this.timer = 0;
    this.acc = 1;       // поток (больше streamFrom снарядов): накопленные к выпуску снаряды
    this.target = null; // нужна отрисовке: метка на цели
    this.candidates = [];
  }

  reset() {
    this.timer = 0;
    this.acc = 1;
    this.target = null;
  }

  update(dt) {
    const hero = this.hero;
    if (!hero.active) {
      this.target = null;
      return;
    }
    const atk = this.cfg.attack;
    // Моды скорости атаки (Ускорение) делят перезарядку.
    const mm = this.modifiers ? this.modifiers(atk.core) : null;
    const reload = atk.reload / (mm && mm.rate ? 1 + mm.rate.percent / 100 : 1) / (mm && mm.shot && mm.shot.rate ? mm.shot.rate : 1); // Ускорение на Дроби ускоряет залпы
    // Ползунок перезарядки действует сразу: остаток старого таймера не длиннее новой перезарядки.
    if (this.timer > reload) this.timer = reload;
    this.timer -= dt;
    const def = this.cfg.projectiles[atk.projectile];
    const arena = atk.requireLineOfSight ? this.arena : null;
    const target = findNearest(this.enemies.items, hero.x, hero.y, atk.radius * this.rangeMul, arena, def.radius, this.grid);
    this.target = target;
    // Потолок снарядов: множители конструктора иначе заполнят мир выстрелами. Пока слотов нет, ждём.
    const lim = this.cfg.limits;
    const m = this.modifiers ? this.modifiers(atk.core) : null;
    const special = !!(m && (m.laser || m.shot)); // лазер и дробь не используют пул снарядов
    const full = lim && this.shots.count >= lim.maxShots && !special;
    const count = projectileCount(this.cfg, m);
    if (count >= atk.streamFrom && !special) { // лазеру поток не нужен: число снарядов идёт в ширину
      // Много снарядов: не залп, а беспрерывный поток. За секунду выпускается ровно count / reload снарядов,
      // столько же, сколько дал бы залп раз в reload: копим дробный остаток и выпускаем по одному.
      if (!target) {
        this.acc = 1;
        return;
      }
      this.acc = Math.min(this.acc + dt * count / reload, 4);
      while (this.acc >= 1 && !(lim && this.shots.count >= lim.maxShots)) {
        this.fireStream(target, m, count);
        this.acc -= 1;
      }
      this.timer = 0;
      return;
    }
    this.acc = 1;
    if (target && this.timer <= 0 && !full) {
      this.fire(target);
      this.timer += reload; // переносим остаток: ритм выстрелов не плывёт
      if (this.timer < 0) this.timer = 0;
    } else if ((!target || full) && this.timer < 0) {
      this.timer = 0; // цель нет: первый выстрел по новой цели без задержки
    }
  }

  /** Расстановка снарядов залпа: ряды спереди назад (attack.formations), числа это снарядов в ряду. */
  fire(target) {
    const m0 = this.modifiers ? this.modifiers(this.cfg.attack.core) : null;
    if (m0 && m0.laser) return this.fireLaser(target, m0);
    if (m0 && m0.shot && this.pellets) return this.fireShot(target, m0);
    const hero = this.hero;
    const def = this.cfg.projectiles[this.cfg.attack.projectile];
    const dx = target.x - hero.x;
    const dy = target.y - hero.y;
    const len = Math.hypot(dx, dy) || 1;
    const fx = dx / len;
    const fy = dy / len;
    const nx = -fy;
    const ny = fx;
    const m = this.modifiers ? this.modifiers(this.cfg.attack.core) : null;
    const count = projectileCount(this.cfg, m);
    const gap = this.cfg.attack.spread || 14;
    const pen = countPenalty(this.cfg, count); // чем больше снарядов, тем слабее каждый
    const rows = this.cfg.attack.formations[count] || [count];
    let first = null;
    let fired = 0;
    for (let r = 0; r < rows.length; r++) {
      const n = rows[r];
      for (let j = 0; j < n; j++) {
        const side = (j - (n - 1) / 2) * gap;
        const back = -r * gap;
        if (this.cfg.limits && this.shots.count >= this.cfg.limits.maxShots) break;
        const p = this.shots.spawn();
        if (!p) break; // потолок снарядов
        initProjectile(p, def, hero.x + nx * side + fx * back, hero.y + ny * side + fy * back, dx, dy, hero);
        p.damage = applyMod(p.damage, m && m.damage) * pen;
        setGravity(p, this.cfg, m);
        p.glow = countGlow(count);
        p.range *= this.rangeMul;
        setBurn(p, this.cfg, m);
        if (!first) first = p;
        fired++;
      }
    }
    hero.facing = Math.atan2(dy, dx); // посох смотрит на цель
    if (first) this.bus.emit('projectile:fired', { projectile: first, target, count: fired });
  }

  /** Дробь: каждый снаряд это веер из shot.base дробинок, снарядов больше значит дробинок больше; урон без штрафа за число. */
  fireShot(target, m) {
    const hero = this.hero;
    const S = this.cfg.shot;
    const P = this.pellets;
    const def = this.cfg.projectiles[this.cfg.attack.projectile];
    const dx = target.x - hero.x;
    const dy = target.y - hero.y;
    const base = Math.atan2(dy, dx);
    const want = Math.round(S.base * projectileCount(this.cfg, m));
    const n = Math.min(want, P.free()); // места нет: стреляем тем, что влезает
    const sd = m.shot && m.shot.damage ? m.shot.damage : 1; // Мощь на Дроби
    const gravityBonus = m.gravity ? 1 + this.cfg.gravity.damageBonus * m.gravity.count : 1;
    const dmg = applyMod(def.damage, m.damage) * S.damageFrac * sd * gravityBonus;
    const half = (S.spread * Math.PI) / 360;
    // Горение и Мороз: несут только каждая вторая дробинка, иначе заряды Мороза набирались бы за один залп.
    const full = applyMod(def.damage, m.damage) * sd;
    const pc = m.pierce ? m.pierce.count : 0; // Пробитие на Дроби: сколько врагов насквозь
    const ph = m.phantom ? Math.min(1, this.cfg.phantom.chance * m.phantom.mult) : 0; // Фантом на Дроби: шанс веера (несёт каждая четвёртая дробинка)
    const bd = m.burn ? full * this.cfg.burn.damageFrac * m.burn.damage : 0;
    const bi = m.burn ? this.cfg.burn.interval / m.burn.rate : 0;
    const st = bd > 0 && m.frost && m.steam ? m.steam.damage : 0;
    for (let i = 0; i < n; i++) {
      // Равномерный веер с небольшой дрожью: дробинки не стоят рядами, но и не слипаются в одну точку.
      const t = n > 1 ? (i + this.rnd() * 0.8) / n : 0.5;
      const a = base + (t * 2 - 1) * half;
      const sp = S.speed * (1 + (this.rnd() * 2 - 1) * S.speedJitter);
      // Дробь наследует гравитационный разгон без подмены отдельной системой снарядов.
      const gravitySpeed = 1;
      const fx = (i & 1) === 0; // половина несёт эффекты
      P.add(hero.x + Math.cos(a) * 10, hero.y + Math.sin(a) * 10, Math.cos(a) * sp * gravitySpeed, Math.sin(a) * sp * gravitySpeed, S.range * this.rangeMul, dmg,
        fx ? bd : 0, fx ? bi : 0, fx && m.frost ? 1 : 0, fx ? st : 0, fx && m.lightning ? m.lightning.mult : 0, pc, (i & 3) === 0 ? ph : 0, 0, !!m.gravity);
    }
    hero.facing = base;
    this.bus.emit('projectile:fired', { projectile: null, target, count: n });
  }

  /** Враги, которых можно взять целью, по возрастанию расстояния (в радиусе атаки, на прямой видимости). */
  targetsByDistance() {
    const atk = this.cfg.attack;
    const hero = this.hero;
    const en = this.enemies.items;
    const out = this.cand || (this.cand = []);
    out.length = 0;
    const indices = this.candidates;
    const n = this.grid ? this.grid.query(hero.x, hero.y, atk.radius * this.rangeMul, indices) : en.length;
    const buf = this.grid ? indices : null;
    for (let k = 0; k < n; k++) {
      const e = en[buf ? buf[k] : k];
      if (!e || !e.active) continue;
      const d = Math.hypot(e.x - hero.x, e.y - hero.y);
      if (d > atk.radius * this.rangeMul) continue;
      if (atk.requireLineOfSight && this.arena && this.arena.segmentBlocked(hero.x, hero.y, e.x, e.y, 4)) continue;
      out.push({ e, d });
    }
    out.sort((p, q) => p.d - q.d);
    return out;
  }

  /**
   * Лазер вместо снарядов: каждый «снаряд» это отдельный луч из героя. Лучи берут разных врагов по порядку расстояния,
   * когда лучей больше, чем врагов, цели повторяются. Луч держится life секунд и бьёт тиками. Пробитие на лазер не действует.
   */
  fireLaser(target, m) {
    const hero = this.hero;
    const L = this.cfg.laser;
    const def = this.cfg.projectiles[this.cfg.attack.projectile];
    const count = projectileCount(this.cfg, m);
    const dmg = applyMod(def.damage, m.damage); // урон снаряда с модами
    const ls = laserStats(this.cfg, m.laser, dmg, count);
    const b = m.burn;
    const grav = m.gravity ? 1 + this.cfg.gravity.damageBonus * m.gravity.count : 1;
    const charge = m.gravity ? Math.max(0.05, this.cfg.gravity.laserCharge) : 0;
    const list = this.targetsByDistance();
    if (!list.length) list.push({ e: target, d: Math.hypot(target.x - hero.x, target.y - hero.y) });
    const burnDmg = b ? dmg * countPenalty(this.cfg, count) * this.cfg.burn.damageFrac * b.damage : 0;
    let fired = 0;
    // Дробь на Лазере: каждый луч делится на split тонких, они берут врагов по одному на тройку.
    const split = m.shot ? Math.max(1, L.splitCount | 0) : 1;
    const sdm = m.shot && m.shot.damage ? m.shot.damage : 1; // Мощь на Дроби
    const total = count * split;
    for (let i = 0; i < total; i++) {
      if (this.lasers.length >= L.max) break;
      const t = list[Math.floor(i / split) % list.length].e;
      const dx = t.x - hero.x;
      const dy = t.y - hero.y;
      const len = Math.hypot(dx, dy) || 1;
      this.lasers.push({
        x: hero.x, y: hero.y, dx: dx / len, dy: dy / len, len: Math.min(L.length * this.rangeMul, len),
        target: t, pierce: 0, // конец луча следует за целью и упирается в первого врага на пути
        off: split > 1 ? (i % split) - (split - 1) / 2 : 0, // тонкие лучи расходятся у героя и сходятся на цели
        width: split > 1 ? ls.width * L.splitWidth : ls.width, age: 0, life: ls.life, interval: ls.interval, ticks: ls.ticks, done: 0,
        tick: (split > 1 ? ls.tick * sdm / split : ls.tick) * grav, big: ls.big,
        gravityLaser: !!m.gravity, gravityChargeTime: charge, gravityChargeAge: 0,
        gravityOrigin: m.gravity ? this.cfg.gravity.laserOrigin : 0,
        burnDmg: burnDmg * grav,
        burnInt: b ? this.cfg.burn.interval / b.rate : 0,
        frost: !!m.frost,
        steam: m.frost && m.steam && b ? m.steam.damage : 0,
        pulse: 0,
        zap: m.lightning ? m.lightning.mult : 0, // лазер-разряд
        gen: 0, phDmg: m.phantom ? m.phantom.damage || 1 : 1, phantom: m.phantom ? Math.min(1, this.cfg.phantom.chance * m.phantom.mult) / split : 0, // фантом: шанс на каждый тик
      });
      fired++;
    }
    if (!fired) return;
    const first = list[0].e;
    hero.facing = Math.atan2(first.y - hero.y, first.x - hero.x);
    this.bus.emit('laser:fired', { count: fired });
  }

  /** Один снаряд потока: небольшой разброс по ширине, глубине и углу. */
  fireStream(target, m, count) {
    const hero = this.hero;
    const atk = this.cfg.attack;
    const def = this.cfg.projectiles[atk.projectile];
    const dx = target.x - hero.x;
    const dy = target.y - hero.y;
    const len = Math.hypot(dx, dy) || 1;
    const fx = dx / len;
    const fy = dy / len;
    const gap = atk.spread || 14;
    const side = (this.rnd() - 0.5) * 2 * gap * atk.streamWidth;
    const back = -this.rnd() * gap * 2;
    const ang = (this.rnd() - 0.5) * 2 * atk.streamAngle * Math.PI / 180;
    const c = Math.cos(ang);
    const sn = Math.sin(ang);
    const p = this.shots.spawn();
    if (!p) return;
    initProjectile(p, def, hero.x - fy * side + fx * back, hero.y + fx * side + fy * back, dx * c - dy * sn, dx * sn + dy * c, hero);
    p.glow = countGlow(count);
    p.range *= this.rangeMul;
    p.damage = applyMod(p.damage, m && m.damage) * countPenalty(this.cfg, count);
    setGravity(p, this.cfg, m);
    setBurn(p, this.cfg, m);
    hero.facing = Math.atan2(dy, dx);
    this.bus.emit('projectile:fired', { projectile: p, target, count: 1 });
  }
}
