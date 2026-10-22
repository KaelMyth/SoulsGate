// Данные ядра для показа: список строк «название: значение» из живого конфига.
// Что показывать, задаёт сама запись ядра в config.cores (поле stats), код ничего не знает о снарядах и щитах.
import { getPath } from './debug_tunables.js';

export function formatStat(stat, value) {
  if (value === undefined || value === null || Number.isNaN(value)) return '—';
  let v = value;
  if (stat.percent) v = Math.round(value * 100);
  const text = Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
  return text + (stat.unit ? ' ' + stat.unit : '');
}

/** [{ label, text }] для ядра: значения читаются из конфига в момент вызова. */
export function coreStats(core, config) {
  return (core.def.stats || []).map((s) => ({ label: s.label, text: formatStat(s, getPath(config, s.path)) }));
}
