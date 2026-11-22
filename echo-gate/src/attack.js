// Автоатака мага: раз в attack.interval секунд выстрел синим светящимся шариком в ближайшего жука.
// Шарик это точка с эффектами: светлое ядро, синий ореол, хвост из затухающих следов, вспышка у кристалла посоха,
// искры и кольцо при попадании. Всё из спрайтов с аддитивным смешиванием (пол тёмный, на нём свечение видно;
// на белом полу оно бы пропало), без света и теней, объекты из пула.
// Числа в CONFIG.attack. Попадание отнимает hp у жука, убитый жук исчезает (Spawner.kill).
import * as THREE from 'three';
import { Particles } from './particles.js';
import { applyIce, applyFire, burnTick, applyShock, gravityFactor, auraSlow, holePull } from './status.js';
import { Lightning } from './lightning.js';
import { Laser } from './laser.js';
import { Blades } from './blades.js';
import { forceTier, tierOf } from './staff_tiers.js';
import { snowflakeTexture } from './staff_models.js';

const BLUE = 0x2f86ff;
const DEEP = 0x1f5bff;

/** Мягкое белое пятно (цвет задаёт спрайт): ореол, хвост. */
function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.4, 'rgba(255,255,255,0.55)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Синий шарик со светлым ядром: цвета зашиты в текстуру. */
function ballTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(240,250,255,1)');
  r.addColorStop(0.2, 'rgba(150,215,255,1)');
  r.addColorStop(0.45, 'rgba(45,125,255,0.9)');
  r.addColorStop(1, 'rgba(30,90,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function ringTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 14, 32, 32, 31);
  r.addColorStop(0, 'rgba(255,255,255,0)');
  r.addColorStop(0.7, 'rgba(255,255,255,0.9)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function sprite(map, color, opacity) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
  }));
  s.renderOrder = 5;
  s.visible = false;
  return s;
}

const TRAIL = 8;
const SHOCKS = 10;
const ICE = 0xa8e6ff;
// Палитры эффектов по стихии посоха (null = обычный синий).
const PAL = {
  basic: { flash: 'ball', flashC: 0xffffff, ring: BLUE, muz0: 0xeaf8ff, muz1: 0x3a8cff, sp0: 0xf4fdff, sp1: 0x2a6dff, spG: 11, spD: 2.6, spS: 0.04, mote0: 0x8fd0ff, mote1: 0x2447d8, moteG: -0.3, shock: BLUE },
  ice: { flash: 'glow', flashC: 0xdaf6ff, ring: ICE, muz0: 0xffffff, muz1: 0x7fd0ff, sp0: 0xf4fdff, sp1: 0x8fd8ff, spG: 14, spD: 1.8, spS: 0.1, mote0: 0xeafaff, mote1: 0x9fdcff, moteG: -0.3, shock: ICE },
  electric: { flash: 'glow', flashC: 0xfff6b0, ring: 0xffe45a, muz0: 0xffffff, muz1: 0xffd21a, sp0: 0xffffff, sp1: 0xffd21a, spG: 8, spD: 3, spS: 0.03, mote0: 0xfff2a0, mote1: 0x9fc8ff, moteG: 0, shock: 0xffe45a },
  gravity: { flash: 'glow', flashC: 0xd8dce6, ring: 0x9aa0b0, muz0: 0xffffff, muz1: 0x7d8494, sp0: 0xffffff, sp1: 0x7d8494, spG: 6, spD: 2.5, spS: 0.05, mote0: 0xcfd3dc, mote1: 0x4a4f5c, moteG: -0.4, shock: 0x9aa0b0 },
  fire: { flash: 'glow', flashC: 0xffc060, ring: 0xff7a1a, muz0: 0xfff0b0, muz1: 0xff5a10, sp0: 0xffe9a0, sp1: 0xff3a10, spG: 6, spD: 2.2, spS: 0.06, mote0: 0xffa040, mote1: 0x802010, moteG: -1.6, shock: 0xff7a1a },
};
PAL.laser = { flash: 'glow', flashC: 0xffffff, ring: 0xdde8ff, muz0: 0xffffff, muz1: 0xb8c8ff, sp0: 0xffffff, sp1: 0xb8c8ff, spG: 4, spD: 3, spS: 0.03, mote0: 0xffffff, mote1: 0xaebcff, moteG: 0, shock: 0xdde8ff };
PAL.blades = { flash: 'glow', flashC: 0xdff4ff, ring: 0x8fc8ff, muz0: 0xffffff, muz1: 0x6fb4ff, sp0: 0xffffff, sp1: 0x6fb4ff, spG: 5, spD: 2.6, spS: 0.05, mote0: 0xe8f6ff, mote1: 0x4a78c8, moteG: -0.3, shock: 0x8fc8ff };
const pal = (el) => PAL[el] || PAL.basic;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

/** Ледяной снаряд, три вида по ступени посоха (острие вперёд, +Y): setTier(0) маленький осколок, 1 осколок покрупнее с боковыми гранями,
 * 2 остроконечная комета: длинное копьё, шипы, ледяной хвост и снежинки. tick(t): анимация снежинок. */
export function makeSpike() {
  const g = new THREE.Group();
  const add = (parent, geo, color, o = {}) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, ...o })); parent.add(m); return m; };
  const glowO = { transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false };
  const cone = (r, h, n = 6) => new THREE.ConeGeometry(r, h, n);
  // 0: маленький осколок: тонкий ромб
  const t0 = new THREE.Group();
  add(t0, cone(0.07, 0.5, 4), 0xe6f8ff).position.y = 0.12;
  add(t0, cone(0.07, 0.16, 4), 0x7fcfff).rotation.x = Math.PI;
  t0.children[1].position.y = -0.21;
  add(t0, cone(0.11, 0.6, 4), 0x8fdcff, glowO).position.y = 0.08;
  // 1: осколок побольше: шестигранный, с двумя боковыми гранями-плавниками
  const t1 = new THREE.Group();
  add(t1, cone(0.12, 0.85, 6), 0xe6f8ff).position.y = 0.15;
  add(t1, cone(0.12, 0.3, 6), 0x7fcfff).rotation.x = Math.PI;
  t1.children[1].position.y = -0.4;
  for (const sx of [-1, 1]) {
    const f = add(t1, cone(0.05, 0.4, 4), 0xbfeaff);
    f.position.set(sx * 0.12, -0.12, 0); f.rotation.z = -sx * 0.55;
  }
  add(t1, cone(0.2, 1.0, 6), 0x8fdcff, glowO).position.y = 0.05;
  // 2: комета: длинное копьё с шипами, холодный хвост и снежинки
  const t2 = new THREE.Group();
  add(t2, cone(0.13, 1.3, 8), 0xffffff).position.y = 0.3;
  add(t2, cone(0.2, 0.5, 8), 0x9fe4ff).rotation.x = Math.PI;
  t2.children[1].position.y = -0.4;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const sp = add(t2, cone(0.045, 0.55, 4), 0xcff3ff);
    sp.position.set(Math.cos(a) * 0.17, -0.12, Math.sin(a) * 0.17);
    sp.rotation.set(Math.sin(a) * 2.5, 0, -Math.cos(a) * 2.5); // острия назад и в стороны, как у кометы
  }
  const tail = add(t2, cone(0.26, 2.1, 10), 0x7fd0ff, { transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false });
  tail.rotation.x = Math.PI; tail.position.y = -1.35;
  add(t2, cone(0.28, 1.6, 8), 0xaaf0ff, glowO).position.y = 0.2;
  const flakes = [];
  for (let i = 0; i < 4; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: snowflakeTexture(), color: 0xeafaff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
    sp.scale.set(0.3, 0.3, 1);
    t2.add(sp);
    flakes.push({ sp, i });
  }
  const tiers = [t0, t1, t2];
  g.add(t0, t1, t2);
  g.userData.setTier = (n) => { tiers.forEach((q, i) => { q.visible = i === n; }); };
  g.userData.tick = (t) => {
    for (const f of flakes) {
      const a = t * 4 + f.i * 1.57;
      f.sp.position.set(Math.cos(a) * 0.32, -0.5 - f.i * 0.42, Math.sin(a) * 0.32);
      f.sp.material.rotation = t * 3 + f.i;
    }
  };
  g.userData.setTier(0);
  g.renderOrder = 5;
  g.visible = false;
  return g;
}
/** Огненный хвост снаряда (позади острия, ось -Y): setTier(1) короткий язык, setTier(2) длинный двойной с белым ядром. */
function makeFlameTail() {
  const g = new THREE.Group();
  const cone = (r, h, color, op) => {
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 10, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = Math.PI; m.position.y = -h / 2;
    g.add(m);
    return m;
  };
  const outer = cone(0.2, 1.1, 0xff5a14, 0.55);
  const mid = cone(0.13, 0.95, 0xffa030, 0.7);
  const core = cone(0.07, 0.7, 0xfff0b0, 0.85);
  g.userData.setTier = (n) => {
    const L = n === 2 ? 1.5 : 0.8;
    outer.scale.set(n === 2 ? 1.25 : 0.8, L, n === 2 ? 1.25 : 0.8);
    mid.scale.set(1, L, 1);
    core.scale.set(1, L, 1);
    core.visible = n === 2;
  };
  g.userData.tick = (t, k) => { g.scale.set(k * (1 + 0.1 * Math.sin(t * 40)), k * (1 + 0.18 * Math.sin(t * 31 + 1)), k * (1 + 0.1 * Math.cos(t * 37))); };
  g.userData.setTier(1);
  g.renderOrder = 5;
  g.visible = false;
  return g;
}
const LASER_CFG = () => ({ glow: 0xdde8ff, core: 0xffffff, aura: 0xc6d4ff, glowWidth: 0.7, coreWidth: 0.13, life: 0.24 });
const KILL_COLOR = { beetle: 0xff6a55, shooter: 0xc07bff, hunter: 0x6ee06a, bull: 0xffa040, rock: 0xa9b8d0 }; // осколки убитого врага
const rr = (a, b) => a + Math.random() * (b - a);

