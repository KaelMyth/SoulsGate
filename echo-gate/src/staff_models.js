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

/** Огненный посох, три ступени (+0..4 / +5..9 / +10): жаровня с малым пламенем; раскалённая жаровня с кольцом угольков; живое пламя: огненный шар над жаровней с малыми шарами и язычками. */
function fireStaff(glowTex, matBelt, tier = 0) {
  const group = new THREE.Group();
  const char = std(0x2a1812, { roughness: 0.95 });
  const iron = std(0x3b3030, { roughness: 0.45, metalness: 0.7 });
  const ember = basic(tier === 2 ? 0xffb040 : 0xff7a24);
  shaftParts(group, char, iron, matBelt);
  const cracks = tier === 0 ? [0.35, 1.15] : tier === 1 ? [-0.05, 0.35, 0.75, 1.15] : [-0.15, 0.15, 0.45, 0.75, 1.05, 1.3];
  for (const y of cracks) { // тлеющие трещины-кольца: на высшей ступени раскалены сильнее
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.046, tier === 2 ? 0.015 : 0.009, 6, 18), ember);
    r.rotation.x = Math.PI / 2;
    r.position.y = y;
    group.add(r);
  }
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.045, 0.1, 12), iron);
  collar.position.y = 1.52;
  group.add(collar);
  // Жаровня: когти вверх, ступень 0 три коротких, 1 пять, 2 семь разведённых широко.
  const nClaws = [3, 5, 7][tier];
  const spread = [0.12, 0.15, 0.24][tier];
  const topY = [1.82, 1.95, 2.05][tier];
  for (let i = 0; i < nClaws; i++) {
    const a = (i / nClaws) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    group.add(tube([[c * 0.05, 1.55, s * 0.05], [c * spread, 1.68, s * spread], [c * spread * 0.85, (1.68 + topY) / 2 + 0.05, s * spread * 0.85], [c * (spread * 0.5), topY, s * (spread * 0.5)]], tier === 2 ? 0.02 : 0.016, iron, 14));
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.02, tier === 2 ? 0.09 : 0.06, 6), ember);
    tip.position.set(c * spread * 0.5, topY + 0.02, s * spread * 0.5);
    group.add(tip);
  }
  const crystal = new THREE.Mesh(new THREE.IcosahedronGeometry([0.06, 0.075, 0.09][tier], 0), std(0xff7a24, { emissive: 0xff5a10, emissiveIntensity: 1.2, roughness: 0.3 }));
  crystal.scale.y = 1.25;
  crystal.position.y = [1.68, 1.72, 1.78][tier];
  const fs = [0.7, 1.1, 0.95][tier]; // размер пламени
  const flameOuter = new THREE.Mesh(new THREE.ConeGeometry(0.18 * fs, 0.62 * fs, 8, 1, true), basic(0xff6a1f, { transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
  const flameInner = new THREE.Mesh(new THREE.ConeGeometry(0.1 * fs, 0.44 * fs, 8, 1, true), basic(0xffd36a, { transparent: true, opacity: 0.95, side: THREE.DoubleSide }));
  const baseY = [1.88, 2.02, 1.9][tier];
  flameOuter.position.y = baseY;
  flameInner.position.y = baseY - 0.1;
  const glow = halo(glowTex, tier === 2 ? 0xff5a14 : 0xff8a2e, [1.0, 1.5, 2.3][tier], [0.6, 0.8, 0.9][tier]);
  glow.position.y = 1.9 + 0.05 * tier;
  const sparks = [];
  const nS = [4, 8, 14][tier];
  for (let i = 0; i < nS; i++) {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.014 + 0.004 * tier, 0), basic(0xffc060));
    group.add(m);
    sparks.push({ m, a: Math.random() * 6.28, ph: Math.random(), sp: 0.5 + Math.random() * 0.5 });
  }
  group.add(crystal, flameOuter, flameInner, glow);
  // Ступень +5: ярче горит и по кольцу вокруг пламени бегут угольки. Ступень +10: над жаровней висит живой огненный шар,
  // вокруг него три малых шара и язычки; с шара срываются капли огня.
  const orbs = [];
  let lifeBall = null, lifeCore = null, lifeHalo = null;
  if (tier === 1) {
    for (let i = 0; i < 4; i++) { const m = halo(glowTex, 0xffa030, 0.14, 0.9); group.add(m); orbs.push({ m, a: (i / 4) * 6.28, r: 0.26, h: 0 }); }
  }
  if (tier === 2) {
    lifeBall = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 1), basic(0xff5a14, { transparent: true, opacity: 0.8 }));
    lifeBall.position.y = 2.36;
    lifeCore = halo(glowTex, 0xfff0b0, 0.34, 1);
    lifeCore.position.y = 2.36;
    lifeHalo = halo(glowTex, 0xff6a1f, 0.9, 0.9);
    lifeHalo.position.y = 2.36;
    group.add(lifeBall, lifeCore, lifeHalo);
    for (let i = 0; i < 3; i++) { const m = halo(glowTex, 0xffb040, 0.17, 0.95); group.add(m); orbs.push({ m, a: (i / 3) * 6.28, r: 0.36, h: 0.05 }); }
    for (let i = 0; i < 6; i++) { // язычки вокруг шара
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.2, 5), basic(0xff8a2a, { transparent: true, opacity: 0.8 }));
      group.add(m);
      orbs.push({ m, a: (i / 6) * 6.28, r: 0.2, h: 0.0, tongue: true });
    }
  }
  return {
    group, crystal, glow,
    update(t, k) {
      const f = 1 + 0.12 * Math.sin(t * 13) + 0.07 * Math.sin(t * 23 + 1) + k * 0.12;
      flameOuter.scale.set(1 + 0.05 * Math.sin(t * 17), f, 1 + 0.05 * Math.cos(t * 15));
      flameInner.scale.set(1, f * 1.1, 1);
      flameOuter.rotation.y = t * 2;
      flameOuter.position.y = baseY + (f - 1) * 0.2 * fs;
      for (const s of sparks) {
        const u = (t * s.sp + s.ph) % 1;
        const rr = (0.05 + u * 0.1) * (1 + tier * 0.8);
        s.m.position.set(Math.cos(s.a + t) * rr, 1.8 + u * (0.55 + 0.4 * tier), Math.sin(s.a + t) * rr);
        s.m.scale.setScalar(1 - u);
      }
      for (const o of orbs) {
        const a = o.a + t * (o.tongue ? 1.4 : 2.2);
        const cy = tier === 2 ? 2.36 : 2.0;
        if (o.tongue) {
          o.m.position.set(Math.cos(a) * o.r, cy + 0.06 * Math.sin(t * 6 + o.a), Math.sin(a) * o.r);
          o.m.rotation.set(Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2);
          o.m.scale.y = 1 + 0.4 * Math.sin(t * 11 + o.a * 3);
        } else {
          o.m.position.set(Math.cos(a) * o.r, cy + o.h + 0.05 * Math.sin(t * 3 + o.a), Math.sin(a) * o.r);
        }
      }
      if (lifeBall) {
        const p = 1 + 0.1 * Math.sin(t * 9) + 0.05 * Math.sin(t * 19);
        lifeBall.scale.setScalar(p);
        lifeBall.rotation.set(t * 1.3, t * 1.9, 0);
        lifeCore.scale.set(0.34 * p, 0.34 * p, 1);
        lifeHalo.material.opacity = 0.75 + 0.15 * Math.sin(t * 7);
      }
    },
  };
}

