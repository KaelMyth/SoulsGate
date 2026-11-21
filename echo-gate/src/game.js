// Echo Gate: цикл игры. Шаг по реальному времени кадра (timestep.js). Управление перенесено из SoulsGate:
// стик по касанию (Stick), двойной свайп = рывок (SwipeDetector), клавиатура для компьютера.
import { EventBus } from './events.js';
import { Stick } from './input_stick.js';
import { SwipeDetector } from './input_swipe.js';
import { Keys } from './input_keys.js';
import { screenToWorld } from './iso.js';
import { Motion } from './motion.js';
import { World } from './world.js';
import { Blizzard } from './blizzard.js';
import { Hero } from './hero.js';
import { Spawner } from './spawner.js';
import { Scatter } from './scatter.js';
import { Loot } from './loot.js';
import { StaffUi } from './staff_ui.js';
import { staffStats } from './staff.js';
import { Beetle } from './beetle.js';
import { Shooter } from './shooter.js';
import { Bull } from './bull.js';
import { LevelUp } from './levelup.js';
import { Rock } from './rock.js';
import { Midges } from './midges.js';
import { MidgeView } from './midge_view.js';
import { Telegraphs } from './telegraph.js';
import { EnemyShots } from './enemy_shots.js';
import { Attack } from './attack.js';
import { advance } from './timestep.js';
import { Stats } from './stats.js';
import { Hud } from './hud.js';
import { Settings } from './settings.js';
import { Hub, PopButton } from './hub.js';
import { Inventory } from './inventory.js';
import { fireStaff, iceStaff, electricStaff, gravityStaff, laserStaff, bladesStaff } from './items.js';
import { InventoryUi } from './inventory_ui.js';

