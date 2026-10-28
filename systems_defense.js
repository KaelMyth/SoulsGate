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

import { applyMod } from './build_cores.js';

export class HeroDefense {
  /** o: { config, hero, stick, bus } */
  constructor(o) {
    this.cfg = o.config;
    this.hero = o.hero;
    this.stick = o.stick;
    this.bus = o.bus;
    this.modifiers = o.modifiers || null; // (id) => { стат: { percent, flat } }: моды билда
    this.state = 'move';
    this.dashSeq = 0;       // номер рывка (чтобы враг отлетал один раз за рывок)
    this.dashCdMul = 1;     // множитель перезарядки рывка (Ускорение на Кинетическом рывке)
    this.lightDash = false; // Молния на рывке: цепочка рикошетов
    this.lightning = null;  // система рывка-молнии (задаёт игра)
    this.kinetic = false; // стоит «Кинетический рывок»: рывок длиннее
    this.auraOn = false;  // стоит «Смертельная аура»: обычного блока нет, остаётся только окно парирования
    this.gravityOn = false;
    this.reset();
    this.bus.on('hero:hit-incoming', (inc) => this.onHit(inc));
    // Блок ставится один раз за остановку: новый блок только после нового касания стика.
    this.bus.on('stick:press', () => { this.armed = true; });
  }

