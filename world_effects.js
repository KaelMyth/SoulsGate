// Эффект «всплеск»: расходящееся и тающее кольцо. Анимации в прототипе нет, вместо неё такие вспышки.
// Виды (kind): 0 — кольцо или искра (угол angle), 1 — капля слизи: летит со скоростью (vx, vy), тормозит и тает.

export function createEffect() {
  return {
    active: false, x: 0, y: 0, age: 0, life: 0.3, r0: 0, r1: 20, color: '#fff', angle: null,
    kind: 0, vx: 0, vy: 0, size: 0, drag: 0,
  };
}

export function resetEffect(e) {
  e.active = false;
}

/** angle: если задан, это искра: короткая чёрточка, летящая от r0 до r1 по этому углу; иначе кольцо. */
export function initEffect(e, x, y, life, r0, r1, color, angle) {
  e.x = x;
  e.y = y;
  e.age = 0;
  e.life = life;
  e.r0 = r0;
  e.r1 = r1;
  e.color = color;
  e.angle = angle === undefined ? null : angle;
  e.kind = 0;
  e.size = 0;
}

/** Капля слизи: стартует в (x, y) со скоростью (vx, vy); drag — как быстро тормозит (1/с); size — радиус, единиц. */
export function initGlob(e, x, y, life, vx, vy, size, color, drag) {
  e.x = x;
  e.y = y;
  e.age = 0;
  e.life = life;
  e.color = color;
  e.angle = null;
  e.kind = 1;
  e.vx = vx;
  e.vy = vy;
  e.size = size;
  e.drag = drag;
}

export function updateEffect(e, dt) {
  e.age += dt;
  if (e.kind === 1) {
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    const k = Math.exp(-e.drag * dt);
    e.vx *= k;
    e.vy *= k;
  }
  if (e.age >= e.life) e.active = false;
}
