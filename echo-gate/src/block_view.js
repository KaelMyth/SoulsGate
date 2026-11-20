// Сфера блока вокруг героя: голубая полупрозрачная, появляется с «выскоком», в конце блока гаснет,
// при парировании вспыхивает. Только рисование, логика в block.js.
import * as THREE from 'three';

export class BlockView {
  constructor(scene) {
    this.fill = new THREE.MeshBasicMaterial({ color: 0x78beff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    this.edge = new THREE.MeshBasicMaterial({ color: 0xa0d7ff, transparent: true, opacity: 0, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending });
    this.sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), this.fill);
    this.shell = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), this.edge);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xa0d7ff, transparent: true, opacity: 0, depthWrite: false }));
    this.group = new THREE.Group();
    this.group.add(this.sphere, this.shell, this.ring);
    this.group.visible = false;
    scene.add(this.group);
    this.k = 0;     // 0..1 появление
    this.flash = 0; // вспышка парирования
  }

  parry() { this.flash = 1; }

  update(dt, block, x, z, heroRadius) {
    const C = block.cfg;
    const target = block.active ? 1 : 0;
    this.k += (target - this.k) * Math.min(1, dt * (target ? 16 : 10));
    this.flash = Math.max(0, this.flash - dt * 4);
    if (this.k < 0.01 && this.flash <= 0) { this.group.visible = false; return; }
    const left = block.active ? Math.max(0, block.duration - block.t) : 0;
    const fade = block.active ? Math.min(1, left / 0.3) : 1; // последние 0.3 с гаснет
    const R = heroRadius * C.radiusScale;
    const s = R * (0.6 + 0.4 * this.k) * (1 + 0.08 * this.flash);
    this.group.visible = true;
    this.group.position.set(x, 0, z);
    this.sphere.position.y = this.shell.position.y = R * 0.75;
    this.sphere.scale.setScalar(s);
    this.shell.scale.setScalar(s * 1.04);
    this.ring.scale.setScalar(s);
    const a = this.k * fade;
    this.fill.opacity = (0.16 + 0.1 * Math.sin(block.t * 8)) * a + 0.35 * this.flash;
    this.edge.opacity = 0.5 * a + 0.4 * this.flash;
    this.ring.material.opacity = 0.7 * a;
  }
}
