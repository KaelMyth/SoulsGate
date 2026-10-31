// Апофеоз, вторая фаза: «Крик» (волны), обвал платформы, эпилог (свет, распад, реплики) и портал-воронка.
// Только вид. Данные из ApotheosisAI (state, rings, screamGlow, negative, fin) и арены.
// Вторая фаза идёт в негативе (drawNegative: difference с белым), поэтому цвета здесь задаются как «каким должен выйти пиксель»,
// а nc() сам подмешивает инверсию по доле apotheosis.negative.

const TAU = Math.PI * 2;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, k) => a + (b - a) * k;
const SERIF = '"Iowan Old Style", Georgia, "Palatino Linotype", Palatino, serif';

function hash(i) {
  const h = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return h - Math.floor(h);
}

export class ApoFinaleFx {
  constructor(renderer) {
    this.r = renderer;
    this.debris = [];   // обломки платформы, падающие в пустоту
    this.cracks = [];   // трещины-вспышки на месте откола
    this.seen = null;   // какие куски уже откололись (по данным fin.path)
    this.pathRef = null;
    this.sc = 0;        // сглаженный открытый рот 0..1 (для босса)
  }

  /** Цвет [r,g,b] как должен выйти на экране; с поправкой на негатив мира. */
  nc(c, a) {
    const n = this.r.apotheosis ? this.r.apotheosis.negative : 0;
    const k = n > 0 ? n : 0;
    const f = (v) => Math.round(lerp(v, 255 - v, k));
    return 'rgba(' + f(c[0]) + ',' + f(c[1]) + ',' + f(c[2]) + ',' + (a === undefined ? 1 : a) + ')';
  }

  // ---------- рот босса ----------

  /** Насколько раскрыт рот в крике, 0..1 (сглажено). Зовёт отрисовка босса. */
  mouthOpen() {
    const a = this.r.apotheosis;
    let tgt = 0;
    if (a && a.state === 'scream') tgt = Math.min(1, 0.15 + a.screamGlow * 0.85);
    this.sc += (tgt - this.sc) * (1 - Math.exp(-this.r.dt / 0.12));
    return this.sc;
  }

  // ---------- Крик ----------

