// Список усилений за повышение уровня. Чистая логика и иконки, без three (тестируется в Node).
// Чтобы добавить усиление: допиши запись в UPGRADES и строку с weight/value в config.upgrades.
// Шанс выпадения = weight / сумма весов всех усилений. В окне выбора они не повторяются.

const S = (body) => `<svg viewBox="0 0 64 64" aria-hidden="true"><defs>
<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>${body}</svg>`;
// Единый стиль: заливка цветом усиления, светлая кромка и блик сверху. Цвет задаёт CSS через currentColor.
const glyph = (d) => S(`<path d="${d}" fill="currentColor" stroke="#fff" stroke-opacity=".8" stroke-width="2.5" stroke-linejoin="round"/>
<path d="${d}" fill="url(#g)" opacity=".5"/>`);

export const UPGRADES = [
  {
    id: 'hp', name: 'Vitality', color: '#ff5470',
    text: (v) => `+${pct(v)}% max health`,
    icon: glyph('M32 55C14 41 8 30 8 21c0-7 5-12 12-12 5 0 9 3 12 7 3-4 7-7 12-7 7 0 12 5 12 12 0 9-6 20-24 34z'),
    apply: (stats, v) => { stats.bonus.hp += v; },
  },
  {
    id: 'speed', name: 'Swiftness', color: '#ffd24a',
    text: (v) => `+${pct(v)}% move speed`,
    icon: glyph('M37 6 15 36h14l-5 22 25-32H34z'),
    apply: (stats, v) => { stats.bonus.speed += v; },
  },
  {
    id: 'pickup', name: 'Magnetism', color: '#5ad6c8',
    text: (v) => `+${pct(v)}% pickup radius`,
    icon: glyph('M10 10h16v18a6 6 0 0 0 12 0V10h16v18a22 22 0 0 1-44 0z'),
    apply: (stats, v) => { stats.bonus.pickup += v; },
  },
  {
    id: 'xp', name: 'Insight', color: '#6fd0ff',
    text: (v) => `+${pct(v)}% experience`,
    icon: glyph('M32 5 51 32 32 59 13 32z'),
    apply: (stats, v) => { stats.bonus.xp += v; },
  },
  {
    id: 'blockTime', name: 'Bulwark', color: '#8ec5ff',
    text: (v) => `+${pct(v)}% block time`,
    icon: glyph('M32 5 52 12v16c0 14-8 24-20 31C20 52 12 42 12 28V12z'),
    apply: (stats, v) => { stats.bonus.block += v; },
  },
  {
    id: 'soul10', name: 'Soul Harvest ×1.1', color: '#58a8ff', maxPicks: 5, rarity: 'rare',
    text: () => 'Multiply souls earned at the end of the run. Max 5.',
    icon: glyph('M32 5C18 15 12 26 12 37c0 13 9 22 20 22s20-9 20-22C52 26 46 15 32 5zm0 16c5 7 9 12 9 19 0 6-4 11-9 11s-9-5-9-11c0-7 4-12 9-19z'),
    apply: (stats) => { stats.soulMods.soul10++; },
  },
  {
    id: 'soul50', name: 'Soul Ascension ×1.5', color: '#ffcb58', maxPicks: 3, rarity: 'legendary',
    text: () => 'Multiply souls earned at the end of the run. Max 3.',
    icon: glyph('M32 2 39 22 61 24 44 38 49 60 32 48 15 60 20 38 3 24 25 22z'),
    apply: (stats) => { stats.soulMods.soul50++; },
  },
  {
    id: 'soul100', name: 'Soul Eclipse ×2', color: '#ff565c', maxPicks: 1, rarity: 'mythic',
    text: () => 'Double souls earned at the end of the run. Only 1.',
    icon: glyph('M32 4a28 28 0 1 0 0 56 28 28 0 1 0 0-56zm0 10a18 18 0 1 1 0 36 18 18 0 1 1 0-36z'),
    apply: (stats) => { stats.soulMods.soul100++; },
  },
];

function pct(v) { return Math.round(v * 1000) / 10; }

const BY_ID = new Map(UPGRADES.map((u) => [u.id, u]));
export const upgradeById = (id) => BY_ID.get(id);

/** Шанс выпадения усиления в процентах от всех (только с положительным весом). */
export function chances(cfg) {
  const w = UPGRADES.map((u) => Math.max(0, (cfg.upgrades[u.id] || {}).weight || 0));
  const sum = w.reduce((a, b) => a + b, 0);
  const out = {};
  UPGRADES.forEach((u, i) => { out[u.id] = sum > 0 ? (100 * w[i]) / sum : 0; });
  return out;
}

/** n разных усилений по весам. rnd: () => [0,1). Если подходящих меньше n, возвращает сколько есть. */
export function pickChoices(cfg, n = 2, rnd = Math.random, stats = null) {
  const pool = UPGRADES.filter((u) => ((cfg.upgrades[u.id] || {}).weight || 0) > 0
    && (!u.maxPicks || !stats || (stats.soulMods?.[u.id] || 0) < u.maxPicks));
  const out = [];
  while (out.length < n && pool.length) {
    const sum = pool.reduce((a, u) => a + cfg.upgrades[u.id].weight, 0);
    let r = rnd() * sum;
    let i = 0;
    for (; i < pool.length - 1; i++) { r -= cfg.upgrades[pool[i].id].weight; if (r < 0) break; }
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

/** Применить усиление id к Stats. Возвращает false, если такого нет. */
export function applyUpgrade(cfg, stats, id) {
  const u = BY_ID.get(id);
  if (!u || !cfg.upgrades[id] || (u.maxPicks && (stats.soulMods?.[id] || 0) >= u.maxPicks)) return false;
  u.apply(stats, cfg.upgrades[id].value);
  return true;
}
