// Иконки ядер: маленькие SVG-фигуры без картинок. Имя иконки задаёт запись ядра в config.cores.
import { svg } from './ui_dom.js';

const ICONS = {
  // Снаряд: яркий шарик со следом.
  bolt: [
    ['circle', { cx: 21, cy: 16, r: 5.5, fill: 'currentColor' }],
    ['path', { d: 'M4 16h8M7 11h6M7 21h6', stroke: 'currentColor', 'stroke-width': 2.4, 'stroke-linecap': 'round', fill: 'none' }],
  ],
  // Щит.
  shield: [
    ['path', { d: 'M16 4 27 8v8c0 7-5 11-11 13C10 27 5 23 5 16V8z', fill: 'none', stroke: 'currentColor', 'stroke-width': 2.4, 'stroke-linejoin': 'round' }],
    ['path', { d: 'M16 9v15M10 14h12', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', fill: 'none' }],
  ],
  // Х2: надпись.
  x2: [
    ['text', { x: 16, y: 23, 'text-anchor': 'middle', 'font-size': 19, 'font-weight': 800, fill: 'currentColor', 'font-family': 'sans-serif' }, '×2'],
  ],
  // Х3: надпись.
  x3: [
    ['text', { x: 16, y: 23, 'text-anchor': 'middle', 'font-size': 19, 'font-weight': 800, fill: 'currentColor', 'font-family': 'sans-serif' }, '×3'],
  ],
  // Мороз: снежинка.
  snow: [
    ['path', { d: 'M16 4v24M6 10l20 12M6 22l20-12', stroke: 'currentColor', 'stroke-width': 2.6, 'stroke-linecap': 'round', fill: 'none' }],
  ],
  // Пробитие: стрела, пронзающая кружок.
  pierce: [
    ['circle', { cx: 17, cy: 16, r: 7, fill: 'none', stroke: 'currentColor', 'stroke-width': 2.2 }],
    ['path', { d: 'M3 16h26M23 10l6 6-6 6', stroke: 'currentColor', 'stroke-width': 2.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', fill: 'none' }],
  ],
  // Огненный рывок: стрелка рывка с пламенем.
  firedash: [
    ['path', { d: 'M3 22h18M15 16l6 6-6 6', stroke: 'currentColor', 'stroke-width': 2.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', fill: 'none' }],
    ['path', { d: 'M23 4c1 4 5 6 5 11a6 6 0 0 1-12 0c0-3 2-4 2-7 2 1 3 2 3 4 1-2 2-5 2-8z', fill: 'currentColor' }],
  ],
  // Смертельная аура: кольца вокруг центра.
  aura: [
    ['circle', { cx: 16, cy: 16, r: 3.2, fill: 'currentColor' }],
    ['circle', { cx: 16, cy: 16, r: 8, fill: 'none', stroke: 'currentColor', 'stroke-width': 2 }],
    ['circle', { cx: 16, cy: 16, r: 13, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6, 'stroke-dasharray': '3 3' }],
  ],
  // Фантомный выстрел: снаряд и его бледная копия.
  phantom: [
    ['circle', { cx: 11, cy: 16, r: 5, fill: 'currentColor' }],
    ['circle', { cx: 23, cy: 16, r: 5, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-dasharray': '3 2.5' }],
    ['path', { d: 'M16.5 16h1', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round' }],
  ],
  // Дробь: веер точек.
  shot: [
    ['circle', { cx: 8, cy: 16, r: 2.6, fill: 'currentColor' }],
    ['circle', { cx: 18, cy: 8, r: 2.4, fill: 'currentColor' }],
    ['circle', { cx: 18, cy: 16, r: 2.4, fill: 'currentColor' }],
    ['circle', { cx: 18, cy: 24, r: 2.4, fill: 'currentColor' }],
    ['circle', { cx: 26, cy: 4, r: 2, fill: 'currentColor' }],
    ['circle', { cx: 26, cy: 12, r: 2, fill: 'currentColor' }],
    ['circle', { cx: 26, cy: 20, r: 2, fill: 'currentColor' }],
    ['circle', { cx: 26, cy: 28, r: 2, fill: 'currentColor' }],
  ],
  // Спектральный клинок: треугольник.
  blades: [
    ['path', { d: 'M27 16 7 6l4 10-4 10z', fill: 'currentColor' }],
  ],
  // Лазер: луч с искрами.
  laser: [
    ['path', { d: 'M3 16h26', stroke: 'currentColor', 'stroke-width': 4.5, 'stroke-linecap': 'round', fill: 'none' }],
    ['path', { d: 'M9 8l3 4M16 6v5M23 8l-3 4M9 24l3-4M16 26v-5M23 24l-3-4', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', fill: 'none' }],
  ],
  // Горение: пламя.
  flame: [
    ['path', { d: 'M16 3c1 6 8 9 8 16a8 8 0 0 1-16 0c0-4 2-6 4-9 1 3 2 4 3 4 0-4-1-7 1-11z', fill: 'currentColor' }],
  ],
  // Ускорение: молния.
  haste: [
    ['path', { d: 'M19 3 8 18h7l-2 11 11-15h-7z', fill: 'currentColor' }],
  ],
  // Мощь: стрелка вверх.
  power: [
    ['path', { d: 'M16 4 6 16h7v11h6V16h7z', fill: 'currentColor' }],
  ],
};

export function icon(name) {
  const root = svg('svg', { viewBox: '0 0 32 32', class: 'icon-svg', 'aria-hidden': 'true' });
  for (const [tag, attrs, text] of ICONS[name] || []) root.append(text ? svg(tag, attrs, text) : svg(tag, attrs));
  return root;
}
