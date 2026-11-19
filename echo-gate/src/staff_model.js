// 3D-модели для экрана посоха: большой посох мага (три части: голова, кольцо, наконечник) и кристалл усиления.
// Всё из примитивов Three.js: тонированная древесина, золото и железо с отражением окружения, светящиеся кристаллы и ореолы.
import * as THREE from 'three';

let haloTex = null;
function halo() {
  if (haloTex) return haloTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  haloTex = new THREE.CanvasTexture(c);
  haloTex.colorSpace = THREE.SRGBColorSpace;
  return haloTex;
}

function sprite(color, size, opacity) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.set(size, size, 1);
  return s;
}

/** Окружение для отражений металла: небо-градиент с яркими пятнами света. */
export function makeEnvironment(renderer) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#9fc4ff');
  gr.addColorStop(0.5, '#3a4f7a');
  gr.addColorStop(1, '#10151f');
  g.fillStyle = gr;
  g.fillRect(0, 0, 512, 256);
  g.fillStyle = '#fff6e0';
  g.fillRect(60, 40, 90, 44);
  g.fillStyle = '#9fe6ff';
  g.fillRect(330, 70, 60, 70);
  g.fillStyle = '#ffd9a0';
  g.fillRect(200, 20, 50, 30);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromEquirectangular(tex).texture;
  tex.dispose();
  pm.dispose();
  return env;
}

const lathe = (pts, seg) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

