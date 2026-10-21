// Двойной свайп стиком = рывок.
//
//   1. Первый свайп: короткое касание (не дольше swipeMaxTime), которое к отпусканию отведено
//      заметно (mag >= swipeMinMag). Палец отпускается.
//   2. Второй свайп: следующее касание в пределах doubleWindow. Как только палец быстро (за
//      swipeMaxTime) отвёл стик достаточно далеко в ту же сторону, рывок срабатывает СРАЗУ,
//      не дожидаясь отпускания. Палец остаётся на экране и дальше работает как обычный стик.
//
// Пороги в config.dash, меняются ползунками. Детектор слушает только события стика
// ('stick:press', 'stick:move', 'stick:release') и ничего не знает ни о герое, ни об экране.

export class SwipeDetector {
  /** cfg: config.dash; onDouble(dirX, dirY) вызывается в момент второго свайпа. */
  constructor(bus, cfg, onDouble) {
    this.cfg = cfg;
    this.onDouble = onDouble;
    this.last = null;  // { time (мс), x, y }: прошлый свайп (по отпусканию), единичный вектор
    this.touch = null; // текущее касание: { pressTime, candidate, fired }
    bus.on('stick:press', (p) => this.onPress(p));
    bus.on('stick:move', (p) => this.onMove(p));
    bus.on('stick:release', (p) => this.onRelease(p));
  }

  reset() {
    this.last = null;
    this.touch = null;
  }

  onPress(p) {
    const c = this.cfg;
    // Кандидат во вторые свайпы: есть прошлый свайп и он был недавно.
    const candidate = !!this.last && (p.time - this.last.time) / 1000 <= c.doubleWindow;
    if (!candidate) this.last = null;
    this.touch = { pressTime: p.time, candidate, fired: false };
  }

  onMove(p) {
    const t = this.touch;
    if (!t || !t.candidate || t.fired) return;
    const c = this.cfg;
    if ((p.time - t.pressTime) / 1000 > c.swipeMaxTime) {
      t.candidate = false; // слишком медленно: это уже обычное движение, а не свайп
      this.last = null;
      return;
    }
    if (p.mag < c.swipeMinMag) return;
    const len = Math.hypot(p.x, p.y) || 1;
    const x = p.x / len;
    const y = p.y / len;
    const prev = this.last;
    if (prev && x * prev.x + y * prev.y >= Math.cos((c.maxAngleDeg * Math.PI) / 180)) {
      t.fired = true;
      this.last = null;
      this.onDouble(x, y); // палец остаётся на экране: движение продолжится из этого же касания
    } else {
      t.candidate = false; // свайп не в ту сторону: цепочка сброшена
      this.last = null;
    }
  }

  onRelease(p) {
    const c = this.cfg;
    const t = this.touch;
    this.touch = null;
    if (p.cancelled || (t && t.fired)) {
      this.last = null;
      return;
    }
    const isSwipe = p.duration / 1000 <= c.swipeMaxTime && p.mag >= c.swipeMinMag;
    if (!isSwipe) {
      this.last = null;
      return;
    }
    const len = Math.hypot(p.dirX, p.dirY) || 1;
    this.last = { time: p.time, x: p.dirX / len, y: p.dirY / len };
  }
}
