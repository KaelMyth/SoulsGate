// Мини-помощник для сборки элементов без библиотек: h('div', { class: 'x', onclick: fn }, 'текст', дети...)
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  const a = attrs || {};
  for (const k in a) {
    if (k === 'class') el.className = a[k];
    else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), a[k]);
    else el.setAttribute(k, a[k]);
  }
  for (const kid of kids) el.append(kid);
  return el;
}
