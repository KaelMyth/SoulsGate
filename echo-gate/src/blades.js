// Посох клинков: призывает спектральный клинок. Он парит вокруг героя по кругу, а когда враг оказывается в досягаемости,
// срывается в рывок, рассекает всё на пути (каждого врага один раз за рывок), пролетает чуть дальше цели и возвращается на орбиту.
// Клинок плоский, всегда лицом к камере и остриём по направлению полёта, призрачный: полупрозрачный с холодным свечением и шлейфом.
//
// Ступени посоха (+0..4, +5..9, +10), CONFIG.blades.tiers:
//   0) летающий кинжал: орбита вокруг героя и рывки на врагов в досягаемости;
//   1) за спиной мага вращаются 4 меча, в радиусе атаки из порталов вылетают мечи, пронзают 2-3 врагов и испаряются;
//   2) за спиной один большой меч и 8 вращающихся вокруг него, порталы чаще, а раз в giantEvery секунд на скопление врагов с неба падает двуручник и испаряется.
import * as THREE from 'three';
import { faceCamBasis } from './laser.js';

const CAM_BACK = new THREE.Vector3(1, 1, 1).normalize();
const RIGHT = new THREE.Vector3(1, 0, -1).normalize();                    // вправо по экрану
const SCREEN_UP = new THREE.Vector3().crossVectors(CAM_BACK, RIGHT).normalize(); // вверх по экрану (в плоскости, перпендикулярной взгляду)

/** len: длина лезвия (1 = меч, 0.55 = кинжал); depth: рисоваться с проверкой глубины (чтобы маг закрывал мечи за спиной). */
function sword(color, edge, { len = 1, depth = false } = {}) {
  const mat = (c, o, add) => { const m = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, side: THREE.DoubleSide, depthWrite: false, depthTest: depth,
    blending: add ? THREE.AdditiveBlending : THREE.NormalBlending }); m.userData.o = o; return m; };
  const poly = (pts) => new THREE.ShapeGeometry(new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], p[1] > 0 ? p[1] * len : p[1]))));
  const g = new THREE.Group();
  const halo = new THREE.Mesh(poly([[-0.2, -0.28], [-0.22, 0.65], [0, 1.08], [0.22, 0.65], [0.2, -0.28]]), mat(edge, 0.28, true)); // свечение
  const blade = new THREE.Mesh(poly([[-0.08, -0.15], [-0.11, 0.62], [0, 0.95], [0.11, 0.62], [0.08, -0.15]]), mat(color, 0.9, false));
  const fuller = new THREE.Mesh(poly([[-0.018, -0.1], [-0.018, 0.6], [0.018, 0.6], [0.018, -0.1]]), mat(0xffffff, 0.95, true));
  const guard = new THREE.Mesh(poly([[-0.27, -0.2], [-0.27, -0.13], [0, -0.09], [0.27, -0.13], [0.27, -0.2], [0, -0.17]]), mat(edge, 0.95, false));
  const hilt = new THREE.Mesh(poly([[-0.045, -0.2], [-0.045, -0.52], [0.045, -0.52], [0.045, -0.2]]), mat(edge, 0.9, false));
  const pommel = new THREE.Mesh(poly([[0, -0.6], [-0.08, -0.54], [0, -0.48], [0.08, -0.54]]), mat(color, 0.95, false));
  for (const m of [halo, blade, fuller, guard, hilt, pommel]) { m.renderOrder = depth ? 5 : 7; g.add(m); }
  g.matrixAutoUpdate = false;
  g.visible = false;
  return g;
}

/** Прозрачность всего меча (множитель к базовой). */
function fade(g, a) { for (const m of g.children) m.material.opacity = m.material.userData.o * a; }