export class Attack {
  /** scene: куда добавлять эффекты; cfg: CONFIG.attack; hero: Hero; spawner: Spawner */
  constructor(scene, cfg, hero, spawner) {
    this.scene = scene;
    this.cfg = cfg;
    this.hero = hero;
    this.spawner = spawner;
    this.glow = glowTexture();
    this.ball = ballTexture();
    this.ring = ringTexture();
    this.bolts = [];
    this.orbs = []; // шары живого пламени (пул)
    this.beam = { on: false, t: 0, tickT: 0, T: null, target: null, locked: false, ang: 0, cur: 0, sign: 1, dmgPerTick: 0 }; // лазерный посох: идущая атака
    this.laserGap = 0;
    this.balls = []; // шаровые молнии (пул)
    this.fx = [];      // пул вспышек и колец попадания
    this.parts = new Particles(scene, this.glow); // искры, осколки, огоньки
    this.lightning = new Lightning(scene, this.glow, 24); // дуги электрического посоха
    this.laser = new Laser(scene, LASER_CFG());
    this.shocks = [];  // кольца-волны на земле
    for (let i = 0; i < SHOCKS; i++) this.shocks.push(this.makeShock());
    this.cool = 0;
    this.midges = null; // Midges: выстрел сбивает мошку
    this.onKill = null; // (жук) => void, вызывается при убийстве
    this.tip = new THREE.Vector3();
    this.dir = new THREE.Vector3();
    this.holes = []; // чёрные дыры гравитационного посоха +10 (пул)
    this.aura = null; // гравитационное искажение вокруг героя (+5)
    this.auraT = 0; this.auraOn = false;
    this.blades = null; // Blades: создаётся, когда game передаст CONFIG.blades (attack.setBlades)
  }

  /** Конец забега: убрать клинок и лучи сразу. */
  clearStaffFx() {
    this.hideFlames();
    if (this.blades) this.blades.hideNow();
    for (const b of this.laser.pool) { b.on = false; b.glow.visible = b.core.visible = false; }
  }

  /** Подключить посохи лазера и клинков: их числа лежат в CONFIG.laser / CONFIG.blades. */
  setStaffCfgs(laserCfg, bladesCfg) {
    this.laserCfg = laserCfg;
    this.laser.cfg = laserCfg;
    this.blades = new Blades(this.scene, bladesCfg, this);
  }

  makeBolt() {
    const b = { active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, trailT: 0, trail: [] };
    b.halo = sprite(this.glow, BLUE, 0.5);
    b.core = sprite(this.ball, 0xffffff, 1);
    b.lens = sprite(this.ring, 0xb4bac8, 0.5);
    this.scene.add(b.lens);
    b.spike = makeSpike();
    b.flame = makeFlameTail();
    b.el = null;
    b.snowT = 0;
    this.scene.add(b.halo, b.core, b.spike, b.flame);
    for (let i = 0; i < TRAIL; i++) {
      const s = sprite(this.ball, 0xffffff, 0.6);
      this.scene.add(s);
      b.trail.push({ s, x: 0, y: 0, z: 0 });
    }
    this.bolts.push(b);
    return b;
  }

  makeFx() {
    const f = { active: false, t: 0, dur: 0.3, x: 0, y: 0, z: 0, size: 1 };
    f.flash = sprite(this.ball, 0xffffff, 1);
    f.ring = sprite(this.ring, BLUE, 0.9);
    this.scene.add(f.flash, f.ring);
    this.fx.push(f);
    return f;
  }

  /** Кольцо-волна, лежащее на земле. */
  makeShock() {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: this.ring, color: BLUE, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.visible = false;
    m.renderOrder = 3;
    this.scene.add(m);
    return { m, on: false, t: 0, dur: 0.35, size: 1 };
  }

  shock(x, z, size, dur, color = BLUE) {
    const k = this.shocks.find((e) => !e.on);
    if (!k) return;
    k.on = true; k.t = 0; k.dur = dur; k.size = size;
    k.m.material.color.set(color);
    k.m.position.set(x, 0.04, z);
    k.m.visible = true;
  }

  /** Сколько частиц выпускать (ползунок attack.fxAmount). */
  n(count) { return Math.max(0, Math.round(count * (this.cfg.fxAmount === undefined ? 1 : this.cfg.fxAmount))); }

  /** Вспышка и искры у кристалла при выстреле: веер вперёд по направлению шарика. */
  muzzle(x, y, z, dx, dy, dz, el = null) {
    const P = pal(el);
    if (el === 'gravity') { // частицы стягиваются к кристаллу: снаряд собирается
      for (let i = 0; i < this.n(10); i++) {
        const a = rr(0, 6.283), r = rr(0.5, 0.9), up = rr(-0.3, 0.3);
        this.parts.emit({ x: x + Math.cos(a) * r, y: y + up, z: z + Math.sin(a) * r, vx: -Math.cos(a) * r / 0.25, vy: -up / 0.25, vz: -Math.sin(a) * r / 0.25, life: 0.25, size0: rr(0.1, 0.18), size1: 0.03, c0: 0xffffff, c1: 0x7d8494, drag: 0, grav: 0, alpha: 0.9 });
      }
      return;
    }
    const L = Math.hypot(dx, dz) || 1;
    for (let i = 0; i < this.n(9); i++) {
      const sp = rr(2, 6), sx = rr(-0.55, 0.55), sy = rr(-0.2, 0.5), sz = rr(-0.55, 0.55);
      this.parts.emit({ x, y, z, vx: (dx / L + sx * (dz / L)) * sp, vy: (dy + sy) * sp * 0.6, vz: (dz / L - sx * (dx / L) + sz * 0.2) * sp,
        life: rr(0.16, 0.34), size0: rr(0.14, 0.24), size1: 0, c0: P.muz0, c1: P.muz1, drag: 5, grav: el === 'fire' ? -1 : 2 });
    }
    for (let i = 0; i < this.n(3); i++) { // медленные огоньки вокруг кристалла
      this.parts.emit({ x: x + rr(-0.08, 0.08), y: y + rr(-0.08, 0.08), z: z + rr(-0.08, 0.08), vx: rr(-0.4, 0.4), vy: rr(0.2, 0.9), vz: rr(-0.4, 0.4),
        life: rr(0.3, 0.5), size0: 0.22, size1: 0, c0: P.muz0, c1: P.muz1, drag: 2, grav: -0.4, alpha: 0.8 });
    }
  }

  /** Попадание: белая вспышка, волна по земле, веер искр назад к стрелку и в стороны, огоньки; big при убийстве (ещё осколки). */
  impact(x, y, z, dx, dz, big, kind, el = null) {
    const c = this.cfg;
    const P = pal(el), ice = el === 'ice', fire = el === 'fire';
    const L = Math.hypot(dx, dz) || 1;
    dx /= L; dz /= L;
    this.shock(x, z, c.hitSize * (big ? 4.2 : 2.6), big ? 0.5 : 0.36, P.shock);
    if (big) this.shock(x, z, c.hitSize * 2.2, 0.3, 0xcfe8ff);
    const back = Math.atan2(-dz, -dx);
    const count = this.n(big ? 26 : 13);
    for (let i = 0; i < count; i++) {
      const fwd = i % 5 === 0; // часть искр летит вперёд, сквозь врага
      const a = fwd ? Math.atan2(dz, dx) + rr(-0.5, 0.5) : (big && i % 3 === 0 ? rr(0, 6.283) : back + rr(-1.15, 1.15));
      const sp = rr(2.2, big ? 8.5 : 6.2);
      this.parts.emit({ x, y, z, vx: Math.cos(a) * sp, vy: rr(0.8, big ? 5.2 : 3.6), vz: Math.sin(a) * sp,
        life: rr(0.28, big ? 0.7 : 0.55), size0: rr(0.2, 0.36), size1: P.spS, c0: P.sp0, c1: P.sp1, drag: P.spD, grav: P.spG });
    }
    for (let i = 0; i < this.n(big ? 10 : 6); i++) { // быстрые лучи: короткие яркие штрихи, дают резкий «удар»
      const a = i % 4 === 0 ? Math.atan2(dz, dx) + rr(-0.4, 0.4) : back + rr(-1.5, 1.5), sp = rr(9, 15);
      this.parts.emit({ x, y, z, vx: Math.cos(a) * sp, vy: rr(-0.5, 1.5), vz: Math.sin(a) * sp, life: rr(0.09, 0.17), size0: rr(0.1, 0.16), size1: 0.02, c0: 0xffffff, c1: P.sp1, drag: 7, grav: 0 });
    }
    if (kind) { // облачко цвета того, во что попали
      const col = KILL_COLOR[kind] || KILL_COLOR.beetle;
      for (let i = 0; i < this.n(big ? 6 : 3); i++) {
        const a = rr(0, 6.283), sp = rr(0.6, 2.2);
        this.parts.emit({ x, y: y * 0.8, z, vx: Math.cos(a) * sp, vy: rr(0.3, 1.2), vz: Math.sin(a) * sp, life: rr(0.3, 0.55), size0: rr(0.2, 0.3), size1: 0.5, c0: col, c1: 0x201014, drag: 2.5, grav: 0, alpha: 0.35 });
      }
    }
    for (let i = 0; i < this.n(big ? 6 : 3); i++) { // плывущие вверх огоньки
      this.parts.emit({ x: x + rr(-0.15, 0.15), y: y + rr(-0.05, 0.15), z: z + rr(-0.15, 0.15), vx: rr(-0.6, 0.6), vy: rr(0.7, 1.7), vz: rr(-0.6, 0.6),
        life: rr(0.6, 1.1), size0: rr(0.26, 0.4), size1: 0, c0: P.mote0, c1: P.mote1, drag: 1.4, grav: P.moteG, alpha: 0.7 });
    }
    if (ice) { // ледяная крошка: быстрые белые осколки веером и россыпь снежинок
      for (let i = 0; i < this.n(10); i++) {
        const a = rr(0, 6.283), sp = rr(3, 7.5);
        this.parts.emit({ x, y, z, vx: Math.cos(a) * sp, vy: rr(1.5, 4.5), vz: Math.sin(a) * sp, life: rr(0.35, 0.7), size0: rr(0.12, 0.2), size1: 0.08, c0: 0xffffff, c1: 0x6fc8ff, drag: 1.5, grav: 13 });
      }
    }
    if (fire) { // язычки пламени: крупные, быстро тухнут и поднимаются
      for (let i = 0; i < this.n(7); i++) {
        this.parts.emit({ x: x + rr(-0.2, 0.2), y, z: z + rr(-0.2, 0.2), vx: rr(-1.2, 1.2), vy: rr(1, 2.6), vz: rr(-1.2, 1.2), life: rr(0.3, 0.6), size0: rr(0.34, 0.55), size1: 0.05, c0: 0xffd070, c1: 0xd02a08, drag: 2, grav: -2, alpha: 0.75 });
      }
    }
    if (big) { // осколки цвета убитого врага
      const col = KILL_COLOR[kind] || KILL_COLOR.beetle;
      for (let i = 0; i < this.n(12); i++) {
        const a = rr(0, 6.283), sp = rr(1.5, 5);
        this.parts.emit({ x, y: y + 0.1, z, vx: Math.cos(a) * sp, vy: rr(2, 5.5), vz: Math.sin(a) * sp,
          life: rr(0.5, 0.95), size0: rr(0.24, 0.4), size1: 0.05, c0: col, c1: 0x401018, drag: 1.2, grav: 14, alpha: 0.95 });
      }
    }
  }

