// Отрисовка на Canvas 2D: цветные фигуры вместо арта.
// Мир рисуется с интерполяцией между прошлым и текущим шагом логики (alpha из цикла).

const TAU = Math.PI * 2;
const EMPTY = { items: [] };

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
    this.effects = deps.effects || EMPTY;
    this.autoattack = deps.autoattack || null;
    this.hud = deps.hud || null;
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

    const hx = hero.prevX + (hero.x - hero.prevX) * alpha;
    const hy = hero.prevY + (hero.y - hero.prevY) * alpha;

    // Дальность автоатаки: еле заметное кольцо, по нему видно, кого герой достанет.
    if (hero.active) {
      ctx.beginPath();
      ctx.arc(hx, hy, this.cfg.attack.radius, 0, TAU);
      ctx.lineWidth = 1.5 / s;
      ctx.strokeStyle = C.range;
      ctx.stroke();
    }

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

    // Метка на цели автоатаки.
    const target = this.autoattack && this.autoattack.target;
    if (target && target.active) {
      const tx = target.prevX + (target.x - target.prevX) * alpha;
      const ty = target.prevY + (target.y - target.prevY) * alpha;
      ctx.beginPath();
      ctx.arc(tx, ty, target.radius + 5, 0, TAU);
      ctx.lineWidth = 2;
      ctx.strokeStyle = C.target;
      ctx.stroke();
    }

    if (hero.active) this.drawHero(hx, hy, C);

    // Снаряды.
    this.drawShots(this.heroShots.items, alpha, viewL, viewR, viewT, viewB);
    this.drawShots(this.enemyShots.items, alpha, viewL, viewR, viewT, viewB);

    // Эффекты-всплески.
    const fx = this.effects.items;
    for (let i = 0; i < fx.length; i++) {
      const f = fx[i];
      if (!f.active) continue;
      const t = Math.min(1, f.age / f.life);
      ctx.globalAlpha = 1 - t;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r0 + (f.r1 - f.r0) * t, 0, TAU);
      ctx.lineWidth = 3;
      ctx.strokeStyle = f.color;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Стик и HUD рисуем в экранных координатах (px), поверх мира.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawStick(C);
    this.drawHud(C);
  }

  drawEnemy(e, x, y, C) {
    const ctx = this.ctx;
    const r = e.radius;
    const hit = e.flash > 0;
    ctx.fillStyle = C.shadow;
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.6, r * 1.05, r * 0.55, 0, 0, TAU);
    ctx.fill();

    // Попадание: враг белеет и на мгновение раздувается.
    const rr = hit ? r * 1.15 : r;
    ctx.fillStyle = hit ? '#ffffff' : e.def.color;
    ctx.beginPath();
    ctx.arc(x, y, rr, 0, TAU);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = hit ? '#ffffff' : e.def.edge;
    ctx.stroke();

    // Полоска здоровья над головой.
    const bw = r * 2;
    const bx = x - r;
    const by = y - r - 9;
    ctx.fillStyle = C.hpBg;
    ctx.fillRect(bx, by, bw, 4);
    ctx.fillStyle = C.hpFill;
    ctx.fillRect(bx, by, bw * Math.max(0, Math.min(1, e.hp / e.maxHp)), 4);
  }

  drawHero(hx, hy, C) {
    const ctx = this.ctx;
    const hero = this.hero;
    const r = hero.radius;
    // После удара герой мигает: видно, что он сейчас неуязвим.
    if (hero.invuln > 0 && (Math.floor(hero.invuln * 16) & 1)) ctx.globalAlpha = 0.4;

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
    }
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

  /** Полоска здоровья героя и счётчик убитых в левом верхнем углу (с учётом выреза iPhone). */
  drawHud(C) {
    const hud = this.hud;
    if (!hud) return;
    const ctx = this.ctx;
    const hero = this.hero;
    const maxHp = this.cfg.hero.maxHp || 1;
    const x = hud.insets.left + 12;
    const y = hud.insets.top + 12;
    const w = 150;
    const hh = 16;
    ctx.fillStyle = C.hpBg;
    ctx.fillRect(x, y, w, hh);
    ctx.fillStyle = C.hpHero;
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, hero.hp / maxHp)), hh);
    ctx.lineWidth = 1;
    ctx.strokeStyle = C.border;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, hh - 1);
    ctx.fillStyle = C.hud;
    ctx.font = '11px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(Math.ceil(hero.hp) + ' / ' + maxHp, x + 6, y + hh / 2 + 0.5);
    ctx.fillText('Убито: ' + hud.kills, x, y + hh + 14);
  }
}
