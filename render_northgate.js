// Северная крепость. Процедурный Canvas-арт, подстроенный под угловатую
// холодную палитру SoulsGate. Не нужен внешний PNG или загрузка по сети.
// Кэшируется единожды, живой огонь рисуется каждый кадр.
const TAU=Math.PI*2;
function rand(seed=291){let s=seed>>>0;return()=>{s=(Math.imul(1664525,s)+1013904223)>>>0;return s/4294967296;};}
function poly(ctx,p,fill,stroke=null,lw=1){ctx.beginPath();ctx.moveTo(p[0],p[1]);for(let i=2;i<p.length;i+=2)ctx.lineTo(p[i],p[i+1]);ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lw;ctx.stroke();}}
function grad(ctx,x,y,r,center,edge){const g=ctx.createRadialGradient(x,y,2,x,y,r);g.addColorStop(0,center);g.addColorStop(1,edge);return g;}
function line(ctx,points,color,width=1){ctx.beginPath();ctx.moveTo(points[0],points[1]);for(let i=2;i<points.length;i+=2)ctx.lineTo(points[i],points[i+1]);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
function snow(ctx,x,y,w=40,depth=8){
  poly(ctx,[x-w*.56,y+depth*.2,x-w*.42,y-depth*.48,x-w*.13,y-depth*.86,x+w*.18,y-depth*.6,x+w*.43,y-depth*.8,x+w*.6,y+depth*.22,x+w*.24,y+depth*.48,x-w*.17,y+depth*.53],
    '#c1cbd9','#d8e2eb',.8);
  line(ctx,[x-w*.37,y+depth*.05,x-w*.12,y-depth*.33,x+w*.25,y-depth*.2], 'rgba(242,248,249,.42)',1);
}
function stone(ctx,x,y,w,h,rnd,tint=0){
  const colors=['#343c4d','#3e4858','#465063','#515b6c','#293544','#566073'];
  const c=colors[(Math.floor(rnd()*colors.length)+tint+colors.length)%colors.length];
  poly(ctx,[x+2,y+2,x+w-4,y+1,x+w-1,y+h-3,x+3,y+h-1],c,'#222c3a',1);
  line(ctx,[x+4,y+h-5,x+5,y+6,x+w*.53,y+4], 'rgba(161,175,195,.14)',1.1);
  if(rnd()<.38)line(ctx,[x+w*.3,y+h*.2,x+w*.4,y+h*.49,x+w*.3,y+h*.72],
    'rgba(20,27,40,.39)',1);
}
function column(ctx,x,y,w,h){
  poly(ctx,[x-w*.7,y+h*.92,x-w*.56,y+h*.25,x-w*.48,y,x+w*.5,y,x+w*.55,y+h*.35,x+w*.72,y+h*.92],
    '#27303d','#18222f',2);
  poly(ctx,[x-w*.51,y+6,x-w*.27,y-8,x+w*.35,y-7,x+w*.49,y+6,x+w*.33,y+h*.85,x-w*.28,y+h*.8],
    '#566174','#263143',1.6);
  poly(ctx,[x-w*.27,y+4,x-w*.08,y-7,x+w*.28,y-2,x+w*.33,y+5],
    '#798394','#b5c6da',.8);
  poly(ctx,[x-w*.6,y+h*.78,x+w*.63,y+h*.78,x+w*.78,y+h*.95,x-w*.78,y+h*.95],
    '#2b3441','#111b28',2);
  snow(ctx,x,y-5,w*1.1,8);
}
function statue(ctx,x,y,scale=1){
  ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
  // Длинная тень и фундамент, лицо скрыто под глубоким капюшоном.
  ctx.fillStyle='rgba(9,14,24,.45)';ctx.beginPath();ctx.ellipse(2,65,35,13,0,0,TAU);ctx.fill();
  poly(ctx,[-31,58,-19,12,-12,-16,-18,-30,-8,-46,8,-47,21,-30,17,-12,27,14,32,58],
    '#687282','#1d2634',2);
  poly(ctx,[-18,54,-17,-13,-3,-31,4,-31,19,-15,21,55],
    '#8b95a5','#3a4354',1.4);
  poly(ctx,[3,-30,20,-14,21,48,3,56], '#4b5567');
  poly(ctx,[-17,-32,-8,-52,6,-58,18,-50,22,-32,13,-22,-8,-22],
    '#a5adb9','#505a6b',1.7);
  poly(ctx,[-12,-32,-3,-46,6,-47,15,-35,8,-26,-7,-26], '#101825');
  line(ctx,[-20,18,0,5,20,18],'#b5bbc4',5);
  // Длинный клинок, покрытый льдом.
  poly(ctx,[-5,13,-2,-56,0,-80,2,-56,5,13,1,36,-2,36],
    '#bdc7cf','#414c5b',1.2);
  line(ctx,[-2,-35,2,12],'#ecf2ef',1.4);
  poly(ctx,[-11,13,11,13,7,19,-7,19],'#454451','#d5b78e',1);
  snow(ctx,0,59,57,8);
  ctx.restore();
}
function torch(ctx,x,y,t,large=false){
  const size=large?1.3:1;
  ctx.save();ctx.translate(x,y);
  // Каменная чаша, латунь и силуэт крепления.
  poly(ctx,[-12*size,2,-10*size,8,9*size,8,12*size,2,9*size,-2,-9*size,-2],
    '#262f3d','#8c7964',1.4);
  poly(ctx,[-10*size,-3,-6*size,-8,6*size,-8,10*size,-3],
    '#a18b70','#dec195',.8);
  const flutter=Math.sin(t*9+x*.08)*.2+Math.sin(t*17+y*.1)*.14;
  ctx.fillStyle=grad(ctx,0,-10,43*size,'rgba(255,151,55,.28)','rgba(255,120,31,0)');
  ctx.beginPath();ctx.arc(0,-12,43*size,0,TAU);ctx.fill();
  poly(ctx,[-6,-5,-8,-19,flutter*6-4,-33,3,-20,7,-13,4,-5],
    '#da642a');
  poly(ctx,[-3,-6,-4,-14,flutter*4,-27,4,-17,4,-7], '#ffe5a0');
  ctx.restore();
}
function banner(ctx,x,y,w=27,h=108){
  poly(ctx,[x-w/2,y,x+w/2,y,x+w*.47,y+h*.75,x+w*.21,y+h,x,y+h*.87,x-w*.3,y+h,x-w*.53,y+h*.8],
    '#4c202b','#1c1c27',2);
  poly(ctx,[x-w*.37,y+5,x-w*.17,y+4,x-w*.19,y+h*.72,x-w*.4,y+h*.86],
    'rgba(177,55,55,.37)');
  line(ctx,[x,y+12,x+5,y+23,x,y+33,x-5,y+23,x,y+12],
    'rgba(205,169,112,.56)',1.4);
  line(ctx,[x-w*.5,y,x+w*.5,y],'#9e8b77',3);
}
export class NorthGateArt {
  constructor(arena) {
    this.arena=arena;
    this.cached=null;
    this.start=-32; // чуть выше северной кромки; стена видна из камеры
    this.height=430;
  }
  build() {
    const ar=this.arena,W=Math.ceil(ar.width),H=this.height;
    const cv=typeof OffscreenCanvas==='function'?new OffscreenCanvas(W,H):document.createElement('canvas');
    cv.width=W;cv.height=H;
    const c=cv.getContext('2d');
    const rnd=rand();
    c.translate(W/2,-this.start+70); // всё монументальное укрепление видно внутри северной кромки
    // На переднем плане морозная дорога к центральным воротам.
    c.save();
    const approach=c.createLinearGradient(0,100,0,300);
    approach.addColorStop(0,'rgba(23,30,41,.66)');
    approach.addColorStop(.6,'rgba(56,67,81,.20)');
    approach.addColorStop(1,'rgba(64,76,86,0)');
    poly(c,[-128,106,128,106,216,290,-208,290],approach);
    for(let row=0;row<8;row++){
      const yy=128+row*19;
      const width=100+row*12;
      for(let x=-width;x<width;x+=26){
        if(rnd()<.3)continue;
        poly(c,[x+3,yy+2,x+20+rnd()*4,yy+1,x+21,yy+8,x+4,yy+9],
          rnd()<.45?'rgba(44,53,68,.27)':'rgba(167,184,201,.14)');
      }
    }
    c.restore();
    // Горизонтальная тень у скал.
    c.fillStyle=grad(c,0,50,W*.58,'rgba(15,21,32,.17)','rgba(12,17,24,0)');
    c.fillRect(-W*.5,0,W,170);
    // Внешние отвесные пласты скал, заметаемые снегом.
    const edgeW=W/2;
    for(const side of [-1,1]){
      c.save();c.scale(side,1);
      const cliff=[205,-35,edgeW+35,-35,edgeW+24,99,edgeW-25,132,edgeW-94,114,edgeW-126,86,edgeW-161,112,edgeW-210,102,228,62];
      poly(c,cliff,'#222b38','#1a2430',4);
      poly(c,[218,-35,edgeW+14,-35,edgeW-9,83,edgeW-92,95,edgeW-152,61,231,48],
        '#4c586b','#2c3848',2);
      poly(c,[252,-33,edgeW-45,-33,edgeW-100,28,edgeW-167,47,245,21],
        '#697688');
      for(let i=0;i<11;i++){
        const xx=230+rnd()*(edgeW-255),yy=-24+rnd()*91;
        line(c,[xx,yy,xx-5-rnd()*9,yy+16+rnd()*21,xx-4-rnd()*13,yy+20+rnd()*27],
          'rgba(15,22,34,.3)',1.1);
      }
      for(let i=0;i<6;i++)snow(c,265+i*(edgeW-278)/6,-22+rnd()*10,55+rnd()*18,11);
      c.restore();
    }
    // Каменная стена во всю северную ширину.
    const wall=c.createLinearGradient(0,-25,0,112);
    wall.addColorStop(0,'#5a6679');
    wall.addColorStop(.27,'#3e4a5a');
    wall.addColorStop(.7,'#2b3444');
    wall.addColorStop(1,'#1c2635');
    poly(c,[-W*.5,-20,W*.5,-20,W*.5,98,W*.5-54,120,-W*.5+55,120,-W*.5,99],
      wall,'#151c29',4);
    // Каменные ряды со смещёнными швами и разными гранями.
    for(let row=0;row<7;row++){
      const y=-14+row*18;
      const shifted=row%2?18:0;
      for(let x=-W/2-33+shifted;x<W/2+25;x+=37+rnd()*7){
        if(Math.abs(x)<109 && y>0)continue; // центральная арка перекрывается воротами
        stone(c,x,y,38,19,rnd,row);
      }
    }
    // Толстая каменная верхняя гряда, с заснеженными зубцами.
    poly(c,[-W/2,-27,W/2,-27,W/2,-6,-W/2,-6],
      '#647184','#293544',3);
    for(let x=-W/2+9;x<W/2;x+=45){
      const h=16+(Math.floor(rnd()*3))*4;
      poly(c,[x,-22,x+31,-22,x+31,-22-h,x+4,-22-h],
        '#4f5c6d','#2c394a',2);
      snow(c,x+15,-23-h,40,10);
    }
    // Вдоль всей стены сосульки с зубчатым краем.
    for(let x=-W/2+12;x<W/2-12;x+=13+rnd()*15){
      if(rnd()<.21)continue;
      const h=4+rnd()*13;
      poly(c,[x,-8,x+5,-9,x+3,-9+h], 'rgba(161,189,207,.63)');
    }
    // Две башни по бокам, дополнительные контрфорсы в центральной секции.
    for(const x of [-W/2+48,W/2-48,-275,275,-117,117]){
      const height=Math.abs(x)>W*.35?145:125;
      column(c,x,-34,Math.abs(x)>W*.35?33:24,height);
    }
    // Главная арка, тёмные двойные двери и врезанная в камень окантовка.
    const gx=0,gy=103,gateW=218,gateH=163;
    const arch=(x1,y1,w,h)=>{
      c.beginPath();c.moveTo(x1-w/2,y1);c.lineTo(x1-w/2,y1-h*.66);
      c.bezierCurveTo(x1-w*.5,y1-h*1.12,x1+w*.5,y1-h*1.12,x1+w*.5,y1-h*.66);
      c.lineTo(x1+w/2,y1);c.closePath();
    };
    arch(0,gy,gateW+30,gateH+10);c.fillStyle='#202a36';c.fill();
    c.lineWidth=9;c.strokeStyle='#8190a3';c.stroke();
    arch(0,gy-4,gateW,gateH);c.fillStyle='#111824';c.fill();
    c.strokeStyle='#a3a3a1';c.lineWidth=2.4;c.stroke();
    // Створки намеренно не входят в статичный спрайт:
    // они рисуются отдельно и медленно распахиваются после смерти Арха.
    // Каменная ступенчатая площадка и подножие арки.
    for(let i=0;i<5;i++){
      const y=106+i*7,w=122+i*12;
      poly(c,[-w,y,w,y,w+7,y+6,-w-7,y+6],
        i%2?'#646d7a':'#4b596a','#222b37',1.2);
      snow(c,0,y,w*1.2,4);
    }
    // Статуи-стражи в глубоких нишах, с тяжёлыми плащами.
    for(const side of [-1,1]){
      const x=side*181;
      poly(c,[x-48,-35,x+48,-35,x+42,114,x-43,114],
        '#263040','#7b8492',2.3);
      statue(c,x,48,1.1);
      banner(c,side*346,-25,34,125);
      banner(c,side*266,-13,23,93);
    }
    // Снег, обломки и резкая тень перед стеной.
    const shadow=c.createLinearGradient(0,104,0,158);
    shadow.addColorStop(0,'rgba(9,14,21,.57)');
    shadow.addColorStop(1,'rgba(9,14,21,0)');
    c.fillStyle=shadow;c.fillRect(-W/2,106,W,54);
    for(let i=0;i<40;i++){
      const x=(rnd()-.5)*W,y=122+rnd()*50;
      if(Math.abs(x)<115&&y>147)continue;
      const sz=2+rnd()*6;
      poly(c,[x-sz,y+2,x-sz*.45,y-sz*.5,x+sz*.6,y-sz,x+sz,y+1],
        rnd()<.5?'rgba(27,39,53,.45)':'rgba(182,195,211,.45)');
    }
    for(let x=-W/2+28;x<W/2-15;x+=58+rnd()*32){
      if(Math.abs(x)<125)continue;
      snow(c,x,109+rnd()*20,35+rnd()*34,9+rnd()*5);
    }
    this.cached=cv;
  }
  /** Две тяжёлые створки вращаются внутрь, открывая настоящий тёмный проход. */
  drawGate(ctx,progress=0,time=0){
    const p=Math.max(0,Math.min(1,progress)),W=218,H=163;
    const ease=p*p*(3-2*p);
    const scale=1-ease*.89;
    ctx.save();
    ctx.translate(0,this.arena.top+70);
    ctx.beginPath();
    ctx.moveTo(-W/2,99);ctx.lineTo(-W/2,-8);
    ctx.bezierCurveTo(-W/2,-79,W/2,-79,W/2,-8);
    ctx.lineTo(W/2,99);ctx.closePath();ctx.clip();
    if(p>.01){
      const inside=ctx.createLinearGradient(0,-44,0,111);
      inside.addColorStop(0,'rgba(37,41,56,.53)');
      inside.addColorStop(.48,'rgba(79,66,51,.48)');
      inside.addColorStop(1,'rgba(159,112,58,.3)');
      ctx.fillStyle=inside;ctx.fillRect(-W/2,-80,W,200);
      ctx.globalAlpha=Math.min(.8,p)*(.23+.08*Math.sin(time*2));
      ctx.fillStyle='#d6a76a';ctx.fillRect(-7,-44,14,144);
      ctx.globalAlpha=1;
    }
    for(const side of [-1,1]){
      ctx.save();
      ctx.translate(side*W/2,0);
      ctx.scale(scale,1);
      const x=side<0?0:-W/2;
      const wood=ctx.createLinearGradient(x,-20,x+W/2,35);
      wood.addColorStop(0,'#303340');
      wood.addColorStop(.47,'#4f4d56');
      wood.addColorStop(1,'#252b39');
      ctx.fillStyle=wood;ctx.fillRect(x,-77,W/2,179);
      ctx.strokeStyle='#b9a17e';ctx.lineWidth=3;
      ctx.strokeRect(x,-77,W/2,179);
      for(let k=1;k<6;k++){
        line(ctx,[x+k*18,-69,x+k*18,98],k%2?'#626273':'#262b3b',1.6);
      }
      for(let yy=-41;yy<100;yy+=37){
        ctx.fillStyle='#292e39';ctx.fillRect(x+3,yy,W/2-6,9);
        line(ctx,[x+3,yy+1,x+W/2-4,yy+1],'#ad8e61',1.4);
        for(let xx=x+15;xx<x+W/2-5;xx+=21){
          ctx.fillStyle='#c1a477';ctx.beginPath();ctx.arc(xx,yy+4,1.7,0,TAU);ctx.fill();
        }
      }
      // Перевернутые половины герба жука на каждой створке.
      ctx.fillStyle='#b49a71';
      ctx.beginPath();ctx.ellipse(x+W/2*.55,-5,12,20,0,0,TAU);ctx.strokeStyle='#c4a675';ctx.lineWidth=3;ctx.stroke();
      line(ctx,[x+W/2*.55,-25,x+W/2*.55,18],'#ceb082',2);
      ctx.restore();
    }
    // Латунный звон и лучи света из расширяющейся щели.
    if(p>0&&p<1){
      const k=Math.sin(Math.PI*p);
      ctx.globalAlpha=k*.25;
      ctx.fillStyle='#f8d9a1';
      ctx.fillRect(-4,-65,8,165);
      ctx.globalAlpha=1;
    }
    ctx.restore();
  }

  draw(ctx,viewL,viewR,viewT,viewB,time=0){
    const ar=this.arena;
    if(ar.zone)return; // поздняя арена Апофеоза разрушается, северной крепости там уже нет
    const startY=ar.top+this.start,endY=startY+this.height;
    if(viewR<ar.left || viewL>ar.right || viewB<startY || viewT>endY)return;
    if(!this.cached)this.build();
    ctx.drawImage(this.cached,ar.left,startY,ar.width,this.height);
    this.drawGate(ctx,this.gateProgress||0,time);
    // Живой огонь по сторонам ворот и вдоль северного укрепления.
    const y=ar.top;
    for(const x of [-220,-132,132,220,-ar.width/2+90,ar.width/2-90]){
      if(x+60<viewL||x-60>viewR)continue;
      torch(ctx,x,y+93,time,Math.abs(x)<140);
    }
  }
}
