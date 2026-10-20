// Появление врагов: за краем экрана. На этапе 3 здесь вырастут волны по таблице из конфига.
import { initEnemy } from './world_enemy.js';

const TAU = Math.PI * 2;

/**
 * Точка за пределами видимой области камеры, но внутри арены. Пишет результат в out, возвращает false,
 * если подходящего места не нашлось (например, арена целиком помещается на экране).
 */
export function pickSpawnPoint(rnd, cam, arena, margin, out) {
  const edge = 20; // отступ от стены арены
  // 1) Кольцо вокруг камеры: радиус больше половины диагонали экрана, значит точка точно вне кадра.
  const R = Math.hypot(cam.viewW, cam.viewH) / 2 + margin;
  for (let i = 0; i < 16; i++) {
    const a = rnd() * TAU;
    const x = cam.x + Math.cos(a) * R;
    const y = cam.y + Math.sin(a) * R;
    if (x > arena.left + edge && x < arena.right - edge && y > arena.top + edge && y < arena.bottom - edge) {
      out.x = x;
      out.y = y;
      return true;
    }
  }
  // 2) Запасной путь: любая точка арены вне прямоугольника экрана.
  for (let i = 0; i < 16; i++) {
    const x = arena.left + edge + rnd() * (arena.width - 2 * edge);
    const y = arena.top + edge + rnd() * (arena.height - 2 * edge);
    if (Math.abs(x - cam.x) > cam.viewW / 2 + margin || Math.abs(y - cam.y) > cam.viewH / 2 + margin) {
      out.x = x;
      out.y = y;
      return true;
    }
  }
  return false;
}

export class Spawner {
  /** o: { config, enemies (EntityPool), camera, arena, rnd } */
  constructor(o) {
    this.cfg = o.config;
    this.enemies = o.enemies;
    this.camera = o.camera;
    this.arena = o.arena;
    this.rnd = o.rnd;
    this.pt = { x: 0, y: 0 };
    this.timer = this.cfg.spawn.firstDelay;
  }

  reset() {
    this.timer = this.cfg.spawn.firstDelay;
  }

  update(dt) {
    this.timer -= dt;
    if (this.timer > 0) return;
    const sp = this.cfg.spawn;
    if (this.enemies.count < sp.maxAlive && pickSpawnPoint(this.rnd, this.camera, this.arena, sp.margin, this.pt)) {
      const e = this.enemies.spawn();
      initEnemy(e, this.cfg.enemies[sp.enemy], this.pt.x, this.pt.y);
      this.arena.resolveCircle(e); // не внутри скалы
      e.prevX = e.x;
      e.prevY = e.y;
    }
    this.timer += sp.interval;
    if (this.timer < 0) this.timer = 0;
  }
}
