// Воплощение: комета наносит один контактный удар каждому врагу за применение.
// Проверяется весь отрезок движения героя, чтобы на высокой скорости не было проскоков.
export function incarnationSegmentHit(x0, y0, x1, y1, x, y, radius) {
  const dx = x1 - x0, dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 1e-9 ? Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / len2)) : 0;
  const ex = x0 + dx * t - x, ey = y0 + dy * t - y;
  return ex * ex + ey * ey <= radius * radius;
}

export class Incarnation {
  constructor({ config, hero, enemies, combat, igniteMax, chill, zap }) {
    this.config = config;
    this.hero = hero;
    this.enemies = enemies;
    this.combat = combat;
    this.igniteMax = igniteMax;
    this.chill = chill;
    this.zap = zap;
    this.source = { active: true, incarnation: true, el: 0 };
    // В пуле объект врага может использоваться повторно: учитываем его поколение gen.
    this.hitGenerations = new Map();
    this.mods = null;
    this.active = false;
    this.bladeItems = [];
    this.bladeQueue = 0;
    this.bladeTimer = 0;
  }

  begin(mods) {
    this.mods = mods || {};
    this.source.el = (this.mods.burn ? 1 : 0) | (this.mods.frost ? 2 : 0) | (this.mods.lightning ? 4 : 0);
    this.hitGenerations.clear();
    this.bladeItems.length = 0;
    const S = this.config.skills.incarnation;
    this.bladeQueue = this.mods.blades ? Math.max(S.bladeBaseCount, Math.round(S.bladeBaseCount + S.bladeMultiplierBase * ((this.mods.blades.max || 1) - 1))) : 0;
    this.bladeTimer = S.bladeLaunchGap;
    if (this.bladeQueue) for (let i = 0; i < this.bladeQueue; i++) this.bladeItems.push({ state: 'orbit', x: this.hero.x, y: this.hero.y, a: i * Math.PI * 2 / this.bladeQueue, off: i * Math.PI * 2 / this.bladeQueue, kind: this.mods.frost && this.mods.burn ? 3 : this.mods.burn ? 2 : this.mods.frost ? 1 : 0, zap: this.mods.lightning ? 1 : 0, age: 0, incarnationBlade: true });
    this.active = true;
  }

  reset() {
    this.active = false;
    this.mods = null;
    this.hitGenerations.clear();
    this.source.el = 0;
    this.bladeQueue = 0;
    this.bladeItems.length = 0;
  }

