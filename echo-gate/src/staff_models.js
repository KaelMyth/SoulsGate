// 3D-модели посохов мага (держатся в руке героя и стоят на витрине инвентаря). Хват в начале координат группы,
// низ на 0.42 ниже, верх около 1.5-1.9 выше. Каждая модель: { group, crystal, glow, update(t, k) }.
// crystal: светящийся камень на верхушке (отсюда вылетает снаряд, его яркость качает Hero), glow: ореол,
// update(t, k): анимация (k от 0 до 1: покой или бег и рывок). Только внешний вид: на атаку посохи пока не влияют.
import * as THREE from 'three';

const EYE = 0x35f2ff;

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o });
const basic = (color, o = {}) => new THREE.MeshBasicMaterial({ color, ...o });

function halo(glowTex, color, size, opacity) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.set(size, size, 1);
  return s;
}

function tube(points, r, mat, seg = 20) {
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z))), seg, r, 6), mat);
}

/** Общий ствол: цилиндр с хватом, у земли обойма. */
function shaftParts(group, woodMat, ferruleMat, gripMat) {
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.044, 1.92, 12), woodMat);
  shaft.position.y = (1.5 - 0.42) / 2;
  const ferrule = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 12), ferruleMat);
  ferrule.rotation.x = Math.PI;
  ferrule.position.y = -0.42 - 0.02;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 12), gripMat);
  group.add(shaft, ferrule, grip);
}

/** Прежний посох ученика: дерево, золотой воротник, завиток и бирюзовый кристалл. */
function basicStaff(glowTex, matBelt) {
  const group = new THREE.Group();
  const wood = std(0x7a5238, { roughness: 0.85 });
  const woodDark = std(0x5a3c28, { roughness: 0.9 });
  const gold = std(0xc9a25a, { roughness: 0.45, metalness: 0.5 });
  shaftParts(group, wood, woodDark, matBelt);
  const curl = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.03, 8, 22, Math.PI * 1.5), wood);
  curl.position.y = 1.58;
  curl.rotation.z = Math.PI * 0.75;
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.04, 0.07, 12), gold);
  collar.position.y = 1.5;
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.095, 0), std(EYE, { emissive: EYE, emissiveIntensity: 1.2, roughness: 0.2 }));
  crystal.scale.y = 1.4;
  crystal.position.y = 1.62;
  const glow = halo(glowTex, EYE, 0.75, 0.7);
  glow.position.y = 1.62;
  group.add(curl, collar, crystal, glow);
  return { group, crystal, glow, update() {} };
}

/** Огненный: обугленное древко с тлеющими кольцами, железная жаровня с когтями, живое пламя и искры. */
function fireStaff(glowTex, matBelt) {
  const group = new THREE.Group();
  const char = std(0x2a1812, { roughness: 0.95 });
  const iron = std(0x3b3030, { roughness: 0.45, metalness: 0.7 });
  const ember = basic(0xff7a24);
  shaftParts(group, char, iron, matBelt);
  for (const y of [-0.05, 0.35, 0.75, 1.15]) { // тлеющие трещины-кольца
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.009, 6, 18), ember);
    r.rotation.x = Math.PI / 2;
    r.position.y = y;
    group.add(r);
  }
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.045, 0.1, 12), iron);
  collar.position.y = 1.52;
  group.add(collar);
  // Жаровня: пять изогнутых когтей вверх.
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    group.add(tube([[c * 0.05, 1.55, s * 0.05], [c * 0.15, 1.68, s * 0.15], [c * 0.13, 1.84, s * 0.13], [c * 0.07, 1.95, s * 0.07]], 0.016, iron, 14));
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.06, 6), ember);
    tip.position.set(c * 0.07, 1.97, s * 0.07);
    group.add(tip);
  }
  const crystal = new THREE.Mesh(new THREE.IcosahedronGeometry(0.075, 0), std(0xff7a24, { emissive: 0xff5a10, emissiveIntensity: 1.2, roughness: 0.3 }));
  crystal.scale.y = 1.25;
  crystal.position.y = 1.72;
  const flameOuter = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.62, 8, 1, true), basic(0xff6a1f, { transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
  const flameInner = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.44, 8, 1, true), basic(0xffd36a, { transparent: true, opacity: 0.95, side: THREE.DoubleSide }));
  flameOuter.position.y = 2.02;
  flameInner.position.y = 1.92;
  const glow = halo(glowTex, 0xff8a2e, 1.3, 0.75);
  glow.position.y = 1.9;
  const sparks = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.014, 0), basic(0xffc060));
    group.add(m);
    sparks.push({ m, a: Math.random() * 6.28, ph: Math.random(), sp: 0.5 + Math.random() * 0.5 });
  }
  group.add(crystal, flameOuter, flameInner, glow);
  return {
    group, crystal, glow,
    update(t, k) {
      const f = 1 + 0.12 * Math.sin(t * 13) + 0.07 * Math.sin(t * 23 + 1) + k * 0.12;
      flameOuter.scale.set(1 + 0.05 * Math.sin(t * 17), f, 1 + 0.05 * Math.cos(t * 15));
      flameInner.scale.set(1, f * 1.1, 1);
      flameOuter.rotation.y = t * 2;
      flameOuter.position.y = 2.02 + (f - 1) * 0.2;
      for (const s of sparks) {
        const u = (t * s.sp + s.ph) % 1;
        s.m.position.set(Math.cos(s.a + t) * (0.05 + u * 0.1), 1.8 + u * 0.55, Math.sin(s.a + t) * (0.05 + u * 0.1));
        s.m.scale.setScalar(1 - u);
      }
    },
  };
}

