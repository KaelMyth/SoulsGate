// Отрисовка на Canvas 2D: цветные фигуры вместо арта.
// Мир рисуется с интерполяцией между прошлым и текущим шагом логики (alpha из цикла).

import { getTelegraph } from './systems_attacks.js';
import { HitFx } from './render_hitfx.js';
import { SpellFx } from './render_spellfx.js';
import { DashFx } from './render_dashfx.js';
import { InspirationFx } from './render_inspiration.js';
import { BlackSunFx } from './render_blacksun.js';
import { NorthGateArt } from './render_northgate.js';
import { CastleHallArt } from './render_castle_hall.js';
import { HallVision } from './render_hall_vision.js';
import { IsometricIceEnemies } from './render_isometric_enemies.js';
import { IceVolumeArt } from './render_ice_volume.js';
import { ApotheosisArt } from './render_apotheosis.js';
import { ApoFinaleFx } from './render_apofinale.js';

const TAU = Math.PI * 2;
const TROOP_SIZE = 48, TROOP_HALF = 24; // клетка спрайта воина в мировых единицах (радиус 12 → хватает с запасом для тарана)
// Цвета молнии по стихиям: 0 жёлтая, 1 огонь (оранжевая), 2 мороз (синяя), 3 все три (белая).
const ZAP_RGB = ['255,225,70', '255,58,67', '110,205,255', '255,255,255'];
const LASER_RGB = ['110,205,255', '255,140,50', '150,242,255', '236,242,252', '190,120,255']; // луч: синий, огонь, мороз, пар, фантом
const LASER_CORE = ['232,248,255', '255,240,200', '240,252,255', '255,255,255', '248,232,255'];
const ZAP_CORE = ['255,252,225', '255,210,198', '232,248,255', '255,255,255'];
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

