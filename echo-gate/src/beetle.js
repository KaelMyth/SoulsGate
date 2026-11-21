// Стандартный жук в 3D, грозная версия: тёмный угловатый панцирь с шипами и раскалённым швом, оранжевая кайма,
// язык пламени на спине, массивные жвалы, четыре злых светящихся глаза, три пары высоких паучьих лап с когтями.
// Размер: SoulsGate 12 ед. = 0.4 м, здесь крупнее (R = 0.55 м), чтобы читался с отдалённой камеры. Модель смотрит в +z.
import * as THREE from 'three';

const R = 0.55;
// Алый жук: багровый панцирь, раскалённый шов и красное свечение вокруг, жёлтые глаза.
const SHELL = 0x4a0f18;
const SHELL_TOP = 0xb3202e;
const LEG = 0x5a1620;
const HEAD = 0x2a080d;
const ORANGE = 0xff4a3a;
const HOT = 0xff7a55;
const EYE = 0xffd84a;
const AURA = 0xff2a3a;
const BONE = 0xd9c7a3;

const OUTLINE = [
  [0.56, -0.5], [0.1, -0.78], [-0.6, -0.62], [-0.98, -0.15], [-0.98, 0.15], [-0.6, 0.62], [0.1, 0.78], [0.56, 0.5],
].map(([f, s]) => new THREE.Vector3(s * R * 1.12, 0, f * R * 1.05)); // панцирь плотнее: шире и длиннее

const V = (x, y, z) => new THREE.Vector3(x, y, z);
let glowTex = null;
function glowTexture() {
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

/** Цилиндр-конус между двумя точками (r0 у a, r1 у b). */
function limb(a, b, r0, r1, mat, seg = 6) {
  const d = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, d.length(), seg), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}

/** Шип: конус с основанием в точке p, смотрит по направлению dir. */
function spike(p, dir, rad, len, mat) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(rad, len, 5), mat);
  const d = dir.clone().normalize();
  m.position.copy(p).addScaledVector(d, len / 2);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
  return m;
}


// Склейка: у жука было ~55 мешей (по вызову отрисовки на каждый). Статические куски склеиваем в два меша на узел
// (освещаемые и светящиеся), цвета уходят в цвета вершин. Материалы общие для всех жуков.
const LIT = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.55, side: THREE.DoubleSide });
const EMI = new THREE.MeshBasicMaterial({ vertexColors: true });

function bake(root) {
  const lit = [];
  const emi = [];
  for (const m of [...root.children]) {
    if (!m.isMesh) continue;
    m.updateMatrix();
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    g.applyMatrix4(m.matrix);
    g.computeVertexNormals();
    const n = g.attributes.position.count;
    let colors = g.attributes.color ? Array.from(g.attributes.color.array) : null;
    if (!colors) {
      const c = m.material.color;
      colors = [];
      for (let i = 0; i < n; i++) colors.push(c.r, c.g, c.b);
    }
    (m.material.isMeshBasicMaterial ? emi : lit).push({ g, colors });
    root.remove(m);
  }
  for (const [list, mat] of [[lit, LIT], [emi, EMI]]) {
    if (!list.length) continue;
    const pos = [];
    const nor = [];
    const col = [];
    for (const { g, colors } of list) {
      pos.push(...g.attributes.position.array);
      nor.push(...g.attributes.normal.array);
      col.push(...colors);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    root.add(new THREE.Mesh(geo, mat));
  }
}

const PROFILE = { base: 0.1 * R, up: 0.9 * R, apex: 1.12 * R }; // ниже посадка, выше и полнее горб

/** Панцирь: грани с плоским затенением, высокий горб. Верхние грани светлее. */
function makeShell() {
  const base = OUTLINE.map((p) => p.clone().setY(PROFILE.base));
  const up = OUTLINE.map((p) => p.clone().multiplyScalar(0.86).setY(PROFILE.up));
  const apex = V(-0.1 * R, PROFILE.apex, 0);
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
    tri(base[i], up[i], up[j], cs);
    tri(base[i], up[j], base[j], cs);
    tri(up[i], apex, up[j], i < 4 ? ct : cs);
    tri(base[i], base[j], V(0, PROFILE.base, 0), cs);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.55, side: THREE.DoubleSide }));
}

