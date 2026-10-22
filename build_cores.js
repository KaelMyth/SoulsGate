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
export function coreStats(core, config, mods) {
  return (core.def.stats || []).map((s) => {
    let v = getPath(config, s.path);
    const m = s.key && mods ? mods[s.key] : null;
    let bonus = '';
    if (m && typeof v === 'number') {
      v = v * (1 + m.percent / 100) + m.flat;
      bonus = (m.percent ? '+' + m.percent + '%' : '') + (m.flat ? (m.percent ? ' ' : '') + '+' + m.flat : '');
    }
    return { label: s.label, text: formatStat(s, v), bonus };
  });
}

/** Применить модификатор стата к числу (для боя). */
export function applyMod(value, mod) {
  return mod ? value * (1 + mod.percent / 100) + mod.flat : value;
}
