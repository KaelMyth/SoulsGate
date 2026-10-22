// Сетка билда: клетки и то, что в них лежит. Это только данные: рисует их ui/builder.js,
// а правила графа (обход от ядра, теги, пул) придут отдельным вычислителем и будут читать эту же сетку.
//
// Клетка: { x, y, core: null | ядро }. Соседство по четырём граням (вверх, вниз, влево, вправо).
// Ядро: { id, x, y, def }, где def это запись из config.cores (название, иконка, список данных):
// на неё ссылка, не копия, поэтому ползунки панели сразу видны в данных ядра.

export class BuildGrid {
  constructor(size) {
    this.resize(size);
  }

  /** Новый пустой размер (параметр config.build.size). Всё содержимое сбрасывается. */
  resize(size) {
    this.size = Math.max(1, Math.round(size));
    this.cells = [];
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) this.cells.push({ x, y, core: null, mod: null });
    }
    this.cores = [];
  }

  clear() {
    for (const c of this.cells) { c.core = null; c.mod = null; }
    this.cores = [];
  }

  inBounds(x, y) {
    return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < this.size && y < this.size;
  }

  cell(x, y) {
    return this.inBounds(x, y) ? this.cells[y * this.size + x] : null;
  }

  /** Клетка на краю сетки. */
  isEdge(x, y) {
    return x === 0 || y === 0 || x === this.size - 1 || y === this.size - 1;
  }

  /** Соседи по четырём граням (только те, что внутри сетки). */
  neighbors(x, y) {
    const out = [];
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const c = this.cell(x + dx, y + dy);
      if (c) out.push(c);
    }
    return out;
  }

  /** Поставить ядро в клетку. Возвращает ядро или null, если клетка занята или её нет. */
  placeCore(id, def, x, y) {
    const c = this.cell(x, y);
    if (!c || c.core) return null;
    const core = { id, x, y, def };
    c.core = core;
    this.cores.push(core);
    return core;
  }

  coreById(id) {
    return this.cores.find((k) => k.id === id) || null;
  }

  /** Поставить мод ({ key, def }) в пустую клетку. Правила «можно ли» проверяет rules.js, тут только данные. */
  placeMod(mod, x, y) {
    const c = this.cell(x, y);
    if (!c || c.core || c.mod) return false;
    c.mod = mod;
    return true;
  }

  /** Снять мод из клетки, вернуть его (или null). */
  takeMod(x, y) {
    const c = this.cell(x, y);
    if (!c || !c.mod) return null;
    const m = c.mod;
    c.mod = null;
    return m;
  }

  /**
   * Ветки: для каждой клетки с модом, связанной гранями с ядром через другие моды, id ядра.
   * Возвращает Map: индекс клетки (y * size + x) → id ядра. Ядра тоже входят (свой id).
   */
  branches() {
    const owner = new Map();
    const queue = [];
    for (const k of this.cores) {
      owner.set(k.y * this.size + k.x, k.id);
      queue.push(this.cell(k.x, k.y));
    }
    for (let i = 0; i < queue.length; i++) {
      const c = queue[i];
      const id = owner.get(c.y * this.size + c.x);
      for (const n of this.neighbors(c.x, c.y)) {
        const idx = n.y * this.size + n.x;
        if (n.mod && !owner.has(idx)) {
          owner.set(idx, id);
          queue.push(n);
        }
      }
    }
    return owner;
  }

  /** Моды, не связанные с ядром (после снятия соседа): их надо вернуть в хранилище. */
  orphans() {
    const owner = this.branches();
    return this.cells.filter((c) => c.mod && !owner.has(c.y * this.size + c.x));
  }

  /** Суммарные модификаторы ядра: { стат: { percent, flat } } по модам его ветки. */
  modifiersFor(coreId) {
    const owner = this.branches();
    const out = {};
    for (const c of this.cells) {
      if (!c.mod || owner.get(c.y * this.size + c.x) !== coreId) continue;
      const e = c.mod.def.effect;
      const m = out[e.stat] || (out[e.stat] = { percent: 0, flat: 0 });
      if (e.mode === 'flat') m.flat += e.value;
      else m.percent += e.value;
    }
    return out;
  }
}
