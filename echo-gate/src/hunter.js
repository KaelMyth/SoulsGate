// Жук-охотник в 3D (SoulsGate drawHunter): зелёный, узкий клин с острой головой-клинком и косыми светящимися глазами охотника.
// Худой и быстрый: низкий корпус, длинный нос, быстрые тонкие лапы, наклон вперёд на бегу. Радиус 0.37 м. Модель смотрит в +z.
import * as THREE from 'three';

const R = 0.42;
const SHELL = 0x2e8f3e;
const TOP = 0x58d65a;
const STRIPE = 0x14501f;
const HEAD = 0x1a4a22;
const LEG = 0x1f5a2a;
const EDGE = 0xc8ffb0;
const EYE = 0xffe94a;
const AURA = 0x5fff6a;

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

// Контур клина (вперёд, вбок) из SoulsGate: острый нос, узкая талия, широкая корма.
const OUT = [[1.5, 0], [0.5, -0.5], [-0.7, -0.62], [-1.1, 0], [-0.7, 0.62], [0.5, 0.5]];
const V = (x, y, z) => new THREE.Vector3(x, y, z);

const M_LEG = new THREE.MeshStandardMaterial({ color: LEG, roughness: 0.6, flatShading: true });
const M_HEAD = new THREE.MeshStandardMaterial({ color: HEAD, roughness: 0.5, flatShading: true });
const M_EDGE = new THREE.MeshBasicMaterial({ color: EDGE });
const G_LEG = new THREE.CylinderGeometry(0.018, 0.012, 1, 4);

function leg(a, b) {
  const d = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(G_LEG, M_LEG);
  m.scale.y = d.length();
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}

/** Панцирь-клин: основание по контуру, вверх сужается к хребту; верхние грани светлее. */
function makeShell() {
  const base = OUT.map(([f, s]) => V(s * R, 0.12 * R, f * R));
  const up = OUT.map(([f, s]) => V(s * R * 0.55, 0.62 * R, f * R * 0.8 - 0.05 * R));
  const apex = V(0, 0.78 * R, -0.05 * R);
  const pos = [], col = [];
  const cs = new THREE.Color(SHELL), ct = new THREE.Color(TOP);
  const tri = (a, b, c, color) => { for (const v of [a, b, c]) { pos.push(v.x, v.y, v.z); col.push(color.r, color.g, color.b); } };
  const n = OUT.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    tri(base[i], up[i], up[j], cs);
    tri(base[i], up[j], base[j], cs);
    tri(up[i], apex, up[j], i < 3 ? ct : cs);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.5, side: THREE.DoubleSide }));
}

export class Hunter {
  constructor() {
    this.group = new THREE.Group();
    this.body = new THREE.Group();
    this.group.add(this.body);
    this.body.add(makeShell());

    // Кайма по контуру и тёмная полоса вдоль спины.
    const rim = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(OUT.map(([f, s]) => V(s * R, 0.13 * R, f * R)), true, 'catmullrom', 0), 40, 0.01, 4, true), M_EDGE);
    this.body.add(rim);
    const stripe = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([
      V(0, 0.8 * R, 0.55 * R), V(-0.3 * R, 0.7 * R, -0.85 * R), V(0.3 * R, 0.7 * R, -0.85 * R),
    ]), new THREE.MeshBasicMaterial({ color: STRIPE, side: THREE.DoubleSide }));
    this.body.add(stripe);

    // Голова: длинный острый клин-клинок вперёд.
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.3 * R, 1.1 * R, 4), M_HEAD);
    head.rotation.x = Math.PI / 2;
    head.rotation.z = Math.PI / 4;
    head.scale.set(1.2, 1, 0.6);
    head.position.set(0, 0.3 * R, 1.15 * R);
    this.body.add(head);
    for (const s of [-1, 1]) { // острые жвалы-иглы по бокам носа
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.05 * R, 0.5 * R, 4), M_HEAD);
      m.rotation.x = Math.PI / 2;
      m.rotation.z = s * 0.25;
      m.position.set(s * 0.22 * R, 0.2 * R, 1.35 * R);
      this.body.add(m);
    }
    // Глаза охотника: узкие косые светящиеся щели.
    this.eyes = [];
    const eyeMat = new THREE.MeshBasicMaterial({ color: EYE });
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.BoxGeometry(0.34 * R, 0.05 * R, 0.07 * R), eyeMat);
      e.position.set(s * 0.22 * R, 0.42 * R, 0.78 * R);
      e.rotation.y = s * 0.55;
      this.body.add(e);
      const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color: 0xffe040, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
      g.scale.setScalar(0.7 * R);
      g.position.copy(e.position);
      this.body.add(g);
      this.eyes.push(g);
    }

    // Лапы: три пары тонких, быстрых.
    this.legs = [];
    for (let i = 0; i < 3; i++) {
      const lz = (0.4 - i * 0.55) * R;
      for (const s of [-1, 1]) {
        const g = new THREE.Group();
        g.position.set(s * 0.42 * R, 0.2 * R, lz);
        g.add(leg(V(0, 0, 0), V(s * 0.35 * R, 0.1 * R, -0.1 * R)));
        g.add(leg(V(s * 0.35 * R, 0.1 * R, -0.1 * R), V(s * 0.6 * R, -0.2 * R, -0.3 * R)));
        this.body.add(g);
        this.legs.push({ g, side: s, phase: i * 2.1 + (s > 0 ? Math.PI : 0), baseZ: lz });
      }
    }

    this.aura = new THREE.Mesh(
      new THREE.PlaneGeometry(4.6 * R, 4.6 * R),
      new THREE.MeshBasicMaterial({ map: glow(), color: AURA, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.aura.rotation.x = -Math.PI / 2;
    this.aura.position.y = 0.02;
    this.group.add(this.aura);
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2 * R, 3.2 * R),
      new THREE.MeshBasicMaterial({ map: glow(), color: 0x0a1410, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.008;
    this.group.add(this.shadow);

    this.yaw = 0;
    this.t = Math.random() * 10;
    this.ph = Math.random() * Math.PI * 2;
  }

  addTo(scene) { scene.add(this.group); }

  /** state: { x, z, vx, vz }; бежит по скорости, наклоняясь вперёд; лапы быстрые. */
  update(dt, state) {
    this.t += dt;
    const t = this.t;
    const moving = Math.hypot(state.vx, state.vz) > 0.05;
    this.group.position.set(state.x, 0, state.z);
    if (moving) {
      const target = Math.atan2(state.vx, state.vz);
      let d = (target - this.yaw) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      else if (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * (1 - Math.exp(-dt / 0.06));
    }
    this.group.rotation.y = this.yaw;
    const pop = Math.min(1, (this.age === undefined ? 1 : this.age) / 0.25);
    this.group.scale.setScalar(0.4 + 0.6 * (1 - Math.pow(1 - pop, 3)));
    for (const L of this.legs) {
      const w = moving ? Math.sin(t * 30 + this.ph + L.phase) : 0;
      L.g.position.z = L.baseZ + w * 0.25 * R;
      L.g.position.y = 0.2 * R + Math.max(0, w) * 0.12 * R;
    }
    this.body.rotation.x = moving ? 0.1 : 0; // наклон вперёд на бегу
    this.body.position.y = moving ? Math.abs(Math.sin(t * 15 + this.ph)) * 0.02 : 0;
    const f = 0.5 + 0.5 * Math.sin(t * 17 + this.ph * 2);
    for (const e of this.eyes) e.material.opacity = 0.6 + 0.35 * f;
    this.aura.material.opacity = 0.4 + 0.15 * f;
  }
}
