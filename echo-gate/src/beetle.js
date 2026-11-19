// Стандартный жук в 3D: перенос вида сверху из SoulsGate (render_renderer.js, drawBeetle).
// Тот же образ: тёмный угловатый панцирь (low-poly) со светлее верхними гранями, оранжевая кайма и раскалённый шов,
// язык пламени на спине, три пары лапок с коленом, усики, шестигранная голова с двумя светящимися глазами.
// Размер: радиус SoulsGate 12 ед. = 0.4 м. Модель смотрит в +z. Графика самодостаточна: из примитивов Three.js.
import * as THREE from 'three';

const R = 0.4;
const SHELL = 0x171e2d;
const SHELL_TOP = 0x2a3652;
const LEG = 0x3a4663;
const HEAD = 0x0f141f;
const ORANGE = 0xff7a2e;
const HOT = 0xff9a3c;
const EYE = 0xfff3b8;

// Контур панциря из 2D (x вперёд, y в сторону): в 3D вперёд это +z, в сторону это x.
const OUTLINE = [
  [0.56, -0.5], [0.1, -0.78], [-0.6, -0.62], [-0.98, -0.15], [-0.98, 0.15], [-0.6, 0.62], [0.1, 0.78], [0.56, 0.5],
].map(([f, s]) => new THREE.Vector3(s * R, 0, f * R));

function limb(a, b, radius, mat) {
  const d = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, d.length(), 6), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.4, 'rgba(255,255,255,0.3)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Панцирь: ступенчатая «пирамида» из граней с плоским затенением; верхние грани светлее. */
function makeShell() {
  const base = OUTLINE.map((p) => p.clone().setY(0.16 * R));
  const up = OUTLINE.map((p) => p.clone().multiplyScalar(0.7).setY(0.62 * R));
  const apex = new THREE.Vector3(-0.1 * R, 0.78 * R, 0);
  const pos = [];
  const col = [];
  const cs = new THREE.Color(SHELL);
  const ct = new THREE.Color(SHELL_TOP);
  const tri = (a, b, c, color) => {
    for (const v of [a, b, c]) { pos.push(v.x, v.y, v.z); col.push(color.r, color.g, color.b); }
  };
  const n = OUTLINE.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    // Боковая грань (две части), порядок вершин: нормаль наружу.
    tri(base[i], up[i], up[j], cs);
    tri(base[i], up[j], base[j], cs);
    // Верхние грани к вершине; левая половина (s<0) светлее для объёма.
    tri(up[i], apex, up[j], i < 4 ? ct : cs);
    // Днище.
    tri(base[i], base[j], new THREE.Vector3(0, 0.16 * R, 0), cs);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.6, side: THREE.DoubleSide }));
}

