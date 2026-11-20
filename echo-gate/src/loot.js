// Добыча на земле: камешки опыта, кристаллы усиления и умения, обрывки страниц.
// Выпадает из убитого жука дугой, лежит и покачивается; героя притягивает с магнитного радиуса, подбирается вплотную.
// Рисуется четырьмя InstancedMesh (по одному вызову отрисовки на вид), свечение редких видов спрайтом.
import * as THREE from 'three';
import { rollDrops } from './drops.js';

const TYPES = ['xp', 'power', 'skill', 'page'];

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,0.9)');
  r.addColorStop(0.35, 'rgba(255,255,255,0.28)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Кристалл: шестигранная (или иная) двойная пирамида. */
function crystal(r, h, sides, stretch) {
  const pts = [new THREE.Vector2(0.0001, -h), new THREE.Vector2(r, -h * 0.15 * stretch), new THREE.Vector2(r * 0.9, h * 0.35), new THREE.Vector2(0.0001, h)];
  return new THREE.LatheGeometry(pts, sides);
}

/** Обрывок страницы: рваный плоский многоугольник с тёмными строчками (цвета вершин). */
function pageGeometry() {
  const outline = [[-0.16, -0.12], [-0.05, -0.15], [0.06, -0.11], [0.15, -0.14], [0.17, -0.02], [0.12, 0.07], [0.16, 0.14], [0.02, 0.16], [-0.07, 0.11], [-0.17, 0.14], [-0.13, 0.02]];
  const pos = [];
  const col = [];
  const paper = new THREE.Color(0xe8d9b0);
  const ink = new THREE.Color(0x5a4630);
  const tri = (a, b, c, k) => { for (const v of [a, b, c]) { pos.push(v[0], v[1], 0); col.push(k.r, k.g, k.b); } };
  for (let i = 1; i < outline.length - 1; i++) tri(outline[0], outline[i], outline[i + 1], paper);
  for (const y of [-0.07, -0.01, 0.05, 0.1]) {
    const x0 = -0.1, x1 = 0.07 + (y > 0.04 ? -0.04 : 0.03);
    tri([x0, y - 0.006, ], [x1, y - 0.006], [x1, y + 0.006], ink);
    tri([x0, y - 0.006], [x1, y + 0.006], [x0, y + 0.006], ink);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.rotateX(-Math.PI / 2); // лежит плашмя
  g.computeVertexNormals();
  return g;
}

export class Loot {
  /** cfg: CONFIG.loot; hero: радиус берётся из cfg.pickupRadius */
  constructor(scene, cfg) {
    this.scene = scene;
    this.cfg = cfg;
    this.radiusMult = 1; // усиления радиуса подбора
    this.onCollect = null; // (type, value) => void
    this.drops = [];
    this.t = 0;
    const glow = glowTexture();
    this.glowTex = glow;
    const std = (color, em, k) => new THREE.MeshStandardMaterial({ color, emissive: em, emissiveIntensity: k, flatShading: true, roughness: 0.35, side: THREE.DoubleSide });
    const geos = {
      xp: new THREE.OctahedronGeometry(0.1, 0).scale(1, 1.35, 1),
      power: crystal(0.1, 0.21, 6, 1),
      skill: crystal(0.075, 0.27, 5, 1.2),
      page: pageGeometry(),
    };
    const mats = {
      xp: std(cfg.xp.color, cfg.xp.color, 0.7),
      power: std(cfg.power.color, cfg.power.color, 0.65),
      skill: std(cfg.skill.color, cfg.skill.color, 0.65),
      page: new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0x7a6a48, emissiveIntensity: 0.5, roughness: 0.9, side: THREE.DoubleSide }),
    };
    this.meshes = {};
    for (const k of TYPES) {
      const m = new THREE.InstancedMesh(geos[k], mats[k], cfg.maxDrops);
      m.count = 0;
      m.frustumCulled = false;
      scene.add(m);
      this.meshes[k] = m;
    }
    this.glows = []; // спрайты свечения, по одному на редкую добычу
    this.dummy = new THREE.Object3D();
  }

  /** Жук убит в (x, z): выпадает всё по таблице. */
  drop(x, z, xpValue) {
    const kinds = rollDrops(this.cfg);
    for (const type of kinds) this.add(type, x, z, type === 'xp' ? xpValue : 1);
  }

  add(type, x, z, value) {
    const c = this.cfg;
    if (this.drops.length >= c.maxDrops) this.collect(0); // переполнение: самая старая сразу достаётся герою
    const a = Math.random() * Math.PI * 2;
    const d = type === 'xp' ? 0.3 + Math.random() * 0.7 : 0.6 + Math.random() * 0.6;
    const drop = {
      type, value, ox: x, oz: z, tx: x + Math.cos(a) * d, tz: z + Math.sin(a) * d,
      x, y: 0.2, z, age: 0, ph: Math.random() * 6.28, spin: 0.8 + Math.random() * 0.8, magnet: false, vx: 0, vz: 0, glow: null,
    };
    if (type !== 'xp') {
      let s = this.glows.pop();
      if (!s) {
        s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
        this.scene.add(s);
      }
      s.material.color.set(c[type].color);
      s.scale.set(c[type].glow * c.size, c[type].glow * c.size, 1);
      s.visible = true;
      drop.glow = s;
    }
    this.drops.push(drop);
  }

  collect(i) {
    const d = this.drops[i];
    this.drops.splice(i, 1);
    if (d.glow) { d.glow.visible = false; this.glows.push(d.glow); }
    if (this.onCollect) this.onCollect(d.type, d.value);
  }

  /** Убрать всё с земли без выдачи (новая игра). */
  clear() {
    for (const d of this.drops) if (d.glow) { d.glow.visible = false; this.glows.push(d.glow); }
    this.drops.length = 0;
    for (const k of TYPES) this.meshes[k].count = 0;
  }

  update(dt, hx, hz) {
    const c = this.cfg;
    this.t += dt;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.age += dt;
      const dx = hx - d.x, dz = hz - d.z;
      const dist = Math.hypot(dx, dz);
      if (d.age >= c.popTime) {
        if (!d.magnet && dist < c.magnetRadius * this.radiusMult) d.magnet = true;
        if (d.magnet) {
          // Тянется к герою всё быстрее.
          const sp = c.magnetSpeed * (1 + 2 * Math.max(0, 1 - dist / c.magnetRadius));
          const k = Math.min(1, (sp * dt) / Math.max(dist, 1e-4));
          d.x += dx * k;
          d.z += dz * k;
          if (dist < c.pickupRadius * this.radiusMult) { this.collect(i); continue; }
        }
      }
      if (d.age < c.popTime) {
        const u = d.age / c.popTime;
        d.x = d.ox + (d.tx - d.ox) * u;
        d.z = d.oz + (d.tz - d.oz) * u;
        d.y = 0.2 + Math.sin(u * Math.PI) * 0.7;
      } else if (d.magnet) {
        d.y += (0.55 - d.y) * Math.min(1, dt * 6);
      } else {
        d.y = 0.3 + Math.sin(this.t * 2.4 + d.ph) * 0.06;
      }
    }
    const n = { xp: 0, power: 0, skill: 0, page: 0 };
    const o = this.dummy;
    for (const d of this.drops) {
      o.position.set(d.x, d.type === 'page' ? d.y * 0.7 : d.y, d.z);
      if (d.type === 'page') o.rotation.set(Math.sin(this.t * 1.7 + d.ph) * 0.18, d.ph + this.t * 0.4, Math.cos(this.t * 1.3 + d.ph) * 0.18);
      else o.rotation.set(0, d.ph + this.t * d.spin, d.type === 'xp' ? 0.25 : 0);
      o.scale.setScalar(c.size * (d.type === 'xp' ? 1 : 1 + Math.sin(this.t * 3 + d.ph) * 0.05));
      o.updateMatrix();
      this.meshes[d.type].setMatrixAt(n[d.type]++, o.matrix);
      if (d.glow) {
        d.glow.position.set(d.x, d.y + 0.05, d.z);
        d.glow.material.opacity = 0.55 + 0.25 * Math.sin(this.t * 4 + d.ph);
      }
    }
    for (const k of TYPES) { this.meshes[k].count = n[k]; this.meshes[k].instanceMatrix.needsUpdate = true; }
  }
}
