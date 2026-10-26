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

export class ApotheosisArt {
  constructor(renderer) {
    this.r = renderer;
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

  // ---------- мантия ----------

  /**
   * Чёрная мантия с гранёными складами: слева светлее. Контур подсвечен холодным светом, чтобы фигура читалась на тьме.
   * s: масштаб в единицах R; rim: цвет контурного света; dk 0..1: мертвенность (вторая фаза).
   */
  robe(ctx, x, y, R, o) {
    const t = o.t;
    const rim = o.rim;
    const flut = (i) => Math.sin(t * 1.6 + i * 1.3) * 0.04;
    // Контур: плечи, бока, подол зигзагом.
    const top = [[-0.3, -0.64], [0.3, -0.64], [0.95, -0.3]];
    const hemN = o.hem || 9;
    const hem = [];
    for (let i = 0; i <= hemN; i++) {
      const u = i / hemN;
      const hx = lerp(1.1, -1.1, u);
      const hy = 1.0 + (i % 2 ? 0.26 : 0.04) + flut(i) * (1 + o.dk);
      hem.push([hx, hy]);
    }
    const sides = [[1.0, 0.25], [1.1, 0.7]];
    const lsides = [[-1.1, 0.7], [-1.0, 0.25]];
    const pts = top.concat(sides, hem, lsides, [[-0.95, -0.3]]);
    // Тень под фигурой остаётся от общего кода; рисуем тело.
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(R, R);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    // Ореол за спиной: холодный, чтобы силуэт отделялся от тьмы.
    ctx.globalCompositeOperation = 'lighter';
    const g = this.glow(o.glowV);
    ctx.globalAlpha = o.haloA;
    ctx.drawImage(g, -1.9, -1.7, 3.8, 3.8);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    // Основа.
    ctx.fillStyle = o.hit ? '#ffffff' : '#05060c';
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fill();
    if (!o.hit) {
      // Грани складок: полосы от плеч к подолу, левые светлее, с тёмными промежутками.
      const K = 8;
      for (let i = 0; i < K; i++) {
        const u0 = i / K;
        const u1 = (i + 1) / K;
        const tx0 = lerp(-0.95, 0.95, u0);
        const tx1 = lerp(-0.95, 0.95, u1);
        const ty0 = lerp(-0.3, -0.3, u0) - 0.3 * Math.sin(Math.PI * u0) * 0.9;
        const ty1 = -0.3 - 0.3 * Math.sin(Math.PI * u1) * 0.9;
        const h0 = hem[Math.min(hemN, Math.round((1 - u0) * hemN))];
        const h1 = hem[Math.min(hemN, Math.round((1 - u1) * hemN))];
        const b = (1 - (u0 + u1) / 2) * 0.55 + 0.1 * (i % 2);
        ctx.fillStyle = mix('#05060c', o.fold, clamp01(b));
        ctx.beginPath();
        ctx.moveTo(tx0 * 0.98, ty0);
        ctx.lineTo(tx1 * 0.98, ty1);
        ctx.lineTo(h1[0] * (0.9 + 0.1 * u1), h1[1]);
        ctx.lineTo(h0[0] * (0.9 + 0.1 * u0), h0[1]);
        ctx.closePath();
        ctx.fill();
      }
      // Контурный свет: слева и по плечам яркий, справа слабый.
      ctx.strokeStyle = rim;
      ctx.lineWidth = 0.035;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(0.3, -0.64); ctx.lineTo(-0.3, -0.64); ctx.lineTo(-0.95, -0.3); ctx.lineTo(-1.0, 0.25); ctx.lineTo(-1.1, 0.7); ctx.lineTo(hem[hemN][0], hem[hemN][1]);
      ctx.stroke();
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.moveTo(0.3, -0.64); ctx.lineTo(0.95, -0.3); ctx.lineTo(1.0, 0.25); ctx.lineTo(1.1, 0.7); ctx.lineTo(hem[0][0], hem[0][1]);
      ctx.stroke();
      // Подол: светящаяся кромка зубцов.
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.moveTo(hem[0][0], hem[0][1]);
      for (let i = 1; i <= hemN; i++) ctx.lineTo(hem[i][0], hem[i][1]);
      ctx.stroke();
      // Свечение по контуру: широкая мягкая полоса, видна на тёмном.
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.16;
      ctx.lineWidth = 0.14;
      ctx.beginPath();
      ctx.moveTo(0.3, -0.64); ctx.lineTo(-0.3, -0.64); ctx.lineTo(-0.95, -0.3); ctx.lineTo(-1.0, 0.25); ctx.lineTo(-1.1, 0.7);
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    // Воротник: чёрные осколки веером вокруг шеи, повторяют лучи солнца.
    const nS = 13;
    for (let i = 0; i < nS; i++) {
      const a = Math.PI * (0.02 + 0.96 * (i / (nS - 1)));
      const L = 0.36 + 0.18 * hash(i + 41) + 0.1 * o.dk;
      const bx = Math.cos(a) * 0.42;
      const by = -0.85 + Math.sin(a) * 0.3 + 0.18;
      ctx.fillStyle = o.hit ? '#fff' : mix('#05060c', o.fold, 0.2 + 0.4 * (1 - i / nS));
      ctx.beginPath();
      ctx.moveTo(bx - Math.sin(a) * 0.06, by + Math.cos(a) * 0.0);
      ctx.lineTo(bx + Math.cos(a) * L * 1.2, by + Math.sin(a) * L * 0.9 + 0.05);
      ctx.lineTo(bx + Math.sin(a) * 0.06, by);
      ctx.closePath();
      ctx.fill();
    }
    // Свет головы стекает на плечи.
    if (!o.hit && o.spill > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = o.spill;
      const gs = this.glow(o.spillV);
      ctx.drawImage(gs, -1.3, -1.35, 2.6, 2.1);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    // Щупальца-лоскуты подола (вторая фаза): тонкие чёрные плети качаются под фигурой.
    if (o.dk > 0.05 && !o.hit) {
      ctx.strokeStyle = '#05060c';
      ctx.lineCap = 'round';
      for (let i = 0; i < 6; i++) {
        const hx = lerp(-0.85, 0.85, i / 5);
        const sw = Math.sin(t * 1.4 + i * 1.9);
        ctx.lineWidth = 0.1 * (0.6 + 0.4 * hash(i + 71));
        ctx.globalAlpha = Math.min(1, o.dk * 1.2);
        ctx.beginPath();
        ctx.moveTo(hx, 1.1);
        ctx.quadraticCurveTo(hx + sw * 0.18, 1.45, hx + sw * 0.34, 1.8 + 0.2 * hash(i + 33));
        ctx.stroke();
        ctx.strokeStyle = rim;
        ctx.lineWidth = 0.02;
        ctx.globalAlpha = Math.min(0.7, o.dk);
        ctx.beginPath();
        ctx.moveTo(hx - 0.03, 1.1);
        ctx.quadraticCurveTo(hx - 0.03 + sw * 0.18, 1.45, hx - 0.03 + sw * 0.34, 1.8 + 0.2 * hash(i + 33));
        ctx.stroke();
        ctx.strokeStyle = '#05060c';
      }
      ctx.globalAlpha = 1;
    }
    // Трещины света на груди (вторая фаза).
    if (o.dk > 0.3 && !o.hit) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = o.crack;
      const pul = 0.6 + 0.4 * Math.sin(t * 3);
      ctx.globalAlpha = (o.dk - 0.3) * 1.2 * pul;
      ctx.lineWidth = 0.025;
      const cr = [[-0.4, -0.2, -0.5, 0.2, -0.38, 0.5, -0.46, 0.85], [0.3, -0.25, 0.42, 0.1, 0.3, 0.45], [0, 0.0, -0.05, 0.4, 0.06, 0.8]];
      for (let i = 0; i < cr.length; i++) {
        const c = cr[i];
        ctx.beginPath(); ctx.moveTo(c[0], c[1]);
        for (let j = 2; j < c.length; j += 2) ctx.lineTo(c[j], c[j + 1]);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    ctx.restore();
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
    this.robe(ctx, x, y + R * 0.08, R, {
      t, rim, dk: dead, hit, fold: dead > 0.5 ? '#1b1d38' : '#1a1735', hem: 9,
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
    this.robe(ctx, x, y - rr * 0.1, rr * 0.92, {
      t, rim: st.rim, dk: 0, hit, fold: mix('#101226', st.pal.mid, 0.18), hem: 7,
      glowV: st.pal.glow === undefined ? undefined : st.pal.glow, haloA: 0.18, spill: hit ? 0 : 0.22, spillV: st.pal.glow, crack: st.rim,
    });
    this.mask(ctx, x, hy, hr, {
      angle: Math.sin(t * 0.7) * 0.05, expr: kind === 'force' ? 0.15 : 0, pal, st, t, look: { x: lx, y: ly }, hit, glowA: 0.4,
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
      this.robe(c, x, y - rr * 0.1, rr * 0.95, { t: t * 2, rim: '#cfc8ff', dk: 1, hit, fold: '#1b1d38', hem: 7, glowV: 'blue', haloA: 0.2, spill: 0, spillV: 'blue', crack: '#ff4a5a' });
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
      this.robe(c, x, y - rr * 0.1, rr * 0.92, { t, rim: '#9a96c0', dk: 0.6 * e, hit: false, fold: '#14162a', hem: 7, glowV: 'blue', haloA: 0.08 + 0.15 * e, spill: 0, spillV: 'blue', crack: '#ff4a5a' });
      c.globalAlpha = 0.55 + 0.45 * e;
      this.mask(c, x, y - rr * 1.2, hr, { angle: 0, expr: 0.3 + 0.6 * e, pal: palMix(BONE, INK, 0.55 * (1 - e)), st: Object.assign({}, st, { long: RISEN.long, mid: null, halo: false, teeth: 0 }), t, look: { x: 0, y: 0.4 }, hit: false, glowA: 0.1 + 0.2 * e });
      c.globalAlpha = 1;
      c.restore();
    });
  }
}
