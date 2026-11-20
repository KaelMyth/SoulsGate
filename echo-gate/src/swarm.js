// Стая жуков (перенос systems_swarm.js из SoulsGate, мир в метрах). Чистая логика, без графики.
// Три правила, числа в CONFIG.swarm:
//   сплочённость: если рядом есть жук, но между ними зазор, тянемся к центру ближней группы (вплотную тяга выключена, стая не дрожит);
//   согласованность: идём туда, куда идут соседи;
//   теснота: круги не накладываются, жуки соприкасаются как гроздь, но не слипаются в точку.
// Жук: { x, z, hx, hz (курс, единичный), radius, swX, swZ }; список жуков это Spawner.alive.
export class Swarm {
  constructor(cfg) {
    this.cfg = cfg;
    this.pairChecks = 0;
  }

  /** Для каждого жука считает подсказку курса (swX, swZ): сплочённость + согласованность. */
  steer(list) {
    const c = this.cfg;
    const R2 = c.clusterRadius * c.clusterRadius;
    let checks = 0;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      e.swX = 0; e.swZ = 0;
      if (!e.swarm) continue; // стрелки и охрана в стае не участвуют
      let n = 0, sx = 0, sz = 0, hx = 0, hz = 0, gapMin = Infinity;
      for (let j = 0; j < list.length; j++) {
        if (j === i) continue;
        const o = list[j];
        if (!o.swarm) continue;
        const dx = o.x - e.x, dz = o.z - e.z;
        const d2 = dx * dx + dz * dz;
        checks++;
        if (d2 > R2) continue;
        n++; sx += dx; sz += dz; hx += o.hx; hz += o.hz;
        const gap = Math.sqrt(d2) - e.radius - o.radius;
        if (gap < gapMin) gapMin = gap;
      }
      if (n === 0) continue;
      const cl = Math.hypot(sx, sz);
      if (cl > 1e-6) {
        const pull = Math.min(1, Math.max(0, gapMin) / c.fullPullGap) * c.cohesion;
        e.swX += (sx / cl) * pull; e.swZ += (sz / cl) * pull;
      }
      const hl = Math.hypot(hx, hz);
      if (hl > 1e-6) { e.swX += (hx / hl) * c.alignment; e.swZ += (hz / hl) * c.alignment; }
    }
    this.pairChecks = checks;
  }

  /** Теснота: растащить накладывающиеся круги и не пустить жуков в героя { x, z, radius }. */
  separate(list, hero) {
    const iters = Math.max(0, Math.round(this.cfg.separationIters));
    for (let it = 0; it < iters; it++) {
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        for (let j = 0; j < list.length; j++) {
          if (j === i) continue;
          const o = list[j];
          const dx = e.x - o.x, dz = e.z - o.z;
          const min = e.radius + o.radius;
          const d2 = dx * dx + dz * dz;
          if (d2 >= min * min) continue;
          const d = Math.sqrt(d2);
          let nx, nz;
          if (d > 1e-4) { nx = dx / d; nz = dz / d; }
          else { const a = i * 2.399963; nx = Math.cos(a); nz = Math.sin(a); } // совпавшие в точку расходятся по «золотому углу»
          if (e.heavy) continue; // тяжёлую скалу мелочь не двигает
          const push = (min - d) * (o.heavy ? 1 : 0.5); // а мелочь выталкивается из скалы целиком
          e.x += nx * push; e.z += nz * push;
        }
      }
    }
    for (const e of list) { // герой не проходим для жуков
      const dx = e.x - hero.x, dz = e.z - hero.z;
      const min = hero.radius + e.radius - 0.07;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2) || 1e-4;
      e.x = hero.x + (dx / d) * min;
      e.z = hero.z + (dz / d) * min;
    }
  }
}
