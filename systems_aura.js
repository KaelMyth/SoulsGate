// Смертельная аура: мод на ядро щита. Постоянное поле вокруг героя бьёт врагов внутри тиками.
// Радиус растёт от Х2/Х3 на ауре, Мощь усиливает урон тика, Ускорение учащает тики.
// Горение и Мороз на ауре действуют лишь на каждом aura.effectEvery-м тике (по умолчанию на третьем).

export class Aura {
  /** o: { config, hero, enemies, grid, combat, modifiers, ignite, chill } */
  constructor(o) {
    this.cfg = o.config;
    this.hero = o.hero;
    this.enemies = o.enemies;
    this.grid = o.grid;
    this.combat = o.combat;
    this.modifiers = o.modifiers || null;
    this.ignite = o.ignite;
    this.chill = o.chill;
    this.zap = o.zap || null;
    this.rnd = o.rnd || Math.random;
    this.source = { aura: true, active: true };
    this.active = false;  // стоит ли мод
    this.radius = 0;      // текущий радиус поля (для рисования)
    this.pulse = 0;       // вспышка поля на тике: 1 → 0
    this.kind = 0;        // стихия поля для рисования: 0 нет, 1 Мороз, 2 Горение, 3 пар
    this.lightning = false; // есть мод Молния (только вид)
    this.timer = 0;
    this.n = 0;           // номер тика: каждый effectEvery-й несёт огонь и мороз
    this.hit = [];
    this.candidates = [];
    let big = 0;
    for (const k in this.cfg.enemies) big = Math.max(big, this.cfg.enemies[k].radius || 0);
    this.reach = big + 12;
  }

  update(dt) {
    const m = this.modifiers ? this.modifiers(this.cfg.block.core) : null;
    const a = m && m.aura;
    this.pulse = Math.max(0, this.pulse - dt * 5);
    if (!a || !this.hero.active) {
      this.active = false;
      this.timer = 0;
      return;
    }
    const A = this.cfg.aura;
    this.active = true;
    this.kind = m.frost && m.burn ? 3 : m.burn ? 2 : m.frost ? 1 : 0; // стихия для отрисовки: 0 нет, 1 лёд, 2 огонь, 3 пар
    this.lightning = !!m.lightning; // Молния на ауре: поле потрескивает разрядами (только вид)
    this.radius = A.radius * (1 + A.radiusStep * ((a.mult || 1) - 1)); // Х2/Х3 на ауре: шире
    const dmg = A.damage * (a.damage || 1) + (m.lightning ? this.cfg.shock.attackBonus * m.lightning.count : 0);                            // Мощь
    const interval = 1 / (A.ticks * (a.rate || 1));                    // Ускорение: больше тиков в секунду
    this.timer += dt;
    for (let guard = 0; this.timer >= interval && guard < 8; guard++) {
      this.timer -= interval;
      this.tick(m, dmg);
    }
    if (this.timer > interval) this.timer = interval;
  }

  tick(m, dmg) {
    const h = this.hero;
    const en = this.enemies.items;
    const buf = this.candidates;
    const n = this.grid.query(h.x, h.y, this.radius + this.reach, buf);
    const hit = this.hit;
    hit.length = 0;
    for (let k = 0; k < n; k++) {
      const e = en[buf[k]];
      if (!e || !e.active) continue;
      const dx = e.x - h.x;
      const dy = e.y - h.y;
      const r = this.radius + e.radius;
      if (dx * dx + dy * dy <= r * r) hit.push(e);
    }
    this.pulse = 1;
    this.source.kind = this.kind; // для эффекта попадания (только вид)
    const fx = ++this.n % this.cfg.aura.effectEvery === 0 && (m.burn || m.frost);
    const bd = fx && m.burn ? dmg * this.cfg.burn.damageFrac * m.burn.damage : 0;
    const bi = fx && m.burn ? this.cfg.burn.interval / m.burn.rate : 0;
    const st = bd > 0 && m.frost && m.steam ? m.steam.damage : 0;
    for (const e of hit) { // бьём после поиска: убийство меняет пул врагов
      if (!e.active) continue;
      this.combat.damageEnemy(e, dmg, this.source, null);
      if (e.active && m.lightning && this.zap && this.rnd() < this.cfg.aura.shockChance) this.zap(e, bd, bi, fx && m.frost ? 1 : 0, st, m.lightning.mult); // Молния: шанс 1/5 на каждом тике
      if (!e.active || !fx) continue;
      if (bd > 0) this.ignite(e, bd, bi);
      if (m.frost) this.chill(e, st, bd, bi);
    }
  }
}
