// Материалы меню билда: плитки-основания для ядер и модов, каменная плита поля и подбор вида по редкости.
// Плитки лежат один раз в скрытом SVG-спрайте и подключаются через <use>: на экране их десятки, а рисунок один.
import { h, svg } from './ui_dom.js';
import { icon } from './ui_icons.js';

/** Вид плитки для мода: вторичные ядра имеют свой дизайн, остальные: камень, железо или золото по редкости. */
export function tileOfMod(key, def) {
  if (def && def.effect && def.effect.secondary) return 'dash-steel';
  const r = (def && def.rarity) || 'common';
  return r === 'legendary' ? 'gold' : r === 'rare' || r === 'epic' ? 'iron' : 'stone';
}

/** Вид плитки для ядра. */
export function tileOfCore(id) {
  return id === 'shield' ? 'core-shield' : id === 'projectile' ? 'core-bolt' : 'stone';
}

const RIM = '5,0 59,0 64,5 64,59 59,64 5,64 0,59 0,5';
const FIELD = '12,9 52,9 55,12 55,52 52,55 12,55 9,52 9,12';

const poly = (points, fill, extra) => svg('polygon', Object.assign({ points, fill }, extra));
const ln = (d, stroke, w, extra) => svg('path', Object.assign({ d, stroke, 'stroke-width': w, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, extra));
const stop = (o, c, a) => svg('stop', { offset: o, 'stop-color': c, 'stop-opacity': a === undefined ? 1 : a });
const lin = (id, a, b, ...stops) => svg('linearGradient', { id, x1: 0, y1: 0, x2: a, y2: b }, ...stops);

/** Рамка плитки: скос светлый слева-сверху, тёмный справа-снизу, вдавленное поле под значок. */
function frame(rim, light, dark, field, fieldEdge, mid) {
  return [
    poly(RIM, rim),
    ...(mid || []),
    ln('M5 1H59M1 5V59', light, 1.6, { opacity: 0.85 }),
    ln('M59 63H5M63 59V5', dark, 1.8, { opacity: 0.9 }),
    poly(FIELD, field),
    ln('M12 9.6H52M9.6 12V52', 'rgba(0,0,0,0.65)', 1.6),
    ln('M12 54.4H52M54.4 12V52', fieldEdge, 1.2, { opacity: 0.75 }),
  ];
}

function tileStone() {
  return svg('symbol', { id: 't-stone', viewBox: '0 0 64 64' },
    ...frame('#4a5671', '#93a3c6', '#161c2e', '#202839', '#7384aa', [
      poly('0,5 5,0 30,0 22,13 0,18', '#5a6886', { opacity: 0.9 }),
      poly('30,0 59,0 64,5 64,22 46,14 22,13', '#3c4760', { opacity: 0.9 }),
      poly('0,18 22,13 26,64 5,64 0,59', '#364058', { opacity: 0.85 }),
      poly('46,14 64,22 64,59 59,64 40,64 36,40', '#566380', { opacity: 0.8 }),
      ln('M22 13L16 22M46 14L52 24M26 64L30 56M64 40L56 44', '#12182a', 1.2, { opacity: 0.8 })]),
    ln('M2 30l6-2M56 6l5 2M30 60l5-1', '#9aa9ca', 1, { opacity: 0.35 }));
}

function tileIron() {
  const rivet = (x, y) => [svg('circle', { cx: x, cy: y, r: 2.4, fill: '#2b323d' }), svg('circle', { cx: x - 0.5, cy: y - 0.5, r: 1.5, fill: '#c3ced9' })];
  return svg('symbol', { id: 't-iron', viewBox: '0 0 64 64' },
    ...frame('#6b7684', '#e1ebf5', '#1b2029', '#1a212c', '#8fa2bb', [
      poly('0,5 5,0 59,0 64,5 64,12 0,26', '#8794a5', { opacity: 0.55 }),
      poly('0,50 64,34 64,59 59,64 5,64 0,59', '#434c59', { opacity: 0.65 }),
      ln('M3 3.5H61M3 6H61M3 58H61M3 60.5H61M3 15H8M56 15H61M3 49H8M56 49H61', '#ffffff', 0.7, { opacity: 0.2 })]),
    ...rivet(6.2, 6.2), ...rivet(57.8, 6.2), ...rivet(6.2, 57.8), ...rivet(57.8, 57.8),
    ln('M12 9.6H52', '#6fd6ff', 1, { opacity: 0.35 }));
}

function tileGold() {
  const gem = (x, y) => poly((x) + ',' + (y - 3) + ' ' + (x + 3) + ',' + y + ' ' + x + ',' + (y + 3) + ' ' + (x - 3) + ',' + y, '#fff3c0', { stroke: '#7a5a14', 'stroke-width': 0.8 });
  return svg('symbol', { id: 't-gold', viewBox: '0 0 64 64' },
    ...frame('#c39a34', '#fff1b8', '#4d3608', '#2c2209', '#e8c35c', [
      poly('0,5 5,0 59,0 64,5 64,14 0,28', '#f1d27a', { opacity: 0.6 }),
      poly('0,48 64,32 64,59 59,64 5,64 0,59', '#8a6518', { opacity: 0.6 }),
      ln('M3 20L20 3M44 61L61 44', '#fff6cf', 1, { opacity: 0.55 })]),
    ln('M13 10.5H51M10.5 13V51', '#ffe08a', 0.9, { opacity: 0.55 }),
    gem(5.4, 5.4), gem(58.6, 5.4), gem(5.4, 58.6), gem(58.6, 58.6));
}

function tileCoreBolt() {
  const crystal = (pts, a, b) => [poly(pts, a, { stroke: b, 'stroke-width': 0.8 })];
  return svg('symbol', { id: 't-core-bolt', viewBox: '0 0 64 64' },
    ...frame('#454f69', '#9fb0d4', '#141a2a', '#161d33', '#5d92d8', [
      poly('0,5 5,0 30,0 20,12 0,20', '#566384', { opacity: 0.85 }),
      poly('44,52 64,40 64,59 59,64 40,64', '#333d56', { opacity: 0.8 })]),
    ln('M12 40L26 32L32 20L44 26L52 14', '#4aa3ff', 1.5, { opacity: 0.85 }),
    ln('M10 22L22 24L30 40', '#4aa3ff', 1.1, { opacity: 0.6 }),
    // кристаллы, вросшие в рамку по сторонам света
    ...crystal('32,-1 37,7 32,13', '#5fb2ff', '#c7ecff'), ...crystal('32,-1 27,7 32,13', '#2f76d8', '#8fd0ff'),
    ...crystal('65,32 57,37 51,32', '#5fb2ff', '#c7ecff'), ...crystal('65,32 57,27 51,32', '#2f76d8', '#8fd0ff'),
    ...crystal('32,65 27,57 32,51', '#5fb2ff', '#c7ecff'), ...crystal('32,65 37,57 32,51', '#2f76d8', '#8fd0ff'),
    ...crystal('-1,32 7,27 13,32', '#5fb2ff', '#c7ecff'), ...crystal('-1,32 7,37 13,32', '#2f76d8', '#8fd0ff'));
}

function tileCoreShield() {
  const bolt = (x, y) => [svg('circle', { cx: x, cy: y, r: 2.3, fill: '#3a4049' }), svg('circle', { cx: x - 0.5, cy: y - 0.5, r: 1.4, fill: '#d2dae3' })];
  const planks = [];
  ['#7a5638', '#6a492f', '#80593a', '#5f432b', '#744f33', '#6a492f', '#7a5638', '#5f432b'].forEach((c, i) => planks.push(svg('rect', { x: i * 8, y: 0, width: 8, height: 64, fill: c })));
  return svg('symbol', { id: 't-core-shield', viewBox: '0 0 64 64' },
    svg('clipPath', { id: 'cp-wood' }, poly(RIM, '#000')),
    svg('g', { 'clip-path': 'url(#cp-wood)' }, ...planks,
      ln('M8 0V64M16 0V64M24 0V64M32 0V64M40 0V64M48 0V64M56 0V64', '#2a1b10', 0.9, { opacity: 0.7 }),
      ln('M3 10C12 7 20 13 30 9M34 40C44 37 52 43 61 39M4 52C12 50 18 55 28 52', '#3a2616', 0.8, { opacity: 0.55 })),
    // железная кайма
    poly(RIM, 'none', { stroke: '#8a95a3', 'stroke-width': 3.4 }),
    ln('M5 1.6H59M1.6 5V59', '#dfe8f1', 1, { opacity: 0.9 }),
    ln('M59 62.4H5M62.4 59V5', '#2a3039', 1.2, { opacity: 0.9 }),
    poly(FIELD, '#2a1c12'),
    poly(FIELD, 'none', { stroke: '#7d8794', 'stroke-width': 1.8 }),
    ln('M12 9.6H52M9.6 12V52', 'rgba(0,0,0,0.6)', 1.4),
    ...bolt(6, 6), ...bolt(58, 6), ...bolt(6, 58), ...bolt(58, 58));
}

/** Сталь с вплавленными крупинками: дизайн отдельный у огня и молнии. */
function tileDash(id, grains, glow, arcs) {
  const sp = [];
  const pts = [[8, 12], [15, 6], [26, 4], [38, 7], [50, 5], [58, 14], [58, 28], [57, 42], [52, 56], [40, 59], [27, 58], [14, 57], [6, 48], [5, 33], [6, 22], [20, 5], [44, 59], [58, 50]];
  pts.forEach(([x, y], i) => {
    const r = 0.9 + (i % 4) * 0.35;
    sp.push(svg('circle', { cx: x, cy: y, r: r * 2, fill: glow, opacity: 0.2 }), svg('circle', { cx: x, cy: y, r, fill: grains[i % grains.length] }));
  });
  const fieldGrains = [[14, 14], [49, 16], [18, 49], [47, 47]].map(([x, y], i) => svg('circle', { cx: x, cy: y, r: 1 + (i % 2) * 0.5, fill: grains[(i + 1) % grains.length], opacity: 0.85 }));
  return svg('symbol', { id, viewBox: '0 0 64 64' },
    ...frame('#59626f', '#d4dde8', '#1a1f28', '#171d27', '#7f92aa', [
      poly('0,5 5,0 59,0 64,5 64,16 0,30', '#7a8695', { opacity: 0.5 }),
      poly('0,50 64,36 64,59 59,64 5,64 0,59', '#3c444f', { opacity: 0.6 })]),
    ...(arcs ? [ln(arcs, grains[0], 1, { opacity: 0.8 })] : []),
    ...sp, ...fieldGrains);
}

let sprite = null;
/** Кладёт спрайт плиток в документ (один раз). */
function ensureSprite() {
  if (sprite || typeof document === 'undefined' || !document.body) return;
  sprite = svg('svg', { width: 0, height: 0, style: 'position:absolute', 'aria-hidden': 'true' },
    svg('defs', {}, tileStone(), tileIron(), tileGold(), tileCoreBolt(), tileCoreShield(),
      tileDash('t-dash-steel', ['#c3ced9', '#8fa2bb'], '#8fa2bb', '')));
  document.body.append(sprite);
}

/** Плитка-основание со значком: <div class="piece t-вид"> для ячейки поля, хранилища или перетаскивания. */
export function piece(tile, iconName, rarity = '') {
  ensureSprite();
  const t = svg('svg', { viewBox: '0 0 64 64', class: 'tile', 'aria-hidden': 'true' });
  t.append(svg('use', { href: '#t-' + tile }));
  return h('div', { class: 'piece t-' + tile + (rarity ? ' rarity-' + rarity : '') }, t, icon(iconName));
}

/** Каменная плита поля: грани, скошенные края и фаски по углам. Растягивается под размер, поэтому рисунок в процентах. */
export function slab() {
  const chip = '5,0 95,0 100,5 100,95 95,100 5,100 0,95 0,5';
  return svg('svg', { class: 'slab', viewBox: '0 0 100 100', preserveAspectRatio: 'none', 'aria-hidden': 'true' },
    svg('defs', {}, lin('sl-a', 1, 1, stop(0, '#4b587a'), stop(1, '#2a3350'))),
    poly(chip, 'url(#sl-a)'),
    poly('0,5 5,0 40,0 26,18 0,26', '#5a6a90', { opacity: 0.7 }),
    poly('40,0 95,0 100,5 100,34 70,22 26,18', '#3d4966', { opacity: 0.7 }),
    poly('0,26 26,18 34,100 5,100 0,95', '#364160', { opacity: 0.6 }),
    poly('70,22 100,34 100,95 95,100 58,100 52,60', '#556487', { opacity: 0.55 }),
    poly('26,18 70,22 52,60 34,100 26,60', '#2f3a56', { opacity: 0.5 }),
    svg('path', { d: 'M5 1H95M1 5V95', stroke: '#a6b5d8', 'stroke-width': 1.6, fill: 'none', 'vector-effect': 'non-scaling-stroke', opacity: 0.8 }),
    svg('path', { d: 'M95 99H5M99 95V5', stroke: '#0f1424', 'stroke-width': 2, fill: 'none', 'vector-effect': 'non-scaling-stroke', opacity: 0.9 }),
    poly('4,4 96,4 96,96 4,96', 'none', { stroke: '#10162a', 'stroke-width': 1.4, 'vector-effect': 'non-scaling-stroke', opacity: 0.8 }),
    poly('5,5 95,5 95,95 5,95', 'none', { stroke: '#7384aa', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke', opacity: 0.35 }),
    svg('path', { d: 'M12 30L20 36M70 12L76 20M88 62L80 70M40 90L46 82M30 50L38 46', stroke: '#141a2c', 'stroke-width': 1, fill: 'none', 'vector-effect': 'non-scaling-stroke', opacity: 0.6 }));
}
