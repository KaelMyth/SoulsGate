// Поглощение: раз в interval секунд фиксирует до N видимых целей (N усиливают Х2/Х3).
// После постановки кругов новые враги не перехватывают цель; урон и вспышки происходят одновременно.
// Вампиризм на Поглощении лечит за реально снятое здоровье каждой поражённой цели.
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
    this.targets = []; // зафиксированные цели текущего удара
    this.candidates = []; // временный буфер для выбора наиболее дальних врагов
    this.flashes = []; // отдельная заглушка вспышки для каждой поражённой цели
    this.reset();
  }

  reset() {
    this.active = false;
    this.aiming = false;
    this.vampiric = false;
    this.flashVampiric = false;
    this.source.vampiric = false;
    this.timer = 0;
    this.rate = 1; // прежняя скорость для сохранения прогресса каста при смене билда
    this.castTime = this.cfg.absorption.telegraph;
    this.target = null; // совместимость со старой системой и тестами
    this.targets.length = 0;
    this.candidates.length = 0;
    this.flashes.length = 0;
    this.flash = 0;
    this.flashX = 0;
    this.flashY = 0;
    this.flashR = 0;
  }

  /** Новая цель должна быть видимой; после фиксации она остаётся целью даже при движении. */
  eligible(e) {
    if (!e || !e.active || !this.hero.active) return false;
    const margin = Math.max(0, this.cfg.absorption.viewMargin);
    return Math.abs(e.x - this.camera.x) <= this.camera.viewW * 0.5 - margin
      && Math.abs(e.y - this.camera.y) <= this.camera.viewH * 0.5 - margin;
  }

  /** Выбирает уникальных видимых врагов по убыванию расстояния; вызывается лишь один раз за заряд. */
  selectTargets(limit) {
    const list = this.candidates;
    list.length = 0;
    const en = this.enemies.items;
    for (let i = 0; i < en.length; i++) if (this.eligible(en[i])) list.push(en[i]);

    const hx = this.hero.x;
    const hy = this.hero.y;
    list.sort((a, b) => {
      const ax = a.x - hx, ay = a.y - hy;
      const bx = b.x - hx, by = b.y - hy;
      return bx * bx + by * by - ax * ax - ay * ay;
    });
    const targets = this.targets;
    targets.length = 0;
    for (let i = 0, n = Math.min(list.length, limit); i < n; i++) targets.push(list[i]);
    this.target = targets[0] || null;
  }

  update(dt) {
    const mods = this.modifiers ? this.modifiers(this.cfg.block.core) : null;
    if (!mods || !mods.absorption || !this.hero.active) { this.reset(); return; }
    const A = this.cfg.absorption;
    this.vampiric = !!mods.absorption.vampirism;
    const rate = Math.max(0.01, mods.absorption.rate || 1);
    const interval = Math.max(0.05, A.interval / rate);
    const telegraph = Math.min(interval, Math.max(0.02, A.telegraph / rate));
    if (!this.active) {
      this.active = true;
      this.timer = interval;
    } else if (rate !== this.rate) {
      // Изменение билда не сбивает ни прицеливание, ни текущий прогресс перезарядки.
      const oldInterval = Math.max(0.05, A.interval / this.rate);
      const oldTelegraph = Math.min(oldInterval, Math.max(0.02, A.telegraph / this.rate));
      this.timer *= this.aiming ? telegraph / oldTelegraph : interval / oldInterval;
    }
    this.rate = rate;
    this.castTime = telegraph;

    this.flash = Math.max(0, this.flash - dt);
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.time -= dt;
      if (f.time <= 0) this.flashes.splice(i, 1);
    }

    this.timer -= dt;
    if (!this.aiming && this.timer <= telegraph) {
      const max = Math.max(1, Math.floor(A.maxTargets || 64));
      const count = Math.min(max, Math.max(1, Math.floor(mods.absorption.targets || mods.absorption.count || 1)));
      this.selectTargets(count);
      // Нет видимых врагов — ждём. Следующая найденная цель получит полное предупреждение.
      this.timer = telegraph;
      if (this.targets.length === 0) return;
      this.aiming = true;
    }
    if (!this.aiming || this.timer > 0) return;

    // Список фиксирован: погибшие цели пропускаем, новых в середине заряда не добавляем.
    // Х2/Х3 увеличивают только число целей; Мощь усиливает урон каждой.
    this.aiming = false;
    this.timer = interval;
    this.target = null;
    this.source.vampiric = this.vampiric;
    for (let i = 0; i < this.targets.length; i++) {
      const e = this.targets[i];
      if (!e || !e.active) continue;
      this.flash = Math.max(0, A.flashTime);
      this.flashVampiric = this.vampiric;
      this.flashX = e.x;
      this.flashY = e.y;
      this.flashR = e.radius + A.ringPadding;
      this.flashes.push({ x: e.x, y: e.y, r: this.flashR, time: this.flash, vampiric: this.vampiric });
      const hpBefore = Math.max(0, e.hp);
      const dealt = this.combat.damageEnemy(e, A.damage * (mods.absorption.damage || 1), this.source, null);
      if (dealt && this.vampiric && this.hero.active) {
        const effective = Math.max(0, hpBefore - Math.max(0, e.hp));
        this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + effective * Math.max(0, A.lifesteal));
      }
    }
    this.targets.length = 0;
  }
}
