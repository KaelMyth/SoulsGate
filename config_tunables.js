// Какие параметры выведены ползунками в отладочную панель.
// Новый ползунок = новая запись: path указывает на значение внутри CONFIG, group задаёт заголовок раздела.
// Порядок важен: первый ползунок (скорость героя) и последний (DPR) используются автотестами.
export const TUNABLES = [
  { group: 'Герой', path: 'hero.speed', label: 'Скорость героя', min: 60, max: 400, step: 5 },
  { group: 'Герой', path: 'hero.accelTime', label: 'Время разгона и остановки, с', min: 0, max: 0.5, step: 0.01 },
  { group: 'Герой', path: 'hero.maxHp', label: 'Здоровье (с новой жизни)', min: 30, max: 300, step: 5 },
  { group: 'Герой', path: 'hero.iFrames', label: 'Неуязвимость после удара, с', min: 0, max: 1.5, step: 0.05 },

  { group: 'Автоатака', path: 'attack.radius', label: 'Дальность выбора цели', min: 80, max: 400, step: 10 },
  { group: 'Автоатака', path: 'attack.reload', label: 'Перезарядка, с', min: 0.1, max: 2, step: 0.05 },
  { group: 'Автоатака', path: 'projectiles.bolt.damage', label: 'Урон снаряда', min: 1, max: 60, step: 1 },
  { group: 'Автоатака', path: 'projectiles.bolt.speed', label: 'Скорость снаряда', min: 150, max: 700, step: 10 },
  { group: 'Автоатака', path: 'projectiles.bolt.range', label: 'Дальность полёта снаряда', min: 100, max: 600, step: 10 },
  { group: 'Автоатака', path: 'projectiles.bolt.radius', label: 'Размер снаряда', min: 2, max: 14, step: 1 },

  { group: 'Импакт попадания', path: 'projectiles.bolt.knockback', label: 'Откидывание, единиц', min: 0, max: 60, step: 1 },
  { group: 'Импакт попадания', path: 'combat.knockbackTime', label: 'Время откидывания, с', min: 0.02, max: 0.3, step: 0.01 },
  { group: 'Импакт попадания', path: 'combat.hitFlash', label: 'Длительность вспышки, с', min: 0.02, max: 0.4, step: 0.01 },

  { group: 'Жук', path: 'enemies.beetle.hp', label: 'Здоровье (у новых врагов)', min: 5, max: 200, step: 5 },
  { group: 'Жук', path: 'enemies.beetle.speed', label: 'Скорость', min: 20, max: 200, step: 5 },
  { group: 'Жук', path: 'enemies.beetle.touchDamage', label: 'Урон при касании', min: 1, max: 40, step: 1 },
  { group: 'Жук', path: 'enemies.beetle.touchCooldown', label: 'Пауза между ударами, с', min: 0.2, max: 2, step: 0.1 },

  { group: 'Стая жуков', path: 'swarm.clusterRadius', label: 'Радиус, на котором жуки видят друг друга', min: 20, max: 79, step: 1 },
  { group: 'Стая жуков', path: 'swarm.cohesion', label: 'Тяга друг к другу', min: 0, max: 2, step: 0.05 },
  { group: 'Стая жуков', path: 'swarm.alignment', label: 'Общий курс стаи', min: 0, max: 2, step: 0.05 },
  { group: 'Стая жуков', path: 'swarm.separationIters', label: 'Теснота (проходов за шаг)', min: 0, max: 4, step: 1 },

  { group: 'Волны', path: 'spawn.countMult', label: 'Множитель численности врагов', min: 0.2, max: 5, step: 0.1 },
  { group: 'Волны', path: 'waves.intermission', label: 'Передышка между волнами, с', min: 0.5, max: 6, step: 0.5 },
  { group: 'Волны', path: 'waves.startWave', label: 'Прыгнуть на волну (10 = краш-тест)', min: 1, max: 10, step: 1 },
  { group: 'Волны', path: 'limits.maxEnemies', label: 'Жёсткий потолок живых врагов', min: 50, max: 2000, step: 50 },
  { group: 'Волны', path: 'limits.maxShots', label: 'Жёсткий потолок снарядов', min: 5, max: 200, step: 5 },

  { group: 'Краш-тест (волна 10)', path: 'waves.crash.capGrowth', label: 'Прирост потолка врагов, в секунду', min: 0.5, max: 30, step: 0.5 },
  { group: 'Краш-тест (волна 10)', path: 'waves.crash.minInterval', label: 'Мин. интервал появления, с', min: 0.02, max: 1, step: 0.02 },
  { group: 'Краш-тест (волна 10)', path: 'waves.crash.godMode', label: 'Герой бессмертен (0 нет, 1 да)', min: 0, max: 1, step: 1 },
  { group: 'Краш-тест (волна 10)', path: 'waves.crash.fpsThreshold', label: 'Порог просадки FPS', min: 20, max: 59, step: 1 },

  { group: 'Управление', path: 'stick.radius', label: 'Радиус стика, px', min: 30, max: 120, step: 2 },
  { group: 'Управление', path: 'stick.deadzone', label: 'Мёртвая зона стика', min: 0, max: 0.4, step: 0.01 },

  { group: 'Камера и экран', path: 'camera.viewWidth', label: 'Обзор: ширина экрана в единицах', min: 240, max: 800, step: 10 },
  { group: 'Камера и экран', path: 'camera.smoothTime', label: 'Плавность камеры, с', min: 0, max: 0.5, step: 0.01 },
  { group: 'Камера и экран', path: 'render.maxDpr', label: 'Чёткость (макс. DPR)', min: 1, max: 3, step: 0.5 },
];
