// Стая: жуки, оказавшиеся рядом, стараются стать вплотную друг к другу и идти вместе.
//
// Три правила, все числа в config.swarm:
//   сплочённость: если рядом есть жук, но между ними зазор, тянемся к центру ближней группы;
//                 вплотную тяга выключается, поэтому стая не дрожит;
//   согласованность: идём в сторону, куда идут соседи (общий курс, стая не расползается);
//   теснота: круги не накладываются, жуки соприкасаются, как гроздь, но не слипаются в одну точку.
// Соседей ищет сетка (core/spatial-grid.js), поэтому цена растёт с числом врагов почти линейно.
import { SpatialGrid } from './core_spatial-grid.js';

export class Swarm {
  /** cfg: config.swarm (живой объект: ползунки действуют сразу); arena: размеры мира. */
  constructor(cfg, arena) {
    this.cfg = cfg;
    this.arena = arena;
    this.grid = new SpatialGrid(arena, cfg.cell);
    this.pairChecks = 0; // для отладки нагрузки
  }

  /** В начале шага, по положениям с прошлого шага. Сетку используют и автоатака, и стая. */
  rebuild(list) {
    this.grid.rebuild(list);
  }

  /** Считает для каждого жука подсказку курса (swX, swY). Двигает их updateEnemy. */
  steer(list) {
    const cfg = this.cfg;
    const grid = this.grid;
    const R = cfg.clusterRadius;
    const R2 = R * R;
    let checks = 0;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.active) continue;
      e.swX = 0;
      e.swY = 0;
      if (!e.def.swarm) continue;
      const m = grid.query(e.x, e.y, R);
      const buf = grid.buf;
      let n = 0;
      let sx = 0;
      let sy = 0;
      let hx = 0;
      let hy = 0;
      let nearestGap = Infinity;
      for (let k = 0; k < m; k++) {
        const j = buf[k];
        if (j === i) continue;
        const o = list[j];
        if (!o.active || !o.def.swarm) continue;
        const dx = o.x - e.x;
        const dy = o.y - e.y;
        const d2 = dx * dx + dy * dy;
        checks++;
        if (d2 > R2) continue;
        n++;
        sx += dx;
        sy += dy;
        hx += o.hx;
        hy += o.hy;
        const gap = Math.sqrt(d2) - e.radius - o.radius;
        if (gap < nearestGap) nearestGap = gap;
      }
      if (n === 0) continue;
      // Сплочённость: к центру соседей, и тем сильнее, чем больше зазор до ближайшего.
      const cl = Math.hypot(sx, sy);
      if (cl > 1e-6) {
        const pull = Math.min(1, Math.max(0, nearestGap) / cfg.fullPullGap) * cfg.cohesion;
        e.swX += (sx / cl) * pull;
        e.swY += (sy / cl) * pull;
      }
      // Согласованность: средний курс соседей.
      const hl = Math.hypot(hx, hy);
      if (hl > 1e-6) {
        e.swX += (hx / hl) * cfg.alignment;
        e.swY += (hy / hl) * cfg.alignment;
      }
    }
    this.pairChecks = checks;
  }

  /**
   * Теснота: растащить накладывающиеся круги и не пустить жуков в героя. Сетка собрана до движения,
   * поэтому радиус поиска с запасом на сдвиг за шаг (откидывание быстрее всего).
   */
  separate(list, hero, arena) {
    const grid = this.grid;
    const iters = Math.max(0, Math.round(this.cfg.separationIters));
    const slack = 36;
    let checks = 0;
    for (let it = 0; it < iters; it++) {
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (!e.active) continue;
        const m = grid.query(e.x, e.y, e.radius * 2 + slack);
        const buf = grid.buf;
        for (let k = 0; k < m; k++) {
          const j = buf[k];
          if (j === i) continue;
          const o = list[j];
          if (!o.active) continue;
          const dx = e.x - o.x;
          const dy = e.y - o.y;
          const min = e.radius + o.radius;
          const d2 = dx * dx + dy * dy;
          checks++;
          if (d2 >= min * min) continue;
          const d = Math.sqrt(d2);
          let nx;
          let ny;
          if (d > 1e-4) {
            nx = dx / d;
            ny = dy / d;
          } else {
            const a = i * 2.399963; // «золотой угол»: у совпавших точно в одну точку разные направления
            nx = Math.cos(a);
            ny = Math.sin(a);
          }
          const push = (min - d) * 0.5;
          e.x += nx * push;
          e.y += ny * push;
        }
      }
    }
    // Герой не проходим для жуков (и они не залезают в него, когда сзади давит толпа).
    if (hero.active) {
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (!e.active) continue;
        if (e.def.passThroughHero && e.atk.state === 'strike') continue; // рывок босса идёт сквозь героя
        const dx = e.x - hero.x;
        const dy = e.y - hero.y;
        const min = hero.radius + e.radius - 2;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2) || 1e-4;
        e.x = hero.x + (dx / d) * min;
        e.y = hero.y + (dy / d) * min;
      }
    }
    for (let i = 0; i < list.length; i++) if (list[i].active) arena.resolveCircle(list[i]);
    this.pairChecks += checks;
  }
}
