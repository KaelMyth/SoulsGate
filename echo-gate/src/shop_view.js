// 3D-витрина окна магазина: пёс-хаски за подробным прилавком под полосатым навесом, сзади полки с зельями,
// по бокам бумажные фонари. Отдельная сцена, рисуется тем же рендерером в прямоугольник .shop-stage.
// Снаружи: render(dt, rect, box).
import * as THREE from 'three';
import { Husky } from './shop.js';

const M = (color, rough = 0.85, extra) => new THREE.MeshStandardMaterial({ color, roughness: rough, flatShading: true, ...extra });
function bx(w, h, d, m, x, y, z, p) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  b.position.set(x, y, z);
  p.add(b);
  return b;
}
function cyl(rt, rb, h, m, x, y, z, p, seg = 10) {
  const c = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  c.position.set(x, y, z);
  p.add(c);
  return c;
}
function glow(rgb, size) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, `rgba(${rgb},0.8)`); gr.addColorStop(0.4, `rgba(${rgb},0.25)`); gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.set(size, size, 1);
  return s;
}

const COL = { wood: 0x5a3d2b, woodL: 0x7a5239, woodD: 0x33221a, red: 0xa3323a, redD: 0x6e2227, gold: 0xe0a93e, cream: 0xf0e4c8, wall: 0x2b2340, wallD: 0x1c1730 };

export class ShopView {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
    this.t = 0;
    this.bg = new THREE.Color(0x0b1120);
    const sc = this.scene;
    sc.add(new THREE.HemisphereLight(0xe7dcff, 0x4a3a50, 1.1));
    const key = new THREE.DirectionalLight(0xfff0d8, 1.4); key.position.set(2.5, 5, 6); sc.add(key);
    const rim = new THREE.DirectionalLight(0x8fb4ff, 0.6); rim.position.set(-4, 3, -3); sc.add(rim);

    this.dog = new Husky();
    this.dog.group.position.set(0, 0, -0.05);
    this.dog.group.scale.setScalar(1.12);
    sc.add(this.dog.group);