/** Снежинка (шестилучевая) для спрайтов ледяного посоха и снаряда. */
let snowTex = null;
export function snowflakeTexture() {
  if (snowTex) return snowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.translate(64, 64);
  g.strokeStyle = '#fff'; g.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    g.save(); g.rotate((i * Math.PI) / 3);
    g.lineWidth = 6; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -54); g.stroke();
    g.lineWidth = 4;
    for (const y of [-20, -36]) { g.beginPath(); g.moveTo(0, y); g.lineTo(-12, y - 11); g.moveTo(0, y); g.lineTo(12, y - 11); g.stroke(); }
    g.restore();
  }
  snowTex = new THREE.CanvasTexture(c);
  snowTex.colorSpace = THREE.SRGBColorSpace;
  return snowTex;
}

/** Ледяной посох, три ступени (+0..4 / +5..9 / +10): осколок; крупный кристалл с короной и сосульками; ледяная корона с остриём, кольцом кристаллов и снежинками. */
function iceStaff(glowTex, matBelt, tier = 0) {
  const group = new THREE.Group();
  const steel = std(0x9cc0de, { roughness: 0.3, metalness: 0.55 });
  const fur = std(0xf1f8ff, { roughness: 1 });
  const frostW = std(0xeaf8ff, { roughness: 0.4 });
  shaftParts(group, steel, steel, fur);
  const helix = [];
  for (let i = 0; i <= 40; i++) { const y = -0.2 + (i / 40) * 1.6; const a = i * 0.55; helix.push([Math.cos(a) * 0.05, y, Math.sin(a) * 0.05]); }
  group.add(tube(helix, tier === 2 ? 0.02 : 0.011, frostW, 80));
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(tier ? 0.09 : 0.075, 0.045, tier ? 0.1 : 0.08, 6), steel);
  collar.position.y = 1.52;
  group.add(collar);
  const iceMat = std(0xbdeeff, { emissive: 0x4cc4ff, emissiveIntensity: 0.7, roughness: 0.08, metalness: 0.1, flatShading: true, transparent: true, opacity: 0.93 });
  const deep = std(0x6fc4f0, { emissive: 0x2a8fe0, emissiveIntensity: 0.6, roughness: 0.1, flatShading: true, transparent: true, opacity: 0.92 });
  const shard = (h, r, sides = 6) => new THREE.LatheGeometry([[0.0001, 0], [r, h * 0.18], [r * 0.9, h * 0.7], [0.0001, h]].map(([x, y]) => new THREE.Vector2(x, y)), sides);
  const MAIN = [{ h: 0.4, r: 0.06 }, { h: 0.66, r: 0.095 }, { h: 1.0, r: 0.115 }][tier];
  const crystal = new THREE.Mesh(shard(MAIN.h, MAIN.r, tier === 2 ? 8 : 6), iceMat);
  crystal.position.y = 1.54;
  group.add(crystal);
  const lean = (m, ox, oy, oz, a, tilt) => { m.position.set(ox + Math.cos(a) * 0.07, oy, oz + Math.sin(a) * 0.07); m.rotation.set(Math.sin(a) * tilt, 0, -Math.cos(a) * tilt); group.add(m); };
  if (tier === 0) {
    for (let i = 0; i < 3; i++) lean(new THREE.Mesh(shard(0.16, 0.03), deep), 0, 1.54, 0, (i / 3) * 6.28 + 0.4, 0.7);
  } else if (tier === 1) {
    for (let i = 0; i < 6; i++) lean(new THREE.Mesh(shard(i % 2 ? 0.28 : 0.4, 0.05), i % 2 ? deep : iceMat), 0, 1.54, 0, (i / 6) * 6.28, i % 2 ? 0.85 : 0.5);
    for (let i = 0; i < 3; i++) { // сосульки вниз под воротником
      const ic = new THREE.Mesh(shard(0.2 + 0.05 * i, 0.03), deep);
      const a = (i / 3) * 6.28 + 0.9;
      ic.position.set(Math.cos(a) * 0.07, 1.5, Math.sin(a) * 0.07);
      ic.rotation.set(Math.PI - Math.sin(a) * 0.25, 0, Math.cos(a) * 0.25);
      group.add(ic);
    }
  } else {
    // Корона: два боковых копья крест-накрест, ряд из восьми длинных осколков и ряд из восьми коротких ниже.
    for (let i = 0; i < 2; i++) lean(new THREE.Mesh(shard(0.7, 0.07, 6), iceMat), 0, 1.54, 0, i * Math.PI + 0.5, 0.42);
    for (let i = 0; i < 8; i++) lean(new THREE.Mesh(shard(0.5, 0.05), iceMat), 0, 1.54, 0, (i / 8) * 6.28, 0.78);
    for (let i = 0; i < 8; i++) lean(new THREE.Mesh(shard(0.26, 0.04), deep), 0, 1.52, 0, ((i + 0.5) / 8) * 6.28, 1.2);
    for (let i = 0; i < 6; i++) { // сосульки
      const ic = new THREE.Mesh(shard(0.3 + 0.08 * (i % 2), 0.035), deep);
      const a = (i / 6) * 6.28 + 0.3;
      ic.position.set(Math.cos(a) * 0.09, 1.5, Math.sin(a) * 0.09);
      ic.rotation.set(Math.PI - Math.sin(a) * 0.3, 0, Math.cos(a) * 0.3);
      group.add(ic);
    }
    for (let i = 0; i < 5; i++) { // иней на древке: ледяные кристаллики вдоль верхней части
      const fr = new THREE.Mesh(shard(0.12, 0.025), iceMat);
      const a = i * 2.4;
      fr.position.set(Math.cos(a) * 0.05, 1.0 + i * 0.1, Math.sin(a) * 0.05);
      fr.rotation.set(Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1);
      group.add(fr);
    }
  }
  const glow = halo(glowTex, 0xaee9ff, [0.7, 1.05, 1.7][tier], [0.55, 0.7, 0.85][tier]);
  glow.position.y = 1.54 + MAIN.h * 0.5;
  group.add(glow);
  const floaters = [];
  const nF = [2, 4, 5][tier];
  for (let i = 0; i < nF; i++) {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.03 + 0.012 * tier, 0).scale(1, 1.6, 1), iceMat);
    group.add(m);
    floaters.push({ m, a: (i / nF) * 6.28, r: 0.2 + 0.03 * i + 0.06 * tier });
  }
  // Ступень +10: кольцо крупных кристаллов вокруг короны и парящие снежинки.
  const ringC = [], flakes = [];
  if (tier === 2) {
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.05, 0).scale(0.7, 1.7, 0.7), deep);
      group.add(m);
      ringC.push({ m, a: (i / 8) * 6.28 });
    }
    for (let i = 0; i < 4; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: snowflakeTexture(), color: 0xeafaff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
      sp.scale.set(0.2, 0.2, 1);
      group.add(sp);
      flakes.push({ sp, a: (i / 4) * 6.28, h: i % 2 });
    }
  }
  const cy = 1.54 + MAIN.h * 0.45;
  return {
    group, crystal, glow,
    update(t, k) {
      crystal.rotation.y = t * 0.6;
      for (const f of floaters) {
        const a = f.a + t * (0.8 + k * 0.6);
        f.m.position.set(Math.cos(a) * f.r, cy + 0.1 + Math.sin(t * 1.7 + f.a) * 0.07, Math.sin(a) * f.r);
        f.m.rotation.y = t * 2;
      }
      for (const r of ringC) {
        const a = r.a - t * 0.7;
        r.m.position.set(Math.cos(a) * 0.4, cy - 0.12 + Math.sin(t * 1.3 + r.a * 2) * 0.05, Math.sin(a) * 0.4);
        r.m.rotation.y = -a;
      }
      for (const f of flakes) {
        const a = f.a + t * 0.9;
        f.sp.position.set(Math.cos(a) * 0.5, cy + 0.38 - f.h * 0.5 + Math.sin(t * 1.6 + f.a) * 0.07, Math.sin(a) * 0.5);
        f.sp.material.rotation = t * 0.8 + f.a;
      }
      glow.material.opacity = [0.55, 0.65, 0.8][tier] + 0.1 * Math.sin(t * 2);
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

/** Гравитационный: тёмно-фиолетовое древко, чёрная сфера-сингулярность с наклонным светящимся кольцом и вращающимися обломками. */
function gravityStaff(glowTex, matBelt) {
  const group = new THREE.Group();
  const dark = std(0x241a3a, { roughness: 0.4, metalness: 0.6 });
  const silver = std(0xb9b4d6, { roughness: 0.3, metalness: 0.85 });
  const violet = basic(0xb06bff);
  shaftParts(group, dark, silver, matBelt);
  for (const y of [0.1, 0.55, 1.0]) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.01, 6, 18), silver);
    r.rotation.x = Math.PI / 2;
    r.position.y = y;
    group.add(r);
  }
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.05, 0.1, 10), silver);
  collar.position.y = 1.5;
  group.add(collar);
  for (let i = 0; i < 3; i++) { // три скобы, удерживающие сферу
    const a = (i / 3) * Math.PI * 2;
    const c = Math.cos(a), sn = Math.sin(a);
    group.add(tube([[c * 0.04, 1.55, sn * 0.04], [c * 0.2, 1.7, sn * 0.2], [c * 0.2, 1.88, sn * 0.2], [c * 0.06, 2.0, sn * 0.06]], 0.014, silver, 14));
  }
  const crystal = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 14), std(0x07040f, { roughness: 0.2, metalness: 0.3, emissive: 0x3a1470, emissiveIntensity: 0.9 }));
  crystal.position.y = 1.78;
  const disk = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.022, 8, 40), violet);
  ring.rotation.x = Math.PI / 2;
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.012, 6, 36), basic(0xffffff, { transparent: true, opacity: 0.8 }));
  ring2.rotation.x = Math.PI / 2;
  disk.add(ring, ring2);
  const rocks = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.03 + 0.008 * (i % 3), 0), std(0x6a5a8a, { roughness: 0.8 }));
    disk.add(m);
    rocks.push({ m, a: (i / 6) * Math.PI * 2, r: 0.27 + 0.03 * (i % 2) });
  }
  disk.position.y = 1.78;
  disk.rotation.z = 0.45;
  const glow = halo(glowTex, 0xa35cff, 1.2, 0.55);
  glow.position.y = 1.78;
  group.add(crystal, disk, glow);
  return {
    group, crystal, glow,
    update(t, k) {
      disk.rotation.y = t * (1.2 + k);
      for (const r of rocks) {
        const a = r.a - t * 1.8;
        r.m.position.set(Math.cos(a) * r.r, 0, Math.sin(a) * r.r);
        r.m.rotation.set(t, t * 1.3, 0);
      }
      glow.material.opacity = 0.45 + 0.12 * Math.sin(t * 2.5);
    },
  };
}

