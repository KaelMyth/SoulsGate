// Сборка игры: создаёт части и связывает их. Правила боя лежат в systems/, здесь только проводка.
import { LightDash } from './systems_lightdash.js';
import { Rewards } from './systems_rewards.js';
import { LevelUpScreen } from './ui_levelup.js';
import { Aura } from './systems_aura.js';
import { phantomSpot, phantomRoll } from './systems_phantom.js';
import { EventBus } from './core_events.js';
import { FixedStepper, FpsMeter, GameLoop } from './core_loop.js';
import { EntityPool } from './core_entity-pool.js';
import { CollisionWorld, Layer } from './core_collision.js';
import { Stick } from './input_stick.js';
import { Arena } from './world_arena.js';
import { Hero } from './world_hero.js';
import { Camera } from './world_camera.js';
import { NavGrid } from './world_nav.js';
import { createEnemy, resetEnemy, updateEnemy, applyKnockback } from './world_enemy.js';
import { createProjectile, resetProjectile, updateProjectile } from './world_projectile.js';
import { createEffect, resetEffect, initEffect, initGlob, updateEffect } from './world_effects.js';
import { Combat } from './systems_combat.js';
import { AutoAttack } from './systems_autoattack.js';
import { Spawner } from './systems_spawner.js';
import { Swarm } from './systems_swarm.js';
import { HeroDefense } from './systems_defense.js';
import { RockBeetles } from './systems_rockbeetle.js';
import { Apostles } from './systems_apostles.js';
import { ApotheosisAI } from './systems_apotheosis.js';
import { Shooters } from './systems_shooters.js';
import { Attacks } from './systems_attacks.js';
import { Boss } from './systems_boss.js';
import { Xp, createGem, resetGem } from './systems_xp.js';
import { SwipeDetector } from './input_swipe.js';
import { Renderer } from './render_renderer.js';
import { DebugPanel } from './debug_panel.js';
import { DeathScreen } from './ui_death-screen.js';
import { PauseUI } from './ui_pause.js';
import { ModeScreen } from './ui_mode-screen.js';
import { getPath, setPath } from './debug_tunables.js';
import { BuildGrid } from './build_grid.js';
import { Storage } from './build_storage.js';
import { Blades } from './systems_blades.js';
import { Pellets } from './systems_pellets.js';
import { layoutCores } from './build_placement.js';
import { SlotUI } from './ui_slot.js';
import { readSafeInsets } from './platform_viewport.js';

