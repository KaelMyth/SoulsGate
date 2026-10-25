// Меню Билда: ряд хранилища с модами, поле N×N из ромбов (квадраты, повёрнутые на 45°) и карточка выбранного.
// Данные берутся из BuildGrid, Storage и config; правила прикрепления в build/rules.js.
// Управление: мод можно перетащить из хранилища на поле, а можно выбрать и нажать на зелёную клетку.
// Поставленный мод возвращается в хранилище перетаскиванием на ряд хранилища или кнопкой в карточке.
import { h, clear } from './ui_dom.js';
import { piece, tileOfMod, tileOfCore, slab } from './ui_stone.js';
import { coreStats } from './build_cores.js';
import { canPlace, highlight } from './build_rules.js';

const DRAG_START_PX = 8;

export class BuilderUI {
  constructor(grid, config, storage) {
    this.grid = grid;
    this.config = config;
    this.storage = storage;
    this.sel = null; // { kind: 'core', id } | { kind: 'shelf', index } | { kind: 'placed', x, y }
    this.board = h('div', { class: 'board' });
    this.wrap = h('div', { class: 'board-wrap' }, this.board);
    this.info = h('div', { class: 'core-info' });
    this.shelf = h('div', { class: 'shelf' });
    this.root = h('div', { class: 'builder' }, this.shelf, this.wrap, this.info);
    this.rebuild();
  }

  /* ---------- Действия (без интерфейса, их же вызывают перетаскивание и нажатия) ---------- */

  /** Мод из ячейки хранилища на клетку поля. true, если встал. */
  placeFromShelf(index, x, y) {
    const mod = this.storage.slots[index];
    if (!mod || !canPlace(this.grid, mod.def, x, y).ok) return false;
    this.storage.slots[index] = null;
    this.grid.placeMod(mod, x, y);
    this.sel = { kind: 'placed', x, y };
    this.rebuild();
    return true;
  }

  /** Вытащить мод с поля в хранилище. Вместе с ним уходят моды, которые держались только на нём. */
  returnToShelf(x, y) {
    const cell = this.grid.cell(x, y);
    if (!cell || !cell.mod) return false;
    const free = this.storage.slots.filter((s) => s === null).length;
    const moved = [cell];
    const probe = this.grid.takeMod(x, y);
    const orphans = this.grid.orphans();
    // Места должно хватить на всех: иначе отменяем.
    if (free < 1 + orphans.length) {
      this.grid.placeMod(probe, x, y);
      return false;
    }
    this.storage.add(probe);
    for (const o of orphans) this.storage.add(this.grid.takeMod(o.x, o.y));
    void moved;
    this.sel = null;
    this.rebuild();
    return true;
  }

  /**
   * Перенести мод с одной клетки поля на другую без хранилища. Моды, которые держались только на нём,
   * уходят в хранилище (если места нет или новое место не подходит, ничего не меняется).
   */
  moveOnField(fx, fy, tx, ty) {
    const from = this.grid.cell(fx, fy);
    const to = this.grid.cell(tx, ty);
    if (!from || !from.mod || !to || to.core || to.mod || (fx === tx && fy === ty)) return false;
    const mod = this.grid.takeMod(fx, fy);
    const orphans = this.grid.orphans();
    const free = this.storage.slots.filter((x) => x === null).length;
    if (free < orphans.length || !canPlace(this.grid, mod.def, tx, ty).ok) {
      this.grid.placeMod(mod, fx, fy);
      return false;
    }
    for (const o of orphans) this.storage.add(this.grid.takeMod(o.x, o.y));
    this.grid.placeMod(mod, tx, ty);
    this.sel = { kind: 'placed', x: tx, y: ty };
    this.rebuild();
    return true;
  }

  /** Подсветка для выбранного мода: у мода на поле считается так, будто он уже снят (его можно переставить). */
  highlightFor(sel, mod) {
    if (sel.kind === 'shelf') return highlight(this.grid, mod.def);
    const taken = this.grid.takeMod(sel.x, sel.y);
    const hl = highlight(this.grid, taken.def);
    this.grid.placeMod(taken, sel.x, sel.y);
    hl.targets = hl.targets.filter((c) => !(c.x === sel.x && c.y === sel.y));
    return hl;
  }

  /* ---------- Выбор ---------- */

