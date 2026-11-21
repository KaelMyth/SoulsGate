// Жук-стрелок в 3D (SoulsGate drawShooter): фиолетовый, с брюшком, которое растёт и светится, пока он целится.
// Угловатый тёмный панцирь (грудь), восьмигранное брюшко со слизью внутри, шесть лапок, голова с двумя светящимися глазами.
// Размер: радиус 0.46 м. Модель смотрит в +z. Из примитивов Three.js, материалы общие для всех стрелков.
import * as THREE from 'three';

const R = 0.46;
// Фиолетовый стрелок: аметистовый панцирь, брюшко с розовато-лиловым свечением, голубовато-белые глаза.
const SHELL = 0x5a22a8;
const ABD = 0x9a3df0;
const EDGE = 0xf2a8ff;
const LEG = 0x3d1a78;
const AURA = 0xb84dff;
const CREST = 0xd68bff;

let glowTex = null;
function glow() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

const M_SHELL = new THREE.MeshStandardMaterial({ color: SHELL, flatShading: true, roughness: 0.55 });
const M_ABD = new THREE.MeshStandardMaterial({ color: ABD, flatShading: true, roughness: 0.5, emissive: 0x000000 });
const M_LEG = new THREE.MeshStandardMaterial({ color: LEG, roughness: 0.7 });
const M_CREST = new THREE.MeshStandardMaterial({ color: CREST, flatShading: true, roughness: 0.35, emissive: 0x6a1fb0, emissiveIntensity: 0.5 });
const M_EDGE = new THREE.MeshBasicMaterial({ color: EDGE });
const G_LEG = new THREE.CylinderGeometry(0.02, 0.016, 1, 5);

function leg(a, b) {
  const d = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(G_LEG, M_LEG);
  m.scale.y = d.length();
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}

