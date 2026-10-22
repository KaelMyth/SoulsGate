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
};

export function icon(name) {
  const root = svg('svg', { viewBox: '0 0 32 32', class: 'icon-svg', 'aria-hidden': 'true' });
  for (const [tag, attrs] of ICONS[name] || []) root.append(svg(tag, attrs));
  return root;
}
