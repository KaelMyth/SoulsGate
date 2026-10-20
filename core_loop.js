// Игровой цикл с фиксированным шагом логики, независимым от частоты кадров.
// Логика (update) идёт строго шагами по 1/hz секунды, отрисовка (render) получает alpha:
// какую долю шага мы «прожили» после последнего обновления. По alpha рисуем плавную
// интерполяцию между прошлым и текущим состоянием.

export class FixedStepper {
  constructor(cfg) {
    this.cfg = cfg; // { hz, maxFrameMs, maxStepsPerFrame }
    this.acc = 0;
    this.alpha = 0;
    this.lastSteps = 0;
    this.dropped = 0; // сколько раз пришлось отбросить отставание (телефон не успевал)
  }

  get dt() {
    return 1 / this.cfg.hz;
  }

  /** Принять длительность кадра в мс, вызвать update(dt) нужное число раз. Возвращает число шагов. */
  advance(frameMs, update) {
    const dt = this.dt;
    this.acc += Math.min(Math.max(frameMs, 0), this.cfg.maxFrameMs) / 1000;
    let steps = 0;
    while (this.acc >= dt && steps < this.cfg.maxStepsPerFrame) {
      update(dt);
      this.acc -= dt;
      steps++;
    }
    if (this.acc >= dt) {
      // Не успеваем: отставание не копим, иначе игра будет догонять бесконечно.
      this.dropped++;
      this.acc %= dt;
    }
    this.alpha = this.acc / dt;
    this.lastSteps = steps;
    return steps;
  }

  reset() {
    this.acc = 0;
    this.alpha = 0;
    this.lastSteps = 0;
  }
}

// Счётчик FPS: усредняет по окну и помнит худшее окно.
// Первые warmupMs не идут в минимум: на старте страница всегда немного подтормаживает.
export class FpsMeter {
  constructor(windowMs = 500, warmupMs = 1500) {
    this.windowMs = windowMs;
    this.warmupMs = warmupMs;
    this.fps = 0;
    this.minFps = Infinity;
    this.frameMs = 0; // сглаженная длительность кадра
    this.frames = 0;
    this.windowStart = null;
    this.startTime = null;
  }

  /** После паузы или сворачивания: не засчитывать простой как просадку FPS. */
  interrupt() {
    this.windowStart = null;
    this.frames = 0;
  }

  resetMin() {
    this.minFps = Infinity;
  }

  frame(now, frameMs) {
    if (this.windowStart === null) {
      this.windowStart = now;
      this.frames = 0;
      if (this.startTime === null) this.startTime = now;
      return;
    }
    this.frames++;
    this.frameMs += (frameMs - this.frameMs) * 0.1;
    const elapsed = now - this.windowStart;
    if (elapsed >= this.windowMs) {
      this.fps = (this.frames * 1000) / elapsed;
      this.frames = 0;
      this.windowStart = now;
      if (now - this.startTime >= this.warmupMs && this.fps < this.minFps) this.minFps = this.fps;
    }
  }
}

export class GameLoop {
  constructor({ stepper, update, render, meter }) {
    this.stepper = stepper;
    this.update = update;
    this.render = render;
    this.meter = meter;
    this.running = false;
    this.last = null;
    this.tick = this.tick.bind(this);
    this.onVisibility = this.onVisibility.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = null;
    document.addEventListener('visibilitychange', this.onVisibility);
    requestAnimationFrame(this.tick);
  }

  stop() {
    this.running = false;
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  onVisibility() {
    // После возврата на вкладку не пытаемся «догнать» время, проведённое в фоне.
    this.last = null;
    this.stepper.reset();
    this.meter.interrupt();
  }

  tick(t) {
    if (!this.running) return;
    requestAnimationFrame(this.tick); // планируем заранее: ошибка в кадре не убьёт цикл
    const frameMs = this.last === null ? 0 : t - this.last;
    this.last = t;
    this.stepper.advance(frameMs, this.update);
    this.render(this.stepper.alpha);
    this.meter.frame(t, frameMs);
  }
}
