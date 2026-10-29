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
  }

  begin(mods) {
    this.mods = mods || {};
    this.source.el = (this.mods.burn ? 1 : 0) | (this.mods.frost ? 2 : 0) | (this.mods.lightning ? 4 : 0);
    this.hitGenerations.clear();
    this.active = true;
  }

  reset() {
    this.active = false;
    this.mods = null;
    this.hitGenerations.clear();
    this.source.el = 0;
  }

  update() {
    const h = this.hero;
    if (!this.active || !h.active || h.incarnationT <= 0) return;
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
