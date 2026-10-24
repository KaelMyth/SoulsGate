// Спектральные клинки (мод на щите): голубые треугольники копятся вокруг героя, а когда набралось максимум,
// все летят во врагов. На одного врага не больше perTarget клинков, остальные выбирают других.
// Клинок самонаводится на цель, при попадании бьёт и исчезает. Сам щит мод не меняет.

import { bladeInterval, laserStats } from './build_cores.js';

const TAU = Math.PI * 2;

function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export class Blades {
  /** o: { config, hero, enemies (EntityPool), grid (SpatialGrid), combat, modifiers: (id) => mods } */
  constructor(o) {
    this.cfg = o.config;
    this.hero = o.hero;
    this.enemies = o.enemies;
    this.grid = o.grid;
    this.combat = o.combat;
    this.modifiers = o.modifiers || null;
    this.lasers = o.lasers || []; // общий список лучей игры: сюда клинки-сферы выпускают лазеры
    this.ignite = o.ignite || null; // (враг, урон тика, интервал) от Горения на клинках
    this.chill = o.chill || null;   // (враг, пар, урон тика, интервал) от Мороза на клинках
    this.items = []; // { x, y, a (угол полёта или место на орбите), state: 'orbit' | 'fly', target, vx, vy, age }
    this.timer = 0;
    this.spin = 0;
    this.source = { blade: true, active: true };
    this.cand = [];   // враги в зоне запуска, ближние первыми
    this.counts = new Map();
  }

  reset() {
    this.items.length = 0;
    this.timer = 0;
    this.spin = 0;
  }

  orbiting() {
    let n = 0;
    for (const b of this.items) if (b.state === 'orbit') n++;
    return n;
  }

  /** Враги в радиусе range от героя по возрастанию расстояния (в this.cand: { e, d }). */
  gather(range) {
    const en = this.enemies.items;
    const h = this.hero;
    const n = this.grid.query(h.x, h.y, range);
    const buf = this.grid.buf;
    const out = this.cand;
    out.length = 0;
    for (let k = 0; k < n; k++) {
      const e = en[buf[k]];
      if (!e || !e.active) continue;
      const d = Math.hypot(e.x - h.x, e.y - h.y);
      if (d <= range) out.push({ e, d });
    }
    out.sort((p, q) => p.d - q.d);
    return out;
  }

  /** Раздать цели орбитальным клинкам пачками по perTarget: следующий клинок идёт к ближайшему, где ещё есть место. */
  launch(m, dmg, max) {
    const B = this.cfg.blades;
    const cand = this.gather(B.range);
    if (!cand.length) return false;
    const counts = this.counts;
    counts.clear();
    for (const b of this.items) {
      if (b.state !== 'orbit') continue;
      let pick = null;
      for (const c of cand) {
        if ((counts.get(c.e) || 0) < B.perTarget) { pick = c.e; break; }
      }
      if (!pick) { // все цели заняты: начинаем новый круг
        counts.clear();
        pick = cand[0].e;
      }
      counts.set(pick, (counts.get(pick) || 0) + 1);
      b.target = pick;
      b.age = 0;
      if (m && m.laser) {
        // «Лазер» на клинках: сфера не летит, а выпускает луч в цель и висит на орбите, пока луч светит.
        if (this.pushLaser(b, pick, m, dmg, max)) b.state = 'fire';
        else b.state = 'gone';
      } else b.state = 'fly';
    }
    return true;
  }

  update(dt) {
    const B = this.cfg.blades;
    const m = this.modifiers ? this.modifiers(B.core) : null;
    if (!m || !m.blades) {
      for (const b of this.items) b.state = 'gone'; // мод сняли: клинки и их лучи пропали
      if (this.items.length) this.items.length = 0;
      this.timer = 0;
      return;
    }
    const hero = this.hero;
    if (!hero.active) return;
    this.spin += B.spin * dt;
    const bm = { max: m.blades.max || 1, damage: m.blades.damage || 1, rate: m.blades.rate || 1 };
    const max = Math.max(1, Math.round(B.max * bm.max));      // множители Х2/Х3 на клинках
    const interval = Math.max(0.03, bladeInterval(this.cfg, max) / bm.rate); // чем больше клинков, тем чаще; плюс Ускорение на клинках
    const dmg = B.damage * bm.damage;                          // Мощь на клинках

    // Копим клинки, пока их на орбите меньше максимума.
    let orbit = this.orbiting();
    if (orbit < max) {
      this.timer += dt;
      while (this.timer >= interval && orbit < max) {
        this.timer -= interval;
        this.items.push({ x: hero.x, y: hero.y, a: this.spin, state: 'orbit', target: null, vx: 0, vy: 0, age: 0 });
        orbit++;
      }
    } else {
      this.timer = 0;
      this.launch(m, dmg, max); // нет врагов в зоне: остаёмся на орбите и ждём
    }

    let w = 0; // убираем погасшие на месте: на этот массив смотрит отрисовка
    for (let r = 0; r < this.items.length; r++) if (this.items[r].state !== 'gone') this.items[w++] = this.items[r];
    this.items.length = w;
    const sphere = !!m.laser;
    for (const b of this.items) {
      b.sphere = sphere;
      if (b.state === 'fire') { // луч светит из сферы: она продолжает кружить
        b.a += B.spin * dt;
        b.x = hero.x + Math.cos(b.a) * B.orbit;
        b.y = hero.y + Math.sin(b.a) * B.orbit;
      }
    }

    // Орбита: клинки равномерно по кругу, плавно занимают место.
    orbit = this.orbiting();
    let i = 0;
    for (const b of this.items) {
      if (b.state !== 'orbit') continue;
      const want = this.spin + (i++ * TAU) / Math.max(1, orbit);
      const k = Math.min(1, dt * 12);
      b.a += angDiff(b.a, want) * k;
      const tx = hero.x + Math.cos(b.a) * B.orbit;
      const ty = hero.y + Math.sin(b.a) * B.orbit;
      b.x += (tx - b.x) * k;
      b.y += (ty - b.y) * k;
    }

    // Полёт: самонаведение, попадание, потеря цели.
    const items = this.items;
    for (let j = items.length - 1; j >= 0; j--) {
      const b = items[j];
      if (b.state !== 'fly') continue;
      b.age += dt;
      let t = b.target;
      if (!t || !t.active) {
        t = this.nearest(b.x, b.y, B.range * 1.5);
        b.target = t;
      }
      if (t) {
        const want = Math.atan2(t.y - b.y, t.x - b.x);
        const maxTurn = B.turn * dt;
        const d = angDiff(b.a, want);
        b.a += Math.max(-maxTurn, Math.min(maxTurn, d));
      }
      b.vx = Math.cos(b.a) * B.speed;
      b.vy = Math.sin(b.a) * B.speed;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (t) {
        const r = B.size + t.radius;
        const dx = t.x - b.x;
        const dy = t.y - b.y;
        if (dx * dx + dy * dy <= r * r) {
          this.combat.damageEnemy(t, dmg, this.source, { knockback: B.knockback, dirX: Math.cos(b.a), dirY: Math.sin(b.a) });
          if (t.active) this.applyEffects(t, m, dmg);
          items.splice(j, 1);
          continue;
        }
      }
      if (b.age >= B.life) items.splice(j, 1);
    }
  }

  /** Луч из сферы b в цель t: те же правила, что у лазера снаряда, урон луча от урона клинка. */
  pushLaser(b, t, m, dmg, max) {
    const L = this.cfg.laser;
    if (this.lasers.length >= L.max) return false;
    const one = laserStats(this.cfg, m.laser, dmg, 1);   // урон тика без штрафа за число
    const big = laserStats(this.cfg, m.laser, dmg, max); // длительность и яркость от числа сфер
    const bd = m.burn ? dmg * this.cfg.burn.damageFrac * m.burn.damage : 0;
    const dx = t.x - b.x;
    const dy = t.y - b.y;
    const len = Math.hypot(dx, dy) || 1;
    this.lasers.push({
      x: b.x, y: b.y, dx: dx / len, dy: dy / len, len: Math.min(L.length, len),
      target: t, pierce: 0, anchor: b,
      width: one.width, age: 0, life: big.life, interval: big.interval, ticks: big.ticks, done: 0, tick: one.tick, big: big.big,
      burnDmg: bd, burnInt: m.burn ? this.cfg.burn.interval / m.burn.rate : 0,
      frost: !!m.frost, steam: m.frost && m.steam && m.burn ? m.steam.damage : 0, pulse: 0,
    });
    return true;
  }

  /** Горение и Мороз на клинках: как у снаряда, сила от урона клинка. */
  applyEffects(e, m, dmg) {
    const bd = m.burn ? dmg * this.cfg.burn.damageFrac * m.burn.damage : 0;
    const bi = m.burn ? this.cfg.burn.interval / m.burn.rate : 0;
    if (bd > 0 && this.ignite) this.ignite(e, bd, bi);
    if (m.frost && this.chill) this.chill(e, bd > 0 && m.steam ? m.steam.damage : 0, bd, bi);
  }

  nearest(x, y, range) {
    const en = this.enemies.items;
    const n = this.grid.query(x, y, range);
    const buf = this.grid.buf;
    let best = null;
    let bd = range * range;
    for (let k = 0; k < n; k++) {
      const e = en[buf[k]];
      if (!e || !e.active) continue;
      const d = (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
}
