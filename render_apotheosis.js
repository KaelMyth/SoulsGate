// Апофеоз и апостолы: золотая маска-солнце (по образцу парадной маски Людовика XIV), чёрная мантия, жуткое лицо.
//   boss(...)    рисует босса: мантия, ореол, маска; мимика растёт перед «Превращением», во второй фазе лицо мертвенное.
//   apostle(...) рисует апостола: та же маска и мантия, но свои лучи, цвет и лицо по имени (Вера, Правда, Сила, Любовь).
// Здесь только вид: данные берём из босса (headAngle, radius) и из ApotheosisAI (state, phase2, stunT).

const TAU = Math.PI * 2;
const LX = -0.6; // свет сверху слева
const LY = -0.8;

// ---------- цвет ----------
const hexCache = new Map();
function rgb(h) {
  let v = hexCache.get(h);
  if (!v) {
    v = [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    hexCache.set(h, v);
  }
  return v;
}
function mix(a, b, k) {
  const A = rgb(a);
  const B = rgb(b);
  const f = Math.max(0, Math.min(1, k));
  return 'rgb(' + Math.round(A[0] + (B[0] - A[0]) * f) + ',' + Math.round(A[1] + (B[1] - A[1]) * f) + ',' + Math.round(A[2] + (B[2] - A[2]) * f) + ')';
}
/** Тон грани: b 0..1 от тени к свету. */
function shade(p, b) {
  return b < 0.5 ? mix(p.dark, p.mid, b * 2) : mix(p.mid, p.light, (b - 0.5) * 2);
}
function hash(i) {
  const h = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return h - Math.floor(h);
}
function lerp(a, b, k) { return a + (b - a) * k; }
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

// ---------- палитры ----------
const GOLD = { light: '#fff1b8', mid: '#e3b13c', dark: '#7a4c10', deep: '#2a1804', glow: undefined, eye: '#ff5a2a' };
const BONE = { light: '#e6e2f2', mid: '#8f8aa8', dark: '#3a3852', deep: '#0c0b16', glow: 'blue', eye: '#ff2a3a' };
const INK = { light: '#2a2a44', mid: '#10101e', dark: '#05050c', deep: '#020206', glow: undefined, eye: '#000' };
const HITP = { light: '#ffffff', mid: '#ffffff', dark: '#e8e8f0', deep: '#c8c8d8', glow: undefined, eye: '#ffffff' };

function palMix(a, b, k) { // между двумя палитрами (для плавного пути золото → кость)
  return {
    light: toHex(rgb(a.light), rgb(b.light), k),
    mid: toHex(rgb(a.mid), rgb(b.mid), k),
    dark: toHex(rgb(a.dark), rgb(b.dark), k),
    deep: toHex(rgb(a.deep), rgb(b.deep), k),
    glow: k > 0.5 ? b.glow : a.glow,
    eye: toHex(rgb(a.eye), rgb(b.eye), k),
  };
}
const toHexCache = new Map();
function toHex(A, B, k) {
  const q = Math.round(k * 20) / 20; // 20 шагов: кеш не растёт
  const key = A[0] + ',' + A[1] + ',' + A[2] + '|' + B[0] + ',' + B[1] + ',' + B[2] + '|' + q;
  let v = toHexCache.get(key);
  if (!v) {
    const c = (i) => Math.round(A[i] + (B[i] - A[i]) * q).toString(16).padStart(2, '0');
    v = '#' + c(0) + c(1) + c(2);
    toHexCache.set(key, v);
  }
  return v;
}

// ---------- стили масок ----------
const SUN = {
  long: { n: 10, len: 2.0, w: 0.15, wave: 0.1, kind: 'blade' },
  mid: { n: 10, len: 1.52, w: 0.09, wave: 0.05, kind: 'blade', off: 0.5 },
  teeth: 40,
  eyes: 'calm',
  mouth: 'calm',
};
const APOSTLE = {
  faith: { // Вера: мягкие короткие лучи-сияние и нимб
    pal: { light: '#fffbe6', mid: '#f0dca0', dark: '#8a7a50', deep: '#2a2410', glow: 'gold', eye: '#fff3c0' },
    rim: '#fff4c8',
    long: { n: 14, len: 1.7, w: 0.1, wave: 0.03, kind: 'soft' },
    teeth: 0, halo: true, eyes: 'closed', mouth: 'smile',
  },
  truth: { // Правда: пять длинных прямых клинков, взгляд открытый
    pal: { light: '#fff4c4', mid: '#d9a82e', dark: '#6a4208', deep: '#221400', glow: 'gold', eye: '#ffffff' },
    rim: '#ffd24a',
    long: { n: 5, len: 2.35, w: 0.1, wave: 0, kind: 'spike' },
    mid: { n: 5, len: 1.3, w: 0.07, wave: 0, kind: 'spike', off: 0.5 },
    teeth: 0, eyes: 'open', mouth: 'calm',
  },
  force: { // Сила: тяжёлые изогнутые шипы по кругу, хмурый взгляд
    pal: { light: '#ffc9a0', mid: '#c8503c', dark: '#5a1810', deep: '#1c0604', glow: undefined, eye: '#ffb040' },
    rim: '#ff7a4a',
    long: { n: 8, len: 1.75, w: 0.22, wave: 0, kind: 'spike', twist: 0.55 },
    teeth: 16, eyes: 'angry', mouth: 'grit',
  },
  love: { // Любовь: округлые лепестки, закрытые глаза, улыбка
    pal: { light: '#ffe6f2', mid: '#e58ab8', dark: '#7a2e58', deep: '#240c1a', glow: 'red', eye: '#ffd6ea' },
    rim: '#ff9fcf',
    long: { n: 8, len: 1.75, w: 0.28, wave: 0.02, kind: 'petal' },
    mid: { n: 8, len: 1.3, w: 0.2, wave: 0, kind: 'petal', off: 0.5 },
    teeth: 0, eyes: 'closed', mouth: 'smile',
  },
};

const RISEN = { // восставший апостол: костяная маска, короткие острые лучи, оскал
  pal: BONE, rim: '#cfc8ff',
  long: { n: 9, len: 1.65, w: 0.11, wave: 0.05, kind: 'blade' },
  teeth: 0, eyes: 'angry', mouth: 'grit',
};

const NOPOSE = { arms: 0, spread: 0, glow: 0, motes: 0, aimW: 0, open: 0.3, shake: 0, limp: 0 };

export class ApotheosisArt {
  constructor(renderer) {
    this.r = renderer;
    this.ps = new WeakMap(); // сглаженные позы по врагу
    this.ex = 0;   // сглаженная жуть лица 0..1 босса
    this.dk = 0;   // сглаженная мертвенность 0..1 (золото уходит в кость)
    this.glows = [];
    this.fx = 0;   // сглаженное «вздрагивание» лица (подёргивания)
  }

  glow(v) {
    const k = v === undefined ? 'o' : String(v);
    return this.glows[k] || (this.glows[k] = this.r.getGlow(v));
  }

  // ---------- маска ----------

  /**
   * Маска-солнце. o: { angle, expr 0..1, pal, st (стиль), t, look {x,y}, hit, rim }.
   * Координаты внутри: единица = hr (радиус лица). Лучи и лицо поворачиваются вместе.
   */
  mask(ctx, cx, cy, hr, o) {
    const st = o.st;
    const p = o.pal;
    const ex = o.expr || 0;
    const t = o.t;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(o.angle || 0);
    ctx.scale(hr, hr);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    // Ореол позади: тёплый (золото) или холодный, к концу жуткий.
    if (!o.hit) {
      ctx.globalCompositeOperation = 'lighter';
      const g = this.glow(p.glow);
      const s = (st.halo ? 2.6 : 3.3) * (1 + 0.04 * Math.sin(t * 2.2));
      ctx.globalAlpha = o.glowA === undefined ? 0.5 : o.glowA;
      ctx.drawImage(g, -s, -s, s * 2, s * 2);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    if (st.halo) { // нимб Веры: тонкое кольцо над головой
      ctx.globalCompositeOperation = o.hit ? 'source-over' : 'lighter';
      ctx.strokeStyle = o.hit ? '#fff' : p.light;
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 0.07;
      ctx.beginPath(); ctx.ellipse(0, -1.95, 0.8, 0.22, 0, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = 0.2;
      ctx.beginPath(); ctx.ellipse(0, -1.95, 0.8, 0.22, 0, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    // Зубцы-кольцо у лица: мелкая «пила» из фольги.
    if (st.teeth) {
      const n = st.teeth;
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * TAU;
        const a1 = ((i + 1) / n) * TAU;
        const am = (a0 + a1) / 2;
        const rr = 1.0 + 0.3 * (0.7 + 0.3 * hash(i + 3)) * (1 + 0.5 * ex);
        ctx.fillStyle = shade(p, 0.2 + 0.3 * (0.5 + 0.5 * (Math.cos(am) * LX + Math.sin(am) * LY)));
        ctx.beginPath();
        ctx.moveTo(Math.cos(a0) * 0.95, Math.sin(a0) * 0.95);
        ctx.lineTo(Math.cos(am) * rr, Math.sin(am) * rr);
        ctx.lineTo(Math.cos(a1) * 0.95, Math.sin(a1) * 0.95);
        ctx.closePath();
        ctx.fill();
      }
    }
    if (st.mid) this.rays(ctx, st.mid, p, ex, t, o.angle || 0, 0.7);
    this.rays(ctx, st.long, p, ex, t, o.angle || 0, 1);
    this.face(ctx, st, p, ex, t, o);
    ctx.restore();
  }

  /** Венец лучей: волнистые лезвия (для Апофеоза), прямые клинки, лепестки, шипы. */
  rays(ctx, R, p, ex, t, ang, depth) {
    const n = R.n;
    const off = R.off || 0;
    const wv = (R.wave || 0) * (1 + 2.2 * ex);
    const kind = R.kind;
    const SEG = 7;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + ((i + off) / n) * TAU;
      // Мировой угол луча для освещения (лицо повёрнуто на ang, свет идёт из мира).
      const wa = a + ang - 0;
      const dirx = Math.cos(a);
      const diry = Math.sin(a);
      const nx = -diry;
      const ny = dirx;
      const L = R.len * (1 + 0.1 * ex * (hash(i + 11) - 0.3)) * (kind === 'soft' ? 1 : 1);
      const ph = hash(i + 5) * 6;
      const tw = R.twist || 0;
      const left = [];
      const right = [];
      for (let s = 0; s <= SEG; s++) {
        const u = s / SEG;
        const r = 0.96 + (L - 0.96) * u;
        let hw;
        if (kind === 'petal') hw = R.w * Math.sin(Math.PI * Math.min(1, 0.08 + 0.92 * u)) * 0.95 + 0.01;
        else if (kind === 'soft') hw = R.w * (1 - u * u) + 0.012;
        else if (kind === 'spike') hw = R.w * Math.pow(1 - u, 1.15) + 0.008;
        else hw = R.w * Math.pow(1 - u, 0.85) + 0.012;
        const wob = Math.sin(u * 6.3 + ph + t * (1.2 + 1.6 * ex)) * wv * u + tw * u * u;
        // Изгиб (twist) уводит кончик вбок: шипы Силы закручены по кругу.
        const bx = dirx * r + nx * wob;
        const by = diry * r + ny * wob;
        left.push(bx + nx * hw, by + ny * hw);
        right.push(bx - nx * hw, by - ny * hw);
      }
      const f = 0.5 + 0.5 * (Math.cos(wa) * LX + Math.sin(wa) * LY); // на свету ли луч
      ctx.fillStyle = shade(p, (0.25 + 0.5 * f) * depth + (1 - depth) * 0.2);
      ctx.beginPath();
      ctx.moveTo(left[0], left[1]);
      for (let s = 1; s <= SEG; s++) ctx.lineTo(left[s * 2], left[s * 2 + 1]);
      for (let s = SEG; s >= 0; s--) ctx.lineTo(right[s * 2], right[s * 2 + 1]);
      ctx.closePath();
      ctx.fill();
      // Одна половина луча светлее: гранёный блик вдоль середины.
      ctx.fillStyle = shade(p, Math.min(1, (0.45 + 0.5 * f) * depth + 0.1));
      ctx.beginPath();
      ctx.moveTo((left[0] + right[0]) / 2, (left[1] + right[1]) / 2);
      for (let s = 1; s <= SEG; s++) ctx.lineTo(left[s * 2], left[s * 2 + 1]);
      ctx.lineTo((left[SEG * 2] + right[SEG * 2]) / 2, (left[SEG * 2 + 1] + right[SEG * 2 + 1]) / 2);
      ctx.closePath();
      ctx.globalAlpha = 0.85;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  /** Лицо: гранёный овал с фаской, нос, прорези глаз и рот. expr 0 спокойное, 1 жуткое. */
  face(ctx, st, p, ex, t, o) {
    const RX = 1.0;
    const RY = 1.1;
    const N = 18;
    // Фаска: кольцо граней между внешним и внутренним овалом.
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * TAU;
      const a1 = ((i + 1) / N) * TAU;
      const am = (a0 + a1) / 2;
      const b = 0.5 + 0.5 * (Math.cos(am) * LX + Math.sin(am) * LY);
      ctx.fillStyle = shade(p, 0.18 + 0.7 * b);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a0) * RX, Math.sin(a0) * RY);
      ctx.lineTo(Math.cos(a1) * RX, Math.sin(a1) * RY);
      ctx.lineTo(Math.cos(a1) * RX * 0.82, Math.sin(a1) * RY * 0.82);
      ctx.lineTo(Math.cos(a0) * RX * 0.82, Math.sin(a0) * RY * 0.82);
      ctx.closePath();
      ctx.fill();
    }
    // Лицевая плоскость: веер граней от центра, свет сверху слева.
    const M = 14;
    for (let i = 0; i < M; i++) {
      const a0 = (i / M) * TAU;
      const a1 = ((i + 1) / M) * TAU;
      const am = (a0 + a1) / 2;
      const b = 0.5 + 0.5 * (Math.cos(am) * LX + Math.sin(am) * LY);
      ctx.fillStyle = shade(p, 0.42 + 0.34 * b - 0.08 * hash(i + 21));
      ctx.beginPath();
      ctx.moveTo(-0.08, -0.05);
      ctx.lineTo(Math.cos(a0) * RX * 0.82, Math.sin(a0) * RY * 0.82);
      ctx.lineTo(Math.cos(a1) * RX * 0.82, Math.sin(a1) * RY * 0.82);
      ctx.closePath();
      ctx.fill();
    }
    // Блик на лбу и щеке: отражение света на металле.
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = p.light;
    ctx.beginPath(); ctx.moveTo(-0.62, -0.42); ctx.lineTo(-0.1, -0.7); ctx.lineTo(-0.3, -0.25); ctx.lineTo(-0.58, -0.1); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-0.5, 0.15); ctx.lineTo(-0.28, 0.1); ctx.lineTo(-0.34, 0.5); ctx.lineTo(-0.52, 0.42); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
    // Нос: длинный, левая грань на свету.
    const nl = 0.1 + 0.02 * ex;
    ctx.fillStyle = shade(p, 0.78);
    ctx.beginPath(); ctx.moveTo(-0.02, -0.12); ctx.lineTo(-nl, 0.36); ctx.lineTo(-0.02, 0.4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = shade(p, 0.28);
    ctx.beginPath(); ctx.moveTo(0.0, -0.12); ctx.lineTo(0.02, 0.4); ctx.lineTo(nl * 1.15, 0.36); ctx.closePath(); ctx.fill();
    ctx.fillStyle = p.deep;
    ctx.globalAlpha = 0.7;
    ctx.beginPath(); ctx.ellipse(-0.06, 0.4, 0.035, 0.022, 0, 0, TAU); ctx.ellipse(0.08, 0.4, 0.035, 0.022, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    this.eyes(ctx, st, p, ex, t, o);
    this.mouth(ctx, st, p, ex, t);
    // Трещины по лицу: растут вместе с жутью.
    if (ex > 0.35) {
      ctx.strokeStyle = p.deep;
      ctx.globalAlpha = Math.min(0.9, (ex - 0.35) * 1.6);
      ctx.lineWidth = 0.025;
      const cr = [[-0.52, -0.1, -0.7, 0.08, -0.62, 0.3], [0.52, -0.1, 0.72, 0.1, 0.6, 0.34], [0, -0.7, 0.08, -0.5, -0.04, -0.3], [-0.28, 0.62, -0.4, 0.82, -0.3, 0.95]];
      for (let i = 0; i < cr.length; i++) {
        const c = cr[i];
        ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.lineTo(c[2], c[3]); ctx.lineTo(c[4], c[5]); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  eyes(ctx, st, p, ex, t, o) {
    const mode = st.eyes;
    const look = o.look || { x: 0, y: 0.4 };
    for (let side = -1; side <= 1; side += 2) {
      const ex0 = side * 0.36;
      const ey0 = -0.2;
      if (mode === 'closed') { // закрытые глаза: дуги, у Любви с ресничками
        ctx.strokeStyle = p.deep;
        ctx.lineWidth = 0.05;
        ctx.beginPath(); ctx.arc(ex0, ey0 - 0.02, 0.16, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
        continue;
      }
      let w = lerp(0.2, 0.17, ex);
      let h = lerp(0.075, 0.2, ex);
      if (mode === 'open') { w = 0.2; h = 0.12 + 0.12 * ex; }
      let tilt = side * lerp(0, 0.38, ex); // внутренние края опускаются: взгляд исподлобья
      if (mode === 'angry') { h = 0.1; tilt = side * 0.45; }
      ctx.save();
      ctx.translate(ex0, ey0);
      ctx.rotate(tilt);
      ctx.fillStyle = p.deep; // прорезь: чёрный миндаль
      ctx.beginPath();
      ctx.moveTo(-w, 0); ctx.lineTo(-w * 0.45, -h); ctx.lineTo(w * 0.5, -h * 0.9); ctx.lineTo(w, 0.02); ctx.lineTo(w * 0.4, h); ctx.lineTo(-w * 0.5, h * 0.85);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = p.light; // подсвеченная нижняя кромка
      ctx.globalAlpha = 0.65;
      ctx.lineWidth = 0.025;
      ctx.beginPath(); ctx.moveTo(-w * 0.5, h * 0.85); ctx.lineTo(w * 0.4, h); ctx.lineTo(w, 0.02); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.restore();
      // Огонёк в глазнице: следит за героем; к концу яркий и красный.
      const pw = o.hit ? 0 : (mode === 'open' ? 0.7 : 0.15) + 0.85 * ex;
      if (pw > 0.05) {
        const lx = ex0 + look.x * 0.07;
        const ly = ey0 + look.y * 0.05;
        ctx.globalCompositeOperation = 'lighter';
        const g = this.glow(ex > 0.3 || p.glow === 'blue' ? 'red' : p.glow);
        const s = 0.16 + 0.12 * ex;
        ctx.globalAlpha = Math.min(1, pw);
        ctx.drawImage(g, lx - s, ly - s, s * 2, s * 2);
        ctx.fillStyle = '#fff';
        ctx.globalAlpha = Math.min(1, pw * 1.2);
        ctx.beginPath(); ctx.arc(lx, ly, 0.03 + 0.012 * ex, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }
    }
  }

  mouth(ctx, st, p, ex, t) {
    const my = 0.6;
    const mode = st.mouth;
    if (mode === 'smile') { // лёгкая улыбка
      ctx.strokeStyle = p.deep;
      ctx.lineWidth = 0.05;
      ctx.beginPath(); ctx.moveTo(-0.24, my - 0.02); ctx.quadraticCurveTo(0, my + 0.14, 0.24, my - 0.02); ctx.stroke();
      return;
    }
    if (mode === 'grit') { // оскал Силы
      ctx.fillStyle = p.deep;
      ctx.beginPath(); ctx.moveTo(-0.36, my - 0.04); ctx.lineTo(0.36, my - 0.04); ctx.lineTo(0.3, my + 0.12); ctx.lineTo(-0.3, my + 0.12); ctx.closePath(); ctx.fill();
      ctx.fillStyle = p.light;
      for (let i = 0; i < 5; i++) { const x = -0.28 + i * 0.14; ctx.beginPath(); ctx.moveTo(x, my - 0.03); ctx.lineTo(x + 0.12, my - 0.03); ctx.lineTo(x + 0.06, my + 0.06); ctx.closePath(); ctx.fill(); }
      return;
    }
    // Спокойный рот маски превращается в растянутую улыбку: углы ползут вверх по щекам, внутри чернота и острые зубы.
    const w = lerp(0.25, 0.66, ex);
    const lift = lerp(0.0, 0.26, ex);
    const open = lerp(0.025, 0.22, ex) + 0.02 * ex * Math.sin(t * 7);
    const cl = [-w, my - lift];
    const cr = [w, my - lift];
    const sag = 0.1 * ex + 0.03;
    const top = (u) => { const x = lerp(cl[0], cr[0], u); const y = my - lift + (1 - Math.pow(2 * u - 1, 2)) * (lift + sag * 0.3); return [x, y]; };
    const bot = (u) => { const x = lerp(cl[0], cr[0], u); const y = my - lift + (1 - Math.pow(2 * u - 1, 2)) * (lift + sag + open); return [x, y]; };
    const K = 8;
    ctx.fillStyle = p.deep;
    ctx.beginPath();
    for (let i = 0; i <= K; i++) { const q = top(i / K); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }
    for (let i = K; i >= 0; i--) { const q = bot(i / K); ctx.lineTo(q[0], q[1]); }
    ctx.closePath();
    ctx.fill();
    if (ex > 0.5) { // зубы: два ряда острых граней
      ctx.fillStyle = mix(p.light, '#ffffff', 0.4);
      ctx.globalAlpha = Math.min(1, (ex - 0.5) * 3);
      const n = 7;
      for (let i = 0; i < n; i++) {
        const u0 = (i + 0.1) / n;
        const u1 = (i + 0.9) / n;
        const a = top(u0); const b = top(u1); const c = top((u0 + u1) / 2);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1] + 0.05 + 0.07 * ex); ctx.closePath(); ctx.fill();
        const d = bot(u0); const e2 = bot(u1); const f = bot((u0 + u1) / 2);
        ctx.beginPath(); ctx.moveTo(d[0], d[1]); ctx.lineTo(e2[0], e2[1]); ctx.lineTo(f[0], f[1] - 0.04 - 0.05 * ex); ctx.closePath(); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = p.light; // верхняя губа: тонкий блик
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 0.02;
    ctx.beginPath();
    for (let i = 0; i <= K; i++) { const q = top(i / K); if (i) ctx.lineTo(q[0], q[1] - 0.02); else ctx.moveTo(q[0], q[1] - 0.02); }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // ---------- тело ----------

  /**
   * Тонкое, искажённое тело: узкие неровные плечи, длинная ломаная фигура, рваный подол с лентами, слишком длинные руки.
   * Чёрное, но контур подсвечен холодным светом: фигура читается на тьме. Единицы: R (центр у пояса головы).
   * o: { t, rim, dk 0..1 мертвенность, hit, fold, hem, glowV, haloA, spill, spillV, crack, pose }.
   * pose: { arms 0 опущены..1 вскинуты, spread 0..1 в стороны, aim {x,y} куда тянутся, glow 0..1, gv цвет света в руках,
   *         open 0..1 растопырены пальцы, orbs [цвета], motes 0..1 сходящиеся огоньки, limp 0..1 обвисли }.
   */
  robe(ctx, x, y, R, o) {
    const t = o.t;
    const rim = o.rim;
    const dk = o.dk || 0;
    const P = o.pose || NOPOSE;
    const sway = (yy) => Math.sin(t * 0.9 + yy * 1.7) * 0.05 * (1 + 1.6 * dk) + 0.05 * Math.sin(t * 0.37 + 2) * (yy + 0.4);
    const topL = -0.44;
    const topR = -0.34; // правое плечо выше: перекос
    const wAt = (yy) => { // полуширина: узкие плечи, талия, расширение к подолу
      const u = clamp01((yy + 0.44) / 0.95);
      const sh = lerp(0.36, 0.17, u * u * (3 - 2 * u));
      const flare = yy > 0.5 ? (yy - 0.5) * 0.28 : 0;
      return sh + flare;
    };
    const ROWS = 10;
    const yEnd = 1.12;
    const L = [];
    const Rr = [];
    for (let i = 0; i <= ROWS; i++) {
      const yy = lerp(topL, yEnd, i / ROWS);
      const notch = (i % 2 ? 0.045 : -0.02) * (0.6 + hash(i + 51));
      const cx = sway(yy);
      const w = wAt(yy);
      L.push([cx - w - notch, yy]);
      Rr.push([cx + w * 1.06 + notch * 0.7, lerp(topR, yEnd, i / ROWS)]);
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(R, R);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    // Ореол за спиной.
    ctx.globalCompositeOperation = 'lighter';
    const g = this.glow(o.glowV);
    ctx.globalAlpha = o.haloA;
    ctx.drawImage(g, -1.7, -1.5, 3.4, 3.4);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    const ink = o.hit ? '#ffffff' : '#05060c';
    // Рваные ленты подола: длинные, разной длины; во второй фазе тянутся плетьми.
    const NT = o.hem || 7;
    const tat = [];
    for (let i = 0; i < NT; i++) {
      const u = (i + 0.5) / NT;
      const xx = lerp(L[ROWS][0], Rr[ROWS][0], u);
      const len = 0.3 + 0.45 * hash(i + 61) + 0.5 * dk * hash(i + 67);
      const sw = Math.sin(t * (1.1 + 0.4 * hash(i + 3)) + i * 1.9) * (0.08 + 0.14 * dk);
      tat.push([xx, yEnd, xx + sw * 0.5, yEnd + len * 0.5, xx + sw, yEnd + len, 0.05 + 0.04 * hash(i + 71)]);
    }
    ctx.fillStyle = ink;
    for (let i = 0; i < NT; i++) {
      const q = tat[i];
      ctx.beginPath();
      ctx.moveTo(q[0] - q[6] * 1.6, q[1] - 0.05);
      ctx.quadraticCurveTo(q[2] - q[6], q[3], q[4], q[5]);
      ctx.quadraticCurveTo(q[2] + q[6], q[3], q[0] + q[6] * 1.6, q[1] - 0.05);
      ctx.closePath();
      ctx.fill();
    }
    // Корпус: ломаный силуэт.
    ctx.beginPath();
    ctx.moveTo(L[0][0], L[0][1]);
    for (let i = 1; i <= ROWS; i++) ctx.lineTo(L[i][0], L[i][1]);
    for (let i = ROWS; i >= 0; i--) ctx.lineTo(Rr[i][0], Rr[i][1]);
    ctx.closePath();
    ctx.fill();
    if (!o.hit) {
      // Грани: вертикальные полосы между левым краем и серединой, левые светлее.
      const K = 3;
      for (let k = 0; k < K; k++) {
        const f0 = k / K;
        const f1 = (k + 1) / K;
        ctx.beginPath();
        for (let i = 0; i <= ROWS; i++) { const px = lerp(L[i][0], Rr[i][0], f0); const py = lerp(L[i][1], Rr[i][1], f0); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
        for (let i = ROWS; i >= 0; i--) ctx.lineTo(lerp(L[i][0], Rr[i][0], f1), lerp(L[i][1], Rr[i][1], f1));
        ctx.closePath();
        ctx.fillStyle = mix('#05060c', o.fold, clamp01(0.55 - 0.22 * k + 0.1 * (k % 2)));
        ctx.fill();
      }
      // Контурный свет: слева и по плечам ярко, справа слабо.
      ctx.strokeStyle = rim;
      ctx.lineWidth = 0.03;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      for (let i = 0; i <= ROWS; i++) { if (i) ctx.lineTo(L[i][0], L[i][1]); else ctx.moveTo(L[i][0], L[i][1]); }
      ctx.stroke();
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      for (let i = 0; i <= ROWS; i++) { if (i) ctx.lineTo(Rr[i][0], Rr[i][1]); else ctx.moveTo(Rr[i][0], Rr[i][1]); }
      ctx.stroke();
      ctx.globalAlpha = 0.5; // лезвия подола подсвечены
      ctx.lineWidth = 0.018;
      for (let i = 0; i < NT; i++) { const q = tat[i]; ctx.beginPath(); ctx.moveTo(q[0] - q[6] * 1.4, q[1]); ctx.quadraticCurveTo(q[2] - q[6], q[3], q[4], q[5]); ctx.stroke(); }
      ctx.globalCompositeOperation = 'lighter'; // широкое мягкое свечение по левому краю
      ctx.globalAlpha = 0.14;
      ctx.lineWidth = 0.13;
      ctx.beginPath();
      for (let i = 0; i <= ROWS; i++) { if (i) ctx.lineTo(L[i][0], L[i][1]); else ctx.moveTo(L[i][0], L[i][1]); }
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    // Свет головы стекает на плечи.
    if (!o.hit && o.spill > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = o.spill;
      const gs = this.glow(o.spillV);
      ctx.drawImage(gs, -1.0, -1.0, 2.0, 1.8);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    // Трещины света на груди (вторая фаза).
    if (dk > 0.3 && !o.hit) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = o.crack;
      const pul = 0.6 + 0.4 * Math.sin(t * 3);
      ctx.globalAlpha = (dk - 0.3) * 1.2 * pul;
      ctx.lineWidth = 0.022;
      const cr = [[-0.12, -0.2, -0.17, 0.1, -0.09, 0.4, -0.14, 0.75], [0.1, -0.22, 0.14, 0.05, 0.08, 0.35]];
      for (let i = 0; i < cr.length; i++) {
        const c = cr[i];
        ctx.beginPath(); ctx.moveTo(c[0], c[1]);
        for (let j = 2; j < c.length; j += 2) ctx.lineTo(c[j], c[j + 1]);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    // Руки.
    if (!o.noArms) {
      this.arm(ctx, L[1][0] + 0.05, L[1][1] + 0.05, -1, P, o, t);
      this.arm(ctx, Rr[1][0] - 0.05, Rr[1][1] + 0.05, 1, P, o, t);
      // Огни вокруг: сходящиеся огоньки (заряд умения) и орбиты четырёх умений.
      this.motes(ctx, P, t, o);
    }
    ctx.restore();
  }

  /** Одна длинная тонкая рука: плечо, локоть, кисть с длинными пальцами. side -1 левая, 1 правая (на экране). */
  arm(ctx, sx, sy, side, P, o, t) {
    const dk = o.dk || 0;
    const limp = P.limp || 0;
    const a = clamp01(P.arms) * (1 - limp);
    // Направление плеча: вниз (0) через в стороны (π/2) до вверх (π). spread разводит руки шире.
    let al = 0.14 + a * (2.5 + 0.5 * (P.spread || 0)) + (P.spread || 0) * 0.9 * (1 - a);
    al += Math.sin(t * 2.1 + side * 1.3) * 0.06 * (1 + dk) + (P.shake ? Math.sin(t * 47 + side) * 0.12 * P.shake : 0);
    let dx = side * Math.sin(al);
    let dy = Math.cos(al);
    if (P.aim && P.aimW > 0) { // тянутся к цели
      const L = Math.hypot(P.aim.x, P.aim.y) || 1;
      dx = lerp(dx, P.aim.x / L, P.aimW);
      dy = lerp(dy, P.aim.y / L, P.aimW);
      const m = Math.hypot(dx, dy) || 1;
      dx /= m; dy /= m;
    }
    const U = 0.68;
    const F = 0.78;
    const ex = sx + dx * U;
    const ey = sy + dy * U;
    // Предплечье изгибается внутрь: кисть тянется вперёд, суставы лишние.
    const bend = (0.55 - 0.35 * a) * side * (limp ? 0.2 : 1) + Math.sin(t * 1.3 + side) * 0.08;
    const ca = Math.cos(bend);
    const sa = Math.sin(bend);
    const fx = dx * ca - dy * sa;
    const fy = dx * sa + dy * ca;
    const hx = ex + fx * F;
    const hy = ey + fy * F + limp * 0.1;
    const wob = Math.sin(t * 1.7 + side * 2) * 0.03;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Рука: чёрная, с подсвеченной кромкой.
    for (let pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass ? o.rim : (o.hit ? '#ffffff' : '#05060c');
      ctx.lineWidth = pass ? 0.03 : 0.08;
      ctx.globalAlpha = pass ? 0.9 : 1;
      const off = pass ? -0.035 * side : 0;
      ctx.beginPath();
      ctx.moveTo(sx + off, sy);
      ctx.quadraticCurveTo(ex + wob + off, ey, hx + off * 0.2, hy);
      ctx.stroke();
      ctx.lineWidth = pass ? 0.012 : 0.05;
    }
    ctx.globalAlpha = 1;
    // Пальцы: четыре тонких когтя веером вдоль предплечья.
    const open = P.open || 0.3;
    const base = Math.atan2(fy, fx);
    ctx.strokeStyle = o.hit ? '#ffffff' : '#05060c';
    ctx.lineWidth = 0.032;
    for (let i = 0; i < 4; i++) {
      const ang = base + (i - 1.5) * (0.22 + 0.3 * open) + Math.sin(t * 3 + i + side) * 0.06;
      const len = 0.3 + 0.08 * hash(i + 91) + 0.12 * dk;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.quadraticCurveTo(hx + Math.cos(ang) * len * 0.5 + 0.02, hy + Math.sin(ang) * len * 0.5, hx + Math.cos(ang + 0.2 * side) * len, hy + Math.sin(ang + 0.2 * side) * len);
      ctx.stroke();
    }
    // Свет в ладони.
    if (P.glow > 0.02 && !o.hit) {
      ctx.globalCompositeOperation = 'lighter';
      const gg = this.glow(P.gv);
      const s = 0.2 + 0.4 * P.glow;
      ctx.globalAlpha = Math.min(1, P.glow * 1.2);
      ctx.drawImage(gg, hx - s, hy - s, s * 2, s * 2);
      ctx.fillStyle = '#fff';
      ctx.globalAlpha = Math.min(1, P.glow);
      ctx.beginPath(); ctx.arc(hx, hy, 0.03 + 0.04 * P.glow, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    this.hand = this.hand || [0, 0];
    if (side > 0) { this.handR = [hx, hy]; } else { this.handL = [hx, hy]; }
  }

  /** Огоньки заряда: сходятся к рукам (motes) и орбиты четырёх цветов (orbs). */
  motes(ctx, P, t, o) {
    if (o.hit) return;
    ctx.globalCompositeOperation = 'lighter';
    if (P.motes > 0.02 && this.handL && this.handR) {
      const gg = this.glow(P.gv);
      const hands = [this.handL, this.handR];
      for (let h = 0; h < 2; h++) {
        for (let i = 0; i < 6; i++) {
          const ph = (t * 1.2 + i / 6 + h * 0.5) % 1;
          const k = 1 - ph;
          const ang = (i / 6) * TAU + t * 2 + h;
          const rad = 0.75 * k * P.motes;
          const px = hands[h][0] + Math.cos(ang) * rad;
          const py = hands[h][1] + Math.sin(ang) * rad * 0.8;
          ctx.globalAlpha = Math.min(1, ph * 2) * P.motes;
          const s = 0.06 + 0.05 * ph;
          ctx.drawImage(gg, px - s * 2, py - s * 2, s * 4, s * 4);
        }
      }
    }
    if (P.orbs && P.orbs.length && this.handL && this.handR) {
      const cx = (this.handL[0] + this.handR[0]) / 2;
      const cy = Math.min(this.handL[1], this.handR[1]) - 0.1;
      const n = P.orbs.length;
      for (let i = 0; i < n; i++) {
        const ang = t * 2.2 + (i / n) * TAU;
        const px = cx + Math.cos(ang) * 0.55;
        const py = cy + Math.sin(ang) * 0.22 - 0.1;
        const gg = this.glow(P.orbs[i]);
        ctx.globalAlpha = 0.95;
        ctx.drawImage(gg, px - 0.2, py - 0.2, 0.4, 0.4);
        ctx.fillStyle = '#fff';
        ctx.globalAlpha = 0.9;
        ctx.beginPath(); ctx.arc(px, py, 0.035, 0, TAU); ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  /** Сглаженная поза: плавно переходим от прежней к целевой, чтобы руки не дёргались. */
  smoothPose(key, T, dt) {
    let S = this.ps.get(key);
    if (!S) { S = { arms: T.arms || 0, spread: T.spread || 0, glow: 0, motes: 0, aimW: 0, open: 0.3, shake: 0, limp: 0 }; this.ps.set(key, S); }
    const k = 1 - Math.exp(-dt / (T.fast ? 0.07 : 0.22));
    S.arms += ((T.arms || 0) - S.arms) * k;
    S.spread += ((T.spread || 0) - S.spread) * k;
    S.glow += ((T.glow || 0) - S.glow) * k;
    S.motes += ((T.motes || 0) - S.motes) * k;
    S.aimW += ((T.aim ? T.aimW : 0) - S.aimW) * k;
    S.open += ((T.open === undefined ? 0.3 : T.open) - S.open) * k;
    S.shake += ((T.shake || 0) - S.shake) * k;
    S.limp += ((T.limp || 0) - S.limp) * k;
    S.aim = T.aim || S.aim;
    S.gv = T.gv;
    S.orbs = T.orbs;
    return S;
  }

  // ---------- босс ----------

  /**
   * Босс. Вторая фаза идёт в негативе мира (renderer.drawNegative инвертирует всю картинку после врагов), поэтому
   * при negative > 0 рисуем его в буфер, инвертируем и кладём: после общего негатива цвета снова такие, как задуманы
   * (чёрное тело, бледное лицо, красные огни).
   */
  boss(ctx, e, x, y, R, hit, stunned) {
    this.neg(ctx, x, y, R * 3, (c) => this.bossDraw(c, e, x, y, R, hit, stunned));
  }

  /** Рисует fn(ctx) в мире; в негативе (вторая фаза) через буфер с обратными цветами. S: половина стороны области. */
  neg(ctx, x, y, S, fn) {
    const a = this.r.apotheosis;
    const neg = a ? a.negative : 0;
    if (neg < 0.02) { fn(ctx); return; }
    const m = ctx.getTransform();
    const sc = Math.max(0.2, Math.hypot(m.a, m.b));
    const W = S * 2;
    const pw = Math.ceil(W * sc);
    if (pw > 2600) { fn(ctx); return; }
    let A = this.bufA;
    let B = this.bufB;
    if (!A || A.width < pw) {
      A = this.bufA = this.mk(pw, pw);
      B = this.bufB = this.mk(pw, pw);
    }
    const ca = A.getContext('2d');
    const cb = B.getContext('2d');
    ca.setTransform(1, 0, 0, 1, 0, 0);
    ca.clearRect(0, 0, A.width, A.height);
    ca.setTransform(sc, 0, 0, sc, pw / 2 - x * sc, pw / 2 - y * sc);
    fn(ca);
    ca.setTransform(1, 0, 0, 1, 0, 0);
    // B = обратные цвета A в форме A: белый фон, разность с A, затем маска по прозрачности A.
    cb.setTransform(1, 0, 0, 1, 0, 0);
    cb.globalCompositeOperation = 'source-over';
    cb.globalAlpha = 1;
    cb.clearRect(0, 0, B.width, B.height);
    cb.fillStyle = '#ffffff';
    cb.fillRect(0, 0, pw, pw);
    cb.globalCompositeOperation = 'difference';
    cb.drawImage(A, 0, 0);
    cb.globalCompositeOperation = 'destination-in';
    cb.drawImage(A, 0, 0);
    cb.globalCompositeOperation = 'source-over';
    ctx.drawImage(B, 0, 0, pw, pw, x - W / 2, y - W / 2, W, W);
  }

  mk(w, h) {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  bossDraw(ctx, e, x, y, R, hit, stunned) {
    const r = this.r;
    const a = r.apotheosis;
    const dt = r.dt;
    const t = r.clock;
    const st = a ? a.state : 'off';
    // Жуть лица и мертвенность по ходу боя: перед «Превращением» лицо искажается, во второй фазе мертвенное.
    let exT = 0;
    let dkT = 0;
    if (a) {
      if (a.phase2) { exT = 1; dkT = 1; }
      else if (st === 'tf-shrink') { exT = 0.4; dkT = 0.05; }
      else if (st === 'tf-grab') { exT = 0.7; dkT = 0.25; }
      else if (st === 'tf-turn') { exT = 1; dkT = 0.5; }
      else if (st === 'tf-tear') { exT = 1; dkT = 0.8; }
      else if (st === 'tf-form') { exT = 1; dkT = 0.95; }
      else if (st === 'flash-charge') exT = 0.35;
      else if (st === 'beams-tele' || st === 'beams-fire') exT = 0.25;
    }
    const k = 1 - Math.exp(-dt / 0.5);
    this.ex += (exT - this.ex) * k;
    this.dk += (dkT - this.dk) * k;
    const ex = this.ex;
    const dk = this.dk;
    const dead = clamp01(dk);
    let pal = hit ? HITP : palMix(GOLD, BONE, dead);
    if (stunned && !hit) pal = palMix(pal, { light: '#f2f8ff', mid: '#a8c8ff', dark: '#4a5c8a', deep: '#10182c', glow: 'blue', eye: '#9fd0ff' }, 0.6);
    // Вздрагивание лица в жути: короткие рывки головы.
    const tw = ex > 0.5 ? (Math.sin(t * 31) * Math.sin(t * 2.3) > 0.82 ? 0.05 * ex : 0) : 0;
    const hr = R * 0.5;
    const hy = y - R * 0.85;
    const hero = r.hero;
    let lx = hero ? hero.x - x : 0;
    let ly = hero ? hero.y - hy : 1;
    const ll = Math.hypot(lx, ly) || 1;
    lx /= ll; ly /= ll;
    const rim = dead > 0.5 ? mix('#8a7cd0', '#cfc8ff', 0.4) : mix('#8f7bff', '#b9a8ff', 0.3);
    const hcol = dead > 0.5 ? 'blue' : 'gold';
    const pose = this.smoothPose(e, this.bossPose(a, e, st, dead), dt);
    this.robe(ctx, x, y + R * 0.08, R, {
      pose, t, rim, dk: dead, hit, fold: dead > 0.5 ? '#1b1d38' : '#1a1735', hem: 9,
      glowV: dead > 0.5 ? 'blue' : true, haloA: 0.2 + 0.2 * dead,
      spill: hit ? 0 : 0.2 - 0.1 * dead, spillV: hcol, crack: '#ff4a5a',
    });
    if (dead > 0.4 && !hit) { // чёрная окантовка лучей: бледная голова не теряется на светлом фоне негатива
      ctx.save();
      ctx.translate(x + tw * hr, hy);
      ctx.rotate(e.headAngle);
      ctx.scale(hr * 1.1, hr * 1.1);
      ctx.globalAlpha = Math.min(1, (dead - 0.4) * 2.5);
      this.rays(ctx, SUN.mid, INK, ex, t, e.headAngle, 0.7);
      this.rays(ctx, SUN.long, INK, ex, t, e.headAngle, 1);
      ctx.restore();
    }
    // Голова: лучи, лицо, огни. Лицо поворачивается вместе с головой (проворот = применённые умения).
    this.mask(ctx, x + tw * hr, hy, hr, {
      angle: e.headAngle, expr: ex, pal, st: SUN, t, look: { x: lx, y: ly }, hit,
      glowA: 0.28 + 0.3 * (1 - dead) + 0.1 * ex,
    });
    // Зарядка вспышки: голова раскаляется.
    if (a && st === 'flash-charge' && !hit) {
      const F = e.def.flash;
      const kk = Math.min(1, a.t / Math.max(0.01, F.charge));
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = this.glow(undefined);
      const s = hr * (3 + 3.5 * kk);
      ctx.globalAlpha = 0.25 + 0.55 * kk;
      ctx.drawImage(g, x - s, hy - s, s * 2, s * 2);
      ctx.restore();
    }
  }

  /** Целевая поза босса по умению: руки, свет в ладонях, сходящиеся огоньки. */
  bossPose(a, e, st, dead) {
    const r = this.r;
    const ap = r.apostles;
    const gv = dead > 0.5 ? 'blue' : 'gold';
    const T = { arms: 0.04, spread: 0, glow: 0, motes: 0, gv, open: 0.3, shake: 0 };
    if (!a) return T;
    const tt = a.t || 0;
    if (st === 'apostles' || (ap && ap.state === 'summon')) { // призыв: руки к небу, свет собирается
      const k = ap && ap.A ? Math.min(1, ap.t / Math.max(0.01, ap.A.castTime)) : 0.7;
      T.arms = 0.5 + 0.45 * k; T.spread = 0.3; T.glow = 0.4 + 0.5 * k; T.motes = 0.9; T.open = 1; T.fast = true;
    } else if (st === 'emerge' || st === 'retract') { T.arms = 0.55; T.spread = 0.5; T.glow = 0.4; T.gv = true; T.open = 0.8; }
    else if (st === 'slams') { T.arms = 0.75; T.spread = 0.3; T.glow = 0.6; T.gv = true; T.shake = 0.4; T.open = 1; }
    else if (st === 'beams-tele') { T.arms = 0.5; T.spread = 1; T.glow = 0.6; T.motes = 0.5; T.open = 1; }
    else if (st === 'beams-fire') { T.arms = 0.5; T.spread = 1; T.glow = 1; T.shake = 0.6; T.open = 1; T.fast = true; }
    else if (st === 'crumble') { T.arms = 0.1; T.spread = 0.6; T.aim = { x: 0, y: 1 }; T.aimW = 0.6; T.glow = 0.8; T.gv = true; T.shake = 0.5; T.open = 1; }
    else if (st === 'flash-charge') {
      const F = e.def.flash;
      const k = Math.min(1, tt / Math.max(0.01, F ? F.charge : 2));
      T.arms = 0.55 + 0.45 * k; T.spread = 0.2; T.glow = k; T.motes = k; T.open = 1; T.shake = 0.5 * k; T.gv = undefined;
    } else if (st === 'flash-burst') { T.arms = 1; T.spread = 1; T.glow = 1; T.shake = 0.6; T.open = 1; T.fast = true; T.gv = undefined; }
    else if (st === 'rise') { T.arms = 0.9; T.spread = 0.25; T.glow = 0.7; T.motes = 0.7; T.open = 1; T.gv = 'blue'; }
    else if (st === 'omni-charge' || st === 'omni-run') { T.arms = 0.65; T.spread = 0.8; T.glow = 0.8; T.motes = 0.7; T.open = 1; T.orbs = ['gold', 'red', 'blue', true]; T.gv = 'blue'; }
    else if (st === 'tf-shrink') { T.arms = 0.3; T.shake = 0.3; }
    else if (st === 'tf-grab') { T.arms = 0.95; T.spread = 0; T.shake = 0.8; T.open = 1; }
    else if (st === 'tf-turn') { T.arms = 0.7; T.spread = 0.2; T.shake = 1; T.open = 1; }
    else if (st === 'tf-tear' || st === 'tf-form') { T.arms = 1; T.spread = 1; T.shake = 0.6; T.glow = 0.5; T.gv = 'red'; T.open = 1; }
    return T;
  }

  /** Целевая поза апостола: идёт замах его умения (cast) или тянется притяжение/отталкивание. */
  apostlePose(e, x, y, rr, kind) {
    const r = this.r;
    const ap = r.apostles;
    const hero = r.hero;
    const T = { arms: 0.04, spread: 0, glow: 0, motes: 0, gv: undefined, open: 0.3, shake: 0 };
    const col = { faith: 'gold', truth: 'gold', force: undefined, love: 'red' }[kind];
    T.gv = col;
    const toHero = hero ? { x: hero.x - x, y: hero.y - (y - rr * 0.6) } : { x: 0, y: 1 };
    if (ap && ap.cast && ap.cast.e === e) {
      const k = Math.min(1, ap.cast.t / Math.max(0.01, ap.A.spellCast));
      T.fast = true; T.glow = 0.3 + 0.7 * k; T.motes = k; T.open = 1;
      if (kind === 'faith') { T.arms = 0.5 + 0.45 * k; T.spread = 0.25; }
      else if (kind === 'truth') { T.arms = 0.7 + 0.25 * k; T.spread = 0.1; }
      else if (kind === 'force') { T.arms = 0.45; T.aim = toHero; T.aimW = 0.9; T.shake = 0.5 * k; }
      else { T.arms = 0.35; T.spread = 1; }
    } else if (ap && ap.pull && ap.pull.e === e) { T.arms = 0.45; T.aim = toHero; T.aimW = 0.9; T.glow = 0.7; T.open = 1; T.shake = 0.3; }
    else if (ap && ap.loveT > 0 && kind === 'love') { T.arms = 0.3; T.spread = 1; T.glow = 0.5; T.open = 1; }
    return T;
  }

  // ---------- апостолы ----------

  apostle(ctx, e, x, y, rr, hit) {
    const r = this.r;
    const t = r.clock + (e.x * 0.013);
    const kind = e.def.apostle;
    const st = APOSTLE[kind] || APOSTLE.faith;
    const hr = rr * 0.62;
    const hy = y - rr * 1.2;
    const hero = r.hero;
    let lx = hero ? hero.x - x : 0;
    let ly = hero ? hero.y - hy : 1;
    const ll = Math.hypot(lx, ly) || 1;
    lx /= ll; ly /= ll;
    const pal = hit ? HITP : st.pal;
    // Мантия меньше босса: центр ниже головы.
    const pose = this.smoothPose(e, this.apostlePose(e, x, y, rr, kind), r.dt);
    this.robe(ctx, x, y - rr * 0.1, rr * 0.92, {
      pose, t, rim: st.rim, dk: 0, hit, fold: mix('#101226', st.pal.mid, 0.18), hem: 7,
      glowV: st.pal.glow === undefined ? undefined : st.pal.glow, haloA: 0.18, spill: hit ? 0 : 0.22, spillV: st.pal.glow, crack: st.rim,
    });
    this.mask(ctx, x, hy, hr, {
      angle: Math.sin(t * 0.7) * 0.05, expr: (kind === 'force' ? 0.15 : 0) + 0.5 * pose.glow, pal, st, t, look: { x: lx, y: ly }, hit, glowA: 0.4,
    });
  }

  // ---------- вторая фаза: оболочки и восставшие ----------

  /** Восставший апостол: бегущая тёмная фигура с костяной маской, наклон по ходу. */
  risen(ctx, e, x, y, rr, hit) {
    const r = this.r;
    const t = r.clock + e.x * 0.02;
    const hero = r.hero;
    const dx = hero ? hero.x - x : 0;
    const lean = Math.max(-0.3, Math.min(0.3, dx * 0.01));
    const hr = rr * 0.7;
    this.neg(ctx, x, y, rr * 4, (c) => {
      c.save();
      c.translate(x, y);
      c.rotate(lean);
      c.translate(-x, -y + Math.sin(t * 14) * rr * 0.06);
      this.robe(c, x, y - rr * 0.1, rr * 0.95, { pose: { arms: 0.5 + 0.2 * Math.sin(t * 14), spread: 0.3, glow: 0, motes: 0, open: 1, aimW: 0, shake: 0, limp: 0 }, t: t * 2, rim: '#cfc8ff', dk: 1, hit, fold: '#1b1d38', hem: 7, glowV: 'blue', haloA: 0.2, spill: 0, spillV: 'blue', crack: '#ff4a5a' });
      this.mask(c, x, y - rr * 1.2, hr, { angle: Math.sin(t * 9) * 0.12, expr: 0.8, pal: hit ? HITP : BONE, st: RISEN, t, look: { x: 0, y: 0.4 }, hit, glowA: 0.25 });
      c.restore();
    });
  }

  /** Выключенная оболочка апостола: лежит боком тусклая и мёртвая, при вставании светлеет (k, e 0..1). */
  husk(ctx, x, y, rr, kind, k, e, rot) {
    const t = this.r.clock;
    const st = APOSTLE[kind] || RISEN;
    const hr = rr * 0.62;
    this.neg(ctx, x, y, rr * 4, (c) => {
      c.save();
      c.translate(x, y);
      c.rotate(rot);
      c.translate(-x, -y);
      this.robe(c, x, y - rr * 0.1, rr * 0.92, { pose: { arms: 0.1 + 0.6 * e, spread: 0.2, glow: 0, motes: 0, open: 0.3, aimW: 0, shake: 0, limp: 1 - e }, t, rim: '#9a96c0', dk: 0.6 * e, hit: false, fold: '#14162a', hem: 7, glowV: 'blue', haloA: 0.08 + 0.15 * e, spill: 0, spillV: 'blue', crack: '#ff4a5a' });
      c.globalAlpha = 0.55 + 0.45 * e;
      this.mask(c, x, y - rr * 1.2, hr, { angle: 0, expr: 0.3 + 0.6 * e, pal: palMix(BONE, INK, 0.55 * (1 - e)), st: Object.assign({}, st, { long: RISEN.long, mid: null, halo: false, teeth: 0 }), t, look: { x: 0, y: 0.4 }, hit: false, glowA: 0.1 + 0.2 * e });
      c.globalAlpha = 1;
      c.restore();
    });
  }
}
