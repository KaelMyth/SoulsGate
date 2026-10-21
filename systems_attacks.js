// Атаки врагов с телеграфами. Атака описана данными в def.attack врага:
//   shape     'line' (рывок по линии) или 'circle' (удар по площади вокруг врага)
//   range     с какого расстояния до героя враг начинает замах
//   length    для линии: на сколько единиц враг прорывается; radius: для круга
//   width     для линии: ширина зоны (не меньше тела врага)
//   windup    замах, с: враг стоит, зона на земле заполняется (по ней игрок видит, откуда придёт удар)
//   strike    удар, с: сам рывок или вспышка круга
//   recovery  пауза восстановления, с: враг стоит и уязвим
//   cooldown  пауза до следующего замаха, с
//   damage    урон по герою (проходит через блок и парирование)
//   parryStun, parryKnock   что будет с врагом при парировании: оглушение, с, и откидывание В БОК, единиц
//
// Состояния врага (e.atk.state): idle → windup → strike → recovery → idle; при парировании strike → stun → idle.
// Направление рывка запоминается в начале замаха: от него можно уйти, и от этого он «читаемый».
//
// События: 'enemy:windup' { enemy }, 'enemy:strike' { enemy }, 'enemy:parried' { enemy }.
// Попадание по герою идёт через Combat.damageHero и 'hero:hit-incoming', значит блок и парирование
// этапа 4 работают без единой строки про врагов в коде защиты.
import { applyKnockback } from './world_enemy.js';

export class Attacks {
  /** o: { config, hero, arena, combat, bus, defense? } */
  constructor(o) {
    this.cfg = o.config;
    this.hero = o.hero;
    this.arena = o.arena;
    this.combat = o.combat;
    this.bus = o.bus;
    this.defense = o.defense || null;
    this.flip = 1; // в какую сторону откинет следующего парированного: чередуем
    this.bus.on('hero:parried', (p) => this.onParried(p));
  }

