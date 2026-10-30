// Единая маршрутизация свойств модов по носителю.
// Корень/Лазер/Клинки/Аура и прочие компоненты являются независимыми
// владельцами стихий. Соседняя ветка не должна менять чужую механику.
const ELEMENTS = ['burn','frost','lightning','steam'];

/** Сохраняет параметры исходной сборки, заменяя стихии на локальные для carrier. */
export function forCarrier(mods, carrier = 'root') {
  if (!mods || !mods.scopes) return mods || {};
  const scope = mods.scopes[carrier] || {};
  const result = {...mods};
  for (const kind of ELEMENTS) result[kind] = scope[kind] || null;
  return result;
}

/** Модификатор в дочерней ветке не протекает в соседнюю или родительскую. */
export function hasCarrierEffect(mods, carrier, kind) {
  if (!mods) return false;
  return mods.scopes ? !!mods.scopes[carrier]?.[kind] : !!mods[kind];
}
