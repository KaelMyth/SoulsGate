import { parentAccepts } from './build_rules.js';
// Сетка билда: клетки и то, что в них лежит. Это только данные: рисует их ui/builder.js,
// а правила графа (обход от ядра, теги, пул) придут отдельным вычислителем и будут читать эту же сетку.
//
// Клетка: { x, y, core: null | ядро }. Соседство по четырём граням (вверх, вниз, влево, вправо).
// Ядро: { id, x, y, def }, где def это запись из config.cores (название, иконка, список данных):
// на неё ссылка, не копия, поэтому ползунки панели сразу видны в данных ядра.

export class BuildGrid {
  constructor(size) {
    this.lightningBonus = 0; // плоская прибавка урона от каждой Молнии (задаёт игра из config.shock.attackBonus)
    this.resize(size);
  }

  /** Новый пустой размер (параметр config.build.size). Всё содержимое сбрасывается. */
  resize(size) {
    this.size = Math.max(1, Math.round(size));
    this.ver = (this.ver || 0) + 1; // версия содержимого: по ней сбрасывается кэш дерева и модификаторов
    this.cells = [];
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) this.cells.push({ x, y, core: null, mod: null });
    }
    this.cores = [];
    // Ячейки пассивов: по углам меню четыре группы 2×2 (всего 16). Это отдельный слой, не часть поля из ромбов.
    this.pcells = [];
    for (let k = 0; k < 4; k++) for (let j = 0; j < 4; j++) this.pcells.push({ id: k * 4 + j, corner: k, px: j & 1, py: j >> 1, mod: null });
  }

  clear() {
    for (const c of this.cells) { c.core = null; c.mod = null; }
    for (const p of this.pcells) p.mod = null;
    this.cores = [];
    this.ver++;
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

  /** Соседи ячейки пассива по граням внутри того же угла. */
  pNeighbors(id) {
    const a = this.pcells[id];
    return this.pcells.filter((b) => b.corner === a.corner && Math.abs(b.px - a.px) + Math.abs(b.py - a.py) === 1);
  }

  placePassive(mod, id) {
    const p = this.pcells[id];
    if (!p || p.mod) return false;
    p.mod = mod;
    this.ver++;
    return true;
  }

  takePassive(id) {
    const p = this.pcells[id];
    if (!p || !p.mod) return null;
    const m = p.mod;
    p.mod = null;
    this.ver++;
    return m;
  }

  /** Множители Х2/Х3 в углах, которые остались без пассива рядом: их надо вернуть в хранилище. */
  passiveOrphans() {
    return this.pcells.filter((p) => p.mod && p.mod.def.effect.kind === 'double'
      && !this.pNeighbors(p.id).some((n) => n.mod && n.mod.def.effect.kind === 'passive'));
  }

  /**
   * Действие пассивов: { magnet: во сколько раз шире радиус подбора опыта }.
   * Каждый пассив усиливается соседними Х2/Х3 (их добавки складываются), разные пассивы друг на друга не влияют.
   */
  passives() {
    if (this._pVer === this.ver && this._p) return this._p;
    const res = { magnet: 1, xp: 1, hp: 1, range: 1, speed: 1, vamp: 0 }; // магнетизм, опыт, здоровье, дальность: множители; вампиризм: лечение за убийство
    for (const p of this.pcells) {
      if (!p.mod || p.mod.def.effect.kind !== 'passive') continue;
      let f = 1;
      for (const n of this.pNeighbors(p.id)) if (n.mod && n.mod.def.effect.kind === 'double') f += n.mod.def.effect.value - 1;
      const e = p.mod.def.effect;
      if (e.passive === 'vamp') res.vamp += e.value * f;
      else if (e.passive in res) res[e.passive] *= 1 + (e.value - 1) * f;
    }
    this._p = res;
    this._pVer = this.ver;
    return res;
  }

  /** Поставить ядро в клетку. Возвращает ядро или null, если клетка занята или её нет. */
  placeCore(id, def, x, y) {
    const c = this.cell(x, y);
    if (!c || c.core) return null;
    const core = { id, x, y, def };
    c.core = core;
    this.cores.push(core);
    this.ver++;
    return core;
  }

  coreById(id) {
    const k = this.cores.find((c) => c.id === id);
    if (k) return k;
    // Вторичное ядро (мод-ядро в клетке): id 'sec:<индекс клетки>', ведёт себя как ядро с данными самого мода.
    if (typeof id === 'string' && id.startsWith('sec:')) {
      const c = this.cells[+id.slice(4)];
      if (c && c.mod && c.mod.def.effect.secondary) return { id, x: c.x, y: c.y, def: c.mod.def, secondary: true };
    }
    return null;
  }

  /** id вторичного ядра вида kind (например 'kinetic') или null, если такого на поле нет. */
  secondaryId(kind) {
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i];
      if (c.mod && c.mod.def.effect.kind === kind && c.mod.def.effect.secondary) return 'sec:' + i;
    }
    return null;
  }

  /** Поставить мод ({ key, def }) в пустую клетку. Правила «можно ли» проверяет rules.js, тут только данные. */
  placeMod(mod, x, y) {
    const c = this.cell(x, y);
    if (!c || c.core || c.mod) return false;
    c.mod = mod;
    this.ver++;
    return true;
  }

  /** Стоит ли на поле мод вида kind (для вторичных ядер). */
  has(kind) {
    for (const c of this.cells) if (c.mod && c.mod.def.effect.kind === kind) return true;
    return false;
  }

  /** Снять мод из клетки, вернуть его (или null). */
  takeMod(x, y) {
    const c = this.cell(x, y);
    if (!c || !c.mod) return null;
    const m = c.mod;
    c.mod = null;
    this.ver++;
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
    if (this._tree && this._treeVer === this.ver) return this._tree;
    this._tree = this.treeRaw();
    this._treeVer = this.ver;
    return this._tree;
  }

  treeRaw() {
    const owner = new Map();
    const parent = new Map();
    const carry = new Map();
    const queue = [];
    for (const k of this.cores) {
      owner.set(k.y * this.size + k.x, k.id);
      parent.set(k.y * this.size + k.x, -2);
      queue.push(this.cell(k.x, k.y));
    }
    // Вторичные ядра (отдельные, стоят где угодно) тоже корни: к ним можно прикрепить моды, например Горение.
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i];
      if (c.mod && c.mod.def.effect.secondary) {
        owner.set(i, 'sec:' + i);
        parent.set(i, -2);
        queue.push(c);
      }
    }
    for (let i = 0; i < queue.length; i++) {
      const c = queue[i];
      const ci = c.y * this.size + c.x;
      const id = owner.get(ci);
      for (const n of this.neighbors(c.x, c.y)) {
        const ni = n.y * this.size + n.x;
        if (!n.mod || owner.has(ni) || n.mod.def.effect.secondary) continue; // вторичное ядро в деревья не входит
        owner.set(ni, id);
        parent.set(ni, c.core || c.mod.def.effect.secondary ? -1 : ci);
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
      if (c.core || c.mod.def.effect.secondary) continue;
      const ci = c.y * this.size + c.x;
      const p = parent.get(ci);
      const pc = p < 0 ? '' : carry.get(p);
      const pcore = p < 0 ? this.coreById(owner.get(ci)) : null;
      const e = c.mod.def.effect;
      // Х2/Х3 на ядре: корень ветки, под него можно вешать любые моды (как на само ядро), а сам он множит только ядро.
      if (e.kind === 'double') carry.set(ci, pc === 'absorption' || pc === 'absorption:mult' ? 'absorption:mult' : pcore || pc === 'xroot' ? 'xroot' : pc === 'laser' || pc === 'shot' || pc === 'phantom' || pc === 'aura' || pc === 'lightning' || pc === 'dbl' ? 'dbl' : pc);
      else if (e.kind === 'frost') carry.set(ci, linked.has(ci) ? 'steam' : 'frost'); // в связке с огнём: «пар»
      else if (e.kind === 'shot') carry.set(ci, 'shot'); // «Дробь»: ничего не вешается, число дробинок множит Х2/Х3 на ядре
      else if (e.kind === 'blades') carry.set(ci, 'blades'); // корень ветки клинков: Мощь, Ускорение, множители, Горение, Мороз
      else if (e.kind === 'laser') carry.set(ci, 'laser'); // корень ветки лазера: Мощь, Ускорение, Мороз, Горение
      else if (e.kind === 'lightning') carry.set(ci, 'lightning'); // «Молния»: ничего не вешается
      else if (e.kind === 'aura') carry.set(ci, 'aura'); // корень ветки ауры: усилители и стихии
      else if (e.kind === 'absorption') carry.set(ci, 'absorption'); // мод щита: число целей, урон, скорость, Вампиризм
      else if (e.kind === 'passive' && e.passive === 'vamp') carry.set(ci, 'absorption:vamp'); // Вампиризм на Поглощении, не угловой пассив
      else if (e.kind === 'stat' && (pc === 'absorption' || pc === 'absorption:mult' || pc === 'absorption:damage' || pc === 'absorption:rate')) carry.set(ci, 'absorption:' + e.stat);
      else if (e.kind === 'phantom') carry.set(ci, 'phantom'); // корень ветки фантома: на нём только множители шанса
      else if (e.kind === 'pierce') carry.set(ci, 'pierce'); // корень ветки пробития: на нём только множители
      else if (e.kind === 'burn') carry.set(ci, 'burn'); // корень ветки горения: к нему крепятся Мощь и Ускорение огня
      else if (pc.startsWith('burn')) carry.set(ci, 'burn:' + e.stat);
      else if (pc.startsWith('steam')) carry.set(ci, 'steam:' + e.stat);
      else if (pc.startsWith('shot')) carry.set(ci, 'shot:' + e.stat);
      else if (pc.startsWith('phantom')) carry.set(ci, 'phantom:' + e.stat);
      else if (pc.startsWith('laser')) carry.set(ci, 'laser:' + e.stat);
      else if (pc.startsWith('blades')) carry.set(ci, 'blades:' + e.stat);
      else if (pc.startsWith('aura')) carry.set(ci, 'aura:' + e.stat);
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
        const core = this.coreById(owner.get(i));
        r = !parentAccepts(cell.mod.def, p < 0 ? core : null, p < 0 ? null : carry.get(p), core) || (p >= 0 && invalid(p));
      }
      bad.set(i, r);
      return r;
    };
    return this.cells.filter((c) => {
      if (!c.mod || c.mod.def.effect.secondary) return false; // вторичное ядро ни к чему не крепится
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
    // Кэш по версии поля: системы просят модификаторы каждый кадр, а поле меняется редко.
    if (this._modsVer !== this.ver) { this._mods = new Map(); this._modsVer = this.ver; }
    let res = this._mods.get(coreId);
    if (!res) { res = this.modifiersRaw(coreId); this._mods.set(coreId, res); }
    return res;
  }

  modifiersRaw(coreId) {
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
    let extraCount = 0;
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
    // Молния: просто наличие (число для статистики).
    // Молния: число модов (каждый даёт плоскую прибавку к урону) и множитель цепи (Х2/Х3 на Молнии, как на Пробитии).
    let zaps = 0;
    let zapMul = 0;
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i];
      if (!c.mod || c.mod.def.effect.kind !== 'lightning' || owner.get(i) !== coreId) continue;
      let f = 1;
      for (const k of kids.get(i) || []) if (this.cells[k].mod.def.effect.kind === 'double') f += mult(k) - 1;
      zaps++;
      zapMul += f;
    }
    if (zaps) {
      res.lightning = { count: zaps, mult: zapMul };
      if (this.lightningBonus) (res.damage || (res.damage = { percent: 0, flat: 0 })).flat += this.lightningBonus * zaps;
    }
    // Фантомный выстрел: Х2/Х3 на нём умножают шанс; несколько фантомов складывают шанс.
    let ph = 0;
    let phMul = 0;
    let phDmg = 0;
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i];
      if (!c.mod || c.mod.def.effect.kind !== 'phantom' || owner.get(i) !== coreId) continue;
      let f = 1;
      let d = 0;
      let r = 0;
      for (const k of kids.get(i) || []) {
        if (this.cells[k].mod.def.effect.kind === 'double') f += mult(k) - 1;
        else if (carry.get(k) === 'phantom:damage') d += walk(k, 0);
        else if (carry.get(k) === 'phantom:rate') r += walk(k, 0);
      }
      ph++;
      phMul += f * (1 + r); // Ускорение на Фантоме тоже повышает шанс
      phDmg += 1 + d;
    }
    if (ph) res.phantom = { count: ph, mult: phMul, damage: phDmg / ph };
    // Лазер: Мощь на нём усиливает урон тика, Ускорение учащает тики.
    let lasers = 0;
    let lDmg = 0;
    let lRate = 0;
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i];
      if (!c.mod || c.mod.def.effect.kind !== 'laser' || owner.get(i) !== coreId) continue;
      let d = 0;
      let r = 0;
      for (const k of kids.get(i) || []) {
        if (carry.get(k) === 'laser:damage') d += walk(k, 0);
        else if (carry.get(k) === 'laser:rate') r += walk(k, 0);
      }
      lasers++;
      lDmg += 1 + d;
      lRate += 1 + r;
    }
    if (lasers) res.laser = { count: lasers, damage: lDmg / lasers, rate: lRate / lasers };
    // Смертельная аура: Х2/Х3 на ней расширяют поле, Мощь усиливает тик, Ускорение учащает тики.
    let auras = 0;
    let aMul = 0;
    let aDam = 0;
    let aRate = 0;
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i];
      if (!c.mod || c.mod.def.effect.kind !== 'aura' || owner.get(i) !== coreId) continue;
      let d = 0;
      let r = 0;
      let f = 1;
      for (const k of kids.get(i) || []) {
        if (this.cells[k].mod.def.effect.kind === 'double') f += mult(k) - 1;
        else if (carry.get(k) === 'aura:damage') d += walk(k, 0);
        else if (carry.get(k) === 'aura:rate') r += walk(k, 0);
      }
      auras++;
      aMul += f;
      aDam += 1 + d;
      aRate += 1 + r;
    }
    if (auras) res.aura = { count: auras, mult: aMul / auras, damage: aDam / auras, rate: aRate / auras };
    // Поглощение: число целей умножается всеми Х2/Х3 в каждой ветке.
    // Вложенные Х2→Х3 перемножаются, разные ветви от одного Поглощения — тоже.
    // Несколько отдельных модов Поглощения суммируют получившиеся количества целей.
    let absorptionCount = 0;
    let absorptionStandaloneCount = 0;
    let absorptionAuraCount = 0;
    let absorptionTargets = 0;
    let absorptionAuraTargets = 0;
    let absorptionStandaloneTargets = 0;
    let absorptionVamp = false;
    let absorptionBlades = false;
    let absorptionBurn = false;
    let absorptionFrost = false;
    let absorptionLightning = false;
    let absorptionDamageBonus = 0;
    let absorptionRateBonus = 0;
    const absorptionBranch = (i, inElement = false) => {
      let factor = 1;
      for (const k of kids.get(i) || []) {
        const e = this.cells[k].mod.def.effect;
        if (e.kind === 'blades') {
          absorptionBlades = true;
          absorptionBranch(k, true); // усиления самих Клинков не усиливают Поглощение
        } else if (e.kind === 'burn' || e.kind === 'frost' || e.kind === 'lightning') {
          if (e.kind === 'burn') absorptionBurn = true;
          if (e.kind === 'frost') absorptionFrost = true;
          if (e.kind === 'lightning') absorptionLightning = true;
          // Усиления под стихией принадлежат стихии, а не урону/числу целей Поглощения.
          absorptionBranch(k, true);
        } else if (inElement) {
          // Х2/Х3 под Молнией усиливают её цепь, не количество целей Поглощения.
          continue;
        } else if (e.kind === 'double') factor *= e.value * absorptionBranch(k);
        else if (e.kind === 'passive' && e.passive === 'vamp') absorptionVamp = true;
        else if (e.kind === 'stat' && e.stat === 'damage') absorptionDamageBonus += walk(k, 0);
        else if (e.kind === 'stat' && e.stat === 'rate') absorptionRateBonus += walk(k, 0);
      }
      return factor;
    };
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i];
      if (!c.mod || c.mod.def.effect.kind !== 'absorption' || owner.get(i) !== coreId) continue;
      absorptionCount++;
      // Прямой мод Поглощения оставляет обычный 3-секундный цикл.
      // Если мод прикреплён под Аурой, он даёт отдельный удар внутри ауры каждые 2 с.
      let ancestor = parent.get(i);
      let onAura = false;
      while (ancestor >= 0) {
        const prev = this.cells[ancestor].mod;
        if (prev && prev.def.effect.kind === 'aura') { onAura = true; break; }
        ancestor = parent.get(ancestor);
      }
      const count = absorptionBranch(i);
      if (onAura) { absorptionAuraCount++; absorptionAuraTargets += count; }
      else { absorptionStandaloneCount++; absorptionStandaloneTargets += count; }
      absorptionTargets += count;
    }
    if (absorptionCount) res.absorption = {
      count: absorptionCount, standaloneCount: absorptionStandaloneCount, auraCount: absorptionAuraCount,
      targets: absorptionTargets, standaloneTargets: absorptionStandaloneTargets, auraTargets: absorptionAuraTargets,
      vampirism: absorptionVamp,
      blades: absorptionBlades,
      burn: absorptionBurn, frost: absorptionFrost, lightning: absorptionLightning,
      damage: 1 + absorptionDamageBonus, rate: 1 + absorptionRateBonus,
    };
    // Клинки: Х2/Х3 на них множат число клинков, Мощь усиливает урон, Ускорение учащает появление.
    let blades = 0;
    let absorptionLinkedBlades = 0;
    let kMax = 0;
    let kDam = 0;
    let kRate = 0;
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i];
      if (!c.mod || c.mod.def.effect.kind !== 'blades' || owner.get(i) !== coreId) continue;
      let d = 0;
      let r = 0;
      let f = 1;
      for (const k of kids.get(i) || []) {
        if (this.cells[k].mod.def.effect.kind === 'double') f += mult(k) - 1;
        else if (carry.get(k) === 'blades:damage') d += walk(k, 0);
        else if (carry.get(k) === 'blades:rate') r += walk(k, 0);
      }
      blades++;
      let anc = parent.get(i);
      while (anc >= 0) {
        const mod = this.cells[anc].mod;
        if (mod && mod.def.effect.kind === 'absorption') { absorptionLinkedBlades++; break; }
        anc = parent.get(anc);
      }
      kMax += f;
      kDam += 1 + d;
      kRate += 1 + r;
    }
    if (blades) res.blades = { count: blades, linkedAbsorption: absorptionLinkedBlades, max: kMax / blades, damage: kDam / blades, rate: kRate / blades };
    // Х2/Х3 поверх «Лазера» и «Дроби» (на ядре снаряда) увеличивают число снарядов так же, как Х2 на самом ядре.
    let extra = 0;
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i];
      if (!c.mod || owner.get(i) !== coreId) continue;
      const kind = c.mod.def.effect.kind;
      if (kind === 'shot') { // Мощь и Ускорение на Дроби: урон дробинок и скорострельность залпов
        let d = 0;
        let r = 0;
        for (const k of kids.get(i) || []) {
          if (carry.get(k) === 'shot:damage') d += walk(k, 0);
          else if (carry.get(k) === 'shot:rate') r += walk(k, 0);
        }
        if (!res.shot) res.shot = { count: 0, damage: 0, rate: 0 };
        res.shot.count++; res.shot.damage += 1 + d; res.shot.rate += 1 + r;
      }
      if (kind === 'shot' || kind === 'laser') for (const k of kids.get(i) || []) if (this.cells[k].mod.def.effect.kind === 'double') extra += mult(k) - 1;
    }
    if (res.shot) { res.shot.damage /= res.shot.count; res.shot.rate /= res.shot.count; }
    const cc = this.coreById(coreId);
    if (extra && cc && cc.def.multStat === 'count') extraCount = extra;
    if (extra && res.shot) res.shotMul = 1 + extra; // Х2/Х3 на Дроби (для Дроби на рывке)
    if (steams && burns) res.steam = { count: steams, damage: sDmg / steams };
    // Что стоит «на ядре»: моды прямо на нём и моды под множителями Х2/Х3, которые сидят на ядре (они только ветка).
    const rootStat = [];
    const rootDoubles = [];
    const gather = (p, top) => {
      for (const k of kids.get(p) || []) {
        if (this.cells[k].mod.def.effect.kind === 'double') {
          if (top) rootDoubles.push(k);
          gather(k, false);
        } else rootStat.push(k);
      }
    };
    gather(-1, true);
    for (const i of rootStat) {
      const stat = carry.get(i);
      if (!stat || stat === 'burn' || stat === 'frost' || stat === 'steam' || stat === 'pierce' || stat === 'laser' || stat === 'blades' || stat === 'shot' || stat === 'phantom' || stat === 'aura' || stat === 'absorption' || stat === 'absorption:vamp' || stat === 'absorption:mult' || stat === 'absorption:damage' || stat === 'absorption:rate' || stat === 'lightning') continue;
      const m = res[stat] || (res[stat] = { percent: 0, flat: 0 });
      m.percent += walk(i, 0) * 100;
    }
    // Ветки Х2/Х3 на разных гранях ядра независимы: их добавки складываются (Х2 и Х2 это ×3),
    // а множители в одной ветке по очереди перемножаются (Х2 за Х2 это ×4). Множат только ядро.
    const core = this.coreById(coreId);
    const ms = core && core.def.multStat;
    if (ms && rootDoubles.length) {
      const m = res[ms] || (res[ms] = { percent: 0, flat: 0 });
      let f = 1;
      for (const i of rootDoubles) f += mult(i) - 1;
      m.percent = (f - 1) * 100;
    }
    if (extraCount) {
      const m = res.count || (res.count = { percent: 0, flat: 0 });
      m.percent += extraCount * 100;
    }
    return res;
  }
}
