// Стартовый экран: сцена у костра (вектор, низкий полигон) и меню. Выбор режима:
// «Играть»: только игровой интерфейс, как у настоящего игрока.
// «Тестирование»: панель отладки, ползунки, FPS, краш-тест, как раньше.
import { h, svg } from './ui_dom.js';

const poly = (points, fill, extra) => svg('polygon', Object.assign({ points, fill }, extra));
const grad = (id, kind, attrs, stops) =>
  svg(kind, Object.assign({ id }, attrs), ...stops.map(([o, c, a]) => svg('stop', { offset: o, 'stop-color': c, 'stop-opacity': a === undefined ? 1 : a })));

/** Рисует всю сцену в координатах 390×844; preserveAspectRatio=slice подрезает её под любой экран. */
function buildScene(rnd) {
  const defs = svg('defs', {},
    grad('sg-sky', 'linearGradient', { x1: 0, y1: 0, x2: 0, y2: 1 }, [[0, '#101930'], [0.5, '#1e2d4f'], [1, '#2c3f69']]),
    grad('sg-ground', 'linearGradient', { x1: 0, y1: 0, x2: 0, y2: 1 }, [[0, '#2f3d60'], [0.45, '#52658c'], [1, '#33436a']]),
    grad('sg-fire', 'radialGradient', { cx: 0.5, cy: 0.5, r: 0.5 }, [[0, '#ffb35a', 0.62], [0.45, '#ff8a2e', 0.2], [1, '#ff7a1c', 0]]),
    grad('sg-crystal', 'radialGradient', { cx: 0.5, cy: 0.5, r: 0.5 }, [[0, '#9fdcff', 0.8], [0.4, '#4a8fff', 0.25], [1, '#3a7bff', 0]]),
    grad('sg-vignette', 'radialGradient', { cx: 0.5, cy: 0.5, r: 0.75 }, [[0.55, '#050914', 0], [1, '#050914', 0.62]]),
    grad('sg-title', 'linearGradient', { x1: 0, y1: 0, x2: 0, y2: 1 }, [[0, '#ffffff'], [1, '#9db9e3']]));
  const g = svg('g', {});
  g.append(
    svg('rect', { width: 390, height: 844, fill: 'url(#sg-sky)' }),
    // дальняя гора справа
    poly('203,505 250,330 302,187 350,300 390,330 390,505', '#2a3a5e', { opacity: 0.85 }),
    poly('302,187 350,300 390,330 390,420 318,330', '#374973', { opacity: 0.9 }),
    poly('302,187 262,300 250,330 288,380 318,330', '#1d2b4a', { opacity: 0.8 }),
    svg('ellipse', { cx: 300, cy: 190, rx: 190, ry: 150, fill: '#7f9fe0', opacity: 0.08 }),
    // левый утёс: тёмные грани и снежные карнизы
    poly('0,15 36,0 78,40 100,130 140,170 170,270 199,330 200,530 0,540', '#0c1429'),
    poly('36,0 78,40 62,100 20,80', '#19274a'),
    poly('78,40 100,130 70,160 62,100', '#1f3059'),
    poly('100,130 140,170 170,270 120,250 70,160', '#111c38'),
    poly('0,150 50,138 110,170 80,190 0,200', '#54698f', { opacity: 0.55 }),
    poly('110,230 170,270 199,330 150,320 100,270', '#5b7099', { opacity: 0.5 }),
    poly('0,330 90,300 180,360 199,430 0,430', '#16223f', { opacity: 0.9 }),
    poly('0,330 90,300 110,320 20,350', '#6a7fa6', { opacity: 0.45 }),
    // снег
    poly('0,548 130,538 240,548 390,528 390,844 0,844', 'url(#sg-ground)'),
    poly('0,600 140,566 210,640 120,700 0,690', '#4a5d85', { opacity: 0.55 }),
    poly('210,640 390,580 390,720 300,760', '#62759f', { opacity: 0.5 }),
    poly('0,730 150,760 220,844 0,844', '#475a82', { opacity: 0.55 }),
    poly('230,700 390,740 390,844 260,844', '#3a4b73', { opacity: 0.6 }),
  );

  // Фургон
  g.append(
    poly('17,420 52,364 120,352 190,372 203,420 203,490 17,500', '#4b5169'),
    poly('52,364 120,352 190,372 203,420 120,396 40,410', '#6a7088', { opacity: 0.75 }),
    poly('17,480 203,474 203,552 17,560', '#1a1c2a'),
    poly('17,480 60,478 40,560 17,560', '#242738'),
    svg('circle', { cx: 166, cy: 515, r: 34, fill: 'none', stroke: '#2c2735', 'stroke-width': 5 }),
    svg('circle', { cx: 166, cy: 515, r: 6, fill: '#2c2735' }),
    svg('path', { d: 'M166 481v68M132 515h68M142 491l48 48M190 491l-48 48', stroke: '#2c2735', 'stroke-width': 2.4, fill: 'none' }),
    svg('rect', { x: 192, y: 412, width: 7, height: 14, fill: '#14161f' }),
    svg('circle', { cx: 195.5, cy: 420, r: 18, fill: 'url(#sg-fire)', opacity: 0.8 }),
    svg('circle', { cx: 195.5, cy: 420, r: 2.2, fill: '#ffd79a' }),
  );

  // Тепло костра на снегу
  g.append(svg('ellipse', { class: 'fire-glow', cx: 250, cy: 636, rx: 250, ry: 200, fill: 'url(#sg-fire)' }));

  // Пенёк, маг и кот: крупнее и светлее, чтобы читались. Холодный свет сверху-слева, тёплый от костра справа.
  const wiz = svg('g', { transform: 'translate(60 712) scale(1.32) translate(-60 -712)' });
  wiz.append(
    poly('62,640 170,632 176,706 58,712', '#2b2333'),
    poly('62,640 170,632 176,652 62,660', '#4a3b50'),
    poly('150,634 170,632 176,706 160,708', '#6b4638', { opacity: 0.55 }),
    // посох: светлое дерево и кристалл с сильным свечением
    svg('line', { x1: 66, y1: 430, x2: 72, y2: 604, stroke: '#7a5f49', 'stroke-width': 3.6, 'stroke-linecap': 'round' }),
    svg('circle', { cx: 62, cy: 416, r: 54, fill: 'url(#sg-crystal)' }),
    poly('62,388 72,412 62,440 52,412', '#8fd0ff'),
    poly('62,388 72,412 62,416', '#f2fbff'),
    poly('62,416 72,412 62,440', '#5aa6f0'),
    // плащ: грани, холодный верх и тёплая кромка со стороны костра
    poly('60,648 66,576 84,530 112,520 132,548 144,604 156,648', '#1b2850'),
    poly('84,530 112,520 100,566 70,582', '#2c4079'),
    poly('66,576 70,582 100,566 96,610 62,640', '#233562'),
    poly('100,566 132,548 144,604 120,616 96,610', '#16213f'),
    poly('132,548 144,604 156,648 146,648 138,606 128,556', '#e0864a', { opacity: 0.7 }),
    poly('112,520 132,548 128,556 108,530', '#ffb06a', { opacity: 0.45 }),
    // голова: лицо в тени капюшона и тёплая щека, шляпа
    poly('100,500 122,500 126,530 106,538 98,520', '#0e1630'),
    poly('116,512 126,520 124,532 114,534', '#d79468', { opacity: 0.8 }),
    poly('92,502 106,448 120,500', '#223260'),
    poly('106,448 120,500 108,500', '#34498a'),
    poly('66,506 100,490 146,500 108,516', '#2b3d78'),
    poly('66,506 100,490 108,516', '#1a2750'),
    poly('92,502 120,500 124,506 90,508', '#ffb06a', { opacity: 0.5 }),
    // кот
    poly('128,632 131,604 138,588 152,586 157,606 160,632 172,640 148,644', '#8fa9ec'),
    poly('138,588 152,586 157,606 144,608', '#bcd0fa', { opacity: 0.85 }),
    poly('133,588 137,568 145,575 152,570 156,588 146,596', '#a9c0f4'),
    svg('circle', { cx: 141, cy: 584, r: 1.9, fill: '#b8f2ff' }),
    svg('circle', { cx: 149, cy: 584, r: 1.9, fill: '#b8f2ff' }),
    svg('path', { d: 'M160 632c14 4 20-6 14-14', stroke: '#8fa9ec', 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round' }),
  );
  g.append(wiz);

  // Костёр: камни, брёвна, пламя
  const fire = svg('g', { transform: 'translate(52 0)' });
  fire.append(
    poly('206,648 240,636 256,648 232,658', '#1b233a'),
    poly('206,648 240,636 232,646', '#34456b'),
    poly('250,652 276,644 290,656 262,664', '#18203a'),
    poly('252,652 276,644 270,652', '#33446a'),
    poly('176,642 230,628 238,640 180,652', '#4a3434'),
    poly('186,634 222,648 214,654 180,642', '#2a1e22'),
    svg('polygon', { class: 'flame', points: '174,636 180,604 192,616 198,574 210,610 220,598 230,636', fill: '#ff7a1c' }),
    svg('polygon', { class: 'flame b', points: '182,636 190,614 198,592 206,614 216,636', fill: '#ffab3d' }),
    svg('polygon', { class: 'flame', points: '190,636 198,612 208,636', fill: '#ffe7a0' }),
  );
  g.append(fire);

  // Передние камни, ветки, виньетка
  g.append(
    poly('0,742 90,726 170,790 130,844 0,844', '#0d152b'),
    poly('0,742 60,732 40,770 0,780', '#1d2c50'),
    poly('0,742 60,732 30,748', '#7a8fb4', { opacity: 0.6 }),
    poly('280,700 300,690 312,704 290,712', '#1d2a4a'),
    poly('280,700 300,690 292,704', '#4b5f8c'),
    poly('340,650 358,642 370,656 350,662', '#1d2a4a'),
    poly('340,650 358,642 350,656', '#4b5f8c'),
    poly('300,844 336,790 390,770 390,844', '#0f182f'),
    poly('336,790 390,770 380,792', '#6a7fa6', { opacity: 0.5 }),
    svg('path', { d: 'M18 700l10-22m-10 22l-12-14m22 4l12-10m-12 10l4 22', stroke: '#0a1020', 'stroke-width': 2, fill: 'none', 'stroke-linecap': 'round' }),
    svg('path', { d: 'M350 730l-6-20m6 20l12-12m-12 12l-14-6', stroke: '#0a1020', 'stroke-width': 2, fill: 'none', 'stroke-linecap': 'round' }),
    svg('rect', { width: 390, height: 844, fill: 'url(#sg-vignette)' }),
  );

  // Искры над костром и снегопад
  for (let i = 0; i < 6; i++) {
    g.append(svg('circle', {
      class: 'ember', cx: (242 + rnd() * 24).toFixed(1), cy: 596, r: (0.8 + rnd() * 0.9).toFixed(2), fill: '#ffc36b',
      style: 'animation-duration:' + (1.6 + rnd() * 1.6).toFixed(1) + 's;animation-delay:-' + (rnd() * 3).toFixed(1) + 's',
    }));
  }
  for (let i = 0; i < 26; i++) {
    const r = 0.7 + rnd() * 1.6;
    g.append(svg('circle', {
      class: 'flake', cx: (rnd() * 430).toFixed(1), cy: 0, r: r.toFixed(2),
      style: 'animation-duration:' + (7 + rnd() * 9).toFixed(1) + 's;animation-delay:-' + (rnd() * 14).toFixed(1) + 's;opacity:' + (0.4 + r / 3).toFixed(2),
    }));
  }
  return svg('svg', { class: 'scene', viewBox: '0 0 390 844', preserveAspectRatio: 'xMidYMid slice', 'aria-hidden': 'true' }, defs, g);
}

/** Логотип: слово разрезано шипом посередине, по краям тонкие линии. */
function buildLogo() {
  const font = 'font-family:var(--serif);font-weight:500;letter-spacing:5px';
  const spike = (dir) => svg('path', { d: 'M200 ' + (75 - dir * 70) + 'L201.4 ' + (75 - dir * 38) + 'L200 ' + (75 - dir * 12) + 'L198.6 ' + (75 - dir * 38) + 'Z', fill: '#dce8fb' });
  return svg('svg', { class: 'logo', viewBox: '-20 0 440 150', 'aria-label': 'SoulsGate' },
    svg('text', { x: 186, y: 90, 'text-anchor': 'end', 'font-size': 44, fill: 'url(#sg-title)', style: font }, 'SOULS'),
    svg('text', { x: 216, y: 90, 'text-anchor': 'start', 'font-size': 44, fill: 'url(#sg-title)', style: font }, 'GATE'),
    spike(1), spike(-1),
    svg('path', { d: 'M-16 78h28M388 78h28', stroke: '#cfe0f8', 'stroke-width': 1, opacity: 0.55 }),
    svg('path', { d: 'M108 118h80M212 118h80', stroke: '#cfe0f8', 'stroke-width': 1, opacity: 0.4 }),
    svg('path', { d: 'M200 114l4 4-4 4-4-4z', fill: 'none', stroke: '#cfe0f8', 'stroke-width': 1, opacity: 0.7 }));
}

export class ModeScreen {
  /** onPick(mode): 'game' | 'test' */
  constructor(root, onPick) {
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; // сцена одна и та же при каждом запуске
    const logo = buildLogo();
    // Градиенты для заголовка лежат в defs сцены: SVG-документ общий, ссылки по id работают.
    this.el = h('div', { id: 'mode-screen', hidden: '' },
      buildScene(rnd), logo,
      h('div', { class: 'menu' },
        h('button', { id: 'mode-game', class: 'ui-btn', type: 'button', onclick: () => onPick('game') }, 'Играть'),
        h('button', { id: 'mode-test', class: 'ui-btn secondary', type: 'button', onclick: () => onPick('test') }, 'Тестирование')));
    root.append(this.el);
  }

  show() {
    this.el.hidden = false;
  }

  hide() {
    this.el.hidden = true;
  }

  get visible() {
    return !this.el.hidden;
  }
}
