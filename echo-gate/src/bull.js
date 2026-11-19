// Бык в 3D (SoulsGate drawBull): жук-носорог, широкий и приземистый, рыжий панцирь, большой рог, красные глаза.
// Замах: тело приседает, дрожит и краснеет, рог опускается; рывок: вытягивается вперёд. Радиус 0.95 м. Модель смотрит в +z.
import * as THREE from 'three';

const R = 0.95; // крупный: заметно больше жука и стрелка
// Золотой бык: бронзовый панцирь, золотая спина, тёплое жёлто-белое свечение, рог цвета слоновой кости.
const SHELL = 0x5a3a0e;
const TOP = 0xf2b032;
const EDGE = 0xfff0b0;
const HORN = 0xfff4d6;
const AURA = 0xffb52e;

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
const M_HORN = new THREE.MeshStandardMaterial({ color: HORN, flatShading: true, roughness: 0.4 });
const M_EDGE = new THREE.MeshBasicMaterial({ color: EDGE });
const G_LEG = new THREE.CylinderGeometry(0.055, 0.042, 1, 5);

function leg(a, b) {
  const d = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(G_LEG, M_SHELL);
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

    // Панцирь: широкая шестигранная «шайба» с выпуклой спиной.
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.78 * R, 0.95 * R, 0.5 * R, 6), M_SHELL);
    shell.position.set(0, 0.45 * R, -0.15 * R);
    shell.scale.set(1.1, 1, 1.3);
    this.body.add(shell);
    const back = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7 * R, 0), this.topMat);
    back.position.set(0, 0.7 * R, -0.25 * R);
    back.scale.set(1.1, 0.6, 1.35);
    this.body.add(back);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.93 * R, 0.014, 4, 6), M_EDGE);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(0, 0.5 * R, -0.15 * R);
    rim.scale.set(1.1, 1.3, 1);
    this.body.add(rim);

    // Голова с большим загнутым рогом и вторым коротким.
    this.head = new THREE.Group();
    this.head.position.set(0, 0.42 * R, 0.95 * R);
    const hm = new THREE.Mesh(new THREE.CylinderGeometry(0.4 * R, 0.55 * R, 0.4 * R, 6), M_SHELL);
    hm.rotation.y = Math.PI / 6;
    this.head.add(hm);
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.17 * R, 1.0 * R, 6), M_HORN);
    horn.rotation.x = Math.PI / 2 - 0.35;
    horn.position.set(0, 0.2 * R, 0.55 * R);
    this.head.add(horn);
    for (const s of [-1, 1]) {
      const h2 = new THREE.Mesh(new THREE.ConeGeometry(0.09 * R, 0.5 * R, 5), M_HORN);
      h2.rotation.x = Math.PI / 2 - 0.2;
      h2.rotation.z = s * -0.35;
      h2.position.set(s * 0.32 * R, 0.1 * R, 0.4 * R);
      this.head.add(h2);
    }
    this.eyes = [];
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08 * R, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff2a0 }));
      eye.position.set(s * 0.26 * R, 0.14 * R, 0.3 * R);
      const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: 0xffd23a, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
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
