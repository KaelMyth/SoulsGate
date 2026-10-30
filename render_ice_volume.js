// SoulsGate: версия 2 объёмной отрисовки Замёрзших и Тартаса.
// Не меняет AI, хитбоксы или тайминги. Для сравнения версия 1 остаётся доступна.
// Ортографическая камера: мировые (вперёд, вправо, высота) вращаются относительно
// направления персонажа; видимые стенки и дальние конечности сортируются.
import { IsometricIceEnemies } from './render_isometric_enemies.js';

const TAU=Math.PI*2;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const smooth=(a,b,d)=>a+(b-a)*d;
const INK='#121b29';
const STEEL=['#202c3e','#324357','#47596c','#607389','#8496a8','#b3c5d0'];
const ICE=['#315b81','#5b99c5','#9ad9f4','#e6f8ff'];

function fillPath(c,pts,fill,stroke=INK,lw=.85){
  if(pts.length<3)return;
  c.beginPath();
  c.moveTo(pts[0][0],pts[0][1]);
  for(let i=1;i<pts.length;i++)c.lineTo(pts[i][0],pts[i][1]);
  c.closePath();
  c.fillStyle=fill;c.fill();
  if(stroke){c.lineWidth=lw;c.strokeStyle=stroke;c.stroke();}
}
function seg(c,a,b,color,w=1){
  c.beginPath();c.moveTo(...a);c.lineTo(...b);
  c.lineCap='round';c.strokeStyle=color;c.lineWidth=w;c.stroke();
}
function grad(c,a,b,colors){
  const g=c.createLinearGradient(a[0],a[1],b[0],b[1]);
  for(let i=0;i<colors.length;i++)g.addColorStop(i/(colors.length-1),colors[i]);
  return g;
}
function arcPath(c,points){
  c.moveTo(...points[0]);
  for(let i=1;i<points.length-1;i++){
    const m=[(points[i][0]+points[i+1][0])*.5,(points[i][1]+points[i+1][1])*.5];
    c.quadraticCurveTo(points[i][0],points[i][1],m[0],m[1]);
  }
  c.lineTo(...points[points.length-1]);
}
function vec(a,b,s=1){return [a[0]+(b[0]-a[0])*s,a[1]+(b[1]-a[1])*s];}

export class IceVolumeArt extends IsometricIceEnemies {
  constructor(renderer){super(renderer);this.lit=1;this.near=1;}

