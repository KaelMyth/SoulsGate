// Универсальный пул объектов. Заготовка по общему правилу «пулы с самого начала»:
// на этапе 1 в игре ещё нет снарядов, врагов и эффектов, пул подключится на этапе 2.
//
//   const bullets = new Pool(() => ({ x: 0, y: 0 }), (b) => { b.x = b.y = 0; });
//   const b = bullets.acquire();  ...  bullets.release(b);
export class Pool {
  constructor(create, reset, prewarm = 0) {
    this.create = create;
    this.reset = reset || null;
    this.free = [];
    this.active = 0;
    for (let i = 0; i < prewarm; i++) this.free.push(create());
  }

  acquire() {
    const obj = this.free.length ? this.free.pop() : this.create();
    this.active++;
    return obj;
  }

  release(obj) {
    if (this.reset) this.reset(obj);
    this.free.push(obj);
    this.active--;
  }

  get available() {
    return this.free.length;
  }
}
