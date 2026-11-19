// 3D-витрина окна инвентаря: маг со своим посохом и открытый фолиант, парящий рядом. Отдельная сцена, рисуется тем же
// рендерером в прямоугольник сверху окна (остальное закрыто DOM-панелью). Снаружи: render(dt, rect, canvasH).
import * as THREE from 'three';
import { Hero } from './hero.js';

const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();

function pageTexture(flip) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 168;
  const g = c.getContext('2d');
  g.fillStyle = '#ece4cf'; g.fillRect(0, 0, 128, 168);
  g.fillStyle = 'rgba(90,70,50,0.55)';
  for (let y = 62; y < 150; y += 9) { // строчки текста: чёрточки разной длины
    let x = 14;
    while (x < 112) { const w = 6 + ((x * 7 + y * 13) % 17); g.fillRect(x, y, Math.min(w, 112 - x), 2.5); x += w + 4; }
  }
  g.strokeStyle = '#1fc8e6'; g.lineWidth = 3; g.shadowColor = '#35f2ff'; g.shadowBlur = 10; // светящаяся руна-печать
  g.beginPath(); g.arc(64, 30, 17, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.moveTo(64, 15); g.lineTo(76, 30); g.lineTo(64, 45); g.lineTo(52, 30); g.closePath(); g.stroke(); // ромб в круге
  g.beginPath(); g.arc(64, 30, 2.5, 0, Math.PI * 2); g.fillStyle = '#9fefff'; g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (flip) { t.wrapS = THREE.RepeatWrapping; t.repeat.x = -1; }
  return t;
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(120,230,255,0.8)'); gr.addColorStop(1, 'rgba(120,230,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Открытый фолиант: обложка, две страницы углом «V», светящиеся руны. Центр в корешке. */
function openTome(glowTex) {
  const g = new THREE.Group();
  const cover = new THREE.MeshStandardMaterial({ color: 0x3a2a3d, roughness: 0.8, flatShading: true });
  const gold = new THREE.MeshStandardMaterial({ color: 0xc9a25a, roughness: 0.45, metalness: 0.5, flatShading: true });
  const PW = 0.62, PH = 0.82;
  for (const s of [-1, 1]) {
    const half = new THREE.Group();
    half.rotation.y = s * 0.28;           // страницы лежат углом: корешок ниже, края приподняты к зрителю
    half.rotation.z = 0;
    const back = new THREE.Mesh(new THREE.BoxGeometry(PW + 0.06, PH + 0.06, 0.05), cover);
    back.position.set(s * (PW / 2 + 0.02), 0, -0.05);
    half.add(back);
    const block = new THREE.Mesh(new THREE.BoxGeometry(PW, PH, 0.07), new THREE.MeshStandardMaterial({ color: 0xe6dcc4, roughness: 0.95 }));
    block.position.set(s * (PW / 2 + 0.02), 0, 0);
    half.add(block);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(PW - 0.04, PH - 0.04), new THREE.MeshBasicMaterial({ map: pageTexture(s < 0) }));
    face.position.set(s * (PW / 2 + 0.02), 0, 0.037);
    half.add(face);
    for (const sy of [-1, 1]) { // золотые уголки по внешним краям
      const k = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), gold);
      k.position.set(s * (PW + 0.02), sy * (PH / 2 + 0.01), -0.04);
      half.add(k);
    }
    g.add(half);
  }
  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.06, PH + 0.08, 0.1), cover);
  spine.position.z = -0.05;
  g.add(spine);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.set(2.2, 2.2, 1);
  glow.position.z = 0.15;
  g.add(glow);
  g.userData.glow = glow;
  return g;
}

export class InventoryView {
  /** renderer: рендерер игры (тот же канвас) */
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
    this.t = 0;
    const sc = this.scene;
    sc.add(new THREE.HemisphereLight(0xcfdcff, 0x3a4560, 1.15));
    const key = new THREE.DirectionalLight(0xffffff, 1.3); key.position.set(3, 6, 6); sc.add(key);
    const rim = new THREE.DirectionalLight(0x7fb4ff, 0.9); rim.position.set(-5, 3, -4); sc.add(rim);
    this.tomeLight = new THREE.PointLight(0x5fe6ff, 6, 6, 1.6);
    sc.add(this.tomeLight);

    this.hero = new Hero();
    this.hero.tome.visible = false; // фолиант в руке прячем: он открыт и парит рядом
    sc.add(this.hero.group);
    this.motion = { x: 0, z: 0, vx: 0, vz: 0, speed: 0, dashing: false, glideT: 0 };

