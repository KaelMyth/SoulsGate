// Урон. Весь урон проходит через шину событий, чтобы на неё могли подписываться
// мана, модификаторы и блок, не трогая код врагов и снарядов.
//
// События:
//   'hero:hit-incoming' { amount, source, cancelled }   ДО применения урона по герою.
//                        Подписчик может уменьшить amount или поставить cancelled = true.
//                        На этапе 4 здесь встанут блок и парирование.
//   'damage:dealt'      { target, targetKind: 'enemy'|'hero', amount, source, hp }   урон применён
//   'enemy:killed'      { enemy, source }
//   'hero:died'         { source }

export class Combat {
  constructor(bus, hero) {
    this.bus = bus;
    this.hero = hero;
  }

  damageEnemy(enemy, amount, source) {
    if (!enemy.active || amount <= 0) return false;
    enemy.hp -= amount;
    enemy.flash = 0.08;
    this.bus.emit('damage:dealt', { target: enemy, targetKind: 'enemy', amount, source, hp: enemy.hp });
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
