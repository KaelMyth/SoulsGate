// Миниборс Тартас: цикл атак с телеграфами. Числа лежат в config.enemies.tartas.cycle.
//
// Цикл: босс идёт к герою; когда подошёл на startRange, начинается цикл из dashes рывков подряд:
//   телеграф (узкая линия через героя и дальше, видна сразу) → пауза telegraphDelay →
//   почти мгновенный рывок по линии (урон по линии) → на месте линии остаётся разлом (до конца цикла) →
//   пауза gap → следующий рывок.
// После последнего рывка: если три разлома попарно пересеклись и описали ТРЕУГОЛЬНИК, на всём треугольнике
// появляется телеграф (blast.delay), потом взрыв заливает его целиком (blast.damage). Вырожденный треугольник
// (герой стоял на месте): область взрыва это общая зона всех полос (см. blastArea). Затем разломы тают,
// босс стоит recovery секунд и уязвим, потом снова идёт к герою (cooldown).
//
// Состояния (this.state): idle → tele → dash → gap → (tele → dash → gap)… → blastTele → blast → recover → idle.
// Пока босс в цикле, e.atk.state не 'idle': обычное движение к герою выключено; на рывке он 'strike'
// (касание не считается второй раз, а swarm.separate не выталкивает босса из героя: passThroughHero).
//
// Данные для рисования читает renderer: fissures, tele, blast, fissureAlpha().
// События: 'boss:telegraph' { line }, 'boss:dash' { enemy }, 'boss:fissure' { fissure },
//          'boss:blast-telegraph' { poly, x, y }, 'boss:blast' { poly, x, y, hit }.
// Попадание по герою идёт через Combat.damageHero, значит блок и парирование работают как у остальных.
// Парировать можно и рывок, и взрыв.
//
// Разломы действуют на героя, пока он на них стоит: замедляют и поджигают. Рывок героя сквозь разлом
// эффект не накладывает. Горение бьёт мимо блока (Combat.damageHeroDot) и не включает неуязвимость.

/** Расстояние от точки до отрезка. */
export function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
}

/** Прямоугольник-полоса вокруг отрезка: четыре угла. hw: полуширина. */
export function rectPoly(x1, y1, x2, y2, hw) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * hw;
  const ny = (dx / len) * hw;
  return [
    { x: x1 + nx, y: y1 + ny },
    { x: x2 + nx, y: y2 + ny },
    { x: x2 - nx, y: y2 - ny },
    { x: x1 - nx, y: y1 - ny },
  ];
}

/** Площадь многоугольника (всегда неотрицательная). */
export function polyArea(p) {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

function signedArea2(p) {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s;
}

/** Обрезать многоугольник subject выпуклым многоугольником clip (Сазерленд-Ходжман). Результат: массив точек, может быть пустым. */
export function clipConvex(subject, clip) {
  const sign = signedArea2(clip) >= 0 ? 1 : -1;
  let out = subject;
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    const side = (p) => ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
    const input = out;
    out = [];
    for (let j = 0; j < input.length; j++) {
      const p = input[j];
      const q = input[(j + 1) % input.length];
      const dp = side(p);
      const dq = side(q);
      const pIn = dp * sign >= 0;
      const qIn = dq * sign >= 0;
      if (pIn) out.push(p);
      if (pIn !== qIn) {
        const t = dp / (dp - dq);
        out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
      }
    }
  }
  return out;
}

/**
 * Точка пересечения двух отрезков-разломов (по осевым линиям) или null. tol: допуск на концах, единиц:
 * следующий рывок начинается там, где кончился прошлый, и эти разломы должны считаться сошедшимися.
 */
export function segIntersect(a, b, tol = 2) {
  const rx = a.x2 - a.x1;
  const ry = a.y2 - a.y1;
  const sx = b.x2 - b.x1;
  const sy = b.y2 - b.y1;
  const la = Math.hypot(rx, ry);
  const lb = Math.hypot(sx, sy);
  const den = rx * sy - ry * sx;
  if (la < 1e-6 || lb < 1e-6 || Math.abs(den) < 1e-6 * la * lb) return null; // вырожденный или параллельный
  const qx = b.x1 - a.x1;
  const qy = b.y1 - a.y1;
  const t = (qx * sy - qy * sx) / den;
  const u = (qx * ry - qy * rx) / den;
  const ta = tol / la;
  const ub = tol / lb;
  if (t < -ta || t > 1 + ta || u < -ub || u > 1 + ub) return null;
  const tc = t < 0 ? 0 : t > 1 ? 1 : t;
  return { x: a.x1 + rx * tc, y: a.y1 + ry * tc };
}

