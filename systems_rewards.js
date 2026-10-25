// Награды за уровень: мешок модов. На повышении уровня из него вынимаются 3 случайных предложения,
// выбранный мод уходит из мешка (мешок конечный: так задаёт игра, сколько чего можно получить за забег).
// Содержимое мешка описано данными: config.rewards.pool { ключ мода: сколько штук }.

export class Rewards {
  /** o: { config, rnd } */
  constructor(o) {
    this.cfg = o.config;
    this.rnd = o.rnd || Math.random;
    this.bag = [];
    this.reset();
  }

  reset() {
    this.bag = [];
    const pool = this.cfg.rewards.pool;
    for (const key in pool) for (let i = 0; i < pool[key]; i++) this.bag.push(key);
  }

  /** До n случайных предложений: массив { token, key }; token это место в мешке (для take). */
  draw(n) {
    const idx = this.bag.map((_, i) => i);
    const out = [];
    while (out.length < n && idx.length) {
      const j = Math.floor(this.rnd() * idx.length) % idx.length;
      const token = idx.splice(j, 1)[0];
      out.push({ token, key: this.bag[token] });
    }
    return out;
  }

  /** Забрать выбранное из мешка. */
  take(token) {
    if (token >= 0 && token < this.bag.length) this.bag.splice(token, 1);
  }
}
