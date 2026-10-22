// Хранилище модов (инвентарь над полем): отдельная от сетки структура, как в концепте.
// Ячейка: null или мод { key, def }, где def это запись из config.mods.
export class Storage {
  constructor(size) {
    this.resize(size);
  }

  resize(size) {
    this.slots = new Array(Math.max(0, Math.round(size))).fill(null);
  }

  get size() {
    return this.slots.length;
  }

  /** Положить мод в первую свободную ячейку. Индекс или -1, если места нет. */
  add(mod) {
    const i = this.slots.indexOf(null);
    if (i < 0) return -1;
    this.slots[i] = mod;
    return i;
  }

  /** Очистить и выдать стартовые моды по списку ключей из config.mods. */
  fill(mods, keys) {
    this.slots.fill(null);
    for (const key of keys || []) if (mods[key]) this.add({ key, def: mods[key] });
  }
}
