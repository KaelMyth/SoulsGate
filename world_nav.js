// Навигация врагов: сетка и поле расстояний до героя (flow field).
//
// Арена делится на клетки. Клетки возле скал помечаются непроходимыми (с запасом на размер врага).
// От клетки героя считается расстояние до каждой клетки с учётом скал. Враг, которого скала
// закрывает от героя, идёт в соседнюю клетку с меньшим расстоянием, то есть огибает препятствие.
// Стоимость не зависит от числа врагов: поле считается один раз на всех, и только когда герой
// перешёл в другую клетку. Это же поле пригодится орде на этапе 3.

const SQRT2 = Math.SQRT2;
// Плоские массивы вместо массива массивов: быстрее в горячем цикле (особенно на телефоне).
const NDX = new Int8Array([1, -1, 0, 0, 1, 1, -1, -1]);
const NDY = new Int8Array([0, 0, 1, -1, 1, -1, 1, -1]);
const NCOST = new Float64Array([1, 1, 1, 1, SQRT2, SQRT2, SQRT2, SQRT2]);

export class NavGrid {
  /** cfg: { cell, inflate }; inflate: на сколько шире скалы считать непроходимую зону. */
  constructor(arena, cfg) {
    this.arena = arena;
    this.cfg = cfg;
    this.cell = cfg.cell;
    this.cols = Math.max(1, Math.ceil(arena.width / this.cell));
    this.rows = Math.max(1, Math.ceil(arena.height / this.cell));
    const n = this.cols * this.rows;
    this.blocked = new Uint8Array(n);
    this.dist = new Float64Array(n);
    this.source = -1;
    // Куча для поиска кратчайших путей: ключи и значения лежат в массивах, без создания объектов.
    this.heapKeys = new Float64Array(n * 8 + 8);
    this.heapVals = new Int32Array(n * 8 + 8);
    this.heapSize = 0;
    this.buildBlocked();
  }

  buildBlocked() {
    const { arena, cell, cols, rows, blocked } = this;
    const pad = this.cfg.inflate;
    blocked.fill(0);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = arena.left + (c + 0.5) * cell;
        const y = arena.top + (r + 0.5) * cell;
        if(arena.northWall && !arena.zone && y < arena.walkTop + pad){
          blocked[r * cols + c] = 1;
          continue;
        }
        for (let i = 0; i < arena.rocks.length; i++) {
          const rock = arena.rocks[i];
          const dx = x - rock.x;
          const dy = y - rock.y;
          const lim = rock.r + pad;
          if (dx * dx + dy * dy < lim * lim) {
            blocked[r * cols + c] = 1;
            break;
          }
        }
      }
    }
    this.source = -1; // карта изменилась: поле надо считать заново
  }

  cellX(x) {
    const c = Math.floor((x - this.arena.left) / this.cell);
    return c < 0 ? 0 : c >= this.cols ? this.cols - 1 : c;
  }

  cellY(y) {
    const r = Math.floor((y - this.arena.top) / this.cell);
    return r < 0 ? 0 : r >= this.rows ? this.rows - 1 : r;
  }

  /** Пересчитать поле, если герой перешёл в другую клетку. Возвращает true, если пересчитали. */
  update(heroX, heroY) {
    const idx = this.cellY(heroY) * this.cols + this.cellX(heroX);
    if (idx === this.source) return false;
    this.source = idx;
    this.compute(idx);
    return true;
  }

  push(key, val) {
    const keys = this.heapKeys;
    const vals = this.heapVals;
    let i = this.heapSize++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      keys[i] = keys[p];
      vals[i] = vals[p];
      i = p;
    }
    keys[i] = key;
    vals[i] = val;
  }

  /** Вынуть минимум; ключ возвращается через this.popKey. */
  pop() {
    const keys = this.heapKeys;
    const vals = this.heapVals;
    const topVal = vals[0];
    this.popKey = keys[0];
    const n = --this.heapSize;
    if (n > 0) {
      const key = keys[n];
      const val = vals[n];
      let i = 0;
      for (;;) {
        let c = i * 2 + 1;
        if (c >= n) break;
        if (c + 1 < n && keys[c + 1] < keys[c]) c++;
        if (keys[c] >= key) break;
        keys[i] = keys[c];
        vals[i] = vals[c];
        i = c;
      }
      keys[i] = key;
      vals[i] = val;
    }
    return topVal;
  }

  compute(source) {
    const { cols, rows, blocked, dist } = this;
    dist.fill(Infinity);
    dist[source] = 0;
    this.heapSize = 0;
    this.push(0, source);
    while (this.heapSize > 0) {
      const cur = this.pop();
      const d = this.popKey;
      if (d > dist[cur]) continue; // устаревшая запись в куче
      const cx = cur % cols;
      const cy = (cur / cols) | 0;
      for (let k = 0; k < 8; k++) {
        const nx = cx + NDX[k];
        const ny = cy + NDY[k];
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const ni = ny * cols + nx;
        if (blocked[ni]) continue;
        // По диагонали проходим, только если оба соседа по бокам свободны: углы скал не срезаем.
        if (k >= 4 && (blocked[cy * cols + nx] || blocked[ny * cols + cx])) continue;
        const nd = d + NCOST[k];
        if (nd < dist[ni]) {
          dist[ni] = nd;
          this.push(nd, ni);
        }
      }
    }
  }

  /**
   * Куда идти из точки (x, y), чтобы приблизиться к герою в обход скал.
   * Пишет единичный вектор в out. Возвращает false, если подсказки нет (враг уже в клетке героя
   * или оказался в недостижимом месте): тогда идти напрямую.
   */
  direction(x, y, out) {
    const { cols, rows, blocked, dist, arena, cell } = this;
    const cx = this.cellX(x);
    const cy = this.cellY(y);
    const own = dist[cy * cols + cx];
    let best = -1;
    let bestD = own;
    for (let k = 0; k < 8; k++) {
      const nx = cx + NDX[k];
      const ny = cy + NDY[k];
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const ni = ny * cols + nx;
      if (blocked[ni]) continue;
      if (k >= 4 && (blocked[cy * cols + nx] || blocked[ny * cols + cx])) continue;
      const nd = dist[ni];
      if (nd < bestD) {
        bestD = nd;
        best = ni;
      }
    }
    if (best < 0) return false;
    const tx = arena.left + ((best % cols) + 0.5) * cell;
    const ty = arena.top + (((best / cols) | 0) + 0.5) * cell;
    const dx = tx - x;
    const dy = ty - y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return false;
    out.x = dx / len;
    out.y = dy / len;
    return true;
  }
}
