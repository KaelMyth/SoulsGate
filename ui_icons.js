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
  // Мощь: три шеврона, растущие вверх.
  power: [
    ['path', S({ d: 'M6 27L16 17L26 27', 'stroke-width': 3.2, opacity: 0.45 })],
    ['path', S({ d: 'M6 19.5L16 9.5L26 19.5', 'stroke-width': 3.4, opacity: 0.75 })],
    ['path', S({ d: 'M8 12L16 4L24 12', 'stroke-width': 3.6 })],
    spark(26, 6, 3),
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
    ['path', { d: 'M2.5 16L7.5 10.5L12.5 16L7.5 21.5Z', fill: 'currentColor' }],
    ['path', S({ d: 'M12 16H24', 'stroke-width': 4.2, opacity: 0.55 })],
    ['path', Object.assign({ d: 'M12 16H24', 'stroke-width': 2 }, HIS)],
    spark(27, 16, 5.2),
    ['path', S({ d: 'M13 9L17 12M13 23L17 20', 'stroke-width': 1.6, opacity: 0.7 })],
  ],
  // Дробь: веер дробинок из одной точки.
  shot: [
    ['path', S({ d: 'M5 16L21 3M5 16L25 9M5 16H26M5 16L25 23M5 16L21 29', 'stroke-width': 1, opacity: 0.35 })],
    ['circle', { cx: 5, cy: 16, r: 2.6, fill: 'currentColor' }],
    ['circle', { cx: 15.9, cy: 10.9, r: 2.5, fill: 'currentColor' }], ['circle', { cx: 17, cy: 16, r: 2.5, fill: 'currentColor' }], ['circle', { cx: 15.9, cy: 21.1, r: 2.5, fill: 'currentColor' }],
    ['circle', Object.assign({ cx: 21.1, cy: 2.7, r: 2.1 }, HI)], ['circle', Object.assign({ cx: 24.7, cy: 8.9, r: 2.1 }, HI)], ['circle', Object.assign({ cx: 26.4, cy: 16, r: 2.1 }, HI)],
    ['circle', Object.assign({ cx: 24.7, cy: 23.1, r: 2.1 }, HI)], ['circle', Object.assign({ cx: 21.1, cy: 29.3, r: 2.1 }, HI)],
  ],
  // Спектральные клинки: три клинка веером.
  blades: [blade(-34), blade(34), blade(0), ['circle', { cx: 16, cy: 28, r: 2.2, fill: 'currentColor' }]],
  // Кинетический рывок: стрелка рывка и расходящиеся дуги удара.
  kinetic: [
    ['path', S({ d: 'M3 21H21M16 16L21.5 21L16 26', 'stroke-width': 3 })],
    ['path', S({ d: 'M22 9C25 12 25 18 22 21M26 5C31 10 31 20 26 25', 'stroke-width': 2, opacity: 0.8 })],
    ['path', S({ d: 'M3 15.5H9M6 10.5H10', 'stroke-width': 1.8, opacity: 0.6 })],
  ],
  // Молния: зигзаг и искры.
  lightning: [
    ['path', { d: 'M19 2L7 18H15L12 30L25 12H17Z', fill: 'currentColor' }],
    ['path', S({ d: 'M26 5L28 8M5 24L3 27', 'stroke-width': 1.8, opacity: 0.7 })],
  ],
  // Смертельная аура: поле вокруг точки.
  aura: [
    ['circle', { cx: 16, cy: 16, r: 3.4, fill: 'currentColor' }],
    ['circle', S({ cx: 16, cy: 16, r: 8, 'stroke-width': 2.2 })],
    ['circle', S({ cx: 16, cy: 16, r: 13, 'stroke-width': 1.6, 'stroke-dasharray': '2.5 3.2' })],
    ['path', Object.assign({ d: 'M16 1.5L18 4L16 6.5L14 4ZM30.5 16L28 18L25.5 16L28 14ZM16 30.5L14 28L16 25.5L18 28ZM1.5 16L4 14L6.5 16L4 18Z' }, HI)],
  ],
  // Фантомный выстрел: призрак и его бледная копия.
  phantom: [
    ['path', S({ d: 'M12 28V14.5A7.5 7.5 0 0 1 27 14.5V28L23.5 25L19.5 28L16 25Z', 'stroke-width': 1.6, 'stroke-dasharray': '2.4 2.4', opacity: 0.6 })],
    ['path', { d: 'M4 29V15.5A7.5 7.5 0 0 1 19 15.5V29L15.5 26L11.5 29L8 26Z', fill: 'currentColor' }],
    ['circle', { cx: 8.4, cy: 15.5, r: 1.7, style: 'fill:var(--dark,#1a2236)' }],
    ['circle', { cx: 14.6, cy: 15.5, r: 1.7, style: 'fill:var(--dark,#1a2236)' }],
    spark(26, 6, 3.4),
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
  build(root, ICONS[name] || []);
  return root;
}
