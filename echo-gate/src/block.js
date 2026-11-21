// Блок как в SoulsGate. Чистая логика (тестируется в Node).
// Включается сам, когда герой стоит (стик отпущен) startDelay секунд; один блок за остановку.
// Первые parryWindow секунд это парирование: удар игнорируется полностью. Дальше удар гасится на долю 1 − 9/power.
// Движение блок не снимает: щит держится duration секунд и идёт за героем. Потом перезарядка cooldown.
export class Block {
  constructor(cfg) {
    this.cfg = cfg; // CONFIG.block
    this.onStart = null;  // () => void
    this.onEnd = null;    // (full) => void
    this.onParry = null;  // () => void
    this.onBlock = null;  // (absorbed) => void
    this.durMult = 1;     // усиления длительности
    this.reset();
  }

  reset() {
    this.active = false;
    this.t = 0;     // с с начала блока
    this.cd = 0;    // перезарядка, с
    this.cdMax = 0; // с, с какой перезарядки начали (для полосы)
    this.still = 0; // с, сколько герой стоит
    this.armed = true;
  }

  /** Сколько перезарядки уже прошло, 0..1 (1 = готов). */
  get ready() { return this.cdMax > 0 && this.cd > 0 ? 1 - this.cd / this.cdMax : 1; }
  get duration() { return this.cfg.duration * this.durMult; }
  get parrying() { return this.active && this.t < this.cfg.parryWindow; }
  get reduction() {
    const p = this.cfg.power;
    return Math.min(this.cfg.maxReduction, Math.max(0, p > 0 ? 1 - 9 / p : 0));
  }

  /** moving: стик нажат или идёт рывок; can: бой идёт. */
  update(dt, moving, can = true) {
    if (this.cd > 0) this.cd = Math.max(0, this.cd - dt);
    if (moving) { this.still = 0; this.armed = true; } else this.still += dt;
    if (!can) { if (this.active) this.end(false); return; }
    if (this.active) {
      this.t += dt;
      if (this.t >= this.duration) this.end(true);
    } else if (!moving && this.armed && this.still >= this.cfg.startDelay && this.cd <= 0) {
      this.active = true;
      this.armed = false;
      this.t = 0;
      if (this.onStart) this.onStart();
    }
  }

  /** Конец блока. full: дошёл до конца (перезарядка), иначе снят без перезарядки (пауза, смерть). */
  end(full) {
    if (!this.active) return;
    this.active = false;
    this.cd = this.cdMax = full ? this.cfg.cooldown : 0;
    if (this.onEnd) this.onEnd(full);
  }

  /** Удар на n урона: сколько дойдёт до героя (0 при парировании). */
  filter(n) {
    if (!this.active) return n;
    if (this.parrying) { if (this.onParry) this.onParry(); return 0; }
    const absorbed = n * this.reduction;
    if (this.onBlock) this.onBlock(absorbed);
    return n - absorbed;
  }
}
