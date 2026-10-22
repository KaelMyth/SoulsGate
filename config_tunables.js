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

  { group: 'Опыт', path: 'xp.gainMult', label: 'Скорость набора опыта (множитель)', min: 0.2, max: 5, step: 0.1 },
  { group: 'Опыт', path: 'xp.pickupRadius', label: 'Радиус притягивания камней', min: 20, max: 250, step: 5 },
  { group: 'Опыт', path: 'gems.green.value', label: 'Опыт зелёного камня', min: 1, max: 10, step: 1 },
  { group: 'Опыт', path: 'gems.red.value', label: 'Опыт красного камня (бык)', min: 1, max: 50, step: 1 },

  { group: 'Бык', path: 'enemies.bull.hp', label: 'Здоровье (у новых врагов)', min: 10, max: 300, step: 5 },
  { group: 'Бык', path: 'enemies.bull.speed', label: 'Скорость подхода', min: 20, max: 200, step: 5 },
  { group: 'Бык', path: 'enemies.bull.attack.windup', label: 'Замах (сигнал для парирования), с', min: 0.2, max: 2, step: 0.05 },
  { group: 'Бык', path: 'enemies.bull.attack.strike', label: 'Время рывка, с', min: 0.1, max: 0.8, step: 0.02 },
  { group: 'Бык', path: 'enemies.bull.attack.length', label: 'Длина рывка', min: 80, max: 500, step: 10 },
  { group: 'Бык', path: 'enemies.bull.attack.recovery', label: 'Восстановление после рывка, с', min: 0.2, max: 2, step: 0.05 },
  { group: 'Бык', path: 'enemies.bull.attack.cooldown', label: 'Пауза между атаками, с', min: 0.5, max: 6, step: 0.1 },
  { group: 'Бык', path: 'enemies.bull.attack.damage', label: 'Урон рывка', min: 1, max: 60, step: 1 },
  { group: 'Бык', path: 'enemies.bull.attack.parryKnock', label: 'Отлёт в бок при парировании', min: 20, max: 200, step: 5 },
  { group: 'Бык', path: 'enemies.bull.attack.parryStun', label: 'Оглушение при парировании, с', min: 0, max: 3, step: 0.1 },

  { group: 'Стая жуков', path: 'swarm.clusterRadius', label: 'Радиус, на котором жуки видят друг друга', min: 20, max: 79, step: 1 },
  { group: 'Стая жуков', path: 'swarm.cohesion', label: 'Тяга друг к другу', min: 0, max: 2, step: 0.05 },
  { group: 'Стая жуков', path: 'swarm.alignment', label: 'Общий курс стаи', min: 0, max: 2, step: 0.05 },
  { group: 'Стая жуков', path: 'swarm.separationIters', label: 'Теснота (проходов за шаг)', min: 0, max: 4, step: 1 },

  { group: 'Волны', path: 'spawn.countMult', label: 'Множитель численности врагов', min: 0.2, max: 5, step: 0.1 },
  { group: 'Волны', path: 'spawn.bullShare', label: 'Доля быков (с 4-й волны)', min: 0, max: 0.6, step: 0.02 },
  { group: 'Волны', path: 'waves.intermission', label: 'Передышка между волнами, с', min: 0.5, max: 6, step: 0.5 },
  { group: 'Волны', path: 'waves.startWave', label: 'Прыгнуть на волну (10 = краш-тест)', min: 1, max: 10, step: 1 },
  { group: 'Волны', path: 'limits.maxEnemies', label: 'Жёсткий потолок живых врагов', min: 50, max: 2000, step: 50 },
  { group: 'Волны', path: 'limits.maxShots', label: 'Жёсткий потолок снарядов', min: 5, max: 200, step: 5 },

  { group: 'Краш-тест (волна 10)', path: 'waves.crash.capGrowth', label: 'Прирост потолка врагов, в секунду', min: 0.5, max: 30, step: 0.5 },
  { group: 'Краш-тест (волна 10)', path: 'waves.crash.minInterval', label: 'Мин. интервал появления, с', min: 0.02, max: 1, step: 0.02 },
  { group: 'Краш-тест (волна 10)', path: 'waves.crash.godMode', label: 'Герой бессмертен (0 нет, 1 да)', min: 0, max: 1, step: 1 },
  { group: 'Краш-тест (волна 10)', path: 'waves.crash.fpsThreshold', label: 'Порог просадки FPS', min: 20, max: 59, step: 1 },

  { group: 'Блок и парирование', path: 'block.duration', label: 'Длительность блока, с', min: 0.5, max: 3, step: 0.1 },
  { group: 'Блок и парирование', path: 'block.parryWindow', label: 'Окно парирования, с', min: 0.1, max: 1, step: 0.05 },
  { group: 'Блок и парирование', path: 'block.cooldown', label: 'Перезарядка блока, с', min: 0.3, max: 5, step: 0.1 },
  { group: 'Блок и парирование', path: 'block.cancelCooldown', label: 'Перезарядка, если блок снят рано, с', min: 0, max: 2, step: 0.1 },
  { group: 'Блок и парирование', path: 'block.power', label: 'Сила блока: сколько урона впитывает', min: 10, max: 500, step: 10 },
  { group: 'Блок и парирование', path: 'block.startDelay', label: 'Задержка включения блока, с', min: 0, max: 0.4, step: 0.01 },
  { group: 'Блок и парирование', path: 'block.hitStop', label: 'Остановка времени при парировании, с', min: 0, max: 0.3, step: 0.01 },

  { group: 'Рывок', path: 'dash.distance', label: 'Дальность рывка', min: 40, max: 300, step: 5 },
  { group: 'Рывок', path: 'dash.duration', label: 'Время рывка, с', min: 0.05, max: 0.4, step: 0.01 },
  { group: 'Рывок', path: 'dash.decay', label: 'Торможение в рывке (меньше = резче), с', min: 0.02, max: 0.3, step: 0.01 },
  { group: 'Рывок', path: 'dash.glide', label: 'Инерция после рывка, с', min: 0.02, max: 0.6, step: 0.02 },
  { group: 'Рывок', path: 'dash.cooldown', label: 'Перезарядка рывка, с', min: 0.3, max: 4, step: 0.1 },
  { group: 'Рывок', path: 'dash.invuln', label: 'Неуязвимость на рывок, с', min: 0, max: 0.5, step: 0.02 },
  { group: 'Рывок', path: 'dash.doubleWindow', label: 'Окно двойного свайпа, с', min: 0.15, max: 0.8, step: 0.05 },
  { group: 'Рывок', path: 'dash.swipeMaxTime', label: 'Макс. длительность свайпа, с', min: 0.1, max: 0.5, step: 0.01 },
  { group: 'Рывок', path: 'dash.swipeMinMag', label: 'Мин. отклонение стика для свайпа', min: 0.3, max: 1, step: 0.05 },

  { group: 'Жук-стрелок', path: 'enemies.shooter.hp', label: 'Здоровье (у новых врагов)', min: 5, max: 200, step: 5 },
  { group: 'Жук-стрелок', path: 'enemies.shooter.speed', label: 'Скорость', min: 20, max: 200, step: 5 },
  { group: 'Жук-стрелок', path: 'enemies.shooter.keepDistance', label: 'Дистанция, на которой стоит', min: 60, max: 300, step: 10 },
  { group: 'Жук-стрелок', path: 'enemies.shooter.aimTime', label: 'Прицеливание (сигнал для парирования), с', min: 0.1, max: 1.5, step: 0.05 },
  { group: 'Жук-стрелок', path: 'enemies.shooter.fireInterval', label: 'Пауза между выстрелами, с', min: 0.5, max: 6, step: 0.1 },
  { group: 'Жук-стрелок', path: 'enemies.shooter.shot.speed', label: 'Скорость снаряда', min: 60, max: 400, step: 10 },
  { group: 'Жук-стрелок', path: 'enemies.shooter.shot.damage', label: 'Урон снаряда', min: 1, max: 50, step: 1 },
  { group: 'Жук-стрелок', path: 'spawn.shooterShare', label: 'Доля стрелков среди врагов', min: 0, max: 1, step: 0.05 },

  { group: 'Управление', path: 'stick.radius', label: 'Радиус стика, px', min: 30, max: 120, step: 2 },
  { group: 'Управление', path: 'stick.deadzone', label: 'Мёртвая зона стика', min: 0, max: 0.4, step: 0.01 },

  { group: 'Поле билда', path: 'build.size', label: 'Сторона поля (перерасставляет ядра)', min: 5, max: 9, step: 1 },
  { group: 'Поле билда', path: 'build.minCoreDistance', label: 'Мин. расстояние между ядрами', min: 2, max: 6, step: 1 },

  { group: 'Камера и экран', path: 'camera.viewWidth', label: 'Обзор: ширина экрана в единицах', min: 240, max: 800, step: 10 },
  { group: 'Камера и экран', path: 'camera.smoothTime', label: 'Плавность камеры, с', min: 0, max: 0.5, step: 0.01 },
  { group: 'Камера и экран', path: 'render.maxDpr', label: 'Чёткость (макс. DPR)', min: 1, max: 3, step: 0.5 },
];
