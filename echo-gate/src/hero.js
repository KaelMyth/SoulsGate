// Маг Echo Gate: стилизованная 3D-фигурка по образцу (синяя мантия, огромная кривая шляпа, тёмное лицо
// с бирюзовыми глазами, шарф, пояс, чёрные перчатки, коричневые сапоги). Собран из примитивов Three.js, без внешних файлов.
// Модель смотрит в +z. Графика готова к замене: всё, что снаружи нужно игре, это Hero.group и Hero.update().
import * as THREE from 'three';

const COLORS = {
  hat: 0x4a5a8c,
  robe: 0x3d4a77,
  robeDark: 0x333f68,
  scarf: 0x44527f,
  black: 0x0c0e13,
  belt: 0x6b4a33,
  buckle: 0x8a6444,
  boot: 0x5a3d2b,
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

    // Мантия: расширяется к низу.
    this.robe = new THREE.Group();
    const robeMesh = lathe([
      [0.0, 0.17], [0.53, 0.17], [0.51, 0.26], [0.45, 0.42], [0.37, 0.62], [0.32, 0.8], [0.3, 0.95], [0.27, 1.02], [0, 1.02],
    ], 40, matRobe);
    robeMesh.material.side = THREE.DoubleSide;
    this.robe.add(robeMesh);
    // Пояс и пряжка.
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.352, 0.37, 0.075, 32), matBelt);
    belt.position.y = 0.66;
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.11, 0.04), cloth(COLORS.buckle));
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

    // Шарф-воротник.
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.12, 14, 28), matScarf);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 1.06;
    const cowl = lathe([[0.3, 0.92], [0.36, 1.0], [0.36, 1.1], [0.3, 1.2], [0.25, 1.22]], 28, matScarf);
    cowl.material.side = THREE.DoubleSide;
    cowl.scale.set(1, 1, 1.0);
    this.body.add(collar, cowl);

    // Голова: тёмное лицо и светящиеся глаза.
    this.head = new THREE.Group();
    this.head.position.y = 1.22;
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.29, 24, 18), matBlack);
    face.scale.set(1, 0.95, 0.95);
    this.head.add(face);
    this.eyes = [];
    const eyeMat = new THREE.MeshBasicMaterial({ color: COLORS.eye });
    const glowTex = makeGlowTexture();
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.1, 4, 10), eyeMat);
      eye.position.set(s * 0.12, -0.03, 0.258);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex, color: COLORS.eye, transparent: true, opacity: 0.55,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      glow.scale.set(0.36, 0.36, 1);
      glow.position.set(s * 0.12, -0.03, 0.29);
      this.head.add(eye, glow);
      this.eyes.push(eye);
    }
    // Шляпа сидит над лицом, поля закрывают верх глаз.
    this.hat = new THREE.Group();
    this.hat.position.set(0, 0.2, -0.07);
    this.hat.rotation.x = HAT_TILT;
    this.hat.add(makeHat(matHat));
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

  /** Мировая позиция кристалла посоха: отсюда вылетает шарик. */
  staffTip(out) {
    this.group.updateMatrixWorld(true);
    return this.crystal.getWorldPosition(out);
  }

  /** Посох в руке +x (у персонажа левая): ствол с хватом на высоте руки, у земли обойма, наверху завиток и бирюзовый кристалл. */
  buildStaff(glowTex, matBelt) {
    const wood = new THREE.MeshStandardMaterial({ color: 0x7a5238, roughness: 0.85 });
    const woodDark = new THREE.MeshStandardMaterial({ color: 0x5a3c28, roughness: 0.9 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xc9a25a, roughness: 0.45, metalness: 0.5 });
    const staff = new THREE.Group();
    // Хват в начале координат группы; низ посоха на 0.42 ниже, верх на 1.5 выше.
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.044, 1.92, 12), wood);
    shaft.position.y = (1.5 - 0.42) / 2;
    const ferrule = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 12), woodDark);
    ferrule.rotation.x = Math.PI;
    ferrule.position.y = -0.42 - 0.02;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 12), matBelt);
    // Завиток: дуга тора вокруг кристалла.
    const curl = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.03, 8, 22, Math.PI * 1.5), wood);
    curl.position.y = 1.58;
    curl.rotation.z = Math.PI * 0.75;
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.04, 0.07, 12), gold);
    collar.position.y = 1.5;
    this.crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.095, 0),
      new THREE.MeshStandardMaterial({ color: COLORS.eye, emissive: COLORS.eye, emissiveIntensity: 1.2, roughness: 0.2 }),
    );
    this.crystal.scale.y = 1.4;
    this.crystal.position.y = 1.62;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: COLORS.eye, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glow.scale.set(0.75, 0.75, 1);
    glow.position.y = 1.62;
    this.staffGlow = glow;
    staff.add(shaft, ferrule, grip, curl, collar, this.crystal, glow);
    // Хват в ладони перчатки правой руки модели (+x).
    staff.position.set(0.2, -0.5, 0.04);
    this.arms[1].add(staff);
    this.staff = staff;
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
    this.walk += dt * (4 + sp * 1.6) * (frac > 0.02 ? 1 : 0);
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