  update(dt = 0) {
    const h = this.hero;
    if (!h.active) return;
    if (this.bladeQueue || this.bladeItems.length) this.updateBlades(dt);
    if (!this.active || h.incarnationT <= 0 || this.bladeQueue || this.mods?.blades) return;
    const S = this.config.skills.incarnation;
    const enemies = this.enemies.items;
    const radius = h.radius + Math.max(0, S.contactPadding);
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e || !e.active || this.hitGenerations.get(e) === (e.gen ?? 0)) continue;
      if (!incarnationSegmentHit(h.prevX, h.prevY, h.x, h.y, e.x, e.y, radius + e.radius)) continue;
      this.hitGenerations.set(e, e.gen ?? 0);
      const hit = this.combat.damageEnemy(e, S.contactDamage, this.source, null);
      if (!hit || !e.active) continue;
      this.applyElements(e);
    }
  }

  updateBlades(dt) {
    const S = this.config.skills.incarnation, h = this.hero;
    const gap = Math.max(0.01, S.bladeLaunchGap);
    if (this.bladeQueue && h.incarnationT > 0) {
      this.bladeTimer -= dt;
      if (this.bladeTimer <= 0) {
        this.bladeTimer += gap;
        const b = this.bladeItems.find(b => b.state === 'orbit');
        if (b) {
          const targets = this.enemies.items.filter(e => e.active && e.hp > 0 && Math.hypot(e.x - h.x, e.y - h.y) <= S.bladeRange);
          targets.sort((a, z) => Math.hypot(a.x-h.x,a.y-h.y) - Math.hypot(z.x-h.x,z.y-h.y));
          const t = targets[0];
          const a = t ? Math.atan2(t.y - h.y, t.x - h.x) : h.facing;
          b.x = h.x; b.y = h.y; b.a = a; b.vx = Math.cos(a) * S.bladeSpeed; b.vy = Math.sin(a) * S.bladeSpeed;
          b.state = 'fly'; b.age = 0;
          this.bladeQueue--;
          if (this.bladeQueue === 0) {
            h.incarnationT = 0;
            h.incarnationSpeedMul = 1;
            h.incarnationInertia = 0;
            this.active = false;
          }
        }
      }
      // Воплощение клинков длится до последнего вылета, независимо от обычных 5 секунд.
      if (this.bladeQueue) h.incarnationT = Math.max(h.incarnationT, gap + 0.02);
    }
    for (const b of this.bladeItems) {
      b.age += dt;
      if (b.state === 'orbit') {
        b.a += dt * 2;
        b.x = h.x + Math.cos(b.a + b.off) * 17;
        b.y = h.y + Math.sin(b.a + b.off) * 17;
      } else if (b.state === 'fly') {
        const x = b.x, y = b.y;
        b.x += b.vx * dt; b.y += b.vy * dt;
        for (const e of this.enemies.items) {
          if (!e.active || e.hp <= 0 || !incarnationSegmentHit(x,y,b.x,b.y,e.x,e.y,e.radius + 7)) continue;
          const hit = this.combat.damageEnemy(e, this.config.blades.damage * (this.mods?.blades?.damage || 1), this.source, null);
          if (hit && e.active) this.applyElements(e);
          b.state = 'gone';
          break;
        }
        if (b.age > S.bladeRange / Math.max(1,S.bladeSpeed)) b.state = 'gone';
      }
    }
    let j = 0;
    for (const b of this.bladeItems) if (b.state !== 'gone') this.bladeItems[j++] = b;
    this.bladeItems.length = j;
  }

  /** Реакции проходят через штатные Горение/Мороз/Электризацию (включая Пар и красные дуги). */
  applyElements(e) {
    const m = this.mods || {};
    const cfg = this.config;
    const fire = !!m.burn, ice = !!m.frost, lightning = !!m.lightning;
    const bd = fire ? cfg.skills.incarnation.burnTickDamage * (m.burn.damage || 1) : 0;
    const bi = fire ? cfg.burn.interval / Math.max(0.01, m.burn.rate || 1) : 0;
    const steam = fire && ice ? (m.steam ? m.steam.damage : 1) : 0;
    const chain = lightning ? Math.max(1, m.lightning.mult || 1) : 1;

    if (fire && e.active && this.igniteMax) this.igniteMax(e, bd, bi);
    // Электризованный враг получает небесный удар при заморозке.
    // Если электризация ещё отсутствует, создаём первый заряд ДО Мороза,
    // а остальные добавляем после, чтобы запустить и обычный цепной разряд.
    if (lightning && ice && e.active && (e.shockStacks || 0) === 0 && this.zap)
      this.zap(e, bd, bi, 1, steam, chain);
    if (ice && e.active && this.chill && e.freezeT <= 0) {
      const remaining = Math.max(0, cfg.frost.maxStacks - (e.frostStacks || 0));
      for (let i = 0; i < remaining && e.active && e.freezeT <= 0; i++)
        this.chill(e, steam, bd, bi);
    }
    if (lightning && e.active && this.zap) {
      const remaining = Math.max(0, cfg.shock.maxStacks - (e.shockStacks || 0));
      for (let i = 0; i < remaining && e.active; i++)
        this.zap(e, bd, bi, ice ? 1 : 0, steam, chain);
    }
  }
}
