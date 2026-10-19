// Всё, что связано с особенностями телефона: безопасные зоны, жесты Safari.

/** Безопасные зоны iPhone (вырез, индикатор «домой») в CSS-пикселях. */
export function readSafeInsets(probe) {
  const cs = getComputedStyle(probe);
  return {
    top: parseFloat(cs.paddingTop) || 0,
    right: parseFloat(cs.paddingRight) || 0,
    bottom: parseFloat(cs.paddingBottom) || 0,
    left: parseFloat(cs.paddingLeft) || 0,
  };
}

/**
 * Отключить жесты браузера: прокрутку, резинку, масштаб щипком, двойное касание, меню долгого нажатия.
 * allowSelector: элементы (кнопки, панель), в которых нужно оставить обычное поведение касаний.
 */
export function lockBrowserGestures(doc, allowSelector) {
  const allowed = (t) => !!(t && t.closest && t.closest(allowSelector));
  const block = (e) => {
    if (e.cancelable) e.preventDefault();
  };
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((n) => doc.addEventListener(n, block));
  doc.addEventListener('touchmove', (e) => { if (!allowed(e.target)) block(e); }, { passive: false });
  doc.addEventListener('touchstart', (e) => {
    if (e.touches.length > 1 && !allowed(e.target)) block(e);
  }, { passive: false });
  doc.addEventListener('contextmenu', block);
  doc.addEventListener('dblclick', block);
}
