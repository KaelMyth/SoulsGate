// Данные инвентаря и метапрогресса: предметы (лимит из конфига), сила духа, монеты. Без графики и DOM.
// Пока предметов нет: счётчики по нулям. Игра и интерфейс читают отсюда, onChange вызывается при любом изменении.
export class Inventory {
  /** cfg: CONFIG.inventory { limit } */
  constructor(cfg) {
    this.limit = cfg.limit;
    this.items = [];     // { id, ... }; формат предмета определит экономика
    this.spirit = 0;     // сила духа: растёт с каждым забегом
    this.coins = 0;
    this.onChange = null;
  }

  get count() { return this.items.length; }
  get full() { return this.items.length >= this.limit; }

  /** Добавить предмет. false, если инвентарь полон. */
  add(item) {
    if (this.full) return false;
    this.items.push(item);
    this.changed();
    return true;
  }

  addCoins(n) { this.coins = Math.max(0, this.coins + n); this.changed(); }
  addSpirit(n) { this.spirit = Math.max(0, this.spirit + n); this.changed(); }
  changed() { if (this.onChange) this.onChange(this); }
}
