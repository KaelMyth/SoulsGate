// Снаряд. Его свойства (урон, скорость, размер, дальность) копируются из описания в конфиге
// в момент выстрела: позже эти поля будет менять конструктор, а код полёта останется прежним.

export function createProjectile() {
  return {
    active: false,
    x: 0, y: 0, prevX: 0, prevY: 0, // прошлое положение: для плавной отрисовки между шагами
    vx: 0, vy: 0,
    radius: 0, damage: 0, speed: 0, range: 0,
    travelled: 0,
    color: '#fff',
    owner: null,
  };
}

export function resetProjectile(p) {
  p.active = false;
  p.owner = null;
}

/** def: запись из CONFIG.projectiles; (dirX, dirY): любое ненулевое направление. */
export function initProjectile(p, def, x, y, dirX, dirY, owner) {
  const len = Math.hypot(dirX, dirY) || 1;
  p.x = p.prevX = x;
  p.y = p.prevY = y;
  p.vx = (dirX / len) * def.speed;
  p.vy = (dirY / len) * def.speed;
  p.radius = def.radius;
  p.damage = def.damage;
  p.speed = def.speed;
  p.range = def.range;
  p.travelled = 0;
  p.color = def.color;
  p.owner = owner;
}

/** Летит по прямой; исчезает, пролетев дальность или выйдя за арену. Скалы не мешают. */
export function updateProjectile(p, dt, arena) {
  p.prevX = p.x;
  p.prevY = p.y;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.travelled += p.speed * dt;
  if (
    p.travelled >= p.range ||
    p.x < arena.left || p.x > arena.right ||
    p.y < arena.top || p.y > arena.bottom
  ) {
    p.active = false;
  }
}