/**
 * Область взрыва. Три разлома, пересекаясь попарно, описывают треугольник: он и есть область взрыва.
 * Если треугольника нет (вырожденный: герой стоял на месте и линии легли на одну прямую или сошлись в точку),
 * берём общую зону всех полос. Не пересекаются все три: взрыва нет (null).
 */
export function blastArea(fissures, minArea, tol = 2) {
  if (fissures.length === 3) {
    const p12 = segIntersect(fissures[0], fissures[1], tol);
    const p13 = segIntersect(fissures[0], fissures[2], tol);
    const p23 = segIntersect(fissures[1], fissures[2], tol);
    if (p12 && p13 && p23) {
      const tri = [p12, p23, p13];
      if (polyArea(tri) >= minArea) return tri;
    }
  }
  return commonArea(fissures, minArea);
}

/** Общая область всех разломов (полос): многоугольник или null, если её нет или она меньше minArea. */
export function commonArea(fissures, minArea) {
  if (!fissures.length) return null;
  let poly = rectPoly(fissures[0].x1, fissures[0].y1, fissures[0].x2, fissures[0].y2, fissures[0].hw);
  for (let i = 1; i < fissures.length && poly.length >= 3; i++) {
    const f = fissures[i];
    poly = clipConvex(poly, rectPoly(f.x1, f.y1, f.x2, f.y2, f.hw));
  }
  if (poly.length < 3 || polyArea(poly) < minArea) return null;
  return poly;
}

/** Расстояние от точки до выпуклого многоугольника: 0, если точка внутри. */
export function distToPolygon(px, py, poly) {
  let pos = 0;
  let neg = 0;
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const cross = (b.x - a.x) * (py - a.y) - (b.y - a.y) * (px - a.x);
    if (cross > 0) pos++;
    else if (cross < 0) neg++;
    const d = segDist(px, py, a.x, a.y, b.x, b.y);
    if (d < best) best = d;
  }
  return pos === 0 || neg === 0 ? 0 : best;
}

export class Boss {
  /** o: { config, hero, arena, combat, bus, defense?, rnd? } */
  constructor(o) {
    this.cfg = o.config;
    this.hero = o.hero;
    this.arena = o.arena;
    this.combat = o.combat;
    this.bus = o.bus;
    this.defense = o.defense || null;
    this.rnd = o.rnd || Math.random;
    this.dotSource = { burn: true, parryable: false, active: true }; // источник горения героя
    this.burnDamage = 0;   // параметры горения запоминаем при касании разлома: тики идут и после смерти босса
    this.burnInterval = 0.5;
    this.enemy = null;
    this.fissures = []; // { x1, y1, x2, y2, hw }: живые разломы (отрезок и полуширина)
    this.fade = 0;      // >0: разломы тают, сколько осталось
    this.fadeTotal = 1;
    this.tele = null;   // телеграф рывка: { x1, y1, x2, y2, hw, t, total } или null
    this.blast = null;  // область взрыва: { poly, x, y, phase: 'tele'|'flash', t, total } или null
    this.state = 'idle';
    this.t = 0;
    this.cd = 0;
    this.n = 0;         // сколько рывков цикла уже сделано
    this.line = null;   // текущая линия рывка
    this.travel = 0;
    this.hit = false;
    this.bus.on('boss:spawned', ({ enemy }) => this.attach(enemy));
    this.bus.on('enemy:killed', ({ enemy }) => { if (enemy === this.enemy) this.detach(); });
  }

  /** Альфа разломов: 1, пока цикл идёт; плавно к нулю, когда тают. */
  fissureAlpha() {
    return this.fade > 0 ? this.fade / Math.max(0.001, this.fadeTotal) : 1;
  }

  attach(e) {
    this.clear();
    this.enemy = e;
    this.cd = e.def.cycle ? e.def.cycle.firstDelay : 0;
    this.setState('idle');
  }

  /** Босс убит: всё, что он оставил на земле, исчезает. */
  detach() {
    this.clear();
    this.enemy = null;
  }

  reset() {
    this.detach();
  }

  clear() {
    this.fissures.length = 0;
    this.fade = 0;
    this.tele = null;
    this.blast = null;
    this.line = null;
    this.state = 'idle';
    this.t = 0;
    this.n = 0;
    this.hit = false;
  }

  setState(s) {
    this.state = s;
    this.t = 0;
    const e = this.enemy;
    if (e) e.atk.state = s === 'idle' ? 'idle' : s === 'dash' ? 'strike' : 'boss';
  }

  /** До какого расстояния от центра героя достаёт удар: тело героя или сфера блока (как у обычных атак). */
  reachRadius() {
    const h = this.hero;
    return this.defense && this.defense.blocking ? Math.max(h.radius, this.defense.blockRadius) : h.radius;
  }

