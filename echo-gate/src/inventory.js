// Данные инвентаря и метапрогресса: ячейки с предметами (лимит из конфига), надетые предметы, сила духа, монеты.
// Без графики и DOM. onChange вызывается при любом изменении. Надетые предметы в лимит ячеек не входят.
import { startingTome, startingStaff } from './items.js';

export class Inventory {
  /** cfg: CONFIG.inventory { limit } */
  constructor(cfg) {
    this.limit = cfg.limit;
    this.slots = new Array(cfg.limit).fill(null); // Item или null
    this.equipped = { tome: startingTome(), staff: startingStaff() };     // по названию места экипировки (Item.slot)
    this.spirit = 0;     // сила духа: растёт с каждым забегом
    this.coins = 0;
    this.onChange = null; // один главный слушатель (окно инвентаря)
    this.listeners = [];  // остальные слушатели: listen(fn)
  }

  /** Подписаться на любые изменения инвентаря и экипировки. */
  listen(fn) { this.listeners.push(fn); }

  /** Надеты ли посох и фолиант: без них в забег не выйти. */
  get armed() { return !!(this.equipped.staff && this.equipped.tome); }

  get count() { return this.slots.reduce((n, s) => n + (s ? 1 : 0), 0); }
  get full() { return this.count >= this.limit; }
  firstEmpty() { return this.slots.indexOf(null); }

  /** Положить предмет в первую свободную ячейку. false, если инвентарь полон. */
  add(item) {
    const i = this.firstEmpty();
    if (i < 0) return false;
    this.slots[i] = item;
    this.changed();
    return true;
  }

  /** Поменять содержимое двух ячеек (если вторая пуста, предмет просто переезжает). */
  moveSlot(a, b) {
    if (a === b || !this.slots[a]) return false;
    [this.slots[a], this.slots[b]] = [this.slots[b], this.slots[a]];
    this.changed();
    return true;
  }

  /** Надеть предмет из ячейки i; прежний надетый предмет занимает его место. */
  equipFrom(i) {
    const it = this.slots[i];
    if (!it || !it.slot) return false;
    const old = this.equipped[it.slot] || null;
    this.equipped[it.slot] = it;
    this.slots[i] = old;
    this.changed();
    return true;
  }

  /** Снять предмет места slot в ячейку i (пустую, либо занятую предметом, который можно надеть вместо снятого). */
  unequipTo(slot, i) {
    const cur = this.equipped[slot];
    if (!cur) return false;
    const there = this.slots[i];
    if (there && there.slot !== slot) return false;
    this.slots[i] = cur;
    this.equipped[slot] = there || null;
    this.changed();
    return true;
  }

  /** Снять предмет в первую свободную ячейку. */
  unequip(slot) {
    const i = this.firstEmpty();
    return i >= 0 && this.unequipTo(slot, i);
  }

  addCoins(n) { this.coins = Math.max(0, this.coins + n); this.changed(); }
  addSpirit(n) { this.spirit = Math.max(0, this.spirit + n); this.changed(); }
  changed() {
    if (this.onChange) this.onChange(this);
    for (const fn of this.listeners) fn(this);
  }
}
