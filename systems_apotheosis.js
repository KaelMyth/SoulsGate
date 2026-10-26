// Апофеоз: оркестр умений финального босса и его голова-солнце.
//
// Пять умений первой фазы идут по очереди (enemies.apotheosis.abilities): сначала fixed ('apostles', 'hands'), затем pool
//   ('beams', 'crumble', 'flash') в случайном порядке, каждое по разу. Между умениями пауза afterDelay.
//   Каждое умение, когда оно кончилось, проворачивает голову на одно деление: у солнца rays лучей (10), поворот = 1/rays оборота.
//   Сама голова не вращается: проворот = знак «умение применено». После phaseAfter умений (5) босс готов ко второй фазе:
//   событие 'apotheosis:phase2' (поведения второй фазы пока нет, умения прекращаются). Будущее правило: если у босса кончилось
//   здоровье раньше, чем применено phaseAfter умений, голова сразу доворачивается до фазы перехода, минуя повороты по умениям.
//
//   Важно: во время умения голова может крутиться (умение «Лучи» качает её), но к концу умения она возвращается в то же
//   положение, где была, а засчитанный проворот на деление делает только завершение умения (finishAbility).
//
// 1 «Призыв апостолов» (systems_apostles.js): умение кончается, когда апостолы убиты.
// 2 «Руки»: по бокам острова вылезают огромные чёрные руки. Остров делится на hands.count полос сверху вниз; по очереди
//   (через hands.stagger) на полосе телеграф (hands.telegraph), потом рука падает на неё (парируется). Упавшая полоса безопасна.
// 3 «Лучи»: из головы по её лучам бьют лучи. Сначала тонкие красные линии-телеграфы (beams.telegraph), потом сами лучи
//   (beams.fireTime): они плавно поворачиваются на sweepDeg и возвращаются обратно, герой уходит в клин между ними.
//   Урон тиками, не парируется (блок гасит часть).
// 4 «Распад острова»: куски поля краснеют (crumble.telegraph) и обваливаются в пустоту: удар при обвале и тики урона, пока
//   герой стоит на провале (crumble.holdTime), потом кусок зарастает. Волны идут внахлёст, первый кусок каждой волны на герое.
// 5 «Вспышка»: голова заряжается flash.charge секунд, экран темнеет, потом вспышка на всё поле. Парирование гасит вспышку целиком
//   и оглушает босса (stunTime: он получает stunDamageMult урона, пауза между умениями стоит). Блок гасит часть.
//
// События: 'apotheosis:ability' { id }, 'apotheosis:hands-start', 'apotheosis:slam' { band, x, y }, 'apotheosis:beams-fire',
//          'apotheosis:crumble' { x, y, r }, 'apotheosis:flash' { parried }, 'apotheosis:stun', 'apotheosis:head-turn' { turns },
//          'apotheosis:phase2'. Графика: ЗАГЛУШКА (renderer.drawHands / drawBeams / drawCrumble / drawFlash).
import { pointInPoly } from './world_arena.js';

const TAU = Math.PI * 2;
const ABILITY_IDS = ['apostles', 'hands', 'beams', 'crumble', 'flash'];

