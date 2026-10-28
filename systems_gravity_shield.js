// Гравитация на щите: движение сильно замедляется внутри поля, но граница проходима.
// Вражеские снаряды остаются опасными, слегка огибают героя и могут задеть других врагов.

/** Доля отрезка внутри круга. Без выделения объектов в горячем цикле. */
export function gravitySegmentFraction(ax, ay, bx, by, cx, cy, radius) {
  const dx = bx - ax, dy = by - ay, A = dx * dx + dy * dy;
  const x = ax - cx, y = ay - cy, R = radius * radius;
  if (A < 1e-10) return x * x + y * y < R ? 1 : 0;
  const B = x * dx + y * dy;
  const D = B * B - A * (x * x + y * y - R);
  if (D <= 0) return 0;
  const q = Math.sqrt(D);
  const enter = Math.max(0, (-B - q) / A);
  const exit = Math.min(1, (-B + q) / A);
  return Math.max(0, exit - enter);
}

export class GravityShield {
  constructor({ config, hero, defense, arena, enemies, enemyShots, heroShots }) {
    this.cfg = config;
    this.hero = hero;
    this.defense = defense;
    this.arena = arena;
    this.enemies = enemies;
    this.enemyShots = enemyShots;
    this.heroShots = heroShots;
    this.grid = null;      // привязывается после создания Swarm
    this.combat = null;    // штатная система урона по врагам
    this.candidates = []; // переиспользуемый буфер запросов сетки
    this.ignite = null; // штатные обработчики статусов из Game
    this.chill = null;
    this.zap = null;
    this.elementTimer = 0;
    this.wasActive = false;
    this.enemyReach = 24;
    for (const key in config.enemies || {}) this.enemyReach = Math.max(this.enemyReach, config.enemies[key].radius || 0);
  }

  get active() {
    return this.defense.gravityActive;
  }

  /** Ослабленное поле Ауры живёт в её радиусе с учётом Х2/Х3. */
  get radius() {
    return this.defense.gravityAuraMode
      ? (this.defense.gravityAuraRadius || this.cfg.aura.radius)
      : this.cfg.gravity.shieldRadius;
  }

  /** Все враги внутри поля получают стихийные стаки на первом касании и затем периодически. */
  applyElements(dt) {
    const mask = this.active && this.defense.gravityElements ? this.defense.gravityElements.mask || 0 : 0;
    if (!this.active || !mask) {
      this.elementTimer = 0;
      this.wasActive = false;
      return;
    }
    const G = this.cfg.gravity;
    const hybrid = this.defense.gravityAuraMode;
    const interval = Math.max(0.1, G.shieldElementInterval * (hybrid ? G.auraElementIntervalMul : 1));
    if (!this.wasActive) this.elementTimer = interval;
    this.wasActive = true;
    this.elementTimer += dt;
    if (this.elementTimer < interval) return;
    this.elementTimer %= interval;
    const h = this.hero;
    const en = this.enemies.items;
    const radius = this.radius;
    const burnDamage = G.shieldBurnDamage * (hybrid ? G.auraBurnDamageMul : 1);
    const burnInterval = this.cfg.burn.interval;
    const steam = (mask & 3) === 3 ? 1 : 0;
    for (let i = 0; i < en.length; i++) {
      const e = en[i];
      if (!e.active) continue;
      const dx = e.x - h.x, dy = e.y - h.y;
      const reach = radius + e.radius;
      if (dx * dx + dy * dy > reach * reach) continue;
      if ((mask & 1) && this.ignite) this.ignite(e, burnDamage, burnInterval);
      if ((mask & 2) && this.chill && e.active) this.chill(e, steam, mask & 1 ? burnDamage : 0, burnInterval);
      if ((mask & 4) && this.zap && e.active) this.zap(e, mask & 1 ? burnDamage : 0, burnInterval, mask & 2 ? 1 : 0, steam);
    }
  }

