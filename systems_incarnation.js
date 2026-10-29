import { forCarrier } from './build_scopes.js';
// Воплощение: комета наносит один контактный удар каждому врагу за применение.
// Проверяется весь отрезок движения героя, чтобы на высокой скорости не было проскоков.
export function incarnationSegmentHit(x0, y0, x1, y1, x, y, radius) {
  const dx = x1 - x0, dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 1e-9 ? Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / len2)) : 0;
  const ex = x0 + dx * t - x, ey = y0 + dy * t - y;
  return ex * ex + ey * ey <= radius * radius;
}

export class Incarnation {
  constructor({ config, hero, enemies, combat, arena, igniteMax, chill, zap }) {
    this.config = config;
    this.hero = hero;
    this.enemies = enemies;
    this.combat = combat;
    this.arena = arena || null;
    this.igniteMax = igniteMax;
    this.chill = chill;
    this.zap = zap;
    this.source = { active: true, incarnation: true, el: 0 };
    // В пуле объект врага может использоваться повторно: учитываем его поколение gen.
    this.hitGenerations = new Map();
    this.mods = null;
    this.active = false;
    this.bladeItems = [];
    this.bladeQueue = 0;
    this.bladeTimer = 0;
    this.laserTime = 0;
    this.laserHopTimer = 0;
    this.laserLastTarget = null;
    this.laserLastGen = 0;
    this.laserNoEnemies = 0;
    this.laserPath = [];
    this.gravityTime = 0;
    this.afterimages = [];
    this.afterimageTimer = 0;
    this.splitCount = 1;
    this.damageMultiplier = 1;
    this.hasteMultiplier = 1;
  }

  begin(mods) {
    mods = forCarrier(mods, 'root');
    this.mods = mods || {};
    this.splitCount = Math.max(1, Math.round(1 + (this.mods.incarnationCount?.percent || 0) / 100));
    this.damageMultiplier = (1 + (this.mods.damage?.percent || 0) / 100) * (1 + (this.splitCount-1)*this.config.skills.incarnation.splitDamageScale);
    this.hasteMultiplier = 1 + (this.mods.rate?.percent || 0) / 100;
    this.source.el = (this.mods.burn ? 1 : 0) | (this.mods.frost ? 2 : 0) | (this.mods.lightning ? 4 : 0);
    this.hitGenerations.clear();
    this.bladeItems.length = 0;
    this.laserPath.length = 0;
    this.laserTime = this.mods.laser ? this.config.skills.incarnation.laserDuration : 0;
    this.laserHopTimer = 0;
    this.laserLastTarget = null;
    this.laserNoEnemies = 0;
    this.hero.incarnationLaser = !!this.mods.laser;
    this.shotForm = !!this.mods.shot && !this.mods.laser && !this.mods.blades;
    this.gravityTime = this.mods.gravity && !this.mods.laser && !this.mods.blades ? this.config.skills.incarnation.gravityDuration : 0;
    this.afterimages.length = 0;
    this.afterimageTimer = 0;
    const S = this.config.skills.incarnation;
    this.bladeQueue = this.mods.blades && !this.mods.laser ? Math.max(S.bladeBaseCount, Math.round(S.bladeBaseCount + S.bladeMultiplierBase * ((this.mods.blades.max || 1) - 1))) : 0;
    this.bladeGap = this.bladeQueue ? Math.min(S.bladeLaunchGap, S.duration * this.splitCount / this.bladeQueue) / this.hasteMultiplier : S.bladeLaunchGap;
    this.bladeTimer = this.bladeGap;
    if (this.bladeQueue) for (let i = 0; i < this.bladeQueue; i++) this.bladeItems.push({ state: 'orbit', x: this.hero.x, y: this.hero.y, a: i * Math.PI * 2 / this.bladeQueue, off: i * Math.PI * 2 / this.bladeQueue, kind: this.mods.frost && this.mods.burn ? 3 : this.mods.burn ? 2 : this.mods.frost ? 1 : 0, zap: this.mods.lightning ? 1 : 0, age: 0, incarnationBlade: true });
    this.active = true;
  }