  reset() {
    this.state = 'move';
    this.upTime = 0;       // сколько стик уже отпущен
    this.armed = true;     // можно ставить блок: сбрасывается при постановке, взводится касанием стика
    this.dashElapsed = 0;  // сколько идёт рывок
    this.dashV0 = 0;       // начальная скорость рывка
    this.blockTime = 0;    // сколько идёт блок
    this.blockCd = 0;      // осталось до нового блока
    this.blockCdMax = 1;   // с какого значения шла перезарядка (для индикатора)
    this.dashTime = 0;     // сколько осталось рывка
    this.dashT = 0.1;      // длительность активной фазы текущего рывка
    this.dashCd = 0;
    this.dashCdMax = 1;
    this.dashX = 0;
    this.dashY = 0;
    this.hero.dashing = false;
    this.hero.glideTime = 0;
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

  /** Сколько длится блок: с аурой только окно парирования. */
  get blockDuration() {
    return this.auraOn ? this.cfg.block.parryWindow : this.cfg.block.duration;
  }

  /** Радиус сферы блока (для рисования и для снарядов). */
  get blockRadius() {
    return this.hero.radius * this.cfg.block.radiusScale;
  }

  startCooldown(seconds) {
    this.blockCd = seconds;
    this.blockCdMax = Math.max(0.001, seconds);
  }

  /**
   * Сила блока в «числах» (config.block.power с модами ядра щита, Х2 удваивает число) и защита из неё:
   * гасится доля 1 − 9 / число (10 = 10%, 100 = 91%, 1000 = 99%), не меньше 0 и не больше block.maxReduction.
   */
  blockPower() {
    const m = this.modifiers ? this.modifiers(this.cfg.block.core) : null;
    return applyMod(this.cfg.block.power, m && m.blockPower);
  }

  blockReduction() {
    if (this.auraOn) return 0; // аура убирает гашение урона
    const n = this.blockPower();
    const r = n > 0 ? 1 - 9 / n : 0;
    return Math.min(this.cfg.block.maxReduction, Math.max(0, r));
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
    const light = this.kinetic && this.lightDash && this.lightning && !this.hero.dashing && this.lightning.plan(); // есть кого бить
    const wasBlocking = this.state === 'block';
    if (!this.go('dash')) return false;
    if (wasBlocking) {
      this.startCooldown(this.cfg.block.cancelCooldown);
      this.bus.emit('block:ended', { cancelled: true });
    }
    const dist = d.distance * (this.kinetic ? this.cfg.kinetic.distanceScale : 1); // кинетический рывок длиннее
    this.dashX = dirX / len;
    this.dashY = dirY / len;
    if (light) { // героя двигает цепочка рикошетов, обычной скорости нет
      this.dashTime = this.lightning.duration;
      this.dashT = Math.max(0.02, this.lightning.duration);
      this.dashCd = this.cfg.lightdash.cooldown * this.dashCdMul;
      this.dashCdMax = Math.max(0.001, this.dashCd);
      this.dashV0 = 0;
      this.dashElapsed = 0;
      this.hero.dashing = true;
      this.hero.dashVx = 0;
      this.hero.dashVy = 0;
      this.lightning.begin();
      this.bus.emit('dash:started', { dirX: this.dashX, dirY: this.dashY });
      return true;
    }
    this.dashTime = d.duration;
    this.dashT = Math.max(0.02, d.duration);
    const cdm = this.kinetic ? this.dashCdMul : 1;
    this.dashCd = d.cooldown * cdm;
    this.dashCdMax = Math.max(0.001, d.cooldown * cdm);
    // Рывок с инерцией: скорость быстро падает по экспоненте (резкий старт, мягкое торможение),
    // остаток скорости не обрывается, а плавно перетекает в обычное движение (glide).
    // v0 подобрана так, что рывок вместе с «скольжением» проходит ровно distance.
    const tau = Math.max(0.005, d.decay);
    const T = Math.max(0.02, d.duration);
    const eEnd = Math.exp(-T / tau);
    this.dashV0 = dist / (tau * (1 - eEnd) + eEnd * d.glide);
    this.dashElapsed = 0;
    this.hero.dashing = true;
    this.hero.dashVx = this.dashX * this.dashV0;
    this.hero.dashVy = this.dashY * this.dashV0;
    this.hero.facing = Math.atan2(this.dashY, this.dashX);
    if (d.invuln > 0 && this.hero.invuln < d.invuln) this.hero.invuln = d.invuln;
    this.dashSeq++;
    this.bus.emit('dash:started', { dirX: this.dashX, dirY: this.dashY });
    return true;
  }

  /** Средний множитель скорости рывка на отрезке [t, t + dt]. */
  avgDecay(t, dt) {
    const tau = Math.max(0.005, this.cfg.dash.decay);
    return (tau / dt) * (Math.exp(-t / tau) - Math.exp(-(t + dt) / tau));
  }

  update(dt) {
    if (this.blockCd > 0) this.blockCd -= dt;
    const am = this.modifiers ? this.modifiers(this.cfg.block.core) : null;
    this.auraOn = !!(am && am.aura);
    this.gravityOn = !!(am && am.gravity);
    if (this.dashCd > 0) this.dashCd -= dt;
    if (!this.hero.active) return;
    const stickUp = !this.stick.active;
    this.upTime = stickUp ? this.upTime + dt : 0;
    if (!stickUp) this.armed = true;

    if (this.state === 'dash') {
      if (this.dashElapsed >= this.dashT) {
        // Рывок закончился: остаток скорости остаётся у героя и гаснет плавно, а не обрывается.
        this.go('end');
        this.hero.dashing = false;
        const k = Math.exp(-this.dashElapsed / Math.max(0.005, this.cfg.dash.decay));
        this.hero.vx = this.dashX * this.dashV0 * k;
        this.hero.vy = this.dashY * this.dashV0 * k;
        this.hero.glideTime = this.cfg.dash.glide * 2.5;
        this.hero.glideAccel = this.cfg.dash.glide;
      } else {
        // Скорость на этот шаг: среднее экспоненты за шаг (так сумма шагов равна интегралу, дальность точная).
        const k = this.avgDecay(this.dashElapsed, dt);
        this.hero.dashVx = this.dashX * this.dashV0 * k;
        this.hero.dashVy = this.dashY * this.dashV0 * k;
        this.dashElapsed += dt;
      }
    } else if (this.state === 'move') {
      // Блок включается сам: стик отпущен немного времени подряд и блок не на перезарядке.
      if (stickUp && this.armed && this.upTime >= this.cfg.block.startDelay && this.blockCd <= 0 && this.go('block')) {
        this.armed = false; // один блок за остановку
        this.blockTime = 0;
        this.bus.emit('block:started', {});
      }
    } else if (this.state === 'block') {
      this.blockTime += dt;
      if (!stickUp) this.endBlock(true); // взялся за стик: блок снят
      else if (this.blockTime >= this.blockDuration) this.endBlock(false);
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
    // Обычный блок гасит долю урона (см. blockReduction). Касание жуков не парируется, только блокируется.
    const absorbed = inc.amount * this.blockReduction();
    inc.amount -= absorbed;
    inc.blocked = true;
    this.bus.emit('hero:blocked', { amount: inc.amount, absorbed, source: inc.source });
  }
}
