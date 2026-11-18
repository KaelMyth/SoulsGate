// Сцена Echo Gate: изометрическая ортографическая камера и бесконечное белое поле в решётку.
import * as THREE from 'three';
import { ISO_PITCH } from './iso.js';

export class World {
  /** canvas: куда рисуем; cfg: CONFIG */
  constructor(canvas, cfg) {
    this.cfg = cfg;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(cfg.floor.base, 1);

    this.scene = new THREE.Scene();

    // Свет: мягкий небесный плюс направленный сверху-спереди (к камере), без теней: тень героя нарисована кругом.
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xaab4cc, 1.25));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(6, 12, 9);
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0x9fb4ff, 0.5);
    rim.position.set(-8, 5, -6);
    this.scene.add(rim);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    this.target = new THREE.Vector3(0, 0.8, 0); // куда смотрит камера (сглаженная позиция героя)

    // Пол.
    const F = cfg.floor;
    this.floorMat = new THREE.ShaderMaterial({
      uniforms: {
        uCenter: { value: new THREE.Vector2() },
        uCell: { value: F.cell },
        uMajor: { value: F.major },
        uFade: { value: F.fade },
        uBase: { value: new THREE.Color(F.base) },
        uLine: { value: new THREE.Color(F.line) },
        uMajorLine: { value: new THREE.Color(F.majorLine) },
      },
      vertexShader: `
        varying vec2 vW;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vW = w.xz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: `
        varying vec2 vW;
        uniform vec2 uCenter; uniform float uCell, uMajor, uFade;
        uniform vec3 uBase, uLine, uMajorLine;
        float grid(vec2 p, float cell, float w) {
          vec2 g = abs(fract(p / cell - 0.5) - 0.5) / (fwidth(p / cell) * w);
          return 1.0 - min(min(g.x, g.y), 1.0);
        }
        void main() {
          float minor = grid(vW, uCell, 1.0);
          float major = grid(vW, uCell * uMajor, 1.6);
          vec3 c = mix(uBase, uLine, minor * 0.9);
          c = mix(c, uMajorLine, major);
          float d = length(vW - uCenter) / uFade;
          float fade = 1.0 - smoothstep(0.55, 1.0, d);
          gl_FragColor = vec4(mix(uBase, c, fade), 1.0);
        }`,
      extensions: { derivatives: true },
    });
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(F.size, F.size), this.floorMat);
    this.floor.rotation.x = -Math.PI / 2;
    this.scene.add(this.floor);

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    const a = w / h;
    const span = this.cfg.camera.viewSpan;
    // viewSpan - половина поля по короткой стороне; в изометрии вертикаль сжата, поэтому по высоте даём запас.
    const halfW = a < 1 ? span : span * a;
    const halfH = a < 1 ? span / a : span;
    const c = this.camera;
    c.left = -halfW;
    c.right = halfW;
    c.top = halfH;
    c.bottom = -halfH;
    c.updateProjectionMatrix();
  }

  /** Камера следует за точкой (x, z) с плавностью smoothTime. snap: без сглаживания. */
  follow(dt, x, z, snap) {
    const k = snap || this.cfg.camera.smoothTime <= 1e-6 ? 1 : 1 - Math.exp(-dt / this.cfg.camera.smoothTime);
    this.target.x += (x - this.target.x) * k;
    this.target.z += (z - this.target.z) * k;
    const d = this.cfg.camera.distance;
    // Направление (1, 1, 1) нормировано по проекции: даёт настоящие 45° и ISO_PITCH.
    const horiz = d * Math.cos(ISO_PITCH);
    this.camera.position.set(
      this.target.x + horiz * Math.SQRT1_2,
      this.target.y + d * Math.sin(ISO_PITCH),
      this.target.z + horiz * Math.SQRT1_2,
    );
    this.camera.lookAt(this.target);
    this.floor.position.set(this.target.x, 0, this.target.z);
    this.floorMat.uniforms.uCenter.value.set(this.target.x, this.target.z);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
