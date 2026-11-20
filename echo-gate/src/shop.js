// Лавка воспоминаний: псевдо-3D каменный киоск с тканевым навесом, освещением и живым торговцем.
// Внутри за прилавком улыбающийся человеко-пёс хаски. Модель собрана из примитивов, лицом к +z (к камере).
// Снаружи нужно: Shop.group (ставит Hub) и Shop.update(dt).
import * as THREE from 'three';

const C = {
  red: 0x9a2f33, redDark: 0x6e2227, gold: 0xe0a93e, wood: 0x4a3326, woodDark: 0x2f2119, inner: 0x2b2336,
  fur: 0x8190a3, furDark: 0x5d6a7c, white: 0xeef3f8, nose: 0x14171e, eye: 0x8fdcff, apron: 0xb8372f, pink: 0xd98a96,
};

function mat(color, rough = 0.9, extra) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, flatShading: true, ...extra });
}
function box(w, h, d, m, x, y, z, parent) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  b.position.set(x, y, z);
  parent.add(b);
  return b;
}
function softGlow(color, size) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, color.replace('A', '0.75'));
  gr.addColorStop(0.4, color.replace('A', '0.25'));
  gr.addColorStop(1, color.replace('A', '0'));
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.set(size, size, 1);
  return s;
}

/** Вывеска: крупные золотые буквы SHOP на красной доске с золотой каймой. */
function signTexture(text) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = '#7d2328'; g.fillRect(0, 0, 512, 160);
  g.strokeStyle = '#e0a93e'; g.lineWidth = 8; g.strokeRect(10, 10, 492, 140);
  g.lineWidth = 2; g.strokeRect(22, 22, 468, 116);
  g.font = '900 118px "Arial Black", Impact, system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#4a1216'; g.fillText(text, 258, 86);
  g.fillStyle = '#ffd36b'; g.fillText(text, 256, 82);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Хаски-человек: голова с белой маской, острые уши, голубые глаза, улыбка, фартук. Центр у ног, лицом к +z. */
