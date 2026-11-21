// 3D-сцена окна заточки: тёмный зал с колоннами, каменный алтарь с рунами, настоящая модель посоха над ним,
// рунные круги, луч света, пылинки. Эффекты: зарядка (камни слетаются в посох), вспышка успеха, поломка осколками.
// Снаружи: ForgeScene(canvas), setStaff(variant), charge(), win(), lose(), resize(w, h), update(dt) + render().
import * as THREE from 'three';
import { buildStaffModel } from './staff_models.js';
import { glowTexture } from './staff_icons.js';

const VIOLET = 0xa57cff;
const TAU = Math.PI * 2;

function runeTexture() {
  const S = 512, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.translate(S / 2, S / 2);
  g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineCap = 'round';
  for (const [r, w] of [[240, 5], [214, 2], [150, 3], [128, 1.5]]) { g.lineWidth = w; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke(); }
  for (let i = 0; i < 48; i++) { // засечки
    const a = (i / 48) * TAU, long = i % 4 === 0;
    g.lineWidth = long ? 3 : 1.5;
    g.beginPath(); g.moveTo(Math.cos(a) * 214, Math.sin(a) * 214); g.lineTo(Math.cos(a) * (long ? 190 : 200), Math.sin(a) * (long ? 190 : 200)); g.stroke();
  }
  for (let i = 0; i < 12; i++) { // руны-глифы между кругами
    const a = (i / 12) * TAU;
    g.save(); g.rotate(a); g.translate(0, -172); g.lineWidth = 3;
    g.beginPath();
    const k = i * 7 + 3;
    g.moveTo(-9, -12); g.lineTo(((k * 13) % 17) - 8, 0); g.lineTo(9, -((k * 5) % 11)); g.moveTo(0, -14); g.lineTo(0, 14);
    if (k % 3 === 0) { g.moveTo(-10, 10); g.lineTo(10, 10); }
    g.stroke(); g.restore();
  }
  g.lineWidth = 2.5; // звезда в центре
  g.beginPath();
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU * 2 / 2 + 0.3; g.lineTo(Math.cos(a * 2) * 110, Math.sin(a * 2) * 110); }
  g.closePath(); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const HALO = { basic: 0x35f2ff, fire: 0xff8a2a, ice: 0x9fdcff, electric: 0xffe45a, gravity: 0xb06bff, laser: 0xff3345, blades: 0xa8d4ff };

