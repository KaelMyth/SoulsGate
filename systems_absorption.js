// Поглощение: раз в interval секунд фиксирует до N видимых целей (N усиливают Х2/Х3).
// После постановки кругов новые враги не перехватывают цель; урон и вспышки происходят одновременно.
// Вампиризм на Поглощении лечит за реально снятое здоровье каждой поражённой цели.
// Цвета: нейтральный, огонь, лёд, пар, молния, молния+огонь, молния+лёд, все три.
// Вампиризм приоритетно делает кольцо и вспышку красными (как в существующей связке).
const COLORS = ['215,230,255', '255,138,61', '143,216,255', '217,230,242',
  '255,228,90', '255,172,80', '123,215,255', '255,255,255'];

export class Absorption {
  /** o: { config, hero, enemies, camera, combat, modifiers } */
  constructor(o) {
    this.cfg = o.config;
    this.hero = o.hero;
    this.enemies = o.enemies;
    this.camera = o.camera;
    this.combat = o.combat;
    this.modifiers = o.modifiers;
    this.ignite = o.ignite || null;
    this.chill = o.chill || null;
    this.zap = o.zap || null;
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
    this.element = 0;
    this.color = COLORS[0];
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
    const element = (mods.absorption.burn ? 1 : 0)
      | (mods.absorption.frost ? 2 : 0)
      | (mods.absorption.lightning ? 4 : 0);
    this.element = element;
    this.color = this.vampiric ? '255,50,75' : COLORS[element];
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
      this.flashes.push({ x: e.x, y: e.y, r: this.flashR, time: this.flash, vampiric: this.vampiric, color: this.color });
      const hpBefore = Math.max(0, e.hp);
      const baseDamage = A.damage * (mods.absorption.damage || 1);
      // Молния даёт стандартный бонус +5 к прямому удару за каждый мод Молнии.
      const damage = baseDamage + (mods.absorption.lightning
        ? this.cfg.shock.attackBonus * (mods.lightning ? mods.lightning.count : 1) : 0);
      const dealt = this.combat.damageEnemy(e, damage, this.source, null);
      if (dealt && e.active) {
        // Максимум стаков на КАЖДУЮ цель одним срабатыванием Поглощения.
        // Через общие API сохраняются иммунитеты, обычный огонь, заморозка,
        // паровые взрывы и цепной разряд Молнии.
        const burn = mods.absorption.burn;
        const frost = mods.absorption.frost;
        const lightning = mods.absorption.lightning;
        const bd = burn ? baseDamage * this.cfg.burn.damageFrac * (mods.burn ? mods.burn.damage : 1) : 0;
        const bi = burn ? this.cfg.burn.interval / (mods.burn ? mods.burn.rate : 1) : 0;
        const steam = burn && frost ? (mods.steam ? mods.steam.damage : 1) : 0;
        if (burn && this.ignite) {
          const remaining = Math.max(0, this.cfg.burn.maxStacks - (e.burnT > 0 ? e.burnStacks || 0 : 0));
          for (let k = 0; k < remaining && e.active; k++) this.ignite(e, bd, bi);
          // При максимальных стаках обновляем длительность обычным поджогом.
          if (!remaining && e.active) this.ignite(e, bd, bi);
        }
        if (frost && this.chill) {
          const remaining = Math.max(0, this.cfg.frost.maxStacks - (e.frostStacks || 0));
          for (let k = 0; k < remaining && e.active; k++) this.chill(e, steam, bd, bi);
        }
        if (lightning && this.zap) {
          const remaining = Math.max(0, this.cfg.shock.maxStacks - (e.shockStacks || 0));
          for (let k = 0; k < remaining && e.active; k++) this.zap(e, bd, bi, frost ? 1 : 0, steam, mods.lightning ? mods.lightning.mult : 1);
        }
      }
      if (dealt && this.vampiric && this.hero.active) {
        const effective = Math.max(0, hpBefore - Math.max(0, e.hp));
        this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + effective * Math.max(0, A.lifesteal));
      }
    }
    this.targets.length = 0;
  }
}
