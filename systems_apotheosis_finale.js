// Апофеоз: конец боя. Умение 5 второй фазы «Разлом платформы» и эпилог (пока босс «не побеждён» ударами, а сам уходит).
//
// «Разлом платформы» (startPath / updatePath): круглая туманная платформа постепенно рушится кусками (по лучам от центра, у каждого
//   луча своя задержка), пока не останется узкая дорожка по центру, ведущая к боссу (pathbreak.halfWidth). Дорожка тянется от низа
//   платформы вверх до босса. Герой, оказавшийся за кромкой, сдвигается на дорожку (так работает любая arena.zone). Кончается
//   проворотом головы: десятый проворот это 360°, голова встаёт на место (проворот делает finishP2Ability оркестра).
//
// Эпилог (startEnding / update), умение 'ending': по шагам (enemies.apotheosis.ending):
//   say «Ладно» → negative (негатив уходит) → say «Ты меня не удивил» → say «Кошмар всегда повторяется» → pause →
//   turn (ещё один проворот головы) → glow (босс сильно светится) → dissolve (рассыпается, осколки) →
//   portal (на его месте портал, герой идёт по дорожке; коснулся: событие 'apotheosis:victory', игра кончается надписью «Победа?»).
//   Реплики это Finale.line / lineA (рисует renderer над боссом).
//
// События: 'apotheosis:crack' { x, y } (откололся кусок платформы), 'apotheosis:say' { text }, 'apotheosis:dissolve',
//          'portal:opened' { portal } (как у портала перед боссом: эффект и стрелка на краю экрана), 'apotheosis:victory'.
// Графика: ЗАГЛУШКА (renderer.drawFinale).
const TAU = Math.PI * 2;
const ease = (k) => k * k * (3 - 2 * k);
const clamp01 = (k) => (k < 0 ? 0 : k > 1 ? 1 : k);

/** Расстояние от (cx, cy) до границы многоугольника по лучу с углом ang. */
export function rayDist(poly, cx, cy, ang) {
  const dx = Math.cos(ang);
  const dy = Math.sin(ang);
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((a.x - cx) * ey - (a.y - cy) * ex) / den;
    const u = ((a.x - cx) * dy - (a.y - cy) * dx) / den;
    if (t > 0 && u >= -1e-9 && u <= 1 + 1e-9 && t < best) best = t;
  }
  return best;
}

export class Finale {
  /** ai: ApotheosisAI (даёт boss, arena, hero, bus, rnd, turns, negative, madTurn, finishP2Ability). */
  constructor(ai) {
    this.ai = ai;
    this.reset();
  }

  reset() {
    this.stage = 'off';  // off | path | ending | portal | won
    this.t = 0;
    this.step = 0;
    this.steps = [];
    this.line = '';      // реплика над боссом
    this.lineA = 0;      // её прозрачность 0..1
    this.glow = 0;       // 0..1 свечение босса
    this.dissolve = 0;   // 0..1 босс рассыпается (прозрачность)
    this.shards = [];    // осколки: { x, y, vx, vy, life, age, r }
    this.exit = null;    // портал конца игры { x, y, r, alpha, state, t }
    this.path = null;    // данные разлома платформы
    this.E = null;       // enemies.apotheosis.ending (запомнен при старте эпилога)
  }

  // ---------- Разлом платформы ----------