/** Высота панциря на оси (x=0) в точке z, по тем же граням. */
function spineY(z) {
  const zf = 0.56 * 0.86 * R;
  const zb = -0.98 * 0.86 * R;
  const za = -0.1 * R;
  if (z >= za) return PROFILE.apex - (PROFILE.apex - PROFILE.up) * Math.min(1, (z - za) / (zf - za));
  return PROFILE.apex - (PROFILE.apex - PROFILE.up) * Math.min(1, (za - z) / (za - zb));
}

export class Beetle {
  constructor() {
    this.group = new THREE.Group();
    this.body = new THREE.Group();
    this.group.add(this.body);
    const tex = glowTexture();
    const emissive = (c, k = 1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k) });
    const legMat = new THREE.MeshStandardMaterial({ color: LEG, roughness: 0.6, flatShading: true });
    const darkMat = new THREE.MeshStandardMaterial({ color: HEAD, roughness: 0.55, flatShading: true });
    const boneMat = new THREE.MeshStandardMaterial({ color: BONE, roughness: 0.5, flatShading: true });
    const hotMat = emissive(ORANGE);

    this.body.add(makeShell());

    // Кайма, продольный и два поперечных раскалённых шва.
    this.body.add(new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(OUTLINE.map((p) => p.clone().setY(PROFILE.base + 0.01)), true, 'catmullrom', 0), 64, 0.018, 5, true),
      hotMat,
    ));
    const spineSeam = [];
    for (let z = 0.35 * R; z >= -0.65 * R; z -= 0.1 * R) spineSeam.push(V(0, spineY(z) + 0.01, z));
    this.seam = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(spineSeam), 16, 0.012, 4), emissive(HOT));
    this.body.add(this.seam);
    for (const z of [0.05 * R, -0.4 * R]) {
      const pts = [];
      for (let s = -1; s <= 1.01; s += 0.25) {
        const k = 0.72 * 0.7 * (1 - Math.abs(s) * 0.9);
        pts.push(V(s * 0.62 * R, PROFILE.base + 0.05 * R + (spineY(z) - PROFILE.base - 0.05 * R) * Math.max(0, 1 - Math.abs(s) * 0.82) + 0.005 + k * 0, z));
      }
      this.body.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.009, 4), emissive(HOT, 0.9)));
    }

    // Шипы по хребту (кончики раскалены) и боковые плечевые.
    const tipMat = emissive(0xff6a1f);
    const sp = [[0.3, 0.07, 0.3], [0.05, 0.085, 0.4], [-0.2, 0.08, 0.38], [-0.45, 0.07, 0.34], [-0.7, 0.06, 0.28]];
    for (const [z, rad, len] of sp) {
      const p = V(0, spineY(z * R) - 0.02, z * R);
      this.body.add(spike(p, V(0, 1, -0.55), rad * R * 1.6, len * R * 1.5, darkMat));
      this.body.add(spike(p.clone().add(V(0, len * 1.5 * R * 0.62, -len * 1.5 * R * 0.34)), V(0, 1, -0.55), rad * R * 0.9, len * R * 0.6, tipMat));
    }
    for (const s of [-1, 1]) {
      for (const [z, y, ang] of [[0.25, 0.5, 0.5], [-0.35, 0.5, 0.35]]) {
        const p = V(s * 0.58 * R, y * R, z * R);
        this.body.add(spike(p, V(s, 0.9, 0.15), 0.07 * R, 0.4 * R, darkMat));
        this.body.add(spike(p.clone().add(V(s * 0.3 * R, 0.27 * R, 0.05 * R)), V(s, 0.9, 0.15), 0.04 * R, 0.16 * R, tipMat));
        void ang;
      }
    }

    // Язык пламени на спине.
    this.flame = new THREE.Group();
    this.flame.position.set(0, 0.5 * R, -0.8 * R);
    const outer = new THREE.Mesh(new THREE.ConeGeometry(0.2 * R, 1.2 * R, 6), emissive(0xff6a1f));
    outer.rotation.x = -Math.PI / 2 - 0.5;
    outer.position.set(0, 0.25 * R, -0.45 * R);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.1 * R, 0.8 * R, 6), emissive(0xffc25a));
    inner.rotation.x = -Math.PI / 2 - 0.5;
    inner.position.set(0, 0.22 * R, -0.35 * R);
    this.flame.add(outer, inner);
    this.body.add(this.flame);

    // Жар под телом.
    this.heat = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4 * R, 3.4 * R),
      new THREE.MeshBasicMaterial({ map: tex, color: 0xff3344, transparent: true, opacity: 0.45, depthWrite: false }),
    );
    this.heat.rotation.x = -Math.PI / 2;
    this.heat.position.set(0, 0.01, -0.1 * R);
    this.heat.renderOrder = 1;
    this.group.add(this.heat);

    // Паучьи лапы: бедро вверх-наружу, высокое колено, голень вниз-наружу с когтем.
    this.legs = [];
    for (let i = 0; i < 3; i++) {
      const lz = (0.35 - i * 0.5) * R;
      const reach = [0.3, 0.05, -0.2][i] * R;
      for (const s of [-1, 1]) {
        const leg = new THREE.Group();
        leg.position.set(0, 0, lz);
        const hip = V(s * 0.55 * R, 0.26 * R, 0);
        const knee = V(s * 0.85 * R, 0.5 * R, reach * 0.4 + (i === 0 ? 0.12 * R : 0));
        const foot = V(s * 1.08 * R, 0.0, reach * 0.8 + (i === 0 ? 0.22 * R : i === 2 ? -0.1 * R : 0.06 * R)); // лапы короче и ближе к телу
        leg.add(limb(hip, knee, 0.055 * R, 0.04 * R, legMat));
        leg.add(limb(knee, foot, 0.04 * R, 0.014 * R, legMat));
        leg.add(spike(foot, V(s * 0.3, -1, 0.35), 0.03 * R, 0.14 * R, boneMat));
        const joint = new THREE.Mesh(new THREE.SphereGeometry(0.06 * R, 6, 5), darkMat);
        joint.position.copy(knee);
        leg.add(joint);
        this.body.add(leg);
        this.legs.push({ g: leg, side: s, phase: i * 2.1 + (s > 0 ? Math.PI : 0), baseZ: lz, i });
        leg.position.z = lz;
        // Узлы построены относительно z = 0 группы.
      }
    }

    // Голова: клин, жвалы-клешни, четыре злых глаза, усики.
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.52 * R, 0.8 * R, 5), darkMat);
    head.rotation.x = Math.PI / 2;
    head.position.set(0, 0.32 * R, 0.88 * R);
    head.scale.set(1.1, 1, 0.75);
    this.body.add(head);
    this.mand = [];
    for (const s of [-1, 1]) {
      const m = new THREE.Group();
      m.position.set(s * 0.2 * R, 0.2 * R, 1.2 * R);
      m.add(limb(V(0, 0, 0), V(s * 0.12 * R, 0, 0.35 * R), 0.07 * R, 0.05 * R, boneMat, 5));
      m.add(limb(V(s * 0.12 * R, 0, 0.35 * R), V(-s * 0.1 * R, 0, 0.75 * R), 0.05 * R, 0.005 * R, boneMat, 5));
      m.add(spike(V(s * 0.08 * R, 0, 0.5 * R), V(-s * 0.2, 0.3, 0.2), 0.03 * R, 0.14 * R, boneMat));
      this.body.add(m);
      this.mand.push({ g: m, side: s });
    }
    this.eyes = [];
    const eyeMat = emissive(EYE);
    for (const s of [-1, 1]) {
      const big = new THREE.Mesh(new THREE.BoxGeometry(0.24 * R, 0.07 * R, 0.07 * R), eyeMat);
      big.position.set(s * 0.2 * R, 0.5 * R, 1.08 * R);
      big.rotation.z = -s * 0.5; // брови вниз к центру
      const small = new THREE.Mesh(new THREE.SphereGeometry(0.05 * R, 6, 5), eyeMat);
      small.position.set(s * 0.3 * R, 0.36 * R, 1.0 * R);
      this.body.add(big, small);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xffb21a, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.scale.set(0.8 * R, 0.8 * R, 1);
      glow.position.copy(big.position);
      glow.position.z += 0.05 * R;
      this.body.add(glow);
      this.eyes.push(glow);
    }
    this.ants = [];
    for (const s of [-1, 1]) {
      const h = new THREE.Group();
      h.position.set(s * 0.12 * R, 0.5 * R, 1.15 * R);
      h.add(limb(V(0, 0, 0), V(s * 0.3 * R, 0.25 * R, 0.4 * R), 0.02 * R, 0.008 * R, legMat, 4));
      this.body.add(h);
      this.ants.push({ g: h, side: s });
    }

    // Свечение: мягкое алое пятно на земле вокруг жука (аддитивно), пульсирует.
    this.aura = new THREE.Mesh(
      new THREE.PlaneGeometry(5.2 * R, 5.2 * R),
      new THREE.MeshBasicMaterial({ map: tex, color: AURA, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.aura.rotation.x = -Math.PI / 2;
    this.aura.position.y = 0.02;
    this.group.add(this.aura);
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(5.2 * R, 5.2 * R),
      new THREE.MeshBasicMaterial({ map: tex, color: 0x0a0e1c, transparent: true, opacity: 0.4, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.008;
    this.group.add(this.shadow);

    // Склейка статических деталей: тело, ноги, жвалы, усики, пламя.
    bake(this.body);
    for (const L of this.legs) bake(L.g);
    for (const M of this.mand) bake(M.g);
    for (const A of this.ants) bake(A.g);
    bake(this.flame);

    this.yaw = 0;
    this.t = Math.random() * 10;
    this.ph = Math.random() * Math.PI * 2;
  }

  addTo(scene) { scene.add(this.group); }

  /** state: { x, z, vx, vz }; поворачивается по скорости, а стоя шевелит жвалами и пламенем. */
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
    // Появление: жук «выскакивает» из мелкого в полный размер.
    const pop = Math.min(1, (this.age === undefined ? 1 : this.age) / 0.25);
    this.group.scale.setScalar(0.4 + 0.6 * (1 - Math.pow(1 - pop, 3)));
    const t = this.t;
    const f1 = 0.5 + 0.5 * Math.sin(t * 14 + this.ph);
    const f2 = 0.5 + 0.5 * Math.sin(t * 19 + this.ph * 2);
    for (const L of this.legs) {
      const w = moving ? Math.sin(t * 16 + this.ph + L.phase) : Math.sin(t * 2.2 + this.ph + L.phase) * 0.12;
      L.g.position.z = L.baseZ + w * 0.22 * R;
      L.g.position.y = Math.max(0, w) * 0.12 * R;
      L.g.rotation.y = w * 0.2 * L.side;
    }
    // Жвалы щёлкают, усики подрагивают, тело покачивается в охотничьей стойке.
    const snap = Math.max(0, Math.sin(t * 5 + this.ph)) ** 6;
    for (const M of this.mand) M.g.rotation.y = -M.side * (0.12 + 0.45 * snap);
    for (const A of this.ants) A.g.rotation.y = Math.sin(t * 9 + this.ph) * 0.18 * A.side;
    this.body.position.y = moving ? Math.abs(Math.sin(t * 9 + this.ph)) * 0.03 : Math.sin(t * 3 + this.ph) * 0.008;
    this.body.rotation.x = Math.sin(t * 3 + this.ph) * 0.03;
    this.flame.rotation.y = Math.sin(t * 9 + this.ph) * 0.3;
    this.flame.scale.set(1, 1 + 0.2 * f1, 1 + 0.35 * f1);
    this.heat.material.opacity = 0.36 + 0.22 * f1;
    for (const e of this.eyes) e.material.opacity = 0.65 + 0.3 * f2;
    this.aura.material.opacity = 0.55 + 0.25 * f1;
  }
}
