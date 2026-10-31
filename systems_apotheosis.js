// Апофеоз: оркестр умений финального босса и его голова-солнце.
//
// Пять атак первой фазы: апостолы, руки и все три атаки пула в случайном порядке.
//   После пятой атаки отдельно идёт переход «Превращение»: разрыв острова и вторая фаза.
//   Голова проходит пять делений (180°); последний проворот происходит во время перехода.
//   Во второй фазе пять атак, затем отдельный переход-эпилог.
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
// 5 «Световые заряды»: пять последовательных самонаводящихся снарядов, каждый парируется.
// 6 «Превращение» (отдельный переход после 5 атак): остров сжимается в клочок; из краёв экрана вылезают
//   руки и хватаются за его центр; голова проворачивается в последний раз (до 180°: рот сверху, голова снизу, босс безумен);
//   руки разрывают клочок, и на его месте вырастает туманная платформа; графика переходит в негатив (renderer.drawNegative).
//   Платформа это новая arena.zone (многоугольник). Конец: событие 'apotheosis:phase2'.
//
// ВТОРАЯ ФАЗА (после «Превращения»): первое умение 'negApostles' «Призыв негативных апостолов» (systems_apostles.js, режим neg):
//   те же четыре апостола, умения усилены, Вера бросает клинки с неба туда, где был герой, Сила отталкивает вместо притяжения.
//   Умение кончается, когда они убиты. Убитые не исчезают, а лежат «выключенными».
// 7 «Восстание» (второе умение второй фазы): выключенные апостолы встают и быстро бегут на героя (мало здоровья, урон касанием);
//   кончается, когда все убиты, и голова проворачивается ещё на одно деление (abilities.p2Turn).
// 8 «Единство» (третье умение второй фазы): босс сам, без апостолов, применяет все четыре их умения сразу, в усиленной негативной
//   форме: Любовь усиливает остальных, Вера бросает клинки с неба, Правда золотые клинки от головы, Сила отталкивает (и взрывает у
//   края). Перед этим omni.castTime секунд заряд. После пяти атак второй фазы начинается отдельный эпилог.
//
// События: 'apotheosis:ability' { id }, 'apotheosis:hands-start', 'apotheosis:slam' { band, x, y }, 'apotheosis:beams-fire',
//          'apotheosis:crumble' { x, y, r }, 'apotheosis:bolt-impact' { parried }, 'apotheosis:stun', 'apotheosis:head-turn' { turns },
//          'apotheosis:phase2',
//          'apotheosis:transform' { stage: 'grab' | 'turn' | 'tear' | 'form' }.
//          Графика: ЗАГЛУШКА (renderer.drawHands / drawBeams / drawCrumble / drawFlash / drawGrip / drawFog / drawNegative).
import { pointInPoly } from './world_arena.js';
import { Finale, rayDist } from './systems_apotheosis_finale.js';