/** Клинок-ромб (как эфирный меч в SoulsGate): плоский, сужается к кончику и к низу. */
function kiteGeo(len, w) {
  const sh = new THREE.Shape();
  sh.moveTo(0, 0); sh.lineTo(w, len * 0.28); sh.lineTo(0, len); sh.lineTo(-w, len * 0.28); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.014, bevelEnabled: false });
  g.translate(0, 0, -0.007);
  return g;
}

/** Звёздная вспышка: два вытянутых ореола крест-накрест. */
function flare(glowTex, color, size) {
  const g = new THREE.Group();
  for (const r of [0, Math.PI / 2]) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, rotation: r, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.scale.set(size, size * 0.12, 1);
    g.add(s);
  }
  return g;
}

/** Лазерный (по лазеру из SoulsGate): тёмное древко с голубыми линиями, ромб-излучатель, прямой луч с белой жилой и звёздная вспышка на конце. */
function laserStaff(glowTex, matBelt) {
  const group = new THREE.Group();
  const navy = std(0x1c2638, { roughness: 0.4, metalness: 0.6 });
  const steel = std(0x8fa3c0, { roughness: 0.3, metalness: 0.85 });
  const cyan = basic(0x6ecdff);
  shaftParts(group, navy, steel, matBelt);
  for (const y of [0.05, 0.5, 0.95]) {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.025, 12), cyan);
    r.position.y = y;
    group.add(r);
  }
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.05, 0.12, 8), steel);
  collar.position.y = 1.5;
  group.add(collar);
  for (const s of [-1, 1]) { // две скобы-«усика» у излучателя
    group.add(tube([[s * 0.05, 1.55, 0], [s * 0.17, 1.62, 0], [s * 0.2, 1.78, 0]], 0.014, steel, 12));
  }
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.15, 0).scale(0.8, 1.15, 0.8), std(0x8fdcff, { emissive: 0x3aaeff, emissiveIntensity: 1.5, roughness: 0.15, flatShading: true }));
  crystal.position.y = 1.72;
  const innerCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0).scale(0.8, 1.15, 0.8), basic(0xe8f8ff));
  innerCore.position.y = 1.72;
  const beam = new THREE.Group(); // луч вверх: четыре слоя, как в игре
  const layers = [];
  for (const [r, col, op] of [[0.1, 0x6ecdff, 0.1], [0.055, 0x6ecdff, 0.22], [0.03, 0x6ecdff, 0.7], [0.014, 0xe8f8ff, 1]]) {
    const m = basic(col, { transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false });
    const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.5, 10, 1, true), m);
    c.position.y = 2.1;
    beam.add(c);
    layers.push({ c, m, op });
  }
  const tipFlare = flare(glowTex, 0xcdeeff, 0.8);
  tipFlare.position.y = 2.38;
  const glow = halo(glowTex, 0x6ecdff, 1.0, 0.6);
  glow.position.y = 1.72;
  group.add(crystal, innerCore, beam, tipFlare, glow);
  return {
    group, crystal, glow,
    update(t, k) {
      const f = 0.9 + 0.1 * Math.sin(t * 70) + 0.05 * Math.sin(t * 23);
      for (const l of layers) { l.c.scale.x = l.c.scale.z = f; l.m.opacity = Math.min(1, l.op * (0.85 + 0.25 * f + k * 0.2)); }
      tipFlare.scale.setScalar(0.9 + 0.2 * Math.sin(t * 9));
      tipFlare.rotation.z = Math.sin(t * 1.3) * 0.1;
      crystal.rotation.y = t * 1.5;
      glow.material.opacity = 0.5 + 0.12 * Math.sin(t * 6);
    },
  };
}

