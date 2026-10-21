// Двойной свайп стиком = рывок. Свайп: короткое касание (не дольше swipeMaxTime) с заметным отклонением
// ручки к моменту отпускания. Два свайпа подряд в одну сторону (в пределах doubleWindow и maxAngleDeg)
// дают рывок. Пороги в config.dash, меняются ползунками.
//
// Работает только по событию 'stick:release', ничего не знает ни о герое, ни об экране.

export class SwipeDetector {
  /** cfg: config.dash; onDouble(dirX, dirY) вызывается на втором свайпе. */
  constructor(bus, cfg, onDouble) {
    this.cfg = cfg;
    this.onDouble = onDouble;
    this.last = null; // { time (мс), x, y }: прошлый свайп, единичный вектор
    bus.on('stick:release', (p) => this.onRelease(p));
  }

  reset() {
    this.last = null;
  }

  onRelease(p) {
    const c = this.cfg;
    if (p.cancelled) {
      this.last = null;
      return;
    }
    const isSwipe = p.duration / 1000 <= c.swipeMaxTime && p.mag >= c.swipeMinMag;
    if (!isSwipe) {
      this.last = null;
      return;
    }
    const len = Math.hypot(p.dirX, p.dirY) || 1;
    const x = p.dirX / len;
    const y = p.dirY / len;
    const prev = this.last;
    if (prev && (p.time - prev.time) / 1000 <= c.doubleWindow
      && x * prev.x + y * prev.y >= Math.cos((c.maxAngleDeg * Math.PI) / 180)) {
      this.last = null;
      this.onDouble(x, y);
      return;
    }
    this.last = { time: p.time, x, y };
  }
}
