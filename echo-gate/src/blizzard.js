// Снежная буря: четыре уровня силы с плавным переходом. Дёшево: нулевая цена при выключенной буре, иначе три
// фуллскрин-прохода без текстурных цепочек: (1) туман, полупрозрачная вуаль с прозрачным «окном» вокруг героя и
// плывущими порывами (одна маленькая шумовая текстура, 2 выборки); (2) снежинки-штрихи одним мешем (до ~1400 штук,
// всё считает вершинный шейдер, процессору ничего); порывы собирают их в потоки вдоль ветра.
// Уровень L непрерывный (0..4): this.level плавно едет к цели, параметры берутся интерполяцией по таблице CONFIG.blizzard.levels.
import * as THREE from 'three';

const NOISE = 128;

/** Бесшовный шум 128x128: R крупные облака тумана, G вытянутые полосы порывов. */
function makeNoise() {
  const rnd = (() => { let s = 1234567; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();
  const grid = (n) => { const g = new Float32Array(n * n); for (let i = 0; i < g.length; i++) g[i] = rnd(); return g; };
  const octave = (g, n, x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = g[(yi % n) * n + (xi % n)], b = g[(yi % n) * n + ((xi + 1) % n)];
    const c = g[((yi + 1) % n) * n + (xi % n)], d = g[((yi + 1) % n) * n + ((xi + 1) % n)];
    return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
  };
  const g4 = grid(4), g8 = grid(8), g16 = grid(16), g32x = grid(32);
  const data = new Uint8Array(NOISE * NOISE * 4);
  for (let y = 0; y < NOISE; y++) {
    for (let x = 0; x < NOISE; x++) {
      const u = x / NOISE, v = y / NOISE;
      const r = octave(g4, 4, u * 4, v * 4) * 0.55 + octave(g8, 8, u * 8, v * 8) * 0.3 + octave(g16, 16, u * 16, v * 16) * 0.15;
      const gg = octave(g32x, 32, u * 32, v * 4); // растянуто по x: после поворота по ветру даёт полосы
      const i = (y * NOISE + x) * 4;
      data[i] = Math.round(r * 255); data[i + 1] = Math.round(gg * 255); data[i + 2] = 0; data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, NOISE, NOISE, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export class Blizzard {
  /** cfg: CONFIG.blizzard */
  constructor(cfg) {
    this.cfg = cfg;
    this.level = 0;      // текущая сила (плавная)
    this.target = 0;     // куда едем
    this.t = 0;          // время бури, с
    this.scroll = new THREE.Vector2();
    this.windDir = new THREE.Vector3(1, 0, 0);
    this.hero = new THREE.Vector3();
    this.px = new THREE.Vector3();
    this.cur = null;     // текущие интерполированные параметры
    this._buildFog();
    this._buildFlakes();
  }

  _buildFog() {
    this.fogCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.fogScene = new THREE.Scene();
    this.fogMat = new THREE.ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false,
      uniforms: {
        uNoise: { value: makeNoise() },
        uHero: { value: new THREE.Vector2(0.5, 0.5) },  // где герой на экране (0..1, y вверх)
        uAspect: { value: 1 },
        uClear: { value: 1 }, uFade: { value: 0.5 }, uMax: { value: 0 }, uGust: { value: 0 }, uGloom: { value: 0 },
        uScroll: { value: new THREE.Vector2() },        // сдвиг тумана ветром и бегом героя (в высотах экрана)
        uWind: { value: new THREE.Vector2(1, 0) },      // направление ветра на экране
        uLight: { value: new THREE.Color(this.cfg.fogLight) },
        uDark: { value: new THREE.Color(this.cfg.fogDark) },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: `
        varying vec2 vUv;
        uniform sampler2D uNoise; uniform vec2 uHero, uScroll, uWind; uniform float uAspect, uClear, uFade, uMax, uGust, uGloom;
        uniform vec3 uLight, uDark;
        void main() {
          vec2 q = (vUv - uHero) * vec2(uAspect, 1.0) / min(uAspect, 1.0); // единица: короткая сторона экрана
          float d = length(q);
          // координаты для шума в единицах высоты экрана; полосы вытянуты вдоль ветра
          vec2 p = vUv * vec2(uAspect, 1.0) + uScroll;
          vec2 pr = vec2(dot(p, uWind), dot(p, vec2(-uWind.y, uWind.x)));
          float cloud = texture2D(uNoise, p * 0.45).r;
          float streak = texture2D(uNoise, vec2(pr.x * 0.22, pr.y * 0.9)).g;
          // окно вокруг героя дышит порывами: туман то наползает, то отступает
          float breath = (cloud - 0.5) * 0.35 * uGust + (streak - 0.5) * 0.25 * uGust;
          float f = smoothstep(uClear, uClear + uFade, d + breath * uFade);
          float dens = f * uMax * (0.82 + 0.35 * (cloud - 0.5) + 0.25 * (streak - 0.5) * uGust);
          vec3 col = mix(uLight, uDark, uGloom);
          col += (streak - 0.5) * 0.16 * uGust; // светлые потоки в дымке
          gl_FragColor = vec4(col, clamp(dens, 0.0, 0.97));
        }`,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.fogMat);
    quad.frustumCulled = false;
    this.fogScene.add(quad);
  }

  _buildFlakes() {
    const N = this.cfg.maxFlakes;
    const pos = new Float32Array(N * 4 * 3), seed = new Float32Array(N * 4 * 4), corner = new Float32Array(N * 4 * 2);
    const idx = new Uint16Array(N * 6);
    for (let i = 0; i < N; i++) {
      const s = [Math.random(), Math.random(), Math.random(), Math.random()];
      for (let v = 0; v < 4; v++) {
        seed.set(s, (i * 4 + v) * 4);
        corner[(i * 4 + v) * 2] = v & 1;             // 0 хвост, 1 голова
        corner[(i * 4 + v) * 2 + 1] = v & 2 ? 1 : -1; // сторона
      }
      const b = i * 4;
      idx.set([b, b + 1, b + 2, b + 1, b + 3, b + 2], i * 6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); // не используется, нужен для счёта вершин
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    g.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.setDrawRange(0, 0);
    this.flakeGeo = g;
    this.flakeMat = new THREE.ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false,
      uniforms: {
        uTime: { value: 0 }, uHero: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(this.cfg.box, this.cfg.height, this.cfg.box) },
        uWind: { value: new THREE.Vector2(1, 0) }, uSpeed: { value: 0 }, uFall: { value: 2 }, uStreak: { value: 0.15 },
        uSize: { value: 0.04 }, uAlpha: { value: 0 }, uGust: { value: 0 }, uNear: { value: 8 },
        uColor: { value: new THREE.Color(this.cfg.flakeColor) },
      },
      vertexShader: `
        attribute vec4 aSeed; attribute vec2 aCorner;
        uniform float uTime, uSpeed, uFall, uStreak, uSize, uAlpha, uGust, uNear;
        uniform vec3 uHero, uBox; uniform vec2 uWind;
        varying vec2 vC; varying float vA;
        void main() {
          float spd = uSpeed * (0.55 + 0.9 * aSeed.w);
          vec3 vel = vec3(uWind.x * spd, -uFall * (0.6 + 0.8 * aSeed.z), uWind.y * spd);
          vec3 p = aSeed.xyz * uBox + vel * uTime;
          vec3 lo = vec3(uHero.x - uBox.x * 0.5, 0.0, uHero.z - uBox.z * 0.5);
          p.x = lo.x + mod(p.x - lo.x, uBox.x);
          p.z = lo.z + mod(p.z - lo.z, uBox.z);
          p.y = mod(p.y, uBox.y);
          // край коробки и земля/потолок: плавно появляются
          vec2 e = abs((p.xz - uHero.xz) / (uBox.xz * 0.5));
          float edge = 1.0 - smoothstep(0.7, 1.0, max(e.x, e.y));
          float vert = smoothstep(0.0, 0.8, p.y) * (1.0 - smoothstep(uBox.y - 1.0, uBox.y, p.y));
          // потоки: полосы вдоль ветра, в которых снег гуще
          vec2 perp = vec2(-uWind.y, uWind.x);
          float q = dot(p.xz, perp) * 0.16 + uTime * 0.35;
          float band = 0.5 + 0.5 * sin(q + 1.7 * sin(q * 0.43 + dot(p.xz, uWind) * 0.03));
          float vis = smoothstep(aSeed.x * 0.9, aSeed.x * 0.9 + 0.25, mix(1.0, band * 1.25, uGust));
          float near = 1.0 - smoothstep(uNear * 0.6, uNear * 2.2, distance(p.xz, uHero.xz));
          vA = uAlpha * edge * vert * vis * (0.35 + 0.65 * near) * (0.45 + 0.55 * aSeed.y);
          vec4 a = viewMatrix * vec4(p, 1.0);
          vec4 b = viewMatrix * vec4(p - vel * uStreak, 1.0);
          vec2 dir = a.xy - b.xy;
          float len = max(length(dir), 1e-4);
          vec2 d = dir / len;
          float w = uSize * (0.6 + 0.9 * aSeed.y);
          vec4 pos = mix(b, a, aCorner.x);
          pos.xy += vec2(-d.y, d.x) * aCorner.y * w + d * (aCorner.x * 2.0 - 1.0) * w * 0.5;
          vC = vec2(aCorner.x, aCorner.y);
          gl_Position = projectionMatrix * pos;
        }`,
      fragmentShader: `
        uniform vec3 uColor; varying vec2 vC; varying float vA;
        void main() {
          float side = 1.0 - vC.y * vC.y;
          float a = vA * side * (0.15 + 0.85 * vC.x);
          if (a < 0.01) discard;
          gl_FragColor = vec4(uColor, a);
        }`,
    });
    this.flakes = new THREE.Mesh(this.flakeGeo, this.flakeMat);
    this.flakes.frustumCulled = false;
    this.flakeScene = new THREE.Scene();
    this.flakeScene.add(this.flakes);
  }

  /** Сила бури 0..4 (цель); переход плавный. */
  setTarget(l) { this.target = Math.max(0, Math.min(this.cfg.levels.length, l)); }

  /** Параметры между уровнями: таблица cfg.levels[i] = уровень i+1, нулевой ряд «тихо» неявный. */
  _params(L) {
    const rows = this.cfg.levels;
    const calm = this.cfg.calm;
    const a = L < 1 ? calm : rows[Math.min(rows.length - 1, Math.floor(L) - 1)];
    const b = L < 1 ? rows[0] : rows[Math.min(rows.length - 1, Math.floor(L))];
    let k = L < 1 ? L : L - Math.floor(L);
    if (L >= rows.length) k = 0;
    k = k * k * (3 - 2 * k);
    const o = this.cur || (this.cur = {});
    for (const key in calm) o[key] = a[key] + (b[key] - a[key]) * k;
    return o;
  }

  /** Имя ближайшего уровня (для отладки/ползунка). */
  levelName() {
    const n = Math.round(this.level);
    return n <= 0 ? '' : this.cfg.levels[Math.min(n, this.cfg.levels.length) - 1].name;
  }

  /** dt; (hx, hz) позиция героя в мире; world нужен для экранной проекции и камеры. */
  update(dt, hx, hz, world) {
    const c = this.cfg;
    const diff = this.target - this.level;
    // экспоненциальный подход к цели: плавно проходим промежуточные уровни, не рывком
    this.level += diff * (1 - Math.exp(-dt / Math.max(0.05, c.easeTime)));
    if (Math.abs(this.target - this.level) < 0.002) this.level = this.target;
    if (this.level < 0.01) { this.on = false; return; }
    this.on = true;
    this.t = (this.t + dt) % 3600;
    this.scroll.x %= 64; this.scroll.y %= 64;
    const P = this._params(this.level);

    // ветер в мире: вправо по экрану и немного вниз; направление слегка гуляет
    const sway = Math.sin(this.t * 0.31) * 0.22 * Math.min(1, P.gust + 0.3);
    const ca = Math.cos(sway), sa = Math.sin(sway);
    const rx = Math.SQRT1_2, ux = Math.SQRT1_2; // screen-right = (1,0,-1)/sqrt2, screen-down на земле = (1,0,1)/sqrt2
    let wx = rx * 1 + ux * 0.38, wz = -rx * 1 + ux * 0.38;
    const wl = Math.hypot(wx, wz); wx /= wl; wz /= wl;
    const gx = wx * ca - wz * sa, gz = wx * sa + wz * ca;
    const gustSpeed = 1 + 0.22 * Math.sin(this.t * 0.53 + 1.3) * P.gust;

    // туман
    const el = world.renderer.domElement;
    const W = Math.max(1, el.clientWidth), H = Math.max(1, el.clientHeight);
    world.project(hx, 0.8, hz, this.px);
    const fu = this.fogMat.uniforms;
    fu.uHero.value.set(this.px.x / W, 1 - this.px.y / H);
    fu.uAspect.value = W / H;
    fu.uClear.value = P.clear; fu.uFade.value = P.fade; fu.uMax.value = P.fogMax; fu.uGust.value = P.gust; fu.uGloom.value = P.gloom;
    // ветер на экране: вправо и чуть вниз; туман привязан к миру (при беге смещается) и уплывает по ветру
    const cam = world.camera, hgt = cam.top - cam.bottom;
    const tx = world.target.x, tz = world.target.z;
    const viewX = (tx - tz) * Math.SQRT1_2 / hgt;                 // сдвиг камеры вправо по экрану, в высотах экрана
    const viewY = (-tx - tz) * Math.SQRT1_2 * 0.5774 / hgt;      // вверх по земле, с изо-сжатием
    const wl2 = Math.hypot(1, 0.38), sx = 1 / wl2, sy = -0.38 / wl2; // ветер на экране: вправо и чуть вниз
    this.scroll.x -= sx * gustSpeed * P.fogDrift * dt;
    this.scroll.y -= sy * gustSpeed * P.fogDrift * dt;
    fu.uScroll.value.set(viewX + this.scroll.x, viewY + this.scroll.y);
    fu.uWind.value.set(sx, sy);
    fu.uLight.value.set(this.cfg.fogLight); fu.uDark.value.set(this.cfg.fogDark);

    // снежинки
    const mu = this.flakeMat.uniforms;
    mu.uTime.value = this.t;
    mu.uHero.value.set(hx, 0, hz);
    mu.uWind.value.set(gx, gz);
    mu.uSpeed.value = P.speed * gustSpeed;
    mu.uFall.value = P.fall;
    mu.uStreak.value = P.streak;
    mu.uSize.value = P.size;
    mu.uAlpha.value = P.alpha;
    mu.uGust.value = P.gust;
    mu.uNear.value = P.near;
    const n = Math.min(c.maxFlakes, Math.round(P.flakes));
    this.flakeGeo.setDrawRange(0, n * 6);
    this.activeFlakes = n;
  }

  /** Дорисовать поверх кадра мира. Выключенная буря не стоит ничего. */
  render(renderer, camera) {
    if (!this.on) return;
    const ac = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(this.fogScene, this.fogCam);
    if (this.activeFlakes > 0) renderer.render(this.flakeScene, camera);
    renderer.autoClear = ac;
  }
}
