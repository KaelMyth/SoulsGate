// Значки ядер и модов: маленькие SVG-фигуры без картинок. Имя значка задаёт запись в config.cores и config.mods.
// Цвет значка и его свечение задаёт плитка (ui_stone.js, styles.css): основной цвет это currentColor, светлый акцент var(--hi).
// Каждый значок передаёт смысл мода и не похож на соседей: рост, скорость, огонь, холод, луч, веер, клинки, поле, призрак, пробой.
import { svg } from './ui_dom.js';

const S = (extra) => Object.assign({ stroke: 'currentColor', fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, extra);
const HI = { style: 'fill:var(--hi,#fff)' };
const HIS = { style: 'stroke:var(--hi,#fff)', fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
const spark = (x, y, r) => ['path', Object.assign({ d: 'M' + x + ' ' + (y - r) + 'L' + (x + r * 0.28) + ' ' + (y - r * 0.28) + 'L' + (x + r) + ' ' + y + 'L' + (x + r * 0.28) + ' ' + (y + r * 0.28) + 'L' + x + ' ' + (y + r) + 'L' + (x - r * 0.28) + ' ' + (y + r * 0.28) + 'L' + (x - r) + ' ' + y + 'L' + (x - r * 0.28) + ' ' + (y - r * 0.28) + 'Z' }, HI)];
const blade = (a) => ['g', { transform: 'rotate(' + a + ' 16 28)' }, [
  ['path', { d: 'M16 3L19.6 14L16 25L12.4 14Z', fill: 'currentColor' }],
  ['path', Object.assign({ d: 'M16 3L19.6 14L16 25Z', opacity: 0.45 }, HI)],
]];

const ICONS = {
  // Ядро «Снаряд»: сгусток энергии с хвостом кометы.
  bolt: [
    ['path', { d: 'M3 28L12.5 14.5L17 19Z', fill: 'currentColor', opacity: 0.5 }],
    ['path', S({ d: 'M2 22L9 17M7 29L13 23', 'stroke-width': 1.6, opacity: 0.6 })],
    ['circle', { cx: 21, cy: 11, r: 7.4, fill: 'currentColor' }],
    ['circle', Object.assign({ cx: 19, cy: 9, r: 3.1 }, HI)],
    spark(27, 24, 3.2),
  ],
  // Ядро «Щит»: геральдический щит с гранями и ребром.
  shield: [
    ['path', { d: 'M16 3L27 7V15C27 22 22.5 26.5 16 29C9.5 26.5 5 22 5 15V7Z', fill: 'currentColor' }],
    ['path', Object.assign({ d: 'M16 3V29C9.5 26.5 5 22 5 15V7Z', opacity: 0.38 }, HI)],
    ['path', S({ d: 'M16 7V25', 'stroke-width': 1.6, opacity: 0.55, style: 'stroke:var(--dark,#1a2236)' })],
    spark(16, 14, 3.4),
  ],
  // Гравитация: центральное ядро и уходящие наружу орбиты / линии ускорения.
  gravity: [
    // Спираль притяжения вокруг плотного ядра.
    ['path',S({d:'M27 10C22 2 9 4 5 13C0 23 13 32 23 25C29 21 28 13 22 10C17 7 10 12 12 18C13 22 19 23 21 19','stroke-width':2.4})],
    ['path',Object.assign({d:'M19 18C19 21 15 21 15 18C15 15 19 14 20 17Z'},HI)],
    ['path',S({d:'M2.5 11L5 13L8 12M23 25L26 25L27 21','stroke-width':1.8})],
    ['path',S({d:'M24 5H29M4 27H9','stroke-width':1.4,opacity:.58})]
  ],
  // Мощь: три шеврона, растущие вверх.
  power: [
    // Клинок пробивает броню вспышкой: усиление урона, не ускорение.
    ['path',{d:'M5 27L19 11L23 14L9 29L5 29Z',fill:'currentColor'}],
    ['path',Object.assign({d:'M18 8L21 4L28 11L25 15Z'},HI)],
    ['path',S({d:'M3 25L8 30M4 12L11 15M12 4L14 10M23 23L29 26','stroke-width':2.2})],
    spark(21,17,4.6)
  ],
  // Ускорение: секундомер с линиями скорости.
  haste: [
    ['circle', S({ cx: 17, cy: 18.5, r: 9, 'stroke-width': 2.6 })],
    ['path', S({ d: 'M14.5 3.5H19.5M17 3.5V9.5', 'stroke-width': 2.6 })],
    ['path', Object.assign({ d: 'M17 18.5V12.5', 'stroke-width': 2.4 }, HIS)],
    ['path', Object.assign({ d: 'M17 18.5L21 21', 'stroke-width': 2.4 }, HIS)],
    ['path', S({ d: 'M1.5 14H5.5M0.5 18.5H4.5M1.5 23H5.5', 'stroke-width': 1.8, opacity: 0.7 })],
    ['path', S({ d: 'M24.5 10L27 7.5', 'stroke-width': 2.4 })],
  ],
  // Горение: языки пламени с яркой сердцевиной.
  flame: [
    ['path', { d: 'M16 1.5C17.6 7 25.5 10.5 25.5 20A9.5 9.5 0 0 1 6.5 20C6.5 15.8 8.6 13 10.4 10.4C10.8 12.8 11.8 14 13 14.8C12.6 9.6 14.4 5.4 16 1.5Z', fill: 'currentColor' }],
    ['path', { d: 'M9.5 8.5C10.6 10 11 12 10.4 13.6C8.9 12.6 8.6 10.4 9.5 8.5Z', fill: 'currentColor', opacity: 0.7 }],
    ['path', Object.assign({ d: 'M16 13.5C17.4 16.8 21 18.4 21 22.4A5 5 0 0 1 11 22.4C11 19.6 14.2 18 16 13.5Z', opacity: 0.95 }, HI)],
    ['path', { d: 'M16 19C16.8 20.6 18.2 21.2 18.2 22.8A2.2 2.2 0 0 1 13.8 22.8C13.8 21.4 15.2 20.8 16 19Z', fill: 'currentColor', opacity: 0.55 }],
  ],
  // Мороз: снежинка с ответвлениями.
  snow: [
    ['g', {}, [
      ['path', S({ d: 'M16 3V29M4.7 9.5L27.3 22.5M4.7 22.5L27.3 9.5', 'stroke-width': 2.2 })],
      ['path', S({ d: 'M12.2 6.2L16 10L19.8 6.2M12.2 25.8L16 22L19.8 25.8', 'stroke-width': 1.8 })],
      ['path', S({ d: 'M5.4 13.2L10.5 12.6L9.6 7.6M26.6 18.8L21.5 19.4L22.4 24.4', 'stroke-width': 1.8 })],
      ['path', S({ d: 'M26.6 13.2L21.5 12.6L22.4 7.6M5.4 18.8L10.5 19.4L9.6 24.4', 'stroke-width': 1.8 })],
    ]],
    ['path', Object.assign({ d: 'M16 12L19.5 14L19.5 18L16 20L12.5 18L12.5 14Z' }, HI)],
  ],
  // Лазер: излучатель, луч и вспышка на конце.
  laser: [
    // Призма концентрирует один луч в точке поражения.
    ['path',{d:'M3 10L12 16L3 22Z',fill:'currentColor'}],
    ['path',Object.assign({d:'M5 14L10 16L5 18Z'},HI)],
    ['path',S({d:'M12 16H27','stroke-width':5,opacity:.34})],
    ['path',Object.assign({d:'M12 16H27','stroke-width':2.2},HIS)],
    ['circle',S({cx:26,cy:16,r:5,'stroke-width':1.5})],
    ['path',S({d:'M26 8V11M26 21V24M19 16H21M8 6L13 11M8 26L13 21','stroke-width':1.4})]
  ],
  // Дробь: веер дробинок из одной точки.
  shot: [
    // Один заряд распадается на пять дробинок.
    ['circle',{cx:5,cy:16,r:3.2,fill:'currentColor'}],
    ['path',S({d:'M9 16L20 4M9 16L25 10M9 16H26M9 16L25 22M9 16L20 28','stroke-width':1.5,opacity:.65})],
    ['circle',Object.assign({cx:22,cy:3,r:2.7},HI)],
    ['circle',{cx:27,cy:9,r:2.6,fill:'currentColor'}],
    ['circle',Object.assign({cx:29,cy:16,r:2.8},HI)],
    ['circle',{cx:27,cy:23,r:2.6,fill:'currentColor'}],
    ['circle',Object.assign({cx:22,cy:29,r:2.7},HI)]
  ],
  // Спектральные клинки: три клинка веером.
  blades: [blade(-36),blade(36),blade(0),
    ['path',S({d:'M8 28H24M16 25V30','stroke-width':2})],spark(16,6,2.2)],
  // Кинетический рывок: стрелка рывка и расходящиеся дуги удара.
  kinetic: [
    ['path', S({ d: 'M3 21H21M16 16L21.5 21L16 26', 'stroke-width': 3 })],
    ['path', S({ d: 'M22 9C25 12 25 18 22 21M26 5C31 10 31 20 26 25', 'stroke-width': 2, opacity: 0.8 })],
    ['path', S({ d: 'M3 15.5H9M6 10.5H10', 'stroke-width': 1.8, opacity: 0.6 })],
  ],
  // Магический дождь: облако и капли.
  rain: [
    ['path', S({ d: 'M9 17C5 17 3 14 3 11.5C3 8.5 5.5 6.5 8.5 7C9.5 3.5 13 2 16 2.5C19.5 3 21.5 5.5 22 8C25 8 28 10 28 13C28 15.5 26 17 23 17Z', 'stroke-width': 2.2 })],
    ['path', S({ d: 'M9 22L7 28M16 22L14 28M23 22L21 28', 'stroke-width': 2.4, opacity: 0.85 })],
  ],
  // Воплощение: парящая комета с тремя слоями хвоста и светлым ядром.
  incarnation: [
    ['path', { d: 'M2 27L12 14L15 21Z', fill: 'currentColor', opacity: 0.42 }],
    ['path', S({ d: 'M2.5 18L12 14M5 29L17 22M9 25L20 20', 'stroke-width': 1.8, opacity: 0.7 })],
    ['path', { d: 'M12 16C12 8.8 17 5 23 5C28 5 30 9 30 14C30 21 25 25 20 25C15 25 12 21 12 16Z', fill: 'currentColor' }],
    ['circle', Object.assign({ cx: 20, cy: 13, r: 4.5 }, HI)],
    spark(7, 7, 2.2),
  ],
  // Воодушевление: лучистая сфера, втягивающая маленькие кристаллы опыта.
  inspiration: [
    ['circle', S({ cx:16, cy:16, r:10.5, 'stroke-width':2.2 })],
    ['circle', S({ cx:16, cy:16, r:6.3, 'stroke-width':1.1, opacity:.5 })],
    ['path', S({ d:'M16 1.8V6M16 26V30.2M1.8 16H6M26 16H30.2M5.8 5.8L8.8 8.8M26.2 5.8L23.2 8.8M5.8 26.2L8.8 23.2M26.2 26.2L23.2 23.2', 'stroke-width':1.5 })],
    ['path', Object.assign({d:'M16 10L21.5 16L16 22L10.5 16Z'},HI)],
    spark(25,25,2.1),
  ],
  // Молния: зигзаг и искры.
  lightning: [
    ['path', { d: 'M19 2L7 18H15L12 30L25 12H17Z', fill: 'currentColor' }],
    ['path', S({ d: 'M26 5L28 8M5 24L3 27', 'stroke-width': 1.8, opacity: 0.7 })],
  ],
  // Скорость движения: крыло и полосы скорости.
  swift: [
    ['path', { d: 'M9 24C11 14 17 8 28 6C26 12 22 16 17 17C20 17 22 17.5 23 18C20 21 15 23 9 24Z', fill: 'currentColor' }],
    ['path', S({ d: 'M2 12H8M1 17H6M3 22H7', 'stroke-width': 2, opacity: 0.8 })],
  ],
  // Вампиризм: капля крови с клыком.
  vamp: [
    ['path', { d: 'M16 3C16 3 6.5 14 6.5 20A9.5 9.5 0 0 0 25.5 20C25.5 14 16 3 16 3Z', fill: 'currentColor' }],
    ['path', Object.assign({ d: 'M11 19L13 25L15 19ZM17 19L19 25L21 19Z' }, HI)],
  ],
  // Множитель опыта: камень со стрелкой вверх.
  xpmul: [
    ['path', { d: 'M16 9L24 16L16 29L8 16Z', fill: 'currentColor' }],
    ['path', S({ d: 'M16 2V8M12.5 5.5L16 2L19.5 5.5', 'stroke-width': 2.2 })],
    ['path', Object.assign({ d: 'M16 12L20 16L16 22L12 16Z' }, HI)],
  ],
  // Бонусное здоровье: сердце с плюсом.
  vitality: [
    ['path', { d: 'M16 28C16 28 3.5 20 3.5 11.5A6.5 6.5 0 0 1 16 9A6.5 6.5 0 0 1 28.5 11.5C28.5 20 16 28 16 28Z', fill: 'currentColor' }],
    ['path', Object.assign({ d: 'M14.6 12H17.4V14.6H20V17.4H17.4V20H14.6V17.4H12V14.6H14.6Z' }, HI)],
  ],
  // Дальность атаки: прицел.
  reach: [
    ['circle', S({ cx: 16, cy: 16, r: 9, 'stroke-width': 2.4 })],
    ['circle', { cx: 16, cy: 16, r: 2.6, fill: 'currentColor' }],
    ['path', S({ d: 'M16 2V8M16 24V30M2 16H8M24 16H30', 'stroke-width': 2.4 })],
  ],
  // Магнетизм: подкова с притягиваемыми точками.
  magnet: [
    ['path', S({ d: 'M8 5V15A8 8 0 0 0 24 15V5', 'stroke-width': 4.2 })],
    ['path', Object.assign({ d: 'M5.5 5H10.5V9H5.5ZM21.5 5H26.5V9H21.5Z' }, HI)],
    ['circle', { cx: 16, cy: 28, r: 1.7, fill: 'currentColor' }], ['circle', { cx: 11, cy: 27, r: 1.2, fill: 'currentColor', opacity: 0.7 }], ['circle', { cx: 21, cy: 27, r: 1.2, fill: 'currentColor', opacity: 0.7 }],
  ],
  // Смертельная аура: поле вокруг точки.
  aura: [
    // Герой и опоясывающие его опасные магические потоки.
    ['circle',{cx:16,cy:16,r:3.4,fill:'currentColor'}],
    ['circle',S({cx:16,cy:16,r:8.3,'stroke-width':1.7,opacity:.65})],
    ['path',S({d:'M16 3C23 1 31 8 29 16M28 20C24 29 14 32 7 26M4 22C-1 12 5 4 12 3','stroke-width':2.4})],
    ['path',Object.assign({d:'M24 4L29 8L30 2M7 26L3 22L2 28M28 19L29 23L26 25','stroke-width':1.6},HIS)],
    spark(16,16,2.2)
  ],
  // Поглощение: временный значок прицела с нарастающим кругом.
  absorption: [
    // Дымные объятия сходятся на душе в центре.
    ['path',S({d:'M23 6C14 0 5 7 6 13C-1 17 5 29 15 27C25 31 32 23 27 15C30 11 26 8 23 6Z','stroke-width':2.2,opacity:.8})],
    ['path',S({d:'M8 10C12 8 16 10 18 13M26 20C23 24 18 24 15 20M12 26C10 22 12 17 16 16','stroke-width':2.2})],
    ['path',Object.assign({d:'M19 11L18 13L14 13M22 24L19 22L20 18M12 20L16 16L11 15','stroke-width':1.8},HIS)],
    ['circle',{cx:17,cy:16,r:3.4,fill:'currentColor'}],
    ['circle',Object.assign({cx:17,cy:16,r:1.2},HI)]
  ],
  // Фантомный выстрел: призрак и его бледная копия.
  phantom: [
    // Явное двойное изображение одного призрака.
    ['path',S({d:'M14 29V13C14 5 29 5 29 13V29L25 25L22 29L18 25Z','stroke-width':1.7,'stroke-dasharray':'2.7 2.6',opacity:.65})],
    ['path',{d:'M3 28V14C3 6 19 6 19 14V28L15 25L11 29L7 25Z',fill:'currentColor'}],
    ['path',Object.assign({d:'M8 13V11C10 9 13 9 15 11V13Z',opacity:.55},HI)],
    ['circle',{cx:8,cy:17,r:1.5,style:'fill:var(--dark,#392b24)'}],
    ['circle',{cx:14.5,cy:17,r:1.5,style:'fill:var(--dark,#392b24)'}],
    spark(26,4,2.5)
  ],
  // Пробитие: стрела, пронзающая кольцо.
  pierce: [
    ['circle', S({ cx: 17, cy: 16, r: 8.5, 'stroke-width': 2.4, opacity: 0.8 })],
    ['path', S({ d: 'M3 16H27', 'stroke-width': 3 })],
    ['path', S({ d: 'M21 10L27.5 16L21 22', 'stroke-width': 3 })],
    ['circle', Object.assign({ cx: 25.5, cy: 16, r: 1.8 }, HI)],
  ],
  // Множители: число с искрой.
  x2: [
    ['text', { x: 15, y: 23.5, 'text-anchor': 'middle', 'font-size': 21, 'font-weight': 700, fill: 'currentColor', style: 'font-family:var(--serif)' }, '×2'],
    spark(27, 6, 3.6),
  ],
  x3: [
    ['text', { x: 15, y: 23.5, 'text-anchor': 'middle', 'font-size': 21, 'font-weight': 700, fill: 'currentColor', style: 'font-family:var(--serif)' }, '×3'],
    spark(27, 6, 3.6),
  ],
};

function build(parent, specs) {
  for (const [tag, attrs, rest] of specs) {
    if (Array.isArray(rest)) {
      const g = svg(tag, attrs);
      build(g, rest);
      parent.append(g);
    } else parent.append(rest ? svg(tag, attrs, rest) : svg(tag, attrs));
  }
}

export function icon(name) {
  const root = svg('svg', { viewBox: '0 0 32 32', class: 'icon-svg i-' + name, 'aria-hidden': 'true' });
  // Руническая гравировка по углам, не перекрывающая силуэт.
  build(root, [['path', {
    d:'M2 8V2H8M24 2H30V8M2 24V30H8M24 30H30V24',
    stroke:'var(--rune,#a08e71)',fill:'none','stroke-width':.7,opacity:.38
  }]]);
  build(root, ICONS[name] || []);
  return root;
}
