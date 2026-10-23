import { parentAccepts } from './build_rules.js';
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
        queue.push(n);
      }
    }
    // Связка «Горение + Мороз» (в любом порядке): оба мода становятся её частью, на Мороз можно вешать урон.
    const linked = new Set();
    for (const c of queue) {
      if (c.core) continue;
      const i = c.y * this.size + c.x;
      const p = parent.get(i);
      if (p < 0) continue;
      const a = c.mod.def.effect.kind;
      const b = this.cells[p].mod.def.effect.kind;
      if ((a === 'burn' && b === 'frost') || (a === 'frost' && b === 'burn')) {
        if (a === 'frost') linked.add(i); else linked.add(p);
      }
    }
    // Что несёт каждый мод: родители раньше детей (порядок обхода в ширину).
    for (const c of queue) {
      if (c.core) continue;
      const ci = c.y * this.size + c.x;
      const p = parent.get(ci);
      const pc = p < 0 ? '' : carry.get(p);
      const pcore = p < 0 ? this.coreById(owner.get(ci)) : null;
      const e = c.mod.def.effect;
      if (e.kind === 'double') carry.set(ci, pcore ? pcore.def.multStat : pc);
      else if (e.kind === 'frost') carry.set(ci, linked.has(ci) ? 'steam' : 'frost'); // в связке с огнём: «пар»
      else if (e.kind === 'pierce') carry.set(ci, 'pierce'); // корень ветки пробития: на нём только множители
      else if (e.kind === 'burn') carry.set(ci, 'burn'); // корень ветки горения: к нему крепятся Мощь и Ускорение огня
      else if (pc.startsWith('burn')) carry.set(ci, 'burn:' + e.stat);
      else if (pc.startsWith('steam')) carry.set(ci, 'steam:' + e.stat);
      else carry.set(ci, e.stat);
    }
    return { owner, parent, carry };
  }

  /** Ветки: Map индекс клетки → id ядра (ядра и связанные с ними моды). */
  branches() {
    return this.tree().owner;
  }

  /** Моды, не связанные с ядром (после снятия соседа): их надо вернуть в хранилище. */
  orphans() {
    const { owner, parent, carry } = this.tree();
    // Мод тоже теряет место, если его родитель перестал ему подходить (сняли Горение: на Морозе повисли Мощи).
    const bad = new Map();
    const invalid = (i) => {
      if (bad.has(i)) return bad.get(i);
      const p = parent.get(i);
      let r = false;
      if (p !== undefined && p !== -2) {
        const cell = this.cells[i];
        const core = p < 0 ? this.coreById(owner.get(i)) : null;
        r = !parentAccepts(cell.mod.def, core, p < 0 ? null : carry.get(p)) || (p >= 0 && invalid(p));
      }
      bad.set(i, r);
      return r;
    };
    return this.cells.filter((c) => {
      if (!c.mod) return false;
      const i = c.y * this.size + c.x;
      return !owner.has(i) || invalid(i);
    });
  }

  /**
   * Суммарные модификаторы ядра: { стат: { percent, flat } } и, если есть «Горение», burn: { count, damage, rate } (множители).
   * Правила: моды на разных гранях ядра складываются (+10% и +10% = +20%), моды цепочкой друг за другом
   * умножаются (110, 121, 133.1). множители в одной ветке перемножаются (Х2 за Х2 это Х4), ветки на разных гранях складываются,
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
    // Множители на ядре (Х2, Х3): в одной ветке перемножаются по очереди (Х2 за Х2 это Х4, Х2 за Х3 это Х6).
    const mult = (i) => {
      let f = this.cells[i].mod.def.effect.value;
      for (const k of kids.get(i) || []) if (this.cells[k].mod.def.effect.kind === 'double') f *= mult(k);
      return f;
    };
    // B: накопленный бонус до этого мода (доля), возвращает итог ветки от этого мода.
    // Множитель на моде умножает бонус, накопленный до него (+21% Х2 → +42%), цепочка множителей перемножается.
    const walk = (i, bIn) => {
      const e = this.cells[i].mod.def.effect;
      const out = e.kind === 'double' ? e.value * bIn : (1 + bIn) * (1 + e.value / 100) - 1;
      let total = out;
      for (const k of kids.get(i) || []) total += walk(k, out) - out;
      return total;
    };
    const res = {};
    const factor = {};
    // Горение: у каждого мода «Горение» своя ветка. Мощь в ней усиливает урон тика, Ускорение учащает тики.
    // Несколько «Горений» складывают урон тика и усредняют частоту.
    let burns = 0;
    let bDmg = 0;
    let bRate = 0;
    let frosts = 0;
    let steams = 0;
    let sDmg = 0;
    for (const [i, kind] of this.cells.map((c, idx) => [idx, c.mod && owner.get(idx) === coreId ? c.mod.def.effect.kind : null])) {
      if (kind === 'burn') {
        let d = 0;
        let r = 0;
        for (const k of kids.get(i) || []) {
          if (carry.get(k) === 'burn:damage') d += walk(k, 0);
          else if (carry.get(k) === 'burn:rate') r += walk(k, 0);
        }
        burns++;
        bDmg += 1 + d;
        bRate += 1 + r;
      } else if (kind === 'frost') {
        frosts++;
        if (carry.get(i) === 'steam') {
          // Связка с огнём: Мощь на Морозе усиливает горение, которое вешает облако пара.
          let d = 0;
          for (const k of kids.get(i) || []) if (carry.get(k) === 'steam:damage') d += walk(k, 0);
          steams++;
          sDmg += 1 + d;
        }
      }
    }
    if (burns) res.burn = { count: burns, damage: bDmg, rate: bRate / burns };
    if (frosts) res.frost = { count: frosts };
    // Пробитие: само по себе 1 враг насквозь, множители на нём (Х2, Х3, цепочкой перемножаются) увеличивают число.
    let pierce = 0;
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i];
      if (!c.mod || c.mod.def.effect.kind !== 'pierce' || owner.get(i) !== coreId) continue;
      let f = 1;
      for (const k of kids.get(i) || []) if (this.cells[k].mod.def.effect.kind === 'double') f += mult(k) - 1;
      pierce += f;
    }
    if (pierce) res.pierce = { count: pierce };
    if (steams && burns) res.steam = { count: steams, damage: sDmg / steams };
    for (const i of kids.get(-1) || []) {
      const stat = carry.get(i);
      if (!stat || stat === 'burn' || stat === 'frost' || stat === 'steam' || stat === 'pierce') continue;
      const m = res[stat] || (res[stat] = { percent: 0, flat: 0 });
      if (this.cells[i].mod.def.effect.kind === 'double') {
        // Ветки на разных гранях независимы: их добавки складываются (Х2 и Х2 на разных гранях это ×3),
        // а множители в одной ветке по очереди перемножаются (Х2 за Х2 это ×4).
        factor[stat] = (factor[stat] || 1) + (mult(i) - 1);
        m.percent = (factor[stat] - 1) * 100;
      } else {
        m.percent += walk(i, 0) * 100;
      }
    }
    return res;
  }
}
