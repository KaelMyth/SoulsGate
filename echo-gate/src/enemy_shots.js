// Шары жуков-стрелков (SoulsGate enemy shot, мир в метрах): фиолетовая светящаяся точка летит по прямой в сторону героя
// на момент выстрела. Попал в героя: урон (hurtHero учитывает неуязвимость), шар гаснет. Прошёл range: гаснет.
// Пул объектов, спрайты с аддитивным смешиванием (как шарики мага), без света и теней.
import * as THREE from 'three';

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,240,255,1)');
  r.addColorStop(0.25, 'rgba(226,130,255,1)');
  r.addColorStop(0.6, 'rgba(150,60,230,0.55)');
  r.addColorStop(1, 'rgba(110,40,200,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const TRAIL = 4;

export class EnemyShots {
  constructor(scene) {
    this.scene = scene;
    this.tex = glowTexture();
    this.pool = [];
    this.items = []; // активные
  }

  sprite(opacity) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.tex, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
    }));
    s.renderOrder = 5;
    this.scene.add(s);
    return s;
  }

  take() {
    let p = this.pool.find((x) => !x.active);
    if (!p) {
      p = { active: false, x: 0, y: 0.5, z: 0, vx: 0, vz: 0, radius: 0.2, damage: 0, left: 0, core: this.sprite(1), trail: [] };
      for (let i = 0; i < TRAIL; i++) p.trail.push({ s: this.sprite(0.5), x: 0, z: 0 });
      this.pool.push(p);
    }
    return p;
  }

  /** Выстрел стрелка e в направлении (dx, dz) единичной длины; def: CONFIG.shooter.shot. */
  fire(e, dx, dz, def) {
    const p = this.take();
    p.active = true;
    p.x = e.x + dx * e.radius; p.z = e.z + dz * e.radius;
    p.vx = dx * def.speed; p.vz = dz * def.speed;
    p.radius = def.radius; p.damage = def.damage; p.left = def.range;
    for (const t of p.trail) { t.x = p.x; t.z = p.z; }
    p.core.visible = true;
    for (const t of p.trail) t.s.visible = true;
    this.items.push(p);
  }

  deactivate(p) {
    p.active = false;
    p.core.visible = false;
    for (const t of p.trail) t.s.visible = false;
    const i = this.items.indexOf(p);
    if (i >= 0) this.items.splice(i, 1);
  }

  clear() { for (const p of [...this.items]) this.deactivate(p); }

  /** hero: { x, z, radius }; onHit(урон) вызывается при попадании. */
  update(dt, hero, onHit) {
    for (const p of [...this.items]) {
      p.x += p.vx * dt; p.z += p.vz * dt;
      p.left -= Math.hypot(p.vx, p.vz) * dt;
      const dx = hero.x - p.x, dz = hero.z - p.z, R = hero.radius + p.radius;
      if (dx * dx + dz * dz < R * R) { onHit(p.damage); this.deactivate(p); continue; }
      if (p.left <= 0) { this.deactivate(p); continue; }
      for (let i = TRAIL - 1; i > 0; i--) { p.trail[i].x = p.trail[i - 1].x; p.trail[i].z = p.trail[i - 1].z; }
      p.trail[0].x = p.x; p.trail[0].z = p.z;
      const pulse = 1 + Math.sin(p.left * 9) * 0.12;
      p.core.position.set(p.x, p.y, p.z);
      p.core.scale.setScalar(p.radius * 4.2 * pulse);
      for (let i = 0; i < TRAIL; i++) {
        const t = p.trail[i], k = 1 - (i + 1) / (TRAIL + 1);
        t.s.position.set(t.x - p.vx * 0.012 * (i + 1), p.y, t.z - p.vz * 0.012 * (i + 1));
        t.s.scale.setScalar(p.radius * 3.4 * k);
        t.s.material.opacity = 0.5 * k;
      }
    }
  }
}
