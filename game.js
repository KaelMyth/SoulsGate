// Сборка игры: создаёт части и связывает их. Правила боя лежат в systems/, здесь только проводка.
import { EventBus } from './core_events.js';
import { FixedStepper, FpsMeter, GameLoop } from './core_loop.js';
import { EntityPool } from './core_entity-pool.js';
import { CollisionWorld, Layer } from './core_collision.js';
import { Stick } from './input_stick.js';
import { Arena } from './world_arena.js';
import { Hero } from './world_hero.js';
import { Camera } from './world_camera.js';
import { NavGrid } from './world_nav.js';
import { createEnemy, resetEnemy, updateEnemy } from './world_enemy.js';
import { createProjectile, resetProjectile, updateProjectile } from './world_projectile.js';
import { createEffect, resetEffect, initEffect, updateEffect } from './world_effects.js';
import { Combat } from './systems_combat.js';
import { AutoAttack } from './systems_autoattack.js';
import { Spawner } from './systems_spawner.js';
import { Swarm } from './systems_swarm.js';
import { HeroDefense } from './systems_defense.js';
import { Shooters } from './systems_shooters.js';
import { Attacks } from './systems_attacks.js';
import { Xp, createGem, resetGem } from './systems_xp.js';
import { SwipeDetector } from './input_swipe.js';
import { Renderer } from './render_renderer.js';
import { DebugPanel } from './debug_panel.js';
import { DeathScreen } from './ui_death-screen.js';
import { PauseUI } from './ui_pause.js';
import { BuildGrid } from './build_grid.js';
import { layoutCores } from './build_placement.js';
import { SlotUI } from './ui_slot.js';
import { readSafeInsets } from './platform_viewport.js';

