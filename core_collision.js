// Столкновения кругов со слоями. Попадание определяется пересечением фигур, а не ручными
// проверками по координатам: игра только объявляет, какие слои с какими взаимодействуют.
//
//   world.setLayer(Layer.ENEMY, enemies.items);     // живой массив, не копия
//   world.addRule(Layer.HERO_PROJ, Layer.ENEMY, (снаряд, враг) => { ... });
//   world.detect();                                  // раз в шаг логики
//
// Тело = любой объект с полями x, y, radius, active. Неактивные пропускаются.
// Пары слоёв без правила не проверяются вообще: снаряд героя не заденет героя.

export const Layer = Object.freeze({
  HERO: 1,
  ENEMY: 2,
  HERO_PROJ: 4,
  ENEMY_PROJ: 8,
});

export function circlesOverlap(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const r = a.radius + b.radius;
  return dx * dx + dy * dy <= r * r;
}

export class CollisionWorld {
  constructor() {
    this.lists = new Map();
    this.rules = [];
    this.checks = 0; // сколько пар проверено за последний detect (для отладки нагрузки)
  }

  setLayer(layer, list) {
    this.lists.set(layer, list);
  }

  /** onHit(a, b): a из слоя layerA, b из слоя layerB. Если a стал неактивным, перебор для него прекращается. */
  addRule(layerA, layerB, onHit) {
    this.rules.push({ a: layerA, b: layerB, onHit });
  }

  detect() {
    this.checks = 0;
    for (let r = 0; r < this.rules.length; r++) {
      const rule = this.rules[r];
      const la = this.lists.get(rule.a);
      const lb = this.lists.get(rule.b);
      if (!la || !lb) continue;
      for (let i = 0; i < la.length; i++) {
        const A = la[i];
        if (!A.active) continue;
        for (let j = 0; j < lb.length; j++) {
          const B = lb[j];
          if (!B.active) continue;
          this.checks++;
          if (circlesOverlap(A, B)) {
            rule.onHit(A, B);
            if (!A.active) break; // снаряд попал и исчез: второго врага он не заденет
          }
        }
      }
    }
  }
}
