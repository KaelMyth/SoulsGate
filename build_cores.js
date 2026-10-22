// Данные ядра для показа: список строк «название: значение» из живого конфига.
// Что показывать, задаёт сама запись ядра в config.cores (поле stats), код ничего не знает о снарядах и щитах.
import { getPath } from './debug_tunables.js';

export function formatStat(stat, value) {
  if (value === undefined || value === null || Number.isNaN(value)) return '—';
  let v = value;
  // rate: скорость в «числах»: rate / секунды между выстрелами (100 = 1.0 с, 1000 = 0.1 с)
  if (stat.rate) v = value > 0 ? stat.rate / value : 0;
  if (stat.percent) v = Math.round(value * 100);
  const text = stat.rate ? String(Math.round(v)) : stat.decimals !== undefined ? v.toFixed(stat.decimals) : Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
  return text + (stat.unit ? ' ' + stat.unit : '');
}

/**
 * [{ label, text, bonus }] для ядра: значения читаются из конфига в момент вызова.
 * mods: модификаторы ядра от модов ({ стат: { percent, flat } }), они уже учтены в text, bonus это пометка «+10%».
 */
/**
 * Множитель урона одного снаряда, когда их несколько: за каждое удвоение числа снарядов урон умножается
 * на config.attack.countDamage (0.75: два снаряда по 75, четыре по 56, восемь по 42).
 */
export function countPenalty(config, count) {
  const d = config.attack.countDamage;
  return count > 1 && typeof d === 'number' ? Math.pow(d, Math.log2(count)) : 1;
}

/** Число снарядов за выстрел с модами ядра (целое, не меньше 1). */
export function projectileCount(config, mods) {
  const m = mods && mods.count;
  return Math.max(1, Math.round(m ? config.attack.count * (1 + m.percent / 100) + m.flat : config.attack.count));
}

export function coreStats(core, config, mods) {
  const pen = core.def.multStat === 'count' ? countPenalty(config, projectileCount(config, mods)) : 1;
  return (core.def.stats || []).map((s) => {
    let v = getPath(config, s.path);
    const m = s.key && mods ? mods[s.key] : null;
    let bonus = '';
    if (m && typeof v === 'number') {
      v = v * (1 + m.percent / 100) + m.flat;
      const pc = Math.round(m.percent * 10) / 10;
      bonus = s.key === core.def.multStat ? '×' + (1 + pc / 100) : (pc ? '+' + pc + '%' : '') + (m.flat ? (pc ? ' ' : '') + '+' + m.flat : '');
    }
    if (s.key === 'count' && typeof v === 'number') v = Math.round(v); // снарядов целое число
    if (s.key === 'damage' && pen < 1 && typeof v === 'number') {
      v *= pen;
      bonus += (bonus ? ' ' : '') + '−' + Math.round((1 - pen) * 100) + '% (снарядов больше)';
    }
    return { label: s.label, text: formatStat(s, v), bonus };
  });
}

/** Применить модификатор стата к числу (для боя). */
export function applyMod(value, mod) {
  return mod ? value * (1 + mod.percent / 100) + mod.flat : value;
}