class Husky {
  constructor() {
    this.group = new THREE.Group();
    const fur = mat(C.fur), furD = mat(C.furDark), white = mat(C.white);
    // Туловище и фартук.
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.52, 0.95, 7), fur);
    torso.position.y = 0.5;
    this.group.add(torso);
    const apron = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.53, 0.6, 7, 1, false, -1.0, 2.0 + 0.28), mat(C.apron));
    apron.position.set(0, 0.4, 0.03);
    this.group.add(apron);
    // Голова.
    this.head = new THREE.Group();
    this.head.position.y = 1.32;
    this.group.add(this.head);
    const skull = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 1), fur);
    skull.scale.set(1.08, 0.95, 0.98);
    this.head.add(skull);
    const mask = new THREE.Mesh(new THREE.IcosahedronGeometry(0.31, 1), white); // белая нижняя часть морды
    mask.scale.set(1.0, 0.82, 0.8);
    mask.position.set(0, -0.1, 0.22);
    this.head.add(mask);
    const muzzle = new THREE.Mesh(new THREE.IcosahedronGeometry(0.17, 1), white);
    muzzle.scale.set(1.0, 0.8, 1.15);
    muzzle.position.set(0, -0.12, 0.45);
    this.head.add(muzzle);
    const nose = new THREE.Mesh(new THREE.IcosahedronGeometry(0.075, 0), mat(C.nose, 0.4));
    nose.scale.set(1.2, 0.8, 1);
    nose.position.set(0, -0.04, 0.63);
    this.head.add(nose);
    // Тёмная «бровная» метка над глазами.
    for (const sx of [-1, 1]) {
      const brow = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 0), furD);
      brow.scale.set(1.2, 0.7, 0.7);
      brow.position.set(sx * 0.16, 0.18, 0.32);
      this.head.add(brow);
    }
    // Глаза: голубые, с тёмным зрачком и бликом, чуть прищурены радостью.
    this.eyes = [];
    for (const sx of [-1, 1]) {
      const eye = new THREE.Group();
      eye.position.set(sx * 0.17, 0.06, 0.37);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: C.eye }));
      ball.scale.set(1, 1.1, 0.7);
      eye.add(ball);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0x0b1220 }));
      pupil.position.set(0, 0, 0.04);
      eye.add(pupil);
      const gl = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      gl.position.set(0.02, 0.02, 0.07);
      eye.add(gl);
      this.head.add(eye);
      this.eyes.push(eye);
    }
    // Улыбка: дуга под носом, уголки приподняты.
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.014, 5, 12, Math.PI), mat(C.nose, 0.5));
    smile.rotation.z = Math.PI; // дуга вниз
    smile.position.set(0, -0.12, 0.575);
    smile.scale.set(1, 0.75, 1);
    this.head.add(smile);
    const tongue = new THREE.Mesh(new THREE.IcosahedronGeometry(0.045, 0), mat(C.pink, 0.6));
    tongue.scale.set(1, 0.6, 0.8);
    tongue.position.set(0.03, -0.215, 0.545);
    this.head.add(tongue);
    // Уши: острые, торчком; внутри розовое.
    this.ears = [];
    for (const sx of [-1, 1]) {
      const ear = new THREE.Group();
      ear.position.set(sx * 0.27, 0.3, -0.02);
      const o = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.42, 4), fur);
      o.position.y = 0.17;
      ear.add(o);
      const inn = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 4), mat(C.pink));
      inn.position.set(0, 0.14, 0.06);
      ear.add(inn);
      ear.rotation.z = -sx * 0.22;
      this.head.add(ear);
      this.ears.push(ear);
    }
    // Руки на прилавке; правая машет.
    this.arms = [];
    for (const sx of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(sx * 0.5, 0.85, 0.05);
      const a = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.55, 6), fur);
      a.position.set(0, -0.22, 0.12);
      a.rotation.x = -0.55;
      arm.add(a);
      const paw = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), white);
      paw.position.set(0, -0.44, 0.3);
      arm.add(paw);
      this.group.add(arm);
      this.arms.push(arm);
    }
    this.t = 0;
  }

  /** (tx, tz): где игрок относительно лавки (метры, оси лавки; +z к камере), look: 0..1 насколько игрок «виден». */
  update(dt, tx, tz) {
    this.t += dt;
    const t = this.t;
    this.group.position.y = 0.012 * Math.sin(t * 2.2); // дышит
    // Следит за игроком: голова поворачивается и наклоняется к нему (в пределах шеи), корпус чуть подворачивается следом.
    const dx = tx - this.group.position.x;
    const dz = tz - this.group.position.z;
    const d = Math.hypot(dx, dz);
    const seen = d < 16 && dz > -0.6; // игрока за спиной не видит
    const clamp = (v, a) => Math.max(-a, Math.min(a, v));
    const yawT = seen ? clamp(Math.atan2(dx, Math.max(0.3, dz)), 1.15) : 0;
    const pitchT = seen ? clamp(Math.atan2(1.0, Math.max(1, d)), 0.28) : 0;
    this.lookY = (this.lookY || 0) + (yawT - (this.lookY || 0)) * (1 - Math.exp(-dt / 0.12));
    this.lookX = (this.lookX || 0) + (pitchT - (this.lookX || 0)) * (1 - Math.exp(-dt / 0.15));
    this.group.rotation.y = this.lookY * 0.25;
    this.head.rotation.z = 0.05 * Math.sin(t * 1.1) - this.lookY * 0.06;
    this.head.rotation.y = this.lookY * 0.75 + 0.05 * Math.sin(t * 0.6);
    this.head.rotation.x = this.lookX + 0.03 * Math.sin(t * 1.7);
    // Ухо иногда дёргается.
    const tw = Math.max(0, Math.sin(t * 0.7 + 1)) ** 12;
    this.ears[0].rotation.x = -0.35 * tw;
    this.ears[1].rotation.x = 0.0;
    // Моргание.
    const bl = (t % 3.4) > 3.28 ? 0.15 : 1;
    for (const e of this.eyes) e.scale.y = bl;
    // Приветственное махание правой рукой раз в несколько секунд.
    const w = Math.max(0, Math.sin(t * 0.45 - 1)) ** 6;
    this.arms[1].rotation.x = -1.7 * w;
    this.arms[1].rotation.z = -0.35 * w + 0.28 * w * Math.sin(t * 9);
  }
}

