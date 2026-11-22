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
  gem: { label: 'Gem', slot: null },
};

export const ELEMENTS = { fire: 'Fire', ice: 'Ice', electric: 'Electric', gravity: 'Gravity', laser: 'Laser', blades: 'Blades' };

let nextId = 1;

export class Item {
  /** o: { kind, name, rarity, level, sharpen, durability, desc } */
  constructor(o) {
    this.id = Number.isSafeInteger(o.id) && o.id > 0 ? o.id : nextId++;
    if (this.id >= nextId) nextId = this.id + 1;
    this.kind = o.kind;
    this.name = o.name || 'Unknown item';
    this.rarity = RARITY[o.rarity] ? o.rarity : 'common';
    this.level = o.level || 1;
    this.sharpen = o.sharpen || 0;     // уровень заточки
    this.durability = o.durability == null ? 1 : o.durability; // 0..1, при заточке возможна поломка
    this.desc = o.desc || '';
    this.element = o.element || null;  // стихия посоха: 'fire' | 'ice' | 'electric' (внешний вид; на атаку пока не влияет)
  }

  /** Имя с заточкой: «Apprentice Staff +3». */
  get label() { return this.sharpen ? `${this.name} +${this.sharpen}` : this.name; }
  get kindInfo() { return KINDS[this.kind] || { label: this.kind, slot: null }; }
  get rarityInfo() { return RARITY[this.rarity]; }
  /** Название места экипировки или null. */
  get slot() { return this.kindInfo.slot; }

  /** Основные данные для окна предмета: [[подпись, значение], ...]. */
  details() {
    if (this.kind === 'gem') return [['Type', this.kindInfo.label], ['Rarity', this.rarityInfo.label]];
    return [
      ['Type', this.kindInfo.label],
      ...(this.element ? [['Element', ELEMENTS[this.element]]] : []),
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
    kind: 'tome', name: 'Force Tome', rarity: 'common',
    desc: 'A plain tome of raw force. Sharpen it to bind the pages tighter and make its runes burn brighter.',
  });
}

/** Стартовый посох игрока. */
export function startingStaff() {
  return new Item({
    kind: 'staff', name: 'Apprentice Staff', rarity: 'common',
    desc: 'A plain staff with a turquoise crystal. It channels every shot you fire.',
  });
}

/** Стихийные посохи (пока только модели и экипировка: на базовую атаку они повлияют позже). */
export function fireStaff() {
  return new Item({ kind: 'staff', element: 'fire', name: 'Flame Staff', rarity: 'rare', level: 1, desc: 'A charred staff that burns without fuel. Its element will reshape your basic attack.' });
}
export function iceStaff() {
  return new Item({ kind: 'staff', element: 'ice', name: 'Frost Staff', rarity: 'rare', level: 1, desc: 'A staff crowned with eternal ice. Its element will reshape your basic attack.' });
}
export function electricStaff() {
  return new Item({ kind: 'staff', element: 'electric', name: 'Storm Staff', rarity: 'rare', level: 1, desc: 'A fork of steel that crackles with lightning. Its element will reshape your basic attack.' });
}

export function gravityStaff() {
  return new Item({ kind: 'staff', element: 'gravity', name: 'Void Staff', rarity: 'rare', level: 1, desc: 'A caged singularity that bends everything toward it. Its element will reshape your basic attack.' });
}
export function laserStaff() {
  return new Item({ kind: 'staff', element: 'laser', name: 'Prism Staff', rarity: 'rare', level: 1, desc: 'A staff of pure white light. Its beam holds on a foe and burns it with rapid ticks.' });
}
export function bladesStaff() {
  return new Item({ kind: 'staff', element: 'blades', name: 'Bladestorm Staff', rarity: 'rare', level: 1, desc: 'A crown of steel with blades circling it. Its element will reshape your basic attack.' });
}

/** Жемчужный камень заточки: расходник для улучшения снаряжения (пока ничего не делает). */
export function pearlGem() {
  return new Item({
    kind: 'gem', name: 'Pearl Sharpening Gem', rarity: 'rare',
    desc: 'A pearl-white gem used to improve your equipment.',
  });
}
