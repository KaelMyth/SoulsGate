// Защита героя: блок (сфера), парирование и рывок. Состояния героя описаны таблицей переходов,
// поэтому случайные нажатия не ломают состояние: недопустимое действие просто игнорируется.
//
//   move  (движение или стоим со стиком в руке)
//   block (стик отпущен: вокруг героя сфера, первые parryWindow секунд это окно парирования)
//   dash  (рывок: стик на время рывка не слушается)
//
// События: 'hero:blocked' { amount, source }, 'hero:parried' { source, x, y },
//          'block:started', 'block:ended' { cancelled }, 'dash:started' { dirX, dirY }.
// Блок и парирование реализованы подпиской на 'hero:hit-incoming', а не внутри кода врагов:
// позже на те же события подпишутся модификаторы (отражение урона, мана за блок).

export const HERO_TRANSITIONS = Object.freeze({
  move: { block: 'block', dash: 'dash' },
  block: { unblock: 'move', dash: 'dash' },
  dash: { end: 'move' },
});

export class HeroDefense {
  /** o: { config, hero, stick, bus } */
  constructor(o) {
    this.cfg = o.config;
    this.hero = o.hero;
    this.stick = o.stick;
    this.bus = o.bus;
    this.state = 'move';
    this.reset();
    this.bus.on('hero:hit-incoming', (inc) => this.onHit(inc));
  }

  reset() {
    this.state = 'move';
    this.upTime = 0;       // сколько стик уже отпущен
    this.blockTime = 0;    // сколько идёт блок
    this.blockCd = 0;      // осталось до нового блока
    this.blockCdMax = 1;   // с какого значения шла перезарядка (для индикатора)
    this.dashTime = 0;     // сколько осталось рывка
    this.dashCd = 0;
    this.dashCdMax = 1;
    this.dashX = 0;
    this.dashY = 0;
    this.hero.dashing = false;
  }

  go(action) {
    const next = HERO_TRANSITIONS[this.state][action];
    if (!next) return false;
    this.state = next;
    return true;
  }

  get blocking() {
    return this.state === 'block';
  }

  /** Окно парирования: первые parryWindow секунд блока. */
  get parrying() {
    return this.state === 'block' && this.blockTime < this.cfg.block.parryWindow;
  }

  /** Радиус сферы блока (для рисования и для снарядов). */
  get blockRadius() {
    return this.hero.radius * this.cfg.block.radiusScale;
  }

  startCooldown(seconds) {
    this.blockCd = seconds;
    this.blockCdMax = Math.max(0.001, seconds);
  }

  endBlock(cancelled) {
    if (!this.go('unblock')) return;
    this.startCooldown(cancelled ? this.cfg.block.cancelCooldown : this.cfg.block.cooldown);
    this.bus.emit('block:ended', { cancelled });
  }

  /** Попытка рывка в направлении (dirX, dirY). Возвращает true, если рывок начался. */
  tryDash(dirX, dirY) {
    const d = this.cfg.dash;
    const len = Math.hypot(dirX, dirY);
    if (!this.hero.active || this.dashCd > 0 || len < 1e-6) return false;
    const wasBlocking = this.state === 'block';
    if (!this.go('dash')) return false;
    if (wasBlocking) {
      this.startCooldown(this.cfg.block.cancelCooldown);
      this.bus.emit('block:ended', { cancelled: true });
    }
    this.dashX = dirX / len;
    this.dashY = dirY / len;
    this.dashTime = d.duration;
    this.dashCd = d.cooldown;
    this.dashCdMax = Math.max(0.001, d.cooldown);
    const speed = d.distance / Math.max(0.01, d.duration);
    this.hero.dashing = true;
    this.hero.dashVx = this.dashX * speed;
    this.hero.dashVy = this.dashY * speed;
    this.hero.facing = Math.atan2(this.dashY, this.dashX);
    if (d.invuln > 0 && this.hero.invuln < d.invuln) this.hero.invuln = d.invuln;
    this.bus.emit('dash:started', { dirX: this.dashX, dirY: this.dashY });
    return true;
  }

  update(dt) {
    if (this.blockCd > 0) this.blockCd -= dt;
    if (this.dashCd > 0) this.dashCd -= dt;
    if (!this.hero.active) return;
    const stickUp = !this.stick.active;
    this.upTime = stickUp ? this.upTime + dt : 0;

    if (this.state === 'dash') {
      this.dashTime -= dt;
      if (this.dashTime <= 0) {
        this.go('end');
        this.hero.dashing = false;
        this.hero.vx = this.hero.vy = 0;
      }
    } else if (this.state === 'move') {
      // Блок включается сам: стик отпущен немного времени подряд и блок не на перезарядке.
      if (stickUp && this.upTime >= this.cfg.block.startDelay && this.blockCd <= 0 && this.go('block')) {
        this.blockTime = 0;
        this.bus.emit('block:started', {});
      }
    } else if (this.state === 'block') {
      this.blockTime += dt;
      if (!stickUp) this.endBlock(true); // взялся за стик: блок снят
      else if (this.blockTime >= this.cfg.block.duration) this.endBlock(false);
    }
  }

  onHit(inc) {
    if (this.state !== 'block' || inc.cancelled) return;
    if (inc.parryable && this.parrying) {
      inc.cancelled = true; // удар полностью проигнорирован
      const src = inc.source;
      if (src) src.active = false; // парированный снаряд гаснет
      this.bus.emit('hero:parried', { source: src, x: src ? src.x : this.hero.x, y: src ? src.y : this.hero.y });
      return;
    }
    // Обычный блок: часть урона гасится. Касание жуков не парируется, только блокируется.
    inc.amount *= 1 - this.cfg.block.reduction;
    this.bus.emit('hero:blocked', { amount: inc.amount, source: inc.source });
  }
}
