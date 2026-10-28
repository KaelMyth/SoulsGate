// Поглощение: отдельный мод на ядро щита.
// Раз в interval секунд выбирает самого дальнего видимого врага за minDistance,
// отмечает его кругом на telegraph секунд и наносит единичный сильный удар.
// Заглушка графики живёт отдельно в render_renderer.js.
export class Absorption {
  /** o: { config, hero, enemies, camera, combat, modifiers } */
  constructor(o) {
    this.cfg = o.config;
    this.hero = o.hero;
    this.enemies = o.enemies;
    this.camera = o.camera;
    this.combat = o.combat;
    this.modifiers = o.modifiers;
    this.source = { absorption: true, active: true };
    this.reset();
  }

  reset() {
    this.active = false;
    this.vampiric = false;
    this.flashVampiric = false;
    this.source.vampiric = false;
    this.timer = 0;
    this.target = null;
    this.flash = 0;
    this.flashX = 0;
    this.flashY = 0;
    this.flashR = 0;
  }

  /** Дальше minDistance от героя, центр врага внутри камеры (с отступом от края). */
  eligible(e) {
    if (!e || !e.active || !this.hero.active) return false;
    const A = this.cfg.absorption;
    const dx = e.x - this.hero.x;
    const dy = e.y - this.hero.y;
    if (dx * dx + dy * dy < A.minDistance * A.minDistance) return false;
    const margin = Math.max(0, A.viewMargin);
    return Math.abs(e.x - this.camera.x) <= this.camera.viewW * 0.5 - margin
      && Math.abs(e.y - this.camera.y) <= this.camera.viewH * 0.5 - margin;
  }

  /** Если есть несколько целей, выбираем самую дальнюю от героя. */
  selectTarget() {
    const en = this.enemies.items;
    let farthest = null;
    let bestD = -1;
    for (let i = 0; i < en.length; i++) {
      const e = en[i];
      if (!this.eligible(e)) continue;
      const dx = e.x - this.hero.x;
      const dy = e.y - this.hero.y;
      const d = dx * dx + dy * dy;
      if (d > bestD) { bestD = d; farthest = e; }
    }
    return farthest;
  }

  update(dt) {
    const mods = this.modifiers ? this.modifiers(this.cfg.block.core) : null;
    if (!mods || !mods.absorption || !this.hero.active) { this.reset(); return; }
    const A = this.cfg.absorption;
    this.vampiric = !!mods.absorption.vampirism;
    const interval = Math.max(0.1, A.interval);
    const telegraph = Math.min(interval, Math.max(0.05, A.telegraph));
    if (!this.active) { this.active = true; this.timer = interval; }
    this.flash = Math.max(0, this.flash - dt);

    // Цель умерла, приблизилась или вышла из кадра — отменяем метку и ищем другую.
    if (this.target && !this.eligible(this.target)) {
      this.target = null;
      this.timer = telegraph;
    }

    this.timer -= dt;
    if (!this.target && this.timer <= telegraph) {
      this.target = this.selectTarget();
      // Если подходящих врагов нет, ждём появления; без скрытого удара по невидимым целям.
      this.timer = telegraph;
    }
    if (!this.target || this.timer > 0) return;

    const e = this.target;
    this.target = null;
    this.timer = interval;
    if (!this.eligible(e)) return;
    this.flash = Math.max(0, A.flashTime);
    this.flashVampiric = this.vampiric;
    this.flashX = e.x;
    this.flashY = e.y;
    this.flashR = e.radius + A.ringPadding;
    const hpBefore = Math.max(0, e.hp);
    this.source.vampiric = this.vampiric; // признак нужен визуальному эффекту попадания
    const dealt = this.combat.damageEnemy(e, A.damage * mods.absorption.count, this.source, null);
    if (dealt && this.vampiric && this.hero.active) {
      // Нельзя лечиться от лишнего урона: если у врага 5 HP, удар на 90 даёт лечение от 5.
      // Читаем HP после Combat, поэтому учитываются также снижение урона и его отмена.
      const effective = Math.max(0, hpBefore - Math.max(0, e.hp));
      this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + effective * Math.max(0, A.lifesteal));
    }
  }
}