/** Посох. Возвращает { group, parts: { power, speed, range }, height, centers, update(t) }. Единицы модели: 1 = около трети посоха. */
export function buildStaff() {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x6a4428, roughness: 0.62, metalness: 0.05 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xf2c768, roughness: 0.28, metalness: 0.95 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x9aa8c2, roughness: 0.3, metalness: 0.9 });
  const gem = new THREE.MeshStandardMaterial({ color: 0x4fd0ff, emissive: 0x1478c8, emissiveIntensity: 0.55, roughness: 0.18, metalness: 0.1, flatShading: true });
  const core = new THREE.MeshBasicMaterial({ color: 0x9fe4ff });
  const rune = new THREE.MeshStandardMaterial({ color: 0x7fe6ff, emissive: 0x39c6ff, emissiveIntensity: 1.1, roughness: 0.2 });

  // Древко: слегка суженное, с утолщениями-сучками.
  const shaft = [];
  for (let y = -1.3; y <= 1.1; y += 0.05) shaft.push([0.04 + 0.008 * Math.sin(y * 7) + 0.006 * Math.sin(y * 17 + 1) + (y < -0.5 ? 0.0 : 0.004), y]);
  group.add(new THREE.Mesh(lathe(shaft, 14), wood));
  for (const y of [-0.45, 0.62, 0.9]) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.047, 0.011, 8, 20), gold);
    r.rotation.x = Math.PI / 2;
    r.position.y = y;
    group.add(r);
  }

  // Голова (Power): золотая чаша, пять когтей, большой светящийся кристалл, искры.
  const power = new THREE.Group();
  power.position.y = 1.45;
  const cup = new THREE.Mesh(lathe([[0.03, -0.36], [0.075, -0.3], [0.11, -0.2], [0.07, -0.18], [0.04, -0.2]], 16), gold);
  power.add(cup);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const pts = [[0.09, -0.24], [0.21, -0.1], [0.27, 0.12], [0.2, 0.36], [0.07, 0.5]].map(([r, y]) => new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
    const claw = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 18, 0.02, 6), gold);
    power.add(claw);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.09, 6), gold);
    tip.position.copy(pts[4]);
    tip.rotation.z = -0.5 * Math.cos(a);
    tip.rotation.x = 0.5 * Math.sin(a);
    power.add(tip);
  }
  const orb = new THREE.Group();
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 1).scale(1, 1.45, 1), gem);
  const inner = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0).scale(1, 1.4, 1), core);
  orb.add(crystal, inner);
  orb.position.y = 0.12;
  power.add(orb);
  const powerHalo = sprite(0x4fb8ff, 1.3, 0.4);
  powerHalo.position.y = 0.12;
  power.add(powerHalo);
  const sparks = [];
  for (let i = 0; i < 7; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshBasicMaterial({ color: 0xb9f0ff }));
    power.add(s);
    sparks.push({ m: s, a: (i / 7) * Math.PI * 2, r: 0.36 + 0.06 * (i % 3), y: 0.0 + 0.1 * (i % 4), sp: 0.7 + 0.15 * i });
  }
  group.add(power);

  // Кольцо (Speed): золотая муфта и вращающееся парящее рунное кольцо с камнями.
  const speed = new THREE.Group();
  speed.position.y = 0.2;
  const collar = new THREE.Mesh(lathe([[0.05, -0.09], [0.085, -0.06], [0.085, 0.06], [0.05, 0.09]], 16), gold);
  speed.add(collar);
  const ring = new THREE.Group();
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.016, 10, 56), rune);
  band.rotation.x = Math.PI / 2;
  ring.add(band);
  const band2 = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.006, 6, 56), gold);
  band2.rotation.x = Math.PI / 2;
  band2.position.y = 0.035;
  ring.add(band2);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.04, 0).scale(1, 1.4, 1), gem);
    m.position.set(Math.cos(a) * 0.26, 0, Math.sin(a) * 0.26);
    ring.add(m);
  }
  speed.add(ring);
  const speedHalo = sprite(0x62d6ff, 1.0, 0.35);
  speed.add(speedHalo);
  group.add(speed);

  // Наконечник (Range): золотой бугель и железное остриё с рунным светящимся кончиком.
  const range = new THREE.Group();
  range.position.y = -1.2;
  const band3 = new THREE.Mesh(new THREE.TorusGeometry(0.056, 0.016, 8, 20), gold);
  band3.rotation.x = Math.PI / 2;
  band3.position.y = 0.16;
  range.add(band3);
  const ferrule = new THREE.Mesh(lathe([[0.052, 0.12], [0.068, 0.04], [0.06, -0.06], [0.034, -0.2], [0.012, -0.34], [0.0, -0.4]], 14), iron);
  range.add(ferrule);
  const tipGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.03, 0).scale(1, 1.6, 1), rune);
  tipGem.position.y = -0.36;
  range.add(tipGem);
  const rangeHalo = sprite(0x62d6ff, 0.8, 0.3);
  rangeHalo.position.y = -0.3;
  range.add(rangeHalo);
  group.add(range);

  const parts = {
    power: { g: power, halo: powerHalo, mats: [gem, core], base: [0.55, 1], haloBase: 0.4 },
    speed: { g: speed, halo: speedHalo, mats: [rune], base: [1.1], haloBase: 0.35 },
    range: { g: range, halo: rangeHalo, mats: [rune], base: [1.1], haloBase: 0.3 },
  };
  const rangeY = { top: 1.95, bottom: -1.6 };

  return {
    group,
    parts,
    top: rangeY.top,
    bottom: rangeY.bottom,
    centers: { power: 1.5, speed: 0.2, range: -1.2 },
    /** Анимация: орбита искр, вращение кольца, покачивание кристалла. */
    update(t) {
      orb.rotation.y = t * 0.8;
      orb.position.y = 0.12 + Math.sin(t * 1.6) * 0.018;
      for (const s of sparks) {
        const a = s.a + t * s.sp;
        s.m.position.set(Math.cos(a) * s.r, s.y + Math.sin(t * 1.3 + s.a) * 0.05, Math.sin(a) * s.r);
      }
      ring.rotation.y = t * 1.5;
      ring.rotation.x = Math.sin(t * 1.1) * 0.08;
      ring.rotation.z = Math.cos(t * 0.9) * 0.08;
      tipGem.rotation.y = t * 2;
    },
    /** Подсветка части: v = 0 обычная, 1 яркая вспышка. */
    pulse(name, v) {
      const p = parts[name];
      p.mats.forEach((m, i) => { m.emissiveIntensity = p.base[i] * (1 + v * 1.1); });
      p.halo.material.opacity = Math.min(1, p.haloBase * (1 + v * 1.4));
      const k = 1 + v * 0.06;
      p.g.scale.setScalar(k);
    },
  };
}

/** Кристалл усиления: светящаяся двойная пирамида в оболочке свечения. Высота около 1. */
export function buildGem() {
  const group = new THREE.Group();
  const pts = [[0.0001, -0.5], [0.2, -0.12], [0.2, 0.12], [0.0001, 0.5]].map(([r, y]) => new THREE.Vector2(r, y));
  const body = new THREE.Mesh(
    new THREE.LatheGeometry(pts, 6),
    new THREE.MeshStandardMaterial({ color: 0xffa233, emissive: 0xff7a14, emissiveIntensity: 0.6, roughness: 0.18, metalness: 0.15, flatShading: true }),
  );
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0).scale(1, 1.8, 1), new THREE.MeshBasicMaterial({ color: 0xffd27a }));
  const shell = new THREE.Mesh(new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p.x * 1.18, p.y * 1.1)), 6), new THREE.MeshBasicMaterial({ color: 0xffb04a, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
  const glow = sprite(0xffa23a, 2.1, 0.7);
  group.add(glow, body, core, shell);
  group.userData.glow = glow;
  return group;
}
