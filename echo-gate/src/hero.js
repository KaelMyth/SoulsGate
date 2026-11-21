// Маг Echo Gate: стилизованная 3D-фигурка по образцу (синяя мантия, огромная кривая шляпа, тёмное лицо
// с бирюзовыми глазами, шарф, пояс, чёрные перчатки, коричневые сапоги). Собран из примитивов Three.js, без внешних файлов.
// Модель смотрит в +z. Графика готова к замене: всё, что снаружи нужно игре, это Hero.group и Hero.update().
import * as THREE from 'three';
import { buildStaffModel } from './staff_models.js';

// Палитра: бордовая мантия и шляпа, тёплый тан и золото, коричневая кожа. Тёплые цвета отделяют мага
// от холодного сине-серого снега и камней (раньше мантия была синей и сливалась с полем).
const COLORS = {
  hat: 0x7d2236,
  robe: 0x6e1e31,
  robeDark: 0x4c1424,
  scarf: 0xc89a66,
  mantle: 0x4a2a1c,
  cape: 0x4a1626,
  black: 0x0c0e13,
  belt: 0x3b2415,
  buckle: 0xe0a93e,
  gold: 0xe0a93e,
  boot: 0x3a2417,
  leather: 0x6a4428,
  feather: 0xeadfc6,
  eye: 0x35f2ff,
};

// Шляпа отклонена назад: с изометрической камеры сверху поля иначе закрывают всё лицо.
const HAT_TILT = -0.42;

function cloth(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0 });
}

function lathe(points, segs, mat) {
  const g = new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segs);
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

const ROBE = [
  [0.0, 0.17], [0.53, 0.17], [0.51, 0.26], [0.45, 0.42], [0.37, 0.62], [0.32, 0.8], [0.3, 0.95], [0.27, 1.02], [0, 1.02],
];
/** Радиус мантии на высоте y (по профилю). */
function robeR(y) {
  for (let i = 1; i < ROBE.length - 1; i++) {
    const [r0, y0] = ROBE[i], [r1, y1] = ROBE[i + 1];
    if (y >= y0 && y <= y1) return r0 + (r1 - r0) * (y - y0) / (y1 - y0);
  }
  return 0.3;
}

/** Шляпа: поля уходят вниз, конус сгибается назад и влево (по образцу), кончик загнут. */
function makeHat(mat) {
  const profile = [
    [0.64, 0.0], [0.6, 0.04], [0.52, 0.1], [0.42, 0.17], [0.35, 0.24],
    [0.31, 0.36], [0.27, 0.52], [0.22, 0.7], [0.17, 0.88], [0.12, 1.04],
    [0.075, 1.17], [0.04, 1.27], [0.012, 1.34], [0, 1.37],
  ];
  const mesh = lathe(profile, 36, mat);
  const pos = mesh.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = Math.max(0, (y - 0.3) / 1.07);
    const bend = Math.pow(t, 2.3);
    pos.setX(i, pos.getX(i) - 0.62 * bend);         // кончик уходит влево от зрителя
    pos.setZ(i, pos.getZ(i) - 0.22 * bend);         // и немного назад
    pos.setY(i, y - 0.16 * Math.pow(t, 2.6));       // и свисает
    // поля чуть волнятся
    if (y < 0.12) pos.setY(i, y + 0.018 * Math.sin(Math.atan2(pos.getZ(i), pos.getX(i)) * 3));
  }
  mesh.geometry.computeVertexNormals();
  mat.side = THREE.DoubleSide;
  return mesh;
}

const CAST_TIME = 0.22; // с: длительность взмаха посоха при выстреле

