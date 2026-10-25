// Снаряд. Его свойства (урон, скорость, размер, дальность) копируются из описания в конфиге
// в момент выстрела: позже эти поля будет менять конструктор, а код полёта останется прежним.

export function createProjectile() {
  return {
    active: false,
    x: 0, y: 0, prevX: 0, prevY: 0, // прошлое положение: для плавной отрисовки между шагами
    vx: 0, vy: 0,
    radius: 0, damage: 0, speed: 0, range: 0,
    knockback: 0, // насколько откидывает врага при попадании, единиц
    parryable: false, // можно ли парировать (снаряды стрелков)
    frost: false, // замораживающий снаряд (мод «Мороз»)
    pierce: 0,    // сколько врагов снаряд ещё может пройти насквозь
    hits: [],     // кого уже пробил (чтобы не бить одного дважды)
    steam: 0,     // связка Мороз+Горение: множитель горения облака пара (0 = нет связки)
    gen: 0,       // поколение фантомного выстрела: 0 обычный, 1 порождён им, и так далее
    phantom: 0,   // шанс породить фантом при попадании (0 = мод не стоит)
    burnDmg: 0, burnInt: 0, // поджог при попадании: урон тика и интервал (0 = не поджигает)
    travelled: 0,
    color: '#fff',
    glow: 0,      // 0..1: сила свечения огненного шара (растёт с числом снарядов), только для отрисовки
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
  p.knockback = def.knockback || 0;
  p.parryable = !!def.parryable;
  p.burnDmg = 0;
  p.burnInt = 0;
  p.frost = false;
  p.steam = 0;
  p.pierce = 0;
  p.gen = 0;
  p.phantom = 0;
  p.hits.length = 0;
  p.travelled = 0;
  p.color = def.color;
  p.glow = 0;
  p.owner = owner;
}

/**
 * Летит по прямой; исчезает, пролетев дальность, выйдя за арену или упёршись в скалу.
 * Возвращает причину исчезновения ('range' | 'edge' | 'rock') или null, если летит дальше.
 */
export function updateProjectile(p, dt, arena) {
  p.prevX = p.x;
  p.prevY = p.y;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.travelled += p.speed * dt;
  if (p.x < arena.left || p.x > arena.right || p.y < arena.top || p.y > arena.bottom) {
    p.active = false;
    return 'edge';
  }
  if (arena.circleHitsRock(p.x, p.y, p.radius)) {
    p.active = false;
    return 'rock';
  }
  if (p.travelled >= p.range) {
    p.active = false;
    return 'range';
  }
  return null;
}
