// Автоатака: ближайший враг в радиусе, снаряд летит в него, перезарядка настраивается.
// Цель ищется через сетку (spatial grid), если она передана: цена не растёт с размером орды.
import { initProjectile } from './world_projectile.js';
import { applyMod, countPenalty, projectileCount } from './build_cores.js';

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

export class AutoAttack {
  /** o: { config, hero, enemies (EntityPool), shots (EntityPool), bus, arena?, grid? (SpatialGrid по enemies.items) } */
  constructor(o) {
    this.cfg = o.config;
    this.arena = o.arena || null;
    this.grid = o.grid || null;
    this.hero = o.hero;
    this.enemies = o.enemies;
    this.shots = o.shots;
    this.bus = o.bus;
    this.modifiers = o.modifiers || null; // (coreId) => { стат: { percent, flat } }
    this.rnd = o.rnd || Math.random;
    this.timer = 0;
    this.acc = 1;       // поток (больше streamFrom снарядов): накопленные к выпуску снаряды
    this.target = null; // нужна отрисовке: метка на цели
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
    const reload = atk.reload / (mm && mm.rate ? 1 + mm.rate.percent / 100 : 1);
    // Ползунок перезарядки действует сразу: остаток старого таймера не длиннее новой перезарядки.
    if (this.timer > reload) this.timer = reload;
    this.timer -= dt;
    const def = this.cfg.projectiles[atk.projectile];
    const arena = atk.requireLineOfSight ? this.arena : null;
    const target = findNearest(this.enemies.items, hero.x, hero.y, atk.radius, arena, def.radius, this.grid);
    this.target = target;
    // Потолок снарядов: множители конструктора иначе заполнят мир выстрелами. Пока слотов нет, ждём.
    const lim = this.cfg.limits;
    const full = lim && this.shots.count >= lim.maxShots;
    const m = this.modifiers ? this.modifiers(atk.core) : null;
    const count = projectileCount(this.cfg, m);
    if (count >= atk.streamFrom) {
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
        const p = this.shots.spawn();
        if (!p) break; // потолок снарядов
        initProjectile(p, def, hero.x + nx * side + fx * back, hero.y + ny * side + fy * back, dx, dy, hero);
        p.damage = applyMod(p.damage, m && m.damage) * pen;
        if (!first) first = p;
        fired++;
      }
    }
    hero.facing = Math.atan2(dy, dx); // посох смотрит на цель
    if (first) this.bus.emit('projectile:fired', { projectile: first, target, count: fired });
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
    p.damage = applyMod(p.damage, m && m.damage) * countPenalty(this.cfg, count);
    hero.facing = Math.atan2(dy, dx);
    this.bus.emit('projectile:fired', { projectile: p, target, count: 1 });
  }
}
