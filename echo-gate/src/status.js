// Статусы врагов от стихий посоха (чистая логика, без графики). Электричество: попадание дуги вешает стак электризации на stackTime секунд;
// stacksToChain стаков вызывают цепную молнию (Attack.chain), стаки сбрасываются. Огонь: каждое попадание даёт стак поджога на burnTime секунд
// (повторное попадание обновляет время), горящий получает burnDps урона в секунду за стак (в единицах урона выстрела);
// стаки растут до maxStacks; взрыв и живое пламя зависят от ступени посоха (Attack.deathBurst).
// Лёд:
// каждое попадание ледяным снарядом даёт стак замедления на slowTime секунд (повторное попадание обновляет время),
// каждый стак замедляет на slowPerStack; stacksToFreeze стаков замораживают врага на freezeTime секунд (стоит и не атакует).
// Огромных врагов (heavy: скала, босс) заморозить нельзя, они только замедляются.
// Поля врага: chill (стаки), chillT (с до конца замедления), freezeT (с до конца заморозки).

export function resetStatus(e) { e.chill = 0; e.chillT = 0; e.freezeT = 0; e.burn = 0; e.burnT = 0; e.shock = 0; e.shockT = 0; }

/** Попадание льдом. Возвращает 'chill' | 'freeze' | 'immune' (замороженный не накапливает стаки). */
export function applyIce(e, ice) {
  if (!ice) return 'immune';
  if (e.freezeT > 0) return 'immune';
  const max = e.heavy ? ice.stacksToFreeze - 1 : ice.stacksToFreeze;
  e.chill = Math.min(max, (e.chill || 0) + 1);
  e.chillT = ice.slowTime;
  if (!e.heavy && e.chill >= ice.stacksToFreeze) {
    e.freezeT = ice.freezeTime;
    e.chill = 0; e.chillT = 0;
    return 'freeze';
  }
  return 'chill';
}

/** Шаг времени: возвращает множитель скорости врага (0 = заморожен, 1 = без замедления). */
export function tickStatus(e, dt, ice) {
  if (e.shockT > 0) { e.shockT -= dt; if (e.shockT <= 0) { e.shock = 0; e.shockT = 0; } }
  if (e.freezeT > 0) { e.freezeT = Math.max(0, e.freezeT - dt); return 0; }
  if (e.chillT > 0) {
    e.chillT -= dt;
    if (e.chillT <= 0) { e.chill = 0; e.chillT = 0; return 1; }
    return Math.max(0, 1 - ice.slowPerStack * e.chill);
  }
  return 1;
}

/** Попадание огнём: +1 стак поджога (не больше maxStacks), горение обновляется. Взрыв теперь при смерти горящего (Attack.deathBurst). */
export function applyFire(e, fire) {
  e.burn = Math.min((fire && fire.maxStacks) || 3, (e.burn || 0) + 1);
  e.burnT = fire ? fire.burnTime : 3;
  return 'burn';
}

/** Шаг горения: возвращает урон за dt (burnDps * стаки * урон выстрела); по окончании горение гаснет. */
export function burnTick(e, dt, fire, shotDamage) {
  if (!(e.burnT > 0)) return 0;
  const t = Math.min(dt, e.burnT);
  const dmg = fire.burnDps * e.burn * t * shotDamage;
  e.burnT -= dt;
  if (e.burnT <= 0) { e.burn = 0; e.burnT = 0; }
  return dmg;
}

/** Попадание дугой. Возвращает 'shock' | 'chain'. */
export function applyShock(e, elec) {
  e.shock = (e.shock || 0) + 1;
  e.shockT = elec.stackTime;
  if (e.shock >= elec.stacksToChain) { e.shock = 0; e.shockT = 0; return 'chain'; }
  return 'shock';
}

/** Множитель скорости гравитационного снаряда по времени полёта (кривая SoulsGate): почти стоит holdFraction времени rampTime, затем взрывной разгон. */
export function gravityFactor(G, age) {
  const t = Math.min(1, age / Math.max(0.001, G.rampTime));
  const hold = Math.min(0.95, Math.max(0, G.holdFraction));
  let curve;
  if (t < hold) { const st = t / Math.max(0.001, hold); curve = 0.02 * st * st; }
  else { const inv = 1 - (t - hold) / Math.max(0.001, 1 - hold); curve = 0.02 + 0.98 * (1 - inv * inv * inv * inv); }
  return G.startSpeed + (G.maxSpeed - G.startSpeed) * curve;
}

/** Замедление врага в гравитационном искажении: 1 вне радиуса, плавно до A.minSpeed у самого героя. */
export function auraSlow(A, dist) {
  if (dist >= A.radius) return 1;
  const t = 1 - Math.max(0, dist) / A.radius;
  return 1 - (1 - A.minSpeed) * t * t * (3 - 2 * t);
}

/** Сдвиг врага к центру чёрной дыры за dt: сильнее ближе к центру, не дальше самого центра. Возвращает {dx, dz}. */
export function holePull(H, ex, ez, hx, hz, dt) {
  const dx = hx - ex, dz = hz - ez, d = Math.hypot(dx, dz);
  if (d >= H.radius || d < 1e-4) return { dx: 0, dz: 0 };
  const step = Math.min(d, H.pull * (0.35 + 0.65 * (1 - d / H.radius)) * dt);
  return { dx: dx / d * step, dz: dz / d * step };
}
