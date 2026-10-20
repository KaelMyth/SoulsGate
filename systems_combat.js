// Урон. Весь урон проходит через шину событий, чтобы на неё могли подписываться
// мана, модификаторы и блок, не трогая код врагов и снарядов.
//
// События:
//   'enemy:hit-incoming' { enemy, amount, knockback, dirX, dirY, source, cancelled }
//                        ДО применения удара по врагу. Подписчик (модификатор) может изменить урон,
//                        силу откидывания и направление или отменить удар целиком.
//   'hero:hit-incoming'  { amount, source, cancelled }   ДО применения урона по герою.
//                        На этапе 4 здесь встанут блок и парирование.
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

  /** Возвращает true, если урон реально прошёл (герой не неуязвим и удар не отменён). */
  damageHero(amount, source) {
    const hero = this.hero;
    if (!hero.active || hero.invuln > 0) return false;
    const incoming = { amount, source, cancelled: false };
    this.bus.emit('hero:hit-incoming', incoming);
    if (incoming.cancelled || incoming.amount <= 0) return false;
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
