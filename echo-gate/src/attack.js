// Автоатака мага: раз в attack.interval секунд выстрел синим светящимся шариком в ближайшего жука.
// Шарик это точка с эффектами: светлое ядро, синий ореол, хвост из затухающих следов, вспышка у кристалла посоха,
// искры и кольцо при попадании. Всё из спрайтов с аддитивным смешиванием (пол тёмный, на нём свечение видно;
// на белом полу оно бы пропало), без света и теней, объекты из пула.
// Числа в CONFIG.attack. Попадание отнимает hp у жука, убитый жук исчезает (Spawner.kill).
import * as THREE from 'three';

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
const SPARKS = 6;

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
    this.cool = 0;
    this.onKill = null; // (жук) => void, вызывается при убийстве
    this.tip = new THREE.Vector3();
    this.dir = new THREE.Vector3();
  }

  makeBolt() {
    const b = { active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, trailT: 0, trail: [] };
    b.halo = sprite(this.glow, BLUE, 0.5);
    b.core = sprite(this.ball, 0xffffff, 1);
    this.scene.add(b.halo, b.core);
    for (let i = 0; i < TRAIL; i++) {
      const s = sprite(this.ball, 0xffffff, 0.6);
      this.scene.add(s);
      b.trail.push({ s, x: 0, y: 0, z: 0 });
    }
    this.bolts.push(b);
    return b;
  }

  makeFx() {
    const f = { active: false, t: 0, dur: 0.3, x: 0, y: 0, z: 0, size: 1, sparks: [] };
    f.flash = sprite(this.ball, 0xffffff, 1);
    f.ring = sprite(this.ring, BLUE, 0.9);
    this.scene.add(f.flash, f.ring);
    for (let i = 0; i < SPARKS; i++) {
      const s = sprite(this.ball, 0xffffff, 1);
      this.scene.add(s);
      const a = (i / SPARKS) * Math.PI * 2 + Math.random();
      f.sparks.push({ s, dx: Math.cos(a), dz: Math.sin(a), dy: 0.4 + Math.random() * 0.8, v: 0.8 + Math.random() * 1.2 });
    }
    this.fx.push(f);
    return f;
  }

  /** Вспышка в точке: размер size (м). */
  burst(x, y, z, size, dur) {
    const f = this.fx.find((e) => !e.active) || this.makeFx();
    f.active = true; f.t = 0; f.dur = dur; f.x = x; f.y = y; f.z = z; f.size = size;
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
    for (const t of b.trail) { t.x = b.x; t.y = b.y; t.z = b.z; }
    b.halo.visible = b.core.visible = true;
    this.hero.cast(Math.atan2(tx - this.hero.group.position.x, tz - this.hero.group.position.z));
    this.burst(this.tip.x, this.tip.y, this.tip.z, c.muzzleSize, 0.16); // вспышка у кристалла
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
    this.burst(b.x, Math.max(0.25, b.y), b.z, c.hitSize, 0.32);
    if (e.hp <= 0) {
      this.burst(e.state.x, 0.35, e.state.z, c.hitSize * 1.6, 0.4);
      this.spawner.kill(e);
      if (this.onKill) this.onKill(e);
    }
    this.deactivate(b);
  }

  deactivate(b) {
    b.active = false;
    b.halo.visible = b.core.visible = false;
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
    const r2 = (c.hitRadius + 0.4) * (c.hitRadius + 0.4);
    for (const b of this.bolts) {
      if (!b.active) continue;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      b.life -= dt;
      // Попадание: жук ближе радиуса и шарик не выше его спины.
      let hitE = null;
      if (b.y < 1.0) {
        for (const e of this.spawner.alive) {
          const dx = e.state.x - b.x, dz = e.state.z - b.z;
          if (dx * dx + dz * dz < r2) { hitE = e; break; }
        }
      }
      if (hitE) { this.hit(b, hitE); continue; }
      if (b.life <= 0 || b.y < 0.05) {
        this.burst(b.x, Math.max(0.1, b.y), b.z, c.hitSize * 0.6, 0.22); // промах: тихо гаснет
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
      const pulse = 1 + Math.sin(b.life * 40) * 0.12;
      b.core.position.set(b.x, b.y, b.z);
      b.halo.position.set(b.x, b.y, b.z);
      b.core.scale.setScalar(c.size * 1.2 * pulse);
      b.halo.scale.setScalar(c.size * 2.2 * pulse);
      for (let i = 0; i < TRAIL; i++) {
        const t = b.trail[i];
        const k = 1 - i / TRAIL;
        t.s.visible = true;
        t.s.position.set(t.x, t.y, t.z);
        t.s.scale.setScalar(c.size * (0.3 + 0.7 * k));
        t.s.material.opacity = 0.55 * k * k;
      }
    }
    for (const f of this.fx) {
      if (!f.active) continue;
      f.t += dt;
      const k = f.t / f.dur;
      if (k >= 1) {
        f.active = false;
        f.flash.visible = f.ring.visible = false;
        for (const s of f.sparks) s.s.visible = false;
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
      for (const s of f.sparks) {
        s.s.visible = true;
        s.s.position.set(f.x + s.dx * s.v * e * f.size, f.y + s.dy * e * f.size * 0.6, f.z + s.dz * s.v * e * f.size);
        s.s.scale.setScalar(f.size * 0.28 * (1 - k));
        s.s.material.opacity = 1 - k;
      }
    }
  }
}