// Пепельный Арх (жук-оленёнок, вытянутый): надкрылья, переднеспинка, голова, кусала (доли радиуса).
const ARCH_ELY = [0.2, -0.5, -0.1, -0.68, -0.7, -0.7, -1.15, -0.52, -1.42, -0.2, -1.42, 0.2, -1.15, 0.52, -0.7, 0.7, -0.1, 0.68, 0.2, 0.5];
const ARCH_ABD = [-0.2, -0.6, -0.9, -0.66, -1.5, -0.44, -1.98, 0, -1.5, 0.44, -0.9, 0.66, -0.2, 0.6];
const ARCH_PRON = [1.05, -0.46, 0.8, -0.62, 0.35, -0.64, 0.2, -0.5, 0.2, 0.5, 0.35, 0.64, 0.8, 0.62, 1.05, 0.46];
const ARCH_HEAD = [1.0, -0.34, 1.3, -0.3, 1.55, -0.14, 1.55, 0.14, 1.3, 0.3, 1.0, 0.34];
/** Полуширина надкрылий на глубине x (по контуру ARCH_ELY). */
function archHw(x) {
  const P = ARCH_ELY;
  if (x >= P[0]) return Math.abs(P[1]);
  for (let i = 0; i < 5; i++) {
    const x0 = P[i * 2];
    const x1 = P[i * 2 + 2];
    if (x <= x0 && x >= x1) return Math.abs(P[i * 2 + 1]) + (Math.abs(P[i * 2 + 3]) - Math.abs(P[i * 2 + 1])) * (x0 - x) / (x0 - x1);
  }
  return 0.2;
}

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
    this.spellFx = new SpellFx();
    this.cfg = cfg;
    this.arena = deps.arena;
    this.northGate = this.arena.northWall ? new NorthGateArt(this.arena) : null;
    this.castleHall=new CastleHallArt(this.arena);
    this.hallVision=new HallVision(cfg);
    // 2 — новая объёмная модель; 1 — предыдущая версия; false — исходный top-down.
    this.isoEnemies=cfg.render.iceModelVersion===1
      ?new IsometricIceEnemies(this):new IceVolumeArt(this);
    this.isoEnemies.enabled=cfg.render.isometricIceEnemies!==false;
    this.castleTransition=null;
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
    this.kineticBlades = deps.kineticBlades || [];
    this.incarnation = deps.incarnation || null;
    this.inspiration = deps.inspiration || null;
    this.inspirationFx = new InspirationFx(this);
    this.aura = deps.aura || null;
    this.synergyCasts = deps.synergyCasts || [];
    this.synergyFlashes = deps.synergyFlashes || [];
    this.absorption = deps.absorption || null;
    this.blackSun = deps.blackSun || null;
    this.lightdash = deps.lightdash || null;
    this.zapBolts = deps.zapBolts || [];
    this.dashBeams = deps.dashBeams || [];
    this.gravityDash = deps.gravityDash || null;
    this.fires = deps.fires || [];
    this.pellets = deps.pellets || null;
    this.hud = deps.hud || null;
    this.dpr = 1;
    this.w = 1; // размер в CSS-пикселях
    this.h = 1;
    this.floor = null;            // картинка пола арены: строится при первой отрисовке
    this.details = null;          // сухие кусты, камешки и наметы на полу
    this.voidPalm = null;         // одна детальная кисть для всех рук Апофеоза
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
      k: 0, pk: 0, flash: 0, wasGravity: false,
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
    this.apoFin = new ApoFinaleFx(this); // Апофеоз: крик, обвал платформы, эпилог, портал (render_apofinale.js)
    this.apoArt = new ApotheosisArt(this); // Апофеоз и апостолы: маска-солнце и мантии (render_apotheosis.js)
    this.blackSunFx = new BlackSunFx(this);
    this.dashfx = new DashFx(this); // эффекты рывков, костров и героя-молнии (render_dashfx.js)
    this.dashKind = 0;     // стихия кинетического рывка (0 нет, 1 огонь, 2 мороз, 3 пар): выставляет игра
    this.dashKinetic = false;
    this.hitfx = new HitFx(this); // частицы попаданий по врагам (render_hitfx.js)
    this.getPuff(); // прогреваем маленький спрайт дымки до первого убийства, не в боевом кадре
    this.beetleState = new WeakMap();
    this.fxSeed = new WeakMap(); // зерно врага для внешнего вида его состояний (лёд, огонь) // у каждого жука свой угол поворота и фаза анимации (только для вида)
  }

  /** Подогнать размер холста под экран и плотность пикселей. Зовётся при изменении размера. */
  resize() {
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    const nativeDpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
    this.dpr = Math.max(1, Math.min(nativeDpr, this.cfg.render.maxDpr));
    this.troopSprites = null; // спрайты воинов зависят от плотности пикселей
    this.w = w;
    this.h = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.camera.setScreen(w, h);
  }

  draw(alpha) {
    this.frameNo = (this.frameNo || 0) + 1;
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
    if(arena.location==='courtyard' && !this.floor)this.floor=buildFloorTexture(arena,C);
    const gx0 = Math.max(viewL, arena.left);
    const gx1 = Math.min(viewR, arena.right);
    const gy0 = Math.max(viewT, arena.top);
    const gy1 = Math.min(viewB, arena.bottom);
    if(arena.location==='hall'){
      this.castleHall.drawFloor(ctx,viewL,viewT,viewR,viewB);
      if(this.boss?.enemy?.active && this.boss.enemy.def===this.cfg.enemies.tartas){
        for(const p of this.castleHall.torches){
          const flicker=Math.sin(this.clock*13+p.x)*3;
          const glow=ctx.createRadialGradient(p.x,p.y-13,2,p.x,p.y-13,42);
          glow.addColorStop(0,'rgba(255,179,67,.7)');
          glow.addColorStop(1,'rgba(255,120,24,0)');
          ctx.fillStyle=glow;ctx.fillRect(p.x-44,p.y-57,88,88);
          ctx.fillStyle='#ffb84e';ctx.beginPath();
          ctx.moveTo(p.x-6,p.y-8);ctx.quadraticCurveTo(p.x-11,p.y-24,p.x+flicker,p.y-34);
          ctx.quadraticCurveTo(p.x+11,p.y-18,p.x+5,p.y-8);ctx.closePath();ctx.fill();
          ctx.fillStyle='#fff2b0';ctx.beginPath();ctx.ellipse(p.x,p.y-12,3,7,0,0,Math.PI*2);ctx.fill();
        }
      }
    }else if(arena.location==='sanctum'){
      this.drawSanctum(ctx,arena);
    }else if(gx1>gx0&&gy1>gy0){
      ctx.drawImage(this.floor,gx0-arena.left,gy0-arena.top,gx1-gx0,gy1-gy0,gx0,gy0,gx1-gx0,gy1-gy0);
    }

    // Граница арены: тёмная кромка, основное затемнение к краям уже в картинке пола.
    ctx.lineWidth = 8;
    ctx.strokeStyle = C.arenaEdge;
    ctx.strokeRect(arena.left - 4, arena.top - 4, arena.width + 8, arena.height + 8);

    if(arena.location==='courtyard'){
      this.drawGroundDetails(C,viewL,viewR,viewT,viewB);
    }
    // Северная крепость уже в системе координат карты, а не нарисована
    // поверх HUD. Один кэшированный спрайт и живой огонь без тяжелых ассетов.
    if(this.northGate && arena.location==='courtyard'){
      this.northGate.gateProgress=this.castleTransition?.open||0;
      this.northGate.draw(ctx,viewL,viewR,viewT,viewB,this.clock);
    }

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
      // Срез массива камня: тёмная глубина под кромкой, средний скол и холодная грань.
      const edgePath=()=>{
        ctx.beginPath();
        if(z.poly){ctx.moveTo(z.poly[0].x,z.poly[0].y);for(let i=1;i<z.poly.length;i++)ctx.lineTo(z.poly[i].x,z.poly[i].y);ctx.closePath();}
        else ctx.rect(z.left,z.top,z.right-z.left,z.bottom-z.top);
      };
      ctx.save();ctx.translate(0,8);
      edgePath();ctx.lineWidth=14;ctx.strokeStyle='rgba(6,5,14,.92)';ctx.stroke();
      edgePath();ctx.lineWidth=7;ctx.strokeStyle='rgba(55,48,68,.95)';ctx.stroke();
      ctx.restore();
      edgePath();ctx.lineWidth=6;ctx.strokeStyle='rgba(34,28,48,.92)';ctx.stroke();
      edgePath();ctx.lineWidth=2;ctx.strokeStyle='rgba(214,196,177,.82)';ctx.stroke();
      edgePath();ctx.lineWidth=.8;ctx.strokeStyle='rgba(252,235,205,.7)';ctx.stroke();
      ctx.restore();
    }

    if(arena.location==='courtyard')this.drawSnow(ctx,viewL,viewR,viewT,viewB);
    if(arena.location==='hall' && this.sanctumGate?.open>=0)this.drawHallPortcullis(ctx,arena,this.sanctumGate.open);

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
    this.drawAbsorptionMarker(ctx); // #153 тёмные воронки, втягивающие души

    // Цель автоатаки: тёплое свечение под врагом, без контуров (поверх врага ляжет лёгкий тон, ниже).
    const target = this.autoattack && this.autoattack.target;
    this.updateTargetGlow(target && target.active ? target : null, this.dt);
    this.drawTargetGlow(alpha, false);

    // Убитые рыцари и Тартас оседают на землю, а не пропадают в том же кадре.
    this.isoEnemies.drawDeaths(ctx,this.dt,viewL,viewR,viewT,viewB);

    // Враги.
    const en = this.enemies.items;
    for (let i = 0; i < en.length; i++) {
      const e = en[i];
      if (!e.active) continue;
      const ex = e.prevX + (e.x - e.prevX) * alpha;
      const ey = e.prevY + (e.y - e.prevY) * alpha;
      const r = e.radius;
      // Изометрические шлемы, шипы и плащи выше точки-опоры на земле.
      // Учитываем высоту силуэта, чтобы он не пропадал на краю камеры.
      const iso = this.isoEnemies.enabled && this.isoEnemies.kind(e);
      const margin = iso ? r * (iso === 'tartas' ? 3.6 : 3.3) : r;
      if (ex + margin < viewL || ex - margin > viewR ||
          ey + r * 1.5 < viewT || ey - margin > viewB) continue;
      if(e.spawnT>0){
        this.drawEnemyMaterialization(e,ex,ey);
      }else{
        this.drawEnemy(e,ex,ey,C);
      }
    }

    // Щит на уровне бойцов, его полотно видно поверх боевого построения.
    this.barriers?.draw(ctx,this.clock);
    this.drawAbsorptionVeils(ctx);
    this.drawDust(this.dt);
    this.hitfx.draw(ctx, this.dt);
    this.drawBeams();
    this.drawHandsForeground(); // кисти видны над противниками, под героем

    this.drawTargetGlow(alpha, true);
    this.drawAbsorptionFlash(ctx); // #153 дымка, частицы и анимированная вспышка

    if (hero.active) {
      if(arena.location==='sanctum')this.drawHeroSigils(ctx,hx,hy);
      this.drawGravityDash(ctx);
      if (!this.defense?.gravityAuraMode) this.drawAura(ctx, hx, hy); // в связке общий новый горизонт вместо двух перекрывающихся кругов
      this.blackSunFx.drawBack(ctx,hx,hy);
      this.inspirationFx.drawBack(ctx,hx,hy);
      this.dashfx.frame(ctx, this.dt, hx, hy);
      if (hero.incarnationLaser) this.drawLaserIncarnation(ctx, hx, hy);
      else if (hero.incarnationT > 0 && this.incarnation?.bladeQueue) { /* герой скрыт: игрок управляет стаей */ }
      else if (hero.incarnationT > 0 && this.incarnation?.gravityTime > 0) { this.drawGravityAfterimages(ctx); this.drawHero(hx, hy, C); }
      else if (hero.incarnationT > 0) this.drawIncarnation(hx, hy); // вместо модели героя парящая энергетическая комета
      else if (this.lightdash && this.lightdash.active) this.drawLightHero(ctx, hx, hy); // рывок-молния
      else if (this.defense?.laserDashCharging) this.drawLaserDashHero(ctx, hx, hy);
      else this.drawHero(hx, hy, C);
      if (!this.incarnation?.bladeQueue && !hero.incarnationLaser) {
        this.drawBlock(hx, hy, C);
        this.drawHeroArcs(hx, hy, C);
      }
      this.blackSunFx.drawFront(ctx,hx,hy);
      this.inspirationFx.drawFront(ctx,hx,hy);
    }

    this.drawFlash(viewL, viewR, viewT, viewB);
    this.drawOmni();
    this.drawScream();
    this.drawFinale();
    this.drawLasers(ctx);
    this.inspirationFx.drawSynergies(ctx,hx,hy);
    this.drawLaserIncarnationPaths(ctx);
    for(const f of this.synergyFlashes){
      this.spellFx.absorptionSphereBurst(ctx,f.x,f.y,f.r,f.time/Math.max(.01,f.maxTime),this.clock,f.phantom?'phantom':'blood');
    }
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
    // Между моделью героя и камерой стоят настоящие колонны. При перекрытии
    // персонажа их объём постепенно растворяется, основание остаётся на полу.
    if(arena.location==='hall' && !arena.zone)
      this.castleHall.drawColumns(ctx,{x:hx,y:hy,radius:hero.radius,active:hero.active},
        this.dt,viewL,viewR,viewT,viewB);

    this.drawNegative(viewL, viewR, viewT, viewB);
    // Единственная низкоразрешённая маска тьмы: после мировых эффектов
    // и колонн, перед HUD. Посох, навыки и летящие снаряды пробивают свет.
    this.hallVision.draw(ctx,this,alpha);
    if(arena.location==='hall')this.drawHallLights(ctx,arena);
    if(arena.location==='courtyard')this.drawBlizzard(ctx,w,h,dpr,camX,camY,s);
    if(arena.location==='sanctum')this.drawSanctumMotes(ctx,arena,viewL,viewR,viewT,viewB);

    // Стик и HUD рисуем в экранных координатах (px), поверх мира.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawStick(C);
    this.drawHud(C);
    this.drawPortalArrow();
    this.drawCastleArrow();
  }

  /** #153: тёмная воронка вокруг каждой отмеченной цели, следует за мобом. */
  /** Светящаяся задняя полусфера появляется позади моба. */
  drawAbsorptionMarker(ctx) {
    const a=this.absorption,cfg=this.cfg.absorption;
    if(a?.active && a.aiming)for(let i=0;i<a.targets.length;i++){
      const e=a.targets[i];
      if(!e?.active)continue;
      const p=1-a.timer/Math.max(.02,a.castTime||cfg.telegraph);
      const r=e.radius+cfg.ringPadding;
      this.spellFx.absorptionSphereBack(ctx,e.x,e.y,r,p,this.clock,'blood',i);
      if(e.absorptionGravity) {
        this.spellFx.gravityLens(ctx,e.x,e.y,r*.52,p,this.clock);
        this.drawAbsorptionCompression(ctx,e.x,e.y,r,p,i);
      }
    }
    if(a?.bladesConnected && a.bladeCounters) {
      let shown=0;
      for(const e of this.enemies.items) {
        if(!e?.active)continue;
        const counter=a.bladeCounters.get(e);
        if(!counter || counter.gen!==e.gen || !counter.hits)continue;
        this.drawBladeAbsorptionSigil(ctx,e.x,e.y,e.radius+cfg.ringPadding,
          Math.min(.65,counter.hits/Math.max(1,cfg.bladeHits||3)),counter.hits);
        if(++shown>=16)break;
      }
    }
    if(a?.active)for(let i=0;i<a.bladeMarks.length;i++){
      const m=a.bladeMarks[i];
      if(!m.enemy?.active || m.enemy.gen!==m.gen)continue;
      const p=1-m.remaining/Math.max(.01,m.total);
      this.drawBladeAbsorptionSigil(ctx,m.enemy.x,m.enemy.y,m.enemy.radius+cfg.ringPadding,p,3);
      this.spellFx.absorptionSphereBack(ctx,m.enemy.x,m.enemy.y,m.enemy.radius+cfg.ringPadding,p,this.clock,'blood',i+30);
    }
    if(this.synergyCasts)for(const c of this.synergyCasts){
      if(!c.enemy?.active || c.enemy.gen!==c.gen)continue;
      const p=1-c.time/Math.max(.05,c.maxTime||cfg.telegraph);
      this.spellFx.absorptionSphereBack(ctx,c.enemy.x,c.enemy.y,c.enemy.radius+cfg.ringPadding,
        p,this.clock,c.phantom?'phantom':'blood',c.gen||0);
    }
  }

  /** Передняя оболочка постепенно обволакивает и скрывает моба. */
  drawAbsorptionVeils(ctx) {
    const a=this.absorption,cfg=this.cfg.absorption;
    if(a?.active && a.aiming)for(let i=0;i<a.targets.length;i++){
      const e=a.targets[i];
      if(!e?.active)continue;
      const p=1-a.timer/Math.max(.02,a.castTime||cfg.telegraph);
      this.spellFx.absorptionSphereFront(ctx,e.x,e.y,e.radius+cfg.ringPadding,p,this.clock,'blood',i);
    }
    if(a?.active)for(let i=0;i<a.bladeMarks.length;i++){
      const m=a.bladeMarks[i];
      if(!m.enemy?.active || m.enemy.gen!==m.gen)continue;
      const p=1-m.remaining/Math.max(.01,m.total);
      this.spellFx.absorptionSphereFront(ctx,m.enemy.x,m.enemy.y,m.enemy.radius+cfg.ringPadding,p,this.clock,'blood',i+30);
    }
    if(this.synergyCasts)for(const c of this.synergyCasts){
      if(!c.enemy?.active || c.enemy.gen!==c.gen)continue;
      const p=1-c.time/Math.max(.05,c.maxTime||cfg.telegraph);
      this.spellFx.absorptionSphereFront(ctx,c.enemy.x,c.enemy.y,c.enemy.radius+cfg.ringPadding,
        p,this.clock,c.phantom?'phantom':'blood',c.gen||0);
    }
  }

  /** #153: мягкая имплозия, дымные ленты и шоковая волна; пробитие — алое. */
  drawAbsorptionFlash(ctx) {
    const a=this.absorption;
    if(!a?.flashes?.length)return;
    const duration=Math.max(.01,this.cfg.absorption.flashTime);
    for(let i=0;i<a.flashes.length;i++){
      const f=a.flashes[i];
      const mode=f.pierce?'scarlet':f.phantom?'phantom':'blood';
      if(f.pierce) this.spellFx.absorptionBurst(ctx,f.x,f.y,f.r,f.time/duration,this.clock,mode,i);
      else this.spellFx.absorptionSphereBurst(ctx,f.x,f.y,f.r,f.time/duration,this.clock,mode,i);
      if(f.vampiric) this.drawVampiricReturn(ctx,f,f.time/duration,i);
    }
  }

  /** Гравитация сжимает оболочку Поглощения: внутренняя воронка и сходящиеся волны. */
  drawAbsorptionCompression(ctx,x,y,r,progress,seed=0) {
    const p=Math.max(0,Math.min(1,progress)),t=this.clock;
    ctx.save();
    ctx.translate(x,y);
    ctx.globalCompositeOperation='lighter';
    ctx.lineCap='round';
    const size=r*(1.9-1.18*p);
    for(let i=0;i<6;i++){
      const a=i*TAU/6+t*(i%2?-.52:.43);
      const fade=(.19+.54*p)*(1-.08*i);
      for(let pass=0;pass<2;pass++){
        ctx.strokeStyle=pass?'#e4caff':'#7853c4';
        ctx.lineWidth=pass?1.15:6.5*(1-p)+2;
        ctx.globalAlpha=fade*(pass?.92:.38);
        ctx.beginPath();
        for(let j=0;j<=12;j++){
          const u=j/12;
          const rr=size*(1-.75*u)*(1+.06*Math.sin(t*4+j*.7+i));
          const ang=a+u*(2.5+2*p);
          const px=Math.cos(ang)*rr,py=Math.sin(ang)*rr*.69;
          if(!j)ctx.moveTo(px,py);else ctx.lineTo(px,py);
        }
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation='source-over';
    ctx.fillStyle='#150d2e';
    ctx.globalAlpha=.18+.45*p;
    ctx.beginPath();ctx.ellipse(0,r*.28,r*(.42-.19*p),r*(.15-.07*p),0,0,TAU);ctx.fill();
    ctx.restore();
  }

  /** Поглощение после ударов клинков: три призрачных осколка сходятся к центру метки. */
  drawBladeAbsorptionSigil(ctx,x,y,r,progress,count) {
    const p=Math.max(0,Math.min(1,progress)),t=this.clock;
    ctx.save();
    ctx.translate(x,y);
    ctx.globalCompositeOperation='lighter';
    ctx.lineCap='round';
    for(let i=0;i<3;i++){
      const active=i<count;
      const a=i*TAU/3+t*(active?.65:.28);
      const rr=r*(1.35-.72*p)+(active?0:r*.22);
      const px=Math.cos(a)*rr,py=Math.sin(a)*rr*.78;
      ctx.save();ctx.translate(px,py);ctx.rotate(a+Math.PI/2);
      ctx.globalAlpha=active?(.36+.55*p):.1;
      ctx.fillStyle=active?'#c48aff':'#6f538e';
      ctx.beginPath();ctx.moveTo(0,-r*.37);ctx.lineTo(-r*.13,r*.05);ctx.lineTo(0,r*.25);ctx.lineTo(r*.13,r*.05);ctx.closePath();ctx.fill();
      ctx.strokeStyle='#f6e5ff';ctx.lineWidth=1.2;ctx.stroke();
      ctx.restore();
      if(active){
        ctx.strokeStyle='#a870ff';ctx.lineWidth=2.1;
        ctx.globalAlpha=(.22+.5*p);
        ctx.beginPath();ctx.moveTo(px,py);
        ctx.quadraticCurveTo(Math.cos(a+.7)*r*.42,Math.sin(a+.7)*r*.42,0,0);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /** Энергия вытягивается из раны к герою при лечении Вампиризмом. */
  drawVampiricReturn(ctx,f,life,seed) {
    const p=1-Math.max(0,Math.min(1,life));
    const hx=this.hero.x,hy=this.hero.y;
    const dx=hx-f.x,dy=hy-f.y;
    const len=Math.hypot(dx,dy);
    if(len<12)return;
    const nx=-dy/len,ny=dx/len;
    const bend=Math.min(46,len*.22)*Math.sin(this.clock*6+seed);
    ctx.save();ctx.lineCap='round';ctx.globalCompositeOperation='lighter';
    for(let pass=0;pass<3;pass++){
      ctx.strokeStyle=pass===0?'#592044':pass===1?'#e05587':'#ffe3ed';
      ctx.lineWidth=pass===0?12:pass===1?4:1.25;
      ctx.globalAlpha=(1-p)*(pass===0?.14:pass===1?.36:.69);
      ctx.beginPath();ctx.moveTo(f.x,f.y);
      ctx.bezierCurveTo(f.x+dx*.22+nx*bend,f.y+dy*.22+ny*bend,
        f.x+dx*.72-nx*bend,f.y+dy*.72-ny*bend,hx,hy);
      ctx.stroke();
    }
    const glow=this.getGlow('red');
    for(let i=0;i<5;i++){
      const u=(p*.95+i*.21)%1, v=1-u;
      const bx=f.x+dx*u+3*u*v*(nx*bend-ny*bend)*.6;
      const by=f.y+dy*u+3*u*v*(ny*bend+nx*bend)*.6;
      const size=6+4*(1-u);
      ctx.globalAlpha=(1-p)*Math.sin(Math.PI*u)*.85;
      ctx.drawImage(glow,bx-size,by-size,size*2,size*2);
    }
    ctx.restore();
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
      if(g.inspired)this.inspirationFx.drawGem(ctx,g,x,y);
    }
  }

  /** Телеграфы атак: зона заполняется за время замаха, к концу контур мигает. Не яркие: полупрозрачные. */
  drawTelegraphs(C, alpha) {
    const ctx = this.ctx;
    const en = this.enemies.items;
    const tg = this.tg || (this.tg = {});
    for (let i = 0; i < en.length; i++) {
      const e = en[i];
      if (!e.active || !(e.def.attack || e.def.arch)) continue;
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
  /** Кэш кисти строится единожды, чтобы десятки суставов не пересчитывались каждый кадр. */
  ensureVoidPalm() {
    if (this.voidPalm) return this.voidPalm;
    const cv = makeCanvas(256, 192);
    const g = cv.getContext('2d');
    g.setTransform(2, 0, 0, 2, 128, 96);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    // Ладонь: от сужающегося запястья к рельефу четырёх костяшек.
    g.beginPath();
    g.moveTo(-31, -14);
    g.bezierCurveTo(-10, -23, -3, -28, 14, -23);
    g.bezierCurveTo(26, -17, 29, 13, 14, 24);
    g.bezierCurveTo(-3, 27, -12, 18, -31, 13);
    g.closePath();
    g.fillStyle = '#161321'; g.fill();
    g.lineWidth = 3; g.strokeStyle = '#797189'; g.stroke();
    g.beginPath();
    g.moveTo(-22, -12); g.quadraticCurveTo(2, -24, 17, -14);
    g.moveTo(-23, 10); g.quadraticCurveTo(4, 21, 16, 12);
    g.lineWidth = 2; g.strokeStyle = '#403a50'; g.stroke();
    // Четыре шарнирных пальца, каждый из двух сегментов и кончика-когтя.
    for (let k = 0; k < 4; k++) {
      const yy = -18 + k * 11.5;
      const bend = k === 0 ? -10 : k === 3 ? 8 : 0;
      g.beginPath();
      g.moveTo(11, yy); g.quadraticCurveTo(28, yy + bend * .2, 35, yy + bend);
      g.quadraticCurveTo(45, yy + bend * 1.2, 49 - k * 2, yy + bend + 2);
      g.lineWidth = 10 - k * .7; g.strokeStyle = '#4c4359'; g.stroke();
      g.lineWidth = 7 - k * .5; g.strokeStyle = '#15131f'; g.stroke();
      g.lineWidth = 1.5; g.strokeStyle = '#aaa1ad'; g.stroke();
      g.fillStyle = '#c5bbcb'; g.beginPath();
      g.arc(35, yy + bend, 2.1, 0, TAU); g.fill();
      g.beginPath();
      g.moveTo(49 - k * 2, yy + bend + 2);
      g.lineTo(61 - k * 3, yy + bend + (k % 2 ? 7 : -5));
      g.lineTo(47 - k * 2, yy + bend + 7);
      g.closePath(); g.fillStyle = '#171421'; g.fill(); g.strokeStyle = '#8c8194'; g.lineWidth = 1; g.stroke();
    }
    // Большой палец складывается к атакуемой полосе.
    g.beginPath();
    g.moveTo(-8, 17); g.quadraticCurveTo(3, 41, 20, 36);
    g.lineTo(30, 28);
    g.lineWidth = 11; g.strokeStyle = '#554b63'; g.stroke();
    g.lineWidth = 7; g.strokeStyle = '#171420'; g.stroke();
    g.lineWidth = 1.5; g.strokeStyle = '#aba0b2'; g.stroke();
    this.voidPalm = cv;
    return cv;
  }

  /** Нарисовать объёмную суставчатую руку: живой длинный рукав и кэшированный рельеф кисти. */
  drawVoidHand(ctx, wx, wy, bx, by, ex, ey, facing, size = 1) {
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const arm = () => {
      ctx.beginPath();ctx.moveTo(bx, by);
      ctx.quadraticCurveTo((bx + ex) * .5, (by + ey) * .5 - 13 * size, ex, ey);
      ctx.quadraticCurveTo((ex + wx) * .5 + 9 * size, (ey + wy) * .5, wx, wy);
    };
    arm(); ctx.strokeStyle = '#55506c'; ctx.lineWidth = 31 * size; ctx.stroke();
    arm(); ctx.strokeStyle = '#11101c'; ctx.lineWidth = 26 * size; ctx.stroke();
    arm(); ctx.strokeStyle = '#292436'; ctx.lineWidth = 19 * size; ctx.stroke();
    arm(); ctx.strokeStyle = 'rgba(148,140,169,.44)'; ctx.lineWidth = 3 * size; ctx.stroke();
    ctx.translate(wx, wy);
    ctx.rotate(facing);
    ctx.scale(size, size);
    ctx.drawImage(this.ensureVoidPalm(), -64, -48, 128, 96);
    ctx.restore();
  }

  /** Серия ударов рук с двух сторон: у каждого удара видимый замах и телеграф полосы. */
  drawHands() {
    const a = this.apotheosis, z = this.arena.zone;
    if (!a || !z || !a.hands.length || !a.H) return;
    const ctx = this.ctx, H = a.H;
    // Сначала нанесённые на пол телеграфы и следы с прорезями от пальцев.
    ctx.save();
    ctx.beginPath();
    if (z.poly) { ctx.moveTo(z.poly[0].x, z.poly[0].y); for (let i=1;i<z.poly.length;i++) ctx.lineTo(z.poly[i].x,z.poly[i].y); ctx.closePath(); }
    else ctx.rect(z.left,z.top,z.right-z.left,z.bottom-z.top);
    ctx.clip();
    for (let i=0;i<a.hands.length;i++) {
      const b=a.hands[i], span=b.y1-b.y0;
      if (b.state===1) {
        const k=Math.min(1,b.t/Math.max(.01,H.telegraph));
        ctx.fillStyle='rgba(119,28,54,'+(0.12+.32*k)+')';
        ctx.fillRect(z.left,b.y0,z.right-z.left,span);
        const phase=Math.sin(this.clock*8+i)*.5+.5;
        ctx.strokeStyle='rgba(242,145,160,'+(.3+.4*k+.1*phase)+')';
        ctx.lineWidth=2.3;
        for (let c=0;c<3;c++) {
          ctx.beginPath();ctx.moveTo(z.left,b.y0+span*(c+.5)/3);
          ctx.lineTo(z.right,b.y0+span*(c+.5)/3);ctx.stroke();
        }
      } else if (b.state===2 || b.state===3) {
        const k=Math.min(1,b.t/Math.max(.01,H.slamHold));
        ctx.fillStyle='rgba(12,8,24,'+(.68*(1-.6*k))+')';
        ctx.fillRect(z.left,b.y0,z.right-z.left,span);
        ctx.strokeStyle='rgba(120,100,141,'+(.65*(1-k))+')';
        ctx.lineWidth=2;
        for(let j=0;j<4;j++) {
          const y=b.y0+span*(j+1)/5;
          ctx.beginPath();ctx.moveTo(b.side<0?z.left:z.right,y);
          ctx.lineTo(b.side<0?z.right-35:z.left+35,y+((j%2)?-7:7));ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  /** Трёхмерные руки поверх врагов, но под героем; телеграф остаётся на полу. */
  drawHandsForeground() {
    const a = this.apotheosis, z = this.arena.zone;
    if (!a || !z || !a.hands.length || !a.H) return;
    const ctx = this.ctx, H = a.H;
    const width = z.right - z.left;
    for (let i = 0; i < a.hands.length; i++) {
      const b = a.hands[i];
      if (b.state === 4 && a.state !== 'retract' && b.t >= H.slamHold + H.retractTime) continue;
      const cy = (b.y0 + b.y1) / 2, edge = b.side < 0 ? z.left : z.right;
      const bx = edge + b.side * 380, by = cy + 110 + (i % 2 ? 30 : -25);
      const rest = edge + b.side * (180 - 128 * a.emerge);
      let lunge = 0;
      if (b.state === 1) {
        // В конце телеграфа пальцы уже почти достигли удара, а не долетают после нанесения урона.
        const t = Math.max(0, Math.min(1, (b.t / Math.max(.01, H.telegraph) - .58) / .42));
        lunge = .10 + .88 * t * t * (3 - 2 * t);
      } else if (b.state === 2 || b.state === 3) {
        lunge = 1 - .15 * Math.min(1, b.t / Math.max(.01, H.slamHold));
      } else if (b.state === 4) {
        const t = Math.min(1, Math.max(0, (b.t - H.slamHold) / Math.max(.01, H.retractTime)));
        lunge = .85 * (1 - t * t * (3 - 2 * t));
        if (a.state === 'retract') {
          const rt = Math.min(1, a.t / Math.max(.01, H.retractTime));
          lunge = Math.min(lunge, .85 * (1 - rt * rt * (3 - 2 * rt)));
        }
        if (lunge < .01) continue;
      }
      const palmX = rest + (edge - b.side * width * .67 - rest) * lunge;
      const elbowX = edge + b.side * (195 - 35 * a.emerge);
      this.drawVoidHand(ctx, palmX, cy, bx, by, elbowX, cy + 20 + (i % 2 ? -28 : 28),
        b.side < 0 ? 0 : Math.PI, .92);
    }
  }

  /**
   * ЗАГЛУШКА ГРАФИКИ: умение Апофеоза «Распад острова». Кусок поля: красный круг-телеграф, потом тёмный провал в пустоту
   * со светлым краем, потом зарастает. Всё обрезано по кромке острова.
   */
  drawCrumble() {
    const a = this.apotheosis;
    const z = this.arena.zone;
    if (!a || !z || !a.patches.length) return;
    const C = a.boss?.active && a.boss.def?.crumble;
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
    if (!a?.boss?.active || !a.boss.def?.beams || (a.state !== 'beams-tele' && a.state !== 'beams-fire')) return;
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

  /** Голубовато-золотые снаряды: объёмное ядро, мягкая аура, завихрения и след по траектории. */
  drawFlash() {
    const a=this.apotheosis;
    // После победы объект босса возвращается в пул: active=false, def=null.
    if(!a?.boss?.active || !a.boss.def?.flash) return;
    const ctx=this.ctx;
    const F=a.boss.def.flash;
    if(a.state==='flash-charge') {
      const o=a.headPos(), k=Math.min(1,a.t/Math.max(.01,F.charge));
      ctx.save();
      ctx.strokeStyle='rgba(190,230,255,'+(.25+.6*k)+')';
      ctx.lineWidth=2.5;
      for(let i=0;i<3;i++) {
        const angle=this.clock*(i%2?-.9:1)+i*TAU/3;
        const r=19+28*(1-k)+(i%2)*12;
        ctx.beginPath();ctx.ellipse(o.x,o.y,r,r*.55,angle,0,TAU);ctx.stroke();
      }
      const g=this.getGlow('blue'), sz=68*k+32;
      ctx.globalAlpha=.35+.45*k;
      ctx.drawImage(g,o.x-sz,o.y-sz,sz*2,sz*2);
      ctx.restore();
    }
    if(!a.flashBolts.length)return;
    const glow=this.getGlow('blue');
    ctx.save();
    ctx.lineCap='round';
    for(const b of a.flashBolts) {
      if(!b.active)continue;
      const vx=Math.cos(b.angle),vy=Math.sin(b.angle);
      const phase=this.clock*7+b.age*5;
      // Не заливаем весь экран: мягкое свечение относится только к самому снаряду.
      const r=b.r;
      ctx.globalAlpha=.8;
      ctx.drawImage(glow,b.x-r*3.6,b.y-r*3.6,r*7.2,r*7.2);
      // След повторяет изгиб самонаведения: без прямой «палочки» от снаряда.
      if(b.trailCount>0) {
        ctx.beginPath();ctx.moveTo(b.x,b.y);
        for(let j=0;j<b.trailCount;j++) {
          const k=(b.trailIndex-j+b.trailX.length)%b.trailX.length;
          ctx.lineTo(b.trailX[k],b.trailY[k]);
        }
        ctx.strokeStyle='rgba(87,168,255,.30)';ctx.lineWidth=r*1.45;ctx.stroke();
        ctx.strokeStyle='rgba(206,242,255,.77)';ctx.lineWidth=r*.45;ctx.stroke();
      }
      ctx.fillStyle='rgba(80,140,215,.75)';
      ctx.beginPath();ctx.arc(b.x,b.y,r*1.13,0,TAU);ctx.fill();
      ctx.fillStyle='#bce5ff';ctx.beginPath();ctx.arc(b.x,b.y,r*.82,0,TAU);ctx.fill();
      ctx.fillStyle='#ffedbc';ctx.beginPath();ctx.arc(b.x-vx*r*.24,b.y-vy*r*.24,r*.46,0,TAU);ctx.fill();
      ctx.fillStyle='#ffffff';ctx.beginPath();ctx.arc(b.x-vx*r*.4,b.y-vy*r*.4,r*.19,0,TAU);ctx.fill();
      ctx.strokeStyle='rgba(219,239,255,.83)';ctx.lineWidth=1.3;
      ctx.beginPath();ctx.ellipse(b.x,b.y,r*1.65,r*.59,phase,0,TAU);ctx.stroke();
      for(let i=0;i<3;i++) {
        const v=phase+i*TAU/3;
        ctx.fillStyle='rgba(241,251,255,.73)';
        ctx.beginPath();ctx.arc(b.x+Math.cos(v)*r*1.65,b.y+Math.sin(v)*r*1.2,1.6,0,TAU);ctx.fill();
      }
    }
    ctx.restore();
  }

  /** Руки разрывают остров: костяные пальцы тянут край, по поверхности идут разветвлённые трещины. */
  drawGrip(l, r, t, b) {
    const a=this.apotheosis, f=a&&a.tf;
    if(!f || !a.boss?.active || !a.boss.def?.transform || (a.state!=='tf-grab'&&a.state!=='tf-turn'&&a.state!=='tf-tear'&&a.state!=='tf-form'))return;
    const T=a.boss.def.transform,ctx=this.ctx,reach=f.handK*(1-f.apart);
    const forming=a.state==='tf-form';
    const dissolve=forming?Math.max(0,1-a.t/Math.max(.01,T.formTime)):1;
    const separation=forming?1:Math.max(0,f.apart);
    ctx.save();
    // Остров распадается на отдельные каменные клинья, а не только покрывается линиями.
    if(separation>.001&&dissolve>.002) {
      ctx.save();
      ctx.globalAlpha=dissolve;
      ctx.fillStyle='#090712';
      ctx.beginPath();ctx.arc(f.cx,f.cy,T.fragmentRadius*1.15,0,TAU);ctx.fill();
      const n=T.handCount;
      for(let i=0;i<n;i++) {
        const a0=-Math.PI+i*TAU/n+.025,a1=-Math.PI+(i+1)*TAU/n-.025,am=(a0+a1)*.5;
        const dx=Math.cos(am),dy=Math.sin(am);
        const displacement=(9+38*separation)*(i%2?1.15:.9);
        const ox=dx*displacement,oy=dy*displacement+(i%3===0?8:-3)*separation;
        const r0=T.fragmentRadius*(.75+(i%3)*.09),r1=T.fragmentRadius*(.91+((i+1)%3)*.035);
        ctx.beginPath();
        ctx.moveTo(f.cx+ox+dx*8,f.cy+oy+dy*8);
        ctx.lineTo(f.cx+ox+Math.cos(a0)*r0*.54,f.cy+oy+Math.sin(a0)*r0*.54);
        ctx.lineTo(f.cx+ox+Math.cos(a0)*r0,f.cy+oy+Math.sin(a0)*r0);
        ctx.lineTo(f.cx+ox+Math.cos(am)*r1,f.cy+oy+Math.sin(am)*r1);
        ctx.lineTo(f.cx+ox+Math.cos(a1)*r0,f.cy+oy+Math.sin(a1)*r0);
        ctx.lineTo(f.cx+ox+Math.cos(a1)*r0*.50,f.cy+oy+Math.sin(a1)*r0*.50);
        ctx.closePath();
        ctx.fillStyle=i%2?'#4b4254':'#5a5060';ctx.fill();
        ctx.strokeStyle='#171320';ctx.lineWidth=7;ctx.stroke();
        ctx.strokeStyle='rgba(186,171,188,.67)';ctx.lineWidth=1.8;ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(f.cx+ox+Math.cos(am)*r1*.27,f.cy+oy+Math.sin(am)*r1*.27);
        ctx.lineTo(f.cx+ox+Math.cos(a0)*r0*.86,f.cy+oy+Math.sin(a0)*r0*.86);
        ctx.lineTo(f.cx+ox+Math.cos(am)*r1,f.cy+oy+Math.sin(am)*r1);
        ctx.closePath();ctx.fillStyle='rgba(185,167,171,.19)';ctx.fill();
        // Боковая грань: сегмент визуально имеет толщину над бездной.
        const x=f.cx+ox+Math.cos(am)*r1,y=f.cy+oy+Math.sin(am)*r1;
        ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+6*dx,y+11+5*separation);
        ctx.lineTo(f.cx+ox+Math.cos(a1)*r0+5*dx,f.cy+oy+Math.sin(a1)*r0+11);
        ctx.closePath();ctx.fillStyle='#211b30';ctx.fill();
      }
      ctx.restore();
    }
    if(f.crack>0) {
      const k=f.crack*dissolve;
      // Отломленные фасеты, раскрытый шов и несколько ответвлений с разной толщиной.
      for(let i=0;i<10;i++) {
        const ang=i*TAU/10+.17;
        const dx=Math.cos(ang),dy=Math.sin(ang);
        const len=T.fragmentRadius*(.7+(i%3)*.15)*k;
        ctx.beginPath();
        ctx.moveTo(f.cx+dx*5,f.cy+dy*5);
        ctx.lineTo(f.cx+dx*len*.38-dy*11,f.cy+dy*len*.38+dx*11);
        ctx.lineTo(f.cx+dx*len*.67+dy*9,f.cy+dy*len*.67-dx*9);
        ctx.lineTo(f.cx+dx*len,f.cy+dy*len);
        ctx.lineWidth=5.2;ctx.strokeStyle='rgba(3,2,10,'+(.85*k)+')';ctx.stroke();
        ctx.lineWidth=1.5;ctx.strokeStyle='rgba(215,196,240,'+(.74*k)+')';ctx.stroke();
        if(i%2===0) {
          ctx.beginPath();ctx.moveTo(f.cx+dx*len*.67+dy*9,f.cy+dy*len*.67-dx*9);
          ctx.lineTo(f.cx+dx*len*.79+dy*20,f.cy+dy*len*.79-dx*20);
          ctx.lineWidth=2.7;ctx.strokeStyle='rgba(17,10,32,'+k+')';ctx.stroke();
        }
      }
    }
    if(!forming) for(let i=0;i<T.handCount;i++) {
      const ang=.35+i*TAU/T.handCount;
      const dx=Math.cos(ang),dy=Math.sin(ang);
      const tx=dx>0?(r-f.cx)/dx:dx<0?(l-f.cx)/dx:Infinity;
      const ty=dy>0?(b-f.cy)/dy:dy<0?(t-f.cy)/dy:Infinity;
      const far=Math.min(tx,ty)+85,near=T.fragmentRadius*.42;
      const d=far+(near-far)*reach;
      const shake=a.state==='tf-tear'?4*Math.sin(this.clock*37+i*2):0;
      const px=f.cx+dx*d-dy*shake,py=f.cy+dy*d+dx*shake;
      const ex=f.cx+dx*(d+far)*.5-dy*25*Math.sin(i*1.7+1);
      const ey=f.cy+dy*(d+far)*.5+dx*25*Math.sin(i*1.7+1);
      this.drawVoidHand(ctx,px,py,f.cx+dx*far,f.cy+dy*far,ex,ey,ang+Math.PI,.88);
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
    if (!a?.boss?.active || !a.boss.def?.omni || a.state !== 'omni-charge') return;
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

  /** Апофеоз: волны «Крика» (render_apofinale.js). */
  drawScream() {
    if (this.apotheosis && this.apoFin) this.apoFin.scream();
  }

  /** Апофеоз: обвал платформы, эпилог (свет, реплики, распад) (render_apofinale.js). */
  drawFinale() {
    if (!this.apoFin) return;
    this.apoFin.collapse();
    this.apoFin.finale();
  }

  /** Портал-воронка (перед финальным боссом и в конце игры); alpha растёт при открытии и падает при гашении. */
  drawPortal() {
    const p = this.getPortal ? this.getPortal() : null;
    if (!p || p.alpha <= 0) return;
    this.apoFin.portal(p);
  }

  /** Золотая стрелка из позиции героя к северным открывающимся воротам. */
  drawCastleArrow() {
    const target=this.castleTransition?.arrow;
    if(!target||this.arena.location!=='courtyard')return;
    const ctx=this.ctx,cam=this.camera,h=this.hero;
    const dx=target.x-h.x,dy=target.y-h.y;
    const a=Math.atan2(dy,dx);
    const px=this.w/2+(h.x-cam.x)*cam.scale;
    const py=this.h/2+(h.y-cam.y)*cam.scale;
    const x=Math.max(36,Math.min(this.w-36,px+Math.cos(a)*61));
    const y=Math.max(66,Math.min(this.h-66,py+Math.sin(a)*61));
    const wave=.82+.18*Math.sin(this.clock*5.5);
    ctx.save();
    ctx.translate(x,y);
    ctx.rotate(a);
    ctx.globalAlpha=wave;
    ctx.shadowColor='#eec17a';ctx.shadowBlur=14;
    ctx.fillStyle='#efc77e';
    ctx.strokeStyle='#fff0c4';ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(22,0);
    ctx.lineTo(-4,-12);ctx.lineTo(-1,-4);ctx.lineTo(-17,-4);
    ctx.lineTo(-17,4);ctx.lineTo(-1,4);ctx.lineTo(-4,12);ctx.closePath();
    ctx.fill();ctx.stroke();
    ctx.restore();
    // На самой двери рисуем маркер назначения, если она в кадре.
    const gx=this.w/2+(target.x-cam.x)*cam.scale;
    const gy=this.h/2+(target.y-cam.y)*cam.scale;
    if(gx>30&&gx<this.w-30&&gy>30&&gy<this.h-30){
      ctx.save();
      ctx.globalAlpha=.45+.3*Math.sin(this.clock*4)**2;
      ctx.strokeStyle='#f5d6a1';ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(gx,gy,17+3*Math.sin(this.clock*3),0,TAU);ctx.stroke();
      ctx.restore();
    }
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
  /**
   * Пепельный Арх: вытянутый серый жук с кусалами. Много гранёных пластин хитина, шипы на переднеспинке, злые красные глаза.
   * Брюшко с каждой микрофазой (e.archPhase 0..2) разгорается алым: в первой почти серое, потом тлеет, потом пылает;
   * на смене фазы вспышка. Прицеливание (e.aim): кусала раскрыты, между ними собирается сфера света. Замах: пригибается.
   * Оглушение (atk.state 'stun'): оседает, кусала повисли, ноги разъехались, жар гаснет и дымит, хитин холодеет и
   * трескается, над головой кружат огоньки, по краю бледное пульсирующее кольцо: сейчас он уязвим.
   */
  drawArch(e, x, y, hit) {
    const ctx = this.ctx;
    const r = e.radius;
    const t = this.clock;
    const dt = this.dt;
    const ph = e.archPhase || 0;
    const a = e.atk;
    const as = a.state;
    let st = this.beetleState.get(e);
    if (!st || t - (st.t || 0) > 0.5) {
      st = { a: Math.atan2(this.hero.y - y, this.hero.x - x), ph: Math.random() * TAU, step: 0, pph: ph, flash: 0, pst: as, stunT: 0, crack: 0, jaw: 0, t };
      this.beetleState.set(e, st);
    }
    st.t = t;
    if (st.pph !== ph) { st.flash = 1; st.pph = ph; }
    st.flash = Math.max(0, st.flash - dt * 0.9);
    const stunned = as === 'stun';
    if (stunned && st.pst !== 'stun') { st.stunT = 0; st.crack = 1; for (let k = 0; k < 3; k++) this.spawnDust(x, y, Math.cos(k * 2.1), Math.sin(k * 2.1)); }
    st.stunT = stunned ? st.stunT + dt : 0;
    st.crack = Math.max(0, st.crack - dt * 1.6);
    if (st.pst === 'strike' && as !== 'strike') this.spawnDust(x, y, a.dirX, a.dirY);
    st.pst = as;
    const moving = e.hx !== 0 || e.hy !== 0;
    if (moving && !stunned && as === 'idle') st.step += dt * 5.5;
    const target = as === 'windup' || as === 'strike' ? Math.atan2(a.dirY, a.dirX)
      : moving ? Math.atan2(e.hy, e.hx) : Math.atan2(this.hero.y - y, this.hero.x - x);
    if (!stunned) {
      let da = (target - st.a) % TAU;
      if (da > Math.PI) da -= TAU;
      else if (da < -Math.PI) da += TAU;
      st.a += da * (as === 'strike' ? 0.8 : 0.2);
    }
    const winding = as === 'windup';
    const striking = as === 'strike';
    const frozen = e.freezeT > 0;
    const aiming = e.aim > 0 && !stunned;
    // Раскрытие кусал: растут при прицеливании и замахе, в рывке сомкнуты, в оглушении повисли.
    const jawT = stunned ? 0.75 : aiming ? 0.85 : winding ? 0.7 : striking ? 0 : 0.15 + 0.08 * Math.sin(t * 1.7 + st.ph);
    st.jaw += (jawT - st.jaw) * (1 - Math.exp(-dt / 0.1));
    // Накал брюшка: по фазам (первая почти без красного), вспышка смены, замах и рывок; в оглушении тлеет.
    let heat = [0.03, 0.55, 1][ph] + st.flash * 0.7 + (winding ? 0.2 : 0) + (striking ? 0.25 : 0) + (aiming ? 0.08 : 0);
    if (stunned) heat = (0.05 + 0.1 * ph) * (0.6 + 0.4 * Math.sin(t * 5 + st.ph)) * Math.min(1, 1.4 - st.stunT * 0.3);
    heat = Math.max(0, Math.min(1.6, heat));
    const hk = Math.min(1, heat);
    const sway = stunned ? Math.sin(t * 2.3 + st.ph) * 0.07 : 0;
    const shake = winding ? Math.sin(t * 60) * 1.4 : stunned ? Math.sin(t * 40) * 0.4 : 0;
    const glow = this.getGlow('red');
    this.localLight(st.a + sway);
    const lx = this.llx;
    const ly = this.lly;
    const mix3 = (c0, c1, k) => 'rgb(' + Math.round(c0[0] + (c1[0] - c0[0]) * k) + ',' + Math.round(c0[1] + (c1[1] - c0[1]) * k) + ',' + Math.round(c0[2] + (c1[2] - c0[2]) * k) + ')';
    const cold = stunned || frozen ? 0.35 : 0;
    const DK = [20 - cold * 4, 22 - cold * 2, 32 + cold * 8];
    const LT = [146 - cold * 30, 152 - cold * 20, 170 + cold * 14];
    const RED0 = [92, 90, 98];   // брюшко без накала: почти серое
    const RED1 = [214, 60, 40];

    // Тень на земле: падает вправо вниз.
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = '#05080f';
    ctx.beginPath();
    ctx.ellipse(x + r * 0.22, y + r * 0.34, r * 1.9, r * 0.95, st.a + sway, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(x + shake, y);
    ctx.rotate(st.a + sway);
    const k0 = (hit ? 1.05 : 1) * 0.98;
    ctx.scale(k0 * (winding ? 0.97 : 1), k0 * (stunned ? 0.97 : 1));
    if (striking) { // линии скорости и шлейф теней
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = 'rgba(200,205,215,0.5)';
      ctx.beginPath();
      for (let j = 0; j < 3; j++) { const yy = (-0.5 + j * 0.5) * r; ctx.moveTo(-2.0 * r, yy); ctx.lineTo(-2.0 * r - (2.6 + Math.abs(Math.sin(t * 29 + j))) * r, yy); }
      ctx.stroke();
      for (let i = 1; i <= 4; i++) {
        ctx.globalAlpha = 0.3 - i * 0.06;
        ctx.fillStyle = ph === 2 ? '#c8503c' : '#9a9ca6';
        ctx.save();
        ctx.translate(-i * 0.85 * r, 0);
        ctx.beginPath(); tracePoly(ctx, ARCH_ELY, r); tracePoly(ctx, ARCH_PRON, r); tracePoly(ctx, ARCH_HEAD, r); ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }

    // Ноги: шесть членистых; в оглушении разъехались и дрожат.
    {
      const pal = { dark: '#2c2e38', base: '#4a4e5c', lite: '#8a90a4', cap: '#fff', glow };
      for (let i = 0; i < 6; i++) {
        const side = i < 3 ? -1 : 1;
        const k = i % 3;
        const gait = st.step * 1.15 + ((k + (side > 0 ? 1 : 0)) % 2) * Math.PI;
        const lp = stunned ? i * 1.7 + Math.sin(t * 9 + i) * 0.15 : striking ? 0 : gait;
        const mv = stunned || striking ? 0 : moving ? 1 : 0;
        const fb = (1 - k) * (stunned ? 0.9 : 0.6);
        this.drawLeg(ctx, (0.62 - k * 0.78) * r, side * 0.6 * r, side, fb, r * (stunned ? 1.1 : winding ? 0.9 : 1), lp, mv, pal, hit, { l1: 0.46, l2: 0.52, w: 0.2, heat: heat * 0.2, glow });
      }
    }

    // Брюшко: сегментированное, торчит из-под надкрылий; алое только с накалом, в первой фазе серое.
    {
      ctx.beginPath(); tracePoly(ctx, ARCH_ABD, r);
      ctx.fillStyle = hit ? '#ffffff' : mix3(RED0, RED1, Math.pow(hk, 1.2));
      ctx.fill();
      if (!hit) {
        ctx.beginPath(); ctx.moveTo(-0.2 * r, -0.6 * r); ctx.lineTo(-0.9 * r, -0.66 * r); ctx.lineTo(-1.5 * r, -0.44 * r); ctx.lineTo(-1.98 * r, 0); ctx.lineTo(-0.2 * r, 0); ctx.closePath();
        ctx.fillStyle = mix3([124, 122, 132], [244, 104, 66], Math.pow(hk, 1.2));
        ctx.fill();
        ctx.lineCap = 'round';
        ctx.lineWidth = 1.5;
        for (let q = 0; q < 5; q++) { // сегменты брюшка: швы светятся
          const xx = (-1.25 - q * 0.17) * r;
          const hw = (0.52 - q * 0.1) * r;
          ctx.strokeStyle = 'rgba(' + Math.round(40 + 215 * hk) + ',' + Math.round(44 + 70 * hk) + ',' + Math.round(52 - 10 * hk) + ',' + (0.35 + 0.55 * hk).toFixed(3) + ')';
          ctx.beginPath(); ctx.moveTo(xx, -hw); ctx.quadraticCurveTo(xx - 0.08 * r, 0, xx, hw); ctx.stroke();
        }
        if (stunned) {
          ctx.strokeStyle = 'rgba(10,8,10,0.7)';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(-1.3 * r, -0.3 * r); ctx.lineTo(-1.55 * r, 0.02 * r); ctx.lineTo(-1.5 * r, 0.3 * r); ctx.moveTo(-1.55 * r, 0.02 * r); ctx.lineTo(-1.9 * r, -0.04 * r); ctx.stroke();
        }
        ctx.globalCompositeOperation = 'lighter';
        const gs = r * (2.2 + 1.8 * Math.min(1.2, heat)) * (1 + 0.05 * Math.sin(t * 9));
        ctx.globalAlpha = Math.min(1, 0.04 + 0.6 * heat);
        ctx.drawImage(glow, -1.5 * r - gs / 2, -gs / 2, gs, gs);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }
    }

    // Надкрылья: пять поперечных пластин на сторону, каждая из двух граней по свету; рёбра, заклёпки, кайма.
    ctx.lineJoin = 'round';
    const XB = [0.2, -0.18, -0.52, -0.84, -1.14, -1.42];
    for (let sg = -1; sg <= 1; sg += 2) {
      for (let q = 0; q < 5; q++) {
        const xa = XB[q];
        const xb = XB[q + 1];
        const ha = archHw(xa);
        const hb = archHw(xb);
        const mid = (xa + xb) / 2;
        // пластина: градиент от гребня к кромке и две грани по диагонали
        const full = [xa, 0, xa, sg * ha, xb, sg * hb, xb, 0];
        const f2 = [xa, 0, xb, sg * hb, xb, 0];
        const nz = (sg < 0 ? -1 : 1);
        const bA = 0.5 + 0.5 * (nz * 0.7 * ly + 0.4 * lx);
        const gr = ctx.createLinearGradient(0, 0, 0, sg * Math.max(ha, hb) * r);
        gr.addColorStop(0, mix3(DK, LT, Math.max(0.08, Math.min(0.9, 0.5 + 0.28 * bA - 0.1 * q * 0.3))));
        gr.addColorStop(0.6, mix3(DK, LT, Math.max(0.05, Math.min(0.8, 0.28 + 0.3 * bA))));
        gr.addColorStop(1, mix3(DK, LT, 0.08 + 0.12 * bA));
        ctx.beginPath(); tracePoly(ctx, full, r);
        ctx.fillStyle = hit ? '#ffffff' : gr;
        ctx.fill();
        if (!hit) {
          ctx.beginPath(); tracePoly(ctx, f2, r);
          ctx.fillStyle = 'rgba(' + (bA > 0.5 ? '255,255,255' : '0,0,6') + ',' + (0.09 + 0.1 * Math.abs(bA - 0.5)).toFixed(3) + ')';
          ctx.fill();
        }
        if (!hit) {
          ctx.strokeStyle = 'rgba(6,7,12,0.7)'; // шов между пластинами
          ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(xb * r, 0); ctx.lineTo(xb * r, sg * hb * r); ctx.stroke();
          ctx.strokeStyle = 'rgba(220,224,236,0.25)'; // блик на кромке пластины
          ctx.lineWidth = 0.9;
          ctx.beginPath(); ctx.moveTo(xa * r - 0.6, sg * ha * r * 0.96); ctx.lineTo(xb * r - 0.6, sg * hb * r * 0.96); ctx.stroke();
          ctx.fillStyle = 'rgba(14,16,24,0.8)'; // заклёпки
          ctx.beginPath(); ctx.arc(mid * r, sg * (hb * 0.55) * r, 1.15, 0, TAU); ctx.arc(mid * r, sg * (hb * 0.2) * r, 0.9, 0, TAU); ctx.fill();
        }
      }
    }
    if (!hit) {
      ctx.strokeStyle = 'rgba(6,7,12,0.85)'; // центральный шов
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(0.2 * r, 0); ctx.lineTo(-1.42 * r, 0); ctx.stroke();
      // алый жар сквозь щели между пластинами: с накалом
      ctx.strokeStyle = 'rgba(255,70,48,' + (0.02 + 0.6 * hk).toFixed(3) + ')';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(0.1 * r, 0); ctx.lineTo(-1.35 * r, 0);
      for (let q = 1; q < 5; q++) { const xx = XB[q] * r; ctx.moveTo(xx, -archHw(XB[q]) * r * 0.5); ctx.lineTo(xx, archHw(XB[q]) * r * 0.5); }
      ctx.stroke();
    }
    ctx.beginPath(); tracePoly(ctx, ARCH_ELY, r);
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = hit ? '#ffffff' : stunned ? 'rgba(170,200,240,' + (0.45 + 0.3 * Math.sin(t * 6)).toFixed(3) + ')' : 'rgba(214,218,230,0.85)';
    ctx.stroke();
    if ((stunned || frozen) && !hit) { // холодный налёт и трещины
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = '#9fb8dc';
      ctx.beginPath(); tracePoly(ctx, ARCH_ELY, r); ctx.fill();
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = '#10131c';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(-0.1 * r, -0.4 * r); ctx.lineTo(-0.35 * r, -0.2 * r); ctx.lineTo(-0.6 * r, -0.45 * r); ctx.lineTo(-0.9 * r, -0.35 * r);
      ctx.moveTo(-0.6 * r, 0.5 * r); ctx.lineTo(-0.8 * r, 0.25 * r); ctx.lineTo(-1.1 * r, 0.3 * r);
      ctx.stroke();
      if (st.crack > 0) { ctx.globalAlpha = st.crack; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6; ctx.stroke(); }
      ctx.globalAlpha = 1;
    }

    // Переднеспинка: широкая гранёная плита с боковыми шипами и гребнем.
    {
      const P = ARCH_PRON;
      for (let sg = -1; sg <= 1; sg += 2) { // боковые шипы
        ctx.beginPath(); ctx.moveTo(0.7 * r, sg * 0.6 * r); ctx.lineTo(0.5 * r, sg * 0.9 * r); ctx.lineTo(0.3 * r, sg * 0.6 * r); ctx.closePath();
        ctx.fillStyle = hit ? '#ffffff' : mix3(DK, LT, sg < 0 ? 0.55 : 0.18);
        ctx.fill();
        ctx.strokeStyle = hit ? '#ffffff' : 'rgba(210,214,226,0.7)';
        ctx.lineWidth = 0.9;
        ctx.stroke();
      }
      ctx.beginPath(); tracePoly(ctx, P, r);
      ctx.fillStyle = hit ? '#ffffff' : mix3(DK, LT, 0.3);
      ctx.fill();
      if (!hit) {
        ctx.beginPath(); ctx.moveTo(1.05 * r, -0.46 * r); ctx.lineTo(0.8 * r, -0.62 * r); ctx.lineTo(0.35 * r, -0.64 * r); ctx.lineTo(0.2 * r, -0.5 * r); ctx.lineTo(0.2 * r, 0); ctx.lineTo(1.05 * r, 0); ctx.closePath();
        ctx.fillStyle = mix3(DK, LT, 0.62);
        ctx.fill();
        ctx.strokeStyle = 'rgba(6,7,12,0.7)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(1.05 * r, 0); ctx.lineTo(0.2 * r, 0);
        for (let q = 0; q < 4; q++) { const xx = (0.34 + q * 0.2) * r; const hh = (0.56 - Math.abs(q - 1.5) * 0.04) * r; ctx.moveTo(xx, -hh); ctx.quadraticCurveTo(xx + 0.05 * r, 0, xx, hh); }
        ctx.stroke();
        ctx.fillStyle = 'rgba(214,218,230,0.3)';
        ctx.beginPath(); ctx.moveTo(0.95 * r, -0.4 * r); ctx.lineTo(0.5 * r, -0.55 * r); ctx.lineTo(0.5 * r, -0.4 * r); ctx.closePath(); ctx.fill();
      }
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = hit ? '#ffffff' : 'rgba(214,218,230,0.8)';
      ctx.beginPath(); tracePoly(ctx, P, r); ctx.stroke();
    }

    // Голова и кусала: два изогнутых клыка с зубцами по внутреннему краю; раскрываются на jaw.
    {
      ctx.beginPath(); tracePoly(ctx, ARCH_HEAD, r);
      ctx.fillStyle = hit ? '#ffffff' : '#2e303a';
      ctx.fill();
      if (!hit) {
        ctx.beginPath(); ctx.moveTo(1.0 * r, -0.34 * r); ctx.lineTo(1.3 * r, -0.3 * r); ctx.lineTo(1.55 * r, -0.14 * r); ctx.lineTo(1.55 * r, 0); ctx.lineTo(1.0 * r, 0); ctx.closePath();
        ctx.fillStyle = mix3(DK, LT, 0.5);
        ctx.fill();
        for (let sg = -1; sg <= 1; sg += 2) { // надбровные пластины: злой взгляд
          ctx.beginPath(); ctx.moveTo(1.08 * r, sg * 0.36 * r); ctx.lineTo(1.42 * r, sg * 0.3 * r); ctx.lineTo(1.3 * r, sg * 0.14 * r); ctx.closePath();
          ctx.fillStyle = sg < 0 ? mix3(DK, LT, 0.55) : mix3(DK, LT, 0.15);
          ctx.fill();
        }
      }
      const jw = st.jaw;
      for (let sg = -1; sg <= 1; sg += 2) {
        // Кусало: серп. Осевая кривая от основания у головы наружу и к острию внутрь, толщина сходит на нет.
        const N = 12;
        const A = 0.34 + 0.5 * jw;
        const cx = [];
        const cy = [];
        const wd = [];
        for (let q = 0; q <= N; q++) {
          const u = q / N;
          cx.push((1.32 + 1.18 * u) * r);
          cy.push(sg * (0.26 + A * Math.sin(Math.PI * Math.min(1, u * 0.92)) - 0.04 * u) * r);
          wd.push((0.2 * Math.pow(1 - u, 0.75) + 0.014) * r);
        }
        const outer = [];
        const inner = [];
        for (let q = 0; q <= N; q++) {
          const q0 = Math.max(0, q - 1);
          const q1 = Math.min(N, q + 1);
          const tx = cx[q1] - cx[q0];
          const ty = cy[q1] - cy[q0];
          const tl = Math.hypot(tx, ty) || 1;
          const nx = -ty / tl * sg; // наружу (от оси)
          const ny = tx / tl * sg;
          outer.push([cx[q] + nx * wd[q], cy[q] + ny * wd[q]]);
          inner.push([cx[q] - nx * wd[q], cy[q] - ny * wd[q]]);
        }
        ctx.beginPath();
        for (let q = 0; q <= N; q++) { if (q) ctx.lineTo(outer[q][0], outer[q][1]); else ctx.moveTo(outer[q][0], outer[q][1]); }
        for (let q = N; q >= 0; q--) ctx.lineTo(inner[q][0], inner[q][1]);
        ctx.closePath();
        ctx.fillStyle = hit ? '#ffffff' : sg < 0 ? mix3(DK, LT, 0.5) : mix3(DK, LT, 0.16);
        ctx.fill();
        if (!hit) {
          ctx.beginPath(); // светлая грань по внешней кромке
          for (let q = 0; q <= N; q++) { if (q) ctx.lineTo(outer[q][0], outer[q][1]); else ctx.moveTo(outer[q][0], outer[q][1]); }
          for (let q = N; q >= 0; q--) ctx.lineTo(cx[q], cy[q]);
          ctx.closePath();
          ctx.fillStyle = sg < 0 ? 'rgba(235,240,255,0.2)' : 'rgba(8,10,20,0.28)';
          ctx.fill();
          ctx.fillStyle = mix3(DK, LT, 0.8); // зубцы по внутреннему краю
          for (const qq of [5, 7, 9]) {
            const bx = inner[qq][0];
            const by = inner[qq][1];
            const tx = inner[qq + 1][0] - bx;
            const ty = inner[qq + 1][1] - by;
            ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + tx * 0.9 - (outer[qq][0] - inner[qq][0]) * 1.1, by + ty * 0.9 - (outer[qq][1] - inner[qq][1]) * 1.1); ctx.lineTo(bx + tx, by + ty); ctx.closePath(); ctx.fill();
          }
        }
        ctx.beginPath();
        for (let q = 0; q <= N; q++) { if (q) ctx.lineTo(outer[q][0], outer[q][1]); else ctx.moveTo(outer[q][0], outer[q][1]); }
        for (let q = N; q >= 0; q--) ctx.lineTo(inner[q][0], inner[q][1]);
        ctx.closePath();
        ctx.lineWidth = 1.1;
        ctx.strokeStyle = hit ? '#ffffff' : 'rgba(224,228,240,0.8)';
        ctx.stroke();
      }
    }
    // Глаза: злые, красные, скошенные; ярче с фазой; в оглушении тускнеют.
    {
      const ep = stunned ? 0.3 : 0.75 + 0.25 * Math.sin(t * 6 + st.ph);
      ctx.globalAlpha = stunned ? 0.55 : 1;
      for (let sg = -1; sg <= 1; sg += 2) {
        ctx.beginPath(); ctx.moveTo(1.14 * r, sg * 0.28 * r); ctx.lineTo(1.4 * r, sg * 0.2 * r); ctx.lineTo(1.3 * r, sg * 0.06 * r); ctx.lineTo(1.14 * r, sg * 0.14 * r); ctx.closePath();
        ctx.fillStyle = ph === 0 ? '#ff4a3a' : ph === 1 ? '#ff3328' : '#ff1f1f';
        ctx.fill();
        ctx.fillStyle = '#ffd0c0';
        ctx.beginPath(); ctx.arc(1.28 * r, sg * 0.16 * r, 0.035 * r, 0, TAU); ctx.fill();
      }
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = ep * (0.5 + 0.2 * ph) * (stunned ? 0.5 : 1);
      const gs = r * 0.95;
      ctx.drawImage(glow, 1.28 * r - gs / 2, -0.17 * r - gs / 2, gs, gs);
      ctx.drawImage(glow, 1.28 * r - gs / 2, 0.17 * r - gs / 2, gs, gs);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    const tipX = 2.1 * 0.98 * r;
    ctx.restore();

    // Мир без поворота: сфера прицеливания, дымок и огоньки оглушения, искры брюшка.
    const ca = Math.cos(st.a + sway);
    const sa = Math.sin(st.a + sway);
    if (aiming) { // сфера света собирается между кусалами
      const kk = 1 - e.aim / Math.max(0.01, e.aimTotal || 0.6);
      const ox = x + ca * tipX;
      const oy = y + sa * tipX;
      this.drawArchOrb(ctx, ox, oy, r * (0.08 + 0.2 * kk), ph === 2, t, 0.6 + 0.4 * kk);
      ctx.save();
      ctx.strokeStyle = 'rgba(235,238,248,' + (0.5 * kk).toFixed(3) + ')';
      ctx.lineWidth = 1;
      for (let q = 0; q < 3; q++) {
        const an = t * 5 + q * 2.09;
        const rr = r * (0.55 - 0.35 * kk);
        ctx.beginPath(); ctx.arc(ox + Math.cos(an) * rr, oy + Math.sin(an) * rr, 1.5, 0, TAU); ctx.stroke();
      }
      ctx.restore();
    }
    if (stunned) {
      const hx = x + ca * r * 1.7;
      const hy = y + sa * r * 1.7 - r * 0.6;
      for (let q = 0; q < 3; q++) { // огоньки кружат над головой
        const an = t * 3.2 + q * 2.094;
        const back = Math.sin(an) < 0 ? 0.55 : 1;
        this.drawArchOrb(ctx, hx + Math.cos(an) * r * 0.62, hy + Math.sin(an) * r * 0.2, r * 0.15 * back, false, t, back);
      }
      const puff = this.getPuff();
      const bx = x - ca * r * 1.9;
      const by = y - sa * r * 1.9;
      for (let q = 0; q < 4; q++) {
        const u = (t * 0.45 + q / 4 + st.ph) % 1;
        ctx.globalAlpha = Math.sin(u * Math.PI) * 0.4;
        const sz = r * (0.3 + 0.55 * u);
        ctx.drawImage(puff, bx + Math.sin(u * 5 + q) * r * 0.25 - sz, by - u * r * 1.7 - sz, sz * 2, sz * 2);
      }
      ctx.globalAlpha = 1;
    } else if (heat > 0.5 && !frozen) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = '#ff9a6a';
      const bx = x - ca * r * 1.9;
      const by = y - sa * r * 1.9;
      const n = ph === 2 ? 6 : 3;
      for (let q = 0; q < n; q++) {
        const u = (t * 0.8 + q / n + st.ph) % 1;
        ctx.globalAlpha = (1 - u) * 0.85 * Math.min(1, heat);
        ctx.beginPath();
        ctx.arc(bx + Math.sin(t * 3 + q * 2) * r * 0.3, by - u * r * 1.5, 1.3, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  /** Сфера света Арха (как снаряд игрока, но серебристо-серая): белое ядро, мягкое гало; red: алый оттенок третьей фазы. */
  drawArchOrb(ctx, x, y, rad, red, t, alpha) {
    const R = Math.max(1.5, rad);
    const al = alpha === undefined ? 1 : alpha;
    ctx.save();
    ctx.translate(x, y);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5 * al;
    const gl = red ? this.getGlow('red') : this.getGlow('ash');
    const hs = R * 4.2 * (1 + 0.06 * Math.sin(t * 24 + x));
    ctx.drawImage(gl, -hs, -hs, hs * 2, hs * 2);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = al;
    ctx.fillStyle = red ? '#d9a8a0' : '#aeb4c4';
    ctx.beginPath(); ctx.arc(0, 0, R * 0.98, 0, TAU); ctx.fill();
    ctx.fillStyle = red ? '#fff0e8' : '#f6f8ff';
    ctx.beginPath(); ctx.arc(-R * 0.12, -R * 0.16, R * 0.62, 0, TAU); ctx.fill();
    ctx.restore();
  }

  drawTartas(e, x, y, hit) {
    // По умолчанию используем исходный плоский спрайт; 2.5D остаётся для рыцарей.
    if(this.isoEnemies.enabled && this.cfg.render.isometricTartas!==false){
      this.isoEnemies.draw(this.ctx,e,x,y,'tartas',hit);
      return;
    }
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
    if(this.isoEnemies.enabled){
      this.isoEnemies.draw(this.ctx,e,x,y,kind,hit);
      return;
    }
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
    const q = this.troopSprite(kind, st.a, st.step, frozen, hit, windup, striking, aim);
    if (q) {
      // Готовый спрайт: тело уже нарисовано под нужным углом и фазой шага, на кадр остаётся одна drawImage.
      const ox = windup > 0 ? Math.sin(t * 60) * windup * 0.6 : 0;
      ctx.drawImage(q, x + ox - TROOP_HALF * s, y - TROOP_HALF * s, TROOP_SIZE * s, TROOP_SIZE * s);
      return;
    }
    // Запасной путь (лимит новых спрайтов за кадр исчерпан): прежняя прямая отрисовка.
    this.localLight(st.a);
    ctx.save();
    ctx.translate(x + (windup > 0 ? Math.sin(t * 60) * windup * 0.6 : 0), y);
    ctx.rotate(st.a);
    ctx.scale(s, s);
    this.paintTroop(ctx, kind, st.step, frozen, hit, windup, striking, aim, t, st.ph);
    ctx.restore();
  }

  /** Тело замёрзшего воина в местных осях (вперёд = +x), без поворота и масштаба: рисуется и в спрайт, и напрямую. */
  paintTroop(ctx, kind, step, frozen, hit, windup, striking, aim, t, ph) {
    const C = this.cfg.render.colors;
    const stride = Math.sin(step) * 2.4;
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
      const sw = (striking ? 0 : 0.6) + windup * 1.4 + 0.15 * Math.sin(step);
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
        ctx.strokeStyle = '#ffe1a0';
        ctx.beginPath();
        ctx.moveTo(5 - pull, 0);
        ctx.lineTo(18, 0);
        ctx.stroke();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.4 + 0.5 * aim;
        ctx.drawImage(this.getGlow(), 12, -8, 17, 16);
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
    ctx.globalAlpha = (frozen ? 0.35 : heat) * (0.8 + 0.2 * Math.sin(t * 8 + ph));
    for (const sg of [-1, 1]) ctx.drawImage(this.getGlow('blue'), 5.6, sg * 1.6 - 3.5, 7, 7);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  /**
   * Кэш спрайтов воинов Тартаса и призраков. Ключ: вид, угол (32 шага), фаза шага (8), заморозка, вспышка попадания,
   * замах/прицел (по 4 ступени), выпад. Спрайт рисуется один раз, дальше на врага уходит одна drawImage вместо ~40 путей.
   * Новых спрайтов за кадр не больше троих: остальные враги этот кадр рисуются по-старому, без заметного рывка.
   */
  troopSprite(kind, ang, step, frozen, hit, windup, striking, aim) {
    const cache = this.troopSprites || (this.troopSprites = new Map());
    const ab = ((Math.round(ang / TAU * 32) % 32) + 32) % 32;
    const sb = ((Math.round((step % TAU) / TAU * 8) % 8) + 8) % 8;
    const wq = Math.min(4, Math.round(windup * 4));
    const aq = aim > 0 ? Math.min(4, Math.ceil(aim * 4)) : 0;
    const key = kind + ab + '.' + sb + (frozen ? 'f' : '') + (hit ? 'h' : '') + (striking ? 's' : '') + wq + aq;
    let c = cache.get(key);
    if (c) return c;
    if (this.troopMade >= 3 && this.troopMadeFrame === this.frameNo) return null;
    if (this.troopMadeFrame !== this.frameNo) { this.troopMadeFrame = this.frameNo; this.troopMade = 0; }
    if (cache.size > 700) cache.clear(); // на случай дрейфа ключей; пересоберётся лениво
    this.troopMade++;
    const px = Math.round(TROOP_SIZE * this.dpr);
    if (typeof OffscreenCanvas === 'function') c = new OffscreenCanvas(px, px);
    else { c = document.createElement('canvas'); c.width = c.height = px; }
    const g = c.getContext('2d');
    const saved = this.ctx;
    this.ctx = g;
    const a = ab / 32 * TAU;
    this.localLight(a);
    g.setTransform(px / TROOP_SIZE, 0, 0, px / TROOP_SIZE, 0, 0);
    g.translate(TROOP_HALF, TROOP_HALF);
    g.rotate(a);
    this.paintTroop(g, kind, sb / 8 * TAU, frozen, hit, wq / 4, striking, aq / 4, 0, 0);
    this.ctx = saved;
    cache.set(key, c);
    return c;
  }

  /** Боевой маг в многослойной броне и мантии, с левитирующим фокусом щита. */
  drawBattleMage(e,x,y,hit){
    const ctx=this.ctx,t=this.clock,r=e.radius;
    const a=Math.atan2(this.hero.y-y,this.hero.x-x);
    const cs=Math.cos(a),sn=Math.sin(a),scale=r/15;
    ctx.save();ctx.translate(x,y);ctx.rotate(a);ctx.scale(scale,scale);
    const path=(pts,color,outline='#14182c')=>{
      ctx.beginPath();ctx.moveTo(pts[0],pts[1]);
      for(let i=2;i<pts.length;i+=2)ctx.lineTo(pts[i],pts[i+1]);
      ctx.closePath();ctx.fillStyle=color;ctx.fill();
      if(outline){ctx.lineWidth=.9;ctx.strokeStyle=outline;ctx.stroke();}
    };
    // Задние слои плаща, продольные складки и угловые набедренники.
    path([-11,-11,-19,-12,-25,-7,-32,0,-25,7,-19,12,-11,11],
      '#26243d');
    path([-14,-9,-27,-7,-23,-3,-30,0,-21,3,-27,8,-14,9],
      '#46406b',null);
    path([-8,-8,-5,-12,9,-11,16,-4,16,4,9,11,-5,12],
      '#33394e');
    path([-7,-9,4,-12,15,-5,12,-1,-6,-1],'#67738a');
    path([-7,9,4,12,15,5,12,1,-6,1],'#495770');
    // Объёмная нагрудная броня, боковые грани, парящий камень.
    path([-6,-12,7,-14,13,-7,13,7,7,14,-6,12,-13,0],
      '#39465e');
    path([3,-12,12,-8,15,-1,11,8,3,12,6,0],
      '#66738e');
    path([10,-6,15,-3,17,0,15,3,10,6],
      '#8b86bd');
    // Наплечники и металлические кромки с отдельными бликами.
    for(const side of [-1,1]){
      path([-3,side*11,4,side*17,15,side*15,17,side*10,7,side*8],
        '#505c79');
      path([4,side*13,14,side*14,16,side*11,9,side*10],
        '#8892bb',null);
    }
    // Высокий капюшон над лицевой щелью, две подсвеченные руны.
    path([-5,-8,3,-12,12,-8,15,0,12,8,3,12,-5,8,-8,0],
      '#20243a');
    path([0,-9,10,-7,15,0,10,7,0,9,4,0],
      '#626a91');
    path([9,-5,17,-3,17,3,9,5],
      '#0c1428');
    ctx.strokeStyle='#c4b0ff';ctx.lineWidth=1.6;ctx.beginPath();
    ctx.moveTo(15,-3);ctx.lineTo(17,-1);
    ctx.moveTo(15,3);ctx.lineTo(17,1);ctx.stroke();
    // Боевой посох и фокус барьера, живые дуги энергии.
    ctx.strokeStyle='#84769e';ctx.lineWidth=3;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(-6,17);ctx.lineTo(26,19);ctx.stroke();
    ctx.strokeStyle='#e6ceff';ctx.lineWidth=1.2;
    ctx.beginPath();ctx.moveTo(15,18);ctx.lineTo(25,19);ctx.stroke();
    const glow=.64+.2*Math.sin(t*7+e.x);
    ctx.save();ctx.globalCompositeOperation='lighter';
    ctx.fillStyle='rgba(151,115,255,'+glow+')';
    ctx.beginPath();ctx.arc(27,19,6.5+Math.sin(t*5)*.6,0,TAU);ctx.fill();
    ctx.fillStyle='#eee1ff';ctx.beginPath();ctx.arc(27,19,3.1,0,TAU);ctx.fill();
    ctx.strokeStyle='rgba(192,169,255,.8)';ctx.lineWidth=1.1;
    for(let i=0;i<3;i++){
      const ang=t*1.5+i*TAU/3;
      ctx.beginPath();ctx.arc(27+Math.cos(ang)*10,19+Math.sin(ang)*10,1.5,0,TAU);ctx.stroke();
    }
    ctx.restore();
    if(hit){
      ctx.globalAlpha=.35;path([-7,-10,9,-12,16,-4,16,4,9,12,-7,10],'#ffffff',null);
    }
    ctx.restore();
  }

  drawEnemyMaterialization(e,x,y){
    const c=this.ctx, t=1-e.spawnT/Math.max(.01,e.spawnDuration);
    const spectral=!!e.def.spectral;
    const r=e.radius, radius=r*(2.7-1.45*t);
    const hue=spectral?'139,207,255':'167,126,231';
    c.save();c.globalCompositeOperation='screen';
    // Энергия сначала разрежена, затем стягивается в силуэт.
    const fog=c.createRadialGradient(x,y,0,x,y,radius*2);
    fog.addColorStop(0,'rgba('+hue+','+(.10+.30*t)+')');
    fog.addColorStop(.38,'rgba('+hue+','+(.15+.12*t)+')');
    fog.addColorStop(1,'rgba('+hue+',0)');
    c.fillStyle=fog;c.beginPath();c.arc(x,y,radius*2,0,TAU);c.fill();
    const n=15;
    for(let i=0;i<n;i++){
      const a=i*2.39996+e.gen*.7,spiral=1-t;
      const d=r*(.25+1.85*spiral)*(i%5+3)/7;
      const px=x+Math.cos(a+this.clock*.6)*d;
      const py=y+Math.sin(a+this.clock*.6)*d*.75;
      const size=(1.1+i%3*.65)*(1-t*.55);
      c.fillStyle='rgba('+hue+','+(.25+.55*t)+')';
      c.beginPath();c.arc(px,py,size,0,TAU);c.fill();
      c.strokeStyle='rgba('+hue+','+(.10+.28*t)+')';c.lineWidth=.8;
      c.beginPath();c.moveTo(px,py);c.quadraticCurveTo((px+x)*.5,py-9,x,y);c.stroke();
    }
    c.restore();
    // Лишь в конце проявляется настоящий враг, без внезапного скачка.
    if(t>.57){
      c.save();c.globalAlpha=Math.pow((t-.57)/.43,1.5);
      this.drawEnemy(e,x,y,this.cfg.render.colors);
      c.restore();
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

    if(e.def.spectral)this.drawSpiritTrail(e,x,y);
    const aiming = e.aim > 0;
    if (e.def === this.cfg.enemies.beetle) {
      // Жук: пламенный жук с светящимися глазами (отдельная отрисовка).
      this.drawBeetle(e, x, y, hit);
    } else if (e.def === this.cfg.enemies.hunter) {
      this.drawHunter(e, x, y, hit); // ЗАГЛУШКА ГРАФИКИ: зелёный жук с острой головой
    } else if (e.def === this.cfg.enemies.shooter) {
      // Жук-стрелок: фиолетовый, с брюшком, которое растёт при заряде выстрела.
      this.drawShooter(e, x, y, hit);
    } else if (e.def === this.cfg.enemies.bull) {
      // Бык: жук-носорог с красным акцентом, размытием в рывке и пылью при торможении.
      this.drawBull(e, x, y, hit);
    } else if (e.def === this.cfg.enemies.rockBeetle) {
      this.drawRockBeetle(e, x, y, hit);
    } else if (e.def === this.cfg.enemies.ashenArch) {
      this.drawArch(e, x, y, hit); // ЗАГЛУШКА ГРАФИКИ: большой серый жук
    } else if (e.def === this.cfg.enemies.tartas) {
      // Тартас: замёрзший рыцарь с ледяным мечом.
      this.drawTartas(e, x, y, hit);
    } else if (e.def === this.cfg.enemies.spectralSerpent) {
      this.drawSpectralSerpent(e,x,y,hit);
    } else if (e.def === this.cfg.enemies.elderSpirit) {
      this.drawElderSpirit(e,x,y,hit);
    } else if (e.def === this.cfg.enemies.spirit) {
      this.drawSpirit(e,x,y,hit);
    } else if (e.def === this.cfg.enemies.battleMage) {
      this.drawBattleMage(e,x,y,hit);
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
        if (this.apotheosis && this.apotheosis.fin.dissolve > 0) ctx.globalAlpha = Math.max(0, 1 - this.apotheosis.fin.dissolve); // эпилог: рассыпается, тает
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

    if (e.vuln) this.drawVulnFx(e, x, y, r);
    this.drawStatusFx(e, x, y, r);
    if (e.rainGravityT > 0) this.drawRainPressure(e, x, y, r);
    if (e.gravityDashSlowT > 0) {
      // Замедление от пространственного импульса: три прерывистые фиолетовые орбиты.
      const ctx = this.ctx;
      const K = this.cfg.kinetic;
      const t = this.clock * 0.8;
      ctx.save();
      ctx.strokeStyle = K.gravityEdgeColor;
      ctx.lineWidth = 1.4;
      ctx.globalAlpha = Math.min(0.75, e.gravityDashSlowT * 0.45);
      for (let j = 0; j < 3; j++) {
        const a = t + j * TAU / 3;
        ctx.beginPath();
        ctx.arc(x, y, r + 5, a, a + 1.12);
        ctx.stroke();
      }
      ctx.restore();
    }
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
  /** Уязвимость от Магического дождя: слабое синее свечение вокруг врага. */
  drawVulnFx(e, x, y, r) {
    const ctx = this.ctx;
    const p = 0.75 + 0.25 * Math.sin(this.clock * 3 + e.x * 0.05);
    ctx.beginPath();
    ctx.arc(x, y, r + 4, 0, TAU);
    ctx.fillStyle = 'rgba(90,160,255,' + (0.14 * p).toFixed(3) + ')';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(130,190,255,' + (0.4 * p).toFixed(3) + ')';
    ctx.stroke();
  }

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
      if (stacks > 0 || frozen) { // горит и в холоде: испарение. Бледные клубы пара вьются вверх, огонь шипит и тускнеет
        const puff = this.getPuff();
        ctx.globalCompositeOperation = 'source-over';
        for (let k = 0; k < 6; k++) {
          const ph = (t * 0.7 + k / 6 + rnd(k + 170) * 0.2) % 1;
          const wob = Math.sin(t * 3.2 + k * 2.4 + sd) * r * 0.45 * ph;
          const sz = r * (0.6 + 1.2 * ph);
          const px = (rnd(k + 180) - 0.5) * r * 1.1 + wob;
          const py = -r * 0.2 - ph * r * 2.6;
          ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.9 * fade;
          ctx.drawImage(puff, px - sz, py - sz, sz * 2, sz * 2);
        }
        ctx.strokeStyle = 'rgba(235,245,255,0.7)'; // тонкие завитки пара
        ctx.lineWidth = 1;
        for (let k = 0; k < 2; k++) {
          const ph = (t * 0.9 + k * 0.5 + rnd(k + 190)) % 1;
          const bx = (rnd(k + 200) - 0.5) * r * 0.9;
          ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.6 * fade;
          ctx.beginPath();
          for (let q = 0; q <= 6; q++) { const u = q / 6; const x = bx + Math.sin(u * 5 + t * 4 + k) * r * 0.22 * u; const y = -r * 0.4 - ph * r * 2 - u * r * 0.9; if (q) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
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
    const key = violet === 'ash' ? 'glowAsh' : violet === 'red' ? 'glowRed' : violet === 'blue' ? 'glowBlue' : violet === 'gold' ? 'glowGold' : violet ? 'glowViolet' : 'glow';
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
    if (violet === 'ash') {
      gr.addColorStop(0, 'rgba(250,250,255,1)');
      gr.addColorStop(0.3, 'rgba(206,212,228,0.55)');
      gr.addColorStop(0.7, 'rgba(170,178,200,0.14)');
      gr.addColorStop(1, 'rgba(150,158,184,0)');
    } else if (violet === 'gold') {
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
  // ЗАГЛУШКА ГРАФИКИ: Охотник. Зелёный вытянутый жук, острая голова-клин вперёд, узкие жёлтые «глаза охотника».
  drawHunter(e, x, y, hit) {
    const ctx = this.ctx;
    const r = e.radius;
    const t = this.clock;
    let st = this.beetleState.get(e);
    if (!st) {
      st = { a: Math.atan2(this.hero.y - y, this.hero.x - x), ph: Math.random() * TAU };
      this.beetleState.set(e, st);
    }
    const moving = e.hx !== 0 || e.hy !== 0;
    const target = moving ? Math.atan2(e.hy, e.hx) : Math.atan2(this.hero.y - y, this.hero.x - x);
    let da = (target - st.a) % TAU;
    if (da > Math.PI) da -= TAU;
    else if (da < -Math.PI) da += TAU;
    st.a += da * 0.35;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(st.a);
    const k = hit ? 1.15 : 1;
    ctx.scale(k, k);
    // Ноги: быстрые, на бегу.
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const lx = (0.3 - i * 0.4) * r;
      const sw = moving ? Math.sin(t * 30 + st.ph + i * 2.1) * 0.3 * r : 0;
      ctx.moveTo(lx, -0.4 * r); ctx.lineTo(lx - 0.25 * r + sw, -1.0 * r);
      ctx.moveTo(lx, 0.4 * r); ctx.lineTo(lx - 0.25 * r - sw, 1.0 * r);
    }
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = '#1f5a2a';
    ctx.stroke();
    // Тело: узкий клин, острый нос вперёд (+x).
    ctx.beginPath();
    ctx.moveTo(1.5 * r, 0);
    ctx.lineTo(0.5 * r, -0.5 * r);
    ctx.lineTo(-0.7 * r, -0.62 * r);
    ctx.lineTo(-1.1 * r, 0);
    ctx.lineTo(-0.7 * r, 0.62 * r);
    ctx.lineTo(0.5 * r, 0.5 * r);
    ctx.closePath();
    ctx.fillStyle = hit ? '#ffffff' : '#2e8f3e';
    ctx.fill();
    ctx.strokeStyle = hit ? '#ffffff' : e.def.edge;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    if (!hit) {
      ctx.fillStyle = '#1d6b2c'; // тёмная полоса вдоль спины
      ctx.beginPath();
      ctx.moveTo(0.3 * r, 0); ctx.lineTo(-0.8 * r, -0.28 * r); ctx.lineTo(-0.8 * r, 0.28 * r);
      ctx.closePath();
      ctx.fill();
      // Глаза охотника: два узких светящихся косых глаза у основания клина.
      ctx.fillStyle = '#ffe94a';
      ctx.shadowColor = '#ffe94a';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.moveTo(0.95 * r, -0.12 * r); ctx.lineTo(0.35 * r, -0.42 * r); ctx.lineTo(0.5 * r, -0.12 * r);
      ctx.closePath();
      ctx.moveTo(0.95 * r, 0.12 * r); ctx.lineTo(0.35 * r, 0.42 * r); ctx.lineTo(0.5 * r, 0.12 * r);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

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
    const archDef = this.cfg.enemies.ashenArch;
    const archCols = archDef && archDef.arch ? [archDef.arch.volley.shot.color, archDef.arch.burst.shot.color] : ['', ''];
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
      if (p.color === archCols[0] || p.color === archCols[1]) continue; // у шаров Арха своё свечение
      const g = p.radius * (p.flameArrow?5:3.2);
      ctx.drawImage(p.flameArrow?this.getGlow():glow, px - g, py - g, g * 2, g * 2);
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
      const element = p.gravityReturned ? p.gravityElementMask : 0;
      if (element) {
        // Обратный снаряд уже не слизь: раскалённый осколок, ледяной кристалл или электрическая искра.
        const fire = !!(element & 1), ice = !!(element & 2), lightning = !!(element & 4);
        ctx.fillStyle = fire && ice ? C.gravitySteam : fire ? C.gravityFire : ice ? C.gravityFrost : C.gravityLightning;
        ctx.beginPath();
        ctx.moveTo(r * 1.45, 0);
        ctx.lineTo(-r * 0.5, -r * (ice ? 1.25 : 0.8));
        ctx.lineTo(-r * (lightning ? 2.25 : 1.75), 0);
        ctx.lineTo(-r * 0.5, r * (ice ? 1.25 : 0.8));
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = lightning ? C.gravityLightningCore : ice ? C.gravityFrostCore : C.gravityFireCore;
        ctx.beginPath(); ctx.arc(r * 0.12, 0, r * 0.5, 0, TAU); ctx.fill();
        if (lightning) {
          ctx.strokeStyle = C.gravityLightning; ctx.lineWidth = Math.max(1, r * 0.25);
          ctx.beginPath(); ctx.moveTo(-r * 1.5, -r * 1.25);
          ctx.lineTo(-r * 0.75, -r * 0.3);
          ctx.lineTo(-r * 1.35, r * 0.4);
          ctx.lineTo(-r * 0.4, r * 1.2); ctx.stroke();
        }
        ctx.restore();
        continue;
      }
      if(p.flameArrow){
        // Огненная стрела со стальным древком и живым хвостом пламени.
        const flick=Math.sin(t*21+ph)*.18;
        ctx.globalCompositeOperation='lighter';
        ctx.fillStyle='rgba(255,89,31,.38)';
        ctx.beginPath();ctx.ellipse(-r*1.8,0,r*(2.7+flick),r*.95,0,0,TAU);ctx.fill();
        ctx.fillStyle='#fd7830';
        ctx.beginPath();ctx.moveTo(r*.4,-r*.8);
        ctx.quadraticCurveTo(-r*1.5,-r*1.5,-r*(4.1+flick),0);
        ctx.quadraticCurveTo(-r*1.4,r*1.3,r*.4,r*.8);
        ctx.closePath();ctx.fill();
        ctx.fillStyle='#ffda77';
        ctx.beginPath();ctx.moveTo(r*1.2,0);ctx.lineTo(-r*1.6,-r*.45);
        ctx.lineTo(-r*.7,0);ctx.lineTo(-r*1.6,r*.45);ctx.closePath();ctx.fill();
        ctx.globalCompositeOperation='source-over';
        ctx.strokeStyle='#453333';ctx.lineWidth=Math.max(1,r*.28);
        ctx.beginPath();ctx.moveTo(-r*2.4,0);ctx.lineTo(r*1.5,0);ctx.stroke();
        ctx.fillStyle='#f7e9cf';ctx.beginPath();
        ctx.moveTo(r*2.2,0);ctx.lineTo(r*1.1,-r*.4);ctx.lineTo(r*1.1,r*.4);ctx.closePath();ctx.fill();
        ctx.restore();continue;
      }
      if (p.color === archCols[0] || p.color === archCols[1]) { // сфера света Арха с кометным шлейфом, как у снаряда игрока
        const red = p.color === archCols[1];
        const rr = p.radius;
        const sc = (rr * 1.25 / 14) * (0.95 + 0.1 * Math.sin(t * 40 + ph));
        const tf = Math.min(1, p.travelled / 40);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.65;
        ctx.save(); ctx.scale(tf, 1);
        ctx.drawImage(this.getComet(red ? 'AshRed' : 'Ash'), -224 * sc, -32 * sc, 256 * sc, 64 * sc);
        ctx.restore();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.rotate(-Math.atan2(p.vy, p.vx));
        this.drawArchOrb(ctx, 0, 0, rr * 0.95, red, t, 1);
        if (p.parryable) { // можно парировать: бледное тонкое кольцо
          ctx.strokeStyle = 'rgba(243,234,255,0.8)';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(0, 0, rr * 1.6, 0, TAU); ctx.stroke();
        }
        ctx.restore();
        continue;
      }
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
  /**
   * Членистая нога сверху (местные оси: x вперёд, y вправо; свет из localLight): бедро, голень и коготь,
   * сегменты сужаются, со стороны света грань светлее, на колене гранёный сустав.
   * (hx,hy) крепление, side -1/+1, fb -1..1 наклон вперёд/назад, u размер, ph фаза шага, mv 0..1 ходьба,
   * pal { dark, base, lite, cap, glow } (hit: всё белое), opt { l1, l2, w, cap, heat }.
   */
  drawLeg(ctx, hx, hy, side, fb, u, ph, mv, pal, hit, opt) {
    const l1 = u * (opt.l1 || 0.5);
    const l2 = u * (opt.l2 || 0.55);
    const w = u * (opt.w || 0.12);
    const sw = Math.sin(ph) * mv;
    const up = Math.max(0, Math.cos(ph)) * mv; // нога в воздухе: шагает шире
    const kx = hx + (fb * 0.55 + sw * 0.32) * l1;
    const ky = hy + side * l1 * (0.88 + 0.18 * up);
    const fx = kx + (fb * 0.55 + sw * 0.85) * l2 * 0.8;
    const fy = ky + side * l2 * (0.58 + 0.22 * up);
    const lx = this.llx;
    const ly = this.lly;
    const seg = (x0, y0, x1, y1, w0, w1, base, lite) => {
      const dx = x1 - x0;
      const dy = y1 - y0;
      const d = Math.hypot(dx, dy) || 1;
      const nx = -dy / d;
      const ny = dx / d;
      ctx.beginPath();
      ctx.moveTo(x0 + nx * w0, y0 + ny * w0); ctx.lineTo(x1 + nx * w1, y1 + ny * w1); ctx.lineTo(x1 - nx * w1, y1 - ny * w1); ctx.lineTo(x0 - nx * w0, y0 - ny * w0);
      ctx.closePath();
      ctx.fillStyle = hit ? '#ffffff' : base;
      ctx.fill();
      if (hit) return;
      const sg = nx * lx + ny * ly >= 0 ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x1 + sg * nx * w1, y1 + sg * ny * w1); ctx.lineTo(x0 + sg * nx * w0, y0 + sg * ny * w0);
      ctx.closePath();
      ctx.fillStyle = lite;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x0 + nx * w0, y0 + ny * w0); ctx.lineTo(x1 + nx * w1, y1 + ny * w1); ctx.lineTo(x1 - nx * w1, y1 - ny * w1); ctx.lineTo(x0 - nx * w0, y0 - ny * w0);
      ctx.closePath();
      ctx.strokeStyle = 'rgba(6,9,18,0.75)';
      ctx.lineWidth = Math.max(0.8, w * 0.12);
      ctx.stroke();
    };
    ctx.lineJoin = 'round';
    seg(hx, hy, kx, ky, w * 1.05, w * 0.85, pal.dark, pal.base);                     // бедро
    seg(kx, ky, fx, fy, w * 0.78, w * 0.3, pal.base, pal.lite);                       // голень
    if (opt.cap && !hit) { // снежная шапка на бедре
      const cx = (hx + kx) / 2;
      const cy = (hy + ky) / 2;
      ctx.fillStyle = pal.cap;
      ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.moveTo(cx - w * 0.9, cy - w * 0.3); ctx.lineTo(cx + w * 0.2, cy - w * 0.9); ctx.lineTo(cx + w * 0.7, cy - w * 0.1); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }
    // коготь: острие вдоль голени
    const dx = fx - kx;
    const dy = fy - ky;
    const d = Math.hypot(dx, dy) || 1;
    ctx.beginPath();
    ctx.moveTo(fx - (dy / d) * w * 0.38, fy + (dx / d) * w * 0.38); ctx.lineTo(fx + (dx / d) * w * 0.8, fy + (dy / d) * w * 0.8); ctx.lineTo(fx + (dy / d) * w * 0.38, fy - (dx / d) * w * 0.38);
    ctx.closePath();
    ctx.fillStyle = hit ? '#ffffff' : pal.lite;
    ctx.fill();
    // сустав: гранёная пластина
    ctx.beginPath();
    for (let q = 0; q < 6; q++) { const a = q * Math.PI / 3 + 0.3; const rr = w * (q % 2 ? 0.8 : 1.0); if (q) ctx.lineTo(kx + Math.cos(a) * rr, ky + Math.sin(a) * rr); else ctx.moveTo(kx + Math.cos(a) * rr, ky + Math.sin(a) * rr); }
    ctx.closePath();
    ctx.fillStyle = hit ? '#ffffff' : pal.dark;
    ctx.fill();
    if (!hit) {
      ctx.beginPath();
      ctx.moveTo(kx - w * 0.7, ky - w * 0.2); ctx.lineTo(kx - w * 0.1, ky - w * 0.8); ctx.lineTo(kx + w * 0.5, ky - w * 0.45); ctx.lineTo(kx, ky);
      ctx.closePath();
      ctx.fillStyle = pal.base;
      ctx.fill();
      if (opt.heat > 0.02) { // жар в суставе
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(1, opt.heat);
        const g = opt.glow;
        ctx.drawImage(g, kx - w * 2.2, ky - w * 2.2, w * 4.4, w * 4.4);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }
    }
  }

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
    let mvs = 0;
    if (!frozen) {
      const mv = Math.hypot(x - st.ox, y - st.oy);
      st.mvs = (st.mvs || 0) + (Math.min(1, mv * 0.8) - (st.mvs || 0)) * 0.15;
      mvs = st.mvs;
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
    // Лапы (под телом): шесть членистых каменных лап, ходьба тройками. Растут при вставании.
    if (ease > 0.01) {
      ctx.save();
      ctx.rotate(st.a);
      this.localLight(st.a);
      const pal = { dark: '#36425e', base: '#4a5876', lite: '#8296be', cap: '#e4eefb', glow: this.getGlow() };
      for (let i = 0; i < 6; i++) {
        const side = i < 3 ? -1 : 1;
        const k = i % 3;
        const hx = (0.42 - k * 0.42) * rk;
        const hy = side * rk * 0.55;
        const ph = st.step * 1.15 + ((k + (side > 0 ? 1 : 0)) % 2) * Math.PI;
        this.drawLeg(ctx, hx, hy, side, (1 - k) * 0.55, rk * ease, ph, mvs, pal, hit, { l1: 0.55, l2: 0.48, w: 0.19, cap: true, heat: heat * 0.45, glow: pal.glow });
      }
      ctx.restore();
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

    this.localLight(st.a);
    const lx = this.llx;
    const ly = this.lly;
    const mix3 = (c0, c1, k) => 'rgb(' + Math.round(c0[0] + (c1[0] - c0[0]) * k) + ',' + Math.round(c0[1] + (c1[1] - c0[1]) * k) + ',' + Math.round(c0[2] + (c1[2] - c0[2]) * k) + ')';
    const DK = [14, 20, 36];
    const LT = [84, 104, 160];

    // Лапы: шесть членистых ног; в рывке прижаты (там и так смазано).
    if (!striking) {
      const pal = { dark: '#26325a', base: '#3a4b82', lite: '#7088c4', cap: '#fff', glow };
      const mvL = frozen ? 0 : moving ? 1 : 0;
      for (let i = 0; i < 6; i++) {
        const side = i < 3 ? -1 : 1;
        const k = i % 3;
        const ph = t * 16 + st.ph + ((k + (side > 0 ? 1 : 0)) % 2) * Math.PI;
        this.drawLeg(ctx, (0.4 - k * 0.5) * r, side * 0.5 * r, side, (1 - k) * 0.6, r, ph, mvL, pal, hit, { l1: 0.52, l2: 0.56, w: 0.14, heat: rage * 0.6, glow });
      }
    }

    // Панцирь: гранёные крылья, каждая грань по свету; красная кайма, жар под швом.
    const SH = BULL_SHELL;
    const cx0 = -0.15;
    ctx.lineJoin = 'round';
    for (let i = 0; i < 8; i++) {
      const x0 = SH[i * 2];
      const y0 = SH[i * 2 + 1];
      const x1 = SH[((i + 1) % 8) * 2];
      const y1 = SH[((i + 1) % 8) * 2 + 1];
      const mx = (x0 + x1) / 2 - cx0;
      const my = (y0 + y1) / 2;
      const ml = Math.hypot(mx, my) || 1;
      const b = 0.5 + 0.5 * ((mx / ml) * lx + (my / ml) * ly);
      ctx.beginPath();
      ctx.moveTo(cx0 * r, 0); ctx.lineTo(x0 * r, y0 * r); ctx.lineTo(x1 * r, y1 * r);
      ctx.closePath();
      ctx.fillStyle = hit ? '#ffffff' : mix3(DK, LT, 0.1 + 0.75 * b);
      ctx.fill();
    }
    if (!hit) {
      // Борозды надкрылий и шов по центру.
      const hwAt = (xx) => (xx > 0.62 ? 0.62 : xx > 0.15 ? 0.62 + (0.62 - xx) / 0.47 * 0.28 : xx > -0.65 ? 0.9 - (0.15 - xx) / 0.8 * 0.12 : Math.max(0.1, 0.78 - (-0.65 - xx) / 0.4 * 0.58));
      ctx.lineCap = 'round';
      for (let sg = -1; sg <= 1; sg += 2) {
        for (let f = 0; f < 3; f++) {
          const fk = 0.3 + f * 0.26;
          ctx.beginPath();
          for (let q = 0; q <= 8; q++) { const xx = 0.5 - q * 0.18; const yy = sg * hwAt(xx) * fk; if (q) ctx.lineTo(xx * r, yy * r); else ctx.moveTo(xx * r, yy * r); }
          ctx.strokeStyle = 'rgba(4,6,12,0.65)';
          ctx.lineWidth = 1.4;
          ctx.stroke();
          ctx.translate(-0.4, -0.5);
          ctx.strokeStyle = 'rgba(120,140,200,0.28)';
          ctx.lineWidth = 0.9;
          ctx.stroke();
          ctx.translate(0.4, 0.5);
        }
      }
      // Жар под панцирем и красные швы: разгораются в замахе и рывке.
      ctx.globalAlpha = frozen ? 0.06 : 0.1 + 0.4 * rage;
      ctx.drawImage(glow, -1.5 * r, -1.1 * r, 2.4 * r, 2.2 * r);
      ctx.globalAlpha = frozen ? 0.3 : 0.5 + 0.45 * rage + 0.05 * f1;
      ctx.lineWidth = 1.7;
      ctx.strokeStyle = '#ff4a3d';
      ctx.beginPath();
      ctx.moveTo(0.35 * r, 0);
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
    ctx.lineWidth = 1.1;
    ctx.globalAlpha = hit ? 1 : 0.5 + 0.45 * rage;
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

    // Передняя пластина (переднеспинка): две половины по свету, гребень и поперечные рёбра.
    {
      const P = BULL_PRON;
      ctx.beginPath();
      tracePoly(ctx, P, r);
      ctx.fillStyle = hit ? '#ffffff' : '#18203a';
      ctx.fill();
      if (!hit) {
        ctx.beginPath(); // освещённая половина: сверху слева
        ctx.moveTo(0.82 * r, -0.4 * r); ctx.lineTo(0.5 * r, -0.62 * r); ctx.lineTo(0.22 * r, -0.52 * r); ctx.lineTo(0.22 * r, 0); ctx.lineTo(0.82 * r, 0);
        ctx.closePath();
        ctx.fillStyle = '#34416c';
        ctx.fill();
        ctx.strokeStyle = 'rgba(4,6,12,0.7)';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(0.82 * r, 0); ctx.lineTo(0.22 * r, 0);
        for (let q = 0; q < 3; q++) { const xx = (0.34 + q * 0.16) * r; ctx.moveTo(xx, -0.5 * r + q * 0.04 * r); ctx.lineTo(xx, 0.5 * r - q * 0.04 * r); }
        ctx.stroke();
      }
      ctx.lineWidth = 1;
      ctx.globalAlpha = hit ? 1 : 0.65;
      ctx.strokeStyle = hit ? '#ffffff' : '#e0443c';
      ctx.beginPath();
      tracePoly(ctx, P, r);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Рог: гранёный, светлая верхняя грань, два отростка и острые жвалы у основания.
    {
      ctx.beginPath();
      ctx.moveTo(0.8 * r, -0.24 * r); ctx.lineTo(1.3 * r, -0.15 * r); ctx.lineTo(1.78 * r, 0); ctx.lineTo(1.3 * r, 0.15 * r); ctx.lineTo(0.8 * r, 0.24 * r);
      ctx.closePath();
      ctx.fillStyle = hit ? '#ffffff' : '#0b0f1a';
      ctx.fill();
      if (!hit) {
        ctx.beginPath(); ctx.moveTo(0.8 * r, -0.24 * r); ctx.lineTo(1.3 * r, -0.15 * r); ctx.lineTo(1.78 * r, 0); ctx.lineTo(0.8 * r, 0); ctx.closePath();
        ctx.fillStyle = '#2c3860';
        ctx.fill();
        ctx.beginPath(); ctx.moveTo(1.3 * r, -0.15 * r); ctx.lineTo(1.62 * r, -0.38 * r); ctx.lineTo(1.52 * r, -0.06 * r); ctx.closePath();
        ctx.fillStyle = '#34416c';
        ctx.fill();
        ctx.beginPath(); ctx.moveTo(1.3 * r, 0.15 * r); ctx.lineTo(1.62 * r, 0.38 * r); ctx.lineTo(1.52 * r, 0.06 * r); ctx.closePath();
        ctx.fillStyle = '#10172a';
        ctx.fill();
        for (let sg = -1; sg <= 1; sg += 2) { // жвалы
          ctx.beginPath(); ctx.moveTo(0.86 * r, sg * 0.3 * r); ctx.lineTo(1.18 * r, sg * 0.44 * r); ctx.lineTo(1.0 * r, sg * 0.24 * r); ctx.closePath();
          ctx.fillStyle = sg < 0 ? '#2c3860' : '#10172a';
          ctx.fill();
        }
      }
      ctx.beginPath();
      tracePoly(ctx, BULL_HORN, r);
      tracePoly(ctx, BULL_PRONG_L, r);
      tracePoly(ctx, BULL_PRONG_R, r);
      ctx.lineWidth = 0.9;
      ctx.globalAlpha = hit ? 1 : 0.75;
      ctx.strokeStyle = hit ? '#ffffff' : '#e0443c';
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

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
  /** Неуязвимое Воплощение: парящий шар с динамическим кометным шлейфом в направлении скорости. */
  drawGravityAfterimages(ctx) {
    const traces = this.incarnation?.afterimages;
    if (!traces?.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of traces) {
      const a = Math.max(0, p.life / 0.3);
      ctx.globalAlpha = a * 0.4;
      ctx.fillStyle = '#9d9aff';
      ctx.shadowColor = '#8fc9ff';
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, this.hero.radius * 0.8, this.hero.radius * 1.2, p.facing + Math.PI / 2, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawLaserIncarnation(ctx, x, y) {
    const form = this.cfg.skills.incarnation.forms?.[this.hero.incarnationMask || 0];
    const color = form?.core || '#b6eaff';
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = color; ctx.shadowBlur = 25;
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x,y,7,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }

  drawLaserIncarnationPaths(ctx) {
    const paths = this.incarnation?.laserPath;
    if (!paths?.length) return;
    const form = this.cfg.skills.incarnation.forms?.[this.hero.incarnationMask || 0];
    const color = form?.core || '#b6eaff';
    ctx.save();
    ctx.lineCap = 'round';
    ctx.globalCompositeOperation = 'lighter';
    for (const p of paths) {
      const a = Math.max(0,p.life / p.maxLife);
      ctx.globalAlpha = a;
      const n = Math.max(1, p.strands || 1);
      for (let j=0; j<n; j++) {
        const offset = j-(n-1)/2;
        const bend = offset * (this.cfg.skills.incarnation.splitLaserArc || 18);
        const mx=(p.x1+p.x2)/2, my=(p.y1+p.y2)/2;
        const dx=p.x2-p.x1,dy=p.y2-p.y1,dist=Math.hypot(dx,dy)||1;
        ctx.strokeStyle=color; ctx.shadowColor=color;ctx.shadowBlur=14;
        ctx.lineWidth=Math.max(1.5, 9/Math.sqrt(n));
        ctx.beginPath();ctx.moveTo(p.x1,p.y1);
        if (p.chaotic) {
          const segment = Math.max(3, Math.ceil(dist / 30));
          const nx = -dy/dist, ny = dx/dist;
          for (let k=1;k<segment;k++) {
            const t = k/segment;
            const jitter = (Math.sin((j+1)*19.1+k*7.43+this.clock*34)*0.6 + Math.sin(k*12.3-this.clock*19+j)*0.4) * (10 + 13*Math.sin(Math.PI*t));
            const warp = bend*Math.sin(Math.PI*t) + jitter;
            ctx.lineTo(p.x1+dx*t+nx*warp,p.y1+dy*t+ny*warp);
          }
          ctx.lineTo(p.x2,p.y2);
        } else ctx.quadraticCurveTo(mx-dy/dist*bend,my+dx/dist*bend,p.x2,p.y2);
        ctx.stroke();
        ctx.strokeStyle='#ffffff';ctx.lineWidth=Math.max(.5,2/Math.sqrt(n));
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawIncarnation(hx, hy) {
    const ctx = this.ctx, hero = this.hero, S = this.cfg.skills.incarnation;
    const mask = hero.incarnationMask || 0;
    const fire = !!(mask & 1), frost = !!(mask & 2), lightning = !!(mask & 4);
    const form = S.forms?.[mask] || S.forms?.[0] || { outer: '#7bbcff', glow: '#b6eaff', core: '#e5faff', tail: '#4285dd' };
    const copies = this.incarnation?.splitCount || 1;
    const scatter = !!this.incarnation?.shotForm;
    if (copies > 1 || scatter) {
      const nodes = scatter ? Math.max(8, copies * 8) : copies;
      const radius = Math.max(2.5, S.coreRadius * (scatter ? 0.24 : Math.min(0.72, 1.25 / Math.sqrt(copies))));
      const spread = copies >= 12 ? S.coreRadius * 0.9 : S.coreRadius * 1.35;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < nodes; i++) {
        const ring = scatter ? 0.5 + (i % 5) / 10 : copies >= 12 ? (i % 3) / 3 : 1;
        const ang = this.clock * (scatter ? (2.6 + (i % 4) * 0.7) : 2.6 + 0.3 * (i % 3)) + i * Math.PI * 2 / nodes;
        const x = hx + Math.cos(ang) * spread * ring;
        const y = hy + Math.sin(ang) * spread * ring;
        ctx.shadowColor = form.glow;
        ctx.shadowBlur = radius * 2.5;
        ctx.fillStyle = form.core;
        if (scatter) { ctx.strokeStyle = form.glow; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x - Math.cos(ang + this.clock * 4) * 16, y - Math.sin(ang + this.clock * 4) * 16); ctx.stroke(); }
        ctx.beginPath(); ctx.arc(x,y,radius,0,Math.PI*2); ctx.fill();
      }
      ctx.restore();
      return;
    }
    const speed = Math.hypot(hero.vx, hero.vy);
    const angle = speed > 10 ? Math.atan2(hero.vy, hero.vx) : hero.facing;
    const bob = Math.sin(this.clock * 6.5) * 2.4;
    const r = Math.max(3, S.coreRadius);
    const length = Math.max(8, S.tailLength) * (0.6 + 0.4 * Math.min(1.5, speed / Math.max(1, hero.cfg.speed)));
    const pulse = 0.84 + 0.16 * Math.sin(this.clock * 9);
    ctx.save();
    ctx.translate(hx, hy + bob);
    ctx.rotate(angle);
    // Шлейф отклоняется по инерции и выглядит как несколько слоёв эфирного пламени.
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = form.tail;
    ctx.beginPath();
    ctx.moveTo(r * 0.2, -r * 0.8);
    ctx.bezierCurveTo(-length * 0.33, -r * 1.3, -length * 0.7, -r * 0.3,
      -length * (1 + 0.05 * Math.sin(this.clock * 12)), 0);
    ctx.bezierCurveTo(-length * 0.65, r * 0.5, -length * 0.3, r * 1.25, r * 0.2, r * 0.8);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = form.outer;
    ctx.globalAlpha = 0.52 * pulse;
    ctx.beginPath();
    ctx.moveTo(r * 0.1, -r * 0.4);
    ctx.quadraticCurveTo(-length * 0.46, -r * 0.55, -length * 0.78, 0);
    ctx.quadraticCurveTo(-length * 0.37, r * 0.58, r * 0.1, r * 0.4);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 0.24 + 0.15 * pulse;
    ctx.fillStyle = form.glow;
    ctx.beginPath(); ctx.arc(0, 0, r * 2.3, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.5 * pulse;
    ctx.beginPath(); ctx.arc(0, 0, r * 1.6, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = form.outer;
    ctx.beginPath(); ctx.arc(0, 0, r * 1.12, 0, TAU); ctx.fill();
    ctx.fillStyle = form.glow;
    ctx.beginPath(); ctx.arc(r * 0.13, -r * 0.1, r * 0.79, 0, TAU); ctx.fill();
    ctx.fillStyle = form.core;
    ctx.beginPath(); ctx.arc(r * 0.31, -r * 0.23, r * 0.43, 0, TAU); ctx.fill();
    // Небольшие потоки энергии не требуют отдельных частиц или списков каждый кадр.
    ctx.strokeStyle = form.core;
    ctx.lineWidth = 1.3;
    ctx.globalAlpha = 0.62;
    for (let i = 0; i < 3; i++) {
      const x = -r - i * length * 0.23;
      const y = Math.sin(this.clock * 7.5 + i * 2.5) * r * (0.55 + i * 0.17);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - r * 0.8, y * 1.12); ctx.stroke();
    }
    // Отличительные признаки стихии: отдельный дизайн для каждой из семи комбинаций.
    if (fire) {
      ctx.globalAlpha = 0.76 * pulse;
      ctx.strokeStyle = '#ff8241'; ctx.lineWidth = 2.5;
      for (let i = 0; i < 5; i++) {
        const a = this.clock * 1.6 + i * TAU / 5;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r * 1.1, Math.sin(a) * r * 1.1);
        ctx.quadraticCurveTo(Math.cos(a + 0.16) * r * 1.7, Math.sin(a + 0.16) * r * 1.7,
          Math.cos(a + 0.4) * r * 1.2, Math.sin(a + 0.4) * r * 1.2);
        ctx.stroke();
      }
    }
    if (frost) {
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = '#c7f6ff'; ctx.lineWidth = 1.9;
      for (let i = 0; i < 6; i++) {
        const a = i * TAU / 6 + this.clock * 0.2;
        const x = Math.cos(a) * r * 1.15, y = Math.sin(a) * r * 1.15;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(Math.cos(a + 0.13) * r * 1.9, Math.sin(a + 0.13) * r * 1.9);
        ctx.lineTo(Math.cos(a - 0.17) * r * 1.55, Math.sin(a - 0.17) * r * 1.55);
        ctx.closePath(); ctx.stroke();
      }
    }
    if (lightning) {
      ctx.globalAlpha = 0.95;
      ctx.strokeStyle = fire ? '#ff484b' : '#fbf0a6';
      ctx.lineWidth = fire ? 3 : 1.8;
      for (let i = 0; i < 4; i++) {
        const a = i * TAU / 4 + this.clock * 2.5;
        ctx.save(); ctx.rotate(a);
        ctx.beginPath(); ctx.moveTo(r * 0.7, -r * 0.15);
        ctx.lineTo(r * 1.4, -r * 0.5); ctx.lineTo(r * 1.18, r * 0.08);
        ctx.lineTo(r * 1.9, r * 0.36); ctx.stroke(); ctx.restore();
      }
    }
    if (fire && frost) {
      ctx.globalAlpha = 0.22 * pulse;
      ctx.fillStyle = '#f5dbea';
      for (let i = 0; i < 3; i++) {
        const a = this.clock * 0.5 + i * TAU / 3;
        ctx.beginPath(); ctx.arc(Math.cos(a) * r * 1.6, Math.sin(a) * r * 1.6,
          r * 0.75, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
  }

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
      : kind === 'Ash'
        ? [[0, 'rgba(150,156,172,0)'], [0.5, 'rgba(196,202,216,0.4)'], [1, 'rgba(252,252,255,0.95)']]
      : kind === 'AshRed'
        ? [[0, 'rgba(210,70,50,0)'], [0.5, 'rgba(236,128,108,0.4)'], [1, 'rgba(255,238,228,0.95)']]
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
      const kd = p.gravityReflected ? 4 : p.zap ? (p.frost && p.burnDmg > 0 ? 3 : p.frost ? 1 : p.burnDmg > 0 ? 2 : 5) : p.gen > 0 ? 4 : p.steam > 0 ? 3 : p.burnDmg > 0 ? 2 : p.frost ? 1 : 0; // 4 фантомный фиолетовый; 0 синий, 1 ледяной (Мороз), 2 огненный (Горение), 3 пар (оба)
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
      if (p.gen > 0 && p.travelled < 85)
        this.drawPhantomConjuring(ctx,px,py,r*2.4,Math.min(1,p.travelled/85),p.gen);
      if (p.hits?.length)
        this.drawPierceTrail(ctx,px,py,ang,Math.max(5,r*2.8),0.48,0);
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
      const kd = p.gravityReflected ? 4 : p.zap ? (p.frost && p.burnDmg > 0 ? 3 : p.frost ? 1 : p.burnDmg > 0 ? 2 : 5) : p.gen > 0 ? 4 : p.steam > 0 ? 3 : p.burnDmg > 0 ? 2 : p.frost ? 1 : 0;
      ctx.globalAlpha = 1;
      ctx.fillStyle = kd === 5 ? '#ffd21e' : kd === 4 ? '#8a5cff' : kd === 3 ? '#ffa24a' : kd === 2 ? '#ff8a2a' : kd === 1 ? '#9fe6ff' : '#3f86ff';
      ctx.beginPath();
      ctx.arc(px, py, r * 0.95, 0, TAU);
      ctx.fill();
      ctx.fillStyle = kd === 5 ? '#fffbe0' : kd === 4 ? '#efe4ff' : kd === 3 ? '#f2fbff' : kd === 2 ? (gl > 0.5 ? '#fff6dc' : '#ffd890') : kd === 1 ? '#f2fcff' : '#d6ecff';
      ctx.beginPath();
      ctx.arc(px - r * 0.12, py - r * 0.16, r * (0.55 + 0.15 * gl), 0, TAU);
      ctx.fill();
      if (p.gravity) {
        // #153: линзовые кольца, дуги преломления и растягивающееся поле.
        // Параметры берём из реального разгона, не создаём отдельного снаряда.
        const phase=Math.min(1,(p.gravityAge||0)/Math.max(.001,p.gravityRamp||.1));
        this.spellFx.gravityLens(ctx,px,py,r,phase,t,p.vx,p.vy);
      }
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

  /** Снежная буря привязана к мировым координатам, не к экрану камеры. */
  drawSpiritTrail(e,x,y){
    const c=this.ctx,t=this.clock;
    if(!e._spiritTrail||e._spiritTrailGen!==e.gen){
      e._spiritTrail=[];e._spiritTrailGen=e.gen;e._spiritTrailAt=0;
    }
    if(t-e._spiritTrailAt>.11){ // вдвое реже и вдвое меньше точек: след тот же, а закрашенных пикселей в два раза меньше
      e._spiritTrailAt=t;
      e._spiritTrail.push({x,y,t});
      if(e._spiritTrail.length>11)e._spiritTrail.shift();
    }
    const glow=this.getGlow('blue');
    c.save();c.globalCompositeOperation='screen';
    for(const p of e._spiritTrail){
      const age=t-p.t;if(age>1.25)continue;
      const a=1-age/1.25,r=e.radius*(.6+age*.8);
      // Один кэшированный ореол вместо нового градиента на каждую точку каждого духа в каждом кадре.
      c.globalAlpha=a*.28;
      c.drawImage(glow,p.x-r*2.1,p.y-r*2.1,r*4.2,r*4.2);
    }
    c.restore();
  }

  drawSpectralSerpent(e,x,y,hit){
    const c=this.ctx,t=this.clock,angle=Math.atan2(e.hy||0,e.hx||1);
    c.save();c.translate(x,y);c.rotate(angle);
    // shadowBlur на каждом из десятков сегментов перегружал GPU (у духов его уже заменили ореолом): здесь тоже один кэшированный ореол.
    c.globalAlpha=.3;
    c.drawImage(this.getGlow('blue'),-70,-34,110,68);
    c.globalAlpha=hit?.95:.78;
    const sway=t*7+e.gen;
    // Длинное чешуйчатое тело, сегменты с плавной линией хребта.
    for(let j=13;j>=0;j--){
      const u=j/13,px=-j*8,py=Math.sin(sway-j*.54)*10*u;
      const r=(1-u)*13+1.3;
      c.fillStyle=j%3?'#547aa4':'#82b7d7';
      c.beginPath();c.ellipse(px,py,r*1.15,r*.82,-.12,0,TAU);c.fill();
      c.fillStyle='rgba(191,234,255,.48)';
      c.beginPath();c.ellipse(px-2,py-r*.27,r*.7,r*.24,0,0,TAU);c.fill();
      if(j>2 && j%2===0){
        c.fillStyle='#c4e9f3';c.beginPath();
        c.moveTo(px-5,py-r*.55);c.lineTo(px-9,py-r*1.6);
        c.lineTo(px+4,py-r*.5);c.closePath();c.fill();
      }
      if(j===13){c.fillStyle='#b4d9ee';c.beginPath();
        c.moveTo(px-2,py);c.lineTo(px-22,py-12);c.lineTo(px-17,py+8);c.fill();}
    }
    // Костяные плавники и пара загнутых ледяных рогов.
    c.fillStyle='#7ca9c9';c.beginPath();c.moveTo(-13,-8);
    c.lineTo(-32,-35);c.lineTo(-5,-20);c.lineTo(0,-10);c.fill();
    c.beginPath();c.moveTo(-13,8);c.lineTo(-30,32);
    c.lineTo(-4,20);c.lineTo(0,10);c.fill();
    c.fillStyle=hit?'#fff':'#8ebbd7';
    c.beginPath();c.moveTo(-12,-13);c.lineTo(11,-17);c.lineTo(31,-8);
    c.lineTo(39,0);c.lineTo(29,12);c.lineTo(10,17);c.lineTo(-13,11);
    c.closePath();c.fill();
    c.fillStyle='#cdebf4';c.beginPath();c.moveTo(3,-12);
    c.lineTo(-5,-29);c.lineTo(15,-19);c.lineTo(19,-11);c.fill();
    c.beginPath();c.moveTo(3,12);c.lineTo(-5,29);
    c.lineTo(15,19);c.lineTo(19,11);c.fill();
    c.fillStyle='#193c65';c.beginPath();c.ellipse(21,-9,4,3,0,0,TAU);
    c.ellipse(21,9,4,3,0,0,TAU);c.fill();
    c.strokeStyle='#e2faff';c.lineWidth=1.8;
    c.beginPath();c.moveTo(26,-2);c.lineTo(39,0);c.lineTo(26,4);c.stroke();
    c.restore();
  }

  drawElderSpirit(e,x,y,hit){
    const c=this.ctx,t=this.clock;
    c.save();
    // Большие духи призывают много мобов: вместо дорогой тени на каждой
    // детали магических доспехов используем мягкий кэшированный ореол.
    c.globalAlpha=.32;
    c.drawImage(this.getGlow('blue'),x-62,y-70,124,140);
    c.globalAlpha=.76;
    this.drawBattleMage(e,x,y,hit);
    // Ритуальный нимб из фрагментов рунической печати.
    c.translate(x,y);
    const phase=t*.65+e.gen;
    c.strokeStyle='rgba(183,216,255,.7)';c.lineWidth=1.7;
    for(let j=0;j<9;j++){
      const a=phase+j*TAU/9,r=49+Math.sin(t*2+j)*3;
      c.beginPath();c.arc(0,0,r,a,a+.24);c.stroke();
      c.beginPath();c.moveTo(Math.cos(a)*r,Math.sin(a)*r);
      c.lineTo(Math.cos(a+.13)*(r+8),Math.sin(a+.13)*(r+8));c.stroke();
    }
    c.restore();
  }

  drawSpirit(e,x,y,hit){
    const c=this.ctx;
    c.save();
    // Призраки многочисленны: размытие каждой грани доспехов на Canvas перегружало GPU.
    // Один кэшированный ореол сохраняет свечение без shadowBlur на десятках контуров.
    const glow=this.getGlow('blue');
    c.globalAlpha=.22;
    c.drawImage(glow,x-37,y-57,74,90);
    c.globalAlpha=.67;
    this.drawFrozenTroop(e,x,y,hit,'soldier');
    // Призрачные парадные доспехи: высокий воротник и холодная геральдика.
    const a=Math.atan2(e.hy||0,e.hx||1);
    c.translate(x,y+Math.sin(this.clock*3+e.gen)*2);c.rotate(a);
    c.strokeStyle='rgba(198,238,255,.8)';c.lineWidth=1.5;
    c.beginPath();c.moveTo(-7,-14);c.lineTo(-11,-8);c.lineTo(-6,-3);
    c.moveTo(-7,14);c.lineTo(-11,8);c.lineTo(-6,3);c.stroke();
    c.fillStyle='rgba(177,228,255,.7)';
    c.beginPath();c.moveTo(0,-6);c.lineTo(6,0);c.lineTo(0,6);c.lineTo(-5,0);c.fill();
    c.restore();
  }

  drawHallLights(ctx,arena){
    const boss=this.boss?.enemy;
    if(boss?.active && boss.def===this.cfg.enemies.tartas){
      ctx.save();ctx.globalCompositeOperation='screen';
      for(const p of this.castleHall.torches){
        const f=.85+.15*Math.sin(this.clock*13+p.x);
        const g=ctx.createRadialGradient(p.x,p.y-18,3,p.x,p.y-18,100);
        g.addColorStop(0,'rgba(255,188,95,'+(.36*f)+')');
        g.addColorStop(.45,'rgba(245,111,36,'+(.15*f)+')');
        g.addColorStop(1,'rgba(244,91,27,0)');
        ctx.fillStyle=g;ctx.fillRect(p.x-100,p.y-118,200,200);
        ctx.fillStyle='#ff9b35';ctx.beginPath();ctx.moveTo(p.x-7,p.y-8);
        ctx.bezierCurveTo(p.x-17,p.y-25,p.x+6,p.y-47,p.x+2,p.y-24);
        ctx.quadraticCurveTo(p.x+15,p.y-22,p.x+6,p.y-8);ctx.fill();
        ctx.fillStyle='#fff1b2';ctx.beginPath();ctx.ellipse(p.x,p.y-17,3,8,0,0,TAU);ctx.fill();
      }
      ctx.restore();
    }
    const open=this.sanctumGate?.open||0;
    if(open>.01){
      const y=arena.walkTop, strength=Math.min(1,open*2);
      ctx.save();ctx.globalCompositeOperation='screen';
      const g=ctx.createRadialGradient(0,y-4,10,0,y+35,220);
      g.addColorStop(0,'rgba(208,223,255,'+(.5*strength)+')');
      g.addColorStop(.5,'rgba(167,191,242,'+(.19*strength)+')');
      g.addColorStop(1,'rgba(134,170,237,0)');
      ctx.fillStyle=g;ctx.fillRect(-230,y-170,460,440);
      ctx.restore();
    }
  }

  drawHallPortcullis(ctx,arena,open){
    const y=arena.walkTop;
    ctx.save();
    ctx.fillStyle='#141d2b';ctx.fillRect(-123,y-43,246,44);
    ctx.fillStyle='#697789';ctx.fillRect(-120,y-44,240,8);
    const rise=open*170;
    ctx.strokeStyle='#8d96a6';ctx.lineWidth=7;
    for(let x=-104;x<=104;x+=26){
      ctx.beginPath();ctx.moveTo(x,y-rise-140);ctx.lineTo(x,y-rise+26);ctx.stroke();
    }
    ctx.lineWidth=6;
    for(let yy=-116;yy<=18;yy+=34){
      ctx.beginPath();ctx.moveTo(-116,y-rise+yy);ctx.lineTo(116,y-rise+yy);ctx.stroke();
    }
    ctx.restore();
  }

  drawSanctum(ctx,arena){
    if(!this.sanctumFloor){
      const cv=typeof OffscreenCanvas==='function'?new OffscreenCanvas(arena.width,arena.height):document.createElement('canvas');
      cv.width=arena.width;cv.height=arena.height;
      const c=cv.getContext('2d');c.translate(-arena.left,-arena.top);
      this.paintSanctum(c,arena);this.sanctumFloor=cv;
    }
    ctx.drawImage(this.sanctumFloor,arena.left,arena.top);
  }

  // Пять персонажей, впаянных в витраж: воин, королева, маг, хранитель и жрица.
  // Все элементы рисуются один раз в кэш пола, без нагрузки на каждый кадр.
  drawStainedGlassFigure(c,kind){
    c.save();
    const dark='#1b2940',lead='#172338',metal='#d8c69e';
    const path=(pts,color,edge=lead,w=2)=>{
      c.beginPath();c.moveTo(pts[0],pts[1]);
      for(let j=2;j<pts.length;j+=2)c.lineTo(pts[j],pts[j+1]);
      c.closePath();c.fillStyle=color;c.fill();
      if(edge){c.strokeStyle=edge;c.lineWidth=w;c.stroke();}
    };
    // Лучистый ореол и мозаика за фигурой.
    c.fillStyle='rgba(243,220,166,.19)';
    c.beginPath();c.ellipse(0,-26,29,28,0,0,TAU);c.fill();
    c.strokeStyle='rgba(236,214,171,.65)';c.lineWidth=2;
    c.beginPath();c.arc(0,-26,24,0,TAU);c.stroke();
    for(let j=0;j<12;j++){
      const a=j*Math.PI/6;
      c.beginPath();c.moveTo(Math.cos(a)*27,Math.sin(a)*27-26);
      c.lineTo(Math.cos(a)*32,Math.sin(a)*32-26);c.stroke();
    }
    // Плащ, руки и сегментированные одежды.
    const cloaks=['#42678b','#774b8b','#384c85','#376c6d','#864b70'];
    path([-14,-12,-24,8,-33,53,33,53,24,8,14,-12],cloaks[kind]);
    path([-13,-9,-20,15,-12,43,0,49,12,43,20,15,13,-9],
      ['#789ab5','#ae8cbb','#7183b5','#83a9a3','#b68a9e'][kind]);
    path([-3,-9,3,-9,6,46,0,52,-6,46], 'rgba(232,217,185,.5)',null);
    for(const side of [-1,1]){
      path([side*12,-9,side*20,-5,side*25,17,side*17,21,side*10,5],
        kind===0?'#93a9b9':'#b4a5b3');
      c.strokeStyle=metal;c.lineWidth=1.2;
      c.beginPath();c.moveTo(side*15,2);c.lineTo(side*21,16);c.stroke();
    }
    // Лицо, волосы/капюшон, отдельные черты.
    c.fillStyle='#d9b7a0';c.beginPath();c.ellipse(0,-24,10,14,0,0,Math.PI*2);c.fill();
    path([-12,-27,-10,-39,0,-43,10,-39,12,-27,7,-34,0,-35,-7,-34],
      kind===2?'#23324f':'#594963');
    c.fillStyle='#26324b';
    c.fillRect(-6,-25,3,1.5);c.fillRect(3,-25,3,1.5);
    c.strokeStyle='#8c6572';c.lineWidth=1;
    c.beginPath();c.moveTo(-3,-17);c.quadraticCurveTo(0,-15,3,-17);c.stroke();
    if(kind===0){
      // Рыцарь с клинком и крылатым шлемом.
      path([-12,-32,-10,-43,0,-48,10,-43,12,-32,0,-36],'#a4c1cc');
      path([-11,-40,-21,-49,-12,-45,0,-42,12,-45,21,-49,11,-40],
        '#d7e4d7');
      c.strokeStyle='#f1e4bd';c.lineWidth=3;
      c.beginPath();c.moveTo(27,-17);c.lineTo(27,45);c.moveTo(18,2);c.lineTo(36,2);c.stroke();
      path([-6,2,0,-2,6,2,6,11,0,15,-6,11],'#c2c6d7');
    }else if(kind===1){
      // Королева: корона с самоцветами и державой.
      path([-13,-39,-18,-52,-7,-46,0,-57,8,-46,18,-52,13,-39], '#e7c37c');
      for(const xx of [-9,0,9]){c.fillStyle='#9de5ee';c.beginPath();c.arc(xx,-44,2.5,0,Math.PI*2);c.fill();}
      c.strokeStyle='#e9d6a4';c.lineWidth=3;
      c.beginPath();c.moveTo(26,-9);c.lineTo(26,28);c.stroke();
      c.fillStyle='#e2c17c';c.beginPath();c.arc(26,-12,8,0,Math.PI*2);c.fill();
      c.fillStyle='#a9dcf3';c.beginPath();c.arc(26,-12,4,0,Math.PI*2);c.fill();
    }else if(kind===2){
      // Архимаг: высокий капюшон, посох и руническая печать.
      path([-17,-32,-12,-50,0,-58,12,-50,17,-32,9,-38,0,-43,-9,-38], '#344669');
      c.strokeStyle='#d1a5ed';c.lineWidth=3;
      c.beginPath();c.moveTo(27,-24);c.lineTo(27,53);c.stroke();
      c.fillStyle='#b5e3fa';c.beginPath();c.arc(27,-28,9,0,Math.PI*2);c.fill();
      c.strokeStyle='#e9e0f7';c.lineWidth=1.6;
      c.beginPath();c.arc(0,19,8,0,Math.PI*2);c.moveTo(-7,23);c.lineTo(7,15);c.stroke();
    }else if(kind===3){
      // Хранитель: олений венец и большой гербовый щит.
      c.strokeStyle='#d3c49b';c.lineWidth=3;
      c.beginPath();c.moveTo(-7,-37);c.lineTo(-18,-55);c.lineTo(-23,-50);
      c.moveTo(-18,-55);c.lineTo(-13,-58);
      c.moveTo(7,-37);c.lineTo(18,-55);c.lineTo(23,-50);
      c.moveTo(18,-55);c.lineTo(13,-58);c.stroke();
      path([-31,3,-15,-2,-8,5,-9,29,-20,43,-31,28], '#6f9d9b');
      c.strokeStyle='#e2d2ac';c.lineWidth=2;
      c.beginPath();c.moveTo(-20,5);c.lineTo(-20,33);c.moveTo(-29,18);c.lineTo(-11,18);c.stroke();
    }else{
      // Жрица: лучистая диадема и чаша с сиянием.
      path([-14,-38,-8,-48,0,-45,8,-48,14,-38,0,-40], '#dfc7a5');
      c.strokeStyle='#fff0c9';c.lineWidth=2;
      c.beginPath();c.moveTo(-22,6);c.quadraticCurveTo(0,23,22,6);
      c.moveTo(-22,6);c.lineTo(22,6);c.moveTo(0,17);c.lineTo(0,32);c.stroke();
      c.fillStyle='#b8e5ec';c.beginPath();c.arc(0,0,8,0,Math.PI*2);c.fill();
      c.strokeStyle='#e9d4af';c.beginPath();c.arc(0,0,15,Math.PI*1.1,Math.PI*1.9);c.stroke();
    }
    // Сеть тонких свинцовых швов, формирующая драгоценные фрагменты одежды.
    c.strokeStyle='rgba(24,34,54,.65)';c.lineWidth=1.5;
    for(let j=-1;j<=1;j++){
      c.beginPath();c.moveTo(j*9,17);c.lineTo(j*14,49);c.stroke();
    }
    c.restore();
  }

  paintSanctum(ctx,arena){
    const {left:L,right:R,top:T,bottom:B}=arena,c=ctx;
    c.save();
    const stone=c.createLinearGradient(L,T,R,B);
    stone.addColorStop(0,'#292b3e');stone.addColorStop(.48,'#343446');stone.addColorStop(1,'#1b2232');
    c.fillStyle=stone;c.fillRect(L,T,arena.width,arena.height);
    // Старинная мраморная кладка, швы смещены, поверхность неоднородна.
    for(let row=0,y=T;y<B;row++,y+=88)for(let col=0,x=L-44*(row%2);x<R;col++,x+=88){
      const v=Math.sin(row*17.3+col*9.7);
      c.fillStyle=v>0?'rgba(155,157,177,.055)':'rgba(9,13,26,.085)';
      c.fillRect(x+2,y+2,84,84);
      c.strokeStyle='rgba(142,149,177,.14)';c.lineWidth=1;
      c.strokeRect(x+1,y+1,86,86);
      c.strokeStyle='rgba(180,183,205,.085)';c.beginPath();
      c.moveTo(x+8,y+19);c.bezierCurveTo(x+28,y+8,x+38,y+56,x+79,y+70);c.stroke();
    }
    // Каменные инкрустации: потертые кольца и орнаменты на центральной оси.
    c.strokeStyle='rgba(183,161,138,.18)';c.lineWidth=4;
    for(let y=T+360;y<B;y+=540){
      c.beginPath();c.ellipse(0,y,138,91,0,0,TAU);c.stroke();
      c.beginPath();c.ellipse(0,y,112,73,0,0,TAU);c.stroke();
      for(let j=0;j<12;j++){const a=j*TAU/12;
        c.beginPath();c.moveTo(Math.cos(a)*113,y+Math.sin(a)*74);
        c.lineTo(Math.cos(a)*130,y+Math.sin(a)*85);c.stroke();}
    }
    // Стена с глубоко посаженными стрельчатыми витражами и каменной резьбой.
    const wall=c.createLinearGradient(0,T,0,T+155);
    wall.addColorStop(0,'#151a2a');wall.addColorStop(1,'#44445a');
    c.fillStyle=wall;c.fillRect(L,T,arena.width,150);
    c.fillStyle='#777184';c.fillRect(L,T+142,arena.width,6);
    const cols=['#e0a56d','#80bbdc','#a99bd8','#7fbfb3','#ce90b7'];
    for(let i=0;i<5;i++){
      const x=(i-2)*205,cy=T+76,col=cols[i];
      c.save();c.translate(x,cy);
      c.fillStyle='#101727';c.beginPath();c.moveTo(-63,57);c.lineTo(-63,-15);
      c.quadraticCurveTo(-55,-44,0,-63);c.quadraticCurveTo(55,-44,63,-15);
      c.lineTo(63,57);c.closePath();c.fill();
      c.clip();
      const glass=c.createLinearGradient(-50,-50,50,55);
      glass.addColorStop(0,'#293c59');glass.addColorStop(.5,col);glass.addColorStop(1,'#263d55');
      c.globalAlpha=.85;c.fillStyle=glass;c.fillRect(-58,-58,116,116);
      this.drawStainedGlassFigure(c,i);
      c.strokeStyle='rgba(17,23,41,.9)';c.lineWidth=5;
      c.beginPath();c.moveTo(0,-62);c.lineTo(0,58);
      c.moveTo(-62,10);c.quadraticCurveTo(0,-14,62,10);
      c.moveTo(-62,37);c.quadraticCurveTo(0,18,62,37);c.stroke();
      c.strokeStyle='rgba(244,223,201,.6)';c.lineWidth=2;
      c.beginPath();c.arc(0,-15,17,0,TAU);c.stroke();
      c.restore();
      // Рассеянный цвет на полу: несколько пересекающихся мягких пятен без границ.
      for(let j=0;j<4;j++){
        const yy=T+235+j*118,xx=x+(j-1.5)*26;
        const rad=145+j*42;
        const g=c.createRadialGradient(xx,yy,0,xx,yy,rad);
        g.addColorStop(0,col+'35');g.addColorStop(.52,col+'16');g.addColorStop(1,col+'00');
        c.fillStyle=g;c.fillRect(xx-rad,yy-rad,rad*2,rad*2);
      }
      // Резные пилястры между окнами.
      c.fillStyle='#49485b';c.fillRect(x+89,T+9,14,137);
      c.fillStyle='#827c8d';c.fillRect(x+90,T+15,3,122);
    }
    // Боковые усыпальницы, арки, потемневшие статуи и следы вековой пыли.
    for(const side of [-1,1])for(let i=0;i<5;i++){
      const x=side*(arena.width*.5-77),y=T+265+i*292;
      c.save();c.translate(x,y);
      c.fillStyle='rgba(10,13,28,.32)';c.beginPath();c.ellipse(0,0,70,96,0,0,TAU);c.fill();
      c.fillStyle='#22283b';c.beginPath();c.moveTo(-43,55);c.lineTo(-43,-32);
      c.quadraticCurveTo(0,-93,43,-32);c.lineTo(43,55);c.closePath();c.fill();
      c.strokeStyle='#747388';c.lineWidth=5;c.stroke();
      c.fillStyle='#55596e';c.beginPath();c.ellipse(0,-28,13,17,0,0,TAU);c.fill();
      c.beginPath();c.moveTo(-19,-10);c.quadraticCurveTo(0,-24,19,-10);
      c.lineTo(25,40);c.lineTo(-25,40);c.closePath();c.fill();
      c.strokeStyle='rgba(175,177,193,.3)';c.lineWidth=2;
      c.beginPath();c.moveTo(-12,-7);c.lineTo(-17,34);
      c.moveTo(12,-7);c.lineTo(17,34);c.stroke();
      c.fillStyle='#80798a';c.beginPath();c.ellipse(0,53,47,13,0,0,TAU);c.fill();
      c.restore();
    }
    // Небольшой трон с высокой стрельчатой спинкой, резьбой и ступенями.
    const ty=T+195;
    c.fillStyle='rgba(4,7,18,.4)';c.beginPath();c.ellipse(0,ty+35,93,33,0,0,TAU);c.fill();
    for(let i=2;i>=0;i--){c.fillStyle=['#3b3549','#585066','#787086'][i];
      c.beginPath();c.ellipse(0,ty+20+i*9,78+i*9,17+i*3,0,0,TAU);c.fill();}
    c.fillStyle='#2c2a40';c.beginPath();c.moveTo(-35,ty+15);c.lineTo(-35,ty-61);
    c.quadraticCurveTo(-29,ty-88,0,ty-105);c.quadraticCurveTo(29,ty-88,35,ty-61);
    c.lineTo(35,ty+15);c.closePath();c.fill();
    c.strokeStyle='#a79785';c.lineWidth=4;c.stroke();
    c.fillStyle='#655475';c.beginPath();c.moveTo(-25,ty+9);c.lineTo(-25,ty-58);
    c.quadraticCurveTo(0,ty-83,25,ty-58);c.lineTo(25,ty+9);c.fill();
    c.strokeStyle='rgba(228,198,151,.7)';c.lineWidth=1.5;
    for(let j=-1;j<=1;j++){c.beginPath();c.moveTo(j*9,ty-55);c.lineTo(j*9,ty-4);c.stroke();}
    c.fillStyle='#a18a77';c.fillRect(-43,ty-4,16,35);c.fillRect(27,ty-4,16,35);
    c.fillStyle='#372e46';c.fillRect(-29,ty+9,58,18);
    c.fillStyle='#e5c991';c.beginPath();c.moveTo(0,ty-94);c.lineTo(7,ty-82);
    c.lineTo(0,ty-73);c.lineTo(-7,ty-82);c.closePath();c.fill();
    c.restore();
  }

  drawHeroSigils(ctx,x,y){
    const t=this.clock;
    if(!this.heroSigils)this.heroSigils=[];
    if(this.heroSigilGen!==this.arena.location){
      this.heroSigils.length=0;this.heroSigilGen=this.arena.location;
    }
    const prev=this.heroSigilLast;
    if(prev&&Math.hypot(x-prev.x,y-prev.y)>7 && t-(this.heroSigilAt||0)>.11){
      this.heroSigils.push({x:prev.x,y:prev.y,t,seed:this.heroSigils.length%7});
      if(this.heroSigils.length>26)this.heroSigils.shift();
      this.heroSigilAt=t;
    }
    this.heroSigilLast={x,y};
    const c=ctx;c.save();c.globalCompositeOperation='screen';
    for(const p of this.heroSigils){
      const age=t-p.t;if(age>2)continue;
      const a=(1-age/2)*.65,r=11+age*5;
      c.save();c.translate(p.x,p.y-10-age*8);
      c.rotate(age*.4+p.seed*.6);c.strokeStyle='rgba(161,211,255,'+a+')';
      c.lineWidth=1.3;c.beginPath();c.arc(0,0,r,p.seed*.3,p.seed*.3+Math.PI*1.45);c.stroke();
      for(let j=0;j<4;j++){
        const ang=j*TAU/4+p.seed*.25;
        c.beginPath();c.moveTo(Math.cos(ang)*(r-5),Math.sin(ang)*(r-5));
        c.lineTo(Math.cos(ang)*r,Math.sin(ang)*r);
        c.lineTo(Math.cos(ang+.19)*(r+4),Math.sin(ang+.19)*(r+4));c.stroke();
      }
      c.restore();
    }
    c.restore();
  }

  drawSanctumMotes(ctx,arena,l,r,t,b){
    ctx.save();ctx.globalCompositeOperation='screen';
    const time=this.clock;
    const colors=['#d2a4ff','#8bd9ff','#ffe4a4','#9af3d3'];
    for(let i=0;i<115;i++){
      const x=arena.left+((i*137.23+Math.sin(time*.47+i)*24)%(arena.width));
      const y=arena.top+((i*191.17-time*(7+i%9))%arena.height+arena.height)%arena.height;
      if(x<l||x>r||y<t||y>b)continue;
      ctx.globalAlpha=.24+.3*(.5+.5*Math.sin(time*1.4+i*2.2));
      ctx.fillStyle=colors[i%4];ctx.beginPath();ctx.arc(x,y,.6+i%3*.4,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  }

  drawBlizzard(ctx,w,h,dpr,camX,camY,scale){
    const cfg=this.cfg.render.blizzard;
    if(!cfg?.enabled)return;
    const wave=Math.max(1,Math.min(5,this.hud?.wave||1));
    const target=(wave-1)/4;
    if(this.blizzardWaveBlend===undefined)this.blizzardWaveBlend=target;
    this.blizzardWaveBlend+=(target-this.blizzardWaveBlend)*.012;
    const k=this.blizzardWaveBlend;
    ctx.save();ctx.setTransform(dpr,0,0,dpr,0,0);
    const fog=ctx.createRadialGradient(w*.5,h*.5,Math.min(w,h)*.38,w*.5,h*.5,Math.hypot(w,h)*.63);
    fog.addColorStop(0,'rgba(132,143,153,'+(0)+')');
    fog.addColorStop(.52,'rgba(139,148,159,'+(.015+k*.008)+')');
    fog.addColorStop(1,'rgba(120,128,139,'+(.20+k*.035)+')');
    ctx.fillStyle=fog;ctx.fillRect(0,0,w,h);

    // Позиции частиц в мире. При перемещении камеры снежинки
    // сдвигаются относительно героя и пейзажа, а не приклеиваются к экрану.
    const spacing=Math.max(17,(cfg.spacing||28)*.8);
    const left=camX-w/(2*scale),top=camY-h/(2*scale);
    const right=camX+w/(2*scale),bottom=camY+h/(2*scale);
    const drift=this.clock*(cfg.wind||65)*(1+k*.65);
    const fall=this.clock*(cfg.fall||26)*(1+k*.35);
    const count=Math.min(.94,(cfg.density||.24)+.35);
    const minX=Math.floor((left-drift)/spacing)-1,maxX=Math.ceil((right-drift)/spacing)+1;
    const minY=Math.floor((top-fall)/spacing)-1,maxY=Math.ceil((bottom-fall)/spacing)+1;
    ctx.strokeStyle='#f1f7ff';ctx.lineCap='round';
    for(let iy=minY;iy<=maxY;iy++)for(let ix=minX;ix<=maxX;ix++){
      const seed=Math.sin(ix*127.1+iy*311.7)*43758.5453;
      const rnd=seed-Math.floor(seed);
      if(rnd>Math.min(.99,count+k*.15))continue;
      const r2=Math.sin(ix*269.5+iy*183.3)*24634.6345;
      const jitter=r2-Math.floor(r2);
      const x=(ix*spacing+jitter*spacing+drift-camX)*scale+w*.5;
      const y=(iy*spacing+rnd*spacing+fall-camY)*scale+h*.5;
      const fine=.35+jitter*.55;
      ctx.globalAlpha=(.23+jitter*.31)*(1+k*.15);
      ctx.lineWidth=fine;
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-1.8-jitter*2,y-.35-jitter*.45);ctx.stroke();
    }
    ctx.restore();
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
      if (!d.blocking && !d.gravityActive && d.blockCd > 0) arc(r, Math.PI - half, Math.PI + half, 1 - d.blockCd / d.blockCdMax, '#8cc8ff', 3);
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
    const guardCount = boss && this.apotheosis?.boss === boss ? this.apostles?.alive() || 0 : 0;
    const apostleGuard = guardCount > 0;
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
      ctx.fillStyle = apostleGuard ? 'rgba(161,224,255,0.56)' : 'rgba(255,190,180,0.55)';
      ctx.fillRect(x, y, bw * U.bossTrail, 7);
      ctx.fillStyle = apostleGuard ? '#409fda' : '#d63f3a';
      ctx.fillRect(x, y, bw * U.boss, 7);
      ctx.fillStyle = apostleGuard ? 'rgba(225,249,255,0.76)' : 'rgba(255,140,125,0.55)';
      ctx.fillRect(x, y, bw * U.boss, 2.5);
      ctx.strokeStyle = 'rgba(190,215,250,0.4)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 0.5, y - 0.5, bw + 1, 8);
      this.rhomb(x - 8, y + 3.5, 3.5, null);
      this.rhomb(x + bw + 8, y + 3.5, 3.5, null);
      this.rhomb(cx, y + 13, 3.5, null);
      if (apostleGuard) {
        ctx.font = '500 10px ' + SERIF;
        ctx.fillStyle = 'rgba(166,222,255,.91)';
        this.tracked('ЩИТ АПОСТОЛОВ · ' + guardCount, cx, y + 27, 1.1, 'center');
      }
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

    // Слоты умений: первый Магический дождь (если ядро стоит в билде), остальные пустые.
    this.drawRain(hud);
    const f0 = hud.skillFrac0 === undefined ? 1 : hud.skillFrac0;
    if (hud.rainOn) {
      const mask = hud.rainEquippedMask || 0;
      const P = this.cfg.skills.rain;
      this.drawAbility(cx - 64, rowY, f0, P.iconColors[mask], P.iconLights[mask], 3,
        U.slots[0] > 0.01, f0 >= 0.999 ? (mask & 4 ? 'gold' : 'blue') : undefined, U.slots[0]);
    }
    else this.drawAbility(cx - 64, rowY, 0, '#6fb6ff', '#d6efff', 0, false, undefined, 0, true);
    if (hud.incarnationOn) {
      const S = this.cfg.skills.incarnation;
      const f1 = hud.skillFrac1 === undefined ? 1 : hud.skillFrac1;
      const form = S.forms?.[hud.incarnationEquippedMask || 0];
      const slotColor = form?.slot || S.slotColor;
      const slotLight = form?.light || S.slotLight;
      this.drawAbility(cx, rowY, f1, slotColor, slotLight, 4,
        (hud.incarnationT || 0) > 0, f1 >= 0.999 ? ((hud.incarnationEquippedMask || 0) & 4 ? 'gold' : 'blue') : undefined, U.slots[1]);
    } else this.drawAbility(cx, rowY, 0, '#6fb6ff', '#d6efff', 0, false, undefined, 0, true);
    if(hud.inspirationOn){
      const S=this.cfg.skills.inspiration;
      const f2=hud.skillFrac2===undefined?1:hud.skillFrac2;
      this.drawAbility(cx+64,rowY,f2,S.shellColor,S.coreColor,5,
        !!this.inspiration?.active,'gold',U.slots[2]);
    }else this.drawAbility(cx+64,rowY,0,'#6fb6ff','#d6efff',0,false,undefined,0,true);

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

  /** Стихийный дождь: 7 сочетаний с собственными цветами и формой осадков. */
  drawRain(hud) {
    const remaining = hud.rainT || 0;
    if (remaining <= 0) return;
    const P = this.cfg.skills.rain;
    const mask = hud.rainMask || 0;
    const fire = !!(mask & 1), ice = !!(mask & 2), lightning = !!(mask & 4);
    const steam = fire && ice;
    const a = Math.max(0, Math.min(1, remaining / 0.4, (P.duration - remaining) / 0.25 + 0.0001, 1));
    const ctx = this.ctx, w = this.w, h = this.h;
    ctx.save();
    ctx.globalAlpha = (mask ? 0.17 : 0.12) * a;
    ctx.fillStyle = P.skyColors[mask];
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = P.streakColors[mask];
    ctx.globalAlpha = 0.56 * a;
    ctx.lineWidth = ice ? 1.7 : lightning ? 1.5 : 1.2;
    ctx.lineCap = ice ? 'square' : 'round';
    ctx.beginPath();
    const n = 90;
    for (let i = 0; i < n; i++) {
      const sx = (((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1) * (w + 60) - 30;
      const sp = 700 + ((i * 37) % 300);
      const y = (((this.clock * sp + i * 131) % (h + 60)) + h + 60) % (h + 60) - 30;
      if (hud.rainBlades) {
        // Мечи рисуются отдельным проходом после обычной геометрии осадков.
      } else if (!mask) { // обычный дождь сохраняет прежнюю форму
        ctx.moveTo(sx, y); ctx.lineTo(sx - 5, y + 18);
      } else if (lightning && (i % 3 === 0)) { // ломаные электрические жилы
        ctx.moveTo(sx, y); ctx.lineTo(sx + 5, y + 7);
        ctx.lineTo(sx - 3, y + 11); ctx.lineTo(sx + 2, y + 22);
      } else if (ice && (i % 2 === 0)) { // колючие ледяные кристаллы
        ctx.moveTo(sx, y); ctx.lineTo(sx - 5, y + 10);
        ctx.lineTo(sx + 2, y + 14); ctx.lineTo(sx - 6, y + 22);
        ctx.moveTo(sx - 5, y + 10); ctx.lineTo(sx - 10, y + 7);
      } else if (fire) { // вытянутые раскалённые капли
        ctx.moveTo(sx + 3, y - 3); ctx.lineTo(sx - 4, y + 17);
        ctx.lineTo(sx - 7, y + 20);
      } else {
        ctx.moveTo(sx, y); ctx.lineTo(sx - 5, y + 18);
      }
    }
    ctx.stroke();
    if (hud.rainBlades) {
      // Не создаём сотни объектов: готовый меч-спрайт кешируется в SpellFx.
      for (let i=0;i<46;i++) {
        const sx=(((Math.sin(i*12.9898)*43758.5453)%1+1)%1)*(w+80)-40;
        const velocity=480+(i%9)*29;
        const sy=((this.clock*velocity+i*137)%(h+120)+(h+120))%(h+120)-60;
        this.spellFx.rainSword(ctx,sx,sy,.44+(i%4)*.11,this.clock,a*.8);
      }
    }
    if (fire) {
      ctx.fillStyle = P.streakColors[1];
      ctx.globalAlpha = 0.55 * a;
      for (let i = 0; i < 25; i++) {
        const x = (((Math.sin(i * 17.173 + 4) * 43758.5) % 1 + 1) % 1) * w;
        const y = ((this.clock * (95 + i * 3) + i * 83) % (h + 30) + h + 30) % (h + 30);
        ctx.fillRect(x, y, 2.5, 3.5);
      }
    }
    if (steam) {
      // Слой тумана поверх огненно-ледяных осадков: заметный вид реакции Пара.
      ctx.strokeStyle = P.streakColors[3]; ctx.lineWidth = 12;
      ctx.globalAlpha = 0.13 * a;
      ctx.beginPath();
      for (let i = 0; i < 7; i++) {
        const y = ((i * 109 + this.clock * 32) % (h + 80)) - 40;
        const x = ((i * 149 + this.clock * 18) % (w + 140)) - 70;
        ctx.moveTo(x, y); ctx.bezierCurveTo(x + 20, y - 35, x + 74, y + 32, x + 115, y - 12);
      }
      ctx.stroke();
    }
    if (lightning) {
      ctx.strokeStyle = P.streakColors[4];
      ctx.lineWidth = 2.2;
      ctx.globalAlpha = 0.42 * a * (0.6 + 0.4 * Math.sin(this.clock * 26));
      ctx.beginPath();
      for (let i = 0; i < 9; i++) {
        const x = (((i * 173 + Math.floor(this.clock * 10) * 31) % (w + 60)) + w + 60) % (w + 60) - 30;
        const y = ((i * 89 + Math.floor(this.clock * 12) * 47) % (h + 50)) - 20;
        ctx.moveTo(x, y); ctx.lineTo(x + 7, y + 10);
        ctx.lineTo(x - 3, y + 16); ctx.lineTo(x + 9, y + 28);
      }
      ctx.stroke();
    }
    if (hud.rainGravity) {
      // Волны воздуха проваливаются вниз, словно осадки прижаты невидимой тяжестью.
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = '#b39be9';
      ctx.lineCap = 'round';
      for (let i = 0; i < 9; i++) {
        const u = (this.clock * 0.36 + i / 9) % 1;
        const yy = u * (h + 130) - 65;
        const wave = Math.sin(Math.PI * u);
        ctx.globalAlpha = a * wave * 0.3;
        ctx.lineWidth = 5 + wave * 14;
        ctx.beginPath();
        ctx.moveTo(-30, yy - 18);
        ctx.bezierCurveTo(w * 0.25, yy - 44, w * 0.28, yy + 36, w * 0.52, yy);
        ctx.bezierCurveTo(w * 0.76, yy - 28, w * 0.81, yy + 36, w + 30, yy - 16);
        ctx.stroke();
        ctx.globalAlpha = a * wave * 0.48;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = '#c6b5ff';
      for (let i = 0; i < 28; i++) {
        const x = ((i * 143 + 21) % (w + 40)) - 20;
        const y = ((this.clock * (175 + i % 5 * 37) + i * 97) % (h + 80)) - 40;
        ctx.globalAlpha = 0.25 * a;
        ctx.fillRect(x + Math.sin(y * 0.024 + i) * 8, y, 1.5, 7);
      }
    }
    ctx.restore();
  }

  /**
   * Ромб умения. frac: готовность 0..1 (заливка поднимается снизу), hot: умение сейчас действует, flash: вспышка нажатия.
   * kind: 0 блок, 1 рывок, 2 кристалл, 3 дождь, 4 Воплощение (комета). glow: false или имя свечения.
   */
  drawAbility(cx, cy, frac, col, light, kind, hot, glow, flash, empty) {
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
    if (empty) return; // пустая ячейка: только ромб
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
    } else if (kind === 5) { // золотая сфера Воодушевления с втягиваемыми кристаллами
      ctx.beginPath();ctx.arc(cx,cy,9,0,TAU);ctx.stroke();
      ctx.beginPath();ctx.arc(cx,cy,5,0,TAU);ctx.stroke();
      for(let i=0;i<5;i++){
        const a=i*TAU/5+this.clock*.38;
        const x=cx+Math.cos(a)*15,y=cy+Math.sin(a)*15;
        ctx.moveTo(x,y-2.5);ctx.lineTo(x+2.5,y);
        ctx.lineTo(x,y+2.5);ctx.lineTo(x-2.5,y);ctx.closePath();
      }
      ctx.fill();
      ctx.beginPath();ctx.arc(cx,cy,2.7,0,TAU);ctx.fill();
    } else if (kind === 4) { // комета: энергетическое ядро и три струи
      ctx.beginPath(); ctx.arc(cx + 4, cy - 3, 6.2, 0, TAU); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy - 7); ctx.lineTo(cx - 11, cy - 12);
      ctx.moveTo(cx - 3, cy - 1); ctx.lineTo(cx - 14, cy - 3);
      ctx.moveTo(cx, cy + 5); ctx.lineTo(cx - 11, cy + 11);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + 6, cy - 5, 2.4, 0, TAU); ctx.fill();
    } else if (kind === 3) { // дождь: облако и капли
      ctx.beginPath();
      ctx.arc(cx - 5, cy - 3, 5, Math.PI * 0.9, Math.PI * 1.9);
      ctx.arc(cx + 3, cy - 6, 6, Math.PI * 1.1, Math.PI * 2.05);
      ctx.arc(cx + 9, cy - 1, 4, Math.PI * 1.5, Math.PI * 0.5);
      ctx.lineTo(cx - 8, cy + 3);
      ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        ctx.moveTo(cx - 6 + i * 6, cy + 7);
        ctx.lineTo(cx - 8 + i * 6, cy + 12);
      }
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
    const shieldVisible = blocking || d.gravityActive;
    S.k += ((shieldVisible ? 1 : 0) - S.k) * (1 - Math.exp(-dt / (shieldVisible ? 0.05 : 0.09)));
    S.pk += ((parrying ? 1 : 0) - S.pk) * (1 - Math.exp(-dt / (parrying ? 0.03 : 0.14)));
    S.flash = Math.max(0, S.flash - dt / 0.32);
    for (let i = 0; i < S.rip.length; i++) {
      const q = S.rip[i];
      if (q.on) {
        q.t += dt;
        if (q.t >= 0.45) q.on = false;
      }
    }
    if (S.k < 0.02) { S.wasGravity = false; return; }
    if (d.gravityActive || (blocking && d.gravityOn)) S.wasGravity = true;
    if (S.wasGravity) { this.drawGravityShield(hx, hy, S.k, S.pk, C); return; }
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

  /** Портал Гравитационного рывка: вихрь в точке назначения появляется до телепортации. */
  drawGravityDash(ctx) {
    const g = this.gravityDash;
    if (!g || !g.active) return;
    const K = this.cfg.kinetic, t = this.clock;
    const phase = g.charging ? Math.min(1, g.t / Math.max(0.05, g.charge)) : 1;
    const fade = g.charging ? 1 : Math.max(0, 1 - g.t / g.life);
    const r = (g.charging ? 12 + (K.gravityPushRadius * 0.55 - 12) * phase : K.gravityPushRadius * (0.45 + g.t / g.life * 0.55));
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.globalAlpha = fade * (0.45 + 0.35 * phase);
    ctx.fillStyle = K.gravityVoidColor;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.82, 0, TAU); ctx.fill();
    ctx.globalAlpha = fade;
    ctx.strokeStyle = K.gravityEdgeColor;
    ctx.lineWidth = 2.5 + (1 - phase) * 2;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
    ctx.strokeStyle = K.gravityCoreColor;
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.54, 0, TAU); ctx.stroke();
    // Три перекрученные ленты создают «искривлённое пространство».
    for (let i = 0; i < 3; i++) {
      ctx.save();
      ctx.rotate(t * (i % 2 ? -2.7 : 2.3) + i * TAU / 3);
      ctx.strokeStyle = i === 0 ? K.gravityCoreColor : K.gravityEdgeColor;
      ctx.lineWidth = 1.5 + phase;
      ctx.globalAlpha = fade * (0.5 + 0.35 * phase);
      ctx.beginPath(); ctx.ellipse(0, 0, r * (0.73 + 0.07 * i), r * (0.24 + 0.03 * i), 0, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    if (g.charging) {
      // Тонкая искривлённая связь с местом старта, чтобы цель телепорта читалась заранее.
      ctx.globalAlpha = 0.22 + 0.35 * phase;
      ctx.strokeStyle = K.gravityEdgeColor;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 8]);
      ctx.beginPath(); ctx.moveTo(g.ox - g.x, g.oy - g.y); ctx.lineTo(0, 0); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  /** Стихийный горизонт: пламенная корона, ледяные кристаллы, разряды и паровой диск. */
  drawGravityShield(hx, hy, k, pk, C) {
    if (this.defense.gravityAuraMode) {
      this.drawGravityAura(hx, hy, k, pk, C);
      return;
    }
    const ctx = this.ctx, t = this.clock;
    const R = this.cfg.gravity.shieldRadius * (0.73 + 0.27 * k);
    const mask = this.defense.gravityElements?.mask || 0;
    const fire = !!(mask & 1), frost = !!(mask & 2), lightning = !!(mask & 4);
    const steam = fire && frost;
    const edge = steam ? C.gravitySteam : fire ? C.gravityFire : frost ? C.gravityFrost : lightning ? C.gravityLightning : C.gravityEdge;
    ctx.save(); ctx.translate(hx, hy); ctx.globalAlpha = k;
    ctx.fillStyle = C.gravityVoid;
    ctx.beginPath(); ctx.arc(0, 0, R * 0.93, 0, TAU); ctx.fill();
    ctx.strokeStyle = fire ? C.gravityFire : frost ? C.gravityFrost : lightning ? C.gravityLightning : C.gravityHalo;
    ctx.lineWidth = 13;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
    ctx.strokeStyle = pk > 0.25 ? C.gravityParry : edge;
    ctx.lineWidth = 2.5 + pk * 2;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
    for (let i = 0; i < 3; i++) {
      const a = t * (i % 2 ? -0.95 : 0.8) + i * 2.094;
      ctx.globalAlpha = k * (0.52 + 0.18 * Math.sin(t * 4 + i));
      ctx.lineWidth = i === 0 ? 4.5 : 2.5;
      ctx.strokeStyle = i === 1 && lightning ? C.gravityLightning : edge;
      ctx.beginPath(); ctx.arc(0, 0, R * (0.95 + i * 0.045), a, a + 1.15); ctx.stroke();
    }
    if (fire) {
      // Двенадцать пламенных выступов на кольце — форма отличается от обычного щита.
      ctx.globalAlpha = k * 0.85; ctx.strokeStyle = C.gravityFire; ctx.lineWidth = 2.3;
      ctx.beginPath();
      for (let i = 0; i < 12; i++) {
        const a = i * TAU / 12 + t * 0.32;
        const outer = R * (1.13 + 0.07 * Math.sin(t * 9 + i * 2.1));
        ctx.moveTo(Math.cos(a - 0.1) * R, Math.sin(a - 0.1) * R);
        ctx.quadraticCurveTo(Math.cos(a) * outer, Math.sin(a) * outer,
          Math.cos(a + 0.1) * R, Math.sin(a + 0.1) * R);
      }
      ctx.stroke();
    }
    if (frost) {
      ctx.globalAlpha = k * 0.85; ctx.strokeStyle = C.gravityFrost; ctx.lineWidth = 1.7;
      ctx.beginPath();
      for (let i = 0; i < 16; i++) {
        const a = i * TAU / 16 - t * 0.12;
        const x = Math.cos(a), y = Math.sin(a);
        const tx = -y, ty = x;
        const inner = R * 0.93, outer = R * 1.09;
        ctx.moveTo(x * inner, y * inner);
        ctx.lineTo(x * outer, y * outer);
        ctx.lineTo(x * R + tx * 4, y * R + ty * 4);
        ctx.moveTo(x * outer, y * outer);
        ctx.lineTo(x * R - tx * 4, y * R - ty * 4);
      }
      ctx.stroke();
    }
    if (lightning) {
      ctx.globalAlpha = k * (0.55 + 0.2 * Math.sin(t * 21));
      ctx.lineWidth = 2; ctx.strokeStyle = C.gravityLightning;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = i * TAU / 8 + Math.floor(t * 16) * 0.12;
        ctx.moveTo(Math.cos(a) * R * 0.91, Math.sin(a) * R * 0.91);
        ctx.lineTo(Math.cos(a + 0.08) * R * 1.03, Math.sin(a + 0.08) * R * 1.03);
        ctx.lineTo(Math.cos(a - 0.05) * R * 1.17, Math.sin(a - 0.05) * R * 1.17);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = k * (steam ? 0.85 : 0.72);
    ctx.save(); ctx.rotate(t * (steam ? -0.65 : 0.45) - 0.4);
    ctx.lineWidth = steam ? 5 : 3.2; ctx.strokeStyle = edge;
    ctx.beginPath(); ctx.ellipse(0, 0, R * 1.12, R * (steam ? 0.49 : 0.37), 0, 0, TAU); ctx.stroke();
    ctx.restore(); ctx.restore();
  }

  /** Гравитация + Аура: широкое полупрозрачное поле с пульсирующими разорванными венцами и дымными лепестками. */
  drawGravityAura(hx, hy, k, pk, C) {
    const ctx = this.ctx, t = this.clock;
    const R = (this.defense.gravityAuraRadius || this.cfg.aura.radius) * (0.84 + 0.16 * k);
    const mask = this.defense.gravityElements?.mask || 0;
    const tint = (mask & 3) === 3 ? C.gravitySteam
      : (mask & 1) ? C.gravityFire : (mask & 2) ? C.gravityFrost
      : (mask & 4) ? C.gravityLightning : C.gravityAuraEdge;
    ctx.save();
    ctx.translate(hx, hy);
    ctx.globalAlpha = k * 0.75;
    ctx.fillStyle = C.gravityAuraFill;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();
    // Тонкая двойная кромка, в отличие от яркого плотного горизонта обычной Гравитации.
    ctx.strokeStyle = C.gravityAuraWisp;
    ctx.lineWidth = 11;
    ctx.beginPath(); ctx.arc(0, 0, R * 0.97, 0, TAU); ctx.stroke();
    ctx.strokeStyle = pk > 0.25 ? C.gravityParry : tint;
    ctx.lineWidth = 1.8;
    ctx.globalAlpha = k * 0.84;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
    ctx.strokeStyle = C.gravityAuraInner;
    ctx.lineWidth = 1.1;
    ctx.globalAlpha = k * 0.5;
    ctx.beginPath(); ctx.arc(0, 0, R * 0.79, 0, TAU); ctx.stroke();
    // Разрывы и лепестки по окружности: форма «дышащей» ауры, не аккреционного диска.
    for (let i = 0; i < 12; i++) {
      const a = i * TAU / 12 + t * 0.2;
      const pulse = 1 + 0.045 * Math.sin(t * 2.3 + i * 1.9);
      const outer = R * (1.07 + 0.065 * Math.sin(t * 1.7 + i));
      ctx.globalAlpha = k * (0.32 + 0.16 * Math.sin(t * 2 + i));
      ctx.strokeStyle = (i & 1) ? tint : C.gravityAuraWisp;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a - 0.19) * R * pulse, Math.sin(a - 0.19) * R * pulse);
      ctx.quadraticCurveTo(Math.cos(a) * outer, Math.sin(a) * outer,
        Math.cos(a + 0.19) * R * pulse, Math.sin(a + 0.19) * R * pulse);
      ctx.stroke();
    }
    // Медленные дуги внутри напоминают гравитационные волны.
    ctx.globalAlpha = k * 0.28;
    ctx.strokeStyle = tint;
    ctx.lineWidth = 1.6;
    for (let j = 0; j < 3; j++) {
      const a = -t * 0.35 + j * TAU / 3;
      ctx.beginPath(); ctx.arc(0, 0, R * (0.52 + 0.12 * j), a, a + 1.5); ctx.stroke();
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

  /** Пока одиночный лазер строит маршрут, модель героя сжимается в световой сгусток. */
  drawLaserDashHero(ctx, hx, hy) {
    const b = this.dashBeams[this.dashBeams.length - 1];
    const a = b ? Math.atan2(b.y1 - b.y0, b.x1 - b.x0) : this.hero.facing;
    const glow = this.getGlow('blue');
    const u = b ? Math.min(1, b.age / Math.max(0.01, this.cfg.kinetic.beamTime)) : 0;
    ctx.save();
    ctx.translate(hx, hy); ctx.rotate(a);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.77;
    const sx = 16 + 34 * u, sy = 19 - 8 * u;
    ctx.drawImage(glow, -sx * 1.8, -sy * 2, sx * 3.6, sy * 4);
    ctx.fillStyle = '#bce8ff';
    ctx.globalAlpha = 0.55;
    ctx.beginPath(); ctx.ellipse(-11 * u, 0, 17 + 25 * u, 7 - 3 * u, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.92;
    ctx.beginPath(); ctx.ellipse(0, 0, 10 + 8 * u, 4.5 - 1.2 * u, 0, 0, TAU); ctx.fill();
    for (let i = 0; i < 6; i++) {
      const f = (this.clock * 3.8 + i / 6) % 1;
      ctx.globalAlpha = 0.6 * (1 - f);
      ctx.strokeStyle = i % 2 ? '#c4eeff' : '#6fb6ff';
      ctx.lineWidth = 1.5 + (1 - f) * 1.5;
      ctx.beginPath();
      ctx.moveTo(-50 * f - 10, Math.sin(i * 2.7 + this.clock * 9) * 8);
      ctx.quadraticCurveTo(-15, -5 + i * 2, 12, 0);
      ctx.stroke();
    }
    ctx.restore();
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
      if (b.fireArc) {
        const S = this.cfg.shock;
        this.drawZapArc(ctx, b.x0, b.y0, b.x1, b.y1, S.fireArcWidth, k, i, S.fireArcRgb, S.fireArcCoreRgb);
        // Красные боковые побеги от основного разряда, чисто визуальные.
        const dx = b.x1 - b.x0, dy = b.y1 - b.y0;
        const len = Math.hypot(dx, dy) || 1;
        for (let j = 0; j < 2; j++) {
          const t = 0.32 + j * 0.34;
          const x = b.x0 + dx * t, y = b.y0 + dy * t;
          const sign = j ? -1 : 1;
          const out = 18 + 8 * Math.sin(this.clock * 20 + i * 7 + j);
          this.drawZapArc(ctx, x, y, x + (dx / len * 0.35 - dy / len * sign) * out,
            y + (dy / len * 0.35 + dx / len * sign) * out,
            S.fireArcWidth * 0.48, k * 0.75, i * 3 + j + 19, S.fireArcRgb, S.fireArcCoreRgb);
        }
      } else if (b.sky) {
        this.drawZapArc(ctx, b.x0, b.y0, b.x1, b.y1, this.cfg.frost.shockStrikeWidth, k, i,
          '126,208,255', '246,252,255');
      } else this.drawZapArc(ctx, b.x0, b.y0, b.x1, b.y1, 2.2, k, i, ZAP_RGB[b.k | 0], ZAP_CORE[b.k | 0]);
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
      else { // луч по стихии рывка: как у Лазера (слои и детали), kind: 0 нет, 1 огонь, 2 мороз, 3 пар
        const el = b.kind | 0;
        const rgb = LASER_RGB[el];
        const core = LASER_CORE[el];
        const w = 3.4;
        const mk = (a, lw, c) => { ctx.strokeStyle = 'rgba(' + c + ',' + a + ')'; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(b.x0, b.y0); ctx.lineTo(ex, ey); ctx.stroke(); };
        mk(0.1 * fade, w * 6, rgb);
        mk(0.22 * fade, w * 3, rgb);
        mk(0.7 * fade, w * 1.5, rgb);
        mk(fade, w * 0.6, core);
        if (el) this.laserElement(ctx, el, b.x0, b.y0, ex, ey, w, fade, i + 7, this.clock, this.getPuff());
        const gl = el === 1 ? this.getGlow() : el === 3 ? this.getGlow('gold') : this.getGlow('blue');
        const g1 = w * 6;
        ctx.globalAlpha = 0.8 * fade;
        ctx.drawImage(gl, ex - g1, ey - g1, g1 * 2, g1 * 2);
        ctx.globalAlpha = 1;
      }
      if (b.done) { // зона эффектов в точке прибытия: мягкая лужа света и тонкое кольцо (детали даёт HitFx 'zone')
        const Z = this.cfg.kinetic.laserZone * (1 - 0.25 * (1 - fade));
        const rgb = LASER_RGB[b.kind | 0];
        const pool = ctx.createRadialGradient(b.x1, b.y1, 0, b.x1, b.y1, Z);
        pool.addColorStop(0, 'rgba(' + rgb + ',' + (0.3 * fade).toFixed(3) + ')');
        pool.addColorStop(0.7, 'rgba(' + rgb + ',' + (0.12 * fade).toFixed(3) + ')');
        pool.addColorStop(1, 'rgba(' + rgb + ',0)');
        ctx.fillStyle = pool;
        ctx.beginPath(); ctx.arc(b.x1, b.y1, Z, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(' + rgb + ',' + (0.5 * fade).toFixed(3) + ')';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([6, 7]);
        ctx.lineDashOffset = -this.clock * 24;
        ctx.beginPath(); ctx.arc(b.x1, b.y1, Z * 0.92, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    ctx.restore();
  }

  /** Дождь с Гравитацией продавливает пространство вокруг поражённого моба. */
  drawRainPressure(e, x, y, r) {
    const ctx = this.ctx, t = this.clock;
    const fade = Math.min(1, e.rainGravityT * 2.5);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const phase = t * (1.9 + i * 0.3) + i * 2.1;
      const ry = r * (0.34 + 0.13 * i) + 2;
      const yy = y - r * 0.7 + Math.sin(phase) * 3;
      ctx.strokeStyle = i === 1 ? '#d2b7ff' : '#7e65c6';
      ctx.globalAlpha = fade * (0.43 - i * 0.07);
      ctx.lineWidth = 1.3 + (2 - i) * 1.1;
      ctx.beginPath();
      ctx.ellipse(x, yy, r * (1.5 + i * 0.23), ry, Math.sin(phase) * 0.13, 0.2 + i * 0.4, Math.PI * 1.82 + i * 0.24);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#30224c';
    ctx.globalAlpha = fade * 0.19;
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.54, r * 1.7, r * 0.46, 0, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const u = (t * (0.7 + 0.08 * i) + i * 0.21) % 1;
      const xx = x + Math.sin(i * 2.5 + t * 1.1) * r * 1.1;
      ctx.strokeStyle = '#b19cfb';
      ctx.lineWidth = 1.1 + (1 - u) * 2.3;
      ctx.globalAlpha = fade * Math.sin(Math.PI * u) * 0.44;
      ctx.beginPath();
      ctx.moveTo(xx, y - r * 1.9 + u * r * 1.4);
      ctx.quadraticCurveTo(xx + 5 * Math.sin(t + i), y + r * 0.1, x + (xx - x) * 0.64, y + r * 0.65);
      ctx.stroke();
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
    // Молния: по полю то тут, то там проскакивают тонкие разряды от центра к краю, цвет по стихии. Видны на миг.
    if (au.lightning) {
      const zk = [0, 2, 1, 3][kd];
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const PER = 0.6;
      for (let i = 0; i < 5; i++) {
        const q = t / PER + i * 0.2;
        const cyc = Math.floor(q);
        const u = q - cyc;
        if (u > 0.42) continue;
        const fade = 1 - u / 0.42;
        const h = (k) => { const v = Math.sin((cyc * 7.13 + i * 3.7 + k * 19.19) * 43758.5453) * 43758.5453; return v - Math.floor(v); };
        const a0 = h(1) * TAU;
        const da = (h(2) - 0.5) * 0.9;
        const r0 = R * (0.12 + 0.25 * h(3));
        const r1 = R * (0.7 + 0.28 * h(4));
        this.drawZapArc(ctx, Math.cos(a0) * r0, Math.sin(a0) * r0, Math.cos(a0 + da) * r1, Math.sin(a0 + da) * r1, 2, 1.1 * fade, cyc * 4 + i, ZAP_RGB[zk], ZAP_CORE[zk]);
        ctx.globalAlpha = 0.9 * fade; // искра на конце разряда
        ctx.fillStyle = 'rgb(' + ZAP_CORE[zk] + ')';
        ctx.beginPath(); ctx.arc(Math.cos(a0 + da) * r1, Math.sin(a0 + da) * r1, 2.6, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    if (au.laserShimmer) this.drawAuraLaserCurrents(ctx, hx, hy, R, t);
    if (au.shotTimer > 0) this.drawAuraPelletForging(ctx, hx, hy, au, t);
    if (this.absorption?.auraConnected) this.drawAuraAbsorptionLinks(ctx,hx,hy,R,t);
    ctx.globalAlpha = 1;
  }

  /** Лазер насыщает Ауру потоками: спиральные жилы проходят через весь объём, а не обводят границу. */
  drawAuraLaserCurrents(ctx, hx, hy, R, t) {
    const glow = this.getGlow('blue');
    ctx.save();
    ctx.translate(hx, hy);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let i = 0; i < 8; i++) {
      const spin = i % 2 ? -1 : 1;
      const seed = i * 2.39996;
      const flicker = 0.76 + 0.24 * Math.sin(t * 3.6 + i * 2.9);
      // Три слоя одного живого русла: рассеянное поле, цветная плазма и светлая середина.
      for (let layer = 0; layer < 3; layer++) {
        ctx.beginPath();
        for (let j = 0; j <= 22; j++) {
          const u = j / 22;
          const a = seed + spin * (u * 2.7 + t * 0.72) + Math.sin(u * 11 - t * 2.4 + i) * 0.19;
          const rr = R * (0.13 + 0.79 * u) * (1 + 0.065 * Math.sin(u * 15 + t * 2.8 + i));
          const x = Math.cos(a) * rr, y = Math.sin(a) * rr * 0.92;
          if (!j) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = layer === 0 ? '#5245aa' : layer === 1 ? (i % 2 ? '#b16dff' : '#55b9ff') : '#e0e7ff';
        ctx.lineWidth = layer === 0 ? 16 : layer === 1 ? 5.3 : 1.25;
        ctx.globalAlpha = (layer === 0 ? 0.12 : layer === 1 ? 0.36 : 0.65) * flicker;
        ctx.stroke();
      }
      // Световые сгустки скользят вдоль жил; их движение не связано с пульсацией контура.
      for (let j = 0; j < 2; j++) {
        const u = (t * (0.34 + i * 0.012) + i * 0.137 + j * 0.47) % 1;
        const a = seed + spin * (u * 2.7 + t * 0.72) + Math.sin(u * 11 - t * 2.4 + i) * 0.19;
        const rr = R * (0.13 + 0.79 * u) * (1 + 0.065 * Math.sin(u * 15 + t * 2.8 + i));
        const x = Math.cos(a) * rr, y = Math.sin(a) * rr * 0.92;
        const size = 9 + 5 * Math.sin(Math.PI * u);
        ctx.globalAlpha = 0.6 * Math.sin(Math.PI * u);
        ctx.drawImage(glow, x - size, y - size, size * 2, size * 2);
        ctx.fillStyle = '#e6f2ff';
        ctx.globalAlpha = 0.85 * Math.sin(Math.PI * u);
        ctx.beginPath(); ctx.arc(x, y, 1.4, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
  }

  /** Перед залпом четыре зародыша дроби уплотняются из вихрей рядом с каждым врагом в Ауре. */
  drawAuraPelletForging(ctx, hx, hy, au, t) {
    const u = Math.max(0, Math.min(1, (au.shotTimer - 2.55) / 1.45));
    if (u <= 0) return;
    const glow = this.getGlow('blue');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    let drawn = 0;
    for (const e of this.enemies.items) {
      if (!e.active || ++drawn > 16) break;
      const dx = e.x - hx, dy = e.y - hy;
      if (dx * dx + dy * dy > (au.radius + e.radius) ** 2) { drawn--; continue; }
      const fade = Math.min(1, u * 4);
      for (let j = 0; j < 4; j++) {
        const a = j * TAU / 4 + Math.sin(t * 4 + j * 1.7) * (1 - u) * 0.8;
        const rr = e.radius + 8 + 31 * (1 - u);
        const x = e.x + Math.cos(a) * rr, y = e.y + Math.sin(a) * rr;
        const tail = 15 * (1 - u) + 4;
        ctx.globalAlpha = 0.16 * fade;
        ctx.strokeStyle = '#8263e9';
        ctx.lineWidth = 7 * (1 - u) + 1.5;
        ctx.beginPath();
        ctx.moveTo(x - Math.sin(a) * tail, y + Math.cos(a) * tail);
        ctx.quadraticCurveTo(e.x + Math.cos(a - 0.5) * rr, e.y + Math.sin(a - 0.5) * rr, x, y);
        ctx.stroke();
        const size = 13 * (1 - u) + 6;
        ctx.globalAlpha = (0.45 + 0.45 * u) * fade;
        ctx.drawImage(glow, x - size, y - size, size * 2, size * 2);
        ctx.fillStyle = '#e9f5ff';
        ctx.globalAlpha = 0.9 * fade;
        ctx.beginPath(); ctx.arc(x, y, 1.2 + 1.5 * u, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
  }

  /** Аура тянет тонкие негативные русла к будущим целям Поглощения перед общим ударом. */
  drawAuraAbsorptionLinks(ctx,hx,hy,R,t) {
    const a=this.absorption;
    const period=Math.max(.05,a.auraPeriod||1);
    const charge=1-Math.max(0,Math.min(1,a.auraTimer/Math.min(.58,period)));
    if(charge<=0)return;
    ctx.save();ctx.lineCap='round';ctx.globalCompositeOperation='lighter';
    let shown=0;
    const glow=this.getGlow(true);
    for(const e of this.enemies.items){
      if(!e?.active)continue;
      const dx=e.x-hx,dy=e.y-hy,len=Math.hypot(dx,dy);
      if(len>R+e.radius||len<12)continue;
      const nx=-dy/len,ny=dx/len;
      const s=Math.sin(t*3+e.gen*2.1)*Math.min(25,len*.22);
      const x1=hx+dx*.34+nx*s,y1=hy+dy*.34+ny*s;
      const x2=hx+dx*.67-nx*s,y2=hy+dy*.67-ny*s;
      ctx.strokeStyle='#6d378d';ctx.lineWidth=9;ctx.globalAlpha=.12*charge;
      ctx.beginPath();ctx.moveTo(hx,hy);ctx.bezierCurveTo(x1,y1,x2,y2,e.x,e.y);ctx.stroke();
      ctx.strokeStyle='#cc7bff';ctx.lineWidth=1.7;ctx.globalAlpha=.48*charge;ctx.stroke();
      for(let j=0;j<2;j++){
        const u=(t*.36+j*.48+(e.gen%7)*.09)%1;
        const v=1-u;
        const x=v*v*v*hx+3*v*v*u*x1+3*v*u*u*x2+u*u*u*e.x;
        const y=v*v*v*hy+3*v*v*u*y1+3*v*u*u*y2+u*u*u*e.y;
        const size=5+5*Math.sin(Math.PI*u);
        ctx.globalAlpha=.6*charge*Math.sin(Math.PI*u);
        ctx.drawImage(glow,x-size,y-size,size*2,size*2);
      }
      if(++shown>=8)break;
    }
    ctx.restore();
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
      if (l.gravityLaser && l.gravityChargeAge < l.gravityChargeTime) {
        // Растущий круг: весь заряд виден до первого тика лазера.
        const p = Math.max(0, Math.min(1, l.gravityChargeAge / Math.max(0.05, l.gravityChargeTime)));
        const r = this.cfg.gravity.laserRadius * (0.2 + 0.8 * p);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(179,132,255,' + (0.4 + 0.6 * p) + ')';
        ctx.lineWidth = 1.5 + 2 * p;
        ctx.beginPath();
        ctx.arc(l.x, l.y, r, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = 'rgba(118,70,255,' + (0.05 + 0.25 * p) + ')';
        ctx.fill();
        ctx.strokeStyle = 'rgba(228,208,255,' + (0.15 + 0.55 * p) + ')';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.arc(l.x, l.y, r * 0.58, t * 4 + li, t * 4 + li + Math.PI * 1.5);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(l.x, l.y, 2 + 3 * p, 0, TAU);
        ctx.fillStyle = 'rgba(247,232,255,' + (0.25 + 0.65 * p) + ')';
        ctx.fill();
        continue;
      }
      const fade = Math.min(1, (l.life - l.age) / 0.25) * Math.min(1, l.age / 0.04 + 0.35);
      l.pulse = Math.max(0, l.pulse - 0.06);
      const x0 = l.x + l.dx * (l.gravityLaser ? 0 : 10);
      const y0 = l.y + l.dy * (l.gravityLaser ? 0 : 10);
      const x1 = l.x + l.dx * l.len;
      const y1 = l.y + l.dy * l.len;
      const flick = 0.9 + 0.1 * Math.sin(t * 70 + li * 3.7) + l.pulse * 0.25;
      const w = (l.big ? l.width * 0.5 : l.width * 0.26) * flick; // обычный луч около 2.6 единицы
      const ph = !!l.gen;
      if (ph && l.age < 0.3) this.drawPhantomConjuring(ctx,x0,y0,Math.max(18,l.width*3),l.age/0.3,li);
      const absorb = !!l.absorptionBeam;
      const zp = !!l.zap;
      const zk = (l.burnDmg > 0 ? 1 : 0) | (l.frost ? 2 : 0);
      const el = ph ? 4 : zk; // 0 синий, 1 огонь, 2 мороз, 3 пар, 4 фантом
      const glow = absorb ? this.getGlow(true) : glowBy[el];
      const rgb = absorb ? '156,61,116' : (zp ? ZAP_RGB[zk] : LASER_RGB[el]);
      const core = absorb ? '247,179,210' : (zp ? ZAP_CORE[zk] : LASER_CORE[el]);
      if (absorb) {
        // Никакой ровной световой оси: это дымный магический поток.
        this.spellFx.absorptionLaser(ctx,x0,y0,x1,y1,w,fade,t);
      } else {
        if (zp) this.drawZapArc(ctx,x0,y0,x1,y1,w,fade,li,rgb,core);
        else {
          ctx.strokeStyle='rgba('+rgb+','+0.1*fade+')';
          ctx.lineWidth=w*6;
          ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x1,y1);ctx.stroke();
          ctx.strokeStyle='rgba('+rgb+','+0.22*fade+')';
          ctx.lineWidth=w*3;
          ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x1,y1);ctx.stroke();
          ctx.strokeStyle='rgba('+rgb+','+0.7*fade+')';
          ctx.lineWidth=w*1.5;
          ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x1,y1);ctx.stroke();
          ctx.strokeStyle='rgba('+core+','+fade+')';
          ctx.lineWidth=Math.max(.9,w*.6);
          ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x1,y1);ctx.stroke();
        }
        if (!zp && el!==0 && el!==4) this.laserElement(ctx,el,x0,y0,x1,y1,w,fade,li,t,puffSp);
      }
      if (l.gravityLaser && !absorb) {
        // Фиолетовая оболочка усиленного луча и остаточное кольцо в источнике.
        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(165,108,255,' + (0.35 * fade) + ')';
        ctx.lineWidth = w * 4.2;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        ctx.strokeStyle = 'rgba(230,206,255,' + (0.8 * fade) + ')';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x0, y0, this.cfg.gravity.laserRadius, 0, TAU); ctx.stroke();
      }
      // Вспышка у посоха и точка попадания.
      const g0 = w * 5;
      ctx.globalAlpha = 0.7 * fade;
      ctx.drawImage(glow, x0 - g0, y0 - g0, g0 * 2, g0 * 2);
      const g1 = w * (7 + 2 * Math.sin(t * 50 + li));
      ctx.globalAlpha = 0.85 * fade;
      ctx.drawImage(glow, x1 - g1, y1 - g1, g1 * 2, g1 * 2);
      if (!absorb) {
        ctx.globalAlpha = fade;
        ctx.fillStyle = 'rgba(' + core + ',1)';
        ctx.beginPath();
        ctx.arc(x1, y1, Math.max(1, w * 0.7), 0, TAU);
        ctx.fill();
      }
      // Искры, разлетающиеся от точки попадания.
      for (let k = 0; k < (absorb ? 0 : 3); k++) {
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
    ctx.globalAlpha = 1; // после клубов тут оставалась их прозрачность: чёрточки выходили тусклыми
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < P.n; i++) {
      if (P.bd[i] > 0 || P.fr[i] === 1 || P.zp[i] === 1) continue;
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
    // Проход 3: дробь с Молнией: короткая ломаная молния вместо чёрточки (дрожит 40 раз в секунду); цвет по стихии на дробинке.
    const fl = Math.floor(t * 40);
    for (let k = 0; k < 4; k++) {
      let any = false;
      ctx.beginPath();
      for (let i = 0; i < P.n; i++) {
        if (P.zp[i] !== 1) continue;
        if (((P.bd[i] > 0 ? 1 : 0) | (P.fr[i] === 1 ? 2 : 0)) !== k) continue;
        const x = P.px[i] + (P.x[i] - P.px[i]) * alpha;
        const y = P.py[i] + (P.y[i] - P.py[i]) * alpha;
        if (x < viewL - 12 || x > viewR + 12 || y < viewT - 12 || y > viewB + 12) continue;
        any = true;
        const sp = Math.hypot(P.vx[i], P.vy[i]) || 1;
        const bx = -P.vx[i] / sp;
        const by = -P.vy[i] / sp;
        const nx = -by;
        const ny = bx;
        ctx.moveTo(x, y);
        for (let j = 1; j <= 3; j++) {
          const h = Math.sin((P.sd[i] * 91.7 + fl * 3.1 + j * 17.3) * 43758.5453) * 43758.5453;
          const jit = (h - Math.floor(h) - 0.5) * 7;
          ctx.lineTo(x + bx * j * 4.5 + nx * jit, y + by * j * 4.5 + ny * jit);
        }
      }
      if (!any) continue;
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(' + ZAP_RGB[k] + ',0.55)';
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(' + ZAP_CORE[k] + ',1)';
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.lineCap = 'butt';
  }

  /**
   * Спектральные клинки: светящиеся, цвет и форма по модам. Обычный: меч с гардой; Мороз: ледяной кристалл; Горение:
   * огненная стрела; Мороз и Горение вместе: кристальная стрела. В полёте за клинком тянется хвост, фантомные фиолетовые.
   * С Лазером клинки это светящиеся сферы. Остриё смотрит по ходу полёта (на орбите наружу).
   */
  /**
   * Сфера клинка с Лазером. Вид по комбинации: 0 энергетический шар с гранёной звездой, 1 ледяной кристалл-снежинка,
   * 2 пылающий шар с языками, 3 пар (ледяное ядро в огненном вихре с облачками), молния добавляет дуги, фантом фиолетовый с дымкой.
   */
  drawOrb(ctx, b, rr, kd, i, t) {
    const gen = !!b.gen;
    const zap = !!b.zap;
    const fire = b.state === 'fire';
    const ph = t * 3 + i * 1.7;
    const pul = 1 + 0.07 * Math.sin(t * 9 + i) + (fire ? 0.12 : 0);
    const R = rr * pul;
    const pal = gen
      ? { a: '167,119,255', b: '240,228,255', c: '110,70,210' }
      : kd === 1 ? { a: '127,216,255', b: '242,252,255', c: '60,150,230' }
      : kd === 2 ? { a: '255,138,42', b: '255,240,200', c: '210,50,20' }
      : kd === 3 ? { a: '255,170,90', b: '235,248,255', c: '90,170,240' }
      : { a: '63,134,255', b: '214,236,255', c: '30,70,190' };
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    // мягкое тело: радиальный градиент без жёсткого края
    let g = ctx.createRadialGradient(-R * 0.2, -R * 0.25, 0, 0, 0, R * 1.25);
    g.addColorStop(0, 'rgba(' + pal.b + ',1)');
    g.addColorStop(0.35, 'rgba(' + pal.a + ',0.95)');
    g.addColorStop(0.8, 'rgba(' + pal.c + ',0.55)');
    g.addColorStop(1, 'rgba(' + pal.c + ',0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, R * 1.25, 0, TAU); ctx.fill();
    if (gen) { // фантом: дымные языки по кругу
      ctx.fillStyle = 'rgba(' + pal.a + ',0.35)';
      for (let k = 0; k < 4; k++) {
        const an = ph * 0.6 + k * 1.57;
        ctx.beginPath(); ctx.ellipse(Math.cos(an) * R * 0.7, Math.sin(an) * R * 0.7, R * 0.55, R * 0.22, an + 1.57, 0, TAU); ctx.fill();
      }
    } else if (kd === 0) { // гранёная звезда внутри
      ctx.save(); ctx.rotate(ph * 0.5);
      ctx.fillStyle = 'rgba(' + pal.b + ',0.9)';
      ctx.beginPath();
      for (let k = 0; k < 8; k++) { const rr2 = k % 2 ? R * 0.28 : R * 0.8; const an = k * Math.PI / 4; ctx.lineTo(Math.cos(an) * rr2, Math.sin(an) * rr2); }
      ctx.closePath(); ctx.fill();
      ctx.restore();
    } else if (kd === 1) { // ледяная снежинка: шесть острых лучей-кристаллов
      ctx.save(); ctx.rotate(ph * 0.25);
      for (let k = 0; k < 6; k++) {
        ctx.rotate(Math.PI / 3);
        ctx.fillStyle = 'rgba(' + pal.b + ',0.92)';
        ctx.beginPath(); ctx.moveTo(R * 1.05, 0); ctx.lineTo(R * 0.3, -R * 0.2); ctx.lineTo(R * 0.12, 0); ctx.lineTo(R * 0.3, R * 0.2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(' + pal.c + ',0.5)';
        ctx.beginPath(); ctx.moveTo(R * 1.05, 0); ctx.lineTo(R * 0.3, R * 0.2); ctx.lineTo(R * 0.12, 0); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    } else if (kd === 2) { // языки пламени вокруг
      for (let k = 0; k < 5; k++) {
        const an = ph * 0.9 + k * (TAU / 5);
        const ln = R * (1.15 + 0.3 * Math.sin(t * 11 + k * 2 + i));
        ctx.save(); ctx.rotate(an);
        ctx.fillStyle = 'rgba(' + (k % 2 ? pal.c : pal.a) + ',0.8)';
        ctx.beginPath(); ctx.moveTo(R * 0.35, -R * 0.28); ctx.quadraticCurveTo(ln * 0.85, -R * 0.2, ln, 0); ctx.quadraticCurveTo(ln * 0.85, R * 0.2, R * 0.35, R * 0.28); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = 'rgba(255,245,210,0.9)';
      ctx.beginPath(); ctx.arc(-R * 0.1, -R * 0.1, R * 0.38, 0, TAU); ctx.fill();
    } else { // пар: холодное ядро, тёплая спираль и облачка по орбите
      ctx.strokeStyle = 'rgba(255,170,90,0.85)';
      ctx.lineWidth = Math.max(1.4, R * 0.18);
      ctx.beginPath();
      for (let k = 0; k <= 12; k++) { const u = k / 12; const an = ph + u * 4.2; const rad = R * (0.25 + 0.75 * u); const x = Math.cos(an) * rad; const y = Math.sin(an) * rad; if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.stroke();
      ctx.fillStyle = 'rgba(' + pal.b + ',0.95)';
      ctx.save(); ctx.rotate(-ph * 0.6);
      ctx.beginPath(); for (let k = 0; k < 6; k++) { const an = k * Math.PI / 3; ctx.lineTo(Math.cos(an) * R * 0.42, Math.sin(an) * R * 0.42); } ctx.closePath(); ctx.fill();
      ctx.restore();
      for (let k = 0; k < 3; k++) {
        const an = -ph * 0.8 + k * 2.09;
        const cg = ctx.createRadialGradient(Math.cos(an) * R * 1.0, Math.sin(an) * R * 1.0, 0, Math.cos(an) * R * 1.0, Math.sin(an) * R * 1.0, R * 0.5);
        cg.addColorStop(0, 'rgba(235,245,255,0.55)'); cg.addColorStop(1, 'rgba(235,245,255,0)');
        ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(Math.cos(an) * R * 1.0, Math.sin(an) * R * 1.0, R * 0.5, 0, TAU); ctx.fill();
      }
    }
    if (zap) { // молния: короткие дуги наружу, цвет по стихии
      const zk = kd === 1 ? 2 : kd === 2 ? 1 : kd === 3 ? 3 : 0;
      const step = Math.floor(t * 14);
      for (let k = 0; k < 3; k++) {
        const an = (((Math.sin((step + k * 5 + i * 3) * 12.9898) * 43758.5453) % 1) + 1) % 1 * TAU;
        this.drawZapArc(ctx, Math.cos(an) * R * 0.5, Math.sin(an) * R * 0.5, Math.cos(an) * R * 1.8, Math.sin(an) * R * 1.8, 0.6, 0.9, i * 7 + k + step, ZAP_RGB[zk], ZAP_CORE[zk]);
      }
    }
    // световая точка сверху слева: свет сверху
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath(); ctx.ellipse(-R * 0.3, -R * 0.35, R * 0.16, R * 0.1, -0.6, 0, TAU); ctx.fill();
    ctx.restore();
  }

  /**
   * Клинок-молния (мод Молния на Клинках): ломаный разряд вдоль полёта, мерцает, с двумя ответвлениями.
   * Цвет по связке: без стихии жёлтая, с Горением красная, с Морозом голубая, с паром белая.
   */
  drawZeusBlade(ctx, b, k, kd, i, t) {
    const RGB = ['255,210,40', '110,205,255', '255,56,44', '236,230,255'];
    const CORE = ['255,252,225', '240,252,255', '255,226,210', '255,255,255'];
    const rgb = RGB[kd];
    const core = CORE[kd];
    const step = Math.floor(t * 18);
    const rnd = (n) => { const h = Math.sin((step * 7 + i * 13 + n) * 12.9898) * 43758.5453; return h - Math.floor(h); };
    const fly = b.state === 'fly' || b.state === 'return';
    const len = fly ? 3.4 : 2.7; // в полёте длиннее
    const N = 6;
    const pts = [];
    for (let q = 0; q <= N; q++) {
      const u = q / N;
      const x = (-len + 2 * len * u) * k;
      const y = q === 0 || q === N ? 0 : (rnd(q) - 0.5) * 1.7 * k * (fly ? 1 : 0.8);
      pts.push(x, y);
    }
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.a);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'miter';
    const path = () => {
      ctx.beginPath();
      for (let q = 0; q <= N; q++) { if (q) ctx.lineTo(pts[q * 2], pts[q * 2 + 1]); else ctx.moveTo(pts[0], pts[1]); }
      // ответвления: короткие вилки от второй и четвёртой вершин
      for (let br = 0; br < 2; br++) {
        const q = br ? 4 : 2;
        const bx = pts[q * 2];
        const by = pts[q * 2 + 1];
        const sg = rnd(40 + br) > 0.5 ? 1 : -1;
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + 0.9 * k, by + sg * 0.9 * k);
        ctx.lineTo(bx + 1.7 * k, by + sg * (0.9 + (rnd(50 + br) - 0.3) * 0.8) * k);
      }
    };
    ctx.strokeStyle = 'rgba(' + rgb + ',0.28)';
    ctx.lineWidth = k * 1.5;
    path(); ctx.stroke();
    ctx.strokeStyle = 'rgba(' + rgb + ',0.85)';
    ctx.lineWidth = k * 0.55;
    path(); ctx.stroke();
    ctx.strokeStyle = 'rgba(' + core + ',1)';
    ctx.lineWidth = Math.max(1, k * 0.2);
    path(); ctx.stroke();
    ctx.restore();
  }

  drawBlades(ctx) {
    const bl = this.blades.concat(this.kineticBlades, this.incarnation?.bladeItems || []);
    if (!bl || !bl.length) return;
    const B = this.cfg.blades;
    const k = B.size * 0.8;
    const t = this.clock;
    // Спрайты и палитры неизменны: не создаём массивы заново каждый кадр.
    const cache = this.bladeDrawCache || (this.bladeDrawCache = {
      glows: [this.getGlow('blue'), this.getGlow('blue'), this.getGlow(), this.getGlow('gold'), this.getGlow(true), this.getGlow('gold')],
      tails: [this.getComet('Blue'), this.getComet('Ice'), this.getComet('Fire'), this.getComet('Steam'), this.getComet('Violet'), this.getComet('Gold')],
      mainC: ['#3f86ff', '#7fd8ff', '#ff8a2a', '#d9efff'],
      liteC: ['#d6ecff', '#f2fcff', '#fff0c8', '#ffffff'],
      zapGlow: [this.getGlow('gold'), this.getGlow('blue'), this.getGlow('red'), this.getGlow(true)],
      zapColors: ['#ffd21e', '#7fd8ff', '#ff9a3a', '#ffffff'],
    });
    const { glows, tails, mainC, liteC, zapGlow } = cache; // молнии: жёлтая, голубая (мороз), красная (огонь), белая с фиолетом (пар)
    // Проход 1: хвосты и свечение сложением цветов.
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < bl.length; i++) {
      const b = bl[i];
      const kd = b.kind | 0;
      const fly = b.state === 'fly' || b.state === 'return';
      const gl = b.zap ? zapGlow[kd] : b.gen ? glows[4] : glows[kd];
      const pulse = 0.85 + 0.15 * Math.sin(t * 8 + i * 1.3);
      if (b.kinetic && b.age < 0.24) {
        const u = Math.min(1, b.age / 0.24), fade = 1 - u;
        const ox = b.birthX ?? b.x, oy = b.birthY ?? b.y;
        ctx.save();
        ctx.strokeStyle = '#9cc5ff'; ctx.lineCap = 'round';
        for (let j = 0; j < 5; j++) {
          const angle = b.a + j * TAU / 5 + t * (j % 2 ? -5 : 4);
          const d = 12 + 25 * fade;
          ctx.globalAlpha = fade * (0.3 + 0.1 * j);
          ctx.lineWidth = 1.2 + 3 * fade;
          ctx.beginPath();
          ctx.moveTo(ox + Math.cos(angle) * d, oy + Math.sin(angle) * d);
          ctx.quadraticCurveTo(b.x - Math.sin(angle) * 9, b.y + Math.cos(angle) * 9, b.x, b.y);
          ctx.stroke();
        }
        const sz = k * (1.5 - 0.75 * u);
        ctx.globalAlpha = 0.85 * fade;
        ctx.drawImage(gl, b.x - sz, b.y - sz, sz * 2, sz * 2);
        ctx.restore();
      }
      if (fly && !b.sphere && !b.zap) {
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
      if (b.gen > 0 && b.state === 'fly' && b.age < 0.3)
        this.drawPhantomConjuring(ctx,b.x,b.y,k*2.9,b.age/0.3,i+b.gen);
      if (b.pc !== undefined && b.age < 0.3 && fly && !b.kinetic)
        this.drawPierceTrail(ctx,b.x,b.y,b.a,k*2.4,1-b.age/0.3,i);
    }
    ctx.globalCompositeOperation = 'source-over';
    // Проход 2: сами клинки.
    ctx.lineJoin = 'round';
    for (let i = 0; i < bl.length; i++) {
      const b = bl[i];
      const kd = b.kind | 0;
      const mc = b.zap ? cache.zapColors[b.kind | 0] : b.gen ? '#a577ff' : mainC[kd];
      const lc = b.zap ? '#fffbe0' : b.gen ? '#f0e4ff' : liteC[kd];
      ctx.globalAlpha = 1;
      if (b.kinetic && b.age < 0.18) {
        const u = Math.min(1, b.age / 0.18);
        ctx.save();
        ctx.translate(b.x, b.y); ctx.rotate(b.a);
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = lc; ctx.lineWidth = 2.5 * (1 - u) + 0.7;
        ctx.globalAlpha = (1 - u) * 0.85;
        ctx.beginPath();
        ctx.moveTo(-k * (2.4 - u), -k * (1.2 - u));
        ctx.quadraticCurveTo(0, -k * (0.7 - 0.4 * u), k * 2.8, 0);
        ctx.quadraticCurveTo(0, k * (0.7 - 0.4 * u), -k * (2.4 - u), k * (1.2 - u));
        ctx.stroke();
        ctx.restore();
        ctx.globalAlpha = u;
      }
      if (b.zap && !b.sphere) { // клинок-молния Зевса: ломаный разряд с ответвлениями
        this.drawZeusBlade(ctx, b, k, kd, i, t);
        continue;
      }
      if (b.sphere) { // с Лазером клинки это сферы: вид и форма по стихии (render: drawOrb)
        this.drawOrb(ctx, b, k * (b.state === 'fire' ? 0.82 : 0.66), kd, i, t);
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

  /** Фантом возникает из разреза пространства: нити стягивают расколотые зеркальные осколки в ядро. */
  drawPhantomConjuring(ctx,x,y,r,progress,seed=0) {
    const p=Math.max(0,Math.min(1,progress)),t=this.clock;
    const fade=Math.sin(Math.PI*p)*.88,rr=r*(1.65-1.16*p);
    if(fade<=.01)return;
    const glow=this.getGlow(true);
    ctx.save();ctx.translate(x,y);
    ctx.globalCompositeOperation='lighter';
    ctx.lineCap='round';
    for(let i=0;i<5;i++){
      const a=i*TAU/5+t*(i%2?-.9:.65)+seed*.73;
      const x0=Math.cos(a)*rr,y0=Math.sin(a)*rr*.78;
      const bend=.5*Math.sin(t*7+i*1.8);
      ctx.strokeStyle=i%2?'#a67cff':'#e6beff';
      ctx.lineWidth=i%2?2.3:1.25;ctx.globalAlpha=fade*(i%2?.46:.85);
      ctx.beginPath();ctx.moveTo(x0,y0);
      ctx.quadraticCurveTo(Math.cos(a+bend)*rr*.52,Math.sin(a+bend)*rr*.52,0,0);
      ctx.stroke();
      ctx.fillStyle=i%2?'#874cce':'#dac2ff';
      ctx.beginPath();
      ctx.moveTo(x0+Math.cos(a)*6,y0+Math.sin(a)*6);
      ctx.lineTo(x0-Math.sin(a)*3,y0+Math.cos(a)*3);
      ctx.lineTo(x0-Math.cos(a)*4,y0-Math.sin(a)*4);
      ctx.lineTo(x0+Math.sin(a)*3,y0-Math.cos(a)*3);
      ctx.closePath();ctx.fill();
    }
    ctx.globalAlpha=fade*.7;
    const sz=r*(.8-p*.32);
    ctx.drawImage(glow,-sz,-sz,sz*2,sz*2);
    ctx.globalAlpha=fade*.9;
    ctx.strokeStyle='#e6d4ff';ctx.lineWidth=1.1;
    ctx.beginPath();ctx.arc(0,0,r*(1.1-.6*p),t*3,t*3+Math.PI*1.4);ctx.stroke();
    ctx.restore();
  }

  /** Пробитие оставляет за снарядом сверхострый канал и две расходящиеся световые кромки. */
  drawPierceTrail(ctx,x,y,angle,r,fade,seed=0) {
    if(fade<=0)return;
    ctx.save();ctx.translate(x,y);ctx.rotate(angle);
    ctx.globalCompositeOperation='lighter';ctx.lineCap='round';
    for(let i=0;i<2;i++){
      const sign=i?1:-1;
      const wave=Math.sin(this.clock*17+seed*.7+i)*r*.13;
      ctx.strokeStyle='#83cbff';ctx.lineWidth=2.8;ctx.globalAlpha=.2*fade;
      ctx.beginPath();ctx.moveTo(r*.78,0);
      ctx.quadraticCurveTo(-r*.6,sign*r*.52+wave,-r*2.8,sign*r*.25);
      ctx.stroke();
      ctx.strokeStyle='#e6faff';ctx.lineWidth=.9;ctx.globalAlpha=.74*fade;ctx.stroke();
      ctx.fillStyle='#b6e8ff';ctx.globalAlpha=.67*fade;
      ctx.beginPath();ctx.moveTo(r*1.28,0);ctx.lineTo(r*.32,sign*r*.3);
      ctx.lineTo(r*.57,0);ctx.closePath();ctx.fill();
    }
    ctx.strokeStyle='#f2fbff';ctx.lineWidth=1.5;ctx.globalAlpha=.75*fade;
    ctx.beginPath();ctx.moveTo(r*1.45,0);ctx.lineTo(-r*3.2,0);ctx.stroke();
    ctx.restore();
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