  select(sel) {
    const same = this.sel && sel && this.sel.kind === sel.kind && this.sel.id === sel.id && this.sel.index === sel.index && this.sel.x === sel.x && this.sel.y === sel.y;
    this.sel = same && sel.kind === 'core' ? null : sel;
    this.refresh();
  }

  /** Описание мода у текущего выбора (из хранилища или с поля) или null. */
  selectedMod() {
    const s = this.sel;
    if (!s) return null;
    if (s.kind === 'shelf') return this.storage.slots[s.index];
    if (s.kind === 'placed') {
      const c = this.grid.cell(s.x, s.y);
      return c ? c.mod : null;
    }
    return null;
  }

  /* ---------- Рисование ---------- */

  /** Пересобрать хранилище и поле (структура изменилась: новый размер, расстановка, мод встал/ушёл). */
  rebuild() {
    const g = this.grid;
    if (this.sel && this.sel.kind === 'core' && !g.coreById(this.sel.id)) this.sel = null;
    if (this.sel && this.sel.kind !== 'core' && !this.selectedMod()) this.sel = null;
    if (this.wrap.style) this.wrap.style.setProperty('--n', String(g.size));
    this.wrap.setAttribute('data-size', String(g.size));

    clear(this.shelf);
    this.slotEls = [];
    this.storage.slots.forEach((mod, i) => {
      const el = h('div', { class: 'slot-cell', 'data-slot': String(i) });
      if (mod) {
        el.classList.toggle('has', true);
        el.setAttribute('data-mod', mod.key);
        el.append(piece(tileOfMod(mod.key, mod.def), mod.def.icon));
        this.attachDrag(el, { from: 'shelf', index: i }, mod, () => this.select({ kind: 'shelf', index: i }));
      }
      this.slotEls.push(el);
      this.shelf.append(el);
    });

    clear(this.board);
    this.board.append(slab());
    this.cellEls = [];
    for (const c of g.cells) {
      const el = h('button', {
        type: 'button', class: 'cell', 'data-x': String(c.x), 'data-y': String(c.y),
        'aria-label': c.core ? c.core.def.name : c.mod ? c.mod.def.name : 'Пустая клетка',
      });
      if (c.core) {
        el.classList.toggle('core', true);
        el.setAttribute('data-core', c.core.id);
        el.append(piece(tileOfCore(c.core.id), c.core.def.icon));
        el.addEventListener('click', () => this.select({ kind: 'core', id: c.core.id }));
      } else if (c.mod) {
        el.classList.toggle('mod', true);
        el.setAttribute('data-mod', c.mod.key);
        el.append(piece(tileOfMod(c.mod.key, c.mod.def), c.mod.def.icon));
        this.attachDrag(el, { from: 'placed', x: c.x, y: c.y }, c.mod, () => this.select({ kind: 'placed', x: c.x, y: c.y }));
      } else {
        el.addEventListener('click', () => this.tapEmpty(c.x, c.y));
      }
      this.cellEls.push(el);
      this.board.append(el);
    }
    this.refresh();
  }

  tapEmpty(x, y) {
    if (this.sel && this.sel.kind === 'shelf' && this.placeFromShelf(this.sel.index, x, y)) return;
    if (this.sel && this.sel.kind === 'placed' && this.moveOnField(this.sel.x, this.sel.y, x, y)) return;
    this.sel = null;
    this.refresh();
  }

