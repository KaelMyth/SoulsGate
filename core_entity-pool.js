// Список живых объектов + пул для их повторного использования.
//
// Объект «умирает» флагом (kill), а в пул возвращается только в sweep() в конце шага логики.
// Так объект, убитый в этом шаге, не может быть тут же выдан заново и попасть в список дважды,
// а перебор списков в середине шага остаётся безопасным.
//
// reset(obj) обязан сбрасывать obj.active = false.
import { Pool } from './core_pool.js';

export class EntityPool {
  constructor(create, reset, prewarm = 0) {
    this.pool = new Pool(create, reset, prewarm);
    this.items = [];
  }

  /** Достать объект и поставить в список. Поля заполняет вызывающий. */
  spawn() {
    const e = this.pool.acquire();
    e.active = true;
    this.items.push(e);
    return e;
  }

  kill(e) {
    e.active = false;
  }

  /** Убрать неактивных из списка и вернуть в пул. Звать в конце шага. */
  sweep() {
    const items = this.items;
    let w = 0;
    for (let i = 0; i < items.length; i++) {
      const e = items[i];
      if (e.active) items[w++] = e;
      else this.pool.release(e);
    }
    items.length = w;
  }

  clear() {
    for (let i = 0; i < this.items.length; i++) this.items[i].active = false;
    this.sweep();
  }

  /** Сколько объектов в списке (после sweep это число живых). */
  get count() {
    return this.items.length;
  }
}
