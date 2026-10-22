// Случайная расстановка ядер: внутри сетки, не на краях, не вплотную друг к другу
// (ветки разных ядер не должны касаться гранями, а место для веток нужно).

/**
 * count клеток { x, y } внутри size×size, не на краю. Расстояние между любыми двумя (по клеткам,
 * манхэттенское) не меньше minDist; если так не получается, требование смягчается до 2
 * (хотя бы не соседние по грани), а в совсем тесной сетке до 1.
 * rnd: функция 0..1. Возвращает массив длины count или меньше, если в сетке нет столько внутренних клеток.
 */
export function pickCoreCells(size, count, rnd, minDist) {
  const inner = [];
  for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) inner.push({ x, y });
  const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  // Жадный выбор может зайти в тупик (первое ядро в центре, парное с нужным расстоянием уже не найти):
  // поэтому несколько попыток на каждое требование, и только потом требование смягчается.
  for (let need = Math.max(1, minDist); need >= 1; need--) {
    for (let attempt = 0; attempt < 60; attempt++) {
      const chosen = [];
      const pool = inner.slice();
      while (chosen.length < count && pool.length) {
        const i = Math.floor(rnd() * pool.length) % pool.length;
        const c = pool.splice(i, 1)[0];
        if (chosen.every((o) => dist(o, c) >= need)) chosen.push(c);
      }
      if (chosen.length === Math.min(count, inner.length)) return chosen;
    }
  }
  return inner.slice(0, count);
}

/** Расставить ядра из config.cores по сетке. order: ключи ядер по порядку (по умолчанию все из конфига). */
export function layoutCores(grid, cores, rnd, minDist, order) {
  grid.clear();
  const ids = order || Object.keys(cores);
  const spots = pickCoreCells(grid.size, ids.length, rnd, minDist);
  ids.forEach((id, i) => {
    if (spots[i]) grid.placeCore(id, cores[id], spots[i].x, spots[i].y);
  });
  return grid;
}
