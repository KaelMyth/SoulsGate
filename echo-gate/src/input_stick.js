// Виртуальный стик: появляется там, где палец коснулся экрана, исчезает при отпускании.
// Работает одним пальцем: пока первый палец на экране, остальные касания игнорируются.
//
// События в шину:
//   'stick:press'   { x, y, time }                          палец коснулся
//   'stick:move'    { x, y, mag, time, pressTime }          палец сдвинулся (вектор стика, длина 0..1)
//   'stick:release' { time, duration, dirX, dirY, mag, cancelled }   палец отпущен
// На 'stick:release' на этапе 4 повесится блок.

/** Чистая математика стика (без DOM). Результат пишет в out, чтобы не создавать мусор. */
export function computeStick(dx, dy, radius, deadzone, out) {
  const dz = Math.min(Math.max(deadzone, 0), 0.95);
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-6) {
    out.x = 0; out.y = 0; out.mag = 0; out.kx = 0; out.ky = 0;
    return out;
  }
  const nx = dx / len;
  const ny = dy / len;
  const clamped = Math.min(len, radius);
  const raw = clamped / radius;
  const mag = raw <= dz ? 0 : (raw - dz) / (1 - dz);
  out.x = nx * mag;   // направление * сила, длина от 0 до 1
  out.y = ny * mag;
  out.mag = mag;
  out.kx = nx * clamped; // смещение ручки для рисования, px
  out.ky = ny * clamped;
  return out;
}

export class Stick {
  constructor(el, bus, cfg) {
    this.el = el;
    this.bus = bus;
    this.cfg = cfg; // { radius, deadzone }, читается каждый раз заново (меняется ползунками)

    this.pointerId = null;
    this.active = false;
    this.baseX = 0; // где появился стик, px внутри элемента
    this.baseY = 0;
    this.x = 0;     // итоговый вектор, длина 0..1
    this.y = 0;
    this.mag = 0;
    this.kx = 0;    // смещение ручки, px
    this.ky = 0;
    this.pressTime = 0;
    this.originLeft = 0;
    this.originTop = 0;
    this.out = { x: 0, y: 0, mag: 0, kx: 0, ky: 0 };

    this.onDown = this.onDown.bind(this);
    this.onMove = this.onMove.bind(this);
    this.onUp = this.onUp.bind(this);
    this.onCancel = this.onCancel.bind(this);
    this.onLost = this.onLost.bind(this);

    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onCancel);
    el.addEventListener('lostpointercapture', this.onLost);
  }

  onDown(e) {
    if (this.pointerId !== null) return; // второй палец игнорируем
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const r = this.el.getBoundingClientRect();
    this.originLeft = r.left;
    this.originTop = r.top;
    this.pointerId = e.pointerId;
    this.active = true;
    this.baseX = e.clientX - r.left;
    this.baseY = e.clientY - r.top;
    this.x = this.y = this.mag = this.kx = this.ky = 0;
    this.pressTime = e.timeStamp;
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch (err) { /* бывает, если палец уже оторван; не страшно */ }
    if (e.cancelable) e.preventDefault();
    this.bus.emit('stick:press', { x: this.baseX, y: this.baseY, time: e.timeStamp });
  }

  onMove(e) {
    if (e.pointerId !== this.pointerId) return;
    const dx = e.clientX - this.originLeft - this.baseX;
    const dy = e.clientY - this.originTop - this.baseY;
    const o = computeStick(dx, dy, this.cfg.radius, this.cfg.deadzone, this.out);
    this.x = o.x; this.y = o.y; this.mag = o.mag; this.kx = o.kx; this.ky = o.ky;
    this.bus.emit('stick:move', { x: o.x, y: o.y, mag: o.mag, time: e.timeStamp, pressTime: this.pressTime });
  }

  onUp(e) {
    if (e.pointerId !== this.pointerId) return;
    this.finish(e.timeStamp, false);
  }

  onCancel(e) {
    if (e.pointerId !== this.pointerId) return;
    this.finish(e.timeStamp, true);
  }

  onLost(e) {
    if (e.pointerId !== this.pointerId) return;
    this.finish(e.timeStamp, true);
  }

  /** Принудительно отпустить (приложение свернули и т.п.). */
  cancel(time) {
    if (this.pointerId === null) return;
    this.finish(time === undefined ? this.pressTime : time, true);
  }

  finish(time, cancelled) {
    const payload = {
      time,
      duration: time - this.pressTime,
      dirX: this.x,
      dirY: this.y,
      mag: this.mag,
      cancelled,
    };
    const id = this.pointerId;
    // Сначала сбрасываем состояние: подписчики должны видеть уже отпущенный стик.
    this.pointerId = null;
    this.active = false;
    this.x = this.y = this.mag = this.kx = this.ky = 0;
    try {
      this.el.releasePointerCapture(id);
    } catch (err) { /* захват уже снят */ }
    this.bus.emit('stick:release', payload);
  }
}
