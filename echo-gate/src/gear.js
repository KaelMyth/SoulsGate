// Куча снаряжения в хабе: ящики, бочка с посохами, книги, мешочки, свитки, колчан и кристаллы-«патроны».
// Собрано из примитивов Three.js, центр у земли в (0,0,0), размер примерно 3x3 м. Снаружи: GearPile.group и GearPile.update(dt).
import * as THREE from 'three';

function mat(color, rough = 0.9, extra) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, flatShading: true, ...extra });
}
function glowMat(color, intensity = 1) {
  return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.35, flatShading: true });
}
function sprite(color, size) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, color.replace('A', '0.7'));
  gr.addColorStop(1, color.replace('A', '0'));
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.set(size, size, 1);
  return s;
}

const WOOD = [0x8a5a36, 0x7a4e2e, 0x946339];
const WOOD_D = 0x4a3020;
const IRON = 0x56627a;

/** Деревянный ящик с рёбрами-досками и железными полосами. */
function crate(w, h, d, tone, open) {
  const g = new THREE.Group();
  const body = mat(WOOD[tone % 3]);
  const frame = mat(WOOD_D);
  const band = mat(IRON, 0.6);
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), body);
  b.position.y = h / 2;
  g.add(b);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { // угловые стойки
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.07, h + 0.02, 0.07), frame);
    p.position.set(sx * (w / 2 - 0.02), h / 2, sz * (d / 2 - 0.02));
    g.add(p);
  }
  for (const y of [0.1, h - 0.1]) { // обвязка сверху и снизу
    const r = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.07, d + 0.02), frame);
    r.position.y = y;
    g.add(r);
  }
  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.08, h * 0.8, d + 0.03), band); // железная полоса
  strap.position.set(w * 0.22, h / 2, 0);
  g.add(strap);
  if (open) { // верх открыт: тёмное нутро
    const inner = new THREE.Mesh(new THREE.BoxGeometry(w - 0.14, 0.02, d - 0.14), mat(0x1c1612));
    inner.position.y = h + 0.012;
    g.add(inner);
  }
  return g;
}

/** Посох: древко и навершие одного из видов. */
function staff(kind, len = 1.9) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, len, 6), mat(kind === 'branch' ? 0x6b4a33 : 0x5a3d2b));
  pole.position.y = len / 2;
  g.add(pole);
  const gold = mat(0xe0a93e, 0.45);
  const top = new THREE.Group();
  top.position.y = len;
  g.add(top);
  if (kind === 'crystal') {
    const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), glowMat(0x5ee6ff, 1.1));
    c.scale.y = 1.7; c.position.y = 0.2; top.add(c);
    const claw = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.12, 4), gold); claw.position.y = 0.02; top.add(claw);
    g.userData.glow = c;
  } else if (kind === 'moon') {
    const m = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.03, 5, 10, Math.PI * 1.5), gold);
    m.position.y = 0.2; m.rotation.z = Math.PI * 0.25; top.add(m);
    const o = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), glowMat(0xffe08a, 0.8)); o.position.y = 0.2; top.add(o);
  } else if (kind === 'orb') {
    const o = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 1), glowMat(0xb27dff, 0.9)); o.position.y = 0.22; top.add(o);
    for (let i = 0; i < 3; i++) {
      const p = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.26, 4), mat(0x2a2638));
      const a = (i / 3) * Math.PI * 2;
      p.position.set(Math.cos(a) * 0.11, 0.12, Math.sin(a) * 0.11);
      p.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
      top.add(p);
    }
    g.userData.glow = o;
  } else if (kind === 'flame') {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.34, 5), glowMat(0xff7a2e, 1));
    f.position.y = 0.2; top.add(f);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.025, 5, 8), gold); ring.rotation.x = Math.PI / 2; ring.position.y = 0.03; top.add(ring);
  } else { // 'branch': корявая ветка с узлами и пучком листьев
    for (const [x, y, r] of [[0.08, 0.1, 0.4], [-0.07, 0.2, -0.5]]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.025, 0.28, 4), mat(0x6b4a33));
      b.position.set(x, y, 0); b.rotation.z = r; top.add(b);
    }
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 0), mat(0x6fae7a));
    leaf.position.set(0.14, 0.3, 0); top.add(leaf);
  }
  return g;
}