  /**
   * Волны крика: тёмные ленты с острым светлым краем, проём у обычной волны открыт, у сплошной (её проходят рывком)
   * багровая сердцевина и шипы. Перед криком рот собирает тьму.
   */
  scream() {
    const r = this.r;
    const a = r.apotheosis;
    if (!a || !a.boss) return;
    const ctx = r.ctx;
    const o = a.headPos();
    const hr = a.boss.radius * 0.5;
    const t = r.clock;
    if (a.state === 'scream' && a.screamGlow > 0) { // рот собирает тьму: сжимающиеся дуги и тёмное пятно
      const k = a.screamGlow;
      const ang = a.boss.headAngle || 0;
      const mx = o.x - Math.sin(ang) * hr * 0.6;
      const my = o.y + Math.cos(ang) * hr * 0.6;
      ctx.save();
      const rad = hr * (1.8 + 2.2 * k);
      const g = ctx.createRadialGradient(mx, my, 0, mx, my, rad);
      g.addColorStop(0, this.nc([40, 8, 24], 0.55 * k));
      g.addColorStop(0.5, this.nc([14, 6, 30], 0.28 * k));
      g.addColorStop(1, this.nc([14, 6, 30], 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(mx, my, rad, 0, TAU); ctx.fill();
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) { // втягиваемые к рту кольца
        const u = (k * 1.3 + i / 3) % 1;
        ctx.strokeStyle = this.nc([255, 240, 200], 0.55 * k * (1 - u));
        ctx.beginPath(); ctx.arc(mx, my, hr * (3.2 - 2.6 * u), 0, TAU); ctx.stroke();
      }
      ctx.restore();
    }
    if (!a.rings.length) return;
    const S = a.boss.def.scream;
    ctx.save();
    ctx.lineCap = 'butt';
    for (let i = 0; i < a.screamN; i++) {
      const g = a.rings[i];
      if (!g || !g.live) continue;
      const fade = clamp01((S.maxR - g.r) / 160) * clamp01(g.r / 60);
      const dim = g.hit ? 0.35 : 1;
      const w = S.width;
      const a0 = g.gap + g.gapW / 2;
      const a1 = g.gap - g.gapW / 2 + TAU;
      const arc = (rad, lw, col) => {
        ctx.beginPath();
        if (g.solid) ctx.arc(o.x, o.y, rad, 0, TAU); else ctx.arc(o.x, o.y, rad, a0, a1);
        ctx.lineWidth = lw;
        ctx.strokeStyle = col;
        ctx.stroke();
      };
      const al = fade * dim;
      arc(g.r, w * 2.8, this.nc(g.solid ? [60, 8, 22] : [24, 10, 48], 0.1 * al));   // дымка позади волны
      arc(g.r, w * 1.6, this.nc(g.solid ? [70, 8, 20] : [20, 10, 44], 0.2 * al));
      arc(g.r, w * 0.7, this.nc(g.solid ? [34, 4, 12] : [8, 5, 20], 0.92 * al));     // тёмное тело
      arc(g.r + w * 0.35, 2.2, this.nc(g.solid ? [255, 120, 100] : [255, 240, 205], 0.95 * al)); // острый внешний край
      arc(g.r - w * 0.35, 1.2, this.nc(g.solid ? [255, 150, 130] : [210, 200, 255], 0.5 * al));  // тонкий внутренний
      if (g.solid) { // шипы по сплошной волне
        const n = 42;
        const spin = t * 0.5;
        ctx.fillStyle = this.nc([255, 235, 215], 0.85 * al);
        for (let k = 0; k < n; k++) {
          const an = spin + (k / n) * TAU;
          const len = w * (0.9 + 0.8 * hash(k + 9));
          const c = Math.cos(an);
          const s = Math.sin(an);
          const bx = o.x + c * (g.r + w * 0.5);
          const by = o.y + s * (g.r + w * 0.5);
          ctx.beginPath();
          ctx.moveTo(bx - s * 2, by + c * 2);
          ctx.lineTo(bx + c * len, by + s * len);
          ctx.lineTo(bx + s * 2, by - c * 2);
          ctx.closePath();
          ctx.fill();
        }
      } else { // острые клыки на краях проёма: волна кончается шипом, проём читается издалека
        for (let sgn = -1; sgn <= 1; sgn += 2) {
          const an = sgn < 0 ? a1 : a0;
          const c = Math.cos(an);
          const s = Math.sin(an);
          const dx = sgn < 0 ? -s : s; // в сторону проёма
          const dy = sgn < 0 ? c : -c;
          const bx = o.x + c * g.r;
          const by = o.y + s * g.r;
          const hw = w * 0.5;
          ctx.fillStyle = this.nc([8, 5, 20], 0.92 * al);
          ctx.beginPath();
          ctx.moveTo(bx + c * hw, by + s * hw);
          ctx.lineTo(bx + dx * w * 2.1 + c * hw * 0.1, by + dy * w * 2.1 + s * hw * 0.1);
          ctx.lineTo(bx - c * hw, by - s * hw);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = this.nc([255, 240, 205], 0.9 * al);
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(bx + c * hw, by + s * hw);
          ctx.lineTo(bx + dx * w * 2.1, by + dy * w * 2.1);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  // ---------- обвал платформы ----------

  /** Падающие обломки и вспышки трещин. Куски отламываются по данным fin.path (started[]): новый кусок даёт обломки. */
  collapse() {
    const r = this.r;
    const a = r.apotheosis;
    const ctx = r.ctx;
    const dt = r.dt;
    const f = a ? a.fin : null;
    const p = f && f.stage === 'path' ? f.path : null;
    if (p) {
      if (this.pathRef !== p) { this.pathRef = p; this.seen = p.started.map(() => false); }
      for (let i = 0; i < p.started.length; i++) {
        if (p.started[i] && !this.seen[i]) {
          this.seen[i] = true;
          this.spawnBreak(p, i);
        }
      }
    } else this.pathRef = null;
    // На платформе проступают разветвлённые линии напряжения до отрыва сегментов.
    // Считаем только каждое третье ребро: выразительнее и дешевле на телефоне.
    if (p) {
      const P=a.boss.def.pathbreak;
      const u=Math.min(1,f.t/Math.max(.01,P.time));
      const span=Math.max(.05,1-P.spread);
      ctx.save();
      ctx.lineJoin='round';ctx.lineCap='round';
      for(let i=0;i<p.ang.length;i+=3) {
        const progress=Math.max(0,Math.min(1,(u-p.delay[i])/span));
        if(progress<=0||p.R1[i]>=p.R0[i])continue;
        const eased=progress*progress*(3-2*progress);
        const angle=p.ang[i],dx=Math.cos(angle),dy=Math.sin(angle);
        const outer=p.R0[i],r1=outer+(p.R1[i]-outer)*eased;
        const k=Math.min(1,eased*4);
        const x=p.cx+dx*r1,y=p.cy+dy*r1;
        const back=25+35*hash(i*23);
        ctx.beginPath();
        ctx.moveTo(x,y);
        ctx.lineTo(x+dx*back*.42-dy*9,y+dy*back*.42+dx*9);
        ctx.lineTo(x+dx*back+dy*7,y+dy*back-dx*7);
        ctx.lineWidth=5;ctx.strokeStyle=this.nc([9,7,22],.8*k);ctx.stroke();
        ctx.lineWidth=1.4;ctx.strokeStyle=this.nc([238,210,174],.74*k);ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x+dx*back*.42-dy*9,y+dy*back*.42+dx*9);
        ctx.lineTo(x+dx*back*.55-dy*22,y+dy*back*.55+dx*22);
        ctx.lineWidth=1.4;ctx.strokeStyle=this.nc([105,85,116],.85*k);ctx.stroke();
      }
      ctx.restore();
    }
    if (!this.debris.length && !this.cracks.length) return;
    ctx.save();
    for (let i = this.cracks.length - 1; i >= 0; i--) { // трещины: рваная светлая линия вглубь платформы
      const c = this.cracks[i];
      c.age += dt;
      if (c.age >= c.life) { this.cracks.splice(i, 1); continue; }
      const u = c.age / c.life;
      ctx.globalAlpha = 1 - u;
      ctx.lineJoin = 'miter';
      ctx.strokeStyle = this.nc([255, 222, 185], 1);
      ctx.lineWidth = 2.6 * (1 - u * 0.6);
      ctx.beginPath();
      ctx.moveTo(c.pts[0], c.pts[1]);
      for (let k = 2; k < c.pts.length; k += 2) ctx.lineTo(c.pts[k], c.pts[k + 1]);
      ctx.stroke();
      ctx.strokeStyle = this.nc([20, 12, 30], 1);
      ctx.lineWidth = 1.1;
      ctx.stroke();
      // Боковые сколы не повторяют прямую линию первичной трещины.
      ctx.strokeStyle = this.nc([143, 128, 158], .8 * (1-u));
      for(let k=4;k+3<c.pts.length;k+=6) {
        const px=c.pts[k],py=c.pts[k+1],qx=c.pts[k+2],qy=c.pts[k+3];
        ctx.beginPath();ctx.moveTo(px,py);
        ctx.lineTo((px+qx)*.5+(qy-py)*.85,(py+qy)*.5-(qx-px)*.85);
        ctx.lineWidth=1.3;ctx.stroke();
      }
    }
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.age += dt;
      if (d.age >= d.life) { this.debris.splice(i, 1); continue; }
      const u = d.age / d.life;
      d.vy += 260 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.rot += d.vr * dt;
      const sc = d.r * (1 - 0.55 * u);
      if (d.dust) { // пыль: тёмное облачко
        ctx.globalAlpha = 0.5 * (1 - u);
        ctx.fillStyle = this.nc([150, 142, 126], 1);
        ctx.beginPath(); ctx.arc(d.x, d.y, d.r * (1 + 1.4 * u), 0, TAU); ctx.fill();
        continue;
      }
      ctx.globalAlpha = Math.min(1, (1 - u) * 1.6);
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.rot);
      const v = d.v;
      const n = v.length / 2;
      ctx.beginPath();
      for (let k = 0; k < n; k++) { const x = v[k * 2] * sc; const y = v[k * 2 + 1] * sc; if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.closePath();
      ctx.fillStyle = this.nc([148, 135, 108], 1);  // грань камня (цвет платформы на экране)
      ctx.fill();
      ctx.beginPath(); // светлая грань сверху слева
      ctx.moveTo(v[0] * sc, v[1] * sc);
      ctx.lineTo(v[2] * sc, v[3] * sc);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fillStyle = this.nc([196, 184, 152], 1);
      ctx.fill();
      ctx.strokeStyle = this.nc([52, 44, 32], 1);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = 0; k < n; k++) { const x = v[k * 2] * sc; const y = v[k * 2 + 1] * sc; if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  spawnBreak(p, i) {
    const an = p.ang[i];
    const c = Math.cos(an);
    const s = Math.sin(an);
    const R = p.R0[i];
    const x = p.cx + c * R;
    const y = p.cy + s * R;
    if (this.debris.length > 160) return;
    const n = 2 + ((i * 7) % 2); // меньше обломков, но каждый крупнее и с читаемой фасеткой
    for (let k = 0; k < n; k++) { // обломки: грани с вершинами по кругу, летят наружу, потом падают
      const sides = 5 + (k % 2);
      const v = [];
      for (let q = 0; q < sides; q++) {
        const aa = (q / sides) * TAU + hash(i * 5 + k * 3 + q) * 0.7;
        const rr = 0.6 + 0.6 * hash(i * 9 + k + q * 2);
        v.push(Math.cos(aa) * rr, Math.sin(aa) * rr);
      }
      const sp = 40 + 90 * hash(i * 3 + k);
      this.debris.push({
        x: x - c * 6 * k, y: y - s * 6 * k + k * 2, vx: c * sp + (hash(i + k * 11) - 0.5) * 60, vy: s * sp - 70 - 40 * hash(i + k * 7),
        rot: hash(i + k) * TAU, vr: (hash(i * 2 + k) - 0.5) * 6, r: 12 + 14 * hash(i * 13 + k), age: 0, life: 1.1 + 0.8 * hash(i + k * 5), v, dust: false,
      });
    }
    for (let k = 0; k < 3; k++) {
      this.debris.push({ x: x + (hash(i + k) - 0.5) * 30, y: y + (hash(i * 3 + k) - 0.5) * 20, vx: c * 25, vy: -20 - 10 * k, rot: 0, vr: 0, r: 12 + 6 * k, age: 0, life: 0.9 + 0.3 * k, v: null, dust: true });
    }
    const pts = [x, y];
    let px = x;
    let py = y;
    const len = 5 + (i % 3);
    for (let k = 0; k < len; k++) { // трещина идёт к центру рваной линией
      px -= c * (9 + 8 * hash(i + k)) + (hash(i * 4 + k) - 0.5) * 12;
      py -= s * (9 + 8 * hash(i + k * 3)) + (hash(i * 6 + k) - 0.5) * 12;
      pts.push(px, py);
    }
    this.cracks.push({ pts, age: 0, life: 1.1 });
  }

  // ---------- Эпилог ----------

  /** Свет из головы босса (нарастает), реплика над ним и золотой распад. Босс сам тает в drawEnemy. */
  finale() {
    const r = this.r;
    const a = r.apotheosis;
    if (!a || !a.boss) return;
    const f = a.fin;
    const ctx = r.ctx;
    const b = a.boss;
    const o = a.headPos();
    const t = r.clock;
    if (f.glow > 0 && o) {
      const fade = 1 - f.dissolve * 0.85;
      const gk = f.glow;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const gl = r.getGlow(undefined);
      let s = b.radius * (1.6 + 4.2 * gk);
      ctx.globalAlpha = Math.min(1, 0.35 + 0.65 * gk) * fade;
      ctx.drawImage(gl, o.x - s, o.y - s, s * 2, s * 2);
      s = b.radius * (0.7 + 1.5 * gk);
      ctx.globalAlpha = Math.min(1, gk * 1.2) * fade;
      ctx.drawImage(r.getGlow('gold'), o.x - s, o.y - s, s * 2, s * 2);
      // лучи: длинные тонкие клинья, вращаются в разные стороны
      const n = 18;
      for (let k = 0; k < n; k++) {
        const an = (k / n) * TAU + t * (k % 2 ? 0.25 : -0.18);
        const len = b.radius * (2.2 + 5 * gk) * (0.6 + 0.4 * hash(k + 4)) * (1 + 0.1 * Math.sin(t * 7 + k));
        const wd = 0.05 + 0.03 * hash(k);
        const c0 = Math.cos(an);
        const s0 = Math.sin(an);
        const gr = ctx.createLinearGradient(o.x, o.y, o.x + c0 * len, o.y + s0 * len);
        gr.addColorStop(0, 'rgba(255,246,210,' + (0.75 * gk * fade).toFixed(3) + ')');
        gr.addColorStop(1, 'rgba(255,220,140,0)');
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.moveTo(o.x + Math.cos(an - 1.57) * b.radius * 0.12, o.y + Math.sin(an - 1.57) * b.radius * 0.12);
        ctx.lineTo(o.x + Math.cos(an - wd) * len, o.y + Math.sin(an - wd) * len);
        ctx.lineTo(o.x + Math.cos(an + wd) * len, o.y + Math.sin(an + wd) * len);
        ctx.lineTo(o.x + Math.cos(an + 1.57) * b.radius * 0.12, o.y + Math.sin(an + 1.57) * b.radius * 0.12);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
    if (f.shards.length) { // распад: золотые грани, лёгкие, уходят вверх и вращаются
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const gl = r.getGlow(undefined);
      for (let i = 0; i < f.shards.length; i++) {
        const s = f.shards[i];
        if (s.age >= s.life) continue;
        const u = s.age / s.life;
        const al = Math.max(0, 1 - u);
        ctx.globalAlpha = al * 0.55;
        const gs = s.r * 4;
        ctx.drawImage(gl, s.x - gs, s.y - gs, gs * 2, gs * 2);
        ctx.globalAlpha = al;
        ctx.save();
        ctx.translate(s.x, s.y - u * u * 26);
        ctx.rotate(s.age * (2 + (i % 5)) + i);
        const rr = s.r * 1.5;
        ctx.fillStyle = '#fff4c8';
        ctx.beginPath(); ctx.moveTo(0, -rr); ctx.lineTo(rr * 0.5, 0); ctx.lineTo(0, rr * 0.35); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#e8b64a';
        ctx.beginPath(); ctx.moveTo(0, -rr); ctx.lineTo(-rr * 0.5, 0); ctx.lineTo(0, rr * 0.35); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    }
    if (f.line && f.lineA > 0.01 && o) { // реплика: тонкий курсив, мягкая тень, плывёт вверх
      const sc = r.camera ? r.camera.scale || 1 : 1;
      const n = a.negative;
      const k = clamp01(n);
      const fg = [Math.round(lerp(255, 18, k)), Math.round(lerp(246, 14, k)), Math.round(lerp(216, 30, k))];
      const bg = [Math.round(lerp(8, 250, k)), Math.round(lerp(6, 244, k)), Math.round(lerp(18, 230, k))];
      const x = b.x;
      const y = b.y - b.radius * 2.7 - (1 - f.lineA) * 8;
      ctx.save();
      ctx.globalAlpha = f.lineA;
      ctx.font = 'italic ' + Math.round(23 / sc) + 'px ' + SERIF;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      const text = '— ' + f.line;
      ctx.lineWidth = 9 / sc;
      ctx.strokeStyle = this.nc(bg, 0.22);
      ctx.strokeText(text, x, y);
      ctx.lineWidth = 4 / sc;
      ctx.strokeStyle = this.nc(bg, 0.55);
      ctx.strokeText(text, x, y);
      ctx.fillStyle = this.nc(fg, 1);
      ctx.fillText(text, x, y);
      ctx.restore();
    }
  }

  // ---------- Портал ----------

  /**
   * Портал-воронка: тёмный зев, три закрученных рукава, втягиваемые грани, холодное свечение и кольцо с зарубками.
   * p: { x, y, r, alpha, state, t }. Рисует и портал перед боссом, и портал конца игры.
   */
  portal(p) {
    const r = this.r;
    const ctx = r.ctx;
    const t = r.clock;
    const R = p.r;
    const closing = p.state === 'closing';
    const spin = t * (closing ? 3.2 : 1.1);
    const sq = closing ? Math.max(0.0, 1 - p.t / 0.6) : 1; // схлопывается при входе
    const pulse = 1 + 0.04 * Math.sin(t * 3.4);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.globalAlpha = p.alpha;
    // свечение
    ctx.globalCompositeOperation = 'lighter';
    let s = R * 3.4 * pulse * (0.6 + 0.4 * sq);
    ctx.globalAlpha = p.alpha * 0.55;
    ctx.drawImage(r.getGlow(true), -s, -s, s * 2, s * 2);
    s = R * 2.1 * pulse * (0.6 + 0.4 * sq);
    ctx.globalAlpha = p.alpha * 0.4;
    ctx.drawImage(r.getGlow('blue'), -s, -s, s * 2, s * 2);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = p.alpha;
    ctx.scale(1, 0.92);
    const R1 = R * (0.55 + 0.45 * sq) * pulse;
    // зев: тёмная воронка с фиолетовым краем
    const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, R1);
    gr.addColorStop(0, 'rgba(4,2,14,0.98)');
    gr.addColorStop(0.55, 'rgba(18,8,48,0.95)');
    gr.addColorStop(0.9, 'rgba(70,40,150,0.85)');
    gr.addColorStop(1, 'rgba(120,90,220,0)');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(0, 0, R1, 0, TAU); ctx.fill();
    // рукава: три закрученных серпа
    for (let k = 0; k < 3; k++) {
      const a0 = spin + (k / 3) * TAU;
      ctx.beginPath();
      const steps = 14;
      for (let i = 0; i <= steps; i++) {
        const u = i / steps;
        const rr = R1 * (0.12 + 0.82 * u);
        const an = a0 + u * 2.4;
        const x = Math.cos(an) * rr;
        const y = Math.sin(an) * rr;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.strokeStyle = 'rgba(205,190,255,0.75)';
      ctx.lineWidth = Math.max(1.2, R * 0.07);
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = Math.max(0.8, R * 0.025);
      ctx.stroke();
    }
    // грани, втягиваемые к центру
    ctx.fillStyle = 'rgba(225,215,255,0.9)';
    for (let k = 0; k < 9; k++) {
      const u = (t * 0.45 + k / 9 + hash(k) * 0.3) % 1;
      const rr = R * (1.5 - 1.2 * u) * (0.6 + 0.4 * sq);
      const an = spin * -1.2 + k * 2.4;
      const sz = R * 0.11 * (1 - 0.6 * u);
      ctx.save();
      ctx.globalAlpha = p.alpha * Math.min(1, (1 - u) * 2);
      ctx.translate(Math.cos(an + u * 2) * rr, Math.sin(an + u * 2) * rr);
      ctx.rotate(an + u * 6);
      ctx.beginPath(); ctx.moveTo(0, -sz * 1.4); ctx.lineTo(sz, 0); ctx.lineTo(0, sz * 1.4); ctx.lineTo(-sz, 0); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = p.alpha;
    // внешнее кольцо: фигурный обод с зарубками
    const ringR = R * (0.95 + 0.1 * sq) * pulse;
    ctx.strokeStyle = 'rgba(199,168,255,0.9)';
    ctx.lineWidth = Math.max(2, R * 0.07);
    ctx.beginPath(); ctx.arc(0, 0, ringR, 0, TAU); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(0, 0, ringR + R * 0.05, 0, TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(235,225,255,0.95)';
    const n = 12;
    for (let k = 0; k < n; k++) {
      const an = -spin * 0.4 + (k / n) * TAU;
      const c = Math.cos(an);
      const sn = Math.sin(an);
      const len = R * (k % 3 === 0 ? 0.22 : 0.12);
      ctx.beginPath();
      ctx.moveTo(c * (ringR + R * 0.05) - sn * 2.2, sn * (ringR + R * 0.05) + c * 2.2);
      ctx.lineTo(c * (ringR + R * 0.05 + len), sn * (ringR + R * 0.05 + len));
      ctx.lineTo(c * (ringR + R * 0.05) + sn * 2.2, sn * (ringR + R * 0.05) - c * 2.2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
}
