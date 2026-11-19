// Мошки Горного жука в 3D: тёмное тельце с зелёным светящимся ореолом и мерцающими крылышками, пул спрайтов (аддитивное свечение).
import * as THREE from 'three';

function glow() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(230,255,235,1)');
  r.addColorStop(0.3, 'rgba(120,255,150,0.8)');
  r.addColorStop(1, 'rgba(60,220,110,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class MidgeView {
  constructor(scene) {
    this.scene = scene;
    this.tex = glow();
    this.pool = [];
    this.body = new THREE.IcosahedronGeometry(1, 0);
    this.bodyMat = new THREE.MeshStandardMaterial({ color: 0x1d3a2a, flatShading: true, roughness: 0.5 });
    this.t = 0;
  }

  make() {
    const g = new THREE.Group();
    const b = new THREE.Mesh(this.body, this.bodyMat);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
    s.renderOrder = 5;
    g.add(b, s);
    this.scene.add(g);
    const v = { g, b, s };
    this.pool.push(v);
    return v;
  }

  /** midges: Midges.items */
  update(dt, items) {
    this.t += dt;
    let n = 0;
    for (const m of items) {
      if (!m.active) continue;
      const v = this.pool[n++] || this.make();
      const r = m.def.radius;
      v.g.visible = true;
      v.g.position.set(m.x, 0.7 + Math.sin(this.t * 14 + m.phase) * 0.08, m.z);
      v.b.scale.setScalar(r * 0.8);
      v.s.scale.setScalar(r * (5 + Math.sin(this.t * 30 + m.phase) * 0.8));
    }
    for (let i = n; i < this.pool.length; i++) this.pool[i].g.visible = false;
  }
}
