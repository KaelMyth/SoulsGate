// Эффекты рывков: обычный и кинетический (с огнём, морозом, паром), костры огненного шлейфа, герой-молния.
//   kind стихии рывка: 0 без стихии (холодный белый), 1 огонь, 2 мороз, 3 пар.
// Рывок-молния красится своей палитрой: 0 жёлтая, 1 огонь, 2 мороз, 3 белая.
// Частицы лежат в готовом пуле. Состояние берём из героя (dashing, glideTime, lightdash.active); игре нужно
// лишь выставить renderer.dashKind и renderer.dashKinetic. Здесь только вид, на логику не влияет.

const TAU = Math.PI * 2;

const MAIN = ['#8fb4e8', '#ff8a2a', '#8fdcff', '#e6eef8', '#ffe45a', '#ff9a3a', '#7fd8ff', '#ffffff'];
const CORE = ['#eef6ff', '#ffe6b0', '#f4fcff', '#ffffff', '#fffbe0', '#fff0d0', '#f4fcff', '#ffffff'];
const GLOW = ['blue', undefined, 'blue', 'gold', 'gold', undefined, 'blue', 'gold'];

const T_SPARK = 0;
const T_PUFF = 1;
const T_EMBER = 2;
const T_LINE = 3;
const T_RING = 4;
const T_FLASH = 5;
const T_SHARD = 6;
const T_CHIP = 7;
const T_AFTER = 8;
const T_FLAME = 9;

function poly(ctx, p) {
  ctx.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
  ctx.closePath();
}

export class DashFx {
  constructor(renderer, size = 300) {
    this.r = renderer;
    this.p = [];
    for (let i = 0; i < size; i++) this.p.push({ on: false, type: 0, c: 0, t: 0, life: 0.3, x: 0, y: 0, vx: 0, vy: 0, size: 6, rot: 0, spin: 0, drag: 3, ex: 1 });
    this.cur = 0;
    this.rnd = Math.random;
    this.glows = [];
    this.wasDash = false;
    this.wasLight = false;
    this.acc = 0;
    this.lx = 0;
    this.ly = 0;
    this.dx = 1;
    this.dy = 0;
    this.kind = 0;
  }

  clear() {
    for (const q of this.p) q.on = false;
    this.wasDash = false;
    this.wasLight = false;
  }

  add(type, c, x, y, vx, vy, life, size, o) {
    const n = this.p.length;
    for (let i = 0; i < n; i++) {
      const q = this.p[(this.cur + i) % n];
      if (q.on) continue;
      this.cur = (this.cur + i + 1) % n;
      q.on = true;
      q.type = type;
      q.c = c;
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
      q.ex = o && o.ex !== undefined ? o.ex : 1;
      return q;
    }
    return null;
  }

  /** Старт рывка: облачко снега за спиной, веер штрихов и вспышка у ног. */
  start(x, y, dx, dy, kind, kinetic) {
    const R = this.rnd;
    const ang = Math.atan2(dy, dx);
    const pw = kinetic ? 1 : 0.6;
    for (let i = 0; i < 5; i++) {
      const a = ang + Math.PI + (R() - 0.5) * 1.5;
      this.add(T_PUFF, kind, x + (R() - 0.5) * 8, y + 6, Math.cos(a) * (40 + R() * 50), Math.sin(a) * (22 + R() * 25) * 0.6, 0.45 + R() * 0.25, (7 + R() * 5) * pw, { drag: 3 });
    }
    for (let i = 0; i < 6; i++) {
      const a = ang + Math.PI + (R() - 0.5) * 1.1;
      const s = 140 + R() * 160;
      this.add(T_SPARK, kind, x, y, Math.cos(a) * s, Math.sin(a) * s, 0.2 + R() * 0.12, 9 + R() * 8, { drag: 5 });
    }
    this.add(T_RING, kind, x, y + 6, 0, 0, 0.3, 26 * pw, { ex: 0.45 });
    if (kind === 1) for (let i = 0; i < 5; i++) this.add(T_EMBER, 1, x, y, (R() - 0.5) * 60 - dx * 40, (R() - 0.5) * 60 - dy * 40 - 20, 0.4 + R() * 0.3, 1.5 + R(), { drag: 2 });
  }

