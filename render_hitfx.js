// Эффекты попаданий по врагам. Вид зависит от двух вещей: чем попали (kind) и какая стихия на ударе (el).
//   kind: 'bolt' снаряд, 'pellet' дробинка, 'blade' клинок, 'laser' тик луча, 'aura' тик ауры, 'zap' молния
//   el:   0 без стихии (синий), 1 лёд, 2 огонь, 3 пар, 4 фантом (фиолетовый)
// Частицы лежат в готовом пуле (без создания объектов в бою). Рисует Renderer (hitfx.draw), порождает Game
// по событию 'damage:dealt' (hitfx.spawn). Здесь только вид: на урон и логику это не влияет.

const TAU = Math.PI * 2;

const MAIN = ['#5aa0ff', '#8fdcff', '#ff8a2a', '#ffb870', '#a577ff'];
const CORE = ['#e6f3ff', '#f4fcff', '#ffe6b0', '#fff4e0', '#f0e4ff'];
const GLOW = ['blue', 'blue', undefined, 'gold', true]; // аргумент Renderer.getGlow: undefined = стандартное оранжевое

const T_SPARK = 0;
const T_FLASH = 1;
const T_SHARD = 2;
const T_PUFF = 3;
const T_EMBER = 4;
const T_SLASH = 5;
const T_RIPPLE = 6;
const T_ZIG = 7;
const T_LICK = 8;
const T_STAR = 9;
const T_STREAK = 10;
const T_CHANNEL = 11;
const T_CONE = 12;
const T_ARCW = 13;
const T_CHIP = 14;

function poly(ctx, p, k) {
  ctx.moveTo(p[0] * k, p[1] * k);
  for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i] * k, p[i + 1] * k);
  ctx.closePath();
}

export class HitFx {
  constructor(renderer, size = 480) {
    this.r = renderer;
    this.p = [];
    for (let i = 0; i < size; i++) {
      this.p.push({ on: false, type: 0, el: 0, t: 0, life: 0.3, x: 0, y: 0, vx: 0, vy: 0, size: 6, rot: 0, spin: 0, drag: 0, seed: 0 });
    }
    this.cur = 0;
    this.rnd = Math.random;
    this.glows = [];
  }

  clear() {
    for (const q of this.p) q.on = false;
  }

  add(type, el, x, y, vx, vy, life, size, o) {
    const n = this.p.length;
    for (let i = 0; i < n; i++) {
      const q = this.p[(this.cur + i) % n];
      if (q.on) continue;
      this.cur = (this.cur + i + 1) % n;
      q.on = true;
      q.type = type;
      q.el = el;
      q.t = 0;
      q.life = life;
      q.x = x;
      q.y = y;
      q.vx = vx;
      q.vy = vy;
      q.size = size;
      q.rot = o && o.rot !== undefined ? o.rot : 0;
      q.spin = o && o.spin ? o.spin : 0;
      q.drag = o && o.drag !== undefined ? o.drag : 3;
      q.seed = this.rnd() * 100;
      return q;
    }
    return null;
  }

  /**
   * d: { kind, el, x, y, dx, dy (единичное направление удара), power 0..1 (сила: от числа снарядов), big (крупный) }.
   * Рецепт: общая основа по виду удара плюс добавка стихии.
   */
  spawn(d) {
    const { kind, el, x, y } = d;
    const dx = d.dx;
    const dy = d.dy;
    const pw = d.power || 0;
    const ang = Math.atan2(dy, dx);
    const R = this.rnd;
    const spark = (n, spd, len, spread, life) => {
      for (let i = 0; i < n; i++) {
        const a = ang + Math.PI + (R() - 0.5) * 2 * spread; // брызги назад, навстречу удару
        const s = spd * (0.55 + R() * 0.7);
        this.add(T_SPARK, el, x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.7 + R() * 0.6), len * (0.7 + R() * 0.6), { drag: 5 });
      }
    };
    const embers = (n, spd) => {
      for (let i = 0; i < n; i++) {
        const a = R() * TAU;
        this.add(T_EMBER, el === 3 ? 3 : 2, x + Math.cos(a) * 3, y + Math.sin(a) * 3, Math.cos(a) * spd * R(), Math.sin(a) * spd * R() - 20, 0.4 + R() * 0.4, 1.3 + R() * 1.2, { drag: 2.5 });
      }
    };
    const shards = (n, spd, sz) => {
      for (let i = 0; i < n; i++) {
        const a = ang + Math.PI + (R() - 0.5) * 3;
        const s = spd * (0.5 + R() * 0.8);
        this.add(T_SHARD, 1, x, y, Math.cos(a) * s, Math.sin(a) * s, 0.4 + R() * 0.25, sz * (0.7 + R() * 0.6), { rot: R() * TAU, spin: (R() - 0.5) * 14, drag: 4 });
      }
    };
    const puffs = (n, sz, rise) => {
      for (let i = 0; i < n; i++) {
        const a = R() * TAU;
        this.add(T_PUFF, el, x + Math.cos(a) * 3, y + Math.sin(a) * 3, Math.cos(a) * 12, Math.sin(a) * 12 - rise, 0.5 + R() * 0.3, sz * (0.8 + R() * 0.5), { drag: 2 });
      }
    };
    const lick = (sz) => this.add(T_LICK, 2, x, y + 1, (R() - 0.5) * 10, -26, 0.32, sz, { drag: 1 });