    this.sway = [];
    this.buildWall();
    this.buildCounter();
    this.buildAwning();
  }

  /** Задняя стена с двумя полками, на них бутылки, банки и свитки. */
  buildWall() {
    const g = new THREE.Group();
    g.position.z = -1.1;
    bx(6.4, 3.6, 0.15, M(COL.wall), 0, 1.7, 0, g);
    for (const x of [-1.9, 0, 1.9]) bx(0.08, 3.6, 0.2, M(COL.wallD), x, 1.7, 0.05, g); // вертикальные рейки
    const shelfM = M(COL.woodD);
    const bottles = [0xff6a6a, 0x6aa8ff, 0x7be08a, 0xc98bff, 0xffd36b];
    for (const [y, n] of [[1.45, 7], [2.2, 6]]) {
      bx(5.4, 0.07, 0.4, shelfM, 0, y, 0.2, g);
      for (let i = 0; i < n; i++) {
        const x = -2.5 + i * (5 / (n - 1)) + (y > 2 ? 0.2 : 0);
        if (Math.abs(x) < 0.55 && y > 2) continue; // над собакой оставляем свободно
        const c = bottles[(i + (y > 2 ? 2 : 0)) % bottles.length];
        const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.3, flatShading: true, emissive: c, emissiveIntensity: 0.35, transparent: true, opacity: 0.9 });
        if ((i + (y > 2 ? 1 : 0)) % 3 === 0) { // круглая колба
          const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 1), m); f.position.set(x, y + 0.2, 0.2); g.add(f);
          cyl(0.05, 0.05, 0.14, m, x, y + 0.4, 0.2, g, 6);
        } else { // высокая бутылка с пробкой
          cyl(0.1, 0.11, 0.34, m, x, y + 0.21, 0.2, g, 7);
          cyl(0.04, 0.05, 0.14, m, x, y + 0.46, 0.2, g, 6);
          cyl(0.05, 0.05, 0.05, M(COL.woodL), x, y + 0.55, 0.2, g, 6);
        }
      }
    }
    // Свитки в связке и ящик на нижней полке.
    cyl(0.07, 0.07, 0.5, M(COL.cream), 2.3, 1.5, 0.2, g, 8).rotation.z = Math.PI / 2;
    bx(0.45, 0.3, 0.3, M(COL.wood), -2.35, 1.62, 0.2, g);
    this.scene.add(g);
  }

  /** Прилавок: резное основание с золотой каймой, столешница, на ней весы, банки, счёты, монеты, книга учёта. */
  buildCounter() {
    const g = new THREE.Group();
    g.position.set(0, 0, 0.85);
    const wood = M(COL.wood), woodL = M(COL.woodL), goldM = M(COL.gold, 0.4, { metalness: 0.5 });
    bx(3.5, 0.12, 1.0, M(COL.woodD), 0, 0.06, 0, g);           // цоколь
    bx(3.3, 0.8, 0.8, wood, 0, 0.5, 0, g);                      // корпус
    for (let i = -1; i <= 1; i++) {                              // три филёнки на фасаде
      const x = i * 1.05;
      bx(0.95, 0.56, 0.05, M(COL.redD), x, 0.5, 0.42, g);
      for (const s of [-1, 1]) {
        bx(0.99, 0.035, 0.06, goldM, x, 0.5 + s * 0.29, 0.43, g);
        bx(0.035, 0.6, 0.06, goldM, x + s * 0.485, 0.5, 0.43, g);
      }
    }
    for (let i = -1; i <= 1; i++) { // золотые монеты-медальоны по центру филёнок
      const c = cyl(0.14, 0.14, 0.04, goldM, i * 1.05, 0.5, 0.46, g, 14); c.rotation.x = Math.PI / 2;
      bx(0.07, 0.07, 0.05, M(COL.redD), i * 1.05, 0.5, 0.485, g);
    }
    bx(3.7, 0.09, 1.1, woodL, 0, 0.93, 0, g);                   // столешница
    bx(3.74, 0.03, 1.14, goldM, 0, 0.885, 0, g);                // золотая кромка снизу
    const top = 0.975;
    // Весы: стойка, коромысло, две чаши на цепочках.
    const sc = new THREE.Group(); sc.position.set(-1.25, top, 0.05); g.add(sc);
    cyl(0.04, 0.06, 0.7, goldM, 0, 0.35, 0, sc, 6);
    bx(0.5, 0.07, 0.07, goldM, 0, 0.72, 0, sc);
    this.beam = new THREE.Group(); this.beam.position.y = 0.72; sc.add(this.beam);
    bx(0.7, 0.04, 0.05, goldM, 0, 0, 0, this.beam);
    for (const s of [-1, 1]) {
      const pan = new THREE.Group(); pan.position.set(s * 0.33, -0.3, 0); this.beam.add(pan);
      cyl(0.16, 0.05, 0.04, goldM, 0, -0.05, 0, pan, 12);
      for (const a of [0, 1, 2]) { // цепочки
        const ch = bx(0.012, 0.3, 0.012, goldM, Math.cos(a * 2.1) * 0.12, 0.1, Math.sin(a * 2.1) * 0.12, pan);
        ch.rotation.z = Math.cos(a * 2.1) * 0.2; ch.rotation.x = Math.sin(a * 2.1) * 0.2;
      }
      pan.userData.s = s;
    }
    // Банки с разноцветными светящимися шариками.
    [[-0.55, 0xff8a5a], [-0.2, 0x7be0ff]].forEach(([x, c], k) => {
      const jar = new THREE.Group(); jar.position.set(x, top, 0.05); g.add(jar);
      cyl(0.15, 0.15, 0.3, new THREE.MeshStandardMaterial({ color: 0xcfe6ff, transparent: true, opacity: 0.28, roughness: 0.1 }), 0, 0.15, 0, jar, 12);
      for (let i = 0; i < 6; i++) {
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.045, 0), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.7, flatShading: true }));
        b.position.set((((i * 37 + k * 11) % 10) / 10 - 0.5) * 0.18, 0.05 + (i % 3) * 0.07, (((i * 53) % 10) / 10 - 0.5) * 0.18);
        jar.add(b);
      }
      cyl(0.16, 0.16, 0.04, M(COL.red), 0, 0.32, 0, jar, 12);
    });
    // Стопки монет.
    [[0.35, 4], [0.5, 2], [0.65, 3]].forEach(([x, n], k) => {
      for (let i = 0; i < n; i++) cyl(0.075, 0.075, 0.03, goldM, x, top + 0.015 + i * 0.033, 0.3 - (k % 2) * 0.12, g, 10);
    });
    // Счёты.
    const ab = new THREE.Group(); ab.position.set(0.95, top + 0.17, 0.25); ab.rotation.x = -0.35; g.add(ab);
    bx(0.62, 0.34, 0.05, M(COL.woodD), 0, 0, 0, ab);
    bx(0.54, 0.26, 0.06, M(0x2a1c14), 0, 0, 0, ab);
    for (let r = 0; r < 4; r++) {
      bx(0.54, 0.012, 0.07, goldM, 0, -0.1 + r * 0.067, 0, ab);
      for (let i = 0; i < 5; i++) {
        const bd = new THREE.Mesh(new THREE.IcosahedronGeometry(0.028, 0), M(i % 2 ? COL.red : COL.cream));
        bd.scale.set(1.2, 1, 0.8);
        bd.position.set(-0.22 + i * 0.045 + (i > 2 ? 0.14 : 0), -0.1 + r * 0.067, 0.045);
        ab.add(bd);
      }
    }
    // Открытая книга учёта и перо.
    const bk = new THREE.Group(); bk.position.set(1.4, top + 0.03, -0.12); bk.rotation.y = -0.3; g.add(bk);
    bx(0.5, 0.05, 0.36, M(COL.redD), 0, 0, 0, bk);
    for (const s of [-1, 1]) { const p = bx(0.23, 0.03, 0.32, M(COL.cream), s * 0.12, 0.04, 0, bk); p.rotation.z = -s * 0.06; }
    const quill = cyl(0.008, 0.008, 0.38, M(0xf4f0e0), 1.12, top + 0.2, 0.1, g, 4); quill.rotation.z = 0.5; quill.rotation.x = 0.3;
    // Звонок у края и табличка «цены не обсуждаются».
    cyl(0.1, 0.1, 0.05, goldM, 0.1, top + 0.025, 0.38, g, 14);
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), goldM); bell.position.set(0.1, top + 0.05, 0.38); g.add(bell);
    this.scene.add(g);
  }

  /** Полосатый навес на двух столбах с зубчатой бахромой и двумя бумажными фонарями. */
  buildAwning() {
    const g = new THREE.Group();
    g.position.set(0, 3.0, 0.7);
    const n = 10, W = 4.4;
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + (i + 0.5) * (W / n);
      const sl = bx(W / n, 0.06, 1.7, M(i % 2 ? COL.cream : COL.red), x, 0, 0, g);
      sl.rotation.x = 0.28;
      const sc = new THREE.Mesh(new THREE.ConeGeometry(W / n / 2, 0.2, 4), M(i % 2 ? COL.cream : COL.red)); // зубец бахромы
      sc.rotation.set(Math.PI, Math.PI / 4, 0);
      sc.position.set(x, -0.43, 0.83);
      g.add(sc);
    }
    for (const s of [-1, 1]) cyl(0.07, 0.08, 3.1, M(COL.woodD), s * 2.1, -1.4, 0.9, g, 6);
    bx(W + 0.3, 0.1, 0.12, M(COL.woodD), 0, -0.05, 0.85, g).rotation.x = 0.28;
    this.scene.add(g);
    // Фонари под навесом, раскачиваются.
    this.lanterns = [];
    for (const x of [-1.55, 1.55]) {
      const l = new THREE.Group(); l.position.set(x, 2.55, 1.0);
      cyl(0.006, 0.006, 0.35, M(COL.woodD), 0, 0.18, 0, l, 4);
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshStandardMaterial({ color: 0xd44a3a, emissive: 0xff5a3a, emissiveIntensity: 0.9, flatShading: true }));
      body.scale.set(1, 1.2, 1); body.position.y = -0.12; l.add(body);
      cyl(0.12, 0.12, 0.04, M(COL.gold, 0.4, { metalness: 0.5 }), 0, 0.08, 0, l, 8);
      cyl(0.08, 0.08, 0.04, M(COL.gold, 0.4, { metalness: 0.5 }), 0, -0.36, 0, l, 8);
      const gl = glow('255,150,80', 1.6); gl.position.y = -0.12; l.add(gl);
      const pl = new THREE.PointLight(0xffa860, 3, 5, 1.6); pl.position.y = -0.1; l.add(pl);
      l.userData = { x, gl, pl, ph: x };
      this.scene.add(l);
      this.lanterns.push(l);
    }
  }

  /** dt; rect: DOM-прямоугольник витрины; box: DOM-прямоугольник канваса. */
  render(dt, rect, box) {
    this.t += dt;
    const t = this.t;
    this.dog.update(dt, 0, 6);
    this.beam.rotation.z = 0.12 * Math.sin(t * 0.9);
    for (const pan of this.beam.children.filter((c) => c.userData.s)) pan.rotation.z = -this.beam.rotation.z;
    for (const l of this.lanterns) {
      const u = l.userData;
      l.rotation.z = 0.06 * Math.sin(t * 1.3 + u.ph);
      const f = 0.85 + 0.15 * Math.sin(t * 5 + u.ph * 3) * Math.sin(t * 2.3 + u.ph);
      u.gl.material.opacity = f; u.pl.intensity = 3 * f;
    }
    const w = Math.max(1, rect.width), h = Math.max(1, rect.height);
    const asp = w / h;
    this.camera.aspect = asp;
    this.camera.fov = 30;
    this.camera.updateProjectionMatrix();
    const need = 2.5; // нужная половина ширины сцены в метрах (до столбов навеса)
    const dist = Math.max(7.2, need / (Math.tan((30 * Math.PI) / 360) * asp));
    this.camera.position.set(0, 1.9, dist);
    this.camera.lookAt(0, 1.55, 0);

    const r = this.renderer;
    const prev = new THREE.Color();
    r.getClearColor(prev);
    r.setScissorTest(false);
    r.setViewport(0, 0, box.width, box.height);
    r.setClearColor(this.bg, 1);
    r.clear();
    const x = rect.left - box.left;
    const y = box.height - (rect.bottom - box.top);
    r.setViewport(x, y, w, h);
    r.setScissor(x, y, w, h);
    r.setScissorTest(true);
    r.render(this.scene, this.camera);
    r.setScissorTest(false);
    r.setViewport(0, 0, box.width, box.height);
    r.setClearColor(prev, 1);
  }
}
