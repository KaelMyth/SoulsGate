// Стенд сборки посоха на тестовом поле: каменный постамент с рунным кольцом, над ним парит кристалл, вокруг него по кругу идут звёзды цветов модов.
// Центр у земли в (0,0,0), размер примерно 3x3 м. Снаружи: Workbench.group и Workbench.update(dt).
import * as THREE from 'three';

function mat(color, rough = 0.85) { return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.1, flatShading: true }); }
const COLORS = [0xff7a4a, 0x4fd8ff, 0x7dff9a, 0xb06bff, 0xffc65a]; // цвета модов

export class Workbench {
  constructor() {
    this.group = new THREE.Group();
    this.t = 0;
    const stone = mat(0x4a5470), dark = mat(0x2a3146);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 0.2, 10), dark); base.position.y = 0.1;
    const step = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.2, 0.3, 10), stone); step.position.y = 0.35;
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, 0.9, 8), stone); col.position.y = 0.95;
    this.group.add(base, step, col);
    // Рунное кольцо на плите.
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.04, 6, 40), new THREE.MeshBasicMaterial({ color: 0xb58cff }));
    this.ring.rotation.x = Math.PI / 2; this.ring.position.y = 0.22;
    this.group.add(this.ring);
    // Парящий кристалл.
    this.gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.34, 0), new THREE.MeshStandardMaterial({ color: 0xcdb8ff, emissive: 0x8a5cff, emissiveIntensity: 1.2, roughness: 0.3, flatShading: true }));
    this.gem.scale.y = 1.5; this.gem.position.y = 2.0;
    this.group.add(this.gem);
    // Звёзды по кругу.
    this.stars = COLORS.map((c) => {
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), new THREE.MeshBasicMaterial({ color: c }));
      this.group.add(s);
      return s;
    });
    // Мягкое свечение на земле.
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const g = cv.getContext('2d'); const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(181,140,255,0.6)'); r.addColorStop(1, 'rgba(181,140,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace;
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tx, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.glow.position.y = 0.05;
    this.group.add(this.glow);
  }

  update(dt) {
    this.t += dt;
    const t = this.t;
    this.gem.position.y = 2.0 + Math.sin(t * 1.6) * 0.12;
    this.gem.rotation.y = t * 0.9;
    this.ring.rotation.z = t * 0.4;
    this.stars.forEach((s, i) => {
      const a = t * 0.8 + (i / this.stars.length) * Math.PI * 2;
      s.position.set(Math.cos(a) * 0.95, this.gem.position.y + Math.sin(t * 2 + i) * 0.12, Math.sin(a) * 0.95);
      s.rotation.y = t * 2;
    });
    this.glow.material.opacity = 0.8 + 0.2 * Math.sin(t * 2);
  }
}
