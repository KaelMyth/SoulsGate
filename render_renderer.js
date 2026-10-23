// Отрисовка на Canvas 2D: цветные фигуры вместо арта.
// Мир рисуется с интерполяцией между прошлым и текущим шагом логики (alpha из цикла).

import { getTelegraph } from './systems_attacks.js';

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
    this.gems = deps.gems || EMPTY;
    this.autoattack = deps.autoattack || null;
    this.defense = deps.defense || null;
    this.boss = deps.boss || null; // разломы, телеграфы и взрыв босса (systems_boss.js)
    this.clouds = deps.clouds || [];
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
    if (hero.active && !(this.hud && this.hud.gameMode)) {
      ctx.beginPath();
      ctx.arc(hx, hy, this.cfg.attack.radius, 0, TAU);
      ctx.lineWidth = 1.5 / s;
      ctx.strokeStyle = C.range;
      ctx.stroke();
    }

    this.drawClouds(ctx);

    // Камни опыта лежат на земле под врагами и героем.
    this.drawGems(alpha, viewL, viewR, viewT, viewB);

    // Зоны атак на земле (под врагами): видно, откуда придёт удар.
    this.drawTelegraphs(C, alpha);
    this.drawBossGround(C);

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

    if (hero.active) {
      this.drawHero(hx, hy, C);
      this.drawBlock(hx, hy, C);
      if (this.hud && this.hud.gameMode) this.drawCooldownArcs(hx, hy, C);
    }

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

  /** Всё, что босс кладёт на землю: разломы, линия-телеграф рывка, телеграф и вспышка взрыва. */
  drawBossGround(C) {
    const b = this.boss;
    if (!b) return;
    const ctx = this.ctx;

    // Разломы: полоса холода, тёмная трещина с ледяной жилой и иней по бокам. Таят в конце цикла.
    if (b.fissures.length) {
      ctx.save();
      ctx.globalAlpha = b.fissureAlpha();
      ctx.lineJoin = 'round';
      for (let i = 0; i < b.fissures.length; i++) {
        const f = b.fissures[i];
        ctx.beginPath();
        ctx.moveTo(f.x1, f.y1);
        ctx.lineTo(f.x2, f.y2);
        ctx.lineWidth = f.hw * 2;
        ctx.strokeStyle = C.frostMist;
        ctx.stroke();
        ctx.beginPath();
        for (let k = 0; k < f.pts.length; k++) {
          if (k === 0) ctx.moveTo(f.pts[k].x, f.pts[k].y);
          else ctx.lineTo(f.pts[k].x, f.pts[k].y);
        }
        ctx.lineWidth = 5;
        ctx.strokeStyle = C.crack;
        ctx.stroke();
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = C.fissureCore;
        ctx.stroke();
        ctx.beginPath();
        for (let k = 0; k < f.ticks.length; k++) {
          const t = f.ticks[k];
          ctx.moveTo(t.x, t.y);
          ctx.lineTo(t.x + t.nx * t.len, t.y + t.ny * t.len);
        }
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      ctx.restore();
    }

    // Линия рывка: узкая, видна сразу, к концу задержки контур мигает.
    const tl = b.tele;
    if (tl) {
      const len = Math.hypot(tl.x2 - tl.x1, tl.y2 - tl.y1);
      const blink = tl.t / Math.max(0.01, tl.total) > 0.6 && (Math.floor(tl.t * 24) & 1);
      ctx.save();
      ctx.translate(tl.x1, tl.y1);
      ctx.rotate(Math.atan2(tl.y2 - tl.y1, tl.x2 - tl.x1));
      ctx.fillStyle = C.teleProgress;
      ctx.fillRect(0, -tl.hw, len, tl.hw * 2);
      ctx.lineWidth = blink ? 2.5 : 1.5;
      ctx.strokeStyle = C.teleEdge;
      ctx.strokeRect(0, -tl.hw, len, tl.hw * 2);
      ctx.restore();
    }

    // Область пересечения разломов: телеграф заполняется к центру, потом вспышка взрыва.
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
        this.polyPath(bl.poly, bl.x, bl.y, 1);
        ctx.lineWidth = k > 0.7 && (Math.floor(k * 18) & 1) ? 2.5 : 1.5;
        ctx.strokeStyle = C.teleEdge;
        ctx.stroke();
      } else {
        const a = 1 - Math.min(1, bl.t / Math.max(0.01, bl.total));
        ctx.save();
        ctx.globalAlpha = 0.25 + 0.75 * a;
        this.polyPath(bl.poly, bl.x, bl.y, 1);
        ctx.fillStyle = C.blastFill;
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
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

    // Попадание: враг белеет и на мгновение раздувается.
    const rr = hit ? r * 1.15 : e.atk.state === 'windup' ? r * (1 + 0.08 * Math.sin(e.atk.t * 30)) : r;
    const aiming = e.aim > 0;
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
    ctx.lineWidth = 2;
    ctx.strokeStyle = hit ? '#ffffff' : e.def.edge;
    ctx.stroke();

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
      ctx.strokeStyle = '#ffe27a';
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

    // Окно парирования: герой меняет цвет.
    ctx.fillStyle = this.defense && this.defense.parrying ? C.parry : C.hero;
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
      if (p.parryable) {
        // Парируемые снаряды обведены: видно, что их можно поймать.
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#fff3d0';
        ctx.stroke();
      }
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
    // Шкала опыта и уровень под полоской здоровья.
    const xy = y + hh + 4;
    ctx.fillStyle = C.hpBg;
    ctx.fillRect(x, xy, w, 8);
    ctx.fillStyle = hud.xpMax ? C.accent : '#4fd18b';
    ctx.fillRect(x, xy, w * Math.max(0, Math.min(1, hud.xpFraction || 0)), 8);
    ctx.strokeStyle = C.border;
    ctx.strokeRect(x + 0.5, xy + 0.5, w - 1, 7);
    ctx.fillStyle = C.hud;
    ctx.font = '11px ui-monospace, Menlo, monospace';
    ctx.fillText((hud.xpMax ? 'Ур. макс' : 'Ур. ' + (hud.level || 1)) + ' · Убито: ' + hud.kills, x, y + hh + 24);
    this.drawWaveHud(C, x, y + hh + 40);
    // Повышение уровня: надпись над героем-HUD, плавно гаснет.
    if (hud.levelFlash > 0) {
      ctx.globalAlpha = Math.min(1, hud.levelFlash);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#7dffb0';
      ctx.font = '700 18px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText('Уровень ' + hud.level + '!', this.w / 2, this.h * 0.42);
      ctx.globalAlpha = 1;
      ctx.textAlign = 'left';
    }
    this.drawBossTitle(C);
    if (!hud.gameMode) this.drawCooldowns(C); // в игре перезарядки показаны дугами вокруг героя
  }

  /** Имя босса при вступлении: по центру чуть ниже босса (он в центре кадра), проявляется и гаснет; кадр слегка темнеет. */
  drawBossTitle(C) {
    const hud = this.hud;
    if (!hud.bossTitle || !(hud.bossTitleAlpha > 0)) return;
    const ctx = this.ctx;
    const a = Math.min(1, hud.bossTitleAlpha);
    ctx.save();
    ctx.globalAlpha = 0.28 * a;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Подгоняем размер, чтобы имя помещалось по ширине узкого экрана.
    ctx.font = '700 30px ui-sans-serif, system-ui, sans-serif';
    const tw = ctx.measureText(hud.bossTitle).width;
    const size = Math.max(14, Math.floor(30 * Math.min(1, (this.w * 0.88) / Math.max(1, tw))));
    ctx.font = '700 ' + size + 'px ui-sans-serif, system-ui, sans-serif';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(7,10,16,0.85)';
    ctx.strokeText(hud.bossTitle, this.w / 2, this.h / 2 + 72);
    ctx.fillStyle = '#d6ecff';
    ctx.fillText(hud.bossTitle, this.w / 2, this.h / 2 + 72);
    ctx.restore();
  }

  /** Сфера блока вокруг героя. Окно парирования подсвечено, к концу блока сфера мигает. */
  drawBlock(hx, hy, C) {
    const d = this.defense;
    if (!d || !d.blocking) return;
    const ctx = this.ctx;
    const left = this.cfg.block.duration - d.blockTime;
    if (left < 0.3 && Math.floor(left * 20) % 2 === 0) return; // мигает: блок вот-вот кончится
    const parry = d.parrying;
    ctx.beginPath();
    ctx.arc(hx, hy, d.blockRadius, 0, TAU);
    ctx.fillStyle = parry ? 'rgba(255,226,122,0.26)' : C.block;
    ctx.fill();
    ctx.lineWidth = parry ? 3 : 2;
    ctx.strokeStyle = parry ? C.parry : C.blockEdge;
    ctx.stroke();
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

  /** Режим «Игра»: две дуги вокруг героя, слева блок, справа рывок. Видны только пока идёт перезарядка. */
  drawCooldownArcs(hx, hy, C) {
    const d = this.defense;
    if (!d) return;
    const ctx = this.ctx;
    const r = this.hero.radius + 9;
    const half = 0.9; // половина угла дуги, рад
    const arc = (center, frac, color) => {
      ctx.lineCap = 'round';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.beginPath();
      ctx.arc(hx, hy, r, center - half, center + half);
      ctx.stroke();
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.arc(hx, hy, r, center - half, center - half + 2 * half * Math.max(0, Math.min(1, frac)));
      ctx.stroke();
      ctx.lineCap = 'butt';
    };
    if (!d.blocking && d.blockCd > 0) arc(Math.PI, 1 - d.blockCd / d.blockCdMax, C.blockEdge);
    if (d.dashCd > 0) arc(0, 1 - d.dashCd / d.dashCdMax, C.accent || C.hpHero);
  }

  /** Индикаторы перезарядки блока и рывка в левом нижнем углу. */
  drawCooldowns(C) {
    const d = this.defense;
    if (!d) return;
    const ctx = this.ctx;
    const x = this.hud.insets.left + 12;
    const bottom = this.h - (this.hud.insets.bottom || 0) - 16;
    const w = 92;
    const bar = (y, label, frac, color) => {
      ctx.fillStyle = C.hpBg;
      ctx.fillRect(x, y, w, 8);
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), 8);
      ctx.fillStyle = C.hud;
      ctx.font = '10px ui-monospace, Menlo, monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(label, x, y - 2);
    };
    const blockFrac = d.blocking
      ? 1 - d.blockTime / this.cfg.block.duration
      : d.blockCd > 0 ? 1 - d.blockCd / d.blockCdMax : 1;
    bar(bottom - 34, d.blocking ? (d.parrying ? 'Блок · парирование!' : 'Блок') : 'Блок', blockFrac,
      d.blocking ? (d.parrying ? C.parry : C.blockEdge) : d.blockCd > 0 ? C.border : C.hpHero);
    const dashFrac = d.dashCd > 0 ? 1 - d.dashCd / d.dashCdMax : 1;
    bar(bottom - 8, 'Рывок', dashFrac, d.dashCd > 0 ? C.border : C.hpHero);
  }

  /** Номер волны, счётчик врагов, крупная надпись на передышке и результат краш-теста. */
  drawWaveHud(C, x, y) {
    const hud = this.hud;
    const ctx = this.ctx;
    if (hud.wave === undefined) return;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '600 13px ui-monospace, Menlo, monospace';
    ctx.fillStyle = C.accent;
    ctx.fillText(hud.crash ? 'Волна ' + hud.wave + ' · КРАШ-ТЕСТ' : 'Волна ' + hud.wave, x, y);
    ctx.font = '11px ui-monospace, Menlo, monospace';
    ctx.fillStyle = C.hud;
    if (hud.crash) {
      ctx.fillText('Врагов ' + hud.alive + (hud.cap ? ' / потолок ' + hud.cap : ''), x, y + 16);
      if (hud.crashResult) {
        ctx.fillStyle = C.hurt;
        ctx.fillText(hud.crashResult, x, y + 32);
      }
    } else if (hud.waveLeft >= 0 && !hud.intermission) {
      ctx.fillText('Осталось ' + hud.waveLeft, x, y + 16);
    }

    // Передышка: крупная надпись по центру, плавно гаснет к концу.
    if (hud.intermission > 0) {
      const t = Math.min(1, hud.intermission / Math.max(0.01, hud.intermissionTotal));
      ctx.globalAlpha = Math.min(1, t * 3);
      ctx.textAlign = 'center';
      ctx.fillStyle = C.accent;
      ctx.font = '700 34px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText('Волна ' + hud.wave, this.w / 2, this.h * 0.28);
      if (hud.crash) {
        ctx.font = '600 15px ui-sans-serif, system-ui, sans-serif';
        ctx.fillStyle = C.hurt;
        ctx.fillText('краш-тест: врагов всё больше, смотри на FPS', this.w / 2, this.h * 0.28 + 30);
      }
      ctx.globalAlpha = 1;
    }
  }
}
