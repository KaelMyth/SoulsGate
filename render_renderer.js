// Отрисовка на Canvas 2D: цветные фигуры вместо арта.
// Мир рисуется с интерполяцией между прошлым и текущим шагом логики (alpha из цикла).

import { getTelegraph } from './systems_attacks.js';
import { HitFx } from './render_hitfx.js';
import { DashFx } from './render_dashfx.js';
import { ApotheosisArt } from './render_apotheosis.js';

const TAU = Math.PI * 2;
// Цвета молнии по стихиям: 0 жёлтая, 1 огонь (оранжевая), 2 мороз (синяя), 3 все три (белая).
const ZAP_RGB = ['255,225,70', '255,150,50', '110,205,255', '255,255,255'];
const LASER_RGB = ['110,205,255', '255,140,50', '150,242,255', '236,242,252', '190,120,255']; // луч: синий, огонь, мороз, пар, фантом
const LASER_CORE = ['232,248,255', '255,240,200', '240,252,255', '255,255,255', '248,232,255'];
const ZAP_CORE = ['255,252,225', '255,236,200', '232,248,255', '255,255,255'];
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
    this.apostles = deps.apostles || null;
    this.apotheosis = deps.apotheosis || null;
    this.getPortal = deps.getPortal || null; // () => портал финального босса или null
    this.effects = deps.effects || EMPTY;
    this.gems = deps.gems || EMPTY;
    this.autoattack = deps.autoattack || null;
    this.defense = deps.defense || null;
    this.boss = deps.boss || null; // разломы, телеграфы и взрыв босса (systems_boss.js)
    this.clouds = deps.clouds || [];
    this.lasers = deps.lasers || [];
    this.blades = deps.blades || [];
    this.aura = deps.aura || null;
    this.lightdash = deps.lightdash || null;
    this.zapBolts = deps.zapBolts || [];
    this.dashBeams = deps.dashBeams || [];
    this.fires = deps.fires || [];
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
    this.stripIce = null;         // то же, холодная: телеграфы Тартаса
    this.dust = null;             // спрайт облачка пыли
    this.dt = 0;                  // сколько секунд прошло с прошлого кадра: для пыли (только вид)
    this.puffs = [];              // облачка пыли при торможении быка; пул фиксированного размера
    for (let i = 0; i < 48; i++) this.puffs.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 1, size: 8 });
    this.apoArt = new ApotheosisArt(this); // Апофеоз и апостолы: маска-солнце и мантии (render_apotheosis.js)
    this.dashfx = new DashFx(this); // эффекты рывков, костров и героя-молнии (render_dashfx.js)
    this.dashKind = 0;     // стихия кинетического рывка (0 нет, 1 огонь, 2 мороз, 3 пар): выставляет игра
    this.dashKinetic = false;
    this.hitfx = new HitFx(this); // частицы попаданий по врагам (render_hitfx.js)
    this.beetleState = new WeakMap();
    this.fxSeed = new WeakMap(); // зерно врага для внешнего вида его состояний (лёд, огонь) // у каждого жука свой угол поворота и фаза анимации (только для вида)
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
      if (z.poly) { // ломаный остров: плоская верхняя сторона, три другие рваные
        ctx.moveTo(z.poly[0].x, z.poly[0].y);
        for (let i = 1; i < z.poly.length; i++) ctx.lineTo(z.poly[i].x, z.poly[i].y);
        ctx.closePath();
      } else ctx.rect(z.left, z.top, z.right - z.left, z.bottom - z.top);
      ctx.fill('evenodd');
      ctx.globalAlpha = 1;
      ctx.lineWidth = 3;
      ctx.strokeStyle = C.snowLight;
      if (z.poly) ctx.stroke();
      else ctx.strokeRect(z.left, z.top, z.right - z.left, z.bottom - z.top);
      ctx.restore();
    }

    this.drawSnow(ctx, viewL, viewR, viewT, viewB);

    const hx = hero.prevX + (hero.x - hero.prevX) * alpha;
    const hy = hero.prevY + (hero.y - hero.prevY) * alpha;

    // Дальность автоатаки: еле заметное кольцо, по нему видно, кого герой достанет.
    if (hero.active && !(this.hud && this.hud.gameMode)) {
      ctx.beginPath();
      ctx.arc(hx, hy, this.cfg.attack.radius * (this.autoattack ? this.autoattack.rangeMul || 1 : 1), 0, TAU);
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
    this.drawApostles(C);
    this.drawPortal();
    this.drawHands();
    this.drawCrumble();
    this.drawGrip(viewL, viewR, viewT, viewB);
    this.drawFog();

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
    this.hitfx.draw(ctx, this.dt);
    this.drawBeams();

    this.drawTargetGlow(alpha, true);

    if (hero.active) {
      this.drawAura(ctx, hx, hy);
      this.dashfx.frame(ctx, this.dt, hx, hy);
      if (this.lightdash && this.lightdash.active) this.drawLightHero(ctx, hx, hy); // рывок-молния: герой превращается в молнию
      else this.drawHero(hx, hy, C);
      this.drawBlock(hx, hy, C);
      this.drawHeroArcs(hx, hy, C);
    }

    this.drawFlash(viewL, viewR, viewT, viewB);
    this.drawOmni();
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

    this.drawNegative(viewL, viewR, viewT, viewB);

    // Стик и HUD рисуем в экранных координатах (px), поверх мира.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawStick(C);
    this.drawHud(C);
    this.drawPortalArrow();
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
   * Земля Тартаса: всё, что босс кладёт на пол, в ледяном стиле. Данные из systems_boss.js:
   * fissures (разломы), tele (линия рывка), blast (область взрыва), blades (клинки), state/enemy (круг призыва).
   */
  /**
   * ЗАГЛУШКА ГРАФИКИ: умение Апофеоза «Руки». По бокам острова чёрные худые руки (тонкая линия и квадратная ладонь), на очереди
   * полоса с красным телеграфом, упавшая полоса закрашена чёрным и тает. Всё внутри острова обрезано по его кромке.
   */
  drawHands() {
    const a = this.apotheosis;
    const z = this.arena.zone;
    if (!a || !z || !a.hands.length) return;
    const ctx = this.ctx;
    const H = a.H;
    if (!H) return;
    const e = a.emerge;
    // Руки по бокам: вылезают наружу из пустоты, тянутся к своей полосе.
    ctx.save();
    ctx.strokeStyle = '#07070b';
    ctx.fillStyle = '#07070b';
    ctx.lineCap = 'round';
    for (let i = 0; i < a.hands.length; i++) {
      const b = a.hands[i];
      if (b.state === 4) continue;
      const cy = (b.y0 + b.y1) / 2;
      const edge = b.side < 0 ? z.left : z.right;
      const reach = b.state === 2 ? 1 : b.state === 1 ? 0.85 : 0.55;
      const palmX = edge + b.side * (230 - 200 * e * reach);
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.moveTo(edge + b.side * 420, cy + 120);
      ctx.lineTo(edge + b.side * 320, cy + 40 * (1 - e));
      ctx.lineTo(palmX, cy);
      ctx.stroke();
      ctx.fillRect(palmX - 22 * b.side - 22, cy - 34, 44, 68);
    }
    ctx.restore();
    // Полосы: клип по острову.
    ctx.save();
    ctx.beginPath();
    if (z.poly) {
      ctx.moveTo(z.poly[0].x, z.poly[0].y);
      for (let i = 1; i < z.poly.length; i++) ctx.lineTo(z.poly[i].x, z.poly[i].y);
      ctx.closePath();
    } else ctx.rect(z.left, z.top, z.right - z.left, z.bottom - z.top);
    ctx.clip();
    for (let i = 0; i < a.hands.length; i++) {
      const b = a.hands[i];
      if (b.state === 1) {
        const k = Math.min(1, b.t / Math.max(0.01, H.telegraph));
        ctx.fillStyle = 'rgba(190,30,40,' + (0.2 + 0.3 * k).toFixed(3) + ')';
        ctx.fillRect(z.left, b.y0, z.right - z.left, b.y1 - b.y0);
      } else if (b.state === 2 || b.state === 3) {
        const k = Math.min(1, b.t / Math.max(0.01, H.slamHold));
        ctx.fillStyle = 'rgba(5,5,9,' + (0.9 * (1 - 0.7 * k)).toFixed(3) + ')';
        ctx.fillRect(z.left, b.y0, z.right - z.left, b.y1 - b.y0);
      }
    }
    ctx.restore();
  }

  /**
   * ЗАГЛУШКА ГРАФИКИ: умение Апофеоза «Распад острова». Кусок поля: красный круг-телеграф, потом тёмный провал в пустоту
   * со светлым краем, потом зарастает. Всё обрезано по кромке острова.
   */
  drawCrumble() {
    const a = this.apotheosis;
    const z = this.arena.zone;
    if (!a || !z || !a.patches.length) return;
    const C = a.boss && a.boss.def.crumble;
    if (!C) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    if (z.poly) {
      ctx.moveTo(z.poly[0].x, z.poly[0].y);
      for (let i = 1; i < z.poly.length; i++) ctx.lineTo(z.poly[i].x, z.poly[i].y);
      ctx.closePath();
    } else ctx.rect(z.left, z.top, z.right - z.left, z.bottom - z.top);
    ctx.clip();
    for (let i = 0; i < a.patches.length; i++) {
      const p = a.patches[i];
      if (p.state === 3) continue;
      ctx.beginPath();
      if (p.state === 0) {
        const k = Math.min(1, p.t / Math.max(0.01, C.telegraph));
        ctx.arc(p.x, p.y, p.r, 0, TAU);
        ctx.fillStyle = 'rgba(190,30,40,' + (0.15 + 0.3 * k).toFixed(3) + ')';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * k, 0, TAU);
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(255,110,110,0.8)';
        ctx.stroke();
      } else {
        const al = p.state === 2 ? 1 - Math.min(1, p.t / Math.max(0.01, C.fadeTime)) : 1;
        ctx.arc(p.x, p.y, p.r, 0, TAU);
        ctx.fillStyle = 'rgba(6,5,12,' + (0.95 * al).toFixed(3) + ')';
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(200,190,230,' + (0.7 * al).toFixed(3) + ')';
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /**
   * ЗАГЛУШКА ГРАФИКИ: умение Апофеоза «Лучи». Из центра головы-солнца по каждому её лучу: тонкая красная линия (телеграф),
   * потом толстый золотой луч с белой серединой. Углы те же, что у острий головы (apotheosis.beamAngles()).
   */
  drawBeams() {
    const a = this.apotheosis;
    if (!a || !a.boss || (a.state !== 'beams-tele' && a.state !== 'beams-fire')) return;
    const B = a.boss.def.beams;
    const o = a.headPos();
    const ang = a.beamAngles();
    const ctx = this.ctx;
    ctx.save();
    ctx.lineCap = 'butt';
    for (let i = 0; i < ang.length; i++) {
      const ex = o.x + Math.cos(ang[i]) * B.length;
      const ey = o.y + Math.sin(ang[i]) * B.length;
      ctx.beginPath();
      ctx.moveTo(o.x, o.y);
      ctx.lineTo(ex, ey);
      if (a.state === 'beams-tele') {
        const k = Math.min(1, a.t / Math.max(0.01, B.telegraph));
        ctx.lineWidth = 2 + 2 * k;
        ctx.strokeStyle = 'rgba(255,70,70,' + (0.25 + 0.5 * k).toFixed(3) + ')';
        ctx.stroke();
      } else {
        ctx.lineWidth = B.width;
        ctx.strokeStyle = 'rgba(255,205,80,0.8)';
        ctx.stroke();
        ctx.lineWidth = B.width * 0.35;
        ctx.strokeStyle = 'rgba(255,255,235,0.95)';
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /**
   * ЗАГЛУШКА ГРАФИКИ: умение Апофеоза «Вспышка». Зарядка: голова разгорается, экран темнеет; вспышка: белый экран. Рисуется по всему
   * видимому полю (границы кадра в мировых координатах).
   */
  drawFlash(l, r, t, b) {
    const a = this.apotheosis;
    if (!a || !a.boss || (a.flashDim <= 0 && a.flashWhite <= 0 && a.state !== 'flash-charge')) return;
    const ctx = this.ctx;
    ctx.save();
    if (a.flashDim > 0) {
      ctx.fillStyle = 'rgba(2,2,14,' + a.flashDim.toFixed(3) + ')';
      ctx.fillRect(l - 20, t - 20, r - l + 40, b - t + 40);
    }
    if (a.state === 'flash-charge') { // свечение головы растёт
      const o = a.headPos();
      const F = a.boss.def.flash;
      const k = Math.min(1, a.t / Math.max(0.01, F.charge));
      ctx.fillStyle = 'rgba(255,240,170,' + (0.25 + 0.5 * k).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(o.x, o.y, a.boss.radius * (0.5 + 0.9 * k), 0, TAU);
      ctx.fill();
    }
    if (a.flashWhite > 0) {
      ctx.fillStyle = 'rgba(255,250,225,' + (0.9 * a.flashWhite).toFixed(3) + ')';
      ctx.fillRect(l - 20, t - 20, r - l + 40, b - t + 40);
    }
    ctx.restore();
  }

  /**
   * ЗАГЛУШКА ГРАФИКИ: «Превращение» Апофеоза. Руки из краёв экрана тянутся к центру клочка и хватают его; когда рвут,
   * расходятся к краям, а по клочку бегут трещины. Края экрана берутся из границ кадра (l, r, t, b) в мировых координатах.
   */
  drawGrip(l, r, t, b) {
    const a = this.apotheosis;
    const f = a && a.tf;
    if (!f || (a.state !== 'tf-grab' && a.state !== 'tf-turn' && a.state !== 'tf-tear')) return;
    const T = a.boss.def.transform;
    const ctx = this.ctx;
    const reach = f.handK * (1 - f.apart);
    ctx.save();
    ctx.strokeStyle = '#07070b';
    ctx.fillStyle = '#07070b';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const n = T.handCount;
    for (let i = 0; i < n; i++) {
      const ang = 0.35 + (i / n) * TAU;
      const dx = Math.cos(ang);
      const dy = Math.sin(ang);
      const tx = dx > 0 ? (r - f.cx) / dx : dx < 0 ? (l - f.cx) / dx : Infinity;
      const ty = dy > 0 ? (b - f.cy) / dy : dy < 0 ? (t - f.cy) / dy : Infinity;
      const far = Math.min(tx, ty) + 80; // за краем экрана
      const near = T.fragmentRadius * 0.35;
      const d = far + (near - far) * reach;
      const shake = a.state === 'tf-tear' ? 5 * Math.sin(this.clock * 40 + i * 2) : 0;
      const px = f.cx + dx * d + -dy * shake;
      const py = f.cy + dy * d + dx * shake;
      const mx = f.cx + dx * (d + far) / 2 + -dy * 26 * Math.sin(i * 1.7 + 1);
      const my = f.cy + dy * (d + far) / 2 + dx * 26 * Math.sin(i * 1.7 + 1);
      for (let pass = 0; pass < 2; pass++) { // сначала светлая кайма, чтобы рука читалась на тёмной пустоте, потом чёрная рука
        ctx.strokeStyle = pass ? '#07070b' : '#4a4468';
        ctx.fillStyle = ctx.strokeStyle;
        ctx.lineWidth = pass ? 16 : 22;
        ctx.beginPath();
        ctx.moveTo(f.cx + dx * far, f.cy + dy * far);
        ctx.lineTo(mx, my);
        ctx.lineTo(px, py);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(px, py, pass ? 20 : 25, 0, TAU);
        ctx.fill();
      }
      ctx.strokeStyle = '#07070b';
      ctx.fillStyle = '#07070b';
      ctx.lineWidth = 7;
      for (let k = -1; k <= 1; k++) { // пальцы
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px - dx * 26 + -dy * k * 16, py - dy * 26 + dx * k * 16);
        ctx.stroke();
      }
    }
    if (f.crack > 0) { // трещины по клочку
      ctx.strokeStyle = '#05050a';
      ctx.lineWidth = 3;
      for (let i = 0; i < 7; i++) {
        const ang = i * 0.9 + 0.2;
        ctx.beginPath();
        ctx.moveTo(f.cx, f.cy);
        ctx.lineTo(f.cx + Math.cos(ang) * T.fragmentRadius * 1.1 * f.crack, f.cy + Math.sin(ang) * T.fragmentRadius * 1.1 * f.crack);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /** ЗАГЛУШКА ГРАФИКИ: туман на платформе после «Превращения»: медленно плывущие бледные пятна, обрезаны по полю. */
  drawFog() {
    const a = this.apotheosis;
    const z = this.arena.zone;
    if (!a || !z || a.fog <= 0) return;
    const ctx = this.ctx;
    const cx = (z.left + z.right) / 2;
    const cy = (z.top + z.bottom) / 2;
    const zr = (z.right - z.left) / 2;
    ctx.save();
    ctx.beginPath();
    if (z.poly) {
      ctx.moveTo(z.poly[0].x, z.poly[0].y);
      for (let i = 1; i < z.poly.length; i++) ctx.lineTo(z.poly[i].x, z.poly[i].y);
      ctx.closePath();
    } else ctx.rect(z.left, z.top, z.right - z.left, z.bottom - z.top);
    ctx.clip();
    ctx.fillStyle = 'rgba(205,215,240,' + (0.22 * a.fog).toFixed(3) + ')';
    ctx.fillRect(z.left, z.top, z.right - z.left, z.bottom - z.top);
    for (let j = 0; j < 14; j++) {
      const ph = j * 2.4 + this.clock * (0.12 + (j % 3) * 0.05);
      const px = cx + Math.cos(ph) * zr * 0.65;
      const py = cy + Math.sin(ph * 0.8 + j) * zr * 0.65;
      ctx.fillStyle = 'rgba(235,240,255,' + (0.14 * a.fog).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(px, py, zr * (0.28 + 0.05 * (j % 4)), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  /** ЗАГЛУШКА ГРАФИКИ: негатив картинки мира (режим composite 'difference' с белым), доля apotheosis.negative. HUD не трогаем. */
  drawNegative(l, r, t, b) {
    const a = this.apotheosis;
    if (!a || a.negative <= 0) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'difference';
    ctx.globalAlpha = Math.min(1, a.negative);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(l - 20, t - 20, r - l + 40, b - t + 40);
    ctx.restore();
  }

  /**
   * ЗАГЛУШКА ГРАФИКИ: умение «Единство». Заряд: четыре цветных кольца (вера, правда, сила, любовь) сходятся к голове босса.
   */
  drawOmni() {
    const a = this.apotheosis;
    if (!a || !a.boss || a.state !== 'omni-charge') return;
    const o = a.headPos();
    const k = Math.min(1, a.t / Math.max(0.01, a.boss.def.omni.castTime));
    const cols = ['#ffffff', '#ffd24a', '#ff8a6a', '#ff9fcf'];
    const ctx = this.ctx;
    ctx.save();
    ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      ctx.globalAlpha = 0.5 + 0.5 * k;
      ctx.strokeStyle = cols[i];
      ctx.beginPath();
      ctx.arc(o.x, o.y, a.boss.radius * (2.6 - 1.5 * k) + i * 7, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** ЗАГЛУШКА ГРАФИКИ: портал перед финальным боссом, пульсирующие кольца. alpha растёт при открытии и падает при гашении. */
  drawPortal() {
    const p = this.getPortal ? this.getPortal() : null;
    if (!p || p.alpha <= 0) return;
    const ctx = this.ctx;
    const t = this.clock;
    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.strokeStyle = '#c7a8ff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * (1 + 0.06 * Math.sin(t * 4)), 0, TAU);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.setLineDash([10, 8]);
    ctx.lineDashOffset = -t * 30;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * 0.7, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = p.alpha * 0.35;
    ctx.fillStyle = '#7a4fd6';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * 0.55, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  /** ЗАГЛУШКА ГРАФИКИ: стрелка на краю экрана в сторону портала, пока самого портала не видно. */
  drawPortalArrow() {
    const p = this.getPortal ? this.getPortal() : null;
    if (!p || p.state !== 'open' || p.alpha <= 0) return;
    const cam = this.camera;
    const w = this.w;
    const h = this.h;
    const ins = this.hud && this.hud.insets ? this.hud.insets : { top: 0, bottom: 0, left: 0, right: 0 };
    const sx = w / 2 + (p.x - cam.x) * cam.scale;
    const sy = h / 2 + (p.y - cam.y) * cam.scale;
    const pad = 36;
    const pr = p.r * cam.scale;
    if (sx > -pr && sx < w + pr && sy > -pr && sy < h + pr) return; // портал в кадре
    const dx = sx - w / 2;
    const dy = sy - h / 2;
    const k = Math.min((w / 2 - pad) / Math.max(1e-6, Math.abs(dx)), (h / 2 - pad - Math.max(ins.top || 0, ins.bottom || 0)) / Math.max(1e-6, Math.abs(dy)));
    const ax = w / 2 + dx * k;
    const ay = h / 2 + dy * k;
    const ang = Math.atan2(dy, dx);
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = p.alpha * (0.75 + 0.25 * Math.sin(this.clock * 6));
    ctx.translate(ax, ay);
    ctx.rotate(ang);
    ctx.fillStyle = '#c7a8ff';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(-10, -13);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-10, 13);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  /**
   * ЗАГЛУШКА ГРАФИКИ: призыв апостолов, замах умений, золотые клинки, притяжение Силы. Круги, линии и кольца без деталей.
   * Данные из systems_apostles.js: state, t, corners, cast { e, kind, t }, pull { e }, blades, bladeCount, boost().
   */
  drawApostles(C) {
    const a = this.apostles;
    if (!a || a.state === 'off') return;
    const ctx = this.ctx;
    const A = a.A;
    if (!A) return;
    ctx.save();
    if (a.state === 'summon') { // круги по углам острова заполняются к появлению апостолов
      const k = Math.min(1, a.t / Math.max(0.01, A.castTime));
      ctx.strokeStyle = '#fff0b0';
      ctx.fillStyle = '#fff0b0';
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const c = a.corners[i];
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(c.x, c.y, 30, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 0.25 + 0.25 * k;
        ctx.beginPath();
        ctx.arc(c.x, c.y, 30 * k, 0, TAU);
        ctx.fill();
      }
    }
    if (a.cast && a.cast.e.active) { // замах умения: кольцо над апостолом сужается
      const e = a.cast.e;
      const k = Math.min(1, a.cast.t / Math.max(0.01, A.spellCast));
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = e.def.edge;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius * (3 - 2 * k), 0, TAU);
      ctx.stroke();
    }
    if (a.pull && a.pull.e.active) { // притяжение: линия от Силы к герою (отталкивание в негативе: голубая)
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = a.pull.push ? '#6ad0ff' : '#ff8a6a';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.moveTo(a.pull.e.x, a.pull.e.y);
      ctx.lineTo(this.hero.x, this.hero.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (a.loveT > 0) { // усилены Любовью: розовое кольцо вокруг остальных
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = '#ff9fcf';
      ctx.lineWidth = 2;
      const it = this.enemies ? this.enemies.items : null;
      if (it) for (let i = 0; i < it.length; i++) {
        const e = it[i];
        if (!e.active || !e.def || !e.def.apostle || e.def.apostle === 'love') continue;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.radius + 6, 0, TAU);
        ctx.stroke();
      }
    }
    // Выключенные апостолы (вторая фаза): тёмная оболочка лежит, тусклое кольцо мигает; в «Восстании» встаёт и светлеет.
    for (let i = 0; i < a.husks.length; i++) {
      const h = a.husks[i];
      const k = h.k;
      const e = k * k * (3 - 2 * k);
      const rr = h.def ? h.def.radius : 16;
      const shake = a.rise.state === 'stand' ? Math.sin(this.clock * 50 + i * 2) * 2 * (1 - e) : 0;
      this.apoArt.husk(ctx, h.x + shake, h.y, rr, h.kind, k, e, (1 - e) * (i % 2 ? 1.45 : -1.45)); // лежит боком, встаёт
      ctx.save();
      ctx.globalAlpha = 0.25 + 0.2 * Math.sin(this.clock * 2 + i) + 0.4 * e;
      ctx.strokeStyle = k > 0 ? '#ff6a6a' : '#707080';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.arc(h.x, h.y, rr * (1.6 + 0.6 * e), 0, TAU); // «выключено»: пунктир; встаёт: красное кольцо
      ctx.stroke();
      ctx.restore();
    }
    // Негатив, Вера: клинки с неба. Красный круг сужается к удару, сверху падает светлая полоса, после удара остаётся след.
    if (a.neg && a.rainCount > 0) {
      const R = a.N.rain;
      for (let i = 0; i < a.rainCount; i++) {
        const b = a.rain[i];
        if (b.state === 1) {
          const k = Math.min(1, b.t / Math.max(0.01, R.fall));
          ctx.globalAlpha = 0.35 + 0.4 * k;
          ctx.fillStyle = '#d2283a';
          ctx.beginPath();
          ctx.arc(b.x, b.y, R.radius, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 0.9;
          ctx.strokeStyle = '#ff9a9a';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(b.x, b.y, R.radius * (1.6 - 0.6 * k), 0, TAU);
          ctx.stroke();
          ctx.globalAlpha = 0.5 + 0.5 * k;
          ctx.strokeStyle = '#fff6c8';
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.moveTo(b.x, b.y - 520 * (1 - k));
          ctx.lineTo(b.x, b.y - 520 * (1 - k) + 140);
          ctx.stroke();
        } else if (b.state === 2) {
          const k = Math.min(1, b.t / Math.max(0.01, R.hold));
          ctx.globalAlpha = 0.8 * (1 - k);
          ctx.fillStyle = '#fff6c8';
          ctx.beginPath();
          ctx.arc(b.x, b.y, R.radius * (0.6 + 0.5 * k), 0, TAU);
          ctx.fill();
        }
      }
    }
    // Золотые клинки: ждущий висит ромбиком над головой, нацеленный показывает линию, вылетевший вспыхивает.
    for (let i = 0; i < a.bladeCount; i++) {
      const bl = a.blades[i];
      if (bl.state === 1) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ffd24a';
        ctx.beginPath();
        ctx.moveTo(bl.x1, bl.y1 - 8);
        ctx.lineTo(bl.x1 + 4, bl.y1);
        ctx.lineTo(bl.x1, bl.y1 + 8);
        ctx.lineTo(bl.x1 - 4, bl.y1);
        ctx.closePath();
        ctx.fill();
        if (bl.aimed) {
          ctx.globalAlpha = 0.55;
          ctx.strokeStyle = '#ffd24a';
          ctx.lineWidth = Math.max(2, bl.hw * 0.5);
          ctx.beginPath();
          ctx.moveTo(bl.x1, bl.y1);
          ctx.lineTo(bl.x2, bl.y2);
          ctx.stroke();
        }
      } else if (bl.state === 2 && bl.active) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#fff6c8';
        ctx.lineWidth = bl.hw * 1.2;
        ctx.beginPath();
        ctx.moveTo(bl.x1, bl.y1);
        ctx.lineTo(bl.x, bl.y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawBossGround(C) {
    const b = this.boss;
    if (!b) return;
    const ctx = this.ctx;
    const t = this.clock;
    const glow = this.getGlow('blue');

    // Призыв отряда: круг рун растёт от босса и заполняется светом к выходу бойцов.
    if (b.state === 'squadCast' && b.enemy) {
      const Q = b.enemy.def.cycle.squad;
      const k = Math.min(1, b.t / Math.max(0.01, Q.castTime));
      const r = b.enemy.radius + Q.ringGap;
      const ex = b.enemy.x;
      const ey = b.enemy.y;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.18 + 0.32 * k;
      ctx.drawImage(glow, ex - r * 1.5, ey - r * 1.5, r * 3, r * 3);
      ctx.globalAlpha = 0.5 + 0.3 * k;
      ctx.strokeStyle = C.tartasEye;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(ex, ey, r, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([5, 7]);
      ctx.lineDashOffset = t * 24;
      ctx.beginPath();
      ctx.arc(ex, ey, r * (0.55 + 0.45 * k), 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = C.tartasIceLight;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + t * 0.4;
        const px = ex + Math.cos(a) * r;
        const py = ey + Math.sin(a) * r;
        ctx.beginPath();
        ctx.moveTo(px + Math.cos(a) * 7, py + Math.sin(a) * 7);
        ctx.lineTo(px - Math.sin(a) * 4, py + Math.cos(a) * 4);
        ctx.lineTo(px + Math.sin(a) * 4, py - Math.cos(a) * 4);
        ctx.closePath();
        ctx.globalAlpha = 0.35 + 0.5 * k;
        ctx.fill();
      }
      ctx.restore();
    }

    // Разломы: рваная трещина в земле с ветвящимися трещинками и магическим светом внутри. Таят в конце цикла (fissureAlpha).
    if (b.fissures.length) {
      const fa = b.fissureAlpha();
      const puffG = this.getGlow('blue');
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let fi = 0; fi < b.fissures.length; fi++) {
        const f = b.fissures[fi];
        const G = this.fissureGeom(f, fi);
        const pulse = 0.75 + 0.25 * Math.sin(t * 3.2 + fi * 1.7);
        // Тёмная мягкая тень вокруг.
        ctx.globalAlpha = fa * 0.32;
        ctx.fillStyle = '#060b1a';
        this.fissurePoly(ctx, G.poly, 2.2);
        ctx.fill();
        // Сама пропасть: тёмный огранённый провал.
        ctx.globalAlpha = fa * 0.97;
        ctx.fillStyle = '#070c1c';
        this.fissurePoly(ctx, G.poly, 1);
        ctx.fill();
        // Ветви: тёмные жилы с сужающимся концом.
        ctx.strokeStyle = '#080d1e';
        for (const br of G.branches) {
          for (let i = 0; i < br.pts.length - 1; i++) {
            ctx.lineWidth = br.w * (1 - i / (br.pts.length - 1)) + 0.6;
            ctx.beginPath();
            ctx.moveTo(br.pts[i][0], br.pts[i][1]);
            ctx.lineTo(br.pts[i + 1][0], br.pts[i + 1][1]);
            ctx.stroke();
          }
        }
        ctx.globalCompositeOperation = 'lighter';
        // Магическое свечение: широкий мягкий ореол, потом ярче и уже.
        ctx.strokeStyle = '#6a7cff';
        ctx.globalAlpha = fa * 0.09 * pulse;
        ctx.lineWidth = f.hw * 3.4;
        this.strokePts(ctx, G.main);
        ctx.strokeStyle = '#7a9cff';
        ctx.globalAlpha = fa * 0.16 * pulse;
        ctx.lineWidth = f.hw * 1.5;
        this.strokePts(ctx, G.main);
        // Светящийся шов по краям провала (грань, обращённая к свету).
        ctx.globalAlpha = fa * 0.55;
        ctx.strokeStyle = '#9fd4ff';
        ctx.lineWidth = 1.1;
        this.fissurePoly(ctx, G.poly, 1);
        ctx.stroke();
        // Светящиеся жилы по ветвям.
        ctx.globalAlpha = fa * (0.3 + 0.15 * pulse);
        ctx.strokeStyle = '#8fb4ff';
        for (const br of G.branches) {
          ctx.lineWidth = Math.max(0.8, br.w * 0.35);
          this.strokePts(ctx, br.pts);
        }
        // Яркая сердцевина: тонкая линия и бегущие по ней вспышки энергии.
        ctx.globalAlpha = fa * 0.5;
        ctx.strokeStyle = '#b8d4ff';
        ctx.lineWidth = Math.max(0.9, f.hw * 0.13);
        this.strokePts(ctx, G.main);
        ctx.setLineDash([10, 46]);
        ctx.lineDashOffset = -t * 70 - fi * 13;
        ctx.globalAlpha = fa * 0.7;
        ctx.strokeStyle = '#eaf4ff';
        ctx.lineWidth = Math.max(1.1, f.hw * 0.2);
        this.strokePts(ctx, G.main);
        ctx.setLineDash([]);
        // Мерцающие огоньки: магические частицы поднимаются из трещины; дымка холода вдоль неё.
        const dx = f.x2 - f.x1;
        const dy = f.y2 - f.y1;
        const L = G.L;
        const motes = Math.max(3, Math.floor(L / 28));
        for (let i = 0; i < motes; i++) {
          const ph = (t * 0.55 + i * 0.173 + fi * 0.31) % 1;
          const u = (i * 0.618 + fi * 0.2) % 1;
          const wob = Math.sin(t * 2 + i * 3.1) * 3;
          const mx = f.x1 + dx * u + G.nx * G.off(u) + wob;
          const my = f.y1 + dy * u + G.ny * G.off(u) - ph * 26;
          const sz = 5 + 4 * (1 - ph);
          ctx.globalAlpha = fa * (1 - ph) * (0.35 + 0.3 * Math.sin(t * 9 + i));
          ctx.drawImage(puffG, mx - sz, my - sz, sz * 2, sz * 2);
        }
        const mists = Math.max(1, Math.floor(L / 80));
        for (let i = 0; i < mists; i++) {
          const u = (i + 0.5) / mists;
          const lift = (0.5 + 0.5 * Math.sin(t * 1.3 + i * 2 + fi)) * 8;
          ctx.globalAlpha = fa * 0.16;
          ctx.drawImage(glow, f.x1 + dx * u - 24, f.y1 + dy * u - 24 - lift, 48, 48);
        }
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.restore();
    }

    // Клинки (вторая атака). Ждущий клинок парит на кольце; линию на земле показывает только тот, чей прицел
    // уже зафиксирован (aimed): он вылетит следующим. Летящий: яркая чёрточка по ходу полёта.
    // Данные: b.blades[i] { x, y, x1, y1, x2, y2, dx, dy, hw, state, aimed }, b.bladeCount; state 1 ждёт, 2 летит, 3 закончил.
    if (b.bladeCount > 0) {
      const bl = b.blades;
      for (let i = 0; i < b.bladeCount; i++) {
        const q = bl[i];
        if (q.state !== 1 || !q.aimed) continue;
        const L = Math.hypot(q.x2 - q.x1, q.y2 - q.y1) || 1;
        this.drawSoftStrip({ length: L, width: q.hw * 2, dirX: (q.x2 - q.x1) / L, dirY: (q.y2 - q.y1) / L }, q.x1, q.y1, 0.7, true);
      }
      for (let i = 0; i < b.bladeCount; i++) {
        const q = bl[i];
        if (q.state === 3) continue;
        const flying = q.state === 2;
        const bob = flying ? 0 : Math.sin(t * 3 + i) * 2;
        ctx.save();
        ctx.translate(q.x - q.dy * bob, q.y + q.dx * bob);
        ctx.rotate(Math.atan2(q.dy, q.dx));
        ctx.scale(2, 2);
        if (!flying) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.55 + 0.2 * Math.sin(t * 5 + i);
          ctx.drawImage(glow, -30, -30, 60, 60);
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1;
        }
        if (flying) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = 'rgba(200,236,255,0.7)';
          ctx.beginPath();
          tracePoly(ctx, [0, -3.4, -70, -0.8, -70, 0.8, 0, 3.4], 1);
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.drawImage(glow, -24, -24, 48, 48);
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1;
        }
        ctx.beginPath();
        tracePoly(ctx, [-14, 0, -4, -4.5, 18, 0, -4, 4.5], 1);
        ctx.fillStyle = C.tartasBlade;
        ctx.fill();
        ctx.lineWidth = 0.9;
        ctx.strokeStyle = 'rgba(225,244,255,0.95)';
        ctx.stroke();
        ctx.beginPath();
        tracePoly(ctx, [-14, 0, -4, -4.5, 18, 0], 1);
        ctx.fillStyle = C.tartasIceLight;
        ctx.fill();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = flying ? 0.7 : 0.45;
        ctx.drawImage(glow, -16, -16, 32, 32);
        ctx.restore();
      }
    }

    // Линия рывка: холодная размытая полоса от босса через героя и дальше; к рывку наливается светом.
    const tl = b.tele;
    if (tl) {
      const L = Math.hypot(tl.x2 - tl.x1, tl.y2 - tl.y1) || 1;
      this.drawSoftStrip({ length: L, width: tl.hw * 2, dirX: (tl.x2 - tl.x1) / L, dirY: (tl.y2 - tl.y1) / L }, tl.x1, tl.y1, Math.min(1, tl.t / Math.max(0.01, tl.total)), true);
    }

    // Область взрыва: телеграф со светлой каймой, заполняется к центру, потом вспышка с холодным сиянием.
    const bl = b.blast;
    if (bl) {
      if (bl.phase === 'tele') {
        const k = Math.min(1, bl.t / Math.max(0.01, bl.total));
        ctx.save();
        this.polyPath(bl.poly, bl.x, bl.y, 1);
        ctx.fillStyle = 'rgba(120,185,250,0.13)';
        ctx.fill();
        ctx.lineJoin = 'round';
        ctx.lineWidth = 7;
        ctx.strokeStyle = 'rgba(150,205,255,0.12)';
        ctx.stroke();
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = 'rgba(214,238,255,' + (0.45 + 0.3 * Math.sin(t * 10) * k) + ')';
        ctx.stroke();
        this.polyPath(bl.poly, bl.x, bl.y, k);
        ctx.fillStyle = 'rgba(160,215,255,0.26)';
        ctx.fill();
        ctx.restore();
      } else {
        const f = 1 - Math.min(1, bl.t / Math.max(0.01, bl.total));
        ctx.save();
        ctx.globalAlpha = 0.25 + 0.7 * f;
        this.polyPath(bl.poly, bl.x, bl.y, 1);
        ctx.fillStyle = C.blastFill;
        ctx.fill();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.6 * f;
        ctx.lineWidth = 12;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#9fd8ff';
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  /** Освещение в системе героя: вектор на источник света (сверху-слева), повёрнутый в местные оси фигуры (поворот a). */
  localLight(a) {
    const c = Math.cos(a);
    const s = Math.sin(a);
    this.llx = LIGHT_X * c + LIGHT_Y * s;
    this.lly = -LIGHT_X * s + LIGHT_Y * c;
  }

  /** Огранённая деталь: основной цвет и тонкий светлый серп со стороны света (по местным осям, см. localLight). */
  bevel(pts, base, lite, d) {
    const ctx = this.ctx;
    ctx.beginPath();
    tracePoly(ctx, pts, 1);
    ctx.fillStyle = lite;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.translate(-this.llx * d, -this.lly * d);
    ctx.beginPath();
    tracePoly(ctx, pts, 1);
    ctx.fillStyle = base;
    ctx.fill();
    ctx.restore();
  }

  /**
   * Тартас, замёрзший рыцарь: вид сверху. Широкие плечи в наледи, шлем с холодным взглядом, ледяные шипы на спине,
   * плащ-лохмотья и ледяной меч, который по ходу атак меняет позу: замах назад на телеграфе рывка, выпад на рывке,
   * меч над головой на клинках, острие в землю при призыве отряда. Состояние читаем из this.boss (он же рисует землю).
   */
  drawTartas(e, x, y, hit) {
    const ctx = this.ctx;
    const C = this.cfg.render.colors;
    const t = this.clock;
    const dt = this.dt;
    const b = this.boss && this.boss.enemy === e ? this.boss : null;
    const bs = b ? b.state : 'idle';
    let st = this.beetleState.get(e);
    if (!st) {
      st = { a: Math.atan2(this.hero.y - y, this.hero.x - x), ph: Math.random() * TAU, wa: 0.5, step: 0, sx: x, sy: y, dashT: 9, ex: x, ey: y, t: t };
      this.beetleState.set(e, st);
    }
    if (t - st.t > 0.5) { st.sx = x; st.sy = y; st.dashT = 9; }
    st.t = t;
    const moving = e.hx !== 0 || e.hy !== 0;
    const dashing = bs === 'dash';
    if (dashing) {
      if (st.dashT > 0.5) { st.sx = x; st.sy = y; }
      st.dashT = 0;
    } else st.dashT += dt;
    const aiming = (bs === 'tele' || dashing) && b && b.line;
    const target = aiming ? Math.atan2(b.line.dy, b.line.dx) : moving ? Math.atan2(e.hy, e.hx) : Math.atan2(this.hero.y - y, this.hero.x - x);
    let da = (target - st.a) % TAU;
    if (da > Math.PI) da -= TAU;
    else if (da < -Math.PI) da += TAU;
    st.a += da * (dashing ? 0.9 : aiming ? 0.35 : 0.12);
    if (moving && !dashing) st.step += dt * 5;

    // Поза меча (угол от курса, по часовой) и накал глаз по состоянию босса.
    const raised = bs === 'bladeIn' || bs === 'bladeWave' || bs === 'bladeGap';
    let wa = 0.5 + 0.1 * Math.sin(st.step * 2);
    let heat = 0.35;
    let shake = 0;
    if (bs === 'tele') { wa = 2.7; heat = 0.8; shake = 0.05; }
    else if (dashing) { wa = 0; heat = 1; }
    else if (bs === 'gap') wa = 1.3;
    else if (bs === 'blastTele') { wa = 1.7; heat = 1; shake = 0.04; }
    else if (bs === 'blast') { wa = 0.2; heat = 1; }
    else if (bs === 'recover') { wa = 2.0; heat = 0.15; }
    else if (bs === 'squadCast') { wa = 0; heat = 0.9; }
    else if (raised) heat = 0.9;
    st.wa += (wa - st.wa) * (dashing ? 0.7 : 0.18);
    const frozen = e.freezeT > 0;
    const S = e.radius / 30 * 1.45;
    const slump = bs === 'recover' ? 0.96 : 1;
    const a = st.a;
    this.localLight(a);
    const sh = shake * e.radius;

    // След рывка: холодная полоса от начала рывка до босса, быстро тает.
    if (st.dashT < 0.4) {
      const k = 1 - st.dashT / 0.4;
      const dx = x - st.sx;
      const dy = y - st.sy;
      const L = Math.hypot(dx, dy);
      if (L > 6) {
        this.drawSoftStrip({ length: L, width: e.radius * 1.5, dirX: dx / L, dirY: dy / L }, st.sx, st.sy, 1, true, 0.9 * k);
      }
    }

    // Морозная дымка у ног.
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.2 + 0.07 * Math.sin(t * 1.7 + st.ph) + 0.1 * heat;
    const mist = this.getGlow('blue');
    ctx.drawImage(mist, x - e.radius * 2.6, y - e.radius * 2.2, e.radius * 5.2, e.radius * 4.4);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.translate(x + Math.sin(t * 61) * sh, y + Math.cos(t * 53) * sh);
    ctx.rotate(a);
    ctx.scale(S * slump, S * slump);
    const sway = Math.sin(t * 2.1 + st.ph);
    const stride = Math.sin(st.step * 2) * 4;
    const dark = frozen ? '#3d5578' : '#1c2540';

    // Плащ-лохмотья за спиной.
    ctx.beginPath();
    tracePoly(ctx, [-2, -22, -14, -25, -30, -21 + sway * 2, -43, -16, -38, -9 + sway * 2, -50, -4 + sway * 3, -41, 3, -52, 9 + sway * 3, -39, 14, -45, 20 + sway * 2, -27, 23, -12, 25, -2, 22], 1);
    ctx.fillStyle = dark;
    ctx.fill();
    ctx.beginPath();
    tracePoly(ctx, [-6, -18, -28, -14, -36, -8, -30, -2, -38, 4, -28, 10, -34, 16, -14, 20], 1);
    ctx.fillStyle = 'rgba(8,12,26,0.55)';
    ctx.fill();
    ctx.fillStyle = C.tartasIce;
    for (const [px, py, q] of [[-43, -16, 5], [-50, -4, 6], [-52, 9, 6], [-45, 20, 5], [-38, -9, 4], [-39, 14, 4]]) {
      ctx.beginPath();
      ctx.moveTo(px, py - q * 0.5);
      ctx.lineTo(px - q * 1.5, py);
      ctx.lineTo(px, py + q * 0.5);
      ctx.closePath();
      ctx.fill();
    }

    // Ледяные шипы, выросшие из спины: по ним гуляет голубой свет.
    for (const [px, py, L, w] of [[-8, -11, 17, 4], [-12, -3, 22, 5], [-9, 5, 19, 4.5], [-12, 12, 16, 4], [-5, 0, 13, 3.5]]) {
      const d = py < 0 ? -0.35 : py > 0 ? 0.35 : 0;
      ctx.beginPath();
      tracePoly(ctx, [px, py - w, px - L, py + d * L, px, py + w], 1);
      ctx.fillStyle = C.tartasIce;
      ctx.fill();
      ctx.beginPath();
      tracePoly(ctx, [px, py - w, px - L, py + d * L, px - L * 0.45, py - w * 0.2], 1);
      ctx.fillStyle = C.tartasIceLight;
      ctx.fill();
    }

    // Сапоги спереди, шагают по очереди.
    for (const sg of [-1, 1]) {
      const bx = 16 + stride * sg;
      this.bevel([bx - 7, sg * 8 - 5, bx + 6, sg * 8 - 4, bx + 8, sg * 8 + 4, bx - 7, sg * 8 + 5], '#18203a', '#3b4a73', 1.4);
    }

    // Торс и наплечники.
    this.bevel([-15, -14, 6, -17, 14, -9, 14, 9, 6, 17, -15, 14, -19, 0], C.tartasPlate, C.tartasPlateLit, 2.4);
    ctx.beginPath();
    ctx.moveTo(-14, 0);
    ctx.lineTo(12, 0);
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = 'rgba(8,12,26,0.6)';
    ctx.stroke();
    for (const sg of [-1, 1]) {
      this.bevel([-9, sg * 16, 4, sg * 24, 15, sg * 23, 19, sg * 14, 10, sg * 9, -5, sg * 10], '#3a4768', C.tartasPlateLit, 2.6);
      ctx.beginPath();
      tracePoly(ctx, [-3, sg * 20, 5, sg * 27, 10, sg * 21], 1);
      ctx.fillStyle = C.tartasIce;
      ctx.fill();
      ctx.beginPath();
      tracePoly(ctx, [-3, sg * 20, 5, sg * 27, 3.5, sg * 21], 1);
      ctx.fillStyle = C.tartasIceLight;
      ctx.fill();
      ctx.beginPath();
      tracePoly(ctx, [9, sg * 21, 16, sg * 18, 14, sg * 24], 1);
      ctx.fillStyle = '#d8e8fa';
      ctx.fill();
    }

    // Голова: шлем с рогами, щель взгляда светится.
    ctx.beginPath();
    tracePoly(ctx, [2, -9, 10, -6, 12, 0, 10, 6, 2, 9, -4, 5, -4, -5], 1);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.translate(1, 1.5);
    ctx.fill();
    ctx.translate(-1, -1.5);
    this.bevel([2, -9, 10, -6, 12, 0, 10, 6, 2, 9, -4, 5, -4, -5], '#222c48', '#566b9a', 2);
    for (const sg of [-1, 1]) {
      ctx.beginPath();
      tracePoly(ctx, [3, sg * 8, 0, sg * 17, 9, sg * 11], 1);
      ctx.fillStyle = '#c9def5';
      ctx.fill();
      ctx.beginPath();
      tracePoly(ctx, [3, sg * 8, 0, sg * 17, 4, sg * 12], 1);
      ctx.fillStyle = '#eef6ff';
      ctx.fill();
    }
    ctx.beginPath();
    tracePoly(ctx, [8.5, -4.5, 12.5, -3, 12.5, 3, 8.5, 4.5], 1);
    ctx.fillStyle = '#080c1a';
    ctx.fill();

    // Руки и ледяной меч в правой руке.
    ctx.beginPath();
    ctx.arc(14, -22, 4.6, 0, TAU);
    ctx.fillStyle = '#2b3656';
    ctx.fill();
    if (raised) {
      // Меч над головой, виден сверху укороченным: вращается и копит свет.
      ctx.save();
      ctx.translate(2, 22);
      ctx.rotate(t * 1.6);
      this.drawIceSword(14, 5, 1, t, true);
      ctx.restore();
    } else {
      ctx.save();
      ctx.translate(14, 22);
      ctx.rotate(st.wa);
      this.drawIceSword(bs === 'squadCast' ? 44 : 50, 8, hit ? 0 : 1, t, false);
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(14, 22, 5.4, 0, TAU);
    ctx.fillStyle = '#34405f';
    ctx.fill();

    // Попадание: плиты белеют.
    if (hit) {
      ctx.globalAlpha = 0.65;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      tracePoly(ctx, [-15, -14, 6, -17, 14, -9, 14, 9, 6, 17, -15, 14, -19, 0], 1);
      ctx.fill();
      ctx.beginPath();
      tracePoly(ctx, [2, -9, 10, -6, 12, 0, 10, 6, 2, 9, -4, 5, -4, -5], 1);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Взгляд: два холодных огонька в щели шлема. Накаляются в атаках.
    ctx.globalCompositeOperation = 'lighter';
    const eye = this.getGlow('blue');
    const ea = (0.5 + 0.5 * heat) * (frozen ? 0.4 : 1) * (0.85 + 0.15 * Math.sin(t * 7 + st.ph));
    ctx.globalAlpha = ea;
    for (const sg of [-1, 1]) ctx.drawImage(eye, 11.2 - 7, sg * 2.6 - 7, 14, 14);
    ctx.globalAlpha = Math.min(1, ea * 1.2);
    ctx.fillStyle = '#e8f8ff';
    for (const sg of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(12, sg * 2.6, 1.3, 0, TAU);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.restore();

    // Руны вокруг босса на клинках и при призыве.
    if (raised || bs === 'squadCast') {
      ctx.save();
      ctx.translate(x, y);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = C.tartasEye;
      ctx.lineWidth = 1.6;
      ctx.globalAlpha = 0.5 + 0.2 * Math.sin(t * 6);
      ctx.setLineDash([6, 8]);
      ctx.lineDashOffset = -t * 18;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius * 1.9, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }

  /** Ледяной меч: клинок вдоль +x от руки, длина len, ширина w. Местные оси, рука в начале координат. */
  drawIceSword(len, w, vis, t, flat) {
    const ctx = this.ctx;
    const C = this.cfg.render.colors;
    ctx.beginPath();
    tracePoly(ctx, [-9, -2, -1, -2, -1, 2, -9, 2], 1);
    ctx.fillStyle = '#2a2230';
    ctx.fill();
    ctx.beginPath();
    tracePoly(ctx, [0, -w * 0.9, 3, -w * 0.9, 3, w * 0.9, 0, w * 0.9], 1);
    ctx.fillStyle = '#6a7894';
    ctx.fill();
    ctx.beginPath();
    tracePoly(ctx, [3, -w * 0.5, len - 10, -w * 0.5, len, 0, len - 10, w * 0.5, 3, w * 0.5], 1);
    ctx.fillStyle = C.tartasBlade;
    ctx.fill();
    ctx.beginPath();
    tracePoly(ctx, [3, -w * 0.5, len - 10, -w * 0.5, len, 0, 3, 0], 1);
    ctx.fillStyle = C.tartasIceLight;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(6, 0);
    ctx.lineTo(len - 8, 0);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(70,120,190,0.7)';
    ctx.stroke();
    // Наледь: кристаллы вдоль клинка.
    ctx.fillStyle = '#e4f2ff';
    for (let i = 0; i < 3; i++) {
      const px = len * (0.28 + i * 0.22);
      ctx.beginPath();
      tracePoly(ctx, [px, -w * 0.5, px + 3, -w * 0.5 - 4.5 - i, px + 5, -w * 0.5], 1);
      ctx.fill();
    }
    // Свет по лезвию.
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = (flat ? 0.8 : 0.45) * vis + 0.12 * Math.sin(t * 5);
    ctx.drawImage(this.getGlow('blue'), len * 0.1, -w * 1.8, len * 0.95, w * 3.6);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  /**
   * Замёрзший боец отряда Тартаса: маленький рыцарь в наледи с холодным взглядом.
   * kind: 'soldier' (меч), 'archer' (лук: при прицеливании тетива натянута, наконечник светится), 'ram' (таран-голова, рывок).
   */
  drawFrozenTroop(e, x, y, hit, kind) {
    const ctx = this.ctx;
    const C = this.cfg.render.colors;
    const t = this.clock;
    let st = this.beetleState.get(e);
    if (!st) {
      st = { a: Math.atan2(this.hero.y - y, this.hero.x - x), ph: Math.random() * TAU, step: 0 };
      this.beetleState.set(e, st);
    }
    const A = e.atk;
    const moving = e.hx !== 0 || e.hy !== 0;
    const frozen = e.freezeT > 0;
    const heroA = Math.atan2(this.hero.y - y, this.hero.x - x);
    const target = A.state !== 'idle' && kind === 'ram' ? Math.atan2(A.dirY, A.dirX) : e.aim > 0 || kind === 'archer' ? heroA : moving ? Math.atan2(e.hy, e.hx) : heroA;
    let da = (target - st.a) % TAU;
    if (da > Math.PI) da -= TAU;
    else if (da < -Math.PI) da += TAU;
    if (!frozen) st.a += da * (A.state === 'strike' ? 0.8 : 0.22);
    if (moving && !frozen) st.step += this.dt * 7;
    const s = e.radius / 12;
    const windup = A.state === 'windup' && e.def.attack ? Math.min(1, A.t / Math.max(0.01, e.def.attack.windup)) : 0;
    const striking = A.state === 'strike';
    const aim = e.aim > 0 ? 1 - e.aim / Math.max(0.01, e.aimTotal) : 0;
    this.localLight(st.a);
    ctx.save();
    ctx.translate(x + (windup > 0 ? Math.sin(t * 60) * windup * 0.6 : 0), y);
    ctx.rotate(st.a);
    ctx.scale(s, s);
    const stride = Math.sin(st.step) * 2.4;
    for (const sg of [-1, 1]) this.bevel([4 + stride * sg, sg * 4 - 2.5, 10 + stride * sg, sg * 4 - 2, 10 + stride * sg, sg * 4 + 2, 4 + stride * sg, sg * 4 + 2.5], '#18203a', '#3b4a73', 0.8);
    const wide = kind === 'ram' ? 1.2 : 1;
    this.bevel([-6, -9 * wide, 3, -10 * wide, 8, -5, 8, 5, 3, 10 * wide, -6, 9 * wide, -9, 0], frozen ? '#4a6486' : C.tartasPlate, C.tartasPlateLit, 1.5);
    ctx.beginPath();
    tracePoly(ctx, [-2, -9 * wide, 3, -13 * wide, 5, -8 * wide], 1);
    ctx.fillStyle = C.tartasIce;
    ctx.fill();
    ctx.beginPath();
    tracePoly(ctx, [-2, 9 * wide, 3, 13 * wide, 5, 8 * wide], 1);
    ctx.fillStyle = C.tartasIce;
    ctx.fill();
    this.bevel([2, -4.5, 6.5, -2.5, 7.5, 0, 6.5, 2.5, 2, 4.5, -1, 2, -1, -2], '#222c48', '#566b9a', 1);
    if (kind === 'soldier') {
      const sw = (striking ? 0 : 0.6) + windup * 1.4 + 0.15 * Math.sin(st.step);
      ctx.save();
      ctx.translate(5, 9);
      ctx.rotate(sw);
      ctx.beginPath();
      tracePoly(ctx, [0, -1.4, 13, -1.4, 16, 0, 13, 1.4, 0, 1.4], 1);
      ctx.fillStyle = C.tartasBlade;
      ctx.fill();
      ctx.beginPath();
      tracePoly(ctx, [0, -1.4, 13, -1.4, 16, 0, 0, 0], 1);
      ctx.fillStyle = C.tartasIceLight;
      ctx.fill();
      ctx.restore();
    } else if (kind === 'archer') {
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#8aa6cf';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(9, 0, 10, -1.1, 1.1);
      ctx.stroke();
      ctx.lineWidth = 0.7;
      ctx.strokeStyle = '#dcecff';
      const pull = aim * 5;
      ctx.beginPath();
      ctx.moveTo(9 + 10 * Math.cos(-1.1), 10 * Math.sin(-1.1));
      ctx.lineTo(9 + 10 * Math.cos(-1.1) - 1 - pull, 0);
      ctx.lineTo(9 + 10 * Math.cos(1.1), 10 * Math.sin(1.1));
      ctx.stroke();
      if (aim > 0) {
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = '#e8f6ff';
        ctx.beginPath();
        ctx.moveTo(5 - pull, 0);
        ctx.lineTo(18, 0);
        ctx.stroke();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.4 + 0.5 * aim;
        ctx.drawImage(this.getGlow('blue'), 12, -7, 14, 14);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }
      ctx.lineCap = 'butt';
    } else {
      ctx.beginPath();
      tracePoly(ctx, [7, -6, 17, -3, 20, 0, 17, 3, 7, 6], 1);
      ctx.fillStyle = '#9fbde4';
      ctx.fill();
      ctx.beginPath();
      tracePoly(ctx, [7, -6, 17, -3, 20, 0, 7, 0], 1);
      ctx.fillStyle = C.tartasIceLight;
      ctx.fill();
      ctx.beginPath();
      tracePoly(ctx, [12, -6, 14, -11, 16, -4], 1);
      ctx.fillStyle = '#e4f2ff';
      ctx.fill();
      ctx.beginPath();
      tracePoly(ctx, [12, 6, 14, 11, 16, 4], 1);
      ctx.fill();
    }
    if (hit) {
      ctx.globalAlpha = 0.65;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      tracePoly(ctx, [-6, -9 * wide, 3, -10 * wide, 8, -5, 8, 5, 3, 10 * wide, -6, 9 * wide, -9, 0], 1);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = 'lighter';
    const heat = striking || windup > 0 ? 1 : 0.7;
    ctx.globalAlpha = (frozen ? 0.35 : heat) * (0.8 + 0.2 * Math.sin(t * 8 + st.ph));
    for (const sg of [-1, 1]) ctx.drawImage(this.getGlow('blue'), 5.6, sg * 1.6 - 3.5, 7, 7);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.restore();
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
    } else if (e.def === this.cfg.enemies.rockBeetle) {
      this.drawRockBeetle(e, x, y, hit);
    } else if (e.def === this.cfg.enemies.tartas) {
      // Тартас: замёрзший рыцарь с ледяным мечом.
      this.drawTartas(e, x, y, hit);
    } else if (e.def === this.cfg.enemies.frozenSoldier) {
      this.drawFrozenTroop(e, x, y, hit, 'soldier');
    } else if (e.def === this.cfg.enemies.frozenArcher) {
      this.drawFrozenTroop(e, x, y, hit, 'archer');
    } else if (e.def === this.cfg.enemies.frozenRam) {
      this.drawFrozenTroop(e, x, y, hit, 'ram');
    } else {
      // Попадание: враг белеет и на мгновение раздувается.
      const rr = hit ? r * 1.15 : e.atk.state === 'windup' ? r * (1 + 0.08 * Math.sin(e.atk.t * 30)) : r;
      const st = e.atk.state;
      // Враг с атакой: замах (светлеет, напрягается), оглушение после парирования (холодный цвет).
      let fill = e.def.color;
      if (aiming) fill = '#ffe9a8';
      else if (st === 'windup') fill = '#f6d9a4';
      else if (st === 'stun') fill = '#8fa8c8';
      const stunned = !!(e.def.sunHead && this.apotheosis && this.apotheosis.stunT > 0); // Апофеоз оглушён парированной вспышкой
      if (stunned) fill = '#8fa8c8';
      ctx.fillStyle = hit ? '#ffffff' : fill;
      if (e.def.sunHead) { // Апофеоз: мантия и маска-солнце (render_apotheosis.js); нижнюю часть скрывает поле: босс «вылезает из пустоты»
        const zn = this.arena.zone;
        ctx.save();
        if (zn && zn.poly) {
          ctx.beginPath();
          ctx.rect(this.arena.left - 400, this.arena.top - 400, this.arena.width + 800, this.arena.height + 800);
          ctx.moveTo(zn.poly[0].x, zn.poly[0].y);
          for (let i = 1; i < zn.poly.length; i++) ctx.lineTo(zn.poly[i].x, zn.poly[i].y);
          ctx.closePath();
          ctx.clip('evenodd');
        }
        this.apoArt.boss(ctx, e, x, y, rr, hit, stunned);
        ctx.restore();
      } else if (e.def.apostle) {
        this.apoArt.apostle(ctx, e, x, y, rr, hit);
      } else if (e.def.risen) {
        this.apoArt.risen(ctx, e, x, y, rr, hit);
      }
      if (!e.def.sunHead && !e.def.apostle && !e.def.risen) {
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
    }

    this.drawStatusFx(e, x, y, r);
    if (e.shockStacks > 0) this.drawShockFx(e, x, y, r);

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

  /**
   * Состояния на враге. Заряды Мороза: ледяные грани-осколки торчат вокруг, по числу зарядов, и вокруг светится
   * холодная дымка. Заморожен: враг в огранённой ледяной глыбе с бликами, трещинами и искрами. Горит: языки пламени из
   * огранённых лепестков поднимаются над ним, снизу тёплый свет, вверх летят угольки.
   */
  /** Электризация: жёлтые искры вокруг врага по числу зарядов. */
  drawShockFx(e, x, y, r) {
    const ctx = this.ctx;
    ctx.strokeStyle = this.cfg.shock.color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const ph = Math.floor(this.clock * 16);
    for (let k = 0; k < e.shockStacks; k++) {
      const a0 = ((Math.sin((ph + k * 3 + e.x) * 12.9898) * 43758.5453) % 1) * TAU;
      ctx.moveTo(x + Math.cos(a0) * (r + 1), y + Math.sin(a0) * (r + 1));
      ctx.lineTo(x + Math.cos(a0 + 0.2) * (r + 5), y + Math.sin(a0 + 0.2) * (r + 5));
      ctx.lineTo(x + Math.cos(a0 - 0.1) * (r + 9), y + Math.sin(a0 - 0.1) * (r + 9));
    }
    ctx.stroke();
  }

  drawStatusFx(e, x, y, r) {
    const frozen = e.freezeT > 0;
    const stacks = e.frostStacks | 0;
    const burning = e.burnT > 0;
    if (!frozen && stacks <= 0 && !burning) return;
    const ctx = this.ctx;
    const t = this.clock;
    let sd = this.fxSeed.get(e);
    if (sd === undefined) {
      sd = Math.random() * 100;
      this.fxSeed.set(e, sd);
    }
    const rnd = (k) => { const h = Math.sin(sd * 12.9898 + k * 78.233) * 43758.5453; return h - Math.floor(h); };
    const ice = this.getGlow('blue');
    const fire = this.getGlow();
    ctx.save();
    ctx.translate(x, y);
    ctx.lineJoin = 'round';
    if (frozen) {
      const fade = Math.min(1, e.freezeT / 0.35);
      const R = r * 1.2;
      const n = 9;
      const pts = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + rnd(i) * 0.3;
        const rr = R * (0.88 + 0.22 * rnd(i + 20));
        pts.push(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.6 * fade;
      ctx.drawImage(ice, -R * 1.9, -R * 1.9, R * 3.8, R * 3.8);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.62 * fade;
      ctx.beginPath(); tracePoly(ctx, pts, 1);
      ctx.fillStyle = '#9edcff';
      ctx.fill();
      // Грань со стороны света и тёмная грань внизу справа: объём.
      ctx.save();
      ctx.clip();
      ctx.globalAlpha = 0.5 * fade;
      ctx.fillStyle = '#eaf8ff';
      ctx.translate(-R * 0.35, -R * 0.45);
      ctx.beginPath(); tracePoly(ctx, [-R, -R, R * 0.2, -R, -R * 0.2, R * 0.1, -R, R * 0.4], 1);
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.beginPath(); tracePoly(ctx, pts, 1); ctx.clip();
      ctx.globalAlpha = 0.28 * fade;
      ctx.fillStyle = '#2a5f9a';
      ctx.beginPath(); tracePoly(ctx, [R * 0.15, R * 0.3, R * 1.3, R * 0.1, R * 1.3, R * 1.3, -R * 0.3, R * 1.3], 1);
      ctx.fill();
      ctx.restore();
      // Контур, внутренние трещины.
      ctx.globalAlpha = 0.95 * fade;
      ctx.lineWidth = 1.3;
      ctx.strokeStyle = '#f2fcff';
      ctx.beginPath(); tracePoly(ctx, pts, 1); ctx.stroke();
      ctx.globalAlpha = 0.5 * fade;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      for (let k = 0; k < 3; k++) {
        const a = rnd(k + 40) * TAU;
        ctx.moveTo(Math.cos(a) * R * 0.2, Math.sin(a) * R * 0.2);
        ctx.lineTo(Math.cos(a + 0.2) * R * 0.55, Math.sin(a + 0.2) * R * 0.55);
        ctx.lineTo(Math.cos(a - 0.1) * R * 0.9, Math.sin(a - 0.1) * R * 0.9);
      }
      ctx.stroke();
      // Острые осколки по углам глыбы.
      for (let k = 0; k < 4; k++) {
        const a = rnd(k + 60) * TAU;
        const bx = Math.cos(a) * R * 0.92;
        const by = Math.sin(a) * R * 0.92;
        const ex = Math.cos(a) * R * 1.3;
        const ey = Math.sin(a) * R * 1.3;
        const nx = -Math.sin(a) * 2.2;
        const ny = Math.cos(a) * 2.2;
        ctx.globalAlpha = 0.85 * fade;
        ctx.fillStyle = '#d6f1ff';
        ctx.beginPath(); tracePoly(ctx, [bx - nx, by - ny, ex, ey, bx + nx, by + ny], 1); ctx.fill();
      }
      // Блики: искорки перемигиваются.
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = '#ffffff';
      for (let k = 0; k < 3; k++) {
        const tw = Math.max(0, Math.sin(t * 3 + k * 2.1 + sd));
        const a = rnd(k + 80) * TAU;
        const px = Math.cos(a) * R * 0.6;
        const py = Math.sin(a) * R * 0.6;
        const sz = 1 + 3 * tw;
        ctx.globalAlpha = tw * fade;
        ctx.beginPath(); tracePoly(ctx, [px, py - sz, px + sz * 0.3, py, px, py + sz, px - sz * 0.3, py], 1); ctx.fill();
        ctx.beginPath(); tracePoly(ctx, [px - sz, py, px, py - sz * 0.3, px + sz, py, px, py + sz * 0.3], 1); ctx.fill();
      }
    } else if (stacks > 0) {
      const k5 = Math.min(1, stacks / this.cfg.frost.maxStacks);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.12 + 0.3 * k5;
      ctx.drawImage(ice, -r * 1.6, -r * 1.6, r * 3.2, r * 3.2);
      ctx.globalCompositeOperation = 'source-over';
      for (let k = 0; k < stacks; k++) {
        const a = sd + (k / this.cfg.frost.maxStacks) * TAU + rnd(k) * 0.4;
        const c = Math.cos(a);
        const sn = Math.sin(a);
        const len = 7 + 5 * rnd(k + 5) + stacks;
        const base = r * 0.8;
        const nx = -sn * 3;
        const ny = c * 3;
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = '#7fcfff';
        ctx.beginPath(); tracePoly(ctx, [c * base - nx, sn * base - ny, c * (base + len), sn * (base + len), c * base + nx, sn * base + ny], 1); ctx.fill();
        ctx.fillStyle = '#e9f9ff';
        ctx.beginPath(); tracePoly(ctx, [c * base - nx, sn * base - ny, c * (base + len), sn * (base + len), c * base, sn * base], 1); ctx.fill();
      }
    }
    if (burning) {
      const fade = Math.min(1, e.burnT / 0.35) * Math.min(1, 1.4);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.45 * fade;
      ctx.drawImage(fire, -r * 1.7, -r * 1.7, r * 3.4, r * 3.4);
      ctx.globalCompositeOperation = 'source-over';
      const tongues = 4;
      for (let k = 0; k < tongues; k++) {
        const a = -Math.PI * (0.2 + 0.6 * ((k + 0.5) / tongues)) + (rnd(k + 100) - 0.5) * 0.3; // дуга сверху
        const fl = 0.65 + 0.35 * Math.sin(t * 11 + k * 2.3 + sd) * Math.sin(t * 5.1 + k);
        const bx = Math.cos(a) * r * 0.7;
        const by = Math.sin(a) * r * 0.7 + 1;
        const h = r * (1.0 + 0.6 * rnd(k + 120)) * (0.65 + 0.55 * fl);
        const w = Math.max(3, r * 0.3);
        const sway = Math.sin(t * 7 + k * 1.7 + sd) * w * 0.6;
        ctx.save();
        ctx.translate(bx, by);
        ctx.globalAlpha = 0.85 * fade;
        ctx.fillStyle = '#ff7a2a';
        ctx.beginPath(); tracePoly(ctx, [-w, 0, -w * 0.55, -h * 0.5, sway, -h, w * 0.5, -h * 0.55, w, 0], 1); ctx.fill();
        ctx.globalAlpha = 0.9 * fade;
        ctx.fillStyle = '#ffc24a';
        ctx.beginPath(); tracePoly(ctx, [-w * 0.5, 0, -w * 0.25, -h * 0.35, sway * 0.6, -h * 0.68, w * 0.25, -h * 0.38, w * 0.5, 0], 1); ctx.fill();
        ctx.restore();
      }
      // Угольки поднимаются и гаснут.
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = '#ffb56a';
      for (let k = 0; k < 4; k++) {
        const ph = (t * 0.9 + k * 0.25 + rnd(k + 140)) % 1;
        const a = rnd(k + 150) * TAU;
        ctx.globalAlpha = (1 - ph) * 0.9 * fade;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r * 0.6 + Math.sin(t * 3 + k) * 2, -r * 0.5 - ph * r * 1.6, 1.2, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
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
    const t = this.clock;
    const glow = this.getGlow('blue');
    // Мошки: крошечное тёмное тельце с мелькающими крыльями и холодным огоньком; поворачиваются по ходу полёта.
    for (let pass = 0; pass < 2; pass++) {
      if (pass === 0) ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < list.length; i++) {
        const m = list[i];
        if (!m.active) continue;
        const px = m.prevX + (m.x - m.prevX) * alpha;
        const py = m.prevY + (m.y - m.prevY) * alpha;
        if (px < viewL - 20 || px > viewR + 20 || py < viewT - 20 || py > viewB + 20) continue;
        if (pass === 0) {
          ctx.globalAlpha = 0.75;
          const g = m.radius * 4.2;
          ctx.drawImage(glow, px - g / 2, py - g / 2, g, g);
        } else {
          const a = Math.atan2(m.vy, m.vx);
          const fl = Math.sin(t * 90 + m.phase);
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(a);
          ctx.beginPath();
          tracePoly(ctx, [-1, 0, -3.5, -m.radius * (1.1 + 0.5 * fl), 1.5, -0.8], 1);
          tracePoly(ctx, [-1, 0, -3.5, m.radius * (1.1 + 0.5 * fl), 1.5, 0.8], 1);
          ctx.fillStyle = 'rgba(200,228,255,0.7)';
          ctx.fill();
          ctx.beginPath();
          tracePoly(ctx, [m.radius * 0.9, 0, 0, -m.radius * 0.5, -m.radius * 0.9, 0, 0, m.radius * 0.5], 1);
          ctx.fillStyle = '#e9f4ff';
          ctx.fill();
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
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
  getStrip(ice) {
    if (ice ? this.stripIce : this.strip) return ice ? this.stripIce : this.strip;
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
        img.data[i] = ice ? 150 : 255;
        img.data[i + 1] = ice ? 205 : 70;
        img.data[i + 2] = ice ? 255 : 58;
        img.data[i + 3] = Math.round(a * 255);
      }
    }
    g.putImageData(img, 0, 0);
    if (ice) this.stripIce = c;
    else this.strip = c;
    return c;
  }

  /** Телеграф рывка: размытая красная полоса; за время замаха она наливается от жука вперёд, в конце пульсирует. */
  drawSoftStrip(tg, x, y, k, ice, mul) {
    const ctx = this.ctx;
    const strip = this.getStrip(ice);
    const L = tg.length;
    const w = tg.width;
    const h = w * 2.2; // по краям спрайт тает, поэтому он шире зоны
    const pulse = k > 0.7 ? 0.85 + 0.15 * Math.sin(this.clock * 38) : 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.atan2(tg.dirY, tg.dirX));
    const m = mul === undefined ? 1 : mul;
    ctx.globalAlpha = (0.16 + 0.08 * k) * pulse * m;
    ctx.drawImage(strip, -0.05 * L, -h / 2, L * 1.1, h);
    ctx.globalAlpha = (0.22 + 0.3 * k) * pulse * m;
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
   * Горный жук: это та самая скала. Спрайт скалы остаётся прежним (враг не должен заметить подвоха): в начале
   * пробуждения жук выглядит как неподвижный камень, потом скала вздрагивает (пыль, снег осыпается), поднимается
   * на каменных лапах, в трещинах загорается тёплый свет и открываются глаза-щели. Размер тот же, что у скалы.
   * Замах: приседает, дрожит, трещины разгораются; удар: оседает с пылью. Взгляд и лапы по ходу движения.
   */
  drawRockBeetle(e, x, y, hit) {
    const ctx = this.ctx;
    const C = this.cfg.render.colors;
    const t = this.clock;
    const A = e.atk;
    const as = A.state;
    const rk = e.rockR || e.radius * 1.6;
    let st = this.beetleState.get(e);
    if (!st || t - (st.t || 0) > 0.5) {
      st = { a: Math.atan2(this.hero.y - y, this.hero.x - x), ph: Math.random() * TAU, pa: as, step: 0, ox: x, oy: y, dust: 0 };
      this.beetleState.set(e, st);
    }
    st.t = t;
    const frozen = e.freezeT > 0;
    if (!frozen) {
      const mv = Math.hypot(x - st.ox, y - st.oy);
      const target = mv > 0.05 ? Math.atan2(y - st.oy, x - st.ox) : Math.atan2(this.hero.y - y, this.hero.x - x);
      let da = (target - st.a) % TAU;
      if (da > Math.PI) da -= TAU;
      else if (da < -Math.PI) da += TAU;
      st.a += da * 0.1;
      st.step += mv * 0.12;
    }
    st.ox = x;
    st.oy = y;
    if (st.pa === 'windup' && as === 'recovery') { this.spawnDust(x, y, 0, 1); this.spawnDust(x, y, 0, -1); }
    // Фазы пробуждения: 0..0.35 это просто скала, 0.35..0.6 дрожит и осыпается, дальше встаёт.
    const wk = as === 'wake' && e.def.wakeTime > 0 ? Math.min(1, A.t / e.def.wakeTime) : 1;
    const tremble = as === 'wake' ? Math.max(0, Math.min(1, (wk - 0.3) / 0.25)) * (wk < 0.65 ? 1 : 1 - (wk - 0.65) / 0.35) : 0;
    const rise = as === 'wake' ? Math.max(0, Math.min(1, (wk - 0.55) / 0.45)) : 1;
    const ease = 1 - Math.pow(1 - rise, 3);
    if (as === 'wake' && wk > 0.3 && wk < 0.9 && Math.random() < 0.18) this.spawnDust(x + (Math.random() - 0.5) * rk, y + rk * 0.5, 0, 1);
    if (st.pa === 'wake' && as !== 'wake') this.spawnDust(x, y + rk * 0.3, 0, 1);
    st.pa = as;
    const wind = as === 'windup' && e.def.slam.windup > 0 ? Math.min(1, A.t / e.def.slam.windup) : 0;
    const rec = as === 'recovery' ? Math.max(0, 1 - A.t / 0.35) : 0;
    const heat = hit ? 1 : Math.min(1, 0.2 * ease + wind * 0.9 + rec * 0.7);
    const shx = (tremble * 1.6 + wind * 1.1) * Math.sin(t * 70 + st.ph);
    const shy = (tremble * 1.2 + wind * 0.8) * Math.cos(t * 83 + st.ph);
    const lift = rk * 0.16 * ease - wind * rk * 0.1 + rec * rk * 0.05 + (as === 'idle' || as === 'wake' ? 0 : 0) + Math.sin(st.step * 2) * rk * 0.025 * ease;

    // Спрайт той же скалы: по id, как у неподвижных скал.
    const rock = { r: rk, id: e.rockId === undefined ? -1 : e.rockId };
    const sp = this.rockSprites[rock.id] || (this.rockSprites[rock.id] = buildRockSprite(rock, rock.id + 1, C));
    ctx.save();
    ctx.translate(x + shx, y + shy - lift);
    // Лапы (под телом): четыре каменные лапы по бокам относительно хода. Растут при вставании.
    if (ease > 0.01) {
      this.localLight(st.a);
      const ca = Math.cos(st.a);
      const sa = Math.sin(st.a);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let i = 0; i < 6; i++) {
        const side = i < 3 ? -1 : 1;
        const along = ((i % 3) - 1) * 0.55;
        const sw = Math.sin(st.step + (i % 2) * Math.PI + side) * rk * 0.18;
        const bx = ca * along * rk + -sa * side * rk * 0.55;
        const by = sa * along * rk + ca * side * rk * 0.55;
        const kx = bx + (-sa * side) * rk * 0.38 * ease + ca * sw * 0.5;
        const ky = by + (ca * side) * rk * 0.38 * ease + sa * sw * 0.5;
        const fx = kx + (-sa * side) * rk * 0.12 * ease + ca * sw * 0.5;
        const fy = ky + (ca * side) * rk * 0.2 * ease + sa * sw * 0.5 + lift * 0.9;
        ctx.strokeStyle = hit ? '#ffffff' : '#2b3347';
        ctx.lineWidth = Math.max(3, rk * 0.17) * ease;
        ctx.beginPath(); ctx.moveTo(bx, by + lift * 0.4); ctx.lineTo(kx, ky + lift * 0.7); ctx.lineTo(fx, fy); ctx.stroke();
        ctx.strokeStyle = hit ? '#ffffff' : '#5b6784';
        ctx.lineWidth = Math.max(1.2, rk * 0.07) * ease;
        ctx.beginPath(); ctx.moveTo(bx - 1, by + lift * 0.4 - 1); ctx.lineTo(kx - 1, ky + lift * 0.7 - 1); ctx.stroke();
      }
    }
    ctx.drawImage(sp.cv, -sp.half, -sp.half, sp.half * 2, sp.half * 2);
    if (hit) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.55;
      ctx.drawImage(sp.cv, -sp.half, -sp.half, sp.half * 2, sp.half * 2);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    // Трещины и глаза: загораются по мере пробуждения; в начале их нет совсем (просто скала).
    if (heat > 0.02 || ease > 0.02) {
      ctx.globalCompositeOperation = 'lighter';
      const pulse = 0.75 + 0.25 * Math.sin(t * 4 + st.ph);
      const ca = Math.cos(st.a);
      const sa = Math.sin(st.a);
      ctx.strokeStyle = 'rgba(255,150,60,' + (0.7 * heat * pulse * Math.max(ease, wind)) + ')';
      ctx.lineWidth = Math.max(1.3, rk * 0.05);
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = st.ph + i * 1.7;
        const r0 = rk * 0.18;
        ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
        ctx.lineTo(Math.cos(a + 0.25) * rk * 0.5, Math.sin(a + 0.25) * rk * 0.5);
        ctx.lineTo(Math.cos(a - 0.1) * rk * 0.78, Math.sin(a - 0.1) * rk * 0.78);
      }
      ctx.stroke();
      const glow = this.getGlow();
      const eyeA = Math.max(0, ease - 0.4) / 0.6;
      ctx.globalAlpha = eyeA * (0.6 + 0.4 * heat) * pulse;
      for (let s2 = -1; s2 <= 1; s2 += 2) {
        const ex = ca * rk * 0.55 + -sa * s2 * rk * 0.22;
        const ey = sa * rk * 0.55 + ca * s2 * rk * 0.22;
        ctx.drawImage(glow, ex - 7, ey - 7, 14, 14);
      }
      ctx.restore();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    } else {
      ctx.restore();
    }

    // Замах: ударная волна на земле растёт к моменту удара.
    if (wind > 0) {
      ctx.save();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = 'rgba(255,170,90,' + (0.25 + 0.5 * wind) + ')';
      ctx.beginPath();
      ctx.arc(x, y, rk * (1 + wind * 1.6), 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
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

  /** Хвост кометы: горизонтальный спрайт, голова справа. Огонь (по умолчанию) или лёд (снаряд с Морозом). */
  getComet(kind) {
    const key = 'comet' + kind;
    if (this[key]) return this[key];
    const W = 256;
    const H = 64;
    const cv = makeCanvas(W, H);
    const g = cv.getContext('2d');
    const hx = 224;
    const cy = H / 2;
    const stops = kind === 'Ice'
      ? [[0, 'rgba(150,235,255,0)'], [0.55, 'rgba(170,240,255,0.35)'], [1, 'rgba(240,252,255,0.95)']]
      : kind === 'Gold'
        ? [[0, 'rgba(255,200,30,0)'], [0.5, 'rgba(255,225,70,0.4)'], [1, 'rgba(255,252,210,0.95)']]
      : kind === 'Violet'
        ? [[0, 'rgba(120,60,255,0)'], [0.5, 'rgba(165,110,255,0.4)'], [1, 'rgba(240,226,255,0.95)']]
        : kind === 'Steam'
        ? [[0, 'rgba(255,120,40,0)'], [0.5, 'rgba(255,170,90,0.4)'], [1, 'rgba(235,248,255,0.95)']]
        : kind === 'Fire'
          ? [[0, 'rgba(255,70,20,0)'], [0.5, 'rgba(255,120,30,0.4)'], [1, 'rgba(255,225,150,0.95)']]
          : [[0, 'rgba(40,90,255,0)'], [0.5, 'rgba(70,140,255,0.4)'], [1, 'rgba(200,232,255,0.95)']];
    const layer = (hw, a) => {
      const gr = g.createLinearGradient(6, 0, hx, 0);
      for (const st of stops) gr.addColorStop(st[0], st[1]);
      g.globalAlpha = a;
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(6, cy);
      g.quadraticCurveTo(hx * 0.55, cy - hw * 0.8, hx, cy - hw);
      g.lineTo(hx, cy + hw);
      g.quadraticCurveTo(hx * 0.55, cy + hw * 0.8, 6, cy);
      g.closePath();
      g.fill();
    };
    layer(18, 0.4);
    layer(10, 0.8);
    layer(5, 1);
    g.globalAlpha = 1;
    this[key] = cv;
    return cv;
  }

  /**
   * Снаряды героя: маленький огненный шар с хвостом, как у кометы. Чем больше снарядов в залпе (p.glow 0..1), тем
   * ярче свечение: крупнее ореол, длиннее хвост, белее сердцевина, от 0.5 летят искры. Цвет: синий; Мороз: ледяной бело-голубой; Горение: оранжевый.
   */
  drawShots(list, alpha, viewL, viewR, viewT, viewB) {
    const ctx = this.ctx;
    const t = this.clock;
    const glows = [this.getGlow('blue'), this.getGlow('blue'), this.getGlow(), this.getGlow('gold'), this.getGlow(true), this.getGlow('gold')];
    const tails = [this.getComet('Blue'), this.getComet('Ice'), this.getComet('Fire'), this.getComet('Steam'), this.getComet('Violet'), this.getComet('Gold')];
    // Проход 1: свет и хвосты сложением цветов.
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (!p.active) continue;
      const px = p.prevX + (p.x - p.prevX) * alpha;
      const py = p.prevY + (p.y - p.prevY) * alpha;
      if (px < viewL - 60 || px > viewR + 60 || py < viewT - 60 || py > viewB + 60) continue;
      const r = p.radius;
      const gl = p.glow || 0;
      const kd = p.zap ? (p.frost && p.burnDmg > 0 ? 3 : p.frost ? 1 : p.burnDmg > 0 ? 2 : 5) : p.gen > 0 ? 4 : p.steam > 0 ? 3 : p.burnDmg > 0 ? 2 : p.frost ? 1 : 0; // 4 фантомный фиолетовый; 0 синий, 1 ледяной (Мороз), 2 огненный (Горение), 3 пар (оба)
      const fl = 0.9 + 0.1 * Math.sin(t * 40 + i * 1.7);
      const ang = Math.atan2(p.vy, p.vx);
      const sc = (r * 1.25 / 14) * (1 + 0.2 * gl) * fl;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(ang);
      ctx.globalAlpha = 0.6 - 0.15 * gl;
      const tf = Math.min(1, p.travelled / 46); // хвост вырастает после вылета, а не торчит у героя
      ctx.scale(tf, 1);
      ctx.drawImage(tails[kd], -224 * sc, -32 * sc, 256 * sc, 64 * sc);
      ctx.restore();
      const hs = r * (4 + 2.2 * gl) * fl;
      ctx.globalAlpha = 0.4 + 0.2 * gl;
      ctx.drawImage(glows[kd], px - hs, py - hs, hs * 2, hs * 2);
      if (gl > 0.3) {
        const hs2 = hs * 1.7;
        ctx.globalAlpha = 0.1 * gl;
        ctx.drawImage(glows[kd], px - hs2, py - hs2, hs2 * 2, hs2 * 2);
      }
    }
    // Проход 2: сердцевина (обычное наложение) и искры.
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (!p.active) continue;
      const px = p.prevX + (p.x - p.prevX) * alpha;
      const py = p.prevY + (p.y - p.prevY) * alpha;
      if (px < viewL - 20 || px > viewR + 20 || py < viewT - 20 || py > viewB + 20) continue;
      const r = p.radius;
      const gl = p.glow || 0;
      const kd = p.zap ? (p.frost && p.burnDmg > 0 ? 3 : p.frost ? 1 : p.burnDmg > 0 ? 2 : 5) : p.gen > 0 ? 4 : p.steam > 0 ? 3 : p.burnDmg > 0 ? 2 : p.frost ? 1 : 0;
      ctx.globalAlpha = 1;
      ctx.fillStyle = kd === 5 ? '#ffd21e' : kd === 4 ? '#8a5cff' : kd === 3 ? '#ffa24a' : kd === 2 ? '#ff8a2a' : kd === 1 ? '#9fe6ff' : '#3f86ff';
      ctx.beginPath();
      ctx.arc(px, py, r * 0.95, 0, TAU);
      ctx.fill();
      ctx.fillStyle = kd === 5 ? '#fffbe0' : kd === 4 ? '#efe4ff' : kd === 3 ? '#f2fbff' : kd === 2 ? (gl > 0.5 ? '#fff6dc' : '#ffd890') : kd === 1 ? '#f2fcff' : '#d6ecff';
      ctx.beginPath();
      ctx.arc(px - r * 0.12, py - r * 0.16, r * (0.55 + 0.15 * gl), 0, TAU);
      ctx.fill();
      if (p.zap) { // шар молний: потрескивающие дуги вокруг
        ctx.strokeStyle = '#fffbe0';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        const f0 = Math.floor(t * 24) + i * 7;
        for (let k = 0; k < 3; k++) {
          const a0 = Math.sin((f0 + k * 5) * 12.9898) * 43758.5453 % TAU;
          ctx.moveTo(px + Math.cos(a0) * r * 0.7, py + Math.sin(a0) * r * 0.7);
          ctx.lineTo(px + Math.cos(a0 + 0.25) * r * 1.5, py + Math.sin(a0 + 0.25) * r * 1.5);
          ctx.lineTo(px + Math.cos(a0 - 0.1) * r * 2.1, py + Math.sin(a0 - 0.1) * r * 2.1);
        }
        ctx.stroke();
      }
      if (p.parryable) { // парируемый снаряд (если вдруг в этом списке): светлая обводка
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = '#fff3d0';
        ctx.beginPath();
        ctx.arc(px, py, r, 0, TAU);
        ctx.stroke();
      }
      if (gl >= 0.5) {
        const ang = Math.atan2(p.vy, p.vx);
        const c = Math.cos(ang);
        const s2 = Math.sin(ang);
        ctx.fillStyle = kd === 4 ? 'rgba(205,170,255,0.9)' : kd === 2 ? 'rgba(255,200,110,0.9)' : 'rgba(170,215,255,0.9)';
        for (let k = 0; k < 2; k++) {
          const ph = (t * 3.2 + i * 0.37 + k * 0.5) % 1;
          const back = r * 2 + ph * r * 9;
          const off = Math.sin(i * 12.9 + k * 4.1) * r * 1.4 * ph;
          ctx.globalAlpha = (1 - ph) * gl;
          ctx.beginPath();
          ctx.arc(px - c * back - s2 * off, py - s2 * back + c * off, Math.max(0.6, r * 0.18 * (1 - ph)), 0, TAU);
          ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
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
    const maxHp = Math.round(hero.maxHp || this.cfg.hero.maxHp || 1);
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

  /** Разряд шокера: зубчатая дуга между точками, дрожит по кадрам; два слоя (широкое свечение и белая жила). */
  drawZapArc(ctx, x0, y0, x1, y1, w, fade, seed, rgb, core) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const seg = Math.max(4, Math.round(len / 22));
    const frame = Math.floor(this.clock * 34);
    const amp = 5 + w * 2.2;
    for (let pass = 0; pass < 3; pass++) {
      ctx.strokeStyle = pass === 0 ? 'rgba(' + rgb + ',' + 0.2 * fade + ')' : pass === 1 ? 'rgba(' + rgb + ',' + 0.8 * fade + ')' : 'rgba(' + core + ',' + fade + ')';
      ctx.lineWidth = pass === 0 ? w * 5 : pass === 1 ? w * 1.8 : Math.max(1, w * 0.7);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      for (let s = 1; s < seg; s++) {
        const f = s / seg;
        const j = Math.sin((s * 12.9898 + seed * 78.233 + frame * 3.7 + (pass === 2 ? 1.3 : 0)) * 43758.5453) * amp * Math.sin(f * Math.PI);
        ctx.lineTo(x0 + dx * f + nx * j, y0 + dy * f + ny * j);
      }
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
  }

  /** Герой-молния (рывок с Молнией): яркий шар с ореолом. */
  drawLightHero(ctx, hx, hy) {
    this.dashfx.drawLightHero(ctx, hx, hy, this.lightdash.kind);
  }

  /** Молнии рывка и разрядов электризации: ломаные с дрожью, гаснут за 0.25 с. */
  drawBolts(ctx) {
    const ld = this.lightdash;
    const zb = this.zapBolts;
    const n1 = ld ? ld.bolts.length : 0;
    if (!n1 && !zb.length && !this.dashBeams.length) return;
    const col = this.cfg.shock.color;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n1 + zb.length; i++) {
      const b = i < n1 ? ld.bolts[i] : zb[i - n1];
      const k = Math.max(0, 1 - b.age / 0.25);
      this.drawZapArc(ctx, b.x0, b.y0, b.x1, b.y1, 2.2, k, i, ZAP_RGB[b.k | 0], ZAP_CORE[b.k | 0]);
    }
    // Лучи Лазера на рывке: быстрый удар в точку прибытия.
    const bm = this.dashBeams;
    const T = this.cfg.kinetic.beamTime;
    for (let i = 0; i < bm.length; i++) {
      const b = bm[i];
      const fade = Math.max(0, 1 - Math.max(0, b.age - T) / 0.25);
      const prog = Math.min(1, b.age / T);
      const ex = b.x0 + (b.x1 - b.x0) * prog;
      const ey = b.y0 + (b.y1 - b.y0) * prog;
      if (b.zap) this.drawZapArc(ctx, b.x0, b.y0, ex, ey, 2.4, fade, i + 40, ZAP_RGB[b.kind], ZAP_CORE[b.kind]);
      else {
        const rgb = b.kind === 1 ? '255,150,50' : b.kind === 3 ? '255,255,255' : '110,205,255';
        ctx.strokeStyle = 'rgba(' + rgb + ',' + 0.35 * fade + ')';
        ctx.lineWidth = 9;
        ctx.beginPath(); ctx.moveTo(b.x0, b.y0); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,' + fade + ')';
        ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(b.x0, b.y0); ctx.lineTo(ex, ey); ctx.stroke();
      }
      if (b.done) { // зона эффектов в точке прибытия
        ctx.globalAlpha = 0.5 * fade;
        ctx.strokeStyle = this.cfg.shock.colors[b.kind];
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(b.x1, b.y1, this.cfg.kinetic.laserZone * (1 - 0.3 * fade), 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }

  /** Костры огненного шлейфа: тёплое пятно с мерцающим язычком, к концу жизни гаснет. */
  drawFires(ctx) {
    const F = this.cfg.kinetic;
    this.dashfx.drawFires(ctx, this.fires, F.fireLife, F.fireRadius);
  }

  /**
   * Смертельная аура: слабая негативная магия. В радиусе две тонкие вещи: лёгкое дрожащее искажение пространства
   * (картинка внутри чуть увеличена кольцами и «дышит») и редкие завихрения, в которых на миг проступает негатив
   * (инверсия цвета через difference). Всё еле заметно; на тике поле вздрагивает сильнее. Резкой границы нет.
   */
  drawAura(ctx, hx, hy) {
    const au = this.aura;
    if (!au || !au.active) return;
    const R = au.radius;
    const t = this.clock;
    // au.pulse (вздрагивание на тике) не используем: поле спокойное
    // Искажение: копия экрана под полем, нарисованная обратно с лёгким увеличением вложенными дисками.
    const m = ctx.getTransform();
    const sc = Math.hypot(m.a, m.b);
    const D = Math.ceil(2 * R * sc);
    const dx = m.a * hx + m.c * hy + m.e;
    const dy = m.b * hx + m.d * hy + m.f;
    if (D > 8 && D < 2400 && sc > 0) {
      let tc = this.auraTmp;
      if (!tc || tc.width < D || tc.height < D) tc = this.auraTmp = makeCanvas(D, D);
      const tg = tc.getContext('2d');
      tg.setTransform(1, 0, 0, 1, 0, 0);
      tg.clearRect(0, 0, tc.width, tc.height);
      tg.drawImage(ctx.canvas, Math.round(dx - D / 2), Math.round(dy - D / 2), D, D, 0, 0, D, D);
      ctx.save();
      ctx.translate(hx, hy);
      const rings = 4;
      for (let i = 1; i < rings; i++) {
        const rr = R * (1 - i / rings * 0.78);
        const k = 1 + (0.012 + 0.012 * i) * (1 + 0.15 * Math.sin(t * 0.5 + i * 1.3)); // почти неподвижное линзирование, без дрожи и вздрагивания на тике
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, rr, 0, TAU);
        ctx.clip();
        ctx.globalAlpha = 0.6;
        ctx.drawImage(tc, 0, 0, D, D, -R * k, -R * k, 2 * R * k, 2 * R * k);
        ctx.restore();
      }
      ctx.restore();
    }
    ctx.save();
    ctx.translate(hx, hy);
    // Едва заметная тёмно-фиолетовая дымка по краю: поле читается без линии.
    const gr = ctx.createRadialGradient(0, 0, R * 0.3, 0, 0, R);
    const kd = au.kind | 0;
    const tint = ['110,80,165', '110,185,255', '255,130,50', '225,236,248'][kd]; // цвет стихии: лёгкий, поле остаётся тёмным
    gr.addColorStop(0, 'rgba(' + tint + ',0)');
    gr.addColorStop(0.7, 'rgba(' + tint + ',' + (kd ? 0.09 : 0.05) + ')');
    gr.addColorStop(1, 'rgba(' + tint + ',0)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.fill();
    // Завихрения с негативом: возникают, закручиваются и тают по очереди.
    ctx.globalCompositeOperation = 'difference';
    ctx.lineCap = 'butt';
    ctx.strokeStyle = '#ffffff';
    const sw = 5;
    for (let i = 0; i < sw; i++) {
      const u = (t * 0.27 + i / sw) % 1;
      const vis = Math.sin(Math.PI * u);
      const al = vis * vis * 0.75;
      if (al < 0.02) continue;
      const dir = i % 2 ? -1 : 1;
      const base = (i * 2.399 + Math.floor(t * 0.27 + i / sw) * 1.7) + dir * u * 1.4;
      const n = 12;
      let px = 0;
      let py = 0;
      for (let j = 0; j <= n; j++) {
        const v = j / n;
        const r = R * (0.1 + 0.8 * v) * (0.85 + 0.15 * vis);
        const ang = base + dir * v * 2.3;
        const x = Math.cos(ang) * r;
        const y = Math.sin(ang) * r;
        if (j > 0) {
          const w = 7 * Math.sin(Math.PI * v) * (0.6 + 0.4 * vis);
          ctx.globalAlpha = 0.07 * al;
          ctx.lineWidth = w * 2.2 + 1;
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
          ctx.globalAlpha = 0.11 * al;
          ctx.lineWidth = w + 0.6;
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
          if (kd) { // окраска завихрения стихией поверх негатива
            ctx.globalCompositeOperation = 'lighter';
            ctx.strokeStyle = 'rgb(' + tint + ')';
            ctx.globalAlpha = 0.09 * al;
            ctx.lineWidth = w * 1.4 + 0.6;
            ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
            ctx.globalCompositeOperation = 'difference';
            ctx.strokeStyle = '#ffffff';
          }
        }
        px = x;
        py = y;
      }
    }
    // Стихия: редкие частицы поднимаются из поля (угольки, ледяная пыль, пар).
    if (kd) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgb(' + tint + ')';
      for (let i = 0; i < 9; i++) {
        const ph = (t * (kd === 2 ? 0.5 : 0.28) + i * 0.113) % 1;
        const a = i * 2.17 + Math.floor(t * 0.3 + i) * 0.9;
        const rr = R * (0.2 + 0.7 * ((i * 0.37) % 1));
        const up = kd === 1 ? -ph * 8 + 6 * ph : -ph * 22; // лёд почти не поднимается и оседает
        ctx.globalAlpha = Math.sin(Math.PI * ph) * (kd === 3 ? 0.35 : 0.6);
        ctx.beginPath();
        ctx.arc(Math.cos(a) * rr + Math.sin(t * 2 + i) * 2, Math.sin(a) * rr * 0.9 + up, kd === 3 ? 3.2 : 1.3, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /** Полилиния по точкам [[x,y],...] (без заливки и stroke: их делает вызывающий). */
  strokePts(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  }

  /** Путь по многоугольнику провала; k раздувает его от центральной линии (для мягкой тени). */
  fissurePoly(ctx, poly, k) {
    ctx.beginPath();
    for (let i = 0; i < poly.length; i++) {
      const q = poly[i];
      const x = q[2] + (q[0] - q[2]) * k;
      const y = q[3] + (q[1] - q[3]) * k;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  /**
   * Форма разлома: ломаная главная трещина (ширина меняется, концы острые), многоугольник провала и ветки двух
   * уровней. Считается один раз на разлом (кэш по координатам), потом только рисуется.
   */
  fissureGeom(f, fi) {
    const key = Math.round(f.x1) + ',' + Math.round(f.y1) + ',' + Math.round(f.x2) + ',' + Math.round(f.y2);
    this.fissureCache = this.fissureCache || new Map();
    let G = this.fissureCache.get(key);
    if (G) return G;
    if (this.fissureCache.size > 64) this.fissureCache.clear();
    const rnd = mulberry32(Math.imul(Math.round(f.x1) * 31 + Math.round(f.y1), 2654435761) ^ (fi * 977));
    const dx = f.x2 - f.x1;
    const dy = f.y2 - f.y1;
    const L = Math.hypot(dx, dy) || 1;
    const ux = dx / L;
    const uy = dy / L;
    const nx = -uy;
    const ny = ux;
    const n = Math.max(4, Math.ceil(L / 14));
    const offs = [0];
    let o = 0;
    for (let i = 1; i <= n; i++) {
      o += (rnd() - 0.5) * f.hw * 1.1;
      o *= 0.8;
      offs.push(o);
    }
    const edgeK = (u) => Math.min(1, Math.min(u, 1 - u) * 5);
    const main = [];
    const left = [];
    const right = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const off = offs[i] * edgeK(u);
      const cx = f.x1 + dx * u + nx * off;
      const cy = f.y1 + dy * u + ny * off;
      const w = f.hw * (0.45 + 0.6 * (0.5 + 0.5 * Math.sin(i * 1.9 + rnd() * 2))) * edgeK(u) + 0.8;
      main.push([cx, cy]);
      left.push([cx + nx * w * (0.8 + rnd() * 0.5), cy + ny * w * (0.8 + rnd() * 0.5), cx, cy]);
      right.push([cx - nx * w * (0.8 + rnd() * 0.5), cy - ny * w * (0.8 + rnd() * 0.5), cx, cy]);
    }
    const poly = left.concat(right.reverse());
    const branches = [];
    const grow = (x, y, ang, len, w, depth) => {
      const pts = [[x, y]];
      const steps = Math.max(2, Math.round(len / 9));
      let a = ang;
      for (let i = 0; i < steps; i++) {
        a += (rnd() - 0.5) * 0.9;
        x += Math.cos(a) * len / steps;
        y += Math.sin(a) * len / steps;
        pts.push([x, y]);
        if (depth < 2 && i > 0 && rnd() < 0.28) grow(x, y, a + (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.6), len * 0.5, w * 0.6, depth + 1);
      }
      branches.push({ pts, w });
    };
    for (let i = 2; i < n - 1; i += 2 + Math.floor(rnd() * 2)) {
      const side = rnd() < 0.5 ? -1 : 1;
      const base = Math.atan2(uy, ux) + side * (0.7 + rnd() * 0.7);
      grow(main[i][0], main[i][1], base, 14 + rnd() * 30, f.hw * 0.32, 0);
    }
    G = { main, poly, branches, L, nx, ny, off: (u) => offs[Math.min(n, Math.round(u * n))] * edgeK(u) };
    this.fissureCache.set(key, G);
    return G;
  }

  /**
   * Лучи лазера: тонкая раскалённая сердцевина, вокруг мягкое цветное свечение, всё сложением цветов. В начале луча
   * вспышка у посоха, на конце яркая точка попадания с искрами; луч чуть дрожит. Обычный луч тонкий, большой (9+
   * снарядов) толще и ярче; к концу жизни гаснет.
   */
  drawLasers(ctx) {
    const ls = this.lasers;
    if (!ls || !ls.length) return;
    const L = this.cfg.laser;
    const t = this.clock;
    const glowBy = [this.getGlow('blue'), this.getGlow(), this.getGlow('blue'), this.getGlow('gold'), this.getGlow(true)];
    const puffSp = this.getPuff();
    ctx.save();
    ctx.lineCap = 'round';
    ctx.globalCompositeOperation = 'lighter';
    for (let li = 0; li < ls.length; li++) {
      const l = ls[li];
      const fade = Math.min(1, (l.life - l.age) / 0.25) * Math.min(1, l.age / 0.04 + 0.35);
      l.pulse = Math.max(0, l.pulse - 0.06);
      const x0 = l.x + l.dx * 10;
      const y0 = l.y + l.dy * 10;
      const x1 = l.x + l.dx * l.len;
      const y1 = l.y + l.dy * l.len;
      const flick = 0.9 + 0.1 * Math.sin(t * 70 + li * 3.7) + l.pulse * 0.25;
      const w = (l.big ? l.width * 0.5 : l.width * 0.26) * flick; // обычный луч около 2.6 единицы
      const ph = !!l.gen;
      const zp = !!l.zap;
      const zk = (l.burnDmg > 0 ? 1 : 0) | (l.frost ? 2 : 0);
      const el = ph ? 4 : zk; // 0 синий, 1 огонь, 2 мороз, 3 пар, 4 фантом
      const glow = glowBy[el];
      const rgb = zp ? ZAP_RGB[zk] : LASER_RGB[el];
      const core = zp ? ZAP_CORE[zk] : LASER_CORE[el];
      if (zp) { this.drawZapArc(ctx, x0, y0, x1, y1, w, fade, li, rgb, core); } else {
      ctx.strokeStyle = 'rgba(' + rgb + ',' + 0.1 * fade + ')';
      ctx.lineWidth = w * 6;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.strokeStyle = 'rgba(' + rgb + ',' + 0.22 * fade + ')';
      ctx.lineWidth = w * 3;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.strokeStyle = 'rgba(' + rgb + ',' + 0.7 * fade + ')';
      ctx.lineWidth = w * 1.5;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.strokeStyle = 'rgba(' + core + ',' + fade + ')';
      ctx.lineWidth = Math.max(0.9, w * 0.6);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      }
      if (!zp && el !== 0 && el !== 4) this.laserElement(ctx, el, x0, y0, x1, y1, w, fade, li, t, puffSp);
      // Вспышка у посоха и точка попадания.
      const g0 = w * 5;
      ctx.globalAlpha = 0.7 * fade;
      ctx.drawImage(glow, x0 - g0, y0 - g0, g0 * 2, g0 * 2);
      const g1 = w * (7 + 2 * Math.sin(t * 50 + li));
      ctx.globalAlpha = 0.85 * fade;
      ctx.drawImage(glow, x1 - g1, y1 - g1, g1 * 2, g1 * 2);
      ctx.globalAlpha = fade;
      ctx.fillStyle = 'rgba(' + core + ',1)';
      ctx.beginPath();
      ctx.arc(x1, y1, Math.max(1, w * 0.7), 0, TAU);
      ctx.fill();
      // Искры, разлетающиеся от точки попадания.
      for (let k = 0; k < 3; k++) {
        const sp = (t * 3.3 + k * 0.33 + li * 0.17) % 1;
        const a = li * 2.3 + k * 2.1 + Math.floor(t * 3.3 + k * 0.33 + li * 0.17) * 1.7;
        const d = sp * w * 6;
        ctx.globalAlpha = (1 - sp) * fade * 0.9;
        ctx.beginPath();
        ctx.arc(x1 + Math.cos(a) * d, y1 + Math.sin(a) * d, Math.max(0.6, w * 0.2 * (1 - sp)), 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  /**
   * Стихия на луче (вдоль всей длины, без хранения состояния): огонь, угли и язычки, тянущиеся вверх;
   * мороз, мерцающие ледяные искорки; пар, мягкие облачка, плывущие по лучу.
   */
  laserElement(ctx, el, x0, y0, x1, y1, w, fade, li, t, puffSp) {
    w = Math.max(w * 1.6, 4.4); // детали крупнее самого луча: иначе не видно
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const n = Math.max(4, Math.min(18, Math.round(len / (el === 2 ? 20 : 26))));
    ctx.save();
    for (let i = 0; i < n; i++) {
      const hv = Math.sin((i + li * 7.3) * 12.9898) * 43758.5453;
      const hr = hv - Math.floor(hv);
      if (el === 1) { // огонь: угли поднимаются от луча
        const u = (i + hr) / n;
        const ph = (t * 1.1 + hr * 3 + i * 0.37) % 1;
        const off = (hr - 0.5) * w * 2.2 + ph * w * 5 * (hr < 0.5 ? 1 : -1);
        const px = x0 + dx * u + nx * off;
        const py = y0 + dy * u + ny * off - ph * w * 2.5;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = (1 - ph) * fade * 0.9;
        ctx.fillStyle = hr > 0.55 ? '#ffd36a' : '#ff8a2a';
        ctx.beginPath(); ctx.arc(px, py, Math.max(0.7, w * 0.22 * (1 - ph * 0.6)), 0, TAU); ctx.fill();
        if (i % 4 === 0) { // язычок пламени над лучом
          const h = w * (2.2 + 1.2 * Math.sin(t * 17 + i)) * (0.6 + 0.4 * fade);
          const bw = w * 0.7;
          ctx.globalAlpha = 0.7 * fade;
          ctx.fillStyle = '#ff7a2a';
          ctx.beginPath(); ctx.moveTo(px - bw, py + w); ctx.lineTo(px - bw * 0.4, py + w - h * 0.5); ctx.lineTo(px, py + w - h); ctx.lineTo(px + bw * 0.4, py + w - h * 0.55); ctx.lineTo(px + bw, py + w); ctx.closePath(); ctx.fill();
        }
      } else if (el === 2) { // мороз: искорки-кристаллы мерцают на лучe
        const u = (i + 0.2 + 0.6 * hr) / n;
        const tw = 0.5 + 0.5 * Math.sin(t * (6 + 5 * hr) + i * 2.1);
        if (tw < 0.2) continue;
        const px = x0 + dx * u + nx * (hr - 0.5) * w * 3;
        const py = y0 + dy * u + ny * (hr - 0.5) * w * 3;
        const s = w * (1.1 + 0.9 * hr) * tw;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = fade * tw;
        ctx.fillStyle = '#eafaff';
        ctx.beginPath(); ctx.moveTo(px, py - s); ctx.lineTo(px + s * 0.2, py); ctx.lineTo(px, py + s); ctx.lineTo(px - s * 0.2, py); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(px - s, py); ctx.lineTo(px, py - s * 0.2); ctx.lineTo(px + s, py); ctx.lineTo(px, py + s * 0.2); ctx.closePath(); ctx.fill();
      } else { // пар: облачка медленно плывут вдоль луча и растут
        const ph = (t * 0.7 + hr + i / n) % 1;
        const px = x0 + dx * ph + nx * (hr - 0.5) * w * 3;
        const py = y0 + dy * ph + ny * (hr - 0.5) * w * 3 - ph * w * 2;
        const s = w * (2.4 + 3 * ph);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 0.34 * fade * Math.sin(Math.PI * ph);
        ctx.drawImage(puffSp, px - s, py - s, s * 2, s * 2);
      }
    }
    ctx.restore();
  }

  /**
   * Дробь это частицы. Без модов: яркие синие искры-чёрточки. С Горением: огненное дыхание, пышущие язычки, которые
   * растут и гаснут по пути. С Морозом: ледяной пар, холодные клубы. Мороз и Горение вместе: простой белый пар.
   * Возраст частицы: 1 - left / mx (доля пройденной дальности). Искры рисуются одним путём, клубы спрайтами.
   */
  drawPellets(ctx, alpha, viewL, viewR, viewT, viewB) {
    const P = this.pellets;
    if (!P || !P.n) return;
    const t = this.clock;
    const puff = this.getPuff();
    const gOr = this.getGlow();
    const gGold = this.getGlow('gold');
    const gBl = this.getGlow('blue');
    // Проход 1: клубы и огонь (сложение цветов для огня и льда, обычное наложение для пара).
    ctx.globalCompositeOperation = 'lighter';
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < P.n; i++) {
        const fire = P.bd[i] > 0;
        const ice = P.fr[i] === 1;
        if (!fire && !ice) continue;
        const steam = fire && ice;
        if ((pass === 0) === steam) continue; // пар рисуем вторым проходом, обычным наложением
        const x = P.px[i] + (P.x[i] - P.px[i]) * alpha;
        const y = P.py[i] + (P.y[i] - P.py[i]) * alpha;
        if (x < viewL - 20 || x > viewR + 20 || y < viewT - 20 || y > viewB + 20) continue;
        const u = Math.min(1, 1 - P.left[i] / (P.mx[i] || 1));
        const sp = Math.hypot(P.vx[i], P.vy[i]) || 1;
        const bx = -P.vx[i] / sp;
        const by = -P.vy[i] / sp;
        const nx = -by;
        const ny = bx;
        const sd = P.sd[i]; // стабильное зерно дробинки: клубы не прыгают, когда соседние дробинки гаснут
        // Шлейф из клубов позади дробинки. Клубы разбросаны в стороны всё шире с возрастом, плывут плавно и
        // не стоят на линии: вместе они дают расползающуюся струю дыхания или пара.
        const puffs = steam ? 6 : 5;
        for (let j = 0; j < puffs; j++) {
          const h1 = Math.sin(sd * 127.1 + j * 311.7) * 43758.5453;
          const r1 = h1 - Math.floor(h1);
          const h2 = Math.sin(sd * 269.5 + j * 183.3) * 43758.5453;
          const r2 = h2 - Math.floor(h2);
          const uu = Math.min(1, u + j * 0.04);
          const back = j * 5 + r1 * 5;
          const spread = (r2 - 0.5) * 2 * (3 + 16 * uu); // в стороны шире с возрастом
          const drift = Math.sin(t * 1.4 + sd * 6.28 + j * 1.3) * 2.5 * uu;
          const cx = x + bx * back + nx * (spread + drift);
          const cy = y + by * back + ny * (spread + drift) - uu * (steam ? 10 : 7) * (0.5 + r1);
          const fall = 1 - j * 0.13;
          const sz = 0.8 + 0.5 * r2;
          if (steam) {
            const s2 = (6 + 13 * uu) * sz;
            ctx.globalAlpha = 0.34 * (1 - uu) * Math.min(1, uu * 5 + 0.45) * fall;
            ctx.drawImage(puff, cx - s2, cy - s2, s2 * 2, s2 * 2);
          } else if (fire) {
            const s2 = (4.5 + 9 * uu) * sz;
            ctx.globalAlpha = Math.min(1, 1.15 - uu) * 0.6 * fall;
            ctx.drawImage(j === 0 && uu < 0.35 ? gGold : gOr, cx - s2, cy - s2, s2 * 2, s2 * 2);
          } else {
            const s2 = (4.5 + 8 * uu) * sz;
            ctx.globalAlpha = 0.45 * (1 - uu * 0.9) * fall;
            ctx.drawImage(gBl, cx - s2, cy - s2, s2 * 2, s2 * 2);
            ctx.globalAlpha = 0.3 * (1 - uu) * fall;
            ctx.globalCompositeOperation = 'source-over';
            ctx.drawImage(puff, cx - s2, cy - s2, s2 * 2, s2 * 2);
            ctx.globalCompositeOperation = 'lighter';
          }
        }
      }
      ctx.globalCompositeOperation = pass === 0 ? 'source-over' : 'lighter';
    }
    // Проход 2: обычные дробинки: тонкие светящиеся чёрточки по ходу полёта, одним путём.
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < P.n; i++) {
      if (P.bd[i] > 0 || P.fr[i] === 1) continue;
      const x = P.px[i] + (P.x[i] - P.px[i]) * alpha;
      const y = P.py[i] + (P.y[i] - P.py[i]) * alpha;
      if (x < viewL - 12 || x > viewR + 12 || y < viewT - 12 || y > viewB + 12) continue;
      const sp = Math.hypot(P.vx[i], P.vy[i]) || 1;
      ctx.moveTo(x, y);
      ctx.lineTo(x - (P.vx[i] / sp) * 9, y - (P.vy[i] / sp) * 9);
    }
    ctx.lineWidth = 3.2;
    ctx.strokeStyle = 'rgba(90,160,255,0.35)';
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(225,242,255,0.95)';
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.lineCap = 'butt';
  }

  /**
   * Спектральные клинки: светящиеся, цвет и форма по модам. Обычный: меч с гардой; Мороз: ледяной кристалл; Горение:
   * огненная стрела; Мороз и Горение вместе: кристальная стрела. В полёте за клинком тянется хвост, фантомные фиолетовые.
   * С Лазером клинки это светящиеся сферы. Остриё смотрит по ходу полёта (на орбите наружу).
   */
  drawBlades(ctx) {
    const bl = this.blades;
    if (!bl || !bl.length) return;
    const B = this.cfg.blades;
    const k = B.size * 0.8;
    const t = this.clock;
    const glows = [this.getGlow('blue'), this.getGlow('blue'), this.getGlow(), this.getGlow('gold'), this.getGlow(true), this.getGlow('gold')];
    const tails = [this.getComet('Blue'), this.getComet('Ice'), this.getComet('Fire'), this.getComet('Steam'), this.getComet('Violet'), this.getComet('Gold')];
    const mainC = ['#3f86ff', '#7fd8ff', '#ff8a2a', '#d9efff'];
    const liteC = ['#d6ecff', '#f2fcff', '#fff0c8', '#ffffff'];
    const glowGold = this.getGlow('gold');
    // Проход 1: хвосты и свечение сложением цветов.
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < bl.length; i++) {
      const b = bl[i];
      const kd = b.kind | 0;
      const fly = b.state === 'fly';
      const gl = b.zap ? glowGold : b.gen ? glows[4] : glows[kd];
      const pulse = 0.85 + 0.15 * Math.sin(t * 8 + i * 1.3);
      if (fly && !b.sphere) {
        const sc = (k * 0.5) / 14;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.a);
        ctx.globalAlpha = 0.7 * Math.min(1, (b.age || 0) / 0.08);
        ctx.scale(0.55, 1);
        ctx.drawImage(tails[b.gen ? 4 : kd], -224 * sc, -32 * sc, 256 * sc, 64 * sc);
        ctx.restore();
      }
      const g = k * (fly ? 4.6 : 3.8) * pulse;
      ctx.globalAlpha = fly ? 0.75 : 0.55;
      ctx.drawImage(gl, b.x - g, b.y - g, g * 2, g * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
    // Проход 2: сами клинки.
    ctx.lineJoin = 'round';
    for (let i = 0; i < bl.length; i++) {
      const b = bl[i];
      const kd = b.kind | 0;
      const mc = b.zap ? ['#ffd21e', '#7fd8ff', '#ff9a3a', '#ffffff'][b.kind | 0] : b.gen ? '#a577ff' : mainC[kd];
      const lc = b.zap ? '#fffbe0' : b.gen ? '#f0e4ff' : liteC[kd];
      ctx.globalAlpha = 1;
      if (b.zap && !b.sphere) { // клинок-молния: зигзаг по ходу полёта
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.a);
        ctx.scale(k, k);
        ctx.fillStyle = mc;
        ctx.strokeStyle = lc;
        ctx.lineWidth = 1 / k;
        ctx.beginPath();
        ctx.moveTo(15, 0); ctx.lineTo(3, -4.5); ctx.lineTo(5, -0.5); ctx.lineTo(-6, -4); ctx.lineTo(-14, 0);
        ctx.lineTo(-6, 4); ctx.lineTo(1, 1); ctx.lineTo(3, 4.5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        continue;
      }
      if (b.sphere) { // с Лазером клинки это светящиеся сферы
        const rr = k * (b.state === 'fire' ? 0.78 : 0.62);
        ctx.fillStyle = mc;
        ctx.beginPath();
        ctx.arc(b.x, b.y, rr, 0, TAU);
        ctx.fill();
        ctx.fillStyle = lc;
        ctx.beginPath();
        ctx.arc(b.x - rr * 0.15, b.y - rr * 0.2, rr * 0.55, 0, TAU);
        ctx.fill();
        continue;
      }
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.a);
      ctx.scale(k, k);
      ctx.lineWidth = 1.1 / k;
      ctx.strokeStyle = 'rgba(235,246,255,0.9)';
      // part: многоугольник в единицах k; verхняя грань светлее нижней
      const part = (pts, fill) => {
        ctx.beginPath();
        tracePoly(ctx, pts, 1);
        ctx.fillStyle = fill;
        ctx.fill();
      };
      if (kd === 0) { // меч
        part([2.6, 0, 0.4, -0.34, -0.9, -0.3, -0.9, 0.3, 0.4, 0.34], mc);
        part([2.6, 0, 0.4, -0.34, -0.9, -0.3, -0.9, 0], lc);
        part([-0.9, -0.78, -1.18, -0.78, -1.18, 0.78, -0.9, 0.78], mc);
        part([-1.18, -0.13, -1.85, -0.13, -1.85, 0.13, -1.18, 0.13], mc);
        ctx.beginPath(); tracePoly(ctx, [2.6, 0, 0.4, -0.34, -0.9, -0.3, -0.9, 0.3, 0.4, 0.34], 1); ctx.stroke();
      } else if (kd === 1) { // ледяной кристалл
        const cr = [2.3, 0, 0.9, -0.62, -0.9, -0.52, -1.7, 0, -0.9, 0.52, 0.9, 0.62];
        part(cr, mc);
        part([2.3, 0, 0.9, -0.62, -0.9, -0.52, -0.2, 0], lc);
        part([0.9, 0.62, -0.9, 0.52, -0.2, 0, 2.3, 0], 'rgba(60,150,230,0.55)');
        part([0.3, -0.62, 0.9, -1.25, 0.1, -0.55], mc);
        part([-0.5, 0.52, -0.9, 1.05, -0.1, 0.55], mc);
        ctx.beginPath(); tracePoly(ctx, cr, 1); ctx.stroke();
      } else if (kd === 2) { // огненная стрела
        part([2.8, 0, 1.7, -0.62, 1.7, 0.62], lc);
        part([1.75, -0.13, -1.6, -0.13, -1.6, 0.13, 1.75, 0.13], mc);
        part([-1.2, 0, -2.1, -0.65, -1.8, 0], mc);
        part([-1.2, 0, -2.1, 0.65, -1.8, 0], mc);
        part([-1.6, 0, -2.5, -0.2, -2.9, 0, -2.5, 0.2], 'rgba(255,200,90,0.85)');
        ctx.beginPath(); tracePoly(ctx, [2.8, 0, 1.7, -0.62, 1.7, 0.62], 1); ctx.stroke();
      } else { // кристальная стрела (пар)
        part([2.8, 0, 1.7, -0.7, 0.9, 0, 1.7, 0.7], lc);
        part([2.8, 0, 1.7, -0.7, 0.9, 0], 'rgba(150,215,255,0.75)');
        part([0.95, -0.12, -1.6, -0.12, -1.6, 0.12, 0.95, 0.12], mc);
        part([-1.2, 0, -2.1, -0.65, -1.8, 0], '#ff9a44');
        part([-1.2, 0, -2.1, 0.65, -1.8, 0], '#ff9a44');
        ctx.beginPath(); tracePoly(ctx, [2.8, 0, 1.7, -0.7, 0.9, 0, 1.7, 0.7], 1); ctx.stroke();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  /** Мягкий клуб пара: белый центр, голубоватый край, прозрачная граница. Один спрайт на все клубы. */
  getPuff() {
    if (this.puff) return this.puff;
    const S = 96;
    const cv = makeCanvas(S, S);
    const g = cv.getContext('2d');
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, 'rgba(240,248,255,0.9)');
    gr.addColorStop(0.45, 'rgba(190,220,250,0.5)');
    gr.addColorStop(1, 'rgba(150,195,240,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
    this.puff = cv;
    return cv;
  }

  /**
   * Облако пара (связка Мороз + Горение): холодный туман из клубов, которые медленно вращаются вокруг тёплого
   * оранжевого ядра; от края тянутся лёгкие завитки, вверх уходят искры. К концу жизни тает и съёживается.
   */
  drawClouds(ctx) {
    const cl = this.clouds;
    if (!cl.length) return;
    const st = this.cfg.steam;
    const puff = this.getPuff();
    const warm = this.getGlow();
    const t = this.clock;
    for (const c of cl) {
      const life = c.age / st.duration;
      const fade = Math.min(1, (1 - life) * 4);
      const grow = Math.min(1, c.age / 0.25 + 0.3);
      const R = st.radius * grow * (0.85 + 0.15 * fade);
      // Тёплое ядро: пар греется огнём изнутри.
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = fade * (0.5 + 0.12 * Math.sin(t * 3 + c.seed));
      ctx.drawImage(warm, c.x - R * 0.7, c.y - R * 0.7, R * 1.4, R * 1.4);
      ctx.globalCompositeOperation = 'source-over';
      // Клубы по двум кольцам, вращаются в разные стороны; соседние перекрываются, получается ровное облако.
      for (let ring = 0; ring < 2; ring++) {
        const n = ring ? 5 : 7;
        const rr = R * (ring ? 0.38 : 0.66);
        const sz = R * (ring ? 0.62 : 0.5);
        for (let i = 0; i < n; i++) {
          const a = c.seed + (i / n) * TAU + c.age * (ring ? -0.45 : 0.3);
          const bob = 1 + 0.1 * Math.sin(c.age * 1.6 + i * 2.1 + ring);
          const d = rr * bob;
          const s2 = sz * (0.9 + 0.2 * Math.sin(c.age * 1.1 + i * 1.7));
          ctx.globalAlpha = fade * (ring ? 0.7 : 0.55);
          ctx.drawImage(puff, c.x + Math.cos(a) * d - s2, c.y + Math.sin(a) * d * 0.9 - s2, s2 * 2, s2 * 2);
        }
      }
      // Искры поднимаются от ядра.
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = '#ffb870';
      for (let i = 0; i < 5; i++) {
        const ph = (c.age * 0.6 + i * 0.2 + c.seed) % 1;
        const a = c.seed * 3 + i * 1.9;
        ctx.globalAlpha = fade * (1 - ph) * 0.8;
        ctx.beginPath();
        ctx.arc(c.x + Math.cos(a) * R * 0.45 * (0.4 + ph * 0.6), c.y + Math.sin(a) * R * 0.3 - ph * R * 0.55, 1.4, 0, TAU);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
  }
}