export class Beetle {
  constructor() {
    this.group = new THREE.Group();
    this.body = new THREE.Group();
    this.group.add(this.body);
    const glowTex = glowTexture();
    const emissive = (c, k = 1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k) });
    const legMat = new THREE.MeshStandardMaterial({ color: LEG, roughness: 0.7 });

    this.body.add(makeShell());

    // Оранжевая кайма по контуру (тонкая трубка) и раскалённый шов по спине.
    const rim = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(OUTLINE.map((p) => p.clone().setY(0.17 * R)), true, 'catmullrom', 0), 64, 0.012, 5, true),
      emissive(ORANGE),
    );
    this.body.add(rim);
    this.seam = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.012, 1.1 * R), emissive(HOT));
    this.seam.position.set(0, 0.74 * R, -0.45 * R);
    this.seam.rotation.x = 0.1;
    this.body.add(this.seam);

    // Язык пламени на спине: два конуса и свечение.
    this.flame = new THREE.Group();
    this.flame.position.set(0, 0.45 * R, -0.75 * R);
    const outer = new THREE.Mesh(new THREE.ConeGeometry(0.13 * R, 0.9 * R, 6), emissive(0xff6a1f));
    outer.rotation.x = -Math.PI / 2 - 0.25;
    outer.position.set(0, 0.1 * R, -0.35 * R);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.07 * R, 0.6 * R, 6), emissive(0xffc25a));
    inner.rotation.x = -Math.PI / 2 - 0.25;
    inner.position.set(0, 0.1 * R, -0.25 * R);
    this.flame.add(outer, inner);
    this.body.add(this.flame);

    // Жар под панцирем: оранжевое пятно на полу.
    this.heat = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2 * R, 3.2 * R),
      new THREE.MeshBasicMaterial({ map: glowTex, color: 0xff7a2e, transparent: true, opacity: 0.4, depthWrite: false }),
    );
    this.heat.rotation.x = -Math.PI / 2;
    this.heat.position.set(0, 0.01, -0.2 * R);
    this.heat.renderOrder = 1;
    this.group.add(this.heat);

    // Ноги: три пары, у каждой бедро, голень и колено (угловатые).
    this.legs = [];
    for (let i = 0; i < 3; i++) {
      const lz = (0.35 - i * 0.45) * R;
      for (const s of [-1, 1]) {
        const leg = new THREE.Group();
        leg.position.set(s * 0.45 * R, 0.2 * R, lz);
        const knee = new THREE.Vector3(s * 0.37 * R, 0.0, 0.18 * R);
        const foot = new THREE.Vector3(s * 0.55 * R, -0.18 * R, 0.0);
        const kneeUp = new THREE.Vector3(s * 0.40 * R, 0.0, 0.18 * R);
        leg.add(limb(new THREE.Vector3(), kneeUp.clone().setY(0.04 * R), 0.014, legMat));
        leg.add(limb(kneeUp.clone().setY(0.04 * R), new THREE.Vector3(s * 0.62 * R, -0.16 * R, 0.18 * R), 0.012, legMat));
        void knee; void foot;
        this.body.add(leg);
        this.legs.push({ g: leg, side: s, phase: i * 2.1 + (s > 0 ? Math.PI : 0), baseZ: lz });
      }
    }

    // Усики и голова.
    this.ants = [];
    for (const s of [-1, 1]) {
      const a = limb(new THREE.Vector3(0, 0, 0), new THREE.Vector3(s * 0.25 * R, 0.05 * R, 0.25 * R), 0.01, legMat);
      const holder = new THREE.Group();
      holder.position.set(s * 0.15 * R, 0.3 * R, 1.0 * R);
      holder.add(a);
      this.body.add(holder);
      this.ants.push({ g: holder, side: s });
    }
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.34 * R, 0.4 * R, 0.3 * R, 6), new THREE.MeshStandardMaterial({ color: HEAD, flatShading: true, roughness: 0.6 }));
    head.position.set(0, 0.3 * R, 0.75 * R);
    head.rotation.y = Math.PI / 6;
    head.scale.set(1.0, 1.0, 0.8);
    this.body.add(head);
    this.eyes = [];
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1 * R, 10, 8), emissive(EYE));
      eye.position.set(s * 0.17 * R, 0.4 * R, 0.98 * R);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffc25a, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.scale.set(0.6 * R, 0.6 * R, 1);
      glow.position.copy(eye.position).z += 0.06 * R;
      this.body.add(eye, glow);
      this.eyes.push(glow);
    }

    // Мягкая тень.
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(3.0 * R, 3.0 * R),
      new THREE.MeshBasicMaterial({ map: glowTex, color: 0x1e2440, transparent: true, opacity: 0.3, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.008;
    this.group.add(this.shadow);

    this.yaw = 0;
    this.t = Math.random() * 10;
    this.ph = Math.random() * Math.PI * 2;
    this.group.scale.setScalar(1);
  }

  addTo(scene) { scene.add(this.group); }

  /** state: { x, z, vx, vz }; поворачивается по скорости, а стоя ничего не ходит. */
  update(dt, state) {
    this.t += dt;
    const sp = Math.hypot(state.vx, state.vz);
    const moving = sp > 0.05;
    this.group.position.set(state.x, 0, state.z);
    if (moving) {
      const target = Math.atan2(state.vx, state.vz);
      let d = (target - this.yaw) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      else if (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * (1 - Math.exp(-dt / 0.08));
    }
    this.group.rotation.y = this.yaw;
    const t = this.t;
    const f1 = 0.5 + 0.5 * Math.sin(t * 14 + this.ph);
    const f2 = 0.5 + 0.5 * Math.sin(t * 19 + this.ph * 2);
    // Лапки: тренога (чередуем по фазе), поднятие и размах вперёд-назад.
    for (const L of this.legs) {
      const w = moving ? Math.sin(t * 22 + this.ph + L.phase) : 0;
      L.g.position.z = L.baseZ + w * 0.22 * R;
      L.g.position.y = 0.2 * R + Math.max(0, w) * 0.1 * R;
      L.g.rotation.y = w * 0.25 * L.side;
    }
    for (const A of this.ants) A.g.rotation.y = Math.sin(t * 7 + this.ph) * 0.12 * A.side;
    this.body.position.y = moving ? Math.abs(Math.sin(t * 11 + this.ph)) * 0.02 : 0;
    // Пламя качается, шов и глаза пульсируют.
    this.flame.rotation.y = Math.sin(t * 9 + this.ph) * 0.25;
    this.flame.scale.set(1, 1 + 0.15 * f1, 1 + 0.3 * f1);
    this.heat.material.opacity = 0.32 + 0.2 * f1;
    for (const e of this.eyes) e.material.opacity = 0.55 + 0.25 * f2;
  }
}
