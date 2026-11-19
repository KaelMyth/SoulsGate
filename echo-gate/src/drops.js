// Таблица добычи с жука (чистая логика, без графики). Опыт падает всегда, остальное по независимым шансам.
// Возвращает список типов: 'xp' | 'power' | 'skill' | 'page'. rng: () => число 0..1 (для тестов подставляется).
export function rollDrops(cfg, rng = Math.random) {
  const out = ['xp'];
  if (rng() < cfg.power.chance) out.push('power');
  if (rng() < cfg.skill.chance) out.push('skill');
  if (rng() < cfg.page.chance) out.push('page');
  return out;
}
