// Хранилище деталей: отдельная от сетки структура (по концепту). Пока только пустые ячейки,
// детали и их выдача придут с наградами за уровень.
export class Storage {
  constructor(size) {
    this.resize(size);
  }

  resize(size) {
    this.slots = new Array(Math.max(0, Math.round(size))).fill(null);
  }

  get size() {
    return this.slots.length;
  }
}