export class ApotheosisAI {
  /** o: { config, hero, arena, apostles, combat, defense, bus, rnd } */
  constructor(o) {
    this.cfg = o.config;
    this.hero = o.hero;
    this.arena = o.arena;
    this.apostles = o.apostles;
    this.combat = o.combat;
    this.defense = o.defense || null;
    this.bus = o.bus;
    this.rnd = o.rnd || Math.random;
    this.boss = null;
    this.sequence = [];    // порядок умений первой фазы
    this.ability = null;   // идущее умение: 'apostles' | 'hands' | 'beams' | 'crumble' | 'flash' | null (пауза)
    this.state = 'off';    // off | apostles | emerge | slams | retract | beams-tele | beams-fire | crumble | flash-charge | flash-burst | gap | done
    this.t = 0;
    this.gapLen = 0;
    this.turns = 0;        // сколько умений завершено = на сколько делений повёрнута голова
    this.phase2 = false;
    this.spin = 0;         // качание головы во время «Лучей», радианы; к концу умения всегда 0
    this.spinDir = 1;
    this.stunT = 0;        // оглушение босса после парированной вспышки
    this.src = { x: 0, y: 0, active: true, parryable: true, enemy: null };       // удар руки
    this.beamSrc = { x: 0, y: 0, active: true, parryable: false, enemy: null };  // тик луча
    this.holeSrc = { x: 0, y: 0, active: true, parryable: false, enemy: null };  // обвал и тик провала
    this.flashSrc = { x: 0, y: 0, active: true, parryable: true, enemy: null };  // вспышка
    this.hands = [];       // полосы: { state 0 ждёт | 1 телеграф | 2 упала | 3 тёмная | 4 ушла, t, y0, y1, side }
    this.bandH = 0;
    this.emerge = 0;       // 0..1: насколько руки вылезли (для отрисовки)
    this.beamTick = 0;
    this.patches = [];     // куски поля: { x, y, r, state 0 телеграф | 1 провал | 2 зарастает | 3 нет, t }
    this.cwave = 0;
    this.cT = 0;
    this.cTick = 0;
    this.flashDim = 0;     // 0..1 затемнение экрана при зарядке вспышки (для отрисовки)
    this.flashWhite = 0;   // 0..1 белая вспышка (для отрисовки)
    this.bus.on('boss:spawned', ({ enemy }) => this.attach(enemy));
    this.bus.on('apostles:defeated', () => this.onApostlesDefeated());
    this.bus.on('enemy:killed', ({ enemy }) => { if (enemy === this.boss) this.reset(); });
    this.bus.on('enemy:hit-incoming', (inc) => { // оглушённый босс получает больше урона
      if (this.stunT > 0 && inc.enemy === this.boss) inc.amount *= this.boss.def.flash.stunDamageMult;
    });
  }

  attach(boss) {
    this.reset();
    if (!boss.def.hands) return;
    this.boss = boss;
    boss.headAngle = 0;
    this.sequence = this.buildSequence(boss.def.abilities);
    if (this.sequence[0] === 'apostles') {
      this.ability = 'apostles';
      this.state = 'apostles'; // призыв запускает сам systems_apostles.js (firstDelay)
    } else {
      this.apostles.requestSummon(Infinity); // апостолы не первые: сами не призываются
      this.enterGap(this.apostles.A.firstDelay);
    }
  }

  buildSequence(A) {
    const fixed = (A && A.fixed ? A.fixed : ['apostles', 'hands']).slice();
    const pool = (A && A.pool ? A.pool : ['beams', 'crumble', 'flash']).slice();
    for (let i = pool.length - 1; i > 0; i--) { // перемешать, каждое умение по разу
      const j = Math.floor(this.rnd() * (i + 1));
      const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
    }
    return fixed.concat(pool);
  }

  reset() {
    this.boss = null;
    this.sequence = [];
    this.ability = null;
    this.state = 'off';
    this.t = 0;
    this.turns = 0;
    this.phase2 = false;
    this.spin = 0;
    this.stunT = 0;
    this.emerge = 0;
    this.hands.length = 0;
    this.patches.length = 0;
    this.cwave = 0;
    this.cT = 0;
    this.flashDim = 0;
    this.flashWhite = 0;
  }

  get H() { return this.boss ? this.boss.def.hands : null; }

  /** Центр головы-солнца в мире (отсюда бьют лучи). */
  headPos() {
    const b = this.boss;
    return b ? { x: b.x, y: b.y - b.radius * 0.85 } : null;
  }

  /** Углы всех лучей головы сейчас (радианы): те же, по которым рисуются острия солнца. */
  beamAngles() {
    const b = this.boss;
    const out = [];
    if (!b) return out;
    const rays = b.def.head.rays;
    for (let k = 0; k < rays; k++) out.push(-Math.PI / 2 + b.headAngle + (k / rays) * TAU);
    return out;
  }

  /** Умение закончилось: голова проворачивается на одно деление. true, если босс готов ко второй фазе. */
  finishAbility() {
    this.turns++;
    this.bus.emit('apotheosis:head-turn', { turns: this.turns });
    const D = this.boss.def.head;
    this.ability = null;
    if (this.turns >= D.phaseAfter && !this.phase2) {
      this.phase2 = true;
      this.state = 'done';
      this.bus.emit('apotheosis:phase2', {});
      return true;
    }
    this.enterGap(this.boss.def.abilities.afterDelay);
    return false;
  }