/** Кольцо портала и печати: двойной обод и засечки. */
function ringTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.translate(64, 64); g.strokeStyle = '#fff'; g.lineCap = 'round';
  g.lineWidth = 5; g.beginPath(); g.arc(0, 0, 54, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 44, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 3;
  for (let i = 0; i < 12; i++) { g.save(); g.rotate((i / 12) * Math.PI * 2); g.beginPath(); g.moveTo(0, -54); g.lineTo(0, -62); g.stroke(); g.restore(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const rr = (a, b) => a + Math.random() * (b - a);

const tX = new THREE.Vector3(), tY = new THREE.Vector3(), tZ = new THREE.Vector3();
/** Поставить меч: острие вдоль (dx,dy,dz), плоскость лицом к камере, масштаб s, позиция рукояти. */
function place(g, dx, dy, dz, s, x, y, z, wide = 1) {
  tY.set(dx, dy, dz).normalize();
  tX.crossVectors(tY, CAM_BACK).normalize();
  tZ.crossVectors(tX, tY);
  g.matrix.makeBasis(tX.multiplyScalar(s * wide), tY.multiplyScalar(s), tZ.multiplyScalar(s)).setPosition(x, y, z);
  g.matrixWorldNeedsUpdate = true;
  g.visible = true;
}

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
      const g = sword(cfg.color, cfg.edgeColor, { len: cfg.daggerLen });
      scene.add(g);
      const gl = this.glow.clone();
      gl.material = this.glow.material.clone();
      gl.renderOrder = 6;
      scene.add(gl);
      this.blades.push({ g, gl, mode: 'orbit', ang: (i / cfg.count) * 6.283, x: 0, y: 1, z: 0, dx: 0, dz: 1, spd: 0, cool: 0.3, target: null, hit: new Set(), travelled: 0, trailT: 0, over: 0, ox: 0, oz: 0 });
    }
    this.summoned = false;
    // за спиной: большой меч и до 8 вращающихся; вылетающие мечи, порталы и двуручник
    const add = (g) => { scene.add(g); return g; };
    this.big = add(sword(cfg.color, cfg.edgeColor, { depth: true }));
    this.ring = [];
    for (let i = 0; i < 8; i++) this.ring.push(add(sword(cfg.color, cfg.edgeColor, { depth: true })));
    this.fliers = [];
    for (let i = 0; i < 8; i++) this.fliers.push({ g: add(sword(cfg.color, cfg.edgeColor)), on: false, x: 0, y: 1, z: 0, dx: 0, dz: 1, hit: new Set(), n: 0, lim: 2, dist: 0, vap: 0 });
    const ringTex = ringTexture();
    const pmat = () => new THREE.MeshBasicMaterial({ map: ringTex, color: cfg.glowColor, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, side: THREE.DoubleSide });
    this.portals = [];
    for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), pmat()); m.visible = false; m.renderOrder = 6; scene.add(m); this.portals.push({ m, on: false, t: 0, x: 0, z: 0, dx: 0, dz: 1, fired: false, glow: this.glow.clone() }); }
    for (const p of this.portals) { p.glow.material = this.glow.material.clone(); p.glow.renderOrder = 6; scene.add(p.glow); }
    this.mark = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), pmat()); // печать на земле, куда упадёт двуручник
    this.mark.rotation.x = -Math.PI / 2; this.mark.visible = false; this.mark.renderOrder = 4; scene.add(this.mark);
    this.giant = { g: add(sword(cfg.color, cfg.edgeColor)), state: 'idle', t: 0, x: 0, z: 0, R: 3 };
    this.giantGlow = this.glow.clone(); this.giantGlow.material = this.glow.material.clone(); this.giantGlow.renderOrder = 6; this.giantGlow.visible = false; scene.add(this.giantGlow);
    this.ringA = 0; this.portalT = 0.6; this.giantT = 1.5; this.lastTier = -1; this.alpha = 0;
  }

  /** Убрать клинок мгновенно (конец забега). */
  hideNow() {
    this.k = 0; this.summoned = false;
    for (const b of this.blades) { b.g.visible = b.gl.visible = false; b.mode = 'orbit'; b.target = null; }
    this.hideExtras();
  }

  hideExtras() {
    this.big.visible = false;
    for (const g of this.ring) g.visible = false;
    for (const f of this.fliers) { f.on = false; f.g.visible = false; }
    for (const p of this.portals) { p.on = false; p.m.visible = false; p.glow.visible = false; }
    this.mark.visible = false; this.giant.g.visible = false; this.giantGlow.visible = false; this.giant.state = 'idle';
    this.lastTier = -1;
  }

  /** Ступень посоха по заточке (0 кинжал, 1 порталы, 2 двуручник). */
  tier() { const n = this.cfg.tiers.length - 1; return Math.min(n, this.attack.tierIndex ? this.attack.tierIndex() : 0); }

  /** Лежит ли призыв (для тестов/отладки). */
  get visible() { return this.k > 0.01; }

  update(dt, hx, hz, active) {
    const c = this.cfg, A = this.attack;
    this.k = active ? Math.min(1, this.k + dt / c.summonTime) : Math.max(0, this.k - dt / (c.summonTime * 0.6));
    if (this.k <= 0.001) {
      for (const b of this.blades) { b.g.visible = b.gl.visible = false; b.mode = 'orbit'; b.target = null; }
      this.summoned = false;
      this.hideExtras();
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
    const tier = this.tier(), T = c.tiers[tier];
    if (tier !== this.lastTier) { // смена ступени: чистим лишнее, у кинжала сброс на орбиту
      if (this.lastTier >= 0) A.shock(hx, hz, 3.4, 0.5, c.edgeColor);
      this.lastTier = tier;
      this.hideExtras(); this.lastTier = tier;
      for (const b of this.blades) { b.mode = 'orbit'; b.target = null; b.cool = 0.3; }
      this.portalT = 0.5; this.giantT = 1.5;
    }
    if (T.dagger) {
      this.blades.forEach((b, bi) => {
        b.cool -= dt;
        const tgt = this.step(b, bi, dt, hx, hz, dmg, pause);
        this.draw(b, dt, tgt);
      });
    } else {
      for (const b of this.blades) { b.g.visible = b.gl.visible = false; }
      this.updateRing(dt, hx, hz, T);
      this.updatePortals(dt, hx, hz, T);
    }
    this.updateFliers(dt, T);
    if (T.giantEvery) this.updateGiant(dt, hx, hz, T);
  }

  /** Мечи за спиной мага: вращаются кольцом в плоскости экрана; на +10 в центре большой меч. */
  updateRing(dt, hx, hz, T) {
    const c = this.cfg, n = T.ring, big = !!T.big;
    this.ringA += c.ringSpeed * dt * (big ? 0.8 : 1);
    const R = c.ringRadius * (big ? 1.6 : 1), cy = R + 0.35, k = this.k;
    const bx = hx - CAM_BACK.x * 0.9, bz = hz - CAM_BACK.z * 0.9; // чуть дальше от камеры, чем маг
    const s = (big ? 0.62 : 0.8) * c.size * (0.2 + 0.8 * k);
    for (let i = 0; i < this.ring.length; i++) {
      const g = this.ring[i];
      if (i >= n) { g.visible = false; continue; }
      const a = this.ringA + (i / n) * Math.PI * 2;
      const rx = RIGHT.x * Math.cos(a) + SCREEN_UP.x * Math.sin(a), ry = SCREEN_UP.y * Math.sin(a), rz = RIGHT.z * Math.cos(a) + SCREEN_UP.z * Math.sin(a);
      place(g, rx, ry, rz, s, bx + rx * R, cy + ry * R, bz + rz * R);
      fade(g, k);
    }
    if (big) {
      place(this.big, 0, 1, 0, 1.7 * c.size * (0.2 + 0.8 * k), bx, cy - 0.7, bz);
      fade(this.big, k);
    } else this.big.visible = false;
  }

  /** Порталы в радиусе атаки: открылся перед магом, выпустил меч в сторону врага, закрылся. */
  updatePortals(dt, hx, hz, T) {
    const c = this.cfg, A = this.attack;
    this.portalT -= dt;
    if (this.portalT <= 0) {
      const R = A.cur().range, alive = A.spawner.alive.filter((e) => (e.state.x - hx) ** 2 + (e.state.z - hz) ** 2 < R * R);
      const free = this.portals.find((p) => !p.on);
      if (alive.length && free) {
        const e = alive[Math.floor(Math.random() * alive.length)];
        const a = Math.atan2(e.state.z - hz, e.state.x - hx) + rr(-0.12, 0.12);
        free.on = true; free.t = 0; free.fired = false; free.dx = Math.cos(a); free.dz = Math.sin(a);
        free.x = hx + free.dx * c.portalDist; free.z = hz + free.dz * c.portalDist;
        A.hero.cast(Math.atan2(free.dx, free.dz));
        this.portalT = Math.max(0.08, A.cur().interval * T.portalMul);
      } else this.portalT = 0.08;
    }
    for (const p of this.portals) {
      if (!p.on) continue;
      p.t += dt;
      const L = c.portalLife, open = Math.min(1, p.t / 0.18), close = p.t > L - 0.15 ? Math.max(0, (L - p.t) / 0.15) : 1;
      const k = open * close * this.k;
      if (!p.fired && p.t >= 0.2) {
        p.fired = true;
        this.launch(p.x, p.z, p.dx, p.dz, T);
        const A2 = this.attack;
        A2.shock(p.x, p.z, 1.6, 0.3, c.edgeColor);
        for (let i = 0; i < A2.n(12); i++) A2.parts.emit({ x: p.x, y: 1, z: p.z, vx: p.dx * rr(2, 6) + rr(-1.5, 1.5), vy: rr(-1, 1.5), vz: p.dz * rr(2, 6) + rr(-1.5, 1.5), life: rr(0.25, 0.5), size0: rr(0.12, 0.22), size1: 0, c0: 0xffffff, c1: 0x6fb4ff, drag: 3, grav: 0 });
      }
      if (p.t >= L) { p.on = false; p.m.visible = false; p.glow.visible = false; continue; }
      const sz = c.portalSize * (0.25 + 0.75 * open) * (1 + 0.05 * Math.sin(p.t * 30));
      p.m.visible = true;
      p.m.position.set(p.x, 1.0, p.z);
      p.m.lookAt(p.x + p.dx, 1.0, p.z + p.dz); // кольцо смотрит вдоль полёта
      p.m.rotateZ(p.t * 3);
      p.m.scale.set(sz, sz, 1);
      p.m.material.opacity = 0.95 * k;
      p.glow.visible = true; p.glow.position.set(p.x, 1.0, p.z); p.glow.scale.setScalar(sz * 1.6); p.glow.material.opacity = 0.55 * k;
    }
  }

  /** Выпустить меч из точки по направлению (dx,dz). */
  launch(x, z, dx, dz, T) {
    const f = this.fliers.find((o) => !o.on);
    if (!f) return;
    f.on = true; f.x = x; f.z = z; f.y = 1.0; f.dx = dx; f.dz = dz; f.hit.clear(); f.n = 0; f.dist = 0; f.vap = 0;
    f.lim = T.pierce[0] + Math.floor(Math.random() * (T.pierce[1] - T.pierce[0] + 1));
    fade(f.g, 1);
  }

  updateFliers(dt, T) {
    const c = this.cfg, A = this.attack;
    const dmg = A.cur().damage * (T.swordMul || 1);
    for (const f of this.fliers) {
      if (!f.on) continue;
      if (f.vap > 0) { // испарение: тает и рассыпается искрами
        f.vap -= dt;
        fade(f.g, Math.max(0, f.vap / 0.25));
        if (f.vap <= 0) { f.on = false; f.g.visible = false; }
        else place(f.g, f.dx, 0, f.dz, c.size * 1.1, f.x, f.y, f.z);
        continue;
      }
      const total = c.swordSpeed * dt, subs = Math.max(1, Math.ceil(total / 0.3));
      for (let s = 0; s < subs && !f.vap; s++) {
        const k = total / subs;
        f.x += f.dx * k; f.z += f.dz * k; f.dist += k;
        for (const e of [...A.spawner.alive]) {
          if (f.hit.has(e) || f.vap) continue;
          const ex = e.state.x - f.x, ez = e.state.z - f.z, r = c.reach + e.radius;
          if (ex * ex + ez * ez > r * r) continue;
          f.hit.add(e); f.n++;
          A.strike(e, dmg, f.dx, f.dz, 'blades');
          this.slashFx(e.state.x, e.state.z, { dx: f.dx, dz: f.dz });
          if (f.n >= f.lim) this.vaporize(f);
        }
        const mid = A.midges && A.midges.hitTest(f.x, f.z, c.reach);
        if (mid) { A.midges.kill(mid, 'shot'); this.slashFx(mid.x, mid.z, { dx: f.dx, dz: f.dz }); }
        if (f.dist > A.cur().range + 4) this.vaporize(f);
      }
      place(f.g, f.dx, 0, f.dz, c.size * 1.1, f.x, f.y, f.z);
      for (let i = 0; i < 2; i++) A.parts.emit({ x: f.x - f.dx * 0.6 + rr(-0.05, 0.05), y: f.y + rr(-0.1, 0.1), z: f.z - f.dz * 0.6 + rr(-0.05, 0.05), vx: rr(-0.3, 0.3), vy: rr(-0.1, 0.4), vz: rr(-0.3, 0.3), life: rr(0.2, 0.4), size0: rr(0.14, 0.26), size1: 0, c0: 0xe8f6ff, c1: 0x5a8fe0, drag: 3, grav: 0, alpha: 0.8 });
    }
  }

  vaporize(f) {
    const A = this.attack;
    f.vap = 0.25;
    for (let i = 0; i < A.n(16); i++) A.parts.emit({ x: f.x, y: f.y, z: f.z, vx: rr(-2.5, 2.5) + f.dx * 2, vy: rr(0.5, 3), vz: rr(-2.5, 2.5) + f.dz * 2, life: rr(0.3, 0.6), size0: rr(0.14, 0.28), size1: 0, c0: 0xffffff, c1: 0x6fb4ff, drag: 2.5, grav: -1 });
  }

  /** Двуручник: раз в giantEvery секунд метит скопление врагов, падает с неба, бьёт по площади и испаряется. */
  updateGiant(dt, hx, hz, T) {
    const c = this.cfg, A = this.attack, G = this.giant;
    const S = 4.6 * c.size / 1.25; // размер двуручника
    if (G.state === 'idle') {
      this.giantT -= dt;
      if (this.giantT > 0) return;
      const R = A.cur().range + 2, pool = A.spawner.alive.filter((e) => (e.state.x - hx) ** 2 + (e.state.z - hz) ** 2 < R * R);
      if (!pool.length) return;
      let best = null, bn = -1;
      for (const e of pool) {
        let n = 0, sx = 0, sz = 0;
        for (const o of pool) if ((o.state.x - e.state.x) ** 2 + (o.state.z - e.state.z) ** 2 < T.giantRadius ** 2) { n++; sx += o.state.x; sz += o.state.z; }
        if (n > bn) { bn = n; best = { x: sx / n, z: sz / n }; }
      }
      G.state = 'warn'; G.t = 0; G.x = best.x; G.z = best.z; G.R = T.giantRadius;
    }
    G.t += dt;
    const k = this.k;
    if (G.state === 'warn') { // печать на земле растёт и мерцает
      const u = Math.min(1, G.t / 0.7);
      this.mark.visible = true; this.mark.position.set(G.x, 0.06, G.z);
      this.mark.scale.set(G.R * 2 * (0.6 + 0.4 * u), G.R * 2 * (0.6 + 0.4 * u), 1);
      this.mark.rotation.z = G.t * 1.5;
      this.mark.material.opacity = (0.35 + 0.4 * u + 0.15 * Math.sin(G.t * 25)) * k;
      if (G.t >= 0.7) { G.state = 'fall'; G.t = 0; }
    } else if (G.state === 'fall') {
      const u = Math.min(1, G.t / 0.34), tip = 0.95 * S;
      const y = tip + (1 - u * u) * 16; // origin: остриё вниз, остриё у земли при u=1
      place(G.g, 0, -1, 0, S, G.x, y, G.z, 2);
      fade(G.g, 1);
      this.giantGlow.visible = true; this.giantGlow.position.set(G.x, y - tip * 0.4, G.z); this.giantGlow.scale.setScalar(S * 1.1); this.giantGlow.material.opacity = 0.3;
      for (let i = 0; i < A.n(3); i++) A.parts.emit({ x: G.x + rr(-0.5, 0.5), y: y - tip * rr(0, 1), z: G.z + rr(-0.5, 0.5), vx: rr(-0.4, 0.4), vy: rr(0.5, 2), vz: rr(-0.4, 0.4), life: rr(0.25, 0.5), size0: rr(0.2, 0.4), size1: 0, c0: 0xffffff, c1: 0x6fb4ff, drag: 2, grav: 0, alpha: 0.8 });
      if (u >= 1) this.giantImpact(T);
    } else if (G.state === 'stuck') { // воткнут в землю, мерцает и испаряется
      const u = Math.min(1, G.t / 0.5), tip = 0.95 * S;
      place(G.g, 0, -1, 0, S, G.x, tip - 0.35, G.z, 2);
      fade(G.g, 1 - u);
      this.giantGlow.position.set(G.x, tip * 0.6, G.z); this.giantGlow.material.opacity = 0.3 * (1 - u);
      this.mark.material.opacity = 0.6 * (1 - u) * k;
      for (let i = 0; i < A.n(2); i++) A.parts.emit({ x: G.x + rr(-0.5, 0.5), y: rr(0.2, tip * 1.8), z: G.z + rr(-0.5, 0.5), vx: rr(-0.5, 0.5), vy: rr(1, 3), vz: rr(-0.5, 0.5), life: rr(0.3, 0.7), size0: rr(0.2, 0.4), size1: 0, c0: 0xffffff, c1: 0x6fb4ff, drag: 2, grav: -1.5, alpha: 0.9 });
      if (u >= 1) { G.state = 'idle'; G.g.visible = false; this.giantGlow.visible = false; this.mark.visible = false; this.giantT = T.giantEvery; }
    }
  }

  giantImpact(T) {
    const c = this.cfg, A = this.attack, G = this.giant;
    G.state = 'stuck'; G.t = 0;
    const dmg = A.cur().damage * T.giantMul;
    for (const e of [...A.spawner.alive]) {
      const dx = e.state.x - G.x, dz = e.state.z - G.z, r = G.R + e.radius;
      if (dx * dx + dz * dz > r * r) continue;
      const d = Math.hypot(dx, dz) || 1;
      A.strike(e, dmg, dx / d, dz / d, 'blades');
    }
    const mid = A.midges;
    if (mid && mid.hitTest) for (let i = 0; i < 12; i++) { const m = mid.hitTest(G.x, G.z, G.R); if (!m) break; mid.kill(m, 'shot'); }
    A.shock(G.x, G.z, G.R * 2.2, 0.5, c.edgeColor);
    A.shock(G.x, G.z, G.R * 1.3, 0.35, 0xffffff);
    A.burst(G.x, 0.6, G.z, 3, 0.5, 'blades');
    for (let i = 0; i < A.n(46); i++) {
      const a = rr(0, 6.283), sp = rr(3, 9);
      A.parts.emit({ x: G.x, y: 0.3, z: G.z, vx: Math.cos(a) * sp, vy: rr(1, 5), vz: Math.sin(a) * sp, life: rr(0.4, 0.9), size0: rr(0.2, 0.4), size1: 0, c0: 0xffffff, c1: 0x6fb4ff, drag: 2.5, grav: 4 });
    }
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