export class Shop {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'MemoryMerchantStall';
    this.t = 0;
    this.lanterns = [];
    this.lights = [];
    this.steam = [];
    // Narrow depth, real volume for the counter/pillars and layered fabric planes:
    // a readable pseudo-3D façade rather than the old closed wheeled caravan.
    const G = this.group, W = 5.2, hd = 1.45;
    const rock = mat(0x35405a), rockTop = mat(0x4e6670), rockShadow = mat(0x212639);
    const mortar = mat(0x26283b), wood = mat(0x553e42), edge = mat(0x8d695b);
    const copper = mat(0xb28a64, 0.5), purple = mat(0x59314d), oxblood = mat(0x713a55);
    const gold = mat(0xcaa879, 0.55);
    const emissive = (c, k = 0.8) => mat(c, 0.42, { emissive: c, emissiveIntensity: k });
    const wallBox = (w, h, d, m, x, y, z) => box(w, h, d, m, x, y, z, G);

    // Broken stone foundation, steps and individual masonry blocks.
    wallBox(5.65, 0.32, 3.35, rockShadow, 0, 0.19, 0);
    wallBox(5.37, 0.12, 3.10, rockTop, 0, 0.39, 0);
    for (let i = 0; i < 3; i++) {
      const x = -2.04 + i * 2.04;
      wallBox(1.98, 0.13, 0.75, i === 1 ? rockTop : rock, x, 0.18, 1.87);
    }
    // Back wall: broken brick courses form an architectural silhouette.
    wallBox(5.1, 2.65, 0.28, mortar, 0, 1.76, -1.22);
    for (let y = 0; y < 8; y++) {
      const z = -1.04;
      const brickH = 0.34, n = y % 2 ? 8 : 7, w = 5.0 / n;
      for (let i = 0; i < n; i++) {
        const x = -2.5 + (i + 0.5) * w;
        const c = (i + y * 3) % 6;
        const m = c === 1 ? rockTop : c === 4 ? rockShadow : rock;
        const brick = wallBox(w - 0.048, brickH - 0.028,
          0.12 + c % 3 * 0.027, m, x, 0.49 + y * 0.34, z);
        brick.rotation.z = (i * 11 + y * 7) % 13 === 0 ? 0.028 : 0;
      }
    }
    // Dark recess makes the merchant and potion silhouettes stand out.
    wallBox(3.1, 1.9, 0.045, mat(0x151b2e), 0, 1.93, -0.982);
    for (const sx of [-1, 1]) {
      // Narrow stone pillars frame the arch, with irregular cap stones and corbels.
      wallBox(0.63, 2.85, 0.72, rockShadow, sx * 2.37, 1.88, -0.55);
      for (let j = 0; j < 7; j++) {
        wallBox(0.73 + (j % 3) * 0.035, 0.38, 0.79, j % 3 ? rock : rockTop,
          sx * 2.37, 0.55 + j * 0.40, -0.55 + (j % 2 ? 0.015 : -0.015));
      }
      wallBox(0.94, 0.30, 0.97, rockTop, sx * 2.37, 3.49, -0.55);
      wallBox(0.81, 0.14, 0.85, copper, sx * 2.37, 0.54, -0.55);
    }
    // Angular masonry arch with a 3D keystone.
    wallBox(3.58, 0.3, 0.48, rockShadow, 0, 3.08, -0.89);
    for (const sx of [-1, 1]) {
      const arch = wallBox(0.65, 0.29, 0.57, rockTop, sx * 1.53, 2.86, -0.85);
      arch.rotation.z = -sx * 0.28;
      wallBox(0.84, 0.35, 0.65, rockTop, sx * 1.05, 3.24, -0.84);
    }
    const keystone = new THREE.Mesh(new THREE.OctahedronGeometry(0.36, 0), copper);
    keystone.scale.set(0.85, 0.95, 0.65);
    keystone.position.set(0, 3.22, -0.55);
    G.add(keystone);