  enterGap(len) {
    this.ability = null;
    this.state = 'gap';
    this.t = 0;
    this.gapLen = len;
  }

  onApostlesDefeated() {
    if (!this.boss || this.ability !== 'apostles') return;
    this.finishAbility(); // апостолы убиты: умение кончилось
  }

  /** Следующее умение по порядку. */
  startNext() {
    this.start(this.sequence[this.turns % this.sequence.length]);
  }

  start(id) {
    this.ability = id;
    this.t = 0;
    this.bus.emit('apotheosis:ability', { id });
    switch (id) {
      case 'apostles': this.state = 'apostles'; this.apostles.requestSummon(0); break;
      case 'hands': this.startHands(); break;
      case 'beams': this.startBeams(); break;
      case 'crumble': this.startCrumble(); break;
      case 'flash': this.startFlash(); break;
      default: this.enterGap(0);
    }
  }

  /** Отладка: немедленно начать умение id (то, что шло, обрывается; счётчик проворотов не меняется). */
  force(id) {
    if (!this.boss || this.phase2 || ABILITY_IDS.indexOf(id) < 0) return false;
    this.apostles.requestSummon(Infinity);
    this.apostles.dismiss();
    this.apostles.cast = null;
    this.apostles.pull = null;
    this.hands.length = 0;
    this.emerge = 0;
    this.patches.length = 0;
    this.spin = 0;
    this.flashDim = 0;
    this.flashWhite = 0;
    this.start(id);
    return true;
  }

  update(dt) {
    const boss = this.boss;
    if (!boss) return;
    if (!boss.active) { this.reset(); return; }
    // Голова плавно доворачивается до нужного деления (плюс качание умения «Лучи»).
    const D = boss.def.head;
    const target = this.turns * (TAU / D.rays) + this.spin;
    boss.headAngle += (target - boss.headAngle) * (1 - Math.exp(-dt / Math.max(0.01, D.turnSmooth)));
    if (Math.abs(target - boss.headAngle) < 1e-4) boss.headAngle = target;
    if (this.stunT > 0) this.stunT = Math.max(0, this.stunT - dt);

    this.t += dt;
    const H = boss.def.hands;
    switch (this.state) {
      case 'gap':
        if (this.stunT > 0) this.t = 0; // оглушённый босс: пауза стоит
        else if (this.t >= this.gapLen) this.startNext();
        break;
      case 'emerge':
        this.emerge = Math.min(1, this.t / Math.max(0.01, H.emergeTime));
        if (this.t >= H.emergeTime) { this.state = 'slams'; this.t = 0; }
        break;
      case 'slams':
        this.updateSlams(dt, H);
        break;
      case 'retract':
        this.emerge = Math.max(0, 1 - this.t / Math.max(0.01, H.retractTime));
        if (this.t >= H.retractTime) {
          this.hands.length = 0;
          this.emerge = 0;
          this.finishAbility();
        }
        break;
      case 'beams-tele': case 'beams-fire':
        this.updateBeams(dt);
        break;
      case 'crumble':
        this.updateCrumble(dt);
        break;
      case 'flash-charge': case 'flash-burst':
        this.updateFlash(dt);
        break;
      default: break;
    }
  }

  // ---------- Руки ----------

  startHands() {
    const z = this.arena.zone;
    const H = this.H;
    if (!z) { this.enterGap(0); return; }
    this.state = 'emerge';
    this.t = 0;
    this.emerge = 0;
    this.bandH = (z.bottom - z.top) / H.count;
    this.hands.length = 0;
    for (let i = 0; i < H.count; i++) {
      this.hands.push({ state: 0, t: 0, y0: z.top + i * this.bandH, y1: z.top + (i + 1) * this.bandH, side: i % 2 ? 1 : -1 });
    }
    this.bus.emit('apotheosis:hands-start', {});
  }

