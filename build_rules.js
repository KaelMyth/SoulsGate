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
  if (e.kind === 'pierce' || e.kind === 'blades' || e.kind === 'aura') return false; // «Пробитие» и «Клинки» крепятся только к ядру
  if (e.kind === 'double') return !['burn', 'frost', 'steam'].includes(carry); // на «Лазере» и «Дроби» множитель увеличивает число снарядов, как на ядре
  // Связка: «Мороз» крепится к «Горению», а «Горение» к «Морозу». Больше они ни к чему, кроме ядра, не крепятся.
  if (e.kind === 'frost') return carry === 'burn' || carry === 'laser' || carry === 'blades' || carry === 'aura';
  if (e.kind === 'burn') return carry === 'frost' || carry === 'steam' || carry === 'laser' || carry === 'blades' || carry === 'aura';
  if (carry === 'frost') return false; // одинокий «Мороз»: урон на нём ничего не усиливает
  if (carry === 'burn') return e.stat === 'damage' || e.stat === 'rate'; // к «Горению»: урон тика и частота тиков
  if (carry === 'aura') return e.stat === 'damage' || e.stat === 'rate'; // к «Ауре»: урон тика и число тиков
  if (carry === 'blades') return e.stat === 'damage' || e.stat === 'rate'; // к «Клинкам»: урон и скорость появления
  if (carry === 'laser') return e.stat === 'damage' || e.stat === 'rate'; // к «Лазеру»: урон тика и число тиков
  if (carry === 'steam') return e.stat === 'damage'; // к «Морозу» в связке: урон горения облака пара
  if (carry.startsWith('burn:') || carry.startsWith('steam:') || carry.startsWith('laser:') || carry.startsWith('blades:') || carry.startsWith('aura:')) return carry.endsWith(':' + e.stat); // дальше по цепочке: то же самое
  return carry === e.stat;
}

/** Можно ли поставить мод modDef в клетку (x, y). { ok, reason, core } */
export function canPlace(grid, modDef, x, y) {
  const c = grid.cell(x, y);
  if (!c) return { ok: false, reason: 'out' };
  if (c.core || c.mod) return { ok: false, reason: 'busy' };
  if (modDef.effect && modDef.effect.secondary) return { ok: true, reason: '', core: null }; // вторичное ядро: в любую пустую клетку
  const t = grid.tree();
  const nodes = grid.neighbors(x, y).filter((n) => t.owner.has(n.y * grid.size + n.x));
  if (nodes.length === 0) return { ok: false, reason: 'no-anchor' };
  if (nodes.length > 1) {
    const ids = new Set(nodes.map((n) => t.owner.get(n.y * grid.size + n.x)));
    return { ok: false, reason: ids.size > 1 ? 'touch-other' : 'loop' };
  }
  const n = nodes[0];
  const core = grid.coreById(t.owner.get(n.y * grid.size + n.x));
  const ok = parentAccepts(modDef, n.core || null, t.carry.get(n.y * grid.size + n.x), core);
  return { ok, reason: ok ? '' : 'incompatible', core };
}

const DIRS = [['t', 0, -1], ['r', 1, 0], ['b', 0, 1], ['l', -1, 0]];

/**
 * Что подсвечивать при выбранном моде: { faces, targets }.
 * faces: грани деталей-якорей: { x, y, dir: 't'|'r'|'b'|'l', kind: 'ok'|'bad' },
 *   ok: сюда мод можно прикрепить, bad: этой детали он не подходит (грани щита красные у «Мощи»: у щита нет урона).
 * targets: клетки, куда мод можно поставить.
 */
export function highlight(grid, modDef) {
  if (modDef.effect && modDef.effect.secondary) return { faces: [], targets: grid.cells.filter((c) => !c.core && !c.mod) }; // любая пустая клетка
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
      } else if (r.reason === 'incompatible') {
        faces.push({ x: a.x, y: a.y, dir, kind: 'bad' });
      }
    }
  }
  return { faces, targets: [...targets.values()] };
}
