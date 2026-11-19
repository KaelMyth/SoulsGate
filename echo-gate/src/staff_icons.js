// Иконки посохов для инвентаря: рисуем настоящие 3D-модели (staff_models.js) в маленький прозрачный кадр
// и отдаём картинками (data URL). Один раз за запуск, отдельный крошечный WebGL-контекст сразу закрывается.
import * as THREE from 'three';
import { buildStaffModel } from './staff_models.js';

export function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.35, 'rgba(255,255,255,0.3)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Вернуть { basic, fire, ice, electric: dataURL }. size: сторона кадра в пикселях. При ошибке WebGL вернёт пустой объект (останутся SVG-иконки). */
export function makeStaffIcons(size = 192) {
  const out = {};
  let renderer = null;
  try {
    const canvas = document.createElement('canvas');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(size, size, false);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xcfdcff, 0x4a566e, 1.5));
    const key = new THREE.DirectionalLight(0xffffff, 2.0);
    key.position.set(-2, 3, 4);
    const rim = new THREE.DirectionalLight(0x8fc4ff, 1.2);
    rim.position.set(3, 1, -3);
    scene.add(key, rim);
    const camera = new THREE.OrthographicCamera(-1.05, 1.05, 1.05, -1.05, -10, 10);
    camera.position.set(0, 0, 5);
    const glowTex = glowTexture();
    const belt = new THREE.MeshStandardMaterial({ color: 0x3b2415, roughness: 0.9 });
    for (const variant of ['basic', 'fire', 'ice', 'electric']) {
      const model = buildStaffModel(variant, glowTex, belt);
      model.update(1.3, 0.4);
      const holder = new THREE.Group();
      holder.add(model.group);
      model.group.position.y = -1.3;          // в центр кадра верх посоха: голова крупно, древко уходит за край
      holder.rotation.set(0.12, -0.35, -0.5); // по диагонали, с лёгким поворотом для объёма
      scene.add(holder);
      renderer.render(scene, camera);
      out[variant] = canvas.toDataURL('image/png');
      scene.remove(holder);
    }
  } catch (e) {
    return out; // без WebGL остаются обычные иконки
  } finally {
    if (renderer) { renderer.dispose(); renderer.forceContextLoss(); }
  }
  return out;
}
