// Вторая игровая локация: темный, богатый каменный холл.
// Canvas-рисунок в координатах той же арены, без загружаемых картинок.
// Статичный пол, мрамор, рунный рисунок и парадная решётка кэшируются.
// Факелы мерцают отдельно, без перестройки большого полотна.
const TAU=Math.PI*2;
function rnd(seed=89176){let n=seed>>>0;return()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}
function shape(c,pts,col,edge,width=1){c.beginPath();c.moveTo(pts[0],pts[1]);for(let i=2;i<pts.length;i+=2)c.lineTo(pts[i],pts[i+1]);c.closePath();c.fillStyle=col;c.fill();if(edge){c.strokeStyle=edge;c.lineWidth=width;c.stroke();}}
function trace(c,pts,col,w=1){c.beginPath();c.moveTo(pts[0],pts[1]);for(let i=2;i<pts.length;i+=2)c.lineTo(pts[i],pts[i+1]);c.strokeStyle=col;c.lineWidth=w;c.stroke();}
// Склепы по обе стороны пути. Не просто надгробная плита: арочная ниша,
 // саркофаг с рельефом, скульптурная фигура, глухие решётки и трещины.
function crypt(c,x,y,side,index){
  c.save();c.translate(x,y);
  c.fillStyle='rgba(0,0,0,.55)';
  c.beginPath();c.ellipse(0,15,70,99,0,0,TAU);c.fill();
  shape(c,[-60,-78,-60,-23,-55,69,55,69,60,-22,60,-79,39,-106,-37,-106],
    '#111822','#3d4552',3.4);
  shape(c,[-49,-68,-45,56,45,56,49,-68,32,-92,-31,-92],
    '#080e18','#5a5b5f',2);
  for(let i=0;i<5;i++){
    const xx=-36+i*18;
    trace(c,[xx,-63,xx,-33],'rgba(102,105,113,.35)',2);
  }
  const stone=c.createLinearGradient(-52,-49,48,65);
  stone.addColorStop(0,'#5a626d');stone.addColorStop(.43,'#373f4a');
  stone.addColorStop(1,'#1e2734');
  shape(c,[-51,-50,43,-50,51,-33,49,64,-47,64,-54,48],stone,'#101722',3);
  shape(c,[-44,-48,35,-48,43,-27,39,51,-38,51,-45,32],
    '#454d59','#8a8480',2);
  shape(c,[-38,-39,28,-39,36,-20,32,43,-32,43,-39,24],
    '#242e3b','#797780',1.2);
  // Покойник-король, высеченный в крышке, в плаще и с тяжёлым клинком.
  shape(c,[-13,-31,-9,-44,5,-44,14,-31,9,-20,-9,-20],'#737b87','#2b3542',1.5);
  shape(c,[-19,-13,-9,-24,13,-24,22,-13,17,35,-17,35],
    '#56616f','#28313f',2);
  trace(c,[-3,-13,3,30],'#a69c8d',3);
  shape(c,[-13,-2,-5,3,-2,14,-11,9],'#938878');
  shape(c,[10,-3,20,5,13,13,9,6],'#938878');
  for(const yy of [-27,2,27]){
    trace(c,[-30,yy,-25,yy-3],'rgba(188,168,135,.48)',1.1);
    trace(c,[21,yy,25,yy+3],'rgba(188,168,135,.48)',1.1);
  }
  // Латунная печать, даже в темноте виден слабый холодный блик.
  const xx=side<0?36:-36;
  c.strokeStyle='#88765c';c.lineWidth=2.2;
  c.beginPath();c.arc(xx,-60,10,0,TAU);c.stroke();
  trace(c,[xx,-68,xx,-51],'#a08c70',1.4);
  c.fillStyle='rgba(8,13,21,.38)';
  c.fillRect(-51,55,102,9);
  // Неровные сколы, вековая пыль и паутина в дальнем углу.
  const drift=(index%3)*3;
  trace(c,[-48,-65,-23,-53+drift,-13,-67],'rgba(158,176,191,.22)',1);
  trace(c,[-48,-65,-32,-82,-12,-68],'rgba(158,176,191,.16)',1);
  trace(c,[42,34,35,17,42,8],'rgba(12,17,25,.55)',1.3);
  c.restore();
}
function sconce(c,x,y){
  c.save();c.translate(x,y);
  shape(c,[-13,0,-10,-7,10,-7,13,0,9,6,-9,6],
    '#262c34','#786b5e',1.3);
  trace(c,[-8,-7,-5,-12,5,-12,8,-7],'#4e5158',2);
  // Ни свечения, ни пламени: в чаше только тёмный холодный пепел.
  shape(c,[-7,-8,-4,-12,3,-12,7,-8],'#0b111a');
  c.restore();
}
export class CastleHallArt {
  constructor(arena){this.arena=arena;this.floor=null;this.torches=[];this.columns=arena.hallColumns;this.columnSprite=null;this.opacity=new Map();}
  build(){
    const ar=this.arena,W=ar.width|0,H=ar.height|0;
    const cv=typeof OffscreenCanvas==='function'?new OffscreenCanvas(W,H):document.createElement('canvas');
    cv.width=W;cv.height=H;
    const c=cv.getContext('2d'),r=rnd();
    c.translate(-ar.left,-ar.top);
    const L=ar.left,T=ar.top,R=ar.right,B=ar.bottom;
    const stone=c.createLinearGradient(L,T,R,B);
    stone.addColorStop(0,'#0d111a');stone.addColorStop(.38,'#171c27');
    stone.addColorStop(.7,'#151b25');stone.addColorStop(1,'#0a0f18');
    c.fillStyle=stone;c.fillRect(L,T,W,H);
    // Паркет темного камня: неправильные плитки, потертые швы и редкие мраморные прожилки.
    const tile=70;
    for(let row=0;row<Math.ceil(H/tile);row++)for(let col=-1;col<Math.ceil(W/tile);col++){
      const y=T+row*tile,x=L+col*tile+((row%2)*tile*.5);
      const bright=r(),tones=['#1b222e','#252a36','#171e29','#292e3b','#1b2531'];
      shape(c,[x+2,y+2,x+tile-3,y+3,x+tile-4,y+tile-2,x+2,y+tile-3],
        tones[Math.floor(bright*tones.length)],'rgba(8,14,21,.82)',2);
      if(bright>.32)trace(c,[x+7,y+12,x+tile*.43,y+9,x+tile*.74,y+5],
        'rgba(140,155,172,.09)',1);
      if(r()>.76)trace(c,[x+tile*.7,y+tile*.12,x+tile*.4,y+tile*.38,x+tile*.49,y+tile*.72],
        'rgba(12,22,30,.33)',1);
      if((row+col)%8===0){
        shape(c,[x+5,y+tile*.5,x+tile*.5,y+5,x+tile-5,y+tile*.5,x+tile*.5,y+tile-5],
          'rgba(156,128,82,.09)','rgba(188,152,102,.15)',1);
      }
    }
    // Вытянутый ковёр: бордовый бархат, латунные кант и вплетенные орнаменты.
    const cw=198;
    c.fillStyle='rgba(0,0,0,.4)';c.fillRect(-cw/2-8,T+140,cw+16,H-170);
    const carpet=c.createLinearGradient(-cw/2,0,cw/2,0);
    carpet.addColorStop(0,'#190f1b');carpet.addColorStop(.14,'#2d1824');
    carpet.addColorStop(.52,'#401e2a');carpet.addColorStop(.85,'#2b1623');
    carpet.addColorStop(1,'#150e17');
    c.fillStyle=carpet;c.fillRect(-cw/2,T+142,cw,H-175);
    for(const side of [-1,1]){
      const x=side*cw/2-side*11;
      trace(c,[x,T+142,x,B-34],'rgba(211,159,84,.52)',3);
      trace(c,[x-side*7,T+142,x-side*7,B-34],'rgba(135,102,67,.43)',1);
    }
    for(let y=T+194;y<B-47;y+=115){
      for(const j of [-1,1]){
        c.save();c.translate(j*57,y);
        shape(c,[0,-25,12,-12,7,0,14,12,0,25,-14,12,-7,0,-12,-12],
          'rgba(162,119,77,.18)','rgba(213,165,99,.23)',1);
        shape(c,[0,-15,6,0,0,15,-6,0],'rgba(205,143,86,.13)');
        c.restore();
      }
      trace(c,[-29,y,0,y+12,29,y], 'rgba(188,143,97,.19)',1.5);
    }
    // Большой позолоченный круг под центральной зоной героя.
    c.save();c.translate(0,110);
    c.strokeStyle='rgba(176,142,92,.29)';c.lineWidth=4;
    for(const rr of [205,222,237]){c.beginPath();c.arc(0,0,rr,0,TAU);c.stroke();}
    for(let i=0;i<12;i++){
      const a=i*TAU/12;
      trace(c,[Math.cos(a)*190,Math.sin(a)*190,Math.cos(a)*243,Math.sin(a)*243],
        'rgba(194,163,115,.36)',2.5);
      const x=Math.cos(a)*226,y=Math.sin(a)*226;
      shape(c,[x,y-7,x+5,y,x,y+7,x-5,y],'rgba(194,157,93,.31)');
    }
    c.restore();
    // Теперь боковые ниши заняты родовыми захоронениями, а не каменными стойками.
    for(const p of ar.hallCrypts){
      const side=Math.sign(p.x);
      crypt(c,p.x,p.y,side,Math.round((p.y+560)/315));
    }
    // Каменные фундаменты колонн видны под ногами, сами колонны отдельным
    // передним слоем и становятся прозрачными, если закрывают героя.
    for(const p of this.columns){
      const g=c.createRadialGradient(p.x,p.y+6,0,p.x,p.y+6,62);
      g.addColorStop(0,'rgba(0,0,0,.68)');
      g.addColorStop(1,'rgba(0,0,0,0)');
      c.fillStyle=g;c.beginPath();c.arc(p.x,p.y+6,62,0,TAU);c.fill();
      shape(c,[p.x-36,p.y-24,p.x+36,p.y-24,p.x+42,p.y+24,p.x-42,p.y+24],
        '#303947','#111823',2.4);
      shape(c,[p.x-29,p.y-17,p.x+29,p.y-17,p.x+29,p.y+18,p.x-29,p.y+18],
        '#454d5b','#6e6b68',1.6);
    }
    // Передняя стена: монументальный мраморный портал в глубину замка.
    const lintel=c.createLinearGradient(0,T,0,T+181);
    lintel.addColorStop(0,'#1a2532');lintel.addColorStop(.4,'#303a4b');
    lintel.addColorStop(1,'#0b121d');
    c.fillStyle=lintel;c.fillRect(L,T,W,166);
    for(let y=T+7;y<T+158;y+=29){
      for(let x=L+4;x<R;x+=64){
        shape(c,[x+(y%2)*.5,y,x+61,y,x+61,y+26,x,y+26],
          y%3?'#303949':'#3a4656','#121b27',1.5);
      }
    }
    // Две темные каменные контрфорсы, фриз и золотые инкрустации.
    for(const side of [-1,1]){
      const x=side*185;
      shape(c,[x-35,T+4,x+36,T+4,x+42,T+174,x-42,T+174],
        '#313c4d','#9b8b77',3);
      shape(c,[x-22,T+14,x+24,T+14,x+20,T+172,x-21,T+172],
        '#556173','#1b2634',2);
      trace(c,[x,T+11,x,T+157],'rgba(210,162,92,.4)',2.3);
      shape(c,[x-46,T+157,x+46,T+157,x+53,T+183,x-52,T+183],
        '#343c4b','#a28e70',3);
    }
    // Роскошная глубокая арка, за которой нет выхода на улицу: только темнота и решётка.
    const arch=(w,h,lower)=>{
      const y=T+lower;
      c.beginPath();c.moveTo(-w/2,y);c.lineTo(-w/2,y-h*.64);
      c.bezierCurveTo(-w/2,y-h*1.1,w/2,y-h*1.1,w/2,y-h*.64);
      c.lineTo(w/2,y);c.closePath();
    };
    arch(290,197,160);c.fillStyle='#707b85';c.fill();c.lineWidth=8;c.strokeStyle='#ba9369';c.stroke();
    arch(259,188,155);c.fillStyle='#080d17';c.fill();c.lineWidth=5;c.strokeStyle='#3f3b3b';c.stroke();
    c.save();arch(253,186,155);c.clip();
    for(let j=0;j<9;j++){
      const x=-112+j*28;
      c.fillStyle='rgba(11,17,26,.83)';c.fillRect(x-4,T-26,8,200);
      c.fillStyle='#8b8279';c.fillRect(x-4,T-16,2,176);
      for(let y=T+15;y<T+152;y+=57){
        shape(c,[x-6,y,x,y-13,x+6,y,x+3,y+9,x-3,y+9],
          '#c9a473','#423a36',1);
      }
    }
    for(let yy of [T+46,T+91,T+140]){
      c.fillStyle='#3a3a43';c.fillRect(-127,yy,254,9);
      trace(c,[-127,yy+1,127,yy+1],'#c1a57c',2);
    }
    // Большой позолоченный щит в середине решётки.
    shape(c,[-31,T+58,31,T+58,29,T+102,0,T+128,-29,T+102],
      '#403d41','#caac78',3);
    shape(c,[-17,T+68,17,T+68,0,T+105],'#9b7e51','#e1c396',1.5);
    c.restore();
    // Фриз с угловыми орнаментами по сторонам.
    for(const side of [-1,1])for(let i=0;i<3;i++){
      const x=side*(270+i*115);
      shape(c,[x,T+26,x+15,T+41,x,T+56,x-15,T+41],
        '#7f7159','#c3a17b',1);
    }
    // Пустые погасшие чаши: никакого горящего факела в заброшенном зале.
    this.torches.push({x:-242,y:T+190},{x:242,y:T+190});
    for(const p of this.torches)sconce(c,p.x,p.y);
    // Затемнение краёв усиливает глубину помещения, а не обесцвечивает игровой центр.
    const vignette=c.createRadialGradient(0,60,250,0,60,1120);
    vignette.addColorStop(0,'rgba(4,7,15,0)');
    vignette.addColorStop(1,'rgba(2,5,11,.78)');
    c.fillStyle=vignette;c.fillRect(L,T,W,H);
    c.fillStyle='rgba(4,7,14,.21)';c.fillRect(L,T,W,H);
    this.floor=cv;
  }
  drawFloor(ctx,x0,y0,x1,y1){
    if(!this.floor)this.build();
    const a=this.arena;
    const l=Math.max(a.left,x0),r=Math.min(a.right,x1),t=Math.max(a.top,y0),b=Math.min(a.bottom,y1);
    if(l<r&&t<b)ctx.drawImage(this.floor,l-a.left,t-a.top,r-l,b-t,l,t,r-l,b-t);
  }
  /** Одна детальная мраморная колонна в кэшированном спрайте (не 20 раз в кадр). */
  buildColumn(){
    const cv=typeof OffscreenCanvas==='function'?new OffscreenCanvas(136,208):document.createElement('canvas');
    cv.width=136;cv.height=208;
    const c=cv.getContext('2d');
    c.translate(68,174);
    // Капитель и длинный холодный силуэт; тень не перекрывает живого героя.
    const shade=c.createLinearGradient(-39,-135,39,17);
    shade.addColorStop(0,'#667280');
    shade.addColorStop(.36,'#374354');
    shade.addColorStop(.78,'#222c3b');
    shade.addColorStop(1,'#131c29');
    shape(c,[-31,-142,-27,-156,29,-156,34,-142,32,8,37,21,-37,21,-32,8],
      '#1c2532','#141b27',2.5);
    shape(c,[-24,-142,24,-142,26,7,29,19,-29,19,-26,7],
      shade,'#596576',2);
    shape(c,[-23,-141,-10,-148,-10,6,-22,11],
      'rgba(151,162,171,.22)');
    shape(c,[9,-143,25,-139,27,13,14,10],
      'rgba(2,7,17,.34)');
    for(const x of [-14,-6,5,14]){
      trace(c,[x,-138,x-1,9],x%2?'rgba(12,22,32,.39)':'rgba(155,162,168,.14)',1.8);
    }
    // Концы колонн выглядят как тяжёлый резной камень с металлическими связками.
    for(const y of [-138,-107,-48,7]){
      shape(c,[-33,y-7,33,y-7,37,y+4,-37,y+4],
        y===-138?'#55606e':'#2a3545','#151f2c',1.8);
      trace(c,[-27,y-5,27,y-5],'rgba(158,163,170,.32)',1.3);
      trace(c,[-26,y+1,26,y+1],'rgba(132,109,78,.35)',1.2);
    }
    shape(c,[-39,-154,-31,-173,30,-173,41,-154,37,-143,-37,-143],
      '#465261','#17212e',2.5);
    shape(c,[-31,-168,29,-168,33,-158,-34,-158],
      '#718092','#384556',1.3);
    for(const x of [-24,-10,4,18]){
      trace(c,[x,-162,x+5,-160],'rgba(180,164,136,.35)',1.1);
    }
    shape(c,[-38,8,38,8,43,22,-43,22],
      '#46505d','#151d29',2.5);
    shape(c,[-29,10,29,10,33,19,-33,19],
      '#343d4b','#9a8b73',1);
    // Не регулярная сетка: старые трещины, высеченные листья и потёртая резьба.
    trace(c,[-23,-117,-13,-104,-21,-89,-17,-65],
      'rgba(12,19,28,.42)',1.7);
    trace(c,[23,-97,18,-87,22,-78,15,-62],
      'rgba(141,151,163,.16)',1.3);
    for(const y of [-126,-86,-28]){
      shape(c,[-5,y,0,y-8,5,y,0,y+8],
        'rgba(164,145,106,.19)','rgba(183,171,140,.17)',.9);
    }
    this.columnSprite=cv;
  }