export class Shooter {
  constructor() {
    this.group = new THREE.Group();
    this.body = new THREE.Group();
    this.group.add(this.body);

    // Грудь: приплюснутый угловатый панцирь, верх светлее ребром.
    const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.6 * R, 0.85 * R, 0.5 * R, 6), M_SHELL);
    chest.position.set(0, 0.42 * R, 0.1 * R);
    chest.scale.set(1, 1, 1.25);
    this.body.add(chest);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.72 * R, 0.012, 4, 6), M_EDGE);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(0, 0.5 * R, 0.1 * R);
    rim.scale.set(1, 1.25, 1);
    this.body.add(rim);

    // Брюшко: многогранник сзади, растёт при заряде; внутри светящаяся слизь.
    this.abd = new THREE.Group();
    this.abd.position.set(0, 0.42 * R, -0.95 * R);
    this.abdMat = M_ABD.clone();
    const abd = new THREE.Mesh(new THREE.IcosahedronGeometry(R * 0.8, 0), this.abdMat);
    abd.scale.set(1, 0.85, 1.1);
    this.abd.add(abd);
    this.core = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: 0xe27bff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.core.scale.setScalar(R * 2.2);
    this.abd.add(this.core);
    this.body.add(this.abd);

    // Голова и глаза.
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.3 * R, 0.4 * R, 0.3 * R, 6), M_SHELL);
    head.position.set(0, 0.38 * R, 0.95 * R);
    head.rotation.y = Math.PI / 6;
    this.body.add(head);
    for (let i = 0; i < 3; i++) { // гребень из трёх шипов на голове и груди
      const sp = new THREE.Mesh(new THREE.ConeGeometry((0.09 - i * 0.015) * R, (0.42 - i * 0.07) * R, 5), M_CREST);
      sp.position.set(0, (0.62 + (i === 0 ? 0.05 : 0)) * R, (0.8 - i * 0.42) * R);
      sp.rotation.x = -0.45;
      this.body.add(sp);
    }
    for (const s of [-1, 1]) { // усики: тонкие, изогнутые вперёд
      const an = new THREE.Mesh(new THREE.CylinderGeometry(0.012 * R, 0.02 * R, 0.7 * R, 4), M_LEG);
      an.position.set(s * 0.15 * R, 0.62 * R, 1.35 * R);
      an.rotation.set(1.0, 0, -s * 0.5);
      this.body.add(an);
      const tip = new THREE.Mesh(new THREE.OctahedronGeometry(0.045 * R, 0), M_CREST);
      tip.position.set(s * 0.32 * R, 0.8 * R, 1.6 * R);
      this.body.add(tip);
    }
    for (const s of [-1, 1]) { // боковые пластины-крылышки на груди
      const wing = new THREE.Mesh(new THREE.OctahedronGeometry(0.34 * R, 0), M_ABD);
      wing.scale.set(0.35, 0.18, 1.0);
      wing.position.set(s * 0.52 * R, 0.62 * R, -0.05 * R);
      wing.rotation.z = -s * 0.45;
      this.body.add(wing);
    }
    this.eyes = [];
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09 * R, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe0ff }));
      eye.position.set(s * 0.16 * R, 0.46 * R, 1.14 * R);
      const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: 0xff5cf0, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
      g.scale.setScalar(0.7 * R);
      g.position.copy(eye.position);
      this.body.add(eye, g);
      this.eyes.push(g);
    }

    // Лапки: три пары, угловатые.
    this.legs = [];
    for (let i = 0; i < 3; i++) {
      const lz = (0.45 - i * 0.4) * R;
      for (const s of [-1, 1]) {
        const g = new THREE.Group();
        g.position.set(s * 0.5 * R, 0.3 * R, lz);
        g.add(leg(new THREE.Vector3(), new THREE.Vector3(s * 0.4 * R, 0.08 * R, 0.15 * R)));
        g.add(leg(new THREE.Vector3(s * 0.4 * R, 0.08 * R, 0.15 * R), new THREE.Vector3(s * 0.62 * R, -0.28 * R, 0.2 * R)));
        this.body.add(g);
        this.legs.push({ g, side: s, phase: i * 2.1 + (s > 0 ? Math.PI : 0), baseZ: lz });
      }
    }

    this.aura = new THREE.Mesh(
      new THREE.PlaneGeometry(5.4 * R, 5.4 * R),
      new THREE.MeshBasicMaterial({ map: glow(), color: AURA, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.aura.rotation.x = -Math.PI / 2;
    this.aura.position.y = 0.02;
    this.group.add(this.aura);
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(3 * R, 3 * R),
      new THREE.MeshBasicMaterial({ map: glow(), color: 0x1e2440, transparent: true, opacity: 0.3, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.008;
    this.group.add(this.shadow);

    this.yaw = 0;
    this.t = Math.random() * 10;
    this.ph = Math.random() * Math.PI * 2;
    this.ab = 0.2;   // размер брюшка 0.2..1
    this.rec = 0;
    this.was = false;
  }

  addTo(scene) { scene.add(this.group); }

  /** state: { x, z, vx, vz, face }; на ходу смотрит по скорости, стоя на героя. Заряд: this.aim / this.aimTotal. */
  update(dt, state) {
    this.t += dt;
    const t = this.t;
    const moving = Math.hypot(state.vx, state.vz) > 0.05;
    this.group.position.set(state.x, 0, state.z);
    const target = moving ? Math.atan2(state.vx, state.vz) : (state.face === undefined ? this.yaw : state.face);
    let d = (target - this.yaw) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    else if (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * (1 - Math.exp(-dt / 0.1));
    this.group.rotation.y = this.yaw;
    const pop = Math.min(1, (this.age === undefined ? 1 : this.age) / 0.25);
    this.group.scale.setScalar(0.4 + 0.6 * (1 - Math.pow(1 - pop, 3)));

    // Заряд: k от 0 до 1 за время прицеливания; брюшко растёт сразу, после выстрела резко сдувается.
    const aiming = this.aim > 0;
    const k = aiming ? Math.min(1, 1 - this.aim / Math.max(0.01, this.aimTotal)) : 0;
    if (this.was && !aiming) this.rec = 1;
    this.was = aiming;
    const goal = aiming ? 0.2 + 0.8 * k * k : 0.2 * (1 - 0.4 * this.rec);
    if (goal >= this.ab) this.ab = goal;
    else this.ab += (goal - this.ab) * (1 - Math.exp(-dt / 0.04));
    this.rec = Math.max(0, this.rec - dt / 0.35);
    const s = 0.55 + 0.75 * this.ab;
    const wob = aiming ? 1 + 0.07 * k * Math.sin(t * 45 + this.ph) : 1;
    this.abd.scale.setScalar(s * wob);
    this.abd.position.z = (-0.7 - 0.3 * this.ab) * R;
    this.core.material.opacity = 0.15 + 0.7 * this.ab * this.ab;
    this.abdMat.emissive.setRGB(0.55 * k * k + (this.flash > 0 ? 0.6 : 0), 0.1 * k * k + (this.flash > 0 ? 0.5 : 0), 0.85 * k * k + (this.flash > 0 ? 0.5 : 0));
    const sh = aiming ? k * 0.02 : 0;
    this.body.position.set(Math.sin(t * 61) * sh, moving ? Math.abs(Math.sin(t * 11 + this.ph)) * 0.02 : 0, Math.cos(t * 53) * sh);

    for (const L of this.legs) {
      const w = moving ? Math.sin(t * 14 + this.ph + L.phase) : 0;
      L.g.position.z = L.baseZ + w * 0.2 * R;
      L.g.position.y = 0.3 * R + Math.max(0, w) * 0.1 * R;
    }
    const f2 = 0.5 + 0.5 * Math.sin(t * 19 + this.ph * 2);
    this.aura.material.opacity = 0.5 + 0.2 * Math.sin(t * 3 + this.ph) + 0.35 * this.ab * this.ab; // при заряде разгорается
    for (const e of this.eyes) e.material.opacity = 0.5 + 0.25 * f2 + 0.25 * k;
  }
}