export class ForgeScene {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x07040f);
    this.scene.fog = new THREE.FogExp2(0x0a0618, 0.055);
    this.camera = new THREE.PerspectiveCamera(42, 0.5, 0.1, 60);
    this.camBase = new THREE.Vector3(0, 2.9, 9.6);
    this.look = new THREE.Vector3(0, 2.6, 0);
    this.t = 0;
    this.glowTex = glowTexture();
    this.glowMat = (color, op = 1) => new THREE.SpriteMaterial({ map: this.glowTex, color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false });
    this.energy = 0;      // 0 покой, 1 зарядка: разгоняет круги и орбиты
    this.shake = 0;
    this.flash = 0;
    this.fx = [];         // короткие эффекты: { obj, life, age, update(k) }
    this.shards = [];
    this.variant = null;
    this.staff = null;
    this.appear = 1;
    this.build();
  }

  build() {
    const S = this.scene;
    // Свет: холодный фон, фиолетовый источник у алтаря, контровой сзади.
    S.add(new THREE.HemisphereLight(0x8d84c8, 0x140c26, 0.9));
    const key = new THREE.DirectionalLight(0xdcd0ff, 0.9); key.position.set(3, 7, 6); S.add(key);
    const rim = new THREE.DirectionalLight(0x8a5cff, 0.8); rim.position.set(-5, 4, -4); S.add(rim);
    this.altarLight = new THREE.PointLight(VIOLET, 2.2, 9, 1.6); this.altarLight.position.set(0, 2.0, 0.6); S.add(this.altarLight);

    const stone = new THREE.MeshStandardMaterial({ color: 0x5d5679, roughness: 0.92, metalness: 0.05, flatShading: true });
    const stoneD = new THREE.MeshStandardMaterial({ color: 0x3a3452, roughness: 0.95, flatShading: true });
    const stoneL = new THREE.MeshStandardMaterial({ color: 0x7a7298, roughness: 0.85, flatShading: true });
    const glow = new THREE.MeshBasicMaterial({ color: VIOLET });
    this.glowMats = [glow];

    // Пол: широкий тёмный диск и каменная площадка под алтарём.
    const floor = new THREE.Mesh(new THREE.CircleGeometry(18, 40), new THREE.MeshStandardMaterial({ color: 0x120c22, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2; S.add(floor);
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.5, 0.22, 10), stoneD); plat.position.y = 0.11; S.add(plat);
    const plat2 = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.9, 0.16, 10), stone); plat2.position.y = 0.3; S.add(plat2);

    // Рунные круги на площадке.
    const rt = runeTexture();
    const mkRune = (r, op, y) => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(r, 48), new THREE.MeshBasicMaterial({ map: rt, color: VIOLET, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.y = y; S.add(m); return m;
    };
    this.runeA = mkRune(2.65, 0.85, 0.39);
    this.runeB = mkRune(3.35, 0.4, 0.23);
    this.runeB.material.color.set(0x6fb4ff);

    // Алтарь: ступени, сужающаяся колонна с кольцами, чаша с сияющей вставкой, рунные прорези.
    const ped = new THREE.Group(); ped.position.y = 0.38; S.add(ped);
    const lathe = new THREE.Mesh(new THREE.LatheGeometry([
      [1.25, 0], [1.25, 0.14], [1.05, 0.2], [1.05, 0.34], [0.72, 0.44], [0.58, 0.62], [0.5, 1.05], [0.58, 1.2], [0.8, 1.28], [0.86, 1.4],
    ].map(([x, y]) => new THREE.Vector2(x, y)), 8), stone);
    ped.add(lathe);
    for (const y of [0.34, 1.2]) { const r = new THREE.Mesh(new THREE.TorusGeometry(y < 1 ? 1.05 : 0.8, 0.04, 6, 8), stoneL); r.rotation.x = Math.PI / 2; r.position.y = y; r.scale.set(1, 1, 1); ped.add(r); }
    for (let i = 0; i < 4; i++) { // светящиеся прорези на гранях
      const a = (i / 4) * TAU + Math.PI / 8;
      for (const [y, h] of [[0.78, 0.34], [0.58, 0.1]]) {
        const s = new THREE.Mesh(new THREE.BoxGeometry(0.07, h, 0.02), glow);
        s.position.set(Math.cos(a) * 0.58, y, Math.sin(a) * 0.58); s.rotation.y = -a + Math.PI / 2; ped.add(s);
      }
    }
    const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.84, 0.84, 0.06, 8), stoneD); dish.position.y = 1.42; ped.add(dish);
    this.inlay = new THREE.Mesh(new THREE.CircleGeometry(0.66, 8), new THREE.MeshBasicMaterial({ color: 0xd9c4ff })); this.inlay.rotation.x = -Math.PI / 2; this.inlay.position.y = 1.46; ped.add(this.inlay);
    const rimRing = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.03, 6, 8), glow); rimRing.rotation.x = Math.PI / 2; rimRing.position.y = 1.46; ped.add(rimRing);
    this.pedTop = 0.38 + 1.46;
    const dishGlow = new THREE.Sprite(this.glowMat(0xc9a8ff, 0.9)); dishGlow.scale.set(3, 1.2, 1); dishGlow.position.y = this.pedTop + 0.05; S.add(dishGlow); this.dishGlow = dishGlow;

    // Колонны по кругу позади, у каждой светящийся камень и руны.
    this.pillarGlows = [];
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * (1.08 + (i / 8) * 0.84) + 0; // дуга сзади
      const r = 7.2 + (i % 2) * 1.2;
      const p = new THREE.Group(); p.position.set(Math.cos(a) * r, 0, Math.sin(a) * r - 1.5);
      const h = 5.2 + (i % 3) * 0.9;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.62, h, 6), stone); col.position.y = h / 2; p.add(col);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.5, 0.3, 6), stoneL); cap.position.y = h + 0.1; p.add(cap);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.85, 0.35, 6), stoneD); base.position.y = 0.17; p.add(base);
      for (let k = 0; k < 3; k++) { const rn = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.5 + (k % 2) * 0.3, 0.03), glow); rn.position.set(0, 1.4 + k * 1.1, 0.56); p.add(rn); }
      const g = new THREE.Sprite(this.glowMat(i % 2 ? 0x6fb4ff : VIOLET, 0.8)); g.scale.set(1.8, 1.8, 1); g.position.y = h + 0.7; p.add(g);
      this.pillarGlows.push({ g, ph: i * 1.1 });
      p.lookAt(0, 0, 0); S.add(p);
    }

    // Луч света сверху на алтарь.
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.8, 8, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xb9a0ff, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = 4.4; S.add(beam); this.beam = beam;

    // Пылинки и светлячки.
    const N = 140, pos = new Float32Array(N * 3);
    this.motes = [];
    for (let i = 0; i < N; i++) { const a = Math.random() * TAU, r = 1 + Math.random() * 7; this.motes.push({ a, r, y: Math.random() * 7, s: 0.15 + Math.random() * 0.35, w: (Math.random() - 0.5) * 0.4 }); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.moteGeo = geo;
    this.moteMat = new THREE.PointsMaterial({ map: this.glowTex, color: 0xcdb8ff, size: 0.22, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
    S.add(new THREE.Points(geo, this.moteMat));

    // Орбиты вокруг посоха: кристаллики силы, при зарядке слетаются к нему.
    this.orbit = new THREE.Group(); S.add(this.orbit);
    this.orbiters = [];
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0).scale(0.7, 1.3, 0.7), new THREE.MeshBasicMaterial({ color: 0xe6dcff }));
      const h = new THREE.Sprite(this.glowMat(0xb58cff, 0.8)); h.scale.set(0.6, 0.6, 1);
      m.add(h); this.orbit.add(m);
      this.orbiters.push({ m, a: (i / 6) * TAU, r: 1.5, y: 0 });
    }
    this.staffAnchor = new THREE.Group(); this.staffAnchor.position.set(0, this.pedTop + 0.75, 0); S.add(this.staffAnchor);
    this.halo = new THREE.Sprite(this.glowMat(VIOLET, 0.2)); this.halo.scale.set(2.6, 2.6, 1); this.halo.position.copy(this.staffAnchor.position); this.halo.position.y += 1.2; S.add(this.halo);
    this.flashSprite = new THREE.Sprite(this.glowMat(0xffffff, 0)); this.flashSprite.scale.set(9, 9, 1); this.flashSprite.position.copy(this.halo.position); S.add(this.flashSprite);
  }

  setStaff(variant, tier = 0) {
    if (variant === this.variant && tier === this.tier) return;
    this.variant = variant;
    this.tier = tier;
    if (this.staff) this.staffAnchor.remove(this.staff.group);
    const m = buildStaffModel(variant, this.glowTex, new THREE.MeshStandardMaterial({ color: 0x3b2415, roughness: 0.9 }), tier);
    this.staff = m;
    this.staffAnchor.add(m.group);
    m.group.visible = true;
    this.appear = 0; // появление: вырастает со вспышкой
    const c = HALO[variant] || VIOLET;
    this.halo.material.color.set(c);
    this.ring(c, 0.5, 5, 0.7);
  }

  /** Расходящееся по земле кольцо (ударная волна). */
  ring(color, from, to, dur, y = null) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.position.y = y == null ? this.pedTop + 0.1 : y;
    this.scene.add(m);
    this.fx.push({ obj: m, life: dur, age: 0, update: (k) => { const s = from + (to - from) * (1 - Math.pow(1 - k, 2)); m.scale.set(s, s, s); m.material.opacity = 0.9 * (1 - k); } });
  }

  /** Фонтан искр из точки посоха. */
  burst(color, n, speed, gravity) {
    const c = this.halo.position;
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(this.glowMat(color, 1)); const sc = 0.15 + Math.random() * 0.25; s.scale.set(sc, sc, 1);
      s.position.copy(c); this.scene.add(s);
      const a = Math.random() * TAU, e = Math.random() * 1.2 - 0.2, v = speed * (0.4 + Math.random() * 0.8);
      const vx = Math.cos(a) * v * Math.cos(e), vy = Math.sin(e) * v + speed * 0.3, vz = Math.sin(a) * v * Math.cos(e);
      const p0 = c.clone();
      this.fx.push({ obj: s, life: 1 + Math.random() * 0.6, age: 0, update: (k, age) => { s.position.set(p0.x + vx * age, p0.y + vy * age - 0.5 * gravity * age * age, p0.z + vz * age); s.material.opacity = 1 - k; } });
    }
  }

  charge() { this.chargeT = 0; this.charging = true; this.chargeTarget = 1; }

  win() {
    this.charging = false;
    this.flash = 1; this.shake = 0.12;
    const c = HALO[this.variant] || VIOLET;
    this.ring(0xffe9a0, 0.5, 9, 1.0, this.pedTop + 0.05); this.ring(c, 0.5, 6, 0.8, this.pedTop + 0.6);
    this.burst(0xffe08a, 70, 4.2, 4); this.burst(0xffffff, 30, 6, 2);
    this.appear = 0.55; // посох «подпрыгивает» и успокаивается
    this.winPulse = 1;
  }

  lose() {
    this.charging = false;
    this.flash = 0.8; this.shake = 0.5;
    this.ring(0xff4a4a, 0.5, 8, 0.9, this.pedTop + 0.05);
    this.burst(0xff5a4a, 50, 3.5, 7);
    // Осколки посоха.
    const c = this.halo.position;
    const mat = new THREE.MeshStandardMaterial({ color: 0x6a5a4a, roughness: 0.8, flatShading: true, emissive: 0xff3322, emissiveIntensity: 0.6 });
    for (let i = 0; i < 18; i++) {
      const m = new THREE.Mesh(new THREE.TetrahedronGeometry(0.07 + Math.random() * 0.12, 0).scale(0.6, 1.6, 0.6), mat);
      const y0 = this.staffAnchor.position.y + Math.random() * 2.6;
      m.position.set((Math.random() - 0.5) * 0.3, y0, (Math.random() - 0.5) * 0.3); this.scene.add(m);
      const vx = (Math.random() - 0.5) * 5, vy = 1.5 + Math.random() * 3.5, vz = (Math.random() - 0.5) * 5;
      const rx = (Math.random() - 0.5) * 12, rz = (Math.random() - 0.5) * 12;
      const p0 = m.position.clone();
      this.fx.push({ obj: m, life: 1.6, age: 0, update: (k, age) => { m.position.set(p0.x + vx * age, Math.max(0.45, p0.y + vy * age - 5 * age * age), p0.z + vz * age); m.rotation.x = rx * age; m.rotation.z = rz * age; m.scale.setScalar(1 - k * 0.5); } });
    }
    if (this.staff) this.staff.group.visible = false;
    this.broken = true;
  }

  resize(w, h) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Вертикаль всегда видна целиком: на узком экране отодвигаем камеру.
    this.camera.updateProjectionMatrix();
  }

  update(dt) {
    dt = Math.max(0, Math.min(dt, 0.05));
    this.t += dt;
    const t = this.t;
    const en = this.charging ? Math.min(1, (this.energy || 0) + dt * 1.6) : Math.max(0, (this.energy || 0) - dt * 1.1);
    this.energy = en;
    const spin = 1 + en * 9;
    this.runeA.rotation.z += dt * 0.25 * spin;
    this.runeB.rotation.z -= dt * 0.12 * spin;
    this.runeA.material.opacity = 0.65 + 0.2 * Math.sin(t * 2) + en * 0.5;
    this.runeB.material.opacity = 0.35 + 0.1 * Math.sin(t * 1.3 + 1) + en * 0.4;
    this.altarLight.intensity = 2.2 + Math.sin(t * 2.2) * 0.4 + en * 5 + this.flash * 8;
    this.dishGlow.material.opacity = 0.7 + 0.2 * Math.sin(t * 2.6) + en * 0.3;
    this.beam.material.opacity = 0.04 + 0.015 * Math.sin(t * 1.5) + en * 0.08 + this.flash * 0.12;
    this.beam.rotation.y = t * 0.1;
    for (const p of this.pillarGlows) p.g.material.opacity = 0.55 + 0.3 * Math.sin(t * 1.4 + p.ph) + en * 0.3;

    // Посох: парит, медленно вращается, при зарядке дрожит и разгоняется.
    this.appear = Math.min(1, this.appear + dt * 2.2);
    const ap = this.appear;
    const ease = 1 - Math.pow(1 - ap, 3);
    if (this.staff && !this.broken) {
      const g = this.staff.group;
      g.position.y = Math.sin(t * 1.5) * 0.12 + en * 0.25 + (ap < 1 ? (1 - ease) * -0.4 : 0);
      g.rotation.y = t * (0.55 + en * 5);
      g.rotation.z = Math.sin(t * 0.9) * 0.03 + (en > 0 ? Math.sin(t * 60) * 0.015 * en : 0);
      g.scale.setScalar(1.3 * (0.55 + 0.45 * ease) * (1 + en * 0.06));
      this.staff.update(t, Math.min(1, 0.2 + en));
    }
    this.halo.material.opacity = 0.14 + 0.05 * Math.sin(t * 2) + en * 0.45 + this.flash * 0.5;
    this.halo.scale.setScalar(2.6 + en * 2 + this.flash * 3);
    this.flash = Math.max(0, this.flash - dt * 1.7);
    this.flashSprite.material.opacity = this.flash * 0.9;
    // Орбиты.
    const hy = this.staffAnchor.position.y + 1.3;
    for (const o of this.orbiters) {
      const tr = 1.55 - en * 1.35;
      o.r += (tr - o.r) * Math.min(1, dt * 4);
      o.a += dt * (0.8 + en * 7);
      o.m.position.set(Math.cos(o.a) * o.r, hy + Math.sin(o.a * 1.3 + o.y) * 0.9 - 0.2, Math.sin(o.a) * o.r);
      o.m.rotation.y = t * 2; o.m.visible = !this.broken;
    }
    // Пылинки.
    const pa = this.moteGeo.attributes.position.array;
    this.motes.forEach((m, i) => {
      m.y += dt * m.s * (1 + en * 2); if (m.y > 7) m.y = 0;
      m.a += dt * m.w;
      pa[i * 3] = Math.cos(m.a) * m.r; pa[i * 3 + 1] = m.y; pa[i * 3 + 2] = Math.sin(m.a) * m.r - 1;
    });
    this.moteGeo.attributes.position.needsUpdate = true;
    // Эффекты.
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const f = this.fx[i]; f.age += dt;
      const k = Math.min(1, f.age / f.life);
      f.update(k, f.age);
      if (f.age >= f.life) { this.scene.remove(f.obj); if (f.obj.material) f.obj.material.dispose && f.obj.material.dispose(); this.fx.splice(i, 1); }
    }
    // Лёгкое покачивание камеры и тряска.
    this.shake = Math.max(0, this.shake - dt * 0.9);
    const sx = (Math.random() - 0.5) * this.shake, sy = (Math.random() - 0.5) * this.shake;
    this.camera.position.set(this.camBase.x + Math.sin(t * 0.3) * 0.35 + sx, this.camBase.y + Math.sin(t * 0.4) * 0.1 + sy, this.camBase.z);
    this.camera.lookAt(this.look);
  }

  /** Вернуть посох на место после поломки. */
  restore() { this.broken = false; if (this.staff) this.staff.group.visible = true; this.appear = 0; }

  render() { this.renderer.render(this.scene, this.camera); }
}