export class Game {
  constructor(o) {
    this.cfg = o.config;
    this.bus = new EventBus();
    this.canvas = o.canvas;
    this.world = new World(o.canvas, this.cfg);
    this.hero = new Hero();
    this.blizzard = new Blizzard(this.cfg.blizzard);
    this.world.overlay = this.blizzard;
    this.hero.addTo(this.world.scene);
    this.motion = new Motion(this.cfg);
    this.scatter = new Scatter(this.world.scene, this.cfg.scatter);
    this.scatter.setVisible(false);
    this.spawner = new Spawner(this.world.scene, this.cfg, (kind) => (kind === 'shooter' ? new Shooter() : kind === 'bull' ? new Bull() : kind === 'rock' ? new Rock() : new Beetle()));
    this.enemyShots = new EnemyShots(this.world.scene);
    this.telegraphs = new Telegraphs(this.world.scene);
    this.midges = new Midges(this.cfg);
    this.midgeView = new MidgeView(this.world.scene);
    this.spawner.onSlam = (e) => this.midges.burst(e.x, e.z, this.heroBody, e.def.slam.midges, this.cfg.rock.midge);
    this.spawner.onAttack = (e, dmg) => this.hurtHero(dmg);
    this.spawner.onShot = (e, dx, dz) => this.enemyShots.fire(e, dx, dz, this.cfg.shooter.shot);
    this.heroBody = { x: 0, z: 0, radius: this.cfg.hero.radius };
    this.invuln = 0; // с неуязвимости героя после удара
    this.spawner.onTouch = (e) => this.hurtHero(this.cfg.beetle.touchDamage);
    this.attack = new Attack(this.world.scene, this.cfg.attack, this.hero, this.spawner);
    this.attack.midges = this.midges; // выстрел сбивает мошек
    this.stats = new Stats(this.cfg);
    this.loot = new Loot(this.world.scene, this.cfg.loot);
    this.attack.getStats = () => staffStats(this.cfg, this.stats.upgrades);
    this.loot.onCollect = (type, v) => {
      this.stats.collect(type, v);
      this.bus.emit('loot:collected', { type, value: v });
      if (type === 'power' && this.staffUi) this.staffUi.open(); // кристалл усиления: открыть экран посоха
    };
    this.attack.onKill = (e) => {
      this.stats.kills++; // опыт даёт камешек, а не само убийство
      this.loot.drop(e.state.x, e.state.z, this.cfg.xp.perKill);
      this.bus.emit('enemy:killed', e);
    };

    this.stick = new Stick(o.canvas, this.bus, this.cfg.stick);
    this.swipe = new SwipeDetector(this.bus, this.cfg.dash, (sx, sy) => {
      screenToWorld(sx, sy, this.tmp);
      this.dash(this.tmp.x, this.tmp.z);
    });
    this.keys = new Keys(() => this.dashFromInput());
    this.tmp = { x: 0, z: 0 };
    this.kv = { x: 0, y: 0 };
    this.ui = o.ui; // { base, knob, start }
    this.last = 0;
    this.running = true;
    this.playing = false; // забег идёт (после Play)
    this.inHub = true;    // стоим в хабе у костра: герой ходит, но боя нет
    this.hub = new Hub(this.world.scene, this.cfg.hub);
    const H = this.cfg.hub;
    this.playBtn = new PopButton(o.ui.playBtn, { radius: H.playRadius, hysteresis: H.playHysteresis, rise: H.buttonRise }, () => this.play());
    this.shopBtn = new PopButton(o.ui.shopBtn, { radius: H.shopRadius, hysteresis: H.shopHysteresis, rise: H.shopButtonRise }, () => this.bus.emit('shop:open', {}));
    this.gearBtn = new PopButton(o.ui.gearBtn, { radius: H.gearRadius, hysteresis: H.gearHysteresis, rise: H.gearButtonRise }, () => this.bus.emit('gear:open', {}));
    this.anchor = { x: 0, y: 0, z: 0 };
    this.inventory = new Inventory(this.cfg.inventory);
    for (const make of [fireStaff, iceStaff, electricStaff, gravityStaff, laserStaff, bladesStaff]) this.inventory.add(make()); // пока выдаются сразу: на выбор и примерку
    this.invOpen = false;
    if (o.ui.root) {
      this.invUi = new InventoryUi(o.ui.root, this.inventory, this.world.renderer, this.cfg.inventory, () => { this.invOpen = false; });
      this.bus.on('gear:open', () => this.openInventory());
    }
    // Экипировка настоящая: что снято в инвентаре, того нет и на модели героя в мире.
    this.inventory.listen(() => this.syncEquipment());
    this.syncEquipment();
    this.paused = false;
    // Окно выбора усиления на новом уровне: бой стоит, пока оно открыто.
    this.choosing = false;
    if (o.ui.root) {
      this.levelUp = new LevelUp(o.ui.root, { onOpen: () => { this.choosing = true; this.stick.cancel(); }, onClose: () => { this.choosing = false; } });
      this.stats.onLevel = () => { if (this.playing) this.levelUp.request(); };
    }
    this.pauseBtn = o.ui.pauseBtn;
    this.pauseEl = o.ui.pause;
    if (this.pauseBtn) this.pauseBtn.addEventListener('click', () => this.setPaused(true));
    if (this.pauseEl) this.pauseEl.querySelector('button').addEventListener('click', () => this.setPaused(false));
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.playing) this.setPaused(true); });
    this.enterHub();

    window.addEventListener('blur', () => this.stick.cancel());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.stick.cancel(); });
    this.world.follow(0, 0, 0, true);
    if (o.ui.root) {
      this.hud = new Hud(o.ui.root, this.stats, this.world, this.cfg);
      this.staffUi = new StaffUi(o.ui.root, this, this.cfg);
      this.hud.onPowerTap = () => this.staffUi.open(); // тап по счётчику кристаллов усиления
      this.settings = new Settings(o.ui.root, { config: this.cfg, stats: this.stats, world: this.world, game: this });
      this.settings.show(); // шестерёнка и счётчик fps доступны и в хабе
    }
  }

  /** Новая игра: здоровье, опыт и волны с начала. */
  restart() {
    this.stats.reset();
    this.spawner.reset();
    if (this.levelUp) this.levelUp.reset();
    this.enemyShots.clear();
    this.telegraphs.update({ alive: [] });
    this.midges.clear();
    this.midgeView.update(0, this.midges.items);
    this.loot.clear();
    if (this.staffUi) this.staffUi.close();
    for (const b of this.attack.bolts) this.attack.deactivate(b);
  }

  /** Удар жука по герою: учитывает неуязвимость после удара. Возвращает true, если урон прошёл. */
  hurtHero(n) {
    if (this.invuln > 0 || !this.playing || this.stats.hp <= 0) return false;
    this.stats.hurt(n);
    this.invuln = this.cfg.hero.iFrames;
    this.bus.emit('hero:hit', { amount: n, hp: this.stats.hp });
    return true;
  }

  /** Здоровье кончилось: новая игра и возврат в хаб к костру. */
  die() {
    this.restart();
    this.enterHub();
    if (this.ui.start) this.ui.start.classList.remove('gone');
    if (this.hud) { this.hud.hide(); this.settings.hide(); }
  }

  /** Хаб: герой появляется ниже костра, границы поля включены. */
  enterHub() {
    const H = this.cfg.hub;
    const a = Math.PI / 4;
    this.inHub = true;
    this.playing = false;
    this.world.setHubGround(true, H.halfW - 0.5, H.halfD - 0.5);
    this.hub.setActive(true);
    this.scatter.setVisible(false);
    this.motion.bounds = { hx: H.halfW - H.wallMargin, hz: H.halfD - H.wallMargin, ang: a,
      blocks: [
        { x: 0, z: 0, r: H.fireRadius }, // костёр: сквозь него не пройти
        { x: 0, z: H.shopZ, hx: H.shopHalfW + 0.45, hz: H.shopHalfD + 0.45 },
        { x: H.gearX, z: H.gearZ, hx: H.gearHalfW, hz: H.gearHalfD },
      ] };
    this.motion.x = H.startDown * Math.sin(a);
    this.motion.z = H.startDown * Math.cos(a);
    this.motion.vx = this.motion.vz = 0;
    this.world.setView('hub', true);
    this.world.follow(0, this.motion.x, this.motion.z, true);
  }

  /** Показать или спрятать посох и фолиант на модели героя по тому, что надето. */
  syncEquipment() {
    const eq = this.inventory.equipped;
    this.hero.staff.visible = !!eq.staff;
    this.hero.tome.visible = !!eq.tome;
    this.hero.setStaff(eq.staff ? eq.staff.element : null); // у стихийного посоха свой вид
  }

  /** Короткое сообщение посреди экрана (исчезает само). */
  toast(text) {
    const el = this.ui.toast;
    if (!el) return;
    el.textContent = text;
    el.classList.remove('on');
    void el.offsetWidth; // перезапуск анимации, если сообщение показали повторно
    el.classList.add('on');
  }

  /** Кнопка Play из костра: затемнение, и на середине переход из хаба в забег. */
  play() {
    if (!this.inHub || this.switching) return;
    if (!this.inventory.armed) { // без посоха и фолианта в забег не выпустим
      this.toast("You can't leave without a weapon");
      return;
    }
    this.switching = true;
    const fade = this.ui.fade;
    const ms = this.cfg.hub.fadeMs;
    if (fade) { fade.style.transitionDuration = `${ms}ms`; fade.classList.add('on'); }
    if (this.ui.start) this.ui.start.classList.add('gone');
    setTimeout(() => {
      this.inHub = false;
      this.playing = true;
      this.hub.setActive(false);
      this.scatter.setVisible(true);
      this.world.setHubGround(false);
      this.motion.bounds = null;
      this.motion.x = this.motion.z = this.motion.vx = this.motion.vz = 0;
      this.world.setView('run'); // камера плавно отдаляется
      this.world.follow(0, 0, 0, true);
      this.spawner.start();
      if (this.hud) { this.hud.show(); this.settings.show(); }
      if (this.pauseBtn) this.pauseBtn.classList.remove('gone');
      if (fade) fade.classList.remove('on');
      this.switching = false;
    }, ms);
  }

  dash(wx, wz) {
    if (!this.playing && !this.inHub) return;
    if (this.motion.startDash(wx, wz)) this.bus.emit('dash:started', { x: wx, z: wz });
  }

  /** Рывок без свайпа (Пробел): по текущему стику, иначе вперёд по взгляду. */
  dashFromInput() {
    const d = this.readInput(this.tmp);
    if (d.x !== 0 || d.z !== 0) this.dash(d.x, d.z);
    else this.dash(Math.sin(this.hero.yaw), Math.cos(this.hero.yaw));
  }

  /** Мировой вектор ввода (стик или клавиши), длина 0..1. */
  readInput(out) {
    if ((!this.playing && !this.inHub) || this.switching) { out.x = 0; out.z = 0; }
    else if (this.stick.active) screenToWorld(this.stick.x, this.stick.y, out);
    else if (this.keys.read(this.kv)) screenToWorld(this.kv.x, this.kv.y, out);
    else { out.x = 0; out.z = 0; }
    return out;
  }

  /** Один шаг логики. */
  step(dt) {
    const m = this.motion;
    const inp = this.readInput(this.tmp);
    m.update(dt, inp.x, inp.z);
    this.hero.update(dt, m, this.cfg.hero.speed);
    this.stats.update(dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.heroBody.x = m.x; this.heroBody.z = m.z; this.heroBody.radius = this.cfg.hero.radius;
    if (this.playing) {
      this.spawner.update(dt, this.heroBody, this.world.groundRadius());
      this.enemyShots.update(dt, this.heroBody, (dmg) => this.hurtHero(dmg));
      this.telegraphs.update(this.spawner);
      this.midges.update(dt, this.heroBody, (dmg) => this.hurtHero(dmg));
      this.midgeView.update(dt, this.midges.items);
    }
    if (this.playing && this.stats.hp <= 0) this.die();
    this.scatter.update(m.x, m.z);
    if (this.playing) this.attack.update(dt, m.x, m.z);
    this.loot.update(dt, m.x, m.z);
    this.world.follow(dt, m.x, m.z, false);
    this.blizzard.setTarget(this.playing ? this.cfg.blizzard.level : 0); // в хабе тихо
    this.blizzard.update(dt, m.x, m.z, this.world);
  }

  /** Нарисовать стик на экране (DOM поверх канваса). */
  drawStick() {
    const u = this.ui;
    if (!u || !u.base) return;
    const s = this.stick;
    if (!s.active) { u.base.style.opacity = '0'; u.knob.style.opacity = '0'; return; }
    const R = this.cfg.stick.radius;
    u.base.style.opacity = '1';
    u.knob.style.opacity = '1';
    u.base.style.transform = `translate(${s.baseX - R}px, ${s.baseY - R}px)`;
    u.knob.style.transform = `translate(${s.baseX + s.kx - R * 0.42}px, ${s.baseY + s.ky - R * 0.42}px)`;
  }

  /** Окно инвентаря из хаба: хаб замирает, вместо мира рисуется витрина мага. */
  openInventory() {
    if (!this.inHub || this.switching || this.invOpen || !this.invUi) return;
    this.invOpen = true;
    this.stick.cancel();
    this.invUi.show();
  }

  /** Пауза боя: логика стоит, кадр рисуется, поверх окно с кнопкой продолжить. Только в забеге. */
  setPaused(on) {
    if (on && !this.playing) return;
    this.paused = on;
    this.stick.cancel();
    if (this.pauseEl) this.pauseEl.classList.toggle('on', on);
  }

  /** Счётчик кадров в секунду: среднее за ~0,5 с, цвет по запасу (зелёный от 50, жёлтый от 30, красный ниже). */
  tickFps(dt) {
    const el = this.ui.fps;
    if (!el) return;
    this.fpsT = (this.fpsT || 0) + dt;
    this.fpsN = (this.fpsN || 0) + 1;
    if (this.fpsT < 0.5) return;
    const v = Math.round(this.fpsN / this.fpsT);
    el.textContent = `${v} fps`;
    el.dataset.q = v >= 50 ? 'ok' : v >= 30 ? 'mid' : 'low';
    this.fpsT = 0;
    this.fpsN = 0;
  }

  frame(now) {
    if (!this.running) return;
    const t = now / 1000;
    const dt = Math.min(0.1, this.last ? t - this.last : 1 / 60);
    this.last = t;
    this.tickFps(dt);
    if (!this.paused && !this.invOpen && !this.choosing) advance(dt, (s) => this.step(s));
    this.drawStick();
    if (!this.paused && !this.invOpen) this.hub.update(dt, this.motion.x, this.motion.z);
    if (this.invOpen) this.invUi.render(dt);
    else this.world.render();
    if (this.staffUi) this.staffUi.update(dt);
    const hubOn = this.inHub && !this.switching && !this.invOpen;
    this.playBtn.update(dt, Math.hypot(this.motion.x, this.motion.z), this.world, hubOn, 0, this.cfg.hub.buttonFromY, 0);
    const an = this.hub.shopButtonAnchor(this.anchor);
    this.shopBtn.update(dt, this.hub.distToShop(this.motion.x, this.motion.z), this.world, hubOn, an.x, an.y, an.z);
    const ag = this.hub.gearButtonAnchor(this.anchor);
    this.gearBtn.update(dt, this.hub.distToGear(this.motion.x, this.motion.z), this.world, hubOn, ag.x, ag.y, ag.z);
    if (this.hud) { this.hud.update(dt, this.hero); this.settings.refresh(); }
    requestAnimationFrame((n) => this.frame(n));
  }

  start() {
    requestAnimationFrame((n) => this.frame(n));
  }
}
