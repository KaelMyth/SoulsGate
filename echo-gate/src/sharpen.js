// Заточка снаряжения (чистая логика, без графики): шанс, цена в камнях, прибавка к характеристикам, поломка и выкуп.
// Таблицы лежат в CONFIG.sharpen. Пока заточка только записывается на предмет (+N): на атаку она ещё не влияет.

/** Сведения о попытке заточить предмет с уровнем заточки level до level + 1. */
export function sharpenInfo(cfg, level) {
  const S = cfg.sharpen;
  if (level >= S.maxLevel) return { maxed: true, level, next: level, chance: 0, cost: 0, bonusNow: bonusAt(cfg, level), bonusNext: bonusAt(cfg, level) };
  const chance = Math.max(S.minChance, S.firstChance - S.chanceStep * level);
  return { maxed: false, level, next: level + 1, chance, cost: level + 1, bonusNow: bonusAt(cfg, level), bonusNext: bonusAt(cfg, level + 1) };
}

/** Прибавка к характеристикам (в процентах) у предмета с заточкой level. */
export function bonusAt(cfg, level) {
  return level <= 0 ? 0 : cfg.sharpen.bonus[Math.min(level, cfg.sharpen.bonus.length) - 1];
}

/** Числа стандартного посоха при заточке level: { damage, rate (выстрелов/с), range (м) }. */
export function sharpenedStats(cfg, level) {
  const k = 1 + bonusAt(cfg, level) / 100;
  const A = cfg.attack;
  return { damage: A.damage * k, rate: (1 / A.interval) * k, range: A.range * k };
}

/** Цена выкупа сломанного предмета в душах: 500 × уровень заточки (у предмета без заточки как за +1). */
export function repairCost(cfg, item) {
  return cfg.inventory.repairSoulsPerLevel * Math.max(1, item.sharpen || 0);
}

/**
 * Попытка заточки. Камни тратятся в любом случае. Удача: sharpen + 1. Провал: предмет ломается и уходит в inv.broken.
 * Возвращает { ok: bool, broken: bool, reason?: string, level }.
 */
export function attemptSharpen(cfg, inv, item, rng = Math.random) {
  if (!item || item.kind !== 'staff') return { ok: false, broken: false, reason: 'notStaff', level: 0 };
  const info = sharpenInfo(cfg, item.sharpen);
  if (info.maxed) return { ok: false, broken: false, reason: 'maxed', level: item.sharpen };
  if (!inv.takeGems(info.cost)) return { ok: false, broken: false, reason: 'gems', level: item.sharpen };
  if (rng() < info.chance) {
    item.sharpen = info.next;
    inv.changed();
    return { ok: true, broken: false, level: item.sharpen };
  }
  inv.breakItem(item);
  return { ok: false, broken: true, level: item.sharpen };
}