  update(dt) {
    if (this.fade > 0) {
      this.fade -= dt;
      if (this.fade <= 0) {
        this.fade = 0;
        this.fissures.length = 0;
      }
    }
    this.updateHeroStatus(dt); // горение героя дотикивает, даже если босса уже убили
    const e = this.enemy;
    if (!e) return;
    if (!e.active) {
      this.detach();
      return;
    }
    const C = e.def.cycle;
    if (!C) return;
    this.applyFissures(C);
    this.t += dt;
    switch (this.state) {
      case 'idle': this.updateIdle(e, C, dt); break;
      case 'tele': this.updateTele(e, C); break;
      case 'dash': this.updateDash(e, C, dt); break;
      case 'gap': this.updateGap(e, C); break;
      case 'blastTele': this.updateBlastTele(e, C); break;
      case 'blast': this.updateBlast(e, C); break;
      case 'recover': this.updateRecover(e, C); break;
      default: break;
    }
  }

  /**
   * Разломы действуют на героя, пока стоит на них: замедление и горение (обновляются, пока он на разломе).
   * Рывок героя сквозь разлом ничего не накладывает (hero.dashing). Тающие разломы уже не действуют.
   */
  applyFissures(C) {
    const hero = this.hero;
    if (!hero.active || hero.dashing || this.fade > 0 || !this.fissures.length || !C.fissure) return;
    const F = C.fissure;
    const pad = hero.radius * 0.5; // центр героя почти на полосе: касание краем тела не считается
    for (let i = 0; i < this.fissures.length; i++) {
      const f = this.fissures[i];
      if (segDist(hero.x, hero.y, f.x1, f.y1, f.x2, f.y2) > f.hw + pad) continue;
      hero.slowMul = F.slowMul;
      hero.slowT = F.slowTime;
      if (hero.burnT <= 0) hero.burnTick = F.burnInterval; // первый тик через интервал, не сразу
      hero.burnT = F.burnTime;
      this.burnDamage = F.burnDamage;
      this.burnInterval = F.burnInterval;
      this.bus.emit('boss:fissure-touch', { fissure: f });
      return;
    }
  }

  /** Тики горения героя: урон мимо блока и неуязвимости (Combat.damageHeroDot). */
  updateHeroStatus(dt) {
    const hero = this.hero;
    if (hero.burnT <= 0) return;
    if (!hero.active) {
      hero.burnT = 0;
      return;
    }
    hero.burnT -= dt;
    hero.burnTick -= dt;
    while (hero.burnTick <= 0 && hero.active) {
      this.combat.damageHeroDot(this.burnDamage, this.dotSource);
      hero.burnTick += Math.max(0.05, this.burnInterval);
    }
    if (hero.burnT <= 0) hero.burnT = 0;
  }

  updateIdle(e, C, dt) {
    this.t = 0;
    if (this.cd > 0) this.cd -= dt;
    if (this.cd > 0 || !this.hero.active) return;
    const d = Math.hypot(this.hero.x - e.x, this.hero.y - e.y);
    if (d > C.startRange) return;
    this.fissures.length = 0; // цикл начинается с чистой земли
    this.fade = 0;
    this.n = 0;
    this.startTele(e, C);
  }

