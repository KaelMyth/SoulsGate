// Молниеносный рывок (вторичное ядро): герой превращается в молнию, рикошетит по врагам и ставится в безопасное место.
// Порядок: plan() выбирает цепочку целей, begin() запускает, update() двигает героя по цепочке тиками hopTime,
// на каждом попадании бьёт врага, в конце ставит героя на небольшом отдалении от всех врагов.

export class LightDash {
  /** o: { config, hero, enemies, arena, combat, rnd } */
  constructor(o) {
    this.cfg = o.config;
    this.hero = o.hero;
    this.enemies = o.enemies;
    this.arena = o.arena;
    this.combat = o.combat;
    this.rnd = o.rnd || Math.random;
    this.kind = 0;     // вид молнии по стихиям (0 жёлтая, 1 огонь, 2 мороз, 3 все)
    this.bounces = 0;  // сколько рикошетов (0 = по конфигу); задаёт игра из модов
    this.damageMul = 1;
    this.onHit = o.onHit || null; // (враг) => void: заряд электризации за каждый удар
    this.source = { lightning: true, active: true };
    this.route = [];     // цели цепочки
    this.active = false;
    this.idx = 0;        // следующая цель
    this.t = 0;          // время текущего прыжка
    this.fromX = 0;
    this.fromY = 0;
    this.phase = 'hop';  // 'hop' (прыжки), 'wait' (пауза перед посадкой)
    this.duration = 0;   // полная длительность цепочки
    this.bolts = [];     // отрезки молнии для рисования: { x0, y0, x1, y1, age }
    this.spot = { x: 0, y: 0 };
  }

  reset() {
    this.active = false;
    this.route.length = 0;
    this.bolts.length = 0;
  }

  /** Ближайший враг к (x, y) в радиусе range, не равный skip; предпочтение тем, кого ещё не били (route). */
  pick(x, y, range, skip) {
    const en = this.enemies.items;
    let best = null;
    let bd = range * range;
    let bestSeen = null;
    let sd = range * range;
    for (let i = 0; i < en.length; i++) {
      const e = en[i];
      if (!e.active || e === skip) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      const d = dx * dx + dy * dy;
      if (d > range * range) continue;
      if (this.route.includes(e)) { if (d < sd) { sd = d; bestSeen = e; } }
      else if (d < bd) { bd = d; best = e; }
    }
    return best || bestSeen || (skip && skip.active ? skip : null);
  }

  /** Строит цепочку от героя. Возвращает false, если рядом нет врагов (тогда рывок обычный). */
  plan() {
    const L = this.cfg.lightdash;
    const h = this.hero;
    this.route.length = 0;
    const first = this.pick(h.x, h.y, L.range, null);
    if (!first) return false;
    this.route.push(first);
    for (let k = 1; k < (this.bounces || L.bounces); k++) {
      const prev = this.route[k - 1];
      const nx = this.pick(prev.x, prev.y, L.hopRange, prev);
      if (!nx) break;
      this.route.push(nx);
    }
    this.duration = this.route.length * L.hopTime + L.pause;
    return true;
  }

  begin() {
    this.active = true;
    this.idx = 0;
    this.t = 0;
    this.phase = 'hop';
    this.fromX = this.hero.x;
    this.fromY = this.hero.y;
    this.bolts.length = 0;
  }

  update(dt) {
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      this.bolts[i].age += dt;
      if (this.bolts[i].age > 0.25) this.bolts.splice(i, 1);
    }
    if (!this.active) return;
    const L = this.cfg.lightdash;
    const h = this.hero;
    if (!h.active) { this.active = false; return; }
    if (h.invuln < 0.1) h.invuln = 0.1; // молния неуязвима
    this.t += dt;
    if (this.phase === 'hop') {
      const e = this.route[this.idx];
      if (!e || !e.active) { // цель пропала: прыгаем к следующей или садимся
        this.idx++;
        this.t = 0;
        if (this.idx >= this.route.length) this.phase = 'wait';
        return;
      }
      const k = Math.min(1, this.t / L.hopTime);
      h.x = this.fromX + (e.x - this.fromX) * k;
      h.y = this.fromY + (e.y - this.fromY) * k;
      if (k >= 1) {
        this.bolts.push({ x0: this.fromX, y0: this.fromY, x1: e.x, y1: e.y, age: 0, k: this.kind });
        this.combat.damageEnemy(e, L.damage * this.damageMul, this.source, { knockback: 0 });
        if (e.active && this.onHit) this.onHit(e);
        this.fromX = h.x;
        this.fromY = h.y;
        this.idx++;
        this.t = 0;
        if (this.idx >= this.route.length) this.phase = 'wait';
      }
    } else if (this.t >= L.pause) {
      this.land();
      this.active = false;
    }
  }

  /** Посадка: из случайных точек вокруг выбирается та, что дальше всего от ближайшего врага (но не слишком далеко). */
  land() {
    const L = this.cfg.lightdash;
    const h = this.hero;
    const arena = this.arena;
    const en = this.enemies.items;
    let bx = h.x;
    let by = h.y;
    let bs = -1;
    for (let k = 0; k < 28; k++) {
      const a = this.rnd() * Math.PI * 2;
      const d = L.safeMin + this.rnd() * (L.safeMax - L.safeMin);
      const x = h.x + Math.cos(a) * d;
      const y = h.y + Math.sin(a) * d;
      if (x < arena.left + 20 || x > arena.right - 20 || y < arena.top + 20 || y > arena.bottom - 20) continue;
      if (arena.circleHitsRock(x, y, h.radius + 4)) continue;
      let near = 1e9;
      for (let i = 0; i < en.length; i++) {
        const e = en[i];
        if (!e.active) continue;
        const dx = e.x - x;
        const dy = e.y - y;
        const dd = dx * dx + dy * dy;
        if (dd < near) near = dd;
      }
      if (near > bs) { bs = near; bx = x; by = y; }
    }
    this.bolts.push({ x0: h.x, y0: h.y, x1: bx, y1: by, age: 0, k: this.kind });
    h.x = bx;
    h.y = by;
    h.prevX = bx;
    h.prevY = by;
    h.vx = 0;
    h.vy = 0;
  }
}