  reset() {
    this.active = false;
    this.mods = null;
    this.hitGenerations.clear();
    this.source.el = 0;
    this.bladeQueue = 0;
    this.bladeItems.length = 0;
    this.laserTime = 0;
    this.laserPath.length = 0;
    this.hero.incarnationLaser = false;
    this.gravityTime = 0;
    this.afterimages.length = 0;
  }

  update(dt = 0) {
    const h = this.hero;
    if (!h.active) return;
    if (this.laserTime > 0) { this.updateLaser(dt); return; }
    if (this.gravityTime > 0) { this.updateGravity(dt); return; }
    if (this.bladeQueue || this.bladeItems.length) this.updateBlades(dt);
    if (!this.active || h.incarnationT <= 0 || this.bladeQueue || this.mods?.blades || this.mods?.laser || this.mods?.gravity) return;
    const S = this.config.skills.incarnation;
    const enemies = this.enemies.items;
    const radius = h.radius + Math.max(0, S.contactPadding);
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e || !e.active || this.hitGenerations.get(e) === (e.gen ?? 0)) continue;
      if (!incarnationSegmentHit(h.prevX, h.prevY, h.x, h.y, e.x, e.y, radius + e.radius)) continue;
      this.hitGenerations.set(e, e.gen ?? 0);
      const hit = this.combat.damageEnemy(e, S.contactDamage * this.damageMultiplier, this.source, null);
      if (!hit || !e.active) continue;
      this.applyElements(e);
    }
  }


  updateGravity(dt) {
    const h = this.hero, S = this.config.skills.incarnation;
    this.gravityTime = Math.max(0, this.gravityTime - dt);
    this.afterimageTimer -= dt;
    if (this.afterimageTimer <= 0 && Math.hypot(h.vx || 0, h.vy || 0) > 5) {
      this.afterimageTimer += S.gravityAfterimageInterval;
      this.afterimages.push({ x:h.x, y:h.y, facing:h.facing, life:0.3 });
    }
    for (let i = this.afterimages.length - 1; i >= 0; i--) {
      this.afterimages[i].life -= dt;
      if (this.afterimages[i].life <= 0) this.afterimages.splice(i,1);
    }
    if (this.gravityTime <= 0) {
      h.incarnationT = 0;
      h.incarnationSpeedMul = 1;
      h.incarnationInertia = 0;
      this.active = false;
    }
  }

  /** Лазерная форма: удары по всем живым врагам независимо от расстояния. */
  updateLaser(dt) {
    const h = this.hero, S = this.config.skills.incarnation;
    const step = Math.max(0.02, S.laserHopInterval / this.hasteMultiplier);
    this.laserTime = Math.max(0, this.laserTime - dt);
    const anyEnemy = this.enemies.items.some(e => e && e.active && e.hp > 0);
    this.laserNoEnemies = anyEnemy ? 0 : this.laserNoEnemies + dt;
    if (this.laserNoEnemies >= 0.5) { this.endLaser(); return; }
    this.laserHopTimer -= dt;
    let hops = 0;
    while (this.laserHopTimer <= 0 && hops++ < 12 && this.laserTime > 0) {
      this.laserHopTimer += step;
      const enemies = this.enemies.items.filter(e => e && e.active && e.hp > 0);
      if (!enemies.length) break;
      // Не прыгаем два раза подряд по одной цели, когда есть альтернатива.
      let candidates = enemies.filter(e => e !== this.laserLastTarget || e.gen !== this.laserLastGen);
      if (!candidates.length) candidates = enemies;
      let pick = candidates[0], best = Infinity;
      for (const e of candidates) {
        const d = (e.x - h.x) ** 2 + (e.y - h.y) ** 2;
        if (d < best) { best = d; pick = e; }
      }
      const fromX = h.x, fromY = h.y;
      h.x = pick.x; h.y = pick.y;
      h.prevX = h.x; h.prevY = h.y;
      this.laserPath.push({ x1: fromX, y1: fromY, x2: h.x, y2: h.y, life: 0.18, maxLife: 0.18 });
      this.laserLastTarget = pick; this.laserLastGen = pick.gen;
      const hit = this.combat.damageEnemy(pick, S.laserDamage * this.damageMultiplier * (this.mods?.laser?.damage || 1), this.source, null);
      this.laserPath[this.laserPath.length-1].strands = this.splitCount;
      this.laserPath[this.laserPath.length-1].chaotic = !!this.mods.shot;
      if (hit && pick.active) this.applyElements(pick);
    }
    for (let i = this.laserPath.length - 1; i >= 0; i--) {
      this.laserPath[i].life -= dt;
      if (this.laserPath[i].life <= 0) this.laserPath.splice(i, 1);
    }
    if (this.laserTime <= 0) this.endLaser();
    else h.incarnationT = Math.max(h.incarnationT, 0.03);
  }

  endLaser() {
    const h = this.hero, S = this.config.skills.incarnation;
    const enemies = this.enemies.items.filter(e => e && e.active && e.hp > 0);
    const distance = Math.max(60, S.laserSafeRadius);
    let bestX = h.x, bestY = h.y, bestScore = -Infinity;
    // Ищем безопасное место вокруг последней позиции, с проверкой границ арены.
    const tries = 48;
    for (let i = 0; i <= tries; i++) {
      const r = i === 0 ? 0 : distance * (0.5 + (i % 3) * 0.5);
      const a = i * Math.PI * (3 - Math.sqrt(5));
      const probe = { x: h.x + Math.cos(a) * r, y: h.y + Math.sin(a) * r, radius: h.radius };
      if (this.arena?.resolveCircle) this.arena.resolveCircle(probe);
      const nearest = enemies.length ? Math.min(...enemies.map(e => Math.hypot(e.x - probe.x, e.y - probe.y) - e.radius - h.radius)) : distance;
      // Выбираем самое далёкое от врагов доступное место, без приоритета дальнего края карты.
      const score = Math.min(nearest, distance * 1.5) - Math.hypot(probe.x - h.x, probe.y - h.y) * 0.08;
      if (score > bestScore) { bestScore = score; bestX = probe.x; bestY = probe.y; }
    }
    h.x = h.prevX = bestX;
    h.y = h.prevY = bestY;
    h.vx = h.vy = 0;
    h.incarnationT = 0;
    h.incarnationSpeedMul = 1;
    h.incarnationInertia = 0;
    h.incarnationLaser = false;
    this.laserTime = 0;
    this.laserPath.length = 0;
    this.active = false;
  }

  updateBlades(dt) {
    this.orbitClock = (this.orbitClock || 0) + dt;
    const S = this.config.skills.incarnation, h = this.hero;
    const gap = Math.max(0.01, this.bladeGap || S.bladeLaunchGap);
    if (this.bladeQueue && h.incarnationT > 0) {
      this.bladeTimer -= dt;
      if (this.bladeTimer <= 0) {
        this.bladeTimer += gap;
        for (let volley = 0; volley < this.splitCount; volley++) {
        const b = this.bladeItems.find(b => b.state === 'orbit');
        if (b) {
          const targets = this.enemies.items.filter(e => e.active && e.hp > 0 && Math.hypot(e.x - h.x, e.y - h.y) <= S.bladeRange);
          targets.sort((a, z) => Math.hypot(a.x-h.x,a.y-h.y) - Math.hypot(z.x-h.x,z.y-h.y));
          const t = targets[0];
          const a = t ? Math.atan2(t.y - h.y, t.x - h.x) : h.facing;
          b.x = h.x; b.y = h.y; b.a = a; b.vx = Math.cos(a) * S.bladeSpeed; b.vy = Math.sin(a) * S.bladeSpeed;
          b.state = 'fly'; b.age = 0;
          this.bladeQueue--;
          if (this.bladeQueue === 0) {
            h.incarnationT = 0;
            h.incarnationSpeedMul = 1;
            h.incarnationInertia = 0;
            this.active = false;
          }
        }
        if (!this.bladeQueue) break;
        }
      }
      // Воплощение клинков длится до последнего вылета, независимо от обычных 5 секунд.
      if (this.bladeQueue) h.incarnationT = Math.max(h.incarnationT, gap + 0.02);
    }
    for (const b of this.bladeItems) {
      b.age += dt;
      if (b.state === 'orbit') {
        // Стая перемещается вместе с героем, клинки смотрят в сторону движения.
        const speed = Math.hypot(h.vx || 0, h.vy || 0);
        b.a = speed > 3 ? Math.atan2(h.vy, h.vx) : h.facing;
        const waiting = Math.max(1, this.bladeQueue);
        const slot = this.bladeItems.filter(q => q.state === 'orbit').indexOf(b);
        // Объёмное вращающееся облако вместо ровной шеренги.
        const seed = b.off || (slot+1)*2.39996;
        const turn = seed + ((this.orbitClock || 0)) * 1.7;
        const ring = 16 + 22 * Math.sqrt((slot + 0.5) / waiting);
        b.x = h.x + Math.cos(turn) * ring;
        b.y = h.y + Math.sin(turn) * ring * 0.68;
        b.a += Math.sin(turn) * 0.22;
      } else if (b.state === 'fly') {
        const x = b.x, y = b.y;
        b.x += b.vx * dt; b.y += b.vy * dt;
        for (const e of this.enemies.items) {
          if (!e.active || e.hp <= 0 || !incarnationSegmentHit(x,y,b.x,b.y,e.x,e.y,e.radius + 7)) continue;
          const hit = this.combat.damageEnemy(e, this.config.blades.damage * this.damageMultiplier * (this.mods?.blades?.damage || 1), this.source, null);
          if (hit && e.active) this.applyElements(e);
          b.state = 'gone';
          break;
        }
        if (b.age > S.bladeRange / Math.max(1,S.bladeSpeed)) b.state = 'gone';
      }
    }
    let j = 0;
    for (const b of this.bladeItems) if (b.state !== 'gone') this.bladeItems[j++] = b;
    this.bladeItems.length = j;
  }

  /** Реакции проходят через штатные Горение/Мороз/Электризацию (включая Пар и красные дуги). */
  applyElements(e) {
    const m = this.mods || {};
    const cfg = this.config;
    const fire = !!m.burn, ice = !!m.frost, lightning = !!m.lightning;
    const bd = fire ? cfg.skills.incarnation.burnTickDamage * (m.burn.damage || 1) : 0;
    const bi = fire ? cfg.burn.interval / Math.max(0.01, m.burn.rate || 1) : 0;
    const steam = fire && ice ? (m.steam ? m.steam.damage : 1) : 0;
    const chain = lightning ? Math.max(1, m.lightning.mult || 1) : 1;

    if (fire && e.active && this.igniteMax) this.igniteMax(e, bd, bi);
    // Электризованный враг получает небесный удар при заморозке.
    // Если электризация ещё отсутствует, создаём первый заряд ДО Мороза,
    // а остальные добавляем после, чтобы запустить и обычный цепной разряд.
    if (lightning && ice && e.active && (e.shockStacks || 0) === 0 && this.zap)
      this.zap(e, bd, bi, 1, steam, chain);
    if (ice && e.active && this.chill && e.freezeT <= 0) {
      const remaining = Math.max(0, cfg.frost.maxStacks - (e.frostStacks || 0));
      for (let i = 0; i < remaining && e.active && e.freezeT <= 0; i++)
        this.chill(e, steam, bd, bi);
    }
    if (lightning && e.active && this.zap) {
      const remaining = Math.max(0, cfg.shock.maxStacks - (e.shockStacks || 0));
      for (let i = 0; i < remaining && e.active; i++)
        this.zap(e, bd, bi, ice ? 1 : 0, steam, chain);
    }
  }
}
