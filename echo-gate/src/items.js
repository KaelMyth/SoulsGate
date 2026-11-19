// Предметы Echo Gate: общий класс Item, типы (kind) и редкости. Без графики: иконки и окна рисует интерфейс.
// Редкости те же, что у модов (common / rare / legendary). Числа ниже временные: итоговый баланс задаст таблица экономики.
export const RARITY = {
  common: { label: 'Common', color: '#9fb3cc' },
  rare: { label: 'Rare', color: '#5fb0ff' },
  legendary: { label: 'Legendary', color: '#ffb14a' },
};

// slot: в какое место экипировки предмет надевается (null: просто лежит в инвентаре).
export const KINDS = {
  tome: { label: 'Tome', slot: 'tome' },
  staff: { label: 'Staff', slot: 'staff' },
};

let nextId = 1;

export class Item {
  /** o: { kind, name, rarity, level, sharpen, durability, desc } */
  constructor(o) {
    this.id = o.id || nextId++;
    this.kind = o.kind;
    this.name = o.name || 'Unknown item';
    this.rarity = RARITY[o.rarity] ? o.rarity : 'common';
    this.level = o.level || 1;
    this.sharpen = o.sharpen || 0;     // уровень заточки
    this.durability = o.durability == null ? 1 : o.durability; // 0..1, при заточке возможна поломка
    this.desc = o.desc || '';
  }

  get kindInfo() { return KINDS[this.kind] || { label: this.kind, slot: null }; }
  get rarityInfo() { return RARITY[this.rarity]; }
  /** Название места экипировки или null. */
  get slot() { return this.kindInfo.slot; }

  /** Основные данные для окна предмета: [[подпись, значение], ...]. */
  details() {
    return [
      ['Type', this.kindInfo.label],
      ['Rarity', this.rarityInfo.label],
      ['Level', String(this.level)],
      ['Sharpening', `+${this.sharpen}`],
      ['Condition', `${Math.round(this.durability * 100)}%`],
    ];
  }
}

/** Стартовый фолиант игрока. */
export function startingTome() {
  return new Item({
    kind: 'tome', name: 'Worn Tome', rarity: 'common',
    desc: 'A weathered leather tome. It keeps the spells you have learned.',
  });
}

/** Стартовый посох игрока. */
export function startingStaff() {
  return new Item({
    kind: 'staff', name: 'Apprentice Staff', rarity: 'common',
    desc: 'A plain staff with a turquoise crystal. It channels every shot you fire.',
  });
}
