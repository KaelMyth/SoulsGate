// Торговый вагончик хаба: китайская лавка на колёсах с красной крышей, бумажными фонарями и вывеской SHOP.
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
    this.t = 0;
    this.steam = [];
    this.cat = null;
    const W = 5.2, D = 2.8, base = 0.5, postH = 3.3;
    const red = mat(C.red), redD = mat(C.redDark), gold = mat(C.gold, 0.5), wood = mat(C.wood), woodD = mat(C.woodDark);
    const hw = W / 2, hd = D / 2;

    // Колёса и платформа.
    for (const sx of [-1, 1]) for (const sz of [-0.9, 0.9]) {
      const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.22, 10), woodD);
      wh.rotation.z = Math.PI / 2;
      wh.position.set(sx * (hw + 0.05), 0.5, sz);
      this.group.add(wh);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.28, 6), gold);
      hub.rotation.z = Math.PI / 2;
      hub.position.copy(wh.position);
      this.group.add(hub);
    }
    box(W + 0.2, 0.18, D + 0.2, wood, 0, base, 0, this.group);

    // Задняя и боковые стенки (тёмные внутри, красные снаружи), нижний ряд спереди = прилавок.
    box(W, postH - base, 0.14, mat(C.inner), 0, base + (postH - base) / 2, -hd + 0.07, this.group);
    for (const sx of [-1, 1]) box(0.14, postH - base, D, redD, sx * (hw - 0.07), base + (postH - base) / 2, 0, this.group);
    const counterH = 0.75;
    box(W, counterH, 0.4, red, 0, base + counterH / 2, hd - 0.2, this.group);
    box(W + 0.16, 0.1, 0.62, wood, 0, base + counterH + 0.05, hd - 0.15, this.group); // столешница
    // Золотая кайма прилавка и красные полосы-панели.
    box(W, 0.06, 0.42, gold, 0, base + 0.1, hd - 0.2, this.group);
    for (let i = -2; i <= 2; i++) box(0.8, 0.4, 0.04, redD, i * 1.1, base + 0.42, hd + 0.01, this.group);

    // Столбики и крыша.
    for (const sx of [-1, 1]) {
      box(0.18, postH - base, 0.18, gold, sx * (hw - 0.05), base + (postH - base) / 2, hd - 0.05, this.group);
      box(0.18, postH - base, 0.18, gold, sx * (hw - 0.05), base + (postH - base) / 2, -hd + 0.05, this.group);
    }
    box(W + 0.3, 0.14, D + 0.3, redD, 0, postH, 0, this.group); // потолочная рама
    // Крыша низкая и без вылета над проёмом: камера смотрит сверху под 35°, высокий скат закрыл бы хаски.
    const pyr = (h, color, ox, oz, y) => {
      const g = new THREE.ConeGeometry(1, h, 4);
      g.rotateY(Math.PI / 4);
      const m = new THREE.Mesh(g, color);
      m.scale.set((W + ox) / 1.414, 1, (D + oz) / 1.414);
      m.position.y = y;
      this.group.add(m);
    };
    pyr(0.55, red, 0.9, 0.9, postH + 0.07 + 0.275);
    pyr(0.22, gold, 1.15, 1.15, postH + 0.07 + 0.09); // золотая кайма: нижний слой чуть шире
    // Загнутые вверх углы крыши.
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.55, 4), gold);
      tip.position.set(sx * (W / 2 + 0.6), postH + 0.2, sz * (D / 2 + 0.6));
      tip.rotation.set(sz * 0.7, 0, -sx * 0.7);
      this.group.add(tip);
    }
    const fin = new THREE.Mesh(new THREE.IcosahedronGeometry(0.17, 0), gold);
    fin.position.y = postH + 0.07 + 0.62;
    this.group.add(fin);

    // Вывеска SHOP: большая светящаяся доска стоит на крыше у переднего края и чуть откинута назад (видна с камеры целиком).
    const signW = 4.8, signH = 1.5;
    const signG = new THREE.Group();
    signG.position.set(0, postH + 0.5 + signH / 2, hd - 0.1);
    signG.rotation.x = -0.18;
    const sign = new THREE.Mesh(new THREE.BoxGeometry(signW, signH, 0.14), mat(C.redDark));
    signG.add(sign);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(signW - 0.12, signH - 0.12), new THREE.MeshBasicMaterial({ map: signTexture('SHOP') }));
    face.position.z = 0.075;
    signG.add(face);
    for (const sx of [-1, 1]) box(0.12, 0.5, 0.12, gold, sx * (signW / 2 - 0.3), -signH / 2 - 0.1, 0, signG); // ножки
    this.group.add(signG);

    // Внутри: полка с баночками и тёплая лампа.
    box(W - 0.8, 0.08, 0.5, wood, 0, base + 1.55, -hd + 0.4, this.group);
    const jarCols = [0xd98a96, 0x8fdcff, 0xe0a93e, 0xa6d88a, 0xd98a96];
    jarCols.forEach((c, i) => {
      const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.32, 6), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.25, roughness: 0.6, flatShading: true }));
      jar.position.set(-2 + i * 1.0, base + 1.75, -hd + 0.4);
      this.group.add(jar);
    });

    // Хаски за прилавком.
    this.husky = new Husky();
    this.husky.group.position.set(0, base + 0.55, hd - 1.2); // повыше, чтобы голова не уходила в стол
    this.husky.group.scale.setScalar(1.18);
    this.group.add(this.husky.group);

    // Фонари: пять красных бумажных по линии крыши (передний край) и два по бокам, качаются.
    this.lanterns = [];
    const lanternMat = new THREE.MeshStandardMaterial({ color: 0xff5a3c, emissive: 0xff4a28, emissiveIntensity: 1.1, roughness: 0.7, flatShading: true });
    const mk = (x, y, z, s) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.28 * s, 8, 6), lanternMat);
      body.scale.y = 0.85;
      body.position.y = -0.42 * s;
      g.add(body);
      for (const dy of [-0.16, -0.68]) {
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.12 * s, 0.06 * s, 6), gold);
        cap.position.y = dy * s;
        g.add(cap);
      }
      const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.05 * s, 0.3 * s, 4), gold);
      tassel.rotation.x = Math.PI;
      tassel.position.y = -0.85 * s;
      g.add(tassel);
      const gl = softGlow('rgba(255,150,80,A)', 2.6 * s);
      gl.position.y = -0.42 * s;
      g.add(gl);
      g.userData = { ph: Math.random() * 6 };
      this.group.add(g);
      this.lanterns.push(g);
    };
    const ly = postH - 0.05;
    for (const sx of [-1, 1]) {
      mk(sx * (hw + 0.45), ly + 0.1, hd + 0.35, 0.9);
      mk(sx * (hw + 0.45), ly + 0.1, -0.1, 0.8);
      mk(sx * (hw + 0.45), ly + 0.1, -hd + 0.2, 0.8);
    }

    // Мягкий свет ламп: тёплый заполняющий внутри и два спереди. Без резких пятен: большой радиус, малая сила.
    const inner = new THREE.PointLight(0xffc98a, 7, 7, 1.5);
    inner.position.set(0, 2.3, 0.2);
    this.group.add(inner);
    const front = new THREE.PointLight(0xff9a5c, 6, 9, 1.5);
    front.position.set(0, 2.2, hd + 1.3);
    this.group.add(front);
    this.lights = [inner, front];
    const pool = softGlow('rgba(255,170,100,A)', 11); // тёплое пятно на земле перед лавкой (плоское, чтобы земля его не обрезала)
    const poolMesh = new THREE.Mesh(new THREE.PlaneGeometry(11, 11), new THREE.MeshBasicMaterial({
      map: pool.material.map, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    poolMesh.rotation.x = -Math.PI / 2;
    poolMesh.position.set(0, 0.04, hd + 1.0);
    const pool_ = poolMesh;
    this.group.add(pool_);
    this.decorate(W, D, base, counterH);
    this.update(0);
  }

  /** Убранство прилавка: красно-золотая дорожка, пароварки, чайник, кот-манэки, светящиеся склянки, ящики. */
  decorate(W, D, base, counterH) {
    const hd = D / 2;
    const top = base + counterH + 0.1;   // уровень столешницы
    const zc = hd - 0.15;                // середина столешницы по z
    const G = this.group;
    const gold = mat(C.gold, 0.45);
    // Светлая столешница и дорожка: стол теперь не сливается с тёмным фоном.
    box(W + 0.16, 0.03, 0.62, mat(0xc79a62), 0, top + 0.015, zc, G);
    box(W - 0.3, 0.025, 0.5, mat(0xb8372f), 0, top + 0.04, zc + 0.02, G);
    for (const sx of [-1, 1]) box(0.05, 0.03, 0.5, gold, sx * (W / 2 - 0.5), top + 0.06, zc + 0.02, G);
    // Золотая кайма по верхнему краю фасада и светящиеся «окошки» панелей.
    box(W + 0.2, 0.05, 0.05, gold, 0, top - 0.02, hd + 0.17, G);
    for (let i = -2; i <= 2; i++) {
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.02), new THREE.MeshBasicMaterial({ color: 0xffb25a }));
      w.position.set(i * 1.1, base + 0.42, hd + 0.04);
      G.add(w);
    }

    // Стопка бамбуковых пароварок слева, над ними пар.
    const bam = mat(0xd8b46a), bamD = mat(0x9c7a3e);
    const sx0 = -1.75, sz0 = zc;
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.14, 10), bam);
      r.position.set(sx0, top + 0.1 + i * 0.15, sz0);
      G.add(r);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.03, 10), bamD);
      band.position.set(sx0, top + 0.1 + i * 0.15 + 0.03, sz0);
      G.add(band);
    }
    const lid = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.16, 10), bamD);
    lid.position.set(sx0, top + 0.1 + 3 * 0.15 + 0.02, sz0);
    G.add(lid);
    this.steam = [];
    const steamTex = new THREE.CanvasTexture((() => {
      const c = document.createElement('canvas'); c.width = c.height = 32;
      const g = c.getContext('2d'); const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      gr.addColorStop(0, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 32, 32); return c;
    })());
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: steamTex, transparent: true, depthWrite: false, opacity: 0 }));
      s.userData = { life: i / 4, x: sx0 + (i % 2 ? 0.1 : -0.1), y: top + 0.75, z: sz0, ph: i * 1.7 };
      this.steam.push(s);
      G.add(s);
    }

    // Чайник и две чашки справа.
    const tea = mat(0x5fb0a8, 0.4);
    const pot = new THREE.Mesh(new THREE.SphereGeometry(0.24, 9, 7), tea);
    pot.scale.y = 0.8;
    pot.position.set(1.55, top + 0.2, zc);
    G.add(pot);
    const potLid = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.12, 6), gold);
    potLid.position.set(1.55, top + 0.43, zc);
    G.add(potLid);
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.06, 0.28, 5), tea);
    spout.position.set(1.8, top + 0.26, zc);
    spout.rotation.z = -0.9;
    G.add(spout);
    for (const dx of [0.0, 0.3]) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.06, 0.1, 8), mat(0xeef3f8, 0.4));
      cup.position.set(1.4 + dx, top + 0.05, zc + 0.2);
      G.add(cup);
    }

    // Кот-манэки у правого края: белый, красный воротник, золотая монета, машущая лапа.
    const cat = new THREE.Group();
    cat.position.set(2.2, top, zc);
    const white = mat(0xf2f5f9);
    const cb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), white);
    cb.scale.y = 1.1; cb.position.y = 0.22; cat.add(cb);
    const ch = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), white);
    ch.position.y = 0.52; cat.add(ch);
    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 4), white);
      ear.position.set(sx * 0.11, 0.69, 0); cat.add(ear);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 5, 4), new THREE.MeshBasicMaterial({ color: 0x14171e }));
      eye.position.set(sx * 0.06, 0.55, 0.15); cat.add(eye);
    }
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.03, 5, 10), mat(0xb8372f));
    collar.rotation.x = Math.PI / 2; collar.position.y = 0.38; cat.add(collar);
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.025, 8), new THREE.MeshStandardMaterial({ color: C.gold, emissive: C.gold, emissiveIntensity: 0.35, roughness: 0.4, flatShading: true }));
    coin.rotation.x = Math.PI / 2; coin.position.set(0, 0.28, 0.2); cat.add(coin);
    const arm = new THREE.Group();
    arm.position.set(0.17, 0.35, 0.05);
    const paw = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.16, 3, 6), white);
    paw.position.y = 0.1; arm.add(paw);
    cat.add(arm);
    this.cat = arm;
    G.add(cat);

    // Светящиеся склянки по центру-слева и стопка ящиков справа сзади.
    const vials = [[-0.95, 0x8fdcff], [-0.7, 0xd98aff], [-0.45, 0xa6ff8a]];
    vials.forEach(([x, c], i) => {
      const v = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.2 + (i % 2) * 0.06, 6), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.9, roughness: 0.3, flatShading: true }));
      v.position.set(x - 0.4, top + 0.12, zc + 0.12);
      G.add(v);
      const gl = softGlow('rgba(200,220,255,A)', 0.9);
      gl.position.set(x - 0.4, top + 0.18, zc + 0.12);
      G.add(gl);
    });
    const crate = mat(0x8a5a36), crateD = mat(0x6e4627);
    box(0.5, 0.36, 0.4, crate, 1.0, top + 0.18, zc - 0.05, G);
    box(0.52, 0.04, 0.42, crateD, 1.0, top + 0.37, zc - 0.05, G);
    box(0.38, 0.28, 0.32, crate, 1.0, top + 0.55, zc - 0.05, G);
    box(0.4, 0.04, 0.34, gold, 1.0, top + 0.71, zc - 0.05, G);
  }

  /** (tx, tz): положение игрока в осях лавки (+z к камере). */
  update(dt, tx = 0, tz = 9) {
    this.t += dt;
    const t = this.t;
    for (const l of this.lanterns) {
      const p = l.userData.ph;
      l.rotation.z = 0.05 * Math.sin(t * 1.3 + p);
      l.rotation.x = 0.04 * Math.sin(t * 1.1 + p * 2);
    }
    const f = 1 + 0.05 * Math.sin(t * 2.3) + 0.03 * Math.sin(t * 5.1);
    this.lights[0].intensity = 7 * f;
    this.lights[1].intensity = 6 * f;
    this.husky.update(dt, tx, tz);
    if (this.cat) this.cat.rotation.z = -0.5 + 0.35 * Math.sin(t * 3.2); // кот-манэки машет лапой
    for (const s of this.steam) { // пар над корзинками
      const u = s.userData;
      u.life = (u.life + dt * 0.5) % 1;
      s.position.set(u.x + Math.sin(t * 2 + u.ph) * 0.06, u.y + u.life * 0.8, u.z);
      s.material.opacity = 0.5 * Math.sin(u.life * Math.PI);
      s.scale.setScalar(0.3 + u.life * 0.4);
    }
  }
}
