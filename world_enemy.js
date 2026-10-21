// Враг-касатель: бежит к герою (в обход скал) и бьёт при касании (урон наносит игра по событию столкновения).
// Все свойства лежат в записи def из CONFIG.enemies; новый враг = новая запись.

const dir = { x: 0, y: 0 };

export function createEnemy() {
  return {
    active: false,
    x: 0, y: 0, prevX: 0, prevY: 0,
    radius: 12,
    hp: 1, maxHp: 1,
    def: null,
    touchTimer: 0, // пауза до следующего удара по герою
    flash: 0,      // вспышка при попадании, с
    kbVx: 0, kbVy: 0, // скорость откидывания, быстро затухает
    kbTau: 0.07,      // за сколько секунд затухает откидывание
    hx: 0, hy: 0,     // куда шёл на прошлом шаге (единичный вектор); по нему соседи по стае выравнивают курс
    swX: 0, swY: 0,   // подсказка курса от стаи (сплочённость и согласованность)
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
  e.kbVx = e.kbVy = 0;
  e.hx = e.hy = 0;
  e.swX = e.swY = 0;
}

/**
 * Откинуть врага на distance единиц в направлении (dirX, dirY) за время около tau секунд.
 * Врагу можно задать множитель def.knockbackScale (тяжёлых врагов откидывает меньше).
 */
export function applyKnockback(e, dirX, dirY, distance, tau) {
  const len = Math.hypot(dirX, dirY);
  if (len < 1e-9 || distance <= 0) return;
  const scale = e.def && e.def.knockbackScale !== undefined ? e.def.knockbackScale : 1;
  const t = Math.max(0.01, tau);
  const v0 = (distance * scale) / t;
  e.kbTau = t;
  e.kbVx += (dirX / len) * v0;
  e.kbVy += (dirY / len) * v0;
  const speed = Math.hypot(e.kbVx, e.kbVy);
  const MAX = 1600; // потолок, чтобы сумма модификаторов не выкидывала врага за экран за кадр
  if (speed > MAX) {
    e.kbVx *= MAX / speed;
    e.kbVy *= MAX / speed;
  }
}

/** nav: необязательное поле навигации (NavGrid); без него враг идёт напрямую. */
export function updateEnemy(e, dt, hero, arena, nav) {
  e.prevX = e.x;
  e.prevY = e.y;
  if (e.touchTimer > 0) e.touchTimer -= dt;
  if (e.flash > 0) e.flash -= dt;

  const dx = hero.x - e.x;
  const dy = hero.y - e.y;
  const d = Math.hypot(dx, dy);
  const gap = d - (hero.radius + e.radius - 2);
  if (d > 1e-6 && gap > 0) {
    let mx = dx / d;
    let my = dy / d;
    let direct = true;
    // Скала на пути к герою: идём по полю навигации в обход.
    if (nav && arena.segmentBlocked(e.x, e.y, hero.x, hero.y, e.radius + 2) && nav.direction(e.x, e.y, dir)) {
      mx = dir.x;
      my = dir.y;
      direct = false;
    }
    // Стая: добавляем подсказку соседей к курсу на героя. Цель остаётся главной (вес 1),
    // соседи только подправляют направление.
    if (e.swX !== 0 || e.swY !== 0) {
      mx += e.swX;
      my += e.swY;
      const ml = Math.hypot(mx, my);
      if (ml > 1e-6) {
        mx /= ml;
        my /= ml;
      }
    }
    let step = e.def.speed * dt;
    if (direct && step > gap) step = gap; // не вдавливаемся в героя
    e.x += mx * step;
    e.y += my * step;
    e.hx = mx;
    e.hy = my;
  } else {
    e.hx = e.hy = 0;
  }

  if (e.kbVx !== 0 || e.kbVy !== 0) {
    e.x += e.kbVx * dt;
    e.y += e.kbVy * dt;
    const k = Math.exp(-dt / e.kbTau);
    e.kbVx *= k;
    e.kbVy *= k;
    if (Math.abs(e.kbVx) + Math.abs(e.kbVy) < 1) e.kbVx = e.kbVy = 0;
  }
  arena.resolveCircle(e);
}
