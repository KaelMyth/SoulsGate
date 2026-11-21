// Модификаторы снаряда (чистая логика, без графики): выпадают в рулетке, вешаются в ячейки на посохе, меняют поведение выстрела.
// Ячейки растут созвездием: от посоха две ветки (две корневые ячейки); когда в ячейку повешен модификатор, от неё отходят ещё две
// (в каждой ветке не больше branchMax ячеек, всего до 2 × branchMax).
// Эпический ×2 и Легендарный ×3 усиливают то, к чему подвешены: в корневой ячейке (на самом посохе) умножают число снарядов,
// в вышестоящей усиливают модификатор, от которого отходят. Числа лежат в CONFIG.mods. Модификаторы действуют только в текущем забеге.

export const MOD_IDS = ['might', 'swift', 'pierce', 'epic', 'legendary'];

/** Описание модификаторов для интерфейса: название, цвет, краткое описание. */
export const MOD_INFO = {
  might: { name: 'Might', color: '#ff7a4a', tier: 'common', desc: 'Damage +20%' },
  swift: { name: 'Swiftness', color: '#4fd8ff', tier: 'common', desc: 'Fire rate +20%' },
  pierce: { name: 'Piercing', color: '#7dff9a', tier: 'common', desc: 'Shots pierce 1 target' },
  epic: { name: 'Epic', color: '#b06bff', tier: 'epic', desc: '×2 to what it is attached to: shots on the staff, or the modifier below it' },
  legendary: { name: 'Legendary', color: '#ffc65a', tier: 'legendary', desc: '×3 to what it is attached to: shots on the staff, or the modifier below it' },
};

/** Множитель, который даёт модификатор (1 у обычных). */
export const multOf = (cfg, id) => (id === 'epic' ? cfg.epic : id === 'legendary' ? cfg.legendary : 1);
export const isMult = (id) => id === 'epic' || id === 'legendary';

/** Случайный модификатор по весам CONFIG.mods.weights. */
export function pickMod(rnd, cfg) {
  const w = cfg.weights;
  let total = 0;
  for (const id of MOD_IDS) total += w[id] || 0;
  let r = rnd() * total;
  for (const id of MOD_IDS) { r -= w[id] || 0; if (r < 0) return id; }
  return MOD_IDS[0];
}

export class ModLoadout {
  /** cfg: CONFIG.mods */
  constructor(cfg) {
    this.cfg = cfg;
    this.reset();
  }

  reset() {
    // cell: { mod: id|null, parent: -1 (на посохе) | индекс ячейки, branch: номер ветки (0..roots-1) }
    this.cells = [];
    for (let i = 0; i < this.cfg.roots; i++) this.cells.push({ mod: null, parent: -1, branch: i });
  }

  /** Сколько ячеек сейчас в ветке b. */
  branchSize(b) { return this.cells.filter((x) => x.branch === b).length; }

  /** Повесить модификатор в ячейку i (замена разрешена). Возвращает индексы выросших новых ячеек (пусто, если ничего не выросло). */
  equip(i, mod) {
    const c = this.cells[i];
    if (!c || !MOD_INFO[mod]) return [];
    c.mod = mod;
    const grown = [];
    const hasChild = this.cells.some((x) => x.parent === i);
    if (!hasChild) {
      for (let k = 0; k < this.cfg.children && this.branchSize(c.branch) < this.cfg.branchMax; k++) {
        this.cells.push({ mod: null, parent: i, branch: c.branch });
        grown.push(this.cells.length - 1);
      }
    }
    return grown;
  }

  /** Усиление ячейки i: произведение множителей у отходящих от неё ячеек (Эпический/Легендарный). */
  boost(i) {
    let k = 1;
    for (const c of this.cells) if (c.parent === i && isMult(c.mod)) k *= multOf(this.cfg, c.mod) * this.boost(this.cells.indexOf(c));
    return k;
  }

  /** Итог: { damage, rate (множитель скорострельности), pierce (сквозь сколько целей), shots (снарядов за выстрел) }. */
  effects() {
    const C = this.cfg;
    let damage = 1, rate = 1, pierce = 0, shots = 1;
    this.cells.forEach((c, i) => {
      if (!c.mod) return;
      if (isMult(c.mod)) { if (c.parent === -1) shots *= multOf(C, c.mod) * this.boost(i); return; }
      const k = this.boost(i);
      if (c.mod === 'might') damage += C.damage * k;
      else if (c.mod === 'swift') rate += C.rate * k;
      else if (c.mod === 'pierce') pierce += C.pierce * k;
    });
    return { damage, rate, pierce, shots };
  }
}