/** Ледяной: серебристо-голубое древко с белой спиралью, корона из ледяных кристаллов и парящие льдинки. */
function iceStaff(glowTex, matBelt) {
  const group = new THREE.Group();
  const steel = std(0x9cc0de, { roughness: 0.3, metalness: 0.55 });
  const fur = std(0xf1f8ff, { roughness: 1 });
  const frostW = std(0xeaf8ff, { roughness: 0.4 });
  shaftParts(group, steel, steel, fur);
  const helix = [];
  for (let i = 0; i <= 40; i++) { const y = -0.2 + (i / 40) * 1.6; const a = i * 0.55; helix.push([Math.cos(a) * 0.05, y, Math.sin(a) * 0.05]); }
  group.add(tube(helix, 0.011, frostW, 80));
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.045, 0.08, 6), steel);
  collar.position.y = 1.52;
  group.add(collar);
  const iceMat = std(0xbdeeff, { emissive: 0x4cc4ff, emissiveIntensity: 0.7, roughness: 0.08, metalness: 0.1, flatShading: true, transparent: true, opacity: 0.93 });
  const shard = (h, r) => new THREE.LatheGeometry([[0.0001, 0], [r, h * 0.18], [r * 0.9, h * 0.7], [0.0001, h]].map(([x, y]) => new THREE.Vector2(x, y)), 6);
  const crystal = new THREE.Mesh(shard(0.5, 0.075), iceMat);
  crystal.position.y = 1.54;
  group.add(crystal);
  for (let i = 0; i < 5; i++) { // корона: пять осколков наружу
    const a = (i / 5) * Math.PI * 2;
    const m = new THREE.Mesh(shard(0.27, 0.045), iceMat);
    m.position.set(Math.cos(a) * 0.07, 1.54, Math.sin(a) * 0.07);
    m.rotation.set(Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55);
    group.add(m);
  }
  const glow = halo(glowTex, 0xaee9ff, 0.9, 0.65);
  glow.position.y = 1.76;
  const floaters = [];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.03, 0).scale(1, 1.6, 1), iceMat);
    group.add(m);
    floaters.push({ m, a: (i / 3) * 6.28, r: 0.2 + 0.03 * i });
  }
  group.add(glow);
  return {
    group, crystal, glow,
    update(t, k) {
      crystal.rotation.y = t * 0.6;
      for (const f of floaters) {
        const a = f.a + t * (0.8 + k * 0.6);
        f.m.position.set(Math.cos(a) * f.r, 1.78 + Math.sin(t * 1.7 + f.a) * 0.07, Math.sin(a) * f.r);
        f.m.rotation.y = t * 2;
      }
      glow.material.opacity = 0.55 + 0.1 * Math.sin(t * 2);
    },
  };
}