  /** Подсветка и карточка по текущему выбору (без пересборки: элементы под пальцем остаются). */
  refresh() {
    const g = this.grid;
    const mod = this.selectedMod();
    const sel = this.sel;
    // Куда выбранный мод можно прикрепить (и из хранилища, и с поля).
    const hl = mod ? this.highlightFor(sel, mod) : null;
    const targets = new Set(hl ? hl.targets.map((c) => c.y * g.size + c.x) : []);
    const faces = new Map();
    if (hl) for (const f of hl.faces) faces.set(f.y * g.size + f.x, (faces.get(f.y * g.size + f.x) || []).concat(f));
    this.cellEls.forEach((el, i) => {
      const c = g.cells[i];
      el.classList.toggle('selected', (!!c.core && sel && sel.kind === 'core' && sel.id === c.core.id) || (!!c.mod && sel && sel.kind === 'placed' && sel.x === c.x && sel.y === c.y));
      el.classList.toggle('target', targets.has(i));
      for (const d of ['t', 'r', 'b', 'l']) {
        el.classList.toggle('fg-' + d, false);
        el.classList.toggle('fr-' + d, false);
      }
      for (const f of faces.get(i) || []) el.classList.toggle((f.kind === 'ok' ? 'fg-' : 'fr-') + f.dir, true);
    });
    this.slotEls.forEach((el, i) => el.classList.toggle('selected', !!sel && sel.kind === 'shelf' && sel.index === i));

    clear(this.info);
    if (mod) {
      this.info.append(h('h3', { class: 'mod-title' }, mod.def.name), h('p', { class: 'mod-desc' }, mod.def.description));
      this.info.append(h('p', { class: 'hint' }, sel.kind === 'shelf'
        ? 'Перетащи на поле или нажми на зелёную клетку. Красные грани: ядру не подходит'
        : 'Перетащи на другое место или в хранилище. Красные грани: не подходит'));
      if (sel.kind !== 'shelf') {
        this.info.append(h('button', {
          id: 'mod-return', type: 'button', class: 'small', onclick: () => this.returnToShelf(sel.x, sel.y),
        }, 'В хранилище'));
      }
      return;
    }
    const core = sel && sel.kind === 'core' ? g.coreById(sel.id) : null;
    if (!core) {
      this.info.append(h('p', { class: 'hint' }, 'Нажми на ядро или мод, чтобы увидеть данные'));
      return;
    }
    this.info.append(h('h3', {}, core.def.name));
    for (const s of coreStats(core, this.config, g.modifiersFor(core.id))) {
      const val = h('b', {}, s.text);
      if (s.bonus) val.append(h('em', {}, ' ' + s.bonus));
      this.info.append(h('div', { class: 'stat' }, h('span', {}, s.label), val));
    }
  }

  /* ---------- Перетаскивание ---------- */

  /**
   * Нажатие выбирает мод; сдвиг пальца больше DRAG_START_PX начинает перетаскивание.
   * Отпускание над клеткой поля (из хранилища) или над рядом хранилища (с поля) выполняет действие.
   */
  attachDrag(el, src, mod, onSelect) {
    let start = null;
    let ghost = null;
    const finish = (e, cancelled) => {
      if (!start) return;
      const wasDrag = start.drag;
      start = null;
      if (ghost && ghost.remove) ghost.remove();
      ghost = null;
      if (!wasDrag || cancelled || typeof document.elementFromPoint !== 'function') return;
      this.suppressClick = true;
      let t = document.elementFromPoint(e.clientX, e.clientY);
      while (t && !(t.classList && (t.classList.contains('cell') || t.classList.contains('shelf')))) t = t.parentElement;
      if (!t) return;
      if (src.from === 'shelf' && t.classList.contains('cell')) {
        this.placeFromShelf(src.index, +t.getAttribute('data-x'), +t.getAttribute('data-y'));
      } else if (src.from === 'placed' && t.classList.contains('cell')) {
        this.moveOnField(src.x, src.y, +t.getAttribute('data-x'), +t.getAttribute('data-y'));
      } else if (src.from === 'placed' && t.classList.contains('shelf')) {
        this.returnToShelf(src.x, src.y);
      }
    };
    el.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      start = { x: e.clientX, y: e.clientY, drag: false };
      if (el.setPointerCapture && e.pointerId !== undefined) {
        try { el.setPointerCapture(e.pointerId); } catch (err) { /* не критично */ }
      }
      onSelect();
    });
    el.addEventListener('pointermove', (e) => {
      if (!start) return;
      if (!start.drag && Math.hypot(e.clientX - start.x, e.clientY - start.y) > DRAG_START_PX) {
        start.drag = true;
        ghost = h('div', { class: 'drag-ghost' }, piece(tileOfMod(mod.key, mod.def), mod.def.icon));
        if (document.body) document.body.append(ghost);
      }
      if (ghost && ghost.style) ghost.style.transform = 'translate(' + (e.clientX - 24) + 'px,' + (e.clientY - 24) + 'px)';
    });
    el.addEventListener('pointerup', (e) => finish(e, false));
    el.addEventListener('pointercancel', (e) => finish(e, true));
  }
}
