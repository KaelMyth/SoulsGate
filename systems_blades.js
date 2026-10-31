import { forCarrier } from './build_scopes.js';
// Спектральные клинки (мод на щите): голубые треугольники копятся вокруг героя, а когда набралось максимум,
// все летят во врагов. На одного врага не больше perTarget клинков, остальные выбирают других.
// Клинок самонаводится на цель, при попадании бьёт и исчезает. Сам щит мод не меняет.

import { phantomSpot, phantomRoll } from './systems_phantom.js';
import { bladeInterval, laserStats } from './build_cores.js';

const TAU = Math.PI * 2;

/** Последовательность 0, 1/2, 1/4, 3/4, 1/8 ...: каждый следующий в самом свободном месте круга. */
function vdc(n) {
  let r = 0;
  let f = 0.5;
  for (; n > 0; n >>= 1, f /= 2) if (n & 1) r += f;
  return r;
}

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
    this.arena = o.arena || null;     // для точки появления фантомного клинка
    this.rnd = o.rnd || Math.random;
    this.spot = { x: 0, y: 0, d: 0 };
    this.zap = o.zap || null;         // (враг) => void: заряд электризации от клинка-молнии
    this.pellets = o.pellets || null; // «Дробь» на клинках: при попадании клинок разбрасывает дробинки
    this.lasers = o.lasers || [];
    this.shotAngle = 0;               // куда направлен первый из четырёх разлётов; сдвигается с каждым попаданием // общий список лучей игры: сюда клинки-сферы выпускают лазеры
    this.ignite = o.ignite || null; // (враг, урон тика, интервал) от Горения на клинках
    this.chill = o.chill || null;   // (враг, пар, урон тика, интервал) от Мороза на клинках
    this.onAbsorptionHit = o.onAbsorptionHit || null; // только клинки, установленные под Поглощением
    this.items = []; // { x, y, a (угол полёта или место на орбите), state: 'orbit' | 'fly', target, vx, vy, age }
    this.timer = 0;
    this.spin = 0;
    this.source = { blade: true, active: true };
    this.cand = [];
    this.candidateIndices = [];   // враги в зоне запуска, ближние первыми
    this.counts = new Map();
    this.reset(); // счётчик слотов нужен уже при первом update, даже до начала забега
  }

  reset() {
    this.items.length = 0;
    this.timer = 0;
    this.spin = 0;
    this.shotAngle = 0;
    this.slot = 0;      // сколько клинков уже появилось в этой пачке: от этого зависит, на какой стороне появится следующий
    this.wave = false;  // идёт запуск пачки: новые не копятся, клинки уходят по одному
    this.gap = 0;       // таймер между запусками
    this.dtNow = 0;
    this.gravityMode = false;
    this.gravitySpawned = 0; // сколько постоянных клинков создано: никогда не больше обычного максимума
    this.gravityMax = 0; // текущий размер кольца, пересчитывается при смене множителя
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
    const buf = this.candidateIndices;
    const n = this.grid.query(h.x, h.y, range, buf);
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
  launch(m, dmg, max, rate = 1) {
    const B = this.cfg.blades;
    const cand = this.gather(B.range);
    if (!cand.length) return false;
    const counts = this.counts;
    if (!this.wave) { counts.clear(); this.wave = true; this.gap = 0; }
    this.gap -= this.dtNow;
    for (const b of this.items) {
      if (b.state !== 'orbit') continue;
      if (this.gap > 0) break;   // клинки уходят по одному, а не все разом
      this.gap += B.launchGap / rate; // Ускорение на клинках учащает и запуски
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
    if (this.gap < 0) this.gap = 0;
    return true;
  }

  update(dt) {
    const B = this.cfg.blades;
    const raw = this.modifiers ? this.modifiers(B.core) : null;
    const m = raw ? forCarrier(raw, 'blades') : null;
    if (m?.scopes) {
      const carrier = m.scopes.blades || {};
      const root = m.scopes.root || {};
      for (const element of ['burn','frost','lightning','steam']) {
        if (!m[element] && root[element]) m[element] = root[element];
      }
      m.laser = carrier.laser ? raw.laser : null;
      m.shot = carrier.shot ? raw.shot : null;
      m.phantom = carrier.phantom ? {...raw.phantom, mult:carrier.phantom.mult} : null;
      m.pierce = carrier.pierce ? {count:carrier.pierce.mult} : null;
      m.gravity = m.scopes.root?.gravity || carrier.gravity ? raw.gravity : null;
    }
    if (!m || !m.blades) {
      for (const b of this.items) b.state = 'gone'; // мод сняли: клинки и их лучи пропали
      if (this.items.length) this.items.length = 0;
      this.timer = 0;
      this.gravityMode = false;
      this.gravitySpawned = 0;
      this.gravityMax = 0;
      return;
    }
    const hero = this.hero;
    if (hero.incarnationT > 0) {
      // Обычные клинки скрыты на всё время Воплощения и не продолжают стрелять.
      this.items.length = 0;
      this.timer = 0;
      this.wave = false;
      this.gravitySpawned = 0;
      this.gravityMax = 0;
      this.gravityMode = false;
      this.slot = 0;
      return;
    }
    if (!hero.active) return;
    this.spin += B.spin * dt;
    const bm = { max: m.blades.max || 1, damage: m.blades.damage || 1, rate: m.blades.rate || 1 };
    const max = Math.max(1, Math.round(B.max * bm.max));      // множители Х2/Х3 на клинках
    // В связке Гравитация + Клинки существующие клинки возвращаются вместо удаления.
    // При активном Лазере сохраняем прежнее поведение сфер-лучей.
    const gravityReturn = !!m.gravity && !m.laser;
    if (gravityReturn !== this.gravityMode) {
      this.gravityMode = gravityReturn;
      if (gravityReturn) {
        if (this.items.length > max) this.items.length = max;
        this.slot = this.items.length;
        this.gravitySpawned = this.items.length;
        this.gravityMax = 0;
        this.wave = false;
        this.gap = 0;
      } else {
        this.gravitySpawned = 0;
        this.gravityMax = 0;
        for (const b of this.items) if (b.state === 'return' || b.state === 'gravityOrbit') b.state = 'orbit';
      }
    }
    if (gravityReturn && this.items.length > max) {
      this.items.length = max;
      this.gravitySpawned = Math.min(this.gravitySpawned, max);
      this.slot = this.items.length;
    }
    // Постоянные клинки получают собственные сектора; множители изменяют
    // весь круг, не только позиции новых клинков.
    if (gravityReturn && this.gravityMax !== max) {
      this.gravityMax = max;
      for (let i = 0; i < this.items.length; i++) this.items[i].off = TAU * i / max;
    }
    const interval = Math.max(0.03, bladeInterval(this.cfg, max) / bm.rate); // чем больше клинков, тем чаще; плюс Ускорение на клинках
    const dmg = B.damage * bm.damage + (m.lightning ? this.cfg.shock.attackBonus * m.lightning.count : 0);                          // Мощь на клинках

    // Копим клинки, пока их на орбите меньше максимума. Когда их много, залп начинается не дожидаясь полного набора:
    // первые уже летят, пока последние ещё появляются (launchAt).
    let orbit = this.orbiting();
    this.dtNow = dt;
    if (this.wave && orbit === 0) { this.wave = false; if (!gravityReturn) this.slot = 0; } // в гравитации сектора круга закреплены за клинками, номер не сбрасываем; // пачка ушла целиком: можно копить заново
    if (gravityReturn ? this.gravitySpawned < max && this.items.length < max : orbit < max) {
      this.timer += dt;
      while (this.timer >= interval && (gravityReturn ? this.gravitySpawned < max && this.items.length < max : orbit < max)) {
        this.timer -= interval;
        // Следующий клинок появляется на противоположной стороне от предыдущего (доли круга 0, 1/2, 1/4, 3/4, 1/8 ...).
        const slot = this.slot++;
        const off = gravityReturn ? TAU * slot / max : vdc(slot) * TAU;
        const a = this.spin + off;
        // Если несколько модов Клинков сидят на щите, только доля клинков из ветки
        // Поглощения засчитывается в его тройку попаданий.
        const linked = m.blades.linkedAbsorption || 0;
        const isAbsorptionBlade = linked > 0 && slot % m.blades.count < linked;
        this.items.push({ x: hero.x + Math.cos(a) * B.orbit, y: hero.y + Math.sin(a) * B.orbit, a, off, state: 'orbit', target: null, vx: 0, vy: 0, age: 0, absorptionLinked: isAbsorptionBlade });
        if (gravityReturn) this.gravitySpawned++;
        orbit++;
      }
    } else this.timer = 0;
    if (orbit > 0 && (this.wave || orbit >= (max >= (B.overlapFrom || 16) ? Math.min(max, B.launchAt || max) : max))) this.launch(m, dmg, max, bm.rate); // нет врагов в зоне: остаёмся на орбите и ждём

    let w = 0; // убираем погасшие на месте: на этот массив смотрит отрисовка
    for (let r = 0; r < this.items.length; r++) if (this.items[r].state !== 'gone') this.items[w++] = this.items[r];
    this.items.length = w;
    const sphere = !!m.laser;
    // Вид клинка для отрисовки: 0 меч, 1 кристалл (Мороз), 2 огненная стрела (Горение), 3 кристальная стрела (оба: пар).
    const kind = m.frost && m.burn ? 3 : m.burn ? 2 : m.frost ? 1 : 0;
    for (const b of this.items) {
      b.sphere = sphere;
      b.kind = kind;
      b.zap = m.lightning ? m.lightning.mult : 0; // с Молнией клинки это молнии (на орбите тоже): только вид, урон не меняется
      if (b.state === 'fire') { // луч светит из сферы: она продолжает кружить
        b.a += B.spin * dt;
        b.x = hero.x + Math.cos(b.a) * B.orbit;
        b.y = hero.y + Math.sin(b.a) * B.orbit;
      }
    }

    // Орбита: клинки равномерно по кругу, плавно занимают место.
    for (const b of this.items) {
      if (b.state !== 'orbit') continue;
      const want = this.spin + b.off; // у каждого клинка своё место на круге
      const k = Math.min(1, dt * 12);
      b.a += angDiff(b.a, want) * k;
      const tx = hero.x + Math.cos(b.a) * B.orbit;
      const ty = hero.y + Math.sin(b.a) * B.orbit;
      b.x += (tx - b.x) * k;
      b.y += (ty - b.y) * k;
    }

    // Гравитационный цикл: путь обратно → целый оборот вокруг героя → новая цель.
    // Ни один из этих этапов не создаёт новый клинок.
    if (gravityReturn) {
      const G = this.cfg.gravity;
      const returnSpeed = B.speed * Math.max(0.1, G.bladeReturnSpeed);
      const orbitSpeed = Math.max(0.1, G.bladeOrbitSpeed);
      for (const b of this.items) {
        if (b.state === 'return') {
          // Каждый возвращается в собственную движущуюся точку орбиты,
          // а не в центр героя: попадание по одной цели не склеивает клинки.
          const angle = this.spin + b.off;
          const tx = hero.x + Math.cos(angle) * B.orbit;
          const ty = hero.y + Math.sin(angle) * B.orbit;
          const dx = tx - b.x, dy = ty - b.y;
          const dist = Math.hypot(dx, dy);
          const step = returnSpeed * dt;
          if (dist > step) {
            b.a = Math.atan2(dy, dx);
            b.vx = dx / dist * returnSpeed;
            b.vy = dy / dist * returnSpeed;
            b.x += b.vx * dt;
            b.y += b.vy * dt;
          } else {
            b.x = tx;
            b.y = ty;
            b.vx = b.vy = 0;
            b.gravTheta = angle;
            b.gravProgress = 0;
            b.a = angle + Math.PI / 2;
            b.state = 'gravityOrbit';
          }
        } else if (b.state === 'gravityOrbit') {
          const step = orbitSpeed * dt;
          b.gravTheta += step;
          b.gravProgress = Math.min(TAU, b.gravProgress + step);
          b.x = hero.x + Math.cos(b.gravTheta) * B.orbit;
          b.y = hero.y + Math.sin(b.gravTheta) * B.orbit;
          b.a = b.gravTheta + Math.PI / 2;
          if (b.gravProgress >= TAU) {
            // Цели делим между клинками: каждый берёт ближайшего врага, которого ещё никто не атакует,
            // иначе вся стая летела бы в одного и выглядела как один клинок.
            let target = null;
            const cand = this.gather(B.range);
            for (const c of cand) {
              let load = 0;
              for (const o of this.items) if (o !== b && o.state === 'fly' && o.target === c.e) load++;
              if (load === 0) { target = c.e; break; }
            }
            if (!target && cand.length) target = cand[0].e;
            if (target) {
              b.target = target;
              b.age = 0;
              b.pc = undefined;
              b.a = Math.atan2(target.y - b.y, target.x - b.x);
              b.state = 'fly';
            }
          }
        }
      }
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
          const bd = b.mul ? dmg * b.mul : dmg; // фантомный клинок бьёт чуть иначе (phantom.damageFrac)
          this.source.kind = b.kind | 0; // для эффекта попадания (только вид)
          this.source.gen = b.gen | 0;
          this.source.pierce = !m.laser && (b.pc === undefined ? (m.pierce ? m.pierce.count : 0) : b.pc) > 0; // клинок пройдёт дальше (только вид)
          this.source.dx = Math.cos(b.a);
          this.source.dy = Math.sin(b.a);
          const hit = this.combat.damageEnemy(t, bd, this.source, { knockback: B.knockback, dirX: Math.cos(b.a), dirY: Math.sin(b.a) });
          if (hit && t.active && b.absorptionLinked && this.onAbsorptionHit) this.onAbsorptionHit(t);
          if (t.active) this.applyEffects(t, m, bd);
          if (m.lightning && t.active && this.zap) this.zap(t, m.burn ? bd * this.cfg.burn.damageFrac * m.burn.damage : 0, m.burn ? this.cfg.burn.interval / m.burn.rate : 0, m.frost ? 1 : 0, m.burn && m.frost && m.steam ? m.steam.damage : 0, m.lightning.mult);
          if (m.phantom && t.active) this.tryPhantomBlade(b, t, m);
          if (m.shot && this.pellets) this.scatter(t, b.a, m, dmg);
          if (gravityReturn) {
            b.state = 'return';
            b.target = null;
            b.pc = undefined; // след предыдущего полёта не меняет внешний вид
            b.age = 0;
            continue;
          }
          if (b.pc === undefined) b.pc = m.pierce ? m.pierce.count : 0;
          if (b.pc > 0 && !m.laser) { // Пробитие: клинок идёт дальше и ищет следующую цель
            b.pc--;
            const nx = this.nearestOther(b.x, b.y, B.range * 1.5, t);
            if (nx) { b.target = nx; b.age = 0; continue; }
          }
          items.splice(j, 1);
          continue;
        }
      }
      if (b.age >= B.life) {
        if (gravityReturn) { b.state = 'return'; b.target = null; b.age = 0; }
        else items.splice(j, 1);
      }
    }
  }

  /**
   * Фантомный клинок: после попадания с шансом (падает вдвое с поколением) рядом с врагом, не у героя,
   * появляется новый клинок и летит в него. Несёт те же эффекты; сам может породить следующий (до phantom.maxChain).
   */
  tryPhantomBlade(b, t, m) {
    const F = this.cfg.phantom;
    const B = this.cfg.blades;
    if ((m.gravity && !m.laser) || !this.arena || this.items.length >= B.maxAlive) return; // гравитационные клинки не размножаются
    if (!phantomRoll(F, this.rnd, Math.min(1, F.chance * m.phantom.mult), b.gen | 0)) return;
    const s = this.spot;
    if (!phantomSpot(this.arena, this.rnd, F, t, B.size, s)) return;
    this.items.push({
      x: s.x, y: s.y, a: Math.atan2(t.y - s.y, t.x - s.x), off: 0, state: 'fly', target: t,
      vx: 0, vy: 0, age: 0, gen: (b.gen | 0) + 1, mul: F.damageFrac * (m.phantom.damage || 1), sphere: false,
      absorptionLinked: !!b.absorptionLinked,
    });
  }

  /** Луч из сферы b в цель t: те же правила, что у лазера снаряда, урон луча от урона клинка. */
  pushLaser(b, t, m, dmg, max) {
    m = forCarrier(m, 'laser');
    const L = this.cfg.laser;
    if (this.lasers.length >= L.max) return false;
    const one = laserStats(this.cfg, m.laser, dmg, 1);   // урон тика без штрафа за число
    const big = laserStats(this.cfg, m.laser, dmg, max); // длительность и яркость от числа сфер
    const grav = m.gravity ? 1 + this.cfg.gravity.damageBonus * m.gravity.count : 1;
    const bd = m.burn ? dmg * this.cfg.burn.damageFrac * m.burn.damage * grav : 0;
    const dx = t.x - b.x;
    const dy = t.y - b.y;
    const len = Math.hypot(dx, dy) || 1;
    this.lasers.push({
      x: b.x, y: b.y, dx: dx / len, dy: dy / len, len: Math.min(L.length, len),
      target: t, pierce: 0, anchor: b,
      width: one.width, age: 0, life: big.life, interval: big.interval, ticks: big.ticks, done: 0, tick: one.tick * grav, big: big.big,
      gravityLaser: !!m.gravity, gravityChargeTime: m.gravity ? Math.max(0.05, this.cfg.gravity.laserCharge) : 0,
      gravityChargeAge: 0, gravityOrigin: 0, // центр накопления — сфера клинка
      burnDmg: bd, burnInt: m.burn ? this.cfg.burn.interval / m.burn.rate : 0,
      frost: !!m.frost, steam: m.frost && m.steam && m.burn ? m.steam.damage : 0, pulse: 0,
      zap: m.lightning ? m.lightning.mult : 0,
      gen: 0, phDmg: m.phantom ? m.phantom.damage || 1 : 1, phantom: m.phantom ? Math.min(1, this.cfg.phantom.chance * m.phantom.mult) : 0,
    });
    return true;
  }

  /**
   * «Дробь» на клинках: из места попадания в 4 стороны разлетаются дробинки с разной силой (скорость и дальность),
   * а каждое новое попадание поворачивает разлёт на shotShift. Половина дробинок несёт Горение и Мороз.
   */
  scatter(t, fromAngle, m, dmg) {
    m = forCarrier(m, 'shot');
    const B = this.cfg.blades;
    const S = this.cfg.shot;
    const P = this.pellets;
    const n = B.shotCount;
    const full = P.free();
    if (!full) return;
    const pd = dmg * S.damageFrac * (m.shot && m.shot.damage ? m.shot.damage : 1);
    const bd = m.burn ? dmg * this.cfg.burn.damageFrac * m.burn.damage : 0;
    const bi = m.burn ? this.cfg.burn.interval / m.burn.rate : 0;
    const st = bd > 0 && m.frost && m.steam ? m.steam.damage : 0;
    this.shotAngle += B.shotShift;
    for (let k = 0; k < n && k < full; k++) {
      const a = this.shotAngle + (k * TAU) / n;
      const f = B.shotPower[k % B.shotPower.length]; // сила: у каждой своя
      const fx = (k & 1) === 0;
      const off = t.radius + S.radius + 2;
      P.add(t.x + Math.cos(a) * off, t.y + Math.sin(a) * off, Math.cos(a) * S.speed * f, Math.sin(a) * S.speed * f, S.range * f, pd,
        fx ? bd : 0, fx ? bi : 0, fx && m.frost ? 1 : 0, fx ? st : 0, fx && m.lightning ? m.lightning.mult : 0);
    }
  }

  /** Горение и Мороз на клинках: как у снаряда, сила от урона клинка. */
  applyEffects(e, m, dmg) {
    const bd = m.burn ? dmg * this.cfg.burn.damageFrac * m.burn.damage : 0;
    const bi = m.burn ? this.cfg.burn.interval / m.burn.rate : 0;
    if (bd > 0 && this.ignite) this.ignite(e, bd, bi);
    if (m.frost && this.chill) this.chill(e, bd > 0 && m.steam ? m.steam.damage : 0, bd, bi);
  }

  /** Ближайший враг, кроме skip (для клинка с Пробитием). */
  nearestOther(x, y, range, skip) {
    const en = this.enemies.items;
    const buf = this.candidateIndices;
    const n = this.grid.query(x, y, range, buf);
    let best = null;
    let bd = range * range;
    for (let k = 0; k < n; k++) {
      const e = en[buf[k]];
      if (!e || !e.active || e === skip) continue;
      const d = (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
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
