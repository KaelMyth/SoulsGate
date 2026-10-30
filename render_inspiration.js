// Воодушевление: объёмное золотое поле и световые потоки втягиваемого опыта.
// Графика не меняет положение камней, здоровье или состояние способности.
const TAU=Math.PI*2;
const clamp=v=>Math.max(0,Math.min(1,v));

export class InspirationFx {
  constructor(renderer){this.r=renderer;}

  drawBack(ctx,hx,hy){
    const spell=this.r.inspiration;
    if(!spell?.active)return;
    const S=this.r.cfg.skills.inspiration,R=S.radius,t=this.r.clock;
    const age=clamp(spell.elapsed/.32);
    const fade=Math.max(0,Math.min(1,spell.remaining/.5+.3));
    ctx.save();
    ctx.translate(hx,hy);
    ctx.globalCompositeOperation='lighter';
    const glow=ctx.createRadialGradient(0,0,R*.04,0,0,R*1.42);
    glow.addColorStop(0,'rgba(255,242,174,0.16)');
    glow.addColorStop(.3,'rgba(247,193,80,0.14)');
    glow.addColorStop(.72,'rgba(213,132,38,0.14)');
    glow.addColorStop(1,'rgba(207,129,33,0)');
    ctx.fillStyle=glow;ctx.globalAlpha=age*fade;
    ctx.beginPath();ctx.arc(0,0,R*1.42,0,TAU);ctx.fill();
    // Дымчатые золотые струи свободно скользят вдоль объёма сферы.
    ctx.lineCap='round';
    for(let i=0;i<12;i++){
      const a=i*2.4+t*(i%2?.36:-.32);
      const radius=R*(.5+.36*(i%4)/3);
      const x=Math.cos(a)*radius,y=Math.sin(a)*radius*.68;
      const a2=a+.85+Math.sin(t*.8+i)*.24;
      const x2=Math.cos(a2)*R*1.09,y2=Math.sin(a2)*R*.77;
      ctx.beginPath();
      ctx.moveTo(x,y);
      ctx.bezierCurveTo(x*1.35,y*.7,x2*.9,y2*1.3,x2,y2);
      ctx.lineWidth=i%3?7:12;
      ctx.strokeStyle=i%2?'#bf812e':'#ffe4a0';
      ctx.globalAlpha=age*fade*(i%3?.1:.16);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawFront(ctx,hx,hy){
    const spell=this.r.inspiration;
    if(!spell?.active)return;
    const S=this.r.cfg.skills.inspiration,R=S.radius,t=this.r.clock;
    const opening=clamp(spell.elapsed/.36);
    const fading=spell.remaining>0?1:.75;
    const pulse=spell.pulse||0;
    ctx.save();ctx.translate(hx,hy);
    ctx.globalCompositeOperation='lighter';
    // Полупрозрачная стеклянная оболочка с градиентом: не сплошной плоский круг.
    const shell=ctx.createRadialGradient(-R*.22,-R*.32,R*.06,0,0,R*1.05);
    shell.addColorStop(0,'rgba(255,251,225,0.035)');
    shell.addColorStop(.63,'rgba(247,214,122,0.07)');
    shell.addColorStop(.85,'rgba(255,217,111,0.16)');
    shell.addColorStop(1,'rgba(255,245,198,0)');
    ctx.globalAlpha=opening*fading;
    ctx.fillStyle=shell;ctx.beginPath();ctx.arc(0,0,R*1.06,0,TAU);ctx.fill();

    // Неидеальная корона и трёхмерные полупрозрачные меридианы, движущиеся в разном темпе.
    ctx.lineCap='round';
    for(let pass=0;pass<2;pass++){
      for(let i=0;i<4;i++){
        const a=t*(i%2?.35:-.3)+i*TAU/4;
        const r=R*(.95+.04*Math.sin(t*1.7+i*1.8));
        ctx.beginPath();
        ctx.ellipse(0,0,r,r*(.42+.12*Math.sin(t*.7+i)),a,
          .16+Math.sin(t*.7+i)*.35,Math.PI*1.65);
        ctx.strokeStyle=pass?'#fff1ba':'#b67e34';
        ctx.lineWidth=pass?1.2:5.5;
        ctx.globalAlpha=opening*fading*(pass?.28:.16);
        ctx.stroke();
      }
    }
    // Обрывки сияющей оболочки, которые расплываются по краю, а не образуют ровный обод.
    for(let i=0;i<17;i++){
      const a=i*TAU/17+t*(i%2?.1:-.12);
      const radius=R*(.98+.045*Math.sin(t*3.3+i*2.05));
      const rr=R*(1.04+.095*Math.sin(t*2.3+i));
      ctx.strokeStyle=i%3?'#f8d17a':'#fff6cd';
      ctx.lineWidth=1.2+(i%4)*.7;
      ctx.globalAlpha=opening*fading*(.29+.14*Math.sin(t*2+i));
      ctx.beginPath();ctx.moveTo(Math.cos(a-.11)*radius,Math.sin(a-.11)*radius);
      ctx.quadraticCurveTo(Math.cos(a)*rr,Math.sin(a)*rr,
        Math.cos(a+.12)*radius,Math.sin(a+.12)*radius);
      ctx.stroke();
    }

    // Дрейфующие золотые угольки на поверхности дают ощущение живой энергии.
    const glow=this.r.getGlow('gold');
    for(let i=0;i<16;i++){
      const a=i*2.399+t*(i%3===0?-.39:.3);
      const radius=R*(.65+.35*(.5+.5*Math.sin(t*.72+i*2.2)));
      const x=Math.cos(a)*radius,y=Math.sin(a)*radius*.79;
      const sz=4.5+(i%3)*2.1;
      ctx.globalAlpha=opening*fading*(.26+.21*Math.sin(t*2.9+i));
      ctx.drawImage(glow,x-sz,y-sz,sz*2,sz*2);
    }
    // Сильная короткая пульсация, когда очередной кристалл попадает в сферу.
    if(pulse>0){
      const radius=R*(.68+.33*(1-pulse));
      ctx.strokeStyle=S.coreColor;ctx.lineWidth=3.7*pulse+1;
      ctx.globalAlpha=.63*pulse;
      ctx.beginPath();ctx.arc(0,0,radius,0,TAU);ctx.stroke();
      ctx.globalAlpha=.27*pulse;
      ctx.drawImage(glow,-R*1.5,-R*1.5,R*3,R*3);
    }
    ctx.restore();
  }

  drawGem(ctx,g,x,y){
    if(!g.inspired)return;
    const glow=this.r.getGlow('gold');
    const p=g.inspireT||0;
    const size=g.radius*(2.2+1.5*Math.sin(Math.PI*p));
    ctx.save();
    ctx.globalCompositeOperation='lighter';
    ctx.globalAlpha=.45+.25*Math.sin(p*Math.PI);
    ctx.drawImage(glow,x-size,y-size,size*2,size*2);
    const dx=x-g.prevX,dy=y-g.prevY;
    const len=Math.hypot(dx,dy);
    if(len>1){
      const nx=dx/len,ny=dy/len;
      const tail=Math.min(45,Math.max(7,len*2.2));
      ctx.lineCap='round';
      ctx.strokeStyle='#ffdd82';ctx.lineWidth=Math.max(1,g.radius*.4);
      ctx.globalAlpha=.26+.39*Math.sin(Math.PI*p);
      ctx.beginPath();ctx.moveTo(x,y);
      ctx.quadraticCurveTo(x-nx*tail*.5-ny*5,y-ny*tail*.5+nx*5,
        x-nx*tail,y-ny*tail);
      ctx.stroke();
    }
    ctx.restore();
  }
  /** Модульные эффекты: снаряды, шлейфы душ, глобальная аура, гравитация и вращающийся лазер. */
  drawSynergies(ctx,hx,hy) {
    const s=this.r.inspiration;
    if(!s)return;
    const t=this.r.clock,glow=this.r.getGlow('gold');
    ctx.save();
    ctx.globalCompositeOperation='lighter';

    if(s.active && s.mods.aura && s.remaining>0 && s.arena) {
      const a=s.arena;
      const radius=Math.hypot(a.right-a.left,a.bottom-a.top);
      const sh=ctx.createRadialGradient(hx,hy,radius*.1,hx,hy,radius*.75);
      sh.addColorStop(0,'rgba(255,174,110,0.012)');
      sh.addColorStop(.64,'rgba(207,90,132,0.034)');
      sh.addColorStop(1,'rgba(255,196,129,0)');
      ctx.fillStyle=sh;ctx.globalAlpha=.8;
      ctx.beginPath();ctx.arc(hx,hy,radius*.75,0,TAU);ctx.fill();
      // У каждого противника своя неровная пульсация, а не геометрическая сетка по карте.
      let count=0;
      for(const e of s.enemies?.items || []) {
        if(!e.active || ++count>100)continue;
        const r=e.radius+7+Math.sin(t*6+e.x*.05)*5;
        ctx.globalAlpha=.14+.07*Math.sin(t*5+e.y*.03);
        ctx.strokeStyle='#ffa3a1';ctx.lineWidth=3.5;
        ctx.beginPath();ctx.ellipse(e.x,e.y,r,r*.72,t*.35+e.x*.001,0,TAU);ctx.stroke();
      }
    }

    for(const v of s.soulStreams) {
      const p=clamp(v.time),r=24+(1-p)*28;
      ctx.globalAlpha=p*.6;
      ctx.drawImage(glow,v.x-r,v.y-r,r*2,r*2);
      for(let k=0;k<3;k++) {
        const a=t*2+k*TAU/3+v.seed;
        const x=v.x+Math.cos(a)*r*.6,y=v.y+Math.sin(a)*r*.43;
        ctx.lineWidth=2+p*3;
        ctx.strokeStyle=k===1?'#d5a1f4':'#ffe7ad';
        ctx.globalAlpha=p*(.16+.12*k);
        ctx.beginPath();ctx.moveTo(v.x,v.y);
        ctx.quadraticCurveTo(x+Math.sin(a)*12,y-14,x,y);
        ctx.stroke();
      }
    }

    for(const v of s.impulses) {
      const p=clamp(v.time/.62),r=v.r+10+(1-p)*88;
      const g=ctx.createRadialGradient(v.x,v.y,r*.35,v.x,v.y,r*1.15);
      g.addColorStop(0,'rgba(117,63,195,0)');
      g.addColorStop(.76,'rgba(172,106,238,0.18)');
      g.addColorStop(1,'rgba(221,178,255,0)');
      ctx.fillStyle=g;ctx.globalAlpha=p*.85;
      ctx.beginPath();ctx.arc(v.x,v.y,r*1.15,0,TAU);ctx.fill();
      ctx.strokeStyle='#d4a1ff';ctx.globalAlpha=p*.42;ctx.lineWidth=4*p+1.5;
      ctx.beginPath();ctx.ellipse(v.x,v.y,r,r*.58,t*.4,0,TAU);ctx.stroke();
    }

    for(const b of s.bolts) {
      const fading=b.target?1:clamp(b.fade/.4);
      const dx=b.x-b.px,dy=b.y-b.py,a=Math.atan2(dy,dx);
      const size=b.blade?11:7;
      const kind=b.mask&7;
      const c=kind&1?'#ffb96b':kind&2?'#a4ebff':kind&4?'#ffe9a2':'#ffe5a0';
      ctx.save();ctx.translate(b.x,b.y);
      ctx.rotate(a);
      ctx.globalAlpha=fading;
      // Светящийся шлейф каждого ответного снаряда.
      const tail=ctx.createLinearGradient(-27,0,12,0);
      tail.addColorStop(0,'rgba(247,190,104,0)');
      tail.addColorStop(.65,c);tail.addColorStop(1,'#fffce6');
      ctx.fillStyle=tail;
      ctx.beginPath();ctx.moveTo(-28,0);ctx.quadraticCurveTo(-12,-size*.75,6,-size*.38);
      ctx.quadraticCurveTo(15,0,6,size*.38);ctx.quadraticCurveTo(-12,size*.75,-28,0);ctx.fill();
      ctx.drawImage(glow,-size*2.2,-size*2.2,size*4.4,size*4.4);
      if(b.blade) {
        // Гранёный магический клинок с изломом и эфесом вместо круглой пули.
        ctx.fillStyle='#fff7e0';ctx.globalAlpha=fading*.92;
        ctx.beginPath();ctx.moveTo(18,0);ctx.lineTo(-5,-3.8);ctx.lineTo(-10,0);
        ctx.lineTo(-5,3.8);ctx.closePath();ctx.fill();
        ctx.fillStyle=c;ctx.beginPath();
        ctx.moveTo(15,-.5);ctx.lineTo(-5,-3.8);ctx.lineTo(-6,0);ctx.closePath();ctx.fill();
        ctx.strokeStyle='#f0ce8d';ctx.lineWidth=2.2;
        ctx.beginPath();ctx.moveTo(-10,-7);ctx.lineTo(-10,7);ctx.stroke();
      } else {
        const core=ctx.createRadialGradient(-1,-2,1,0,0,10);
        core.addColorStop(0,'rgba(255,255,255,.96)');
        core.addColorStop(.4,c);core.addColorStop(1,'rgba(255,200,108,0)');
        ctx.fillStyle=core;ctx.beginPath();ctx.arc(0,0,10,0,TAU);ctx.fill();
        if(kind&4) {
          ctx.strokeStyle='#f8e8ff';ctx.lineWidth=1.7;
          for(let k=0;k<3;k++){
            const x=Math.sin(t*17+k*2+b.seed)*13;
            ctx.beginPath();ctx.moveTo(-10,k*4-4);ctx.lineTo(x,k*3-3);ctx.lineTo(14,k*4-5);ctx.stroke();
          }
        }
        if(kind&2) {
          ctx.strokeStyle='#d4faff';ctx.lineWidth=1.4;
          ctx.beginPath();ctx.moveTo(1,-12);ctx.lineTo(5,-5);ctx.lineTo(13,-3);ctx.stroke();
        }
      }
      ctx.restore();
    }

    if(s.laserPhase>0 && s.laserCount>0) {
      const life=clamp(s.laserPhase/Math.min(.35,s.cfg.laserDuration));
      const n=s.laserCount,len=s.config.laser.length;
      // Несколько мягких слоёв с живым изгибом, не жёсткие прямые палки.
      for(let i=0;i<n;i++) {
        const a=s.laserAngle+TAU*i/n,dx=Math.cos(a),dy=Math.sin(a);
        const ox=-dy,oy=dx;
        for(let pass=0;pass<3;pass++) {
          const thick=[17,8,2.4][pass];
          ctx.lineWidth=thick;ctx.lineCap='round';ctx.lineJoin='round';
          ctx.strokeStyle=['#b782ed','#ffc777','#fff9dd'][pass];
          ctx.globalAlpha=life*[.12,.32,.82][pass];
          ctx.beginPath();ctx.moveTo(hx,hy);
          for(let k=1;k<=12;k++) {
            const z=k/12,warp=Math.sin(z*15-t*9+i*.8)*7*z+
              Math.sin(z*23+t*5+i*1.7)*3.5*z;
            ctx.lineTo(hx+dx*len*z+ox*warp,hy+dy*len*z+oy*warp);
          }
          ctx.stroke();
        }
      }
      ctx.globalAlpha=life*.43;
      ctx.drawImage(glow,hx-37,hy-37,74,74);
    }
    ctx.restore();
  }

}
