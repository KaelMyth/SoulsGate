// Камера следует за героем. Масштаб задан не в пикселях, а шириной обзора в единицах мира
// (camera.viewWidth): на любом экране по ширине видно одно и то же.

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export class Camera {
  constructor(cfg) {
    this.cfg = cfg; // { viewWidth, smoothTime, clampToArena }
    this.x = 0;
    this.y = 0;
    this.prevX = 0; // прошлый шаг: для интерполяции при отрисовке
    this.prevY = 0;
    this.pxW = 1;   // размер экрана в CSS-пикселях
    this.pxH = 1;
    this.viewW = cfg.viewWidth; // сколько единиц мира видно
    this.viewH = cfg.viewWidth;
    this.scale = 1;             // CSS-пикселей на единицу мира
  }

  setScreen(pxW, pxH) {
    this.pxW = Math.max(1, pxW);
    this.pxH = Math.max(1, pxH);
    this.refresh();
  }

  /** Пересчёт масштаба: viewWidth меняется ползунком на лету. */
  refresh() {
    this.viewW = this.cfg.viewWidth;
    this.scale = this.pxW / this.viewW;
    this.viewH = this.pxH / this.scale;
  }

  snapTo(x, y, arena) {
    this.refresh();
    this.x = this.prevX = x;
    this.y = this.prevY = y;
    if (this.cfg.clampToArena && arena) {
      this.clampTo(arena);
      this.prevX = this.x;
      this.prevY = this.y;
    }
  }

  update(dt, tx, ty, arena) {
    this.refresh();
    this.prevX = this.x;
    this.prevY = this.y;
    const k = this.cfg.smoothTime > 0 ? 1 - Math.exp(-dt / this.cfg.smoothTime) : 1;
    this.x += (tx - this.x) * k;
    this.y += (ty - this.y) * k;
    if (this.cfg.clampToArena && arena) this.clampTo(arena);
  }

  /** Не показывать пустоту за краем арены; если арена меньше обзора, держим по центру. */
  clampTo(arena) {
    const hx = this.viewW / 2;
    const hy = this.viewH / 2;
    const minX = arena.left + hx;
    const maxX = arena.right - hx;
    const minY = arena.top + hy;
    const maxY = arena.bottom - hy;
    this.x = minX > maxX ? (arena.left + arena.right) / 2 : clamp(this.x, minX, maxX);
    this.y = minY > maxY ? (arena.top + arena.bottom) / 2 : clamp(this.y, minY, maxY);
  }
}
