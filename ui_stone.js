// Материалы меню билда: плитки-основания для ядер и модов, каменная плита поля и подбор вида по редкости.
// Плитки лежат один раз в скрытом SVG-спрайте и подключаются через <use>: на экране их десятки, а рисунок один.
import { h, svg } from './ui_dom.js';
import { icon } from './ui_icons.js';

/** Материал модов всегда определяется редкостью, включая вторичные умения. */
export function tileOfMod(key, def) {
  const rarity = def && def.rarity || 'common';
  return rarity === 'legendary' ? 'gem' : rarity === 'epic' ? 'gold' : rarity === 'rare' ? 'iron' : 'stone';
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

// Четыре самостоятельных, детализированных материала. Символы умений остаются читаемыми.
function tileStone() {
  return svg('symbol', { id:'t-stone', viewBox:'0 0 64 64' },
    ...frame('#52545a','#989ba1','#1d222a','#292d34','#757980', [
      poly('0,5 5,0 31,0 23,12 0,19','#686b71'),
      poly('31,0 59,0 64,5 64,22 48,15 23,12','#434850'),
      poly('0,19 23,12 28,64 5,64 0,59','#40454b',{opacity:.86}),
      poly('48,15 64,22 64,59 59,64 39,64 35,41','#5e626a',{opacity:.9}),
      poly('0,5 5,0 9,7 2,13','#a6a6a0',{opacity:.43}),
      poly('59,0 64,5 57,11 53,4','#20252b',{opacity:.72}),
      poly('59,64 64,59 55,53 51,61','#292d33',{opacity:.87}),
      poly('5,64 0,59 7,53 12,60','#868887',{opacity:.6}),
      ln('M3 32L8 28L12 32M54 6L48 15L52 22M5 50L13 43L17 48M60 38L54 41L51 49','#20242b',1.2,{opacity:.85}),
      ln('M6 7L12 13M48 3L44 8M56 55L50 49','#b1ada4',.9,{opacity:.46}),
    ]),
    ln('M13 17L17 14M47 54L51 48M2 35L6 37M57 27L61 24','#c0bfb4',.9,{opacity:.36}));
}

function tileIron() {
  const rivet=(x,y)=>[
    svg('circle',{cx:x,cy:y,r:2.6,fill:'#202b36',stroke:'#8599a8','stroke-width':.65}),
    svg('circle',{cx:x-.55,cy:y-.6,r:1.4,fill:'#d0d8dd'})
  ];
  return svg('symbol',{id:'t-iron',viewBox:'0 0 64 64'},
    ...frame('#596874','#d0dbe3','#151e29','#192731','#7b9cad',[
      poly('0,5 5,0 59,0 64,5 64,12 0,27','#879ba7',{opacity:.55}),
      poly('0,49 64,34 64,59 59,64 5,64 0,59','#344450',{opacity:.8}),
      poly('4,9 9,4 54,4 60,10 55,14 10,14','#b0c0cb',{opacity:.17}),
      poly('4,55 10,50 54,50 60,55 56,60 8,60','#283844',{opacity:.48}),
      ln('M3 18V46M61 18V46M18 3H46M18 61H46','#bed2da',.8,{opacity:.44}),
      ln('M14 12L21 7M43 57L50 52M14 52L21 57M43 7L50 12','#bed7e6',1,{opacity:.4}),
      ln('M3 33L8 31M56 26L61 24M16 61L19 58','#101b25',.9,{opacity:.8}),
    ]),
    ...rivet(6,6),...rivet(58,6),...rivet(6,58),...rivet(58,58),
    ln('M12 10H52M12 54H52','#83a8bf',.9,{opacity:.48}));
}

function tileGold() {
  const rosette=(x,y)=>[
    poly(x+','+(y-3.5)+' '+(x+3.5)+','+y+' '+x+','+(y+3.5)+' '+(x-3.5)+','+y,
      '#e6c584',{stroke:'#684625','stroke-width':.8}),
    svg('circle',{cx:x,cy:y,r:1.05,fill:'#fff0c4'})
  ];
  return svg('symbol',{id:'t-gold',viewBox:'0 0 64 64'},
    ...frame('#b1894b','#fae5ac','#4e321a','#382819','#c7a96f',[
      poly('0,5 5,0 59,0 64,5 64,14 0,29','#ebc374',{opacity:.48}),
      poly('0,49 64,32 64,59 59,64 5,64 0,59','#886236',{opacity:.67}),
      poly('4,13 13,4 51,4 60,13 56,17 8,17','#ffe6aa',{opacity:.16}),
      ln('M3 21L21 3M43 61L61 43M4 45L19 61M45 3L60 18','#ffdd9a',1,{opacity:.47}),
      ln('M15 7H49M15 57H49M7 15V49M57 15V49','#f0ce88',.9,{opacity:.65}),
      ln('M14 13L20 17L24 13M40 13L44 17L50 13M14 51L20 47L24 51M40 51L44 47L50 51','#b38952',.8,{opacity:.8}),
    ]),
    ln('M12 10H52M10 12V52M12 54H52M54 12V52','#f2cf84',1,{opacity:.7}),
    ...rosette(5.5,5.5),...rosette(58.5,5.5),
    ...rosette(5.5,58.5),...rosette(58.5,58.5));
}

function tileGem() {
  // Огранка по ободу, тёмная сердцевина под читаемый знак и золотые лапки оправы.
  const mount=(x,y)=>[
    svg('circle',{cx:x,cy:y,r:3.5,fill:'#aa8054',stroke:'#30233d','stroke-width':.85}),
    poly(x+','+(y-2.4)+' '+(x+2.3)+','+y+' '+x+','+(y+2.4)+' '+(x-2.3)+','+y,
      '#e3bd82',{stroke:'#f7e1a9','stroke-width':.45})
  ];
  return svg('symbol',{id:'t-gem',viewBox:'0 0 64 64'},
    ...frame('#675379','#c5aad5','#211a2f','#29213a','#b392be',[
      poly('0,5 5,0 30,0 21,13 0,25','#9c83b3',{opacity:.75}),
      poly('30,0 59,0 64,5 64,25 44,13 21,13','#493b64',{opacity:.95}),
      poly('0,25 21,13 27,64 5,64 0,59','#413650',{opacity:.84}),
      poly('44,13 64,25 64,59 59,64 37,64 36,43','#785a88',{opacity:.78}),
      poly('5,5 17,4 11,13 3,18','#dac2e4',{opacity:.53}),
      poly('47,2 59,5 61,18 54,13','#dfc0bd',{opacity:.32}),
      poly('2,49 9,45 16,56 5,59','#ad93bf',{opacity:.54}),
      poly('57,50 62,55 59,62 49,59','#d9a6a5',{opacity:.26}),
      ln('M2 29L11 18M53 4L47 13M6 57L19 51M52 49L61 38','#eddaef',1,{opacity:.47}),
      ln('M21 13L13 20M44 13L51 20M27 64L23 54M37 64L41 54','#24192f',1.3,{opacity:.88}),
    ]),
    ln('M3 19L10 13M54 13L61 19M3 45L10 51M54 51L61 45','#f0c788',1.6,{opacity:.91}),
    ln('M13 10H51M13 54H51','#d8ab71',.9,{opacity:.57}),
    ...mount(6,6),...mount(58,6),...mount(6,58),...mount(58,58),
    poly('28,4 32,1 36,4 32,8','#efd199',{opacity:.9}),
    poly('28,60 32,56 36,60 32,63','#ae7955',{opacity:.91}));
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
    svg('defs', {}, tileStone(), tileIron(), tileGold(), tileGem(), tileCoreBolt(), tileCoreShield(),
      tileDash('t-dash-steel', ['#c3ced9', '#8fa2bb'], '#8fa2bb', '')));
  document.body.append(sprite);
}

/** Плитка-основание со значком: <div class="piece t-вид"> для ячейки поля, хранилища или перетаскивания. */
export function piece(tile, iconName) {
  ensureSprite();
  const t = svg('svg', { viewBox: '0 0 64 64', class: 'tile', 'aria-hidden': 'true' });
  t.append(svg('use', { href: '#t-' + tile }));
  return h('div', { class: 'piece t-' + tile }, t, icon(iconName));
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