    // Real wood beams, but a shallow multi-faceted cloth roof: deliberately 2.5D.
    for (const sx of [-1, 1]) {
      wallBox(0.21, 2.6, 0.25, wood, sx * 2.14, 1.89, 1.14);
      wallBox(0.27, 0.21, 2.6, wood, sx * 2.14, 3.13, 0.08);
      wallBox(0.16, 0.16, 2.75, copper, sx * 2.14, 3.23, 0.08);
      wallBox(0.3, 0.22, 0.28, copper, sx * 2.14, 2.91, 1.13);
    }
    wallBox(4.52, 0.19, 0.2, wood, 0, 3.03, 1.18);
    wallBox(4.56, 0.07, 0.23, gold, 0, 2.92, 1.20);
    const fabric = [mat(0x58314b), mat(0x703550), mat(0x4a2b47), mat(0x763b55)];
    for (let i = 0; i < 9; i++) {
      const x0 = -2.24 + i * 0.5, x1 = x0 + 0.5;
      const sag = (i % 3) * 0.035;
      const meshGeo = new THREE.BufferGeometry();
      meshGeo.setAttribute('position', new THREE.Float32BufferAttribute([
        x0, 3.36, -1.04, x1, 3.36, -1.04, x0 + 0.03, 3.08 - sag, 0.12,
        x1, 3.36, -1.04, x1 - 0.03, 3.08 - sag, 0.12, x0 + 0.03, 3.08 - sag, 0.12,
        x0 + 0.03, 3.08 - sag, 0.12, x1 - 0.03, 3.08 - sag, 0.12, x0 + 0.045, 2.91, 1.19,
        x1 - 0.03, 3.08 - sag, 0.12, x1 - 0.045, 2.91, 1.19, x0 + 0.045, 2.91, 1.19,
      ], 3));
      meshGeo.computeVertexNormals();
      const canopy = new THREE.Mesh(meshGeo, fabric[i % 4]);
      canopy.material.side = THREE.DoubleSide;
      G.add(canopy);
      // Cloth valance: thin vertical planes rather than a solid roof over the NPC.
      wallBox(0.46, 0.33 + 0.05 * Math.sin(i * 1.6), 0.028,
        fabric[i % 4], (x0 + x1) * 0.5, 2.78, 1.22);
      const stitch = wallBox(0.45, 0.022, 0.04, copper, (x0 + x1) * 0.5, 2.93, 1.245);
      stitch.rotation.z = Math.sin(i * 1.3) * 0.05;
    }
    // Embroidered diamond sigils stitched into the awning hem.
    for (const x of [-1.52, 0, 1.52]) {
      const rune = new THREE.Mesh(new THREE.OctahedronGeometry(0.095, 0), gold);
      rune.scale.set(0.6, 1.4, 0.2);
      rune.position.set(x, 2.78, 1.26);
      G.add(rune);
    }

