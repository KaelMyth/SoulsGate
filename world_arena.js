// Арена: прямоугольник с центром в (0,0) и скалы-круги. Скалы твёрдые, границы тоже.
// На этапе 2 здесь появятся слои столкновений (герой, враги, снаряды героя, снаряды врагов).

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Ближайшая к (x, y) точка границы многоугольника poly [{x, y}]: пишет её в out, возвращает расстояние. */
function nearestOnPoly(poly, x, y, out) {
  let best = Infinity;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const l2 = ex * ex + ey * ey;
    let t = l2 > 0 ? ((x - a.x) * ex + (y - a.y) * ey) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = a.x + ex * t;
    const py = a.y + ey * t;
    const d2 = (x - px) * (x - px) + (y - py) * (y - py);
    if (d2 < best) { best = d2; out.x = px; out.y = py; }
  }
  return Math.sqrt(best);
}

/** Внутри ли точка многоугольника (чётность пересечений луча). */
export function pointInPoly(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

const NP = { x: 0, y: 0 };

export class Arena {
  constructor(cfg) {
    this.width = cfg.width;
    this.height = cfg.height;
    this.left = -cfg.width / 2;
    this.right = cfg.width / 2;
    this.top = -cfg.height / 2;
    this.bottom = cfg.height / 2;
    this.cfgRocks = cfg.rocks;
    // Северная заснеженная крепость: целиком непроходимая стена с закрытыми воротами.
    // Декор занимает часть прямоугольника, но координаты пола и камеры не меняются.
    this.northWall = cfg.northWall?.enabled ? { depth: cfg.northWall.depth } : null;
    this.walkTop = this.top + (this.northWall ? this.northWall.depth : 0);
    this.rocks = [];
    // Финальный бой: остаток карты разрушается, ходить можно только по острову zone { left, right, top, bottom }.
    // null = вся арена. Летающие (def.flies: Апофеоз) и снаряды идут по всей арене. collapse: 0..1, насколько разрушена карта (для отрисовки).
    this.zone = null;
    this.collapse = 0;
    this.restoreRocks();
  }

  /**
   * Остров босса Апофеоз: многоугольник. Верхняя сторона (к боссу) плоская, остальные три ломаные: вершины со
   * случайным заходом внутрь до jag. F: { zoneWidth, zoneHeight, zoneCenterX, zoneCenterY, jag, jagStep }.
   * Возвращает { left, right, top, bottom, poly }: габариты и вершины по кругу, начиная с левого верхнего угла.
   */
  buildIsland(F, rnd) {
    const hw = F.zoneWidth / 2;
    const hh = F.zoneHeight / 2;
    const L = F.zoneCenterX - hw;
    const R = F.zoneCenterX + hw;
    const T = F.zoneCenterY - hh;
    const B = F.zoneCenterY + hh;
    const jag = F.jag;
    const step = F.jagStep;
    const poly = [{ x: L, y: T }, { x: R, y: T }];
    for (let y = T + step; y < B - step * 0.5; y += step) poly.push({ x: R - rnd() * jag, y: y + (rnd() - 0.5) * step * 0.3 });
    poly.push({ x: R - rnd() * jag * 0.8, y: B - rnd() * jag * 0.8 });
    for (let x = R - step; x > L + step * 0.5; x -= step) poly.push({ x: x + (rnd() - 0.5) * step * 0.3, y: B - rnd() * jag });
    poly.push({ x: L + rnd() * jag * 0.8, y: B - rnd() * jag * 0.8 });
    for (let y = B - step; y > T + step * 0.5; y -= step) poly.push({ x: L + rnd() * jag, y: y + (rnd() - 0.5) * step * 0.3 });
    return { left: L, right: R, top: T, bottom: B, poly };
  }

  /** Остров: всё вне него разрушено (z.poly, иначе прямоугольник). Скалы вне острова исчезают. */
  setZone(z) {
    this.zone = z ? { left: z.left, right: z.right, top: z.top, bottom: z.bottom, poly: z.poly || null } : null;
    if (z) {
      for (let i = this.rocks.length - 1; i >= 0; i--) {
        const k = this.rocks[i];
        let out;
        if (z.poly) out = !pointInPoly(z.poly, k.x, k.y) || nearestOnPoly(z.poly, k.x, k.y, NP) < k.r * 0.3;
        else out = k.x < z.left - k.r || k.x > z.right + k.r || k.y < z.top - k.r || k.y > z.bottom + k.r;
        if (out) this.rocks.splice(i, 1);
      }
    }
  }

  /** Вдвинуть круг в многоугольник острова (с зазором radius от кромки). */
  resolveInPoly(c, poly) {
    for (let pass = 0; pass < 3; pass++) {
      const inside = pointInPoly(poly, c.x, c.y);
      const d = nearestOnPoly(poly, c.x, c.y, NP);
      if (inside && d >= c.radius) return;
      let dx;
      let dy;
      if (d > 1e-6) {
        dx = inside ? c.x - NP.x : NP.x - c.x;
        dy = inside ? c.y - NP.y : NP.y - c.y;
        const l = Math.hypot(dx, dy);
        dx /= l;
        dy /= l;
      } else {
        dx = 0;
        dy = 1; // ровно на кромке: считаем «вниз», от плоской верхней стороны
      }
      c.x = NP.x + dx * c.radius;
      c.y = NP.y + dy * c.radius;
    }
  }

  /** Скалы как в конфиге (новый забег после того, как жуки проснулись и скалы исчезли). id стабильный: по нему рисуется спрайт. */
  restoreRocks() {
    this.rocks.length = 0;
    this.zone = null;
    this.collapse = 0;
    for (let i = 0; i < this.cfgRocks.length; i++) {
      const r = this.cfgRocks[i];
      this.rocks.push({ x: r.x, y: r.y, r: r.r, id: i });
    }
  }

  /** Убрать скалу из мира (жук проснулся). Возвращает убранную скалу или null. */
  removeRock(rock) {
    const i = this.rocks.indexOf(rock);
    if (i < 0) return null;
    this.rocks.splice(i, 1);
    return rock;
  }

  get objectCount() {
    return this.rocks.length;
  }

  /** Задевает ли круг (x, y, r) какую-нибудь скалу. */
  circleHitsRock(x, y, r) {
    if (this.northWall && !this.zone && y - r < this.walkTop) return true;
    for (let i = 0; i < this.rocks.length; i++) {
      const rock = this.rocks[i];
      const dx = x - rock.x;
      const dy = y - rock.y;
      const lim = rock.r + r;
      if (dx * dx + dy * dy < lim * lim) return true;
    }
    return false;
  }

  /**
   * Перекрыт ли отрезок (x0, y0)-(x1, y1) скалой. pad: запас на толщину того, что по нему движется
   * (радиус снаряда или врага). Нужен для прямой видимости: цели и пути врагов.
   */
  segmentBlocked(x0, y0, x1, y1, pad) {
    if (this.northWall && !this.zone && Math.min(y0, y1) - pad < this.walkTop) return true;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len2 = dx * dx + dy * dy;
    for (let i = 0; i < this.rocks.length; i++) {
      const rock = this.rocks[i];
      let t = len2 > 0 ? ((rock.x - x0) * dx + (rock.y - y0) * dy) / len2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = x0 + dx * t - rock.x;
      const py = y0 + dy * t - rock.y;
      const lim = rock.r + pad;
      if (px * px + py * py < lim * lim) return true;
    }
    return false;
  }

  /**
   * Вытолкнуть круг c = { x, y, radius } из скал и вернуть внутрь арены.
   * Выталкивание вдоль нормали даёт естественное скольжение вдоль скалы.
   */
  resolveCircle(c) {
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < this.rocks.length; i++) {
        const rock = this.rocks[i];
        const dx = c.x - rock.x;
        const dy = c.y - rock.y;
        const minD = c.radius + rock.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= minD * minD) continue;
        const d = Math.sqrt(d2);
        const nx = d > 1e-6 ? dx / d : 0;
        const ny = d > 1e-6 ? dy / d : -1; // ровно в центре скалы: толкаем вверх
        c.x = rock.x + nx * minD;
        c.y = rock.y + ny * minD;
      }
      const z = this.zone && !(c.def && c.def.flies) ? this.zone : null;
      const b = z || this;
      c.x = clamp(c.x, b.left + c.radius, b.right - c.radius);
      c.y = clamp(c.y, (!z && this.northWall ? this.walkTop : b.top) + c.radius, b.bottom - c.radius);
      if (z && z.poly) this.resolveInPoly(c, z.poly); // ломаный остров: вдвигаем от кромки
    }
  }
}
