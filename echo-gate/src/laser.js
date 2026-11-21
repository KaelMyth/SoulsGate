// Лазерный посох: мгновенный луч из кристалла вдоль линии на цель, пробивает всех врагов на пути до предельной дальности.
// Луч это плоская лента, всегда повёрнутая к камере (см. faceCamBasis), двумя слоями: широкое красное свечение и тонкая белая сердцевина.
// Живёт доли секунды: сужается и гаснет. Мешей немного (пул), на кадр это пара матриц.
import * as THREE from 'three';

const CAM_BACK = new THREE.Vector3(1, 1, 1).normalize(); // к камере (изометрия: камера смотрит вдоль (-1,-1,-1))

/** Базис ленты вдоль dir, лицом к камере: x = вдоль, y = поперёк, z = нормаль. Пишет в m, возвращает его. */
export function faceCamBasis(m, dir, length, width, cx, cy, cz) {
  const x = new THREE.Vector3().copy(dir).normalize();
  const z = new THREE.Vector3().copy(CAM_BACK).addScaledVector(x, -CAM_BACK.dot(x));
  if (z.lengthSq() < 1e-4) z.set(0, 1, 0);
  z.normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  m.makeBasis(x.multiplyScalar(length), y.multiplyScalar(width), z);
  m.setPosition(cx, cy, cz);
  return m;
}

/** Профиль ленты: мягкий поперёк (гауссиан) и плавное затухание на концах. */
function beamTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  const img = g.createImageData(64, 64);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const v = (y + 0.5) / 64 * 2 - 1;
      const u = (x + 0.5) / 64;
      const across = Math.exp(-v * v * 4.5);
      const ends = Math.min(1, u / 0.06) * Math.min(1, (1 - u) / 0.1);
      const a = Math.max(0, Math.min(1, across * ends));
      const i = (y * 64 + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Laser {
  /** cfg: CONFIG.laser */
  constructor(scene, cfg) {
    this.scene = scene;
    this.cfg = cfg;
    this.tex = beamTexture();
    this.pool = [];
    this.m = new THREE.Matrix4();
    this.d = new THREE.Vector3();
  }

  make() {
    const mk = (color) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0),
        new THREE.MeshBasicMaterial({ map: this.tex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
      mesh.matrixAutoUpdate = false;
      mesh.renderOrder = 6;
      mesh.frustumCulled = false;
      mesh.visible = false;
      this.scene.add(mesh);
      return mesh;
    };
    const b = { on: false, t: 0, glow: mk(this.cfg.glow), core: mk(this.cfg.core), x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0, w: 1 };
    this.pool.push(b);
    return b;
  }

  /** Выпустить луч из (x0,y0,z0) в (x1,y1,z1). */
  shoot(x0, y0, z0, x1, y1, z1) {
    const b = this.pool.find((e) => !e.on) || this.make();
    b.on = true; b.t = 0;
    b.x0 = x0; b.y0 = y0; b.z0 = z0; b.x1 = x1; b.y1 = y1; b.z1 = z1;
    b.glow.visible = b.core.visible = true;
    this.place(b, 1);
  }

  place(b, k) {
    const c = this.cfg;
    this.d.set(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0);
    const L = this.d.length();
    faceCamBasis(this.m, this.d, L, c.glowWidth * k, b.x0, b.y0, b.z0);
    b.glow.matrix.copy(this.m);
    faceCamBasis(this.m, this.d, L, c.coreWidth * k, b.x0, b.y0, b.z0);
    b.core.matrix.copy(this.m);
  }

  update(dt) {
    const life = this.cfg.life;
    for (const b of this.pool) {
      if (!b.on) continue;
      b.t += dt;
      const q = b.t / life;
      if (q >= 1) { b.on = false; b.glow.visible = b.core.visible = false; continue; }
      const fade = 1 - q;
      // вспышка в начале: луч сразу полный и яркий, потом быстро сужается
      const k = q < 0.12 ? 1 + 0.5 * (1 - q / 0.12) : 1 - 0.75 * ((q - 0.12) / 0.88);
      this.place(b, k);
      b.glow.material.opacity = 0.85 * fade * fade;
      b.core.material.opacity = Math.min(1, 1.4 * fade);
    }
  }
}
