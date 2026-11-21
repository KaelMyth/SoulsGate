// Статусы врагов от стихий посоха (чистая логика, без графики). Огонь: каждое попадание даёт стак поджога на burnTime секунд
// (повторное попадание обновляет время), горящий получает burnDps урона в секунду за стак (в единицах урона выстрела);
// stacksToExplode стаков вызывают небольшой взрыв (урон по области, см. Attack.explode), стаки сбрасываются.
// Лёд:
// каждое попадание ледяным снарядом даёт стак замедления на slowTime секунд (повторное попадание обновляет время),
// каждый стак замедляет на slowPerStack; stacksToFreeze стаков замораживают врага на freezeTime секунд (стоит и не атакует).
// Огромных врагов (heavy: скала, босс) заморозить нельзя, они только замедляются.
// Поля врага: chill (стаки), chillT (с до конца замедления), freezeT (с до конца заморозки).

export function resetStatus(e) { e.chill = 0; e.chillT = 0; e.freezeT = 0; e.burn = 0; e.burnT = 0; }

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
  if (e.freezeT > 0) { e.freezeT = Math.max(0, e.freezeT - dt); return 0; }
  if (e.chillT > 0) {
    e.chillT -= dt;
    if (e.chillT <= 0) { e.chill = 0; e.chillT = 0; return 1; }
    return Math.max(0, 1 - ice.slowPerStack * e.chill);
  }
  return 1;
}

/** Попадание огнём. Возвращает 'burn' | 'explode'. */
export function applyFire(e, fire) {
  if (!fire) return 'burn';
  e.burn = (e.burn || 0) + 1;
  e.burnT = fire.burnTime;
  if (e.burn >= fire.stacksToExplode) { e.burn = 0; e.burnT = 0; return 'explode'; }
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
