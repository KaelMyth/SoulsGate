// Опыт: камешки выпадают из убитых врагов, герой подбирает их (рядом камни сами подлетают),
// накопленный опыт даёт уровни. За уровень пока ничего не даётся: только событие и вспышка.
//
// Что падает, описано данными: у врага в конфиге поле drop: 'green' | 'red' (ключ из config.gems).
// Зелёный камешек у обычных врагов, красный у быка, и он даёт в 5 раз больше опыта.
//
// События: 'gem:dropped' { gem }, 'gem:collected' { gem, value }, 'xp:gained' { amount, xp, level },
//          'hero:levelup' { level }.
// На 'hero:levelup' позже встанет окно выбора улучшений (этап 6, вторая часть).

export function createGem() {
  return {
    active: false, x: 0, y: 0, prevX: 0, prevY: 0, vx: 0, vy: 0,
    radius: 4, value: 1, kind: 'green', def: null, age: 0, pull: 0, speed: 0,
    inspired: false, inspireT: 0, inspireX: 0, inspireY: 0, inspireSeed: 0,
  };
}

export function resetGem(g) {
  g.active = false;
  g.def = null;
  g.inspired = false;
  g.inspireT = 0;
}

export class Xp {
  /** o: { config, hero, gems (EntityPool), bus, rnd } */
  constructor(o) {
    this.cfg = o.config;
    this.hero = o.hero;
    this.gems = o.gems;
    this.bus = o.bus;
    this.rnd = o.rnd || Math.random;
    this.inspiration = null; // третье умение: задаётся Game после создания объектов
    this.level = 1;
    this.xp = 0;        // накоплено в текущем уровне
    this.total = 0;     // всего за забег
    this.levelFlash = 0; // сколько ещё показывать «Уровень N!»
    this.bus.on('enemy:killed', ({ enemy }) => this.drop(enemy));
  }

  reset() {
    this.level = 1;
    this.xp = 0;
    this.total = 0;
    this.levelFlash = 0;
  }

  get maxLevel() {
    return this.cfg.xp.table.length + 1;
  }

  /** Сколько опыта нужно, чтобы выйти с текущего уровня на следующий; 0 на максимальном. */
  get need() {
    return this.level >= this.maxLevel ? 0 : this.cfg.xp.table[this.level - 1];
  }

  /** Доля шкалы 0..1 (на максимальном уровне шкала полная). */
  get fraction() {
    const n = this.need;
    return n > 0 ? Math.min(1, this.xp / n) : 1;
  }

  /** Выпал камень из врага: кладём рядом с местом гибели. */
  drop(enemy) {
    const kind = this.rnd() < (this.cfg.gems.healDropChance || 0) ? 'heal' : enemy.def.drop;
    const def = kind && this.cfg.gems[kind];
    if (!def) return null;
    // Потолок камней: если их слишком много, самый старый сразу засчитывается герою, опыт не пропадает.
    const lim = this.cfg.limits.maxGems;
    if (this.gems.count >= lim) this.absorbOldest();
    const g = this.gems.spawn();
    const a = this.rnd() * Math.PI * 2;
    const r = this.rnd() * 9;
    g.x = g.prevX = enemy.x + Math.cos(a) * r;
    g.y = g.prevY = enemy.y + Math.sin(a) * r;
    g.vx = g.vy = 0;
    g.kind = kind;
    g.def = def;
    g.radius = def.radius;
    g.age = 0;
    g.pull = 0;
    g.speed = 0;
    g.inspired = false;
    g.inspireT = 0;
    this.bus.emit('gem:dropped', { gem: g });
    return g;
  }

  absorbOldest() {
    const items = this.gems.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].active) {
        this.collect(items[i]);
        return;
      }
    }
  }

  collect(g) {
    g.active = false;
    if (g.def.heal) {
      this.hero.hp = Math.min(this.hero.maxHp, this.hero.hp + g.def.heal);
      this.bus.emit('hero:healed', { x:g.x, y:g.y, amount:g.def.heal });
      return;
    }
    const value = g.def.value;
    this.inspiration?.collectedGem(g);
    this.bus.emit('gem:collected', { gem: g, value });
    this.add(value);
  }

  /** Добавить опыт (с множителем скорости набора). Возвращает, сколько уровней взято. */
  add(amount, raw) {
    if (this.level >= this.maxLevel) return 0;
    const got = raw ? amount : amount * this.cfg.xp.gainMult * (this.gainMul || 1); // raw: без множителя скорости набора (обмен награды на опыт)
    this.xp += got;
    this.total += got;
    let ups = 0;
    while (this.level < this.maxLevel && this.xp >= this.need) {
      this.xp -= this.need;
      this.level++;
      ups++;
      this.levelFlash = this.cfg.xp.flashTime;
      this.bus.emit('hero:levelup', { level: this.level });
    }
    if (this.level >= this.maxLevel) this.xp = 0;
    this.bus.emit('xp:gained', { amount: got, xp: this.xp, level: this.level });
    return ups;
  }

  update(dt) {
    if (this.levelFlash > 0) this.levelFlash = Math.max(0, this.levelFlash - dt);
    const hero = this.hero;
    const c = this.cfg.xp;
    const items = this.gems.items;
    const R = c.pickupRadius * (this.radiusMul || 1); // Магнетизм расширяет подбор
    for (let i = 0; i < items.length; i++) {
      const g = items[i];
      if (!g.active) continue;
      g.prevX = g.x;
      g.prevY = g.y;
      g.age += dt;
      if (!hero.active) continue;
      if (this.inspiration?.pull(g,dt)) { this.collect(g); continue; }
      if (g.inspired) continue; // полёт из любой точки карты не прерывается обычным магнитом
      const dx = hero.x - g.x;
      const dy = hero.y - g.y;
      const d = Math.hypot(dx, dy);
      if (d <= hero.radius + g.radius) {
        this.collect(g);
        continue;
      }
      // Подлёт: в радиусе притягивания камень разгоняется к герою. Раз начал, не отпускаем:
      // иначе при движении героя камень «дрожит» на границе радиуса.
      if (d <= R && g.age >= c.dropDelay) g.pull = 1;
      if (g.pull > 0) {
        g.speed = Math.min(c.pullSpeed, (g.speed || c.pullStart) + c.pullAccel * dt);
        const k = g.speed * dt / d;
        g.x += dx * Math.min(1, k);
        g.y += dy * Math.min(1, k);
      }
    }
  }
}