  startPath() {
    const ai = this.ai;
    const boss = ai.boss;
    const P = boss.def.pathbreak;
    const z = ai.arena.zone;
    if (!z || !z.poly) { ai.finishP2Ability(); return; }
    const cx = (z.left + z.right) / 2;
    const cy = (z.top + z.bottom) / 2;
    const top = boss.y - 10; // дорожка доходит до босса
    const bot = cy + (z.bottom - cy) * P.lengthK;
    const hw = P.halfWidth;
    const strip = [{ x: cx - hw, y: top }, { x: cx + hw, y: top }, { x: cx + hw, y: bot }, { x: cx - hw, y: bot }];
    const ang = [];
    for (let i = 0; i < P.rays; i++) ang.push(-Math.PI + (i + 0.5) * TAU / P.rays);
    for (const c of strip) ang.push(Math.atan2(c.y - cy, c.x - cx)); // углы дорожки: острые углы без скруглений
    ang.sort((a, b) => a - b);
    const A = [];
    for (let i = 0; i < ang.length; i++) if (!A.length || ang[i] - A[A.length - 1] > 1e-3) A.push(ang[i]);
    const cur = z.poly.map((p) => ({ x: p.x, y: p.y }));
    const R0 = A.map((a) => rayDist(cur, cx, cy, a));
    const R1 = A.map((a) => rayDist(strip, cx, cy, a));
    const delay = A.map(() => ai.rnd() * P.spread);
    this.path = { cx, cy, ang: A, R0, R1, delay, started: A.map(() => false) };
    this.stage = 'path';
    this.t = 0;
    ai.state = 'path';
  }

  updatePath(dt) {
    const ai = this.ai;
    const P = ai.boss.def.pathbreak;
    const f = this.path;
    if (!f) { ai.finishP2Ability(); return; }
    this.t += dt;
    const u = this.t / Math.max(0.01, P.time);
    const poly = [];
    let l = Infinity, r = -Infinity, t = Infinity, b = -Infinity;
    const span = Math.max(0.05, 1 - P.spread);
    for (let i = 0; i < f.ang.length; i++) {
      const k = ease(clamp01((u - f.delay[i]) / span));
      const rad = f.R0[i] + (f.R1[i] - f.R0[i]) * k;
      const x = f.cx + Math.cos(f.ang[i]) * rad;
      const y = f.cy + Math.sin(f.ang[i]) * rad;
      poly.push({ x, y });
      if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y;
      if (!f.started[i] && k > 0.02 && f.R1[i] < f.R0[i]) { // кусок откололся
        f.started[i] = true;
        ai.bus.emit('apotheosis:crack', { x: f.cx + Math.cos(f.ang[i]) * f.R0[i], y: f.cy + Math.sin(f.ang[i]) * f.R0[i] });
      }
    }
    ai.arena.setZone({ left: l, right: r, top: t, bottom: b, poly });
    if (this.t >= P.time) {
      this.stage = 'off';
      this.path = null;
      ai.finishP2Ability(); // десятый проворот: голова на место
    }
  }

  // ---------- Эпилог ----------

  startEnding() {
    const ai = this.ai;
    const E = ai.boss.def.ending;
    this.E = E; // запоминаем: после распада у босса def обнуляется (запись возвращается в пул)
    this.stage = 'ending';
    this.t = 0;
    this.step = -1;
    this.steps = [
      { k: 'say', text: E.lines[0], dur: E.sayTimes[0] },
      { k: 'neg', dur: E.negativeFade },
      { k: 'say', text: E.lines[1], dur: E.sayTimes[1] },
      { k: 'say', text: E.lines[2], dur: E.sayTimes[2] },
      { k: 'pause', dur: E.pause },
      { k: 'turn', dur: E.turnTime },
      { k: 'glow', dur: E.glowTime },
      { k: 'dissolve', dur: E.dissolveTime },
    ];
    ai.state = 'ending';
    this.nextStep();
  }

  nextStep() {
    const ai = this.ai;
    this.step++;
    this.t = 0;
    const s = this.steps[this.step];
    if (!s) { this.openPortal(); return; }
    if (s.k === 'say') {
      this.line = s.text;
      ai.bus.emit('apotheosis:say', { text: s.text });
    } else if (s.k === 'turn') {
      this.line = '';
      ai.turns++; // ещё один проворот: 360° + 36°
      ai.madTurn = true;
      ai.bus.emit('apotheosis:head-turn', { turns: ai.turns });
    } else if (s.k === 'dissolve') {
      this.spawnShards();
      ai.bus.emit('apotheosis:dissolve', {});
    } else {
      this.line = '';
    }
  }

