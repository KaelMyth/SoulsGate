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
