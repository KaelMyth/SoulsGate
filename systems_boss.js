// Миниборс Тартас: атаки с телеграфами. Числа лежат в config.enemies.tartas.cycle.
//
// Пул атак (cycle.pool): рывки и клинки (третья атака добавится сюда же). Когда босс подошёл на startRange,
// следующая атака выбирается случайно из пула, но не та, что была прошлой: тип в кд, пока не применится другой.
//
// Атака 2, клинки: босс стоит, камера отъезжает (cameraZoom), вокруг героя появляются кольцом 4, затем 8,
// затем 16 клинков. Они вылетают по одному в случайном порядке и пролетают линию почти мгновенно (как рывок).
// Каждый следующий клинок целится в то место, где герой был в момент вылета предыдущего (линия видна launchInterval
// секунд до вылета). Каждый клинок бьёт один раз, его можно парировать.
// Состояния: idle → bladeIn → (bladeWave → bladeGap)×3 → recover → idle.
//
// Атака 1, рывки: босс идёт к герою; когда подошёл на startRange, начинается цикл из dashes рывков подряд:
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
    // Пул атак. last: тип прошлой атаки, он «в кд», пока не применится любой другой. attack: идущая сейчас.
    this.last = '';
    this.attack = '';
    // Клинки (вторая атака): объекты заводятся один раз и переиспользуются, в бою новых не создаём.
    this.blades = [];      // { x, y, x1, y1, x2, y2, dx, dy, len, hw, travel, launchAt, state, active, hit, parryable }
    this.bladeCount = 0;   // сколько клинков в текущей волне
    this.bladeWave = 0;    // номер текущей волны клинков (0, 1, 2)
    this.bladeOrder = [];  // случайный порядок вылета (перестановка индексов)
    this.bladeNext = 0;    // сколько клинков волны уже вылетело (индекс следующего в bladeOrder)
    this.bladeCx = 0;      // центр кольца текущей волны (где стоял герой при появлении)
    this.bladeCy = 0;
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
    const C = e.def.cycle;
    this.cd = C ? C.firstDelay : 0;
    // Запас объектов под самую большую волну клинков.
    const B = C && C.blades;
    const max = B ? Math.max.apply(null, B.waves) : 0;
    while (this.blades.length < max) {
      this.blades.push({
        x: 0, y: 0, x1: 0, y1: 0, x2: 0, y2: 0, dx: 1, dy: 0, len: 1, hw: 7, travel: 0, launchAt: 0,
        state: 0, aimed: false, active: false, hit: false, parryable: true, enemy: null,
      });
      this.bladeOrder.push(0);
    }
    this.setState('idle');
  }

  /**
   * Следующая атака из пула (cycle.pool). Тип, которым била прошлая атака, в кд: пока не применится другой,
   * его не берём; из остальных выбираем случайно. forceAttack (для проверки): 1 только рывки, 2 только клинки.
   */
  pickAttack(C) {
    if (C.forceAttack === 1) return 'dash';
    if (C.forceAttack === 2 && C.blades) return 'blades';
    const pool = (C.pool && C.pool.length ? C.pool : ['dash']).filter((k) => k === 'dash' || (k === 'blades' && C.blades));
    let list = pool.filter((k) => k !== this.last);
    if (!list.length) list = pool; // в пуле один тип: повторять нечем
    return list[Math.min(list.length - 1, Math.floor(this.rnd() * list.length))];
  }

  /** Во сколько раз камера должна быть отдалена сейчас: во время атаки клинками C.blades.zoom, иначе 1. */
  cameraZoom() {
    const e = this.enemy;
    if (!e || !e.active || this.attack !== 'blades' || !e.def.cycle || !e.def.cycle.blades) return 1;
    const s = this.state;
    return s === 'bladeIn' || s === 'bladeWave' || s === 'bladeGap' ? e.def.cycle.blades.zoom : 1;
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
    this.last = '';
    this.attack = '';
    this.bladeCount = 0;
    this.bladeWave = 0;
    for (let i = 0; i < this.blades.length; i++) {
      this.blades[i].state = 0;
      this.blades[i].active = false;
    }
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
      case 'bladeIn': if (this.t >= C.blades.zoomWait) this.spawnBladeWave(e, C); break;
      case 'bladeWave': this.updateBladeWave(e, C, dt); break;
      case 'bladeGap': if (this.t >= C.blades.waveGap) this.spawnBladeWave(e, C); break;
      default: break;
    }
  }

  /** Атака клинками: босс стоит, камера отъезжает (cameraZoom), потом волны клинков 4, 8, 16 (cycle.blades.waves). */
  startBlades(e, C) {
    this.bladeWave = 0;
    this.bladeCount = 0;
    this.setState('bladeIn');
    this.bus.emit('boss:blades-start', { enemy: e });
  }

  /**
   * Волна: клинки появляются кольцом вокруг героя (на B.radius) и ждут. Вылетают по одному в случайном порядке.
   * Прицел фиксируется по очереди: первый клинок целится в героя сразу, а каждый следующий в то место, где герой
   * оказался в момент вылета предыдущего (aimBlade). Линия видна только у клинка, готового к вылету,
   * и висит launchInterval секунд: за это время от неё нужно уйти.
   * Если герой у стены, клинок ставится на границу арены, а линия всё равно идёт через героя.
   */
  spawnBladeWave(e, C) {
    const B = C.blades;
    const n = Math.min(B.waves[this.bladeWave], this.blades.length);
    const cx = this.hero.x;
    const cy = this.hero.y;
    const phase = this.rnd() * Math.PI * 2;
    const step = (Math.PI * 2) / n;
    const order = this.bladeOrder;
    for (let i = 0; i < n; i++) order[i] = i;
    for (let i = n - 1; i > 0; i--) { // случайная перестановка: кто вылетит первым, вторым и так далее
      const j = Math.min(i, Math.floor(this.rnd() * (i + 1)));
      const tmp = order[i];
      order[i] = order[j];
      order[j] = tmp;
    }
    const A = this.arena;
    for (let i = 0; i < n; i++) {
      const bl = this.blades[i];
      const a = phase + i * step;
      let sx = cx + Math.cos(a) * B.radius;
      let sy = cy + Math.sin(a) * B.radius;
      sx = Math.max(A.left + 12, Math.min(A.right - 12, sx));
      sy = Math.max(A.top + 12, Math.min(A.bottom - 12, sy));
      let dx = cx - sx;
      let dy = cy - sy;
      let d = Math.hypot(dx, dy);
      if (d < 1e-3) {
        dx = -Math.cos(a);
        dy = -Math.sin(a);
        d = 0;
      } else {
        dx /= d;
        dy /= d;
      }
      const len = this.clipToArena(sx, sy, dx, dy, d + B.overshoot, 0);
      bl.x = bl.x1 = sx;
      bl.y = bl.y1 = sy;
      bl.dx = dx;
      bl.dy = dy;
      bl.len = Math.max(1, len);
      bl.x2 = sx + dx * bl.len;
      bl.y2 = sy + dy * bl.len;
      bl.hw = B.width / 2;
      bl.travel = 0;
      bl.hit = false;
      bl.state = 1; // ждёт вылета
      bl.aimed = false; // прицел ещё не зафиксирован: линия не показывается
      bl.active = true; // false: клинок парирован (защита гасит источник) или долетел
      bl.parryable = B.parryable !== false;
    }
    this.bladeCx = cx;
    this.bladeCy = cy;
    this.bladeNext = 0;
    const first = this.blades[order[0]];
    this.aimBlade(first, B);
    first.launchAt = B.telegraphDelay;
    this.bladeCount = n;
    this.setState('bladeWave');
    this.bus.emit('boss:blades-spawn', { count: n, x: cx, y: cy, wave: this.bladeWave });
  }

  /**
   * Зафиксировать прицел клинка: линия из его места через героя там, где он стоит сейчас, и дальше на overshoot.
   * После этого клинок летит строго по ней: герой может уйти.
   */
  aimBlade(bl, B) {
    let dx = this.hero.x - bl.x1;
    let dy = this.hero.y - bl.y1;
    let d = Math.hypot(dx, dy);
    if (d < 1e-3) { // герой точно в клинке: целимся к центру кольца
      dx = this.bladeCx - bl.x1;
      dy = this.bladeCy - bl.y1;
      d = Math.hypot(dx, dy);
      if (d < 1e-3) {
        dx = 1;
        dy = 0;
        d = 0;
      }
    }
    if (d > 0) {
      dx /= d;
      dy /= d;
    }
    bl.dx = dx;
    bl.dy = dy;
    bl.len = Math.max(1, this.clipToArena(bl.x1, bl.y1, dx, dy, d + B.overshoot, 0));
    bl.x2 = bl.x1 + dx * bl.len;
    bl.y2 = bl.y1 + dy * bl.len;
    bl.aimed = true;
  }

  /**
   * Волна идёт: клинки вылетают по очереди (случайный порядок) и пролетают линию почти мгновенно;
   * в момент вылета следующий клинок целится в героя там, где он сейчас, и вылетит через launchInterval.
   * Задели героя: урон (парируется).
   */
  updateBladeWave(e, C, dt) {
    const B = C.blades;
    const hero = this.hero;
    const n = this.bladeCount;
    while (this.bladeNext < n) { // очередной клинок: пора ли вылетать (while на случай интервала короче шага)
      const nb = this.blades[this.bladeOrder[this.bladeNext]];
      if (this.t < nb.launchAt) break;
      nb.state = 2;
      this.bus.emit('boss:blade-fly', { blade: nb });
      this.bladeNext++;
      if (this.bladeNext < n) {
        const nx = this.blades[this.bladeOrder[this.bladeNext]];
        this.aimBlade(nx, B); // прицел по месту героя в момент этого вылета
        nx.launchAt = nb.launchAt + B.launchInterval;
      }
    }
    let live = 0;
    for (let i = 0; i < n; i++) {
      const bl = this.blades[i];
      if (bl.state === 3) continue;
      if (bl.state === 1) { // ждёт своей очереди
        live++;
        continue;
      }
      // Летит. Парированный клинок гаснет (защита снимает active у источника удара).
      if (!bl.active) {
        bl.state = 3;
        continue;
      }
      const speed = bl.len / Math.max(0.01, B.time);
      const step = Math.min(speed * dt, bl.len - bl.travel);
      const px = bl.x;
      const py = bl.y;
      bl.x += bl.dx * step;
      bl.y += bl.dy * step;
      bl.travel += step;
      if (!bl.hit && hero.active && segDist(hero.x, hero.y, px, py, bl.x, bl.y) <= bl.hw + this.reachRadius()) {
        bl.hit = true; // один клинок бьёт один раз
        this.combat.damageHero(B.damage, bl); // блок гасит часть, парирование (если окно открыто) гасит всё
      }
      if (!bl.active || bl.travel >= bl.len - 1e-6) {
        bl.state = 3;
        bl.active = false;
      } else {
        live++;
      }
    }
    if (live > 0) return;
    this.bladeWave++;
    if (this.bladeWave < B.waves.length) {
      this.setState('bladeGap');
    } else {
      this.bladeCount = 0;
      this.setState('recover'); // камера возвращается (cameraZoom вернёт 1), босс стоит и уязвим
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
    this.fissures.length = 0; // атака начинается с чистой земли
    this.fade = 0;
    this.n = 0;
    this.attack = this.last = this.pickAttack(C);
    if (this.attack === 'blades') this.startBlades(e, C);
    else this.startTele(e, C);
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
