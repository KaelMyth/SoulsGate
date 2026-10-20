// Враг-касатель: бежит к герою и бьёт при касании (урон наносит игра по событию столкновения).
// Все свойства лежат в записи def из CONFIG.enemies; новый враг = новая запись.

export function createEnemy() {
  return {
    active: false,
    x: 0, y: 0, prevX: 0, prevY: 0,
    radius: 12,
    hp: 1, maxHp: 1,
    def: null,
    touchTimer: 0, // пауза до следующего удара по герою
    flash: 0,      // вспышка при попадании, с
  };
}

export function resetEnemy(e) {
  e.active = false;
  e.def = null;
}

export function initEnemy(e, def, x, y) {
  e.x = e.prevX = x;
  e.y = e.prevY = y;
  e.radius = def.radius;
  e.hp = e.maxHp = def.hp;
  e.def = def; // ссылка, не копия: скорость из панели действует на живых врагов сразу
  e.touchTimer = 0;
  e.flash = 0;
}

export function updateEnemy(e, dt, hero, arena) {
  e.prevX = e.x;
  e.prevY = e.y;
  if (e.touchTimer > 0) e.touchTimer -= dt;
  if (e.flash > 0) e.flash -= dt;

  const dx = hero.x - e.x;
  const dy = hero.y - e.y;
  const d = Math.hypot(dx, dy);
  // Не вдавливаемся в героя: останавливаемся, когда фигуры уже касаются.
  const gap = d - (hero.radius + e.radius - 2);
  if (d > 1e-6 && gap > 0) {
    const step = Math.min(e.def.speed * dt, gap);
    e.x += (dx / d) * step;
    e.y += (dy / d) * step;
  }
  arena.resolveCircle(e);
}
