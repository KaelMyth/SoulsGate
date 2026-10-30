// Стартовый экран: сцена у костра, логотип и меню. Выбор режима:
// «Играть»: только игровой интерфейс, как у настоящего игрока.
// «Тестирование»: панель отладки, ползунки, FPS, краш-тест, как раньше.
// «Настройки», «Магазин» и «Выход» пока без действия: разделов в игре ещё нет, кнопки стоят по образцу.
import { h } from './ui_dom.js';
import { buildScene, buildLogo } from './ui_menu-scene.js';
import { MenuFx } from './ui_menu-fx.js';

export class ModeScreen {
  /** onPick(mode): 'game' | 'test' */
  constructor(root, onPick, onSettings, onOracle) {
    this.fxCanvas = h('canvas', { class: 'fx' });
    const action=(id,text,fn)=>h('button',{
      id,class:'ui-btn',type:'button',onclick:fn
    },text);
    this.stage = h('div', { class: 'stage' },
      h('div', { class: 'reference-art', 'aria-hidden': 'true' }), buildLogo(),
      h('div', { class: 'menu', role: 'navigation', 'aria-label': 'Главное меню SoulGates' },
        action('mode-game','Играть',()=>onPick('game')),
        action('mode-test','Тестирование',()=>onPick('test')),
        action('mode-oracle','Оракл',()=>onOracle&&onOracle()),
        action('menu-settings','Настройки',()=>onSettings&&onSettings())
      ));
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
