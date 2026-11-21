// Автоатака мага: раз в attack.interval секунд выстрел синим светящимся шариком в ближайшего жука.
// Шарик это точка с эффектами: светлое ядро, синий ореол, хвост из затухающих следов, вспышка у кристалла посоха,
// искры и кольцо при попадании. Всё из спрайтов с аддитивным смешиванием (пол тёмный, на нём свечение видно;
// на белом полу оно бы пропало), без света и теней, объекты из пула.
// Числа в CONFIG.attack. Попадание отнимает hp у жука, убитый жук исчезает (Spawner.kill).
import * as THREE from 'three';
import { Particles } from './particles.js';
import { applyIce, applyFire, burnTick } from './status.js';

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
  fire: { flash: 'glow', flashC: 0xffc060, ring: 0xff7a1a, muz0: 0xfff0b0, muz1: 0xff5a10, sp0: 0xffe9a0, sp1: 0xff3a10, spG: 6, spD: 2.2, spS: 0.06, mote0: 0xffa040, mote1: 0x802010, moteG: -1.6, shock: 0xff7a1a },
};
const pal = (el) => PAL[el] || PAL.basic;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

/** Ледяной шип: острый кристалл с остриём вперёд (+Y), бледное свечение вокруг. Ориентируется по скорости снаряда. */
function makeSpike() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.8, 6), new THREE.MeshBasicMaterial({ color: 0xe6f8ff }));
  body.position.y = 0.1;
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 6), new THREE.MeshBasicMaterial({ color: 0x7fcfff }));
  tail.position.y = -0.45;
  tail.rotation.x = Math.PI;
  const glow = new THREE.Mesh(new THREE.ConeGeometry(0.17, 1.0, 6), new THREE.MeshBasicMaterial({ color: 0x8fdcff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.position.y = 0.05;
  g.add(glow, body, tail);
  g.renderOrder = 5;
  g.visible = false;
  return g;
}
const KILL_COLOR = { beetle: 0xff6a55, shooter: 0xc07bff, bull: 0xffa040, rock: 0xa9b8d0 }; // осколки убитого врага
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
    this.bolts = [];   // пул шариков
    this.fx = [];      // пул вспышек и колец попадания
    this.parts = new Particles(scene, this.glow); // искры, осколки, огоньки
    this.shocks = [];  // кольца-волны на земле
    for (let i = 0; i < SHOCKS; i++) this.shocks.push(this.makeShock());
    this.cool = 0;
    this.midges = null; // Midges: выстрел сбивает мошку
    this.onKill = null; // (жук) => void, вызывается при убийстве
    this.tip = new THREE.Vector3();
    this.dir = new THREE.Vector3();
  }

  makeBolt() {
    const b = { active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, trailT: 0, trail: [] };
    b.halo = sprite(this.glow, BLUE, 0.5);
    b.core = sprite(this.ball, 0xffffff, 1);
    b.spike = makeSpike();
    b.el = null;
    b.snowT = 0;
    this.scene.add(b.halo, b.core, b.spike);
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

  fire(target) {
    const c = this.cfg;
    this.hero.staffTip(this.tip);
    const tx = target.state.x, tz = target.state.z, ty = 0.4;
    this.dir.set(tx - this.tip.x, ty - this.tip.y, tz - this.tip.z).normalize();
    const b = this.bolts.find((e) => !e.active) || this.makeBolt();
    b.active = true;
    b.x = this.tip.x; b.y = this.tip.y; b.z = this.tip.z;
    b.vx = this.dir.x * c.speed; b.vy = this.dir.y * c.speed; b.vz = this.dir.z * c.speed;
    b.life = this.cur().range / c.speed + 0.6;
    b.trailT = 0;
    b.launch = 0;
    for (const t of b.trail) { t.x = b.x; t.y = b.y; t.z = b.z; }
    b.el = this.getElement ? this.getElement() : null; // стихия надетого посоха задаёт вид снаряда и эффект попадания
    const ice = b.el === 'ice', fire = b.el === 'fire', P = pal(b.el);
    b.halo.material.color.setHex(ice ? ICE : fire ? 0xff7a1a : BLUE);
    b.halo.visible = true;
    b.core.material.map = fire ? this.glow : this.ball; // огонь: тёплое ядро из мягкого пятна
    b.core.material.color.setHex(fire ? 0xfff0b0 : 0xffffff);
    b.core.material.needsUpdate = true;
    for (const t of b.trail) { t.s.material.map = fire ? this.glow : this.ball; t.s.material.needsUpdate = true; }
    b.core.visible = !ice;
    b.spike.visible = ice;
    if (ice) b.spike.quaternion.setFromUnitVectors(Y_AXIS, this.dir);
    this.hero.cast(Math.atan2(tx - this.hero.group.position.x, tz - this.hero.group.position.z));
    this.burst(this.tip.x, this.tip.y, this.tip.z, c.muzzleSize, 0.16, b.el); // вспышка у кристалла
    this.muzzle(this.tip.x, this.tip.y, this.tip.z, this.dir.x, this.dir.y, this.dir.z, b.el);
    b.launch = 0.12; // шарик в начале полёта крупнее и сжимается
  }

  /** Текущие урон, перезарядка и дальность: по умолчанию из CONFIG, с посохом из его усилений (this.getStats). */
  cur() { return this.getStats ? this.getStats() : this.cfg; }

  nearest(hx, hz) {
    let best = null;
    let bd = this.cur().range * this.cur().range;
    for (const e of this.spawner.alive) {
      const dx = e.state.x - hx, dz = e.state.z - hz;
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  /** Попадание: урон, вспышка, убитый жук исчезает. */
  hit(b, e) {
    const c = this.cfg;
    e.hp -= this.cur().damage;
    this.spawner.knock(e, b.vx, b.vz); // откидывание по ходу шарика
    const kill = e.hp <= 0;
    const ice = b.el === 'ice', fire = b.el === 'fire';
    this.burst(b.x, Math.max(0.25, b.y), b.z, c.hitSize * 0.9, 0.26, b.el);
    this.impact(b.x, Math.max(0.25, b.y), b.z, b.vx, b.vz, kill, e.kind, b.el);
    if (fire && !kill && applyFire(e, this.fireCfg) === 'explode') this.explode(e);
    if (ice && !kill) {
      const r = applyIce(e, this.ice); // замедление; три стака замораживают
      if (r === 'freeze') {
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
    }
    this.deactivate(b);
  }

  /** Убийство не выстрелом (горение, взрыв): вспышка, осколки, враг исчезает, награда как обычно. */
  killFx(e, el) {
    this.burst(e.state.x, 0.35, e.state.z, this.cfg.hitSize * 1.9, 0.45, el);
    this.impact(e.state.x, 0.4, e.state.z, 0, 1, true, e.kind, el);
    this.spawner.kill(e);
    if (this.onKill) this.onKill(e);
  }

  /** Огненный взрыв на третьем стаке поджога: урон всем в радиусе, откидывание от центра, вспышка, волны, пламя и угли. */
  explode(e) {
    const F = this.fireCfg, c = this.cfg;
    const cx = e.state.x, cz = e.state.z, R = F.explosionRadius;
    const dmg = F.explosionDamage * this.cur().damage;
    this.burst(cx, 0.5, cz, c.hitSize * 3.4, 0.5, 'fire');
    this.shock(cx, cz, R * 2.2, 0.55, 0xff7a1a);
    this.shock(cx, cz, R * 1.4, 0.4, 0xffd070);
    for (let i = 0; i < this.n(40); i++) {
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
      if (o.hp <= 0) this.killFx(o, 'fire');
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

  deactivate(b) {
    b.active = false;
    b.halo.visible = b.core.visible = b.spike.visible = false;
    for (const t of b.trail) t.s.visible = false;
  }

  update(dt, hx, hz) {
    const c = this.cfg;
    this.cool -= dt;
    if (this.cool <= 0) {
      const target = this.nearest(hx, hz);
      if (target) { this.fire(target); this.cool = this.cur().interval; }
      else this.cool = 0.1; // нет цели: проверяем чаще, чтобы выстрел вышел сразу, как жук появится
    }
    for (const b of this.bolts) {
      if (!b.active) continue;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      b.life -= dt;
      // Попадание: жук ближе радиуса и шарик не выше его спины.
      let hitE = null;
      for (const e of this.spawner.alive) {
        if (b.y >= 1.0 + e.radius) continue; // выше спины жука: пролетает
        const dx = e.state.x - b.x, dz = e.state.z - b.z, r = c.hitRadius + e.radius;
        if (dx * dx + dz * dz < r * r) { hitE = e; break; }
      }
      if (hitE) { this.hit(b, hitE); continue; }
      const mid = this.midges && this.midges.hitTest(b.x, b.z, c.hitRadius);
      if (mid) { this.midges.kill(mid, 'shot'); this.burst(mid.x, 0.7, mid.z, c.hitSize * 0.7, 0.25); this.impact(mid.x, 0.7, mid.z, b.vx, b.vz, false); this.deactivate(b); continue; }
      if (b.life <= 0 || b.y < 0.05) {
        this.burst(b.x, Math.max(0.1, b.y), b.z, c.hitSize * 0.6, 0.22); // промах: тихо гаснет
        for (let i = 0; i < this.n(4); i++) this.parts.emit({ x: b.x, y: Math.max(0.1, b.y), z: b.z, vx: rr(-1.5, 1.5), vy: rr(0.3, 1.5), vz: rr(-1.5, 1.5), life: rr(0.2, 0.4), size0: 0.12, size1: 0, c0: 0xbfe6ff, c1: 0x2a5bff, drag: 3, grav: 6 });
        this.deactivate(b);
        continue;
      }
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
        b.spike.scale.setScalar(c.size * 1.5 * (1 + 0.6 * (b.launch / 0.12)));
        b.halo.position.set(b.x, b.y, b.z);
        b.halo.scale.setScalar(c.size * 2.0 * (1 + 0.08 * Math.sin(b.life * 30)));
        b.snowT += dt;
        while (b.snowT >= 0.016) {
          b.snowT -= 0.016;
          this.parts.emit({ x: b.x - b.vx * 0.012 + rr(-0.05, 0.05), y: b.y + rr(-0.05, 0.05), z: b.z - b.vz * 0.012 + rr(-0.05, 0.05), vx: rr(-0.5, 0.5), vy: rr(0.1, 0.7), vz: rr(-0.5, 0.5),
            life: rr(0.3, 0.55), size0: rr(0.1, 0.18), size1: 0, c0: 0xffffff, c1: 0x8fd8ff, drag: 2, grav: 1.5, alpha: 0.9 });
        }
        for (const t of b.trail) t.s.visible = false;
        continue;
      }
      const fireB = b.el === 'fire';
      b.core.position.set(b.x, b.y, b.z);
      b.halo.position.set(b.x, b.y, b.z);
      b.core.scale.setScalar(c.size * (fireB ? 1.5 : 1.2) * pulse);
      b.halo.scale.setScalar(c.size * (fireB ? 2.8 : 2.2) * pulse);
      for (let i = 0; i < TRAIL; i++) {
        const t = b.trail[i];
        const k = 1 - i / TRAIL;
        t.s.visible = true;
        t.s.position.set(t.x, t.y, t.z);
        t.s.scale.setScalar(c.size * (fireB ? 0.5 + 1.0 * k : 0.3 + 0.7 * k));
        t.s.material.opacity = (fireB ? 0.7 : 0.55) * k * k;
        if (fireB) t.s.material.color.setHex(i < 2 ? 0xffd070 : i < 5 ? 0xff8a20 : 0xd0300a); // от жёлтого к тёмно-красному по хвосту
        else t.s.material.color.setHex(0xffffff);
      }
      if (fireB) { // искры и язычки, отлетающие от огненного шара
        b.snowT += dt;
        while (b.snowT >= 0.02) {
          b.snowT -= 0.02;
          this.parts.emit({ x: b.x + rr(-0.06, 0.06), y: b.y + rr(-0.06, 0.06), z: b.z + rr(-0.06, 0.06), vx: rr(-0.7, 0.7), vy: rr(0.3, 1.4), vz: rr(-0.7, 0.7), life: rr(0.25, 0.5), size0: rr(0.12, 0.22), size1: 0, c0: 0xffd070, c1: 0xd0300a, drag: 2, grav: -2, alpha: 0.85 });
        }
      }
    }
    this.burn(dt);
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
