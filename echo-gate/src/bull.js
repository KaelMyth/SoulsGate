// Бык в 3D: красный жук-геркулес (носорог): два выпуклых надкрылья с канавкой, тёмный щит-грудь с плечевыми шипами,
// длинный рог со лба изгибается вверх и встречается с рогом с груди, на конце вилка, огненные глаза.
// Замах: тело приседает, дрожит и краснеет, рог опускается; рывок: вытягивается вперёд. Радиус 0.95 м. Модель смотрит в +z.
import * as THREE from 'three';

const R = 0.95; // крупный: заметно больше жука и стрелка
// Красный бык: алые надкрылья, почти чёрно-бордовые грудь и голова, рога тёмные с раскалёнными кончиками, красное свечение.
const SHELL = 0x5a0d14;
const TOP = 0xd01c26;
const DARK = 0x2a0a10;
const EDGE = 0xff7a3a;
const HORN = 0x1c0709;
const TIP = 0xffb070;
const AURA = 0xff2a2a;

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

const M_SHELL = new THREE.MeshStandardMaterial({ color: SHELL, flatShading: true, roughness: 0.6 });
const M_TOP = new THREE.MeshStandardMaterial({ color: TOP, flatShading: true, roughness: 0.55 });
const M_HORN = new THREE.MeshStandardMaterial({ color: HORN, flatShading: true, roughness: 0.35, metalness: 0.2 });
const M_DARK = new THREE.MeshStandardMaterial({ color: DARK, flatShading: true, roughness: 0.45, metalness: 0.15 });
const M_TIP = new THREE.MeshBasicMaterial({ color: TIP });
const M_EDGE = new THREE.MeshBasicMaterial({ color: EDGE });
const G_LEG = new THREE.CylinderGeometry(0.055, 0.042, 1, 5);
const Y_UP = new THREE.Vector3(0, 1, 0);

/** Рог: цепочка усечённых конусов по точкам (в долях R), толщина плавно сужается от r0 до r1. */
function horn(parent, pts, r0, r1, mat) {
  const v = pts.map(([x, y, z]) => new THREE.Vector3(x * R, y * R, z * R));
  for (let i = 0; i < v.length - 1; i++) {
    const d = new THREE.Vector3().subVectors(v[i + 1], v[i]);
    const a = r0 + (r1 - r0) * (i / (v.length - 1)), b = r0 + (r1 - r0) * ((i + 1) / (v.length - 1));
    const m = new THREE.Mesh(new THREE.CylinderGeometry(b * R, a * R, d.length(), 5), mat);
    m.position.copy(v[i]).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(Y_UP, d.normalize());
    parent.add(m);
  }
}

function spike(parent, x, y, z, rx, rz, len, w, mat) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(w * R, len * R, 5), mat);
  m.position.set(x * R, y * R, z * R);
  m.rotation.set(rx, 0, rz);
  parent.add(m);
  return m;
}

function leg(a, b) {
  const d = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(G_LEG, M_DARK);
  m.scale.y = d.length();
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}

