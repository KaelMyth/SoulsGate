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
    this.aura = o.aura || null; // только читаем радиус и активность; systems_aura.js не меняем
    this.rnd = o.rnd || Math.random;
    this.auraCandidates = [];
    this.source = { absorption: true, active: true };
    this.targets = []; // зафиксированные цели текущего удара
    this.candidates = []; // временный буфер для выбора наиболее дальних врагов
    this.flashes = []; // отдельная заглушка вспышки для каждой поражённой цели
    this.bladeMarks = []; // зафиксированные цели: тройка клинков → отсчёт 1 с
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
    this.releaseGravity();
    this.targets.length = 0;
    this.candidates.length = 0;
    this.flashes.length = 0;
    this.bladeMarks.length = 0;
    this.bladeCounters = new WeakMap(); // учитываем поколение сущности при повторном использовании пула
    this.bladesConnected = false;
    this.auraCandidates.length = 0;
    this.auraTimer = 0;
    this.auraPeriod = 0;
    this.auraConnected = false;
    this.flash = 0;
    this.flashX = 0;
    this.flashY = 0;
    this.flashR = 0;
  }

  releaseGravity() {
    for (const e of this.targets) if (e) e.absorptionGravity = false;
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
    this.releaseGravity();
    targets.length = 0;
    for (let i = 0, n = Math.min(list.length, limit); i < n; i++) targets.push(list[i]);
    this.target = targets[0] || null;
  }


  /** Учитываем только попадания клинков, которые действительно находятся под Поглощением. */
  recordBladeHit(e) {
    if (!e || !e.active || !this.hero.active) return false;
    const m = this.modifiers ? this.modifiers(this.cfg.block.core) : null;
    if (!m || !m.absorption || !m.absorption.blades) return false;
    this.bladesConnected = true; // отслеживаем связь даже если update ещё не запускался
    const gen = e.gen;
    if (this.bladeMarks.some(mark => mark.enemy === e && mark.gen === gen)) return false;
    let count = this.bladeCounters.get(e);
    if (!count || count.gen !== gen) count = { gen, hits: 0 };
    count.hits++;
    if (count.hits < Math.max(1, this.cfg.absorption.bladeHits || 3)) {
      this.bladeCounters.set(e, count);
      return false;
    }
    this.bladeCounters.delete(e);
    if (this.bladeMarks.length >= Math.max(1, this.cfg.absorption.maxTargets || 64)) return false;
    this.bladeMarks.push({
      enemy: e, gen, remaining: Math.max(0.05, this.cfg.absorption.bladeDelay || 1),
      total: Math.max(0.05, this.cfg.absorption.bladeDelay || 1), fresh: true,
    });
    return true;
  }

  /** Все варианты Поглощения используют единый урон, Вампиризм и стихии. */
  strike(e, mods, damageScale = 1, suppressPhantom = false) {
    if (!e || !e.active || !this.hero.active) return false;
    const A = this.cfg.absorption;
    const vampiric = !!mods.absorption.vampirism;
    const element = (mods.absorption.burn ? 1 : 0) |
      (mods.absorption.frost ? 2 : 0) | (mods.absorption.lightning ? 4 : 0);
    const color = vampiric ? '255,50,75' : COLORS[element];
    this.flash = Math.max(0, A.flashTime);
    this.flashVampiric = vampiric;
    this.flashX = e.x;
    this.flashY = e.y;
    this.flashR = e.radius + A.ringPadding;
    this.flashes.push({ x: e.x, y: e.y, r: this.flashR, time: this.flash, vampiric, color });
    const hpBefore = Math.max(0, e.hp);
    const baseDamage = A.damage * (mods.absorption.damage || 1) * damageScale;
    const damage = baseDamage + (mods.absorption.lightning
      ? this.cfg.shock.attackBonus * (mods.lightning ? mods.lightning.count : 1) : 0);
    this.source.vampiric = vampiric;
    const dealt = this.combat.damageEnemy(e, damage, this.source, null);
    if (dealt && mods.absorption.pierce) {
      const radius = A.pierceRadius || 52;
      for (const other of this.enemies.items) {
        if (!other.active || other === e || Math.hypot(other.x-e.x,other.y-e.y)>radius+other.radius)continue;
        this.combat.damageEnemy(other,damage*(A.pierceDamageFrac||0.4),this.source,null);
      }
      this.flashes.push({x:e.x,y:e.y,r:radius,time:A.flashTime,vampiric:false,color:'142,225,255'});
    }
    if (dealt && e.active) {
      const burn = mods.absorption.burn;
      const frost = mods.absorption.frost;
      const lightning = mods.absorption.lightning;
      const bd = burn ? baseDamage * this.cfg.burn.damageFrac * (mods.burn ? mods.burn.damage : 1) : 0;
      const bi = burn ? this.cfg.burn.interval / (mods.burn ? mods.burn.rate : 1) : 0;
      const steam = burn && frost ? (mods.steam ? mods.steam.damage : 1) : 0;
      if (burn && this.ignite) {
        const remaining = Math.max(0, this.cfg.burn.maxStacks - (e.burnT > 0 ? e.burnStacks || 0 : 0));
        for (let k = 0; k < remaining && e.active; k++) this.ignite(e, bd, bi);
        if (!remaining && e.active) this.ignite(e, bd, bi);
      }
      if (frost && this.chill) {
        const remaining = Math.max(0, this.cfg.frost.maxStacks - (e.frostStacks || 0));
        for (let k = 0; k < remaining && e.active; k++) this.chill(e, steam, bd, bi);
      }
      if (lightning && this.zap) {
        const remaining = Math.max(0, this.cfg.shock.maxStacks - (e.shockStacks || 0));
        for (let k = 0; k < remaining && e.active; k++)
          this.zap(e, bd, bi, frost ? 1 : 0, steam, mods.lightning ? mods.lightning.mult : 1);
      }
    }
    if (dealt && vampiric && this.hero.active) {
      const effective = Math.max(0, hpBefore - Math.max(0, e.hp));
      this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + effective * Math.max(0, A.lifesteal));
    }
    if (dealt && !suppressPhantom && mods.absorption.phantom && this.onPhantom) this.onPhantom(e,mods);
    return dealt;
  }

  /** Поглощение на Ауре: каждые 2 с (быстрее с Ускорением) случайные цели внутри реального радиуса Ауры.
   * Х2/Х3 увеличивают количество уникальных целей, а не урон или число стаков по одной.
   * Механика не вызывает тики Ауры и не вмешивается в основной 3-секундный цикл Поглощения. */
  updateAura(dt, mods) {
    const a = mods.absorption;
    const aura = this.aura;
    if (!a.auraCount || !mods.aura || !aura || !aura.active) {
      this.auraConnected = false;
      this.auraTimer = 0;
      this.auraPeriod = 0;
      return;
    }
    const A = this.cfg.absorption;
    const period = Math.max(0.05, Math.max(0.05, A.auraInterval || 2) / Math.max(0.01, a.rate || 1));
    if (!this.auraConnected) {
      this.auraConnected = true;
      this.auraTimer = period;
    } else if (this.auraPeriod > 0 && period !== this.auraPeriod) {
      // Смена Ускорения сохраняет относительный прогресс до следующего удара.
      this.auraTimer *= period / this.auraPeriod;
    }
    this.auraPeriod = period;
    this.auraTimer -= dt;
    if (this.auraTimer > 0) return;
    this.auraTimer += period;
    if (this.auraTimer <= 0) this.auraTimer = period; // защита от больших dt

    const h = this.hero;
    const list = this.auraCandidates;
    list.length = 0;
    const radius = aura.radius; // уже включает Х2/Х3 и другие изменения радиуса Ауры
    const enemies = this.enemies.items;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e || !e.active) continue;
      const dx = e.x - h.x, dy = e.y - h.y;
      const reach = radius + e.radius; // совпадает с попаданием обычной Ауры
      if (dx * dx + dy * dy <= reach * reach) list.push(e);
    }
    const count = Math.min(Math.max(1, Math.floor(A.maxTargets || 64)),
      Math.max(1, Math.floor(a.auraTargets || a.auraCount)));
    // Частичная перестановка Фишера—Йетса: равномерная выборка без повторов.
    for (let i = 0, n = Math.min(count, list.length); i < n; i++) {
      const j = i + Math.min(list.length - i - 1, Math.floor(Math.max(0, this.rnd()) * (list.length - i)));
      const t = list[i]; list[i] = list[j]; list[j] = t;
      this.strike(list[i], mods); // полное Поглощение: Вампиризм, Мощь, все стихии
    }
  }

  update(dt) {
    const mods = this.modifiers ? this.modifiers(this.cfg.block.core) : null;
    if (!mods || !mods.absorption || !this.hero.active) { this.reset(); return; }
    const A = this.cfg.absorption;
    this.vampiric = !!mods.absorption.vampirism;
    if (!mods.absorption.gravity || !this.aiming) this.releaseGravity();
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

    if (!mods.absorption.blades && this.bladesConnected) {
      // При снятии клинков сбрасываются и готовые метки, и неполные серии 1/3, 2/3.
      this.bladeMarks.length = 0;
      this.bladeCounters = new WeakMap();
    }
    this.bladesConnected = !!mods.absorption.blades;
    this.updateAura(dt, mods);
    // Отдельный бонусный удар после трёх попаданий клинков, не сбивает основной цикл.
    for (let i = this.bladeMarks.length - 1; i >= 0; i--) {
      const mark = this.bladeMarks[i];
      if (!mark.enemy.active || mark.enemy.gen !== mark.gen || !mods.absorption.blades) {
        this.bladeMarks.splice(i, 1);
        continue;
      }
      if (mark.fresh) { mark.fresh = false; continue; }
      mark.remaining -= dt;
      if (mark.remaining <= 0) {
        this.bladeMarks.splice(i, 1);
        this.strike(mark.enemy, mods);
      }
    }

    // Поглощение, прикреплённое только к Ауре, не запускает ещё и стандартный
    // 3-секундный удар по дальним целям. Прямой мод на щите работает как раньше.
    if (!mods.absorption.standaloneCount) {
      this.releaseGravity();
      this.aiming = false;
      this.target = null;
      this.targets.length = 0;
      this.timer = interval;
      return;
    }
    this.timer -= dt;
    if (!this.aiming && this.timer <= telegraph) {
      const max = Math.max(1, Math.floor(A.maxTargets || 64));
      const count = Math.min(max, Math.max(1, Math.floor(mods.absorption.standaloneTargets || mods.absorption.standaloneCount || 1)));
      this.selectTargets(count);
      // Нет видимых врагов — ждём. Следующая найденная цель получит полное предупреждение.
      this.timer = telegraph;
      if (this.targets.length === 0) return;
      this.aiming = true;
      if (mods.absorption.gravity) for (const e of this.targets) if (e && e.active) e.absorptionGravity = true;
    }
    if (!this.aiming || this.timer > 0) return;

    // Список фиксирован: погибшие цели пропускаем, новых в середине заряда не добавляем.
    // Х2/Х3 увеличивают только число целей; Мощь усиливает урон каждой.
    this.releaseGravity();
    this.aiming = false;
    this.timer = interval;
    this.target = null;
    for (let i = 0; i < this.targets.length; i++) this.strike(this.targets[i], mods);
    this.targets.length = 0;
  }
}
