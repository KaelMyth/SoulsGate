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

/**
 * Лазер: из урона снаряда (с модами, без штрафа), числа снарядов и модов лазера. Ширина и урон растут с числом снарядов.
 * tick: урон тика, ticks: сколько тиков за жизнь, life: длительность, width: толщина, big: лазер большой (много снарядов).
 */
export function laserStats(config, laser, dmg, count) {
  const L = config.laser;
  const big = count >= L.bigFrom;
  const life = big ? L.bigDuration : L.duration;
  const interval = L.interval / laser.rate;
  return {
    tick: dmg * countPenalty(config, count) * count * L.tickFrac * laser.damage,
    interval,
    life,
    ticks: Math.max(1, Math.round(life / interval)),
    width: L.width * (1 + (count - 1) * L.widthPerCount),
    big,
  };
}

/** Строки карточки для горения: урон тика и число тиков. dmg: урон одного снаряда с модами и штрафом. */
export function burnStats(config, burn, dmg) {
  const b = config.burn;
  const tick = dmg * b.damageFrac * burn.damage;
  const interval = b.interval / burn.rate;
  return {
    tick,
    interval,
    ticks: Math.floor(b.duration / interval + 1e-9),
  };
}

export function coreStats(core, config, mods) {
  const pen = core.def.multStat === 'count' ? countPenalty(config, projectileCount(config, mods)) : 1;
  const rows = (core.def.stats || []).map((s) => {
    let v = getPath(config, s.path);
    const m = s.key && mods ? mods[s.key] : null;
    let bonus = '';
    if (m && typeof v === 'number') {
      // Скорость стрельбы хранится как перезарядка в секундах: +10% скорости это перезарядка, делённая на 1.1.
      v = s.rate ? v / (1 + m.percent / 100) : v * (1 + m.percent / 100) + m.flat;
      const pc = Math.round(m.percent * 10) / 10;
      bonus = s.key === core.def.multStat ? '×' + (1 + pc / 100) : (pc ? '+' + pc + '%' : '') + (m.flat ? (pc ? ' ' : '') + '+' + m.flat : '');
    }
    if (s.key === 'count' && typeof v === 'number') v = Math.round(v); // снарядов целое число
    if (s.key === 'damage' && pen < 1 && typeof v === 'number') {
      v *= pen;
      bonus += (bonus ? ' ' : '') + '−' + Math.round((1 - pen) * 100) + '% (снарядов больше)';
    }
    return { label: s.label, key: s.key, value: v, text: formatStat(s, v), bonus };
  });
  if (core.def.canBurn && mods && mods.burn) {
    const dmgRow = rows.find((r) => r.key === 'damage');
    const base = dmgRow ? dmgRow.value : 0;
    const bs = burnStats(config, mods.burn, base);
    rows.push({ label: 'Горение: урон тика', text: String(Math.round(bs.tick * 100) / 100), bonus: '' });
    rows.push({ label: 'Горение: тиков за ' + config.burn.duration + ' с', text: String(bs.ticks), bonus: '' });
  }
  if (core.def.canLaser && mods && mods.laser) {
    const dmgRow = rows.find((r) => r.key === 'damage');
    const cnt = projectileCount(config, mods);
    // dmgRow.value уже со штрафом за число снарядов: возвращаем его, чтобы не считать штраф дважды
    const base = dmgRow ? dmgRow.value / countPenalty(config, cnt) : 0;
    const ls = laserStats(config, mods.laser, base, cnt);
    rows.push({ label: 'Лазер: урон тика', text: String(Math.round(ls.tick * 100) / 100), bonus: '' });
    rows.push({ label: 'Лазер: тиков за ' + ls.life + ' с', text: String(ls.ticks), bonus: ls.big ? 'большой' : '' });
    rows.push({ label: 'Лазер: толщина', text: String(Math.round(ls.width)), bonus: '' });
  }
  if (core.def.canBlades && mods && mods.blades) {
    rows.push({ label: 'Клинки: до залпа', text: String(config.blades.max), bonus: '' });
    rows.push({ label: 'Клинки: новый раз в', text: config.blades.interval + ' с', bonus: '' });
    rows.push({ label: 'Клинки: урон', text: String(config.blades.damage), bonus: '' });
  }
  if (core.def.canPierce && mods && mods.pierce) {
    rows.push({ label: 'Пробитие: врагов насквозь', text: String(Math.round(mods.pierce.count)), bonus: '' });
  }
  if (core.def.canFrost && mods && mods.frost) {
    const f = config.frost;
    rows.push({ label: 'Мороз: замедление за попадание', text: Math.round(f.slowPerStack * 100) + '%', bonus: '' });
    if (mods.steam && mods.burn) {
      const bs = burnStats(config, mods.burn, (rows.find((r) => r.key === 'damage') || { value: 0 }).value);
      rows.push({ label: 'Мороз: ' + f.maxStacks + ' попаданий', text: 'взрыв пара', bonus: '' });
      rows.push({ label: 'Пар: урон тика горения', text: String(Math.round(bs.tick * mods.steam.damage * 100) / 100), bonus: mods.steam.damage !== 1 ? '×' + Math.round(mods.steam.damage * 100) / 100 : '' });
    } else {
      rows.push({ label: 'Мороз: заморозка', text: f.maxStacks + ' попаданий → ' + f.freezeTime + ' с', bonus: '' });
    }
  }
  return rows;
}

/** Применить модификатор стата к числу (для боя). */
export function applyMod(value, mod) {
  return mod ? value * (1 + mod.percent / 100) + mod.flat : value;
}