  updateSlams(dt, H) {
    let allDone = true;
    for (let i = 0; i < this.hands.length; i++) {
      const b = this.hands[i];
      const startAt = i * H.stagger;
      if (b.state === 0) {
        allDone = false;
        if (this.t >= startAt) { b.state = 1; b.t = 0; }
      } else if (b.state === 1) {
        allDone = false;
        b.t += dt;
        if (b.t >= H.telegraph) this.slam(b, i, H);
      } else if (b.state === 2 || b.state === 3) {
        b.t += dt;
        if (b.t >= H.slamHold) b.state = 4;
        else allDone = false;
      }
    }
    if (allDone) { this.state = 'retract'; this.t = 0; }
  }

  slam(b, i, H) {
    b.state = 2;
    b.t = 0;
    const hero = this.hero;
    const z = this.arena.zone;
    const cx = (z.left + z.right) / 2;
    const cy = (b.y0 + b.y1) / 2;
    if (hero.active && hero.y + hero.radius > b.y0 && hero.y - hero.radius < b.y1) {
      this.src.x = hero.x;
      this.src.y = cy;
      this.src.active = true;
      this.src.parryable = !!H.parryable;
      this.combat.damageHero(H.damage, this.src); // блок гасит часть, парирование гасит всё
    }
    this.bus.emit('apotheosis:slam', { band: i, x: cx, y: cy });
  }

  // ---------- Лучи ----------

  startBeams() {
    this.state = 'beams-tele';
    this.t = 0;
    this.spin = 0;
    this.spinDir = this.rnd() < 0.5 ? -1 : 1;
    this.beamTick = 0;
  }

  updateBeams(dt) {
    const B = this.boss.def.beams;
    if (this.state === 'beams-tele') {
      if (this.t >= B.telegraph) { this.state = 'beams-fire'; this.t = 0; this.bus.emit('apotheosis:beams-fire', {}); }
      return;
    }
    // Лучи качаются на sweepDeg и возвращаются в исходное положение: sin даёт 0 → максимум → 0.
    const k = Math.min(1, this.t / Math.max(0.01, B.fireTime));
    this.spin = this.spinDir * (B.sweepDeg * Math.PI / 180) * Math.sin(Math.PI * k);
    this.beamTick -= dt;
    if (this.beamTick <= 0 && this.hero.active && this.heroInBeams(B)) {
      this.beamTick = B.tickInterval;
      this.beamSrc.x = this.hero.x;
      this.beamSrc.y = this.hero.y;
      this.beamSrc.active = true;
      this.combat.damageHero(B.tickDamage, this.beamSrc);
    }
    if (this.t >= B.fireTime) {
      this.spin = 0; // та же точка, откуда начали
      this.finishAbility();
    }
  }

  /** Касается ли герой какого-нибудь луча (отрезок из центра головы длиной length и шириной width). */
  heroInBeams(B) {
    const o = this.headPos();
    const hero = this.hero;
    const vx = hero.x - o.x;
    const vy = hero.y - o.y;
    const reach = B.width / 2 + hero.radius;
    const ang = this.beamAngles();
    for (let i = 0; i < ang.length; i++) {
      const dx = Math.cos(ang[i]);
      const dy = Math.sin(ang[i]);
      let t = vx * dx + vy * dy;
      if (t < 0) t = 0; else if (t > B.length) t = B.length;
      const px = vx - dx * t;
      const py = vy - dy * t;
      if (px * px + py * py <= reach * reach) return true;
    }
    return false;
  }

  // ---------- Распад острова ----------

  startCrumble() {
    this.state = 'crumble';
    this.t = 0;
    this.patches.length = 0;
    this.cwave = 0;
    this.cT = 0;
    this.cTick = 0;
  }

