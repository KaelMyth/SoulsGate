// Электрические дуги: ломаная молния между двумя точками. Вспыхивает на долю секунды, форма дрожит (перегенерируется
// каждые ~0.035 с), по краям вспышки. Линия даёт яркую жилу, спрайты по узлам дают свечение. Объекты из пула.
// Часть arc с delay стартует позже (звенья цепной молнии идут одно за другим). Только рисование.
import * as THREE from 'three';

const MAX_N = 24;
const rr = (a, b) => a + Math.random() * (b - a);

export class Lightning {
  /** scene: куда добавлять; map: мягкая белая текстура пятна; max: сколько дуг одновременно. */
  constructor(scene, map, max = 14) {
    this.arcs = [];
    for (let i = 0; i < max; i++) {
      const pos = new Float32Array(MAX_N * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xfffbe0, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
      line.frustumCulled = false;
      line.renderOrder = 7;
      line.visible = false;
      const sprites = [];
      for (let k = 0; k < MAX_N; k++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color: 0xffe45a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
        s.renderOrder = 6;
        s.visible = false;
        scene.add(s);
        sprites.push(s);
      }
      scene.add(line);
      this.arcs.push({ on: false, line, pos, sprites, n: 0, t: 0, life: 0.2, delay: 0, flick: 0, a: [0, 0, 0], b: [0, 0, 0], width: 1 });
    }
  }

  /** Дуга из точки a в точку b (x,y,z). life: сколько видна (с), delay: через сколько стартует, width: толщина свечения (1 = обычная). */
  arc(a, b, { life = 0.2, delay = 0, width = 1, color = 0xfffbe0, glow = 0xffe45a } = {}) {
    const q = this.arcs.find((e) => !e.on);
    if (!q) return;
    q.on = true; q.t = -delay; q.life = life; q.flick = 0; q.width = width;
    q.a = a; q.b = b;
    q.line.material.color.setHex(color);
    for (const sp of q.sprites) sp.material.color.setHex(glow);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    q.n = Math.min(MAX_N, Math.max(4, Math.round(len / 0.4) + 1));
    this.shape(q);
  }

  /** Новая форма: точки вдоль отрезка со случайным смещением, у концов смещения нет. */
  shape(q) {
    const [ax, ay, az] = q.a, [bx, by, bz] = q.b;
    const dx = bx - ax, dz = bz - az;
    const L = Math.hypot(dx, dz) || 1;
    const px = -dz / L, pz = dx / L; // поперёк отрезка по земле
    for (let i = 0; i < q.n; i++) {
      const u = i / (q.n - 1);
      const k = Math.sin(Math.PI * u) * 0.28;
      const j = i === 0 || i === q.n - 1 ? 0 : rr(-1, 1) * k;
      q.pos[i * 3] = ax + dx * u + px * j;
      q.pos[i * 3 + 1] = ay + (by - ay) * u + (i === 0 || i === q.n - 1 ? 0 : rr(-0.5, 0.5) * k);
      q.pos[i * 3 + 2] = az + dz * u + pz * j;
    }
    q.line.geometry.setDrawRange(0, q.n);
    q.line.geometry.attributes.position.needsUpdate = true;
  }

  update(dt) {
    for (const q of this.arcs) {
      if (!q.on) continue;
      q.t += dt;
      if (q.t < 0) continue;
      const k = q.t / q.life;
      if (k >= 1) {
        q.on = false; q.line.visible = false;
        for (const s of q.sprites) s.visible = false;
        continue;
      }
      q.flick += dt;
      if (q.flick >= 0.035) { q.flick = 0; this.shape(q); }
      const fade = 1 - k * k;
      q.line.visible = true;
      q.line.material.opacity = fade * (0.7 + 0.3 * Math.random());
      for (let i = 0; i < MAX_N; i++) {
        const s = q.sprites[i];
        if (i >= q.n) { s.visible = false; continue; }
        const end = i === 0 || i === q.n - 1;
        s.visible = true;
        s.position.set(q.pos[i * 3], q.pos[i * 3 + 1], q.pos[i * 3 + 2]);
        s.scale.setScalar((end ? 0.75 : 0.34) * q.width * (0.8 + 0.4 * Math.random()));
        s.material.opacity = fade * (end ? 0.9 : 0.55);
      }
    }
  }

  clear() {
    for (const q of this.arcs) { q.on = false; q.line.visible = false; for (const s of q.sprites) s.visible = false; }
  }
}
