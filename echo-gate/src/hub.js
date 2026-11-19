// Хаб Echo Gate: маленькое поле со стоянкой мага (около 3 экранов в ширину и 2 в высоту), в центре костёр.
// Когда герой подходит к костру, из огня выходит кнопка Play (DOM, см. HubUi). Всё собрано из примитивов Three.js.
// Снаружи нужно: Hub.group, Hub.update(dt, героX, героZ) и Hub.setActive(bool).
import * as THREE from 'three';
import { Shop } from './shop.js';

function mat(color, rough = 0.95) { return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, flatShading: true }); }
function glowMat(color, opacity) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
}

/** Мягкое круглое пятно света (радиальный градиент), чтобы не было жёсткой геометрической окружности. */
function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,190,110,0.85)');
  gr.addColorStop(0.35, 'rgba(255,140,50,0.35)');
  gr.addColorStop(1, 'rgba(255,110,30,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Костёр: камни по кругу, шалашом поленья, три слоя пламени, свет, искры. Центр в (0,0,0). */
export class Campfire {
  constructor() {
    this.group = new THREE.Group();
    this.t = Math.random() * 10;

    // Камни по неровному кругу.
    const stoneMat = mat(0x56627a);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + Math.sin(i * 7.1) * 0.12;
      const r = 0.82 + Math.sin(i * 3.3) * 0.08;
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), stoneMat);
      s.scale.set(1 + 0.25 * Math.sin(i * 5.7), 0.62, 1 + 0.25 * Math.cos(i * 4.1));
      s.position.set(Math.cos(a) * r, 0.1, Math.sin(a) * r);
      s.rotation.set(i, i * 2.3, 0);
      this.group.add(s);
    }

    // Пепел и угли под поленьями.
    const ash = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.7, 0.05, 9), mat(0x1c2230));
    ash.position.y = 0.025;
    this.group.add(ash);

    // Поленья: шесть, опираются на центр и расходятся лучами.
    const logMat = mat(0x5a3d2b);
    const charMat = new THREE.MeshStandardMaterial({ color: 0x2a1c14, emissive: 0xff5a14, emissiveIntensity: 0.9, roughness: 1, flatShading: true });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const pivot = new THREE.Group();
      pivot.rotation.y = a;
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.15, 6), logMat);
      log.rotation.z = Math.PI / 2 - 0.5; // наклон: внешний конец ниже
      log.position.set(0.5, 0.2, 0);
      pivot.add(log);
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.09, 0.18, 6), charMat);
      tip.rotation.z = log.rotation.z;
      tip.position.set(0.0, 0.46, 0); // обугленный верхний конец
      tip.position.set(0.5 - Math.cos(0.5) * 0.55, 0.2 + Math.sin(0.5) * 0.55, 0);
      pivot.add(tip);
      this.group.add(pivot);
    }

    // Пламя: три вложенных многогранных языка, каждый колышется по-своему.
    this.flames = [];
    const flameDefs = [
      { color: 0xff5a14, o: 0.85, r: 0.5, h: 1.35, y: 0.55 },
      { color: 0xff9a2e, o: 0.9, r: 0.36, h: 1.15, y: 0.5 },
      { color: 0xffe08a, o: 0.95, r: 0.2, h: 0.8, y: 0.42 },
    ];
    for (const d of flameDefs) {
      const m = new THREE.Mesh(new THREE.ConeGeometry(d.r, d.h, 5, 1, true), glowMat(d.color, d.o));
      m.position.y = d.y + d.h * 0.5 * 0.5;
      m.userData = { baseY: m.position.y, h: d.h, phase: Math.random() * 6 };
      this.group.add(m);
      this.flames.push(m);
    }

    // Мягкое пятно света на земле.
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), new THREE.MeshBasicMaterial({
      map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.03;
    this.glow = glow;
    this.group.add(glow);

    this.light = new THREE.PointLight(0xff8a3a, 14, 10, 1.6);
    this.light.position.set(0, 1.1, 0);
    this.group.add(this.light);

    // Искры: маленькие огранённые кристаллики поднимаются и гаснут.
    this.sparks = [];
    const sparkGeo = new THREE.OctahedronGeometry(0.05, 0);
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(sparkGeo, glowMat(0xffb55a, 1));
      m.userData = { life: Math.random(), speed: 0.35 + Math.random() * 0.4, ang: Math.random() * 6.28, rad: Math.random() * 0.3, drift: (Math.random() - 0.5) * 0.5 };
      this.sparks.push(m);
      this.group.add(m);
    }
    this.update(0);
  }

  update(dt) {
    this.t += dt;
    const t = this.t;
    for (const f of this.flames) {
      const u = f.userData;
      const k = 1 + 0.16 * Math.sin(t * 9 + u.phase) + 0.09 * Math.sin(t * 17 + u.phase * 2);
      f.scale.set(1 + 0.08 * Math.sin(t * 7 + u.phase * 3), k, 1 + 0.08 * Math.cos(t * 8 + u.phase));
      f.position.y = u.baseY + (k - 1) * u.h * 0.5;
      f.rotation.y += dt * (0.6 + u.phase * 0.1);
      f.rotation.z = 0.07 * Math.sin(t * 5 + u.phase);
    }
    const fl = 1 + 0.12 * Math.sin(t * 11) + 0.08 * Math.sin(t * 23 + 1);
    this.light.intensity = 14 * fl;
    this.glow.scale.setScalar(0.96 + 0.06 * fl);
    for (const s of this.sparks) {
      const u = s.userData;
      u.life += dt * u.speed;
      if (u.life >= 1) { u.life = 0; u.ang = Math.random() * 6.28; u.rad = Math.random() * 0.3; u.drift = (Math.random() - 0.5) * 0.5; }
      const l = u.life;
      s.position.set(Math.cos(u.ang) * u.rad + u.drift * l, 0.7 + l * 2.2, Math.sin(u.ang) * u.rad + Math.sin(t * 3 + u.ang) * 0.15 * l);
      s.scale.setScalar(Math.max(0.01, 1 - l));
      s.rotation.y = t * 3 + u.ang;
    }
  }
}

