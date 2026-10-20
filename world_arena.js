// Арена: прямоугольник с центром в (0,0) и скалы-круги. Скалы твёрдые, границы тоже.
// На этапе 2 здесь появятся слои столкновений (герой, враги, снаряды героя, снаряды врагов).

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export class Arena {
  constructor(cfg) {
    this.width = cfg.width;
    this.height = cfg.height;
    this.left = -cfg.width / 2;
    this.right = cfg.width / 2;
    this.top = -cfg.height / 2;
    this.bottom = cfg.height / 2;
    this.rocks = cfg.rocks.map((r) => ({ x: r.x, y: r.y, r: r.r }));
  }

  get objectCount() {
    return this.rocks.length;
  }

  /** Задевает ли круг (x, y, r) какую-нибудь скалу. */
  circleHitsRock(x, y, r) {
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
      c.x = clamp(c.x, this.left + c.radius, this.right - c.radius);
      c.y = clamp(c.y, this.top + c.radius, this.bottom - c.radius);
    }
  }
}
