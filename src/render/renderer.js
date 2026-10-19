// Отрисовка на Canvas 2D: цветные фигуры вместо арта.
// Мир рисуется с интерполяцией между прошлым и текущим шагом логики (alpha из цикла).

const TAU = Math.PI * 2;

function mulberry32(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Неровный многоугольник «в стиле low-poly», один раз на скалу. Всегда внутри её круга. */
function buildRockShape(seed) {
  const rnd = mulberry32(seed * 7919 + 13);
  const n = 7 + Math.floor(rnd() * 3);
  const pts = new Float32Array(n * 2);
  const phase = rnd() * TAU;
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * TAU;
    const f = 0.82 + rnd() * 0.18;
    pts[i * 2] = Math.cos(a) * f;
    pts[i * 2 + 1] = Math.sin(a) * f;
  }
  return pts;
}

export class Renderer {
  /**
   * @param canvas HTMLCanvasElement (или совместимый объект)
   * @param cfg    весь CONFIG
   * @param deps   { arena, hero, camera, stick }
   */
  constructor(canvas, cfg, deps) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.cfg = cfg;
    this.arena = deps.arena;
    this.hero = deps.hero;
    this.camera = deps.camera;
    this.stick = deps.stick;
    this.dpr = 1;
    this.w = 1; // размер в CSS-пикселях
    this.h = 1;
    this.rockShapes = deps.arena.rocks.map((_, i) => buildRockShape(i + 1));
  }

  /** Подогнать размер холста под экран и плотность пикселей. Зовётся при изменении размера. */
  resize() {
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    const nativeDpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
    this.dpr = Math.max(1, Math.min(nativeDpr, this.cfg.render.maxDpr));
    this.w = w;
    this.h = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.camera.setScreen(w, h);
  }

  draw(alpha) {
    const { ctx, dpr, w, h, arena, hero, camera } = this;
    const C = this.cfg.render.colors;
    const s = camera.scale;
    const camX = camera.prevX + (camera.x - camera.prevX) * alpha;
    const camY = camera.prevY + (camera.y - camera.prevY) * alpha;

    // Пустота за ареной.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = C.void;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Дальше рисуем в координатах мира.
    ctx.setTransform(s * dpr, 0, 0, s * dpr, (w / 2 - camX * s) * dpr, (h / 2 - camY * s) * dpr);

    const viewL = camX - camera.viewW / 2;
    const viewR = camX + camera.viewW / 2;
    const viewT = camY - camera.viewH / 2;
    const viewB = camY + camera.viewH / 2;

    // Пол.
    ctx.fillStyle = C.floor;
    ctx.fillRect(arena.left, arena.top, arena.width, arena.height);

    // Сетка пола: без неё на пустой арене не видно, что камера движется.
    const g = this.cfg.render.gridSize;
    const gx0 = Math.max(viewL, arena.left);
    const gx1 = Math.min(viewR, arena.right);
    const gy0 = Math.max(viewT, arena.top);
    const gy1 = Math.min(viewB, arena.bottom);
    ctx.beginPath();
    for (let x = Math.ceil(gx0 / g) * g; x <= gx1; x += g) {
      ctx.moveTo(x, gy0);
      ctx.lineTo(x, gy1);
    }
    for (let y = Math.ceil(gy0 / g) * g; y <= gy1; y += g) {
      ctx.moveTo(gx0, y);
      ctx.lineTo(gx1, y);
    }
    ctx.lineWidth = 1 / s;
    ctx.strokeStyle = C.grid;
    ctx.stroke();

    // Граница арены.
    ctx.lineWidth = 6;
    ctx.strokeStyle = C.border;
    ctx.strokeRect(arena.left - 3, arena.top - 3, arena.width + 6, arena.height + 6);

    // Скалы: тёмное тело и более светлая «верхняя грань».
    for (let i = 0; i < arena.rocks.length; i++) {
      const rock = arena.rocks[i];
      if (rock.x + rock.r < viewL || rock.x - rock.r > viewR) continue;
      if (rock.y + rock.r < viewT || rock.y - rock.r > viewB) continue;
      const pts = this.rockShapes[i];
      ctx.fillStyle = C.rock;
      this.polygon(pts, rock.x, rock.y, rock.r);
      ctx.fillStyle = C.rockTop;
      this.polygon(pts, rock.x, rock.y - rock.r * 0.14, rock.r * 0.66);
    }

    // Герой.
    const hx = hero.prevX + (hero.x - hero.prevX) * alpha;
    const hy = hero.prevY + (hero.y - hero.prevY) * alpha;
    const r = hero.radius;
    ctx.fillStyle = C.shadow;
    ctx.beginPath();
    ctx.ellipse(hx, hy + r * 0.6, r * 1.05, r * 0.55, 0, 0, TAU);
    ctx.fill();

    ctx.fillStyle = C.hero;
    ctx.beginPath();
    ctx.arc(hx, hy, r, 0, TAU);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = C.heroEdge;
    ctx.stroke();

    const cos = Math.cos(hero.facing);
    const sin = Math.sin(hero.facing);
    const tipX = hx + cos * r * 1.9;
    const tipY = hy + sin * r * 1.9;
    ctx.lineWidth = 3;
    ctx.strokeStyle = C.staff;
    ctx.beginPath();
    ctx.moveTo(hx + cos * r * 0.3, hy + sin * r * 0.3);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    ctx.fillStyle = C.accent;
    ctx.beginPath();
    ctx.arc(tipX, tipY, r * 0.3, 0, TAU);
    ctx.fill();

    // Стик рисуем в экранных координатах (px), поверх мира.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawStick(C);
  }

  polygon(pts, cx, cy, scale) {
    const ctx = this.ctx;
    ctx.beginPath();
    for (let k = 0; k < pts.length; k += 2) {
      const px = cx + pts[k] * scale;
      const py = cy + pts[k + 1] * scale;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  drawStick(C) {
    const stick = this.stick;
    if (!stick.active) return;
    const ctx = this.ctx;
    const R = this.cfg.stick.radius;
    ctx.beginPath();
    ctx.arc(stick.baseX, stick.baseY, R, 0, TAU);
    ctx.fillStyle = C.stickFill;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = C.stick;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(stick.baseX + stick.kx, stick.baseY + stick.ky, R * 0.42, 0, TAU);
    ctx.fillStyle = C.stickKnob;
    ctx.fill();
  }
}
