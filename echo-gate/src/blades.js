// Посох клинков: призывает спектральный клинок. Он парит вокруг героя по кругу, а когда враг оказывается в досягаемости,
// срывается в рывок, рассекает всё на пути (каждого врага один раз за рывок), пролетает чуть дальше цели и возвращается на орбиту.
// Клинок плоский, всегда лицом к камере и остриём по направлению полёта, призрачный: полупрозрачный с холодным свечением и шлейфом.
import * as THREE from 'three';
import { faceCamBasis } from './laser.js';

function sword(color, edge) {
  const mat = (c, o, add) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, side: THREE.DoubleSide, depthWrite: false, depthTest: false,
    blending: add ? THREE.AdditiveBlending : THREE.NormalBlending });
  const poly = (pts) => new THREE.ShapeGeometry(new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], p[1]))));
  const g = new THREE.Group();
  const halo = new THREE.Mesh(poly([[-0.2, -0.28], [-0.22, 0.65], [0, 1.08], [0.22, 0.65], [0.2, -0.28]]), mat(edge, 0.28, true)); // свечение
  const blade = new THREE.Mesh(poly([[-0.08, -0.15], [-0.11, 0.62], [0, 0.95], [0.11, 0.62], [0.08, -0.15]]), mat(color, 0.9, false));
  const fuller = new THREE.Mesh(poly([[-0.018, -0.1], [-0.018, 0.6], [0.018, 0.6], [0.018, -0.1]]), mat(0xffffff, 0.95, true));
  const guard = new THREE.Mesh(poly([[-0.27, -0.2], [-0.27, -0.13], [0, -0.09], [0.27, -0.13], [0.27, -0.2], [0, -0.17]]), mat(edge, 0.95, false));
  const hilt = new THREE.Mesh(poly([[-0.045, -0.2], [-0.045, -0.52], [0.045, -0.52], [0.045, -0.2]]), mat(edge, 0.9, false));
  const pommel = new THREE.Mesh(poly([[0, -0.6], [-0.08, -0.54], [0, -0.48], [0.08, -0.54]]), mat(color, 0.95, false));
  for (const m of [halo, blade, fuller, guard, hilt, pommel]) { m.renderOrder = 7; g.add(m); }
  g.matrixAutoUpdate = false;
  g.visible = false;
  return g;
}

const rr = (a, b) => a + Math.random() * (b - a);

export class Blades {
  /** cfg: CONFIG.blades; attack: Attack (урон, цели, эффекты). */
  constructor(scene, cfg, attack) {
    this.scene = scene;
    this.cfg = cfg;
    this.attack = attack;
    this.k = 0;            // 0..1: призыв (появление/растворение)
    this.blades = [];
    this.m = new THREE.Matrix4();
    this.v = new THREE.Vector3();
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: attack.glow, color: cfg.glowColor, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
    this.glow.visible = false;
    for (let i = 0; i < cfg.count; i++) {
      const g = sword(cfg.color, cfg.edgeColor);
      scene.add(g);
      const gl = this.glow.clone();
      gl.material = this.glow.material.clone();
      gl.renderOrder = 6;
      scene.add(gl);
      this.blades.push({ g, gl, mode: 'orbit', ang: (i / cfg.count) * 6.283, x: 0, y: 1, z: 0, dx: 0, dz: 1, spd: 0, cool: 0.3, target: null, hit: new Set(), travelled: 0, trailT: 0, over: 0, ox: 0, oz: 0 });
    }
    this.summoned = false;
  }

  /** Убрать клинок мгновенно (конец забега). */
  hideNow() {
    this.k = 0; this.summoned = false;
    for (const b of this.blades) { b.g.visible = b.gl.visible = false; b.mode = 'orbit'; b.target = null; }
  }

  /** Лежит ли призыв (для тестов/отладки). */
  get visible() { return this.k > 0.01; }

  update(dt, hx, hz, active) {
    const c = this.cfg, A = this.attack;
    this.k = active ? Math.min(1, this.k + dt / c.summonTime) : Math.max(0, this.k - dt / (c.summonTime * 0.6));
    if (this.k <= 0.001) {
      for (const b of this.blades) { b.g.visible = b.gl.visible = false; b.mode = 'orbit'; b.target = null; }
      this.summoned = false;
      return;
    }
    if (!this.summoned) { // новый призыв: клинок появляется у героя со вспышкой и кольцом
      this.summoned = true;
      for (const b of this.blades) { b.x = hx; b.z = hz; b.y = 0.6; b.mode = 'orbit'; b.cool = 0.4; b.spd = 0; b.ox = hx; b.oz = hz; }
      A.shock(hx, hz, 3.2, 0.5, c.edgeColor);
      A.burst(hx, 0.9, hz, 1.6, 0.4, 'blades');
    }
    const dmg = A.cur().damage * c.damageMul;
    const pause = A.cur().interval * c.pauseMul;
    this.blades.forEach((b, bi) => {
      b.cool -= dt;
      const tgt = this.step(b, bi, dt, hx, hz, dmg, pause);
      this.draw(b, dt, tgt);
    });
  }

