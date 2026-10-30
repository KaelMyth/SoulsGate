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
}
