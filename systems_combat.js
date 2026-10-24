// Урон. Весь урон проходит через шину событий, чтобы на неё могли подписываться
// мана, модификаторы и блок, не трогая код врагов и снарядов.
//
// События:
//   'enemy:hit-incoming' { enemy, amount, knockback, dirX, dirY, source, cancelled }
//                        ДО применения удара по врагу. Подписчик (модификатор) может изменить урон,
//                        силу откидывания и направление или отменить удар целиком.
//   'hero:hit-incoming'  { amount, source, cancelled, parryable }   ДО применения урона по герою.
//                        Здесь работают блок и парирование (systems/defense.js).
//   'damage:dealt'       { target, targetKind: 'enemy'|'hero', amount, knockback, source, hp }   урон применён
//   'enemy:killed'       { enemy, source }
//   'hero:died'          { source }
import { applyKnockback } from './world_enemy.js';

export class Combat {
  /** cfg: { hitFlash, knockbackTime }: живой объект из конфига, ползунки действуют сразу. */
  constructor(bus, hero, cfg) {
    this.bus = bus;
    this.hero = hero;
    this.cfg = cfg || { hitFlash: 0.1, knockbackTime: 0.07 };
  }

  /** hit (необязательно): { knockback, dirX, dirY }, сила и направление откидывания. */
  damageEnemy(enemy, amount, source, hit) {
    if (!enemy.active) return false;
    const incoming = {
      enemy,
      amount,
      knockback: hit ? hit.knockback || 0 : 0,
      dirX: hit ? hit.dirX || 0 : 0,
      dirY: hit ? hit.dirY || 0 : 0,
      source,
      cancelled: false,
    };
    this.bus.emit('enemy:hit-incoming', incoming);
    if (incoming.cancelled || (incoming.amount <= 0 && incoming.knockback <= 0)) return false;

    enemy.hp -= Math.max(0, incoming.amount);
    enemy.flash = this.cfg.hitFlash;
    if (incoming.knockback > 0) {
      applyKnockback(enemy, incoming.dirX, incoming.dirY, incoming.knockback, this.cfg.knockbackTime);
    }
    this.bus.emit('damage:dealt', {
      target: enemy, targetKind: 'enemy', amount: incoming.amount, knockback: incoming.knockback, source, hp: enemy.hp,
    });
    if (enemy.hp <= 0) {
      enemy.active = false; // убит: в тот же шаг больше ни во что не попадёт
      this.bus.emit('enemy:killed', { enemy, source });
    }
    return true;
  }

  /**
   * Периодический урон по герою (горение): мимо блока и неуязвимости после удара, и сам неуязвимость не включает,
   * иначе тики «съедали» бы окно защиты от настоящих ударов. Событие 'damage:dealt' с source.burn = true.
   */
  damageHeroDot(amount, source) {
    const hero = this.hero;
    if (!hero.active || amount <= 0) return false;
    hero.hp = Math.max(0, hero.hp - amount);
    this.bus.emit('damage:dealt', { target: hero, targetKind: 'hero', amount, source, hp: hero.hp });
    if (hero.hp <= 0) {
      hero.active = false;
      this.bus.emit('hero:died', { source });
    }
    return true;
  }

  /** Возвращает true, если удар состоялся: урон прошёл или его целиком впитал блок (парированный или отменённый удар: false). */
  damageHero(amount, source) {
    const hero = this.hero;
    if (!hero.active || hero.invuln > 0) return false;
    // parryable: источник можно парировать (снаряд стрелка); касание жуков парировать нельзя.
    const incoming = { amount, source, cancelled: false, parryable: !!(source && source.parryable) };
    this.bus.emit('hero:hit-incoming', incoming);
    if (incoming.cancelled) return false;
    // Блок впитал удар целиком: герой цел, но удар состоялся (враг уходит на свою паузу между касаниями).
    if (incoming.amount <= 0) return !!incoming.blocked;
    hero.hp = Math.max(0, hero.hp - incoming.amount);
    hero.invuln = hero.cfg.iFrames;
    this.bus.emit('damage:dealt', { target: hero, targetKind: 'hero', amount: incoming.amount, source, hp: hero.hp });
    if (hero.hp <= 0) {
      hero.active = false;
      this.bus.emit('hero:died', { source });
    }
    return true;
  }
}
