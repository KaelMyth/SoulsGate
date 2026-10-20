// Автоатака: ближайший враг в радиусе, снаряд летит в него, перезарядка настраивается.
// Пока перебор врагов простой; при большой орде на этапе 3 заменится на сетку (spatial grid).
import { initProjectile } from './world_projectile.js';

/**
 * Ближайший активный враг в пределах radius от (x, y) или null.
 * Если передана арена, враги за скалой (снаряд в них не долетит) не выбираются;
 * pad: запас на толщину снаряда.
 */
export function findNearest(enemies, x, y, radius, arena, pad) {
  let best = null;
  let bestD2 = radius * radius;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (!e.active) continue;
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
  /** o: { config, hero, enemies (EntityPool), shots (EntityPool), bus, arena? } */
  constructor(o) {
    this.cfg = o.config;
    this.arena = o.arena || null;
    this.hero = o.hero;
    this.enemies = o.enemies;
    this.shots = o.shots;
    this.bus = o.bus;
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
    const target = findNearest(this.enemies.items, hero.x, hero.y, atk.radius, arena, def.radius);
    this.target = target;
    if (target && this.timer <= 0) {
      this.fire(target);
      this.timer += atk.reload; // переносим остаток: ритм выстрелов не плывёт
      if (this.timer < 0) this.timer = 0;
    } else if (!target && this.timer < 0) {
      this.timer = 0; // цели нет: первый выстрел по новой цели без задержки
    }
  }

  fire(target) {
    const hero = this.hero;
    const def = this.cfg.projectiles[this.cfg.attack.projectile];
    const dx = target.x - hero.x;
    const dy = target.y - hero.y;
    const p = this.shots.spawn();
    initProjectile(p, def, hero.x, hero.y, dx, dy, hero);
    hero.facing = Math.atan2(dy, dx); // посох смотрит на цель
    this.bus.emit('projectile:fired', { projectile: p, target });
  }
}
