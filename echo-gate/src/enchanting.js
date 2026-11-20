// Зачарованная мастерская хаба (как у зачарователя в Skyrim): рунный круг на плитах, стол зачарования с парящим камнем,
// пять подставок с камнями душ, стеллаж с фолиантами и зельями, кафедра с открытой книгой, свечи.
// Собрано из примитивов Three.js, центр у земли в (0,0,0), размер примерно 5x4 м. Снаружи: EnchantingNook.group и EnchantingNook.update(dt).
import * as THREE from 'three';

function mat(color, rough = 0.9, extra) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, flatShading: true, ...extra });
}
function glowMat(color, intensity = 1, extra) {
  return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.3, flatShading: true, ...extra });
}
function sprite(rgb, size, alpha = 0.75) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, `rgba(${rgb},${alpha})`);
  gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.set(size, size, 1);
  return s;
}
function box(w, h, d, m, x, y, z) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  b.position.set(x, y, z);
  return b;
}

const STONE = 0x6a7590;
const STONE_D = 0x4a546c;
const WOOD = 0x6b4630;
const WOOD_D = 0x3d2818;
const BRASS = 0xc9a25a;
const GEMS = [
  { hex: 0xf2f6ff, rgb: '230,240,255' }, // мелкий: белый
  { hex: 0x5ec8ff, rgb: '94,200,255' },  // малый: голубой
  { hex: 0xb06bff, rgb: '176,107,255' }, // обычный: фиолетовый
  { hex: 0x5fe08a, rgb: '95,224,138' },  // большой: зелёный
  { hex: 0xff5a6e, rgb: '255,90,110' },  // великий: красный
];

