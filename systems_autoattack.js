// Автоатака: ближайший враг в радиусе, снаряд летит в него, перезарядка настраивается.
// Цель ищется через сетку (spatial grid), если она передана: цена не растёт с размером орды.
import { initProjectile } from './world_projectile.js';
import { applyMod, countPenalty } from './build_cores.js';

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
    this.timer = 0;
    this.target = null; // нужна отрисовке: метка на цели
  }

  reset() {
    this.timer = 0;
    this.target = null;
  }

  update(dt) {
    const hero = this.hero;
    if (!hero.active) {
      this.target = null;
      return;
    }
    const atk = this.cfg.attack;
    // Ползунок перезарядки действует сразу: остаток старого таймера не длиннее новой перезарядки.
    if (this.timer > atk.reload) this.timer = atk.reload;
    this.timer -= dt;
    const def = this.cfg.projectiles[atk.projectile];
    const arena = atk.requireLineOfSight ? this.arena : null;
    const target = findNearest(this.enemies.items, hero.x, hero.y, atk.radius, arena, def.radius, this.grid);
    this.target = target;
    // Потолок снарядов: множители конструктора иначе заполнят мир выстрелами. Пока слотов нет, ждём.
    const lim = this.cfg.limits;
    const full = lim && this.shots.count >= lim.maxShots;
    if (target && this.timer <= 0 && !full) {
      this.fire(target);
      this.timer += atk.reload; // переносим остаток: ритм выстрелов не плывёт
      if (this.timer < 0) this.timer = 0;
    } else if ((!target || full) && this.timer < 0) {
      this.timer = 0; // цели нет: первый выстрел по новой цели без задержки
    }
  }

  fire(target) {
    const hero = this.hero;
    const def = this.cfg.projectiles[this.cfg.attack.projectile];
    const dx = target.x - hero.x;
    const dy = target.y - hero.y;
    const len = Math.hypot(dx, dy) || 1;
    const m = this.modifiers ? this.modifiers(this.cfg.attack.core) : null;
    // Число снарядов: базовое из конфига с модами ядра. Летят рядом друг с другом, параллельно.
    const count = Math.max(1, Math.round(applyMod(this.cfg.attack.count || 1, m && m.count)));
    const gap = this.cfg.attack.spread || 14;
    const pen = countPenalty(this.cfg, count); // чем больше снарядов, тем слабее каждый
    const nx = -dy / len;
    const ny = dx / len;
    let first = null;
    for (let i = 0; i < count; i++) {
      const off = (i - (count - 1) / 2) * gap;
      const p = this.shots.spawn();
      if (!p) break; // потолок снарядов
      initProjectile(p, def, hero.x + nx * off, hero.y + ny * off, dx, dy, hero);
      p.damage = applyMod(p.damage, m && m.damage) * pen;
      if (!first) first = p;
    }
    hero.facing = Math.atan2(dy, dx); // посох смотрит на цель
    if (first) this.bus.emit('projectile:fired', { projectile: first, target, count });
  }
}