export class Bull {
  constructor() {
    this.group = new THREE.Group();
    this.body = new THREE.Group();
    this.group.add(this.body);
    this.topMat = M_TOP.clone();

    // Брюшко снизу и два выпуклых надкрылья с канавкой посередине (цвет надкрыльев качает замах).
    const under = new THREE.Mesh(new THREE.CylinderGeometry(0.62 * R, 0.78 * R, 0.3 * R, 6), M_SHELL);
    under.position.set(0, 0.32 * R, -0.3 * R);
    under.scale.set(1.05, 1, 1.5);
    this.body.add(under);
    for (const s of [-1, 1]) {
      const el = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62 * R, 0), this.topMat);
      el.position.set(s * 0.36 * R, 0.62 * R, -0.4 * R);
      el.scale.set(0.82, 0.78, 1.65);
      this.body.add(el);
      const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.6 * R, 0.012 * R, 4, 8, Math.PI), M_EDGE); // светящаяся кромка надкрылья
      stripe.rotation.set(0, Math.PI / 2, 0);
      stripe.position.set(s * 0.36 * R, 0.62 * R, -0.4 * R);
      stripe.scale.set(1.65, 0.78, 0.82);
      this.body.add(stripe);
    }
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.93 * R, 0.014, 4, 6), M_EDGE);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(0, 0.46 * R, -0.3 * R);
    rim.scale.set(1.0, 1.55, 1);
    this.body.add(rim);

    // Грудной щит: тёмный, с плечевыми шипами и рогом, загнутым вперёд и вниз.
    const thorax = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55 * R, 0), M_DARK);
    thorax.position.set(0, 0.66 * R, 0.62 * R);
    thorax.scale.set(1.1, 0.72, 0.85);
    this.body.add(thorax);
    for (const s of [-1, 1]) spike(this.body, s * 0.6, 0.72, 0.5, -0.5, -s * 1.15, 0.38, 0.09, M_HORN);
    horn(this.body, [[0, 0.92, 0.7], [0, 1.2, 1.0], [0, 1.28, 1.45], [0, 1.12, 1.85]], 0.15, 0.05, M_HORN);
    for (const s of [-1, 1]) spike(this.body, s * 0.08, 1.04, 1.95, -2.5, s * 0.5, 0.26, 0.04, M_TIP); // раскалённая вилка на конце

    // Голова: клин с рогом снизу вверх, навстречу грудному.
    this.head = new THREE.Group();
    this.head.position.set(0, 0.46 * R, 1.12 * R);
    const hm = new THREE.Mesh(new THREE.OctahedronGeometry(0.34 * R, 0), M_DARK);
    hm.scale.set(1.15, 0.7, 1.05);
    this.head.add(hm);
    horn(this.head, [[0, 0.02, 0.2], [0, 0.0, 0.62], [0, 0.18, 1.0], [0, 0.46, 1.22]], 0.11, 0.04, M_HORN);
    spike(this.head, 0, 0.5, 1.28, Math.PI / 2 + 0.6, 0, 0.22, 0.035, M_TIP);
    for (const s of [-1, 1]) spike(this.head, s * 0.26, 0.0, 0.34, Math.PI / 2, -s * 0.5, 0.34, 0.06, M_HORN); // жвалы по бокам
    this.eyes = [];
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.075 * R, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe080 }));
      eye.position.set(s * 0.24 * R, 0.14 * R, 0.2 * R);
      const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: 0xff3a2a, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
      g.scale.setScalar(0.6 * R);
      g.position.copy(eye.position);
      this.head.add(eye, g);
      this.eyes.push(g);
    }
    this.body.add(this.head);

    // Ноги: три пары, толстые.
    this.legs = [];
    for (let i = 0; i < 3; i++) {
      const lz = (0.45 - i * 0.55) * R;
      for (const s of [-1, 1]) {
        const g = new THREE.Group();
        g.position.set(s * 0.75 * R, 0.35 * R, lz);
        g.add(leg(new THREE.Vector3(), new THREE.Vector3(s * 0.35 * R, 0.05 * R, 0.1 * R)));
        g.add(leg(new THREE.Vector3(s * 0.35 * R, 0.05 * R, 0.1 * R), new THREE.Vector3(s * 0.5 * R, -0.33 * R, 0.15 * R)));
        this.body.add(g);
        this.legs.push({ g, side: s, phase: i * 2.1 + (s > 0 ? Math.PI : 0), baseZ: lz });
      }
    }

    this.aura = new THREE.Mesh(
      new THREE.PlaneGeometry(5.2 * R, 5.2 * R),
      new THREE.MeshBasicMaterial({ map: glow(), color: AURA, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.aura.rotation.x = -Math.PI / 2;
    this.aura.position.y = 0.02;
    this.group.add(this.aura);
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2 * R, 3.2 * R),
      new THREE.MeshBasicMaterial({ map: glow(), color: 0x1e2440, transparent: true, opacity: 0.32, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.008;
    this.group.add(this.shadow);

    this.yaw = 0;
    this.t = Math.random() * 10;
    this.ph = Math.random() * Math.PI * 2;
  }

  addTo(scene) { scene.add(this.group); }

  /** state: { x, z, vx, vz, face }; this.atk.state: idle | windup | strike | recovery. */
  update(dt, state) {
    this.t += dt;
    const t = this.t;
    const st = this.atk ? this.atk.state : 'idle';
    const moving = Math.hypot(state.vx, state.vz) > 0.05;
    this.group.position.set(state.x, 0, state.z);
    const target = st !== 'idle' && state.face !== undefined ? state.face : moving ? Math.atan2(state.vx, state.vz) : this.yaw;
    let d = (target - this.yaw) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    else if (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * (1 - Math.exp(-dt / (st === 'windup' ? 0.05 : 0.1)));
    this.group.rotation.y = this.yaw;
    const pop = Math.min(1, (this.age === undefined ? 1 : this.age) / 0.25);
    const s = 0.4 + 0.6 * (1 - Math.pow(1 - pop, 3));
    this.group.scale.setScalar(s);

    // Замах: присесть, дрожать, краснеть, опустить рог. Рывок: вытянуться вперёд. После: отдышка.
    const w = st === 'windup' ? Math.min(1, this.atk.t / 0.9) : 0;
    const k = st === 'strike' ? 1 : 0;
    this.body.scale.set(1 + 0.05 * w - 0.08 * k, 1 - 0.18 * w, 1 + 0.2 * k);
    this.body.position.set(Math.sin(t * 70) * 0.02 * w, moving && st === 'idle' ? Math.abs(Math.sin(t * 9 + this.ph)) * 0.025 : 0, 0);
    this.head.rotation.x = 0.35 * w - 0.1 * k;
    const heat = st === 'windup' ? w : st === 'strike' ? 1 : 0;
    this.topMat.emissive.setRGB(0.7 * heat + (this.flash > 0 ? 0.5 : 0), 0.15 * heat + (this.flash > 0 ? 0.4 : 0), 0.05 * heat + (this.flash > 0 ? 0.3 : 0));
    for (const e of this.eyes) e.material.opacity = 0.5 + 0.5 * heat;
    this.aura.material.opacity = 0.5 + 0.12 * Math.sin(t * 2.2 + this.ph) + 0.4 * heat; // в замахе разгорается
    for (const L of this.legs) {
      const ph = moving ? Math.sin(t * (st === 'strike' ? 40 : 12) + this.ph + L.phase) : 0;
      L.g.position.z = L.baseZ + ph * 0.18 * R;
      L.g.position.y = 0.35 * R + Math.max(0, ph) * 0.1 * R;
    }
  }
}
