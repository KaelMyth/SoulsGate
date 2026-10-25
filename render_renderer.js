// Отрисовка на Canvas 2D: цветные фигуры вместо арта.
// Мир рисуется с интерполяцией между прошлым и текущим шагом логики (alpha из цикла).

import { getTelegraph } from './systems_attacks.js';

const TAU = Math.PI * 2;
const SERIF = '"Iowan Old Style", Georgia, "Palatino Linotype", Palatino, serif'; // шрифт надписей интерфейса
const EMPTY = { items: [] };

// Угловатый контур панциря (x, y в долях радиуса, нос в +x), общий для жуков в стиле low-poly.
const SHELL = [0.56, -0.5, 0.1, -0.78, -0.6, -0.62, -0.98, -0.15, -0.98, 0.15, -0.6, 0.62, 0.1, 0.78, 0.56, 0.5];

// Плечи мага (восьмиугольник): x вперёд по курсу, y вправо, доли радиуса.
const HERO_BODY = [0.52, 0, 0.36, -0.64, -0.05, -1.0, -0.52, -0.72, -0.62, 0, -0.52, 0.72, -0.05, 1.0, 0.36, 0.64];

// Жук-носорог (бык): широкий панцирь, пластина-«шея» и большой рог с двумя отростками. Единицы: доли радиуса.
const BULL_SHELL = [0.62, -0.62, 0.15, -0.9, -0.65, -0.78, -1.05, -0.2, -1.05, 0.2, -0.65, 0.78, 0.15, 0.9, 0.62, 0.62];
const BULL_PRON = [0.82, -0.4, 0.5, -0.62, 0.22, -0.52, 0.22, 0.52, 0.5, 0.62, 0.82, 0.4];
const BULL_HORN = [0.8, -0.24, 1.3, -0.15, 1.78, 0, 1.3, 0.15, 0.8, 0.24];
const BULL_PRONG_L = [1.3, -0.15, 1.62, -0.38, 1.52, -0.06];
const BULL_PRONG_R = [1.3, 0.15, 1.62, 0.38, 1.52, 0.06];

/** Добавляет в текущий путь многоугольник из плоского списка долей радиуса. */
function tracePoly(ctx, pts, r) {
  ctx.moveTo(pts[0] * r, pts[1] * r);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i] * r, pts[i + 1] * r);
  ctx.closePath();
}

function mulberry32(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function hexRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Смесь двух цветов [r, g, b] в строку rgb(); t от 0 (первый) до 1 (второй), за пределами обрезается. */
function mixRgb(a, b, t) {
  const q = t < 0 ? 0 : t > 1 ? 1 : t;
  return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * q) + ',' + Math.round(a[1] + (b[1] - a[1]) * q)
    + ',' + Math.round(a[2] + (b[2] - a[2]) * q) + ')';
}

// Свет падает слева сверху, как на концепт-артах.
const LIGHT_X = -0.55;
const LIGHT_Y = -0.83;

/**
 * Пол арены одной картинкой (1 пиксель на единицу мира): крупные мягкие грани low-poly, наметы,
 * тёмные впадины и затемнение к краям. Строится один раз; в кадре из неё берётся видимый кусок.
 */
function buildFloorTexture(arena, C) {
  const W = Math.ceil(arena.width);
  const H = Math.ceil(arena.height);
  const cv = makeCanvas(W, H);
  const g = cv.getContext('2d');
  const rnd = mulberry32(4242);
  const dark = hexRgb(C.floorDark);
  const light = hexRgb(C.floorLight);
  g.fillStyle = C.floor;
  g.fillRect(0, 0, W, H);

  // Грани: сетка со смещёнными узлами, каждая клетка из двух треугольников.
  const cell = 150;
  const nx = Math.ceil(W / cell) + 2;
  const ny = Math.ceil(H / cell) + 2;
  const pts = new Float32Array((nx + 1) * (ny + 1) * 2);
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const k = (j * (nx + 1) + i) * 2;
      pts[k] = (i - 1) * cell + (rnd() - 0.5) * cell * 0.8;
      pts[k + 1] = (j - 1) * cell + (rnd() - 0.5) * cell * 0.8;
    }
  }
  const tone = (x, y) => 0.5 + 0.17 * Math.sin(x * 0.0061 + 1.3) + 0.15 * Math.sin(y * 0.0047 + 0.4)
    + 0.08 * Math.sin((x + y) * 0.0113);
  const tri = (a, b, c) => {
    const col = mixRgb(dark, light, tone((pts[a] + pts[b] + pts[c]) / 3, (pts[a + 1] + pts[b + 1] + pts[c + 1]) / 3)
      + (rnd() - 0.5) * 0.28);
    g.fillStyle = col;
    g.strokeStyle = col; // обводка тем же цветом скрывает швы между гранями
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(pts[a], pts[a + 1]);
    g.lineTo(pts[b], pts[b + 1]);
    g.lineTo(pts[c], pts[c + 1]);
    g.closePath();
    g.fill();
    g.stroke();
  };
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const p00 = (j * (nx + 1) + i) * 2;
      const p10 = p00 + 2;
      const p01 = ((j + 1) * (nx + 1) + i) * 2;
      const p11 = p01 + 2;
      if (rnd() < 0.5) {
        tri(p00, p10, p11);
        tri(p00, p11, p01);
      } else {
        tri(p00, p10, p01);
        tri(p10, p11, p01);
      }
    }
  }

  // Впадины и светлые пятна: мягкие, едва заметные.
  const patch = (x, y, rad, squash, rgba) => {
    g.save();
    g.translate(x, y);
    g.scale(1, squash);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, rad);
    gr.addColorStop(0, rgba);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(0, 0, rad, 0, TAU);
    g.fill();
    g.restore();
  };
  for (let i = 0; i < 12; i++) patch(rnd() * W, rnd() * H, 80 + rnd() * 120, 0.55, 'rgba(8,12,22,0.13)');
  for (let i = 0; i < 9; i++) patch(rnd() * W, rnd() * H, 90 + rnd() * 130, 0.5, 'rgba(200,214,236,0.07)');

  // Наметы: длинные мягкие полосы вдоль ветра; края тают, чётких линий нет.
  for (let i = 0; i < 18; i++) {
    const len = 180 + rnd() * 320;
    g.save();
    g.translate(rnd() * W, rnd() * H);
    g.rotate(-0.2 + (rnd() - 0.5) * 0.4);
    g.scale(1, (10 + rnd() * 16) / len);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, len / 2);
    gr.addColorStop(0, 'rgba(190,206,232,0.09)');
    gr.addColorStop(1, 'rgba(190,206,232,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(0, 0, len / 2, 0, TAU);
    g.fill();
    g.restore();
  }

  // Затемнение к краям арены: она тонет в темноте, и край виден без яркой линии.
  const edge = 140;
  const shade = (x0, y0, x1, y1, rx, ry, rw, rh) => {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, 'rgba(10,14,24,0.55)');
    gr.addColorStop(1, 'rgba(10,14,24,0)');
    g.fillStyle = gr;
    g.fillRect(rx, ry, rw, rh);
  };
  shade(0, 0, edge, 0, 0, 0, edge, H);
  shade(W, 0, W - edge, 0, W - edge, 0, edge, H);
  shade(0, 0, 0, edge, 0, 0, W, edge);
  shade(0, H, 0, H - edge, 0, H - edge, W, edge);
  return cv;
}

/**
 * Мелкие детали пустоши: сухие кусты, камешки, наметы. Раскладываются один раз, вдали от скал и центра;
 * в кадре рисуются только видимые. Кусты сразу хранят отрезки веток.
 */
function buildGroundDetails(arena) {
  const rnd = mulberry32(777);
  const out = [];
  const free = (x, y, pad) => {
    if (Math.hypot(x, y) < 70) return false;
    if (x < arena.left + 40 || x > arena.right - 40 || y < arena.top + 40 || y > arena.bottom - 40) return false;
    for (let i = 0; i < arena.rocks.length; i++) {
      const rk = arena.rocks[i];
      if (Math.hypot(x - rk.x, y - rk.y) < rk.r + pad) return false;
    }
    return true;
  };
  const spot = (pad) => {
    for (let t = 0; t < 30; t++) {
      const x = arena.left + rnd() * arena.width;
      const y = arena.top + rnd() * arena.height;
      if (free(x, y, pad)) return { x, y };
    }
    return null;
  };
  const branch = (seg, x, y, ang, len, depth) => {
    const x1 = x + Math.cos(ang) * len;
    const y1 = y + Math.sin(ang) * len;
    seg.push(x, y, x1, y1);
    if (depth <= 0) return;
    branch(seg, x1, y1, ang - 0.35 - rnd() * 0.35, len * 0.7, depth - 1);
    branch(seg, x1, y1, ang + 0.35 + rnd() * 0.35, len * 0.7, depth - 1);
    if (rnd() < 0.4) branch(seg, x1, y1, ang + (rnd() - 0.5) * 0.3, len * 0.6, depth - 1);
  };
  for (let i = 0; i < 16; i++) {
    const p = spot(30);
    if (!p) continue;
    const seg = [];
    branch(seg, p.x, p.y, -Math.PI / 2 + (rnd() - 0.5) * 0.4, 9 + rnd() * 7, 3);
    out.push({ kind: 0, x: p.x, y: p.y, r: 28, seg: new Float32Array(seg) });
  }
  for (let i = 0; i < 34; i++) {
    const p = spot(14);
    if (!p) continue;
    const n = 5;
    const poly = new Float32Array(n * 2);
    const sz = 2.5 + rnd() * 4;
    const ph = rnd() * TAU;
    for (let k = 0; k < n; k++) {
      const a = ph + (k / n) * TAU;
      const f = 0.7 + rnd() * 0.35;
      poly[k * 2] = Math.cos(a) * sz * f * 1.15;
      poly[k * 2 + 1] = Math.sin(a) * sz * f * 0.8;
    }
    out.push({ kind: 1, x: p.x, y: p.y, r: sz * 1.4, poly, sz });
  }
  for (let i = 0; i < 22; i++) {
    const p = spot(20);
    if (!p) continue;
    out.push({ kind: 2, x: p.x, y: p.y, r: 34, w: 14 + rnd() * 18, h: 4 + rnd() * 4 });
  }
  return out;
}

/**
 * Скала как заснеженный хитиновый панцирь: тёмные грани-пластины, швы, каменные наросты и снег
 * на освещённой стороне. Рисуется один раз в спрайт (2 пикселя на единицу): в кадре это один drawImage.
 * Всё тело лежит внутри круга столкновения rock.r; тень и снег у подножия чуть шире.
 */
const ROCK_RES = 2;
function buildRockSprite(rock, seed, C) {
  const r = rock.r;
  const S = Math.ceil(r * 2.8 * ROCK_RES);
  const cv = makeCanvas(S, S);
  const g = cv.getContext('2d');
  g.setTransform(ROCK_RES, 0, 0, ROCK_RES, S / 2, S / 2);
  g.lineJoin = 'round';
  const rnd = mulberry32(seed * 7919 + 13);
  const chD = hexRgb(C.chitin);
  const chL = hexRgb(C.chitinLight);
  const stD = hexRgb(C.stone);
  const stL = hexRgb(C.stoneLight);
  const snD = hexRgb(C.snow);
  const snL = hexRgb(C.snowLight);
  const dot = (x, y) => {
    const l = Math.hypot(x, y) || 1;
    return (x * LIGHT_X + y * LIGHT_Y) / l;
  };
  const poly = (list, fill, stroke, lw) => {
    g.beginPath();
    g.moveTo(list[0], list[1]);
    for (let i = 2; i < list.length; i += 2) g.lineTo(list[i], list[i + 1]);
    g.closePath();
    if (fill) {
      g.fillStyle = fill;
      g.fill();
    }
    if (stroke) {
      g.lineWidth = lw;
      g.strokeStyle = stroke;
      g.stroke();
    }
  };
  const soft = (cx, cy, rad, sy, stops) => {
    g.save();
    g.translate(cx, cy);
    g.scale(1, sy);
    const gr = g.createRadialGradient(0, 0, rad * stops[0], 0, 0, rad);
    for (let i = 1; i < stops.length; i += 2) gr.addColorStop(stops[i], stops[i + 1]);
    g.fillStyle = gr;
    g.beginPath();
    g.arc(0, 0, rad, 0, TAU);
    g.fill();
    g.restore();
  };

  // Снег, намётанный у подножия со стороны света, и тень вправо-вниз. Без колец: края плавно тают.
  soft(-0.3 * r, -0.22 * r, r * 1.3, 0.8, [0, 0, 'rgba(160,180,212,0.17)', 0.55, 'rgba(160,180,212,0.1)', 1, 'rgba(160,180,212,0)']);
  soft(0.16 * r, 0.26 * r, r * 1.2, 0.74, [0.2, 0, 'rgba(6,9,18,0.46)', 0.6, 'rgba(6,9,18,0.26)', 1, 'rgba(6,9,18,0)']);

  // Тело панциря: вытянутый многоугольник.
  const n = 10;
  const rot = rnd() * TAU;
  const elong = 0.84 + rnd() * 0.1;
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  const body = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + (rnd() - 0.5) * 0.35;
    const f = 0.86 + rnd() * 0.11;
    const lx = Math.cos(a) * f * r;
    const ly = Math.sin(a) * f * r * elong;
    body[i * 2] = lx * cr - ly * sr;
    body[i * 2 + 1] = lx * sr + ly * cr;
  }
  const cx = -0.1 * r;
  const cy = -0.12 * r;
  // Грани веером от центра: освещённые светлее.
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const mx = (body[i * 2] + body[j * 2]) / 2 - cx;
    const my = (body[i * 2 + 1] + body[j * 2 + 1]) / 2 - cy;
    const col = mixRgb(chD, chL, 0.4 + 0.5 * dot(mx, my) + (rnd() - 0.5) * 0.15);
    poly([cx, cy, body[i * 2], body[i * 2 + 1], body[j * 2], body[j * 2 + 1]], col, col, 0.6);
  }
  // Вторая пластина поменьше: ступенька панциря.
  const inner = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const k = 0.58 + (rnd() - 0.5) * 0.12;
    inner[i * 2] = cx + (body[i * 2] - cx) * k;
    inner[i * 2 + 1] = cy + (body[i * 2 + 1] - cy) * k - 0.04 * r;
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const mx = (inner[i * 2] + inner[j * 2]) / 2 - cx;
    const my = (inner[i * 2 + 1] + inner[j * 2 + 1]) / 2 - cy;
    const col = mixRgb(chD, chL, 0.55 + 0.4 * dot(mx, my) + (rnd() - 0.5) * 0.15);
    poly([cx, cy - 0.05 * r, inner[i * 2], inner[i * 2 + 1], inner[j * 2], inner[j * 2 + 1]], col, col, 0.6);
  }
  poly(inner, null, 'rgba(150,170,205,0.32)', 0.7);
  // Шов вдоль панциря, поперечные пластины с фаской и глянцевый блик хитина.
  const ax = cr;
  const ay = sr;
  g.lineCap = 'round';
  const groove = (x0, y0, qx, qy, x1, y1, w) => {
    g.beginPath();
    g.moveTo(x0, y0);
    g.quadraticCurveTo(qx, qy, x1, y1);
    g.strokeStyle = 'rgba(6,9,18,0.62)';
    g.lineWidth = w;
    g.stroke();
    g.beginPath();
    g.moveTo(x0 - 0.7, y0 - 0.7);
    g.quadraticCurveTo(qx - 0.7, qy - 0.7, x1 - 0.7, y1 - 0.7);
    g.strokeStyle = 'rgba(150,172,214,0.26)'; // светлая кромка рядом с канавкой: объём
    g.lineWidth = w * 0.5;
    g.stroke();
  };
  g.save();
  g.beginPath(); // канавки и блик не выходят за контур панциря
  g.moveTo(body[0], body[1]);
  for (let i = 1; i < n; i++) g.lineTo(body[i * 2], body[i * 2 + 1]);
  g.closePath();
  g.clip();
  groove(cx - ax * 0.86 * r, cy - ay * 0.86 * r, cx - ay * 0.06 * r, cy + ax * 0.06 * r, cx + ax * 0.78 * r, cy + ay * 0.78 * r, 1.7);
  for (let k = -1; k <= 1; k++) {
    const px = cx + ax * k * 0.4 * r;
    const py = cy + ay * k * 0.4 * r;
    const half = 0.95 * r * elong;
    groove(px - ay * half, py + ax * half, px + ax * 0.16 * r, py + ay * 0.16 * r, px + ay * half, py - ax * half, 1.2);
  }
  g.save();
  g.translate(cx - 0.22 * r, cy - 0.18 * r);
  g.rotate(rot);
  g.scale(1, 0.34);
  const spec = g.createRadialGradient(0, 0, 0, 0, 0, r * 0.62);
  spec.addColorStop(0, 'rgba(170,200,255,0.3)');
  spec.addColorStop(1, 'rgba(170,200,255,0)');
  g.fillStyle = spec;
  g.beginPath();
  g.arc(0, 0, r * 0.62, 0, TAU);
  g.fill();
  g.restore();
  g.restore(); // конец обрезки по телу
  // Контур и светлая кромка на освещённой стороне.
  poly(body, null, 'rgba(6,9,18,0.8)', 1.6);
  g.strokeStyle = 'rgba(170,190,225,0.5)';
  g.lineWidth = 1.1;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const mx = (body[i * 2] + body[j * 2]) / 2;
    const my = (body[i * 2 + 1] + body[j * 2 + 1]) / 2;
    if (dot(mx, my) < 0.3) continue;
    g.beginPath();
    g.moveTo(body[i * 2], body[i * 2 + 1]);
    g.lineTo(body[j * 2], body[j * 2 + 1]);
    g.stroke();
  }

  // Снежная шапка на освещённой стороне: рваный край, грани разной яркости.
  const sx0 = -0.16 * r;
  const sy0 = -0.2 * r;
  const base = Math.atan2(LIGHT_Y, LIGHT_X);
  const m = 9;
  const cap = [];
  for (let k = 0; k <= m; k++) {
    const u = k / m;
    const a = base - 1.45 + u * 2.9;
    let rr = (k & 1 ? 0.78 : 0.5) * r * (0.85 + rnd() * 0.3) * (1 - 0.35 * Math.abs(u - 0.5) * 2);
    let px = sx0 + Math.cos(a) * rr;
    let py = sy0 + Math.sin(a) * rr;
    const len = Math.hypot(px, py);
    if (len > 0.88 * r) {
      rr *= (0.88 * r) / len;
      px = sx0 + Math.cos(a) * rr;
      py = sy0 + Math.sin(a) * rr;
    }
    cap.push(px, py);
  }
  for (let k = 0; k < m; k++) {
    const mx = (cap[k * 2] + cap[k * 2 + 2]) / 2 - sx0;
    const my = (cap[k * 2 + 1] + cap[k * 2 + 3]) / 2 - sy0;
    const col = mixRgb(snD, snL, 0.5 + 0.42 * dot(mx, my) + (rnd() - 0.5) * 0.16);
    poly([sx0, sy0, cap[k * 2], cap[k * 2 + 1], cap[k * 2 + 2], cap[k * 2 + 3]], col, col, 0.6);
  }
  g.strokeStyle = 'rgba(25,34,52,0.35)';
  g.lineWidth = 0.9;
  g.beginPath();
  g.moveTo(cap[0], cap[1]);
  for (let k = 2; k < cap.length; k += 2) g.lineTo(cap[k], cap[k + 1]);
  g.stroke();

  // Каменные наросты: острые шипы и обломки, торчат из панциря вверх.
  for (let i = 0; i < 3; i++) {
    const a = rnd() * TAU;
    const d = rnd() * 0.62 * r;
    const bx = cx + Math.cos(a) * d;
    const by = cy + Math.sin(a) * d;
    const sz = (0.07 + rnd() * 0.06) * r;
    const ph = rnd() * TAU;
    const chunk = [];
    for (let k = 0; k < 5; k++) {
      const q = ph + (k / 5) * TAU;
      const f = 0.7 + rnd() * 0.4;
      chunk.push(bx + Math.cos(q) * sz * f, by + Math.sin(q) * sz * f * 0.85);
    }
    poly(chunk, mixRgb(stD, stL, 0.4 + rnd() * 0.2), 'rgba(6,9,18,0.55)', 0.8);
    poly([chunk[0], chunk[1], chunk[2], chunk[3], bx, by], mixRgb(stD, stL, 0.78), null, 0);
  }
  const ns = r < 40 ? 3 : r < 55 ? 4 : 5 + (rnd() < 0.5 ? 1 : 0);
  const spikes = [];
  for (let k = 0; k < ns; k++) {
    const pos = -0.6 + ((k + rnd() * 0.6) / ns) * 1.2;
    const lat = (rnd() - 0.5) * 0.5;
    const bx = cx + ax * pos * r - ay * lat * r;
    const by = cy + ay * pos * r + ax * lat * r;
    const dir = -Math.PI / 2 + (rnd() - 0.5) * 0.9;
    let h = (k < 2 ? 0.4 + rnd() * 0.16 : 0.2 + rnd() * 0.2) * r;
    let tipX = bx + Math.cos(dir) * h;
    let tipY = by + Math.sin(dir) * h;
    const len = Math.hypot(tipX, tipY);
    if (len > 1.08 * r) {
      h *= (1.08 * r - Math.hypot(bx, by)) / Math.max(1, len - Math.hypot(bx, by));
      tipX = bx + Math.cos(dir) * h;
      tipY = by + Math.sin(dir) * h;
    }
    spikes.push({ bx, by, tipX, tipY, dir, h, w: h * (0.5 + rnd() * 0.25) });
  }
  spikes.sort((p, q) => p.by - q.by); // дальние раньше ближних
  for (const s of spikes) {
    const px = -Math.sin(s.dir) * s.w * 0.5;
    const py = Math.cos(s.dir) * s.w * 0.5;
    let lx = s.bx - px;
    let ly = s.by - py;
    let rx = s.bx + px;
    let ry = s.by + py;
    if (lx > rx) {
      [lx, rx] = [rx, lx];
      [ly, ry] = [ry, ly];
    }
    poly([lx, ly, s.bx, s.by, s.tipX, s.tipY], mixRgb(stD, stL, 0.78), null, 0); // освещённая грань слева
    poly([s.bx, s.by, rx, ry, s.tipX, s.tipY], mixRgb(stD, stL, 0.22), null, 0);
    poly([lx, ly, rx, ry, s.tipX, s.tipY], null, 'rgba(6,9,18,0.6)', 1);
    // Снег на кончике.
    const t = 0.62;
    poly([s.tipX, s.tipY, lx + (s.tipX - lx) * t, ly + (s.tipY - ly) * t, rx + (s.tipX - rx) * t, ry + (s.tipY - ry) * t],
      mixRgb(snD, snL, 0.62), null, 0);
  }
  return { cv, half: S / 2 / ROCK_RES };
}