  /** Запоминаем позиции до движения, чтобы тормозить также рывки врагов. */
  beginEnemyStep() {
    if (!this.active) return;
    const list = this.enemies.items;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.active) continue;
      e.gravityPrevX = e.x;
      e.gravityPrevY = e.y;
    }
  }

  /** Вместо непробиваемой стены — сопротивление движению внутри поля. */
  slowEnemies() {
    if (!this.active) return;
    const list = this.enemies.items, h = this.hero, G = this.cfg.gravity;
    const slow = Math.max(0.05, Math.min(1, this.defense.gravityAuraMode ? G.auraEnemySpeed : G.shieldEnemySpeed));
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.active) continue;
      const x0 = e.gravityPrevX, y0 = e.gravityPrevY;
      const x1 = e.x, y1 = e.y;
      if (!Number.isFinite(x0) || !Number.isFinite(y0)) continue;
      const fraction = gravitySegmentFraction(x0, y0, x1, y1, h.x, h.y, this.radius + e.radius);
      if (fraction <= 0) continue;
      const factor = 1 - (1 - slow) * fraction;
      e.x = x0 + (x1 - x0) * factor;
      e.y = y0 + (y1 - y0) * factor;
      e.prevX = x0;
      e.prevY = y0;
      this.arena.resolveCircle(e);
    }
  }

  /** Меняем длительность шага только внутри поля; пуля не меняет владельца и сохраняет урон. */
  enemyShotDt(p, dt) {
    if (!this.active) return dt;
    const G = this.cfg.gravity, h = this.hero;
    const fraction = gravitySegmentFraction(p.x, p.y, p.x + p.vx * dt, p.y + p.vy * dt,
      h.x, h.y, this.radius + p.radius);
    if (fraction <= 0) return dt;
    p.gravityTouched = true;
    // Снаряды, лишь скользящие вдоль горизонта, могут получить обратную траекторию.
    // Летящие прямо в героя остаются опасными — универсального отражения нет.
    // При развороте запоминаем стихии на снаряде: они сохраняются и после исчезновения поля.
    // При прямом попадании изгиб отсутствует. Косые снаряды отклоняются по касательной.
    const hybrid = this.defense.gravityAuraMode;
    const rx = p.x - h.x, ry = p.y - h.y;
    const speed = Math.hypot(p.vx, p.vy), radius = Math.hypot(rx, ry);
    if (speed > 1e-5 && radius > 1e-5 && G.shieldBend > 0) {
      const tangent = Math.max(-1, Math.min(1, (rx * p.vy - ry * p.vx) / (radius * speed)));
      const inward = (rx * p.vx + ry * p.vy) / (radius * speed);
      if (!p.gravityReturned && inward < -0.05 && Math.abs(tangent) >= G.shieldReturnTangent) {
        p.gravityReturnAge += dt * fraction;
        if (p.gravityReturnAge >= G.shieldReturnDelay * (hybrid ? G.auraReturnDelayMul : 1)) {
          // Вылет обратно наружу с сохранением вращения — рикошет только у скользящих пуль.
          const spin = tangent > 0 ? 1 : -1;
          p.vx = (rx / radius * 0.8 - ry / radius * spin * 0.6) * speed;
          p.vy = (ry / radius * 0.8 + rx / radius * spin * 0.6) * speed;
          p.gravityReturned = true;
          p.gravityElementMask = this.defense.gravityElements?.mask || 0;
          p.gravityAuraWeak = hybrid;
          const speedKeep = hybrid ? G.auraProjectileSpeed : G.shieldProjectileSpeed;
          return dt * (1 - (1 - Math.max(0.05, Math.min(1, speedKeep))) * fraction);
        }
      }
      const angle = -tangent * G.shieldBend * (hybrid ? G.auraBendMul : 1) * dt * fraction;
      if (Math.abs(angle) > 1e-7) {
        const c = Math.cos(angle), s = Math.sin(angle), vx = p.vx, vy = p.vy;
        p.vx = vx * c - vy * s;
        p.vy = vx * s + vy * c;
      }
    }
    const slow = Math.max(0.05, Math.min(1, hybrid ? G.auraProjectileSpeed : G.shieldProjectileSpeed));
    return dt * (1 - (1 - slow) * fraction);
  }

  /** Искривлённый снаряд способен по дороге задеть врага, кроме самого стрелка. */
  hitEnemies() {
    if (!this.grid || !this.combat) return;
    const list = this.enemyShots.items, enemies = this.enemies.items, buf = this.candidates;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (!p.active || !p.gravityTouched) continue;
      const sx = p.x - p.prevX, sy = p.y - p.prevY, step2 = sx * sx + sy * sy;
      const n = this.grid.query((p.x + p.prevX) * 0.5, (p.y + p.prevY) * 0.5,
        this.enemyReach + p.radius + Math.sqrt(step2) * 0.5, buf);
      for (let j = 0; j < n; j++) {
        const e = enemies[buf[j]];
        if (!e || !e.active || (e === p.owner && !p.gravityReturned)) continue;
        const t = step2 > 1e-10 ? Math.max(0, Math.min(1,
          ((e.x - p.prevX) * sx + (e.y - p.prevY) * sy) / step2)) : 0;
        const dx = p.prevX + sx * t - e.x, dy = p.prevY + sy * t - e.y;
        const r = p.radius + e.radius;
        if (dx * dx + dy * dy > r * r) continue;
        p.active = false;
        const hit = this.combat.damageEnemy(e, p.damage * (p.gravityAuraWeak ? this.cfg.gravity.auraProjectileDamageMul : 1), p);
        if (hit && e.active && p.gravityReturned) {
          const mask = p.gravityElementMask;
          const bd = this.cfg.gravity.shieldBurnDamage * (p.gravityAuraWeak ? this.cfg.gravity.auraBurnDamageMul : 1);
          const bi = this.cfg.burn.interval;
          const steam = (mask & 3) === 3 ? 1 : 0;
          if ((mask & 1) && this.ignite) this.ignite(e, bd, bi);
          if ((mask & 2) && this.chill && e.active) this.chill(e, steam, mask & 1 ? bd : 0, bi);
          if ((mask & 4) && this.zap && e.active) this.zap(e, mask & 1 ? bd : 0, bi, mask & 2 ? 1 : 0, steam);
        }
        break;
      }
    }
  }
}
