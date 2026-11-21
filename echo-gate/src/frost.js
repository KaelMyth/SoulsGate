// Вид льда на враге: тонкий морозный налёт при замедлении и ледяная глыба при заморозке. Только рисование, логика в status.js.
import * as THREE from 'three';

const GEO = new THREE.IcosahedronGeometry(1, 0);

export class Frost {
  /** Раз в кадр для живых врагов: создаёт (при первой надобности) полупрозрачную глыбу на группе врага и задаёт ей силу. */
  update(list, t) {
    for (const e of list) {
      const chilled = (e.chillT || 0) > 0, frozen = (e.freezeT || 0) > 0;
      if (!chilled && !frozen) { if (e.frost) e.frost.visible = false; continue; }
      if (!e.frost) {
        e.frost = new THREE.Mesh(GEO, new THREE.MeshBasicMaterial({ color: 0xbfeaff, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending }));
        e.frost.renderOrder = 4;
        e.group.add(e.frost);
      }
      const gs = e.group.scale.x || 1;
      const r = (e.radius * (frozen ? 1.45 : 1.25)) / gs;
      e.frost.visible = true;
      e.frost.scale.set(r, r * 0.9, r);
      e.frost.position.y = (e.radius * 0.85) / gs;
      e.frost.rotation.y = frozen ? 0.5 : t * 0.8;
      e.frost.material.opacity = frozen ? 0.5 + 0.08 * Math.sin(t * 9) : 0.08 + 0.07 * (e.chill || 1);
      e.frost.material.color.setHex(frozen ? 0xe8f9ff : 0x9fdcff);
    }
  }
}