  /** Один шаг клинка. Возвращает вектор направления острия (в b.dx,b.dz). */
  step(b, bi, dt, hx, hz, dmg, pause) {
    const c = this.cfg, A = this.attack;
    if (b.mode === 'orbit') {
      b.ang += c.orbitSpeed * dt;
      const tx = hx + Math.cos(b.ang) * c.orbitRadius, tz = hz + Math.sin(b.ang) * c.orbitRadius;
      const f = 1 - Math.exp(-dt * c.follow);
      const px = b.x, pz = b.z;
      b.x += (tx - b.x) * f; b.z += (tz - b.z) * f;
      b.y += (c.height + Math.sin(performance.now() / 1000 * 2.4 + bi) * 0.12 - b.y) * f;
      const vx = (b.x - px) / Math.max(dt, 1e-4), vz = (b.z - pz) / Math.max(dt, 1e-4);
      b.spd = Math.hypot(vx, vz);
      // острие по касательной орбиты (против вращения героя не нужно): направление движения по кругу
      const tdx = -Math.sin(b.ang), tdz = Math.cos(b.ang);
      b.dx += (tdx - b.dx) * Math.min(1, dt * 10); b.dz += (tdz - b.dz) * Math.min(1, dt * 10);
      if (b.cool <= 0) {
        const taken = new Set(this.blades.filter((o) => o !== b && o.target).map((o) => o.target));
        let best = null, bd = A.cur().range * A.cur().range;
        for (const e of A.spawner.alive) {
          if (taken.has(e)) continue;
          const dx = e.state.x - hx, dz = e.state.z - hz, d = dx * dx + dz * dz;
          if (d < bd) { bd = d; best = e; }
        }
        if (best) {
          b.mode = 'lunge'; b.target = best; b.hit.clear(); b.travelled = 0; b.over = 0; b.spd = c.lungeSpeed * 0.35;
          b.lockX = 0; b.lockZ = 0; b.locked = false;
          A.hero.cast(Math.atan2(best.state.x - hx, best.state.z - hz));
          A.burst(b.x, b.y, b.z, 0.9, 0.2, 'blades'); // вспышка в начале рывка
        } else b.cool = 0.1;
      }
    } else if (b.mode === 'lunge') {
      if (b.target && !A.spawner.alive.includes(b.target)) b.target = null; // цель убита: допролетаем по инерции
      let dx = b.dx, dz = b.dz;
      if (b.target && !b.locked) {
        const ex = b.target.state.x - b.x, ez = b.target.state.z - b.z, d = Math.hypot(ex, ez) || 1;
        dx = ex / d; dz = ez / d;
        if (d < 1.0) { b.locked = true; b.over = c.overshoot; } // рядом с целью: направление фиксируем, пролетаем насквозь
      } else if (!b.locked) { b.locked = true; b.over = c.overshoot * 0.5; }
      const turn = Math.min(1, dt * 18);
      b.dx += (dx - b.dx) * turn; b.dz += (dz - b.dz) * turn;
      const L = Math.hypot(b.dx, b.dz) || 1; b.dx /= L; b.dz /= L;
      b.spd = Math.min(c.lungeSpeed, b.spd + c.lungeSpeed * 6 * dt);
      const total = b.spd * dt, subs = Math.max(1, Math.ceil(total / 0.3));
      const y1 = 0.55;
      for (let s = 0; s < subs; s++) {
        const k = total / subs;
        b.x += b.dx * k; b.z += b.dz * k; b.y += (y1 - b.y) * Math.min(1, dt * 8 / subs);
        b.travelled += k;
        if (b.locked) b.over -= k;
        this.slash(b, dmg);
      }
      if ((b.locked && b.over <= 0) || b.travelled > A.cur().range * 2 + 4) { b.mode = 'return'; b.target = null; }
    } else { // return
      const tx = hx + Math.cos(b.ang) * c.orbitRadius, tz = hz + Math.sin(b.ang) * c.orbitRadius;
      b.ang += c.orbitSpeed * dt;
      const ex = tx - b.x, ez = tz - b.z, d = Math.hypot(ex, ez);
      b.spd = Math.min(c.returnSpeed, b.spd + c.returnSpeed * 5 * dt);
      const step = Math.min(d, b.spd * dt);
      if (d > 1e-4) { b.dx += (ex / d - b.dx) * Math.min(1, dt * 14); b.dz += (ez / d - b.dz) * Math.min(1, dt * 14); const L = Math.hypot(b.dx, b.dz) || 1; b.dx /= L; b.dz /= L; b.x += ex / d * step; b.z += ez / d * step; }
      b.y += (c.height - b.y) * Math.min(1, dt * 6);
      if (d < 0.5) { b.mode = 'orbit'; b.cool = pause; }
    }
  }

