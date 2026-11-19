// Скала-великан (Горный жук SoulsGate) в 3D: огромный валун на четырёх каменных лапах, серо-зелёный камень,
// зелёные светящиеся трещины и кристаллы на спине, два светящихся глаза, мягкое зелёное свечение вокруг.
// Замах: приподнимается, дрожит, трещины разгораются; удар: падает и сплющивается. Радиус 2.0 м. Модель смотрит в +z.
import * as THREE from 'three';

const R = 2.0;
const STONE = 0x56606b;
const MOSS = 0x5f7a62;
const GREEN = 0x7dff9a;

let glowTex = null;
function glow() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.4, 'rgba(255,255,255,0.3)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

/** Грубый валун: икосаэдр с детерминированно сдвинутыми вершинами. */
function boulder(radius, detail, seed, mat) {
  const g = new THREE.IcosahedronGeometry(radius, detail);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = 1 + 0.16 * Math.sin(v.x * 3.1 + seed) * Math.cos(v.z * 2.7 + seed * 1.7) + 0.08 * Math.sin(v.y * 5 + seed);
    p.setXYZ(i, v.x * k, v.y * k, v.z * k);
  }
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

const M_STONE = new THREE.MeshStandardMaterial({ color: STONE, flatShading: true, roughness: 0.9 });
const M_MOSS = new THREE.MeshStandardMaterial({ color: MOSS, flatShading: true, roughness: 0.9 });
const M_GLOW = new THREE.MeshBasicMaterial({ color: GREEN });

export class Rock {
  constructor() {
    this.group = new THREE.Group();
    this.body = new THREE.Group();
    this.group.add(this.body);

    const main = boulder(0.95 * R, 1, 1.3, M_STONE);
    main.position.y = 0.8 * R;
    main.scale.set(1, 0.78, 1.1);
    this.body.add(main);
    const top = boulder(0.55 * R, 1, 4.1, M_MOSS);
    top.position.set(-0.1 * R, 1.25 * R, -0.15 * R);
    top.scale.set(1, 0.6, 1);
    this.body.add(top);

    // Трещины: светящиеся ломаные по спине и бокам.
    this.cracks = [];
    for (let i = 0; i < 7; i++) {
      const a0 = (i / 7) * Math.PI * 2 + 0.3;
      const pts = [];
      for (let k = 0; k < 6; k++) {
        const a = a0 + Math.sin(k * 2.3 + i) * 0.25;
        const h = 0.2 + k * 0.13;
        const rr = 0.93 * R * Math.sqrt(Math.max(0.05, 1 - h * h * 0.8)) * 1.02;
        pts.push(new THREE.Vector3(Math.cos(a) * rr, (0.8 + 0.78 * h) * R, Math.sin(a) * rr * 1.1));
      }
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.022 * R, 4), M_GLOW);
      this.body.add(tube);
      this.cracks.push(tube);
    }
    // Кристаллы на спине.
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.6;
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.1 * R, (0.45 + 0.12 * (i % 3)) * R, 5), M_GLOW);
      c.position.set(Math.cos(a) * 0.45 * R - 0.1 * R, 1.55 * R, Math.sin(a) * 0.5 * R - 0.15 * R);
      c.rotation.set(Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4);
      this.body.add(c);
    }
    // Глаза: две светящиеся щели и ореол.
    this.eyes = [];
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.22 * R, 0.07 * R, 0.1 * R), M_GLOW);
      eye.position.set(s * 0.34 * R, 1.0 * R, 0.98 * R);
      eye.rotation.z = s * -0.35;
      const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: GREEN, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
      g.scale.setScalar(0.7 * R);
      g.position.copy(eye.position);
      g.position.z += 0.05 * R;
      this.body.add(eye, g);
      this.eyes.push(g);
    }

    // Лапы: четыре каменные тумбы.
    this.legs = [];
    for (const [sx, sz] of [[-1, 0.6], [1, 0.6], [-1, -0.55], [1, -0.55]]) {
      const l = boulder(0.28 * R, 0, sx * 3 + sz, M_STONE);
      l.scale.set(1, 1.5, 1);
      const g = new THREE.Group();
      g.position.set(sx * 0.75 * R, 0.32 * R, sz * R);
      g.add(l);
      this.group.add(g);
      this.legs.push({ g, ph: sx * 1.6 + sz * 2, baseZ: sz * R });
    }

    this.aura = new THREE.Mesh(
      new THREE.PlaneGeometry(4.2 * R, 4.2 * R),
      new THREE.MeshBasicMaterial({ map: glow(), color: GREEN, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.aura.rotation.x = -Math.PI / 2;
    this.aura.position.y = 0.02;
    this.group.add(this.aura);
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4 * R, 3.4 * R),
      new THREE.MeshBasicMaterial({ map: glow(), color: 0x0a0e1c, transparent: true, opacity: 0.45, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.01;
    this.group.add(this.shadow);

    this.yaw = 0;
    this.t = Math.random() * 10;
    this.ph = Math.random() * 6;
  }

  addTo(scene) { scene.add(this.group); }

  /** state: { x, z, vx, vz, face }; this.atk: { state: idle | windup | recovery, t }. */
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
    this.yaw += d * (1 - Math.exp(-dt / 0.3)); // тяжёлый: поворачивается медленно
    this.group.rotation.y = this.yaw;
    const pop = Math.min(1, (this.age === undefined ? 1 : this.age) / 0.4);
    this.group.scale.setScalar(0.6 + 0.4 * (1 - Math.pow(1 - pop, 3)));

    const S = this.def && this.def.slam;
    const w = st === 'windup' && S ? Math.min(1, this.atk.t / S.windup) : 0;
    const rec = st === 'recovery' && S ? Math.max(0, 1 - this.atk.t / 0.3) : 0; // сразу после удара: сплющен
    const lift = w * w * 0.7 * R;
    this.body.position.set(Math.sin(t * 60) * 0.03 * w * R, lift + (moving && st === 'idle' ? Math.abs(Math.sin(t * 3 + this.ph)) * 0.06 * R : 0), 0);
    this.body.scale.set(1 + 0.12 * rec - 0.04 * w, 1 - 0.2 * rec + 0.05 * w, 1 + 0.12 * rec - 0.04 * w);
    const heat = Math.max(w, rec * 0.8);
    for (const c of this.cracks) c.visible = true;
    M_GLOW.color.setRGB(0.4 + 0.6 * heat, 1, 0.6 + 0.4 * heat); // яркость трещин в замахе (общий материал: все скалы в замахе светятся одинаково)
    for (const e of this.eyes) e.material.opacity = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(t * 4 + this.ph)) + 0.3 * heat;
    this.aura.material.opacity = 0.35 + 0.1 * Math.sin(t * 2 + this.ph) + 0.4 * heat;
    for (const L of this.legs) {
      const ph = moving ? Math.sin(t * 4 + L.ph) : 0;
      L.g.position.z = L.baseZ + ph * 0.18 * R;
      L.g.position.y = 0.32 * R + Math.max(0, ph) * 0.12 * R + lift * 0.0;
    }
  }
}
