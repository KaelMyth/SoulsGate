// Охрана: обычные или замёрзшие пехотинцы кольцом окружают стрелка.
//
// Охранник (e.guardOf = стрелок) идёт не к герою, а на своё место в кольце вокруг стрелка (e.goalOn, точка e.goalX/Y).
// Кольцо поворачивается так, чтобы один из охранников всегда стоял между стрелком и героем.
// Охранник бросается в бой (становится обычным жуком), когда герой подошёл ближе config.guards.breakDist,
// или когда стрелок погиб. Параметры: config.guards.
const TAU = Math.PI * 2;

export class Guards {
  /** o: { config, hero } */
  constructor(o) {
    this.cfg = o.config;
    this.hero = o.hero;
  }

  /** Назначить охранников стрелку: массив guards[] уже созданных врагов, угол каждого на кольце ровно по кругу. */
  assign(leader, guards) {
    const n = guards.length;
    for (let i = 0; i < n; i++) {
      const g = guards[i];
      g.guardOf = leader;
      g.guardGen = leader.gen;
      g.guardAng = (i / n) * TAU;
      g.goalOn = true;
      g.goalX = leader.x;
      g.goalY = leader.y;
    }
  }

  release(e) {
    e.guardOf = null;
    e.goalOn = false;
  }

  /** До движения врагов: ставим цели охранникам. */
  update(dt, list) {
    const C = this.cfg.guards;
    const h = this.hero;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.active || !e.guardOf) continue;
      const g = e.guardOf;
      if (!g.active || g.gen !== e.guardGen || g.hp <= 0) { this.release(e); continue; } // стрелок погиб: бросаемся в бой
      if (Math.hypot(h.x - e.x, h.y - e.y) < C.breakDist || Math.hypot(h.x - g.x, h.y - g.y) < C.breakDist) {
        this.release(e);
        continue;
      }
      const a = Math.atan2(h.y - g.y, h.x - g.x) + e.guardAng;
      e.goalX = g.x + Math.cos(a) * C.ringDist;
      e.goalY = g.y + Math.sin(a) * C.ringDist;
      e.swX = e.swY = 0; // стая охранников не тянет их друг к другу и к герою
    }
  }
}