  spawnShards() {
    const ai = this.ai;
    const E = ai.boss.def.ending;
    const b = ai.boss;
    this.shards.length = 0;
    for (let i = 0; i < E.shards; i++) {
      const a = ai.rnd() * TAU;
      const sp = 40 + ai.rnd() * 160;
      const rr = ai.rnd() * b.radius;
      this.shards.push({ x: b.x + Math.cos(a) * rr, y: b.y + Math.sin(a) * rr * 0.8, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, life: E.dissolveTime + 0.6 + ai.rnd() * 0.5, age: 0, r: 2 + ai.rnd() * 4 });
    }
  }

  updateShards(dt) {
    for (let i = 0; i < this.shards.length; i++) {
      const s = this.shards[i];
      s.age += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= 1 - 1.2 * dt;
      s.vy *= 1 - 1.2 * dt;
    }
  }

  openPortal() {
    const ai = this.ai;
    const E = ai.boss.def.ending;
    const b = ai.boss;
    this.exit = { x: b.x, y: b.y, r: E.portalRadius, alpha: 0, state: 'open', t: 0 };
    this.stage = 'portal';
    this.line = '';
    this.glow = 0;
    this.dissolve = 1;
    b.active = false; // босс рассыпался: убираем без «убит» (не «победа ударами»)
    ai.apostles.dismiss();
    ai.apostles.reset(); // апостолов у убранного босса больше нет (их данные читают def босса)
    ai.bus.emit('portal:opened', { portal: this.exit });
  }

  /** Шаги эпилога и портал. В стадии 'portal' босса уже нет (зовёт оркестр, пока он или портал живы). */
  update(dt) {
    const ai = this.ai;
    const E = this.E;
    this.updateShards(dt);
    if (this.stage === 'portal') { this.updatePortal(dt, E); return; }
    if (this.stage !== 'ending') return;
    const s = this.steps[this.step];
    if (!s) return;
    this.t += dt;
    const k = clamp01(this.t / Math.max(0.01, s.dur));
    if (s.k === 'say') {
      const fin = 0.3;
      this.lineA = Math.min(clamp01(this.t / fin), clamp01((s.dur - this.t) / fin));
    } else if (s.k === 'neg') {
      ai.negative = 1 - ease(k); // негатив уходит
    } else if (s.k === 'turn') {
      // проворот делает оркестр (сглаживание madTurn), здесь только ждём
    } else if (s.k === 'glow') {
      this.glow = ease(k);
    } else if (s.k === 'dissolve') {
      this.glow = 1;
      this.dissolve = ease(k);
    }
    if (this.t >= s.dur) {
      if (s.k === 'neg') ai.negative = 0;
      if (s.k === 'turn') ai.madTurn = false;
      if (s.k === 'say') this.lineA = 0;
      this.nextStep();
    }
  }

  updatePortal(dt, E) {
    const ai = this.ai;
    const p = this.exit;
    if (!p) return;
    p.t += dt;
    if (p.state === 'open') {
      p.alpha = Math.min(1, p.t / Math.max(0.01, E.portalRise));
      const h = ai.hero;
      if (h.active && Math.hypot(h.x - p.x, h.y - p.y) <= E.portalCloseDist) {
        p.state = 'closing';
        p.t = 0;
        this.stage = 'won';
        ai.bus.emit('portal:closing', { portal: p });
        ai.bus.emit('apotheosis:victory', {});
      }
    }
  }

  /** Идёт ли ещё что-то после ухода босса (осколки, портал): тогда оркестр не сбрасывается. */
  alive() {
    return this.stage === 'portal' || this.stage === 'won';
  }

  /** Гаснущий после входа портал и осколки досчитываются отдельно. */
  tickAfter(dt) {
    this.updateShards(dt);
    const p = this.exit;
    if (p && p.state === 'closing') {
      p.t += dt;
      p.alpha = Math.max(0, 1 - p.t / 0.6);
    }
  }
}
