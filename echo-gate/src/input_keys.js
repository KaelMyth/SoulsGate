// Клавиатура для проверки на компьютере: WASD / стрелки = стик (по экрану), Пробел = рывок.
// Телефон по-прежнему управляется стиком и двойным свайпом (input_stick.js, input_swipe.js).
export class Keys {
  constructor(onDash) {
    this.down = new Set();
    this.onDash = onDash;
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (k === ' ') { e.preventDefault(); if (!e.repeat) this.onDash(); return; }
      this.down.add(k);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.down.clear());
  }

  /** Вектор «по экрану» (x вправо, y вниз), длина не больше 1. */
  read(out) {
    const d = this.down;
    let x = 0;
    let y = 0;
    if (d.has('a') || d.has('arrowleft')) x -= 1;
    if (d.has('d') || d.has('arrowright')) x += 1;
    if (d.has('w') || d.has('arrowup')) y -= 1;
    if (d.has('s') || d.has('arrowdown')) y += 1;
    const l = Math.hypot(x, y);
    out.x = l > 1 ? x / l : x;
    out.y = l > 1 ? y / l : y;
    return l > 0;
  }
}