export class EnchantingNook {
  constructor() {
    this.group = new THREE.Group();
    this.t = 0;
    this.floaters = []; // { mesh, glow, y0, ph, spin }
    this.flames = [];
    this.runes = [];
    const stone = mat(STONE), stoneD = mat(STONE_D), wood = mat(WOOD), woodD = mat(WOOD_D), brass = mat(BRASS, 0.4, { metalness: 0.5 });

    // Плиты основания и рунный круг.
    const dais = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.45, 0.14, 12), stoneD);
    dais.position.y = 0.07;
    this.group.add(dais);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.04, 6, 48), glowMat(0x9a7bff, 1.1));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.16;
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.025, 6, 40), glowMat(0x9a7bff, 0.9));
    ring2.rotation.x = Math.PI / 2;
    ring2.position.y = 0.16;
    this.group.add(ring, ring2);
    this.runes.push(ring, ring2);
    for (let i = 0; i < 10; i++) { // руны между кругами: короткие светящиеся чёрточки
      const a = (i / 10) * Math.PI * 2;
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.015, 0.06), glowMat(0xb89cff, 1.2));
      r.position.set(Math.cos(a) * 1.48, 0.16, Math.sin(a) * 1.48);
      r.rotation.y = -a + (i % 2 ? 0.5 : -0.5);
      this.group.add(r);
      this.runes.push(r);
    }

    // Стол зачарования в центре: каменная столешница с рунной инкрустацией, деревянные ножки.
    const table = new THREE.Group();
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) table.add(box(0.14, 0.62, 0.14, woodD, sx * 0.5, 0.45, sz * 0.32));
    table.add(box(1.4, 0.1, 0.9, wood, 0, 0.8, 0));
    table.add(box(1.5, 0.08, 1.0, stone, 0, 0.9, 0));
    const inlay = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.02, 6), glowMat(0x9a7bff, 1));
    inlay.position.y = 0.95;
    table.add(inlay);
    this.runes.push(inlay);
    table.position.set(0, 0.14, 0.1);
    this.group.add(table);
    const main = this.addGem(0xc9b0ff, '190,160,255', 0, 1.65, 0.1, 0.17, true);
    main.floatY = 0.16;

    // Пять подставок с камнями душ: дугой позади стола.
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * (1.12 + 0.19 * i); // дуга по задней стороне (на экране выше стола)
      const x = Math.cos(a) * 2.0, z = Math.sin(a) * 1.5;
      const st = new THREE.Group();
      st.add(box(0.46, 0.14, 0.46, stoneD, 0, 0.07, 0));
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.62, 6), stone);
      col.position.y = 0.45;
      st.add(col);
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.12, 0.12, 8), brass);
      cup.position.y = 0.82;
      st.add(cup);
      st.position.set(x, 0.14, z);
      this.group.add(st);
      const g = GEMS[i];
      const s = 0.1 + 0.02 * i; // камни растут по размеру
      this.addGem(g.hex, g.rgb, x, 0.14 + 1.15 + 0.1 * i * 0.2, z, s, false, i);
    }

    // Стеллаж позади: полки с фолиантами и зельями.
    const shelf = new THREE.Group();
    shelf.add(box(2.6, 1.9, 0.36, woodD, 0, 0.95, 0));
    for (const y of [0.55, 1.05, 1.55]) shelf.add(box(2.5, 0.07, 0.4, wood, 0, y, 0.02));
    const bookCols = [0x7d2236, 0x2d4a7d, 0x3d6b3a, 0x8a6a2a, 0x5a2d7d, 0x7a3a28];
    for (let row = 0; row < 3; row++) {
      for (let k = 0; k < 7; k++) {
        const h = 0.28 + 0.1 * Math.abs(Math.sin(row * 5 + k * 2.3));
        const bk = box(0.13, h, 0.26, mat(bookCols[(row * 3 + k) % bookCols.length]), -1.08 + k * 0.17, 0.62 + row * 0.5 + h / 2 - 0.03, 0.08);
        bk.rotation.z = k === 6 ? 0.25 : 0;
        shelf.add(bk);
      }
    }
    for (const [px, py, hex, rgb] of [[0.35, 1.13, 0x5ec8ff, '94,200,255'], [0.85, 1.63, 0xff5a6e, '255,90,110'], [1.1, 0.63, 0x5fe08a, '95,224,138']]) { // зелья
      const fl = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), glowMat(hex, 0.8, { transparent: true, opacity: 0.9 }));
      fl.position.set(px, py + 0.1, 0.1);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.1, 6), mat(0xdfe6f2, 0.3));
      neck.position.set(px, py + 0.24, 0.1);
      shelf.add(fl, neck);
      const gl = sprite(rgb, 0.45, 0.5);
      gl.position.set(px, py + 0.12, 0.2);
      shelf.add(gl);
    }
    shelf.position.set(0.2, 0.14, -2.45);
    this.group.add(shelf);

    // Кафедра с открытой книгой, слева спереди.
    const lect = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.85, 6), woodD);
    post.position.y = 0.45;
    const top = box(0.7, 0.07, 0.5, wood, 0, 0.9, 0);
    top.rotation.x = -0.35;
    const pageL = box(0.3, 0.02, 0.4, mat(0xe8dcc0, 0.8), -0.16, 0.97, 0);
    const pageR = box(0.3, 0.02, 0.4, mat(0xe8dcc0, 0.8), 0.16, 0.97, 0);
    for (const p of [pageL, pageR]) p.rotation.x = -0.35;
    pageL.rotation.z = 0.08; pageR.rotation.z = -0.08;
    const lg = sprite('190,160,255', 0.9, 0.5);
    lg.position.y = 1.15;
    lect.add(post, top, pageL, pageR, lg);
    lect.position.set(-1.75, 0.14, 1.35);
    lect.rotation.y = 0.5;
    this.group.add(lect);

    // Свечи на подставках по краям.
    for (const [x, z] of [[2.1, 1.1], [-2.15, -0.4], [2.2, -0.5]]) {
      const c = new THREE.Group();
      c.add(box(0.3, 0.05, 0.3, stoneD, 0, 0.025, 0));
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.85, 6), mat(0x2d2a2a, 0.6));
      pole.position.y = 0.45;
      const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.2, 8), mat(0xefe2c0, 0.8));
      wax.position.y = 0.95;
      const fl = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 6), glowMat(0xffc860, 1.6));
      fl.position.y = 1.14;
      const gl = sprite('255,190,100', 0.8, 0.6);
      gl.position.y = 1.14;
      c.add(pole, wax, fl, gl);
      c.position.set(x, 0.14, z);
      this.group.add(c);
      this.flames.push({ fl, gl, ph: x * 3 });
    }

    // Рунные искры, поднимающиеся над кругом.
    this.sparks = [];
    for (let i = 0; i < 14; i++) {
      const s = sprite('190,160,255', 0.16, 0.9);
      this.group.add(s);
      this.sparks.push({ s, a: Math.random() * 6.28, r: 0.4 + Math.random() * 1.4, ph: Math.random() });
    }
  }

  /** Парящий светящийся камень души: огранённый октаэдр + ореол. */
  addGem(hex, rgb, x, y, z, size, big, idx = 0) {
    const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(size, 0).scale(0.8, 1.35, 0.8), glowMat(hex, 1.5));
    mesh.position.set(x, y, z);
    const glow = sprite(rgb, size * (big ? 7 : 6.5), 0.7);
    glow.position.set(x, y, z);
    this.group.add(mesh, glow);
    const f = { mesh, glow, y0: y, ph: idx * 1.3 + x, spin: big ? 1.1 : 0.8, floatY: 0.07 };
    this.floaters.push(f);
    return f;
  }

  update(dt) {
    this.t += dt;
    const t = this.t;
    for (const f of this.floaters) {
      const y = f.y0 + Math.sin(t * 1.6 + f.ph) * f.floatY;
      f.mesh.position.y = f.glow.position.y = y;
      f.mesh.rotation.y = t * f.spin + f.ph;
      f.glow.material.opacity = 0.75 + 0.25 * Math.sin(t * 2.4 + f.ph);
    }
    for (const r of this.runes) r.material.emissiveIntensity = 0.9 + 0.35 * Math.sin(t * 1.8 + r.position.x);
    for (const c of this.flames) {
      const k = 1 + 0.12 * Math.sin(t * 13 + c.ph) + 0.08 * Math.sin(t * 7.3 + c.ph);
      c.fl.scale.set(1, k, 1);
      c.gl.material.opacity = 0.55 + 0.2 * Math.sin(t * 9 + c.ph);
    }
    for (const p of this.sparks) {
      const l = (t * 0.25 + p.ph) % 1;
      p.s.position.set(Math.cos(p.a + t * 0.4) * p.r, 0.3 + l * 2.2, Math.sin(p.a + t * 0.4) * p.r);
      p.s.material.opacity = Math.sin(l * Math.PI);
    }
  }
}
