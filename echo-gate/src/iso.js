// Изометрия: перевод экранного вектора стика в мировой (x, z на земле) и обратно.
// Камера смотрит вдоль (-1, -1, -1): «вверх по экрану» = мировое (-1, -1)/√2, «вправо по экрану» = (1, -1)/√2.
const S = Math.SQRT1_2;

/** Экранный вектор (sx вправо, sy вниз) -> мировой (x, z). Длина сохраняется. Пишет в out. */
export function screenToWorld(sx, sy, out) {
  out.x = S * (sx + sy);
  out.z = S * (sy - sx);
  return out;
}

/** Обратно: мировой (x, z) -> экранный. */
export function worldToScreen(x, z, out) {
  out.x = S * (x - z);
  out.y = S * (x + z);
  return out;
}

/** Угол камеры, рад: наклон к горизонту у настоящей изометрии. */
export const ISO_PITCH = Math.atan(1 / Math.SQRT2);