export class Game {
  /** o: { canvas, uiRoot, probe, config, defaults, tunables, build, storage, storageKey, rnd? } */
  constructor(o) {
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
    this.state = 'playing'; // 'playing' | 'paused' | 'dead'
    this.deadTimer = 0;
    this.kills = 0;
    this.runTime = 0;
    this.hud = {
      insets: this.insets, kills: 0,
      wave: 1, intermission: 0, intermissionTotal: 1, crash: false, alive: 0, cap: 0, crashResult: '',
    };
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
    this.defense = new HeroDefense({ config, hero: this.hero, stick: this.stick, bus: this.bus });
    this.swipe = new SwipeDetector(this.bus, config.dash, (dx, dy) => {
      if (this.state === 'playing') this.defense.tryDash(dx, dy);
    });
    this.xp = new Xp({ config, hero: this.hero, gems: this.gems, bus: this.bus, rnd: this.rnd });
    this.attacks = new Attacks({ config, hero: this.hero, arena: this.arena, combat: this.combat, bus: this.bus, defense: this.defense });
    this.shooters = new Shooters({ config, hero: this.hero, arena: this.arena, shots: this.enemyShots, bus: this.bus });
    this.swarm = new Swarm(config.swarm, this.arena); // сетка соседей: нужна и стае, и автоатаке
    this.autoattack = new AutoAttack({
      config, hero: this.hero, enemies: this.enemies, shots: this.heroShots, bus: this.bus, arena: this.arena,
      grid: this.swarm.grid,
    });

    this.renderer = new Renderer(o.canvas, config, {
      arena: this.arena,
      hero: this.hero,
      camera: this.camera,
      stick: this.stick,
      enemies: this.enemies,
      heroShots: this.heroShots,
      enemyShots: this.enemyShots,
      effects: this.effects,
      gems: this.gems,
      autoattack: this.autoattack,
      defense: this.defense,
      hud: this.hud,
    });
    this.spawner = new Spawner({
      config, enemies: this.enemies, camera: this.camera, arena: this.arena, rnd: this.rnd, bus: this.bus,
    });

    // Слои столкновений: кто с кем взаимодействует, объявлено здесь, а не размазано по коду.
    this.collisions = new CollisionWorld();
    this.collisions.setLayer(Layer.HERO, this.heroList);
    this.collisions.setLayer(Layer.ENEMY, this.enemies.items);
    this.collisions.setLayer(Layer.HERO_PROJ, this.heroShots.items);
    this.collisions.setLayer(Layer.ENEMY_PROJ, this.enemyShots.items);
    this.collisions.addRule(Layer.HERO_PROJ, Layer.ENEMY, (p, e) => this.onShotHitEnemy(p, e));
    this.collisions.addRule(Layer.ENEMY_PROJ, Layer.HERO, (p) => this.onEnemyShotHitHero(p));
    this.collisions.addRule(Layer.ENEMY, Layer.HERO, (e) => this.onEnemyTouchHero(e));

    this.deathScreen = new DeathScreen(o.uiRoot, () => this.restart());
    this.build = new BuildGrid(config.build.size);
    this.layoutBuild();
    this.pauseUI = new PauseUI(o.uiRoot, {
      onToggle: () => this.togglePause(),
      onResume: () => this.resume(),
      onRestart: () => this.restart(),
    }, this.build, config);

    this.slotPresses = 0;
    this.slot = new SlotUI(o.uiRoot, (n) => {
      this.slotPresses = n;
      this.bus.emit('slot:pressed', { count: n });
    });

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
      if (e.targetKind === 'enemy') this.burst(e.target.x, e.target.y, 0.15, 3, 12, '#ffffff');
      else this.burst(e.target.x, e.target.y, 0.25, e.target.radius, e.target.radius * 2.4, C.hurt);
    });
    // Краш-тест: герой бессмертен, иначе погибнет раньше, чем что-нибудь успеем измерить.
    this.bus.on('hero:hit-incoming', (inc) => {
      if (this.spawner.crash && config.waves.crash.godMode >= 1) inc.cancelled = true;
    });
    // Блок и парирование: вспышки, искры и остановка времени. Сами они считаются в systems/defense.js.
    this.bus.on('hero:blocked', () => {
      this.blocks++;
      this.burst(this.hero.x, this.hero.y, 0.2, this.defense.blockRadius * 0.8, this.defense.blockRadius * 1.25, C.blockEdge);
    });
    this.bus.on('hero:parried', (e) => {
      this.parries++;
      this.hitStop = Math.max(this.hitStop, config.block.hitStop);
      this.burst(this.hero.x, this.hero.y, 0.3, this.defense.blockRadius, this.defense.blockRadius * 1.9, C.parry);
      this.sparks(e.x, e.y, config.block.sparks, C.spark);
    });
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
      if (e.path === 'waves.startWave' && this.state !== 'dead') this.jumpToWave(e.value);
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

  onShotHitEnemy(p, e) {
    const speed = Math.hypot(p.vx, p.vy) || 1;
    // Откидывание: по направлению полёта снаряда, силу берём из самого снаряда.
    this.combat.damageEnemy(e, p.damage, p, { knockback: p.knockback, dirX: p.vx / speed, dirY: p.vy / speed });
    p.active = false; // снаряд потрачен
  }

  onEnemyShotHitHero(p) {
    this.combat.damageHero(p.damage, p);
    p.active = false; // снаряд потрачен: попал, заблокирован или спарирован (герой в неуязвимости тоже гасит его)
  }

  onEnemyTouchHero(e) {
    if (e.atk.state === 'strike') return; // рывок бьёт сам, касание поверх не считаем (иначе урон дважды)
    if (e.touchTimer > 0) return;
    // Если герой неуязвим, пауза не запускается: враг ударит сразу, как только можно.
    if (this.combat.damageHero(e.def.touchDamage, e)) e.touchTimer = e.def.touchCooldown;
  }

  update(dt) {
    if (this.state === 'paused') return; // пауза: мир стоит, отрисовка продолжается
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
      this.defense.update(dt);
      this.hero.update(dt, this.stick.x, this.stick.y, this.arena);
      this.camera.update(dt, this.hero.x, this.hero.y, this.arena);
      this.nav.update(this.hero.x, this.hero.y); // пересчитается, только если герой сменил клетку

      const en = this.enemies.items;
      this.swarm.rebuild(en);      // сетка по положениям с прошлого шага
      this.autoattack.update(dt);  // цель ищется через сетку
      this.swarm.steer(en);        // стая: куда тянет жуков
      this.attacks.update(dt, en); // замахи, рывки и восстановление врагов с атакой
      for (let i = 0; i < en.length; i++) if (en[i].active) updateEnemy(en[i], dt, this.hero, this.arena, this.nav);
      this.shooters.update(dt, en);
      this.swarm.separate(en, this.hero, this.arena); // жуки вплотную, но не друг в друге
      this.moveShots(this.heroShots.items, dt);
      this.moveShots(this.enemyShots.items, dt);

      this.xp.update(dt);
      this.collisions.detect();
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
    this.effects.sweep();
    this.gems.sweep();
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
    if (this.state !== 'dead' && this.state !== 'paused') return;
    this.stick.cancel();
    this.relayoutBuild(); // новый забег: ядра встают в новые места
    this.pauseUI.setPaused(false);
    this.nav.source = -1;
    this.stepper.reset();
    this.enemies.clear();
    this.heroShots.clear();
    this.enemyShots.clear();
    this.effects.clear();
    this.gems.clear();
    this.xp.reset();
    this.hero.reset();
    this.defense.reset();
    this.swipe.reset();
    this.hitStop = 0;
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

  start() {
    this.renderer.resize();
    this.camera.snapTo(this.hero.x, this.hero.y, this.arena);
    this.loop.start();
  }
}
