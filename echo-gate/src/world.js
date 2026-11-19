// Сцена Echo Gate: изометрическая ортографическая камера и бесконечное белое поле в решётку.
import * as THREE from 'three';
import { ISO_PITCH } from './iso.js';

export class World {
  /** canvas: куда рисуем; cfg: CONFIG */
  constructor(canvas, cfg) {
    this.cfg = cfg;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cfg.render.pixelRatio));
    this.cfg = cfg;
    this.span = cfg.camera.viewSpan;        // текущий обзор (плавно едет к spanTarget)
    this.spanTarget = this.span;
    this.view = 'hub';
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
        uJitter: { value: F.jitter },
        uFade: { value: F.fade },
        uNoise: { value: F.noise },
        uSnow: { value: new THREE.Vector3(F.snowScale, F.snowCover, F.snowTone) },
        uSnowCol: { value: new THREE.Color(F.snowColor) },
        uSpeckle: { value: F.speckle },
        uPatch: { value: new THREE.Vector2(F.patchDark, F.patchLight) },
        uBase: { value: new THREE.Color(F.base) },
        uDark: { value: new THREE.Color(F.dark) },
        uLight: { value: new THREE.Color(F.light) },
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
        uniform vec2 uCenter, uPatch; uniform float uCell, uJitter, uFade, uNoise, uSpeckle; uniform vec3 uSnow;
        uniform vec3 uSnowCol;
        uniform vec3 uBase, uDark, uLight;
        float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        vec2 corner(vec2 ij) { return (ij + vec2(0.5) + (vec2(h21(ij), h21(ij + 17.3)) - 0.5) * uJitter * 2.0) * uCell; }
        float vnoise(vec2 p) {
          vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
        }
        bool inTri(vec2 p, vec2 a, vec2 b, vec2 c) {
          float d1 = (p.x - b.x) * (a.y - b.y) - (a.x - b.x) * (p.y - b.y);
          float d2 = (p.x - c.x) * (b.y - c.y) - (b.x - c.x) * (p.y - c.y);
          float d3 = (p.x - a.x) * (c.y - a.y) - (c.x - a.x) * (p.y - a.y);
          return !((d1 < 0.0 || d2 < 0.0 || d3 < 0.0) && (d1 > 0.0 || d2 > 0.0 || d3 > 0.0));
        }
        float tone(vec2 p) { // плавные волны тона, как в SoulsGate (числа пересчитаны в метры)
          return 0.5 + 0.17 * sin(p.x * 0.183 + 1.3) + 0.15 * sin(p.y * 0.141 + 0.4) + 0.08 * sin((p.x + p.y) * 0.339);
        }
        void main() {
          vec2 cellId = floor(vW / uCell);
          vec2 cen = vW;
          float seed = 0.0;
          for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
            vec2 id = cellId + vec2(float(i), float(j));
            vec2 p00 = corner(id), p10 = corner(id + vec2(1, 0)), p01 = corner(id + vec2(0, 1)), p11 = corner(id + vec2(1, 1));
            bool d = h21(id + 91.7) < 0.5;
            vec2 a1 = p00, b1 = d ? p10 : p10, c1 = d ? p11 : p01;
            vec2 a2 = d ? p00 : p10, b2 = d ? p11 : p11, c2 = d ? p01 : p01;
            if (inTri(vW, a1, b1, c1)) { cen = (a1 + b1 + c1) / 3.0; seed = h21(id * 2.0 + (d ? 1.3 : 2.7)); }
            else if (inTri(vW, a2, b2, c2)) { cen = (a2 + b2 + c2) / 3.0; seed = h21(id * 2.0 + (d ? 5.1 : 6.9)); }
          }
          float t = clamp(tone(cen) + (seed - 0.5) * uNoise, 0.0, 1.0);
          vec3 c = mix(uDark, uLight, t);
          // Снежные зоны: крупные пятна с неровным краем; снег светлее и чуть гладче, грани проступают слабее.
          float zn = vnoise(vW * uSnow.x + 7.0) * 0.7 + vnoise(vW * uSnow.x * 4.0 + 19.0) * 0.3;
          float snow = smoothstep(1.0 - uSnow.y - 0.012, 1.0 - uSnow.y + 0.012, zn);
          vec3 sc = mix(uSnowCol, c, 0.2) * (0.8 + 0.34 * t);
          c = mix(c, sc, snow * uSnow.z * 1.6);
          // Крошка и камешки: мелкие тёмные пятна на земле, в снегу светлые ямки.
          vec2 sp = floor(vW * 5.0);
          float hs = h21(sp + 313.0);
          vec2 fp = fract(vW * 5.0) - 0.5;
          float dot_ = smoothstep(0.2, 0.08, length(fp));
          c = mix(c, snow > 0.5 ? c * 1.12 : c * 0.62, step(1.0 - uSpeckle, hs) * dot_);
          float dep = smoothstep(0.55, 0.9, vnoise(vW * 0.11 + 3.0));
          float drift = smoothstep(0.6, 0.92, vnoise(vW * 0.09 + 41.0));
          c = mix(c, vec3(0.03, 0.05, 0.09), dep * uPatch.x * 2.0);
          c = mix(c, vec3(0.78, 0.84, 0.93), drift * uPatch.y * 2.0);
          float d = length(vW - uCenter) / uFade;
          c = mix(c, uBase, smoothstep(0.55, 1.0, d));
          gl_FragColor = linearToOutputTexel(vec4(c, 1.0));
        }`,
    });
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(F.size, F.size), this.floorMat);
    this.floor.rotation.x = -Math.PI / 2;
    this.scene.add(this.floor);

    this.resize();
    window.addEventListener('resize', () => this.resize());
    if (window.ResizeObserver) new ResizeObserver(() => this.resize()).observe(this.renderer.domElement.parentElement);
  }

  /** Цвет пустоты за краем хаба (color) или обычный цвет земли (null). */
  setVoid(color) {
    this.renderer.setClearColor(color || this.cfg.floor.base, 1);
    this.floor.visible = true;
  }

  resize() {
    // Размер берём у рамки «телефона», а не у окна браузера.
    const box = this.renderer.domElement.parentElement;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.cfg.render.pixelRatio));
    const w = Math.max(1, box.clientWidth);
    const h = Math.max(1, box.clientHeight);
    this.renderer.setSize(w, h, false);
    this.applyProjection();
  }

  /** Обзор камеры: 'hub' (viewSpan) или 'run' (runSpan). snap: сразу, без плавного отдаления. */
  setView(view, snap) {
    this.view = view;
    this.refreshView(snap);
  }

  /** Перечитать число обзора из CONFIG (ползунки настроек). */
  refreshView(snap) {
    this.spanTarget = this.view === 'run' ? this.cfg.camera.runSpan : this.cfg.camera.viewSpan;
    if (snap) { this.span = this.spanTarget; this.applyProjection(); }
  }

  applyProjection() {
    const el = this.renderer.domElement.parentElement;
    const w = Math.max(1, el.clientWidth);
    const h = Math.max(1, el.clientHeight);
    const a = w / h;
    const span = this.span;
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
    if (Math.abs(this.spanTarget - this.span) > 1e-4) {
      const kz = this.cfg.camera.zoomTime <= 1e-6 ? 1 : 1 - Math.exp(-dt / this.cfg.camera.zoomTime);
      this.span += (this.spanTarget - this.span) * kz;
      this.applyProjection();
    }
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

  /** Точка мира (x, y, z) в пикселях рамки: out = { x, y }. Вызывать после render(). */
  project(x, y, z, out) {
    this.pv = this.pv || new THREE.Vector3();
    this.pv.set(x, y, z).project(this.camera);
    const el = this.renderer.domElement;
    out.x = (this.pv.x * 0.5 + 0.5) * el.clientWidth;
    out.y = (-this.pv.y * 0.5 + 0.5) * el.clientHeight;
    return out;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
