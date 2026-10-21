// Простая сетка для быстрого поиска соседей (spatial grid).
//
// Раз в шаг логики сетка пересобирается по списку тел (объекты с x, y, active), потом запросом
// query(x, y, r) достаются индексы тех, кто лежит в клетках рядом с точкой. Это надмножество:
// точное расстояние проверяет вызывающий. Без сетки каждому врагу пришлось бы перебирать всех
// остальных, и на орде это дало бы десятки тысяч проверок за шаг.
//
// Всё хранится в числовых массивах и пересобирается без создания объектов: сборщик мусора не просыпается.

export class SpatialGrid {
  /** area: { left, top, width, height }; cell: размер клетки (не меньше радиуса частых запросов). */
  constructor(area, cell, capacity = 256) {
    this.left = area.left;
    this.top = area.top;
    this.cell = cell;
    this.cols = Math.max(1, Math.ceil(area.width / cell));
    this.rows = Math.max(1, Math.ceil(area.height / cell));
    const n = this.cols * this.rows;
    this.start = new Int32Array(n + 1); // начало списка каждой клетки в order
    this.cursor = new Int32Array(n);
    this.setCapacity(capacity);
    this.buf = new Int32Array(capacity); // результат последнего query
    this.count = 0; // сколько тел в сетке
  }

  setCapacity(cap) {
    this.capacity = cap;
    this.cellOf = new Int32Array(cap);
    this.order = new Int32Array(cap);
  }

  cx(x) {
    const c = Math.floor((x - this.left) / this.cell);
    return c < 0 ? 0 : c >= this.cols ? this.cols - 1 : c;
  }

  cy(y) {
    const r = Math.floor((y - this.top) / this.cell);
    return r < 0 ? 0 : r >= this.rows ? this.rows - 1 : r;
  }

  /** Пересобрать по списку тел. Индексы в сетке = индексы в list. Неактивные пропускаются. */
  rebuild(list) {
    const n = list.length;
    if (n > this.capacity) this.setCapacity(Math.max(n, this.capacity * 2));
    const { start, cellOf, order, cursor } = this;
    start.fill(0);
    let total = 0;
    for (let i = 0; i < n; i++) {
      const b = list[i];
      if (!b.active) {
        cellOf[i] = -1;
        continue;
      }
      const c = this.cy(b.y) * this.cols + this.cx(b.x);
      cellOf[i] = c;
      start[c + 1]++;
      total++;
    }
    for (let c = 0; c < this.cols * this.rows; c++) start[c + 1] += start[c];
    for (let c = 0; c < this.cols * this.rows; c++) cursor[c] = start[c];
    for (let i = 0; i < n; i++) {
      const c = cellOf[i];
      if (c >= 0) order[cursor[c]++] = i;
    }
    this.count = total;
  }

  /**
   * Индексы тел из клеток, которых касается квадрат (x±r, y±r). Пишет в this.buf, возвращает число.
   * Буфер общий: результат надо обработать до следующего вызова query.
   */
  query(x, y, r) {
    const x0 = this.cx(x - r);
    const x1 = this.cx(x + r);
    const y0 = this.cy(y - r);
    const y1 = this.cy(y + r);
    let n = 0;
    for (let cy = y0; cy <= y1; cy++) {
      const rowBase = cy * this.cols;
      // Клетки одной строки идут подряд в order: берём целый отрезок.
      const a = this.start[rowBase + x0];
      const b = this.start[rowBase + x1 + 1];
      const len = b - a;
      if (len <= 0) continue;
      if (n + len > this.buf.length) {
        const nb = new Int32Array(Math.max(this.buf.length * 2, n + len));
        nb.set(this.buf.subarray(0, n));
        this.buf = nb;
      }
      this.buf.set(this.order.subarray(a, b), n);
      n += len;
    }
    return n;
  }
}
