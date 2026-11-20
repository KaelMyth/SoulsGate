// Частицы для выстрелов и попаданий: пул светящихся точек с гравитацией, торможением, цветом от яркого к тёмному и угасанием.
// Аддитивные спрайты без света и теней, как остальные эффекты. Логика emit/step не зависит от DOM (кроме спрайтов), числа в вызовах.
import * as THREE from 'three';

export class Particles {
  /** scene: куда добавлять; map: мягкая белая текстура пятна; max: размер пула (самые старые не вытесняются, лишнее пропускается). */
  constructor(scene, map, max = 260) {
    this.list = [];
    for (let i = 0; i < max; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
      s.renderOrder = 6;
      s.visible = false;
      scene.add(s);
      this.list.push({ s, on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 0, life: 1, s0: 0.2, s1: 0, drag: 0, grav: 0, c0: new THREE.Color(), c1: new THREE.Color(), a: 1, floor: 0.03 });
    }
    this.cursor = 0;
  }

  /** Выпустить частицу. p: x,y,z, vx,vy,vz, life (с), size0 -> size1 (м), c0 -> c1 (цвет), drag (1/с), grav (м/с², вниз), alpha. */
  emit(p) {
    const n = this.list.length;
    for (let k = 0; k < n; k++) {
      const q = this.list[(this.cursor + k) % n];
      if (q.on) continue;
      this.cursor = (this.cursor + k + 1) % n;
      q.on = true; q.t = 0;
      q.x = p.x; q.y = p.y; q.z = p.z;
      q.vx = p.vx || 0; q.vy = p.vy || 0; q.vz = p.vz || 0;
      q.life = p.life || 0.4;
      q.s0 = p.size0 !== undefined ? p.size0 : 0.2; q.s1 = p.size1 !== undefined ? p.size1 : 0;
      q.drag = p.drag || 0; q.grav = p.grav || 0;
      q.c0.set(p.c0 !== undefined ? p.c0 : 0xffffff); q.c1.set(p.c1 !== undefined ? p.c1 : 0x2f86ff);
      q.a = p.alpha !== undefined ? p.alpha : 1;
      q.s.visible = true;
      return q;
    }
    return null;
  }

  update(dt) {
    for (const q of this.list) {
      if (!q.on) continue;
      q.t += dt;
      const k = q.t / q.life;
      if (k >= 1) { q.on = false; q.s.visible = false; continue; }
      const damp = Math.exp(-q.drag * dt);
      q.vx *= damp; q.vy *= damp; q.vz *= damp;
      q.vy -= q.grav * dt;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      if (q.y < q.floor) { q.y = q.floor; q.vy = Math.abs(q.vy) * 0.25; q.vx *= 0.6; q.vz *= 0.6; } // чиркнула по земле и почти остановилась
      q.s.position.set(q.x, q.y, q.z);
      q.s.scale.setScalar(Math.max(0.001, q.s0 + (q.s1 - q.s0) * k));
      q.s.material.color.copy(q.c0).lerp(q.c1, Math.min(1, k * 1.4));
      q.s.material.opacity = q.a * (1 - k) * (1 - k * 0.3);
    }
  }

  clear() { for (const q of this.list) { q.on = false; q.s.visible = false; } }
}