  /** Линия через героя и дальше: направление запоминается сейчас, от неё можно уйти. */
  startTele(e, C) {
    const hero = this.hero;
    let dx = hero.x - e.x;
    let dy = hero.y - e.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) {
      dx = 1;
      dy = 0;
    } else {
      dx /= d;
      dy /= d;
    }
    const D = C.dash;
    const want = Math.max(D.minLength, d + D.overshoot);
    const len = this.clipToArena(e.x, e.y, dx, dy, want, e.radius);
    this.line = { x1: e.x, y1: e.y, x2: e.x + dx * len, y2: e.y + dy * len, dx, dy, len, hw: D.width / 2 };
    this.tele = { x1: this.line.x1, y1: this.line.y1, x2: this.line.x2, y2: this.line.y2, hw: this.line.hw, t: 0, total: C.telegraphDelay };
    this.setState('tele');
    this.bus.emit('boss:telegraph', { line: this.line });
  }

  /** Сколько можно пройти из (x, y) по (dx, dy), не выйдя за стену арены (центр босса держится на радиус от стены). */
  clipToArena(x, y, dx, dy, len, margin) {
    const a = this.arena;
    let t = len;
    if (dx > 1e-9) t = Math.min(t, (a.right - margin - x) / dx);
    else if (dx < -1e-9) t = Math.min(t, (a.left + margin - x) / dx);
    if (dy > 1e-9) t = Math.min(t, (a.bottom - margin - y) / dy);
    else if (dy < -1e-9) t = Math.min(t, (a.top + margin - y) / dy);
    return Math.max(0, t);
  }

  updateTele(e, C) {
    if (this.tele) this.tele.t = this.t;
    if (this.t < C.telegraphDelay) return;
    this.tele = null;
    this.travel = 0;
    this.hit = false;
    e.strikeSrc.active = true;
    e.strikeSrc.parryable = C.dash.parryable !== false;
    e.strikeSrc.x = e.x;
    e.strikeSrc.y = e.y;
    this.setState('dash');
    this.bus.emit('boss:dash', { enemy: e });
  }

  /** Рывок: очень быстро по запомненной линии; урон по герою, если он на линии. Герой не останавливает босса. */
  updateDash(e, C, dt) {
    const D = C.dash;
    const L = this.line;
    const speed = L.len / Math.max(0.01, D.time);
    const step = Math.min(speed * dt, L.len - this.travel);
    const bx = e.x;
    const by = e.y;
    e.x += L.dx * step;
    e.y += L.dy * step;
    this.arena.resolveCircle(e); // скала обрывает рывок скольжением, стена не пускает
    this.travel += step;
    e.strikeSrc.x = e.x;
    e.strikeSrc.y = e.y;

    const hero = this.hero;
    if (!this.hit && hero.active) {
      if (segDist(hero.x, hero.y, bx, by, e.x, e.y) <= D.width / 2 + this.reachRadius()) {
        this.hit = true;
        this.combat.damageHero(D.damage, e.strikeSrc); // блок гасит часть, парирование (если окно открыто) гасит всё
      }
    }
    if (this.travel >= L.len - 1e-6 || this.t >= D.time * 2) this.finishDash(e, C);
  }

  /** Рывок закончен: на месте линии остаётся разлом. */
  finishDash(e, C) {
    const f = this.makeFissure(this.line, e);
    this.fissures.push(f);
    this.n++;
    this.bus.emit('boss:fissure', { fissure: f });
    this.setState('gap');
  }

  updateGap(e, C) {
    if (this.t < C.gap) return;
    if (this.n < C.dashes) {
      this.startTele(e, C);
      return;
    }
    // Все рывки сделаны: если разломы пересеклись и описали треугольник, он и взорвётся.
    const B = C.blast;
    const poly = blastArea(this.fissures, B.minArea);
    if (!poly) {
      this.endCycle(e, C);
      return;
    }
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < poly.length; i++) {
      cx += poly[i].x;
      cy += poly[i].y;
    }
    cx /= poly.length;
    cy /= poly.length;
    this.blast = { poly, x: cx, y: cy, phase: 'tele', t: 0, total: B.delay };
    this.setState('blastTele');
    this.bus.emit('boss:blast-telegraph', { poly, x: cx, y: cy });
  }

  updateBlastTele(e, C) {
    this.blast.t = this.t;
    if (this.t < C.blast.delay) return;
    const B = this.blast;
    B.phase = 'flash';
    B.t = 0;
    B.total = C.blast.flash;
    this.setState('blast');
    // Взрыв бьёт сразу, на первом шаге: кто в области (с учётом сферы блока), тот получает урон.
    const hero = this.hero;
    let hit = false;
    if (hero.active && distToPolygon(hero.x, hero.y, B.poly) <= this.reachRadius()) {
      e.strikeSrc.active = true;
      e.strikeSrc.parryable = C.blast.parryable !== false; // парировать можно всё (config: blast.parryable)
      e.strikeSrc.x = B.x;
      e.strikeSrc.y = B.y;
      hit = true;
      this.combat.damageHero(C.blast.damage, e.strikeSrc);
    }
    this.bus.emit('boss:blast', { poly: B.poly, x: B.x, y: B.y, hit });
  }

  updateBlast(e, C) {
    this.blast.t = this.t;
    if (this.t < C.blast.flash) return;
    this.blast = null;
    this.endCycle(e, C);
  }

  /** Цикл кончился: разломы тают, босс стоит и уязвим. */
  endCycle(e, C) {
    if (this.fissures.length) {
      this.fade = this.fadeTotal = Math.max(0.01, C.fissureFade);
    }
    this.tele = null;
    this.blast = null;
    this.setState('recover');
  }

  updateRecover(e, C) {
    if (this.t < C.recovery) return;
    this.cd = C.cooldown;
    this.setState('idle');
  }

  /**
   * Разлом на месте рывка: отрезок от начала линии до того места, где босс реально остановился
   * (скала могла оборвать рывок). Конец разлома = начало следующего рывка, поэтому соседние разломы сходятся.
   * e может быть опущен (тесты): тогда берётся запланированный конец линии.
   */
  makeFissure(L, e) {
    return { x1: L.x1, y1: L.y1, x2: e ? e.x : L.x2, y2: e ? e.y : L.y2, hw: L.hw };
  }
}
