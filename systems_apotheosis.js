// Апофеоз: оркестр умений финального босса и его голова-солнце.
//
// Умения идут по кругу: 1 «Призыв апостолов» (systems_apostles.js) → 2 «Руки» (здесь) → снова призыв и так далее.
//   Умение 2 применяется, когда все апостолы убиты. Каждое умение, когда оно кончилось, проворачивает голову на одно деление:
//   у солнца rays лучей (10), поворот = 1/rays оборота. Сама голова не вращается. После phaseAfter умений (5) босс готов ко второй
//   фазе: событие 'apotheosis:phase2' (поведения второй фазы пока нет, умения прекращаются). Будущее правило: если у босса
//   кончилось здоровье раньше, чем применено phaseAfter умений, голова сразу доворачивается до фазы перехода, минуя повороты
//   по умениям (здесь пока не нужно: здоровье до нуля = смерть).
//
// «Руки»: по бокам острова вылезают огромные чёрные худые руки (hands.emergeTime). Остров делится на hands.count полос сверху
//   вниз (по 1/count высоты). По очереди (через hands.stagger) на полосе появляется телеграф (hands.telegraph), и рука падает
//   на неё: удар по всей полосе (парируется). Полосы телеграфятся внахлёст: пока одна падает, следующие уже горят.
//   Упавшая полоса остаётся тёмной hands.slamHold секунд и безопасна. Потом руки уходят.
//
// События: 'apotheosis:hands-start', 'apotheosis:slam' { band, x, y }, 'apotheosis:head-turn' { turns },
//          'apotheosis:phase2'. Графика рук: ЗАГЛУШКА (renderer.drawHands).
const TAU = Math.PI * 2;

export class ApotheosisAI {
  /** o: { config, hero, arena, apostles, combat, defense, bus } */
  constructor(o) {
    this.cfg = o.config;
    this.hero = o.hero;
    this.arena = o.arena;
    this.apostles = o.apostles;
    this.combat = o.combat;
    this.defense = o.defense || null;
    this.bus = o.bus;
    this.boss = null;
    this.state = 'off';  // off | apostles | emerge | slams | retract | gap | done
    this.t = 0;
    this.turns = 0;      // сколько умений завершено = на сколько делений повёрнута голова
    this.phase2 = false;
    this.src = { x: 0, y: 0, active: true, parryable: true, enemy: null }; // источник удара руки для блока и парирования
    this.hands = [];     // полосы: { state 0 ждёт | 1 телеграф | 2 упала | 3 тёмная | 4 ушла, t, y0, y1, side }
    this.bandH = 0;
    this.emerge = 0;     // 0..1: насколько руки вылезли (для отрисовки)
    this.bus.on('boss:spawned', ({ enemy }) => this.attach(enemy));
    this.bus.on('apostles:defeated', () => this.onApostlesDefeated());
    this.bus.on('enemy:killed', ({ enemy }) => { if (enemy === this.boss) this.reset(); });
  }

  attach(boss) {
    this.reset();
    if (!boss.def.hands) return;
    this.boss = boss;
    this.state = 'apostles'; // первым идёт призыв апостолов: его запускает сам systems_apostles.js
    boss.headAngle = 0;
  }

  reset() {
    this.boss = null;
    this.state = 'off';
    this.t = 0;
    this.turns = 0;
    this.phase2 = false;
    this.emerge = 0;
    this.hands.length = 0;
  }

  get H() { return this.boss ? this.boss.def.hands : null; }

  /** Умение закончилось: голова проворачивается на одно деление. */
  finishAbility() {
    this.turns++;
    this.bus.emit('apotheosis:head-turn', { turns: this.turns });
    const D = this.boss.def.head;
    if (this.turns >= D.phaseAfter && !this.phase2) {
      this.phase2 = true;
      this.state = 'done';
      this.bus.emit('apotheosis:phase2', {});
      return true;
    }
    return false;
  }

  onApostlesDefeated() {
    if (!this.boss || this.state !== 'apostles') return;
    if (this.finishAbility()) return; // апостолы были последним умением до второй фазы
    this.startHands();
  }

  // ---------- Руки ----------

  startHands() {
    const z = this.arena.zone;
    const H = this.H;
    if (!z) return;
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

  update(dt) {
    const boss = this.boss;
    if (!boss) return;
    if (!boss.active) { this.reset(); return; }
    // Голова плавно доворачивается до нужного деления.
    const D = boss.def.head;
    const target = this.turns * (TAU / D.rays);
    boss.headAngle += (target - boss.headAngle) * (1 - Math.exp(-dt / Math.max(0.01, D.turnSmooth)));
    if (Math.abs(target - boss.headAngle) < 1e-4) boss.headAngle = target;

    const H = boss.def.hands;
    this.t += dt;
    switch (this.state) {
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
          if (this.finishAbility()) break;
          this.state = 'gap';
          this.t = 0;
        }
        break;
      case 'gap':
        if (this.t >= H.afterDelay) {
          this.state = 'apostles';
          this.apostles.requestSummon(0); // следующее умение: снова призыв апостолов
        }
        break;
      default: break;
    }
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
}