/** Поле хаба: костёр, камни по краю, тёмная пустота за краем. */
export class Hub {
  /** scene: сцена мира; cfg: CONFIG.hub */
  constructor(scene, cfg) {
    this.cfg = cfg;
    this.group = new THREE.Group();
    this.group.rotation.y = Math.PI / 4; // стороны поля параллельны краям экрана
    scene.add(this.group);
    this.fire = new Campfire();
    this.fire.group.scale.setScalar(1.35);
    this.group.add(this.fire.group);

    // Торговый вагончик выше костра на экране (местная ось -z). Лицом к камере.
    this.shop = new Shop();
    this.shop.group.position.set(0, 0, cfg.shopZ);
    this.group.add(this.shop.group);

    const hx = cfg.halfW;
    const hz = cfg.halfD;

    // Пустота за краем поля: большая плоскость с прямоугольной дырой. Цвет близок к земле, но заметно темнее.
    const shape = new THREE.Shape();
    const B = 300;
    shape.moveTo(-B, -B); shape.lineTo(B, -B); shape.lineTo(B, B); shape.lineTo(-B, B); shape.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-hx, -hz); hole.lineTo(-hx, hz); hole.lineTo(hx, hz); hole.lineTo(hx, -hz); hole.closePath();
    shape.holes.push(hole);
    const void_ = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: cfg.voidColor }));
    void_.rotation.x = -Math.PI / 2;
    void_.position.y = 0.01;
    this.group.add(void_);

    // Камни по периметру: неровная ограда без жёстких линий.
    const rockMat = mat(0x4a5873);
    const rockDark = mat(0x3a4660);
    const step = cfg.rockStep;
    const rock = (x, z, i) => {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), i % 3 ? rockMat : rockDark);
      const s = 0.55 + 0.45 * Math.abs(Math.sin(i * 12.9));
      r.scale.set(s * 1.1, s * (0.7 + 0.5 * Math.abs(Math.cos(i * 7.3))), s);
      r.position.set(x, s * 0.35, z);
      r.rotation.set(i, i * 1.7, 0);
      this.group.add(r);
    };
    let n = 0;
    for (let x = -hx; x <= hx; x += step) { rock(x, -hz, n++); rock(x, hz, n++); }
    for (let z = -hz + step; z < hz; z += step) { rock(-hx, z, n++); rock(hx, z, n++); }

    this.setActive(true);
  }

  setActive(on) {
    this.active = on;
    this.group.visible = on;
  }

  /** (px, pz): мировое положение героя; лавка получает его в своих осях, чтобы хаски следил взглядом. */
  update(dt, px = 0, pz = 0) {
    if (!this.active) return;
    this.fire.update(dt);
    const a = this.group.rotation.y;
    const lx = px * Math.cos(a) - pz * Math.sin(a);
    const lz = px * Math.sin(a) + pz * Math.cos(a);
    this.shop.update(dt, lx - this.shop.group.position.x, lz - this.shop.group.position.z);
  }
}

/** Кнопка Play, выходящая из костра, когда герой рядом. Позиция: мир -> экран (World.project). */
export class PlayButton {
  /** el: кнопка в DOM; cfg: CONFIG.hub; onPress: вызывается по нажатию */
  constructor(el, cfg, onPress) {
    this.el = el;
    this.cfg = cfg;
    this.k = 0;       // 0 спрятана в огне, 1 полностью вышла
    this.open = false;
    this.p = { x: 0, y: 0 };
    el.addEventListener('click', () => { if (this.k > 0.6) onPress(); });
  }

  /** dist: расстояние героя до костра (м); world: World для проекции точки костра на экран. */
  update(dt, dist, world, on) {
    const c = this.cfg;
    if (!on) this.open = false;
    else if (dist < c.playRadius) this.open = true;
    else if (dist > c.playRadius + c.playHysteresis) this.open = false;
    const target = this.open ? 1 : 0;
    this.k += (target - this.k) * (1 - Math.exp(-dt / (this.open ? 0.09 : 0.07)));
    if (Math.abs(target - this.k) < 0.003) this.k = target;
    world.project(0, c.buttonFromY, 0, this.p);
    const k = this.k;
    // Выходит из огня вверх и слегка перелетает размер (пружинка).
    const pop = k < 1 ? 1 + 0.12 * Math.sin(k * Math.PI) : 1;
    const rise = c.buttonRise * k;
    this.el.style.transform = `translate(${this.p.x}px, ${this.p.y - rise}px) translate(-50%, -50%) scale(${(k * pop).toFixed(3)})`;
    this.el.style.opacity = String(Math.min(1, k * 1.4));
    this.el.style.pointerEvents = k > 0.6 ? 'auto' : 'none';
  }
}
