// Сборка игры: создаёт части и связывает их. Логики здесь почти нет.
import { EventBus } from './core/events.js';
import { FixedStepper, FpsMeter, GameLoop } from './core/loop.js';
import { Stick } from './input/stick.js';
import { Arena } from './world/arena.js';
import { Hero } from './world/hero.js';
import { Camera } from './world/camera.js';
import { Renderer } from './render/renderer.js';
import { DebugPanel } from './debug/panel.js';
import { readSafeInsets } from './platform/viewport.js';

export class Game {
  /** o: { canvas, uiRoot, probe, config, defaults, tunables, build, storage, storageKey } */
  constructor(o) {
    const config = o.config;
    this.config = config;
    this.canvas = o.canvas;
    this.probe = o.probe;

    this.bus = new EventBus();
    this.arena = new Arena(config.arena);
    this.hero = new Hero(config.hero);
    this.camera = new Camera(config.camera);
    this.stick = new Stick(o.canvas, this.bus, config.stick);
    this.renderer = new Renderer(o.canvas, config, {
      arena: this.arena,
      hero: this.hero,
      camera: this.camera,
      stick: this.stick,
    });
    this.stepper = new FixedStepper(config.step);
    this.meter = new FpsMeter();
    this.insets = readSafeInsets(o.probe); // пригодится экранным кнопкам (слот умения на этапе 4)

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

    this.bus.on('config:changed', (e) => {
      if (e.path === 'render.maxDpr') this.onResize();
    });
    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('orientationchange', () => this.onResize());
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => this.onResize()).observe(o.canvas);
    // Свернули приложение: палец «потерялся», отпускаем стик.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.stick.cancel();
    });
    window.addEventListener('blur', () => this.stick.cancel());
  }

  /** Герой + скалы. Растёт вместе с игрой: враги и снаряды добавятся на этапах 2–3. */
  objectCount() {
    return 1 + this.arena.objectCount;
  }

  update(dt) {
    this.hero.update(dt, this.stick.x, this.stick.y, this.arena);
    this.camera.update(dt, this.hero.x, this.hero.y, this.arena);
  }

  onResize() {
    this.renderer.resize();
    this.insets = readSafeInsets(this.probe);
  }

  start() {
    this.renderer.resize();
    this.camera.snapTo(this.hero.x, this.hero.y, this.arena);
    this.loop.start();
  }
}
