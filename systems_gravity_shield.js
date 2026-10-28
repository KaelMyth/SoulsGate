// Гравитация на щите: враги не проходят через горизонт, а вражеские снаряды огибают героя.
import { initProjectile } from './world_projectile.js';

export class GravityShield {
  constructor({ config, hero, defense, arena, enemies, enemyShots, heroShots }) {
    this.cfg = config;
    this.hero = hero;
    this.defense = defense;
    this.arena = arena;
    this.enemies = enemies;
    this.enemyShots = enemyShots;
    this.heroShots = heroShots;
  }

  get active() {
    return this.hero.active && this.defense.blocking && this.defense.gravityOn;
  }

  /** Граница поля отталкивает обычных врагов, даже если толпа давит со спины. */
  blockEnemies() {
    if (!this.active) return;
    const h = this.hero, R = this.cfg.gravity.shieldRadius, list = this.enemies.items;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.active || e.def.immovable || (e.def.passThroughHero && e.atk.state === 'strike')) continue;
      const dx = e.x - h.x, dy = e.y - h.y;
      const min = R + e.radius, d2 = dx * dx + dy * dy;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2);
      e.x = h.x + (d > 1e-5 ? dx / d : 1) * min;
      e.y = h.y + (d > 1e-5 ? dy / d : 0) * min;
      this.arena.resolveCircle(e);
    }
  }

  /** Перехват по отрезку, а не по точке: быстрые пули не пролетят сквозь поле. */
  captureShots() {
    if (!this.active) return;
    const h = this.hero, G = this.cfg.gravity, list = this.enemyShots.items;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (!p.active) continue;
      const sx = p.x - p.prevX, sy = p.y - p.prevY, step2 = sx * sx + sy * sy;
      const t = step2 > 1e-9 ? Math.max(0, Math.min(1, ((h.x - p.prevX) * sx + (h.y - p.prevY) * sy) / step2)) : 0;
      let ax = p.prevX + sx * t - h.x, ay = p.prevY + sy * t - h.y;
      const reach = G.shieldRadius + p.radius;
      if (ax * ax + ay * ay > reach * reach) continue;
      if (this.cfg.limits && this.heroShots.count >= this.cfg.limits.maxShots) { p.active = false; continue; }
      const q = this.heroShots.spawn();
      if (!q) { p.active = false; continue; }
      let len = Math.hypot(ax, ay);
      if (len < 1e-5) { ax = p.prevX - h.x; ay = p.prevY - h.y; len = Math.hypot(ax, ay); }
      if (len < 1e-5) { ax = 1; ay = 0; }
      const angle = Math.atan2(ay, ax);
      const cross = ax * p.vy - ay * p.vx;
      const dir = Math.abs(cross) < 1e-5 ? (i % 2 ? 1 : -1) : Math.sign(cross);
      initProjectile(q, p, h.x + Math.cos(angle) * reach, h.y + Math.sin(angle) * reach,
        -Math.sin(angle) * dir, Math.cos(angle) * dir, h);
      q.speed = Math.max(120, p.speed);
      q.range = Math.max(G.shieldShotRange, p.range);
      q.damage = p.damage;
      q.gravityReflected = true;
      q.gravityOrbit = true;
      q.orbitAngle = angle;
      q.orbitDirection = dir;
      q.orbitRadius = reach;
      q.orbitAge = 0;
      q.vx = -Math.sin(angle) * dir * q.speed;
      q.vy = Math.cos(angle) * dir * q.speed;
      p.active = false;
    }
  }

  /** Облёт вокруг героя с выходом по касательной, после чего работает обычная физика снаряда. */
  updateOrbits(dt) {
    const h = this.hero, G = this.cfg.gravity, list = this.heroShots.items;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (!p.active || !p.gravityOrbit) continue;
      p.prevX = p.x; p.prevY = p.y;
      const step = Math.min(dt, Math.max(0, G.shieldOrbitTime - p.orbitAge));
      p.orbitAge += step;
      p.orbitAngle += G.shieldOrbitSpeed * step * p.orbitDirection;
      const a = p.orbitAngle, dir = p.orbitDirection;
      p.x = h.x + Math.cos(a) * p.orbitRadius;
      p.y = h.y + Math.sin(a) * p.orbitRadius;
      p.vx = -Math.sin(a) * dir * p.speed;
      p.vy = Math.cos(a) * dir * p.speed;
      if (p.orbitAge >= G.shieldOrbitTime || !h.active) {
        p.gravityOrbit = false;
        p.travelled = 0;
      }
    }
  }
}