  update(dt, list) {
    const hero = this.hero;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.active) continue;
      const A = e.def.attack;
      if (!A) continue;
      const a = e.atk;
      switch (a.state) {
        case 'idle': this.idle(e, A, a, dt, hero); break;
        case 'windup': this.windup(e, A, a, dt); break;
        case 'strike': this.strike(e, A, a, dt, hero); break;
        case 'recovery':
          a.t += dt;
          if (a.t >= A.recovery) this.finish(a, A);
          break;
        case 'stun':
          a.t += dt;
          if (a.t >= A.parryStun) this.finish(a, A);
          break;
        default: break;
      }
      // Источник удара для защиты: плавает вместе с врагом, чтобы искры парирования вылетали из нужной точки.
      e.strikeSrc.x = e.x;
      e.strikeSrc.y = e.y;
    }
  }

  finish(a, A) {
    a.state = 'idle';
    a.t = 0;
    a.cd = A.cooldown;
  }

  idle(e, A, a, dt, hero) {
    if (a.cd > 0) a.cd -= dt;
    if (a.cd > 0 || !hero.active) return;
    const dx = hero.x - e.x;
    const dy = hero.y - e.y;
    const d = Math.hypot(dx, dy);
    if (d > A.range || d < 1e-6) return;
    // Видит героя: между ними нет скалы.
    if (this.arena.segmentBlocked(e.x, e.y, hero.x, hero.y, e.radius)) return;
    a.state = 'windup';
    a.t = 0;
    a.hit = false;
    a.dirX = dx / d; // направление запоминается тут: от удара можно уйти
    a.dirY = dy / d;
    this.bus.emit('enemy:windup', { enemy: e });
  }

  windup(e, A, a, dt) {
    a.t += dt;
    if (a.t < A.windup) return;
    a.state = 'strike';
    a.t = 0;
    e.strikeSrc.active = true;
    e.strikeSrc.parryable = A.parryable !== false;
    this.bus.emit('enemy:strike', { enemy: e });
    if (A.shape === 'circle') this.hitHero(e, A, a); // площадь бьёт сразу, на первом шаге удара
  }

  strike(e, A, a, dt, hero) {
    a.t += dt;
    if (A.shape === 'circle') {
      if (a.t >= A.strike) a.state = 'recovery', a.t = 0;
      return;
    }
    // Рывок по линии: быстро, по запомненному направлению; скала или стена обрывают его.
    const step = (A.length / Math.max(0.01, A.strike)) * dt;
    const bx = e.x;
    const by = e.y;
    e.x += a.dirX * step;
    e.y += a.dirY * step;
    this.arena.resolveCircle(e);
    const moved = Math.hypot(e.x - bx, e.y - by);
    // Попали ли в героя (если держится блок, касание считается по сфере блока).
    const reach = this.reachRadius() + e.radius;
    const dx = hero.x - e.x;
    const dy = hero.y - e.y;
    if (!a.hit && hero.active && dx * dx + dy * dy <= reach * reach) {
      this.hitHero(e, A, a);
      if (a.state === 'strike') a.state = 'recovery', a.t = 0; // врезался и встал (при парировании state уже stun)
      return;
    }
    if (moved < step * 0.5 || a.t >= A.strike) {
      a.state = 'recovery';
      a.t = 0;
    }
  }

  /** До какого расстояния от центра героя достаёт враг: тело героя или сфера блока. */
  reachRadius() {
    const h = this.hero;
    return this.defense && this.defense.blocking ? Math.max(h.radius, this.defense.blockRadius) : h.radius;
  }

  hitHero(e, A, a) {
    const hero = this.hero;
    if (a.hit) return;
    if (A.shape === 'circle') {
      const dx = hero.x - e.x;
      const dy = hero.y - e.y;
      const r = A.radius + this.reachRadius();
      if (dx * dx + dy * dy > r * r) return;
    }
    a.hit = true;
    e.strikeSrc.x = e.x;
    e.strikeSrc.y = e.y;
    this.combat.damageHero(A.damage, e.strikeSrc); // блок гасит часть, парирование (если окно открыто) гасит всё
  }

  /** Парирование атаки врага: оглушение и откидывание в бок (не назад). */
  onParried(p) {
    const src = p.source;
    const e = src && src.enemy;
    if (!e || !e.active || !e.def.attack) return;
    const A = e.def.attack;
    const a = e.atk;
    a.state = 'stun';
    a.t = 0;
    a.hit = true;
    // Перпендикуляр к направлению удара; сторону чередуем, чтобы бык не летел всегда в одну.
    let px = -a.dirY * this.flip;
    let py = a.dirX * this.flip;
    this.flip = -this.flip;
    // Если в эту сторону сразу скала, берём противоположную.
    if (this.arena.segmentBlocked(e.x, e.y, e.x + px * A.parryKnock, e.y + py * A.parryKnock, e.radius)) {
      px = -px;
      py = -py;
    }
    e.kbVx = e.kbVy = 0; // отбрасываем только вбок, остаток рывка не складывается с откидыванием
    applyKnockback(e, px, py, A.parryKnock, A.parryKnockTime || 0.2, true); // отлёт ровно на parryKnock, тяжесть быка не в счёт
    this.bus.emit('enemy:parried', { enemy: e });
  }
}

/**
 * Что рисовать на земле для врага: { shape, x, y, dirX, dirY, length, width, radius, progress } или null.
 * Рисует renderer, а считается тут, чтобы одни и те же данные видели и экран, и тесты.
 */
export function getTelegraph(e, hero, out) {
  const A = e.def.attack;
  if (A) {
    const a = e.atk;
    if (a.state !== 'windup') return null;
    out.shape = A.shape;
    out.x = e.x;
    out.y = e.y;
    out.dirX = a.dirX;
    out.dirY = a.dirY;
    out.length = A.length;
    out.width = Math.max(A.width || 0, e.radius * 2);
    out.radius = A.radius || 0;
    out.progress = Math.min(1, a.t / Math.max(0.01, A.windup));
    return out;
  }
  return null;
}