    const glowTex = glowTexture();
    this.tome = openTome(glowTex);
    sc.add(this.tome);
    // Мишени для нажатий: меши фолианта и посоха (у посоха ещё невидимая толстая «гильза», тонкое древко иначе не поймать).
    const proxy = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 2.1, 6), new THREE.MeshBasicMaterial({ visible: false }));
    proxy.position.y = 0.55;
    this.hero.staff.add(proxy);
    this.hits = { tome: [], staff: [] };
    this.tome.traverse((o) => { if (o.isMesh) this.hits.tome.push(o); });
    this.hero.staff.traverse((o) => { if (o.isMesh) this.hits.staff.push(o); });
    this.parts = { tome: this.tome, staff: this.hero.staff };

    // Мягкое пятно света под героем и пылинки вокруг.
    const spot = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
    spot.rotation.x = -Math.PI / 2; spot.position.y = 0.02;
    sc.add(spot);
    this.motes = [];
    const moteGeo = new THREE.OctahedronGeometry(0.035, 0);
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(moteGeo, new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.userData = { a: Math.random() * 6.28, r: 0.9 + Math.random() * 1.3, y: Math.random() * 2.6, sp: 0.1 + Math.random() * 0.18, ph: Math.random() * 6 };
      this.motes.push(m);
      sc.add(m);
    }
    this.bg = new THREE.Color(0x0b1120);
  }

  /** Показать или спрятать предмет витрины ('tome' или 'staff'): спрятан, когда снят или его тащат. */
  setVisible(slot, on) {
    this.parts[slot].visible = on;
    if (slot === 'tome') this.tomeLight.visible = on;
  }

  /** Попадает ли точка экрана (cx, cy) в предмет витрины slot? rect: прямоугольник витрины. Нужен хотя бы один кадр render. */
  hit(slot, cx, cy, rect) {
    if (!this.parts[slot].visible) return false;
    _ndc.set(((cx - rect.left) / rect.width) * 2 - 1, -(((cy - rect.top) / rect.height) * 2 - 1));
    _ray.setFromCamera(_ndc, this.camera);
    this.scene.updateMatrixWorld(true);
    return _ray.intersectObjects(this.hits[slot], false).length > 0;
  }

  /** dt; rect: DOM-прямоугольник витрины (px относительно окна); box: DOM-прямоугольник канваса. */
  render(dt, rect, box) {
    this.t += dt;
    const t = this.t;
    this.hero.update(dt, this.motion, 6);
    // Поза: маг чуть повёрнут к фолианту, левая рука поднята ладонью под книгой, правая вытянута в сторону с посохом.
    const mage = this.hero;
    mage.group.rotation.y = -0.28 + 0.06 * Math.sin(t * 0.5);
    mage.head.rotation.y = -0.22;
    mage.arms[0].rotation.set(-0.35 + 0.03 * Math.sin(t * 1.6), 0, -1.05);
    mage.arms[1].rotation.set(-0.12, 0, 0.8 + 0.02 * Math.sin(t * 1.3));
    mage.staff.rotation.set(0, 0, -0.8 + 0.26); // посох отклонён наружу, а не вдоль руки
    this.tome.position.set(-1.45, 1.6 + 0.07 * Math.sin(t * 1.6), 0.35);
    this.tome.scale.setScalar(1.15);
    this.tome.rotation.set(-0.3 + 0.03 * Math.sin(t * 1.1), 0.42 + 0.1 * Math.sin(t * 0.7), 0.06 + 0.04 * Math.sin(t * 0.9));
    this.tome.userData.glow.material.opacity = 0.45 + 0.15 * Math.sin(t * 2.4);
    this.tomeLight.position.set(-1.45, 1.9, 1.3);
    for (const m of this.motes) {
      const u = m.userData;
      u.y += dt * u.sp; if (u.y > 2.8) u.y = 0;
      const a = u.a + t * 0.2;
      m.position.set(Math.cos(a) * u.r, u.y, Math.sin(a) * u.r * 0.5);
      m.material.opacity = 0.7 * Math.sin((u.y / 2.8) * Math.PI);
    }

    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1 ? 36 : 28;
    this.camera.updateProjectionMatrix();
    this.camera.position.set(0, 1.5, 8.0);
    this.camera.lookAt(-0.3, 1.2, 0);

    const r = this.renderer;
    const prev = new THREE.Color();
    r.getClearColor(prev);
    r.setScissorTest(false);
    r.setViewport(0, 0, box.width, box.height);
    r.setClearColor(this.bg, 1);
    r.clear();
    const x = rect.left - box.left;
    const y = box.height - (rect.bottom - box.top); // у WebGL ось y снизу
    r.setViewport(x, y, w, h);
    r.setScissor(x, y, w, h);
    r.setScissorTest(true);
    r.render(this.scene, this.camera);
    r.setScissorTest(false);
    r.setViewport(0, 0, box.width, box.height);
    r.setClearColor(prev, 1);
  }
}