/** Электрический: стальное древко с медными катушками, вилка-разрядник и яркий шар между зубцами, вспыхивают дуги. */
function electricStaff(glowTex, matBelt) {
  const group = new THREE.Group();
  const steel = std(0x3a4256, { roughness: 0.35, metalness: 0.7 });
  const copper = std(0xc9742f, { roughness: 0.35, metalness: 0.8 });
  shaftParts(group, steel, copper, matBelt);
  for (let i = 0; i < 5; i++) { // медная катушка под головой
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.014, 6, 16), copper);
    r.rotation.x = Math.PI / 2;
    r.position.y = 1.05 + i * 0.075;
    group.add(r);
  }
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.1, 10), copper);
  collar.position.y = 1.52;
  group.add(collar);
  const tips = [];
  for (const s of [-1, 1]) { // вилка: два изогнутых зубца
    group.add(tube([[s * 0.03, 1.55, 0], [s * 0.15, 1.7, 0], [s * 0.17, 1.88, 0], [s * 0.07, 2.0, 0]], 0.017, steel, 16));
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.07, 6), copper);
    tip.position.set(s * 0.07, 2.02, 0);
    group.add(tip);
    tips.push(new THREE.Vector3(s * 0.07, 2.0, 0), new THREE.Vector3(s * 0.17, 1.8, 0));
  }
  const crystal = new THREE.Mesh(new THREE.IcosahedronGeometry(0.085, 1), std(0xfff0a0, { emissive: 0xffe060, emissiveIntensity: 1.3, roughness: 0.2 }));
  crystal.position.y = 1.8;
  const glow = halo(glowTex, 0xffe27a, 0.95, 0.7);
  glow.position.y = 1.8;
  const glow2 = halo(glowTex, 0xa98bff, 1.3, 0.28);
  glow2.position.y = 1.8;
  // Дуги: три ломаные линии от шара к зубцам, перегенерируются несколько раз в секунду.
  const arcs = [];
  const arcMat = new THREE.LineBasicMaterial({ color: 0xfff6c0, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  for (let i = 0; i < 4; i++) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(7 * 3), 3));
    const line = new THREE.Line(g, arcMat);
    line.frustumCulled = false;
    group.add(line);
    arcs.push({ g, to: tips[i] });
  }
  group.add(crystal, glow2, glow);
  let nextArc = 0;
  const center = new THREE.Vector3(0, 1.8, 0);
  const regen = () => {
    for (const a of arcs) {
      const p = a.g.attributes.position;
      for (let i = 0; i < 7; i++) {
        const u = i / 6;
        const j = (i === 0 || i === 6) ? 0 : 0.045;
        p.setXYZ(i, center.x + (a.to.x - center.x) * u + (Math.random() - 0.5) * j * 2,
          center.y + (a.to.y - center.y) * u + (Math.random() - 0.5) * j * 2,
          center.z + (a.to.z - center.z) * u + (Math.random() - 0.5) * j * 2 + (i === 0 || i === 6 ? 0 : (Math.random() - 0.5) * 0.04));
      }
      p.needsUpdate = true;
    }
  };
  regen();
  return {
    group, crystal, glow,
    update(t, k) {
      if (t >= nextArc) { regen(); nextArc = t + 0.06 + Math.random() * 0.06 - k * 0.03; }
      arcMat.opacity = 0.55 + 0.45 * Math.abs(Math.sin(t * 31));
      glow.material.opacity = 0.55 + 0.25 * Math.sin(t * 19) + 0.1 * Math.sin(t * 41);
      glow2.material.opacity = 0.2 + 0.1 * Math.sin(t * 7);
      crystal.rotation.y = t * 3;
    },
  };
}

const BUILDERS = { basic: basicStaff, fire: fireStaff, ice: iceStaff, electric: electricStaff };

/** variant: 'basic' (по умолчанию) | 'fire' | 'ice' | 'electric'. */
export function buildStaffModel(variant, glowTex, matBelt) {
  return (BUILDERS[variant] || basicStaff)(glowTex, matBelt);
}
