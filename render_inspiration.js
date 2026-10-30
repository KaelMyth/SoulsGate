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
  /** Ответные светляки / кинжалы, ритуал вытягивания опыта и вращающаяся корона лазеров. */
  drawInteractions(ctx,hx,hy){
    const spell=this.r.inspiration;
    if(!spell?.active)return;
    const t=this.r.clock,S=this.r.cfg.skills.inspiration;
    const gold=this.r.getGlow('gold'),puff=this.r.getGlow(true);
    ctx.save();
    ctx.globalCompositeOperation='lighter';
    ctx.lineCap='round';

    // Гравитация: от сферы по всей карте летит волна давления с неравномерными рукавами.
    if(spell.gravityWave>0){
      const u=1-spell.gravityWave/Math.max(.01,S.gravityVisualTime);
      const r=28+u*Math.max(this.r.w||800,this.r.h||700)*1.8;
      for(let pass=0;pass<3;pass++){
        ctx.beginPath();
        const waves=72;
        for(let i=0;i<=waves;i++){
          const a=i*TAU/waves;
          const rr=r*(1+.04*Math.sin(a*11+t*9)+.025*Math.sin(a*19-t*5));
          if(!i)ctx.moveTo(hx+rr,hy);else ctx.lineTo(hx+Math.cos(a)*rr,hy+Math.sin(a)*rr);
        }
        ctx.strokeStyle=pass===0?'#a774e6':pass===1?'#ffdc87':'#fff5d0';
        ctx.lineWidth=pass===0?15:pass===1?5:1.1;
        ctx.globalAlpha=(1-u)*(pass===0?.12:pass===1?.32:.8);
        ctx.stroke();
      }
    }

    // Поглощение: золотая душа вырывается из живого врага и разрывает дымную оболочку.
    for(const f of spell.extractions){
      const u=clamp(f.age/f.life),fade=1-u;
      const sz=17+u*30;
      ctx.globalAlpha=fade*.6;
      ctx.drawImage(puff,f.x-sz,f.y-sz,sz*2,sz*2);
      for(let j=0;j<7;j++){
        const a=j*2.399+t*.9;
        const x=f.x+Math.cos(a)*sz*(.3+.6*u),y=f.y+Math.sin(a)*sz*(.3+.6*u);
        const sm=4+4*fade;
        ctx.globalAlpha=fade*.39;
        ctx.drawImage(gold,x-sm,y-sm,sm*2,sm*2);
      }
      ctx.strokeStyle='#ffebb1';ctx.lineWidth=2.8;
      ctx.globalAlpha=fade*.38;
      ctx.beginPath();ctx.arc(f.x,f.y,sz,0,TAU);ctx.stroke();
    }

    // Снаряды: энергия разлетается из оболочки и оставляет дымный шлейф.
    for(const p of spell.projectiles){
      const x=p.x,y=p.y;
      const angle=p.angle;
      ctx.globalAlpha=.75;
      const sz=p.blade?20:15;
      ctx.drawImage(gold,x-sz,y-sz,2*sz,2*sz);
      const dx=x-p.px,dy=y-p.py,d=Math.hypot(dx,dy)||1;
      const nx=dx/d,ny=dy/d;
      ctx.strokeStyle=p.blade?'#f2d6ff':'#ffe3a1';
      ctx.lineWidth=p.blade?4.5:3;
      ctx.globalAlpha=.5;
      ctx.beginPath();
      ctx.moveTo(x,y);
      ctx.quadraticCurveTo(x-nx*13+ny*5,y-ny*13-nx*5,x-nx*35,y-ny*35);
      ctx.stroke();
      if(p.blade){
        ctx.save();ctx.translate(x,y);ctx.rotate(angle);
        ctx.fillStyle='#b58ce1';ctx.globalAlpha=.8;
        ctx.beginPath();ctx.moveTo(15,0);ctx.quadraticCurveTo(-3,-4,-11,-5);
        ctx.lineTo(-6,0);ctx.lineTo(-11,5);ctx.quadraticCurveTo(-3,4,15,0);ctx.fill();
        ctx.fillStyle='#fff3d6';ctx.globalAlpha=.9;
        ctx.beginPath();ctx.moveTo(15,0);ctx.quadraticCurveTo(-1,-2,-8,-1);
        ctx.lineTo(-3,0);ctx.lineTo(-8,1);ctx.quadraticCurveTo(-1,2,15,0);ctx.fill();
        ctx.restore();
      }else{
        ctx.fillStyle='#fff7d0';ctx.globalAlpha=.8;
        ctx.beginPath();ctx.arc(x,y,3.2+1.1*Math.sin(t*13+p.age*6),0,TAU);ctx.fill();
      }
    }

    // Когда поблизости нет цели, огонёк не исчезает мгновенно, а испаряется в сфере.
    for(const p of spell.dissolves){
      const fade=1-clamp(p.age/p.life);
      const sz=9+(1-fade)*15;
      ctx.globalAlpha=.45*fade;
      ctx.drawImage(puff,p.x-sz,p.y-sz,sz*2,sz*2);
      for(let j=0;j<3;j++){
        const a=j*TAU/3+t*1.2;
        const x=p.x+Math.cos(a)*sz*.45,y=p.y+Math.sin(a)*sz*.45;
        ctx.globalAlpha=.4*fade;
        ctx.drawImage(gold,x-4,y-4,8,8);
      }
    }

    // Лазер: после поглощения кристаллов лучи идут по всей окружности и вращаются.
    if(spell.laserCount && spell.laserAge<S.laserTime){
      const n=spell.laserCount;
      const range=Math.max(spell.arena?.width||900,spell.arena?.height||900)*1.5;
      const fade=Math.min(1,spell.laserAge/.2,(S.laserTime-spell.laserAge)/.33);
      const bright=Math.min(.85,8/Math.sqrt(n));
      ctx.lineCap='round';
      for(let i=0;i<n;i++){
        const a=spell.laserAngle+i*TAU/n;
        const x=Math.cos(a),y=Math.sin(a);
        const distortion=12*Math.sin(t*7+i*1.29);
        ctx.beginPath();ctx.moveTo(hx+x*26,hy+y*26);
        ctx.quadraticCurveTo(hx+x*range*.48-y*distortion,
          hy+y*range*.48+x*distortion,hx+x*range,hy+y*range);
        ctx.strokeStyle='#ae64d8';ctx.lineWidth=15;
        ctx.globalAlpha=bright*.15*fade;ctx.stroke();
        ctx.strokeStyle='#f7c66e';ctx.lineWidth=5;
        ctx.globalAlpha=bright*.42*fade;ctx.stroke();
        ctx.strokeStyle='#fff8d7';ctx.lineWidth=1.6;
        ctx.globalAlpha=bright*fade;ctx.stroke();
      }
      ctx.globalAlpha=fade*.65;
      ctx.drawImage(gold,hx-53,hy-53,106,106);
    }
    ctx.restore();
  }

}
