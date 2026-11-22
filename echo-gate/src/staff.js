// Посох мага и его усиления (чистая логика, без графики). Базовые числа атаки лежат в CONFIG.attack,
// каждый потраченный кристалл усиления меняет одно из трёх: power (урон), speed (перезарядка), range (дальность).
import { bonusAt } from './sharpen.js';

export const PARTS = ['power', 'speed', 'range'];

/** Текущие числа посоха при заданных потраченных кристаллах up = { power, speed, range } и уровне заточки надетого посоха (sharpen). */
export function staffStats(cfg, up, sharpen = 0) {
  const S = cfg.staff;
  const A = cfg.attack;
  const k = 1 + bonusAt(cfg, sharpen) / 100; // заточка одинаково усиливает урон, скорость атаки и дальность
  const damage = (A.damage + S.power.perStone * up.power) * k;
  const interval = Math.max(S.speed.min, A.interval * Math.pow(S.speed.mult, up.speed) / k);
  const range = (A.range + S.range.perStone * up.range) * k;
  // Мощь посоха: урон в секунду, умноженный на относительную дальность; 13 у посоха без усилений.
  const might = Math.round((damage / interval) * (range / A.range) * 10);
  return { damage, interval, range, might };
}
