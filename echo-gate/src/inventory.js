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
    this.broken = [];    // сломанные при заточке предметы: выкупаются за золото или рекламу
    this.onChange = null; // один главный слушатель (окно инвентаря)
    this.listeners = [];  // остальные слушатели: listen(fn)
    this.loadBanked();
  }

  /** Между посещениями сохраняются только заработанные при пробуждении валюты. */
  loadBanked() {
    try {
      if (typeof localStorage === 'undefined') return;
      const v = JSON.parse(localStorage.getItem('echo-gate-banked-v1') || '{}');
      if (Number.isFinite(v.spirit) && v.spirit >= 0) this.spirit = v.spirit;
      if (Number.isFinite(v.coins) && v.coins >= 0) this.coins = v.coins;
    } catch (_) { /* браузер может блокировать хранилище */ }
  }

  saveBanked() {
    try {
      if (typeof localStorage !== 'undefined')
        localStorage.setItem('echo-gate-banked-v1', JSON.stringify({ spirit: this.spirit, coins: this.coins }));
    } catch (_) { /* приватный режим */ }
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

  /** Сколько камней заточки (kind 'gem') лежит в ячейках. */
  gemCount() { return this.slots.reduce((n, s) => n + (s && s.kind === 'gem' ? 1 : 0), 0); }

  /** Забрать n камней заточки из ячеек. false (и ничего не забирает), если их меньше. */
  takeGems(n) {
    if (this.gemCount() < n) return false;
    for (let i = 0, left = n; i < this.slots.length && left > 0; i++) {
      if (this.slots[i] && this.slots[i].kind === 'gem') { this.slots[i] = null; left--; }
    }
    this.changed();
    return true;
  }

  /** Предмет сломался: убрать из ячейки или с экипировки и положить во вкладку «сломанное». */
  breakItem(item) {
    let found = false;
    const i = this.slots.indexOf(item);
    if (i >= 0) { this.slots[i] = null; found = true; }
    for (const k of Object.keys(this.equipped)) if (this.equipped[k] === item) { this.equipped[k] = null; found = true; }
    if (found) this.broken.push(item);
    this.changed();
    return found;
  }

  /** Выкупить сломанный предмет i: mode 'gold' списывает золото (cost), 'ad' бесплатный (показ рекламы будет позже). false, если не хватает золота или нет места. */
  repairBroken(i, mode, cost) {
    const it = this.broken[i];
    if (!it || this.full) return false;
    if (mode === 'gold') { if (this.coins < cost) return false; this.coins -= cost; }
    this.broken.splice(i, 1);
    this.slots[this.firstEmpty()] = it;
    this.changed();
    return true;
  }

  addCoins(n) { this.coins = Math.max(0, this.coins + n); this.changed(); }
  addSpirit(n) { this.spirit = Math.max(0, this.spirit + n); this.changed(); }
  changed() {
    this.saveBanked();
    if (this.onChange) this.onChange(this);
    for (const fn of this.listeners) fn(this);
  }
}
