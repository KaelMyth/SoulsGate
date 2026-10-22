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
      for (let x = 0; x < this.size; x++) this.cells.push({ x, y, core: null });
    }
    this.cores = [];
  }

  clear() {
    for (const c of this.cells) c.core = null;
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
}
