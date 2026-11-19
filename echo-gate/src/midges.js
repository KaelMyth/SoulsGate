// Мошки Горного жука (SoulsGate systems_rockbeetle.js, мир в метрах). Чистая логика, рисует MidgeView.
// Летят не по прямой: сначала разлетаются от жука (scatterTime), потом кружат вокруг героя на сужающемся кольце,
// каждая на своём месте по кругу (так пытаются окружить), потом бросаются на героя (diveSpeedMul).
// Мошку можно сбить выстрелом (одно попадание, hitTest/kill); не попала за life секунд: исчезает. Попала в героя: урон и исчезает.
const TAU = Math.PI * 2;

export class Midges {
  /** cfg: CONFIG целиком (читает limits.maxMidges); rnd: генератор 0..1 */
  constructor(cfg, rnd = Math.random) {
    this.cfg = cfg;
    this.rnd = rnd;
    this.items = [];
    this.onDied = null; // (мошка, how: 'hit' | 'shot' | 'life') => void, для эффектов
  }

  get count() { let n = 0; for (const m of this.items) if (m.active) n++; return n; }

  take() {
    let m = this.items.find((x) => !x.active);
    if (!m) { m = {}; this.items.push(m); }
    return m;
  }

  /** Выпустить n мошек из точки (x, z); hero: куда кружить; M: CONFIG.rock.midge. */
  burst(x, z, hero, n, M) {
    const a0 = this.rnd() * TAU;
    const slot0 = Math.atan2(z - hero.z, x - hero.x); // места по кругу делим от стороны жука
    for (let i = 0; i < n; i++) {
      if (this.count >= this.cfg.limits.maxMidges) break;
      const m = this.take();
      const a = a0 + (i / n) * TAU + (this.rnd() - 0.5) * 0.4;
      m.active = true; m.def = M;
      m.x = x; m.z = z;
      m.outX = Math.cos(a); m.outZ = Math.sin(a);
      m.vx = m.outX * M.speed * 0.6; m.vz = m.outZ * M.speed * 0.6;
      m.age = 0;
      m.slot = slot0 + (i / n) * TAU; // равномерно по кругу: вместе замыкают кольцо
      m.dir = this.rnd() < 0.5 ? -1 : 1;
      m.phase = this.rnd() * TAU;
      m.orbitEnd = M.scatterTime + M.orbitTime;
    }
  }

  kill(m, how) {
    if (!m.active) return;
    m.active = false;
    if (this.onDied) this.onDied(m, how);
  }

  clear() { for (const m of this.items) m.active = false; }

  /** Мошка в круге (x, z, r) или null: для попадания выстрела героя. */
  hitTest(x, z, r) {
    for (const m of this.items) {
      if (!m.active) continue;
      const dx = m.x - x, dz = m.z - z, R = r + m.def.radius;
      if (dx * dx + dz * dz <= R * R) return m;
    }
    return null;
  }

  /** hero: { x, z, radius }; onHit(урон) при попадании в героя. */
  update(dt, hero, onHit) {
    for (const m of this.items) {
      if (!m.active) continue;
      const M = m.def;
      m.age += dt;
      if (m.age >= M.life) { this.kill(m, 'life'); continue; }
      let dx, dz, sp = M.speed;
      if (m.age < M.scatterTime) {
        dx = m.outX; dz = m.outZ; sp *= 0.8;
      } else if (m.age < m.orbitEnd) {
        // Место на кольце вокруг героя: кольцо сужается, место едет по кругу, у каждой мошки своя сторона и дрожание.
        const k = Math.min(1, (m.age - M.scatterTime) / Math.max(0.01, m.orbitEnd - M.scatterTime));
        const R = M.orbitRadius + (M.orbitRadiusEnd - M.orbitRadius) * k + Math.sin(m.age * M.wobbleFreq + m.phase) * M.wobble;
        const ang = m.slot + m.dir * M.angularSpeed * (m.age - M.scatterTime);
        dx = hero.x + Math.cos(ang) * R - m.x;
        dz = hero.z + Math.sin(ang) * R - m.z;
        // Не лететь сквозь героя к месту на другой стороне кольца: у героя обходят по касательной.
        const hx0 = m.x - hero.x, hz0 = m.z - hero.z, dh = Math.hypot(hx0, hz0) || 1;
        if (dh < R * 0.8) {
          const ox = hx0 / dh, oz = hz0 / dh;
          dx = ox * 0.6 - oz * m.dir * 0.8;
          dz = oz * 0.6 + ox * m.dir * 0.8;
        }
      } else {
        dx = hero.x - m.x; dz = hero.z - m.z; sp *= M.diveSpeedMul;
      }
      const d = Math.hypot(dx, dz) || 1;
      const kk = 1 - Math.exp(-dt / Math.max(0.01, M.turnTime)); // инерция: дуга, а не ломаная
      m.vx += ((dx / d) * sp - m.vx) * kk;
      m.vz += ((dz / d) * sp - m.vz) * kk;
      m.x += m.vx * dt; m.z += m.vz * dt;
      const hx = m.x - hero.x, hz = m.z - hero.z, reach = hero.radius + M.radius;
      if (hx * hx + hz * hz <= reach * reach) { onHit(M.damage); this.kill(m, 'hit'); }
    }
  }
}
