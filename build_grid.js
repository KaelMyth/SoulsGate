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
   * Дерево билда: от каждого ядра наружу по модам. Возвращает
   * { owner: Map idx→id ядра, parent: Map idx→idx родителя или -1 (родитель ядро), carry: Map idx→стат, который несёт мод }.
   * idx = y * size + x. Ядра входят в owner со своим id. Клетка с модом встаёт гранью ровно к одной детали,
   * поэтому соседство деталей и есть дерево (петель нет).
   * carry: какой стат ядра мод изменяет: «Мощь» несёт damage, «Х2» на ядре несёт multStat ядра, «Х2» на моде несёт то же, что родитель.
   */
  tree() {
    const owner = new Map();
    const parent = new Map();
    const carry = new Map();
    const queue = [];
    for (const k of this.cores) {
      owner.set(k.y * this.size + k.x, k.id);
      parent.set(k.y * this.size + k.x, -2);
      queue.push(this.cell(k.x, k.y));
    }
    for (let i = 0; i < queue.length; i++) {
      const c = queue[i];
      const ci = c.y * this.size + c.x;
      const id = owner.get(ci);
      for (const n of this.neighbors(c.x, c.y)) {
        const ni = n.y * this.size + n.x;
        if (!n.mod || owner.has(ni)) continue;
        owner.set(ni, id);
        parent.set(ni, c.core ? -1 : ci);
        const e = n.mod.def.effect;
        if (e.kind === 'double') carry.set(ni, c.core ? c.core.def.multStat : carry.get(ci));
        else carry.set(ni, e.stat);
        queue.push(n);
      }
    }
    return { owner, parent, carry };
  }

  /** Ветки: Map индекс клетки → id ядра (ядра и связанные с ними моды). */
  branches() {
    return this.tree().owner;
  }

  /** Моды, не связанные с ядром (после снятия соседа): их надо вернуть в хранилище. */
  orphans() {
    const owner = this.branches();
    return this.cells.filter((c) => c.mod && !owner.has(c.y * this.size + c.x));
  }

  /**
   * Суммарные модификаторы ядра: { стат: { percent, flat } }.
   * Правила: моды на разных гранях ядра складываются (+10% и +10% = +20%), моды цепочкой друг за другом
   * умножаются (110, 121, 133.1). «Х2» на ядре даёт +100% к его множимому стату (снарядов 1→2, прочность блока 100→200),
   * «Х2» на моде удваивает накопленный бонус ветки до него (+21% → +42%).
   */
  modifiersFor(coreId) {
    const { owner, parent, carry } = this.tree();
    const kids = new Map();
    for (const c of this.cells) {
      if (!c.mod) continue;
      const i = c.y * this.size + c.x;
      if (owner.get(i) !== coreId) continue;
      const p = parent.get(i);
      if (!kids.has(p)) kids.set(p, []);
      kids.get(p).push(i);
    }
    // B: накопленный бонус до этого мода (доля), возвращает итог ветки от этого мода.
    const walk = (i, bIn, onCore) => {
      const e = this.cells[i].mod.def.effect;
      const out = e.kind === 'double' ? (onCore ? 1 : 2 * bIn) : (1 + bIn) * (1 + e.value / 100) - 1;
      let total = out;
      for (const k of kids.get(i) || []) total += walk(k, out, false) - out;
      return total;
    };
    const res = {};
    for (const i of kids.get(-1) || []) {
      const stat = carry.get(i);
      if (!stat) continue;
      const m = res[stat] || (res[stat] = { percent: 0, flat: 0 });
      m.percent += walk(i, 0, true) * 100;
    }
    return res;
  }
}
