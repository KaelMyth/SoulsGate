// Правила прикрепления мода: можно ли поставить его в клетку и какие грани подсвечивать.
// Мод крепится гранью к ядру или к моду своей ветки. Ветки разных ядер гранями не касаются.
// Совместимость: у ядра должен быть стат, который мод меняет (effect.stat), иначе ядру мод не подходит.

export function coreAccepts(core, modDef) {
  return (core.def.stats || []).some((s) => s.key === modDef.effect.stat);
}

/** Можно ли поставить мод modDef в клетку (x, y). { ok, reason, core } */
export function canPlace(grid, modDef, x, y) {
  const c = grid.cell(x, y);
  if (!c) return { ok: false, reason: 'out' };
  if (c.core || c.mod) return { ok: false, reason: 'busy' };
  const owner = grid.branches();
  const owners = new Set();
  for (const n of grid.neighbors(x, y)) {
    const id = owner.get(n.y * grid.size + n.x);
    if (id) owners.add(id);
  }
  if (owners.size === 0) return { ok: false, reason: 'no-anchor' };
  if (owners.size > 1) return { ok: false, reason: 'touch-other' };
  const core = grid.coreById([...owners][0]);
  if (!coreAccepts(core, modDef)) return { ok: false, reason: 'incompatible', core };
  return { ok: true, reason: '', core };
}

const DIRS = [['t', 0, -1], ['r', 1, 0], ['b', 0, 1], ['l', -1, 0]];

/**
 * Что подсвечивать при выбранном моде: { faces, targets }.
 * faces: грани ячеек-якорей (ядер и модов): { x, y, dir: 't'|'r'|'b'|'l', kind: 'ok'|'bad' },
 *   ok: сюда мод можно прикрепить, bad: у ветки нет подходящего стата (грани ядра щита красные).
 * targets: клетки, куда мод можно поставить.
 */
export function highlight(grid, modDef) {
  const owner = grid.branches();
  const faces = [];
  const targets = new Map();
  for (const a of grid.cells) {
    const id = owner.get(a.y * grid.size + a.x);
    if (!id) continue;
    const core = grid.coreById(id);
    const accepts = coreAccepts(core, modDef);
    for (const [dir, dx, dy] of DIRS) {
      const n = grid.cell(a.x + dx, a.y + dy);
      if (!n || n.core || n.mod) continue;
      if (!accepts) {
        faces.push({ x: a.x, y: a.y, dir, kind: 'bad' });
        continue;
      }
      if (canPlace(grid, modDef, n.x, n.y).ok) {
        faces.push({ x: a.x, y: a.y, dir, kind: 'ok' });
        targets.set(n.y * grid.size + n.x, n);
      }
    }
  }
  return { faces, targets: [...targets.values()] };
}
