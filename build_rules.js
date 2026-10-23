// Правила прикрепления мода: можно ли поставить его в клетку и какие грани подсвечивать.
// Мод крепится гранью ровно к одной детали (ядро или другой мод). Клетка, которая касается двух деталей
// (своей ветки или чужой), не подходит: так ветки остаются деревом и не склеиваются.
// Совместимость с родителем:
//   «bonus» мод (Мощь): ядро должно иметь этот стат, мод-родитель должен нести тот же стат;
//   «double» мод (Х2): ядро должно иметь multStat, мод-родитель должен нести какой-то стат.

/** Подходит ли мод modDef родителю: ядру (core) или моду (carry: стат, который тот несёт). */
export function parentAccepts(modDef, core, carry) {
  const e = modDef.effect;
  if (core) {
    if (e.kind === 'double') return !!core.def.multStat;
    if (e.kind === 'burn') return !!core.def.canBurn;
    if (e.kind === 'frost') return !!core.def.canFrost;
    return (core.def.stats || []).some((s) => s.key === e.stat);
  }
  if (!carry) return false;
  if (e.kind === 'double') return carry !== 'burn' && carry !== 'frost'; // на самом «Горении» множитель не нужен: он усиливает то, что на нём
  if (e.kind === 'burn' || e.kind === 'frost') return false; // «Горение» и «Мороз» крепятся только к ядру
  if (carry === 'frost') return false; // к «Морозу» ничего не крепится
  if (carry === 'burn') return e.stat === 'damage' || e.stat === 'rate'; // к «Горению»: урон тика и частота тиков
  if (carry.startsWith('burn:')) return carry === 'burn:' + e.stat; // дальше по цепочке: то же самое
  return carry === e.stat;
}

/** Можно ли поставить мод modDef в клетку (x, y). { ok, reason, core } */
export function canPlace(grid, modDef, x, y) {
  const c = grid.cell(x, y);
  if (!c) return { ok: false, reason: 'out' };
  if (c.core || c.mod) return { ok: false, reason: 'busy' };
  const t = grid.tree();
  const nodes = grid.neighbors(x, y).filter((n) => t.owner.has(n.y * grid.size + n.x));
  if (nodes.length === 0) return { ok: false, reason: 'no-anchor' };
  if (nodes.length > 1) {
    const ids = new Set(nodes.map((n) => t.owner.get(n.y * grid.size + n.x)));
    return { ok: false, reason: ids.size > 1 ? 'touch-other' : 'loop' };
  }
  const n = nodes[0];
  const core = grid.coreById(t.owner.get(n.y * grid.size + n.x));
  const ok = parentAccepts(modDef, n.core || null, t.carry.get(n.y * grid.size + n.x));
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
