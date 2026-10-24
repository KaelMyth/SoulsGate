// Стартовый экран: сцена у костра, логотип и меню. Выбор режима:
// «Играть»: только игровой интерфейс, как у настоящего игрока.
// «Тестирование»: панель отладки, ползунки, FPS, краш-тест, как раньше.
// «Настройки», «Магазин» и «Выход» пока без действия: разделов в игре ещё нет, кнопки стоят по образцу.
import { h } from './ui_dom.js';
import { buildScene, buildLogo } from './ui_menu-scene.js';
import { MenuFx } from './ui_menu-fx.js';

export class ModeScreen {
  /** onPick(mode): 'game' | 'test' */
  constructor(root, onPick) {
    const idle = (id, text) => h('button', { id, class: 'ui-btn idle', type: 'button' }, text);
    this.fxCanvas = h('canvas', { class: 'fx' });
    this.stage = h('div', { class: 'stage' },
      buildScene(), buildLogo(),
      h('div', { class: 'menu' },
        h('button', { id: 'mode-game', class: 'ui-btn', type: 'button', onclick: () => onPick('game') }, 'Играть'),
        idle('menu-settings', 'Настройки'),
        idle('menu-shop', 'Магазин'),
        idle('menu-quit', 'Выход')),
      h('button', { id: 'mode-test', class: 'test-link', type: 'button', onclick: () => onPick('test') }, 'Тестирование'));
    this.el = h('div', { id: 'mode-screen', hidden: '' }, this.stage, this.fxCanvas);
    root.append(this.el);
    this.fx = new MenuFx(this.fxCanvas, this.stage);
  }

  show() {
    this.el.hidden = false;
    this.fx.start();
  }

  hide() {
    this.el.hidden = true;
    this.fx.stop();
  }

  get visible() {
    return !this.el.hidden;
  }
}