const TAU = Math.PI * 2;
const ABILITY_IDS = ['apostles', 'hands', 'beams', 'crumble', 'flash', 'transform', 'negApostles', 'rise', 'omni', 'scream', 'pathbreak', 'ending'];
const ease = (k) => k * k * (3 - 2 * k);

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
    this.sequence = [];    // только боевые умения первой фазы, без перехода
    this.ability = null;   // идущее умение: 'apostles' | 'hands' | 'beams' | 'crumble' | 'flash' | null (пауза)
    this.state = 'off';    // off | apostles | emerge | slams | retract | beams-tele | beams-fire | crumble | flash-charge | flash-burst | gap | done
    this.t = 0;
    this.gapLen = 0;
    this.turns = 0;        // сколько умений завершено = на сколько делений повёрнута голова
    this.phase2 = false;
    this.spin = 0;         // качание головы во время «Лучей», радианы; к концу умения всегда 0
    this.spinDir = 1;
    this.stunT = 0;        // оглушение после парирования световых зарядов
    this.src = { x: 0, y: 0, active: true, parryable: true, enemy: null };       // удар руки
    this.beamSrc = { x: 0, y: 0, active: true, parryable: false, enemy: null };  // тик луча
    this.holeSrc = { x: 0, y: 0, active: true, parryable: false, enemy: null };  // обвал и тик провала
    this.flashBolts = []; // отдельные парируемые самонаводящиеся заряды
    this.hands = [];       // полосы: { state 0 ждёт | 1 телеграф | 2 упала | 3 тёмная | 4 ушла, t, y0, y1, side }
    this.bandH = 0;
    this.emerge = 0;       // 0..1: насколько руки вылезли (для отрисовки)
    this.beamTick = 0;
    this.patches = [];     // куски поля: { x, y, r, state 0 телеграф | 1 провал | 2 зарастает | 3 нет, t }
    this.cwave = 0;
    this.cT = 0;
    this.cTick = 0;
    this.flashDim = 0;     // старое поле оставлено для совместимости с интерфейсом
    this.flashWhite = 0;   // глобальной вспышки больше нет
    this.flashFired = 0;
    this.flashNext = 0;
    this.deferred = [];    // запас для совместимости с прежними настройками
    this.tf = null;        // данные «Превращения» (для отрисовки рук и клочка)
    this.madTurn = false;  // идёт последний, медленный проворот головы
    this.fog = 0;          // 0..1 туман на платформе (для отрисовки)
    this.negative = 0;     // 0..1 негатив картинки (для отрисовки)
    this.p2seq = ['negApostles', 'rise', 'omni', 'scream', 'pathbreak']; // умения второй фазы по порядку (enemies.apotheosis.abilities.p2)
    this.p2i = 0;
    this.rings = [];       // «Крик»: кольца-волны { r, gap, gapW, solid, hit, src }
    this.screamT = 0;
    this.screamGlow = 0;   // 0..1 рот светится перед криком (для отрисовки)
    this.screamN = 0;      // сколько колец уже выпущено
    this.fin = new Finale(this);
    this.bus.on('boss:spawned', ({ enemy }) => this.attach(enemy));
    this.bus.on('apostles:defeated', () => this.onApostlesDefeated());
    this.bus.on('apostles:risen-defeated', () => { if (this.boss && this.ability === 'rise') this.finishP2Ability(); });
    this.bus.on('enemy:killed', ({ enemy }) => { if (enemy === this.boss) this.reset(); });
    this.bus.on('enemy:hit-incoming', (inc) => { // оглушённый босс получает больше урона
      if (inc.enemy !== this.boss || !this.boss) return;
      if (this.apostles.boss === this.boss && this.apostles.alive() > 0) inc.amount *= 0.1; // апостолы гасят 90% урона
      if (this.stunT > 0) inc.amount *= this.boss.def.flash.stunDamageMult;
      // Скриптовый босс не может умереть до конца обеих фаз: иначе пропадают катсцены.
      if (inc.amount >= this.boss.hp) inc.amount = Math.max(0, this.boss.hp - 1);
    });
  }

  attach(boss) {
    this.reset();
    if (!boss.def.hands) return;
    this.boss = boss;
    boss.headAngle = 0;
    this.sequence = this.buildSequence(boss.def.abilities);
    if (boss.def.abilities.p2) this.p2seq = boss.def.abilities.p2.slice();
    if (this.sequence[0] === 'apostles') {
      this.ability = 'apostles';
      this.state = 'apostles'; // призыв запускает сам systems_apostles.js (firstDelay)
      this.bus.emit('apotheosis:ability', { id: 'apostles' });
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
    const pick = A && A.poolPick !== undefined ? A.poolPick : pool.length;
    this.deferred = pool.slice(pick);
    return fixed.concat(pool.slice(0, pick)); // переход запускается отдельно, после пяти атак
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
    this.flashBolts.length = 0;
    this.flashFired = 0;
    this.flashNext = 0;
    this.deferred = [];
    this.tf = null;
    this.madTurn = false;
    this.fog = 0;
    this.negative = 0;
    this.p2i = 0;
    this.rings.length = 0;
    this.screamN = 0;
    this.screamGlow = 0;
    this.fin.reset();
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
    const D = this.boss.def.head;
    // Пятое боевое умение завершено: переход отдельный. Пятый проворот сделает
    // само Превращение во время захвата острова, как предусмотрено анимацией.
    if (!this.phase2 && this.turns + 1 >= D.phaseAfter) {
      this.start(this.boss.def.abilities.transition || 'transform');
      return true;
    }
    this.turns++;
    this.bus.emit('apotheosis:head-turn', { turns: this.turns });
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
    if (!this.boss) return;
    if (this.ability === 'apostles') this.finishAbility(); // апостолы убиты: умение кончилось
    else if (this.ability === 'negApostles') this.finishP2Ability(); // негативные убиты: умение второй фазы кончилось
  }

  /** Вторая фаза: босс безумен, платформа готова. Первое умение через паузу. */
  startPhase2() {
    this.p2i = 0;
    this.enterGap(this.boss.def.abilities.afterDelay);
  }

  /** Умение второй фазы кончилось. Если оно в abilities.p2Turn, голова проворачивается ещё на одно деление. */
  finishP2Ability() {
    const A = this.boss.def.abilities;
    if (A.p2Turn && A.p2Turn.indexOf(this.ability) >= 0) {
      this.turns++;
      this.bus.emit('apotheosis:head-turn', { turns: this.turns });
    }
    this.ability = null;
    this.p2i++;
    this.bus.emit('apotheosis:p2-done', { index: this.p2i });
    this.enterGap(A.afterDelay);
  }

  /** Следующее умение по порядку. */
  startNext() {
    if (this.phase2) { // вторая фаза: по списку p2seq; когда он кончился, босс стоит
      const id = this.p2seq[this.p2i];
      if (id) this.start(id);
      else if (this.p2i === this.p2seq.length) this.start(this.boss.def.abilities.p2Transition || 'ending');
      else { this.ability = null; this.state = 'done'; }
      return;
    }
    if (this.turns >= this.sequence.length) this.start(this.boss.def.abilities.transition || 'transform');
    else this.start(this.sequence[this.turns]);
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
      case 'transform': this.startTransform(); break;
      case 'negApostles': this.state = 'apostles'; this.apostles.requestSummon(0, true); break;
      case 'rise': this.state = 'rise'; this.apostles.startRise(); break;
      case 'scream': this.startScream(); break;
      case 'pathbreak': this.fin.startPath(); break;
      case 'ending': this.fin.startEnding(); break;
      case 'omni': this.state = 'omni-charge'; this.t = 0; this.bus.emit('apotheosis:omni', { stage: 'charge' }); break;
      default: this.enterGap(0);
    }
  }

  /** Отладка: немедленно начать умение id (то, что шло, обрывается; счётчик проворотов не меняется). */
  force(id) {
    if (!this.boss || ABILITY_IDS.indexOf(id) < 0) return false;
    const p2id = ['negApostles', 'rise', 'omni', 'scream', 'pathbreak', 'ending'].indexOf(id) >= 0; // умения второй фазы
    if (this.phase2 !== p2id && (this.phase2 || !this.enterPhase2Debug())) return false; // первой фазы после второй нет; второй без неё: сперва платформа
    this.apostles.requestSummon(Infinity, this.phase2);
    this.apostles.dismiss();
    this.apostles.cast = null;
    this.apostles.pull = null;
    this.apostles.rainCount = 0;
    this.apostles.rise.state = 'off';
    this.rings.length = 0;
    this.screamN = 0;
    this.screamGlow = 0;
    this.fin.reset();
    if (id !== 'rise') this.apostles.husks.length = 0;
    this.hands.length = 0;
    this.emerge = 0;
    this.patches.length = 0;
    this.spin = 0;
    this.flashDim = 0;
    this.flashWhite = 0;
    this.flashBolts.length = 0;
    this.flashFired = 0;
    this.flashNext = 0;
    if (id === 'transform') { // отладка: переход после пяти атак; голова готова к последнему провороту
      this.turns = this.boss.def.head.phaseAfter - 1;
      this.boss.headAngle = this.turns * (TAU / this.boss.def.head.rays);
    }
    this.start(id);
    return true;
  }

  update(dt) {
    const boss = this.boss;
    if (!boss) return;
    if (!boss.active) {
      if (this.fin.alive()) { // босс рассыпался в эпилоге: портал и осколки досчитываются
        if (this.fin.stage === 'portal') this.fin.update(dt); else this.fin.tickAfter(dt);
        return;
      }
      this.reset();
      return;
    }
    if (this.state === 'path' || this.state === 'ending') boss.touchTimer = 1e9; // в конце боя босс героя не бьёт
    // Голова плавно доворачивается до нужного деления (плюс качание умения «Лучи»).
    const D = boss.def.head;
    const target = this.turns * (TAU / D.rays) + this.spin;
    const sm = this.madTurn && boss.def.transform ? boss.def.transform.turnSmooth : D.turnSmooth; // последний проворот медленный
    boss.headAngle += (target - boss.headAngle) * (1 - Math.exp(-dt / Math.max(0.01, sm)));
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
      case 'omni-charge':
        if (this.t >= boss.def.omni.castTime) { // четыре умения апостолов сразу, от самого босса
          this.apostles.castAll(boss);
          this.state = 'omni-run';
          this.t = 0;
          this.bus.emit('apotheosis:omni', { stage: 'cast' });
        }
        break;
      case 'scream':
        this.updateScream(dt);
        break;
      case 'path':
        this.fin.updatePath(dt);
        break;
      case 'ending':
        this.fin.update(dt);
        break;
      case 'omni-run':
        if (this.t > 0.1 && !this.apostles.anyBusy()) { this.apostles.loveT = 0; this.finishP2Ability(); }
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
      case 'tf-shrink': case 'tf-grab': case 'tf-turn': case 'tf-tear': case 'tf-form':
        this.updateTransform(dt);
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
      } else if (b.state === 4) {
        b.t += dt; // рука уходит от острова, а не пропадает мгновенно
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

  // ---------- Световые самонаводящиеся заряды ----------
  startFlash() {
    this.state = 'flash-charge'; // прежнее имя для совместимости с тестовой кнопкой
    this.t = 0;
    this.flashDim = this.flashWhite = 0;
    this.flashFired = 0;
    this.flashNext = 0;
    this.flashBolts.length = 0;
  }

  spawnFlashBolt(F) {
    const o = this.headPos(), h = this.hero;
    if (!o) return;
    const direction = Math.atan2(h.y - o.y, h.x - o.x);
    const b = {
      x:o.x, y:o.y, px:o.x, py:o.y, angle:direction + (this.flashFired % 2 ? .12 : -.12),
      r:F.radius, age:0, active:true, parryable:F.parryable !== false, enemy:this.boss,
      trailX:new Float32Array(9),trailY:new Float32Array(9),trailIndex:0,trailCount:0,trailTime:0,
    };
    b.trailX.fill(o.x);b.trailY.fill(o.y);
    this.flashBolts.push(b);
    this.flashFired++;
    this.bus.emit('apotheosis:bolt-fired', {x:o.x, y:o.y});
  }

  updateFlash(dt) {
    const F = this.boss.def.flash;
    if (this.state === 'flash-charge') {
      if (this.t >= F.charge) {
        this.state = 'flash-burst';
        this.t = 0;
        this.flashNext = 0;
      }
      return;
    }
    this.flashNext -= dt;
    if (this.flashFired < F.count && this.flashNext <= 0) {
      this.spawnFlashBolt(F);
      this.flashNext += F.interval;
    }
    const hero = this.hero;
    let flying = 0;
    for (const b of this.flashBolts) {
      if (!b.active) continue;
      b.age += dt;
      if (b.age >= F.lifetime) { b.active = false; continue; }
      b.px = b.x;
      b.py = b.y;
      if (hero.active) {
        const target = Math.atan2(hero.y - b.y, hero.x - b.x);
        const diff = Math.atan2(Math.sin(target - b.angle), Math.cos(target - b.angle));
        b.angle += Math.max(-F.turnRate * dt, Math.min(F.turnRate * dt, diff));
      }
      b.x += Math.cos(b.angle) * F.speed * dt;
      b.y += Math.sin(b.angle) * F.speed * dt;
      b.trailTime += dt;
      if (b.trailTime >= .05) {
        b.trailTime -= .05;
        b.trailIndex = (b.trailIndex + 1) % b.trailX.length;
        b.trailX[b.trailIndex] = b.x;
        b.trailY[b.trailIndex] = b.y;
        b.trailCount = Math.min(b.trailCount + 1, b.trailX.length);
      }
      if (hero.active && Math.hypot(hero.x - b.x, hero.y - b.y) < hero.radius + b.r) {
        b.parryable = F.parryable !== false;
        this.combat.damageHero(F.damage, b);
        const parried = !b.active; // защита отключает источник парированного удара
        b.active = false;
        this.bus.emit('apotheosis:bolt-impact', {x:b.x, y:b.y, parried});
        if (parried) {
          this.stunT = Math.max(this.stunT, F.stunTime);
          this.bus.emit('apotheosis:stun', {});
        }
      } else flying++;
    }
    if (this.flashFired >= F.count && flying === 0) {
      this.flashBolts.length = 0;
      this.finishAbility();
    }
  }

  // ---------- Крик ----------

  startScream() {
    this.state = 'scream';
    this.t = 0;
    this.rings.length = 0;
    this.screamN = 0;
    this.screamGlow = 0;
  }

  /** Рот светится screamTelegraph с, потом кольца-волны расходятся от головы с интервалом interval; в каждом проём (кроме «сплошных»). */
  updateScream(dt) {
    const S = this.boss.def.scream;
    const o = this.headPos();
    const hero = this.hero;
    this.screamGlow = Math.min(1, this.t / Math.max(0.01, S.telegraph));
    while (this.screamN < S.rings && this.t >= S.telegraph + this.screamN * S.interval) {
      const solid = S.solidEvery > 0 && (this.screamN + 1) % S.solidEvery === 0; // сплошное кольцо: только рывок или парирование
      const toHero = Math.atan2(hero.y - o.y, hero.x - o.x);
      // Проём смещён от героя на gapOffsetDeg (случайная сторона): стоять на месте нельзя, надо перейти в проём. Сторону выбираем так,
      // чтобы проём вёл на платформу (на расстоянии героя точка внутри острова).
      const offA = (S.gapOffsetDeg[0] + this.rnd() * (S.gapOffsetDeg[1] - S.gapOffsetDeg[0])) * Math.PI / 180;
      const sg = this.rnd() < 0.5 ? -1 : 1;
      const dh = Math.hypot(hero.x - o.x, hero.y - o.y);
      const zp = this.arena.zone && this.arena.zone.poly;
      let jit = sg * offA;
      if (zp && !pointInPoly(zp, o.x + Math.cos(toHero + jit) * dh, o.y + Math.sin(toHero + jit) * dh)) jit = -jit;
      let ring = this.rings[this.screamN];
      if (!ring) { ring = { r: 0, gap: 0, gapW: 0, solid: false, hit: false, src: { x: 0, y: 0, active: true, parryable: true, enemy: null } }; this.rings[this.screamN] = ring; }
      ring.r = S.startR;
      ring.gap = toHero + jit;
      ring.gapW = S.gapDeg * Math.PI / 180;
      ring.solid = solid;
      ring.hit = false;
      ring.src.active = true;
      ring.src.parryable = !!S.parryable;
      ring.live = true;
      this.screamN++;
      this.bus.emit('apotheosis:scream', { x: o.x, y: o.y, solid });
    }
    let live = 0;
    for (let i = 0; i < this.screamN; i++) {
      const g = this.rings[i];
      if (!g.live) continue;
      g.r += S.speed * dt;
      if (g.r > S.maxR) { g.live = false; continue; }
      live++;
      if (g.hit || !hero.active) continue;
      const dx = hero.x - o.x;
      const dy = hero.y - o.y;
      const d = Math.hypot(dx, dy);
      if (Math.abs(d - g.r) > S.width / 2 + hero.radius * 0.6) continue;
      if (!g.solid) { // проём: угол героя близко к центру проёма
        let da = Math.atan2(dy, dx) - g.gap;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        if (Math.abs(da) <= g.gapW / 2) continue;
      }
      g.hit = true;
      g.src.x = hero.x;
      g.src.y = hero.y;
      g.src.active = true;
      this.combat.damageHero(S.damage, g.src); // рывок проходит сквозь (неуязвимость), блок гасит часть, парирование всё
    }
    if (this.screamN >= S.rings && live === 0) {
      this.screamGlow = 0;
      this.rings.length = 0;
      this.finishP2Ability();
    }
  }

  // ---------- Превращение ----------

  /** Остров в клочок, руки хватают центр, последний проворот головы, руки рвут клочок, вырастает туманная платформа. */
  startTransform() {
    const z = this.arena.zone;
    const T = this.boss.def.transform;
    if (!z || !z.poly) { this.enterGap(0); return; }
    const cx = (z.left + z.right) / 2;
    const cy = (z.top + z.bottom) / 2;
    const P0 = z.poly.map((p) => ({ x: p.x, y: p.y }));
    // Общий набор лучей от центра: вершины острова (чтобы он не менялся в первом кадре) и ровные углы (чтобы платформа была круглой).
    const ang = [];
    for (let i = 0; i < P0.length; i++) ang.push(Math.atan2(P0[i].y - cy, P0[i].x - cx));
    for (let j = 0; j < T.vertices; j++) ang.push(-Math.PI + (j + 0.5) * TAU / T.vertices);
    ang.sort((a, b) => a - b);
    const A = [];
    for (let i = 0; i < ang.length; i++) if (!A.length || ang[i] - A[A.length - 1] > 1e-3) A.push(ang[i]);
    const R0 = A.map((a) => rayDist(P0, cx, cy, a));
    const R1 = A.map(() => T.fragmentRadius * (1 - T.fragmentJag * this.rnd()));
    const R2 = A.map(() => T.platformRadius * (1 + (this.rnd() - 0.5) * T.platformWobble));
    this.tf = { cx, cy, ang: A, R0, R1, R2, handK: 0, apart: 0, crack: 0 };
    this.state = 'tf-shrink';
    this.t = 0;
    this.fog = 0;
    this.negative = 0;
    this.madTurn = false;
  }

  /** Поставить остров по лучам с радиусами, смешанными из a и b на долю k (0..1). Многоугольник звёздный относительно центра. */
  setRadii(a, b, k) {
    const f = this.tf;
    const poly = [];
    let l = Infinity, r = -Infinity, t = Infinity, bt = -Infinity;
    for (let i = 0; i < f.ang.length; i++) {
      const rad = a[i] + (b[i] - a[i]) * k;
      const x = f.cx + Math.cos(f.ang[i]) * rad;
      const y = f.cy + Math.sin(f.ang[i]) * rad;
      poly.push({ x, y });
      if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > bt) bt = y;
    }
    this.arena.setZone({ left: l, right: r, top: t, bottom: bt, poly });
  }

  updateTransform(dt) {
    const T = this.boss.def.transform;
    const f = this.tf;
    if (!f) { this.enterGap(0); return; }
    switch (this.state) {
      case 'tf-shrink': {
        this.setRadii(f.R0, f.R1, ease(Math.min(1, this.t / Math.max(0.01, T.shrinkTime))));
        if (this.t >= T.shrinkTime) { this.state = 'tf-grab'; this.t = 0; this.bus.emit('apotheosis:transform', { stage: 'grab' }); }
        break;
      }
      case 'tf-grab': // руки быстро вылезают из краёв экрана и хватаются за центр клочка
        f.handK = Math.min(1, this.t / Math.max(0.01, T.grabTime));
        if (this.t >= T.grabTime) {
          this.state = 'tf-turn';
          this.t = 0;
          this.madTurn = true;
          this.turns++; // последний проворот: 180°, рот сверху, голова снизу
          this.bus.emit('apotheosis:head-turn', { turns: this.turns });
          this.bus.emit('apotheosis:transform', { stage: 'turn' });
        }
        break;
      case 'tf-turn':
        if (this.t >= T.turnTime) { this.state = 'tf-tear'; this.t = 0; this.bus.emit('apotheosis:transform', { stage: 'tear' }); }
        break;
      case 'tf-tear': { // руки тянут в стороны и рвут клочок
        const k = Math.min(1, this.t / Math.max(0.01, T.tearTime));
        f.crack = k;
        f.apart = ease(k);
        if (this.t >= T.tearTime) {
          this.state = 'tf-form';
          this.t = 0;
          f.handK = 0;
          this.bus.emit('apotheosis:transform', { stage: 'form' });
        }
        break;
      }
      case 'tf-form': { // на месте клочка растёт туманная платформа, картинка уходит в негатив
        const k = ease(Math.min(1, this.t / Math.max(0.01, T.formTime)));
        this.setRadii(f.R1, f.R2, k);
        this.fog = k;
        this.negative = Math.min(1, this.t / Math.max(0.01, T.negativeTime));
        if (this.t >= T.formTime) this.finishTransform();
        break;
      }
      default: break;
    }
  }

  /** Превращение закончено: босс безумен, первая фаза кончилась, платформа это новое поле боя. */
  finishTransform() {
    this.madTurn = false;
    this.ability = null;
    this.fog = 1;
    this.negative = 1;
    this.phase2 = true;
    this.state = 'done';
    this.bus.emit('apotheosis:phase2', {});
    this.startPhase2();
  }

  /**
   * Отладка: сразу в конец «Превращения»: круглая туманная платформа на месте острова, негатив, голова вверх ногами (5 проворотов),
   * вторая фаза. false, если острова нет (не финальный бой).
   */
  enterPhase2Debug() {
    const z = this.arena.zone;
    const boss = this.boss;
    if (!z || !boss || !boss.def.transform) return false;
    const T = boss.def.transform;
    const cx = (z.left + z.right) / 2;
    const cy = (z.top + z.bottom) / 2;
    const poly = [];
    let l = Infinity, r = -Infinity, t = Infinity, b = -Infinity;
    for (let i = 0; i < T.vertices; i++) {
      const a = -Math.PI + (i + 0.5) * TAU / T.vertices;
      const rad = T.platformRadius * (1 + (this.rnd() - 0.5) * T.platformWobble);
      const x = cx + Math.cos(a) * rad;
      const y = cy + Math.sin(a) * rad;
      poly.push({ x, y });
      if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y;
    }
    this.arena.setZone({ left: l, right: r, top: t, bottom: b, poly });
    this.hands.length = 0;
    this.patches.length = 0;
    this.tf = null;
    this.madTurn = false;
    this.fog = 1;
    this.negative = 1;
    this.turns = boss.def.head.phaseAfter;
    boss.headAngle = this.turns * (TAU / boss.def.head.rays);
    this.phase2 = true;
    this.bus.emit('apotheosis:phase2', {});
    return true;
  }
}