  project(f,r,z){
    const ca=Math.cos(this.angle),sa=Math.sin(this.angle);
    return [f*ca-r*sa,(f*sa+r*ca)*.69-z*.98];
  }
  p(f,r,z){return this.project(f,r,z);}
  visibleFace(f,r){
    // Ось мирового Y направлена к игроку/камере.
    return f*Math.sin(this.angle)+r*Math.cos(this.angle);
  }
  facet(c,coords,fill,stroke=INK,w=.8){
    fillPath(c,coords.map(v=>this.p(...v)),fill,stroke,w);
  }
  line3(c,p0,p1,color,w=1){seg(c,this.p(...p0),this.p(...p1),color,w);}
  normalFill(n,metal=true){
    const k=clamp((n+1)*.5,0,1);
    return metal?STEEL[Math.min(5,Math.floor(k*5.2))]:
      k>.58?'#52627d':'#27334e';
  }
  // Металлический округлый "тюбик". Контур, мягкий рефлекс и отблеск
  // проходят по одной кривой, а не выглядят приклеенными плоскими прямоугольниками.
  tube(c,a,b,end,width,metal=true){
    const A=this.p(...a),B=this.p(...b),E=this.p(...end);
    const path=()=>{
      c.beginPath();c.moveTo(...A);c.quadraticCurveTo(...B,...E);
    };
    c.lineCap='round';c.lineJoin='round';
    path();c.strokeStyle=INK;c.lineWidth=width+2.8;c.stroke();
    // На мобильном не выделяем отдельный CanvasGradient для каждой руки
    // и голени: выпуклость получается тремя концентрическими штрихами.
    path();c.lineWidth=width;
    c.strokeStyle=metal?'#64788f':'#3a4968';c.stroke();
    path();c.strokeStyle=metal?'rgba(222,244,255,.42)':'rgba(158,186,221,.31)';
    c.lineWidth=Math.max(.8,width*.22);c.stroke();
    c.lineCap='butt';
  }
  // Сегмент круглой брони (вместо октогональной коробки): 12 дуг вокруг
  // корпуса, задние сегменты затемняются; видимые выбираются из нормалей.
  shell(c,rings,segments=16,metal=true){
    const a=this.angle;
    const surfaces=[];
    for(let j=0;j<rings.length-1;j++){
      const A=rings[j],B=rings[j+1];
      for(let i=0;i<segments;i++){
        const q0=i*TAU/segments,q1=(i+1)*TAU/segments,mid=(q0+q1)*.5;
        const ny=Math.cos(mid)*Math.sin(a)+Math.sin(mid)*Math.cos(a);
        if(ny<-.095)continue;
        const xyz=(q,t)=>[Math.cos(q)*t.f,Math.sin(q)*t.r,t.z];
        const pts=[xyz(q0,A),xyz(q1,A),xyz(q1,B),xyz(q0,B)];
        surfaces.push({ny,pts,t:j,mid});
      }
    }
    // Сначала дальние грани. При переходе через 90/180/270° порядок
    // перестраивается, поэтому нет перепрыгивающих через корпус плит.
    surfaces.sort((p,q)=>p.ny-q.ny);
    for(const s of surfaces){
      const k=clamp(s.ny,0,1);
      const fill=metal?STEEL[Math.min(5,Math.floor(k*4.5)+(s.t===0?0:1))]:
        (k>.65?'#536382':'#303d5c');
      this.facet(c,s.pts,fill,'rgba(12,24,39,.4)',.45);
    }
  }
  mantle(c,st,boss,front){
    const x=-7,y=boss?13:10,top=boss?48:39;
    const fall=boss?53:35,t=this.renderer.clock+st.seed;
    const wind=st.weight*4.5,flap=Math.sin(t*2.5)*2.5;
    // Кривой нижний контур с несколькими слоями и мягкими складками.
    const L=this.p(-23-wind,-y*1.15,3),R=this.p(-26-wind,y*1.15,2);
    const topL=this.p(-6,-y,top),topR=this.p(-6,y,top);
    const midL=this.p(-19-wind,-y*1.12,12+flap),midR=this.p(-19-wind,y*1.1,14-flap);
    const bottom=this.p(-29-wind,0,boss?2:4);
    c.beginPath();c.moveTo(...topL);
    c.quadraticCurveTo(...this.p(-18,-y,top*.85),...midL);
    c.quadraticCurveTo(...L,...bottom);
    c.quadraticCurveTo(...R,...midR);
    c.quadraticCurveTo(...this.p(-15,y,top*.85),...topR);
    c.closePath();
    c.fillStyle=grad(c,topL,bottom,
      front?['#647795','#323d60','#1c233a']:['#394764','#272c48','#141b2e']);
    c.fill();
    c.strokeStyle='#19243b';c.lineWidth=1.4;c.stroke();
    // Тканые ребра повторяют кривизну ткани и создают глубину.
    for(const r of [-y*.65,0,y*.65]){
      const p0=this.p(-7,r,top-5),p1=this.p(-20-wind,r*.85,15);
      const p2=this.p(-25-wind,r*1.1,4+flap*.5);
      c.beginPath();c.moveTo(...p0);c.quadraticCurveTo(...p1,...p2);
      c.strokeStyle='rgba(163,188,217,.18)';c.lineWidth=.9;c.stroke();
    }
    if(boss){
      for(const v of [-8,8]){
        this.iceSpike(c,[-19-wind,v,6],[-28-wind,v*1.1,10],2.1);
      }
    }
  }
  iceSpike(c,base,tip,width=2.4){
    // Кристалл — не одиночный треугольник, а четырехгранная призма
    // с торцевой площадкой и бликом, меняющимися вместе с ракурсом.
    const [f,r,z]=base;
    const basis=[
      [f-width,r-width*.75,z],
      [f+width*.5,r-width,z+width*.5],
      [f+width,r+width*.75,z],
      [f-width*.4,r+width,z-width*.25]
    ];
    const depth=p=>this.visibleFace(p[0],p[1]);
    const sides=basis.map((p,i)=>({
      pts:[p,basis[(i+1)%4],tip],
      depth:(depth(p)+depth(basis[(i+1)%4]))*.5,
      index:i
    })).sort((a,b)=>a.depth-b.depth);
    for(const q of sides){
      this.facet(c,q.pts,ICE[q.depth>0?Math.min(3,q.index+1):0],null);
    }
    this.line3(c,basis[1],tip,'rgba(234,251,255,.76)',.7);
  }
  greave(c,side,step,boss,st){
    const r=side*(boss?9.5:6.9);
    const swing=st.weight*step;
    const front=swing*5.7;
    const up=Math.max(0,swing)*4.5;
    const hip=[1.4,r,20],knee=[3.1+front*.48,r,11+up*.5],ankle=[4.8+front,r,3+up];
    // Отдельные колени, латные поножи, закруглённый металл.
    this.tube(c,hip,knee,ankle,boss?9:7);
    this.tube(c,[4.7+front,r,5+up],[7.5+front,r,2+up],
      [11+front,r,1+up],boss?9.6:8.7);
    const p=this.p(...knee);
    c.beginPath();c.ellipse(p[0],p[1],boss?4.8:3.7,boss?3.4:2.6,0,0,TAU);
    c.fillStyle='#899cb1';c.fill();
    c.lineWidth=.9;c.strokeStyle='#27374b';c.stroke();
    const highlight=this.p(5.6+front,r-1,6+up);
    seg(c,highlight,this.p(9+front,r-.6,3+up),'rgba(229,243,255,.47)',1.3);
  }
  pauldron(c,side,boss){
    const r=side*(boss?13.5:10.5),z=boss?43:34;
    const x=this.p(-4,r,z+2),y=this.p(5,r,z-8);
    const Q=this.p(7,r+side*3,z-12);
    const L=this.p(-6,r+side*1.5,z-8);
    c.beginPath();c.moveTo(...x);
    c.quadraticCurveTo(...this.p(1,r+side*5,z+7),...y);
    c.quadraticCurveTo(...Q,...L);c.closePath();
    const towards=this.visibleFace(0,side);
    c.fillStyle=grad(c,x,Q,towards>0?
      ['#b5c4d0','#71849e','#34445d']:['#72849a','#42556e','#222f43']);
    c.fill();c.strokeStyle=INK;c.lineWidth=1.15;c.stroke();
    // Резная выпуклая накладка, клёпки и закруглённый край.
    const ridge=[this.p(-3,r,z+3),this.p(2,r+side*3,z+2),this.p(6,r+side*2,z-7)];
    c.beginPath();arcPath(c,ridge);
    c.strokeStyle='rgba(227,245,255,.62)';c.lineWidth=1.25;c.stroke();
    const rivet=this.p(3,r+side*3,z-5);
    c.beginPath();c.arc(...rivet,1.2,0,TAU);
    c.fillStyle='#ccdded';c.fill();
    this.iceSpike(c,[-3,r,z+3],[-9,r+side*2.2,z+(boss?20:14)],boss?3.5:2.2);
  }
  body(c,boss,front){
    const waist=boss?18:15,shoulder=boss?39:34;
    const rows=[
      {z:waist,f:6.3,r:7.5},
      {z:waist+7,f:8.8,r:9.2},
      {z:shoulder-3,f:10,r:boss?13:10.3},
      {z:shoulder+2,f:7.3,r:boss?12:10},
      {z:shoulder+4,f:4.9,r:8.0}
    ];
    this.shell(c,rows,16);
    const face=front?1:-1,n=Math.sin(this.angle)*face;
    if(n>-.05){
      const f=front?10.1:-9.2;
      // Рельефная центральная пластина опоясывает объём; исчезает при
      // повороте строго боком естественно, а не дискретным переключателем.
      const q=front?[
        [f,-6.8,shoulder-5],[f+1,0,shoulder-9],
        [f,-6.8,waist+5],[f+1,0,waist+3],[f,6.8,waist+5],
        [f+1,0,shoulder-9],[f,6.8,shoulder-5]
      ]:[
        [f,-6,shoulder-4],[f,6,shoulder-4],
        [f,6,waist+5],[f,-6,waist+5]
      ];
      // Криволинейная нагрудная пластина с центральным гребнем.
      // Сзади своя сплошная пластина: нельзя рисовать передние
      // сегменты с индексами, которых у спинки не существует.
      if(front){
        this.facet(c,[q[0],q[1],q[6]],'#899bae',null);
        this.facet(c,[q[1],q[2],q[3],q[4]],'#72869b',null);
        this.facet(c,[q[1],q[4],q[5],q[6]],'#566b83',null);
        this.line3(c,[f+.5,0,shoulder-8],[f+.5,0,waist+5],
          'rgba(227,243,255,.74)',1.0);
        this.line3(c,[f,-5,shoulder-5],[f+1,0,shoulder-9],
          'rgba(245,251,255,.46)',.8);
      }else{
        this.facet(c,q,'#3d4b63',null);
        this.line3(c,[f,-5,shoulder-5],[f,-5,waist+5],'#7b8da3',.85);
        this.line3(c,[f,5,shoulder-5],[f,5,waist+5],'#253a51',.85);
      }
    }
    // Ткань и пояс с рельефной застёжкой.
    this.shell(c,[{z:waist-2,f:7.7,r:7.7},{z:waist+2,f:8.2,r:8.3}],12,false);
    const y=this.p(7,0,waist+1);
    c.beginPath();c.arc(...y,2,0,TAU);
    c.fillStyle='#b4a485';c.fill();
  }
  helmet(c,boss,st){
    const neck=boss?43:38,cap=boss?58:49;
    // Закруглённый шлем состоит из полусферических колец и внутренней
    // затылочной пластины. Видимые фасеты меняются вместе с facing.
    const rings=[
      {z:neck-2,f:6,r:7.1},
      {z:neck+4,f:8.4,r:9.4},
      {z:cap-5,f:8.9,r:9.7},
      {z:cap+1,f:7.4,r:8.0},
      {z:cap+5,f:3.5,r:4.2},
      {z:cap+6,f:.4,r:.5}
    ];
    this.shell(c,rings,18);
    const front=this.visibleFace(1,0)>0.075;
    const rear=this.visibleFace(-1,0)>0.06;
    // Фронтальная узкая маска с отдельным носовым гребнем: полностью
    // скрыта за черепом со спины.
    if(front){
      const F=9,r=7;
      this.facet(c,[[F,-r,neck+5],[F+1,-r*.64,neck+14],
        [F+1,r*.64,neck+14],[F,r,neck+5]],
        '#111b2d',null);
      for(const side of [-1,1]){
        this.facet(c,[[F+1,side*1.5,neck+12],[F+1,side*6,neck+11],
          [F+1,side*6,neck+9],[F+1,side*1.5,neck+10]],
          '#b5ecff',null);
      }
      this.line3(c,[F+1,0,neck+14],[F+1,0,neck+2],
        '#accbe3',1.65);
    }
    if(rear){
      for(const side of [-1,1]){
        this.line3(c,[-8.2,side*5,neck+4],[-8.2,side*4,cap+1],
          '#a5b6ca',1.25);
      }
      this.line3(c,[-8,0,neck+1],[-8,0,cap-1],'#24364c',2);
    }
    const near=this.near;
    // Боковые сочленения и наушники поверх шлема; видны при боковом
    // развороте, не висят на лице.
    const v=near*8.3;
    this.facet(c,[[-3,v,neck+13],[5,v,neck+13],[7,v,neck+4],
      [3,v,neck-1],[-4,v,neck+3]],'#566b84',INK,1.2);
    this.line3(c,[1,v,neck+10],[3,v,neck+3],
      'rgba(209,236,250,.6)',1);
    this.iceSpike(c,[-2,-5,cap+3],[-6,-8,cap+(boss?21:13)],
      boss?4:2.8);
    this.iceSpike(c,[-2,5,cap+3],[-6,8,cap+(boss?21:13)],
      boss?4:2.8);
    this.iceSpike(c,[1,0,cap+4],[-2,0,cap+(boss?26:15)],
      boss?4.2:2.4);
    if(boss){
      for(const side of [-1,1]){
        this.iceSpike(c,[3,side*8,cap-3],
          [1,side*15,cap+11],3.5);
      }
    }
  }
  arm(c,side,st,boss,attacking){
    const near=side===this.near,r=side*(boss?16:12);
    const base=[-1,r, boss?40:34];
    const elbow=[5+(st.weight*Math.sin(st.walk+(side>0?0:Math.PI))*2),r+side*2,boss?31:27];
    const wrist=[12+(attacking?4:0),r+side,boss?24:20+(attacking?8:0)];
    this.tube(c,base,elbow,wrist,boss?10.5:7.6);
    // Выпуклые локтевые шипы и пластина запястья следуют повороту.
    const pos=this.p(...elbow);
    c.beginPath();c.ellipse(pos[0],pos[1],boss?4:3,boss?3:2.5,0,0,TAU);
    c.fillStyle=near?'#a2b3c5':'#5c6c85';c.fill();
    this.iceSpike(c,[elbow[0]-2,elbow[1],elbow[2]+2],
      [elbow[0]-6,elbow[1]+side*3,elbow[2]+8],1.8);
  }
  shield(c,st,boss){
    const side=-1,r=side*(boss?19:15),z=boss?26:22;
    const raised=st.attack*4,front=10;
    const h=boss?22:15,w=boss?12:9;
    const face=[
      [front,r-w,z+h*.72+raised],
      [front+2,r,z+h+raised],
      [front+2,r+w,z+h*.72+raised],
      [front+3,r+w*1.1,z-h*.3+raised],
      [front+1,r,z-h+raised],
      [front,r-w*1.1,z-h*.3+raised]
    ],p=face.map(v=>this.p(...v));
    const back=p.map(v=>[v[0]-1.6,v[1]-2]);
    fillPath(c,back,'#0e1827',INK,2.6);
    // Face gradient creates genuine curved reflection, boss shield bigger.
    const fill=grad(c,p[0],p[2],['#324156','#9aabbd','#465970']);
    fillPath(c,p,fill,'#162234',1.5);
    const center=this.p(front+4,r,z+2+raised);
    const edgeA=this.p(front+1,r-w*.75,z+h*.55+raised);
    const edgeB=this.p(front+1,r+w*.75,z+h*.55+raised);
    fillPath(c,[edgeA,center,edgeB],'rgba(224,243,255,.22)',null);
    const ridge=this.p(front+1,r,z-h*.8+raised);
    seg(c,center,ridge,'#c2d6e3',1.5);
    c.beginPath();c.arc(...center,boss?3.2:2.4,0,TAU);
    c.fillStyle='#a5c9d6';c.fill();
    c.strokeStyle='#21374b';c.lineWidth=1;c.stroke();
    this.iceSpike(c,[front+2,r,z+h*.7+raised],
      [front+4,r,z+h+5+raised],1.6);
  }
  sword(c,st,boss,bs,e){
    const attack=st.attack;
    const cast=boss&&['bladeIn','bladeWave','bladeGap','squadCast','blastTele'].includes(bs);
    const dash=boss&&(bs==='dash'||bs==='tele');
    const hand=[13,boss?18:14,boss?24:19]; // правая рука, не переключается при развороте
    const w=this.p(...hand);
    const length=boss?51:30;
    // Реальная дуга замаха: при подготовке клинок поднимается, в момент
    // попадания опускается ниже горизонтали, после чего возвращается в стойку.
    // Никаких мгновенных перескоков поз между фазами.
    let tilt=-.17+.075*Math.sin(st.walk)*st.weight;
    const state=e?.atk?.state||'idle';
    if(cast)tilt=1.12+.1*Math.sin(this.renderer.clock*2.1);
    else if(dash)tilt=.12;
    else if(bs==='blast')tilt=-.85;
    else if(bs==='recover')tilt=-.45;
    else if(state==='windup'){
      const length=Math.max(.05,e?.def?.attack?.windup||.7);
      const progress=clamp((e?.atk?.t||0)/length,0,1);
      tilt=-.17+1.56*(progress*progress*(3-2*progress));
    }else if(state==='strike'){
      const length=Math.max(.05,e?.def?.attack?.strike||.25);
      const progress=clamp((e?.atk?.t||0)/length,0,1);
      tilt=1.39-2.26*(progress*progress*(3-2*progress));
    }else if(attack>.07)tilt=-.17+attack*.83;
    const axis=[Math.cos(tilt),0,Math.sin(tilt)];
    const tip=[hand[0]+length*axis[0],hand[1],hand[2]+length*axis[2]];
    const base=[hand[0]+5,hand[1],hand[2]+(cast?3:0)];
    const edgeW=boss?3.9:2.5;
    const side=[0,edgeW,1.8],other=[0,-edgeW,-1.8];
    const left=[base[0]+side[0],base[1]+side[1],base[2]+side[2]];
    const right=[base[0]+other[0],base[1]+other[1],base[2]+other[2]];
    const mid=[base[0]+axis[0]*length*.8,base[1],base[2]+axis[2]*length*.8+2];
    // Ледяной клинок — вытянутая призма с центральным ребром, объёмным
    // поперечным сечением, отдельной более тёмной боковой гранью.
    this.facet(c,[left,tip,mid,base],'#70b9df',INK,1.1);
    this.facet(c,[base,mid,tip,right],'#a6dff8',null);
    this.line3(c,base,tip,'rgba(247,255,255,.78)',1.0);
    const crossL=[hand[0]-3,hand[1]-6,hand[2]],crossR=[hand[0]-3,hand[1]+6,hand[2]];
    this.line3(c,crossL,crossR,'#c7bdae',3.3);
    this.line3(c,[hand[0]-7,hand[1],hand[2]-2],base,'#4b4344',3.7);
    if(boss){
      for(const x of [.4,.7]){
        const at=[base[0]+length*x*axis[0],hand[1],base[2]+length*x*axis[2]];
        this.iceSpike(c,at,[at[0]+2,at[1]+5,at[2]+6],1.7);
      }
    }
  }
  bow(c,st,aim){
    const r=14,z=25,u=13; // лук всегда в правой руке
    const tension=clamp(aim,0,1),tipTop=this.p(u+8,r,z+23),tipBottom=this.p(u+8,r,z-17);
    const center=this.p(u+18,r,z+4),hand=this.p(u+1-tension*7,r,z+4);
    // Две боковые кромки делают лук толще плоской дуги.
    for(const off of [-1.7,1.7]){
      const t=this.p(u+8,r+off,z+23),b=this.p(u+8,r+off,z-17);
      const mid=this.p(u+21,r+off,z+4);
      c.beginPath();c.moveTo(...t);c.quadraticCurveTo(...mid,...b);
      c.strokeStyle=off<0?'#334d67':'#9fd6f2';
      c.lineWidth=off<0?4.1:2.9;c.lineCap='round';c.stroke();
    }
    seg(c,tipTop,hand,'#d1e2e9',.95);
    seg(c,hand,tipBottom,'#d1e2e9',.95);
    if(tension>.09){
      const tip=this.p(u+39,r,z+4);
      seg(c,hand,tip,'#f4d2a1',1.8);
      const flame=this.p(u+37,r,z+4),tail=this.p(u+31,r,z+4);
      const flick=Math.sin(this.renderer.clock*16+st.seed)*2;
      c.save();c.globalCompositeOperation='lighter';
      c.fillStyle='#ff9b35';c.beginPath();
      c.moveTo(flame[0]+6,flame[1]);
      c.quadraticCurveTo(tail[0]-7,tail[1]-4-flick,tail[0]-6,tail[1]);
      c.quadraticCurveTo(tail[0]-7,tail[1]+5+flick,flame[0]+6,flame[1]);
      c.fill();c.fillStyle='#ffe9ae';
      c.beginPath();c.arc(flame[0],flame[1],2,0,TAU);c.fill();c.restore();
    }
    const quiver=[-9,-8,30];
    this.facet(c,[[-10,-12,19],[-14,-12,19],[-14,-12,32],[-10,-12,32]],
      '#253950',INK,1);
    for(let i=-1;i<=1;i++){
      const v=quiver[1]+i*2.5;
      this.line3(c,[-12,v,30],[-16,v,43+i*2],'#bed9e7',1.1);
      this.line3(c,[-16,v,43+i*2],[-19,v,47+i*2],'#ffb55c',1.8);
    }
  }
  ram(c,st){
    const attack=st.attack;
    const r=0,z=23,u=11; // таран всегда на оси груди
    const tip=[u+34+attack*5,0,z+4],baseA=[u+5,-8,z+7],baseB=[u+5,8,z+7];
    const baseC=[u+5,8,z-5],baseD=[u+5,-8,z-5];
    this.facet(c,[baseA,baseB,tip],'#7189a8',INK,1.4);
    this.facet(c,[baseB,baseC,tip],'#3d5b82',null);
    this.facet(c,[baseC,baseD,tip],'#203a5a',null);
    this.facet(c,[baseD,baseA,tip],'#9cd7f4',null);
    this.line3(c,[u+8,0,z+8],tip,'#e7f9ff',1.25);
    for(const side of [-1,1]){
      this.iceSpike(c,[u+11,side*5,z+3],[u+16,side*9,z+11],2.2);
    }
  }
  faceOrder(st,boss){
    const sine=Math.sin(st.dir);
    return {showFront:sine>.065,showBack:sine<-.065,near:this.near};
  }
  advance(e,st,x,y,boss,kind){
    const r=this.renderer,dt=clamp(r.dt||1/60,0,.05);
    const vx=e.x-e.prevX,vy=e.y-e.prevY;
    const speed=Math.hypot(vx,vy)/Math.max(dt,.004);
    const walking=speed>4&&e.freezeT<=0;
    const special=boss&&r.boss?.enemy===e?(r.boss.state||'idle'):'idle';
    let target=st.dir,turnRate=6;
    if(boss&&r.boss?.enemy===e&&r.boss.line&&
      ['tele','dash'].includes(special)){
      target=Math.atan2(r.boss.line.dy,r.boss.line.dx);
      turnRate=special==='dash'?22:9;
    }else if(kind==='ram'&&e.atk?.state!=='idle'&&
      Math.hypot(e.atk?.dirX||0,e.atk?.dirY||0)>.2){
      target=Math.atan2(e.atk.dirY,e.atk.dirX);turnRate=13;
    }else if(kind==='archer'||e.aim>0||
      ['squadCast','blastTele','bladeIn','bladeWave'].includes(special)){
      target=Math.atan2(r.hero.y-y,r.hero.x-x);turnRate=9;
    }else if(walking){
      target=Math.atan2(vy,vx);turnRate=9;
    }else{
      // Враги в покое не вертятся каждым кадром по автоатаке героя.
      target=st.dir;turnRate=2.5;
    }
    if(e.freezeT<=0)st.dir+=Math.atan2(Math.sin(target-st.dir),
      Math.cos(target-st.dir))*(1-Math.exp(-dt*turnRate));
    st.dir=Math.atan2(Math.sin(st.dir),Math.cos(st.dir));
    st.weight=smooth(st.weight,walking?1:0,1-Math.exp(-dt*9));
    if(e.freezeT<=0)st.walk+=dt*(boss?7:kind==='ram'?8:10)*st.weight;
    const attacking=(e.atk?.state==='windup'||e.atk?.state==='strike'||e.aim>0||
      (boss&&special!=='idle'&&special!=='recover'));
    st.attack=smooth(st.attack,attacking?1:0,1-Math.exp(-dt*12));
    st.hit=smooth(st.hit,e.flash>0?1:0,1-Math.exp(-dt*15));
  }
  draw(ctx,e,x,y,kind,hit=false,options={}){
    if(!kind)return false;
    const st=options.st||this.state(e,x,y);
    const boss=kind==='tartas';
    const bs=options.bState||
      (boss&&this.renderer.boss?.enemy===e?this.renderer.boss.state:'idle');
    if(!options.death)this.advance(e,st,x,y,boss,kind);
    this.angle=st.dir;
    this.near=Math.cos(st.dir)>=0?1:-1;
    const {showFront,showBack}=this.faceOrder(st,boss);
    const r=e.radius,scale=r/(boss?27:kind==='ram'?19:17); // пропорции близки герою
    const walking=st.weight,phase=st.walk;
    const strike=st.attack>.14;
    const frozen=e.freezeT>0;
    const fall=clamp(options.death||0,0,1),deathAlpha=1-fall;
    // Заимствуем узнаваемое холодное свечение Тартаса и его телеграфы.
    if(boss&&this.renderer.getGlow&&!options.death){
      const glow=this.renderer.getGlow('blue');
      ctx.save();ctx.globalCompositeOperation='lighter';
      ctx.globalAlpha=.12+.08*Math.sin(this.renderer.clock*3+st.seed);
      ctx.drawImage(glow,x-r*2.2,y-r*2.6,r*4.4,r*4.8);
      if(['bladeIn','bladeWave','bladeGap','squadCast','blastTele'].includes(bs)){
        ctx.globalAlpha=.38+.12*Math.sin(this.renderer.clock*5);
        ctx.strokeStyle='#9bd8f4';ctx.lineWidth=1.6;
        ctx.beginPath();ctx.arc(x,y,r*1.78,0,TAU);ctx.stroke();
      }
      ctx.restore();
    }
    ctx.save();ctx.translate(x,y);
    if(fall>0){
      ctx.translate(0,fall*10);
      ctx.rotate(fall*.11);
      ctx.scale(1+fall*.25,1-fall*.68);
      ctx.globalAlpha=clamp(deathAlpha*.9,0,1);
    }
    ctx.scale(scale,scale);
    const bob=frozen?0:Math.abs(Math.sin(phase))*walking*1.15+
      Math.sin(this.renderer.clock*2.3+st.seed)*.36;
    ctx.translate(0,-bob);
    // Под ногами только вытянутая мягкая тень, без видимой круглой границы.
    const shadow=ctx.createRadialGradient(2,1,1,2,1,boss?24:16);
    shadow.addColorStop(0,'rgba(4,9,18,.42)');
    shadow.addColorStop(1,'rgba(3,6,13,0)');
    ctx.fillStyle=shadow;
    ctx.beginPath();ctx.ellipse(2,1,boss?24:16,boss?10:7,0,0,TAU);ctx.fill();

    // Из-за наклона камеры части, находящиеся дальше от наблюдателя,
    // всегда рисуются за телом, а близкие поверх него. Плащ меняет место
    // слоя при развороте на спину, а лицо скрывается за затылком.
    const backVisible=Math.sin(st.dir)<0;
    if(!backVisible)this.mantle(ctx,st,boss,false);
    for(const side of [-this.near,this.near]){
      const gait=Math.sin(phase+(side>0?0:Math.PI));
      this.greave(ctx,side,frozen?0:gait,boss,st);
    }
    if(kind==='soldier'||boss){
      if(-1!==this.near)this.shield(ctx,st,boss);
    }
    this.arm(ctx,-this.near,st,boss,strike);
    this.pauldron(ctx,-this.near,boss);
    // Оружие закреплено за правой (+r) рукой. Если она с дальнего бока,
    // клинок и лук скрываются корпусом, а не перепрыгивают на другую сторону.
    if(this.near===-1 && kind!=='ram'){
      if(kind==='archer')this.bow(ctx,st,
        e.aim>0?1-e.aim/Math.max(.01,e.aimTotal):0);
      else this.sword(ctx,st,boss,bs,e);
    }
    this.body(ctx,boss,!backVisible);
    // Затылочный шов всегда геометрически сзади, не нарисован поверх лица.
    if(backVisible)this.mantle(ctx,st,boss,true);
    this.arm(ctx,this.near,st,boss,strike);
    this.pauldron(ctx,this.near,boss);
    if(kind==='soldier'||boss){
      if(-1===this.near)this.shield(ctx,st,boss);
    }
    this.helmet(ctx,boss,st);
    if(kind==='ram')this.ram(ctx,st);
    else if(this.near===1){
      if(kind==='archer')this.bow(ctx,st,
        e.aim>0?1-e.aim/Math.max(.01,e.aimTotal):0);
      else this.sword(ctx,st,boss,bs,e);
    }
    if(frozen){
      ctx.globalAlpha=deathAlpha*.55;
      for(let i=0;i<3;i++)
        this.iceSpike(ctx,[-4,(i-1)*7,25+i*4],
          [-7,(i-1)*10,34+i*5],2);
      ctx.globalAlpha=deathAlpha;
    }
    if(hit||st.hit>.1){
      const p0=this.p(9,-5,27),p1=this.p(10,5,38);
      const fx=ctx.createLinearGradient(...p0,...p1);
      fx.addColorStop(0,'rgba(255,255,255,0)');
      fx.addColorStop(.55,'rgba(255,255,255,'+
        clamp((hit?.34:st.hit*.3)*deathAlpha,0,.4)+')');
      fx.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle=fx;ctx.beginPath();
      ctx.ellipse((p0[0]+p1[0])*.5,(p0[1]+p1[1])*.5,13,18,0,0,TAU);ctx.fill();
    }
    ctx.restore();
    return true;
  }
}