  updateCrumble(dt) {
    const C = this.boss.def.crumble;
    this.cT += dt;
    while (this.cwave < C.waves && this.cT >= this.cwave * C.waveStagger) this.spawnPatches(C, this.cwave++);
    const hero = this.hero;
    let standing = false;
    let alive = 0;
    for (let i = 0; i < this.patches.length; i++) {
      const p = this.patches[i];
      if (p.state === 3) continue;
      alive++;
      p.t += dt;
      if (p.state === 0 && p.t >= C.telegraph) {
        p.state = 1;
        p.t = 0;
        this.bus.emit('apotheosis:crumble', { x: p.x, y: p.y, r: p.r });
        if (hero.active && this.heroOn(p)) { // обвалилось под героем: сильный удар
          this.holeSrc.x = p.x; this.holeSrc.y = p.y; this.holeSrc.active = true;
          this.combat.damageHero(C.damage, this.holeSrc);
          this.cTick = C.tickInterval;
        }
      } else if (p.state === 1) {
        if (hero.active && this.heroOn(p)) standing = true;
        if (p.t >= C.holdTime) { p.state = 2; p.t = 0; }
      } else if (p.state === 2 && p.t >= C.fadeTime) {
        p.state = 3;
      }
    }
    this.cTick -= dt;
    if (standing && this.cTick <= 0) { // стоит на провале: тики урона
      this.cTick = C.tickInterval;
      this.holeSrc.x = hero.x; this.holeSrc.y = hero.y; this.holeSrc.active = true;
      this.combat.damageHero(C.tickDamage, this.holeSrc);
    }
    if (this.cwave >= C.waves && alive === 0) { this.patches.length = 0; this.finishAbility(); }
  }

  heroOn(p) {
    const dx = this.hero.x - p.x;
    const dy = this.hero.y - p.y;
    return dx * dx + dy * dy < p.r * p.r;
  }

  /** Новая волна провалов: первый на герое (заставляет двигаться), остальные случайно внутри острова. */
  spawnPatches(C, idx) {
    const z = this.arena.zone;
    if (!z) return;
    const n = C.patchesBase + idx * C.patchesAdd;
    const hero = this.hero;
    const inside = (x, y) => (z.poly ? pointInPoly(z.poly, x, y) : x > z.left && x < z.right && y > z.top && y < z.bottom);
    const free = (x, y) => {
      for (let i = 0; i < this.patches.length; i++) {
        const q = this.patches[i];
        if (q.state === 3) continue;
        const dx = x - q.x; const dy = y - q.y;
        if (dx * dx + dy * dy < (C.radius * 1.5) * (C.radius * 1.5)) return false;
      }
      return true;
    };
    let placed = 0;
    if (hero.active && inside(hero.x, hero.y)) {
      this.patches.push({ x: hero.x, y: hero.y, r: C.radius, state: 0, t: 0 });
      placed++;
    }
    for (let tries = 0; placed < n && tries < 60; tries++) {
      const x = z.left + this.rnd() * (z.right - z.left);
      const y = z.top + this.rnd() * (z.bottom - z.top);
      if (!inside(x, y) || !free(x, y)) continue;
      this.patches.push({ x, y, r: C.radius, state: 0, t: 0 });
      placed++;
    }
  }

  // ---------- Вспышка ----------

  startFlash() {
    this.state = 'flash-charge';
    this.t = 0;
    this.flashDim = 0;
    this.flashWhite = 0;
  }

  updateFlash(dt) {
    const F = this.boss.def.flash;
    if (this.state === 'flash-charge') {
      this.flashDim = F.dim * Math.min(1, this.t / Math.max(0.01, F.charge));
      if (this.t >= F.charge) this.burstFlash(F);
      return;
    }
    this.flashWhite = Math.max(0, 1 - this.t / Math.max(0.01, F.burstTime));
    this.flashDim = F.dim * this.flashWhite;
    if (this.t >= F.burstTime) {
      this.flashDim = 0;
      this.flashWhite = 0;
      this.finishAbility();
    }
  }

  burstFlash(F) {
    this.state = 'flash-burst';
    this.t = 0;
    const hero = this.hero;
    let parried = false;
    if (hero.active) {
      this.flashSrc.x = hero.x;
      this.flashSrc.y = hero.y;
      this.flashSrc.active = true;
      this.flashSrc.parryable = !!F.parryable;
      this.combat.damageHero(F.damage, this.flashSrc); // блок гасит часть, парирование гасит всё (источник гаснет)
      parried = !this.flashSrc.active;
    }
    this.bus.emit('apotheosis:flash', { parried });
    if (parried) {
      this.stunT = F.stunTime;
      this.bus.emit('apotheosis:stun', {});
    }
  }
}
