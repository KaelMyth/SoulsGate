// Эффект «всплеск»: расходящееся и тающее кольцо. Анимации в прототипе нет, вместо неё такие вспышки.

export function createEffect() {
  return { active: false, x: 0, y: 0, age: 0, life: 0.3, r0: 0, r1: 20, color: '#fff', angle: null };
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
}

export function updateEffect(e, dt) {
  e.age += dt;
  if (e.age >= e.life) e.active = false;
}
