// Отладочная панель: FPS, число объектов, ползунки параметров.
// Открывается кнопкой ⚙ (на компьютере ещё клавишей `). Игра при открытой панели не останавливается:
// ощущение настраивается на ходу.
import { getPath, setPath, formatValue, snapshot, saveOverrides } from './debug_tunables.js';
import { h } from './ui_dom.js';

export class DebugPanel {
  /**
   * @param o { root, config, defaults, tunables, bus, meter, getStats, storage, storageKey, build, actions }
   *   actions: [{ label, run }] — кнопки быстрых действий над ползунками (например, переход к боссу)
   *   getStats() -> { steps, objects, stick }
   */
  constructor(o) {
    this.o = o;
    this.rows = [];
    this.log = [];
    this.timer = null;

    this.button = h('button', { id: 'dbg-btn', type: 'button', 'aria-label': 'Отладка', onclick: () => this.toggle() }, '⚙');
    this.fpsLabel = h('div', { id: 'dbg-fps' }, 'FPS …');
    this.stats = h('pre', { id: 'dbg-stats' });
    this.copyBox = h('textarea', { id: 'dbg-copy', readonly: '', hidden: '' });
    this.panel = h('div', { id: 'dbg-panel', hidden: '' },
      h('h3', {}, 'Отладка · ' + o.build),
      this.stats,
      this.buildActions(),
      this.buildSliders(),
      h('div', { class: 'dbg-btns' },
        h('button', { type: 'button', onclick: () => o.meter.resetMin() }, 'Сбросить мин. FPS'),
        h('button', { type: 'button', onclick: () => this.copyParams() }, 'Скопировать параметры'),
        h('button', { type: 'button', onclick: () => this.resetParams() }, 'Сбросить параметры'),
      ),
      this.copyBox,
    );
    o.root.append(this.button, this.panel, this.fpsLabel);

    // FPS всегда на экране рядом с ⚙ (пока идёт настройка). Не мешает касаниям: pointer-events: none.
    const fpsTimer = setInterval(() => this.refreshFps(), 500);
    if (fpsTimer && fpsTimer.unref) fpsTimer.unref();

    // Последние события шины: видно, что «стик отпущен» действительно уходит в шину.
    o.bus.tap((name) => {
      this.log.push(name);
      if (this.log.length > 4) this.log.shift();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === '`') this.toggle();
    });
  }

  /** Кнопки быстрых действий: нажатие выполняет действие и закрывает панель, чтобы было видно результат. */
  buildActions() {
    const acts = this.o.actions || [];
    if (!acts.length) return h('div', {});
    const row = h('div', { class: 'dbg-btns' });
    for (const a of acts) {
      row.append(h('button', { type: 'button', onclick: () => { a.run(); this.toggle(); } }, a.label));
    }
    return row;
  }

  buildSliders() {
    const wrap = h('div', {});
    let group = null;
    let body = wrap; // ползунки лежат внутри раздела, раздел открывается нажатием на заголовок
    for (const def of this.o.tunables) {
      if (def.group && def.group !== group) {
        group = def.group;
        body = h('div', { class: 'dbg-body' });
        wrap.append(h('details', { class: 'dbg-sect' }, h('summary', { class: 'dbg-group' }, group), body));
      }
      const value = getPath(this.o.config, def.path);
      const valueEl = h('span', { class: 'val' }, formatValue(def, value));
      const input = h('input', {
        type: 'range',
        min: String(def.min),
        max: String(def.max),
        step: String(def.step),
        value: String(value),
      });
      input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        setPath(this.o.config, def.path, v);
        valueEl.textContent = formatValue(def, v);
        this.o.bus.emit('config:changed', { path: def.path, value: v });
      });
      input.addEventListener('change', () => this.save());
      body.append(h('div', { class: 'dbg-row' }, h('div', { class: 'top' }, h('span', {}, def.label), valueEl), input));
      this.rows.push({ def, input, valueEl });
    }
    return wrap;
  }

  save() {
    const o = this.o;
    saveOverrides(o.config, o.defaults, o.tunables, o.storage, o.storageKey);
  }

  refreshSliders() {
    for (const row of this.rows) {
      const v = getPath(this.o.config, row.def.path);
      row.input.value = String(v);
      row.valueEl.textContent = formatValue(row.def, v);
    }
  }

  resetParams() {
    for (const t of this.o.tunables) {
      const v = getPath(this.o.defaults, t.path);
      setPath(this.o.config, t.path, v);
      this.o.bus.emit('config:changed', { path: t.path, value: v });
    }
    this.refreshSliders();
    this.save();
  }

  copyParams() {
    const text = this.o.build + '\n' + JSON.stringify(snapshot(this.o.config, this.o.tunables), null, 1);
    this.copyBox.hidden = false;
    this.copyBox.value = text;
    this.copyBox.focus();
    this.copyBox.select();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    } else {
      try { document.execCommand('copy'); } catch (err) { /* ничего: текст виден в поле, можно скопировать вручную */ }
    }
  }

  /** Режим «Игра»: панель, кнопка ⚙ и FPS скрыты полностью. Режим «Тестирование»: всё как раньше. */
  setAvailable(on) {
    this.available = on;
    this.button.hidden = !on;
    this.fpsLabel.hidden = !on;
    if (!on && !this.panel.hidden) this.toggle();
  }

  toggle() {
    if (this.available === false) return;
    const open = this.panel.hidden;
    this.panel.hidden = !open;
    this.button.classList.toggle('on', open);
    if (open) {
      this.refreshStats();
      this.timer = setInterval(() => this.refreshStats(), 250);
    } else {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  refreshFps() {
    const m = this.o.meter;
    if (m.fps === 0) return; // первое окно замера ещё не накопилось
    const min = isFinite(m.minFps) ? Math.round(m.minFps) : '—';
    const text = 'FPS ' + Math.round(m.fps) + ' · мин ' + min;
    if (text !== this.fpsText) {
      this.fpsText = text;
      this.fpsLabel.textContent = text;
    }
  }

  refreshStats() {
    const m = this.o.meter;
    const s = this.o.getStats();
    const min = isFinite(m.minFps) ? m.minFps.toFixed(1) : '—';
    this.stats.textContent = [
      'FPS ' + m.fps.toFixed(1) + '   мин ' + min,
      'кадр ' + m.frameMs.toFixed(1) + ' мс   шагов/кадр ' + s.steps,
      'здоровье ' + s.hp + ' · убито ' + s.kills,
      'волна ' + s.wave + ' · живых врагов ' + s.enemies + ' / потолок ' + (s.cap || '—') + ' · проверок соседей ' + s.checks,
      s.crash ? 'краш-тест: ' + s.crash : 'краш-тест: просадки не было',
      'объектов в мире ' + s.objects + ' (враги ' + s.enemies + ', снаряды ' + s.shots + ', эффекты ' + s.effects + ')',
      'защита: ' + s.defense,
      'стик ' + s.stick,
      'события ' + (this.log.join(' · ') || '—'),
    ].join('\n');
  }
}
