// Посох мага и его усиления (чистая логика, без графики). Базовые числа атаки лежат в CONFIG.attack,
// каждый потраченный кристалл усиления меняет одно из трёх: power (урон), speed (перезарядка), range (дальность).
export const PARTS = ['power', 'speed', 'range'];

/** Текущие числа посоха при заданных потраченных кристаллах up = { power, speed, range }. */
export function staffStats(cfg, up) {
  const S = cfg.staff;
  const A = cfg.attack;
  const damage = A.damage + S.power.perStone * up.power;
  const interval = Math.max(S.speed.min, A.interval * Math.pow(S.speed.mult, up.speed));
  const range = A.range + S.range.perStone * up.range;
  // Мощь посоха: урон в секунду, умноженный на относительную дальность; 20 у посоха без усилений.
  const might = Math.round((damage / interval) * (range / A.range) * 10);
  return { damage, interval, range, might };
}