/** Посох клинков (по спектральным клинкам и эфирному мечу SoulsGate): светящийся веер из трёх фиолетово-белых клинков над изогнутой гардой, вокруг парят мечи остриём вниз. */
function bladesStaff(glowTex, matBelt) {
  const group = new THREE.Group();
  const dark = std(0x2a2448, { roughness: 0.45, metalness: 0.6 });
  const lav = std(0x9381ea, { roughness: 0.3, metalness: 0.6, emissive: 0x6a5cc8, emissiveIntensity: 0.5 });
  const blade = std(0xb9b0ff, { roughness: 0.25, metalness: 0.3, emissive: 0x6a5cc8, emissiveIntensity: 0.55 });
  shaftParts(group, dark, lav, matBelt);
  for (const y of [0.2, 0.7]) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.011, 6, 16), lav);
    r.rotation.x = Math.PI / 2;
    r.position.y = y;
    group.add(r);
  }
  const hubY = 1.56;
  const fan = new THREE.Group();
  fan.position.y = hubY;
  for (const a of [-34, 0, 34]) { // веер как на иконке: клинки из одной точки
    const b = new THREE.Mesh(kiteGeo(a === 0 ? 0.95 : 0.8, 0.095), blade);
    const pivot = new THREE.Group();
    pivot.rotation.z = -a * Math.PI / 180;
    b.position.y = 0.05;
    pivot.add(b);
    fan.add(pivot);
  }
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.028, 8, 20, Math.PI), lav); // изогнутая гарда под веером
  guard.rotation.z = Math.PI;
  guard.position.y = hubY + 0.02;
  const crystal = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 10), basic(0xe7d9ff));
  crystal.position.y = hubY - 0.05;
  const flyers = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(kiteGeo(0.34, 0.055), blade);
    m.rotation.z = Math.PI; // остриём вниз, как падающие мечи
    m.position.set(Math.cos((i / 3) * Math.PI * 2) * 0.34, 0.17, Math.sin((i / 3) * Math.PI * 2) * 0.34);
    flyers.add(m);
  }
  flyers.position.y = hubY + 0.1;
  const glow = halo(glowTex, 0xa39bff, 1.3, 0.35);
  glow.position.y = hubY + 0.35;
  const glow2 = halo(glowTex, 0xe6e0ff, 0.5, 0.7);
  glow2.position.y = hubY - 0.05;
  group.add(fan, guard, crystal, flyers, glow, glow2);
  return {
    group, crystal, glow,
    update(t, k) {
      flyers.rotation.y = t * (1.3 + k * 1.5);
      flyers.position.y = hubY + 0.1 + Math.sin(t * 1.7) * 0.03;
      fan.rotation.z = Math.sin(t * 1.2) * 0.04;
      glow.material.opacity = 0.3 + 0.08 * Math.sin(t * 3);
    },
  };
}

