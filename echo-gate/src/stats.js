// Характеристики героя: здоровье, опыт, уровень, счётчик убийств. Чистая логика без графики (тестируется в Node).
// Числа берутся из CONFIG.hero и CONFIG.xp каждый кадр, поэтому ползунки настроек действуют сразу.
export class Stats {
  constructor(cfg) {
    this.cfg = cfg;
    this.onLevel = null; // (новый уровень) => void
    this.reset();
  }

  reset() {
    this.bonus = { hp: 0, speed: 0, pickup: 0, xp: 0, block: 0 }; // усиления за уровни, доли (0.05 = +5%)
    this.maxHp = this.baseMax();
    this.hp = this.maxHp;
    this.level = 1;
    this.xp = 0;
    this.kills = 0;
    this.upgrades = { power: 0, speed: 0, range: 0 }; // кристаллы усиления, вложенные в части посоха
    this.loot = { power: 0, skill: 0, page: 0 }; // подобранные кристаллы усиления, умения и обрывки страниц
    this.soulMods = { soul10: 0, soul50: 0, soul100: 0 }; // множители только на текущий забег
    this.levelFlash = 0; // с: сколько ещё показывать «Уровень N»
  }

  /** Опыт, нужный для перехода с уровня level на следующий. */
  xpNeed(level = this.level) {
    const X = this.cfg.xp;
    const i = level - 1;
    return Math.max(1, Math.round(X.base + X.linear * i + X.quad * i * i));
  }

  get xpFraction() { return Math.min(1, this.xp / this.xpNeed()); }
  get hpFraction() { return this.maxHp > 0 ? Math.max(0, Math.min(1, this.hp / this.maxHp)) : 0; }

  /** Ползунок максимума здоровья: текущее здоровье меняется на ту же величину (не ниже 1, не выше максимума). */
  /** Максимум здоровья с усилениями: +N% от базового. */
  baseMax() { return Math.max(1, Math.round(this.cfg.hero.maxHp * (1 + this.bonus.hp))); }

  syncMax() {
    const m = this.baseMax();
    if (m === this.maxHp) return;
    this.hp = Math.max(Math.min(1, m), Math.min(m, this.hp + (m - this.maxHp)));
    this.maxHp = m;
  }

  update(dt) {
    this.syncMax();
    if (this.cfg.hero.regen > 0 && this.hp > 0) this.heal(this.cfg.hero.regen * dt);
    this.levelFlash = Math.max(0, this.levelFlash - dt);
  }

  heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); }
  hurt(n) { this.hp = Math.max(0, this.hp - n); return this.hp <= 0; }

  /** Опыт n (с множителем gainMult); может поднять сразу несколько уровней. */
  addXp(n) {
    this.xp += n * this.cfg.xp.gainMult * (1 + this.bonus.xp);
    while (this.xp >= this.xpNeed()) {
      this.xp -= this.xpNeed();
      this.level++;
      this.levelFlash = this.cfg.xp.flashTime;
      if (this.onLevel) this.onLevel(this.level);
    }
  }

  /** Убит враг: счётчик и опыт. */
  kill() {
    this.kills++;
    this.addXp(this.cfg.xp.perKill);
  }

  /** Кристаллы усиления в запасе: подобраны, но ещё не вложены. */
  get pendingPower() { return this.loot.power - this.upgrades.power - this.upgrades.speed - this.upgrades.range; }

  /** Вложить один кристалл в часть посоха ('power' | 'speed' | 'range'). false, если нечего вкладывать. */
  upgrade(part) {
    if (!(part in this.upgrades) || this.pendingPower <= 0) return false;
    this.upgrades[part]++;
    return true;
  }

  /** Подобрана добыча: опыт сразу в шкалу, остальное в счётчики. */
  collect(type, value = 1) {
    if (type === 'xp') this.addXp(value);
    else if (type in this.loot) this.loot[type] += value;
  }
}