  /** Рассечь всех врагов (и мошек) у клинка, каждого один раз за рывок. */
  slash(b, dmg) {
    const A = this.attack, c = this.cfg;
    for (const e of [...A.spawner.alive]) {
      if (b.hit.has(e)) continue;
      const dx = e.state.x - b.x, dz = e.state.z - b.z, r = c.reach + e.radius;
      if (dx * dx + dz * dz > r * r) continue;
      b.hit.add(e);
      A.strike(e, dmg, b.dx, b.dz, 'blades');
      this.slashFx(e.state.x, e.state.z, b);
    }
    const mid = A.midges && A.midges.hitTest(b.x, b.z, c.reach);
    if (mid) { A.midges.kill(mid, 'shot'); this.slashFx(mid.x, mid.z, b); }
  }

  /** Росчерк на месте удара: дуга искр поперёк направления клинка. */
  slashFx(x, z, b) {
    const A = this.attack;
    const px = -b.dz, pz = b.dx;
    for (let i = 0; i < A.n(14); i++) {
      const t = rr(-1, 1);
      A.parts.emit({ x: x + px * t * 0.7, y: 0.5 + Math.abs(t) * 0.1, z: z + pz * t * 0.7, vx: px * t * 3 + b.dx * rr(1, 4), vy: rr(0.2, 1.6), vz: pz * t * 3 + b.dz * rr(1, 4),
        life: rr(0.22, 0.45), size0: rr(0.12, 0.24), size1: 0, c0: 0xffffff, c1: 0x6fb4ff, drag: 3, grav: 3 });
    }
  }

  draw(b, dt, _t) {
    const c = this.cfg, A = this.attack;
    const s = c.size * (0.2 + 0.8 * this.k);
    this.v.set(b.dx, 0, b.dz);
    if (this.v.lengthSq() < 1e-6) this.v.set(0, 0, 1);
    // в рывке клинок чуть клонится в сторону движения (острие вниз к земле)
    this.v.y = b.mode === 'lunge' ? -0.25 : 0;
    faceCamBasis(this.m, this.v, s, s, b.x, b.y, b.z);
    // basis: x = острие (длина по x); у клинка длина по +Y, поэтому поворачиваем форму на -90° вокруг z
    b.g.matrix.copy(this.m).multiply(ROT_Y_TO_X);
    b.g.visible = true;
    b.gl.visible = true;
    b.gl.position.set(b.x, b.y, b.z);
    b.gl.scale.setScalar(s * (b.mode === 'lunge' ? 2.6 : 2.0) * (1 + 0.1 * Math.sin(performance.now() / 90)));
    b.gl.material.opacity = 0.5 * this.k * (b.mode === 'lunge' ? 1.2 : 0.8);
    // шлейф: бледные искры позади клинка
    b.trailT += dt;
    const every = b.mode === 'orbit' ? 0.05 : 0.012;
    while (b.trailT >= every) {
      b.trailT -= every;
      const bx = b.x - b.dx * 0.5, bz = b.z - b.dz * 0.5;
      A.parts.emit({ x: bx + rr(-0.06, 0.06), y: b.y + rr(-0.1, 0.1), z: bz + rr(-0.06, 0.06), vx: rr(-0.3, 0.3) - b.dx * 0.4, vy: rr(-0.1, 0.5), vz: rr(-0.3, 0.3) - b.dz * 0.4,
        life: rr(0.25, 0.5), size0: b.mode === 'orbit' ? rr(0.1, 0.16) : rr(0.18, 0.3), size1: 0, c0: 0xe8f6ff, c1: 0x5a8fe0, drag: 3, grav: 0, alpha: 0.8 * this.k });
    }
  }
}

// форма клинка нарисована вдоль +Y, а базис кладёт длину на +X: поворот вокруг Z на -90°
const ROT_Y_TO_X = new THREE.Matrix4().makeRotationZ(-Math.PI / 2);
