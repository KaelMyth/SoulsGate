// Правила прикрепления мода: можно ли поставить его в клетку и какие грани подсвечивать.
// Мод крепится гранью ровно к одной детали (ядро или другой мод). Клетка, которая касается двух деталей
// (своей ветки или чужой), не подходит: так ветки остаются деревом и не склеиваются.
// Совместимость с родителем:
//   «bonus» мод (Мощь): ядро должно иметь этот стат, мод-родитель должен нести тот же стат;
//   «double» мод (Х2): ядро должно иметь multStat, мод-родитель должен нести какой-то стат.

/** Подходит ли мод modDef родителю: ядру (core) или моду (carry: стат, который тот несёт). */
export function parentAccepts(modDef, core, carry, ownerCore) {
  const e = modDef.effect;
  if (core) {
    if (e.kind === 'double') return !!core.def.multStat;
    if (e.kind === 'burn') return !!core.def.canBurn;
    if (e.kind === 'frost') return !!core.def.canFrost;
    if (e.kind === 'pierce') return !!core.def.canPierce;
    if (e.kind === 'laser') return !!core.def.canLaser;
    if (e.kind === 'blades') return !!core.def.canBlades;
    if (e.kind === 'aura') return !!core.def.canAura;
    if (e.kind === 'lightning') return !!core.def.canLightning;
    if (e.kind === 'shot') return !!core.def.canShot;
    if (e.kind === 'phantom') return !!core.def.canPhantom;
    return (core.def.stats || []).some((s) => s.key === e.stat);
  }
  if (!carry) return false;
  if (carry === 'xroot') return parentAccepts(modDef, ownerCore || null, null); // Х2/Х3 на ядре: ветка, на неё вешают всё, что берёт ядро
  if (carry === 'dbl') return e.kind === 'double'; // Х2/Х3 на «Лазере»/«Дроби»: дальше только ещё множители
  if (e.kind === 'laser') return carry === 'blades'; // «Лазер» к ядру снаряда или на «Клинки» (клинки становятся сферами с лучами)
  if (e.kind === 'shot') return carry === 'blades'; // «Дробь» к ядру снаряда или на «Клинки»
  if (e.kind === 'phantom') return carry === 'blades'; // «Фантом» к ядру снаряда или на «Клинки»
  if (e.kind === 'pierce') return carry === 'blades' || carry === 'shot'; // «Пробитие»: к ядру снаряда или на «Клинки» и «Дробь»
  if (e.kind === 'blades' || e.kind === 'aura') return false; // «Клинки» и «Аура» крепятся только к ядру
  if (e.kind === 'double') return !['burn', 'frost', 'steam'].includes(carry); // на «Лазере» и «Дроби» множитель увеличивает число снарядов, как на ядре
  // Связка: «Мороз» крепится к «Горению», а «Горение» к «Морозу». Больше они ни к чему, кроме ядра, не крепятся.
  if (e.kind === 'lightning') return carry === 'laser' || carry === 'blades' || carry === 'aura' || carry === 'shot'; // «Молния»: к ядру снаряда, рывка или на Лазер, Клинки, Ауру
  if (e.kind === 'frost') return carry === 'burn' || carry === 'laser' || carry === 'blades' || carry === 'aura' || carry === 'shot';
  if (e.kind === 'burn') return carry === 'frost' || carry === 'steam' || carry === 'laser' || carry === 'blades' || carry === 'aura' || carry === 'shot';
  if (carry === 'frost') return false; // одинокий «Мороз»: урон на нём ничего не усиливает
  if (carry === 'burn') return e.stat === 'damage' || e.stat === 'rate'; // к «Горению»: урон тика и частота тиков
  if (carry === 'aura') return e.stat === 'damage' || e.stat === 'rate'; // к «Ауре»: урон тика и число тиков
  if (carry === 'blades') return e.stat === 'damage' || e.stat === 'rate'; // к «Клинкам»: урон и скорость появления
  if (carry === 'shot' || carry === 'phantom') return e.stat === 'damage' || e.stat === 'rate'; // к «Дроби»: урон и скорострельность; к «Фантому»: урон копий и частота
  if (carry === 'laser') return e.stat === 'damage' || e.stat === 'rate'; // к «Лазеру»: урон тика и число тиков
  if (carry === 'steam') return e.stat === 'damage'; // к «Морозу» в связке: урон горения облака пара
  if (carry.startsWith('burn:') || carry.startsWith('steam:') || carry.startsWith('shot:') || carry.startsWith('phantom:') || carry.startsWith('laser:') || carry.startsWith('blades:') || carry.startsWith('aura:')) return carry.endsWith(':' + e.stat); // дальше по цепочке: то же самое
  return carry === e.stat;
}

