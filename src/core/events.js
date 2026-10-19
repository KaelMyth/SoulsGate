// Общая шина событий («урон нанесён», «враг убит», «парирование», «стик отпущен»).
// Подписчики добавляются без правки ядра.
//
// Подписка и отписка копируют список (copy-on-write): emit не создаёт мусор
// и безопасен, если подписчик отписывается прямо во время события.
export class EventBus {
  constructor() {
    this.map = new Map();
    this.taps = [];
  }

  /** Подписаться на событие. Возвращает функцию отписки. fn(payload, name). */
  on(name, fn) {
    const list = this.map.get(name);
    this.map.set(name, list ? list.concat([fn]) : [fn]);
    return () => this.off(name, fn);
  }

  /** Сработать один раз. */
  once(name, fn) {
    const off = this.on(name, (payload, n) => {
      off();
      fn(payload, n);
    });
    return off;
  }

  off(name, fn) {
    const list = this.map.get(name);
    if (!list) return;
    const next = list.filter((f) => f !== fn);
    if (next.length) this.map.set(name, next);
    else this.map.delete(name);
  }

  /** Слушатель всех событий сразу (журналы, отладка): fn(name, payload). */
  tap(fn) {
    this.taps = this.taps.concat([fn]);
    return () => {
      this.taps = this.taps.filter((f) => f !== fn);
    };
  }

  emit(name, payload) {
    const list = this.map.get(name);
    if (list) for (let i = 0; i < list.length; i++) list[i](payload, name);
    const taps = this.taps;
    for (let i = 0; i < taps.length; i++) taps[i](name, payload);
  }
}