const BUILDERS = { basic: basicStaff, fire: fireStaff, ice: iceStaff, electric: electricStaff, gravity: gravityStaff, laser: laserStaff, blades: bladesStaff };

// Цвет украшений навершия по виду посоха (кольца и искры ступеней +5 и +10).
const TIER_COLOR = { basic: 0x35f2ff, fire: 0xff7a24, ice: 0x8fe0ff, electric: 0xbfe4ff, gravity: 0xa89cff, laser: 0xff3345, blades: 0xcfe0ff };

/** Ступень +5: камень крупнее, ореол ярче, вокруг навершия медленное кольцо. +10: камень ещё крупнее, два кольца в разные стороны и рой искр. */
function decorate(m, variant, tier) {
  const g = m.group;
  g.updateMatrixWorld(true);
  const c = g.worldToLocal(m.crystal.getWorldPosition(new THREE.Vector3()));
  const col = TIER_COLOR[variant] || TIER_COLOR.basic;
  const k = tier === 2 ? 1.5 : 1.25;
  m.crystal.scale.multiplyScalar(k);
  m.glow.scale.multiplyScalar(tier === 2 ? 1.7 : 1.3);
  const rings = [], sparks = [];
  const ringMat = () => new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false });
  const addRing = (r, tilt, dir) => {
    const pivot = new THREE.Group();
    pivot.position.copy(c);
    pivot.rotation.x = tilt;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.012, 6, 36), ringMat());
    ring.rotation.x = Math.PI / 2;
    pivot.add(ring);
    const bead = new THREE.Mesh(new THREE.OctahedronGeometry(0.035, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    bead.position.set(r, 0, 0);
    ring.add(bead);
    g.add(pivot);
    rings.push({ pivot, dir });
  };
  addRing(0.22 * k, 0.5, 1);
  if (tier === 2) {
    addRing(0.3 * k, -0.7, -1);
    for (let i = 0; i < 6; i++) {
      const s = halo(m.glowTex || m.glow.material.map, col, 0.12, 0.9);
      g.add(s);
      sparks.push({ s, a: (i / 6) * 6.28, r: 0.18 + 0.05 * (i % 3), h: (i % 2 ? 1 : -1) * 0.1 });
    }
  }
  const base = m.update;
  m.update = (t, kk) => {
    base(t, kk);
    for (const r of rings) r.pivot.rotation.y = t * 0.9 * r.dir * (1 + kk * 0.6);
    for (const sp of sparks) {
      const a = sp.a + t * 1.6;
      sp.s.position.set(c.x + Math.cos(a) * sp.r * k, c.y + sp.h + Math.sin(t * 2.3 + sp.a) * 0.08, c.z + Math.sin(a) * sp.r * k);
    }
  };
  return m;
}

/** variant: 'basic' (по умолчанию) | 'fire' | 'ice' | 'electric' | 'gravity' | 'laser' | 'blades'; tier 0..2 по заточке (+0..4 / +5..9 / +10). */
export function buildStaffModel(variant, glowTex, matBelt, tier = 0) {
  const v = BUILDERS[variant] ? variant : 'basic';
  const m = BUILDERS[v](glowTex, matBelt, tier);
  m.glowTex = glowTex;
  return tier > 0 && v !== 'ice' && v !== 'fire' ? decorate(m, v, tier) : m; // у ледяного посоха три ступени собраны в самой модели
}