  /** Передний план: если колонна скрывает персонажа, просвечивает только её
   * объёмный верхний слой; каменный цоколь остаётся на полу. */
  drawColumns(ctx,hero,dt,viewL,viewR,viewT,viewB){
    if(!this.columnSprite)this.buildColumn();
    const k=1-Math.exp(-Math.max(0,Math.min(.1,dt||0))*9);
    for(let i=0;i<this.columns.length;i++){
      const p=this.columns[i];
      if(p.x+75<viewL||p.x-75>viewR||p.y+34<viewT||p.y-183>viewB)continue;
      const overlaps=hero?.active!==false&&
        Math.abs(hero.x-p.x)<49+(hero.radius||12) &&
        hero.y>p.y-174-(hero.radius||12)&&hero.y<p.y+22+(hero.radius||12);
      const target=overlaps?.19:1;
      const alpha=(this.opacity.get(i)??1)+
        (target-(this.opacity.get(i)??1))*k;
      this.opacity.set(i,alpha);
      ctx.save();ctx.globalAlpha=alpha;
      ctx.drawImage(this.columnSprite,p.x-68,p.y-174,136,208);
      ctx.restore();
    }
  }

  // Сохраняем совместимость с вызывавшимся методом, но факелы погасли.
  drawFlames(){}
}
