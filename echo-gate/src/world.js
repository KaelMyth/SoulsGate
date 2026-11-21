// Сцена Echo Gate: изометрическая ортографическая камера и бесконечная земля промёрзлой пустоши.
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

    // Пол: одна большая плоскость с бесшовной текстурой промёрзлой пустоши (assets/ground.jpg, делает tools/make_ground.py).
    // Свет и тени запечены в текстуру под камеру игры (свет слева-сверху, тени вправо-вниз), поэтому пол дешёвый:
    // один выбор цвета на пиксель. Плоскость едет за героем, а текстура привязана к миру и не скользит.
    const F = cfg.floor;
    const tex = new THREE.TextureLoader().load(`${F.texture}?v=${window.__ECHO_BUILD || 0}`);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    this.floorMat = new THREE.ShaderMaterial({
      uniforms: {
        uTex: { value: tex },
        uTile: { value: F.tile },
        uCenter: { value: new THREE.Vector2() },
        uFade: { value: F.fade },
        uTint: { value: F.tint },
        uDim: { value: F.outsideDim },
        uHub: { value: new THREE.Vector4(0, 0, 1.4, 0) }, // x,y: полуразмеры поля хаба (повёрнуто на 45°), z: мягкость края, w: включено
        uBase: { value: new THREE.Color(F.base) },
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
        uniform sampler2D uTex; uniform vec2 uCenter; uniform vec3 uBase; uniform vec4 uHub;
        uniform float uTile, uFade, uTint, uDim;
        float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float vnoise(vec2 p) {
          vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
        }
        void main() {
          vec3 c = texture2D(uTex, vW / uTile).rgb;
          // Крупные пятна тона ломают повтор тайла: земля чуть светлее-теплее в одних местах и холоднее-темнее в других.
          float m1 = vnoise(vW * 0.045 + 5.0) - 0.5;
          float m2 = vnoise(vW * 0.12 + 17.0) - 0.5;
          c *= 1.0 + uTint * (m1 * 1.6 + m2 * 0.7);
          c = mix(c, c * vec3(1.03, 1.0, 0.96), smoothstep(0.1, 0.4, m1 + 0.5 * m2) * 0.5);
          // За краем поля хаба земля темнее, чтобы база читалась.
          vec2 hl = vec2(vW.x - vW.y, vW.x + vW.y) * 0.70711;
          vec2 hq = uHub.xy - abs(hl);
          float inHub = smoothstep(-0.3, uHub.z, min(hq.x, hq.y));
          c *= 1.0 - uHub.w * (1.0 - inHub) * uDim;
          float d = length(vW - uCenter) / uFade;
          c = mix(c, uBase, smoothstep(0.55, 1.0, d));
          gl_FragColor = linearToOutputTexel(vec4(c, 1.0));
        }`,
    });
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(F.fade * 2.1, F.fade * 2.1), this.floorMat);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.frustumCulled = false;
    this.scene.add(this.floor);

    this.resize();
    window.addEventListener('resize', () => this.resize());
    if (window.ResizeObserver) new ResizeObserver(() => this.resize()).observe(this.renderer.domElement.parentElement);
  }

  /** Внутри поля хаба (полуразмеры hw/hd) земля обычная, за краем темнее (чтобы база читалась). */
  setHubGround(on, hw = 0, hd = 0) {
    const u = this.floorMat.uniforms;
    u.uHub.value.set(hw, hd, 1.4, on ? 1 : 0);
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

  /** Радиус (м) от центра кадра до самого дальнего угла экрана на земле (по настоящему лучу камеры): жуки появляются за ним. */
  groundRadius() {
    const c = this.camera;
    c.updateMatrixWorld();
    const p0 = this._g0 || (this._g0 = new THREE.Vector3());
    const p1 = this._g1 || (this._g1 = new THREE.Vector3());
    const ground = (nx, ny, out) => { // точка земли (y = 0) под точкой экрана (nx, ny) в долях -1..1
      p0.set(nx, ny, -1).unproject(c);
      p1.set(nx, ny, 1).unproject(c);
      const t = p0.y / (p0.y - p1.y || 1e-9);
      out.x = p0.x + (p1.x - p0.x) * t; out.z = p0.z + (p1.z - p0.z) * t;
    };
    const o = this._go || (this._go = { x: 0, z: 0 });
    ground(0, 0, o);
    const cx = o.x, cz = o.z;
    let m = 0;
    for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      ground(x, y, o);
      m = Math.max(m, Math.hypot(o.x - cx, o.z - cz));
    }
    return m;
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
    if (this.overlay) this.overlay.render(this.renderer, this.camera); // метель поверх кадра
  }
}
