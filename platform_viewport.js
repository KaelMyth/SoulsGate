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
  const block = (e) => { if (e.cancelable) e.preventDefault(); };
  // Только действительно прокручиваемая панель получает жест. Простого попадания
  // в кнопку/меню недостаточно: Safari иначе прокручивает всю страницу (rubber band).
  const canScroll = (target, deltaX, deltaY) => {
    if (!target?.closest?.(allowSelector)) return false;
    let el = target;
    while (el && el !== doc.body && el !== doc.documentElement) {
      const yMax = (el.scrollHeight || 0) - (el.clientHeight || 0);
      const xMax = (el.scrollWidth || 0) - (el.clientWidth || 0);
      if (yMax > 1 && Math.abs(deltaY) >= Math.abs(deltaX) &&
          ((deltaY > 0 && el.scrollTop > 0) ||
           (deltaY < 0 && el.scrollTop < yMax - 1))) return true;
      if (xMax > 1 && Math.abs(deltaX) > Math.abs(deltaY) &&
          ((deltaX > 0 && el.scrollLeft > 0) ||
           (deltaX < 0 && el.scrollLeft < xMax - 1))) return true;
      el = el.parentElement;
    }
    return false;
  };
  let lastX = 0, lastY = 0;
  for (const n of ['gesturestart', 'gesturechange', 'gestureend'])
    doc.addEventListener(n, block, { passive: false });
  doc.addEventListener('touchstart', (e) => {
    const touch = e.touches?.[0];
    if (touch) { lastX = touch.clientX; lastY = touch.clientY; }
    if ((e.touches?.length || 0) > 1) block(e); // зум двумя пальцами
  }, { passive: false });
  doc.addEventListener('touchmove', (e) => {
    const touch = e.touches?.[0];
    if (!touch || e.touches.length !== 1) { block(e); return; }
    const dx = touch.clientX - lastX, dy = touch.clientY - lastY;
    lastX = touch.clientX;
    lastY = touch.clientY;
    if (!canScroll(e.target, dx, dy)) block(e);
  }, { passive: false });
  // Колёсико мыши/тачпад тоже не должны прокручивать игру.
  doc.addEventListener('wheel', (e) => {
    if (!canScroll(e.target, -e.deltaX, -e.deltaY)) block(e);
  }, { passive: false });
  doc.addEventListener('contextmenu', block);
  doc.addEventListener('dblclick', block);
}