/** Книга: цветная обложка, светлые страницы, золотой корешок. */
function book(w, h, d, color, rune) {
  const g = new THREE.Group();
  const cover = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, 0.8));
  cover.position.y = h / 2;
  g.add(cover);
  const pages = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, h * 0.94, d * 0.82), mat(0xe8dcc0));
  pages.position.set(w * 0.04, h / 2, 0);
  g.add(pages);
  const spine = new THREE.Mesh(new THREE.BoxGeometry(w * 0.06, h * 0.9, d * 1.04), mat(0xe0a93e, 0.5));
  spine.position.set(-w * 0.45, h / 2, 0);
  g.add(spine);
  if (rune) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(w * 0.4, 0.012, d * 0.4), glowMat(0x5ee6ff, 1.2));
    r.position.y = h + 0.006;
    g.add(r);
    g.userData.glow = r;
  }
  return g;
}

export class GearPile {
  constructor() {
    this.group = new THREE.Group();
    this.glows = [];
    const G = this.group;
    const add = (o, x, y, z, ry = 0) => { o.position.set(x, y, z); o.rotation.y = ry; G.add(o); return o; };

    // Ящики: два в основе, один сверху, один открытый с книгами.
    add(crate(1.2, 0.8, 0.9, 0), -0.4, 0, -0.5, 0.12);
    add(crate(0.9, 0.7, 0.9, 1), 0.7, 0, -0.55, -0.2);
    add(crate(0.8, 0.55, 0.7, 2), -0.3, 0.8, -0.55, 0.35);
    const open = add(crate(1.0, 0.55, 0.8, 1, true), -0.2, 0, 0.75, -0.1);
    // Книги в открытом ящике: стоят и лежат стопкой.
    const cols = [0x2e4a7a, 0x8a2f35, 0x2f6b55, 0x5a3d6b, 0x6b4a33];
    cols.forEach((c, i) => {
      const b = book(0.1, 0.42 + (i % 2) * 0.06, 0.3, c, false);
      b.position.set(-0.36 + i * 0.12, 0.1, 0);
      b.rotation.z = (i - 2) * 0.05;
      open.add(b);
    });
    // Стопка книг на крыше ящиков, верхняя с рунным свечением.
    const stack = [[0.5, 0.07, 0.38, 0x2e4a7a], [0.46, 0.06, 0.34, 0x8a2f35], [0.42, 0.07, 0.32, 0x2f6b55]];
    let y = 1.35;
    stack.forEach(([w, h, d, c], i) => { const b = book(w, h, d, c, i === 2); b.position.set(-0.28 + i * 0.03, y, -0.55); b.rotation.y = 0.2 * i; G.add(b); y += h; if (b.userData.glow) this.glows.push(b.userData.glow); });
    const lay = book(0.4, 0.06, 0.3, 0x5a3d6b, false);
    lay.position.set(0.62, 0.7, -0.55); lay.rotation.y = 0.5; G.add(lay);

    // Стойка для посохов: деревянная рама с двумя перекладинами, посохи стоят в ряд, навершия торчат над рамой.
    const rack = new THREE.Group();
    rack.position.set(1.6, 0, 0.5);
    rack.rotation.y = -0.25;
    G.add(rack);
    const rw = 1.7;
    const wood = mat(0x6e4627), woodD = mat(WOOD_D), goldM = mat(0xe0a93e, 0.45);
    const plank = new THREE.Mesh(new THREE.BoxGeometry(rw + 0.2, 0.1, 0.5), woodD); // основание
    plank.position.y = 0.05; rack.add(plank);
    for (const sx of [-1, 1]) { // боковые стойки с золотыми навершиями
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.25, 0.12), wood);
      post.position.set(sx * (rw / 2 + 0.02), 0.62, 0); rack.add(post);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.18, 4), goldM);
      cap.position.set(sx * (rw / 2 + 0.02), 1.34, 0); cap.rotation.y = Math.PI / 4; rack.add(cap);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.4, 0.4), woodD); // распорка
      foot.position.set(sx * (rw / 2 + 0.02), 0.2, 0); rack.add(foot);
    }
    for (const y of [0.55, 1.05]) { // перекладины спереди и сзади: посохи зажаты между ними
      for (const z of [-0.07, 0.07]) {
        const r = new THREE.Mesh(new THREE.BoxGeometry(rw, 0.06, 0.04), wood);
        r.position.set(0, y, z); rack.add(r);
      }
    }
    const rackKinds = ['crystal', 'moon', 'orb', 'flame', 'branch'];
    const rackLen = [1.95, 1.8, 2.0, 1.75, 1.85];
    rackKinds.forEach((k, n) => {
      const s = staff(k, rackLen[n]);
      s.position.set(-rw / 2 + 0.17 + n * ((rw - 0.34) / 4), 0.1, 0);
      s.rotation.z = (n - 2) * 0.025; // еле заметный веер, как живая стойка
      rack.add(s);
      if (s.userData.glow) this.glows.push(s.userData.glow);
    });
    // Остальные посохи просто прислонены к ящикам.
    const kinds = ['flame', 'branch', 'crystal'];
    const spots = [[-1.0, -0.05, 0.1, -0.1, 1.8], [-1.15, -0.15, 0.22, 0.05, 1.6], [0.0, 0.45, -0.18, 0.12, 2.0]];
    spots.forEach(([x, z, tx, tz, len], i) => {
      const s = staff(kinds[i], len);
      s.position.set(x, 0, z);
      s.rotation.set(tz * 2.2, 0, -tx * 2.2);
      G.add(s);
      if (s.userData.glow) this.glows.push(s.userData.glow);
    });

    // Мешочки, колчан со стрелами, пучок свитков.
    const sack = (x, z, s, c) => {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.28 * s, 8, 6), mat(c, 0.95));
      b.scale.y = 0.85; b.position.set(x, 0.24 * s, z); G.add(b);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07 * s, 0.12 * s, 0.14 * s, 6), mat(c, 0.95));
      neck.position.set(x, 0.52 * s, z); G.add(neck);
      const tie = new THREE.Mesh(new THREE.TorusGeometry(0.075 * s, 0.015, 4, 8), mat(0xe0a93e)); tie.rotation.x = Math.PI / 2; tie.position.set(x, 0.5 * s, z); G.add(tie);
    };
    sack(0.95, 1.05, 1.0, 0x8c7a5a);
    sack(1.25, 1.2, 0.75, 0x5a6a8c);
    sack(-1.0, 0.85, 0.85, 0x8c5a4a);
    const quiver = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.7, 7), mat(0x5a3d2b));
    quiver.position.set(0.3, 0.35, 1.2); quiver.rotation.z = 0.15; G.add(quiver);
    for (let i = 0; i < 4; i++) {
      const a = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.35, 4), mat(0xdcd2b8));
      a.position.set(0.28 + (i - 1.5) * 0.04, 0.82, 1.2 + (i % 2) * 0.03); a.rotation.z = 0.15 + (i - 1.5) * 0.05; G.add(a);
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.07, 3), mat(0xb8372f));
      f.position.set(a.position.x + 0.03, 1.0, a.position.z); G.add(f);
    }
    for (let i = 0; i < 3; i++) { // свитки
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.5, 7), mat(0xe8dcc0));
      s.rotation.z = Math.PI / 2; s.rotation.y = 0.3 * i; s.position.set(-1.0 + i * 0.03, 0.06 + i * 0.07, 1.6 - i * 0.04); G.add(s);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 7), mat(0xb8372f));
      cap.rotation.z = Math.PI / 2; cap.position.set(s.position.x + 0.26, s.position.y, s.position.z); G.add(cap);
    }

    // Кристаллы-«патроны» россыпью у открытого ящика, мягко светятся.
    const cc = [0x5ee6ff, 0x5ee6ff, 0xb27dff, 0xffb25a];
    cc.forEach((c, i) => {
      const k = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), glowMat(c, 0.9));
      k.scale.y = 1.6; k.position.set(0.5 + i * 0.16, 0.12, 1.25 + Math.sin(i * 2.1) * 0.15); k.rotation.y = i; G.add(k);
      this.glows.push(k);
    });
    this.t = 0;
  }

  update(dt) {
    this.t += dt;
    this.glows.forEach((m, i) => { m.material.emissiveIntensity = 0.85 + 0.3 * Math.sin(this.t * 2 + i * 1.3); });
  }
}