export class Hero {
  constructor() {
    this.group = new THREE.Group();     // положение и поворот в мире
    this.body = new THREE.Group();      // всё, что наклоняется и сжимается
    this.group.add(this.body);

    const matHat = cloth(COLORS.hat);
    const matRobe = cloth(COLORS.robe);
    const matScarf = cloth(COLORS.scarf);
    const matBlack = new THREE.MeshStandardMaterial({ color: COLORS.black, roughness: 0.55 });
    const matBelt = cloth(COLORS.belt);
    const matBoot = cloth(COLORS.boot);
    const matGold = new THREE.MeshStandardMaterial({ color: COLORS.gold, roughness: 0.35, metalness: 0.75 });
    const matLeather = cloth(COLORS.leather);

    // Мантия: расширяется к низу.
    this.robe = new THREE.Group();
    const robeMesh = lathe(ROBE, 40, matRobe);
    robeMesh.material.side = THREE.DoubleSide;
    this.robe.add(robeMesh);
    // Пояс и пряжка.
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.352, 0.37, 0.075, 32), matBelt);
    belt.position.y = 0.66;
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.11, 0.04), matGold);
    buckle.position.set(0, 0.66, 0.365);
    this.robe.add(belt, buckle);
    this.body.add(this.robe);

    // Сапоги.
    this.boots = [];
    for (const s of [-1, 1]) {
      const boot = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.16, 6, 12), matBoot);
      boot.rotation.x = Math.PI / 2;
      boot.scale.set(1, 1, 0.85);
      const holder = new THREE.Group();
      holder.add(boot);
      holder.position.set(s * 0.17, 0.1, 0.3);
      this.group.add(holder);
      this.boots.push(holder);
    }

    // Воротник: невысокое меховое кольцо у шеи (раньше был толстый бублик плюс юбка, выглядело странно).
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.285, 0.06, 12, 36), matScarf);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 1.03;
    collar.scale.set(1, 1, 0.8);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.3, 0.14, 28, 1, true), cloth(COLORS.robeDark));
    neck.material.side = THREE.DoubleSide;
    neck.position.y = 1.0;
    this.body.add(neck, collar);

    // Голова: тёмное лицо и светящиеся глаза.
    this.head = new THREE.Group();
    this.head.position.y = 1.22;
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.29, 24, 18), matBlack);
    face.scale.set(1, 0.95, 0.95);
    this.head.add(face);
    this.eyes = [];
    const eyeMat = new THREE.MeshBasicMaterial({ color: COLORS.eye });
    const glowTex = makeGlowTexture();
    // Глаза сидят на поверхности лица (эллипсоид 0.29 x 0.2755 x 0.2755), выше края капюшона и под полями шляпы,
    // повёрнуты по нормали поверхности и чуть утоплены, чтобы быть частью головы, а не висеть перед ней.
    const RX = 0.29, RY = 0.2755, RZ = 0.2755;
    const EX = 0.115, EY = 0.1;
    const surfZ = RZ * Math.sqrt(1 - (EX / RX) ** 2 - (EY / RY) ** 2);
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.085, 4, 10), eyeMat);
      eye.rotation.order = 'YXZ';
      eye.rotation.set(-Math.asin(EY / RY), s * Math.atan2(EX, surfZ), 0);
      eye.scale.set(1, 1, 0.55);                      // плоские, прилегают к лицу
      eye.position.set(s * EX, EY, surfZ - 0.012);
      const n = new THREE.Vector3(s * EX / (RX * RX), EY / (RY * RY), surfZ / (RZ * RZ)).normalize();
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex, color: COLORS.eye, transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      glow.scale.set(0.3, 0.3, 1);
      glow.position.copy(eye.position).addScaledVector(n, 0.03);
      this.head.add(eye, glow);
      this.eyes.push(eye);
    }
    // Шляпа сидит над лицом, поля закрывают верх глаз.
    this.hat = new THREE.Group();
    this.hat.position.set(0, 0.2, -0.07);
    this.hat.rotation.x = HAT_TILT;
    this.hat.add(makeHat(matHat));
    // Тулья: золотая лента с пряжкой и светлое перо сбоку.
    const hatBand = new THREE.Mesh(new THREE.TorusGeometry(0.348, 0.03, 8, 40), matBelt);
    hatBand.rotation.x = Math.PI / 2;
    hatBand.position.y = 0.27;
    const hatBuckle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.035), matGold);
    hatBuckle.position.set(0, 0.27, 0.352);
    const feather = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.3, 4, 8), cloth(COLORS.feather));
    feather.scale.set(1, 1, 0.35);
    feather.position.set(0.3, 0.42, 0.12);
    feather.rotation.set(-0.25, 0.2, -0.75);
    const featherTip = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), matGold);
    featherTip.position.set(0.43, 0.54, 0.09);
    this.hat.add(hatBand, hatBuckle, feather, featherTip);
    // Подклад: тёмный стакан под тульёй закрывает пустоту между шляпой и головой (шляпа отклонена назад).
    const lining = new THREE.Mesh(new THREE.CylinderGeometry(0.325, 0.3, 0.34, 28, 1, true), new THREE.MeshStandardMaterial({ color: 0x2a0c16, roughness: 0.95, side: THREE.DoubleSide }));
    lining.position.set(0, 0.02, 0.03);
    const liningTop = new THREE.Mesh(new THREE.CircleGeometry(0.325, 28), new THREE.MeshStandardMaterial({ color: 0x2a0c16, roughness: 0.95, side: THREE.DoubleSide }));
    liningTop.rotation.x = -Math.PI / 2;
    liningTop.position.set(0, 0.19, 0.03);
    this.hat.add(lining, liningTop);
    this.head.add(this.hat);
    this.body.add(this.head);

    // Руки: широкие рукава и чёрные перчатки.
    this.arms = [];
    for (const s of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(s * 0.3, 0.92, 0.0);
      const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.3, 6, 14), matRobe);
      sleeve.position.set(s * 0.09, -0.2, 0);
      sleeve.rotation.z = s * 0.42;
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 12), matBlack);
      hand.scale.set(1, 1.1, 0.95);
      hand.position.set(s * 0.2, -0.5, 0.01);
      arm.add(sleeve, hand);
      this.body.add(arm);
      this.arms.push(arm);
    }

    this.buildDetails(glowTex, matGold, matLeather, matBelt);
    this.buildStaff(glowTex, matBelt);
    this.buildTome(glowTex);

    // Мягкая тень под ногами (круг-градиент).
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.7, 1.7),
      new THREE.MeshBasicMaterial({ map: makeShadowTexture(), transparent: true, depthWrite: false, opacity: 0.8 }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.012;
    this.shadow.renderOrder = 1;

    this.yaw = Math.PI / 4;   // лицом к камере
    this.t = Math.random() * 10;
    this.blink = 2 + Math.random() * 2;
    this.blinkT = 0;
    this.walk = 0;           // фаза шага
    this.lean = 0;           // наклон вперёд
    this.sway = 0;           // качание мантии вбок
    this.hatLag = 0;         // отставание кончика шляпы
    this.hatVel = 0;
    this.prevVx = 0;
    this.prevVz = 0;
    this.squash = 0;         // рывок: вытягивание
    this.castT = 0;          // остаток взмаха посоха при выстреле, с
    this.castYaw = 0;
    this.group.rotation.y = this.yaw;
  }

  /** Выстрел: взмах посоха в сторону yaw (поворот героя на цель, если он стоит). */
  cast(yaw) {
    this.castT = CAST_TIME;
    this.castYaw = yaw;
  }

  /** Детали наряда: золотая кайма и вышивка, накидка на плечах, плащ со спины, подсумок, склянка, лента на поясе, манжеты. */
  buildDetails(glowTex, matGold, matLeather, matBelt) {
    const matMantle = cloth(COLORS.mantle);
    matMantle.side = THREE.DoubleSide;
    // Кайма по подолу и золотая полоса спереди с ромбами-рунами.
    const hem = new THREE.Mesh(new THREE.TorusGeometry(0.522, 0.026, 8, 48), matGold);
    hem.rotation.x = Math.PI / 2;
    hem.position.y = 0.2;
    this.robe.add(hem);
    const stripeGeo = new THREE.LatheGeometry(ROBE.slice(1, 8).map(([r, y]) => new THREE.Vector2(r * 1.012, y)), 8, -0.1, 0.2);
    stripeGeo.computeVertexNormals();
    const stripe = new THREE.Mesh(stripeGeo, new THREE.MeshStandardMaterial({ color: COLORS.gold, roughness: 0.5, metalness: 0.5, side: THREE.DoubleSide }));
    this.robe.add(stripe);
    for (const y of [0.32, 0.5, 0.8]) {
      const d = new THREE.Mesh(new THREE.OctahedronGeometry(0.042, 0), matGold);
      d.scale.set(1, 1.5, 0.5);
      d.position.set(0, y, robeR(y) * 1.03);
      this.robe.add(d);
    }
    // Накидка на плечах с золотой окантовкой.
    const mantle = new THREE.Mesh(new THREE.LatheGeometry([[0.29, 1.03], [0.37, 1.0], [0.43, 0.94], [0.45, 0.87], [0.44, 0.81]].map(([r, y]) => new THREE.Vector2(r, y)), 32), matMantle);
    mantle.geometry.computeVertexNormals();
    const mantleEdge = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.017, 6, 40), matGold);
    mantleEdge.rotation.x = Math.PI / 2;
    mantleEdge.position.y = 0.82;
    this.body.add(mantle, mantleEdge);
    // Подсумок слева, склянка с зельем справа.
    const pouch = new THREE.Group();
    pouch.position.set(-0.3, 0.55, 0.23);
    pouch.rotation.y = -0.85;
    const pouchBody = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.16, 0.08), matLeather);
    const pouchFlap = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.09), matBelt);
    pouchFlap.position.y = 0.06;
    const pouchClasp = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.02), matGold);
    pouchClasp.position.set(0, 0.04, 0.05);
    pouch.add(pouchBody, pouchFlap, pouchClasp);
    const vial = new THREE.Group();
    vial.position.set(0.3, 0.57, 0.22);
    vial.rotation.y = 0.85;
    const glass = new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.07, 4, 10), new THREE.MeshBasicMaterial({ color: 0x66ffd0 }));
    const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.04, 8), matLeather);
    cork.position.y = 0.09;
    const vialGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x66ffd0, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    vialGlow.scale.set(0.2, 0.2, 1);
    vial.add(glass, cork, vialGlow);
    this.vialGlow = vialGlow;
    this.robe.add(pouch, vial);
    // Лента на поясе спереди: колышется пружиной.
    this.sash = new THREE.Group();
    this.sash.position.set(0.1, 0.63, 0.37);
    const sashMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.4), new THREE.MeshStandardMaterial({ color: 0xb8863a, roughness: 0.7, side: THREE.DoubleSide }));
    sashMesh.position.y = -0.2;
    const sashTip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.07, 3), matGold);
    sashTip.rotation.z = Math.PI;
    sashTip.position.y = -0.43;
    this.sash.add(sashMesh, sashTip);
    this.robe.add(this.sash);
    // Золотые манжеты у перчаток.
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? -1 : 1;
      const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.026, 8, 20), matGold);
      cuff.position.set(s * 0.195, -0.44, 0.005);
      cuff.rotation.set(Math.PI / 2 - 0.1, 0, s * 0.4);
      this.arms[i].add(cuff);
    }
    // Плащ со спины: сетка из вершин, нижний край отстаёт на бегу (пружина + волна).
    this.capeCols = 6;
    this.capeRows = 8;
    const capeGeo = new THREE.PlaneGeometry(0.62, 0.95, this.capeCols, this.capeRows);
    this.cape = new THREE.Mesh(capeGeo, new THREE.MeshStandardMaterial({ color: COLORS.cape, roughness: 0.95, side: THREE.DoubleSide }));
    this.cape.position.set(0, 0.98, -0.27);
    this.body.add(this.cape);
    this.capeLag = 0; this.capeVel = 0; this.capeSide = 0; this.capeSideVel = 0;
    this.sashLag = 0; this.sashVel = 0;
    this.updateCape(0, 0, 0);
  }

  /** Перерисовать плащ: bend отвод нижнего края назад (0..1.2), side вбок, tt время для волны. */
  updateCape(bend, side, tt, wave = 0) {
    const pos = this.cape.geometry.attributes.position;
    const C = this.capeCols, R = this.capeRows;
    let k = 0;
    for (let j = 0; j <= R; j++) {
      const t = j / R;
      for (let i = 0; i <= C; i++) {
        const u = i / C - 0.5;
        pos.setXYZ(k++, u * 0.62 * (0.85 + 0.5 * t) + side * t * t * 0.5,
          -0.95 * t * (1 - 0.22 * bend * t),
          -0.015 - bend * 0.6 * t * t + Math.sin(tt * 6 + t * 5 + u * 2.5) * 0.035 * wave * t);
      }
    }
    pos.needsUpdate = true;
    this.cape.geometry.computeVertexNormals();
  }

  /** Мировая позиция кристалла посоха: отсюда вылетает шарик. */
  staffTip(out) {
    this.group.updateMatrixWorld(true);
    return this.crystal.getWorldPosition(out);
  }

  /** Посох в руке +x (у персонажа левая): модель берётся из staff_models.js по виду (variant). Хват в ладони перчатки. */
  buildStaff(glowTex, matBelt) {
    this.glowTex = glowTex;
    this.matBelt = matBelt;
    const staff = new THREE.Group();
    staff.position.set(0.2, -0.5, 0.04);
    this.arms[1].add(staff);
    this.staff = staff;
    this.staffVariant = null;
    this.setStaff('basic');
  }

  /** Сменить посох в руке: 'basic' | 'fire' | 'ice' | 'electric' (всё остальное считается обычным). */
  setStaff(variant, tier = 0) {
    const v = variant || 'basic';
    if (v === this.staffVariant && tier === this.staffTier) return;
    this.staffVariant = v;
    this.staffTier = tier;
    if (this.staffModel) this.staff.remove(this.staffModel.group);
    this.staffModel = buildStaffModel(v, this.glowTex, this.matBelt, tier);
    this.staff.add(this.staffModel.group);
    this.crystal = this.staffModel.crystal;   // камень на верхушке: отсюда вылетает снаряд
    this.staffGlow = this.staffModel.glow;
  }

  /** Фолиант в руке -x: тёмная обложка с золотыми уголками, светящаяся руна, блок страниц. Парит над ладонью. */
  buildTome(glowTex) {
    const cover = new THREE.MeshStandardMaterial({ color: 0x3a2a3d, roughness: 0.8 });
    const pages = new THREE.MeshStandardMaterial({ color: 0xe9e2cf, roughness: 0.95 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xc9a25a, roughness: 0.45, metalness: 0.5 });
    const tome = new THREE.Group();
    const W = 0.27;
    const H = 0.36;
    const T = 0.085;
    tome.add(new THREE.Mesh(new THREE.BoxGeometry(W, H, T), cover));
    const block = new THREE.Mesh(new THREE.BoxGeometry(W - 0.03, H - 0.03, T - 0.03), pages);
    block.position.set(0.012, 0, 0);
    tome.add(block);
    // Корешок и уголки.
    const spine = new THREE.Mesh(new THREE.BoxGeometry(0.035, H + 0.01, T + 0.012), cover);
    spine.position.x = -W / 2;
    tome.add(spine);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, T + 0.014), gold);
      c.position.set(sx * (W / 2 - 0.02), sy * (H / 2 - 0.02), 0);
      tome.add(c);
    }
    // Руна на лицевой стороне (+z).
    const rune = new THREE.Mesh(
      new THREE.PlaneGeometry(0.17, 0.17),
      new THREE.MeshBasicMaterial({ map: makeRuneTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    rune.position.z = T / 2 + 0.004;
    tome.add(rune);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: COLORS.eye, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glow.scale.set(0.5, 0.5, 1);
    glow.position.z = T / 2 + 0.02;
    tome.add(glow);
    this.runeGlow = glow;
    // Над ладонью (рука -x), лицом вперёд-наружу.
    tome.position.set(-0.2, -0.3, 0.1);
    tome.scale.setScalar(1.35);
    this.arms[0].add(tome);
    this.tome = tome;
  }

  /** Добавить фигуру и тень в сцену. */
  addTo(scene) {
    scene.add(this.group);
    scene.add(this.shadow);
  }

  /** dt секунд; motion: { x, z, vx, vz, speed, dashing, glideT }. */
  update(dt, motion, runSpeed) {
    this.t += dt;
    const sp = motion.speed;
    const frac = Math.min(1, sp / runSpeed);

    // Поворот лицом по скорости (плавно, по кратчайшей дуге).
    if (sp > 0.25) {
      const target = Math.atan2(motion.vx, motion.vz);
      let d = (target - this.yaw) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      else if (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * (1 - Math.exp(-dt / (motion.dashing ? 0.03 : 0.08)));
    }
    else if (this.castT > 0 && !motion.dashing) {
      let d = (this.castYaw - this.yaw) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      else if (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * (1 - Math.exp(-dt / 0.05)); // стоит: быстро поворачивается к цели
    }
    this.castT = Math.max(0, this.castT - dt);
    const castK = this.castT / CAST_TIME;                 // 1 в момент выстрела, 0 в конце
    const swing = Math.sin(Math.PI * Math.min(1, 1 - castK)) * (this.castT > 0 ? 1 : 0); // взмах вперёд и назад
    this.group.position.set(motion.x, 0, motion.z);
    this.group.rotation.y = this.yaw;

    // Ускорение вдоль и поперёк взгляда: наклон вперёд и качание.
    const ax = dt > 0 ? (motion.vx - this.prevVx) / dt : 0;
    const az = dt > 0 ? (motion.vz - this.prevVz) / dt : 0;
    this.prevVx = motion.vx;
    this.prevVz = motion.vz;
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const accF = ax * fx + az * fz;          // вперёд
    const accS = ax * fz - az * fx;          // вбок

    const leanTarget = Math.min(0.45, frac * 0.16 + Math.max(0, accF) * 0.004) + (motion.dashing ? 0.35 : 0) + swing * 0.08;
    this.lean += (leanTarget - this.lean) * (1 - Math.exp(-dt / 0.06));
    this.sway += (Math.max(-0.4, Math.min(0.4, -accS * 0.01)) - this.sway) * (1 - Math.exp(-dt / 0.08));

    // Шаги: фаза растёт со скоростью.
    // Каденс: на полной скорости около 2,8 шага в секунду (раньше фаза шла вдвое-втрое быстрее, и тело подпрыгивало ~8,6 раза в секунду: выглядело как дрожь).
    this.walk += dt * (1.1 + sp * 0.55) * (frac > 0.02 ? 1 : 0);
    const stepS = Math.sin(this.walk * 2);
    const bob = frac * Math.abs(Math.sin(this.walk * 2)) * 0.07 + (1 - frac) * Math.sin(this.t * 2) * 0.012;

    // Рывок: вытягивание вперёд и приплюснутость; после него пружина возвращается.
    const sqTarget = motion.dashing ? 1 : 0;
    this.squash += (sqTarget - this.squash) * (1 - Math.exp(-dt / (motion.dashing ? 0.03 : 0.1)));

    this.body.position.y = bob + this.squash * -0.03;
    this.body.rotation.x = this.lean;
    this.body.rotation.z = this.sway * 0.4;
    this.body.scale.set(1 - 0.12 * this.squash, 1 - 0.1 * this.squash + (1 - frac) * Math.sin(this.t * 2) * 0.012, 1 + 0.3 * this.squash);
    this.robe.rotation.z = this.sway * 0.5;
    this.robe.scale.set(1 + Math.abs(this.sway) * 0.1, 1, 1 + frac * 0.04);

    // Кончик шляпы запаздывает за движением (пружина).
    const hatTarget = -accF * 0.012 + -this.lean * 0.7;
    this.hatVel += ((hatTarget - this.hatLag) * 90 - this.hatVel * 11) * dt;
    this.hatLag += this.hatVel * dt;
    this.hat.rotation.x = HAT_TILT + Math.max(-0.5, Math.min(0.5, this.hatLag));
    this.hat.rotation.z = Math.max(-0.4, Math.min(0.4, -accS * 0.012));
    this.head.rotation.x = -this.lean * 0.5;

    const dashK0 = this.squash;
    // Плащ и лента на поясе: тоже пружины с отставанием (перекрытие движения и затухающее дрожание).
    const capeTarget = Math.min(1.2, frac * 0.65 + dashK0 * 0.5 + Math.max(0, accF * 0.01));
    this.capeVel += ((capeTarget - this.capeLag) * 70 - this.capeVel * 9) * dt;
    this.capeLag += this.capeVel * dt;
    const sideTarget = Math.max(-0.6, Math.min(0.6, -accS * 0.012 - this.sway * 0.8));
    this.capeSideVel += ((sideTarget - this.capeSide) * 70 - this.capeSideVel * 9) * dt;
    this.capeSide += this.capeSideVel * dt;
    this.updateCape(Math.max(0, this.capeLag), this.capeSide, this.t, frac + 0.15);
    this.sashVel += ((capeTarget * 0.9 - this.sashLag) * 120 - this.sashVel * 12) * dt;
    this.sashLag += this.sashVel * dt;
    this.sash.rotation.x = 0.05 + Math.max(-0.2, this.sashLag);
    this.sash.rotation.z = Math.sin(this.t * 7 + 1) * 0.1 * frac - this.capeSide * 0.4;
    this.vialGlow.material.opacity = 0.35 + 0.2 * Math.sin(this.t * 2.5);

    // Руки. Рука с фолиантом (arms[0]) согнута вперёд и держит книгу на уровне пояса, книга пружинит на шагах.
    // Рука с посохом (arms[1]) качается слабо, посох наклонён вперёд на беге (низ отрывается от земли),
    // в рывке его уводят назад, фолиант прижимают к груди.
    const dashK = this.squash;
    const idleBreath = Math.sin(this.t * 2);
    const stepBounce = Math.abs(Math.sin(this.walk * 2));
    const tomeArm = -0.7 - 0.2 * frac - 0.5 * dashK + idleBreath * 0.03;
    const staffArm = stepS * 0.32 * frac - 0.15 * dashK + Math.sin(this.t * 2 + 1) * 0.02;
    this.arms[0].rotation.x = tomeArm;
    this.arms[1].rotation.x = staffArm;
    this.arms[0].rotation.z = -0.05 - frac * 0.05;
    this.arms[1].rotation.z = 0.05 + frac * 0.06;
    // Посох держит собственный наклон независимо от руки (компенсируем поворот руки).
    const staffTilt = frac * 0.42 + stepS * 0.06 * frac - dashK * 1.35 + (1 - frac) * Math.sin(this.t * 1.3) * 0.015 + swing * 0.9;
    this.staff.rotation.x = staffTilt - staffArm;
    this.staff.rotation.z = -0.05;
    // Фолиант держит себя ровно (тоже компенсируем) и парит.
    this.tome.rotation.x = -tomeArm - 0.35 + stepBounce * 0.05 * frac;
    this.tome.rotation.y = 0.35 - dashK * 0.3;
    this.tome.position.y = -0.3 + idleBreath * 0.012 + stepBounce * 0.03 * frac;
    // Кристалл и руна пульсируют, сильнее на бегу.
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 3 + (frac + dashK) * 2);
    this.crystal.material.emissiveIntensity = 1.0 + pulse * 0.6 + frac * 0.3 + dashK * 0.6 + castK * 2.2;
    this.staffGlow.material.opacity = Math.min(1, 0.55 + pulse * 0.25 + dashK * 0.2 + castK * 0.35);
    this.runeGlow.material.opacity = 0.25 + pulse * 0.2 + dashK * 0.25;
    this.crystal.rotation.y += dt * (1.2 + frac * 2);
    this.staffModel.update(this.t, Math.min(1, frac + dashK));

    // Сапоги шагают.
    this.boots[0].position.z = 0.3 + stepS * 0.17 * frac;
    this.boots[1].position.z = 0.3 - stepS * 0.17 * frac;
    this.boots[0].position.y = 0.1 + Math.max(0, Math.cos(this.walk * 2)) * 0.09 * frac;
    this.boots[1].position.y = 0.1 + Math.max(0, -Math.cos(this.walk * 2)) * 0.09 * frac;

    // Моргание.
    this.blink -= dt;
    if (this.blink <= 0) { this.blinkT = 0.14; this.blink = 2.5 + Math.random() * 3.5; }
    let eyeY = 1;
    if (this.blinkT > 0) {
      this.blinkT -= dt;
      eyeY = 0.1 + 0.9 * Math.abs(this.blinkT / 0.14 - 0.5) * 2;
    }
    for (const e of this.eyes) e.scale.y = eyeY;

    // Тень: остаётся на земле, сжимается в рывке.
    this.shadow.position.x = motion.x;
    this.shadow.position.z = motion.z;
    const sc = 1 + this.squash * 0.35 + bob * 0.5;
    this.shadow.scale.set(sc, sc, 1);
    this.shadow.material.opacity = 0.8 - bob * 1.2;
  }
}

function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Руна на обложке: кольцо, треугольник и точка, светящиеся бирюзой. */
function makeRuneTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.strokeStyle = '#7ff7ff';
  g.lineWidth = 6;
  g.shadowColor = '#35f2ff';
  g.shadowBlur = 10;
  g.beginPath(); g.arc(64, 64, 46, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.moveTo(64, 28); g.lineTo(98, 86); g.lineTo(30, 86); g.closePath(); g.stroke();
  g.fillStyle = '#c9fcff';
  g.beginPath(); g.arc(64, 70, 7, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeShadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  r.addColorStop(0, 'rgba(30,36,60,0.55)');
  r.addColorStop(0.55, 'rgba(30,36,60,0.28)');
  r.addColorStop(1, 'rgba(30,36,60,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
