// Красная полоса на земле перед рывком быка (SoulsGate getTelegraph): показывает, куда придёт удар. Заполняется за время замаха.
// Пул плоских прямоугольников: тёмная подложка во всю длину и яркая заливка, растущая от быка вперёд. Данные даёт Spawner.telegraph.
import * as THREE from 'three';

export class Telegraphs {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    this.out = {};
    this.geo = new THREE.PlaneGeometry(1, 1);
    this.geo.rotateX(-Math.PI / 2);
    this.geo.translate(0, 0, 0.5); // растёт от начала (быка) вперёд по +z
    this.circ = new THREE.CircleGeometry(1, 48);
    this.circ.rotateX(-Math.PI / 2);
    this.ringPool = [];
  }

  make() {
    const mat = (o) => new THREE.MeshBasicMaterial({ color: 0xff3b2a, transparent: true, opacity: o, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const t = { back: new THREE.Mesh(this.geo, mat(0.2)), fill: new THREE.Mesh(this.geo, mat(0.45)) };
    for (const m of [t.back, t.fill]) { m.renderOrder = 2; m.position.y = 0.03; this.scene.add(m); }
    this.pool.push(t);
    return t;
  }

  makeRing() {
    const mat = (o) => new THREE.MeshBasicMaterial({ color: 0xff3b2a, transparent: true, opacity: o, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const t = { back: new THREE.Mesh(this.circ, mat(0.15)), fill: new THREE.Mesh(this.circ, mat(0.35)) };
    for (const m of [t.back, t.fill]) { m.renderOrder = 2; m.position.y = 0.03; this.scene.add(m); }
    this.ringPool.push(t);
    return t;
  }

  /** Нарисовать полосы для всех быков в замахе (spawner.telegraph). */
  update(spawner) {
    let n = 0, k = 0;
    for (const e of spawner.alive) {
      const g = spawner.telegraph(e, this.out);
      if (!g) continue;
      if (g.shape === 'circle') { // кольцо замаха скалы: заливка растёт от центра
        const r = this.ringPool[k++] || this.makeRing();
        for (const m of [r.back, r.fill]) { m.visible = true; m.position.x = g.x; m.position.z = g.z; }
        r.back.scale.set(g.radius, 1, g.radius);
        r.fill.scale.set(g.radius * g.progress, 1, g.radius * g.progress);
        continue;
      }
      const t = this.pool[n++] || this.make();
      const yaw = Math.atan2(g.dirX, g.dirZ);
      for (const m of [t.back, t.fill]) {
        m.visible = true;
        m.position.x = g.x; m.position.z = g.z;
        m.rotation.y = yaw;
        m.scale.set(g.width, 1, g.length);
      }
      t.fill.scale.z = g.length * g.progress;
      t.fill.material.opacity = 0.3 + 0.25 * g.progress;
    }
    for (let i = n; i < this.pool.length; i++) this.pool[i].back.visible = this.pool[i].fill.visible = false;
    for (let i = k; i < this.ringPool.length; i++) this.ringPool[i].back.visible = this.ringPool[i].fill.visible = false;
  }
}
