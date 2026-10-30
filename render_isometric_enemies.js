// SoulsGate: объёмные Canvas-модели замёрзших воинов и Тартаса.
// Рисуем исходные мотивы (ледяной шлем, стальные плиты, колючие наплечники,
// плащ, клинок/лук/таран) как 2.5D-меш из фронтальных, боковых и задних граней.
// В отличие от старой схемы top-down, высота z проецируется в отдельную ось.
// Состояния анимации наследуются от существующей AI, баланс не затрагивается.
const TAU=Math.PI*2;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const ease=(a,b,t)=>a+(b-a)*t;
const ANGLE=Math.PI/180;
const PALETTE={
  armor:'#343e52',front:'#68788f',side:'#46566e',top:'#8799ab',
  shade:'#1d2638',edge:'#101b2b',ice:'#7bc9f3',light:'#e4f7ff',
  cloth:'#262845',clothLit:'#515778',leather:'#2a303e',gold:'#a19a8a',
};
function poly(ctx,points,fill,stroke='#142031',width=1){
  ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);
  for(let i=1;i<points.length;i++)ctx.lineTo(points[i][0],points[i][1]);
  ctx.closePath();
  if(fill){ctx.fillStyle=fill;ctx.fill();}
  if(stroke){ctx.lineWidth=width;ctx.strokeStyle=stroke;ctx.stroke();}
}
function line(ctx,a,b,col,width=1){
  ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);
  ctx.strokeStyle=col;ctx.lineWidth=width;ctx.stroke();
}
function gem(ctx,points,fill){
  poly(ctx,points,fill,PALETTE.light,.85);
  if(points.length>2)line(ctx,points[0],points[2],'rgba(245,252,255,.48)',.65);
}
function wrap(a){
  return Math.atan2(Math.sin(a),Math.cos(a));
}
export class IsometricIceEnemies {
  constructor(renderer){
    this.renderer=renderer;
    this.states=new WeakMap();
    this.corpses=[];
    this.enabled=true;
    this.maxCorpses=18;
    this.lastFrame=0;
  }
  kind(e){
    const enemies=this.renderer.cfg.enemies;
    if(e.def===enemies.tartas)return 'tartas';
    if(e.def===enemies.frozenArcher)return 'archer';
    if(e.def===enemies.frozenSoldier)return 'soldier';
    if(e.def===enemies.frozenRam)return 'ram';
    return null;
  }
  state(e,x,y){
    let st=this.states.get(e);
    if(!st||st.gen!==e.gen){
      const face=Math.atan2(this.renderer.hero.y-y,this.renderer.hero.x-x);
      st={gen:e.gen,dir:face,walk:0,weight:0,hit:0,attack:0,seed:(e.gen*2.399+e.x*.017)};
      this.states.set(e,st);
    }
    return st;
  }
  advance(e,st,x,y,boss,kind){
    const r=this.renderer,dt=clamp(r.dt||1/60,0,.05);
    const m=Math.hypot(e.x-e.prevX,e.y-e.prevY)/(Math.max(dt,.004));
    const moving=m>4&&e.freezeT<=0;
    const target= boss && r.boss?.enemy===e && r.boss.line && (r.boss.state==='dash'||r.boss.state==='tele')
      ?Math.atan2(r.boss.line.dy,r.boss.line.dx)
      :kind==='ram' && e.atk?.state!=='idle' && e.atk
      ?Math.atan2(e.atk.dirY,e.atk.dirX)
      :kind==='archer' || e.aim>0 || !moving
      ?Math.atan2(r.hero.y-y,r.hero.x-x)
      :Math.atan2(e.y-e.prevY,e.x-e.prevX);
    const rate=boss?.12:kind==='ram'?11:9;
    if(e.freezeT<=0)st.dir+=wrap(target-st.dir)*(1-Math.exp(-dt*rate));
    st.dir=wrap(st.dir);
    st.weight=ease(st.weight,moving?1:0,1-Math.exp(-dt*9));
    st.walk+=dt*(boss?6:kind==='ram'?8:11)*st.weight;
    const attacking=(e.atk?.state==='windup'||e.atk?.state==='strike'||e.aim>0||
      (boss&&r.boss?.enemy===e&&r.boss.state!=='idle'));
    st.attack=ease(st.attack,attacking?1:0,1-Math.exp(-dt*11));
    st.hit=ease(st.hit,e.flash>0?1:0,1-Math.exp(-dt*16));
  }
  // Объём строится из точек (вперёд, вправо, вверх). Поворот тела меняет
  // реальный ракурс каждой отдельной детали, а не вращает плоскую картинку.
  project(u,v,z){const a=this.angle;
    return [Math.cos(a)*u-Math.sin(a)*v, (Math.sin(a)*u+Math.cos(a)*v)*.62-z];
  }
  mesh(ctx,verts,color,stroke,width=1){
    poly(ctx,verts.map(p=>this.project(p[0],p[1],p[2])),color,stroke,width);
  }
  rib(ctx,vertices,color,width=1){
    for(let i=0;i<vertices.length-1;i++){
      line(ctx,this.project(...vertices[i]),this.project(...vertices[i+1]),color,width);
    }
  }
  crystal(ctx,u,v,z,du,dv,dz,size=2){
    const root=[this.project(u,v-size,z),this.project(u,v+size,z)];
    const tip=this.project(u+du,v+dv,z+dz);
    gem(ctx,[root[0],tip,root[1]],PALETTE.ice);
  }
  boot(ctx,u,v,swing,heavy){
    const z=Math.max(0,swing)*2.8;
    const x=u+Math.sin(swing*.65)*2.0;
    this.mesh(ctx,[[x-4,v-3,5+z],[x+4,v-3,5+z],[x+6,v-1,z],[x+7,v+3,z],[x-4,v+3,z]],PALETTE.shade,PALETTE.edge,1.2);
    this.mesh(ctx,[[x-3,v-3,6+z],[x+3,v-3,6+z],[x+4,v+2,6+z],[x-3,v+3,6+z]],heavy?'#748498':'#5e718b',PALETTE.edge,.9);
    this.mesh(ctx,[[x+4,v-3,5+z],[x+7,v-1,z],[x+7,v+3,z],[x+4,v+2,6+z]],'#29394d',null);
    this.rib(ctx,[[x-1,v-2,6+z],[x+3,v-1,6+z]],'rgba(226,241,255,.5)',.8);
  }
  cape(ctx,st,boss,back){
    const t=this.renderer.clock;
    const flap=Math.sin(t*2.8+st.seed)*1.7;
    const drag=st.weight*4.5;
    const peak=boss?42:29;
    const tail=boss?8:5;
    const l=back?-16:-11;
    this.mesh(ctx,[[-7,-9,peak],[-8,9,peak],[-l+3+drag,13,5],
      [-22+drag,10,2+tail],[-18+drag,0,5],[-25+drag,-10,3+tail],
      [-16+drag,-13,6]],
      PALETTE.cloth,PALETTE.edge,1.5);
    this.mesh(ctx,[[-9,-8,peak-5],[-14,-5,24],[-18+drag+flap,-9,5],[-15+drag,1,7],
      [-14,-1,22]],PALETTE.clothLit,null);
    this.mesh(ctx,[[-9,4,peak-6],[-12,10,24],[-25+drag,11,4],[-17+drag,6,6]],
      '#22233d',null);
    this.rib(ctx,[[-13,-7,22],[-17+drag,-10,5]],'rgba(131,155,197,.48)',.8);
    this.crystal(ctx,-20+drag,-8,6,-2,-2,4,2);
    this.crystal(ctx,-23+drag,9,4,-2,1,5,1.6);
  }
  torso(ctx,boss,st,back){
    const top=boss?43:32,waist=boss?19:14,w=boss?13:9,d=boss?8:7;
    // 3D поясница, панцирь, две боковые плиты: видимые грани зависят от
    // проекции facing и перекрываются в исходном порядке геометрии.
    this.mesh(ctx,[[-d,-w,waist],[d,-w,waist],[d,w,waist],[-d,w,waist]],
      PALETTE.shade,PALETTE.edge,1);
    this.mesh(ctx,[[-d,-w,waist],[-d,w,waist],[-d,w,top],[-d,-w,top]],
      back?PALETTE.front:'#344157',PALETTE.edge,1.2);
    this.mesh(ctx,[[-d,w,waist],[d,w,waist],[d,w,top],[-d,w,top]],
      '#425267',PALETTE.edge,1);
    this.mesh(ctx,[[-d,-w,waist],[d,-w,waist],[d,-w,top],[-d,-w,top]],
      '#53647c',PALETTE.edge,1);
    this.mesh(ctx,[[d,-w,waist],[d,w,waist],[d,w,top],[d,-w,top]],
      back?PALETTE.shade:PALETTE.front,PALETTE.edge,1.25);
    this.mesh(ctx,[[-d,-w,top],[d,-w,top],[d,w,top],[-d,w,top]],
      PALETTE.top,PALETTE.edge,1);
    // Грудная угловатая бронеплита основана на прежнем длинном бейвеле.
    this.mesh(ctx,[[d+.3,-w+1,top-4],[d+2,0,top-9],[d+.3,w-1,top-4],[d+1,w-2,waist+5],
      [d+2,0,waist+2],[d+1,-w+2,waist+5]],
      back?'#46536b':'#8495a9','#29384b',1.05);
    if(!back){
      this.rib(ctx,[[d+3,0,top-8],[d+3,0,waist+4]],'rgba(206,228,246,.85)',1.1);
      this.rib(ctx,[[d+2,-w+3,top-4],[d+3,0,top-9],[d+2,w-3,top-4]],PALETTE.light,.7);
    }
    const bands=[waist+4,waist+10];
    for(const z of bands){
      this.rib(ctx,[[d+1,-w+1,z],[d+3,0,z+1],[d+1,w-1,z]],'#29384a',1.3);
    }
    // Наплечники поверх корпуса, с топ-плоскостью и торцевым скосом.
    for(const side of [-1,1]){
      const v=side*(w+3);
      this.mesh(ctx,[[-5,v-side*3,top-3],[6,v-side*3,top-4],[7,v+side*3,top-7],
        [0,v+side*5,top-12],[-6,v+side*3,top-9]],
        side>0?'#5d6f88':'#73859c',PALETTE.edge,1.2);
      this.mesh(ctx,[[-5,v-side*3,top-3],[1,v,top+1],[7,v+side*3,top-7]],
        PALETTE.top,null);
      this.crystal(ctx,-3,v,top-2,-4,side*1.4,boss?13:8,boss?3.4:2.2);
    }
    // Пояс и металлическая фибула.
    this.mesh(ctx,[[d+.7,-w,waist+4],[d+1,w,waist+4],[d+1,w,waist+1],[d+.7,-w,waist+1]],
      PALETTE.leather,'#b1a08a',.9);
    this.crystal(ctx,d+2,0,waist+4,1,0,4,1.5);
  }
  head(ctx,boss,st,back){
    const neck=boss?42:31,helmet=boss?15:11;
    const d=boss?7.4:5.5,w=boss?8.6:6.3,tip=neck+helmet;
    this.mesh(ctx,[[-d,-w,neck],[-d,w,neck],[d,w,neck],[d,-w,neck]],
      '#0c1323',null);
    this.mesh(ctx,[[-d,-w,neck+3],[-d,-w,tip-4],[-2,-w-1,tip],[d,-w,tip-3],
      [d,-w,neck+4]],'#6b7a91',PALETTE.edge,1);
    this.mesh(ctx,[[-d,w,neck+3],[-d,w,tip-3],[d,w,tip-3],[d,w,neck+4]],
      '#364158',PALETTE.edge,1.1);
    this.mesh(ctx,[[-d,-w,tip-4],[d,-w,tip-3],[d,w,tip-3],[-d,w,tip-3]],
      '#98aec1',PALETTE.edge,1);
    this.mesh(ctx,[[d,-w,neck+5],[d,w,neck+5],[d,w,tip-3],[d,-w,tip-3]],
      back?'#243144':'#313e55',PALETTE.edge,1.4);
    // Лицевая щель, два ледяных глазных отверстия. При повороте затылком
    // вместо них видны затылочные пластины, совсем как у героя.
    if(!back){
      this.mesh(ctx,[[d+.5,-w+1,neck+9],[d+.5,w-1,neck+9],[d+.5,w-1,neck+13],[d+.5,-w+1,neck+13]],'#080f20',null);
      const eye=st.hit>.45?'#fff':'#b2ecff';
      this.rib(ctx,[[d+1,-w+2,neck+11],[d+1,-1.2,neck+11.8]],eye,1.9);
      this.rib(ctx,[[d+1,1.2,neck+11.8],[d+1,w-2,neck+11]],eye,1.9);
    }else{
      this.rib(ctx,[[d+1,-w+2,neck+7],[d+1,w-2,neck+7]],'#71849a',1.4);
      this.rib(ctx,[[d+1,-w+2,neck+13],[d+1,w-2,neck+13]],'#384b61',1.2);
    }
    // Шипы льда и рогатый венец исходного Тартаса.
    for(const v of [-w*.77,0,w*.77]){
      const lift=boss?(v===0?21:15):v===0?10:6;
      this.crystal(ctx,-1,v,tip-1,-2,v*.08,lift,boss?3.7:2);
    }
    for(const side of [-1,1])
      this.crystal(ctx,1,side*w,tip-4,2,side*3,boss?9:5,1.7);
  }
  shield(ctx,st,boss){
    // Щит с центральным стальным ребром и ледяным ободом.
    const side=-1, v=-12,u=9;
    const z=19+Math.sin(st.walk)*st.weight*.6;
    const shieldWidth=boss?11:8,shieldHeight=boss?22:14;
    const base=[
      [u-3,v-shieldWidth,z+shieldHeight*.75],
      [u+4,v-shieldWidth,z+shieldHeight],
      [u+6,v+shieldWidth,z+shieldHeight*.8],
      [u+6,v+shieldWidth+2,z-shieldHeight*.7],
      [u+2,v,z-shieldHeight],
      [u-4,v-shieldWidth-2,z-shieldHeight*.6],
    ];
    this.mesh(ctx,base,'#364659','#152030',1.6);
    this.mesh(ctx,[[u+3,v-shieldWidth,z+shieldHeight*.75],[u+6,v,z+shieldHeight*.82],
      [u+5,v,z-shieldHeight*.65],[u+2,v,z-shieldHeight]],
      '#76899c','#a7bccc',1.2);
    this.rib(ctx,[[u+6,v,z+shieldHeight*.82],[u+5,v,z-shieldHeight*.65]],'#d4eafa',1.2);
    for(let i=0;i<3;i++)
      this.crystal(ctx,u+2,v-shieldWidth+i*shieldWidth*.85,z+shieldHeight*.7,2,-1,4,1.3);
  }
  weapon(ctx,kind,boss,st,bState,aim){
    const swing=st.walk*1.13;
    const attack=st.attack;
    const casting=boss&&['squadCast','bladeIn','bladeWave','bladeGap','blastTele'].includes(bState);
    const dashing=boss&&(bState==='tele'||bState==='dash');
    const wind=ease(0,1,Math.min(1,attack));
    const u=7+Math.sin(swing)*st.weight*2;
    const side=1;
    let v=side*(boss?15:12),z=boss?26:21;
    // Доспехи рук в оригинальной холодной палитре.
    this.mesh(ctx,[[u-5,v-2,z+9],[u+2,v-2,z+10],[u+3,v+3,z],[u-2,v+3,z-2]],
      '#53657d','#19273c',1.2);
    this.mesh(ctx,[[u+1,v-3,z+10],[u+4,v-1,z+3],[u+4,v+3,z+1],[u-1,v+2,z+9]],
      '#8b9aaf',null);
    if(kind==='archer'){
      const pull=clamp(aim||0,0,1);
      const a=this.project(u+8,v,z+5);
      const b=this.project(u+17,v,z+22);
      const d=this.project(u+17,v,z-12);
      const h=this.project(u+10-pull*6,v,z+5);
      // Изогнутая ледяная дуга, с натягиваемой тетивой.
      const p=this.project(u+23,v,z+5);
      const top=this.project(u+17,v,z+22);
      const bot=this.project(u+17,v,z-12);
      ctx.beginPath();ctx.moveTo(...top);ctx.quadraticCurveTo(...p,...bot);
      ctx.strokeStyle='#8dc6f0';ctx.lineWidth=3.4;ctx.stroke();
      ctx.strokeStyle='#d9f0ff';ctx.lineWidth=.9;
      line(ctx,top,h,'#d0deed',.8);line(ctx,h,bot,'#d0deed',.8);
      if(pull>.15){
        const tip=this.project(u+25,v,z+5);
        line(ctx,h,tip,'#ffcf87',1.9);
        gem(ctx,[this.project(u+20,v,z+4),tip,this.project(u+20,v,z+6)],'#ff9e3b');
        ctx.fillStyle='#ffe2a0';ctx.beginPath();ctx.arc(tip[0],tip[1],2.6,0,TAU);ctx.fill();
      }
      // Колчан и торчащие из него обледеневшие стрелы.
      for(let i=-1;i<=1;i++){
        this.rib(ctx,[[-7,-6+i*3,28],[-13,-6+i*3,44+i*2]],'#a7b9cc',1.35);
        this.rib(ctx,[[-13,-6+i*3,42+i*2],[-15,-6+i*3,47+i*2]],'#ffa64d',1.7);
      }
    }else if(kind==='ram'){
      // Таран сохраняет прежний острый клиновидный нос; теперь он выступает
      // в пространстве, а не лежит на плоском круге.
      const a=attack*.6;
      this.mesh(ctx,[[u+1,v-6,z+5],[u+10,v-4,z+6],[u+27+6*a,v,z+3],
        [u+10,v+4,z-1]],'#658fb7','#15283d',1.6);
      gem(ctx,[this.project(u+8,v,z+7),this.project(u+27+6*a,v,z+3),
        this.project(u+11,v+4,z+3)],'#bce9ff');
    }else{
      let handZ=z+2;
      const raise=casting?22:attack*13;
      handZ+=raise;
      const lean=dashing?22:0;
      const blade=boss?40:22, tipZ=handZ+((casting?19:attack>.5?14:-12));
      const grip=this.project(u+7,v,handZ);
      const guardL=this.project(u+10,v-5,handZ+1);
      const guardR=this.project(u+10,v+5,handZ+1);
      const heel=this.project(u+2,v,handZ-2);
      const tip=this.project(u+14+blade+lean,v+Math.sin(swing)*st.weight*2,tipZ);
      const point=this.project(u+14+blade*.68+lean,v,tipZ+3);
      const bottom=this.project(u+15,v,handZ-2);
      const top=this.project(u+15,v,handZ+4);
      line(ctx,heel,grip,'#322f3c',3);
      line(ctx,guardL,guardR,'#b7a5a0',2.5);
      gem(ctx,[bottom,tip,top],PALETTE.ice);
      poly(ctx,[top,point,tip],'#e5faff',null);
      line(ctx,grip,tip,'rgba(220,249,255,.7)',1);
      if(boss){
        for(const k of [.36,.66]){
          const baseU=u+15+blade*k;
          this.crystal(ctx,baseU,v,handZ-2,0,3,7,1.7);
        }
      }
    }
  }
  draw(ctx,e,x,y,kind,hit=false,options={}){
    if(!kind)return false;
    const st=options.st||this.state(e,x,y);
    const boss=kind==='tartas',bs=options.bState||
      (boss&&this.renderer.boss?.enemy===e?this.renderer.boss.state:'idle');
    if(!options.death)this.advance(e,st,x,y,boss,kind);
    const dx=options.death||0;
    const frozen=e.freezeT>0;
    const motion=st.weight;
    const phase=st.walk;
    const breathing=Math.sin(this.renderer.clock*2.15+st.seed);
    const kick=Math.sin(phase),back= Math.sin(st.dir)<-.1;
    const sc=e.radius/(boss?17:kind==='ram'?13.5:11.5);
    this.angle=st.dir; // используется только пока синхронно рисуется один персонаж
    // Сохраняем характерные для исходного Тартаса визуальные акценты:
    // морозное свечение, разгон рывка и рунический венец призыва.
    if(boss&&this.renderer.getGlow){
      const t=this.renderer.clock,b=this.renderer.boss,gl=this.renderer.getGlow('blue');
      ctx.save();
      ctx.globalCompositeOperation='lighter';
      ctx.globalAlpha=.13+.08*Math.sin(t*2.7+st.seed);
      ctx.drawImage(gl,x-e.radius*2.15,y-e.radius*2.45,e.radius*4.3,e.radius*4.5);
      const casting=['bladeIn','bladeWave','bladeGap','squadCast','blastTele'].includes(bs);
      if(casting){
        ctx.strokeStyle='#9dd8f5';ctx.lineWidth=1.5;
        ctx.globalAlpha=.4+.12*Math.sin(t*6);
        ctx.beginPath();ctx.arc(x,y,e.radius*1.85,0,TAU);ctx.stroke();
        for(let i=0;i<9;i++){
          const a=i*TAU/9+t*.42,d=e.radius*1.8;
          const q=[x+Math.cos(a)*d,y+Math.sin(a)*d];
          const p=[x+Math.cos(a+.08)*(d+5),y+Math.sin(a+.08)*(d+5)];
          line(ctx,q,p,'#d8f1ff',1.5);
        }
      }
      if(bs==='dash'){
        const dir=st.dir,length=e.radius*2.5;
        ctx.strokeStyle='#8fd8ff';
        ctx.globalAlpha=.27;
        ctx.lineWidth=e.radius*.8;ctx.lineCap='round';
        line(ctx,[x-Math.cos(dir)*length,y-Math.sin(dir)*length],
          [x,y],'#8fd8ff',e.radius*.8);
      }
      ctx.restore();
    }
    ctx.save();ctx.translate(x,y);
    // Силуэт вырастает из точки на полу, а не вращается плоской медалькой.
    const fall=clamp(dx,0,1),deathAlpha=1-fall*.98;
    if(fall>0){
      ctx.globalAlpha=(1-fall*.98);
      ctx.translate(0,fall*8);
      ctx.scale(1+fall*.18,1-fall*.64);
      ctx.rotate(fall*.12);
    }
    ctx.scale(sc,sc);
    const bob=frozen?0:motion*Math.abs(kick)*1.25+breathing*.38;
    ctx.translate(0,-bob);
    // Тень на полу смещена за счёт вертикального объёма модели.
    ctx.fillStyle='rgba(3,7,16,.39)';
    ctx.beginPath();ctx.ellipse(3,1,boss?19:13,boss?9:6,0,0,TAU);ctx.fill();
    this.cape(ctx,st,boss,back);
    for(const side of [-1,1]){
      const step=motion*Math.sin(phase+side*Math.PI)*4.7;
      this.boot(ctx,side>0?6+step:-2-step,side*(boss?8:6),
        frozen?0:step,boss);
      // Верхняя стальная поножа выше сапога.
      const hipU=side>0?2:0;
      this.mesh(ctx,[[hipU-5,side*4,18],[hipU+3,side*4,18],
        [hipU+5+step,side*5,7],[hipU-4+step,side*5,7]],
        side===1?'#586985':'#344258',PALETTE.edge,1.1);
      this.rib(ctx,[[hipU+1,side*4,16],[hipU+3+step,side*5,9]],
        'rgba(177,209,235,.52)',.8);
    }
    this.torso(ctx,boss,st,back);
    this.head(ctx,boss,st,back);
    if(kind==='soldier'||boss)this.shield(ctx,st,boss);
    const aim= e.aim>0?1-e.aim/Math.max(.01,e.aimTotal):0;
    this.weapon(ctx,kind,boss,st,bs,aim);
    // Заморозка не перекрашивает силуэт целиком: появляются дополнительные
    // грани инея, а ходьба застывает вместе с логикой моба.
    if(frozen){
      ctx.globalAlpha=deathAlpha*.56;
      for(let i=0;i<4;i++)this.crystal(ctx,-3,i*4-6,20+i*5,2,2,7,1.7);
      ctx.globalAlpha=deathAlpha;
    }
    if(hit||st.hit>.14){
      ctx.globalAlpha=deathAlpha*clamp(hit?.37:st.hit*.33,0,.44);
      this.mesh(ctx,[[10,-8,18],[10,8,18],[10,8,33],[10,-8,33]],
        '#ffffff',null);
      ctx.globalAlpha=deathAlpha;
    }
    ctx.restore();
    return true;
  }
  onDeath(e){
    if(!this.enabled)return;
    const kind=this.kind(e);
    if(!kind)return;
    const st=this.states.get(e);
    const state=st&&st.gen===e.gen?{...st}:{gen:e.gen,dir:Math.atan2(this.renderer.hero.y-e.y,this.renderer.hero.x-e.x),walk:0,weight:0,hit:0,attack:0,seed:0};
    this.corpses.push({x:e.x,y:e.y,radius:e.radius,kind,freezeT:e.freezeT,
      aim:0,aimTotal:1,atk:{state:'idle'},gen:e.gen,
      state,age:0,life:kind==='tartas'?1.6:.95});
    if(this.corpses.length>this.maxCorpses)this.corpses.shift();
  }
  drawDeaths(ctx,dt,viewL,viewR,viewT,viewB){
    if(!this.enabled){this.corpses.length=0;return;}
    const delta=clamp(dt||0,0,.05);
    for(let i=this.corpses.length-1;i>=0;i--){
      const c=this.corpses[i];c.age+=delta;
      if(c.age>=c.life){this.corpses.splice(i,1);continue;}
      if(c.x+c.radius*3<viewL||c.x-c.radius*3>viewR||
        c.y+c.radius*3<viewT||c.y-c.radius*5>viewB)continue;
      this.draw(ctx,c,c.x,c.y,c.kind,false,
        {death:c.age/c.life,st:c.state,bState:'recover'});
    }
  }
  reset(){
    this.corpses.length=0;
    this.states=new WeakMap();
  }
}