  /** Вспышка в точке: размер size (м). */
  burst(x, y, z, size, dur, el = null) {
    const P = pal(el);
    const f = this.fx.find((e) => !e.active) || this.makeFx();
    f.active = true; f.t = 0; f.dur = dur; f.x = x; f.y = y; f.z = z; f.size = size;
    f.flash.material.map = P.flash === 'glow' ? this.glow : this.ball; // у льда бледная вспышка, у огня жёлто-оранжевая, у обычного синяя
    f.flash.material.color.setHex(P.flashC);
    f.ring.material.color.setHex(P.ring);
    f.flash.material.needsUpdate = true;
  }

  /** Текущая ступень выстрела стандартного посоха (null у стихийных): по заточке надетого посоха. */
  tierNow() {
    if (this.getElement && this.getElement()) return null;
    return this.tiers && this.getSharpen ? forceTier(this.tiers, this.getSharpen()) : null;
  }

  /** Вид стихийного снаряда по ступени заточки (размер, густота частиц, свечение); null у обычного посоха. */
  lookNow(el) {
    const L = el && this.tiers && this.tiers.tiers.look && this.tiers.tiers.look[el];
    return L && this.getSharpen ? L[tierOf(this.tiers, this.getSharpen())] : null;
  }

  /** opts.spread: поворот направления (рад), opts.quiet: без вспышки у кристалла (второй снаряд залпа). */
  fire(target, opts = {}) {
    const c = this.cfg;
    this.hero.staffTip(this.tip);
    const tx = target.state.x, tz = target.state.z, ty = 0.4;
    this.dir.set(tx - this.tip.x, ty - this.tip.y, tz - this.tip.z).normalize();
    if (opts.spread) { const ca = Math.cos(opts.spread), sa = Math.sin(opts.spread), dx = this.dir.x, dz = this.dir.z; this.dir.x = dx * ca - dz * sa; this.dir.z = dx * sa + dz * ca; }
    if (this.getElement && this.getElement() === 'laser') { this.fireLaser(target); return; } // лазерный посох: мгновенный пробивающий луч
    if (this.getElement && this.getElement() === 'electric') { this.zap(target); return; } // электрический посох: мгновенная дуга вместо снаряда
    if (this.getElement && this.getElement() === 'gravity' && this.gravCfg && this.gravCfg.hole && this.tierIndex() >= 2) { this.fireHole(target); return; } // +10: чёрная дыра вместо снаряда
    const b = this.bolts.find((e) => !e.active) || this.makeBolt();
    b.active = true;
    b.x = this.tip.x; b.y = this.tip.y; b.z = this.tip.z;
    b.vx = this.dir.x * c.speed; b.vy = this.dir.y * c.speed; b.vz = this.dir.z * c.speed;
    b.life = this.cur().range / c.speed + 0.6;
    b.trailT = 0;
    b.launch = 0;
    for (const t of b.trail) { t.x = b.x; t.y = b.y; t.z = b.z; }
    b.el = this.getElement ? this.getElement() : null; // стихия надетого посоха задаёт вид снаряда и эффект попадания
    const ice = b.el === 'ice', fire = b.el === 'fire', grav = b.el === 'gravity', P = pal(b.el);
    b.pierce = this.getMods ? this.getMods().pierce : 0; // сколько целей шарик пробьёт насквозь (модификатор Пробитие)
    if (b.hitSet) b.hitSet.clear(); else b.hitSet = new Set();
    b.grav = grav; b.age = 0; b.travelled = 0; b.pullT = 0; b.released = false;
    b.fast = !!(grav && this.gravCfg && this.gravCfg.aura && this.tierIndex() >= 1); // +5: снаряд без задержки, почти мгновенно
    if (b.fast) b.released = true;
    b.fromSpike = false;
    b.iceTier = ice && this.getSharpen ? tierOf(this.tiers, this.getSharpen()) : 0; // ступень ледяного посоха по заточке
    b.fireTier = fire && this.getSharpen ? tierOf(this.tiers, this.getSharpen()) : 0; // ступень огненного посоха: от неё зависят взрыв и живое пламя
    const tier = this.tierNow();
    b.tier = tier && this.getSharpen ? tierOf(this.tiers, this.getSharpen()) : 0;
    const look = this.lookNow(b.el);
    b.look = look;
    b.sz = tier ? tier.size : look ? look.size : 1;
    b.trailN = tier ? tier.trail : TRAIL;
    b.dmgMul = (grav && this.gravCfg ? 1 + this.gravCfg.damageBonus : 1) * (tier ? tier.damage : 1);
    if (grav && this.gravCfg) b.life = b.fast ? this.cur().range / c.speed + 0.6 : this.gravCfg.rampTime + this.cur().range / c.speed / 1 + 1.5; // хватит на задержку и полёт
    b.halo.material.color.setHex(ice ? ICE : fire ? 0xff7a1a : grav ? 0x8c93a3 : tier ? tier.halo : BLUE);
    if (look && look.halo) b.halo.material.color.setHex(look.halo);
    b.halo.visible = true;
    b.core.material.map = fire || grav ? this.glow : this.ball; // огонь и гравитация: ядро из мягкого пятна
    b.core.material.color.setHex(fire ? 0xfff0b0 : grav ? 0xe6e9ee : 0xffffff);
    b.core.material.needsUpdate = true;
    for (const t of b.trail) { t.s.material.map = fire || grav ? this.glow : this.ball; t.s.material.needsUpdate = true; }
    b.core.visible = !ice;
    b.spike.visible = ice;
    b.flame.visible = fire && b.fireTier >= 1;
    if (b.flame.visible) b.flame.userData.setTier(b.fireTier);
    b.lens.visible = false;
    if (ice) { b.spike.userData.setTier(b.iceTier); b.spike.quaternion.setFromUnitVectors(Y_AXIS, this.dir); }
    this.hero.cast(Math.atan2(tx - this.hero.group.position.x, tz - this.hero.group.position.z));
    if (!opts.quiet) {
      this.burst(this.tip.x, this.tip.y, this.tip.z, c.muzzleSize * b.sz, 0.16, b.el); // вспышка у кристалла
      this.muzzle(this.tip.x, this.tip.y, this.tip.z, this.dir.x, this.dir.y, this.dir.z, b.el);
    }
    b.launch = 0.12; // шарик в начале полёта крупнее и сжимается
  }

  /** Ступень электрического посоха по заточке (0..2). */
  stormTier() { return this.tiers && this.getSharpen ? tierOf(this.tiers, this.getSharpen()) : 0; }

  /** Вид дуг по ступени: цвет сердцевины и свечения, толщина (жёлтая, голубая, фиолетово-белая). */
  arcStyle(tier) {
    const look = this.lookNow('electric');
    return { width: (look ? look.width : 1) * 1.2, color: [0xfffbe0, 0xeaf6ff, 0xffffff][tier], glow: [0xffe45a, 0x6fc8ff, 0xa98bff][tier] };
  }

  /** Электрический посох. +0..4 и +5..9: дуга от кристалла бьёт мгновенно основную цель и ещё врагов по цепочке (2 или 4 врага, урон 2-й, 3-й и 4-й цели 75/50/25%).
   * Кроме того, как раньше: на втором стаке электризации или если дуга убила цель, цепная молния бежит дальше по ещё не задетым врагам (звенья на 50% слабее).
   * +10: вместо разряда выпускается шаровая молния (одновременно не больше ball.max). */
  zap(target) {
    const c = this.cfg, E = this.elec;
    const tx = target.state.x, tz = target.state.z;
    this.hero.cast(Math.atan2(tx - this.hero.group.position.x, tz - this.hero.group.position.z));
    this.burst(this.tip.x, this.tip.y, this.tip.z, c.muzzleSize, 0.16, 'electric');
    this.muzzle(this.tip.x, this.tip.y, this.tip.z, this.dir.x, this.dir.y, this.dir.z, 'electric');
    const tier = this.stormTier(), T = E && E.tiers ? E.tiers[tier] : { targets: 2 };
    if (T.ball) { this.spawnBall(tx, tz); return; }
    const st = this.arcStyle(tier);
    this.lightning.arc([this.tip.x, this.tip.y, this.tip.z], [tx, 0.45, tz], { life: 0.22, ...st });
    const dmg = this.cur().damage;
    const killed = this.strike(target, dmg, tx - this.tip.x, tz - this.tip.z);
    let seen = new Set([target]);
    if (T.targets > 1) seen = this.chain(target, dmg, T.targets - 1, st, seen, E.falloff);
    if (killed || (E && applyShock(target, E) === 'chain')) {
      const f = Array.from({ length: E.chainJumps }, (_, j) => Math.pow(1 - E.chainFalloff, j + 1));
      this.chain(target, dmg, E.chainJumps, st, seen, f);
    }
  }

  /** Удар током по врагу: урон, лёгкое откидывание, искры. true, если враг убит (тогда он исчезает, награда как обычно). */
  strike(e, dmg, dx, dz, el = 'electric') {
    const x = e.state.x, z = e.state.z;
    dmg *= this.critRoll(e);
    e.hp -= dmg;
    this.spawner.knock(e, dx, dz);
    const kill = e.hp <= 0;
    this.burst(x, 0.45, z, this.cfg.hitSize * (kill ? 1.8 : 0.9), kill ? 0.45 : 0.26, el);
    this.impact(x, 0.45, z, dx, dz, kill, e.kind, el);
    if (kill) { this.spawner.kill(e); if (this.onKill) this.onKill(e); this.deathBurst(e, 0); }
    return kill;
  }

