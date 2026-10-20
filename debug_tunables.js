// Работа со значениями, которые меняются ползунками: путь в конфиге, сохранение на телефоне.
// Без DOM, поэтому покрывается автотестами.

export function getPath(obj, path) {
  return path.split('.').reduce((o, k) => o[k], obj);
}

export function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((o, k) => o[k], obj)[last] = value;
}

export function formatValue(def, v) {
  const s = String(def.step);
  const dot = s.indexOf('.');
  const decimals = dot < 0 ? 0 : s.length - dot - 1;
  return v.toFixed(decimals);
}

/** Текущие значения всех ползунков: { 'hero.speed': 180, ... }. */
export function snapshot(config, tunables) {
  const out = {};
  for (const t of tunables) out[t.path] = getPath(config, t.path);
  return out;
}

/** Применить сохранённые значения из хранилища. Возвращает, сколько применено. */
export function loadOverrides(config, tunables, storage, key) {
  let data;
  try {
    const raw = storage.getItem(key);
    if (!raw) return 0;
    data = JSON.parse(raw);
  } catch (err) {
    return 0;
  }
  let n = 0;
  for (const t of tunables) {
    const v = data[t.path];
    if (typeof v === 'number' && isFinite(v)) {
      setPath(config, t.path, Math.min(t.max, Math.max(t.min, v)));
      n++;
    }
  }
  return n;
}

/**
 * Сохранить только то, что отличается от стартовых значений. Тогда при смене дефолтов
 * в новой сборке нетронутые ползунки подхватят новые значения.
 */
export function saveOverrides(config, defaults, tunables, storage, key) {
  const data = {};
  for (const t of tunables) {
    const v = getPath(config, t.path);
    if (v !== getPath(defaults, t.path)) data[t.path] = v;
  }
  try {
    if (Object.keys(data).length) storage.setItem(key, JSON.stringify(data));
    else storage.removeItem(key);
  } catch (err) { /* приватный режим Safari: просто не сохраняем */ }
}

/** localStorage может бросать исключение (запрет в браузере): тогда подставляем заглушку. */
export function safeStorage() {
  try {
    const s = window.localStorage;
    s.getItem('__probe__');
    return s;
  } catch (err) {
    return { getItem() { return null; }, setItem() {}, removeItem() {} };
  }
}
