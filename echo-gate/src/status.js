// Статусы врагов от стихий посоха (чистая логика, без графики). Сейчас лёд:
// каждое попадание ледяным снарядом даёт стак замедления на slowTime секунд (повторное попадание обновляет время),
// каждый стак замедляет на slowPerStack; stacksToFreeze стаков замораживают врага на freezeTime секунд (стоит и не атакует).
// Огромных врагов (heavy: скала, босс) заморозить нельзя, они только замедляются.
// Поля врага: chill (стаки), chillT (с до конца замедления), freezeT (с до конца заморозки).

export function resetStatus(e) { e.chill = 0; e.chillT = 0; e.freezeT = 0; }

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