/** Можно ли поставить мод modDef в клетку (x, y). { ok, reason, core } */
/** Вторичное ядро (Кинетический рывок) стоит отдельно: ни одна грань клетки не должна касаться ядра или мода любой ветки. */
function secondaryFree(grid, x, y) {
  const owner = grid.tree().owner;
  return !grid.neighbors(x, y).some((n) => owner.has(n.y * grid.size + n.x));
}

export function canPlace(grid, modDef, x, y) {
  if (modDef.effect && modDef.effect.kind === 'passive') return { ok: false, reason: 'passive' }; // пассивы ставятся только в угловые ячейки
  const c = grid.cell(x, y);
  if (!c) return { ok: false, reason: 'out' };
  if (c.core || c.mod) return { ok: false, reason: 'busy' };
  if (modDef.effect && modDef.effect.secondary) { // вторичное ядро: в пустую клетку, но не вплотную к ядрам и их веткам
    const ok = secondaryFree(grid, x, y);
    return { ok, reason: ok ? '' : 'touch-other', core: null };
  }
  const t = grid.tree();
  const nodes = grid.neighbors(x, y).filter((n) => t.owner.has(n.y * grid.size + n.x));
  if (nodes.length === 0) return { ok: false, reason: 'no-anchor' };
  if (nodes.length > 1) {
    const ids = new Set(nodes.map((n) => t.owner.get(n.y * grid.size + n.x)));
    return { ok: false, reason: ids.size > 1 ? 'touch-other' : 'loop' };
  }
  const n = nodes[0];
  const core = grid.coreById(t.owner.get(n.y * grid.size + n.x));
  const root = n.core || (n.mod && n.mod.def.effect.secondary ? core : null); // корень ветки: ядро или вторичное ядро
  const ok = parentAccepts(modDef, root, t.carry.get(n.y * grid.size + n.x), core);
  return { ok, reason: ok ? '' : 'incompatible', core };
}

const DIRS = [['t', 0, -1], ['r', 1, 0], ['b', 0, 1], ['l', -1, 0]];

/**
 * Что подсвечивать при выбранном моде: { faces, targets }.
 * faces: грани деталей-якорей: { x, y, dir: 't'|'r'|'b'|'l', kind: 'ok'|'bad' },
 *   ok: сюда мод можно прикрепить, bad: этой детали он не подходит (грани щита красные у «Мощи»: у щита нет урона).
 * targets: клетки, куда мод можно поставить.
 */
/** Можно ли поставить мод в угловую ячейку пассива id: пассив в любую пустую, Х2/Х3 только рядом с пассивом. */
export function canPlacePassive(grid, modDef, id) {
  const p = grid.pcells[id];
  if (!p || p.mod) return false;
  const k = modDef.effect && modDef.effect.kind;
  if (k === 'passive') return true;
  if (k === 'double') return grid.pNeighbors(id).some((n) => n.mod && n.mod.def.effect.kind === 'passive');
  return false;
}

export function highlight(grid, modDef) {
  const pt = grid.pcells.filter((p) => canPlacePassive(grid, modDef, p.id)).map((p) => p.id); // подсветка угловых ячеек
  if (modDef.effect && modDef.effect.kind === 'passive') return { faces: [], targets: [], ptargets: pt };
  const r = highlightMain(grid, modDef);
  r.ptargets = pt;
  return r;
}

function highlightMain(grid, modDef) {
  if (modDef.effect && modDef.effect.secondary) return { faces: [], targets: grid.cells.filter((c) => !c.core && !c.mod && secondaryFree(grid, c.x, c.y)) }; // пустая клетка вдали от ядер и веток
  const owner = grid.branches();
  const faces = [];
  const targets = new Map();
  for (const a of grid.cells) {
    if (!owner.has(a.y * grid.size + a.x)) continue;
    for (const [dir, dx, dy] of DIRS) {
      const n = grid.cell(a.x + dx, a.y + dy);
      if (!n || n.core || n.mod) continue;
      const r = canPlace(grid, modDef, n.x, n.y);
      if (r.ok) {
        faces.push({ x: a.x, y: a.y, dir, kind: 'ok' });
        targets.set(n.y * grid.size + n.x, n);
      } else {
        faces.push({ x: a.x, y: a.y, dir, kind: 'bad' }); // любая причина отказа (не подходит, касается двух деталей, замыкает петлю): грань красная
      }
    }
  }
  return { faces, targets: [...targets.values()] };
}