  /** Цепь от врага from: extra следующих врагов по цепочке (каждый ближайший к предыдущему в chainRange, ещё не задетый). Урон: доли E.falloff от основного. */
  chain(from, dmg0, extra, st, seen = new Set([from]), falloff = null) {
    const E = this.elec;
    if (!E) return seen;
    falloff = falloff || E.falloff;
    let px = from.state.x, pz = from.state.z;
    for (let j = 0; j < extra; j++) {
      let best = null, bd = E.chainRange * E.chainRange;
      for (const o of this.spawner.alive) {
        if (seen.has(o)) continue;
        const dx = o.state.x - px, dz = o.state.z - pz, d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = o; }
      }
      if (!best) break;
      seen.add(best);
      const nx = best.state.x, nz = best.state.z;
      this.lightning.arc([px, 0.45, pz], [nx, 0.45, nz], { life: 0.22, delay: 0.07 * (j + 1), ...st, width: Math.max(0.6, 1 - 0.1 * j) * st.width });
      this.strike(best, dmg0 * (falloff[Math.min(j, falloff.length - 1)]), nx - px, nz - pz);
      px = nx; pz = nz;
    }
    return seen;
  }

  /** Шаровая молния: рождается у кристалла, плывёт к ближайшему врагу, бьёт врагов рядом ball.hits раз и пропадает. */
  spawnBall(tx, tz) {
    const Bc = this.elec.ball;
    if (this.balls.filter((q) => q.on).length >= (Bc.max || 3)) return; // шаров одновременно не больше потолка
    let o = this.balls.find((q) => !q.on);
    if (!o) {
      o = { on: false, core: sprite(this.glow, 0xffffff, 1), halo: sprite(this.glow, 0x8f78ff, 0.8), t: 0 };
      this.scene.add(o.halo, o.core);
      this.balls.push(o);
    }
    const B = this.elec.ball;
    o.on = true; o.hits = 0; o.life = B.life; o.gap = 0.25; o.t = 0; o.tendril = 0;
    o.x = this.tip.x; o.y = 1.2; o.z = this.tip.z;
    const dx = tx - o.x, dz = tz - o.z, d = Math.hypot(dx, dz) || 1;
    o.dx = dx / d; o.dz = dz / d;
    o.core.visible = o.halo.visible = true;
    this.burst(o.x, o.y, o.z, this.cfg.hitSize * 1.4, 0.3, 'electric');
  }

  endBall(o, boom = true) {
    if (boom) this.burst(o.x, o.y, o.z, this.cfg.hitSize * 1.5, 0.35, 'electric');
    o.on = false; o.core.visible = o.halo.visible = false;
  }

  hideBalls() { for (const o of this.balls) { o.on = false; o.core.visible = o.halo.visible = false; } }

  updateBalls(dt) {
    const B = this.elec && this.elec.ball;
    if (!B) return;
    for (const o of this.balls) {
      if (!o.on) continue;
      o.t += dt; o.life -= dt; o.gap -= dt; o.tendril -= dt;
      if (o.life <= 0 || o.hits >= B.hits) { this.endBall(o); continue; }
      let t = null, bd = B.seekRange * B.seekRange;
      for (const e of this.spawner.alive) { const dx = e.state.x - o.x, dz = e.state.z - o.z, d = dx * dx + dz * dz; if (d < bd) { bd = d; t = e; } }
      if (t) {
        const dx = t.state.x - o.x, dz = t.state.z - o.z, d = Math.hypot(dx, dz) || 1;
        if (d > B.zapRange * 0.55) { o.dx += (dx / d - o.dx) * Math.min(1, dt * 4); o.dz += (dz / d - o.dz) * Math.min(1, dt * 4); const n = Math.hypot(o.dx, o.dz) || 1; o.dx /= n; o.dz /= n; o.x += o.dx * B.speed * dt; o.z += o.dz * B.speed * dt; }
        if (d <= B.zapRange && o.gap <= 0) { // удар по врагу рядом; цепи нет
          o.gap = B.zapGap; o.hits++;
          this.lightning.arc([o.x, o.y, o.z], [t.state.x, 0.45, t.state.z], { life: 0.2, ...this.arcStyle(2) });
          this.strike(t, this.cur().damage * B.damage, dx, dz);
        }
      } else { o.x += o.dx * B.speed * 0.6 * dt; o.z += o.dz * B.speed * 0.6 * dt; }
      const p = 1 + 0.12 * Math.sin(o.t * 32) + 0.06 * Math.sin(o.t * 53);
      o.core.position.set(o.x, o.y, o.z); o.halo.position.set(o.x, o.y, o.z);
      o.core.scale.setScalar(0.75 * p); o.halo.scale.setScalar(1.9 * p);
      if (o.tendril <= 0) { // щупальца-искры вокруг шара
        o.tendril = 0.09;
        const a = rr(0, 6.283), r = rr(0.5, 0.95);
        this.lightning.arc([o.x, o.y, o.z], [o.x + Math.cos(a) * r, o.y + rr(-0.5, 0.5), o.z + Math.sin(a) * r], { life: 0.1, width: 0.55, color: 0xffffff, glow: 0xa98bff });
      }
      this.parts.emit({ x: o.x + rr(-0.15, 0.15), y: o.y + rr(-0.15, 0.15), z: o.z + rr(-0.15, 0.15), vx: rr(-1, 1), vy: rr(-0.5, 1), vz: rr(-1, 1), life: rr(0.2, 0.4), size0: rr(0.1, 0.2), size1: 0, c0: 0xffffff, c1: 0x7f68ff, drag: 2, grav: 0, alpha: 0.9 });
    }
  }

  /** Лазерный посох: магический белый луч держится дольше и бьёт частыми слабыми тиками (updateBeam).
   * +0..4: бьёт одного врага (первого на линии на цель). +5..9: тики и толщина растут; если цель погибла, луч прошивает её и уходит за экран, пока не упрётся в следующего.
   * +10: луч уходит за экран по направлению врага и ведёт в сторону (случайно вверх или вниз), бьёт всех на пути. */
  fireLaser(target) {
    if (this.beam.on) return;
    const L = this.laserCfg, c = this.cfg;
    const tier = this.tierIndex(), T = L.tiers ? L.tiers[tier] : { dur: 0.6, ramp: 0, width: 1 };
    const tx = target.state.x, tz = target.state.z;
    this.hero.cast(Math.atan2(tx - this.hero.group.position.x, tz - this.hero.group.position.z));
    this.burst(this.tip.x, this.tip.y, this.tip.z, c.muzzleSize * 1.3, 0.2, 'laser');
    this.muzzle(this.tip.x, this.tip.y, this.tip.z, this.dir.x, 0, this.dir.z, 'laser');
    const B = this.beam;
    B.on = true; B.t = 0; B.tickT = 0; B.T = T; B.target = target; B.locked = false;
    B.ang = Math.atan2(tx - this.tip.x, tz - this.tip.z); // угол от оси +z к +x: направление луча (dx = sin, dz = cos)
    B.sign = Math.random() < 0.5 ? -1 : 1;
    B.dmgPerTick = this.cur().damage * L.damageMul * L.totalMul * L.tick / T.dur;
    this.laserGap = T.dur + L.gap;
  }

  /** Номер ступени посоха (0..2) по заточке. */
  tierIndex() { return this.tiers && this.getSharpen ? tierOf(this.tiers, this.getSharpen()) : 0; }

  endBeam(early = false) {
    this.beam.on = false;
    this.laser.release();
    if (early) this.cool = Math.min(this.cool, 0.15);
  }

  /** Шаг луча: направление, длина до первого врага (или за экран), тики урона, искры. */
  updateBeam(dt) {
    const B = this.beam;
    if (!B.on) return;
    const L = this.laserCfg, T = B.T;
    if (this.getElement && this.getElement() !== 'laser') { this.endBeam(); return; } // сменили посох
    B.t += dt;
    if (B.t >= T.dur) { this.endBeam(); return; }
    this.hero.staffTip(this.tip);
    const k = B.t / T.dur;
    // направление
    if (T.sweep) B.cur = B.ang + B.sign * (T.sweep * Math.PI / 180) * k; // +10: ведёт в сторону
    else if (!B.locked) {
      if (B.target && this.spawner.alive.includes(B.target)) B.cur = Math.atan2(B.target.state.x - this.tip.x, B.target.state.z - this.tip.z);
      else if (T.pierceDead) B.locked = true; // цель погибла: луч прошивает и идёт дальше в ту же сторону
      else { this.endBeam(true); return; }
      if (!B.locked) B.ang = B.cur;
    }
    if (B.locked) B.cur = B.ang;
    const dx = Math.sin(B.cur), dz = Math.cos(B.cur);
    // длина и цели
    let len = L.far, first = null, ft = Infinity;
    const all = [];
    for (const e of this.spawner.alive) {
      const rx = e.state.x - this.tip.x, rz = e.state.z - this.tip.z;
      const t = rx * dx + rz * dz;
      if (t < 0) continue;
      if (Math.abs(rx * dz - rz * dx) >= L.halfWidth + e.radius) continue;
      all.push(e);
      if (t < ft) { ft = t; first = e; }
    }
    const hits = T.pierceAll ? all : first ? [first] : [];
    if (!T.pierceAll && first) len = ft;
    const wk = (T.width || 1) * (1 + (T.ramp ? 0.5 * k : 0)) * (1 + 0.06 * Math.sin(B.t * 40));
    const ex = this.tip.x + dx * len, ez = this.tip.z + dz * len;
    this.laser.hold(this.tip.x, this.tip.y, this.tip.z, ex, 0.5, ez, wk);
    // тики урона, к концу атаки сильнее (ramp)
    B.tickT += dt;
    const mult = 1 + (T.ramp || 0) * k;
    while (B.tickT >= L.tick) {
      B.tickT -= L.tick;
      for (const e of hits) this.laserTick(e, B.dmgPerTick * mult, dx, dz);
    }
    // магические искры вдоль луча и на конце
    const n = Math.min(len, 14);
    for (let i = 0; i < 3; i++) {
      const t = rr(0.3, n), side = rr(-0.3, 0.3);
      this.parts.emit({ x: this.tip.x + dx * t - dz * side, y: this.tip.y + (0.5 - this.tip.y) * (t / Math.max(1, len)) + rr(-0.1, 0.25), z: this.tip.z + dz * t + dx * side,
        vx: rr(-0.4, 0.4), vy: rr(0.3, 1.2), vz: rr(-0.4, 0.4), life: rr(0.35, 0.7), size0: rr(0.06, 0.13), size1: 0, c0: 0xffffff, c1: 0xb8c8ff, drag: 1.5, grav: -0.5, alpha: 0.9 });
    }
    if (first || T.pierceAll) for (const e of (T.pierceAll ? hits : [first])) {
      if (Math.random() < 0.7) this.parts.emit({ x: e.state.x + rr(-0.2, 0.2), y: 0.45 + rr(-0.15, 0.2), z: e.state.z + rr(-0.2, 0.2), vx: rr(-1.5, 1.5), vy: rr(0.3, 1.8), vz: rr(-1.5, 1.5), life: rr(0.2, 0.4), size0: rr(0.08, 0.15), size1: 0, c0: 0xffffff, c1: 0xb8c8ff, drag: 2, grav: 3 });
    }
    if (this.midges) for (let t = 1; t < Math.min(len, 14); t += 0.7) {
      const mid = this.midges.hitTest(this.tip.x + dx * t, this.tip.z + dz * t, L.halfWidth + 0.15);
      if (mid) { this.midges.kill(mid, 'shot'); this.impact(mid.x, 0.7, mid.z, dx, dz, false, null, 'laser'); }
    }
  }

  /** Один тик лазера по врагу: урон без откидывания; смерть как у обычного удара. Если цель погибла, а это основная, луч «прошивает» (см. updateBeam). */
  laserTick(e, dmg, dx, dz) {
    e.hp -= dmg * this.critRoll(e, true);
    if (e.hp > 0) return;
    const x = e.state.x, z = e.state.z;
    this.burst(x, 0.45, z, this.cfg.hitSize * 1.8, 0.45, 'laser');
    this.impact(x, 0.45, z, dx, dz, true, e.kind, 'laser');
    this.spawner.kill(e); if (this.onKill) this.onKill(e); this.deathBurst(e, 0);
  }

  /** Электризованные враги искрят: мелкие жёлтые искры вокруг. */
  sparkle(dt) {
    for (const e of this.spawner.alive) {
      if (!(e.shockT > 0)) continue;
      e.zapT = (e.zapT || 0) + dt;
      while (e.zapT >= 0.12) {
        e.zapT -= 0.12;
        const a = rr(0, 6.283), r = e.radius * rr(0.6, 1.2);
        this.parts.emit({ x: e.state.x + Math.cos(a) * r, y: rr(0.15, 0.8), z: e.state.z + Math.sin(a) * r, vx: Math.cos(a) * 0.8, vy: rr(-0.5, 1), vz: Math.sin(a) * 0.8, life: rr(0.1, 0.22), size0: rr(0.1, 0.18), size1: 0, c0: 0xffffff, c1: 0xffd21a, drag: 3, grav: 0 });
      }
    }
  }

  /** Текущие урон, перезарядка и дальность: по умолчанию из CONFIG, с посохом из его усилений (this.getStats). */
  cur() { return this.getStats ? this.getStats() : this.cfg; }

  nearest(hx, hz, exclude = null) {
    let best = null;
    let bd = this.cur().range * this.cur().range;
    for (const e of this.spawner.alive) {
      if (e === exclude) continue;
      const dx = e.state.x - hx, dz = e.state.z - hz;
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  /** Модификатор Крит: множитель урона этого удара (1 или critMul) и жёлтая вспышка на враге. */
  critRoll(e, silent = false) {
    const m = this.getMods ? this.getMods() : null;
    if (!m || !(m.crit > 0) || Math.random() >= m.crit) return 1;
    if (!silent) {
      this.burst(e.state.x, 0.6, e.state.z, this.cfg.hitSize * 1.4, 0.3);
      this.shock(e.state.x, e.state.z, 1.6, 0.3, 0xffe14a);
    }
    return m.critMul;
  }

  /** Попадание: урон, вспышка, убитый жук исчезает. */
  hit(b, e) {
    const c = this.cfg;
    e.hp -= this.cur().damage * (b.dmgMul || 1) * this.critRoll(e);
    this.spawner.knock(e, b.vx, b.vz); // откидывание по ходу шарика
    const kill = e.hp <= 0;
    const ice = b.el === 'ice', fire = b.el === 'fire';
    this.burst(b.x, Math.max(0.25, b.y), b.z, c.hitSize * 0.9, 0.26, b.el);
    this.impact(b.x, Math.max(0.25, b.y), b.z, b.vx, b.vz, kill, e.kind, b.el);
    if (fire && !kill) { applyFire(e, this.fireCfg); e.burnTier = b.fireTier || 0; } // ступень, которой подожжён: от неё зависит, взорвётся ли при смерти
    if (ice && !kill) {
      const T = this.ice.tiers[b.iceTier || 0] || this.ice.tiers[0];
      const r = applyIce(e, { ...this.ice, stacksToFreeze: T.stacksToFreeze }); // замедление; на ступени 0 три стака замораживают, выше два
      if (r === 'freeze') {
        e.freezeTier = b.iceTier || 0; // ступень, которой заморожен: от неё зависит, выпустит ли шипы при смерти
        this.burst(e.state.x, 0.5, e.state.z, c.hitSize * 2.2, 0.4, 'ice');
        this.shock(e.state.x, e.state.z, c.hitSize * 4.5, 0.5, 0xe8f9ff);
        for (let i = 0; i < this.n(16); i++) {
          const a = rr(0, 6.283), sp = rr(2, 6);
          this.parts.emit({ x: e.state.x, y: 0.5, z: e.state.z, vx: Math.cos(a) * sp, vy: rr(1, 4), vz: Math.sin(a) * sp, life: rr(0.4, 0.8), size0: rr(0.14, 0.24), size1: 0.06, c0: 0xffffff, c1: 0x7fcfff, drag: 1.6, grav: 12 });
        }
      }
    }
    if (kill) {
      this.burst(e.state.x, 0.35, e.state.z, c.hitSize * 1.9, 0.45);
      this.spawner.kill(e);
      if (this.onKill) this.onKill(e);
      this.deathBurst(e, 0);
    }
    if (b.pierce > 0) { b.pierce--; b.hitSet.add(e); } // пробил: летит дальше к следующему
    else this.deactivate(b);
  }

  /** Убийство не выстрелом (горение, взрыв): вспышка, осколки, враг исчезает, награда как обычно. */
  killFx(e, el, depth = 0) {
    this.burst(e.state.x, 0.35, e.state.z, this.cfg.hitSize * 1.9, 0.45, el);
    this.impact(e.state.x, 0.4, e.state.z, 0, 1, true, e.kind, el);
    this.spawner.kill(e);
    if (this.onKill) this.onKill(e);
    this.deathBurst(e, depth);
  }

  /** Замороженный врагом высшей ступени ледяного посоха умирает: ледяная глыба раскалывается, шипы летят в стороны.
   * Шипы, убившие замороженного, новых шипов не дают (иначе цепь без конца). */
  iceDeath(e, fromSpike) {
    if (fromSpike || !(e.freezeT > 0) || !this.ice || !this.ice.tiers) return;
    const T = this.ice.tiers[e.freezeTier || 0];
    if (!T || !(T.deathSpikes > 0)) return;
    e.freezeT = 0;
    const x = e.state.x, z = e.state.z;
    this.burst(x, 0.5, z, this.cfg.hitSize * 2.4, 0.4, 'ice');
    this.shock(x, z, this.cfg.hitSize * 5, 0.5, 0xe8f9ff);
    for (let i = 0; i < this.n(18); i++) {
      const a = rr(0, 6.283), sp = rr(2, 7);
      this.parts.emit({ x, y: 0.5, z, vx: Math.cos(a) * sp, vy: rr(1, 4.5), vz: Math.sin(a) * sp, life: rr(0.4, 0.8), size0: rr(0.14, 0.26), size1: 0.06, c0: 0xffffff, c1: 0x6fc8ff, drag: 1.5, grav: 12 });
    }
    const base = rr(0, 6.283);
    for (let i = 0; i < T.deathSpikes; i++) this.spawnSpike(x, z, base + (i * 6.283185) / T.deathSpikes);
  }

  /** Ледяной шип, вылетевший из разбитой глыбы: летит в сторону a на spikeRange, бьёт слабее выстрела и вешает замедление. */
  spawnSpike(x, z, a) {
    const c = this.cfg, I = this.ice;
    const b = this.bolts.find((q) => !q.active) || this.makeBolt();
    const dx = Math.cos(a), dz = Math.sin(a);
    b.active = true;
    b.x = x; b.y = 0.5; b.z = z;
    b.vx = dx * c.speed; b.vy = 0; b.vz = dz * c.speed;
    b.life = I.spikeRange / c.speed + 0.1;
    b.trailT = 0; b.launch = 0.12;
    for (const t of b.trail) { t.x = b.x; t.y = b.y; t.z = b.z; t.s.material.map = this.ball; t.s.material.needsUpdate = true; }
    b.el = 'ice'; b.pierce = 0;
    if (b.hitSet) b.hitSet.clear(); else b.hitSet = new Set();
    b.grav = false; b.fast = false; b.age = 0; b.travelled = 0; b.pullT = 0; b.released = false;
    b.fireTier = 0;
    b.fromSpike = true; b.iceTier = 2; b.tier = 0; b.sz = 1; b.look = null; b.trailN = TRAIL;
    b.dmgMul = I.spikeDamage;
    b.halo.material.color.setHex(ICE); b.halo.visible = true;
    b.core.visible = false; b.lens.visible = false;
    b.spike.visible = true;
    b.spike.userData.setTier(0); // шипы из глыбы: маленькие осколки
    b.spike.quaternion.setFromUnitVectors(Y_AXIS, this.dir.set(dx, 0, dz));
  }

  /** Враг умер горящим (любым уроном): небольшой взрыв на его месте. Взрыв может добить других горящих, цепочка до 3 звеньев. */
  deathBurst(e, depth, fromSpike = false) {
    this.iceDeath(e, fromSpike);
    const F = this.fireCfg;
    if (!F || !(F.deathScale > 0) || depth >= 3 || !(e.burnT > 0) || !(e.burn > 0)) return;
    const T = F.tiers && F.tiers[e.burnTier || 0];
    if (!T || !T.deathExplosion) return;
    e.burn = 0; e.burnT = 0;
    this.explode(e, F.deathScale, depth + 1);
    if (T.liveFlame) this.spawnFlame(e.state.x, e.state.z); // ступень +10: из огня собирается шар
  }

  /** Живое пламя: шар собирается над местом смерти, затем летит в ближайшего врага и вешает ему один стак горения (без урона). */
  spawnFlame(x, z) {
    let o = this.orbs.find((q) => !q.on);
    if (!o) {
      o = { on: false, core: sprite(this.glow, 0xfff0b0, 1), halo: sprite(this.glow, 0xff5a14, 0.8) };
      this.scene.add(o.halo, o.core);
      this.orbs.push(o);
    }
    o.on = true; o.t = 0; o.phase = 'gather'; o.x = x; o.y = 1.1; o.z = z; o.target = null;
    o.core.visible = o.halo.visible = true;
  }

  updateFlames(dt) {
    const F = this.fireCfg;
    if (!F) return;
    const G = F.flameGather || 0.6;
    for (const o of this.orbs) {
      if (!o.on) continue;
      o.t += dt;
      const pulse = 1 + 0.12 * Math.sin(o.t * 30);
      if (o.phase === 'gather') {
        const k = Math.min(1, o.t / G);
        for (let i = 0; i < 3; i++) { // языки огня стягиваются к центру
          const a = rr(0, 6.283), r = 1.5 * (1 - k * 0.6) + 0.3, sp = 7;
          this.parts.emit({ x: o.x + Math.cos(a) * r, y: o.y + rr(-0.4, 0.4), z: o.z + Math.sin(a) * r, vx: -Math.cos(a) * sp, vy: rr(-0.5, 0.5), vz: -Math.sin(a) * sp, life: r / sp * 0.9, size0: rr(0.15, 0.3), size1: 0.03, c0: 0xffd070, c1: 0xd0300a, drag: 0, grav: 0, alpha: 0.9 });
        }
        const sz = (0.25 + 0.95 * k) * pulse;
        o.core.position.set(o.x, o.y, o.z); o.halo.position.set(o.x, o.y, o.z);
        o.core.scale.setScalar(sz * 0.8); o.halo.scale.setScalar(sz * 2.2);
        if (k >= 1) {
          o.target = this.nearest(o.x, o.z);
          if (!o.target) { this.burst(o.x, o.y, o.z, this.cfg.hitSize * 1.6, 0.3, 'fire'); o.on = false; o.core.visible = o.halo.visible = false; }
          else o.phase = 'fly';
        }
        continue;
      }
      if (!o.target || !this.spawner.alive.includes(o.target)) o.target = this.nearest(o.x, o.z); // цель погибла: ищем другую
      const tg = o.target;
      if (!tg) { this.burst(o.x, o.y, o.z, this.cfg.hitSize * 1.6, 0.3, 'fire'); o.on = false; o.core.visible = o.halo.visible = false; continue; }
      const dx = tg.state.x - o.x, dy = 0.5 - o.y, dz = tg.state.z - o.z, d = Math.hypot(dx, dy, dz) || 1, step = (F.flameSpeed || 14) * dt;
      if (d <= step + tg.radius * 0.8) {
        applyFire(tg, F); tg.burnTier = 2;
        this.burst(tg.state.x, 0.5, tg.state.z, this.cfg.hitSize * 1.6, 0.35, 'fire');
        for (let i = 0; i < this.n(10); i++) this.parts.emit({ x: tg.state.x, y: 0.5, z: tg.state.z, vx: rr(-3, 3), vy: rr(1, 4), vz: rr(-3, 3), life: rr(0.3, 0.6), size0: rr(0.15, 0.28), size1: 0, c0: 0xffe9a0, c1: 0xff3a10, drag: 2, grav: 4 });
        o.on = false; o.core.visible = o.halo.visible = false;
        continue;
      }
      o.x += dx / d * step; o.y += dy / d * step; o.z += dz / d * step;
      o.core.position.set(o.x, o.y, o.z); o.halo.position.set(o.x, o.y, o.z);
      o.core.scale.setScalar(1.0 * pulse); o.halo.scale.setScalar(2.4 * pulse);
      this.parts.emit({ x: o.x + rr(-0.1, 0.1), y: o.y + rr(-0.1, 0.1), z: o.z + rr(-0.1, 0.1), vx: rr(-0.5, 0.5), vy: rr(0.2, 1), vz: rr(-0.5, 0.5), life: rr(0.25, 0.45), size0: rr(0.18, 0.3), size1: 0, c0: 0xffd070, c1: 0xd0300a, drag: 2, grav: -2, alpha: 0.85 });
    }
  }

  /** Огненный взрыв на третьем стаке поджога: урон всем в радиусе, откидывание от центра, вспышка, волны, пламя и угли. */
  explode(e, scale = 1, depth = 0) {
    const F = this.fireCfg, c = this.cfg;
    const cx = e.state.x, cz = e.state.z, R = F.explosionRadius * scale;
    const dmg = F.explosionDamage * scale * this.cur().damage;
    this.burst(cx, 0.5, cz, c.hitSize * 3.4 * scale, 0.5, 'fire');
    this.shock(cx, cz, R * 2.2, 0.55, 0xff7a1a);
    this.shock(cx, cz, R * 1.4, 0.4, 0xffd070);
    for (let i = 0; i < this.n(40 * scale); i++) {
      const a = rr(0, 6.283), sp = rr(3, 10);
      this.parts.emit({ x: cx, y: 0.4, z: cz, vx: Math.cos(a) * sp, vy: rr(1.5, 6), vz: Math.sin(a) * sp, life: rr(0.35, 0.8), size0: rr(0.2, 0.38), size1: 0.04, c0: 0xffe9a0, c1: 0xff3a10, drag: 2, grav: 6 });
    }
    for (let i = 0; i < this.n(14); i++) {
      const a = rr(0, 6.283), sp = rr(0.5, 3);
      this.parts.emit({ x: cx + Math.cos(a) * 0.3, y: 0.3, z: cz + Math.sin(a) * 0.3, vx: Math.cos(a) * sp, vy: rr(1.5, 3.5), vz: Math.sin(a) * sp, life: rr(0.5, 0.9), size0: rr(0.5, 0.85), size1: 0.1, c0: 0xffb040, c1: 0x401006, drag: 1.5, grav: -1.5, alpha: 0.7 });
    }
    for (let i = 0; i < this.n(12); i++) {
      this.parts.emit({ x: cx + rr(-0.4, 0.4), y: rr(0.2, 0.8), z: cz + rr(-0.4, 0.4), vx: rr(-1, 1), vy: rr(1.5, 3.5), vz: rr(-1, 1), life: rr(0.8, 1.4), size0: rr(0.1, 0.2), size1: 0, c0: 0xffd070, c1: 0xc02008, drag: 0.8, grav: -0.4 });
    }
    for (const o of [...this.spawner.alive]) {
      const dx = o.state.x - cx, dz = o.state.z - cz;
      if (Math.hypot(dx, dz) > R + o.radius) continue;
      o.hp -= dmg;
      this.spawner.knock(o, dx || rr(-1, 1), dz || rr(-1, 1));
      if (o.hp <= 0) this.killFx(o, 'fire', depth);
    }
  }

  /** Горение: урон в секунду по всем подожжённым и языки пламени над ними. */
  burn(dt) {
    const F = this.fireCfg;
    if (!F) return;
    const dmg = this.cur().damage;
    for (const e of [...this.spawner.alive]) {
      if (!(e.burnT > 0)) continue;
      e.hp -= burnTick(e, dt, F, dmg);
      e.emberT = (e.emberT || 0) + dt;
      while (e.emberT >= 0.07) {
        e.emberT -= 0.07;
        this.parts.emit({ x: e.state.x + rr(-0.25, 0.25), y: rr(0.2, 0.7), z: e.state.z + rr(-0.25, 0.25), vx: rr(-0.3, 0.3), vy: rr(0.8, 1.8), vz: rr(-0.3, 0.3), life: rr(0.3, 0.6), size0: rr(0.18, 0.3), size1: 0, c0: 0xffc060, c1: 0xd0300a, drag: 1.2, grav: -1.5, alpha: 0.8 });
      }
      if (e.hp <= 0) this.killFx(e, 'fire');
    }
  }

  /** Попадание шарика в текущей точке: враг или мошка. true, если шарик отработал (попал). */
  advance(b, c) {
    for (const e of this.spawner.alive) {
      if (b.y >= 1.0 + e.radius) continue; // выше спины жука: пролетает
      if (b.hitSet && b.hitSet.has(e)) continue; // уже пробитый жук
      const dx = e.state.x - b.x, dz = e.state.z - b.z, r = c.hitRadius + e.radius;
      if (dx * dx + dz * dz < r * r) { this.hit(b, e); return !b.active; }
    }
    const mid = this.midges && this.midges.hitTest(b.x, b.z, c.hitRadius);
    if (mid) { this.midges.kill(mid, 'shot'); this.burst(mid.x, 0.7, mid.z, c.hitSize * 0.7, 0.25, b.el); this.impact(mid.x, 0.7, mid.z, b.vx, b.vz, false, null, b.el); this.deactivate(b); return true; }
    return false;
  }

  /** Промах: тихо гаснет. */
  missFx(b) {
    const P = pal(b.el);
    this.burst(b.x, Math.max(0.1, b.y), b.z, this.cfg.hitSize * 0.6, 0.22, b.el);
    for (let i = 0; i < this.n(4); i++) this.parts.emit({ x: b.x, y: Math.max(0.1, b.y), z: b.z, vx: rr(-1.5, 1.5), vy: rr(0.3, 1.5), vz: rr(-1.5, 1.5), life: rr(0.2, 0.4), size0: 0.12, size1: 0, c0: P.muz0, c1: P.muz1, drag: 3, grav: 6 });
    this.deactivate(b);
  }


  /** Плоское светящееся кольцо на земле (для искажения и чёрных дыр). */
  makeDisc(color, op) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: this.ring, color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.renderOrder = 3; m.visible = false;
    this.scene.add(m);
    return m;
  }

  /** +10: чёрная дыра летит к врагу и остаётся тянуть всех рядом. */
  fireHole(target) {
    const H = this.gravCfg.hole;
    this.hero.cast(Math.atan2(target.state.x - this.hero.group.position.x, target.state.z - this.hero.group.position.z));
    let h = this.holes.find((q) => !q.on);
    if (!h) {
      if (this.holes.length >= H.max) h = this.holes.reduce((a, q) => (q.t > a.t ? q : a)); // самую старую заменяем новой
      else {
        h = { on: false, t: 0 };
        h.disc = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: 0x000000, transparent: true, opacity: 0.95, depthWrite: false, depthTest: false }));
        h.disc.renderOrder = 6; h.disc.visible = false;
        h.halo = sprite(this.glow, 0x6a5cff, 0.6);
        h.rim = sprite(this.ring, 0xb9a8ff, 0.9);
        h.flat = this.makeDisc(0x7a5cff, 0.8);
        h.flat2 = this.makeDisc(0xc9bcff, 0.5);
        this.scene.add(h.disc, h.halo, h.rim);
        this.holes.push(h);
      }
    }
    const dx = target.state.x - this.tip.x, dz = target.state.z - this.tip.z, d = Math.hypot(dx, dz) || 1;
    h.on = true; h.t = 0; h.x = this.tip.x; h.z = this.tip.z; h.dx = dx / d; h.dz = dz / d;
    h.stop = Math.min(this.cur().range, d + H.reach); // до какой дальности летит, потом стоит
    h.run = 0; h.tickT = 0; h.fxT = 0;
    this.burst(this.tip.x, this.tip.y, this.tip.z, this.cfg.muzzleSize * 1.4, 0.2, 'gravity');
    this.shock(this.tip.x, this.tip.z, 1.8, 0.3, 0x8a7cff);
  }

  /** Убить врага чёрной дырой (награда и эффекты как при обычной смерти). */
  killByHole(e) {
    this.burst(e.state.x, 0.35, e.state.z, this.cfg.hitSize * 1.9, 0.45, 'gravity');
    this.spawner.kill(e);
    if (this.onKill) this.onKill(e);
    this.deathBurst(e, 0);
  }

  /** Искажение вокруг героя (+5 и выше) и чёрные дыры (+10): замедление, притяжение, урон, вид. */
  updateGravity(dt, hx, hz, el) {
    const G = this.gravCfg;
    const tier = G && el === 'gravity' ? this.tierIndex() : -1;
    const auraNow = tier >= 1 && G.aura;
    if (auraNow || this.auraOn) {
      for (const e of this.spawner.alive) e.auraMul = auraNow ? auraSlow(G.aura, Math.hypot(e.state.x - hx, e.state.z - hz)) : 1;
      this.auraOn = !!auraNow;
    }
    if (auraNow) this.auraFx(dt, hx, hz, G.aura);
    else if (this.aura) this.aura.a.visible = this.aura.b.visible = false;
    for (const h of this.holes) if (h.on) this.updateHole(h, dt, hx, hz);
  }

  auraFx(dt, hx, hz, A) {
    if (!this.aura) this.aura = { a: this.makeDisc(0x8c93ff, 0.45), b: this.makeDisc(0xdfe3ff, 0.3) };
    this.auraT += dt;
    const R = A.radius * 2, p = 0.5 + 0.5 * Math.sin(this.auraT * 2.2);
    for (const [m, k, off, op] of [[this.aura.a, 1, 0, 0.3 + 0.2 * p], [this.aura.b, 0.72 + 0.28 * ((this.auraT * 0.5) % 1), 0, 0.28 * (1 - (this.auraT * 0.5) % 1)]]) {
      m.visible = true; m.position.set(hx, 0.05, hz); m.scale.setScalar(R * k * (1 + 0.02 * off)); m.material.opacity = op;
    }
    this.aura.a.rotation.y = this.auraT * 0.35;
    this.auraPT = (this.auraPT || 0) + dt;
    while (this.auraPT >= 0.05) { // частицы закручиваются вокруг героя внутрь
      this.auraPT -= 0.05;
      const a = rr(0, 6.283), r = A.radius * rr(0.55, 1), sp = 2.2;
      this.parts.emit({ x: hx + Math.cos(a) * r, y: rr(0.1, 0.9), z: hz + Math.sin(a) * r,
        vx: -Math.cos(a) * sp * 0.6 - Math.sin(a) * sp, vy: 0, vz: -Math.sin(a) * sp * 0.6 + Math.cos(a) * sp,
        life: r / (sp * 0.8), size0: rr(0.1, 0.2), size1: 0.02, c0: 0xdfe3ff, c1: 0x4a3fb0, drag: 0.2, grav: 0, alpha: 0.7 });
    }
  }

  updateHole(h, dt, hx, hz) {
    const H = this.gravCfg.hole;
    h.t += dt;
    if (h.t >= H.life) {
      h.on = false; h.disc.visible = h.halo.visible = h.rim.visible = h.flat.visible = h.flat2.visible = false;
      this.shock(h.x, h.z, H.radius * 2.2, 0.4, 0x8a7cff);
      this.burst(h.x, 0.5, h.z, this.cfg.hitSize * 2, 0.35, 'gravity');
      return;
    }
    if (h.run < h.stop) { const st = Math.min(H.speed * dt, h.stop - h.run); h.run += st; h.x += h.dx * st; h.z += h.dz * st; }
    const grow = Math.min(1, h.t / 0.3), fade = Math.min(1, (H.life - h.t) / 0.5), k = grow * fade;
    // тянем врагов; боссов не двигаем, но бьём сильно
    h.tickT += dt;
    const doTick = h.tickT >= H.tick;
    if (doTick) h.tickT -= H.tick;
    const boss = this.spawner.boss, dmg = this.cur().damage;
    for (const e of [...this.spawner.alive]) {
      const dx = e.state.x - h.x, dz = e.state.z - h.z, d = Math.hypot(dx, dz);
      if (d >= H.radius) continue;
      const isBoss = e === boss;
      if (!isBoss) {
        const m = holePull(H, e.x, e.z, h.x, h.z, dt);
        e.x += m.dx; e.z += m.dz; e.state.x = e.x; e.state.z = e.z;
      }
      if (!doTick) continue;
      const hurt = isBoss ? H.bossTickDmg : d < H.coreRadius + e.radius ? H.tickDmg : 0;
      if (hurt <= 0) continue;
      e.hp -= dmg * hurt;
      e.flash = 0.1;
      if (e.hp <= 0) this.killByHole(e);
    }
    // вид: чёрное ядро, фиолетовый ореол, кольцо-аккреция, частицы стягиваются
    const y = 0.5, S = H.coreRadius * 2.2 * k;
    h.disc.visible = h.halo.visible = h.rim.visible = h.flat.visible = h.flat2.visible = true;
    h.disc.position.set(h.x, y, h.z); h.disc.scale.setScalar(S);
    h.halo.position.set(h.x, y, h.z); h.halo.scale.setScalar(S * 2.6 * (1 + 0.06 * Math.sin(h.t * 14)));
    h.rim.position.set(h.x, y, h.z); h.rim.scale.setScalar(S * (1.5 + 0.12 * Math.sin(h.t * 9))); h.rim.material.opacity = 0.9 * k;
    h.flat.position.set(h.x, 0.05, h.z); h.flat.scale.setScalar(H.radius * 2 * k); h.flat.rotation.y = h.t * 1.4; h.flat.material.opacity = 0.55 * k;
    h.flat2.position.set(h.x, 0.06, h.z); h.flat2.scale.setScalar(H.radius * 2 * k * (0.5 + 0.5 * ((h.t * 0.8) % 1))); h.flat2.material.opacity = 0.5 * k * (1 - (h.t * 0.8) % 1);
    h.fxT += dt;
    while (h.fxT >= 0.03) {
      h.fxT -= 0.03;
      const a = rr(0, 6.283), r = H.radius * rr(0.5, 1), sp = r / 0.5;
      this.parts.emit({ x: h.x + Math.cos(a) * r, y: rr(0.1, 0.9), z: h.z + Math.sin(a) * r,
        vx: -Math.cos(a) * sp - Math.sin(a) * sp * 0.6, vy: 0, vz: -Math.sin(a) * sp + Math.cos(a) * sp * 0.6,
        life: 0.5, size0: rr(0.1, 0.22), size1: 0.02, c0: 0xcbbfff, c1: 0x201040, drag: 0, grav: 0, alpha: 0.85 });
    }
  }

  hideGravity() {
    for (const h of this.holes) { h.on = false; h.disc.visible = h.halo.visible = h.rim.visible = h.flat.visible = h.flat2.visible = false; }
    if (this.aura) this.aura.a.visible = this.aura.b.visible = false;
    if (this.auraOn) { for (const e of this.spawner.alive) e.auraMul = 1; this.auraOn = false; }
  }

  /** Множитель скорости гравитационного снаряда по времени полёта (кривая SoulsGate: почти стоит, затем взрывной разгон). */
  gravFactor(age) { return gravityFactor(this.gravCfg, age); }

  /** Вид задержки: кольцо-линза сжимается к шарику, частицы стягиваются; при освобождении вспышка и волна. */
  gravFx(b, dt) {
    const G = this.gravCfg;
    const t = Math.min(1, b.age / Math.max(0.001, G.rampTime));
    const hold = Math.min(0.95, G.holdFraction);
    if (t < hold) {
      const ph = (b.age * 2.6) % 1;
      b.lens.visible = true;
      b.lens.position.set(b.x, b.y, b.z);
      b.lens.scale.setScalar(this.cfg.size * (3.6 - 2.6 * ph));
      b.lens.material.opacity = 0.15 + 0.5 * ph * (0.5 + 0.5 * t / hold);
      b.pullT += dt;
      while (b.pullT >= 0.045) {
        b.pullT -= 0.045;
        const a = rr(0, 6.283), r = rr(0.5, 0.9);
        this.parts.emit({ x: b.x + Math.cos(a) * r, y: b.y + rr(-0.2, 0.2), z: b.z + Math.sin(a) * r, vx: -Math.cos(a) * r / 0.22, vy: 0, vz: -Math.sin(a) * r / 0.22, life: 0.22, size0: rr(0.08, 0.14), size1: 0.02, c0: 0xffffff, c1: 0x7d8494, drag: 0, grav: 0, alpha: 0.85 });
      }
    } else {
      if (!b.released) { // освобождение: вспышка и волна
        b.released = true;
        this.burst(b.x, b.y, b.z, this.cfg.hitSize * 1.6, 0.3, 'gravity');
        this.shock(b.x, b.z, 2.6, 0.35, 0xb4bac8);
      }
      b.lens.visible = false;
    }
  }

  deactivate(b) {
    b.active = false;
    b.halo.visible = b.core.visible = b.spike.visible = b.lens.visible = b.flame.visible = false;
    for (const t of b.trail) t.s.visible = false;
  }

  update(dt, hx, hz) {
    const c = this.cfg;
    this.cool -= dt;
    const el = this.getElement ? this.getElement() : null;
    if (this.blades) this.blades.update(dt, hx, hz, el === 'blades'); // клинок живёт сам: орбита и рывки на врагов в досягаемости
    if (el !== 'blades' && this.cool <= 0) {
      const target = this.nearest(hx, hz);
      if (target) {
        const tier = this.tierNow();
        this.fire(target);
        if (tier && tier.shots > 1) { // +10: второй снаряд летит в другого врага рядом, а если враг один, веером рядом
          const other = this.nearest(hx, hz, target);
          if (other) this.fire(other, { quiet: true });
          else this.fire(target, { quiet: true, spread: 0.22 });
        }
        const extra = this.getMods ? Math.round(this.getMods().shots) - 1 : 0; // модификаторы Эпический/Легендарный на посохе: больше снарядов за выстрел
        if (extra > 0) {
          const used = [target];
          for (let k = 1; k <= extra; k++) {
            let other = null, bd = Infinity;
            for (const e of this.spawner.alive) { // ближайший ещё не выбранный враг в досягаемости
              if (used.includes(e)) continue;
              const dx = e.state.x - hx, dz = e.state.z - hz, d = dx * dx + dz * dz;
              if (d < bd && d < this.cur().range * this.cur().range) { bd = d; other = e; }
            }
            if (other) { used.push(other); this.fire(other, { quiet: true }); }
            else if (el !== 'laser' && el !== 'electric') this.fire(target, { quiet: true, spread: 0.16 * Math.ceil(k / 2) * (k % 2 ? 1 : -1) }); // врагов не хватило: веером
          }
        }
        this.cool = this.cur().interval;
        if (el === 'gravity' && this.gravCfg && this.gravCfg.hole && this.tierIndex() >= 2) this.cool *= this.gravCfg.hole.interval / this.cfg.interval; // +10: реже, но чёрными дырами
        if (this.laserGap) { this.cool = Math.max(this.cool, this.laserGap); this.laserGap = 0; } // лазер держит луч, следующая атака после паузы
      }
      else this.cool = 0.1; // нет цели: проверяем чаще, чтобы выстрел вышел сразу, как жук появится
    }
    this.updateGravity(dt, hx, hz, el);
    for (const b of this.bolts) {
      if (!b.active) continue;
      b.life -= dt;
      // Гравитационный снаряд (как в SoulsGate): сначала с трудом отрывается от героя, потом резкий рывок; стоп на предельной дальности.
      let f = 1;
      if (b.grav && this.gravCfg) {
        b.age += dt;
        if (b.fast) f = this.gravCfg.aura.fastMul;
        else { f = this.gravFactor(b.age); this.gravFx(b, dt); }
      }
      const sp = Math.hypot(b.vx, b.vy, b.vz);
      const total = sp * dt * f;
      const subs = Math.max(1, Math.ceil(total / 0.25)); // быстрый рывок проверяем мелкими шагами, чтобы не пролететь сквозь врага
      let ended = false;
      for (let si = 0; si < subs && !ended; si++) {
        const k = dt * f / subs;
        b.x += b.vx * k; b.y += b.vy * k; b.z += b.vz * k;
        b.travelled += sp * k;
        ended = this.advance(b, c);
      }
      if (ended) continue;
      if (b.grav && b.travelled >= this.cur().range) { this.missFx(b); continue; }
      if (b.life <= 0 || b.y < 0.05) { this.missFx(b); continue; }
      // Хвост: каждые 1/60 с сдвигаем след.
      b.trailT += dt;
      while (b.trailT >= 1 / 60) {
        b.trailT -= 1 / 60;
        for (let i = TRAIL - 1; i > 0; i--) { const a = b.trail[i], p = b.trail[i - 1]; a.x = p.x; a.y = p.y; a.z = p.z; }
        b.trail[0].x = b.x; b.trail[0].y = b.y; b.trail[0].z = b.z;
      }
      b.launch = Math.max(0, b.launch - dt);
      const pulse = (1 + Math.sin(b.life * 40) * 0.12) * (1 + 1.3 * (b.launch / 0.12));
      if (b.el === 'ice') { // шип: сам кристалл, холодное свечение и снежный след вместо синих точек
        b.spike.position.set(b.x, b.y, b.z);
        if (b.iceTier === 2 && !b.fromSpike) b.spike.userData.tick(performance.now() / 1000);
        b.spike.scale.setScalar(c.size * 1.5 * (b.sz || 1) * (1 + 0.6 * (b.launch / 0.12)));
        b.halo.position.set(b.x, b.y, b.z);
        b.halo.scale.setScalar(c.size * 2.0 * (b.sz || 1) * (1 + 0.08 * Math.sin(b.life * 30)));
        b.snowT += dt;
        const iceEvery = 0.016 / (b.look ? b.look.dens : 1);
        while (b.snowT >= iceEvery) {
          b.snowT -= iceEvery;
          this.parts.emit({ x: b.x - b.vx * 0.012 + rr(-0.05, 0.05), y: b.y + rr(-0.05, 0.05), z: b.z - b.vz * 0.012 + rr(-0.05, 0.05), vx: rr(-0.5, 0.5), vy: rr(0.1, 0.7), vz: rr(-0.5, 0.5),
            life: rr(0.3, 0.55), size0: rr(0.1, 0.18), size1: 0, c0: 0xffffff, c1: 0x8fd8ff, drag: 2, grav: 1.5, alpha: 0.9 });
        }
        for (const t of b.trail) t.s.visible = false;
        continue;
      }
      const fireB = b.el === 'fire', gravB = b.grav;
      if (fireB && b.flame.visible) { // хвост пламени тянется назад по полёту
        b.flame.position.set(b.x, b.y, b.z);
        b.flame.quaternion.setFromUnitVectors(Y_AXIS, this.dir.set(b.vx, b.vy, b.vz).normalize());
        b.flame.userData.tick(performance.now() / 1000, (b.sz || 1) * c.size * 1.6);
      }
      b.core.position.set(b.x, b.y, b.z);
      b.halo.position.set(b.x, b.y, b.z);
      const tremble = gravB && !b.released ? 1 + 0.15 * Math.sin(b.age * 70) : 1; // под притяжением дрожит
      const sz = b.sz || 1;
      b.core.scale.setScalar(c.size * sz * (fireB ? 1.5 : gravB ? 1.1 : 1.2) * pulse * tremble);
      b.halo.scale.setScalar(c.size * sz * (fireB ? 2.8 : gravB ? 2.4 : 2.2) * pulse * tremble);
      for (let i = 0; i < TRAIL; i++) {
        const t = b.trail[i];
        const k = 1 - i / TRAIL;
        t.s.visible = i < (b.trailN || TRAIL);
        t.s.position.set(t.x, t.y, t.z);
        t.s.scale.setScalar(c.size * sz * (fireB ? 0.5 + 1.0 * k : 0.3 + 0.7 * k));
        t.s.material.opacity = (fireB ? 0.7 : 0.55) * k * k;
        if (fireB) t.s.material.color.setHex(i < 2 ? 0xffd070 : i < 5 ? 0xff8a20 : 0xd0300a); // от жёлтого к тёмно-красному по хвосту
        else if (gravB) t.s.material.color.setHex(i < 3 ? 0xf0f2f6 : 0x8c93a3);
        else t.s.material.color.setHex(0xffffff);
      }
      if (b.tier >= 1 && !b.el) { // усиленный шарик: звёздочки следом (на +10 гуще и голубее)
        b.snowT += dt;
        const every = b.tier === 2 ? 0.02 : 0.05;
        while (b.snowT >= every) {
          b.snowT -= every;
          this.parts.emit({ x: b.x + rr(-0.1, 0.1), y: b.y + rr(-0.1, 0.1), z: b.z + rr(-0.1, 0.1), vx: rr(-0.8, 0.8), vy: rr(-0.2, 0.9), vz: rr(-0.8, 0.8), life: rr(0.25, 0.5),
            size0: rr(0.1, 0.2) * b.sz, size1: 0, c0: 0xffffff, c1: b.tier === 2 ? 0x56e0ff : 0x4a8cff, drag: 2.5, grav: 0, alpha: 0.9 });
        }
      }
      if (fireB) { // искры и язычки, отлетающие от огненного шара
        b.snowT += dt;
        const fireEvery = 0.02 / (b.look ? b.look.dens : 1);
        while (b.snowT >= fireEvery) {
          b.snowT -= fireEvery;
          this.parts.emit({ x: b.x + rr(-0.06, 0.06), y: b.y + rr(-0.06, 0.06), z: b.z + rr(-0.06, 0.06), vx: rr(-0.7, 0.7), vy: rr(0.3, 1.4), vz: rr(-0.7, 0.7), life: rr(0.25, 0.5), size0: rr(0.12, 0.22), size1: 0, c0: 0xffd070, c1: 0xd0300a, drag: 2, grav: -2, alpha: 0.85 });
        }
      }
    }
    this.burn(dt);
    this.updateFlames(dt);
    this.updateBeam(dt);
    this.updateBalls(dt);
    this.sparkle(dt);
    this.updateFx(dt);
  }

  /** Мгновенно убрать все эффекты и снаряды: при выходе в лагерь ничего не должно переехать с боя. */
  clearFx() {
    this.parts.clear();
    this.lightning.clear();
    for (const k of this.shocks) { k.on = false; k.m.visible = false; }
    for (const f of this.fx) { f.active = false; f.flash.visible = f.ring.visible = false; }
    for (const b of this.bolts) this.deactivate(b);
    this.hideFlames();
  }

  hideFlames() {
    this.hideGravity();
    this.beam.on = false; this.laser.clear();
    for (const o of this.orbs) { o.on = false; o.core.visible = o.halo.visible = false; }
    this.hideBalls();
  }

  /** Только эффекты (частицы, волны, вспышки, молнии): идут, даже когда боя нет (смерть, экран потерь), и сами гаснут. */
  updateFx(dt) {
    this.lightning.update(dt);
    this.laser.update(dt);
    this.parts.update(dt);
    for (const k of this.shocks) {
      if (!k.on) continue;
      k.t += dt;
      const q = k.t / k.dur;
      if (q >= 1) { k.on = false; k.m.visible = false; continue; }
      const e = 1 - (1 - q) * (1 - q) * (1 - q);
      k.m.scale.setScalar(k.size * (0.25 + 0.75 * e));
      k.m.material.opacity = 0.9 * (1 - q) * (1 - q);
    }
    for (const f of this.fx) {
      if (!f.active) continue;
      f.t += dt;
      const k = f.t / f.dur;
      if (k >= 1) {
        f.active = false;
        f.flash.visible = f.ring.visible = false;
        continue;
      }
      const e = 1 - (1 - k) * (1 - k); // быстро расширяется, потом замедляется
      f.flash.visible = true;
      f.flash.position.set(f.x, f.y, f.z);
      f.flash.scale.setScalar(f.size * (0.6 + 0.9 * e));
      f.flash.material.opacity = (1 - k) * (1 - k);
      f.ring.visible = true;
      f.ring.position.set(f.x, f.y, f.z);
      f.ring.scale.setScalar(f.size * (0.5 + 2.6 * e));
      f.ring.material.opacity = 0.9 * (1 - k);
    }
  }
}
