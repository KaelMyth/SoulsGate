// Жуки-стрелки: подходят на дистанцию выстрела, замирают («прицеливание»: жук светится, это сигнал
// для парирования) и выпускают одиночный медленный снаряд. Как и всё остальное, описаны данными в
// config.enemies.shooter. Полноценные телеграфы атак придут на этапе 5.
import { initProjectile } from './world_projectile.js';

export class Shooters {
  /** o: { config, hero, arena, shots (EntityPool), bus } */
  constructor(o) {
    this.cfg = o.config;
    this.hero = o.hero;
    this.arena = o.arena;
    this.shots = o.shots;
    this.bus = o.bus;
  }

  update(dt, list) {
    const hero = this.hero;
    if (!hero.active) return;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.active || !e.def.shot || e.freezeT > 0) continue; // замороженный стрелок молчит
      const def = e.def;
      const dx = hero.x - e.x;
      const dy = hero.y - e.y;
      const d = Math.hypot(dx, dy);
      if (e.aim > 0) {
        e.aim -= dt;
        if (e.aim <= 0) {
          e.aim = 0;
          this.fire(e, dx, dy);
          e.fireTimer = def.fireInterval;
        }
        continue;
      }
      // Стреляет только когда видит героя и достаёт.
      if (d > def.shotRange || this.arena.segmentBlocked(e.x, e.y, hero.x, hero.y, def.shot.radius)) continue;
      e.fireTimer -= dt;
      if (e.fireTimer <= 0) e.aim = def.aimTime;
    }
  }

  fire(e, dx, dy) {
    const lim = this.cfg.limits;
    if (this.shots.count >= lim.maxEnemyShots) return;
    const p = this.shots.spawn();
    initProjectile(p, e.def.shot, e.x, e.y, dx, dy, e);
    this.bus.emit('enemy:shot', { projectile: p, enemy: e });
  }
}