  /** Конец кинетического рывка: ударная волна по земле, пыль, обломки и стихия вокруг. */
  land(x, y, kind, radius) {
    const R = this.rnd;
    this.add(T_RING, kind, x, y + 6, 0, 0, 0.45, radius, { ex: 0.5 });
    this.add(T_RING, kind, x, y + 6, 0, 0, 0.32, radius * 0.6, { ex: 0.5 });
    this.add(T_FLASH, kind, x, y, 0, 0, 0.22, 26);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + R() * 0.5;
      this.add(T_PUFF, kind, x + Math.cos(a) * 10, y + 6 + Math.sin(a) * 5, Math.cos(a) * (70 + R() * 50), Math.sin(a) * (40 + R() * 25), 0.5 + R() * 0.3, 8 + R() * 6, { drag: 3.5 });
    }
    for (let i = 0; i < 7; i++) {
      const a = R() * TAU;
      const s = 90 + R() * 110;
      this.add(T_CHIP, kind, x, y, Math.cos(a) * s, Math.sin(a) * s * 0.7 - 30, 0.4 + R() * 0.25, 2.6 + R() * 2.2, { rot: R() * TAU, spin: (R() - 0.5) * 14, drag: 3.5 });
    }
    if (kind === 1) for (let i = 0; i < 10; i++) { const a = R() * TAU; this.add(T_EMBER, 1, x, y, Math.cos(a) * 90 * R(), Math.sin(a) * 60 * R() - 25, 0.5 + R() * 0.4, 1.6 + R() * 1.2, { drag: 2.2 }); }
    else if (kind === 2) for (let i = 0; i < 8; i++) { const a = R() * TAU; this.add(T_SHARD, 2, x, y, Math.cos(a) * 130, Math.sin(a) * 90 - 20, 0.5 + R() * 0.3, 4 + R() * 3, { rot: R() * TAU, spin: (R() - 0.5) * 12, drag: 3.5 }); }
    else if (kind === 3) for (let i = 0; i < 4; i++) { const a = R() * TAU; this.add(T_PUFF, 3, x, y, Math.cos(a) * 40, Math.sin(a) * 28 - 20, 0.8, 14, { drag: 2 }); }
  }

  /** Каждый кадр: рождаем события по состоянию героя и рисуем всё. */
  frame(ctx, dt, hx, hy) {
    const r = this.r;
    const hero = r.hero;
    const light = !!(r.lightdash && r.lightdash.active);
    const dashing = !!hero.dashing && !light && !r.gravityDash?.charging;
    const kinetic = !!r.dashKinetic;
    const kind = light ? (r.lightdash.kind | 0) : (kinetic ? r.dashKind | 0 : 0);
    const R = this.rnd;
    if (hero.active) {
      if (dashing && !this.wasDash) {
        let dx = hero.dashVx;
        let dy = hero.dashVy;
        const L = Math.hypot(dx, dy);
        if (L > 1e-3) { dx /= L; dy /= L; } else { dx = Math.cos(hero.facing); dy = Math.sin(hero.facing); }
        this.dx = dx;
        this.dy = dy;
        this.start(hx, hy, dx, dy, kind, kinetic);
        this.kind = kind;
        this.lx = hx;
        this.ly = hy;
        this.acc = 0;
      }
      // Приземление генерируется игровым событием, одновременно с реальным импульсом по врагам.
      if (light && !this.wasLight) { this.add(T_FLASH, kind + 4, hx, hy, 0, 0, 0.25, 34); this.add(T_RING, kind + 4, hx, hy + 6, 0, 0, 0.3, 36, { ex: 0.5 }); }
      if (!light && this.wasLight) { this.add(T_FLASH, this.kind + 4, hx, hy, 0, 0, 0.3, 40); this.add(T_RING, this.kind + 4, hx, hy + 6, 0, 0, 0.4, 60, { ex: 0.5 }); for (let i = 0; i < 8; i++) { const a = R() * TAU; this.add(T_SPARK, this.kind + 4, hx, hy, Math.cos(a) * 200, Math.sin(a) * 200, 0.3, 10, { drag: 5 }); } }
      if (light) this.kind = kind;
      this.wasDash = dashing;
      this.wasLight = light;
      // Удары молнии по врагам: вспышка и искры в точке попадания.
      if (r.lightdash) {
        const bl = r.lightdash.bolts;
        for (let i = 0; i < bl.length; i++) {
          const b = bl[i];
          if (b.fx) continue;
          b.fx = true;
          const c = (b.k | 0) + 4;
          this.add(T_FLASH, c, b.x1, b.y1, 0, 0, 0.22, 30);
          this.add(T_RING, c, b.x1, b.y1 + 4, 0, 0, 0.3, 30, { ex: 0.6 });
          for (let j = 0; j < 6; j++) { const a = R() * TAU; this.add(T_SPARK, c, b.x1, b.y1, Math.cos(a) * 220, Math.sin(a) * 220, 0.25, 9, { drag: 5 }); }
        }
      }
      // Полёт: штрихи скорости, стихия за спиной.
      const sp = Math.hypot(hero.vx + (hero.dashVx || 0), hero.vy + (hero.dashVy || 0));
      const moving = dashing || (!light && hero.glideTime > 0 && sp > 160);
      if (light) {
        const d = Math.hypot(hx - this.lx, hy - this.ly);
        this.acc += d;
        if (this.acc > 10) { this.acc = 0; this.add(T_AFTER, kind + 4, hx, hy, 0, 0, 0.28, 15); }
        if (R() < dt * 55) { const a = R() * TAU; this.add(T_SPARK, kind + 4, hx + Math.cos(a) * 8, hy + Math.sin(a) * 8, Math.cos(a) * 120, Math.sin(a) * 120, 0.2, 8, { drag: 4 }); }
      } else if (moving) {
        const pw = kinetic ? 1 : 0.55;
        const rate = (kinetic ? 70 : 38) * dt;
        const dx = this.dx;
        const dy = this.dy;
        const nx = -dy;
        const ny = dx;
        if (R() < rate) {
          const o = (R() - 0.5) * 2 * hero.radius * 1.7;
          this.add(T_LINE, kind, hx + nx * o - dx * 6, hy + ny * o - dy * 6, -dx * 60, -dy * 60, 0.22, 26 + R() * 30, { rot: Math.atan2(dy, dx), drag: 1 });
        }
        if (kind === 1 && R() < 60 * dt * pw) this.add(T_FLAME, 1, hx - dx * 8 + (R() - 0.5) * 8, hy - dy * 8 + (R() - 0.5) * 8 + 4, -dx * 30, -dy * 30 - 20, 0.35, 8 + R() * 4, { drag: 2 });
        if (kind === 1 && R() < 40 * dt) this.add(T_EMBER, 1, hx - dx * 10, hy - dy * 10, -dx * 40 + (R() - 0.5) * 40, -dy * 40 - 25, 0.5 + R() * 0.4, 1.4 + R(), { drag: 2 });
        if (kind === 2 && R() < 45 * dt) this.add(T_SHARD, 2, hx - dx * 8 + (R() - 0.5) * 12, hy - dy * 8 + (R() - 0.5) * 12, -dx * 20, -dy * 20 + 10, 0.5, 3 + R() * 2.5, { rot: R() * TAU, spin: (R() - 0.5) * 8, drag: 2 });
        if (kind === 3 && R() < 40 * dt) this.add(T_PUFF, 3, hx - dx * 10, hy - dy * 10 + 3, -dx * 25, -dy * 25 - 18, 0.55, 8 + R() * 4, { drag: 2 });
        if (kind === 0 && kinetic && R() < 30 * dt) this.add(T_SPARK, 0, hx - dx * 8, hy - dy * 8, -dx * 90 + (R() - 0.5) * 60, -dy * 90 + (R() - 0.5) * 60, 0.22, 7, { drag: 5 });
      }
      this.lx = hx;
      this.ly = hy;
    }
    this.draw(ctx, dt);
  }

  draw(ctx, dt) {
    const P = this.p;
    const r = this.r;
    const puff = r.getPuff();
    const gl = (c) => this.glows[c] || (this.glows[c] = r.getGlow(GLOW[c]));
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (let i = 0; i < P.length; i++) {
      const q = P[i];
      if (!q.on) continue;
      q.t += dt;
      if (q.t >= q.life) { q.on = false; continue; }
      const k = q.t / q.life;
      const a1 = 1 - k;
      const c = q.c;
      if (q.type !== T_RING && q.type !== T_FLASH && q.type !== T_AFTER) {
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        const dr = Math.exp(-q.drag * dt);
        q.vx *= dr;
        q.vy *= dr;
      }
      switch (q.type) {
        case T_SPARK: {
          const sp = Math.hypot(q.vx, q.vy) || 1;
          const len = q.size * (0.35 + 0.65 * a1);
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = MAIN[c];
          ctx.globalAlpha = 0.5 * a1;
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x - (q.vx / sp) * len, q.y - (q.vy / sp) * len); ctx.stroke();
          ctx.strokeStyle = CORE[c];
          ctx.globalAlpha = a1;
          ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x - (q.vx / sp) * len, q.y - (q.vy / sp) * len); ctx.stroke();
          break;
        }
        case T_PUFF: {
          const s = q.size * (0.7 + 1.2 * k);
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 0.34 * a1 * Math.min(1, k * 8 + 0.4);
          ctx.drawImage(puff, q.x - s, q.y - s, s * 2, s * 2);
          break;
        }
        case T_EMBER: {
          q.vy -= 40 * dt;
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = a1;
          ctx.fillStyle = '#ffb04a';
          ctx.beginPath(); ctx.arc(q.x, q.y, q.size * (1 - 0.4 * k), 0, TAU); ctx.fill();
          break;
        }
        case T_LINE: { // штрих скорости: тонкая светлая нить, гаснет с хвоста
          const L = q.size * (1 - 0.3 * k);
          const ux = Math.cos(q.rot);
          const uy = Math.sin(q.rot);
          const g = ctx.createLinearGradient(q.x, q.y, q.x - ux * L, q.y - uy * L);
          g.addColorStop(0, CORE[c]);
          g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.65 * a1;
          ctx.strokeStyle = g;
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x - ux * L, q.y - uy * L); ctx.stroke();
          break;
        }
        case T_RING: { // кольцо по земле: вытянуто вширь, тень внутри и светлая кромка
          const rr = q.size * (0.2 + 0.8 * (1 - a1 * a1));
          ctx.save();
          ctx.translate(q.x, q.y);
          ctx.scale(1, q.ex);
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = MAIN[c];
          ctx.globalAlpha = 0.5 * a1;
          ctx.lineWidth = 4 * a1 + 1;
          ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.stroke();
          ctx.strokeStyle = CORE[c];
          ctx.globalAlpha = 0.85 * a1;
          ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.stroke();
          ctx.restore();
          break;
        }
        case T_FLASH: {
          const s = q.size * (0.55 + 0.9 * k);
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.95 * a1 * a1;
          ctx.drawImage(gl(c), q.x - s, q.y - s, s * 2, s * 2);
          break;
        }
        case T_AFTER: { // остаточный свет молнии: гаснущий шарик
          const s = q.size * (1 - 0.5 * k);
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.7 * a1;
          ctx.drawImage(gl(c), q.x - s, q.y - s, s * 2, s * 2);
          ctx.globalAlpha = 0.9 * a1;
          ctx.fillStyle = CORE[c];
          ctx.beginPath(); ctx.arc(q.x, q.y, s * 0.18, 0, TAU); ctx.fill();
          break;
        }
        case T_SHARD: {
          q.rot += q.spin * dt;
          const s = q.size;
          ctx.save();
          ctx.translate(q.x, q.y);
          ctx.rotate(q.rot);
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = a1;
          ctx.fillStyle = '#7fcfff';
          ctx.beginPath(); poly(ctx, [s, 0, -s * 0.4, -s * 0.38, -s * 0.4, s * 0.38]); ctx.fill();
          ctx.fillStyle = '#eaf9ff';
          ctx.beginPath(); poly(ctx, [s, 0, -s * 0.4, -s * 0.38, -s * 0.1, 0]); ctx.fill();
          ctx.restore();
          break;
        }
        case T_CHIP: {
          q.rot += q.spin * dt;
          const s = q.size;
          ctx.save();
          ctx.translate(q.x, q.y);
          ctx.rotate(q.rot);
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = a1;
          ctx.fillStyle = '#1a2a48';
          ctx.beginPath(); poly(ctx, [s, 0, -s * 0.2, -s * 0.7, -s * 0.8, s * 0.1, -s * 0.1, s * 0.6]); ctx.fill();
          ctx.fillStyle = '#3b5a8c';
          ctx.beginPath(); poly(ctx, [s, 0, -s * 0.2, -s * 0.7, -s * 0.1, -s * 0.05]); ctx.fill();
          ctx.restore();
          break;
        }
        case T_FLAME: {
          q.vy -= 30 * dt;
          const h = q.size * (1.3 - 0.8 * k);
          const w = q.size * 0.5 * (1 - 0.4 * k);
          ctx.save();
          ctx.translate(q.x, q.y);
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.85 * a1;
          ctx.fillStyle = '#ff7a2a';
          ctx.beginPath(); poly(ctx, [-w, 0, -w * 0.5, -h * 0.5, 0, -h, w * 0.5, -h * 0.55, w, 0]); ctx.fill();
          ctx.fillStyle = '#ffd36a';
          ctx.beginPath(); poly(ctx, [-w * 0.5, 0, -w * 0.25, -h * 0.35, 0, -h * 0.65, w * 0.25, -h * 0.38, w * 0.5, 0]); ctx.fill();
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

  /** Герой-молния: сжатый сгусток с зубчатым ореолом и белым ядром. */
  drawLightHero(ctx, hx, hy, kind) {
    const r = this.r;
    const t = r.clock;
    const R0 = r.hero.radius;
    const c = (kind | 0) + 4;
    const g = this.glows[c] || (this.glows[c] = r.getGlow(GLOW[c]));
    ctx.save();
    ctx.translate(hx, hy);
    ctx.globalCompositeOperation = 'lighter';
    if (r.lightdash?.laserMode) {
      const ld = r.lightdash;
      const target = ld.route[ld.idx];
      const dx = (target?.x ?? hx) - ld.fromX, dy = (target?.y ?? hy) - ld.fromY;
      const angle = Math.atan2(dy, dx);
      const charging = ld.phase === 'charge';
      const hop = ld.phase === 'hop';
      const tension = charging ? Math.min(1, ld.t / Math.max(0.01, r.cfg.kinetic.beamTime)) : 1;
      const elongation = hop ? 3.6 : charging ? 1 + tension * 1.8 : 1.3;
      ctx.rotate(angle);
      for (let layer = 0; layer < 3; layer++) {
        ctx.globalAlpha = (layer ? 0.44 : 0.2) * (0.7 + 0.3 * Math.sin(t * 23 + layer));
        ctx.fillStyle = layer === 0 ? MAIN[c] : layer === 1 ? '#8bdcff' : '#ffffff';
        ctx.beginPath();
        ctx.ellipse(-R0 * elongation * 0.65, 0, R0 * elongation * (layer ? 1.15 : 1.7), R0 * (layer === 2 ? 0.42 : 0.8), 0, 0, TAU);
        ctx.fill();
      }
      for (let j = 0; j < 9; j++) {
        const u = (t * (4 + j * 0.16) + j / 9) % 1;
        const x = -R0 * (2.7 + elongation * u);
        const y = Math.sin(j * 2.4 + t * 11) * R0 * (0.32 + u * 0.65);
        ctx.globalAlpha = (1 - u) * (hop ? 0.85 : 0.5 * tension);
        ctx.strokeStyle = j % 2 ? '#b3e8ff' : MAIN[c];
        ctx.lineWidth = 1.2 + 2.7 * (1 - u);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + R0 * 1.1, y * 0.25, R0 * 0.7, 0); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(0, 0, R0 * (hop ? 1.3 : 0.85), R0 * 0.45, 0, 0, TAU); ctx.fill();
      ctx.restore();
      return;
    }
    const s = R0 * (3.4 + 0.25 * Math.sin(t * 40));
    ctx.globalAlpha = 0.9;
    ctx.drawImage(g, -s, -s, s * 2, s * 2);
    // Зубчатый ореол: ломаная вокруг ядра, перерисовывается 30 раз в секунду.
    const fr = Math.floor(t * 30);
    ctx.lineJoin = 'round';
    for (let pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass ? CORE[c] : MAIN[c];
      ctx.globalAlpha = pass ? 0.95 : 0.6;
      ctx.lineWidth = pass ? 1.1 : 3;
      ctx.beginPath();
      const n = 11;
      for (let j = 0; j <= n; j++) {
        const h = Math.sin((fr * 7.3 + j * 12.9898 + pass * 3.1) * 43758.5453) * 43758.5453;
        const rr = R0 * (1.15 + 0.9 * (h - Math.floor(h)));
        const a = (j / n) * TAU;
        if (j === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(0, 0, R0 * 0.7, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = MAIN[c];
    ctx.beginPath(); ctx.arc(0, 0, R0 * 0.95, 0, TAU); ctx.fill();
    ctx.restore();
  }

  /** Костры шлейфа: пятно жара на земле, мягкое свечение, мерцающие языки и поднимающиеся угли. */
  drawFires(ctx, fires, life, rad) {
    if (!fires.length) return;
    const r = this.r;
    const t = r.clock;
    const g = this.glows[1] || (this.glows[1] = r.getGlow(GLOW[1]));
    ctx.save();
    for (let i = 0; i < fires.length; i++) {
      const f = fires[i];
      const k = 1 - f.age / life;
      const fade = Math.min(1, k * 2.2);
      const fl = 0.8 + 0.2 * Math.sin(t * 17 + i * 1.9);
      // Подпалина: тёмное мягкое пятно, дольше всего держится.
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.28 * Math.min(1, k * 1.5);
      ctx.fillStyle = '#0a1020';
      ctx.beginPath(); ctx.ellipse(f.x, f.y + 3, rad * 0.95, rad * 0.55, 0, 0, TAU); ctx.fill();
      // Свечение.
      ctx.globalCompositeOperation = 'lighter';
      const s = rad * 2.1 * (0.85 + 0.15 * k) * fl;
      ctx.globalAlpha = 0.34 * fade;
      ctx.drawImage(g, f.x - s, f.y - s * 0.85, s * 2, s * 2);
      // Языки: три низкополигональных, каждый со своей фазой.
      const hv = Math.sin(i * 12.9898) * 43758.5453; const hr = hv - Math.floor(hv); // свой рост у каждого костра: ряд не гребёнка
      if (hr < 0.28) continue;
      for (let j = 0; j < 2; j++) {
        const ph = t * (9 + j * 2.3) + i * 1.7 + j * 2.1;
        const h = rad * (0.55 + 0.4 * Math.sin(ph)) * (0.45 + 0.55 * k) * (0.6 + hr * 0.9) * (j ? 0.75 : 1);
        const w = rad * 0.3 * (0.8 + 0.2 * Math.sin(ph * 1.3));
        const ox = (j - 0.5) * rad * 0.5 + (hr - 0.5) * rad * 0.6 + Math.sin(ph * 0.7) * 2;
        const oy = 1 + j;
        ctx.save();
        ctx.translate(f.x + ox, f.y + oy);
        ctx.globalAlpha = 0.8 * fade;
        ctx.fillStyle = '#ff7a2a';
        ctx.beginPath(); poly(ctx, [-w, 0, -w * 0.55, -h * 0.5, Math.sin(ph) * w * 0.5, -h, w * 0.5, -h * 0.55, w, 0]); ctx.fill();
        ctx.fillStyle = '#ffd36a';
        ctx.beginPath(); poly(ctx, [-w * 0.5, 0, -w * 0.25, -h * 0.35, Math.sin(ph) * w * 0.25, -h * 0.66, w * 0.25, -h * 0.38, w * 0.5, 0]); ctx.fill();
        ctx.restore();
      }
      // Угли: поднимаются и гаснут (без хранения состояния).
      ctx.fillStyle = '#ffb04a';
      for (let j = 0; j < 2; j++) {
        const u = (t * 0.8 + j * 0.5 + i * 0.37) % 1;
        ctx.globalAlpha = (1 - u) * 0.9 * fade;
        ctx.beginPath(); ctx.arc(f.x + Math.sin(i * 3.1 + j * 2 + u * 5) * rad * 0.7, f.y - u * rad * 2.2, 1.3 * (1 - 0.5 * u), 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}