    // Counter: worn timber with a deep violet hanging textile and metallic embroidery.
    wallBox(4.44, 0.89, 0.72, wood, 0, 0.97, 1.11);
    wallBox(4.66, 0.14, 0.96, edge, 0, 1.46, 1.09);
    wallBox(4.44, 0.06, 0.86, copper, 0, 1.54, 1.09);
    wallBox(3.15, 0.67, 0.038, purple, 0, 1.02, 1.49);
    wallBox(3.01, 0.045, 0.05, gold, 0, 1.31, 1.52);
    wallBox(3.01, 0.045, 0.05, gold, 0, 0.74, 1.52);
    for (const sx of [-1, 1]) {
      wallBox(0.035, 0.56, 0.05, copper, sx * 1.5, 1.02, 1.52);
      const rune = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), gold);
      rune.scale.set(0.75, 1.25, 0.22);
      rune.position.set(sx * 0.82, 1.01, 1.54);
      G.add(rune);
    }
    // Open book + layered paper stacks on the counter (each page has visible thickness).
    for (const sx of [-1, 1]) {
      const book = wallBox(0.52, 0.06, 0.45, mat(0xd7c8aa), sx * 0.28, 1.61, 1.15);
      book.rotation.z = sx * 0.09;
    }
    wallBox(1.10, 0.06, 0.08, gold, 0, 1.61, 1.12);
    for (let k = 0; k < 5; k++) {
      const x = -1.8 + k * 0.8, c = [0x66d3d8,0xa68cfa,0xc179d8,0x64b5cf,0xe9a55e][k];
      const vial = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.32 + (k % 2) * 0.15, 7), mat(c, 0.3, { emissive: c, emissiveIntensity: 0.5 }));
      vial.position.set(x, 1.72 + (k % 2) * 0.075, 0.85);
      G.add(vial);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.065, 0.12, 7), copper);
      neck.position.set(x, vial.position.y + 0.22, 0.85);
      G.add(neck);
      const light = softGlow('rgba(160,220,255,A)', 0.76);
      light.position.set(x, vial.position.y, 0.88);
      G.add(light);
    }
    // Potion shelves in the shadowed opening.
    for (const y of [1.67, 2.31]) {
      wallBox(3.32, 0.10, 0.45, wood, 0, y, -0.74);
      wallBox(3.38, 0.034, 0.48, copper, 0, y + 0.065, -0.74);
      for (let k = 0; k < 6; k++) {
        const c = [0xdba16e,0x90d5cf,0xa88cbb][(k + (y > 2 ? 1 : 0)) % 3];
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.14, 0.24, 6), mat(c, 0.5));
        pot.position.set(-1.45 + k * 0.59, y + 0.22, -0.70);
        G.add(pot);
      }
    }
    // Old shopkeeper remains functional, eye/blink/wave tracking retained.
    this.husky = new Husky();
    this.husky.group.scale.setScalar(0.91);
    this.husky.group.position.set(0, 0.48, -0.09);
    G.add(this.husky.group);

    // Facade lanterns: warm light against cold cyan stone, with metal cage geometry.
    const lanternMaterial = emissive(0xffaa52, 1.35);
    for (const sx of [-1, 1]) {
      const lantern = new THREE.Group();
      lantern.position.set(sx * 2.13, 2.74, 1.34);
      wallBox(0.13, 0.2, 0.14, copper, sx * 2.13, 2.91, 1.34);
      const flame = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), lanternMaterial);
      flame.scale.set(0.78, 1.16, 0.8);
      flame.position.y = -0.36;
      lantern.add(flame);
      const cage = mat(0x463348, 0.42);
      for (const dx of [-0.18, 0.18]) for (const dz of [-0.16, 0.16])
        box(0.045, 0.52, 0.045, cage, dx, -0.37, dz, lantern);
      box(0.48, 0.09, 0.42, copper, 0, -0.12, 0, lantern);
      box(0.48, 0.09, 0.42, copper, 0, -0.63, 0, lantern);
      const glow = softGlow('rgba(255,152,70,A)', 2.65);
      glow.position.y = -0.38;
      lantern.add(glow);
      lantern.userData.ph = sx;
      G.add(lantern);
      this.lanterns.push(lantern);
    }
    const inner = new THREE.PointLight(0xffa05e, 5.6, 7.2, 1.6);
    inner.position.set(0, 2.25, 0.56);
    const side = new THREE.PointLight(0xffa463, 3.4, 6.0, 1.7);
    side.position.set(-2.0, 2.0, 1.20);
    G.add(inner, side);
    this.lights.push(inner, side);
    const pool = softGlow('rgba(255,140,70,A)', 7);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), new THREE.MeshBasicMaterial({
      map: pool.material.map, transparent: true, opacity: 0.48, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, 0.47, 2.0);
    G.add(mesh);

    // Scattered slate slabs, moss and worn wood around the façade.
    const moss = mat(0x355d5b), glowStone = mat(0x5c8181);
    for (let i = 0; i < 13; i++) {
      const x = (i % 2 ? 1 : -1) * (2.65 + (i % 3) * 0.22);
      const z = -1.4 + (i * 1.17) % 3.5;
      const slab = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18 + (i % 3) * 0.05, 0), i % 4 ? rock : rockTop);
      slab.scale.set(1.1, 0.35, 0.8);
      slab.position.set(x, 0.13, z);
      G.add(slab);
    }
    for (let i = 0; i < 10; i++) {
      const x = (i % 2 ? 1 : -1) * (2.0 + (i % 3) * 0.15);
      const leaf = new THREE.Mesh(new THREE.TetrahedronGeometry(0.13, 0), i % 3 ? moss : glowStone);
      leaf.position.set(x, 3.10 - (i % 5) * 0.28, -1.01 + (i % 4) * 0.09);
      leaf.rotation.set(i, i * 0.4, 0);
      G.add(leaf);
    }
    // Two decayed hanging tapestries (2D cloth planes with actual depth in tassels).
    for (const sx of [-1, 1]) {
      wallBox(0.48, 1.04, 0.04, oxblood, sx * 2.75, 2.17, -0.55);
      wallBox(0.5, 0.05, 0.07, gold, sx * 2.75, 2.73, -0.55);
      const rune = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0), copper);
      rune.scale.set(0.6, 1.6, 0.22);
      rune.position.set(sx * 2.75, 2.23, -0.51);
      G.add(rune);
    }
    this.update(0);
  }

  update(dt, tx = 0, tz = 9) {
    this.t += dt;
    this.husky.update(dt, tx, tz);
    for (const lantern of this.lanterns) {
      lantern.rotation.z = Math.sin(this.t * 1.8 + lantern.userData.ph) * 0.038;
    }
    this.lights[0].intensity = 5.6 * (1 + Math.sin(this.t * 5.0) * 0.055);
    this.lights[1].intensity = 3.4 * (1 + Math.sin(this.t * 3.8) * 0.07);
  }
}
