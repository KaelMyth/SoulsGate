// Фантомный выстрел: общая часть для снаряда, лазера и клинков.

/**
 * Точка появления фантома рядом с врагом e: на среднем расстоянии phantom.distance под случайным углом,
 * не за краем арены и не в скале, с чистой линией до врага. Пишет в out {x, y, d} и возвращает true; не нашла за 6 попыток: false.
 */
export function phantomSpot(arena, rnd, F, e, pad, out) {
  for (let tries = 0; tries < 6; tries++) {
    const a = rnd() * Math.PI * 2;
    const d = F.distance * (1 + (rnd() * 2 - 1) * F.spread);
    const x = e.x + Math.cos(a) * d;
    const y = e.y + Math.sin(a) * d;
    if (x < arena.left + 8 || x > arena.right - 8 || y < arena.top + 8 || y > arena.bottom - 8) continue;
    if (arena.circleHitsRock(x, y, pad) || arena.segmentBlocked(x, y, e.x, e.y, pad)) continue;
    out.x = x;
    out.y = y;
    out.d = d;
    return true;
  }
  return false;
}

/** Общая вероятность фантома: не бросаем RNG, если шанс ниже порога (по умолчанию 5%). */
export function phantomRoll(F, rnd, chance, gen) {
  if (!(chance > 0) || gen >= F.maxChain) return false;
  const actualChance = chance * Math.pow(F.decay, gen);
  if (actualChance < (F.minChance ?? 0.05)) return false;
  return rnd() < actualChance;
}