    switch (kind) {
      case 'bolt': {
        this.add(T_FLASH, el, x, y, 0, 0, 0.16, 11 + 7 * pw);
        spark(4 + Math.round(pw * 3), 160, 7 + 4 * pw, 1.0, 0.22);
        if (el === 2) { embers(3, 60); lick(5 + 2 * pw); }
        else if (el === 1) { shards(3, 110, 5); this.add(T_STAR, 1, x, y, 0, 0, 0.3, 7); }
        else if (el === 3) { puffs(2, 11, 14); embers(2, 50); shards(2, 90, 4); }
        else if (el === 4) this.add(T_RIPPLE, 4, x, y, 0, 0, 0.3, 14);
        else this.add(T_STAR, 0, x, y, 0, 0, 0.2, 5);
        break;
      }
      case 'pellet': {
        this.add(T_FLASH, el, x, y, 0, 0, 0.12, 6);
        spark(2, 110, 4.5, 1.2, 0.16);
        if (el === 2) { embers(1, 40); if (R() < 0.5) lick(3); }
        else if (el === 1) shards(1, 70, 3);
        else if (el === 3) puffs(1, 8, 10);
        break;
      }
      case 'blade': { // el: стихия клинка; форма удара по виду клинка
        if (el === 1) { // кристалл: осколки
          this.add(T_FLASH, 1, x, y, 0, 0, 0.18, 12);
          shards(5, 130, 6);
          this.add(T_STAR, 1, x, y, 0, 0, 0.32, 9);
        } else if (el === 2) { // огненная стрела: прокол и язычки
          this.add(T_FLASH, 2, x, y, 0, 0, 0.2, 13);
          this.add(T_SPARK, 2, x - dx * 6, y - dy * 6, dx * 50, dy * 50, 0.2, 22, { drag: 3 });
          lick(7);
          lick(5);
          embers(4, 70);
        } else if (el === 3) { // кристальная стрела: осколки, пар и угольки
          this.add(T_FLASH, 3, x, y, 0, 0, 0.2, 13);
          shards(3, 110, 5);
          puffs(2, 12, 14);
          embers(3, 60);
        } else if (el === 4) { // фантомный клинок
          this.add(T_SLASH, 4, x, y, 0, 0, 0.2, 16, { rot: ang });
          this.add(T_RIPPLE, 4, x, y, 0, 0, 0.3, 12);
          spark(3, 140, 7, 1, 0.2);
        } else { // обычный меч: рассекающий росчерк
          this.add(T_FLASH, 0, x, y, 0, 0, 0.14, 11);
          this.add(T_SLASH, 0, x, y, 0, 0, 0.2, 17, { rot: ang });
          spark(3, 140, 6, 0.9, 0.18);
        }
        break;
      }
      case 'laser': {
        const big = d.big ? 1.6 : 1;
        this.add(T_FLASH, el, x, y, 0, 0, 0.14, 8 * big);
        spark(1, 80, 4, 2, 0.14);
        if (el === 2 && R() < 0.5) embers(1, 40);
        else if (el === 1 && R() < 0.5) shards(1, 60, 3);
        else if (el === 3 && R() < 0.4) puffs(1, 7, 10);
        else if (el === 4) this.add(T_RIPPLE, 4, x, y, 0, 0, 0.22, 8);
        break;
      }
      case 'aura': { // слабая негативная магия: мягкая рябь негатива и тёмные искры
        this.add(T_RIPPLE, el === 0 ? 4 : el, x, y, 0, 0, 0.45, 15);
        if (el === 2) embers(2, 40);
        else if (el === 1) shards(1, 40, 3);
        else if (el === 3) puffs(1, 8, 10);
        else embers(1, 25);
        break;
      }
      case 'zap': { // молния: ломаная вспышка и белый удар
        this.add(T_FLASH, 0, x, y, 0, 0, 0.14, 16);
        this.add(T_ZIG, el, x, y, dx * 26, dy * 26, 0.14, 2);
        this.add(T_ZIG, el, x, y, -dx * 20 + dy * 14, -dy * 20 - dx * 14, 0.12, 1.6);
        spark(4, 190, 6, 3, 0.2);
        break;
      }
      case 'through': { // снаряд прошил врага насквозь: канал через тело, вспышка-выброс на выходе, конус обломков
        const lg = d.src === 'laser' ? 0.5 : d.src === 'pellet' ? 0.65 : d.big ? 1.25 : 1; // лазер бьёт часто, дробь мелкая
        const heavy = lg >= 0.9;
        const L = d.len;
        const fwd = (n, spd, len, spread, life, t0, o) => {
          for (let i = 0; i < n; i++) {
            const a = ang + (R() - 0.5) * 2 * spread;
            const s = spd * (0.6 + R() * 0.7);
            this.add(t0, el, x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.7 + R() * 0.6), len * (0.7 + R() * 0.6), o || { drag: 4, rot: R() * TAU, spin: (R() - 0.5) * 12 });
          }
        };
        // канал: тёмная рана через всё тело с раскалённой кромкой, затягивается от входа к выходу
        this.add(T_CHANNEL, el, x, y, 0, 0, heavy ? 0.45 : 0.28, L * (d.src === 'blade' ? 1.1 : 1), { rot: ang });
        this.add(T_STREAK, el, x, y, 0, 0, 0.22, L * 0.8, { rot: ang });
        if (heavy) this.add(T_CONE, el, x, y, 0, 0, 0.22, 46 + 22 * pw, { rot: ang });
        this.add(T_ARCW, el, x, y, 0, 0, 0.3, (heavy ? 34 : 20) * lg, { rot: ang });
        this.add(T_FLASH, el, x, y, 0, 0, 0.2, (12 + 6 * pw) * lg);
        this.add(T_STAR, el, x, y, 0, 0, 0.24, 11 * lg, { rot: ang });
        fwd(Math.max(2, Math.round(7 * lg)), 260, 10, 0.55, 0.26, T_SPARK);
        // обломки: тёмные грани с подсветкой, конусом вперёд (сквозь врага и дальше)
        fwd(heavy ? 7 : Math.round(3 * lg), 190, 4.2, 0.5, 0.5, T_CHIP);
        if (el === 2) { fwd(Math.round(4 * lg), 90, 1.9, 1.3, 0.55, T_EMBER); if (heavy) this.add(T_LICK, 2, x, y, dx * 14, dy * 14 - 20, 0.34, 8, { drag: 1 }); }
        else if (el === 1) fwd(Math.round(4 * lg), 170, 5.5, 0.6, 0.5, T_SHARD);
        else if (el === 3) { fwd(Math.round(3 * lg), 100, 2.2, 1, 0.55, T_EMBER); this.add(T_PUFF, 3, x + dx * 5, y + dy * 5, dx * 46, dy * 46, 0.6, 14 * lg, { drag: 2 }); }
        else if (el === 4) { this.add(T_RIPPLE, 4, x, y, 0, 0, 0.32, 17 * lg); if (heavy) this.add(T_PUFF, 4, x + dx * 5, y + dy * 5, dx * 30, dy * 30, 0.6, 11, { drag: 2 }); }
        break;
      }
      default: break;
    }
  }

  draw(ctx, dt) {
    const P = this.p;
    const r = this.r;
    const puff = r.getPuff();
    const glows = this.glows;
    const gl = (el) => glows[el] || (glows[el] = r.getGlow(GLOW[el]));
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (let i = 0; i < P.length; i++) {
      const q = P[i];
      if (!q.on) continue;
      q.t += dt;
      if (q.t >= q.life) { q.on = false; continue; }
      const k = q.t / q.life;
      const e = q.el;
      if (q.type !== T_FLASH && q.type !== T_SLASH && q.type !== T_RIPPLE && q.type !== T_STREAK && q.type !== T_CHANNEL && q.type !== T_CONE && q.type !== T_ARCW) {
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        const dr = Math.exp(-q.drag * dt);
        q.vx *= dr;
        q.vy *= dr;
      }
      const a1 = 1 - k;
      switch (q.type) {
        case T_SPARK: {
          const sp = Math.hypot(q.vx, q.vy) || 1;
          const len = q.size * (0.35 + 0.65 * a1);
          const ux = q.vx / sp;
          const uy = q.vy / sp;
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = MAIN[e];
          ctx.globalAlpha = 0.55 * a1;
          ctx.lineWidth = 3.2;
          ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x - ux * len, q.y - uy * len); ctx.stroke();
          ctx.strokeStyle = CORE[e];
          ctx.globalAlpha = a1;
          ctx.lineWidth = 1.3;
          ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x - ux * len, q.y - uy * len); ctx.stroke();
          break;
        }
        case T_FLASH: {
          const s = q.size * (0.55 + 0.9 * k);
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.95 * a1 * a1;
          ctx.drawImage(gl(e), q.x - s, q.y - s, s * 2, s * 2);
          break;
        }
        case T_SHARD: {
          q.rot += q.spin * dt;
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = a1;
          ctx.save();
          ctx.translate(q.x, q.y);
          ctx.rotate(q.rot);
          const s = q.size;
          ctx.fillStyle = '#7fcfff';
          ctx.beginPath(); poly(ctx, [s, 0, -s * 0.4, -s * 0.38, -s * 0.4, s * 0.38], 1); ctx.fill();
          ctx.fillStyle = '#eaf9ff';
          ctx.beginPath(); poly(ctx, [s, 0, -s * 0.4, -s * 0.38, -s * 0.1, 0], 1); ctx.fill();
          ctx.restore();
          break;
        }
        case T_PUFF: {
          const s = q.size * (0.7 + 1.1 * k);
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 0.42 * a1 * Math.min(1, k * 8 + 0.5);
          ctx.drawImage(puff, q.x - s, q.y - s, s * 2, s * 2);
          break;
        }
        case T_EMBER: {
          q.vy -= 35 * dt;
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = a1;
          ctx.fillStyle = e === 3 ? '#ffc890' : '#ffb04a';
          ctx.beginPath(); ctx.arc(q.x, q.y, q.size * (1 - 0.4 * k), 0, TAU); ctx.fill();
          break;
        }
        case T_SLASH: {
          const R0 = q.size * (0.7 + 0.5 * k);
          const span = 1.0;
          ctx.save();
          ctx.translate(q.x, q.y);
          ctx.rotate(q.rot);
          ctx.globalCompositeOperation = 'lighter';
          const n = 8;
          const pts = [];
          for (let j = 0; j <= n; j++) { const a = -span + (2 * span * j) / n; pts.push(Math.cos(a) * R0 - R0 * 0.55, Math.sin(a) * R0); }
          for (let j = n; j >= 0; j--) { const v = j / n; const a = -span + 2 * span * v; const rr = R0 * (1 - 0.3 * Math.sin(Math.PI * v)); pts.push(Math.cos(a) * rr - R0 * 0.55, Math.sin(a) * rr); }
          ctx.globalAlpha = 0.5 * a1;
          ctx.fillStyle = MAIN[e];
          ctx.beginPath(); poly(ctx, pts, 1.12); ctx.fill();
          ctx.globalAlpha = 0.95 * a1;
          ctx.fillStyle = CORE[e];
          ctx.beginPath(); poly(ctx, pts, 1); ctx.fill();
          ctx.restore();
          break;
        }
        case T_RIPPLE: {
          const rr = q.size * (0.35 + 0.9 * k);
          ctx.globalCompositeOperation = 'difference';
          ctx.strokeStyle = '#ffffff';
          ctx.globalAlpha = 0.07 * a1;
          ctx.lineWidth = 6;
          ctx.beginPath(); ctx.arc(q.x, q.y, rr, 0, TAU); ctx.stroke();
          ctx.globalAlpha = 0.12 * a1;
          ctx.lineWidth = 2.4;
          ctx.beginPath(); ctx.arc(q.x, q.y, rr, 0, TAU); ctx.stroke();
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = MAIN[e];
          ctx.globalAlpha = 0.3 * a1;
          ctx.lineWidth = 1.1;
          ctx.beginPath(); ctx.arc(q.x, q.y, rr, 0, TAU); ctx.stroke();
          break;
        }
        case T_ZIG: {
          const steps = 5;
          const fl = Math.floor(q.t * 60) + q.seed; // ломаная перерисовывается в 60 Гц: дрожит
          ctx.globalCompositeOperation = 'lighter';
          for (let pass = 0; pass < 2; pass++) {
            ctx.strokeStyle = pass ? '#ffffff' : '#7fb8ff';
            ctx.globalAlpha = a1 * (pass ? 1 : 0.6);
            ctx.lineWidth = pass ? 1.2 : 3.4;
            ctx.beginPath();
            ctx.moveTo(q.x, q.y);
            for (let j = 1; j <= steps; j++) {
              const h = Math.sin((fl + j) * 12.9898) * 43758.5453;
              const jit = (h - Math.floor(h) - 0.5) * 3 * q.size;
              const f = j / steps;
              ctx.lineTo(q.x + q.vx * f + (j < steps ? jit : 0), q.y + q.vy * f + (j < steps ? -jit : 0));
            }
            ctx.stroke();
          }
          break;
        }
        case T_LICK: {
          q.vy -= 10 * dt;
          const h = q.size * (1.2 + 0.4 * Math.sin(q.t * 40)) * (1 - 0.5 * k);
          const w = q.size * 0.45;
          ctx.save();
          ctx.translate(q.x, q.y);
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 0.9 * a1;
          ctx.fillStyle = '#ff7a2a';
          ctx.beginPath(); poly(ctx, [-w, 0, -w * 0.5, -h * 0.5, 0, -h, w * 0.5, -h * 0.55, w, 0], 1); ctx.fill();
          ctx.fillStyle = '#ffc24a';
          ctx.beginPath(); poly(ctx, [-w * 0.5, 0, -w * 0.25, -h * 0.35, 0, -h * 0.68, w * 0.25, -h * 0.38, w * 0.5, 0], 1); ctx.fill();
          ctx.restore();
          break;
        }
        case T_STAR: {
          const s = q.size * (1 - 0.3 * k);
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = a1;
          ctx.fillStyle = CORE[e];
          ctx.beginPath(); poly(ctx, [q.x, q.y - s, q.x + s * 0.22, q.y, q.x, q.y + s, q.x - s * 0.22, q.y], 1); ctx.fill();
          ctx.beginPath(); poly(ctx, [q.x - s, q.y, q.x, q.y - s * 0.22, q.x + s, q.y, q.x, q.y + s * 0.22], 1); ctx.fill();
          break;
        }
        case T_STREAK: { // раскалённый след через тело: острый у входа, расширяется к выходу, гаснет с хвоста
          const L = q.size;
          const w = 1.6 + 2.2 * a1;
          ctx.save();
          ctx.translate(q.x, q.y);
          ctx.rotate(q.rot);
          ctx.globalCompositeOperation = 'lighter';
          const tail = -L * (1 - Math.min(1, k * 2.2) * 0.7); // хвост догоняет голову
          const g1 = ctx.createLinearGradient(tail, 0, 0, 0);
          g1.addColorStop(0, 'rgba(0,0,0,0)');
          g1.addColorStop(1, MAIN[e]);
          ctx.globalAlpha = 0.75 * a1;
          ctx.fillStyle = g1;
          ctx.beginPath(); poly(ctx, [tail, 0, 0, -w * 1.5, w * 2.2, 0, 0, w * 1.5], 1); ctx.fill();
          const g2 = ctx.createLinearGradient(tail, 0, 0, 0);
          g2.addColorStop(0, 'rgba(0,0,0,0)');
          g2.addColorStop(1, CORE[e]);
          ctx.globalAlpha = a1;
          ctx.fillStyle = g2;
          ctx.beginPath(); poly(ctx, [tail * 0.9, 0, 0, -w * 0.6, w * 1.6, 0, 0, w * 0.6], 1); ctx.fill();
          ctx.restore();
          break;
        }
        case T_CHANNEL: { // рана через тело: x=выход, уходит назад на size; затягивается с входного конца
          const L = q.size;
          const tail = -L * (1 - Math.min(1, k * 1.4));
          const open = k < 0.18 ? 1 : 1 - (k - 0.18) / 0.82; // раскрытие потом сужение
          ctx.save();
          ctx.translate(q.x, q.y);
          ctx.rotate(q.rot);
          ctx.lineCap = 'round';
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 0.6 * open;
          ctx.strokeStyle = '#070d1c';
          ctx.lineWidth = 4.2 * open + 0.6;
          ctx.beginPath(); ctx.moveTo(tail, 0); ctx.lineTo(0, 0); ctx.stroke();
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = MAIN[e];
          ctx.globalAlpha = 0.55 * open;
          ctx.lineWidth = 6.5 * open + 1;
          ctx.beginPath(); ctx.moveTo(tail, 0); ctx.lineTo(0, 0); ctx.stroke();
          const gh = ctx.createLinearGradient(tail, 0, 0, 0);
          gh.addColorStop(0, 'rgba(255,255,255,0)');
          gh.addColorStop(1, CORE[e]);
          ctx.strokeStyle = gh;
          ctx.globalAlpha = Math.max(0, 1 - k * 2.6);
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(tail, 0); ctx.lineTo(0, 0); ctx.stroke();
          ctx.restore();
          break;
        }
        case T_CONE: { // выброс на выходе: расширяющийся клин света вперёд
          const Lc = q.size * (0.5 + 0.7 * Math.min(1, k * 3));
          const hw = Lc * (0.32 + 0.25 * k);
          ctx.save();
          ctx.translate(q.x, q.y);
          ctx.rotate(q.rot);
          ctx.globalCompositeOperation = 'lighter';
          const g = ctx.createLinearGradient(0, 0, Lc, 0);
          g.addColorStop(0, CORE[e]);
          g.addColorStop(0.35, MAIN[e]);
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.globalAlpha = 0.85 * a1 * a1;
          ctx.fillStyle = g;
          ctx.beginPath(); poly(ctx, [0, -hw * 0.18, Lc * 0.55, -hw * 0.7, Lc, -hw * 0.25, Lc * 0.8, 0, Lc, hw * 0.3, Lc * 0.5, hw * 0.75, 0, hw * 0.18], 1); ctx.fill();
          ctx.restore();
          break;
        }
        case T_ARCW: { // ударная дуга, выгнутая вперёд, перпендикулярно полёту
          const rr = q.size * (0.3 + 0.9 * k);
          ctx.save();
          ctx.translate(q.x, q.y);
          ctx.rotate(q.rot);
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = MAIN[e];
          ctx.globalAlpha = 0.6 * a1;
          ctx.lineWidth = 2.2 * a1 + 0.5;
          ctx.beginPath(); ctx.ellipse(rr * 0.2, 0, rr * 0.55, rr, 0, -1.25, 1.25); ctx.stroke();
          ctx.strokeStyle = CORE[e];
          ctx.globalAlpha = 0.9 * a1;
          ctx.lineWidth = 0.9;
          ctx.beginPath(); ctx.ellipse(rr * 0.2, 0, rr * 0.55, rr, 0, -1.25, 1.25); ctx.stroke();
          ctx.restore();
          break;
        }
        case T_CHIP: { // низкополигональный обломок: тёмная грань, светлая кромка цвета стихии
          q.rot += q.spin * dt;
          const s = q.size;
          ctx.save();
          ctx.translate(q.x, q.y);
          ctx.rotate(q.rot);
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = a1;
          ctx.fillStyle = '#1a2a48';
          ctx.beginPath(); poly(ctx, [s, 0, -s * 0.2, -s * 0.7, -s * 0.8, s * 0.1, -s * 0.1, s * 0.6], 1); ctx.fill();
          ctx.fillStyle = '#3b5a8c';
          ctx.beginPath(); poly(ctx, [s, 0, -s * 0.2, -s * 0.7, -s * 0.1, -s * 0.05], 1); ctx.fill();
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = MAIN[e];
          ctx.globalAlpha = 0.8 * a1;
          ctx.lineWidth = 0.9;
          ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(-s * 0.2, -s * 0.7); ctx.stroke();
          ctx.restore();
          break;
        }
        default: break;
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}