export class Game {
  /** o: { canvas, uiRoot, probe, config, defaults, tunables, build, storage, storageKey, rnd? } */
  constructor(o) {
    this.o = o;
    const config = o.config;
    this.config = config;
    this.canvas = o.canvas;
    this.probe = o.probe;
    this.rnd = o.rnd || Math.random;

    this.bus = new EventBus();
    this.arena = new Arena(config.arena);
    this.nav = new NavGrid(this.arena, config.nav);
    this.hero = new Hero(config.hero);
    this.camera = new Camera(config.camera);
    this.stick = new Stick(o.canvas, this.bus, config.stick);
    this.insets = readSafeInsets(o.probe);

    // Состояние забега.
    this.state = 'playing'; // 'playing' | 'paused' | 'dead' | 'menu' | 'cutscene' (вступление босса: мир замер, камера на боссе)
    this.cine = null;       // состояние вступления босса: { t, fromX, fromY, boss }
    this.deadTimer = 0;
    this.kills = 0;
    this.runTime = 0;
    this.hud = {
      insets: this.insets, kills: 0,
      wave: 1, intermission: 0, intermissionTotal: 1, crash: false, alive: 0, cap: 0, crashResult: '',
      bossTitle: '', bossTitleAlpha: 0, // имя босса при вступлении и его прозрачность 0..1
    };
    this.zapBolts = [];    // цепные молнии разряда для рисования: { x0, y0, x1, y1, age }
    this.shockSource = { shock: true, active: true };
    this.fires = [];       // костры огненного рывка: { x, y, age, tick }
    this.fireLast = null;  // где стоял последний костёр шлейфа
    this.steamClouds = []; // облака пара на земле: { x, y, age, tick, hit:Set, dmg, int }
    this.crashResult = null; // { enemies, fps, wave, time }: первая просадка FPS в краш-тесте
    this.sagTimer = 0;
    this.sagCount = 0;
    this.storage = o.storage || null;
    this.hitStop = 0;      // остановка времени при парировании, с
    this.blocks = 0;       // счётчики для панели: сколько блоков и парирований
    this.parries = 0;

    // Объекты боя: списки с пулами. Вражеские снаряды пока никто не выпускает (стрелок на этапе 4).
    this.enemies = new EntityPool(createEnemy, resetEnemy, 16);
    this.heroShots = new EntityPool(createProjectile, resetProjectile, 16);
    this.enemyShots = new EntityPool(createProjectile, resetProjectile, 0);
    this.effects = new EntityPool(createEffect, resetEffect, 24);
    this.gems = new EntityPool(createGem, resetGem, 32);
    this.heroList = [this.hero];

    this.combat = new Combat(this.bus, this.hero, config.combat);
    this.defense = new HeroDefense({
      config, hero: this.hero, stick: this.stick, bus: this.bus,
      modifiers: (id) => (this.build ? this.build.modifiersFor(id) : null),
    });
    this.swipe = new SwipeDetector(this.bus, config.dash, (dx, dy) => {
      if (this.state === 'playing') this.defense.tryDash(dx, dy);
    });
    this.xp = new Xp({ config, hero: this.hero, gems: this.gems, bus: this.bus, rnd: this.rnd });
    this.attacks = new Attacks({ config, hero: this.hero, arena: this.arena, combat: this.combat, bus: this.bus, defense: this.defense });
    this.boss = new Boss({ config, enemies: this.enemies, hero: this.hero, arena: this.arena, combat: this.combat, bus: this.bus, defense: this.defense, rnd: this.rnd });
    this.shooters = new Shooters({ config, hero: this.hero, arena: this.arena, shots: this.enemyShots, bus: this.bus });
    this.apostles = new Apostles({ config, hero: this.hero, arena: this.arena, enemies: this.enemies, combat: this.combat, defense: this.defense, bus: this.bus, rnd: this.rnd });
    this.apotheosis = new ApotheosisAI({ config, hero: this.hero, arena: this.arena, apostles: this.apostles, combat: this.combat, defense: this.defense, bus: this.bus });
    this.rockBeetles = new RockBeetles({ config, camera: this.camera, hero: this.hero, arena: this.arena, nav: this.nav, enemies: this.enemies, combat: this.combat, defense: this.defense, bus: this.bus, rnd: this.rnd });
    this.swarm = new Swarm(config.swarm, this.arena); // сетка соседей: нужна и стае, и автоатаке
    this.lasers = []; // лучи на поле: { x, y, dx, dy, len, width, age, life, ... }
    this.laserSource = { laser: true, active: true };
    this.rayE = []; // враги на луче и расстояния до них (буферы, чтобы не создавать каждый кадр)
    this.rayT = [];
    this.pelletSource = { pellet: true, active: true };
    this.pellets = new Pellets({
      config, arena: this.arena, grid: this.swarm.grid, enemies: this.enemies,
      onHit: (e, dmg, vx, vy, bd, bi, fr, st, zp) => {
        const sp = Math.hypot(vx, vy) || 1;
        this.combat.damageEnemy(e, dmg, this.pelletSource, { knockback: config.shot.knockback, dirX: vx / sp, dirY: vy / sp });
        if (!e.active) return;
        if (bd > 0) this.ignite(e, bd, bi);   // поджигает и морозит только половина дробинок (см. fireShot)
        if (fr) this.chill(e, bd > 0 ? st : 0, bd, bi);
        if (zp) this.zap(e);
      },
    });
    this.autoattack = new AutoAttack({
      pellets: this.pellets,
      lasers: this.lasers,
      config, hero: this.hero, enemies: this.enemies, shots: this.heroShots, bus: this.bus, arena: this.arena,
      grid: this.swarm.grid,
      rnd: this.rnd,
      modifiers: (id) => (this.build ? this.build.modifiersFor(id) : null),
    });

    this.lightdash = new LightDash({ config, hero: this.hero, enemies: this.enemies, arena: this.arena, combat: this.combat, rnd: this.rnd, onHit: (e) => this.zap(e) });
    this.defense.lightning = this.lightdash;
    this.phSpot = { x: 0, y: 0, d: 0 }; // буфер точки появления фантома: без новых объектов в горячем цикле
    this.blades = new Blades({
      config, arena: this.arena, rnd: this.rnd, hero: this.hero, enemies: this.enemies, grid: this.swarm.grid, combat: this.combat,
      lasers: this.lasers,
      pellets: this.pellets,
      modifiers: (id) => (this.build ? this.build.modifiersFor(id) : null),
      ignite: (e, d, i) => this.ignite(e, d, i),
      chill: (e, s, d, i) => this.chill(e, s, d, i),
      zap: (e) => this.zap(e),
    });

    this.aura = new Aura({
      config, hero: this.hero, enemies: this.enemies, grid: this.swarm.grid, combat: this.combat,
      modifiers: (id) => (this.build ? this.build.modifiersFor(id) : null),
      ignite: (e, d, i) => this.ignite(e, d, i),
      chill: (e, s, d, i) => this.chill(e, s, d, i),
      zap: (e) => this.zap(e),
      rnd: this.rnd,
    });

    this.renderer = new Renderer(o.canvas, config, {
      arena: this.arena,
      hero: this.hero,
      camera: this.camera,
      stick: this.stick,
      enemies: this.enemies,
      heroShots: this.heroShots,
      enemyShots: this.enemyShots,
      midges: this.rockBeetles.midges,
      apostles: this.apostles,
      apotheosis: this.apotheosis,
      getPortal: () => this.spawner.portal,
      effects: this.effects,
      gems: this.gems,
      autoattack: this.autoattack,
      defense: this.defense,
      boss: this.boss,
      clouds: this.steamClouds,
      blades: this.blades.items,
      aura: this.aura,
      lightdash: this.lightdash,
      zapBolts: this.zapBolts,
      fires: this.fires,
      pellets: this.pellets,
      lasers: this.lasers,
      hud: this.hud,
    });
    this.spawner = new Spawner({
      config, enemies: this.enemies, camera: this.camera, arena: this.arena, rnd: this.rnd, bus: this.bus, hero: this.hero,
    });

    // Слои столкновений: кто с кем взаимодействует, объявлено здесь, а не размазано по коду.
    this.collisions = new CollisionWorld();
    this.collisions.setLayer(Layer.HERO, this.heroList);
    this.collisions.setLayer(Layer.ENEMY, this.enemies.items);
    this.collisions.setLayer(Layer.HERO_PROJ, this.heroShots.items);
    this.collisions.setLayer(Layer.ENEMY_PROJ, this.enemyShots.items);
    // Снаряды героя против врагов считает hitEnemiesWithShots через сетку: перебор «каждый с каждым» не тянет сотни снарядов.
    this.collisions.addRule(Layer.ENEMY_PROJ, Layer.HERO, (p) => this.onEnemyShotHitHero(p));
    this.collisions.addRule(Layer.ENEMY, Layer.HERO, (e) => this.onEnemyTouchHero(e));

    this.deathScreen = new DeathScreen(o.uiRoot, () => this.restart());
    this.rewards = new Rewards({ config, rnd: this.rnd });
    this.pendingLevels = 0; // повышений уровня, по которым ещё не выбрана награда
    this.levelUpOffers = [];
    this.levelUpScreen = new LevelUpScreen(o.uiRoot, (offer) => this.pickReward(offer), () => this.exchangeReward(), (offer) => this.previewReward(offer));
    this.build = new BuildGrid(config.build.size);
    this.inventory = new Storage(config.build.storageSlots);
    this.layoutBuild();
    this.pauseUI = new PauseUI(o.uiRoot, {
      onToggle: () => this.togglePause(),
      onResume: () => this.resume(),
      onRestart: () => this.restart(),
      onExit: () => this.exitToMenu(),
    }, this.build, this.inventory, config);

    this.slotPresses = 0;
    this.slot = new SlotUI(o.uiRoot, (n, i) => {
      this.slotPresses = n;
      this.hud.slotFlash = i + 1;
      this.bus.emit('slot:pressed', { count: n, slot: i });
    });

    // Экран выбора режима (в тестах и без o.menu игра сразу идёт, как раньше).
    this.burnSource = { burn: true, active: true };
    this.mode = 'test';
    this.testValues = null;
    this.modeScreen = new ModeScreen(o.uiRoot, (m) => this.startMode(m));

    this.stepper = new FixedStepper(config.step);
    this.meter = new FpsMeter();

    this.panel = new DebugPanel({
      root: o.uiRoot,
      config,
      defaults: o.defaults,
      tunables: o.tunables,
      bus: this.bus,
      meter: this.meter,
      storage: o.storage,
      storageKey: o.storageKey,
      actions: [
        { label: 'К боссу: Тартас (волна 10)', run: () => this.skipToBoss('mid') },
        { label: 'К боссу: Апофеоз (волна 20)', run: () => this.skipToBoss('final') },
      ],
      build: o.build,
      getStats: () => ({
        steps: this.stepper.lastSteps,
        objects: this.objectCount(),
        enemies: this.enemies.count,
        shots: this.heroShots.count + this.enemyShots.count,
        effects: this.effects.count,
        gems: this.gems.count,
        level: this.xp.level + ' (' + Math.floor(this.xp.xp) + '/' + (this.xp.need || 'макс') + ')',
        hp: Math.ceil(this.hero.hp) + '/' + config.hero.maxHp,
        kills: this.kills,
        wave: this.waveLabel(),
        cap: this.hud.cap,
        checks: this.swarm.pairChecks,
        crash: this.crashResult ? this.crashText() : '',
        defense: 'состояние ' + this.defense.state + ' · блоков ' + this.blocks + ' · парирований ' + this.parries + ' · слот нажат ' + this.slotPresses,
        stick: this.stick.active
          ? 'x ' + this.stick.x.toFixed(2) + ' y ' + this.stick.y.toFixed(2)
          : 'не нажат',
      }),
    });

    this.loop = new GameLoop({
      stepper: this.stepper,
      update: (dt) => this.update(dt),
      render: (alpha) => this.renderer.draw(alpha),
      meter: this.meter,
    });

    // Реакции на события боя: счёт и вспышки. Подписчики добавляются без правки систем.
    const C = config.render.colors;
    this.bus.on('enemy:killed', ({ enemy }) => {
      this.kills++;
      this.hud.kills = this.kills;
      this.burst(enemy.x, enemy.y, 0.35, enemy.radius * 0.6, enemy.radius * 3, enemy.def.edge);
    });
    this.bus.on('damage:dealt', (e) => {
      if (e.targetKind === 'enemy') {
        if (e.source && e.source.burn) this.burst(e.target.x, e.target.y - e.target.radius * 0.4, 0.2, 2, 8, config.burn.color);
        else if (e.source && e.source.shock) this.burst(e.target.x, e.target.y, 0.2, 3, 14, config.shock.color);
        else if (e.source && (e.source.laser || e.source.pellet || e.source.aura)) { /* тики луча без вспышек: хватает мигания врага */ }
        else this.burst(e.target.x, e.target.y, 0.15, 3, 12, '#ffffff');
      }
      else this.burst(e.target.x, e.target.y, 0.25, e.target.radius, e.target.radius * 2.4, C.hurt);
    });
    // Липкий снаряд стрелка попал в героя: сопли. Только вид, на урон не влияет.
    this.bus.on('damage:dealt', (e) => {
      const s = e.source;
      if (e.targetKind === 'hero' && s && s.owner && s.owner.def && s.owner.def.shot) this.splat(e.target.x, e.target.y, s.vx, s.vy);
    });
    // Удар врага с атакой (рывок быка) попал по герою: красные искры летят по ходу удара. Только вид.
    this.bus.on('damage:dealt', (e) => {
      const en = e.source && e.source.enemy;
      if (e.targetKind === 'hero' && en && en.def && en.def.attack) {
        this.hitSparks(e.target.x, e.target.y, en.atk.dirX, en.atk.dirY, 16, config.render.colors.sparkRed);
      }
    });
    // Вышел босс: мир замирает, камера плывёт к нему (см. updateCine).
    this.bus.on('boss:spawned', ({ enemy }) => this.startBossIntro(enemy));
    // Вспышки к атакам босса: кольцо на старте рывка, взрыв в области пересечения разломов.
    this.bus.on('boss:dash', ({ enemy }) => this.burst(enemy.x, enemy.y, 0.25, enemy.radius, enemy.radius * 2, enemy.def.edge));
    this.bus.on('boss:blast', ({ x, y, hit }) => {
      this.burst(x, y, 0.4, 8, 46, config.render.colors.fissureCore);
      this.sparks(x, y, hit ? 10 : 6, config.render.colors.fissureCore);
    });
    // Портал (ЗАГЛУШКА вспышек): вспышка при открытии и при гашении.
    this.bus.on('portal:opened', ({ portal }) => this.burst(portal.x, portal.y, 0.6, 10, 90, '#c7a8ff'));
    this.bus.on('portal:closing', ({ portal }) => this.burst(portal.x, portal.y, 0.7, 20, 140, '#ffffff'));
    // Руки Апофеоза (ЗАГЛУШКИ вспышек): удар по полосе.
    this.bus.on('apotheosis:slam', ({ x, y }) => { this.burst(x, y, 0.5, 20, 120, '#6a4a7a'); this.sparks(x, y, 8, '#ff6a6a'); });
    // Апостолы (ЗАГЛУШКИ вспышек): призыв, лечение, взрыв Силы, вылет золотого клинка.
    this.bus.on('apostle:summon', ({ x, y }) => this.burst(x, y, 0.5, 10, 50, config.render.colors.snowLight));
    this.bus.on('apostle:heal', ({ enemy }) => this.burst(enemy.x, enemy.y, 0.4, enemy.radius, enemy.radius * 2.2, '#9cffb0'));
    this.bus.on('apostle:explode', ({ x, y, hit }) => { this.burst(x, y, 0.4, 10, 70, '#ff8a6a'); this.sparks(x, y, hit ? 10 : 6, '#ffc0b0'); });
    this.bus.on('apostle:blade-fly', ({ blade }) => this.burst(blade.x1, blade.y1, 0.2, 4, 16, '#ffe27a'));
    // Горные жуки (ЗАГЛУШКИ вспышек): пыль на месте скалы, кольцо от удара в землю, искра сбитой мошки.
    this.bus.on('rock:woke', ({ x, y, r }) => { this.burst(x, y, 0.5, r * 0.5, r * 1.8, config.render.colors.snowLight); this.sparks(x, y, 8, config.render.colors.stoneLight); });
    this.bus.on('rockbeetle:slam', ({ enemy }) => this.burst(enemy.x, enemy.y, 0.35, enemy.radius, enemy.radius * 3, config.render.colors.stoneLight));
    this.bus.on('midge:died', ({ x, y }) => this.burst(x, y, 0.2, 3, 12, '#cfe0f5'));
    // Краш-тест: герой бессмертен, иначе погибнет раньше, чем что-нибудь успеем измерить.
    this.bus.on('hero:hit-incoming', (inc) => {
      if (this.spawner.crash && config.waves.crash.godMode >= 1) inc.cancelled = true;
    });
    // Блок и парирование: вспышки, искры и остановка времени. Сами они считаются в systems/defense.js.
    this.bus.on('hero:blocked', (e) => {
      this.blocks++;
      const src = e && e.source;
      this.renderer.shieldHit(src ? src.x : NaN, src ? src.y : NaN, false);
      this.burst(this.hero.x, this.hero.y, 0.2, this.defense.blockRadius * 0.8, this.defense.blockRadius * 1.25, C.blockEdge);
    });
    this.bus.on('hero:parried', (e) => {
      this.parries++;
      this.renderer.shieldHit(e.x, e.y, true);
      this.hitStop = Math.max(this.hitStop, config.block.hitStop);
      this.burst(this.hero.x, this.hero.y, 0.3, this.defense.blockRadius, this.defense.blockRadius * 1.9, C.parry);
      this.sparks(e.x, e.y, config.block.sparks, C.spark);
    });
    this.bus.on('hero:levelup', () => { if (this.mode === 'game' || config.rewards.inTest) this.pendingLevels++; });
    this.bus.on('hero:levelup', () => this.burst(this.hero.x, this.hero.y, 0.6, this.hero.radius, this.hero.radius * 5, '#7dffb0'));
    this.bus.on('hero:died', () => {
      this.state = 'dead';
      this.deadTimer = 0;
      this.burst(this.hero.x, this.hero.y, 0.7, this.hero.radius, this.hero.radius * 6, C.hero);
    });

    this.bus.on('config:changed', (e) => {
      if (e.path === 'render.maxDpr') this.onResize();
      // Размер поля или расстояние между ядрами: ядра встают заново.
      if (e.path === 'build.size' || e.path === 'build.minCoreDistance') this.relayoutBuild();
      else if (this.pauseUI.visible) this.pauseUI.refresh();
      // Ползунок «Прыгнуть на волну»: перенос сразу, без перезапуска забега.
      if (e.path === 'waves.startWave' && this.state !== 'dead' && this.state !== 'cutscene') this.jumpToWave(e.value);
    });
    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('orientationchange', () => this.onResize());
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => this.onResize()).observe(o.canvas);
    // Свернули приложение: палец «потерялся», отпускаем стик.
    // Заодно ставим игру на паузу: вернулся и продолжил, а не погиб, пока отвечал в мессенджере.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.stick.cancel();
        this.pause();
      }
    });
    window.addEventListener('blur', () => {
      this.stick.cancel();
      this.pause();
    });
    // Для отладки на компьютере: P или Esc.
    document.addEventListener('keydown', (e) => {
      if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') this.togglePause();
    });
  }

  /** Всё, что есть в мире: герой, скалы, враги, снаряды, эффекты. */
  objectCount() {
    return 1 + this.arena.objectCount + this.enemies.count + this.heroShots.count
      + this.enemyShots.count + this.effects.count;
  }

  burst(x, y, life, r0, r1, color) {
    if (this.effects.count >= this.config.render.maxEffects) return;
    initEffect(this.effects.spawn(), x, y, life, r0, r1, color);
  }

  /** Искры: короткие чёрточки, разлетающиеся во все стороны. */
  sparks(x, y, n, color) {
    for (let i = 0; i < n; i++) {
      if (this.effects.count >= this.config.render.maxEffects) return;
      const a = this.rnd() * Math.PI * 2;
      initEffect(this.effects.spawn(), x, y, 0.3 + this.rnd() * 0.2, 6, 26 + this.rnd() * 34, color, a);
    }
  }

  /** Искры веером по направлению удара (от героя вперёд, а не во все стороны). */
  hitSparks(x, y, dirX, dirY, n, color) {
    const base = Math.atan2(dirY, dirX);
    for (let i = 0; i < n; i++) {
      if (this.effects.count >= this.config.render.maxEffects) return;
      const a = base + (this.rnd() - 0.5) * 2.2;
      initEffect(this.effects.spawn(), x, y, 0.3 + this.rnd() * 0.25, 8, 36 + this.rnd() * 50, color, a);
    }
  }

  /** Сопли: пятно на герое и капли, разлетающиеся во все стороны (чуть дальше по ходу снаряда). Рисует renderer.drawGlob. */
  splat(x, y, dirX, dirY) {
    const color = this.config.render.colors.snot;
    const len = Math.hypot(dirX, dirY) || 1;
    const bx = dirX / len;
    const by = dirY / len;
    if (this.effects.count < this.config.render.maxEffects) initGlob(this.effects.spawn(), x, y, 0.9, 0, 0, 11, color, 0);
    for (let i = 0; i < 9; i++) {
      if (this.effects.count >= this.config.render.maxEffects) return;
      const a = this.rnd() * Math.PI * 2;
      const sp = 70 + this.rnd() * 130;
      initGlob(this.effects.spawn(), x, y, 0.45 + this.rnd() * 0.35,
        Math.cos(a) * sp + bx * 50, Math.sin(a) * sp + by * 50, 2.2 + this.rnd() * 3.2, color, 4.5);
    }
  }

  /** Попадания снарядов героя во врагов: кандидатов дают клетки сетки, точное пересечение проверяется по кругам. */
  hitEnemiesWithShots() {
    const shots = this.heroShots.items;
    const en = this.enemies.items;
    const grid = this.swarm.grid;
    let big = 0;
    for (const k in this.config.enemies) big = Math.max(big, this.config.enemies[k].radius || 0);
    const reach = big + 12; // самый крупный враг + запас на сдвиг врагов с момента сборки сетки
    for (let i = 0; i < shots.length; i++) {
      const p = shots[i];
      if (!p.active) continue;
      const n = grid.query(p.x, p.y, p.radius + reach);
      const buf = grid.buf;
      for (let k = 0; k < n; k++) {
        const e = en[buf[k]];
        if (!e.active) continue;
        this.collisions.checks++;
        const dx = p.x - e.x;
        const dy = p.y - e.y;
        const r = p.radius + e.radius;
        if (dx * dx + dy * dy <= r * r) {
          this.onShotHitEnemy(p, e);
          if (!p.active) break;
        }
      }
    }
  }

  /** Поджечь врага: горит burn.duration секунд; повторное попадание обновляет время, берётся более сильный огонь. */
  ignite(e, dmg, interval) {
    const b = this.config.burn;
    if (e.burnT <= 0 || dmg >= e.burnDmg) {
      e.burnDmg = dmg;
      e.burnInt = Math.max(0.05, interval);
    }
    if (e.burnT <= 0) e.burnTick = e.burnInt;
    e.burnT = b.duration;
  }

  /** Электризация: +1 заряд; на последнем враг разряжается (см. discharge). */
  zap(e) {
    if (!e || !e.active) return;
    const S = this.config.shock;
    e.shockStacks++;
    e.shockT = S.stackTime;
    if (e.shockStacks >= S.maxStacks) {
      e.shockStacks = 0;
      e.shockT = 0;
      this.discharge(e);
    }
  }

  /** Разряд: удар по врагу и цепная молния на 2–3 ближайших (цепь электризации не копит, чтобы не было бесконечных цепей). */
  discharge(e) {
    const S = this.config.shock;
    const grid = this.swarm.grid;
    const en = this.enemies.items;
    this.combat.damageEnemy(e, S.damage, this.shockSource, null);
    this.burst(e.x, e.y, 0.3, e.radius, e.radius * 2.4, S.color);
    const want = S.chainMin + Math.floor(this.rnd() * (S.chainMax - S.chainMin + 1));
    const n = grid.query(e.x, e.y, S.chainRange);
    const buf = grid.buf;
    // Выбираем want ближайших (простая вставка в малый массив без аллокаций на врага).
    const bestE = this._zapE || (this._zapE = []);
    const bestD = this._zapD || (this._zapD = []);
    bestE.length = 0; bestD.length = 0;
    for (let k = 0; k < n; k++) {
      const o = en[buf[k]];
      if (!o || !o.active || o === e) continue;
      const dx = o.x - e.x, dy = o.y - e.y;
      const d = dx * dx + dy * dy;
      if (d > S.chainRange * S.chainRange) continue;
      let j = bestE.length;
      if (j >= want && d >= bestD[j - 1]) continue;
      if (j < want) { bestE.push(o); bestD.push(d); } else j--;
      while (j > 0 && bestD[j - 1] > d) { bestE[j] = bestE[j - 1]; bestD[j] = bestD[j - 1]; j--; }
      bestE[j] = o; bestD[j] = d;
    }
    for (let k = 0; k < bestE.length; k++) {
      const o = bestE[k];
      this.zapBolts.push({ x0: e.x, y0: e.y, x1: o.x, y1: o.y, age: 0 });
      this.combat.damageEnemy(o, S.damage * S.chainFrac, this.shockSource, null);
      if (o.active) this.burst(o.x, o.y, 0.2, 3, 12, S.color);
    }
  }

  /** Заряды электризации тают, если давно не подновлялись; молнии разряда гаснут. */
  updateShock(dt) {
    const en = this.enemies.items;
    for (let i = 0; i < en.length; i++) {
      const e = en[i];
      if (!e.active || e.shockStacks <= 0) continue;
      e.shockT -= dt;
      if (e.shockT <= 0) e.shockStacks = 0;
    }
    const zb = this.zapBolts;
    for (let i = zb.length - 1; i >= 0; i--) {
      zb[i].age += dt;
      if (zb[i].age > 0.25) zb.splice(i, 1);
    }
  }

  /**
   * Холод от попадания: +1 заряд, каждый замедляет; на maxStacks цель замерзает на freezeTime.
   * Если у снаряда связка с Горением (steam > 0), на последнем заряде вместо заморозки взрыв пара.
   * quiet: заряд от облака пара: он не взрывает цель сам (цепочки взрывов не нужны), копится максимум до maxStacks − 1.
   */
  chill(e, steam = 0, burnDmg = 0, burnInt = 0, quiet = false) {
    const f = this.config.frost;
    const immune = !!(e.def && e.def.immuneFrost); // босс-рыцарь: холод не замедляет и не замораживает, заряды (для пара) копятся
    if (e.freezeT > 0) return; // уже заморожен: заряды не копятся
    if (quiet && e.frostStacks >= f.maxStacks - 1) return;
    e.frostStacks++;
    e.frostT = f.stackTime;
    if (e.frostStacks >= f.maxStacks) {
      e.frostStacks = 0;
      e.speedMul = 1;
      if (steam > 0) {
        this.steamBurst(e.x, e.y, burnDmg * steam, burnInt);
        return;
      }
      if (immune) return;
      e.freezeT = f.freezeTime;
      e.speedMul = 0;
      e.kbVx = e.kbVy = 0;
      this.burst(e.x, e.y, 0.35, e.radius, e.radius * 2.6, f.color);
    } else if (!immune) {
      e.speedMul = 1 - e.frostStacks * f.slowPerStack;
    }
  }

  /** Взрыв пара: облако остаётся на земле steam.duration секунд; всем внутри горение и по одному заряду Мороза. */
  steamBurst(x, y, dmg, interval) {
    const st = this.config.steam;
    const cl = this.steamClouds;
    if (cl.length >= 12) cl.shift(); // облаков не больше 12: самое старое тает сразу
    const c = { x, y, age: 0, tick: 0, hit: new Set(), dmg, int: interval, seed: this.rnd() * 100 };
    cl.push(c);
    this.applySteam(c);
    this.burst(x, y, 0.3, st.radius * 0.3, st.radius, st.color); // вспышка на старте
  }

  /** Облако действует на тех, кто внутри: горение обновляется, заряд Мороза вешается один раз на врага за облако. */
  applySteam(c) {
    const st = this.config.steam;
    const en = this.enemies.items;
    const grid = this.swarm.grid;
    const n = grid.query(c.x, c.y, st.radius + 40);
    const buf = grid.buf;
    for (let k = 0; k < n; k++) {
      const e = en[buf[k]];
      if (!e || !e.active) continue;
      const dx = e.x - c.x;
      const dy = e.y - c.y;
      const r = st.radius + e.radius;
      if (dx * dx + dy * dy > r * r) continue;
      this.ignite(e, c.dmg, c.int);
      if (!c.hit.has(e)) {
        c.hit.add(e);
        this.chill(e, 0, 0, 0, true);
      }
    }
  }

  /**
   * Луч растёт из героя, дальний конец следует за целью. Без Пробития он упирается в первого врага на пути,
   * с Пробитием проходит насквозь столько врагов, сколько дано. Скалы обрезают луч.
   */
  updateLasers(dt) {
    const ls = this.lasers;
    for (let i = ls.length - 1; i >= 0; i--) {
      const l = ls[i];
      const an = l.anchor; // луч сферы клинка привязан к ней, остальные к герою
      if (an && an.state === 'gone') { ls.splice(i, 1); continue; }
      if (!l.fixed) { // фантомный луч стоит на месте, остальные привязаны к герою или к сфере
        l.x = an ? an.x : this.hero.x;
        l.y = an ? an.y : this.hero.y;
      }
      const tg = l.target;
      if (tg && !tg.active) { this.endLaser(l, ls, i); continue; } // цель погибла: луч гаснет сразу
      if (tg) {
        const ax = tg.x - l.x;
        const ay = tg.y - l.y;
        const d = Math.hypot(ax, ay);
        if (d > 1e-3) { l.dx = ax / d; l.dy = ay / d; }
      }
      this.scanLaser(l);
      l.age += dt;
      while (l.done < l.ticks && l.age >= l.done * l.interval) {
        this.laserTick(l);
        l.done++;
      }
      if (l.target && !l.target.active) this.endLaser(l, ls, i); // убит тиком этого кадра
      else if (l.age >= l.life) this.endLaser(l, ls, i);
    }
  }

  /** Луч закончился: убираем его, а сфера клинка, из которой он шёл, исчезает вместе с ним. */
  endLaser(l, ls, i) {
    if (l.anchor) l.anchor.state = 'gone';
    ls.splice(i, 1);
  }

  /** Находит, докуда доходит луч и кого он задевает (rayE по порядку от героя); пишет длину в l.len. */
  scanLaser(l) {
    const maxLen = this.config.laser.length;
    let cut = maxLen;
    const pad = l.width * 0.3;
    const ex = l.x + l.dx * maxLen;
    const ey = l.y + l.dy * maxLen;
    if (this.arena.segmentBlocked(l.x, l.y, ex, ey, pad)) {
      let lo = 0;
      let hi = maxLen;
      for (let k = 0; k < 7; k++) {
        const mid = (lo + hi) / 2;
        if (this.arena.segmentBlocked(l.x, l.y, l.x + l.dx * mid, l.y + l.dy * mid, pad)) hi = mid; else lo = mid;
      }
      cut = lo;
    }
    const en = this.enemies.items;
    const grid = this.swarm.grid;
    const n = grid.query(l.x + l.dx * cut * 0.5, l.y + l.dy * cut * 0.5, cut * 0.5 + l.width + 30);
    const buf = grid.buf;
    const E = this.rayE;
    const T = this.rayT;
    E.length = 0;
    T.length = 0;
    for (let k = 0; k < n; k++) {
      const e = en[buf[k]];
      if (!e || !e.active) continue;
      const px = e.x - l.x;
      const py = e.y - l.y;
      const t = px * l.dx + py * l.dy;
      if (t < 0 || t > cut) continue;
      if (Math.abs(px * l.dy - py * l.dx) > l.width * 0.5 + e.radius) continue;
      let j = E.length; // вставка по возрастанию t: врагов на луче единицы
      E.push(e);
      T.push(t);
      while (j > 0 && T[j - 1] > t) { T[j] = T[j - 1]; E[j] = E[j - 1]; j--; }
      T[j] = t;
      E[j] = e;
    }
    l.hits = Math.min(E.length, l.pierce + 1); // сколько врагов луч бьёт: первые pierce + 1
    l.len = E.length > l.pierce ? T[l.pierce] : cut;
  }

  laserTick(l) {
    l.pulse = 1;
    const E = this.rayE;
    const hit = [];
    for (let k = 0; k < l.hits; k++) hit.push(E[k]);
    // Бьём после поиска: убийство меняет пул врагов.
    for (const e of hit) {
      if (!e.active) continue;
      this.combat.damageEnemy(e, l.tick, this.laserSource, null);
      if (!e.active) continue;
      if (l.burnDmg > 0) this.ignite(e, l.burnDmg, l.burnInt);
      if (l.frost) this.chill(e, l.steam, l.burnDmg, l.burnInt);
      if (l.zap) this.zap(e);
    }
    if (l.phantom > 0) { // фантом: каждый тик лазера может породить луч из точки рядом с первой целью
      for (const e of hit) if (e.active) { this.tryPhantomLaser(l, e); break; }
    }
  }

  /** Фантомный лазер: луч из точки рядом с врагом, тем же уроном и эффектами; шанс падает вдвое с поколением, ограничен phantom.maxChain. */
  tryPhantomLaser(l, e) {
    const F = this.config.phantom;
    const ls = this.lasers;
    if (ls.length >= this.config.laser.max) return;
    if (!phantomRoll(F, this.rnd, l.phantom, l.gen | 0)) return;
    const s = this.phSpot;
    if (!phantomSpot(this.arena, this.rnd, F, e, l.width * 0.3, s)) return;
    ls.push({
      x: s.x, y: s.y, dx: (e.x - s.x) / s.d, dy: (e.y - s.y) / s.d, len: s.d,
      target: e, pierce: 0, fixed: true,
      width: l.width, age: 0, life: l.life, interval: l.interval, ticks: l.ticks, done: 0, tick: l.tick * F.damageFrac, big: l.big,
      burnDmg: l.burnDmg, burnInt: l.burnInt, frost: l.frost, steam: l.steam, pulse: 0,
      zap: l.zap,
      gen: (l.gen | 0) + 1, phantom: l.phantom,
    });
    this.burst(s.x, s.y, 0.3, 4, 16, F.color);
  }

  /**
   * Кинетический рывок: когда герой остановился после рывка, враги рядом отлетают от него.
   * С Горением на рывке отброшенные враги поджигаются (и остаётся огненный шлейф), с Морозом замедляются.
   */
  updateKinetic(dt) {
    const h = this.hero;
    if (!this.defense.kinetic) { this.kPending = false; return; }
    if (h.dashing) this.kPending = true;
    if (this.kPending && !h.dashing && h.glideTime <= 0) {
      this.kPending = false;
      this.kineticPush();
    }
  }

  kineticPush() {
    const K = this.config.kinetic;
    const m = this.kineticMods;
    const h = this.hero;
    const en = this.enemies.items;
    const grid = this.swarm.grid;
    const n = grid.query(h.x, h.y, K.pushRadius + 40);
    const buf = grid.buf;
    const bd = m && m.burn ? K.burnDamage * m.burn.damage : 0;
    const bi = m && m.burn ? this.config.burn.interval / m.burn.rate : 0;
    for (let k = 0; k < n; k++) {
      const e = en[buf[k]];
      if (!e || !e.active) continue;
      const dx = e.x - h.x;
      const dy = e.y - h.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > K.pushRadius + e.radius) continue;
      const fall = 1 - 0.5 * Math.min(1, d / (K.pushRadius + e.radius)); // ближние отлетают дальше
      applyKnockback(e, dx / d, dy / d, K.pushDistance * fall, K.pushTime);
      if (bd > 0) this.ignite(e, bd, bi);
      if (m && m.frost) this.chill(e, bd > 0 && m.steam ? m.steam.damage : 0, bd, bi);
    }
    this.burst(h.x, h.y, 0.35, h.radius, K.pushRadius, K.color);
    this.burst(h.x, h.y, 0.2, h.radius * 0.6, K.pushRadius * 0.6, '#ffffff');
  }

  /** Костры шлейфа (только с Горением на рывке): пока идёт огненный рывок, через trailStep оставляем костёр; костры горят fireLife с и поджигают врагов внутри. */
  updateFires(dt) {
    const F = this.config.kinetic;
    const h = this.hero;
    const fires = this.fires;
    const km = this.kineticMods;
    if (this.defense.kinetic && km && km.burn && h.active && (h.dashing || h.glideTime > 0)) { // шлейф только с Горением
      const last = this.fireLast || (this.fireLast = { x: h.x, y: h.y });
      const dx = h.x - last.x;
      const dy = h.y - last.y;
      const d = Math.hypot(dx, dy);
      if (d >= F.trailStep) {
        const n = Math.floor(d / F.trailStep);
        for (let k = 1; k <= n && fires.length < F.maxFires; k++) {
          fires.push({ x: last.x + (dx / d) * F.trailStep * k, y: last.y + (dy / d) * F.trailStep * k, age: 0, tick: 0, bd: F.burnDamage * km.burn.damage, bi: this.config.burn.interval / km.burn.rate });
        }
        last.x += (dx / d) * F.trailStep * n;
        last.y += (dy / d) * F.trailStep * n;
      }
    } else this.fireLast = null;
    if (!fires.length) return;
    const en = this.enemies.items;
    const grid = this.swarm.grid;
    for (let i = fires.length - 1; i >= 0; i--) {
      const f = fires[i];
      f.age += dt;
      if (f.age >= F.fireLife) { fires.splice(i, 1); continue; }
      f.tick -= dt;
      if (f.tick > 0) continue;
      f.tick = F.fireTick;
      const n = grid.query(f.x, f.y, F.fireRadius + 40);
      const buf = grid.buf;
      for (let k = 0; k < n; k++) {
        const e = en[buf[k]];
        if (!e || !e.active) continue;
        const dx = e.x - f.x;
        const dy = e.y - f.y;
        const r = F.fireRadius + e.radius;
        if (dx * dx + dy * dy <= r * r) this.ignite(e, f.bd, f.bi);
      }
    }
  }

  updateSteam(dt) {
    const st = this.config.steam;
    const cl = this.steamClouds;
    for (let i = cl.length - 1; i >= 0; i--) {
      const c = cl[i];
      c.age += dt;
      if (c.age >= st.duration) { cl.splice(i, 1); continue; }
      c.tick -= dt;
      if (c.tick <= 0) { c.tick = st.tick; this.applySteam(c); }
    }
  }

  /** Таяние: заморозка кончается (заряды сброшены), заряды тают, если давно не попадали. */
  updateFrost(dt) {
    const en = this.enemies.items;
    for (let i = 0; i < en.length; i++) {
      const e = en[i];
      if (!e.active) continue;
      if (e.freezeT > 0) {
        e.freezeT -= dt;
        if (e.freezeT <= 0) { e.freezeT = 0; e.frostStacks = 0; e.speedMul = 1; }
      } else if (e.frostStacks > 0) {
        e.frostT -= dt;
        if (e.frostT <= 0) { e.frostStacks = 0; e.speedMul = 1; }
      }
    }
  }

  /** Тики горения: урон раз в burnInt, пока горит. Без откидывания; источник помечен, чтобы вспышка была огненной. */
  updateBurning(dt) {
    const en = this.enemies.items;
    for (let i = 0; i < en.length; i++) {
      const e = en[i];
      if (!e.active || e.burnT <= 0) continue;
      e.burnT -= dt;
      e.burnTick -= dt;
      while (e.burnTick <= 0 && e.active) {
        this.combat.damageEnemy(e, e.burnDmg, this.burnSource, null);
        e.burnTick += e.burnInt;
      }
      if (e.burnT <= 0) e.burnT = 0;
    }
  }

  onShotHitEnemy(p, e) {
    if (p.hits.length && p.hits.includes(e)) return; // этого уже пробили
    const speed = Math.hypot(p.vx, p.vy) || 1;
    // Откидывание: по направлению полёта снаряда, силу берём из самого снаряда.
    this.combat.damageEnemy(e, p.damage, p, { knockback: p.knockback, dirX: p.vx / speed, dirY: p.vy / speed });
    if (p.burnDmg > 0 && e.active) this.ignite(e, p.burnDmg, p.burnInt);
    if (p.frost && e.active) this.chill(e, p.burnDmg > 0 ? p.steam : 0, p.burnDmg, p.burnInt);
    if (p.zap && e.active) this.zap(e);
    if (p.phantom > 0) this.tryPhantom(p, e);
    if (p.pierce > 0) {
      p.pierce--;
      p.hits.push(e); // летит дальше
    } else {
      p.active = false; // снаряд потрачен
    }
  }

  /**
   * Фантомный выстрел: с шансом (падает вдвое с каждым поколением) из точки рядом с врагом вылетает копия снаряда.
   * Копия несёт те же эффекты (огонь, мороз, пробитие) и сама может породить следующую, не дальше phantom.maxChain.
   */
  tryPhantom(p, e) {
    const F = this.config.phantom;
    if (!phantomRoll(F, this.rnd, p.phantom, p.gen)) return;
    const lim = this.config.limits;
    if (lim && this.heroShots.count >= lim.maxShots) return;
    const sp0 = this.phSpot;
    if (!phantomSpot(this.arena, this.rnd, F, e, p.radius, sp0)) return;
    const { x, y, d } = sp0;
    {
      const q = this.heroShots.spawn();
      if (!q) return;
      q.x = q.prevX = x;
      q.y = q.prevY = y;
      const sp = p.speed || 1;
      q.vx = ((e.x - x) / d) * sp;
      q.vy = ((e.y - y) / d) * sp;
      q.radius = p.radius;
      q.damage = p.damage * F.damageFrac;
      q.speed = p.speed;
      q.range = Math.max(p.range, d + 60);
      q.knockback = p.knockback;
      q.parryable = false;
      q.burnDmg = p.burnDmg;
      q.burnInt = p.burnInt;
      q.frost = p.frost;
      q.steam = p.steam;
      q.pierce = p.pierce;
      q.hits.length = 0;
      q.travelled = 0;
      q.color = F.color;
      q.owner = p.owner;
      q.gen = p.gen + 1;
      q.glow = p.glow;
      q.phantom = p.phantom;
      q.zap = p.zap;
      this.burst(x, y, 0.3, 4, 16, F.color);
      return;
    }
  }

  onEnemyShotHitHero(p) {
    this.combat.damageHero(p.damage, p);
    p.active = false; // снаряд потрачен: попал, заблокирован или спарирован (герой в неуязвимости тоже гасит его)
  }

  onEnemyTouchHero(e) {
    if (e.freezeT > 0) return; // замороженный враг не бьёт
    if (e.atk.state === 'strike') return; // рывок бьёт сам, касание поверх не считаем (иначе урон дважды)
    if (e.touchTimer > 0) return;
    // Если герой неуязвим, пауза не запускается: враг ударит сразу, как только можно.
    if (this.combat.damageHero(e.def.touchDamage, e)) e.touchTimer = e.def.touchCooldown;
  }

  /** Окно награды: показывает 3 предложения из мешка (и обмен на опыт). */
  openLevelUp() {
    const R = this.config.rewards;
    this.state = 'levelup';
    this.stick.cancel();
    this.levelUpOffers = this.rewards.draw(R.choices).map((o) => ({ ...o, def: this.config.mods[o.key] })).filter((o) => o.def);
    const need = Math.round(this.xp.need * R.exchangeFrac);
    this.levelUpScreen.show(this.xp.level, this.levelUpOffers, 'Обменять на ' + Math.round(R.exchangeFrac * 100) + '% опыта' + (need ? ' (+' + need + ')' : ''));
  }

  closeLevelUp() {
    this.pendingLevels = Math.max(0, this.pendingLevels - 1);
    this.state = 'playing';
    this.stepper.reset(); // время выбора не «догоняем»
    this.meter.interrupt();
    this.stick.cancel();
  }

  /** Зажали карточку награды: поверх окна открывается меню Билда с подсвеченными местами для этого мода. */
  previewReward(offer) {
    this.pauseUI.showPreview(offer.def, () => this.pickReward(offer), () => {});
  }

  pickReward(offer) {
    this.rewards.take(offer.token);
    let index = this.inventory.add({ key: offer.key, def: offer.def });
    if (index < 0) { this.inventory.addAlways({ key: offer.key, def: offer.def }); index = this.inventory.slots.length - 1; }
    this.pauseUI.rebuild();
    this.closeLevelUp();
    // Сразу меню Билда: новый мод выбран в хранилище, места для него подсвечены. «Продолжить» возвращает в бой.
    this.pause();
    this.pauseUI.builder.select({ kind: 'shelf', index });
    this.pauseUI.builder.fresh = index;
    this.pauseUI.builder.refresh();
  }

  exchangeReward() {
    this.closeLevelUp();
    this.xp.add(this.xp.need * this.config.rewards.exchangeFrac, true);
  }

  update(dt) {
    if (this.state === 'paused' || this.state === 'menu' || this.state === 'levelup') return;
    if (this.pendingLevels > 0 && this.state === 'playing' && this.hero.active) { this.openLevelUp(); return; } // пауза и меню: мир стоит, отрисовка продолжается
    if (this.state === 'cutscene') { // вступление босса: мир замер, двигается только камера и надпись
      this.updateCine(dt);
      return;
    }
    if (this.state === 'playing' && this.hitStop > 0) {
      // Остановка времени при парировании: мир замер, но искры летят.
      this.hitStop -= dt;
      const fx0 = this.effects.items;
      for (let i = 0; i < fx0.length; i++) if (fx0[i].active) updateEffect(fx0[i], dt);
      this.effects.sweep();
      return;
    }
    if (this.state === 'playing') {
      this.runTime += dt;
      const kid = this.build.secondaryId('kinetic'); // вторичное ядро рывка (если стоит): его моды считаются как у обычного ядра
      this.defense.kinetic = !!kid;
      this.kineticMods = kid ? this.build.modifiersFor(kid) : null;
      this.defense.lightDash = !!(this.kineticMods && this.kineticMods.lightning); // Молния на рывке: рикошеты по врагам
      this.defense.update(dt);
      this.hero.update(dt, this.stick.x, this.stick.y, this.arena);
      this.lightdash.update(dt);
      this.updateKinetic(dt);
      this.updateFires(dt);
      this.camera.zoomTarget = Math.max(this.boss.cameraZoom(), this.arena.zone ? this.config.waves.finale.zoom : 1); // клинки и финальный бой отдаляют экран
      this.camera.update(dt, this.hero.x, this.hero.y, this.arena);
      this.nav.update(this.hero.x, this.hero.y); // пересчитается, только если герой сменил клетку

      const en = this.enemies.items;
      this.swarm.rebuild(en);      // сетка по положениям с прошлого шага
      this.autoattack.update(dt);  // цель ищется через сетку
      this.swarm.steer(en);        // стая: куда тянет жуков
      this.attacks.update(dt, en); // замахи, рывки и восстановление врагов с атакой
      this.boss.update(dt);        // цикл атак босса: до движения врагов, чтобы он замер на время атаки
      this.apostles.update(dt);    // финальный босс: призыв апостолов, их очерёдность умений
      this.apotheosis.update(dt);  // голова-солнце, умение «Руки», очерёдность умений босса
      for (let i = 0; i < en.length; i++) if (en[i].active) updateEnemy(en[i], dt, this.hero, this.arena, this.nav);
      this.shooters.update(dt, en);
      this.rockBeetles.update(dt, en); // замах и удар Горных жуков, полёт мошек
      this.swarm.separate(en, this.hero, this.arena); // жуки вплотную, но не друг в друге
      this.moveShots(this.heroShots.items, dt);
      this.moveShots(this.enemyShots.items, dt);
      this.rockBeetles.hitByShots(this.heroShots.items); // снаряды героя сбивают мошек

      this.xp.update(dt);
      this.collisions.detect();
      this.hitEnemiesWithShots();
      this.pellets.update(dt);
      this.updateBurning(dt);
      this.updateFrost(dt);
      this.updateShock(dt);
      this.updateSteam(dt);
      this.updateLasers(dt);
      this.blades.update(dt);
      this.aura.update(dt);
      this.hitShotsOnBlock();
      this.spawner.update(dt);
      this.syncWaveHud();
      this.watchCrash(dt);
    } else {
      // Герой погиб: мир замирает, доигрываются только вспышки, потом экран перезапуска.
      this.deadTimer += dt;
      if (!this.deathScreen.visible && this.deadTimer >= this.config.hero.deathDelay) {
        const sec = Math.floor(this.runTime);
        const mm = Math.floor(sec / 60);
        const ss = String(sec % 60).padStart(2, '0');
        this.deathScreen.show('Убито: ' + this.kills + '\nУровень: ' + this.xp.level + '\nПродержался: ' + mm + ':' + ss);
      }
    }

    const fx = this.effects.items;
    for (let i = 0; i < fx.length; i++) if (fx[i].active) updateEffect(fx[i], dt);

    // Убранных в этом шаге возвращаем в пулы.
    this.enemies.sweep();
    this.heroShots.sweep();
    this.enemyShots.sweep();
    this.rockBeetles.sweep();
    this.effects.sweep();
    this.gems.sweep();
  }

  /** Вступление босса: игра замирает, камера плывёт к боссу. Дальше всё ведёт updateCine. */
  startBossIntro(boss) {
    if (this.state !== 'playing') return;
    if (boss.def.flies && this.config.waves.finale) { this.startFinale(boss); return; } // финальный босс: свой ролик
    this.state = 'cutscene';
    this.stick.cancel();
    this.cine = { t: 0, fromX: this.camera.x, fromY: this.camera.y, boss };
    this.hud.bossTitle = boss.def.title || boss.def.name || '';
    this.hud.bossTitleAlpha = 0;
  }

  /**
   * Время вступления: камера плывёт к боссу (panTime) → имя проявляется (titleIn), висит (titleHold),
   * гаснет (titleOut) → камера возвращается на героя (returnTime) → игра продолжается. Времена в config.waves.boss.intro.
   */
  updateCine(dt) {
    const c = this.cine;
    if (!c) { this.state = 'playing'; return; }
    if (c.finale) { this.updateFinale(dt); return; }
    const I = this.config.waves.boss.intro;
    const cam = this.camera;
    c.t += dt;
    const tPan = I.panTime;
    const tIn = tPan + I.titleIn;
    const tHold = tIn + I.titleHold;
    const tOut = tHold + I.titleOut;
    const tEnd = tOut + I.returnTime;
    const ease = (k) => { k = k < 0 ? 0 : k > 1 ? 1 : k; return k * k * (3 - 2 * k); }; // плавный старт и остановка

    cam.refresh();
    cam.prevX = cam.x;
    cam.prevY = cam.y;
    const boss = c.boss;
    if (c.t < tPan) {
      const k = ease(c.t / Math.max(0.001, tPan));
      cam.x = c.fromX + (boss.x - c.fromX) * k;
      cam.y = c.fromY + (boss.y - c.fromY) * k;
    } else if (c.t < tOut) {
      cam.x = boss.x;
      cam.y = boss.y;
    } else {
      const k = ease((c.t - tOut) / Math.max(0.001, I.returnTime));
      cam.x = boss.x + (this.hero.x - boss.x) * k;
      cam.y = boss.y + (this.hero.y - boss.y) * k;
    }
    if (this.config.camera.clampToArena) cam.clampTo(this.arena);

    // Надпись: проявляется, висит, гаснет.
    let a = 0;
    if (c.t >= tPan && c.t < tIn) a = (c.t - tPan) / Math.max(0.001, I.titleIn);
    else if (c.t >= tIn && c.t < tHold) a = 1;
    else if (c.t >= tHold && c.t < tOut) a = 1 - (c.t - tHold) / Math.max(0.001, I.titleOut);
    this.hud.bossTitleAlpha = a;

    if (c.t >= tEnd) this.endBossIntro();
  }

  /**
   * Вступление финального босса: камера отдаляется (zoomTime) → остаток карты рушится (collapseTime), остаётся остров
   * вокруг героя → имя босса (titleIn/Hold/Out) → бой с отдалённой камерой. Босс стоит в разрушенной зоне.
   * Времена и размеры: config.waves.finale. Разрушение рисует renderer по arena.collapse (ЗАГЛУШКА ГРАФИКИ).
   */
  startFinale(boss) {
    const F = this.config.waves.finale;
    const A = this.arena;
    this.state = 'cutscene';
    this.stick.cancel();
    // Остров: многоугольник под центром карты, верхняя сторона плоская, остальные ломаные. Босс всегда сверху.
    const zone = A.buildIsland(F, this.rnd);
    boss.x = (zone.left + zone.right) / 2;
    boss.y = zone.top - F.bossGap;
    boss.prevX = boss.x;
    boss.prevY = boss.y;
    this.cine = { finale: true, t: 0, zone, boss, rocksGone: false, dust: 0 };
    this.hud.bossTitle = boss.def.title || boss.def.name || '';
    this.hud.bossTitleAlpha = 0;
    this.camera.zoomTarget = F.zoom;
  }

  updateFinale(dt) {
    const c = this.cine;
    const F = this.config.waves.finale;
    const A = this.arena;
    const cam = this.camera;
    c.t += dt;
    const tZoom = F.zoomTime;
    const tCol = tZoom + F.collapseTime;
    const tIn = tCol + F.titleIn;
    const tHold = tIn + F.titleHold;
    const tOut = tHold + F.titleOut;
    const tEnd = tOut + F.endHold;

    // Разрушение: прогресс для отрисовки; в начале решаем, что остаётся (остров), скалы вне него исчезают.
    if (c.t >= tZoom && !c.rocksGone) {
      c.rocksGone = true;
      A.setZone(c.zone);
      this.nav.buildBlocked();
    }
    A.collapse = c.t < tZoom ? 0 : Math.min(1, (c.t - tZoom) / Math.max(0.001, F.collapseTime));
    // Пыль и осколки вдоль падающей кромки (ЗАГЛУШКА вспышек).
    if (c.t >= tZoom && c.t < tCol) {
      c.dust -= dt;
      if (c.dust <= 0) {
        c.dust = 0.07;
        const z = c.zone;
        const x = A.left + this.rnd() * A.width;
        const y = A.top + this.rnd() * A.height;
        if (x < z.left || x > z.right || y < z.top || y > z.bottom) this.burst(x, y, 0.5, 10, 40, this.config.render.colors.stoneLight);
      }
    }
    // Остров держит героя: если стоял у края арены, его вдвигает внутрь.
    if (c.rocksGone) A.resolveCircle(this.hero);

    // Камера: отдаляется и смотрит на середину между островом и боссом.
    const zc = c.zone;
    cam.zoomTarget = F.zoom;
    cam.update(dt, (zc.left + zc.right) / 2 * 0.5 + c.boss.x * 0.5, (zc.top + zc.bottom) / 2 * 0.5 + c.boss.y * 0.5, A);

    let a = 0;
    if (c.t >= tCol && c.t < tIn) a = (c.t - tCol) / Math.max(0.001, F.titleIn);
    else if (c.t >= tIn && c.t < tHold) a = 1;
    else if (c.t >= tHold && c.t < tOut) a = 1 - (c.t - tHold) / Math.max(0.001, F.titleOut);
    this.hud.bossTitleAlpha = a;
    if (c.t >= tEnd) this.endBossIntro();
  }

  endBossIntro() {
    this.cine = null;
    this.hud.bossTitle = '';
    this.hud.bossTitleAlpha = 0;
    this.camera.snapTo(this.hero.x, this.hero.y, this.arena);
    this.stepper.reset(); // время вступления не «догоняем»
    this.meter.interrupt();
    this.state = 'playing';
    this.bus.emit('boss:intro-finished', {});
  }

  /** Двигает снаряды; те, что упёрлись в скалу, гаснут искрой. */
  moveShots(list, dt) {
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (!p.active) continue;
      if (updateProjectile(p, dt, this.arena) === 'rock') this.burst(p.x, p.y, 0.15, 2, 9, p.color);
    }
  }

  /** Пока включён блок, снаряды врагов встречают сферу, а не тело героя: парируем у самой сферы. */
  hitShotsOnBlock() {
    if (!this.defense.blocking || !this.hero.active) return;
    const R = this.defense.blockRadius;
    const list = this.enemyShots.items;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (!p.active) continue;
      const dx = p.x - this.hero.x;
      const dy = p.y - this.hero.y;
      const lim = R + p.radius;
      if (dx * dx + dy * dy <= lim * lim) this.onEnemyShotHitHero(p);
    }
  }

  /** Копирует состояние волн в HUD (его рисует renderer) и считает живых врагов. */
  syncWaveHud() {
    const sp = this.spawner;
    const hud = this.hud;
    hud.wave = sp.wave;
    hud.crash = sp.crash;
    hud.intermission = sp.phase === 'intermission' ? Math.max(0, sp.timer) : 0;
    hud.intermissionTotal = this.config.waves.intermission;
    hud.alive = sp.alive;
    hud.cap = sp.phase === 'active' ? sp.cap() : 0;
    hud.level = this.xp.level;
    hud.xpFraction = this.xp.fraction;
    hud.xpMax = this.xp.need === 0;
    hud.levelFlash = this.xp.levelFlash;
    hud.waveLeft = sp.crash ? -1 : Math.max(0, sp.waveCount() - sp.spawned) + sp.alive;
  }

  waveLabel() {
    const sp = this.spawner;
    return sp.crash ? sp.wave + ' (краш-тест)' : String(sp.wave);
  }

  crashText() {
    const r = this.crashResult;
    return 'просадка FPS до ' + Math.round(r.fps) + ' на ' + r.enemies + ' врагах (волна ' + r.wave + ', ' + r.time.toFixed(0) + ' с)';
  }

  /** Краш-тест: запоминает, на каком числе врагов FPS впервые просел ниже порога и продержался так. */
  watchCrash(dt) {
    if (!this.spawner.crash || this.spawner.phase !== 'active') {
      this.sagTimer = 0;
      return;
    }
    const c = this.config.waves.crash;
    const fps = this.meter.fps;
    const measuring = fps > 0 && isFinite(this.meter.minFps); // идёт после прогрева замера
    if (measuring && fps < c.fpsThreshold) {
      if (this.sagTimer === 0) this.sagCount = this.spawner.alive;
      this.sagTimer += dt;
      if (this.sagTimer >= c.fpsHold && !this.crashResult) {
        this.crashResult = { enemies: this.sagCount, fps, wave: this.spawner.wave, time: this.spawner.crashTime };
        this.hud.crashResult = this.crashText();
        this.bus.emit('crash:fps-drop', this.crashResult);
        try {
          if (this.storage) this.storage.setItem('proto.crash.v1', JSON.stringify(this.crashResult));
        } catch (err) { /* память телефона недоступна: результат останется на экране */ }
      }
    } else {
      this.sagTimer = 0;
    }
  }

  /**
   * Отладка: сразу к бою с боссом без зачистки волны. which: 'mid' (Тартас, waves.boss) или 'final' (Апофеоз, waves.finalBoss).
   * Всё, что было на поле (враги, снаряды, отряд, апостолы, мошки, разрушение карты), убирается; герой остаётся как есть.
   */
  skipToBoss(which) {
    if (this.state !== 'playing') return;
    const W = this.config.waves;
    const B = which === 'final' ? W.finalBoss : W.boss;
    const def = B && this.config.enemies[B.enemy];
    if (!def) return;
    this.enemies.clear();
    this.heroShots.clear();
    this.enemyShots.clear();
    this.pellets.clear();
    this.boss.reset();
    this.apostles.reset();
    this.apotheosis.reset();
    this.rockBeetles.reset(); // мошки исчезают, скалы и вся карта возвращаются
    this.camera.resetZoom();
    this.cine = null;
    this.spawner.wave = B.wave;
    this.crashResult = null;
    this.hud.crashResult = '';
    if (which === 'final' && W.finale && W.finale.portal) this.spawner.openPortal(); // финал начинается с портала
    else this.spawner.spawnBoss(def); // фаза 'boss' и событие boss:spawned (вступление)
    this.syncWaveHud();
  }

  jumpToWave(n) {
    this.spawner.jumpToWave(n);
    this.crashResult = null;
    this.hud.crashResult = '';
    this.sagTimer = 0;
    this.syncWaveHud();
  }

  /** Расставить ядра по полю билда случайно (внутри, не на краях). */
  layoutBuild() {
    const c = this.config;
    if (this.build.size !== Math.round(c.build.size)) this.build.resize(c.build.size);
    this.inventory.resize(c.build.storageSlots);
    this.inventory.fill(c.mods, this.mode === 'game' ? [] : c.build.startMods); // в «Игре» инвентарь пуст: моды выдают награды за уровень
    layoutCores(this.build, c.cores, this.rnd, c.build.minCoreDistance);
  }

  relayoutBuild() {
    this.layoutBuild();
    this.pauseUI.rebuild();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.stick.cancel();
    this.pauseUI.setPaused(true);
    this.bus.emit('game:paused', {});
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.stepper.reset(); // время паузы не «догоняем»
    this.meter.interrupt(); // и простой не считаем просадкой FPS
    this.pauseUI.setPaused(false);
    this.bus.emit('game:resumed', {});
  }

  togglePause() {
    if (this.state === 'paused') this.resume();
    else this.pause();
  }

  /** Новый забег (после смерти или с экрана паузы). Конфиг и подобранные ползунки не трогаем. */
  restart() {
    if (this.state !== 'dead' && this.state !== 'paused' && this.state !== 'menu') return;
    this.stick.cancel();
    this.relayoutBuild(); // новый забег: ядра встают в новые места
    this.pauseUI.setPaused(false);
    this.nav.source = -1;
    this.stepper.reset();
    this.enemies.clear();
    this.heroShots.clear();
    this.pellets.clear();
    this.enemyShots.clear();
    this.rockBeetles.reset(); // мошки исчезают, скалы возвращаются
    this.effects.clear();
    this.steamClouds.length = 0;
    this.fires.length = 0;
    this.kPending = false;
    this.kineticMods = null;
    this.lightdash.reset();
    this.zapBolts.length = 0;
    this.rewards.reset();
    this.pendingLevels = 0;
    this.levelUpScreen.hide();
    this.fireLast = null;
    this.lasers.length = 0;
    this.gems.clear();
    this.xp.reset();
    this.hero.reset();
    this.defense.reset();
    this.blades.reset();
    this.swipe.reset();
    this.hitStop = 0;
    this.boss.reset();
    this.apostles.reset();
    this.apotheosis.reset();
    this.cine = null;
    this.hud.bossTitle = '';
    this.hud.bossTitleAlpha = 0;
    this.camera.resetZoom();
    this.camera.snapTo(this.hero.x, this.hero.y, this.arena);
    this.autoattack.reset();
    this.spawner.reset();
    this.crashResult = null;
    this.hud.crashResult = '';
    this.sagTimer = 0;
    this.kills = 0;
    this.hud.kills = 0;
    this.runTime = 0;
    this.deadTimer = 0;
    this.state = 'playing';
    this.deathScreen.hide();
    this.syncWaveHud(); // HUD сразу показывает новый забег, не дожидаясь шага
    this.bus.emit('run:restarted', {});
  }

  onResize() {
    this.renderer.resize();
    this.insets = readSafeInsets(this.probe);
    this.hud.insets = this.insets;
  }

  /**
   * Выбор режима. «game»: настоящий игрок, стартовые значения без ползунков, без панели и краш-теста.
   * «test»: панель и ползунки, как раньше (сохранённые ползунки возвращаются). Начинается новый забег.
   */
  startMode(mode) {
    const cfg = this.config;
    if (mode === 'game' && this.mode !== 'game') {
      this.testValues = {};
      for (const t of this.o.tunables) this.testValues[t.path] = getPath(cfg, t.path);
      this.testValues['waves.crash.startWave'] = cfg.waves.crash.startWave;
      this.applyValues(this.o.defaults, (path) => path !== 'waves.startWave');
      cfg.waves.crash.startWave = 1e9; // краш-теста в настоящей игре нет
    } else if (mode === 'test' && this.mode === 'game' && this.testValues) {
      this.applyValues(this.testValues);
      cfg.waves.crash.startWave = this.testValues['waves.crash.startWave'];
    }
    this.mode = mode;
    this.hud.gameMode = mode === 'game';
    this.panel.setAvailable(mode === 'test');
    this.pauseUI.setTestTools(mode === 'test');
    this.modeScreen.hide();
    this.restart();
  }

  /** Записать значения ползунков в конфиг; src: объект конфига или { путь: значение }. */
  applyValues(src, filter) {
    for (const t of this.o.tunables) {
      const v = Object.prototype.hasOwnProperty.call(src, t.path) ? src[t.path] : getPath(src, t.path);
      if (v === undefined || getPath(this.config, t.path) === v) continue;
      setPath(this.config, t.path, v);
      if (!filter || filter(t.path)) this.bus.emit('config:changed', { path: t.path, value: v });
    }
  }

  /** Из паузы на экран выбора режима. */
  exitToMenu() {
    if (this.state !== 'paused') return;
    this.stick.cancel();
    this.pauseUI.setPaused(false);
    this.state = 'menu';
    this.panel.setAvailable(false);
    this.modeScreen.show();
  }

  start() {
    if (this.o.menu) {
      this.state = 'menu';
      this.panel.setAvailable(false);
      this.modeScreen.show();
    }
    this.renderer.resize();
    this.camera.snapTo(this.hero.x, this.hero.y, this.arena);
    this.loop.start();
  }
}