export class Renderer {
  /**
   * @param canvas HTMLCanvasElement (или совместимый объект)
   * @param cfg    весь CONFIG
   * @param deps   { arena, hero, camera, stick } обязательно;
   *               { enemies, heroShots, enemyShots, effects (EntityPool), autoattack, hud } по мере появления систем.
   *               hud: объект { insets, kills }, игра обновляет его поля на месте.
   */
  constructor(canvas, cfg, deps) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.cfg = cfg;
    this.arena = deps.arena;
    this.hero = deps.hero;
    this.camera = deps.camera;
    this.stick = deps.stick;
    this.enemies = deps.enemies || EMPTY;
    this.heroShots = deps.heroShots || EMPTY;
    this.enemyShots = deps.enemyShots || EMPTY;
    this.midges = deps.midges || EMPTY;
    this.effects = deps.effects || EMPTY;
    this.gems = deps.gems || EMPTY;
    this.autoattack = deps.autoattack || null;
    this.defense = deps.defense || null;
    this.boss = deps.boss || null; // разломы, телеграфы и взрыв босса (systems_boss.js)
    this.clouds = deps.clouds || [];
    this.lasers = deps.lasers || [];
    this.blades = deps.blades || [];
    this.aura = deps.aura || null;
    this.fires = deps.fires || [];
    this.lightdash = deps.lightdash || null;
    this.pellets = deps.pellets || null;
    this.hud = deps.hud || null;
    this.dpr = 1;
    this.w = 1; // размер в CSS-пикселях
    this.h = 1;
    this.floor = null;            // картинка пола арены: строится при первой отрисовке
    this.details = null;          // сухие кусты, камешки и наметы на полу
    this.rockSprites = [];        // спрайт каждой скалы: строится при первой отрисовке
    this.flakes = [];             // снежинки: живут вокруг камеры, только для вида
    this.clock = 0;               // время кадра в секундах: для мерцания пламени и пульса глаз
    this.glow = null;             // мягкое тёплое пятно света, рисуется один раз и переиспользуется
    this.glowViolet = null;       // то же, фиолетовое: для стрелка, его снарядов и слизи
    this.glowRed = null;          // то же, красное: для быка
    this.glowBlue = null;         // то же, голубое: кристалл посоха героя
    this.glowGold = null;         // то же, золотое: щит в окне парирования, подсветка цели
    this.ui = { hp: 1, hpTrail: 1, hpShow: 0, xp: 0, boss: 1, bossTrail: 1, bossK: 0, slots: [0, 0, 0] }; // сглаженные значения интерфейса
    this.tglow = { cur: null, curK: 0, prev: null, prevK: 0 }; // подсветка цели автоатаки: текущая и затухающая прежняя
    this.shield = {               // вид щита: появление, цвет золото-синий, вспышка парирования и отклики на удары
      k: 0, pk: 0, flash: 0,
      rip: [{ on: false, a: 0, t: 0, parry: false }, { on: false, a: 0, t: 0, parry: false },
        { on: false, a: 0, t: 0, parry: false }, { on: false, a: 0, t: 0, parry: false }],
    };
    this.hs = {                   // вид героя: сглаженные угол и курс, фаза шага и история позиций для шлейфа
      a: -Math.PI / 2, mx: 0, my: 0, phase: 0, lx: 0, ly: 0, has: false,
      head: 0, cnt: 0, tx: new Float32Array(32), ty: new Float32Array(32), tt: new Float64Array(32), ti: 0,
    };
    this.hbuf = new Float32Array(33 * 5); // буфер точек ленты шлейфа (x, y, нормаль, ширина): без выделений памяти в кадре
    this.hring = new Float32Array(16);     // контур плеч героя
    this.strip = null;            // мягкая красная полоса телеграфа (без чётких краёв), один спрайт
    this.dust = null;             // спрайт облачка пыли
    this.dt = 0;                  // сколько секунд прошло с прошлого кадра: для пыли (только вид)
    this.puffs = [];              // облачка пыли при торможении быка; пул фиксированного размера
    for (let i = 0; i < 48; i++) this.puffs.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 1, size: 8 });
    this.beetleState = new WeakMap(); // у каждого жука свой угол поворота и фаза анимации (только для вида)
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
    const now = performance.now() / 1000;
    this.dt = Math.min(0.1, now - this.clock);
    this.clock = now;
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

    // Пол: снежная пустошь. Подложка нужна, чтобы на стыке кусков картинки не мелькала пустота.
    ctx.fillStyle = C.floor;
    ctx.fillRect(arena.left, arena.top, arena.width, arena.height);
    if (!this.floor) this.floor = buildFloorTexture(arena, C);
    const gx0 = Math.max(viewL, arena.left);
    const gx1 = Math.min(viewR, arena.right);
    const gy0 = Math.max(viewT, arena.top);
    const gy1 = Math.min(viewB, arena.bottom);
    if (gx1 > gx0 && gy1 > gy0) {
      ctx.drawImage(this.floor, gx0 - arena.left, gy0 - arena.top, gx1 - gx0, gy1 - gy0, gx0, gy0, gx1 - gx0, gy1 - gy0);
    }

    // Граница арены: тёмная кромка, основное затемнение к краям уже в картинке пола.
    ctx.lineWidth = 8;
    ctx.strokeStyle = C.arenaEdge;
    ctx.strokeRect(arena.left - 4, arena.top - 4, arena.width + 8, arena.height + 8);

    this.drawGroundDetails(C, viewL, viewR, viewT, viewB);

    // Скалы: заснеженные хитиновые панцири с каменными наростами (спрайт на каждую).
    for (let i = 0; i < arena.rocks.length; i++) {
      const rock = arena.rocks[i];
      if (rock.x + rock.r * 1.4 < viewL || rock.x - rock.r * 1.4 > viewR) continue;
      if (rock.y + rock.r * 1.4 < viewT || rock.y - rock.r * 1.4 > viewB) continue;
      const sp = this.rockSprites[rock.id] || (this.rockSprites[rock.id] = buildRockSprite(rock, rock.id + 1, C)); // id стабильный: скалы исчезают (пробуждение жуков)
      ctx.drawImage(sp.cv, rock.x - sp.half, rock.y - sp.half, sp.half * 2, sp.half * 2);
    }

    // ЗАГЛУШКА ГРАФИКИ: финальный бой, разрушенная часть карты. Всё вне острова (arena.zone) затягивает пустотой
    // по мере arena.collapse (0..1), кромка острова светлая линия. Без обломков и анимации падения.
    if (arena.zone && arena.collapse > 0) {
      const z = arena.zone;
      ctx.save();
      ctx.globalAlpha = Math.min(1, arena.collapse);
      ctx.fillStyle = C.void;
      ctx.beginPath();
      ctx.rect(arena.left - 8, arena.top - 8, arena.width + 16, arena.height + 16);
      ctx.rect(z.left, z.top, z.right - z.left, z.bottom - z.top);
      ctx.fill('evenodd');
      ctx.globalAlpha = 1;
      ctx.lineWidth = 3;
      ctx.strokeStyle = C.snowLight;
      ctx.strokeRect(z.left, z.top, z.right - z.left, z.bottom - z.top);
      ctx.restore();
    }

    this.drawSnow(ctx, viewL, viewR, viewT, viewB);

    const hx = hero.prevX + (hero.x - hero.prevX) * alpha;
    const hy = hero.prevY + (hero.y - hero.prevY) * alpha;

    // Дальность автоатаки: еле заметное кольцо, по нему видно, кого герой достанет.
    if (hero.active && !(this.hud && this.hud.gameMode)) {
      ctx.beginPath();
      ctx.arc(hx, hy, this.cfg.attack.radius, 0, TAU);
      ctx.lineWidth = 1.5 / s;
      ctx.strokeStyle = C.range;
      ctx.stroke();
    }

    this.drawClouds(ctx);
    this.drawFires(ctx);

    // Камни опыта лежат на земле под врагами и героем.
    this.drawGems(alpha, viewL, viewR, viewT, viewB);

    // Зоны атак на земле (под врагами): видно, откуда придёт удар.
    this.drawTelegraphs(C, alpha);
    this.drawBossGround(C);

    // Цель автоатаки: тёплое свечение под врагом, без контуров (поверх врага ляжет лёгкий тон, ниже).
    const target = this.autoattack && this.autoattack.target;
    this.updateTargetGlow(target && target.active ? target : null, this.dt);
    this.drawTargetGlow(alpha, false);

    // Враги.
    const en = this.enemies.items;
    for (let i = 0; i < en.length; i++) {
      const e = en[i];
      if (!e.active) continue;
      const ex = e.prevX + (e.x - e.prevX) * alpha;
      const ey = e.prevY + (e.y - e.prevY) * alpha;
      const r = e.radius;
      if (ex + r < viewL || ex - r > viewR || ey + r < viewT || ey - r > viewB) continue;
      this.drawEnemy(e, ex, ey, C);
    }

    this.drawDust(this.dt);

    this.drawTargetGlow(alpha, true);

    if (hero.active) {
      this.drawAura(ctx, hx, hy);
      if (this.lightdash && this.lightdash.active) this.drawLightHero(ctx, hx, hy); // молния вместо героя
      else this.drawHero(hx, hy, C);
      this.drawBlock(hx, hy, C);
      this.drawHeroArcs(hx, hy, C);
    }

    this.drawLasers(ctx);
    this.drawBolts(ctx);
    this.drawBlades(ctx);

    // Снаряды.
    this.drawShots(this.heroShots.items, alpha, viewL, viewR, viewT, viewB);
    this.drawPellets(ctx, alpha, viewL, viewR, viewT, viewB);
    this.drawEnemyShots(this.enemyShots.items, alpha, viewL, viewR, viewT, viewB, C);
    this.drawMidges(this.midges.items, alpha, viewL, viewR, viewT, viewB);

    // Эффекты-всплески.
    const fx = this.effects.items;
    for (let i = 0; i < fx.length; i++) {
      const f = fx[i];
      if (!f.active) continue;
      if (f.kind === 1) {
        this.drawGlob(f);
        continue;
      }
      const t = Math.min(1, f.age / f.life);
      ctx.globalAlpha = 1 - t;
      ctx.beginPath();
      if (f.angle !== null) {
        // Искра: чёрточка, летящая от центра.
        const rr = f.r0 + (f.r1 - f.r0) * (1 - (1 - t) * (1 - t));
        const r2 = Math.max(f.r0, rr - 9);
        const ca = Math.cos(f.angle);
        const sa = Math.sin(f.angle);
        ctx.moveTo(f.x + ca * r2, f.y + sa * r2);
        ctx.lineTo(f.x + ca * rr, f.y + sa * rr);
        ctx.lineWidth = 2.2;
      } else {
        ctx.arc(f.x, f.y, f.r0 + (f.r1 - f.r0) * t, 0, TAU);
        ctx.lineWidth = 3;
      }
      ctx.strokeStyle = f.color;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Стик и HUD рисуем в экранных координатах (px), поверх мира.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawStick(C);
    this.drawHud(C);
  }

  /** Камни опыта: маленькие ромбики; красный крупнее. Вне экрана не рисуем. */
  drawGems(alpha, viewL, viewR, viewT, viewB) {
    const ctx = this.ctx;
    const list = this.gems.items;
    for (let i = 0; i < list.length; i++) {
      const g = list[i];
      if (!g.active || !g.def) continue;
      const x = g.prevX + (g.x - g.prevX) * alpha;
      const y = g.prevY + (g.y - g.prevY) * alpha;
      const r = g.radius;
      if (x + r < viewL || x - r > viewR || y + r < viewT || y - r > viewB) continue;
      ctx.beginPath();
      ctx.moveTo(x, y - r * 1.25);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x, y + r * 1.25);
      ctx.lineTo(x - r, y);
      ctx.closePath();
      ctx.fillStyle = g.def.color;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = g.def.edge;
      ctx.stroke();
    }
  }

  /** Телеграфы атак: зона заполняется за время замаха, к концу контур мигает. Не яркие: полупрозрачные. */
  drawTelegraphs(C, alpha) {
    const ctx = this.ctx;
    const en = this.enemies.items;
    const tg = this.tg || (this.tg = {});
    for (let i = 0; i < en.length; i++) {
      const e = en[i];
      if (!e.active || !e.def.attack) continue;
      if (!getTelegraph(e, this.hero, tg)) continue;
      const x = e.prevX + (e.x - e.prevX) * alpha;
      const y = e.prevY + (e.y - e.prevY) * alpha;
      const k = tg.progress;
      const blink = k > 0.7 && (Math.floor(k * 18) & 1); // последняя часть замаха: контур мигает
      if (tg.shape !== 'circle') {
        this.drawSoftStrip(tg, x, y, k); // рывок по линии: размытая красная полоса без чётких краёв
        continue;
      }
      ctx.save();
      ctx.translate(x, y);
      if (tg.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(0, 0, tg.radius, 0, TAU);
        ctx.fillStyle = C.teleFill;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, 0, tg.radius * k, 0, TAU);
        ctx.fillStyle = C.teleProgress;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, 0, tg.radius, 0, TAU);
      } else {
        ctx.rotate(Math.atan2(tg.dirY, tg.dirX));
        const w = tg.width / 2;
        ctx.fillStyle = C.teleFill;
        ctx.fillRect(0, -w, tg.length, tg.width);
        ctx.fillStyle = C.teleProgress;
        ctx.fillRect(0, -w, tg.length * k, tg.width);
        ctx.beginPath();
        ctx.rect(0, -w, tg.length, tg.width);
      }
      ctx.lineWidth = blink ? 2.5 : 1.5;
      ctx.strokeStyle = C.teleEdge;
      ctx.stroke();
      ctx.restore();
    }
  }

  /** Многоугольник как путь; k < 1 уменьшает его к центру (cx, cy): так рисуется заполнение телеграфа. */
  polyPath(poly, cx, cy, k) {
    const ctx = this.ctx;
    ctx.beginPath();
    for (let i = 0; i < poly.length; i++) {
      const x = cx + (poly[i].x - cx) * k;
      const y = cy + (poly[i].y - cy) * k;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  /**
   * ЗАГЛУШКА ГРАФИКИ (Тартас): всё, что босс кладёт на землю, простыми формами без деталей.
   * Данные берём из systems_boss.js (fissures, tele, blast), цвета из config.render.colors.
   * Графика может заменить любую из трёх частей, не трогая логику.
   */
  drawBossGround(C) {
    const b = this.boss;
    if (!b) return;
    const ctx = this.ctx;

    // ЗАГЛУШКА ГРАФИКИ: телеграф призыва отряда, круг вокруг босса, который заполняется к выходу бойцов.
    if (b.state === 'squadCast' && b.enemy) {
      const Q = b.enemy.def.cycle.squad;
      const k = Math.min(1, b.t / Math.max(0.01, Q.castTime));
      const r = b.enemy.radius + Q.ringGap;
      ctx.save();
      ctx.strokeStyle = C.frostMist;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(b.enemy.x, b.enemy.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.25 + 0.25 * k;
      ctx.fillStyle = C.frostMist;
      ctx.beginPath();
      ctx.arc(b.enemy.x, b.enemy.y, r * k, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Разломы: плоская полоса вдоль отрезка. Таят в конце цикла (fissureAlpha).
    if (b.fissures.length) {
      ctx.save();
      ctx.globalAlpha = b.fissureAlpha();
      ctx.strokeStyle = C.frostMist;
      for (let i = 0; i < b.fissures.length; i++) {
        const f = b.fissures[i];
        ctx.beginPath();
        ctx.moveTo(f.x1, f.y1);
        ctx.lineTo(f.x2, f.y2);
        ctx.lineWidth = f.hw * 2;
        ctx.stroke();
      }
      ctx.restore();
    }

    // Клинки (вторая атака). Ждущий клинок стоит на кольце; линию на земле показывает только тот, чей прицел
    // уже зафиксирован (aimed): он вылетит следующим. Летящий: короткая чёрточка по ходу полёта.
    // Данные: b.blades[i] { x, y, x1, y1, x2, y2, dx, dy, hw, state, aimed }, b.bladeCount;
    // state 1 ждёт вылета, 2 летит, 3 закончил. Каждая группа рисуется одним проходом.
    if (b.bladeCount > 0) {
      const bl = b.blades;
      ctx.beginPath();
      for (let i = 0; i < b.bladeCount; i++) {
        if (bl[i].state !== 1 || !bl[i].aimed) continue;
        ctx.moveTo(bl[i].x1, bl[i].y1);
        ctx.lineTo(bl[i].x2, bl[i].y2);
      }
      ctx.lineWidth = bl[0].hw * 2;
      ctx.strokeStyle = C.teleProgress;
      ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < b.bladeCount; i++) {
        if (bl[i].state === 3) continue;
        ctx.moveTo(bl[i].x - bl[i].dx * 26, bl[i].y - bl[i].dy * 26);
        ctx.lineTo(bl[i].x, bl[i].y);
      }
      ctx.lineWidth = 6;
      ctx.strokeStyle = C.fissureCore;
      ctx.stroke();
    }

    // Линия рывка: узкий прямоугольник от босса через героя и дальше.
    const tl = b.tele;
    if (tl) {
      ctx.save();
      ctx.translate(tl.x1, tl.y1);
      ctx.rotate(Math.atan2(tl.y2 - tl.y1, tl.x2 - tl.x1));
      ctx.fillStyle = C.teleProgress;
      ctx.fillRect(0, -tl.hw, Math.hypot(tl.x2 - tl.x1, tl.y2 - tl.y1), tl.hw * 2);
      ctx.restore();
    }

    // Область взрыва (треугольник): телеграф заполняется к центру, потом одноцветная вспышка.
    const bl = b.blast;
    if (bl) {
      if (bl.phase === 'tele') {
        const k = Math.min(1, bl.t / Math.max(0.01, bl.total));
        this.polyPath(bl.poly, bl.x, bl.y, 1);
        ctx.fillStyle = C.teleFill;
        ctx.fill();
        this.polyPath(bl.poly, bl.x, bl.y, k);
        ctx.fillStyle = C.teleProgress;
        ctx.fill();
      } else {
        ctx.save();
        ctx.globalAlpha = 1 - Math.min(1, bl.t / Math.max(0.01, bl.total)) * 0.75;
        this.polyPath(bl.poly, bl.x, bl.y, 1);
        ctx.fillStyle = C.blastFill;
        ctx.fill();
        ctx.restore();
      }
    }
  }

  drawEnemy(e, x, y, C) {
    const ctx = this.ctx;
    const r = e.radius;
    const hit = e.flash > 0;
    ctx.fillStyle = C.shadow;
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.6, r * 1.05, r * 0.55, 0, 0, TAU);
    ctx.fill();

    const aiming = e.aim > 0;
    if (e.def === this.cfg.enemies.beetle) {
      // Жук: пламенный жук с светящимися глазами (отдельная отрисовка).
      this.drawBeetle(e, x, y, hit);
    } else if (e.def === this.cfg.enemies.shooter) {
      // Жук-стрелок: фиолетовый, с брюшком, которое растёт при заряде выстрела.
      this.drawShooter(e, x, y, hit);
    } else if (e.def === this.cfg.enemies.bull) {
      // Бык: жук-носорог с красным акцентом, размытием в рывке и пылью при торможении.
      this.drawBull(e, x, y, hit);
    } else {
      // Попадание: враг белеет и на мгновение раздувается.
      const rr = hit ? r * 1.15 : e.atk.state === 'windup' ? r * (1 + 0.08 * Math.sin(e.atk.t * 30)) : r;
      const st = e.atk.state;
      // Враг с атакой: замах (светлеет, напрягается), оглушение после парирования (холодный цвет).
      let fill = e.def.color;
      if (aiming) fill = '#ffe9a8';
      else if (st === 'windup') fill = '#f6d9a4';
      else if (st === 'stun') fill = '#8fa8c8';
      ctx.fillStyle = hit ? '#ffffff' : fill;
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, TAU);
      ctx.fill();
      if (e.def.slam && st === 'windup') { // ЗАГЛУШКА ГРАФИКИ: кольцо замаха растёт к моменту удара
        ctx.save();
        ctx.strokeStyle = '#e8f1ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, r + (e.def.slam.windup > 0 ? e.atk.t / e.def.slam.windup : 1) * r * 2, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
      ctx.lineWidth = 2;
      ctx.strokeStyle = hit ? '#ffffff' : e.def.edge;
      ctx.stroke();
    }

    // Мороз: голубая кайма по числу зарядов; заморожен: ледяная заливка и белая кайма.
    if (e.freezeT > 0) {
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = this.cfg.frost.color;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, r + 1, 0, TAU);
      ctx.stroke();
    } else if (e.frostStacks > 0) {
      ctx.lineWidth = 1 + e.frostStacks * 0.6;
      ctx.strokeStyle = this.cfg.frost.color;
      ctx.beginPath();
      ctx.arc(x, y, r + 1.5, 0, TAU);
      ctx.stroke();
    }

    // Горит: тонкое огненное кольцо с мерцанием и язычок над врагом (минималистично).
    if (e.burnT > 0) {
      const f = 0.6 + 0.4 * Math.sin(e.burnT * 22);
      ctx.beginPath();
      ctx.arc(x, y, r + 2.5, 0, TAU);
      ctx.lineWidth = 2;
      ctx.globalAlpha = f;
      ctx.strokeStyle = this.cfg.burn.color;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - 3, y - r - 2);
      ctx.quadraticCurveTo(x, y - r - 6 - 4 * f, x + 3, y - r - 2);
      ctx.fillStyle = this.cfg.burn.color;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Стрелок целится: расширяющееся кольцо, сигнал «сейчас выстрелит, можно парировать».
    if (aiming) {
      const k = 1 - e.aim / Math.max(0.01, e.aimTotal);
      ctx.beginPath();
      ctx.arc(x, y, r + 3 + k * 8, 0, TAU);
      ctx.lineWidth = 2;
      ctx.strokeStyle = e.def === this.cfg.enemies.shooter ? '#e2cfff' : '#ffe27a';
      ctx.stroke();
    }

    // Полоска здоровья над головой.
    const bw = r * 2;
    const bx = x - r;
    const by = y - r - 9;
    ctx.fillStyle = C.hpBg;
    ctx.fillRect(bx, by, bw, 4);
    ctx.fillStyle = C.hpFill;
    ctx.fillRect(bx, by, bw * Math.max(0, Math.min(1, e.hp / e.maxHp)), 4);
  }

  /** Мягкое тёплое пятно света (белое в центре, оранжевое по краям, прозрачное на границе). Один спрайт на всех. */
  getGlow(violet) {
    const key = violet === 'red' ? 'glowRed' : violet === 'blue' ? 'glowBlue' : violet === 'gold' ? 'glowGold' : violet ? 'glowViolet' : 'glow';
    if (this[key]) return this[key];
    const size = 64;
    let c;
    if (typeof OffscreenCanvas === 'function') {
      c = new OffscreenCanvas(size, size);
    } else {
      c = document.createElement('canvas');
      c.width = c.height = size;
    }
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    if (violet === 'gold') {
      gr.addColorStop(0, 'rgba(255,248,214,1)');
      gr.addColorStop(0.3, 'rgba(255,214,96,0.55)');
      gr.addColorStop(0.7, 'rgba(255,184,40,0.14)');
      gr.addColorStop(1, 'rgba(255,170,20,0)');
    } else if (violet === 'blue') {
      gr.addColorStop(0, 'rgba(236,248,255,1)');
      gr.addColorStop(0.3, 'rgba(120,190,255,0.55)');
      gr.addColorStop(0.7, 'rgba(70,140,255,0.14)');
      gr.addColorStop(1, 'rgba(50,110,255,0)');
    } else if (violet === 'red') {
      gr.addColorStop(0, 'rgba(255,218,205,1)');
      gr.addColorStop(0.3, 'rgba(255,84,66,0.55)');
      gr.addColorStop(0.7, 'rgba(220,40,36,0.14)');
      gr.addColorStop(1, 'rgba(200,30,30,0)');
    } else if (violet) {
      gr.addColorStop(0, 'rgba(240,222,255,1)');
      gr.addColorStop(0.3, 'rgba(176,112,255,0.55)');
      gr.addColorStop(0.7, 'rgba(130,62,230,0.14)');
      gr.addColorStop(1, 'rgba(110,40,220,0)');
    } else {
      gr.addColorStop(0, 'rgba(255,236,170,1)');
      gr.addColorStop(0.3, 'rgba(255,160,60,0.55)');
      gr.addColorStop(0.7, 'rgba(255,100,20,0.14)');
      gr.addColorStop(1, 'rgba(255,80,0,0)');
    }
    g.fillStyle = gr;
    g.fillRect(0, 0, size, size);
    this[key] = c;
    return c;
  }

  /**
   * Пламенный жук, вид сверху: тёмный панцирь с раскалённым швом, хвост из пламени,
   * два светящихся глаза и мягкий свет от них вперёд. Поворачивается по курсу движения;
   * когда стоит, смотрит на героя. Угол и фаза хранятся здесь, в игровую сущность ничего не пишем.
   */
  drawBeetle(e, x, y, hit) {
    const ctx = this.ctx;
    const r = e.radius;
    const t = this.clock;
    let st = this.beetleState.get(e);
    if (!st) {
      st = { a: Math.atan2(this.hero.y - y, this.hero.x - x), ph: Math.random() * TAU };
      this.beetleState.set(e, st);
    }
    const moving = e.hx !== 0 || e.hy !== 0;
    const frozen = e.freezeT > 0;
    if (!frozen) {
      const target = moving ? Math.atan2(e.hy, e.hx) : Math.atan2(this.hero.y - y, this.hero.x - x);
      let da = (target - st.a) % TAU;
      if (da > Math.PI) da -= TAU;
      else if (da < -Math.PI) da += TAU;
      st.a += da * 0.25; // плавный разворот
    }
    const ph = st.ph;
    const f1 = frozen ? 0.5 : 0.5 + 0.5 * Math.sin(t * 14 + ph);
    const f2 = frozen ? 0.5 : 0.5 + 0.5 * Math.sin(t * 19 + ph * 2);
    const glow = this.getGlow();

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(st.a);
    const k = hit ? 1.15 : 1; // попадание: на миг раздувается и белеет
    ctx.scale(k, k);

    // Мягкий свет от глаз ложится на пол перед жуком.
    ctx.globalAlpha = frozen ? 0.05 : 0.17 + 0.05 * f2;
    ctx.drawImage(glow, r * 0.2, -r * 1.15, r * 3.4, r * 2.3);

    // Пламя на спине: небольшой язык, как на референсах. Контраст даёт оранжевое на холодном тёмном панцире.
    if (!frozen) {
      const sway = Math.sin(t * 9 + ph) * 0.12 * r;
      const tipX = -(1.3 + 0.3 * f1) * r;
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#ff6a1f';
      ctx.beginPath();
      ctx.moveTo(-0.55 * r, -0.34 * r);
      ctx.quadraticCurveTo(-1.0 * r, -0.3 * r + sway * 0.5, tipX, sway);
      ctx.quadraticCurveTo(-1.0 * r, 0.3 * r + sway * 0.5, -0.55 * r, 0.34 * r);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffc25a';
      ctx.beginPath();
      ctx.moveTo(-0.55 * r, -0.16 * r);
      ctx.quadraticCurveTo(-0.85 * r, -0.14 * r + sway * 0.4, -(1.0 + 0.22 * f2) * r, sway * 0.7);
      ctx.quadraticCurveTo(-0.85 * r, 0.14 * r + sway * 0.4, -0.55 * r, 0.16 * r);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Ноги: три пары угловатых лапок с коленом, на ходу покачиваются. Холодный серо-синий цвет.
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const lx = (0.35 - i * 0.45) * r;
      const sw = moving && !frozen ? Math.sin(t * 22 + ph + i * 2.1) * 0.22 * r : 0;
      ctx.moveTo(lx, -0.45 * r);
      ctx.lineTo(lx + 0.18 * r, -0.82 * r);
      ctx.lineTo(lx + 0.18 * r + sw, -1.0 * r);
      ctx.moveTo(lx, 0.45 * r);
      ctx.lineTo(lx + 0.18 * r, 0.82 * r);
      ctx.lineTo(lx + 0.18 * r - sw, 1.0 * r);
    }
    ctx.lineWidth = 1.4;
    ctx.lineJoin = 'miter';
    ctx.strokeStyle = '#3a4663';
    ctx.stroke();

    // Панцирь: угловатый многоугольник (low-poly). Верхняя половина светлее: одна грань для объёма.
    ctx.beginPath();
    ctx.moveTo(0.56 * r, -0.5 * r);
    ctx.lineTo(0.1 * r, -0.78 * r);
    ctx.lineTo(-0.6 * r, -0.62 * r);
    ctx.lineTo(-0.98 * r, -0.15 * r);
    ctx.lineTo(-0.98 * r, 0.15 * r);
    ctx.lineTo(-0.6 * r, 0.62 * r);
    ctx.lineTo(0.1 * r, 0.78 * r);
    ctx.lineTo(0.56 * r, 0.5 * r);
    ctx.closePath();
    ctx.fillStyle = hit ? '#ffffff' : '#171e2d';
    ctx.fill();
    if (!hit) {
      ctx.fillStyle = '#2a3652';
      ctx.beginPath();
      ctx.moveTo(0.56 * r, -0.5 * r);
      ctx.lineTo(0.1 * r, -0.78 * r);
      ctx.lineTo(-0.6 * r, -0.62 * r);
      ctx.lineTo(-0.98 * r, -0.15 * r);
      ctx.lineTo(-0.98 * r, 0);
      ctx.lineTo(0.3 * r, 0);
      ctx.closePath();
      ctx.fill();
    }
    // Тонкая оранжевая кайма по контуру: подсветка от жара.
    ctx.beginPath();
    ctx.moveTo(0.56 * r, -0.5 * r);
    ctx.lineTo(0.1 * r, -0.78 * r);
    ctx.lineTo(-0.6 * r, -0.62 * r);
    ctx.lineTo(-0.98 * r, -0.15 * r);
    ctx.lineTo(-0.98 * r, 0.15 * r);
    ctx.lineTo(-0.6 * r, 0.62 * r);
    ctx.lineTo(0.1 * r, 0.78 * r);
    ctx.lineTo(0.56 * r, 0.5 * r);
    ctx.closePath();
    ctx.lineWidth = 1.2;
    ctx.globalAlpha = hit ? 1 : 0.7;
    ctx.strokeStyle = hit ? '#ffffff' : '#ff7a2e';
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Жар под панцирем и раскалённый шов посередине.
    if (!hit) {
      ctx.globalAlpha = frozen ? 0.1 : 0.32 + 0.2 * f1;
      ctx.drawImage(glow, -1.5 * r, -1.0 * r, 2.4 * r, 2.0 * r);
      ctx.globalAlpha = frozen ? 0.4 : 0.65 + 0.3 * f1;
      ctx.beginPath();
      ctx.moveTo(0.3 * r, 0);
      ctx.lineTo(-0.98 * r, 0);
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = '#ff9a3c';
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Голова и усики.
    ctx.beginPath();
    ctx.moveTo(1.0 * r, -0.15 * r);
    ctx.lineTo(1.22 * r, -0.4 * r + Math.sin(t * 7 + ph) * 0.05 * r);
    ctx.moveTo(1.0 * r, 0.15 * r);
    ctx.lineTo(1.22 * r, 0.4 * r - Math.sin(t * 7 + ph) * 0.05 * r);
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = '#3a4663';
    ctx.stroke();
    // Голова: маленький угловатый шестиугольник, темнее панциря.
    ctx.fillStyle = hit ? '#ffffff' : '#0f141f';
    ctx.beginPath();
    ctx.moveTo(1.12 * r, 0);
    ctx.lineTo(0.92 * r, -0.34 * r);
    ctx.lineTo(0.52 * r, -0.32 * r);
    ctx.lineTo(0.42 * r, 0);
    ctx.lineTo(0.52 * r, 0.32 * r);
    ctx.lineTo(0.92 * r, 0.34 * r);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.globalAlpha = hit ? 1 : 0.7;
    ctx.strokeStyle = hit ? '#ffffff' : '#ff7a2e';
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Глаза: яркое ядро и мягкое свечение вокруг (сложением цветов, поэтому светятся).
    const ex = 0.92 * r;
    const ey = 0.17 * r;
    ctx.fillStyle = '#fff3b8';
    ctx.beginPath();
    ctx.arc(ex, -ey, 0.11 * r, 0, TAU);
    ctx.arc(ex, ey, 0.11 * r, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = frozen ? 0.2 : 0.62 + 0.2 * f2;
    const gs = r * 1.6;
    ctx.drawImage(glow, ex - gs / 2, -ey - gs / 2, gs, gs);
    ctx.drawImage(glow, ex - gs / 2, ey - gs / 2, gs, gs);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  /**
   * Жук-стрелок, вид сверху: фиолетовый панцирь и брюшко. Брюшко маленькое, пока жук спокоен;
   * пока он целится (e.aim), оно растёт, наливается светом и дрожит, а после выстрела резко сдувается
   * (на миг даже меньше обычного) и приходит в норму. Состояние брюшка хранится здесь, в рендерере.
   */
  drawShooter(e, x, y, hit) {
    const ctx = this.ctx;
    const r = e.radius;
    const t = this.clock;
    let st = this.beetleState.get(e);
    if (!st) {
      st = { a: Math.atan2(this.hero.y - y, this.hero.x - x), ph: Math.random() * TAU };
      this.beetleState.set(e, st);
    }
    // Давно не рисовали (был за экраном) или это уже другой враг из пула: брюшко начинает с малого.
    const BASE = 0.2;
    let dt = t - (st.t || 0);
    if (st.ab === undefined || dt > 0.5) {
      st.ab = BASE;
      st.rec = 0;
      st.was = false;
      dt = 0;
    }
    st.t = t;
    if (dt > 0.1) dt = 0.1;

    const frozen = e.freezeT > 0;
    const moving = e.hx !== 0 || e.hy !== 0;
    if (!frozen) {
      const target = moving ? Math.atan2(e.hy, e.hx) : Math.atan2(this.hero.y - y, this.hero.x - x);
      let da = (target - st.a) % TAU;
      if (da > Math.PI) da -= TAU;
      else if (da < -Math.PI) da += TAU;
      st.a += da * 0.25;
    }

    // Заряд: k растёт от 0 до 1 за время прицеливания; брюшко следует за ним вверх сразу, а вниз сдувается резко.
    const aiming = e.aim > 0;
    const k = aiming ? Math.min(1, 1 - e.aim / Math.max(0.01, e.aimTotal)) : 0;
    if (st.was && !aiming) st.rec = 1; // только что выстрелил
    st.was = aiming;
    const goal = aiming ? BASE + (1 - BASE) * k * k : BASE * (1 - 0.4 * st.rec);
    if (goal >= st.ab) st.ab = goal;
    else st.ab += (goal - st.ab) * (1 - Math.exp(-dt / 0.04));
    st.rec = Math.max(0, st.rec - dt / 0.35);
    const s = st.ab;

    const ph = st.ph;
    const f2 = frozen ? 0.5 : 0.5 + 0.5 * Math.sin(t * 19 + ph * 2);
    const glow = this.getGlow(true);
    const ra = r * (0.36 + 0.64 * s);          // радиус брюшка
    const cx = -(0.5 * r + ra * 0.9);          // центр брюшка по оси жука
    const wob = !frozen && s > 0.5 ? 0.07 * k * Math.sin(t * 45 + ph) : 0; // дрожит перед выстрелом
    const rad = ra * (1 + wob);
    const sh = frozen ? 0 : k * 0.05 * r;      // весь жук трясётся, когда заряд почти полный

    ctx.save();
    ctx.translate(x + Math.sin(t * 61) * sh, y + Math.cos(t * 53) * sh);
    ctx.rotate(st.a);
    const kk = hit ? 1.15 : 1;
    ctx.scale(kk, kk);

    // Мягкий свет от глаз на пол перед жуком; сильнее, пока целится.
    ctx.globalAlpha = frozen ? 0.04 : 0.12 + 0.1 * k + 0.03 * f2;
    ctx.drawImage(glow, r * 0.2, -r * 1.05, r * 3.0, r * 2.1);

    // Лапки: угловатые, холодный фиолетово-серый.
    ctx.globalAlpha = 1;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const lx = (0.3 - i * 0.35) * r;
      const sw = moving && !frozen ? Math.sin(t * 20 + ph + i * 2.1) * 0.2 * r : 0;
      ctx.moveTo(lx, -0.4 * r);
      ctx.lineTo(lx + 0.18 * r, -0.78 * r);
      ctx.lineTo(lx + 0.18 * r + sw, -0.97 * r);
      ctx.moveTo(lx, 0.4 * r);
      ctx.lineTo(lx + 0.18 * r, 0.78 * r);
      ctx.lineTo(lx + 0.18 * r - sw, 0.97 * r);
    }
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = '#4a3a73';
    ctx.stroke();

    // Брюшко: восьмиугольник, внутри светится слизь; чем больше заряд, тем ярче.
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const ang = i * (TAU / 8) + 0.2;
      const rr = rad * (i & 1 ? 0.9 : 1);
      const px = cx + Math.cos(ang) * rr;
      const py = Math.sin(ang) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = hit ? '#ffffff' : '#241a40';
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.globalAlpha = hit ? 1 : 0.75;
    ctx.strokeStyle = hit ? '#ffffff' : '#a06bff';
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (!hit) {
      const a5 = 5 * (TAU / 8) + 0.2;
      const a6 = 6 * (TAU / 8) + 0.2;
      ctx.fillStyle = '#3a2c62';
      ctx.beginPath();
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx + Math.cos(a5) * rad * 0.9, Math.sin(a5) * rad * 0.9);
      ctx.lineTo(cx + Math.cos(a6) * rad, Math.sin(a6) * rad);
      ctx.closePath();
      ctx.fill();
      // Слизь внутри: свечение и яркое ядро, растут с зарядом.
      ctx.globalAlpha = frozen ? 0.08 : 0.12 + 0.6 * s * s;
      ctx.drawImage(glow, cx - rad * 1.5, -rad * 1.5, rad * 3, rad * 3);
      ctx.globalAlpha = frozen ? 0.1 : 0.1 + 0.55 * k;
      ctx.fillStyle = '#d9b8ff';
      ctx.beginPath();
      ctx.arc(cx, 0, rad * 0.38, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Грудь: угловатый панцирь поменьше, верхняя грань светлее.
    ctx.beginPath();
    for (let i = 0; i < 16; i += 2) {
      const px = (SHELL[i] * 0.8 + 0.2) * r;
      const py = SHELL[i + 1] * 0.8 * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = hit ? '#ffffff' : '#1b1530';
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.globalAlpha = hit ? 1 : 0.7;
    ctx.strokeStyle = hit ? '#ffffff' : '#a06bff';
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (!hit) {
      ctx.fillStyle = '#2f2450';
      ctx.beginPath();
      ctx.moveTo((SHELL[0] * 0.8 + 0.2) * r, SHELL[1] * 0.8 * r);
      ctx.lineTo((SHELL[2] * 0.8 + 0.2) * r, SHELL[3] * 0.8 * r);
      ctx.lineTo((SHELL[4] * 0.8 + 0.2) * r, SHELL[5] * 0.8 * r);
      ctx.lineTo((SHELL[6] * 0.8 + 0.2) * r, SHELL[7] * 0.8 * r);
      ctx.lineTo((SHELL[6] * 0.8 + 0.2) * r, 0);
      ctx.lineTo((0.3 * 0.8 + 0.2) * r, 0);
      ctx.closePath();
      ctx.fill();
    }

    // Голова: тёмный шестиугольник.
    ctx.fillStyle = hit ? '#ffffff' : '#120d22';
    ctx.beginPath();
    ctx.moveTo(1.18 * r, 0);
    ctx.lineTo(1.0 * r, -0.3 * r);
    ctx.lineTo(0.68 * r, -0.28 * r);
    ctx.lineTo(0.6 * r, 0);
    ctx.lineTo(0.68 * r, 0.28 * r);
    ctx.lineTo(1.0 * r, 0.3 * r);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 1.1;
    ctx.globalAlpha = hit ? 1 : 0.7;
    ctx.strokeStyle = hit ? '#ffffff' : '#a06bff';
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Глаза: светлое ядро и фиолетовое свечение; перед выстрелом разгораются сильнее.
    const ex = 0.96 * r;
    const ey = 0.15 * r;
    const er = 0.1 * r * (1 + 0.4 * k);
    ctx.fillStyle = '#f1e0ff';
    ctx.beginPath();
    ctx.arc(ex, -ey, er, 0, TAU);
    ctx.arc(ex, ey, er, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = frozen ? 0.2 : 0.55 + 0.25 * f2 + 0.2 * k;
    const gs = r * (1.5 + 0.6 * k);
    ctx.drawImage(glow, ex - gs / 2, -ey - gs / 2, gs, gs);
    ctx.drawImage(glow, ex - gs / 2, ey - gs / 2, gs, gs);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  /** ЗАГЛУШКА ГРАФИКИ: мошки Горного жука, маленькие светлые кружки с обводкой, без деталей. */
  drawMidges(list, alpha, viewL, viewR, viewT, viewB) {
    if (!list.length) return;
    const ctx = this.ctx;
    ctx.fillStyle = '#e8f1ff';
    ctx.strokeStyle = '#7fb4ff';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (!m.active) continue;
      const px = m.prevX + (m.x - m.prevX) * alpha;
      const py = m.prevY + (m.y - m.prevY) * alpha;
      if (px < viewL - 20 || px > viewR + 20 || py < viewT - 20 || py > viewB + 20) continue;
      ctx.beginPath();
      ctx.arc(px, py, m.radius, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
  }

  /** Снаряды врагов: липкие светящиеся капли слизи с тянущимся хвостом. Парируемые обведены светлым. */
  drawEnemyShots(list, alpha, viewL, viewR, viewT, viewB, C) {
    const ctx = this.ctx;
    const t = this.clock;
    const glow = this.getGlow(true);
    // Сначала свечение (сложением цветов), потом сами капли.
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.6;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (!p.active) continue;
      const px = p.prevX + (p.x - p.prevX) * alpha;
      const py = p.prevY + (p.y - p.prevY) * alpha;
      if (px < viewL - 30 || px > viewR + 30 || py < viewT - 30 || py > viewB + 30) continue;
      const g = p.radius * 3.2;
      ctx.drawImage(glow, px - g, py - g, g * 2, g * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (!p.active) continue;
      const px = p.prevX + (p.x - p.prevX) * alpha;
      const py = p.prevY + (p.y - p.prevY) * alpha;
      if (px < viewL - 30 || px > viewR + 30 || py < viewT - 30 || py > viewB + 30) continue;
      const r = p.radius;
      const ph = p.travelled * 0.15; // фаза качания зависит от пройденного пути: состояние снаряду не нужно
      const w1 = 1 + 0.1 * Math.sin(t * 18 + ph);
      const w2 = 1 + 0.08 * Math.cos(t * 15 + ph * 1.3);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(Math.atan2(p.vy, p.vx));
      ctx.fillStyle = C.snot;
      // Липкий хвост, тянущийся за каплей.
      ctx.beginPath();
      ctx.moveTo(-0.2 * r, -0.7 * r);
      ctx.quadraticCurveTo(-1.4 * r, -0.45 * r, -2.6 * r * w2, 0);
      ctx.quadraticCurveTo(-1.4 * r, 0.45 * r, -0.2 * r, 0.7 * r);
      ctx.closePath();
      ctx.fill();
      // Оторвавшиеся капельки.
      ctx.beginPath();
      ctx.arc(-3.0 * r, Math.sin(ph * 2) * 0.25 * r, 0.28 * r, 0, TAU);
      ctx.moveTo(-3.5 * r, Math.cos(ph * 2) * 0.2 * r);
      ctx.arc(-3.7 * r, Math.cos(ph * 2) * 0.2 * r, 0.18 * r, 0, TAU);
      ctx.fill();
      // Тело-капля с лёгким дрожанием формы.
      ctx.beginPath();
      ctx.ellipse(0, 0, 1.05 * r * w1, 0.9 * r * w2, 0, 0, TAU);
      ctx.fill();
      if (p.parryable) {
        ctx.lineWidth = 1.3;
        ctx.strokeStyle = '#f3eaff';
        ctx.stroke();
      }
      // Блик: капля выглядит влажной.
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = C.snotCore;
      ctx.beginPath();
      ctx.ellipse(0.25 * r, -0.25 * r, 0.42 * r, 0.28 * r, -0.4, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }

  /** Капля слизи (эффект соплей при попадании): вытягивается по скорости, тянет за собой нить, тает. */
  drawGlob(f) {
    const ctx = this.ctx;
    const k = Math.min(1, f.age / f.life);
    const a = 1 - k * k;
    const s = f.size * (1 - 0.45 * k);
    const sp = Math.hypot(f.vx, f.vy);
    if (sp > 15) {
      ctx.globalAlpha = a * 0.9;
      ctx.lineCap = 'round';
      ctx.lineWidth = s * 0.9;
      ctx.strokeStyle = f.color;
      ctx.beginPath();
      ctx.moveTo(f.x - f.vx * 0.05, f.y - f.vy * 0.05);
      ctx.lineTo(f.x, f.y);
      ctx.stroke();
      ctx.lineCap = 'butt';
    }
    ctx.globalAlpha = a * 0.35;
    const g = s * 2.2;
    ctx.drawImage(this.getGlow(true), f.x - g, f.y - g, g * 2, g * 2);
    ctx.globalAlpha = a;
    ctx.fillStyle = f.color;
    const stretch = 1 + Math.min(0.7, sp / 250);
    ctx.beginPath();
    ctx.ellipse(f.x, f.y, s * stretch, s / Math.sqrt(stretch), Math.atan2(f.vy, f.vx), 0, TAU);
    ctx.fill();
    if (s > 5) {
      ctx.globalAlpha = a * 0.8;
      ctx.fillStyle = this.cfg.render.colors.snotCore;
      ctx.beginPath();
      ctx.arc(f.x - s * 0.25, f.y - s * 0.3, s * 0.3, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** Мягкая красная полоса телеграфа: вдоль и поперёк плавно тает в ноль, чётких краёв нет. Считается один раз. */
  getStrip() {
    if (this.strip) return this.strip;
    const W = 256;
    const H = 64;
    let c;
    if (typeof OffscreenCanvas === 'function') {
      c = new OffscreenCanvas(W, H);
    } else {
      c = document.createElement('canvas');
      c.width = W;
      c.height = H;
    }
    const g = c.getContext('2d');
    const img = g.createImageData(W, H);
    const sm = (v) => {
      const q = v < 0 ? 0 : v > 1 ? 1 : v;
      return q * q * (3 - 2 * q);
    };
    for (let y = 0; y < H; y++) {
      const v = (y / (H - 1)) * 2 - 1;
      const fy = Math.exp(-3.2 * v * v); // поперёк: колокол, у краёв почти ноль
      for (let x = 0; x < W; x++) {
        const u = x / (W - 1);
        const a = sm(u / 0.14) * sm((1 - u) / 0.2) * fy; // вдоль: нарастание в начале и затухание в конце
        const i = (y * W + x) * 4;
        img.data[i] = 255;
        img.data[i + 1] = 70;
        img.data[i + 2] = 58;
        img.data[i + 3] = Math.round(a * 255);
      }
    }
    g.putImageData(img, 0, 0);
    this.strip = c;
    return c;
  }

  /** Телеграф рывка: размытая красная полоса; за время замаха она наливается от жука вперёд, в конце пульсирует. */
  drawSoftStrip(tg, x, y, k) {
    const ctx = this.ctx;
    const strip = this.getStrip();
    const L = tg.length;
    const w = tg.width;
    const h = w * 2.2; // по краям спрайт тает, поэтому он шире зоны
    const pulse = k > 0.7 ? 0.85 + 0.15 * Math.sin(this.clock * 38) : 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.atan2(tg.dirY, tg.dirX));
    ctx.globalAlpha = (0.16 + 0.08 * k) * pulse;
    ctx.drawImage(strip, -0.05 * L, -h / 2, L * 1.1, h);
    ctx.globalAlpha = (0.22 + 0.3 * k) * pulse;
    ctx.drawImage(strip, -0.05 * L, -h / 2, Math.max(2, L * 1.1 * k), h);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** Мягкое светлое облачко для пыли. */
  getDust() {
    if (this.dust) return this.dust;
    const size = 64;
    let c;
    if (typeof OffscreenCanvas === 'function') {
      c = new OffscreenCanvas(size, size);
    } else {
      c = document.createElement('canvas');
      c.width = c.height = size;
    }
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gr.addColorStop(0, 'rgba(214,226,244,0.9)');
    gr.addColorStop(0.5, 'rgba(184,201,226,0.45)');
    gr.addColorStop(1, 'rgba(160,182,214,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, size, size);
    this.dust = c;
    return c;
  }

  /** Облачко пыли в точке остановки: несколько клубов летят вперёд по ходу рывка и в стороны, тормозят и тают. */
  spawnDust(x, y, dirX, dirY) {
    const base = Math.atan2(dirY, dirX);
    let made = 0;
    for (let i = 0; i < this.puffs.length && made < 9; i++) {
      const p = this.puffs[i];
      if (p.on) continue;
      const a = base + (Math.random() - 0.5) * 2.6;
      const sp = 30 + Math.random() * 90;
      p.on = true;
      p.x = x - dirX * 4 + (Math.random() - 0.5) * 8;
      p.y = y - dirY * 4 + (Math.random() - 0.5) * 8;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp;
      p.age = 0;
      p.life = 0.5 + Math.random() * 0.4;
      p.size = 7 + Math.random() * 7;
      made++;
    }
  }

  drawDust(dt) {
    const ctx = this.ctx;
    const sprite = this.getDust();
    const drag = Math.exp(-4 * dt);
    for (let i = 0; i < this.puffs.length; i++) {
      const p = this.puffs[i];
      if (!p.on) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.on = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= drag;
      p.vy *= drag;
      const k = p.age / p.life;
      const s = p.size * (1 + 1.2 * k); // клуб раздувается и редеет
      ctx.globalAlpha = 0.55 * (1 - k) * (1 - k);
      ctx.drawImage(sprite, p.x - s, p.y - s, s * 2, s * 2);
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Бык, жук-носорог, вид сверху: тёмно-синий панцирь, красный акцент (кайма, швы, глаза, кончик рога).
   * Замах: жук напрягается и дрожит, красное разгорается. Рывок: тело вытягивается, за ним шлейф теней и
   * линии скорости. Конец рывка: облачко пыли. Оглушение: холодный оттенок, над головой кружат звёздочки.
   */
  drawBull(e, x, y, hit) {
    const ctx = this.ctx;
    const r = e.radius;
    const t = this.clock;
    const A = e.atk;
    const as = A.state;
    const att = e.def.attack;
    let st = this.beetleState.get(e);
    if (!st) {
      st = { a: Math.atan2(this.hero.y - y, this.hero.x - x), ph: Math.random() * TAU };
      this.beetleState.set(e, st);
    }
    // Давно не рисовали или это другой враг из пула: прошлое состояние забываем, пыли не будет.
    if (t - (st.t || 0) > 0.5 || st.pa === undefined) st.pa = as;
    st.t = t;
    if (st.pa === 'strike' && as !== 'strike') this.spawnDust(x, y, A.dirX, A.dirY); // рывок закончился: тормозит
    st.pa = as;

    const frozen = e.freezeT > 0;
    const moving = e.hx !== 0 || e.hy !== 0;
    if (!frozen) {
      const target = as !== 'idle' ? Math.atan2(A.dirY, A.dirX)
        : moving ? Math.atan2(e.hy, e.hx) : Math.atan2(this.hero.y - y, this.hero.x - x);
      let da = (target - st.a) % TAU;
      if (da > Math.PI) da -= TAU;
      else if (da < -Math.PI) da += TAU;
      st.a += da * (as === 'strike' ? 0.8 : 0.25);
    }

    const striking = as === 'strike';
    const stunned = as === 'stun';
    const kW = as === 'windup' && att ? Math.min(1, A.t / Math.max(0.01, att.windup)) : 0; // как далеко зашёл замах
    const rage = striking ? 1 : kW; // насколько разгорелось красное
    const f1 = frozen ? 0.5 : 0.5 + 0.5 * Math.sin(t * 14 + st.ph);
    const glow = this.getGlow('red');
    const sh = frozen ? 0 : (kW * 0.05 + (stunned ? 0.03 : 0)) * r; // дрожь: замах и оглушение

    ctx.save();
    ctx.translate(x + Math.sin(t * 63) * sh, y + Math.cos(t * 57) * sh);
    ctx.rotate(st.a);
    const press = as === 'windup' ? 1 + 0.04 * Math.sin(t * 30) * kW : 1; // в замахе тело «пульсирует»
    const vs = (hit ? 1.12 : 1) * 1.1 * press; // жук крупнее собственного круга: он тяжёлый
    ctx.scale(vs, vs);

    if (striking) {
      // Скорость: линии позади и шлейф красноватых теней, каждая тень — на кадр раньше.
      ctx.lineWidth = 1.3;
      ctx.strokeStyle = '#ff8a80';
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      for (let j = 0; j < 3; j++) {
        const yy = (-0.5 + j * 0.5) * r;
        const len = (2.4 + 1.2 * Math.abs(Math.sin(t * 31 + j * 2))) * r;
        ctx.moveTo(-1.15 * r, yy);
        ctx.lineTo(-1.15 * r - len, yy);
      }
      ctx.stroke();
      ctx.fillStyle = '#d8453a';
      for (let i = 1; i <= 4; i++) {
        ctx.globalAlpha = 0.34 - i * 0.07;
        ctx.save();
        ctx.translate(-i * 0.85 * r, 0);
        ctx.beginPath();
        tracePoly(ctx, BULL_SHELL, r);
        tracePoly(ctx, BULL_HORN, r);
        ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      ctx.scale(1.18, 0.92); // сам жук вытянут по ходу движения
    }

    // Лапы: толстые, угловатые; в рывке не рисуем (там и так смазано).
    if (!striking) {
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const lx = (0.4 - i * 0.5) * r;
        const sw = moving && !frozen ? Math.sin(t * 18 + st.ph + i * 2.1) * 0.22 * r : 0;
        ctx.moveTo(lx, -0.6 * r);
        ctx.lineTo(lx + 0.2 * r, -0.95 * r);
        ctx.lineTo(lx + 0.2 * r + sw, -1.1 * r);
        ctx.moveTo(lx, 0.6 * r);
        ctx.lineTo(lx + 0.2 * r, 0.95 * r);
        ctx.lineTo(lx + 0.2 * r - sw, 1.1 * r);
      }
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#2c3550';
      ctx.stroke();
    }

    // Панцирь: тёмно-синий, верхняя грань светлее, по контуру красная кайма.
    ctx.beginPath();
    tracePoly(ctx, BULL_SHELL, r);
    ctx.fillStyle = hit ? '#ffffff' : '#141a28';
    ctx.fill();
    if (!hit) {
      ctx.fillStyle = '#222c45';
      ctx.beginPath();
      ctx.moveTo(0.62 * r, -0.62 * r);
      ctx.lineTo(0.15 * r, -0.9 * r);
      ctx.lineTo(-0.65 * r, -0.78 * r);
      ctx.lineTo(-1.05 * r, -0.2 * r);
      ctx.lineTo(-1.05 * r, 0);
      ctx.lineTo(0.4 * r, 0);
      ctx.closePath();
      ctx.fill();
      // Жар под панцирем и красные швы: разгораются в замахе и рывке.
      ctx.globalAlpha = frozen ? 0.06 : 0.1 + 0.4 * rage;
      ctx.drawImage(glow, -1.5 * r, -1.1 * r, 2.4 * r, 2.2 * r);
      ctx.globalAlpha = frozen ? 0.3 : 0.5 + 0.45 * rage + 0.05 * f1;
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = '#ff4a3d';
      ctx.beginPath();
      ctx.moveTo(0.3 * r, 0);
      ctx.lineTo(-1.05 * r, 0);
      ctx.moveTo(0.1 * r, 0);
      ctx.lineTo(-0.5 * r, -0.5 * r);
      ctx.moveTo(0.1 * r, 0);
      ctx.lineTo(-0.5 * r, 0.5 * r);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.beginPath();
    tracePoly(ctx, BULL_SHELL, r);
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = hit ? 1 : 0.55 + 0.4 * rage;
    ctx.strokeStyle = hit ? '#ffffff' : '#e0443c';
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (stunned && !hit) {
      ctx.globalAlpha = 0.4; // оглушён: панцирь холодеет
      ctx.fillStyle = '#8fa8c8';
      ctx.beginPath();
      tracePoly(ctx, BULL_SHELL, r);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Передняя пластина.
    ctx.beginPath();
    tracePoly(ctx, BULL_PRON, r);
    ctx.fillStyle = hit ? '#ffffff' : '#1c2438';
    ctx.fill();
    ctx.lineWidth = 1.3;
    ctx.globalAlpha = hit ? 1 : 0.7;
    ctx.strokeStyle = hit ? '#ffffff' : '#e0443c';
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Рог: тёмный, с двумя отростками и красной каймой.
    ctx.beginPath();
    tracePoly(ctx, BULL_HORN, r);
    tracePoly(ctx, BULL_PRONG_L, r);
    tracePoly(ctx, BULL_PRONG_R, r);
    ctx.fillStyle = hit ? '#ffffff' : '#0e121c';
    ctx.fill();
    ctx.lineWidth = 1.1;
    ctx.globalAlpha = hit ? 1 : 0.8;
    ctx.strokeStyle = hit ? '#ffffff' : '#e0443c';
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Оглушение: над головой кружат звёздочки.
    if (stunned) {
      ctx.fillStyle = '#e9f2ff';
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const ang = t * 5 + i * 2.094;
        const sx = 0.7 * r + Math.cos(ang) * 0.75 * r;
        const sy = Math.sin(ang) * 0.55 * r;
        ctx.moveTo(sx + 0.1 * r, sy);
        ctx.arc(sx, sy, 0.1 * r, 0, TAU);
      }
      ctx.fill();
    }

    // Глаза и кончик рога: красное свечение сложением цветов; в замахе и рывке разгорается, в оглушении гаснет.
    const power = stunned ? 0.12 : frozen ? 0.2 : as === 'recovery' ? 0.4 : 0.45 + 0.5 * rage + 0.08 * f1;
    const ex = 0.84 * r;
    const ey = 0.36 * r;
    const er = 0.1 * r * (1 + 0.5 * rage);
    ctx.fillStyle = '#ffd0c8';
    ctx.globalAlpha = stunned ? 0.4 : 1;
    ctx.beginPath();
    ctx.arc(ex, -ey, er, 0, TAU);
    ctx.arc(ex, ey, er, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = power;
    const gs = r * (1.3 + 0.7 * rage);
    ctx.drawImage(glow, ex - gs / 2, -ey - gs / 2, gs, gs);
    ctx.drawImage(glow, ex - gs / 2, ey - gs / 2, gs, gs);
    ctx.globalAlpha = power * 0.7;
    const hs = r * 0.9;
    ctx.drawImage(glow, 1.72 * r - hs / 2, -hs / 2, hs, hs);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  /** Запоминает, где герой был: из этих точек рисуется шлейф. Точки живут life секунд; при телепорте история сбрасывается. */
  updateHeroTrail(hx, hy, speed, life) {
    const h = this.hs;
    const N = h.tx.length;
    const t = this.clock;
    if (h.has && Math.hypot(hx - h.lx, hy - h.ly) > 90) h.cnt = 0;
    h.lx = hx;
    h.ly = hy;
    h.has = true;
    while (h.cnt > 0 && t - h.tt[(h.head - h.cnt + N) % N] > life) h.cnt--;
    if (speed < 12) return;
    const nw = (h.head - 1 + N) % N;
    if (h.cnt > 0 && Math.hypot(hx - h.tx[nw], hy - h.ty[nw]) < 2.2) return;
    h.tx[h.head] = hx;
    h.ty[h.head] = hy;
    h.tt[h.head] = t;
    h.head = (h.head + 1) % N;
    if (h.cnt < N) h.cnt++;
  }

  /**
   * Шлейф: сужающаяся светящаяся лента по прошлым положениям, светлая нить посередине и искры, оседающие
   * по краям. Интенсивность (alpha 0..1) плавно растёт при разгоне и гаснет после остановки.
   */
  drawHeroTrail(hx, hy, r, wmul, life, alpha, C) {
    const h = this.hs;
    if (h.cnt < 1 || alpha < 0.02) return;
    const ctx = this.ctx;
    const N = h.tx.length;
    const t = this.clock;
    const m = h.cnt + 1;
    const b = this.hbuf; // на точку: x, y, нормаль (nx, ny), полуширина
    const at = (i) => (i === 0 ? hx : h.tx[(h.head - i + N) % N]);
    const bt = (i) => (i === 0 ? hy : h.ty[(h.head - i + N) % N]);
    for (let i = 0; i < m; i++) {
      const a = Math.max(0, i - 2); // нормаль по соседям через одну точку: на поворотах лента не ломается углом
      const c = Math.min(m - 1, i + 2);
      let dx = at(a) - at(c);
      let dy = bt(a) - bt(c);
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;
      const k = i === 0 ? 1 : Math.max(0, 1 - (t - h.tt[(h.head - i + N) % N]) / life);
      // Волна вдоль ленты: она вьётся и бежит от героя назад; у головы волны нет, лента растёт из героя.
      const wv = i === 0 ? 0 : Math.sin(i * 0.85 - t * 13) * r * 0.17 * Math.min(1, i / 3) * k * alpha;
      b[i * 5] = at(i) - dy * wv;
      b[i * 5 + 1] = bt(i) + dx * wv;
      b[i * 5 + 2] = -dy;
      b[i * 5 + 3] = dx;
      b[i * 5 + 4] = r * 0.55 * wmul * Math.pow(k, 0.8);
    }
    const ox = b[(m - 1) * 5];
    const oy = b[(m - 1) * 5 + 1];
    if (Math.hypot(ox - hx, oy - hy) < 1) return;
    const c3 = hexRgb(C.trail);
    const col = (a) => 'rgba(' + c3[0] + ',' + c3[1] + ',' + c3[2] + ',' + a.toFixed(3) + ')';
    const band = (f) => { // лента шириной f от базовой
      ctx.beginPath();
      ctx.moveTo(b[0] - b[2] * b[4] * f, b[1] - b[3] * b[4] * f);
      for (let i = 1; i < m; i++) ctx.lineTo(b[i * 5] - b[i * 5 + 2] * b[i * 5 + 4] * f, b[i * 5 + 1] - b[i * 5 + 3] * b[i * 5 + 4] * f);
      for (let i = m - 1; i >= 0; i--) ctx.lineTo(b[i * 5] + b[i * 5 + 2] * b[i * 5 + 4] * f, b[i * 5 + 1] + b[i * 5 + 3] * b[i * 5 + 4] * f);
      ctx.closePath();
      ctx.fill();
    };
    const gr = ctx.createLinearGradient(hx, hy, ox, oy);
    gr.addColorStop(0, col(0.15 * alpha));
    gr.addColorStop(1, col(0));
    ctx.fillStyle = gr;
    band(1.8); // мягкое свечение вокруг
    const gm = ctx.createLinearGradient(hx, hy, ox, oy);
    gm.addColorStop(0, col(0.42 * alpha));
    gm.addColorStop(1, col(0));
    ctx.fillStyle = gm;
    band(1);
    // Светлая нить по центру ленты.
    const gl = ctx.createLinearGradient(hx, hy, ox, oy);
    gl.addColorStop(0, 'rgba(240,250,255,' + (0.8 * alpha).toFixed(3) + ')');
    gl.addColorStop(1, 'rgba(240,250,255,0)');
    ctx.strokeStyle = gl;
    ctx.lineWidth = r * 0.2 * wmul;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    for (let i = 1; i < m; i++) ctx.lineTo(b[i * 5], b[i * 5 + 1]);
    ctx.stroke();
    ctx.lineCap = 'butt';
    // Искры: оседают по краям ленты и мерцают.
    ctx.fillStyle = '#e6f4ff';
    for (let i = 1; i < m; i++) {
      const k = b[i * 5 + 4] / (r * 0.55 * wmul);
      const off = Math.sin(t * 7 + i * 1.7) * b[i * 5 + 4] * 1.5;
      ctx.globalAlpha = Math.min(1, 0.8 * k * alpha * (0.55 + 0.45 * Math.sin(t * 17 + i * 2.3)));
      ctx.beginPath();
      ctx.arc(b[i * 5] + b[i * 5 + 2] * off, b[i * 5 + 1] + b[i * 5 + 3] * off, 0.6 + 1.3 * k, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Герой-маг, вид сверху с лёгким наклоном (как на референсе): остроконечная шляпа с широкими полями,
   * тёмный плащ с хвостом, посох с голубым кристаллом. Тело и посох повёрнуты по hero.facing (на цель),
   * хвост плаща и шлейф идут против реального движения. Всё состояние вида лежит в this.hs, игре ничего не пишем.
   */
  drawHero(hx, hy, C) {
    const ctx = this.ctx;
    const hero = this.hero;
    const r = hero.radius;
    const t = this.clock;
    const dt = this.dt;
    const h = this.hs;
    const am = hero.invuln > 0 && (Math.floor(hero.invuln * 16) & 1) ? 0.4 : 1; // после удара мигает: герой неуязвим
    const parry = !!(this.defense && this.defense.parrying);
    const dash = !!hero.dashing;
    const slow = hero.slowT > 0;
    const burn = hero.burnT > 0;

    // Курс, скорость и угол сглаживаем: от рывков стика вид не дёргается.
    const sp = Math.hypot(hero.vx, hero.vy);
    const sf = Math.min(1.6, sp / Math.max(1, hero.cfg.speed));
    const kv = 1 - Math.exp(-dt / 0.08);
    const tmx = sp > 5 ? hero.vx / sp : 0;
    const tmy = sp > 5 ? hero.vy / sp : 0;
    h.mx += (tmx * Math.min(1, sf) - h.mx) * kv;
    h.my += (tmy * Math.min(1, sf) - h.my) * kv;
    let da = (hero.facing - h.a) % TAU;
    if (da > Math.PI) da -= TAU;
    else if (da < -Math.PI) da += TAU;
    h.a += da * (1 - Math.exp(-dt / 0.07)); // посох: следит за целью, чуть мягче, чтобы не дёргался от смены целей
    // Корпус (плечи и плащ) смотрит по ходу движения, а не на цель: цель меняется каждый выстрел, и корпус бы дёргался.
    // Стоим на месте: корпус замирает как был.
    if (h.b === undefined) h.b = hero.facing;
    if (sp > 20) {
      let db = (Math.atan2(hero.vy, hero.vx) - h.b) % TAU;
      if (db > Math.PI) db -= TAU;
      else if (db < -Math.PI) db += TAU;
      h.b += db * (1 - Math.exp(-dt / 0.16));
    }
    h.phase += sp * dt * 0.09;
    const want = sf > 0.05 ? Math.min(1.2, sf + (dash ? 0.4 : 0)) : 0;
    h.ti += (want - h.ti) * (1 - Math.exp(-dt / (want > h.ti ? 0.06 : 0.3)));
    const ml = Math.hypot(h.mx, h.my);

    // Шлейф рисуется под героем.
    this.updateHeroTrail(hx, hy, sp, dash ? 0.55 : 0.42);
    this.drawHeroTrail(hx, hy, r, 0.5 + 0.7 * Math.min(1.4, h.ti) + (dash ? 0.4 : 0), dash ? 0.55 : 0.42, Math.min(1, h.ti), C);

    const cD = hexRgb(C.heroCloak);
    const cL = hexRgb(C.heroCloakLight);
    const hD = hexRgb(C.heroHat);
    const hL = hexRgb(C.heroHatLight);
    const gold = '#ffe27a';

    // Тень на снегу.
    ctx.globalAlpha = am;
    ctx.fillStyle = C.shadow;
    ctx.beginPath();
    ctx.ellipse(hx + r * 0.22, hy + r * 0.64, r * 1.1, r * 0.5, 0, 0, TAU);
    ctx.fill();

    // Свечение за спиной: окно парирования (золотое) и статусы от разломов Тартаса.
    ctx.globalCompositeOperation = 'lighter';
    if (parry) {
      ctx.globalAlpha = 0.55 * am;
      ctx.drawImage(this.getGlow(), hx - r * 2.4, hy - r * 2.4, r * 4.8, r * 4.8);
    }
    if (slow) {
      ctx.globalAlpha = 0.4 * am;
      ctx.drawImage(this.getGlow('blue'), hx - r * 2.2, hy - r * 2.2, r * 4.4, r * 4.4);
    }
    if (burn) {
      ctx.globalAlpha = (0.4 + 0.1 * Math.sin(t * 20)) * am;
      ctx.drawImage(this.getGlow(), hx - r * 2.2, hy - r * 2.2, r * 4.4, r * 4.4);
    }
    ctx.globalCompositeOperation = 'source-over';

    ctx.save();
    ctx.translate(hx, hy + Math.sin(h.phase * 2) * 0.05 * r * Math.min(1, ml));
    if (dash) { // рывок: тело вытягивается по ходу
      const ma = Math.atan2(hero.vy, hero.vx);
      ctx.rotate(ma);
      ctx.scale(1.25, 0.84);
      ctx.rotate(-ma);
    }
    const sc = 1.15 * (1 + 0.015 * Math.sin(t * 2.4)); // чуть крупнее круга столкновения; дышит
    ctx.scale(sc, sc);
    const by0 = 0.14 * r; // плечи ниже центра, шляпа выше: так виден маг, а не диск
    ctx.translate(0, by0);

    // Хвост плаща: тянется против движения, на ходу длиннее и колышется.
    let tdx = -Math.cos(h.b); // стоим: хвост за корпусом, а не за целью
    let tdy = -Math.sin(h.b);
    if (ml > 0.08) {
      tdx = -h.mx / ml;
      tdy = -h.my / ml;
    }
    const tl = r * (0.55 + 1.0 * Math.min(1.2, ml * 1.2));
    const fl = Math.sin(t * 11 + h.phase) * 0.14 * r * (0.3 + ml);
    const qx = -tdy;
    const qy = tdx;
    ctx.globalAlpha = am;
    ctx.fillStyle = mixRgb(cD, cL, 0.18);
    ctx.beginPath();
    ctx.moveTo(qx * 0.64 * r + tdx * 0.1 * r, qy * 0.64 * r + tdy * 0.1 * r);
    ctx.lineTo(qx * (0.6 * r + fl * 0.4) + tdx * 0.55 * tl, qy * (0.6 * r + fl * 0.4) + tdy * 0.55 * tl);
    ctx.lineTo(tdx * tl + qx * fl, tdy * tl + qy * fl);
    ctx.lineTo(-qx * (0.6 * r - fl * 0.5) + tdx * 0.5 * tl, -qy * (0.6 * r - fl * 0.5) + tdy * 0.5 * tl);
    ctx.lineTo(-qx * 0.64 * r + tdx * 0.1 * r, -qy * 0.64 * r + tdy * 0.1 * r);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(8,12,24,0.6)';
    ctx.stroke();

    // Плечи и плащ: восьмиугольник, повёрнутый по курсу; грани освещены слева сверху.
    const cb = Math.cos(h.b);
    const sb = Math.sin(h.b);
    const ca = Math.cos(h.a); // посох: по цели
    const sa = Math.sin(h.a);
    const ring = this.hring;
    for (let i = 0; i < 8; i++) {
      ring[i * 2] = (HERO_BODY[i * 2] * cb - HERO_BODY[i * 2 + 1] * sb) * r;
      ring[i * 2 + 1] = (HERO_BODY[i * 2] * sb + HERO_BODY[i * 2 + 1] * cb) * r;
    }
    const c0x = -0.05 * r;
    const c0y = -0.06 * r;
    for (let i = 0; i < 8; i++) {
      const j = (i + 1) & 7;
      const mx = (ring[i * 2] + ring[j * 2]) / 2 - c0x;
      const my = (ring[i * 2 + 1] + ring[j * 2 + 1]) / 2 - c0y;
      const l = (mx * LIGHT_X + my * LIGHT_Y) / (Math.hypot(mx, my) || 1);
      const col = mixRgb(cD, cL, 0.36 + 0.5 * l + (parry ? 0.12 : 0));
      ctx.fillStyle = col;
      ctx.strokeStyle = col;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(c0x, c0y);
      ctx.lineTo(ring[i * 2], ring[i * 2 + 1]);
      ctx.lineTo(ring[j * 2], ring[j * 2 + 1]);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(ring[0], ring[1]);
    for (let i = 1; i < 8; i++) ctx.lineTo(ring[i * 2], ring[i * 2 + 1]);
    ctx.closePath();
    ctx.lineWidth = parry ? 1.8 : 1.1;
    ctx.strokeStyle = parry ? gold : 'rgba(8,12,24,0.7)';
    ctx.stroke();
    if (slow) { // замедлен: тело подёрнуто инеем
      ctx.globalAlpha = 0.32 * am;
      ctx.fillStyle = this.cfg.frost.color;
      ctx.fill();
      ctx.globalAlpha = am;
    }

    // Посох в правой руке: идёт вперёд, кристалл на конце. Рука в рукаве.
    const wx = (lx, ly) => (lx * ca - ly * sa) * r;
    const wy = (lx, ly) => (lx * sa + ly * ca) * r;
    const hxl = wx(0.3, 0.58);
    const hyl = wy(0.3, 0.58);
    ctx.lineCap = 'round';
    ctx.strokeStyle = mixRgb(cD, cL, 0.3);
    ctx.lineWidth = 0.36 * r;
    ctx.beginPath();
    ctx.moveTo(wx(0.0, 0.42), wy(0.0, 0.42));
    ctx.lineTo(hxl, hyl);
    ctx.stroke();
    const stx = wx(2.0, 0.12);
    const sty = wy(2.0, 0.12);
    ctx.strokeStyle = '#1c2133';
    ctx.lineWidth = 0.17 * r;
    ctx.beginPath();
    ctx.moveTo(wx(-0.45, 0.66), wy(-0.45, 0.66));
    ctx.lineTo(stx, sty);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(120,140,190,0.55)'; // блик на древке
    ctx.lineWidth = 0.05 * r;
    ctx.beginPath();
    ctx.moveTo(wx(-0.45, 0.66) - 0.04 * r, wy(-0.45, 0.66) - 0.05 * r);
    ctx.lineTo(stx - 0.04 * r, sty - 0.05 * r);
    ctx.stroke();
    ctx.lineCap = 'butt';
    ctx.fillStyle = '#2a3354';
    ctx.beginPath();
    ctx.arc(hxl, hyl, 0.15 * r, 0, TAU);
    ctx.fill();

    // Шляпа стоит над плечами: плоские поля и высокий конус, кончик клонится против движения.
    ctx.translate(0, -by0);
    const hcx = tdx * 0.06 * r * ml;
    const hcy = -0.4 * r;
    const lean = tdx * 0.55 * r * ml;
    const tipx = hcx + lean - 0.08 * r;
    const tipy = hcy - (1.05 - 0.15 * ml) * r + tdy * 0.2 * r * ml;
    const brx = 0.82 * r;
    const bry = 0.54 * r;
    ctx.beginPath();
    ctx.ellipse(hcx, hcy, brx, bry, 0, 0, TAU);
    ctx.fillStyle = mixRgb(hD, hL, 0.28);
    ctx.fill();
    ctx.lineWidth = parry ? 1.8 : 1.1;
    ctx.strokeStyle = parry ? gold : 'rgba(8,12,24,0.8)';
    ctx.stroke();
    ctx.beginPath(); // светлая кромка полей на освещённой стороне
    ctx.ellipse(hcx, hcy, brx * 0.98, bry * 0.98, 0, -2.16 - 0.9, -2.16 + 0.9);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(160,190,250,0.6)';
    ctx.stroke();
    const blx = hcx - 0.46 * r;
    const brx2 = hcx + 0.46 * r;
    const bfy = hcy + 0.26 * r;
    ctx.fillStyle = mixRgb(hD, hL, 0.82 + (parry ? 0.1 : 0)); // освещённая грань конуса
    ctx.beginPath();
    ctx.moveTo(tipx, tipy);
    ctx.lineTo(blx, hcy);
    ctx.lineTo(hcx, bfy);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = mixRgb(hD, hL, 0.3); // теневая грань
    ctx.beginPath();
    ctx.moveTo(tipx, tipy);
    ctx.lineTo(hcx, bfy);
    ctx.lineTo(brx2, hcy);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath(); // лента на шляпе
    ctx.moveTo(blx, hcy);
    ctx.quadraticCurveTo(hcx, hcy + 0.52 * r, brx2, hcy);
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = parry ? gold : 'rgba(150,190,255,0.7)';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(blx, hcy);
    ctx.lineTo(tipx, tipy);
    ctx.lineTo(brx2, hcy);
    ctx.lineWidth = parry ? 1.5 : 1;
    ctx.strokeStyle = parry ? gold : 'rgba(8,12,24,0.75)';
    ctx.stroke();
    if (slow) {
      ctx.globalAlpha = 0.28 * am;
      ctx.fillStyle = this.cfg.frost.color;
      ctx.beginPath();
      ctx.ellipse(hcx, hcy, brx, bry, 0, 0, TAU);
      ctx.moveTo(blx, hcy);
      ctx.lineTo(tipx, tipy);
      ctx.lineTo(brx2, hcy);
      ctx.fill();
      ctx.globalAlpha = am;
    }
    ctx.translate(0, by0);

    // Огонь на плаще (горит): три язычка у края хвоста.
    if (burn) {
      for (let i = 0; i < 3; i++) {
        const f = 0.5 + 0.5 * Math.sin(t * 24 + i * 2.3);
        const bx = tdx * (0.3 + 0.28 * i) * r + qx * (i - 1) * 0.42 * r;
        const by = tdy * (0.3 + 0.28 * i) * r + qy * (i - 1) * 0.42 * r - 0.1 * r;
        const hh = r * (0.5 + 0.4 * f);
        ctx.fillStyle = this.cfg.burn.color;
        ctx.beginPath();
        ctx.moveTo(bx - 0.2 * r, by);
        ctx.quadraticCurveTo(bx - 0.05 * r, by - hh * 0.6, bx + (f - 0.5) * 0.3 * r, by - hh);
        ctx.quadraticCurveTo(bx + 0.1 * r, by - hh * 0.5, bx + 0.2 * r, by);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ffd27a';
        ctx.beginPath();
        ctx.moveTo(bx - 0.08 * r, by);
        ctx.quadraticCurveTo(bx, by - hh * 0.45, bx + (f - 0.5) * 0.15 * r, by - hh * 0.65);
        ctx.quadraticCurveTo(bx + 0.04 * r, by - hh * 0.3, bx + 0.08 * r, by);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Кристалл на посохе: гранёный, пульсирует; в окне парирования золотой.
    const pulse = 0.5 + 0.5 * Math.sin(t * 4.2);
    const k1 = parry ? '#ffd45a' : C.crystal;
    const k2 = parry ? '#fff3b8' : C.crystalCore;
    ctx.fillStyle = k1;
    ctx.beginPath();
    ctx.moveTo(stx + wx(0.52, 0), sty + wy(0.52, 0));
    ctx.lineTo(stx + wx(0, -0.2), sty + wy(0, -0.2));
    ctx.lineTo(stx + wx(-0.2, 0), sty + wy(-0.2, 0));
    ctx.lineTo(stx + wx(0, 0.2), sty + wy(0, 0.2));
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = k2; // освещённая грань
    ctx.beginPath();
    ctx.moveTo(stx + wx(0.52, 0), sty + wy(0.52, 0));
    ctx.lineTo(stx + wx(0, -0.2), sty + wy(0, -0.2));
    ctx.lineTo(stx + wx(-0.2, 0), sty + wy(-0.2, 0));
    ctx.lineTo(stx, sty);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = 'rgba(8,12,24,0.55)';
    ctx.stroke();

    // Свечение кристалла и искры вокруг него (сложением цветов).
    ctx.globalCompositeOperation = 'lighter';
    const gl = this.getGlow(parry ? false : 'blue');
    const gs = r * (2.5 + 0.6 * pulse);
    ctx.globalAlpha = (0.6 + 0.2 * pulse) * am;
    ctx.drawImage(gl, stx + wx(0.15, 0) - gs / 2, sty + wy(0.15, 0) - gs / 2, gs, gs);
    ctx.fillStyle = '#eaf6ff';
    for (let i = 0; i < 3; i++) {
      const a = t * 2.6 + i * 2.1;
      const d = r * (0.5 + 0.12 * i);
      ctx.globalAlpha = (0.45 + 0.4 * Math.sin(t * 9 + i * 3)) * am;
      ctx.beginPath();
      ctx.arc(stx + Math.cos(a) * d, sty + Math.sin(a) * d * 0.8, 0.07 * r + 0.3, 0, TAU);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    // Замедлен: вокруг кружат ледяные осколки.
    if (slow) {
      ctx.fillStyle = '#e4f4ff';
      ctx.strokeStyle = this.cfg.frost.color;
      ctx.lineWidth = 0.8;
      ctx.globalAlpha = 0.9 * am;
      for (let i = 0; i < 4; i++) {
        const a = t * 1.3 + i * (TAU / 4);
        const px = Math.cos(a) * r * 1.2;
        const py = Math.sin(a) * r * 1.0;
        ctx.beginPath();
        ctx.moveTo(px, py - 0.22 * r);
        ctx.lineTo(px + 0.12 * r, py);
        ctx.lineTo(px, py + 0.22 * r);
        ctx.lineTo(px - 0.12 * r, py);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  drawShots(list, alpha, viewL, viewR, viewT, viewB) {
    const ctx = this.ctx;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (!p.active) continue;
      const px = p.prevX + (p.x - p.prevX) * alpha;
      const py = p.prevY + (p.y - p.prevY) * alpha;
      if (px < viewL - 20 || px > viewR + 20 || py < viewT - 20 || py > viewB + 20) continue;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(px, py, p.radius, 0, TAU);
      ctx.fill();
      if (p.parryable) {
        // Парируемые снаряды обведены: видно, что их можно поймать.
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#fff3d0';
        ctx.stroke();
      }
    }
  }

  /** Сухие кусты, камешки и наметы на полу: рисуются только те, что в кадре. */
  drawGroundDetails(C, viewL, viewR, viewT, viewB) {
    const ctx = this.ctx;
    if (!this.details) this.details = buildGroundDetails(this.arena);
    const list = this.details;
    const dust = this.getDust();
    const snD = hexRgb(C.snow);
    const snL = hexRgb(C.snowLight);
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      if (d.x + d.r < viewL || d.x - d.r > viewR || d.y + d.r < viewT || d.y - d.r > viewB) continue;
      if (d.kind === 2) {
        ctx.globalAlpha = 0.2; // мягкий намёт: спрайт тающего пятна, без чётких краёв
        ctx.drawImage(dust, d.x - d.w, d.y - d.h, d.w * 2, d.h * 2);
        ctx.globalAlpha = 1;
      } else if (d.kind === 1) {
        ctx.fillStyle = 'rgba(6,9,18,0.28)';
        ctx.beginPath();
        ctx.ellipse(d.x + d.sz * 0.5, d.y + d.sz * 0.7, d.sz * 1.4, d.sz * 0.6, 0, 0, TAU);
        ctx.fill();
        ctx.beginPath();
        for (let k = 0; k < d.poly.length; k += 2) {
          if (k === 0) ctx.moveTo(d.x + d.poly[k], d.y + d.poly[k + 1]);
          else ctx.lineTo(d.x + d.poly[k], d.y + d.poly[k + 1]);
        }
        ctx.closePath();
        ctx.fillStyle = C.chitin;
        ctx.fill();
        ctx.beginPath(); // снежок сверху
        ctx.ellipse(d.x - d.sz * 0.2, d.y - d.sz * 0.35, d.sz * 0.75, d.sz * 0.4, 0, 0, TAU);
        ctx.fillStyle = mixRgb(snD, snL, 0.4);
        ctx.fill();
      } else {
        ctx.beginPath();
        const sg = d.seg;
        for (let k = 0; k < sg.length; k += 4) {
          ctx.moveTo(sg[k], sg[k + 1]);
          ctx.lineTo(sg[k + 2], sg[k + 3]);
        }
        ctx.lineWidth = 1.3;
        ctx.lineCap = 'round';
        ctx.strokeStyle = C.chitin;
        ctx.stroke();
        ctx.lineCap = 'butt';
      }
    }
  }

  /** Лёгкий снегопад: снежинки живут в пределах экрана и дрейфуют по ветру. Ближние крупнее и ярче. */
  drawSnow(ctx, viewL, viewR, viewT, viewB) {
    const n = this.cfg.render.snowflakes | 0;
    if (n <= 0) return;
    const w = viewR - viewL;
    const h = viewB - viewT;
    let f = this.flakes;
    if (f.length !== n) {
      f = this.flakes = [];
      for (let i = 0; i < n; i++) f.push({ x: viewL + Math.random() * w, y: viewT + Math.random() * h, z: 0.35 + Math.random() * 0.65 });
    }
    const dt = this.dt;
    ctx.fillStyle = '#dbe6f5';
    for (let i = 0; i < n; i++) {
      const p = f[i];
      p.x += (-10 + 6 * Math.sin(this.clock * 0.6 + i)) * p.z * dt;
      p.y += 24 * p.z * dt;
      if (p.x < viewL) p.x += w;
      else if (p.x > viewR) p.x -= w;
      if (p.y > viewB) p.y -= h;
      else if (p.y < viewT) p.y += h;
      ctx.globalAlpha = 0.14 + 0.26 * p.z;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 0.6 + 1.7 * p.z, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
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

  /**
   * Вокруг героя: слева дуга перезарядки блока, справа рывка, сверху полудуга здоровья с цифрами.
   * Дуги перезарядки видны, только пока идёт перезарядка. Здоровье скрыто при полном запасе. Мировые координаты.
   */
  drawHeroArcs(hx, hy, C) {
    const ctx = this.ctx;
    const d = this.defense;
    const U = this.ui;
    const hero = this.hero;
    const sc = (ctx.getTransform().a || 1) / this.dpr; // css-пикселей на единицу мира: цифры одного размера при любом зуме
    const r = hero.radius + 9;
    const half = 0.9; // половина угла дуги, рад
    const arc = (rr, a0, a1, frac, color, w) => {
      ctx.lineCap = 'round';
      ctx.lineWidth = w;
      ctx.strokeStyle = 'rgba(190,215,250,0.16)';
      ctx.beginPath();
      ctx.arc(hx, hy, rr, a0, a1);
      ctx.stroke();
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.arc(hx, hy, rr, a0, a0 + (a1 - a0) * Math.max(0, Math.min(1, frac)));
      ctx.stroke();
      ctx.lineCap = 'butt';
    };
    if (d) {
      if (!d.blocking && d.blockCd > 0) arc(r, Math.PI - half, Math.PI + half, 1 - d.blockCd / d.blockCdMax, '#8cc8ff', 3);
      if (d.dashCd > 0) arc(r, -half, half, 1 - d.dashCd / d.dashCdMax, '#b79cff', 3);
    }
    // Здоровье: плавно проявляется, когда оно не полное, и исчезает при полном.
    const maxHp = this.cfg.hero.maxHp || 1;
    const full = hero.hp >= maxHp - 1e-6;
    U.hpShow += ((full ? 0 : 1) - U.hpShow) * (1 - Math.exp(-this.dt / (full ? 0.5 : 0.1)));
    if (full) U.hp = U.hpTrail = 1;
    if (U.hpShow < 0.02) return;
    const hpT = Math.max(0, Math.min(1, hero.hp / maxHp));
    U.hp += (hpT - U.hp) * (1 - Math.exp(-this.dt / 0.07));
    U.hpTrail = hpT > U.hpTrail ? hpT : U.hpTrail + (U.hp - U.hpTrail) * (1 - Math.exp(-this.dt / 0.55));
    const R = r + 12;
    const a0 = Math.PI * 1.08;
    const a1 = Math.PI * 1.92;
    const pulse = hpT < 0.3 ? 0.5 + 0.5 * Math.sin(this.clock * 6) : 0;
    ctx.globalAlpha = U.hpShow;
    arc(R, a0, a1, 1, 'rgba(0,0,0,0)', 4.5);
    if (U.hpTrail > U.hp) arc(R, a0, a1, U.hpTrail, 'rgba(255,200,190,0.55)', 4.5);
    arc(R, a0, a1, U.hp, pulse > 0 ? 'rgb(255,' + Math.round(95 + 60 * pulse) + ',' + Math.round(85 + 60 * pulse) + ')' : '#e5534b', 4.5);
    ctx.font = '500 ' + (13 / sc).toFixed(2) + 'px ' + SERIF;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const txt = Math.ceil(hero.hp) + ' / ' + maxHp;
    ctx.fillStyle = 'rgba(6,10,22,0.7)';
    ctx.fillText(txt, hx + 0.8 / sc, hy - R - 7 / sc + 0.8 / sc);
    ctx.fillStyle = C.hud;
    ctx.fillText(txt, hx, hy - R - 7 / sc);
    ctx.globalAlpha = 1;
  }

  /** Текст с разрядкой: canvas.letterSpacing есть не во всех Safari, поэтому ставим буквы по одной. */
  tracked(text, x, y, sp, align) {
    const ctx = this.ctx;
    let total = -sp;
    const ws = this.trackW || (this.trackW = []);
    for (let i = 0; i < text.length; i++) {
      ws[i] = ctx.measureText(text[i]).width;
      total += ws[i] + sp;
    }
    let px = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
    ctx.textAlign = 'left';
    for (let i = 0; i < text.length; i++) {
      ctx.fillText(text[i], px, y);
      px += ws[i] + sp;
    }
    return total;
  }

  /** Тонкая линия и ромбик между ними: общий мотив интерфейса. */
  hairline(x1, x2, y, alpha) {
    const ctx = this.ctx;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#cfe0f8';
    ctx.fillRect(Math.min(x1, x2), Math.round(y), Math.abs(x2 - x1), 1);
    ctx.globalAlpha = 1;
  }

  rhomb(cx, cy, r, fill) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r, cy);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r, cy);
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    } else {
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(207,224,248,0.75)';
      ctx.stroke();
    }
  }

  /** Игровой интерфейс: волна и счёт сверху, босс-бар, здоровье и опыт слева внизу, три умения справа внизу. */
  drawHud(C) {
    const hud = this.hud;
    if (!hud) return;
    const ctx = this.ctx;
    const U = this.ui;
    const dt = this.dt;
    const ins = hud.insets;
    const w = this.w;
    const h = this.h;
    const cx = w / 2;
    const k = (tau) => 1 - Math.exp(-dt / tau);

    // Сглаженные значения: полоска плавно едет, а «след урона» догоняет её медленнее.
    U.xp += ((hud.xpFraction || 0) - U.xp) * k(0.12);
    for (let i = 0; i < 3; i++) U.slots[i] = Math.max(0, U.slots[i] - dt * 4);
    if (hud.slotFlash > 0) {
      U.slots[hud.slotFlash - 1] = 1;
      hud.slotFlash = 0;
    }
    const boss = this.boss && this.boss.enemy && this.boss.enemy.active ? this.boss.enemy : null;
    const bossT = boss ? Math.max(0, Math.min(1, boss.hp / boss.maxHp)) : 0;
    const showBoss = !!boss && !(hud.bossTitleAlpha > 0);
    U.bossK += ((showBoss ? 1 : 0) - U.bossK) * k(0.18);
    if (boss) {
      U.boss += (bossT - U.boss) * k(0.07);
      U.bossTrail = bossT > U.bossTrail ? bossT : U.bossTrail + (U.boss - U.bossTrail) * k(0.6);
    } else if (U.bossK < 0.02) {
      U.boss = U.bossTrail = 1;
    }

    ctx.save();
    ctx.textBaseline = 'middle';

    // Номер волны сверху по центру: тонкие линии, ромб и подпись. Пока идёт бой с боссом, на его месте полоса босса.
    const top = ins.top + (hud.gameMode ? 0 : 52); // в «Тестировании» сверху кнопка ⚙ и FPS
    const waveA = 1 - U.bossK;
    if (hud.wave !== undefined && waveA > 0.02) {
      const y0 = top + 24;
      const label = (hud.crash ? 'КРАШ-ТЕСТ ' : 'ВОЛНА ') + hud.wave;
      ctx.globalAlpha = waveA;
      ctx.font = '500 17px ' + SERIF;
      ctx.fillStyle = 'rgba(6,10,22,0.55)';
      this.tracked(label, cx + 1, y0 + 1, 3.2, 'center');
      ctx.fillStyle = C.hud;
      const tw = this.tracked(label, cx, y0, 3.2, 'center');
      this.hairline(cx - tw / 2 - 16, cx - tw / 2 - 70, y0 + 1, 0.38);
      this.hairline(cx + tw / 2 + 16, cx + tw / 2 + 70, y0 + 1, 0.38);
      this.hairline(cx - 10, cx - 78, y0 + 17, 0.32);
      this.hairline(cx + 10, cx + 78, y0 + 17, 0.32);
      this.rhomb(cx, y0 + 17.5, 3.5, null);
      ctx.fillStyle = C.hud;
      if (hud.crash) {
        ctx.globalAlpha = waveA * 0.7;
        ctx.font = 'italic 12px ' + SERIF;
        this.tracked('врагов ' + hud.alive + (hud.cap ? ' / потолок ' + hud.cap : ''), cx, y0 + 36, 0.6, 'center');
        if (hud.crashResult) {
          ctx.fillStyle = C.hurt;
          this.tracked(hud.crashResult, cx, y0 + 52, 0.4, 'center');
        }
      } else if (hud.waveLeft >= 0 && !hud.intermission) {
        ctx.globalAlpha = waveA * 0.62;
        ctx.font = 'italic 12px ' + SERIF;
        this.tracked('осталось ' + hud.waveLeft, cx, y0 + 36, 0.6, 'center');
      }
      ctx.globalAlpha = 1;
    }

    // Босс: имя и красная полоса с ромбами по краям.
    if (U.bossK > 0.02 && boss) {
      const bw = Math.min(w - 2 * (ins.left + 70), 340);
      const x = cx - bw / 2;
      const y = top + 40;
      ctx.globalAlpha = U.bossK;
      ctx.fillStyle = C.hud;
      const name = String(boss.def && (boss.def.title || boss.def.name) || '').toUpperCase();
      ctx.font = '500 13px ' + SERIF;
      const nameW = ctx.measureText(name).width + 3 * (name.length - 1);
      const ns = Math.max(0.6, Math.min(1, (bw - 8) / Math.max(1, nameW))); // длинное имя ужимаем, чтобы не наезжало на соседей
      ctx.font = '500 ' + Math.max(9, Math.round(13 * ns)) + 'px ' + SERIF;
      const tw = this.tracked(name, cx, y - 14, 3 * ns, 'center');
      this.hairline(cx - tw / 2 - 12, x + 4, y - 13, 0.34);
      this.hairline(cx + tw / 2 + 12, x + bw - 4, y - 13, 0.34);
      ctx.fillStyle = 'rgba(5,9,20,0.78)';
      ctx.fillRect(x, y, bw, 7);
      ctx.fillStyle = 'rgba(255,190,180,0.55)';
      ctx.fillRect(x, y, bw * U.bossTrail, 7);
      ctx.fillStyle = '#d63f3a';
      ctx.fillRect(x, y, bw * U.boss, 7);
      ctx.fillStyle = 'rgba(255,140,125,0.55)';
      ctx.fillRect(x, y, bw * U.boss, 2.5);
      ctx.strokeStyle = 'rgba(190,215,250,0.4)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 0.5, y - 0.5, bw + 1, 8);
      this.rhomb(x - 8, y + 3.5, 3.5, null);
      this.rhomb(x + bw + 8, y + 3.5, 3.5, null);
      this.rhomb(cx, y + 13, 3.5, null);
      ctx.globalAlpha = 1;
    }

    // Счёт (убитые) справа сверху: огранённый камень и число. В режиме «Тестирование» отступаем от кнопки ⚙ и FPS.
    {
      const rx = w - ins.right - 16;
      const y = top + 26;
      ctx.font = '500 22px ' + SERIF;
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(6,10,22,0.55)';
      ctx.fillText(String(hud.kills), rx + 1, y + 1);
      ctx.fillStyle = C.hud;
      ctx.fillText(String(hud.kills), rx, y);
      const gx = rx - ctx.measureText(String(hud.kills)).width - 14;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5;
      ctx.drawImage(this.getGlow(), gx - 16, y - 16, 32, 32);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.beginPath();
      ctx.moveTo(gx, y - 9);
      ctx.lineTo(gx + 7, y);
      ctx.lineTo(gx, y + 9);
      ctx.lineTo(gx - 7, y);
      ctx.closePath();
      ctx.fillStyle = '#e8943a';
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(gx, y - 9);
      ctx.lineTo(gx + 7, y);
      ctx.lineTo(gx, y);
      ctx.closePath();
      ctx.fillStyle = '#ffd79a';
      ctx.fill();
    }

    // Опыт: тонкая полоса у нижней кромки, уровень слева над ней. Здоровье и перезарядки рисуются у героя (drawHeroArcs).
    const rowY = h - ins.bottom - 44;
    const bx = ins.left + 16;
    const bwid = w - ins.left - ins.right - 32;
    this.drawBar(bx, h - ins.bottom - 8, bwid, 3, U.xp, U.xp, hud.xpMax ? C.accent : '#4f93ee', hud.xpMax ? '#ffe0b0' : '#a9d3ff', null, 0);
    ctx.font = 'italic 12px ' + SERIF;
    ctx.fillStyle = C.hud;
    ctx.globalAlpha = 0.7;
    ctx.textAlign = 'left';
    ctx.fillText(hud.xpMax ? 'макс.' : 'ур. ' + (hud.level || 1), bx, h - ins.bottom - 22);
    ctx.globalAlpha = 1;

    // Три слота умений по центру: снежинка, вихрь, пламя. Умения будут разные; пока это заглушки.
    this.drawAbility(cx - 64, rowY, 1, '#6fb6ff', '#d6efff', 0, U.slots[0] > 0.01, false, U.slots[0]);
    this.drawAbility(cx, rowY, 1, '#a98bff', '#e4d8ff', 1, U.slots[1] > 0.01, true, U.slots[1]);
    this.drawAbility(cx + 64, rowY, 1, '#ffb14a', '#ffe2b0', 2, U.slots[2] > 0.01, false, U.slots[2]);

    // Повышение уровня: надпись плавно гаснет.
    if (hud.levelFlash > 0) {
      const a = Math.min(1, hud.levelFlash);
      ctx.globalAlpha = a;
      ctx.font = '500 24px ' + SERIF;
      ctx.fillStyle = '#e8f1ff';
      const tw = this.tracked('УРОВЕНЬ ' + hud.level, cx, this.h * 0.4, 5, 'center');
      this.hairline(cx - tw / 2 - 14, cx - tw / 2 - 80, this.h * 0.4 + 1, 0.4);
      this.hairline(cx + tw / 2 + 14, cx + tw / 2 + 80, this.h * 0.4 + 1, 0.4);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    this.drawBossTitle(C);
    this.drawIntermission(C);
  }

  /** Полоса с тонкой рамкой, «следом урона» (trail) и ромбиками по краям. flash: мигание при малом здоровье, 0..1. */
  drawBar(x, y, w, hh, v, trail, col, light, trailCol, flash) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(5,9,20,0.78)';
    ctx.fillRect(x, y, w, hh);
    if (trailCol && trail > v) {
      ctx.fillStyle = trailCol;
      ctx.fillRect(x, y, w * trail, hh);
    }
    ctx.fillStyle = col;
    ctx.fillRect(x, y, w * v, hh);
    ctx.fillStyle = light;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(x, y, w * v, Math.max(1, hh * 0.3));
    if (flash > 0) {
      ctx.globalAlpha = flash * 0.35;
      ctx.fillStyle = '#ffd0c8';
      ctx.fillRect(x, y, w * v, hh);
    }
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(190,215,250,0.38)';
    ctx.strokeRect(x - 0.5, y - 0.5, w + 1, hh + 1);
    this.rhomb(x - 8, y + hh / 2, 3, null);
    this.rhomb(x + w + 8, y + hh / 2, 3, null);
  }

  /**
   * Ромб умения. frac: готовность 0..1 (заливка поднимается снизу), hot: умение сейчас действует, flash: вспышка нажатия.
   * kind: 0 блок (сфера), 1 рывок (шевроны), 2 умение (кристалл). glow: false или имя спрайта свечения.
   */
  drawAbility(cx, cy, frac, col, light, kind, hot, glow, flash) {
    const ctx = this.ctx;
    const R = 30;
    const ready = frac >= 0.999;
    const pulse = 0.5 + 0.5 * Math.sin(this.clock * 3 + kind);
    ctx.beginPath();
    ctx.moveTo(cx, cy - R);
    ctx.lineTo(cx + R, cy);
    ctx.lineTo(cx, cy + R);
    ctx.lineTo(cx - R, cy);
    ctx.closePath();
    ctx.fillStyle = 'rgba(7,12,26,0.74)';
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.globalAlpha = ready ? 0.26 : 0.34;
    ctx.fillStyle = col;
    ctx.fillRect(cx - R, cy + R - 2 * R * frac, 2 * R, 2 * R * frac);
    ctx.restore();
    if ((ready || hot) && glow !== undefined) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (hot ? 0.55 : 0.2 + 0.1 * pulse) + (flash || 0) * 0.4;
      ctx.drawImage(this.getGlow(glow === 'gold' ? 'gold' : glow === 'blue' ? 'blue' : glow === true ? true : undefined), cx - R * 1.5, cy - R * 1.5, R * 3, R * 3);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = ready || hot ? col : 'rgba(150,185,230,0.38)';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy - R * 0.82);
    ctx.lineTo(cx + R * 0.82, cy);
    ctx.lineTo(cx, cy + R * 0.82);
    ctx.lineTo(cx - R * 0.82, cy);
    ctx.closePath();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(190,215,250,0.2)';
    ctx.stroke();
    // Значок. Пока умение перезаряжается, он тусклый.
    ctx.globalAlpha = ready || hot ? 1 : 0.5;
    ctx.strokeStyle = hot ? light : ready ? col : '#9fb3cc';
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (kind === 0) { // снежинка
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = i * Math.PI / 3 - Math.PI / 2;
        ctx.moveTo(cx - Math.cos(a) * 11, cy - Math.sin(a) * 11);
        ctx.lineTo(cx + Math.cos(a) * 11, cy + Math.sin(a) * 11);
      }
      ctx.stroke();
    } else if (kind === 1) { // вихрь
      ctx.beginPath();
      ctx.arc(cx, cy, 10, 0.4, TAU - 0.5);
      ctx.arc(cx, cy, 5.5, TAU - 0.5, 0.9, true);
      ctx.stroke();
    } else { // пламя
      ctx.beginPath();
      ctx.moveTo(cx + 1, cy - 13);
      ctx.lineTo(cx + 9, cy + 1);
      ctx.lineTo(cx + 5, cy + 11);
      ctx.lineTo(cx - 5, cy + 11);
      ctx.lineTo(cx - 9, cy + 2);
      ctx.lineTo(cx - 3, cy - 3);
      ctx.closePath();
      ctx.globalAlpha *= 0.5;
      ctx.fill();
      ctx.globalAlpha = ready || hot ? 1 : 0.5;
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    ctx.globalAlpha = 1;
  }

  /** Имя босса при вступлении: засечный шрифт с разрядкой и линиями по сторонам. hud.bossTitleAlpha: 0..1. */
  drawBossTitle(C) {
    const hud = this.hud;
    if (!hud.bossTitle || !(hud.bossTitleAlpha > 0)) return;
    const ctx = this.ctx;
    const cx = this.w / 2;
    const y = this.h / 2 + 72;
    ctx.save();
    ctx.globalAlpha = Math.min(1, hud.bossTitleAlpha);
    ctx.textBaseline = 'middle';
    const text = hud.bossTitle.toUpperCase();
    let size = 30;
    ctx.font = '500 ' + size + 'px ' + SERIF;
    const sp = 6;
    const full = ctx.measureText(text).width + sp * (text.length - 1);
    size = Math.max(14, Math.floor(size * Math.min(1, (this.w * 0.86) / Math.max(1, full))));
    ctx.font = '500 ' + size + 'px ' + SERIF;
    ctx.fillStyle = '#e8f1ff';
    const tw = this.tracked(text, cx, y, sp * size / 30, 'center');
    const lw = Math.min(70, (this.w - tw) / 2 - 24);
    if (lw > 12) {
      this.hairline(cx - tw / 2 - 14, cx - tw / 2 - 14 - lw, y, 0.4);
      this.hairline(cx + tw / 2 + 14, cx + tw / 2 + 14 + lw, y, 0.4);
    }
    this.hairline(cx - 70, cx - 8, y + size * 0.9, 0.35);
    this.hairline(cx + 8, cx + 70, y + size * 0.9, 0.35);
    this.rhomb(cx, y + size * 0.9 + 0.5, 3.5, null);
    ctx.restore();
  }

  /** Передышка между волнами: крупная надпись по центру, гаснет к концу. */
  drawIntermission(C) {
    const hud = this.hud;
    if (!(hud.intermission > 0)) return;
    const ctx = this.ctx;
    const cx = this.w / 2;
    const y = this.h * 0.28;
    const t = Math.min(1, hud.intermission / Math.max(0.01, hud.intermissionTotal));
    ctx.save();
    ctx.globalAlpha = Math.min(1, t * 3);
    ctx.textBaseline = 'middle';
    ctx.font = '500 34px ' + SERIF;
    ctx.fillStyle = '#e8f1ff';
    const tw = this.tracked('ВОЛНА ' + hud.wave, cx, y, 7, 'center');
    this.hairline(cx - 12, cx - 12 - Math.min(90, tw / 2), y + 30, 0.4);
    this.hairline(cx + 12, cx + 12 + Math.min(90, tw / 2), y + 30, 0.4);
    this.rhomb(cx, y + 30.5, 4, '#ffb14a');
    if (hud.crash) {
      ctx.font = 'italic 14px ' + SERIF;
      ctx.fillStyle = C.hurt;
      this.tracked('краш-тест: врагов всё больше, смотри на FPS', cx, y + 54, 0.5, 'center');
    }
    ctx.restore();
  }

  /** Подсветка цели: новая цель разгорается за ~0.08 с, прежняя гаснет за ~0.1 с, без резкой смены. */
  updateTargetGlow(target, dt) {
    const T = this.tglow;
    if (target) {
      if (T.cur !== target) {
        T.prev = T.cur;
        T.prevK = T.curK;
        T.cur = target;
        T.curK = 0;
      }
      T.curK += (1 - T.curK) * (1 - Math.exp(-dt / 0.08));
    } else if (T.cur) {
      T.prev = T.cur;
      T.prevK = T.curK;
      T.cur = null;
      T.curK = 0;
    }
    T.prevK *= Math.exp(-dt / 0.1);
    if (T.prevK < 0.02) T.prev = null;
  }

  /**
   * Мягкое жёлтое свечение цели (спрайт золотого света, сложение цветов). over = false: подсветка под врагом,
   * true: слабый тон поверх, чтобы сам враг чуть теплел. Никаких линий и кругов с краем.
   */
  drawTargetGlow(alpha, over) {
    const T = this.tglow;
    const ctx = this.ctx;
    const pulse = 0.5 + 0.5 * Math.sin(this.clock * 5);
    let sprite = null;
    for (let i = 0; i < 2; i++) {
      const e = i === 0 ? T.cur : T.prev;
      const k = i === 0 ? T.curK : T.prevK;
      if (!e || !e.active || k < 0.02) continue;
      if (!sprite) {
        sprite = this.getGlow('gold');
        ctx.globalCompositeOperation = 'lighter';
      }
      const x = e.prevX + (e.x - e.prevX) * alpha;
      const y = e.prevY + (e.y - e.prevY) * alpha;
      const g = e.radius * (over ? 1.7 : 2.6 + 0.2 * pulse);
      ctx.globalAlpha = k * (over ? 0.15 : 0.4 + 0.08 * pulse);
      ctx.drawImage(sprite, x - g, y - g, g * 2, g * 2);
    }
    if (sprite) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }

  /** Удар по щиту: игра сообщает, откуда прилетело (sx, sy; не число: направление случайное) и было ли это парирование. */
  shieldHit(sx, sy, parried) {
    const S = this.shield;
    const a = Number.isFinite(sx) && Number.isFinite(sy) ? Math.atan2(sy - this.hero.y, sx - this.hero.x) : Math.random() * TAU;
    let r = S.rip[0];
    for (let i = 0; i < S.rip.length; i++) {
      if (!S.rip[i].on) {
        r = S.rip[i];
        break;
      }
    }
    r.on = true;
    r.a = a;
    r.t = 0;
    r.parry = !!parried;
    if (parried) S.flash = 1;
  }

  /**
   * Щит блока: светящаяся стеклянная сфера. Яркая кромка, вращающийся каркас-«глобус», блик света, свет на снегу
   * вокруг. В окне парирования золотая, потом плавно синеет. Появляется и гаснет плавно, перед концом мигает.
   * На удар и парирование: вспышка по сфере и яркое пятно на кромке там, откуда прилетело (shieldHit).
   */
  drawBlock(hx, hy, C) {
    const d = this.defense;
    if (!d) return;
    const S = this.shield;
    const dt = this.dt;
    const t = this.clock;
    const blocking = d.blocking;
    const parrying = blocking && d.parrying;
    S.k += ((blocking ? 1 : 0) - S.k) * (1 - Math.exp(-dt / (blocking ? 0.05 : 0.09)));
    S.pk += ((parrying ? 1 : 0) - S.pk) * (1 - Math.exp(-dt / (parrying ? 0.03 : 0.14)));
    S.flash = Math.max(0, S.flash - dt / 0.32);
    for (let i = 0; i < S.rip.length; i++) {
      const q = S.rip[i];
      if (q.on) {
        q.t += dt;
        if (q.t >= 0.45) q.on = false;
      }
    }
    if (S.k < 0.02) return;
    const ctx = this.ctx;
    const k = S.k;
    const pk = S.pk;
    let am = k;
    if (blocking) {
      const left = d.blockDuration - d.blockTime;
      if (left < 0.3 && Math.floor(left * 20) % 2 === 0) am *= 0.35; // блок вот-вот кончится: щит мигает
    }
    const R = d.blockRadius * (0.72 + 0.28 * k + 0.08 * S.flash) * (1 + 0.012 * Math.sin(t * 3));
    const cB = hexRgb(C.shield);
    const cBL = hexRgb(C.shieldLight);
    const cG = hexRgb(C.shieldParry);
    const cGL = hexRgb(C.shieldParryLight);
    const mx = (a, b) => [a[0] + (b[0] - a[0]) * pk, a[1] + (b[1] - a[1]) * pk, a[2] + (b[2] - a[2]) * pk];
    const col = mx(cB, cG);
    const lit = mx(cBL, cGL);
    const rgba = (c, a) => 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a.toFixed(3) + ')';

    ctx.save();
    ctx.translate(hx, hy);

    // Свет на снегу вокруг: синий и золотой смешиваются по фазе парирования.
    ctx.globalCompositeOperation = 'lighter';
    const gs = R * 1.75;
    if (pk < 0.98) {
      ctx.globalAlpha = am * (1 - pk) * (0.3 + 0.2 * S.flash);
      ctx.drawImage(this.getGlow('blue'), -gs, -gs, gs * 2, gs * 2);
    }
    if (pk > 0.02) {
      ctx.globalAlpha = am * pk * (0.4 + 0.2 * S.flash);
      ctx.drawImage(this.getGlow('gold'), -gs, -gs, gs * 2, gs * 2);
    }
    ctx.globalCompositeOperation = 'source-over';

    // Тело: почти прозрачное в середине, плотнее и ярче к краю (как у стекла).
    const gr = ctx.createRadialGradient(-R * 0.25, -R * 0.3, R * 0.05, 0, 0, R);
    gr.addColorStop(0, rgba(lit, 0.17));
    gr.addColorStop(0.55, rgba(col, 0.07));
    gr.addColorStop(0.86, rgba(col, 0.2));
    gr.addColorStop(1, rgba(lit, 0.5));
    ctx.globalAlpha = am;
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.fill();

    // Каркас: три вращающихся меридиана и экватор, поэтому сфера читается объёмом.
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(lit, 0.32);
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(0, 0, Math.max(0.5, R * Math.abs(Math.cos(t * 0.7 + i * 1.0472))), R, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.strokeStyle = rgba(lit, 0.24);
    ctx.beginPath();
    ctx.ellipse(0, 0, R, R * 0.3, -0.35, 0, TAU);
    ctx.stroke();

    // Блик света слева сверху (свет в игре падает оттуда) и маленький отсвет с обратной стороны.
    ctx.save();
    ctx.translate(-R * 0.36, -R * 0.42);
    ctx.rotate(-0.6);
    ctx.scale(1, 0.5);
    const sg = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.34);
    sg.addColorStop(0, 'rgba(255,255,255,0.7)');
    sg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.34, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = rgba(lit, 0.4);
    ctx.beginPath();
    ctx.arc(R * 0.46, R * 0.5, R * 0.05, 0, TAU);
    ctx.fill();

    // Кромка: мягкое внешнее свечение, чёткая линия, ярче на освещённой стороне.
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.lineWidth = 5;
    ctx.strokeStyle = rgba(col, 0.16);
    ctx.stroke();
    ctx.lineWidth = 1.5 + 1.3 * pk;
    ctx.strokeStyle = rgba(lit, 0.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, R, Math.PI * 0.95, Math.PI * 1.55);
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.stroke();

    // Вспышка на парировании: вся сфера наливается светом.
    ctx.globalCompositeOperation = 'lighter';
    if (S.flash > 0) {
      ctx.globalAlpha = am * 0.3 * S.flash;
      ctx.fillStyle = rgba(cGL, 1);
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, TAU);
      ctx.fill();
    }
    // Отклики на удары: пятно света на кромке и дуга, разбегающаяся в стороны.
    for (let i = 0; i < S.rip.length; i++) {
      const q = S.rip[i];
      if (!q.on) continue;
      const p = q.t / 0.45;
      const ex = Math.cos(q.a) * R * 0.97;
      const ey = Math.sin(q.a) * R * 0.97;
      const gl = this.getGlow(q.parry ? 'gold' : 'blue');
      const g2 = R * (0.75 - 0.25 * p);
      ctx.globalAlpha = am * (1 - p) * 0.95;
      ctx.drawImage(gl, ex - g2, ey - g2, g2 * 2, g2 * 2);
      const spread = 0.35 + 0.9 * p;
      ctx.globalAlpha = am * (1 - p);
      ctx.lineWidth = 3.2 * (1 - p) + 0.8;
      ctx.strokeStyle = q.parry ? 'rgba(255,240,170,1)' : 'rgba(210,238,255,1)';
      ctx.beginPath();
      ctx.arc(0, 0, R, q.a - spread, q.a + spread);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Герой-молния: яркий шар с ореолом. */
  drawLightHero(ctx, hx, hy) {
    const col = this.cfg.lightdash.color;
    const r = this.hero.radius;
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(hx, hy, r * 2.2, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(hx, hy, r * 0.9, 0, TAU);
    ctx.fill();
  }

  /** Отрезки молнии: ломаная с дрожью (зависит от времени, поэтому мерцает), гаснет за 0.25 с. */
  drawBolts(ctx) {
    const ld = this.lightdash;
    if (!ld || !ld.bolts.length) return;
    const col = this.cfg.lightdash.color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 0; i < ld.bolts.length; i++) {
      const b = ld.bolts[i];
      const k = Math.max(0, 1 - b.age / 0.25);
      const dx = b.x1 - b.x0;
      const dy = b.y1 - b.y0;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const seg = Math.max(3, Math.round(len / 28));
      const frame = Math.floor(this.clock * 30);
      for (let pass = 0; pass < 2; pass++) {
        ctx.globalAlpha = k * (pass ? 1 : 0.45);
        ctx.strokeStyle = pass ? '#ffffff' : col;
        ctx.lineWidth = pass ? 2 : 7;
        ctx.beginPath();
        ctx.moveTo(b.x0, b.y0);
        for (let s = 1; s < seg; s++) {
          const f = s / seg;
          const j = Math.sin((s * 12.9898 + i * 78.233 + frame * 3.7) * 43758.5453) * 11;
          ctx.lineTo(b.x0 + dx * f + nx * j, b.y0 + dy * f + ny * j);
        }
        ctx.lineTo(b.x1, b.y1);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.lineCap = 'butt';
  }

  /** Костры огненного шлейфа: тёплое пятно с мерцающим язычком, к концу жизни гаснет. */
  drawFires(ctx) {
    const fs = this.fires;
    if (!fs.length) return;
    const F = this.cfg.firedash;
    const t = this.clock;
    for (let i = 0; i < fs.length; i++) {
      const f = fs[i];
      const k = 1 - f.age / F.fireLife;
      const fl = 0.8 + 0.2 * Math.sin(t * 17 + i * 1.9);
      ctx.globalAlpha = 0.28 * Math.min(1, k * 2);
      ctx.fillStyle = F.color;
      ctx.beginPath();
      ctx.arc(f.x, f.y, F.fireRadius * (0.8 + 0.2 * k), 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.75 * Math.min(1, k * 2);
      ctx.fillStyle = '#ffd36a';
      ctx.beginPath();
      ctx.arc(f.x, f.y - 3 * fl, F.fireRadius * 0.38 * fl * (0.5 + 0.5 * k), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /** Смертельная аура: мягкое поле с пульсацией на тике и медленно бегущим пунктирным краем. */
  drawAura(ctx, hx, hy) {
    const au = this.aura;
    if (!au || !au.active) return;
    const R = au.radius;
    const col = this.cfg.aura.color;
    const t = this.clock;
    ctx.save();
    ctx.translate(hx, hy);
    ctx.globalAlpha = 0.1 + 0.1 * au.pulse;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.5 + 0.3 * au.pulse;
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 8]);
    ctx.lineDashOffset = -t * 18;
    ctx.beginPath();
    ctx.arc(0, 0, R * (1 + 0.02 * au.pulse), 0, TAU);
    ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** Лучи лазера: цветное свечение, светлая сердцевина; большой (9+ снарядов) толще и ярче, к концу гаснет. */
  drawLasers(ctx) {
    const ls = this.lasers;
    if (!ls || !ls.length) return;
    const L = this.cfg.laser;
    ctx.lineCap = 'round';
    for (const l of ls) {
      const fade = Math.min(1, (l.life - l.age) / 0.25);
      l.pulse = Math.max(0, l.pulse - 0.06);
      const x1 = l.x + l.dx * l.len;
      const y1 = l.y + l.dy * l.len;
      const w = l.width * (1 + l.pulse * 0.25);
      const glow = l.big ? 2.6 : 1.7;
      const lc = l.gen ? this.cfg.phantom.color : L.color; // фантомный луч фиолетовый
      ctx.globalAlpha = fade * (l.big ? 0.4 : 0.25);
      ctx.strokeStyle = lc;
      ctx.lineWidth = w * glow;
      ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.globalAlpha = fade * (l.big ? 0.95 : 0.7);
      ctx.strokeStyle = lc;
      ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.globalAlpha = fade;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = w * (l.big ? 0.6 : 0.35);
      ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(x1, y1); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.lineCap = 'butt';
  }

  /** Дробь: все дробинки одним путём и одной заливкой, без объектов и градиентов. */
  drawPellets(ctx, alpha, viewL, viewR, viewT, viewB) {
    const P = this.pellets;
    if (!P || !P.n) return;
    const S = this.cfg.shot;
    const r = S.radius;
    const d = r * 2;
    ctx.fillStyle = S.color;
    ctx.beginPath();
    for (let i = 0; i < P.n; i++) {
      const x = P.px[i] + (P.x[i] - P.px[i]) * alpha;
      const y = P.py[i] + (P.y[i] - P.py[i]) * alpha;
      if (x < viewL - 8 || x > viewR + 8 || y < viewT - 8 || y > viewB + 8) continue;
      ctx.rect(x - r, y - r, d, d);
    }
    ctx.fill();
  }

  /** Спектральные клинки: голубые треугольники (с Лазером сферы), остриём по ходу полёта (на орбите остриём наружу). */
  drawBlades(ctx) {
    const bl = this.blades;
    if (!bl || !bl.length) return;
    const B = this.cfg.blades;
    const s = B.size;
    ctx.fillStyle = B.color;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.2;
    for (const b of bl) {
      ctx.fillStyle = b.gen ? this.cfg.phantom.color : B.color; // фантомные клинки фиолетовые
      if (b.sphere) { // с Лазером клинки это сферы
        ctx.beginPath();
        ctx.arc(b.x, b.y, s * (b.state === 'fire' ? 1.1 : 0.9), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        continue;
      }
      const a = b.a;
      const c = Math.cos(a);
      const n = Math.sin(a);
      ctx.beginPath();
      ctx.moveTo(b.x + c * s * 1.6, b.y + n * s * 1.6);
      ctx.lineTo(b.x - c * s - n * s * 0.9, b.y - n * s + c * s * 0.9);
      ctx.lineTo(b.x - c * s + n * s * 0.9, b.y - n * s - c * s * 0.9);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  /** Облака пара на земле: мягкое пятно с медленно ползущими клубами, к концу жизни тает. */
  drawClouds(ctx) {
    const cl = this.clouds;
    if (!cl.length) return;
    const st = this.cfg.steam;
    for (const c of cl) {
      const life = c.age / st.duration;
      const fade = Math.min(1, (1 - life) * 4); // последняя четверть жизни: тает
      const grow = Math.min(1, c.age / 0.25 + 0.3); // в начале быстро расползается
      const R = st.radius * grow;
      const gr = ctx.createRadialGradient(c.x, c.y, R * 0.1, c.x, c.y, R);
      gr.addColorStop(0, 'rgba(225,236,247,0.42)');
      gr.addColorStop(0.7, 'rgba(210,225,240,0.26)');
      gr.addColorStop(1, 'rgba(200,218,236,0)');
      ctx.globalAlpha = fade;
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(c.x, c.y, R, 0, TAU);
      ctx.fill();
      // клубы
      ctx.fillStyle = 'rgba(235,243,250,0.16)';
      for (let i = 0; i < 4; i++) {
        const a = c.seed + i * 1.57 + c.age * 0.5 * (i % 2 ? 1 : -1);
        const d = R * (0.35 + 0.15 * Math.sin(c.age * 1.3 + i));
        ctx.beginPath();
        ctx.arc(c.x + Math.cos(a) * d, c.y + Math.sin(a) * d, R * 0.3, 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}
