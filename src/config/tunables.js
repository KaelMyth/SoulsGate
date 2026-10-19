// Какие параметры выведены ползунками в отладочную панель.
// Новый ползунок = новая запись: path указывает на значение внутри CONFIG.
export const TUNABLES = [
  { path: 'hero.speed', label: 'Скорость героя', min: 60, max: 400, step: 5 },
  { path: 'hero.accelTime', label: 'Время разгона и остановки, с', min: 0, max: 0.5, step: 0.01 },
  { path: 'stick.radius', label: 'Радиус стика, px', min: 30, max: 120, step: 2 },
  { path: 'stick.deadzone', label: 'Мёртвая зона стика', min: 0, max: 0.4, step: 0.01 },
  { path: 'camera.viewWidth', label: 'Обзор: ширина экрана в единицах', min: 240, max: 800, step: 10 },
  { path: 'camera.smoothTime', label: 'Плавность камеры, с', min: 0, max: 0.5, step: 0.01 },
  { path: 'render.maxDpr', label: 'Чёткость (макс. DPR)', min: 1, max: 3, step: 0.5 },
];
